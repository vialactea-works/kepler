import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MissionHandoffPreflight } from "../../packages/cli/src/construction/mission-handoff-preflight.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";

const roots: string[] = [];
const missionId = "10000000-0000-4000-8000-000000000001";

const environmentFor = (globalConfig: string): NodeJS.ProcessEnv => {
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

const runGit = (cwd: string, globalConfig: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: environmentFor(globalConfig) }).trim();

const createRepository = async (parent: string, globalConfig: string, name: string): Promise<string> => {
  const root = Path.join(parent, name);
  await Fs.mkdir(root);
  runGit(root, globalConfig, "init", "-q", "-b", "main");
  runGit(root, globalConfig, "config", "user.name", "Kepler Handoff Test");
  runGit(root, globalConfig, "config", "user.email", "kepler-handoff@example.invalid");
  await Fs.writeFile(Path.join(root, "README.md"), `# ${name}\n`);
  runGit(root, globalConfig, "add", ".");
  runGit(root, globalConfig, "commit", "-q", "-m", `Create ${name}`);
  return root;
};

const withGitEnvironment = async <T>(globalConfig: string, operation: () => Promise<T>): Promise<T> => {
  const environment = environmentFor(globalConfig);
  const names = [
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
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    const value = environment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await operation();
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("mission handoff Git object preflight", () => {
  it("accepts reachable checkpoints and required objects from linked worktrees without changing refs", async () => {
    const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-handoff-ready-"));
    roots.push(parent);
    const globalConfig = Path.join(parent, "empty-global-config");
    await Fs.writeFile(globalConfig, "");
    const repository = await createRepository(parent, globalConfig, "application");
    const linked = Path.join(parent, "linked-worktree");
    runGit(repository, globalConfig, "worktree", "add", "-q", "--detach", linked, "main");
    const commit = runGit(repository, globalConfig, "rev-parse", "HEAD");
    const blob = runGit(repository, globalConfig, "rev-parse", "HEAD:README.md");
    const refsBefore = runGit(repository, globalConfig, "show-ref");
    const runtime = createNodeMissionWorkspaceRuntime({ cwd: parent });
    const calls: string[][] = [];
    const preflight = new MissionHandoffPreflight({
      fileSystem: runtime.fileSystem,
      git: {
        run: async (cwd, args) => {
          calls.push(["git", ...args]);
          return runtime.git.run(cwd, args);
        },
        findReachableObjects: async (cwd, objectIds) => {
          calls.push(["git", "rev-list", "--objects", "--all"]);
          return runtime.git.findReachableObjects(cwd, objectIds);
        },
      },
    });

    const result = await withGitEnvironment(globalConfig, () => preflight.execute({
      mission_id: missionId,
      handoff_id: "ready-handoff",
      required_objects: [
        { repository_id: "application", repository_path: repository, object_id: commit, object_kind: "commit" },
        { repository_id: "application", repository_path: linked, object_id: blob, object_kind: "object" },
      ],
    }));

    expect(result).toMatchObject({
      kind: "ready",
      mission_id: missionId,
      handoff_id: "ready-handoff",
      verified_objects: [
        { repository_id: "application", object_id: commit, object_kind: "commit", resolved_kind: "commit" },
        { repository_id: "application", object_id: blob, object_kind: "object", resolved_kind: "blob" },
      ],
    });
    expect(calls.every((args) => !["fetch", "push", "commit", "update-ref", "checkout", "reset"].includes(args[1]!))).toBe(true);
    expect(runGit(repository, globalConfig, "show-ref")).toBe(refsBefore);
  });

  it("streams reachability when a real repository listing exceeds execFile's default buffer", async () => {
    const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-handoff-large-listing-"));
    roots.push(parent);
    const globalConfig = Path.join(parent, "empty-global-config");
    await Fs.writeFile(globalConfig, "");
    const repository = await createRepository(parent, globalConfig, "application");
    const objectsDirectory = Path.join(repository, "objects");
    await Fs.mkdir(objectsDirectory);
    const objectFiles = Array.from({ length: 8000 }, (_, index) => Path.join(
      objectsDirectory,
      `blob-${String(index).padStart(5, "0")}-${"x".repeat(100)}`,
    ));
    for (let offset = 0; offset < objectFiles.length; offset += 128) {
      await Promise.all(objectFiles.slice(offset, offset + 128).map(async (path, index) => {
        await Fs.writeFile(path, `object ${offset + index}\n`);
      }));
    }
    runGit(repository, globalConfig, "add", "--", "objects");
    runGit(repository, globalConfig, "commit", "-q", "-m", "Add many reachable objects");
    const listing = execFileSync("git", ["rev-list", "--objects", "--all"], {
      cwd: repository,
      encoding: "utf8",
      env: environmentFor(globalConfig),
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(Buffer.byteLength(listing, "utf8")).toBeGreaterThan(1024 * 1024);
    const commit = runGit(repository, globalConfig, "rev-parse", "HEAD");
    const objectPath = Path.relative(repository, objectFiles[0]!).split(Path.sep).join("/");
    const blob = runGit(repository, globalConfig, "rev-parse", `HEAD:${objectPath}`);
    const preflight = new MissionHandoffPreflight(createNodeMissionWorkspaceRuntime({ cwd: parent }));

    const result = await withGitEnvironment(globalConfig, () => preflight.execute({
      mission_id: missionId,
      handoff_id: "large-listing-handoff",
      required_objects: [
        { repository_id: "application", repository_path: repository, object_id: commit, object_kind: "commit" },
        { repository_id: "application", repository_path: repository, object_id: blob, object_kind: "object" },
      ],
    }));

    expect(result).toMatchObject({
      kind: "ready",
      handoff_id: "large-listing-handoff",
      verified_objects: [
        { object_id: commit, object_kind: "commit", resolved_kind: "commit" },
        { object_id: blob, object_kind: "object", resolved_kind: "blob" },
      ],
    });
  });

  it("fails only the affected handoff for missing or unreachable material and leaves Git state untouched", async () => {
    const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-handoff-missing-"));
    roots.push(parent);
    const globalConfig = Path.join(parent, "empty-global-config");
    await Fs.writeFile(globalConfig, "");
    const repository = await createRepository(parent, globalConfig, "application");
    const unrelated = await createRepository(parent, globalConfig, "unrelated");
    const commit = runGit(repository, globalConfig, "rev-parse", "HEAD");
    runGit(repository, globalConfig, "switch", "-q", "-c", "unreferenced");
    await Fs.writeFile(Path.join(repository, "unreferenced.txt"), "retain this object\n");
    runGit(repository, globalConfig, "add", ".");
    runGit(repository, globalConfig, "commit", "-q", "-m", "Create unreferenced material");
    const unreachable = runGit(repository, globalConfig, "rev-parse", "HEAD");
    runGit(repository, globalConfig, "switch", "-q", "main");
    runGit(repository, globalConfig, "branch", "-D", "unreferenced");
    const missing = "f".repeat(40);
    const refsBefore = runGit(repository, globalConfig, "show-ref");
    const runtime = createNodeMissionWorkspaceRuntime({ cwd: parent });
    const preflight = new MissionHandoffPreflight(runtime);

    const [affected, independent] = await withGitEnvironment(globalConfig, () => Promise.all([
      preflight.execute({
        mission_id: missionId,
        handoff_id: "affected-handoff",
        required_objects: [
          { repository_id: "application", repository_path: repository, object_id: missing, object_kind: "commit" },
          { repository_id: "application", repository_path: repository, object_id: unreachable, object_kind: "commit" },
        ],
      }),
      preflight.execute({
        mission_id: missionId,
        handoff_id: "independent-handoff",
        required_objects: [{ repository_id: "unrelated", repository_path: unrelated, object_id: runGit(unrelated, globalConfig, "rev-parse", "HEAD"), object_kind: "commit" }],
      }),
    ]));

    expect(affected).toMatchObject({
      kind: "failed",
      code: "handoff_material_unavailable",
      details: {
        mission_id: missionId,
        handoff_id: "affected-handoff",
        failures: [
          { repository_id: "application", object_id: missing, reason: "object_missing" },
          { repository_id: "application", object_id: unreachable, reason: "object_unreachable" },
        ],
      },
    });
    expect(independent).toMatchObject({ kind: "ready", handoff_id: "independent-handoff" });
    expect(runGit(repository, globalConfig, "show-ref")).toBe(refsBefore);
    expect(runGit(repository, globalConfig, "cat-file", "-t", unreachable)).toBe("commit");
    expect(runGit(repository, globalConfig, "cat-file", "-t", commit)).toBe("commit");
  });
});
