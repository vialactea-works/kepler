import type { ArtifactBinding, GraphReference } from "./events.js";
import type { TaskGraph } from "./task-graph.js";

export interface FunctionalDesignMaterial {
  readonly artifactBindings: readonly { readonly artifact_id: string; readonly content_version: string }[];
  readonly artifactPaths: readonly string[];
  readonly unitDirectory: string;
}

export interface FunctionalDesignMaterialRequest {
  readonly repositoryRoot: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly persistedUnitDirectory: unknown;
}

export interface StageArtifactMaterial {
  readonly artifactBindings: readonly ArtifactBinding[];
  readonly artifactPaths: readonly string[];
  readonly unitDirectory: string;
}

export interface StageArtifactMaterialRequest {
  readonly repositoryRoot: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly persistedUnitDirectory: unknown;
  readonly primaryArtifact: string;
  readonly supportFolder: string;
}

export interface PlanningMaterialRequest extends StageArtifactMaterialRequest {
  readonly primaryArtifact: "plan.md";
  readonly supportFolder: "implementation-planning";
  readonly recordHomeRepositoryIds: readonly string[];
  readonly executionIdentities: readonly string[];
}

export interface PlanningMaterial extends StageArtifactMaterial {
  readonly graphRef: GraphReference;
  readonly taskIds: readonly string[];
  readonly graph: TaskGraph;
}

export type ConstructionMaterialReadResult<T> =
  | { readonly kind: "valid"; readonly material: T }
  | { readonly kind: "invalid"; readonly diagnostics: readonly Readonly<Record<string, unknown>>[] };

export interface ConstructionMaterialReader {
  readonly readFunctionalDesignMaterial: (
    request: FunctionalDesignMaterialRequest,
  ) => Promise<ConstructionMaterialReadResult<FunctionalDesignMaterial>>;
  readonly readStageArtifactMaterial: (
    request: StageArtifactMaterialRequest,
  ) => Promise<ConstructionMaterialReadResult<StageArtifactMaterial>>;
  readonly readPlanningMaterial: (
    request: PlanningMaterialRequest,
  ) => Promise<ConstructionMaterialReadResult<PlanningMaterial>>;
}

export interface PlanningMaterialRequestScope {
  readonly repositoryRoot: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly persistedUnitDirectory: unknown;
}

export interface PlanningMaterialHistoryEvent {
  readonly id: unknown;
  readonly type: string;
  readonly data: unknown;
}

export interface PlanningMaterialHistoryRecord {
  readonly event?: PlanningMaterialHistoryEvent;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const createPlanningMaterialRequest = (
  scope: PlanningMaterialRequestScope,
  historyEvents: readonly PlanningMaterialHistoryRecord[],
): PlanningMaterialRequest => {
  const recordHomeRepositoryIds = historyEvents.flatMap((record) => {
    const event = record.event;
    if (event?.type !== "construction.mission-created" || !isRecord(event.data) || event.data.mission_id !== scope.missionId ||
        !isRecord(event.data.record_home) || !isNonEmpty(event.data.record_home.repository_id)) return [];
    return [event.data.record_home.repository_id];
  });
  const executionIdentities = [...new Set(historyEvents.flatMap((record) =>
    record.event ? [String(record.event.id)] : [],
  ))];
  return {
    ...scope,
    primaryArtifact: "plan.md",
    supportFolder: "implementation-planning",
    recordHomeRepositoryIds,
    executionIdentities,
  };
};
