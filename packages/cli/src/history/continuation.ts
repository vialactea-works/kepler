import { CONSTRUCTION_ACTIVITIES, CONSTRUCTION_STAGES, type ConstructionActivity, type ConstructionStage } from "../construction/events.js";
import { projectConstruction, type ConstructionUnitProjection } from "../construction/projection.js";
import { ConstructionQueries } from "../construction/scoped-queries.js";
import { stageStartAuthority } from "../construction/stage-start.js";
import type { UnitQueryContextResult, UnitQueryFileSystem } from "../construction/unit-queries.js";
import { HistoryError, historyDigest, parseHistoryControl } from "./control.js";
import { collectHistory, type HistoryCollection } from "./collection.js";
import { canonicalJson } from "./journal.js";
import { historyState } from "./gateway.js";
import type { ReconstructionCheck, ReconstructionContinuationRequest } from "./reconstruction.js";

export type HistoryContinuation =
  | { readonly operation: "recovery.inspect" }
  | { readonly operation: "construction.unit.show"; readonly unitId: string }
  | { readonly operation: "construction.stage.show" | "construction.stage.start" | "construction.stage.continue"; readonly unitId: string; readonly stage: ConstructionStage; readonly attemptId?: string }
  | { readonly operation: "construction.task.ready" | "construction.task.admit"; readonly unitId: string; readonly taskId: string }
  | { readonly operation: "construction.activity.show"; readonly unitId: string; readonly taskId: string; readonly activity: ConstructionActivity; readonly implementationAttemptId: string };

export interface HistoryContinuationRuntime {
  readonly recordHome: string;
  readonly fileSystem: UnitQueryFileSystem;
  readonly verifyWorkspaces: (request: { readonly missionId: string; readonly history: HistoryCollection; readonly unit: ConstructionUnitProjection }) => Promise<ReconstructionCheck>;
}

const unitId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid = (reason: string): ReconstructionCheck => ({ status: "invalid", reason });
const invalidOperation = (): never => { throw new HistoryError("history_continuation_invalid", "Continuation must name a supported operation and its exact colon-separated unit, stage, task, or attempt selectors."); };

export const parseHistoryContinuation = (input: unknown): HistoryContinuation => {
  if (typeof input !== "string") return invalidOperation();
  if (input === "recovery.inspect") return { operation: "recovery.inspect" };
  const [operation, unit, ...selectors] = input.split(":");
  if (!unit || !unitId.test(unit)) return invalidOperation();
  if (operation === "construction.unit.show" && selectors.length === 0) return { operation, unitId: unit };
  if (["construction.stage.show", "construction.stage.start", "construction.stage.continue"].includes(operation!)) {
    const [stage, attemptId] = selectors;
    const continuing = operation === "construction.stage.continue";
    if (!stage || !CONSTRUCTION_STAGES.includes(stage as ConstructionStage) || selectors.length !== (continuing ? 2 : 1) || continuing && (!attemptId || !uuid.test(attemptId))) return invalidOperation();
    return { operation: operation as "construction.stage.show" | "construction.stage.start" | "construction.stage.continue", unitId: unit, stage: stage as ConstructionStage, ...(continuing ? { attemptId } : {}) };
  }
  if ((operation === "construction.task.ready" || operation === "construction.task.admit") && selectors.length === 1 && uuid.test(selectors[0]!)) return { operation, unitId: unit, taskId: selectors[0]! };
  if (operation === "construction.activity.show" && selectors.length === 3 && uuid.test(selectors[0]!) && CONSTRUCTION_ACTIVITIES.includes(selectors[1] as ConstructionActivity) && uuid.test(selectors[2]!)) return { operation, unitId: unit, taskId: selectors[0]!, activity: selectors[1] as ConstructionActivity, implementationAttemptId: selectors[2]! };
  return invalidOperation();
};

export class HistoryContinuations {
  private readonly runtime: HistoryContinuationRuntime;

  public constructor(runtime: HistoryContinuationRuntime) {
    if (typeof runtime.verifyWorkspaces !== "function") throw new HistoryError("history_continuation_verifier_required", "Mutation continuation requires a real prepared-workspace verifier.");
    this.runtime = { ...runtime, fileSystem: { ...runtime.fileSystem } };
  }

  public async verify(input: ReconstructionContinuationRequest): Promise<ReconstructionCheck> {
    const reset = parseHistoryControl(input.reset);
    const history = this.copyHistory(input.history, input.plan.generation_id);
    const request: ReconstructionContinuationRequest = { ...input, reset, plan: JSON.parse(canonicalJson(input.plan)), continuation: JSON.parse(canonicalJson(input.continuation)), expected_state: JSON.parse(canonicalJson(input.expected_state)), required_material: JSON.parse(canonicalJson(input.required_material)), history };
    if (reset.type !== "mission.history-reset" || reset.id !== request.plan.reset_event_id || reset.data.mission_id !== request.plan.mission_id || reset.data.generation_id !== request.plan.generation_id || request.history.missionId !== request.plan.mission_id || canonicalJson(request.plan.continuation) !== canonicalJson(request.continuation)) return invalid("The candidate, plan, continuation, and selected reset have different scope bindings.");
    try { if (canonicalJson(historyState(history)) !== canonicalJson(request.expected_state)) return invalid("Actual candidate state differs from the declared continuation state."); } catch { return invalid("Actual candidate history fails normal workflow guards."); }
    let operation: HistoryContinuation;
    try { operation = parseHistoryContinuation(request.continuation.operation); } catch (error) { return invalid(error instanceof Error ? error.message : "Unsupported continuation"); }
    const projection = projectConstruction(request.history);
    if (projection.blocked || request.history.issues.length) return invalid("Candidate history does not pass the normal Construction projection guards.");
    if (operation.operation === "recovery.inspect") return { status: "valid", reference: `candidate-continuation:${historyDigest(canonicalJson({ operation, state: request.expected_state, unresolved_work: request.continuation.unresolved_work, required_approvals: request.continuation.required_approvals })).slice(7)}` };
    const unit = projection.units.find((candidate) => candidate.unitId === operation.unitId);
    if (!unit || unit.blocked || unit.workflow !== "standard" || unit.missionId !== request.plan.mission_id) return invalid("The explicit continuation unit has no unblocked Standard mission membership.");
    const context: Extract<UnitQueryContextResult, { readonly kind: "context" }> = { kind: "context", recordHome: this.runtime.recordHome, missionId: request.plan.mission_id, history: request.history, projection, unit };
    const queries = new ConstructionQueries({ readContext: async (selected) => selected === operation.unitId ? context : { kind: "failed", code: "history_continuation_scope_changed", message: "The requested unit differs from the candidate scope.", details: {}, recovery: "Use the exact candidate unit." } }, this.runtime.fileSystem);
    if (operation.operation === "construction.stage.start") {
      const authority = stageStartAuthority({ history: request.history, missionId: unit.missionId, unit }, operation.stage);
      if (authority.kind !== "valid") return invalid(`${authority.code}: ${authority.message}`);
      const workspaces = await this.workspaces(request, unit);
      if (workspaces.status !== "valid") return workspaces;
    } else if (operation.operation === "construction.stage.continue") {
      const stage = unit.stages.find((candidate) => candidate.stage === operation.stage);
      const attempt = stage?.attempts.find((candidate) => candidate.attemptId === operation.attemptId);
      if (!stage || stage.currentAttemptId !== operation.attemptId || stage.state !== "running" || attempt?.state !== "running") return invalid("Stage continuation requires the exact currently running attempt; paused, waiting, completed, and abandoned attempts need their normal operations.");
      const workspaces = await this.workspaces(request, unit);
      if (workspaces.status !== "valid") return workspaces;
    } else if (operation.operation === "construction.stage.show") {
      const result = await queries.stageShow(operation.unitId, operation.stage);
      if (result.kind !== "stage-shown" || result.unknowns.length) return invalid("The normal stage query cannot establish the selected candidate scope.");
    } else if (operation.operation === "construction.task.ready" || operation.operation === "construction.task.admit") {
      const result = await queries.taskReady(operation.unitId, operation.taskId);
      if (result.kind !== "task-readiness" || result.unknowns.length || operation.operation === "construction.task.admit" && result.readiness !== "ready") return invalid("The real task graph, prerequisite evidence, or candidate history does not establish this task operation's readiness.");
      if (operation.operation === "construction.task.admit") {
        const workspaces = await this.workspaces(request, unit);
        if (workspaces.status !== "valid") return workspaces;
      }
    } else if (operation.operation === "construction.activity.show") {
      const result = await queries.activityShow(operation.unitId, operation.taskId, operation.activity, operation.implementationAttemptId);
      if (result.kind !== "activity-shown" || result.unknowns.length) return invalid("The normal Activity query cannot establish this exact implementation attempt and task scope.");
    }
    return { status: "valid", reference: `candidate-continuation:${historyDigest(canonicalJson({ operation, state: request.expected_state, unresolved_work: request.continuation.unresolved_work, required_approvals: request.continuation.required_approvals })).slice(7)}` };
  }

  private copyHistory(history: HistoryCollection, generationId: string): HistoryCollection {
    return collectHistory(history.missionId, history.journals.map((journal) => ({ sourceId: journal.sourceId, missionId: journal.missionId, generationId, phase: journal.phase, journalId: journal.journalId, bytes: new Uint8Array(journal.bytes) })), { completeness: history.sourceSetComplete ? "complete" : "incomplete", generationId });
  }

  private async workspaces(request: ReconstructionContinuationRequest, unit: ConstructionUnitProjection): Promise<ReconstructionCheck> {
    const history = this.copyHistory(request.history, request.plan.generation_id);
    const copy = projectConstruction(history).units.find((candidate) => candidate.unitId === unit.unitId);
    if (!copy) return invalid("The workspace check has no current candidate unit.");
    return this.runtime.verifyWorkspaces({ missionId: unit.missionId, history, unit: copy });
  }
}
