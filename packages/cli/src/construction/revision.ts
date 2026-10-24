import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { EventJournal } from "../history/journal.js";
import { acquireConstructionUnitControl } from "./unit-control.js";
import { inspectConstructionIntegrationLock } from "./integration-execution.js";
import { pendingRevisionBarrierFor } from "./revision-state.js";
import {
  CONSTRUCTION_ACTIVITIES,
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_REVISION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  CONSTRUCTION_STAGES,
  validateConstructionEvent,
  isRevisionAffectedScopes,
  type ActivityAttemptId,
  type ConstructionActivity,
  type ConstructionEventRecord,
  type ConstructionStage,
  type MaterialInput,
  type MissionId,
  type RevisionAffectedScope,
  type RevisionId,
  type StageAttemptId,
  type TaskId,
  type UnitId,
} from "./events.js";
import type { StageStartRuntime } from "./stage-start.js";
import type {
  ConstructionActivityProjection,
  ConstructionUnitProjection,
} from "./projection.js";

export interface RevisionRequest {
  readonly orchestrator_decision: string;
  readonly reason: string;
  readonly inputs: readonly MaterialInput[];
}

export interface RevisionRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

export type RevisionRequestValidation =
  | { readonly kind: "valid"; readonly request: RevisionRequest }
  | { readonly kind: "invalid"; readonly issues: readonly RevisionRequestIssue[] };

export type RevisionBoundary =
  | {
      readonly kind: "stage";
      readonly unitId: string;
      readonly stage: ConstructionStage;
      readonly attemptId: string;
    }
  | {
      readonly kind: "activity";
      readonly unitId: string;
      readonly taskId: string;
      readonly activity: ConstructionActivity;
      readonly implementationAttemptId: string;
      readonly attemptId: string;
    };

export type RevisionBoundaryValidation =
  | { readonly kind: "valid"; readonly boundary: RevisionBoundary }
  | { readonly kind: "invalid"; readonly details: Readonly<Record<string, unknown>> };

export interface RevisionAffectedAttempt {
  readonly stage: ConstructionStage;
  readonly attemptId: string;
}

export interface RevisionAffectedActivity {
  readonly taskId: string;
  readonly activity: ConstructionActivity;
  readonly implementationAttemptId: string;
  readonly attemptId?: string;
}

export type RevisionCascade =
  | {
      readonly kind: "stage";
      readonly stages: readonly ConstructionStage[];
      readonly attempts: readonly RevisionAffectedAttempt[];
    }
  | {
      readonly kind: "activity";
      readonly activities: readonly ConstructionActivity[];
      readonly attempts: readonly RevisionAffectedActivity[];
    };

export type RevisionCascadeResult =
  | { readonly kind: "valid"; readonly cascade: RevisionCascade }
  | { readonly kind: "invalid"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const active = (state: string): boolean => ["running", "pausing", "paused", "waiting"].includes(state);
const activeOrCompleted = (state: string): boolean => active(state) || state === "completed";

export const validateRevisionRequest = (value: unknown): RevisionRequestValidation => {
  const issues: RevisionRequestIssue[] = [];
  const issue = (pointer: string, message: string) => issues.push({ pointer, message });
  if (!isRecord(value)) {
    return { kind: "invalid", issues: [{ pointer: "", message: "Expected one revision request object." }] };
  }
  for (const key of Object.keys(value)) {
    if (!["orchestrator_decision", "reason", "inputs"].includes(key)) {
      issue(`/${key}`, "Unknown revision request field.");
    }
  }
  if (!nonEmpty(value.orchestrator_decision)) {
    issue("/orchestrator_decision", "Record the orchestrator's decision.");
  }
  if (!nonEmpty(value.reason)) issue("/reason", "Provide a non-empty reason for the revision.");
  const inputs: MaterialInput[] = [];
  if (!Array.isArray(value.inputs) || value.inputs.length === 0) {
    issue("/inputs", "Select at least one supporting input.");
  } else {
    value.inputs.forEach((input, index) => {
      const pointer = `/inputs/${index}`;
      if (!isRecord(input) || !onlyKeys(input, ["reference", "purpose"]) ||
          !nonEmpty(input.reference) || !nonEmpty(input.purpose)) {
        issue(pointer, "Each supporting input requires only a non-empty reference and purpose.");
      } else {
        inputs.push({ reference: input.reference, purpose: input.purpose });
      }
    });
  }
  if (issues.length > 0) return { kind: "invalid", issues };
  return {
    kind: "valid",
    request: {
      orchestrator_decision: value.orchestrator_decision as string,
      reason: value.reason as string,
      inputs,
    },
  };
};

export const validateRevisionBoundary = (selectors: ScopeSelectors): RevisionBoundaryValidation => {
  if (selectors.unit && selectors.stage && selectors.attempt &&
      !selectors.task && !selectors.activity && !selectors.implementationAttempt && !selectors.mission) {
    return {
      kind: "valid",
      boundary: {
        kind: "stage",
        unitId: selectors.unit,
        stage: selectors.stage,
        attemptId: selectors.attempt,
      },
    };
  }
  if (selectors.unit && selectors.task && selectors.activity && selectors.implementationAttempt && selectors.attempt &&
      !selectors.stage && !selectors.mission && selectors.activity !== "code-integration") {
    return {
      kind: "valid",
      boundary: {
        kind: "activity",
        unitId: selectors.unit,
        taskId: selectors.task,
        activity: selectors.activity,
        implementationAttemptId: selectors.implementationAttempt,
        attemptId: selectors.attempt,
      },
    };
  }
  return {
    kind: "invalid",
    details: {
      selectors,
      accepted: [
        ["unit", "stage", "attempt"],
        ["unit", "task", "activity", "implementationAttempt", "attempt"],
      ],
    },
  };
};

const activityAttemptForParent = (
  activity: ConstructionActivityProjection | undefined,
  implementationAttemptId: string,
) => {
  const attemptId = activity?.currentAttemptId;
  return attemptId
    ? activity.attempts.find((attempt) => attempt.attemptId === attemptId &&
      attempt.stageAttemptId === implementationAttemptId && activeOrCompleted(attempt.state))
    : undefined;
};

export const deriveRevisionCascade = (
  unit: ConstructionUnitProjection,
  boundary: RevisionBoundary,
): RevisionCascadeResult => {
  if (unit.unitId !== boundary.unitId || unit.workflow !== "standard" || unit.blocked) {
    return {
      kind: "invalid",
      code: "revision_history_blocked",
      message: "Revision requires the selected unblocked Standard Unit of Work.",
      details: {
        unit_id: boundary.unitId,
        projected_unit_id: unit.unitId,
        workflow: unit.workflow,
        history_issues: unit.historyIssues,
        projection_issues: unit.projectionIssues,
      },
    };
  }
  if (boundary.kind === "stage") {
    const index = CONSTRUCTION_STAGES.indexOf(boundary.stage);
    const selected = unit.stages.find((stage) => stage.stage === boundary.stage);
    if (!selected || selected.currentAttemptId !== boundary.attemptId ||
        !selected.attempts.some((attempt) => attempt.attemptId === boundary.attemptId && activeOrCompleted(attempt.state))) {
      return {
        kind: "invalid",
        code: "revision_attempt_not_current",
        message: "Stage revision requires the exact current stage attempt.",
        details: {
          stage: boundary.stage,
          attempt_id: boundary.attemptId,
          current_attempt_id: selected?.currentAttemptId,
          state: selected?.state,
        },
      };
    }
    const stages = CONSTRUCTION_STAGES.slice(index);
    const attempts = stages.flatMap((stageName) => {
      const stage = unit.stages.find((candidate) => candidate.stage === stageName);
      const attemptId = stage?.currentAttemptId;
      return attemptId && stage?.attempts.some((attempt) => attempt.attemptId === attemptId && activeOrCompleted(attempt.state))
        ? [{ stage: stageName, attemptId }]
        : [];
    });
    return { kind: "valid", cascade: { kind: "stage", stages, attempts } };
  }

  const implementation = unit.stages.find((stage) => stage.stage === "implementation");
  const task = unit.tasks.find((candidate) => candidate.taskId === boundary.taskId);
  const activity = task?.activities.find((candidate) => candidate.activity === boundary.activity);
  const selectedAttempt = activity?.attempts.find((attempt) => attempt.attemptId === boundary.attemptId);
  if (implementation?.currentAttemptId !== boundary.implementationAttemptId ||
      !active(implementation.state) || !task || task.stageAttemptId !== boundary.implementationAttemptId ||
      !activity || activity.currentAttemptId !== boundary.attemptId ||
      selectedAttempt?.stageAttemptId !== boundary.implementationAttemptId || !activeOrCompleted(selectedAttempt.state)) {
    return {
      kind: "invalid",
      code: "revision_activity_attempt_not_current",
      message: "Activity revision requires the exact current Activity attempt under the active Implementation attempt.",
      details: {
        task_id: boundary.taskId,
        activity: boundary.activity,
        implementation_attempt_id: boundary.implementationAttemptId,
        attempt_id: boundary.attemptId,
        current_implementation_attempt_id: implementation?.currentAttemptId,
        implementation_state: implementation?.state,
        task_implementation_attempt_id: task?.stageAttemptId,
        current_activity_attempt_id: activity?.currentAttemptId,
        activity_attempt_stage_id: selectedAttempt?.stageAttemptId,
      },
    };
  }
  const dependencyIdsByTask = new Map<string, readonly string[]>();
  for (const candidate of unit.tasks) {
    const admissions = candidate.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
      fact.event.data.stage_attempt_id === boundary.implementationAttemptId);
    if (admissions.length === 0) continue;
    const admission = admissions[0];
    const contract = admission?.event.type === "construction.task-admitted" && isRecord(admission.event.data.task_contract)
      ? admission.event.data.task_contract
      : undefined;
    const dependencies = contract?.dependency_task_ids;
    const provenance = admission?.event.type === "construction.task-admitted"
      ? admission.event.data.predecessor_provenance
      : undefined;
    const provenanceTaskIds = Array.isArray(provenance) && provenance.every((item) => isRecord(item) &&
      typeof item.task_id === "string" && item.task_id.length > 0 &&
      typeof item.integration_event_id === "string" && item.integration_event_id.length > 0)
      ? provenance.map((item) => (item as Record<string, unknown>).task_id as string)
      : undefined;
    if (admissions.length !== 1 || !Array.isArray(dependencies) ||
        !dependencies.every((dependency): dependency is string => typeof dependency === "string" && dependency.length > 0) ||
        new Set(dependencies).size !== dependencies.length || dependencies.includes(candidate.taskId) ||
        !provenanceTaskIds || new Set(provenanceTaskIds).size !== provenanceTaskIds.length ||
        [...dependencies].sort().join("\0") !== [...provenanceTaskIds].sort().join("\0")) {
      return {
        kind: "invalid",
        code: "revision_dependency_graph_unknown",
        message: "Revision cannot derive dependent task scopes from the current admitted task contracts.",
        details: { task_id: candidate.taskId, implementation_attempt_id: boundary.implementationAttemptId },
      };
    }
    if (dependencies.some((dependency) => !unit.tasks.some((item) => item.taskId === dependency))) {
      return {
        kind: "invalid",
        code: "revision_dependency_graph_incomplete",
        message: "An admitted task references a predecessor missing from the current Construction projection.",
        details: { task_id: candidate.taskId, dependency_task_ids: dependencies },
      };
    }
    dependencyIdsByTask.set(candidate.taskId, dependencies);
  }
  const affectedTaskIds = new Set<string>([boundary.taskId]);
  const pendingTaskIds = [boundary.taskId];
  while (pendingTaskIds.length > 0) {
    const predecessorId = pendingTaskIds.shift();
    if (!predecessorId) continue;
    for (const [candidateId, dependencies] of dependencyIdsByTask) {
      if (!dependencies.includes(predecessorId) || affectedTaskIds.has(candidateId)) continue;
      affectedTaskIds.add(candidateId);
      pendingTaskIds.push(candidateId);
    }
  }
  const attempts = [...affectedTaskIds].flatMap((taskId) => {
    const affectedTask = unit.tasks.find((candidate) => candidate.taskId === taskId);
    if (!affectedTask || (taskId !== boundary.taskId && !dependencyIdsByTask.has(taskId))) return [];
    const firstActivityIndex = taskId === boundary.taskId ? CONSTRUCTION_ACTIVITIES.indexOf(boundary.activity) : 0;
    return CONSTRUCTION_ACTIVITIES.slice(firstActivityIndex).map((activityName) => {
      const projection = affectedTask.activities.find((candidate) => candidate.activity === activityName);
      const current = activityAttemptForParent(projection, boundary.implementationAttemptId);
      return {
        taskId,
        activity: activityName,
        implementationAttemptId: boundary.implementationAttemptId,
        ...(current ? { attemptId: current.attemptId } : {}),
      };
    });
  });
  const activities = [...new Set(attempts.map((attempt) => attempt.activity))];
  return { kind: "valid", cascade: { kind: "activity", activities, attempts } };
};

export type RevisionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

export type RevisionRuntime = StageStartRuntime;

type RevisionTransitionApplyResult =
  | { readonly kind: "applied"; readonly eventIds: readonly string[] }
  | { readonly kind: "failed"; readonly result: Extract<RevisionResult, { readonly kind: "failed" }> };

const revisionFailure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the revision condition without changing recorded history, then retry.",
): Extract<RevisionResult, { readonly kind: "failed" }> => ({ kind: "failed", data: { code, message, details, recovery } });

const propagateRevisionReadFailure = (result: Extract<AuditHistoryReadResult, { readonly kind: "failed" }>): RevisionResult =>
  revisionFailure(result.code, result.message, result.details, result.recovery);

const revisionCommonDirectory = async (runtime: RevisionRuntime, root: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return await runtime.workspace.fileSystem.realpath(Path.resolve(root, result.stdout.trim()));
  } catch {
    return undefined;
  }
};

const revisionIdentitiesIn = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>): Set<string> => {
  const identities = new Set<string>();
  for (const record of loaded.history.events) {
    const event = record.event;
    if (!event) continue;
    identities.add(event.id);
    identities.add(event.journal_id);
    for (const field of ["mission_id", "unit_id", "stage_attempt_id", "task_id", "activity_attempt_id", "revision_id", "evidence_id"] as const) {
      const identity = event.data[field];
      if (typeof identity === "string") identities.add(identity);
    }
  }
  for (const stage of loaded.unit.stages) {
    for (const attempt of stage.attempts) identities.add(attempt.attemptId);
  }
  for (const task of loaded.unit.tasks) {
    identities.add(task.taskId);
    for (const activity of task.activities) {
      for (const attempt of activity.attempts) identities.add(attempt.attemptId);
    }
  }
  return identities;
};

const validRevisionIdentities = (values: readonly string[], existing: ReadonlySet<string>): boolean =>
  values.every((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) &&
  new Set(values).size === values.length && values.every((value) => !existing.has(value));

const revisionBoundaryFact = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  boundary: RevisionBoundary,
) => {
  if (boundary.kind === "stage") {
    return loaded.unit.stages.find((stage) => stage.stage === boundary.stage)?.attempts
      .find((attempt) => attempt.attemptId === boundary.attemptId)?.facts.at(-1);
  }
  return loaded.unit.tasks.find((task) => task.taskId === boundary.taskId)?.activities
    .find((activity) => activity.activity === boundary.activity)?.attempts
    .find((attempt) => attempt.attemptId === boundary.attemptId)?.facts.at(-1);
};

const affectedScopes = (cascade: RevisionCascade): readonly RevisionAffectedScope[] => {
  if (cascade.kind === "stage") {
    return cascade.stages.map((stage) => {
      const attempt = cascade.attempts.find((candidate) => candidate.stage === stage);
      return attempt
        ? { kind: "stage", stage, prior_attempt: "present", stage_attempt_id: attempt.attemptId as StageAttemptId }
        : { kind: "stage", stage, prior_attempt: "none" };
    });
  }
  return cascade.attempts.map((attempt) => attempt.attemptId
    ? {
      kind: "activity",
      task_id: attempt.taskId as TaskId,
      stage_attempt_id: attempt.implementationAttemptId as StageAttemptId,
      activity: attempt.activity,
      prior_attempt: "present" as const,
      activity_attempt_id: attempt.attemptId as ActivityAttemptId,
    }
    : {
      kind: "activity",
      task_id: attempt.taskId as TaskId,
      stage_attempt_id: attempt.implementationAttemptId as StageAttemptId,
      activity: attempt.activity,
      prior_attempt: "none" as const,
    });
};

const boundaryEventData = (
  boundary: RevisionBoundary,
  missionId: string,
  unitId: string,
  revisionId: string,
  request: RevisionRequest,
  scopes: readonly RevisionAffectedScope[],
) => ({
  mission_id: missionId as MissionId,
  unit_id: unitId as UnitId,
  revision_id: revisionId as RevisionId,
  orchestrator_decision: request.orchestrator_decision,
  reason: request.reason,
  inputs: request.inputs,
  affected_scopes: scopes,
  stage: boundary.kind === "stage" ? boundary.stage : "implementation",
  stage_attempt_id: boundary.kind === "stage"
    ? boundary.attemptId as StageAttemptId
    : boundary.implementationAttemptId as StageAttemptId,
  ...(boundary.kind === "activity" ? {
    task_id: boundary.taskId as TaskId,
    activity: boundary.activity,
    activity_attempt_id: boundary.attemptId as ActivityAttemptId,
  } : {}),
});

const boundaryInteractionData = (
  boundary: RevisionBoundary,
  missionId: string,
  unitId: string,
  request: RevisionRequest,
) => ({
  mission_id: missionId as MissionId,
  unit_id: unitId as UnitId,
  stage: boundary.kind === "stage" ? boundary.stage : "implementation",
  stage_attempt_id: boundary.kind === "stage"
    ? boundary.attemptId as StageAttemptId
    : boundary.implementationAttemptId as StageAttemptId,
  ...(boundary.kind === "activity" ? {
    task_id: boundary.taskId as TaskId,
    activity: boundary.activity,
    activity_attempt_id: boundary.attemptId as ActivityAttemptId,
  } : {}),
  participants: ["orchestrator"],
  content: JSON.stringify({
    orchestrator_decision: request.orchestrator_decision,
    reason: request.reason,
    inputs: request.inputs,
  }),
  references: request.inputs.map((input) => input.reference),
});

const revisionInputsMatch = (value: unknown, expected: readonly MaterialInput[]): boolean =>
  Array.isArray(value) && value.length === expected.length && value.every((item, index) =>
    isRecord(item) && onlyKeys(item, ["reference", "purpose"]) &&
    item.reference === expected[index]?.reference && item.purpose === expected[index]?.purpose);

const revisionRequestMatches = (
  data: Readonly<Record<string, unknown>>,
  boundary: RevisionBoundary,
  request: RevisionRequest,
): boolean => data.stage === (boundary.kind === "stage" ? boundary.stage : "implementation") &&
  data.stage_attempt_id === (boundary.kind === "stage" ? boundary.attemptId : boundary.implementationAttemptId) &&
  data.task_id === (boundary.kind === "activity" ? boundary.taskId : undefined) &&
  data.activity === (boundary.kind === "activity" ? boundary.activity : undefined) &&
  data.activity_attempt_id === (boundary.kind === "activity" ? boundary.attemptId : undefined) &&
  data.orchestrator_decision === request.orchestrator_decision && data.reason === request.reason &&
  revisionInputsMatch(data.inputs, request.inputs);

const revisionInteractionMatches = (
  event: ConstructionEventRecord,
  expected: ReturnType<typeof boundaryInteractionData>,
): boolean => event.type === "construction.interaction-recorded" &&
  Object.keys(event.data).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, value]) => JSON.stringify(event.data[key]) === JSON.stringify(value));

const workerContextsFor = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  scopes: readonly RevisionAffectedScope[],
): readonly string[] => {
  const stageScopes = scopes.filter((scope) => scope.kind === "stage" && scope.prior_attempt === "present");
  const activityScopes = scopes.filter((scope) => scope.kind === "activity");
  const contexts = loaded.unit.evidence.flatMap(({ fact }) => {
    if (fact.event.type !== "construction.evidence-recorded") return [];
    const data = fact.event.data;
    const workerContextId = data.worker_context_id;
    const stageAttemptId = data.stage_attempt_id;
    if (typeof workerContextId !== "string" || typeof stageAttemptId !== "string") return [];
    const stageAffected = stageScopes.some((scope) => scope.kind === "stage" && scope.stage_attempt_id === stageAttemptId);
    const activityAffected = activityScopes.some((scope) => scope.kind === "activity" && scope.task_id === data.task_id &&
      scope.activity === data.activity && scope.stage_attempt_id === stageAttemptId &&
      (scope.prior_attempt === "none" || scope.activity_attempt_id === data.activity_attempt_id));
    return stageAffected || activityAffected ? [workerContextId] : [];
  });
  return [...new Set(contexts)].sort((left, right) => left.localeCompare(right));
};

const affectedAttemptsFromScopes = (
  scopes: readonly RevisionAffectedScope[],
): readonly (RevisionAffectedAttempt | RevisionAffectedActivity)[] => scopes.flatMap((scope): readonly (RevisionAffectedAttempt | RevisionAffectedActivity)[] => {
  if (scope.kind === "stage" && scope.prior_attempt === "present") return [{ stage: scope.stage, attemptId: scope.stage_attempt_id }];
  if (scope.kind === "activity" && scope.prior_attempt === "present") return [{
    taskId: scope.task_id,
    activity: scope.activity,
    implementationAttemptId: scope.stage_attempt_id,
    attemptId: scope.activity_attempt_id,
  }];
  return [];
});

const barrierTargetForScope = (unitId: string, scope: RevisionAffectedScope) => {
  if (scope.kind === "stage") {
    return { unitId, stage: scope.stage, ...(scope.prior_attempt === "present" ? { stageAttemptId: scope.stage_attempt_id } : {}) };
  }
  return {
    unitId,
    stage: "implementation",
    stageAttemptId: scope.stage_attempt_id,
    taskId: scope.task_id,
    activity: scope.activity,
    ...(scope.prior_attempt === "present" ? { activityAttemptId: scope.activity_attempt_id } : {}),
  };
};

export class Revision {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly runtime: RevisionRuntime,
  ) {}

  private async applyStageCascade(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    authorization: ConstructionEventRecord,
    scopes: readonly RevisionAffectedScope[],
  ): Promise<RevisionTransitionApplyResult> {
    const revisionId = authorization.data.revision_id;
    const reason = authorization.data.reason;
    if (typeof revisionId !== "string" || typeof reason !== "string") {
      return { kind: "failed", result: revisionFailure("revision_authorization_invalid", "The recorded authorization lacks its revision identity or reason.") };
    }
    const stageScopes = scopes.filter((scope): scope is Extract<RevisionAffectedScope, { readonly kind: "stage"; readonly prior_attempt: "present" }> =>
      scope.kind === "stage" && scope.prior_attempt === "present");
    const events = loaded.history.events.flatMap((record) => record.event ? [record.event as ConstructionEventRecord] : []);
    const actions: {
      readonly scope: Extract<RevisionAffectedScope, { readonly kind: "stage"; readonly prior_attempt: "present" }>;
      readonly ending?: ConstructionEventRecord;
      readonly reopening?: ConstructionEventRecord;
    }[] = [];
    for (const scope of stageScopes) {
      const endings = events.filter((event) => event.type === "construction.stage-attempt-ended-by-revision" &&
        event.data.revision_id === revisionId && event.data.stage === scope.stage &&
        event.data.stage_attempt_id === scope.stage_attempt_id);
      const reopenings = events.filter((event) => event.type === "construction.stage-reopened" &&
        event.data.revision_id === revisionId && event.data.stage === scope.stage &&
        event.data.stage_attempt_id === scope.stage_attempt_id);
      if (endings.length > 1 || reopenings.length > 1) {
        return { kind: "failed", result: revisionFailure("revision_transition_ambiguous", "The authorized stage cascade contains duplicate transition events; preserve history for reconciliation.", {
          revision_id: revisionId,
          stage: scope.stage,
          stage_attempt_id: scope.stage_attempt_id,
          ending_event_ids: endings.map((event) => event.id),
          reopening_event_ids: reopenings.map((event) => event.id),
        }) };
      }
      const ending = endings[0];
      const reopening = reopenings[0];
      if ((!ending && reopening) || (ending && !ending.caused_by.includes(authorization.id)) ||
          (reopening && (!ending || !reopening.caused_by.includes(ending.id)))) {
        return { kind: "failed", result: revisionFailure("revision_transition_causality_invalid", "Existing stage transition events do not form the authorized causal pair.", {
          revision_id: revisionId,
          stage: scope.stage,
          stage_attempt_id: scope.stage_attempt_id,
          ending_event_id: ending?.id,
          reopening_event_id: reopening?.id,
        }) };
      }
      actions.push({ scope, ...(ending ? { ending } : {}), ...(reopening ? { reopening } : {}) });
    }
    const missingEventCount = actions.reduce((count, action) => count + (action.ending ? 0 : 1) + (action.reopening ? 0 : 1), 0);
    if (missingEventCount === 0) return { kind: "applied", eventIds: [] };
    const usedIdentities = revisionIdentitiesIn(loaded);
    const nextIdentity = (): string => {
      const identity = this.runtime.identities.next();
      if (!validRevisionIdentities([identity], usedIdentities)) throw new Error("Allocated revision transition identity is invalid or reused.");
      usedIdentities.add(identity);
      return identity;
    };
    let journalId: string;
    const transitionEvents: ConstructionEventRecord[] = [];
    const validationDetails = (validation: ReturnType<typeof validateConstructionEvent>) => {
      if (validation.status === "invalid") return validation.issues;
      if (validation.status === "unsupported") return validation.reason;
      return [];
    };
    try {
      journalId = nextIdentity();
      for (const action of actions) {
        let ending = action.ending;
        if (!ending) {
          const candidate = {
            id: nextIdentity() as EventId,
            phase: CONSTRUCTION_PHASE,
            envelope_version: 1,
            event_version: CONSTRUCTION_EVENT_VERSION,
            journal_id: journalId,
            producer: this.runtime.producer,
            type: "construction.stage-attempt-ended-by-revision",
            recorded_at: this.runtime.now(),
            caused_by: [authorization.id],
            data: {
              mission_id: loaded.missionId as MissionId,
              unit_id: loaded.unit.unitId as UnitId,
              stage: action.scope.stage,
              stage_attempt_id: action.scope.stage_attempt_id,
              revision_id: revisionId as RevisionId,
              reason,
            },
          };
          const validated = validateConstructionEvent(candidate);
          if (validated.status !== "valid") return { kind: "failed", result: revisionFailure("revision_transition_invalid", "The stage-ending event failed validation.", {
            stage: action.scope.stage,
            issues: validationDetails(validated),
          }) };
          ending = validated.event;
          transitionEvents.push(ending);
        }
        if (!action.reopening) {
          const candidate = {
            id: nextIdentity() as EventId,
            phase: CONSTRUCTION_PHASE,
            envelope_version: 1,
            event_version: CONSTRUCTION_EVENT_VERSION,
            journal_id: journalId,
            producer: this.runtime.producer,
            type: "construction.stage-reopened",
            recorded_at: this.runtime.now(),
            caused_by: [ending.id, authorization.id],
            data: {
              mission_id: loaded.missionId as MissionId,
              unit_id: loaded.unit.unitId as UnitId,
              stage: action.scope.stage,
              stage_attempt_id: action.scope.stage_attempt_id,
              revision_id: revisionId as RevisionId,
              reason,
            },
          };
          const validated = validateConstructionEvent(candidate);
          if (validated.status !== "valid") return { kind: "failed", result: revisionFailure("revision_transition_invalid", "The stage-reopening event failed validation.", {
            stage: action.scope.stage,
            issues: validationDetails(validated),
          }) };
          transitionEvents.push(validated.event);
        }
      }
    } catch (error) {
      return { kind: "failed", result: revisionFailure("revision_transition_identity_failed", "Kepler could not allocate valid stage-transition identities.", {
        message: error instanceof Error ? error.message : String(error),
      }) };
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") {
      return { kind: "failed", result: revisionFailure("revision_transition_journal_identity_conflict", "The allocated stage-transition journal identity already has a filesystem entry.", { journal_id: journalId }) };
    }
    const appendedEventIds: string[] = [];
    try {
      const journal = this.runtime.journals.create(loaded.root, loaded.missionId, journalId);
      for (const event of transitionEvents) {
        const appended = await journal.append(event);
        if (appended.status === "duplicate") throw new Error(`Transition event ${event.id} was unexpectedly duplicated.`);
        appendedEventIds.push(event.id);
      }
    } catch (error) {
      return { kind: "failed", result: revisionFailure("revision_transition_append_uncertain", "Kepler could not confirm the complete stage cascade; preserve all appended events and retry only after inspecting the journal.", {
        revision_id: revisionId,
        journal_id: journalId,
        planned_event_ids: transitionEvents.map((event) => event.id),
        appended_event_ids: appendedEventIds,
        message: error instanceof Error ? error.message : String(error),
      }, "Re-read the exact history. Preserve partial transition events, reconcile worker effects and locks, then retry the identical revision request to append only missing transitions.") };
    }
    return { kind: "applied", eventIds: appendedEventIds };
  }

  private async applyActivityCascade(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    authorization: ConstructionEventRecord,
    scopes: readonly RevisionAffectedScope[],
  ): Promise<RevisionTransitionApplyResult> {
    const revisionId = authorization.data.revision_id;
    const reason = authorization.data.reason;
    if (typeof revisionId !== "string" || typeof reason !== "string" || scopes.some((scope) => scope.kind !== "activity")) {
      return { kind: "failed", result: revisionFailure("revision_authorization_invalid", "The recorded authorization lacks its revision identity, reason, or exact Activity scopes.") };
    }
    const activityScopes = scopes as readonly Extract<RevisionAffectedScope, { readonly kind: "activity" }>[];
    const events = loaded.history.events.flatMap((record) => record.event ? [record.event as ConstructionEventRecord] : []);
    const actions: {
      readonly scope: Extract<RevisionAffectedScope, { readonly kind: "activity" }>;
      readonly ending?: ConstructionEventRecord;
      readonly reopening?: ConstructionEventRecord;
    }[] = [];
    for (const scope of activityScopes) {
      const matchesScope = (event: ConstructionEventRecord) => event.data.revision_id === revisionId &&
        event.data.task_id === scope.task_id && event.data.stage_attempt_id === scope.stage_attempt_id &&
        event.data.activity === scope.activity;
      const endings = events.filter((event) => event.type === "construction.activity-attempt-ended-by-revision" && matchesScope(event) &&
        (scope.prior_attempt === "present" ? event.data.activity_attempt_id === scope.activity_attempt_id : true));
      const reopenings = events.filter((event) => event.type === "construction.activity-reopened" && matchesScope(event) &&
        (scope.prior_attempt === "present"
          ? event.data.activity_attempt_id === scope.activity_attempt_id
          : event.data.activity_attempt_id === undefined));
      if (endings.length > 1 || reopenings.length > 1) {
        return { kind: "failed", result: revisionFailure("revision_transition_ambiguous", "The authorized Activity return contains duplicate transition events; preserve history for reconciliation.", {
          revision_id: revisionId,
          task_id: scope.task_id,
          stage_attempt_id: scope.stage_attempt_id,
          activity: scope.activity,
          ending_event_ids: endings.map((event) => event.id),
          reopening_event_ids: reopenings.map((event) => event.id),
        }) };
      }
      const ending = endings[0];
      const reopening = reopenings[0];
      if (scope.prior_attempt === "present"
        ? (!ending && reopening) || (ending && !ending.caused_by.includes(authorization.id)) ||
          (reopening && (!ending || !reopening.caused_by.includes(ending.id) || !reopening.caused_by.includes(authorization.id)))
        : endings.length > 0 || (reopening && !reopening.caused_by.includes(authorization.id))) {
        return { kind: "failed", result: revisionFailure("revision_transition_causality_invalid", "Existing Activity transition events do not match the authorized attempt and causal boundary.", {
          revision_id: revisionId,
          task_id: scope.task_id,
          stage_attempt_id: scope.stage_attempt_id,
          activity: scope.activity,
          activity_attempt_id: scope.prior_attempt === "present" ? scope.activity_attempt_id : undefined,
          ending_event_id: ending?.id,
          reopening_event_id: reopening?.id,
        }) };
      }
      actions.push({ scope, ...(ending ? { ending } : {}), ...(reopening ? { reopening } : {}) });
    }
    const missingEventCount = actions.reduce((count, action) => count +
      (action.scope.prior_attempt === "present" && !action.ending ? 1 : 0) + (!action.reopening ? 1 : 0), 0);
    if (missingEventCount === 0) return { kind: "applied", eventIds: [] };
    const usedIdentities = revisionIdentitiesIn(loaded);
    const nextIdentity = (): string => {
      const identity = this.runtime.identities.next();
      if (!validRevisionIdentities([identity], usedIdentities)) throw new Error("Allocated revision transition identity is invalid or reused.");
      usedIdentities.add(identity);
      return identity;
    };
    const transitionEvents: ConstructionEventRecord[] = [];
    const validationDetails = (validation: ReturnType<typeof validateConstructionEvent>) => {
      if (validation.status === "invalid") return validation.issues;
      if (validation.status === "unsupported") return validation.reason;
      return [];
    };
    let journalId: string;
    try {
      journalId = nextIdentity();
      for (const action of actions) {
        let ending = action.ending;
        if (action.scope.prior_attempt === "present" && !ending) {
          const candidate = {
            id: nextIdentity() as EventId,
            phase: CONSTRUCTION_PHASE,
            envelope_version: 1,
            event_version: CONSTRUCTION_EVENT_VERSION,
            journal_id: journalId,
            producer: this.runtime.producer,
            type: "construction.activity-attempt-ended-by-revision",
            recorded_at: this.runtime.now(),
            caused_by: [authorization.id],
            data: {
              mission_id: loaded.missionId as MissionId,
              unit_id: loaded.unit.unitId as UnitId,
              stage: "implementation",
              stage_attempt_id: action.scope.stage_attempt_id,
              task_id: action.scope.task_id,
              activity: action.scope.activity,
              activity_attempt_id: action.scope.activity_attempt_id,
              revision_id: revisionId as RevisionId,
              reason,
            },
          };
          const validated = validateConstructionEvent(candidate);
          if (validated.status !== "valid") return { kind: "failed", result: revisionFailure("revision_transition_invalid", "The Activity-ending event failed validation.", {
            task_id: action.scope.task_id,
            activity: action.scope.activity,
            issues: validationDetails(validated),
          }) };
          ending = validated.event;
          transitionEvents.push(ending);
        }
        if (!action.reopening) {
          const candidate = {
            id: nextIdentity() as EventId,
            phase: CONSTRUCTION_PHASE,
            envelope_version: 1,
            event_version: CONSTRUCTION_EVENT_VERSION,
            journal_id: journalId,
            producer: this.runtime.producer,
            type: "construction.activity-reopened",
            recorded_at: this.runtime.now(),
            caused_by: action.scope.prior_attempt === "present" ? [ending!.id, authorization.id] : [authorization.id],
            data: {
              mission_id: loaded.missionId as MissionId,
              unit_id: loaded.unit.unitId as UnitId,
              stage: "implementation",
              stage_attempt_id: action.scope.stage_attempt_id,
              task_id: action.scope.task_id,
              activity: action.scope.activity,
              ...(action.scope.prior_attempt === "present" ? { activity_attempt_id: action.scope.activity_attempt_id } : {}),
              revision_id: revisionId as RevisionId,
              reason,
            },
          };
          const validated = validateConstructionEvent(candidate);
          if (validated.status !== "valid") return { kind: "failed", result: revisionFailure("revision_transition_invalid", "The Activity-reopening event failed validation.", {
            task_id: action.scope.task_id,
            activity: action.scope.activity,
            issues: validationDetails(validated),
          }) };
          transitionEvents.push(validated.event);
        }
      }
    } catch (error) {
      return { kind: "failed", result: revisionFailure("revision_transition_identity_failed", "Kepler could not allocate valid Activity-transition identities.", {
        message: error instanceof Error ? error.message : String(error),
      }) };
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") {
      return { kind: "failed", result: revisionFailure("revision_transition_journal_identity_conflict", "The allocated Activity-transition journal identity already has a filesystem entry.", { journal_id: journalId }) };
    }
    const appendedEventIds: string[] = [];
    try {
      const journal = this.runtime.journals.create(loaded.root, loaded.missionId, journalId);
      for (const event of transitionEvents) {
        const appended = await journal.append(event);
        if (appended.status === "duplicate") throw new Error(`Transition event ${event.id} was unexpectedly duplicated.`);
        appendedEventIds.push(event.id);
      }
    } catch (error) {
      return { kind: "failed", result: revisionFailure("revision_transition_append_uncertain", "Kepler could not confirm the complete Activity return; preserve all appended events and retry only after inspecting the journal.", {
        revision_id: revisionId,
        journal_id: journalId,
        planned_event_ids: transitionEvents.map((event) => event.id),
        appended_event_ids: appendedEventIds,
        message: error instanceof Error ? error.message : String(error),
      }, "Re-read the exact history. Preserve partial transition events, reconcile worker effects and locks, then retry the identical revision request to append only missing transitions.") };
    }
    return { kind: "applied", eventIds: appendedEventIds };
  }

  async execute(
    selectors: ScopeSelectors,
    rawRequest: unknown,
    project?: string,
  ): Promise<RevisionResult> {
    const selected = validateRevisionBoundary(selectors);
    if (selected.kind === "invalid") {
      const integrationRetry = selectors.activity === "code-integration";
      return revisionFailure(
        integrationRetry ? "integration_retry_uses_current_attempt" : "invalid_revision_scope",
        integrationRetry
          ? "An Integration-only retry stays within the current Code Integration attempt and is not a revision."
          : "Revision requires exactly one supported stage or Activity boundary and its exact attempt selectors.",
        selected.details,
        integrationRetry
          ? "Retry through the existing Integration lock and preparation flow with the same Activity attempt."
          : "Use --unit --stage --attempt, or --unit --task --activity --implementation-attempt --attempt.",
      );
    }
    const parsed = validateRevisionRequest(rawRequest);
    if (parsed.kind === "invalid") {
      return revisionFailure("invalid_revision_request", "The typed revision request failed validation.", { issues: parsed.issues },
        "Provide one JSON object with orchestrator_decision, reason, and at least one supporting input.");
    }
    const firstRead = await this.contexts.readUnit(selected.boundary.unitId, project);
    if (firstRead.kind === "failed") return propagateRevisionReadFailure(firstRead);
    const commonDirectory = await revisionCommonDirectory(this.runtime, firstRead.root);
    if (!commonDirectory) return revisionFailure("revision_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await acquireConstructionUnitControl(
      this.runtime.workspace,
      commonDirectory,
      firstRead.missionId,
      selected.boundary.unitId,
    );
    if (acquired.kind === "failed") return revisionFailure(acquired.code, acquired.message, acquired.details, acquired.recovery);

    let result: RevisionResult;
    try {
      const loaded = await this.contexts.readUnit(selected.boundary.unitId, project);
      if (loaded.kind === "failed") {
        result = propagateRevisionReadFailure(loaded);
      } else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) {
        result = revisionFailure("revision_scope_changed", "Unit membership changed while acquiring revision coordination.", { unit_id: selected.boundary.unitId });
      } else {
        result = await this.authorize(loaded, selected.boundary, parsed.request, project);
      }
    } catch (error) {
      result = revisionFailure("revision_authorization_failed", "Kepler could not validate the selected revision safely.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") {
      return revisionFailure("revision_coordination_release_failed", "The revision barrier was recorded but coordination release could not be confirmed.", {
        ...released.details,
        operation_result: result.kind,
        ...(result.kind === "success" ? { revision_id: result.data.revision_id } : {}),
      }, released.recovery);
    }
    return result;
  }

  private async authorize(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    boundary: RevisionBoundary,
    request: RevisionRequest,
    project?: string,
  ): Promise<RevisionResult> {
    if (loaded.unit.blocked) return revisionFailure("revision_history_blocked", "Construction history or projection issues prevent safe revision authorization.", {
      history_issues: loaded.unit.historyIssues,
      projection_issues: loaded.unit.projectionIssues,
    });
    const existing = loaded.history.events.flatMap((record) => {
      const event = record.event;
      return event?.type === "construction.revision-authorized" && event.data.unit_id === boundary.unitId &&
        revisionRequestMatches(event.data, boundary, request) ? [event] : [];
    });
    if (existing.length > 1) return revisionFailure("revision_authorization_ambiguous", "Multiple matching revision authorizations exist; preserve history and reconcile the exact revision.", {
      revision_ids: existing.map((event) => event.data.revision_id),
    });
    const prior = existing[0];
    if (prior) {
      const scopes = isRevisionAffectedScopes(prior.data.affected_scopes) ? prior.data.affected_scopes : [];
      const boundaryTarget = boundary.kind === "stage"
        ? { unitId: boundary.unitId, stage: boundary.stage, stageAttemptId: boundary.attemptId }
        : { unitId: boundary.unitId, stage: "implementation", stageAttemptId: boundary.implementationAttemptId,
          taskId: boundary.taskId, activity: boundary.activity, activityAttemptId: boundary.attemptId };
      const affectsWholeImplementation = scopes.some((scope) => scope.kind === "stage" && scope.stage === "implementation");
      const affectedIntegrationTasks = new Set(scopes.flatMap((scope) =>
        scope.kind === "activity" && scope.activity === "code-integration" ? [String(scope.task_id)] : []));
      if (affectsWholeImplementation || affectedIntegrationTasks.size > 0) {
        const commonDirectory = await revisionCommonDirectory(this.runtime, loaded.root);
        if (!commonDirectory) return revisionFailure("revision_coordination_unavailable", "Git could not resolve the record home's common directory while reconciling Integration.", { repository_root: loaded.root });
        const lock = await inspectConstructionIntegrationLock(this.runtime, commonDirectory, loaded.missionId, boundary.unitId);
        if (lock.kind === "unknown") return revisionFailure(lock.code, "Kepler cannot establish that the affected Integration lock and release state are reconciled.", lock.details, lock.recovery);
        if (lock.kind === "held" && (affectsWholeImplementation || affectedIntegrationTasks.has(lock.taskId))) {
          return revisionFailure("revision_integration_lock_held", "An affected Integration lock remains held; do not end attempts or start replacement work.", {
            revision_id: prior.data.revision_id,
            task_id: lock.taskId,
            implementation_attempt_id: lock.implementationAttemptId,
            activity_attempt_id: lock.activityAttemptId,
            resource_key: lock.resourceKey,
            lock_path: lock.lockPath,
          }, "Stop the affected worker, reconcile its candidate and repository effects, then have the original owner release the exact lock before retrying.");
        }
      }
      if (scopes.length > 0 && scopes.every((scope) => scope.kind === "stage")) {
        const applied = await this.applyStageCascade(loaded, prior as ConstructionEventRecord, scopes);
        if (applied.kind === "failed") return applied.result;
        const refreshed = await this.contexts.readUnit(boundary.unitId, project);
        if (refreshed.kind === "failed") return revisionFailure("revision_transition_confirmation_failed", "Stage transitions were appended, but Kepler could not re-read history to confirm the cascade.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
          read_failure: refreshed.code,
          details: refreshed.details,
        }, "Preserve the transition journal, re-read the exact history, and do not start replacements until the barrier is confirmed complete.");
        if (refreshed.root !== loaded.root || refreshed.missionId !== loaded.missionId) return revisionFailure("revision_scope_changed", "Stage transitions were appended, but unit membership changed before barrier confirmation.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
        });
        if (refreshed.unit.blocked) return revisionFailure("revision_transition_projection_blocked", "Stage transitions were appended, but the refreshed Construction projection is blocked.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
          history_issues: refreshed.unit.historyIssues,
          projection_issues: refreshed.unit.projectionIssues,
        }, "Preserve the transition journal, inspect the projection findings, and do not start replacements until history is valid.");
        const remaining = scopes.map((scope) => pendingRevisionBarrierFor(refreshed, barrierTargetForScope(boundary.unitId, scope)))
          .find((barrier) => barrier !== undefined);
        return {
          kind: "success",
          data: {
            status: remaining ? "barrier_pending" : "barrier_complete",
            revision_id: prior.data.revision_id,
            event_id: prior.id,
            journal_id: prior.journal_id,
            unit_id: boundary.unitId,
            boundary,
            affected_scopes: scopes,
            affected_attempts: affectedAttemptsFromScopes(scopes),
            worker_context_ids: workerContextsFor(refreshed, scopes),
            transition_event_ids: applied.eventIds,
            resumed_authorization: true,
          },
        };
      }
      if (scopes.length > 0 && scopes.every((scope) => scope.kind === "activity")) {
        const applied = await this.applyActivityCascade(loaded, prior as ConstructionEventRecord, scopes);
        if (applied.kind === "failed") return applied.result;
        const refreshed = await this.contexts.readUnit(boundary.unitId, project);
        if (refreshed.kind === "failed") return revisionFailure("revision_transition_confirmation_failed", "Activity transitions were appended, but Kepler could not re-read history to confirm the return.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
          read_failure: refreshed.code,
          details: refreshed.details,
        }, "Preserve the transition journal, re-read the exact history, and do not start replacements until the barrier is confirmed complete.");
        if (refreshed.root !== loaded.root || refreshed.missionId !== loaded.missionId) return revisionFailure("revision_scope_changed", "Activity transitions were appended, but unit membership changed before barrier confirmation.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
        });
        if (refreshed.unit.blocked) return revisionFailure("revision_transition_projection_blocked", "Activity transitions were appended, but the refreshed Construction projection is blocked.", {
          revision_id: prior.data.revision_id,
          transition_event_ids: applied.eventIds,
          history_issues: refreshed.unit.historyIssues,
          projection_issues: refreshed.unit.projectionIssues,
        }, "Preserve the transition journal, inspect the projection findings, and do not start replacements until history is valid.");
        const remaining = scopes.map((scope) => pendingRevisionBarrierFor(refreshed, barrierTargetForScope(boundary.unitId, scope)))
          .find((barrier) => barrier !== undefined);
        return {
          kind: "success",
          data: {
            status: remaining ? "barrier_pending" : "barrier_complete",
            revision_id: prior.data.revision_id,
            event_id: prior.id,
            journal_id: prior.journal_id,
            unit_id: boundary.unitId,
            boundary,
            affected_scopes: scopes,
            affected_attempts: affectedAttemptsFromScopes(scopes),
            worker_context_ids: workerContextsFor(refreshed, scopes),
            transition_event_ids: applied.eventIds,
            resumed_authorization: true,
          },
        };
      }
      const pending = scopes.map((scope) => pendingRevisionBarrierFor(loaded, barrierTargetForScope(boundary.unitId, scope)))
        .find((barrier) => barrier !== undefined) ?? pendingRevisionBarrierFor(loaded, boundaryTarget);
      return {
        kind: "success",
        data: {
          status: pending ? "barrier_pending" : "barrier_complete",
          revision_id: prior.data.revision_id,
          event_id: prior.id,
          journal_id: prior.journal_id,
          unit_id: boundary.unitId,
          boundary,
          affected_scopes: scopes,
          affected_attempts: affectedAttemptsFromScopes(scopes),
          worker_context_ids: workerContextsFor(loaded, scopes),
          resumed_authorization: true,
        },
      };
    }
    const cascade = deriveRevisionCascade(loaded.unit, boundary);
    if (cascade.kind === "invalid") return revisionFailure(cascade.code, cascade.message, cascade.details);
    const scopes = affectedScopes(cascade.cascade);
    const pending = scopes.map((scope) => pendingRevisionBarrierFor(loaded, barrierTargetForScope(boundary.unitId, scope)))
      .find((barrier) => barrier !== undefined);
    if (pending) return revisionFailure("revision_barrier_pending", "An earlier authorized revision overlaps this boundary and must be reconciled first.", {
      revision_id: pending.revisionId,
      authorization_event_id: pending.authorizationEventId,
      affected_scopes: pending.affectedScopes,
    }, "Stop and reconcile the earlier affected work, complete its cascade, then retry this revision.");
    const boundaryFact = revisionBoundaryFact(loaded, boundary);
    if (!boundaryFact) return revisionFailure("revision_boundary_history_missing", "The selected current attempt has no recorded history fact.", {
      unit_id: boundary.unitId,
      boundary,
    });
    const expectedInteraction = boundaryInteractionData(boundary, loaded.missionId, loaded.unit.unitId, request);
    const partialInteractions = loaded.history.events.flatMap((record) => {
      const event = record.event;
      return event?.type === "construction.interaction-recorded" && event.caused_by.includes(boundaryFact.event.id) &&
        revisionInteractionMatches(event as ConstructionEventRecord, expectedInteraction) ? [event] : [];
    });
    if (partialInteractions.length > 1) return revisionFailure("revision_interaction_ambiguous", "Multiple matching decision interactions exist without one unambiguous authorization; preserve history for reconciliation.", {
      interaction_event_ids: partialInteractions.map((event) => event.id),
    });
    const partialInteraction = partialInteractions[0] as ConstructionEventRecord | undefined;
    let interactionId: string;
    let authorizationId: string;
    let journalId: string;
    let revisionId: string;
    try {
      if (partialInteraction) {
        interactionId = partialInteraction.id;
        journalId = partialInteraction.journal_id;
        authorizationId = this.runtime.identities.next();
        revisionId = this.runtime.identities.next();
      } else {
        interactionId = this.runtime.identities.next();
        authorizationId = this.runtime.identities.next();
        journalId = this.runtime.identities.next();
        revisionId = this.runtime.identities.next();
      }
    } catch (error) {
      return revisionFailure("revision_identity_failed", "Kepler could not allocate revision identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const allocatedIdentities = partialInteraction ? [authorizationId, revisionId] : [interactionId, authorizationId, journalId, revisionId];
    if (!validRevisionIdentities(allocatedIdentities, revisionIdentitiesIn(loaded))) {
      return revisionFailure("revision_identity_conflict", "Allocated revision identities are invalid, reused, or already present in history.");
    }
    const common = {
      phase: CONSTRUCTION_PHASE,
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      producer: this.runtime.producer,
    };
    const interactionCandidate = {
      id: interactionId,
      ...common,
      type: "construction.interaction-recorded",
      recorded_at: this.runtime.now(),
      caused_by: [boundaryFact.event.id],
      data: expectedInteraction,
    };
    const authorizationCandidate = {
      id: authorizationId,
      ...common,
      event_version: CONSTRUCTION_REVISION_EVENT_VERSION,
      type: "construction.revision-authorized",
      recorded_at: this.runtime.now(),
      caused_by: [interactionId, boundaryFact.event.id] as EventId[],
      data: boundaryEventData(boundary, loaded.missionId, loaded.unit.unitId, revisionId, request, scopes),
    };
    const interaction = partialInteraction
      ? validateConstructionEvent(partialInteraction)
      : validateConstructionEvent(interactionCandidate);
    const authorization = validateConstructionEvent(authorizationCandidate);
    if (interaction.status !== "valid" || authorization.status !== "valid") {
      const validationDetails = (validation: typeof interaction) => {
        if (validation.status === "invalid") return validation.issues;
        if (validation.status === "unsupported") return validation.reason;
        return [];
      };
      return revisionFailure("revision_event_invalid", "The typed revision authorization events failed validation.", {
        interaction: validationDetails(interaction),
        authorization: validationDetails(authorization),
      });
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    const journalPathKind = await this.runtime.workspace.fileSystem.pathKind(journalPath);
    if (partialInteraction ? journalPathKind !== "file" : journalPathKind !== "missing") {
      return revisionFailure("revision_journal_identity_conflict", "The revision journal path does not match the expected new or partially written journal state.", {
        journal_id: journalId,
        path_kind: journalPathKind,
        partial_interaction_event_id: partialInteraction?.id,
      });
    }
    let journal: EventJournal;
    try {
      journal = this.runtime.journals.create(loaded.root, loaded.missionId, journalId);
      if (!partialInteraction) await journal.append(interaction.event);
      await journal.append(authorization.event);
    } catch (error) {
      return revisionFailure("revision_authorization_append_failed", "Kepler could not durably append the complete revision authorization.", {
        journal_id: journalId,
        interaction_event_id: interaction.event.id,
        authorization_event_id: authorization.event.id,
        revision_id: revisionId,
        message: error instanceof Error ? error.message : String(error),
        authorization_status: error instanceof Error && error.message.includes("construction.revision-authorized")
          ? "uncertain"
          : "not_confirmed",
      }, "Inspect the exact journal before retrying. Preserve any interaction or authorization event already written and do not resume affected work while its state is uncertain.");
    }
    return {
      kind: "success",
      data: {
        status: "barrier_pending",
        revision_id: revisionId,
        event_id: authorization.event.id,
        interaction_event_id: interaction.event.id,
        journal_id: journalId,
        unit_id: boundary.unitId,
        boundary,
        affected_scopes: scopes,
        affected_attempts: cascade.cascade.attempts,
        worker_context_ids: workerContextsFor(loaded, scopes),
        worker_dispatched: false,
      },
    };
  }
}
