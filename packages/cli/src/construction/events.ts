import {
  validateEventEnvelope,
  type EventEnvelope,
  type EventEnvelopeIssue,
} from "@vialactea-works/kepler-core";
import type { EventId } from "@vialactea-works/kepler-core";
import {
  functionalDesignEvidenceIds,
  isFunctionalDesignCompletionRecord,
} from "./functional-design-completion.js";
import {
  isQualityRequirementsCompletionRecord,
  qualityRequirementsEvidenceIds,
  type QualityRequirementsCompletionRecord,
} from "./quality-requirements-completion.js";
import {
  isImplementationPlanningCompletionRecord,
  planningEvidenceIds,
  type ImplementationPlanningCompletionRecord,
} from "./implementation-planning-completion.js";

const identityBrand: unique symbol = Symbol("ConstructionIdentity");

type Identity<Kind extends string> = string & { readonly [identityBrand]: Kind };

export type MissionId = Identity<"MissionId">;
export type UnitId = Identity<"UnitId">;
export type StageAttemptId = Identity<"StageAttemptId">;
export type TaskId = Identity<"TaskId">;
export type ActivityAttemptId = Identity<"ActivityAttemptId">;
export type RevisionId = Identity<"RevisionId">;
export type EvidenceId = Identity<"EvidenceId">;
export type GraphId = Identity<"GraphId">;
export type ArtifactId = Identity<"ArtifactId">;

export const CONSTRUCTION_PHASE = "construction";
export const CONSTRUCTION_EVENT_VERSION = 1;
export const CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION = 2;

export const CONSTRUCTION_STAGES = [
  "functional-design",
  "quality-requirements",
  "implementation-planning",
  "implementation",
  "unit-of-work-review",
  "deliver",
] as const;

export const CONSTRUCTION_ACTIVITIES = [
  "code-generation",
  "code-validation",
  "code-integration",
] as const;

export const CONSTRUCTION_EVENT_TYPES = [
  "construction.mission-created",
  "construction.mission-workspaces-prepared",
  "construction.unit-created",
  "construction.unit-baseline-selected",
  "construction.stage-attempt-started",
  "construction.stage-waiting",
  "construction.stage-pause-requested",
  "construction.stage-paused",
  "construction.stage-resumed",
  "construction.stage-attempt-completed",
  "construction.stage-attempt-ended-by-revision",
  "construction.stage-reopened",
  "construction.task-admitted",
  "construction.task-scope-ended-by-revision",
  "construction.task-scope-reopened",
  "construction.task-completed",
  "construction.activity-attempt-started",
  "construction.activity-waiting",
  "construction.activity-pause-requested",
  "construction.activity-paused",
  "construction.activity-resumed",
  "construction.activity-attempt-completed",
  "construction.activity-attempt-ended-by-revision",
  "construction.activity-reopened",
  "construction.evidence-recorded",
  "construction.approval-recorded",
  "construction.interaction-recorded",
  "construction.integration-prepared",
  "construction.integration-accepted",
  "construction.revision-authorized",
  "construction.retained-scope-assessed",
  "construction.implementation-completion-assessed",
] as const;

export type ConstructionStage = (typeof CONSTRUCTION_STAGES)[number];
export type ConstructionActivity = (typeof CONSTRUCTION_ACTIVITIES)[number];
export type ConstructionEventType = (typeof CONSTRUCTION_EVENT_TYPES)[number];
export type EffortLevel = "minimal" | "standard" | "comprehensive";

export const CONSTRUCTION_STAGE_ACTIVITY_STATES = [
  "not_started",
  "running",
  "pausing",
  "paused",
  "waiting",
  "completed",
  "reopened",
  "ended_by_revision",
] as const;

export const CONSTRUCTION_TASK_STATES = [
  "blocked",
  "ready",
  "admitted",
  "generating",
  "validating",
  "integrating",
  "waiting",
  "complete",
  "reopened",
] as const;

export type ConstructionStageActivityState = (typeof CONSTRUCTION_STAGE_ACTIVITY_STATES)[number];
export type ConstructionTaskState = (typeof CONSTRUCTION_TASK_STATES)[number];

export interface ConstructionBaseData {
  readonly mission_id: MissionId;
  readonly unit_id: UnitId;
}

export interface MaterialInput {
  readonly reference: string;
  readonly purpose: string;
}

export interface RepositoryCheckpoint {
  readonly repository_id: string;
  readonly commit: string;
}

export interface ArtifactBinding {
  readonly artifact_id: ArtifactId;
  readonly content_version?: string;
  readonly checkpoint?: RepositoryCheckpoint;
}

export interface GraphReference {
  readonly graph_id: GraphId;
  readonly content_version: string;
  readonly checkpoint?: RepositoryCheckpoint;
}

export interface TaskDefinitionReference {
  readonly graph_id: GraphId;
  readonly task_id: TaskId;
  readonly content_version: string;
  readonly checkpoint?: RepositoryCheckpoint;
}

export type MissionWorkspaceContext =
  | { readonly kind: "existing" }
  | { readonly kind: "new" }
  | {
      readonly kind: "previous";
      readonly workspace_id: string;
      readonly mission_id: MissionId;
      readonly record_home_repository_id: string;
    };

export type MissionBranchSelection =
  | { readonly kind: "current" }
  | { readonly kind: "default" }
  | { readonly kind: "existing"; readonly name: string }
  | { readonly kind: "new"; readonly name: string; readonly base: string };

export type MissionStartingCheckpoint =
  | { readonly kind: "commit"; readonly commit: string }
  | { readonly kind: "no-commit" };

export interface MissionWorkspaceSelection {
  readonly repository_id: string;
  readonly context: MissionWorkspaceContext;
  readonly branch: MissionBranchSelection;
  readonly integration_target: string;
  readonly starting_checkpoint: MissionStartingCheckpoint;
}

export interface MissionCreatedData {
  readonly mission_id: MissionId;
  readonly title: string;
  readonly request: string;
  readonly workflow: "standard";
  readonly record_home: { readonly repository_id: string };
  readonly contexts: readonly MaterialInput[];
  readonly repositories: readonly MissionWorkspaceSelection[];
}

export interface MissionWorkspacePreparedData {
  readonly mission_id: MissionId;
  readonly repositories: readonly {
    readonly repository_id: string;
    readonly context: MissionWorkspaceContext;
    readonly branch: string;
    readonly integration_target: string;
    readonly starting_checkpoint: MissionStartingCheckpoint;
  }[];
}

export interface UnitCreatedData extends ConstructionBaseData {
  readonly directory: string;
  readonly workflow: "standard";
  readonly initial_effort: {
    readonly default: EffortLevel;
    readonly stage_overrides: Readonly<Partial<Record<ConstructionStage, EffortLevel>>>;
    readonly selected_by: string;
  };
}

export interface UnitBaselineSelectedData extends ConstructionBaseData {
  readonly review_baseline: readonly RepositoryCheckpoint[];
  readonly integration_targets: readonly { readonly repository_id: string; readonly target: string }[];
}

export interface StageAttemptData extends ConstructionBaseData {
  readonly stage: ConstructionStage;
  readonly stage_attempt_id: StageAttemptId;
}

export interface StageAttemptStartedData extends StageAttemptData {
  readonly inputs: readonly MaterialInput[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
  readonly authority_event_ids: readonly EventId[];
}

export interface StageWaitingData extends StageAttemptData {
  readonly reason: string;
}

export interface StagePauseData extends StageAttemptData {
  readonly reason: string;
}

export interface FunctionalDesignSelfReviewAssessment {
  readonly status: "passed";
  readonly evidence_id: EvidenceId;
  readonly reviewer: string;
  readonly summary: string;
  readonly checks: readonly ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"];
  readonly findings: readonly string[];
}

export interface FunctionalDesignResolvedChoice {
  readonly choice: string;
  readonly owner: string;
  readonly resolution: string;
}

export interface FunctionalDesignQualityConcern {
  readonly concern: string;
  readonly responsible_stage: "quality-requirements";
  readonly owner: string;
}

export interface FunctionalDesignTechnicalQuestion {
  readonly question: string;
  readonly responsible_stage: "implementation-planning";
  readonly owner: string;
}

export interface FunctionalDesignDecisionResolutionAssessment {
  readonly status: "resolved";
  readonly evidence_id: EvidenceId;
  readonly summary: string;
  readonly resolved_material_choices: readonly FunctionalDesignResolvedChoice[];
  readonly unresolved_material_choices: readonly string[];
  readonly unsupported_assumptions: readonly string[];
  readonly quality_concerns: readonly FunctionalDesignQualityConcern[];
  readonly technical_questions: readonly FunctionalDesignTechnicalQuestion[];
}

export interface FunctionalDesignHandoffAssessment {
  readonly status: "ready";
  readonly evidence_id: EvidenceId;
  readonly summary: string;
  readonly recipient: "quality-requirements";
  readonly unit_directory: string;
  readonly artifacts: readonly string[];
  readonly project_references: readonly string[];
  readonly known_constraints: readonly string[];
  readonly quality_concerns: readonly FunctionalDesignQualityConcern[];
  readonly technical_questions: readonly FunctionalDesignTechnicalQuestion[];
}

export interface FunctionalDesignCompletionAssessments {
  readonly self_review: FunctionalDesignSelfReviewAssessment;
  readonly decision_resolution: FunctionalDesignDecisionResolutionAssessment;
  readonly handoff: FunctionalDesignHandoffAssessment;
}

export interface FunctionalDesignCompletionRecord {
  readonly approval_event_id: EventId;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly artifact_paths: readonly string[];
  readonly assessments: FunctionalDesignCompletionAssessments;
}

export interface ImplementationAdditionalReview {
  readonly requested: false;
}

export interface ImplementationRequestedReview {
  readonly requested: true;
  readonly request_event_id: EventId;
  readonly evidence_id: EvidenceId;
  readonly reviewer: string;
  readonly findings: readonly string[];
}

export interface ImplementationCompletionHandoff {
  readonly status: "ready" | "blocked";
  readonly reason: string;
  readonly recipient: "unit-of-work-review";
  readonly artifacts: readonly string[];
}

export interface ImplementationCompletionReference {
  readonly assessment_event_id: EventId;
}

export interface UnitOfWorkReviewCompletionRecord {
  readonly implementation_completion_event_id: EventId;
  readonly reviewed_material_bindings: readonly ArtifactBinding[];
  readonly final_checkpoints: readonly RepositoryCheckpoint[];
  readonly reviewer: string;
  readonly implementation_authors: readonly string[];
  readonly implementation_evidence_assessment_id: EvidenceId;
  readonly review_evidence_id: EvidenceId;
  readonly self_review_evidence_id: EvidenceId;
  readonly findings: { readonly blocking: readonly string[]; readonly limitations: readonly { readonly finding: string; readonly rationale: string }[] };
  readonly additional_review: { readonly requested: false } | {
    readonly requested: true;
    readonly request_event_id: EventId;
    readonly evidence_id: EvidenceId;
    readonly reviewer: string;
    readonly findings: readonly string[];
  };
  readonly acceptance_required: boolean;
  readonly approval_event_id?: EventId;
  readonly handoff: { readonly status: "ready" | "blocked"; readonly recipient: "deliver"; readonly summary: string };
}

export interface DeliverCompletionRecord {
  readonly review_completion_event_id: EventId;
  readonly outcome: "repository-handoff" | "review-request" | "publication" | "deployment" | "other";
  readonly requested_outcome: string;
  readonly destination: string;
  readonly recipient: string;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly reviewed_checkpoints: readonly RepositoryCheckpoint[];
  readonly preparation_evidence_id: EvidenceId;
  readonly self_review_evidence_id: EvidenceId;
  readonly operation_results: readonly {
    readonly operation: string;
    readonly status: "succeeded" | "failed" | "partial";
    readonly evidence_id: EvidenceId;
    readonly source_checkpoints: readonly RepositoryCheckpoint[];
    readonly authority: { readonly kind: "requester-instruction"; readonly event_id: EventId } | { readonly kind: "project-authority"; readonly reference: string };
  }[];
  readonly verification_evidence_ids: readonly EvidenceId[];
  readonly handoff_evidence_id: EvidenceId;
  readonly additional_review?: ImplementationAdditionalReview | ImplementationRequestedReview;
  readonly approval_required: boolean;
  readonly approval_event_id?: EventId;
  readonly handoff: { readonly status: "ready" | "blocked"; readonly summary: string };
}

export interface StageAttemptCompletedData extends StageAttemptData {
  readonly evidence_ids: readonly EvidenceId[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
  readonly functional_design_assessment?: FunctionalDesignCompletionRecord;
  readonly quality_requirements_assessment?: QualityRequirementsCompletionRecord;
  readonly implementation_planning_assessment?: ImplementationPlanningCompletionRecord;
  readonly implementation_assessment?: ImplementationCompletionReference;
  readonly unit_of_work_review_assessment?: UnitOfWorkReviewCompletionRecord;
  readonly deliver_assessment?: DeliverCompletionRecord;
}

export interface StageAttemptEndedData extends StageAttemptData {
  readonly revision_id: RevisionId;
  readonly reason: string;
}

export interface StageReopenedData extends ConstructionBaseData {
  readonly stage: ConstructionStage;
  readonly stage_attempt_id?: StageAttemptId;
  readonly revision_id: RevisionId;
  readonly reason: string;
}

export interface TaskAdmissionData extends StageAttemptData {
  readonly stage: "implementation";
  readonly task_id: TaskId;
  readonly graph_ref: GraphReference;
  readonly task_definition_ref: TaskDefinitionReference;
  readonly admission_baseline: readonly RepositoryCheckpoint[];
  readonly predecessor_provenance: readonly {
    readonly task_id: TaskId;
    readonly integration_event_id: EventId;
    readonly checkpoints: readonly RepositoryCheckpoint[];
  }[];
  readonly prerequisite_evidence: readonly EvidenceId[];
}

export interface TaskRevisionData extends StageAttemptData {
  readonly stage: "implementation";
  readonly task_id: TaskId;
  readonly revision_id: RevisionId;
  readonly reason: string;
  readonly affected_activities: readonly ConstructionActivity[];
}

export interface TaskCompletedData extends StageAttemptData {
  readonly stage: "implementation";
  readonly task_id: TaskId;
  readonly integration_event_id: EventId;
  readonly conditions: readonly string[];
}

export interface ActivityAttemptData extends StageAttemptData {
  readonly stage: "implementation";
  readonly task_id: TaskId;
  readonly activity: ConstructionActivity;
  readonly activity_attempt_id: ActivityAttemptId;
}

export interface ActivityAttemptStartedData extends ActivityAttemptData {
  readonly inputs: readonly MaterialInput[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
}

export interface ActivityWaitingData extends ActivityAttemptData {
  readonly reason: string;
}

export interface ActivityPauseData extends ActivityAttemptData {
  readonly reason: string;
}

export interface ActivityAttemptCompletedData extends ActivityAttemptData {
  readonly evidence_ids: readonly EvidenceId[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
}

export interface ActivityAttemptEndedData extends ActivityAttemptData {
  readonly revision_id: RevisionId;
  readonly reason: string;
}

export interface ActivityReopenedData extends ConstructionBaseData {
  readonly stage: "implementation";
  readonly task_id: TaskId;
  readonly activity: ConstructionActivity;
  readonly activity_attempt_id?: ActivityAttemptId;
  readonly stage_attempt_id: StageAttemptId;
  readonly revision_id: RevisionId;
  readonly reason: string;
}

export interface EvidenceRecordedData extends ConstructionBaseData {
  readonly evidence_id: EvidenceId;
  readonly stage: ConstructionStage;
  readonly stage_attempt_id: StageAttemptId;
  readonly task_id?: TaskId;
  readonly activity?: ConstructionActivity;
  readonly activity_attempt_id?: ActivityAttemptId;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
  readonly inputs: readonly MaterialInput[];
  readonly check: string;
  readonly executor: string;
  readonly result: { readonly status: "passed" | "failed" | "inconclusive"; readonly summary: string };
  readonly output_refs: readonly string[];
  readonly conditions: readonly string[];
}

export interface ApprovalRecordedData extends ConstructionBaseData {
  readonly stage: ConstructionStage;
  readonly stage_attempt_id: StageAttemptId;
  readonly task_id?: TaskId;
  readonly activity?: ConstructionActivity;
  readonly activity_attempt_id?: ActivityAttemptId;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly checkpoints: readonly RepositoryCheckpoint[];
  readonly requester: string;
  readonly inputs: readonly MaterialInput[];
  readonly decision_reference: string;
}

export type EffortSelection =
  | { readonly target: "unit"; readonly action: "set"; readonly level: EffortLevel; readonly selected_by: string }
  | { readonly target: "stage"; readonly stage: ConstructionStage; readonly action: "set"; readonly level: EffortLevel; readonly selected_by: string }
  | { readonly target: "stage"; readonly stage: ConstructionStage; readonly action: "inherit"; readonly selected_by: string };

export interface InteractionRecordedData extends ConstructionBaseData {
  readonly stage?: ConstructionStage;
  readonly stage_attempt_id?: StageAttemptId;
  readonly task_id?: TaskId;
  readonly activity?: ConstructionActivity;
  readonly activity_attempt_id?: ActivityAttemptId;
  readonly participants: readonly string[];
  readonly content: string;
  readonly references: readonly string[];
  readonly reply_reference?: string;
  readonly effort_selection?: EffortSelection;
}

export interface IntegrationPreparedData extends ActivityAttemptData {
  readonly activity: "code-integration";
  readonly captured_inputs: readonly RepositoryCheckpoint[];
  readonly candidate_checkpoints: readonly RepositoryCheckpoint[];
  readonly task_output_refs: readonly string[];
  readonly source_evidence_ids: readonly EvidenceId[];
  readonly inputs: readonly MaterialInput[];
}

export interface IntegrationAcceptedData extends ActivityAttemptData {
  readonly activity: "code-integration";
  readonly prepared_event_id: EventId;
  readonly candidate_checkpoints: readonly RepositoryCheckpoint[];
  readonly repository_results: readonly {
    readonly repository_id: string;
    readonly evidence_ids: readonly EvidenceId[];
  }[];
  readonly authority_event_ids: readonly EventId[];
}

export interface RevisionAuthorizedData extends ConstructionBaseData {
  readonly revision_id: RevisionId;
  readonly orchestrator_decision: string;
  readonly reason: string;
  readonly stage: ConstructionStage;
  readonly stage_attempt_id?: StageAttemptId;
  readonly task_id?: TaskId;
  readonly activity?: ConstructionActivity;
  readonly activity_attempt_id?: ActivityAttemptId;
}

export interface RetainedScopeAssessment {
  readonly task_id: TaskId;
  readonly activity: ConstructionActivity;
  readonly original_stage_attempt_id: StageAttemptId;
  readonly original_activity_attempt_id: ActivityAttemptId;
  readonly original_evidence_ids: readonly EvidenceId[];
  readonly applicable: boolean;
  readonly reason: string;
  readonly checkpoints: readonly RepositoryCheckpoint[];
}

export interface RetainedScopeAssessedData extends StageAttemptData {
  readonly stage: "implementation";
  readonly assessments: readonly RetainedScopeAssessment[];
}

export interface ImplementationCompletionAssessedData extends StageAttemptData {
  readonly stage: "implementation";
  readonly final_checkpoints: readonly RepositoryCheckpoint[];
  readonly artifact_paths: readonly string[];
  readonly task_graph_path: string;
  readonly graph_ref: GraphReference;
  readonly task_ids: readonly TaskId[];
  readonly reviewed_material_bindings: readonly ArtifactBinding[];
  readonly self_review_evidence_id: EvidenceId;
  readonly handoff_evidence_id: EvidenceId;
  readonly unit_check_evidence_ids: readonly EvidenceId[];
  readonly required_check_evidence_ids: readonly EvidenceId[];
  readonly integration_event_ids: readonly EventId[];
  readonly retained_assessment_event_ids: readonly EventId[];
  readonly additional_review: ImplementationAdditionalReview | ImplementationRequestedReview;
  readonly blocking_findings: readonly string[];
  readonly handoff_assessment: ImplementationCompletionHandoff;
}

export interface ConstructionEventDataMap {
  "construction.mission-created": MissionCreatedData;
  "construction.mission-workspaces-prepared": MissionWorkspacePreparedData;
  "construction.unit-created": UnitCreatedData;
  "construction.unit-baseline-selected": UnitBaselineSelectedData;
  "construction.stage-attempt-started": StageAttemptStartedData;
  "construction.stage-waiting": StageWaitingData;
  "construction.stage-pause-requested": StagePauseData;
  "construction.stage-paused": StagePauseData;
  "construction.stage-resumed": StageAttemptStartedData;
  "construction.stage-attempt-completed": StageAttemptCompletedData;
  "construction.stage-attempt-ended-by-revision": StageAttemptEndedData;
  "construction.stage-reopened": StageReopenedData;
  "construction.task-admitted": TaskAdmissionData;
  "construction.task-scope-ended-by-revision": TaskRevisionData;
  "construction.task-scope-reopened": TaskRevisionData;
  "construction.task-completed": TaskCompletedData;
  "construction.activity-attempt-started": ActivityAttemptStartedData;
  "construction.activity-waiting": ActivityWaitingData;
  "construction.activity-pause-requested": ActivityPauseData;
  "construction.activity-paused": ActivityPauseData;
  "construction.activity-resumed": ActivityAttemptStartedData;
  "construction.activity-attempt-completed": ActivityAttemptCompletedData;
  "construction.activity-attempt-ended-by-revision": ActivityAttemptEndedData;
  "construction.activity-reopened": ActivityReopenedData;
  "construction.evidence-recorded": EvidenceRecordedData;
  "construction.approval-recorded": ApprovalRecordedData;
  "construction.interaction-recorded": InteractionRecordedData;
  "construction.integration-prepared": IntegrationPreparedData;
  "construction.integration-accepted": IntegrationAcceptedData;
  "construction.revision-authorized": RevisionAuthorizedData;
  "construction.retained-scope-assessed": RetainedScopeAssessedData;
  "construction.implementation-completion-assessed": ImplementationCompletionAssessedData;
}

export type ConstructionEventData<T extends ConstructionEventType> = ConstructionEventDataMap[T];

export interface ConstructionEventRecord extends EventEnvelope {
  readonly phase: typeof CONSTRUCTION_PHASE;
  readonly type: ConstructionEventType;
}

export type ConstructionEventValidation =
  | { readonly status: "valid"; readonly event: ConstructionEventRecord }
  | {
      readonly status: "unsupported";
      readonly event: EventEnvelope;
      readonly reason: "envelope-version" | "phase" | "event-type" | "event-version";
    }
  | { readonly status: "invalid"; readonly issues: readonly EventEnvelopeIssue[] };

const stageStates = new Set<string>(CONSTRUCTION_STAGES);
const activityStates = new Set<string>(CONSTRUCTION_ACTIVITIES);
const eventTypes = new Set<string>(CONSTRUCTION_EVENT_TYPES);
const effortLevels = new Set<string>(["minimal", "standard", "comprehensive"]);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isUuidV4 = (value: unknown): value is string =>
  typeof value === "string" && uuidV4.test(value);

const isOneOf = (value: unknown, values: ReadonlySet<string>): value is string =>
  typeof value === "string" && values.has(value);

const isStringArray = (value: unknown, nonEmpty = false): value is readonly string[] =>
  Array.isArray(value) && value.every(isNonEmptyString) && (!nonEmpty || value.length > 0);

const isUniqueStringArray = (value: unknown, nonEmpty = false): boolean =>
  isStringArray(value, nonEmpty) && new Set(value).size === value.length;

const isRelativeArtifactPath = (value: unknown): value is string => isNonEmptyString(value) &&
  !value.startsWith("/") && !value.includes("\\") && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");

const isArtifactPathArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isRelativeArtifactPath) && new Set(value).size === value.length;

const isCheckpoint = (value: unknown): value is RepositoryCheckpoint =>
  isRecord(value) && isNonEmptyString(value.repository_id) && isNonEmptyString(value.commit);

const isCheckpointSet = (value: unknown): value is readonly RepositoryCheckpoint[] =>
  Array.isArray(value) && value.every(isCheckpoint) &&
  new Set(value.map((checkpoint) => checkpoint.repository_id)).size === value.length;

const isInputs = (value: unknown): value is readonly MaterialInput[] =>
  Array.isArray(value) && value.every((input) =>
    isRecord(input) && isNonEmptyString(input.reference) && isNonEmptyString(input.purpose),
  );

const isArtifactBindings = (value: unknown): value is readonly ArtifactBinding[] =>
  Array.isArray(value) && value.every((binding) =>
    isRecord(binding) && isUuidV4(binding.artifact_id) &&
    (binding.content_version === undefined || isNonEmptyString(binding.content_version)) &&
    (binding.checkpoint === undefined || isCheckpoint(binding.checkpoint)),
  );

const isExecutionBinding = (data: Record<string, unknown>): boolean => {
  if (!isOneOf(data.stage, stageStates) || !isUuidV4(data.stage_attempt_id)) return false;
  if (data.task_id !== undefined && (!isUuidV4(data.task_id) || data.stage !== "implementation")) return false;
  const hasActivityBinding = data.activity !== undefined || data.activity_attempt_id !== undefined;
  if (!hasActivityBinding) return true;
  return data.stage === "implementation" && isUuidV4(data.task_id) &&
    isOneOf(data.activity, activityStates) && isUuidV4(data.activity_attempt_id);
};

const isGraphReference = (value: unknown): value is GraphReference =>
  isRecord(value) && isUuidV4(value.graph_id) && isNonEmptyString(value.content_version) &&
  (value.checkpoint === undefined || isCheckpoint(value.checkpoint));

const isTaskDefinitionReference = (value: unknown): value is TaskDefinitionReference =>
  isRecord(value) && isUuidV4(value.graph_id) && isUuidV4(value.task_id) &&
  isNonEmptyString(value.content_version) &&
  (value.checkpoint === undefined || isCheckpoint(value.checkpoint));

const isEvidenceIdArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isUuidV4) && new Set(value).size === value.length;

const isEventIdArray = (value: unknown): boolean =>
  isUniqueStringArray(value);

const isImplementationAdditionalReview = (value: unknown): boolean =>
  isRecord(value) && value.requested === false && Object.keys(value).length === 1;

const isImplementationRequestedReview = (value: unknown): boolean =>
  isRecord(value) && value.requested === true && isUuidV4(value.request_event_id) &&
  isUuidV4(value.evidence_id) && isNonEmptyString(value.reviewer) && isStringArray(value.findings);

const isImplementationCompletionHandoff = (value: unknown): value is ImplementationCompletionHandoff =>
  isRecord(value) && isOneOf(value.status, new Set(["ready", "blocked"])) && isNonEmptyString(value.reason) &&
  value.recipient === "unit-of-work-review" && isStringArray(value.artifacts, true);

const isImplementationCompletionReference = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 1 && isUuidV4(value.assessment_event_id);

export const isUnitOfWorkReviewCompletionRecord = (value: unknown): value is UnitOfWorkReviewCompletionRecord => {
  if (!isRecord(value) || !isUuidV4(value.implementation_completion_event_id) ||
      !isArtifactBindings(value.reviewed_material_bindings) || !isCheckpointSet(value.final_checkpoints) ||
      !isNonEmptyString(value.reviewer) || !isStringArray(value.implementation_authors, true) ||
      value.implementation_authors.includes(value.reviewer) || !isUuidV4(value.implementation_evidence_assessment_id) ||
      !isUuidV4(value.review_evidence_id) || !isUuidV4(value.self_review_evidence_id) || !isRecord(value.findings) ||
      !isStringArray(value.findings.blocking) || !Array.isArray(value.findings.limitations) ||
      !value.findings.limitations.every((item) => isRecord(item) && isNonEmptyString(item.finding) && isNonEmptyString(item.rationale)) ||
      typeof value.acceptance_required !== "boolean" || !isRecord(value.handoff) ||
      !isOneOf(value.handoff.status, new Set(["ready", "blocked"])) || value.handoff.recipient !== "deliver" ||
      !isNonEmptyString(value.handoff.summary)) return false;
  if (value.additional_review === undefined || !isRecord(value.additional_review)) return false;
  const externalReviewValid = value.additional_review.requested === false
    ? Object.keys(value.additional_review).length === 1
    : value.additional_review.requested === true && isUuidV4(value.additional_review.request_event_id) &&
      isUuidV4(value.additional_review.evidence_id) && isNonEmptyString(value.additional_review.reviewer) &&
      isStringArray(value.additional_review.findings);
  return externalReviewValid && (value.acceptance_required ? isUuidV4(value.approval_event_id) : value.approval_event_id === undefined);
};

export const isDeliverCompletionRecord = (value: unknown): value is DeliverCompletionRecord => {
  if (!isRecord(value) || !isUuidV4(value.review_completion_event_id) ||
      !isOneOf(value.outcome, new Set(["repository-handoff", "review-request", "publication", "deployment", "other"])) ||
      !isNonEmptyString(value.requested_outcome) || !isNonEmptyString(value.destination) || !isNonEmptyString(value.recipient) ||
      !isArtifactBindings(value.artifact_bindings) || !isCheckpointSet(value.reviewed_checkpoints) ||
      !isUuidV4(value.preparation_evidence_id) || !isUuidV4(value.self_review_evidence_id) ||
      !Array.isArray(value.operation_results) || !value.operation_results.every((operation) =>
        isRecord(operation) && isNonEmptyString(operation.operation) &&
        isOneOf(operation.status, new Set(["succeeded", "failed", "partial"])) && isUuidV4(operation.evidence_id) &&
        isCheckpointSet(operation.source_checkpoints) && operation.source_checkpoints.length > 0 && isRecord(operation.authority) && (operation.authority.kind === "requester-instruction"
          ? isUuidV4(operation.authority.event_id)
          : operation.authority.kind === "project-authority" && isNonEmptyString(operation.authority.reference)),
      ) || !isEvidenceIdArray(value.verification_evidence_ids) || !isUuidV4(value.handoff_evidence_id) ||
      (value.additional_review !== undefined && !(isImplementationAdditionalReview(value.additional_review) || isImplementationRequestedReview(value.additional_review))) ||
      typeof value.approval_required !== "boolean" || !isRecord(value.handoff) ||
      !isOneOf(value.handoff.status, new Set(["ready", "blocked"])) || !isNonEmptyString(value.handoff.summary)) return false;
  return value.approval_required ? isUuidV4(value.approval_event_id) : value.approval_event_id === undefined;
};

const isBaseData = (data: Record<string, unknown>): boolean =>
  isUuidV4(data.mission_id) && isNonEmptyString(data.unit_id);

export const isActivityAttemptCompletedData = (value: unknown): value is ActivityAttemptCompletedData =>
  isRecord(value) && isBaseData(value) && value.stage === "implementation" &&
  isUuidV4(value.stage_attempt_id) && isUuidV4(value.task_id) && isOneOf(value.activity, activityStates) &&
  isUuidV4(value.activity_attempt_id) && isEvidenceIdArray(value.evidence_ids) && isCheckpointSet(value.checkpoints);

export const isRetainedScopeAssessment = (value: unknown): value is RetainedScopeAssessment =>
  isRecord(value) && Object.keys(value).length === 8 && isUuidV4(value.task_id) &&
  isOneOf(value.activity, activityStates) && isUuidV4(value.original_stage_attempt_id) &&
  isUuidV4(value.original_activity_attempt_id) && Array.isArray(value.original_evidence_ids) &&
  isEvidenceIdArray(value.original_evidence_ids) && value.original_evidence_ids.length > 0 && typeof value.applicable === "boolean" &&
  isNonEmptyString(value.reason) && isCheckpointSet(value.checkpoints) && value.checkpoints.length > 0;

export const isRetainedScopeAssessedData = (value: unknown): value is RetainedScopeAssessedData =>
  isRecord(value) && isBaseData(value) && value.stage === "implementation" && isUuidV4(value.stage_attempt_id) &&
  Array.isArray(value.assessments) && value.assessments.length > 0 &&
  value.assessments.every(isRetainedScopeAssessment) &&
  new Set(value.assessments.map((assessment) => JSON.stringify([assessment.task_id, assessment.activity]))).size === value.assessments.length;

export const isImplementationCompletionAssessedData = (value: unknown): value is ImplementationCompletionAssessedData => {
  if (!isRecord(value) || !isBaseData(value) || value.stage !== "implementation" || !isUuidV4(value.stage_attempt_id) ||
      !isCheckpointSet(value.final_checkpoints) || value.final_checkpoints.length === 0 ||
      !isArtifactPathArray(value.artifact_paths) || !isRelativeArtifactPath(value.task_graph_path) || value.task_graph_path !== "tasks-dag.json" ||
      !isGraphReference(value.graph_ref) || !Array.isArray(value.task_ids) || !isUniqueStringArray(value.task_ids, true) ||
      !value.task_ids.every(isUuidV4) || !isArtifactBindings(value.reviewed_material_bindings) ||
      !isUuidV4(value.self_review_evidence_id) || !isUuidV4(value.handoff_evidence_id) ||
      !Array.isArray(value.unit_check_evidence_ids) || !isEvidenceIdArray(value.unit_check_evidence_ids) || value.unit_check_evidence_ids.length === 0 ||
      !Array.isArray(value.required_check_evidence_ids) || !isEvidenceIdArray(value.required_check_evidence_ids) ||
      value.required_check_evidence_ids.length === 0 || !Array.isArray(value.integration_event_ids) ||
      !isEventIdArray(value.integration_event_ids) || value.integration_event_ids.length === 0 ||
      !value.integration_event_ids.every(isUuidV4) || !Array.isArray(value.retained_assessment_event_ids) ||
      !isEventIdArray(value.retained_assessment_event_ids) || !value.retained_assessment_event_ids.every(isUuidV4) ||
      !(isImplementationAdditionalReview(value.additional_review) || isImplementationRequestedReview(value.additional_review)) ||
      !isStringArray(value.blocking_findings)) return false;
  const expectedHandoffPaths = [...value.artifact_paths, value.task_graph_path].sort((left, right) => left.localeCompare(right));
  return isImplementationCompletionHandoff(value.handoff_assessment) &&
    JSON.stringify([...value.handoff_assessment.artifacts].sort((left, right) => left.localeCompare(right))) === JSON.stringify(expectedHandoffPaths);
};

const isMissionContext = (value: unknown): value is MissionWorkspaceContext =>
  isRecord(value) && (
    value.kind === "existing" ||
    value.kind === "new" ||
    (value.kind === "previous" && isNonEmptyString(value.workspace_id) &&
      isUuidV4(value.mission_id) && isNonEmptyString(value.record_home_repository_id))
  );

const isMissionBranchSelection = (value: unknown): value is MissionBranchSelection =>
  isRecord(value) && (
    value.kind === "current" ||
    value.kind === "default" ||
    ((value.kind === "existing") && isNonEmptyString(value.name)) ||
    (value.kind === "new" && isNonEmptyString(value.name) && isNonEmptyString(value.base))
  );

const isMissionStartingCheckpoint = (value: unknown): value is MissionStartingCheckpoint =>
  isRecord(value) && (
    (value.kind === "commit" && isNonEmptyString(value.commit)) ||
    value.kind === "no-commit"
  );

const isMissionWorkspaceSelection = (value: unknown): value is MissionWorkspaceSelection =>
  isRecord(value) && isNonEmptyString(value.repository_id) &&
  isMissionContext(value.context) && isMissionBranchSelection(value.branch) &&
  isNonEmptyString(value.integration_target) &&
  isMissionStartingCheckpoint(value.starting_checkpoint);

const hasNoIdentityReuse = (event: EventEnvelope, data: Record<string, unknown>): boolean => {
  const domainIds = [
    data.mission_id,
    data.stage_attempt_id,
    data.task_id,
    data.activity_attempt_id,
    data.revision_id,
    data.evidence_id,
    isRecord(data.graph_ref) ? data.graph_ref.graph_id : undefined,
  ].filter((id): id is string => typeof id === "string");
  return !domainIds.includes(event.id) && new Set(domainIds).size === domainIds.length;
};

const isInitialEffort = (value: unknown): boolean => {
  if (!isRecord(value) || !effortLevels.has(String(value.default)) || !isNonEmptyString(value.selected_by) || !isRecord(value.stage_overrides)) return false;
  return Object.entries(value.stage_overrides).every(([stage, level]) =>
    stageStates.has(stage) && effortLevels.has(String(level)),
  );
};

const isIntegrationTargets = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) =>
    isRecord(item) && isNonEmptyString(item.repository_id) && isNonEmptyString(item.target),
  ) && new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;

const isEffortSelection = (value: unknown): boolean => {
  if (!isRecord(value) || !isNonEmptyString(value.selected_by)) return false;
  if (value.target === "unit") return value.action === "set" && effortLevels.has(String(value.level));
  if (value.target !== "stage" || !isOneOf(value.stage, stageStates)) return false;
  return (value.action === "set" && effortLevels.has(String(value.level))) || value.action === "inherit";
};

export const CONSTRUCTION_EVENT_REQUIRED_FIELDS: Readonly<Record<ConstructionEventType, readonly string[]>> = {
  "construction.mission-created": ["mission_id", "title", "request", "workflow", "record_home", "contexts", "repositories"],
  "construction.mission-workspaces-prepared": ["mission_id", "repositories"],
  "construction.unit-created": ["directory", "workflow", "initial_effort"],
  "construction.unit-baseline-selected": ["review_baseline", "integration_targets"],
  "construction.stage-attempt-started": ["stage", "stage_attempt_id", "inputs", "checkpoints", "authority_event_ids"],
  "construction.stage-waiting": ["stage", "stage_attempt_id", "reason"],
  "construction.stage-pause-requested": ["stage", "stage_attempt_id", "reason"],
  "construction.stage-paused": ["stage", "stage_attempt_id", "reason"],
  "construction.stage-resumed": ["stage", "stage_attempt_id", "inputs", "checkpoints", "authority_event_ids"],
  "construction.stage-attempt-completed": ["stage", "stage_attempt_id", "evidence_ids", "checkpoints"],
  "construction.stage-attempt-ended-by-revision": ["stage", "stage_attempt_id", "revision_id", "reason"],
  "construction.stage-reopened": ["stage", "revision_id", "reason"],
  "construction.task-admitted": ["stage", "stage_attempt_id", "task_id", "graph_ref", "task_definition_ref", "admission_baseline", "predecessor_provenance", "prerequisite_evidence"],
  "construction.task-scope-ended-by-revision": ["stage", "stage_attempt_id", "task_id", "revision_id", "reason", "affected_activities"],
  "construction.task-scope-reopened": ["stage", "stage_attempt_id", "task_id", "revision_id", "reason", "affected_activities"],
  "construction.task-completed": ["stage", "stage_attempt_id", "task_id", "integration_event_id", "conditions"],
  "construction.activity-attempt-started": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "inputs", "checkpoints"],
  "construction.activity-waiting": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "reason"],
  "construction.activity-pause-requested": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "reason"],
  "construction.activity-paused": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "reason"],
  "construction.activity-resumed": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "inputs", "checkpoints"],
  "construction.activity-attempt-completed": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "evidence_ids", "checkpoints"],
  "construction.activity-attempt-ended-by-revision": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "revision_id", "reason"],
  "construction.activity-reopened": ["stage", "stage_attempt_id", "task_id", "activity", "revision_id", "reason"],
  "construction.evidence-recorded": ["evidence_id", "stage", "stage_attempt_id", "artifact_bindings", "checkpoints", "inputs", "check", "executor", "result", "output_refs", "conditions"],
  "construction.approval-recorded": ["stage", "stage_attempt_id", "artifact_bindings", "checkpoints", "requester", "inputs", "decision_reference"],
  "construction.interaction-recorded": ["participants", "content", "references"],
  "construction.integration-prepared": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "captured_inputs", "candidate_checkpoints", "task_output_refs", "source_evidence_ids", "inputs"],
  "construction.integration-accepted": ["stage", "stage_attempt_id", "task_id", "activity", "activity_attempt_id", "prepared_event_id", "candidate_checkpoints", "repository_results", "authority_event_ids"],
  "construction.revision-authorized": ["revision_id", "orchestrator_decision", "reason", "stage"],
  "construction.retained-scope-assessed": ["stage", "stage_attempt_id", "assessments"],
  "construction.implementation-completion-assessed": ["stage", "stage_attempt_id", "final_checkpoints", "graph_ref", "task_ids", "reviewed_material_bindings", "self_review_evidence_id", "handoff_evidence_id", "unit_check_evidence_ids", "required_check_evidence_ids", "integration_event_ids", "retained_assessment_event_ids", "additional_review", "blocking_findings", "handoff_assessment"],
};

const validatePayload = (
  type: ConstructionEventType,
  event: EventEnvelope,
  data: Record<string, unknown>,
): readonly EventEnvelopeIssue[] => {
  const issues: EventEnvelopeIssue[] = [];
  for (const field of CONSTRUCTION_EVENT_REQUIRED_FIELDS[type]) {
    if (!Object.hasOwn(data, field) || data[field] === undefined || data[field] === null) {
      issues.push({ path: `/data/${field}`, message: "Required Construction payload field is missing" });
    }
  }
  const missionScoped = type === "construction.mission-created" || type === "construction.mission-workspaces-prepared";
  if (missionScoped ? !isUuidV4(data.mission_id) : !isBaseData(data)) {
    issues.push({ path: "/data", message: missionScoped ? "Expected a mission UUID" : "Expected a mission UUID and unit identity" });
  }
  if (!hasNoIdentityReuse(event, data)) issues.push({ path: "/data", message: "Distinct event and domain identities must not be reused" });
  const invalid = (field: string, valid: boolean, message = "Invalid Construction payload value") => {
    if (!valid) issues.push({ path: `/data/${field}`, message });
  };
  const stage = type.includes("stage-") || type === "construction.retained-scope-assessed" || type === "construction.implementation-completion-assessed";
  const task = type.includes("task-") || type.startsWith("construction.activity-") || type.startsWith("construction.integration-");
  const activity = type.startsWith("construction.activity-") || type.startsWith("construction.integration-");
  if (stage || task || activity || type === "construction.revision-authorized") {
    invalid("stage", isOneOf(data.stage, stageStates));
  }
  if (task) {
    invalid("stage", data.stage === "implementation");
    invalid("task_id", isUuidV4(data.task_id));
  }
  if (activity) invalid("activity", isOneOf(data.activity, activityStates));
  if (stage && !["construction.stage-reopened", "construction.revision-authorized"].includes(type)) {
    invalid("stage_attempt_id", isUuidV4(data.stage_attempt_id));
  }
  if (task) invalid("stage_attempt_id", isUuidV4(data.stage_attempt_id));
  if (activity && !["construction.activity-reopened"].includes(type)) {
    invalid("activity_attempt_id", isUuidV4(data.activity_attempt_id));
  }
  if (type === "construction.mission-created") {
    invalid("mission_id", isUuidV4(data.mission_id));
    invalid("title", isNonEmptyString(data.title));
    invalid("request", isNonEmptyString(data.request));
    invalid("workflow", data.workflow === "standard");
    invalid("record_home", isRecord(data.record_home) && isNonEmptyString(data.record_home.repository_id));
    invalid("contexts", isInputs(data.contexts));
    invalid("repositories", Array.isArray(data.repositories) && data.repositories.length > 0 &&
      data.repositories.every(isMissionWorkspaceSelection) &&
      new Set(data.repositories.map((repository) => isRecord(repository) ? repository.repository_id : undefined)).size === data.repositories.length);
  }
  if (type === "construction.mission-workspaces-prepared") {
    invalid("mission_id", isUuidV4(data.mission_id));
    invalid("repositories", Array.isArray(data.repositories) && data.repositories.length > 0 && data.repositories.every((repository) =>
      isRecord(repository) && isNonEmptyString(repository.repository_id) &&
      isMissionContext(repository.context) && isNonEmptyString(repository.branch) &&
      isNonEmptyString(repository.integration_target) &&
      isMissionStartingCheckpoint(repository.starting_checkpoint),
    ) && new Set(data.repositories.map((repository) => isRecord(repository) ? repository.repository_id : undefined)).size === data.repositories.length);
  }
  if (type === "construction.unit-created") {
    invalid("directory", isNonEmptyString(data.directory));
    invalid("workflow", data.workflow === "standard");
    invalid("initial_effort", isInitialEffort(data.initial_effort));
  }
  if (type === "construction.unit-baseline-selected") {
    invalid("review_baseline", isCheckpointSet(data.review_baseline));
    invalid("integration_targets", isIntegrationTargets(data.integration_targets));
  }
  if (["construction.stage-attempt-started", "construction.stage-resumed"].includes(type)) {
    invalid("inputs", isInputs(data.inputs));
    invalid("checkpoints", isCheckpointSet(data.checkpoints));
    invalid("authority_event_ids", isEventIdArray(data.authority_event_ids));
  }
  if (["construction.stage-waiting", "construction.stage-pause-requested", "construction.stage-paused", "construction.activity-waiting", "construction.activity-pause-requested", "construction.activity-paused", "construction.stage-attempt-ended-by-revision", "construction.task-scope-ended-by-revision", "construction.task-scope-reopened", "construction.activity-attempt-ended-by-revision", "construction.activity-reopened", "construction.stage-reopened", "construction.revision-authorized"].includes(type)) {
    invalid("reason", isNonEmptyString(data.reason));
  }
  if (["construction.stage-attempt-completed", "construction.activity-attempt-completed"].includes(type)) {
    invalid("evidence_ids", isEvidenceIdArray(data.evidence_ids));
    invalid("checkpoints", isCheckpointSet(data.checkpoints));
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "functional-design") {
    const assessment = data.functional_design_assessment;
    const assessmentValid = isFunctionalDesignCompletionRecord(assessment);
    invalid("functional_design_assessment", assessmentValid);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("checkpoints", Array.isArray(data.checkpoints) && data.checkpoints.length > 0,
      "Functional Design completion requires a non-empty repository output checkpoint set");
    if (assessmentValid) {
      const expectedEvidenceIds = functionalDesignEvidenceIds(assessment.assessments).slice().sort();
      const actualEvidenceIds = data.evidence_ids;
      const evidenceIdsMatch = Array.isArray(actualEvidenceIds) && actualEvidenceIds.every((id) => typeof id === "string") &&
        actualEvidenceIds.length === expectedEvidenceIds.length &&
        JSON.stringify([...actualEvidenceIds].sort()) === JSON.stringify(expectedEvidenceIds);
      invalid("evidence_ids", evidenceIdsMatch, "Functional Design evidence IDs must exactly match its typed assessments");
    }
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "quality-requirements") {
    const assessment = data.quality_requirements_assessment;
    const assessmentValid = isQualityRequirementsCompletionRecord(assessment);
    invalid("quality_requirements_assessment", assessmentValid);
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("checkpoints", Array.isArray(data.checkpoints) && data.checkpoints.length > 0,
      "Quality Requirements completion requires a non-empty repository output checkpoint set");
    if (assessmentValid) {
      const expectedEvidenceIds = qualityRequirementsEvidenceIds(assessment.assessments).slice().sort();
      const actualEvidenceIds = data.evidence_ids;
      const evidenceIdsMatch = Array.isArray(actualEvidenceIds) && actualEvidenceIds.every((id) => typeof id === "string") &&
        actualEvidenceIds.length === expectedEvidenceIds.length &&
        JSON.stringify([...actualEvidenceIds].sort()) === JSON.stringify(expectedEvidenceIds);
      invalid("evidence_ids", evidenceIdsMatch, "Quality Requirements evidence IDs must exactly match its typed assessments");
    }
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "implementation-planning") {
    const assessment = data.implementation_planning_assessment;
    const assessmentValid = isImplementationPlanningCompletionRecord(assessment);
    invalid("implementation_planning_assessment", assessmentValid);
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("checkpoints", Array.isArray(data.checkpoints) && data.checkpoints.length > 0,
      "Implementation Planning completion requires a non-empty repository output checkpoint set");
    if (assessmentValid) {
      const expectedEvidenceIds = planningEvidenceIds(assessment.assessments).slice().sort();
      const actualEvidenceIds = data.evidence_ids;
      const evidenceIdsMatch = Array.isArray(actualEvidenceIds) && actualEvidenceIds.every((id) => typeof id === "string") &&
        actualEvidenceIds.length === expectedEvidenceIds.length &&
        JSON.stringify([...actualEvidenceIds].sort()) === JSON.stringify(expectedEvidenceIds);
      invalid("evidence_ids", evidenceIdsMatch, "Implementation Planning evidence IDs must exactly match its typed assessments");
    }
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "implementation") {
    invalid("implementation_assessment", isImplementationCompletionReference(data.implementation_assessment));
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("unit_of_work_review_assessment", data.unit_of_work_review_assessment === undefined);
    invalid("deliver_assessment", data.deliver_assessment === undefined);
    invalid("checkpoints", isCheckpointSet(data.checkpoints) && data.checkpoints.length > 0);
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "unit-of-work-review") {
    invalid("unit_of_work_review_assessment", isUnitOfWorkReviewCompletionRecord(data.unit_of_work_review_assessment));
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("implementation_assessment", data.implementation_assessment === undefined);
    invalid("deliver_assessment", data.deliver_assessment === undefined);
    invalid("checkpoints", isCheckpointSet(data.checkpoints) && data.checkpoints.length > 0);
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage === "deliver") {
    invalid("deliver_assessment", isDeliverCompletionRecord(data.deliver_assessment));
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("implementation_assessment", data.implementation_assessment === undefined);
    invalid("unit_of_work_review_assessment", data.unit_of_work_review_assessment === undefined);
    invalid("checkpoints", isCheckpointSet(data.checkpoints) && data.checkpoints.length > 0);
  }
  if (type === "construction.stage-attempt-completed" && event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION && data.stage !== "functional-design" && data.stage !== "quality-requirements" && data.stage !== "implementation-planning" && data.stage !== "implementation" && data.stage !== "unit-of-work-review" && data.stage !== "deliver") {
    invalid("functional_design_assessment", data.functional_design_assessment === undefined);
    invalid("quality_requirements_assessment", data.quality_requirements_assessment === undefined);
    invalid("implementation_planning_assessment", data.implementation_planning_assessment === undefined);
    invalid("implementation_assessment", data.implementation_assessment === undefined);
    invalid("unit_of_work_review_assessment", data.unit_of_work_review_assessment === undefined);
    invalid("deliver_assessment", data.deliver_assessment === undefined);
  }
  if (type === "construction.stage-attempt-ended-by-revision" || type === "construction.stage-reopened" || type.includes("scope-ended-by-revision") || type.includes("scope-reopened") || type === "construction.activity-attempt-ended-by-revision" || type === "construction.activity-reopened" || type === "construction.revision-authorized") {
    invalid("revision_id", isUuidV4(data.revision_id));
  }
  if (type === "construction.task-admitted") {
    invalid("graph_ref", isGraphReference(data.graph_ref));
    invalid("task_definition_ref", isTaskDefinitionReference(data.task_definition_ref));
    invalid("admission_baseline", isCheckpointSet(data.admission_baseline));
    invalid("predecessor_provenance", Array.isArray(data.predecessor_provenance) && data.predecessor_provenance.every((item) =>
      isRecord(item) && isUuidV4(item.task_id) && isNonEmptyString(item.integration_event_id) && isCheckpointSet(item.checkpoints),
    ));
    invalid("prerequisite_evidence", isEvidenceIdArray(data.prerequisite_evidence));
  }
  if (type === "construction.task-completed") {
    invalid("integration_event_id", isNonEmptyString(data.integration_event_id));
    invalid("conditions", isStringArray(data.conditions, true));
  }
  if (type === "construction.task-scope-ended-by-revision" || type === "construction.task-scope-reopened") {
    invalid("affected_activities", Array.isArray(data.affected_activities) && data.affected_activities.every((item) => isOneOf(item, activityStates)));
  }
  if (["construction.activity-attempt-started", "construction.activity-resumed"].includes(type)) {
    invalid("inputs", isInputs(data.inputs));
    invalid("checkpoints", isCheckpointSet(data.checkpoints));
  }
  if (type === "construction.evidence-recorded") {
    invalid("attempt_binding", isExecutionBinding(data));
    invalid("evidence_id", isUuidV4(data.evidence_id));
    invalid("artifact_bindings", isArtifactBindings(data.artifact_bindings));
    invalid("checkpoints", isCheckpointSet(data.checkpoints));
    invalid("inputs", isInputs(data.inputs));
    invalid("check", isNonEmptyString(data.check));
    invalid("executor", isNonEmptyString(data.executor));
    invalid("result", isRecord(data.result) && ["passed", "failed", "inconclusive"].includes(String(data.result.status)) && isNonEmptyString(data.result.summary));
    invalid("output_refs", isStringArray(data.output_refs));
    invalid("conditions", isStringArray(data.conditions));
  }
  if (type === "construction.approval-recorded") {
    invalid("attempt_binding", isExecutionBinding(data));
    invalid("artifact_bindings", isArtifactBindings(data.artifact_bindings));
    invalid("checkpoints", isCheckpointSet(data.checkpoints));
    invalid("requester", isNonEmptyString(data.requester));
    invalid("inputs", isInputs(data.inputs));
    invalid("decision_reference", isNonEmptyString(data.decision_reference));
  }
  if (type === "construction.interaction-recorded") {
    const hasAttemptScope = data.stage_attempt_id !== undefined || data.task_id !== undefined ||
      data.activity !== undefined || data.activity_attempt_id !== undefined;
    const activityWithoutAttempt = data.activity !== undefined && data.activity_attempt_id === undefined;
    const scopeBindingValid = activityWithoutAttempt
      ? data.stage === "implementation" && isUuidV4(data.stage_attempt_id) && isUuidV4(data.task_id) &&
        isOneOf(data.activity, activityStates)
      : isExecutionBinding(data);
    invalid("scope_binding", (data.stage === undefined || isOneOf(data.stage, stageStates)) &&
      (!hasAttemptScope || scopeBindingValid));
    invalid("participants", isStringArray(data.participants, true));
    invalid("content", isNonEmptyString(data.content));
    invalid("references", isStringArray(data.references));
    invalid("reply_reference", data.reply_reference === undefined || isNonEmptyString(data.reply_reference));
    invalid("effort_selection", data.effort_selection === undefined || isEffortSelection(data.effort_selection));
  }
  if (type === "construction.integration-prepared") {
    invalid("activity", data.activity === "code-integration");
    invalid("captured_inputs", isCheckpointSet(data.captured_inputs));
    invalid("candidate_checkpoints", isCheckpointSet(data.candidate_checkpoints));
    invalid("task_output_refs", isStringArray(data.task_output_refs, true));
    invalid("source_evidence_ids", isEvidenceIdArray(data.source_evidence_ids));
    invalid("inputs", isInputs(data.inputs));
  }
  if (type === "construction.integration-accepted") {
    invalid("activity", data.activity === "code-integration");
    invalid("prepared_event_id", isNonEmptyString(data.prepared_event_id));
    invalid("candidate_checkpoints", isCheckpointSet(data.candidate_checkpoints));
    invalid("repository_results", Array.isArray(data.repository_results) && data.repository_results.every((item) =>
      isRecord(item) && isNonEmptyString(item.repository_id) && isEvidenceIdArray(item.evidence_ids),
    ));
    invalid("authority_event_ids", isEventIdArray(data.authority_event_ids));
  }
  if (type === "construction.revision-authorized") {
    invalid("orchestrator_decision", isNonEmptyString(data.orchestrator_decision));
    if (data.activity !== undefined) invalid("activity", isOneOf(data.activity, activityStates));
    if (data.task_id !== undefined) invalid("task_id", isUuidV4(data.task_id));
    if (data.stage_attempt_id !== undefined) invalid("stage_attempt_id", isUuidV4(data.stage_attempt_id));
    if (data.activity_attempt_id !== undefined) invalid("activity_attempt_id", isUuidV4(data.activity_attempt_id));
  }
  if (type === "construction.retained-scope-assessed") {
    invalid("assessments", isRetainedScopeAssessedData(data));
  }
  if (type === "construction.implementation-completion-assessed") {
    invalid("stage", data.stage === "implementation");
    invalid("final_checkpoints", isCheckpointSet(data.final_checkpoints) && data.final_checkpoints.length > 0);
    invalid("artifact_paths", isArtifactPathArray(data.artifact_paths));
    invalid("task_graph_path", isRelativeArtifactPath(data.task_graph_path) && data.task_graph_path === "tasks-dag.json");
    invalid("graph_ref", isGraphReference(data.graph_ref));
    invalid("task_ids", Array.isArray(data.task_ids) && isUniqueStringArray(data.task_ids, true) && data.task_ids.every(isUuidV4));
    invalid("reviewed_material_bindings", isArtifactBindings(data.reviewed_material_bindings));
    invalid("self_review_evidence_id", isUuidV4(data.self_review_evidence_id));
    invalid("handoff_evidence_id", isUuidV4(data.handoff_evidence_id));
    invalid("unit_check_evidence_ids", Array.isArray(data.unit_check_evidence_ids) && isEvidenceIdArray(data.unit_check_evidence_ids) && data.unit_check_evidence_ids.length > 0);
    invalid("required_check_evidence_ids", Array.isArray(data.required_check_evidence_ids) && isEvidenceIdArray(data.required_check_evidence_ids) && data.required_check_evidence_ids.length > 0);
    invalid("integration_event_ids", Array.isArray(data.integration_event_ids) && isEventIdArray(data.integration_event_ids) && data.integration_event_ids.length > 0 && data.integration_event_ids.every(isUuidV4));
    invalid("retained_assessment_event_ids", Array.isArray(data.retained_assessment_event_ids) && isEventIdArray(data.retained_assessment_event_ids) && data.retained_assessment_event_ids.every(isUuidV4));
    invalid("additional_review", isImplementationAdditionalReview(data.additional_review) || isImplementationRequestedReview(data.additional_review));
    invalid("blocking_findings", isStringArray(data.blocking_findings));
    const expectedHandoffPaths = isArtifactPathArray(data.artifact_paths) && isRelativeArtifactPath(data.task_graph_path)
      ? [...data.artifact_paths, data.task_graph_path].sort((left, right) => left.localeCompare(right))
      : [];
    invalid("handoff_assessment", isImplementationCompletionHandoff(data.handoff_assessment) &&
      JSON.stringify([...data.handoff_assessment.artifacts].sort((left, right) => left.localeCompare(right))) === JSON.stringify(expectedHandoffPaths));
  }
  if (data.stage_attempt_id !== undefined && data.stage_attempt_id === event.id) {
    issues.push({ path: "/data/stage_attempt_id", message: "Attempt identity must differ from event identity" });
  }
  if (data.task_id !== undefined && data.task_id === event.id) {
    issues.push({ path: "/data/task_id", message: "Task identity must differ from event identity" });
  }
  if (data.activity_attempt_id !== undefined && data.activity_attempt_id === event.id) {
    issues.push({ path: "/data/activity_attempt_id", message: "Attempt identity must differ from event identity" });
  }
  if (data.revision_id !== undefined && data.revision_id === event.id) {
    issues.push({ path: "/data/revision_id", message: "Revision identity must differ from event identity" });
  }
  if (data.evidence_id !== undefined && data.evidence_id === event.id) {
    issues.push({ path: "/data/evidence_id", message: "Evidence identity must differ from event identity" });
  }
  return issues;
};

export const validateConstructionEvent = (value: unknown): ConstructionEventValidation => {
  const envelope = validateEventEnvelope(value);
  if (envelope.status === "invalid") return envelope;
  if (envelope.status === "unsupported") {
    return { status: "unsupported", event: envelope.event, reason: "envelope-version" };
  }
  if (envelope.event.phase !== CONSTRUCTION_PHASE) {
    return { status: "unsupported", event: envelope.event, reason: "phase" };
  }
  if (!eventTypes.has(envelope.event.type)) {
    return { status: "unsupported", event: envelope.event, reason: "event-type" };
  }
  const type = envelope.event.type as ConstructionEventType;
  const supportedVersion = type === "construction.stage-attempt-completed"
    ? envelope.event.event_version === CONSTRUCTION_EVENT_VERSION || envelope.event.event_version === CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION
    : envelope.event.event_version === CONSTRUCTION_EVENT_VERSION;
  if (!supportedVersion) return { status: "unsupported", event: envelope.event, reason: "event-version" };
  const issues = validatePayload(type, envelope.event, envelope.event.data);
  if (issues.length > 0) return { status: "invalid", issues };
  return {
    status: "valid",
    event: { ...envelope.event, phase: CONSTRUCTION_PHASE, type },
  };
};
