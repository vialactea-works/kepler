import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DiffPackageResolvedSource } from "../../packages/cli/src/construction/diff-package-source.js";
import { renderGitDiffPackage } from "../../packages/cli/src/workbench/diff-package.js";
import type { GitDiffPackageComparison } from "../../packages/cli/src/workbench/git-diff-package.js";

const source: DiffPackageResolvedSource = {
  scope: { kind: "unit-review", unitId: "unit-1", implementationAttemptId: "attempt-1" },
  projectRoot: "/workspace/project",
  missionId: "mission-1",
  recordHomeRepositoryId: "repo-home",
  workspaceRepositories: [],
  comparisons: [],
  taskDefinitions: [],
  upstreamVersions: [],
  sourceAttempts: [],
  activityEvidence: [],
  retainedScopes: [],
  integrationHistory: [],
  sourceRecords: [],
};

const binding: DiffPackageResolvedSource["comparisons"][number] = {
  role: "task-activity-output",
  repositoryId: "repo-main",
  base: { repositoryId: "repo-main", commit: "a".repeat(40) },
  target: { repositoryId: "repo-main", commit: "b".repeat(40) },
  sourceEventIds: ["event-1"],
  accepted: null,
};

const comparison = (overrides: Partial<GitDiffPackageComparison> = {}): GitDiffPackageComparison => ({
  binding,
  repositoryRoot: "/workspace/project",
  baseIsAncestor: true,
  files: [{
    path: "src/feature.ts",
    pathBytesBase64: Buffer.from("src/feature.ts").toString("base64"),
    status: "M",
    additions: 2,
    deletions: 1,
    nontext: false,
    oldMode: "100644",
    newMode: "100644",
    oldObjectId: "c".repeat(40),
    newObjectId: "d".repeat(40),
    objectAccess: [],
  }],
  commits: [{
    commit: "b".repeat(40),
    parents: ["a".repeat(40)],
    relation: "comparison-range",
    changedPaths: [{ path: "src/feature.ts", pathBytesBase64: Buffer.from("src/feature.ts").toString("base64") }],
  }],
  patch: "diff --git a/src/feature.ts b/src/feature.ts\n--- a/src/feature.ts\n+++ b/src/feature.ts\n@@ -1 +1,2 @@\n-old\n+new\n+added\n",
  ...overrides,
});

describe("renderGitDiffPackage", () => {
  it("renders repository-qualified paths, statistics, full patch, source context, and a complete fingerprint", () => {
    const rendered = renderGitDiffPackage(source, [comparison()]);
    const fingerprintSection = rendered.content.indexOf("## Complete package-content fingerprint");
    const fingerprintInput = rendered.content.slice(0, fingerprintSection);

    expect(rendered.empty).toBe(false);
    expect(rendered.content).toContain("src/feature.ts");
    expect(rendered.content).toContain(Buffer.from("src/feature.ts").toString("base64"));
    expect(rendered.content).toContain("2 text additions");
    expect(rendered.content).toContain("+added");
    expect(rendered.content).toContain("task-activity-output");
    expect(rendered.content).toContain("This package is derived inspection material.");
    expect(rendered.content).toContain("A current consumer assesses historical and retained inputs under its own contract");
    expect(rendered.fingerprint).toBe(`sha256:${createHash("sha256").update(fingerprintInput, "utf8").digest("hex")}`);
  });

  it("keeps binary object identifiers and access arguments in the package", () => {
    const binary = comparison({
      files: [{
        path: "assets/icon.bin",
        pathBytesBase64: Buffer.from("assets/icon.bin").toString("base64"),
        status: "M",
        additions: null,
        deletions: null,
        nontext: true,
        oldMode: "100644",
        newMode: "100644",
        oldObjectId: "e".repeat(40),
        newObjectId: "f".repeat(40),
        objectAccess: [
          { command: "git", args: ["-C", "/workspace/project", "cat-file", "blob", "e".repeat(40)] },
          { command: "git", args: ["-C", "/workspace/project", "cat-file", "blob", "f".repeat(40)] },
        ],
      }],
      patch: "Binary files a/assets/icon.bin and b/assets/icon.bin differ\n",
    });
    const rendered = renderGitDiffPackage(source, [binary]);

    expect(rendered.content).toContain("assets/icon.bin");
    expect(rendered.content).toContain("\"nontext\": true");
    expect(rendered.content).toContain("cat-file");
    expect(rendered.content).toContain("Binary files a/assets/icon.bin and b/assets/icon.bin differ");
  });

  it("reports empty comparisons and overlapping paths without collapsing their source roles", () => {
    const first = comparison();
    const second = comparison({
      binding: { ...binding, role: "integration-captured-input-to-candidate" },
      files: [{ ...first.files[0]!, status: "M" }],
      commits: [],
    });
    const rendered = renderGitDiffPackage(source, [first, second]);

    expect(rendered.content).toContain("## Overlapping paths");
    expect(rendered.content).toContain("integration-captured-input-to-candidate");
    expect(rendered.content).toContain("task-activity-output");
    expect(rendered.content).toContain("\"comparisons\": [\n      1,\n      2");

    const empty = renderGitDiffPackage(source, [comparison({ files: [], commits: [], patch: "" })]);
    expect(empty.empty).toBe(true);
    expect(empty.content).toContain("Diff is empty: yes");
    expect(empty.content).toContain("This repository-qualified comparison has an empty patch.");
  });

  it("preserves a non-UTF-8 patch as full base64 bytes", () => {
    const rendered = renderGitDiffPackage(source, [comparison({ patch: "", patchBytesBase64: "AAECAw==" })]);
    expect(rendered.content).toContain("complete patch bytes are preserved below as base64");
    expect(rendered.content).toContain("AAECAw==");
  });
});
