import { createArtifactReader, type RecognizedArtifact } from "./artifact-reader.js";
import { validateArtifactMetadataSchema } from "./artifact-schemas.js";
import { validateArtifactBody } from "./artifact-body.js";
import {
  validateScopeExpansions,
  validateScopeExpansionHistory,
  type ScopeExpansion,
  type ScopeExpansionAttempt,
  type ScopeExpansionSnapshot,
  type ScopeExpansionHistoryGit,
  type ScopeExpansionHistoryResult,
} from "./scope-expansions.js";

const attempts = (artifact: RecognizedArtifact): readonly ScopeExpansionAttempt[] => {
  const records = validateArtifactBody(artifact, "task-progress", "historical").workflow.records.filter((record) => record.kind === "attempt");
  const lines = artifact.body.split(/\r?\n/);
  return records.map((record, index) => ({
    number: record.number!,
    evidence: lines.slice(
      record.line - artifact.locations.body.startLine,
      records[index + 1] === undefined ? undefined : records[index + 1]!.line - artifact.locations.body.startLine,
    ).join("\n").trimEnd(),
    ...(record.fields.Outcome === undefined ? {} : { outcome: record.fields.Outcome }),
  }));
};

export const inspectScopeExpansionHistory = async (
  git: ScopeExpansionHistoryGit,
  root: string,
  sourcePath: string,
  task: number,
  change: string,
  head: string,
  currentEntries?: readonly ScopeExpansion[],
  originalBase?: string,
): Promise<ScopeExpansionHistoryResult> => {
  const history = await git.pathHistory(root, sourcePath);
  if (history.status !== 0) return { kind: "unverified", reason: "scope expansion history is unavailable" };
  const commits = history.stdout.split(/\r?\n/).filter(Boolean).reverse();
  const versions: { readonly commit: string; readonly artifact: RecognizedArtifact }[] = [];
  const problems: string[] = [];
  let reserved = (currentEntries?.length ?? 0) > 0;
  for (const commit of commits) {
    const blob = await git.blobAt(root, commit, sourcePath);
    if (blob.status !== 0) {
      problems.push("task progress was erased or its history is unavailable");
      continue;
    }
    const artifact = await createArtifactReader({ readFile: () => blob.stdout })(sourcePath);
    if (artifact._tag !== "recognized") {
      problems.push("scope expansion history has malformed artifacts");
      continue;
    }
    if (Object.hasOwn(artifact.metadata, "scope_expansions")) {
      const entries = artifact.metadata.scope_expansions;
      if (!Array.isArray(entries) || entries.length > 0) reserved = true;
    }
    versions.push({ commit, artifact });
  }
  if (!reserved) return { kind: "valid", entries: [], reservationCommits: [] };
  if (problems.length > 0) return { kind: "unverified", reason: problems[0]! };
  const snapshots: ScopeExpansionSnapshot[] = [];
  for (const { commit, artifact } of versions) {
    if (!/^[0-9a-f]{40}$/.test(commit) || (await git.isAncestor(root, commit, head)).status !== 0)
      return { kind: "unverified", reason: "scope expansion history contains unreachable or unresolved commits" };
    if (artifact.metadata.artifact !== "task-progress" || artifact.metadata.task !== task || artifact.metadata.change !== change)
      return { kind: "unverified", reason: "scope expansion history has a malformed task identity" };
    if (validateArtifactMetadataSchema(artifact, "task-progress").length > 0)
      return { kind: "unverified", reason: "scope expansion historical metadata is malformed" };
    if (validateArtifactBody(artifact, "task-progress", "historical").diagnostics.length > 0)
      return { kind: "unverified", reason: "scope expansion history contains malformed task attempts" };
    const parsed = validateScopeExpansions(Object.hasOwn(artifact.metadata, "scope_expansions") ? artifact.metadata.scope_expansions : []);
    if (parsed.kind !== "valid") return { kind: "unverified", reason: parsed.reason };
    snapshots.push({ commit, entries: parsed.entries, attempts: attempts(artifact) });
  }
  const latest = snapshots.at(-1)?.entries ?? [];
  if (currentEntries !== undefined && JSON.stringify(currentEntries) !== JSON.stringify(latest))
    return { kind: "unverified", reason: "scope expansion reservations are not committed exactly at HEAD" };
  return validateScopeExpansionHistory(git, root, snapshots, originalBase);
};
