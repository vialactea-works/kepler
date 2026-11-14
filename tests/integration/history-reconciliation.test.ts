import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseLiveHistoryBinding } from "../../packages/cli/src/history/binding.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
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

const fixture = async (options: { readonly homeSelector?: "damaged" | "missing"; readonly boundPeer?: boolean } = {}) => {
  const repository = await createHistoryRepository();
  roots.push(repository.parent);
  const { root, f, access } = repository;
  const activePath = `.kepler/missions/${f.missionId}/history/control/active.json`;
  const activeFile = Path.join(root, activePath);
  const damagedSelector = encoder.encode("damaged record-home activation bytes\n");
  let peerControl: { readonly path: string; readonly bytes: Uint8Array } | undefined;
  if (options.boundPeer) {
    repository.git(root, "add", ".kepler/marker");
    repository.git(root, "commit", "-q", "-m", "Create isolated bound-loss fixture");
    const peer = Path.join(repository.parent, "bound peer");
    repository.git(root, "worktree", "add", "-q", "-b", "peer", peer);
    const relative = `.kepler/missions/${f.missionId}/history/control/events/${randomUUID()}.jsonl`;
    peerControl = { path: Path.join(peer, relative), bytes: encoder.encode("malformed peer control bytes\n") };
    await Fs.mkdir(Path.dirname(peerControl.path), { recursive: true });
    await Fs.writeFile(peerControl.path, peerControl.bytes);
    const context = await access.storage.context(root);
    const binding = {
      format: "kepler.mission-history-binding", version: 1, mission_id: f.missionId,
      generation_id: f.generationId, history_version: f.control.id, selection_hash: historyDigest(f.input.activation!),
      origins: context.origins.map((origin) => origin.id).sort(),
    };
    await access.storage.files.write({ root: context.commonDirectory, relative: `kepler/missions/${f.missionId}/coordination/history-selection.json` }, encoder.encode(`${canonicalJson(binding)}\n`), { kind: "create" });
  }
  if (options.homeSelector === "damaged") await Fs.writeFile(activeFile, damagedSelector);
  if (options.homeSelector === "missing") await Fs.unlink(activeFile);
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
    prior_history: options.homeSelector ? null : { generation_id: f.generationId, history_version: f.control.id, content_version: historyDigest(active.bytes) },
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
    previous_control: { event_id: options.homeSelector ? null : f.control.id, content_version: active ? historyDigest(active.bytes) : null },
    source_inventory: historyInventory(snapshot),
    known_missing_sources: snapshot.unavailable.filter((source) => source.kind === "missing").map((source) => ({ reference: source.source_id, reason: "This bound input is physically missing.", consequences: "The approved reset excludes the missing input from current history." })),
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
  return { repository, evidenceBytes, evidenceFile, reportBytes, reportFile, reportReference, snapshot, manifest, activePath, damagedSelector, peerControl, request: { phase: "preview" as const, recordHome: root, manifest, snapshot, intent: null } };
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

  it.each(["damaged", "missing"] as const)("applies and retries with a %s home selector and exactly declared missing bound peer", async (homeSelector) => {
    const t = await fixture({ homeSelector, boundPeer: true });
    const scope = { recordHome: t.repository.root, missionId: t.repository.f.missionId };
    const recovery = createNodeHistoryRecovery(scope, { name: "kepler", version: "fixture-current" });
    expect(t.manifest.previous_control).toEqual({ event_id: null, content_version: homeSelector === "damaged" ? historyDigest(t.damagedSelector) : null });
    const beforeContext = await recovery.access.storage.context(scope.recordHome);
    const missingOrigins = [beforeContext.origins.find((origin) => origin.root === Path.join(t.repository.parent, "bound peer"))!.id];
    if (homeSelector === "missing") missingOrigins.push(beforeContext.origins.find((origin) => origin.root === scope.recordHome)!.id);
    expect(t.snapshot.unavailable.map(({ source_id, path, kind }) => ({ source_id, path, kind }))).toEqual(missingOrigins.sort().map((origin) => ({ source_id: `${origin}:${t.activePath}`, path: t.activePath, kind: "missing" })));
    expect(await createNodeHistoryReconciliation(recovery.access)(t.request)).toMatchObject({ status: "valid" });
    const input = { phase: "apply", manifest: t.manifest, approved_manifest_hash: historyManifestDigest(t.manifest), requester: t.manifest.requester, decision_reference: "decision:exact-bound-input-loss" };
    const result = await recovery.operations.execute("reset", scope, input);
    expect(result).toMatchObject({ mode: "recovering", already_applied: false });
    expect(await recovery.operations.execute("reset", scope, input)).toMatchObject({ already_applied: true, receipt: result.receipt });
    const current = await recovery.access.storage.snapshot(scope.recordHome, scope.missionId);
    expect(current.unavailable).toEqual([]);
    const context = await recovery.access.storage.context(scope.recordHome);
    const binding = parseLiveHistoryBinding(await Fs.readFile(Path.join(context.commonDirectory, "kepler", "missions", scope.missionId, "coordination", "history-selection.json")));
    expect(binding.origins).toEqual([context.origins.find((origin) => origin.root === scope.recordHome)!.id]);
    expect(binding.history_version).toBe(result.history_version);
    const archive = await new HistoryArchives(recovery.access.storage).verify(scope.recordHome, scope.missionId, t.manifest.archive_id);
    expect(archive.index.source_inventory).toEqual(t.manifest.source_inventory);
    expect(await Fs.readFile(t.peerControl!.path)).toEqual(Buffer.from(t.peerControl!.bytes));
    expect(archive.files).toContainEqual(expect.objectContaining({ bytes: t.peerControl!.bytes }));
    if (homeSelector === "damaged") expect(archive.files).toContainEqual(expect.objectContaining({ path: t.activePath, bytes: t.damagedSelector }));
    expect(await Fs.readFile(t.evidenceFile)).toEqual(Buffer.from(t.evidenceBytes));
  });

  it("rejects undeclared bound loss before changing retained inputs", async () => {
    const t = await fixture({ homeSelector: "damaged", boundPeer: true });
    const scope = { recordHome: t.repository.root, missionId: t.repository.f.missionId };
    const recovery = createNodeHistoryRecovery(scope, { name: "kepler", version: "fixture-current" });
    const manifest = { ...t.manifest, known_missing_sources: [] };
    await expect(recovery.operations.execute("reset", scope, { phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:missing-loss-declaration" })).rejects.toMatchObject({ code: "history_archive_loss_undeclared" });
    expect(historyInventory(await recovery.access.storage.snapshot(scope.recordHome, scope.missionId))).toEqual(t.manifest.source_inventory);
    expect(await Fs.readFile(Path.join(scope.recordHome, t.activePath))).toEqual(Buffer.from(t.damagedSelector));
    expect((await new HistoryArchives(recovery.access.storage).catalog(scope.recordHome, scope.missionId)).archives).toEqual([]);
  });

  it("rejects evidence changed after the captured source inventory", async () => {
    const t = await fixture();
    const verify = createNodeHistoryReconciliation(t.repository.access);
    expect(await verify(t.request)).toMatchObject({ status: "valid" });
    await Fs.writeFile(t.evidenceFile, "changed evidence\n");
    expect(await verify(t.request)).toMatchObject({ status: "invalid" });
  });
});
