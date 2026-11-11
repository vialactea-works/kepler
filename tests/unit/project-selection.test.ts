import { describe, expect, it } from "vitest";
import {
  ProjectResolver,
  type ProjectSelectionRuntime,
} from "../../packages/cli/src/cli/project-selection.js";

interface RuntimeOptions {
  readonly cwd?: string;
  readonly directories?: readonly string[];
  readonly realpaths?: Readonly<Record<string, string>>;
  readonly bareStatus?: number;
  readonly bareOutput?: string;
  readonly rootStatus?: number;
  readonly rootOutput?: string;
}

const createRuntime = (options: RuntimeOptions = {}) => {
  const directories = new Set(options.directories ?? [
    "/workspace/repo",
    "/workspace/repo/.kepler",
  ]);
  const calls: string[] = [];
  const runtime: ProjectSelectionRuntime = {
    cwd: () => options.cwd ?? "/workspace/repo",
    fileSystem: {
      realpath: async (path) => {
        calls.push(`realpath:${path}`);
        if (options.realpaths && path in options.realpaths) {
          return options.realpaths[path] as string;
        }
        if (directories.has(path)) return path;
        throw new Error("path not found");
      },
      directoryExists: async (path) => {
        calls.push(`directory:${path}`);
        return directories.has(path);
      },
    },
    git: {
      isBareRepository: async (cwd) => {
        calls.push(`bare:${cwd}`);
        return {
          status: options.bareStatus ?? 0,
          stdout: options.bareOutput ?? "false\n",
          stderr: "",
        };
      },
      repositoryRoot: async (cwd) => {
        calls.push(`root:${cwd}`);
        return {
          status: options.rootStatus ?? 0,
          stdout: options.rootOutput ?? "/workspace/repo\n",
          stderr: "",
        };
      },
      configValue: async () => ({ status: 1, stdout: "", stderr: "" }),
    },
  };
  return { runtime, calls };
};

describe("ProjectResolver", () => {
  it("selects the invocation directory when --project is absent", async () => {
    const { runtime } = createRuntime();

    await expect(new ProjectResolver(runtime).resolve()).resolves.toEqual({
      kind: "resolved",
      root: "/workspace/repo",
    });
  });

  it("resolves relative --project paths from the invocation directory", async () => {
    const { runtime, calls } = createRuntime({
      cwd: "/workspace/caller",
      directories: [
        "/workspace/caller",
        "/workspace/repo",
        "/workspace/repo/.kepler",
      ],
    });

    await expect(new ProjectResolver(runtime).resolve("../repo")).resolves.toEqual({
      kind: "resolved",
      root: "/workspace/repo",
    });
    expect(calls).toContain("realpath:/workspace/repo");
  });

  it.each([
    {
      name: "rejects an empty project selector",
      options: {},
      project: "",
      code: "invalid_project_path",
    },
    {
      name: "rejects a missing project directory",
      options: {},
      project: "/workspace/missing",
      code: "invalid_project_path",
    },
    {
      name: "rejects a non-directory project path",
      options: {
        directories: ["/workspace/repo", "/workspace/repo/.kepler"],
        realpaths: { "/workspace/repo/file.md": "/workspace/repo/file.md" } as Readonly<Record<string, string>>,
      },
      project: "/workspace/repo/file.md",
      code: "project_not_directory",
    },
    {
      name: "rejects a directory outside a Git worktree",
      options: { bareStatus: 128 },
      project: undefined,
      code: "project_not_worktree",
    },
    {
      name: "rejects bare repositories",
      options: { bareOutput: "true\n" },
      project: undefined,
      code: "bare_repository",
    },
    {
      name: "rejects paths nested inside a worktree",
      options: {
        cwd: "/workspace/repo/nested",
        directories: [
          "/workspace/repo",
          "/workspace/repo/.kepler",
          "/workspace/repo/nested",
        ],
      },
      project: undefined,
      code: "project_not_root",
    },
    {
      name: "requires an existing .kepler directory",
      options: { directories: ["/workspace/repo"] },
      project: undefined,
      code: "kepler_directory_missing",
    },
    {
      name: "rejects a .kepler path resolved outside the worktree",
      options: {
        realpaths: { "/workspace/repo/.kepler": "/outside/.kepler" },
      },
      project: undefined,
      code: "kepler_directory_not_local",
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly options: RuntimeOptions;
    readonly project: string | undefined;
    readonly code: string;
  }>)("$name", async ({ options, project, code }) => {
    const { runtime } = createRuntime(options);

    const result = await new ProjectResolver(runtime).resolve(project);

    expect(result).toMatchObject({ kind: "failed", code });
  });

  it("does not expose mutation methods to project resolution", async () => {
    const { runtime, calls } = createRuntime();

    await new ProjectResolver(runtime).resolve();

    expect(calls.every((call) => /^(realpath|directory|bare|root):/.test(call))).toBe(true);
  });
});
