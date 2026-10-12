import { describe, expect, it } from "vitest";
import { routeRelationProblems } from "../../packages/cli/src/workbench/artifact-body.js";
import { validateArtifact } from "../../packages/cli/src/workbench/artifact-contracts.js";
import type {
  ArtifactWorkflowRecord,
  RouteUnitContract,
} from "../../packages/cli/src/workbench/artifact-types.js";
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js";

const units: readonly RouteUnitContract[] = [
  { id: 1, name: "First", depends_on: [] },
  { id: 2, name: "Second", depends_on: [1] },
];

const route = (
  routeUnits: readonly RouteUnitContract[],
  names = routeUnits.map((unit) => unit.name),
): RecognizedArtifact => ({
  _tag: "recognized",
  sourcePath: ".kepler/maps/effort/route.md",
  metadata: {
    artifact: "route",
    effort: "effort",
    status: "open",
    created: "2026-09-12",
    updated: "2026-09-12",
    decision: "accepted",
    units: routeUnits.map((unit) => ({
      ...unit,
      status: "pending",
      backed_by: ["tickets/01-research.md"],
    })),
  },
  body: [
    "# Route — Effort",
    "## Point of departure",
    "## Destination",
    "## Path chosen",
    "## Shipping rules",
    "## Units",
    ...names.map((name, index) => `### ${index + 1}. ${name}`),
  ].join("\n"),
  locations: {
    frontmatter: { startLine: 1, endLine: 12 },
    metadata: { startLine: 2, endLine: 12 },
    body: { startLine: 13, endLine: 13 },
  },
});

const routeProblems = (
  artifact: RecognizedArtifact,
): readonly string[] => {
  const result = validateArtifact(artifact);
  return result._tag === "invalid"
    ? result.diagnostics.map((item) => item.message)
    : [];
};

describe("route relations", () => {
  it("accepts a coherent route and rejects duplicate IDs and dependencies", () => {
    expect(routeProblems(route(units))).toEqual([]);
    expect(
      routeProblems(
        route([
          units[0]!,
          { id: 1, name: "Second", depends_on: [1] },
        ]),
      ),
    ).toContain("Route unit IDs must be unique");
    expect(
      routeProblems(
        route([
          units[0]!,
          { id: 2, name: "Second", depends_on: [1, 1] },
        ]),
      ),
    ).toContain("Unit 2 repeats a dependency");
  });

  it("rejects unknown, self, cyclic and metadata/body relationships", () => {
    expect(
      routeProblems(
        route([
          units[0]!,
          { id: 2, name: "Second", depends_on: [3] },
        ]),
      ),
    ).toContain("Unit 2 has unknown dependency 3");
    expect(
      routeProblems(
        route([{ id: 1, name: "First", depends_on: [1] }]),
      ),
    ).toContain("Unit 1 depends on itself");
    expect(
      routeProblems(
        route([
          { id: 1, name: "First", depends_on: [2] },
          { id: 2, name: "Second", depends_on: [1] },
        ]),
      ),
    ).toContain("Route dependencies must be acyclic");
    expect(routeProblems(route(units, ["Renamed", "Second"]))).toContain(
      "Route metadata and body unit identities/order must match",
    );
    expect(
      routeProblems(
        route(
          [
            { id: 2, name: "Second", depends_on: [1] },
            { id: 1, name: "First", depends_on: [] },
          ],
          ["First", "Second"],
        ),
      ),
    ).toContain("Route metadata and body unit identities/order must match");
  });

  it("checks long acyclic routes with iterative traversal", () => {
    const count = 20_000;
    const longUnits: RouteUnitContract[] = Array.from(
      { length: count },
      (_, index) => ({
        id: index + 1,
        name: `Unit ${index + 1}`,
        depends_on: index === 0 ? [] : [index],
      }),
    );
    const longRecords: ArtifactWorkflowRecord[] = longUnits.map((unit) => ({
      kind: "unit",
      number: unit.id,
      title: unit.name,
      line: unit.id + 10,
      fields: {},
    }));

    expect(routeRelationProblems(longUnits, longRecords)).toEqual([]);
  });
});
