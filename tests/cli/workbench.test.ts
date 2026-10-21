import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { VERSION } from "../../src/index.js";
import {
  taskBreakdownDigestFromDefinitions,
  taskDefinitionDigest,
} from "../../packages/cli/src/workbench/artifact-body.js";
import { createE2EHarness, type E2EHarness } from "../e2e/harness.js";

let harness: E2EHarness;

const runCli = (cwd: string, ...arguments_: string[]) => {
  const result = harness.cli.run(arguments_, { cwd });
  return {
    status: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const git = (cwd: string, ...arguments_: string[]) => {
  harness.resources.runGit(cwd, ...arguments_);
};

const gitOutput = (cwd: string, ...arguments_: string[]) =>
  harness.resources.runGit(cwd, ...arguments_);

describe("workbench CLI", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    harness = await createE2EHarness({ application: "native" });
    temporaryDirectory = harness.resources.workspaceDirectory;
    Fs.writeFileSync(
      Path.join(temporaryDirectory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2024",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          module: "Node16",
          moduleResolution: "node16",
        },
      }),
    );
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("reports the shared CLI version", () => {
    const result = runCli(temporaryDirectory, "--version");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });

  it("lists every operation in help output", () => {
    const result = runCli(temporaryDirectory, "workbench", "--help");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("isolate");
    expect(result.stdout).toContain("diff");
    expect(result.stdout).toContain("precondition");
    expect(result.stdout).toContain("context");
    expect(result.stdout).toContain("prototype");
    expect(result.stdout).toContain("lint");
  });

  it("rejects an omitted workbench operation", () => {
    const result = runCli(temporaryDirectory, "workbench");

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("requires a subcommand");
    expect(result.stderr.match(/error:/g) ?? []).toHaveLength(1);
  });

  it("rejects malformed workbench parser input before running operations", () => {
    const file = Path.join(temporaryDirectory, "note.md");
    Fs.writeFileSync(file, "# Note\n");

    const results = [
      runCli(temporaryDirectory, "workbench", "unknown-operation"),
      runCli(
        temporaryDirectory,
        "workbench",
        "lint",
        "--file",
        file,
        "--unknown",
      ),
      runCli(temporaryDirectory, "workbench", "lint", "--file"),
    ];

    for (const result of results) {
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr.match(/error:/g) ?? []).toHaveLength(1);
    }
    expect(results[0].stderr).toContain("too many arguments");
    expect(results[1].stderr).toContain("unknown option '--unknown'");
    expect(results[2].stderr).toContain("option '--file <file>' argument missing");
  }, 15_000);

  it("rejects surplus positionals for every command before operations run", () => {
    git(temporaryDirectory, "init", "-q", "-b", "main");
    git(temporaryDirectory, "config", "user.email", "test@example.com");
    git(temporaryDirectory, "config", "user.name", "Test");
    const changeDirectory = Path.join(
      temporaryDirectory,
      ".kepler",
      "changes",
      "sample",
    );
    Fs.mkdirSync(changeDirectory, { recursive: true });
    Fs.writeFileSync(Path.join(changeDirectory, "placeholder"), "content\n");
    const file = Path.join(temporaryDirectory, "note.md");
    Fs.writeFileSync(file, "# Note\n");
    git(temporaryDirectory, "add", ".");
    git(temporaryDirectory, "commit", "-qm", "initial");

    const diffOutput = Path.join(temporaryDirectory, "diff-output");
    const testMarker = Path.join(temporaryDirectory, "test-marker");
    const statefulCalls = [
      ["workbench", "isolate", "new-title", "extra"],
      ["workbench", "prototype", "map", "ticket", "extra"],
    ];
    const malformedCalls = [
      ["workbench", "extra"],
      ["workbench", "diff", "--whole-change", "--target-branch", "refs/remotes/origin/main", "--out", diffOutput, "extra"],
      [
        "workbench",
        "precondition",
        "--change-dir",
        changeDirectory,
        "--test-cmd",
        `touch ${testMarker}`,
        "--target-branch",
        "refs/remotes/origin/main",
        "extra",
      ],
      ["workbench", "lint", "--file", file, "extra"],
      ["workbench", "context", changeDirectory, "extra"],
      ["workbench", "isolate", "--check", "one", "extra"],
      ["workbench", "isolate", "--verify", "main", "one", "extra"],
      ...statefulCalls,
      [
        "workbench",
        "prototype",
        "--standalone",
        "standalone",
        "one",
        "two",
        "extra",
      ],
      ["workbench", "prototype", "--verify", "main", "one", "two", "extra"],
    ];
    const contextDefault = runCli(changeDirectory, "workbench", "context");
    expect(contextDefault.status).not.toBe(2);
    expect(contextDefault.stderr).not.toContain("too many arguments");

    const branchesBefore = gitOutput(temporaryDirectory, "branch", "--list");
    const worktreesBefore = gitOutput(
      temporaryDirectory,
      "worktree",
      "list",
      "--porcelain",
    );

    for (const arguments_ of malformedCalls) {
      const result = runCli(temporaryDirectory, ...arguments_);

      expect(result.status, arguments_.join(" ")).toBe(2);
      expect(result.stdout, arguments_.join(" ")).toBe("");
      expect(result.stderr.match(/error:/g) ?? [], arguments_.join(" ")).toHaveLength(1);
      expect(result.stderr, arguments_.join(" ")).toContain("too many arguments");
    }

    expect(Fs.existsSync(diffOutput)).toBe(false);
    expect(Fs.existsSync(testMarker)).toBe(false);
    expect(gitOutput(temporaryDirectory, "branch", "--list")).toBe(branchesBefore);
    expect(
      gitOutput(temporaryDirectory, "worktree", "list", "--porcelain"),
    ).toBe(worktreesBefore);

    const isolateCreate = runCli(
      temporaryDirectory,
      "workbench",
      "isolate",
      "valid-title",
    );
    expect(isolateCreate.status).toBe(0);
    expect(gitOutput(temporaryDirectory, "branch", "--list")).toContain(
      "valid-title",
    );

    git(temporaryDirectory, "switch", "main");
    const prototypeMapped = runCli(
      temporaryDirectory,
      "workbench",
      "prototype",
      "valid-map",
      "123",
    );
    expect(prototypeMapped.status).toBe(0);
    expect(gitOutput(temporaryDirectory, "branch", "--list")).toContain(
      "valid-map/123",
    );

    git(temporaryDirectory, "switch", "main");
    const prototypeStandalone = runCli(
      temporaryDirectory,
      "workbench",
      "prototype",
      "--standalone",
      "standalone-slug",
    );
    expect(prototypeStandalone.status).toBe(0);
    expect(gitOutput(temporaryDirectory, "branch", "--list")).toContain(
      "standalone-slug",
    );
  }, 60_000);

  it("lints an unrelated file successfully", () => {
    const file = Path.join(temporaryDirectory, "note.md");
    Fs.writeFileSync(file, "# Note\n");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "lint",
      "--file",
      file,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SKIPPED");
    expect(result.stdout.trimEnd()).toMatch(/lint: success$/);
  });

  it("returns findings for a conventional artifact without frontmatter", () => {
    const file = Path.join(temporaryDirectory, "plan.md");
    Fs.writeFileSync(file, "# Plan\n");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "lint",
      "--file",
      file,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("WARNING");
    expect(result.stdout).toContain(file);
    expect(result.stdout.trimEnd()).toMatch(/lint: findings$/);
  });

  it("rejects invalid lint scopes before inspecting files", () => {
    const file = Path.join(temporaryDirectory, "note.md");
    Fs.writeFileSync(file, "# Note\n");

    const missing = runCli(temporaryDirectory, "workbench", "lint");
    const both = runCli(
      temporaryDirectory,
      "workbench",
      "lint",
      "--file",
      file,
      "--change-dir",
      temporaryDirectory,
    );
    const unknown = runCli(
      temporaryDirectory,
      "workbench",
      "lint",
      "--unknown",
    );

    expect(missing.status).toBe(2);
    expect(both.status).toBe(2);
    expect(unknown.status).toBe(2);
  }, 15_000);

  it("preserves isolate negative checks", () => {
    git(temporaryDirectory, "init", "-q", "-b", "main");
    git(temporaryDirectory, "config", "user.email", "test@example.com");
    git(temporaryDirectory, "config", "user.name", "Test");
    Fs.writeFileSync(Path.join(temporaryDirectory, "file.txt"), "content\n");
    git(temporaryDirectory, "add", "file.txt");
    git(temporaryDirectory, "commit", "-qm", "initial");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "isolate",
      "--check",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.trimEnd()).toMatch(/isolated: no \(.+\)$/);
    expect(result.stderr).toBe("");
  });

  it("reports isolate errors on stderr outside a git repository", () => {
    const result = runCli(
      temporaryDirectory,
      "workbench",
      "isolate",
      "--check",
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: not inside a git repository");
    expect(result.stderr.match(/error:/g)).toHaveLength(1);
  });

  it("preserves prototype verification failures", () => {
    git(temporaryDirectory, "init", "-q", "-b", "main");
    git(temporaryDirectory, "config", "user.email", "test@example.com");
    git(temporaryDirectory, "config", "user.name", "Test");
    Fs.writeFileSync(Path.join(temporaryDirectory, "file.txt"), "content\n");
    git(temporaryDirectory, "add", "file.txt");
    git(temporaryDirectory, "commit", "-qm", "initial");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "prototype",
      "--verify",
      "prototype/expected",
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not on prototype/expected");
  });

  it("packages a whole-change diff", () => {
    git(temporaryDirectory, "init", "-q", "-b", "main");
    git(temporaryDirectory, "config", "user.email", "test@example.com");
    git(temporaryDirectory, "config", "user.name", "Test");
    Fs.writeFileSync(Path.join(temporaryDirectory, "file.txt"), "initial\n");
    git(temporaryDirectory, "add", "file.txt");
    git(temporaryDirectory, "commit", "-qm", "initial");
    git(temporaryDirectory, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(temporaryDirectory, "switch", "-c", "feature");
    Fs.writeFileSync(Path.join(temporaryDirectory, "file.txt"), "changed\n");
    git(temporaryDirectory, "commit", "-am", "change");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "diff",
      "--whole-change",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("range:");
    expect(result.stdout.trimEnd()).toMatch(
      /\/kepler-diff-whole-change-[^\n]+\/package\.diff$/,
    );
  });

  it("runs precondition gates and reports a closed gate", () => {
    git(temporaryDirectory, "init", "-q", "-b", "main");
    git(temporaryDirectory, "config", "user.email", "test@example.com");
    git(temporaryDirectory, "config", "user.name", "Test");
    const changeDirectory = Path.join(
      temporaryDirectory,
      ".kepler",
      "changes",
      "sample",
    );
    Fs.mkdirSync(changeDirectory, { recursive: true });
    Fs.writeFileSync(Path.join(changeDirectory, "placeholder"), "content\n");
    git(temporaryDirectory, "add", ".");
    git(temporaryDirectory, "commit", "-qm", "initial");
    git(temporaryDirectory, "update-ref", "refs/remotes/origin/main", "HEAD");

    const result = runCli(
      temporaryDirectory,
      "workbench",
      "precondition",
      "--change-dir",
      changeDirectory,
      "--test-cmd",
      "true",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.trimEnd()).toMatch(/gate: closed \(.+\)$/);
  });

  it("reports failed operations without helper scripts", () => {
    const result = runCli(
      temporaryDirectory,
      "workbench",
      "context",
      Path.join(temporaryDirectory, "missing"),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("change dir does not exist");
  });

  it("uses the physical latest feedback and review pass across consumers", () => {
    const repositoryDirectory = Fs.realpathSync(temporaryDirectory);
    const changeDirectory = Path.join(
      repositoryDirectory,
      ".kepler",
      "changes",
      "sample",
    );
    const taskDirectory = Path.join(
      changeDirectory,
      "tasks",
      "task-1",
    );
    const write = (relativePath: string, contents: string) => {
      Fs.mkdirSync(Path.dirname(Path.join(repositoryDirectory, relativePath)), {
        recursive: true,
      });
      Fs.writeFileSync(Path.join(repositoryDirectory, relativePath), contents);
    };
    const lines = (...items: string[]) => items.join("\n");

    git(repositoryDirectory, "init", "-q", "-b", "main");
    git(repositoryDirectory, "config", "user.email", "test@example.com");
    git(repositoryDirectory, "config", "user.name", "Test");
    write("seed", "seed\n");
    git(repositoryDirectory, "add", ".");
    git(repositoryDirectory, "commit", "-qm", "initial");
    git(repositoryDirectory, "update-ref", "refs/remotes/origin/main", "HEAD");
    const base = gitOutput(repositoryDirectory, "rev-parse", "HEAD");
    const seedBlob = gitOutput(repositoryDirectory, "rev-parse", "HEAD:seed");
    git(repositoryDirectory, "switch", "-c", "feature");

    const taskDefinition = lines(
      "### Task 1: Example",
      "",
      "- Depends on: none",
      "- Files:",
      "  - Created: none",
      "  - Modified: src/example.ts",
      "  - Deleted: none",
      "- Acceptance:",
      "  - Evidence consumers agree on the latest pass.",
      "- Steps:",
      "  1. Exercise the evidence consumers.",
      "- Verify: true",
      "- Commit: example",
    );
    const inputContext = JSON.stringify({
      version: 1,
      repository: Fs.realpathSync(repositoryDirectory),
      intentCommit: "tactical:latest-pass-fixture",
      taskDefinition: taskDefinitionDigest(taskDefinition),
      inputs: [],
    });
    write(
      ".kepler/changes/sample/plan.md",
      lines(
        "---",
        "artifact: plan",
        "change: sample",
        "author: Test Agent",
        "route_unit: null",
        "created: 2026-09-17",
        "status: complete",
        "decision: accepted",
        "---",
        "",
        "# Plan: sample",
        "",
        "## Overview",
        "",
        "Exercise per-pass evidence consumers.",
        "",
        "## Tasks",
        "",
        "### Task 1: Example",
        "",
        "- Depends on: none",
        "- Files:",
        "  - Created: none",
        "  - Modified: src/example.ts",
        "  - Deleted: none",
        "- Acceptance:",
        "  - Evidence consumers agree on the latest pass.",
        "- Steps:",
        "  1. Exercise the evidence consumers.",
        "- Verify: true",
        "- Commit: example",
        `- Notes: ${inputContext}`,
        "",
        "## Done when",
        "",
        "- The latest valid pass is used and malformed latest evidence closes every gate.",
        "",
      ),
    );
    write(
      ".kepler/changes/sample/progress.md",
      lines(
        "---",
        "artifact: progress",
        "change: sample",
        "status: complete",
        "updated: 2026-09-16",
        "decision: accepted",
        "tasks:",
        "  - id: 1",
        "    title: Example",
        "    status: done",
        "    progress: tasks/task-1/progress.md",
        "---",
        "",
        "# Progress: sample",
        "",
        "| Task | Status | Progress |",
        "| --- | --- | --- |",
        "| Task 1: Example | done | [details](tasks/task-1/progress.md) |",
        "",
      ),
    );
    write(
      ".kepler/changes/sample/tasks/task-1/progress.md",
      lines(
        "---",
        "artifact: task-progress",
        "change: sample",
        "task: 1",
        "status: done",
        "updated: 2026-09-16",
        "decision: accepted",
        "---",
        "",
        "# Task Progress: Task 1 — Example",
        "",
        "## Attempt 1 — 2026-09-16",
        "",
        "- Outcome: done",
        "",
        "Created: none",
        "Modified: src/example.ts",
        "Deleted: none",
        "Verification: `true`",
        "Notes: Initial implementation.",
        "",
      ),
    );
    write("src/example.ts", "export const example = true;\n");
    git(repositoryDirectory, "add", ".");
    git(repositoryDirectory, "commit", "-qm", "implementation");
    const implementationHead = gitOutput(
      repositoryDirectory,
      "rev-parse",
      "HEAD",
    );
    const pass = (number: number, verdict: string) =>
      lines(
        `## Pass ${number} — 2026-09-17`,
        "",
        `Base: ${base}`,
        `Head: ${implementationHead}`,
        `Verdict: ${verdict}`,
        "",
        "### Blocking",
        "",
        verdict === "approved"
          ? ""
          : "- [tests/cli/workbench.test.ts:1] Latest evidence is not consumed consistently (action: align every consumer with the physical latest pass)",
        "",
        "### Suggestions",
        "",
      );
    const fieldlessPass = (number: number, blocking: string) =>
      lines(
        `## Pass ${number} — 2026-09-17`,
        "",
        "### Blocking",
        blocking,
        "",
        "### Suggestions",
        "- None.",
        "",
      );
    const writeReviewEvidence = (body: string, global: boolean) => {
      const globalFields = global
        ? [`base: ${base}`, `head: ${implementationHead}`, "verdict: approved"]
        : [];
      write(
        ".kepler/changes/sample/tasks/task-1/feedback.md",
        lines(
          "---",
          "artifact: feedback",
          "change: sample",
          "task: 1",
          "created: 2026-09-17",
          "status: open",
          "decision: accepted",
          ...globalFields,
          "---",
          "",
          "# Code Feedback: Task 1 — Example",
          "",
          body,
        ),
      );
      git(
        repositoryDirectory,
        "add",
        ".kepler/changes/sample/tasks/task-1/feedback.md",
      );
      git(repositoryDirectory, "commit", "-qm", "legacy feedback evidence");
      write(
        ".kepler/changes/sample/review.md",
        lines(
          "---",
          "artifact: review",
          "change: sample",
          "created: 2026-09-17",
          "status: complete",
          "decision: accepted",
          ...globalFields,
          "---",
          "",
          "# Whole-branch Review: sample",
          "",
          body,
        ),
      );
      git(repositoryDirectory, "add", ".kepler/changes/sample/review.md");
      git(repositoryDirectory, "commit", "-qm", "legacy review evidence");
    };
    write(
      ".kepler/changes/sample/tasks/task-1/feedback.md",
      lines(
        "---",
        "artifact: feedback",
        "change: sample",
        "task: 1",
        "created: 2026-09-17",
        "status: open",
        "decision: accepted",
        "---",
        "",
        "# Code Feedback: Task 1 — Example",
        "",
        pass(1, "changes-requested"),
        pass(2, "approved"),
      ),
    );
    write(
      ".kepler/changes/sample/review.md",
      lines(
        "---",
        "artifact: review",
        "change: sample",
        "created: 2026-09-17",
        "status: complete",
        "decision: accepted",
        "---",
        "",
        "# Whole-branch Review: sample",
        "",
        pass(1, "changes-requested"),
        pass(2, "approved"),
      ),
    );
    git(
      repositoryDirectory,
      "add",
      ".kepler/changes/sample/tasks/task-1/feedback.md",
    );
    git(repositoryDirectory, "commit", "-qm", "feedback evidence");
    git(repositoryDirectory, "add", ".kepler/changes/sample/review.md");
    git(repositoryDirectory, "commit", "-qm", "review evidence");

    const lintValid = runCli(
      repositoryDirectory,
      "workbench",
      "lint",
      "--change-dir",
      changeDirectory,
    );
    const contextValid = runCli(
      repositoryDirectory,
      "workbench",
      "context",
      changeDirectory,
      "--input",
      "seed",
    );
    const preconditionValid = runCli(
      repositoryDirectory,
      "workbench",
      "precondition",
      "--change-dir",
      changeDirectory,
      "--test-cmd",
      "true",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(lintValid.status).toBe(0);
    expect(lintValid.stdout.trimEnd()).toMatch(/lint: success$/);
    expect(contextValid.status).toBe(0);
    expect(contextValid.stdout).toContain(
      "Task 1: done, feedback: approved",
    );
    expect(contextValid.stdout).toContain(
      "whole change: approved",
    );
    const planContractLine = contextValid.stdout
      .split("\n")
      .find((line) => line.startsWith("plan-contract-data: "));
    expect(planContractLine).toBeDefined();
    const planContractData = JSON.parse(
      planContractLine?.slice("plan-contract-data: ".length) ?? "null",
    ) as {
      readonly version: number;
      readonly repository: string | null;
      readonly taskBreakdownDigest: string;
      readonly tasks: readonly {
        readonly id: number;
        readonly taskDefinitionDigest: string;
        readonly recordedInputContext: {
          readonly repository: string;
          readonly intentCommit: string;
          readonly taskDefinition: string;
        } | null;
      }[];
      readonly inputs: readonly {
        readonly path: string;
        readonly requested: boolean;
        readonly recordedBy: readonly { readonly task: number; readonly blob: string }[];
        readonly currentHeadBlob: string | null;
        readonly headAvailable: boolean;
        readonly currentWorktreeBlob: string | null;
        readonly worktreeAvailable: boolean;
      }[];
    };
    const expectedTaskDigest = taskDefinitionDigest(taskDefinition);
    expect(planContractData.version).toBe(1);
    expect(planContractData.repository).toBe(Fs.realpathSync(repositoryDirectory));
    expect(planContractData.tasks).toEqual([
      expect.objectContaining({ id: 1, taskDefinitionDigest: expectedTaskDigest }),
    ]);
    expect(planContractData.taskBreakdownDigest).toBe(
      taskBreakdownDigestFromDefinitions(
        [1],
        [{ id: 1, definitionDigest: expectedTaskDigest }],
      ),
    );
    expect(planContractData.tasks[0]?.recordedInputContext).toEqual(
      expect.objectContaining({ repository: planContractData.repository, intentCommit: "tactical:latest-pass-fixture" }),
    );
    expect(planContractData.inputs).toEqual([
      {
        path: "seed",
        requested: true,
        recordedBy: [],
        currentHeadBlob: seedBlob,
        headAvailable: true,
        currentWorktreeBlob: seedBlob,
        worktreeAvailable: true,
      },
    ]);
    expect(preconditionValid.status).toBe(0);
    expect(preconditionValid.stdout).toContain("[PASS] Clean tree");
    expect(preconditionValid.stdout).not.toContain("feedback malformed");
    expect(preconditionValid.stdout).not.toContain(
      "whole-branch review malformed",
    );

    const historicalBlocker =
      "- [tests/cli/workbench.test.ts:1] Fix the historical evidence (action: align consumers)";
    const legacyBody = lines(
      fieldlessPass(1, historicalBlocker),
      fieldlessPass(2, "- None."),
    );
    writeReviewEvidence(legacyBody, true);

    const lintLegacy = runCli(
      repositoryDirectory,
      "workbench",
      "lint",
      "--change-dir",
      changeDirectory,
    );
    const contextLegacy = runCli(
      repositoryDirectory,
      "workbench",
      "context",
      changeDirectory,
    );
    const preconditionLegacy = runCli(
      repositoryDirectory,
      "workbench",
      "precondition",
      "--change-dir",
      changeDirectory,
      "--test-cmd",
      "true",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(lintLegacy.status).toBe(0);
    expect(lintLegacy.stdout.trimEnd()).toMatch(/lint: success$/);
    expect(contextLegacy.status).toBe(0);
    expect(contextLegacy.stdout).toContain("feedback: approved");
    expect(contextLegacy.stdout).toContain("whole change: approved");
    expect(preconditionLegacy.status).toBe(0);
    expect(preconditionLegacy.stdout).toContain("[PASS] Reviews");
    expect(preconditionLegacy.stdout).toContain("gate: open");

    const migratedBody = lines(
      fieldlessPass(1, historicalBlocker),
      pass(2, "approved"),
    );
    writeReviewEvidence(migratedBody, false);

    const lintMigrated = runCli(
      repositoryDirectory,
      "workbench",
      "lint",
      "--change-dir",
      changeDirectory,
    );
    const contextMigrated = runCli(
      repositoryDirectory,
      "workbench",
      "context",
      changeDirectory,
    );
    const preconditionMigrated = runCli(
      repositoryDirectory,
      "workbench",
      "precondition",
      "--change-dir",
      changeDirectory,
      "--test-cmd",
      "true",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(lintMigrated.status).toBe(0);
    expect(lintMigrated.stdout.trimEnd()).toMatch(/lint: success$/);
    expect(contextMigrated.status).toBe(0);
    expect(contextMigrated.stdout).toContain("feedback: approved");
    expect(contextMigrated.stdout).toContain("whole change: approved");
    expect(preconditionMigrated.status).toBe(0);
    expect(preconditionMigrated.stdout).toContain("[PASS] Reviews");
    expect(preconditionMigrated.stdout).toContain("gate: open");

    const malformedPass = lines(
      "",
      "## Pass 3 — 2026-09-17",
      "",
      `Base: ${base}`,
      `Head: ${implementationHead}`,
      "",
    );
    Fs.appendFileSync(Path.join(taskDirectory, "feedback.md"), malformedPass);
    Fs.appendFileSync(Path.join(changeDirectory, "review.md"), malformedPass);
    git(repositoryDirectory, "add", ".");
    git(repositoryDirectory, "commit", "-qm", "malformed latest evidence");

    const lintMalformed = runCli(
      repositoryDirectory,
      "workbench",
      "lint",
      "--change-dir",
      changeDirectory,
    );
    const contextMalformed = runCli(
      repositoryDirectory,
      "workbench",
      "context",
      changeDirectory,
    );
    const preconditionMalformed = runCli(
      repositoryDirectory,
      "workbench",
      "precondition",
      "--change-dir",
      changeDirectory,
      "--test-cmd",
      "true",
      "--target-branch",
      "refs/remotes/origin/main",
    );

    expect(lintMalformed.status).toBe(1);
    expect(lintMalformed.stdout).toContain("review.md");
    expect(lintMalformed.stdout).toContain("feedback.md");
    expect(lintMalformed.stdout).toContain(
      "Pass must declare exactly one Verdict field before child sections",
    );
    expect(lintMalformed.stdout.trimEnd()).toMatch(/lint: findings$/);
    expect(contextMalformed.status).toBe(0);
    expect(contextMalformed.stdout).toContain("format: invalid");
    expect(contextMalformed.stdout).not.toContain(
      "Task 1: done, feedback: approved",
    );
    expect(contextMalformed.stdout).not.toContain(
      "whole change: approved",
    );
    expect(preconditionMalformed.status).toBe(1);
    expect(preconditionMalformed.stdout).toContain("feedback malformed");
    expect(preconditionMalformed.stdout).toContain(
      "whole-branch review malformed",
    );
  }, 60_000);
});
