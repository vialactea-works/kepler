import { describe, expect, it, vi } from "vitest";
import { createPreconditionRuntime } from "../../packages/cli/src/workbench/precondition-runtime.js";
import { createPreconditionSnapshotRuntime } from "../../packages/cli/src/workbench/precondition-snapshot.js";

const first = "a".repeat(40);
const second = "b".repeat(40);
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
const stable = () => "controlled immutable interpretation";

describe("invocation-scoped interpretation-bound Git reads", () => {
  it("shares successful full-commit blob reads only for the same repository, revision and path", async () => {
    const read = vi.fn(() => ok("immutable bytes"));
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, stable);
    await Promise.all([runtime.git.blobAt!("/one", first, "plan.md"), runtime.git.blobAt!("/one", first, "plan.md")]);
    expect(read).toHaveBeenCalledTimes(1);
    await runtime.git.blobAt!("/two", first, "plan.md");
    await runtime.git.blobAt!("/one", second, "plan.md");
    await runtime.git.blobAt!("/one", first, "other.md");
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("does not retain aliases, unavailable reads or exceptions", async () => {
    const read = vi.fn(() => ok());
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, stable);
    await runtime.git.blobAt!("/one", "HEAD", "plan.md");
    await runtime.git.blobAt!("/one", "HEAD", "plan.md");
    expect(read).toHaveBeenCalledTimes(2);
    read.mockReturnValue({ status: 128, stdout: "", stderr: "" });
    await runtime.git.blobAt!("/one", first, "plan.md");
    await runtime.git.blobAt!("/one", first, "plan.md");
    expect(read).toHaveBeenCalledTimes(4);
    read.mockImplementation(() => { throw new Error("unavailable"); });
    await expect(runtime.git.blobAt!("/one", first, "plan.md")).rejects.toThrow("unavailable");
    await expect(runtime.git.blobAt!("/one", first, "plan.md")).rejects.toThrow("unavailable");
    expect(read).toHaveBeenCalledTimes(6);
  });

  it("leaves current identity, working bytes, index and path history reads live", async () => {
    const live = vi.fn(() => ok());
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, currentHead: live, worktreeBlob: live, stagedDiff: live, pathHistory: live } }, stable);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await runtime.git.currentHead!("/one");
      await runtime.git.worktreeBlob!("/one", "AGENTS.md");
      await runtime.git.stagedDiff!("/one", "AGENTS.md");
      await runtime.git.pathHistory!("/one", "plan.md");
    }
    expect(live).toHaveBeenCalledTimes(8);
  });

  it("preserves prototype methods and their original receiver for live ports", async () => {
    class ReceiverPort {
      #count = 0;
      repositoryRoot() { return ok("/fixture"); }
      statusPorcelain() { return ok(); }
      currentHead() { this.#count += 1; return ok(String(this.#count)); }
    }
    const runtime = createPreconditionSnapshotRuntime(createPreconditionRuntime({ git: new ReceiverPort() }));
    expect((await runtime.git.repositoryRoot("/one")).stdout).toBe("/fixture");
    expect((await runtime.git.currentHead!("/one")).stdout).toBe("1");
    expect((await runtime.git.currentHead!("/one")).stdout).toBe("2");
  });

  it("starts a fresh cache for each wrapper and retains full-SHA parent, resolve, ancestor and file reads", async () => {
    const read = vi.fn(() => ok(first));
    const base = createPreconditionRuntime();
    const original = { ...base, git: { ...base.git, blobAt: read, firstParent: read, resolveCommit: read, isAncestor: read, commitFiles: read } };
    for (const runtime of [createPreconditionSnapshotRuntime(original, stable), createPreconditionSnapshotRuntime(original, stable)]) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        await runtime.git.blobAt!("/one", first, "plan.md");
        await runtime.git.firstParent!("/one", first);
        await runtime.git.resolveCommit!("/one", first);
        await runtime.git.isAncestor!("/one", first, second);
        await runtime.git.commitFiles!("/one", first);
      }
    }
    expect(read).toHaveBeenCalledTimes(10);
  });

  it("does not cache opaque custom ports without an explicit interpretation epoch", async () => {
    const read = vi.fn().mockReturnValueOnce(ok("before")).mockReturnValueOnce(ok("after"));
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } });
    expect((await runtime.git.blobAt!("/one", first, "plan.md")).stdout).toBe("before");
    expect((await runtime.git.blobAt!("/one", first, "plan.md")).stdout).toBe("after");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("invalidates the same-SHA success when its interpretation epoch changes", async () => {
    let epoch = "before";
    const read = vi.fn(() => ok(epoch));
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, () => epoch);
    expect((await runtime.git.blobAt!("/one", first, "plan.md")).stdout).toBe("before");
    epoch = "after";
    expect((await runtime.git.blobAt!("/one", first, "plan.md")).stdout).toBe("after");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not retain a read whose interpretation changed while it ran", async () => {
    let epoch = "before";
    const read = vi.fn(() => { epoch = "after"; return ok(epoch); });
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, () => epoch);
    await runtime.git.blobAt!("/one", first, "plan.md");
    expect(read).toHaveBeenCalledTimes(2);
    await runtime.git.blobAt!("/one", first, "plan.md");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("falls back to live reads when interpretation evidence is missing or throws", async () => {
    const read = vi.fn(() => ok());
    const epoch = vi.fn<() => string | undefined>(() => undefined);
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, epoch);
    await runtime.git.blobAt!("/one", first, "plan.md");
    await runtime.git.blobAt!("/one", first, "plan.md");
    epoch.mockImplementation(() => { throw new Error("epoch unavailable"); });
    await runtime.git.blobAt!("/one", first, "plan.md");
    await runtime.git.blobAt!("/one", first, "plan.md");
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("isolates retained results from both producer and caller mutations", async () => {
    const produced = ok("original");
    const read = vi.fn(() => produced);
    const base = createPreconditionRuntime();
    const runtime = createPreconditionSnapshotRuntime({ ...base, git: { ...base.git, blobAt: read } }, stable);
    const returned = await runtime.git.blobAt!("/one", first, "plan.md");
    produced.stdout = "producer mutation";
    (returned as { stdout: string }).stdout = "caller mutation";
    expect((await runtime.git.blobAt!("/one", first, "plan.md")).stdout).toBe("original");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
