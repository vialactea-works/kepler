import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSkill, section } from "./helpers.js";

const roots: string[] = [];
const command = (cwd: string, env: NodeJS.ProcessEnv, binary: string, args: string[]) => {
  const result = spawnSync(binary, args, { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${binary} ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};
const fixture = () => {
  const root = Fs.mkdtempSync(Path.join(Fs.realpathSync(Os.tmpdir()), "kepler-dispatch-"));
  roots.push(root);
  const repository = Path.join(root, "repository");
  const home = Path.join(root, "home");
  Fs.mkdirSync(repository);
  Fs.mkdirSync(home);
  const env: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    HOME: home,
    LC_ALL: "C.UTF-8",
    PATH: process.env.PATH ?? "",
    TMPDIR: Os.tmpdir(),
    TZ: "UTC",
    XDG_CONFIG_HOME: Path.join(home, ".config"),
  };
  const git = (...args: string[]) => command(repository, env, "git", args);
  const key = Path.join(root, "identity");
  command(root, env, "ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "dispatch@example.invalid", "-f", key]);
  const signers = Path.join(root, "allowed_signers");
  Fs.writeFileSync(signers, `dispatch@example.invalid ${Fs.readFileSync(`${key}.pub`, "utf8")}`);
  git("init", "-q", "-b", "fixture-target");
  for (const [name, value] of [["user.name", "Dispatch Fixture"], ["user.email", "dispatch@example.invalid"], ["gpg.format", "ssh"], ["user.signingkey", key], ["gpg.ssh.allowedSignersFile", signers], ["commit.gpgsign", "true"]]) git("config", name, value);
  const commit = (message: string, path: string, content: string) => {
    Fs.writeFileSync(Path.join(repository, path), content);
    git("add", "--", path);
    git("commit", "-q", "-m", message);
    const head = git("rev-parse", "HEAD");
    git("verify-commit", head);
    expect(git("log", "-1", "--format=%G?")).toBe("G");
    return head;
  };
  const head = commit("controlled unchanged plan", "plan.md", "execution order: 1,4,2,3\n");
  git("switch", "-q", "-c", "fixture-work");
  const identity = [head, git("symbolic-ref", "HEAD"), "refs/heads/fixture-target", repository, Fs.realpathSync(git("rev-parse", "--absolute-git-dir")), "controlled-original-session", "controlled-original-session"];
  return { root, repository, env, git, commit, identity };
};
const snapshot = (root: string): Record<string, string> => {
  const hashes: Record<string, string> = {};
  const visit = (path: string) => {
    for (const entry of Fs.readdirSync(path, { withFileTypes: true })) {
      const child = Path.join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else hashes[Path.relative(root, child)] = createHash("sha256").update(Fs.readFileSync(child)).digest("hex");
    }
  };
  visit(root);
  return hashes;
};
const readback = () => {
  const body = section(readSkill("kepler-code"), "## Dispatch identity readback");
  const script = body.match(/```sh\n([\s\S]*?)\n```/)?.[1];
  if (!script) throw new Error("Executable dispatch identity readback is missing");
  return script;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("dispatch identity readback", () => {
  it("executes the resource's unchanged signed identity gate without writes", () => {
    const state = fixture();
    const before = snapshot(state.root);
    const result = spawnSync("sh", ["-c", readback(), "kepler-dispatch-readback", ...state.identity], { cwd: state.repository, env: state.env, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("dispatch-identity: current");
    expect(snapshot(state.root)).toEqual(before);
  });

  it("rejects a signed changed HEAD even when the plan revision and bytes stay identical", () => {
    const state = fixture();
    const planCommit = state.git("log", "-1", "--format=%H", "--", "plan.md");
    const plan = Fs.readFileSync(Path.join(state.repository, "plan.md"));
    state.commit("controlled unrelated change", "unrelated.txt", "new HEAD, same plan and order\n");
    expect(state.git("log", "-1", "--format=%H", "--", "plan.md")).toBe(planCommit);
    expect(Fs.readFileSync(Path.join(state.repository, "plan.md"))).toEqual(plan);
    const before = snapshot(state.root);
    const result = spawnSync("sh", ["-c", `${readback()}\nprintf checkpoint > .dispatch-checkpoint\n`, "kepler-dispatch-readback", ...state.identity], { cwd: state.repository, env: state.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dispatch-identity: stale");
    expect(snapshot(state.root)).toEqual(before);
  });

  it.each(["branch", "detached", "target", "repository", "worktree", "worker", "missing-worker"])("rejects changed %s before checkpoint writes", (field) => {
    const state = fixture();
    const identity = [...state.identity];
    if (field === "branch") {
      state.git("switch", "-q", "-c", "different-branch-same-HEAD");
      expect(state.git("rev-parse", "HEAD")).toBe(identity[0]);
    }
    if (field === "detached") {
      state.git("checkout", "-q", "--detach", "HEAD");
      expect(state.git("rev-parse", "HEAD")).toBe(identity[0]);
    }
    if (field === "target") identity[2] = "refs/heads/fixture-work";
    if (field === "repository") identity[3] = state.root;
    if (field === "worktree") identity[4] = state.root;
    if (field === "worker") identity[6] = "controlled-different-session";
    if (field === "missing-worker") identity[6] = "";
    const before = snapshot(state.root);
    const result = spawnSync("sh", ["-c", `${readback()}\nprintf checkpoint > .dispatch-checkpoint\n`, "kepler-dispatch-readback", ...identity], { cwd: state.repository, env: state.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dispatch-identity: stale");
    expect(snapshot(state.root)).toEqual(before);
  });

  it("rejects local and remote spellings of the same configured branch", () => {
    const state = fixture();
    state.git("update-ref", "refs/remotes/origin/fixture-work", state.identity[0]!);
    state.git("config", "branch.fixture-work.remote", "origin");
    state.git("config", "branch.fixture-work.merge", "refs/heads/fixture-work");
    const identity = [...state.identity];
    identity[2] = "refs/remotes/origin/fixture-work";
    const before = snapshot(state.root);
    const result = spawnSync("sh", ["-c", `${readback()}\nprintf checkpoint > .dispatch-checkpoint\n`, "kepler-dispatch-readback", ...identity], { cwd: state.repository, env: state.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dispatch-identity: stale");
    expect(snapshot(state.root)).toEqual(before);
  });

  it("holds on a same-name local/remote target with no configured mapping", () => {
    const state = fixture();
    state.git("update-ref", "refs/remotes/origin/fixture-work", state.identity[0]!);
    const identity = [...state.identity];
    identity[2] = "refs/remotes/origin/fixture-work";
    const result = spawnSync("sh", ["-c", readback(), "kepler-dispatch-readback", ...identity], { cwd: state.repository, env: state.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("source/target mapping unresolved");
  });
});
