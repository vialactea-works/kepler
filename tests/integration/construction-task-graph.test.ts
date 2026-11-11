import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import {
  validateConstructionArtifact,
  type ConstructionArtifactOwnership,
} from "../../packages/cli/src/construction/artifacts.js";
import {
  readTaskGraph,
  type TaskGraphValidationContext,
} from "../../packages/cli/src/construction/task-graph.js";
import {
  writeTaskGraph,
  type TaskGraphTaskDraft,
} from "../../packages/cli/src/construction/task-graph-authoring.js";
import { validateTaskGraphPathOperands } from "../../packages/cli/src/construction/task-graph-paths.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const unitId = "2026-10-18-message-publishing";
const unitRoot = `.kepler/missions/mission-1/construction/units-of-work/${unitId}`;
const planArtifactId = "11111111-1111-4111-8111-111111111111";
const ownership: ConstructionArtifactOwnership = {
  kind: "unit",
  unitId,
  unitRoot,
};
const validationContext: TaskGraphValidationContext = {
  unitDirectoryId: unitId,
  planUnitId: unitId,
  planArtifactId,
  executionIdentities: [],
};
const planMetadata = {
  id: planArtifactId,
  type: "implementation-plan",
  schema_version: 3,
  unit_id: unitId,
  author: "Ada Lovelace <ada@example.com>",
};
const planSource = (link: string): string =>
  `---\n${Yaml.stringify(planMetadata).trimEnd()}\n---\n# Plan\n\n## Technical solution\n\nUse a publishing adapter.\n\n## Task graph context\n\nThe graph is [tasks-dag.json](${link}).\n\n## Verification strategy\n\nRun the project checks.\n\n## Decisions and open questions\n\nNo unresolved decisions.\n`;

const temporaryRoots: string[] = [];
const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(Path.join(Os.tmpdir(), "kepler-m03-task-graph-"));
  temporaryRoots.push(root);
  return root;
};

const taskDrafts = (graph: ReturnType<typeof taskGraphExample>): readonly TaskGraphTaskDraft[] =>
  graph.tasks.map(({ id: _id, ...definition }) => ({ kind: "new", definition }));

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Construction task graph filesystem integration", () => {
  it("writes through the typed authoring interface and reads stable identities back", async () => {
    const repositoryRoot = await createRoot();
    const graph = taskGraphExample("../../outside-material.md");
    const ids = [graph.id, ...graph.tasks.map(({ id }) => id)];
    const written = writeTaskGraph(
      {
        unitId,
        planUnitId: unitId,
        planArtifactId,
        executionIdentities: [],
        retiredTaskIds: [],
        tasks: taskDrafts(graph),
      },
      () => ids.shift()!,
    );
    expect(written.kind).toBe("written");
    if (written.kind !== "written") return;

    const graphPath = Path.join(repositoryRoot, unitRoot, "tasks-dag.json");
    await mkdir(Path.dirname(graphPath), { recursive: true });
    await writeFile(graphPath, written.source, "utf8");
    const originalBytes = await readFile(graphPath);
    const firstRead = readTaskGraph(originalBytes.toString("utf8"), validationContext);

    expect(firstRead.kind).toBe("valid");
    if (firstRead.kind !== "valid") return;
    expect(firstRead.graph.id).toBe(graph.id);
    expect(firstRead.graph.tasks.map(({ id }) => id)).toEqual(
      graph.tasks.map(({ id }) => id),
    );
    expect(firstRead.graph.tasks[0]?.inputs[0]?.reference).toBe(
      "../../outside-material.md",
    );
    expect(await readFile(graphPath)).toEqual(originalBytes);

    const reordered = writeTaskGraph(
      {
        unitId,
        planUnitId: unitId,
        planArtifactId,
        executionIdentities: [],
        previousGraph: firstRead.graph,
        retiredTaskIds: [],
        tasks: [
          {
            kind: "existing",
            taskId: graph.tasks[1]!.id,
            definition: (({ id: _id, ...definition }) => definition)(graph.tasks[1]!),
          },
          {
            kind: "existing",
            taskId: graph.tasks[0]!.id,
            definition: (({ id: _id, ...definition }) => definition)(graph.tasks[0]!),
          },
        ],
      },
      () => {
        throw new Error("Reordering surviving tasks must preserve their identities");
      },
    );
    expect(reordered.kind).toBe("written");
    if (reordered.kind !== "written") return;
    await writeFile(graphPath, reordered.source, "utf8");
    const secondRead = readTaskGraph(
      await readFile(graphPath, "utf8"),
      validationContext,
    );

    expect(secondRead.kind).toBe("valid");
    if (secondRead.kind === "valid") {
      expect(secondRead.graph.id).toBe(graph.id);
      expect(secondRead.graph.tasks.map(({ id }) => id)).toEqual([
        graph.tasks[1]!.id,
        graph.tasks[0]!.id,
      ]);
      expect(secondRead.graph.tasks[0]?.inputs[0]?.reference).toBe(
        graph.tasks[1]?.inputs[0]?.reference,
      );
    }
  });

  it("rejects a regular file as a repository root", async () => {
    const root = await createRoot();
    const filePath = Path.join(root, "not-a-repository-directory");
    await writeFile(filePath, "file content\n", "utf8");

    const diagnostics = await validateTaskGraphPathOperands(
      [{ id: "file-root", path: filePath }],
      [],
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "repository-path-invalid" }),
      ]),
    );
  });

  it("validates real Markdown links and explicit path operands within declared roots", async () => {
    const repositoryRoot = await createRoot();
    const outsideRoot = await createRoot();
    const planPath = Path.join(repositoryRoot, unitRoot, "plan.md");
    const graphPath = Path.join(repositoryRoot, unitRoot, "tasks-dag.json");
    const outsidePath = Path.join(outsideRoot, "external.md");
    const escapePath = Path.join(
      repositoryRoot,
      unitRoot,
      "details/implementation-planning/external.md",
    );
    await mkdir(Path.dirname(graphPath), { recursive: true });
    await mkdir(Path.dirname(escapePath), { recursive: true });
    await writeFile(graphPath, "{}\n", "utf8");
    await writeFile(outsidePath, "External material.\n", "utf8");
    await symlink(outsidePath, escapePath);
    await writeFile(planPath, planSource("tasks-dag.json"), "utf8");

    const validPlan = await validateConstructionArtifact({
      repositoryRoot,
      artifactPath: `${unitRoot}/plan.md`,
      ownership,
    });
    expect(validPlan.kind).toBe("valid");

    const localOperandDiagnostics = await validateTaskGraphPathOperands(
      [{ id: "record-home", path: repositoryRoot }],
      [
        {
          repositoryId: "record-home",
          basePath: unitRoot,
          path: "tasks-dag.json",
          pointer: "/tasks/0/verification/0/method",
        },
      ],
    );
    expect(localOperandDiagnostics).toEqual([]);

    await writeFile(
      planPath,
      planSource("details/implementation-planning/external.md"),
      "utf8",
    );
    const invalidPlan = await validateConstructionArtifact({
      repositoryRoot,
      artifactPath: `${unitRoot}/plan.md`,
      ownership,
    });
    expect(invalidPlan.kind).toBe("invalid");
    if (invalidPlan.kind === "invalid")
      expect(invalidPlan.diagnostics.map(({ code }) => code)).toContain(
        "outside-repository",
      );

    const escapingOperandDiagnostics = await validateTaskGraphPathOperands(
      [{ id: "record-home", path: repositoryRoot }],
      [
        {
          repositoryId: "record-home",
          basePath: unitRoot,
          path: "details/implementation-planning/external.md",
          pointer: "/tasks/0/verification/0/method",
        },
      ],
    );
    expect(escapingOperandDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "repository-path-outside",
          pointer: "/tasks/0/verification/0/method",
        }),
      ]),
    );
  });
});
