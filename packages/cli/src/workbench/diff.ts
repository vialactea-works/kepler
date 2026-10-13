import { Inject, Injectable } from "@nestjs/common";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  createArtifactReader,
  type ArtifactFileSystem,
  type ArtifactReadResult,
} from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import { spawnSync } from "node:child_process";
import type { ProcessPort, ProcessResult } from "./runtime.js";
import { resolveProjectDataPath } from "./project-data-path.js";
import { isFullTargetBranchReference } from "./git-reference.js";
import {
  readTaskFeedbackRanges,
  resolveTaskCheckpoint,
  type TaskCheckpointGit,
  type TaskCheckpointResult,
  type TaskFeedbackRange,
} from "./task-checkpoint.js";

export interface RecordDiffArguments {
  readonly mode: "record";
  readonly task: string | number;
  readonly changeDir?: string;
}

export interface TaskDiffArguments {
  readonly mode: "task";
  readonly task: string | number;
  readonly changeDir?: string;
  readonly out?: string;
}

export interface BaseDiffArguments {
  readonly mode: "base";
  readonly base: string;
  readonly changeDir?: string;
  readonly out?: string;
}

export interface WholeChangeDiffArguments {
  readonly mode: "whole-change";
  readonly targetBranch: string;
  readonly out?: string;
  readonly changeDir?: string;
}

export type DiffArguments =
  | RecordDiffArguments
  | TaskDiffArguments
  | BaseDiffArguments
  | WholeChangeDiffArguments;

export type DiffOperation = DiffArguments["mode"];
export type DiffResultStatus = "success" | "negative" | "error";

export interface DiffResult {
  readonly _tag: "DiffResult";
  readonly operation: DiffOperation;
  readonly status: DiffResultStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
  readonly lines: readonly string[];
  readonly lastLine: string;
}

export interface DiffFileSystemPort extends ArtifactFileSystem {
  readonly pathExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly directoryExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly realpath: (sourcePath: string) => string | Promise<string>;
  readonly writeFile: (
    sourcePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly mkdir: (sourcePath: string) => void | Promise<void>;
  readonly appendFile: (
    sourcePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly makeTempFile: (label: string) => string | Promise<string>;
}

export interface DiffGitPort {
  readonly changedPaths?: (cwd: string, commit: string) => ProcessResult | Promise<ProcessResult>;
  readonly pathChanges?: (cwd: string, base: string, head: string, paths: readonly string[]) => ProcessResult | Promise<ProcessResult>;
  readonly repositoryRoot: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly commonDirectory: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly currentHead: (cwd: string) => ProcessResult | Promise<ProcessResult>;
  readonly resolveCommit: (
    cwd: string,
    ref: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly isAncestor: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly remoteDefaultBranch: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly mergeBase: (
    cwd: string,
    ref: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly ignored: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly diffStat: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly diff: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly changedFiles: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly statusPorcelain?: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistory?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly blobAt?: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly firstParent?: (
    cwd: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
}

export interface DiffRuntime {
  readonly cwd: () => string;
  readonly fileSystem: DiffFileSystemPort;
  readonly git: DiffGitPort;
}

export interface DiffRuntimeOverrides {
  readonly cwd?: () => string;
  readonly process?: ProcessPort;
  readonly fileSystem?: DiffFileSystemPort;
  readonly git?: DiffGitPort;
}

const environment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const productionProcess: ProcessPort = {
  run: (command, args, cwd) => {
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: "utf-8",
      env: environment,
    });
    return {
      status: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },
};

const productionFileSystem: DiffFileSystemPort = {
  readFile: (sourcePath) => Fs.readFile(sourcePath, "utf8"),
  pathExists: async (sourcePath) => {
    try {
      await Fs.lstat(sourcePath);
      return true;
    } catch {
      return false;
    }
  },
  directoryExists: async (sourcePath) => {
    try {
      return (await Fs.stat(sourcePath)).isDirectory();
    } catch {
      return false;
    }
  },
  realpath: (sourcePath) => Fs.realpath(sourcePath),
  writeFile: (sourcePath, content) => Fs.writeFile(sourcePath, content),
  mkdir: async (sourcePath) => {
    await Fs.mkdir(sourcePath, { recursive: true });
  },
  appendFile: (sourcePath, content) => Fs.appendFile(sourcePath, content),
  makeTempFile: async (label) => {
    const directory = await Fs.mkdtemp(
      Path.join(Os.tmpdir(), `kepler-diff-${label}-`),
    );
    return Path.join(directory, "package.diff");
  },
};

const createGitPort = (processPort: ProcessPort): DiffGitPort => ({
  repositoryRoot: (cwd) =>
    processPort.run("git", ["rev-parse", "--show-toplevel"], cwd),
  commonDirectory: (cwd) =>
    processPort.run("git", ["rev-parse", "--git-common-dir"], cwd),
  currentHead: (cwd) => processPort.run("git", ["rev-parse", "HEAD"], cwd),
  resolveCommit: (cwd, ref) =>
    processPort.run("git", ["rev-parse", "--verify", `${ref}^{commit}`], cwd),
  isAncestor: (cwd, base, head) =>
    processPort.run("git", ["merge-base", "--is-ancestor", base, head], cwd),
  remoteDefaultBranch: (cwd) =>
    processPort.run(
      "git",
      ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      cwd,
    ),
  mergeBase: (cwd, ref, head) =>
    processPort.run("git", ["merge-base", ref, head], cwd),
  ignored: (cwd, sourcePath) =>
    processPort.run("git", ["check-ignore", "-q", "--", sourcePath], cwd),
  diffStat: (cwd, base, head) =>
    processPort.run("git", ["diff", "--stat", `${base}..${head}`], cwd),
  diff: (cwd, base, head) =>
    processPort.run("git", ["diff", "-U10", `${base}..${head}`], cwd),
  changedFiles: (cwd, base, head) =>
    processPort.run("git", ["diff", "--name-only", `${base}..${head}`], cwd),
  statusPorcelain: (cwd) =>
    processPort.run("git", ["status", "--porcelain", "--untracked-files=all"], cwd),
  pathHistory: (cwd, sourcePath) =>
    processPort.run("git", ["log", "--format=%H", "--full-history", "HEAD", "--", sourcePath], cwd),
  changedPaths: (cwd, commit) =>
    processPort.run("git", ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-m", "-z", commit], cwd),
  pathChanges: (cwd, base, head, paths) =>
    processPort.run("git", ["log", "--full-history", "--format=%H", `${base}..${head}`, "--", ...paths], cwd),
  blobAt: (cwd, commit, sourcePath) =>
    processPort.run("git", ["show", `${commit}:${sourcePath}`], cwd),
  firstParent: (cwd, commit) =>
    processPort.run("git", ["rev-parse", "--verify", `${commit}^1`], cwd),
});

export const createDiffRuntime = (
  overrides: DiffRuntimeOverrides = {},
): DiffRuntime => {
  const processPort = overrides.process ?? productionProcess;
  return {
    cwd: overrides.cwd ?? (() => process.cwd()),
    fileSystem: overrides.fileSystem ?? productionFileSystem,
    git: overrides.git ?? createGitPort(processPort),
  };
};

const linesOf = (stdout: string): readonly string[] =>
  stdout.split("\n").filter((line) => line !== "");

const result = (
  operation: DiffOperation,
  status: DiffResultStatus,
  exitCode: 0 | 1 | 2,
  stdout = "",
  stderr = "",
): DiffResult => {
  const lines = linesOf(stdout);
  return {
    _tag: "DiffResult",
    operation,
    status,
    exitCode,
    stdout,
    stderr,
    lines,
    lastLine: lines.at(-1) ?? "",
  };
};

const failure = (
  operation: DiffOperation,
  message: string,
  exitCode: 1 | 2 = 2,
): DiffResult =>
  result(operation, "error", exitCode, "", `error: ${message}\n`);

const negative = (operation: DiffOperation, message: string): DiffResult =>
  result(operation, "negative", 1, "", `error: ${message}\n`);

const successful = (command: ProcessResult): boolean => command.status === 0;
const text = (command: ProcessResult): string => command.stdout.trim();

const commandError = (
  operation: DiffOperation,
  action: string,
  command: ProcessResult,
): DiffResult => {
  const detail = command.stderr.trim();
  return failure(operation, `${action}${detail === "" ? "" : `: ${detail}`}`);
};

const stripComments = (source: string): string => {
  let output = "";
  let remaining = source;
  while (remaining !== "") {
    const opening = remaining.indexOf("<!--");
    if (opening < 0) return output + remaining;
    output += remaining.slice(0, opening);
    const closing = remaining.indexOf("-->", opening + 4);
    if (closing < 0) return output;
    remaining = remaining.slice(closing + 3);
  }
  return output;
};

const taskNumber = (task: string | number): string => String(task);

const validTaskNumber = (task: string): boolean => /^[1-9][0-9]*$/.test(task);

const readText = async (
  runtime: DiffRuntime,
  sourcePath: string,
): Promise<string | DiffResult> => {
  try {
    return await runtime.fileSystem.readFile(sourcePath);
  } catch (error) {
    return failure("record", `cannot read ${sourcePath}: ${String(error)}`);
  }
};

const validatePlanArtifact = async (
  plan: string,
  source: string,
): Promise<ArtifactReadResult | undefined> => {
  const reader = createArtifactReader({ readFile: () => source });
  const artifact = await reader(plan);
  if (artifact._tag === "recognized") {
    const contract = validateArtifact(artifact);
    if (contract._tag === "invalid") return artifact;
  }
  return artifact;
};

const resolveTask = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  changeDir: string,
  task: string,
): Promise<string | DiffResult> => {
  if (!validTaskNumber(task))
    return failure(operation, "task must be an exact positive task number");
  const planPath = Path.join(changeDir, "plan.md");
  const source = await readText(runtime, planPath);
  if (typeof source !== "string") return { ...source, operation };
  const artifact = await validatePlanArtifact(planPath, source);
  if (artifact?._tag === "invalid")
    return failure(operation, artifact.diagnostic.message);
  if (artifact?._tag === "recognized") {
    const contract = validateArtifact(artifact);
    if (contract._tag === "invalid")
      return failure(
        operation,
        contract.diagnostics[0]?.message ?? "invalid plan",
      );
  }
  const visible = stripComments(source);
  const matches = [
    ...visible.matchAll(/^### Task ([1-9][0-9]*):[ \t]+(.+)$/gm),
  ].filter((match) => match[1] === task);
  const all = [...visible.matchAll(/^### Task ([1-9][0-9]*):[ \t]+(.+)$/gm)];
  if (all.filter((match) => match[1] === task).length > 1)
    return failure(operation, `duplicate Task ${task} in ${planPath}`);
  const match = matches[0];
  if (!match)
    return failure(operation, `task ${task} is not active in ${planPath}`);
  if (/\(abandoned — .+\)$/.test(match[2] ?? ""))
    return failure(operation, `task ${task} is abandoned in ${planPath}`);
  return match[2] ?? "";
};

const taskBaseFile = (changeDir: string, task: string): string =>
  Path.join(changeDir, "tasks", `task-${task}`, ".base");

const checkpointGit = (runtime: DiffRuntime): TaskCheckpointGit => ({
  changedPaths: runtime.git.changedPaths,
  pathChanges: runtime.git.pathChanges,
  pathHistory: (root, sourcePath) =>
    runtime.git.pathHistory?.(root, sourcePath) ?? {
      status: 2,
      stdout: "",
      stderr: "task progress history is unavailable",
    },
  blobAt: (root, commit, sourcePath) =>
    runtime.git.blobAt?.(root, commit, sourcePath) ?? {
      status: 2,
      stdout: "",
      stderr: "task progress history is unavailable",
    },
  firstParent: (root, commit) =>
    runtime.git.firstParent?.(root, commit) ?? {
      status: 2,
      stdout: "",
      stderr: "task attempt parent is unavailable",
    },
  resolveCommit: (root, reference) => runtime.git.resolveCommit(root, reference),
  isAncestor: (root, base, head) =>
    runtime.git.isAncestor(root, base, head),
});

const historicalTaskCheckpoint = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  root: string,
  changeDir: string,
  task: string,
): Promise<TaskCheckpointResult | DiffResult> => {
  const currentHead = await fullCommit(
    runtime,
    operation,
    root,
    "HEAD",
    "cannot resolve HEAD",
  );
  if (typeof currentHead !== "string") return currentHead;
  const feedbackPath = Path.join(
    changeDir,
    "tasks",
    `task-${task}`,
    "feedback.md",
  );
  let feedbackRanges: readonly TaskFeedbackRange[] = [];
  if (await runtime.fileSystem.pathExists(feedbackPath)) {
    const source = await readText(runtime, feedbackPath);
    if (typeof source !== "string") return { ...source, operation };
    const parsed = await readTaskFeedbackRanges(
      feedbackPath,
      source,
      Path.basename(changeDir),
      Number(task),
    );
    if (parsed.kind === "unverified")
      return failure(
        operation,
        `task feedback checkpoint evidence is unverified: ${parsed.reason}`,
      );
    feedbackRanges = parsed.ranges;
  }
  return resolveTaskCheckpoint(
    checkpointGit(runtime),
    root,
    Path.relative(
      root,
      Path.join(changeDir, "tasks", `task-${task}`, "progress.md"),
    )
      .split(Path.sep)
      .join("/"),
    Number(task),
    Path.basename(changeDir),
    currentHead,
    feedbackRanges,
  );
};

const taskRowStatus = async (
  runtime: DiffRuntime,
  changeDir: string,
  task: string,
): Promise<string | DiffResult> => {
  const progressPath = Path.join(changeDir, "progress.md");
  const source = await readText(runtime, progressPath);
  if (typeof source !== "string") return { ...source, operation: "record" };
  const visible = stripComments(source);
  const pattern = new RegExp(
    `^\\|[ \\t]*Task ${task}:[^|]+\\|[ \\t]*(pending|in-progress|blocked|done)[ \\t]*\\|[ \\t]*\\[details\\]\\(tasks/task-${task}/progress\\.md\\)[ \\t]*\\|[ \\t]*$`,
    "gm",
  );
  const matches = [...visible.matchAll(pattern)];
  if (matches.length !== 1)
    return failure(
      "record",
      `cannot create a checkpoint without one exact split row for Task ${task}`,
    );
  return matches[0]?.[1] ?? "";
};

const hasAttempt = (source: string): boolean =>
  /^##(?:[ \t]|$)/m.test(stripComments(source));

const canRecordFirst = async (
  runtime: DiffRuntime,
  root: string,
  changeDir: string,
  task: string,
): Promise<DiffResult | undefined> => {
  const rootProgress = Path.join(changeDir, "progress.md");
  const taskProgress = Path.join(
    changeDir,
    "tasks",
    `task-${task}`,
    "progress.md",
  );
  const feedback = Path.join(changeDir, "tasks", `task-${task}`, "feedback.md");
  if (!(await runtime.fileSystem.pathExists(rootProgress)))
    return failure(
      "record",
      `cannot create a checkpoint without the split root task ledger: ${rootProgress}`,
    );
  if (!(await runtime.fileSystem.pathExists(taskProgress)))
    return failure(
      "record",
      `cannot create a checkpoint without the task progress file: ${taskProgress}`,
    );
  const status = await taskRowStatus(runtime, changeDir, task);
  if (typeof status !== "string") return status;
  let progressSource: string;
  try {
    progressSource = await runtime.fileSystem.readFile(taskProgress);
  } catch (error) {
    return failure("record", `cannot read ${taskProgress}: ${String(error)}`);
  }
  if (
    status !== "pending" ||
    hasAttempt(progressSource) ||
    (await runtime.fileSystem.pathExists(feedback))
  )
    return failure(
      "record",
      `cannot create missing checkpoint for Task ${task} after durable task evidence; historical recovery requires unambiguous durable git and task evidence or intervention`,
    );
  if (!runtime.git.statusPorcelain || !runtime.git.blobAt)
    return failure("record", "cannot verify a clean initial task checkpoint");
  const statusResult = await runtime.git.statusPorcelain(root);
  if (!successful(statusResult) || statusResult.stdout.trim() !== "")
    return failure(
      "record",
      "cannot create a first task checkpoint with an uncommitted worktree",
    );
  const currentHead = await fullCommit(
    runtime,
    "record",
    root,
    "HEAD",
    "cannot resolve HEAD",
  );
  if (typeof currentHead !== "string") return currentHead;
  const committedProgress = await runtime.git.blobAt(
    root,
    currentHead,
    Path.relative(root, taskProgress).split(Path.sep).join("/"),
  );
  if (
    !successful(committedProgress) ||
    committedProgress.stdout !== progressSource
  )
    return failure(
      "record",
      `Task ${task} progress must be tracked and unchanged at HEAD before the first checkpoint`,
    );
  return undefined;
};

const resolveChangeDir = async (
  runtime: DiffRuntime,
  supplied: string | undefined,
  operation: DiffOperation,
): Promise<string | DiffResult | undefined> => {
  if (supplied !== undefined) {
    let candidate: string;
    try {
      candidate = resolveProjectDataPath(supplied, runtime.cwd());
    } catch (error) {
      return failure(operation, `cannot resolve project data path: ${String(error)}`);
    }
    if (!(await runtime.fileSystem.directoryExists(candidate)))
      return failure(operation, `change dir does not exist: ${candidate}`);
    try {
      return await runtime.fileSystem.realpath(candidate);
    } catch (error) {
      return failure(
        operation,
        `cannot resolve change dir ${candidate}: ${String(error)}`,
      );
    }
  }
  let current: string;
  try {
    const canonicalCurrent = resolveProjectDataPath(runtime.cwd(), runtime.cwd());
    current = await runtime.fileSystem.realpath(canonicalCurrent);
  } catch (error) {
    return failure(
      operation,
      `cannot resolve current directory: ${String(error)}`,
    );
  }
  const parts = current.split(Path.sep);
  const index = parts.lastIndexOf(".kepler");
  if (index >= 0 && parts[index + 1] === "changes" && parts[index + 2]) {
    const changeDir = parts.slice(0, index + 3).join(Path.sep) || Path.sep;
    if (await runtime.fileSystem.directoryExists(changeDir)) return changeDir;
  }
  return undefined;
};

const repositoryRoot = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  cwd: string,
): Promise<string | DiffResult> => {
  const command = await runtime.git.repositoryRoot(cwd);
  if (!successful(command))
    return commandError(operation, "not inside a git repository", command);
  const root = text(command);
  return root === ""
    ? failure(operation, "cannot resolve repository root")
    : root;
};

const fullCommit = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  root: string,
  reference: string,
  label: string,
): Promise<string | DiffResult> => {
  const command = await runtime.git.resolveCommit(root, reference);
  const resolved = text(command);
  if (!successful(command) || !/^[0-9a-f]{40}$/.test(resolved))
    return failure(
      operation,
      `${label} is not a commit in this repository: ${reference}`,
    );
  return resolved;
};

const readCheckpoint = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  checkpoint: string,
  root: string,
): Promise<string | DiffResult> => {
  let value: string;
  try {
    value = await runtime.fileSystem.readFile(checkpoint);
  } catch (error) {
    return failure(operation, `cannot read ${checkpoint}: ${String(error)}`);
  }
  const candidate = value.endsWith("\n") ? value.slice(0, -1) : value;
  if (!/^[0-9a-f]{40}$/.test(candidate))
    return failure(
      operation,
      `task checkpoint ${checkpoint} must contain exactly one full commit ID`,
    );
  const resolved = await fullCommit(
    runtime,
    operation,
    root,
    candidate,
    `task checkpoint ${checkpoint}`,
  );
  if (typeof resolved !== "string")
    return failure(
      operation,
      `task checkpoint ${checkpoint} must contain exactly one full commit ID`,
    );
  if (resolved !== candidate)
    return failure(
      operation,
      `task checkpoint ${checkpoint} must contain exactly one full commit ID`,
    );
  return candidate;
};

const ensureIgnored = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  root: string,
  checkpoint: string,
): Promise<string | DiffResult> => {
  const ignored = await runtime.git.ignored(root, checkpoint);
  if (ignored.status === 0) return "";
  if (ignored.status !== 1)
    return commandError(
      operation,
      "cannot inspect checkpoint ignore rule",
      ignored,
    );
  const common = await runtime.git.commonDirectory(root);
  if (!successful(common))
    return commandError(
      operation,
      "cannot resolve Git common directory",
      common,
    );
  const commonPath = text(common);
  const exclude = Path.isAbsolute(commonPath)
    ? Path.join(commonPath, "info", "exclude")
    : Path.join(root, commonPath, "info", "exclude");
  const relative = Path.relative(root, checkpoint);
  let existing = "";
  if (await runtime.fileSystem.pathExists(exclude)) {
    try {
      existing = await runtime.fileSystem.readFile(exclude);
    } catch (error) {
      return failure(operation, `cannot read ${exclude}: ${String(error)}`);
    }
  }
  if (existing.split(/\r?\n/).some((line) => line === relative)) return "";
  try {
    await runtime.fileSystem.mkdir(Path.dirname(exclude));
    await runtime.fileSystem.appendFile(
      exclude,
      `${existing !== "" && !existing.endsWith("\n") ? "\n" : ""}${relative}\n`,
    );
  } catch (error) {
    return failure(operation, `cannot write ${exclude}: ${String(error)}`);
  }
  return `ignored: added ${relative} to ${exclude}`;
};

const recordCheckpoint = async (
  args: RecordDiffArguments,
  runtime: DiffRuntime,
): Promise<DiffResult> => {
  const operation = args.mode;
  const task = taskNumber(args.task);
  const change = await resolveChangeDir(runtime, args.changeDir, operation);
  if (typeof change !== "string")
    return (
      change ??
      failure(
        operation,
        "not inside a change directory — pass --change-dir <dir>",
      )
    );
  const root = await repositoryRoot(runtime, operation, change);
  if (typeof root !== "string") return root;
  const taskValidation = await resolveTask(runtime, operation, change, task);
  if (typeof taskValidation !== "string") return taskValidation;
  const checkpoint = taskBaseFile(change, task);
  const checkpointExists = await runtime.fileSystem.pathExists(checkpoint);
  const historical = await historicalTaskCheckpoint(
    runtime,
    operation,
    root,
    change,
    task,
  );
  if ("exitCode" in historical) return historical;
  if (historical.kind === "unverified")
    return failure(operation, `task checkpoint is unverified: ${historical.reason}`);
  let base: string;
  const outputs: string[] = [];
  if (historical.kind === "not-started" && historical.admissionRequired) return failure(operation, "Dependency-mode checkpoint requires guarded admission before dispatch");
  if (checkpointExists) {
    const checked = await readCheckpoint(runtime, operation, checkpoint, root);
    if (typeof checked !== "string") return checked;
    if (historical.base !== undefined && checked !== historical.base)
      return failure(
        operation,
        `task checkpoint conflicts with historical Base ${historical.base}; preserving existing checkpoint`,
      );
    base = historical.base ?? checked;
    const head = await fullCommit(
      runtime,
      operation,
      root,
      "HEAD",
      "cannot resolve HEAD",
    );
    if (typeof head !== "string") return head;
    const ancestor = await runtime.git.isAncestor(root, base, head);
    if (ancestor.status !== 0)
      return commandError(
        operation,
        `task checkpoint is not an ancestor of HEAD: ${base}`,
        ancestor,
      );
  } else if (historical.base !== undefined) {
    base = historical.base;
  } else {
    const first = await canRecordFirst(runtime, root, change, task);
    if (first) return first;
    const currentHead = await fullCommit(
      runtime,
      operation,
      root,
      "HEAD",
      "cannot resolve HEAD",
    );
    if (typeof currentHead !== "string") return currentHead;
    base = currentHead;
  }
  if (!checkpointExists) {
    try {
      await runtime.fileSystem.mkdir(Path.dirname(checkpoint));
      await runtime.fileSystem.writeFile(checkpoint, `${base}\n`);
    } catch (error) {
      return failure(operation, `cannot write ${checkpoint}: ${String(error)}`);
    }
  }
  const ignored = await ensureIgnored(runtime, operation, root, checkpoint);
  if (typeof ignored !== "string") return ignored;
  if (ignored !== "") outputs.push(ignored);
  outputs.push(`base: ${base}`, checkpoint);
  return result(operation, "success", 0, `${outputs.join("\n")}\n`);
};

const packageRange = async (
  runtime: DiffRuntime,
  operation: DiffOperation,
  root: string,
  base: string,
  head: string,
  label: string,
  out: string | undefined,
): Promise<DiffResult> => {
  const stat = await runtime.git.diffStat(root, base, head);
  if (!successful(stat))
    return commandError(operation, "git diff --stat failed", stat);
  const patch = await runtime.git.diff(root, base, head);
  if (!successful(patch))
    return commandError(operation, "git diff failed", patch);
  const files = await runtime.git.changedFiles(root, base, head);
  if (!successful(files))
    return commandError(operation, "git diff --name-only failed", files);
  let output: string;
  try {
    output =
      out === undefined
        ? await runtime.fileSystem.makeTempFile(label)
        : Path.isAbsolute(out)
          ? out
          : Path.join(root, out);
    const content = `# Kepler diff package\n# range: ${base}..${head}\n\n## git diff --stat ${base}..${head}\n\n${stat.stdout}\n## git diff -U10 ${base}..${head}\n\n${patch.stdout}`;
    await runtime.fileSystem.writeFile(output, content);
  } catch (error) {
    return failure(
      operation,
      `cannot write ${out ?? "scratch package"}: ${String(error)}`,
    );
  }
  const fileCount =
    files.stdout === "" ? 0 : files.stdout.trimEnd().split("\n").length;
  const stdout = `Base: ${base}\nHead: ${head}\nrange: ${base}..${head}\nfiles-changed: ${fileCount}\nPackage: ${output}\n${output}\n`;
  return result(operation, "success", 0, stdout);
};

const packageTask = async (
  args: TaskDiffArguments,
  runtime: DiffRuntime,
): Promise<DiffResult> => {
  const operation = args.mode;
  const task = taskNumber(args.task);
  const change = await resolveChangeDir(runtime, args.changeDir, operation);
  if (typeof change !== "string")
    return (
      change ??
      failure(
        operation,
        "not inside a change directory — pass --change-dir <dir>",
      )
    );
  const root = await repositoryRoot(runtime, operation, change);
  if (typeof root !== "string") return root;
  const validation = await resolveTask(runtime, operation, change, task);
  if (typeof validation !== "string") return validation;
  const checkpoint = taskBaseFile(change, task);
  const checkpointExists = await runtime.fileSystem.pathExists(checkpoint);
  const historical = await historicalTaskCheckpoint(
    runtime,
    operation,
    root,
    change,
    task,
  );
  if ("exitCode" in historical) return historical;
  if (historical.kind === "unverified")
    return failure(operation, `task checkpoint is unverified: ${historical.reason}`);
  let base: string;
  if (historical.kind === "not-started" && historical.admissionRequired) return failure(operation, "Dependency-mode checkpoint requires guarded admission before dispatch");
  if (checkpointExists) {
    const checked = await readCheckpoint(runtime, operation, checkpoint, root);
    if (typeof checked !== "string") return checked;
    if (historical.base !== undefined && checked !== historical.base)
      return failure(
        operation,
        `task checkpoint conflicts with historical Base ${historical.base}; preserving existing checkpoint`,
      );
    base = historical.base ?? checked;
  } else if (historical.base !== undefined) {
    base = historical.base;
  } else {
    return negative(
      operation,
      `no BASE recorded for Task ${task} — run --record before dispatching an implementer`,
    );
  }
  const head = await fullCommit(
    runtime,
    operation,
    root,
    historical.kind === "verified" ? historical.head ?? "HEAD" : "HEAD",
    "cannot resolve HEAD",
  );
  if (typeof head !== "string") return head;
  const ancestor = await runtime.git.isAncestor(root, base, head);
  if (ancestor.status !== 0)
    return commandError(
      operation,
      `BASE is not an ancestor of HEAD: ${base}`,
      ancestor,
    );
  if (base === head)
    return negative(
      operation,
      `BASE equals HEAD (${base}) — nothing has been committed since --record`,
    );
  return packageRange(
    runtime,
    operation,
    root,
    base,
    head,
    `task-${task}`,
    args.out,
  );
};

const baseForArguments = async (
  args: BaseDiffArguments,
  runtime: DiffRuntime,
): Promise<{ readonly root: string; readonly base: string } | DiffResult> => {
  const operation = args.mode;
  const change = await resolveChangeDir(runtime, args.changeDir, operation);
  let root: string | DiffResult;
  if (typeof change === "string")
    root = await repositoryRoot(runtime, operation, change);
  else if (change === undefined)
    root = await repositoryRoot(runtime, operation, runtime.cwd());
  else return change;
  if (typeof root !== "string") return root;
  const base = await fullCommit(runtime, operation, root, args.base, "BASE");
  return typeof base === "string" ? { root, base } : base;
};

const packageBase = async (
  args: BaseDiffArguments,
  runtime: DiffRuntime,
): Promise<DiffResult> => {
  const resolved = await baseForArguments(args, runtime);
  if ("exitCode" in resolved) return resolved;
  const head = await fullCommit(
    runtime,
    args.mode,
    resolved.root,
    "HEAD",
    "cannot resolve HEAD",
  );
  if (typeof head !== "string") return head;
  const ancestor = await runtime.git.isAncestor(
    resolved.root,
    resolved.base,
    head,
  );
  if (ancestor.status !== 0)
    return commandError(
      args.mode,
      `BASE is not an ancestor of HEAD: ${resolved.base}`,
      ancestor,
    );
  if (resolved.base === head)
    return negative(
      args.mode,
      `BASE equals HEAD (${resolved.base}) — nothing has been committed since --record`,
    );
  return packageRange(
    runtime,
    args.mode,
    resolved.root,
    resolved.base,
    head,
    "explicit-base",
    args.out,
  );
};

const packageWholeChange = async (
  args: WholeChangeDiffArguments,
  runtime: DiffRuntime,
): Promise<DiffResult> => {
  const root = await repositoryRoot(runtime, args.mode, runtime.cwd());
  if (typeof root !== "string") return root;
  const ref = args.targetBranch;
  if (!isFullTargetBranchReference(ref))
    return failure("whole-change", "requires an explicit full --target-branch reference");
  const targetCommit = await fullCommit(
    runtime,
    args.mode,
    root,
    ref,
    "target branch",
  );
  if (typeof targetCommit !== "string") return targetCommit;
  const head = await fullCommit(
    runtime,
    args.mode,
    root,
    "HEAD",
    "cannot resolve HEAD",
  );
  if (typeof head !== "string") return head;
  const merge = await runtime.git.mergeBase(root, targetCommit, head);
  if (!successful(merge))
    return commandError(
      args.mode,
      `cannot compute merge-base against ${ref}`,
      merge,
    );
  const base = text(merge);
  if (!/^[0-9a-f]{40}$/.test(base))
    return failure(args.mode, `cannot compute merge-base against ${ref}`);
  if (base === head)
    return negative(
      args.mode,
      `HEAD is at the merge-base with ${ref} — this branch has no commits to review`,
    );
  const packaged = await packageRange(
    runtime,
    args.mode,
    root,
    base,
    head,
    "whole-change",
    args.out,
  );
  if (packaged.exitCode !== 0) return packaged;
  return result(
    args.mode,
    "success",
    0,
    `target-branch: ${ref}\n${packaged.stdout}`,
  );
};

export const DIFF_RUNTIME = Symbol("DIFF_RUNTIME");

@Injectable()
export class DiffService {
  constructor(@Inject(DIFF_RUNTIME) private readonly runtime: DiffRuntime) {}

  async execute(args: DiffArguments): Promise<DiffResult> {
    const runtime = this.runtime;
    if (args.mode === "record") return recordCheckpoint(args, runtime);
    if (args.mode === "task") return packageTask(args, runtime);
    if (args.mode === "base") return packageBase(args, runtime);
    if (args.changeDir !== undefined)
      return failure(
        args.mode,
        "--change-dir is meaningless with --whole-change",
      );
    return packageWholeChange(args, runtime);
  }
}

export const renderDiffResult = (diffResult: DiffResult): string =>
  diffResult.stdout.trimEnd() === ""
    ? diffResult.stderr.trimEnd()
    : diffResult.stdout.trimEnd();
