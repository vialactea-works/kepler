import { randomUUID } from "node:crypto";
import { createHistoryControl, historyDigest, type HistoryInitializationManifest, type HistoryResetManifest, type HistoryReconciliation } from "../../packages/cli/src/history/control.js";
import { scanJournalBytes, serializeJournalEvent } from "../../packages/cli/src/history/journal.js";
import { historyState, type HistoryGatewayInput } from "../../packages/cli/src/history/gateway.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";

type HistoryTestEvent = NonNullable<ReturnType<typeof scanJournalBytes>["lines"][number]["event"]>;
export const historyTestEvent = (type: string, data: Record<string, unknown>, journalId: string, causes: readonly string[] = [], id = randomUUID()): HistoryTestEvent => {
  const value = { id, type, phase: "construction", envelope_version: 1, event_version: 1, journal_id: journalId,
    recorded_at: "2026-11-13T00:00:00Z", producer: { name: "kepler", version: "3.1.0" }, caused_by: causes, data };
  const result = scanJournalBytes(new TextEncoder().encode(`${JSON.stringify(value)}\n`));
  if (result.problems.length || !result.lines[0]?.event) throw new Error("Invalid history test event");
  return result.lines[0].event;
};
export const historyTestBytes = (events: readonly HistoryTestEvent[]): Uint8Array => new TextEncoder().encode(events.map((event) => `${serializeJournalEvent(event)}\n`).join(""));
export const historyTestReconciliation: HistoryReconciliation = {
  orchestrator: "agent:orchestrator", affected_workers_terminal: true, effects_reconciled: true, integration_lock_reconciled: true,
  run_references: [], references: [{ reference: "report:reconciliation", purpose: "Confirmed no active workers and checked effects" }], summary: "No affected worker was dispatched; recorded effects were checked.",
};
export const historyGenerationFixture = () => {
  const missionId = randomUUID();
  const generationId = randomUUID();
  const journalId = randomUUID();
  const archiveId = randomUUID();
  const unitId = "2026-11-13-recovery";
  const repository = { repository_id: "record-home", context: { kind: "existing" }, branch: { kind: "current" }, integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" } };
  const creation = historyTestEvent("construction.mission-created", { mission_id: missionId, title: "Recover existing work", request: "Implement the selected work", workflow: "standard", record_home: { repository_id: "record-home" }, contexts: [{ reference: "request:original", purpose: "Original scope" }], repositories: [repository] }, journalId);
  const prepared = historyTestEvent("construction.mission-workspaces-prepared", { mission_id: missionId, repositories: [{ ...repository, branch: "main" }] }, journalId, [creation.id]);
  const unit = historyTestEvent("construction.unit-created", { mission_id: missionId, unit_id: unitId, directory: `construction/units-of-work/${unitId}`, workflow: "standard", initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" } }, journalId, [prepared.id]);
  const bytes = historyTestBytes([creation, prepared, unit]);
  const legacy = { sourceId: `legacy/${journalId}`, missionId, phase: "construction", journalId, bytes };
  const source = { ...legacy, sourceId: `generation/${generationId}/${journalId}`, generationId };
  const binding = { record_home_repository_id: "record-home", mission_id: missionId, workflow: "standard", request_reference: "request:original", unit_ids: [unitId] } as const;
  const manifest: HistoryInitializationManifest = {
    format: "kepler.mission-history-initialization", version: 1, operation: "create", mission_binding: binding, generation_id: generationId,
    source_inventory: [], archive_id: null, guide: null, guide_hash: null,
    candidate_journals: [{ phase: "construction", journal_id: journalId, byte_length: bytes.length, content_version: historyDigest(bytes), reference: `candidate:${generationId}/construction/${journalId}` }],
    expected_state: historyState(collectHistory(missionId, [legacy], { completeness: "complete" })), source_retirement: [], requester: "Requester",
    operation_authority: { kind: "startup-request", request_reference: "request:original" },
  };
  const control = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-13T00:00:01Z", producer: { name: "kepler", version: "3.1.0" }, manifest, decisionReference: "request:original", causes: [creation.id] });
  const guard = historyTestEvent("construction.history-generation-required", { mission_id: missionId, generation_id: generationId, control_event_id: control.id }, randomUUID(), [control.id]);
  const activation = historyTestBytes([control]);
  const input: HistoryGatewayInput = { missionId, activation, controlJournals: [{ journalId: control.journal_id, bytes: activation }], guardJournals: [{ journalId: guard.journal_id, bytes: historyTestBytes([guard]) }], generationSources: [source], legacySources: [legacy], generationEvidence: true, complete: true, pendingRecovery: false };
  const resetManifest: HistoryResetManifest = { format: "kepler.mission-history-reset", version: 1, mission_binding: binding, previous_control: { event_id: null, content_version: null }, source_inventory: [], known_missing_sources: [], archive_id: archiveId, generation_id: generationId, source_retirement: [], requester: "Requester", reason: "Recover uncertain history", reconciliation: historyTestReconciliation, accepted_limits: [] };
  return { missionId, generationId, journalId, archiveId, unitId, creation, prepared, unit, source, legacy, manifest, control, guard, input, resetManifest };
};
