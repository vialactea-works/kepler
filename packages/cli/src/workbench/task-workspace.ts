import type { ProcessPort } from "./runtime.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";
import { inspectTaskAdmissionHistory } from "./task-admission-history.js";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import { validateTaskAdmission } from "./task-admission.js";

export interface TaskWorkspaceRuntime {
  readonly process: ProcessPort;
  readonly realpath: (path: string) => string | Promise<string>;
  readonly git: TaskCheckpointGit;
  readonly worker?: () => string | undefined;
}

export const inspectTaskWorkspace = async (runtime: TaskWorkspaceRuntime, root: string, ledgerPath: string, task: number, change: string, head: string, repository: string): Promise<string | undefined> => {
  const actual = await runtime.realpath(root);
  if (actual === repository) return actual;
  const blob = await runtime.git.blobAt(root, head, ledgerPath);
  if (blob.status !== 0) return undefined;
  const read = await createArtifactReader({ readFile: () => blob.stdout })(ledgerPath);
  const contract = validateArtifact(read);
  if (contract._tag !== "valid" || contract.artifact !== "progress" || contract.metadata.change !== change || !Array.isArray(contract.metadata.tasks)) return undefined;
  const readers = contract.metadata.tasks.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const parsed = validateTaskAdmission(record.admission);
    return parsed.kind === "valid" && parsed.admission.repository === repository && parsed.admission.worktree === actual && parsed.admission.worker === runtime.worker?.() && typeof record.id === "number" ? [record.id] : [];
  });
  if (readers.length !== 1 || readers[0] === undefined) return undefined;
  const reader = await inspectTaskAdmissionHistory(runtime.git, root, ledgerPath, readers[0], change, head);
  if (reader.kind !== "verified") return undefined;
  const query = async (cwd: string, ...args: string[]): Promise<string | undefined> => {
    const result = await runtime.process.run("git", args, cwd);
    return result.status === 0 ? result.stdout.trim() : undefined;
  };
  const admission = reader.admission;
  const [branch, gitDirectory, commonDirectory, ownerRoot, ownerHead, ownerBranch, ownerCommon] = await Promise.all([
    query(root, "symbolic-ref", "HEAD"), query(root, "rev-parse", "--absolute-git-dir"), query(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    query(repository, "rev-parse", "--show-toplevel"), query(repository, "rev-parse", "HEAD"), query(repository, "symbolic-ref", "HEAD"), query(repository, "rev-parse", "--path-format=absolute", "--git-common-dir"),
  ]);
  if (!gitDirectory || !commonDirectory || !ownerRoot || !ownerHead || !ownerCommon || !/^[0-9a-f]{40}$/.test(ownerHead)) return undefined;
  if (actual !== admission.worktree || branch !== admission.lane || await runtime.realpath(gitDirectory) !== admission.gitDirectory || await runtime.realpath(commonDirectory) !== admission.commonDirectory || await runtime.realpath(ownerRoot) !== repository || await runtime.realpath(ownerCommon) !== admission.commonDirectory || ownerBranch !== admission.source) return undefined;
  const authority = await inspectTaskAdmissionHistory(runtime.git, repository, ledgerPath, readers[0], change, ownerHead);
  if (authority.kind !== "verified" || JSON.stringify(authority.admission) !== JSON.stringify(admission)) return undefined;
  if (task !== readers[0]) {
    const localTask = await inspectTaskAdmissionHistory(runtime.git, root, ledgerPath, task, change, head);
    const ownerTask = await inspectTaskAdmissionHistory(runtime.git, repository, ledgerPath, task, change, ownerHead);
    if (localTask.kind !== ownerTask.kind || localTask.kind === "unverified" || ownerTask.kind === "unverified") return undefined;
    if (localTask.kind === "verified" && ownerTask.kind === "verified" && JSON.stringify(localTask.admission) !== JSON.stringify(ownerTask.admission)) return undefined;
  }
  return repository;
};
