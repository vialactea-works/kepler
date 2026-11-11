import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditHistoryReadResult } from "../audit/context.js";
import type { EventJournal } from "../history/journal.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ConstructionEventRecord,
  type RepositoryCheckpoint,
} from "./events.js";
import type { ConstructionHistoryFact, ConstructionTaskProjection } from "./projection.js";
import type { StageStartRuntime } from "./stage-start.js";

export interface TaskCompletionRuntime extends StageStartRuntime {
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type TaskCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isCheckpoints = (value: unknown): value is readonly RepositoryCheckpoint[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.repository_id === "string" && typeof item.commit === "string") &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const sameStringMultiset = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && JSON.stringify([...left].sort((a, b) => a.localeCompare(b))) ===
  JSON.stringify([...right].sort((a, b) => a.localeCompare(b)));
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported task completion condition and retry without changing accepted Integration history.",
): TaskCompletionResult => ({ kind: "failed", code, message, details, recovery });

export const recordTaskCompletionUnderControl = async (
  runtime: TaskCompletionRuntime,
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  task: ConstructionTaskProjection,
  parentStart: ConstructionHistoryFact,
  admission: ConstructionHistoryFact,
  accepted: ConstructionHistoryFact,
  activityCompletionId: EventId,
  activityCompletionJournalId: string,
  acceptanceCriteria: readonly string[],
  additionalCauses: readonly EventId[] = [],
  activityCompletionCandidate?: ConstructionEventRecord,
): Promise<TaskCompletionResult> => {
  if (accepted.event.type !== "construction.integration-accepted") {
    return failure("integration_acceptance_required", "Task completion requires a typed accepted Integration result.");
  }
  if (parentStart.event.type !== "construction.stage-attempt-started" && parentStart.event.type !== "construction.stage-resumed") {
    return failure("task_completion_parent_invalid", "Task completion requires the current Implementation parent start.");
  }
  if (admission.event.type !== "construction.task-admitted" || admission.event.data.task_id !== task.taskId ||
      admission.event.data.stage_attempt_id !== parentStart.event.data.stage_attempt_id) {
    return failure("task_completion_admission_invalid", "Task completion requires the exact current-parent task admission.", {
      task_id: task.taskId, parent_attempt_id: parentStart.event.data.stage_attempt_id,
    });
  }
  const acceptedData = accepted.event.data;
  const acceptedActivityAttemptId = acceptedData.activity_attempt_id;
  const acceptedStageAttemptId = acceptedData.stage_attempt_id;
  const candidateCheckpoints = acceptedData.candidate_checkpoints;
  const currentStageAttemptId = parentStart.event.data.stage_attempt_id;
  if (typeof acceptedActivityAttemptId !== "string" || typeof acceptedStageAttemptId !== "string" ||
      typeof currentStageAttemptId !== "string" || !isCheckpoints(candidateCheckpoints)) {
    return failure("integration_acceptance_invalid", "The accepted Integration result lacks typed task completion bindings.");
  }
  if (acceptedData.task_id !== task.taskId || acceptedData.stage !== "implementation" ||
      (acceptedStageAttemptId !== currentStageAttemptId && additionalCauses.length === 0)) {
    return failure("task_completion_scope_mismatch", "The accepted Integration must belong to this task and either the current parent or an assessed retained scope.", {
      task_id: task.taskId, accepted_stage_attempt_id: acceptedStageAttemptId, current_stage_attempt_id: currentStageAttemptId,
    });
  }
  const activityCompletion = loaded.history.events.find((record) => record.event?.id === activityCompletionId)?.event ??
    (activityCompletionCandidate?.id === activityCompletionId ? activityCompletionCandidate : undefined);
  if (!activityCompletion || activityCompletion.type !== "construction.activity-attempt-completed" ||
      activityCompletion.journal_id !== activityCompletionJournalId || activityCompletion.data.task_id !== task.taskId ||
      activityCompletion.data.activity !== "code-integration" || activityCompletion.data.stage_attempt_id !== acceptedStageAttemptId ||
      activityCompletion.data.activity_attempt_id !== acceptedActivityAttemptId ||
      !activityCompletion.caused_by.includes(accepted.event.id)) {
    return failure("task_completion_activity_binding_invalid", "The accepted Integration lacks its exact original Activity completion binding.", {
      activity_completion_event_id: activityCompletionId, integration_event_id: accepted.event.id,
    });
  }
  const records = loaded.history.events.flatMap((record) => {
    const event = record.event;
    return event?.type === "construction.task-completed" && event.data.unit_id === loaded.unit.unitId &&
      event.data.task_id === task.taskId && event.data.stage_attempt_id === currentStageAttemptId &&
      event.data.integration_event_id === accepted.event.id ? [event] : [];
  });
  const matchingExisting = records.filter((event) => {
    const conditions = event.data.conditions;
    return event.caused_by.includes(activityCompletionId) && event.caused_by.includes(parentStart.event.id) &&
      event.caused_by.includes(admission.event.id) && additionalCauses.every((id) => event.caused_by.includes(id)) &&
      Array.isArray(conditions) && conditions.every((condition) => typeof condition === "string") &&
      sameStringMultiset(conditions as string[], acceptanceCriteria);
  });
  if (records.length > 0) {
    if (records.length === 1 && matchingExisting.length === 1) return { kind: "success", data: {
      event_id: activityCompletionId, journal_id: activityCompletionJournalId, activity: "code-integration",
      activity_attempt_id: acceptedActivityAttemptId, integration_event_id: accepted.event.id,
      task_completion_event_id: records[0]!.id, checkpoints: candidateCheckpoints,
    } };
    return failure("task_completion_record_conflict", "A task completion record already exists but does not match the accepted Integration, current parent, admission, and Activity completion.", {
      task_completion_event_ids: records.map((event) => event.id), activity_completion_event_id: activityCompletionId,
    }, "Inspect the recorded task completion and preserve it; do not append a duplicate completion.");
  }
  const completedTaskId = runtime.identities.next();
  const taskCompletionJournalId = runtime.identities.next();
  const existingIdentities = new Set(loaded.history.events.flatMap((record) => record.event
    ? [String(record.event.id), String(record.event.journal_id)]
    : []));
  if (![completedTaskId, taskCompletionJournalId].every(uuidV4) || new Set([completedTaskId, taskCompletionJournalId]).size !== 2 ||
      existingIdentities.has(completedTaskId) || existingIdentities.has(taskCompletionJournalId)) {
    return failure("task_completion_identity_invalid", "Task completion event identities are invalid, reused, or already present.", {
      activity_completion_event_id: activityCompletionId,
    });
  }
  const taskCompletionEvent = {
    id: completedTaskId,
    phase: CONSTRUCTION_PHASE,
    type: "construction.task-completed",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: taskCompletionJournalId,
    recorded_at: runtime.now(),
    producer: runtime.producer,
    caused_by: [...new Set([accepted.event.id, activityCompletionId, parentStart.event.id, admission.event.id, ...additionalCauses])],
    data: {
      mission_id: loaded.missionId,
      unit_id: loaded.unit.unitId,
      stage: "implementation",
      stage_attempt_id: currentStageAttemptId,
      task_id: task.taskId,
      integration_event_id: accepted.event.id,
      conditions: acceptanceCriteria,
    },
  };
  const validation = validateConstructionEvent(taskCompletionEvent);
  if (validation.status !== "valid") return failure("task_completion_event_invalid", "The typed task completion event failed Construction validation.", {
    activity_completion_event_id: activityCompletionId,
    issues: validation.status === "invalid" ? validation.issues : [validation.reason],
  });
  const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${taskCompletionJournalId}.jsonl`);
  if (await runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return failure("task_completion_journal_identity_conflict", "The selected task completion journal identity already has a filesystem entry.", {
    journal_id: taskCompletionJournalId, activity_completion_event_id: activityCompletionId,
  });
  try {
    await runtime.journals.create(loaded.root, loaded.missionId, taskCompletionJournalId).append(validation.event);
  } catch (error) {
    return failure("task_completion_append_failed", "Activity completion was recorded, but task completion could not be durably appended.", {
      activity_completion_event_id: activityCompletionId, event_id: completedTaskId, journal_id: taskCompletionJournalId,
      message: error instanceof Error ? error.message : String(error),
    }, "Inspect history for an appended or uncertain task completion before retrying; preserve all records.");
  }
  return { kind: "success", data: {
    event_id: activityCompletionId, journal_id: activityCompletionJournalId, activity: "code-integration",
    activity_attempt_id: acceptedActivityAttemptId, integration_event_id: accepted.event.id,
    task_completion_event_id: completedTaskId, checkpoints: candidateCheckpoints,
  } };
};
