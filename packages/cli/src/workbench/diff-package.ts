import { createHash } from "node:crypto";
import type { DiffPackageScope } from "../construction/diff-package-source.js";
import {
  ConstructionDiffPackageSources,
  type DiffPackageResolvedSource,
  type DiffPackageSourceFailure,
} from "../construction/diff-package-source.js";
import {
  GitDiffPackageAdapter,
  type GitDiffPackageAdapterFailure,
  type GitDiffPackageComparison,
  type GitDiffPackageFileChange,
} from "./git-diff-package.js";

export interface GitDiffPackageRequest {
  readonly scope: DiffPackageScope;
  readonly project?: string;
  readonly out?: string;
}

export type GitDiffPackageResult =
  | {
      readonly kind: "success";
      readonly data: Readonly<Record<string, unknown>>;
    }
  | DiffPackageSourceFailure
  | GitDiffPackageAdapterFailure;

export interface GitDiffPackageRenderedPackage {
  readonly content: string;
  readonly fingerprint: string;
  readonly empty: boolean;
}

const isFailure = (
  value: unknown,
): value is DiffPackageSourceFailure | GitDiffPackageAdapterFailure =>
  typeof value === "object" && value !== null && "kind" in value && value.kind === "failed";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const checkpoint = (value: DiffPackageResolvedSource["comparisons"][number]["base"]): string =>
  "noCommit" in value ? "no commit recorded" : value.commit;

const patchFence = (content: string, label: string): string => {
  const runs = content.match(/~+/g) ?? [];
  const longest = runs.reduce((current, run) => Math.max(current, run.length), 0);
  const fence = "~".repeat(Math.max(3, longest + 1));
  return `${fence}${label}\n${content}${content.endsWith("\n") || content.length === 0 ? "" : "\n"}${fence}`;
};

const fileStatistics = (files: readonly GitDiffPackageFileChange[]) => ({
  changed_paths: files.length,
  text_additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
  text_deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
  nontext_paths: files.filter((file) => file.nontext).length,
});

const attributionStatement = (role: string): Readonly<Record<string, unknown>> => {
  if (role.includes("integration")) {
    return {
      category: "recorded-integration-effect",
      certainty: "checkpoint-comparison-recorded",
      conflict_effect_attribution: "uncertain",
      explanation: "The source record binds the captured input and prepared candidate. Git records changed commits, parents, and paths, but does not separately identify conflict-resolution ownership.",
    };
  }
  if (role.includes("task-") || role.includes("generation") || role.includes("validation")) {
    return {
      category: "task-activity-checkpoint",
      certainty: "source-checkpoint-bound",
      task_ownership: "uncertain",
      explanation: "The activity attempt binds the output checkpoint. Commits and paths between its baseline and output can include peer or prerequisite changes; no path is labeled exclusively task-owned without commit-level evidence.",
    };
  }
  return {
    category: "cumulative-unit-scope",
    certainty: "source-checkpoint-bound",
    contribution_attribution: "uncertain where records do not identify a single owner",
    explanation: "The comparison preserves the entire recorded scope. Task and Integration source comparisons remain separate, and overlapping paths are listed in each comparison.",
  };
};

const overlapIndex = (comparisons: readonly GitDiffPackageComparison[]) => {
  const paths = new Map<string, { readonly repositoryId: string; readonly path: string; readonly pathBytesBase64: string; readonly comparisons: number[] }>();
  comparisons.forEach((comparison, index) => {
    for (const file of comparison.files) {
      const key = `${comparison.binding.repositoryId}\0${file.pathBytesBase64}`;
      const prior = paths.get(key);
      if (prior) prior.comparisons.push(index + 1);
      else paths.set(key, {
        repositoryId: comparison.binding.repositoryId,
        path: file.path,
        pathBytesBase64: file.pathBytesBase64,
        comparisons: [index + 1],
      });
    }
  });
  return [...paths.values()].filter((entry) => entry.comparisons.length > 1);
};

const renderComparison = (comparison: GitDiffPackageComparison, index: number): string => {
  const binding = comparison.binding;
  const stats = fileStatistics(comparison.files);
  const summary = [
    `### ${index + 1}. ${binding.role} / ${binding.repositoryId}`,
    "",
    `- Base checkpoint: ${checkpoint(binding.base)}`,
    `- Target checkpoint: ${binding.target.commit}`,
    `- Source event IDs: ${binding.sourceEventIds.join(", ") || "none"}`,
    `- Candidate accepted in the source record: ${binding.accepted === null ? "not recorded" : binding.accepted ? "yes" : "no"}`,
    `- Base is ancestor of target: ${comparison.baseIsAncestor === null ? "not applicable" : comparison.baseIsAncestor ? "yes" : "no; ancestry and ownership attribution are uncertain"}`,
    `- Statistics: ${stats.changed_paths} paths, ${stats.text_additions} text additions, ${stats.text_deletions} text deletions, ${stats.nontext_paths} nontext paths`,
    `- Attribution: ${JSON.stringify(attributionStatement(binding.role))}`,
    "",
    "#### Changed paths and statistics",
    "",
    patchFence(json(comparison.files), "json"),
    "",
    "#### Commit, parent, and path history",
    "",
    patchFence(json(comparison.commits), "json"),
    "",
    "#### Full patch (ten lines of context)",
    "",
  ];
  if (comparison.patchBytesBase64 !== undefined) {
    summary.push("Git returned patch bytes that are not valid UTF-8. The complete patch bytes are preserved below as base64.", "", patchFence(comparison.patchBytesBase64, "text"));
  } else if (comparison.patch.length === 0) {
    summary.push("This repository-qualified comparison has an empty patch.");
  } else {
    summary.push(patchFence(comparison.patch, "diff"));
  }
  return summary.join("\n");
};

export const renderGitDiffPackage = (
  source: DiffPackageResolvedSource,
  comparisons: readonly GitDiffPackageComparison[],
): GitDiffPackageRenderedPackage => {
  const allFiles = comparisons.flatMap((comparison) => comparison.files);
  const empty = allFiles.length === 0;
  const scope = source.scope;
  const body = [
    "# Kepler Git Diff Package",
    "",
    `- Inspection scope: ${scope.kind}`,
    `- Unit: ${scope.unitId}`,
    `- Source Implementation attempt: ${scope.implementationAttemptId}`,
    ...(scope.kind === "unit-review" ? [] : [`- Task: ${scope.taskId}`]),
    ...(scope.kind === "validation" ? [`- Original Generation attempt: ${scope.generationAttemptId}`] : []),
    ...(scope.kind === "integration" ? [`- Integration attempt: ${scope.integrationAttemptId}`] : []),
    `- Mission: ${source.missionId}`,
    `- Record-home repository: ${source.recordHomeRepositoryId}`,
    `- Record-home working tree: ${source.projectRoot}`,
    `- Repository-qualified comparisons: ${comparisons.length}`,
    `- Diff is empty: ${empty ? "yes" : "no"}`,
    "",
    "## Source records and material bindings",
    "",
    patchFence(json({
      scope: source.scope,
      mission_id: source.missionId,
      record_home_repository_id: source.recordHomeRepositoryId,
      workspace_repositories: source.workspaceRepositories,
      comparison_bindings: source.comparisons,
      task_definitions: source.taskDefinitions,
      upstream_versions: source.upstreamVersions,
      source_activity_attempts: source.sourceAttempts,
      activity_evidence: source.activityEvidence,
      retained_scope_applicability: source.retainedScopes,
      integration_history: source.integrationHistory,
      source_record_ids: source.sourceRecords.map((record) => String(record.id)),
      source_records: source.sourceRecords,
    }), "json"),
    "",
    "## Authority and applicability",
    "",
    "This package is derived inspection material. It does not prove named checks passed, approval, source authority, or task completion. The listed Construction records and original scope, material, Activity, and checkpoint bindings remain authoritative. A current consumer assesses historical and retained inputs under its own contract and performs any required fresh work. Package generation creates no attempt, rerun, check, approval, or lifecycle transition.",
    "",
    "## Changed paths, statistics, and patches",
    "",
    ...(comparisons.length === 0 ? ["No repository checkpoint comparisons were recorded; the package contains an empty diff.", ""] : []),
    ...comparisons.map(renderComparison),
    "",
    "## Overlapping paths",
    "",
    ...(overlapIndex(comparisons).length === 0
      ? ["No path occurs in more than one repository-qualified comparison."]
      : [patchFence(json(overlapIndex(comparisons)), "json")]),
    "",
    "## Attribution limits",
    "",
    "Task-output checkpoint attribution is distinct from Integration candidate effects. The manifest retains each source event, commit parent list, and path set. If history cannot establish exclusive ownership, this package marks attribution uncertain and does not label those paths task-owned, peer-approved, or validated.",
    "",
  ].join("\n");
  const fingerprint = createHash("sha256").update(body, "utf8").digest("hex");
  const content = `${body}## Complete package-content fingerprint\n\nsha256:${fingerprint}\n\nFingerprint input: every preceding UTF-8 package byte, including source records, comparison manifests, path statistics, commit history, and full patches.\n`;
  return { content, fingerprint: `sha256:${fingerprint}`, empty };
};

export class GitDiffPackageService {
  constructor(
    private readonly sources: ConstructionDiffPackageSources,
    private readonly git: GitDiffPackageAdapter,
  ) {}

  async execute(request: GitDiffPackageRequest): Promise<GitDiffPackageResult> {
    const resolved = await this.sources.resolve(request.scope, request.project);
    if (resolved.kind === "failed") return resolved;
    const roots = await this.git.resolveRepositoryRoots(resolved.source);
    if (roots.kind === "failed") return roots;
    const comparisons = await this.git.compare(resolved.source, roots.roots);
    if (isFailure(comparisons)) return comparisons;
    const rendered = renderGitDiffPackage(resolved.source, comparisons);
    const written = await this.git.write(resolved.source, rendered.content, request.out);
    if (written.kind === "failed") return written;
    return {
      kind: "success",
      data: {
        scope: request.scope.kind,
        unit_id: request.scope.unitId,
        ...(request.scope.kind === "unit-review" ? {} : { task_id: request.scope.taskId }),
        implementation_attempt_id: request.scope.implementationAttemptId,
        ...(request.scope.kind === "validation" ? { generation_attempt_id: request.scope.generationAttemptId } : {}),
        ...(request.scope.kind === "integration" ? { integration_attempt_id: request.scope.integrationAttemptId } : {}),
        mission_id: resolved.source.missionId,
        source_bindings: resolved.source.comparisons,
        source_event_ids: resolved.source.sourceRecords.map((record) => String(record.id)),
        output: written.path,
        fingerprint: rendered.fingerprint,
        empty: rendered.empty,
      },
    };
  }
}
