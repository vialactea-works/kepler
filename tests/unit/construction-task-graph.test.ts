import { describe, expect, it } from "vitest";
import {
  parseTaskGraph,
  readTaskGraph,
  validateTaskGraph,
  validateTaskGraphSchema,
} from "../../packages/cli/src/construction/task-graph.js";
import {
  writeTaskGraph,
  type TaskGraphAuthoringRequest,
  type TaskGraphTaskDefinition,
  type TaskGraphTaskDraft,
  type TaskGraphWriteResult,
} from "../../packages/cli/src/construction/task-graph-authoring.js";
import { validateTaskGraphPathOperands } from "../../packages/cli/src/construction/task-graph-paths.js";
import type {
  TaskGraph,
  TaskGraphParseResult,
  TaskGraphTask,
  TaskGraphValidationContext,
  TaskGraphValidationResult,
} from "../../packages/cli/src/construction/task-graph.js";
import { taskGraphExample as graphExample } from "../fixtures/task-graph.js";

const sourceOf = (graph = graphExample()): string => JSON.stringify(graph);
const objectOf = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;
const taskAt = (
  graph: Record<string, unknown>,
  index = 0,
): Record<string, unknown> =>
  (graph.tasks as Record<string, unknown>[])[index]!;
const invalidAt = (
  result: TaskGraphParseResult | TaskGraphValidationResult | TaskGraphWriteResult,
  pointer: string,
): void => {
  expect(result.kind).toBe("invalid");
  if (result.kind === "invalid")
    expect(result.diagnostics.map(({ pointer: actual }) => actual)).toContain(pointer);
};

type Mutation = (graph: Record<string, unknown>) => void;

const nestedInvalidCases: readonly {
  readonly name: string;
  readonly pointer: string;
  readonly mutate: Mutation;
}[] = [
  {
    name: "unknown task field",
    pointer: "/tasks/0/unexpected",
    mutate: (graph) => {
      taskAt(graph).unexpected = true;
    },
  },
  {
    name: "null task inputs",
    pointer: "/tasks/0/inputs",
    mutate: (graph) => {
      taskAt(graph).inputs = null;
    },
  },
  {
    name: "missing input purpose",
    pointer: "/tasks/0/inputs/0/purpose",
    mutate: (graph) => {
      delete (taskAt(graph).inputs as Record<string, unknown>[])[0]!.purpose;
    },
  },
  {
    name: "empty output list",
    pointer: "/tasks/0/outputs",
    mutate: (graph) => {
      taskAt(graph).outputs = [];
    },
  },
  {
    name: "duplicate output names",
    pointer: "/tasks/0/outputs",
    mutate: (graph) => {
      taskAt(graph).outputs = ["same", "same"];
    },
  },
  {
    name: "empty acceptance criteria",
    pointer: "/tasks/0/acceptance_criteria",
    mutate: (graph) => {
      taskAt(graph).acceptance_criteria = [];
    },
  },
  {
    name: "whitespace-only guidance",
    pointer: "/tasks/0/guidance/0",
    mutate: (graph) => {
      taskAt(graph).guidance = [" \t "];
    },
  },
  {
    name: "missing verification method",
    pointer: "/tasks/0/verification/0/method",
    mutate: (graph) => {
      delete (taskAt(graph).verification as Record<string, unknown>[])[0]!.method;
    },
  },
  {
    name: "null dependency reason",
    pointer: "/tasks/1/depends_on/0/reason",
    mutate: (graph) => {
      (taskAt(graph, 1).depends_on as Record<string, unknown>[])[0]!.reason = null;
    },
  },
  {
    name: "unsupported prerequisite needed_for value",
    pointer: "/tasks/1/prerequisites/0/needed_for",
    mutate: (graph) => {
      (taskAt(graph, 1).prerequisites as Record<string, unknown>[])[0]!.needed_for = "deployment";
    },
  },
  {
    name: "non-boolean prerequisite blocking value",
    pointer: "/tasks/1/prerequisites/0/blocking",
    mutate: (graph) => {
      (taskAt(graph, 1).prerequisites as Record<string, unknown>[])[0]!.blocking = "yes";
    },
  },
];

describe("strict task graph JSON reader and schema", () => {
  it("accepts the v1 specification example and returns its typed graph", () => {
    const graph = graphExample();

    expect(parseTaskGraph(sourceOf(graph))).toEqual({ kind: "parsed", graph });
  });

  it.each([
    ["comments", sourceOf().replace('{"format":', '{/* comment */"format":')],
    ["trailing commas", `${sourceOf().slice(0, -1)},}`],
    ["malformed JSON", '{"format":'],
  ])("rejects %s before schema validation", (_name, source) => {
    const result = parseTaskGraph(source);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics[0]?.code).toBe("invalid-json");
  });

  it("rejects deeply nested JSON without overflowing the strict duplicate-key scanner", () => {
    const nested = `${"[".repeat(100_000)}0${"]".repeat(100_000)}`;

    invalidAt(parseTaskGraph(nested), "");
  });

  it.each([
    ["unsupported format", "format", "other", "/format"],
    ["unsupported version", "version", 2, "/version"],
  ])("rejects %s through the strict JSON pipeline", (_name, field, value, pointer) => {
    const graph = objectOf(structuredClone(graphExample()));
    graph[field] = value;

    invalidAt(parseTaskGraph(JSON.stringify(graph)), pointer);
  });

  it("escapes property names in schema JSON Pointers", () => {
    const graph = objectOf(structuredClone(graphExample()));
    graph["unexpected/field~"] = true;

    invalidAt(parseTaskGraph(JSON.stringify(graph)), "/unexpected~1field~0");
  });

  it.each([
    [
      "duplicate root key",
      sourceOf().replace(
        '"format":"kepler-task-dag"',
        '"format":"kepler-task-dag","format":"kepler-task-dag"',
      ),
      "/format",
    ],
    [
      "duplicate escaped root key",
      sourceOf().replace(
        '"format":"kepler-task-dag"',
        '"format":"kepler-task-dag","f\\u006frmat":"kepler-task-dag"',
      ),
      "/format",
    ],
    [
      "duplicate nested key",
      sourceOf().replace(
        '"purpose":"Implement the accepted publishing contract."',
        '"purpose":"Implement the accepted publishing contract.","purpose":"duplicate"',
      ),
      "/tasks/0/inputs/0/purpose",
    ],
  ])("rejects %s with a JSON Pointer", (_name, source, pointer) => {
    invalidAt(parseTaskGraph(source), pointer);
  });

  it.each(["format", "version", "id", "unit_id", "tasks"])(
    "rejects a graph missing required field %s",
    (field) => {
      const graph = objectOf(structuredClone(graphExample()));
      delete graph[field];

      invalidAt(validateTaskGraphSchema(graph), `/${field}`);
    },
  );

  it.each([
    "id",
    "title",
    "goal",
    "inputs",
    "outputs",
    "acceptance_criteria",
    "guidance",
    "verification",
    "depends_on",
    "prerequisites",
  ])("rejects a task missing required field %s", (field) => {
    const graph = objectOf(structuredClone(graphExample()));
    delete taskAt(graph)[field];

    invalidAt(validateTaskGraphSchema(graph), `/tasks/0/${field}`);
  });

  it.each(nestedInvalidCases)("rejects $name at $pointer", ({ mutate, pointer }) => {
    const graph = objectOf(structuredClone(graphExample()));
    mutate(graph);

    invalidAt(validateTaskGraphSchema(graph), pointer);
  });

  it.each([
    ["unsupported format", (graph: Record<string, unknown>) => { graph.format = "other"; }, "/format"],
    ["unsupported version", (graph: Record<string, unknown>) => { graph.version = 2; }, "/version"],
    ["non-integer version", (graph: Record<string, unknown>) => { graph.version = 1.5; }, "/version"],
    ["null graph identity", (graph: Record<string, unknown>) => { graph.id = null; }, "/id"],
    ["invalid UUID version", (graph: Record<string, unknown>) => { graph.id = "7e9e09ec-0b0e-5b27-9cc7-373ad7bc869c"; }, "/id"],
    ["empty unit identity", (graph: Record<string, unknown>) => { graph.unit_id = "  "; }, "/unit_id"],
    ["empty task set", (graph: Record<string, unknown>) => { graph.tasks = []; }, "/tasks"],
  ])("rejects %s", (_name, mutate, pointer) => {
    const graph = objectOf(structuredClone(graphExample()));
    mutate(graph);

    invalidAt(validateTaskGraphSchema(graph), pointer);
  });

  it.each(["status", "attempts", "approvals", "baselines", "check_results", "edges", "resources"])(
    "rejects runtime or alternate-graph field %s",
    (field) => {
      const graph = objectOf(structuredClone(graphExample()));
      graph[field] = [];

      invalidAt(validateTaskGraphSchema(graph), `/${field}`);
    },
  );

  it("allows empty optional arrays", () => {
    const mutableGraph = objectOf(structuredClone(graphExample()));
    taskAt(mutableGraph).inputs = [];
    taskAt(mutableGraph).guidance = [];
    taskAt(mutableGraph).depends_on = [];
    taskAt(mutableGraph, 1).prerequisites = [];

    expect(parseTaskGraph(sourceOf(mutableGraph as unknown as TaskGraph)).kind).toBe("parsed");
  });

  it("preserves opaque input references without normalization", () => {
    const reference = "  opaque:../material#fragment  ";
    const result = parseTaskGraph(sourceOf(graphExample(reference)));

    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed")
      expect(result.graph.tasks[0]?.inputs[0]?.reference).toBe(reference);
  });

  it("does not modify input text or object graphs during reading and validation", () => {
    const validSource = sourceOf();
    const invalidSource = `${validSource.slice(0, -1)},}`;
    const validBytes = new TextEncoder().encode(validSource);
    const invalidBytes = new TextEncoder().encode(invalidSource);
    const graph = structuredClone(graphExample());
    const originalGraph = structuredClone(graph);

    parseTaskGraph(validSource);
    parseTaskGraph(invalidSource);
    validateTaskGraphSchema(graph);
    validateTaskGraph(graph, {
      unitDirectoryId: graph.unit_id,
      planUnitId: graph.unit_id,
      planArtifactId: "11111111-1111-4111-8111-111111111111",
      executionIdentities: [],
    });

    expect(new TextEncoder().encode(validSource)).toEqual(validBytes);
    expect(new TextEncoder().encode(invalidSource)).toEqual(invalidBytes);
    expect(graph).toEqual(originalGraph);
  });
});

const validationContext = (
  overrides: Partial<TaskGraphValidationContext> = {},
): TaskGraphValidationContext => ({
  unitDirectoryId: "2026-10-18-message-publishing",
  planUnitId: "2026-10-18-message-publishing",
  planArtifactId: "11111111-1111-4111-8111-111111111111",
  executionIdentities: [],
  ...overrides,
});

const definitionOf = (task: TaskGraphTask): TaskGraphTaskDefinition => {
  const { id: _id, ...definition } = task;
  return definition;
};

const existingDraft = (task: TaskGraphTask): TaskGraphTaskDraft => ({
  kind: "existing",
  taskId: task.id,
  definition: definitionOf(task),
});

const authoringRequest = (
  overrides: Partial<TaskGraphAuthoringRequest> = {},
) => ({
  unitId: "2026-10-18-message-publishing",
  planUnitId: "2026-10-18-message-publishing",
  planArtifactId: "11111111-1111-4111-8111-111111111111",
  executionIdentities: [],
  previousGraph: graphExample(),
  retiredTaskIds: [],
  tasks: graphExample().tasks.map(existingDraft),
  ...overrides,
});

const identityDiagnostics = (
  result: TaskGraphValidationResult,
  code: string,
): readonly string[] => {
  expect(result.kind).toBe("invalid");
  if (result.kind === "invalid") {
    const matches = result.diagnostics.filter((diagnostic) => diagnostic.code === code);
    expect(matches.length).toBeGreaterThan(0);
    return matches.map(({ pointer }) => pointer);
  }
  return [];
};

describe("task graph identities and dependencies", () => {
  it("accepts distinct graph, plan, and task identities owned by the selected unit", () => {
    const graph = graphExample();

    expect(validateTaskGraph(graph, validationContext())).toEqual({ kind: "valid", graph });
    expect(readTaskGraph(sourceOf(graph), validationContext()).kind).toBe("valid");
  });

  it.each([
    ["uppercase graph UUID", (graph: TaskGraph) => ({ ...graph, id: "7E9E09EC-0B0E-4B27-9CC7-373AD7BC869C" }), "/id"],
    ["non-v4 graph UUID", (graph: TaskGraph) => ({ ...graph, id: "7e9e09ec-0b0e-5b27-9cc7-373ad7bc869c" }), "/id"],
    ["non-v4 task UUID", (graph: TaskGraph) => ({ ...graph, tasks: graph.tasks.map((task, index) => index === 0 ? { ...task, id: "2a0a7e72-d468-53ed-bc89-54a2139c56ab" } : task) }), "/tasks/0/id"],
  ])("requires lowercase UUIDv4 values: %s", (_name, update, pointer) => {
    const result = validateTaskGraph(update(graphExample()), validationContext());

    invalidAt(result, pointer);
  });

  it.each([
    ["graph and plan", (graph: TaskGraph, context: TaskGraphValidationContext) => [graph, { ...context, planArtifactId: graph.id }] as const, "/id"],
    ["task and plan", (graph: TaskGraph, context: TaskGraphValidationContext) => [{ ...graph, tasks: graph.tasks.map((task, index) => index === 0 ? { ...task, id: context.planArtifactId } : task) }, context] as const, "/tasks/0/id"],
    ["task and graph", (graph: TaskGraph) => [{ ...graph, tasks: graph.tasks.map((task, index) => index === 0 ? { ...task, id: graph.id } : task) }, validationContext()] as const, "/tasks/0/id"],
  ])("keeps %s identities distinct", (_name, arrange, pointer) => {
    const [graph, context] = arrange(graphExample(), validationContext());
    const result = validateTaskGraph(graph, context);

    invalidAt(result, pointer);
  });

  it("rejects graph, plan, and task IDs that collide with execution identities", () => {
    const graph = graphExample();
    const taskCollision = validateTaskGraph(
      graph,
      validationContext({ executionIdentities: [graph.tasks[0]!.id] }),
    );
    const graphCollision = validateTaskGraph(
      graph,
      validationContext({ executionIdentities: [graph.id] }),
    );
    const planCollision = validateTaskGraph(
      graph,
      validationContext({
        executionIdentities: [validationContext().planArtifactId],
      }),
    );

    expect(identityDiagnostics(taskCollision, "identity-collision")).toContain(
      "/tasks/0/id",
    );
    expect(identityDiagnostics(graphCollision, "identity-collision")).toContain(
      "/id",
    );
    expect(identityDiagnostics(planCollision, "identity-collision")).toContain("");
  });

  it("rejects generated execution identity collisions through typed authoring", () => {
    const graph = graphExample();
    const generatedIds = [graph.id, graph.tasks[0]!.id];
    const result = writeTaskGraph(
      authoringRequest({
        previousGraph: undefined,
        executionIdentities: [graph.tasks[0]!.id],
        tasks: [{ kind: "new", definition: definitionOf(graph.tasks[0]!) }],
      }),
      () => generatedIds.shift()!,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "identity-collision",
            pointer: "/tasks/0/id",
          }),
        ]),
      );
  });

  it("rejects duplicate task identities at the later task", () => {
    const graph = graphExample();
    const duplicated: TaskGraph = {
      ...graph,
      tasks: graph.tasks.map((task, index) =>
        index === 1 ? { ...task, id: graph.tasks[0]!.id } : task,
      ),
    };

    const result = validateTaskGraph(duplicated, validationContext());

    expect(identityDiagnostics(result, "duplicate-task-id")).toContain("/tasks/1/id");
  });

  it.each([
    ["directory", { unitDirectoryId: "other-unit" }],
    ["plan metadata", { planUnitId: "other-unit" }],
  ])("rejects unit ownership inconsistent with %s", (_name, overrides) => {
    const result = validateTaskGraph(
      graphExample(),
      validationContext(overrides),
    );

    expect(identityDiagnostics(result, "unit-ownership")).toContain("/unit_id");
  });

  it("rejects an invalid plan artifact identity", () => {
    const result = validateTaskGraph(
      graphExample(),
      validationContext({ planArtifactId: "not-a-uuid" }),
    );

    expect(identityDiagnostics(result, "invalid-plan-identity")).toContain("");
  });

  it.each([
    ["missing predecessor", "missing-predecessor", "88888888-8888-4888-8888-888888888888"],
    ["self dependency", "self-dependency", "self"],
  ])("rejects a %s with a pointer to the edge", (name, code, predecessor) => {
    const graph = graphExample();
    const tasks = graph.tasks.map((task, index) =>
      index === 0
        ? {
            ...task,
            depends_on: [
              {
                task_id: predecessor === "self" ? task.id : predecessor,
                reason: `${name} test edge`,
              },
            ],
          }
        : task,
    );
    const result = validateTaskGraph({ ...graph, tasks }, validationContext());

    expect(identityDiagnostics(result, code)).toContain("/tasks/0/depends_on/0/task_id");
  });

  it("rejects duplicate predecessor edges", () => {
    const graph = graphExample();
    const task = graph.tasks[1]!;
    const duplicated: TaskGraph = {
      ...graph,
      tasks: [
        graph.tasks[0]!,
        {
          ...task,
          depends_on: [task.depends_on[0]!, task.depends_on[0]!],
        },
      ],
    };

    const result = validateTaskGraph(duplicated, validationContext());

    expect(identityDiagnostics(result, "duplicate-dependency")).toContain(
      "/tasks/1/depends_on/1/task_id",
    );
  });

  it("accepts reordered acyclic tasks and rejects cycles regardless of array order", () => {
    const graph = graphExample();
    const reordered: TaskGraph = {
      ...graph,
      tasks: [graph.tasks[1]!, graph.tasks[0]!],
    };
    expect(validateTaskGraph(reordered, validationContext()).kind).toBe("valid");

    const cyclic: TaskGraph = {
      ...graph,
      tasks: graph.tasks.map((task, index) => ({
        ...task,
        depends_on: [
          {
            task_id: graph.tasks[index === 0 ? 1 : 0]!.id,
            reason: "Cycle fixture edge",
          },
        ],
      })),
    };
    const reversedCycle: TaskGraph = {
      ...cyclic,
      tasks: [cyclic.tasks[1]!, cyclic.tasks[0]!],
    };

    for (const candidate of [cyclic, reversedCycle]) {
      const result = validateTaskGraph(candidate, validationContext());
      expect(identityDiagnostics(result, "dependency-cycle")).toContain(
        "/tasks/1/depends_on/0/task_id",
      );
    }
  });
});

describe("typed task graph authoring", () => {
  it("preserves graph and surviving task identities through reorder and revision", () => {
    const previous = graphExample();
    const drafts: readonly TaskGraphTaskDraft[] = [
      {
        ...existingDraft(previous.tasks[1]!),
        definition: {
          ...definitionOf(previous.tasks[1]!),
          title: "Revise publishing adapter",
        },
      },
      existingDraft(previous.tasks[0]!),
    ];

    const result = writeTaskGraph(
      authoringRequest({ previousGraph: previous, tasks: drafts }),
      () => {
        throw new Error("Existing task identities must not be regenerated");
      },
    );

    expect(result.kind).toBe("written");
    if (result.kind === "written") {
      const read = readTaskGraph(result.source, validationContext());
      expect(read.kind).toBe("valid");
      if (read.kind === "valid") {
        expect(read.graph.id).toBe(previous.id);
        expect(read.graph.tasks.map(({ id }) => id)).toEqual([
          previous.tasks[1]!.id,
          previous.tasks[0]!.id,
        ]);
        expect(read.graph.tasks[0]?.title).toBe("Revise publishing adapter");
      }
    }
  });

  it("allocates new graph and task identities through the typed identity factory", () => {
    const graph = graphExample();
    const ids = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ];
    const result = writeTaskGraph(
      authoringRequest({
        previousGraph: undefined,
        tasks: [{ kind: "new", definition: definitionOf(graph.tasks[0]!) }],
      }),
      () => ids.shift()!,
    );

    expect(result.kind).toBe("written");
    if (result.kind === "written") {
      expect(result.graph.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(result.graph.tasks[0]?.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    }
  });

  it("retires removed IDs and prevents their reuse by existing or new task drafts", () => {
    const previous = graphExample();
    const removedId = previous.tasks[1]!.id;
    const retired = writeTaskGraph(
      authoringRequest({
        previousGraph: previous,
        tasks: [existingDraft(previous.tasks[0]!)],
      }),
      () => {
        throw new Error("Existing task identity must not be regenerated");
      },
    );

    expect(retired.kind).toBe("written");
    if (retired.kind !== "written") return;
    expect(retired.retiredTaskIds).toContain(removedId);

    const attemptedReuse = writeTaskGraph(
      authoringRequest({
        previousGraph: retired.graph,
        retiredTaskIds: retired.retiredTaskIds,
        tasks: [
          existingDraft(retired.graph.tasks[0]!),
          { kind: "new", definition: definitionOf(previous.tasks[1]!) },
        ],
      }),
      () => removedId,
    );
    expect(attemptedReuse.kind).toBe("invalid");
    if (attemptedReuse.kind === "invalid")
      expect(attemptedReuse.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "retired-task-id-reused",
            pointer: "/tasks/1/id",
          }),
        ]),
      );

    const manualReuse = writeTaskGraph(
      authoringRequest({
        previousGraph: retired.graph,
        retiredTaskIds: retired.retiredTaskIds,
        tasks: [
          {
            kind: "existing",
            taskId: removedId,
            definition: definitionOf(previous.tasks[1]!),
          },
        ],
      }),
      () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(manualReuse.kind).toBe("invalid");
    if (manualReuse.kind === "invalid")
      expect(manualReuse.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "retired-task-id-reused",
            pointer: "/tasks/0/id",
          }),
        ]),
      );
  });

  it("rejects runtime-state fields while writing typed graph definitions", () => {
    const previous = graphExample();
    const definition = {
      ...definitionOf(previous.tasks[0]!),
      status: "complete",
    } as TaskGraphTaskDefinition;
    const result = writeTaskGraph(
      authoringRequest({
        previousGraph: previous,
        tasks: [{ ...existingDraft(previous.tasks[0]!), definition }],
      }),
      () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );

    invalidAt(result, "/tasks/0/status");
  });
});

describe("task graph repository path operands", () => {
  const repositories = [{ id: "source", path: "/work/source" }];
  const fileSystem = {
    realpath: async (path: string) => path,
    isDirectory: async () => true,
  };

  it("accepts explicit paths that resolve inside their declared repository", async () => {
    const diagnostics = await validateTaskGraphPathOperands(
      repositories,
      [
        {
          repositoryId: "source",
          basePath: "packages/cli",
          path: "src/main.ts",
          pointer: "/tasks/0/verification/0/method",
        },
      ],
      fileSystem,
    );

    expect(diagnostics).toEqual([]);
  });

  it("rejects repository roots that resolve to files", async () => {
    const diagnostics = await validateTaskGraphPathOperands(
      repositories,
      [],
      {
        realpath: async (path) => path,
        isDirectory: async () => false,
      },
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "repository-path-invalid" }),
      ]),
    );
  });

  it("rejects duplicate and relative repository root declarations", async () => {
    const duplicate = await validateTaskGraphPathOperands(
      [
        { id: "source", path: "/work/source" },
        { id: "source", path: "/work/other" },
      ],
      [],
      fileSystem,
    );
    expect(duplicate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "repository-path-invalid" }),
      ]),
    );

    const relative = await validateTaskGraphPathOperands(
      [{ id: "source", path: "relative/source" }],
      [],
      fileSystem,
    );
    expect(relative).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "repository-path-invalid" }),
      ]),
    );
  });

  it.each([
    ["empty path", "", "", "repository-path-invalid"],
    ["lexical escape", "", "../../outside.ts", "repository-path-outside"],
    ["unknown repository", "", "src/main.ts", "repository-path-unknown"],
    ["absolute base path", "/outside", "main.ts", "repository-path-invalid"],
  ])("rejects %s with a field pointer", async (name, basePath, path, code) => {
    const diagnostics = await validateTaskGraphPathOperands(
      repositories,
      [
        {
          repositoryId: name === "unknown repository" ? "other" : "source",
          basePath,
          path,
          pointer: "/tasks/0/verification/0/method",
        },
      ],
      fileSystem,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code,
          pointer: "/tasks/0/verification/0/method",
        }),
      ]),
    );
  });

  it("rejects real paths whose symlink target leaves the declared repository", async () => {
    const diagnostics = await validateTaskGraphPathOperands(
      repositories,
      [
        {
          repositoryId: "source",
          basePath: "",
          path: "linked-check.ts",
          pointer: "/tasks/0/verification/0/method",
        },
      ],
      {
        realpath: async (path) =>
          path === "/work/source/linked-check.ts"
            ? "/work/outside/linked-check.ts"
            : path,
        isDirectory: async () => true,
      },
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "repository-path-outside",
          pointer: "/tasks/0/verification/0/method",
        }),
      ]),
    );
  });
});
