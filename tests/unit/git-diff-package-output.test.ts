import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DiffPackageResolvedSource } from "../../packages/cli/src/construction/diff-package-source.js";
import { createNodeGitDiffPackageRuntime, GitDiffPackageAdapter } from "../../packages/cli/src/workbench/git-diff-package.js";

const temporaryRoots: string[] = [];

const source = (projectRoot: string): DiffPackageResolvedSource => ({
  scope: { kind: "unit-review", unitId: "unit-output-test", implementationAttemptId: "attempt-output-test" },
  projectRoot,
  missionId: "mission-output-test",
  recordHomeRepositoryId: "repo-main",
  workspaceRepositories: [],
  comparisons: [],
  taskDefinitions: [],
  upstreamVersions: [],
  sourceAttempts: [],
  activityEvidence: [],
  retainedScopes: [],
  integrationHistory: [],
  sourceRecords: [],
});

const createTemporaryRoot = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(await Fs.realpath(Os.tmpdir()), "kepler-diff-package-output-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  while (temporaryRoots.length > 0) await Fs.rm(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("GitDiffPackageAdapter output cleanup", () => {
  it("rejects a missing path that Git tracks before writing package content", async () => {
    const root = await createTemporaryRoot();
    const runtime = createNodeGitDiffPackageRuntime();
    const adapter = new GitDiffPackageAdapter({
      ...runtime,
      process: { run: async () => ({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) },
    });

    const result = await adapter.write(source(root), "complete package\n", "tracked-output.md");

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_output_tracked_path" });
    await expect(Fs.access(Path.join(root, "tracked-output.md"))).rejects.toThrow();
  });

  it("removes only a project-relative partial output it created", async () => {
    const root = await createTemporaryRoot();
    const sentinel = Path.join(root, "preserve.txt");
    await Fs.writeFile(sentinel, "unrelated content\n", "utf8");
    const runtime = createNodeGitDiffPackageRuntime();
    const writtenPaths: string[] = [];
    const removedPaths: string[] = [];
    const adapter = new GitDiffPackageAdapter({
      ...runtime,
      process: { run: async () => ({ status: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) },
      fileSystem: {
        ...runtime.fileSystem,
        writeExclusive: async (path) => {
          writtenPaths.push(path);
          await Fs.writeFile(path, "partial package\n", "utf8");
          return { kind: "failed", created: true, message: "injected write failure" };
        },
        removeFile: async (path) => {
          removedPaths.push(path);
          await runtime.fileSystem.removeFile(path);
        },
      },
    });

    const result = await adapter.write(source(root), "complete package\n", "package.md");

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_output_write_failed" });
    expect(writtenPaths).toEqual([Path.join(root, "package.md")]);
    expect(removedPaths).toEqual(writtenPaths);
    await expect(Fs.access(Path.join(root, "package.md"))).rejects.toThrow();
    expect(await Fs.readFile(sentinel, "utf8")).toBe("unrelated content\n");
  });

  it("removes only its fresh temporary directory after a partial temporary write", async () => {
    const root = await createTemporaryRoot();
    const sentinel = Path.join(root, "preserve.txt");
    await Fs.writeFile(sentinel, "unrelated content\n", "utf8");
    const runtime = createNodeGitDiffPackageRuntime({ temporaryDirectory: root });
    const createdDirectories: string[] = [];
    const writtenPaths: string[] = [];
    const removedFiles: string[] = [];
    const removedDirectories: string[] = [];
    const adapter = new GitDiffPackageAdapter({
      ...runtime,
      fileSystem: {
        ...runtime.fileSystem,
        createTemporaryDirectory: async (prefix) => {
          const directory = await runtime.fileSystem.createTemporaryDirectory(prefix);
          createdDirectories.push(directory);
          return directory;
        },
        writeExclusive: async (path) => {
          writtenPaths.push(path);
          await Fs.writeFile(path, "partial package\n", "utf8");
          return { kind: "failed", created: true, message: "injected write failure" };
        },
        removeFile: async (path) => {
          removedFiles.push(path);
          await runtime.fileSystem.removeFile(path);
        },
        removeTemporaryDirectory: async (path) => {
          removedDirectories.push(path);
          await runtime.fileSystem.removeTemporaryDirectory(path);
        },
      },
    });

    const result = await adapter.write(source(root), "complete package\n");

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_temporary_output_failed" });
    expect(createdDirectories).toHaveLength(1);
    expect(writtenPaths).toEqual([Path.join(createdDirectories[0]!, "package.md")]);
    expect(removedFiles).toEqual(writtenPaths);
    expect(removedDirectories).toEqual(createdDirectories);
    await expect(Fs.access(createdDirectories[0]!)).rejects.toThrow();
    expect(await Fs.readFile(sentinel, "utf8")).toBe("unrelated content\n");
  });

  it("preserves a file it did not create in a fresh temporary directory", async () => {
    const root = await createTemporaryRoot();
    const sentinel = Path.join(root, "preserve.txt");
    await Fs.writeFile(sentinel, "unrelated content\n", "utf8");
    const runtime = createNodeGitDiffPackageRuntime({ temporaryDirectory: root });
    const createdDirectories: string[] = [];
    const removedFiles: string[] = [];
    const adapter = new GitDiffPackageAdapter({
      ...runtime,
      fileSystem: {
        ...runtime.fileSystem,
        createTemporaryDirectory: async (prefix) => {
          const directory = await runtime.fileSystem.createTemporaryDirectory(prefix);
          createdDirectories.push(directory);
          return directory;
        },
        writeExclusive: async (path) => {
          await Fs.writeFile(path, "external package\n", "utf8");
          return { kind: "failed", created: false, message: "file already exists" };
        },
        removeFile: async (path) => {
          removedFiles.push(path);
          await runtime.fileSystem.removeFile(path);
        },
      },
    });

    const result = await adapter.write(source(root), "complete package\n");

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_output_cleanup_failed" });
    expect(removedFiles).toEqual([]);
    expect(await Fs.readFile(Path.join(createdDirectories[0]!, "package.md"), "utf8")).toBe("external package\n");
    expect(await Fs.readFile(sentinel, "utf8")).toBe("unrelated content\n");
  });
});
