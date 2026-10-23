import type { EventId } from "@vialactea-works/kepler-core";
import type { ArtifactBinding, EvidenceId, GraphReference } from "./events.js";

export const planningReviewChecks = [
  "decision-rationale",
  "obligation-coverage",
  "consistency",
  "dependency-reasons",
  "prerequisite-conditions",
  "verification-feasibility",
  "input-relevance",
  "blocking-decisions",
] as const;

export interface PlanningDecisionRationale {
  readonly decision: string;
  readonly rationale: string;
}

export interface PlanningTaskReview {
  readonly task_id: string;
  readonly inputs_relevant: boolean;
  readonly outputs_explicit: boolean;
  readonly acceptance_testable: boolean;
  readonly dependency_reasons_justified: boolean;
  readonly prerequisites_conditioned: boolean;
  readonly verification_feasible: boolean;
  readonly rationale: string;
}

export interface PlanningObligationCoverage {
  readonly reference: string;
  readonly disposition: "planned" | "unchanged-behavior";
  readonly task_ids: readonly string[];
  readonly rationale: string;
}

export type PlanningApprovalRequirement =
  | { readonly required: false; readonly rationale: string }
  | {
      readonly required: true;
      readonly rationale: string;
      readonly basis:
        | { readonly kind: "requester-instruction"; readonly request_event_id: EventId }
        | { readonly kind: "authority-rule"; readonly reference: string };
    };

export type PlanningExternalReview =
  | { readonly requested: false }
  | {
      readonly requested: true;
      readonly request_event_id: EventId;
      readonly evidence_id: EvidenceId;
      readonly reviewer: string;
      readonly summary: string;
      readonly findings: readonly string[];
    };

export interface PlanningSelfReview {
  readonly status: "passed";
  readonly evidence_id: EvidenceId;
  readonly reviewer: string;
  readonly summary: string;
  readonly checks: readonly typeof planningReviewChecks[number][];
  readonly decision_rationales: readonly PlanningDecisionRationale[];
  readonly task_reviews: readonly PlanningTaskReview[];
  readonly obligation_coverage: readonly PlanningObligationCoverage[];
  readonly unresolved_consequential_decisions: readonly string[];
  readonly unsupported_assumptions: readonly string[];
}

export interface PlanningHandoff {
  readonly status: "ready";
  readonly summary: string;
  readonly recipient: "implementation";
  readonly unit_directory: string;
  readonly artifacts: readonly string[];
  readonly input_bindings: readonly ArtifactBinding[];
  readonly graph_ref: GraphReference;
  readonly task_ids: readonly string[];
  readonly verification_obligations: readonly string[];
  readonly prerequisite_conditions: readonly string[];
  readonly coordination_constraints: readonly string[];
  readonly approval_required: boolean;
}

export interface ImplementationPlanningCompletionAssessments {
  readonly artifact_validation: { readonly evidence_id: EvidenceId; readonly summary: string };
  readonly task_graph_validation: { readonly evidence_id: EvidenceId; readonly summary: string };
  readonly self_review: PlanningSelfReview;
  readonly external_review: PlanningExternalReview;
  readonly approval_requirement: PlanningApprovalRequirement;
  readonly handoff: PlanningHandoff;
}

export interface ImplementationPlanningCompletionRecord {
  readonly graph_ref: GraphReference;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly reviewed_material_bindings: readonly ArtifactBinding[];
  readonly artifact_paths: readonly string[];
  readonly task_graph_path: string;
  readonly plan_graph_link: { readonly plan_path: "plan.md"; readonly task_graph_path: "tasks-dag.json" };
  readonly approval_event_id?: EventId;
  readonly assessments: ImplementationPlanningCompletionAssessments;
}

export interface ImplementationPlanningCompletionRequest {
  readonly approval_event_id?: EventId;
  readonly assessments: ImplementationPlanningCompletionAssessments;
}

export interface ImplementationPlanningCompletionRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const stringList = (value: unknown, minimum = 0): value is readonly string[] =>
  Array.isArray(value) && value.length >= minimum && value.every(nonEmpty) && new Set(value).size === value.length;
const relativeArtifactPath = (value: unknown): value is string => typeof value === "string" && nonEmpty(value) &&
  !value.startsWith("/") && !value.includes("\\") && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
const artifactPathList = (value: unknown): value is readonly string[] =>
  stringList(value, 1) && value.every(relativeArtifactPath);
const isPlanGraphLink = (value: unknown): value is ImplementationPlanningCompletionRecord["plan_graph_link"] =>
  isRecord(value) && onlyKeys(value, ["plan_path", "task_graph_path"]) &&
  value.plan_path === "plan.md" && value.task_graph_path === "tasks-dag.json";
const isGraphReference = (value: unknown): value is GraphReference =>
  isRecord(value) && onlyKeys(value, ["graph_id", "content_version"]) &&
  uuidV4(value.graph_id) && nonEmpty(value.content_version);

const isArtifactBinding = (value: unknown): value is ArtifactBinding =>
  isRecord(value) && onlyKeys(value, ["artifact_id", "content_version"]) &&
  uuidV4(value.artifact_id) && nonEmpty(value.content_version);

const isDecisionRationale = (value: unknown): value is PlanningDecisionRationale =>
  isRecord(value) && onlyKeys(value, ["decision", "rationale"]) && nonEmpty(value.decision) && nonEmpty(value.rationale);

const isTaskReview = (value: unknown): value is PlanningTaskReview =>
  isRecord(value) && onlyKeys(value, [
    "task_id", "inputs_relevant", "outputs_explicit", "acceptance_testable", "dependency_reasons_justified",
    "prerequisites_conditioned", "verification_feasible", "rationale",
  ]) && uuidV4(value.task_id) && typeof value.inputs_relevant === "boolean" && value.inputs_relevant &&
  typeof value.outputs_explicit === "boolean" && value.outputs_explicit &&
  typeof value.acceptance_testable === "boolean" && value.acceptance_testable &&
  typeof value.dependency_reasons_justified === "boolean" && value.dependency_reasons_justified &&
  typeof value.prerequisites_conditioned === "boolean" && value.prerequisites_conditioned &&
  typeof value.verification_feasible === "boolean" && value.verification_feasible && nonEmpty(value.rationale);

const isObligationCoverage = (value: unknown): value is PlanningObligationCoverage =>
  isRecord(value) && onlyKeys(value, ["reference", "disposition", "task_ids", "rationale"]) &&
  nonEmpty(value.reference) && (value.disposition === "planned" || value.disposition === "unchanged-behavior") &&
  stringList(value.task_ids) && nonEmpty(value.rationale) &&
  (value.disposition === "planned" ? value.task_ids.length > 0 : value.task_ids.length === 0);

const isApprovalRequirement = (value: unknown): value is PlanningApprovalRequirement => {
  if (!isRecord(value) || !nonEmpty(value.rationale)) return false;
  if (value.required === false) return onlyKeys(value, ["required", "rationale"]);
  if (value.required !== true || !onlyKeys(value, ["required", "rationale", "basis"]) || !isRecord(value.basis)) return false;
  if (value.basis.kind === "requester-instruction") {
    return onlyKeys(value.basis, ["kind", "request_event_id"]) && uuidV4(value.basis.request_event_id);
  }
  return value.basis.kind === "authority-rule" && onlyKeys(value.basis, ["kind", "reference"]) && nonEmpty(value.basis.reference);
};

const isExternalReview = (value: unknown): value is PlanningExternalReview => {
  if (!isRecord(value)) return false;
  if (value.requested === false) return onlyKeys(value, ["requested"]);
  return value.requested === true && onlyKeys(value, ["requested", "request_event_id", "evidence_id", "reviewer", "summary", "findings"]) &&
    uuidV4(value.request_event_id) && uuidV4(value.evidence_id) && nonEmpty(value.reviewer) && nonEmpty(value.summary) &&
    stringList(value.findings) && value.findings.length === 0;
};

const isHandoff = (value: unknown): value is PlanningHandoff =>
  isRecord(value) && onlyKeys(value, [
    "status", "summary", "recipient", "unit_directory", "artifacts", "input_bindings", "graph_ref", "task_ids",
    "verification_obligations", "prerequisite_conditions", "coordination_constraints", "approval_required",
  ]) && value.status === "ready" && nonEmpty(value.summary) && value.recipient === "implementation" &&
  nonEmpty(value.unit_directory) && stringList(value.artifacts, 2) && Array.isArray(value.input_bindings) &&
  value.input_bindings.length > 0 && value.input_bindings.every(isArtifactBinding) &&
  new Set(value.input_bindings.map((item) => item.artifact_id)).size === value.input_bindings.length && isGraphReference(value.graph_ref) &&
  stringList(value.task_ids, 1) && stringList(value.verification_obligations, 1) &&
  stringList(value.prerequisite_conditions) && stringList(value.coordination_constraints) &&
  typeof value.approval_required === "boolean";

const isAssessments = (value: unknown): value is ImplementationPlanningCompletionAssessments => {
  if (!isRecord(value) || !onlyKeys(value, [
    "artifact_validation", "task_graph_validation", "self_review", "external_review", "approval_requirement", "handoff",
  ]) || !isRecord(value.artifact_validation) ||
      !onlyKeys(value.artifact_validation, ["evidence_id", "summary"]) || !uuidV4(value.artifact_validation.evidence_id) ||
      !nonEmpty(value.artifact_validation.summary) || !isRecord(value.task_graph_validation) ||
      !onlyKeys(value.task_graph_validation, ["evidence_id", "summary"]) || !uuidV4(value.task_graph_validation.evidence_id) ||
      !nonEmpty(value.task_graph_validation.summary) || !isRecord(value.self_review) ||
      !onlyKeys(value.self_review, [
        "status", "evidence_id", "reviewer", "summary", "checks", "decision_rationales", "task_reviews",
        "obligation_coverage", "unresolved_consequential_decisions", "unsupported_assumptions",
      ]) || value.self_review.status !== "passed" || !uuidV4(value.self_review.evidence_id) ||
      !nonEmpty(value.self_review.reviewer) || !nonEmpty(value.self_review.summary) ||
      !Array.isArray(value.self_review.checks) || value.self_review.checks.length !== planningReviewChecks.length ||
      !value.self_review.checks.every((check) => typeof check === "string" && planningReviewChecks.includes(check as typeof planningReviewChecks[number])) ||
      new Set(value.self_review.checks).size !== planningReviewChecks.length ||
      !Array.isArray(value.self_review.decision_rationales) || value.self_review.decision_rationales.length === 0 ||
      !value.self_review.decision_rationales.every(isDecisionRationale) ||
      !Array.isArray(value.self_review.task_reviews) || value.self_review.task_reviews.length === 0 ||
      !value.self_review.task_reviews.every(isTaskReview) ||
      new Set(value.self_review.task_reviews.map((item) => item.task_id)).size !== value.self_review.task_reviews.length ||
      !Array.isArray(value.self_review.obligation_coverage) || value.self_review.obligation_coverage.length === 0 ||
      !value.self_review.obligation_coverage.every(isObligationCoverage) ||
      new Set(value.self_review.obligation_coverage.map((item) => item.reference)).size !== value.self_review.obligation_coverage.length ||
      !stringList(value.self_review.unresolved_consequential_decisions) || value.self_review.unresolved_consequential_decisions.length !== 0 ||
      !stringList(value.self_review.unsupported_assumptions) || value.self_review.unsupported_assumptions.length !== 0 ||
      !isExternalReview(value.external_review) || !isApprovalRequirement(value.approval_requirement) || !isHandoff(value.handoff)) return false;
  const evidenceIds = [value.artifact_validation.evidence_id, value.task_graph_validation.evidence_id, value.self_review.evidence_id];
  if (value.external_review.requested) evidenceIds.push(value.external_review.evidence_id);
  return new Set(evidenceIds).size === evidenceIds.length &&
    value.handoff.approval_required === value.approval_requirement.required;
};

export const validateImplementationPlanningCompletionRequest = (
  value: unknown,
): { readonly kind: "valid"; readonly request: ImplementationPlanningCompletionRequest } | {
  readonly kind: "invalid";
  readonly issues: readonly ImplementationPlanningCompletionRequestIssue[];
} => {
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one JSON object." }] };
  if (!onlyKeys(value, ["approval_event_id", "assessments"])) {
    const key = Object.keys(value).find((candidate) => !["approval_event_id", "assessments"].includes(candidate));
    return { kind: "invalid", issues: [{ pointer: `/${key ?? ""}`, message: "Unknown request field." }] };
  }
  if (!isAssessments(value.assessments)) {
    return { kind: "invalid", issues: [{ pointer: "/assessments", message: "Expected typed artifact and graph validation, task-by-task semantic review, applicable approvals, requested review, and Implementation handoff." }] };
  }
  const approvalRequired = value.assessments.approval_requirement.required;
  if (approvalRequired ? !uuidV4(value.approval_event_id) : value.approval_event_id !== undefined) {
    return { kind: "invalid", issues: [{ pointer: "/approval_event_id", message: approvalRequired ? "Applicable approval requires the exact approval event UUIDv4." : "Approval event ID is not valid when approval is not required." }] };
  }
  return {
    kind: "valid",
    request: {
      ...(approvalRequired ? { approval_event_id: value.approval_event_id as EventId } : {}),
      assessments: value.assessments,
    },
  };
};

export const planningEvidenceIds = (
  assessments: ImplementationPlanningCompletionAssessments,
): readonly EvidenceId[] => [
  assessments.artifact_validation.evidence_id,
  assessments.task_graph_validation.evidence_id,
  assessments.self_review.evidence_id,
  ...(assessments.external_review.requested ? [assessments.external_review.evidence_id] : []),
];

export type LegacyImplementationPlanningCompletionRecord = Omit<ImplementationPlanningCompletionRecord, "artifact_paths" | "task_graph_path" | "plan_graph_link">;

export const isLegacyImplementationPlanningCompletionRecord = (value: unknown): value is LegacyImplementationPlanningCompletionRecord => {
  if (!isRecord(value) || !onlyKeys(value, [
    "graph_ref", "artifact_bindings", "reviewed_material_bindings", "approval_event_id", "assessments",
  ]) || !isGraphReference(value.graph_ref) || !Array.isArray(value.artifact_bindings) ||
      value.artifact_bindings.length === 0 || !value.artifact_bindings.every(isArtifactBinding) ||
      new Set(value.artifact_bindings.map((item) => item.artifact_id)).size !== value.artifact_bindings.length ||
      !Array.isArray(value.reviewed_material_bindings) || value.reviewed_material_bindings.length === 0 ||
      !value.reviewed_material_bindings.every(isArtifactBinding) ||
      new Set(value.reviewed_material_bindings.map((item) => item.artifact_id)).size !== value.reviewed_material_bindings.length ||
      !isAssessments(value.assessments)) return false;
  const outputBindings = value.artifact_bindings as readonly ArtifactBinding[];
  const reviewedBindings = value.reviewed_material_bindings as readonly ArtifactBinding[];
  if (value.assessments.handoff.graph_ref.graph_id !== value.graph_ref.graph_id ||
      value.assessments.handoff.graph_ref.content_version !== value.graph_ref.content_version ||
      outputBindings.some((binding) => !reviewedBindings.some((reviewed) =>
        reviewed.artifact_id === binding.artifact_id && reviewed.content_version === binding.content_version))) return false;
  return value.assessments.approval_requirement.required ? uuidV4(value.approval_event_id) : value.approval_event_id === undefined;
};

export const isImplementationPlanningCompletionRecord = (
  value: unknown,
): value is ImplementationPlanningCompletionRecord => {
  if (!isRecord(value) || !onlyKeys(value, [
    "graph_ref", "artifact_bindings", "reviewed_material_bindings", "artifact_paths", "task_graph_path", "plan_graph_link", "approval_event_id", "assessments",
  ]) || !isGraphReference(value.graph_ref) || !Array.isArray(value.artifact_bindings) ||
      value.artifact_bindings.length === 0 || !value.artifact_bindings.every(isArtifactBinding) ||
      new Set(value.artifact_bindings.map((item) => item.artifact_id)).size !== value.artifact_bindings.length ||
      !artifactPathList(value.artifact_paths) || !relativeArtifactPath(value.task_graph_path) || value.task_graph_path !== "tasks-dag.json" ||
      !isPlanGraphLink(value.plan_graph_link) ||
      !Array.isArray(value.reviewed_material_bindings) || value.reviewed_material_bindings.length === 0 ||
      !value.reviewed_material_bindings.every(isArtifactBinding) ||
      new Set(value.reviewed_material_bindings.map((item) => item.artifact_id)).size !== value.reviewed_material_bindings.length ||
      !isAssessments(value.assessments)) return false;
  const outputBindings = value.artifact_bindings as readonly ArtifactBinding[];
  const reviewedBindings = value.reviewed_material_bindings as readonly ArtifactBinding[];
  if (value.assessments.handoff.graph_ref.graph_id !== value.graph_ref.graph_id ||
      value.assessments.handoff.graph_ref.content_version !== value.graph_ref.content_version ||
      outputBindings.some((binding) => !reviewedBindings.some((reviewed) =>
        reviewed.artifact_id === binding.artifact_id && reviewed.content_version === binding.content_version))) return false;
  if (value.assessments.approval_requirement.required) return uuidV4(value.approval_event_id);
  return value.approval_event_id === undefined;
};

export const readImplementationPlanningCompletionRecord = (value: unknown): ImplementationPlanningCompletionRecord | undefined => {
  if (isImplementationPlanningCompletionRecord(value)) return value;
  if (!isLegacyImplementationPlanningCompletionRecord(value) ||
      !value.assessments.handoff.artifacts.includes("plan.md") || !value.assessments.handoff.artifacts.includes("tasks-dag.json")) return undefined;
  const normalized = {
    ...value,
    artifact_paths: value.assessments.handoff.artifacts.filter((path) => path !== "tasks-dag.json"),
    task_graph_path: "tasks-dag.json",
    plan_graph_link: { plan_path: "plan.md", task_graph_path: "tasks-dag.json" },
  };
  return isImplementationPlanningCompletionRecord(normalized) ? normalized : undefined;
};
