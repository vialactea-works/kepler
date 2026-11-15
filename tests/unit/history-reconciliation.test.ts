import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryAccess, parseLiveHistoryBinding } from "../../packages/cli/src/history/access.js";
import { createHistoryControl, historyDigest, historyManifestDigest, parseHistoryGuard, type HistoryInitializationManifest, type HistoryRebuildManifest, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import { HISTORY_CLIENT_COMPATIBILITY_FORMAT, HISTORY_CLIENT_COMPATIBILITY_PURPOSE, HISTORY_CLIENT_GENERATION_PROTOCOL, serializeHistoryClientCompatibilityDocument, type HistoryClientCompatibilityDocument } from "../../packages/cli/src/history/client-compatibility.js";
import { canonicalJson, serializeJournalEvent } from "../../packages/cli/src/history/journal.js";
import { createHistoryReconciliationEvidenceReader, createNodeHistoryReconciliation, HISTORY_LEAD_RECONCILIATION_PURPOSE, HISTORY_LEAD_RECONCILIATION_FORMAT, historyLeadReconciliationSnapshotReference, parseHistoryLeadReconciliationReport, serializeHistoryLeadReconciliationReport, type HistoryLeadReconciliationReport, type HistoryReconciliationRequest } from "../../packages/cli/src/history/reconciliation.js";
import { HistoryReset, type HistoryResetRuntime } from "../../packages/cli/src/history/reset.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { HistoryOperations } from "../../packages/cli/src/history/operations.js";
import { parseHistoryOperationIntent } from "../../packages/cli/src/history/operation-intent.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";
import type { HistoryRepositoryContext } from "../../packages/cli/src/history/files.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const encoder = new TextEncoder();

const fixture = async (options: {
  readonly workers?: readonly string[];
  readonly evidence?: Uint8Array;
  readonly report?: (report: HistoryLeadReconciliationReport) => unknown;
  readonly context?: HistoryRepositoryContext;
  readonly boundOrigins?: readonly string[];
  readonly additionalFiles?: (missionId: string) => ReadonlyMap<string, Uint8Array>;
  readonly missingFiles?: (missionId: string) => readonly string[];
  readonly compatibility?: (document: HistoryClientCompatibilityDocument) => unknown;
} = {}) => {
  const generation = historyGenerationFixture();
  const targetGeneration = randomUUID();
  const evidence = options.evidence ?? encoder.encode("The lead checked the affected client and working-copy scope.\n");
  const evidencePath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/evidence.txt`;
  const compatibilityPath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/client-compatibility-reset-${targetGeneration}.json`;
  const reportPath = `.kepler/missions/${generation.missionId}/recovery/reconciliation/reset-${targetGeneration}.json`;
  const history = historyAccessFixture(generation, { extraEntries: new Map([[`/record/${evidencePath}`, evidence]]), ...(options.context ? { context: options.context } : {}) });
  for (const [path, bytes] of options.additionalFiles?.(generation.missionId) ?? []) history.entries.set(path, bytes);
  for (const path of options.missingFiles?.(generation.missionId) ?? []) history.entries.delete(path);
  if (options.boundOrigins) history.entries.set(history.bindingPath, history.encode({ ...history.binding, origins: [...options.boundOrigins].sort() }));
  const initial = await history.storage.snapshot("/record", generation.missionId);
  const context = await history.storage.context("/record");
  const recordHomeOrigin = context.origins.find((origin) => origin.root === "/record")!;
  const evidenceSource = initial.files.find((file) => file.path === evidencePath)!;
  const evidenceReference = historyLeadReconciliationSnapshotReference(evidenceSource.sourceId);
  const originalBindingFile = initial.files.find((file) => file.origin === "local-runtime" && file.path.endsWith("/coordination/history-selection.json"));
  let priorOrigins: readonly string[] = [];
  try { priorOrigins = originalBindingFile ? parseLiveHistoryBinding(originalBindingFile.bytes).origins : []; } catch {}
  const originIds = [...new Set([...context.origins.map((origin) => origin.id), ...context.unavailableOrigins.map((origin) => origin.id), ...priorOrigins])].sort();
  const compatibilityReference = historyLeadReconciliationSnapshotReference(`${recordHomeOrigin.id}:${compatibilityPath}`);
  const baseCompatibility: HistoryClientCompatibilityDocument = {
    format: HISTORY_CLIENT_COMPATIBILITY_FORMAT,
    version: 1,
    mission_binding: generation.manifest.mission_binding,
    generation_id: targetGeneration,
    operation: "reset",
    required_protocol: HISTORY_CLIENT_GENERATION_PROTOCOL,
    confirmed_by: "agent:lead",
    scope_complete: true,
    external_client_references: [],
    clients: [{
      reference: "client:recovery-lead",
      kind: "interactive",
      run_references: [...(options.workers ?? [])].sort(),
      origin_ids: originIds,
      protocol_status: "compatible",
      operational_state: "stopped",
      client_identity: "Kepler unit-test adapter build test-commit",
      evidence: [{ reference: evidenceReference, content_version: historyDigest(evidence) }],
    }],
    unresolved_clients: [],
    source_material: [{ reference: evidenceReference, content_version: historyDigest(evidence) }],
  };
  const compatibilityValue = options.compatibility ? options.compatibility(baseCompatibility) : baseCompatibility;
  const compatibilityBytes = options.compatibility ? encoder.encode(`${canonicalJson(compatibilityValue)}\n`) : serializeHistoryClientCompatibilityDocument(compatibilityValue);
  history.entries.set(`/record/${compatibilityPath}`, compatibilityBytes);
  const reportInput = await history.storage.snapshot("/record", generation.missionId);
  const active = reportInput.files.find((file) => file.path.endsWith("/history/control/active.json"));
  const workerReferences = [...(options.workers ?? [])].sort();
  const materials = [
    { reference: compatibilityReference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: historyDigest(compatibilityBytes) },
    { reference: evidenceReference, purpose: "lead reconciliation evidence", content_version: historyDigest(evidence) },
  ].sort((left, right) => left.reference.localeCompare(right.reference));
  const baseReport: HistoryLeadReconciliationReport = {
    format: HISTORY_LEAD_RECONCILIATION_FORMAT,
    version: 1,
    mission: {
      mission_id: generation.missionId,
      record_home_repository_id: generation.manifest.mission_binding.record_home_repository_id,
      workflow: generation.manifest.mission_binding.workflow,
      request_reference: generation.manifest.mission_binding.request_reference,
    },
    prior_history: active ? { generation_id: generation.generationId, history_version: generation.control.id, content_version: historyDigest(active.bytes) } : null,
    target_generation_id: targetGeneration,
    attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
    original_inventory: historyInventory(reportInput),
    original_inventory_hash: historyDigest(canonicalJson(historyInventory(reportInput))),
    scope_evidence_references: materials.map((material) => material.reference),
    affected_workers: workerReferences.map((run_reference) => ({
      run_reference,
      terminal_confirmation: { outcome: "terminated", confirmed_by: "agent:lead", evidence_references: [evidenceReference] },
    })),
    materials,
    effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } },
    unresolved_items: [],
    unknown_items: [],
  };
  const reportValue = options.report ? options.report(baseReport) : baseReport;
  const reportBytes = !options.report && evidence.length > 0 ? serializeHistoryLeadReconciliationReport(reportValue) : encoder.encode(`${canonicalJson(reportValue)}\n`);
  const reportReference = historyLeadReconciliationSnapshotReference(`${recordHomeOrigin.id}:${reportPath}`);
  history.entries.set(`/record/${reportPath}`, reportBytes);
  const snapshot = await history.storage.snapshot("/record", generation.missionId);
  const inventory = historyInventory(snapshot);
  const manifest: HistoryResetManifest = {
    ...generation.resetManifest,
    archive_id: randomUUID(),
    generation_id: targetGeneration,
    previous_control: active ? { event_id: generation.control.id, content_version: historyDigest(active.bytes) } : { event_id: null, content_version: null },
    source_inventory: inventory,
    reconciliation: {
      ...generation.resetManifest.reconciliation,
      orchestrator: "agent:lead",
      run_references: workerReferences,
      references: [
        { reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE },
        ...materials.map(({ reference, purpose }) => ({ reference, purpose })),
      ],
    },
  };
  const request: HistoryReconciliationRequest = { phase: "preview", recordHome: "/record", manifest, snapshot, intent: null };
  const verify = createNodeHistoryReconciliation(history.access);
  const verifyScope: HistoryResetRuntime["verifyScope"] = verify;
  return { generation, history, evidencePath, evidence, compatibilityPath, compatibilityBytes, compatibilityReference, reportPath, reportBytes, reportReference, evidenceReference, snapshot, manifest, request, verify, verifyScope };
};

const boundPeerLoss = async (homeSelector: "healthy" | "damaged" | "missing" = "healthy") => {
  const peerControl = encoder.encode("malformed peer control bytes");
  const damagedSelector = encoder.encode("damaged record-home activation bytes");
  const peerJournal = `${randomUUID()}.jsonl`;
  const peerPath = (missionId: string) => `.kepler/missions/${missionId}/history/control/events/${peerJournal}`;
  const activePath = (missionId: string) => `.kepler/missions/${missionId}/history/control/active.json`;
  const context: HistoryRepositoryContext = {
    recordHome: "/record", commonDirectory: "/git",
    origins: [
      { id: "current", label: "record-home", root: "/record" },
      { id: "peer", label: "bound peer", root: "/peer" },
      { id: "unjoined", label: "unjoined peer", root: "/unjoined" },
      { id: "later", label: "later join", root: "/later" },
    ],
    unavailableOrigins: [],
  };
  const t = await fixture({
    context,
    boundOrigins: ["current", "peer"],
    additionalFiles: (missionId) => new Map([
      [`/peer/${peerPath(missionId)}`, peerControl],
      ...(homeSelector === "damaged" ? [[`/record/${activePath(missionId)}`, damagedSelector] as const] : []),
    ]),
    ...(homeSelector === "missing" ? { missingFiles: (missionId: string) => [`/record/${activePath(missionId)}`] } : {}),
    ...(homeSelector === "damaged" ? { report: (report: HistoryLeadReconciliationReport) => ({ ...report, prior_history: null }) } : {}),
  });
  const reference = `peer:.kepler/missions/${t.generation.missionId}/history/control/active.json`;
  const homeReference = `current:${activePath(t.generation.missionId)}`;
  const knownMissingSources = [
    { reference, reason: "The bound peer activation is missing.", consequences: "No history from that peer is selected." },
    ...(homeSelector === "missing" ? [{ reference: homeReference, reason: "The record-home activation is missing.", consequences: "The approved reset publishes a replacement activation." }] : []),
  ];
  const approvedManifest = {
    ...t.manifest,
    ...(homeSelector === "healthy" ? {} : { previous_control: { event_id: null, content_version: homeSelector === "damaged" ? historyDigest(damagedSelector) : null } }),
    known_missing_sources: knownMissingSources,
  };
  return { t, reference, homeReference, approvedManifest, peerPath, damagedSelector };
};

const applyAndRetryBoundReset = async (t: Awaited<ReturnType<typeof boundPeerLoss>>["t"], manifest: HistoryResetManifest, decisionReference: string) => {
  const files = t.history.storage.files;
  let interruptCompletion = true;
  const storage = new HistoryStorage({ ...files, write: async (location, value, mode) => {
    if (interruptCompletion && location.relative.includes("/recovery/completed/")) { interruptCompletion = false; throw new Error("Controlled completion interruption"); }
    return files.write(location, value, mode);
  } }, t.history.storage.repositories);
  const archives = new HistoryArchives(storage);
  const operation = new HistoryReset({ access: new HistoryAccess(storage, t.history.runtime), archives, next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture" }, verifyScope: t.verifyScope });
  const scope = { recordHome: "/record", missionId: t.generation.missionId };
  const apply = { phase: "apply" as const, manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: decisionReference };
  await expect(operation.execute(scope, { phase: "preview", manifest })).resolves.toMatchObject({ mode: "recovering", proposed: true });
  await expect(operation.execute(scope, apply)).rejects.toMatchObject({ code: "history_reset_failed", details: { step: "record-completion", execution_started: false } });
  const result = await operation.execute(scope, apply);
  const completed = [...t.history.entries].find(([path]) => path.includes("/recovery/completed/"));
  if (!completed) throw new Error("The retained reset completion intent was not written.");
  const intent = parseHistoryOperationIntent(new TextDecoder().decode(completed[1]));
  const archive = await archives.verify("/record", t.generation.missionId, manifest.archive_id);
  return { result, intent, archive };
};

const clientCompatibilityFor = (input: {
  readonly missionBinding: HistoryClientCompatibilityDocument["mission_binding"];
  readonly generationId: string;
  readonly operation: HistoryClientCompatibilityDocument["operation"];
  readonly evidenceSource: { readonly sourceId: string; readonly origin: string };
  readonly evidence: Uint8Array;
  readonly originIds: readonly string[];
}) => {
  const evidenceReference = historyLeadReconciliationSnapshotReference(input.evidenceSource.sourceId);
  const path = `.kepler/missions/${input.missionBinding.mission_id}/recovery/reconciliation/client-compatibility-${input.operation}-${input.generationId}.json`;
  const reference = historyLeadReconciliationSnapshotReference(`${input.evidenceSource.origin}:${path}`);
  const document: HistoryClientCompatibilityDocument = {
    format: HISTORY_CLIENT_COMPATIBILITY_FORMAT,
    version: 1,
    mission_binding: input.missionBinding,
    generation_id: input.generationId,
    operation: input.operation,
    required_protocol: HISTORY_CLIENT_GENERATION_PROTOCOL,
    confirmed_by: "agent:lead",
    scope_complete: true,
    external_client_references: [],
    clients: [{
      reference: "client:recovery-lead",
      kind: "interactive",
      run_references: [],
      origin_ids: [...input.originIds].sort(),
      protocol_status: "compatible",
      operational_state: "stopped",
      client_identity: "Kepler unit-test adapter build test-commit",
      evidence: [{ reference: evidenceReference, content_version: historyDigest(input.evidence) }],
    }],
    unresolved_clients: [],
    source_material: [{ reference: evidenceReference, content_version: historyDigest(input.evidence) }],
  };
  return { path, reference, document, bytes: serializeHistoryClientCompatibilityDocument(document), evidenceReference };
};

const reportFor = (input: {
  readonly mission: HistoryLeadReconciliationReport["mission"];
  readonly targetGeneration: string;
  readonly prior: HistoryLeadReconciliationReport["prior_history"];
  readonly inventory: ReturnType<typeof historyInventory>;
  readonly evidenceSource: { readonly sourceId: string };
  readonly evidence: Uint8Array;
  readonly compatibilityReference: string;
  readonly compatibilityBytes: Uint8Array;
}): { readonly report: HistoryLeadReconciliationReport; readonly evidenceReference: string } => {
  const evidenceReference = historyLeadReconciliationSnapshotReference(input.evidenceSource.sourceId);
  const materials = [
    { reference: input.compatibilityReference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: historyDigest(input.compatibilityBytes) },
    { reference: evidenceReference, purpose: "lead reconciliation evidence", content_version: historyDigest(input.evidence) },
  ].sort((left, right) => left.reference < right.reference ? -1 : left.reference > right.reference ? 1 : 0);
  const report: HistoryLeadReconciliationReport = {
    format: HISTORY_LEAD_RECONCILIATION_FORMAT,
    version: 1,
    mission: input.mission,
    prior_history: input.prior,
    target_generation_id: input.targetGeneration,
    attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
    original_inventory: input.inventory,
    original_inventory_hash: historyDigest(canonicalJson(input.inventory)),
    scope_evidence_references: materials.map((material) => material.reference),
    affected_workers: [],
    materials,
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
    const beforeCompatibility = await t.h.storage.snapshot("/record", t.f.missionId);
    const evidenceSource = beforeCompatibility.files.find((file) => file.path === evidencePath)!;
    const context = await t.h.storage.context("/record");
    const compatibility = clientCompatibilityFor({ missionBinding: t.f.manifest.mission_binding, generationId: t.plan.generation_id, operation: "publish", evidenceSource, evidence, originIds: context.origins.map((origin) => origin.id) });
    t.h.entries.set(`/record/${compatibility.path}`, compatibility.bytes);
    const initial = await t.h.storage.snapshot("/record", t.f.missionId);
    const active = initial.files.find((file) => file.path.endsWith("/control/active.json"))!;
    const reportPath = `.kepler/missions/${t.f.missionId}/recovery/reconciliation/publish-${t.plan.generation_id}.json`;
    const reportReference = historyLeadReconciliationSnapshotReference(`current:${reportPath}`);
    const preparedReport = reportFor({ mission: { mission_id: t.f.missionId, record_home_repository_id: "record-home", workflow: "standard", request_reference: "request:original" }, targetGeneration: t.plan.generation_id, prior: { generation_id: t.plan.generation_id, history_version: t.reset.id, content_version: historyDigest(active.bytes) }, inventory: historyInventory(initial), evidenceSource, evidence, compatibilityReference: compatibility.reference, compatibilityBytes: compatibility.bytes });
    const reportBytes = serializeHistoryLeadReconciliationReport(preparedReport.report);
    t.h.entries.set(`/record/${reportPath}`, reportBytes);
    const references = [{ reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE }, ...preparedReport.report.materials.map(({ reference, purpose }) => ({ reference, purpose }))];
    const plan = { ...t.plan, reconciliation: { ...t.plan.reconciliation, orchestrator: "agent:lead", references }, required_material: { ...t.plan.required_material, evidence: [{ reference: reportReference, content_version: historyDigest(reportBytes) }, { reference: compatibility.reference, content_version: historyDigest(compatibility.bytes) }, { reference: preparedReport.evidenceReference, content_version: historyDigest(evidence) }] } };
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
    const t = await fixture({ context, boundOrigins: ["current", "missing-worktree"] });
    const reference = `missing-worktree:.kepler/missions/${t.generation.missionId}`;
    const manifest = { ...t.manifest, known_missing_sources: [{ reference, reason: "The worktree is unavailable.", consequences: "The lead reviewed the retained task evidence." }] };
    await expect(t.verify({ ...t.request, manifest })).resolves.toMatchObject({ status: "valid" });
    await expect(t.verify({ ...t.request, manifest: { ...t.manifest, known_missing_sources: [] } })).resolves.toMatchObject({ status: "invalid" });
  });

  it("applies an exact declared missing-bound-input reset and retries its retained intent", async () => {
    const { t, reference, approvedManifest, peerPath } = await boundPeerLoss();
    const files = t.history.storage.files;
    let interruptCompletion = true;
    const storage = new HistoryStorage({ ...files, write: async (location, value, mode) => {
      if (interruptCompletion && location.relative.includes("/recovery/completed/")) { interruptCompletion = false; throw new Error("Controlled completion interruption"); }
      return files.write(location, value, mode);
    } }, t.history.storage.repositories);
    const access = new HistoryAccess(storage, t.history.runtime);
    const operation = new HistoryReset({ access, archives: new HistoryArchives(storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture" }, verifyScope: t.verifyScope });
    const scope = { recordHome: "/record", missionId: t.generation.missionId };
    const apply = { phase: "apply" as const, manifest: approvedManifest, approved_manifest_hash: historyManifestDigest(approvedManifest), requester: approvedManifest.requester, decision_reference: "decision:exact-missing-peer-loss" };
    await expect(operation.execute(scope, { phase: "preview", manifest: t.manifest })).rejects.toMatchObject({ code: "history_archive_loss_undeclared", details: { source_id: reference } });
    await expect(operation.execute(scope, { phase: "preview", manifest: approvedManifest })).resolves.toMatchObject({ mode: "recovering", proposed: true });
    await expect(operation.execute(scope, apply)).rejects.toMatchObject({ code: "history_reset_failed", details: { step: "record-completion", execution_started: false } });
    const result = await operation.execute(scope, apply);
    expect(result).toMatchObject({ mode: "recovering", already_applied: false });
    expect(t.snapshot.files).toContainEqual(expect.objectContaining({ sourceId: `peer:${peerPath(t.generation.missionId)}`, bytes: encoder.encode("malformed peer control bytes") }));
    expect(t.snapshot.unavailable).toContainEqual(expect.objectContaining({ source_id: reference, kind: "missing" }));
    expect(t.snapshot.unavailable.some((source) => source.source_id.startsWith("unjoined:"))).toBe(false);
  });

  it("applies a damaged-selector reset with exact missing peer and retries retained intent", async () => {
    const { t, reference, approvedManifest, damagedSelector } = await boundPeerLoss("damaged");
    expect(approvedManifest.previous_control).toEqual({ event_id: null, content_version: historyDigest(damagedSelector) });
    await expect(t.verify({ ...t.request, manifest: approvedManifest })).resolves.toMatchObject({ status: "valid" });
    const { result, intent, archive } = await applyAndRetryBoundReset(t, approvedManifest, "decision:damaged-selector-missing-peer");
    const activePath = `.kepler/missions/${t.generation.missionId}/history/control/active.json`;
    expect(result).toMatchObject({ mode: "recovering", already_applied: false });
    expect(archive.files).toContainEqual(expect.objectContaining({ source_id: `current:${activePath}`, path: activePath, bytes: damagedSelector }));
    expect(intent.original_sources).toContainEqual(expect.objectContaining({ source_id: `current:${activePath}`, content_version: historyDigest(damagedSelector) }));
    expect(intent.original_unavailable).toEqual(t.snapshot.unavailable);
    expect(intent.original_unavailable).toContainEqual(expect.objectContaining({ source_id: reference, kind: "missing" }));
  });

  it("publishes an exact replacement for a missing bound home selector and peer", async () => {
    const { t, reference, homeReference, approvedManifest } = await boundPeerLoss("missing");
    expect(approvedManifest.previous_control).toEqual({ event_id: null, content_version: null });
    expect(t.snapshot.unavailable).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_id: reference, kind: "missing" }),
      expect.objectContaining({ source_id: homeReference, kind: "missing" }),
    ]));
    await expect(t.verify({ ...t.request, manifest: approvedManifest })).resolves.toMatchObject({ status: "valid" });
    const { result, intent } = await applyAndRetryBoundReset(t, approvedManifest, "decision:missing-home-selector-peer");
    expect(result).toMatchObject({ mode: "recovering", already_applied: false });
    expect(intent.original_unavailable).toEqual(t.snapshot.unavailable);
    expect(intent.original_unavailable).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_id: reference, kind: "missing" }),
      expect.objectContaining({ source_id: homeReference, kind: "missing" }),
    ]));
    const current = await t.history.storage.snapshot("/record", t.generation.missionId);
    expect(current.unavailable.some((source) => source.source_id === homeReference || source.source_id === reference)).toBe(false);
  });

  it("preserves later joined membership when a completed publication is retried", async () => {
    const t = await historyReconstructionFixture();
    const prepared = await t.drafts.prepare(t.scope, t.request);
    const manifest = prepared.manifest as HistoryRebuildManifest;
    const operations = new HistoryOperations({
      access: t.h.access,
      archives: new HistoryArchives(t.h.storage),
      next: randomUUID,
      clock: () => new Date(),
      producer: { name: "kepler", version: "fixture-publication" },
      verifyScope: async () => ({ status: "valid", reference: "fixture:scope", content_version: historyDigest("fixture scope") }),
      verifyCandidate: (scope, candidate) => t.drafts.verify(scope, candidate),
    });
    const apply = { phase: "apply" as const, manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:completed-publication-retry" };
    const published = await operations.execute("publish", t.scope, apply);
    expect(published).toMatchObject({ mode: "active", already_applied: false });
    const historyPrefix = `/record/.kepler/missions/${t.f.missionId}/history/`;
    for (const [key, value] of t.h.entries) if (key.startsWith(historyPrefix)) t.h.entries.set(`/later/${key.slice("/record/".length)}`, new Uint8Array(value));
    const context: HistoryRepositoryContext = {
      recordHome: "/record", commonDirectory: "/git",
      origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "later", label: "later join", root: "/later" }],
      unavailableOrigins: [],
    };
    const joinStorage = new HistoryStorage(t.h.storage.files, { resolve: async (recordHome) => ({ ...context, recordHome }) });
    const joined = await new HistoryAccess(joinStorage, t.h.runtime).join({ recordHome: "/later", missionId: t.f.missionId, historyVersion: published.history_version as string }, async () => {});
    expect(joined.coordination).toBe("bound");
    const bindingBeforeRetry = new Uint8Array(t.h.entries.get(t.h.bindingPath)!);
    const activationPath = `/record/.kepler/missions/${t.f.missionId}/history/control/active.json`;
    const activationBeforeRetry = new Uint8Array(t.h.entries.get(activationPath)!);
    await expect(operations.execute("publish", t.scope, apply)).resolves.toMatchObject({ already_applied: true, current_selection_status: "validated" });
    expect(t.h.entries.get(t.h.bindingPath)).toEqual(bindingBeforeRetry);
    expect(t.h.entries.get(activationPath)).toEqual(activationBeforeRetry);
    expect(parseLiveHistoryBinding(bindingBeforeRetry).origins).toEqual(["current", "later"]);
  });

  it("rejects a new missing source introduced after reset preview", async () => {
    const unavailableOrigins: HistoryRepositoryContext["unavailableOrigins"][number][] = [];
    const context: HistoryRepositoryContext = { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }], unavailableOrigins };
    const t = await fixture({ context });
    const operation = new HistoryReset({ access: t.history.access, archives: new HistoryArchives(t.history.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture" }, verifyScope: t.verifyScope });
    const scope = { recordHome: "/record", missionId: t.generation.missionId };
    const apply = { phase: "apply" as const, manifest: t.manifest, approved_manifest_hash: historyManifestDigest(t.manifest), requester: t.manifest.requester, decision_reference: "decision:new-missing-source" };
    await expect(operation.execute(scope, { phase: "preview", manifest: t.manifest })).resolves.toMatchObject({ proposed: true });
    unavailableOrigins.push({ id: "new-worktree", path: "/workspace/new-worktree", kind: "missing", reason: "The new registered worktree is unavailable." });
    await expect(operation.execute(scope, apply)).rejects.toMatchObject({ code: "history_archive_loss_undeclared", details: { source_id: `new-worktree:.kepler/missions/${t.generation.missionId}` } });
  });

  it("rejects a declared missing bound activation that becomes available after preview", async () => {
    const { t, approvedManifest } = await boundPeerLoss();
    const operation = new HistoryReset({ access: t.history.access, archives: new HistoryArchives(t.history.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture" }, verifyScope: t.verifyScope });
    const scope = { recordHome: "/record", missionId: t.generation.missionId };
    const apply = { phase: "apply" as const, manifest: approvedManifest, approved_manifest_hash: historyManifestDigest(approvedManifest), requester: approvedManifest.requester, decision_reference: "decision:changed-missing-source" };
    await expect(operation.execute(scope, { phase: "preview", manifest: approvedManifest })).resolves.toMatchObject({ proposed: true });
    t.history.entries.set(`/peer/.kepler/missions/${t.generation.missionId}/history/control/active.json`, encoder.encode("late active bytes"));
    await expect(operation.execute(scope, apply)).rejects.toMatchObject({ code: "history_source_changed" });
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

  it("requires exact client compatibility scope, multi-run and shared-origin coverage", async () => {
    const context: HistoryRepositoryContext = {
      recordHome: "/record", commonDirectory: "/git",
      origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "peer", label: "registered peer", root: "/peer" }],
      unavailableOrigins: [],
    };
    const multiple = await fixture({
      context,
      boundOrigins: ["current", "peer"],
      additionalFiles: (missionId) => new Map([[`/peer/.kepler/missions/${missionId}/recovery/reconciliation/peer-origin-evidence.txt`, encoder.encode("The peer origin is in the scoped repository set.\n")]]),
      workers: ["run:worker-a", "run:worker-b"],
      compatibility: (document) => ({
        ...document,
        clients: [
          { ...document.clients[0]!, reference: "client:worker-a", run_references: ["run:worker-a"], origin_ids: ["current"] },
          { ...document.clients[0]!, reference: "client:worker-b", run_references: ["run:worker-b"], origin_ids: ["current", "peer"] },
        ],
      }),
    });
    const manifest = { ...multiple.manifest, known_missing_sources: multiple.request.snapshot.unavailable.map((source) => ({ reference: source.source_id, reason: "The registered peer input is missing.", consequences: "The lead reviewed the exact scope loss." })) };
    const multipleRequest = { ...multiple.request, manifest };
    const multipleResult = await multiple.verify(multipleRequest);
    expect(multipleResult, JSON.stringify(multipleResult)).toMatchObject({ status: "valid" });
    const wrongOperation = await fixture({ compatibility: (document) => ({ ...document, operation: "publish" }) });
    await expect(wrongOperation.verify(wrongOperation.request)).resolves.toMatchObject({ status: "invalid" });
    const wrongBinding = await fixture({ compatibility: (document) => ({ ...document, mission_binding: { ...document.mission_binding, request_reference: "request:other" } }) });
    await expect(wrongBinding.verify(wrongBinding.request)).resolves.toMatchObject({ status: "invalid" });
    const missingRun = await fixture({ workers: ["run:worker-a"], compatibility: (document) => ({ ...document, clients: [{ ...document.clients[0]!, run_references: [] }] }) });
    await expect(missingRun.verify(missingRun.request)).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects changed client compatibility bytes and unsupported client claims", async () => {
    const changed = await fixture();
    changed.history.entries.set(`/record/${changed.compatibilityPath}`, encoder.encode("changed compatibility bytes\n"));
    await expect(changed.verify(changed.request)).resolves.toMatchObject({ status: "invalid" });
    const unresolved = await fixture({ compatibility: (document) => ({ ...document, unresolved_clients: ["client:unknown"] }) });
    await expect(unresolved.verify(unresolved.request)).resolves.toMatchObject({ status: "invalid" });
    const legacy = await fixture({ compatibility: (document) => ({ ...document, clients: [{ ...document.clients[0]!, client_identity: "Kepler CLI 3.1.0 d2a9f5037c227765818e220443f426303bef4b45", protocol_status: "compatible" }] }) });
    await expect(legacy.verify(legacy.request)).resolves.toMatchObject({ status: "invalid" });
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
    const beforeCompatibility = await history.storage.snapshot("/record", generation.missionId);
    const evidenceSource = beforeCompatibility.files.find((file) => file.path === evidencePath)!;
    const context = await history.storage.context("/record");
    const compatibility = clientCompatibilityFor({
      missionBinding: generation.manifest.mission_binding,
      generationId: targetGeneration,
      operation: "migrate",
      evidenceSource,
      evidence,
      originIds: context.origins.map((origin) => origin.id),
    });
    history.entries.set(`/record/${compatibility.path}`, compatibility.bytes);
    const initial = await history.storage.snapshot("/record", generation.missionId);
    const preparedReport = reportFor({
      mission: {
        mission_id: generation.missionId,
        record_home_repository_id: generation.manifest.mission_binding.record_home_repository_id,
        workflow: generation.manifest.mission_binding.workflow,
        request_reference: generation.manifest.mission_binding.request_reference,
      },
      targetGeneration, prior: null, inventory: historyInventory(initial), evidenceSource, evidence, compatibilityReference: compatibility.reference, compatibilityBytes: compatibility.bytes,
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
    const beforeCompatibility = await history.storage.snapshot("/record", generation.missionId);
    const evidenceSource = beforeCompatibility.files.find((file) => file.path === evidencePath)!;
    const context = await history.storage.context("/record");
    const compatibility = clientCompatibilityFor({
      missionBinding: generation.manifest.mission_binding,
      generationId: targetGeneration,
      operation: "publish",
      evidenceSource,
      evidence,
      originIds: context.origins.map((origin) => origin.id),
    });
    history.entries.set(`/record/${compatibility.path}`, compatibility.bytes);
    const initial = await history.storage.snapshot("/record", generation.missionId);
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
      inventory: historyInventory(initial), evidenceSource, evidence, compatibilityReference: compatibility.reference, compatibilityBytes: compatibility.bytes,
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
        { reference: compatibility.reference, content_version: historyDigest(compatibility.bytes) },
        { reference: preparedReport.evidenceReference, content_version: historyDigest(evidence) },
      ] },
      expected_state: {}, continuation: { operation: "continue", unresolved_work: [], required_approvals: [] }, requester: "Requester",
      reconciliation: {
        ...generation.resetManifest.reconciliation, orchestrator: "agent:lead", run_references: [],
        references: [
          { reference: reportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE },
          ...preparedReport.report.materials.map(({ reference, purpose }) => ({ reference, purpose })),
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
