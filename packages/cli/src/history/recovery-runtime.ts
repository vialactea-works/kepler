import { randomUUID } from "node:crypto";
import { createNodeMissionWorkspaceRuntime } from "../construction/mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "../construction/mission-workspace.js";
import { createNodeHistoryAccess } from "./access-runtime.js";
import { HistoryArchives } from "./archives.js";
import { HistoryError } from "./control.js";
import { HistoryDrafts } from "./drafts.js";
import { HistoryOperations, type HistoryOperationsRuntime } from "./operations.js";
import { createNodeHistoryReconciliation } from "./reconciliation.js";
import { createNodeReconstructionChecks } from "./reconstruction-runtime.js";

export const createNodeHistoryRecovery = (scope: { readonly recordHome: string; readonly missionId: string }, producer: { readonly name: string; readonly version: string }, options: { readonly workspace?: MissionWorkspaceRuntime; readonly readGuide?: HistoryOperationsRuntime["readGuide"] } = {}) => {
  const target = Object.freeze({ ...scope });
  const workspace = options.workspace ?? createNodeMissionWorkspaceRuntime({ cwd: target.recordHome });
  const access = createNodeHistoryAccess(workspace);
  const archives = new HistoryArchives(access.storage);
  const checks = createNodeReconstructionChecks(access, target, workspace);
  const drafts = new HistoryDrafts({ access, archives, identity: randomUUID, clock: () => new Date(), producer: { ...producer }, ...checks });
  const operations = new HistoryOperations({ access, archives, next: randomUUID, clock: () => new Date(), producer: { ...producer }, verifyScope: createNodeHistoryReconciliation(access), ...(options.readGuide ? { readGuide: options.readGuide } : {}), verifyCandidate: (selected, manifest) => {
    if (selected.recordHome !== target.recordHome || selected.missionId !== target.missionId) throw new HistoryError("history_operation_context_changed", "Candidate verification cannot cross its original record-home and mission scope.");
    return drafts.verify(target, manifest);
  } });
  return { access, archives, drafts, operations };
};
