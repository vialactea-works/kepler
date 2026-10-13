import {
  createArtifactReader,
  type ArtifactReadResult,
  type RecognizedArtifact,
} from "./artifact-reader.js";
import { artifactContracts, validateArtifact } from "./artifact-contracts.js";
import { validateArtifactBody } from "./artifact-body.js";
import type { ProcessResult } from "./runtime.js";
import { parseReviewPasses } from "./review-passes.js";
import { inspectScopeExpansionHistory } from "./scope-expansion-history.js";

export interface TaskFeedbackRange {
  readonly base: string;
  readonly head: string;
}

export type TaskFeedbackRangesResult =
  | { readonly kind: "valid"; readonly ranges: readonly TaskFeedbackRange[] }
  | { readonly kind: "unverified"; readonly reason: string };

export type TaskCheckpointResult =
  | { readonly kind: "not-started" }
  | {
      readonly kind: "verified";
      readonly base: string;
      readonly attempt: string;
    }
  | { readonly kind: "unverified"; readonly reason: string };

export interface TaskCheckpointGit {
  readonly changedPaths?: (root: string, commit: string) => ProcessResult | Promise<ProcessResult>;
  readonly pathChanges?: (root: string, base: string, head: string, paths: readonly string[]) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistory: (
    root: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly blobAt: (
    root: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly firstParent: (
    root: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly resolveCommit: (
    root: string,
    reference: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly isAncestor: (
    root: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
}

const fullCommit = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);

const text = (result: ProcessResult): string => result.stdout.trim();

const recognized = (
  result: ArtifactReadResult,
): RecognizedArtifact | undefined =>
  result._tag === "recognized" ? result : undefined;

export const readTaskFeedbackRanges = async (
  path: string,
  source: string,
  change: string,
  task: number,
): Promise<TaskFeedbackRangesResult> => {
  const artifact = recognized(
    await createArtifactReader({ readFile: () => source })(path),
  );
  if (
    artifact === undefined ||
    artifact.metadata.artifact !== "feedback" ||
    artifact.metadata.change !== change ||
    artifact.metadata.task !== task
  )
    return { kind: "unverified", reason: "feedback identity is malformed" };
  const contract = validateArtifact(artifact);
  if (contract._tag !== "valid" || contract.artifact !== "feedback")
    return { kind: "unverified", reason: "feedback history is malformed" };
  const parsed = parseReviewPasses(artifact);
  if (parsed.diagnostics.length > 0)
    return { kind: "unverified", reason: "feedback history is malformed" };
  const ranges = parsed.passes.flatMap((pass) =>
    pass.provenance === "structural"
      ? []
      : [{ base: pass.base, head: pass.head }],
  );
  if (ranges.length === 0)
    return { kind: "unverified", reason: "feedback history has no valid ranges" };
  return { kind: "valid", ranges };
};

const taskAttemptCommits = async (
  git: TaskCheckpointGit,
  root: string,
  sourcePath: string,
  task: number,
  change: string,
  commits: readonly string[],
): Promise<readonly string[] | string> => {
  const attemptCommits: string[] = [];
  for (const commit of commits) {
    if (!fullCommit(commit))
      return "task progress history contains an invalid commit identifier";
    const resolved = await git.resolveCommit(root, commit);
    if (resolved.status !== 0 || text(resolved) !== commit)
      return "task progress history contains an unresolved commit";
    const blob = await git.blobAt(root, commit, sourcePath);
    if (blob.status !== 0)
      return "task progress history cannot be read unambiguously";
    const artifact = recognized(
      await createArtifactReader({ readFile: () => blob.stdout })(sourcePath),
    );
    if (
      artifact === undefined ||
      artifact.metadata.artifact !== "task-progress" ||
      artifact.metadata.change !== change ||
      artifact.metadata.task !== task
    )
      return "task progress history has a malformed identity";
    if (artifactContracts["task-progress"].validate(artifact).length > 0)
      return "task progress history is malformed";
    const body = validateArtifactBody(artifact, "task-progress", "historical");
    if (body.diagnostics.length > 0)
      return "task progress history contains an invalid attempt record";
    if (body.workflow.records.some((record) => record.kind === "attempt"))
      attemptCommits.push(commit);
  }
  return [...new Set(attemptCommits)];
};

const isAncestor = async (
  git: TaskCheckpointGit,
  root: string,
  base: string,
  head: string,
): Promise<boolean | undefined> => {
  const result = await git.isAncestor(root, base, head);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return undefined;
};

export const resolveTaskCheckpoint = async (
  git: TaskCheckpointGit,
  root: string,
  sourcePath: string,
  task: number,
  change: string,
  currentHead: string,
  feedbackRanges: readonly TaskFeedbackRange[] = [],
): Promise<TaskCheckpointResult> => {
  if (!fullCommit(currentHead))
    return { kind: "unverified", reason: "current HEAD is unresolved" };
  const resolvedHead = await git.resolveCommit(root, currentHead);
  if (resolvedHead.status !== 0 || text(resolvedHead) !== currentHead)
    return { kind: "unverified", reason: "current HEAD is unresolved" };
  const history = await git.pathHistory(root, sourcePath);
  if (history.status !== 0)
    return { kind: "unverified", reason: "task progress history is unavailable" };
  const commits = history.stdout
    .split(/\r?\n/)
    .map((commit) => commit.trim())
    .filter(Boolean);
  const scopes = await inspectScopeExpansionHistory({
    ...git,
    changedPaths: git.changedPaths ?? (() => ({ status: 2, stdout: "", stderr: "scope changed-path port is unavailable" })),
    pathChanges: git.pathChanges ?? (() => ({ status: 2, stdout: "", stderr: "scope path-history port is unavailable" })),
  }, root, sourcePath, task, change, currentHead);
  if (scopes.kind === "unverified") return scopes;
  const attempts = await taskAttemptCommits(
    git,
    root,
    sourcePath,
    task,
    change,
    commits,
  );
  if (typeof attempts === "string")
    return { kind: "unverified", reason: attempts };
  if (attempts.length === 0)
    return feedbackRanges.length === 0
      ? { kind: "not-started" }
      : {
          kind: "unverified",
          reason: "feedback exists without a committed task attempt",
        };
  const earliest = [] as string[];
  for (const candidate of attempts) {
    let hasAttemptAncestor = false;
    for (const other of attempts) {
      if (candidate === other) continue;
      const ancestor = await isAncestor(git, root, other, candidate);
      if (ancestor === undefined)
        return {
          kind: "unverified",
          reason: "task attempt history cannot be ordered unambiguously",
        };
      if (ancestor) {
        hasAttemptAncestor = true;
        break;
      }
    }
    if (!hasAttemptAncestor) earliest.push(candidate);
  }
  if (earliest.length !== 1)
    return {
      kind: "unverified",
      reason: "task attempt history has multiple earliest commits",
    };
  const attempt = earliest[0];
  if (attempt === undefined)
    return {
      kind: "unverified",
      reason: "task attempt history has no earliest commit",
    };
  const attemptBlob = await git.blobAt(root, currentHead, sourcePath);
  if (attemptBlob.status !== 0)
    return { kind: "unverified", reason: "current task progress is unavailable" };
  const currentArtifact = recognized(
    await createArtifactReader({ readFile: () => attemptBlob.stdout })(sourcePath),
  );
  if (
    currentArtifact === undefined ||
    currentArtifact.metadata.artifact !== "task-progress" ||
    currentArtifact.metadata.change !== change ||
    currentArtifact.metadata.task !== task
  )
    return { kind: "unverified", reason: "current task progress identity is malformed" };
  const currentBody = validateArtifactBody(currentArtifact, "task-progress");
  if (
    currentBody.diagnostics.length > 0 ||
    !currentBody.workflow.records.some((record) => record.kind === "attempt")
  )
    return {
      kind: "unverified",
      reason: "current task progress does not preserve its attempt history",
    };
  const parentResult = await git.firstParent(root, attempt);
  const base = text(parentResult);
  if (parentResult.status !== 0 || !fullCommit(base))
    return {
      kind: "unverified",
      reason: "first task attempt has no resolvable first parent",
    };
  const resolvedBase = await git.resolveCommit(root, base);
  if (resolvedBase.status !== 0 || text(resolvedBase) !== base)
    return {
      kind: "unverified",
      reason: "first task attempt parent is unresolved",
    };
  const basePrecedesAttempt = await isAncestor(git, root, base, attempt);
  const attemptOnCurrentHistory = await isAncestor(git, root, attempt, currentHead);
  if (basePrecedesAttempt !== true || attemptOnCurrentHistory !== true)
    return {
      kind: "unverified",
      reason: "first task attempt ancestry is invalid",
    };
  const baseOnCurrentHistory = await isAncestor(git, root, base, currentHead);
  if (baseOnCurrentHistory !== true)
    return {
      kind: "unverified",
      reason: "historical task Base is not an ancestor of current HEAD",
    };
  for (const range of feedbackRanges) {
    if (!fullCommit(range.base) || !fullCommit(range.head))
      return {
        kind: "unverified",
        reason: "feedback history contains an invalid range",
      };
    if (range.base !== base)
      return {
        kind: "unverified",
        reason: "feedback Base disagrees with the historical task Base",
      };
    const resolvedFeedbackBase = await git.resolveCommit(root, range.base);
    const resolvedFeedbackHead = await git.resolveCommit(root, range.head);
    if (
      resolvedFeedbackBase.status !== 0 ||
      text(resolvedFeedbackBase) !== range.base ||
      resolvedFeedbackHead.status !== 0 ||
      text(resolvedFeedbackHead) !== range.head
    )
      return {
        kind: "unverified",
        reason: "feedback history contains an unresolved range",
      };
    const baseOnFeedback = await isAncestor(git, root, base, range.head);
    const attemptOnFeedback = await isAncestor(git, root, attempt, range.head);
    const feedbackOnCurrent = await isAncestor(git, root, range.head, currentHead);
    if (
      baseOnFeedback !== true ||
      attemptOnFeedback !== true ||
      feedbackOnCurrent !== true
    )
      return {
        kind: "unverified",
        reason: "feedback Head does not contain the historical task range",
      };
  }
  return { kind: "verified", base, attempt };
};
