import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { createHistoryControl, HistoryError, historyDigest, type HistoryRebuildManifest, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import { historyState, mergeGenerationSources, selectMissionHistory, type HistoryGatewayInput } from "../../packages/cli/src/history/gateway.js";
import { journalPath, scanJournalBytes } from "../../packages/cli/src/history/journal.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent, historyTestReconciliation } from "../support/history-generation.js";

const rebuiltGatewayInput = (
  f: ReturnType<typeof historyGenerationFixture>,
  resetManifest: HistoryResetManifest,
  prefixEvents: readonly ReturnType<typeof historyTestEvent>[],
  currentEvents: readonly ReturnType<typeof historyTestEvent>[],
): HistoryGatewayInput => {
  const prefixBytes = historyTestBytes(prefixEvents);
  const currentBytes = historyTestBytes(currentEvents);
  const prefixScan = scanJournalBytes(prefixBytes);
  const reset = createHistoryControl({
    id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:01:00Z",
    producer: { name: "kepler", version: "3.1.0" }, manifest: resetManifest, decisionReference: "decision:reset", causes: [],
  });
  const candidateJournals = [{
    phase: "construction" as const, journal_id: f.journalId, byte_length: prefixBytes.length,
    content_version: historyDigest(prefixBytes), reference: `candidate:${f.generationId}/construction/${f.journalId}`,
  }];
  const actions = prefixScan.lines.map((line, index) => {
    const event = prefixEvents[index]!;
    const byteLength = line.byteLength + (line.terminated ? 1 : 0);
    return {
      id: randomUUID(), action: "retain" as const,
      source: { source_id: "archive-source", byte_offset: line.byteOffset, byte_length: byteLength },
      event: null, reason: "Retain the selected candidate prefix", authority: null, proof: null, loss_reference: null, data_bindings: [],
      output: { event_id: event.id, journal_id: f.journalId, byte_offset: line.byteOffset, byte_length: byteLength },
    };
  });
  const manifest: HistoryRebuildManifest = {
    format: "kepler.mission-history-rebuild", version: 1, mission_id: f.missionId, generation_id: f.generationId,
    reset_event_id: reset.id, archive_id: resetManifest.archive_id, archive_inventory_hash: historyDigest("archive"),
    actions, dependency_order: [], candidate_journals: candidateJournals,
    required_material: { artifact_bindings: [], checkpoints: [], evidence: [] },
    expected_state: historyState(collectHistory(f.missionId, [{
      sourceId: "candidate-prefix", generationId: f.generationId, missionId: f.missionId, phase: "construction", journalId: f.journalId, bytes: prefixBytes,
    }], { completeness: "complete", generationId: f.generationId })),
    continuation: { operation: "inspect current unit", unresolved_work: [], required_approvals: [] },
    requester: "Requester", reconciliation: historyTestReconciliation,
  };
  const rebuilt = createHistoryControl({
    id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:02:00Z",
    producer: { name: "kepler", version: "3.1.0" }, manifest, decisionReference: "decision:rebuild", causes: [reset.id],
  });
  const activation = historyTestBytes([rebuilt]);
  const guard = historyTestEvent("construction.history-generation-required", {
    mission_id: f.missionId, generation_id: f.generationId, control_event_id: reset.id,
  }, randomUUID(), [reset.id]);
  return {
    missionId: f.missionId, activation,
    controlJournals: [
      { journalId: rebuilt.journal_id, bytes: activation },
      { journalId: reset.journal_id, bytes: historyTestBytes([reset]) },
    ],
    guardJournals: [{ journalId: guard.journal_id, bytes: historyTestBytes([guard]) }],
    generationSources: [{ ...f.source, bytes: currentBytes }], legacySources: [],
    generationEvidence: true, complete: true, pendingRecovery: false,
  };
};

const code = (operation: () => unknown): string => {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(HistoryError);
    return (error as HistoryError).code;
  }
  throw new Error("Expected a history error");
};

describe("generation-aware history gateway", () => {
  it("selects exact generation membership before parsing corrupt excluded records", () => {
    const f = historyGenerationFixture();
    const view = selectMissionHistory({ ...f.input,
      legacySources: [{ ...f.legacy, bytes: new Uint8Array([255]) }],
      generationSources: [f.source, { ...f.source, generationId: randomUUID(), bytes: new Uint8Array([255]) }],
      controlJournals: [...f.input.controlJournals, { journalId: randomUUID(), bytes: new Uint8Array([255]) }],
    });
    expect(view.mode).toBe("active");
    expect(view.generationId).toBe(f.generationId);
    expect(view.historyVersion).toBe(f.control.id);
    expect(view.history.issues).toEqual([]);
    expect(historyState(view.history)).toEqual(f.manifest.expected_state);
  });

  it("keeps legacy history readable without creating generation authority", () => {
    const f = historyGenerationFixture();
    const legacy = selectMissionHistory({ ...f.input, activation: null, controlJournals: [], guardJournals: [], generationSources: [], generationEvidence: false });
    expect(legacy.mode).toBe("legacy");
    expect(legacy.historyVersion).toBeUndefined();
    expect(legacy.controlReceipts).toEqual([]);
    expect(historyState(legacy.history)).toEqual(f.manifest.expected_state);
  });

  it("rejects absent, damaged, unsupported, mismatched and stale activation records", () => {
    const f = historyGenerationFixture();
    expect(code(() => selectMissionHistory({ ...f.input, activation: null }))).toBe("history_selection_missing");
    expect(code(() => selectMissionHistory({ ...f.input, activation: new TextEncoder().encode("{broken") }))).toBe("history_control_invalid");
    expect(code(() => selectMissionHistory({ ...f.input, controlJournals: [] }))).toBe("history_control_conflict");
    expect(code(() => selectMissionHistory({ ...f.input, activation: new TextEncoder().encode(JSON.stringify(f.control, null, 2)) }))).toBe("history_control_conflict");
    expect(code(() => selectMissionHistory({ ...f.input, sharedHistoryVersion: randomUUID() }))).toBe("history_stale_checkout");
    expect(code(() => selectMissionHistory({ ...f.input, complete: false }))).toBe("history_source_incomplete");
  });

  it("requires an exact older-reader guard without replaying it as phase progress", () => {
    const f = historyGenerationFixture();
    expect(code(() => selectMissionHistory({ ...f.input, guardJournals: [] }))).toBe("history_guard_missing");
    const wrong = historyTestEvent("construction.history-generation-required", { mission_id: randomUUID(), generation_id: f.generationId, control_event_id: f.control.id }, f.guard.journal_id, [f.control.id]);
    expect(code(() => selectMissionHistory({ ...f.input, guardJournals: [{ journalId: wrong.journal_id, bytes: historyTestBytes([wrong]) }] }))).toBe("history_guard_invalid");
    const view = selectMissionHistory(f.input);
    expect(view.history.events).toHaveLength(3);
    expect(view.history.events.some((item) => item.event?.type === "construction.history-generation-required")).toBe(false);
  });

  it("accepts valid later appends and keeps original prefix bindings", () => {
    const f = historyGenerationFixture();
    const interaction = historyTestEvent("construction.interaction-recorded", { mission_id: f.missionId, unit_id: f.unitId, participants: ["requester"], content: "Continue the same work", references: [] }, f.journalId, [f.unit.id]);
    const appended = historyTestBytes([f.creation, f.prepared, f.unit, { ...interaction, recorded_at: "2000-01-01T00:00:00Z" }]);
    const view = selectMissionHistory({ ...f.input, generationSources: [{ ...f.source, bytes: appended }] });
    expect(view.history.events).toHaveLength(4);
    expect(view.history.issues).toEqual([]);
    const changed = new Uint8Array(f.source.bytes);
    changed[20] = changed[20] === 65 ? 66 : 65;
    expect(code(() => selectMissionHistory({ ...f.input, generationSources: [{ ...f.source, bytes: changed }] }))).toBe("history_original_prefix_changed");
  });

  it("checks rebuilt membership on the approved prefix and permits later appends and unit creation", () => {
    const f = historyGenerationFixture();
    const resetManifest: HistoryResetManifest = {
      ...f.resetManifest,
      mission_binding: { ...f.resetManifest.mission_binding, unit_ids: [] },
    };
    const laterUnitId = "2026-11-14-later-unit";
    const laterUnit = historyTestEvent("construction.unit-created", {
      ...f.unit.data, unit_id: laterUnitId, directory: `construction/units-of-work/${laterUnitId}`,
    }, f.journalId, [f.prepared.id]);
    const interaction = historyTestEvent("construction.interaction-recorded", {
      mission_id: f.missionId, unit_id: laterUnitId, participants: ["requester"], content: "Continue after publication", references: [],
    }, f.journalId, [laterUnit.id]);
    const view = selectMissionHistory(rebuiltGatewayInput(
      f, resetManifest, [f.creation, f.prepared], [f.creation, f.prepared, laterUnit, interaction],
    ));
    expect(view.history.events).toHaveLength(4);
    expect(view.history.events.map((item) => item.constructionEvent?.data.unit_id).filter(Boolean)).toContain(laterUnitId);
    expect(view.history.issues).toEqual([]);
  });

  it("rejects rebuilt candidate prefixes that substitute a reset-bound unit", () => {
    const f = historyGenerationFixture();
    const replacementId = "2026-11-14-replacement";
    const replacement = historyTestEvent("construction.unit-created", {
      ...f.unit.data, unit_id: replacementId, directory: `construction/units-of-work/${replacementId}`,
    }, f.journalId, [f.prepared.id]);
    const input = rebuiltGatewayInput(f, f.resetManifest, [f.creation, f.prepared, replacement], [f.creation, f.prepared, replacement]);
    expect(code(() => selectMissionHistory(input))).toBe("history_rebuilt_binding_mismatch");
  });

  it("merges only byte-preserving journal extensions and rejects contradictory copies", () => {
    const f = historyGenerationFixture();
    const shorter = { ...f.source, sourceId: "peer", bytes: f.source.bytes.subarray(0, 10) };
    expect(mergeGenerationSources([shorter, f.source], f.missionId, f.generationId)).toEqual([f.source]);
    expect(mergeGenerationSources([f.source, shorter], f.missionId, f.generationId)).toEqual([f.source]);
    expect(code(() => mergeGenerationSources([f.source, { ...shorter, bytes: new Uint8Array([255]) }], f.missionId, f.generationId))).toBe("history_journal_conflict");
    expect(code(() => mergeGenerationSources([{ ...f.source, phase: "unsupported" }], f.missionId, f.generationId))).toBe("history_source_invalid");
  });

  it("reports recovery mode without turning partial candidate files into current progress", () => {
    const f = historyGenerationFixture();
    const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:01:00Z", producer: { name: "kepler", version: "3.1.0" }, manifest: f.resetManifest, decisionReference: "decision:reset", causes: [] });
    const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: f.generationId, control_event_id: reset.id }, randomUUID(), [reset.id]);
    const activation = historyTestBytes([reset]);
    const view = selectMissionHistory({ ...f.input, activation, controlJournals: [{ journalId: reset.journal_id, bytes: activation }], guardJournals: [{ journalId: guard.journal_id, bytes: historyTestBytes([guard]) }], generationSources: [{ ...f.source, bytes: new Uint8Array([255]) }], pendingRecovery: true });
    expect(view.mode).toBe("recovering");
    expect(view.pendingRecovery).toBe(true);
    expect(view.history.events).toEqual([]);
  });

  it("requires the matching reset context for a rebuilt selection", () => {
    const f = historyGenerationFixture();
    const root = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:01:00Z", producer: { name: "kepler", version: "3.1.0" }, manifest: f.resetManifest, decisionReference: "decision:reset", causes: [] });
    const candidate = f.manifest.candidate_journals[0]!;
    const actionId = randomUUID();
    const manifest: HistoryRebuildManifest = {
      format: "kepler.mission-history-rebuild", version: 1, mission_id: f.missionId, generation_id: f.generationId,
      reset_event_id: root.id, archive_id: f.archiveId, archive_inventory_hash: historyDigest("archive"),
      actions: [{
        id: actionId, action: "add", source: null,
        event: { phase: "construction", type: "construction.interaction-recorded", event_version: 1, data: { mission_id: f.missionId }, causes: [] },
        reason: "Fixture reconstruction action", authority: null, proof: null, loss_reference: null, data_bindings: [],
        output: { event_id: randomUUID(), journal_id: candidate.journal_id, byte_offset: 0, byte_length: candidate.byte_length },
      }], dependency_order: [actionId], candidate_journals: f.manifest.candidate_journals,
      required_material: { artifact_bindings: [], checkpoints: [], evidence: [] }, expected_state: f.manifest.expected_state,
      continuation: { operation: "inspect current unit", unresolved_work: [], required_approvals: [] }, requester: "Requester",
      reconciliation: historyTestReconciliation,
    };
    const control = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:02:00Z", producer: { name: "kepler", version: "3.1.0" }, manifest, decisionReference: "decision:rebuild", causes: [root.id] });
    const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: f.generationId, control_event_id: root.id }, randomUUID(), [root.id]);
    const activation = historyTestBytes([control]);
    const input = { ...f.input, activation, controlJournals: [{ journalId: control.journal_id, bytes: activation }, { journalId: root.journal_id, bytes: historyTestBytes([root]) }], guardJournals: [{ journalId: guard.journal_id, bytes: historyTestBytes([guard]) }] };
    expect(selectMissionHistory(input).controlReceipts.map((event) => event.id)).toEqual([root.id, control.id]);
    expect(code(() => selectMissionHistory({ ...input, controlJournals: input.controlJournals.slice(0, 1) }))).toBe("history_control_missing");
  });

  it("keeps generation context in journal paths and rejects mixed collection inputs", () => {
    const f = historyGenerationFixture();
    expect(journalPath({ recordHome: "/record-home", missionId: f.missionId, generationId: f.generationId, phase: "construction", journalId: f.journalId })).toContain(`/history/generations/${f.generationId}/construction/${f.journalId}.jsonl`);
    expect(journalPath({ recordHome: "/record-home", missionId: f.missionId, phase: "mission-recovery", journalId: f.control.journal_id, kind: "control" })).toContain(`/history/control/events/${f.control.journal_id}.jsonl`);
    expect(journalPath({ recordHome: "/record-home", missionId: f.missionId, phase: "construction", journalId: f.guard.journal_id, kind: "guard" })).toContain(`/history/control/${f.guard.journal_id}.jsonl`);
    expect(() => journalPath({ recordHome: "/record-home", missionId: f.missionId, generationId: "../escape", phase: "construction", journalId: f.journalId })).toThrow();
    expect(collectHistory(f.missionId, [f.source, { ...f.source, generationId: randomUUID() }], { completeness: "complete", generationId: f.generationId }).issues).toContainEqual(expect.objectContaining({ code: "invalid-source" }));
    const damaged = collectHistory(f.missionId, [{ ...f.legacy, bytes: new Uint8Array([255]) }], { completeness: "complete" });
    expect(code(() => historyState(damaged))).toBe("history_candidate_invalid");
  });
});
