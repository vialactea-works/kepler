import * as Path from "node:path";
import type { ProcessResult } from "./runtime.js";
import {
  type PreconditionArguments,
  type PreconditionResult,
  type PreconditionRuntime,
} from "./precondition-runtime.js";
import { isFullTargetBranchReference } from "./git-reference.js";

export interface CleanTreeGate {
  readonly output: string;
  readonly clean: boolean;
}

export interface TestGate {
  readonly output: string;
  readonly passed: boolean;
}

export type GateFailure = PreconditionResult;

export const resultIsFailure = (
  value: CleanTreeGate | ProcessResult | PreconditionResult,
): value is PreconditionResult => "_tag" in value;

const result = (
  status: "error",
  stdout: string,
  stderr: string,
): PreconditionResult => {
  const lines = stdout.split("\n").filter((line) => line !== "");
  return {
    _tag: "PreconditionResult",
    status,
    exitCode: 2,
    stdout,
    stderr,
    lines,
    lastLine: lines.at(-1) ?? "",
  };
};

const failure = (message: string): PreconditionResult =>
  result("error", "", `error: ${message}\n`);

const commandFailure = (
  action: string,
  command: ProcessResult,
): PreconditionResult => {
  const detail = command.stderr.trim();
  return failure(`${action}${detail === "" ? "" : `: ${detail}`}`);
};

export const cleanTree = async (
  runtime: PreconditionRuntime,
  root: string,
  label: string,
): Promise<CleanTreeGate | PreconditionResult> => {
  let command: ProcessResult;
  try {
    command = await runtime.git.statusPorcelain(root);
  } catch (error) {
    return failure(`cannot inspect ${label.toLowerCase()}: ${String(error)}`);
  }
  if (command.status !== 0)
    return commandFailure(`cannot inspect ${label.toLowerCase()}`, command);
  const dirty = command.stdout.trimEnd();
  if (dirty === "") return { output: `[PASS] ${label}\n`, clean: true };
  const entries = dirty.split(/\r?\n/).filter((line) => line !== "");
  return {
    output: `[FAIL] ${label} (${entries.length} uncommitted path(s))\n${entries
      .map((line) => `       ${line}`)
      .join("\n")}\n`,
    clean: false,
  };
};

export const runTestCommand = async (
  runtime: PreconditionRuntime,
  command: string,
  root: string,
): Promise<ProcessResult | PreconditionResult> => {
  try {
    return await runtime.process.run("bash", ["-c", command], root);
  } catch (error) {
    return failure(`cannot execute test command: ${String(error)}`);
  }
};

export const testGate = (command: string, execution: ProcessResult): TestGate => {
  if (execution.status === 0)
    return { output: `[PASS] Tests (${command})\n`, passed: true };
  const combined = `${execution.stdout}${execution.stderr}`.trimEnd();
  const tail =
    combined === ""
      ? ""
      : `\n${combined
          .split(/\r?\n/)
          .slice(-15)
          .map((line) => `       ${line}`)
          .join("\n")}\n`;
  return {
    output: `[FAIL] Tests (${command} exited ${execution.status})${tail}`,
    passed: false,
  };
};

export const resolveTarget = async (
  args: PreconditionArguments,
  runtime: PreconditionRuntime,
): Promise<string | PreconditionResult> => {
  if (args.changeDir === "") return failure("--change-dir is required");
  if (args.testCommand === "")
    return failure(
      "--test-cmd is required (take it from AGENTS.md or plan.md; this operation will not guess)",
    );
  if (!isFullTargetBranchReference(args.targetBranch))
    return failure("--target-branch is required as an explicit full branch reference");
  if (!(await runtime.fileSystem.directoryExists(args.changeDir)))
    return failure(`change dir does not exist: ${args.changeDir}`);
  let changeDir: string;
  try {
    changeDir = await runtime.fileSystem.realpath(args.changeDir);
  } catch (error) {
    return failure(
      `cannot resolve change dir ${args.changeDir}: ${String(error)}`,
    );
  }
  let repository: ProcessResult;
  try {
    repository = await runtime.git.repositoryRoot(changeDir);
  } catch (error) {
    return failure(`cannot resolve target repository: ${String(error)}`);
  }
  if (repository.status !== 0)
    return commandFailure("not inside a git repository", repository);
  const reportedRoot = repository.stdout.trim();
  if (reportedRoot === "") return failure("cannot resolve target repository root");
  let root: string;
  try {
    root = await runtime.fileSystem.realpath(reportedRoot);
  } catch (error) {
    return failure(`cannot resolve target repository root: ${String(error)}`);
  }
  if (changeDir === root || !changeDir.startsWith(`${root}${Path.sep}`))
    return failure("change directory is outside the target repository");
  return root;
};
