import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";
import { createProjectSelectionRuntime } from "../../packages/cli/src/cli/project-selection-runtime.js";

const directories: string[] = [];
const gitEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_WORK_TREE: undefined,
};

const createDirectory = async (name: string): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), `kepler-project-${name}-`));
  directories.push(root);
  return root;
};

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnvironment,
  });

const createProject = async (parent: string, name: string): Promise<string> => {
  const repository = Path.join(parent, name);
  await Fs.mkdir(repository, { recursive: true });
  git(repository, "init", "-q", "-b", "main");
  git(repository, "config", "user.name", "Project Resolver Test");
  git(repository, "config", "user.email", "project-resolver@example.invalid");
  await Fs.mkdir(Path.join(repository, ".kepler"));
  await Fs.writeFile(Path.join(repository, ".kepler", "marker"), "v3\n");
  await Fs.writeFile(Path.join(repository, "README.md"), "# Project\n");
  git(repository, "add", ".");
  git(repository, "commit", "-q", "-m", "Create project fixture");
  return repository;
};

const treeSnapshot = async (root: string): Promise<string> => {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await Fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, child.name);
      const relative = Path.relative(root, path);
      entries.push(`${relative}:${child.isDirectory() ? "directory" : "file"}`);
      if (child.isDirectory()) await visit(path);
    }
  };
  await visit(root);
  return entries.join("\n");
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      Fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("ProjectResolver with Git and the filesystem", () => {
  it("resolves the invocation cwd and relative --project paths without modifying the repository", async () => {
    const parent = await createDirectory("relative");
    const repository = await createProject(parent, "record-home");
    const invocation = Path.join(parent, "caller");
    await Fs.mkdir(invocation);
    const before = await treeSnapshot(repository);
    const resolver = new ProjectResolver(
      createProjectSelectionRuntime({ cwd: () => invocation }),
    );

    await expect(resolver.resolve("../record-home")).resolves.toEqual({
      kind: "resolved",
      root: await Fs.realpath(repository),
    });
    expect(await treeSnapshot(repository)).toBe(before);

    await expect(
      new ProjectResolver(createProjectSelectionRuntime({ cwd: () => repository })).resolve(),
    ).resolves.toEqual({
      kind: "resolved",
      root: await Fs.realpath(repository),
    });
  });

  it("ignores Git environment variables that redirect repository selection", async () => {
    const parent = await createDirectory("git-environment");
    const repository = await createProject(parent, "project");
    const names = [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
    ] as const;
    const original = new Map(names.map((name) => [name, process.env[name]]));
    process.env.GIT_DIR = Path.join(parent, "external.git");
    process.env.GIT_WORK_TREE = Path.join(parent, "external-worktree");
    process.env.GIT_COMMON_DIR = Path.join(parent, "external-common.git");
    process.env.GIT_INDEX_FILE = Path.join(parent, "external-index");

    try {
      await expect(
        new ProjectResolver(
          createProjectSelectionRuntime({ cwd: () => repository }),
        ).resolve(),
      ).resolves.toEqual({
        kind: "resolved",
        root: await Fs.realpath(repository),
      });
    } finally {
      for (const name of names) {
        const value = original.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("accepts linked worktrees whose .git entry is a file", async () => {
    const parent = await createDirectory("worktree");
    const repository = await createProject(parent, "main");
    const linked = Path.join(parent, "linked");
    git(repository, "worktree", "add", "-q", "-b", "linked-branch", linked);
    expect((await Fs.lstat(Path.join(linked, ".git"))).isFile()).toBe(true);

    await expect(
      new ProjectResolver(createProjectSelectionRuntime({ cwd: () => linked })).resolve(),
    ).resolves.toEqual({
      kind: "resolved",
      root: await Fs.realpath(linked),
    });
  });

  it("rejects nested paths, bare repositories, missing .kepler directories, and non-Git directories without creating state", async () => {
    const parent = await createDirectory("invalid");
    const repository = await createProject(parent, "repository");
    const nested = Path.join(repository, ".kepler");
    const bare = Path.join(parent, "bare.git");
    git(parent, "init", "--bare", "-q", bare);
    const plain = Path.join(parent, "plain");
    await Fs.mkdir(plain);
    await Fs.writeFile(Path.join(plain, "note.txt"), "untouched\n");
    const plainBefore = await treeSnapshot(plain);

    const nestedResult = await new ProjectResolver(
      createProjectSelectionRuntime({ cwd: () => nested }),
    ).resolve();
    expect(nestedResult).toMatchObject({
      kind: "failed",
      code: "project_not_root",
    });

    const bareResult = await new ProjectResolver(
      createProjectSelectionRuntime({ cwd: () => bare }),
    ).resolve();
    expect(bareResult).toMatchObject({ kind: "failed", code: "bare_repository" });

    const missingMarker = Path.join(parent, "missing-marker");
    await Fs.mkdir(missingMarker);
    git(missingMarker, "init", "-q", "-b", "main");
    const missingResult = await new ProjectResolver(
      createProjectSelectionRuntime({ cwd: () => missingMarker }),
    ).resolve();
    expect(missingResult).toMatchObject({
      kind: "failed",
      code: "kepler_directory_missing",
    });
    expect(await Fs.access(Path.join(missingMarker, ".kepler")).then(() => true, () => false)).toBe(false);

    const plainResult = await new ProjectResolver(
      createProjectSelectionRuntime({ cwd: () => plain }),
    ).resolve();
    expect(plainResult).toMatchObject({
      kind: "failed",
      code: "project_not_worktree",
    });
    expect(await treeSnapshot(plain)).toBe(plainBefore);
    expect(await Fs.lstat(Path.join(repository, ".git")).then((stat) => stat.isDirectory())).toBe(true);
  });
});
