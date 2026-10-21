import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { MissionStartup } from "../../packages/cli/src/construction/mission-startup.js";
import {
  createMissionWorkspacePreparation,
  missionIntegrationTargetKey,
  missionWorkspaceKey,
} from "../../packages/cli/src/construction/mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";
import { createProjectSelectionRuntime } from "../../packages/cli/src/cli/project-selection-runtime.js";

interface RepositoryOptions {
  readonly marker?: boolean;
  readonly commit?: boolean;
  readonly branch?: string;
}

interface GitEnvironment {
  readonly parent: string;
  readonly globalConfig: string;
}

const temporaryRoots: string[] = [];
const environmentNames = [
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_COUNT",
  "GIT_OPTIONAL_LOCKS",
  "GIT_TERMINAL_PROMPT",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_CONFIG_PARAMETERS",
] as const;

const gitEnvironment = (globalConfig: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_COMMON_DIR;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_CONFIG_PARAMETERS;
  return environment;
};

const withGitEnvironment = async <T>(environment: GitEnvironment, operation: () => Promise<T>): Promise<T> => {
  const configured = gitEnvironment(environment.globalConfig);
  const previous = new Map(environmentNames.map((name) => [name, process.env[name]]));
  for (const name of environmentNames) {
    const value = configured[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await operation();
  } finally {
    for (const name of environmentNames) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

const git = (cwd: string, environment: GitEnvironment, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnvironment(environment.globalConfig) }).trim();

const createEnvironment = async (name: string): Promise<GitEnvironment> => {
  const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), `kepler-m06-${name}-`));
  temporaryRoots.push(parent);
  const globalConfig = Path.join(parent, "empty-global-config");
  await Fs.writeFile(globalConfig, "");
  return { parent, globalConfig };
};

const createRepository = async (
  environment: GitEnvironment,
  name: string,
  options: RepositoryOptions = {},
): Promise<string> => {
  const root = Path.join(environment.parent, name);
  await Fs.mkdir(root, { recursive: true });
  git(root, environment, "init", "-q", "-b", options.branch ?? "main");
  git(root, environment, "config", "user.name", "Kepler M06 Test");
  git(root, environment, "config", "user.email", "kepler-m06@example.invalid");
  if (options.marker ?? true) {
    await Fs.mkdir(Path.join(root, ".kepler"));
    await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  }
  await Fs.writeFile(Path.join(root, "README.md"), `# ${name}\n`);
  if (options.commit ?? true) {
    git(root, environment, "add", ".");
    git(root, environment, "commit", "-q", "-m", `Create ${name} fixture`);
  }
  return root;
};

const createStartup = (cwd: string, nextIdentity: () => string = randomUUID): MissionStartup => {
  const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => cwd }));
  const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd });
  return new MissionStartup({
    projects: { resolve: (project) => projects.resolve(project) },
    workspaces: createMissionWorkspacePreparation(workspaceRuntime),
    journals: {
      create: (recordHome, missionId, journalId) => createEventJournal({
        recordHome,
        missionId,
        phase: CONSTRUCTION_PHASE,
        journalId,
      }),
    },
    identities: { next: nextIdentity },
    now: () => "2026-10-21T14:00:00.000Z",
    producer: { name: "kepler-cli", version: "0.10.3" },
  });
};

const makeRequest = (
  repositoryId: string,
  workspacePath: string,
  options: {
    readonly workspace?: unknown;
    readonly branch?: unknown;
    readonly integrationTarget?: string;
    readonly recordHomeRepositoryId?: string;
  } = {},
) => ({
  title: "Prepare the requested capability",
  request: "Implement the reviewed requirement in the selected repository.",
  workflow: "standard",
  recordHomeRepositoryId: options.recordHomeRepositoryId ?? "record-home",
  contexts: [{ reference: "opaque:product-brief", purpose: "Requester scope" }],
  repositories: [{
    repositoryId,
    workspace: options.workspace ?? { kind: "existing", path: workspacePath },
    branch: options.branch ?? { kind: "current" },
    integrationTarget: options.integrationTarget ?? "main",
  }],
});

const readEvents = async (recordHome: string, missionId: string): Promise<Record<string, unknown>[]> => {
  const historyPath = Path.join(recordHome, ".kepler", "missions", missionId, "history", "construction");
  const files = await Fs.readdir(historyPath);
  const source = await Fs.readFile(Path.join(historyPath, files[0]!), "utf8");
  return source.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
};

const commonDirectory = async (repository: string, environment: GitEnvironment): Promise<string> =>
  await Fs.realpath(Path.resolve(repository, git(repository, environment, "rev-parse", "--git-common-dir")));

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("mission startup with real Git, worktrees, and journals", () => {
  it("records a mission before preparation and keeps startup distinct from stage execution", async () => {
    const environment = await createEnvironment("existing");
    const repository = await createRepository(environment, "record-and-code");
    const startingCommit = git(repository, environment, "rev-parse", "HEAD");

    const result = await withGitEnvironment(environment, () =>
      createStartup(repository).execute(undefined, makeRequest("application", repository)),
    );

    expect(result.kind).toBe("prepared");
    if (result.kind !== "prepared") return;
    expect(result.recordHome).toBe(await Fs.realpath(repository));
    expect(result.repositories).toMatchObject([{
      repositoryId: "application",
      context: { kind: "existing" },
      branch: "main",
      integrationTarget: "refs/heads/main",
      startingCheckpoint: { kind: "commit", commit: startingCommit },
    }]);
    const events = await readEvents(repository, result.missionId);
    expect(events.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect(events[0]).toMatchObject({
      data: {
        mission_id: result.missionId,
        title: "Prepare the requested capability",
        request: "Implement the reviewed requirement in the selected repository.",
        workflow: "standard",
        record_home: { repository_id: "record-home" },
        repositories: [{
          repository_id: "application",
          context: { kind: "existing" },
          branch: { kind: "current" },
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: startingCommit },
        }],
      },
    });
    expect(events[1]).toMatchObject({
      caused_by: [events[0]?.id],
      data: {
        mission_id: result.missionId,
        repositories: [{ branch: "main", starting_checkpoint: { kind: "commit", commit: startingCommit } }],
      },
    });
    expect(events.some((event) => typeof event.type === "string" && event.type.includes("stage-attempt"))).toBe(false);
    const common = await commonDirectory(repository, environment);
    const attachment = Path.join(common, "kepler", "missions", result.missionId, "workspaces", `${result.repositories[0]?.localWorkspaceKey}.json`);
    expect(JSON.parse(await Fs.readFile(attachment, "utf8"))).toMatchObject({
      mission_id: result.missionId,
      record_home_repository_id: "record-home",
      repository_id: "application",
      workspace_id: result.repositories[0]?.localWorkspaceKey,
      workspace_path: await Fs.realpath(repository),
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: startingCommit },
    });
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
  });

  it.each([
    { branchName: "feature/existing-record-home", branchSelection: { kind: "existing" as const, name: "feature/existing-record-home" } },
    { branchName: "feature/new-record-home", branchSelection: { kind: "new" as const, name: "feature/new-record-home", base: "main" } },
  ])("allows $branchName when only the selected record-home journal became untracked", async ({ branchName, branchSelection }) => {
    const environment = await createEnvironment("record-home-branch");
    const repository = await createRepository(environment, "record-and-code");
    if (branchSelection.kind === "existing") git(repository, environment, "branch", branchName);

    const result = await withGitEnvironment(environment, () =>
      createStartup(repository).execute(undefined, makeRequest("application", repository, { branch: branchSelection })),
    );

    expect(result).toMatchObject({ kind: "prepared", repositories: [{ branch: branchName }] });
    if (result.kind !== "prepared") return;
    expect(git(repository, environment, "branch", "--show-current")).toBe(branchName);
    expect(git(repository, environment, "status", "--porcelain=v1", "--untracked-files=all"))
      .toContain(`.kepler/missions/${result.missionId}/history/construction/`);
    expect((await readEvents(repository, result.missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it.each([
    {
      selectedBranch: "feature/ignored-journal",
      branchSelection: { kind: "existing" as const, name: "feature/ignored-journal" },
    },
    {
      selectedBranch: "feature/new-ignored-journal",
      branchSelection: { kind: "new" as const, name: "feature/new-ignored-journal", base: "feature/ignored-journal" },
    },
  ])("preserves an ignored mission journal if $selectedBranch would overwrite it", async ({ selectedBranch, branchSelection }) => {
    const environment = await createEnvironment("ignored-journal-branch");
    const repository = await createRepository(environment, "record-home");
    const missionId = "11111111-1111-4111-8111-111111111111";
    const journalId = "22222222-2222-4222-8222-222222222222";
    const createdEventId = "33333333-3333-4333-8333-333333333333";
    const identities = [missionId, journalId, createdEventId, "44444444-4444-4444-8444-444444444444"];
    const ignoredRecords = Path.join(".kepler", "missions");
    await Fs.writeFile(Path.join(repository, ".gitignore"), `${ignoredRecords}/\n`);
    git(repository, environment, "add", ".gitignore");
    git(repository, environment, "commit", "-q", "-m", "Ignore mission records");

    const conflictingBranch = "feature/ignored-journal";
    git(repository, environment, "branch", conflictingBranch);
    git(repository, environment, "switch", conflictingBranch);
    const journalPath = Path.join(repository, ignoredRecords, missionId, "history", "construction", `${journalId}.jsonl`);
    await Fs.mkdir(Path.dirname(journalPath), { recursive: true });
    await Fs.writeFile(journalPath, "tracked branch version\n");
    git(repository, environment, "add", "-f", "--", Path.relative(repository, journalPath));
    git(repository, environment, "commit", "-q", "-m", "Track conflicting record path");
    git(repository, environment, "switch", "main");

    let identityIndex = 0;
    const startup = createStartup(repository, () => {
      const identity = identities[identityIndex];
      if (identity === undefined) throw new Error("No test identities remain.");
      identityIndex += 1;
      return identity;
    });
    const result = await withGitEnvironment(environment, () => startup.execute(undefined, makeRequest("application", repository, {
      branch: branchSelection,
    })));

    expect(result).toMatchObject({
      kind: "failed",
      code: branchSelection.kind === "new" ? "branch_creation_failed" : "branch_switch_failed",
    });
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readFile(journalPath, "utf8")).not.toContain("tracked branch version");
    const events = await readEvents(repository, missionId);
    expect(events.map((event) => event.type)).toEqual(["construction.mission-created"]);
    expect(events[0]).toMatchObject({ id: createdEventId });
    expect(git(repository, environment, "branch", "--list", selectedBranch))
      .toBe(branchSelection.kind === "existing" ? selectedBranch : "");
  });

  it("ignores only the operation journal while preserving other work added during preparation", async () => {
    const environment = await createEnvironment("journal-dirty-boundary");
    const recordHome = await createRepository(environment, "record-home");
    const independent = await createRepository(environment, "independent-code", { marker: false });
    git(recordHome, environment, "branch", "feature/selected");
    const unexpectedWork = Path.join(recordHome, "unexpected-work.txt");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      coordination: {
        acquire: async (request) => {
          await Fs.writeFile(unexpectedWork, "preserve this concurrent work\n");
          return actualRuntime.coordination.acquire(request);
        },
      },
    });
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(runtime),
      journals: {
        create: (recordHomePath, missionId, journalId) => createEventJournal({
          recordHome: recordHomePath,
          missionId,
          phase: CONSTRUCTION_PHASE,
          journalId,
        }),
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });

    const refused = await withGitEnvironment(environment, () => startup.execute(recordHome, makeRequest("record-home-code", recordHome, {
      branch: { kind: "existing", name: "feature/selected" },
    })));

    expect(refused).toMatchObject({ kind: "failed", code: "workspace_dirty_branch_change" });
    expect(git(recordHome, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readFile(unexpectedWork, "utf8")).toBe("preserve this concurrent work\n");
    if (refused.kind !== "failed") return;
    const missionId = refused.details.mission_id;
    expect(typeof missionId).toBe("string");
    if (typeof missionId !== "string") return;
    expect((await readEvents(recordHome, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);

    const unrelated = await withGitEnvironment(environment, () => startup.execute(recordHome, makeRequest("independent", independent)));
    expect(unrelated.kind).toBe("prepared");
    expect(git(recordHome, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readFile(unexpectedWork, "utf8")).toBe("preserve this concurrent work\n");
  });

  it("records a greenfield repository's explicit no-commit condition without making a commit", async () => {
    const environment = await createEnvironment("greenfield");
    const repository = await createRepository(environment, "unborn", { commit: false });

    const result = await withGitEnvironment(environment, () =>
      createStartup(repository).execute(undefined, makeRequest("unborn-code", repository)),
    );

    expect(result.kind).toBe("prepared");
    if (result.kind !== "prepared") return;
    expect(result.repositories[0]?.startingCheckpoint).toEqual({ kind: "no-commit" });
    expect((await readEvents(repository, result.missionId))[0]).toMatchObject({
      data: { repositories: [{ starting_checkpoint: { kind: "no-commit" } }] },
    });
    expect(() => execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: repository,
      env: gitEnvironment(environment.globalConfig),
      stdio: "ignore",
    })).toThrow();
    expect(git(repository, environment, "status", "--porcelain")).toContain(".kepler/");
  });

  it("creates only the selected worktree and new branch from the explicit starting commit", async () => {
    const environment = await createEnvironment("new-worktree");
    const repository = await createRepository(environment, "source");
    const sourceCommit = git(repository, environment, "rev-parse", "HEAD");
    const workspacePath = Path.join(environment.parent, "feature-worktree");

    const result = await withGitEnvironment(environment, () =>
      createStartup(repository).execute(undefined, makeRequest("application", workspacePath, {
        workspace: { kind: "new", path: workspacePath, source: repository },
        branch: { kind: "new", name: "feature/mission-startup", base: "main" },
      })),
    );

    expect(result).toMatchObject({ kind: "prepared" });
    if (result.kind !== "prepared") return;
    expect(result.repositories[0]).toMatchObject({
      branch: "feature/mission-startup",
      workspacePath: await Fs.realpath(workspacePath),
      startingCheckpoint: { kind: "commit", commit: sourceCommit },
    });
    expect(git(workspacePath, environment, "branch", "--show-current")).toBe("feature/mission-startup");
    expect(git(workspacePath, environment, "rev-parse", "HEAD")).toBe(sourceCommit);
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect(git(repository, environment, "rev-parse", "HEAD")).toBe(sourceCommit);
    expect((await Fs.lstat(Path.join(workspacePath, ".git"))).isFile()).toBe(true);
    const events = await readEvents(repository, result.missionId);
    expect(events.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it("honors explicit existing, default, and new branch selections without moving unrelated state", async () => {
    const environment = await createEnvironment("branches");
    const recordHome = await createRepository(environment, "record-home");
    const code = await createRepository(environment, "secondary-code", { marker: false });
    const mainCommit = git(code, environment, "rev-parse", "HEAD");
    git(code, environment, "branch", "feature/existing");
    git(code, environment, "update-ref", "refs/remotes/origin/main", mainCommit);
    git(code, environment, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    const startup = createStartup(environment.parent);

    const existing = await withGitEnvironment(environment, () =>
      startup.execute(recordHome, makeRequest("secondary-code", code, { branch: { kind: "existing", name: "feature/existing" } })),
    );
    expect(existing.kind).toBe("prepared");
    expect(git(code, environment, "branch", "--show-current")).toBe("feature/existing");

    const defaultBranch = await withGitEnvironment(environment, () =>
      startup.execute(recordHome, makeRequest("secondary-code", code, { branch: { kind: "default" } })),
    );
    expect(defaultBranch.kind).toBe("prepared");
    expect(git(code, environment, "branch", "--show-current")).toBe("main");

    const created = await withGitEnvironment(environment, () =>
      startup.execute(recordHome, makeRequest("secondary-code", code, { branch: { kind: "new", name: "feature/new-existing-checkout", base: "main" } })),
    );
    expect(created.kind).toBe("prepared");
    expect(git(code, environment, "branch", "--show-current")).toBe("feature/new-existing-checkout");
    expect(git(code, environment, "rev-parse", "HEAD")).toBe(mainCommit);
    expect(git(code, environment, "status", "--porcelain")).toBe("");
  });

  it("keeps selected dirty work and refuses a branch change before recording a mission", async () => {
    const environment = await createEnvironment("dirty");
    const repository = await createRepository(environment, "dirty-repo");
    git(repository, environment, "branch", "feature");
    await Fs.writeFile(Path.join(repository, "uncommitted.txt"), "keep this content\n");
    const startup = createStartup(repository);

    const selectedCurrent = await withGitEnvironment(environment, () =>
      startup.execute(undefined, makeRequest("dirty-code", repository)),
    );
    expect(selectedCurrent.kind).toBe("prepared");
    expect(await Fs.readFile(Path.join(repository, "uncommitted.txt"), "utf8")).toBe("keep this content\n");
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");

    const beforeMissions = await Fs.readdir(Path.join(repository, ".kepler", "missions"));
    const branchChange = await withGitEnvironment(environment, () =>
      startup.execute(undefined, makeRequest("dirty-code", repository, { branch: { kind: "existing", name: "feature" } })),
    );
    expect(branchChange).toMatchObject({ kind: "failed", code: "workspace_dirty_branch_change" });
    expect(await Fs.readFile(Path.join(repository, "uncommitted.txt"), "utf8")).toBe("keep this content\n");
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readdir(Path.join(repository, ".kepler", "missions"))).toEqual(beforeMissions);
  });

  it("coalesces symlink aliases but keeps linked worktrees and their shared Integration target identity distinct", async () => {
    const environment = await createEnvironment("aliases");
    const repository = await createRepository(environment, "main");
    const linked = Path.join(environment.parent, "linked-worktree");
    const alias = Path.join(environment.parent, "repository-alias");
    git(repository, environment, "worktree", "add", "-q", "-b", "linked", linked, "main");
    await Fs.symlink(repository, alias);
    const startup = createStartup(repository);

    const duplicateAlias = await withGitEnvironment(environment, () => startup.execute(undefined, {
      ...makeRequest("primary", repository),
      repositories: [
        { repositoryId: "primary", workspace: { kind: "existing", path: repository }, branch: { kind: "current" }, integrationTarget: "main" },
        { repositoryId: "alias", workspace: { kind: "existing", path: alias }, branch: { kind: "current" }, integrationTarget: "refs/heads/main" },
      ],
    }));
    expect(duplicateAlias).toMatchObject({ kind: "failed", code: "duplicate_selected_workspace" });

    const separateWorktrees = await withGitEnvironment(environment, () => startup.execute(undefined, {
      ...makeRequest("primary", repository),
      repositories: [
        { repositoryId: "primary", workspace: { kind: "existing", path: repository }, branch: { kind: "current" }, integrationTarget: "main" },
        { repositoryId: "linked", workspace: { kind: "existing", path: linked }, branch: { kind: "current" }, integrationTarget: "refs/heads/main" },
      ],
    }));
    expect(separateWorktrees.kind).toBe("prepared");
    if (separateWorktrees.kind !== "prepared") return;
    expect(separateWorktrees.repositories[0]?.localWorkspaceKey).not.toBe(separateWorktrees.repositories[1]?.localWorkspaceKey);
    const common = await commonDirectory(repository, environment);
    const linkedCommon = await commonDirectory(linked, environment);
    expect(linkedCommon).toBe(common);
    expect(missionIntegrationTargetKey(common, "refs/heads/main")).toBe(missionIntegrationTargetKey(linkedCommon, "refs/heads/main"));
    expect(missionWorkspaceKey(common, await Fs.realpath(repository))).not.toBe(missionWorkspaceKey(linkedCommon, await Fs.realpath(linked)));
  });

  it("keeps workspace attachments in each record home and resolves a previous binding across record homes", async () => {
    const environment = await createEnvironment("record-homes");
    const recordA = await createRepository(environment, "record-a");
    const recordB = await createRepository(environment, "record-b");
    const code = await createRepository(environment, "secondary-code", { marker: false });
    const startup = createStartup(environment.parent);

    const first = await withGitEnvironment(environment, () =>
      startup.execute(recordA, makeRequest("secondary-code", code, { recordHomeRepositoryId: "record-a" })),
    );
    expect(first.kind).toBe("prepared");
    if (first.kind !== "prepared") return;
    const firstWorkspaceId = first.repositories[0]!.localWorkspaceKey;

    const second = await withGitEnvironment(environment, () =>
      startup.execute(recordB, makeRequest("secondary-code", code, {
        recordHomeRepositoryId: "record-b",
        workspace: {
          kind: "previous",
          workspace_id: firstWorkspaceId,
          mission_id: first.missionId,
          record_home_repository_id: "record-a",
          record_home_path: recordA,
        },
      })),
    );
    expect(second.kind).toBe("prepared");
    if (second.kind !== "prepared") return;
    expect(second.repositories[0]?.context).toEqual({
      kind: "previous",
      workspace_id: firstWorkspaceId,
      mission_id: first.missionId,
      record_home_repository_id: "record-a",
    });
    expect(second.repositories[0]?.localWorkspaceKey).toBe(firstWorkspaceId);
    expect(await Fs.access(Path.join(code, ".kepler")).then(() => true, () => false)).toBe(false);
    const commonA = await commonDirectory(recordA, environment);
    const commonB = await commonDirectory(recordB, environment);
    await Fs.access(Path.join(commonA, "kepler", "missions", first.missionId, "workspaces", `${firstWorkspaceId}.json`));
    await Fs.access(Path.join(commonB, "kepler", "missions", second.missionId, "workspaces", `${firstWorkspaceId}.json`));
    expect((await readEvents(recordA, first.missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect((await readEvents(recordB, second.missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it("keeps earlier prepared bindings and reports partial effects when a selected destination appears during preparation", async () => {
    const environment = await createEnvironment("partial");
    const recordHome = await createRepository(environment, "record-home");
    const independent = await createRepository(environment, "independent-code", { marker: false });
    const destination = Path.join(environment.parent, "raced-destination");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let acquisitions = 0;
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      coordination: {
        acquire: async (request) => {
          acquisitions += 1;
          if (acquisitions === 2) await Fs.writeFile(destination, "pre-existing racer content\n");
          return actualRuntime.coordination.acquire(request);
        },
      },
    });
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(runtime),
      journals: {
        create: (recordHomePath, missionId, journalId) => createEventJournal({
          recordHome: recordHomePath,
          missionId,
          phase: CONSTRUCTION_PHASE,
          journalId,
        }),
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const partialRequest = {
      ...makeRequest("record-workspace", recordHome),
      repositories: [
        { repositoryId: "record-workspace", workspace: { kind: "existing", path: recordHome }, branch: { kind: "current" }, integrationTarget: "main" },
        { repositoryId: "new-workspace", workspace: { kind: "new", path: destination, source: recordHome }, branch: { kind: "new", name: "partial-feature", base: "main" }, integrationTarget: "main" },
      ],
    };

    const result = await withGitEnvironment(environment, () => startup.execute(recordHome, partialRequest));

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_destination_raced",
      details: {
        mission_id: expect.any(String),
        partial_effects: [
          { repository_id: "record-workspace", workspace_path: await Fs.realpath(recordHome) },
        ],
      },
    });
    if (result.kind !== "failed") return;
    const missionId = result.details.mission_id;
    expect(typeof missionId).toBe("string");
    if (typeof missionId !== "string") return;
    const events = await readEvents(recordHome, missionId);
    expect(events.map((event) => event.type)).toEqual(["construction.mission-created"]);
    expect(await Fs.readFile(destination, "utf8")).toBe("pre-existing racer content\n");

    const independentResult = await withGitEnvironment(environment, () =>
      startup.execute(recordHome, makeRequest("independent", independent)),
    );
    expect(independentResult.kind).toBe("prepared");
  });

  it("reports a successfully created worktree when post-mutation verification fails", async () => {
    const environment = await createEnvironment("post-mutation-failure");
    const recordHome = await createRepository(environment, "record-home");
    const workspacePath = Path.join(environment.parent, "created-worktree");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      fileSystem: actualRuntime.fileSystem,
      coordination: actualRuntime.coordination,
      identity: actualRuntime.identity,
      git: {
        run: async (cwd, args) => {
          if (cwd === workspacePath && args[0] === "rev-parse" && args[1] === "--is-bare-repository") {
            return { status: 128, stdout: "", stderr: "injected post-creation inspection failure" };
          }
          return actualRuntime.git.run(cwd, args);
        },
        findReachableObjects: actualRuntime.git.findReachableObjects,
      },
    });
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(runtime),
      journals: {
        create: (recordHomePath, missionId, journalId) => createEventJournal({
          recordHome: recordHomePath,
          missionId,
          phase: CONSTRUCTION_PHASE,
          journalId,
        }),
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });

    const result = await withGitEnvironment(environment, () => startup.execute(recordHome, makeRequest("application", workspacePath, {
      workspace: { kind: "new", path: workspacePath, source: recordHome },
      branch: { kind: "new", name: "feature/created-before-failure", base: "main" },
    })));

    expect(result).toMatchObject({
      kind: "failed",
      code: "repository_not_worktree",
      details: {
        partial_effects: [{
          repository_id: "application",
          workspace_path: workspacePath,
          effect: "worktree-created",
          state: "completed",
        }],
      },
    });
    if (result.kind !== "failed") return;
    const missionId = result.details.mission_id;
    expect(typeof missionId).toBe("string");
    if (typeof missionId !== "string") return;
    expect((await Fs.lstat(Path.join(workspacePath, ".git"))).isFile()).toBe(true);
    expect(git(workspacePath, environment, "branch", "--show-current")).toBe("feature/created-before-failure");
    expect((await readEvents(recordHome, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);
  });

  it("does not create the record-home marker during project resolution", async () => {
    const environment = await createEnvironment("missing-marker");
    const repository = await createRepository(environment, "no-kepler-marker", { marker: false });
    const result = await withGitEnvironment(environment, () =>
      createStartup(repository).execute(undefined, makeRequest("secondary", repository)),
    );

    expect(result).toMatchObject({ kind: "failed", code: "kepler_directory_missing" });
    expect(await Fs.access(Path.join(repository, ".kepler")).then(() => true, () => false)).toBe(false);
    expect((await Fs.readdir(repository)).sort()).toEqual([".git", "README.md"]);
  });
});
