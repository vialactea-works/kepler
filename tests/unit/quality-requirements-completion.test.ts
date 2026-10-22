import { describe, expect, it } from "vitest";
import { validateQualityRequirementsCompletionRequest } from "../../packages/cli/src/construction/quality-requirements-completion.js";

const categoryNames = [
  "performance",
  "availability",
  "security",
  "accessibility",
  "compatibility",
  "operability",
  "observability",
  "maintainability",
] as const;

const request = () => ({
  approval_event_id: "71000000-0000-4000-8000-000000000001",
  assessments: {
    artifact_validation: {
      evidence_id: "72000000-0000-4000-8000-000000000001",
      summary: "The quality artifact and linked support pass validation.",
    },
    self_review: {
      status: "passed",
      evidence_id: "72000000-0000-4000-8000-000000000002",
      reviewer: "Quality Requirements owner",
      summary: "Applicability, requirements, decisions, and handoff were reviewed.",
      checks: ["category-applicability", "objective-conditions", "consistency", "material-decisions", "planning-handoff"],
      categories: categoryNames.map((category) => ({
        category,
        applies: category === "security",
        rationale: `${category} applicability was considered for this unit.`,
      })),
      requirements: [{
        category: "security",
        reference: "quality.md#security",
        scope: "Stored requester data",
        conditions: "When the user saves a request",
        target: "Only the owning user can read saved request data.",
        acceptance_condition: "A different user receives an access-denied result.",
        owner: "Security Requirements owner",
      }],
      resolved_material_choices: [],
      unresolved_material_choices: [],
      unresolved_material_targets: [],
      unresolved_tradeoffs: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false },
    handoff: {
      status: "ready",
      summary: "The current quality requirements are ready for Implementation Planning.",
      recipient: "implementation-planning",
      unit_directory: ".kepler/missions/mission/construction/units-of-work/example",
      artifacts: ["quality.md"],
      requirement_references: ["quality.md#security"],
      constraints: ["Keep requester data private."],
      assumptions: [],
      planning_questions: ["Choose an implementation mechanism that meets the acceptance condition."],
    },
  },
});

describe("Quality Requirements completion request", () => {
  it("accepts explicit applicability for all eight categories and objective targets", () => {
    const result = validateQualityRequirementsCompletionRequest(request());
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error("Expected a valid Quality Requirements request");
    expect(result.request.approval_event_id).toBe("71000000-0000-4000-8000-000000000001");
  });

  it("requires one applicability decision for every category", () => {
    const valid = request();
    const value = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, categories: valid.assessments.self_review.categories.slice(1) },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(value)).toMatchObject({ kind: "invalid", issues: [{ pointer: "/assessments" }] });
  });

  it("requires objective conditions for applicable categories and rejects targets for inapplicable categories", () => {
    const valid = request();
    const withoutTarget = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, requirements: [] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(withoutTarget).kind).toBe("invalid");
    const inapplicableTarget = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: {
          ...valid.assessments.self_review,
          requirements: [{ ...valid.assessments.self_review.requirements[0], category: "performance" }],
        },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(inapplicableTarget).kind).toBe("invalid");
  });

  it("accepts a requested review only with a typed current-review request and passed findings", () => {
    const valid = request();
    const requested = {
      ...valid,
      assessments: {
        ...valid.assessments,
        external_review: {
          requested: true,
          request_event_id: "73000000-0000-4000-8000-000000000001",
          evidence_id: "72000000-0000-4000-8000-000000000003",
          reviewer: "Independent reviewer",
          summary: "The requested external review passed.",
          findings: [],
        },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(requested).kind).toBe("valid");
    expect(validateQualityRequirementsCompletionRequest({
      ...requested,
      assessments: { ...requested.assessments, external_review: { ...requested.assessments.external_review, request_event_id: undefined } },
    }).kind).toBe("invalid");
  });

  it("requires material choices and requested external review to be resolved", () => {
    const valid = request();
    const unresolved = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, unresolved_material_choices: ["Choose an availability target."] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(unresolved).kind).toBe("invalid");
    const unresolvedTarget = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, unresolved_material_targets: ["Choose a data retention target."] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(unresolvedTarget).kind).toBe("invalid");
    const unresolvedTradeoff = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, unresolved_tradeoffs: ["Choose availability versus consistency target."] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(unresolvedTradeoff).kind).toBe("invalid");
    const unreviewed = {
      ...valid,
      assessments: {
        ...valid.assessments,
        external_review: { requested: true, request_event_id: "73000000-0000-4000-8000-000000000001", evidence_id: "72000000-0000-4000-8000-000000000003", reviewer: "Independent reviewer", summary: "A blocking finding remains.", findings: ["Resolve the storage-retention decision."] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(unreviewed).kind).toBe("invalid");
  });

  it("rejects unknown fields and mismatched Planning handoff targets", () => {
    const valid = request();
    expect(validateQualityRequirementsCompletionRequest({ ...valid, extra: true }).kind).toBe("invalid");
    const mismatched = {
      ...valid,
      assessments: {
        ...valid.assessments,
        handoff: { ...valid.assessments.handoff, requirement_references: [] },
      },
    };
    expect(validateQualityRequirementsCompletionRequest(mismatched).kind).toBe("invalid");
  });
});
