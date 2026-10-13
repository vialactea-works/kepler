import { describe, expect, it } from "vitest";
import { collectTaskLedgerHistory, taskCheckpointHistoryAt, taskLedgerHistoryAt } from "../../packages/cli/src/workbench/task-ledger-history.js";
import type { TaskCheckpointGit } from "../../packages/cli/src/workbench/task-checkpoint.js";
import type { ProcessResult } from "../../packages/cli/src/workbench/runtime.js";

const head = "a".repeat(40);
const earlier = "b".repeat(40);
const path = ".kepler/changes/example/progress.md";
const taskPath = ".kepler/changes/example/tasks/task-1/progress.md";
const fixture = () => {
  let value = "original observations";
  let calls = 0;
  const result = (stdout: string, status = 0): ProcessResult => ({ stdout, stderr: status ? "unavailable" : "", status });
  const unsupported = (): never => { throw new Error("Unexpected authority query"); };
  const git: TaskCheckpointGit = {
    pathHistory: () => result(`${head}\n${earlier}\n`),
    blobAt: () => { calls += 1; return result(value); },
    resolveCommit: unsupported,
    firstParent: unsupported,
    isAncestor: unsupported,
  };
  return { git, calls: () => calls, replace: (next: string) => { value = next; }, result };
};

describe("invocation-local task artifact observations", () => {
  it("reuses selected artifact reads while leaving uncollected revisions and aliases live", async () => {
    const f = fixture();
    const ledgerHistory = await collectTaskLedgerHistory(f.git, "/repository", path, head, [taskPath]);
    const observed = { ...f.git, ledgerHistory };
    const bound = taskCheckpointHistoryAt(observed, "/repository", taskPath, head);
    const before = f.calls();
    expect((await bound.blobAt("/repository", head, taskPath)).stdout).toBe("original observations");
    expect((await bound.blobAt("/repository", earlier, taskPath)).stdout).toBe("original observations");
    expect(f.calls()).toBe(before);
    f.replace("new interpretation");
    expect((await bound.blobAt("/repository", "HEAD", taskPath)).stdout).toBe("new interpretation");
    expect((await bound.blobAt("/repository", "c".repeat(40), taskPath)).stdout).toBe("new interpretation");
    expect(f.calls()).toBe(before + 2);
  });

  it("rejects another repository, path or observed head binding", async () => {
    const f = fixture();
    const ledgerHistory = await collectTaskLedgerHistory(f.git, "/repository", path, head, [taskPath]);
    const observed = { ...f.git, ledgerHistory };
    expect(taskLedgerHistoryAt(observed, "/another", path, head)).toBeUndefined();
    expect(taskLedgerHistoryAt(observed, "/repository", "another.md", head)).toBeUndefined();
    expect(taskLedgerHistoryAt(observed, "/repository", path, earlier)).toBeUndefined();
    expect(taskCheckpointHistoryAt(observed, "/another", taskPath, head)).toBe(observed);
    expect(taskCheckpointHistoryAt(observed, "/repository", taskPath, earlier)).toBe(observed);
    expect(taskCheckpointHistoryAt(observed, "/repository", "uncollected.md", head)).toBe(observed);
  });

  it("collects fresh results for the next invocation even with identical commit names", async () => {
    const f = fixture();
    const first = await collectTaskLedgerHistory(f.git, "/repository", path, head);
    f.replace("changed Git interpretation");
    const second = await collectTaskLedgerHistory(f.git, "/repository", path, head);
    expect(first.blobs.get(head)?.stdout).toBe("original observations");
    expect(second.blobs.get(head)?.stdout).toBe("changed Git interpretation");
  });

  it("retains unavailable history and blobs instead of manufacturing proof", async () => {
    const f = fixture();
    const git = { ...f.git, pathHistory: () => f.result("", 128), blobAt: () => f.result("", 128) };
    const history = await collectTaskLedgerHistory(git, "/repository", path, head, [taskPath]);
    expect(history.history.status).toBe(128);
    expect(history.blobs.get(head)).toEqual(f.result("", 128));
    expect(history.tasks.get(taskPath)?.history.status).toBe(128);
    expect(history.plan.blob.status).toBe(128);
  });
});
