import { createHash } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  createResourceManifest,
  validateResourcePackage,
} from "../packages/cli/src/cli/release-resources.js";
import type { ContentDigest } from "../packages/cli/src/cli/installation-record.js";

const skillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
] as const;

export interface ResourceFileChange {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly expectedDigest: ContentDigest | null;
}

export interface ResourceFileDeletion {
  readonly path: string;
  readonly expectedDigest: ContentDigest;
}

export interface ResourceGenerationPlan {
  readonly manifest: ReturnType<typeof createResourceManifest>;
  readonly changes: readonly ResourceFileChange[];
  readonly deletions: readonly ResourceFileDeletion[];
  readonly resourceDigest: ContentDigest;
}

export function planResourceGeneration(
  repositoryRoot: string,
  releaseVersion: string,
): ResourceGenerationPlan {
  const root = Path.resolve(repositoryRoot);
  const sourceSkillFiles = new Map<string, Uint8Array>();
  const allowedSkillIds = new Set<string>(skillIds);
  for (const skillId of skillIds) {
    const sourceRoot = Path.join(root, "skills", skillId);
    const sourceFiles = listRegularFiles(sourceRoot, `skills/${skillId}`);
    if (!sourceFiles.has(`skills/${skillId}/SKILL.md`)) {
      throw new Error(`Required skill source is missing: ${sourceRoot}/SKILL.md`);
    }
    for (const [path, contents] of sourceFiles) sourceSkillFiles.set(path, contents);
  }

  const bundleRoot = Path.join(root, "bundle");
  const existingBundleFiles = listRegularFiles(bundleRoot, "");
  const resourceFiles = new Map<string, Uint8Array>();
  for (const [path, contents] of existingBundleFiles) {
    if (
      path === "manifest.json" ||
      path === "pi-package.json" ||
      path.startsWith("skills/")
    ) continue;
    resourceFiles.set(path, contents);
  }
  for (const [path, contents] of sourceSkillFiles) resourceFiles.set(path, contents);

  const descriptor = {
    name: "kepler-resources",
    version: releaseVersion,
    private: true,
    type: "module",
    pi: {
      skills: ["./bundle/skills"],
      subagents: { agents: ["./bundle/agents/pi/v1"] },
    },
  };
  const descriptorContents = new TextEncoder().encode(`${JSON.stringify(descriptor, null, 2)}\n`);
  resourceFiles.set("pi-package.json", descriptorContents);
  const manifest = createResourceManifest(
    releaseVersion,
    [...resourceFiles].map(([path, contents]) => ({ path, contents })),
  );
  const manifestContents = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const snapshot = {
    manifest: new TextDecoder().decode(manifestContents),
    files: [...resourceFiles].map(([path, contents]) => ({ path, contents })),
  };
  validateResourcePackage(snapshot, releaseVersion);

  const targetFiles = new Map(resourceFiles);
  targetFiles.set("manifest.json", manifestContents);
  const changes: ResourceFileChange[] = [];
  for (const [path, contents] of [...targetFiles].sort(([left], [right]) => compareStrings(left, right))) {
    const absolutePath = Path.join(bundleRoot, ...path.split("/"));
    const prior = readOptionalRegularFile(absolutePath, path);
    if (prior && Buffer.compare(Buffer.from(prior), Buffer.from(contents)) === 0) continue;
    changes.push({
      path: Path.join("bundle", ...path.split("/")),
      contents,
      expectedDigest: prior ? digest(prior) : null,
    });
  }

  const deletions: ResourceFileDeletion[] = [];
  for (const [path, contents] of existingBundleFiles) {
    if (!path.startsWith("skills/")) continue;
    const [, skillId] = path.split("/");
    if (!skillId || !allowedSkillIds.has(skillId)) {
      throw new Error(`Unexpected bundled skill resource cannot be adopted: ${path}`);
    }
    if (!sourceSkillFiles.has(path)) {
      deletions.push({ path: Path.join("bundle", ...path.split("/")), expectedDigest: digest(contents) });
    }
  }

  return {
    manifest,
    changes,
    deletions,
    resourceDigest: manifest.resource_digest,
  };
}

export function listRegularFiles(directory: string, relativeRoot: string): Map<string, Uint8Array> {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(directory);
  } catch (error) {
    throw new Error(`Required resource directory is unavailable: ${directory}: ${String(error)}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Resource root must be a real directory: ${directory}`);
  }
  const output = new Map<string, Uint8Array>();
  const visit = (current: string, relativeDirectory: string): void => {
    const entries = Fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = Path.join(current, entry.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`Resource files must not be symlinks: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        output.set(relativePath, Fs.readFileSync(absolutePath));
      } else {
        throw new Error(`Resource files must be regular files: ${absolutePath}`);
      }
    }
  };
  visit(directory, relativeRoot);
  return output;
}

function readOptionalRegularFile(path: string, relativePath: string): Uint8Array | undefined {
  try {
    const stat = Fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Generated resource target is not a regular file: ${relativePath}`);
    }
    return Fs.readFileSync(path);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

function digest(contents: Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
