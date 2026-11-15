import { randomUUID } from "node:crypto";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyArchiveIndexDigest } from "../../packages/cli/src/history/archive-index.js";
import { historyDigest, historyManifestDigest, type HistoryControl } from "../../packages/cli/src/history/control.js";
import { HistoryDrafts } from "../../packages/cli/src/history/drafts.js";
import { scanJournalBytes } from "../../packages/cli/src/history/journal.js";
import { HistoryReset } from "../../packages/cli/src/history/reset.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import type { ReconstructionArchive, ReconstructionDependencies, ReconstructionPlan, ReconstructionPlanAction } from "../../packages/cli/src/history/reconstruction.js";
import { historyAccessFixture } from "./history-access.js";
import { historyGenerationFixture, historyTestReconciliation } from "./history-generation.js";


export const historyReconstructionPlan = (f: ReturnType<typeof historyGenerationFixture>, reset: HistoryControl, archive: ReconstructionArchive): ReconstructionPlan => {
  const actions: ReconstructionPlanAction[] = [];
  for (const file of archive.files.filter((file) => file.path.startsWith(`.kepler/missions/${f.missionId}/history/`))) {
    const retained = file.path.includes(`/generations/${f.generationId}/construction/`);
    for (const line of scanJournalBytes(file.bytes).lines) {
      actions.push({ id: randomUUID(), action: retained ? "retain" : "exclude", source: { source_id: file.source_id, byte_offset: line.byteOffset, byte_length: line.byteLength + (line.terminated ? 1 : 0) }, event: null, reason: retained ? "Retain the checked bootstrap facts" : "Preserve the superseded control outside progress", authority: null, proof: null, loss_reference: null, data_bindings: [] });
    }
  }
  const addition: ReconstructionPlanAction = { id: randomUUID(), action: "add", source: null, event: { phase: "construction", type: "construction.interaction-recorded", event_version: 1, data: { mission_id: f.missionId, unit_id: f.unitId, participants: ["requester"], content: "Continue the selected work", references: [] }, causes: [{ event_id: f.unit.id, action_id: null }] }, reason: "Retain requester-confirmed continuation", authority: { decision_reference: "decision:fixture-continuation", artifact_bindings: [] }, proof: null, loss_reference: null, data_bindings: [] };
  const plan: ReconstructionPlan = { format: "kepler.mission-history-reconstruction-plan", version: 1, mode: "reconstruct", mission_id: f.missionId, generation_id: reset.data.generation_id, reset_event_id: reset.id, archive_id: archive.index.archive_id, archive_inventory_hash: historyArchiveIndexDigest(archive.index), actions: [...actions, addition].sort((a, b) => (a.source?.source_id ?? "").localeCompare(b.source?.source_id ?? "") || (a.source?.byte_offset ?? -1) - (b.source?.byte_offset ?? -1) || a.id.localeCompare(b.id)), dependency_order: [addition.id], required_material: { artifact_bindings: [], checkpoints: [], evidence: [] }, continuation: { operation: "construction.unit.show", unresolved_work: [], required_approvals: [] }, requester: "Requester", reconciliation: historyTestReconciliation, clean_restart: null };
  return plan;
};

export const historyReconstructionFixture = async () => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  const archives = new HistoryArchives(h.storage);
  const manifest = { ...f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: f.control.id, content_version: historyDigest(f.input.activation!) }, source_inventory: historyInventory(await h.storage.snapshot("/record", f.missionId)) };
  const resetService = new HistoryReset({ access: h.access, archives, next: randomUUID, clock: () => new Date("2026-11-14T01:00:00.000Z"), producer: { name: "kepler", version: "fixture-reset" }, verifyScope: async () => ({ status: "valid", reference: "fixture:lead-scope", content_version: historyDigest("fixture scope receipt") }) });
  await resetService.execute({ recordHome: "/record", missionId: f.missionId }, { phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:fixture-reset" });
  const reset = (await h.access.read("/record", f.missionId)).control!;
  const archive = await archives.verify("/record", f.missionId, manifest.archive_id);
  const plan = historyReconstructionPlan(f, reset, archive);
  let allocated = 0;
  const calls = { authority: 0, material: 0, continuation: 0 };
  const verification: Pick<ReconstructionDependencies, "verifyAuthority" | "verifyMaterial" | "verifyContinuation"> = {
    verifyAuthority: async () => { calls.authority++; return { status: "valid", reference: "fixture:authority" }; },
    verifyMaterial: async () => { calls.material++; return { status: "valid", reference: "fixture:material" }; },
    verifyContinuation: async () => { calls.continuation++; return { status: "valid", reference: "fixture:continuation" }; },
  };
  const runtime = { access: h.access, archives, identity: () => { allocated++; return randomUUID(); }, clock: () => new Date("2026-11-14T02:00:00.000Z"), producer: { name: "kepler", version: "fixture-candidate" }, ...verification };
  return { f, h, archive, reset, manifest, plan, runtime, drafts: new HistoryDrafts(runtime), scope: { recordHome: "/record", missionId: f.missionId }, request: { candidate_id: randomUUID(), plan }, allocated: () => allocated, calls };
};
