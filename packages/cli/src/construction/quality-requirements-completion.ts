import type { EventId } from "@vialactea-works/kepler-core";
import type { ArtifactBinding, EvidenceId } from "./events.js";

export const qualityCategories = [
  "performance",
  "availability",
  "security",
  "accessibility",
  "compatibility",
  "operability",
  "observability",
  "maintainability",
] as const;

export type QualityCategory = typeof qualityCategories[number];

export interface QualityCategoryAssessment {
  readonly category: QualityCategory;
  readonly applies: boolean;
  readonly rationale: string;
}

export interface QualityRequirementAssessment {
  readonly category: QualityCategory;
  readonly reference: string;
  readonly scope: string;
  readonly conditions: string;
  readonly target: string;
  readonly acceptance_condition: string;
  readonly owner: string;
}

export interface QualityResolvedChoice {
  readonly choice: string;
  readonly owner: string;
  readonly resolution: string;
}

export interface QualityArtifactValidationAssessment {
  readonly evidence_id: EvidenceId;
  readonly summary: string;
}

export interface QualitySelfReviewAssessment {
  readonly status: "passed";
  readonly evidence_id: EvidenceId;
  readonly reviewer: string;
  readonly summary: string;
  readonly checks: readonly ["category-applicability", "objective-conditions", "consistency", "material-decisions", "planning-handoff"];
  readonly categories: readonly QualityCategoryAssessment[];
  readonly requirements: readonly QualityRequirementAssessment[];
  readonly resolved_material_choices: readonly QualityResolvedChoice[];
  readonly unresolved_material_choices: readonly string[];
  readonly unresolved_material_targets: readonly string[];
  readonly unresolved_tradeoffs: readonly string[];
  readonly unsupported_assumptions: readonly string[];
}

export type QualityExternalReviewAssessment =
  | { readonly requested: false }
  | {
      readonly requested: true;
      readonly request_event_id: EventId;
      readonly evidence_id: EvidenceId;
      readonly reviewer: string;
      readonly summary: string;
      readonly findings: readonly string[];
    };

export interface QualityHandoffAssessment {
  readonly status: "ready";
  readonly summary: string;
  readonly recipient: "implementation-planning";
  readonly unit_directory: string;
  readonly artifacts: readonly string[];
  readonly requirement_references: readonly string[];
  readonly constraints: readonly string[];
  readonly assumptions: readonly string[];
  readonly planning_questions: readonly string[];
}

export interface QualityRequirementsCompletionAssessments {
  readonly artifact_validation: QualityArtifactValidationAssessment;
  readonly self_review: QualitySelfReviewAssessment;
  readonly external_review: QualityExternalReviewAssessment;
  readonly handoff: QualityHandoffAssessment;
}

export interface QualityRequirementsCompletionRecord {
  readonly approval_event_id: EventId;
  readonly artifact_bindings: readonly ArtifactBinding[];
  readonly functional_design_bindings: readonly ArtifactBinding[];
  readonly artifact_paths: readonly string[];
  readonly assessments: QualityRequirementsCompletionAssessments;
}

export interface QualityRequirementsCompletionRequest {
  readonly approval_event_id: EventId;
  readonly assessments: QualityRequirementsCompletionAssessments;
}

export interface QualityRequirementsCompletionRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

const requiredChecks = [
  "category-applicability",
  "objective-conditions",
  "consistency",
  "material-decisions",
  "planning-handoff",
] as const;
const requiredCheckSet = new Set<string>(requiredChecks);
const categorySet = new Set<string>(qualityCategories);
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
const artifactPathList = (value: unknown): value is readonly string[] =>
  stringList(value, 1) && value.every((path) => !path.startsWith("/") && !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));

const isCategoryAssessment = (value: unknown): value is QualityCategoryAssessment =>
  isRecord(value) && onlyKeys(value, ["category", "applies", "rationale"]) &&
  typeof value.category === "string" && categorySet.has(value.category) &&
  typeof value.applies === "boolean" && nonEmpty(value.rationale);

const isRequirementAssessment = (value: unknown): value is QualityRequirementAssessment =>
  isRecord(value) && onlyKeys(value, ["category", "reference", "scope", "conditions", "target", "acceptance_condition", "owner"]) &&
  typeof value.category === "string" && categorySet.has(value.category) &&
  nonEmpty(value.reference) && nonEmpty(value.scope) && nonEmpty(value.conditions) &&
  nonEmpty(value.target) && nonEmpty(value.acceptance_condition) && nonEmpty(value.owner);

const isResolvedChoice = (value: unknown): value is QualityResolvedChoice =>
  isRecord(value) && onlyKeys(value, ["choice", "owner", "resolution"]) &&
  nonEmpty(value.choice) && nonEmpty(value.owner) && nonEmpty(value.resolution);

const isArtifactValidation = (value: unknown): value is QualityArtifactValidationAssessment =>
  isRecord(value) && onlyKeys(value, ["evidence_id", "summary"]) && uuidV4(value.evidence_id) && nonEmpty(value.summary);

const isSelfReview = (value: unknown): value is QualitySelfReviewAssessment => {
  if (!isRecord(value) || !onlyKeys(value, [
    "status",
    "evidence_id",
    "reviewer",
    "summary",
    "checks",
    "categories",
    "requirements",
    "resolved_material_choices",
    "unresolved_material_choices",
    "unresolved_material_targets",
    "unresolved_tradeoffs",
    "unsupported_assumptions",
  ]) || value.status !== "passed" || !uuidV4(value.evidence_id) || !nonEmpty(value.reviewer) ||
      !nonEmpty(value.summary) || !Array.isArray(value.checks) || value.checks.length !== requiredChecks.length ||
      !value.checks.every((check) => typeof check === "string" && requiredCheckSet.has(check)) ||
      new Set(value.checks).size !== requiredChecks.length || !Array.isArray(value.categories) ||
      value.categories.length !== qualityCategories.length || !value.categories.every(isCategoryAssessment) ||
      new Set(value.categories.map((entry) => entry.category)).size !== qualityCategories.length ||
      !Array.isArray(value.requirements) || !value.requirements.every(isRequirementAssessment) ||
      !Array.isArray(value.resolved_material_choices) || !value.resolved_material_choices.every(isResolvedChoice) ||
      !stringList(value.unresolved_material_choices) || value.unresolved_material_choices.length !== 0 ||
      !stringList(value.unresolved_material_targets) || value.unresolved_material_targets.length !== 0 ||
      !stringList(value.unresolved_tradeoffs) || value.unresolved_tradeoffs.length !== 0 ||
      !stringList(value.unsupported_assumptions) || value.unsupported_assumptions.length !== 0) return false;
  const categoryByName = new Map(value.categories.map((entry) => [entry.category, entry]));
  const requirementReferences = new Set<string>();
  const requirementsByCategory = new Map<QualityCategory, number>();
  for (const requirement of value.requirements) {
    if (!categoryByName.get(requirement.category)?.applies) return false;
    const key = `${requirement.category}\0${requirement.reference}`;
    if (requirementReferences.has(key)) return false;
    requirementReferences.add(key);
    requirementsByCategory.set(requirement.category, (requirementsByCategory.get(requirement.category) ?? 0) + 1);
  }
  return qualityCategories.every((category) => {
    const assessment = categoryByName.get(category);
    return assessment !== undefined && (assessment.applies
      ? (requirementsByCategory.get(category) ?? 0) > 0
      : (requirementsByCategory.get(category) ?? 0) === 0);
  });
};

const isExternalReview = (value: unknown): value is QualityExternalReviewAssessment => {
  if (!isRecord(value)) return false;
  if (value.requested === false) return onlyKeys(value, ["requested"]);
  return value.requested === true && onlyKeys(value, ["requested", "request_event_id", "evidence_id", "reviewer", "summary", "findings"]) &&
    uuidV4(value.request_event_id) && uuidV4(value.evidence_id) && nonEmpty(value.reviewer) && nonEmpty(value.summary) &&
    stringList(value.findings) && value.findings.length === 0;
};

const isHandoff = (value: unknown, selfReview: QualitySelfReviewAssessment): value is QualityHandoffAssessment =>
  isRecord(value) && onlyKeys(value, [
    "status",
    "summary",
    "recipient",
    "unit_directory",
    "artifacts",
    "requirement_references",
    "constraints",
    "assumptions",
    "planning_questions",
  ]) && value.status === "ready" && nonEmpty(value.summary) && value.recipient === "implementation-planning" &&
  nonEmpty(value.unit_directory) && stringList(value.artifacts, 1) &&
  stringList(value.requirement_references) && stringList(value.constraints) && stringList(value.assumptions) &&
  stringList(value.planning_questions) &&
  JSON.stringify([...value.requirement_references].sort()) ===
    JSON.stringify([...new Set(selfReview.requirements.map((requirement) => requirement.reference))].sort());

export const isQualityRequirementsCompletionAssessments = (
  value: unknown,
): value is QualityRequirementsCompletionAssessments => {
  if (!isRecord(value) || !onlyKeys(value, ["artifact_validation", "self_review", "external_review", "handoff"]) ||
      !isArtifactValidation(value.artifact_validation) || !isSelfReview(value.self_review) ||
      !isExternalReview(value.external_review) || !isHandoff(value.handoff, value.self_review)) return false;
  const evidenceIds = [value.artifact_validation.evidence_id, value.self_review.evidence_id];
  if (value.external_review.requested) evidenceIds.push(value.external_review.evidence_id);
  return new Set(evidenceIds).size === evidenceIds.length;
};

export const validateQualityRequirementsCompletionRequest = (
  value: unknown,
): { readonly kind: "valid"; readonly request: QualityRequirementsCompletionRequest } | {
  readonly kind: "invalid";
  readonly issues: readonly QualityRequirementsCompletionRequestIssue[];
} => {
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one JSON object." }] };
  if (!onlyKeys(value, ["approval_event_id", "assessments"])) {
    const key = Object.keys(value).find((candidate) => !["approval_event_id", "assessments"].includes(candidate));
    return { kind: "invalid", issues: [{ pointer: `/${key ?? ""}`, message: "Unknown request field." }] };
  }
  if (!uuidV4(value.approval_event_id)) {
    return { kind: "invalid", issues: [{ pointer: "/approval_event_id", message: "Expected the exact approval event UUIDv4." }] };
  }
  if (!isQualityRequirementsCompletionAssessments(value.assessments)) {
    return { kind: "invalid", issues: [{ pointer: "/assessments", message: "Expected explicit category applicability, objective targets, resolved choices, applicable review, and Planning handoff." }] };
  }
  return { kind: "valid", request: { approval_event_id: value.approval_event_id as EventId, assessments: value.assessments } };
};

export const qualityRequirementsEvidenceIds = (
  assessments: QualityRequirementsCompletionAssessments,
): readonly EvidenceId[] => [
  assessments.artifact_validation.evidence_id,
  assessments.self_review.evidence_id,
  ...(assessments.external_review.requested ? [assessments.external_review.evidence_id] : []),
];

export type LegacyQualityRequirementsCompletionRecord = Pick<QualityRequirementsCompletionRecord, "approval_event_id" | "artifact_bindings" | "assessments"> & {
  readonly functional_design_bindings?: readonly ArtifactBinding[];
};

export const isLegacyQualityRequirementsCompletionRecord = (value: unknown): value is LegacyQualityRequirementsCompletionRecord => {
  if (!isRecord(value) || !onlyKeys(value, ["approval_event_id", "artifact_bindings", "functional_design_bindings", "assessments"]) ||
      !uuidV4(value.approval_event_id) || !Array.isArray(value.artifact_bindings) || value.artifact_bindings.length === 0 ||
      (value.functional_design_bindings !== undefined && (!Array.isArray(value.functional_design_bindings) || value.functional_design_bindings.length === 0)) ||
      !isQualityRequirementsCompletionAssessments(value.assessments)) return false;
  const artifactIds: string[] = [];
  for (const binding of value.artifact_bindings) {
    if (!isRecord(binding) || !uuidV4(binding.artifact_id) || !nonEmpty(binding.content_version) ||
        binding.checkpoint !== undefined || !onlyKeys(binding, ["artifact_id", "content_version"])) return false;
    artifactIds.push(binding.artifact_id);
  }
  const functionalDesignIds: string[] = [];
  for (const binding of value.functional_design_bindings ?? []) {
    if (!isRecord(binding) || !uuidV4(binding.artifact_id) || !nonEmpty(binding.content_version) ||
        binding.checkpoint !== undefined || !onlyKeys(binding, ["artifact_id", "content_version"])) return false;
    functionalDesignIds.push(binding.artifact_id);
  }
  return new Set(artifactIds).size === artifactIds.length && new Set(functionalDesignIds).size === functionalDesignIds.length;
};

export const isQualityRequirementsCompletionRecord = (
  value: unknown,
): value is QualityRequirementsCompletionRecord => {
  if (!isRecord(value) || !onlyKeys(value, ["approval_event_id", "artifact_bindings", "functional_design_bindings", "artifact_paths", "assessments"]) ||
      !uuidV4(value.approval_event_id) || !Array.isArray(value.artifact_bindings) || value.artifact_bindings.length === 0 ||
      !Array.isArray(value.functional_design_bindings) || value.functional_design_bindings.length === 0 ||
      !artifactPathList(value.artifact_paths) || !isQualityRequirementsCompletionAssessments(value.assessments)) return false;
  const artifactIds: string[] = [];
  for (const binding of value.artifact_bindings) {
    if (!isRecord(binding) || !uuidV4(binding.artifact_id) || !nonEmpty(binding.content_version) ||
        binding.checkpoint !== undefined || !onlyKeys(binding, ["artifact_id", "content_version"])) return false;
    artifactIds.push(binding.artifact_id);
  }
  if (new Set(artifactIds).size !== artifactIds.length) return false;
  const functionalDesignIds: string[] = [];
  for (const binding of value.functional_design_bindings) {
    if (!isRecord(binding) || !uuidV4(binding.artifact_id) || !nonEmpty(binding.content_version) ||
        binding.checkpoint !== undefined || !onlyKeys(binding, ["artifact_id", "content_version"])) return false;
    functionalDesignIds.push(binding.artifact_id);
  }
  return new Set(functionalDesignIds).size === functionalDesignIds.length;
};

export const readQualityRequirementsCompletionRecord = (
  value: unknown,
  functionalDesignPaths: readonly string[],
): QualityRequirementsCompletionRecord | undefined => {
  if (isQualityRequirementsCompletionRecord(value)) return value;
  if (!isLegacyQualityRequirementsCompletionRecord(value) || !value.functional_design_bindings) return undefined;
  const artifactPaths = value.assessments.handoff.artifacts.filter((path) => !functionalDesignPaths.includes(path));
  const normalized = { ...value, artifact_paths: artifactPaths };
  return isQualityRequirementsCompletionRecord(normalized) ? normalized : undefined;
};
