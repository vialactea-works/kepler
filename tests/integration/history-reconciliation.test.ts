import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { historyDigest, historyManifestDigest, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { createNodeHistoryReconciliation, HISTORY_LEAD_RECONCILIATION_FORMAT, HISTORY_LEAD_RECONCILIATION_PURPOSE, historyLeadReconciliationSnapshotReference, serializeHistoryLeadReconciliationReport, type HistoryLeadReconciliationReport } from "../../packages/cli/src/history/reconciliation.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createNodeHistoryRecovery } from "../../packages/cli/src/history/recovery-runtime.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
const encoder = new TextEncoder();
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

const fixture = async () => {
  const repository = await createHistoryRepository();
  roots.push(repository.parent);
  const { root, f, access } = repository;
  const targetGeneration = randomUUID();
  const evidencePath = `.kepler/missions/${f.missionId}/recovery/reconciliation/evidence.txt`;
  const reportPath = `.kepler/missions/${f.missionId}/recovery/reconciliation/reset-${targetGeneration}.json`;
  const reportFile = Path.join(root, reportPath);
  const evidenceFile = Path.join(root, evidencePath);
  await Fs.mkdir(Path.dirname(reportFile), { recursive: true });
  const evidenceBytes = encoder.encode("The stage lead recorded the scope review.\n");
  await Fs.writeFile(evidenceFile, evidenceBytes);
  const beforeReport = await access.storage.snapshot(root, f.missionId);
  const evidenceSource = beforeReport.files.find((file) => file.path === evidencePath)!;
  const evidenceReference = historyLeadReconciliationSnapshotReference(evidenceSource.sourceId);
  const active = beforeReport.files.find((file) => file.path.endsWith("/history/control/active.json"))!;
  const report: HistoryLeadReconciliationReport = {
    format: HISTORY_LEAD_RECONCILIATION_FORMAT,
    version: 1,
    mission: {
      mission_id: f.missionId,
      record_home_repository_id: f.manifest.mission_binding.record_home_repository_id,
      workflow: f.manifest.mission_binding.workflow,
      request_reference: f.manifest.mission_binding.request_reference,
    },
    prior_history: { generation_id: f.generationId, history_version: f.control.id, content_version: historyDigest(active.bytes) },
    target_generation_id: targetGeneration,
    attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
    original_inventory: historyInventory(beforeReport),
    original_inventory_hash: historyDigest(canonicalJson(historyInventory(beforeReport))),
    scope_evidence_references: [evidenceReference],
    affected_workers: [],
    materials: [{ reference: evidenceReference, purpose: "lead reconciliation evidence", content_version: historyDigest(evidenceBytes) }],
    effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } },
    unresolved_items: [],
    unknown_items: [],
  };
  const reportBytes = serializeHistoryLeadReconciliationReport(report);
  await Fs.writeFile(reportFile, reportBytes);
  const snapshot = await access.storage.snapshot(root, f.missionId);
  const reportSource = snapshot.files.find((file) => file.path === reportPath)!;
  const reportReference = historyLeadReconciliationSnapshotReference(reportSource.sourceId);
  const manifest: HistoryResetManifest = {
    ...f.resetManifest,
    archive_id: randomUUID(),
    generation_id: targetGeneration,
    previous_control: { event_id: f.control.id, content_version: historyDigest(active.bytes) },
    source_inventory: historyInventory(snapshot),
    reconciliation: {
      ...f.resetManifest.reconciliation,
      orchestrator: "agent:lead",
      run_references: [],
      references: [
        { reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE },
        { reference: evidenceReference, purpose: "lead reconciliation evidence" },
      ],
    },
  };
  return { repository, evidenceBytes, evidenceFile, reportBytes, reportFile, reportReference, snapshot, manifest, request: { phase: "preview" as const, recordHome: root, manifest, snapshot, intent: null } };
};

describe("real lead reconciliation evidence", () => {
  it("resolves only retained mission bytes and has no filesystem effects", async () => {
    const t = await fixture();
    const before = await t.repository.access.storage.snapshot(t.repository.root, t.repository.f.missionId);
    const beforeInventory = historyInventory(before);
    const verify = createNodeHistoryReconciliation(t.repository.access);
    const result = await verify(t.request);
    expect(result).toMatchObject({ status: "valid", reference: t.reportReference, content_version: historyDigest(t.reportBytes) });
    const after = await t.repository.access.storage.snapshot(t.repository.root, t.repository.f.missionId);
    expect(historyInventory(after)).toEqual(beforeInventory);
    expect(await Fs.readFile(t.evidenceFile)).toEqual(Buffer.from(t.evidenceBytes));
    expect(await Fs.readFile(t.reportFile)).toEqual(Buffer.from(t.reportBytes));
  });

  it("applies and retries through the production recovery factory without fixture verifier callbacks", async () => {
    const t = await fixture();
    const scope = { recordHome: t.repository.root, missionId: t.repository.f.missionId };
    const recovery = createNodeHistoryRecovery(scope, { name: "kepler", version: "fixture-current" });
    const input = { phase: "apply", manifest: t.manifest, approved_manifest_hash: historyManifestDigest(t.manifest), requester: t.manifest.requester, decision_reference: "decision:exact-factory-reset" };
    const result = await recovery.operations.execute("reset", scope, input);
    expect(result).toMatchObject({ mode: "recovering", execution_started: false, already_applied: false });
    const selected = await recovery.access.read(scope.recordHome, scope.missionId);
    expect(selected.history.events).toEqual([]);
    expect(selected.pendingRecovery).toBe(false);
    expect(await recovery.operations.execute("reset", scope, input)).toMatchObject({ already_applied: true, receipt: result.receipt });
    expect(await Fs.readFile(t.evidenceFile)).toEqual(Buffer.from(t.evidenceBytes));
  });

  it("rejects evidence changed after the captured source inventory", async () => {
    const t = await fixture();
    const verify = createNodeHistoryReconciliation(t.repository.access);
    expect(await verify(t.request)).toMatchObject({ status: "valid" });
    await Fs.writeFile(t.evidenceFile, "changed evidence\n");
    expect(await verify(t.request)).toMatchObject({ status: "invalid" });
  });
});
