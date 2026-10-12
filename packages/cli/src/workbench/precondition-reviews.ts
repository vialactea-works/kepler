import * as Path from "node:path";
import { createArtifactReader, type RecognizedArtifact } from "./artifact-reader.js";
import { visibleMarkdownLines } from "./artifact-body.js";
import { validateArtifact } from "./artifact-contracts.js";
import type {
  ReviewClearanceProvenance,
  ReviewFinding,
  ReviewPassEvidence,
  ReviewPassVerdict,
  ValidArtifactContract,
} from "./artifact-types.js";
import {
  exactArtifactCommit,
  type TaskInspection,
  readContract,
  type TaskEvidence,
  titleOf,
} from "./precondition-artifacts.js";
import {
  fullCommit,
  gitBlobAt,
  gitCommand,
  gitCommitFiles,
  gitCurrentHead,
  gitIsAncestor,
  gitLatestMaterialCommit,
  gitResolveCommit,
  relativePath,
  successful,
  text,
} from "./precondition-git.js";
import type { PreconditionRuntime } from "./precondition-runtime.js";
import { parseReviewPasses } from "./review-passes.js";
import { isFullTargetBranchReference } from "./git-reference.js";

export type RangeStatus = "malformed" | "off-branch" | "stale" | "fresh";

export const validRange = async (
  runtime: PreconditionRuntime,
  root: string,
  base: unknown,
  head: unknown,
  required?: string,
): Promise<RangeStatus> => {
  if (!fullCommit(base) || !fullCommit(head)) return "malformed";
  const resolvedBase = await gitResolveCommit(runtime, root, base);
  const resolvedHead = await gitResolveCommit(runtime, root, head);
  if (
    !successful(resolvedBase) ||
    !successful(resolvedHead) ||
    text(resolvedBase) !== base ||
    text(resolvedHead) !== head
  )
    return "malformed";
  if (!successful(await gitIsAncestor(runtime, root, base, head)))
    return "malformed";
  const current = text(await gitCurrentHead(runtime, root));
  if (
    !fullCommit(current) ||
    !successful(await gitIsAncestor(runtime, root, head, current))
  )
    return "off-branch";
  if (
    required &&
    !successful(await gitIsAncestor(runtime, root, required, head))
  )
    return "stale";
  return "fresh";
};

export interface ReviewEvidence {
  readonly artifact: ValidArtifactContract;
  readonly source: string;
  readonly verdict: ReviewPassVerdict;
  readonly base: string;
  readonly head: string;
  readonly blocking: readonly string[];
  readonly pass: ReviewPassEvidence;
  readonly passes: readonly ReviewPassEvidence[];
  readonly clearance?: ReviewClearanceProvenance;
}

export interface ReviewInspection {
  readonly output: string;
  readonly passed: boolean;
  readonly review?: ReviewEvidence;
  readonly reviewReason?: string;
  readonly reviewDurable: boolean;
  readonly reviewRange: RangeStatus;
}

export const readReview = async (
  runtime: PreconditionRuntime,
  path: string,
  expectedTitle: string,
  expected: "feedback" | "review",
): Promise<ReviewEvidence | string> => {
  const read = await readContract(runtime, path, expected);
  if (!read.artifact || !read.source) return read.reason ?? "malformed";
  const title = titleOf(
    read.artifact,
    expected === "feedback" ? "Code Feedback: " : "Whole-branch Review: ",
  );
  const parsedArtifact = await createArtifactReader({
    readFile: () => read.source ?? "",
  })(path);
  if (parsedArtifact._tag !== "recognized") return "malformed";
  const parsed = parseReviewPasses(parsedArtifact);
  const latest = parsed.latest;
  if (title !== expectedTitle || latest === undefined)
    return "malformed";
  return {
    artifact: read.artifact,
    source: read.source,
    verdict: latest.verdict,
    base: latest.base,
    head: latest.head,
    blocking: latest.blocking,
    pass: latest,
    passes: parsed.passes.filter((pass): pass is ReviewPassEvidence => pass.provenance !== "structural"),
    ...(latest.clearance === undefined ? {} : { clearance: latest.clearance }),
  };
};

const lineOffset = (source: string, line: number): number => {
  if (line <= 1) return 0;
  let current = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\r") {
      if (source[index + 1] === "\n") index += 1;
      current += 1;
    } else if (source[index] === "\n") {
      current += 1;
    }
    if (current === line) return index + 1;
  }
  return source.length;
};

const passText = (
  source: string,
  number: number,
  contract: ValidArtifactContract,
): string | undefined => {
  const headings = contract.body.headings.filter(
    (heading) => heading.level === 2 && /^Pass [1-9][0-9]* — /.test(heading.text),
  );
  const index = headings.findIndex((heading) => heading.text.startsWith(`Pass ${number} — `));
  const heading = headings[index];
  if (!heading) return undefined;
  const next = headings.slice(index + 1).find((candidate) => candidate.line > heading.line);
  const start = lineOffset(source, heading.line);
  const end = next ? lineOffset(source, next.line) : source.length;
  return source.slice(start, end).replace(/(?:\r\n|\n|\r)+$/, "");
};

const parsedRootReview = async (source: string, path: string) => {
  const parsed = await createArtifactReader({ readFile: () => source })(path);
  if (parsed._tag !== "recognized") return undefined;
  const validated = validateArtifact(parsed);
  if (validated._tag !== "valid" || validated.artifact !== "review") return undefined;
  return { contract: validated, passes: parseReviewPasses(parsed) };
};

const retainedScopedHistoryProblems = async (
  runtime: PreconditionRuntime,
  root: string,
  reviewPath: string,
  review: ReviewEvidence,
  parentCommit: string,
  baselineNumber: number,
  currentHead: string,
): Promise<readonly string[]> => {
  const path = relativePath(root, reviewPath);
  const history = await gitCommand(
    runtime,
    ["log", "--full-history", "--format=%H", `${parentCommit}..${currentHead}`, "--", path],
    root,
  );
  const commits = text(history).split(/\r?\n/).filter(Boolean);
  if (!successful(history) || commits.length === 0 || commits.some((commit) => !fullCommit(commit)))
    return ["scoped review committed history is unavailable"];
  const problems = new Set<string>();
  for (const commit of commits) {
    const blob = await gitBlobAt(runtime, root, commit, path);
    const historical = successful(blob) ? await parsedRootReview(blob.stdout, reviewPath) : undefined;
    if (!historical || historical.passes.diagnostics.length > 0) {
      problems.add(`scoped review committed history is unreadable or invalid at ${commit}`);
      continue;
    }
    for (const pass of historical.passes.passes.filter((pass) => pass.number > baselineNumber)) {
      if (passText(blob.stdout, pass.number, historical.contract) !== passText(review.source, pass.number, review.artifact))
        problems.add(`retained scoped review Pass ${pass.number} text differs from committed history`);
    }
  }
  return [...problems];
};

const parsedPlanContract = async (source: string, path: string) => {
  const parsed = await createArtifactReader({ readFile: () => source })(path);
  if (parsed._tag !== "recognized") return undefined;
  const validated = validateArtifact(parsed);
  if (validated._tag !== "valid" || validated.artifact !== "plan") return undefined;
  return { artifact: parsed, contract: validated };
};

const removeExecutionOverviewFields = (
  source: string,
  contract: ValidArtifactContract,
): string => {
  const transition = contract.body.workflow.plan?.executionTransition;
  if (!transition) return source;
  const fields = new Set([
    `- Execution approval: ${transition.approval}`,
    `- Previous execution order: ${transition.previousOrder.join(", ")}`,
    `- New execution order: ${contract.body.workflow.plan?.executionOrder.join(", ")}`,
    `- Fully gated prefix: ${transition.fullyGatedPrefix.length === 0 ? "none" : transition.fullyGatedPrefix.join(", ")}`,
    `- Reason: ${transition.reason}`,
    `- Affected obligations: ${transition.affected}`,
  ]);
  const records = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
  const visible = visibleMarkdownLines(source);
  const executionFields = new Set(
    visible.flatMap((line, index) => fields.has(line.trim()) ? [index] : []),
  );
  const firstExecutionField = Math.min(...executionFields);
  const precedingRecord = records[firstExecutionField - 1] ?? "";
  if (
    executionFields.size > 0 &&
    firstExecutionField > 0 &&
    precedingRecord.replace(/(?:\r\n|\n|\r)$/, "") === ""
  ) executionFields.add(firstExecutionField - 1);
  return records.filter((_, index) => !executionFields.has(index)).join("");
};

const planBodyParts = (
  artifact: RecognizedArtifact,
  contract: ValidArtifactContract,
) => {
  const headings = contract.body.headings.filter((heading) => heading.level === 2);
  const tasksHeading = headings.find((heading) => heading.text === "Tasks");
  const overviewHeading = headings.find((heading) => heading.text === "Overview");
  if (!tasksHeading || !overviewHeading) return undefined;
  const body = artifact.body;
  const bodyLine = (line: number) => line - artifact.locations.body.startLine + 1;
  const taskHeadingStart = lineOffset(body, bodyLine(tasksHeading.line));
  const taskStart = lineOffset(body, bodyLine(tasksHeading.line) + 1);
  const nextTaskSection = headings.find((heading) => heading.line > tasksHeading.line);
  const taskEnd = nextTaskSection
    ? lineOffset(body, bodyLine(nextTaskSection.line))
    : body.length;
  const overviewStart = lineOffset(body, bodyLine(overviewHeading.line) + 1);
  const nextOverviewSection = headings.find((heading) => heading.line > overviewHeading.line);
  const overviewEnd = nextOverviewSection
    ? lineOffset(body, bodyLine(nextOverviewSection.line))
    : body.length;
  const before = body.slice(0, overviewStart) +
    removeExecutionOverviewFields(body.slice(overviewStart, overviewEnd), contract) +
    body.slice(overviewEnd, taskHeadingStart);
  return {
    before,
    tasks: body.slice(taskStart, taskEnd),
    taskStart,
    after: body.slice(taskEnd),
  };
};

const administrativeReviewPath = (
  path: string,
  changePath: string,
  tasks: TaskInspection["tasks"],
): boolean =>
  path === `${changePath}/progress.md` ||
  path === `${changePath}/review.md` ||
  path === `${changePath}/finish.md` ||
  tasks.some((task) => path === `${changePath}/tasks/task-${task.task}/progress.md` || path === `${changePath}/tasks/task-${task.task}/feedback.md`);

const validateRemediationClearance = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  inspection: TaskInspection,
  reviewPath: string,
  review: ReviewEvidence,
  targetBranch: string,
): Promise<readonly string[]> => {
  const clearance = review.clearance;
  const problems: string[] = [];
  if (clearance?.scope !== "remediation")
    return ["approved-remediation has no valid remediation provenance"];
  const baselineIndex = review.passes.findIndex((pass) => pass.number === clearance.parentPass);
  const baseline = review.passes[baselineIndex];
  if (
    baselineIndex < 0 ||
    !baseline ||
    baseline.provenance !== "per-pass" ||
    baseline.clearance?.scope !== "full" ||
    baseline.verdict !== "changes-requested" ||
    baseline.findings.length === 0
  )
    return ["remediation baseline is missing, structural, or not a full requested-change pass"];
  if (baseline.clearance.target !== targetBranch || clearance.target !== targetBranch)
    problems.push("remediation baseline target changed");
  if (baseline.base !== review.base || clearance.deltaBase !== baseline.head)
    problems.push("remediation Base or Delta base does not match the full baseline");
  if (clearance.parentPass !== baseline.number)
    problems.push("remediation Parent pass is not the named full baseline");
  const reviewRelative = relativePath(root, reviewPath);
  const parentCommit = await gitResolveCommit(runtime, root, clearance.parentCommit);
  const currentHeadResult = await gitCurrentHead(runtime, root);
  const currentHead = text(currentHeadResult);
  if (
    !successful(parentCommit) ||
    !fullCommit(text(parentCommit)) ||
    text(parentCommit) !== clearance.parentCommit ||
    !successful(currentHeadResult) ||
    !fullCommit(currentHead) ||
    !successful(await gitIsAncestor(runtime, root, clearance.parentCommit, currentHead))
  )
    problems.push("remediation Parent commit is unresolved or off-branch");
  const parentFiles = await gitCommitFiles(runtime, root, clearance.parentCommit);
  const parentPaths = parentFiles.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (!successful(parentFiles) || parentPaths.length !== 1 || parentPaths[0] !== reviewRelative)
    problems.push("remediation Parent commit is not an artifact-only review commit");
  const immutableReview = await gitBlobAt(runtime, root, clearance.parentCommit, reviewRelative);
  if (!successful(immutableReview))
    problems.push("remediation Parent commit does not contain the baseline review artifact");
  else {
    const baselineArtifact = await parsedRootReview(immutableReview.stdout, reviewPath);
    const committedBaseline = baselineArtifact?.passes.latest;
    if (!baselineArtifact) {
      problems.push("remediation Parent commit does not contain a valid baseline review artifact");
    } else {
      if (
        titleOf(baselineArtifact.contract, "Whole-branch Review: ") !==
        titleOf(review.artifact, "Whole-branch Review: ")
      ) problems.push("full-review baseline title does not match the current plan title");
      if (
        baselineArtifact.passes.diagnostics.length > 0 ||
        committedBaseline?.number !== baseline.number ||
        committedBaseline.clearance?.scope !== "full" ||
        committedBaseline.verdict !== "changes-requested" ||
        passText(immutableReview.stdout, baseline.number, baselineArtifact.contract) !==
          passText(review.source, baseline.number, review.artifact)
      ) problems.push("retained full-review baseline text differs from its immutable artifact commit");
    }
  }
  if (!successful(await gitIsAncestor(runtime, root, baseline.head, clearance.parentCommit)))
    problems.push("remediation baseline artifact commit does not contain its reviewed Head");
  const changePath = relativePath(root, changeDir);
  const basePlanBlob = await gitBlobAt(runtime, root, baseline.head, `${changePath}/plan.md`);
  const baselinePlan = successful(basePlanBlob)
    ? await parsedPlanContract(basePlanBlob.stdout, Path.join(changeDir, "plan.md"))
    : undefined;
  const baselineMaterial = await gitCommand(
    runtime,
    [
      "log",
      "-1",
      "--format=%H",
      clearance.parentCommit,
      "--",
      ".",
      `:(exclude)${changePath}/progress.md`,
      `:(exclude)${changePath}/review.md`,
      `:(exclude)${changePath}/finish.md`,
      ...inspection.tasks.flatMap((task) => [
        `:(exclude)${task.progressPath}`,
        `:(exclude)${task.feedbackPath}`,
      ]),
    ],
    root,
  );
  const baselineMaterialCommit = text(baselineMaterial);
  if (
    !successful(baselineMaterial) ||
    !fullCommit(baselineMaterialCommit) ||
    !successful(await gitIsAncestor(runtime, root, baselineMaterialCommit, baseline.head))
  ) problems.push("full-review baseline Head does not contain its latest material change");
  const oldTaskIds = new Set(
    (baselinePlan?.contract.body.workflow.plan?.tasks ?? []).map((task) => task.id),
  );
  for (const taskId of oldTaskIds) {
    for (const path of [
      `${changePath}/tasks/task-${taskId}/progress.md`,
      `${changePath}/tasks/task-${taskId}/feedback.md`,
    ]) {
      const baselineBlob = await gitBlobAt(runtime, root, baseline.head, path);
      const currentBlob = await gitBlobAt(runtime, root, currentHead, path);
      if (
        successful(baselineBlob) !== successful(currentBlob) ||
        (successful(baselineBlob) && baselineBlob.stdout !== currentBlob.stdout)
      ) problems.push(`frozen task evidence changed after full review: ${path}`);
    }
  }
  const suffix = review.passes.slice(baselineIndex + 1);
  if (suffix.length === 0 || suffix.some((pass) =>
    pass.clearance?.scope !== "remediation" ||
    pass.clearance.parentPass !== baseline.number ||
    pass.clearance.parentCommit !== clearance.parentCommit ||
    pass.clearance.deltaBase !== baseline.head ||
    pass.clearance.target !== targetBranch ||
    pass.base !== baseline.base
  ))
    problems.push("scoped review suffix is not linked to the same full baseline and correction range");
  for (const pass of suffix) {
    const resolvedHead = await gitResolveCommit(runtime, root, pass.head);
    if (!successful(resolvedHead) || text(resolvedHead) !== pass.head)
      problems.push(`scoped review Pass ${pass.number} Head cannot be resolved`);
    else if (
      !successful(await gitIsAncestor(runtime, root, baseline.head, pass.head)) ||
      !successful(await gitIsAncestor(runtime, root, pass.head, review.head))
    ) problems.push(`scoped review Pass ${pass.number} Head is outside the cumulative correction range`);
  }
  problems.push(...await retainedScopedHistoryProblems(
    runtime, root, reviewPath, review, clearance.parentCommit, baseline.number, currentHead,
  ));
  const findings = new Map<string, ReviewFinding>();
  for (const pass of [baseline, ...suffix]) {
    for (const finding of pass.findings) {
      const existing = findings.get(finding.id);
      if (existing?.kind && finding.kind && existing.kind !== finding.kind)
        problems.push(`finding ${finding.id} changed classification`);
      findings.set(finding.id, {
        id: finding.id,
        text: finding.text,
        ...(finding.kind ?? existing?.kind ? { kind: finding.kind ?? existing?.kind } : {}),
      });
    }
  }
  const findingValues = [...findings.values()];
  if (findingValues.some((finding) => finding.kind === undefined))
    problems.push("every bounded-review blocker must have a classified finding kind");
  if (findingValues.some((finding) => finding.kind === "intent-defect"))
    problems.push("intent defects require upstream revision and fresh full review");
  const evidenceGapOnly = findingValues.length > 0 &&
    findingValues.every((finding) => finding.kind === "evidence-gap");
  if (evidenceGapOnly) {
    for (const finding of findingValues) {
      const priorRequest = suffix.slice(0, -1).reverse().find((pass) =>
        pass.verdict === "changes-requested" &&
        pass.findings.some((candidate) => candidate.id === finding.id),
      );
      const priorResolution = priorRequest?.clearance?.scope === "remediation"
        ? priorRequest.clearance.resolutions.find((resolution) => resolution.finding === finding.id)
        : undefined;
      const currentResolution = clearance.resolutions.find(
        (resolution) => resolution.finding === finding.id,
      );
      if (!priorRequest || !priorResolution || !currentResolution ||
        JSON.stringify([...priorResolution.evidence].sort()) !==
          JSON.stringify([...currentResolution.evidence].sort())) continue;
      const rangeChanges = await gitCommand(
        runtime,
        ["diff", "--name-only", "-z", `${priorRequest.head}..${review.head}`],
        root,
      );
      const materialSinceRequest = successful(rangeChanges)
        ? rangeChanges.stdout.split("\0").filter(Boolean)
          .filter((path) => !administrativeReviewPath(path, changePath, inspection.tasks))
        : ["<unverifiable>"];
      if (materialSinceRequest.length === 0)
        problems.push(`same-range evidence-gap resolution does not add located evidence: ${finding.id}`);
    }
  }
  if (!successful(await gitIsAncestor(runtime, root, clearance.deltaBase, review.head)))
    problems.push("remediation correction range is off-branch or does not descend from Delta base");
  const intentDiff = await gitCommand(
    runtime,
    ["diff", "--name-only", "-z", `${baseline.head}..${review.head}`, "--", `${changePath}/proposal.md`, `${changePath}/design.md`, `${changePath}/requirements`],
    root,
  );
  if (!successful(intentDiff) || intentDiff.stdout !== "")
    problems.push("approved formal intent changed since the full-review baseline");
  let currentPlanSource: string | undefined;
  if (runtime.fileSystem.readFile !== undefined) {
    try {
      currentPlanSource = await runtime.fileSystem.readFile(Path.join(changeDir, "plan.md"));
    } catch {
      currentPlanSource = undefined;
    }
  }
  if (!successful(basePlanBlob) || currentPlanSource === undefined)
    problems.push("full-review plan baseline cannot be read");
  else {
    const oldContract = baselinePlan;
    const currentContract = await parsedPlanContract(currentPlanSource, Path.join(changeDir, "plan.md"));
    if (!oldContract || !currentContract) {
      problems.push("full-review plan or current remediation plan is malformed");
    } else {
      const oldTasks = oldContract.contract.body.workflow.plan?.tasks ?? [];
      const currentPlan = currentContract.contract.body.workflow.plan;
      const currentTasks = currentPlan?.tasks ?? [];
      const currentById = new Map(currentTasks.map((task) => [task.id, task]));
      if (oldTasks.some((task) => {
        const current = currentById.get(task.id);
        return current === undefined ||
          current.title !== task.title ||
          current.definitionDigest !== task.definitionDigest ||
          JSON.stringify(current.inputContext) !== JSON.stringify(task.inputContext);
      })) problems.push("remediation changed or removed a baseline task definition or input handoff");
      const oldTaskIds = new Set(oldTasks.map((task) => task.id));
      const appendedTasks = currentTasks.filter((task) => !oldTaskIds.has(task.id));
      const executionOrder = currentPlan?.executionOrder ?? [];
      const oldMaximum = Math.max(0, ...oldTaskIds);
      if (appendedTasks.some((task) => task.id <= oldMaximum))
        problems.push("remediation tasks must use new appended task identities");
      if (appendedTasks.some((task) => !executionOrder.includes(task.id)))
        problems.push("remediation tasks must remain active until their ordinary gates pass");
      const oldPlanParts = planBodyParts(oldContract.artifact, oldContract.contract);
      const currentPlanParts = planBodyParts(currentContract.artifact, currentContract.contract);
      const oldTaskSection = oldPlanParts?.tasks.replace(/(?:\r\n|\n|\r)+$/, "") ?? "";
      const appendedStart = (currentPlanParts?.taskStart ?? 0) + oldTaskSection.length;
      const currentTaskEnd = currentPlanParts
        ? currentPlanParts.taskStart + currentPlanParts.tasks.length
        : 0;
      const appendedHeadings = currentContract.contract.body.headings.filter((heading) => {
        const bodyLine = heading.line - currentContract.artifact.locations.body.startLine + 1;
        const offset = lineOffset(currentContract.artifact.body, bodyLine);
        return offset >= appendedStart && offset < currentTaskEnd;
      });
      const appendedTaskIds = appendedHeadings.flatMap((heading) => {
        const match = heading.level === 3 ? /^Task ([1-9][0-9]*):/.exec(heading.text) : undefined;
        return match?.[1] === undefined ? [] : [Number(match[1])];
      });
      const nonTaskHeadings = appendedHeadings.some(
        (heading) => heading.level !== 3 || !/^Task [1-9][0-9]*:/.test(heading.text),
      );
      const tasksAreAppended = currentPlanParts !== undefined &&
        currentPlanParts.tasks.startsWith(oldTaskSection) &&
        appendedTaskIds.length === appendedTasks.length &&
        appendedTaskIds.every((id, index) => id === appendedTasks[index]?.id) &&
        !nonTaskHeadings;
      const oldMetadata = { ...oldContract.artifact.metadata };
      const currentMetadata = { ...currentContract.artifact.metadata };
      delete oldMetadata.execution;
      delete oldMetadata.execution_transition;
      delete currentMetadata.execution;
      delete currentMetadata.execution_transition;
      if (JSON.stringify(oldMetadata) !== JSON.stringify(currentMetadata))
        problems.push("remediation changed plan approval, route, or initialization metadata");
      const executionChanged = JSON.stringify({
        execution: oldContract.artifact.metadata.execution,
        transition: oldContract.artifact.metadata.execution_transition,
      }) !== JSON.stringify({
        execution: currentContract.artifact.metadata.execution,
        transition: currentContract.artifact.metadata.execution_transition,
      });
      if (executionChanged && (!currentPlan?.executionTransition || !inspection.executionTransitionValid))
        problems.push("execution-only remediation amendment lacks a validated A18 transition");
      if (appendedTasks.length === 0) {
        if (!evidenceGapOnly)
          problems.push("bounded code or intent findings require numbered remediation tasks or upstream revision");
        if (executionChanged ||
          !oldPlanParts ||
          !currentPlanParts ||
          oldPlanParts.before !== currentPlanParts.before ||
          oldPlanParts.tasks !== currentPlanParts.tasks ||
          oldPlanParts.after !== currentPlanParts.after)
          problems.push("evidence-gap-only clearance must preserve the complete plan without adding tasks");
      } else {
        if (!findingValues.some((finding) => finding.kind === "code-defect"))
          problems.push("evidence-gap-only clearance cannot invent numbered remediation tasks");
        const planAmendmentReasons = [
          oldPlanParts === undefined || currentPlanParts === undefined ? "missing plan sections" : undefined,
          oldPlanParts?.before !== currentPlanParts?.before ? "pre-task body changed" : undefined,
          oldPlanParts?.after !== currentPlanParts?.after ? "post-task body changed" : undefined,
          !tasksAreAppended ? `task section is not an exact append (ids ${appendedTaskIds.join(",")}; expected ${appendedTasks.map((task) => task.id).join(",")})` : undefined,
        ].filter((reason): reason is string => reason !== undefined);
        if (planAmendmentReasons.length > 0)
          problems.push(`remediation plan changes are not a pure appended-task amendment (${planAmendmentReasons.join("; ")})`);
      }
    }
  }
  const changed = await gitCommand(
    runtime,
    ["diff", "--name-only", "-z", `${clearance.deltaBase}..${review.head}`],
    root,
  );
  let changedMaterialPaths: string[] = [];
  if (successful(changed)) {
    changedMaterialPaths = changed.stdout.split("\0").filter(Boolean)
      .filter((path) => !administrativeReviewPath(path, changePath, inspection.tasks));
    const evidence = clearance.resolutions.flatMap((resolution) => resolution.evidence);
    for (const path of changedMaterialPaths) {
      const classified = evidence.some((entry) =>
        entry === path ||
        entry.replace(/[`,;()]/g, " ").split(/\s+/).includes(path),
      );
      if (!classified) problems.push(`remediation correction path is unclassified: ${path}`);
    }
  } else {
    problems.push("remediation correction paths cannot be enumerated");
  }
  const latestMaterial = text(
    await gitLatestMaterialCommit(
      runtime,
      root,
      relativePath(root, changeDir),
      inspection.tasks.map((task) => task.progressPath),
    ),
  );
  if (
    !fullCommit(latestMaterial) ||
    !successful(await gitIsAncestor(runtime, root, latestMaterial, review.head))
  ) problems.push("remediation review Head does not contain its latest material change");
  if (evidenceGapOnly && changedMaterialPaths.length > 0)
    problems.push("evidence-gap-only clearance cannot include a material correction delta");
  if (evidenceGapOnly && latestMaterial !== baselineMaterialCommit)
    problems.push("evidence-gap-only clearance must use the unchanged full-review material range");
  const resolutionIds = clearance.resolutions.map((resolution) => resolution.finding);
  if (
    new Set(resolutionIds).size !== resolutionIds.length ||
    resolutionIds.length !== findings.size ||
    [...findings.keys()].some((id) => !resolutionIds.includes(id))
  )
    problems.push("remediation resolutions must exactly cover every baseline and scoped blocker identity");
  return problems;
};

export const inspectReviews = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  inspection: TaskInspection,
  targetBranch: string,
  historicalTargetCommit?: string,
): Promise<ReviewInspection> => {
  const problems: string[] = [];
  for (const task of inspection.tasks) {
    const path = Path.join(
      changeDir,
      "tasks",
      `task-${task.task}`,
      "feedback.md",
    );
    const feedback = await readReview(
      runtime,
      path,
      `Task ${task.task} — ${task.title}`,
      "feedback",
    );
    if (typeof feedback === "string") {
      problems.push(`Task ${task.task} feedback ${feedback}`);
      continue;
    }
    if (feedback.verdict !== "approved")
      problems.push(`Task ${task.task} latest verdict: ${feedback.verdict}`);
    if (
      task.checkpoint.kind !== "verified" ||
      feedback.base !== task.checkpoint.base
    )
      problems.push(
        `Task ${task.task} feedback Base does not match its historical checkpoint`,
      );
    if (!(await exactArtifactCommit(runtime, root, path)))
      problems.push(
        `Task ${task.task} feedback is not tracked and committed exactly at HEAD`,
      );
    const standing =
      task.implementation === undefined
        ? "malformed"
        : await validRange(
            runtime,
            root,
            feedback.base,
            feedback.head,
            task.implementation,
          );
    if (standing !== "fresh")
      problems.push(`Task ${task.task} feedback is ${standing}`);
  }
  const reviewPath = Path.join(changeDir, "review.md");
  const review = await readReview(
    runtime,
    reviewPath,
    inspection.planTitle ?? "",
    "review",
  );
  let reviewDurable = false;
  let reviewRange: RangeStatus = "malformed";
  let reviewReason: string | null = null;
  if (typeof review === "string") {
    reviewReason = review;
    problems.push(`whole-branch review ${review}`);
  } else {
    reviewDurable = await exactArtifactCommit(runtime, root, reviewPath);
    reviewRange = await validRange(runtime, root, review.base, review.head);
    if (!isFullTargetBranchReference(targetBranch)) {
      problems.push("whole-branch admission requires an explicit full target-branch reference");
    } else {
      const targetCommit = await gitCommand(
        runtime,
        ["rev-parse", "--verify", "--end-of-options", `${historicalTargetCommit ?? targetBranch}^{commit}`],
        root,
      );
      const currentHead = await gitCurrentHead(runtime, root);
      if (
        !successful(targetCommit) ||
        !fullCommit(text(targetCommit)) ||
        !successful(currentHead) ||
        !fullCommit(text(currentHead))
      )
        problems.push(`whole-branch target cannot be resolved: ${targetBranch}`);
      else {
        const actualBase = await gitCommand(
          runtime,
          ["merge-base", text(targetCommit), text(currentHead)],
          root,
        );
        if (!successful(actualBase) || !fullCommit(text(actualBase)))
          problems.push(`whole-branch target merge base cannot be resolved: ${targetBranch}`);
        else if (text(actualBase) !== review.base)
          problems.push("whole-branch review Base is not the actual target merge base");
      }
    }
    const clearanceTarget = review.clearance?.target;
    if (clearanceTarget !== undefined && clearanceTarget !== targetBranch)
      problems.push(`whole-branch review Target does not match selected target ${targetBranch}`);
    if (review.verdict !== "approved" && review.verdict !== "approved-remediation")
      problems.push(`whole-branch latest verdict: ${review.verdict}`);
    if (review.verdict === "approved-remediation")
      problems.push(
        ...(await validateRemediationClearance(
          runtime,
          root,
          changeDir,
          inspection,
          reviewPath,
          review,
          targetBranch,
        )),
      );
    if (!reviewDurable)
      problems.push(
        "whole-branch review is not tracked and committed exactly at HEAD",
      );
    if (reviewRange !== "fresh")
      problems.push(`whole-branch review range is ${reviewRange}`);
  }
  return {
    passed: problems.length === 0,
    output:
      problems.length === 0
        ? "[PASS] Reviews (all task feedback and whole-branch approvals current)\n"
        : `[FAIL] Reviews (${problems.join("; ")})\n`,
    ...(typeof review === "string" ? {} : { review }),
    ...(reviewReason === null ? {} : { reviewReason }),
    reviewDurable,
    reviewRange,
  };
};

export const inspectFreshness = async (
  runtime: PreconditionRuntime,
  root: string,
  inspection: TaskInspection,
  reviews: ReviewInspection,
  waived: boolean,
): Promise<{ readonly output: string; readonly passed: boolean }> => {
  const problems: string[] = [];
  if (reviews.reviewReason) problems.push(`review ${reviews.reviewReason}`);
  else if (reviews.review) {
    if (!reviews.reviewDurable)
      problems.push("review is not tracked and committed exactly at HEAD");
    if (reviews.reviewRange !== "fresh")
      problems.push(`review range is ${reviews.reviewRange}`);
    if (reviews.review.verdict !== "approved" && reviews.review.verdict !== "approved-remediation")
      problems.push(`latest verdict: ${reviews.review.verdict}`);
  }
  if (!inspection.planDurable)
    problems.push("plan.md is not tracked and committed exactly at HEAD");
  const material = text(
    await gitLatestMaterialCommit(
      runtime,
      root,
      inspection.changePath,
      inspection.tasks.map((task: TaskEvidence) => task.progressPath),
    ),
  );
  if (!fullCommit(material))
    problems.push("no material commit exists on the current branch");
  if (
    problems.length === 0 &&
    !waived &&
    reviews.review &&
    fullCommit(material)
  ) {
    if (
      !fullCommit(reviews.review.head) ||
      !successful(
        await gitIsAncestor(runtime, root, material, reviews.review.head),
      )
    )
      problems.push(`review head does not contain material ${material}`);
  }
  if (problems.length > 0)
    return {
      passed: false,
      output: `[FAIL] Whole-branch review freshness (${problems.join("; ")})\n`,
    };
  if (waived)
    return {
      passed: true,
      output:
        "[WAIVED] Whole-branch review freshness (material ancestry waived by the user; record this in the finish entry)\n",
    };
  return {
    passed: true,
    output: `[PASS] Whole-branch review freshness (review contains material ${material})\n`,
  };
};
