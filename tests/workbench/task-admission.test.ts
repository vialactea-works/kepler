import { describe, expect, it } from "vitest";
import { validateTaskAdmission, validateTaskAdmissionHistory } from "../../packages/cli/src/workbench/task-admission.js";
import { validateArtifactMetadataSchema } from "../../packages/cli/src/workbench/artifact-schemas.js";
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js";

const admission = () => ({ version: 1, base: "a".repeat(40), sourceHead: "a".repeat(40), planCommit: "b".repeat(40), planDigest: "c".repeat(64), taskDefinition: "d".repeat(64), worker: "worker-1", lane: "refs/heads/task-1", worktree: "/repo/.lanes/task-1", gitDirectory: "/repo/.git/worktrees/task-1", repository: "/repo", commonDirectory: "/repo/.git", coordinator: "controller-1", source: "refs/heads/fix", target: "refs/heads/main", prerequisites: [{ task: 2, feedbackCommit: "e".repeat(40) }] });

const progress = (task: Record<string, unknown>): RecognizedArtifact => ({ _tag: "recognized", sourcePath: ".kepler/changes/demo/progress.md", metadata: { artifact: "progress", change: "demo", status: "pending", updated: "2026-10-12", decision: "accepted", tasks: [task] }, body: "# Progress: Demo\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: One | pending | [details](tasks/task-1/progress.md) |", locations: { frontmatter: { startLine: 1, endLine: 9 }, metadata: { startLine: 2, endLine: 8 }, body: { startLine: 10, endLine: 13 } } });

describe("task admission", () => {
  it("accepts exact version-one admission provenance", () => {
    expect(validateTaskAdmission(admission())).toMatchObject({ kind: "valid", admission: { version: 1, source: "refs/heads/fix" } });
  });

  it.each([{ version: 2 }, { lane: "main" }, { worker: "worker\n1" }, { worktree: "repo" }, { source: "refs/heads/main" }, { unknown: true }, { prerequisites: [{ task: 1, feedbackCommit: "e".repeat(40) }, { task: 1, feedbackCommit: "f".repeat(40) }] }])("fails closed for malformed admission %j", (patch) => {
    expect(validateTaskAdmission({ ...admission(), ...patch }).kind).toBe("invalid");
  });

  it.each(["refs/heads/foo..bar", "refs/heads/foo//bar", "refs/heads/foo/", "refs/heads/.hidden", "refs/heads/task.lock", "refs/heads/task@{1}"])("rejects an unsafe fully qualified branch %s", (lane) => {
    expect(validateTaskAdmission({ ...admission(), lane }).kind).toBe("invalid");
  });

  it.each(["/repo/../lane", "/repo//lane", "/repo/./lane", "/repo/lane/"])("rejects a noncanonical absolute path %s", (worktree) => {
    expect(validateTaskAdmission({ ...admission(), worktree }).kind).toBe("invalid");
  });

  it("rejects ambiguous actor whitespace and delete controls", () => {
    expect(validateTaskAdmission({ ...admission(), worker: " worker-1 " }).kind).toBe("invalid");
    expect(validateTaskAdmission({ ...admission(), coordinator: "controller\u007f" }).kind).toBe("invalid");
  });

  it("accepts the existing fully qualified remote target convention", () => {
    expect(validateTaskAdmission({ ...admission(), target: "refs/remotes/origin/main" }).kind).toBe("valid");
  });

  it("preserves immutable original admission identity across snapshots", () => {
    const first = admission();
    expect(validateTaskAdmissionHistory([first, { ...first, worker: "worker-2" }])).toMatchObject({ kind: "valid" });
    expect(validateTaskAdmissionHistory([first, { ...first, base: "f".repeat(40) }]).kind).toBe("invalid");
  });

  it("accepts legacy root rows without admission and rejects malformed optional admission", () => {
    expect(validateArtifactMetadataSchema(progress({ id: 1, title: "One", status: "pending", progress: "tasks/task-1/progress.md" }), "progress")).toEqual([]);
    expect(validateArtifactMetadataSchema(progress({ id: 1, title: "One", status: "pending", progress: "tasks/task-1/progress.md", admission: { ...admission(), target: "refs/heads/fix" } }), "progress")).not.toEqual([]);
  });
});
