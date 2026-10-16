import { describe, expect, it } from "vitest";
import { attemptStartHasKnownParentage } from "../../packages/cli/src/workbench/task-review-coverage.js";

const admission = "a".repeat(40);
const terminal = "b".repeat(40);
const start = "c".repeat(40);
const unrelated = "d".repeat(40);

describe("attempt start parentage", () => {
  it("accepts the admission commit as the exact attempt start", () => {
    expect(attemptStartHasKnownParentage(admission, admission, [], undefined)).toBe(true);
  });

  it.each([
    [terminal, admission],
    [admission, terminal],
  ])("accepts a direct synchronization with parents %j", (...parents) => {
    expect(attemptStartHasKnownParentage(start, admission, parents, terminal)).toBe(true);
  });

  it.each([
    { parents: [], previous: terminal },
    { parents: [admission], previous: terminal },
    { parents: [terminal, admission, unrelated], previous: terminal },
    { parents: [terminal, unrelated], previous: terminal },
    { parents: [terminal, admission], previous: undefined },
    { parents: [unrelated, admission], previous: terminal },
  ])("rejects unaccounted ancestry %j", ({ parents, previous }) => {
    expect(attemptStartHasKnownParentage(start, admission, parents, previous)).toBe(false);
  });
});
