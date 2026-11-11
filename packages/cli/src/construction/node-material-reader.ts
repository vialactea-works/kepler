import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { RepositoryArtifactFileSystem } from "./artifacts.js";
import { validateConstructionArtifact } from "./artifacts.js";
import type {
  ConstructionMaterialReadResult,
  ConstructionMaterialReader,
  FunctionalDesignMaterial,
  FunctionalDesignMaterialRequest,
  PlanningMaterial,
  PlanningMaterialRequest,
  StageArtifactMaterial,
  StageArtifactMaterialRequest,
} from "./material-reader.js";
import { readTaskGraph } from "./task-graph.js";
import { validateTaskGraphPathOperands } from "./task-graph-paths.js";
import type { GraphReference } from "./events.js";

const contained = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};

const normalized = (value: string): string => value.split(Path.sep).join("/");

const parseLinkPath = (url: string): string | undefined => {
  if (url.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return undefined;
  const suffix = url.search(/[?#]/);
  const rawPath = suffix < 0 ? url : url.slice(0, suffix);
  if (rawPath.length === 0) return undefined;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
};

const localArtifactLinkPath = (url: string): string | undefined => {
  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return undefined;
  const path = url.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(path ?? "");
  } catch {
    return undefined;
  }
};

const invalid = <T>(...diagnostics: readonly Readonly<Record<string, unknown>>[]): ConstructionMaterialReadResult<T> => ({
  kind: "invalid",
  diagnostics,
});

export class NodeConstructionMaterialReader implements ConstructionMaterialReader {
  constructor(private readonly fileSystem: RepositoryArtifactFileSystem) {}

  async readFunctionalDesignMaterial(
    request: FunctionalDesignMaterialRequest,
  ): Promise<ConstructionMaterialReadResult<FunctionalDesignMaterial>> {
    const canonicalDirectory = `construction/units-of-work/${request.unitId}`;
    if (typeof request.persistedUnitDirectory !== "string" || request.persistedUnitDirectory !== canonicalDirectory) {
      return invalid({
        path: request.persistedUnitDirectory,
        code: "unit-directory-mismatch",
        message: "The unit-created directory does not match the canonical Construction Unit of Work path.",
        expected: canonicalDirectory,
      });
    }
    const unitDirectory = `.kepler/missions/${request.missionId}/${request.persistedUnitDirectory}`;
    const absoluteUnitDirectory = Path.resolve(request.repositoryRoot, unitDirectory);
    const functionalDesignDirectory = Path.join(absoluteUnitDirectory, "details", "functional-design");
    const requiredPaths = [`${unitDirectory}/unit-of-work.md`, `${unitDirectory}/design.md`];
    const pending = [...requiredPaths];
    const visited = new Set<string>();
    const artifacts: Array<{
      readonly path: string;
      readonly id: string;
      readonly contentVersion: string;
      readonly links: readonly { readonly url: string }[];
    }> = [];
    const diagnostics: Readonly<Record<string, unknown>>[] = [];

    while (pending.length > 0) {
      const artifactPath = pending.shift();
      if (artifactPath === undefined || visited.has(artifactPath)) continue;
      visited.add(artifactPath);
      const validation = await validateConstructionArtifact({
        repositoryRoot: request.repositoryRoot,
        artifactPath,
        ownership: { kind: "unit", unitId: request.unitId, unitRoot: unitDirectory },
      }, this.fileSystem);
      if (validation.kind === "invalid") {
        diagnostics.push(...validation.diagnostics.map((item) => ({
          path: item.sourcePath,
          code: item.code,
          message: item.message,
        })));
        continue;
      }
      const artifact = validation.artifact;
      artifacts.push({
        path: artifactPath,
        id: artifact.metadata.id,
        contentVersion: `sha256:${createHash("sha256").update(artifact.source, "utf8").digest("hex")}`,
        links: artifact.links,
      });
      for (const link of artifact.links) {
        const linkPath = parseLinkPath(link.url);
        if (linkPath === undefined) continue;
        const target = Path.isAbsolute(linkPath)
          ? Path.resolve(request.repositoryRoot, `.${linkPath}`)
          : Path.resolve(Path.dirname(Path.resolve(request.repositoryRoot, artifactPath)), linkPath);
        if (!contained(functionalDesignDirectory, target)) continue;
        if (Path.extname(target).toLowerCase() !== ".md") {
          diagnostics.push({ path: artifactPath, code: "invalid-functional-design-support", message: `Linked Functional Design support must be Markdown: ${link.url}` });
          continue;
        }
        let realTarget: string;
        try {
          realTarget = await this.fileSystem.realpath(target);
        } catch {
          diagnostics.push({ path: artifactPath, code: "missing-functional-design-support", message: `Linked Functional Design support does not exist: ${link.url}` });
          continue;
        }
        if (!contained(functionalDesignDirectory, realTarget)) {
          diagnostics.push({ path: artifactPath, code: "outside-functional-design-support", message: `Linked Functional Design support must remain under details/functional-design/: ${link.url}` });
          continue;
        }
        pending.push(normalized(Path.relative(request.repositoryRoot, realTarget)));
      }
    }

    if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
    if (!requiredPaths.every((required) => visited.has(required))) {
      return invalid({ path: unitDirectory, code: "required-artifact-missing", message: "Both unit-of-work.md and design.md are required." });
    }
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
      return invalid({ path: unitDirectory, code: "duplicate-artifact-id", message: "Functional Design material contains duplicate artifact identities." });
    }
    const sortedArtifacts = artifacts.sort((left, right) => left.path.localeCompare(right.path));
    const primaryPaths = requiredPaths.map((path) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(request.repositoryRoot, path))));
    const supportPaths = sortedArtifacts
      .map((artifact) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(request.repositoryRoot, artifact.path))))
      .filter((path) => path.startsWith("details/functional-design/"));
    return {
      kind: "valid",
      material: {
        artifactBindings: sortedArtifacts.map((artifact) => ({
          artifact_id: artifact.id,
          content_version: artifact.contentVersion,
        })),
        artifactPaths: [...primaryPaths, ...supportPaths],
        unitDirectory,
      },
    };
  }

  async readStageArtifactMaterial(
    request: StageArtifactMaterialRequest,
  ): Promise<ConstructionMaterialReadResult<StageArtifactMaterial>> {
    const canonicalDirectory = `construction/units-of-work/${request.unitId}`;
    if (typeof request.persistedUnitDirectory !== "string" || request.persistedUnitDirectory !== canonicalDirectory) {
      return invalid({ path: request.persistedUnitDirectory, code: "unit-directory-mismatch", expected: canonicalDirectory });
    }
    const unitDirectory = `.kepler/missions/${request.missionId}/${request.persistedUnitDirectory}`;
    const absoluteUnitDirectory = Path.resolve(request.repositoryRoot, unitDirectory);
    const supportDirectory = Path.join(absoluteUnitDirectory, "details", request.supportFolder);
    const requiredPath = `${unitDirectory}/${request.primaryArtifact}`;
    const pending = [requiredPath];
    const visited = new Set<string>();
    const artifacts: { readonly path: string; readonly id: string; readonly contentVersion: string }[] = [];
    const diagnostics: Readonly<Record<string, unknown>>[] = [];
    while (pending.length > 0) {
      const artifactPath = pending.shift();
      if (artifactPath === undefined || visited.has(artifactPath)) continue;
      visited.add(artifactPath);
      const validation = await validateConstructionArtifact({
        repositoryRoot: request.repositoryRoot,
        artifactPath,
        ownership: { kind: "unit", unitId: request.unitId, unitRoot: unitDirectory },
      }, this.fileSystem);
      if (validation.kind === "invalid") {
        diagnostics.push(...validation.diagnostics.map((item) => ({ path: item.sourcePath, code: item.code, message: item.message })));
        continue;
      }
      artifacts.push({
        path: artifactPath,
        id: validation.artifact.metadata.id,
        contentVersion: `sha256:${createHash("sha256").update(validation.artifact.source, "utf8").digest("hex")}`,
      });
      for (const link of validation.artifact.links) {
        const linkPath = parseLinkPath(link.url);
        if (linkPath === undefined) continue;
        const target = Path.isAbsolute(linkPath)
          ? Path.resolve(request.repositoryRoot, `.${linkPath}`)
          : Path.resolve(Path.dirname(Path.resolve(request.repositoryRoot, artifactPath)), linkPath);
        if (!contained(supportDirectory, target)) continue;
        if (Path.extname(target).toLowerCase() !== ".md") {
          diagnostics.push({ path: artifactPath, code: "invalid-stage-support", message: `Linked stage support must be Markdown: ${link.url}` });
          continue;
        }
        let realTarget: string;
        try {
          realTarget = await this.fileSystem.realpath(target);
        } catch {
          diagnostics.push({ path: artifactPath, code: "missing-stage-support", message: `Linked stage support does not exist: ${link.url}` });
          continue;
        }
        if (!contained(supportDirectory, realTarget)) {
          diagnostics.push({ path: artifactPath, code: "outside-stage-support", message: `Linked stage support must remain under details/${request.supportFolder}/: ${link.url}` });
          continue;
        }
        pending.push(normalized(Path.relative(request.repositoryRoot, realTarget)));
      }
    }
    if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
    if (!visited.has(requiredPath)) {
      return invalid({ path: unitDirectory, code: "required-artifact-missing", message: `${request.primaryArtifact} is required.` });
    }
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
      return invalid({ path: unitDirectory, code: "duplicate-artifact-id", message: "Stage material contains duplicate artifact identities." });
    }
    const sorted = artifacts.sort((left, right) => left.path.localeCompare(right.path));
    return {
      kind: "valid",
      material: {
        unitDirectory,
        artifactBindings: sorted.map((artifact) => ({ artifact_id: artifact.id as StageArtifactMaterial["artifactBindings"][number]["artifact_id"], content_version: artifact.contentVersion })),
        artifactPaths: sorted.map((artifact) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(request.repositoryRoot, artifact.path)))),
      },
    };
  }

  async readPlanningMaterial(
    request: PlanningMaterialRequest,
  ): Promise<ConstructionMaterialReadResult<PlanningMaterial>> {
    const packageResult = await this.readStageArtifactMaterial(request);
    if (packageResult.kind === "invalid") return packageResult;
    const unitRoot = packageResult.material.unitDirectory;
    const graphRelativePath = `${unitRoot}/tasks-dag.json`;
    const planPathRelative = `${unitRoot}/plan.md`;
    const planArtifact = await validateConstructionArtifact({
      repositoryRoot: request.repositoryRoot,
      artifactPath: planPathRelative,
      ownership: { kind: "unit", unitId: request.unitId, unitRoot },
    }, this.fileSystem);
    if (planArtifact.kind === "invalid") {
      return invalid(...planArtifact.diagnostics.map((item) => ({ path: item.sourcePath, code: item.code, message: item.message })));
    }
    const planId = planArtifact.artifact.metadata.id;
    const planUnitId = planArtifact.artifact.metadata.unit_id;
    if (typeof planId !== "string" || planId.trim().length === 0 || typeof planUnitId !== "string" || planUnitId.trim().length === 0 || planArtifact.artifact.metadata.type !== "implementation-plan") {
      return invalid({ path: planPathRelative, code: "plan-identity-invalid", message: "The canonical plan must identify its implementation-plan artifact and owning unit." });
    }
    if (request.recordHomeRepositoryIds.length !== 1) {
      return invalid({ path: unitRoot, code: "record-home-ambiguous", message: "One record-home repository identity is required to validate graph paths." });
    }
    const recordHomeRepositoryId = request.recordHomeRepositoryIds[0];
    if (typeof recordHomeRepositoryId !== "string" || recordHomeRepositoryId.trim().length === 0) {
      return invalid({ path: unitRoot, code: "record-home-missing", message: "The mission record-home repository identity is unavailable." });
    }
    let graphRealPath: string;
    try {
      graphRealPath = await this.fileSystem.realpath(Path.resolve(request.repositoryRoot, graphRelativePath));
    } catch {
      graphRealPath = "";
    }
    const planPath = Path.resolve(request.repositoryRoot, planPathRelative);
    let graphIsLinked = false;
    for (const link of planArtifact.artifact.links) {
      if (link.kind !== "link") continue;
      const linkPath = localArtifactLinkPath(link.url);
      if (linkPath === undefined || graphRealPath.length === 0) continue;
      const target = Path.isAbsolute(linkPath)
        ? Path.resolve(request.repositoryRoot, `.${linkPath}`)
        : Path.resolve(Path.dirname(planPath), linkPath);
      try {
        if (await this.fileSystem.realpath(target) === graphRealPath) graphIsLinked = true;
      } catch {
        continue;
      }
    }
    if (!graphIsLinked) {
      return invalid({ path: planPathRelative, code: "task-graph-link-missing", message: "The canonical plan must link the current tasks-dag.json graph." });
    }
    const pathDiagnostics = await validateTaskGraphPathOperands(
      [{ id: recordHomeRepositoryId, path: request.repositoryRoot }],
      [{ repositoryId: recordHomeRepositoryId, basePath: ".", path: graphRelativePath, pointer: "" }],
      {
        realpath: (path) => this.fileSystem.realpath(path),
        isDirectory: async (path) => (await this.fileSystem.stat(path)).isDirectory(),
      },
    );
    if (pathDiagnostics.length > 0) {
      return invalid(...pathDiagnostics.map((item) => ({ path: graphRelativePath, code: item.code, message: item.message, pointer: item.pointer })));
    }
    let graphSource: string;
    try {
      graphSource = await this.fileSystem.readFile(Path.join(request.repositoryRoot, graphRelativePath));
    } catch {
      return invalid({ path: graphRelativePath, code: "task-graph-unavailable", message: "The canonical task graph cannot be read." });
    }
    const graph = readTaskGraph(graphSource, {
      unitDirectoryId: request.unitId,
      planUnitId,
      planArtifactId: planId,
      executionIdentities: request.executionIdentities,
    });
    if (graph.kind === "invalid") {
      return invalid(...graph.diagnostics.map((item) => ({ path: graphRelativePath, code: item.code, pointer: item.pointer, message: item.message })));
    }
    const graphRef: GraphReference = {
      graph_id: graph.graph.id as GraphReference["graph_id"],
      content_version: `sha256:${createHash("sha256").update(graphSource, "utf8").digest("hex")}`,
    };
    return {
      kind: "valid",
      material: {
        ...packageResult.material,
        graphRef,
        taskIds: graph.graph.tasks.map((task) => task.id).sort(),
        graph: graph.graph,
      },
    };
  }
}

export const createNodeConstructionMaterialReader = (
  fileSystem: RepositoryArtifactFileSystem,
): ConstructionMaterialReader => new NodeConstructionMaterialReader(fileSystem);
