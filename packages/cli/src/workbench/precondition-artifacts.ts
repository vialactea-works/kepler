import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact, type ArtifactContractResult } from "./artifact-contracts.js";
import {
  progressLedgerMatches,
  taskBreakdownDigestFromDefinitions,
} from "./artifact-body.js";
import type {
  ValidArtifactContract,
} from "./artifact-types.js";
import {
  fullCommit,
  gitBlobAt,
  gitBlobIdAt,
  gitCommitFiles,
  gitCommand,
  gitCurrentHead,
  gitFirstParent,
  gitHeadBlob,
  gitIsAncestor,
  gitLatestCommit,
  gitPathHistory,
  gitResolveCommit,
  gitStagedDiff,
  gitWorktreeBlob,
  relativePath,
  successful,
  text,
} from "./precondition-git.js";
import type { PreconditionRuntime } from "./precondition-runtime.js";
import { inspectExecutionTransition, inspectInputImpact, taskTitleAbandoned, type InputImpactInspection, type PlanHistoryRuntime } from "./plan-history.js";
import { legacyCompletedDefinitionProblems, legacyInputConfirmationMetadataProblems } from "./legacy-input-confirmation.js";
export { taskTitleAbandoned } from "./plan-history.js";
import {
  readTaskFeedbackRanges,
  resolveTaskCheckpoint,
  type TaskCheckpointGit,
  type TaskFeedbackRange,
} from "./task-checkpoint.js";

export interface EvidenceRead {
  readonly artifact?: ValidArtifactContract;
  readonly source?: string;
  readonly reason?: string;
  readonly diagnostics?: readonly string[];
}

export const readContract = async (
  runtime: PreconditionRuntime,
  path: string,
  expected: ValidArtifactContract["artifact"],
): Promise<EvidenceRead> => {
  if (!(await runtime.fileSystem.pathExists(path))) return { reason: "missing" };
  if (!runtime.fileSystem.readFile) return { reason: "cannot read" };
  let source: string;
  try {
    source = await runtime.fileSystem.readFile(path);
  } catch {
    return { reason: "cannot read" };
  }
  const artifact = await createArtifactReader({ readFile: () => source })(path);
  const contract: ArtifactContractResult = validateArtifact(artifact);
  if (contract._tag !== "valid" || contract.artifact !== expected)
    return {
      reason: "malformed",
      ...(contract._tag === "invalid"
        ? { diagnostics: contract.diagnostics.map((item) =>
            "field" in item && item.field ? `${item.field}: ${item.message}` : item.message,
          ) }
        : {}),
    };
  return { artifact: contract, source };
};

export const durableArtifact = async (
  runtime: PreconditionRuntime,
  root: string,
  path: string,
): Promise<boolean> => {
  const relative = relativePath(root, path);
  if (relative.startsWith("..") || Path.isAbsolute(relative)) return false;
  const head = await gitHeadBlob(runtime, root, relative);
  const worktree = await gitWorktreeBlob(runtime, root, relative);
  if (
    !successful(head) ||
    !successful(worktree) ||
    text(head) !== text(worktree)
  )
    return false;
  return (await gitStagedDiff(runtime, root, relative)).status === 0;
};

export const exactArtifactCommit = async (
  runtime: PreconditionRuntime,
  root: string,
  path: string,
): Promise<boolean> => {
  if (!(await durableArtifact(runtime, root, path))) return false;
  const commit = text(
    await gitLatestCommit(runtime, root, relativePath(root, path)),
  );
  if (!fullCommit(commit)) return false;
  const files = (await gitCommitFiles(runtime, root, commit)).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  return files.length === 1 && files[0] === relativePath(root, path);
};

export interface TaskEvidence {
  readonly task: number;
  readonly title: string;
  readonly status: string;
  readonly progressPath: string;
  readonly feedbackPath: string;
  readonly implementation?: string;
  readonly checkpoint:
    | { readonly kind: "verified"; readonly base: string }
    | { readonly kind: "unverified"; readonly reason: string };
}

export interface TaskInspection {
  readonly passed: boolean;
  readonly output: string;
  readonly tasks: readonly TaskEvidence[];
  readonly planTitle?: string;
  readonly planDurable: boolean;
  readonly changePath: string;
  readonly executionTransitionValid: boolean;
}

export const titleOf = (
  artifact: ValidArtifactContract,
  prefix: string,
): string | null => {
  const titles = artifact.body.headings.filter(
    (heading) => heading.level === 1,
  );
  if (titles.length !== 1 || !titles[0]?.text.startsWith(prefix)) return null;
  return titles[0].text.slice(prefix.length);
};

const formalIntentFiles = async (
  runtime: PreconditionRuntime,
  changeDir: string,
): Promise<readonly { readonly path: string; readonly kind: "proposal" | "design" | "requirements-change" }[]> => {
  const files: Array<{ readonly path: string; readonly kind: "proposal" | "design" | "requirements-change" }> = [];
  for (const name of ["proposal.md", "design.md"] as const) {
    const path = Path.join(changeDir, name);
    if (await runtime.fileSystem.pathExists(path))
      files.push({ path, kind: name === "proposal.md" ? "proposal" : "design" });
  }
  const requirements = Path.join(changeDir, "requirements");
  if (await runtime.fileSystem.directoryExists(requirements)) {
    if (!runtime.fileSystem.readDirectory)
      throw new Error("requirements directory cannot be enumerated");
    for (const name of (await runtime.fileSystem.readDirectory(requirements)).filter((entry) => entry.endsWith(".md")).sort())
      files.push({ path: Path.join(requirements, name), kind: "requirements-change" });
  }
  return files;
};

const inspectIntentApprovals = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  plan: ValidArtifactContract,
): Promise<{
  readonly problems: readonly string[];
  readonly approvals: ReadonlyMap<string, { readonly commit: string; readonly relativePath: string }>;
  readonly currentHead?: string;
}> => {
  const problems: string[] = [];
  const planContract = plan.body.workflow.plan;
  const references = planContract?.intentApprovals ?? [];
  let formalFiles: Awaited<ReturnType<typeof formalIntentFiles>>;
  try {
    formalFiles = await formalIntentFiles(runtime, changeDir);
  } catch {
    return {
      problems: ["formal intent inputs cannot be enumerated"],
      approvals: new Map(),
    };
  }
  const headResult = await gitCurrentHead(runtime, root);
  const head = text(headResult);
  if (!successful(headResult) || !fullCommit(head))
    problems.push("current intent revision is unresolved");
  const paths = new Map(references.map((reference) => [reference.path, reference]));
  const approvals = new Map<string, { readonly commit: string; readonly relativePath: string }>();
  for (const formal of formalFiles) {
    const relative = relativePath(changeDir, formal.path);
    const read = await readContract(runtime, formal.path, formal.kind);
    if (!read.artifact) {
      problems.push(`${relative} ${read.reason ?? "is malformed"}`);
      continue;
    }
    if (read.artifact.metadata.status !== "approved" || read.artifact.metadata.decision !== "accepted")
      problems.push(`${relative} is not explicitly approved`);
    if (!(await durableArtifact(runtime, root, formal.path)))
      problems.push(`${relative} working bytes or index are not committed exactly at HEAD`);
    const reference = paths.get(relative);
    if (!reference) {
      problems.push(`${relative} has no committed intent approval reference`);
      continue;
    }
    paths.delete(relative);
    const resolved = await gitResolveCommit(runtime, root, reference.commit);
    if (!successful(resolved) || text(resolved) !== reference.commit) {
      problems.push(`${relative} approval reference ${reference.reference} does not resolve to its full commit`);
      continue;
    }
    if (!fullCommit(head) || !successful(await gitIsAncestor(runtime, root, reference.commit, head)))
      problems.push(`${relative} approval commit is not reachable from current HEAD`);
    const repoPath = relativePath(root, formal.path);
    const approvedBlob = await gitBlobIdAt(runtime, root, reference.commit, repoPath);
    const currentBlob = await gitHeadBlob(runtime, root, repoPath);
    if (
      !successful(approvedBlob) ||
      !successful(currentBlob) ||
      text(approvedBlob) !== text(currentBlob)
    )
      problems.push(`${relative} changed after its recorded approval`);
    approvals.set(relative, { commit: reference.commit, relativePath: repoPath });
  }
  for (const reference of paths.values())
    problems.push(`intent approval reference has no current formal input: ${reference.path}`);
  return {
    problems,
    approvals,
    ...(fullCommit(head) ? { currentHead: head } : {}),
  };
};

const inspectInitialScaffold = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  plan: ValidArtifactContract,
  head: string,
): Promise<readonly string[]> => {
  const proof = plan.body.workflow.plan?.initialization;
  if (!proof) return [];
  const problems: string[] = [];
  const resolved = await gitResolveCommit(runtime, root, proof.base);
  if (!successful(resolved) || text(resolved) !== proof.base)
    problems.push("initialization base does not resolve to its recorded full commit");
  else if (!successful(await gitIsAncestor(runtime, root, proof.base, head)))
    problems.push("initialization base is not an ancestor of current HEAD");
  const changePath = relativePath(root, changeDir);
  const planPath = `${changePath}/plan.md`;
  const progressPath = `${changePath}/progress.md`;
  const taskProgressPaths = proof.taskIds.map(
    (task) => `${changePath}/tasks/task-${task}/progress.md`,
  );
  const scaffoldPaths = [planPath, progressPath, ...taskProgressPaths];
  const historyPaths = [
    ...scaffoldPaths,
    ...proof.taskIds.map((task) => `${changePath}/tasks/task-${task}/feedback.md`),
  ];
  const firstCommitByPath = new Map<string, string>();
  const directInitializationCommits = new Set<string>();
  for (const path of historyPaths) {
    if (successful(await gitBlobIdAt(runtime, root, proof.base, path)))
      problems.push(`initialization base already contains scaffold artifact ${path}`);
    const history = await gitPathHistory(runtime, root, path);
    if (!successful(history)) {
      problems.push(`initialization history for ${path} cannot be verified`);
      continue;
    }
    const commits = history.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
    const postBase: string[] = [];
    for (const commit of commits) {
      const ancestry = await gitIsAncestor(runtime, root, commit, proof.base);
      if (successful(ancestry)) {
        problems.push(`initialization artifact ${path} has history before its recorded base`);
        continue;
      }
      if (ancestry.status !== 1) {
        problems.push(`initialization history for ${path} cannot be ordered against its base`);
        continue;
      }
      postBase.push(commit);
    }
    if (!scaffoldPaths.includes(path)) continue;
    const first = postBase.at(-1);
    if (!first) {
      problems.push(`initial scaffold artifact ${path} has no committed initial version`);
      continue;
    }
    firstCommitByPath.set(path, first);
    const parent = await gitFirstParent(runtime, root, first);
    if (successful(parent) && text(parent) === proof.base)
      directInitializationCommits.add(first);
  }
  if (directInitializationCommits.size !== 1)
    problems.push("initialization base is not the HEAD immediately before scaffold history");
  const initialCommit = [...directInitializationCommits][0];
  if (!initialCommit) return problems;
  for (const [path, first] of firstCommitByPath)
    if (!successful(await gitIsAncestor(runtime, root, initialCommit, first)))
      problems.push(`initial scaffold history for ${path} is not descended from its recorded base`);
  const historicalArtifact = async (
    path: string,
    commit: string,
  ): Promise<ValidArtifactContract | undefined> => {
    const source = await gitBlobAt(runtime, root, commit, path);
    if (!successful(source)) return undefined;
    const artifact = await createArtifactReader({ readFile: () => source.stdout })(path);
    const contract = validateArtifact(artifact);
    return contract._tag === "valid" ? contract : undefined;
  };
  const initialPlanCommit = firstCommitByPath.get(planPath);
  const initialPlan = initialPlanCommit
    ? await historicalArtifact(planPath, initialPlanCommit)
    : undefined;
  const initialProjection =
    initialPlan?.artifact === "plan" ? initialPlan.body.workflow.plan : undefined;
  if (
    !initialProjection?.initialization ||
    initialProjection.initialization.base !== proof.base ||
    initialProjection.initialization.authority !== proof.authority ||
    initialProjection.initialization.breakdown !== proof.breakdown ||
    !sameList(initialProjection.initialization.taskIds, proof.taskIds) ||
    !sameList(initialProjection.identityOrder, proof.taskIds)
  )
    problems.push("initial plan revision does not contain the authorized task breakdown proof");
  else if (
    proof.taskIds.some((taskId) => {
      const task = initialProjection.tasks.find((entry) => entry.id === taskId);
      return !task?.filesDeclared || taskTitleAbandoned(task.title);
    })
  )
    problems.push("initial plan revision does not contain active tasks with explicit Files scopes");
  else if (
    taskBreakdownDigestFromDefinitions(proof.taskIds, initialProjection.tasks) !==
    proof.breakdown
  )
    problems.push("initial plan task definitions do not match the authorized breakdown");
  const initialProgressCommit = firstCommitByPath.get(progressPath);
  const initialProgress = initialProgressCommit
    ? await historicalArtifact(progressPath, initialProgressCommit)
    : undefined;
  const progressRecords =
    initialProgress?.artifact === "progress"
      ? initialProgress.body.workflow.records.filter((record) => record.kind === "task")
      : [];
  if (
    initialProgress?.artifact !== "progress" ||
    !progressLedgerMatches(initialProgress.metadata.tasks, progressRecords) ||
    progressRecords.length !== proof.taskIds.length ||
    progressRecords.some(
      (record) =>
        typeof record.number !== "number" ||
        !proof.taskIds.includes(record.number) ||
        record.fields.Status !== "pending",
    ) ||
    !Array.isArray(initialProgress.metadata.tasks) ||
    initialProgress.metadata.tasks.some(
      (entry) => !isMetadataRecord(entry) || entry.status !== "pending",
    )
  )
    problems.push("initial root progress revision was not a complete pending ledger");
  for (const taskId of proof.taskIds) {
    const taskPath = `${changePath}/tasks/task-${taskId}/progress.md`;
    const taskInitialCommit = firstCommitByPath.get(taskPath);
    const taskArtifact = taskInitialCommit
      ? await historicalArtifact(taskPath, taskInitialCommit)
      : undefined;
    if (
      taskArtifact?.artifact !== "task-progress" ||
      taskArtifact.metadata.task !== taskId ||
      taskArtifact.metadata.change !== Path.basename(changeDir) ||
      taskArtifact.metadata.status !== "pending" ||
      taskArtifact.body.workflow.records.some((record) => record.kind === "attempt")
    )
      problems.push(`Task ${taskId} initial progress was not pending and history-free`);
  }
  return problems;
};

const inspectLegacyInputConfirmation = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  plan: ValidArtifactContract,
  task: number,
  implementation: string | undefined,
  repositoryIdentity: string | undefined,
  approvals: ReadonlyMap<string, { readonly commit: string; readonly relativePath: string }>,
  currentHead: string | undefined,
  inputImpact: InputImpactInspection,
  checkpoint: TaskEvidence["checkpoint"],
): Promise<readonly string[]> => {
  const projection = plan.body.workflow.plan;
  const taskContract = projection?.tasks.find((entry) => entry.id === task);
  const confirmation = projection?.legacyInputConfirmations?.find((entry) => entry.task === task);
  if (!projection || !taskContract || !confirmation)
    return [`Task ${task} input context is missing; legacy inputs need a scoped current confirmation`];
  const problems: string[] = [];
  const retainsInput = (path: string): boolean =>
    inputImpact.problems.length === 0 && inputImpact.unaffectedInputs.get(path)?.has(task) === true;
  if (checkpoint.kind !== "verified")
    problems.push(`Task ${task} historical task/Base/range identity is unverified: ${checkpoint.reason}`);
  if (repositoryIdentity === undefined || confirmation.repository !== repositoryIdentity)
    problems.push(`Task ${task} legacy input confirmation belongs to a different repository`);
  if (confirmation.taskDefinition !== taskContract.definitionDigest)
    problems.push(`Task ${task} legacy input confirmation does not match its task definition`);
  problems.push(...legacyInputConfirmationMetadataProblems(confirmation).map((problem) => `Task ${task} ${problem}`));
  if (currentHead === undefined || !fullCommit(currentHead))
    problems.push(`Task ${task} current confirmation revision is unresolved`);
  const planPath = Path.join(changeDir, "plan.md");
  if (!(await durableArtifact(runtime, root, planPath)))
    problems.push(`Task ${task} legacy input confirmation plan is not committed exactly at HEAD`);
  if (implementation === undefined)
    problems.push(`Task ${task} historical implementation is unverifiable for legacy input confirmation`);
  else {
    const planRepoPath = relativePath(root, planPath);
    const historicalSource = await gitBlobAt(runtime, root, implementation, planRepoPath);
    const historicalRead = successful(historicalSource)
      ? await createArtifactReader({ readFile: () => text(historicalSource) })(planRepoPath)
      : undefined;
    const historicalPlanRead = historicalRead ? validateArtifact(historicalRead) : undefined;
    const historicalProjection =
      historicalPlanRead?._tag === "valid" && historicalPlanRead.artifact === "plan"
        ? historicalPlanRead.body.workflow.plan
        : undefined;
    const historicalTask = historicalProjection?.tasks.find((entry) => entry.id === task);
    if (
      !historicalTask ||
      historicalTask.inputContext !== undefined ||
      historicalTask.definitionDigest !== taskContract.definitionDigest
    )
      problems.push(`Task ${task} historical task contract or missing provenance cannot be verified`);
    const paths = new Set([
      ...(historicalProjection?.intentApprovals ?? []),
      ...projection.intentApprovals,
    ].map((reference) => reference.path));
    for (const path of paths) {
      const historical = historicalProjection?.intentApprovals.find((reference) => reference.path === path);
      const current = projection.intentApprovals.find((reference) => reference.path === path);
      if (historical?.commit === current?.commit && historical?.reference === current?.reference) continue;
      const repoPath = relativePath(root, Path.resolve(changeDir, path));
      if (!retainsInput(repoPath))
        problems.push(`Task ${task} approval reference changed without validated unaffected input impact: ${path}`);
    }
  }
  if (projection.inputImpact && inputImpact.problems.length > 0)
    problems.push(`Task ${task} input-impact history is not validated`);
  for (const change of projection.inputImpact?.changes ?? [])
    if (change.affectedTasks.includes(task))
      problems.push(`Task ${task} is affected by changed input ${change.path} and needs new work`);
  const inputsByPath = new Map(confirmation.inputs.map((input) => [input.path, input.blob]));
  const intentIsCommit = fullCommit(confirmation.intentCommit);
  if (approvals.size > 0 && !intentIsCommit)
    problems.push(`Task ${task} formal approval revision is not a full commit`);
  if (
    approvals.size === 0 &&
    confirmation.intentCommit !== `tactical:${confirmation.ownerReference}`
  )
    problems.push(`Task ${task} tactical authority reference does not bind its owner reference`);
  if (intentIsCommit) {
    const resolved = await gitResolveCommit(runtime, root, confirmation.intentCommit);
    if (!successful(resolved) || text(resolved) !== confirmation.intentCommit)
      problems.push(`Task ${task} current confirmation intent revision does not resolve`);
    if (
      currentHead === undefined ||
      !successful(await gitIsAncestor(runtime, root, confirmation.intentCommit, currentHead))
    )
      problems.push(`Task ${task} current confirmation intent revision is not reachable from HEAD`);
  }
  for (const input of confirmation.inputs) {
    const absolute = Path.resolve(root, input.path);
    const repoPath = relativePath(root, absolute);
    if (repoPath !== input.path || repoPath.startsWith("..") || Path.isAbsolute(repoPath)) {
      problems.push(`Task ${task} legacy input path is not repository-relative: ${input.path}`);
      continue;
    }
    const current = await gitHeadBlob(runtime, root, repoPath);
    const working = await gitWorktreeBlob(runtime, root, repoPath);
    const staged = await gitStagedDiff(runtime, root, repoPath);
    if (
      !successful(current) ||
      !successful(working) ||
      !successful(staged) ||
      text(current) !== input.blob ||
      text(working) !== input.blob ||
      staged.status !== 0
    )
      problems.push(`Task ${task} legacy current input is dirty or changed: ${input.path}`);
    if (intentIsCommit) {
      const recorded = await gitBlobIdAt(runtime, root, confirmation.intentCommit, repoPath);
      if (!successful(recorded) || text(recorded) !== input.blob)
        problems.push(`Task ${task} intent revision does not contain current input ${input.path}`);
    }
  }
  for (const [path, approval] of approvals) {
    const inputBlob = inputsByPath.get(approval.relativePath);
    if (inputBlob === undefined) {
      problems.push(`Task ${task} legacy input confirmation omits approved formal input ${path}`);
      continue;
    }
    const approved = await gitBlobIdAt(runtime, root, approval.commit, approval.relativePath);
    const current = await gitHeadBlob(runtime, root, approval.relativePath);
    if (
      !successful(approved) ||
      !successful(current) ||
      text(approved) !== inputBlob ||
      text(current) !== inputBlob
    )
      problems.push(`Task ${task} legacy confirmation does not bind current approved input ${path}`);
    if (intentIsCommit) {
      if (!successful(await gitIsAncestor(runtime, root, approval.commit, confirmation.intentCommit)))
        problems.push(`Task ${task} intent revision predates approval of ${path}`);
      const intentBlob = await gitBlobIdAt(runtime, root, confirmation.intentCommit, approval.relativePath);
      if (!successful(intentBlob) || text(intentBlob) !== inputBlob)
        problems.push(`Task ${task} intent revision does not contain approved input ${path}`);
    }
  }
  if (checkpoint.kind === "verified" && problems.length === 0) {
    const frozenProblems = await legacyCompletedDefinitionProblems(
      checkpointGit(runtime),
      root,
      relativePath(root, Path.join(changeDir, "tasks", `task-${task}`, "progress.md")),
      relativePath(root, planPath),
      Path.basename(changeDir),
      task,
      taskContract.definitionDigest,
    );
    problems.push(...frozenProblems.map((problem) => `Task ${task} ${problem}`));
  }
  return problems;
};

const inspectTaskInputContext = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  plan: ValidArtifactContract,
  task: number,
  implementation: string | undefined,
  repositoryIdentity: string | undefined,
  approvals: ReadonlyMap<string, { readonly commit: string; readonly relativePath: string }>,
  currentHead: string | undefined,
  inputImpact: InputImpactInspection,
  checkpoint: TaskEvidence["checkpoint"],
): Promise<readonly string[]> => {
  const taskContract = plan.body.workflow.plan?.tasks.find((entry) => entry.id === task);
  const context = taskContract?.inputContext;
  if (!context)
    return inspectLegacyInputConfirmation(
      runtime,
      root,
      changeDir,
      plan,
      task,
      implementation,
      repositoryIdentity,
      approvals,
      currentHead,
      inputImpact,
      checkpoint,
    );
  const problems: string[] = [];
  let taskApprovals = approvals;
  let retainedHistoricalImpact = false;
  const retainsInput = (path: string): boolean =>
    inputImpact.problems.length === 0 && inputImpact.unaffectedInputs.get(path)?.has(task) === true;
  if (implementation !== undefined) {
    const planPath = relativePath(root, Path.join(changeDir, "plan.md"));
    const historicalPlanSource = await gitBlobAt(runtime, root, implementation, planPath);
    const historicalPlanRead = successful(historicalPlanSource)
      ? await createArtifactReader({ readFile: () => text(historicalPlanSource) })(planPath)
      : undefined;
    const historicalPlan = historicalPlanRead
      ? validateArtifact(historicalPlanRead)
      : undefined;
    const historicalProjection =
      historicalPlan?._tag === "valid" && historicalPlan.artifact === "plan"
        ? historicalPlan.body.workflow.plan
        : undefined;
    const historicalTask = historicalProjection?.tasks.find((entry) => entry.id === task);
    const currentReferences = plan.body.workflow.plan?.intentApprovals ?? [];
    const historicalReferences = historicalProjection?.intentApprovals ?? [];
    if (
      !historicalTask ||
      JSON.stringify(historicalTask.inputContext) !== JSON.stringify(context)
    )
      problems.push(`Task ${task} input context was not committed before implementation`);
    const paths = new Set([...currentReferences, ...historicalReferences].map((reference) => reference.path));
    for (const path of paths) {
      const current = currentReferences.find((reference) => reference.path === path);
      const historical = historicalReferences.find((reference) => reference.path === path);
      const unchanged = current?.commit === historical?.commit && current?.reference === historical?.reference;
      if (!unchanged && !retainsInput(relativePath(root, Path.resolve(changeDir, path))))
        problems.push(`Task ${task} approval references changed without validated unaffected input impact: ${path}`);
    }
    const historicalApprovals = new Map<string, { readonly commit: string; readonly relativePath: string }>();
    for (const reference of historicalReferences) {
      const path = relativePath(root, Path.resolve(changeDir, reference.path));
      const source = await gitBlobAt(runtime, root, reference.commit, path);
      const read = successful(source)
        ? await createArtifactReader({ readFile: () => text(source) })(path)
        : undefined;
      const approved = read ? validateArtifact(read) : undefined;
      const blob = await gitBlobIdAt(runtime, root, reference.commit, path);
      const input = context.inputs.find((entry) => entry.path === path);
      if (
        approved?._tag !== "valid" ||
        !["proposal", "design", "requirements-change"].includes(approved.artifact) ||
        approved.metadata.change !== Path.basename(changeDir) ||
        approved.metadata.status !== "approved" ||
        approved.metadata.decision !== "accepted" ||
        !successful(blob) ||
        input?.blob !== text(blob)
      )
        problems.push(`Task ${task} historical formal approval is unverified: ${reference.path}`);
      historicalApprovals.set(reference.path, { commit: reference.commit, relativePath: path });
    }
    taskApprovals = historicalApprovals;
    if (
      historicalProjection &&
      JSON.stringify(historicalTask?.inputContext) === JSON.stringify(context) &&
      context.impactPlanCommit !== undefined &&
      context.impactPlanCommit !== inputImpact.planCommit &&
      inputImpact.planCommit !== undefined &&
      inputImpact.problems.length === 0 &&
      [...inputImpact.unaffectedInputs.values()].every((tasks) => tasks.has(task))
    ) {
      const originalImpact = await inspectInputImpact(
        planHistoryRuntime(runtime), root, changeDir, historicalProjection, implementation,
      );
      retainedHistoricalImpact = originalImpact.problems.length === 0 &&
        originalImpact.planCommit === context.impactPlanCommit;
      if (!retainedHistoricalImpact)
        problems.push(`Task ${task} historical input-impact handoff is unverified: ${originalImpact.problems.join("; ")}`);
    }
  }
  if (repositoryIdentity === undefined || context.repository !== repositoryIdentity)
    problems.push(`Task ${task} input context belongs to a different repository`);
  if (context.intentCommit.startsWith("tactical:")) {
    if (taskApprovals.size > 0)
      problems.push(`Task ${task} has formal inputs but records tactical authority`);
  } else if (fullCommit(context.intentCommit)) {
    const resolved = await gitResolveCommit(runtime, root, context.intentCommit);
    if (!successful(resolved) || text(resolved) !== context.intentCommit)
      problems.push(`Task ${task} intent revision does not resolve to its full commit`);
    if (
      currentHead === undefined ||
      !successful(await gitIsAncestor(runtime, root, context.intentCommit, currentHead))
    )
      problems.push(`Task ${task} intent revision is not reachable from current HEAD`);
    if (
      implementation !== undefined &&
      !successful(await gitIsAncestor(runtime, root, context.intentCommit, implementation))
    )
      problems.push(`Task ${task} implementation predates its intent revision`);
    const inputsByPath = new Map(context.inputs.map((input) => [input.path, input.blob]));
    for (const [path, approval] of taskApprovals) {
      if (!inputsByPath.has(approval.relativePath))
        problems.push(`Task ${task} input snapshot omits approved formal input ${path}`);
      if (!successful(await gitIsAncestor(runtime, root, approval.commit, context.intentCommit)))
        problems.push(`Task ${task} intent revision predates approval of ${path}`);
      const approvedIntentBlob = await gitBlobIdAt(
        runtime,
        root,
        context.intentCommit,
        approval.relativePath,
      );
      const currentIntentBlob = await gitHeadBlob(runtime, root, approval.relativePath);
      if (
        !successful(approvedIntentBlob) ||
        text(approvedIntentBlob) !== inputsByPath.get(approval.relativePath) ||
        (!retainsInput(approval.relativePath) &&
          (!successful(currentIntentBlob) || text(approvedIntentBlob) !== text(currentIntentBlob)))
      )
        problems.push(`Task ${task} intent revision does not contain current or retained approved input ${path}`);
    }
  } else {
    problems.push(`Task ${task} intent reference is neither a full commit nor explicit tactical authority`);
  }
  for (const input of context.inputs) {
    const current = await gitHeadBlob(runtime, root, input.path);
    if (
      (!successful(current) || text(current) !== input.blob) &&
      !retainsInput(input.path)
    )
      problems.push(`Task ${task} input changed since handoff: ${input.path}`);
  }
  if (context.impactPlanCommit !== undefined) {
    if (!retainedHistoricalImpact &&
      (context.impactPlanCommit !== inputImpact.planCommit || inputImpact.problems.length > 0))
      problems.push(`Task ${task} impactPlanCommit does not bind a validated current input-impact record`);
    const resolved = await gitResolveCommit(runtime, root, context.impactPlanCommit);
    if (!successful(resolved) || text(resolved) !== context.impactPlanCommit)
      problems.push(`Task ${task} impact plan commit does not resolve`);
    else if (
      implementation !== undefined &&
      !successful(await gitIsAncestor(runtime, root, context.impactPlanCommit, implementation))
    )
      problems.push(`Task ${task} implementation predates its impact plan`);
    if (!successful(await gitBlobIdAt(
      runtime,
      root,
      context.impactPlanCommit,
      relativePath(root, Path.join(changeDir, "plan.md")),
    )))
      problems.push(`Task ${task} impact plan revision does not contain plan.md`);
  }
  return problems;
};

const inspectCritiqueDisposition = async (
  runtime: PreconditionRuntime,
  changeDir: string,
): Promise<readonly string[]> => {
  const path = Path.join(changeDir, "critique.md");
  if (!(await runtime.fileSystem.pathExists(path))) return [];
  const critique = await readContract(runtime, path, "critique");
  if (!critique.artifact)
    return [`critique.md ${critique.reason ?? "is malformed"}`];
  const disposition = critique.artifact.body.workflow.critiqueDisposition;
  return disposition === "settled"
    ? []
    : [`critique disposition is ${disposition ?? "unavailable"}; owner resolution is required`];
};

const checkpointGit = (runtime: PreconditionRuntime): TaskCheckpointGit => ({
  pathHistory: (root, sourcePath) => gitPathHistory(runtime, root, sourcePath),
  blobAt: (root, commit, sourcePath) =>
    gitBlobAt(runtime, root, commit, sourcePath),
  firstParent: (root, commit) => gitFirstParent(runtime, root, commit),
  resolveCommit: (root, reference) =>
    gitResolveCommit(runtime, root, reference),
  isAncestor: (root, base, head) => gitIsAncestor(runtime, root, base, head),
});

const sameList = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);
const isMetadataRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const planHistoryRuntime = (runtime: PreconditionRuntime): PlanHistoryRuntime => ({
  pathExists: (path) => runtime.fileSystem.pathExists(path),
  git: {
    ...checkpointGit(runtime),
    currentHead: (root) => gitCurrentHead(runtime, root),
    latestCommit: (root, path) => gitLatestCommit(runtime, root, path),
    pathHistoryAt: (root, commit, path) => gitCommand(runtime, ["log", "--format=%H", commit, "--", path], root),
    blobIdAt: (root, commit, path) => gitBlobIdAt(runtime, root, commit, path),
    worktreeBlob: (root, path) => gitWorktreeBlob(runtime, root, path),
    commitFiles: (root, commit) => gitCommitFiles(runtime, root, commit),
    treeEntry: (root, commit, path) => gitCommand(runtime, ["ls-tree", commit, "--", path], root),
  },
});

export const inspectTasks = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
): Promise<TaskInspection> => {
  const changePath = relativePath(root, changeDir);
  const planPath = Path.join(changeDir, "plan.md");
  const progressPath = Path.join(changeDir, "progress.md");
  const problems: string[] = [];
  const planDurable = await durableArtifact(runtime, root, planPath);
  const progressDurable = await durableArtifact(runtime, root, progressPath);
  if (!planDurable)
    problems.push("plan.md is not tracked and committed exactly at HEAD");
  if (!progressDurable)
    problems.push("progress.md is not tracked and committed exactly at HEAD");
  const planRead = await readContract(runtime, planPath, "plan");
  const progressRead = await readContract(runtime, progressPath, "progress");
  const planTitle = planRead.artifact
    ? titleOf(planRead.artifact, "Plan: ")
    : null;
  if (!planRead.artifact)
    problems.push(`plan.md ${planRead.reason ?? "malformed"}${planRead.diagnostics?.length ? ` (${planRead.diagnostics.join("; ")})` : ""}`);
  if (!progressRead.artifact) {
    const ledgerMismatch = progressRead.diagnostics?.find(
      (message) => message === "progress metadata ledger does not match" || message.endsWith(": progress metadata ledger does not match"),
    );
    problems.push(
      ledgerMismatch ? "progress metadata ledger does not match" : `progress.md ${progressRead.reason ?? "malformed"}`,
    );
  }
  if (planTitle === null) problems.push("plan title is malformed");
  if (problems.length > 0)
    return {
      passed: false,
      output: `[FAIL] Tasks (${problems.join("; ")})\n`,
      tasks: [],
      ...(planTitle === null ? {} : { planTitle }),
      planDurable,
      changePath,
      executionTransitionValid: false,
    };
  const planArtifact = planRead.artifact;
  const progressArtifact = progressRead.artifact;
  if (!planArtifact || !progressArtifact)
    return {
      passed: false,
      output: `[FAIL] Tasks (${problems.join("; ")})\n`,
      tasks: [],
      ...(planTitle === null ? {} : { planTitle }),
      planDurable,
      changePath,
      executionTransitionValid: false,
    };
  const planRecords = planArtifact.body.workflow.records.filter(
    (record) => record.kind === "task",
  );
  const intentInspection = await inspectIntentApprovals(
    runtime,
    root,
    changeDir,
    planArtifact,
  );
  const intentProblems = [...intentInspection.problems];
  const scaffoldProblems = await inspectInitialScaffold(
    runtime,
    root,
    changeDir,
    planArtifact,
    intentInspection.currentHead ?? "",
  );
  const critiqueProblems = await inspectCritiqueDisposition(runtime, changeDir);
  let repositoryIdentity: string | undefined;
  try {
    repositoryIdentity = await runtime.fileSystem.realpath(root);
  } catch {
    repositoryIdentity = undefined;
  }
  const impactInspection = await inspectInputImpact(
    planHistoryRuntime(runtime),
    root,
    changeDir,
    planArtifact.body.workflow.plan,
  );
  const inputProblems: string[] = [...impactInspection.problems];
  const activePlans = planRecords.filter(
    (record) => !taskTitleAbandoned(record.title ?? ""),
  );
  const progressRecords = progressArtifact.body.workflow.records.filter(
    (record) => record.kind === "task",
  );
  if (
    activePlans.length !== progressRecords.length ||
    activePlans.some(
      (record, index) =>
        record.number !== progressRecords[index]?.number ||
        record.title !== progressRecords[index]?.title,
    )
  )
    problems.push("plan and progress ledgers do not match");
  if (!progressLedgerMatches(progressArtifact.metadata.tasks, progressRecords))
    problems.push("progress metadata ledger does not match");
  const tasks: TaskEvidence[] = [];
  for (const record of activePlans) {
    const task = record.number ?? 0;
    const progressRecord = progressRecords.find(
      (candidate) => candidate.number === task,
    );
    const status = progressRecord?.fields.Status ?? "";
    if (status !== "done")
      problems.push(`Task ${task} status: ${status || "missing"}`);
    const taskPath = Path.join(
      changeDir,
      "tasks",
      `task-${task}`,
      "progress.md",
    );
    const taskRead = await readContract(runtime, taskPath, "task-progress");
    if (!taskRead.artifact) {
      problems.push(`Task ${task} progress ${taskRead.reason ?? "malformed"}`);
      continue;
    }
    if (
      taskRead.artifact.metadata.task !== task ||
      taskRead.artifact.metadata.change !== Path.basename(changeDir)
    ) {
      problems.push(`Task ${task} progress identity is malformed`);
      continue;
    }
    const taskProgressStatus = taskRead.artifact.metadata.status;
    if (taskProgressStatus !== "done")
      problems.push(
        `Task ${task} progress status: ${String(taskProgressStatus ?? "missing")}`,
      );
    const attempts = taskRead.artifact.body.workflow.records.filter(
      (candidate) => candidate.kind === "attempt",
    );
    const latest = attempts.at(-1);
    if (latest?.fields.Outcome !== "done")
      problems.push(`Task ${task} latest attempt is not done`);
    if (!(await durableArtifact(runtime, root, taskPath)))
      problems.push(
        `Task ${task} progress is not tracked and committed exactly at HEAD`,
      );
    const implementationResult = await gitLatestCommit(
      runtime,
      root,
      relativePath(root, taskPath),
    );
    const implementation = text(implementationResult);
    let verifiedImplementation: string | undefined;
    if (!successful(implementationResult) || !fullCommit(implementation)) {
      problems.push(`Task ${task} implementation commit is missing or unverifiable`);
    } else {
      const resolvedImplementation = await gitResolveCommit(
        runtime,
        root,
        implementation,
      );
      if (
        successful(resolvedImplementation) &&
        text(resolvedImplementation) === implementation
      )
        verifiedImplementation = implementation;
      else problems.push(`Task ${task} implementation commit is missing or unverifiable`);
    }
    const feedbackPath = Path.join(
      changeDir,
      "tasks",
      `task-${task}`,
      "feedback.md",
    );
    const feedbackRead = await readContract(runtime, feedbackPath, "feedback");
    let feedbackRanges: readonly TaskFeedbackRange[] = [];
    let checkpoint:
      | { readonly kind: "verified"; readonly base: string }
      | { readonly kind: "unverified"; readonly reason: string }
      | undefined;
    if (feedbackRead.artifact && feedbackRead.source) {
      const parsed = await readTaskFeedbackRanges(
        feedbackPath,
        feedbackRead.source,
        Path.basename(changeDir),
        task,
      );
      if (parsed.kind === "valid") feedbackRanges = parsed.ranges;
      else
        checkpoint = {
          kind: "unverified",
          reason: parsed.reason,
        };
    } else if (feedbackRead.reason !== "missing") {
      checkpoint = {
        kind: "unverified",
        reason: `feedback ${feedbackRead.reason ?? "malformed"}`,
      };
    }
    if (checkpoint === undefined) {
      const current = await gitCurrentHead(runtime, root);
      if (!successful(current) || !fullCommit(text(current)))
        checkpoint = { kind: "unverified", reason: "current HEAD is unresolved" };
      else {
        const resolvedCheckpoint = await resolveTaskCheckpoint(
          checkpointGit(runtime),
          root,
          relativePath(root, taskPath),
          task,
          Path.basename(changeDir),
          text(current),
          feedbackRanges,
        );
        checkpoint =
          resolvedCheckpoint.kind === "verified"
            ? { kind: "verified", base: resolvedCheckpoint.base }
            : {
                kind: "unverified",
                reason:
                  resolvedCheckpoint.kind === "not-started"
                    ? "no committed task attempt exists"
                    : resolvedCheckpoint.reason,
              };
      }
    }
    if (checkpoint?.kind === "unverified")
      problems.push(
        `Task ${task} historical checkpoint is unverified: ${checkpoint.reason}`,
      );
    inputProblems.push(
      ...(await inspectTaskInputContext(
        runtime,
        root,
        changeDir,
        planArtifact,
        task,
        attempts.length === 0 ? undefined : verifiedImplementation,
        repositoryIdentity,
        intentInspection.approvals,
        intentInspection.currentHead,
        impactInspection,
        checkpoint ?? {
          kind: "unverified",
          reason: "historical checkpoint was not evaluated",
        },
      )),
    );
    tasks.push({
      task,
      title: record.title ?? "",
      status,
      progressPath: relativePath(root, taskPath),
      feedbackPath: relativePath(root, feedbackPath),
      ...(verifiedImplementation === undefined
        ? {}
        : { implementation: verifiedImplementation }),
      checkpoint: checkpoint ?? {
        kind: "unverified",
        reason: "historical checkpoint was not evaluated",
      },
    });
  }
  const execution = planArtifact.body.workflow.plan;
  const transitionProblems = await inspectExecutionTransition(
    planHistoryRuntime(runtime),
    root,
    changeDir,
    planArtifact,
  );
  const currentContextCount = execution?.tasks.filter((entry) => entry.inputContext !== undefined).length ?? 0;
  const legacyConfirmationCount = execution?.legacyInputConfirmations?.length ?? 0;
  const allProblems = [
    ...problems,
    ...transitionProblems,
    ...intentProblems,
    ...scaffoldProblems,
    ...critiqueProblems,
    ...inputProblems,
  ];
  const output = [
    problems.length === 0
      ? `[PASS] Tasks (${tasks.length} implemented)`
      : `[FAIL] Tasks (${problems.join("; ")})`,
    intentProblems.length === 0
      ? `[PASS] Intent (${intentInspection.approvals.size} committed references; owner authority is asserted, not authenticated)`
      : `[FAIL] Intent (${intentProblems.join("; ")})`,
    impactInspection.problems.length === 0
      ? impactInspection.reviewReference === undefined
        ? "[PASS] Input impact (no changed input map)"
        : `[PASS] Input impact (${impactInspection.reviewReference}; review reference is asserted, not authenticated)`
      : `[FAIL] Input impact (${impactInspection.problems.join("; ")})`,
    inputProblems.length === 0
      ? `[PASS] Inputs (${currentContextCount} current task contexts)`
      : `[FAIL] Inputs (${inputProblems.join("; ")})`,
    ...(inputProblems.length === 0 && legacyConfirmationCount > 0
      ? [`[PASS] Legacy inputs (${legacyConfirmationCount} scoped current confirmations; references are asserted, not authenticated)`]
      : []),
    scaffoldProblems.length === 0
      ? "[PASS] Initialization proof"
      : `[FAIL] Initialization (${scaffoldProblems.join("; ")})`,
    critiqueProblems.length === 0
      ? "[PASS] Critique disposition"
      : `[FAIL] Critique (${critiqueProblems.join("; ")})`,
    transitionProblems.length === 0
      ? execution?.executionTransition
        ? `[PASS] Execution transition (${execution.executionTransition.approval}; owner authority is asserted, not authenticated)`
        : "[PASS] Execution order (legacy or unchanged initial declaration)"
      : `[FAIL] Execution transition (${transitionProblems.join("; ")})`,
    ...(execution === undefined
      ? []
      : [`identity-order: ${execution.identityOrder.join(", ")}`, `execution-order: ${execution.executionOrder.join(", ")}`]),
  ].join("\n") + "\n";
  return {
    passed: allProblems.length === 0,
    output,
    tasks,
    ...(planTitle === null ? {} : { planTitle }),
    planDurable,
    changePath,
    executionTransitionValid: transitionProblems.length === 0,
  };
};
