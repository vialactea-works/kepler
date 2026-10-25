import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ConstructionActivity, ConstructionEventRecord } from "./events.js";
import type {
  ConstructionActivityAttemptProjection,
  ConstructionHistoryFact,
  ConstructionTaskProjection,
} from "./projection.js";

export type DiffPackageScope =
  | {
      readonly kind: "validation";
      readonly unitId: string;
      readonly taskId: string;
      readonly implementationAttemptId: string;
      readonly generationAttemptId: string;
    }
  | {
      readonly kind: "integration";
      readonly unitId: string;
      readonly taskId: string;
      readonly implementationAttemptId: string;
      readonly integrationAttemptId: string;
    }
  | {
      readonly kind: "unit-review";
      readonly unitId: string;
      readonly implementationAttemptId: string;
    };

export type DiffPackageCheckpoint =
  | { readonly repositoryId: string; readonly commit: string }
  | { readonly repositoryId: string; readonly noCommit: true };

export interface DiffPackageComparisonBinding {
  readonly role: string;
  readonly repositoryId: string;
  readonly base: DiffPackageCheckpoint;
  readonly target: { readonly repositoryId: string; readonly commit: string };
  readonly sourceEventIds: readonly string[];
  readonly accepted: boolean | null;
}

export interface DiffPackageWorkspaceRepositoryBinding {
  readonly repository_id: string;
  readonly context: unknown;
  readonly branch: string;
  readonly integration_target: string;
  readonly starting_checkpoint: unknown;
}

export interface DiffPackageSourceAttempt {
  readonly taskId: string;
  readonly activity: ConstructionActivity;
  readonly attemptId: string;
  readonly implementationAttemptId: string;
  readonly eventIds: readonly string[];
}

export interface DiffPackageResolvedSource {
  readonly scope: DiffPackageScope;
  readonly projectRoot: string;
  readonly missionId: string;
  readonly recordHomeRepositoryId: string;
  readonly workspaceRepositories: readonly DiffPackageWorkspaceRepositoryBinding[];
  readonly comparisons: readonly DiffPackageComparisonBinding[];
  readonly taskDefinitions: readonly ConstructionEventRecord[];
  readonly upstreamVersions: readonly ConstructionEventRecord[];
  readonly sourceAttempts: readonly DiffPackageSourceAttempt[];
  readonly activityEvidence: readonly ConstructionEventRecord[];
  readonly retainedScopes: readonly ConstructionEventRecord[];
  readonly integrationHistory: readonly ConstructionEventRecord[];
  readonly sourceRecords: readonly ConstructionEventRecord[];
}

export interface DiffPackageSourceFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type DiffPackageSourceResult =
  | { readonly kind: "resolved"; readonly source: DiffPackageResolvedSource }
  | DiffPackageSourceFailure;

const failed = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Preserve the selected Construction records and resolve the missing or ambiguous source binding before retrying.",
): DiffPackageSourceFailure => ({ kind: "failed", code, message, details, recovery });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dataOf = (event: ConstructionEventRecord): Readonly<Record<string, unknown>> => event.data;

const valueString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const workspaceRepositoryList = (value: unknown): DiffPackageWorkspaceRepositoryBinding[] | undefined => {
  if (!Array.isArray(value) || !value.every((item) => isWorkspaceRepositoryBinding(item))) return undefined;
  return value;
};

const isWorkspaceRepositoryBinding = (value: unknown): value is DiffPackageWorkspaceRepositoryBinding =>
  isRecord(value) && valueString(value.repository_id) && valueString(value.branch) &&
  valueString(value.integration_target) && value.context !== undefined && value.starting_checkpoint !== undefined;

const recordList = (value: unknown): Readonly<Record<string, unknown>>[] | undefined => {
  if (!Array.isArray(value) || !value.every(isRecord)) return undefined;
  return value;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};

const factsEvents = (facts: readonly ConstructionHistoryFact[]): ConstructionEventRecord[] =>
  facts.map((fact) => fact.event);

const eventFacts = (
  facts: readonly ConstructionHistoryFact[],
  type: ConstructionEventRecord["type"],
): ConstructionHistoryFact[] => facts.filter((fact) => fact.event.type === type);

const checkpointMap = (value: unknown): Map<string, DiffPackageCheckpoint> | DiffPackageSourceFailure => {
  if (!Array.isArray(value)) return failed("diff_package_checkpoint_set_invalid", "A recorded comparison checkpoint set is missing or invalid.");
  const result = new Map<string, DiffPackageCheckpoint>();
  for (const raw of value) {
    if (!isRecord(raw)) return failed("diff_package_checkpoint_set_invalid", "A recorded comparison contains an invalid checkpoint.");
    const repositoryId = raw.repository_id;
    if (!valueString(repositoryId) || result.has(repositoryId)) {
      return failed("diff_package_checkpoint_set_invalid", "A recorded comparison contains an empty or duplicate repository identity.", { repository_id: repositoryId });
    }
    if (raw.no_commit === true) {
      result.set(repositoryId, { repositoryId, noCommit: true });
    } else if (valueString(raw.commit)) {
      result.set(repositoryId, { repositoryId, commit: raw.commit });
    } else {
      return failed("diff_package_checkpoint_set_invalid", "A recorded comparison contains an invalid checkpoint.", { repository_id: repositoryId });
    }
  }
  return result;
};

const sameCheckpointSet = (left: unknown, right: unknown): boolean => {
  const leftMap = checkpointMap(left);
  const rightMap = checkpointMap(right);
  if (isFailure(leftMap) || isFailure(rightMap) || leftMap.size !== rightMap.size) return false;
  return [...leftMap.entries()].every(([repositoryId, checkpoint]) => {
    const candidate = rightMap.get(repositoryId);
    if (!candidate) return false;
    return "noCommit" in checkpoint
      ? "noCommit" in candidate
      : "commit" in candidate && checkpoint.commit === candidate.commit;
  });
};

const comparisonsFor = (
  role: string,
  baseSet: unknown,
  targetSet: unknown,
  sourceEventIds: readonly string[],
  workspaceRepositoryIds: readonly string[],
  accepted: boolean | null = null,
): DiffPackageComparisonBinding[] | DiffPackageSourceFailure => {
  const bases = checkpointMap(baseSet);
  if (isFailure(bases)) return bases;
  const targets = checkpointMap(targetSet);
  if (isFailure(targets)) return targets;
  const baseIds = [...bases.keys()].sort();
  const targetIds = [...targets.keys()].sort();
  if (stable(baseIds) !== stable(targetIds)) {
    return failed("diff_package_repository_set_mismatch", "The source comparison does not bind the same repository identities on both sides.", {
      role,
      base_repository_ids: baseIds,
      target_repository_ids: targetIds,
      source_event_ids: sourceEventIds,
    });
  }
  const expectedRepositoryIds = [...new Set(workspaceRepositoryIds)].sort();
  if (stable(baseIds) !== stable(expectedRepositoryIds)) {
    return failed("diff_package_repository_set_incomplete", "The source comparison does not cover every repository in the prepared workspace.", {
      role,
      expected_repository_ids: expectedRepositoryIds,
      comparison_repository_ids: baseIds,
      source_event_ids: sourceEventIds,
    });
  }
  const result: DiffPackageComparisonBinding[] = [];
  for (const repositoryId of baseIds) {
    const base = bases.get(repositoryId)!;
    const target = targets.get(repositoryId)!;
    if ("noCommit" in target) {
      return failed("diff_package_target_unborn", "A selected source target has no commit checkpoint.", { repository_id: repositoryId, role });
    }
    result.push({ role, repositoryId, base, target: { repositoryId, commit: target.commit }, sourceEventIds, accepted });
  }
  return result;
};

const activityCompletion = (attempt: ConstructionActivityAttemptProjection): ConstructionHistoryFact[] =>
  eventFacts(attempt.facts, "construction.activity-attempt-completed");

const activityStartFacts = (attempt: ConstructionActivityAttemptProjection): ConstructionHistoryFact[] =>
  attempt.facts.filter((fact) => fact.event.type === "construction.activity-attempt-started" || fact.event.type === "construction.activity-resumed");

const attemptEvents = (
  task: ConstructionTaskProjection,
  activity: ConstructionActivity,
  attemptId: string,
  implementationAttemptId: string,
): ConstructionActivityAttemptProjection | undefined => task.activities
  .find((candidate) => candidate.activity === activity)
  ?.attempts.find((candidate) => candidate.attemptId === attemptId && candidate.stageAttemptId === implementationAttemptId);

const eventIds = (events: readonly ConstructionEventRecord[]): string[] => [...new Set(events.map((event) => String(event.id)))];

const validMissionEvents = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>): ConstructionEventRecord[] =>
  loaded.history.events.flatMap((fact) => fact.constructionEvent ? [fact.constructionEvent] : []);

const uniqueByEventId = (events: readonly ConstructionEventRecord[]): ConstructionEventRecord[] => {
  const seen = new Set<string>();
  return events.filter((event) => {
    const id = String(event.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const isFailure = (value: unknown): value is DiffPackageSourceFailure =>
  typeof value === "object" && value !== null && "kind" in value && value.kind === "failed";

export class ConstructionDiffPackageSources {
  constructor(private readonly contexts: Pick<AuditContextResolver, "readUnit">) {}

  async resolve(scope: DiffPackageScope, project?: string): Promise<DiffPackageSourceResult> {
    const read = await this.contexts.readUnit(scope.unitId, project);
    if (read.kind === "failed") return read;

    const unit = read.unit;
    const implementation = unit.stages.find((stage) => stage.stage === "implementation");
    const implementationAttempts = implementation?.attempts ?? [];
    const implementationAttemptIndex = implementationAttempts.findIndex((attempt) => attempt.attemptId === scope.implementationAttemptId);
    const implementationAttempt = implementationAttempts[implementationAttemptIndex];
    if (implementationAttemptIndex < 0 || !implementationAttempt) {
      return failed("diff_package_source_attempt_not_found", "The selected Implementation source attempt does not belong to the recorded unit.", {
        unit_id: scope.unitId,
        implementation_attempt_id: scope.implementationAttemptId,
      });
    }
    const implementationAttemptOrder = new Map<string, number>(implementationAttempts.map((attempt, index) => [attempt.attemptId, index] as const));

    const events = validMissionEvents(read).filter((event) => dataOf(event).mission_id === read.missionId);
    const missionCreated = events.filter((event) => event.type === "construction.mission-created");
    const workspacePrepared = events.filter((event) => event.type === "construction.mission-workspaces-prepared");
    if (missionCreated.length !== 1 || workspacePrepared.length !== 1) {
      return failed("diff_package_workspace_binding_ambiguous", "The source mission must have one recorded creation and prepared-workspace binding.", {
        mission_id: read.missionId,
        mission_created_events: missionCreated.map((event) => event.id),
        workspace_prepared_events: workspacePrepared.map((event) => event.id),
      });
    }
    const missionData = dataOf(missionCreated[0]!);
    const recordHome = isRecord(missionData.record_home) ? missionData.record_home : undefined;
    const recordHomeRepositoryId = recordHome?.repository_id;
    const workspaceData = dataOf(workspacePrepared[0]!);
    const workspaceRepositories = workspaceRepositoryList(workspaceData.repositories);
    if (!valueString(recordHomeRepositoryId) || workspaceData.mission_id !== read.missionId || !workspaceRepositories) {
      return failed("diff_package_workspace_binding_invalid", "The selected mission's prepared repository binding is incomplete.", { mission_id: read.missionId });
    }
    const workspaceRepositoryIds = workspaceRepositories.map((repository) => repository.repository_id);
    if (new Set(workspaceRepositoryIds).size !== workspaceRepositoryIds.length) {
      return failed("diff_package_workspace_binding_invalid", "The prepared workspace contains duplicate repository identities.", {
        mission_id: read.missionId,
        repository_ids: workspaceRepositoryIds,
      });
    }

    const unitEvents = events.filter((event) => dataOf(event).unit_id === scope.unitId);
    const included = new Map<string, ConstructionEventRecord>();
    const include = (record: ConstructionEventRecord | undefined): void => {
      if (record) included.set(String(record.id), record);
    };
    const includeMany = (records: readonly ConstructionEventRecord[]): void => records.forEach(include);
    const taskDefinitions: ConstructionEventRecord[] = [];
    const upstreamVersions: ConstructionEventRecord[] = [];
    const sourceAttempts: DiffPackageSourceAttempt[] = [];
    const activityEvidence: ConstructionEventRecord[] = [];
    const retainedScopes: ConstructionEventRecord[] = [];
    const integrationHistory: ConstructionEventRecord[] = [];
    const comparisons: DiffPackageComparisonBinding[] = [];

    include(missionCreated[0]);
    include(workspacePrepared[0]);
    include(unit.created?.event);
    include(unit.baseline?.event);
    includeMany(factsEvents(implementationAttempt.facts));

    const evidenceEvents = unitEvents.filter((event) => event.type === "construction.evidence-recorded");
    const addEvidence = (ids: readonly string[]): DiffPackageSourceFailure | undefined => {
      const wanted = [...new Set(ids)];
      const missing: string[] = [];
      for (const id of wanted) {
        const matches = evidenceEvents.filter((event) => dataOf(event).evidence_id === id);
        if (matches.length !== 1) {
          missing.push(id);
          continue;
        }
        const event = matches[0]!;
        include(event);
        activityEvidence.push(event);
      }
      return missing.length === 0 ? undefined : failed("diff_package_evidence_binding_missing", "A selected source references evidence that is missing or ambiguous in the complete Construction history.", {
        evidence_ids: missing,
        unit_id: scope.unitId,
      });
    };

    const addAdmission = (task: ConstructionTaskProjection, parentAttemptId: string): ConstructionEventRecord | DiffPackageSourceFailure => {
      const matches = task.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
        dataOf(fact.event).stage_attempt_id === parentAttemptId && dataOf(fact.event).task_id === task.taskId);
      if (matches.length !== 1) return failed("diff_package_task_admission_ambiguous", "The task must have one recorded admission under the selected source Implementation attempt.", {
        unit_id: scope.unitId,
        task_id: task.taskId,
        implementation_attempt_id: parentAttemptId,
        admission_events: matches.map((fact) => fact.event.id),
      });
      const event = matches[0]!.event;
      include(event);
      taskDefinitions.push(event);
      upstreamVersions.push(event);
      const admission = dataOf(event);
      const predecessors = recordList(admission.predecessor_provenance) ?? [];
      for (const predecessor of predecessors) {
        const integrationEventId = predecessor.integration_event_id;
        const predecessorEvent = events.find((candidate) => String(candidate.id) === String(integrationEventId));
        if (!predecessorEvent || predecessorEvent.type !== "construction.integration-accepted") {
          return failed("diff_package_upstream_integration_missing", "A recorded task prerequisite names an unavailable Integration event.", {
            task_id: task.taskId,
            integration_event_id: integrationEventId,
          });
        }
        include(predecessorEvent);
        integrationHistory.push(predecessorEvent);
      }
      const prerequisites = addEvidence(stringList(admission.prerequisite_evidence));
      if (prerequisites) return prerequisites;
      return event;
    };

    const addActivity = (
      task: ConstructionTaskProjection,
      activity: ConstructionActivity,
      attempt: ConstructionActivityAttemptProjection,
      options: { readonly completionRequired?: boolean } = {},
    ): { readonly events: ConstructionEventRecord[]; readonly completions: ConstructionEventRecord[] } | DiffPackageSourceFailure => {
      const attemptEventRecords = factsEvents(attempt.facts);
      includeMany(attemptEventRecords);
      sourceAttempts.push({
        taskId: task.taskId,
        activity,
        attemptId: attempt.attemptId,
        implementationAttemptId: String(attempt.stageAttemptId ?? ""),
        eventIds: eventIds(attemptEventRecords),
      });
      const completionFacts = activityCompletion(attempt);
      const completionRequired = options.completionRequired ?? true;
      if ((completionRequired && completionFacts.length !== 1) || (!completionRequired && completionFacts.length > 1)) {
        return failed("diff_package_activity_completion_ambiguous", completionRequired
          ? "A selected source Activity attempt must have one completed checkpoint record."
          : "A selected source Activity attempt has multiple completed checkpoint records.", {
          task_id: task.taskId,
          activity,
          activity_attempt_id: attempt.attemptId,
          completion_events: completionFacts.map((fact) => fact.event.id),
        });
      }
      const completions = completionFacts.map((fact) => fact.event);
      for (const completion of completions) {
        const missingEvidence = addEvidence(stringList(dataOf(completion).evidence_ids));
        if (missingEvidence) return missingEvidence;
      }
      const startRecords = activityStartFacts(attempt).map((fact) => fact.event);
      if (startRecords.length === 0) {
        return failed("diff_package_activity_start_missing", "The selected source Activity has no recorded start or resume binding.", {
          task_id: task.taskId,
          activity,
          activity_attempt_id: attempt.attemptId,
        });
      }
      upstreamVersions.push(...startRecords);
      return { events: attemptEventRecords, completions };
    };

    const addComparison = (
      role: string,
      base: unknown,
      target: unknown,
      sourceEventIds: readonly string[],
      accepted: boolean | null = null,
    ): DiffPackageSourceFailure | undefined => {
      const found = comparisonsFor(role, base, target, sourceEventIds, workspaceRepositoryIds, accepted);
      if (isFailure(found)) return found;
      comparisons.push(...found);
      return undefined;
    };

    const addGenerationForValidation = (
      task: ConstructionTaskProjection,
      validationAttempt: ConstructionActivityAttemptProjection,
    ): DiffPackageSourceFailure | undefined => {
      const validationParentId = validationAttempt.stageAttemptId;
      if (!valueString(validationParentId)) return failed("diff_package_validation_parent_missing", "The selected Validation attempt has no recorded Implementation parent.", {
        task_id: task.taskId,
        validation_attempt_id: validationAttempt.attemptId,
      });
      const starts = activityStartFacts(validationAttempt).filter((fact) => fact.event.type === "construction.activity-attempt-started");
      if (starts.length !== 1) return failed("diff_package_validation_start_ambiguous", "A selected Validation attempt must have one original start event for resolving its Generation source.", {
        task_id: task.taskId,
        validation_attempt_id: validationAttempt.attemptId,
        start_events: starts.map((fact) => fact.event.id),
      });
      const start = starts[0]!.event;
      const startData = dataOf(start);
      const routes: {
        readonly stageAttemptId: string;
        readonly activityAttemptId: string;
        readonly completionEventId?: string;
        readonly retainedEvent?: ConstructionEventRecord;
        readonly retainedAssessment?: Readonly<Record<string, unknown>>;
      }[] = [];
      for (const causedBy of start.caused_by) {
        const cause = unitEvents.find((event) => String(event.id) === String(causedBy));
        if (!cause) continue;
        const causeData = dataOf(cause);
        if (cause.type === "construction.activity-attempt-completed" && causeData.activity === "code-generation" &&
            causeData.task_id === task.taskId && causeData.stage_attempt_id === validationParentId &&
            valueString(causeData.activity_attempt_id)) {
          routes.push({
            stageAttemptId: validationParentId,
            activityAttemptId: causeData.activity_attempt_id,
            completionEventId: String(cause.id),
          });
        }
        if (cause.type !== "construction.retained-scope-assessed" || causeData.unit_id !== scope.unitId ||
            causeData.stage_attempt_id !== validationParentId) continue;
        for (const assessment of recordList(causeData.assessments) ?? []) {
          if (assessment.task_id !== task.taskId || assessment.activity !== "code-generation" || assessment.applicable !== true ||
              !sameCheckpointSet(assessment.checkpoints, startData.checkpoints) ||
              !valueString(assessment.original_stage_attempt_id) || !valueString(assessment.original_activity_attempt_id)) continue;
          routes.push({
            stageAttemptId: assessment.original_stage_attempt_id,
            activityAttemptId: assessment.original_activity_attempt_id,
            retainedEvent: cause,
            retainedAssessment: assessment,
          });
        }
      }
      if (routes.length !== 1) return failed(routes.length === 0 ? "diff_package_generation_source_missing" : "diff_package_generation_source_ambiguous",
        routes.length === 0 ? "The selected Validation attempt does not have one recorded current or retained Generation source." : "The selected Validation attempt has multiple recorded Generation source routes.", {
          task_id: task.taskId,
          validation_attempt_id: validationAttempt.attemptId,
          generation_routes: routes.map((route) => ({
            implementation_attempt_id: route.stageAttemptId,
            generation_attempt_id: route.activityAttemptId,
            retained_assessment_event_id: route.retainedEvent?.id,
          })),
        });
      const route = routes[0]!;
      const generation = attemptEvents(task, "code-generation", route.activityAttemptId, route.stageAttemptId);
      if (!generation) return failed("diff_package_upstream_activity_missing", "The selected Validation attempt's recorded Generation source is unavailable under its original Implementation parent.", {
        task_id: task.taskId,
        generation_attempt_id: route.activityAttemptId,
        implementation_attempt_id: route.stageAttemptId,
      });
      const added = addActivity(task, "code-generation", generation);
      if (isFailure(added)) return added;
      const completion = added.completions.find((event) =>
        route.completionEventId !== undefined
          ? String(event.id) === route.completionEventId
          : route.retainedAssessment !== undefined && sameCheckpointSet(dataOf(event).checkpoints, route.retainedAssessment.checkpoints) &&
            stable([...stringList(dataOf(event).evidence_ids)].sort()) === stable([...stringList(route.retainedAssessment.original_evidence_ids)].sort()));
      if (!completion) return failed("diff_package_generation_source_mismatch", "The selected Validation attempt's Generation source differs from its recorded current or retained checkpoint binding.", {
        task_id: task.taskId,
        generation_attempt_id: route.activityAttemptId,
        implementation_attempt_id: route.stageAttemptId,
        generation_completion_events: added.completions.map((event) => event.id),
        retained_assessment_event_id: route.retainedEvent?.id,
      });
      const admission = addAdmission(task, route.stageAttemptId);
      if (isFailure(admission)) return admission;
      if (route.retainedEvent) {
        include(route.retainedEvent);
        retainedScopes.push(route.retainedEvent);
      }
      const comparisonFailure = addComparison(
        "task-admission-to-generation-output",
        dataOf(admission).admission_baseline,
        dataOf(completion).checkpoints,
        [String(admission.id), String(completion.id), ...(route.retainedEvent ? [String(route.retainedEvent.id)] : [])],
      );
      return comparisonFailure;
    };

    const addIntegrationAttempt = (
      task: ConstructionTaskProjection,
      attempt: ConstructionActivityAttemptProjection,
    ): DiffPackageSourceFailure | undefined => {
      const attemptRecords = uniqueByEventId([
        ...factsEvents(attempt.facts),
        ...unitEvents.filter((event) => (event.type === "construction.integration-prepared" || event.type === "construction.integration-accepted") &&
          dataOf(event).stage_attempt_id === attempt.stageAttemptId && dataOf(event).task_id === task.taskId &&
          dataOf(event).activity_attempt_id === attempt.attemptId),
      ]);
      const prepared = attemptRecords.filter((event) => event.type === "construction.integration-prepared")
        .map((event) => ({ event, data: dataOf(event) }));
      const accepted = attemptRecords.filter((event) => event.type === "construction.integration-accepted")
        .map((event) => ({ event, data: dataOf(event) }));
      if (prepared.length === 0) {
        return failed("diff_package_integration_preparation_missing", "The selected Integration attempt has no recorded prepared candidate.", {
          task_id: task.taskId,
          integration_attempt_id: attempt.attemptId,
        });
      }
      const preparedIds = new Set(prepared.map((item) => String(item.event.id)));
      for (const item of accepted) {
        const preparedEventId = item.data.prepared_event_id;
        if (!valueString(preparedEventId) || !preparedIds.has(preparedEventId)) {
          return failed("diff_package_integration_candidate_missing", "An accepted Integration record references a preparation outside the selected attempt.", {
            integration_attempt_id: attempt.attemptId,
            prepared_event_id: preparedEventId,
          });
        }
        const selected = prepared.find((candidate) => String(candidate.event.id) === preparedEventId);
        if (!selected || !sameCheckpointSet(selected.data.candidate_checkpoints, item.data.candidate_checkpoints)) {
          return failed("diff_package_integration_candidate_mismatch", "The accepted Integration checkpoint set differs from its recorded prepared candidate.", {
            integration_attempt_id: attempt.attemptId,
            prepared_event_id: preparedEventId,
            accepted_event_id: item.event.id,
          });
        }
      }
      const acceptedByPrepared = new Map(accepted.map((item) => [String(item.data.prepared_event_id), item.event]));
      const taskSourceEvidenceIds = new Set<string>();
      for (const item of prepared) {
        include(item.event);
        integrationHistory.push(item.event);
        upstreamVersions.push(item.event);
        const acceptedEvent = acceptedByPrepared.get(String(item.event.id));
        if (acceptedEvent) {
          include(acceptedEvent);
          integrationHistory.push(acceptedEvent);
        }
        const comparisonFailure = addComparison(
          "integration-captured-input-to-candidate",
          item.data.captured_inputs,
          item.data.candidate_checkpoints,
          [String(item.event.id), ...(acceptedEvent ? [String(acceptedEvent.id)] : [])],
          acceptedEvent ? true : null,
        );
        if (comparisonFailure) return comparisonFailure;
        stringList(item.data.source_evidence_ids).forEach((evidenceId) => taskSourceEvidenceIds.add(evidenceId));
      }
      const taskEvidenceFailure = addEvidence([...taskSourceEvidenceIds]);
      if (taskEvidenceFailure) return taskEvidenceFailure;
      const sourceAttempts = new Map<string, {
        readonly activity: "code-generation" | "code-validation";
        readonly attemptId: string;
        readonly implementationAttemptId: string;
      }>();
      for (const evidenceId of taskSourceEvidenceIds) {
        const evidence = evidenceEvents.find((event) => dataOf(event).evidence_id === evidenceId);
        if (!evidence || (dataOf(evidence).activity !== "code-generation" && dataOf(evidence).activity !== "code-validation")) continue;
        const activity = dataOf(evidence).activity as "code-generation" | "code-validation";
        const attemptId = dataOf(evidence).activity_attempt_id;
        const implementationAttemptId = dataOf(evidence).stage_attempt_id;
        if (!valueString(attemptId) || !valueString(implementationAttemptId)) continue;
        sourceAttempts.set(JSON.stringify([activity, attemptId, implementationAttemptId]), { activity, attemptId, implementationAttemptId });
      }
      for (const binding of sourceAttempts.values()) {
        const sourceAttempt = attemptEvents(task, binding.activity, binding.attemptId, binding.implementationAttemptId);
        if (!sourceAttempt) {
          return failed("diff_package_upstream_activity_missing", "Integration evidence names a Generation or Validation attempt that cannot be resolved under its recorded parent.", {
            task_id: task.taskId,
            activity: binding.activity,
            activity_attempt_id: binding.attemptId,
            implementation_attempt_id: binding.implementationAttemptId,
          });
        }
        const added = addActivity(task, binding.activity, sourceAttempt);
        if (isFailure(added)) return added;
        const admission = addAdmission(task, binding.implementationAttemptId);
        if (isFailure(admission)) return admission;
        const completion = added.completions[0]!;
        const sourceAdmissionData = dataOf(admission);
        const completionData = dataOf(completion);
        const role = binding.activity === "code-generation" ? "task-admission-to-generation-output" : "task-admission-to-validation-output";
        const comparisonFailure = addComparison(role, sourceAdmissionData.admission_baseline, completionData.checkpoints, [String(admission.id), String(completion.id)]);
        if (comparisonFailure) return comparisonFailure;
        if (binding.activity === "code-validation") {
          const generationFailure = addGenerationForValidation(task, sourceAttempt);
          if (generationFailure) return generationFailure;
        }
      }
      return undefined;
    };

    if (scope.kind === "validation" || scope.kind === "integration") {
      const task = unit.tasks.find((candidate) => candidate.taskId === scope.taskId);
      if (!task) return failed("diff_package_task_not_found", "The selected task does not belong to the recorded unit.", { unit_id: scope.unitId, task_id: scope.taskId });
      const admission = addAdmission(task, scope.implementationAttemptId);
      if (isFailure(admission)) return admission;
      if (scope.kind === "validation") {
        const generation = attemptEvents(task, "code-generation", scope.generationAttemptId, scope.implementationAttemptId);
        if (!generation) {
          return failed("diff_package_generation_attempt_mismatch", "The selected Generation attempt does not belong to the selected task and Implementation source attempt.", {
            unit_id: scope.unitId,
            task_id: scope.taskId,
            implementation_attempt_id: scope.implementationAttemptId,
            generation_attempt_id: scope.generationAttemptId,
          });
        }
        const generated = addActivity(task, "code-generation", generation);
        if (isFailure(generated)) return generated;
        const generationCompletion = generated.completions[0]!;
        const generationData = dataOf(generationCompletion);
        const admissionData = dataOf(admission);
        const comparisonFailure = addComparison(
          "validation-admission-to-generation-output",
          admissionData.admission_baseline,
          generationData.checkpoints,
          [String(admission.id), String(generationCompletion.id)],
        );
        if (comparisonFailure) return comparisonFailure;
      } else {
        const integration = task.activities.find((activity) => activity.activity === "code-integration");
        const attempt = integration?.attempts.find((candidate) => candidate.attemptId === scope.integrationAttemptId && candidate.stageAttemptId === scope.implementationAttemptId);
        if (!attempt) {
          return failed("diff_package_integration_attempt_mismatch", "The selected Integration attempt does not belong to the selected task and Implementation source attempt.", {
            unit_id: scope.unitId,
            task_id: scope.taskId,
            implementation_attempt_id: scope.implementationAttemptId,
            integration_attempt_id: scope.integrationAttemptId,
          });
        }
        const added = addActivity(task, "code-integration", attempt, { completionRequired: false });
        if (isFailure(added)) return added;
        const integrationFailure = addIntegrationAttempt(task, attempt);
        if (integrationFailure) return integrationFailure;
      }
    } else {
      if (!unit.baseline || unit.baseline.event.type !== "construction.unit-baseline-selected") {
        return failed("diff_package_review_baseline_missing", "The unit's original Review baseline is not recorded.", { unit_id: scope.unitId });
      }
      const assessments = events.filter((event) => event.type === "construction.implementation-completion-assessed" &&
        dataOf(event).unit_id === scope.unitId && dataOf(event).stage_attempt_id === scope.implementationAttemptId);
      if (assessments.length !== 1) {
        return failed("diff_package_implementation_completion_ambiguous", "The selected Implementation attempt must have one completion checkpoint assessment.", {
          unit_id: scope.unitId,
          implementation_attempt_id: scope.implementationAttemptId,
          completion_assessment_events: assessments.map((event) => event.id),
        });
      }
      const completion = assessments[0]!;
      include(completion);
      const completionData = dataOf(completion);
      const baselineData = dataOf(unit.baseline.event);
      const mainComparisonFailure = addComparison(
        "unit-review-original-baseline-to-completion",
        baselineData.review_baseline,
        completionData.final_checkpoints,
        [String(unit.baseline.event.id), String(completion.id)],
      );
      if (mainComparisonFailure) return mainComparisonFailure;
      const completionEvidenceFailure = addEvidence([
        ...stringList(completionData.self_review_evidence_id ? [completionData.self_review_evidence_id] : []),
        ...stringList(completionData.handoff_evidence_id ? [completionData.handoff_evidence_id] : []),
        ...stringList(completionData.unit_check_evidence_ids),
        ...stringList(completionData.required_check_evidence_ids),
      ]);
      if (completionEvidenceFailure) return completionEvidenceFailure;

      const reviewTaskIds = stringList(completionData.task_ids);
      for (const taskId of reviewTaskIds) {
        const task = unit.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) return failed("diff_package_review_task_missing", "The selected Implementation completion references a task missing from the Construction projection.", { task_id: taskId });
        const taskCompletionEvents: ConstructionEventRecord[] = [];
        for (const event of events) {
          const taskCompletionData = dataOf(event);
          if (event.type !== "construction.task-completed" || taskCompletionData.unit_id !== scope.unitId || taskCompletionData.task_id !== taskId) continue;
          const completionAttemptId = taskCompletionData.stage_attempt_id;
          const completionAttemptIndex = valueString(completionAttemptId) ? implementationAttemptOrder.get(completionAttemptId) : undefined;
          if (completionAttemptIndex === undefined) {
            return failed("diff_package_task_completion_attempt_missing", "A task-completion record names no Implementation attempt in the selected unit history.", {
              task_id: taskId,
              task_completion_event_id: event.id,
              implementation_attempt_id: completionAttemptId,
            });
          }
          if (completionAttemptIndex <= implementationAttemptIndex) taskCompletionEvents.push(event);
        }
        const assessmentBoundCompletions = taskCompletionEvents.filter((event) =>
          dataOf(event).stage_attempt_id === scope.implementationAttemptId && completion.caused_by.includes(event.id));
        if (assessmentBoundCompletions.length !== 1) {
          return failed("diff_package_task_completion_ambiguous", "A task included in the selected Implementation completion must have one causally bound task-completion record.", {
            task_id: taskId,
            implementation_attempt_id: scope.implementationAttemptId,
            task_completion_events: taskCompletionEvents.map((event) => event.id),
            assessment_bound_task_completion_events: assessmentBoundCompletions.map((event) => event.id),
          });
        }
        includeMany(taskCompletionEvents);
        const processedIntegrationAttempts = new Set<string>();
        const processedCandidateEvents = new Set<string>();
        for (const taskCompletionEvent of taskCompletionEvents) {
          const taskCompletionData = dataOf(taskCompletionEvent);
          const integrationEventId = taskCompletionData.integration_event_id;
          if (!valueString(integrationEventId)) {
            return failed("diff_package_task_integration_missing", "A completed task has no exact accepted Integration event binding.", {
              task_id: taskId,
              task_completion_event_id: taskCompletionEvent.id,
            });
          }
          const acceptedEvent = events.find((event) => event.type === "construction.integration-accepted" && String(event.id) === integrationEventId);
          if (!acceptedEvent || dataOf(acceptedEvent).unit_id !== scope.unitId || dataOf(acceptedEvent).task_id !== taskId ||
              !taskCompletionEvent.caused_by.includes(acceptedEvent.id)) {
            return failed("diff_package_task_integration_missing", "A task-completion record's causally bound accepted Integration event is unavailable or mismatched.", {
              task_id: taskId,
              task_completion_event_id: taskCompletionEvent.id,
              integration_event_id: integrationEventId,
            });
          }
          const acceptedData = dataOf(acceptedEvent);
          const integrationAttemptId = acceptedData.activity_attempt_id;
          const integrationParentId = acceptedData.stage_attempt_id;
          if (!valueString(integrationAttemptId) || !valueString(integrationParentId)) {
            return failed("diff_package_task_integration_attempt_missing", "The accepted Integration binding has no exact Activity attempt identity.", {
              task_id: taskId,
              integration_event_id: acceptedEvent.id,
            });
          }
          const admission = addAdmission(task, integrationParentId);
          if (isFailure(admission)) return admission;
          include(acceptedEvent);
          integrationHistory.push(acceptedEvent);
          if (!processedCandidateEvents.has(integrationEventId)) {
            const candidateComparisonFailure = addComparison(
              "task-admission-to-integrated-candidate",
              dataOf(admission).admission_baseline,
              acceptedData.candidate_checkpoints,
              [String(admission.id), String(acceptedEvent.id)],
              true,
            );
            if (candidateComparisonFailure) return candidateComparisonFailure;
            processedCandidateEvents.add(integrationEventId);
          }
          const integrationKey = JSON.stringify([integrationParentId, integrationAttemptId]);
          if (processedIntegrationAttempts.has(integrationKey)) continue;
          const integrationActivity = task.activities.find((activity) => activity.activity === "code-integration");
          const integrationAttempt = integrationActivity?.attempts.find((candidate) =>
            candidate.attemptId === integrationAttemptId && candidate.stageAttemptId === integrationParentId);
          if (!integrationAttempt) {
            return failed("diff_package_task_integration_attempt_missing", "The accepted Integration binding has no corresponding source Activity attempt.", {
              task_id: taskId,
              activity_attempt_id: integrationAttemptId,
              implementation_attempt_id: integrationParentId,
            });
          }
          const attemptAddFailure = addActivity(task, "code-integration", integrationAttempt);
          if (isFailure(attemptAddFailure)) return attemptAddFailure;
          const integrationFailure = addIntegrationAttempt(task, integrationAttempt);
          if (integrationFailure) return integrationFailure;
          processedIntegrationAttempts.add(integrationKey);
        }
      }

      const retainedIds = [...new Set(stringList(completionData.retained_assessment_event_ids))];
      for (const retainedId of retainedIds) {
        const retained = events.find((event) => event.type === "construction.retained-scope-assessed" && String(event.id) === retainedId);
        if (!retained) {
          return failed("diff_package_retained_scope_missing", "The Implementation completion references an unavailable retained-scope assessment.", { retained_assessment_event_id: retainedId });
        }
        include(retained);
        retainedScopes.push(retained);
        const retainedAssessments = recordList(dataOf(retained).assessments);
        if (!retainedAssessments) return failed("diff_package_retained_scope_invalid", "A retained-scope assessment record is malformed.", { retained_assessment_event_id: retainedId });
        for (const assessment of retainedAssessments) {
          const taskId = assessment.task_id;
          const parentAttemptId = assessment.original_stage_attempt_id;
          const activityAttemptId = assessment.original_activity_attempt_id;
          const activity = assessment.activity;
          if (!valueString(taskId) || !valueString(parentAttemptId) || !valueString(activityAttemptId) ||
              (activity !== "code-generation" && activity !== "code-validation" && activity !== "code-integration")) {
            return failed("diff_package_retained_scope_invalid", "A retained-scope assessment lacks its original task or Activity binding.", { retained_assessment_event_id: retainedId });
          }
          const task = unit.tasks.find((candidate) => candidate.taskId === taskId);
          if (!task) return failed("diff_package_retained_task_missing", "A retained-scope assessment references a task missing from the Construction projection.", { task_id: taskId });
          const admission = addAdmission(task, parentAttemptId);
          if (isFailure(admission)) return admission;
          const original = attemptEvents(task, activity, activityAttemptId, parentAttemptId);
          if (!original) return failed("diff_package_retained_activity_missing", "A retained scope's original Activity attempt is unavailable.", {
            task_id: taskId,
            activity,
            activity_attempt_id: activityAttemptId,
            implementation_attempt_id: parentAttemptId,
          });
          const retainedAttempt = addActivity(task, activity, original);
          if (isFailure(retainedAttempt)) return retainedAttempt;
          const retainedComparisonFailure = addComparison(
            "retained-scope-original-admission-to-output",
            dataOf(admission).admission_baseline,
            assessment.checkpoints,
            [String(retained.id), String(admission.id), ...eventIds(retainedAttempt.events)],
          );
          if (retainedComparisonFailure) return retainedComparisonFailure;
          const retainedEvidenceFailure = addEvidence(stringList(assessment.original_evidence_ids));
          if (retainedEvidenceFailure) return retainedEvidenceFailure;
        }
      }
    }

    const sourceRecords = uniqueByEventId(events.filter((event) => included.has(String(event.id))));
    return {
      kind: "resolved",
      source: {
        scope,
        projectRoot: read.root,
        missionId: read.missionId,
        recordHomeRepositoryId,
        workspaceRepositories,
        comparisons,
        taskDefinitions: uniqueByEventId(taskDefinitions),
        upstreamVersions: uniqueByEventId(upstreamVersions),
        sourceAttempts,
        activityEvidence: uniqueByEventId(activityEvidence),
        retainedScopes: uniqueByEventId(retainedScopes),
        integrationHistory: uniqueByEventId(integrationHistory),
        sourceRecords,
      },
    };
  }
}
