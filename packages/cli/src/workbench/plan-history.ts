import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import {
  dependencyGraphProblems,
  dependencyTransitionProblems,
  executionTransitionProblems,
  progressLedgerMatches,
} from "./artifact-body.js";
import type { PlanContractProjection, PlanExecutionTransitionContract, PlanInputImpactContract, PlanTaskContract, ValidArtifactContract } from "./artifact-types.js";
import type { ProcessResult } from "./runtime.js";
import { parseReviewPasses } from "./review-passes.js";
import { readTaskFeedbackRanges, resolveTaskCheckpoint, type TaskCheckpointGit } from "./task-checkpoint.js";

type GitResult = ProcessResult | Promise<ProcessResult>;

export interface PlanHistoryGit extends TaskCheckpointGit {
  readonly currentHead: (cwd: string) => GitResult;
  readonly latestCommit: (cwd: string, path: string) => GitResult;
  readonly pathHistoryAt: (cwd: string, commit: string, path: string) => GitResult;
  readonly blobIdAt: (cwd: string, commit: string, path: string) => GitResult;
  readonly worktreeBlob: (cwd: string, path: string) => GitResult;
  readonly commitFiles: (cwd: string, commit: string) => GitResult;
  readonly treeEntry: (cwd: string, commit: string, path: string) => GitResult;
}

export interface PlanHistoryRuntime {
  readonly git: PlanHistoryGit;
  readonly pathExists: (path: string) => boolean | Promise<boolean>;
}

export interface InputImpactInspection {
  readonly problems: readonly string[];
  readonly planCommit?: string;
  readonly reviewReference?: string;
  readonly unaffectedInputs: ReadonlyMap<string, ReadonlySet<number>>;
}

const successful = (result: ProcessResult): boolean => result.status === 0;
const text = (result: ProcessResult): string => result.stdout.trim();
const fullCommit = (value: string | undefined): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const relativePath = (root: string, path: string): string => Path.relative(root, path).split(Path.sep).join("/");
const sameList = (left: readonly number[], right: readonly number[]): boolean => left.length === right.length && left.every((id, index) => id === right[index]);
const sameSet = (left: readonly number[], right: readonly number[]): boolean => left.length === right.length && new Set(left).size === new Set(right).size && left.every((id) => right.includes(id));
const activeTasks = (projection: PlanContractProjection): PlanTaskContract[] =>
  projection.executionOrder.flatMap((id) => {
    const task = projection.tasks.find((entry) => entry.id === id);
    return task ? [task] : [];
  });
const sameTaskDependencies = (
  left: PlanContractProjection,
  right: PlanContractProjection,
): boolean => {
  const leftTasks = activeTasks(left);
  const rightTasks = activeTasks(right);
  return sameList(left.executionOrder, right.executionOrder) &&
    leftTasks.every((task, index) =>
      sameList(task.dependsOn, rightTasks[index]?.dependsOn ?? []),
    );
};
const executionChanged = (
  previous: PlanContractProjection,
  current: PlanContractProjection,
): boolean =>
  !sameList(previous.executionOrder, current.executionOrder) ||
  previous.execution?.version !== current.execution?.version ||
  (previous.execution?.version === 2 &&
    current.execution?.version === 2 &&
    !sameTaskDependencies(previous, current));
const taskEdges = (projection: PlanContractProjection) =>
  activeTasks(projection).map((task) => ({ id: task.id, dependsOn: task.dependsOn }));
const isMetadataRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const titleOf = (artifact: ValidArtifactContract, prefix: string): string | null => {
  const titles = artifact.body.headings.filter((heading) => heading.level === 1);
  return titles.length === 1 && titles[0]?.text.startsWith(prefix) ? titles[0].text.slice(prefix.length) : null;
};

export const taskTitleAbandoned = (title: string): boolean =>
  /\(abandoned — .+\)$/.test(title);

const latestAt = async (git: PlanHistoryGit, root: string, commit: string, path: string): Promise<ProcessResult> => {
  const result = await git.pathHistoryAt(root, commit, path);
  return { ...result, stdout: result.stdout.split("\n").map((line) => line.trim()).find(Boolean) ?? "" };
};

const validateExecutionAmendment = async (
  runtime: PlanHistoryRuntime,
  root: string,
  changeDir: string,
  transition: PlanExecutionTransitionContract,
  transitionCommit: string,
  priorPlanCommit: string,
  priorProjection: PlanContractProjection,
  transitionPlan: ValidArtifactContract,
): Promise<readonly string[]> => {
  const problems: string[] = [];
  const transitionProjection = transitionPlan.body.workflow.plan;
  if (!transitionProjection) return ["execution transition has no task projection"];
  const currentOrder = transitionProjection.executionOrder;
  if (transition.previousPlanCommit !== priorPlanCommit)
    problems.push("execution transition does not reference the actual preceding plan revision");
  const previousOrder = priorProjection.executionOrder;
  if (transition.version === 1) {
    if (!sameList(transition.previousOrder, previousOrder))
      problems.push("execution transition previous order disagrees with the preceding plan");
    if (sameList(previousOrder, currentOrder))
      problems.push("execution transition proof is present without an order amendment");
    if (transitionProjection.execution?.version !== 1 || priorProjection.execution?.version === 2)
      problems.push("serial execution transition does not describe version 1 execution metadata");
  } else {
    if (transitionProjection.execution?.version !== 2)
      problems.push("dependency scheduling transition does not describe version 2 dependency execution metadata");
    if (!executionChanged(priorProjection, transitionProjection))
      problems.push("dependency scheduling transition proof is present without a graph amendment");
    if (JSON.stringify(priorProjection.inputImpact) !== JSON.stringify(transitionProjection.inputImpact))
      problems.push("dependency scheduling transition cannot also amend formal input impact");
  }
  const priorIds = priorProjection.identityOrder;
  if (
    transitionProjection.identityOrder.length < priorIds.length ||
    !priorIds.every((id, index) => transitionProjection.identityOrder[index] === id)
  )
    problems.push("execution transition must preserve existing physical task identities");
  const priorApprovals = priorProjection.intentApprovals;
  const transitionApprovals = transitionProjection.intentApprovals;
  if (
    priorApprovals.length !== transitionApprovals.length ||
    priorApprovals.some((reference) =>
      !transitionApprovals.some(
        (current) =>
          current.path === reference.path &&
          current.reference === reference.reference &&
          current.commit === reference.commit,
      ),
    )
  )
    problems.push("execution transition changes formal intent and must return to its owner");
  const boundary = text(await runtime.git.firstParent(root, transitionCommit));
  if (!fullCommit(boundary))
    return [...problems, "execution transition boundary has no resolvable first parent"];
  const rootProgressPath = `${relativePath(root, changeDir)}/progress.md`;
  const rootProgressBlob = await runtime.git.blobAt(root, boundary, rootProgressPath);
  const rootProgressRead = successful(rootProgressBlob)
    ? await createArtifactReader({ readFile: () => rootProgressBlob.stdout })(rootProgressPath)
    : undefined;
  const rootProgressContract = rootProgressRead ? validateArtifact(rootProgressRead) : undefined;
  const rootRecords =
    rootProgressContract?._tag === "valid" && rootProgressContract.artifact === "progress"
      ? rootProgressContract.body.workflow.records.filter((record) => record.kind === "task")
      : [];
  if (
    rootProgressContract?._tag !== "valid" ||
    rootProgressContract.artifact !== "progress" ||
    !progressLedgerMatches(rootProgressContract.metadata.tasks, rootRecords)
  )
    return [...problems, "execution transition boundary has no valid root task ledger"];
  const inputImpact = transitionProjection.inputImpact;
  for (const priorTask of priorProjection.tasks) {
    const currentTask = transitionProjection.tasks.find((task) => task.id === priorTask.id);
    const status = rootRecords.find((record) => record.number === priorTask.id)?.fields.Status;
    const affected = inputImpact?.previousPlanCommit === priorPlanCommit &&
      inputImpact.changes.some((change) => change.affectedTasks.includes(priorTask.id));
    const classified = inputImpact?.previousPlanCommit === priorPlanCommit &&
      inputImpact.changes.some((change) =>
        change.affectedTasks.includes(priorTask.id) ||
        change.unaffectedTasks.includes(priorTask.id),
      );
    if (!currentTask) {
      problems.push(`execution transition removes existing Task ${priorTask.id}`);
      continue;
    }
    if (transition.version === 2) {
      if (currentTask.schedulingDigest !== priorTask.schedulingDigest)
        problems.push(`dependency scheduling transition changes Task ${priorTask.id} outside its prerequisites`);
      if (
        transition.fullyGatedTasks.includes(priorTask.id) &&
        !sameList(currentTask.dependsOn, priorTask.dependsOn)
      )
        problems.push(`dependency scheduling transition changes fully gated Task ${priorTask.id} prerequisites`);
    } else {
      if (
        currentTask.definitionDigest !== priorTask.definitionDigest &&
        (!affected || status === "done")
      )
        problems.push(`execution transition changes frozen or unclassified Task ${priorTask.id} definition`);
      if (
        JSON.stringify(currentTask.inputContext) !== JSON.stringify(priorTask.inputContext) &&
        (!classified || status === "done")
      )
        problems.push(`execution transition changes frozen or unclassified Task ${priorTask.id} input handoff`);
    }
  }
  if (transition.version === 2) {
    for (const priorTask of priorProjection.tasks) {
      if (rootRecords.find((record) => record.number === priorTask.id)?.fields.Status !== "done") continue;
      for (const relative of [
        `tasks/task-${priorTask.id}/progress.md`,
        `tasks/task-${priorTask.id}/feedback.md`,
      ]) {
        const path = `${relativePath(root, changeDir)}/${relative}`;
        const before = await runtime.git.blobIdAt(root, boundary, path);
        const after = await runtime.git.blobIdAt(root, transitionCommit, path);
        if (
          successful(before) !== successful(after) ||
          (successful(before) && text(before) !== text(after))
        )
          problems.push(`dependency scheduling transition changes existing Task ${priorTask.id} evidence`);
      }
    }
  }
  const boundaryGit: TaskCheckpointGit = {
    ...runtime.git,
    pathHistory: (cwd, sourcePath) =>
      runtime.git.pathHistoryAt(cwd, boundary, sourcePath),
  };
  const gateFailures: string[] = [];
  const isGatedAtBoundary = async (taskId: number, requireUnchangedDefinition: boolean): Promise<boolean> => {
    const ungated = (reason: string): false => {
      gateFailures.push(`Task ${taskId} ${reason}`);
      return false;
    };
    const priorTask = priorProjection.tasks.find((task) => task.id === taskId);
    const currentTask = transitionProjection.tasks.find((task) => task.id === taskId);
    const rootRecord = rootRecords.find((record) => record.number === taskId);
    const rootMetadata = Array.isArray(rootProgressContract.metadata.tasks)
      ? rootProgressContract.metadata.tasks.find(
          (entry) => isMetadataRecord(entry) && entry.id === taskId,
        )
      : undefined;
    if (
      !priorTask ||
      !currentTask ||
      !rootRecord ||
      (requireUnchangedDefinition && currentTask.definitionDigest !== priorTask.definitionDigest) ||
      rootRecord.title !== priorTask.title ||
      rootRecord.fields.Status !== "done" ||
      !isMetadataRecord(rootMetadata) ||
      rootMetadata.status !== "done"
    )
      return ungated("was not fully complete in the preceding plan boundary");
    const taskPath = `${relativePath(root, changeDir)}/tasks/task-${taskId}/progress.md`;
    const taskBlob = await runtime.git.blobAt(root, boundary, taskPath);
    if (!successful(taskBlob)) return ungated("task progress was absent at the preceding boundary");
    const taskRead = await createArtifactReader({ readFile: () => taskBlob.stdout })(taskPath);
    const taskContract = validateArtifact(taskRead);
    if (taskContract._tag !== "valid" || taskContract.artifact !== "task-progress")
      return ungated("task progress contract was invalid at the preceding boundary");
    if (taskContract.metadata.task !== taskId)
      return ungated("task progress ID disagreed at the preceding boundary");
    if (taskContract.metadata.change !== Path.basename(changeDir))
      return ungated("task progress change identity disagreed at the preceding boundary");
    if (taskContract.metadata.status !== "done")
      return ungated("task progress status was not done at the preceding boundary");
    if (titleOf(taskContract, `Task Progress: Task ${taskId} — `) !== priorTask.title)
      return ungated("task progress title disagreed at the preceding boundary");
    const attempts = taskContract.body.workflow.records.filter((record) => record.kind === "attempt");
    const latestAttempt = attempts.at(-1);
    if (latestAttempt?.fields.Outcome !== "done") return ungated("latest task outcome was not done at the preceding boundary");
    const feedbackPath = `${relativePath(root, changeDir)}/tasks/task-${taskId}/feedback.md`;
    const feedbackBlob = await runtime.git.blobAt(root, boundary, feedbackPath);
    if (!successful(feedbackBlob)) return ungated("had no feedback at the preceding boundary");
    const feedbackRead = await createArtifactReader({ readFile: () => feedbackBlob.stdout })(feedbackPath);
    if (feedbackRead._tag !== "recognized") return ungated("feedback was not recognized at the preceding boundary");
    const feedbackContract = validateArtifact(feedbackRead);
    const latestPass = parseReviewPasses(feedbackRead).latest;
    if (
      feedbackContract._tag !== "valid" ||
      feedbackContract.artifact !== "feedback" ||
      feedbackContract.metadata.task !== taskId ||
      feedbackContract.metadata.change !== Path.basename(changeDir) ||
      latestPass?.verdict !== "approved"
    )
      return ungated("latest feedback verdict was not approved at the preceding boundary");
    const feedbackCommit = text(
      await latestAt(runtime.git, root, boundary, feedbackPath),
    );
    if (!fullCommit(feedbackCommit)) return ungated("feedback commit was unresolved at the preceding boundary");
    const feedbackCommitFiles = text(await runtime.git.commitFiles(root, feedbackCommit))
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (feedbackCommitFiles.length !== 1 || feedbackCommitFiles[0] !== feedbackPath)
      return ungated("feedback was not committed as a dedicated artifact");
    const feedbackRanges = await readTaskFeedbackRanges(
      feedbackPath,
      feedbackBlob.stdout,
      Path.basename(changeDir),
      taskId,
    );
    if (feedbackRanges.kind !== "valid") return ungated("feedback ranges were malformed at the preceding boundary");
    const checkpoint = await resolveTaskCheckpoint(
      boundaryGit,
      root,
      taskPath,
      taskId,
      Path.basename(changeDir),
      boundary,
      feedbackRanges.ranges,
    );
    if (checkpoint.kind !== "verified" || latestPass.base !== checkpoint.base)
      return ungated("feedback did not certify the canonical task Base");
    const implementation = text(
      await latestAt(runtime.git, root, boundary, taskPath),
    );
    if (
      !fullCommit(implementation) ||
      !fullCommit(latestPass.head) ||
      !successful(await runtime.git.isAncestor(root, implementation, latestPass.head)) ||
      !successful(await runtime.git.isAncestor(root, latestPass.head, boundary))
    )
      return ungated("feedback range did not cover the task implementation at the preceding boundary");
    return true;
  };
  const gatedTasks: number[] = [];
  if (transition.version === 1) {
    for (const taskId of previousOrder) {
      if (!(await isGatedAtBoundary(taskId, true))) break;
      gatedTasks.push(taskId);
    }
    if (!sameList(transition.fullyGatedPrefix, gatedTasks))
      problems.push(
        `execution transition gated prefix disagrees with durable task and feedback evidence${gateFailures[0] ? ` (${gateFailures[0]})` : ""}`,
      );
    problems.push(...executionTransitionProblems(previousOrder, currentOrder, gatedTasks));
  } else {
    for (const taskId of previousOrder)
      if (await isGatedAtBoundary(taskId, false)) gatedTasks.push(taskId);
    if (!sameSet(transition.fullyGatedTasks, gatedTasks))
      problems.push(
        `execution transition fully-gated task set disagrees with durable task and feedback evidence${gateFailures[0] ? ` (${gateFailures[0]})` : ""}`,
      );
    problems.push(...dependencyTransitionProblems(
      taskEdges(priorProjection),
      taskEdges(transitionProjection),
      gatedTasks,
    ));
  }
  return problems;
};

export const inspectExecutionTransition = async (
  runtime: PlanHistoryRuntime,
  root: string,
  changeDir: string,
  plan: ValidArtifactContract,
): Promise<readonly string[]> => {
  const projection = plan.body.workflow.plan;
  if (!projection) return ["plan has no execution projection"];
  const planPath = relativePath(root, Path.join(changeDir, "plan.md"));
  const historyResult = await runtime.git.pathHistory(root, planPath);
  if (!successful(historyResult)) return ["committed plan history cannot be verified"];
  const history = historyResult.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const latest = text(await runtime.git.latestCommit(root, planPath));
  if (!fullCommit(latest) || history[0] !== latest)
    return ["current plan revision is not the latest committed plan history"];
  const revisions: { readonly commit: string; readonly plan: ValidArtifactContract; readonly projection: PlanContractProjection }[] = [];
  for (const commit of [...history].reverse()) {
    const source = await runtime.git.blobAt(root, commit, planPath);
    if (!successful(source)) return ["preceding committed plan revision is unreadable"];
    const read = await createArtifactReader({ readFile: () => source.stdout })(planPath);
    const contract = validateArtifact(read);
    if (contract._tag !== "valid" || contract.artifact !== "plan" || !contract.body.workflow.plan)
      return ["preceding committed plan revision is malformed or unsupported"];
    revisions.push({ commit, plan: contract, projection: contract.body.workflow.plan });
  }
  const problems: string[] = [];
  const seenProofs = new Set<string>();
  for (const [index, current] of revisions.entries()) {
    const previous = revisions[index - 1];
    const transition = current.projection.executionTransition;
    const key = JSON.stringify(transition);
    if (!previous) {
      if (transition) problems.push("execution transition has no actual preceding committed plan revision");
    } else {
      const changed = executionChanged(previous.projection, current.projection);
      const governed = previous.projection.execution !== undefined || current.projection.execution !== undefined || transition !== undefined;
      if (changed && governed) {
        if (!transition || JSON.stringify(previous.projection.executionTransition) === key) {
          const label = previous.projection.execution?.version === 2 || current.projection.execution?.version === 2
            ? "execution contract"
            : "execution order";
          problems.push(`${label} changed without committed execution transition evidence`);
        }
        else
          problems.push(...await validateExecutionAmendment(runtime, root, changeDir, transition, current.commit, previous.commit, previous.projection, current.plan));
      } else if (transition && !seenProofs.has(key)) {
        problems.push("execution transition proof is present without an execution amendment");
      }
    }
    if (transition) seenProofs.add(key);
  }
  const committed = revisions.at(-1)?.projection;
  if (!committed || executionChanged(committed, projection))
    problems.push("current execution contract changed after its committed history");
  if (JSON.stringify(committed?.executionTransition) !== JSON.stringify(projection.executionTransition))
    problems.push("current execution transition evidence is not committed");
  return problems;
};

export const inspectInputImpact = async (
  runtime: PlanHistoryRuntime,
  root: string,
  changeDir: string,
  projection: PlanContractProjection | undefined,
  snapshotCommit?: string,
): Promise<InputImpactInspection> => {
  if (snapshotCommit !== undefined) {
    const resolved = await runtime.git.resolveCommit(root, snapshotCommit);
    const head = await runtime.git.currentHead(root);
    if (!fullCommit(snapshotCommit) || !successful(resolved) || text(resolved) !== snapshotCommit ||
      !successful(head) || !fullCommit(text(head)) || !successful(await runtime.git.isAncestor(root, snapshotCommit, text(head))))
      return { problems: ["historical input impact snapshot is not a reachable full commit"], unaffectedInputs: new Map() };
  }
  if (!projection) return { problems: ["plan has no task projection"], unaffectedInputs: new Map() };
  const impact: PlanInputImpactContract | undefined = projection.inputImpact;
  if (!impact) {
    const references = projection.tasks.flatMap((task) =>
      task.inputContext?.impactPlanCommit === undefined
        ? []
        : [`Task ${task.id} names impactPlanCommit without plan input_impact metadata`],
    );
    return { problems: references, unaffectedInputs: new Map() };
  }
  const problems: string[] = [];
  const unaffectedInputs = new Map<string, Set<number>>();
  const planPath = relativePath(root, Path.join(changeDir, "plan.md"));
  const historyResult = snapshotCommit === undefined
    ? await runtime.git.pathHistory(root, planPath)
    : await runtime.git.pathHistoryAt(root, snapshotCommit, planPath);
  if (!successful(historyResult))
    return { problems: ["input impact plan history cannot be verified"], unaffectedInputs };
  const history = historyResult.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const parsePlanAt = async (commit: string): Promise<ValidArtifactContract | undefined> => {
    const source = await runtime.git.blobAt(root, commit, planPath);
    if (!successful(source)) return undefined;
    const artifact = await createArtifactReader({ readFile: () => source.stdout })(planPath);
    const contract = validateArtifact(artifact);
    return contract._tag === "valid" && contract.artifact === "plan" ? contract : undefined;
  };
  let impactCommit: string | undefined;
  let previousCommit: string | undefined;
  let previousPlan: ValidArtifactContract | undefined;
  let impactPlan: ValidArtifactContract | undefined;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const commit = history[index];
    if (!commit) continue;
    const candidate = await parsePlanAt(commit);
    if (
      !candidate ||
      JSON.stringify(candidate.body.workflow.plan?.inputImpact) !== JSON.stringify(impact)
    )
      continue;
    const prior = history[index + 1];
    if (!prior) continue;
    const priorArtifact = await parsePlanAt(prior);
    if (!priorArtifact)
      return {
        problems: ["preceding committed plan revision for input impact is malformed or unsupported"],
        unaffectedInputs,
      };
    if (
      JSON.stringify(priorArtifact.body.workflow.plan?.inputImpact) === JSON.stringify(impact)
    )
      continue;
    impactCommit = commit;
    previousCommit = prior;
    previousPlan = priorArtifact;
    impactPlan = candidate;
    break;
  }
  if (!impactCommit || !previousCommit || !previousPlan || !impactPlan)
    return {
      problems: ["input impact has no actual preceding committed plan revision"],
      unaffectedInputs,
    };
  if (impact.previousPlanCommit !== previousCommit)
    problems.push("input impact does not reference the actual preceding plan revision");
  const currentPlanCommit = text(snapshotCommit === undefined
    ? await runtime.git.latestCommit(root, planPath)
    : await latestAt(runtime.git, root, snapshotCommit, planPath));
  if (!fullCommit(currentPlanCommit) || !history.includes(currentPlanCommit))
    problems.push("current plan revision is not in committed input-impact history");
  if (snapshotCommit !== undefined) {
    const recorded = await parsePlanAt(currentPlanCommit);
    if (JSON.stringify(recorded?.body.workflow.plan) !== JSON.stringify(projection))
      problems.push("historical input-impact projection does not match its committed snapshot");
  }
  const previousProjection = previousPlan.body.workflow.plan;
  const impactProjection = impactPlan.body.workflow.plan;
  if (!previousProjection || !impactProjection)
    return { problems: [...problems, "input impact history has no task projection"], unaffectedInputs };
  const previousActive = previousProjection.tasks.filter(
    (task) => !taskTitleAbandoned(task.title),
  );
  const impactActive = impactProjection.tasks.filter(
    (task) => !taskTitleAbandoned(task.title),
  );
  const previousIds = previousActive.map((task) => task.id);
  const previousPhysical = new Set(previousProjection.identityOrder);
  const impactPhysicalIds = impactProjection.identityOrder;
  if (
    impactPhysicalIds.length < previousProjection.identityOrder.length ||
    !previousProjection.identityOrder.every(
      (id, index) => impactPhysicalIds[index] === id,
    )
  )
    problems.push("input impact plan must preserve existing physical task identities and append new IDs");
  const newIds = impactPhysicalIds.slice(previousProjection.identityOrder.length);
  const survivingPriorIds = impactActive
    .filter((task) => previousPhysical.has(task.id))
    .map((task) => task.id);
  const expectedSurvivors = previousActive
    .filter((task) => {
      const afterTask = impactProjection.tasks.find((entry) => entry.id === task.id);
      return afterTask !== undefined && !taskTitleAbandoned(afterTask.title);
    })
    .map((task) => task.id);
  if (!sameList(survivingPriorIds, expectedSurvivors))
    problems.push("input impact plan must preserve the surviving active task order");
  const appendedActiveIds = impactActive
    .filter((task) => !previousPhysical.has(task.id))
    .map((task) => task.id);
  if (!sameList(appendedActiveIds, newIds))
    problems.push("input impact appended task identities must remain active in physical order");
  const mappedNew = new Set(impact.changes.flatMap((change) => change.newTasks));
  if (!sameList([...mappedNew].sort((a, b) => a - b), [...newIds].sort((a, b) => a - b)))
    problems.push("input impact new-task classification does not match appended task identities");
  const boundary = text(await runtime.git.firstParent(root, impactCommit));
  if (!fullCommit(boundary))
    return { problems: [...problems, "input impact boundary has no resolvable parent"], unaffectedInputs };
  const progressPath = `${relativePath(root, changeDir)}/progress.md`;
  const progressBlob = await runtime.git.blobAt(root, boundary, progressPath);
  const progressRead = successful(progressBlob)
    ? await createArtifactReader({ readFile: () => progressBlob.stdout })(progressPath)
    : undefined;
  const progressContract = progressRead ? validateArtifact(progressRead) : undefined;
  const progressRecords =
    progressContract?._tag === "valid" && progressContract.artifact === "progress"
      ? progressContract.body.workflow.records.filter((record) => record.kind === "task")
      : [];
  if (
    progressContract?._tag !== "valid" ||
    progressContract.artifact !== "progress" ||
    !progressLedgerMatches(progressContract.metadata.tasks, progressRecords)
  )
    return { problems: [...problems, "input impact boundary has no valid prior task ledger"], unaffectedInputs };
  const priorStatus = new Map(progressRecords.map((record) => [record.number, record.fields.Status]));
  const completedAtBoundary = new Set<number>();
  for (const task of previousActive) {
    const taskPath = `${relativePath(root, changeDir)}/tasks/task-${task.id}/progress.md`;
    const taskBlob = await runtime.git.blobAt(root, boundary, taskPath);
    if (!successful(taskBlob)) {
      problems.push(`input impact boundary is missing Task ${task.id} progress history`);
      continue;
    }
    const taskRead = await createArtifactReader({ readFile: () => taskBlob.stdout })(taskPath);
    const taskContract = validateArtifact(taskRead);
    if (
      taskContract._tag !== "valid" ||
      taskContract.artifact !== "task-progress" ||
      taskContract.metadata.task !== task.id ||
      taskContract.metadata.change !== Path.basename(changeDir)
    ) {
      problems.push(`input impact boundary has malformed Task ${task.id} progress history`);
      continue;
    }
    const attempts = taskContract.body.workflow.records.filter((record) => record.kind === "attempt");
    if (taskContract.metadata.status === "done" || attempts.at(-1)?.fields.Outcome === "done")
      completedAtBoundary.add(task.id);
  }
  if (
    progressRecords.length !== previousActive.length ||
    previousActive.some(
      (task, index) =>
        progressRecords[index]?.number !== task.id ||
        progressRecords[index]?.title !== task.title,
    )
  )
    problems.push("input impact boundary task ledger disagrees with the preceding plan");
  const blobAt = async (commit: string, path: string): Promise<string | null | undefined> => {
    const listing = await runtime.git.treeEntry(root, commit, path);
    if (!successful(listing)) return undefined;
    if (text(listing) === "") return null;
    const blob = await runtime.git.blobIdAt(root, commit, path);
    return successful(blob) ? text(blob) : undefined;
  };
  const currentHeadResult = snapshotCommit === undefined
    ? await runtime.git.currentHead(root)
    : await runtime.git.resolveCommit(root, snapshotCommit);
  const currentHead = successful(currentHeadResult) && fullCommit(text(currentHeadResult))
    ? text(currentHeadResult)
    : undefined;
  const retainedTaskProgressAt = async (commit: string, task: PlanTaskContract) => {
    const path = `${relativePath(root, changeDir)}/tasks/task-${task.id}/progress.md`;
    const source = await runtime.git.blobAt(root, commit, path);
    if (!successful(source)) return undefined;
    const artifact = await createArtifactReader({ readFile: () => source.stdout })(path);
    const contract = validateArtifact(artifact);
    if (
      contract._tag !== "valid" ||
      contract.artifact !== "task-progress" ||
      contract.metadata.task !== task.id ||
      contract.metadata.change !== Path.basename(changeDir) ||
      titleOf(contract, `Task Progress: Task ${task.id} — `) !== task.title
    )
      return undefined;
    return text(source);
  };
  const retainAbandonedTaskHistory = async (task: PlanTaskContract) => {
    const progressAtBoundary = await retainedTaskProgressAt(boundary, task);
    const progressAtImpact = await retainedTaskProgressAt(impactCommit, task);
    const progressAtHead = currentHead
      ? await retainedTaskProgressAt(currentHead, task)
      : undefined;
    if (
      progressAtBoundary === undefined ||
      progressAtImpact === undefined ||
      progressAtHead === undefined
    )
      problems.push(`input impact must retain Task ${task.id} progress identity and history`);
    else if (progressAtBoundary !== progressAtImpact || progressAtImpact !== progressAtHead)
      problems.push(`input impact must preserve Task ${task.id} progress history after abandonment`);
    const feedbackPath = `${relativePath(root, changeDir)}/tasks/task-${task.id}/feedback.md`;
    const feedbackAtPrevious = await runtime.git.blobAt(root, previousCommit, feedbackPath);
    const feedbackAtBoundary = await runtime.git.blobAt(root, boundary, feedbackPath);
    if (successful(feedbackAtPrevious) && !successful(feedbackAtBoundary))
      problems.push(`input impact must retain Task ${task.id} prior feedback history`);
    if (successful(feedbackAtBoundary)) {
      const feedbackAtImpact = await runtime.git.blobAt(root, impactCommit, feedbackPath);
      const feedbackAtHead = currentHead
        ? await runtime.git.blobAt(root, currentHead, feedbackPath)
        : undefined;
      if (
        !successful(feedbackAtImpact) ||
        feedbackAtHead === undefined ||
        !successful(feedbackAtHead) ||
        text(feedbackAtBoundary) !== text(feedbackAtImpact) ||
        text(feedbackAtImpact) !== text(feedbackAtHead)
      )
        problems.push(`input impact must preserve Task ${task.id} feedback history after abandonment`);
      const artifact = await createArtifactReader({ readFile: () => feedbackAtBoundary.stdout })(feedbackPath);
      const contract = validateArtifact(artifact);
      if (
        contract._tag !== "valid" ||
        contract.artifact !== "feedback" ||
        contract.metadata.task !== task.id ||
        contract.metadata.change !== Path.basename(changeDir) ||
        titleOf(contract, `Code Feedback: Task ${task.id} — `) !== task.title
      )
        problems.push(`input impact must retain Task ${task.id} feedback identity and header`);
    } else if (
      feedbackAtBoundary.status !== 1 ||
      feedbackAtPrevious.status !== 1
    )
      problems.push(`input impact cannot verify Task ${task.id} feedback history`);
    else {
      const feedbackAtImpact = await runtime.git.blobAt(root, impactCommit, feedbackPath);
      const feedbackAtHead = currentHead
        ? await runtime.git.blobAt(root, currentHead, feedbackPath)
        : undefined;
      if (successful(feedbackAtImpact) || (feedbackAtHead && successful(feedbackAtHead)))
        problems.push(`input impact adds feedback after Task ${task.id} was abandoned`);
    }
  };
  for (const task of previousProjection.tasks) {
    const afterTask = impactProjection.tasks.find((entry) => entry.id === task.id);
    if (!afterTask) continue;
    if (taskTitleAbandoned(task.title)) {
      if (!taskTitleAbandoned(afterTask.title) || afterTask.title !== task.title)
        problems.push(`input impact cannot reactivate or rename previously abandoned Task ${task.id}`);
      if (afterTask.definitionDigest !== task.definitionDigest)
        problems.push(`input impact changes the frozen definition of abandoned Task ${task.id}`);
      await retainAbandonedTaskHistory(task);
    } else if (taskTitleAbandoned(afterTask.title)) {
      const abandonmentPrefix = `${task.title} (abandoned — `;
      const reason = afterTask.title.startsWith(abandonmentPrefix)
        ? afterTask.title.slice(abandonmentPrefix.length, -1).trim()
        : "";
      if (!taskTitleAbandoned(afterTask.title) || reason.length === 0)
        problems.push(`input impact must preserve Task ${task.id} identity when marking it abandoned`);
      if (
        task.filesDeclared !== afterTask.filesDeclared ||
        JSON.stringify(task.files) !== JSON.stringify(afterTask.files) ||
        JSON.stringify(task.dependsOn) !== JSON.stringify(afterTask.dependsOn)
      )
        problems.push(`input impact changes the physical scope of abandoned Task ${task.id}`);
      await retainAbandonedTaskHistory(task);
    }
  }
  let priorImpact: InputImpactInspection | undefined;
  for (const change of impact.changes) {
    if (change.unresolvedIntent)
      problems.push(`input impact for ${change.path} has unresolved intent; return to its owner`);
    const before = await blobAt(previousCommit, change.path);
    const planned = await blobAt(impactCommit, change.path);
    if (before === undefined || before !== change.previousBlob)
      problems.push(`input impact previous blob is forged or stale for ${change.path}`);
    if (planned === undefined || planned !== change.currentBlob)
      problems.push(`input impact current blob disagrees with its plan revision for ${change.path}`);
    const headBlob = currentHead ? await blobAt(currentHead, change.path) : undefined;
    if (headBlob === undefined || headBlob !== change.currentBlob)
      problems.push(`input impact current input changed after review for ${change.path}`);
    if (snapshotCommit === undefined) {
      const exists = await runtime.pathExists(Path.resolve(root, change.path));
      const workingBlob = exists ? await runtime.git.worktreeBlob(root, change.path) : undefined;
      if (
        (change.currentBlob === null && exists) ||
        (change.currentBlob !== null &&
          (!exists || workingBlob === undefined || !successful(workingBlob) || text(workingBlob) !== change.currentBlob))
      )
        problems.push(`input impact current worktree input changed for ${change.path}`);
    }
    const classes = [...change.affectedTasks, ...change.unaffectedTasks];
    if (!sameList([...classes].sort((a, b) => a - b), [...previousIds].sort((a, b) => a - b)))
      problems.push(`input impact must classify every prior active task exactly once for ${change.path}`);
    for (const taskId of change.affectedTasks) {
      const beforeTask = previousActive.find((task) => task.id === taskId);
      const afterTask = impactProjection.tasks.find((task) => task.id === taskId);
      if (!beforeTask || !afterTask || priorStatus.get(taskId) === "done" || completedAtBoundary.has(taskId))
        problems.push(`input impact cannot reclassify missing or completed Task ${taskId} as affected`);
      else if (taskTitleAbandoned(afterTask.title)) {
        if (!afterTask.title.startsWith(`${beforeTask.title} (abandoned — `))
          problems.push(`input impact must retain Task ${taskId} heading when marking it abandoned`);
      } else {
        if (beforeTask.title !== afterTask.title) {
          const feedbackPath = `${relativePath(root, changeDir)}/tasks/task-${taskId}/feedback.md`;
          const priorFeedback = await runtime.git.blobAt(root, previousCommit, feedbackPath);
          const boundaryFeedback = await runtime.git.blobAt(root, boundary, feedbackPath);
          if (successful(priorFeedback) || successful(boundaryFeedback))
            problems.push(`input impact cannot rename feedback-bearing Task ${taskId}; abandon and append instead`);
        }
        if (
          beforeTask.definitionDigest === afterTask.definitionDigest &&
          JSON.stringify(beforeTask.inputContext) === JSON.stringify(afterTask.inputContext)
        )
          problems.push(`input impact marks unchanged Task ${taskId} as affected`);
      }
    }
    for (const taskId of change.unaffectedTasks) {
      const beforeTask = previousActive.find((task) => task.id === taskId);
      const afterTask = impactActive.find((task) => task.id === taskId);
      if (!beforeTask || !afterTask || beforeTask.definitionDigest !== afterTask.definitionDigest)
        problems.push(`input impact changes the definition of unaffected Task ${taskId}`);
      if (
        beforeTask &&
        afterTask &&
        (priorStatus.get(taskId) === "done" || completedAtBoundary.has(taskId)) &&
        JSON.stringify(beforeTask.inputContext) !== JSON.stringify(afterTask.inputContext)
      )
        problems.push(`input impact changes the frozen input handoff for completed Task ${taskId}`);
      if (
        beforeTask?.inputContext &&
        afterTask?.inputContext
      ) {
        const oldBlob = beforeTask.inputContext.inputs.find((input) => input.path === change.path)?.blob;
        const newBlob = afterTask.inputContext.inputs.find((input) => input.path === change.path)?.blob;
        const needsPriorRetention = oldBlob !== undefined && oldBlob !== change.previousBlob;
        const outsideCurrentRevisions = newBlob !== undefined && newBlob !== change.previousBlob && newBlob !== change.currentBlob;
        let retainedAtPredecessor = false;
        if (needsPriorRetention || (outsideCurrentRevisions && newBlob === oldBlob)) {
          priorImpact ??= await inspectInputImpact(runtime, root, changeDir, previousProjection, previousCommit);
          retainedAtPredecessor = priorImpact.problems.length === 0 && priorImpact.unaffectedInputs.get(change.path)?.has(taskId) === true;
        }
        if (needsPriorRetention && !retainedAtPredecessor) {
          const reason = priorImpact?.problems.length ? `; prior input impact: ${priorImpact.problems.join("; ")}` : "";
          problems.push(`Task ${taskId} prior input snapshot disagrees with ${change.path}${reason}`);
        }
        if (outsideCurrentRevisions && !(retainedAtPredecessor && newBlob === oldBlob))
          problems.push(`Task ${taskId} input snapshot is outside the reviewed ${change.path} revisions`);
      }
      const tasks = unaffectedInputs.get(change.path) ?? new Set<number>();
      tasks.add(taskId);
      unaffectedInputs.set(change.path, tasks);
    }
    for (const taskId of [...change.affectedTasks, ...change.newTasks]) {
      const task = projection.tasks.find((entry) => entry.id === taskId);
      if (!task || taskTitleAbandoned(task.title)) continue;
      if (!task.inputContext || task.inputContext.impactPlanCommit !== impactCommit)
        problems.push(`Task ${taskId} must bind its revised handoff to the committed input-impact plan`);
      const item = task.inputContext?.inputs.find((input) => input.path === change.path);
      if (change.currentBlob === null ? item !== undefined : item?.blob !== change.currentBlob)
        problems.push(`Task ${taskId} input handoff omits the reviewed current ${change.path} revision`);
    }
  }
  const changedPaths = new Set(impact.changes.map((change) => change.path));
  for (const task of projection.tasks) {
    const beforeTask = previousActive.find((entry) => entry.id === task.id);
    if (taskTitleAbandoned(task.title) || beforeTask?.definitionDigest !== task.definitionDigest)
      continue;
    for (const input of task.inputContext?.inputs ?? []) {
      if (changedPaths.has(input.path) || beforeTask.inputContext?.inputs.find((entry) => entry.path === input.path)?.blob !== input.blob)
        continue;
      const before = await blobAt(previousCommit, input.path);
      const headBlob = currentHead ? await blobAt(currentHead, input.path) : undefined;
      if (before === input.blob && headBlob === input.blob) continue;
      priorImpact ??= await inspectInputImpact(runtime, root, changeDir, previousProjection, previousCommit);
      const planned = await blobAt(impactCommit, input.path);
      let unchangedWorking = true;
      if (snapshotCommit === undefined) {
        const exists = await runtime.pathExists(Path.resolve(root, input.path));
        const working = exists ? await runtime.git.worktreeBlob(root, input.path) : undefined;
        unchangedWorking = before === null
          ? !exists
          : working !== undefined && successful(working) && text(working) === before;
      }
      if (priorImpact.problems.length !== 0 || !priorImpact.unaffectedInputs.get(input.path)?.has(task.id) ||
        before === undefined || planned !== before || headBlob !== before || !unchangedWorking) {
        const reason = priorImpact.problems.length ? `; prior input impact: ${priorImpact.problems.join("; ")}` : "";
        problems.push(`Task ${task.id} prior retained input is unverified for ${input.path}${reason}`);
        continue;
      }
      const tasks = unaffectedInputs.get(input.path) ?? new Set<number>();
      tasks.add(task.id);
      unaffectedInputs.set(input.path, tasks);
    }
  }
  const carriedClasses = previousProjection.inputImpact?.changes.filter((change) => !changedPaths.has(change.path)) ?? [];
  for (const change of carriedClasses) {
    const retainedTasks = change.unaffectedTasks.filter((id) => {
      const beforeTask = previousActive.find((task) => task.id === id);
      const task = projection.tasks.find((entry) => entry.id === id);
      return beforeTask !== undefined && task !== undefined && !taskTitleAbandoned(task.title) &&
        beforeTask.definitionDigest === task.definitionDigest &&
        beforeTask.inputContext?.inputs.find((input) => input.path === change.path)?.blob === task.inputContext?.inputs.find((input) => input.path === change.path)?.blob;
    });
    if (retainedTasks.length === 0) continue;
    priorImpact ??= await inspectInputImpact(runtime, root, changeDir, previousProjection, previousCommit);
    if (priorImpact.problems.length !== 0) {
      problems.push(`prior retained input is unverified for ${change.path}: ${priorImpact.problems.join("; ")}`);
      continue;
    }
    for (const [path, ids] of priorImpact.unaffectedInputs) {
      if (changedPaths.has(path)) continue;
      const before = await blobAt(previousCommit, path);
      const planned = await blobAt(impactCommit, path);
      const headBlob = currentHead ? await blobAt(currentHead, path) : undefined;
      let unchangedWorking = true;
      if (snapshotCommit === undefined) {
        const exists = await runtime.pathExists(Path.resolve(root, path));
        const working = exists ? await runtime.git.worktreeBlob(root, path) : undefined;
        unchangedWorking = before === null
          ? !exists
          : working !== undefined && successful(working) && text(working) === before;
      }
      for (const id of ids) {
        if (unaffectedInputs.get(path)?.has(id)) continue;
        const beforeTask = previousActive.find((task) => task.id === id);
        const task = projection.tasks.find((entry) => entry.id === id);
        if (!beforeTask || !task || taskTitleAbandoned(task.title) || beforeTask.definitionDigest !== task.definitionDigest ||
          beforeTask.inputContext?.inputs.find((input) => input.path === path)?.blob !== task.inputContext?.inputs.find((input) => input.path === path)?.blob)
          continue;
        if (before === undefined || planned !== before || headBlob !== before || !unchangedWorking) {
          problems.push(`Task ${id} prior retained input changed without current classification for ${path}`);
          continue;
        }
        const tasks = unaffectedInputs.get(path) ?? new Set<number>();
        tasks.add(id);
        unaffectedInputs.set(path, tasks);
      }
    }
    break;
  }
  return {
    problems,
    planCommit: impactCommit,
    reviewReference: impact.reviewReference,
    unaffectedInputs: problems.length === 0 ? unaffectedInputs : new Map(),
  };
};
