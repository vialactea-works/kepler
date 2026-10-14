import { isFullTargetBranchReference } from "./git-reference.js";

export interface TaskAdmissionPrerequisite {
  readonly task: number;
  readonly feedbackCommit: string;
}

export interface TaskAdmission {
  readonly version: 1;
  readonly base: string;
  readonly sourceHead: string;
  readonly planCommit: string;
  readonly planDigest: string;
  readonly taskDefinition: string;
  readonly worker: string;
  readonly lane: string;
  readonly worktree: string;
  readonly gitDirectory: string;
  readonly repository: string;
  readonly commonDirectory: string;
  readonly coordinator: string;
  readonly source: string;
  readonly target: string;
  readonly prerequisites: readonly TaskAdmissionPrerequisite[];
}

export type TaskAdmissionValidation =
  | { readonly kind: "valid"; readonly admission: TaskAdmission }
  | { readonly kind: "invalid"; readonly reason: string };

export const taskAdmissionSchema = {
  type: "object",
  required: ["version", "base", "sourceHead", "planCommit", "planDigest", "taskDefinition", "worker", "lane", "worktree", "gitDirectory", "repository", "commonDirectory", "coordinator", "source", "target", "prerequisites"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    base: { type: "string", pattern: "^[0-9a-f]{40}$" },
    sourceHead: { type: "string", pattern: "^[0-9a-f]{40}$" },
    planCommit: { type: "string", pattern: "^[0-9a-f]{40}$" },
    planDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    taskDefinition: { type: "string", pattern: "^[0-9a-f]{64}$" },
    worker: { type: "string", minLength: 1, pattern: "\\S" },
    lane: { type: "string", pattern: "^refs/heads/[^\\u0000-\\u001f ~^:?*\\[\\\\]+$" },
    worktree: { type: "string", pattern: "^/[^\\u0000-\\u001f]*$" },
    gitDirectory: { type: "string", pattern: "^/[^\\u0000-\\u001f]*$" },
    repository: { type: "string", pattern: "^/[^\\u0000-\\u001f]*$" },
    commonDirectory: { type: "string", pattern: "^/[^\\u0000-\\u001f]*$" },
    coordinator: { type: "string", minLength: 1, pattern: "\\S" },
    source: { type: "string", pattern: "^refs/heads/[^\\u0000-\\u001f ~^:?*\\[\\\\]+$" },
    target: { type: "string", pattern: "^refs/(?:heads|remotes)/[^\\u0000-\\u001f ~^:?*\\[\\\\]+$" },
    prerequisites: { type: "array", items: { type: "object", required: ["task", "feedbackCommit"], additionalProperties: false, properties: { task: { type: "integer", minimum: 1 }, feedbackCommit: { type: "string", pattern: "^[0-9a-f]{40}$" } } } },
  },
} as const;

const sha = (value: unknown, length: number): value is string =>
  typeof value === "string" && new RegExp(`^[0-9a-f]{${String(length)}}$`).test(value);
const identity = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && /\S/.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
const absolutePath = (value: unknown): value is string =>
  typeof value === "string" && /^\/[^\u0000-\u001f\u007f]*$/.test(value) && (value === "/" || value.split("/").slice(1).every((part) => part !== "" && part !== "." && part !== ".."));
const reference = (value: unknown): value is string =>
  typeof value === "string" && isFullTargetBranchReference(value) && !value.includes("//") && value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
const branchReference = (value: unknown): value is string =>
  reference(value) && value.startsWith("refs/heads/");

export const validateTaskAdmission = (value: unknown): TaskAdmissionValidation => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "invalid", reason: "task admission must be an object" };
  const record = value as Record<string, unknown>;
  const keys = ["version", "base", "sourceHead", "planCommit", "planDigest", "taskDefinition", "worker", "lane", "worktree", "gitDirectory", "repository", "commonDirectory", "coordinator", "source", "target", "prerequisites"];
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) return { kind: "invalid", reason: "task admission fields are incomplete or unknown" };
  if (record.version !== 1) return { kind: "invalid", reason: "task admission version is unsupported" };
  if (!sha(record.base, 40) || !sha(record.sourceHead, 40) || !sha(record.planCommit, 40) || !sha(record.planDigest, 64) || !sha(record.taskDefinition, 64)) return { kind: "invalid", reason: "task admission hashes are invalid" };
  if (!identity(record.worker) || !identity(record.coordinator)) return { kind: "invalid", reason: "task admission identities are invalid" };
  if (!branchReference(record.lane) || !branchReference(record.source) || !reference(record.target) || record.lane === record.target || record.source === record.target || record.lane === record.source) return { kind: "invalid", reason: "task admission refs are invalid" };
  if (!absolutePath(record.worktree) || !absolutePath(record.gitDirectory) || !absolutePath(record.repository) || !absolutePath(record.commonDirectory)) return { kind: "invalid", reason: "task admission paths are invalid" };
  if (!Array.isArray(record.prerequisites)) return { kind: "invalid", reason: "task admission prerequisites are invalid" };
  const tasks = new Set<number>();
  const prerequisites: TaskAdmissionPrerequisite[] = [];
  for (const prerequisite of record.prerequisites) {
    if (typeof prerequisite !== "object" || prerequisite === null || Array.isArray(prerequisite)) return { kind: "invalid", reason: "task admission prerequisite is invalid" };
    const entry = prerequisite as Record<string, unknown>;
    if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "task") || !Object.hasOwn(entry, "feedbackCommit") || !Number.isSafeInteger(entry.task) || typeof entry.task !== "number" || entry.task < 1 || !sha(entry.feedbackCommit, 40) || tasks.has(entry.task)) return { kind: "invalid", reason: "task admission prerequisites are invalid" };
    tasks.add(entry.task);
    prerequisites.push({ task: entry.task, feedbackCommit: entry.feedbackCommit });
  }
  return {
    kind: "valid",
    admission: {
      version: 1,
      base: record.base,
      sourceHead: record.sourceHead,
      planCommit: record.planCommit,
      planDigest: record.planDigest,
      taskDefinition: record.taskDefinition,
      worker: record.worker,
      lane: record.lane,
      worktree: record.worktree,
      gitDirectory: record.gitDirectory,
      repository: record.repository,
      commonDirectory: record.commonDirectory,
      coordinator: record.coordinator,
      source: record.source,
      target: record.target,
      prerequisites,
    },
  };
};

export const validateTaskAdmissionHistory = (snapshots: readonly TaskAdmission[]): TaskAdmissionValidation => {
  const original = snapshots[0];
  if (!original) return { kind: "invalid", reason: "task admission history is empty" };
  if (snapshots.some((snapshot) => validateTaskAdmission(snapshot).kind !== "valid" || snapshot.base !== original.base || snapshot.repository !== original.repository || snapshot.commonDirectory !== original.commonDirectory || snapshot.source !== original.source || snapshot.target !== original.target)) return { kind: "invalid", reason: "task admission history changed immutable identity" };
  return { kind: "valid", admission: original };
};
