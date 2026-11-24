import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { missionWorkspaceKey, type LocalWorkspaceAttachment } from "../../packages/cli/src/construction/mission-workspace.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, historyManifestDigest } from "../../packages/cli/src/history/control.js";
import { HistoryDrafts } from "../../packages/cli/src/history/drafts.js";
import { canonicalJson, scanJournalBytes, serializeJournalEvent } from "../../packages/cli/src/history/journal.js";
import { renderHistoryOriginalRequestStatement } from "../../packages/cli/src/history/original-request.js";
import { HistoryReset } from "../../packages/cli/src/history/reset.js";
import { createNodeReconstructionChecks, historyCheckpointMaterialReference } from "../../packages/cli/src/history/reconstruction-runtime.js";
import { historyLeadReconciliationSnapshotReference } from "../../packages/cli/src/history/reconciliation.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyReconstructionPlan } from "../support/history-reconstruction.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { await Fs.rm(root, { recursive: true, force: true }); await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" }); } });

const fixture = async (withConflict = false, carrier: "snapshot" | "checkpoint" = "snapshot") => {
  const t = await createHistoryRepository();
  roots.push(t.parent);
  const journalPath = `.kepler/missions/${t.f.missionId}/history/generations/${t.f.generationId}/construction/${t.f.journalId}.jsonl`;
  let conflictOffset: number | undefined;
  if (withConflict) {
    const original = new Uint8Array(await Fs.readFile(Path.join(t.root, journalPath)));
    const conflicting = { ...t.f.creation, data: { ...t.f.creation.data, request: "Conflicting stored request" } };
    const appended = new TextEncoder().encode(`${serializeJournalEvent(conflicting)}\n`);
    const source = new Uint8Array(original.length + appended.length);
    source.set(original);
    source.set(appended, original.length);
    conflictOffset = original.length;
    await Fs.writeFile(Path.join(t.root, journalPath), source);
  }
  let commit: string | undefined;
  if (carrier === "checkpoint") {
    t.git(t.root, "add", journalPath);
    t.git(t.root, "commit", "-qm", "Retain the exact conflicting request source");
    commit = t.git(t.root, "rev-parse", "HEAD").trim();
    const context = await t.access.storage.context(t.root);
    const workspaceId = missionWorkspaceKey(context.commonDirectory, context.recordHome);
    const attachment: LocalWorkspaceAttachment = { format: "kepler.mission-workspace.v1", mission_id: t.f.missionId, record_home_repository_id: "record-home", repository_id: "record-home", workspace_id: workspaceId, workspace_path: context.recordHome, repository_path: context.recordHome, git_directory: context.commonDirectory, common_directory: context.commonDirectory, branch: "main", integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" } };
    const directory = Path.join(context.commonDirectory, "kepler", "missions", t.f.missionId, "workspaces");
    await Fs.mkdir(directory, { recursive: true });
    await Fs.writeFile(Path.join(directory, `${workspaceId}.json`), JSON.stringify(attachment));
  }
  const snapshot = await t.access.storage.snapshot(t.root, t.f.missionId);
  const activation = snapshot.files.find((file) => file.path.endsWith("/control/active.json"));
  if (!activation) throw new Error("The initial history activation is missing");
  const manifest = { ...t.f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: t.f.control.id, content_version: historyDigest(activation.bytes) }, source_inventory: historyInventory(snapshot) };
  const archives = new HistoryArchives(t.access.storage);
  const resetService = new HistoryReset({ access: t.access, archives, next: randomUUID, clock: () => new Date("2026-11-14T03:00:00.000Z"), producer: { name: "kepler", version: "fixture-reset" }, verifyScope: async () => ({ status: "valid", reference: "fixture:requester-scope", content_version: historyDigest("production-factory scope fixture") }) });
  await resetService.execute({ recordHome: t.root, missionId: t.f.missionId }, { phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:fixture-reset" });
  const reset = (await t.access.read(t.root, t.f.missionId)).control;
  if (!reset || reset.data.manifest.format !== "kepler.mission-history-reset") throw new Error("The test reset was not selected");
  const actualArchive = await archives.verify(t.root, t.f.missionId, manifest.archive_id);
  const archive = { index: actualArchive.index, files: actualArchive.files };
  const initialPlan = historyReconstructionPlan(t.f, reset, archive);
  const conflictFile = withConflict ? archive.files.find((file) => file.path === journalPath) : undefined;
  if (withConflict && (!conflictFile || conflictOffset === undefined)) throw new Error("The conflicting source file is missing from the verified archive");
  const conflictLine = conflictFile ? scanJournalBytes(conflictFile.bytes).lines.at(-1) : undefined;
  if (withConflict && (!conflictLine?.event || conflictLine.byteOffset !== conflictOffset)) throw new Error("The conflicting creation is missing from its indexed source range");
  const conflict = conflictFile && conflictLine?.event ? {
    reference: commit ? historyCheckpointMaterialReference({ repository_id: "record-home", commit }, conflictFile.path) : historyLeadReconciliationSnapshotReference(conflictFile.source_id),
    content_version: historyDigest(conflictFile.bytes),
    source_id: conflictFile.source_id,
    byte_offset: conflictLine.byteOffset,
    byte_length: conflictLine.byteLength + (conflictLine.terminated ? 1 : 0),
    event_id: conflictLine.event.id,
  } : undefined;
  const planActions = initialPlan.actions.filter((action) => action.action !== "add").map((action) => conflict && action.source?.source_id === conflict.source_id && action.source.byte_offset === conflict.byte_offset
    ? { ...action, action: "exclude" as const, reason: "Exclude the conflicting stored request" }
    : action);
  const plan = { ...initialPlan, actions: planActions, dependency_order: [], continuation: { operation: "recovery.inspect", unresolved_work: [], required_approvals: [] } };
  const checks = createNodeReconstructionChecks(t.access, { recordHome: t.root, missionId: t.f.missionId });
  const drafts = new HistoryDrafts({ access: t.access, archives, identity: randomUUID, clock: () => new Date("2026-11-14T04:00:00.000Z"), producer: { name: "kepler", version: "fixture-candidate" }, ...checks });
  return { ...t, reset, plan, drafts, scope: { recordHome: t.root, missionId: t.f.missionId }, ...(conflict ? { conflict } : {}) };
};

describe("original-request material and draft replay", () => {
  it("reads the exact snapshot statement and independently rechecks it during draft replay", async () => {
    const t = await fixture();
    const historyPath = `.kepler/missions/${t.f.missionId}/history/recovery/original-request`;
    const directory = Path.join(t.root, historyPath);
    await Fs.mkdir(directory, { recursive: true });
    if (t.reset.data.manifest.format !== "kepler.mission-history-reset") throw new Error("The test reset is not a mission-history reset");
    const originalRequest = "Implement the selected work";
    const statementBytes = renderHistoryOriginalRequestStatement({
      requester: t.plan.requester,
      mission_binding: t.reset.data.manifest.mission_binding,
      reset_event_id: t.reset.id,
      generation_id: t.reset.data.generation_id,
      original_request: originalRequest,
    });
    const statementPath = `${historyPath}/decision.txt`;
    await Fs.writeFile(Path.join(t.root, statementPath), statementBytes);
    const withStatement = await t.access.storage.snapshot(t.root, t.f.missionId);
    const statement = withStatement.files.find((file) => file.path === statementPath);
    if (!statement) throw new Error("The exact decision statement was not retained in the mission snapshot");
    const decisionReference = historyLeadReconciliationSnapshotReference(statement.sourceId);
    const assertionPath = `${historyPath}/assertion.json`;
    const assertion = {
      format: "kepler.history-original-request",
      version: 1,
      mission_binding: t.reset.data.manifest.mission_binding,
      reset_event_id: t.reset.id,
      generation_id: t.reset.data.generation_id,
      original_request: originalRequest,
      requester: t.plan.requester,
      decision_reference: decisionReference,
      assertion: "exact-original-request-unchanged",
      source_material: [{ reference: decisionReference, content_version: historyDigest(statementBytes) }],
      conflicting_sources: [],
    };
    const assertionBytes = new TextEncoder().encode(`${canonicalJson(assertion)}\n`);
    await Fs.writeFile(Path.join(t.root, assertionPath), assertionBytes);
    const withAssertion = await t.access.storage.snapshot(t.root, t.f.missionId);
    const assertionSource = withAssertion.files.find((file) => file.path === assertionPath);
    if (!assertionSource) throw new Error("The exact B3 assertion was not retained in the mission snapshot");
    const assertionReference = historyLeadReconciliationSnapshotReference(assertionSource.sourceId);
    const plan = { ...t.plan, required_material: { ...t.plan.required_material, evidence: [{ reference: assertionReference, content_version: historyDigest(assertionBytes) }] } };
    const candidateId = randomUUID();
    const prepared = await t.drafts.prepare(t.scope, { candidate_id: candidateId, plan });
    const manifest = prepared.manifest;
    const replay = await t.drafts.verify(t.scope, manifest);
    expect(replay.verification.material.reference).toContain("verified-reconstruction-material:");
    expect((await t.access.read(t.root, t.f.missionId)).historyVersion).toBe(t.reset.id);
    await Fs.writeFile(Path.join(t.root, statementPath), new TextEncoder().encode("changed statement bytes"));
    await expect(t.drafts.verify(t.scope, manifest)).rejects.toMatchObject({ code: "history_reconstruction_material_invalid" });
    expect((await t.access.read(t.root, t.f.missionId)).historyVersion).toBe(t.reset.id);
  });

  it.each(["snapshot", "checkpoint"] as const)("resolves a %s conflict carrier through the real material reader during replay", async (carrier) => {
    const t = await fixture(true, carrier);
    if (!("conflict" in t)) throw new Error("The conflict fixture is missing its exact source occurrence");
    if (t.reset.data.manifest.format !== "kepler.mission-history-reset") throw new Error("The test reset is not a mission-history reset");
    const historyPath = `.kepler/missions/${t.f.missionId}/history/recovery/original-request`;
    await Fs.mkdir(Path.join(t.root, historyPath), { recursive: true });
    const originalRequest = "Implement the selected work";
    const statementBytes = renderHistoryOriginalRequestStatement({
      requester: t.plan.requester,
      mission_binding: t.reset.data.manifest.mission_binding,
      reset_event_id: t.reset.id,
      generation_id: t.reset.data.generation_id,
      original_request: originalRequest,
    });
    const statementPath = `${historyPath}/decision.txt`;
    await Fs.writeFile(Path.join(t.root, statementPath), statementBytes);
    const withStatement = await t.access.storage.snapshot(t.root, t.f.missionId);
    const statement = withStatement.files.find((file) => file.path === statementPath);
    if (!statement) throw new Error("The exact decision statement was not retained in the mission snapshot");
    const decisionReference = historyLeadReconciliationSnapshotReference(statement.sourceId);
    const assertionPath = `${historyPath}/assertion.json`;
    const assertion = {
      format: "kepler.history-original-request",
      version: 1,
      mission_binding: t.reset.data.manifest.mission_binding,
      reset_event_id: t.reset.id,
      generation_id: t.reset.data.generation_id,
      original_request: originalRequest,
      requester: t.plan.requester,
      decision_reference: decisionReference,
      assertion: "exact-original-request-unchanged",
      source_material: [{ reference: decisionReference, content_version: historyDigest(statementBytes) }],
      conflicting_sources: [t.conflict],
    };
    const assertionBytes = new TextEncoder().encode(`${canonicalJson(assertion)}\n`);
    await Fs.writeFile(Path.join(t.root, assertionPath), assertionBytes);
    const withAssertion = await t.access.storage.snapshot(t.root, t.f.missionId);
    const assertionSource = withAssertion.files.find((file) => file.path === assertionPath);
    if (!assertionSource) throw new Error("The exact B3 assertion was not retained in the mission snapshot");
    const assertionReference = historyLeadReconciliationSnapshotReference(assertionSource.sourceId);
    const plan = { ...t.plan, required_material: { ...t.plan.required_material, evidence: [{ reference: assertionReference, content_version: historyDigest(assertionBytes) }] } };
    const prepared = await t.drafts.prepare(t.scope, { candidate_id: randomUUID(), plan });
    const replay = await t.drafts.verify(t.scope, prepared.manifest);
    expect(replay.verification.material.reference).toContain("verified-reconstruction-material:");
  });
});
