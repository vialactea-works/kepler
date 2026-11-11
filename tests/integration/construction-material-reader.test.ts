import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import { createNodeRepositoryArtifactFileSystem } from "../../packages/cli/src/construction/artifacts.js";
import { createNodeConstructionMaterialReader } from "../../packages/cli/src/construction/node-material-reader.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const missionId = "c1000000-0000-4000-8000-000000000001";
const unitId = "2026-11-07-material-reader-integration";
const unitDirectory = `construction/units-of-work/${unitId}`;
const persistedUnitDirectory = `.kepler/missions/${missionId}/${unitDirectory}`;
const roots: string[] = [];

const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(Path.join(Os.tmpdir(), "kepler-material-reader-"));
  roots.push(root);
  return root;
};

const source = (
  id: string,
  type: string,
  body: string,
  overrides: Record<string, unknown> = {},
): string => `---\n${Yaml.stringify({
  id,
  type,
  schema_version: 3,
  unit_id: unitId,
  author: "Ada Lovelace <ada@example.com>",
  ...overrides,
}).trimEnd()}\n---\n${body}`;

const unitOfWork = source(
  "c2000000-0000-4000-8000-000000000002",
  "unit-of-work",
  "# Unit of Work\n\n## Purpose\n\nDefine the behavior.\n\n## Scope\n\nKeep the change bounded.\n\n## Context\n\nPreserve the accepted contract.\n",
);
const design = (supportLink = "details/functional-design/domain.md", overrides: Record<string, unknown> = {}) => source(
  "c3000000-0000-4000-8000-000000000003",
  "functional-design",
  `# Design\n\n## Domain behavior\n\nKeep behavior stable.\n\n## Domain model\n\nSee [domain detail](${supportLink}).\n\n## Boundaries and interactions\n\nKeep application rules isolated.\n\n## Design decisions and open questions\n\nNo unresolved questions.\n`,
  overrides,
);
const support = (id = "c4000000-0000-4000-8000-000000000004") => source(
  id,
  "supporting-document",
  "# Domain detail\n\nThe domain detail is retained.\n",
);
const quality = (supportLink = "details/quality-requirements/quality-detail.md") => source(
  "c5000000-0000-4000-8000-000000000005",
  "non-functional-requirements",
  `# Quality Requirements\n\n## Quality requirements\n\nMeet the required quality target.\n\n## Constraints and dependencies\n\nRespect the repository constraints.\n\n## Decisions and open questions\n\nNo unresolved questions. See [detail](${supportLink}).\n`,
);
const planning = (graphLink = "tasks-dag.json") => source(
  "c6000000-0000-4000-8000-000000000006",
  "implementation-plan",
  `# Implementation Plan\n\n## Technical solution\n\nKeep the boundary independent.\n\n## Task graph context\n\nUse [the task graph](${graphLink}).\n\n## Verification strategy\n\nRun the focused suite.\n\n## Decisions and open questions\n\nNo unresolved questions.\n`,
);
const writeUnit = async (root: string, relativePath: string, content: string): Promise<string> => {
  const path = Path.join(root, persistedUnitDirectory, relativePath);
  await mkdir(Path.dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
};
const readerFor = () => createNodeConstructionMaterialReader(createNodeRepositoryArtifactFileSystem());
const functionalRequest = (repositoryRoot: string) => ({
  repositoryRoot,
  missionId,
  unitId,
  persistedUnitDirectory: unitDirectory,
});
const planningRequest = (repositoryRoot: string, executionIdentities: readonly string[] = []) => ({
  ...functionalRequest(repositoryRoot),
  primaryArtifact: "plan.md" as const,
  supportFolder: "implementation-planning" as const,
  recordHomeRepositoryIds: ["repo-main"],
  executionIdentities,
});
const writePlanning = async (root: string, graphLink = "tasks-dag.json", graphSource = `${JSON.stringify({ ...taskGraphExample(), unit_id: unitId })}\n`) => {
  await writeUnit(root, "plan.md", planning(graphLink));
  await writeUnit(root, "tasks-dag.json", graphSource);
  await writeUnit(root, "details/implementation-planning/plan-detail.md", support("c7000000-0000-4000-8000-000000000007"));
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Node Construction material reader filesystem integration", () => {
  it("reads required and linked Functional Design and ordinary stage artifacts", async () => {
    const root = await createRoot();
    await writeUnit(root, "unit-of-work.md", unitOfWork);
    await writeUnit(root, "design.md", design());
    await writeUnit(root, "details/functional-design/domain.md", support());
    await writeUnit(root, "quality.md", quality());
    await writeUnit(root, "details/quality-requirements/quality-detail.md", support("c8000000-0000-4000-8000-000000000008"));
    const reader = readerFor();

    const functional = await reader.readFunctionalDesignMaterial(functionalRequest(root));
    const qualityMaterial = await reader.readStageArtifactMaterial({
      ...functionalRequest(root),
      primaryArtifact: "quality.md",
      supportFolder: "quality-requirements",
    });

    expect(functional.kind).toBe("valid");
    if (functional.kind === "valid") {
      expect(functional.material.artifactPaths).toEqual(["unit-of-work.md", "design.md", "details/functional-design/domain.md"]);
      expect(functional.material.artifactBindings).toHaveLength(3);
      expect(functional.material.artifactBindings.every((binding) => /^sha256:[a-f0-9]{64}$/.test(binding.content_version))).toBe(true);
    }
    expect(qualityMaterial.kind).toBe("valid");
    if (qualityMaterial.kind === "valid") {
      expect(qualityMaterial.material.artifactPaths).toEqual(["details/quality-requirements/quality-detail.md", "quality.md"]);
    }
  });

  it("refuses missing or invalid required artifacts and duplicate identities", async () => {
    const root = await createRoot();
    await writeUnit(root, "unit-of-work.md", unitOfWork);
    const reader = readerFor();
    const missing = await reader.readFunctionalDesignMaterial(functionalRequest(root));
    expect(missing.kind).toBe("invalid");

    await writeUnit(root, "design.md", design("details/functional-design/domain.md"));
    await writeUnit(root, "details/functional-design/domain.md", support());
    await writeUnit(root, "unit-of-work.md", unitOfWork.replace("schema_version: 3", "schema_version: 2"));
    const invalid = await reader.readFunctionalDesignMaterial(functionalRequest(root));
    expect(invalid.kind).toBe("invalid");
    if (invalid.kind === "invalid") expect(invalid.diagnostics.map((item) => item.code)).toContain("unsupported-schema-version");

    await writeUnit(root, "unit-of-work.md", unitOfWork);
    await writeUnit(root, "details/functional-design/domain.md", support("c2000000-0000-4000-8000-000000000002"));
    const duplicate = await reader.readFunctionalDesignMaterial(functionalRequest(root));
    expect(duplicate).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "duplicate-artifact-id" })] });
  });

  it("refuses linked support symlinks escaping the repository or Functional Design folder", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeUnit(root, "unit-of-work.md", unitOfWork);
    await writeUnit(root, "design.md", design());
    const supportPath = await writeUnit(root, "details/functional-design/domain.md", support());
    const outsidePath = Path.join(outside, "domain.md");
    await writeFile(outsidePath, support("c9000000-0000-4000-8000-000000000009"), "utf8");
    await rm(supportPath);
    await symlink(outsidePath, supportPath);

    const outsideRepository = await readerFor().readFunctionalDesignMaterial(functionalRequest(root));
    expect(outsideRepository).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "outside-repository" })] });

    await rm(supportPath);
    const otherDetail = await writeUnit(root, "details/quality-requirements/domain.md", support("ca000000-0000-4000-8000-00000000000a"));
    await symlink(otherDetail, supportPath);
    const outsideStage = await readerFor().readFunctionalDesignMaterial(functionalRequest(root));
    expect(outsideStage).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "outside-functional-design-support" })] });
  });

  it("validates Planning graph links, graph content, identities, and repository path containment", async () => {
    const root = await createRoot();
    const reader = readerFor();
    await writePlanning(root);
    const valid = await reader.readPlanningMaterial(planningRequest(root));
    expect(valid.kind).toBe("valid");

    await writeUnit(root, "plan.md", planning("details/implementation-planning/plan-detail.md"));
    const unlinked = await reader.readPlanningMaterial(planningRequest(root));
    expect(unlinked).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "task-graph-link-missing" })] });

    await writeUnit(root, "plan.md", planning());
    await writeUnit(root, "tasks-dag.json", "{ invalid\n");
    const invalidGraph = await reader.readPlanningMaterial(planningRequest(root));
    expect(invalidGraph.kind).toBe("invalid");
    if (invalidGraph.kind === "invalid") expect(invalidGraph.diagnostics.map((item) => item.code)).toContain("invalid-json");

    await writeUnit(root, "tasks-dag.json", `${JSON.stringify({ ...taskGraphExample(), unit_id: unitId })}\n`);
    const graph = taskGraphExample();
    const identityCollision = await reader.readPlanningMaterial(planningRequest(root, [graph.id]));
    expect(identityCollision.kind).toBe("invalid");
    if (identityCollision.kind === "invalid") expect(identityCollision.diagnostics.map((item) => item.code)).toContain("identity-collision");

    const outside = await createRoot();
    const graphPath = await writeUnit(root, "tasks-dag.json", `${JSON.stringify({ ...taskGraphExample(), unit_id: unitId })}\n`);
    const outsideGraph = Path.join(outside, "tasks-dag.json");
    await writeFile(outsideGraph, `${JSON.stringify({ ...taskGraphExample(), unit_id: unitId })}\n`, "utf8");
    await rm(graphPath);
    await symlink(outsideGraph, graphPath);
    const escapedGraph = await reader.readPlanningMaterial(planningRequest(root));
    expect(escapedGraph).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "outside-repository" })] });
  });
});
