import type { AuditHistoryReadResult } from "../audit/context.js";
import type { EventId } from "@vialactea-works/kepler-core";

export interface RevisionBarrierTarget {
  readonly unitId: string;
  readonly stage?: string;
  readonly stageAttemptId?: string;
  readonly taskId?: string;
  readonly activity?: string;
  readonly activityAttemptId?: string;
}

type RevisionAffectedScope =
  | { readonly kind: "stage"; readonly stage: string; readonly prior_attempt: "present"; readonly stage_attempt_id: string }
  | { readonly kind: "stage"; readonly stage: string; readonly prior_attempt: "none" }
  | {
      readonly kind: "activity";
      readonly task_id: string;
      readonly stage_attempt_id: string;
      readonly activity: string;
      readonly prior_attempt: "present";
      readonly activity_attempt_id: string;
    }
  | {
      readonly kind: "activity";
      readonly task_id: string;
      readonly stage_attempt_id: string;
      readonly activity: string;
      readonly prior_attempt: "none";
    };

interface RevisionHistoryEvent {
  readonly id: EventId;
  readonly phase: string;
  readonly type: string;
  readonly caused_by: readonly EventId[];
  readonly data: Readonly<Record<string, unknown>>;
}

export interface PendingRevisionBarrier {
  readonly revisionId: string;
  readonly authorizationEventId: string;
  readonly affectedScopes: readonly RevisionAffectedScope[];
}

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const stringField = (event: RevisionHistoryEvent, name: string): string | undefined => {
  const value = event.data[name];
  return nonEmptyString(value) ? value : undefined;
};

const stringArrayField = (event: RevisionHistoryEvent, name: string): readonly string[] | undefined => {
  const value = event.data[name];
  return Array.isArray(value) && value.every(nonEmptyString) ? value : undefined;
};

const parseAffectedScopes = (value: unknown): readonly RevisionAffectedScope[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const scopes: RevisionAffectedScope[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
    const scope = item as Record<string, unknown>;
    const onlyFields = (fields: readonly string[]) => Object.keys(scope).every((field) => fields.includes(field));
    if (scope.kind === "stage" && nonEmptyString(scope.stage) && scope.prior_attempt === "present" &&
        nonEmptyString(scope.stage_attempt_id) && onlyFields(["kind", "stage", "prior_attempt", "stage_attempt_id"])) {
      scopes.push({ kind: "stage", stage: scope.stage, prior_attempt: "present", stage_attempt_id: scope.stage_attempt_id });
    } else if (scope.kind === "stage" && nonEmptyString(scope.stage) && scope.prior_attempt === "none" &&
        scope.stage_attempt_id === undefined && onlyFields(["kind", "stage", "prior_attempt"])) {
      scopes.push({ kind: "stage", stage: scope.stage, prior_attempt: "none" });
    } else if (scope.kind === "activity" && nonEmptyString(scope.task_id) && nonEmptyString(scope.stage_attempt_id) &&
        nonEmptyString(scope.activity) && scope.prior_attempt === "present" && nonEmptyString(scope.activity_attempt_id) &&
        onlyFields(["kind", "task_id", "stage_attempt_id", "activity", "prior_attempt", "activity_attempt_id"])) {
      scopes.push({ kind: "activity", task_id: scope.task_id, stage_attempt_id: scope.stage_attempt_id,
        activity: scope.activity, prior_attempt: "present", activity_attempt_id: scope.activity_attempt_id });
    } else if (scope.kind === "activity" && nonEmptyString(scope.task_id) && nonEmptyString(scope.stage_attempt_id) &&
        nonEmptyString(scope.activity) && scope.prior_attempt === "none" && scope.activity_attempt_id === undefined &&
        onlyFields(["kind", "task_id", "stage_attempt_id", "activity", "prior_attempt"])) {
      scopes.push({ kind: "activity", task_id: scope.task_id, stage_attempt_id: scope.stage_attempt_id,
        activity: scope.activity, prior_attempt: "none" });
    } else {
      return undefined;
    }
  }
  return scopes;
};

const factsIn = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
): readonly RevisionHistoryEvent[] => loaded.history.events.flatMap((record) => {
  const event = record.event;
  return event?.phase === "construction" ? [event as RevisionHistoryEvent] : [];
});

const hasCause = (event: RevisionHistoryEvent, cause: EventId): boolean => event.caused_by.includes(cause);

const stageTransitionsComplete = (
  events: readonly RevisionHistoryEvent[],
  authorizationEventId: EventId,
  revisionId: string,
  scope: Extract<RevisionAffectedScope, { readonly kind: "stage" }>,
): boolean => {
  if (scope.prior_attempt === "none") return true;
  const endings = events.filter((event) => event.type === "construction.stage-attempt-ended-by-revision" &&
    stringField(event, "revision_id") === revisionId && stringField(event, "stage") === scope.stage &&
    stringField(event, "stage_attempt_id") === scope.stage_attempt_id && hasCause(event, authorizationEventId));
  if (endings.length !== 1) return false;
  const ending = endings[0]!;
  const reopens = events.filter((event) => event.type === "construction.stage-reopened" &&
    stringField(event, "revision_id") === revisionId && stringField(event, "stage") === scope.stage &&
    stringField(event, "stage_attempt_id") === scope.stage_attempt_id && hasCause(event, ending.id));
  return reopens.length === 1 && hasCause(reopens[0]!, authorizationEventId) && hasCause(reopens[0]!, ending.id);
};

const taskScopeTransitionsComplete = (
  events: readonly RevisionHistoryEvent[],
  authorizationEventId: EventId,
  revisionId: string,
  taskId: string,
  stageAttemptId: string,
  activities: readonly string[],
): boolean => {
  const matchingEvents = (type: "construction.task-scope-ended-by-revision" | "construction.task-scope-reopened") =>
    events.filter((event) => event.type === type && stringField(event, "revision_id") === revisionId &&
      stringField(event, "task_id") === taskId && stringField(event, "stage_attempt_id") === stageAttemptId &&
      JSON.stringify([...(stringArrayField(event, "affected_activities") ?? [])].sort()) === JSON.stringify([...activities].sort()));
  const endings = matchingEvents("construction.task-scope-ended-by-revision").filter((event) => hasCause(event, authorizationEventId));
  if (endings.length !== 1) return false;
  const ending = endings[0]!;
  const reopens = matchingEvents("construction.task-scope-reopened").filter((event) => hasCause(event, ending.id));
  return reopens.length === 1 && hasCause(reopens[0]!, authorizationEventId) && hasCause(reopens[0]!, ending.id);
};

const directActivityTransitionsComplete = (
  events: readonly RevisionHistoryEvent[],
  authorizationEventId: EventId,
  revisionId: string,
  scope: Extract<RevisionAffectedScope, { readonly kind: "activity" }>,
): boolean => {
  if (scope.prior_attempt === "none") {
    const endings = events.filter((event) => event.type === "construction.activity-attempt-ended-by-revision" &&
      stringField(event, "revision_id") === revisionId && stringField(event, "task_id") === scope.task_id &&
      stringField(event, "stage_attempt_id") === scope.stage_attempt_id && stringField(event, "activity") === scope.activity &&
      hasCause(event, authorizationEventId));
    const reopens = events.filter((event) => event.type === "construction.activity-reopened" &&
      stringField(event, "revision_id") === revisionId && stringField(event, "task_id") === scope.task_id &&
      stringField(event, "stage_attempt_id") === scope.stage_attempt_id && stringField(event, "activity") === scope.activity &&
      event.data.activity_attempt_id === undefined && hasCause(event, authorizationEventId));
    return endings.length === 0 && reopens.length === 1;
  }
  const endings = events.filter((event) => event.type === "construction.activity-attempt-ended-by-revision" &&
    stringField(event, "revision_id") === revisionId && stringField(event, "task_id") === scope.task_id &&
    stringField(event, "stage_attempt_id") === scope.stage_attempt_id && stringField(event, "activity") === scope.activity &&
    stringField(event, "activity_attempt_id") === scope.activity_attempt_id && hasCause(event, authorizationEventId));
  if (endings.length !== 1) return false;
  const reopens = events.filter((event) => event.type === "construction.activity-reopened" &&
    stringField(event, "revision_id") === revisionId && stringField(event, "task_id") === scope.task_id &&
    stringField(event, "stage_attempt_id") === scope.stage_attempt_id && stringField(event, "activity") === scope.activity &&
    stringField(event, "activity_attempt_id") === scope.activity_attempt_id && hasCause(event, endings[0]!.id));
  return reopens.length === 1 && hasCause(reopens[0]!, authorizationEventId) && hasCause(reopens[0]!, endings[0]!.id);
};

const transitionsComplete = (
  events: readonly RevisionHistoryEvent[],
  authorizationEventId: EventId,
  revisionId: string,
  scopes: readonly RevisionAffectedScope[],
): boolean => {
  if (!scopes.every((scope) => scope.kind === "stage"
    ? stageTransitionsComplete(events, authorizationEventId, revisionId, scope)
    : true)) return false;
  const activityGroups = new Map<string, Extract<RevisionAffectedScope, { readonly kind: "activity" }>[]>();
  for (const scope of scopes) {
    if (scope.kind !== "activity") continue;
    const key = `${scope.stage_attempt_id}\0${scope.task_id}`;
    const group = activityGroups.get(key) ?? [];
    group.push(scope);
    activityGroups.set(key, group);
  }
  return [...activityGroups.values()].every((group) => {
    const first = group[0]!;
    const activities = [...new Set(group.map((scope) => scope.activity))].sort();
    return taskScopeTransitionsComplete(events, authorizationEventId, revisionId, first.task_id, first.stage_attempt_id, activities) ||
      group.every((scope) => directActivityTransitionsComplete(events, authorizationEventId, revisionId, scope));
  });
};

const scopesMatchTarget = (
  scopes: readonly RevisionAffectedScope[],
  target: RevisionBarrierTarget,
): boolean => scopes.some((scope) => {
  if (scope.kind === "stage") {
    return scope.stage === target.stage && (scope.prior_attempt === "none" ||
      target.stageAttemptId === undefined || scope.stage_attempt_id === target.stageAttemptId);
  }
  if (target.stageAttemptId !== undefined && scope.stage_attempt_id !== target.stageAttemptId) return false;
  if (target.taskId !== undefined && scope.task_id !== target.taskId) return false;
  if (target.activity !== undefined && scope.activity !== target.activity) return false;
  if (target.activityAttemptId !== undefined && scope.prior_attempt === "present" &&
      scope.activity_attempt_id !== target.activityAttemptId) return false;
  return target.stage === undefined || target.stage === "implementation";
});

export const pendingRevisionBarrierFor = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  target: RevisionBarrierTarget,
): PendingRevisionBarrier | undefined => {
  const events = factsIn(loaded);
  const authorizations = events.filter((event) => event.type === "construction.revision-authorized" && stringField(event, "unit_id") === target.unitId);
  for (const auth of authorizations) {
    const revisionId = stringField(auth, "revision_id") ?? "unknown";
    const scopes = parseAffectedScopes(auth.data.affected_scopes);
    if (!scopes || (!transitionsComplete(events, auth.id, revisionId, scopes) && scopesMatchTarget(scopes, target))) {
      return { revisionId, authorizationEventId: auth.id, affectedScopes: scopes ?? [] };
    }
  }
  return undefined;
};
