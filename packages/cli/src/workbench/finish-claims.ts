import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { gitBlobAt, gitCommand, successful, text } from "./precondition-git.js";
import type { PreconditionRuntime } from "./precondition-runtime.js";

export const inspectVisibleFinishClaims = async (
  runtime: PreconditionRuntime,
  root: string,
  owningChange: string,
  binding: string,
  ownership: { readonly refs: readonly string[]; readonly worktrees: readonly string[] } = { refs: [], worktrees: [root] },
): Promise<readonly string[]> => {
  const problems = new Set<string>();
  const inspect = async (path: string, source: string, location: string) => {
    const parsed = await createArtifactReader({ readFile: () => source })(path);
    if (parsed._tag === "recognized" && parsed.metadata.route_unit === binding)
      problems.add(`competing visible route claim: ${location}`);
  };
  const refs = await gitCommand(runtime, ["for-each-ref", "--format=%(refname)", "refs/heads/", "refs/remotes/"], root);
  if (!successful(refs)) problems.add("visible branch claims cannot be inspected");
  else for (const ref of text(refs).split("\n").filter(Boolean)) {
    if (!/^refs\/(heads|remotes)\//.test(ref)) { problems.add("visible branch identity is invalid"); continue; }
    const files = await gitCommand(runtime, ["ls-tree", "-r", "--name-only", ref, "--", ".kepler/changes"], root);
    if (!successful(files)) { problems.add(`visible branch claims cannot be inspected: ${ref}`); continue; }
    for (const path of text(files).split("\n").filter(Boolean)) {
      const match = /^\.kepler\/changes\/([^/]+)\/(proposal|plan)\.md$/.exec(path);
      if (!match || match[1] === owningChange && ownership.refs.includes(ref)) continue;
      const blob = await gitBlobAt(runtime, root, ref, path);
      if (!successful(blob)) problems.add(`visible branch claim cannot be read: ${ref}:${path}`);
      else await inspect(Path.join(root, path), blob.stdout, `${ref}:${path}`);
    }
  }
  const worktrees = await gitCommand(runtime, ["worktree", "list", "--porcelain", "-z"], root);
  if (!successful(worktrees)) problems.add("visible worktree claims cannot be inspected");
  else for (const block of worktrees.stdout.split("\0\0").filter(Boolean)) {
    const entries = block.split("\0");
    const entry = entries.find((entry) => entry.startsWith("worktree "));
    if (!entry) { problems.add("visible worktree identity is missing"); continue; }
    const worktree = entry.slice("worktree ".length);
    const branch = entries.find((entry) => entry.startsWith("branch "))?.slice("branch ".length);
    const changes = Path.join(worktree, ".kepler/changes");
    if (!Path.isAbsolute(worktree)) { problems.add("visible worktree identity is invalid"); continue; }
    if (!(await runtime.fileSystem.directoryExists(changes))) continue;
    if (!runtime.fileSystem.readDirectory || !runtime.fileSystem.readFile) {
      problems.add("visible worktree claim reader is unavailable");
      continue;
    }
    try {
      const canonical = String(await runtime.fileSystem.realpath(changes));
      const knownOwner = branch !== undefined && ownership.refs.includes(branch) && ownership.worktrees.some((path) => Path.resolve(path) === Path.resolve(worktree));
      for (const name of await runtime.fileSystem.readDirectory(changes)) {
        if (name === owningChange && knownOwner) continue;
        const directory = Path.join(changes, name);
        if (!(await runtime.fileSystem.directoryExists(directory))) continue;
        if (!String(await runtime.fileSystem.realpath(directory)).startsWith(`${canonical}${Path.sep}`)) {
          problems.add(`visible claim directory escapes the change namespace: ${directory}`);
          continue;
        }
        for (const file of ["proposal.md", "plan.md"]) {
          const path = Path.join(directory, file);
          if (await runtime.fileSystem.pathExists(path))
            await inspect(path, String(await runtime.fileSystem.readFile(path)), path);
        }
      }
    } catch {
      problems.add(`visible worktree claims cannot be read: ${changes}`);
    }
  }
  return [...problems];
};
