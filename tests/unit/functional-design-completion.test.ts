import { describe, expect, it } from "vitest";
import { validateFunctionalDesignCompletionRequest } from "../../packages/cli/src/construction/functional-design-completion.js";

const assessmentIds = {
  selfReview: "61000000-0000-4000-8000-000000000001",
  decisionResolution: "61000000-0000-4000-8000-000000000002",
  handoff: "61000000-0000-4000-8000-000000000003",
};

const request = () => ({
  approval_event_id: "62000000-0000-4000-8000-000000000001",
  assessments: {
    self_review: {
      status: "passed",
      evidence_id: assessmentIds.selfReview,
      reviewer: "Functional Design owner",
      summary: "Every required review dimension passed.",
      checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"],
      findings: [],
    },
    decision_resolution: {
      status: "resolved",
      evidence_id: assessmentIds.decisionResolution,
      summary: "Every material choice has an owner and resolution.",
      resolved_material_choices: [{ choice: "Preserve public behavior", owner: "Requester", resolution: "Retain the current contract." }],
      unresolved_material_choices: [],
      unsupported_assumptions: [],
      quality_concerns: [{ concern: "Define observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }],
      technical_questions: [{ question: "Select implementation details.", responsible_stage: "implementation-planning", owner: "Implementation Planning owner" }],
    },
    handoff: {
      status: "ready",
      evidence_id: assessmentIds.handoff,
      summary: "All material is ready for the next stage.",
      recipient: "quality-requirements",
      unit_directory: ".kepler/missions/mission/construction/units-of-work/example",
      artifacts: ["unit-of-work.md", "design.md"],
      project_references: [],
      known_constraints: ["Preserve public behavior."],
      quality_concerns: [{ concern: "Define observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }],
      technical_questions: [{ question: "Select implementation details.", responsible_stage: "implementation-planning", owner: "Implementation Planning owner" }],
    },
  },
});

describe("Functional Design completion request", () => {
  it("accepts a complete typed assessment with owned decisions and handoff", () => {
    const result = validateFunctionalDesignCompletionRequest(request());
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error("Expected a valid completion request");
    expect(result.request.approval_event_id).toBe("62000000-0000-4000-8000-000000000001");
  });

  it("rejects incomplete self-review coverage", () => {
    const valid = request();
    const value = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, checks: ["required-content"] },
      },
    };
    expect(validateFunctionalDesignCompletionRequest(value)).toMatchObject({
      kind: "invalid",
      issues: [{ pointer: "/assessments" }],
    });
  });

  it("rejects repeated assessment evidence identities", () => {
    const valid = request();
    const value = {
      ...valid,
      assessments: {
        ...valid.assessments,
        handoff: { ...valid.assessments.handoff, evidence_id: valid.assessments.self_review.evidence_id },
      },
    };
    expect(validateFunctionalDesignCompletionRequest(value).kind).toBe("invalid");
  });

  it("rejects unresolved decisions, unsupported assumptions, and inconsistent handoff concerns", () => {
    const valid = request();
    const unresolved = {
      ...valid,
      assessments: {
        ...valid.assessments,
        decision_resolution: { ...valid.assessments.decision_resolution, unresolved_material_choices: ["Choose the domain boundary."] },
      },
    };
    expect(validateFunctionalDesignCompletionRequest(unresolved).kind).toBe("invalid");

    const unsupported = {
      ...valid,
      assessments: {
        ...valid.assessments,
        decision_resolution: { ...valid.assessments.decision_resolution, unsupported_assumptions: ["Assume unverified behavior."] },
      },
    };
    expect(validateFunctionalDesignCompletionRequest(unsupported).kind).toBe("invalid");

    const inconsistent = {
      ...valid,
      assessments: {
        ...valid.assessments,
        handoff: { ...valid.assessments.handoff, quality_concerns: [] },
      },
    };
    expect(validateFunctionalDesignCompletionRequest(inconsistent).kind).toBe("invalid");
  });

  it("rejects unknown request fields and non-UUID approval event IDs", () => {
    expect(validateFunctionalDesignCompletionRequest({ ...request(), extra: true }).kind).toBe("invalid");
    expect(validateFunctionalDesignCompletionRequest({ ...request(), approval_event_id: "approval:accepted" }).kind).toBe("invalid");
  });
});
