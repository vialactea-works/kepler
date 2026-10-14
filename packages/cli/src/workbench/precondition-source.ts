import * as Path from "node:path";
import type { HistoricalAdmissionSource, PreconditionRuntime } from "./precondition-runtime.js";
import { gitBlobAt, gitCommand, relativePath, successful } from "./precondition-git.js";

export const historicalAdmissionRuntime = (
  runtime: PreconditionRuntime,
  source: HistoricalAdmissionSource,
): PreconditionRuntime => {
  const view: PreconditionRuntime = {
    ...runtime,
    admissionSource: source,
    git: {
      repositoryRoot: runtime.git.repositoryRoot,
      statusPorcelain: runtime.git.statusPorcelain,
    },
    fileSystem: {
      realpath: (path) => Path.resolve(path) === source.sourceRoot ? source.sourceRoot : runtime.fileSystem.realpath(path),
      pathExists: async (path) => successful(await gitBlobAt(view, source.sourceRoot, source.revision, relativePath(source.sourceRoot, path))),
      directoryExists: async (path) => {
        const entry = await gitCommand(view, ["ls-tree", source.revision, "--", relativePath(source.sourceRoot, path)], source.sourceRoot);
        return successful(entry) && /^040000 tree /.test(entry.stdout);
      },
      readFile: async (path) => {
        const relative = relativePath(source.sourceRoot, path);
        if (relative.startsWith("../") || Path.isAbsolute(relative)) throw new Error("historical artifact escapes source root");
        const blob = await gitBlobAt(view, source.sourceRoot, source.revision, relative);
        if (!successful(blob)) throw new Error("historical artifact is unavailable");
        return blob.stdout;
      },
      readDirectory: async (path) => {
        const relative = relativePath(source.sourceRoot, path);
        const entries = await gitCommand(view, ["ls-tree", "--name-only", `${source.revision}:${relative}`], source.sourceRoot);
        if (!successful(entries)) throw new Error("historical artifact directory is unavailable");
        return entries.stdout.trim().split(/\r?\n/).filter(Boolean);
      },
    },
  };
  return view;
};
