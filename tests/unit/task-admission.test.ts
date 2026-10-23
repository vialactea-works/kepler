import { describe, expect, it } from "vitest";
import { admittedTaskContract } from "../../packages/cli/src/construction/task-admission.js";
import type { TaskExecutionContext } from "../../packages/cli/src/construction/scoped-queries.js";

const planSource = "Typecheck with `repo-main: bun run build`. Build with `repo-main: bun run build`. Run the full application test suite with `repo-main: bun run test`.";
const task: TaskExecutionContext["task"] = {
  id: "30000000-0000-4000-8000-000000000001",
  title: "Task with repeated criteria",
  goal: "Preserve every accepted criterion.",
  inputs: [],
  outputs: ["output:task"],
  acceptance_criteria: ["The result is correct.", "The result is correct."],
  guidance: [],
  verification: [
    { scope: "typecheck", method: "Typecheck with `repo-main: bun run build`.", expected_result: "Typechecking passes." },
    { scope: "build", method: "Build with `repo-main: bun run build`.", expected_result: "The build passes." },
    { scope: "full-test-suite", method: "Run the full application test suite with `repo-main: bun run test`.", expected_result: "All tests pass." },
  ],
  depends_on: [],
  prerequisites: [],
};

describe("admitted task contract", () => {
  it("preserves duplicate accepted criteria and records planned check commands", () => {
    const contract = admittedTaskContract(task, planSource);

    expect(contract.acceptance_criteria).toEqual(task.acceptance_criteria);
    expect(contract.planned_integration_commands).toEqual([
      { check: "code-integration-typecheck", repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
      { check: "code-integration-build", repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
      { check: "code-integration-full-test-suite", repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
    ]);
  });
});
