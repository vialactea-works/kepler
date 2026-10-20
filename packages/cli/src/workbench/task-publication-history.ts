import { taskLedgerHistoryAt } from "./task-ledger-history.js";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import type { TaskPublication } from "./artifact-types.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";

export type TaskPublicationHistory =
  | { readonly kind: "absent" }
  | { readonly kind: "unverified"; readonly reason: string }
  | { readonly kind: "verified"; readonly publication: TaskPublication; readonly commit: string };

export const inspectTaskPublicationHistory = async (git: TaskCheckpointGit, root: string, path: string, task: number, change: string, head: string, admissionCommit: string): Promise<TaskPublicationHistory> => {
  const invalid = (reason: string): TaskPublicationHistory => ({ kind: "unverified", reason });
  const collected = taskLedgerHistoryAt(git, root, path, head);
  const readEntry = async (commit: string): Promise<Record<string, unknown> | undefined> => {
    const blob = collected?.blobs.get(commit) ?? await git.blobAt(root, commit, path);
    if (blob.status !== 0) return undefined;
    const read = await createArtifactReader({ readFile: () => blob.stdout })(path);
    const contract = validateArtifact(read);
    if (contract._tag !== "valid" || contract.artifact !== "progress" || contract.metadata.change !== change || !Array.isArray(contract.metadata.tasks)) return undefined;
    const entry = contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task);
    return entry as Record<string, unknown> | undefined;
  };
  const current = await readEntry(head);
  if (!current) return invalid("current publication ledger is malformed");
  const terminalState = current.status === "done" || current.status === "blocked";
  const publication = current.publication as TaskPublication | undefined;
  const history = collected?.history ?? await git.pathHistory(root, path);
  if (history.status !== 0) return invalid("publication history is unavailable");
  let commit: string | undefined;
  let previous: string | undefined;
  let publishedEpoch: string | undefined;
  for (const revision of history.stdout.trim().split(/\r?\n/).filter(Boolean).reverse()) {
    const entry = await readEntry(revision);
    if (!entry) return invalid("publication history is malformed");
    const value = entry.publication === undefined ? undefined : JSON.stringify(entry.publication);
    const epoch = typeof entry.admission === "object" && entry.admission !== null ? (entry.admission as Record<string, unknown>).sourceHead : undefined;
    if (previous !== undefined && value === undefined) return invalid("publication history erased terminal authority");
    if (value !== undefined && value !== previous) {
      if (previous !== undefined && epoch === publishedEpoch) return invalid("publication history rewrote terminal authority without a new admission");
      publishedEpoch = typeof epoch === "string" ? epoch : undefined;
      if (value === JSON.stringify(publication)) commit = revision;
    }
    previous = value;
  }
  if (!terminalState) return { kind: "absent" };
  if (!publication || publication.outcome !== current.status) return invalid("terminal dependency-mode task lacks guarded publication");
  if (!commit || !/^[0-9a-f]{40}$/.test(commit) || !git.changedPaths) return invalid("publication commit is unavailable");
  const [parent, changed] = await Promise.all([git.firstParent(root, commit), git.changedPaths(root, commit)]);
  if (parent.status !== 0 || parent.stdout.trim() !== publication.integratedHead || changed.status !== 0 || changed.stdout.split("\0").filter(Boolean).some((entry) => entry !== path)) return invalid("publication is not a separate integrated-head ledger commit");
  const range = await Promise.all([publication.taskHead, publication.integratedHead, commit].map(async (revision) => {
    const [resolved, reachable] = await Promise.all([git.resolveCommit(root, revision), git.isAncestor(root, revision, head)]);
    return /^[0-9a-f]{40}$/.test(revision) && resolved.status === 0 && resolved.stdout.trim() === revision && reachable.status === 0;
  }));
  if (range.some((valid) => !valid)) return invalid("publication range is unresolved or unreachable");
  if ((await git.isAncestor(root, admissionCommit, publication.taskHead)).status !== 0 || (await git.isAncestor(root, publication.taskHead, publication.integratedHead)).status !== 0) return invalid("publication does not preserve admitted implementation ancestry");
  const taskPath = path.replace(/progress\.md$/, `tasks/task-${task}/progress.md`);
  const [original, latest] = await Promise.all([git.blobAt(root, publication.taskHead, taskPath), git.blobAt(root, head, taskPath)]);
  if (original.status !== 0 || latest.status !== 0 || original.stdout !== latest.stdout) return invalid("published task outcome changed after its integration");
  const read = await createArtifactReader({ readFile: () => original.stdout })(taskPath);
  const terminal = validateArtifact(read);
  const outcome = terminal._tag === "valid" ? terminal.body.workflow.records.filter((record) => record.kind === "attempt").at(-1)?.fields.Outcome : undefined;
  if (terminal._tag !== "valid" || terminal.artifact !== "task-progress" || terminal.metadata.task !== task || terminal.metadata.change !== change || terminal.metadata.status !== publication.outcome || outcome !== publication.outcome) return invalid("published terminal outcome is inconsistent");
  const planPath = path.replace(/progress\.md$/, "plan.md");
  const planBlob = await git.blobAt(root, publication.integratedHead, planPath);
  const planRead = await createArtifactReader({ readFile: () => planBlob.stdout })(planPath);
  const plan = validateArtifact(planRead);
  const definition = plan._tag === "valid" ? plan.body.workflow.plan?.tasks.find((entry) => entry.id === task) : undefined;
  if (!definition || (publication.outcome === "done" && definition.verify?.replace(/^`([\s\S]+)`$/, "$1") !== publication.verification?.command)) return invalid("publication does not record its exact integrated Verify");
  return { kind: "verified", publication, commit };
};
