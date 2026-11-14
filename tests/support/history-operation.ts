import { randomUUID } from "node:crypto";
import { historyArchiveIndexDigest, type HistoryArchiveIndex } from "../../packages/cli/src/history/archive-index.js";
import { createHistoryControl, historyDigest, historyManifestDigest, parseHistoryGuard, type HistoryAction, type HistoryInitializationManifest, type HistoryManifest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import { historyOperationKey, type HistoryOperation, type HistoryOperationIntent } from "../../packages/cli/src/history/operation-intent.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "./history-generation.js";

export const historyOperationFixture = (operation: HistoryOperation = "reset") => {
  const f = historyGenerationFixture();
  const decision = "decision:exact-operation";
  const original = { ...f.resetManifest, source_inventory: [{ source_id: "original-source", origin: "original", path: `.kepler/missions/${f.missionId}/history/construction/${f.journalId}.jsonl`, byte_length: f.source.bytes.length, content_version: historyDigest(f.source.bytes) }] };
  const root = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: original, decisionReference: decision, causes: [] });
  const index: HistoryArchiveIndex = { format: "kepler.mission-history-archive", version: 1, mission_id: f.missionId, archive_id: f.archiveId, manifest_hash: historyManifestDigest(original), source_inventory: original.source_inventory, previous_archives: [] };
  let manifest: HistoryManifest = original;
  if (operation === "migrate") {
    manifest = { ...f.manifest, operation: "migrate", source_inventory: original.source_inventory, archive_id: f.archiveId, guide: "referenses/migrations/2026-11-13-mission-history-generations.md", guide_hash: historyDigest("fixture guide"), operation_authority: { kind: "manifest-approval", request_reference: "request:original" } } satisfies HistoryInitializationManifest;
  } else if (operation === "publish") {
    let offset = 0;
    const source = original.source_inventory[0]!;
    const actions = [f.creation, f.prepared, f.unit].map((event): HistoryAction => {
      const length = historyTestBytes([event]).length;
      const action: HistoryAction = { id: randomUUID(), action: "retain", source: { source_id: source.source_id, byte_offset: offset, byte_length: length }, event: null, reason: "Retain the exact checked fixture fact", authority: null, proof: null, loss_reference: null, data_bindings: [], output: { event_id: event.id, journal_id: f.journalId, byte_offset: offset, byte_length: length } };
      offset += length;
      return action;
    });
    manifest = { format: "kepler.mission-history-rebuild", version: 1, mission_id: f.missionId, generation_id: f.generationId, reset_event_id: root.id, archive_id: f.archiveId, archive_inventory_hash: historyArchiveIndexDigest(index), actions, dependency_order: [], candidate_journals: f.manifest.candidate_journals, required_material: { artifact_bindings: [], checkpoints: [], evidence: [] }, expected_state: f.manifest.expected_state, continuation: { operation: "unit.show", unresolved_work: [], required_approvals: [] }, requester: f.resetManifest.requester, reconciliation: f.resetManifest.reconciliation } satisfies HistoryRebuildManifest;
  }
  const control = operation === "reset" ? root : createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest, decisionReference: decision, causes: [operation === "publish" ? root.id : f.creation.id] });
  const archive = operation === "migrate" ? { ...index, manifest_hash: historyManifestDigest(manifest) } : index;
  const guardRoot = operation === "publish" ? root : control;
  const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: f.generationId, control_event_id: guardRoot.id }, randomUUID(), [guardRoot.id]);
  const manifestHash = historyManifestDigest(manifest);
  const intent: HistoryOperationIntent = {
    format: "kepler.mission-history-operation", version: 1,
    key: historyOperationKey({ operation, missionId: f.missionId, generationId: f.generationId, manifestHash, requester: manifest.requester, decisionReference: decision }),
    operation, record_home_origin: "current", mission_id: f.missionId, generation_id: f.generationId, manifest_hash: manifestHash, requester: manifest.requester, decision_reference: decision,
    control, guard: parseHistoryGuard(guard, guardRoot), predecessor: operation === "publish" ? { event: root, bytes_base64: Buffer.from(historyTestBytes([root])).toString("base64") } : null,
    archive_index: archive,
    candidate_journals: operation === "reset" ? [] : f.manifest.candidate_journals.map((journal) => ({ ...journal, bytes_base64: Buffer.from(f.source.bytes).toString("base64") })),
    original_sources: original.source_inventory, original_unavailable: [], activation_input: historyDigest(f.input.activation!), binding_input: null,
    checks: [{ reference: "receipt:verified-reconciliation", content_version: historyDigest("actual fixture receipt bytes") }],
  };
  return { f, manifest, intent, control, decision };
};
