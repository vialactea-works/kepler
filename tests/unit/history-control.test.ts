import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertHistoryVersion,
  HistoryError,
  historyDigest,
  historyManifestDigest,
  historyManifestMission,
  historyMode,
  parseHistoryControl,
  parseHistoryManifest,
  safeHistoryRelativePath,
  type HistoryInitializationManifest,
  type HistoryRebuildManifest,
  type HistoryResetManifest,
} from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";

const missionId = randomUUID();
const generationId = randomUUID();
const archiveId = randomUUID();
const hash = historyDigest("retained bytes");
const reconciliation = {
  orchestrator: "agent:orchestrator",
  affected_workers_terminal: true,
  effects_reconciled: true,
  integration_lock_reconciled: true,
  run_references: [],
  references: [{ reference: "report:reconciliation", purpose: "Confirmed workers and effects" }],
  summary: "No worker was dispatched; the original effects have been checked.",
} as const;
const binding = { record_home_repository_id: "record-home", mission_id: missionId, workflow: "standard", request_reference: "request:original", unit_ids: ["2026-11-13-recovery"] } as const;
const reset = (): HistoryResetManifest => ({
  format: "kepler.mission-history-reset", version: 1, mission_binding: binding,
  previous_control: { event_id: null, content_version: null }, source_inventory: [], known_missing_sources: [],
  archive_id: archiveId, generation_id: generationId, source_retirement: [], requester: "Requester", reason: "Recover the existing mission",
  reconciliation, accepted_limits: [],
});
const initial = (): HistoryInitializationManifest => ({
  format: "kepler.mission-history-initialization", version: 1, operation: "create", mission_binding: binding,
  generation_id: generationId, source_inventory: [], archive_id: null, guide: null, guide_hash: null,
  candidate_journals: [{ phase: "construction", journal_id: randomUUID(), byte_length: 10, content_version: hash, reference: "candidate:initial" }],
  expected_state: { units: [] }, source_retirement: [], requester: "Requester",
  operation_authority: { kind: "startup-request", request_reference: "request:original" },
});
const rebuilt = (): HistoryRebuildManifest => {
  const candidateJournals = initial().candidate_journals;
  const candidate = candidateJournals[0]!;
  const actionId = randomUUID();
  return {
    format: "kepler.mission-history-rebuild", version: 1, mission_id: missionId, generation_id: generationId,
    reset_event_id: randomUUID(), archive_id: archiveId, archive_inventory_hash: hash,
    actions: [{
      id: actionId, action: "add", source: null,
      event: { phase: "construction", type: "construction.interaction-recorded", event_version: 1, data: { mission_id: missionId }, causes: [] },
      reason: "Fixture reconstruction action", authority: null, proof: null, loss_reference: null, data_bindings: [],
      output: { event_id: randomUUID(), journal_id: candidate.journal_id, byte_offset: 0, byte_length: candidate.byte_length },
    }], dependency_order: [actionId], candidate_journals: candidateJournals,
    required_material: { artifact_bindings: [], checkpoints: [], evidence: [] },
    expected_state: { units: [] }, continuation: { operation: "inspect the selected unit", unresolved_work: [], required_approvals: [] },
    requester: "Requester", reconciliation,
  };
};
const control = (manifest: HistoryResetManifest | HistoryInitializationManifest | HistoryRebuildManifest) => ({
  id: randomUUID(), phase: "mission-recovery", envelope_version: 1, event_version: 1, journal_id: randomUUID(),
  recorded_at: "2026-11-13T00:00:00Z", producer: { name: "kepler", version: "3.1.0" },
  type: manifest.format === "kepler.mission-history-reset" ? "mission.history-reset" : manifest.format === "kepler.mission-history-rebuild" ? "mission.history-rebuilt" : "mission.history-initialized",
  caused_by: manifest.format === "kepler.mission-history-rebuild" ? [manifest.reset_event_id] : manifest.format === "kepler.mission-history-initialization" ? [randomUUID()] : manifest.previous_control.event_id ? [manifest.previous_control.event_id] : [],
  data: { mission_id: missionId, generation_id: generationId, manifest, manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "conversation:approved-the-exact-manifest" },
});

const errorCode = (operation: () => unknown): string => {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(HistoryError);
    return (error as HistoryError).code;
  }
  throw new Error("The operation should have failed");
};

describe("history manifest and control contracts", () => {
  it("parses all supported manifests and binds canonical content without changing reference order", () => {
    for (const manifest of [reset(), initial(), rebuilt()]) {
      expect(parseHistoryManifest(JSON.stringify(manifest))).toEqual(manifest);
      expect(historyManifestMission(manifest)).toBe(missionId);
      expect(historyManifestDigest({ ...manifest } as typeof manifest)).toBe(historyManifestDigest(manifest));
    }
    const a = reset();
    const b = { ...a, reconciliation: { ...a.reconciliation, references: [...a.reconciliation.references, { reference: "report:two", purpose: "Other retained facts" }] } };
    expect(historyManifestDigest(b)).not.toBe(historyManifestDigest(a));
    expect(historyManifestDigest({ ...b, reconciliation: { ...b.reconciliation, references: [...b.reconciliation.references].reverse() } })).not.toBe(historyManifestDigest(b));
    expect(canonicalJson({ z: [{ b: 2, a: 1 }], a: null })).toBe('{"a":null,"z":[{"a":1,"b":2}]}');
    for (const input of [undefined, NaN, Infinity, { invalid: undefined }]) expect(() => canonicalJson(input)).toThrow();
  });

  it("rejects values that cannot be represented without changing their meaning", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    let getterCalls = 0;
    const getter = Object.defineProperty({}, "value", { enumerable: true, get: () => { getterCalls += 1; return true; } });
    const hidden = Object.defineProperty({}, "value", { enumerable: false, value: true });
    const symbol = { [Symbol("hidden")]: true };
    for (const value of [cycle, new Date(), new Map(), getter, hidden, symbol, Array(1), Object.assign([1], { extra: true })]) {
      expect(() => canonicalJson(value)).toThrow();
    }
    expect(getterCalls).toBe(0);
    const shared = { value: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"value":1},{"value":1}]');
    expect(canonicalJson(Object.assign(Object.create(null), { value: 1 }))).toBe('{"value":1}');
    expect(historyManifestDigest({ ...reset(), reason: "é" })).not.toBe(historyManifestDigest({ ...reset(), reason: "e\u0301" }));
  });

  it.each([
    { case: "unknown field", change: (value: Record<string, unknown>) => ({ ...value, force: true }) },
    { case: "partial mission", change: (value: Record<string, unknown>) => ({ ...value, mission_binding: { ...binding, mission_id: missionId.slice(0, 8) } }) },
    { case: "live worker", change: (value: Record<string, unknown>) => ({ ...value, reconciliation: { ...reconciliation, affected_workers_terminal: false } }) },
    { case: "unknown lock", change: (value: Record<string, unknown>) => ({ ...value, reconciliation: { ...reconciliation, integration_lock_reconciled: false } }) },
    { case: "missing previous bytes", change: (value: Record<string, unknown>) => ({ ...value, previous_control: { event_id: randomUUID(), content_version: null } }) },
  ])("rejects $case before effects", ({ change }) => {
    expect(() => parseHistoryManifest(change({ ...reset() }))).toThrow(HistoryError);
  });

  it("rejects duplicate JSON keys, unsupported versions, extra values and non-JSON data", () => {
    for (const value of ['{"format":"one","format":"two"}', `${JSON.stringify(reset())} {}`, { ...reset(), version: 2 }, { ...reset(), accepted_limits: [undefined] }]) {
      expect(() => parseHistoryManifest(value)).toThrow(HistoryError);
    }
  });

  it("restricts retirement to exact mission-owned legacy files backed by the selected archive", () => {
    const path = `.kepler/missions/${missionId}/history/construction/${randomUUID()}.jsonl`;
    const source = { source_id: "record-home", origin: "record-home", path, byte_length: 10, content_version: hash };
    const retire = { source_id: source.source_id, path, byte_length: 10, content_version: hash, archive_reference: `local-archive:${archiveId}` };
    expect(parseHistoryManifest({ ...reset(), source_inventory: [source], source_retirement: [retire] }).format).toBe("kepler.mission-history-reset");
    for (const bad of [
      { ...retire, content_version: historyDigest("changed") },
      { ...retire, archive_reference: `local-archive:${randomUUID()}` },
      { ...retire, path: `.kepler/missions/${randomUUID()}/history/construction/other.jsonl` },
    ]) expect(() => parseHistoryManifest({ ...reset(), source_inventory: [source], source_retirement: [bad] })).toThrow(HistoryError);
    for (const target of [`history/control/${randomUUID()}.jsonl`, `history/generations/${generationId}/construction/x.jsonl`, "history", "history/construction/../control/x.jsonl", "../outside/history/construction/x.jsonl", "unrelated/history/construction/x.jsonl"]) {
      const moved = { ...source, path: target };
      expect(() => parseHistoryManifest({ ...reset(), source_inventory: [moved], source_retirement: [{ ...retire, path: target }] })).toThrow(HistoryError);
    }
  });

  it("requires distinct startup and migration authority and complete reconstruction actions", () => {
    expect(() => parseHistoryManifest({ ...initial(), operation: "migrate" })).toThrow(HistoryError);
    expect(() => parseHistoryManifest({ ...initial(), archive_id: archiveId })).toThrow(HistoryError);
    const action = { id: randomUUID(), action: "add", source: null, event: null, reason: "Missing start", authority: null, proof: null };
    expect(() => parseHistoryManifest({ ...rebuilt(), actions: [action] })).toThrow(HistoryError);
    expect(() => parseHistoryManifest({ ...rebuilt(), actions: [{ ...action, action: "retain" }] })).toThrow(HistoryError);
  });

  it("validates exact control payloads, manifest hashes and direct control causes", () => {
    for (const manifest of [reset(), initial(), rebuilt()]) {
      const event = control(manifest);
      expect(parseHistoryControl(JSON.stringify(event)).data.manifest).toEqual(manifest);
      expect(historyMode(parseHistoryControl(event))).toBe(manifest.format === "kepler.mission-history-reset" ? "recovering" : "active");
      for (const changed of [
        { ...event, id: "partial" }, { ...event, journal_id: "partial" },
        { ...event, data: { ...event.data, manifest_hash: hash } },
        { ...event, data: { ...event.data, mission_id: randomUUID() } },
        { ...event, data: { ...event.data, extra: true } },
      ]) expect(() => parseHistoryControl(changed)).toThrow(HistoryError);
    }
    expect(() => parseHistoryControl({ ...control(reset()), caused_by: [randomUUID()] })).toThrow(HistoryError);
    expect(() => parseHistoryControl({ ...control(rebuilt()), caused_by: [] })).toThrow(HistoryError);
    expect(() => parseHistoryControl({ ...control(initial()), caused_by: [] })).toThrow(HistoryError);
  });

  it("rejects absent, stale and recovering write bindings", () => {
    const active = parseHistoryControl(control(initial()));
    expect(errorCode(() => assertHistoryVersion(undefined, undefined))).toBe("history_migration_required");
    expect(errorCode(() => assertHistoryVersion(active, undefined))).toBe("history_version_required");
    expect(errorCode(() => assertHistoryVersion(active, randomUUID()))).toBe("history_version_mismatch");
    const pending = parseHistoryControl(control(reset()));
    expect(errorCode(() => assertHistoryVersion(pending, pending.id))).toBe("history_recovery_pending");
    expect(() => assertHistoryVersion(active, active.id)).not.toThrow();
  });

  it.each(["", "/absolute", "../escape", "a/../b", "a//b", "a\\b", "a/./b", "a\0b"])("rejects unsafe source path %j", (path) => {
    expect(safeHistoryRelativePath(path)).toBe(false);
  });
});
