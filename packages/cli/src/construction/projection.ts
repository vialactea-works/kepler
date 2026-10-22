import {
  CONSTRUCTION_ACTIVITIES,
  CONSTRUCTION_STAGES,
  CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION,
  isActivityAttemptCompletedData,
  isImplementationCompletionAssessedData,
  isRetainedScopeAssessment,
  isRetainedScopeAssessedData,
  isUnitOfWorkReviewCompletionRecord,
  isDeliverCompletionRecord,
  type ActivityAttemptCompletedData,
  type ActivityAttemptId,
  type ConstructionActivity,
  type ConstructionEventRecord,
  type ConstructionStage,
  type ConstructionStageActivityState,
  type ConstructionTaskState,
  type EffortLevel,
  type StageAttemptId,
  type TaskId,
} from "./events.js";
import {
  functionalDesignEvidenceIds,
  isFunctionalDesignCompletionRecord,
  isLegacyFunctionalDesignCompletionRecord,
  sameArtifactBindings,
} from "./functional-design-completion.js";
import {
  isLegacyQualityRequirementsCompletionRecord,
  isQualityRequirementsCompletionRecord,
  qualityRequirementsEvidenceIds,
  readQualityRequirementsCompletionRecord,
} from "./quality-requirements-completion.js";
import {
  isImplementationPlanningCompletionRecord,
  isLegacyImplementationPlanningCompletionRecord,
  planningEvidenceIds,
  readImplementationPlanningCompletionRecord,
} from "./implementation-planning-completion.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import {
  isHistoryScopeBlocked,
  type CollectedHistoryEvent,
  type HistoryCollection,
  type HistoryIssue,
  type HistoryScope,
} from "../history/collection.js";

export interface ConstructionHistoryFact {
  readonly sourceId: string;
  readonly journalId: string;
  readonly line: number;
  readonly byteOffset: number;
  readonly event: ConstructionEventRecord;
}

export type ConstructionProjectedStageState = ConstructionStageActivityState | "unknown";
export type ConstructionProjectedTaskState = ConstructionTaskState | "unknown";

export interface ConstructionProjectionIssue {
  readonly code:
    | "unit-creation-missing"
    | "unit-creation-conflict"
    | "unordered-transitions"
    | "inconsistent-event-order"
    | "attempt-transition-without-start"
    | "multiple-active-attempts"
    | "invalid-attempt-transition"
    | "duplicate-evidence-id"
    | "invalid-completion-evidence"
    | "invalid-integration-binding"
    | "invalid-activity-start"
    | "invalid-revision-authorization"
    | "invalid-revision-transition"
    | "invalid-task-admission"
    | "invalid-task-completion"
    | "duplicate-unit-baseline";
  readonly message: string;
  readonly scope: HistoryScope;
  readonly eventIds: readonly string[];
}

export interface ConstructionStageAttemptProjection {
  readonly attemptId: StageAttemptId;
  readonly state: ConstructionProjectedStageState;
  readonly facts: readonly ConstructionHistoryFact[];
}

export interface ConstructionStageProjection {
  readonly stage: ConstructionStage;
  readonly state: ConstructionProjectedStageState;
  readonly currentAttemptId?: StageAttemptId;
  readonly attempts: readonly ConstructionStageAttemptProjection[];
  readonly facts: readonly ConstructionHistoryFact[];
}

export interface ConstructionActivityAttemptProjection {
  readonly attemptId: ActivityAttemptId;
  readonly stageAttemptId?: StageAttemptId;
  readonly state: ConstructionProjectedStageState;
  readonly facts: readonly ConstructionHistoryFact[];
}

export interface ConstructionActivityProjection {
  readonly activity: ConstructionActivity;
  readonly state: ConstructionProjectedStageState;
  readonly currentAttemptId?: ActivityAttemptId;
  readonly stageAttemptId?: StageAttemptId;
  readonly attempts: readonly ConstructionActivityAttemptProjection[];
  readonly facts: readonly ConstructionHistoryFact[];
  readonly prepared: readonly ConstructionHistoryFact[];
  readonly accepted: readonly ConstructionHistoryFact[];
}

export interface ConstructionTaskProjection {
  readonly taskId: TaskId;
  readonly state: ConstructionProjectedTaskState;
  readonly stageAttemptId?: StageAttemptId;
  readonly admission?: ConstructionHistoryFact;
  readonly admissions: readonly ConstructionHistoryFact[];
  readonly completion?: ConstructionHistoryFact;
  readonly activities: readonly ConstructionActivityProjection[];
  readonly facts: readonly ConstructionHistoryFact[];
}

export interface ConstructionBoundRecord {
  readonly fact: ConstructionHistoryFact;
  readonly binding: "stage-attempt" | "activity-attempt";
}

export interface ConstructionEffortProjection {
  readonly default: { readonly level: EffortLevel; readonly selectedBy: string };
  readonly stageOverrides: Readonly<Partial<Record<ConstructionStage, { readonly level: EffortLevel; readonly selectedBy: string }>>>;
  readonly effectiveByStage: Readonly<Record<ConstructionStage, EffortLevel>>;
}

export interface ConstructionUnitProjection {
  readonly missionId: string;
  readonly unitId: string;
  readonly initialized: boolean;
  readonly blocked: boolean;
  readonly historyIssues: readonly HistoryIssue[];
  readonly projectionIssues: readonly ConstructionProjectionIssue[];
  readonly created?: ConstructionHistoryFact;
  readonly workflow?: "standard";
  readonly effort?: ConstructionEffortProjection;
  readonly baseline?: ConstructionHistoryFact;
  readonly stages: readonly ConstructionStageProjection[];
  readonly tasks: readonly ConstructionTaskProjection[];
  readonly evidence: readonly ConstructionBoundRecord[];
  readonly approvals: readonly ConstructionBoundRecord[];
  readonly interactions: readonly ConstructionHistoryFact[];
  readonly revisions: readonly ConstructionHistoryFact[];
  readonly retainedScopeAssessments: readonly ConstructionHistoryFact[];
  readonly completionAssessments: readonly ConstructionHistoryFact[];
  readonly progress: {
    readonly completedStages: number;
    readonly totalStages: number;
    readonly completedTasks: number;
    readonly knownTasks: number;
    readonly reliable: boolean;
  };
}

export interface ConstructionProjection {
  readonly missionId: string;
  readonly blocked: boolean;
  readonly historyIssues: readonly HistoryIssue[];
  readonly projectionIssues: readonly ConstructionProjectionIssue[];
  readonly units: readonly ConstructionUnitProjection[];
}

interface MutableAttempt {
  readonly attemptId: string;
  readonly stageAttemptId?: StageAttemptId;
  state: ConstructionProjectedStageState;
  readonly facts: ConstructionHistoryFact[];
}

interface AttemptScopeResult {
  readonly state: ConstructionProjectedStageState;
  readonly currentAttemptId?: string;
  readonly stageAttemptId?: StageAttemptId;
  readonly attempts: readonly MutableAttempt[];
  readonly facts: readonly ConstructionHistoryFact[];
}

interface Transition {
  readonly action: "start" | "resume" | "update" | "reopen" | "end_scope" | "parent_start" | "parent_reopen";
  readonly state: ConstructionStageActivityState;
  readonly attemptId?: string;
  readonly stageAttemptId?: StageAttemptId;
}

const activeStates = new Set<ConstructionStageActivityState>(["running", "pausing", "paused", "waiting"]);
const terminalStates = new Set<ConstructionStageActivityState>(["completed", "ended_by_revision"]);
const compareString = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const compareFacts = (left: ConstructionHistoryFact, right: ConstructionHistoryFact): number =>
  compareString(left.event.journal_id, right.event.journal_id) ||
  compareString(left.sourceId, right.sourceId) ||
  left.line - right.line ||
  compareString(left.event.id, right.event.id);

const asFact = (record: CollectedHistoryEvent): ConstructionHistoryFact | undefined =>
  record.status === "valid" && record.constructionEvent
    ? {
      sourceId: record.sourceId,
      journalId: record.journalId,
      line: record.line,
      byteOffset: record.byteOffset,
      event: record.constructionEvent,
    }
    : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (data: Record<string, unknown>, field: string): string | undefined =>
  typeof data[field] === "string" ? data[field] : undefined;

const factUnitId = (fact: ConstructionHistoryFact): string | undefined =>
  stringField(fact.event.data, "unit_id");

const factStateKey = (fact: ConstructionHistoryFact): string | undefined => {
  const data = fact.event.data;
  const unitId = stringField(data, "unit_id");
  if (!unitId) return undefined;
  const type = fact.event.type;
  if (type === "construction.unit-created") return JSON.stringify([unitId, "creation"]);
  if (type === "construction.unit-baseline-selected") return JSON.stringify([unitId, "baseline"]);
  if (type === "construction.interaction-recorded" && isRecord(data.effort_selection)) {
    return JSON.stringify([unitId, "effort"]);
  }
  if (type.startsWith("construction.stage-")) {
    return JSON.stringify([unitId, "stage", stringField(data, "stage")]);
  }
  if (type.startsWith("construction.task-")) {
    return JSON.stringify([unitId, "task", stringField(data, "task_id")]);
  }
  if (type.startsWith("construction.activity-") || type.startsWith("construction.integration-")) {
    return JSON.stringify([unitId, "activity", stringField(data, "task_id"), stringField(data, "activity")]);
  }
  return undefined;
};

const eventOrder = (facts: readonly ConstructionHistoryFact[]) => {
  const byId = new Map<string, ConstructionHistoryFact>();
  for (const fact of [...facts].sort(compareFacts)) {
    if (!byId.has(fact.event.id)) byId.set(fact.event.id, fact);
  }
  const edges = new Map<string, Set<string>>([...byId.keys()].map((id) => [id, new Set<string>()]));
  const indegree = new Map<string, number>([...byId.keys()].map((id) => [id, 0]));
  const addEdge = (before: string, after: string): void => {
    if (before === after || !byId.has(before) || !byId.has(after)) return;
    const outgoing = edges.get(before);
    if (!outgoing || outgoing.has(after)) return;
    outgoing.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  };
  for (const fact of byId.values()) {
    for (const cause of fact.event.caused_by) addEdge(cause, fact.event.id);
  }
  const journals = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of byId.values()) {
    const key = JSON.stringify([fact.event.phase, fact.event.journal_id]);
    const records = journals.get(key) ?? [];
    records.push(fact);
    journals.set(key, records);
  }
  for (const records of journals.values()) {
    records.sort((left, right) => left.line - right.line || compareString(left.event.id, right.event.id));
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1];
      const current = records[index];
      if (previous && current) addEdge(previous.event.id, current.event.id);
    }
  }
  const ready = [...byId.keys()].filter((id) => indegree.get(id) === 0).sort(compareString);
  const ordered: ConstructionHistoryFact[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) continue;
    const fact = byId.get(id);
    if (fact) ordered.push(fact);
    for (const next of edges.get(id) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(next);
        ready.sort(compareString);
      }
    }
  }
  const orderedIds = new Set(ordered.map((fact) => fact.event.id));
  const cyclic = [...byId.values()].filter((fact) => !orderedIds.has(fact.event.id));
  const hasPath = (from: string, to: string): boolean => {
    if (from === to) return false;
    const visited = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;
      for (const next of edges.get(current) ?? []) {
        if (next === to) return true;
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    return false;
  };
  return { ordered, uniqueFacts: [...byId.values()], cyclic, hasPath };
};

const transitionFor = (fact: ConstructionHistoryFact, scope: "stage" | "activity", activity?: ConstructionActivity): Transition | undefined => {
  const data = fact.event.data;
  const type = fact.event.type;
  const attemptId = stringField(data, scope === "stage" ? "stage_attempt_id" : "activity_attempt_id");
  const stageAttemptId = stringField(data, "stage_attempt_id") as StageAttemptId | undefined;
  if (scope === "stage") {
    if (type === "construction.stage-reopened") return { action: "reopen", state: "reopened", attemptId, stageAttemptId };
    if (type === "construction.stage-attempt-started") return { action: "start", state: "running", attemptId, stageAttemptId };
    if (type === "construction.stage-resumed") return { action: "resume", state: "running", attemptId, stageAttemptId };
    if (type === "construction.stage-waiting") return { action: "update", state: "waiting", attemptId, stageAttemptId };
    if (type === "construction.stage-pause-requested") return { action: "update", state: "pausing", attemptId, stageAttemptId };
    if (type === "construction.stage-paused") return { action: "update", state: "paused", attemptId, stageAttemptId };
    if (type === "construction.stage-attempt-completed") return { action: "update", state: "completed", attemptId, stageAttemptId };
    if (type === "construction.stage-attempt-ended-by-revision") return { action: "update", state: "ended_by_revision", attemptId, stageAttemptId };
    return undefined;
  }
  if (type === "construction.activity-reopened") return { action: "reopen", state: "reopened", attemptId, stageAttemptId };
  if (activity && data.stage === "implementation" &&
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(type)) {
    return { action: "parent_start", state: "running", stageAttemptId };
  }
  if (activity && data.stage === "implementation" && type === "construction.stage-attempt-ended-by-revision") {
    return { action: "end_scope", state: "ended_by_revision", stageAttemptId };
  }
  if (activity && data.stage === "implementation" && type === "construction.stage-reopened") {
    return { action: "parent_reopen", state: "reopened", stageAttemptId };
  }
  if (activity && Array.isArray(data.affected_activities) && data.affected_activities.includes(activity)) {
    if (type === "construction.task-scope-ended-by-revision") return { action: "end_scope", state: "ended_by_revision", stageAttemptId };
    if (type === "construction.task-scope-reopened") return { action: "reopen", state: "reopened", stageAttemptId };
  }
  if (type === "construction.activity-attempt-started") return { action: "start", state: "running", attemptId, stageAttemptId };
  if (type === "construction.activity-resumed") return { action: "resume", state: "running", attemptId, stageAttemptId };
  if (type === "construction.activity-waiting") return { action: "update", state: "waiting", attemptId, stageAttemptId };
  if (type === "construction.activity-pause-requested") return { action: "update", state: "pausing", attemptId, stageAttemptId };
  if (type === "construction.activity-paused") return { action: "update", state: "paused", attemptId, stageAttemptId };
  if (type === "construction.activity-attempt-completed") return { action: "update", state: "completed", attemptId, stageAttemptId };
  if (type === "construction.activity-attempt-ended-by-revision") return { action: "update", state: "ended_by_revision", attemptId, stageAttemptId };
  return undefined;
};

const reduceAttemptScope = (
  facts: readonly ConstructionHistoryFact[],
  scope: "stage" | "activity",
  unitId: string,
  report: (issue: ConstructionProjectionIssue) => void,
  activity?: ConstructionActivity,
): AttemptScopeResult => {
  let state: ConstructionProjectedStageState = "not_started";
  let currentAttemptId: string | undefined;
  let currentStageAttemptId: StageAttemptId | undefined;
  let parentReopened = false;
  const attempts = new Map<string, MutableAttempt>();
  const addIssue = (
    code: ConstructionProjectionIssue["code"],
    message: string,
    fact: ConstructionHistoryFact,
    related?: ConstructionHistoryFact,
  ): void => report({
    code,
    message,
    scope: { missionId: fact.event.data.mission_id as string, unitId },
    eventIds: related ? [fact.event.id, related.event.id] : [fact.event.id],
  });
  for (const fact of facts) {
    const transition = transitionFor(fact, scope, activity);
    if (!transition) continue;
    if (transition.action === "parent_start") {
      const current = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const currentParent = currentStageAttemptId ?? current?.stageAttemptId;
      const retainingCompletedActivity: boolean = scope === "activity" && parentReopened && current?.state === "completed";
      if (currentParent !== undefined && currentParent !== transition.stageAttemptId && state !== "reopened" && !retainingCompletedActivity) {
        addIssue("invalid-attempt-transition", "Implementation parent changed without reopening the Activity scope", fact, current?.facts[0]);
        continue;
      }
      currentStageAttemptId = transition.stageAttemptId;
      parentReopened = retainingCompletedActivity;
      continue;
    }
    if (transition.action === "end_scope") {
      const current = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const currentParent = currentStageAttemptId ?? current?.stageAttemptId;
      const target = current?.stageAttemptId === transition.stageAttemptId
        ? current
        : [...attempts.values()].filter((attempt) => attempt.stageAttemptId === transition.stageAttemptId).at(-1);
      if (!target && currentParent !== undefined && currentParent !== transition.stageAttemptId) {
        addIssue("invalid-revision-transition", "Revision scope targets an older parent than the current Activity attempt", fact,
          current?.facts[0]);
        continue;
      }
      if (scope === "activity" && fact.event.type === "construction.stage-attempt-ended-by-revision" &&
          target?.state === "completed" && target.stageAttemptId === transition.stageAttemptId) {
        target.facts.push(fact);
        currentStageAttemptId = transition.stageAttemptId;
        continue;
      }
      if (target) {
        target.facts.push(fact);
        target.state = "ended_by_revision";
      }
      if (currentParent !== undefined && currentParent !== transition.stageAttemptId) {
        addIssue("invalid-revision-transition", "Revision scope targets an older parent than the current Activity attempt", fact,
          current?.facts[0]);
        continue;
      }
      state = "ended_by_revision";
      currentStageAttemptId = transition.stageAttemptId;
      continue;
    }
    if (transition.action === "parent_reopen") {
      const active = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const currentParent = currentStageAttemptId ?? active?.stageAttemptId;
      if (currentParent !== undefined &&
          (transition.stageAttemptId === undefined
            ? state !== "ended_by_revision"
            : currentParent !== transition.stageAttemptId)) {
        addIssue("invalid-revision-transition", "Stage reopen does not target the ended current Activity parent", fact,
          active?.facts[0]);
        continue;
      }
      if (scope === "activity" && active?.state === "completed" && currentParent === active.stageAttemptId) {
        parentReopened = true;
        continue;
      }
      if (active && activeStates.has(active.state as ConstructionStageActivityState)) {
        addIssue("invalid-attempt-transition", "A scope reopened while its current attempt remained unended", fact, active.facts[0]);
      }
      state = "reopened";
      currentAttemptId = undefined;
      currentStageAttemptId = undefined;
      parentReopened = false;
      continue;
    }
    if (transition.action === "reopen") {
      const active = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const currentParent = currentStageAttemptId ?? active?.stageAttemptId;
      if ((scope === "activity" || scope === "stage") && currentParent !== undefined &&
          (transition.stageAttemptId === undefined
            ? state !== "ended_by_revision"
            : currentParent !== transition.stageAttemptId)) {
        addIssue("invalid-revision-transition", "Revision reopen does not target the ended current Activity parent", fact,
          active?.facts[0]);
        continue;
      }
      if (scope === "activity" && active?.state === "completed") {
        active.facts.push(fact);
        active.state = "ended_by_revision";
      }
      if (active && activeStates.has(active.state as ConstructionStageActivityState)) {
        addIssue("invalid-attempt-transition", "A scope reopened while its current attempt remained unended", fact, active.facts[0]);
      }
      state = "reopened";
      currentAttemptId = undefined;
      currentStageAttemptId = scope === "activity" ? currentParent : undefined;
      parentReopened = false;
      continue;
    }
    if (scope === "activity" && ["start", "resume"].includes(transition.action)) {
      const current = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const currentParent = currentStageAttemptId ?? current?.stageAttemptId;
      if (currentParent === undefined || currentParent !== transition.stageAttemptId) {
        addIssue("invalid-revision-transition", "Activity transition targets an Implementation parent that is not open", fact,
          current?.facts[0]);
        continue;
      }
    }
    const attemptId = transition.attemptId;
    if (!attemptId) {
      addIssue("attempt-transition-without-start", "Attempt transition has no attempt identity", fact);
      state = "unknown";
      continue;
    }
    if (transition.action === "start") {
      const prior = attempts.get(attemptId);
      if (prior) {
        prior.facts.push(fact);
        prior.state = "unknown";
        addIssue("invalid-attempt-transition", "An attempt identity was started more than once", fact, prior.facts[0]);
        state = "unknown";
        continue;
      }
      const current = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      const replacingRetainedActivity = scope === "activity" && current !== undefined &&
        terminalStates.has(current.state as ConstructionStageActivityState) &&
        current.stageAttemptId !== transition.stageAttemptId && currentStageAttemptId === transition.stageAttemptId;
      if (replacingRetainedActivity) {
        current.state = "ended_by_revision";
        state = "reopened";
        parentReopened = false;
      }
      if (current && activeStates.has(current.state as ConstructionStageActivityState)) {
        addIssue("multiple-active-attempts", "A second attempt started while another attempt remained active", fact, current.facts[0]);
        current.state = "unknown";
        state = "unknown";
      } else if ((current && terminalStates.has(current.state as ConstructionStageActivityState) || !current && terminalStates.has(state as ConstructionStageActivityState)) && state !== "reopened") {
        addIssue("invalid-attempt-transition", "A replacement attempt started without a recorded reopen", fact, current?.facts[0]);
        state = "unknown";
      }
      const attempt: MutableAttempt = {
        attemptId,
        stageAttemptId: transition.stageAttemptId,
        state: "running",
        facts: [fact],
      };
      attempts.set(attemptId, attempt);
      currentAttemptId = attemptId;
      currentStageAttemptId = transition.stageAttemptId;
      state = "running";
      continue;
    }
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      addIssue("attempt-transition-without-start", "Attempt transition has no validated start in collected history", fact);
      attempts.set(attemptId, {
        attemptId,
        stageAttemptId: transition.stageAttemptId,
        state: "unknown",
        facts: [fact],
      });
      state = "unknown";
      continue;
    }
    attempt.facts.push(fact);
    if (scope === "activity" && transition.stageAttemptId !== attempt.stageAttemptId) {
      addIssue("invalid-attempt-transition", "Activity event changed its original parent stage attempt", fact, attempt.facts[0]);
      attempt.state = "unknown";
      if (attemptId === currentAttemptId) state = "unknown";
      continue;
    }
    if (transition.action === "resume" && attemptId !== currentAttemptId) {
      addIssue("invalid-attempt-transition", "Resume targeted an attempt that is not current", fact, attempt.facts[0]);
      continue;
    }
    if (attemptId !== currentAttemptId) {
      if (transition.state === "ended_by_revision") attempt.state = "ended_by_revision";
      else if (transition.state === "completed" && attempt.state !== "ended_by_revision") attempt.state = "completed";
      else if (activeStates.has(attempt.state as ConstructionStageActivityState)) {
        addIssue("multiple-active-attempts", "A non-current attempt remained active while another attempt was selected", fact, attempt.facts[0]);
      }
      continue;
    }
    if (transition.state === "completed" && attempt.state === "ended_by_revision") continue;
    if (transition.state === "paused" && attempt.state !== "pausing") {
      addIssue("invalid-attempt-transition", "Pause acknowledgment did not follow a pause request", fact);
      attempt.state = "unknown";
      state = "unknown";
      continue;
    }
    if (transition.action === "resume" && attempt.state !== "paused" && attempt.state !== "waiting") {
      addIssue("invalid-attempt-transition", "Resume did not follow a paused or waiting attempt", fact);
      attempt.state = "unknown";
      state = "unknown";
      continue;
    }
    if (transition.state === "waiting" && !activeStates.has(attempt.state as ConstructionStageActivityState)) {
      addIssue("invalid-attempt-transition", "Wait was recorded for an inactive attempt", fact);
      attempt.state = "unknown";
      state = "unknown";
      continue;
    }
    attempt.state = transition.state;
    state = transition.state;
    currentStageAttemptId = transition.stageAttemptId;
  }
  const projectedAttempts = [...attempts.values()].sort((left, right) => compareString(left.attemptId, right.attemptId));
  return {
    state,
    currentAttemptId,
    stageAttemptId: currentStageAttemptId,
    attempts: projectedAttempts,
    facts,
  };
};

const boundRecord = (fact: ConstructionHistoryFact): ConstructionBoundRecord => ({
  fact,
  binding: fact.event.data.activity_attempt_id !== undefined ? "activity-attempt" : "stage-attempt",
});

const sameStringSet = (left: unknown, right: readonly string[]): boolean =>
  Array.isArray(left) && left.every((item) => typeof item === "string") &&
  new Set(left).size === left.length && new Set(right).size === right.length &&
  JSON.stringify([...left].sort(compareString)) === JSON.stringify([...right].sort(compareString));

const functionalDesignRecordFor = (fact: ConstructionHistoryFact | undefined) => {
  if (!fact || fact.event.type !== "construction.stage-attempt-completed" || fact.event.data.stage !== "functional-design") return undefined;
  const value = fact.event.data.functional_design_assessment;
  if (fact.event.event_version === 1 && isLegacyFunctionalDesignCompletionRecord(value)) {
    return { ...value, artifact_paths: value.assessments.handoff.artifacts };
  }
  return isFunctionalDesignCompletionRecord(value) ? value : undefined;
};

const checkpointKey = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  const checkpoints: (readonly [unknown, unknown])[] = [];
  for (const item of value) {
    if (isRecord(item)) checkpoints.push([item.repository_id, item.commit]);
  }
  checkpoints.sort((left, right) => compareString(String(left[0]), String(right[0])) || compareString(String(left[1]), String(right[1])));
  return JSON.stringify(checkpoints);
};

const sameActivityScope = (left: ConstructionHistoryFact, right: ConstructionHistoryFact): boolean => {
  const a = left.event.data;
  const b = right.event.data;
  return a.mission_id === b.mission_id && a.unit_id === b.unit_id && a.stage === b.stage &&
    a.stage_attempt_id === b.stage_attempt_id && a.task_id === b.task_id && a.activity === b.activity &&
    a.activity_attempt_id === b.activity_attempt_id;
};

const evidenceBindingMatches = (
  evidence: ConstructionHistoryFact,
  completion: ConstructionHistoryFact,
  activitySpecific: boolean,
  facts: readonly ConstructionHistoryFact[],
  hasPath: (from: string, to: string) => boolean,
): boolean => {
  const source = evidence.event.data;
  const target = completion.event.data;
  if (source.mission_id !== target.mission_id || source.unit_id !== target.unit_id ||
      source.stage !== target.stage || source.stage_attempt_id !== target.stage_attempt_id) return false;
  if (activitySpecific && (source.task_id !== target.task_id || source.activity !== target.activity ||
      source.activity_attempt_id !== target.activity_attempt_id)) return false;
  const startTypes = activitySpecific
    ? ["construction.activity-attempt-started", "construction.activity-resumed"]
    : ["construction.stage-attempt-started", "construction.stage-resumed"];
  const attemptStarted = facts.some((fact) =>
    startTypes.includes(fact.event.type) && fact.event.data.mission_id === target.mission_id &&
    fact.event.data.unit_id === target.unit_id && fact.event.data.stage === target.stage &&
    fact.event.data.stage_attempt_id === target.stage_attempt_id &&
    (!activitySpecific || sameActivityScope(fact, completion)) && hasPath(fact.event.id, evidence.event.id),
  );
  if (!attemptStarted) return false;
  const sourceCheckpoints = Array.isArray(source.checkpoints) ? source.checkpoints.filter(isRecord) : [];
  const targetCheckpointValues = target.checkpoints ?? target.candidate_checkpoints;
  const targetCheckpoints = Array.isArray(targetCheckpointValues) ? targetCheckpointValues.filter(isRecord) : [];
  const allowStageEvidenceCheckpointDifference = !activitySpecific && completion.event.type === "construction.stage-attempt-completed" &&
    completion.event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION;
  const checkpointsMatch = allowStageEvidenceCheckpointDifference || sourceCheckpoints.every((sourceCheckpoint) => targetCheckpoints.some((targetCheckpoint) =>
    sourceCheckpoint.repository_id === targetCheckpoint.repository_id && sourceCheckpoint.commit === targetCheckpoint.commit,
  ));
  const result = source.result;
  return isRecord(result) && result.status === "passed" && checkpointsMatch;
};

const recordTransitionKey = (fact: ConstructionHistoryFact): string | undefined => factStateKey(fact);

export const projectConstruction = (history: HistoryCollection): ConstructionProjection => {
  const historyIssues = [...history.issues].sort((left, right) =>
    compareString(left.code, right.code) || compareString(left.scope.unitId ?? "", right.scope.unitId ?? "") ||
    compareString(left.sourceId ?? "", right.sourceId ?? "") || (left.line ?? 0) - (right.line ?? 0) ||
    compareString(left.eventId ?? "", right.eventId ?? ""),
  );
  const candidateFacts = history.events.flatMap((record) => {
    const fact = asFact(record);
    return fact ? [fact] : [];
  });
  const order = eventOrder(candidateFacts);
  const projectionIssues: ConstructionProjectionIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: ConstructionProjectionIssue): void => {
    const eventIds = [...issue.eventIds].sort(compareString);
    const key = JSON.stringify([issue.code, issue.scope.missionId, issue.scope.unitId, eventIds]);
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    projectionIssues.push({ ...issue, eventIds });
  };
  for (const fact of order.cyclic) {
    const unitId = factUnitId(fact);
    addIssue({
      code: "inconsistent-event-order",
      message: "Journal-local order and causal references form a cycle",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id],
    });
  }
  const transitionGroups = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of order.uniqueFacts) {
    const key = recordTransitionKey(fact);
    if (!key) continue;
    const records = transitionGroups.get(key) ?? [];
    records.push(fact);
    transitionGroups.set(key, records);
  }
  for (const records of transitionGroups.values()) {
    for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
        const left = records[leftIndex];
        const right = records[rightIndex];
        if (!left || !right || order.hasPath(left.event.id, right.event.id) || order.hasPath(right.event.id, left.event.id)) continue;
        const unitId = factUnitId(left);
        addIssue({
          code: "unordered-transitions",
          message: "State-changing facts for one Construction scope have no recorded order",
          scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
          eventIds: [left.event.id, right.event.id],
        });
      }
    }
  }

  const factsById = new Map<string, ConstructionHistoryFact>(order.uniqueFacts.map((fact) => [fact.event.id, fact]));
  const evidenceById = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.evidence-recorded") continue;
    const evidenceId = stringField(fact.event.data, "evidence_id");
    if (!evidenceId) continue;
    const records = evidenceById.get(evidenceId) ?? [];
    records.push(fact);
    evidenceById.set(evidenceId, records);
  }
  const hasDirectCause = (dependent: ConstructionHistoryFact, cause: ConstructionHistoryFact): boolean =>
    dependent.event.caused_by.includes(cause.event.id) && order.hasPath(cause.event.id, dependent.event.id);
  const completionHasCurrentStartCause = (completion: ConstructionHistoryFact, activitySpecific: boolean): boolean => {
    const startTypes = activitySpecific
      ? ["construction.activity-attempt-started", "construction.activity-resumed"]
      : ["construction.stage-attempt-started", "construction.stage-resumed"];
    const candidates = order.uniqueFacts.filter((candidate) =>
      startTypes.includes(candidate.event.type) && factUnitId(candidate) === factUnitId(completion) &&
      stringField(candidate.event.data, "stage") === stringField(completion.event.data, "stage") &&
      stringField(candidate.event.data, "stage_attempt_id") === stringField(completion.event.data, "stage_attempt_id") &&
      (!activitySpecific || sameActivityScope(candidate, completion)) && order.hasPath(candidate.event.id, completion.event.id),
    );
    const latest = candidates.filter((candidate) => !candidates.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    return latest.length === 1 && latest[0] !== undefined && hasDirectCause(completion, latest[0]);
  };
  const functionalDesignCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    const legacy = completion.event.event_version === 1;
    const rawRecord = completion.event.data.functional_design_assessment;
    const record = legacy
      ? isLegacyFunctionalDesignCompletionRecord(rawRecord)
        ? { ...rawRecord, artifact_paths: rawRecord.assessments.handoff.artifacts }
        : undefined
      : isFunctionalDesignCompletionRecord(rawRecord) ? rawRecord : undefined;
    if (!record || (!legacy && !sameStringSet(record.artifact_paths, record.assessments.handoff.artifacts))) return false;
    const expectedIds = functionalDesignEvidenceIds(record.assessments).slice().sort();
    const actualIds = evidenceIds.filter((id): id is string => typeof id === "string").sort();
    if (actualIds.length !== evidenceIds.length || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) return false;
    const completionCheckpointKey = checkpointKey(completion.event.data.checkpoints);
    const approval = factsById.get(record.approval_event_id);
    const approvalCheckpointKey = approval ? checkpointKey(approval.event.data.checkpoints) : undefined;
    if (!approval || approval.event.type !== "construction.approval-recorded" ||
        factUnitId(approval) !== factUnitId(completion) || approval.event.data.stage !== "functional-design" ||
        approval.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
        !sameArtifactBindings(approval.event.data.artifact_bindings, record.artifact_bindings) ||
        completionCheckpointKey === "[]" || approvalCheckpointKey === undefined || approvalCheckpointKey === "[]" ||
        (legacy && approvalCheckpointKey !== completionCheckpointKey) || !hasDirectCause(completion, approval)) return false;
    const expectedChecks = new Map([
      [record.assessments.self_review.evidence_id, "functional-design-self-review"],
      [record.assessments.decision_resolution.evidence_id, "functional-design-decision-resolution"],
      [record.assessments.handoff.evidence_id, "functional-design-quality-handoff"],
    ]);
    for (const [evidenceId, check] of expectedChecks) {
      const matches = evidenceById.get(evidenceId) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      const evidenceCheckpointKey = evidence ? checkpointKey(evidence.event.data.checkpoints) : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
          factUnitId(evidence) !== factUnitId(completion) || evidence.event.data.stage !== "functional-design" ||
          evidence.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
          evidence.event.data.check !== check || !isRecord(evidence.event.data.result) ||
          evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, record.artifact_bindings) ||
          evidenceCheckpointKey === undefined || evidenceCheckpointKey === "[]" ||
          (legacy && evidenceCheckpointKey !== completionCheckpointKey) || !hasDirectCause(completion, evidence)) return false;
    }
    return true;
  };
  const qualityRequirementsCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    const legacy = completion.event.event_version === 1;
    const rawRecord = completion.event.data.quality_requirements_assessment;
    const record = legacy
      ? isLegacyQualityRequirementsCompletionRecord(rawRecord) ? rawRecord : undefined
      : isQualityRequirementsCompletionRecord(rawRecord) ? rawRecord : undefined;
    if (!record) return false;
    const expectedIds = qualityRequirementsEvidenceIds(record.assessments).slice().sort();
    const actualIds = evidenceIds.filter((id): id is string => typeof id === "string").sort();
    if (actualIds.length !== evidenceIds.length || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) return false;
    const qualityStarts = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.stage-attempt-started" &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "quality-requirements" &&
      candidate.event.data.stage_attempt_id === completion.event.data.stage_attempt_id && order.hasPath(candidate.event.id, completion.event.id),
    );
    if (qualityStarts.length !== 1) return false;
    const qualityStart = qualityStarts[0]!;
    const functionalCompletions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.stage-attempt-completed" &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "functional-design" &&
      Array.isArray(candidate.event.data.evidence_ids) && order.hasPath(candidate.event.id, qualityStart.event.id) &&
      functionalDesignCompletionValid(candidate, candidate.event.data.evidence_ids),
    );
    const latestFunctionalCompletions = functionalCompletions.filter((candidate) => !functionalCompletions.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, qualityStart.event.id),
    ));
    const functionalCompletion = latestFunctionalCompletions.length === 1 ? latestFunctionalCompletions[0] : undefined;
    const functionalRecord = functionalDesignRecordFor(functionalCompletion);
    const normalizedRecord = functionalRecord
      ? readQualityRequirementsCompletionRecord(rawRecord, functionalRecord.artifact_paths)
      : undefined;
    const authority = validateStageStartAuthority({
      stage: "quality-requirements",
      unitId: factUnitId(completion) ?? "",
      authorityEventIds: qualityStart.event.data.authority_event_ids,
      causedBy: qualityStart.event.caused_by,
      expectedUpstreamEventIds: [String(functionalCompletion?.event.id ?? "")],
      facts: order.uniqueFacts,
    });
    if (!functionalCompletion || !functionalRecord || authority.kind !== "valid" ||
        (!legacy && (!normalizedRecord ||
          !sameArtifactBindings(normalizedRecord.functional_design_bindings, functionalRecord.artifact_bindings) ||
          !sameStringSet([...functionalRecord.artifact_paths, ...normalizedRecord.artifact_paths], normalizedRecord.assessments.handoff.artifacts))) ||
        (legacy && record.functional_design_bindings !== undefined &&
          !sameArtifactBindings(record.functional_design_bindings, functionalRecord.artifact_bindings)) ||
        (legacy && functionalRecord.assessments.handoff.artifacts.some((path) => !record.assessments.handoff.artifacts.includes(path)))) return false;
    const approval = factsById.get(record.approval_event_id);
    const completionCheckpointKey = checkpointKey(completion.event.data.checkpoints);
    const approvalCheckpointKey = approval ? checkpointKey(approval.event.data.checkpoints) : undefined;
    if (!approval || approval.event.type !== "construction.approval-recorded" ||
        factUnitId(approval) !== factUnitId(completion) || approval.event.data.stage !== "quality-requirements" ||
        approval.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
        !sameArtifactBindings(approval.event.data.artifact_bindings, record.artifact_bindings) ||
        completionCheckpointKey === undefined || completionCheckpointKey === "[]" ||
        approvalCheckpointKey === undefined || approvalCheckpointKey === "[]" ||
        (legacy && approvalCheckpointKey !== completionCheckpointKey) || !hasDirectCause(completion, approval)) return false;
    const expectedChecks = new Map([
      [record.assessments.artifact_validation.evidence_id, "quality-artifact-validation"],
      [record.assessments.self_review.evidence_id, "quality-self-review"],
      ...(record.assessments.external_review.requested
        ? [[record.assessments.external_review.evidence_id, "quality-external-review"] as const]
        : []),
    ]);
    const attemptStarts = order.uniqueFacts.filter((candidate) =>
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(candidate.event.type) &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "quality-requirements" &&
      candidate.event.data.stage_attempt_id === completion.event.data.stage_attempt_id && order.hasPath(candidate.event.id, completion.event.id),
    );
    const latestAttemptStarts = attemptStarts.filter((candidate) => !attemptStarts.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    const currentAttemptStart = latestAttemptStarts.length === 1 ? latestAttemptStarts[0] : undefined;
    const externalReviewRequest = record.assessments.external_review.requested
      ? factsById.get(record.assessments.external_review.request_event_id)
      : undefined;
    if (record.assessments.external_review.requested &&
        (!currentAttemptStart || !externalReviewRequest || externalReviewRequest.event.type !== "construction.interaction-recorded" ||
         factUnitId(externalReviewRequest) !== factUnitId(completion) || externalReviewRequest.event.data.stage !== "quality-requirements" ||
         externalReviewRequest.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
         !hasRequesterParticipant(externalReviewRequest.event.data.participants) ||
         !externalReviewRequest.event.caused_by.includes(currentAttemptStart.event.id))) return false;
    for (const [evidenceId, check] of expectedChecks) {
      const matches = evidenceById.get(evidenceId) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      const evidenceCheckpointKey = evidence ? checkpointKey(evidence.event.data.checkpoints) : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
          factUnitId(evidence) !== factUnitId(completion) || evidence.event.data.stage !== "quality-requirements" ||
          evidence.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
          evidence.event.data.check !== check || !isRecord(evidence.event.data.result) ||
          evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, record.artifact_bindings) ||
          evidenceCheckpointKey === undefined || evidenceCheckpointKey === "[]" ||
          (legacy && evidenceCheckpointKey !== completionCheckpointKey) || !hasDirectCause(completion, evidence) ||
          (check === "quality-external-review" && (!externalReviewRequest || !evidence.event.caused_by.includes(externalReviewRequest.event.id)))) return false;
    }
    if (externalReviewRequest && !hasDirectCause(completion, externalReviewRequest)) return false;
    return true;
  };
  const implementationPlanningCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    const legacy = completion.event.event_version === 1;
    const rawRecord = completion.event.data.implementation_planning_assessment;
    const record = legacy
      ? isLegacyImplementationPlanningCompletionRecord(rawRecord) ? readImplementationPlanningCompletionRecord(rawRecord) : undefined
      : isImplementationPlanningCompletionRecord(rawRecord) ? readImplementationPlanningCompletionRecord(rawRecord) : undefined;
    if (!record || !record.assessments.handoff.artifacts.includes("tasks-dag.json") ||
        (!legacy && !sameStringSet([...record.artifact_paths, record.task_graph_path], record.assessments.handoff.artifacts))) return false;
    const expectedIds = planningEvidenceIds(record.assessments).slice().sort();
    const actualIds = evidenceIds.filter((id): id is string => typeof id === "string").sort();
    if (actualIds.length !== evidenceIds.length || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) return false;
    const planningStarts = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.stage-attempt-started" &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "implementation-planning" &&
      candidate.event.data.stage_attempt_id === completion.event.data.stage_attempt_id && order.hasPath(candidate.event.id, completion.event.id),
    );
    if (planningStarts.length !== 1) return false;
    const planningStart = planningStarts[0]!;
    const authorizedQualityCompletions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.stage-attempt-completed" &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "quality-requirements" &&
      Array.isArray(candidate.event.data.evidence_ids) && order.hasPath(candidate.event.id, planningStart.event.id) &&
      qualityRequirementsCompletionValid(candidate, candidate.event.data.evidence_ids),
    );
    const latestQualityCompletions = authorizedQualityCompletions.filter((candidate) => !authorizedQualityCompletions.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, planningStart.event.id),
    ));
    const qualityCompletion = latestQualityCompletions.length === 1 ? latestQualityCompletions[0] : undefined;
    const qualityAssessment = qualityCompletion?.event.data.quality_requirements_assessment;
    const qualityRecord = qualityCompletion?.event.event_version === 1
      ? isLegacyQualityRequirementsCompletionRecord(qualityAssessment) ? qualityAssessment : undefined
      : isQualityRequirementsCompletionRecord(qualityAssessment) ? qualityAssessment : undefined;
    const authorizedFunctionalCompletions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.stage-attempt-completed" &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "functional-design" &&
      Array.isArray(candidate.event.data.evidence_ids) && order.hasPath(candidate.event.id, planningStart.event.id) &&
      functionalDesignCompletionValid(candidate, candidate.event.data.evidence_ids),
    );
    const latestFunctionalCompletions = authorizedFunctionalCompletions.filter((candidate) => !authorizedFunctionalCompletions.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, planningStart.event.id),
    ));
    const functionalCompletion = latestFunctionalCompletions.length === 1 ? latestFunctionalCompletions[0] : undefined;
    const functionalRecord = functionalDesignRecordFor(functionalCompletion);
    const authority = validateStageStartAuthority({
      stage: "implementation-planning",
      unitId: factUnitId(completion) ?? "",
      authorityEventIds: planningStart.event.data.authority_event_ids,
      causedBy: planningStart.event.caused_by,
      expectedUpstreamEventIds: [String(functionalCompletion?.event.id ?? ""), String(qualityCompletion?.event.id ?? "")],
      facts: order.uniqueFacts,
    });
    if (!qualityCompletion || !qualityRecord ||
        !functionalCompletion || !functionalRecord ||
        authority.kind !== "valid" ||
        (legacy
          ? !isLegacyQualityRequirementsCompletionRecord(qualityRecord) || !qualityRecord.functional_design_bindings ||
            !sameArtifactBindings(qualityRecord.functional_design_bindings, functionalRecord.artifact_bindings)
          : !isQualityRequirementsCompletionRecord(qualityRecord) ||
            !sameArtifactBindings(qualityRecord.functional_design_bindings, functionalRecord.artifact_bindings)) ||
        !sameArtifactBindings(record.assessments.handoff.input_bindings, [
          ...functionalRecord.artifact_bindings,
          ...qualityRecord.artifact_bindings,
        ]) ||
        !sameArtifactBindings(record.reviewed_material_bindings, [
          ...record.assessments.handoff.input_bindings,
          ...record.artifact_bindings,
        ]) ||
        record.assessments.handoff.unit_directory !== qualityRecord.assessments.handoff.unit_directory ||
        !record.assessments.handoff.artifacts.includes("plan.md") ||
        !record.assessments.handoff.artifacts.includes("tasks-dag.json") ||
        JSON.stringify(record.assessments.self_review.task_reviews.map((item) => item.task_id).sort()) !==
          JSON.stringify(record.assessments.handoff.task_ids.slice().sort()) ||
        record.assessments.self_review.obligation_coverage.some((item) =>
          item.task_ids.some((taskId) => !record.assessments.handoff.task_ids.includes(taskId)))) return false;
    const completionCheckpointKey = checkpointKey(completion.event.data.checkpoints);
    if (completionCheckpointKey === undefined || completionCheckpointKey === "[]") return false;
    const graphInput = `task-graph:${record.graph_ref.graph_id}@${record.graph_ref.content_version}`;
    const hasGraphInput = (fact: ConstructionHistoryFact): boolean =>
      Array.isArray(fact.event.data.inputs) && fact.event.data.inputs.some((input) =>
        isRecord(input) && input.reference === graphInput && typeof input.purpose === "string" && input.purpose.trim().length > 0,
      );
    const expectedChecks = new Map([
      [record.assessments.artifact_validation.evidence_id, "planning-artifact-validation"],
      [record.assessments.task_graph_validation.evidence_id, "planning-task-graph-validation"],
      [record.assessments.self_review.evidence_id, "planning-self-review"],
      ...(record.assessments.external_review.requested
        ? [[record.assessments.external_review.evidence_id, "planning-external-review"] as const]
        : []),
    ]);
    const externalReviewRequest = record.assessments.external_review.requested
      ? factsById.get(record.assessments.external_review.request_event_id)
      : undefined;
    for (const [evidenceId, check] of expectedChecks) {
      const matches = evidenceById.get(evidenceId) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      const evidenceCheckpointKey = evidence ? checkpointKey(evidence.event.data.checkpoints) : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
          factUnitId(evidence) !== factUnitId(completion) || evidence.event.data.stage !== "implementation-planning" ||
          evidence.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id || evidence.event.data.check !== check ||
          !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, record.reviewed_material_bindings) ||
          evidenceCheckpointKey === undefined || evidenceCheckpointKey === "[]" ||
          (legacy && evidenceCheckpointKey !== completionCheckpointKey) || (legacy && !hasGraphInput(evidence)) || !hasDirectCause(completion, evidence) ||
          (check === "planning-external-review" && (!externalReviewRequest || !evidence.event.caused_by.includes(externalReviewRequest.event.id)))) return false;
    }
    if (record.assessments.approval_requirement.required) {
      if (!record.approval_event_id) return false;
      const approval = factsById.get(record.approval_event_id);
      const approvalCheckpointKey = approval ? checkpointKey(approval.event.data.checkpoints) : undefined;
      if (!approval || approval.event.type !== "construction.approval-recorded" ||
          factUnitId(approval) !== factUnitId(completion) || approval.event.data.stage !== "implementation-planning" ||
          approval.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
          !sameArtifactBindings(approval.event.data.artifact_bindings, record.reviewed_material_bindings) ||
          approvalCheckpointKey === undefined || approvalCheckpointKey === "[]" ||
          (legacy && approvalCheckpointKey !== completionCheckpointKey) || (legacy && !hasGraphInput(approval)) ||
          !hasDirectCause(completion, approval)) return false;
    } else if (record.approval_event_id !== undefined) {
      return false;
    }
    const startTypes = ["construction.stage-attempt-started", "construction.stage-resumed"];
    const starts = order.uniqueFacts.filter((candidate) => startTypes.includes(candidate.event.type) &&
      factUnitId(candidate) === factUnitId(completion) && candidate.event.data.stage === "implementation-planning" &&
      candidate.event.data.stage_attempt_id === completion.event.data.stage_attempt_id && order.hasPath(candidate.event.id, completion.event.id));
    const latestStarts = starts.filter((candidate) => !starts.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    const start = latestStarts.length === 1 ? latestStarts[0] : undefined;
    if (!start || !completion.event.caused_by.includes(start.event.id)) return false;
    const requestIds = [
      ...(record.assessments.external_review.requested ? [record.assessments.external_review.request_event_id] : []),
      ...(record.assessments.approval_requirement.required && record.assessments.approval_requirement.basis.kind === "requester-instruction"
        ? [record.assessments.approval_requirement.basis.request_event_id]
        : []),
    ];
    for (const requestId of new Set(requestIds)) {
      const request = factsById.get(requestId);
      if (!request || request.event.type !== "construction.interaction-recorded" ||
          factUnitId(request) !== factUnitId(completion) || request.event.data.stage !== "implementation-planning" ||
          request.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
          !hasRequesterParticipant(request.event.data.participants) ||
          !request.event.caused_by.includes(start.event.id) || !hasDirectCause(completion, request)) return false;
    }
    return true;
  };
  const implementationCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    if (completion.event.event_version !== 2 || completion.event.data.stage !== "implementation") return false;
    const unitId = factUnitId(completion);
    const attemptId = completion.event.data.stage_attempt_id;
    const completionReference = completion.event.data.implementation_assessment;
    if (!unitId || !attemptId || !isRecord(completionReference) || typeof completionReference.assessment_event_id !== "string") return false;
    const assessmentMatches = order.uniqueFacts.filter((fact) => fact.event.id === completionReference.assessment_event_id);
    const assessmentFact = assessmentMatches.length === 1 ? assessmentMatches[0] : undefined;
    if (!assessmentFact || assessmentFact.event.type !== "construction.implementation-completion-assessed" ||
        !isImplementationCompletionAssessedData(assessmentFact.event.data) ||
        factUnitId(assessmentFact) !== unitId || assessmentFact.event.data.stage_attempt_id !== attemptId ||
        !hasDirectCause(completion, assessmentFact)) return false;
    const assessment = assessmentFact.event.data;
    const activityCompletionData = (fact: ConstructionHistoryFact): ActivityAttemptCompletedData | undefined =>
      fact.event.type === "construction.activity-attempt-completed" && isActivityAttemptCompletedData(fact.event.data)
        ? fact.event.data
        : undefined;
    if (assessment.blocking_findings.length > 0 || assessment.handoff_assessment.status !== "ready") return false;
    const finalCheckpointKey = checkpointKey(assessment.final_checkpoints);
    if (finalCheckpointKey === "[]" || finalCheckpointKey !== checkpointKey(completion.event.data.checkpoints)) return false;
    const missionRecords = order.uniqueFacts.filter((fact) => fact.event.type === "construction.mission-created" &&
      fact.event.data.mission_id === completion.event.data.mission_id);
    const recordHome = missionRecords.length === 1 && isRecord(missionRecords[0]?.event.data.record_home)
      ? missionRecords[0]?.event.data.record_home.repository_id
      : undefined;
    if (typeof recordHome !== "string" || !Array.isArray(assessment.final_checkpoints) ||
        !assessment.final_checkpoints.some((checkpoint) => isRecord(checkpoint) && checkpoint.repository_id === recordHome)) return false;
    const stageStarts = order.uniqueFacts.filter((fact) =>
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type) &&
      factUnitId(fact) === unitId && fact.event.data.stage === "implementation" &&
      fact.event.data.stage_attempt_id === attemptId && order.hasPath(fact.event.id, completion.event.id),
    );
    const latestStageStarts = stageStarts.filter((candidate) => !stageStarts.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    const currentStart = latestStageStarts.length === 1 ? latestStageStarts[0] : undefined;
    const originalStarts = order.uniqueFacts.filter((fact) => fact.event.type === "construction.stage-attempt-started" &&
      factUnitId(fact) === unitId && fact.event.data.stage === "implementation" && fact.event.data.stage_attempt_id === attemptId &&
      order.hasPath(fact.event.id, completion.event.id));
    const originalStart = originalStarts.length === 1 ? originalStarts[0] : undefined;
    if (!currentStart || !originalStart || !hasDirectCause(completion, currentStart) ||
        !hasDirectCause(assessmentFact, currentStart)) return false;
    const latestValidUpstream = (
      stage: "functional-design" | "quality-requirements" | "implementation-planning",
      validate: (fact: ConstructionHistoryFact, ids: readonly unknown[]) => boolean,
    ): ConstructionHistoryFact | undefined => {
      const candidates = order.uniqueFacts.filter((fact) =>
        fact.event.type === "construction.stage-attempt-completed" && fact.event.data.stage === stage &&
        factUnitId(fact) === unitId && Array.isArray(fact.event.data.evidence_ids) &&
        order.hasPath(fact.event.id, originalStart.event.id) && validate(fact, fact.event.data.evidence_ids),
      );
      const latest = candidates.filter((candidate) => !candidates.some((other) =>
        other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
        order.hasPath(other.event.id, originalStart.event.id),
      ));
      return latest.length === 1 ? latest[0] : undefined;
    };
    const functionalCompletion = latestValidUpstream("functional-design", functionalDesignCompletionValid);
    const functionalRecord = functionalDesignRecordFor(functionalCompletion);
    const qualityCompletion = latestValidUpstream("quality-requirements", qualityRequirementsCompletionValid);
    const qualityRecord = functionalRecord && qualityCompletion?.event.type === "construction.stage-attempt-completed"
      ? readQualityRequirementsCompletionRecord(qualityCompletion.event.data.quality_requirements_assessment, functionalRecord.artifact_paths)
      : undefined;
    const planningCompletion = latestValidUpstream("implementation-planning", implementationPlanningCompletionValid);
    const planningRecord = planningCompletion?.event.type === "construction.stage-attempt-completed"
      ? readImplementationPlanningCompletionRecord(planningCompletion.event.data.implementation_planning_assessment)
      : undefined;
    const authority = validateStageStartAuthority({
      stage: "implementation",
      unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: [String(functionalCompletion?.event.id ?? ""), String(qualityCompletion?.event.id ?? ""), String(planningCompletion?.event.id ?? "")],
      facts: order.uniqueFacts,
    });
    if (!functionalCompletion || !functionalRecord || !qualityCompletion || !qualityRecord || !planningCompletion || !planningRecord ||
        authority.kind !== "valid" ||
        !sameArtifactBindings(qualityRecord.functional_design_bindings, functionalRecord.artifact_bindings) ||
        !sameArtifactBindings(assessment.reviewed_material_bindings, planningRecord.reviewed_material_bindings) ||
        assessment.graph_ref.graph_id !== planningRecord.graph_ref.graph_id ||
        assessment.graph_ref.content_version !== planningRecord.graph_ref.content_version ||
        !sameStringSet(assessment.task_ids, planningRecord.assessments.handoff.task_ids) ||
        !sameStringSet(assessment.artifact_paths, [...functionalRecord.artifact_paths, ...qualityRecord.artifact_paths, ...planningRecord.artifact_paths]) ||
        !sameStringSet([...assessment.artifact_paths, assessment.task_graph_path], assessment.handoff_assessment.artifacts)) return false;
    const expectedTaskIds = planningRecord.assessments.handoff.task_ids;
    const admittedTaskIds = order.uniqueFacts.filter((fact) => fact.event.type === "construction.task-admitted" &&
      factUnitId(fact) === unitId && fact.event.data.stage_attempt_id === attemptId).map((fact) => String(fact.event.data.task_id));
    if (!sameStringSet(admittedTaskIds, expectedTaskIds)) return false;
    const retainedEventIds = assessment.retained_assessment_event_ids.map(String);
    const retainedFactsById = retainedEventIds.map((id) => factsById.get(id));
    if (new Set(retainedEventIds).size !== retainedEventIds.length || retainedEventIds.length > 1 ||
        retainedFactsById.some((fact) => !fact || fact.event.type !== "construction.retained-scope-assessed" ||
          !isRetainedScopeAssessedData(fact.event.data) || factUnitId(fact) !== unitId ||
          fact.event.data.stage_attempt_id !== attemptId || !hasDirectCause(assessmentFact, fact))) return false;
    const retainedFacts = retainedFactsById.filter((fact): fact is ConstructionHistoryFact => fact !== undefined);
    const retainedScopeKeys = new Set<string>();
    for (const fact of retainedFacts) {
      if (fact.event.type !== "construction.retained-scope-assessed" || !isRetainedScopeAssessedData(fact.event.data)) return false;
      for (const item of fact.event.data.assessments) {
        const scopeKey = JSON.stringify([item.task_id, item.activity]);
        if (!isRetainedScopeAssessment(item) || !item.applicable || !expectedTaskIds.includes(item.task_id) || retainedScopeKeys.has(scopeKey)) return false;
        const originalCompletionMatches = order.uniqueFacts.filter((candidate) => {
          const data = activityCompletionData(candidate);
          return data !== undefined && factUnitId(candidate) === unitId && data.stage_attempt_id === item.original_stage_attempt_id &&
            data.task_id === item.task_id && data.activity === item.activity && data.activity_attempt_id === item.original_activity_attempt_id &&
            validCompletionEvents.has(candidate.event.id);
        });
        const originalCompletion = originalCompletionMatches.length === 1 ? originalCompletionMatches[0] : undefined;
        const originalCompletionValue = originalCompletion ? activityCompletionData(originalCompletion) : undefined;
        const originalStageEnds = order.uniqueFacts.filter((candidate) => candidate.event.type === "construction.stage-attempt-ended-by-revision" &&
          factUnitId(candidate) === unitId && candidate.event.data.stage === "implementation" &&
          candidate.event.data.stage_attempt_id === item.original_stage_attempt_id && originalCompletion !== undefined &&
          order.hasPath(originalCompletion.event.id, candidate.event.id));
        const originalAdmissions = order.uniqueFacts.filter((candidate) => candidate.event.type === "construction.task-admitted" &&
          factUnitId(candidate) === unitId && candidate.event.data.stage_attempt_id === item.original_stage_attempt_id &&
          candidate.event.data.task_id === item.task_id);
        const superseded = originalCompletion && order.uniqueFacts.some((candidate) => {
          const data = candidate.event.data;
          const sameActivity = candidate.event.type === "construction.activity-reopened" && data.task_id === item.task_id && data.activity === item.activity;
          const sameTask = ["construction.task-scope-ended-by-revision", "construction.task-scope-reopened"].includes(candidate.event.type) &&
            data.task_id === item.task_id && Array.isArray(data.affected_activities) && data.affected_activities.includes(item.activity);
          const sameAttemptEnd = candidate.event.type === "construction.activity-attempt-ended-by-revision" &&
            data.task_id === item.task_id && data.activity === item.activity && data.activity_attempt_id === item.original_activity_attempt_id;
          return data.stage_attempt_id === item.original_stage_attempt_id && (sameActivity || sameTask || sameAttemptEnd) &&
            order.hasPath(originalCompletion.event.id, candidate.event.id);
        });
        if (!originalCompletion || !originalCompletionValue || originalStageEnds.length !== 1 || originalAdmissions.length !== 1 ||
            !isRecord(originalAdmissions[0]?.event.data.graph_ref) ||
            originalAdmissions[0].event.data.graph_ref.graph_id !== planningRecord.graph_ref.graph_id ||
            originalAdmissions[0].event.data.graph_ref.content_version !== planningRecord.graph_ref.content_version ||
            item.original_stage_attempt_id === attemptId || originalCompletionValue.evidence_ids.length === 0 ||
            !sameStringSet(item.original_evidence_ids.map(String), originalCompletionValue.evidence_ids.map(String)) ||
            checkpointKey(item.checkpoints) !== checkpointKey(originalCompletionValue.checkpoints) || superseded ||
            !hasDirectCause(fact, currentStart) || !hasDirectCause(fact, originalCompletion)) return false;
        for (const evidenceId of item.original_evidence_ids) {
          const candidates = evidenceById.get(String(evidenceId)) ?? [];
          const evidence = candidates.length === 1 ? candidates[0] : undefined;
          if (!evidence || !evidenceBindingMatches(evidence, originalCompletion, true, order.uniqueFacts, order.hasPath) ||
              !sameArtifactBindings(evidence.event.data.artifact_bindings, assessment.reviewed_material_bindings) ||
              checkpointKey(evidence.event.data.checkpoints) !== checkpointKey(item.checkpoints) ||
              !hasDirectCause(originalCompletion, evidence) || !hasDirectCause(fact, evidence)) return false;
        }
        if (item.activity === "code-integration") {
          const acceptances = order.uniqueFacts.filter((candidate) => candidate.event.type === "construction.integration-accepted" &&
            factUnitId(candidate) === unitId && candidate.event.data.stage_attempt_id === item.original_stage_attempt_id &&
            candidate.event.data.task_id === item.task_id && candidate.event.data.activity_attempt_id === item.original_activity_attempt_id);
          if (acceptances.length !== 1 || !hasDirectCause(fact, acceptances[0]!)) return false;
        }
        retainedScopeKeys.add(scopeKey);
      }
    }
    const taskCompletions: ConstructionHistoryFact[] = [];
    const integrationEventIds: string[] = [];
    const currentActivities: ConstructionHistoryFact[] = [];
    const activityEvidenceIds: string[] = [];
    let retainedActivityCount = 0;
    for (const taskId of expectedTaskIds) {
      const taskCompletionCandidates = order.uniqueFacts.filter((fact) => fact.event.type === "construction.task-completed" &&
        factUnitId(fact) === unitId && fact.event.data.stage_attempt_id === attemptId && fact.event.data.task_id === taskId &&
        order.hasPath(originalStart.event.id, fact.event.id) && order.hasPath(fact.event.id, assessmentFact.event.id));
      const latestTaskCompletions = taskCompletionCandidates.filter((candidate) => !taskCompletionCandidates.some((other) =>
        other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
        order.hasPath(other.event.id, assessmentFact.event.id),
      ));
      const taskCompletion = latestTaskCompletions.length === 1 ? latestTaskCompletions[0] : undefined;
      if (!taskCompletion || !hasDirectCause(assessmentFact, taskCompletion)) return false;
      const integrationId = String(taskCompletion.event.data.integration_event_id);
      const integration = factsById.get(integrationId);
      if (!integration || integration.event.type !== "construction.integration-accepted" ||
          factUnitId(integration) !== unitId || integration.event.data.stage_attempt_id !== attemptId ||
          integration.event.data.task_id !== taskId || integration.event.data.activity !== "code-integration" ||
          !hasDirectCause(taskCompletion, integration) || !hasDirectCause(assessmentFact, integration)) return false;
      const prepared = factsById.get(String(integration.event.data.prepared_event_id));
      if (!prepared || prepared.event.type !== "construction.integration-prepared" ||
          factUnitId(prepared) !== unitId || prepared.event.data.stage_attempt_id !== attemptId ||
          prepared.event.data.task_id !== taskId || !hasDirectCause(integration, prepared)) return false;
      const integrationCheckpointKey = checkpointKey(integration.event.data.candidate_checkpoints);
      if (integrationCheckpointKey === "[]") return false;
      integrationEventIds.push(integrationId);
      taskCompletions.push(taskCompletion);
      for (const activityName of CONSTRUCTION_ACTIVITIES) {
        const activityFacts = order.ordered.filter((fact) => {
          const data = fact.event.data;
          if (factUnitId(fact) !== unitId || !order.hasPath(fact.event.id, assessmentFact.event.id)) return false;
          if (data.task_id === taskId && data.activity === activityName) return true;
          if (["construction.task-scope-ended-by-revision", "construction.task-scope-reopened"].includes(fact.event.type) &&
              data.task_id === taskId && Array.isArray(data.affected_activities) && data.affected_activities.includes(activityName)) return true;
          return ["construction.stage-attempt-started", "construction.stage-resumed", "construction.stage-attempt-ended-by-revision", "construction.stage-reopened"].includes(fact.event.type) &&
            data.stage === "implementation";
        });
        let invalidActivityTransition = false;
        const activityTransitions = activityFacts.filter((fact) => transitionFor(fact, "activity", activityName) !== undefined);
        const activityProjection = reduceAttemptScope(activityTransitions, "activity", unitId, () => { invalidActivityTransition = true; }, activityName);
        if (invalidActivityTransition) return false;
        const projectedCurrentAttempt = activityProjection.currentAttemptId
          ? activityProjection.attempts.find((attempt) => attempt.attemptId === activityProjection.currentAttemptId)
          : undefined;
        const currentActivityCompletions = projectedCurrentAttempt?.facts.filter((fact) => activityCompletionData(fact) !== undefined) ?? [];
        const currentActivityCompletion: ConstructionHistoryFact | undefined = projectedCurrentAttempt?.stageAttemptId === attemptId && projectedCurrentAttempt.state === "completed" &&
          currentActivityCompletions.length === 1 && validCompletionEvents.has(currentActivityCompletions[0]!.event.id)
          ? currentActivityCompletions[0]
          : undefined;
        if (projectedCurrentAttempt?.stageAttemptId === attemptId && !currentActivityCompletion) return false;
        let activityCompletion: ConstructionHistoryFact | undefined = currentActivityCompletion;
        let selectedActivityData: ActivityAttemptCompletedData | undefined = activityCompletion
          ? activityCompletionData(activityCompletion)
          : undefined;
        if (activityCompletion) {
          currentActivities.push(activityCompletion);
        } else {
          const retainedMatches = assessment.retained_assessment_event_ids.flatMap((eventId) => {
            const retainedFact = factsById.get(String(eventId));
            if (!retainedFact || retainedFact.event.type !== "construction.retained-scope-assessed" ||
                !isRetainedScopeAssessedData(retainedFact.event.data) ||
                factUnitId(retainedFact) !== unitId || retainedFact.event.data.stage_attempt_id !== attemptId ||
                !hasDirectCause(assessmentFact, retainedFact)) return [];
            return retainedFact.event.data.assessments.filter((item) => item.task_id === taskId && item.activity === activityName)
              .map((item) => ({ item, retainedFact }));
          });
          if (retainedMatches.length !== 1) return false;
          const { item, retainedFact } = retainedMatches[0]!;
          if (item.applicable !== true || typeof item.reason !== "string" || item.reason.trim().length === 0 ||
              typeof item.original_stage_attempt_id !== "string" || item.original_stage_attempt_id === attemptId ||
              typeof item.original_activity_attempt_id !== "string" || !Array.isArray(item.original_evidence_ids) || item.original_evidence_ids.length === 0) return false;
          const originalCompletions = order.uniqueFacts.filter((fact) => {
            const data = activityCompletionData(fact);
            return data !== undefined && factUnitId(fact) === unitId && data.stage_attempt_id === item.original_stage_attempt_id &&
              data.task_id === taskId && data.activity === activityName && data.activity_attempt_id === item.original_activity_attempt_id;
          });
          if (originalCompletions.length !== 1 || !validCompletionEvents.has(originalCompletions[0]!.event.id)) return false;
          activityCompletion = originalCompletions[0];
          selectedActivityData = activityCompletionData(activityCompletion);
          if (!selectedActivityData) return false;
          const sourceIds = [...item.original_evidence_ids].map(String).sort();
          const originalIds = selectedActivityData.evidence_ids.map(String).sort();
          if (!sameStringSet(sourceIds, originalIds) || checkpointKey(item.checkpoints) !== checkpointKey(selectedActivityData.checkpoints) ||
              !hasDirectCause(retainedFact, activityCompletion) || !hasDirectCause(retainedFact, currentStart)) return false;
          for (const evidenceId of originalIds) {
            const evidenceMatches = evidenceById.get(evidenceId) ?? [];
            const evidence = evidenceMatches.length === 1 ? evidenceMatches[0] : undefined;
            if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
                !evidenceBindingMatches(evidence, activityCompletion, true, order.uniqueFacts, order.hasPath) ||
                !hasDirectCause(activityCompletion, evidence) || !hasDirectCause(retainedFact, evidence)) return false;
          }
          retainedActivityCount += 1;
        }
        if (!activityCompletion || !selectedActivityData || selectedActivityData.evidence_ids.length === 0) return false;
        const selectedCheckpointKey = checkpointKey(selectedActivityData.checkpoints);
        if (selectedActivityData.stage_attempt_id === attemptId && selectedCheckpointKey !== finalCheckpointKey) return false;
        if (selectedActivityData.stage_attempt_id === attemptId) {
          const activityStarts = order.uniqueFacts.filter((fact) =>
            ["construction.activity-attempt-started", "construction.activity-resumed"].includes(fact.event.type) &&
            factUnitId(fact) === unitId && fact.event.data.stage_attempt_id === attemptId &&
            fact.event.data.task_id === taskId && fact.event.data.activity === activityName &&
            fact.event.data.activity_attempt_id === selectedActivityData.activity_attempt_id &&
            order.hasPath(fact.event.id, activityCompletion.event.id));
          const latestActivityStarts = activityStarts.filter((candidate) => !activityStarts.some((other) =>
            other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
            order.hasPath(other.event.id, activityCompletion.event.id),
          ));
          const activityStart = latestActivityStarts.length === 1 ? latestActivityStarts[0] : undefined;
          if (!activityStart || !hasDirectCause(activityCompletion, activityStart)) return false;
        }
        for (const evidenceId of selectedActivityData.evidence_ids) {
          const evidenceMatches = evidenceById.get(String(evidenceId)) ?? [];
          const evidence = evidenceMatches.length === 1 ? evidenceMatches[0] : undefined;
          if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
              !evidenceBindingMatches(evidence, activityCompletion, true, order.uniqueFacts, order.hasPath) ||
              checkpointKey(evidence.event.data.checkpoints) !== selectedCheckpointKey ||
              !hasDirectCause(activityCompletion, evidence)) return false;
          activityEvidenceIds.push(String(evidenceId));
        }
      }
    }
    if (!sameStringSet(assessment.integration_event_ids, integrationEventIds) ||
        !integrationEventIds.some((id) => checkpointKey(factsById.get(id)?.event.type === "construction.integration-accepted"
          ? factsById.get(id)!.event.data.candidate_checkpoints : undefined) === finalCheckpointKey)) return false;
    if (currentActivities.length + retainedActivityCount !== expectedTaskIds.length * CONSTRUCTION_ACTIVITIES.length) return false;
    const expectedRequiredEvidenceIds = [...new Set([...activityEvidenceIds, ...assessment.unit_check_evidence_ids.map(String)])].sort();
    if (!sameStringSet(assessment.required_check_evidence_ids, expectedRequiredEvidenceIds)) return false;
    const expectedStageEvidenceIds = [
      String(assessment.self_review_evidence_id), String(assessment.handoff_evidence_id),
      ...assessment.unit_check_evidence_ids.map(String),
      ...(assessment.additional_review.requested ? [String(assessment.additional_review.evidence_id)] : []),
    ].sort();
    const actualStageEvidenceIds = evidenceIds.map(String).sort();
    if (!sameStringSet(actualStageEvidenceIds, expectedStageEvidenceIds)) return false;
    const expectedStageChecks = new Map([
      [String(assessment.self_review_evidence_id), "implementation-self-review"],
      [String(assessment.handoff_evidence_id), "implementation-review-handoff"],
      ...assessment.unit_check_evidence_ids.map((id) => [String(id), "implementation-combined-result-check"] as const),
      ...(assessment.additional_review.requested
        ? [[String(assessment.additional_review.evidence_id), "implementation-additional-review"] as const]
        : []),
    ]);
    for (const [evidenceId, check] of expectedStageChecks) {
      const matches = evidenceById.get(evidenceId) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
          factUnitId(evidence) !== unitId || evidence.event.data.stage !== "implementation" ||
          evidence.event.data.stage_attempt_id !== attemptId || evidence.event.data.task_id !== undefined ||
          evidence.event.data.activity !== undefined || evidence.event.data.check !== check ||
          !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, assessment.reviewed_material_bindings) ||
          checkpointKey(evidence.event.data.checkpoints) !== finalCheckpointKey ||
          !hasDirectCause(assessmentFact, evidence) || !hasDirectCause(completion, evidence)) return false;
    }
    if (assessment.additional_review.requested) {
      const request = factsById.get(String(assessment.additional_review.request_event_id));
      const evidence = evidenceById.get(String(assessment.additional_review.evidence_id))?.[0];
      if (!request || request.event.type !== "construction.interaction-recorded" ||
          factUnitId(request) !== unitId || request.event.data.stage !== "implementation" ||
          request.event.data.stage_attempt_id !== attemptId || !hasRequesterParticipant(request.event.data.participants) ||
          !hasDirectCause(request, currentStart) || !evidence || !order.hasPath(request.event.id, evidence.event.id) ||
          assessment.additional_review.findings.length > 0) return false;
    }
    return true;
  };
  const unitOfWorkReviewCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    if (completion.event.event_version !== 2 || completion.event.data.stage !== "unit-of-work-review" ||
        !isUnitOfWorkReviewCompletionRecord(completion.event.data.unit_of_work_review_assessment)) return false;
    const unitId = factUnitId(completion);
    const attemptId = completion.event.data.stage_attempt_id;
    const assessment = completion.event.data.unit_of_work_review_assessment;
    if (!unitId || !attemptId || assessment.findings.blocking.length > 0 || assessment.handoff.status !== "ready") return false;
    const starts = order.uniqueFacts.filter((fact) =>
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type) &&
      factUnitId(fact) === unitId && fact.event.data.stage === "unit-of-work-review" &&
      fact.event.data.stage_attempt_id === attemptId && order.hasPath(fact.event.id, completion.event.id),
    );
    const latestStarts = starts.filter((candidate) => !starts.some((other) =>
      candidate.event.id !== other.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    const currentStart = latestStarts.length === 1 ? latestStarts[0] : undefined;
    const originalStart = order.uniqueFacts.filter((fact) => fact.event.type === "construction.stage-attempt-started" &&
      factUnitId(fact) === unitId && fact.event.data.stage === "unit-of-work-review" &&
      fact.event.data.stage_attempt_id === attemptId && order.hasPath(fact.event.id, completion.event.id));
    if (!currentStart || originalStart.length !== 1 || !originalStart[0] ||
        !hasDirectCause(completion, currentStart)) return false;
    const startFact = originalStart[0];
    const upstreamStages = CONSTRUCTION_STAGES.slice(0, CONSTRUCTION_STAGES.indexOf("unit-of-work-review"));
    const validators = new Map<ConstructionStage, (fact: ConstructionHistoryFact, ids: readonly unknown[]) => boolean>([
      ["functional-design", functionalDesignCompletionValid],
      ["quality-requirements", qualityRequirementsCompletionValid],
      ["implementation-planning", implementationPlanningCompletionValid],
      ["implementation", implementationCompletionValid],
    ]);
    const upstreamCompletions: ConstructionHistoryFact[] = [];
    for (const upstreamStage of upstreamStages) {
      const validate = validators.get(upstreamStage);
      if (!validate) return false;
      const candidates = order.uniqueFacts.filter((fact) =>
        fact.event.type === "construction.stage-attempt-completed" && fact.event.data.stage === upstreamStage &&
        factUnitId(fact) === unitId && Array.isArray(fact.event.data.evidence_ids) &&
        order.hasPath(fact.event.id, startFact.event.id) && validate(fact, fact.event.data.evidence_ids),
      );
      const latest = candidates.filter((candidate) => !candidates.some((other) =>
        other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
        order.hasPath(other.event.id, startFact.event.id),
      ));
      if (latest.length !== 1 || !latest[0]) return false;
      upstreamCompletions.push(latest[0]);
    }
    const authority = validateStageStartAuthority({
      stage: "unit-of-work-review", unitId,
      authorityEventIds: startFact.event.data.authority_event_ids,
      causedBy: startFact.event.caused_by,
      expectedUpstreamEventIds: upstreamCompletions.map((fact) => String(fact.event.id)),
      facts: order.uniqueFacts,
    });
    const implementationCompletion = upstreamCompletions.at(-1);
    if (authority.kind !== "valid" || !implementationCompletion ||
        assessment.implementation_completion_event_id !== implementationCompletion.event.id ||
        !hasDirectCause(completion, implementationCompletion)) return false;
    const implementationData = implementationCompletion.event.data;
    const implementationReference = implementationData.implementation_assessment;
    const implementationAssessmentMatches = isRecord(implementationReference)
      ? factsById.get(String(implementationReference.assessment_event_id))
      : undefined;
    if (!implementationAssessmentMatches || implementationAssessmentMatches.event.type !== "construction.implementation-completion-assessed" ||
        !isImplementationCompletionAssessedData(implementationAssessmentMatches.event.data) ||
        !sameArtifactBindings(assessment.reviewed_material_bindings, implementationAssessmentMatches.event.data.reviewed_material_bindings) ||
        checkpointKey(assessment.final_checkpoints) !== checkpointKey(implementationAssessmentMatches.event.data.final_checkpoints) ||
        checkpointKey(assessment.final_checkpoints) !== checkpointKey(implementationData.checkpoints)) return false;
    const actualEvidenceIds = evidenceIds.map(String);
    const expectedEvidenceIds = [
      String(assessment.implementation_evidence_assessment_id), String(assessment.review_evidence_id), String(assessment.self_review_evidence_id),
      ...(assessment.additional_review.requested ? [String(assessment.additional_review.evidence_id)] : []),
    ];
    if (!sameStringSet(actualEvidenceIds, expectedEvidenceIds)) return false;
    const expectedAuthors = [...new Set(implementationAssessmentMatches.event.data.required_check_evidence_ids.flatMap((id) => {
      const matches = evidenceById.get(String(id)) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      return evidence?.event.type === "construction.evidence-recorded" && evidence.event.data.activity === "code-generation" &&
        typeof evidence.event.data.executor === "string" ? [evidence.event.data.executor] : [];
    }))].sort();
    if (expectedAuthors.length === 0 || !sameStringSet(assessment.implementation_authors, expectedAuthors) ||
        assessment.implementation_authors.includes(assessment.reviewer)) return false;
    const stageEvidence = new Map<string, { readonly check: string; readonly fact?: ConstructionHistoryFact }>([
      [String(assessment.implementation_evidence_assessment_id), { check: "implementation-evidence-assessment" }],
      [String(assessment.review_evidence_id), { check: "unit-of-work-review" }],
      [String(assessment.self_review_evidence_id), { check: "unit-of-work-review-self-review" }],
      ...(assessment.additional_review.requested ? [[String(assessment.additional_review.evidence_id), { check: "unit-of-work-review-additional-review" }] as const] : []),
    ]);
    for (const [id, expected] of stageEvidence) {
      const matches = evidenceById.get(id) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
          factUnitId(evidence) !== unitId || evidence.event.data.stage !== "unit-of-work-review" ||
          evidence.event.data.stage_attempt_id !== attemptId || evidence.event.data.task_id !== undefined ||
          evidence.event.data.activity !== undefined || evidence.event.data.check !== expected.check ||
          !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, assessment.reviewed_material_bindings) ||
          checkpointKey(evidence.event.data.checkpoints) !== checkpointKey(assessment.final_checkpoints) ||
          !hasDirectCause(completion, evidence) || !hasDirectCause(evidence, currentStart)) return false;
      if (id === String(assessment.review_evidence_id) && evidence.event.data.executor !== assessment.reviewer) return false;
      if (id === String(assessment.self_review_evidence_id) && evidence.event.data.executor !== assessment.reviewer) return false;
    }
    if (assessment.additional_review.requested) {
      const request = factsById.get(String(assessment.additional_review.request_event_id));
      const evidence = (evidenceById.get(String(assessment.additional_review.evidence_id)) ?? [])[0];
      if (!request || request.event.type !== "construction.interaction-recorded" ||
          factUnitId(request) !== unitId || request.event.data.stage !== "unit-of-work-review" ||
          request.event.data.stage_attempt_id !== attemptId || !hasRequesterParticipant(request.event.data.participants) ||
          !hasDirectCause(request, currentStart) || !evidence || !hasDirectCause(evidence, request) ||
          evidence.event.data.executor !== assessment.additional_review.reviewer ||
          assessment.additional_review.findings.length > 0 || assessment.additional_review.reviewer === assessment.reviewer ||
          assessment.implementation_authors.includes(assessment.additional_review.reviewer)) return false;
    }
    const approval = assessment.acceptance_required ? factsById.get(String(assessment.approval_event_id)) : undefined;
    if (assessment.acceptance_required) {
      if (!approval || approval.event.type !== "construction.approval-recorded" || factUnitId(approval) !== unitId ||
          approval.event.data.stage !== "unit-of-work-review" || approval.event.data.stage_attempt_id !== attemptId ||
          !sameArtifactBindings(approval.event.data.artifact_bindings, assessment.reviewed_material_bindings) ||
          checkpointKey(approval.event.data.checkpoints) !== checkpointKey(assessment.final_checkpoints) ||
          !hasDirectCause(approval, currentStart) || !hasDirectCause(completion, approval)) return false;
    } else if (assessment.approval_event_id !== undefined) return false;
    return true;
  };
  const deliverCompletionValid = (
    completion: ConstructionHistoryFact,
    evidenceIds: readonly unknown[],
  ): boolean => {
    if (completion.event.event_version !== 2 || completion.event.data.stage !== "deliver" ||
        !isDeliverCompletionRecord(completion.event.data.deliver_assessment)) return false;
    const unitId = factUnitId(completion);
    const attemptId = completion.event.data.stage_attempt_id;
    const assessment = completion.event.data.deliver_assessment;
    if (!unitId || !attemptId || assessment.handoff.status !== "ready" ||
        (assessment.outcome !== "repository-handoff" && assessment.operation_results.length === 0) ||
        assessment.operation_results.some((operation) => operation.status !== "succeeded") ||
        assessment.verification_evidence_ids.length === 0) return false;
    const starts = order.uniqueFacts.filter((fact) =>
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type) &&
      factUnitId(fact) === unitId && fact.event.data.stage === "deliver" &&
      fact.event.data.stage_attempt_id === attemptId && order.hasPath(fact.event.id, completion.event.id),
    );
    const latestStarts = starts.filter((candidate) => !starts.some((other) =>
      candidate.event.id !== other.event.id && order.hasPath(candidate.event.id, other.event.id) &&
      order.hasPath(other.event.id, completion.event.id),
    ));
    const currentStart = latestStarts.length === 1 ? latestStarts[0] : undefined;
    const originalStarts = order.uniqueFacts.filter((fact) => fact.event.type === "construction.stage-attempt-started" &&
      factUnitId(fact) === unitId && fact.event.data.stage === "deliver" &&
      fact.event.data.stage_attempt_id === attemptId && order.hasPath(fact.event.id, completion.event.id));
    if (!currentStart || originalStarts.length !== 1 || !originalStarts[0] || !hasDirectCause(completion, currentStart)) return false;
    const originalStart = originalStarts[0];
    const upstreamStages = CONSTRUCTION_STAGES.slice(0, CONSTRUCTION_STAGES.indexOf("deliver"));
    const validators = new Map<ConstructionStage, (fact: ConstructionHistoryFact, ids: readonly unknown[]) => boolean>([
      ["functional-design", functionalDesignCompletionValid],
      ["quality-requirements", qualityRequirementsCompletionValid],
      ["implementation-planning", implementationPlanningCompletionValid],
      ["implementation", implementationCompletionValid],
      ["unit-of-work-review", unitOfWorkReviewCompletionValid],
    ]);
    const upstreamCompletions: ConstructionHistoryFact[] = [];
    for (const upstreamStage of upstreamStages) {
      const validate = validators.get(upstreamStage);
      if (!validate) return false;
      const candidates = order.uniqueFacts.filter((fact) =>
        fact.event.type === "construction.stage-attempt-completed" && fact.event.data.stage === upstreamStage &&
        factUnitId(fact) === unitId && Array.isArray(fact.event.data.evidence_ids) &&
        order.hasPath(fact.event.id, originalStart.event.id) && validate(fact, fact.event.data.evidence_ids),
      );
      const latest = candidates.filter((candidate) => !candidates.some((other) =>
        other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id) &&
        order.hasPath(other.event.id, originalStart.event.id),
      ));
      if (latest.length !== 1 || !latest[0]) return false;
      upstreamCompletions.push(latest[0]);
    }
    const authority = validateStageStartAuthority({
      stage: "deliver", unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: upstreamCompletions.map((fact) => String(fact.event.id)),
      facts: order.uniqueFacts,
    });
    const reviewCompletion = upstreamCompletions.at(-1);
    if (authority.kind !== "valid" || !reviewCompletion || reviewCompletion.event.type !== "construction.stage-attempt-completed" ||
        !isUnitOfWorkReviewCompletionRecord(reviewCompletion.event.data.unit_of_work_review_assessment) ||
        assessment.review_completion_event_id !== reviewCompletion.event.id || !hasDirectCause(completion, reviewCompletion)) return false;
    const reviewAssessment = reviewCompletion.event.data.unit_of_work_review_assessment;
    if (new Set(assessment.artifact_bindings.map((binding) => binding.artifact_id)).size !== assessment.artifact_bindings.length ||
        !reviewAssessment.reviewed_material_bindings.every((reviewed) => assessment.artifact_bindings.some((binding) =>
          binding.artifact_id === reviewed.artifact_id && binding.content_version === reviewed.content_version,
        )) || checkpointKey(assessment.reviewed_checkpoints) !== checkpointKey(reviewAssessment.final_checkpoints) ||
        checkpointKey(assessment.reviewed_checkpoints) !== checkpointKey(reviewCompletion.event.data.checkpoints) ||
        reviewAssessment.handoff.status !== "ready") return false;
    const expectedEvidenceIds = [
      String(assessment.preparation_evidence_id), String(assessment.self_review_evidence_id),
      ...assessment.operation_results.map((operation) => String(operation.evidence_id)),
      ...assessment.verification_evidence_ids.map(String), String(assessment.handoff_evidence_id),
      ...(assessment.additional_review?.requested ? [String(assessment.additional_review.evidence_id)] : []),
    ];
    if (!sameStringSet(evidenceIds.map(String), expectedEvidenceIds)) return false;
    const currentCheckpointsKey = checkpointKey(completion.event.data.checkpoints);
    const stageEvidence = new Map<string, string>([
      [String(assessment.preparation_evidence_id), "deliver-preparation"],
      [String(assessment.self_review_evidence_id), "deliver-self-review"],
      ...assessment.operation_results.map((operation) => [String(operation.evidence_id), "deliver-operation-result"] as const),
      ...assessment.verification_evidence_ids.map((id) => [String(id), "deliver-outcome-verification"] as const),
      [String(assessment.handoff_evidence_id), "deliver-recipient-handoff"],
      ...(assessment.additional_review?.requested
        ? [[String(assessment.additional_review.evidence_id), "deliver-additional-review"] as const]
        : []),
    ]);
    const stageEvidenceFacts = new Map<string, ConstructionHistoryFact>();
    for (const [id, check] of stageEvidence) {
      const matches = evidenceById.get(id) ?? [];
      const evidence = matches.length === 1 ? matches[0] : undefined;
      if (!evidence || evidence.event.type !== "construction.evidence-recorded" || factUnitId(evidence) !== unitId ||
          evidence.event.data.stage !== "deliver" || evidence.event.data.stage_attempt_id !== attemptId ||
          evidence.event.data.task_id !== undefined || evidence.event.data.activity !== undefined ||
          evidence.event.data.check !== check || !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
          !sameArtifactBindings(evidence.event.data.artifact_bindings, assessment.artifact_bindings) ||
          checkpointKey(evidence.event.data.checkpoints) !== currentCheckpointsKey ||
          !hasDirectCause(evidence, currentStart) || !hasDirectCause(completion, evidence)) return false;
      stageEvidenceFacts.set(id, evidence);
    }
    const handoff = stageEvidenceFacts.get(String(assessment.handoff_evidence_id));
    if (!handoff || !Array.isArray(handoff.event.data.output_refs) || handoff.event.data.output_refs.length === 0 ||
        !hasDirectCause(handoff, reviewCompletion) || !hasDirectCause(handoff, stageEvidenceFacts.get(String(assessment.preparation_evidence_id))!) ||
        !hasDirectCause(handoff, stageEvidenceFacts.get(String(assessment.self_review_evidence_id))!)) return false;
    for (const operation of assessment.operation_results) {
      const evidence = stageEvidenceFacts.get(String(operation.evidence_id));
      if (!evidence || checkpointKey(operation.source_checkpoints) !== checkpointKey(assessment.reviewed_checkpoints) ||
          !Array.isArray(evidence.event.data.output_refs) || evidence.event.data.output_refs.length === 0 ||
          !hasDirectCause(handoff, evidence)) return false;
      if (operation.authority.kind === "requester-instruction") {
        const request = factsById.get(String(operation.authority.event_id));
        if (!request || request.event.type !== "construction.interaction-recorded" || factUnitId(request) !== unitId ||
            request.event.data.stage !== "deliver" || request.event.data.stage_attempt_id !== attemptId ||
            !hasRequesterParticipant(request.event.data.participants) || !hasDirectCause(request, currentStart) ||
            !hasDirectCause(evidence, request) || !hasDirectCause(completion, request)) return false;
      }
    }
    for (const evidenceId of assessment.verification_evidence_ids) {
      const evidence = stageEvidenceFacts.get(String(evidenceId));
      if (!evidence || !Array.isArray(evidence.event.data.output_refs) || evidence.event.data.output_refs.length === 0 ||
          !hasDirectCause(handoff, evidence) || assessment.operation_results.some((operation) => {
            const operationEvidence = stageEvidenceFacts.get(String(operation.evidence_id));
            return !operationEvidence || !hasDirectCause(evidence, operationEvidence);
          })) return false;
    }
    if (assessment.additional_review?.requested) {
      const request = factsById.get(String(assessment.additional_review.request_event_id));
      const evidence = stageEvidenceFacts.get(String(assessment.additional_review.evidence_id));
      if (!request || request.event.type !== "construction.interaction-recorded" || factUnitId(request) !== unitId ||
          request.event.data.stage !== "deliver" || request.event.data.stage_attempt_id !== attemptId ||
          !hasRequesterParticipant(request.event.data.participants) || !hasDirectCause(request, currentStart) ||
          !evidence || !hasDirectCause(evidence, request) || evidence.event.data.executor !== assessment.additional_review.reviewer ||
          assessment.additional_review.findings.length > 0) return false;
    }
    const approval = assessment.approval_required ? factsById.get(String(assessment.approval_event_id)) : undefined;
    if (assessment.approval_required) {
      if (!approval || approval.event.type !== "construction.approval-recorded" || factUnitId(approval) !== unitId ||
          approval.event.data.stage !== "deliver" || approval.event.data.stage_attempt_id !== attemptId ||
          !sameArtifactBindings(approval.event.data.artifact_bindings, assessment.artifact_bindings) ||
          checkpointKey(approval.event.data.checkpoints) !== currentCheckpointsKey || !hasDirectCause(approval, currentStart) ||
          !hasDirectCause(completion, approval)) return false;
    } else if (assessment.approval_event_id !== undefined) return false;
    return true;
  };
  const validCompletionEvents = new Set<string>();
  for (const fact of order.ordered) {
    const stageCompletion = fact.event.type === "construction.stage-attempt-completed";
    const activityCompletion = fact.event.type === "construction.activity-attempt-completed";
    if (!stageCompletion && !activityCompletion) continue;
    const evidenceIds = Array.isArray(fact.event.data.evidence_ids) ? fact.event.data.evidence_ids : [];
    const invalidEvidence: ConstructionHistoryFact[] = [];
    const validEvidence: ConstructionHistoryFact[] = [];
    let evidenceValid = completionHasCurrentStartCause(fact, activityCompletion);
    for (const evidenceId of evidenceIds) {
      const candidates = typeof evidenceId === "string" ? evidenceById.get(evidenceId) ?? [] : [];
      const evidence = candidates.length === 1 ? candidates[0] : undefined;
      if (!evidence || !evidenceBindingMatches(evidence, fact, activityCompletion, order.uniqueFacts, order.hasPath) ||
          !fact.event.caused_by.includes(evidence.event.id) || !order.hasPath(evidence.event.id, fact.event.id)) {
        evidenceValid = false;
        invalidEvidence.push(...candidates);
      } else {
        validEvidence.push(evidence);
      }
    }
    const checkpoints = Array.isArray(fact.event.data.checkpoints) ? fact.event.data.checkpoints.filter(isRecord) : [];
    const checkpointCoverage = stageCompletion
      ? fact.event.event_version === 1 || checkpoints.length > 0
      : checkpoints.every((checkpoint) => validEvidence.some((evidence) =>
        Array.isArray(evidence.event.data.checkpoints) && evidence.event.data.checkpoints.some((evidenceCheckpoint) =>
          isRecord(evidenceCheckpoint) && evidenceCheckpoint.repository_id === checkpoint.repository_id &&
          evidenceCheckpoint.commit === checkpoint.commit,
        ),
      ));
    if (!checkpointCoverage) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "functional-design" &&
        !functionalDesignCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "quality-requirements" &&
        !qualityRequirementsCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "implementation-planning" &&
        !implementationPlanningCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "implementation" &&
        !implementationCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "unit-of-work-review" &&
        !unitOfWorkReviewCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage === "deliver" &&
        !deliverCompletionValid(fact, evidenceIds)) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "functional-design" && fact.event.data.functional_design_assessment !== undefined) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "quality-requirements" && fact.event.data.quality_requirements_assessment !== undefined) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "implementation-planning" && fact.event.data.implementation_planning_assessment !== undefined) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "implementation" && fact.event.data.implementation_assessment !== undefined) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "unit-of-work-review" && fact.event.data.unit_of_work_review_assessment !== undefined) evidenceValid = false;
    if (stageCompletion && fact.event.data.stage !== "deliver" && fact.event.data.deliver_assessment !== undefined) evidenceValid = false;
    if (evidenceValid) {
      validCompletionEvents.add(fact.event.id);
      continue;
    }
    const unitId = factUnitId(fact);
    addIssue({
      code: "invalid-completion-evidence",
      message: "Completion references missing, failed, or differently bound evidence",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...invalidEvidence.map((evidence) => evidence.event.id)],
    });
  }
  for (const [evidenceId, records] of evidenceById) {
    if (records.length < 2) continue;
    for (const fact of records) {
      const unitId = factUnitId(fact);
      addIssue({
        code: "duplicate-evidence-id",
        message: `Evidence identity ${evidenceId} is used by more than one event`,
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: records.map((record) => record.event.id),
      });
    }
  }

  const revisionFactsByRevisionId = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.revision-authorized") continue;
    const revisionId = stringField(fact.event.data, "revision_id");
    if (revisionId) revisionFactsByRevisionId.set(revisionId, [...(revisionFactsByRevisionId.get(revisionId) ?? []), fact]);
  }
  const validRevisionAuthorizations = new Set<string>();
  for (const revisions of revisionFactsByRevisionId.values()) {
    if (revisions.length !== 1) {
      for (const revision of revisions) {
        const unitId = factUnitId(revision);
        addIssue({
          code: "invalid-revision-authorization",
          message: "Revision identity is duplicated in collected history",
          scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
          eventIds: revisions.map((item) => item.event.id),
        });
      }
      continue;
    }
    const revision = revisions[0];
    if (!revision) continue;
    const supportingFacts = order.uniqueFacts.filter((candidate) => {
      if (candidate.event.type !== "construction.interaction-recorded" && candidate.event.type !== "construction.evidence-recorded") return false;
      if (factUnitId(candidate) !== factUnitId(revision) || !hasDirectCause(revision, candidate)) return false;
      if (candidate.event.type === "construction.interaction-recorded") return true;
      return ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id"].every((field) => {
        const authorized = revision.event.data[field];
        const supported = candidate.event.data[field];
        return authorized === undefined || authorized === supported;
      });
    });
    if (supportingFacts.length === 0) {
      const unitId = factUnitId(revision);
      addIssue({
        code: "invalid-revision-authorization",
        message: "Revision authorization lacks a directly caused interaction or bound evidence record",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: [revision.event.id],
      });
      continue;
    }
    validRevisionAuthorizations.add(revision.event.id);
  }
  const revisionTransitionTypes = new Set([
    "construction.stage-attempt-ended-by-revision",
    "construction.stage-reopened",
    "construction.task-scope-ended-by-revision",
    "construction.task-scope-reopened",
    "construction.activity-attempt-ended-by-revision",
    "construction.activity-reopened",
  ]);
  const validRevisionTransitions = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (!revisionTransitionTypes.has(fact.event.type)) continue;
    const revisionId = stringField(fact.event.data, "revision_id");
    const candidates = revisionId ? revisionFactsByRevisionId.get(revisionId) ?? [] : [];
    const authorization = candidates.length === 1 ? candidates[0] : undefined;
    const scopeMatches = authorization !== undefined && validRevisionAuthorizations.has(authorization.event.id) &&
      factUnitId(authorization) === factUnitId(fact) &&
      ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id"].every((field) =>
        authorization.event.data[field] === fact.event.data[field],
      ) && hasDirectCause(fact, authorization);
    if (scopeMatches) {
      validRevisionTransitions.add(fact.event.id);
      continue;
    }
    const unitId = factUnitId(fact);
    addIssue({
      code: "invalid-revision-transition",
      message: "Revision transition lacks its matching, directly caused authorization",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...candidates.map((item) => item.event.id)],
    });
  }

  const affectedActivitiesFor = (fact: ConstructionHistoryFact): readonly string[] =>
    Array.isArray(fact.event.data.affected_activities)
      ? fact.event.data.affected_activities.filter((activity): activity is string => typeof activity === "string")
      : [];
  for (const fact of order.uniqueFacts) {
    if (!validRevisionTransitions.has(fact.event.id) ||
        !["construction.task-scope-ended-by-revision", "construction.task-scope-reopened"].includes(fact.event.type)) continue;
    const taskId = stringField(fact.event.data, "task_id");
    const stageAttemptId = stringField(fact.event.data, "stage_attempt_id");
    for (const activity of affectedActivitiesFor(fact)) {
      const activityTargets = order.uniqueFacts.filter((candidate) =>
        factUnitId(candidate) === factUnitId(fact) && stringField(candidate.event.data, "task_id") === taskId &&
        stringField(candidate.event.data, "stage_attempt_id") === stageAttemptId &&
        stringField(candidate.event.data, "activity") === activity,
      );
      const causallyTargeted = activityTargets.some((candidate) => order.hasPath(candidate.event.id, fact.event.id));
      const admissionTargets = order.uniqueFacts.filter((candidate) =>
        candidate.event.type === "construction.task-admitted" && factUnitId(candidate) === factUnitId(fact) &&
        stringField(candidate.event.data, "task_id") === taskId &&
        stringField(candidate.event.data, "stage_attempt_id") === stageAttemptId &&
        order.hasPath(candidate.event.id, fact.event.id),
      );
      if (!causallyTargeted && (activityTargets.length > 0 || admissionTargets.length === 0)) {
        const unitId = factUnitId(fact);
        addIssue({
          code: "invalid-revision-transition",
          message: `Task-scope revision does not causally target the affected ${activity} scope`,
          scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
          eventIds: [fact.event.id, ...activityTargets.map((candidate) => candidate.event.id),
            ...admissionTargets.map((candidate) => candidate.event.id)],
        });
      }
    }
  }
  const taskScopeRevisionGroups = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of order.uniqueFacts) {
    if (!validRevisionTransitions.has(fact.event.id) ||
        !["construction.task-scope-ended-by-revision", "construction.task-scope-reopened"].includes(fact.event.type)) continue;
    const key = JSON.stringify([
      fact.event.data.mission_id,
      factUnitId(fact),
      stringField(fact.event.data, "stage_attempt_id"),
      stringField(fact.event.data, "task_id"),
      stringField(fact.event.data, "revision_id"),
    ]);
    taskScopeRevisionGroups.set(key, [...(taskScopeRevisionGroups.get(key) ?? []), fact]);
  }
  const integrationInvalidationFacts: ConstructionHistoryFact[] = [];
  for (const group of taskScopeRevisionGroups.values()) {
    const hasEnd = group.some((fact) => fact.event.type === "construction.task-scope-ended-by-revision");
    const hasReopen = group.some((fact) => fact.event.type === "construction.task-scope-reopened");
    const activitySets = new Set(group.map((fact) => JSON.stringify([...new Set(affectedActivitiesFor(fact))].sort(compareString))));
    if (hasEnd && hasReopen && activitySets.size > 1) {
      const fact = group[0];
      const unitId = fact ? factUnitId(fact) : undefined;
      addIssue({
        code: "invalid-revision-transition",
        message: "Task-scope end and reopen disagree about the affected Activity scopes",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: group.map((item) => item.event.id),
      });
    }
    if (group.some((fact) => affectedActivitiesFor(fact).includes("code-integration"))) {
      integrationInvalidationFacts.push(...group);
    }
  }
  for (const fact of order.uniqueFacts) {
    if (!validRevisionTransitions.has(fact.event.id)) continue;
    if (["construction.activity-attempt-ended-by-revision", "construction.activity-reopened"].includes(fact.event.type) &&
        fact.event.data.activity === "code-integration") {
      integrationInvalidationFacts.push(fact);
    }
    if (["construction.stage-attempt-ended-by-revision", "construction.stage-reopened"].includes(fact.event.type) &&
        fact.event.data.stage === "implementation") {
      integrationInvalidationFacts.push(fact);
    }
  }

  const validIntegrationPreparations = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.integration-prepared") continue;
    const data = fact.event.data;
    const unitId = factUnitId(fact);
    const taskId = stringField(data, "task_id");
    const stageAttemptId = stringField(data, "stage_attempt_id");
    const starts = order.uniqueFacts.filter((candidate) =>
      ["construction.activity-attempt-started", "construction.activity-resumed"].includes(candidate.event.type) &&
      sameActivityScope(candidate, fact) && hasDirectCause(fact, candidate),
    );
    const admissions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.task-admitted" && factUnitId(candidate) === unitId &&
      stringField(candidate.event.data, "task_id") === taskId &&
      stringField(candidate.event.data, "stage_attempt_id") === stageAttemptId && hasDirectCause(fact, candidate),
    );
    const sourceEvidenceIds = Array.isArray(data.source_evidence_ids) ? data.source_evidence_ids : [];
    const taskOutputRefs = Array.isArray(data.task_output_refs) ? data.task_output_refs : [];
    const sourceEvidence: ConstructionHistoryFact[] = [];
    const retainedAssessments: ConstructionHistoryFact[] = [];
    let sourcesValid = sourceEvidenceIds.length > 0 && taskOutputRefs.length > 0;
    for (const sourceEvidenceId of sourceEvidenceIds) {
      const candidates = typeof sourceEvidenceId === "string" ? evidenceById.get(sourceEvidenceId) ?? [] : [];
      const evidence = candidates.length === 1 ? candidates[0] : undefined;
      const evidenceData = evidence?.event.data;
      if (!evidence || !evidenceData) {
        sourcesValid = false;
        continue;
      }
      const result = evidenceData.result;
      const retained = order.uniqueFacts.filter((candidate) => {
        if (candidate.event.type !== "construction.retained-scope-assessed" || factUnitId(candidate) !== unitId ||
            stringField(candidate.event.data, "stage_attempt_id") !== stageAttemptId) return false;
        const assessments = Array.isArray(candidate.event.data.assessments) ? candidate.event.data.assessments : [];
        return assessments.some((assessment) => isRecord(assessment) && assessment.applicable === true &&
          assessment.task_id === taskId && (assessment.activity === undefined || assessment.activity === "code-validation") &&
          Array.isArray(assessment.original_evidence_ids) && assessment.original_evidence_ids.includes(sourceEvidenceId)) &&
          hasDirectCause(fact, candidate);
      });
      retainedAssessments.push(...retained);
      const sameAttempt = stringField(evidenceData, "stage_attempt_id") === stageAttemptId;
      if (factUnitId(evidence) !== unitId || stringField(evidenceData, "task_id") !== taskId ||
          stringField(evidenceData, "activity") !== "code-validation" || !isRecord(result) || result.status !== "passed" ||
          (!sameAttempt && retained.length === 0) || !hasDirectCause(fact, evidence)) {
        sourcesValid = false;
        continue;
      }
      const evidenceId = stringField(evidenceData, "evidence_id");
      const validationCompleted = order.uniqueFacts.some((candidate) =>
        candidate.event.type === "construction.activity-attempt-completed" &&
        stringField(candidate.event.data, "task_id") === taskId &&
        stringField(candidate.event.data, "activity") === "code-validation" &&
        stringField(candidate.event.data, "activity_attempt_id") === stringField(evidenceData, "activity_attempt_id") &&
        stringField(candidate.event.data, "stage_attempt_id") === stringField(evidenceData, "stage_attempt_id") &&
        Array.isArray(candidate.event.data.evidence_ids) && candidate.event.data.evidence_ids.includes(evidenceId) &&
        validCompletionEvents.has(candidate.event.id) && hasDirectCause(fact, candidate),
      );
      if (!validationCompleted) sourcesValid = false;
      sourceEvidence.push(evidence);
    }
    const producedOutputs = new Set(sourceEvidence.flatMap((evidence) =>
      Array.isArray(evidence.event.data.output_refs)
        ? evidence.event.data.output_refs.filter((reference): reference is string => typeof reference === "string")
        : [],
    ));
    if (!taskOutputRefs.every((reference) => typeof reference === "string" && producedOutputs.has(reference))) {
      sourcesValid = false;
    }
    if (starts.length === 0 || (admissions.length === 0 && retainedAssessments.length === 0) || !sourcesValid) {
      addIssue({
        code: "invalid-integration-binding",
        message: "Integration preparation lacks its attempt, admission or retained assessment, and validated output causes",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: [fact.event.id, ...starts.map((item) => item.event.id), ...admissions.map((item) => item.event.id),
          ...retainedAssessments.map((item) => item.event.id), ...sourceEvidence.map((item) => item.event.id)],
      });
      continue;
    }
    validIntegrationPreparations.add(fact.event.id);
  }

  const validIntegrationAcceptances = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.integration-accepted") continue;
    const data = fact.event.data;
    const preparedId = stringField(data, "prepared_event_id");
    const prepared = preparedId ? factsById.get(preparedId) : undefined;
    const linked = prepared !== undefined && prepared.event.type === "construction.integration-prepared" &&
      validIntegrationPreparations.has(prepared.event.id) && sameActivityScope(prepared, fact) && fact.event.caused_by.includes(prepared.event.id) &&
      order.hasPath(prepared.event.id, fact.event.id) &&
      checkpointKey(prepared.event.data.candidate_checkpoints) === checkpointKey(data.candidate_checkpoints);
    if (!linked) {
      const unitId = factUnitId(fact);
      addIssue({
        code: "invalid-integration-binding",
        message: "Integration acceptance does not preserve its prepared attempt and candidate bindings",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: [fact.event.id, ...(prepared ? [prepared.event.id] : [])],
      });
      continue;
    }
    const repositoryResults = Array.isArray(data.repository_results) ? data.repository_results : [];
    const candidates = Array.isArray(data.candidate_checkpoints) ? data.candidate_checkpoints.filter(isRecord) : [];
    const authorityEventIds = Array.isArray(data.authority_event_ids) ? data.authority_event_ids : [];
    let resultsValid = repositoryResults.length === candidates.length && authorityEventIds.every((eventId) =>
      typeof eventId === "string" && fact.event.caused_by.some((cause) => cause === eventId) &&
      factsById.has(eventId) && order.hasPath(eventId, fact.event.id),
    );
    const resultRepositories = new Set<string>();
    for (const result of repositoryResults) {
      if (!isRecord(result) || typeof result.repository_id !== "string" || !Array.isArray(result.evidence_ids) ||
          result.evidence_ids.length === 0 || resultRepositories.has(result.repository_id)) {
        resultsValid = false;
        continue;
      }
      resultRepositories.add(result.repository_id);
      const candidate = candidates.find((checkpoint) => checkpoint.repository_id === result.repository_id);
      if (!candidate) resultsValid = false;
      for (const evidenceId of result.evidence_ids) {
        const matches = typeof evidenceId === "string" ? evidenceById.get(evidenceId) ?? [] : [];
        const evidence = matches.length === 1 ? matches[0] : undefined;
        const covered = evidence !== undefined && Array.isArray(evidence.event.data.checkpoints) &&
          evidence.event.data.checkpoints.some((checkpoint) => isRecord(checkpoint) &&
            checkpoint.repository_id === result.repository_id && checkpoint.commit === candidate?.commit);
        if (!evidence || !covered || !sameActivityScope(evidence, fact) || !evidenceBindingMatches(evidence, fact, true, order.uniqueFacts, order.hasPath) ||
            !fact.event.caused_by.includes(evidence.event.id) || !order.hasPath(evidence.event.id, fact.event.id)) {
          resultsValid = false;
        }
      }
    }
    if (!resultsValid) {
      const unitId = factUnitId(fact);
      addIssue({
        code: "invalid-integration-binding",
        message: "Integration acceptance references evidence outside its accepted attempt or cause chain",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: [fact.event.id],
      });
      continue;
    }
    validIntegrationAcceptances.add(fact.event.id);
  }

  const integrationAcceptanceFollowsReopen = (
    acceptance: ConstructionHistoryFact,
    reopening: ConstructionHistoryFact,
  ): boolean => {
    const preparedId = stringField(acceptance.event.data, "prepared_event_id");
    const prepared = preparedId ? factsById.get(preparedId) : undefined;
    if (!prepared || prepared.event.type !== "construction.integration-prepared") return false;
    const startsAfterReopen = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.activity-attempt-started" &&
      sameActivityScope(candidate, acceptance) &&
      order.hasPath(reopening.event.id, candidate.event.id),
    );
    return order.uniqueFacts.some((candidate) =>
      ["construction.activity-attempt-started", "construction.activity-resumed"].includes(candidate.event.type) &&
      sameActivityScope(candidate, acceptance) &&
      order.hasPath(reopening.event.id, candidate.event.id) &&
      startsAfterReopen.some((start) => start.event.id === candidate.event.id || order.hasPath(start.event.id, candidate.event.id)) &&
      hasDirectCause(prepared, candidate),
    );
  };
  const integrationAcceptanceIsCurrentAt = (
    acceptance: ConstructionHistoryFact,
    boundary?: ConstructionHistoryFact,
    includeLaterInvalidations = false,
  ): boolean => {
    if (!validIntegrationAcceptances.has(acceptance.event.id)) return false;
    const invalidations = integrationInvalidationFacts.filter((fact) =>
      factUnitId(fact) === factUnitId(acceptance) &&
      (stringField(fact.event.data, "task_id") === undefined ||
        stringField(fact.event.data, "task_id") === stringField(acceptance.event.data, "task_id")) &&
      stringField(fact.event.data, "stage_attempt_id") === stringField(acceptance.event.data, "stage_attempt_id") &&
      (includeLaterInvalidations || boundary === undefined || order.hasPath(fact.event.id, boundary.event.id)),
    );
    const latestInvalidations = invalidations.filter((candidate) =>
      !invalidations.some((other) => other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id)),
    );
    if (latestInvalidations.length === 0) return true;
    return latestInvalidations.length === 1 &&
      ["construction.task-scope-reopened", "construction.activity-reopened"].includes(latestInvalidations[0]?.event.type ?? "") &&
      integrationAcceptanceFollowsReopen(acceptance, latestInvalidations[0]);
  };
  const retainedIntegrationAssessmentApplies = (
    acceptance: ConstructionHistoryFact,
    predecessor: Record<string, unknown>,
    consumerStageAttemptId: string,
    boundary: ConstructionHistoryFact,
    includeLaterInvalidations = false,
  ): boolean => {
    if (!validIntegrationAcceptances.has(acceptance.event.id) ||
        stringField(acceptance.event.data, "task_id") !== predecessor.task_id) return false;
    const repositoryResults = Array.isArray(acceptance.event.data.repository_results) ? acceptance.event.data.repository_results : [];
    const requiredEvidenceIds = repositoryResults.flatMap((result) =>
      isRecord(result) && Array.isArray(result.evidence_ids)
        ? result.evidence_ids.filter((evidenceId): evidenceId is string => typeof evidenceId === "string")
        : [],
    );
    if (requiredEvidenceIds.length === 0) return false;
    const invalidations = integrationInvalidationFacts.filter((fact) =>
      factUnitId(fact) === factUnitId(acceptance) &&
      (stringField(fact.event.data, "task_id") === undefined ||
        stringField(fact.event.data, "task_id") === stringField(acceptance.event.data, "task_id")) &&
      stringField(fact.event.data, "stage_attempt_id") === stringField(acceptance.event.data, "stage_attempt_id") &&
      (includeLaterInvalidations || order.hasPath(fact.event.id, boundary.event.id)),
    );
    return order.uniqueFacts.some((assessmentFact) => {
      if (assessmentFact.event.type !== "construction.retained-scope-assessed" ||
          factUnitId(assessmentFact) !== factUnitId(acceptance) ||
          stringField(assessmentFact.event.data, "stage_attempt_id") !== consumerStageAttemptId ||
          !order.hasPath(assessmentFact.event.id, boundary.event.id) ||
          !hasDirectCause(assessmentFact, acceptance) ||
          invalidations.some((fact) => !order.hasPath(fact.event.id, assessmentFact.event.id))) return false;
      if (boundary.event.type === "construction.task-admitted" && !hasDirectCause(boundary, assessmentFact)) return false;
      const currentImplementationStart = order.uniqueFacts.some((fact) =>
        ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type) &&
        factUnitId(fact) === factUnitId(acceptance) && stringField(fact.event.data, "stage") === "implementation" &&
        stringField(fact.event.data, "stage_attempt_id") === consumerStageAttemptId &&
        hasDirectCause(assessmentFact, fact),
      );
      if (!currentImplementationStart) return false;
      const assessments = Array.isArray(assessmentFact.event.data.assessments) ? assessmentFact.event.data.assessments : [];
      return assessments.some((assessment) => {
        if (!isRecord(assessment) || assessment.applicable !== true || assessment.task_id !== predecessor.task_id ||
            assessment.activity !== "code-integration" ||
            assessment.original_stage_attempt_id !== stringField(acceptance.event.data, "stage_attempt_id") ||
            assessment.original_activity_attempt_id !== stringField(acceptance.event.data, "activity_attempt_id") ||
            !Array.isArray(assessment.original_evidence_ids) ||
            checkpointKey(assessment.checkpoints) !== checkpointKey(acceptance.event.data.candidate_checkpoints) ||
            checkpointKey(predecessor.checkpoints) !== checkpointKey(acceptance.event.data.candidate_checkpoints)) return false;
        const originalEvidenceIds = assessment.original_evidence_ids.filter((evidenceId): evidenceId is string => typeof evidenceId === "string");
        return requiredEvidenceIds.every((evidenceId) => originalEvidenceIds.includes(evidenceId));
      });
    });
  };
  const currentIntegrationAcceptances = new Set<string>();
  for (const acceptanceId of validIntegrationAcceptances) {
    const acceptance = factsById.get(acceptanceId);
    if (acceptance && integrationAcceptanceIsCurrentAt(acceptance)) currentIntegrationAcceptances.add(acceptanceId);
  }

  const validTaskAdmissions = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.task-admitted") continue;
    const data = fact.event.data;
    const unitId = factUnitId(fact);
    const stageAttemptId = stringField(data, "stage_attempt_id");
    const related: ConstructionHistoryFact[] = [];
    const implementationStarts = order.uniqueFacts.filter((candidate) =>
      ["construction.stage-attempt-started", "construction.stage-resumed"].includes(candidate.event.type) &&
      factUnitId(candidate) === unitId && stringField(candidate.event.data, "stage") === "implementation" &&
      stringField(candidate.event.data, "stage_attempt_id") === stageAttemptId,
    );
    const start = implementationStarts.find((candidate) => hasDirectCause(fact, candidate));
    if (!start) related.push(...implementationStarts);
    const baselines = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.unit-baseline-selected" && factUnitId(candidate) === unitId,
    );
    const baseline = baselines.length === 1 && baselines[0] && hasDirectCause(fact, baselines[0]) &&
      checkpointKey(data.admission_baseline) === checkpointKey(baselines[0].event.data.review_baseline)
      ? baselines[0]
      : undefined;
    if (!baseline) related.push(...baselines);
    const predecessorProvenance = Array.isArray(data.predecessor_provenance) ? data.predecessor_provenance : [];
    let dependenciesValid = true;
    for (const predecessor of predecessorProvenance) {
      if (!isRecord(predecessor) || typeof predecessor.integration_event_id !== "string") {
        dependenciesValid = false;
        continue;
      }
      const accepted = factsById.get(predecessor.integration_event_id);
      const currentParentAcceptance = accepted !== undefined && accepted.event.type === "construction.integration-accepted" &&
        stringField(accepted.event.data, "stage_attempt_id") === stageAttemptId && integrationAcceptanceIsCurrentAt(accepted, fact);
      const retainedAcceptance = accepted !== undefined && accepted.event.type === "construction.integration-accepted" &&
        stageAttemptId !== undefined && retainedIntegrationAssessmentApplies(accepted, predecessor, stageAttemptId, fact);
      if (!accepted || (!currentParentAcceptance && !retainedAcceptance) ||
          accepted.event.type !== "construction.integration-accepted" || factUnitId(accepted) !== unitId ||
          stringField(accepted.event.data, "task_id") !== predecessor.task_id ||
          checkpointKey(predecessor.checkpoints) !== checkpointKey(accepted.event.data.candidate_checkpoints) ||
          !hasDirectCause(fact, accepted)) {
        dependenciesValid = false;
        if (accepted) related.push(accepted);
      }
    }
    const prerequisiteEvidence = Array.isArray(data.prerequisite_evidence) ? data.prerequisite_evidence : [];
    for (const evidenceId of prerequisiteEvidence) {
      const candidates = typeof evidenceId === "string" ? evidenceById.get(evidenceId) ?? [] : [];
      const evidence = candidates.length === 1 ? candidates[0] : undefined;
      const result = evidence?.event.data.result;
      if (!evidence || factUnitId(evidence) !== unitId || !isRecord(result) || result.status !== "passed" ||
          !hasDirectCause(fact, evidence)) {
        dependenciesValid = false;
        related.push(...candidates);
      }
    }
    if (start && baseline && dependenciesValid) {
      validTaskAdmissions.add(fact.event.id);
      continue;
    }
    addIssue({
      code: "invalid-task-admission",
      message: "Task admission lacks its current Implementation start, unit baseline, or validated predecessor evidence causes",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...related.map((cause) => cause.event.id)],
    });
  }

  const candidateTaskAdmissions = new Set(validTaskAdmissions);
  const integrationAcceptanceUsableAt = (
    acceptance: ConstructionHistoryFact,
    predecessor: Record<string, unknown>,
    consumerStageAttemptId: string,
    boundary: ConstructionHistoryFact,
    includeLaterInvalidations = false,
    visited: ReadonlySet<string> = new Set(),
  ): boolean => {
    if (visited.has(acceptance.event.id)) return false;
    const nextVisited = new Set(visited);
    nextVisited.add(acceptance.event.id);
    const parentAcceptance = stringField(acceptance.event.data, "stage_attempt_id") === consumerStageAttemptId &&
      integrationAcceptanceIsCurrentAt(acceptance, boundary, includeLaterInvalidations);
    if (parentAcceptance) {
      const preparedId = stringField(acceptance.event.data, "prepared_event_id");
      const prepared = preparedId ? factsById.get(preparedId) : undefined;
      const relatedAdmissions = prepared ? order.uniqueFacts.filter((candidate) =>
        candidate.event.type === "construction.task-admitted" && factUnitId(candidate) === factUnitId(acceptance) &&
        stringField(candidate.event.data, "task_id") === stringField(acceptance.event.data, "task_id") &&
        stringField(candidate.event.data, "stage_attempt_id") === stringField(acceptance.event.data, "stage_attempt_id") &&
        hasDirectCause(prepared, candidate),
      ) : [];
      if (relatedAdmissions.length === 0) return true;
      if (relatedAdmissions.some((candidate) => candidateTaskAdmissions.has(candidate.event.id) &&
          taskAdmissionDependenciesCurrentAt(candidate, boundary, includeLaterInvalidations, nextVisited))) return true;
    }
    const retained = retainedIntegrationAssessmentApplies(acceptance, predecessor, consumerStageAttemptId, boundary,
      includeLaterInvalidations);
    if (!retained) return false;
    const preparedId = stringField(acceptance.event.data, "prepared_event_id");
    const prepared = preparedId ? factsById.get(preparedId) : undefined;
    const relatedAdmissions = prepared ? order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.task-admitted" && factUnitId(candidate) === factUnitId(acceptance) &&
      stringField(candidate.event.data, "task_id") === stringField(acceptance.event.data, "task_id") &&
      stringField(candidate.event.data, "stage_attempt_id") === stringField(acceptance.event.data, "stage_attempt_id") &&
      hasDirectCause(prepared, candidate),
    ) : [];
    return relatedAdmissions.length === 0 || relatedAdmissions.some((candidate) => candidateTaskAdmissions.has(candidate.event.id) &&
      taskAdmissionDependenciesCurrentAt(candidate, boundary, includeLaterInvalidations, nextVisited));
  };
  const taskAdmissionDependenciesCurrentAt = (
    admission: ConstructionHistoryFact,
    boundary: ConstructionHistoryFact,
    includeLaterInvalidations = false,
    visited: ReadonlySet<string> = new Set(),
  ): boolean => {
    const boundaryStageAttemptId = stringField(boundary.event.data, "stage_attempt_id");
    const predecessorProvenance = Array.isArray(admission.event.data.predecessor_provenance)
      ? admission.event.data.predecessor_provenance
      : [];
    return predecessorProvenance.every((predecessor) => {
      if (!isRecord(predecessor) || typeof predecessor.integration_event_id !== "string" ||
          boundaryStageAttemptId === undefined) return false;
      const accepted = factsById.get(predecessor.integration_event_id);
      if (!accepted || accepted.event.type !== "construction.integration-accepted" ||
          factUnitId(accepted) !== factUnitId(admission) || stringField(accepted.event.data, "task_id") !== predecessor.task_id ||
          checkpointKey(predecessor.checkpoints) !== checkpointKey(accepted.event.data.candidate_checkpoints) ||
          !hasDirectCause(admission, accepted)) return false;
      return integrationAcceptanceUsableAt(accepted, predecessor, boundaryStageAttemptId, boundary,
        includeLaterInvalidations, visited);
    });
  };
  for (const admissionId of candidateTaskAdmissions) {
    const admission = factsById.get(admissionId);
    if (admission && !taskAdmissionDependenciesCurrentAt(admission, admission)) {
      validTaskAdmissions.delete(admissionId);
      const unitId = factUnitId(admission);
      addIssue({
        code: "invalid-task-admission",
        message: "Task admission uses a predecessor whose accepted Integration is invalid for its admission boundary",
        scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
        eventIds: [admission.event.id, ...(Array.isArray(admission.event.data.predecessor_provenance)
          ? admission.event.data.predecessor_provenance.flatMap((predecessor) =>
            isRecord(predecessor) && typeof predecessor.integration_event_id === "string"
              ? [predecessor.integration_event_id]
              : [],
          )
          : [])],
      });
    }
  }
  const implementationParentCurrentAt = (boundary: ConstructionHistoryFact): boolean => {
    const unitId = factUnitId(boundary);
    const boundaryStageAttemptId = stringField(boundary.event.data, "stage_attempt_id");
    if (!unitId || !boundaryStageAttemptId) return false;
    let activeParent: string | undefined;
    let parentState: ConstructionProjectedStageState = "not_started";
    const seenParentIds = new Set<string>();
    for (const fact of order.ordered) {
      if (factUnitId(fact) !== unitId || stringField(fact.event.data, "stage") !== "implementation" ||
          !order.hasPath(fact.event.id, boundary.event.id)) continue;
      const stageAttemptId = stringField(fact.event.data, "stage_attempt_id");
      if (fact.event.type === "construction.stage-attempt-started") {
        if (stageAttemptId && activeParent === undefined && ["not_started", "reopened"].includes(parentState) &&
            !seenParentIds.has(stageAttemptId)) {
          activeParent = stageAttemptId;
          seenParentIds.add(stageAttemptId);
          parentState = "running";
        }
      } else if (fact.event.type === "construction.stage-resumed") {
        if (stageAttemptId === activeParent && ["paused", "waiting"].includes(parentState)) parentState = "running";
      } else if (fact.event.type === "construction.stage-waiting" && stageAttemptId === activeParent &&
          activeStates.has(parentState as ConstructionStageActivityState)) {
        parentState = "waiting";
      } else if (fact.event.type === "construction.stage-pause-requested" && stageAttemptId === activeParent &&
          activeStates.has(parentState as ConstructionStageActivityState)) {
        parentState = "pausing";
      } else if (fact.event.type === "construction.stage-paused" && stageAttemptId === activeParent && parentState === "pausing") {
        parentState = "paused";
      } else if (fact.event.type === "construction.stage-attempt-ended-by-revision" &&
          validRevisionTransitions.has(fact.event.id) && stageAttemptId === activeParent) {
        parentState = "ended_by_revision";
      } else if (fact.event.type === "construction.stage-attempt-completed" &&
          validCompletionEvents.has(fact.event.id) && stageAttemptId === activeParent) {
        parentState = "completed";
      } else if (fact.event.type === "construction.stage-reopened" && validRevisionTransitions.has(fact.event.id) &&
          (stageAttemptId === undefined ? parentState === "ended_by_revision" : stageAttemptId === activeParent)) {
        activeParent = undefined;
        parentState = "reopened";
      }
    }
    return activeParent === boundaryStageAttemptId && parentState === "running";
  };
  const validActivityStarts = new Set<string>();
  const staleActivityStarts = new Set<string>();
  const invalidActivityParentTransitions = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (!["construction.activity-attempt-started", "construction.activity-resumed"].includes(fact.event.type) ||
        implementationParentCurrentAt(fact)) continue;
    invalidActivityParentTransitions.add(fact.event.id);
    if (fact.event.type === "construction.activity-attempt-started") staleActivityStarts.add(fact.event.id);
    const unitId = factUnitId(fact);
    addIssue({
      code: "invalid-revision-transition",
      message: "Activity start or resume targets an Implementation parent that is no longer open",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...order.uniqueFacts.filter((candidate) => factUnitId(candidate) === unitId &&
        stringField(candidate.event.data, "stage_attempt_id") === stringField(fact.event.data, "stage_attempt_id") &&
        ["construction.stage-attempt-ended-by-revision", "construction.stage-attempt-completed",
          "construction.stage-reopened"].includes(candidate.event.type)).map((candidate) => candidate.event.id)],
    });
  }
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.activity-attempt-started" || invalidActivityParentTransitions.has(fact.event.id)) continue;
    const data = fact.event.data;
    const unitId = factUnitId(fact);
    const taskId = stringField(data, "task_id");
    const stageAttemptId = stringField(data, "stage_attempt_id");
    const activity = stringField(data, "activity");
    const admissions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.task-admitted" && validTaskAdmissions.has(candidate.event.id) &&
      factUnitId(candidate) === unitId && stringField(candidate.event.data, "task_id") === taskId &&
      stringField(candidate.event.data, "stage_attempt_id") === stageAttemptId,
    );
    const admissionCauses = admissions.filter((candidate) => hasDirectCause(fact, candidate));
    const admitted = admissionCauses.some((candidate) => taskAdmissionDependenciesCurrentAt(candidate, fact));
    const retainedAssessments = order.uniqueFacts.filter((candidate) => {
      if (candidate.event.type !== "construction.retained-scope-assessed" || factUnitId(candidate) !== unitId ||
          stringField(candidate.event.data, "stage_attempt_id") !== stageAttemptId) return false;
      const assessments = Array.isArray(candidate.event.data.assessments) ? candidate.event.data.assessments : [];
      return assessments.some((assessment) => isRecord(assessment) && assessment.applicable === true &&
        assessment.task_id === taskId && (assessment.activity === undefined || assessment.activity === activity));
    });
    const retained = retainedAssessments.some((candidate) => hasDirectCause(fact, candidate));
    if (admitted || (admissionCauses.length === 0 && retained)) {
      validActivityStarts.add(fact.event.id);
      continue;
    }
    if (admissionCauses.length > 0) {
      staleActivityStarts.add(fact.event.id);
      continue;
    }
    addIssue({
      code: "invalid-activity-start",
      message: "Activity start lacks its applicable task admission or retained-input assessment cause",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...admissions.map((cause) => cause.event.id), ...retainedAssessments.map((cause) => cause.event.id)],
    });
  }

  const activityWorkCurrentAt = (boundary: ConstructionHistoryFact): boolean => {
    if (!implementationParentCurrentAt(boundary)) return false;
    const starts = order.uniqueFacts.filter((fact) =>
      fact.event.type === "construction.activity-attempt-started" && validActivityStarts.has(fact.event.id) &&
      sameActivityScope(fact, boundary) && (fact.event.id === boundary.event.id || order.hasPath(fact.event.id, boundary.event.id)),
    );
    return starts.some((start) => {
      const admissions = order.uniqueFacts.filter((fact) =>
        fact.event.type === "construction.task-admitted" && validTaskAdmissions.has(fact.event.id) &&
        factUnitId(fact) === factUnitId(boundary) &&
        stringField(fact.event.data, "task_id") === stringField(boundary.event.data, "task_id") &&
        order.hasPath(fact.event.id, start.event.id),
      );
      return admissions.length === 0 || admissions.some((admission) => taskAdmissionDependenciesCurrentAt(admission, boundary));
    });
  };

  const currentIntegrationPreparations = new Set<string>();
  for (const preparationId of validIntegrationPreparations) {
    const preparation = factsById.get(preparationId);
    if (!preparation) continue;
    const taskId = stringField(preparation.event.data, "task_id");
    const admissions = order.uniqueFacts.filter((candidate) =>
      candidate.event.type === "construction.task-admitted" && validTaskAdmissions.has(candidate.event.id) &&
      factUnitId(candidate) === factUnitId(preparation) && stringField(candidate.event.data, "task_id") === taskId &&
      hasDirectCause(preparation, candidate) && order.hasPath(candidate.event.id, preparation.event.id),
    );
    if (activityWorkCurrentAt(preparation) &&
        admissions.some((admission) => taskAdmissionDependenciesCurrentAt(admission, preparation))) {
      currentIntegrationPreparations.add(preparationId);
    }
  }
  for (const acceptanceId of [...currentIntegrationAcceptances]) {
    const acceptance = factsById.get(acceptanceId);
    const preparationId = acceptance ? stringField(acceptance.event.data, "prepared_event_id") : undefined;
    const preparation = preparationId ? factsById.get(preparationId) : undefined;
    const admissionCurrent = acceptance !== undefined && preparation !== undefined && order.uniqueFacts.some((candidate) =>
      candidate.event.type === "construction.task-admitted" && validTaskAdmissions.has(candidate.event.id) &&
      factUnitId(candidate) === factUnitId(acceptance) &&
      stringField(candidate.event.data, "task_id") === stringField(acceptance.event.data, "task_id") &&
      hasDirectCause(preparation, candidate) && order.hasPath(candidate.event.id, acceptance.event.id) &&
      activityWorkCurrentAt(acceptance) && taskAdmissionDependenciesCurrentAt(candidate, acceptance, true),
    );
    if (!acceptance || !preparation || !currentIntegrationPreparations.has(preparation.event.id) || !admissionCurrent) {
      currentIntegrationAcceptances.delete(acceptanceId);
    }
  }

  const taskAdmissionDependenciesCurrentNow = (admission: ConstructionHistoryFact): boolean =>
    taskAdmissionDependenciesCurrentAt(admission, admission, true);

  const unitIds = [...new Set(history.events.flatMap((record) =>
    record.missionId === history.missionId && record.scope.unitId ? [record.scope.unitId] : [],
  ))].sort(compareString);
  const units: ConstructionUnitProjection[] = [];
  for (const unitId of unitIds) {
    const scope = { missionId: history.missionId, unitId };
    const unitFacts = order.uniqueFacts.filter((fact) => fact.event.data.mission_id === history.missionId && factUnitId(fact) === unitId);
    const orderedUnitFacts = order.ordered.filter((fact) => fact.event.data.mission_id === history.missionId && factUnitId(fact) === unitId);
    const unitProjectionIssues: ConstructionProjectionIssue[] = projectionIssues.filter((issue) => issue.scope.unitId === unitId);
    const report = (issue: ConstructionProjectionIssue): void => {
      addIssue(issue);
      if (issue.scope.unitId === unitId) unitProjectionIssues.push(issue);
    };
    const creationFacts = unitFacts.filter((fact) => fact.event.type === "construction.unit-created");
    if (creationFacts.length === 0) {
      report({ code: "unit-creation-missing", message: "History does not establish this unit's creation", scope, eventIds: [] });
    } else if (creationFacts.length > 1) {
      report({ code: "unit-creation-conflict", message: "History contains more than one unit-creation fact", scope, eventIds: creationFacts.map((fact) => fact.event.id) });
    }
    const created = creationFacts.length === 1 ? creationFacts[0] : undefined;
    const taskIds = [...new Set(unitFacts.flatMap((fact) => {
      const id = stringField(fact.event.data, "task_id");
      return id ? [id] : [];
    }))].sort(compareString);
    const taskProjections: ConstructionTaskProjection[] = [];
    for (const taskId of taskIds) {
      const taskFacts = orderedUnitFacts.filter((fact) => stringField(fact.event.data, "task_id") === taskId);
      const directFacts = taskFacts.filter((fact) => [
        "construction.task-admitted",
        "construction.task-scope-ended-by-revision",
        "construction.task-scope-reopened",
        "construction.task-completed",
      ].includes(fact.event.type) &&
        (!revisionTransitionTypes.has(fact.event.type) || validRevisionTransitions.has(fact.event.id)));
      const admissions: ConstructionHistoryFact[] = [];
      const completions: ConstructionHistoryFact[] = [];
      let taskState: ConstructionProjectedTaskState = "unknown";
      let taskStageAttemptId: StageAttemptId | undefined;
      let admission: ConstructionHistoryFact | undefined;
      let completion: ConstructionHistoryFact | undefined;
      for (const fact of directFacts) {
        const data = fact.event.data;
        if (fact.event.type === "construction.task-admitted") {
          admissions.push(fact);
          if (validTaskAdmissions.has(fact.event.id)) {
            admission = fact;
            completion = undefined;
            taskStageAttemptId = stringField(data, "stage_attempt_id") as StageAttemptId | undefined;
            taskState = "admitted";
          } else {
            taskState = "unknown";
          }
        } else if (fact.event.type === "construction.task-completed") {
          completions.push(fact);
          const integrationId = stringField(data, "integration_event_id");
          const accepted = integrationId ? factsById.get(integrationId) : undefined;
          const matchingAcceptance = accepted !== undefined && validIntegrationAcceptances.has(accepted.event.id) &&
            accepted.event.type === "construction.integration-accepted" &&
            stringField(accepted.event.data, "unit_id") === unitId &&
            stringField(accepted.event.data, "task_id") === taskId &&
            stringField(accepted.event.data, "stage_attempt_id") === stringField(data, "stage_attempt_id") &&
            fact.event.caused_by.includes(accepted.event.id) && order.hasPath(accepted.event.id, fact.event.id);
          const staleIntegration = matchingAcceptance && !currentIntegrationAcceptances.has(accepted.event.id);
          if (staleIntegration) continue;
          if (matchingAcceptance && currentIntegrationAcceptances.has(accepted.event.id) &&
              taskStageAttemptId === stringField(data, "stage_attempt_id")) {
            taskState = "complete";
            completion = fact;
          } else if (taskStageAttemptId === stringField(data, "stage_attempt_id")) {
            report({
              code: "invalid-task-completion",
              message: "Task completion does not reference an accepted Integration result for its current attempt",
              scope,
              eventIds: [fact.event.id, ...(accepted ? [accepted.event.id] : [])],
            });
            taskState = "unknown";
            completion = undefined;
          }
        } else {
          const parent = stringField(data, "stage_attempt_id");
          if (taskStageAttemptId !== undefined && parent !== taskStageAttemptId) continue;
          taskStageAttemptId = parent as StageAttemptId | undefined;
          completion = undefined;
          taskState = fact.event.type === "construction.task-scope-reopened" ? "reopened" : "blocked";
        }
      }
      const invalidatedPredecessor = admission !== undefined && !taskAdmissionDependenciesCurrentNow(admission);
      if (admission && invalidatedPredecessor) {
        taskState = "blocked";
        completion = undefined;
      }
      const activityProjections: ConstructionActivityProjection[] = [];
      for (const activity of CONSTRUCTION_ACTIVITIES) {
        const activityFacts = orderedUnitFacts.filter((fact) =>
          stringField(fact.event.data, "task_id") === taskId && stringField(fact.event.data, "activity") === activity ||
          ["construction.task-scope-ended-by-revision", "construction.task-scope-reopened"].includes(fact.event.type) &&
            stringField(fact.event.data, "task_id") === taskId && Array.isArray(fact.event.data.affected_activities) &&
            fact.event.data.affected_activities.includes(activity) ||
          ["construction.stage-attempt-started", "construction.stage-resumed", "construction.stage-attempt-ended-by-revision",
            "construction.stage-reopened"].includes(fact.event.type) && fact.event.data.stage === "implementation",
        );
        const activityTransitions = activityFacts.filter((fact) => {
          if (transitionFor(fact, "activity", activity) === undefined) return false;
          if (invalidActivityParentTransitions.has(fact.event.id)) return false;
          if (fact.event.type === "construction.activity-attempt-started" && !validActivityStarts.has(fact.event.id)) return false;
          const staleStart = [...staleActivityStarts].some((startId) => {
            const start = factsById.get(startId);
            return start !== undefined && sameActivityScope(start, fact) &&
              (start.event.id === fact.event.id || order.hasPath(start.event.id, fact.event.id));
          });
          if (staleStart) return false;
          if (!["construction.stage-attempt-started", "construction.stage-resumed", "construction.stage-attempt-ended-by-revision",
            "construction.stage-reopened", "construction.task-scope-ended-by-revision",
            "construction.task-scope-reopened", "construction.activity-attempt-ended-by-revision", "construction.activity-reopened"].includes(fact.event.type) &&
              fact.event.data.activity === activity && !activityWorkCurrentAt(fact)) return false;
          if (revisionTransitionTypes.has(fact.event.type) && !validRevisionTransitions.has(fact.event.id)) return false;
          return fact.event.type !== "construction.activity-attempt-completed" || validCompletionEvents.has(fact.event.id);
        });
        const reduced = reduceAttemptScope(activityTransitions, "activity", unitId, report, activity);
        const currentAttempt = reduced.currentAttemptId
          ? reduced.attempts.find((attempt) => attempt.attemptId === reduced.currentAttemptId)
          : undefined;
        activityProjections.push({
          activity,
          state: reduced.state,
          currentAttemptId: reduced.currentAttemptId as ActivityAttemptId | undefined,
          stageAttemptId: currentAttempt?.stageAttemptId,
          attempts: reduced.attempts.map((attempt) => ({
            attemptId: attempt.attemptId as ActivityAttemptId,
            stageAttemptId: attempt.stageAttemptId,
            state: attempt.state,
            facts: attempt.facts,
          })),
          facts: activityFacts,
          prepared: activityFacts.filter((fact) => fact.event.type === "construction.integration-prepared"),
          accepted: activityFacts.filter((fact) => fact.event.type === "construction.integration-accepted" && validIntegrationAcceptances.has(fact.event.id)),
        });
      }
      const activeActivities = activityProjections.filter((activity) =>
        activity.stageAttemptId === taskStageAttemptId && activeStates.has(activity.state as ConstructionStageActivityState),
      );
      if (activeActivities.length > 1) {
        report({
          code: "multiple-active-attempts",
          message: "More than one Activity is active for one task scope",
          scope,
          eventIds: activeActivities.flatMap((activity) => activity.attempts
            .filter((attempt) => activeStates.has(attempt.state as ConstructionStageActivityState))
            .flatMap((attempt) => attempt.facts.slice(0, 1).map((fact) => fact.event.id))),
        });
        taskState = "unknown";
      } else if (activeActivities.length === 1 && taskState !== "complete" && taskState !== "blocked") {
        const active = activeActivities[0];
        if (active) {
          if (active.state !== "running") taskState = "waiting";
          else if (active.activity === "code-generation") taskState = "generating";
          else if (active.activity === "code-validation") taskState = "validating";
          else taskState = "integrating";
        }
      }
      if (!admissions.some((fact) => validTaskAdmissions.has(fact.event.id))) {
        report({ code: "attempt-transition-without-start", message: "Task activity history has no validated admission", scope, eventIds: taskFacts.map((fact) => fact.event.id) });
        taskState = "unknown";
      }
      taskProjections.push({
        taskId: taskId as TaskId,
        state: taskState,
        stageAttemptId: taskStageAttemptId,
        admission,
        admissions,
        completion,
        activities: activityProjections,
        facts: taskFacts,
      });
    }

    const stageProjections: ConstructionStageProjection[] = [];
    for (const stage of CONSTRUCTION_STAGES) {
      const stageFacts = orderedUnitFacts.filter((fact) => stringField(fact.event.data, "stage") === stage &&
        transitionFor(fact, "stage") !== undefined &&
        (!revisionTransitionTypes.has(fact.event.type) || validRevisionTransitions.has(fact.event.id)) &&
        (fact.event.type !== "construction.stage-attempt-completed" || validCompletionEvents.has(fact.event.id)));
      const reduced = reduceAttemptScope(stageFacts, "stage", unitId, report);
      stageProjections.push({
        stage,
        state: reduced.state,
        currentAttemptId: reduced.currentAttemptId as StageAttemptId | undefined,
        attempts: reduced.attempts.map((attempt) => ({
          attemptId: attempt.attemptId as StageAttemptId,
          state: attempt.state,
          facts: attempt.facts,
        })),
        facts: stageFacts,
      });
    }

    const evidence = unitFacts.filter((fact) => fact.event.type === "construction.evidence-recorded");
    const approvals = unitFacts.filter((fact) => fact.event.type === "construction.approval-recorded");
    const effortStateKey = JSON.stringify([unitId, "effort"]);
    const effortAmbiguous = projectionIssues.some((issue) =>
      issue.scope.unitId === unitId && issue.code === "unordered-transitions" && issue.eventIds.some((id) =>
        transitionGroups.get(effortStateKey)?.some((fact) => fact.event.id === id),
      ),
    );
    let effort: ConstructionEffortProjection | undefined;
    if (created && !effortAmbiguous) {
      const initial = created.event.data.initial_effort;
      if (isRecord(initial) && isRecord(initial.stage_overrides) &&
          (initial.default === "minimal" || initial.default === "standard" || initial.default === "comprehensive") &&
          typeof initial.selected_by === "string") {
        let defaultLevel: EffortLevel = initial.default;
        let defaultSelectedBy = initial.selected_by;
        const overrides: Partial<Record<ConstructionStage, { readonly level: EffortLevel; readonly selectedBy: string }>> = {};
        for (const stage of CONSTRUCTION_STAGES) {
          const level = initial.stage_overrides[stage];
          if (level === "minimal" || level === "standard" || level === "comprehensive") {
            overrides[stage] = { level, selectedBy: initial.selected_by };
          }
        }
        for (const fact of orderedUnitFacts) {
          if (fact.event.type !== "construction.interaction-recorded" || !isRecord(fact.event.data.effort_selection)) continue;
          const selection = fact.event.data.effort_selection;
          if (typeof selection.selected_by !== "string") continue;
          if (selection.target === "unit" && selection.action === "set" &&
              (selection.level === "minimal" || selection.level === "standard" || selection.level === "comprehensive")) {
            defaultLevel = selection.level;
            defaultSelectedBy = selection.selected_by;
          } else if (selection.target === "stage" && typeof selection.stage === "string" &&
              CONSTRUCTION_STAGES.includes(selection.stage as ConstructionStage)) {
            if (selection.action === "inherit") delete overrides[selection.stage as ConstructionStage];
            else if (selection.action === "set" &&
                (selection.level === "minimal" || selection.level === "standard" || selection.level === "comprehensive")) {
              overrides[selection.stage as ConstructionStage] = { level: selection.level, selectedBy: selection.selected_by };
            }
          }
        }
        const effectiveByStage = Object.fromEntries(CONSTRUCTION_STAGES.map((stage) => [
          stage,
          overrides[stage]?.level ?? defaultLevel,
        ])) as Record<ConstructionStage, EffortLevel>;
        effort = { default: { level: defaultLevel, selectedBy: defaultSelectedBy }, stageOverrides: overrides, effectiveByStage };
      }
    }
    const baselineFacts = orderedUnitFacts.filter((fact) => fact.event.type === "construction.unit-baseline-selected");
    const baselineKey = JSON.stringify([unitId, "baseline"]);
    const baselineAmbiguous = projectionIssues.some((issue) =>
      issue.scope.unitId === unitId && issue.code === "unordered-transitions" && issue.eventIds.some((id) =>
        transitionGroups.get(baselineKey)?.some((fact) => fact.event.id === id),
      ),
    );
    const baseline = baselineAmbiguous || isHistoryScopeBlocked(history, scope) ? undefined : baselineFacts[0];
    if (baselineFacts.length > 1) {
      report({
        code: "duplicate-unit-baseline",
        message: "The unit Review baseline was selected more than once; preserve the first selection",
        scope,
        eventIds: baselineFacts.map((fact) => fact.event.id),
      });
    }
    const historyIssuesForUnit = historyIssues.filter((issue) =>
      issue.scope.missionId === history.missionId && (issue.scope.unitId === undefined || issue.scope.unitId === unitId),
    );
    const initialized = created !== undefined;
    const blocked = isHistoryScopeBlocked(history, scope) || unitProjectionIssues.length > 0 || !initialized;
    const completedStageCount = stageProjections.filter((stage) => stage.state === "completed").length;
    const completedTaskCount = taskProjections.filter((task) => task.state === "complete").length;
    const finalStages = blocked
      ? stageProjections.map((stage) => ({ ...stage, state: "unknown" as const }))
      : stageProjections;
    const finalTasks = blocked
      ? taskProjections.map((task) => ({
        ...task,
        state: "unknown" as const,
        activities: task.activities.map((activity) => ({ ...activity, state: "unknown" as const })),
      }))
      : taskProjections;
    units.push({
      missionId: history.missionId,
      unitId,
      initialized,
      blocked,
      historyIssues: historyIssuesForUnit,
      projectionIssues: unitProjectionIssues,
      created,
      workflow: created?.event.data.workflow === "standard" ? "standard" : undefined,
      effort: blocked ? undefined : effort,
      baseline,
      stages: finalStages,
      tasks: finalTasks,
      evidence: evidence.sort(compareFacts).map(boundRecord),
      approvals: approvals.sort(compareFacts).map(boundRecord),
      interactions: unitFacts.filter((fact) => fact.event.type === "construction.interaction-recorded").sort(compareFacts),
      revisions: unitFacts.filter((fact) => fact.event.type === "construction.revision-authorized").sort(compareFacts),
      retainedScopeAssessments: unitFacts.filter((fact) => fact.event.type === "construction.retained-scope-assessed").sort(compareFacts),
      completionAssessments: unitFacts.filter((fact) => fact.event.type === "construction.implementation-completion-assessed").sort(compareFacts),
      progress: {
        completedStages: blocked ? 0 : completedStageCount,
        totalStages: CONSTRUCTION_STAGES.length,
        completedTasks: blocked ? 0 : completedTaskCount,
        knownTasks: blocked ? 0 : taskProjections.length,
        reliable: !blocked,
      },
    });
  }
  const globalHistoryBlocked = history.blockedScopes.some((scope) =>
    scope.missionId === history.missionId && scope.unitId === undefined,
  ) || projectionIssues.some((issue) => issue.scope.missionId === history.missionId && issue.scope.unitId === undefined);
  const sortedProjectionIssues = [...projectionIssues].sort((left, right) =>
    compareString(left.scope.unitId ?? "", right.scope.unitId ?? "") || compareString(left.code, right.code) ||
    compareString(left.eventIds.join("\u0000"), right.eventIds.join("\u0000")),
  );
  return {
    missionId: history.missionId,
    blocked: globalHistoryBlocked,
    historyIssues,
    projectionIssues: sortedProjectionIssues,
    units,
  };
};