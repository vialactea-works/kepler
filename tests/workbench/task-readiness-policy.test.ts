import { describe, expect, it } from "vitest";
import type { PlanTaskContract } from "../../packages/cli/src/workbench/artifact-types.js";
import { projectTaskReadiness, type TaskReadinessEvidence } from "../../packages/cli/src/workbench/task-readiness.js";

const task = (id: number, dependsOn: readonly number[] = []): PlanTaskContract => ({
  id,
  title: `Task ${id}`,
  dependsOn,
  filesDeclared: false,
  files: [],
  definitionDigest: `${id}`,
  schedulingDigest: `${id}`,
  goal: `Complete ${id}`,
  acceptance: [`Complete ${id}`],
});

const evidence = (task: number, overrides: Partial<TaskReadinessEvidence> = {}): TaskReadinessEvidence => ({
  task,
  status: "pending",
  currentInputs: true,
  checkpoint: true,
  history: true,
  implementation: { committed: false, done: false, consistent: false, baseHead: false, reachable: false },
  feedback: { physicallyLast: false, approved: false, fresh: false, durable: false, independent: false, noBlockers: false, baseHead: false, reachable: false },
  ...overrides,
});

const cleared = (task: number): TaskReadinessEvidence => evidence(task, {
  status: "done",
  implementation: { committed: true, done: true, consistent: true, baseHead: true, reachable: true },
  feedback: { physicallyLast: true, approved: true, fresh: true, durable: true, independent: true, noBlockers: true, baseHead: true, reachable: true },
});

describe("projectTaskReadiness", () => {
  it.each(["pending", "blocked", "in-progress"] as const)("does not clear contradictory %s root evidence", (status) => {
    const result = projectTaskReadiness({
      execution: { version: 2, mode: "dependencies" },
      tasks: [task(1), task(2, [1])],
      evidence: [{ ...cleared(1), status }, evidence(2)],
    });
    expect(result.fullyGated).toEqual([]);
    expect(result.ready).not.toContain(1);
    expect(result.ready).not.toContain(2);
  });

  it("holds an approval contradictory to blocked implementation", () => {
    const clearedEvidence = cleared(1);
    const result = projectTaskReadiness({
      execution: { version: 2, mode: "dependencies" },
      tasks: [task(1)],
      evidence: [{ ...clearedEvidence, status: "blocked", implementation: { ...clearedEvidence.implementation, done: false } }],
    });
    expect(result.ready).toEqual([]);
    expect(result.fullyGated).toEqual([]);
  });

  it.each([undefined, { version: 1, order: [1, 2] }] as const)("cannot implicitly convert serial execution to a ready set", (execution) => {
    const result = projectTaskReadiness({ execution, tasks: [task(1), task(2)], evidence: [evidence(1), evidence(2)] });
    expect(result.ready).toEqual([]);
    expect(result.fullyGated).toEqual([]);
  });

  it.each(["physicallyLast", "approved", "fresh", "durable", "independent", "noBlockers", "baseHead", "reachable"] as const)("holds unusable feedback with %s unverified", (field) => {
    const proof = cleared(1);
    const result = projectTaskReadiness({ execution: { version: 2, mode: "dependencies" }, tasks: [task(1), task(2, [1]), task(3)], evidence: [{ ...proof, feedback: { ...proof.feedback, [field]: false } }, evidence(2), evidence(3)] });
    expect(result.fullyGated).toEqual([]);
    expect(result.ready).toEqual([3]);
    expect(result.held.find((entry) => entry.task === 1)?.reasons.join(" ")).toContain("feedback");
  });

  it.each([undefined, "interrupted"] as const)("recovers a missing terminal response from verified artifacts", (response) => {
    const result = projectTaskReadiness({ execution: { version: 2, mode: "dependencies" }, tasks: [task(1), task(2, [1])], evidence: [{ ...cleared(1), response }, evidence(2)] });
    expect(result.fullyGated).toEqual([1]);
    expect(result.ready).toEqual([2]);
  });
  it("holds transitive descendants when an upstream gate becomes unusable", () => {
    const result = projectTaskReadiness({ execution: { version: 2, mode: "dependencies" }, tasks: [task(1), task(2, [1]), task(3, [2]), task(4)], evidence: [evidence(1, { status: "done" }), cleared(2), evidence(3), evidence(4)] });
    expect(result.fullyGated).toEqual([]);
    expect(result.ready).toEqual([4]);
  });

  it("admits independent pending work and later-numbered prerequisites in dependency mode", () => {
    const projection = projectTaskReadiness({
      execution: { version: 2, mode: "dependencies" },
      tasks: [task(1, [3]), task(2), task(3)],
      evidence: [evidence(1), evidence(2), evidence(3)],
    });
    expect(projection.ready).toEqual([2, 3]);
    expect(projection.held).toContainEqual(expect.objectContaining({ task: 1, dependencies: [3] }));
  });

  it("releases a dependent only after joint implementation and feedback clearance", () => {
    const projection = projectTaskReadiness({
      execution: { version: 2, mode: "dependencies" },
      tasks: [task(1), task(2, [1]), task(3)],
      evidence: [cleared(1), evidence(2), evidence(3)],
    });
    expect(projection.fullyGated).toEqual([1]);
    expect(projection.ready).toEqual([2, 3]);
  });

  it("holds inconsistent or incomplete durable evidence without manufacturing a blocked outcome", () => {
    const projection = projectTaskReadiness({
      execution: { version: 2, mode: "dependencies" },
      tasks: [task(1), task(2, [1])],
      evidence: [cleared(1), evidence(2, {
        status: "done",
        response: "blocked",
        implementation: { committed: true, done: true, consistent: true, baseHead: true, reachable: true },
      })],
    });
    expect(projection.fullyGated).toEqual([1]);
    expect(projection.ready).toEqual([]);
    expect(projection.held).toContainEqual(expect.objectContaining({ task: 2, reasons: expect.arrayContaining(["response contradicts implementation evidence", "task is already admitted or implementation-complete"]) }));
  });
});
