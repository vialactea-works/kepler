import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { createNodeHistoryFiles } from "../../packages/cli/src/history/files-runtime.js";
import { createHistoryRepositories } from "../../packages/cli/src/history/repositories-runtime.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyGenerationFixture } from "../support/history-generation.js";
import { historyStorageEntries } from "../support/history-storage.js";

const roots: string[] = [];
const fixture = async () => {
  const parent = await Fs.realpath(await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-history-storage-")));
  roots.push(parent);
  const config = Path.join(parent, "empty-git-config");
  await Fs.writeFile(config, "");
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Kepler History Test", GIT_AUTHOR_EMAIL: "history@example.invalid", GIT_COMMITTER_NAME: "Kepler History Test", GIT_COMMITTER_EMAIL: "history@example.invalid" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_CONFIG_PARAMETERS"] as const) delete environment[key];
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: environment, encoding: "utf8" });
  const root = Path.join(parent, "record");
  await Fs.mkdir(root);
  git(root, "init", "-q", "-b", "main");
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "prepared\n");
  return { parent, root, git };
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

describe("history repository and filesystem collaboration", () => {
  it("reads the selected generation without parsing an unsafe excluded legacy source or acquiring ownership", async () => {
    const { root } = await fixture();
    const f = historyGenerationFixture();
    const files = createNodeHistoryFiles();
    for (const [path, bytes] of historyStorageEntries(f, root)) await files.write({ root, relative: Path.relative(root, path).split(Path.sep).join("/") }, bytes, { kind: "create" });
    const legacy = Path.join(root, ".kepler", "missions", f.missionId, "history", "construction");
    await Fs.symlink(Path.join(root, "absent-excluded-source"), legacy, "dir");
    const storage = new HistoryStorage(files, createHistoryRepositories(createNodeMissionWorkspaceRuntime({ cwd: root })));
    const before = await storage.snapshot(root, f.missionId);
    const selected = await storage.read(root, f.missionId);
    const after = await storage.snapshot(root, f.missionId);
    expect(selected.mode).toBe("active");
    expect(selected.history.events).toHaveLength(3);
    expect(historyInventory(after)).toEqual(historyInventory(before));
    expect(before.unavailable).toContainEqual(expect.objectContaining({ kind: "unsafe", path: `.kepler/missions/${f.missionId}/history/construction` }));
    await expect(Fs.lstat(Path.join(root, ".git", "kepler"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discovers the real shared directory and distinct working copies with exact path bytes", async () => {
    const { parent, root, git } = await fixture();
    git(root, "add", ".kepler/marker");
    git(root, "commit", "-q", "-m", "Create isolated history fixture");
    const peer = Path.join(parent, "peer with spaces\nand a final newline\n");
    git(root, "worktree", "add", "-q", "-b", "peer", peer);
    const repositories = createHistoryRepositories(createNodeMissionWorkspaceRuntime({ cwd: root }));
    const primary = await repositories.resolve(root);
    const secondary = await repositories.resolve(peer);
    expect(primary.commonDirectory).toBe(await Fs.realpath(Path.join(root, ".git")));
    expect(secondary.commonDirectory).toBe(primary.commonDirectory);
    expect(primary.origins.map((origin) => origin.root).sort()).toEqual([root, peer].sort());
    expect(secondary.recordHome).toBe(peer);
    expect(primary.origins.find((origin) => origin.root === peer)?.id).toBe(secondary.origins.find((origin) => origin.root === peer)?.id);
    expect(primary.unavailableOrigins).toEqual([]);
    expect(secondary.unavailableOrigins).toEqual([]);
  });
});
