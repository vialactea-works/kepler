import { describe, expect, it } from "vitest";
import { isPlannedIntegrationCommand, plannedIntegrationCommands } from "../../packages/cli/src/construction/integration-command-contract.js";
import type { TaskGraphTask } from "../../packages/cli/src/construction/task-graph.js";

const command = { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] };
const task: TaskGraphTask = {
  id: "30000000-0000-4000-8000-000000000001",
  title: "Build and typecheck",
  goal: "Verify the task candidate.",
  inputs: [],
  outputs: ["output:task"],
  acceptance_criteria: ["The candidate builds."],
  guidance: [],
  verification: [
    { scope: "typecheck", method: "Typecheck with `repo-main: bun run build`.", expected_result: "Typechecking passes." },
    { scope: "build", method: "Build with `repo-main: bun run build`.", expected_result: "The project build passes." },
    { scope: "full-test-suite", method: "Run the full application test suite with `repo-main: bun run test`.", expected_result: "All tests pass." },
  ],
  depends_on: [],
  prerequisites: [],
};
const planSource = "Typecheck with `repo-main: bun run build`. Build with `repo-main: bun run build`. Run the full application test suite with `repo-main: bun run test`.";

describe("planned Integration commands", () => {
  it("captures separate check duties even when typecheck and build share one command", () => {
    const commands = plannedIntegrationCommands(task, planSource);

    expect(commands).toEqual([
      { ...command, check: "code-integration-typecheck" },
      { ...command, check: "code-integration-build" },
      { repository_id: "repo-main", executable: "bun", argv: ["run", "test"], check: "code-integration-full-test-suite" },
    ]);
    expect(isPlannedIntegrationCommand(task, planSource, "code-integration-typecheck", command)).toBe(true);
    expect(isPlannedIntegrationCommand(task, planSource, "code-integration-build", command)).toBe(true);
  });

  it("rejects commands absent from either planning source and shell-like tokens", () => {
    expect(isPlannedIntegrationCommand(task, planSource, "code-integration-typecheck", {
      ...command,
      argv: ["run", "typecheck"],
    })).toBe(false);
    expect(isPlannedIntegrationCommand(task, planSource.replace("repo-main: bun run build", "repo-main: bun run compile"),
      "code-integration-typecheck", command)).toBe(false);
    expect(plannedIntegrationCommands({
      ...task,
      verification: [{ scope: "typecheck", method: "Typecheck with `repo-main: bun run build && rm -rf .`.", expected_result: "Pass." }],
    }, planSource)).toEqual([]);
  });
});
