import { createArtifactReader } from "./artifact-reader.js";
import { artifactContracts, validateArtifact } from "./artifact-contracts.js";
import { validateArtifactBody } from "./artifact-body.js";
import type { LegacyInputConfirmation, PlanTaskContract } from "./artifact-types.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";

const unusableReference = (value: string): boolean =>
  ["", "approved", "accepted", "yes", "true", "done", "none", "unknown", "todo", "tbd", "n/a"].includes(value.trim().toLowerCase());

export const legacyInputConfirmationMetadataProblems = (
  confirmation: LegacyInputConfirmation,
): readonly string[] => {
  const problems: string[] = [];
  if (
    unusableReference(confirmation.owner) ||
    unusableReference(confirmation.ownerReference) ||
    unusableReference(confirmation.reviewer) ||
    unusableReference(confirmation.reviewReference)
  )
    problems.push("owner or independent-review reference is not attributable");
  if (confirmation.owner.trim().toLowerCase() === confirmation.reviewer.trim().toLowerCase())
    problems.push("owner and independent reviewer must be distinct");
  if (confirmation.ownerReference.trim().toLowerCase() === confirmation.reviewReference.trim().toLowerCase())
    problems.push("owner and independent-review references must be distinct");
  return problems;
};

export const legacyCompletedDefinitionProblems = async (
  git: TaskCheckpointGit,
  root: string,
  taskProgressPath: string,
  planPath: string,
  change: string,
  task: number,
  definition: string,
): Promise<readonly string[]> => {
  const history = await git.pathHistory(root, taskProgressPath);
  if (history.status !== 0)
    return ["historical completed task definition is unverified: task history is unavailable"];
  const taskAt = async (commit: string): Promise<PlanTaskContract | undefined> => {
    const source = await git.blobAt(root, commit, planPath);
    if (source.status !== 0) return undefined;
    const plan = validateArtifact(await createArtifactReader({ readFile: () => source.stdout })(planPath));
    return plan._tag === "valid" && plan.artifact === "plan" && plan.metadata.change === change
      ? plan.body.workflow.plan?.tasks.find((entry) => entry.id === task)
      : undefined;
  };
  const commits = history.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean).reverse();
  let firstDone: string | undefined;
  for (const commit of commits) {
    if (!/^[0-9a-f]{40}$/.test(commit))
      return ["historical completed task definition is unverified: task history has an invalid revision"];
    const source = await git.blobAt(root, commit, taskProgressPath);
    if (source.status !== 0)
      return ["historical completed task definition is unverified: task history cannot be read"];
    const progress = await createArtifactReader({ readFile: () => source.stdout })(taskProgressPath);
    if (
      progress._tag !== "recognized" ||
      progress.metadata.artifact !== "task-progress" ||
      progress.metadata.change !== change ||
      progress.metadata.task !== task ||
      artifactContracts["task-progress"].validate(progress).length > 0
    )
      return ["historical completed task definition is unverified: task history has an invalid identity"];
    const body = validateArtifactBody(progress, "task-progress", "historical");
    if (body.diagnostics.length > 0)
      return ["historical completed task definition is unverified: task history is malformed"];
    const attempts = body.workflow.records.filter((record) => record.kind === "attempt");
    if (attempts.length === 0) {
      if (progress.metadata.status === "done")
        return ["historical completed task definition is unverified: completed evidence has no attempt"];
      continue;
    }
    const historical = await taskAt(commit);
    if (!historical)
      return ["historical task contract or provenance is unverified: implementation plan cannot be read"];
    if (historical.inputContext !== undefined)
      return ["historical input provenance is present; legacy current confirmation is not applicable"];
    const completedAttempt = attempts.some((record) => record.fields.Outcome === "done");
    if (progress.metadata.status !== "done" && !completedAttempt) continue;
    firstDone ??= commit;
    if (historical.definitionDigest !== definition)
      return ["historical completed task definition changed"];
  }
  if (firstDone === undefined) return [];
  const planHistory = await git.pathHistory(root, planPath);
  if (planHistory.status !== 0)
    return ["historical completed task definition is unverified: plan history is unavailable"];
  for (const commit of planHistory.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    if (!/^[0-9a-f]{40}$/.test(commit))
      return ["historical completed task definition is unverified: plan history has an invalid revision"];
    const afterCompletion = await git.isAncestor(root, firstDone, commit);
    if (afterCompletion.status === 1) continue;
    if (afterCompletion.status !== 0)
      return ["historical completed task definition is unverified: plan history cannot be ordered"];
    const historical = await taskAt(commit);
    if (!historical)
      return ["historical completed task definition is unverified: retained completed plan cannot be read"];
    if (historical.inputContext !== undefined)
      return ["historical input provenance is present; legacy current confirmation is not applicable"];
    if (historical.definitionDigest !== definition)
      return ["historical completed task definition changed"];
  }
  return [];
};
