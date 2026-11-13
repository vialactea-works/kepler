import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { createNodeHistoryAccess } from "../../packages/cli/src/history/access-runtime.js";
import { historyGenerationFixture } from "./history-generation.js";
import { historyStorageEntries } from "./history-storage.js";

export const createHistoryRepository = async () => {
  const parent = await Fs.realpath(await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-history-repository-")));
  try {
    const config = Path.join(parent, "empty-git-config");
    await Fs.writeFile(config, "");
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Kepler History Test", GIT_AUTHOR_EMAIL: "history@example.invalid", GIT_COMMITTER_NAME: "Kepler History Test", GIT_COMMITTER_EMAIL: "history@example.invalid" };
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_CONFIG_PARAMETERS"] as const) delete env[key];
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" });
    const root = Path.join(parent, "record");
    await Fs.mkdir(root);
    git(root, "init", "-q", "-b", "main");
    await Fs.mkdir(Path.join(root, ".kepler"));
    await Fs.writeFile(Path.join(root, ".kepler", "marker"), "prepared\n");
    const f = historyGenerationFixture();
    const access = createNodeHistoryAccess(createNodeMissionWorkspaceRuntime({ cwd: root }));
    const install = async (target: string) => {
      for (const [path, bytes] of historyStorageEntries(f, target)) await access.storage.files.write({ root: target, relative: Path.relative(target, path).split(Path.sep).join("/") }, bytes, { kind: "create" });
    };
    await install(root);
    return { parent, root, git, f, access, install };
  } catch (error) {
    await Fs.rm(parent, { recursive: true, force: true });
    throw error;
  }
};
