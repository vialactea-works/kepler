import * as Path from "node:path";
import { markdownArtifactReader } from "@vialactea-works/kepler-core";
import { CONSTRUCTION_ACTIVITIES, CONSTRUCTION_STAGES, type ConstructionActivity, type ConstructionStage } from "./events.js";
import { readTaskGraph, type TaskGraph, type TaskGraphTask } from "./task-graph.js";
import type { ConstructionActivityProjection, ConstructionTaskProjection, ConstructionUnitProjection } from "./projection.js";
import type { UnitQueryContextResult, UnitQueryFailure, UnitQueryFileSystem, UnitQueries } from "./unit-queries.js";

export interface ConstructionEventReference {
  readonly event_id: string;
  readonly type: string;
  readonly caused_by: readonly string[];
}

export interface ConstructionScopedQueryFailure extends UnitQueryFailure {}

export type StageShowResult =
  | {
    readonly kind: "stage-shown";
    readonly record_home: string;
    readonly mission_id: string;
    readonly unit_id: string;
    readonly stage: ConstructionStage;
    readonly state: string;
    readonly current_attempt_id?: string;
    readonly effort: string | null;
    readonly attempts: readonly {
      readonly attempt_id: string;
      readonly state: string;
      readonly events: readonly ConstructionEventReference[];
    }[];
    readonly evidence: readonly Record<string, unknown>[];
    readonly approvals: readonly Record<string, unknown>[];
    readonly blockers: readonly string[];
    readonly unknowns: readonly string[];
  }
  | ConstructionScopedQueryFailure;

export type TaskListResult =
  | {
    readonly kind: "tasks-listed";
    readonly record_home: string;
    readonly mission_id: string;
    readonly unit_id: string;
    readonly tasks: readonly {
      readonly task_id: string;
      readonly title: string;
      readonly state: string;
      readonly dependencies: readonly string[];
      readonly blockers: readonly string[];
      readonly unknowns: readonly string[];
    }[];
  }
  | ConstructionScopedQueryFailure;

export type TaskShowResult =
  | {
    readonly kind: "task-shown";
    readonly record_home: string;
    readonly mission_id: string;
    readonly unit_id: string;
    readonly definition: TaskGraphTask;
    readonly state: string;
    readonly current_scope: { readonly implementation_attempt_id: string | null };
    readonly admissions: readonly Record<string, unknown>[];
    readonly activities: readonly Record<string, unknown>[];
    readonly evidence: readonly Record<string, unknown>[];
    readonly approvals: readonly Record<string, unknown>[];
    readonly progress: { readonly completed_activities: number; readonly total_activities: number; readonly complete: boolean };
    readonly blockers: readonly string[];
    readonly unknowns: readonly string[];
  }
  | ConstructionScopedQueryFailure;

export type TaskReadyResult =
  | {
    readonly kind: "task-readiness";
    readonly record_home: string;
    readonly mission_id: string;
    readonly unit_id: string;
    readonly task_id: string;
    readonly task_state: string;
    readonly readiness: "ready" | "blocked" | "unknown" | "already_admitted" | "complete";
    readonly dependencies: readonly {
      readonly task_id: string;
      readonly status: "integrated" | "not_integrated" | "unknown";
      readonly declared_outputs: readonly string[];
      readonly integration_events: readonly string[];
      readonly integrated_output_refs: readonly string[];
    }[];
    readonly known_prerequisite_facts: readonly Record<string, unknown>[];
    readonly unknown_prerequisites: readonly Record<string, unknown>[];
    readonly blockers: readonly string[];
    readonly unknowns: readonly string[];
  }
  | ConstructionScopedQueryFailure;

export type ActivityShowResult =
  | {
    readonly kind: "activity-shown";
    readonly record_home: string;
    readonly mission_id: string;
    readonly unit_id: string;
    readonly task_id: string;
    readonly activity: ConstructionActivity;
    readonly implementation_attempt_id: string;
    readonly state: string;
    readonly current_attempt_id: string | null;
    readonly attempts: readonly {
      readonly attempt_id: string;
      readonly implementation_attempt_id: string;
      readonly state: string;
      readonly events: readonly ConstructionEventReference[];
    }[];
    readonly evidence: readonly Record<string, unknown>[];
    readonly approvals: readonly Record<string, unknown>[];
    readonly blockers: readonly string[];
    readonly unknowns: readonly string[];
  }
  | ConstructionScopedQueryFailure;

interface LoadedGraph {
  readonly kind: "loaded";
  readonly graph: TaskGraph;
  readonly context: Extract<UnitQueryContextResult, { readonly kind: "context" }>;
}

interface ReadinessDependency {
  readonly task_id: string;
  readonly status: "integrated" | "not_integrated" | "unknown";
  readonly declared_outputs: readonly string[];
  readonly integration_events: readonly string[];
  readonly integrated_output_refs: readonly string[];
}

interface ReadinessDetails {
  readonly taskState: string;
  readonly readiness: "ready" | "blocked" | "unknown" | "already_admitted" | "complete";
  readonly dependencies: readonly ReadinessDependency[];
  readonly knownPrerequisiteFacts: readonly Record<string, unknown>[];
  readonly unknownPrerequisites: readonly Record<string, unknown>[];
  readonly blockers: readonly string[];
  readonly unknowns: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failed = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ConstructionScopedQueryFailure => ({
  kind: "failed",
  code,
  message,
  details,
  recovery: "Preserve the record-home state and resolve the reported query scope before retrying.",
});

const eventReference = (fact: { readonly event: { readonly id: string; readonly type: string; readonly caused_by: readonly string[] } }): ConstructionEventReference => ({
  event_id: fact.event.id,
  type: fact.event.type,
  caused_by: fact.event.caused_by,
});

const evidenceView = (
  records: ConstructionUnitProjection["evidence"] | ConstructionUnitProjection["approvals"],
  scope: { readonly stage: ConstructionStage; readonly stageAttemptId?: string; readonly taskId?: string; readonly activity?: ConstructionActivity; readonly activityAttemptId?: string },
): readonly Record<string, unknown>[] => records.flatMap(({ fact }) => {
  const data = fact.event.data;
  if (data.stage !== scope.stage) return [];
  if (scope.stageAttemptId !== undefined && data.stage_attempt_id !== scope.stageAttemptId) return [];
  if (scope.taskId !== undefined && data.task_id !== scope.taskId) return [];
  if (scope.activity !== undefined && data.activity !== scope.activity) return [];
  if (scope.activityAttemptId !== undefined && data.activity_attempt_id !== scope.activityAttemptId) return [];
  return [{
    event_id: fact.event.id,
    type: fact.event.type,
    ...(typeof data.evidence_id === "string" ? { evidence_id: data.evidence_id } : {}),
    ...(typeof data.stage_attempt_id === "string" ? { stage_attempt_id: data.stage_attempt_id } : {}),
    ...(typeof data.task_id === "string" ? { task_id: data.task_id } : {}),
    ...(typeof data.activity === "string" ? { activity: data.activity } : {}),
    ...(typeof data.activity_attempt_id === "string" ? { activity_attempt_id: data.activity_attempt_id } : {}),
    ...(isRecord(data.result) ? { result: data.result } : {}),
    ...(Array.isArray(data.output_refs) ? { output_refs: data.output_refs } : {}),
    ...(typeof data.decision_reference === "string" ? { decision_reference: data.decision_reference } : {}),
  }];
});

const projectionUnknowns = (unit: ConstructionUnitProjection | undefined): string[] => {
  if (!unit) return ["unit-projection-unavailable"];
  const unknowns = new Set<string>();
  if (unit.blocked) unknowns.add("unit-projection-blocked");
  for (const issue of unit.historyIssues) unknowns.add(issue.code);
  for (const issue of unit.projectionIssues) unknowns.add(issue.code);
  return [...unknowns].sort((left, right) => left.localeCompare(right));
};

const taskProjection = (unit: ConstructionUnitProjection | undefined, taskId: string): ConstructionTaskProjection | undefined =>
  unit?.tasks.find((candidate) => candidate.taskId === taskId);

const activityProjection = (
  task: ConstructionTaskProjection | undefined,
  activity: ConstructionActivity,
): ConstructionActivityProjection | undefined => task?.activities.find((candidate) => candidate.activity === activity);

const integratedFacts = (task: ConstructionTaskProjection | undefined): { readonly eventIds: readonly string[]; readonly outputRefs: readonly string[] } => {
  if (!task || task.state !== "complete" || task.completion?.event.type !== "construction.task-completed") {
    return { eventIds: [], outputRefs: [] };
  }
  const integrationId = task.completion.event.data.integration_event_id;
  if (typeof integrationId !== "string") return { eventIds: [], outputRefs: [] };
  const integration = activityProjection(task, "code-integration");
  const accepted = integration?.accepted.find((fact) => fact.event.id === integrationId && fact.event.type === "construction.integration-accepted");
  if (!integration || !accepted || accepted.event.type !== "construction.integration-accepted") return { eventIds: [], outputRefs: [] };
  const prepared = integration.prepared.find((fact) => fact.event.id === accepted.event.data.prepared_event_id && fact.event.type === "construction.integration-prepared");
  const outputRefs = prepared?.event.type === "construction.integration-prepared" && Array.isArray(prepared.event.data.task_output_refs)
    ? prepared.event.data.task_output_refs.filter((value): value is string => typeof value === "string")
    : [];
  return { eventIds: [integrationId], outputRefs };
};

export class ConstructionQueries {
  constructor(
    private readonly units: UnitQueries,
    private readonly fileSystem: UnitQueryFileSystem,
  ) {}

  async stageShow(unitId: string, stage: string, project?: string): Promise<StageShowResult> {
    if (!CONSTRUCTION_STAGES.includes(stage as ConstructionStage)) return failed("invalid_stage", "The selected Construction stage is not supported.", { stage });
    const context = await this.units.readContext(unitId, project);
    if (context.kind === "failed") return context;
    const selectedStage = context.unit?.stages.find((candidate) => candidate.stage === stage as ConstructionStage);
    const unknowns = projectionUnknowns(context.unit);
    if (!selectedStage) unknowns.push("stage-projection-unavailable");
    const attempts = selectedStage?.attempts.map((attempt) => ({
      attempt_id: attempt.attemptId,
      state: attempt.state,
      events: attempt.facts.map(eventReference),
    })) ?? [];
    const blockers = selectedStage && ["waiting", "pausing", "paused"].includes(selectedStage.state)
      ? [selectedStage.state]
      : [];
    return {
      kind: "stage-shown",
      record_home: context.recordHome,
      mission_id: context.missionId,
      unit_id: unitId,
      stage: stage as ConstructionStage,
      state: selectedStage?.state ?? "unknown",
      ...(selectedStage?.currentAttemptId ? { current_attempt_id: selectedStage.currentAttemptId } : {}),
      effort: context.unit?.effort?.effectiveByStage[stage as ConstructionStage] ?? null,
      attempts,
      evidence: context.unit ? evidenceView(context.unit.evidence, { stage: stage as ConstructionStage }) : [],
      approvals: context.unit ? evidenceView(context.unit.approvals, { stage: stage as ConstructionStage }) : [],
      blockers,
      unknowns: [...new Set(unknowns)].sort((left, right) => left.localeCompare(right)),
    };
  }

  async taskList(unitId: string, project?: string): Promise<TaskListResult> {
    const loaded = await this.loadGraph(unitId, project);
    if (loaded.kind === "failed") return loaded;
    return {
      kind: "tasks-listed",
      record_home: loaded.context.recordHome,
      mission_id: loaded.context.missionId,
      unit_id: unitId,
      tasks: loaded.graph.tasks.map((definition) => {
        const details = this.readiness(loaded.graph, loaded.context.unit, definition);
        const current = taskProjection(loaded.context.unit, definition.id);
        return {
          task_id: definition.id,
          title: definition.title,
          state: current?.state ?? details.readiness,
          dependencies: definition.depends_on.map((dependency) => dependency.task_id),
          blockers: details.blockers,
          unknowns: details.unknowns,
        };
      }),
    };
  }

  async taskShow(unitId: string, taskId: string, project?: string): Promise<TaskShowResult> {
    const loaded = await this.loadGraph(unitId, project);
    if (loaded.kind === "failed") return loaded;
    const definition = loaded.graph.tasks.find((task) => task.id === taskId);
    if (!definition) return failed("task_not_found", "The selected task ID is not present in the unit's authored task graph.", { unit_id: unitId, task_id: taskId });
    const current = taskProjection(loaded.context.unit, taskId);
    const details = this.readiness(loaded.graph, loaded.context.unit, definition);
    const activities = current?.activities.map((activity) => ({
      activity: activity.activity,
      state: activity.state,
      current_attempt_id: activity.currentAttemptId ?? null,
      attempts: activity.attempts.map((attempt) => ({
        attempt_id: attempt.attemptId,
        implementation_attempt_id: attempt.stageAttemptId,
        state: attempt.state,
        events: attempt.facts.map(eventReference),
      })),
    })) ?? [];
    const evidence = loaded.context.unit
      ? evidenceView(loaded.context.unit.evidence, { stage: "implementation", taskId })
      : [];
    const approvals = loaded.context.unit
      ? evidenceView(loaded.context.unit.approvals, { stage: "implementation", taskId })
      : [];
    return {
      kind: "task-shown",
      record_home: loaded.context.recordHome,
      mission_id: loaded.context.missionId,
      unit_id: unitId,
      definition,
      state: current?.state ?? details.readiness,
      current_scope: { implementation_attempt_id: current?.stageAttemptId ?? null },
      admissions: current?.admissions.map((fact) => ({
        ...eventReference(fact),
        implementation_attempt_id: fact.event.data.stage_attempt_id,
        graph_ref: fact.event.data.graph_ref,
        task_definition_ref: fact.event.data.task_definition_ref,
      })) ?? [],
      activities,
      evidence,
      approvals,
      progress: {
        completed_activities: activities.filter((activity) => activity.state === "completed").length,
        total_activities: CONSTRUCTION_ACTIVITIES.length,
        complete: current?.state === "complete",
      },
      blockers: details.blockers,
      unknowns: [...new Set([...details.unknowns, ...projectionUnknowns(loaded.context.unit)])].sort((left, right) => left.localeCompare(right)),
    };
  }

  async taskReady(unitId: string, taskId: string, project?: string): Promise<TaskReadyResult> {
    const loaded = await this.loadGraph(unitId, project);
    if (loaded.kind === "failed") return loaded;
    const definition = loaded.graph.tasks.find((task) => task.id === taskId);
    if (!definition) return failed("task_not_found", "The selected task ID is not present in the unit's authored task graph.", { unit_id: unitId, task_id: taskId });
    const current = taskProjection(loaded.context.unit, taskId);
    const details = this.readiness(loaded.graph, loaded.context.unit, definition);
    const knownFacts = this.knownPrerequisiteFacts(loaded.context.unit, current);
    return {
      kind: "task-readiness",
      record_home: loaded.context.recordHome,
      mission_id: loaded.context.missionId,
      unit_id: unitId,
      task_id: taskId,
      task_state: current?.state ?? details.taskState,
      readiness: details.readiness,
      dependencies: details.dependencies,
      known_prerequisite_facts: knownFacts,
      unknown_prerequisites: details.unknownPrerequisites,
      blockers: details.blockers,
      unknowns: [...new Set([...details.unknowns, ...projectionUnknowns(loaded.context.unit)])].sort((left, right) => left.localeCompare(right)),
    };
  }

  async activityShow(
    unitId: string,
    taskId: string,
    activityName: string,
    implementationAttemptId: string,
    project?: string,
  ): Promise<ActivityShowResult> {
    if (!CONSTRUCTION_ACTIVITIES.includes(activityName as ConstructionActivity)) {
      return failed("invalid_activity", "The selected Construction Activity is not supported.", { activity: activityName });
    }
    const loaded = await this.loadGraph(unitId, project);
    if (loaded.kind === "failed") return loaded;
    const context = loaded.context;
    if (!loaded.graph.tasks.some((task) => task.id === taskId)) {
      return failed("task_not_found", "The selected task ID is not present in the unit's authored task graph.", { unit_id: unitId, task_id: taskId });
    }
    const parent = context.unit?.stages.find((stage) => stage.stage === "implementation")?.attempts
      .find((attempt) => attempt.attemptId === implementationAttemptId);
    if (!parent) return failed("scope_mismatch", "The Implementation attempt does not belong to the selected unit.", {
      unit_id: unitId,
      implementation_attempt_id: implementationAttemptId,
    });
    const task = taskProjection(context.unit, taskId);
    if (!task) return failed("task_not_found", "The selected task has no Construction execution projection.", { unit_id: unitId, task_id: taskId });
    const activity = activityProjection(task, activityName as ConstructionActivity);
    if (!activity) return failed("activity_not_found", "The selected Activity occurrence is not present in the task projection.", { task_id: taskId, activity: activityName });
    const attempts = activity.attempts.filter((attempt) => attempt.stageAttemptId === implementationAttemptId);
    const activeAttempts = attempts.filter((attempt) => ["running", "waiting", "pausing", "paused"].includes(attempt.state));
    const current = activeAttempts.length === 1 ? activeAttempts[0] : undefined;
    const selectedFacts = activity.facts.filter((fact) => fact.event.data.stage_attempt_id === implementationAttemptId);
    const state = context.unit?.blocked || activeAttempts.length > 1
      ? "unknown"
      : current?.state ?? attempts[attempts.length - 1]?.state ?? (selectedFacts.some((fact) => fact.event.type === "construction.activity-reopened") ? "reopened" : "not_started");
    const unknowns = projectionUnknowns(context.unit);
    if (context.unit?.blocked) unknowns.push("activity-state-unknown");
    if (activeAttempts.length > 1) unknowns.push("multiple-active-activity-attempts-in-selected-scope");
    const scopedEvidence = context.unit
      ? evidenceView(context.unit.evidence, { stage: "implementation", stageAttemptId: implementationAttemptId, taskId, activity: activityName as ConstructionActivity })
      : [];
    const scopedApprovals = context.unit
      ? evidenceView(context.unit.approvals, { stage: "implementation", stageAttemptId: implementationAttemptId, taskId, activity: activityName as ConstructionActivity })
      : [];
    return {
      kind: "activity-shown",
      record_home: context.recordHome,
      mission_id: context.missionId,
      unit_id: unitId,
      task_id: taskId,
      activity: activityName as ConstructionActivity,
      implementation_attempt_id: implementationAttemptId,
      state,
      current_attempt_id: current?.attemptId ?? null,
      attempts: attempts.map((attempt) => ({
        attempt_id: attempt.attemptId,
        implementation_attempt_id: implementationAttemptId,
        state: attempt.state,
        events: attempt.facts.map(eventReference),
      })),
      evidence: scopedEvidence,
      approvals: scopedApprovals,
      blockers: ["waiting", "pausing", "paused"].includes(state) ? [state] : [],
      unknowns: [...new Set(unknowns)].sort((left, right) => left.localeCompare(right)),
    };
  }

  private async loadGraph(unitId: string, project?: string): Promise<LoadedGraph | ConstructionScopedQueryFailure> {
    const context = await this.units.readContext(unitId, project);
    if (context.kind === "failed") return context;
    const unitRoot = Path.join(context.recordHome, ".kepler", "missions", context.missionId, "construction", "units-of-work", unitId);
    const graphPath = Path.join(unitRoot, "tasks-dag.json");
    const planPath = Path.join(unitRoot, "plan.md");
    try {
      const graphSource = new TextDecoder().decode(await this.fileSystem.read(graphPath, context.recordHome));
      const planSource = new TextDecoder().decode(await this.fileSystem.read(planPath, context.recordHome));
      const plan = markdownArtifactReader.parse(planPath, planSource);
      if (plan.kind === "invalid") return failed("task_plan_invalid", "The unit plan metadata cannot establish the task graph context.", { diagnostics: plan.diagnostics });
      if (!isRecord(plan.artifact.metadata) || typeof plan.artifact.metadata.id !== "string" || typeof plan.artifact.metadata.unit_id !== "string") {
        return failed("task_plan_identity_invalid", "The unit plan must identify its artifact and owning unit before task queries can read the graph.", { plan_path: planPath });
      }
      const executionIdentities = [...new Set(context.history.events.flatMap((record) => record.event ? [record.event.id] : []))];
      const parsed = readTaskGraph(graphSource, {
        unitDirectoryId: unitId,
        planUnitId: plan.artifact.metadata.unit_id,
        planArtifactId: plan.artifact.metadata.id,
        executionIdentities,
      });
      if (parsed.kind === "invalid") return failed("task_graph_invalid", "The canonical unit task graph is invalid for its recorded scope.", { path: graphPath, diagnostics: parsed.diagnostics });
      return { kind: "loaded", graph: parsed.graph, context };
    } catch (error) {
      return failed("task_graph_unavailable", "Kepler could not read the canonical mission-owned task graph and plan safely.", {
        graph_path: graphPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private readiness(graph: TaskGraph, unit: ConstructionUnitProjection | undefined, definition: TaskGraphTask): ReadinessDetails {
    const projected = taskProjection(unit, definition.id);
    const blockers: string[] = [];
    const unknowns = projectionUnknowns(unit);
    const unknownPrerequisites = definition.prerequisites.map((prerequisite, index) => ({
      index,
      description: prerequisite.description,
      needed_for: prerequisite.needed_for,
      needed_when: prerequisite.needed_when,
      blocking: prerequisite.blocking,
      condition: prerequisite.condition,
      reason: prerequisite.reason,
      status: "unknown",
    }));
    const dependencies = definition.depends_on.map((dependency) => {
      const predecessor = graph.tasks.find((task) => task.id === dependency.task_id);
      const predecessorProjection = taskProjection(unit, dependency.task_id);
      const integrated = integratedFacts(predecessorProjection);
      const isIntegrated = predecessorProjection?.state === "complete" && integrated.eventIds.length > 0;
      if (!isIntegrated) blockers.push(`predecessor-not-integrated:${dependency.task_id}`);
      const status = unit?.blocked ? "unknown" as const : isIntegrated ? "integrated" as const : "not_integrated" as const;
      return {
        task_id: dependency.task_id,
        status,
        declared_outputs: predecessor?.outputs ?? [],
        integration_events: integrated.eventIds,
        integrated_output_refs: integrated.outputRefs,
      };
    });
    for (const prerequisite of definition.prerequisites) {
      if (prerequisite.blocking) blockers.push(`blocking-prerequisite-unverified:${prerequisite.description}`);
    }
    if (projected?.state === "blocked" && blockers.length === 0) blockers.push("task-runtime-state-blocked");
    let readiness: ReadinessDetails["readiness"];
    let taskState: string;
    if (!unit || unit.blocked || projected?.state === "unknown") {
      readiness = "unknown";
      taskState = "unknown";
      unknowns.push("task-readiness-unavailable");
    } else if (projected?.state === "complete") {
      readiness = "complete";
      taskState = projected.state;
    } else if (projected && projected.state !== "blocked") {
      readiness = "already_admitted";
      taskState = projected.state;
    } else if (projected?.state === "blocked") {
      readiness = "blocked";
      taskState = projected.state;
    } else {
      readiness = blockers.length > 0 ? "blocked" : "ready";
      taskState = readiness;
    }
    return {
      taskState,
      readiness,
      dependencies,
      knownPrerequisiteFacts: this.knownPrerequisiteFacts(unit, projected),
      unknownPrerequisites,
      blockers: [...new Set(blockers)].sort((left, right) => left.localeCompare(right)),
      unknowns: [...new Set(unknowns)].sort((left, right) => left.localeCompare(right)),
    };
  }

  private knownPrerequisiteFacts(
    unit: ConstructionUnitProjection | undefined,
    task: ConstructionTaskProjection | undefined,
  ): readonly Record<string, unknown>[] {
    const rawIds = task?.admission?.event.data.prerequisite_evidence;
    if (!Array.isArray(rawIds)) return [];
    const selectedIds = new Set(rawIds.filter((id): id is string => typeof id === "string"));
    if (selectedIds.size === 0) return [];
    return (unit?.evidence ?? []).flatMap(({ fact }) => {
      const data = fact.event.data;
      if (typeof data.evidence_id !== "string" || !selectedIds.has(data.evidence_id)) return [];
      return [{ evidence_id: data.evidence_id, event_id: fact.event.id, type: fact.event.type }];
    });
  }
}
