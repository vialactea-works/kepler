import { Inject, Injectable } from "@nestjs/common";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createArtifactReader,
  type ArtifactFileSystem,
  type ArtifactReadResult,
  type RecognizedArtifact,
} from "./artifact-reader.js";
import {
  validateArtifact,
  type ArtifactContractResult,
} from "./artifact-contracts.js";
import {
  progressLedgerMatches,
  readVisiblePlanTaskHeadings,
  resolveRouteReferences,
  taskBreakdownDigestFromDefinitions,
} from "./artifact-body.js";
import type {
  LegacyInputConfirmation,
  PlanContractProjection,
  PlanExecutionContract,
  PlanExecutionTransitionContract,
  PlanInputImpactContract,
  PlanTaskContract,
  ReviewPassEvidence,
} from "./artifact-types.js";
import { inspectExecutionTransition, inspectInputImpact, type PlanHistoryRuntime } from "./plan-history.js";
import { legacyCompletedDefinitionProblems, legacyInputConfirmationMetadataProblems } from "./legacy-input-confirmation.js";
import {
  readTaskFeedbackRanges,
  resolveTaskCheckpoint,
  type TaskCheckpointGit,
  type TaskFeedbackRange,
} from "./task-checkpoint.js";
import { parseReviewPasses } from "./review-passes.js";
import type { ProcessPort, ProcessResult } from "./runtime.js";
import { resolveProjectDataPath } from "./project-data-path.js";

export interface ContextArguments {
  readonly changeDir?: string;
  readonly all?: boolean;
  readonly inputPaths?: readonly string[];
}

export type ContextFormat =
  | "split"
  | "pre-plan"
  | "legacy-unsupported"
  | "invalid";
export type ContextStanding =
  | "fresh"
  | "stale"
  | "malformed"
  | "absent"
  | "uncommitted"
  | "not reviewed";

export interface ContextFileSystemPort extends ArtifactFileSystem {
  readonly pathExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly directoryExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly realpath: (sourcePath: string) => string | Promise<string>;
  readonly readDirectory: (
    sourcePath: string,
  ) => readonly string[] | Promise<readonly string[]>;
  readonly modificationTime: (sourcePath: string) => number | Promise<number>;
}

export interface ContextGitPort {
  readonly repositoryRoot: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly currentHead: (cwd: string) => ProcessResult | Promise<ProcessResult>;
  readonly firstParent: (
    cwd: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly resolveCommit: (
    cwd: string,
    reference: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly isAncestor: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly headBlob: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly blobIdAt: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistory: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistoryAt: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly treeEntry: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistorySince: (
    cwd: string,
    base: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly fileAt: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly worktreeBlob: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly stagedDiff: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly latestCommit: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly commitFiles: (
    cwd: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly latestMaterialCommit: (
    cwd: string,
    changePath: string,
    taskPaths: readonly string[],
  ) => ProcessResult | Promise<ProcessResult>;
  readonly statusPorcelain: (cwd: string) => ProcessResult | Promise<ProcessResult>;
}

export interface ContextRuntime {
  readonly cwd: () => string;
  readonly fileSystem: ContextFileSystemPort;
  readonly git: ContextGitPort;
}

export interface ContextRuntimeOverrides {
  readonly cwd?: () => string;
  readonly process?: ProcessPort;
  readonly fileSystem?: ContextFileSystemPort;
  readonly git?: ContextGitPort;
}

export interface ContextPlanContractData {
  readonly version: 1;
  readonly repository: string | null;
  readonly taskBreakdownDigest: string;
  readonly recordedInitialization: {
    readonly base: string;
    readonly authority: string;
    readonly breakdown: string;
    readonly taskIds: readonly number[];
  } | null;
  readonly tasks: readonly {
    readonly id: number;
    readonly title: string;
    readonly taskDefinitionDigest: string;
    readonly goal?: string;
    readonly acceptance?: readonly string[];
    readonly dependsOn: readonly number[];
    readonly recordedInputContext: {
      readonly repository: string;
      readonly intentCommit: string;
      readonly taskDefinition: string;
      readonly impactPlanCommit: string | null;
      readonly inputs: readonly { readonly path: string; readonly blob: string }[];
      } | null;
    readonly legacyCurrentConfirmation?: LegacyInputConfirmation & {
      readonly standing:
        | "legacy-current-confirmed"
        | "legacy-confirmation-stale"
        | "unavailable";
    };
  }[];
  readonly inputs: readonly {
    readonly path: string;
    readonly requested: boolean;
    readonly recordedBy: readonly { readonly task: number; readonly blob: string }[];
    readonly legacyCurrentConfirmationBy?: readonly {
      readonly task: number;
      readonly blob: string;
      readonly standing:
        | "legacy-current-confirmed"
        | "legacy-confirmation-stale"
        | "unavailable";
    }[];
    readonly currentHeadBlob: string | null;
    readonly headAvailable: boolean;
    readonly currentWorktreeBlob: string | null;
    readonly worktreeAvailable: boolean;
  }[];
}

export interface ContextChange {
  readonly name: string;
  readonly path: string;
  readonly format: ContextFormat;
  readonly artifacts: readonly string[];
  readonly diagnostics?: readonly string[];
  readonly artifactDetails?: Readonly<
    Record<string, { readonly lines: number; readonly header: string }>
  >;
  readonly requirements: readonly string[];
  readonly planContractData?: ContextPlanContractData;
  readonly routeUnit?: string;
  readonly routeUnitRevision?: string;
  readonly tasks?: { readonly done: number; readonly total: number };
  readonly identityOrder?: readonly number[];
  readonly execution?: PlanExecutionContract;
  readonly executionOrder?: readonly number[];
  readonly executionTransition?: PlanExecutionTransitionContract;
  readonly inputImpact?: PlanInputImpactContract;
  readonly inputImpactStanding?: {
    readonly status: "verified" | "uncommitted" | "blocked";
    readonly reasons: readonly string[];
    readonly unaffectedInputs?: ReadonlyMap<string, ReadonlySet<number>>;
  };
  readonly executionTransitionStanding?: {
    readonly status: "verified" | "uncommitted" | "blocked";
    readonly reasons: readonly string[];
  };
  readonly critiqueDisposition?: string;
  readonly intentStanding?: "tactical" | "approval-required" | "approved-reference" | "stale";
  readonly scaffoldRecovery?: {
    readonly status: "eligible" | "blocked";
    readonly reasons: readonly string[];
  };
  readonly taskStates?: readonly {
    readonly task: string;
    readonly status: string;
    readonly feedback: string;
  }[];
  readonly taskInputs?: readonly {
    readonly task: number;
    readonly status:
      | "current"
      | "stale"
      | "missing"
      | "impact-reviewed-unaffected"
      | "legacy-current-confirmed"
      | "legacy-confirmation-stale";
    readonly changedPaths: readonly string[];
  }[];
  readonly wholeReview?: ContextStanding | string;
  readonly lastModified: number;
}

export type ContextResultStatus = "success" | "negative" | "error";

export interface ContextResult {
  readonly _tag: "ContextResult";
  readonly operation: "one" | "all";
  readonly status: ContextResultStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
  readonly lines: readonly string[];
  readonly lastLine: string;
  readonly changes: readonly ContextChange[];
}

const ARTIFACTS = [
  "proposal.md",
  "design.md",
  "plan.md",
  "progress.md",
  "review.md",
  "finish.md",
  "critique.md",
] as const;
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

const productionFileSystem: ContextFileSystemPort = {
  readFile: (sourcePath) => Fs.readFile(sourcePath, "utf8"),
  pathExists: async (sourcePath) => {
    try {
      await Fs.lstat(sourcePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  },
  directoryExists: async (sourcePath) => {
    try {
      return (await Fs.stat(sourcePath)).isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  },
  realpath: (sourcePath) => Fs.realpath(sourcePath),
  readDirectory: async (sourcePath) => Fs.readdir(sourcePath),
  modificationTime: async (sourcePath) => (await Fs.stat(sourcePath)).mtimeMs,
};

const createGitPort = (processPort: ProcessPort): ContextGitPort => ({
  repositoryRoot: (cwd) =>
    processPort.run("git", ["rev-parse", "--show-toplevel"], cwd),
  currentHead: (cwd) => processPort.run("git", ["rev-parse", "HEAD"], cwd),
  firstParent: (cwd, commit) =>
    processPort.run("git", ["rev-parse", `${commit}^`], cwd),
  resolveCommit: (cwd, reference) =>
    processPort.run(
      "git",
      ["rev-parse", "--verify", `${reference}^{commit}`],
      cwd,
    ),
  isAncestor: (cwd, base, head) =>
    processPort.run("git", ["merge-base", "--is-ancestor", base, head], cwd),
  headBlob: (cwd, sourcePath) =>
    processPort.run("git", ["rev-parse", `HEAD:${sourcePath}`], cwd),
  blobIdAt: (cwd, commit, sourcePath) =>
    processPort.run("git", ["rev-parse", "--verify", `${commit}:${sourcePath}`], cwd),
  pathHistory: (cwd, sourcePath) =>
    processPort.run("git", ["log", "--format=%H", "HEAD", "--", sourcePath], cwd),
  pathHistoryAt: (cwd, commit, sourcePath) =>
    processPort.run("git", ["log", "--format=%H", commit, "--", sourcePath], cwd),
  treeEntry: (cwd, commit, sourcePath) =>
    processPort.run("git", ["ls-tree", commit, "--", sourcePath], cwd),
  pathHistorySince: (cwd, base, sourcePath) =>
    processPort.run("git", ["log", "--format=%H", `${base}..HEAD`, "--", sourcePath], cwd),
  fileAt: (cwd, commit, sourcePath) =>
    processPort.run("git", ["show", `${commit}:${sourcePath}`], cwd),
  worktreeBlob: (cwd, sourcePath) =>
    processPort.run("git", ["hash-object", "--", sourcePath], cwd),
  stagedDiff: (cwd, sourcePath) =>
    processPort.run(
      "git",
      ["diff", "--cached", "--quiet", "HEAD", "--", sourcePath],
      cwd,
    ),
  latestCommit: (cwd, sourcePath) =>
    processPort.run(
      "git",
      ["log", "-1", "--format=%H", "HEAD", "--", sourcePath],
      cwd,
    ),
  commitFiles: (cwd, commit) =>
    processPort.run(
      "git",
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit],
      cwd,
    ),
  latestMaterialCommit: (cwd, changePath, taskPaths) =>
    processPort.run(
      "git",
      [
        "log",
        "-1",
        "--format=%H",
        "HEAD",
        "--",
        ".",
        `:(exclude)${changePath}/progress.md`,
        `:(exclude)${changePath}/review.md`,
        `:(exclude)${changePath}/finish.md`,
        ...taskPaths.flatMap((path) => [
          `:(exclude)${path}`,
          `:(exclude)${path.replace(/progress\.md$/, "feedback.md")}`,
        ]),
      ],
      cwd,
    ),
  statusPorcelain: (cwd) =>
    processPort.run("git", ["status", "--porcelain=v1", "--untracked-files=all"], cwd),
});

export const createContextRuntime = (
  overrides: ContextRuntimeOverrides = {},
): ContextRuntime => {
  const processPort = overrides.process ?? productionProcess;
  return {
    cwd: overrides.cwd ?? (() => process.cwd()),
    fileSystem: overrides.fileSystem ?? productionFileSystem,
    git: overrides.git ?? createGitPort(processPort),
  };
};

const linesOf = (stdout: string): readonly string[] =>
  stdout.split("\n").filter((line) => line !== "");
const text = (result: ProcessResult): string => result.stdout.trim();
const successful = (result: ProcessResult): boolean => result.status === 0;
const result = (
  operation: "one" | "all",
  status: ContextResultStatus,
  exitCode: 0 | 1 | 2,
  stdout = "",
  stderr = "",
  changes: readonly ContextChange[] = [],
): ContextResult => {
  const lines = linesOf(stdout);
  return {
    _tag: "ContextResult",
    operation,
    status,
    exitCode,
    stdout,
    stderr,
    lines,
    lastLine: lines.at(-1) ?? "",
    changes,
  };
};
const failure = (operation: "one" | "all", message: string): ContextResult =>
  result(operation, "error", 2, "", `error: ${message}\n`);

const stripComments = (source: string): string =>
  source
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, " "))
    .replace(/<!--?[\s\S]*$/g, (comment) => comment.replace(/[^\r\n]/g, " "));
const bodyOf = (source: string, artifact?: ArtifactReadResult): string =>
  artifact?._tag === "recognized" ? artifact.body : stripComments(source);
const firstHeader = (source: string): string => {
  const match = stripComments(source).match(
    /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m,
  );
  return match?.[1]?.trim() ?? "";
};
const lineCount = (source: string): number =>
  source === ""
    ? 0
    : source.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(source) ? 1 : 0);
const fullCommit = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = async (
  runtime: ContextRuntime,
  path: string,
): Promise<string | ContextResult> => {
  try {
    return await runtime.fileSystem.readFile(path);
  } catch (error) {
    return failure("one", `cannot read ${path}: ${String(error)}`);
  }
};

const readArtifact = async (
  runtime: ContextRuntime,
  path: string,
): Promise<
  | { readonly source: string; readonly artifact: ArtifactReadResult }
  | ContextResult
> => {
  const source = await read(runtime, path);
  if (typeof source !== "string") return source;
  const reader = createArtifactReader({ readFile: () => source });
  return { source, artifact: await reader(path) };
};

const planTasks = (
  projection: PlanContractProjection | undefined,
  source: string,
):
  | {
      readonly task: string;
      readonly title: string;
      readonly abandoned: boolean;
    }[]
  | undefined => {
  const visibleTasks = projection?.tasks.map((task) => ({ id: task.id, title: task.title }))
    ?? readVisiblePlanTaskHeadings(source);
  return visibleTasks?.map((task) => ({
    task: String(task.id),
    title: task.title,
    abandoned: /\(abandoned — .+\)$/.test(task.title),
  }));
};

const safeRepositoryPath = (value: string): boolean =>
  value !== "" &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

const contextTaskCheckpointGit = (runtime: ContextRuntime): TaskCheckpointGit => ({
  pathHistory: (root, path) => runtime.git.pathHistory(root, path),
  blobAt: (root, commit, path) => runtime.git.fileAt(root, commit, path),
  firstParent: (root, commit) => runtime.git.firstParent(root, commit),
  resolveCommit: (root, reference) => runtime.git.resolveCommit(root, reference),
  isAncestor: (root, base, head) => runtime.git.isAncestor(root, base, head),
});

const inspectLegacyInputConfirmation = async (
  runtime: ContextRuntime,
  root: string,
  changeDir: string,
  task: PlanTaskContract,
  plan: PlanContractProjection,
  repositoryIdentity: string | undefined,
  inputImpactStanding: ContextChange["inputImpactStanding"],
): Promise<readonly string[]> => {
  const confirmation = plan.legacyInputConfirmations?.find((entry) => entry.task === task.id);
  if (!confirmation) return [];
  const problems = new Set<string>();
  let checkpointVerified = false;
  if (repositoryIdentity === undefined || confirmation.repository !== repositoryIdentity)
    problems.add("repository");
  if (confirmation.taskDefinition !== task.definitionDigest)
    problems.add("task definition");
  for (const problem of legacyInputConfirmationMetadataProblems(confirmation))
    problems.add(problem);
  const currentHead = text(await runtime.git.currentHead(root));
  if (!fullCommit(currentHead)) problems.add("current HEAD");
  const planPath = Path.join(relative(root, changeDir), "plan.md");
  const planHead = await runtime.git.headBlob(root, planPath);
  const planWorktree = await runtime.git.worktreeBlob(root, planPath);
  const planIndex = await runtime.git.stagedDiff(root, planPath);
  if (
    !successful(planHead) ||
    !successful(planWorktree) ||
    !successful(planIndex) ||
    text(planHead) !== text(planWorktree) ||
    planIndex.status !== 0
  )
    problems.add("confirmation plan is not committed exactly at HEAD");
  const taskProgressRelativePath = Path.join(
    relative(root, changeDir),
    "tasks",
    `task-${task.id}`,
    "progress.md",
  );
  const taskProgressPath = Path.join(root, taskProgressRelativePath);
  const implementation = text(await runtime.git.latestCommit(root, taskProgressRelativePath));
  if (!fullCommit(implementation)) {
    problems.add("historical implementation");
  } else {
    const historicalSource = await runtime.git.fileAt(root, implementation, planPath);
    const historicalRead = successful(historicalSource)
      ? await createArtifactReader({ readFile: () => text(historicalSource) })(planPath)
      : undefined;
    const historical = historicalRead ? validateArtifact(historicalRead) : undefined;
    const historicalPlan =
      historical?._tag === "valid" && historical.artifact === "plan"
        ? historical.body.workflow.plan
        : undefined;
    const historicalTask = historicalPlan?.tasks.find((entry) => entry.id === task.id);
    if (
      !historicalTask ||
      historicalTask.inputContext !== undefined ||
      historicalTask.definitionDigest !== task.definitionDigest
    )
      problems.add("historical task contract or provenance");
    const refs = new Set([
      ...(historicalPlan?.intentApprovals ?? []),
      ...plan.intentApprovals,
    ].map((entry) => entry.path));
    for (const path of refs) {
      const before = historicalPlan?.intentApprovals.find((entry) => entry.path === path);
      const current = plan.intentApprovals.find((entry) => entry.path === path);
      if (before?.commit === current?.commit && before?.reference === current?.reference) continue;
      const repoPath = relative(root, Path.resolve(changeDir, path));
      if (
        inputImpactStanding?.status !== "verified" ||
        inputImpactStanding.unaffectedInputs?.get(repoPath)?.has(task.id) !== true
      )
        problems.add(`changed approval ${path}`);
    }
  }
  if (!(await durableArtifact(runtime, root, taskProgressPath)))
    problems.add("task progress is not committed exactly at HEAD");
  const feedbackPath = Path.join(changeDir, "tasks", `task-${task.id}`, "feedback.md");
  let feedbackRanges: readonly TaskFeedbackRange[] = [];
  if (await runtime.fileSystem.pathExists(feedbackPath)) {
    if (!(await durableArtifact(runtime, root, feedbackPath))) {
      problems.add("task feedback is not committed exactly at HEAD");
    } else {
      const feedback = await readArtifact(runtime, feedbackPath);
      if ("exitCode" in feedback) {
        problems.add("task feedback history is unavailable");
      } else {
        const parsedRanges = await readTaskFeedbackRanges(
          feedbackPath,
          feedback.source,
          Path.basename(changeDir),
          task.id,
        );
        if (parsedRanges.kind === "valid") feedbackRanges = parsedRanges.ranges;
        else problems.add(`task feedback range is unverified: ${parsedRanges.reason}`);
      }
    }
  }
  if (fullCommit(currentHead)) {
    const checkpoint = await resolveTaskCheckpoint(
      contextTaskCheckpointGit(runtime),
      root,
      taskProgressRelativePath,
      task.id,
      Path.basename(changeDir),
      currentHead,
      feedbackRanges,
    );
    if (checkpoint.kind !== "verified")
      problems.add(`historical task/Base/range identity is unverified: ${checkpoint.kind === "unverified" ? checkpoint.reason : "no committed task attempt exists"}`);
    else checkpointVerified = true;
  }
  if (plan.inputImpact && inputImpactStanding?.status !== "verified")
    problems.add("input impact history");
  for (const impact of plan.inputImpact?.changes ?? [])
    if (impact.affectedTasks.includes(task.id)) problems.add(`affected input ${impact.path}`);
  const inputsByPath = new Map(confirmation.inputs.map((input) => [input.path, input.blob]));
  const intentIsCommit = fullCommit(confirmation.intentCommit);
  if (plan.intentApprovals.length > 0 && !intentIsCommit)
    problems.add("formal approval revision");
  if (
    plan.intentApprovals.length === 0 &&
    confirmation.intentCommit !== `tactical:${confirmation.ownerReference}`
  )
    problems.add("tactical authority reference");
  if (intentIsCommit) {
    const resolved = await runtime.git.resolveCommit(root, confirmation.intentCommit);
    if (
      !successful(resolved) ||
      text(resolved) !== confirmation.intentCommit ||
      !fullCommit(currentHead) ||
      !successful(await runtime.git.isAncestor(root, confirmation.intentCommit, currentHead))
    )
      problems.add("intent revision");
  }
  for (const input of confirmation.inputs) {
    if (!safeRepositoryPath(input.path)) {
      problems.add(`unsafe input ${input.path}`);
      continue;
    }
    const head = await runtime.git.headBlob(root, input.path);
    const working = await runtime.git.worktreeBlob(root, input.path);
    const staged = await runtime.git.stagedDiff(root, input.path);
    if (
      !successful(head) ||
      !successful(working) ||
      !successful(staged) ||
      text(head) !== input.blob ||
      text(working) !== input.blob ||
      staged.status !== 0
    )
      problems.add(input.path);
    if (intentIsCommit) {
      const selected = await runtime.git.blobIdAt(root, confirmation.intentCommit, input.path);
      if (!successful(selected) || text(selected) !== input.blob)
        problems.add(`intent revision input ${input.path}`);
    }
  }
  for (const reference of plan.intentApprovals) {
    const repoPath = relative(root, Path.resolve(changeDir, reference.path));
    const blob = inputsByPath.get(repoPath);
    if (blob === undefined) {
      problems.add(`approved input ${repoPath}`);
      continue;
    }
    const approved = await runtime.git.blobIdAt(root, reference.commit, repoPath);
    const current = await runtime.git.headBlob(root, repoPath);
    if (
      !successful(approved) ||
      !successful(current) ||
      text(approved) !== blob ||
      text(current) !== blob
    )
      problems.add(`approved input ${repoPath}`);
    if (intentIsCommit) {
      const ancestor = await runtime.git.isAncestor(root, reference.commit, confirmation.intentCommit);
      const selected = await runtime.git.blobIdAt(root, confirmation.intentCommit, repoPath);
      if (!successful(ancestor) || !successful(selected) || text(selected) !== blob)
        problems.add(`approval revision ${repoPath}`);
    }
  }
  if (checkpointVerified && problems.size === 0) {
    const frozenProblems = await legacyCompletedDefinitionProblems(
      contextTaskCheckpointGit(runtime),
      root,
      taskProgressRelativePath,
      planPath,
      Path.basename(changeDir),
      task.id,
      task.definitionDigest,
    );
    for (const problem of frozenProblems) problems.add(problem);
  }
  return [...problems];
};

const contextHistoryRuntime = (runtime: ContextRuntime): PlanHistoryRuntime => ({
  pathExists: (path) => runtime.fileSystem.pathExists(path),
  git: { ...runtime.git, blobAt: (cwd, commit, path) => runtime.git.fileAt(cwd, commit, path) },
});

const inspectContextExecutionTransition = async (
  runtime: ContextRuntime,
  root: string,
  changeDir: string,
  planArtifact: ArtifactReadResult,
): Promise<ContextChange["executionTransitionStanding"]> => {
  const planContract =
    planArtifact._tag === "recognized" ? metadataContract(planArtifact) : undefined;
  const projection =
    planContract?._tag === "valid" ? planContract.body.workflow.plan : undefined;
  if (!projection || planContract?._tag !== "valid") return undefined;
  const hasExecution = projection.execution !== undefined;
  const planPath = relative(root, Path.join(changeDir, "plan.md"));
  const headBlob = await runtime.git.headBlob(root, planPath);
  const worktreeBlob = await runtime.git.worktreeBlob(root, planPath);
  const staged = await runtime.git.stagedDiff(root, planPath);
  const durable =
    successful(headBlob) &&
    successful(worktreeBlob) &&
    text(headBlob) === text(worktreeBlob) &&
    successful(staged);
  if (!durable) {
    if (!hasExecution && !projection.executionTransition) return undefined;
    return {
      status: "uncommitted",
      reasons: ["explicit execution metadata is not committed with plan.md"],
    };
  }
  const reasons = await inspectExecutionTransition(contextHistoryRuntime(runtime), root, changeDir, planContract);
  return { status: reasons.length === 0 ? "verified" : "blocked", reasons };
};

const inspectContextInputImpact = async (
  runtime: ContextRuntime,
  root: string,
  changeDir: string,
  projection: PlanContractProjection,
): Promise<ContextChange["inputImpactStanding"]> => {
  if (!projection.inputImpact && !projection.tasks.some((task) => task.inputContext?.impactPlanCommit !== undefined))
    return undefined;
  const inspection = await inspectInputImpact(contextHistoryRuntime(runtime), root, changeDir, projection);
  return { status: inspection.problems.length === 0 ? "verified" : "blocked", reasons: inspection.problems, unaffectedInputs: inspection.unaffectedInputs };
};

const inspectInitialScaffoldRecovery = async (
  runtime: ContextRuntime,
  changeDir: string,
  planArtifact: ArtifactReadResult,
): Promise<ContextChange["scaffoldRecovery"]> => {
  const planContract =
    planArtifact._tag === "recognized" ? metadataContract(planArtifact) : undefined;
  const plan =
    planContract?._tag === "valid" ? planContract.body.workflow.plan : undefined;
  const proof = plan?.initialization;
  if (!proof || !plan) return undefined;
  const reasons: string[] = [];
  const rootResult = await runtime.git.repositoryRoot(changeDir);
  const root = text(rootResult);
  const headResult = successful(rootResult)
    ? await runtime.git.currentHead(root)
    : { status: 1, stdout: "", stderr: "" };
  const head = text(headResult);
  const resolved = fullCommit(proof.base)
    ? await runtime.git.resolveCommit(root, proof.base)
    : { status: 1, stdout: "", stderr: "" };
  if (
    !successful(rootResult) ||
    !successful(headResult) ||
    !fullCommit(head) ||
    !successful(resolved) ||
    text(resolved) !== proof.base
  )
    reasons.push("original initialization revision is missing or unresolvable");
  else if (!successful(await runtime.git.isAncestor(root, proof.base, head)))
    reasons.push("original initialization revision is not an ancestor of HEAD");
  if (!successful(rootResult) || !fullCommit(proof.base))
    return { status: "blocked", reasons };
  const changePath = relative(root, changeDir);
  const baselineArtifacts = [
    `${changePath}/plan.md`,
    `${changePath}/progress.md`,
    ...proof.taskIds.flatMap((task) => [
      `${changePath}/tasks/task-${task}/progress.md`,
      `${changePath}/tasks/task-${task}/feedback.md`,
    ]),
  ];
  const scaffoldCommits = new Set<string>();
  let hasDirectInitializationCommit = false;
  let initialPlanCommit: string | undefined;
  const planPath = `${changePath}/plan.md`;
  for (const path of baselineArtifacts) {
    if (!successful(await runtime.git.stagedDiff(root, path)))
      reasons.push(`staged scaffold state requires owner reconciliation: ${path}`);
    if (successful(await runtime.git.blobIdAt(root, proof.base, path)))
      reasons.push(`initialization revision already contains ${path}`);
    const pathHistory = await runtime.git.pathHistory(root, path);
    if (!successful(pathHistory)) {
      reasons.push(`history for ${path} cannot be verified`);
      continue;
    }
    const postBase: string[] = [];
    for (const commit of text(pathHistory).split("\n").filter(Boolean)) {
      if (successful(await runtime.git.isAncestor(root, commit, proof.base))) {
        reasons.push(`${path} has history before the authorized initialization revision`);
        continue;
      }
      postBase.push(commit);
      scaffoldCommits.add(commit);
      const parent = await runtime.git.firstParent(root, commit);
      if (successful(parent) && text(parent) === proof.base)
        hasDirectInitializationCommit = true;
    }
    if (path === planPath) initialPlanCommit = postBase.at(-1);
  }
  const initialPlanSource = initialPlanCommit
    ? await runtime.git.fileAt(root, initialPlanCommit, planPath)
    : { status: 1, stdout: "", stderr: "missing initial plan revision" };
  const initialPlanRead = successful(initialPlanSource)
    ? await createArtifactReader({ readFile: () => text(initialPlanSource) })(planPath)
    : undefined;
  const initialPlanContract = initialPlanRead
    ? metadataContract(initialPlanRead)
    : undefined;
  const historicalInitialPlan =
    initialPlanContract?._tag === "valid" && initialPlanContract.artifact === "plan"
      ? initialPlanContract.body.workflow.plan
      : undefined;
  const uncommittedFirstInitialization =
    initialPlanCommit === undefined &&
    scaffoldCommits.size === 0 &&
    head === proof.base;
  const initialPlan = historicalInitialPlan ??
    (uncommittedFirstInitialization ? plan : undefined);
  const initialContract = initialPlanContract?._tag === "valid"
    ? initialPlanContract
    : uncommittedFirstInitialization && planContract?._tag === "valid"
      ? planContract
      : undefined;
  const initialTitle = initialContract?.body.headings
    .find((heading) => heading.level === 1)?.text.slice("Plan: ".length);
  if (
    !initialPlan?.initialization ||
    initialPlan.initialization.base !== proof.base ||
    initialPlan.initialization.authority !== proof.authority ||
    initialPlan.initialization.breakdown !== proof.breakdown ||
    JSON.stringify(initialPlan.initialization.taskIds) !== JSON.stringify(proof.taskIds) ||
    JSON.stringify(initialPlan.identityOrder) !== JSON.stringify(proof.taskIds)
  )
    reasons.push("initial plan revision does not contain the recorded initialization proof");
  else if (
    proof.taskIds.some((taskId) => {
      const task = initialPlan.tasks.find((entry) => entry.id === taskId);
      return !task || /\(abandoned — .+\)$/.test(task.title);
    })
  )
    reasons.push("initial plan revision does not contain every active task");
  else if (
    initialPlan.execution?.version !== 2 &&
    proof.taskIds.some((taskId) => !initialPlan.tasks.find((entry) => entry.id === taskId)?.filesDeclared)
  )
    reasons.push("initial plan revision does not contain active tasks with explicit Files scopes");
  else if (
    taskBreakdownDigestFromDefinitions(proof.taskIds, initialPlan.tasks) !== proof.breakdown
  )
    reasons.push("initial plan task definitions do not match the recorded breakdown");
  if (
    historicalInitialPlan &&
    (JSON.stringify(plan.identityOrder) !== JSON.stringify(historicalInitialPlan.identityOrder) ||
      JSON.stringify(plan.execution) !== JSON.stringify(historicalInitialPlan.execution) ||
      JSON.stringify(plan.executionOrder) !== JSON.stringify(historicalInitialPlan.executionOrder) ||
      JSON.stringify(plan.tasks) !== JSON.stringify(historicalInitialPlan.tasks) ||
      JSON.stringify(plan.executionTransition) !== JSON.stringify(historicalInitialPlan.executionTransition) ||
      JSON.stringify(plan.inputImpact) !== JSON.stringify(historicalInitialPlan.inputImpact) ||
      JSON.stringify(plan.intentApprovals) !== JSON.stringify(historicalInitialPlan.intentApprovals))
  )
    reasons.push("amended plan cannot use initial-scaffold recovery");
  if (
    (scaffoldCommits.size === 0 && head !== proof.base) ||
    (scaffoldCommits.size > 0 && !hasDirectInitializationCommit)
  )
    reasons.push("initialization revision is not the HEAD immediately before initial scaffold history");
  const approvalReferences = plan.intentApprovals ?? [];
  const referencedFormalPaths = new Set<string>();
  for (const reference of approvalReferences) {
    if (!safeRepositoryPath(reference.path)) {
      reasons.push(`formal intent reference has an unsafe path: ${reference.path}`);
      continue;
    }
    const sourcePath = Path.resolve(changeDir, reference.path);
    const repositoryPath = relative(root, sourcePath);
    referencedFormalPaths.add(repositoryPath);
    const formal = await readArtifact(runtime, sourcePath);
    const formalContract =
      "exitCode" in formal ? undefined : metadataContract(formal.artifact);
    const commit = await runtime.git.resolveCommit(root, reference.commit);
    const committedBlob = await runtime.git.blobIdAt(root, reference.commit, repositoryPath);
    const currentBlob = await runtime.git.blobIdAt(root, head, repositoryPath);
    const workingBlob = await runtime.git.worktreeBlob(root, repositoryPath);
    if (
      formalContract?._tag !== "valid" ||
      formalContract.metadata.status !== "approved" ||
      formalContract.metadata.decision !== "accepted" ||
      !successful(commit) ||
      text(commit) !== reference.commit ||
      !successful(await runtime.git.isAncestor(root, reference.commit, head)) ||
      !successful(committedBlob) ||
      !successful(currentBlob) ||
      !successful(workingBlob) ||
      text(committedBlob) !== text(currentBlob) ||
      text(committedBlob) !== text(workingBlob) ||
      !successful(await runtime.git.stagedDiff(root, repositoryPath))
    )
      reasons.push(`formal intent reference is not a current committed approval: ${reference.path}`);
  }
  const formalPaths = [
    Path.join(changeDir, "proposal.md"),
    Path.join(changeDir, "design.md"),
  ];
  const requirementsDir = Path.join(changeDir, "requirements");
  if (await runtime.fileSystem.directoryExists(requirementsDir))
    for (const name of await runtime.fileSystem.readDirectory(requirementsDir))
      if (name.endsWith(".md")) formalPaths.push(Path.join(requirementsDir, name));
  for (const formalPath of formalPaths)
    if (
      (await runtime.fileSystem.pathExists(formalPath)) &&
      !referencedFormalPaths.has(relative(root, formalPath))
    )
      reasons.push(`formal input lacks a committed approval reference: ${relative(root, formalPath)}`);
  const rootProgressIsPending = async (source: string): Promise<boolean> => {
    const artifact = await createArtifactReader({ readFile: () => source })(Path.join(changeDir, "progress.md"));
    const contract = metadataContract(artifact);
    const records =
      contract?._tag === "valid"
        ? contract.body.workflow.records.filter((record) => record.kind === "task")
        : [];
    return (
      contract?._tag === "valid" &&
      contract.artifact === "progress" &&
      contract.metadata.change === Path.basename(changeDir) &&
      contract.body.headings.find((heading) => heading.level === 1)?.text ===
        `Progress: ${initialTitle}` &&
      progressLedgerMatches(contract.metadata.tasks, records) &&
      records.length === proof.taskIds.length &&
      records.every(
        (record, index) =>
          record.number === proof.taskIds[index] &&
          record.title === initialPlan?.tasks.find((task) => task.id === record.number)?.title &&
          record.fields.Status === "pending",
      ) &&
      Array.isArray(contract.metadata.tasks) &&
      contract.metadata.tasks.length === proof.taskIds.length &&
      contract.metadata.tasks.every(
        (entry) => isRecord(entry) && entry.status === "pending",
      )
    );
  };
  const taskProgressIsPending = async (
    source: string,
    task: number,
  ): Promise<boolean> => {
    const path = Path.join(changeDir, "tasks", `task-${task}`, "progress.md");
    const artifact = await createArtifactReader({ readFile: () => source })(path);
    const contract = metadataContract(artifact);
    return (
      contract?._tag === "valid" &&
      contract.artifact === "task-progress" &&
      contract.metadata.task === task &&
      contract.metadata.change === Path.basename(changeDir) &&
      contract.metadata.status === "pending" &&
      contract.body.headings.find((heading) => heading.level === 1)?.text ===
        `Task Progress: Task ${task} — ${initialPlan?.tasks.find((entry) => entry.id === task)?.title}` &&
      !contract.body.workflow.records.some((record) => record.kind === "attempt")
    );
  };
  const historySinceBase = async (path: string): Promise<string[]> => {
    const history = await runtime.git.pathHistorySince(root, proof.base, path);
    return successful(history) ? text(history).split("\n").filter(Boolean) : [];
  };
  const progressPath = Path.join(changeDir, "progress.md");
  const rootProgressPath = relative(root, progressPath);
  const rootProgressHistory = await historySinceBase(rootProgressPath);
  if (await runtime.fileSystem.pathExists(progressPath)) {
    const source = await read(runtime, progressPath);
    if (
      typeof source !== "string" ||
      !(await rootProgressIsPending(source))
    )
      reasons.push("present root task state is not a consistent pending initialization");
  } else if (rootProgressHistory.length > 0)
    reasons.push("root task progress has deleted history since initialization");
  const rootHistoryResult = await runtime.git.pathHistorySince(root, proof.base, rootProgressPath);
  if (!successful(rootHistoryResult))
    reasons.push("root task progress history cannot be verified");
  else
    for (const commit of text(rootHistoryResult).split("\n").filter(Boolean)) {
      const version = await runtime.git.fileAt(root, commit, rootProgressPath);
      if (!successful(version) || !(await rootProgressIsPending(text(version))))
        reasons.push("root task progress history contains non-pending state");
    }
  for (const task of plan.tasks.filter((entry) => proof.taskIds.includes(entry.id))) {
    if (!task.inputContext) reasons.push(`Task ${task.id} has no current-input handoff context`);
    else {
      if (Path.resolve(task.inputContext.repository) !== Path.resolve(root))
        reasons.push(`Task ${task.id} input context names a different repository`);
      if (fullCommit(task.inputContext.intentCommit)) {
        const intentCommit = await runtime.git.resolveCommit(root, task.inputContext.intentCommit);
        if (
          !successful(intentCommit) ||
          text(intentCommit) !== task.inputContext.intentCommit ||
          !successful(await runtime.git.isAncestor(root, task.inputContext.intentCommit, head))
        )
          reasons.push(`Task ${task.id} formal-intent revision is not current and reachable`);
      } else if (!task.inputContext.intentCommit.startsWith("tactical:"))
        reasons.push(`Task ${task.id} input context has no recognized authority revision`);
      for (const formalPath of referencedFormalPaths)
        if (!task.inputContext.inputs.some((input) => input.path === formalPath))
          reasons.push(`Task ${task.id} input context omits approved formal input ${formalPath}`);
      for (const input of task.inputContext.inputs) {
        if (!safeRepositoryPath(input.path)) {
          reasons.push(`Task ${task.id} input context contains an unsafe path`);
          continue;
        }
        const committedBlob = await runtime.git.blobIdAt(root, head, input.path);
        const currentBlob = await runtime.git.worktreeBlob(root, input.path);
        if (
          !successful(committedBlob) ||
          text(committedBlob) !== input.blob ||
          !successful(currentBlob) ||
          text(currentBlob) !== input.blob ||
          !successful(await runtime.git.stagedDiff(root, input.path))
        )
          reasons.push(`Task ${task.id} input changed since handoff: ${input.path}`);
      }
    }
    if (!task.filesDeclared && plan.execution?.version !== 2)
      reasons.push(`Task ${task.id} has no complete Files scope for partial-work inspection`);
    for (const sourcePath of task.files) {
      if (!safeRepositoryPath(sourcePath)) {
        reasons.push(`Task ${task.id} Files scope contains an unsafe repository path`);
        continue;
      }
      const history = await runtime.git.pathHistorySince(root, proof.base, sourcePath);
      if (!successful(history) || text(history) !== "")
        reasons.push(`Task ${task.id} has committed work in ${sourcePath} since initialization`);
      const baselineBlob = await runtime.git.blobIdAt(root, proof.base, sourcePath);
      const currentBlob = await runtime.git.worktreeBlob(root, sourcePath);
      if (
        successful(baselineBlob) !== successful(currentBlob) ||
        (successful(baselineBlob) && text(baselineBlob) !== text(currentBlob)) ||
        !successful(await runtime.git.stagedDiff(root, sourcePath))
      )
        reasons.push(`Task ${task.id} has partial work in ${sourcePath}`);
    }
    const taskProgressPath = Path.join(
      changeDir,
      "tasks",
      `task-${task.id}`,
      "progress.md",
    );
    const feedbackPath = Path.join(
      changeDir,
      "tasks",
      `task-${task.id}`,
      "feedback.md",
    );
    const checkpointPath = Path.join(
      changeDir,
      "tasks",
      `task-${task.id}`,
      ".base",
    );
    const feedbackHistory = await runtime.git.pathHistorySince(
      root,
      proof.base,
      relative(root, feedbackPath),
    );
    if (
      (await runtime.fileSystem.pathExists(feedbackPath)) ||
      !successful(feedbackHistory) ||
      text(feedbackHistory) !== ""
    )
      reasons.push(`Task ${task.id} already has feedback history`);
    const checkpointHistory = await runtime.git.pathHistorySince(
      root,
      proof.base,
      relative(root, checkpointPath),
    );
    if (
      (await runtime.fileSystem.pathExists(checkpointPath)) ||
      !successful(checkpointHistory) ||
      text(checkpointHistory) !== "" ||
      !successful(await runtime.git.stagedDiff(root, relative(root, checkpointPath)))
    )
      reasons.push(`Task ${task.id} has a task checkpoint or unverifiable checkpoint history`);
    const taskProgressRelative = relative(root, taskProgressPath);
    const taskProgressHistory = await runtime.git.pathHistorySince(
      root,
      proof.base,
      taskProgressRelative,
    );
    if (!successful(taskProgressHistory))
      reasons.push(`Task ${task.id} progress history cannot be verified`);
    const taskProgressCommits = successful(taskProgressHistory)
      ? text(taskProgressHistory).split("\n").filter(Boolean)
      : [];
    if (await runtime.fileSystem.pathExists(taskProgressPath)) {
      const source = await read(runtime, taskProgressPath);
      if (
        typeof source !== "string" ||
        !(await taskProgressIsPending(source, task.id))
      )
        reasons.push(`Task ${task.id} present progress is not pending and history-free`);
    } else if (taskProgressCommits.length > 0)
      reasons.push(`Task ${task.id} progress has deleted history`);
    for (const commit of taskProgressCommits) {
      const version = await runtime.git.fileAt(root, commit, taskProgressRelative);
      if (
        !successful(version) ||
        !(await taskProgressIsPending(text(version), task.id))
      )
        reasons.push(`Task ${task.id} progress history contains an attempt or invalid state`);
    }
  }
  const unscopedTasks = plan.execution?.version === 2
    ? plan.tasks.filter((task) => proof.taskIds.includes(task.id) && !task.filesDeclared)
    : [];
  if (unscopedTasks.length > 0) {
    const scopedPaths = new Set(plan.tasks.flatMap((task) => task.files));
    const excludedPaths = [
      `${changePath}/plan.md`,
      ...proof.taskIds.map((taskId) => `${changePath}/tasks/task-${taskId}/progress.md`),
      ...scopedPaths,
    ];
    const materialCommit = await runtime.git.latestMaterialCommit(root, changePath, excludedPaths);
    if (!successful(materialCommit)) {
      reasons.push("material history for dependency-mode tasks without Files scopes cannot be verified");
    } else if (text(materialCommit) !== "") {
      const commit = text(materialCommit);
      const resolvedMaterial = await runtime.git.resolveCommit(root, commit);
      const postInitialization = fullCommit(commit) &&
        successful(resolvedMaterial) &&
        text(resolvedMaterial) === commit &&
        commit !== proof.base &&
        successful(await runtime.git.isAncestor(root, proof.base, commit));
      if (postInitialization)
        reasons.push(`dependency-mode tasks without Files scopes have material history since initialization at ${commit}`);
      else if (!fullCommit(commit) || !successful(resolvedMaterial) || text(resolvedMaterial) !== commit)
        reasons.push("material history for dependency-mode tasks without Files scopes cannot be verified");
    }
    const status = await runtime.git.statusPorcelain(root);
    if (!successful(status)) {
      reasons.push("uncommitted material state for dependency-mode tasks without Files scopes cannot be verified");
    } else {
      const changePrefix = `${changePath}/`;
      for (const entry of text(status).split(/\r?\n/).filter(Boolean)) {
        const paths = entry.slice(3).split(" -> ").filter(Boolean);
        for (const path of paths)
          if (!path.startsWith(changePrefix) && !scopedPaths.has(path))
            reasons.push("task work cannot be bounded without Files scopes");
      }
    }
  }
  return { status: reasons.length === 0 ? "eligible" : "blocked", reasons };
};

const splitRow = (line: string): readonly string[] | undefined => {
  if (!/^\s*\|/.test(line)) return undefined;
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      cell += `\\${character}`;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells.map((entry) => entry.replaceAll("\\|", "|"));
};

interface LedgerRow {
  readonly task: string;
  readonly title: string;
  readonly status: string;
  readonly link: string;
}
const progressRows = (source: string): readonly LedgerRow[] | undefined => {
  const lines = stripComments(source).split(/\r\n|\n|\r/);
  const header = lines.findIndex(
    (line) => line.trim() === "| Task | Status | Progress |",
  );
  if (header < 0 || lines[header + 1] === undefined) return undefined;
  const separator = splitRow(lines[header + 1] ?? "");
  if (
    !separator ||
    separator.length !== 3 ||
    !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
  )
    return undefined;
  const rows: LedgerRow[] = [];
  for (let index = header + 2; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      if (lines.slice(index).every((entry) => entry.trim() === "")) break;
      return undefined;
    }
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (!cells || cells.length !== 3) return undefined;
    const task = /^Task ([1-9][0-9]*):[ \t]+(.+)$/.exec(cells[0] ?? "");
    const link =
      /^\[details\]\(tasks\/task-([1-9][0-9]*)\/progress\.md\)$/.exec(
        cells[2] ?? "",
      );
    if (
      !task ||
      !link ||
      link[1] !== task[1] ||
      !["pending", "in-progress", "blocked", "done"].includes(cells[1] ?? "")
    )
      return undefined;
    rows.push({
      task: task[1] ?? "",
      title: task[2] ?? "",
      status: cells[1] ?? "",
      link: cells[2] ?? "",
    });
  }
  return rows;
};

const taskAttempts = (
  source: string,
  title: string,
  task: string,
): { readonly valid: boolean; readonly outcome?: string } => {
  const visible = stripComments(source);
  const headings = [...visible.matchAll(/^##(?:[ \t]+)(.+)$/gm)];
  let expected = 1;
  let latest: string | undefined;
  if (
    !new RegExp(
      `^# Task Progress: Task ${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "m",
    ).test(visible)
  )
    return { valid: false };
  for (const heading of headings) {
    const value = heading[1] ?? "";
    const pass = /^Attempt ([1-9][0-9]*) — ([0-9]{4}-[0-9]{2}-[0-9]{2})$/.exec(
      value,
    );
    if (!pass || Number(pass[1]) !== expected) return { valid: false };
    expected += 1;
    const start = (heading.index ?? 0) + heading[0].length;
    const next = headings.find(
      (candidate) => (candidate.index ?? 0) > (heading.index ?? 0),
    );
    const section = visible.slice(start, next?.index ?? visible.length);
    const outcomes = [...section.matchAll(/^- Outcome:[ \t]*(.+)$/gm)].map(
      (match) => match[1],
    );
    if (
      outcomes.length !== 1 ||
      !["done", "blocked"].includes(outcomes[0] ?? "")
    )
      return { valid: false };
    latest = outcomes[0];
  }
  return headings.length === 0
    ? { valid: false }
    : { valid: true, outcome: latest };
};

const metadataContract = (
  artifact: ArtifactReadResult,
): ArtifactContractResult | undefined =>
  artifact._tag === "recognized" ? validateArtifact(artifact) : undefined;
const currentValid = (
  artifact: ArtifactReadResult,
): artifact is RecognizedArtifact =>
  artifact._tag === "recognized" &&
  metadataContract(artifact)?._tag === "valid";
const currentInvalid = (artifact: ArtifactReadResult): boolean =>
  artifact._tag === "invalid" ||
  (artifact._tag === "recognized" &&
    metadataContract(artifact)?._tag === "invalid");

const legacyRouteUnit = (source: string): string | null => {
  const clean = stripComments(source);
  const match =
    clean.match(/^\| *Route unit *\| *(.+?) *\|$/m) ??
    clean.match(/^- *Route unit: *(.+)$/m);
  const value = match?.[1]?.trim();
  return value && !value.startsWith("<") && value !== "null" ? value : null;
};

const routeUnit = (
  sources: ReadonlyMap<string, string>,
  inspected: ReadonlyMap<string, ArtifactReadResult>,
) => {
  const modernProfile = ["proposal.md", "plan.md"].some(
    (name) => inspected.get(name)?._tag === "recognized",
  );
  const reference = (name: string): string | null | undefined => {
    const source = sources.get(name);
    if (source === undefined) return undefined;
    const artifact = inspected.get(name);
    if (artifact?._tag === "recognized") {
      return typeof artifact.metadata.route_unit === "string"
        ? artifact.metadata.route_unit
        : null;
    }
    return !modernProfile && artifact?._tag === "unrelated"
      ? legacyRouteUnit(source)
      : null;
  };
  const proposal = reference("proposal.md");
  const hasPlan = sources.has("plan.md");
  return resolveRouteReferences(proposal, {
    present: hasPlan,
    reference: hasPlan ? reference("plan.md") ?? null : undefined,
  });
};

const validateRouteBinding = async (
  runtime: ContextRuntime,
  changeDir: string,
  reference: string,
): Promise<string | ContextResult> => {
  const match =
    /^(\.kepler\/maps\/[^/]+\/route\.md) — unit ([1-9][0-9]*)$/.exec(reference);
  if (!match)
    return failure(
      "one",
      `route binding is not a canonical route/unit reference: ${reference}`,
    );
  const routePath = match[1] ?? "";
  const unitId = Number(match[2]);
  const rootResult = await runtime.git.repositoryRoot(changeDir);
  if (!successful(rootResult))
    return failure("one", "cannot resolve the repository for the route binding");
  const root = text(rootResult);
  const absoluteRoutePath = Path.resolve(root, routePath);
  const relativeRoutePath = Path.relative(root, absoluteRoutePath);
  if (
    relativeRoutePath === "" ||
    relativeRoutePath.startsWith(`..${Path.sep}`) ||
    Path.isAbsolute(relativeRoutePath)
  )
    return failure("one", `route binding escapes the repository: ${reference}`);
  if (!(await runtime.fileSystem.pathExists(absoluteRoutePath)))
    return failure("one", `route binding file does not exist: ${routePath}`);
  let source: string;
  try {
    source = await runtime.fileSystem.readFile(absoluteRoutePath);
  } catch (error) {
    return failure("one", `cannot read route binding ${routePath}: ${String(error)}`);
  }
  const routeArtifact = await createArtifactReader({
    readFile: () => source,
  })(absoluteRoutePath);
  if (routeArtifact._tag !== "recognized" || routeArtifact.metadata.artifact !== "route")
    return failure("one", `route binding is not a recognized route artifact: ${routePath}`);
  const routeContract = validateArtifact(routeArtifact);
  if (routeContract._tag !== "valid")
    return failure(
      "one",
      `route binding artifact is invalid: ${routePath}: ${routeContract._tag === "invalid" ? routeContract.diagnostics.map((item) => item.message).join("; ") : "route artifact was skipped"}`,
    );
  const units = routeArtifact.metadata.units as readonly { readonly id: number }[];
  if (!units.some((unit) => unit.id === unitId))
    return failure("one", `route unit ${unitId} does not exist in ${routePath}`);
  const repositoryPath = relativeRoutePath.split(Path.sep).join("/");
  const committed = await runtime.git.headBlob(root, repositoryPath);
  const current = await runtime.git.worktreeBlob(root, repositoryPath);
  if (!successful(committed) || !successful(current))
    return failure("one", `route binding has no verifiable committed revision: ${routePath}`);
  if (text(committed) !== text(current))
    return failure("one", `route binding differs from its committed revision: ${routePath}`);
  return text(committed);
};

const formatChange = async (
  runtime: ContextRuntime,
  dir: string,
): Promise<{
  readonly change: ContextChange;
  readonly sources: ReadonlyMap<string, string>;
  readonly error?: ContextResult;
}> => {
  const name = Path.basename(dir);
  const sources = new Map<string, string>();
  const inspected = new Map<string, ArtifactReadResult>();
  let newest = 0;
  for (const artifact of ARTIFACTS) {
    const path = Path.join(dir, artifact);
    if (!(await runtime.fileSystem.pathExists(path))) continue;
    let source: string;
    try {
      source = await runtime.fileSystem.readFile(path);
    } catch (error) {
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts: [],
          requirements: [],
          lastModified: 0,
        },
        sources,
        error: failure("one", `cannot read ${path}: ${String(error)}`),
      };
    }
    sources.set(artifact, source);
    const inspectedArtifact = await createArtifactReader({
      readFile: () => source,
    })(path);
    inspected.set(artifact, inspectedArtifact);
    newest = Math.max(newest, await runtime.fileSystem.modificationTime(path));
  }
  const requirementsDir = Path.join(dir, "requirements");
  let requirements: string[] = [];
  try {
    if (await runtime.fileSystem.directoryExists(requirementsDir)) {
      const requirementFiles = [
        ...(await runtime.fileSystem.readDirectory(requirementsDir)),
      ].filter((entry) => entry.endsWith(".md")).sort();
      requirements = requirementFiles.map((entry) => entry.slice(0, -3));
      for (const entry of requirementFiles) {
        const path = Path.join(requirementsDir, entry);
        const source = await runtime.fileSystem.readFile(path);
        sources.set(`requirements/${entry}`, source);
        inspected.set(
          `requirements/${entry}`,
          await createArtifactReader({ readFile: () => source })(path),
        );
        newest = Math.max(newest, await runtime.fileSystem.modificationTime(path));
      }
      newest = Math.max(
        newest,
        await runtime.fileSystem.modificationTime(requirementsDir),
      );
    }
  } catch (error) {
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts: [],
        requirements: [],
        lastModified: 0,
      },
      sources,
      error: failure("one", `cannot read ${requirementsDir}: ${String(error)}`),
    };
  }
  if (newest === 0) newest = await runtime.fileSystem.modificationTime(dir);
  const artifacts = ARTIFACTS.filter((artifact) => sources.has(artifact));
  const artifactDetails = Object.fromEntries(
    [...sources.entries()].map(([artifact, source]) => [
      artifact,
      { lines: lineCount(source), header: firstHeader(source) },
    ]),
  );
  if ([...inspected.values()].some(currentInvalid)) {
    const diagnostics = [...inspected.entries()].flatMap(([path, artifact]) => {
      const contract = artifact._tag === "recognized" ? metadataContract(artifact) : undefined;
      return contract?._tag === "invalid"
        ? contract.diagnostics.map((diagnostic) =>
            `${path}${"field" in diagnostic && diagnostic.field ? ` ${diagnostic.field}` : ""}: ${diagnostic.message}`,
          )
        : [];
    });
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        diagnostics,
        lastModified: newest,
      },
      sources,
    };
  }
  const plan = sources.get("plan.md");
  const routeResolution = routeUnit(sources, inspected);
  if (routeResolution.kind === "conflict") {
    const proposalReference = routeResolution.references[0];
    const planReference = routeResolution.references[1];
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
      error: failure(
        "one",
        `route binding conflict: proposal.md route_unit=${JSON.stringify(proposalReference)}; plan.md route_unit=${JSON.stringify(planReference)}`,
      ),
    };
  }
  const route = routeResolution.reference;
  let routeUnitRevision: string | undefined;
  if (route !== undefined) {
    const checkedRoute = await validateRouteBinding(runtime, dir, route);
    if (typeof checkedRoute !== "string")
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
        error: checkedRoute,
      };
    routeUnitRevision = checkedRoute;
  }
  if (!plan)
    return {
      change: {
        name,
        path: dir,
        format: "pre-plan",
        artifacts,
        artifactDetails,
        requirements,
        ...(route ? { routeUnit: route } : {}),
        ...(routeUnitRevision ? { routeUnitRevision } : {}),
        lastModified: newest,
      },
      sources,
    };
  const planRead = await readArtifact(runtime, Path.join(dir, "plan.md"));
  if ("exitCode" in planRead)
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
      error: planRead,
    };
  if (currentInvalid(planRead.artifact))
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
    };
  const planContractResult = metadataContract(planRead.artifact);
  const planContract =
    planContractResult?._tag === "valid"
      ? planContractResult.body.workflow.plan
      : undefined;
  const tasks = planTasks(
    planContract,
    bodyOf(planRead.source, planRead.artifact),
  );
  if (!tasks)
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
    };
  const rootResult = await runtime.git.repositoryRoot(dir);
  const executionTransitionStanding = successful(rootResult)
    ? await inspectContextExecutionTransition(
        runtime,
        text(rootResult),
        dir,
        planRead.artifact,
      )
    : planContract?.execution !== undefined || planContract?.executionTransition !== undefined
      ? { status: "blocked" as const, reasons: ["repository history cannot be verified"] }
      : undefined;
  const inputImpactStanding = successful(rootResult) && planContract
    ? await inspectContextInputImpact(runtime, text(rootResult), dir, planContract)
    : planContract?.inputImpact !== undefined
      ? { status: "blocked" as const, reasons: ["repository history cannot be verified"] }
      : undefined;
  if (
    executionTransitionStanding?.status === "blocked" ||
    inputImpactStanding?.status === "blocked"
  )
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        ...(executionTransitionStanding === undefined ? {} : { executionTransitionStanding }),
        ...(inputImpactStanding === undefined ? {} : { inputImpactStanding }),
        lastModified: newest,
      },
      sources,
    };
  const progress = sources.get("progress.md");
  if (!progress) {
    const scaffoldRecovery = await inspectInitialScaffoldRecovery(
      runtime,
      dir,
      planRead.artifact,
    );
    return {
      change: {
        name,
        path: dir,
        format: "legacy-unsupported",
        artifacts,
        requirements,
        ...(scaffoldRecovery === undefined ? {} : { scaffoldRecovery }),
        ...(executionTransitionStanding === undefined ? {} : { executionTransitionStanding }),
        ...(inputImpactStanding === undefined ? {} : { inputImpactStanding }),
        lastModified: newest,
      },
      sources,
    };
  }
  const progressRead = await readArtifact(
    runtime,
    Path.join(dir, "progress.md"),
  );
  if ("exitCode" in progressRead)
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
      error: progressRead,
    };
  const current = currentValid(progressRead.artifact);
  if (currentInvalid(progressRead.artifact))
    return {
      change: {
        name,
        path: dir,
        format: "invalid",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
    };
  const rows = progressRows(bodyOf(progressRead.source, progressRead.artifact));
  if (
    !rows ||
    rows.length !== tasks.filter((task) => !task.abandoned).length ||
    rows.some(
      (row, index) =>
        row.task !== tasks.filter((task) => !task.abandoned)[index]?.task ||
        row.title !== tasks.filter((task) => !task.abandoned)[index]?.title,
    )
  )
    return {
      change: {
        name,
        path: dir,
        format: "legacy-unsupported",
        artifacts,
        requirements,
        lastModified: newest,
      },
      sources,
    };
  for (const task of tasks.filter((entry) => !entry.abandoned)) {
    const taskPath = Path.join(
      dir,
      "tasks",
      `task-${task.task}`,
      "progress.md",
    );
    if (!(await runtime.fileSystem.pathExists(taskPath))) {
      const scaffoldRecovery = await inspectInitialScaffoldRecovery(
        runtime,
        dir,
        planRead.artifact,
      );
      return {
        change: {
          name,
          path: dir,
          format: "legacy-unsupported",
          artifacts,
          requirements,
          ...(scaffoldRecovery === undefined ? {} : { scaffoldRecovery }),
          ...(executionTransitionStanding === undefined ? {} : { executionTransitionStanding }),
          lastModified: newest,
        },
        sources,
      };
    }
    const taskSource = await read(runtime, taskPath);
    if (typeof taskSource !== "string")
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
        error: taskSource,
      };
    const taskRead = await readArtifact(runtime, taskPath);
    if ("exitCode" in taskRead)
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
        error: taskRead,
      };
    if (current) {
      if (
        !currentValid(taskRead.artifact) ||
        taskRead.artifact.metadata.task !== Number(task.task) ||
        taskRead.artifact.metadata.change !== name
      )
        return {
          change: {
            name,
            path: dir,
            format: "invalid",
            artifacts,
            requirements,
            lastModified: newest,
          },
          sources,
        };
    } else if (currentInvalid(taskRead.artifact))
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
      };
    else if (taskRead.artifact._tag === "recognized")
      return {
        change: {
          name,
          path: dir,
          format: "legacy-unsupported",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
      };
    else if (!taskAttempts(taskSource, task.title, task.task).valid)
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
      };
  }
  const review = sources.get("review.md");
  if (review) {
    const reviewRead = await readArtifact(runtime, Path.join(dir, "review.md"));
    if ("exitCode" in reviewRead)
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
        error: reviewRead,
      };
    if (currentValid(reviewRead.artifact)) {
      if (reviewRead.artifact.body.match(/^##[ \t]+Task\b/m))
        return {
          change: {
            name,
            path: dir,
            format: "legacy-unsupported",
            artifacts,
            requirements,
            lastModified: newest,
          },
          sources,
        };
    } else if (
      reviewRead.artifact._tag === "unrelated" &&
      /^ {0,3}##[ \t]+Task\b/m.test(stripComments(review))
    )
      return {
        change: {
          name,
          path: dir,
          format: "legacy-unsupported",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
      };
    else if (currentInvalid(reviewRead.artifact))
      return {
        change: {
          name,
          path: dir,
          format: "invalid",
          artifacts,
          requirements,
          lastModified: newest,
        },
        sources,
      };
  }
  const done = rows.filter((row) => row.status === "done").length;
  const formalInputs = [...inspected.entries()].filter(
    ([path]) =>
      path === "proposal.md" || path === "design.md" || path.startsWith("requirements/"),
  );
  const intentReferences = planContract?.intentApprovals ?? [];
  const referencesByPath = new Map(intentReferences.map((entry) => [entry.path, entry]));
  const intentStanding =
    formalInputs.length === 0 && intentReferences.length === 0
      ? "tactical"
      : formalInputs.length === intentReferences.length &&
          formalInputs.every(([path, artifact]) => {
            const reference = referencesByPath.get(path);
            return (
              artifact._tag === "recognized" &&
              artifact.metadata.status === "approved" &&
              artifact.metadata.decision === "accepted" &&
              reference !== undefined
            );
          })
        ? "approved-reference"
        : "approval-required";
  const critique = inspected.get("critique.md");
  const critiqueContract =
    critique?._tag === "recognized" ? metadataContract(critique) : undefined;
  const critiqueDisposition =
    critiqueContract?._tag === "valid"
      ? critiqueContract.body.workflow.critiqueDisposition
      : undefined;
  return {
    change: {
      name,
      path: dir,
      format: "split",
      artifacts,
      artifactDetails,
      requirements,
      tasks: { done, total: rows.length },
      ...(planContract === undefined ? {} : {
        identityOrder: planContract.identityOrder,
        ...(planContract.execution === undefined ? {} : { execution: planContract.execution }),
        ...(planContract.execution?.version === 2
          ? {}
          : { executionOrder: planContract.executionOrder }),
        ...(planContract.executionTransition === undefined
          ? {}
          : { executionTransition: planContract.executionTransition }),
        ...(planContract.inputImpact === undefined
          ? {}
          : { inputImpact: planContract.inputImpact }),
      }),
      ...(executionTransitionStanding === undefined ? {} : { executionTransitionStanding }),
      ...(inputImpactStanding === undefined ? {} : { inputImpactStanding }),
      ...(critiqueDisposition === undefined ? {} : { critiqueDisposition }),
      intentStanding,
      ...(route ? { routeUnit: route } : {}),
      ...(routeUnitRevision ? { routeUnitRevision } : {}),
      lastModified: newest,
    },
    sources,
  };
};

const relative = (root: string, path: string): string =>
  Path.relative(root, path).split(Path.sep).join("/");
const validRange = async (
  runtime: ContextRuntime,
  root: string,
  base: unknown,
  head: unknown,
  required: string | undefined,
): Promise<ContextStanding> => {
  if (
    typeof base !== "string" ||
    typeof head !== "string" ||
    !fullCommit(base) ||
    !fullCommit(head)
  )
    return "malformed";
  const resolvedBase = await runtime.git.resolveCommit(root, base);
  const resolvedHead = await runtime.git.resolveCommit(root, head);
  if (
    !successful(resolvedBase) ||
    !successful(resolvedHead) ||
    text(resolvedBase) !== base ||
    text(resolvedHead) !== head
  )
    return "malformed";
  if (!successful(await runtime.git.isAncestor(root, base, head)))
    return "malformed";
  const current = text(await runtime.git.currentHead(root));
  if (
    !fullCommit(current) ||
    !successful(await runtime.git.isAncestor(root, head, current))
  )
    return "stale";
  if (
    !required ||
    !successful(await runtime.git.isAncestor(root, required, head))
  )
    return "stale";
  return "fresh";
};

const durableArtifact = async (
  runtime: ContextRuntime,
  root: string,
  path: string,
): Promise<boolean> => {
  const relativePath = relative(root, path);
  const head = await runtime.git.headBlob(root, relativePath);
  const worktree = await runtime.git.worktreeBlob(root, relativePath);
  if (
    !successful(head) ||
    !successful(worktree) ||
    text(head) !== text(worktree)
  )
    return false;
  return (await runtime.git.stagedDiff(root, relativePath)).status === 0;
};

const latestParsedPass = (
  artifact: RecognizedArtifact,
): ReviewPassEvidence | undefined => parseReviewPasses(artifact).latest;

const latestFeedback = async (
  runtime: ContextRuntime,
  root: string,
  dir: string,
  task: string,
  implementation: string | undefined,
  status: string,
): Promise<ContextStanding | string> => {
  const path = Path.join(dir, "tasks", `task-${task}`, "feedback.md");
  if (!(await runtime.fileSystem.pathExists(path))) return "absent";
  const readResult = await readArtifact(runtime, path);
  if ("exitCode" in readResult) return "malformed";
  if (!currentValid(readResult.artifact)) return "malformed";
  if (
    readResult.artifact.metadata.task !== Number(task) ||
    readResult.artifact.metadata.change !== Path.basename(dir)
  )
    return "malformed";
  const latest = latestParsedPass(readResult.artifact);
  if (latest === undefined) return "malformed";
  const verdict = latest.verdict;
  const base = latest.base;
  const head = latest.head;
  if (!(await durableArtifact(runtime, root, path)))
    return `${String(verdict)} (uncommitted)`;
  const commit = text(
    await runtime.git.latestCommit(root, relative(root, path)),
  );
  if (
    !fullCommit(commit) ||
    (await runtime.git.commitFiles(root, commit)).stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .join("\n") !== relative(root, path)
  )
    return `${String(verdict)} (uncommitted)`;
  const standing = await validRange(runtime, root, base, head, implementation);
  if (standing !== "fresh") return `${String(verdict)} (${standing})`;
  const progressPath = Path.join(dir, "tasks", `task-${task}`, "progress.md");
  const progress = await readArtifact(runtime, progressPath);
  const progressContract = "exitCode" in progress ? undefined : metadataContract(progress.artifact);
  if (progressContract?._tag !== "valid" || progressContract.artifact !== "task-progress" ||
      progressContract.metadata.task !== Number(task) || progressContract.metadata.change !== Path.basename(dir) ||
      !await durableArtifact(runtime, root, progressPath)) return `${String(verdict)} (stale)`;
  const latestAttempt = progressContract.body.workflow.records.filter((record) => record.kind === "attempt").at(-1);
  if (verdict === "approved" && (status !== "done" || progressContract.metadata.status !== "done" || latestAttempt?.fields.Outcome !== "done"))
    return "approved (stale)";
  const resolvedImplementation = implementation ? await runtime.git.resolveCommit(root, implementation) : undefined;
  if (!resolvedImplementation || !successful(resolvedImplementation) || text(resolvedImplementation) !== implementation)
    return `${String(verdict)} (stale)`;
  const ranges = await readTaskFeedbackRanges(path, readResult.source, Path.basename(dir), Number(task));
  const current = text(await runtime.git.currentHead(root));
  if (ranges.kind !== "valid" || !fullCommit(current)) return `${String(verdict)} (malformed)`;
  const checkpoint = await resolveTaskCheckpoint(contextTaskCheckpointGit(runtime), root, relative(root, progressPath), Number(task), Path.basename(dir), current, ranges.ranges);
  if (checkpoint.kind !== "verified" || checkpoint.base !== base) return `${String(verdict)} (stale)`;
  return `${String(verdict)} (fresh)`;
};

const latestReview = async (
  runtime: ContextRuntime,
  root: string,
  dir: string,
  taskPaths: readonly string[],
  expectedTitle: string,
  material?: string,
): Promise<ContextStanding | string> => {
  const path = Path.join(dir, "review.md");
  if (!(await runtime.fileSystem.pathExists(path))) return "not reviewed";
  const readResult = await readArtifact(runtime, path);
  if ("exitCode" in readResult) return "malformed";
  if (!currentValid(readResult.artifact)) return "malformed";
  if (
    readResult.artifact.metadata.change !== Path.basename(dir) ||
    !readResult.artifact.body.match(
      new RegExp(
        `^# Whole-branch Review: ${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "m",
      ),
    )
  )
    return "malformed";
  const latest = latestParsedPass(readResult.artifact);
  if (latest === undefined) return "malformed";
  const verdict = latest.verdict;
  const base = latest.base;
  const head = latest.head;
  if (!(await durableArtifact(runtime, root, path)))
    return `${String(verdict)} (uncommitted)`;
  const commit = text(
    await runtime.git.latestCommit(root, relative(root, path)),
  );
  if (
    !fullCommit(commit) ||
    (await runtime.git.commitFiles(root, commit)).stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .join("\n") !== relative(root, path)
  )
    return `${String(verdict)} (uncommitted)`;
  const required =
    material ??
    text(
      await runtime.git.latestMaterialCommit(
        root,
        relative(root, dir),
        taskPaths,
      ),
    );
  const standing = await validRange(runtime, root, base, head, required);
  return `${String(verdict)} (${standing === "fresh" ? "range-fresh; clearance-unverified" : standing})`;
};

const enrichSplit = async (
  runtime: ContextRuntime,
  change: ContextChange,
): Promise<ContextChange> => {
  if (change.format !== "split" || !change.tasks) return change;
  const rootResult = await runtime.git.repositoryRoot(change.path);
  if (!successful(rootResult)) return change;
  const root = text(rootResult);
  const progress = await readArtifact(
    runtime,
    Path.join(change.path, "progress.md"),
  );
  if ("exitCode" in progress) return change;
  const rows = progressRows(bodyOf(progress.source, progress.artifact)) ?? [];
  const taskPaths = rows.map((row) =>
    Path.join(
      relative(root, change.path),
      "tasks",
      `task-${row.task}`,
      "progress.md",
    ),
  );
  const states = [];
  for (const row of rows)
    states.push({
      task: row.task,
      status: row.status,
      feedback: await latestFeedback(
        runtime,
        root,
        change.path,
        row.task,
        text(
          await runtime.git.latestCommit(
            root,
            Path.join(
              relative(root, change.path),
              "tasks",
              `task-${row.task}`,
              "progress.md",
            ),
          ),
        ),
        row.status,
      ),
    });
  const plan = await readArtifact(runtime, Path.join(change.path, "plan.md"));
  const expectedTitle =
    "exitCode" in plan
      ? ""
      : firstHeader(bodyOf(plan.source, plan.artifact)).replace(/^Plan: /, "");
  const wholeReview = await latestReview(
    runtime,
    root,
    change.path,
    taskPaths,
    expectedTitle,
  );
  const planContractResult =
    "exitCode" in plan ? undefined : metadataContract(plan.artifact);
  const planContract =
    planContractResult?._tag === "valid"
      ? planContractResult.body.workflow.plan
      : undefined;
  const taskInputs: NonNullable<ContextChange["taskInputs"]>[number][] = [];
  if (planContract) {
    let repositoryIdentity: string | undefined;
    try {
      repositoryIdentity = await runtime.fileSystem.realpath(root);
    } catch {
      repositoryIdentity = undefined;
    }
    for (const task of planContract.tasks.filter(
      (entry) => !/\(abandoned — .+\)$/.test(entry.title),
    )) {
      const input = task.inputContext;
      if (!input) {
        const confirmation = planContract.legacyInputConfirmations?.find(
          (entry) => entry.task === task.id,
        );
        if (!confirmation) {
          taskInputs.push({ task: task.id, status: "missing", changedPaths: [] });
          continue;
        }
        const changedPaths = await inspectLegacyInputConfirmation(
          runtime,
          root,
          change.path,
          task,
          planContract,
          repositoryIdentity,
          change.inputImpactStanding,
        );
        taskInputs.push({
          task: task.id,
          status:
            changedPaths.length === 0
              ? "legacy-current-confirmed"
              : "legacy-confirmation-stale",
          changedPaths,
        });
        continue;
      }
      const changedPaths: string[] = [];
      const repositoryChanged = repositoryIdentity !== input.repository;
      if (repositoryChanged) changedPaths.push("repository");
      for (const item of input.inputs) {
        const current = await runtime.git.headBlob(root, item.path);
        const working = await runtime.git.worktreeBlob(root, item.path);
        if (
          !successful(current) ||
          !successful(working) ||
          text(current) !== item.blob ||
          text(working) !== item.blob
        )
          changedPaths.push(item.path);
      }
      const reviewedUnaffectedPaths = new Set(
        change.inputImpactStanding?.status === "verified"
          ? [...(change.inputImpactStanding.unaffectedInputs ?? [])]
              .flatMap(([path, tasks]) => tasks.has(task.id) ? [path] : [])
          : [],
      );
      const unreviewedChanges = changedPaths.filter(
        (path) => (repositoryChanged && path === "repository") || !reviewedUnaffectedPaths.has(path),
      );
      taskInputs.push({
        task: task.id,
        status:
          changedPaths.length === 0
            ? "current"
            : unreviewedChanges.length === 0
              ? "impact-reviewed-unaffected"
              : "stale",
        changedPaths,
      });
    }
  }
  let intentStanding = change.intentStanding;
  if (intentStanding === "approved-reference" && planContract) {
    const currentHead = text(await runtime.git.currentHead(root));
    for (const reference of planContract.intentApprovals) {
      const resolved = await runtime.git.resolveCommit(root, reference.commit);
      const path = Path.join(change.path, reference.path);
      const repoPath = relative(root, path);
      const approvedBlob = await runtime.git.blobIdAt(root, reference.commit, repoPath);
      const currentBlob = await runtime.git.headBlob(root, repoPath);
      if (
        !fullCommit(currentHead) ||
        !successful(resolved) ||
        text(resolved) !== reference.commit ||
        !successful(await runtime.git.isAncestor(root, reference.commit, currentHead)) ||
        !successful(approvedBlob) ||
        !successful(currentBlob) ||
        text(approvedBlob) !== text(currentBlob)
      ) {
        intentStanding = "stale";
        break;
      }
    }
  }
  return {
    ...change,
    taskStates: states,
    taskInputs,
    ...(planContract?.executionTransition === undefined
      ? {}
      : { executionTransition: planContract.executionTransition }),
    intentStanding,
    wholeReview,
  };
};

const renderOne = (change: ContextChange): string => {
  const lines = [
    `change: ${change.name}`,
    `path: ${change.path}`,
    `format: ${change.format}`,
  ];
  for (const diagnostic of change.diagnostics ?? [])
    lines.push(`artifact-diagnostic: ${diagnostic}`);
  if (change.routeUnit) lines.push(`route-unit: ${change.routeUnit}`);
  if (change.routeUnitRevision)
    lines.push(`route-unit-revision: ${change.routeUnitRevision}`);
  if (change.planContractData)
    lines.push(`plan-contract-data: ${JSON.stringify(change.planContractData)}`);
  if (change.identityOrder)
    lines.push(`identity-order: ${change.identityOrder.join(", ")}`);
  if (change.execution?.version === 2)
    lines.push("execution-mode: dependencies");
  else if (change.executionOrder)
    lines.push(`execution-order: ${change.executionOrder.join(", ")}`);
  if (change.executionTransitionStanding)
    lines.push(
      `execution-history: ${change.executionTransitionStanding.status}${change.executionTransitionStanding.reasons.length === 0 ? "" : ` (${change.executionTransitionStanding.reasons.join("; ")})`}`,
    );
  if (change.inputImpactStanding)
    lines.push(
      `input-impact-history: ${change.inputImpactStanding.status}${change.inputImpactStanding.reasons.length === 0 ? "" : ` (${change.inputImpactStanding.reasons.join("; ")})`}`,
    );
  if (change.inputImpact) {
    lines.push(`input-impact-review: ${change.inputImpact.reviewReference} (assertion, not authenticated)`);
    for (const impact of change.inputImpact.changes)
      lines.push(
        `  input-impact: ${impact.path} ${impact.previousBlob ?? "absent"} -> ${impact.currentBlob ?? "absent"}; affected=${impact.affectedTasks.join(",") || "none"}; unaffected=${impact.unaffectedTasks.join(",") || "none"}; new=${impact.newTasks.join(",") || "none"}${impact.unresolvedIntent ? "; unresolved-intent" : ""}`,
      );
  }
  if (change.executionTransition?.version === 1)
    lines.push(
      `execution-transition: previous=${change.executionTransition.previousOrder.join(", ")}; gated-prefix=${change.executionTransition.fullyGatedPrefix.length === 0 ? "none" : change.executionTransition.fullyGatedPrefix.join(", ")}; approval=${change.executionTransition.approval} (assertion)`,
    );
  else if (change.executionTransition?.version === 2)
    lines.push(
      `execution-transition: fully-gated=${change.executionTransition.fullyGatedTasks.join(", ") || "none"}; approval=${change.executionTransition.approval} (assertion)`,
    );
  if (change.intentStanding)
    lines.push(`formal-intent: ${change.intentStanding} (approval references are assertions)`);
  if (change.critiqueDisposition)
    lines.push(`critique-disposition: ${change.critiqueDisposition}`);
  if (change.scaffoldRecovery)
    lines.push(
      `scaffold-recovery: ${change.scaffoldRecovery.status}${change.scaffoldRecovery.reasons.length === 0 ? "" : ` (${change.scaffoldRecovery.reasons.join("; ")})`}`,
    );
  lines.push("", "artifacts:");
  for (const artifact of ARTIFACTS) {
    if (change.artifacts.includes(artifact)) {
      const detail = change.artifactDetails?.[artifact];
      lines.push(
        `  ${artifact.padEnd(14)} present${detail ? `  ${String(detail.lines).padStart(5)} lines  ${detail.header}` : ""}`,
      );
    } else lines.push(`  ${artifact.padEnd(14)} absent`);
  }
  lines.push(
    `  ${"requirements/".padEnd(14)} ${change.requirements.length > 0 ? `present  ${change.requirements.join(" ")}` : "absent"}`,
  );
  if (change.format === "pre-plan")
    lines.push(
      "",
      "tasks: none declared",
      `summary: ${change.name} — pre-plan`,
    );
  else if (
    change.format === "legacy-unsupported" ||
    change.format === "invalid"
  )
    lines.push("", `summary: ${change.name} — ${change.format}`);
  else {
    const tasks = change.tasks ?? { done: 0, total: 0 };
    lines.push("", `tasks: ${tasks.done}/${tasks.total} done`, "task state:");
    for (const task of change.taskStates ?? [])
      lines.push(
        `  Task ${task.task}: ${task.status}, feedback: ${task.feedback}`,
      );
    for (const task of change.taskInputs ?? [])
      lines.push(
        task.status === "legacy-current-confirmed" || task.status === "legacy-confirmation-stale"
          ? `  Task ${task.task} scoped legacy current-confirmation standing: ${task.status}${task.changedPaths.length === 0 ? "" : ` (${task.changedPaths.join(", ")})`}`
          : `  Task ${task.task} input context: ${task.status}${task.changedPaths.length === 0 ? "" : ` (${task.changedPaths.join(", ")})`}`,
      );
    const whole = change.wholeReview ?? "not reviewed";
    lines.push(
      "reviews:",
      `  whole change: ${whole}`,
      `summary: ${change.name} — ${tasks.done}/${tasks.total} tasks done, whole change: ${whole}`,
    );
  }
  return lines.join("\n");
};

const buildContextPlanContractData = async (
  runtime: ContextRuntime,
  changeDir: string,
  projection: PlanContractProjection,
  requestedPaths: readonly string[],
  taskInputs: ContextChange["taskInputs"],
): Promise<ContextPlanContractData> => {
  const rootResult = await runtime.git.repositoryRoot(changeDir);
  const root = successful(rootResult) ? text(rootResult) : undefined;
  let repository: string | null = null;
  if (root) {
    try {
      repository = await runtime.fileSystem.realpath(root);
    } catch {
      repository = null;
    }
  }
  const recordedByPath = new Map<string, Array<{ task: number; blob: string }>>();
  for (const task of projection.tasks)
    for (const input of task.inputContext?.inputs ?? []) {
      const records = recordedByPath.get(input.path) ?? [];
      records.push({ task: task.id, blob: input.blob });
      recordedByPath.set(input.path, records);
    }
  const taskStanding = new Map((taskInputs ?? []).map((entry) => [entry.task, entry.status]));
  const legacyConfirmationByPath = new Map<string, Array<{
    readonly task: number;
    readonly blob: string;
    readonly standing: "legacy-current-confirmed" | "legacy-confirmation-stale" | "unavailable";
  }>>();
  for (const confirmation of projection.legacyInputConfirmations ?? [])
    for (const input of confirmation.inputs) {
      const records = legacyConfirmationByPath.get(input.path) ?? [];
      const standing = taskStanding.get(confirmation.task);
      records.push({
        task: confirmation.task,
        blob: input.blob,
        standing:
          standing === "legacy-current-confirmed" || standing === "legacy-confirmation-stale"
            ? standing
            : "unavailable",
      });
      legacyConfirmationByPath.set(input.path, records);
    }
  const inputPaths = [...new Set([
    ...recordedByPath.keys(),
    ...legacyConfirmationByPath.keys(),
    ...requestedPaths,
  ])];
  const inputs = await Promise.all(
    inputPaths.map(async (path) => {
      const recordedBy = recordedByPath.get(path) ?? [];
      const head = root && safeRepositoryPath(path)
        ? await runtime.git.headBlob(root, path)
        : { status: 1, stdout: "", stderr: "" };
      const worktree = root && safeRepositoryPath(path)
        ? await runtime.git.worktreeBlob(root, path)
        : { status: 1, stdout: "", stderr: "" };
      const legacyCurrentConfirmationBy = legacyConfirmationByPath.get(path);
      return {
        path,
        requested: requestedPaths.includes(path),
        recordedBy,
        ...(legacyCurrentConfirmationBy === undefined || legacyCurrentConfirmationBy.length === 0
          ? {}
          : { legacyCurrentConfirmationBy }),
        currentHeadBlob: successful(head) ? text(head) : null,
        headAvailable: successful(head),
        currentWorktreeBlob: successful(worktree) ? text(worktree) : null,
        worktreeAvailable: successful(worktree),
      };
    }),
  );
  return {
    version: 1,
    repository,
    taskBreakdownDigest: taskBreakdownDigestFromDefinitions(
      projection.identityOrder,
      projection.tasks,
    ),
    recordedInitialization: projection.initialization
      ? {
          base: projection.initialization.base,
          authority: projection.initialization.authority,
          breakdown: projection.initialization.breakdown,
          taskIds: projection.initialization.taskIds,
        }
      : null,
    tasks: projection.tasks.map((task) => {
      const confirmation = projection.legacyInputConfirmations?.find((entry) => entry.task === task.id);
      const standing = taskStanding.get(task.id);
      return {
        id: task.id,
        title: task.title,
        taskDefinitionDigest: task.definitionDigest,
        ...(task.goal === undefined ? {} : { goal: task.goal }),
        ...(task.acceptance === undefined ? {} : { acceptance: task.acceptance }),
        dependsOn: task.dependsOn,
        recordedInputContext: task.inputContext
          ? {
              repository: task.inputContext.repository,
              intentCommit: task.inputContext.intentCommit,
              taskDefinition: task.inputContext.taskDefinition,
              impactPlanCommit: task.inputContext.impactPlanCommit ?? null,
              inputs: task.inputContext.inputs,
            }
          : null,
        ...(confirmation === undefined
          ? {}
          : {
              legacyCurrentConfirmation: {
                ...confirmation,
                standing:
                  standing === "legacy-current-confirmed" || standing === "legacy-confirmation-stale"
                    ? standing
                    : "unavailable",
              },
            }),
      };
    }),
    inputs,
  };
};

const enrichPlanContractData = async (
  runtime: ContextRuntime,
  change: ContextChange,
  requestedPaths: readonly string[],
): Promise<ContextChange> => {
  const plan = await readArtifact(runtime, Path.join(change.path, "plan.md"));
  if ("exitCode" in plan || plan.artifact._tag !== "recognized") return change;
  const contract = validateArtifact(plan.artifact);
  if (contract._tag !== "valid" || contract.artifact !== "plan") return change;
  const projection = contract.body.workflow.plan;
  if (!projection) return change;
  const planContractData = await buildContextPlanContractData(
    runtime,
    change.path,
    projection,
    requestedPaths,
    change.taskInputs,
  );
  return { ...change, planContractData };
};

const normalizeChange = async (
  runtime: ContextRuntime,
  dir: string,
  requestedPaths: readonly string[] = [],
): Promise<ContextChange | ContextResult> => {
  try {
    const formatted = await formatChange(runtime, dir);
    if (formatted.error) return formatted.error;
    const withTaskStanding = await enrichSplit(runtime, formatted.change);
    return await enrichPlanContractData(
      runtime,
      withTaskStanding,
      requestedPaths,
    );
  } catch (error) {
    return failure("one", `cannot inspect change ${dir}: ${String(error)}`);
  }
};

const discover = async (
  runtime: ContextRuntime,
  supplied: string | undefined,
): Promise<string | ContextResult> => {
  if (supplied !== undefined) {
    let candidate: string;
    try {
      candidate = resolveProjectDataPath(supplied, runtime.cwd());
    } catch (error) {
      return failure("one", `cannot resolve project data path: ${String(error)}`);
    }
    let exists: boolean;
    try {
      exists = await runtime.fileSystem.directoryExists(candidate);
    } catch (error) {
      return failure(
        "one",
        `cannot inspect change dir ${candidate}: ${String(error)}`,
      );
    }
    if (!exists)
      return failure("one", `change dir does not exist: ${candidate}`);
    try {
      return await runtime.fileSystem.realpath(candidate);
    } catch (error) {
      return failure(
        "one",
        `cannot resolve change dir ${candidate}: ${String(error)}`,
      );
    }
  }
  let current: string;
  try {
    const canonicalCurrent = resolveProjectDataPath(runtime.cwd(), runtime.cwd());
    current = await runtime.fileSystem.realpath(canonicalCurrent);
  } catch (error) {
    return failure("one", `cannot resolve current directory: ${String(error)}`);
  }
  const parts = current.split(Path.sep);
  const marker = parts.lastIndexOf(".kepler");
  if (marker < 0 || parts[marker + 1] !== "changes" || !parts[marker + 2])
    return failure(
      "one",
      "not inside a change directory — pass one as an argument, or use --all",
    );
  const dir = parts.slice(0, marker + 3).join(Path.sep) || Path.sep;
  try {
    return (await runtime.fileSystem.directoryExists(dir))
      ? dir
      : failure("one", `change dir does not exist: ${dir}`);
  } catch (error) {
    return failure("one", `cannot inspect change dir ${dir}: ${String(error)}`);
  }
};

const contextOne = async (
  runtime: ContextRuntime,
  supplied: string | undefined,
  inputPaths: readonly string[] = [],
): Promise<ContextResult> => {
  const unsafePath = inputPaths.find((path) => !safeRepositoryPath(path));
  if (unsafePath !== undefined)
    return failure("one", `input path must be a safe repository-relative path: ${unsafePath}`);
  const dir = await discover(runtime, supplied);
  if (typeof dir !== "string") return dir;
  const change = await normalizeChange(runtime, dir, inputPaths);
  if ("exitCode" in change) return change;
  return result("one", "success", 0, `${renderOne(change)}\n`, "", [change]);
};

const contextAll = async (runtime: ContextRuntime): Promise<ContextResult> => {
  const rootResult = await runtime.git.repositoryRoot(runtime.cwd());
  if (!successful(rootResult))
    return failure("all", "not inside a git repository");
  let projectDataRoot: string;
  try {
    projectDataRoot = resolveProjectDataPath(
      Path.join(text(rootResult), ".kepler"),
      text(rootResult),
    );
  } catch (error) {
    return failure("all", `cannot resolve project data path: ${String(error)}`);
  }
  const changesDir = Path.join(projectDataRoot, "changes");
  let changesDirectoryExists: boolean;
  try {
    changesDirectoryExists =
      await runtime.fileSystem.directoryExists(changesDir);
  } catch (error) {
    return failure(
      "all",
      `cannot discover changes under ${changesDir}: ${String(error)}`,
    );
  }
  if (!changesDirectoryExists)
    return result(
      "all",
      "negative",
      1,
      "",
      `no .kepler/changes/ under ${text(rootResult)}\n`,
    );
  const changeNames: string[] = [];
  try {
    for (const name of await runtime.fileSystem.readDirectory(changesDir))
      if (await runtime.fileSystem.directoryExists(Path.join(changesDir, name)))
        changeNames.push(name);
  } catch (error) {
    return failure(
      "all",
      `cannot discover changes under ${changesDir}: ${String(error)}`,
    );
  }
  if (changeNames.length === 0)
    return result("all", "negative", 1, "", `no changes under ${changesDir}\n`);
  const changes: ContextChange[] = [];
  for (const name of changeNames.sort()) {
    const change = await normalizeChange(runtime, Path.join(changesDir, name));
    if ("exitCode" in change)
      return result("all", "error", 2, "", change.stderr);
    changes.push(change);
  }
  changes.sort(
    (left, right) =>
      right.lastModified - left.lastModified ||
      left.name.localeCompare(right.name),
  );
  const rows = changes.map((change) => {
    const artifacts =
      change.artifacts.length > 0
        ? change.artifacts
            .map((artifact) => artifact.replace(/\.md$/, ""))
            .concat(change.requirements.length > 0 ? ["requirements"] : [])
            .join(",")
        : change.requirements.length > 0
          ? "requirements"
          : "(none)";
    const tasks = change.tasks
      ? `${change.tasks.done}/${change.tasks.total}`
      : "-";
    const review =
      change.wholeReview && change.format === "split"
        ? change.wholeReview
        : "-";
    const date =
      change.lastModified > 0
        ? new Date(change.lastModified).toISOString().slice(0, 10)
        : "unknown";
    return `${change.name.padEnd(28)} ${change.format.padEnd(20)} ${artifacts.padEnd(46)} ${tasks.padEnd(8)} ${String(review).padEnd(18)} ${date}`;
  });
  return result(
    "all",
    "success",
    0,
    [
      `${"change".padEnd(28)} ${"format".padEnd(20)} ${"artifacts".padEnd(46)} ${"tasks".padEnd(8)} ${"whole change".padEnd(18)} last modified`,
      ...rows,
    ].join("\n") + "\n",
    "",
    changes,
  );
};

export const CONTEXT_RUNTIME = Symbol("CONTEXT_RUNTIME");

@Injectable()
export class ContextService {
  constructor(
    @Inject(CONTEXT_RUNTIME) private readonly runtime: ContextRuntime,
  ) {}

  execute(args: ContextArguments): Promise<ContextResult> {
    if (args.all && (args.inputPaths?.length ?? 0) > 0)
      return Promise.resolve(failure("all", "--input requires one change directory"));
    return args.all
      ? contextAll(this.runtime)
      : contextOne(this.runtime, args.changeDir, args.inputPaths);
  }
}

export const renderContextResult = (contextResult: ContextResult): string =>
  contextResult.stdout.trimEnd() === ""
    ? contextResult.stderr.trimEnd()
    : contextResult.stdout.trimEnd();
