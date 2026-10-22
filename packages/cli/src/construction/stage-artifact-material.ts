import { createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { validateConstructionArtifact } from "./artifacts.js";
import type { ArtifactBinding } from "./events.js";

export interface StageArtifactMaterial {
  readonly artifactBindings: readonly ArtifactBinding[];
  readonly artifactPaths: readonly string[];
  readonly unitDirectory: string;
}

export interface StageArtifactMaterialRequest {
  readonly repositoryRoot: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly persistedUnitDirectory: unknown;
  readonly primaryArtifact: string;
  readonly supportFolder: string;
}

export type StageArtifactMaterialResult =
  | { readonly kind: "valid"; readonly material: StageArtifactMaterial }
  | { readonly kind: "invalid"; readonly diagnostics: readonly Readonly<Record<string, unknown>>[] };

const contained = (root: string, path: string): boolean => {
  const relative = Path.relative(root, path);
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

export const readStageArtifactMaterial = async (
  request: StageArtifactMaterialRequest,
): Promise<StageArtifactMaterialResult> => {
  const canonicalDirectory = `construction/units-of-work/${request.unitId}`;
  if (typeof request.persistedUnitDirectory !== "string" || request.persistedUnitDirectory !== canonicalDirectory) {
    return { kind: "invalid", diagnostics: [{ path: request.persistedUnitDirectory, code: "unit-directory-mismatch", expected: canonicalDirectory }] };
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
    });
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
        realTarget = await Fs.realpath(target);
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
    return { kind: "invalid", diagnostics: [{ path: unitDirectory, code: "required-artifact-missing", message: `${request.primaryArtifact} is required.` }] };
  }
  if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
    return { kind: "invalid", diagnostics: [{ path: unitDirectory, code: "duplicate-artifact-id", message: "Stage material contains duplicate artifact identities." }] };
  }
  const sorted = artifacts.sort((left, right) => left.path.localeCompare(right.path));
  return {
    kind: "valid",
    material: {
      unitDirectory,
      artifactBindings: sorted.map((artifact) => ({ artifact_id: artifact.id as ArtifactBinding["artifact_id"], content_version: artifact.contentVersion })),
      artifactPaths: sorted.map((artifact) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(request.repositoryRoot, artifact.path)))),
    },
  };
};
