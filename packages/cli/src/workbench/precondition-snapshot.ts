import { createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { nativeProcessEnvironment, type ProcessResult } from "./runtime.js";
import type { PreconditionGitPort, PreconditionRuntime } from "./precondition-runtime.js";
import { fullCommit, gitBlobAt, gitCommitFiles, gitFirstParent, gitIsAncestor, gitResolveCommit } from "./precondition-git.js";

export type GitInterpretationEpoch = (root: string) => string | undefined | Promise<string | undefined>;

const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const nativeEpoch = (runtime: PreconditionRuntime): GitInterpretationEpoch => {
  const environment = nativeProcessEnvironment(runtime.process);
  if (environment === undefined || [runtime.git.blobAt, runtime.git.firstParent, runtime.git.resolveCommit, runtime.git.isAncestor, runtime.git.commitFiles].some(Boolean))
    return () => undefined;
  const roots = new Map<string, { locator: string; paths: readonly string[] }>();
  return async (root) => {
    try {
      if (["GIT_REPLACE_REF_BASE", "GIT_GRAFT_FILE", "GIT_SHALLOW_FILE", "GIT_NAMESPACE", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"].some((name) => environment[name] !== undefined))
        return undefined;
      const gitPath = Path.join(root, ".git");
      const stat = await Fs.stat(gitPath);
      if (!stat.isDirectory()) return undefined;
      try { await Fs.stat(Path.join(gitPath, "commondir")); return undefined; } catch (error) { if (!missing(error)) throw error; }
      const locator = JSON.stringify([await Fs.realpath(gitPath), stat.dev, stat.ino]);
      let scope = roots.get(root);
      if (scope?.locator !== locator) {
        const resolved = await runtime.process.run("git", ["rev-parse", "--path-format=absolute", "--absolute-git-dir", ...["shallow", "info/grafts", "refs", "packed-refs", "config", "config.worktree", "reftable"].flatMap((path) => ["--git-path", path])], root);
        const paths = resolved.stdout.trim().split("\n");
        if (resolved.status !== 0 || paths.length !== 8 || paths.some((path) => !Path.isAbsolute(path))) return undefined;
        scope = { locator, paths };
        roots.set(root, scope);
      }
      const [gitDirectory, shallow, grafts, refs, packed, config, worktreeConfig, reftable] = scope.paths;
      for (const path of [shallow, grafts, reftable]) {
        try { await Fs.stat(path); return undefined; } catch (error) { if (!missing(error)) throw error; }
      }
      const digest = createHash("sha256").update(locator);
      const add = async (path: string): Promise<void> => {
        digest.update(JSON.stringify(path));
        let stat;
        try { stat = await Fs.stat(path); } catch (error) { if (missing(error)) { digest.update("missing"); return; } throw error; }
        if (stat.isDirectory()) {
          const entries = (await Fs.readdir(path)).sort();
          digest.update(JSON.stringify(entries));
          for (const entry of entries) await add(Path.join(path, entry));
        } else {
          digest.update(await Fs.readFile(path));
        }
      };
      for (const directory of new Set([refs, Path.join(gitDirectory, "refs")])) {
        const replacements = Path.join(directory, "replace");
        try {
          if ((await Fs.readdir(replacements)).length !== 0) return undefined;
        } catch (error) { if (!missing(error)) throw error; }
        await add(directory);
      }
      try {
        if (/\srefs\/replace\//.test(await Fs.readFile(packed, "utf8"))) return undefined;
      } catch (error) { if (!missing(error)) throw error; }
      for (const path of [packed, config, worktreeConfig]) await add(path);
      return digest.digest("hex");
    } catch {
      return undefined;
    }
  };
};

const copy = (result: ProcessResult): ProcessResult => ({ status: result.status, stdout: result.stdout, stderr: result.stderr });

export const createPreconditionSnapshotRuntime = (
  runtime: PreconditionRuntime,
  readEpoch: GitInterpretationEpoch = nativeEpoch(runtime),
): PreconditionRuntime => {
  const reads = new Map<string, Promise<ProcessResult>>();
  const epochAt = async (root: string): Promise<string | undefined> => {
    try { const epoch = await readEpoch(root); return epoch || undefined; } catch { return undefined; }
  };
  const remember = async (
    operation: string,
    root: string,
    revisions: readonly string[],
    paths: readonly string[],
    read: () => ProcessResult | Promise<ProcessResult>,
  ): Promise<ProcessResult> => {
    if (!revisions.every(fullCommit)) return copy(await read());
    const epoch = await epochAt(root);
    if (epoch === undefined) return copy(await read());
    const key = JSON.stringify([operation, root, epoch, revisions, paths]);
    let pending = reads.get(key);
    if (!pending) {
      pending = Promise.resolve().then(read).then(async (result) => {
        const snapshot = copy(result);
        if (snapshot.status !== 0 || await epochAt(root) !== epoch) reads.delete(key);
        return snapshot;
      }, (error: unknown) => {
        reads.delete(key);
        throw error;
      });
      reads.set(key, pending);
    }
    const result = await pending;
    if (await epochAt(root) !== epoch) {
      reads.delete(key);
      return copy(await read());
    }
    return copy(result);
  };
  const git: PreconditionGitPort = {
    ...runtime.git,
    repositoryRoot: runtime.git.repositoryRoot.bind(runtime.git),
    statusPorcelain: runtime.git.statusPorcelain.bind(runtime.git),
    blobAt: (root, commit, path) => remember("blob", root, [commit], [path], () => gitBlobAt(runtime, root, commit, path)),
    firstParent: (root, commit) => remember("parent", root, [commit], [], () => gitFirstParent(runtime, root, commit)),
    resolveCommit: (root, reference) => remember("resolve", root, [reference], [], () => gitResolveCommit(runtime, root, reference)),
    isAncestor: (root, base, head) => remember("ancestor", root, [base, head], [], () => gitIsAncestor(runtime, root, base, head)),
    commitFiles: (root, commit) => remember("files", root, [commit], [], () => gitCommitFiles(runtime, root, commit)),
  };
  for (const key of ["currentHead", "currentBranch", "worktreeIdentity", "pathHistory", "headBlob", "worktreeBlob", "stagedDiff", "latestCommit", "latestMaterialCommit"] as const) {
    const method = runtime.git[key];
    if (method) Object.assign(git, { [key]: method.bind(runtime.git) });
  }
  return { ...runtime, git };
};
