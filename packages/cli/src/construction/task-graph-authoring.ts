import {
  validateTaskGraph,
  type TaskGraph,
  type TaskGraphDiagnostic,
  type TaskGraphTask,
  type TaskGraphValidationContext,
} from "./task-graph.js";

export type TaskGraphTaskDefinition = Omit<TaskGraphTask, "id">;

export type TaskGraphTaskDraft =
  | {
      readonly kind: "existing";
      readonly taskId: string;
      readonly definition: TaskGraphTaskDefinition;
    }
  | {
      readonly kind: "new";
      readonly definition: TaskGraphTaskDefinition;
    };

export interface TaskGraphAuthoringRequest {
  readonly unitId: string;
  readonly planUnitId: string;
  readonly planArtifactId: string;
  readonly executionIdentities: readonly string[];
  readonly previousGraph?: TaskGraph;
  readonly retiredTaskIds: readonly string[];
  readonly tasks: readonly TaskGraphTaskDraft[];
}

export type TaskGraphIdFactory = () => string;

export type TaskGraphAuthoringResult =
  | {
      readonly kind: "authored";
      readonly graph: TaskGraph;
      readonly retiredTaskIds: readonly string[];
    }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly TaskGraphDiagnostic[];
    };

export type TaskGraphWriteResult =
  | {
      readonly kind: "written";
      readonly graph: TaskGraph;
      readonly source: string;
      readonly retiredTaskIds: readonly string[];
    }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly TaskGraphDiagnostic[];
    };

const contextOf = (
  request: TaskGraphAuthoringRequest,
): TaskGraphValidationContext => ({
  unitDirectoryId: request.unitId,
  planUnitId: request.planUnitId,
  planArtifactId: request.planArtifactId,
  executionIdentities: request.executionIdentities,
});

const invalid = (
  code: TaskGraphDiagnostic["code"],
  pointer: string,
  message: string,
): TaskGraphDiagnostic => ({ code, pointer, message });

export const authorTaskGraph = (
  request: TaskGraphAuthoringRequest,
  createId: TaskGraphIdFactory,
): TaskGraphAuthoringResult => {
  const context = contextOf(request);
  const diagnostics: TaskGraphDiagnostic[] = [];
  const previousGraph = request.previousGraph;
  if (previousGraph !== undefined) {
    const previousValidation = validateTaskGraph(previousGraph, context);
    if (previousValidation.kind === "invalid")
      return { kind: "invalid", diagnostics: previousValidation.diagnostics };
  }

  const retiredTaskIds = new Set<string>();
  request.retiredTaskIds.forEach((taskId, index) => {
    if (retiredTaskIds.has(taskId))
      diagnostics.push(
        invalid(
          "invalid-authoring-request",
          `/retiredTaskIds/${index}`,
          "Retired task identities must be unique",
        ),
      );
    retiredTaskIds.add(taskId);
  });

  const graphId = previousGraph?.id ?? createId();
  const previousTasks = new Map(
    (previousGraph?.tasks ?? []).map((task) => [task.id, task]),
  );
  const reservedTaskIds = new Set<string>([
    ...retiredTaskIds,
    ...(previousGraph?.tasks.map((task) => task.id) ?? []),
  ]);
  const graph = previousGraph ?? {
    format: "kepler-task-dag" as const,
    version: 1 as const,
    id: graphId,
    unit_id: request.unitId,
    tasks: [],
  };

  if (retiredTaskIds.has(graphId))
    diagnostics.push(
      invalid(
        "retired-task-id-reused",
        "/id",
        "Graph identity cannot reuse a retired task identity",
      ),
    );

  const usedExistingTaskIds = new Set<string>();
  const tasks: TaskGraphTask[] = [];
  request.tasks.forEach((draft, index) => {
    if (draft.kind === "existing") {
      const previous = previousTasks.get(draft.taskId);
      if (previous === undefined) {
        diagnostics.push(
          invalid(
            retiredTaskIds.has(draft.taskId)
              ? "retired-task-id-reused"
              : "unknown-task-identity",
            `/tasks/${index}/id`,
            retiredTaskIds.has(draft.taskId)
              ? "A retired task identity cannot be reused"
              : "An existing task draft must identify a task in the previous graph",
          ),
        );
        return;
      }
      if (usedExistingTaskIds.has(draft.taskId)) {
        diagnostics.push(
          invalid(
            "duplicate-task-id",
            `/tasks/${index}/id`,
            "A surviving task identity can appear only once",
          ),
        );
        return;
      }
      if (retiredTaskIds.has(draft.taskId))
        diagnostics.push(
          invalid(
            "retired-task-id-reused",
            `/tasks/${index}/id`,
            "A task identity cannot be both active and retired",
          ),
        );
      usedExistingTaskIds.add(draft.taskId);
      tasks.push({ ...draft.definition, id: previous.id });
      return;
    }

    const id = createId();
    if (reservedTaskIds.has(id) || id === graphId || id === request.planArtifactId) {
      diagnostics.push(
        invalid(
          retiredTaskIds.has(id)
            ? "retired-task-id-reused"
            : "identity-collision",
          `/tasks/${index}/id`,
          retiredTaskIds.has(id)
            ? "A new task cannot reuse a retired task identity"
            : "Generated task identity collides with an existing artifact or task identity",
        ),
      );
      return;
    }
    reservedTaskIds.add(id);
    tasks.push({ ...draft.definition, id });
  });

  if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
  const candidate: TaskGraph = { ...graph, unit_id: request.unitId, tasks };
  const validation = validateTaskGraph(candidate, context);
  if (validation.kind === "invalid") return validation;

  const newlyRetired = (previousGraph?.tasks ?? []).flatMap((task) =>
    usedExistingTaskIds.has(task.id) ? [] : [task.id],
  );
  return {
    kind: "authored",
    graph: validation.graph,
    retiredTaskIds: [...new Set([...request.retiredTaskIds, ...newlyRetired])],
  };
};

export const writeTaskGraph = (
  request: TaskGraphAuthoringRequest,
  createId: TaskGraphIdFactory,
): TaskGraphWriteResult => {
  const authored = authorTaskGraph(request, createId);
  if (authored.kind === "invalid") return authored;
  return {
    kind: "written",
    graph: authored.graph,
    source: `${JSON.stringify(authored.graph, null, 2)}\n`,
    retiredTaskIds: authored.retiredTaskIds,
  };
};
