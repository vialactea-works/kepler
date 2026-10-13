import type { ProcessResult } from "./runtime.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";

interface TaskArtifactHistory {
  readonly history: ProcessResult;
  readonly blobs: ReadonlyMap<string, ProcessResult>;
}

export interface TaskLedgerHistory extends TaskArtifactHistory {
  readonly root: string;
  readonly path: string;
  readonly head: string;
  readonly tasks: ReadonlyMap<string, TaskArtifactHistory>;
  readonly plan: { readonly path: string; readonly blob: ProcessResult };
}

const collectArtifactHistory = async (git: TaskCheckpointGit, root: string, path: string, head: string): Promise<TaskArtifactHistory> => {
  const history = await git.pathHistory(root, path);
  const revisions = history.status === 0 ? [...new Set([head, ...history.stdout.trim().split(/\r?\n/).filter(Boolean)])] : [head];
  const blobs = new Map<string, ProcessResult>();
  for (let offset = 0; offset < revisions.length; offset += 4) {
    await Promise.all(revisions.slice(offset, offset + 4).map(async (revision) => {
      return blobs.set(revision, await git.blobAt(root, revision, path));
    }));
  }
  return { history, blobs };
};

export const collectTaskLedgerHistory = async (git: TaskCheckpointGit, root: string, path: string, head: string, taskPaths: readonly string[] = []): Promise<TaskLedgerHistory> => {
  const history = await collectArtifactHistory(git, root, path, head);
  const tasks = new Map<string, TaskArtifactHistory>();
  for (let offset = 0; offset < taskPaths.length; offset += 4) {
    await Promise.all(taskPaths.slice(offset, offset + 4).map(async (taskPath) => {
      return tasks.set(taskPath, await collectArtifactHistory(git, root, taskPath, head));
    }));
  }
  const planPath = path.replace(/progress\.md$/, "plan.md");
  const plan = { path: planPath, blob: await git.blobAt(root, head, planPath) };
  return { ...history, root, path, head, tasks, plan };
};

export const taskLedgerHistoryAt = (git: TaskCheckpointGit, root: string, path: string, head: string): TaskLedgerHistory | undefined => {
  const history = git.ledgerHistory;
  return history?.root === root && history.path === path && history.head === head ? history : undefined;
};

export const taskCheckpointHistoryAt = (git: TaskCheckpointGit, root: string, path: string, head: string): TaskCheckpointGit => {
  const ledger = git.ledgerHistory;
  if (!ledger || ledger.root !== root || ledger.head !== head) return git;
  const task = ledger.tasks.get(path);
  if (!task) return git;
  return {
    ...git,
    pathHistory: (directory, source) => directory === root && source === path ? task.history : git.pathHistory(directory, source),
    blobAt: (directory, revision, source) => {
      if (directory === root && source === path && task.blobs.has(revision)) return task.blobs.get(revision) as ProcessResult;
      if (directory === root && source === ledger.plan.path && revision === head) return ledger.plan.blob;
      return git.blobAt(directory, revision, source);
    },
  };
};
