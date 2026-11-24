import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { inspectMissionHistory } from "../../packages/cli/src/history/inspection.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyDigest } from "../../packages/cli/src/history/control.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const fixture = () => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  return { f, h, request: { recordHome: "/record", missionId: f.missionId }, dependencies: { access: h.access, archives: new HistoryArchives(h.storage) } };
};

describe("read-only raw history inspection", () => {
  it("reports validated selection and hashes without exposing source contents or acquiring ownership", async () => {
    const { f, h, request, dependencies } = fixture();
    h.entries.set(`/record/.kepler/missions/${f.missionId}/evidence/private`, h.encode({ content: "sensitive source contents" }));
    const before = new Map(h.entries);
    const report = await inspectMissionHistory(request, dependencies);
    expect(report).toMatchObject({ mission_id: f.missionId, history_version: f.control.id, generation_id: f.generationId, mode: "active", selection_status: "validated", execution_started: false });
    expect(report.local_control?.event_id).toBe(f.control.id);
    expect(report.control_receipts).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("sensitive source contents");
    expect(h.entries).toEqual(before);
    expect(h.held.size).toBe(0);
  });

  it("inspects a damaged selector as raw input without requiring a valid projection", async () => {
    const { f, h, request, dependencies } = fixture();
    const path = `.kepler/missions/${f.missionId}/history/control/active.json`;
    const bytes = Uint8Array.from([255, 123]);
    h.entries.set(`/record/${path}`, bytes);
    const before = new Map(h.entries);
    const report = await inspectMissionHistory(request, dependencies);
    expect(report).toMatchObject({ mode: null, history_version: null, selection_status: "blocked", local_control: null });
    expect(report.source_inventory).toContainEqual({ source_id: `current:${path}`, origin: "current", path, byte_length: bytes.length, content_version: historyDigest(bytes) });
    expect(report.issues.length).toBeGreaterThan(0);
    expect(h.entries).toEqual(before);
  });

  it("does not parse excluded corrupt generations to report the selected history", async () => {
    const { f, h, request, dependencies } = fixture();
    const path = `.kepler/missions/${f.missionId}/history/generations/${randomUUID()}/construction/${randomUUID()}.jsonl`;
    h.entries.set(`/record/${path}`, Uint8Array.from([255]));
    const report = await inspectMissionHistory(request, dependencies);
    expect(report.selection_status).toBe("validated");
    expect(report.history_version).toBe(f.control.id);
    expect(report.source_inventory.some((source) => source.path === path)).toBe(true);
  });

  it("reports legacy history as read-only with an explicit migration condition", async () => {
    const { f, h, request, dependencies } = fixture();
    for (const key of [...h.entries.keys()]) if (key.startsWith(`/record/.kepler/missions/${f.missionId}/history/`)) h.entries.delete(key);
    h.entries.delete(h.bindingPath);
    h.entries.set(`/record/.kepler/missions/${f.missionId}/history/construction/${f.journalId}.jsonl`, f.source.bytes);
    const before = new Map(h.entries);
    const report = await inspectMissionHistory(request, dependencies);
    expect(report).toMatchObject({ mode: "legacy", history_version: null, generation_id: null, migration_required: true, selection_status: "legacy-readonly", execution_started: false });
    expect(report.remaining_work.some((item) => item.includes("migration"))).toBe(true);
    expect(h.entries).toEqual(before);
  });

  it("verifies archive contents and reports a missing index without changing selection", async () => {
    const { f, h, request, dependencies } = fixture();
    const snapshot = await h.storage.snapshot("/record", f.missionId);
    const manifest = { ...f.resetManifest, source_inventory: historyInventory(snapshot) };
    const index = await dependencies.archives.prepare(manifest, snapshot);
    await dependencies.archives.preserve(manifest, index, snapshot);
    expect((await inspectMissionHistory(request, dependencies)).archives[0]).toMatchObject({ archive_id: f.archiveId, verification: "verified", source_count: snapshot.files.length });
    h.entries.delete(`/git/kepler/missions/${f.missionId}/recovery/archives/${f.archiveId}/index.json`);
    const report = await inspectMissionHistory(request, dependencies);
    expect(report.archives[0]).toMatchObject({ archive_id: f.archiveId, verification: "failed", index_content_version: null });
    expect(report.history_version).toBe(f.control.id);
    expect(report.issues.some((item) => item.code === "history_archive_missing")).toBe(true);
  });

  it("reports nested pending records and draft material without treating them as progress", async () => {
    const { f, h, request, dependencies } = fixture();
    const base = `/git/kepler/missions/${f.missionId}/recovery`;
    h.entries.set(`${base}/pending/original/nested.json`, h.encode({ incomplete: true }));
    h.entries.set(`${base}/drafts/${randomUUID()}/candidate.bin`, Uint8Array.from([255]));
    const before = new Map(h.entries);
    const report = await inspectMissionHistory(request, dependencies);
    expect(report.pending_sources).toHaveLength(1);
    expect(report.pending_sources[0]?.status).toBe("pending");
    expect(report.draft_source_count).toBe(1);
    expect(report.history_version).toBe(f.control.id);
    expect(report.remaining_work.some((item) => item.includes("exact missing steps"))).toBe(true);
    expect(h.entries).toEqual(before);
  });

  it("retains the caller's initial scope across awaits and rejects invalid mission identities", async () => {
    const { f, request, dependencies } = fixture();
    const pending = inspectMissionHistory(request, dependencies);
    request.missionId = randomUUID();
    expect((await pending).mission_id).toBe(f.missionId);
    await expect(inspectMissionHistory({ ...request, missionId: "bad" }, dependencies)).rejects.toMatchObject({ code: "history_scope_invalid" });
  });
});
