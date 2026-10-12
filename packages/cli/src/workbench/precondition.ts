import { Inject, Injectable } from "@nestjs/common";
import * as Path from "node:path";
import {
  cleanTree,
  resolveTarget,
  resultIsFailure,
  runTestCommand,
  testGate,
  type CleanTreeGate,
} from "./precondition-gates.js";
import {
  inspectTasks,
  type TaskInspection,
} from "./precondition-artifacts.js";
import {
  inspectFreshness,
  inspectReviews,
  type ReviewInspection,
} from "./precondition-reviews.js";
import {
  type PreconditionArguments,
  type PreconditionResult,
  type PreconditionRuntime,
} from "./precondition-runtime.js";
import type { ProcessResult } from "./runtime.js";
import {
  fullCommit,
  gitCurrentBranch,
  gitCurrentHead,
  gitWorktreeIdentity,
  successful,
  text,
} from "./precondition-git.js";
import { resolveProjectDataPath } from "./project-data-path.js";
import { createPreconditionSnapshotRuntime } from "./precondition-snapshot.js";
import { inspectFinishHistory, inspectFinishRepair, type FinishInspection } from "./finish-repair.js";

export {
  createPreconditionRuntime,
  type PreconditionArguments,
  type PreconditionFileSystemPort,
  type PreconditionGitPort,
  type PreconditionResult,
  type PreconditionResultStatus,
  type PreconditionRuntime,
  type PreconditionRuntimeOverrides,
} from "./precondition-runtime.js";
export { runTestCommand } from "./precondition-gates.js";

const result = (
  status: "success" | "negative" | "error",
  exitCode: 0 | 1 | 2,
  stdout = "",
  stderr = "",
): PreconditionResult => {
  const lines = stdout.split("\n").filter((line) => line !== "");
  return {
    _tag: "PreconditionResult",
    status,
    exitCode,
    stdout,
    stderr,
    lines,
    lastLine: lines.at(-1) ?? "",
  };
};

const isResult = (
  value: CleanTreeGate | ProcessResult | PreconditionResult,
): value is PreconditionResult => resultIsFailure(value);

export const PRECONDITION_RUNTIME = Symbol("PRECONDITION_RUNTIME");

@Injectable()
export class PreconditionService {
  constructor(
    @Inject(PRECONDITION_RUNTIME) private readonly runtime: PreconditionRuntime,
  ) {}

  async execute(args: PreconditionArguments): Promise<PreconditionResult> {
    const runtime = createPreconditionSnapshotRuntime(this.runtime);
    if (args.recoverFinish !== undefined && (!Number.isSafeInteger(args.recoverFinish) || args.recoverFinish < 1))
      return result("error", 2, "", "error: --recover-finish requires a positive attempt number\n");
    let resolvedArgs: PreconditionArguments;
    try {
      resolvedArgs = {
        ...args,
        changeDir: resolveProjectDataPath(
          Path.resolve(runtime.cwd(), args.changeDir),
          runtime.cwd(),
        ),
      };
    } catch (error) {
      return result(
        "error",
        2,
        "",
        `Unable to resolve project data path: ${String(error)}\n`,
      );
    }
    const target = await resolveTarget(resolvedArgs, runtime);
    if (typeof target !== "string") return target;
    let output = "";
    let failures = 0;

    const initial = await cleanTree(runtime, target, "Clean tree");
    if (isResult(initial)) return initial;
    output += initial.output;
    if (!initial.clean) failures += 1;

    const verifiedHeadResult = await gitCurrentHead(runtime, target);
    const verifiedHead = text(verifiedHeadResult);
    if (!successful(verifiedHeadResult) || !fullCommit(verifiedHead))
      return result("error", 2, output, "error: Unable to resolve verification HEAD\n");
    const verifiedBranchResult = await gitCurrentBranch(runtime, target);
    const verifiedBranch = text(verifiedBranchResult);
    if (!successful(verifiedBranchResult) || verifiedBranch === "")
      return result("error", 2, output, "error: Unable to resolve verification branch\n");
    const verifiedWorktreeResult = await gitWorktreeIdentity(runtime, target);
    const verifiedWorktree = text(verifiedWorktreeResult);
    if (!successful(verifiedWorktreeResult) || verifiedWorktree === "")
      return result("error", 2, output, "error: Unable to resolve verification worktree\n");

    const execution = await runTestCommand(
      runtime,
      resolvedArgs.testCommand,
      target,
    );
    if (isResult(execution)) return execution;
    const tests = testGate(resolvedArgs.testCommand, execution);
    output += tests.output;
    if (!tests.passed) failures += 1;

    const after = await cleanTree(
      runtime,
      target,
      "Clean tree after verification",
    );
    if (isResult(after)) return result("error", 2, output, after.stderr);
    output += after.output;
    if (!after.clean) failures += 1;

    let finish: FinishInspection;
    if (resolvedArgs.recoverFinish !== undefined) {
      finish = await inspectFinishRepair(runtime, target, resolvedArgs.changeDir, resolvedArgs);
      output += finish.output;
      if (!finish.passed) failures += 1;
    } else {
      finish = await inspectFinishHistory(runtime, target, resolvedArgs.changeDir);
      output += finish.output;
      if (!finish.passed) failures += 1;
      const tasks: TaskInspection = await inspectTasks(runtime, target, Path.resolve(resolvedArgs.changeDir));
      output += tasks.output;
      if (!tasks.passed) failures += 1;
      const reviews: ReviewInspection = await inspectReviews(runtime, target, Path.resolve(resolvedArgs.changeDir), tasks, resolvedArgs.targetBranch);
      output += reviews.output;
      if (!reviews.passed) failures += 1;
      const freshness = await inspectFreshness(runtime, target, tasks, reviews, resolvedArgs.wholeChangeWaived === true);
      output += freshness.output;
      if (!freshness.passed) failures += 1;
    }

    if (failures === 0) {
      const final = await cleanTree(runtime, target, "Final clean tree");
      if (isResult(final)) return result("error", 2, output, final.stderr);
      output += final.output;
      if (!final.clean) failures += 1;
    }

    const currentHeadResult = await gitCurrentHead(runtime, target);
    const currentHead = text(currentHeadResult);
    if (!successful(currentHeadResult) || !fullCommit(currentHead))
      return result("error", 2, output, "error: Unable to resolve verification HEAD after checks\n");
    const currentBranchResult = await gitCurrentBranch(runtime, target);
    const currentBranch = text(currentBranchResult);
    if (!successful(currentBranchResult) || currentBranch === "")
      return result("error", 2, output, "error: Unable to resolve verification branch after checks\n");
    const currentWorktreeResult = await gitWorktreeIdentity(runtime, target);
    const currentWorktree = text(currentWorktreeResult);
    if (!successful(currentWorktreeResult) || currentWorktree === "")
      return result("error", 2, output, "error: Unable to resolve verification worktree after checks\n");
    const currentRoot = await runtime.git.repositoryRoot(target);
    if (!successful(currentRoot))
      return result("error", 2, output, "error: Unable to resolve verification target after checks\n");
    if (currentHead !== verifiedHead) {
      output += "[FAIL] Verified HEAD changed during admission\n";
      failures += 1;
    }
    if (currentBranch !== verifiedBranch) {
      output += "[FAIL] Verified branch changed during admission\n";
      failures += 1;
    }
    if (currentWorktree !== verifiedWorktree || text(currentRoot) !== target) {
      output += "[FAIL] Verified worktree or target changed during admission\n";
      failures += 1;
    }

    if (failures === 0) {
      if (resolvedArgs.recoverFinish !== undefined) {
        output += "admission: finalization-repair\n";
        output += `repair-of: ${resolvedArgs.recoverFinish}\n`;
        output += `remaining-effects: ${JSON.stringify(finish.remaining)}\n`;
      }
      output += `verified-head: ${verifiedHead}\n`;
      output += resolvedArgs.recoverFinish === undefined ? "gate: open\n" : "gate: repair-open\n";
      return result("success", 0, output);
    }
    output += `gate: closed (${failures} failing)\n`;
    return result("negative", 1, output);
  }
}

export const renderPreconditionResult = (
  preconditionResult: PreconditionResult,
): string =>
  preconditionResult.stdout.trimEnd() === ""
    ? preconditionResult.stderr.trimEnd()
    : preconditionResult.stdout.trimEnd();
