import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextService, createContextRuntime } from "../../packages/cli/src/workbench/context.js";
import { PreconditionService } from "../../packages/cli/src/workbench/precondition.js";
import { createPreconditionRuntime } from "../../packages/cli/src/workbench/precondition-runtime.js";
import { taskBreakdownDigestFromDefinitions, taskDefinitionDigest } from "../../packages/cli/src/workbench/artifact-body.js";
import { cleanupRepos, commitAll, commitPaths, git, makeChangeDir, makeRepo, write } from "./helpers.js";

const fixture = (dependencies: readonly (readonly number[])[] = [[], [4], [2], [1]], mode: "dependencies" | "serial" | "legacy" = "dependencies") => {
  const root = makeRepo();
  const changeDir = makeChangeDir(root, "ready");
  write(root, "AGENTS.md", "Use verified Bun checks.\n");
  const base = commitPaths(root, "Commit standards before scaffold", "AGENTS.md");
  const blob = git(root, "rev-parse", "HEAD:AGENTS.md");
  const tasks = dependencies.map((dependsOn, index) => {
    const id = index + 1;
    const definition = `### Task ${id}: Task goal ${id}\n\n- Goal: Complete outcome ${id}.\n- Depends on: ${dependsOn.length === 0 ? "none" : dependsOn.map((task) => `Task ${task}`).join(", ")}\n- Acceptance:\n  - Outcome ${id} is verified.\n- Steps:\n  1. Red — observe failure.\n  2. Green — implement and verify.\n  3. Refactor — preserve the outcome.\n- Verify: bun --bun vitest run\n- Commit: feat: complete outcome ${id}`;
    const input = { version: 1, repository: root, intentCommit: "tactical:readiness-fixture", taskDefinition: taskDefinitionDigest(definition), inputs: [{ path: "AGENTS.md", blob }] };
    return { id, title: `Task goal ${id}`, dependsOn, definitionDigest: taskDefinitionDigest(definition), block: `${definition}\n- Notes: ${JSON.stringify(input)}` };
  });
  const initialization = { version: 1, base, authority: "requester:readiness-fixture", breakdown: taskBreakdownDigestFromDefinitions(tasks.map((task) => task.id), tasks), taskIds: tasks.map((task) => task.id) };
  const plan = `---\nartifact: plan\nchange: ready\nstatus: approved\ncreated: 2026-10-13\nauthor: Fixture\ndecision: accepted\nroute_unit: null\n${mode === "dependencies" ? "execution: {version: 2, mode: dependencies}\n" : mode === "serial" ? `execution: {version: 1, order: [${tasks.map((task) => task.id).join(", ")}]}\n` : ""}initialization: ${JSON.stringify(initialization)}\n---\n# Plan: Ready\n\n## Overview\n\nVerify dependency scheduling.\n\n## Tasks\n\n${tasks.map((task) => task.block).join("\n\n")}\n\n## Done when\n\nAll outcomes are fully gated.\n`;
  const statuses = tasks.map(() => "pending");
  const progress = () => `---\nartifact: progress\nchange: ready\nstatus: in-progress\nupdated: 2026-10-13\ndecision: accepted\ntasks: ${JSON.stringify(tasks.map((task, index) => ({ id: task.id, title: task.title, status: statuses[index], progress: `tasks/task-${task.id}/progress.md` })))}\n---\n# Progress: Ready\n\n| Task | Status | Progress |\n| --- | --- | --- |\n${tasks.map((task, index) => `| Task ${task.id}: ${task.title} | ${statuses[index]} | [details](tasks/task-${task.id}/progress.md) |`).join("\n")}\n`;
  write(changeDir, "plan.md", plan);
  write(changeDir, ".gitignore", "tasks/task-*/.base\n");
  write(changeDir, "progress.md", progress());
  for (const task of tasks) write(changeDir, `tasks/task-${task.id}/progress.md`, `---\nartifact: task-progress\nchange: ready\ntask: ${task.id}\nstatus: pending\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task ${task.id} — ${task.title}\n`);
  commitAll(root, "Initialize committed dependency plan");
  const context = () => new ContextService(createContextRuntime({ cwd: () => root })).execute({ changeDir });
  const complete = (task: number, outcome: "done" | "blocked" = "done") => {
    const base = git(root, "rev-parse", "HEAD");
    statuses[task - 1] = outcome;
    write(changeDir, "progress.md", progress());
    write(changeDir, `tasks/task-${task}/progress.md`, `---\nartifact: task-progress\nchange: ready\ntask: ${task}\nstatus: ${outcome}\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task ${task} — Task goal ${task}\n\n## Attempt 1 — 2026-10-13\n\n- Outcome: ${outcome}\n`);
    const head = commitAll(root, `Complete Task ${task}`);
    return { base, head };
  };
  const feedback = (task: number, base: string, head: string, verdict = "approved", committed = true) => {
    write(changeDir, `tasks/task-${task}/feedback.md`, `---\nartifact: feedback\nchange: ready\ntask: ${task}\ncreated: 2026-10-13\nstatus: open\ndecision: rejected\n---\n# Code Feedback: Task ${task} — Task goal ${task}\n\n## Pass 1 — 2026-10-13\n\nBase: ${base}\nHead: ${head}\nVerdict: ${verdict}\n\n### Blocking\n\n- None.\n\n### Suggestions\n\n- None.\n`);
    if (committed) return commitPaths(root, `Feedback Task ${task}`, `.kepler/changes/ready/tasks/task-${task}/feedback.md`);
    return undefined;
  };
  return { root, changeDir, tasks, statuses, progress, context, complete, feedback };
};

afterEach(cleanupRepos);

describe("verified dependency readiness context", () => {
  it("keeps an all-done implementation count distinct from full clearance", async () => {
    const f = fixture([[], []]);
    const first = f.complete(1);
    f.feedback(1, first.base, first.head);
    f.complete(2);
    const context = await f.context();
    expect(context.changes[0]).toMatchObject({ tasks: { done: 2, total: 2 }, readiness: { fullyGated: [1], ready: [] } });
  });

  it.each([false, true])("keeps finish closed with missing feedback when freshness waiver is %s", async (wholeChangeWaived) => {
    const f = fixture([[], []]);
    git(f.root, "checkout", "-q", "-b", "implementation");
    const first = f.complete(1);
    f.feedback(1, first.base, first.head);
    f.complete(2);
    const result = await new PreconditionService(createPreconditionRuntime({ cwd: () => f.root })).execute({ changeDir: f.changeDir, testCommand: "true", targetBranch: "refs/heads/main", wholeChangeWaived });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("[FAIL] Reviews (Task 2 feedback missing");
  });

  describe.each([
    [[1], [1], [2, 3]],
    [[1, 3], [1, 3], [2]],
    [[1, 3, 2], [1, 2, 3], [4]],
    [[1, 3, 2, 4], [1, 2, 3, 4], []],
  ] as const)("diamond after completing %s in reverse sibling order", (completed, fullyGated, ready) => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture([[], [1], [1], [2, 3]]);
      for (const task of completed) {
        const { base, head } = f.complete(task);
        f.feedback(task, base, head);
      }
    });
    it("projects matching committed readiness", async () => {
      const result = await f.context();
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.changes[0]).toMatchObject({ tasks: { done: fullyGated.length, total: 4 }, readiness: { fullyGated, ready } });
    });
  });

  it("uses the physically last changes-requested pass instead of an older approval", async () => {
    const f = fixture([[], [1], []]);
    const { base, head } = f.complete(1);
    f.feedback(1, base, head);
    const path = ".kepler/changes/ready/tasks/task-1/feedback.md";
    write(f.root, path, git(f.root, "show", `HEAD:${path}`) + `\n\n## Pass 2 — 2026-10-13\n\nBase: ${base}\nHead: ${head}\nVerdict: changes-requested\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`);
    commitPaths(f.root, "Publish later request for changes", path);
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ tasks: { done: 1, total: 3 }, readiness: { fullyGated: [], ready: [3] } });
  });

  it("releases a dependency from durable latest approval, even with historical open frontmatter", async () => {
    const f = fixture([[], [1], []]);
    const { base, head } = f.complete(1);
    f.feedback(1, base, head);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({ tasks: { done: 1, total: 3 }, readiness: { fullyGated: [1], ready: [2, 3] } });
  });

  it.each(["absent", "changes-requested", "skipped", "uncommitted", "stale", "incomplete"])("holds %s feedback without rewriting implementation done", async (kind) => {
    const f = fixture([[], [1], []]);
    const { base, head } = f.complete(1);
    if (kind !== "absent") f.feedback(1, base, kind === "stale" ? base : head, kind === "changes-requested" || kind === "skipped" ? kind : "approved", kind !== "uncommitted");
    if (kind === "incomplete") {
      write(f.changeDir, "tasks/task-1/feedback.md", `---\nartifact: feedback\nchange: ready\ntask: 1\ncreated: 2026-10-13\nstatus: open\ndecision: rejected\n---\n# Code Feedback: Task 1 — Task goal 1\n\n## Pass 1 — 2026-10-13\n\nBase: ${base}\nHead: ${head}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n\n## Pass 2 — 2026-10-13\n\nBase: ${base}\n`);
      commitPaths(f.root, "Commit incomplete later pass", ".kepler/changes/ready/tasks/task-1/feedback.md");
    }
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ tasks: { done: 1, total: 3 }, readiness: { fullyGated: [], ready: [3] } });
  });

  it.each(["serial", "legacy"] as const)("preserves %s context without adding a dependency projection", async (mode) => {
    const f = fixture([[], []], mode);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]?.readiness).toBeUndefined();
    expect(result.stdout).not.toContain("ready-tasks:");
  });

  it("fails closed when a plan contains a structurally mismatched definition digest", async () => {
    const f = fixture([[], []]);
    const path = ".kepler/changes/ready/plan.md";
    const source = git(f.root, "show", `HEAD:${path}`);
    write(f.root, path, source.replace(/"taskDefinition":"[0-9a-f]{64}"/, `"taskDefinition":"${"0".repeat(64)}"`));
    commitPaths(f.root, "Commit inconsistent input binding", path);
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ format: "invalid", diagnostics: expect.arrayContaining(["plan.md: Task 1 input context does not match its task definition"]) });
    expect(result.changes[0]?.readiness).toBeUndefined();
    expect(result.stdout).not.toContain("ready-tasks:");
  });

  it("holds only the task whose well-formed input blob is stale", async () => {
    const f = fixture([[], []]);
    const path = ".kepler/changes/ready/plan.md";
    write(f.root, path, git(f.root, "show", `HEAD:${path}`).replace(/"blob":"[0-9a-f]{40}"/, `"blob":"${"f".repeat(40)}"`));
    commitPaths(f.root, "Commit task-specific stale input snapshot", path);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [2], fullyGated: [] } });
  });

  it("does not accept inputs first restored after implementation", async () => {
    const f = fixture([[], [1], []]);
    const path = ".kepler/changes/ready/plan.md";
    const source = git(f.root, "show", `HEAD:${path}`);
    write(f.root, path, source.replace(/^- Notes: .*\n/m, ""));
    commitPaths(f.root, "Remove task input binding before implementation", path);
    const { base } = f.complete(1);
    write(f.root, path, source + "\n");
    const head = commitPaths(f.root, "Restore binding after implementation", path);
    f.feedback(1, base, head);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [3], fullyGated: [] } });
  });

  it("holds a new dependency plan with no committed initialization proof", async () => {
    const f = fixture([[], []]);
    const path = ".kepler/changes/ready/plan.md";
    write(f.root, path, git(f.root, "show", `HEAD:${path}`).replace(/^initialization: .*\n/m, ""));
    commitPaths(f.root, "Remove initialization proof", path);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [], fullyGated: [] } });
  });

  it("holds an uncommitted plan", async () => {
    const f = fixture([[], []]);
    write(f.changeDir, "plan.md", git(f.root, "show", "HEAD:.kepler/changes/ready/plan.md") + "\nUncommitted planning edit.\n");
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [], fullyGated: [] } });
  });

  it("holds done publication that is absent from the committed root ledger", async () => {
    const f = fixture([[], [1], []]);
    const { base, head } = f.complete(1);
    f.feedback(1, base, head);
    f.statuses[0] = "pending";
    write(f.changeDir, "progress.md", f.progress());
    commitPaths(f.root, "Remove committed publication", ".kepler/changes/ready/progress.md");
    f.statuses[0] = "done";
    write(f.changeDir, "progress.md", f.progress());
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ tasks: { done: 1, total: 3 }, readiness: { fullyGated: [], ready: [3] } });
  });

  it("holds an invalid checkpoint cache before first admission", async () => {
    const f = fixture([[], []]);
    write(f.changeDir, "tasks/task-1/.base", "invalid-cache\n");
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [2], fullyGated: [] } });
  });

  it("holds physically current but uncommitted pending evidence", async () => {
    const f = fixture([[], []]);
    const path = ".kepler/changes/ready/tasks/task-1/progress.md";
    write(f.root, path, git(f.root, "show", `HEAD:${path}`) + "\nUncommitted task evidence.\n");
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [2], fullyGated: [] } });
  });
  it("projects initial eligibility before admission and holds later-numbered dependencies", async () => {
    const f = fixture();
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({
      tasks: { done: 0, total: 4 },
      readiness: { version: 1, ready: [1], fullyGated: [], held: expect.arrayContaining([expect.objectContaining({ task: 2 }), expect.objectContaining({ task: 3 }), expect.objectContaining({ task: 4 })]) },
    });
    expect(result.stdout).toContain("ready-tasks: 1");
    expect(result.stdout).toContain("fully-gated-tasks: none");
  });

  it("permits unrelated ready work instead of stopping at a held task", async () => {
    const f = fixture([[], [1], [], [2]]);
    const result = await f.context();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [1, 3], fullyGated: [] } });
  });

  it("holds all dispatch after a selected input changes", async () => {
    const f = fixture([[], []]);
    write(f.root, "AGENTS.md", "Changed binding standards.\n");
    const result = await f.context();
    expect(result.changes[0]).toMatchObject({ readiness: { ready: [], fullyGated: [] } });
  });
});
