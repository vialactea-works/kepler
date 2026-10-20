import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { execFile } from "node:child_process";
import { createContextRuntime, type ContextRuntime } from "./context.js";
import type { ProcessPort, ProcessResult } from "./runtime.js";

export interface TaskWorkspace {
  readonly root: string;
  readonly head: string;
  readonly ref: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
}

export interface TaskStateGit {
  readonly workspace: (cwd: string) => Promise<TaskWorkspace>;
  readonly clean: (cwd: string) => Promise<boolean>;
  readonly ancestor: (cwd: string, base: string, head: string) => Promise<boolean>;
  readonly validateRef: (cwd: string, ref: string) => Promise<boolean>;
  readonly resolve: (cwd: string, ref: string) => Promise<string>;
  readonly latest: (cwd: string, path: string) => Promise<string>;
  readonly commit: (cwd: string, path: string, message: string) => Promise<string>;
  readonly fastForward: (cwd: string, head: string) => Promise<ProcessResult>;
  readonly merge: (cwd: string, head: string) => Promise<ProcessResult>;
  readonly uniqueCommits: (cwd: string, head: string, excluded: string) => Promise<readonly string[]>;
  readonly changedPaths: (cwd: string, commit: string) => Promise<readonly string[]>;
  readonly blob: (cwd: string, commit: string, path: string) => Promise<ProcessResult>;
}

export interface TaskStateFiles {
  readonly realpath: (path: string) => Promise<string>;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, value: string) => Promise<void>;
  readonly lock: (path: string) => Promise<() => Promise<void>>;
}

export interface TaskStateRuntime {
  readonly cwd: () => string;
  readonly worker: () => string | undefined;
  readonly process: ProcessPort;
  readonly git: TaskStateGit;
  readonly files: TaskStateFiles;
  readonly context: ContextRuntime;
}

export const TASK_STATE_RUNTIME = Symbol("TASK_STATE_RUNTIME");

export const createTaskStateRuntime = (overrides: Partial<TaskStateRuntime> = {}): TaskStateRuntime => {
  const cwd = overrides.cwd ?? (() => process.cwd());
  const processPort: ProcessPort = overrides.process ?? {
    run: (command, args, directory) => new Promise<ProcessResult>((resolve) => {
      execFile(command, [...args], { cwd: directory, encoding: "utf8", env: { ...process.env } }, (error, stdout, stderr) => {
        resolve({ status: error === null ? 0 : typeof error.code === "number" ? error.code : -1, stdout, stderr });
      });
    }),
  };
  const query = async (directory: string, ...args: string[]): Promise<string> => {
    const result = await processPort.run("git", args, directory);
    if (result.status !== 0) throw new Error(result.stderr.trim() || `Git ${args[0] ?? "query"} failed`);
    return result.stdout.trim();
  };
  const git: TaskStateGit = overrides.git ?? {
    workspace: async (directory) => {
      const root = await Fs.realpath(await query(directory, "rev-parse", "--show-toplevel"));
      const [head, ref, gitDirectory, commonDirectory] = await Promise.all([
        query(root, "rev-parse", "--verify", "HEAD^{commit}"),
        query(root, "symbolic-ref", "--quiet", "HEAD"),
        query(root, "rev-parse", "--absolute-git-dir"),
        query(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
      ]);
      return { root, head, ref, gitDirectory: await Fs.realpath(gitDirectory), commonDirectory: await Fs.realpath(commonDirectory) };
    },
    clean: async (directory) => (await query(directory, "status", "--porcelain=v1", "--untracked-files=all")) === "",
    ancestor: async (directory, base, head) => {
      const result = await processPort.run("git", ["merge-base", "--is-ancestor", base, head], directory);
      if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr.trim() || "Git ancestry is unavailable");
      return result.status === 0;
    },
    validateRef: async (directory, ref) => (await processPort.run("git", ["check-ref-format", ref], directory)).status === 0,
    resolve: (directory, ref) => query(directory, "rev-parse", "--verify", `${ref}^{commit}`),
    latest: (directory, path) => query(directory, "log", "-1", "--format=%H", "HEAD", "--", path),
    commit: async (directory, path, message) => {
      await query(directory, "commit", "--only", "-m", message, "--", path);
      return query(directory, "rev-parse", "HEAD");
    },
    fastForward: async (directory, head) => processPort.run("git", ["merge", "--ff-only", head], directory),
    merge: async (directory, head) => processPort.run("git", ["merge", "--no-ff", "--no-edit", head], directory),
    uniqueCommits: async (directory, head, excluded) => (await query(directory, "rev-list", "--reverse", head, "--not", excluded)).split(/\r?\n/).filter(Boolean),
    changedPaths: async (directory, commit) => {
      const result = await processPort.run("git", ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-m", "-z", commit], directory);
      if (result.status !== 0) throw new Error(result.stderr || "Changed paths are unavailable");
      return result.stdout.split("\0").filter(Boolean);
    },
    blob: async (directory, commit, path) => processPort.run("git", ["show", `${commit}:${path}`], directory),
  };
  const files: TaskStateFiles = overrides.files ?? {
    realpath: (path) => Fs.realpath(path),
    readFile: (path) => Fs.readFile(path, "utf8"),
    writeFile: (path, value) => Fs.writeFile(path, value),
    lock: async (path) => {
      const handle = await Fs.open(path, "wx");
      const held = await handle.stat();
      return async () => {
        const current = await Fs.stat(path);
        await handle.close();
        if (held.ino !== current.ino || held.dev !== current.dev) throw new Error("Coordinator lock ownership changed; lock preserved");
        await Fs.unlink(path);
      };
    },
  };
  return { cwd, worker: overrides.worker ?? (() => process.env.PI_SESSION_ID), process: processPort, git, files, context: overrides.context ?? createContextRuntime({ cwd, process: processPort }) };
};
