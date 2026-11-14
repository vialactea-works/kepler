import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryAccess } from "../../packages/cli/src/history/access.js";
import { createHistoryControl, historyDigest, historyManifestDigest, parseHistoryGuard, type HistoryInitializationManifest, type HistoryRebuildManifest, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import { canonicalJson, serializeJournalEvent } from "../../packages/cli/src/history/journal.js";
import { createHistoryReconciliationEvidenceReader, createNodeHistoryReconciliation, HISTORY_LEAD_RECONCILIATION_PURPOSE, HISTORY_LEAD_RECONCILIATION_FORMAT, historyLeadReconciliationSnapshotReference, parseHistoryLeadReconciliationReport, serializeHistoryLeadReconciliationReport, type HistoryLeadReconciliationReport, type HistoryReconciliationRequest } from "../../packages/cli/src/history/reconciliation.js";
import { HistoryReset, type HistoryResetRuntime } from "../../packages/cli/src/history/reset.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { HistoryOperations } from "../../packages/cli/src/history/operations.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";
import type { HistoryRepositoryContext } from "../../packages/cli/src/history/files.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const encoder = new TextEncoder();

const fixture = async (options: {
  readonly workers?: readonly string[];
  readonly evidence?: Uint8Array;
  readonly report?: (report: HistoryLeadReconciliationReport) => unknown;
  readonly context?: HistoryRepositoryContext;
} = {}) => {
  const generation = historyGenerationFixture();
  const targetGeneration = randomUUID();
  const evidence = options.evidence ?? encoder.encode("The lead checked the affected scope.\n");
  const evidencePath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/evidence.txt`;
  const reportPath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/reset-${targetGeneration}.json`;
  const history = historyAccessFixture(generation, { extraEntries: new Map([[`/record/${evidencePath}`, evidence]]), ...(options.context ? { context: options.context } : {}) });
  const initial = await history.storage.snapshot("/record", generation.missionId);
  const evidenceSource = initial.files.find((file) => file.path === evidencePath)!;
  const evidenceReference = historyLeadReconciliationSnapshotReference(evidenceSource.sourceId);
  const active = initial.files.find((file) => file.path.endsWith("/history/control/active.json"))!;
  const workerReferences = [...(options.workers ?? [])].sort();
  const baseReport: HistoryLeadReconciliationReport = {
    format: HISTORY_LEAD_RECONCILIATION_FORMAT,
    version: 1,
    mission: {
      mission_id: generation.missionId,
      record_home_repository_id: generation.manifest.mission_binding.record_home_repository_id,
      workflow: generation.manifest.mission_binding.workflow,
      request_reference: generation.manifest.mission_binding.request_reference,
    },
    prior_history: { generation_id: generation.generationId, history_version: generation.control.id, content_version: historyDigest(active.bytes) },
    target_generation_id: targetGeneration,
    attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
    original_inventory: historyInventory(initial),
    original_inventory_hash: historyDigest(canonicalJson(historyInventory(initial))),
    scope_evidence_references: [evidenceReference],
    affected_workers: workerReferences.map((run_reference) => ({
      run_reference,
      terminal_confirmation: { outcome: "terminated", confirmed_by: "agent:lead", evidence_references: [evidenceReference] },
    })),
    materials: [{ reference: evidenceReference, purpose: "lead reconciliation evidence", content_version: historyDigest(evidence) }],
    effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } },
    unresolved_items: [],
    unknown_items: [],
  };
  const reportValue = options.report ? options.report(baseReport) : baseReport;
  const reportBytes = !options.report && evidence.length > 0 ? serializeHistoryLeadReconciliationReport(reportValue) : encoder.encode(`${canonicalJson(reportValue)}\n`);
  const reportSourceId = `current:${reportPath}`;
  const reportReference = historyLeadReconciliationSnapshotReference(reportSourceId);
  history.entries.set(`/record/${reportPath}`, reportBytes);
  const snapshot = await history.storage.snapshot("/record", generation.missionId);
  const inventory = historyInventory(snapshot);
  const manifest: HistoryResetManifest = {
    ...generation.resetManifest,
    archive_id: randomUUID(),
    generation_id: targetGeneration,
    previous_control: { event_id: generation.control.id, content_version: historyDigest(active.bytes) },
    source_inventory: inventory,
    reconciliation: {
      ...generation.resetManifest.reconciliation,
      orchestrator: "agent:lead",
      run_references: workerReferences,
      references: [
        { reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE },
        { reference: evidenceReference, purpose: "lead reconciliation evidence" },
      ],
    },
  };
  const request: HistoryReconciliationRequest = { phase: "preview", recordHome: "/record", manifest, snapshot, intent: null };
  const verify = createNodeHistoryReconciliation(history.access);
  const verifyScope: HistoryResetRuntime["verifyScope"] = verify;
  return { generation, history, evidencePath, evidence, reportPath, reportBytes, reportReference, evidenceReference, snapshot, manifest, request, verify, verifyScope };
};

const reportFor = (input: {
  readonly mission: HistoryLeadReconciliationReport["mission"];
  readonly targetGeneration: string;
  readonly prior: HistoryLeadReconciliationReport["prior_history"];
  readonly inventory: ReturnType<typeof historyInventory>;
  readonly evidenceSource: { readonly sourceId: string };
  readonly evidence: Uint8Array;
}): { readonly report: HistoryLeadReconciliationReport; readonly evidenceReference: string } => {
  const evidenceReference = historyLeadReconciliationSnapshotReference(input.evidenceSource.sourceId);
  const report: HistoryLeadReconciliationReport = {
    format: HISTORY_LEAD_RECONCILIATION_FORMAT,
    version: 1,
    mission: input.mission,
    prior_history: input.prior,
    target_generation_id: input.targetGeneration,
    attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
    original_inventory: input.inventory,
    original_inventory_hash: historyDigest(canonicalJson(input.inventory)),
    scope_evidence_references: [evidenceReference],
    affected_workers: [],
    materials: [{ reference: evidenceReference, purpose: "lead reconciliation evidence", content_version: historyDigest(input.evidence) }],
    effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } },
    unresolved_items: [],
    unknown_items: [],
  };
  return { report, evidenceReference };
};

describe("provider-neutral lead reconciliation evidence", () => {
  it("accepts zero workers and complete multi-worker coverage", async () => {
    const empty = await fixture();
    await expect(empty.verify(empty.request)).resolves.toMatchObject({ status: "valid", reference: empty.reportReference, content_version: historyDigest(empty.reportBytes) });
    const multiple = await fixture({ workers: ["run:worker-b", "run:worker-a"] });
    await expect(multiple.verify(multiple.request)).resolves.toMatchObject({ status: "valid" });
    expect(typeof multiple.verifyScope).toBe("function");
  });

  it("validates real reset application under its owned fence", async () => {
    const t = await fixture();
    const operation = new HistoryReset({ access: t.history.access, archives: new HistoryArchives(t.history.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture" }, verifyScope: t.verifyScope });
    await expect(operation.execute({ recordHome: "/record", missionId: t.generation.missionId }, { phase: "apply", manifest: t.manifest, approved_manifest_hash: historyManifestDigest(t.manifest), requester: t.manifest.requester, decision_reference: "decision:exact-reset" })).resolves.toMatchObject({ mode: "recovering" });
  });

  it("publishes a checked draft without a circular report or candidate hash dependency", async () => {
    const t = await historyReconstructionFixture();
    const evidencePath = `.kepler/missions/${t.f.missionId}/recovery/reconciliation/publication-evidence.txt`;
    const evidence = encoder.encode("The lead checked the published reconstruction scope.\n");
    t.h.entries.set(`/record/${evidencePath}`, evidence);
    const initial = await t.h.storage.snapshot("/record", t.f.missionId);
    const evidenceSource = initial.files.find((file) => file.path === evidencePath)!;
    const active = initial.files.find((file) => file.path.endsWith("/control/active.json"))!;
    const reportPath = `.kepler/missions/${t.f.missionId}/recovery/reconciliation/publish-${t.plan.generation_id}.json`;
    const reportReference = historyLeadReconciliationSnapshotReference(`current:${reportPath}`);
    const preparedReport = reportFor({ mission: { mission_id: t.f.missionId, record_home_repository_id: "record-home", workflow: "standard", request_reference: "request:original" }, targetGeneration: t.plan.generation_id, prior: { generation_id: t.plan.generation_id, history_version: t.reset.id, content_version: historyDigest(active.bytes) }, inventory: historyInventory(initial), evidenceSource, evidence });
    const reportBytes = serializeHistoryLeadReconciliationReport(preparedReport.report);
    t.h.entries.set(`/record/${reportPath}`, reportBytes);
    const references = [{ reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE }, { reference: preparedReport.evidenceReference, purpose: "lead reconciliation evidence" }];
    const plan = { ...t.plan, reconciliation: { ...t.plan.reconciliation, orchestrator: "agent:lead", references }, required_material: { ...t.plan.required_material, evidence: [{ reference: reportReference, content_version: historyDigest(reportBytes) }, { reference: preparedReport.evidenceReference, content_version: historyDigest(evidence) }] } };
    const prepared = await t.drafts.prepare(t.scope, { ...t.request, plan });
    const manifest = prepared.manifest as HistoryRebuildManifest;
    const operations = new HistoryOperations({ access: t.h.access, archives: new HistoryArchives(t.h.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture-publication" }, verifyScope: createNodeHistoryReconciliation(t.h.access), verifyCandidate: (scope, candidate) => t.drafts.verify(scope, candidate) });
    await expect(operations.execute("publish", t.scope, { phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:exact-publication" })).resolves.toMatchObject({ mode: "active" });
  });

  it("accepts a declared missing repository input but rejects an undeclared loss", async () => {
    const unavailable = { id: "missing-worktree", path: "/workspace/peer", kind: "missing" as const, reason: "The registered worktree is absent." };
    const context: HistoryRepositoryContext = {
      recordHome: "/record", commonDirectory: "/git",
      origins: [{ id: "current", label: "record-home", root: "/record" }],
      unavailableOrigins: [unavailable],
    };
    const t = await fixture({ context });
    const reference = `missing-worktree:.kepler/missions/${t.generation.missionId}`;
    const manifest = { ...t.manifest, known_missing_sources: [{ reference, reason: "The worktree is unavailable.", consequences: "The lead reviewed the retained task evidence." }] };
    await expect(t.verify({ ...t.request, manifest })).resolves.toMatchObject({ status: "valid" });
    await expect(t.verify({ ...t.request, manifest: { ...t.manifest, known_missing_sources: [] } })).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects mismatched mission, generation, prior history, inventory, and worker coverage", async () => {
    const baseline = await fixture({ workers: ["run:worker-a"] });
    const wrongGeneration = { ...baseline.request, manifest: { ...baseline.manifest, generation_id: randomUUID() } } as HistoryReconciliationRequest;
    await expect(baseline.verify(wrongGeneration)).resolves.toMatchObject({ status: "invalid" });
    const wrongInventory = { ...baseline.request, manifest: { ...baseline.manifest, source_inventory: baseline.manifest.source_inventory.slice(1) } } as HistoryReconciliationRequest;
    await expect(baseline.verify(wrongInventory)).resolves.toMatchObject({ status: "invalid" });
    const wrongWorker = await fixture({ workers: ["run:worker-a"], report: (report) => ({ ...report, affected_workers: [] }) });
    await expect(wrongWorker.verify(wrongWorker.request)).resolves.toMatchObject({ status: "invalid" });
    const wrongPrior = await fixture({ report: (report) => ({ ...report, prior_history: null }) });
    await expect(wrongPrior.verify(wrongPrior.request)).resolves.toMatchObject({ status: "invalid" });
    const wrongMission = await fixture({ report: (report) => ({ ...report, mission: { ...report.mission, mission_id: randomUUID() } }) });
    await expect(wrongMission.verify(wrongMission.request)).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects duplicate JSON keys before schema validation", () => {
    expect(() => parseHistoryLeadReconciliationReport('{"format":"kepler.history-lead-reconciliation","format":"kepler.history-lead-reconciliation"}')).toThrow();
  });

  it("rejects unknown fields, duplicate references, unsafe references, and unresolved effects", async () => {
    const unknown = await fixture({ report: (report) => ({ ...report, unexpected: true }) });
    await expect(unknown.verify(unknown.request)).resolves.toMatchObject({ status: "invalid" });
    const unresolved = await fixture({ report: (report) => ({ ...report, unresolved_items: ["repository state unknown"] }) });
    await expect(unresolved.verify(unresolved.request)).resolves.toMatchObject({ status: "invalid" });
    const unsafe = await fixture({ report: (report) => ({ ...report, materials: [{ ...report.materials[0]!, reference: "file:///etc/passwd" }], scope_evidence_references: ["file:///etc/passwd"] }) });
    await expect(unsafe.verify(unsafe.request)).resolves.toMatchObject({ status: "invalid" });
    const duplicate = await fixture();
    const references = duplicate.manifest.reconciliation.references;
    const duplicatedManifest = { ...duplicate.manifest, reconciliation: { ...duplicate.manifest.reconciliation, references: [...references, references[1]!] } };
    await expect(duplicate.verify({ ...duplicate.request, manifest: duplicatedManifest })).resolves.toMatchObject({ status: "invalid" });
  });

  it("accepts a healthy migration through the same evidence boundary", async () => {
    const generation = historyGenerationFixture();
    const targetGeneration = randomUUID();
    const archiveId = randomUUID();
    const evidence = encoder.encode("The lead reviewed the migration scope.\n");
    const legacyPath = `.kepler/missions/${generation.missionId}/history/construction/${generation.journalId}.jsonl`;
    const evidencePath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/evidence.txt`;
    const reportPath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/migrate-${targetGeneration}.json`;
    const history = historyAccessFixture(generation);
    for (const key of [...history.entries.keys()]) if (key.startsWith(`/record/.kepler/missions/${generation.missionId}/history/`)) history.entries.delete(key);
    history.entries.delete(history.bindingPath);
    history.entries.set(`/record/${legacyPath}`, generation.source.bytes);
    history.entries.set(`/record/${evidencePath}`, evidence);
    const initial = await history.storage.snapshot("/record", generation.missionId);
    const evidenceSource = initial.files.find((file) => file.path === evidencePath)!;
    const preparedReport = reportFor({
      mission: {
        mission_id: generation.missionId,
        record_home_repository_id: generation.manifest.mission_binding.record_home_repository_id,
        workflow: generation.manifest.mission_binding.workflow,
        request_reference: generation.manifest.mission_binding.request_reference,
      },
      targetGeneration, prior: null, inventory: historyInventory(initial), evidenceSource, evidence,
    });
    history.entries.set(`/record/${reportPath}`, encoder.encode(`${canonicalJson(preparedReport.report)}\n`));
    const snapshot = await history.storage.snapshot("/record", generation.missionId);
    const legacy = historyInventory(snapshot).find((source) => source.path === legacyPath)!;
    const manifest: HistoryInitializationManifest = {
      ...generation.manifest,
      operation: "migrate",
      generation_id: targetGeneration,
      source_inventory: historyInventory(snapshot),
      archive_id: archiveId,
      guide: "docs/lifecycle-migration.md",
      guide_hash: historyDigest("approved migration guide"),
      source_retirement: [{ source_id: legacy.source_id, path: legacy.path, byte_length: legacy.byte_length, content_version: legacy.content_version, archive_reference: `local-archive:${archiveId}` }],
      operation_authority: { kind: "manifest-approval", request_reference: "decision:migrate" },
    };
    const verify = createNodeHistoryReconciliation(history.access);
    const result = await verify({ phase: "preview", recordHome: "/record", manifest, snapshot, intent: null });
    expect(result.status === "valid" ? result.status : result.reason).toBe("valid");
    expect(result).toMatchObject({ status: "valid", reference: `snapshot:current:${reportPath}` });
  });

  it("accepts a publication report whose bytes are bound by required material", async () => {
    const generation = historyGenerationFixture();
    const targetGeneration = generation.generationId;
    const history = historyAccessFixture(generation);
    const resetControl = createHistoryControl({
      id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-14T00:00:00.000Z",
      producer: { name: "kepler", version: "fixture" }, manifest: generation.resetManifest,
      decisionReference: "decision:prior-reset", causes: [],
    });
    const controlBytes = encoder.encode(`${serializeJournalEvent(resetControl)}\n`);
    history.entries.set(history.bindingPath, history.encode({ ...history.binding, generation_id: targetGeneration, history_version: resetControl.id, selection_hash: historyDigest(controlBytes) }));
    const guard = parseHistoryGuard({
      id: randomUUID(), phase: "construction", type: "construction.history-generation-required",
      envelope_version: 1, event_version: 1, journal_id: randomUUID(), recorded_at: "2026-11-14T00:00:01.000Z",
      producer: { name: "kepler", version: "fixture" }, caused_by: [resetControl.id],
      data: { mission_id: generation.missionId, generation_id: targetGeneration, control_event_id: resetControl.id },
    }, resetControl);
    const historyRoot = `/record/.kepler/missions/${generation.missionId}/history`;
    history.entries.set(`${historyRoot}/control/active.json`, controlBytes);
    history.entries.set(`${historyRoot}/control/events/${resetControl.journal_id}.jsonl`, controlBytes);
    history.entries.set(`${historyRoot}/control/${guard.journal_id}.jsonl`, encoder.encode(`${serializeJournalEvent(guard)}\n`));
    const evidence = encoder.encode("The lead checked the reset generation before publication.\n");
    const evidencePath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/evidence.txt`;
    const reportPath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/publish-${targetGeneration}.json`;
    history.entries.set(`/record/${evidencePath}`, evidence);
    const initial = await history.storage.snapshot("/record", generation.missionId);
    const evidenceSource = initial.files.find((file) => file.path === evidencePath)!;
    const active = initial.files.find((file) => file.path.endsWith("/history/control/active.json"))!;
    const preparedReport = reportFor({
      mission: {
        mission_id: generation.missionId,
        record_home_repository_id: generation.manifest.mission_binding.record_home_repository_id,
        workflow: generation.manifest.mission_binding.workflow,
        request_reference: generation.manifest.mission_binding.request_reference,
      },
      targetGeneration,
      prior: { generation_id: targetGeneration, history_version: resetControl.id, content_version: historyDigest(active.bytes) },
      inventory: historyInventory(initial), evidenceSource, evidence,
    });
    const reportBytes = encoder.encode(`${canonicalJson(preparedReport.report)}\n`);
    history.entries.set(`/record/${reportPath}`, reportBytes);
    const snapshot = await history.storage.snapshot("/record", generation.missionId);
    const reportSource = snapshot.files.find((file) => file.path === reportPath)!;
    const reportReference = historyLeadReconciliationSnapshotReference(reportSource.sourceId);
    const candidateBytes = encoder.encode("candidate journal bytes");
    const candidateJournalId = randomUUID();
    const actionId = randomUUID();
    const manifest: HistoryRebuildManifest = {
      format: "kepler.mission-history-rebuild", version: 1, mission_id: generation.missionId,
      generation_id: targetGeneration, reset_event_id: resetControl.id, archive_id: generation.archiveId,
      archive_inventory_hash: historyDigest("reset archive inventory"),
      actions: [{
        id: actionId, action: "add", source: null,
        event: { phase: "construction", type: "construction.reconciliation-fixture", event_version: 1, data: { mission_id: generation.missionId }, causes: [] },
        reason: "Fixture candidate", authority: null, proof: null, loss_reference: null, data_bindings: [],
        output: { event_id: randomUUID(), journal_id: candidateJournalId, byte_offset: 0, byte_length: candidateBytes.length },
      }], dependency_order: [actionId],
      candidate_journals: [{ phase: "construction", journal_id: candidateJournalId, byte_length: candidateBytes.length, content_version: historyDigest(candidateBytes), reference: `candidate:${targetGeneration}/construction/${candidateJournalId}` }],
      required_material: { artifact_bindings: [], checkpoints: [], evidence: [
        { reference: reportReference, content_version: historyDigest(reportBytes) },
        { reference: preparedReport.evidenceReference, content_version: historyDigest(evidence) },
      ] },
      expected_state: {}, continuation: { operation: "continue", unresolved_work: [], required_approvals: [] }, requester: "Requester",
      reconciliation: {
        ...generation.resetManifest.reconciliation, orchestrator: "agent:lead", run_references: [],
        references: [
          { reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE },
          { reference: preparedReport.evidenceReference, purpose: "lead reconciliation evidence" },
        ],
      },
    };
    const verify = createNodeHistoryReconciliation(history.access);
    const result = await verify({ phase: "preview", recordHome: "/record", manifest, snapshot, intent: null });
    expect(result.status === "valid" ? result.status : result.reason).toBe("valid");
    expect(result).toMatchObject({ status: "valid", reference: reportReference, content_version: historyDigest(reportBytes) });
  });

  it("exports one closed, content-bound snapshot evidence reader", async () => {
    const t = await fixture();
    const readEvidence = createHistoryReconciliationEvidenceReader(t.history.access, "/record", t.snapshot);
    await expect(readEvidence(t.evidenceReference)).resolves.toEqual({ reference: t.evidenceReference, content_version: historyDigest(t.evidence), bytes: t.evidence });
    await expect(readEvidence("file:///etc/passwd")).rejects.toMatchObject({ code: "history_reconciliation_invalid" });
    t.history.entries.set(`/record/${t.evidencePath}`, encoder.encode("changed\n"));
    await expect(readEvidence(t.evidenceReference)).rejects.toMatchObject({ code: "history_reconciliation_invalid" });
  });

  it("requires nonempty readable material bytes and detects changes after capture", async () => {
    const empty = await fixture({ evidence: new Uint8Array() });
    await expect(empty.verify(empty.request)).resolves.toMatchObject({ status: "invalid" });
    const changed = await fixture();
    changed.history.entries.set(`/record/${changed.evidencePath}`, encoder.encode("changed after capture\n"));
    await expect(changed.verify(changed.request)).resolves.toMatchObject({ status: "invalid" });
    const missing = await fixture();
    missing.history.entries.delete(`/record/${missing.evidencePath}`);
    await expect(missing.verify(missing.request)).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects caller-owned scope mismatch and snapshots caller values before awaiting", async () => {
    const invalidScope = await fixture();
    await expect(invalidScope.verify({ ...invalidScope.request, recordHome: "/other" })).resolves.toMatchObject({ status: "invalid" });
    const stable = await fixture();
    const request = stable.request as unknown as { manifest: Record<string, unknown>; snapshot: { files: Array<{ path: string; bytes: Uint8Array }> } };
    const pending = stable.verify(stable.request);
    request.manifest.generation_id = randomUUID();
    const reportFile = request.snapshot.files.find((file) => file.path === stable.reportPath)!;
    reportFile.bytes[0] = 0;
    await expect(pending).resolves.toMatchObject({ status: "valid" });
  });
});
