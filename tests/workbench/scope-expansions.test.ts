import { describe, expect, it } from "vitest";
import { validateArtifactMetadataSchema } from "../../packages/cli/src/workbench/artifact-contracts.js";
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js";
import { validateScopeExpansionHistory, validateScopeExpansions, type ScopeExpansionHistoryGit } from "../../packages/cli/src/workbench/scope-expansions.js";

const first = "a".repeat(40);
const reserved = "b".repeat(40);
const produced = "c".repeat(40);
const completed = "d".repeat(40);
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
const git = (): ScopeExpansionHistoryGit => ({
  pathHistory: () => ok([completed, reserved, first].join("\n")),
  blobAt: () => ok(""),
  firstParent: (_root, commit) => ok(({ [reserved]: first, [produced]: reserved, [completed]: produced })[commit] ?? ""),
  resolveCommit: (_root, commit) => ok(commit),
  isAncestor: () => ok(),
  changedPaths: (_root, commit) => ok(commit === produced ? "tooling/test-file.ts\0" : ".kepler/changes/demo/tasks/task-1/progress.md\0"),
  pathChanges: () => ok(),
});

const expansion = (id = "expansion-1") => ({
  id,
  attempt: 1,
  prerequisite: "Repair the existing verification harness",
  necessity: "The prescribed behavioral check cannot execute",
  evidence: "The harness selects a nonexistent test file",
  paths: ["tooling/test-file.ts"],
  verify: "bun tooling/verify.ts",
});

const diagnostics = (scope: unknown) => validateArtifactMetadataSchema({
  _tag: "recognized",
  sourcePath: ".kepler/changes/demo/tasks/task-1/progress.md",
  metadata: {
    artifact: "task-progress",
    change: "demo",
    task: 1,
    status: "pending",
    updated: "2026-10-12",
    decision: "accepted",
    scope_expansions: scope,
  },
  body: "# Task Progress: Task 1 — Implement",
  locations: {
    frontmatter: { startLine: 1, endLine: 8 },
    metadata: { startLine: 2, endLine: 7 },
    body: { startLine: 9, endLine: 9 },
  },
} satisfies RecognizedArtifact, "task-progress");

describe("committed reservation chronology", () => {
  it("accepts Git's status-only ancestry proof before production", async () => {
    expect(await validateScopeExpansionHistory(git(), "/repo", [
      { commit: first, entries: [] },
      { commit: reserved, entries: [expansion()] },
    ])).toMatchObject({ kind: "valid" });
  });

  it("accepts production after a reservation without charging or blocking it again", async () => {
    expect(await validateScopeExpansionHistory(git(), "/repo", [
      { commit: first, entries: [] },
      { commit: reserved, entries: [expansion()] },
      { commit: completed, entries: [expansion()] },
    ])).toMatchObject({ kind: "valid", reservationCommits: [reserved] });
  });

  it("rejects a NUL-delimited same-commit production edit", async () => {
    const port = { ...git(), changedPaths: () => ok("tooling/test-file.ts\0") };
    expect(await validateScopeExpansionHistory(port, "/repo", [
      { commit: first, entries: [] },
      { commit: reserved, entries: [expansion()] },
    ])).toMatchObject({ kind: "unverified" });
  });

  it.each(["src/{one,two}.ts", "src/\nfile.ts", "C:/outside.ts", " src/file.ts"])("rejects ambiguous path %j", (path) => {
    expect(validateScopeExpansions([{ ...expansion(), paths: [path] }])).toMatchObject({ kind: "invalid" });
  });
});

describe("lifetime prerequisite reservation contract", () => {
  it("accepts two complete reservations and no reservations", () => {
    expect(diagnostics([])).toEqual([]);
    expect(diagnostics([expansion(), expansion("expansion-2")])).toEqual([]);
  });

  it("rejects a third lifetime reservation", () => {
    expect(diagnostics([expansion(), expansion("expansion-2"), expansion("expansion-3")])).not.toEqual([]);
  });

  it.each(["id", "attempt", "prerequisite", "necessity", "evidence", "paths", "verify"])("requires explicit %s", (field) => {
    const incomplete: Record<string, unknown> = expansion();
    delete incomplete[field];
    expect(diagnostics([incomplete])).not.toEqual([]);
  });

  it.each([
    { id: " " },
    { attempt: 0 },
    { attempt: 1.5 },
    { prerequisite: " " },
    { necessity: " " },
    { evidence: " " },
    { verify: " " },
    { paths: [] },
    { paths: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"] },
    { paths: ["a.ts", "a.ts"] },
    { paths: ["../outside.ts"] },
    { paths: ["/absolute.ts"] },
    { paths: ["src/*.ts"] },
    { paths: ["src/"] },
    { paths: ["src\\file.ts"] },
    { paths: [".git/config"] },
    { refunded: true },
  ])("rejects malformed or unsafe reservation %j", (patch) => {
    expect(diagnostics([{ ...expansion(), ...patch }])).not.toEqual([]);
  });

  it("rejects duplicate reservation identities without resetting the allowance", () => {
    expect(diagnostics([expansion(), { ...expansion(), attempt: 2 }])).not.toEqual([]);
  });
});
