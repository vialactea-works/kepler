import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest } from "../../packages/cli/src/history/control.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { createNodeReconstructionChecks, historyCheckpointMaterialReference } from "../../packages/cli/src/history/reconstruction-runtime.js";
import { historyLeadReconciliationSnapshotReference } from "../../packages/cli/src/history/reconciliation.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { missionWorkspaceKey, type LocalWorkspaceAttachment } from "../../packages/cli/src/construction/mission-workspace.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { await Fs.rm(root, { recursive: true, force: true }); await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" }); } });

const fixture = async () => {
  const t = await createHistoryRepository();
  roots.push(t.parent);
  const payload = new Uint8Array([0xff, 0x00, 0x0a, 0x80, 0x23]);
  await Fs.mkdir(Path.join(t.root, "fixtures"));
  await Fs.writeFile(Path.join(t.root, "fixtures", "proof.bin"), payload);
  t.git(t.root, "add", "fixtures/proof.bin");
  t.git(t.root, "commit", "-qm", "Record isolated checkpoint material");
  const commit = t.git(t.root, "rev-parse", "HEAD").trim();
  const context = await t.access.storage.context(t.root);
  const workspaceId = missionWorkspaceKey(context.commonDirectory, context.recordHome);
  const attachment: LocalWorkspaceAttachment = { format: "kepler.mission-workspace.v1", mission_id: t.f.missionId, record_home_repository_id: "record-home", repository_id: "record-home", workspace_id: workspaceId, workspace_path: context.recordHome, repository_path: context.recordHome, git_directory: context.commonDirectory, common_directory: context.commonDirectory, branch: "main", integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" } };
  const directory = Path.join(context.commonDirectory, "kepler", "missions", t.f.missionId, "workspaces");
  await Fs.mkdir(directory, { recursive: true });
  await Fs.writeFile(Path.join(directory, `${workspaceId}.json`), JSON.stringify(attachment));
  const snapshot = await t.access.storage.snapshot(t.root, t.f.missionId);
  const manifest = { ...t.f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: t.f.control.id, content_version: historyDigest(t.f.input.activation!) }, source_inventory: historyInventory(snapshot) };
  const archives = new HistoryArchives(t.access.storage);
  const index = await archives.prepare(manifest, snapshot);
  const archive = await archives.preserve(manifest, index, snapshot);
  const checks = createNodeReconstructionChecks(t.access, { recordHome: t.root, missionId: t.f.missionId });
  const history = collectHistory(t.f.missionId, [t.f.source], { completeness: "complete", generationId: t.f.generationId });
  return { ...t, checks, history, archive, snapshot, context, payload, commit };
};

describe("real reconstruction evidence sources", () => {
  it("rereads exact mission snapshot and preserved archive bytes without activating history", async () => {
    const t = await fixture();
    const source = t.snapshot.files.find((file) => file.path.includes(`/generations/${t.f.generationId}/construction/`))!;
    const snapshotReference = historyLeadReconciliationSnapshotReference(source.sourceId);
    const captured = await t.checks.readMaterial(snapshotReference, t.archive);
    expect(captured.bytes).toEqual(source.bytes);
    expect(captured.source_path).toBe(source.path);
    const archiveReference = `local-archive:${t.archive.index.archive_id}/source/${historyDigest(source.sourceId).slice(7)}.bin`;
    const preserved = await t.checks.readMaterial(archiveReference, t.archive);
    expect(preserved.bytes).toEqual(source.bytes);
    expect((await t.access.read(t.root, t.f.missionId)).historyVersion).toBe(t.f.control.id);
    await expect(t.checks.readMaterial("file:///etc/passwd", t.archive)).rejects.toMatchObject({ code: "history_material_reference_unsupported" });
  });

  it("resolves actual binary blobs through the recorded prepared repository and rejects substitution", async () => {
    const t = await fixture();
    const reference = historyCheckpointMaterialReference({ repository_id: "record-home", commit: t.commit }, "fixtures/proof.bin");
    const read = await t.checks.readMaterial(reference, t.archive, t.history);
    expect(read.bytes).toEqual(t.payload);
    expect(read.content_version).toBe(historyDigest(t.payload));
    expect(read.source_path).toBe("fixtures/proof.bin");
    const foreign = historyCheckpointMaterialReference({ repository_id: "another-repository", commit: t.commit }, "fixtures/proof.bin");
    await expect(t.checks.readMaterial(foreign, t.archive, t.history)).rejects.toMatchObject({ code: "history_material_missing" });
    expect(() => historyCheckpointMaterialReference({ repository_id: "record-home", commit: t.commit }, "../outside")).toThrow();
    await expect(t.checks.readMaterial(reference, t.archive)).rejects.toMatchObject({ code: "history_material_reference_unsupported" });
  });
});
