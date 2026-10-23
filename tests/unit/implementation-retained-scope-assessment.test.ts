import { describe, expect, it } from "vitest";
import { validateImplementationRetainedScopeAssessmentRequest } from "../../packages/cli/src/construction/implementation-retained-scope-assessment.js";

const assessment = (activity: string) => ({
  task_id: "10000000-0000-4000-8000-000000000001",
  activity,
  original_stage_attempt_id: "20000000-0000-4000-8000-000000000002",
  original_activity_attempt_id: "30000000-0000-4000-8000-000000000003",
  original_evidence_ids: ["40000000-0000-4000-8000-000000000004"],
  applicable: true,
  reason: "The completed Activity remains applicable to the unchanged task graph.",
  checkpoints: [{ repository_id: "repo-main", commit: "a".repeat(40) }],
});

describe("Implementation retained-scope assessment request", () => {
  it("accepts distinct applicable Activities with original evidence and checkpoints", () => {
    const result = validateImplementationRetainedScopeAssessmentRequest({
      assessments: [assessment("code-generation"), assessment("code-validation")],
    });

    expect(result.kind).toBe("valid");
  });

  it("rejects duplicate Activity scopes", () => {
    const result = validateImplementationRetainedScopeAssessmentRequest({
      assessments: [assessment("code-generation"), assessment("code-generation")],
    });

    expect(result.kind).toBe("invalid");
  });

  it("rejects unproven or non-applicable assessments", () => {
    const invalid = [
      { ...assessment("code-generation"), applicable: false },
      { ...assessment("code-generation"), original_evidence_ids: [] },
      { ...assessment("code-generation"), checkpoints: [] },
      { ...assessment("not-an-activity") },
      { ...assessment("code-generation"), unsupported: true },
    ];

    for (const item of invalid) {
      expect(validateImplementationRetainedScopeAssessmentRequest({ assessments: [item] }).kind).toBe("invalid");
    }
  });
});
