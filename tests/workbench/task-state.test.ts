import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { taskBreakdownDigestFromDefinitions, taskDefinitionDigest } from "../../packages/cli/src/workbench/artifact-body.js";
import { cleanupRepos, commitAll, fixtureEnvironment, git, makeChangeDir, makeRepo, runCommand, commitPaths, write } from "./helpers.js";

const sourceCli = fileURLToPath(new URL("../../packages/cli/src/cli/main.ts", import.meta.url));
const invoke = (cwd: string, worker: string, ...args: string[]) => {
  const mode = ["diff", "context"].includes(args[0] ?? "") ? [] : ["task-state"];
  const result = spawnSync("bun", [sourceCli, "workbench", ...mode, ...args], { cwd, encoding: "utf8", env: { ...fixtureEnvironment, PI_SESSION_ID: worker } });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

const fixture = (dependent = false, verifySuffix = "") => {
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
  const base = commitAll(root, "Seed signed owned fixture");
  const blob = git(root, "rev-parse", "HEAD:AGENTS.md");
  const tasks = [1, 2].map((id) => {
    const title = id === 1 ? "Set count" : "Set label";
    const verify = (id === 1 ? "bun -e \"import { count } from './src/counter.ts'; if (count !== 1) process.exit(1)\"" : "bun -e \"import { label } from './src/label.ts'; if (label !== 'ready') process.exit(1)\"") + verifySuffix;
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
  const metadata = () => parse(progressSource().split("---")[1] ?? "") as { tasks: { id: number; status: string; admission?: Record<string, unknown>; publication?: unknown }[] };
  const admit = (task = 1, expectedHead = git(root, "rev-parse", "HEAD"), retry = false) => invoke(root, "coordinator-fixture", "--admit", ...(retry ? ["--retry"] : []), "--task", `${task}`, "--change-dir", changeDir, "--expected-head", expectedHead, "--worker", `worker-${task}`, "--worktree", lanes[task - 1] ?? "", "--target-branch", "refs/heads/main");
  return { root, changeDir, initial, tasks, lanes, progressSource, metadata, admit };
};

const reservation = (id: string) => ({ id, attempt: 1, prerequisite: "Repair independently owned fixture harness", necessity: "The harness is needed by the task's Verify", evidence: "Fixture harness reports not ready", paths: ["tooling/harness.ts"], verify: "bun tooling/harness.ts" });

const complete = (f: ReturnType<typeof fixture>, task = 1, valid = true) => {
  const lane = f.lanes[task - 1] ?? "";
  const definition = f.tasks[task - 1];
  if (valid) write(lane, `src/${task === 1 ? "counter" : "label"}.ts`, task === 1 ? "export const count = 1;\n" : "export const label = 'ready';\n");
  const startHead = git(lane, "rev-parse", "HEAD");
  write(lane, `.kepler/changes/state/tasks/task-${task}/progress.md`, `---\nartifact: task-progress\nchange: state\ntask: ${task}\nstatus: done\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task ${task} — ${definition?.title}\n\n## Attempt 1 — 2026-10-13\n\n- Start HEAD: ${startHead}\n- Outcome: done\n`);
  return commitAll(lane, `Implement task ${task}`);
};

const publish = (f: ReturnType<typeof fixture>, taskHead: string, task = 1) => invoke(f.root, "coordinator-fixture", "--publish", "--task", `${task}`, "--change-dir", f.changeDir, "--expected-head", git(f.root, "rev-parse", "HEAD"), "--task-head", taskHead, "--verify", f.tasks[task - 1]?.verify ?? "");

const publishLegacyBlocked = (f: ReturnType<typeof fixture>, taskHead: string): string => {
  git(f.root, "merge", "--ff-only", taskHead);
  const integratedHead = git(f.root, "rev-parse", "HEAD");
  const source = f.progressSource();
  const metadata = parse(source.split("---")[1] ?? "") as { tasks: Record<string, unknown>[] };
  const task = metadata.tasks[0];
  if (!task) throw new Error("root task entry is missing");
  task.status = "blocked";
  task.publication = { version: 1, taskHead, integratedHead, outcome: "blocked", verification: null };
  const front = `---\n${stringify(metadata).trimEnd()}\n---\n`;
  const body = source.slice(source.indexOf("---", 3) + 3);
  const row = "| Task 1: Set count | in-progress | [details](tasks/task-1/progress.md) |";
  if (!body.includes(row)) throw new Error("root task status row is missing");
  write(f.changeDir, "progress.md", `${front}${body.replace(row, row.replace("in-progress", "blocked"))}`);
  return commitPaths(f.root, "Publish legacy blocked task", ".kepler/changes/state/progress.md");
};

afterEach(cleanupRepos);

describe("native guarded task-state", () => {
  it("admits a task with durable original Base and isolated worker provenance before dispatch", () => {
    const f = fixture();
    const result = f.admit();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(f.metadata().tasks[0]).toMatchObject({ id: 1, status: "in-progress", admission: { version: 1, base: f.initial, worker: "worker-1", worktree: f.lanes[0], taskDefinition: f.tasks[0]?.definitionDigest } });
    expect(f.metadata().tasks[1]).toMatchObject({ id: 2, status: "pending" });
    expect(git(f.root, "rev-parse", "HEAD")).not.toBe(f.initial);
    expect(git(f.lanes[0] ?? "", "rev-parse", "HEAD")).toBe(git(f.root, "rev-parse", "HEAD"));
    expect(result.stdout).toContain(`Task Base: ${f.initial}`);
    expect(result.stdout).toContain(`Attempt start HEAD: ${git(f.lanes[0] ?? "", "rev-parse", "HEAD")}`);
    expect(result.stdout).toContain(`Next coordinator HEAD: ${git(f.root, "rev-parse", "HEAD")}`);
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
    it("refreshes a parallel admission only across verified admission commits", () => {
      f = fixture();
      const expected = f.initial;
      const first = f.admit(1, expected);
      expect(first.status, first.stdout + first.stderr).toBe(0);
      const second = f.admit(2, expected);
      expect(second.status, second.stdout + second.stderr).toBe(0);
      const firstAdmission = f.metadata().tasks[0]?.admission;
      const secondAdmission = f.metadata().tasks[1]?.admission;
      const firstCommit = /^Admission commit: ([0-9a-f]{40})$/m.exec(first.stdout)?.[1];
      expect(firstAdmission?.base).toBe(expected);
      expect(secondAdmission?.sourceHead).toBe(firstCommit);
      expect(secondAdmission?.base).toBe(firstCommit);
      expect(second.stdout).toContain("Coordinator source HEAD:");
      expect(second.stdout).toContain("Attempt start HEAD:");
      expect(second.stdout).toContain("Next coordinator HEAD:");
      expect(git(f.lanes[1] ?? "", "rev-parse", "HEAD")).toBe(git(f.root, "rev-parse", "HEAD"));
    }, 20000);
    it("rejects stale-head refresh across an admission from another coordinator", () => {
      f = fixture();
      const expected = f.initial;
      expect(f.admit(1, expected).status).toBe(0);
      const source = f.progressSource();
      const metadata = parse(source.split("---")[1] ?? "") as { tasks: { admission?: Record<string, unknown> }[] };
      if (!metadata.tasks[0]?.admission) throw new Error("admission metadata is missing");
      metadata.tasks[0].admission.coordinator = "other-coordinator";
      const body = source.slice(source.indexOf("---", 3) + 3);
      write(f.changeDir, "progress.md", `---\n${JSON.stringify(metadata)}\n---${body}`);
      commitAll(f.root, "Change admission coordinator identity");

      const result = f.admit(2, expected);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("current coordinator/workspace");
      expect(f.metadata().tasks[1]?.status).toBe("pending");
    }, 30000);
    it.each([["source", "refs/heads/foreign-source"], ["target", "refs/heads/foreign-target"], ["repository", "/foreign/repository"]])("rejects stale-head refresh across a changed %s binding", (field, value) => {
      f = fixture();
      const expected = f.initial;
      expect(f.admit(1, expected).status).toBe(0);
      const source = f.progressSource();
      const metadata = parse(source.split("---")[1] ?? "") as { tasks: { admission?: Record<string, unknown> }[] };
      const admission = metadata.tasks[0]?.admission;
      if (!admission) throw new Error("admission metadata is missing");
      admission[field] = value;
      const body = source.slice(source.indexOf("---", 3) + 3);
      write(f.changeDir, "progress.md", `---\n${JSON.stringify(metadata)}\n---${body}`);
      commitAll(f.root, `Change admission ${field} binding`);

      const result = f.admit(2, expected);

      expect(result.status).not.toBe(0);
      expect(f.metadata().tasks[1]?.status).toBe("pending");
    }, 30000);
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
      const publicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(published.stdout)?.[1];
      const publication = f.metadata().tasks[0]?.publication as { integratedHead?: string } | undefined;
      if (!publicationCommit || !publication?.integratedHead) throw new Error("verified publication identity is missing");
      write(f.changeDir, "tasks/task-1/feedback.md", `---\nartifact: feedback\nchange: state\ntask: 1\ncreated: 2026-10-13\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 1 — Set count\n\n## Pass 1 — 2026-10-13\nBase: ${f.initial}\nHead: ${publication.integratedHead}\nVerdict: approved\nCoverage: ${publicationCommit}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`);
      commitPaths(f.root, "approve prerequisite", ".kepler/changes/state/tasks/task-1/feedback.md");
      const admitted = f.admit(2);
      expect(admitted.status, admitted.stdout + admitted.stderr).toBe(0);
      lane = f.lanes[1] ?? "";
    }, 30000);

    it("accepts a reserved path changed by a fully gated prerequisite before admission", () => {
      const reserved = invoke(lane, "worker-2", "--reserve", "--task", "2", "--change-dir", ".kepler/changes/state", "--expected-head", git(lane, "rev-parse", "HEAD"), "--reservation", JSON.stringify(sharedReservation));
      expect(reserved.status, reserved.stdout + reserved.stderr).toBe(0);

      const context = invoke(lane, "worker-2", "context", ".kepler/changes/state");
      expect(context.status, context.stdout + context.stderr).toBe(0);
      expect(context.stdout).toContain("format: split");
      expect(context.stdout).not.toContain("reserved path changed before its reservation");
      expect(context.stdout).toContain("Task 2 input context: current");
    }, 30000);

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
    }, 30000);

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
    }, 30000);
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
    }, 20000);
  });

  describe("guarded publication", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => { f = fixture(); expect(f.admit().status).toBe(0); });
  it("preserves original implementation ancestry and publishes done only after integrated Verify", () => {
    const workerHead = complete(f);
    const result = publish(f, workerHead);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(runCommand("git", ["merge-base", "--is-ancestor", workerHead, "HEAD"], f.root).status).toBe(0);
    expect(f.metadata().tasks[0]).toMatchObject({ status: "done", admission: { base: f.initial }, publication: { version: 2, reviewCoverage: { version: 1, attempts: [{ number: 1, admissionCommit: expect.any(String), startHead: expect.any(String), terminalHead: expect.any(String), commits: expect.any(Array) }], integrationBase: expect.any(String), integratedHead: expect.any(String) } } });
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

  it.each([
    { laterChanges: false, correction: false },
    { laterChanges: true, correction: false },
    { laterChanges: false, correction: true },
  ])("preserves integration coverage when retrying failed Verify %j", ({ laterChanges, correction }) => {
    const recovery = fixture(false, " && test ! -e .lanes/verify-block");
    expect(recovery.admit().status).toBe(0);
    let workerHead = complete(recovery);
    const integrationBase = git(recovery.root, "rev-parse", "HEAD");
    write(recovery.root, ".lanes/verify-block", "temporarily unavailable\n");
    const failed = publish(recovery, workerHead);
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("Integrated Verify failed");
    Fs.unlinkSync(Path.join(recovery.root, ".lanes/verify-block"));
    if (laterChanges) {
      write(recovery.root, "recovery.txt", "Independent work after the interrupted integration.\n");
      commitPaths(recovery.root, "Record independent work", "recovery.txt");
      Fs.unlinkSync(Path.join(recovery.root, "recovery.txt"));
      commitPaths(recovery.root, "Revert independent work", "recovery.txt");
    }
    if (correction) {
      expect(recovery.admit(1, git(recovery.root, "rev-parse", "HEAD"), true).status).toBe(0);
      const lane = recovery.lanes[0] ?? "";
      const start = git(lane, "rev-parse", "HEAD");
      write(lane, "src/counter.ts", "export const count = 1;\nexport const recovered = true;\n");
      const progressPath = ".kepler/changes/state/tasks/task-1/progress.md";
      const prior = Fs.readFileSync(Path.join(lane, progressPath), "utf8").trimEnd();
      write(lane, progressPath, `${prior}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${start}\n- Outcome: done\n`);
      workerHead = commitAll(lane, "Correct interrupted integration");
    }

    const retried = publish(recovery, workerHead);
    expect(retried.status, retried.stdout + retried.stderr).toBe(0);
    const publication = recovery.metadata().tasks[0]?.publication;
    if (laterChanges || correction) expect(publication).toMatchObject({ version: 1 });
    else expect(publication).toMatchObject({ version: 2, reviewCoverage: { integrationBase } });
    const packaged = invoke(recovery.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", recovery.changeDir);
    expect(packaged.status, packaged.stdout + packaged.stderr).toBe(0);
    const path = /^Package: (.+)$/m.exec(packaged.stdout)?.[1];
    if (!path) throw new Error("Recovery review package is missing");
    const content = Fs.readFileSync(path, "utf8");
    expect(content).toContain("export const count = 1;");
    if (laterChanges || correction) expect(content).toContain("## Full cumulative commit history");
    if (laterChanges) expect(content).toContain("Independent work after the interrupted integration.");
    if (correction) expect(content).toContain("export const recovered = true;");
    if (!laterChanges && !correction) expect(content).toContain(`Integration base: ${integrationBase}`);
  }, 30000);

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

  it("packages the integration delta when parallel workers edit the same path", () => {
    const f = fixture();
    write(f.root, "src/shared.ts", "export const sharedCount = 0;\n\nexport const sharedReady = false;\n");
    commitAll(f.root, "Add shared integration fixture");
    expect(f.admit(1).status).toBe(0);
    expect(f.admit(2).status).toBe(0);
    const firstLane = f.lanes[0] ?? "";
    const secondLane = f.lanes[1] ?? "";
    const firstStart = git(firstLane, "rev-parse", "HEAD");
    const secondStart = git(secondLane, "rev-parse", "HEAD");
    write(firstLane, "src/counter.ts", "export const count = 1;\n");
    write(firstLane, "src/shared.ts", "export const sharedCount = 1;\n\nexport const sharedReady = false;\n");
    write(firstLane, ".kepler/changes/state/tasks/task-1/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 1\nstatus: done\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 1 — Set count\n\n## Attempt 1 — 2026-10-13\n\n- Start HEAD: ${firstStart}\n- Outcome: done\n`);
    const firstTaskHead = commitAll(firstLane, "Complete first shared-path task");
    write(secondLane, "src/label.ts", "export const label = 'ready';\n");
    write(secondLane, "src/shared.ts", "export const sharedCount = 0;\n\nexport const sharedReady = true;\n");
    write(secondLane, ".kepler/changes/state/tasks/task-2/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 2\nstatus: done\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 2 — Set label\n\n## Attempt 1 — 2026-10-13\n\n- Start HEAD: ${secondStart}\n- Outcome: done\n`);
    const secondTaskHead = commitAll(secondLane, "Complete second shared-path task");
    const firstPublication = publish(f, firstTaskHead, 1);
    expect(firstPublication.status, firstPublication.stdout + firstPublication.stderr).toBe(0);
    const integrationBase = git(f.root, "rev-parse", "HEAD");
    const secondPublication = publish(f, secondTaskHead, 2);
    expect(secondPublication.status, secondPublication.stdout + secondPublication.stderr).toBe(0);
    expect(Fs.readFileSync(Path.join(f.root, "src/shared.ts"), "utf8")).toBe("export const sharedCount = 1;\n\nexport const sharedReady = true;\n");

    const reviewed = invoke(f.root, "coordinator-fixture", "diff", "--task", "2", "--change-dir", f.changeDir);

    expect(reviewed.status, reviewed.stdout + reviewed.stderr).toBe(0);
    const packagePath = /^Package: (.+)$/m.exec(reviewed.stdout)?.[1];
    if (!packagePath) throw new Error("task review package path is missing");
    const packageSource = Fs.readFileSync(packagePath, "utf8");
    expect(packageSource).toContain(`Integration base: ${integrationBase}`);
    expect(packageSource).toContain("## Integration history");
    expect(packageSource).toContain("src/shared.ts");
    expect(packageSource).toContain("sharedReady = true");

    const taskTwoPublicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(secondPublication.stdout)?.[1];
    const taskTwoBase = (f.metadata().tasks[1]?.admission as { base?: string } | undefined)?.base;
    const taskTwoIntegratedHead = (f.metadata().tasks[1]?.publication as { integratedHead?: string } | undefined)?.integratedHead;
    if (!taskTwoPublicationCommit || !taskTwoBase || !taskTwoIntegratedHead) throw new Error("task 2 publication identity is missing");
    const feedbackPath = "tasks/task-2/feedback.md";
    write(f.changeDir, feedbackPath, `---\nartifact: feedback\nchange: state\ntask: 2\ncreated: 2026-10-13\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 2 — Set label\n\n## Pass 1 — 2026-10-13\nBase: ${taskTwoBase}\nHead: ${taskTwoIntegratedHead}\nVerdict: changes-requested\nCoverage: ${taskTwoPublicationCommit}\n\n### Blocking\n- [src/label.ts:1] id: pass-1-blocking-1; kind: code-defect; Normalize the accepted label representation.\n\n### Suggestions\n- None.\n`);
    commitPaths(f.root, "Request correction after overlapping peer integration", `.kepler/changes/state/${feedbackPath}`);
    const retry = f.admit(2, git(f.root, "rev-parse", "HEAD"), true);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    const correctionStart = git(secondLane, "rev-parse", "HEAD");
    write(secondLane, "src/label.ts", "export const label = \"ready\";\n");
    const taskTwoProgress = Fs.readFileSync(Path.join(secondLane, ".kepler/changes/state/tasks/task-2/progress.md"), "utf8").trimEnd();
    write(secondLane, ".kepler/changes/state/tasks/task-2/progress.md", `${taskTwoProgress}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${correctionStart}\n- Outcome: done\n`);
    const correctionHead = commitAll(secondLane, "Correct task 2 after peer integration");
    const correctionPublication = publish(f, correctionHead, 2);
    expect(correctionPublication.status, correctionPublication.stdout + correctionPublication.stderr).toBe(0);
    const correctionPublicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(correctionPublication.stdout)?.[1];
    if (!correctionPublicationCommit) throw new Error("corrected task 2 publication identity is missing");
    const correctedPackage = invoke(f.root, "coordinator-fixture", "diff", "--task", "2", "--change-dir", f.changeDir);
    expect(correctedPackage.status, correctedPackage.stdout + correctedPackage.stderr).toBe(0);
    const correctedPackagePath = /^Package: (.+)$/m.exec(correctedPackage.stdout)?.[1];
    if (!correctedPackagePath) throw new Error("corrected task review package path is missing");
    const correctedPackageSource = Fs.readFileSync(correctedPackagePath, "utf8");
    expect(correctedPackageSource).toContain(`V2 publication integration delta ${taskTwoPublicationCommit}`);
    expect(correctedPackageSource).toContain(`V2 publication integration delta ${correctionPublicationCommit}`);
    expect(correctedPackageSource).toContain("sharedCount = 1;");
    expect(correctedPackageSource).toContain("sharedReady = true;");
    expect(correctedPackageSource).toContain('export const label = "ready";');
  }, 120000);

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
    }, 20000);
  });

  describe("publication authority history", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture();
      expect(f.admit().status).toBe(0);
      const published = publish(f, complete(f));
      expect(published.status, published.stdout + published.stderr).toBe(0);
    });
    it("rejects altered task-owned commit coverage", () => {
      const source = f.progressSource();
      const metadata = parse(source.split("---")[1] ?? "") as { tasks: { publication: { reviewCoverage: { attempts: { commits: { paths: string[] }[] }[] } } }[] };
      const coverage = metadata.tasks[0]?.publication.reviewCoverage.attempts[0]?.commits[0]?.paths;
      if (!coverage) throw new Error("published commit coverage is missing");
      coverage.splice(0, coverage.length, "unrelated/peer.ts");
      const body = source.slice(source.indexOf("---", 3) + 3);
      write(f.changeDir, "progress.md", `---\n${JSON.stringify(metadata)}\n---${body}`);
      commitAll(f.root, "Alter task-owned commit coverage");

      const result = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("attempt commit provenance does not match Git");
    });

    it("rejects forged Start HEAD merge coverage that hides task commits as pre-start ancestry", () => {
      const source = f.progressSource();
      const metadata = parse(source.split("---")[1] ?? "") as { tasks: { publication: { integratedHead: string; reviewCoverage: { attempts: { startHead: string }[] } } }[] };
      const task = metadata.tasks[0];
      const attempt = task?.publication.reviewCoverage.attempts[0];
      if (!task || !attempt) throw new Error("published attempt coverage is missing");
      attempt.startHead = task.publication.integratedHead;
      const body = source.slice(source.indexOf("---", 3) + 3);
      write(f.changeDir, "progress.md", `---\n${JSON.stringify(metadata)}\n---${body}`);
      commitAll(f.root, "Forge task Start HEAD merge coverage");

      const result = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("attempt start HEAD includes unaccounted pre-attempt ancestry");
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

  it("retains signed correction history and maps each feedback pass to its publication epoch", () => {
    const f = fixture();
    const firstAdmission = f.admit();
    expect(firstAdmission.status, firstAdmission.stdout + firstAdmission.stderr).toBe(0);
    const firstTaskHead = complete(f);
    const firstPublication = publish(f, firstTaskHead);
    expect(firstPublication.status, firstPublication.stdout + firstPublication.stderr).toBe(0);
    const firstPublicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(firstPublication.stdout)?.[1];
    const firstIntegratedHead = (f.metadata().tasks[0]?.publication as { integratedHead?: string } | undefined)?.integratedHead;
    if (!firstPublicationCommit || !firstIntegratedHead) throw new Error("first publication identity is missing");
    const feedbackPath = "tasks/task-1/feedback.md";
    const firstPass = `---\nartifact: feedback\nchange: state\ntask: 1\ncreated: 2026-10-13\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 1 — Set count\n\n## Pass 1 — 2026-10-13\nBase: ${f.initial}\nHead: ${firstIntegratedHead}\nVerdict: changes-requested\nCoverage: ${firstPublicationCommit}\n\n### Blocking\n- [src/counter.ts:1] id: pass-1-blocking-1; kind: code-defect; Expose the explicitly reviewed state required by the accepted task contract (violates: task acceptance).\n\n### Suggestions\n- None.\n`;
    write(f.changeDir, feedbackPath, firstPass);
    const firstFeedbackCommit = commitPaths(f.root, "Request task correction", `.kepler/changes/state/${feedbackPath}`);
    expect(runCommand("git", ["verify-commit", firstFeedbackCommit], f.root).status).toBe(0);
    const lint = spawnSync("bun", [sourceCli, "workbench", "lint", "--file", Path.join(f.changeDir, feedbackPath)], { cwd: f.root, encoding: "utf8", env: fixtureEnvironment });
    expect(lint.status, `${lint.stdout}${lint.stderr}`).toBe(0);

    const retry = f.admit(1, git(f.root, "rev-parse", "HEAD"), true);
    const readiness = invoke(f.root, "coordinator-fixture", "context", f.changeDir);
    expect(retry.status, `${retry.stdout + retry.stderr}\n${readiness.stdout}${readiness.stderr}`).toBe(0);
    const lane = f.lanes[0] ?? "";
    const secondStartHead = git(lane, "rev-parse", "HEAD");
    write(lane, "src/counter.ts", "export const count = 1;\nexport const reviewed = true;\n");
    const taskProgress = Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8").trimEnd();
    write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `${taskProgress}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${secondStartHead}\n- Outcome: done\n`);
    const secondTaskHead = commitAll(lane, "Address task feedback");
    const secondPublication = publish(f, secondTaskHead);
    expect(secondPublication.status, secondPublication.stdout + secondPublication.stderr).toBe(0);
    const secondPublicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(secondPublication.stdout)?.[1];
    const secondIntegratedHead = (f.metadata().tasks[0]?.publication as { integratedHead?: string } | undefined)?.integratedHead;
    if (!secondPublicationCommit || !secondIntegratedHead) throw new Error("second publication identity is missing");
    const beforeStaleRetry = git(f.root, "rev-parse", "HEAD");
    const staleRetry = f.admit(1, beforeStaleRetry, true);
    expect(staleRetry.status).not.toBe(0);
    expect(git(f.root, "rev-parse", "HEAD")).toBe(beforeStaleRetry);
    const passTwo = `\n## Pass 2 — 2026-10-14\nBase: ${f.initial}\nHead: ${secondIntegratedHead}\nVerdict: approved\nCoverage: ${secondPublicationCommit}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
    write(f.changeDir, feedbackPath, `${firstPass}${passTwo}`);
    const finalFeedbackCommit = commitPaths(f.root, "Approve republished task", `.kepler/changes/state/${feedbackPath}`);
    expect(runCommand("git", ["verify-commit", firstFeedbackCommit], f.root).status).toBe(0);
    expect(runCommand("git", ["verify-commit", finalFeedbackCommit], f.root).status).toBe(0);
    expect(firstPass).toContain(`Coverage: ${firstPublicationCommit}`);
    expect(Fs.readFileSync(Path.join(f.changeDir, feedbackPath), "utf8")).toBe(`${firstPass}${passTwo}`);

    const reviewed = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);
    expect(reviewed.status, reviewed.stdout + reviewed.stderr).toBe(0);
    const packagePath = /^Package: (.+)$/m.exec(reviewed.stdout)?.[1];
    if (!packagePath) throw new Error("task review package path is missing");
    const packageSource = Fs.readFileSync(packagePath, "utf8");
    expect(packageSource).toContain(`Coverage publication: ${secondPublicationCommit}`);
    expect(packageSource).toContain(`V2 publication integration delta ${firstPublicationCommit}`);
    expect(packageSource).toContain(`V2 publication integration delta ${secondPublicationCommit}`);
    expect(packageSource).toContain("### Attempt 1");
    expect(packageSource).toContain("### Attempt 2");
    expect(packageSource).toContain("export const reviewed = true;");
    expect(runCommand("git", ["verify-commit", firstPublicationCommit], f.root).status).toBe(0);
    expect(runCommand("git", ["verify-commit", secondPublicationCommit], f.root).status).toBe(0);
  }, 60000);

  describe("blocked recovery admission", () => {
    let f: ReturnType<typeof fixture>;
    beforeEach(() => {
      f = fixture();
      expect(f.admit().status).toBe(0);
      const lane = f.lanes[0] ?? "";
      write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 1\nstatus: blocked\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 1 — Set count\n\n## Attempt 1 — 2026-10-13\n\n- Outcome: blocked\n`);
      const head = commitAll(lane, "Record legacy blocked task without publishing partial code");
      const publicationCommit = publishLegacyBlocked(f, head);
      expect(runCommand("git", ["verify-commit", publicationCommit], f.root).status).toBe(0);
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
      it("republishes a legacy blocked attempt without rewriting history and keeps the broad v1 fallback", () => {
        const lane = f.lanes[0] ?? "";
        const startHead = git(lane, "rev-parse", "HEAD");
        write(lane, "src/counter.ts", "export const count = 1;\n");
        write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `${source.replace("status: blocked", "status: done").trimEnd()}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${startHead}\n- Outcome: done\n`);
        const workerHead = commitAll(lane, "Retry legacy blocked task");
        const published = publish(f, workerHead);
        expect(published.status, published.stdout + published.stderr).toBe(0);
        expect(f.metadata().tasks[0]?.publication).toMatchObject({ version: 1, taskHead: workerHead, outcome: "done" });
        const taskProgress = Fs.readFileSync(Path.join(f.root, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8");
        expect(taskProgress).toContain("## Attempt 1 — 2026-10-13\n\n- Outcome: blocked");
        expect(taskProgress).not.toMatch(/## Attempt 1 — 2026-10-13[\\s\\S]*?- Start HEAD:/);
        expect(taskProgress).toContain(`- Start HEAD: ${startHead}`);
        const diff = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);
        expect(diff.status, diff.stdout + diff.stderr).toBe(0);
        expect(diff.stdout).toContain(`Base: ${f.initial}`);
      }, 30000);
      it("recovers the original checkpoint after retiring the earlier publication", () => {
        const lane = f.lanes[0] ?? "";
        const result = invoke(lane, "worker-1", "diff", "--record", "--task", "1", "--change-dir", ".kepler/changes/state");
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/.base"), "utf8").trim()).toBe(f.initial);
      });
    });
  });

  it("rejects committed ancestry omitted between a prior terminal attempt and retry Start HEAD", () => {
    const f = fixture();
    expect(f.admit().status).toBe(0);
    const lane = f.lanes[0] ?? "";
    const firstStart = git(lane, "rev-parse", "HEAD");
    write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 1\nstatus: blocked\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 1 — Set count\n\n## Attempt 1 — 2026-10-13\n\n- Start HEAD: ${firstStart}\n- Outcome: blocked\n`);
    const firstTaskHead = commitAll(lane, "Record first blocked attempt");
    publishLegacyBlocked(f, firstTaskHead);
    write(lane, "src/counter.ts", "export const count = 99;\n");
    const omitted = commitAll(lane, "Add unaccounted pre-retry commit");
    const retry = f.admit(1, git(f.root, "rev-parse", "HEAD"), true);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    const startHead = git(lane, "rev-parse", "HEAD");
    const progress = Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8").replace("status: blocked", "status: done").trimEnd();
    write(lane, "src/counter.ts", "export const count = 1;\n");
    write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `${progress}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${startHead}\n- Outcome: done\n`);
    const secondTaskHead = commitAll(lane, "Complete retry attempt");

    const result = publish(f, secondTaskHead);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Attempt start HEAD contains unaccounted pre-attempt work");
    expect(git(lane, "merge-base", "--is-ancestor", omitted, startHead)).toBe("");
  }, 60000);

  it("does not apply legacy feedback to a later v2 publication in mixed history", () => {
    const f = fixture();
    expect(f.admit().status).toBe(0);
    const lane = f.lanes[0] ?? "";
    const firstStart = git(lane, "rev-parse", "HEAD");
    write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `---\nartifact: task-progress\nchange: state\ntask: 1\nstatus: blocked\nupdated: 2026-10-13\ndecision: accepted\n---\n# Task Progress: Task 1 — Set count\n\n## Attempt 1 — 2026-10-13\n\n- Start HEAD: ${firstStart}\n- Outcome: blocked\n`);
    const firstTaskHead = commitAll(lane, "Record blocked v1 task attempt");
    const firstPublicationCommit = publishLegacyBlocked(f, firstTaskHead);
    expect(runCommand("git", ["verify-commit", firstPublicationCommit], f.root).status).toBe(0);
    const retry = f.admit(1, git(f.root, "rev-parse", "HEAD"), true);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    const secondStart = git(lane, "rev-parse", "HEAD");
    write(lane, "src/counter.ts", "export const count = 1;\n");
    const oldProgress = Fs.readFileSync(Path.join(lane, ".kepler/changes/state/tasks/task-1/progress.md"), "utf8").replace("status: blocked", "status: done").trimEnd();
    write(lane, ".kepler/changes/state/tasks/task-1/progress.md", `${oldProgress}\n\n## Attempt 2 — 2026-10-14\n\n- Start HEAD: ${secondStart}\n- Outcome: done\n`);
    const secondTaskHead = commitAll(lane, "Complete v1 task retry");
    const secondPublication = publish(f, secondTaskHead);
    expect(secondPublication.status, secondPublication.stdout + secondPublication.stderr).toBe(0);
    const secondPublicationCommit = /^Publication: ([0-9a-f]{40})$/m.exec(secondPublication.stdout)?.[1];
    const integratedHead = (f.metadata().tasks[0]?.publication as { version?: number; integratedHead?: string } | undefined)?.integratedHead;
    expect(f.metadata().tasks[0]?.publication).toMatchObject({ version: 2 });
    if (!secondPublicationCommit || !integratedHead) throw new Error("v2 publication identity is missing");
    write(f.changeDir, "tasks/task-1/feedback.md", `---\nartifact: feedback\nchange: state\ntask: 1\ncreated: 2026-10-14\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 1 — Set count\n\n## Pass 1 — 2026-10-14\nBase: ${f.initial}\nHead: ${integratedHead}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`);
    commitPaths(f.root, "Append legacy-range feedback", ".kepler/changes/state/tasks/task-1/feedback.md");

    const result = invoke(f.root, "coordinator-fixture", "diff", "--task", "1", "--change-dir", f.changeDir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("v2 publication feedback is missing exact Coverage");
    expect(secondPublicationCommit).not.toBe(firstPublicationCommit);
  }, 60000);

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
  }, 20000);

  it("does not refresh across unexpected material HEAD movement", () => {
    const f = fixture();
    const expected = f.initial;
    write(f.root, "src/counter.ts", "export const count = 9;\n");
    commitAll(f.root, "unrelated source movement");
    const before = f.progressSource();
    const laneHead = git(f.lanes[0] ?? "", "rev-parse", "HEAD");

    const result = f.admit(1, expected);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("non-admission change");
    expect(f.progressSource()).toBe(before);
    expect(git(f.lanes[0] ?? "", "rev-parse", "HEAD")).toBe(laneHead);
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
