import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { createHistoryControl, historyDigest, type HistoryInitializationManifest } from "../../packages/cli/src/history/control.js";
import { historyState, selectHistoryControl, selectMissionHistory, type HistoryGatewayInput } from "../../packages/cli/src/history/gateway.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyStorageEntries, memoryHistoryStorage } from "../support/history-storage.js";

const withManifest = (f: ReturnType<typeof historyGenerationFixture>, manifest: HistoryInitializationManifest): HistoryGatewayInput => {
  const control = createHistoryControl({ id: f.control.id, journalId: f.control.journal_id, recordedAt: f.control.recorded_at, producer: f.control.producer, manifest, decisionReference: "request:original", causes: [f.creation.id] });
  const activation = historyTestBytes([control]);
  return { ...f.input, activation, controlJournals: [{ journalId: control.journal_id, bytes: activation }] };
};

describe("history selection integrity", () => {
  it("rejects another control journal's conflicting claim to the selected event identity", () => {
    const f = historyGenerationFixture();
    const makeControl = (id: string, journalId: string) => createHistoryControl({ id, journalId, recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: f.manifest, decisionReference: "request:original", causes: [f.creation.id] });
    const conflicting = makeControl(f.control.id, randomUUID());
    const copy = { journalId: conflicting.journal_id, bytes: historyTestBytes([conflicting]) };
    expect(() => selectMissionHistory({ ...f.input, controlJournals: [...f.input.controlJournals, copy] })).toThrowError(expect.objectContaining({ code: "history_control_conflict" }));
    const multiple = historyTestBytes([conflicting, makeControl(randomUUID(), conflicting.journal_id)]);
    expect(() => selectHistoryControl({ ...f.input, controlJournals: [...f.input.controlJournals, { ...copy, bytes: multiple }] })).toThrowError(expect.objectContaining({ code: "history_control_conflict" }));
  });

  it("does not require unrelated excluded control records to validate", () => {
    const f = historyGenerationFixture();
    const unrelated = new TextEncoder().encode(`${JSON.stringify({ id: randomUUID(), unknown: "unsupported old control" })}\n`);
    expect(selectMissionHistory({ ...f.input, controlJournals: [...f.input.controlJournals, { journalId: randomUUID(), bytes: unrelated }] }).history.issues).toEqual([]);
  });

  it("checks the approved initial state against exact published prefixes", () => {
    const f = historyGenerationFixture();
    expect(() => selectMissionHistory(withManifest(f, { ...f.manifest, expected_state: {} }))).toThrowError(expect.objectContaining({ code: "history_expected_state_mismatch" }));
    const next = historyTestEvent("construction.unit-created", { ...f.unit.data, unit_id: "2026-11-14-additional", directory: "construction/units-of-work/2026-11-14-additional" }, f.journalId, [f.prepared.id]);
    const bytes = historyTestBytes([f.creation, f.prepared, f.unit, next]);
    const current = selectMissionHistory({ ...f.input, generationSources: [{ ...f.source, bytes }] });
    expect(current.history.events).toHaveLength(4);
    expect(historyState(current.history)).not.toEqual(f.manifest.expected_state);
  });

  it("checks repository, request and published unit bindings without treating reservations as progress", () => {
    const f = historyGenerationFixture();
    for (const binding of [
      { ...f.manifest.mission_binding, record_home_repository_id: "unrelated-repository" },
      { ...f.manifest.mission_binding, request_reference: "request:unrelated" },
      { ...f.manifest.mission_binding, unit_ids: ["unrelated-unit"] },
    ]) expect(() => selectMissionHistory(withManifest(f, { ...f.manifest, mission_binding: binding }))).toThrowError(expect.objectContaining({ code: "history_initial_binding_mismatch" }));
    const reserved = withManifest(f, { ...f.manifest, mission_binding: { ...f.manifest.mission_binding, unit_ids: [f.unitId, "2026-11-14-reserved"] } });
    expect(selectMissionHistory(reserved).history.events).toHaveLength(3);
  });

  it("validates control proof before loading selected phase files", async () => {
    const f = historyGenerationFixture();
    const entries = historyStorageEntries(f);
    entries.delete(`/record/.kepler/missions/${f.missionId}/history/control/${f.guard.journal_id}.jsonl`);
    const original = memoryHistoryStorage(entries);
    const storage = memoryHistoryStorage(entries, { read: async (location) => {
      if (location.relative.includes("/generations/")) throw new Error("Phase files were loaded before control validation");
      return original.files.read(location);
    } });
    await expect(storage.read("/record", f.missionId)).rejects.toMatchObject({ code: "history_guard_missing" });
    const metadata = selectHistoryControl({ ...f.input, generationSources: [{ ...f.source, bytes: new Uint8Array([255]) }] });
    expect(metadata.mode).toBe("active");
    expect(Object.hasOwn(metadata, "history")).toBe(false);
  });

  it("rejects phase content that reuses a selected control event identity", () => {
    const f = historyGenerationFixture();
    const bytes = historyTestBytes([f.creation, f.prepared, { ...f.unit, id: f.control.id }]);
    const source = { ...f.source, bytes };
    const manifest = { ...f.manifest, candidate_journals: [{ ...f.manifest.candidate_journals[0]!, byte_length: bytes.length, content_version: historyDigest(bytes) }], expected_state: historyState(collectHistory(f.missionId, [{ ...f.legacy, bytes }], { completeness: "complete" })) };
    expect(() => selectMissionHistory({ ...withManifest(f, manifest), generationSources: [source] })).toThrowError(expect.objectContaining({ code: "history_event_identity_conflict" }));
  });

  it("requires proof from every registered current copy and excludes unjoined local phase content", async () => {
    const f = historyGenerationFixture();
    const context = { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "peer", label: "peer", root: "/peer" }], unavailableOrigins: [] };
    const entries = new Map([...historyStorageEntries(f), ...historyStorageEntries(f, "/peer")]);
    entries.delete(`/peer/.kepler/missions/${f.missionId}/history/control/${f.guard.journal_id}.jsonl`);
    await expect(memoryHistoryStorage(entries, {}, context).read("/record", f.missionId, { originIds: new Set(["current", "peer"]) })).rejects.toMatchObject({ code: "history_guard_missing" });
    entries.set(`/peer/.kepler/missions/${f.missionId}/history/control/${f.guard.journal_id}.jsonl`, historyTestBytes([f.guard]));
    entries.set(`/record/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${f.journalId}.jsonl`, new Uint8Array([255]));
    const selected = await memoryHistoryStorage(entries, {}, context).read("/record", f.missionId, { originIds: new Set(["peer"]), includeCurrentOrigin: false });
    expect(selected.history.events).toHaveLength(3);
  });
});
