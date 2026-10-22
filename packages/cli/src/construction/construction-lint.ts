import * as Path from "node:path";
import { validateConstructionArtifact } from "./artifacts.js";
import { readTaskGraph, type TaskGraphDiagnostic } from "./task-graph.js";
import { validateTaskGraphPathOperands } from "./task-graph-paths.js";
import type { UnitQueryFileSystem, UnitQueryFailure } from "./unit-queries.js";
import { UnitQueries } from "./unit-queries.js";

export interface ConstructionLintFinding {
  readonly path: string;
  readonly field: string | null;
  readonly code: string;
  readonly message: string;
}

export type ConstructionLintResult =
  | { readonly kind: "valid"; readonly findings: readonly [] }
  | { readonly kind: "invalid"; readonly findings: readonly ConstructionLintFinding[] }
  | UnitQueryFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const graphFinding = (path: string, diagnostic: TaskGraphDiagnostic): ConstructionLintFinding => ({
  path,
  field: diagnostic.pointer || null,
  code: diagnostic.code,
  message: diagnostic.message,
});

const artifactFields: Readonly<Record<string, string>> = {
  "invalid-id": "id",
  "invalid-type": "type",
  "invalid-schema-version": "schema_version",
  "unsupported-schema-version": "schema_version",
  "invalid-unit-id": "unit_id",
  "missing-unit-id": "unit_id",
  "forbidden-unit-id": "unit_id",
  "unit-ownership-mismatch": "unit_id",
  "invalid-author": "author",
  "invalid-labels": "labels",
  "invalid-label": "labels",
  "duplicate-label": "labels",
};

const artifactFindings = (
  diagnostics: readonly { readonly sourcePath: string; readonly code: string; readonly message: string }[],
): ConstructionLintFinding[] => diagnostics.map((diagnostic) => ({
  path: diagnostic.sourcePath,
  field: artifactFields[diagnostic.code] ?? /field '([^']+)'/.exec(diagnostic.message)?.[1] ?? null,
  code: diagnostic.code,
  message: diagnostic.message,
}));

const invalid = (findings: readonly ConstructionLintFinding[]): ConstructionLintResult => ({
  kind: "invalid",
  findings,
});

export class ConstructionLint {
  constructor(
    private readonly units: UnitQueries,
    private readonly fileSystem: UnitQueryFileSystem,
  ) {}

  async execute(unitId: string, project?: string): Promise<ConstructionLintResult> {
    const context = await this.units.readContext(unitId, project);
    if (context.kind === "failed") return context;
    const relativeUnitRoot = `.kepler/missions/${context.missionId}/construction/units-of-work/${unitId}`;
    const planPath = Path.join(relativeUnitRoot, "plan.md");
    const relativeGraphPath = Path.join(relativeUnitRoot, "tasks-dag.json");
    const graphPath = Path.join(context.recordHome, relativeGraphPath);
    const plan = await validateConstructionArtifact({
      repositoryRoot: context.recordHome,
      artifactPath: planPath,
      ownership: { kind: "unit", unitId, unitRoot: relativeUnitRoot },
    });
    const findings = plan.kind === "invalid" ? artifactFindings(plan.diagnostics) : [];
    const planArtifact = plan.artifact;
    if (!planArtifact || !isRecord(planArtifact.metadata) ||
        typeof planArtifact.metadata.id !== "string" || typeof planArtifact.metadata.unit_id !== "string") {
      if (findings.length === 0) {
        findings.push({
          path: planPath,
          field: null,
          code: "invalid-plan-identity",
          message: "The unit plan must identify its artifact and owning unit before graph validation.",
        });
      }
      return invalid(findings);
    }
    if (planArtifact.metadata.type !== "implementation-plan") {
      findings.push({
        path: planPath,
        field: "type",
        code: "artifact-type-mismatch",
        message: "The canonical unit plan must have type implementation-plan.",
      });
    }
    const recordHomeRepositoryIds = context.history.events.flatMap((record) => {
      const event = record.constructionEvent;
      if (!event || event.type !== "construction.mission-created" || !isRecord(event.data.record_home) ||
          typeof event.data.record_home.repository_id !== "string") return [];
      return [event.data.record_home.repository_id];
    });
    if (recordHomeRepositoryIds.length !== 1) {
      return {
        kind: "failed",
        code: "mission_record_home_unavailable",
        message: "The selected mission does not have one readable record-home repository binding.",
        details: { mission_id: context.missionId },
        recovery: "Resolve the mission's recorded record-home binding before linting its canonical graph.",
      };
    }
    const recordHomeRepositoryId = recordHomeRepositoryIds[0];
    if (!recordHomeRepositoryId) {
      return {
        kind: "failed",
        code: "mission_record_home_unavailable",
        message: "The selected mission does not have one readable record-home repository binding.",
        details: { mission_id: context.missionId },
        recovery: "Resolve the mission's recorded record-home binding before linting its canonical graph.",
      };
    }
    const pathDiagnostics = await validateTaskGraphPathOperands(
      [{ id: recordHomeRepositoryId, path: context.recordHome }],
      [{ repositoryId: recordHomeRepositoryId, basePath: ".", path: relativeGraphPath, pointer: "" }],
    );
    findings.push(...pathDiagnostics.map((diagnostic) => graphFinding(relativeGraphPath, diagnostic)));
    if (pathDiagnostics.length > 0) return invalid(findings);
    let graphSource: string;
    try {
      graphSource = new TextDecoder().decode(await this.fileSystem.read(graphPath, context.recordHome));
    } catch {
      findings.push({
        path: Path.join(relativeUnitRoot, "tasks-dag.json"),
        field: null,
        code: "task-graph-unavailable",
        message: "The canonical mission-owned task graph cannot be read.",
      });
      return invalid(findings);
    }
    const executionIdentities = [...new Set(context.history.events.flatMap((record) => record.event ? [record.event.id] : []))];
    const graph = readTaskGraph(graphSource, {
      unitDirectoryId: unitId,
      planUnitId: planArtifact.metadata.unit_id,
      planArtifactId: planArtifact.metadata.id,
      executionIdentities,
    });
    if (graph.kind === "invalid") findings.push(...graph.diagnostics.map((diagnostic) => graphFinding(Path.join(relativeUnitRoot, "tasks-dag.json"), diagnostic)));
    return findings.length > 0 ? invalid(findings) : { kind: "valid", findings: [] };
  }
}
