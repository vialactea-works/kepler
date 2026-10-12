import { describe, expect, it } from "vitest";
import { inspectVisibleFinishClaims } from "../../packages/cli/src/workbench/finish-claims.js";
import { createPreconditionRuntime } from "../../packages/cli/src/workbench/precondition-runtime.js";

const binding = ".kepler/maps/effort/route.md — unit 1";
const claim = `---\nartifact: plan\nchange: peer\nstatus: approved\ncreated: 2026-10-12\nauthor: Test\ndecision: accepted\nroute_unit: ${binding}\n---\n# Plan: Peer\n`;
const runtime = (ref = "", linked = false, unavailable = false) => createPreconditionRuntime({
  process: { run: (_command, args) => ({ status: unavailable ? 1 : 0, stdout: args[0] === "for-each-ref" ? ref : args[0] === "ls-tree" ? ".kepler/changes/peer/plan.md" : "worktree /linked\0branch refs/heads/main\0\0", stderr: "" }) },
  git: {
    repositoryRoot: () => ({ status: 0, stdout: "/fixture", stderr: "" }), statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
    blobAt: () => ({ status: 0, stdout: claim, stderr: "" }),
  },
  fileSystem: {
    directoryExists: () => linked, pathExists: (path) => path.endsWith("plan.md"), realpath: (path) => path,
    readDirectory: () => ["peer"], readFile: () => claim,
  },
});

describe("visible finish ownership claims", () => {
  it.each(["refs/heads/peer", "refs/remotes/origin/peer"])("holds a competing claim on %s", async (ref) => {
    expect(await inspectVisibleFinishClaims(runtime(ref), "/fixture", "demo", binding)).toContain(`competing visible route claim: ${ref}:.kepler/changes/peer/plan.md`);
  });

  it("holds an uncommitted claim in a linked worktree", async () => {
    expect(await inspectVisibleFinishClaims(runtime("", true), "/fixture", "demo", binding)).toContain("competing visible route claim: /linked/.kepler/changes/peer/plan.md");
  });

  it("does not count this change's surviving copies as peer claims", async () => {
    expect(await inspectVisibleFinishClaims(runtime("refs/heads/main", true), "/fixture", "peer", binding,
      { refs: ["refs/heads/main"], worktrees: ["/linked"] })).toEqual([]);
  });

  it("holds this change's claim when a different visible ref has no admitted ownership", async () => {
    expect(await inspectVisibleFinishClaims(runtime("refs/heads/other"), "/fixture", "peer", binding,
      { refs: ["refs/heads/main"], worktrees: ["/fixture"] })).toContain("competing visible route claim: refs/heads/other:.kepler/changes/peer/plan.md");
  });

  it("holds when visible claim discovery is unavailable", async () => {
    expect(await inspectVisibleFinishClaims(runtime("", false, true), "/fixture", "demo", binding)).toEqual(["visible branch claims cannot be inspected", "visible worktree claims cannot be inspected"]);
  });
});
