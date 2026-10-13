import { createHash } from "node:crypto";
import { taskLedgerHistoryAt } from "./task-ledger-history.js";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import { validateTaskAdmission, validateTaskAdmissionHistory, type TaskAdmission } from "./task-admission.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";

export type TaskAdmissionHistory =
  | { readonly kind: "absent" }
  | { readonly kind: "unverified"; readonly reason: string }
  | { readonly kind: "verified"; readonly admission: TaskAdmission; readonly original: TaskAdmission; readonly commit: string; readonly originalCommit: string };

const fullCommit = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);

export const inspectTaskAdmissionHistory = async (git: TaskCheckpointGit, root: string, path: string, task: number, change: string, head: string): Promise<TaskAdmissionHistory> => {
  const invalid = (reason: string): TaskAdmissionHistory => ({ kind: "unverified", reason });
  const collected = taskLedgerHistoryAt(git, root, path, head);
  const history = collected?.history ?? await git.pathHistory(root, path);
  if (history.status !== 0) return invalid("admission history is unavailable");
  const revisions = history.stdout.trim().split(/\r?\n/).filter(Boolean).reverse();
  const snapshots: { admission: TaskAdmission; commit: string }[] = [];
  let erased = false;
  for (const commit of revisions) {
    if (!fullCommit(commit)) return invalid("admission history has an invalid revision");
    const blob = collected?.blobs.get(commit) ?? await git.blobAt(root, commit, path);
    if (blob.status !== 0) return invalid("admission ledger history is unavailable");
    const artifact = await createArtifactReader({ readFile: () => blob.stdout })(path);
    const contract = validateArtifact(artifact);
    if (contract._tag !== "valid" || contract.artifact !== "progress" || contract.metadata.change !== change || !Array.isArray(contract.metadata.tasks)) return invalid("admission ledger history is malformed");
    const entry = contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task) as Record<string, unknown> | undefined;
    if (entry === undefined) {
      if (snapshots.length > 0) return invalid("admission task identity is missing");
      continue;
    }
    if (!Object.hasOwn(entry, "admission")) {
      if (snapshots.length > 0) erased = true;
      continue;
    }
    if (erased) return invalid("admission history erased original authority");
    const parsed = validateTaskAdmission(entry.admission);
    if (parsed.kind !== "valid") return invalid(parsed.reason);
    if (snapshots.at(-1) && JSON.stringify(snapshots.at(-1)?.admission) === JSON.stringify(parsed.admission)) continue;
    const [resolved, reachable] = await Promise.all([git.resolveCommit(root, commit), git.isAncestor(root, commit, head)]);
    if (resolved.status !== 0 || resolved.stdout.trim() !== commit || reachable.status !== 0) return invalid("admission history is not reachable");
    if (entry.status !== "in-progress") return invalid("admission does not publish an in-progress transition");
    const before = await git.blobAt(root, parsed.admission.sourceHead, path);
    const beforeRead = await createArtifactReader({ readFile: () => before.stdout })(path);
    const beforeContract = validateArtifact(beforeRead);
    const beforeEntry = beforeContract._tag === "valid" && beforeContract.artifact === "progress" && Array.isArray(beforeContract.metadata.tasks)
      ? beforeContract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task) as Record<string, unknown> | undefined
      : undefined;
    if (before.status !== 0 || !beforeEntry || beforeEntry.title !== entry.title || beforeEntry.progress !== entry.progress || (snapshots.length === 0 && (!["pending", "blocked"].includes(String(beforeEntry.status)) || Object.hasOwn(beforeEntry, "admission")))) return invalid("admission source task was not eligible with preserved identity");
    snapshots.push({ admission: parsed.admission, commit });
  }
  if (erased) return invalid("admission history erased original authority");
  const original = snapshots[0];
  const latest = snapshots.at(-1);
  if (!original || !latest) return { kind: "absent" };
  const consistent = validateTaskAdmissionHistory(snapshots.map((snapshot) => snapshot.admission));
  if (consistent.kind !== "valid") return invalid(consistent.reason);
  const parent = await git.firstParent(root, original.commit);
  if (parent.status !== 0 || parent.stdout.trim() !== original.admission.base || original.admission.sourceHead !== original.admission.base) return invalid("original Base is not the first admission parent");
  if (!git.changedPaths) return invalid("admission commit scope cannot be verified");
  for (const snapshot of snapshots) {
    const { admission } = snapshot;
    const [sourceParent, base, baseAncestry, files, planRevision, planAncestry] = await Promise.all([
      git.firstParent(root, snapshot.commit), git.resolveCommit(root, admission.base),
      git.isAncestor(root, admission.base, snapshot.commit), git.changedPaths(root, snapshot.commit),
      git.resolveCommit(root, admission.planCommit), git.isAncestor(root, admission.planCommit, snapshot.commit),
    ]);
    if (sourceParent.status !== 0 || sourceParent.stdout.trim() !== admission.sourceHead) return invalid("admission source HEAD is not its publication parent");
    if (base.status !== 0 || base.stdout.trim() !== admission.base || baseAncestry.status !== 0) return invalid("admission original Base is unresolved or unreachable");
    if (files.status !== 0 || files.stdout.split("\0").filter(Boolean).some((entry) => entry !== path)) return invalid("admission must be committed separately from material work");
    const planPath = path.replace(/progress\.md$/, "plan.md");
    if (planRevision.status !== 0 || planRevision.stdout.trim() !== admission.planCommit || planAncestry.status !== 0) return invalid("admission plan revision is unresolved or unreachable");
    const [plan, livePlan] = await Promise.all([git.blobAt(root, admission.planCommit, planPath), git.blobAt(root, admission.sourceHead, planPath)]);
    if (plan.status !== 0 || livePlan.status !== 0 || livePlan.stdout !== plan.stdout || createHash("sha256").update(plan.stdout).digest("hex") !== admission.planDigest) return invalid("admission plan digest is stale");
    const planRead = await createArtifactReader({ readFile: () => plan.stdout })(planPath);
    const planContract = validateArtifact(planRead);
    const taskContract = planContract._tag === "valid" ? planContract.body.workflow.plan?.tasks.find((entry) => entry.id === task) : undefined;
    if (!taskContract || taskContract.definitionDigest !== admission.taskDefinition || planContract._tag !== "valid" || planContract.body.workflow.plan?.execution?.version !== 2 || JSON.stringify(taskContract.dependsOn) !== JSON.stringify(admission.prerequisites.map((prerequisite) => prerequisite.task))) return invalid("admission does not bind its dependency-mode task revision");
    for (const prerequisite of admission.prerequisites) {
      const approval = await git.resolveCommit(root, prerequisite.feedbackCommit);
      if (approval.status !== 0 || approval.stdout.trim() !== prerequisite.feedbackCommit || (await git.isAncestor(root, prerequisite.feedbackCommit, snapshot.commit)).status !== 0) return invalid("admission prerequisite approval is unreachable");
    }
  }
  return { kind: "verified", admission: latest.admission, original: original.admission, commit: latest.commit, originalCommit: original.commit };
};
