import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { spawnSync } from "node:child_process";
import { inspectScopeExpansionHistory } from "../../packages/cli/src/workbench/scope-expansion-history.js";
import { resolveTaskCheckpoint } from "../../packages/cli/src/workbench/task-checkpoint.js";
import type { ScopeExpansion, ScopeExpansionHistoryGit } from "../../packages/cli/src/workbench/scope-expansions.js";

const sourcePath = ".kepler/changes/demo/tasks/task-1/progress.md";
const environment: NodeJS.ProcessEnv = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_SYSTEM: "/dev/null",
  HOME: Os.tmpdir(),
  PATH: process.env.PATH ?? "",
};
let temporary: string;
let key: string;
let sequence = 0;
const run = (root: string, args: readonly string[]) => {
  const result = spawnSync("git", [...args], { cwd: root, env: environment, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};
const checked = (root: string, args: readonly string[]) => {
  const result = run(root, args);
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const reservation = (id = "expansion-1", path = "tooling/test-file.ts"): ScopeExpansion => ({
  id, attempt: 1, prerequisite: "Repair the verification harness", necessity: "The prescribed check cannot run",
  evidence: "Missing test-file selector", paths: [path], verify: "bun tooling/verify.ts",
});
const blocked = "\n## Attempt 1 — 2026-10-12\n\n### Red\n\nThe prescribed check cannot load its test file.\n\n### Green\n\nNot reached.\n\n### Refactor\n\nNot reached.\n\n### Verification\n\nThe observed blocker remains.\n\n- Outcome: blocked\n";
const fixture = async (sourcePredatesTask = false) => {
  const root = Path.join(temporary, `repo-${sequence++}`);
  await Fs.mkdir(Path.join(root, Path.dirname(sourcePath)), { recursive: true });
  await Fs.mkdir(Path.join(root, "tooling"));
  await Fs.mkdir(Path.join(root, "src"));
  checked(root, ["init", "-b", "task-1"]);
  checked(root, ["config", "user.name", "Fixture"]);
  checked(root, ["config", "user.email", "fixture@example.test"]);
  checked(root, ["config", "gpg.format", "ssh"]);
  checked(root, ["config", "commit.gpgsign", "true"]);
  checked(root, ["config", "user.signingkey", key]);
  const write = async (entries: readonly ScopeExpansion[], body = "") => Fs.writeFile(Path.join(root, sourcePath), `---\nartifact: task-progress\nchange: demo\ntask: 1\nstatus: ${body === "" ? "pending" : "blocked"}\nupdated: 2026-10-12\ndecision: accepted\nscope_expansions: ${JSON.stringify(entries)}\n---\n\n# Task Progress: Task 1 — Implement\n${body}`);
  const commit = (message: string) => {
    checked(root, ["add", "--all"]);
    checked(root, ["commit", "-m", message]);
    return checked(root, ["rev-parse", "HEAD"]);
  };
  await Fs.writeFile(Path.join(root, "tooling/test-file.ts"), "export const testFile = 'missing';\n");
  await Fs.writeFile(Path.join(root, "src/display.ts"), "export const display = 'old';\n");
  if (sourcePredatesTask) commit("Existing repository files before task Base");
  await write([]);
  const base = commit("Initialize task fixture");
  const git: ScopeExpansionHistoryGit = {
    pathHistory: (_root, path) => run(root, ["log", "--full-history", "--format=%H", "HEAD", "--", path]),
    blobAt: (_root, revision, path) => run(root, ["show", `${revision}:${path}`]),
    firstParent: (_root, revision) => run(root, ["rev-parse", `${revision}^1`]),
    resolveCommit: (_root, revision) => run(root, ["rev-parse", "--verify", `${revision}^{commit}`]),
    isAncestor: (_root, parent, head) => run(root, ["merge-base", "--is-ancestor", parent, head]),
    changedPaths: (_root, revision) => run(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-m", "-z", revision]),
    pathChanges: (_root, parent, head, paths) => run(root, ["log", "--full-history", "--format=%H", `${parent}..${head}`, "--", ...paths]),
  };
  const inspect = (entries?: readonly ScopeExpansion[], originalBase?: string) => inspectScopeExpansionHistory(git, root, sourcePath, 1, "demo", checked(root, ["rev-parse", "HEAD"]), entries, originalBase);
  return { root, git, base, write, commit, inspect };
};

beforeAll(async () => {
  temporary = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-scope-history-"));
  key = Path.join(temporary, "signing-key");
  const result = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key], { encoding: "utf8", env: environment });
  if (result.status !== 0) throw new Error(result.stderr);
});
afterAll(async () => { if (temporary) await Fs.rm(temporary, { recursive: true, force: true }); });

describe("real Git reservation history", () => {
  it("accepts a preceding committed reservation and subsequent production", async () => {
    const f = await fixture();
    await f.write([reservation()]);
    const reserved = f.commit("Reserve prerequisite before production");
    await Fs.writeFile(Path.join(f.root, "tooling/test-file.ts"), "export const testFile = 'correct';\n");
    f.commit("Repair prescribed check");
    await f.write([reservation()], blocked);
    f.commit("Record terminal attempt without refund");
    expect(await f.inspect([reservation()])).toMatchObject({ kind: "valid", reservationCommits: [reserved] });
  });

  it("accepts committed owner reservations that precede an admission Base", async () => {
    const f = await fixture();
    const first = reservation("pre-admission-1", "tooling/first.ts");
    const second = { ...reservation("pre-admission-2", "tooling/second.ts"), attempt: 1 };
    await f.write([first]);
    f.commit("Reserve first owner prerequisite");
    await f.write([first, second]);
    const admissionBase = f.commit("Reserve second owner prerequisite");
    expect(await f.inspect([first, second], admissionBase)).toMatchObject({ kind: "valid" });
  });

  it("excludes existing-file ancestors before Base from the reservation range", async () => {
    const f = await fixture(true);
    const existed = run(f.root, ["cat-file", "-e", `${f.base}:tooling/test-file.ts`]);
    expect(existed.status).toBe(0);
    await f.write([reservation()]);
    const reserved = f.commit("Reserve an unchanged pre-existing file");
    const changes = await f.git.pathChanges(f.root, f.base, reserved, reservation().paths);
    expect(changes.status).toBe(0);
    expect(changes.stdout).toBe("");
    expect(await f.inspect([reservation()])).toMatchObject({ kind: "valid", reservationCommits: [reserved] });
  });

  it.each(["erase", "rewrite", "reorder"])("rejects reservation %s across committed history", async (mutation) => {
    const f = await fixture();
    const first = reservation();
    const second = reservation("expansion-2", "tooling/other.ts");
    await f.write([first, second]);
    f.commit("Reserve two abandoned prerequisites");
    await f.write(mutation === "erase" ? [] : mutation === "rewrite" ? [{ ...first, evidence: "Replacement" }, second] : [second, first]);
    f.commit("Invalid reservation mutation");
    expect(await f.inspect()).toMatchObject({ kind: "unverified" });
    expect(await resolveTaskCheckpoint(f.git, f.root, sourcePath, 1, "demo", checked(f.root, ["rev-parse", "HEAD"]))).toMatchObject({ kind: "unverified" });
  });

  it.each(["same-commit", "earlier", "earlier-reverted"])("rejects %s production before reservation", async (order) => {
    const f = await fixture();
    await Fs.writeFile(Path.join(f.root, "tooling/test-file.ts"), "export const testFile = 'correct';\n");
    if (order !== "same-commit") f.commit("Production before reservation");
    if (order === "earlier-reverted") {
      await Fs.writeFile(Path.join(f.root, "tooling/test-file.ts"), "export const testFile = 'missing';\n");
      f.commit("Revert production without erasing history");
    }
    await f.write([reservation()]);
    f.commit("Invalid post-production reservation");
    expect(await f.inspect()).toMatchObject({ kind: "unverified" });
  });

  it("holds uncommitted reservations and does not manufacture an attempt", async () => {
    const f = await fixture();
    await f.write([reservation()]);
    expect(await f.inspect([reservation()])).toMatchObject({ kind: "unverified" });
    f.commit("Commit reservation only");
    expect(await resolveTaskCheckpoint(f.git, f.root, sourcePath, 1, "demo", checked(f.root, ["rev-parse", "HEAD"]))).toEqual({ kind: "not-started" });
  });

  it("rejects a reservation inserted into a previously terminal attempt", async () => {
    const f = await fixture();
    await f.write([], blocked);
    f.commit("Terminal attempt before reservation");
    await f.write([reservation()], blocked);
    f.commit("Invalid retroactive reservation");
    expect(await f.inspect()).toMatchObject({ kind: "unverified" });
  });

  it("preserves terminal evidence while a correction consumes a second reservation", async () => {
    const f = await fixture();
    await f.write([reservation()]);
    f.commit("Reserve first prerequisite");
    await f.write([reservation()], blocked);
    f.commit("Abandon first attempt without refund");
    const second = { ...reservation("expansion-2", "tooling/other.ts"), attempt: 2 };
    await f.write([reservation(), second], blocked);
    f.commit("Reserve second prerequisite for correction");
    expect(await f.inspect()).toMatchObject({ kind: "valid" });
    await f.write([reservation(), second], blocked.replace("The observed blocker remains.", "Altered historical evidence."));
    f.commit("Invalid historical attempt rewrite");
    expect(await f.inspect()).toMatchObject({ kind: "unverified" });
  });

  it("permits goal-serving unlisted paths without a scope reservation", async () => {
    const f = await fixture();
    await Fs.writeFile(Path.join(f.root, "src/display.ts"), "export const display = 'goal-serving';\n");
    f.commit("Update goal-serving caller omitted from Files guidance");
    expect(await f.inspect()).toMatchObject({ kind: "valid", entries: [], reservationCommits: [] });
  });
});
