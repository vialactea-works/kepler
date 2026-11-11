import * as Path from "node:path";
import type { RepositoryCheckpoint } from "./events.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";

export interface StageCheckpointRepositoryRoot {
  readonly repository_id: string;
  readonly repositoryRoot: string;
}

export type StageCheckpointSetResult =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly repositoryIds: readonly string[]; readonly invalidCommits: readonly string[] };

export interface StageCheckpointMaterial {
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly checkpoint: unknown;
  readonly artifactPaths: readonly string[];
}

export type StageCheckpointMaterialResult =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly artifactPaths: readonly string[] };

export const recordHomeRepositoryId = (
  events: readonly { readonly event?: { readonly type: string; readonly data: unknown } }[],
): string | undefined => {
  const matches = events.filter((record) => record.event?.type === "construction.mission-created").flatMap((record) => {
    const data = record.event?.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const recordHome = (data as Record<string, unknown>).record_home;
    if (typeof recordHome !== "object" || recordHome === null || Array.isArray(recordHome)) return [];
    const repositoryId = (recordHome as Record<string, unknown>).repository_id;
    return typeof repositoryId === "string" && repositoryId.trim().length > 0 ? [repositoryId] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
};

export const verifyStageCheckpointSet = async (
  runtime: Pick<MissionWorkspaceRuntime, "git">,
  repositoryRoots: readonly StageCheckpointRepositoryRoot[],
  value: unknown,
): Promise<StageCheckpointSetResult> => {
  if (!Array.isArray(value) || value.length !== repositoryRoots.length ||
      !value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).repository_id === "string" &&
        typeof (item as Record<string, unknown>).commit === "string")) {
    return { kind: "invalid", repositoryIds: [], invalidCommits: [] };
  }
  const checkpoints = value as readonly RepositoryCheckpoint[];
  const roots = new Map(repositoryRoots.map((root) => [root.repository_id, root.repositoryRoot]));
  const repositoryIds = checkpoints.map((checkpoint) => checkpoint.repository_id);
  if (new Set(repositoryIds).size !== repositoryIds.length ||
      repositoryIds.length !== roots.size || repositoryIds.some((id) => !roots.has(id))) {
    return { kind: "invalid", repositoryIds, invalidCommits: [] };
  }
  const invalidCommits: string[] = [];
  for (const checkpoint of checkpoints) {
    const repositoryRoot = roots.get(checkpoint.repository_id);
    if (!repositoryRoot || !/^[a-f0-9]{40,64}$/.test(checkpoint.commit)) {
      invalidCommits.push(`${checkpoint.repository_id}:${checkpoint.commit}`);
      continue;
    }
    const resolved = await runtime.git.run(repositoryRoot, ["rev-parse", "--verify", `${checkpoint.commit}^{commit}`]);
    if (resolved.status !== 0 || resolved.stdout.trim() !== checkpoint.commit) invalidCommits.push(`${checkpoint.repository_id}:${checkpoint.commit}`);
  }
  return invalidCommits.length === 0 ? { kind: "valid" } : { kind: "invalid", repositoryIds, invalidCommits };
};

export const verifyStageCheckpointMaterial = async (
  runtime: Pick<MissionWorkspaceRuntime, "git">,
  material: StageCheckpointMaterial,
): Promise<StageCheckpointMaterialResult> => {
  if (typeof material.checkpoint !== "object" || material.checkpoint === null || Array.isArray(material.checkpoint)) {
    return { kind: "invalid", artifactPaths: material.artifactPaths };
  }
  const checkpoint = material.checkpoint as Record<string, unknown>;
  if (checkpoint.repository_id !== material.repositoryId || typeof checkpoint.commit !== "string" || !/^[a-f0-9]{40,64}$/.test(checkpoint.commit)) {
    return { kind: "invalid", artifactPaths: material.artifactPaths };
  }
  const invalidPaths: string[] = [];
  for (const artifactPath of material.artifactPaths) {
    if (Path.isAbsolute(artifactPath)) {
      invalidPaths.push(artifactPath);
      continue;
    }
    const absolutePath = Path.resolve(material.repositoryRoot, artifactPath);
    const relativePath = Path.relative(material.repositoryRoot, absolutePath);
    if (relativePath === ".." || relativePath.startsWith(`..${Path.sep}`) || Path.isAbsolute(relativePath)) {
      invalidPaths.push(artifactPath);
      continue;
    }
    const gitPath = relativePath.split(Path.sep).join("/");
    const committed = await runtime.git.run(material.repositoryRoot, ["rev-parse", "--verify", `${checkpoint.commit}:${gitPath}`]);
    const working = await runtime.git.run(material.repositoryRoot, ["hash-object", `--path=${gitPath}`, "--", absolutePath]);
    if (committed.status !== 0 || working.status !== 0 || committed.stdout.trim() !== working.stdout.trim()) invalidPaths.push(artifactPath);
  }
  return invalidPaths.length === 0 ? { kind: "valid" } : { kind: "invalid", artifactPaths: invalidPaths };
};
