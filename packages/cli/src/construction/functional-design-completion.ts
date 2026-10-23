import type {
  FunctionalDesignCompletionAssessments,
  FunctionalDesignCompletionRecord,
} from "./events.js";

export interface FunctionalDesignCompletionRequest {
  readonly approval_event_id: string;
  readonly assessments: FunctionalDesignCompletionAssessments;
}

export interface FunctionalDesignCompletionRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

const requiredSelfReviewChecks = [
  "required-content",
  "observable-acceptance",
  "consistency",
  "blocking-questions",
  "downstream-handoff",
] as const;
const requiredSelfReviewCheckSet = new Set<string>(requiredSelfReviewChecks);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length;
const artifactPathList = (value: unknown): value is readonly string[] =>
  stringList(value) && value.length > 0 && value.every((path) => !path.startsWith("/") && !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const validSelfReview = (value: unknown): value is FunctionalDesignCompletionAssessments["self_review"] =>
  isRecord(value) && onlyKeys(value, ["status", "evidence_id", "reviewer", "summary", "checks", "findings"]) &&
  value.status === "passed" && uuidV4(value.evidence_id) && nonEmpty(value.reviewer) && nonEmpty(value.summary) &&
  Array.isArray(value.checks) && value.checks.length === requiredSelfReviewChecks.length &&
  value.checks.every((check) => typeof check === "string" && requiredSelfReviewCheckSet.has(check)) &&
  new Set(value.checks).size === requiredSelfReviewChecks.length && stringList(value.findings) && value.findings.length === 0;

const validResolvedChoices = (value: unknown): boolean =>
  Array.isArray(value) && value.every((choice) => isRecord(choice) &&
    onlyKeys(choice, ["choice", "owner", "resolution"]) && nonEmpty(choice.choice) && nonEmpty(choice.owner) && nonEmpty(choice.resolution));

const validQualityConcerns = (value: unknown): boolean =>
  Array.isArray(value) && value.every((concern) => isRecord(concern) &&
    onlyKeys(concern, ["concern", "responsible_stage", "owner"]) && nonEmpty(concern.concern) &&
    concern.responsible_stage === "quality-requirements" && nonEmpty(concern.owner));

const validTechnicalQuestions = (value: unknown): boolean =>
  Array.isArray(value) && value.every((question) => isRecord(question) &&
    onlyKeys(question, ["question", "responsible_stage", "owner"]) && nonEmpty(question.question) &&
    question.responsible_stage === "implementation-planning" && nonEmpty(question.owner));

const validDecisionResolution = (value: unknown): value is FunctionalDesignCompletionAssessments["decision_resolution"] =>
  isRecord(value) && onlyKeys(value, [
    "status",
    "evidence_id",
    "summary",
    "resolved_material_choices",
    "unresolved_material_choices",
    "unsupported_assumptions",
    "quality_concerns",
    "technical_questions",
  ]) && value.status === "resolved" && uuidV4(value.evidence_id) && nonEmpty(value.summary) &&
  validResolvedChoices(value.resolved_material_choices) && stringList(value.unresolved_material_choices) &&
  value.unresolved_material_choices.length === 0 && stringList(value.unsupported_assumptions) &&
  value.unsupported_assumptions.length === 0 && validQualityConcerns(value.quality_concerns) &&
  validTechnicalQuestions(value.technical_questions);

const validHandoff = (value: unknown): value is FunctionalDesignCompletionAssessments["handoff"] =>
  isRecord(value) && onlyKeys(value, [
    "status",
    "evidence_id",
    "summary",
    "recipient",
    "unit_directory",
    "artifacts",
    "project_references",
    "known_constraints",
    "quality_concerns",
    "technical_questions",
  ]) && value.status === "ready" && uuidV4(value.evidence_id) && nonEmpty(value.summary) &&
  value.recipient === "quality-requirements" && nonEmpty(value.unit_directory) &&
  stringList(value.artifacts) && value.artifacts.length >= 2 && stringList(value.project_references) &&
  stringList(value.known_constraints) && validQualityConcerns(value.quality_concerns) &&
  validTechnicalQuestions(value.technical_questions);

const qualityConcernKey = (value: FunctionalDesignCompletionAssessments["decision_resolution"]["quality_concerns"]): string =>
  JSON.stringify(value.map((item) => [item.concern, item.responsible_stage, item.owner]));

const technicalQuestionKey = (value: FunctionalDesignCompletionAssessments["decision_resolution"]["technical_questions"]): string =>
  JSON.stringify(value.map((item) => [item.question, item.responsible_stage, item.owner]));

export const isFunctionalDesignCompletionAssessments = (
  value: unknown,
): value is FunctionalDesignCompletionAssessments => {
  if (!isRecord(value) || !onlyKeys(value, ["self_review", "decision_resolution", "handoff"]) ||
      !validSelfReview(value.self_review) || !validDecisionResolution(value.decision_resolution) ||
      !validHandoff(value.handoff)) return false;
  const evidenceIds = [
    value.self_review.evidence_id,
    value.decision_resolution.evidence_id,
    value.handoff.evidence_id,
  ];
  return new Set(evidenceIds).size === evidenceIds.length &&
    qualityConcernKey(value.decision_resolution.quality_concerns) === qualityConcernKey(value.handoff.quality_concerns) &&
    technicalQuestionKey(value.decision_resolution.technical_questions) === technicalQuestionKey(value.handoff.technical_questions);
};

export const validateFunctionalDesignCompletionRequest = (
  value: unknown,
): { readonly kind: "valid"; readonly request: FunctionalDesignCompletionRequest } | {
  readonly kind: "invalid";
  readonly issues: readonly FunctionalDesignCompletionRequestIssue[];
} => {
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one JSON object." }] };
  if (!onlyKeys(value, ["approval_event_id", "assessments"])) {
    const key = Object.keys(value).find((candidate) => !["approval_event_id", "assessments"].includes(candidate));
    return { kind: "invalid", issues: [{ pointer: `/${key ?? ""}`, message: "Unknown request field." }] };
  }
  if (!uuidV4(value.approval_event_id)) {
    return { kind: "invalid", issues: [{ pointer: "/approval_event_id", message: "Expected the exact approval event UUIDv4." }] };
  }
  if (!isFunctionalDesignCompletionAssessments(value.assessments)) {
    return { kind: "invalid", issues: [{ pointer: "/assessments", message: "Expected the complete typed self-review, decision-resolution, and Quality handoff assessments." }] };
  }
  return {
    kind: "valid",
    request: { approval_event_id: value.approval_event_id, assessments: value.assessments },
  };
};

export const functionalDesignEvidenceIds = (
  assessments: FunctionalDesignCompletionAssessments,
): readonly string[] => [
  assessments.self_review.evidence_id,
  assessments.decision_resolution.evidence_id,
  assessments.handoff.evidence_id,
];

export const sameArtifactBindings = (
  left: unknown,
  right: readonly { readonly artifact_id: string; readonly content_version?: string }[],
): boolean => {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  const key = (binding: { readonly artifact_id: string; readonly content_version?: string }): string => `${binding.artifact_id}\0${binding.content_version ?? ""}`;
  const expected = right.map(key).sort();
  const actual: string[] = [];
  for (const candidate of left) {
    if (!isRecord(candidate) || !uuidV4(candidate.artifact_id) || !nonEmpty(candidate.content_version) ||
        candidate.checkpoint !== undefined || !onlyKeys(candidate, ["artifact_id", "content_version"])) return false;
    actual.push(`${candidate.artifact_id}\0${candidate.content_version}`);
  }
  actual.sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
};

const validFunctionalDesignBindings = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length < 2) return false;
  const artifactIds: string[] = [];
  for (const binding of value) {
    if (!isRecord(binding) || !uuidV4(binding.artifact_id) || !nonEmpty(binding.content_version) ||
        binding.checkpoint !== undefined || !onlyKeys(binding, ["artifact_id", "content_version"])) return false;
    artifactIds.push(binding.artifact_id);
  }
  return new Set(artifactIds).size === artifactIds.length;
};

export type LegacyFunctionalDesignCompletionRecord = Omit<FunctionalDesignCompletionRecord, "artifact_paths">;

export const isLegacyFunctionalDesignCompletionRecord = (value: unknown): value is LegacyFunctionalDesignCompletionRecord =>
  isRecord(value) && onlyKeys(value, ["approval_event_id", "artifact_bindings", "assessments"]) &&
  uuidV4(value.approval_event_id) && isFunctionalDesignCompletionAssessments(value.assessments) &&
  validFunctionalDesignBindings(value.artifact_bindings);

export const isFunctionalDesignCompletionRecord = (
  value: unknown,
): value is FunctionalDesignCompletionRecord =>
  isRecord(value) && onlyKeys(value, ["approval_event_id", "artifact_bindings", "artifact_paths", "assessments"]) &&
  uuidV4(value.approval_event_id) && isFunctionalDesignCompletionAssessments(value.assessments) &&
  validFunctionalDesignBindings(value.artifact_bindings) && artifactPathList(value.artifact_paths);

export const readFunctionalDesignCompletionRecord = (value: unknown): FunctionalDesignCompletionRecord | undefined => {
  if (isFunctionalDesignCompletionRecord(value)) return value;
  if (!isLegacyFunctionalDesignCompletionRecord(value)) return undefined;
  return { ...value, artifact_paths: value.assessments.handoff.artifacts };
};