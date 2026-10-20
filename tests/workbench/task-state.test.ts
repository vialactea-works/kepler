import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { parse, stringify } from "yaml";
import { taskBreakdownDigestFromDefinitions, taskDefinitionDigest } from "../../packages/cli/src/workbench/artifact-body.js";
import { createE2EHarness, type E2EHarness } from "../e2e/harness.js";
import { cleanupRepos, commitAll, git, makeChangeDir, makeRepo, runCommand, commitPaths, write } from "./helpers.js";

let harness: E2EHarness | undefined;

const invoke = (cwd: string, worker: string, ...args: string[]) => {
  if (harness === undefined) throw new Error("E2E harness is not initialized");
  const mode = ["diff", "context"].includes(args[0] ?? "") ? [] : ["task-state"];
  const result = harness.cli.run(["workbench", ...mode, ...args], {
    cwd,
    env: { PI_SESSION_ID: worker },
  });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr };
};

const fixture = (dependent = false) => {
  const root = makeRepo();
  const changeDir = makeChangeDir(root, "state");
  const key = Path.join(root, ".git", "fixture-key");
  const generated = runCommand("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key], root);
  expect(generated.status, generated.stderr).toBe(0);
  Fs.writeFileSync(Path.join(root, ".git", "allowed-signers"), `test@example.com ${Fs.readFileSync(`${key}.pub`, "utf8")}`);
  git(root, "config", "gpg.format", "ssh");
  git(root, "config", "user.signingkey", key);
  git(root, "config", "gpg.ssh.allowedSignersFile", Path.join(root, ".git", "allowed-signers"));
  git(root, "config", "commit.gpgsign", "true");
  write(root, "AGENTS.md", "Use source CLI and preserve signed task history.\n");
  write(root, ".gitignore", ".lanes/\nnode_modules/\n");
  write(root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2024", experimentalDecorators: true, emitDecoratorMetadata: true, module: "Node16", moduleResolution: "node16" } }));
  write(root, "src/counter.ts", "export const count = 0;\n");
  write(root, "src/label.ts", "export const label = 'pending';\n");
  write(root, "tooling/harness.ts", "export const ready = false;\n");
  write(root, "tooling/verify-counter.ts", "import { count } from '../src/counter.js';\nif (count !== 1) process.exit(1);\n");
  write(root, "tooling/verify-label.ts", "import { label } from '../src/label.js';\nif (label !== 'ready') process.exit(1);\n");
  const base = commitAll(root, "Seed signed owned fixture");
  const blob = git(root, "rev-parse", "HEAD:AGENTS.md");
  const tasks = [1, 2].map((id) => {
    const title = id === 1 ? "Set count" : "Set label";
    const verify = id === 1 ? "bun tooling/verify-counter.ts" : "bun tooling/verify-label.ts";
    const definition = `### Task ${id}: ${title}\n\n- Goal: ${title} to its accepted value.\n- Depends on: ${dependent && id === 2 ? "Task 1" : "none"}\n- Files: src/${id === 1 ? "counter" : "label"}.ts\n- Acceptance:\n  - ${id === 1 ? "Count is 1." : "Label is ready."}\n- Steps:\n  1. Red — verify the current value fails.\n  2. Green — implement the accepted value.\n  3. Refactor — preserve the behavior.\n- Verify: ${verify}\n- Commit: feat: ${title.toLowerCase()}`;
    const definitionDigest = taskDefinitionDigest(definition);
    const notes = { version: 1, repository: root, intentCommit: "tactical:task-state-fixture", taskDefinition: definitionDigest, inputs: [{ path: "AGENTS.md", blob }] };
    return { id, title, verify, definitionDigest, block: `${definition}\n- Notes: ${JSON.stringify(notes)}` };
  });
  const initialization = { version: 1, base, authority: "requester:task-state-fixture", breakdown: taskBreakdownDigestFromDefinitions([1, 2], tasks), taskIds: [1, 2] };
  write(changeDir, "plan.md", `---\nartifact: plan\nchange: state\nstatus: approved\ncreated: 2026-10-13\nauthor: Fixture\ndecision: accepted\nroute_unit: null\nexecution: {version: 2, mode: dependencies}\ninitialization: ${JSON.stringify(initialization)}\n---\n# Plan: State\n\n## Overview\n\nExercise owned task lanes.\n\n## Tasks\n\n${tasks.map((task) => task.block).join("\n\n")}\n\n## Done when\n\nBoth tasks are fully gated.\n`);
  write(changeDir, ".gitignore", "tasks/task-*/.base\n");
  write(changeDir, "progress.md", `---\nartifact: progress\nchange: state\nstatus: pending\nupdated: 2026-10-13\ndecision: accepted\ntasks: ${JSON.stringify(tasks.map((task) => ({ id: task.id, title: task.title, status: "pending", progress: `tasks/task-${task.id}/progress.md` })))}\n---\n# Progress: State\n\n| Task | Status | Progress |\n| --- | --- | --- |\n${tasks.map((task) => `| Task ${task.id}: ${task.title} | pending | [details](tasks/task-${task.id}/progress.md) |`).join("\n")}\n`);
  for (const task of tasks) write(changeDir, `tasks/task-${task.id}/progress.md`, `---\nartifact: task-progress\nchange: state\ntask: ${task.id}\nstatus: pending\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task ${task.id} — ${task.title}\n`);
  const initial = commitAll(root, "Initialize signed dependency scaffold");
  git(root, "branch", "controller");
  git(root, "checkout", "-q", "controller");
  const lanes = tasks.map((task) => {
    const lane = Path.join(root, ".lanes", `task-${task.id}`);
    git(root, "worktree", "add", "-q", "-b", `task-${task.id}`, lane);
    return lane;
  });
  const progressSource = () => Fs.readFileSync(Path.join(changeDir, "progress.md"), "utf8");
  const metadata = () => parse(progressSource().split("---")[1] ?? "") as { tasks: { id: number; status: string; admission?: Record<string, unknown> }[] };
  const admit = (task = 1, expectedHead = git(root, "rev-parse", "HEAD"), retry = false) => invoke(root, "coordinator-fixture", "--admit", ...(retry ? ["--retry"] : []), "--task", `${task}`, "--change-dir", changeDir, "--expected-head", expectedHead, "--worker", `worker-${task}`, "--worktree", lanes[task - 1] ?? "", "--target-branch", "refs/heads/main");
  return { root, changeDir, initial, tasks, lanes, progressSource, metadata, admit };
};

const reservation = (id: string) => ({ id, attempt: 1, prerequisite: "Repair independently owned fixture harness", necessity: "The harness is needed by the task's Verify", evidence: "Fixture harness reports not ready", paths: ["tooling/harness.ts"], verify: "bun tooling/harness.ts" });

const complete = (f: ReturnType<typeof fixture>, task = 1, valid = true) => {
  const lane = f.lanes[task - 1] ?? "";
  const definition = f.tasks[task - 1];
  if (valid) write(lane, `src/${task === 1 ? "counter" : "label"}.ts`, task === 1 ? "export const count = 1;\n" : "export const label = 'ready';\n");
  write(lane, `.kepler/changes/state/tasks/task-${task}/progress.md`, `---\nartifact: task-progress\nchange: state\ntask: ${task}\nstatus: done\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task ${task} — ${definition?.title}\n\n## Attempt 1 — 2026-10-13\n\n- Outcome: done\n`);
  return commitAll(lane, `Implement task ${task}`);
};

const publish = (f: ReturnType<typeof fixture>, taskHead: string, task = 1) => invoke(f.root, "coordinator-fixture", "--publish", "--task", `${task}`, "--change-dir", f.changeDir, "--expected-head", git(f.root, "rev-parse", "HEAD"), "--task-head", taskHead, "--verify", f.tasks[task - 1]?.verify ?? "");

beforeEach(async () => {
  harness = await createE2EHarness({ application: "native" });
});

afterEach(async () => {
  try {
    cleanupRepos();
  } finally {
    await harness?.cleanup();
    harness = undefined;
  }
});

describe("native guarded task-state", () => {
  it("admits a task with durable original Base and isolated worker provenance before dispatch", () => {
    const f = fixture();
    const result = f.admit();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(f.metadata().tasks[0]).toMatchObject({ id: 1, status: "in-progress", admission: { version: 1, base: f.initial, worker: "worker-1", worktree: f.lanes[0], taskDefinition: f.tasks[0]?.definitionDigest } });
    expect(f.metadata().tasks[1]).toMatchObject({ id: 2, status: "pending" });
    expect(git(f.root, "rev-parse", "HEAD")).not.toBe(f.initial);
    expect(git(f.lanes[0] ?? "", "rev-parse", "HEAD")).toBe(git(f.root, "rev-parse", "HEAD"));
    expect(runCommand("git", ["verify-commit", "HEAD"], f.root).status).toBe(0);
  });

  describe("independent peer admission", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
    it("preserves the first task's original Base and worker", () => {
      const first = f.metadata().tasks[0];
      const secondBase = git(f.root, "rev-parse", "HEAD");
      const second = f.admit(2);
      expect(second.status, second.stdout + second.stderr).toBe(0);
      expect(f.metadata().tasks[0]).toEqual(first);
      expect(f.metadata().tasks[1]?.admission).toMatchObject({ base: secondBase, worker: "worker-2" });
    });
    it("rejects a second active task in the first task's writer lane", () => {
      const result = invoke(f.root, "coordinator-fixture", "--admit", "--task", "2", "--change-dir", f.changeDir, "--expected-head", git(f.root, "rev-parse", "HEAD"), "--worker", "worker-2", "--worktree", f.lanes[0] ?? "", "--target-branch", "refs/heads/main");
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("already bound");
      expect(f.metadata().tasks[1]?.status).toBe("pending");
    });
  });

  describe("downstream shared-path reservation context", () => {
    let f: ReturnType<typeof fixture>;
    let lane: string;
    const sharedReservation = { ...reservation("shared"), paths: ["src/counter.ts"] };
    beforeEach(() => {
      f = fixture(true);
      expect(f.admit().status).toBe(0);
      const published = publish(f, complete(f));
      expect(published.status, published.stdout + published.stderr).toBe(0);
      const head = git(f.root, "rev-parse", "HEAD");
      write(f.changeDir, "tasks/task-1/feedback.md", `---\nartifact: feedback\nchange: state\ntask: 1\ncreated: 2026-10-13\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 1 — Set count\n\n## Pass 1 — 2026-10-13\nBase: ${f.initial}\nHead: ${head}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`);
      commitPaths(f.root, "approve prerequisite", ".kepler/changes/state/tasks/task-1/feedback.md");
      const admitted = f.admit(2);
      expect(admitted.status, admitted.stdout + admitted.stderr).toBe(0);
      lane = f.lanes[1] ?? "";
    });

    it("accepts a reserved path changed by a fully gated prerequisite before admission", () => {
      const reserved = invoke(lane, "worker-2", "--reserve", "--task", "2", "--change-dir", ".kepler/changes/state", "--expected-head", git(lane, "rev-parse", "HEAD"), "--reservation", JSON.stringify(sharedReservation));
      expect(reserved.status, reserved.stdout + reserved.stderr).toBe(0);

      const context = invoke(lane, "worker-2", "context", ".kepler/changes/state");
      expect(context.status, context.stdout + context.stderr).toBe(0);
      expect(context.stdout).toContain("format: split");
      expect(context.stdout).not.toContain("reserved path changed before its reservation");
      expect(context.stdout).toContain("Task 2 input context: current");
    });

    it("rejects task-owned shared-path edits committed after admission but before reservation", () => {
      write(lane, "src/counter.ts", "export const count = 2;\n");
      commitAll(lane, "edit shared prerequisite before reservation");
      const path = ".kepler/changes/state/tasks/task-2/progress.md";
      const source = Fs.readFileSync(Path.join(lane, path), "utf8");
      write(lane, path, source.replace("decision: accepted\n", `decision: accepted\nscope_expansions: ${JSON.stringify([sharedReservation])}\n`));
      commitPaths(lane, "record late reservation", path);

      const context = invoke(lane, "worker-2", "context", ".kepler/changes/state");
      expect(context.stdout).toContain("format: invalid");
      expect(context.stdout).toContain("reserved path changed before its reservation");
    });

    it("rejects rewritten admission authority instead of falling back to task-progress history", () => {
      const reserved = invoke(lane, "worker-2", "--reserve", "--task", "2", "--change-dir", ".kepler/changes/state", "--expected-head", git(lane, "rev-parse", "HEAD"), "--reservation", JSON.stringify(sharedReservation));
      expect(reserved.status, reserved.stdout + reserved.stderr).toBe(0);
      const path = ".kepler/changes/state/progress.md";
      const source = Fs.readFileSync(Path.join(lane, path), "utf8");
      const metadata = parse(source.split("---")[1] ?? "");
      metadata.tasks[1].admission.planDigest = "0".repeat(64);
      write(lane, path, `---\n${stringify(metadata).trimEnd()}${source.slice(source.indexOf("\n---", 4))}`);
      commitPaths(lane, "corrupt admission plan digest", path);

      const context = invoke(lane, "worker-2", "context", ".kepler/changes/state");
      expect(context.stdout).toContain("format: invalid");
      expect(context.stdout).toMatch(/admission.*(?:stale|original|transition|parent)/i);
    });
  });

  describe("admitted reservation with dirty goal work", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
    it("commits before edits without fabricating an attempt or losing goal work", () => {
    const lane = f.lanes[0] ?? "";
    write(lane, "src/counter.ts", "export const count = 1;\n");
    const result = invoke(lane, "worker-1", "--reserve", "--task", "1", "--change-dir", ".kepler/changes/state", "--expected-head", git(lane, "rev-parse", "HEAD"), "--reservation", JSON.stringify(reservation("first")));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const progress = Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8");
    expect(parse(progress.split("---")[1] ?? "").scope_expansions).toHaveLength(1);
    expect(progress).not.toContain("## Attempt");
    expect(Fs.readFileSync(Path.join(lane, "src/counter.ts"), "utf8")).toBe("export const count = 1;\n");
    expect(git(lane, "diff", "--name-only", "HEAD")).toBe("src/counter.ts");
    expect(runCommand("git", ["verify-commit", "HEAD"], lane).status).toBe(0);
    expect(f.metadata().tasks[0]?.admission?.base).toBe(f.initial);
    });
  });

  describe("lifetime seed reservations", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture();
      for (const id of ["abandoned-1", "abandoned-2"]) {
        const result = invoke(f.root, "coordinator-fixture", "--reserve", "--task", "1", "--change-dir", f.changeDir, "--expected-head", git(f.root, "rev-parse", "HEAD"), "--target-branch", "refs/heads/main", "--reservation", JSON.stringify(reservation(id)));
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
    });
    it("accounts abandoned reservations without granting admission or creating an attempt", () => {
      expect(f.metadata().tasks[0]).toMatchObject({ status: "pending" });
      expect(f.metadata().tasks[0]?.admission).toBeUndefined();
      const source = Fs.readFileSync(Path.join(f.changeDir, "tasks/task-1/progress.md"), "utf8");
      expect(parse(source.split("---")[1] ?? "").scope_expansions).toHaveLength(2);
      expect(source).not.toContain("## Attempt");
    });
    it("refuses a third lifetime reservation without mutation", () => {
      const head = git(f.root, "rev-parse", "HEAD");
      const source = Fs.readFileSync(Path.join(f.changeDir, "tasks/task-1/progress.md"), "utf8");
      const third = invoke(f.root, "coordinator-fixture", "--reserve", "--task", "1", "--change-dir", f.changeDir, "--expected-head", head, "--target-branch", "refs/heads/main", "--reservation", JSON.stringify(reservation("third")));
      expect(third.status).not.toBe(0);
      expect(git(f.root, "rev-parse", "HEAD")).toBe(head);
      expect(Fs.readFileSync(Path.join(f.changeDir, "tasks/task-1/progress.md"), "utf8")).toBe(source);
      expect(source).not.toContain("## Attempt");
    });

    it("admits after two owner reservations and rejects a third reservation by quota", () => {
      const admitted = f.admit();
      expect(admitted.status, admitted.stdout + admitted.stderr).toBe(0);
      const lane = f.lanes[0] ?? "";
      const third = invoke(lane, "worker-1", "--reserve", "--task", "1", "--change-dir", ".kepler/changes/state", "--expected-head", git(lane, "rev-parse", "HEAD"), "--reservation", JSON.stringify(reservation("third")));
      expect(third.status).not.toBe(0);
      expect(third.stderr).toContain("lifetime limit exceeded");
      expect(third.stderr).not.toContain("does not descend from its task baseline");
    });
  });

  describe("guarded publication", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
  it("preserves original implementation ancestry and publishes done only after integrated Verify", () => {
    const workerHead = complete(f);
    const result = publish(f, workerHead);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(runCommand("git", ["merge-base", "--is-ancestor", workerHead, "HEAD"], f.root).status).toBe(0);
    expect(f.metadata().tasks[0]).toMatchObject({ status: "done", admission: { base: f.initial } });
    expect(f.metadata().tasks[1]).toMatchObject({ status: "pending" });
    expect(Fs.readFileSync(Path.join(f.root, "src/counter.ts"), "utf8")).toBe("export const count = 1;\n");
    expect(runCommand("git", ["verify-commit", "HEAD"], f.root).status).toBe(0);
    expect(Fs.existsSync(Path.join(f.changeDir, "tasks/task-1/feedback.md"))).toBe(false);
  });

  it("retains failed integration evidence and holds root implementation status when real Verify fails", () => {
    const workerHead = complete(f, 1, false);
    const result = publish(f, workerHead);
    expect(result.status).not.toBe(0);
    expect(runCommand("git", ["merge-base", "--is-ancestor", workerHead, "HEAD"], f.root).status).toBe(0);
    expect(f.metadata().tasks[0]).toMatchObject({ status: "in-progress" });
    expect(Fs.readFileSync(Path.join(f.root, "src/counter.ts"), "utf8")).toBe("export const count = 0;\n");
    expect(Fs.readFileSync(Path.join(f.root, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8")).toContain("- Outcome: done");
  });

  it("rejects worker edits to selected inputs before integration and preserves the lane", () => {
    write(f.lanes[0] ?? "", "AGENTS.md", "Altered standards.\n");
    const workerHead = complete(f);
    const head = git(f.root, "rev-parse", "HEAD");
    const result = publish(f, workerHead);
    expect(result.status).not.toBe(0);
    expect(git(f.root, "rev-parse", "HEAD")).toBe(head);
    expect(git(f.lanes[0] ?? "", "rev-parse", "HEAD")).toBe(workerHead);
    expect(f.metadata().tasks[0]?.status).toBe("in-progress");
  });
  it("rejects contradictory terminal responses before integrating original work", () => {
    const workerHead = complete(f);
    const head = git(f.root, "rev-parse", "HEAD");
    const result = invoke(f.root, "coordinator-fixture", "--publish", "--task", "1", "--change-dir", f.changeDir, "--expected-head", head, "--task-head", workerHead, "--verify", f.tasks[0]?.verify ?? "", "--response", "blocked");
    expect(result.status).not.toBe(0);
    expect(git(f.root, "rev-parse", "HEAD")).toBe(head);
    expect(f.metadata().tasks[0]?.status).toBe("in-progress");
  });
  });

  describe.each([[1, 2], [2, 1]])("isolated publication order %s then %s", (first, second) => {
    let f: ReturnType<typeof fixture>;
    let heads: string[];
    let firstEntry: unknown;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
    describe("after the first integration", () => {
      beforeEach(() => {
        expect(f.admit(2).status).toBe(0);
        heads = [complete(f, 1), complete(f, 2)];
        const published = publish(f, heads[first - 1] ?? "", first);
        expect(published.status, published.stdout + published.stderr).toBe(0);
        firstEntry = f.metadata().tasks[first - 1];
      });
      it("preserves both original commit ancestries and the first publication", () => {
        const published = publish(f, heads[second - 1] ?? "", second);
        expect(published.status, published.stdout + published.stderr).toBe(0);
        expect(f.metadata().tasks[first - 1]).toEqual(firstEntry);
        expect(f.metadata().tasks.map((entry) => entry.status)).toEqual(["done", "done"]);
        for (const head of heads) expect(runCommand("git", ["merge-base", "--is-ancestor", head, "HEAD"], f.root).status).toBe(0);
        expect(Fs.readFileSync(Path.join(f.root, "src/counter.ts"), "utf8")).toBe("export const count = 1;\n");
        expect(Fs.readFileSync(Path.join(f.root, "src/label.ts"), "utf8")).toBe("export const label = 'ready';\n");
      });
    });
  });

  describe("interrupted workspace recovery", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
    it("rebinds a stopped writer while preserving dirty goal work and original Base", () => {
      const lane = f.lanes[0] ?? "";
      write(lane, "src/counter.ts", "export const count = 1;\n");
      const head = git(f.root, "rev-parse", "HEAD");
      const result = invoke(f.root, "coordinator-fixture", "--admit", "--retry", "--task", "1", "--change-dir", f.changeDir, "--expected-head", head, "--worker", "replacement-worker", "--worktree", lane, "--target-branch", "refs/heads/main");
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(Fs.readFileSync(Path.join(lane, "src/counter.ts"), "utf8")).toBe("export const count = 1;\n");
      expect(f.metadata().tasks[0]?.admission).toMatchObject({ base: f.initial, sourceHead: head, worker: "replacement-worker" });
      expect(git(lane, "diff", "--name-only", "HEAD")).toBe("src/counter.ts");
    });
  });

  describe("publication authority history", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture();
      expect(f.admit().status).toBe(0);
      const published = publish(f, complete(f));
      expect(published.status, published.stdout + published.stderr).toBe(0);
    });
    it("rejects erased publication authority even if a later ledger restores the same value", () => {
      const source = f.progressSource();
      const front = parse(source.split("---")[1] ?? "") as { tasks: Record<string, unknown>[] };
      delete front.tasks[0]?.publication;
      const body = source.slice(source.indexOf("---", 3) + 3);
      write(f.changeDir, "progress.md", `---\n${JSON.stringify(front)}\n---${body}`);
      commitAll(f.root, "Erase publication authority");
      write(f.changeDir, "progress.md", source);
      commitAll(f.root, "Restore erased publication authority");
      const result = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("publication history erased");
    });
    it("rejects a committed plan downgrade instead of substituting a legacy attempt Base", () => {
      const planPath = Path.join(f.changeDir, "plan.md");
      write(f.changeDir, "plan.md", Fs.readFileSync(planPath, "utf8").replace("execution: {version: 2, mode: dependencies}\n", ""));
      commitAll(f.root, "Downgrade admitted plan");
      const result = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("downgraded");
    });
  });

  describe("blocked recovery admission", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture();
      expect(f.admit().status).toBe(0);
      const lane = f.lanes[0] ?? "";
      write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 1\nstatus: blocked\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 1 — Set count\n\n## Attempt 1 — 2026-10-13\n\n- Outcome: blocked\n`);
      const head = commitAll(lane, "Record blocked task without publishing partial code");
      const result = publish(f, head);
      expect(result.status, result.stdout + result.stderr).toBe(0);
    });
    describe("after retry admission", () => {
      let source: string;
      let previous: string;
      beforeEach(() => {
        source = Fs.readFileSync(Path.join(f.changeDir, "tasks/task-1/progress.md"), "utf8");
        previous = git(f.root, "rev-parse", "HEAD");
        const result = f.admit(1, previous, true);
        expect(result.status, result.stdout + result.stderr).toBe(0);
      });
      it("preserves original Base and terminal evidence", () => {
        expect(f.metadata().tasks[0]).toMatchObject({ status: "in-progress", admission: { base: f.initial, sourceHead: previous } });
        expect(Fs.readFileSync(Path.join(f.lanes[0] ?? "", ".kepler/changes/state/tasks/task-1/progress.md"), "utf8")).toBe(source);
      });
      it("recovers the original checkpoint after retiring the earlier publication", () => {
        const lane = f.lanes[0] ?? "";
        const result = invoke(lane, "worker-1", "diff", "--record", "--task", "1", "--change-dir", ".kepler/changes/state");
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/.base"), "utf8").trim()).toBe(f.initial);
      });
    });
  });

  describe("original admission checkpoints", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
    it("accepts selected inputs in the independently bound worker lane", () => {
      const lane = f.lanes[0] ?? "";
      const context = invoke(lane, "worker-1", "context", ".kepler/changes/state");
      expect(context.status, context.stdout + context.stderr).toBe(0);
      expect(context.stdout).toContain("Task 1 input context: current");
      expect(context.stdout).toContain("Task 2 input context: current");
    });
    it("rejects a copied lane identity when the observed actor differs", () => {
      const lane = f.lanes[0] ?? "";
      const context = invoke(lane, "foreign-worker", "context", ".kepler/changes/state");
      expect(context.stdout).toContain("Task 1 input context: stale (repository)");
    });
    it("records original admission Base before the first task attempt", () => {
      const lane = f.lanes[0] ?? "";
      const recorded = invoke(lane, "worker-1", "diff", "--record", "--task", "1", "--change-dir", ".kepler/changes/state");
      expect(recorded.status, recorded.stdout + recorded.stderr).toBe(0);
      expect(Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/.base"), "utf8").trim()).toBe(f.initial);
    });
  });

  it("rejects copied admission metadata without the required in-progress transition", () => {
    const f = fixture();
    expect(f.admit().status).toBe(0);
    const admission = f.metadata().tasks[0]?.admission;
    git(f.root, "reset", "--hard", f.initial);
    const source = f.progressSource();
    const front = parse(source.split("---")[1] ?? "") as { tasks: Record<string, unknown>[] };
    if (front.tasks[0]) front.tasks[0].admission = admission;
    write(f.changeDir, "progress.md", `---\n${JSON.stringify(front)}\n---${source.slice(source.indexOf("---", 3) + 3)}`);
    commitAll(f.root, "Attach admission while task remains pending");
    const result = invoke(f.root, "coordinator-fixture", "diff", "--record", "--task", "1", "--change-dir", f.changeDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("in-progress transition");
  });

  it("preserves an existing coordinator lock instead of claiming admission", () => {
    const f = fixture();
    const lock = Path.join(f.root, ".git", "kepler-task-state.lock");
    Fs.writeFileSync(lock, "another coordinator\n");
    const result = f.admit();
    expect(result.status).not.toBe(0);
    expect(Fs.readFileSync(lock, "utf8")).toBe("another coordinator\n");
    expect(git(f.root, "rev-parse", "HEAD")).toBe(f.initial);
  });

  it("refuses stale admission without modifying either mirrored ledger or lane", () => {
    const f = fixture();
    const before = f.progressSource();
    const laneHead = git(f.lanes[0] ?? "", "rev-parse", "HEAD");
    const result = f.admit(1, "0".repeat(40));
    expect(result.status).not.toBe(0);
    expect(f.progressSource()).toBe(before);
    expect(git(f.lanes[0] ?? "", "rev-parse", "HEAD")).toBe(laneHead);
    expect(git(f.root, "rev-parse", "HEAD")).toBe(f.initial);
  });
});
