import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createNodeMissionWorkspaceRuntime } from "../construction/mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "../construction/mission-workspace.js";
import { captureStageCheckpoints } from "../construction/stage-start.js";
import { verifyStageCheckpointSet } from "../construction/stage-checkpoint-content.js";
import { createNodeUnitQueryFileSystem } from "../construction/unit-queries-runtime.js";
import type { RepositoryCheckpoint } from "../construction/events.js";
import type { HistoryAccess } from "./access.js";
import { HistoryArchives } from "./archives.js";
import { historyArchiveIndexDigest } from "./archive-index.js";
import { HistoryError, historyDigest, safeHistoryRelativePath } from "./control.js";
import { HistoryContinuations } from "./continuation.js";
import { createHistoryReconciliationEvidenceReader, historyLeadReconciliationSnapshotReference } from "./reconciliation.js";
import { ReconstructionEvidence, type ResolvedHistoryMaterial } from "./reconstruction-evidence.js";
import type { ReconstructionArchive, ReconstructionDependencies, ReconstructionMaterialRequest } from "./reconstruction.js";

const execute = promisify(execFile);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const commit = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export const historyCheckpointMaterialReference = (checkpoint: RepositoryCheckpoint, path: string): string => {
  if (!checkpoint.repository_id.trim() || !commit.test(checkpoint.commit) || !safeHistoryRelativePath(path)) throw new HistoryError("history_checkpoint_reference_invalid", "Checkpoint material requires an exact repository, commit, and safe relative path.");
  return `checkpoint:${encodeURIComponent(checkpoint.repository_id)}/${checkpoint.commit}/${encodeURIComponent(path)}`;
};

export interface NodeReconstructionChecks extends Pick<ReconstructionDependencies, "verifyAuthority" | "verifyMaterial" | "verifyContinuation"> {
  readonly readMaterial: (reference: string, archive: ReconstructionArchive, history?: ReconstructionMaterialRequest["history"]) => Promise<ResolvedHistoryMaterial>;
}

export const createNodeReconstructionChecks = (access: HistoryAccess, scope: { readonly recordHome: string; readonly missionId: string }, workspace: MissionWorkspaceRuntime = createNodeMissionWorkspaceRuntime()): NodeReconstructionChecks => {
  const target = Object.freeze({ ...scope });
  const archives = new HistoryArchives(access.storage);
  const repositories = async (history: ReconstructionMaterialRequest["history"]) => {
    if (history.missionId !== target.missionId) throw new HistoryError("history_checkpoint_scope_invalid", "Checkpoint reads cannot cross the selected candidate mission.");
    const context = await access.storage.context(target.recordHome);
    const captured = await captureStageCheckpoints({ workspace }, { missionId: target.missionId, history }, context.commonDirectory);
    if (captured.kind !== "valid") throw new HistoryError(captured.code, captured.message, captured.details);
    return captured.repositoryRoots;
  };
  const checkpointBytes = async (checkpoint: RepositoryCheckpoint, sourcePath: string | null, history: ReconstructionMaterialRequest["history"]): Promise<{ readonly exists: boolean; readonly bytes?: Uint8Array }> => {
    if (!commit.test(checkpoint.commit) || sourcePath !== null && !safeHistoryRelativePath(sourcePath)) throw new HistoryError("history_checkpoint_reference_invalid", "A checkpoint input has an invalid commit or relative path.");
    const roots = await repositories(history);
    const root = roots.find((root) => root.repository_id === checkpoint.repository_id);
    if (!root || (await verifyStageCheckpointSet({ git: workspace.git }, [root], [checkpoint])).kind !== "valid") return { exists: false };
    if (sourcePath === null) return { exists: true };
    try {
      const result = await execute("git", ["cat-file", "blob", `${checkpoint.commit}:${sourcePath}`], { cwd: root.repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
      return { exists: true, bytes: new Uint8Array(result.stdout) };
    } catch { return { exists: false }; }
  };
  const readMaterial: NodeReconstructionChecks["readMaterial"] = async (reference, proposedArchive, history) => {
    if (reference.startsWith("snapshot:")) {
      const snapshot = await access.storage.snapshot(target.recordHome, target.missionId);
      const value = await createHistoryReconciliationEvidenceReader(access, target.recordHome, snapshot)(reference);
      const source = snapshot.files.find((source) => historyLeadReconciliationSnapshotReference(source.sourceId) === reference);
      if (!source) throw new HistoryError("history_material_missing", "The exact snapshot material is unavailable.");
      return { ...value, source_path: source.path };
    }
    const archived = reference.match(/^local-archive:([0-9a-f-]{36})\/source\/([0-9a-f]{64})\.bin$/);
    if (archived && uuid.test(archived[1]!)) {
      if (proposedArchive.index.mission_id !== target.missionId) throw new HistoryError("history_material_scope_invalid", "Archived material belongs to another mission.");
      const same = archived[1] === proposedArchive.index.archive_id;
      const actual = await archives.verify(target.recordHome, target.missionId, archived[1]!, same ? { indexHash: historyArchiveIndexDigest(proposedArchive.index), manifestHash: proposedArchive.index.manifest_hash } : {});
      const file = actual.files.find((file) => historyDigest(file.source_id).slice(7) === archived[2]);
      if (!file) throw new HistoryError("history_material_missing", "The exact archived source identity is unavailable.");
      return { reference, content_version: historyDigest(file.bytes), bytes: new Uint8Array(file.bytes), source_path: file.path };
    }
    const git = reference.match(/^checkpoint:([^/]+)\/((?:[0-9a-f]{40}|[0-9a-f]{64}))\/([^/]+)$/);
    if (git && history) {
      let repositoryId: string;
      let sourcePath: string;
      try { repositoryId = decodeURIComponent(git[1]!); sourcePath = decodeURIComponent(git[3]!); } catch { throw new HistoryError("history_checkpoint_reference_invalid", "Checkpoint material has malformed encoded coordinates."); }
      const checkpoint = { repository_id: repositoryId, commit: git[2]! };
      if (historyCheckpointMaterialReference(checkpoint, sourcePath) !== reference) throw new HistoryError("history_checkpoint_reference_invalid", "Checkpoint material must use canonical exact coordinates.");
      const result = await checkpointBytes(checkpoint, sourcePath, history);
      if (!result.exists || !result.bytes) throw new HistoryError("history_material_missing", "Committed material is missing from its actual prepared repository.");
      return { reference, content_version: historyDigest(result.bytes), bytes: new Uint8Array(result.bytes), source_path: sourcePath };
    }
    throw new HistoryError("history_material_reference_unsupported", "Material must use an exact snapshot source, preserved archive source, or candidate-bound checkpoint reference.");
  };
  const evidence = new ReconstructionEvidence({ readMaterial, checkpoint: checkpointBytes });
  const continuations = new HistoryContinuations({ recordHome: target.recordHome, fileSystem: createNodeUnitQueryFileSystem(), verifyWorkspaces: async (request) => {
    try { await repositories(request.history); return { status: "valid", reference: "verified-prepared-mission-workspaces" }; }
    catch (error) { return { status: "invalid", reason: error instanceof Error ? error.message : String(error) }; }
  } });
  return { readMaterial, verifyAuthority: (request) => evidence.authority(request), verifyMaterial: (request) => evidence.material(request), verifyContinuation: (request) => continuations.verify(request) };
};
