import type { ScopeExpansion } from "./artifact-types.js";
import type { ProcessResult } from "./runtime.js";
import type { TaskCheckpointGit } from "./task-checkpoint.js";

export type { ScopeExpansion } from "./artifact-types.js";

export type ScopeExpansionResult =
  | { readonly kind: "valid"; readonly entries: readonly ScopeExpansion[] }
  | { readonly kind: "invalid"; readonly reason: string };

const concretePath = /^(?!\/)(?!\s)(?!.*\s$)(?!.*\/\/)(?!.*(?:^|\/)(?:\.{1,2}|\.git)(?:\/|$))(?!.*\/$)[^\\:*?\[\]{}\u0000-\u001f\u007f]+$/;
export const scopeExpansionPathPattern = concretePath.source;
const safePath = (path: string): boolean => concretePath.test(path);

export const validateScopeExpansions = (value: unknown): ScopeExpansionResult => {
  if (!Array.isArray(value)) return { kind: "invalid", reason: "scope expansions must be an array" };
  if (value.length > 2) return { kind: "invalid", reason: "scope expansion lifetime limit exceeded" };
  const ids = new Set<string>();
  const entries: ScopeExpansion[] = [];
  const keys = ["id", "attempt", "prerequisite", "necessity", "evidence", "paths", "verify"].sort();
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      return { kind: "invalid", reason: "scope expansion must be an object" };
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).sort().join("\0") !== keys.join("\0"))
      return { kind: "invalid", reason: "scope expansion fields are invalid" };
    for (const field of ["id", "prerequisite", "necessity", "evidence", "verify"])
      if (typeof record[field] !== "string" || record[field].trim() === "")
        return { kind: "invalid", reason: `scope expansion ${field} is invalid` };
    if (!Number.isSafeInteger(record.attempt) || (record.attempt as number) < 1)
      return { kind: "invalid", reason: "scope expansion attempt is invalid" };
    if (ids.has(record.id as string)) return { kind: "invalid", reason: "duplicate scope expansion id" };
    ids.add(record.id as string);
    if (!Array.isArray(record.paths) || record.paths.length < 1 || record.paths.length > 4)
      return { kind: "invalid", reason: "scope expansion paths must contain one to four paths" };
    const paths = new Set<string>();
    for (const path of record.paths) {
      if (typeof path !== "string" || !safePath(path))
        return { kind: "invalid", reason: "scope expansion path is unsafe" };
      if (paths.has(path)) return { kind: "invalid", reason: "duplicate scope expansion path" };
      paths.add(path);
    }
    entries.push({
      id: record.id as string,
      attempt: record.attempt as number,
      prerequisite: record.prerequisite as string,
      necessity: record.necessity as string,
      evidence: record.evidence as string,
      paths: [...paths],
      verify: record.verify as string,
    });
  }
  return { kind: "valid", entries };
};

export interface ScopeExpansionAttempt {
  readonly number: number;
  readonly evidence: string;
  readonly outcome?: string;
}

export interface ScopeExpansionSnapshot {
  readonly commit: string;
  readonly entries: readonly ScopeExpansion[];
  readonly attempts?: readonly ScopeExpansionAttempt[];
}

export type ScopeExpansionHistoryResult =
  | { readonly kind: "valid"; readonly entries: readonly ScopeExpansion[]; readonly reservationCommits: readonly string[] }
  | { readonly kind: "unverified"; readonly reason: string };

export interface ScopeExpansionHistoryGit extends TaskCheckpointGit {
  readonly changedPaths: (root: string, commit: string) => ProcessResult | Promise<ProcessResult>;
  readonly pathChanges: (root: string, base: string, head: string, paths: readonly string[]) => ProcessResult | Promise<ProcessResult>;
}

const fullCommit = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);
const same = (left: ScopeExpansion, right: ScopeExpansion | undefined): boolean =>
  right !== undefined && JSON.stringify(left) === JSON.stringify(right);

export const validateScopeExpansionHistory = async (
  git: ScopeExpansionHistoryGit,
  root: string,
  snapshots: readonly ScopeExpansionSnapshot[],
  originalBase?: string,
): Promise<ScopeExpansionHistoryResult> => {
  if (snapshots.length === 0) return { kind: "valid", entries: [], reservationCommits: [] };
  let previous: readonly ScopeExpansion[] = [];
  let priorAttempts: readonly ScopeExpansionAttempt[] = [];
  const reservationCommits: string[] = [];
  if (originalBase !== undefined) {
    if (!fullCommit(originalBase)) return { kind: "unverified", reason: "scope expansion baseline is unresolved" };
    const resolved = await git.resolveCommit(root, originalBase);
    if (resolved.status !== 0 || resolved.stdout.trim() !== originalBase)
      return { kind: "unverified", reason: "scope expansion baseline is unresolved" };
  }
  for (let index = 0; index < snapshots.length; index++) {
    const snapshot = snapshots[index]!;
    const resolved = await git.resolveCommit(root, snapshot.commit);
    if (!fullCommit(snapshot.commit) || resolved.status !== 0 || resolved.stdout.trim() !== snapshot.commit)
      return { kind: "unverified", reason: "scope expansion snapshot commit is unresolved" };
    if (index > 0 && (await git.isAncestor(root, snapshots[index - 1]!.commit, snapshot.commit)).status !== 0)
      return { kind: "unverified", reason: "scope expansion history cannot be ordered unambiguously" };
    const validated = validateScopeExpansions(snapshot.entries);
    if (validated.kind !== "valid") return { kind: "unverified", reason: validated.reason };
    if (validated.entries.length < previous.length || !previous.every((entry, position) => same(entry, validated.entries[position])))
      return { kind: "unverified", reason: "scope expansion history was removed, rewritten, or reordered" };
    const attempts = snapshot.attempts ?? [];
    for (const old of priorAttempts) {
      const current = attempts.find((attempt) => attempt.number === old.number);
      if (!current || !current.evidence.startsWith(old.evidence) || (old.outcome !== undefined && current.outcome !== old.outcome))
        return { kind: "unverified", reason: "task attempt evidence was erased, rewritten, or reordered" };
    }
    if (priorAttempts.some((attempt, position) => attempts[position]?.number !== attempt.number))
      return { kind: "unverified", reason: "task attempt evidence was reordered" };
    const added = validated.entries.slice(previous.length);
    if (added.length > 0) {
      let reservationBaseline = originalBase === undefined ? snapshots[0]?.commit : snapshots[index - 1]?.commit;
      if (originalBase !== undefined) {
        const admissionRelation = await git.isAncestor(root, snapshot.commit, originalBase);
        if (admissionRelation.status === 0) {
          const earliest = snapshots[0];
          if (earliest === undefined || earliest.commit === snapshot.commit)
            return { kind: "unverified", reason: "reservation history lacks a preceding task baseline" };
          if ((await git.isAncestor(root, earliest.commit, snapshot.commit)).status !== 0)
            return { kind: "unverified", reason: "scope expansion baseline ancestry is unavailable" };
          reservationBaseline = earliest.commit;
        } else if (admissionRelation.status === 1) {
          if ((await git.isAncestor(root, originalBase, snapshot.commit)).status !== 0)
            return { kind: "unverified", reason: "reservation does not descend from its task baseline" };
          reservationBaseline = originalBase;
        } else {
          return { kind: "unverified", reason: "scope expansion baseline ancestry is unavailable" };
        }
      }
      if (reservationBaseline === undefined || reservationBaseline === snapshot.commit)
        return { kind: "unverified", reason: "reservation history lacks a preceding task baseline" };
      if ((await git.isAncestor(root, reservationBaseline, snapshot.commit)).status !== 0)
        return { kind: "unverified", reason: "reservation does not descend from its task baseline" };
      const changed = await git.changedPaths(root, snapshot.commit);
      if (changed.status !== 0)
        return { kind: "unverified", reason: "scope expansion changed paths are unavailable" };
      const changes = changed.stdout.split("\0").filter(Boolean);
      const maximumAttempt = Math.max(0, ...priorAttempts.map((attempt) => attempt.number));
      for (const entry of added) {
        if (entry.attempt < maximumAttempt || entry.attempt > maximumAttempt + 1 || priorAttempts.some((attempt) => attempt.number === entry.attempt && attempt.outcome !== undefined))
          return { kind: "unverified", reason: "reservation was retroactively inserted into a completed or nonexistent attempt" };
        if (entry.paths.some((path) => changes.includes(path)))
          return { kind: "unverified", reason: "reservation commit also changes a reserved production path" };
        const earlier = await git.pathChanges(root, reservationBaseline, snapshot.commit, entry.paths);
        if (earlier.status !== 0)
          return { kind: "unverified", reason: "scope expansion production chronology is unavailable" };
        if (earlier.stdout.trim() !== "")
          return { kind: "unverified", reason: "reserved path changed before its reservation" };
      }
      reservationCommits.push(snapshot.commit);
    }
    previous = validated.entries;
    priorAttempts = attempts;
  }
  return { kind: "valid", entries: previous, reservationCommits };
};
