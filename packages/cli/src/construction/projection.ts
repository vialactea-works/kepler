import {
  CONSTRUCTION_ACTIVITIES,
  CONSTRUCTION_STAGES,
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
    | "invalid-task-completion";
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
  readonly action: "start" | "resume" | "update" | "reopen";
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

const transitionFor = (fact: ConstructionHistoryFact, scope: "stage" | "activity"): Transition | undefined => {
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
): AttemptScopeResult => {
  let state: ConstructionProjectedStageState = "not_started";
  let currentAttemptId: string | undefined;
  let currentStageAttemptId: StageAttemptId | undefined;
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
    const transition = transitionFor(fact, scope);
    if (!transition) continue;
    if (transition.action === "reopen") {
      const active = currentAttemptId ? attempts.get(currentAttemptId) : undefined;
      if (active && activeStates.has(active.state as ConstructionStageActivityState)) {
        addIssue("invalid-attempt-transition", "A scope reopened while its current attempt remained unended", fact, active.facts[0]);
      }
      state = "reopened";
      currentAttemptId = undefined;
      currentStageAttemptId = undefined;
      continue;
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
      if (current && activeStates.has(current.state as ConstructionStageActivityState)) {
        addIssue("multiple-active-attempts", "A second attempt started while another attempt remained active", fact, current.facts[0]);
        current.state = "unknown";
        state = "unknown";
      } else if (current && terminalStates.has(current.state as ConstructionStageActivityState) && state !== "reopened") {
        addIssue("invalid-attempt-transition", "A replacement attempt started without a recorded reopen", fact, current.facts[0]);
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
  const checkpointsMatch = sourceCheckpoints.every((sourceCheckpoint) => targetCheckpoints.some((targetCheckpoint) =>
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
  const validCompletionEvents = new Set<string>();
  for (const fact of order.uniqueFacts) {
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
    const checkpointCoverage = checkpoints.every((checkpoint) => validEvidence.some((evidence) =>
      Array.isArray(evidence.event.data.checkpoints) && evidence.event.data.checkpoints.some((evidenceCheckpoint) =>
        isRecord(evidenceCheckpoint) && evidenceCheckpoint.repository_id === checkpoint.repository_id &&
        evidenceCheckpoint.commit === checkpoint.commit,
      ),
    ));
    if (!checkpointCoverage) evidenceValid = false;
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
    const latestBaselines = baselines.filter((candidate) => !baselines.some((other) =>
      other.event.id !== candidate.event.id && order.hasPath(candidate.event.id, other.event.id),
    ));
    const baseline = latestBaselines.length === 1 && latestBaselines[0] && hasDirectCause(fact, latestBaselines[0]) &&
      checkpointKey(data.admission_baseline) === checkpointKey(latestBaselines[0].event.data.review_baseline)
      ? latestBaselines[0]
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
      if (!accepted || !validIntegrationAcceptances.has(accepted.event.id) ||
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

  const validActivityStarts = new Set<string>();
  for (const fact of order.uniqueFacts) {
    if (fact.event.type !== "construction.activity-attempt-started") continue;
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
    const admitted = admissions.some((candidate) => hasDirectCause(fact, candidate));
    const retainedAssessments = order.uniqueFacts.filter((candidate) => {
      if (candidate.event.type !== "construction.retained-scope-assessed" || factUnitId(candidate) !== unitId ||
          stringField(candidate.event.data, "stage_attempt_id") !== stageAttemptId) return false;
      const assessments = Array.isArray(candidate.event.data.assessments) ? candidate.event.data.assessments : [];
      return assessments.some((assessment) => isRecord(assessment) && assessment.applicable === true &&
        assessment.task_id === taskId && (assessment.activity === undefined || assessment.activity === activity));
    });
    const retained = retainedAssessments.some((candidate) => hasDirectCause(fact, candidate));
    if (admitted || retained) {
      validActivityStarts.add(fact.event.id);
      continue;
    }
    addIssue({
      code: "invalid-activity-start",
      message: "Activity start lacks its applicable task admission or retained-input assessment cause",
      scope: unitId ? { missionId: history.missionId, unitId } : { missionId: history.missionId },
      eventIds: [fact.event.id, ...admissions.map((cause) => cause.event.id), ...retainedAssessments.map((cause) => cause.event.id)],
    });
  }

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
          if (matchingAcceptance && taskStageAttemptId === stringField(data, "stage_attempt_id")) {
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
          taskState = fact.event.type === "construction.task-scope-reopened" ? "reopened" : "blocked";
        }
      }
      const activityProjections: ConstructionActivityProjection[] = [];
      for (const activity of CONSTRUCTION_ACTIVITIES) {
        const activityFacts = taskFacts.filter((fact) => stringField(fact.event.data, "activity") === activity);
        const activityTransitions = activityFacts.filter((fact) => {
          if (transitionFor(fact, "activity") === undefined) return false;
          if (fact.event.type === "construction.activity-attempt-started" && !validActivityStarts.has(fact.event.id)) return false;
          if (revisionTransitionTypes.has(fact.event.type) && !validRevisionTransitions.has(fact.event.id)) return false;
          return fact.event.type !== "construction.activity-attempt-completed" || validCompletionEvents.has(fact.event.id);
        });
        const reduced = reduceAttemptScope(activityTransitions, "activity", unitId, report);
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
    const baseline = baselineAmbiguous ? undefined : baselineFacts.at(-1);
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
      baseline: blocked ? undefined : baseline,
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