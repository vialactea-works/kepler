import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { CONSTRUCTION_ACTIVITIES, CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION, CONSTRUCTION_PHASE, isActivityAttemptCompletedData, isRetainedScopeAssessment, isRetainedScopeAssessedData, validateConstructionEvent, type ArtifactBinding, type ConstructionEventRecord, type EvidenceId, type ImplementationAdditionalReview, type ImplementationCompletionHandoff, type ImplementationRequestedReview, type RepositoryCheckpoint, type RetainedScopeAssessment, type TaskId } from "./events.js";
import { readFunctionalDesignCompletionRecord, sameArtifactBindings } from "./functional-design-completion.js";
import { readQualityRequirementsCompletionRecord } from "./quality-requirements-completion.js";
import { readFunctionalDesignMaterial } from "./stage-completion.js";
import { readStageArtifactMaterial } from "./stage-artifact-material.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointMaterial, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";
import { readImplementationPlanningCompletionRecord } from "./implementation-planning-completion.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import { readPlanningMaterial } from "./planning-stage-completion.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import type { ConstructionHistoryFact } from "./projection.js";

export interface ImplementationStageCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: { readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal };
}

export type ImplementationStageCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

export interface ImplementationAdditionalReviewRequest {
  readonly requested: false;
}

export interface ImplementationRequestedReviewRequest {
  readonly requested: true;
  readonly request_event_id: EventId;
  readonly evidence_id: EvidenceId;
  readonly reviewer: string;
  readonly findings: readonly string[];
}

export interface ImplementationCompletionRequest {
  readonly self_review_evidence_id: EvidenceId;
  readonly handoff_evidence_id: EvidenceId;
  readonly unit_check_evidence_ids: readonly EvidenceId[];
  readonly retained_scope_assessment_event_ids: readonly EventId[];
  readonly additional_review: ImplementationAdditionalReviewRequest | ImplementationRequestedReviewRequest;
  readonly blocking_findings: readonly string[];
  readonly handoff_assessment: ImplementationCompletionHandoff;
}

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
const isEvidenceIds = (value: unknown): value is readonly EvidenceId[] =>
  Array.isArray(value) && value.every(uuidV4) && new Set(value).size === value.length;
const isEventIds = (value: unknown): value is readonly EventId[] =>
  Array.isArray(value) && value.every(uuidV4) && new Set(value).size === value.length;
const sameStringSet = (left: unknown, right: readonly string[]): boolean =>
  Array.isArray(left) && left.every((item) => typeof item === "string") && new Set(left).size === left.length && new Set(right).size === right.length &&
  [...left].sort().join("\0") === [...right].sort().join("\0");
const isStringList = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(nonEmpty);
const isRequestedReview = (value: unknown): value is ImplementationAdditionalReviewRequest | ImplementationRequestedReviewRequest =>
  isRecord(value) && (value.requested === false
    ? onlyKeys(value, ["requested"])
    : value.requested === true && onlyKeys(value, ["requested", "request_event_id", "evidence_id", "reviewer", "findings"]) &&
      uuidV4(value.request_event_id) && uuidV4(value.evidence_id) && nonEmpty(value.reviewer) && isStringList(value.findings) && value.findings.length === 0);

const isImplementationCompletionRequest = (value: unknown): value is ImplementationCompletionRequest =>
  isRecord(value) && onlyKeys(value, ["self_review_evidence_id", "handoff_evidence_id", "unit_check_evidence_ids", "retained_scope_assessment_event_ids", "additional_review", "blocking_findings", "handoff_assessment"]) &&
  uuidV4(value.self_review_evidence_id) && uuidV4(value.handoff_evidence_id) && isEvidenceIds(value.unit_check_evidence_ids) && value.unit_check_evidence_ids.length > 0 &&
  isEventIds(value.retained_scope_assessment_event_ids) && isRequestedReview(value.additional_review) && isStringList(value.blocking_findings) && isRecord(value.handoff_assessment) &&
  onlyKeys(value.handoff_assessment, ["status", "reason", "recipient", "artifacts"]) && value.handoff_assessment.status === "ready" &&
  nonEmpty(value.handoff_assessment.reason) && value.handoff_assessment.recipient === "unit-of-work-review" &&
  isStringList(value.handoff_assessment.artifacts) && value.handoff_assessment.artifacts.length > 0;

export const validateImplementationCompletionRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: ImplementationCompletionRequest }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one implementation completion assessment object." }] };
  const issues: { pointer: string; message: string }[] = [];
  if (!onlyKeys(value, ["self_review_evidence_id", "handoff_evidence_id", "unit_check_evidence_ids", "retained_scope_assessment_event_ids", "additional_review", "blocking_findings", "handoff_assessment"])) {
    issues.push({ pointer: "", message: "Unknown implementation completion assessment field." });
  }
  if (!uuidV4(value.self_review_evidence_id)) issues.push({ pointer: "/self_review_evidence_id", message: "Expected the stage-scoped self-review evidence UUID." });
  if (!uuidV4(value.handoff_evidence_id)) issues.push({ pointer: "/handoff_evidence_id", message: "Expected the Review handoff evidence UUID." });
  if (!isEvidenceIds(value.unit_check_evidence_ids) || value.unit_check_evidence_ids.length === 0) issues.push({ pointer: "/unit_check_evidence_ids", message: "Expected at least one unit-level combined-result check evidence UUID." });
  if (!isEventIds(value.retained_scope_assessment_event_ids)) issues.push({ pointer: "/retained_scope_assessment_event_ids", message: "Expected distinct event UUIDs for previously recorded retained-scope assessments." });
  if (!isRequestedReview(value.additional_review)) issues.push({ pointer: "/additional_review", message: "Expected an explicit unrequested or completed requested-review assessment with no blocking findings." });
  if (!isStringList(value.blocking_findings)) issues.push({ pointer: "/blocking_findings", message: "Expected the blocking-finding list." });
  if (!isRecord(value.handoff_assessment) || !onlyKeys(value.handoff_assessment, ["status", "reason", "recipient", "artifacts"]) ||
      value.handoff_assessment.status !== "ready" || !nonEmpty(value.handoff_assessment.reason) ||
      value.handoff_assessment.recipient !== "unit-of-work-review" || !isStringList(value.handoff_assessment.artifacts) || value.handoff_assessment.artifacts.length === 0) {
    issues.push({ pointer: "/handoff_assessment", message: "Expected a ready, explicit handoff to Unit of Work Review with identified artifacts." });
  }
  if (issues.length > 0 || !isImplementationCompletionRequest(value)) return { kind: "invalid", issues };
  return { kind: "valid", request: value };
};

const failure = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, recovery = "Resolve the reported condition and retry the exact Implementation attempt."): ImplementationStageCompletionResult =>
  ({ kind: "failed", data: { code, message, details, recovery } });
const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): ImplementationStageCompletionResult =>
  failure(result.code, result.message, result.details, result.recovery);
const hasDirectCause = (fact: ConstructionHistoryFact, sourceEventId: string): boolean =>
  fact.event.caused_by.some((cause) => String(cause) === sourceEventId);
const checkpointKey = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries: string[] = [];
  const repositories = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !nonEmpty(item.repository_id) || !nonEmpty(item.commit) || repositories.has(item.repository_id)) return undefined;
    repositories.add(item.repository_id);
    entries.push(`${item.repository_id}\0${item.commit}`);
  }
  return JSON.stringify(entries.sort());
};
const mergeBindings = (...sets: readonly (readonly ArtifactBinding[])[]): readonly ArtifactBinding[] | undefined => {
  const bindings = new Map<string, ArtifactBinding>();
  for (const set of sets) for (const binding of set) {
    const previous = bindings.get(binding.artifact_id);
    if (previous && previous.content_version !== binding.content_version) return undefined;
    bindings.set(binding.artifact_id, binding);
  }
  return [...bindings.values()].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
};
const latestStart = (facts: readonly ConstructionHistoryFact[]): ConstructionHistoryFact | undefined =>
  facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)).at(-1);
const findCurrentCompletion = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  stageName: "functional-design" | "quality-requirements" | "implementation-planning",
): ConstructionHistoryFact | undefined => {
  const stage = loaded.unit.stages.find((item) => item.stage === stageName);
  if (!stage || stage.state !== "completed" || !stage.currentAttemptId) return undefined;
  const attempt = stage.attempts.find((item) => item.attemptId === stage.currentAttemptId);
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
  return completions.length === 1 ? completions[0] : undefined;
};
const evidenceFact = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  evidenceId: string,
): ConstructionHistoryFact | undefined => {
  const matches = loaded.unit.evidence.map((item) => item.fact).filter((fact) => fact.event.data.evidence_id === evidenceId);
  return matches.length === 1 ? matches[0] : undefined;
};
const evidenceCurrent = (
  fact: ConstructionHistoryFact | undefined,
  attemptId: string,
  check: string,
  artifactBindings: readonly ArtifactBinding[],
  startId: string,
  expectedCheckpointKey: string,
): fact is ConstructionHistoryFact => fact !== undefined && fact.event.type === "construction.evidence-recorded" &&
  fact.event.data.stage === "implementation" && fact.event.data.stage_attempt_id === attemptId &&
  fact.event.data.task_id === undefined && fact.event.data.activity === undefined && fact.event.data.check === check &&
  isRecord(fact.event.data.result) && fact.event.data.result.status === "passed" &&
  sameArtifactBindings(fact.event.data.artifact_bindings, artifactBindings) &&
  checkpointKey(fact.event.data.checkpoints) === expectedCheckpointKey &&
  fact.event.caused_by.some((cause) => String(cause) === startId);

const recordHomeCommonDirectory = async (runtime: ImplementationStageCompletionRuntime, repositoryRoot: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim()));
  } catch {
    return undefined;
  }
};

export class ImplementationStageCompletion {
  constructor(private readonly contexts: AuditContextResolver, private readonly runtime: ImplementationStageCompletionRuntime) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<ImplementationStageCompletionResult> {
    if (!selectors.unit || selectors.stage !== "implementation" || !selectors.attempt || selectors.task !== undefined ||
        selectors.activity !== undefined || selectors.implementationAttempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_stage_completion_scope", "Implementation completion requires exactly --unit, --stage implementation, and --attempt.", {
        unit_id: selectors.unit, stage: selectors.stage, attempt_id: selectors.attempt,
      });
    }
    const parsed = validateImplementationCompletionRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_implementation_completion_request", "The typed Implementation completion assessment failed validation.", { issues: parsed.issues });
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const commonDirectory = await recordHomeCommonDirectory(this.runtime, firstRead.root);
    if (!commonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory, location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", "implementation"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id, process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id, mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/implementation`, attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: ImplementationStageCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      else result = await this.completeLoaded(loaded, selectors.attempt, parsed.request);
    } catch (error) {
      result = failure("stage_completion_failed", "Kepler could not validate Implementation completion safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return failure("stage_coordination_release_failed", "The stage operation could not confirm that it released its coordination claim.", {
      ...released.details, operation_result: result.kind, ...(result.kind === "success" ? { completion_event_id: result.data.id } : {}),
    }, released.recovery);
    return result;
  }

  private async completeLoaded(
    loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>, attemptId: string, request: ImplementationCompletionRequest,
  ): Promise<ImplementationStageCompletionResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Implementation completion requires the recorded Standard workflow binding.");
    if (loaded.unit.blocked) return failure("stage_history_blocked", "Construction history or projection issues prevent safe Implementation completion.", {
      history_issues: loaded.unit.historyIssues, projection_issues: loaded.unit.projectionIssues,
    });
    const stage = loaded.unit.stages.find((item) => item.stage === "implementation");
    const attempt = stage?.attempts.find((item) => item.attemptId === attemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt || attempt.state !== "running") {
      return failure("stage_attempt_not_current", "The selected Implementation attempt is not the current running attempt.", { selected_attempt_id: attemptId, current_attempt_id: stage?.currentAttemptId, state: stage?.state });
    }
    const start = latestStart(attempt.facts);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart || originalStart.event.type !== "construction.stage-attempt-started") return failure("stage_attempt_start_missing", "The selected Implementation attempt has no validated start fact.", { attempt_id: attemptId });
    const retainedAssessmentFacts = loaded.unit.retainedScopeAssessments.filter((fact) => fact.event.data.stage_attempt_id === attemptId);
    const retainedAssessmentEventIds = retainedAssessmentFacts.map((fact) => String(fact.event.id));
    if (!sameStringSet(request.retained_scope_assessment_event_ids.map(String), retainedAssessmentEventIds)) {
      return failure("implementation_retained_assessment_reference_invalid", "Implementation completion must reference every retained-scope assessment recorded for the current attempt.", {
        expected_event_ids: retainedAssessmentEventIds, actual_event_ids: request.retained_scope_assessment_event_ids,
      });
    }
    const retainedAssessmentEntries: { readonly assessment: RetainedScopeAssessment; readonly fact: ConstructionHistoryFact }[] = [];
    for (const fact of retainedAssessmentFacts) {
      if (fact.event.type !== "construction.retained-scope-assessed" || !isRetainedScopeAssessedData(fact.event.data) ||
          !hasDirectCause(fact, String(start.event.id)) ||
          fact.event.data.assessments.some((assessment) => !isRetainedScopeAssessment(assessment) || !assessment.applicable)) {
        return failure("implementation_retained_assessment_invalid", "Each retained-scope assessment must be typed, applicable, and caused by the current Implementation start.", { event_id: fact.event.id });
      }
      retainedAssessmentEntries.push(...fact.event.data.assessments.map((assessment) => ({ assessment, fact })));
    }
    const retainedAssessments = retainedAssessmentEntries.map((entry) => entry.assessment);
    const upstreamCompletions = ["functional-design", "quality-requirements", "implementation-planning"] as const;
    const upstreamFacts = upstreamCompletions.map((name) => findCurrentCompletion(loaded, name));
    if (upstreamFacts.some((fact) => fact === undefined)) return failure("implementation_authority_missing", "Implementation requires current completed Functional Design, Quality Requirements, and Implementation Planning attempts.");
    const expectedAuthorityIds = upstreamFacts.map((fact) => String(fact!.event.id));
    const authority = validateStageStartAuthority({
      stage: "implementation",
      unitId: loaded.unit.unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: expectedAuthorityIds,
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") return failure("implementation_start_authority_invalid", "The current Implementation attempt must descend from the three current upstream completion authorities and any authorized reopen chain.", authority.details);
    const fdFact = upstreamFacts[0]!;
    const qualityFact = upstreamFacts[1]!;
    const planningFact = upstreamFacts[2]!;
    const fdRecord = fdFact.event.type === "construction.stage-attempt-completed"
      ? readFunctionalDesignCompletionRecord(fdFact.event.data.functional_design_assessment)
      : undefined;
    const qualityRecord = fdRecord && qualityFact.event.type === "construction.stage-attempt-completed"
      ? readQualityRequirementsCompletionRecord(qualityFact.event.data.quality_requirements_assessment, fdRecord.artifact_paths)
      : undefined;
    const planningRecord = planningFact.event.type === "construction.stage-attempt-completed"
      ? readImplementationPlanningCompletionRecord(planningFact.event.data.implementation_planning_assessment)
      : undefined;
    if (!fdRecord || !qualityRecord || !planningRecord) {
      return failure("implementation_upstream_assessment_invalid", "Current upstream completion records do not satisfy their typed assessment contracts.");
    }
    const persistedDirectory = loaded.unit.created?.event.type === "construction.unit-created" ? loaded.unit.created.event.data.directory : undefined;
    const fdMaterial = await readFunctionalDesignMaterial(loaded.root, loaded.missionId, loaded.unit.unitId, persistedDirectory);
    const qualityMaterial = await readStageArtifactMaterial({
      repositoryRoot: loaded.root, missionId: loaded.missionId, unitId: loaded.unit.unitId, persistedUnitDirectory: persistedDirectory,
      primaryArtifact: "quality.md", supportFolder: "quality-requirements",
    });
    const planningMaterial = await readPlanningMaterial(loaded, persistedDirectory);
    if (fdMaterial.kind !== "valid" || qualityMaterial.kind !== "valid" || planningMaterial.kind !== "valid") {
      return failure("implementation_upstream_material_invalid", "Current upstream artifacts or the task graph failed validation.", {
        functional_design: fdMaterial.kind === "invalid" ? fdMaterial.diagnostics : [],
        quality: qualityMaterial.kind === "invalid" ? qualityMaterial.diagnostics : [],
        planning: planningMaterial.kind === "invalid" ? planningMaterial.diagnostics : [],
      });
    }
    const expectedBindings = mergeBindings(
      fdMaterial.material.artifactBindings.map((binding) => ({ artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"], content_version: binding.content_version })),
      qualityMaterial.material.artifactBindings,
      planningMaterial.material.artifactBindings,
    );
    if (!expectedBindings || !sameArtifactBindings(fdRecord.artifact_bindings, fdMaterial.material.artifactBindings) ||
        !sameArtifactBindings(qualityRecord.artifact_bindings, qualityMaterial.material.artifactBindings) ||
        !sameArtifactBindings(qualityRecord.functional_design_bindings, fdMaterial.material.artifactBindings) ||
        !sameArtifactBindings(planningRecord.artifact_bindings, planningMaterial.material.artifactBindings) ||
        !sameArtifactBindings(planningRecord.reviewed_material_bindings, expectedBindings) ||
        planningRecord.graph_ref.graph_id !== planningMaterial.material.graphRef.graph_id ||
        planningRecord.graph_ref.content_version !== planningMaterial.material.graphRef.content_version) {
      return failure("implementation_upstream_material_stale", "The current Design, Quality, Planning, or task graph material differs from its accepted completion bindings.", {
        expected_reviewed_bindings: planningRecord.reviewed_material_bindings, actual_reviewed_bindings: expectedBindings,
        expected_graph_ref: planningRecord.graph_ref, actual_graph_ref: planningMaterial.material.graphRef,
      });
    }
    const commonDirectory = await recordHomeCommonDirectory(this.runtime, loaded.root);
    if (!commonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: loaded.root });
    const finalCheckpointsResult = await captureStageCheckpoints(this.runtime, loaded, commonDirectory);
    if (finalCheckpointsResult.kind === "failed") return failure(finalCheckpointsResult.code, finalCheckpointsResult.message, finalCheckpointsResult.details);
    const finalCheckpoints = finalCheckpointsResult.checkpoints as readonly RepositoryCheckpoint[];
    if (finalCheckpoints.length === 0) return failure("implementation_final_checkpoint_missing", "Implementation requires a repository-qualified final checkpoint set before Review handoff.");
    const repositoryId = recordHomeRepositoryId(loaded.history.events);
    const recordHomeCheckpoint = repositoryId ? finalCheckpoints.find((checkpoint) => checkpoint.repository_id === repositoryId) : undefined;
    if (!repositoryId || !recordHomeCheckpoint) return failure("implementation_record_home_checkpoint_missing", "The final selected checkpoint set must include the record-home repository.", { repository_id: repositoryId });
    const artifactPaths = [
      ...fdMaterial.material.artifactPaths.map((artifactPath) => Path.join(fdMaterial.material.unitDirectory, artifactPath)),
      ...qualityMaterial.material.artifactPaths.map((artifactPath) => Path.join(qualityMaterial.material.unitDirectory, artifactPath)),
      ...planningMaterial.material.artifactPaths.map((artifactPath) => Path.join(planningMaterial.material.unitDirectory, artifactPath)),
      Path.join(planningMaterial.material.unitDirectory, "tasks-dag.json"),
    ];
    const checkpointMaterial = await verifyStageCheckpointMaterial(this.runtime.workspace, {
      repositoryRoot: loaded.root, repositoryId, checkpoint: recordHomeCheckpoint, artifactPaths,
    });
    if (checkpointMaterial.kind === "invalid") return failure("implementation_checkpoint_material_mismatch", "Current upstream artifacts and task graph must match the final record-home checkpoint.", { artifact_paths: checkpointMaterial.artifactPaths });
    const finalKey = checkpointKey(finalCheckpoints);
    if (finalKey === undefined || finalKey === "[]") return failure("implementation_final_checkpoint_invalid", "Implementation final checkpoints must be unique repository-qualified commit identities.");
    const expectedTaskIds = planningRecord.assessments.handoff.task_ids.slice().sort();
    if (JSON.stringify(expectedTaskIds) !== JSON.stringify(planningMaterial.material.taskIds.slice().sort())) {
      return failure("implementation_task_graph_stale", "The completed Planning task set differs from the current task graph.", {
        expected_task_ids: planningRecord.assessments.handoff.task_ids,
        actual_task_ids: planningMaterial.material.taskIds,
      });
    }
    const retainedScopeKeys = new Set<string>();
    for (const { assessment, fact } of retainedAssessmentEntries) {
      const scopeKey = JSON.stringify([assessment.task_id, assessment.activity]);
      const originalTask = loaded.unit.tasks.find((task) => task.taskId === assessment.task_id);
      const originalActivity = originalTask?.activities.find((item) => item.activity === assessment.activity);
      const originalAttempt = originalActivity?.attempts.find((item) => item.attemptId === assessment.original_activity_attempt_id);
      const originalAttemptSupersededInParent = originalAttempt?.facts.some((item) =>
        item.event.type === "construction.activity-attempt-ended-by-revision" ||
        item.event.type === "construction.activity-reopened" ||
        ((item.event.type === "construction.task-scope-ended-by-revision" || item.event.type === "construction.task-scope-reopened") &&
          Array.isArray(item.event.data.affected_activities) && item.event.data.affected_activities.includes(assessment.activity)),
      ) ?? false;
      const originalCompletedAtAssessment = originalAttempt?.state === "completed" ||
        (originalAttempt?.state === "ended_by_revision" && !originalAttemptSupersededInParent);
      const originalCompletions = originalAttempt?.facts.filter((item) =>
        item.event.type === "construction.activity-attempt-completed" && isActivityAttemptCompletedData(item.event.data),
      ) ?? [];
      const originalCompletion = originalCompletions.length === 1 ? originalCompletions[0] : undefined;
      const originalCompletionData = originalCompletion && isActivityAttemptCompletedData(originalCompletion.event.data)
        ? originalCompletion.event.data : undefined;
      const originalStageAttempt = stage.attempts.find((item) => item.attemptId === assessment.original_stage_attempt_id);
      const originalAdmissions = originalTask?.admissions.filter((item) => item.event.type === "construction.task-admitted" &&
        item.event.data.stage_attempt_id === assessment.original_stage_attempt_id) ?? [];
      const originalAdmission = originalAdmissions[0];
      if (retainedScopeKeys.has(scopeKey) || !expectedTaskIds.includes(assessment.task_id) || !originalTask || !originalActivity ||
          !originalAttempt || !originalCompletedAtAssessment || originalAttempt.stageAttemptId !== assessment.original_stage_attempt_id ||
          assessment.original_stage_attempt_id === attemptId || !originalStageAttempt || originalStageAttempt.state !== "ended_by_revision" ||
          originalAdmissions.length !== 1 || !isRecord(originalAdmission?.event.data.graph_ref) ||
          originalAdmission.event.data.graph_ref.graph_id !== planningRecord.graph_ref.graph_id ||
          originalAdmission.event.data.graph_ref.content_version !== planningRecord.graph_ref.content_version ||
          !originalCompletion || !originalCompletionData || originalCompletionData.stage_attempt_id !== assessment.original_stage_attempt_id ||
          originalCompletionData.task_id !== assessment.task_id || originalCompletionData.activity !== assessment.activity ||
          originalCompletionData.activity_attempt_id !== assessment.original_activity_attempt_id ||
          !sameStringSet(assessment.original_evidence_ids.map(String), originalCompletionData.evidence_ids.map(String)) ||
          checkpointKey(assessment.checkpoints) !== checkpointKey(originalCompletionData.checkpoints) ||
          !hasDirectCause(fact, String(originalCompletion.event.id))) {
        return failure("implementation_retained_assessment_origin_invalid", "Each retained assessment must identify an unsuperseded completed Activity from an ended older parent and the current task graph.", {
          task_id: assessment.task_id, activity: assessment.activity,
          original_stage_attempt_id: assessment.original_stage_attempt_id, original_activity_attempt_id: assessment.original_activity_attempt_id,
        });
      }
      retainedScopeKeys.add(scopeKey);
      for (const evidenceId of assessment.original_evidence_ids) {
        const evidence = evidenceFact(loaded, String(evidenceId));
        if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
            evidence.event.data.stage !== "implementation" || evidence.event.data.stage_attempt_id !== assessment.original_stage_attempt_id ||
            evidence.event.data.task_id !== assessment.task_id || evidence.event.data.activity !== assessment.activity ||
            evidence.event.data.activity_attempt_id !== assessment.original_activity_attempt_id ||
            !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
            !sameArtifactBindings(evidence.event.data.artifact_bindings, expectedBindings) ||
            checkpointKey(evidence.event.data.checkpoints) !== checkpointKey(assessment.checkpoints) ||
            !hasDirectCause(originalCompletion, String(evidence.event.id)) || !hasDirectCause(fact, String(evidence.event.id))) {
          return failure("implementation_retained_assessment_provenance_invalid", "Retained assessment events must directly reference each original passed Activity result and its completion.", {
            task_id: assessment.task_id, activity: assessment.activity, evidence_id: evidenceId,
          });
        }
      }
      if (assessment.activity === "code-integration") {
        const acceptances = originalActivity.accepted.filter((item) => item.event.type === "construction.integration-accepted" &&
          item.event.data.stage_attempt_id === assessment.original_stage_attempt_id &&
          item.event.data.task_id === assessment.task_id && item.event.data.activity_attempt_id === assessment.original_activity_attempt_id);
        if (acceptances.length !== 1 || !hasDirectCause(fact, String(acceptances[0]!.event.id))) {
          return failure("implementation_retained_integration_provenance_invalid", "Retained Code Integration assessments must directly reference their unique original accepted Integration.", {
            task_id: assessment.task_id, activity_attempt_id: assessment.original_activity_attempt_id,
          });
        }
      }
    }
    const currentAttemptTasks = loaded.unit.tasks.filter((task) => task.stageAttemptId === attemptId);
    const currentAttemptTaskIds = currentAttemptTasks.map((task) => String(task.taskId)).sort();
    if (JSON.stringify(currentAttemptTaskIds) !== JSON.stringify(expectedTaskIds) || currentAttemptTasks.some((task) => task.state !== "complete")) {
      return failure("implementation_unfinished_writer", "Every task admitted to the current Implementation attempt must belong to the current graph and have completed Integration.", {
        expected_task_ids: expectedTaskIds, current_attempt_task_ids: currentAttemptTaskIds,
      });
    }
    const tasks = expectedTaskIds.map((taskId) => loaded.unit.tasks.find((task) => task.taskId === taskId));
    if (tasks.some((task) => !task || task.state !== "complete" || task.stageAttemptId !== attemptId || !task.completion ||
        task.completion.event.data.stage_attempt_id !== attemptId)) {
      return failure("implementation_task_completion_incomplete", "Every task in the current graph must have a successful current-attempt Integration and task completion.", {
        expected_task_ids: expectedTaskIds, observed_tasks: tasks.map((task) => ({ task_id: task?.taskId, state: task?.state, attempt_id: task?.stageAttemptId })),
      });
    }
    const taskFacts = tasks.filter((task): task is NonNullable<typeof task> => task !== undefined);
    const integrationEventIds = taskFacts.map((task) => String(task.completion!.event.data.integration_event_id));
    const integrationCheckpoints = taskFacts.flatMap((task) => {
      const accepted = loaded.history.events.find((record) => record.event?.id === task.completion!.event.data.integration_event_id)?.event;
      return accepted?.type === "construction.integration-accepted" && Array.isArray(accepted.data.candidate_checkpoints) ? [checkpointKey(accepted.data.candidate_checkpoints)] : [];
    });
    if (!integrationCheckpoints.includes(finalKey)) return failure("implementation_final_integration_mismatch", "The final checkpoint set must be represented by at least one current task Integration acceptance.", { final_checkpoints: finalCheckpoints, integration_event_ids: integrationEventIds });
    const expectedActivities = CONSTRUCTION_ACTIVITIES;
    const activityEvidenceIds: string[] = [];
    const activityCompletionFacts: ConstructionHistoryFact[] = [];
    for (const task of taskFacts) {
      for (const activityName of expectedActivities) {
        const activity = task.activities.find((item) => item.activity === activityName);
        if (!activity || activity.state !== "completed") return failure("implementation_activity_incomplete", "Every task requires completed Code Generation, Code Validation, and Code Integration Activities.", { task_id: task.taskId, activity: activityName, state: activity?.state });
        const currentAttempt = activity.currentAttemptId
          ? activity.attempts.find((item) => item.attemptId === activity.currentAttemptId && item.stageAttemptId === attemptId && item.state === "completed")
          : undefined;
        const matching = retainedAssessments.filter((assessment) => assessment.task_id === task.taskId && assessment.activity === activityName);
        const retainedAttempt = !currentAttempt && matching.length === 1
          ? activity.attempts.find((item) => item.attemptId === matching[0]?.original_activity_attempt_id &&
            item.stageAttemptId === matching[0]?.original_stage_attempt_id && item.state === "completed")
          : undefined;
        const selectedAttempt = currentAttempt ?? retainedAttempt;
        const completions = selectedAttempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed") ?? [];
        const completion = completions.length === 1 ? completions[0] : undefined;
        if (!selectedAttempt || !completion || !Array.isArray(completion.event.data.evidence_ids) || completion.event.data.evidence_ids.length === 0) {
          return failure("implementation_activity_evidence_missing", "Each task Activity must have current evidence or a completed original scope eligible for retained applicability assessment.", { task_id: task.taskId, activity: activityName });
        }
        if (currentAttempt) {
          if (checkpointKey(completion.event.data.checkpoints) !== finalKey) {
            return failure("implementation_activity_checkpoint_mismatch", "Every current Activity completion must use the final Implementation checkpoint set.", {
              task_id: task.taskId, activity: activityName, checkpoints: completion.event.data.checkpoints, final_checkpoints: finalCheckpoints,
            });
          }
          for (const evidenceId of completion.event.data.evidence_ids) {
            const activityEvidence = evidenceFact(loaded, String(evidenceId));
            if (!activityEvidence || activityEvidence.event.type !== "construction.evidence-recorded" ||
                activityEvidence.event.data.stage_attempt_id !== attemptId || activityEvidence.event.data.task_id !== task.taskId ||
                activityEvidence.event.data.activity !== activityName ||
                activityEvidence.event.data.activity_attempt_id !== completion.event.data.activity_attempt_id ||
                !isRecord(activityEvidence.event.data.result) || activityEvidence.event.data.result.status !== "passed" ||
                !sameArtifactBindings(activityEvidence.event.data.artifact_bindings, expectedBindings) ||
                checkpointKey(activityEvidence.event.data.checkpoints) !== finalKey ||
                !completion.event.caused_by.some((cause) => String(cause) === String(activityEvidence.event.id))) {
              return failure("implementation_activity_evidence_invalid", "Every current Activity evidence fact must match its attempt, accepted material, final checkpoints, and completion provenance.", {
                task_id: task.taskId, activity: activityName, evidence_id: evidenceId,
              });
            }
          }
          activityCompletionFacts.push(completion);
        }
        if (!currentAttempt) {
          const originalEvidenceIds = completion.event.data.evidence_ids.map(String).sort();
          const retained = matching[0];
          if (matching.length !== 1 || !retained || !retained.applicable ||
              JSON.stringify([...retained.original_evidence_ids].map(String).sort()) !== JSON.stringify(originalEvidenceIds) ||
              checkpointKey(retained.checkpoints) !== checkpointKey(completion.event.data.checkpoints)) {
            return failure("implementation_retained_scope_unassessed", "Each Activity retained from an earlier attempt needs one applicable assessment bound to its original attempts, evidence, and checkpoints.", { task_id: task.taskId, activity: activityName, original_stage_attempt_id: completion.event.data.stage_attempt_id, original_activity_attempt_id: completion.event.data.activity_attempt_id });
          }
          for (const evidenceId of originalEvidenceIds) {
            const originalEvidence = evidenceFact(loaded, evidenceId);
            if (!originalEvidence || originalEvidence.event.type !== "construction.evidence-recorded" ||
                originalEvidence.event.data.stage_attempt_id !== completion.event.data.stage_attempt_id ||
                originalEvidence.event.data.task_id !== task.taskId || originalEvidence.event.data.activity !== activityName ||
                originalEvidence.event.data.activity_attempt_id !== completion.event.data.activity_attempt_id ||
                !isRecord(originalEvidence.event.data.result) || originalEvidence.event.data.result.status !== "passed" ||
                !completion.event.caused_by.some((cause) => String(cause) === String(originalEvidence.event.id))) {
              return failure("implementation_retained_scope_evidence_invalid", "Retained Activity evidence must remain valid and bound to its original completed scope.", { task_id: task.taskId, activity: activityName, evidence_id: evidenceId });
            }
          }
        }
        activityEvidenceIds.push(...completion.event.data.evidence_ids.map(String));
      }
    }
    const requiredCheckEvidenceIds = [...new Set([...activityEvidenceIds, ...request.unit_check_evidence_ids.map(String)])].sort();
    const expectedHandoffArtifacts = [
      ...fdMaterial.material.artifactPaths, ...qualityMaterial.material.artifactPaths, ...planningMaterial.material.artifactPaths, "tasks-dag.json",
    ].sort();
    if (JSON.stringify([...request.handoff_assessment.artifacts].sort()) !== JSON.stringify(expectedHandoffArtifacts)) {
      return failure("implementation_handoff_mismatch", "The Review handoff must identify the current upstream artifacts, linked support, and task graph.", { expected_artifacts: expectedHandoffArtifacts, actual_artifacts: request.handoff_assessment.artifacts });
    }
    if (request.blocking_findings.length > 0 || request.handoff_assessment.status !== "ready") return failure("implementation_assessment_blocked", "Blocking findings or an unready Review handoff prevent Implementation completion.", { blocking_findings: request.blocking_findings, handoff: request.handoff_assessment });
    const selfReview = evidenceFact(loaded, String(request.self_review_evidence_id));
    const handoffEvidence = evidenceFact(loaded, String(request.handoff_evidence_id));
    const selfReviewValid = evidenceCurrent(selfReview, attemptId, "implementation-self-review", expectedBindings, String(start.event.id), finalKey);
    const handoffValid = evidenceCurrent(handoffEvidence, attemptId, "implementation-review-handoff", expectedBindings, String(start.event.id), finalKey);
    if (!selfReviewValid || !handoffValid) return failure("implementation_assessment_evidence_invalid", "Implementation self-review and Review handoff evidence must pass for the current attempt, final checkpoints, and current upstream material.", {
      self_review_evidence_id: request.self_review_evidence_id, handoff_evidence_id: request.handoff_evidence_id,
    });
    const unitCheckFacts: ConstructionHistoryFact[] = [];
    for (const evidenceId of request.unit_check_evidence_ids) {
      const fact = evidenceFact(loaded, String(evidenceId));
      if (!evidenceCurrent(fact, attemptId, "implementation-combined-result-check", expectedBindings, String(start.event.id), finalKey)) {
        return failure("implementation_combined_check_invalid", "Each combined-result check must pass against the final current attempt, material, and checkpoints.", { evidence_id: evidenceId });
      }
      unitCheckFacts.push(fact);
    }
    const additionalReview = request.additional_review;
    const additionalReviewFact: ConstructionHistoryFact[] = [];
    if (additionalReview.requested) {
      const requests = loaded.unit.interactions.filter((fact) => fact.event.id === additionalReview.request_event_id);
      const requestFact = requests.length === 1 ? requests[0] : undefined;
      const reviewEvidence = evidenceFact(loaded, String(additionalReview.evidence_id));
      if (!requestFact || requestFact.event.type !== "construction.interaction-recorded" ||
          requestFact.event.data.stage !== "implementation" || requestFact.event.data.stage_attempt_id !== attemptId ||
          !hasRequesterParticipant(requestFact.event.data.participants) ||
          !requestFact.event.caused_by.includes(start.event.id) ||
          !evidenceCurrent(reviewEvidence, attemptId, "implementation-additional-review", expectedBindings, String(start.event.id), finalKey) ||
          !reviewEvidence.event.caused_by.includes(requestFact.event.id) || additionalReview.findings.length > 0) {
        return failure("implementation_additional_review_invalid", "Requested additional review must follow the requester interaction and pass for current material with no blocking findings.", { request_event_id: additionalReview.request_event_id, evidence_id: additionalReview.evidence_id });
      }
      additionalReviewFact.push(requestFact, reviewEvidence);
    }
    const stageEvidenceFacts = [selfReview, handoffEvidence, ...unitCheckFacts, ...additionalReviewFact.filter((fact) => fact.event.type === "construction.evidence-recorded")];
    for (const fact of stageEvidenceFacts) {
      const verifiedSet = await verifyStageCheckpointSet(this.runtime.workspace, finalCheckpointsResult.repositoryRoots, fact.event.data.checkpoints);
      if (verifiedSet.kind === "invalid") return failure("implementation_evidence_checkpoint_invalid", "Every Implementation assessment checkpoint must resolve in its selected repository workspace.", {
        event_id: fact.event.id, repository_ids: verifiedSet.repositoryIds, invalid_commits: verifiedSet.invalidCommits,
      });
      const checkpoint = Array.isArray(fact.event.data.checkpoints)
        ? fact.event.data.checkpoints.find((item) => isRecord(item) && item.repository_id === repositoryId)
        : undefined;
      if (!isRecord(checkpoint)) return failure("implementation_evidence_checkpoint_missing", "Every Implementation assessment checkpoint set must include the record-home repository.", { event_id: fact.event.id, repository_id: repositoryId });
      const materialAtCheckpoint = await verifyStageCheckpointMaterial(this.runtime.workspace, {
        repositoryRoot: loaded.root, repositoryId, checkpoint, artifactPaths,
      });
      if (materialAtCheckpoint.kind === "invalid") return failure("implementation_evidence_material_checkpoint_mismatch", "Implementation assessment material must exist unchanged in each recorded checkpoint.", {
        event_id: fact.event.id, artifact_paths: materialAtCheckpoint.artifactPaths,
      });
    }
    const evidenceIds = [...new Set(stageEvidenceFacts.map((fact) => String(fact.event.data.evidence_id)))].sort() as EvidenceId[];
    const existingIds = new Set(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    const eventSpecs: { readonly id?: string; readonly type: string; readonly data: Record<string, unknown>; readonly caused_by: readonly string[] }[] = [
      { type: "construction.implementation-completion-assessed", data: {
        mission_id: loaded.missionId, unit_id: loaded.unit.unitId, stage: "implementation", stage_attempt_id: attemptId,
        final_checkpoints: finalCheckpoints, artifact_paths: expectedHandoffArtifacts.filter((path) => path !== "tasks-dag.json"),
        task_graph_path: "tasks-dag.json", graph_ref: planningMaterial.material.graphRef,
        task_ids: expectedTaskIds as TaskId[], reviewed_material_bindings: expectedBindings,
        self_review_evidence_id: request.self_review_evidence_id, handoff_evidence_id: request.handoff_evidence_id,
        unit_check_evidence_ids: request.unit_check_evidence_ids, required_check_evidence_ids: requiredCheckEvidenceIds as EvidenceId[],
        integration_event_ids: integrationEventIds as EventId[],
        retained_assessment_event_ids: [...request.retained_scope_assessment_event_ids] as EventId[],
        additional_review: additionalReview as ImplementationAdditionalReview | ImplementationRequestedReview,
        blocking_findings: request.blocking_findings, handoff_assessment: request.handoff_assessment,
      }, caused_by: [start.event.id, ...retainedAssessmentEventIds, ...taskFacts.map((task) => task.completion!.event.id), ...activityCompletionFacts.map((fact) => fact.event.id), ...requiredCheckEvidenceIds.map((id) => evidenceFact(loaded, id)?.event.id).filter((id): id is EventId => id !== undefined), ...integrationEventIds, ...stageEvidenceFacts.map((fact) => fact.event.id)] },
      { type: "construction.stage-attempt-completed", data: {
        mission_id: loaded.missionId, unit_id: loaded.unit.unitId, stage: "implementation", stage_attempt_id: attemptId,
        evidence_ids: evidenceIds, checkpoints: finalCheckpoints,
      }, caused_by: [start.event.id, ...stageEvidenceFacts.map((fact) => fact.event.id)] },
    ];
    const candidates: ConstructionEventRecord[] = [];
    for (const spec of eventSpecs) {
      let eventId: string;
      let journalId: string;
      try { eventId = spec.id ?? this.runtime.identities.next(); journalId = this.runtime.identities.next(); }
      catch (error) { return failure("stage_completion_identity_failed", "Kepler could not allocate Implementation assessment identities.", { message: error instanceof Error ? error.message : String(error) }); }
      if (!uuidV4(eventId) || !uuidV4(journalId) || eventId === journalId || existingIds.has(eventId) || existingIds.has(journalId) || candidates.some((candidate) => candidate.id === eventId || candidate.journal_id === journalId)) {
        return failure("stage_completion_identity_failed", "Implementation assessment event and journal identities must be distinct, valid, and unused.");
      }
      const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
      if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return failure("stage_completion_journal_identity_conflict", "An Implementation assessment journal identity already has a filesystem entry.", { journal_id: journalId });
      const assessment = spec.type === "construction.stage-attempt-completed"
        ? candidates.find((candidate) => candidate.type === "construction.implementation-completion-assessed")
        : undefined;
      if (spec.type === "construction.stage-attempt-completed" && !assessment) return failure("implementation_assessment_event_missing", "The completion event requires its validated typed assessment event.");
      const raw = { id: eventId, phase: CONSTRUCTION_PHASE, type: spec.type, envelope_version: 1,
        event_version: spec.type === "construction.stage-attempt-completed" ? CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION : 1,
        journal_id: journalId, recorded_at: this.runtime.now(), producer: this.runtime.producer,
        caused_by: [...new Set([...spec.caused_by, ...(assessment ? [assessment.id] : [])])] as EventId[],
        data: { ...spec.data, ...(assessment ? { implementation_assessment: { assessment_event_id: assessment.id } } : {}) } };
      const validation = validateConstructionEvent(raw);
      if (validation.status !== "valid") return failure("stage_completion_event_invalid", "The typed Implementation completion event failed Construction validation.", { issues: validation.status === "invalid" ? validation.issues : [validation.reason] });
      candidates.push(validation.event);
      existingIds.add(eventId); existingIds.add(journalId);
    }
    const latestProjection = loaded.projection;
    const unitProjection = latestProjection.units.find((item) => item.unitId === loaded.unit.unitId);
    if (!unitProjection || unitProjection.blocked) return failure("implementation_projection_blocked", "The current Construction projection is blocked.");
    for (const candidate of candidates) {
      try { await this.runtime.journals.create(loaded.root, loaded.missionId, candidate.journal_id).append(candidate); }
      catch (error) { return failure("stage_completion_append_failed", "Kepler could not durably append Implementation assessment history.", { journal_id: candidate.journal_id, message: error instanceof Error ? error.message : String(error) }, "Inspect the selected history journals for appended or uncertain records before retrying; preserve uncertain effects."); }
    }
    const completion = candidates.at(-1)!;
    const assessment = candidates.find((candidate) => candidate.type === "construction.implementation-completion-assessed");
    return { kind: "success", data: { id: completion.id, journal_id: completion.journal_id, unit_id: loaded.unit.unitId, stage: "implementation", attempt_id: attemptId, assessment_event_id: assessment?.id, evidence_ids: evidenceIds, integration_event_ids: integrationEventIds, checkpoints: finalCheckpoints } };
  }
}

export const createNodeImplementationStageCompletionRuntime = (producer: { readonly name: string; readonly version: string }): ImplementationStageCompletionRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return {
    workspace, identities: { next: randomUUID }, now: () => new Date().toISOString(), producer,
    journals: { create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: CONSTRUCTION_PHASE }) },
  };
};
