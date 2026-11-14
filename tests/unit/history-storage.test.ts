import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createHistoryControl, historyDigest } from "../../packages/cli/src/history/control.js";
import type { HistoryRepositoryContext } from "../../packages/cli/src/history/files.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyStorageEntries, memoryHistoryStorage } from "../support/history-storage.js";

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("history storage contracts", () => {
  it("inspects damaged raw inputs, artifacts and pending instructions without replay or writes", async () => {
    const f = historyGenerationFixture();
    const mission = `.kepler/missions/${f.missionId}`;
    const records = new Map([
      [`/record/${mission}/history/control/active.json`, new Uint8Array([255, 0, 13])],
      [`/record/${mission}/history/construction/${f.journalId}.jsonl`, utf8("damaged old history")],
      [`/record/${mission}/construction/units-of-work/${f.unitId}/design.md`, utf8("Uncommitted design")],
      [`/git/kepler/missions/${f.missionId}/recovery/pending/earlier.json`, utf8("uncertain previous envelope")],
      [`/git/kepler/missions/${f.missionId}/recovery/archives/previous/untouched`, utf8("Do not recursively copy earlier archives")],
    ]);
    const storage = memoryHistoryStorage(records);
    const snapshot = await storage.snapshot("/record", f.missionId);
    expect(snapshot.files).toHaveLength(4);
    expect(snapshot.unavailable).toEqual([]);
    const inventory = historyInventory(snapshot);
    expect(inventory).toEqual([...inventory].sort((a, b) => a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0));
    expect(inventory).toContainEqual(expect.objectContaining({ path: `${mission}/history/control/active.json`, byte_length: 3, content_version: historyDigest(new Uint8Array([255, 0, 13])) }));
    expect(inventory.some((entry) => entry.path.includes("/archives/"))).toBe(false);
    await expect(storage.read("/record", f.missionId)).rejects.toMatchObject({ code: "history_control_invalid" });
  });

  it("includes startup instructions and all mission-owned local metadata without copying earlier archives", async () => {
    const f = historyGenerationFixture();
    const base = `kepler/missions/${f.missionId}`;
    const records = new Map([
      [`/git/${base}/startup/intent.json`, utf8("original startup envelopes")],
      [`/git/${base}/startup.json`, utf8("retained local bootstrap")],
      [`/git/${base}/future-pending/partial`, Uint8Array.from([255, 0])],
      [`/git/${base}/recovery/archives/${randomUUID()}/original`, utf8("older archive remains separate")],
      [`/git/kepler/missions/${randomUUID()}/startup/intent.json`, utf8("another mission")],
    ]);
    const snapshot = await memoryHistoryStorage(records).snapshot("/record", f.missionId);
    expect(snapshot.files).toHaveLength(3);
    expect(snapshot.files.map((file) => file.path)).toEqual(expect.arrayContaining([`${base}/startup/intent.json`, `${base}/startup.json`, `${base}/future-pending/partial`]));
    expect(snapshot.files.every((file) => file.path.startsWith(`${base}/`) && !file.path.includes("/archives/"))).toBe(true);
  });

  it("selects active journals before reading damaged excluded generations or legacy files", async () => {
    const f = historyGenerationFixture();
    const records = historyStorageEntries(f);
    const prefix = `.kepler/missions/${f.missionId}/history`;
    records.set(`/record/${prefix}/construction/old.jsonl`, utf8("corrupt legacy"));
    records.set(`/record/${prefix}/generations/${randomUUID()}/construction/old.jsonl`, utf8("corrupt excluded generation"));
    const normal = memoryHistoryStorage(records);
    const read = normal.files.read;
    const storage = memoryHistoryStorage(records, { read: async (location) => {
      if (location.relative.endsWith("/old.jsonl")) throw new Error("Excluded source must not be read");
      return read(location);
    } });
    const selected = await storage.read("/record", f.missionId);
    expect(selected.mode).toBe("active");
    expect(selected.history.events).toHaveLength(3);
    expect(selected.history.issues).toEqual([]);
    expect(selected.sources[0]?.generationId).toBe(f.generationId);
  });

  it("verifies the control boundary without loading a damaged selected phase", async () => {
    const f = historyGenerationFixture();
    const records = historyStorageEntries(f);
    const base = memoryHistoryStorage(records);
    const storage = memoryHistoryStorage(records, { list: async (location) => {
      if (location.relative.includes(`/generations/${f.generationId}`)) throw new Error("Selected phase must not be loaded for control inspection");
      return base.files.list(location);
    } });
    const selected = await storage.selection("/record", f.missionId);
    expect(selected.historyVersion).toBe(f.control.id);
    expect(selected.rootControl?.id).toBe(f.control.id);
    expect(selected.mode).toBe("active");
    await expect(storage.read("/record", f.missionId)).rejects.toThrow("Selected phase must not be loaded");
  });

  it("reports recovery mode without loading an incomplete candidate", async () => {
    const f = historyGenerationFixture();
    const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:00:01Z", producer: { name: "kepler", version: "3.1.0" }, manifest: f.resetManifest, decisionReference: "decision:reset", causes: [] });
    const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: f.generationId, control_event_id: reset.id }, randomUUID(), [reset.id]);
    const prefix = `/record/.kepler/missions/${f.missionId}/history`;
    const records = new Map([
      [`${prefix}/control/active.json`, historyTestBytes([reset])],
      [`${prefix}/control/events/${reset.journal_id}.jsonl`, historyTestBytes([reset])],
      [`${prefix}/control/${guard.journal_id}.jsonl`, historyTestBytes([guard])],
      [`${prefix}/generations/${f.generationId}/construction/incomplete.jsonl`, utf8("not complete")],
    ]);
    const selected = await memoryHistoryStorage(records).read("/record", f.missionId);
    expect(selected.mode).toBe("recovering");
    expect(selected.history.events).toEqual([]);
    expect(selected.history.issues).toEqual([]);
  });

  it("keeps legacy state read-only and never falls back when control evidence exists", async () => {
    const f = historyGenerationFixture();
    const prefix = `/record/.kepler/missions/${f.missionId}/history`;
    const records = new Map([[`${prefix}/construction/${f.journalId}.jsonl`, f.legacy.bytes]]);
    expect((await memoryHistoryStorage(records).read("/record", f.missionId)).mode).toBe("legacy");
    records.set(`${prefix}/control/${f.guard.journal_id}.jsonl`, historyTestBytes([f.guard]));
    await expect(memoryHistoryStorage(records).read("/record", f.missionId)).rejects.toMatchObject({ code: "history_selection_missing" });
  });

  it("merges only current working-copy sources and rejects conflicting immutable journal bytes", async () => {
    const f = historyGenerationFixture();
    const context: HistoryRepositoryContext = { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "peer", label: "peer", root: "/peer" }], unavailableOrigins: [] };
    const records = new Map([...historyStorageEntries(f), ...historyStorageEntries(f, "/peer")]);
    const storage = memoryHistoryStorage(records, {}, context);
    expect((await storage.read("/record", f.missionId)).history.events).toHaveLength(3);
    const path = `/peer/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${f.journalId}.jsonl`;
    records.set(path, historyTestBytes([{ ...f.creation, data: { ...f.creation.data, title: "Contradictory copy" } }, f.prepared, f.unit]));
    await expect(storage.read("/record", f.missionId)).rejects.toMatchObject({ code: "history_journal_conflict" });
  });

  it("rejects stale shared versions, missing registered sources and invalid mission selectors", async () => {
    const f = historyGenerationFixture();
    const storage = memoryHistoryStorage(historyStorageEntries(f));
    await expect(storage.read("/record", f.missionId, { sharedHistoryVersion: randomUUID() })).rejects.toMatchObject({ code: "history_stale_checkout" });
    await expect(storage.selection("/record", f.missionId, { sharedHistoryVersion: randomUUID() })).rejects.toMatchObject({ code: "history_stale_checkout" });
    await expect(storage.selection("/record", "short-id")).rejects.toMatchObject({ code: "history_scope_invalid" });
    await expect(storage.read("/record", f.missionId, { originIds: new Set(["missing-peer"]) })).rejects.toMatchObject({ code: "history_source_incomplete" });
    await expect(storage.snapshot("/record", "short-id")).rejects.toMatchObject({ code: "history_scope_invalid" });
    expect((await storage.read("/record", f.missionId, { pendingRecovery: true })).pendingRecovery).toBe(true);
  });

  it("reports inaccessible originals while preserving every other available raw input", async () => {
    const f = historyGenerationFixture();
    const records = historyStorageEntries(f);
    const base = memoryHistoryStorage(records);
    const storage = memoryHistoryStorage(records, { read: async (location) => {
      if (location.relative.endsWith("active.json")) throw new Error("Permission denied");
      return base.files.read(location);
    } });
    const snapshot = await storage.snapshot("/record", f.missionId);
    expect(snapshot.unavailable).toContainEqual(expect.objectContaining({ kind: "unreadable", reason: "Permission denied" }));
    expect(snapshot.files).toHaveLength(3);
  });
});
