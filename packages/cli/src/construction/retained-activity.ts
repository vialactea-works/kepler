import { isRetainedScopeAssessment, type ConstructionActivity, type RepositoryCheckpoint, type RetainedScopeAssessment } from "./events.js";
import type { ConstructionHistoryFact, ConstructionUnitProjection } from "./projection.js";

export interface RetainedActivityScope {
  readonly fact: ConstructionHistoryFact;
  readonly assessment: RetainedScopeAssessment;
  readonly completion: ConstructionHistoryFact;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCheckpoints = (value: unknown): value is readonly RepositoryCheckpoint[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.repository_id === "string" && typeof item.commit === "string") &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const checkpointKey = (value: readonly RepositoryCheckpoint[]): string => JSON.stringify(
  value.slice().sort((left, right) => left.repository_id.localeCompare(right.repository_id))
    .map((checkpoint) => [checkpoint.repository_id, checkpoint.commit]),
);
const sameStringSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length &&
  [...left].sort().join("\0") === [...right].sort().join("\0");

export const retainedActivityFor = (
  unit: ConstructionUnitProjection,
  taskId: string,
  activity: ConstructionActivity,
  stageAttemptId: string,
): RetainedActivityScope | undefined => {
  const matches = unit.retainedScopeAssessments.flatMap((fact) => {
    if (fact.event.type !== "construction.retained-scope-assessed" || fact.event.data.stage_attempt_id !== stageAttemptId ||
        !Array.isArray(fact.event.data.assessments)) return [];
    return fact.event.data.assessments.filter(isRetainedScopeAssessment)
      .filter((assessment) => assessment.applicable && assessment.task_id === taskId && assessment.activity === activity)
      .map((assessment) => ({ fact, assessment }));
  });
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  const task = unit.tasks.find((item) => item.taskId === taskId);
  const activityProjection = task?.activities.find((item) => item.activity === activity);
  const attempt = activityProjection?.attempts.find((item) => item.attemptId === match.assessment.original_activity_attempt_id &&
    item.stageAttemptId === match.assessment.original_stage_attempt_id && item.state === "completed");
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed") ?? [];
  const completion = completions.length === 1 ? completions[0] : undefined;
  return completion?.event.type === "construction.activity-attempt-completed" &&
    completion.event.data.task_id === taskId && completion.event.data.activity === activity &&
    completion.event.data.activity_attempt_id === match.assessment.original_activity_attempt_id &&
    Array.isArray(completion.event.data.evidence_ids) &&
    sameStringSet(completion.event.data.evidence_ids.map(String), match.assessment.original_evidence_ids.map(String)) &&
    isCheckpoints(completion.event.data.checkpoints) && checkpointKey(completion.event.data.checkpoints) === checkpointKey(match.assessment.checkpoints) &&
    match.fact.event.caused_by.includes(completion.event.id)
    ? { ...match, completion }
    : undefined;
};
