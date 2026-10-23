import { describe, expect, it } from "vitest";
import { validateActivityCompletionRequest } from "../../packages/cli/src/construction/activity-execution.js";
import { validateTaskAdmissionRequest } from "../../packages/cli/src/construction/task-admission.js";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "20000000-0000-4000-8000-000000000002";

describe("Construction execution request validation", () => {
  it("accepts a task admission request with no prerequisite evidence", () => {
    expect(validateTaskAdmissionRequest({ prerequisite_evidence_ids: [] })).toEqual({
      kind: "valid",
      request: { prerequisite_evidence_ids: [] },
    });
  });

  it("rejects malformed, duplicate, or unknown task prerequisite evidence", () => {
    expect(validateTaskAdmissionRequest({ prerequisite_evidence_ids: [firstId] }).kind).toBe("valid");
    expect(validateTaskAdmissionRequest({ prerequisite_evidence_ids: [firstId, firstId] }).kind).toBe("invalid");
    expect(validateTaskAdmissionRequest({ prerequisite_evidence_ids: ["not-an-id"] }).kind).toBe("invalid");
    expect(validateTaskAdmissionRequest({ prerequisite_evidence_ids: [], extra: true }).kind).toBe("invalid");
  });

  it("accepts unique Activity completion evidence IDs", () => {
    expect(validateActivityCompletionRequest({ evidence_ids: [firstId, secondId] })).toEqual({
      kind: "valid",
      request: { evidence_ids: [firstId, secondId] },
    });
  });

  it("rejects malformed, duplicate, or unknown Activity evidence IDs", () => {
    expect(validateActivityCompletionRequest({ evidence_ids: [] }).kind).toBe("valid");
    expect(validateActivityCompletionRequest({ evidence_ids: [firstId, firstId] }).kind).toBe("invalid");
    expect(validateActivityCompletionRequest({ evidence_ids: ["not-an-id"] }).kind).toBe("invalid");
    expect(validateActivityCompletionRequest({ evidence_ids: [], extra: true }).kind).toBe("invalid");
  });
});
