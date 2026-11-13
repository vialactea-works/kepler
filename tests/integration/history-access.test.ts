import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { missionStartupResourceKey } from "../../packages/cli/src/construction/mission-startup-resource.js";
import { createNodeHistoryAccess } from "../../packages/cli/src/history/access-runtime.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createHistoryControl } from "../../packages/cli/src/history/control.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyStorageEntries } from "../support/history-storage.js";

const roots: string[] = [];
const repository = async () => {
  const parent = await Fs.realpath(await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-history-access-")));
  roots.push(parent);
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
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

describe("real shared history coordination", () => {
  it("allows independent writers while excluding recovery and preserving exact input coverage", async () => {
    const { root, f, access } = await repository();
    const request = { recordHome: root, missionId: f.missionId, historyVersion: f.control.id };
    await access.join(request, async (view, context) => {
      expect(view.history.issues).toEqual([]);
      expect(context.commonDirectory).toBe(await Fs.realpath(Path.join(root, ".git")));
    });
    const second = createNodeHistoryAccess(createNodeMissionWorkspaceRuntime({ cwd: root }));
    const firstWriter = await access.beginMutation(request);
    const secondWriter = await second.beginMutation(request);
    const common = (await access.storage.context(root)).commonDirectory;
    const writers = Path.join(common, "kepler", "missions", f.missionId, "coordination", "history-writers");
    expect((await Fs.readdir(writers)).filter((name) => name.endsWith(".json"))).toHaveLength(2);
    await expect(access.withRecovery(root, f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_writers_active" });
    await firstWriter.release();
    await expect(second.withRecovery(root, f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_writers_active" });
    await secondWriter.release();
    const before = historyInventory(await access.storage.snapshot(root, f.missionId));
    await access.withRecovery(root, f.missionId, async (scope) => {
      expect(historyInventory(await access.snapshot(scope))).toEqual(before);
      await expect(second.beginMutation(request)).rejects.toMatchObject({ code: "resource_contended" });
    });
    expect(await Fs.readdir(writers)).toEqual([]);
    expect((await access.read(root, f.missionId)).history.events).toHaveLength(3);
  });

  it("requires the canonical startup claim and verifies its actual ownership bytes", async () => {
    const { root, f, access } = await repository();
    const workspace = createNodeMissionWorkspaceRuntime({ cwd: root });
    const context = await access.storage.context(root);
    const owner = { ...workspace.identity, mission_id: f.missionId, resource_scope: "mission-startup" };
    const wrong = await workspace.coordination.acquire({ commonDirectory: context.commonDirectory, location: { kind: "mission", missionId: f.missionId }, resourceKey: "a".repeat(64), owner });
    if (wrong.kind !== "acquired") throw new Error("Expected an isolated wrong-resource fixture claim");
    await expect(access.withStartup(root, f.missionId, wrong.lease, async () => "unsafe")).rejects.toMatchObject({ code: "history_startup_authority_invalid" });
    expect((await wrong.lease.release()).kind).toBe("released");
    const startup = await workspace.coordination.acquire({ commonDirectory: context.commonDirectory, location: { kind: "mission", missionId: f.missionId }, resourceKey: missionStartupResourceKey(context.commonDirectory, f.missionId), owner });
    if (startup.kind !== "acquired") throw new Error("Expected an isolated startup fixture claim");
    try {
      await access.withStartup(root, f.missionId, startup.lease, async (scope) => {
        expect(scope.ownSources).toHaveLength(2);
        expect((await access.snapshot(scope)).files).toHaveLength(4);
        await access.publishBinding(scope, f.control, null);
      });
      expect((await access.read(root, f.missionId)).coordination).toBe("bound");
    } finally { expect((await startup.lease.release()).kind).toBe("released"); }
  });

  it("shares one head across real working copies and rejects stale local selection before writes", async () => {
    const { parent, root, git, f, access, install } = await repository();
    git(root, "add", ".kepler/marker");
    git(root, "commit", "-q", "-m", "Create isolated coordination fixture");
    const peer = Path.join(parent, "peer copy");
    git(root, "worktree", "add", "-q", "-b", "peer", peer);
    await install(peer);
    const request = { recordHome: root, missionId: f.missionId, historyVersion: f.control.id };
    await access.join(request, async () => undefined);
    const other = createNodeHistoryAccess(createNodeMissionWorkspaceRuntime({ cwd: peer }));
    await other.join({ ...request, recordHome: peer }, async (view, context) => {
      expect(view.coordination).toBe("unjoined");
      expect(context.commonDirectory).toBe((await access.storage.context(root)).commonDirectory);
    });
    expect((await access.read(root, f.missionId)).history.events).toHaveLength(3);
    const first = await access.beginMutation(request);
    const second = await other.beginMutation({ ...request, recordHome: peer });
    await first.release();
    await second.release();
    const obsolete = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: f.manifest, decisionReference: "request:original", causes: [f.creation.id] });
    const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: f.generationId, control_event_id: obsolete.id }, randomUUID(), [obsolete.id]);
    const controlRoot = Path.join(peer, ".kepler", "missions", f.missionId, "history", "control");
    await Fs.writeFile(Path.join(controlRoot, "events", `${obsolete.journal_id}.jsonl`), historyTestBytes([obsolete]));
    await Fs.writeFile(Path.join(controlRoot, `${guard.journal_id}.jsonl`), historyTestBytes([guard]));
    await Fs.writeFile(Path.join(controlRoot, "active.json"), historyTestBytes([obsolete]));
    const before = historyInventory(await other.storage.snapshot(peer, f.missionId));
    await expect(other.beginMutation({ ...request, recordHome: peer })).rejects.toMatchObject({ code: "history_stale_checkout" });
    expect(historyInventory(await other.storage.snapshot(peer, f.missionId))).toEqual(before);
  });
});
