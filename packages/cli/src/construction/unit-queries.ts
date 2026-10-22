import * as Path from "node:path";
import { collectHistory, type HistoryCollection, type HistoryJournalSource } from "../history/collection.js";
import { projectConstruction, type ConstructionProjection, type ConstructionUnitProjection } from "./projection.js";
import { CONSTRUCTION_STAGES, type ConstructionStage } from "./events.js";
import type { ProjectResolver, ProjectSelectionResult } from "../cli/project-selection.js";

export interface UnitQueryDirectoryEntry {
  readonly name: string;
  readonly kind: "directory" | "file" | "other";
}

export interface UnitQueryFileSystem {
  readonly entries: (path: string, root: string) => Promise<readonly UnitQueryDirectoryEntry[]>;
  readonly directories: (path: string, root: string) => Promise<readonly string[]>;
  readonly journals: (path: string, root: string) => Promise<readonly string[]>;
  readonly read: (path: string, root: string) => Promise<Uint8Array>;
}

export interface UnitQueryFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export interface UnitQueryProgress {
  readonly completed_stages: number | null;
  readonly total_stages: number;
  readonly completed_tasks: number | null;
  readonly known_tasks: number | null;
  readonly reliable: boolean;
}

export interface UnitQueryUnit {
  readonly unit_id: string;
  readonly directory: {
    readonly status: "present" | "missing" | "conflicting";
    readonly paths: readonly { readonly path: string; readonly kind: UnitQueryDirectoryEntry["kind"] }[];
  };
  readonly membership: {
    readonly status: "bound" | "missing" | "conflicting";
    readonly mission_id?: string;
    readonly candidates: readonly string[];
  };
  readonly workflow: {
    readonly status: "standard" | "mismatched" | "unknown";
    readonly value?: string;
  };
  readonly progress: UnitQueryProgress;
  readonly blocked: boolean | null;
  readonly effort?: {
    readonly default: { readonly level: string; readonly selected_by: string };
    readonly stage_overrides: Readonly<Partial<Record<ConstructionStage, { readonly level: string; readonly selected_by: string }>>>;
    readonly effective_by_stage: Readonly<Record<ConstructionStage, string>>;
  };
  readonly stages: readonly { readonly stage: ConstructionStage; readonly state: string; readonly effort: string | null }[];
  readonly tasks: readonly { readonly task_id: string; readonly state: string }[];
  readonly blockers: readonly { readonly scope: "unit" | "stage" | "task"; readonly id: string; readonly state: string }[];
  readonly unknowns: readonly string[];
}

export type UnitQuerySummary = Pick<
  UnitQueryUnit,
  "unit_id" | "directory" | "membership" | "workflow" | "progress" | "blocked" | "blockers" | "unknowns"
>;

export type UnitListResult =
  | { readonly kind: "listed"; readonly recordHome: string; readonly units: readonly UnitQuerySummary[] }
  | UnitQueryFailure;

export type UnitShowResult =
  | { readonly kind: "shown"; readonly recordHome: string; readonly unit: UnitQueryUnit }
  | UnitQueryFailure;

export type UnitQueryContextResult =
  | {
    readonly kind: "context";
    readonly recordHome: string;
    readonly missionId: string;
    readonly history: HistoryCollection;
    readonly projection: ConstructionProjection;
    readonly unit?: ConstructionUnitProjection;
  }
  | UnitQueryFailure;

interface RawCreationFact {
  readonly unitId: string;
  readonly sourceMissionId: string;
  readonly claimedMissionId?: string;
  readonly workflow?: string;
  readonly valid: boolean;
}

interface UnitMissionContext {
  readonly missionId: string;
  readonly history: HistoryCollection;
  readonly projection: ConstructionProjection;
}

interface UnitInventoryEntry {
  readonly unitId: string;
  readonly paths: { readonly path: string; readonly kind: UnitQueryDirectoryEntry["kind"] }[];
  readonly creationFacts: RawCreationFact[];
  readonly projections: { readonly missionId: string; readonly unit: ConstructionUnitProjection }[];
  readonly missionContexts: UnitMissionContext[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeUnitId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const failed = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}): UnitQueryFailure => ({
  kind: "failed",
  code,
  message,
  details,
  recovery: "Preserve the record-home state and resolve the reported query scope before retrying.",
});

const issueCodes = (unit: ConstructionUnitProjection): string[] => [
  ...unit.historyIssues.map((issue) => issue.code),
  ...unit.projectionIssues.map((issue) => issue.code),
];

const unitView = (entry: UnitInventoryEntry): UnitQueryUnit => {
  const facts = entry.creationFacts;
  const recordedMembership = facts.filter((fact) => fact.claimedMissionId === fact.sourceMissionId);
  const candidateMissions = [...new Set(recordedMembership.map((fact) => fact.sourceMissionId))]
    .sort((left, right) => left.localeCompare(right));
  let membership: UnitQueryUnit["membership"];
  if (facts.length === 1 && candidateMissions.length === 1 && recordedMembership.length === 1) {
    const missionId = candidateMissions[0];
    membership = missionId ? { status: "bound", mission_id: missionId, candidates: candidateMissions } : { status: "conflicting", candidates: [] };
  } else if (facts.length === 0) membership = { status: "missing", candidates: [] };
  else membership = { status: "conflicting", candidates: candidateMissions };
  const selectedFact = facts.length === 1 ? facts[0] : undefined;
  const boundMission = membership.status === "bound"
    ? entry.missionContexts.find((context) => context.missionId === membership.mission_id)
    : undefined;
  const missionWorkflows = boundMission?.history.events.flatMap((record) => {
    const data = record.event?.data;
    return record.event?.type === "construction.mission-created" && isRecord(data) &&
      data.mission_id === membership.mission_id && typeof data.workflow === "string"
      ? [data.workflow]
      : [];
  }) ?? [];
  let workflow: UnitQueryUnit["workflow"] = { status: "unknown" };
  if (selectedFact?.workflow && selectedFact.workflow !== "standard") {
    workflow = { status: "mismatched", value: selectedFact.workflow };
  } else if (selectedFact?.workflow === "standard" && missionWorkflows.length === 1 && missionWorkflows[0] === "standard") {
    workflow = { status: "standard", value: selectedFact.workflow };
  } else if (selectedFact?.workflow === "standard" && missionWorkflows.length > 0) {
    workflow = { status: "mismatched", value: selectedFact.workflow };
  }
  const selectedProjection = membership.status === "bound"
    ? entry.projections.filter((item) => item.missionId === membership.mission_id)
    : entry.projections;
  const projected = selectedProjection.length === 1 ? selectedProjection[0]?.unit : undefined;
  const stages = CONSTRUCTION_STAGES.map((stage) => ({
    stage,
    state: projected?.stages.find((item) => item.stage === stage)?.state ?? "unknown",
    effort: projected?.effort?.effectiveByStage[stage] ?? null,
  }));
  const tasks = projected?.tasks.map((task) => ({ task_id: task.taskId, state: task.state })) ?? [];
  const blockers: { readonly scope: "unit" | "stage" | "task"; readonly id: string; readonly state: string }[] = [
    ...stages.flatMap((stage) => stage.state === "waiting" || stage.state === "pausing" || stage.state === "paused"
      ? [{ scope: "stage" as const, id: stage.stage, state: stage.state }]
      : []),
    ...tasks.flatMap((task) => task.state === "blocked"
      ? [{ scope: "task" as const, id: task.task_id, state: task.state }]
      : []),
  ];
  if (projected?.blocked && blockers.length === 0) blockers.push({ scope: "unit", id: entry.unitId, state: "blocked" });
  const unknowns = new Set<string>();
  if (membership.status !== "bound") unknowns.add(`membership-${membership.status}`);
  if (workflow.status === "unknown") unknowns.add("workflow-binding-unknown");
  if (workflow.status === "mismatched") unknowns.add("workflow-binding-mismatched");
  if (selectedFact && !selectedFact.valid) unknowns.add("unit-creation-fact-invalid");
  if (entry.paths.length === 0) unknowns.add("unit-directory-missing");
  if (entry.paths.length > 1 || entry.paths.some((path) => path.kind !== "directory")) unknowns.add("unit-directory-conflict");
  if (!projected) unknowns.add("construction-projection-unavailable");
  if (projected) {
    if (!projected.initialized) unknowns.add("unit-creation-missing");
    for (const code of issueCodes(projected)) unknowns.add(code);
    if (!projected.progress.reliable) unknowns.add("progress-unreliable");
    if (projected.stages.some((stage) => stage.state === "unknown")) unknowns.add("stage-state-unknown");
    if (projected.tasks.some((task) => task.state === "unknown")) unknowns.add("task-state-unknown");
    if (!projected.effort) unknowns.add("effort-unknown");
  }
  const progress: UnitQueryProgress = {
    completed_stages: projected?.progress.reliable ? projected.progress.completedStages : null,
    total_stages: projected?.progress.totalStages ?? CONSTRUCTION_STAGES.length,
    completed_tasks: projected?.progress.reliable ? projected.progress.completedTasks : null,
    known_tasks: projected?.progress.reliable ? projected.progress.knownTasks : null,
    reliable: projected?.progress.reliable ?? false,
  };
  let directoryStatus: UnitQueryUnit["directory"]["status"] = "conflicting";
  if (entry.paths.length === 0) directoryStatus = "missing";
  else if (entry.paths.length === 1 && entry.paths[0]?.kind === "directory") directoryStatus = "present";
  const result: UnitQueryUnit = {
    unit_id: entry.unitId,
    directory: {
      status: directoryStatus,
      paths: [...entry.paths].sort((left, right) => left.path.localeCompare(right.path)),
    },
    membership,
    workflow,
    progress,
    blocked: projected?.blocked ?? null,
    stages,
    tasks,
    blockers,
    unknowns: [...unknowns].sort((left, right) => left.localeCompare(right)),
  };
  if (!projected?.effort) return result;
  return {
    ...result,
    effort: {
      default: { level: projected.effort.default.level, selected_by: projected.effort.default.selectedBy },
      stage_overrides: Object.fromEntries(Object.entries(projected.effort.stageOverrides).map(([stage, value]) => [stage, {
        level: value.level,
        selected_by: value.selectedBy,
      }])),
      effective_by_stage: projected.effort.effectiveByStage,
    },
  };
};

export class UnitQueries {
  constructor(
    private readonly projects: Pick<ProjectResolver, "resolve">,
    private readonly fileSystem: UnitQueryFileSystem,
  ) {}

  async list(project?: string): Promise<UnitListResult> {
    const selected = await this.resolveProject(project);
    if (!("root" in selected)) return selected;
    const inventory = await this.readInventory(selected.root);
    if (inventory.kind === "failed") return inventory;
    return {
      kind: "listed",
      recordHome: selected.root,
      units: inventory.units.map(unitView).map((unit) => ({
        unit_id: unit.unit_id,
        directory: unit.directory,
        membership: unit.membership,
        workflow: unit.workflow,
        progress: unit.progress,
        blocked: unit.blocked,
        blockers: unit.blockers,
        unknowns: unit.unknowns,
      })),
    };
  }

  async readContext(unitId: string, project?: string): Promise<UnitQueryContextResult> {
    if (typeof unitId !== "string" || !safeUnitId.test(unitId) || unitId.trim() !== unitId) {
      return failed("invalid_unit_selector", "A Construction query requires one exact path-safe Unit of Work ID.", { unit_id: unitId });
    }
    const selected = await this.resolveProject(project);
    if (!("root" in selected)) return selected;
    const inventory = await this.readInventory(selected.root);
    if (inventory.kind === "failed") return inventory;
    const entry = inventory.units.find((unit) => unit.unitId === unitId);
    if (!entry) return failed("unit_not_found", "The selected unit ID is not known in this record home.", { unit_id: unitId, record_home: selected.root });
    const view = unitView(entry);
    if (view.membership.status !== "bound") {
      return failed(view.membership.status === "missing" ? "unit_membership_missing" : "unit_membership_conflict",
        "Construction scope requires one unambiguous recorded mission membership.",
        { unit_id: unitId, membership: view.membership });
    }
    if (entry.missionContexts.some((context) => context.missionId !== view.membership.mission_id)) {
      return failed("unit_history_membership_conflict", "The unit has history in more than its uniquely bound mission.", {
        unit_id: unitId,
        mission_id: view.membership.mission_id,
        history_missions: entry.missionContexts.map((context) => context.missionId).sort((left, right) => left.localeCompare(right)),
      });
    }
    const context = entry.missionContexts.find((candidate) => candidate.missionId === view.membership.mission_id);
    if (!context) return failed("unit_history_missing", "The unit membership has no readable mission history context.", { unit_id: unitId, mission_id: view.membership.mission_id });
    return {
      kind: "context",
      recordHome: selected.root,
      missionId: context.missionId,
      history: context.history,
      projection: context.projection,
      unit: context.projection.units.find((candidate) => candidate.unitId === unitId),
    };
  }

  async show(unitId: string, project?: string): Promise<UnitShowResult> {
    if (typeof unitId !== "string" || unitId.length === 0 || unitId.trim() !== unitId) {
      return failed("invalid_unit_selector", "Unit show requires one exact non-empty unit ID.", { unit_id: unitId });
    }
    const selected = await this.resolveProject(project);
    if (!("root" in selected)) return selected;
    const inventory = await this.readInventory(selected.root);
    if (inventory.kind === "failed") return inventory;
    const match = inventory.units.find((unit) => unit.unitId === unitId);
    if (!match) {
      return failed("unit_not_found", "The selected unit ID is not known in this record home.", {
        unit_id: unitId,
        record_home: selected.root,
      });
    }
    return { kind: "shown", recordHome: selected.root, unit: unitView(match) };
  }

  private async resolveProject(project?: string): Promise<ProjectSelectionResult | UnitQueryFailure> {
    try {
      return await this.projects.resolve(project);
    } catch (error) {
      return failed("project_resolution_failed", "Kepler could not resolve the selected unit-query record home.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async readInventory(recordHome: string): Promise<{ readonly kind: "loaded"; readonly units: readonly UnitInventoryEntry[] } | UnitQueryFailure> {
    try {
      const missionRoot = Path.join(recordHome, ".kepler", "missions");
      const missionEntries = await this.fileSystem.entries(missionRoot, recordHome);
      const entries = new Map<string, UnitInventoryEntry>();
      const ensure = (unitId: string): UnitInventoryEntry => {
        const existing = entries.get(unitId);
        if (existing) return existing;
        const created = { unitId, paths: [], creationFacts: [], projections: [], missionContexts: [] };
        entries.set(unitId, created);
        return created;
      };
      const legacyRoot = Path.join(recordHome, ".kepler", "units-of-work");
      for (const entry of await this.fileSystem.entries(legacyRoot, recordHome)) {
        ensure(entry.name).paths.push({ path: `.kepler/units-of-work/${entry.name}`, kind: entry.kind });
      }
      for (const missionEntry of missionEntries.filter((entry: UnitQueryDirectoryEntry) => entry.kind === "directory")) {
        const missionId = missionEntry.name;
        const missionBase = Path.join(missionRoot, missionId);
        const unitsRoot = Path.join(missionBase, "construction", "units-of-work");
        for (const entry of await this.fileSystem.entries(unitsRoot, recordHome)) {
          ensure(entry.name).paths.push({
            path: `.kepler/missions/${missionId}/construction/units-of-work/${entry.name}`,
            kind: entry.kind,
          });
        }
        const historyRoot = Path.join(missionBase, "history");
        const sources: HistoryJournalSource[] = [];
        for (const phase of await this.fileSystem.directories(historyRoot, recordHome)) {
          const phaseRoot = Path.join(historyRoot, phase);
          for (const journalId of await this.fileSystem.journals(phaseRoot, recordHome)) {
            const sourceId = `${missionId}/${phase}/${journalId}`;
            sources.push({
              sourceId,
              missionId,
              phase,
              journalId,
              bytes: await this.fileSystem.read(Path.join(phaseRoot, `${journalId}.jsonl`), recordHome),
            });
          }
        }
        const history = collectHistory(missionId, sources, { completeness: "complete" });
        const projection = projectConstruction(history);
        const attachContext = (entry: UnitInventoryEntry): void => {
          if (!entry.missionContexts.some((context) => context.missionId === missionId)) {
            entry.missionContexts.push({ missionId, history, projection });
          }
        };
        for (const record of history.events) {
          const rawUnitId = record.scope.unitId ?? (typeof record.event?.data.unit_id === "string" ? record.event.data.unit_id : undefined);
          if (rawUnitId) attachContext(ensure(rawUnitId));
          if (record.event?.type !== "construction.unit-created" || !isRecord(record.event.data)) continue;
          const data = record.event.data;
          if (typeof data.unit_id !== "string") continue;
          const entry = ensure(data.unit_id);
          attachContext(entry);
          entry.creationFacts.push({
            unitId: data.unit_id,
            sourceMissionId: missionId,
            ...(typeof data.mission_id === "string" ? { claimedMissionId: data.mission_id } : {}),
            ...(typeof data.workflow === "string" ? { workflow: data.workflow } : {}),
            valid: record.status === "valid" && record.constructionEvent !== undefined && data.mission_id === missionId,
          });
        }
        for (const unit of projection.units) {
          const entry = ensure(unit.unitId);
          entry.projections.push({ missionId, unit });
          attachContext(entry);
        }
      }
      return { kind: "loaded", units: [...entries.values()].sort((left, right) => left.unitId.localeCompare(right.unitId)) };
    } catch (error) {
      return failed("unit_query_read_failed", "Kepler could not read the selected record home's unit paths and history safely.", {
        record_home: recordHome,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
