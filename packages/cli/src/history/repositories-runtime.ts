import * as Path from "node:path";
import type { MissionWorkspaceRuntime } from "../construction/mission-workspace.js";
import { missionWorkspaceKey } from "../construction/mission-workspace.js";
import { HistoryError } from "./control.js";
import type { HistoryOrigin, HistoryRepositories, HistoryRepositoryContext } from "./files.js";

const pathOutput = (value: string): string => value.endsWith("\n") ? value.slice(0, -1) : value;

export const createHistoryRepositories = (workspace: Pick<MissionWorkspaceRuntime, "git" | "fileSystem">): HistoryRepositories => ({
  resolve: async (selected) => {
    const recordHome = await workspace.fileSystem.realpath(selected);
    if (await workspace.fileSystem.pathKind(recordHome) !== "directory") throw new HistoryError("history_project_invalid", "The record home must be an existing Git working-tree root.");
    const run = async (root: string, args: readonly string[]): Promise<string> => {
      const result = await workspace.git.run(root, args);
      if (result.status !== 0) throw new HistoryError("history_repository_unavailable", "Git could not resolve the exact history repository.", { command: ["git", ...args], stderr: result.stderr.trim() });
      return result.stdout;
    };
    if ((await run(recordHome, ["rev-parse", "--is-bare-repository"])).trim() !== "false") throw new HistoryError("history_project_invalid", "History requires a non-bare Git working tree.");
    const root = await workspace.fileSystem.realpath(pathOutput(await run(recordHome, ["rev-parse", "--show-toplevel"])));
    if (root !== recordHome || await workspace.fileSystem.pathKind(Path.join(root, ".kepler")) !== "directory") throw new HistoryError("history_project_invalid", "Select the exact prepared record-home root without initializing another home.");
    const commonDirectory = await workspace.fileSystem.realpath(Path.resolve(root, pathOutput(await run(root, ["rev-parse", "--git-common-dir"]))));
    const raw = await run(root, ["worktree", "list", "--porcelain", "-z"]);
    const paths = raw.split("\0").filter((part) => part.startsWith("worktree ")).map((part) => part.slice(9));
    const origins: HistoryOrigin[] = [{ id: `worktree:${missionWorkspaceKey(commonDirectory, root)}`, label: "record-home", root }];
    const unavailableOrigins: HistoryRepositoryContext["unavailableOrigins"][number][] = [];
    const seen = new Set<string>([root]);
    for (const path of paths) {
      try {
        const canonical = await workspace.fileSystem.realpath(path);
        if (seen.has(canonical)) continue;
        const peerRoot = await workspace.fileSystem.realpath(pathOutput(await run(canonical, ["rev-parse", "--show-toplevel"])));
        const peerCommon = await workspace.fileSystem.realpath(Path.resolve(canonical, pathOutput(await run(canonical, ["rev-parse", "--git-common-dir"]))));
        if (peerRoot !== canonical || peerCommon !== commonDirectory) throw new HistoryError("history_origin_mismatch", "A registered working-copy path now identifies another repository.");
        const id = `worktree:${missionWorkspaceKey(commonDirectory, canonical)}`;
        origins.push({ id, label: id, root: canonical });
        seen.add(canonical);
      } catch (error) {
        const kind = await workspace.fileSystem.pathKind(path).catch(() => "other" as const);
        unavailableOrigins.push({ id: `worktree:${missionWorkspaceKey(commonDirectory, path)}`, path, kind: kind === "missing" ? "missing" : kind === "symlink" ? "unsafe" : "unreadable", reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return { recordHome: root, commonDirectory, origins, unavailableOrigins };
  },
});
