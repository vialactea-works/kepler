import { Ajv } from "ajv";
import type { AnySchemaObject, ErrorObject } from "ajv";
import { parseStrictJson } from "../json/strict-json.js";

export interface TaskGraphInput {
  readonly reference: string;
  readonly purpose: string;
}

export interface TaskGraphVerification {
  readonly scope: string;
  readonly method: string;
  readonly expected_result: string;
}

export interface TaskGraphDependency {
  readonly task_id: string;
  readonly reason: string;
}

export interface TaskGraphPrerequisite {
  readonly description: string;
  readonly needed_for: "implementation" | "verification";
  readonly needed_when: string;
  readonly blocking: boolean;
  readonly condition: string;
  readonly reason: string;
}

export interface TaskGraphTask {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly inputs: readonly TaskGraphInput[];
  readonly outputs: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly guidance: readonly string[];
  readonly verification: readonly TaskGraphVerification[];
  readonly depends_on: readonly TaskGraphDependency[];
  readonly prerequisites: readonly TaskGraphPrerequisite[];
}

export interface TaskGraph {
  readonly format: "kepler-task-dag";
  readonly version: 1;
  readonly id: string;
  readonly unit_id: string;
  readonly tasks: readonly TaskGraphTask[];
}

export interface TaskGraphDiagnostic {
  readonly code:
    | "duplicate-json-key"
    | "invalid-json"
    | "invalid-schema"
    | "invalid-plan-identity"
    | "identity-collision"
    | "duplicate-task-id"
    | "unit-ownership"
    | "missing-predecessor"
    | "self-dependency"
    | "duplicate-dependency"
    | "dependency-cycle"
    | "invalid-authoring-request"
    | "retired-task-id-reused"
    | "unknown-task-identity"
    | "repository-path-invalid"
    | "repository-path-unknown"
    | "repository-path-outside"
    | "repository-path-missing";
  readonly pointer: string;
  readonly message: string;
}

export type TaskGraphParseResult =
  | { readonly kind: "parsed"; readonly graph: TaskGraph }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly TaskGraphDiagnostic[];
    };

const nonEmptyText: AnySchemaObject = {
  type: "string",
  minLength: 1,
  pattern: "\\S",
};

const uuidV4Pattern =
  "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const uuidV4: AnySchemaObject = {
  type: "string",
  pattern: uuidV4Pattern,
};

const closedObject = (
  properties: Record<string, AnySchemaObject>,
): AnySchemaObject => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const taskGraphSchema: AnySchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["format", "version", "id", "unit_id", "tasks"],
  properties: {
    format: { const: "kepler-task-dag" },
    version: { type: "integer", const: 1 },
    id: uuidV4,
    unit_id: nonEmptyText,
    tasks: {
      type: "array",
      minItems: 1,
      items: closedObject({
        id: uuidV4,
        title: nonEmptyText,
        goal: nonEmptyText,
        inputs: {
          type: "array",
          items: closedObject({
            reference: nonEmptyText,
            purpose: nonEmptyText,
          }),
        },
        outputs: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: nonEmptyText,
        },
        acceptance_criteria: {
          type: "array",
          minItems: 1,
          items: nonEmptyText,
        },
        guidance: {
          type: "array",
          items: nonEmptyText,
        },
        verification: {
          type: "array",
          minItems: 1,
          items: closedObject({
            scope: nonEmptyText,
            method: nonEmptyText,
            expected_result: nonEmptyText,
          }),
        },
        depends_on: {
          type: "array",
          items: closedObject({
            task_id: uuidV4,
            reason: nonEmptyText,
          }),
        },
        prerequisites: {
          type: "array",
          items: closedObject({
            description: nonEmptyText,
            needed_for: { enum: ["implementation", "verification"] },
            needed_when: nonEmptyText,
            blocking: { type: "boolean" },
            condition: nonEmptyText,
            reason: nonEmptyText,
          }),
        },
      }),
    },
  },
};

const ajv = new Ajv({
  allErrors: false,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
const validate = ajv.compile<TaskGraph>(taskGraphSchema);

const pointerSegment = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

const schemaDiagnostic = (error: ErrorObject): TaskGraphDiagnostic => {
  let pointer = error.instancePath;
  if (error.keyword === "required")
    pointer += `/${pointerSegment(String(error.params.missingProperty))}`;
  if (error.keyword === "additionalProperties")
    pointer += `/${pointerSegment(String(error.params.additionalProperty))}`;
  return {
    code: "invalid-schema",
    pointer,
    message: error.message ?? "Value does not match the task graph schema",
  };
};

export const validateTaskGraphSchema = (
  value: unknown,
): TaskGraphParseResult => {
  if (validate(value)) return { kind: "parsed", graph: value };
  return {
    kind: "invalid",
    diagnostics: (validate.errors ?? []).map(schemaDiagnostic),
  };
};

export const parseTaskGraph = (source: string): TaskGraphParseResult => {
  const parsed = parseStrictJson(source);
  if (parsed.kind === "invalid")
    return {
      kind: "invalid",
      diagnostics: [
        {
          code: parsed.code,
          pointer: parsed.pointer,
          message: parsed.message,
        },
      ],
    };
  return validateTaskGraphSchema(parsed.value);
};

export interface TaskGraphValidationContext {
  readonly unitDirectoryId: string;
  readonly planUnitId: string;
  readonly planArtifactId: string;
  readonly executionIdentities: readonly string[];
}

export type TaskGraphValidationResult =
  | { readonly kind: "valid"; readonly graph: TaskGraph }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly TaskGraphDiagnostic[];
    };

const uuidV4Expression = new RegExp(uuidV4Pattern);
const isUuidV4 = (value: string): boolean => uuidV4Expression.test(value);

const cycleDiagnostic = (
  graph: TaskGraph,
  taskIndexById: ReadonlyMap<string, number>,
): TaskGraphDiagnostic | undefined => {
  const states = new Map<number, "active" | "complete">();
  for (let rootIndex = 0; rootIndex < graph.tasks.length; rootIndex += 1) {
    if (states.has(rootIndex)) continue;
    const frames = [{ taskIndex: rootIndex, dependencyIndex: 0 }];
    states.set(rootIndex, "active");
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === undefined) break;
      const task = graph.tasks[frame.taskIndex];
      if (task === undefined)
        return {
          code: "invalid-schema",
          pointer: `/tasks/${frame.taskIndex}`,
          message: "Dependency graph refers to a missing task",
        };
      if (frame.dependencyIndex >= task.depends_on.length) {
        states.set(frame.taskIndex, "complete");
        frames.pop();
        continue;
      }
      const dependencyIndex = frame.dependencyIndex;
      frame.dependencyIndex += 1;
      const dependency = task.depends_on[dependencyIndex];
      if (dependency === undefined)
        return {
          code: "invalid-schema",
          pointer: `/tasks/${frame.taskIndex}/depends_on/${dependencyIndex}`,
          message: "Dependency graph refers to a missing edge",
        };
      const predecessorId = dependency.task_id;
      const predecessorIndex = taskIndexById.get(predecessorId);
      if (predecessorIndex === undefined || predecessorId === task.id) continue;
      const predecessorState = states.get(predecessorIndex);
      if (predecessorState === "active")
        return {
          code: "dependency-cycle",
          pointer: `/tasks/${frame.taskIndex}/depends_on/${dependencyIndex}/task_id`,
          message: "Dependency participates in a cycle",
        };
      if (predecessorState === undefined) {
        states.set(predecessorIndex, "active");
        frames.push({ taskIndex: predecessorIndex, dependencyIndex: 0 });
      }
    }
  }
  return undefined;
};

export const validateTaskGraph = (
  value: unknown,
  context: TaskGraphValidationContext,
): TaskGraphValidationResult => {
  const schema = validateTaskGraphSchema(value);
  if (schema.kind === "invalid") return schema;
  const graph = schema.graph;
  const diagnostics: TaskGraphDiagnostic[] = [];

  if (!isUuidV4(context.planArtifactId))
    diagnostics.push({
      code: "invalid-plan-identity",
      pointer: "",
      message: "The plan artifact identity must be a lowercase UUIDv4",
    });
  if (graph.unit_id !== context.unitDirectoryId)
    diagnostics.push({
      code: "unit-ownership",
      pointer: "/unit_id",
      message: "Graph unit_id does not match the owning unit directory",
    });
  if (graph.unit_id !== context.planUnitId)
    diagnostics.push({
      code: "unit-ownership",
      pointer: "/unit_id",
      message: "Graph unit_id does not match plan.md unit_id",
    });

  const identities = new Map<string, "plan" | "graph" | "task" | "execution">();
  context.executionIdentities.forEach((identity) => {
    if (identities.has(identity))
      diagnostics.push({
        code: "identity-collision",
        pointer: "",
        message: "Execution identities must be distinct",
      });
    else identities.set(identity, "execution");
  });
  if (identities.has(context.planArtifactId))
    diagnostics.push({
      code: "identity-collision",
      pointer: "",
      message: "Plan artifact identity must differ from execution identities",
    });
  else identities.set(context.planArtifactId, "plan");
  const graphIdentityOwner = identities.get(graph.id);
  if (graphIdentityOwner !== undefined)
    diagnostics.push({
      code: "identity-collision",
      pointer: "/id",
      message: `Graph identity must differ from the ${graphIdentityOwner} identity`,
    });
  else identities.set(graph.id, "graph");
  const taskIndexById = new Map<string, number>();
  graph.tasks.forEach((task, taskIndex) => {
    const existing = identities.get(task.id);
    if (existing === "task")
      diagnostics.push({
        code: "duplicate-task-id",
        pointer: `/tasks/${taskIndex}/id`,
        message: "Task identity is duplicated in the graph",
      });
    else if (existing !== undefined)
      diagnostics.push({
        code: "identity-collision",
        pointer: `/tasks/${taskIndex}/id`,
        message: `Task identity must differ from the ${existing} identity`,
      });
    else identities.set(task.id, "task");
    if (!taskIndexById.has(task.id)) taskIndexById.set(task.id, taskIndex);
  });

  graph.tasks.forEach((task, taskIndex) => {
    const seenDependencies = new Set<string>();
    task.depends_on.forEach((dependency, dependencyIndex) => {
      const pointer = `/tasks/${taskIndex}/depends_on/${dependencyIndex}/task_id`;
      if (dependency.task_id === task.id)
        diagnostics.push({
          code: "self-dependency",
          pointer,
          message: "A task cannot depend on itself",
        });
      if (seenDependencies.has(dependency.task_id))
        diagnostics.push({
          code: "duplicate-dependency",
          pointer,
          message: "A predecessor can appear only once in depends_on",
        });
      seenDependencies.add(dependency.task_id);
      if (!taskIndexById.has(dependency.task_id))
        diagnostics.push({
          code: "missing-predecessor",
          pointer,
          message: "Dependency references a task that is not in this graph",
        });
    });
  });

  const cycle = cycleDiagnostic(graph, taskIndexById);
  if (cycle !== undefined) diagnostics.push(cycle);
  return diagnostics.length > 0
    ? { kind: "invalid", diagnostics }
    : { kind: "valid", graph };
};

export const readTaskGraph = (
  source: string,
  context: TaskGraphValidationContext,
): TaskGraphValidationResult => {
  const parsed = parseTaskGraph(source);
  if (parsed.kind === "invalid") return parsed;
  return validateTaskGraph(parsed.graph, context);
};
