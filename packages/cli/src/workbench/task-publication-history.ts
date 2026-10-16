import { taskLedgerHistoryAt } from "./task-ledger-history.js";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import type { TaskPublication, TaskReviewCoverage } from "./artifact-types.js";
import type { TaskAdmissionSnapshot } from "./task-admission-history.js";
import { validateTaskAdmission } from "./task-admission.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";
import { attemptStartHasKnownParentage } from "./task-review-coverage.js";

export interface TaskPublicationSnapshot {
  readonly publication: TaskPublication;
  readonly commit: string;
  readonly admissionCommit: string;
}

export type TaskPublicationHistory =
  | { readonly kind: "absent" }
  | { readonly kind: "unverified"; readonly reason: string }
  | { readonly kind: "verified"; readonly publication: TaskPublication; readonly commit: string; readonly publications: readonly TaskPublicationSnapshot[] };

const fullCommit = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const text = (result: { readonly stdout: string }): string => result.stdout.trim();

const readEntryAt = async (git: TaskCheckpointGit, root: string, path: string, change: string, task: number, head: string, cached?: ReadonlyMap<string, { readonly status: number; readonly stdout: string }>): Promise<Record<string, unknown> | undefined> => {
  const blob = cached?.get(head) ?? await git.blobAt(root, head, path);
  if (blob.status !== 0) return undefined;
  const read = await createArtifactReader({ readFile: () => blob.stdout })(path);
  const contract = validateArtifact(read);
  if (contract._tag !== "valid" || contract.artifact !== "progress" || contract.metadata.change !== change || !Array.isArray(contract.metadata.tasks)) return undefined;
  return contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task) as Record<string, unknown> | undefined;
};

const verifyCoverage = async (git: TaskCheckpointGit, root: string, taskPath: string, publication: Extract<TaskPublication, { readonly version: 2 }>, admissions: readonly TaskAdmissionSnapshot[], currentHead: string): Promise<string | undefined> => {
  const coverage: TaskReviewCoverage = publication.reviewCoverage;
  if (coverage.version !== 1 || coverage.integratedHead !== publication.integratedHead || coverage.attempts.length === 0) return "publication review coverage is malformed";
  if (!git.parents || !git.changedPaths) return "publication review coverage cannot be proven";
  let previousTerminal: string | undefined;
  let previousAdmissionIndex = -1;
  for (let index = 0; index < coverage.attempts.length; index += 1) {
    const attempt = coverage.attempts[index];
    if (!attempt || attempt.number !== index + 1 || !fullCommit(attempt.admissionCommit) || !fullCommit(attempt.startHead) || !fullCommit(attempt.terminalHead) || attempt.commits.length === 0) return "publication attempt coverage is malformed";
    const matchingAdmissions = admissions.map((candidate, admissionIndex) => ({ candidate, admissionIndex })).filter(({ candidate }) => candidate.commit === attempt.admissionCommit);
    if (matchingAdmissions.length !== 1 || (matchingAdmissions[0]?.admissionIndex ?? -1) <= previousAdmissionIndex) return "attempt does not identify one ordered admission epoch";
    const admission = matchingAdmissions[0]?.candidate;
    if (!admission) return "attempt admission is unavailable";
    previousAdmissionIndex = matchingAdmissions[0]?.admissionIndex ?? previousAdmissionIndex;
    const startParents = await git.parents(root, attempt.startHead);
    const parsedStartParents = startParents.status === 0 ? text(startParents).split(/\s+/).filter(Boolean) : [];
    if (!attemptStartHasKnownParentage(attempt.startHead, admission.commit, parsedStartParents, previousTerminal)) return "attempt start HEAD includes unaccounted pre-attempt ancestry";
    if ((await git.isAncestor(root, admission.admission.sourceHead, attempt.startHead)).status !== 0) return "attempt start HEAD omits its coordinator source";
    if (previousTerminal && (await git.isAncestor(root, previousTerminal, attempt.startHead)).status !== 0) return "task attempts do not preserve cumulative ancestry";
    const startResolved = await git.resolveCommit(root, attempt.startHead);
    const terminalResolved = await git.resolveCommit(root, attempt.terminalHead);
    if (startResolved.status !== 0 || text(startResolved) !== attempt.startHead || terminalResolved.status !== 0 || text(terminalResolved) !== attempt.terminalHead) return "attempt coverage contains an unresolved HEAD";
    let parent = attempt.startHead;
    const seen = new Set<string>();
    for (const covered of attempt.commits) {
      if (!fullCommit(covered.commit) || seen.has(covered.commit)) return "attempt coverage contains a duplicate or invalid commit";
      seen.add(covered.commit);
      const parents = await git.parents(root, covered.commit);
      const changed = await git.changedPaths(root, covered.commit);
      if (parents.status !== 0 || changed.status !== 0) return "attempt commit provenance is unavailable";
      const actualParents = text(parents).split(/\s+/).filter(Boolean);
      const actualPaths = changed.stdout.split("\0").filter(Boolean).sort();
      if (actualParents.length !== 1 || actualParents[0] !== parent || JSON.stringify(actualParents) !== JSON.stringify([...covered.parents]) || JSON.stringify(actualPaths) !== JSON.stringify([...covered.paths].sort())) return "attempt commit provenance does not match Git";
      if ((await git.isAncestor(root, covered.commit, currentHead)).status !== 0) return "attempt commit is not integrated at the publication boundary";
      parent = covered.commit;
    }
    if (parent !== attempt.terminalHead) return "attempt terminal HEAD does not match its covered commit sequence";
    const terminalBlob = await git.blobAt(root, attempt.terminalHead, taskPath);
    if (terminalBlob.status !== 0) return "attempt terminal task evidence is unavailable";
    const terminalRead = await createArtifactReader({ readFile: () => terminalBlob.stdout })(taskPath);
    const terminalContract = validateArtifact(terminalRead);
    const record = terminalContract._tag === "valid" && terminalContract.artifact === "task-progress"
      ? terminalContract.body.workflow.records.find((entry) => entry.kind === "attempt" && entry.number === attempt.number)
      : undefined;
    if (!record || record.fields["Start HEAD"] !== attempt.startHead || !["done", "blocked"].includes(record.fields.Outcome ?? "")) return "attempt start or terminal outcome does not match published task evidence";
    previousTerminal = attempt.terminalHead;
  }
  if (coverage.attempts.at(-1)?.terminalHead !== publication.taskHead) return "latest attempt coverage does not match task HEAD";
  const actualHeadParents = await git.parents(root, publication.integratedHead);
  if (actualHeadParents.status !== 0) return "integrated HEAD parents are unavailable";
  const actualParents = text(actualHeadParents).split(/\s+/).filter(Boolean);
  if (coverage.integrationBase === coverage.integratedHead) {
    if (publication.integratedHead !== coverage.integrationBase || (await git.isAncestor(root, publication.taskHead, coverage.integratedHead)).status !== 0) return "empty integration delta is inconsistent with task ancestry";
  } else if (actualParents.length !== 2 || actualParents[0] !== coverage.integrationBase || actualParents[1] !== publication.taskHead) {
    return "integrated HEAD does not preserve the exact merge-only integration boundary";
  }
  return undefined;
};

export const inspectTaskPublicationHistory = async (git: TaskCheckpointGit, root: string, path: string, task: number, change: string, head: string, admissions: readonly TaskAdmissionSnapshot[]): Promise<TaskPublicationHistory> => {
  const invalid = (reason: string): TaskPublicationHistory => ({ kind: "unverified", reason });
  const collected = taskLedgerHistoryAt(git, root, path, head);
  const current = await readEntryAt(git, root, path, change, task, head, collected?.blobs);
  if (!current) return invalid("current publication ledger is malformed");
  const history = collected?.history ?? await (git.pathHistoryAt?.(root, head, path) ?? git.pathHistory(root, path));
  if (history.status !== 0) return invalid("publication history is unavailable");
  const revisions = history.stdout.trim().split(/\r?\n/).filter(Boolean).reverse();
  const publications: TaskPublicationSnapshot[] = [];
  let previous: string | undefined;
  for (const revision of revisions) {
    if (!fullCommit(revision)) return invalid("publication history has an invalid revision");
    const entry = await readEntryAt(git, root, path, change, task, revision, collected?.blobs);
    if (!entry) return invalid("publication history is malformed");
    const value = entry.publication === undefined ? undefined : JSON.stringify(entry.publication);
    if (previous !== undefined && value === undefined) return invalid("publication history erased terminal authority");
    if (value !== undefined && value !== previous) {
      const publication = entry.publication as TaskPublication;
      if ((entry.status !== "done" && entry.status !== "blocked") || entry.status !== publication.outcome) return invalid("publication history does not bind its terminal state");
      const parsedAdmission = validateTaskAdmission(entry.admission);
      if (parsedAdmission.kind !== "valid") return invalid(parsedAdmission.reason);
      const admissionValue = JSON.stringify(parsedAdmission.admission);
      const candidates = admissions.filter((candidate) => JSON.stringify(candidate.admission) === admissionValue);
      if (candidates.length !== 1) return invalid("publication does not identify one verified admission epoch");
      const admission = candidates[0];
      if (!admission) return invalid("publication admission is unavailable");
      const taskPath = path.replace(/progress\.md$/, `tasks/task-${task}/progress.md`);
      if (publication.version === 2) {
        const problem = await verifyCoverage(git, root, taskPath, publication, admissions, revision);
        if (problem) return invalid(problem);
      } else if (publication.version !== 1) return invalid("publication version is unsupported");
      const [parent, changed, taskResolved, integratedResolved, publicationResolved, admissionAncestor, taskAncestor] = await Promise.all([
        git.firstParent(root, revision),
        git.changedPaths?.(root, revision) ?? Promise.resolve({ status: 2, stdout: "", stderr: "changed paths unavailable" }),
        git.resolveCommit(root, publication.taskHead),
        git.resolveCommit(root, publication.integratedHead),
        git.resolveCommit(root, revision),
        git.isAncestor(root, admission.commit, publication.taskHead),
        git.isAncestor(root, publication.taskHead, publication.integratedHead),
      ]);
      if (parent.status !== 0 || text(parent) !== publication.integratedHead || changed.status !== 0 || changed.stdout.split("\0").filter(Boolean).some((file) => file !== path)) return invalid("publication is not a separate integrated-head ledger commit");
      if (!fullCommit(publication.taskHead) || !fullCommit(publication.integratedHead) || taskResolved.status !== 0 || text(taskResolved) !== publication.taskHead || integratedResolved.status !== 0 || text(integratedResolved) !== publication.integratedHead || publicationResolved.status !== 0 || text(publicationResolved) !== revision) return invalid("publication range is unresolved");
      if (admissionAncestor.status !== 0 || taskAncestor.status !== 0) return invalid("publication does not preserve admitted implementation ancestry");
      const original = await git.blobAt(root, publication.taskHead, taskPath);
      if (original.status !== 0) return invalid("published task outcome is unavailable");
      const read = await createArtifactReader({ readFile: () => original.stdout })(taskPath);
      const terminal = validateArtifact(read);
      const outcome = terminal._tag === "valid" && terminal.artifact === "task-progress" ? terminal.body.workflow.records.filter((record) => record.kind === "attempt").at(-1)?.fields.Outcome : undefined;
      if (terminal._tag !== "valid" || terminal.artifact !== "task-progress" || terminal.metadata.task !== task || terminal.metadata.change !== change || terminal.metadata.status !== publication.outcome || outcome !== publication.outcome) return invalid("published terminal outcome is inconsistent");
      const planPath = path.replace(/progress\.md$/, "plan.md");
      const planBlob = await git.blobAt(root, publication.integratedHead, planPath);
      const planRead = await createArtifactReader({ readFile: () => planBlob.stdout })(planPath);
      const plan = validateArtifact(planRead);
      const definition = plan._tag === "valid" ? plan.body.workflow.plan?.tasks.find((entry) => entry.id === task) : undefined;
      if (!definition || (publication.outcome === "done" && definition.verify?.replace(/^`([\s\S]+)`$/, "$1") !== publication.verification?.command)) return invalid("publication does not record its exact integrated Verify");
      publications.push({ publication, commit: revision, admissionCommit: admission.commit });
    }
    previous = value;
  }
  const terminalState = current.status === "done" || current.status === "blocked";
  const latest = publications.at(-1);
  if (terminalState && (!latest || latest.publication.outcome !== current.status || JSON.stringify(latest.publication) !== JSON.stringify(current.publication))) return invalid("terminal dependency-mode task lacks guarded publication");
  if (!latest) return { kind: "absent" };
  return { kind: "verified", publication: latest.publication, commit: latest.commit, publications };
};
