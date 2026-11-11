import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { MissionStartup, type MissionWorkspacePreparation } from "../../packages/cli/src/construction/mission-startup.js";
import {
  createMissionWorkspacePreparation,
  missionIntegrationTargetKey,
  missionWorkspaceKey,
} from "../../packages/cli/src/construction/mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";
import { createNodeMissionStartupRecoveryRuntime, type MissionStartupIntentFileSystem } from "../../packages/cli/src/construction/mission-startup-recovery-runtime.js";
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

const trackWorkspaceClaims = (runtime: MissionWorkspaceRuntime) => {
  const attempts: string[] = [];
  const trackedRuntime: MissionWorkspaceRuntime = {
    ...runtime,
    coordination: {
      ...runtime.coordination,
      acquire: async (request) => {
        if (request.location.kind === "code-workspace") attempts.push(request.resourceKey);
        return await runtime.coordination.acquire(request);
      },
    },
  };
  return { runtime: trackedRuntime, attempts };
};

const holdWorkspaceClaim = async (
  runtime: MissionWorkspaceRuntime,
  common: string,
  workspacePath: string,
  missionId: string,
) => {
  const resourceKey = missionWorkspaceKey(common, workspacePath);
  const request = {
    commonDirectory: common,
    location: { kind: "code-workspace" as const },
    resourceKey,
    owner: {
      ...runtime.identity,
      mission_id: missionId,
      resource_scope: `code-workspace:${resourceKey}`,
    },
  };
  const acquired = await runtime.coordination.acquire(request);
  if (acquired.kind !== "acquired") throw new Error(`Could not hold canonical workspace claim: ${JSON.stringify(acquired)}`);
  return {
    resourceKey,
    lease: acquired.lease,
    tryAcquire: async () => await runtime.coordination.acquire(request),
  };
};

const createStartupWithRuntime = (
  cwd: string,
  workspaceRuntime: MissionWorkspaceRuntime,
  nextIdentity: () => string = randomUUID,
  intentFileSystem?: MissionStartupIntentFileSystem,
): MissionStartup => {
  const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => cwd }));
  return new MissionStartup({
    projects: { resolve: (project) => projects.resolve(project) },
    workspaces: createMissionWorkspacePreparation(workspaceRuntime),
    recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime, undefined, intentFileSystem),
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

const createStartup = (cwd: string, nextIdentity: () => string = randomUUID): MissionStartup =>
  createStartupWithRuntime(cwd, createNodeMissionWorkspaceRuntime({ cwd }), nextIdentity);

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

const isWorkspaceAttachmentPath = (path: string): boolean => /[/\\]workspaces[/\\][a-f0-9]{64}\.json$/.test(path);

const createStartupWithOnePreparationFailure = (
  cwd: string,
  workspaceRuntime: MissionWorkspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd }),
): MissionStartup => {
  const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => cwd }));
  const baseWorkspaces = createMissionWorkspacePreparation(workspaceRuntime);
  let failOnce = true;
  const workspaces: MissionWorkspacePreparation = {
    ...baseWorkspaces,
    prepare: async (recordHome, missionId, repositories, context) => {
      if (failOnce) {
        failOnce = false;
        return {
          kind: "failed",
          code: "workspace_preparation_failed",
          message: "injected interruption before workspace mutation",
          details: {},
          recovery: "Retry the original mission.",
        };
      }
      return baseWorkspaces.prepare(recordHome, missionId, repositories, context);
    },
  };
  return new MissionStartup({
    projects: { resolve: (project) => projects.resolve(project) },
    workspaces,
    recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
    journals: {
      create: (recordHome, missionId, journalId) => createEventJournal({
        recordHome,
        missionId,
        phase: CONSTRUCTION_PHASE,
        journalId,
      }),
    },
    identities: { next: randomUUID },
    now: () => "2026-10-21T14:00:00.000Z",
    producer: { name: "kepler-cli", version: "0.10.3" },
  });
};

const createBranchLockedMission = async (name: string) => {
  const environment = await createEnvironment(name);
  const repository = await createRepository(environment, "record-home");
  const linked = Path.join(environment.parent, "held-branch-worktree");
  const branch = `feature/${name}`;
  git(repository, environment, "worktree", "add", "-q", "-b", branch, linked, "main");
  const startup = createStartup(environment.parent);
  const interrupted = await withGitEnvironment(environment, () => startup.execute(repository, makeRequest("record-home", repository, {
    branch: { kind: "existing", name: branch },
  })));
  expect(interrupted).toMatchObject({ kind: "failed", code: "branch_switch_failed", details: { mission_id: expect.any(String) } });
  if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") {
    throw new Error("Expected branch conflict after durable mission creation");
  }
  return { environment, repository, linked, branch, startup, missionId: interrupted.details.mission_id };
};

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

  it("returns historical prepared facts when intent and attachment are absent after HEAD advances", async () => {
    const environment = await createEnvironment("prepared-history-without-intent");
    const repository = await createRepository(environment, "record-home");
    const startup = createStartup(environment.parent);
    const original = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(original).toMatchObject({ kind: "prepared", historical: false });
    if (original.kind !== "prepared" || original.repositories[0] === undefined) return;
    const missionId = original.missionId;
    const common = await commonDirectory(repository, environment);
    const missionDirectory = Path.join(common, "kepler", "missions", missionId);
    const intentPath = Path.join(missionDirectory, "workspaces", "startup", "intent.json");
    const attachmentPath = Path.join(missionDirectory, "workspaces", `${original.repositories[0].localWorkspaceKey}.json`);
    expect(await Fs.readFile(intentPath).then(() => true)).toBe(true);
    expect(await Fs.access(Path.join(missionDirectory, "startup-intent.json")).then(() => true, () => false)).toBe(false);
    expect(await Fs.readFile(attachmentPath).then(() => true)).toBe(true);
    const historyBefore = await readEvents(repository, missionId);
    await Fs.rm(intentPath);
    await Fs.rm(attachmentPath);
    await Fs.writeFile(Path.join(repository, "README.md"), "# Work progressed after preparation\n");
    git(repository, environment, "add", "README.md");
    git(repository, environment, "commit", "-q", "-m", "Progress after preparation");
    const progressedHead = git(repository, environment, "rev-parse", "HEAD");

    const historical = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(historical).toMatchObject({ kind: "prepared", missionId, recordHome: repository, historical: true });
    if (historical.kind !== "prepared") return;
    expect(historical.repositories).toEqual([{
      repositoryId: "record-home",
      context: { kind: "existing" },
      branch: "main",
      integrationTarget: "refs/heads/main",
      startingCheckpoint: { kind: "commit", commit: expect.any(String) },
    }]);
    expect(historical.repositories[0]).not.toHaveProperty("localWorkspaceKey");
    expect(historical.repositories[0]).not.toHaveProperty("workspacePath");
    expect(historical).not.toHaveProperty("executionReady");
    expect(git(repository, environment, "rev-parse", "HEAD")).toBe(progressedHead);
    expect(await Fs.readFile(attachmentPath).then(() => true, () => false)).toBe(false);
    expect(await readEvents(repository, missionId)).toEqual(historyBefore);
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
        release: (request, token) => actualRuntime.coordination.release(request, token),
      },
    });
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(runtime),
      recovery: createNodeMissionStartupRecoveryRuntime(runtime),
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
        release: (request, token) => actualRuntime.coordination.release(request, token),
      },
    });
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(runtime),
      recovery: createNodeMissionStartupRecoveryRuntime(runtime),
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

  it.each([
    { state: "missing", expectedCode: "mission_recovery_material_missing" },
    { state: "malformed", expectedCode: "mission_recovery_intent_read_failed" },
    { state: "symlinked", expectedCode: "mission_recovery_intent_read_failed" },
  ])("fails safely when saved recovery data is $state", async ({ state, expectedCode }) => {
    const { environment, repository, linked, startup, missionId } = await createBranchLockedMission(`intent-${state}`);
    const common = await commonDirectory(repository, environment);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const originalIntent = await Fs.readFile(intentPath);
    if (state === "missing") await Fs.rm(intentPath);
    else if (state === "malformed") await Fs.writeFile(intentPath, "{ malformed\n");
    else {
      const savedPath = `${intentPath}.saved`;
      await Fs.rename(intentPath, savedPath);
      await Fs.symlink(savedPath, intentPath);
    }
    const journalPath = Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
    const journalName = (await Fs.readdir(journalPath))[0]!;
    const journalFile = Path.join(journalPath, journalName);
    const beforeHistory = await Fs.readFile(journalFile);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "failed", code: expectedCode });
    expect(await Fs.readFile(journalFile)).toEqual(beforeHistory);
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readFile(state === "symlinked" ? `${intentPath}.saved` : intentPath).then(() => true, () => false)).toBe(state !== "missing");
    expect(originalIntent.length).toBeGreaterThan(0);
    expect(await Fs.readdir(Path.join(common, "kepler", "missions", missionId, "workspaces")).catch(() => [])).toEqual(["startup"]);
    expect(git(repository, environment, "worktree", "list", "--porcelain")).toContain(`worktree ${linked}`);
  });

  it.each(["workspace", "common-directory"] as const)("rejects a self-consistent saved %s alias before the code-workspace claim", async (aliasKind) => {
    const environment = await createEnvironment(`saved-${aliasKind}-alias`);
    const repository = await createRepository(environment, "record-home");
    const linked = Path.join(environment.parent, "held-alias-worktree");
    const branch = `feature/saved-${aliasKind}-alias`;
    git(repository, environment, "worktree", "add", "-q", "-b", branch, linked, "main");
    const baseRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    const tracked = trackWorkspaceClaims(baseRuntime);
    const startup = createStartupWithRuntime(environment.parent, tracked.runtime);
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository, { branch: { kind: "existing", name: branch } })),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "branch_switch_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    git(repository, environment, "worktree", "remove", linked);
    const common = await commonDirectory(repository, environment);
    const canonicalWorkspacePath = await Fs.realpath(repository);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const intent = JSON.parse(await Fs.readFile(intentPath, "utf8")) as { repositories: Array<Record<string, unknown>> };
    const savedRepository = intent.repositories[0]!;
    let aliasPath: string;
    let aliasWorkspaceKey: string;
    if (aliasKind === "workspace") {
      aliasPath = Path.join(environment.parent, "workspace-alias");
      await Fs.symlink(canonicalWorkspacePath, aliasPath, "dir");
      savedRepository.workspacePath = aliasPath;
      aliasWorkspaceKey = missionWorkspaceKey(common, aliasPath);
      savedRepository.localWorkspaceKey = aliasWorkspaceKey;
    } else {
      aliasPath = Path.join(environment.parent, "common-directory-alias");
      await Fs.symlink(common, aliasPath, "dir");
      savedRepository.commonDirectory = aliasPath;
      savedRepository.integrationTargetKey = missionIntegrationTargetKey(aliasPath, "refs/heads/main");
      aliasWorkspaceKey = missionWorkspaceKey(aliasPath, canonicalWorkspacePath);
      savedRepository.localWorkspaceKey = aliasWorkspaceKey;
    }
    const tamperedIntent = `${JSON.stringify(intent, null, 2)}\n`;
    await Fs.writeFile(intentPath, tamperedIntent);
    const historyDirectory = Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
    const historyPath = Path.join(historyDirectory, (await Fs.readdir(historyDirectory))[0]!);
    const beforeHistory = await Fs.readFile(historyPath);
    const beforeStatus = git(repository, environment, "status", "--porcelain=v1", "--untracked-files=all");
    const beforeReadme = await Fs.readFile(Path.join(repository, "README.md"));
    const beforeWorktrees = git(repository, environment, "worktree", "list", "--porcelain");
    const canonicalClaim = await holdWorkspaceClaim(baseRuntime, common, canonicalWorkspacePath, missionId);
    const attachmentsDirectory = Path.join(common, "kepler", "missions", missionId, "workspaces");
    tracked.attempts.length = 0;

    try {
      const rejected = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

      expect(rejected).toMatchObject({ kind: "failed", code: "workspace_recovery_identity_changed" });
      expect(tracked.attempts).toEqual([]);
      expect(await canonicalClaim.tryAcquire()).toMatchObject({ kind: "failed", code: "resource_contended" });
      expect(git(repository, environment, "branch", "--show-current")).toBe("main");
      expect(git(repository, environment, "status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeStatus);
      expect(await Fs.readFile(Path.join(repository, "README.md"))).toEqual(beforeReadme);
      expect(await Fs.readFile(historyPath)).toEqual(beforeHistory);
      expect(await Fs.readFile(intentPath, "utf8")).toBe(tamperedIntent);
      expect(git(repository, environment, "worktree", "list", "--porcelain")).toBe(beforeWorktrees);
      expect(await Fs.access(Path.join(attachmentsDirectory, `${aliasWorkspaceKey}.json`)).then(() => true, () => false)).toBe(false);
      expect(await Fs.access(Path.join(attachmentsDirectory, `${canonicalClaim.resourceKey}.json`)).then(() => true, () => false)).toBe(false);
      expect(await Fs.lstat(aliasPath).then((stat) => stat.isSymbolicLink())).toBe(true);
    } finally {
      await canonicalClaim.lease.release();
    }
  });

  it("rejects a missing new-worktree destination under an aliased parent before claiming or creating it", async () => {
    const environment = await createEnvironment("new-worktree-aliased-parent");
    const repository = await createRepository(environment, "record-home");
    const canonicalParent = Path.join(environment.parent, "canonical-workspaces");
    const aliasParent = Path.join(environment.parent, "workspace-parent-alias");
    await Fs.mkdir(canonicalParent);
    const canonicalDestination = Path.join(canonicalParent, "new-worktree");
    const aliasDestination = Path.join(aliasParent, "new-worktree");
    const baseRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    const tracked = trackWorkspaceClaims(baseRuntime);
    const startup = createStartupWithOnePreparationFailure(environment.parent, tracked.runtime);
    const interrupted = await withGitEnvironment(environment, () => startup.execute(repository, makeRequest(
      "application",
      canonicalDestination,
      {
        workspace: { kind: "new", path: canonicalDestination, source: repository },
        branch: { kind: "new", name: "feature/aliased-parent", base: "main" },
      },
    )));
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    await Fs.symlink(canonicalParent, aliasParent, "dir");
    const common = await commonDirectory(repository, environment);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const intent = JSON.parse(await Fs.readFile(intentPath, "utf8")) as { repositories: Array<Record<string, unknown>> };
    const savedRepository = intent.repositories[0]!;
    savedRepository.workspacePath = aliasDestination;
    const aliasWorkspaceKey = missionWorkspaceKey(common, aliasDestination);
    savedRepository.localWorkspaceKey = aliasWorkspaceKey;
    const tamperedIntent = `${JSON.stringify(intent, null, 2)}\n`;
    await Fs.writeFile(intentPath, tamperedIntent);
    const historyDirectory = Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
    const historyPath = Path.join(historyDirectory, (await Fs.readdir(historyDirectory))[0]!);
    const beforeHistory = await Fs.readFile(historyPath);
    const beforeStatus = git(repository, environment, "status", "--porcelain=v1", "--untracked-files=all");
    const beforeReadme = await Fs.readFile(Path.join(repository, "README.md"));
    const beforeWorktrees = git(repository, environment, "worktree", "list", "--porcelain");
    const canonicalClaim = await holdWorkspaceClaim(baseRuntime, common, canonicalDestination, missionId);
    const attachmentsDirectory = Path.join(common, "kepler", "missions", missionId, "workspaces");
    tracked.attempts.length = 0;

    try {
      const rejected = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

      expect(rejected).toMatchObject({ kind: "failed", code: "workspace_recovery_identity_changed" });
      expect(tracked.attempts).toEqual([]);
      expect(await canonicalClaim.tryAcquire()).toMatchObject({ kind: "failed", code: "resource_contended" });
      expect(await Fs.access(canonicalDestination).then(() => true, () => false)).toBe(false);
      expect(await Fs.access(aliasDestination).then(() => true, () => false)).toBe(false);
      expect(git(repository, environment, "branch", "--show-current")).toBe("main");
      expect(git(repository, environment, "branch", "--list", "feature/aliased-parent")).toBe("");
      expect(git(repository, environment, "status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeStatus);
      expect(await Fs.readFile(Path.join(repository, "README.md"))).toEqual(beforeReadme);
      expect(await Fs.readFile(historyPath)).toEqual(beforeHistory);
      expect(await Fs.readFile(intentPath, "utf8")).toBe(tamperedIntent);
      expect(git(repository, environment, "worktree", "list", "--porcelain")).toBe(beforeWorktrees);
      expect(await Fs.access(Path.join(attachmentsDirectory, `${aliasWorkspaceKey}.json`)).then(() => true, () => false)).toBe(false);
      expect(await Fs.access(Path.join(attachmentsDirectory, `${canonicalClaim.resourceKey}.json`)).then(() => true, () => false)).toBe(false);
    } finally {
      await canonicalClaim.lease.release();
    }
  });

  it("rejects an intent replaced by a symlink after validation but before descriptor open", async () => {
    const environment = await createEnvironment("intent-replacement-race");
    const repository = await createRepository(environment, "record-home");
    const linked = Path.join(environment.parent, "held-intent-race-worktree");
    const branch = "feature/intent-race-held";
    git(repository, environment, "worktree", "add", "-q", "-b", branch, linked, "main");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let intentPath = "";
    let replaceAtOpen = false;
    let savedPath = "";
    const intentFileSystem: MissionStartupIntentFileSystem = {
      open: async (path, flags) => {
        if (replaceAtOpen && path === intentPath) {
          replaceAtOpen = false;
          savedPath = `${path}.saved`;
          await Fs.rename(path, savedPath);
          await Fs.symlink(savedPath, path);
        }
        return Fs.open(path, flags);
      },
    };
    const startup = createStartupWithRuntime(environment.parent, actualRuntime, randomUUID, intentFileSystem);
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository, { branch: { kind: "existing", name: branch } })),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "branch_switch_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const common = await commonDirectory(repository, environment);
    intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const beforeIntent = await Fs.readFile(intentPath);
    const beforeHistory = await Fs.readFile(Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE,
      (await Fs.readdir(Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE)))[0]!));
    const workspaceKey = missionWorkspaceKey(common, await Fs.realpath(repository));
    const workspaceLockPath = Path.join(common, "kepler", "workspaces", workspaceKey);
    expect(await Fs.access(workspaceLockPath).then(() => true, () => false)).toBe(false);
    replaceAtOpen = true;

    const rejected = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(rejected).toMatchObject({ kind: "failed", code: "mission_recovery_intent_read_failed" });
    expect(await Fs.lstat(intentPath).then((stat) => stat.isSymbolicLink())).toBe(true);
    expect(await Fs.readFile(savedPath)).toEqual(beforeIntent);
    expect(await Fs.readFile(Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE,
      (await Fs.readdir(Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE)))[0]!))).toEqual(beforeHistory);
    expect(await Fs.access(workspaceLockPath).then(() => true, () => false)).toBe(false);
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);
  });

  it("blocks incomplete, unsupported, conflicting, and downstream-only history without rewriting it", async () => {
    const { environment, repository, startup, missionId } = await createBranchLockedMission("history-safety");
    const historyDirectory = Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
    const journalName = (await Fs.readdir(historyDirectory))[0]!;
    const journalPath = Path.join(historyDirectory, journalName);
    const originalBytes = await Fs.readFile(journalPath, "utf8");
    const originalEvent = JSON.parse(originalBytes.trimEnd()) as Record<string, unknown>;
    const intentPath = Path.join(await commonDirectory(repository, environment), "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const intent = JSON.parse(await Fs.readFile(intentPath, "utf8")) as { preparedEvent: Record<string, unknown> };
    const scenarios = [
      { state: "unsupported", bytes: `${JSON.stringify({ ...originalEvent, envelope_version: 99 })}\n`, code: "mission_history_not_recoverable" },
      { state: "conflicting", bytes: `${JSON.stringify({ ...originalEvent, data: { ...(originalEvent.data as Record<string, unknown>), title: "Conflicting title" } })}\n`, code: "mission_history_conflict" },
      { state: "changed-unterminated-tail", bytes: JSON.stringify({ ...originalEvent, data: { ...(originalEvent.data as Record<string, unknown>), title: "Changed saved event" } }), code: "mission_history_not_recoverable" },
      { state: "unsupported-unterminated-tail", bytes: JSON.stringify({ ...originalEvent, type: "construction.future-event" }), code: "mission_history_not_recoverable" },
      { state: "truncated-unterminated-tail", bytes: originalBytes.trimEnd().slice(0, -1), code: "mission_history_not_recoverable" },
      { state: "ambiguous-unterminated-tail", bytes: `${originalBytes}${originalBytes.trimEnd()}`, code: "mission_history_not_recoverable" },
      { state: "uncertain-tail", bytes: `${originalBytes.trimEnd()}\n{`, code: "mission_history_not_recoverable" },
      { state: "downstream-only", bytes: `${JSON.stringify(intent.preparedEvent)}\n`, code: "mission_history_not_recoverable" },
    ];
    for (const scenario of scenarios) {
      await Fs.writeFile(journalPath, scenario.bytes);
      const result = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));
      expect(result, scenario.state).toMatchObject({ kind: "failed", code: scenario.code });
      expect(await Fs.readFile(journalPath, "utf8")).toBe(scenario.bytes);
      expect(git(repository, environment, "branch", "--show-current")).toBe("main");
      expect(git(repository, environment, "worktree", "list", "--porcelain")).toContain("feature/history-safety");
    }
  });

  it.each(["commit", "no-commit"] as const)("refuses startup %s drift without resetting or re-baselining", async (checkpointKind) => {
    const environment = await createEnvironment(`checkpoint-drift-${checkpointKind}`);
    const repository = await createRepository(environment, "record-home", { commit: checkpointKind === "commit" });
    const startup = createStartupWithOnePreparationFailure(environment.parent);
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const progressedReadme = `# ${checkpointKind} checkpoint drift\n`;
    await Fs.writeFile(Path.join(repository, "README.md"), progressedReadme);
    git(repository, environment, "add", checkpointKind === "no-commit" ? "." : "README.md");
    git(repository, environment, "commit", "-q", "-m", `Advance ${checkpointKind} checkpoint`);
    const driftHead = git(repository, environment, "rev-parse", "HEAD");

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "failed", code: "workspace_recovery_conflict" });
    expect(git(repository, environment, "rev-parse", "HEAD")).toBe(driftHead);
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect(await Fs.readFile(Path.join(repository, "README.md"), "utf8")).toBe(progressedReadme);
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);
  });

  it("reports a successfully created worktree when post-mutation verification fails", async () => {
    const environment = await createEnvironment("post-mutation-failure");
    const recordHome = await createRepository(environment, "record-home");
    const workspacePath = Path.join(environment.parent, "created-worktree");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failPostCreationInspection = true;
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      fileSystem: actualRuntime.fileSystem,
      coordination: actualRuntime.coordination,
      identity: actualRuntime.identity,
      git: {
        run: async (cwd, args) => {
          if (failPostCreationInspection && cwd === workspacePath && args[0] === "rev-parse" && args[1] === "--is-bare-repository") {
            failPostCreationInspection = false;
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
      recovery: createNodeMissionStartupRecoveryRuntime(runtime),
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
    const createdEvents = await readEvents(recordHome, missionId);
    expect(createdEvents.map((event) => event.type)).toEqual(["construction.mission-created"]);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(recordHome, missionId));
    expect(recovered).toMatchObject({ kind: "prepared", missionId, historical: false, repositories: [{ repositoryId: "application", branch: "feature/created-before-failure", workspacePath }] });
    expect((await Fs.lstat(Path.join(workspacePath, ".git"))).isFile()).toBe(true);
    const events = await readEvents(recordHome, missionId);
    expect(events.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect(events[0]?.id).toBe(createdEvents[0]?.id);
    expect(events[1]?.caused_by).toEqual([createdEvents[0]?.id]);
  });

  it("retries the exact saved creation envelope after creation append failed before writing", async () => {
    const environment = await createEnvironment("created-event-retry");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failCreatedAppend = true;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              if (failCreatedAppend && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-created") {
                failCreatedAppend = false;
                throw new Error("injected creation append failure before write");
              }
              return journal.append(event);
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "mission_record_failed", details: { mission_id: expect.any(String), event_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const common = await commonDirectory(repository, environment);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const saved = JSON.parse(await Fs.readFile(intentPath, "utf8")) as { createdEvent: unknown; preparedEvent: unknown };
    expect((saved.createdEvent as Record<string, unknown>).id).toBe(interrupted.details.event_id);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "prepared", missionId });
    const history = await readEvents(repository, missionId);
    expect(history).toEqual([saved.createdEvent, saved.preparedEvent]);
    expect(history.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it("recovers a complete saved creation event whose only missing byte is the final LF", async () => {
    const environment = await createEnvironment("creation-event-missing-lf");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let removeCreationTerminator = true;
    let unterminatedJournalPath: string | undefined;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              if (removeCreationTerminator && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-created") {
                await journal.append(event);
                removeCreationTerminator = false;
                unterminatedJournalPath = journal.path;
                const bytes = await Fs.readFile(journal.path);
                expect(bytes.at(-1)).toBe(10);
                await Fs.writeFile(journal.path, bytes.subarray(0, bytes.length - 1));
                throw new Error("interrupted after complete creation bytes but before final LF");
              }
              return journal.append(event);
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "mission_record_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string" || !unterminatedJournalPath) return;
    const missionId = interrupted.details.mission_id;
    const common = await commonDirectory(repository, environment);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const saved = JSON.parse(await Fs.readFile(intentPath, "utf8")) as { createdEvent: unknown; preparedEvent: unknown };
    const originalTail = await Fs.readFile(unterminatedJournalPath, "utf8");
    expect(JSON.parse(originalTail)).toEqual(saved.createdEvent);
    expect(originalTail.endsWith("\n")).toBe(false);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "prepared", missionId });
    expect((await readEvents(repository, missionId))).toEqual([saved.createdEvent, saved.preparedEvent]);
    expect((await Fs.readFile(unterminatedJournalPath, "utf8")).endsWith("\n")).toBe(true);
  });

  it("recovers a complete saved prepared event whose only missing byte is the final LF", async () => {
    const environment = await createEnvironment("prepared-event-missing-lf");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let removePreparedTerminator = true;
    let unterminatedJournalPath: string | undefined;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              const appended = await journal.append(event);
              if (removePreparedTerminator && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-workspaces-prepared") {
                removePreparedTerminator = false;
                unterminatedJournalPath = journal.path;
                const bytes = await Fs.readFile(journal.path);
                expect(bytes.at(-1)).toBe(10);
                await Fs.writeFile(journal.path, bytes.subarray(0, bytes.length - 1));
                throw new Error("interrupted after complete prepared bytes but before final LF");
              }
              return appended;
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_record_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string" || !unterminatedJournalPath) return;
    const missionId = interrupted.details.mission_id;
    const common = await commonDirectory(repository, environment);
    const intentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", "startup", "intent.json");
    const saved = JSON.parse(await Fs.readFile(intentPath, "utf8")) as {
      createdEvent: unknown;
      preparedEvent: unknown;
      repositories: readonly { localWorkspaceKey: string }[];
    };
    const originalTail = await Fs.readFile(unterminatedJournalPath, "utf8");
    expect(originalTail.endsWith("\n")).toBe(false);
    expect(JSON.parse(originalTail.split("\n").at(-1)!)).toEqual(saved.preparedEvent);
    const workspaceKey = saved.repositories[0]?.localWorkspaceKey;
    expect(workspaceKey).toBeDefined();
    if (!workspaceKey) return;
    const attachmentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", `${workspaceKey}.json`);
    const attachmentBefore = await Fs.readFile(attachmentPath);
    await Fs.writeFile(Path.join(repository, "README.md"), "# Progress after unterminated preparation\n");
    git(repository, environment, "add", "README.md");
    git(repository, environment, "commit", "-q", "-m", "Progress after unterminated preparation");
    const progressedHead = git(repository, environment, "rev-parse", "HEAD");

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "prepared", missionId, recordHome: repository, historical: true });
    if (recovered.kind !== "prepared") return;
    expect(recovered.repositories[0]).not.toHaveProperty("localWorkspaceKey");
    expect(recovered.repositories[0]).not.toHaveProperty("workspacePath");
    expect(git(repository, environment, "rev-parse", "HEAD")).toBe(progressedHead);
    expect(await Fs.readFile(attachmentPath)).toEqual(attachmentBefore);
    expect((await Fs.readFile(unterminatedJournalPath, "utf8")).endsWith("\n")).toBe(true);
    expect(await readEvents(repository, missionId)).toEqual([saved.createdEvent, saved.preparedEvent]);
  });

  it("retries a failed prepared-event append with the exact saved event IDs", async () => {
    const environment = await createEnvironment("prepared-event-retry");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failPreparedAppend = true;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              if (failPreparedAppend && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-workspaces-prepared") {
                failPreparedAppend = false;
                throw new Error("injected prepared append failure");
              }
              return journal.append(event);
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_record_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const preparedEventId = interrupted.details.event_id;
    expect(typeof preparedEventId).toBe("string");
    const common = await commonDirectory(repository, environment);
    const workspaceId = missionWorkspaceKey(common, repository);
    const attachmentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", `${workspaceId}.json`);
    const attachmentBefore = await Fs.readFile(attachmentPath);
    const firstHistory = await readEvents(repository, missionId);
    expect(firstHistory.map((event) => event.type)).toEqual(["construction.mission-created"]);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));
    expect(recovered).toMatchObject({ kind: "prepared", missionId });
    const history = await readEvents(repository, missionId);
    expect(history.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect(history[0]?.id).toBe(firstHistory[0]?.id);
    expect(history[1]?.id).toBe(preparedEventId);
    expect(history[1]?.caused_by).toEqual([history[0]?.id]);
    expect(await Fs.readFile(attachmentPath)).toEqual(attachmentBefore);
  });

  it("returns a recorded preparation as historical state after the append succeeded and the HEAD progressed", async () => {
    const environment = await createEnvironment("prepared-event-after-write");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failAfterPreparedWrite = true;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              const appended = await journal.append(event);
              if (failAfterPreparedWrite && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-workspaces-prepared") {
                failAfterPreparedWrite = false;
                throw new Error("injected response loss after prepared append");
              }
              return appended;
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_record_failed", details: { mission_id: expect.any(String), event_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const historyBefore = await readEvents(repository, missionId);
    expect(historyBefore.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect(historyBefore[1]?.id).toBe(interrupted.details.event_id);
    const common = await commonDirectory(repository, environment);
    const workspaceId = missionWorkspaceKey(common, repository);
    const attachmentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", `${workspaceId}.json`);
    const attachmentBefore = await Fs.readFile(attachmentPath);
    const originalCheckpoint = (historyBefore[1]?.data as Record<string, unknown>).repositories as Array<Record<string, unknown>>;
    const expectedStartingCheckpoint = originalCheckpoint[0]?.starting_checkpoint;
    await Fs.writeFile(Path.join(repository, "README.md"), "# Progress after startup preparation\n");
    git(repository, environment, "add", "README.md");
    git(repository, environment, "commit", "-q", "-m", "Progress after mission preparation");
    const progressedHead = git(repository, environment, "rev-parse", "HEAD");

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({
      kind: "prepared",
      missionId,
      repositories: [{ startingCheckpoint: expectedStartingCheckpoint }],
    });
    expect(git(repository, environment, "rev-parse", "HEAD")).toBe(progressedHead);
    expect(await Fs.readFile(attachmentPath)).toEqual(attachmentBefore);
    expect(await readEvents(repository, missionId)).toEqual(historyBefore);
  });

  it("preserves a conflicting saved workspace attachment during recovery", async () => {
    const environment = await createEnvironment("attachment-conflict");
    const repository = await createRepository(environment, "record-home");
    const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => environment.parent }));
    const workspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failPreparedAppend = true;
    const startup = new MissionStartup({
      projects: { resolve: (project) => projects.resolve(project) },
      workspaces: createMissionWorkspacePreparation(workspaceRuntime),
      recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
      journals: {
        create: (recordHome, missionId, journalId) => {
          const journal = createEventJournal({ recordHome, missionId, phase: CONSTRUCTION_PHASE, journalId });
          return {
            path: journal.path,
            read: journal.read,
            append: async (event) => {
              if (failPreparedAppend && typeof event === "object" && event !== null &&
                  "type" in event && event.type === "construction.mission-workspaces-prepared") {
                failPreparedAppend = false;
                throw new Error("injected prepared append failure");
              }
              return journal.append(event);
            },
          };
        },
      },
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00.000Z",
      producer: { name: "kepler-cli", version: "0.10.3" },
    });
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_record_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const common = await commonDirectory(repository, environment);
    const workspaceId = missionWorkspaceKey(common, repository);
    const attachmentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", `${workspaceId}.json`);
    const attachment = JSON.parse(await Fs.readFile(attachmentPath, "utf8")) as Record<string, unknown>;
    const conflictingAttachment = `${JSON.stringify({ ...attachment, branch: "feature/unauthorized" }, null, 2)}\n`;
    await Fs.writeFile(attachmentPath, conflictingAttachment);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "failed", code: "workspace_attachment_conflict" });
    expect(await Fs.readFile(attachmentPath, "utf8")).toBe(conflictingAttachment);
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);
  });

  it("releases the fresh-preparation workspace lease after an attachment probe throws and safely retries", async () => {
    const environment = await createEnvironment("fresh-attachment-probe-failure");
    const repository = await createRepository(environment, "record-home");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failAttachmentProbe = true;
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      git: actualRuntime.git,
      coordination: actualRuntime.coordination,
      identity: actualRuntime.identity,
      fileSystem: {
        ...actualRuntime.fileSystem,
        pathKind: async (path) => {
          if (failAttachmentProbe && isWorkspaceAttachmentPath(path)) {
            failAttachmentProbe = false;
            throw new Error("injected attachment path probe failure");
          }
          return actualRuntime.fileSystem.pathKind(path);
        },
      },
    });
    const startup = createStartupWithRuntime(environment.parent, runtime);
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository)),
    );
    expect(interrupted).toMatchObject({
      kind: "failed",
      code: "workspace_attachment_write_failed",
      details: { mission_id: expect.any(String), partial_effects: [{ state: "git-prepared-attachment-failed" }] },
    });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    const partialEffect = (interrupted.details.partial_effects as Array<Record<string, unknown>>)[0];
    const workspaceId = partialEffect?.workspace_id;
    expect(typeof workspaceId).toBe("string");
    if (typeof workspaceId !== "string") return;
    const common = await commonDirectory(repository, environment);
    const lockPath = Path.join(common, "kepler", "workspaces", workspaceId);
    expect(await Fs.access(lockPath).then(() => true, () => false)).toBe(false);
    expect(git(repository, environment, "branch", "--show-current")).toBe("main");
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);

    const recovered = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recovered).toMatchObject({ kind: "prepared", missionId, repositories: [{ branch: "main" }] });
    expect(await Fs.access(lockPath).then(() => true, () => false)).toBe(false);
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it("releases the recovery workspace lease after attachment write failure and safely retries", async () => {
    const environment = await createEnvironment("recovery-attachment-write-failure");
    const repository = await createRepository(environment, "record-home");
    const linked = Path.join(environment.parent, "held-attachment-branch-worktree");
    const branch = "feature/recovery-attachment-write";
    git(repository, environment, "worktree", "add", "-q", "-b", branch, linked, "main");
    const actualRuntime = createNodeMissionWorkspaceRuntime({ cwd: environment.parent });
    let failAttachmentWrite = false;
    const runtime = createNodeMissionWorkspaceRuntime({
      cwd: environment.parent,
      git: actualRuntime.git,
      coordination: actualRuntime.coordination,
      identity: actualRuntime.identity,
      fileSystem: {
        ...actualRuntime.fileSystem,
        writeFileExclusive: async (path, content) => {
          if (failAttachmentWrite && isWorkspaceAttachmentPath(path)) {
            throw new Error("injected attachment write failure");
          }
          return actualRuntime.fileSystem.writeFileExclusive(path, content);
        },
      },
    });
    const startup = createStartupWithRuntime(environment.parent, runtime);
    const interrupted = await withGitEnvironment(environment, () =>
      startup.execute(repository, makeRequest("record-home", repository, {
        branch: { kind: "existing", name: branch },
      })),
    );
    expect(interrupted).toMatchObject({ kind: "failed", code: "branch_switch_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    git(repository, environment, "worktree", "remove", linked);
    failAttachmentWrite = true;

    const recoveredAttempt = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(recoveredAttempt).toMatchObject({
      kind: "failed",
      code: "workspace_attachment_write_failed",
      details: { partial_effects: [{ branch, state: "git-prepared-attachment-failed" }] },
    });
    const common = await commonDirectory(repository, environment);
    const workspaceId = missionWorkspaceKey(common, await Fs.realpath(repository));
    const lockPath = Path.join(common, "kepler", "workspaces", workspaceId);
    const attachmentPath = Path.join(common, "kepler", "missions", missionId, "workspaces", `${workspaceId}.json`);
    expect(await Fs.access(lockPath).then(() => true, () => false)).toBe(false);
    expect(await Fs.access(attachmentPath).then(() => true, () => false)).toBe(false);
    expect(git(repository, environment, "branch", "--show-current")).toBe(branch);
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual(["construction.mission-created"]);
    failAttachmentWrite = false;

    const retried = await withGitEnvironment(environment, () => startup.prepare(repository, missionId));

    expect(retried).toMatchObject({ kind: "prepared", missionId, repositories: [{ branch }] });
    expect(await Fs.access(lockPath).then(() => true, () => false)).toBe(false);
    expect(await Fs.access(attachmentPath).then(() => true, () => false)).toBe(true);
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
  });

  it("serializes concurrent same-mission recovery and preserves one event per startup fact", async () => {
    const environment = await createEnvironment("same-mission-recovery");
    const repository = await createRepository(environment, "record-home");
    const linked = Path.join(environment.parent, "held-branch-worktree");
    git(repository, environment, "worktree", "add", "-q", "-b", "feature/recovery-held", linked, "main");
    const startup = createStartup(environment.parent);
    const interrupted = await withGitEnvironment(environment, () => startup.execute(repository, makeRequest("record-home", repository, {
      branch: { kind: "existing", name: "feature/recovery-held" },
    })));
    expect(interrupted).toMatchObject({ kind: "failed", code: "branch_switch_failed", details: { mission_id: expect.any(String) } });
    if (interrupted.kind !== "failed" || typeof interrupted.details.mission_id !== "string") return;
    const missionId = interrupted.details.mission_id;
    git(repository, environment, "worktree", "remove", linked);

    const results = await withGitEnvironment(environment, () => Promise.all([
      startup.prepare(repository, missionId),
      startup.prepare(repository, missionId),
    ]));
    expect(results.some((result) => result.kind === "prepared")).toBe(true);
    expect(results.every((result) => result.kind === "prepared" || result.code === "resource_contended")).toBe(true);
    expect(git(repository, environment, "branch", "--show-current")).toBe("feature/recovery-held");
    expect((await readEvents(repository, missionId)).map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
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
