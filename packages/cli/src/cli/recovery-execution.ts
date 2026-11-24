import type { HistoryAccess } from "../history/access.js";
import { HistoryError, historyManifestDigest } from "../history/control.js";
import type { HistoryDrafts } from "../history/drafts.js";
import type { HistoryOperation } from "../history/operation-intent.js";
import type { HistoryOperations } from "../history/operations.js";
import { createNodeHistoryRecovery } from "../history/recovery-runtime.js";
import { parseStrictJson } from "../json/strict-json.js";
import { createNodeHistoryMigrationGuideReader } from "./history-migration-guide.js";
import { CLI_RELEASE } from "./version.js";

export type RecoveryOperationName = HistoryOperation | "reconstruct";
export interface RecoveryExecutionScope {
  readonly recordHome: string;
  readonly missionId: string;
}
export type RecoveryHistoryExecution = (operation: RecoveryOperationName, scope: RecoveryExecutionScope, input: string) => Promise<Readonly<Record<string, unknown>>>;
export interface RecoveryExecutionRuntime {
  readonly operations: Pick<HistoryOperations, "execute">;
  readonly drafts: Pick<HistoryDrafts, "prepare" | "verify">;
  readonly access: Pick<HistoryAccess, "read">;
}
export type RecoveryReconstructionRequest =
  | { readonly phase: "prepare"; readonly candidate_id: string; readonly plan: unknown }
  | { readonly phase: "check"; readonly manifest: unknown };

export const parseRecoveryReconstructionRequest = (input: string): RecoveryReconstructionRequest => {
  const parsed = parseStrictJson(input);
  if (parsed.kind !== "parsed" || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) throw new HistoryError("history_reconstruction_request_invalid", "Reconstruction requires one strict JSON request object.");
  const request = parsed.value as Record<string, unknown>;
  const keys = request.phase === "prepare" ? ["phase", "candidate_id", "plan"] : request.phase === "check" ? ["phase", "manifest"] : [];
  if (!keys.length || Object.keys(request).length !== keys.length || !keys.every((key) => Object.hasOwn(request, key)) || request.phase === "prepare" && typeof request.candidate_id !== "string") throw new HistoryError("history_reconstruction_request_invalid", "Use prepare with candidate_id and plan, or check with the complete manifest.");
  return request as unknown as RecoveryReconstructionRequest;
};

export const executeRecoveryRequest = async (operation: RecoveryOperationName, scope: RecoveryExecutionScope, input: string, runtime: RecoveryExecutionRuntime): Promise<Readonly<Record<string, unknown>>> => {
  const target = Object.freeze({ recordHome: scope.recordHome, missionId: scope.missionId });
  if (operation !== "reconstruct") return runtime.operations.execute(operation, target, input);
  const request = parseRecoveryReconstructionRequest(input);
  const result = request.phase === "prepare"
    ? await runtime.drafts.prepare(target, { candidate_id: request.candidate_id, plan: request.plan })
    : await runtime.drafts.verify(target, request.manifest).then((prepared) => ({ manifest: prepared.manifest, manifest_hash: historyManifestDigest(prepared.manifest), checked: true, published: false }));
  const view = await runtime.access.read(target.recordHome, target.missionId);
  return { ...result, mission_id: target.missionId, generation_id: view.generationId ?? null, history_version: view.historyVersion ?? null, mode: view.mode, execution_started: false };
};

export const createNodeRecoveryHistoryExecution = (): RecoveryHistoryExecution => {
  const readGuide = createNodeHistoryMigrationGuideReader();
  return (operation, scope, input) => {
    const runtime = createNodeHistoryRecovery(scope, { name: "kepler", version: CLI_RELEASE }, { readGuide });
    return executeRecoveryRequest(operation, scope, input, runtime);
  };
};
