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
import { validateScopeExpansions } from "./scope-expansions.js";
import { taskCheckpointHistoryAt, taskLedgerHistoryAt } from "./task-ledger-history.js";
import { inspectTaskAdmissionHistory, type TaskAdmissionHistory } from "./task-admission-history.js";
import { inspectTaskPublicationHistory } from "./task-publication-history.js";

export interface TaskFeedbackRange {
  readonly base: string;
  readonly head: string;
}

export type TaskFeedbackRangesResult =
  | { readonly kind: "valid"; readonly ranges: readonly TaskFeedbackRange[] }
  | { readonly kind: "unverified"; readonly reason: string };

export type TaskCheckpointResult =
  | { readonly kind: "not-started"; readonly base?: string; readonly admissionRequired?: true }
  | {
      readonly kind: "verified";
      readonly base: string;
      readonly attempt: string;
      readonly head?: string;
    }
  | { readonly kind: "unverified"; readonly reason: string };

export interface TaskCheckpointGit {
  readonly ledgerHistory?: import("./task-ledger-history.js").TaskLedgerHistory;
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

const historyAt = (
  git: TaskCheckpointGit,
  root: string,
  head: string,
): TaskCheckpointGit => ({
  ...git,
  pathHistory: async (directory, source) => {
    const history = await git.pathHistory(directory, source);
    if (history.status !== 0 || directory !== root) return history;
    const commits: string[] = [];
    for (const candidate of history.stdout.split(/\r?\n/).filter(Boolean)) {
      const relation = await isAncestor(git, root, candidate, head);
      if (relation === undefined)
        return {
          status: 2,
          stdout: "",
          stderr: "task progress history cannot be bounded to its approval",
        };
      if (relation) commits.push(candidate);
    }
    return { ...history, stdout: commits.join("\n") };
  },
});

const legacySerialApprovalBase = async (
  git: TaskCheckpointGit,
  root: string,
  sourcePath: string,
  task: number,
  change: string,
  reservation: string,
): Promise<string | undefined> => {
  const planPath = sourcePath.replace(/\/tasks\/task-[1-9][0-9]*\/progress\.md$/, "/plan.md");
  const planBlob = await git.blobAt(root, reservation, planPath);
  if (planBlob.status !== 0) return undefined;
  const planArtifact = recognized(
    await createArtifactReader({ readFile: () => planBlob.stdout })(planPath),
  );
  const plan = planArtifact === undefined ? undefined : validateArtifact(planArtifact);
  if (plan?._tag !== "valid" || plan.artifact !== "plan" || plan.body.workflow.plan?.execution?.version === 2)
    return undefined;
  const position = plan.body.workflow.plan?.executionOrder.indexOf(task) ?? -1;
  if (position < 1) return undefined;
  const predecessor = plan.body.workflow.plan?.executionOrder[position - 1];
  if (predecessor === undefined || git.changedPaths === undefined) return undefined;
  const changePath = sourcePath.replace(/\/tasks\/task-[1-9][0-9]*\/progress\.md$/, "");
  const ledgerPath = `${changePath}/progress.md`;
  const feedbackPath = `${changePath}/tasks/task-${predecessor}/feedback.md`;
  const predecessorProgressPath = `${changePath}/tasks/task-${predecessor}/progress.md`;
  const feedbackHistory = await git.pathHistory(root, feedbackPath);
  if (feedbackHistory.status !== 0) return undefined;
  const reachable: string[] = [];
  for (const candidate of feedbackHistory.stdout.split(/\r?\n/).filter(Boolean)) {
    if (!fullCommit(candidate)) return undefined;
    const relation = await isAncestor(git, root, candidate, reservation);
    if (relation === undefined) return undefined;
    if (relation) reachable.push(candidate);
  }
  const latestCandidates: string[] = [];
  for (const candidate of reachable) {
    let latest = true;
    for (const other of reachable) {
      if (candidate === other) continue;
      const follows = await isAncestor(git, root, candidate, other);
      if (follows === undefined) return undefined;
      if (follows) {
        latest = false;
        break;
      }
    }
    if (latest) latestCandidates.push(candidate);
  }
  if (latestCandidates.length !== 1) return undefined;
  const candidate = latestCandidates[0];
  if (candidate === undefined) return undefined;
  const changed = await git.changedPaths(root, candidate);
  if (changed.status !== 0 || changed.stdout.split("\0").filter(Boolean).join("\n") !== feedbackPath)
    return undefined;
  const feedbackBlob = await git.blobAt(root, candidate, feedbackPath);
  const ledgerBlob = await git.blobAt(root, candidate, ledgerPath);
  if (feedbackBlob.status !== 0 || ledgerBlob.status !== 0) return undefined;
  const feedbackArtifact = recognized(
    await createArtifactReader({ readFile: () => feedbackBlob.stdout })(feedbackPath),
  );
  const ledgerArtifact = recognized(
    await createArtifactReader({ readFile: () => ledgerBlob.stdout })(ledgerPath),
  );
  const feedback = feedbackArtifact === undefined ? undefined : validateArtifact(feedbackArtifact);
  const ledger = ledgerArtifact === undefined ? undefined : validateArtifact(ledgerArtifact);
  if (feedbackArtifact === undefined || ledgerArtifact === undefined || feedback?._tag !== "valid" || feedback.artifact !== "feedback" || ledger?._tag !== "valid" || ledger.artifact !== "progress")
    return undefined;
  const predecessorEntry = Array.isArray(ledger.metadata.tasks)
    ? ledger.metadata.tasks.find((entry) =>
      typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).id === predecessor,
    ) as Record<string, unknown> | undefined
    : undefined;
  if (predecessorEntry?.status !== "done") return undefined;
  const passes = parseReviewPasses(feedbackArtifact);
  if (passes.diagnostics.length > 0 || passes.latest?.verdict !== "approved") return undefined;
  const ranges = await readTaskFeedbackRanges(feedbackPath, feedbackBlob.stdout, change, predecessor);
  if (ranges.kind !== "valid") return undefined;
  const latestRange = ranges.ranges.at(-1);
  if (latestRange === undefined) return undefined;
  const boundaryLedgerBlob = await git.blobAt(root, reservation, ledgerPath);
  if (boundaryLedgerBlob.status !== 0) return undefined;
  const boundaryLedgerArtifact = recognized(
    await createArtifactReader({ readFile: () => boundaryLedgerBlob.stdout })(ledgerPath),
  );
  const boundaryLedger = boundaryLedgerArtifact === undefined ? undefined : validateArtifact(boundaryLedgerArtifact);
  const boundaryEntry = boundaryLedger?._tag === "valid" && boundaryLedger.artifact === "progress" && boundaryLedger.metadata.change === change && Array.isArray(boundaryLedger.metadata.tasks)
    ? boundaryLedger.metadata.tasks.find((entry) =>
      typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).id === predecessor,
    ) as Record<string, unknown> | undefined
    : undefined;
  if (boundaryEntry?.status !== "done") return undefined;
  const boundaryProgressBlob = await git.blobAt(root, reservation, predecessorProgressPath);
  if (boundaryProgressBlob.status !== 0) return undefined;
  const boundaryProgressArtifact = recognized(
    await createArtifactReader({ readFile: () => boundaryProgressBlob.stdout })(predecessorProgressPath),
  );
  const boundaryProgress = boundaryProgressArtifact === undefined ? undefined : validateArtifact(boundaryProgressArtifact);
  if (boundaryProgress?._tag !== "valid" || boundaryProgress.artifact !== "task-progress" || boundaryProgress.metadata.change !== change || boundaryProgress.metadata.task !== predecessor || boundaryProgress.metadata.status !== "done")
    return undefined;
  const predecessorHistory = await historyAt(git, root, reservation).pathHistory(root, predecessorProgressPath);
  if (predecessorHistory.status !== 0) return undefined;
  const predecessorAttempts = await taskAttemptCommits(
    git,
    root,
    predecessorProgressPath,
    predecessor,
    change,
    predecessorHistory.stdout.split(/\r?\n/).filter(Boolean),
  );
  if (typeof predecessorAttempts === "string" || predecessorAttempts.length === 0) return undefined;
  for (const attempt of predecessorAttempts)
    if (await isAncestor(git, root, attempt, latestRange.head) !== true) return undefined;
  const checkpoint = await resolveTaskCheckpoint(
    historyAt(git, root, candidate),
    root,
    predecessorProgressPath,
    predecessor,
    change,
    candidate,
    ranges.ranges,
  );
  return checkpoint.kind === "verified" && checkpoint.base === latestRange.base
    ? candidate
    : undefined;
};

const legacyScopePreparationBase = async (
  git: TaskCheckpointGit,
  root: string,
  sourcePath: string,
  task: number,
  change: string,
  currentHead: string,
  commits: readonly string[],
): Promise<string | undefined | { readonly reason: string }> => {
  const preceding: { readonly artifact: RecognizedArtifact; readonly commit: string }[] = [];
  const chronological = commits.toReversed();
  for (const commit of chronological) {
    const blob = await git.blobAt(root, commit, sourcePath);
    if (blob.status !== 0) continue;
    const artifact = recognized(
      await createArtifactReader({ readFile: () => blob.stdout })(sourcePath),
    );
    if (artifact === undefined) continue;
    if (!Object.hasOwn(artifact.metadata, "scope_expansions")) {
      preceding.push({ artifact, commit });
      continue;
    }
    if (
      artifact.metadata.artifact !== "task-progress" ||
      artifact.metadata.change !== change ||
      artifact.metadata.task !== task ||
      artifactContracts["task-progress"].validate(artifact).length > 0 ||
      validateArtifactBody(artifact, "task-progress", "historical").diagnostics.length > 0
    )
      return { reason: "scope preparation authority is malformed" };
    const entries = validateScopeExpansions(artifact.metadata.scope_expansions);
    if (entries.kind !== "valid")
      return { reason: "scope preparation authority is malformed" };
    if (entries.entries.length === 0) {
      preceding.push({ artifact, commit });
      continue;
    }
    if (preceding.length === 0)
      return { reason: "scope preparation lacks preceding task history" };
    for (const earlier of preceding) {
      if (
        earlier.artifact.metadata.artifact !== "task-progress" ||
        earlier.artifact.metadata.change !== change ||
        earlier.artifact.metadata.task !== task ||
        artifactContracts["task-progress"].validate(earlier.artifact).length > 0
      )
        return { reason: "scope preparation authority is malformed" };
      if (
        validateArtifactBody(earlier.artifact, "task-progress", "historical").workflow.records.some(
          (record) => record.kind === "attempt",
        )
      )
        return undefined;
    }
    if (git.changedPaths === undefined)
      return { reason: "scope preparation changed paths are unavailable" };
    const changed = await git.changedPaths(root, commit);
    const paths = changed.stdout.split("\0").filter(Boolean);
    if (changed.status !== 0 || paths.length !== 1 || paths[0] !== sourcePath)
      return { reason: "scope preparation is not task-progress-only" };
    const fallback = preceding[0]?.commit;
    const base = await legacySerialApprovalBase(
      git,
      root,
      sourcePath,
      task,
      change,
      commit,
    ) ?? fallback;
    if (base === undefined || !fullCommit(base))
      return { reason: "scope preparation has no resolvable pre-production baseline" };
    const resolved = await git.resolveCommit(root, base);
    if (resolved.status !== 0 || text(resolved) !== base)
      return { reason: "scope preparation baseline is unresolved" };
    if ((await isAncestor(git, root, base, commit)) !== true)
      return { reason: "scope preparation ancestry is invalid" };
    if ((await isAncestor(git, root, base, currentHead)) !== true)
      return { reason: "scope preparation baseline is not on current history" };
    return base;
  }
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
  git = taskCheckpointHistoryAt(git, root, sourcePath, currentHead);
  if (!fullCommit(currentHead))
    return { kind: "unverified", reason: "current HEAD is unresolved" };
  const resolvedHead = await git.resolveCommit(root, currentHead);
  if (resolvedHead.status !== 0 || text(resolvedHead) !== currentHead)
    return { kind: "unverified", reason: "current HEAD is unresolved" };
  const planPath = sourcePath.replace(/\/tasks\/task-[1-9][0-9]*\/progress\.md$/, "/plan.md");
  const planBlob = await git.blobAt(root, currentHead, planPath);
  let admission: TaskAdmissionHistory | undefined;
  if (planBlob.status === 0) {
    const planRead = await createArtifactReader({ readFile: () => planBlob.stdout })(planPath);
    if (planRead._tag === "recognized" && planRead.metadata.artifact === "plan" && typeof planRead.metadata.execution === "object" && planRead.metadata.execution !== null && (planRead.metadata.execution as Record<string, unknown>).version === 2) {
      const plan = validateArtifact(planRead);
      if (plan._tag !== "valid" || plan.body.workflow.plan?.execution?.version !== 2) return { kind: "unverified", reason: "committed dependency-mode plan is unverified" };
      admission = await inspectTaskAdmissionHistory(git, root, planPath.replace(/plan\.md$/, "progress.md"), task, change, currentHead);
      if (admission.kind === "unverified") return admission;
    }
  }
  if (admission === undefined && planBlob.status === 0) {
    const ledgerPath = planPath.replace(/plan\.md$/, "progress.md");
    const collected = taskLedgerHistoryAt(git, root, ledgerPath, currentHead);
    const ledgerHistory = collected?.history ?? await git.pathHistory(root, ledgerPath);
    if (ledgerHistory.status === 0) for (const revision of ledgerHistory.stdout.trim().split(/\r?\n/).filter(Boolean)) {
      const ledger = collected?.blobs.get(revision) ?? await git.blobAt(root, revision, ledgerPath);
      if (ledger.status !== 0 || !ledger.stdout.includes("admission")) continue;
      const read = await createArtifactReader({ readFile: () => ledger.stdout })(ledgerPath);
      const contract = validateArtifact(read);
      const entry = contract._tag === "valid" && contract.artifact === "progress" && Array.isArray(contract.metadata.tasks)
        ? contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task) as Record<string, unknown> | undefined
        : undefined;
      if (entry && Object.hasOwn(entry, "admission")) return { kind: "unverified", reason: "admitted dependency-mode plan was downgraded; original authority is required" };
    }
  }
  const history = await git.pathHistory(root, sourcePath);
  if (history.status !== 0)
    return { kind: "unverified", reason: "task progress history is unavailable" };
  const commits = history.stdout
    .split(/\r?\n/)
    .map((commit) => commit.trim())
    .filter(Boolean);
  const legacyBase = admission === undefined
    ? await legacyScopePreparationBase(git, root, sourcePath, task, change, currentHead, commits)
    : undefined;
  if (typeof legacyBase === "object") return { kind: "unverified", reason: legacyBase.reason };
  const originalBase = admission?.kind === "verified" ? admission.original.base : legacyBase;
  const scopes = await inspectScopeExpansionHistory({
    ...git,
    changedPaths: git.changedPaths ?? (() => ({ status: 2, stdout: "", stderr: "scope changed-path port is unavailable" })),
    pathChanges: git.pathChanges ?? (() => ({ status: 2, stdout: "", stderr: "scope path-history port is unavailable" })),
  }, root, sourcePath, task, change, currentHead, undefined, originalBase);
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
      ? admission?.kind === "verified" ? { kind: "not-started", base: admission.original.base } : admission?.kind === "absent" ? { kind: "not-started", admissionRequired: true } : { kind: "not-started" }
      : {
          kind: "unverified",
          reason: "feedback exists without a committed task attempt",
        };
  if (admission?.kind === "absent") return { kind: "unverified", reason: "dependency-mode attempt lacks original admission authority" };
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
  const base = originalBase ?? text(parentResult);
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
  const publication = admission?.kind === "verified"
    ? await inspectTaskPublicationHistory(git, root, planPath.replace(/plan\.md$/, "progress.md"), task, change, currentHead, admission.commit)
    : undefined;
  if (publication?.kind === "unverified") return publication;
  const integratedHead = publication?.kind === "verified" ? publication.publication.integratedHead : undefined;
  for (const range of feedbackRanges) {
    if (integratedHead && (await git.isAncestor(root, integratedHead, range.head)).status !== 0) return { kind: "unverified", reason: "feedback Head omits the actual integrated task range" };
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
  return { kind: "verified", base, attempt, ...(integratedHead ? { head: integratedHead } : {}) };
};
