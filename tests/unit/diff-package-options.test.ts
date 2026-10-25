import { describe, expect, it } from "vitest";
import { parseDiffPackageOptions } from "../../packages/cli/src/cli/diff-package-options.js";

const unit = "2026-10-23-diff-package";
const task = "30000000-0000-4000-8000-000000000001";
const implementationAttempt = "40000000-0000-4000-8000-000000000001";
const generationAttempt = "50000000-0000-4000-8000-000000000001";
const integrationAttempt = "50000000-0000-4000-8000-000000000002";

const shared = {
  unit: [unit],
  implementationAttempt: [implementationAttempt],
};

describe("diff-package option parsing", () => {
  it("parses the validation signature and its optional project and output", () => {
    expect(parseDiffPackageOptions("validation", {
      ...shared,
      task: [task],
      generationAttempt: [generationAttempt],
      project: ["/workspace/project"],
      out: [".kepler/packages/validation.md"],
    })).toEqual({
      kind: "parsed",
      request: {
        scope: {
          kind: "validation",
          unitId: unit,
          taskId: task,
          implementationAttemptId: implementationAttempt,
          generationAttemptId: generationAttempt,
        },
        project: "/workspace/project",
        out: ".kepler/packages/validation.md",
      },
    });
  });

  it("parses the Integration signature without substituting an Integration source", () => {
    expect(parseDiffPackageOptions("integration", {
      ...shared,
      task: [task],
      integrationAttempt: [integrationAttempt],
    })).toEqual({
      kind: "parsed",
      request: {
        scope: {
          kind: "integration",
          unitId: unit,
          taskId: task,
          implementationAttemptId: implementationAttempt,
          integrationAttemptId: integrationAttempt,
        },
      },
    });
  });

  it("parses the Unit Review signature without task or Activity selectors", () => {
    expect(parseDiffPackageOptions("unit-review", shared)).toEqual({
      kind: "parsed",
      request: {
        scope: { kind: "unit-review", unitId: unit, implementationAttemptId: implementationAttempt },
      },
    });
  });

  it("rejects missing, duplicate, empty, and malformed source selectors", () => {
    expect(parseDiffPackageOptions("validation", {})).toMatchObject({
      kind: "failed",
      code: "required_selector_missing",
    });
    expect(parseDiffPackageOptions("validation", {
      ...shared,
      task: [task],
      generationAttempt: [generationAttempt, integrationAttempt],
    })).toMatchObject({ kind: "failed", code: "duplicate_selector" });
    expect(parseDiffPackageOptions("integration", {
      ...shared,
      task: [task],
      integrationAttempt: [""],
    })).toMatchObject({ kind: "failed", code: "invalid_selector" });
    expect(parseDiffPackageOptions("unit-review", {
      ...shared,
      implementationAttempt: ["not-an-attempt"],
    })).toMatchObject({ kind: "failed", code: "invalid_identity" });
    expect(parseDiffPackageOptions("validation", {
      ...shared,
      task: [task],
      generationAttempt: [generationAttempt],
      out: ["result.md", "other.md"],
    })).toMatchObject({ kind: "failed", code: "duplicate_selector" });
  });

  it("rejects selectors outside each fixed signature", () => {
    expect(parseDiffPackageOptions("validation", {
      ...shared,
      task: [task],
      generationAttempt: [generationAttempt],
      mission: ["10000000-0000-4000-8000-000000000001"],
    })).toMatchObject({ kind: "failed", code: "invalid_selector" });
    expect(parseDiffPackageOptions("unit-review", {
      ...shared,
      task: [task],
    })).toMatchObject({ kind: "failed", code: "invalid_selector" });
    expect(parseDiffPackageOptions("integration", {
      ...shared,
      task: [task],
      generationAttempt: [generationAttempt],
    })).toMatchObject({ kind: "failed", code: "invalid_selector" });
  });
});
