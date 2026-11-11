import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { admittedTaskContract } from "./task-admission.js";
import { readImplementationPlanningCompletionRecord } from "./implementation-planning-completion.js";
import { inspectConstructionIntegrationLock, type IntegrationLockInspection } from "./integration-execution.js";
import { retainedActivityFor } from "./retained-activity.js";
import { ConstructionQueries, type TaskExecutionContext } from "./scoped-queries.js";
import {
  captureStageCheckpoints,
  createNodeStageStartRuntime,
  type StageStartRuntime,
} from "./stage-start.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import {
  CONSTRUCTION_ACTIVITIES,
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  CONSTRUCTION_STAGES,
  validateConstructionEvent,
  type ConstructionActivity,
  type ConstructionStage,
  type MaterialInput,
  type StageAttemptId,
  type ActivityAttemptId,
} from "./events.js";
import type { ConstructionActivityProjection, ConstructionHistoryFact, ConstructionTaskProjection, ConstructionUnitProjection } from "./projection.js";
import { runWithConstructionRevisionFence } from "./unit-control.js";
import type { RevisionBarrierTarget } from "./revision-state.js";

export type ConstructionPauseResumeResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

export interface ConstructionPauseOrchestratorAttestation {
  readonly exact_run_terminal: true;
  readonly effects_reconciled: true;
  readonly run_reference: string;
  readonly reconciliation_references: readonly string[];
}

export type ConstructionPausePhase =
  | { readonly phase: "request"; readonly reason: string }
  | { readonly phase: "acknowledge"; readonly reason: string; readonly orchestrator_attestation: ConstructionPauseOrchestratorAttestation };

export interface ConstructionResumeRequest {
  readonly inputs: readonly MaterialInput[];
}

export interface ConstructionPauseResumeRuntime extends StageStartRuntime {
  readonly inspectIntegrationLock: (
    commonDirectory: string,
    missionId: string,
    unitId: string,
  ) => Promise<IntegrationLockInspection>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
};
const sameValue = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
const sameInputs = (left: unknown, right: readonly MaterialInput[]): boolean =>
  Array.isArray(left) && left.every((item) => isRecord(item) && nonEmpty(item.reference) && nonEmpty(item.purpose)) &&
  [...left].map(canonicalJson).sort().join("\0") === right.map(canonicalJson).sort().join("\0");
const checkpointKey = (value: unknown): string => {
  if (!Array.isArray(value) || !value.every((item) => isRecord(item) && nonEmpty(item.repository_id) && nonEmpty(item.commit))) return "invalid";
  return canonicalJson(value.slice().sort((left, right) => String((left as Record<string, unknown>).repository_id).localeCompare(String((right as Record<string, unknown>).repository_id))));
};
const persistedPauseReason = (request: ConstructionPausePhase): string => request.phase === "request"
  ? request.reason
  : `${request.reason}\nOrchestrator attestation: ${canonicalJson(request.orchestrator_attestation)}`;
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Preserve the selected attempt and reconcile its current effects before retrying.",
): ConstructionPauseResumeResult => ({ kind: "failed", code, message, details, recovery });
const propagate = (result: Extract<AuditHistoryReadResult, { readonly kind: "failed" }>): ConstructionPauseResumeResult =>
  failure(result.code, result.message, result.details, result.recovery);

export const validateConstructionPauseRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: ConstructionPausePhase }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRecord(value) || !nonEmpty(value.reason)) return {
    kind: "invalid",
    issues: [{ pointer: "", message: "Expected a pause phase and a non-empty reason." }],
  };
  if (value.phase === "request" && onlyKeys(value, ["phase", "reason"])) {
    return { kind: "valid", request: { phase: "request", reason: value.reason } };
  }
  if (value.phase === "acknowledge" && onlyKeys(value, ["phase", "reason", "orchestrator_attestation"]) &&
      isRecord(value.orchestrator_attestation) &&
      onlyKeys(value.orchestrator_attestation, ["exact_run_terminal", "effects_reconciled", "run_reference", "reconciliation_references"]) &&
      value.orchestrator_attestation.exact_run_terminal === true &&
      value.orchestrator_attestation.effects_reconciled === true &&
      nonEmpty(value.orchestrator_attestation.run_reference) &&
      Array.isArray(value.orchestrator_attestation.reconciliation_references) &&
      value.orchestrator_attestation.reconciliation_references.length > 0 &&
      value.orchestrator_attestation.reconciliation_references.every(nonEmpty) &&
      new Set(value.orchestrator_attestation.reconciliation_references).size === value.orchestrator_attestation.reconciliation_references.length) {
    return { kind: "valid", request: {
      phase: "acknowledge",
      reason: value.reason,
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: value.orchestrator_attestation.run_reference,
        reconciliation_references: value.orchestrator_attestation.reconciliation_references,
      },
    } };
  }
  return {
    kind: "invalid",
    issues: [{ pointer: "", message: "A pause request has only phase and reason; acknowledgment requires an orchestrator attestation of exact-run terminal status and reconciled effects with auditable references." }],
  };
};

export const validateConstructionResumeRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: ConstructionResumeRequest }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRecord(value) || !onlyKeys(value, ["inputs"]) || !Array.isArray(value.inputs)) return {
    kind: "invalid",
    issues: [{ pointer: "/inputs", message: "Expected an inputs array and no unknown request fields." }],
  };
  const inputs: MaterialInput[] = [];
  value.inputs.forEach((input) => {
    if (!isRecord(input) || !onlyKeys(input, ["reference", "purpose"]) || !nonEmpty(input.reference) || !nonEmpty(input.purpose)) {
      return;
    }
    inputs.push({ reference: input.reference, purpose: input.purpose });
  });
  if (inputs.length !== value.inputs.length) return {
    kind: "invalid",
    issues: [{ pointer: "/inputs", message: "Each input requires only a non-empty reference and purpose." }],
  };
  return { kind: "valid", request: { inputs } };
};

const commonDirectory = async (runtime: ConstructionPauseResumeRuntime, root: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return await runtime.workspace.fileSystem.realpath(Path.resolve(root, result.stdout.trim()));
  } catch {
    return undefined;
  }
};

const stageStartFact = (facts: readonly ConstructionHistoryFact[], attemptId: string): ConstructionHistoryFact | undefined =>
  facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type) &&
    fact.event.data.stage_attempt_id === attemptId).at(-1);

const activityStartFact = (attempt: { readonly facts: readonly ConstructionHistoryFact[] }): ConstructionHistoryFact | undefined =>
  attempt.facts.filter((fact) => ["construction.activity-attempt-started", "construction.activity-resumed"].includes(fact.event.type)).at(-1);

const latestActivityCompletion = (
  task: ConstructionTaskProjection,
  activityName: ConstructionActivity,
  implementationAttemptId: string,
): ConstructionHistoryFact | undefined => {
  const activity = task.activities.find((item) => item.activity === activityName);
  if (!activity || activity.state !== "completed" || !activity.currentAttemptId) return undefined;
  const attempt = activity.attempts.find((item) => item.attemptId === activity.currentAttemptId &&
    item.stageAttemptId === implementationAttemptId && item.state === "completed");
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed") ?? [];
  return completions.length === 1 ? completions[0] : undefined;
};

const currentPlanningGraphRef = (unit: ConstructionUnitProjection) => {
  const stage = unit.stages.find((item) => item.stage === "implementation-planning");
  if (!stage || stage.state !== "completed" || !stage.currentAttemptId) return undefined;
  const attempt = stage.attempts.find((item) => item.attemptId === stage.currentAttemptId && item.state === "completed");
  const completion = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed");
  const fact = completion?.length === 1 ? completion[0] : undefined;
  if (!fact || fact.event.type !== "construction.stage-attempt-completed") return undefined;
  return readImplementationPlanningCompletionRecord(fact.event.data.implementation_planning_assessment)?.graph_ref;
};

const currentStageAuthority = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  stage: ConstructionStage,
  start: ConstructionHistoryFact,
): { readonly kind: "valid"; readonly eventIds: readonly string[] } | { readonly kind: "failed"; readonly details: Readonly<Record<string, unknown>> } => {
  const stageIndex = CONSTRUCTION_STAGES.indexOf(stage);
  const priorStages = loaded.unit.stages.slice(0, stageIndex);
  if (priorStages.some((prior) => prior.state !== "completed")) return {
    kind: "failed",
    details: { blockers: priorStages.filter((prior) => prior.state !== "completed").map((prior) => ({ stage: prior.stage, state: prior.state })) },
  };
  const expectedUpstreamEventIds: string[] = [];
  if (stageIndex === 0) {
    const missionCreated = loaded.history.events.filter((record) => record.event?.type === "construction.mission-created" &&
      record.event.data.mission_id === loaded.missionId && record.event.data.workflow === "standard");
    const prepared = loaded.history.events.filter((record) => record.event?.type === "construction.mission-workspaces-prepared" &&
      record.event.data.mission_id === loaded.missionId);
    if (missionCreated.length !== 1 || prepared.length !== 1 || !loaded.unit.created) return {
      kind: "failed",
      details: { mission_created_events: missionCreated.length, workspace_prepared_events: prepared.length, unit_created: loaded.unit.created !== undefined },
    };
    expectedUpstreamEventIds.push(missionCreated[0]!.event!.id, prepared[0]!.event!.id, loaded.unit.created.event.id);
  } else {
    for (const prior of priorStages) {
      const attempt = prior.attempts.find((candidate) => candidate.attemptId === prior.currentAttemptId && candidate.state === "completed");
      const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
      if (completions.length !== 1 || !completions[0]) return {
        kind: "failed",
        details: { stage: prior.stage, attempt_id: prior.currentAttemptId, completion_events: completions.length },
      };
      expectedUpstreamEventIds.push(completions[0].event.id);
    }
  }
  const facts = loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []);
  const authority = validateStageStartAuthority({
    stage,
    unitId: loaded.unit.unitId,
    authorityEventIds: start.event.data.authority_event_ids,
    causedBy: start.event.caused_by,
    expectedUpstreamEventIds,
    facts,
  });
  return authority.kind === "valid"
    ? { kind: "valid", eventIds: authority.eventIds }
    : { kind: "failed", details: authority.details };
};

const currentStageScope = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  stage: ConstructionStage,
  attemptId: string,
  expectedStates: readonly string[],
): { readonly kind: "valid"; readonly attempt: ConstructionHistoryFact[] } | { readonly kind: "failed"; readonly details: Readonly<Record<string, unknown>> } => {
  const projection = loaded.unit.stages.find((item) => item.stage === stage);
  const attempt = projection?.attempts.find((item) => item.attemptId === attemptId);
  if (!projection || !attempt || projection.currentAttemptId !== attemptId || !expectedStates.includes(projection.state) ||
      !expectedStates.includes(attempt.state)) {
    return { kind: "failed", details: { stage, attempt_id: attemptId, expected_states: expectedStates, state: projection?.state, attempt_state: attempt?.state, current_attempt_id: projection?.currentAttemptId } };
  }
  return { kind: "valid", attempt: [...attempt.facts] };
};

const activeActivityScopes = (unit: ConstructionUnitProjection, implementationAttemptId: string): readonly Readonly<Record<string, unknown>>[] =>
  unit.tasks.flatMap((task) => task.activities
    .filter((activity) => activity.stageAttemptId === implementationAttemptId &&
      ["running", "waiting", "pausing", "unknown"].includes(activity.state))
    .map((activity) => ({ task_id: task.taskId, activity: activity.activity, attempt_id: activity.currentAttemptId, state: activity.state })));

const currentActivityScope = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  taskId: string,
  activityName: ConstructionActivity,
  implementationAttemptId: string,
  activityAttemptId: string,
  expectedStates: readonly string[],
): { readonly kind: "valid"; readonly task: ConstructionTaskProjection; readonly activity: ConstructionActivityProjection; readonly attempt: ConstructionHistoryFact[] } | { readonly kind: "failed"; readonly details: Readonly<Record<string, unknown>> } => {
  const task = loaded.unit.tasks.find((item) => item.taskId === taskId);
  const activity = task?.activities.find((item) => item.activity === activityName);
  const attempt = activity?.attempts.find((item) => item.attemptId === activityAttemptId && item.stageAttemptId === implementationAttemptId);
  if (!task || !activity || !attempt || activity.currentAttemptId !== activityAttemptId || activity.stageAttemptId !== implementationAttemptId ||
      !expectedStates.includes(attempt.state)) {
    return { kind: "failed", details: {
      task_id: taskId,
      activity: activityName,
      implementation_attempt_id: implementationAttemptId,
      attempt_id: activityAttemptId,
      expected_states: expectedStates,
      state: attempt?.state,
      current_attempt_id: activity?.currentAttemptId,
      current_implementation_attempt_id: activity?.stageAttemptId,
    } };
  }
  return { kind: "valid", task, activity, attempt: [...attempt.facts] };
};

const taskInputs = (
  execution: TaskExecutionContext,
  unit: ConstructionUnitProjection,
  task: ConstructionTaskProjection,
  implementationAttemptId: string,
): readonly MaterialInput[] | undefined => {
  const inputs: MaterialInput[] = [...execution.task.inputs];
  const admissions = task.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
    fact.event.data.stage_attempt_id === implementationAttemptId);
  if (admissions.length !== 1 || admissions[0]?.event.type !== "construction.task-admitted") return undefined;
  const provenance = admissions[0].event.data.predecessor_provenance;
  if (!Array.isArray(provenance)) return undefined;
  for (const predecessor of provenance) {
    if (!isRecord(predecessor) || typeof predecessor.task_id !== "string" || typeof predecessor.integration_event_id !== "string") return undefined;
    const definition = execution.graph.tasks.find((candidate) => candidate.id === predecessor.task_id);
    const projection = unit.tasks.find((candidate) => candidate.taskId === predecessor.task_id);
    const integration = projection?.activities.find((candidate) => candidate.activity === "code-integration")?.accepted
      .find((fact) => fact.event.id === predecessor.integration_event_id && fact.event.type === "construction.integration-accepted");
    if (!definition || !integration) return undefined;
    for (const output of definition.outputs) inputs.push({
      reference: `task-output:${predecessor.task_id}:${output}`,
      purpose: `Accepted Integration output from predecessor ${predecessor.task_id}`,
    });
    inputs.push({ reference: predecessor.integration_event_id, purpose: `Accepted Integration provenance for predecessor ${predecessor.task_id}` });
  }
  const unique = new Map<string, MaterialInput>();
  for (const input of inputs) unique.set(`${input.reference}\0${input.purpose}`, input);
  return [...unique.values()].sort((left, right) => left.reference.localeCompare(right.reference) || left.purpose.localeCompare(right.purpose));
};

const existingIdentities = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>): Set<string> => {
  const values = new Set<string>();
  for (const record of loaded.history.events) {
    if (!record.event) continue;
    values.add(record.event.id);
    values.add(record.event.journal_id);
    for (const field of ["mission_id", "unit_id", "stage_attempt_id", "task_id", "activity_attempt_id", "revision_id", "evidence_id"] as const) {
      const value = record.event.data[field];
      if (typeof value === "string") values.add(value);
    }
  }
  return values;
};

const validEventIdentities = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, eventId: string, journalId: string): boolean => {
  const existing = existingIdentities(loaded);
  return uuidV4(eventId) && uuidV4(journalId) && eventId !== journalId && !existing.has(eventId) && !existing.has(journalId);
};

const activityRoute = (
  unit: ConstructionUnitProjection,
  task: ConstructionTaskProjection,
  activityName: ConstructionActivity,
  implementationAttemptId: string,
): { readonly kind: "valid"; readonly causes: readonly string[] } | { readonly kind: "failed"; readonly details: Readonly<Record<string, unknown>> } => {
  const previousActivity: ConstructionActivity | undefined = activityName === "code-validation"
    ? "code-generation"
    : activityName === "code-integration" ? "code-validation" : undefined;
  const causes: string[] = [];
  let previous = previousActivity ? latestActivityCompletion(task, previousActivity, implementationAttemptId) : undefined;
  let retainedPrevious = previousActivity && !previous
    ? retainedActivityFor(unit, task.taskId, previousActivity, implementationAttemptId)
    : undefined;
  if (previousActivity && !previous && !retainedPrevious) return {
    kind: "failed",
    details: { activity: activityName, required_previous_activity: previousActivity },
  };
  if (previous) causes.push(previous.event.id);
  if (retainedPrevious) causes.push(retainedPrevious.fact.event.id);
  if (activityName === "code-integration" && !latestActivityCompletion(task, "code-generation", implementationAttemptId)) {
    const retainedGeneration = retainedActivityFor(unit, task.taskId, "code-generation", implementationAttemptId);
    if (!retainedGeneration) return { kind: "failed", details: { activity: activityName, required_previous_activity: "code-generation" } };
    causes.push(retainedGeneration.fact.event.id);
  }
  return { kind: "valid", causes: [...new Set(causes)] };
};

export class ConstructionPauseResume {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly queries: ConstructionQueries,
    private readonly runtime: ConstructionPauseResumeRuntime,
  ) {}

  async pause(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<ConstructionPauseResumeResult> {
    const scope = this.pauseScope(selectors);
    if (scope.kind === "invalid") return scope.result;
    const parsed = validateConstructionPauseRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_pause_request", "The typed pause request failed validation.", { issues: parsed.issues }, "Use phase=request first; acknowledge only after stopping workers and reconciling their effects.");
    return this.withFence(selectors.unit!, project, scope.target, async (loaded, commonDir) =>
      scope.kind === "stage"
        ? this.pauseStage(loaded, selectors, scope.stage, parsed.request, commonDir)
        : this.pauseActivity(loaded, selectors, scope.activity, parsed.request, commonDir),
    );
  }

  async resume(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<ConstructionPauseResumeResult> {
    const scope = this.resumeScope(selectors);
    if (scope.kind === "invalid") return scope.result;
    const parsed = validateConstructionResumeRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_resume_request", "The typed resume request failed validation.", { issues: parsed.issues }, "Provide the exact current inputs for the selected attempt and retry without changing its identity.");
    return this.withFence(selectors.unit!, project, scope.target, async (loaded, commonDir) =>
      scope.kind === "stage"
        ? this.resumeStage(loaded, selectors, scope.stage, parsed.request, commonDir)
        : this.resumeActivity(loaded, selectors, scope.activity, parsed.request, commonDir, project),
    );
  }

  private pauseScope(selectors: ScopeSelectors):
    | { readonly kind: "stage"; readonly stage: ConstructionStage; readonly target: RevisionBarrierTarget }
    | { readonly kind: "activity"; readonly activity: ConstructionActivity; readonly target: RevisionBarrierTarget }
    | { readonly kind: "invalid"; readonly result: ConstructionPauseResumeResult } {
    if (selectors.unit && selectors.stage && CONSTRUCTION_STAGES.includes(selectors.stage) && uuidV4(selectors.attempt) &&
        !selectors.task && !selectors.activity && !selectors.implementationAttempt && !selectors.mission) {
      return { kind: "stage", stage: selectors.stage, target: { unitId: selectors.unit, stage: selectors.stage, stageAttemptId: selectors.attempt } };
    }
    if (selectors.unit && selectors.task && selectors.activity && CONSTRUCTION_ACTIVITIES.includes(selectors.activity) &&
        uuidV4(selectors.implementationAttempt) && uuidV4(selectors.attempt) && !selectors.stage && !selectors.mission) {
      return { kind: "activity", activity: selectors.activity, target: {
        unitId: selectors.unit,
        stage: "implementation",
        stageAttemptId: selectors.implementationAttempt,
        taskId: selectors.task,
        activity: selectors.activity,
        activityAttemptId: selectors.attempt,
      } };
    }
    return { kind: "invalid", result: failure("invalid_pause_scope", "Pause requires the exact selectors for one existing stage or Activity attempt.", { selectors }) };
  }

  private resumeScope(selectors: ScopeSelectors):
    | { readonly kind: "stage"; readonly stage: ConstructionStage; readonly target: RevisionBarrierTarget }
    | { readonly kind: "activity"; readonly activity: ConstructionActivity; readonly target: RevisionBarrierTarget }
    | { readonly kind: "invalid"; readonly result: ConstructionPauseResumeResult } {
    const scope = this.pauseScope(selectors);
    return scope.kind === "invalid"
      ? { kind: "invalid", result: failure("invalid_resume_scope", "Resume requires the exact selectors for one existing stage or Activity attempt.", { selectors }) }
      : scope;
  }

  private async withFence(
    unitId: string,
    project: string | undefined,
    target: RevisionBarrierTarget,
    operation: (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, commonDirectory: string) => Promise<ConstructionPauseResumeResult>,
  ): Promise<ConstructionPauseResumeResult> {
    const initial = await this.contexts.readUnit(unitId, project);
    if (initial.kind === "failed") return propagate(initial);
    const commonDir = await commonDirectory(this.runtime, initial.root);
    if (!commonDir) return failure("pause_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: initial.root });
    const guarded = await runWithConstructionRevisionFence({
      workspace: this.runtime.workspace,
      commonDirectory: commonDir,
      missionId: initial.missionId,
      unitId,
      expectedRoot: initial.root,
      project,
      readUnit: (selectedUnit, selectedProject) => this.contexts.readUnit(selectedUnit, selectedProject),
      target,
      failure,
      operation: (latest) => operation(latest, commonDir),
    });
    return guarded.kind === "failed"
      ? failure(guarded.code, guarded.message, guarded.details, guarded.recovery)
      : guarded.value;
  }

  private async pauseStage(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    selectors: ScopeSelectors,
    stage: ConstructionStage,
    request: ConstructionPausePhase,
    commonDir: string,
  ): Promise<ConstructionPauseResumeResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Construction pause requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    const state = currentStageScope(loaded, stage, selectors.attempt!, request.phase === "request" ? ["running", "waiting"] : ["pausing"]);
    if (state.kind === "failed") return failure("stage_pause_not_current", "Pause requires the exact active stage attempt and phase.", state.details);
    const start = stageStartFact(state.attempt, selectors.attempt!);
    if (!start) return failure("stage_pause_start_missing", "The exact stage attempt has no validated start or resume event.", { attempt_id: selectors.attempt });
    if (stage === "implementation") {
      const activeActivities = activeActivityScopes(loaded.unit, selectors.attempt!);
      if (activeActivities.length > 0) return failure(
        "stage_pause_activities_active",
        "Pause each active child Activity while the Implementation parent is running before pausing the stage.",
        { stage_attempt_id: selectors.attempt, active_activities: activeActivities },
        "Pause and acknowledge each affected Activity, then request and acknowledge the Implementation stage pause.",
      );
    }
    if (request.phase === "acknowledge") {
      const requests = state.attempt.filter((fact) => fact.event.type === "construction.stage-pause-requested" &&
        fact.event.data.stage_attempt_id === selectors.attempt && fact.event.caused_by.includes(start.event.id));
      if (requests.length !== 1 || !requests[0] || !requests[0].event.caused_by.includes(start.event.id)) {
        return failure("stage_pause_request_ambiguous", "Pause acknowledgment requires one current pause request caused by the active stage start.", {
          attempt_id: selectors.attempt,
          pause_request_event_ids: requests.map((fact) => fact.event.id),
        });
      }
      if (stage === "implementation") {
        const lock = await this.requireIntegrationLockClear(loaded, commonDir);
        if (lock) return lock;
      }
      return this.appendEvent(loaded, {
        type: "construction.stage-paused",
        caused_by: [requests[0].event.id],
        data: {
          mission_id: loaded.missionId,
          unit_id: loaded.unit.unitId,
          stage,
          stage_attempt_id: selectors.attempt as StageAttemptId,
          reason: persistedPauseReason(request),
        },
        successData: { stage, attempt_id: selectors.attempt, pause_state: "paused" },
      });
    }
    return this.appendEvent(loaded, {
      type: "construction.stage-pause-requested",
      caused_by: [start.event.id],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage,
        stage_attempt_id: selectors.attempt as StageAttemptId,
        reason: request.reason,
      },
      successData: { stage, attempt_id: selectors.attempt, pause_state: "pausing" },
    });
  }

  private async resumeStage(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    selectors: ScopeSelectors,
    stage: ConstructionStage,
    request: ConstructionResumeRequest,
    commonDir: string,
  ): Promise<ConstructionPauseResumeResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Construction resume requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    const state = currentStageScope(loaded, stage, selectors.attempt!, ["paused"]);
    if (state.kind === "failed") return failure("stage_attempt_not_resumable", "Resume requires the exact paused, unended current stage attempt.", state.details);
    const start = stageStartFact(state.attempt, selectors.attempt!);
    const acknowledgments = state.attempt.filter((fact) => fact.event.type === "construction.stage-paused" &&
      fact.event.data.stage_attempt_id === selectors.attempt);
    const requests = state.attempt.filter((fact) => fact.event.type === "construction.stage-pause-requested" &&
      fact.event.data.stage_attempt_id === selectors.attempt);
    const pause = acknowledgments.at(-1);
    const pauseRequest = requests.at(-1);
    if (!start || !pause || !pauseRequest || !pause.event.caused_by.includes(pauseRequest.event.id) ||
        !pauseRequest.event.caused_by.includes(start.event.id) || !sameInputs(start.event.data.inputs, request.inputs)) {
      return failure("stage_resume_inputs_or_pause_stale", "Resume requires the current acknowledged pause and the exact inputs retained by this attempt.", {
        attempt_id: selectors.attempt,
        pause_request_event_id: pauseRequest?.event.id,
        pause_event_id: pause?.event.id,
        start_event_id: start?.event.id,
      });
    }
    if (stage === "implementation") {
      const activeActivities = activeActivityScopes(loaded.unit, selectors.attempt!);
      if (activeActivities.length > 0) return failure(
        "stage_resume_activities_active",
        "The paused Implementation parent has child Activities that are not safely paused or terminal.",
        { stage_attempt_id: selectors.attempt, active_activities: activeActivities },
        "Reconcile the affected Activity attempts before resuming the Implementation stage.",
      );
    }
    const authority = currentStageAuthority(loaded, stage, start);
    if (authority.kind === "failed") return failure("stage_resume_authority_changed", "The selected stage's current Standard authority no longer matches this attempt.", authority.details, "Resolve current upstream authority or revision history before resuming the same attempt.");
    if (stage === "implementation") {
      const lock = await this.requireIntegrationLockClear(loaded, commonDir);
      if (lock) return lock;
    }
    const captured = await captureStageCheckpoints(this.runtime, loaded, commonDir);
    if (captured.kind === "failed") return failure(captured.code, captured.message, captured.details);
    if (checkpointKey(captured.checkpoints) === "invalid" || checkpointKey(start.event.data.checkpoints) === "invalid" ||
        checkpointKey(captured.checkpoints) !== checkpointKey(start.event.data.checkpoints)) return failure(
      "stage_resume_material_drift",
      "The selected stage's captured repository material differs from its latest start event.",
      { started_checkpoints: start.event.data.checkpoints, current_checkpoints: captured.checkpoints },
      "Reconcile repository changes through the authorized revision or return path before resuming the same attempt.",
    );
    return this.appendEvent(loaded, {
      type: "construction.stage-resumed",
      caused_by: [...new Set([...authority.eventIds, pause.event.id])],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage,
        stage_attempt_id: selectors.attempt as StageAttemptId,
        inputs: request.inputs,
        checkpoints: captured.checkpoints,
        authority_event_ids: authority.eventIds as EventId[],
      },
      successData: { stage, attempt_id: selectors.attempt, checkpoints: captured.checkpoints, worker_dispatched: false },
    });
  }

  private async pauseActivity(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    selectors: ScopeSelectors,
    activityName: ConstructionActivity,
    request: ConstructionPausePhase,
    commonDir: string,
  ): Promise<ConstructionPauseResumeResult> {
    const parent = currentStageScope(loaded, "implementation", selectors.implementationAttempt!, ["running", "waiting"]);
    if (parent.kind === "failed") return failure("activity_parent_not_current", "Activity pause requires its current running Implementation attempt.", parent.details);
    const scope = currentActivityScope(loaded, selectors.task!, activityName, selectors.implementationAttempt!, selectors.attempt!,
      request.phase === "request" ? ["running", "waiting"] : ["pausing"]);
    if (scope.kind === "failed") return failure("activity_pause_not_current", "Pause requires the exact active Activity attempt and phase.", scope.details);
    const start = activityStartFact({ facts: scope.attempt });
    if (!start) return failure("activity_pause_start_missing", "The exact Activity attempt has no validated start or resume event.", { attempt_id: selectors.attempt });
    const data = {
      mission_id: loaded.missionId,
      unit_id: loaded.unit.unitId,
      stage: "implementation" as const,
      stage_attempt_id: selectors.implementationAttempt as StageAttemptId,
      task_id: selectors.task!,
      activity: activityName,
      activity_attempt_id: selectors.attempt as ActivityAttemptId,
      reason: persistedPauseReason(request),
    };
    if (request.phase === "acknowledge") {
      const requests = scope.attempt.filter((fact) => fact.event.type === "construction.activity-pause-requested" &&
        fact.event.data.activity_attempt_id === selectors.attempt && fact.event.caused_by.includes(start.event.id));
      if (requests.length !== 1 || !requests[0] || !requests[0].event.caused_by.includes(start.event.id)) return failure(
        "activity_pause_request_ambiguous",
        "Pause acknowledgment requires one current pause request caused by the active Activity start.",
        { attempt_id: selectors.attempt, pause_request_event_ids: requests.map((fact) => fact.event.id) },
      );
      if (activityName === "code-integration") {
        const lock = await this.requireIntegrationLockClear(loaded, commonDir);
        if (lock) return lock;
      }
      return this.appendEvent(loaded, {
        type: "construction.activity-paused",
        caused_by: [requests[0].event.id],
        data,
        successData: { activity: activityName, task_id: selectors.task, implementation_attempt_id: selectors.implementationAttempt, attempt_id: selectors.attempt, pause_state: "paused" },
      });
    }
    return this.appendEvent(loaded, {
      type: "construction.activity-pause-requested",
      caused_by: [start.event.id],
      data,
      successData: { activity: activityName, task_id: selectors.task, implementation_attempt_id: selectors.implementationAttempt, attempt_id: selectors.attempt, pause_state: "pausing" },
    });
  }

  private async resumeActivity(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    selectors: ScopeSelectors,
    activityName: ConstructionActivity,
    request: ConstructionResumeRequest,
    commonDir: string,
    project?: string,
  ): Promise<ConstructionPauseResumeResult> {
    const parentState = currentStageScope(loaded, "implementation", selectors.implementationAttempt!, ["running"]);
    if (parentState.kind === "failed") return failure("activity_parent_not_current", "Activity resume requires its current running Implementation attempt.", parentState.details);
    const scope = currentActivityScope(loaded, selectors.task!, activityName, selectors.implementationAttempt!, selectors.attempt!, ["paused"]);
    if (scope.kind === "failed") return failure("activity_attempt_not_resumable", "Resume requires the exact paused, unended current Activity attempt.", scope.details);
    const parentStart = stageStartFact(parentState.attempt, selectors.implementationAttempt!);
    const start = activityStartFact({ facts: scope.attempt });
    const pauseRequest = scope.attempt.filter((fact) => fact.event.type === "construction.activity-pause-requested").at(-1);
    const pause = scope.attempt.filter((fact) => fact.event.type === "construction.activity-paused").at(-1);
    if (!parentStart || !start || !pauseRequest || !pause || !pause.event.caused_by.includes(pauseRequest.event.id) ||
        !pauseRequest.event.caused_by.includes(start.event.id)) return failure(
      "activity_resume_pause_stale",
      "Resume requires the current acknowledged pause for the selected Activity attempt.",
      { attempt_id: selectors.attempt, pause_request_event_id: pauseRequest?.event.id, pause_event_id: pause?.event.id },
    );
    const executionResult = await this.queries.taskExecutionContext(selectors.unit!, selectors.task!, project);
    if (executionResult.kind === "failed") return failure(executionResult.code, executionResult.message, executionResult.details, executionResult.recovery);
    const execution = executionResult;
    if (scope.task.state === "complete" || scope.task.state === "unknown" ||
        retainedActivityFor(loaded.unit, scope.task.taskId, activityName, selectors.implementationAttempt!)) return failure(
      "activity_resume_route_changed",
      "The selected task or Activity is complete, retained, or no longer executable in this Implementation attempt.",
      { task_id: scope.task.taskId, task_state: scope.task.state, activity: activityName },
    );
    const planningGraph = currentPlanningGraphRef(loaded.unit);
    const admissionFacts = scope.task.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
      fact.event.data.stage_attempt_id === selectors.implementationAttempt);
    const admission = admissionFacts.length === 1 ? admissionFacts[0] : undefined;
    if (!admission || admission.event.type !== "construction.task-admitted" || scope.task.admission?.event.id !== admission.event.id ||
        planningGraph?.graph_id !== execution.graphRef.graph_id || planningGraph.content_version !== execution.graphRef.content_version ||
        !sameValue(admission.event.data.graph_ref, execution.graphRef) ||
        !sameValue(admission.event.data.task_definition_ref, execution.taskDefinitionRef) ||
        !sameValue(admission.event.data.task_contract, admittedTaskContract(execution.task, execution.planSource))) {
      return failure("activity_resume_material_drift", "The current task graph, definition, plan contract, or admission differs from the selected Activity's original material.", {
        task_id: selectors.task,
        admission_event_id: admission?.event.id,
        current_graph_ref: execution.graphRef,
        admitted_graph_ref: admission?.event.data.graph_ref,
        current_task_definition_ref: execution.taskDefinitionRef,
        admitted_task_definition_ref: admission?.event.data.task_definition_ref,
      }, "Reconcile task-material drift through the authorized revision or return path; do not resume stale work.");
    }
    const route = activityRoute(loaded.unit, scope.task, activityName, selectors.implementationAttempt!);
    if (route.kind === "failed") return failure("activity_resume_route_changed", "The fixed Activity route no longer has its current predecessor evidence.", route.details);
    const inputs = taskInputs(execution, loaded.unit, scope.task, selectors.implementationAttempt!);
    if (!inputs || !sameInputs(request.inputs, inputs) || !sameInputs(start.event.data.inputs, inputs)) return failure(
      "activity_resume_inputs_changed",
      "Resume requires the exact current inputs retained by the selected Activity attempt.",
      { supplied_inputs: request.inputs, current_inputs: inputs, started_inputs: start.event.data.inputs },
      "Resolve changed inputs through the authorized revision or return path; do not resume stale work.",
    );
    if (activityName === "code-integration") {
      const lock = await this.requireIntegrationLockClear(loaded, commonDir);
      if (lock) return lock;
    }
    const captured = await captureStageCheckpoints(this.runtime, loaded, commonDir);
    if (captured.kind === "failed") return failure(captured.code, captured.message, captured.details);
    if (checkpointKey(captured.checkpoints) === "invalid" || checkpointKey(start.event.data.checkpoints) === "invalid" ||
        checkpointKey(captured.checkpoints) !== checkpointKey(start.event.data.checkpoints)) return failure(
      "activity_resume_material_drift",
      "The current repository checkpoints differ from the selected Activity attempt's latest start material.",
      { started_checkpoints: start.event.data.checkpoints, current_checkpoints: captured.checkpoints },
      "Reconcile repository changes through the authorized revision or return path; do not resume stale work.",
    );
    const causes = [parentStart.event.id, admission.event.id, ...route.causes, pause.event.id];
    return this.appendEvent(loaded, {
      type: "construction.activity-resumed",
      caused_by: [...new Set(causes)],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage: "implementation",
        stage_attempt_id: selectors.implementationAttempt as StageAttemptId,
        task_id: selectors.task!,
        activity: activityName,
        activity_attempt_id: selectors.attempt as ActivityAttemptId,
        inputs,
        checkpoints: captured.checkpoints,
      },
      successData: {
        activity: activityName,
        task_id: selectors.task,
        implementation_attempt_id: selectors.implementationAttempt,
        attempt_id: selectors.attempt,
        inputs,
        checkpoints: captured.checkpoints,
        worker_dispatched: false,
      },
    });
  }

  private async requireIntegrationLockClear(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    commonDir: string,
  ): Promise<ConstructionPauseResumeResult | undefined> {
    const lock = await this.runtime.inspectIntegrationLock(commonDir, loaded.missionId, loaded.unit.unitId);
    if (lock.kind === "clear") return undefined;
    if (lock.kind === "held") return failure("pause_integration_lock_held", "The affected unit Integration lock is still held.", {
      task_id: lock.taskId,
      implementation_attempt_id: lock.implementationAttemptId,
      activity_attempt_id: lock.activityAttemptId,
      resource_key: lock.resourceKey,
      lock_path: lock.lockPath,
    }, "Stop the affected worker, reconcile its candidate and effects, and release the Integration lock before acknowledgment or resume.");
    return failure(lock.code, "The affected unit Integration lock state is unknown; pause acknowledgment and resume fail closed.", lock.details, lock.recovery);
  }

  private async appendEvent(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    input: {
      readonly type: "construction.stage-pause-requested" | "construction.stage-paused" | "construction.stage-resumed" |
        "construction.activity-pause-requested" | "construction.activity-paused" | "construction.activity-resumed";
      readonly caused_by: readonly string[];
      readonly data: Readonly<Record<string, unknown>>;
      readonly successData: Readonly<Record<string, unknown>>;
    },
  ): Promise<ConstructionPauseResumeResult> {
    let eventId: string;
    let journalId: string;
    try {
      eventId = this.runtime.identities.next();
      journalId = this.runtime.identities.next();
    } catch (error) {
      return failure("pause_resume_identity_failed", "Kepler could not allocate Construction transition identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!validEventIdentities(loaded, eventId, journalId)) return failure("pause_resume_identity_conflict", "The selected pause/resume event identities are invalid, reused, or already present in history.");
    const candidate = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: input.type,
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set(input.caused_by)] as EventId[],
      data: input.data,
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") return failure("pause_resume_event_invalid", "The typed Construction pause/resume event failed validation.", {
      type: input.type,
      issues: validation.status === "invalid" ? validation.issues : [validation.reason],
    });
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return failure(
      "pause_resume_journal_identity_conflict",
      "The selected Construction journal identity already has a filesystem entry.",
      { journal_id: journalId },
    );
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event);
    } catch (error) {
      return failure("pause_resume_append_failed", "Kepler could not durably append the Construction pause/resume event.", {
        event_id: eventId,
        journal_id: journalId,
        message: error instanceof Error ? error.message : String(error),
      }, "Inspect the exact history for an appended or uncertain event before retrying; preserve every effect and record.");
    }
    return { kind: "success", data: { id: eventId, journal_id: journalId, ...input.successData } };
  }
}

export const createNodeConstructionPauseResumeRuntime = (
  producer: { readonly name: string; readonly version: string },
): ConstructionPauseResumeRuntime => {
  const runtime = createNodeStageStartRuntime(producer);
  return {
    ...runtime,
    inspectIntegrationLock: (commonDir, missionId, unitId) =>
      inspectConstructionIntegrationLock(runtime, commonDir, missionId, unitId),
  };
};
