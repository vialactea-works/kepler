import { describe, expect, it } from "vitest";
import { taskDefinitionDigest } from "../../packages/cli/src/workbench/artifact-body.js";
import { legacyCompletedDefinitionProblems } from "../../packages/cli/src/workbench/legacy-input-confirmation.js";
import type { TaskCheckpointGit } from "../../packages/cli/src/workbench/task-checkpoint.js";

const pending = "1".repeat(40);
const done = "2".repeat(40);
const current = "3".repeat(40);
const planPath = ".kepler/changes/frozen/plan.md";
const taskPath = ".kepler/changes/frozen/tasks/task-1/progress.md";
const initialDefinition = "### Task 1: Implement\n\n- Depends on: none";
const amendedDefinition = `${initialDefinition}\n- Files: src/main.ts`;
const result = (stdout = "", status = 0) => ({ stdout, stderr: "", status });
const plan = (definition: string) => `---\nartifact: plan\nchange: frozen\nstatus: approved\ncreated: 2026-09-12\nauthor: Fixture\ndecision: accepted\nroute_unit: null\n---\n# Plan: Frozen\n\n## Overview\n\n## Tasks\n\n${definition}\n\n## Done when\n\nIt works.\n`;
const progress = (status: "pending" | "done" | "blocked", duplicateOutcome = false) => `---\nartifact: task-progress\nchange: frozen\ntask: 1\nstatus: ${status}\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Implement\n${status !== "pending" ? `\n## Attempt 1 — 2026-09-12\n\n- Implemented: Fixture.\n- Outcome: done\n${duplicateOutcome ? "- Outcome: done\n" : ""}` : ""}`;
const git = (duplicateOutcome = false): TaskCheckpointGit => ({
  pathHistory: (_, path) => result(path === taskPath ? `${done}\n${pending}\n` : `${current}\n${done}\n${pending}\n`),
  blobAt: (_, commit, path) => result(path === taskPath ? progress(commit === pending ? "pending" : "done", duplicateOutcome) : plan(commit === pending ? initialDefinition : amendedDefinition)),
  firstParent: () => result(pending),
  resolveCommit: (_, commit) => result(commit),
  isAncestor: (_, base, head) => result("", base === done && head === pending ? 1 : 0),
});

describe("legacy historical completed-definition scope", () => {
  it("allows an unfinished definition amendment before the first completed snapshot", async () => {
    expect(await legacyCompletedDefinitionProblems(git(), "/fixture", taskPath, planPath, "frozen", 1, taskDefinitionDigest(amendedDefinition))).toEqual([]);
  });

  it("uses historical structural validation without imposing current Outcome uniqueness retroactively", async () => {
    expect(await legacyCompletedDefinitionProblems(git(true), "/fixture", taskPath, planPath, "frozen", 1, taskDefinitionDigest(amendedDefinition))).toEqual([]);
  });

  it("retains a known completed Attempt even when the historical status field says blocked", async () => {
    const port = git();
    const blocked: TaskCheckpointGit = { ...port, blobAt: (root, commit, path) => path === taskPath && commit === done ? result(progress("blocked")) : port.blobAt(root, commit, path) };
    expect(await legacyCompletedDefinitionProblems(blocked, "/fixture", taskPath, planPath, "frozen", 1, taskDefinitionDigest(initialDefinition)))
      .toEqual(["historical completed task definition changed"]);
  });

  it("holds unavailable post-completion plan history instead of treating it as absent", async () => {
    const port = git();
    const unavailable: TaskCheckpointGit = { ...port, pathHistory: (root, path) => path === planPath ? result("", 128) : port.pathHistory(root, path) };
    expect(await legacyCompletedDefinitionProblems(unavailable, "/fixture", taskPath, planPath, "frozen", 1, taskDefinitionDigest(amendedDefinition)))
      .toEqual(["historical completed task definition is unverified: plan history is unavailable"]);
  });
});
