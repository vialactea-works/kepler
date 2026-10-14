import { describe, expect, it } from "vitest";
import { inspectFinishRoute } from "../../packages/cli/src/workbench/finish-route.js";
import type { FinishRecordProjection, FinishRemainingEffect } from "../../packages/cli/src/workbench/artifact-types.js";
import { createPreconditionRuntime } from "../../packages/cli/src/workbench/precondition-runtime.js";

const sha = "a".repeat(40);
const routePath = ".kepler/maps/effort/route.md";
const mapPath = ".kepler/maps/effort/map.md";
const history = { kind: "history", path: ".kepler/changes/demo/finish.md" } as const;
const routeEffect = { kind: "route", path: routePath } as const;
const mapEffect = { kind: "map", path: mapPath } as const;
const route = (own: string, peer: string, qualification = "merge") => [
  "---", "artifact: route", "effort: effort", "status: shipping", "created: 2026-10-12", "updated: 2026-10-12", "decision: accepted",
  "units:", "  - id: 1", "    name: First", `    status: ${own}`, "    depends_on: []", "    backed_by: []",
  "  - id: 2", "    name: Second", `    status: ${peer}`, "    depends_on: []", "    backed_by: []", "---",
  "# Route — Effort", "## Point of departure", "## Destination", "## Path chosen", "## Shipping rules", qualification ? `- Qualification: ${qualification}` : "", "Merge into main.",
  "## Units", "### 1. First", "### 2. Second",
].join("\n");
const map = (status = "shipping") => [
  "---", "artifact: map", "effort: effort", `status: ${status}`, "branch: change", "created: 2026-10-12", "updated: 2026-10-12", "decision: accepted", "---",
  "# Effort", "## Destination", "## Notes", "## Operation rules", "## Decisions so far", "## Not yet specified", "## Out of scope",
].join("\n");
const plan = [
  "---", "artifact: plan", "change: demo", "status: approved", "created: 2026-10-12", "author: Test", "decision: accepted",
  `route_unit: ${routePath} — unit 1`, "---", "# Plan: Demo", "## Overview", "## Tasks", "### Task 1: Implement", "## Done when",
].join("\n");
const original: FinishRecordProjection = {
  number: 1, strategy: "local-merge",
  admission: { verifiedHead: sha, targetRef: "refs/heads/main", targetCommit: sha, reviewBase: sha, reviewHead: sha, reviewCommit: sha, materialWaiver: null, inputs: [] },
  source: { repository: "/fixture/.git", root: "/fixture", sourceRef: "refs/heads/change", worktree: "/fixture/.git" },
  route: { path: routePath, mapPath, unit: 1, sourceBlob: sha, previousStatus: "in-progress", shipping: "merge", owner: "controller", change: "demo", sourceRef: "refs/heads/change", targetRef: "refs/heads/main", baseCommit: sha },
};
const inspect = (own: string, peer: string, oldPeer: string, remaining: readonly FinishRemainingEffect[], mapStatus = "shipping", qualification = "merge", durable = true) => {
  const old = new Map([[routePath, route("in-progress", oldPeer, qualification)], [mapPath, map()], [".kepler/changes/demo/plan.md", plan]]);
  const current = new Map([[routePath, route(own, peer, qualification)], [mapPath, map(mapStatus)]]);
  const runtime = createPreconditionRuntime({
    fileSystem: {
      pathExists: (path) => current.has(path.replace("/fixture/", "")), directoryExists: () => true, realpath: (path) => path,
      readDirectory: () => ["demo"], readFile: (path) => current.get(path.replace("/fixture/", ""))!,
    },
    process: { run: (_command, args) => ({ status: 0, stdout: args[0] === "hash-object" && !durable ? "b".repeat(40) : args[0] === "for-each-ref" ? "refs/heads/change" : args[0] === "ls-tree" ? "" : args[0] === "worktree" ? "worktree /fixture\0\0" : sha, stderr: "" }) },
    git: {
      repositoryRoot: () => ({ status: 0, stdout: "/fixture", stderr: "" }), statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
      blobAt: (_root, _commit, path) => ({ status: old.has(path) ? 0 : 128, stdout: old.get(path) ?? "", stderr: "" }),
      resolveCommit: () => ({ status: 0, stdout: sha, stderr: "" }), isAncestor: () => ({ status: 0, stdout: "", stderr: "" }),
    },
  });
  return inspectFinishRoute(runtime, "/fixture", "/fixture/.kepler/changes/demo", original, remaining);
};

describe("exact route finalization effects", () => {
  it.each(["", "no-op", "merge\n- Qualification: merge"])("holds a missing, conflicting or duplicate historical qualification: %s", async (qualification) => {
    const result = await inspect("in-progress", "pending", "pending", [routeEffect, history], "shipping", qualification);
    expect(result.problems).toContain("historical Shipping rules do not establish the recorded qualification; owner adjudication required");
  });

  it("retains the remaining named effect without changing a sibling", async () => {
    const result = await inspect("in-progress", "pending", "pending", [routeEffect, history]);
    expect(result.problems).toEqual([]);
    expect(result.completed).toEqual([]);
  });

  it("refuses current route bytes that do not match the committed artifact", async () => {
    const result = await inspect("shipped", "pending", "pending", [routeEffect, history], "shipping", "merge", false);
    expect(result.problems).toContain("route original/current evidence is invalid or missing");
    expect(result.completed).toEqual([]);
  });

  it("observes a persisted named advancement as completed", async () => {
    const result = await inspect("shipped", "pending", "pending", [routeEffect, history]);
    expect(result.problems).toEqual([]);
    expect(result.completed).toEqual([routeEffect]);
  });

  it("refuses an unverified peer transition", async () => {
    const result = await inspect("shipped", "shipped", "pending", [routeEffect, mapEffect, history], "shipped");
    expect(result.problems).toContain("peer route unit state or structure changed after admission; owner adjudication required");
  });

  it("refuses omission of an outstanding named route effect", async () => {
    const result = await inspect("in-progress", "pending", "pending", [history]);
    expect(result.problems).toContain("remaining effects omit the unverified named route advancement");
  });

  it("requires the map effect when the last unit ships", async () => {
    const result = await inspect("shipped", "shipped", "shipped", [routeEffect, history]);
    expect(result.problems).toContain("remaining effects omit the required aggregate map advancement");
  });

  it("observes a completed route and map without widening the boundary", async () => {
    const result = await inspect("shipped", "shipped", "shipped", [routeEffect, mapEffect, history], "shipped");
    expect(result.problems).toEqual([]);
    expect(result.completed).toEqual([routeEffect, mapEffect]);
  });
});
