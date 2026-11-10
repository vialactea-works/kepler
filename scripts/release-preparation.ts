import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  parseReleaseVersion,
  deriveReleaseVersion,
  type ReleaseRequest,
} from "./release-version.js";
import {
  listRegularFiles,
  planResourceGeneration,
  type ResourceFileDeletion,
} from "./resource-generation.js";
import { validateResourcePackage } from "../packages/cli/src/cli/release-resources.js";
import {
  sha256Digest,
  type ContentDigest,
} from "../packages/cli/src/cli/installation-record.js";

export interface ReleaseCheckResult {
  readonly version: string;
  readonly schemaVersion: number;
  readonly resourceDigest: ContentDigest;
  readonly staleFiles: readonly string[];
}

export interface ReleasePreparationResult {
  readonly version: string;
  readonly changedFiles: readonly string[];
}

interface PendingWrite {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly expectedDigest: ContentDigest | null;
}

export class ReleasePreparationError extends Error {
  constructor(message: string, readonly changedFiles: readonly string[]) {
    super(message);
    this.name = "ReleasePreparationError";
  }
}

export function prepareRelease(
  repositoryRoot: string,
  request: ReleaseRequest,
): ReleasePreparationResult {
  const root = Path.resolve(repositoryRoot);
  const rootPackage = readJsonObject(root, "package.json");
  if (typeof rootPackage.version !== "string") {
    throw new Error("Root package.json must declare the current Kepler release version");
  }
  const targetVersion = deriveReleaseVersion(rootPackage.version, request);
  const writes = new Map<string, PendingWrite>();
  for (const path of ["package.json", "packages/core/package.json", "packages/cli/package.json"]) {
    const manifest = readJsonObject(root, path);
    if (typeof manifest.version !== "string") {
      throw new Error(`Package manifest must declare a release version: ${path}`);
    }
    manifest.version = targetVersion;
    addWrite(writes, root, path, encodeJson(manifest));
  }
  addWrite(
    writes,
    root,
    "src/index.ts",
    replaceSourceVersion(root, "src/index.ts", "VERSION", targetVersion),
  );
  addWrite(
    writes,
    root,
    "packages/cli/src/cli/version.ts",
    replaceSourceVersion(root, "packages/cli/src/cli/version.ts", "CLI_RELEASE", targetVersion),
  );

  const resources = planResourceGeneration(root, targetVersion);
  for (const change of resources.changes) {
    if (writes.has(change.path)) throw new Error(`Release preparation targets a path twice: ${change.path}`);
    writes.set(change.path, {
      path: change.path,
      contents: change.contents,
      expectedDigest: change.expectedDigest,
    });
  }
  const releaseNotePath = `docs/releases/${targetVersion}.md`;
  const releaseNoteState = inspectPath(root, releaseNotePath);
  if (releaseNoteState.kind === "other") {
    throw new Error(`Release note path is not a regular file: ${releaseNotePath}`);
  }
  if (releaseNoteState.kind === "missing") {
    writes.set(releaseNotePath, {
      path: releaseNotePath,
      contents: new TextEncoder().encode(releaseNoteSkeleton(targetVersion)),
      expectedDigest: null,
    });
  }

  const deletions: ResourceFileDeletion[] = [...resources.deletions];
  const pendingWrites = [...writes.values()].filter((write) => {
    const current = inspectPath(root, write.path);
    if (current.kind === "other") {
      throw new Error(`Release preparation target is not a regular file: ${write.path}`);
    }
    return current.kind === "missing" || !sameBytes(current.contents, write.contents);
  });
  preflightChanges(root, pendingWrites, deletions);
  const changedFiles = applyChanges(root, pendingWrites, deletions);
  return { version: targetVersion, changedFiles };
}

export function checkReleaseConsistency(repositoryRoot: string): ReleaseCheckResult {
  const root = Path.resolve(repositoryRoot);
  const rootPackage = readJsonObject(root, "package.json");
  if (typeof rootPackage.version !== "string") {
    throw new Error("Root package.json must declare the current Kepler release version");
  }
  const version = rootPackage.version;
  const release = parseReleaseVersion(version);
  const derivedVersions = [
    ["packages/core/package.json", packageVersion(root, "packages/core/package.json")],
    ["packages/cli/package.json", packageVersion(root, "packages/cli/package.json")],
    ["src/index.ts", sourceVersion(root, "src/index.ts", "VERSION")],
    ["packages/cli/src/cli/version.ts", sourceVersion(root, "packages/cli/src/cli/version.ts", "CLI_RELEASE")],
  ] as const;
  const mismatches: string[] = [];
  for (const [path, derived] of derivedVersions) {
    if (derived !== version) mismatches.push(`${path}=${derived}`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Derived Kepler release metadata does not match root package version ${version}: ${mismatches.join(", ")}`,
    );
  }

  const schemaVersion = readSchemaVersion(root);
  if (release.major !== 3 || schemaVersion !== 3) {
    throw new Error(
      `No tested compatibility evidence for Kepler release major ${release.major} with Construction schema ${schemaVersion}; only Kepler 3.x with schema 3 is currently supported`,
    );
  }
  const releaseNote = inspectPath(root, `docs/releases/${version}.md`);
  if (releaseNote.kind !== "file") {
    throw new Error(`Release note is missing or is not a regular file: docs/releases/${version}.md`);
  }

  const bundleRoot = Path.join(root, "bundle");
  const bundleFiles = listRegularFiles(bundleRoot, "");
  const manifestContents = bundleFiles.get("manifest.json");
  if (!manifestContents) throw new Error("Resource manifest is missing: bundle/manifest.json");
  const packageContents: { readonly path: string; readonly contents: Uint8Array }[] = [];
  for (const [path, contents] of bundleFiles) {
    if (path !== "manifest.json") packageContents.push({ path, contents });
  }
  const resourcePackage = validateResourcePackage(
    {
      manifest: new TextDecoder().decode(manifestContents),
      files: packageContents,
    },
    version,
  );
  const resources = planResourceGeneration(root, version);
  const staleFiles = [
    ...resources.changes.map((change) => change.path),
    ...resources.deletions.map((deletion) => deletion.path),
  ].sort(compareStrings);
  return {
    version,
    schemaVersion,
    resourceDigest: resourcePackage.manifest.resource_digest,
    staleFiles,
  };
}

function replaceSourceVersion(
  root: string,
  relativePath: string,
  exportName: "VERSION" | "CLI_RELEASE",
  version: string,
): Uint8Array {
  const path = Path.join(root, relativePath);
  const original = Fs.readFileSync(path, "utf8");
  const expression = sourceVersionExpression(exportName);
  const matches = [...original.matchAll(expression)];
  if (matches.length !== 1) {
    throw new Error(`Expected one ${exportName} release constant in ${relativePath}`);
  }
  const updated = original.replace(expression, (_line, prefix: string, _previous: string, suffix: string) => `${prefix}${version}${suffix}`);
  return new TextEncoder().encode(updated);
}

function addWrite(
  writes: Map<string, PendingWrite>,
  root: string,
  relativePath: string,
  contents: Uint8Array,
): void {
  if (writes.has(relativePath)) throw new Error(`Release preparation targets a path twice: ${relativePath}`);
  const current = inspectPath(root, relativePath);
  writes.set(relativePath, {
    path: relativePath,
    contents,
    expectedDigest: current.kind === "file" ? sha256Digest(current.contents) : null,
  });
}

function preflightChanges(
  root: string,
  writes: readonly PendingWrite[],
  deletions: readonly ResourceFileDeletion[],
): void {
  for (const write of writes) {
    const current = inspectPath(root, write.path);
    const actualDigest = current.kind === "file" ? sha256Digest(current.contents) : null;
    if (current.kind === "other" || actualDigest !== write.expectedDigest) {
      throw new Error(`Release preparation input changed before writing: ${write.path}`);
    }
  }
  for (const deletion of deletions) {
    const current = inspectPath(root, deletion.path);
    if (current.kind !== "file" || sha256Digest(current.contents) !== deletion.expectedDigest) {
      throw new Error(`Release preparation input changed before deleting: ${deletion.path}`);
    }
  }
}

function applyChanges(
  root: string,
  writes: readonly PendingWrite[],
  deletions: readonly ResourceFileDeletion[],
): string[] {
  const orderedWrites = [...writes].sort((left, right) =>
    writeRank(left.path) - writeRank(right.path) || compareStrings(left.path, right.path),
  );
  const changedFiles: string[] = [];
  try {
    for (const write of orderedWrites) {
      if (write.path === "package.json") continue;
      if (sameCurrentDigest(root, write.path, write.expectedDigest) === false) {
        throw new Error(`Release preparation input changed before writing: ${write.path}`);
      }
      atomicWrite(root, write);
      changedFiles.push(write.path);
    }
    for (const deletion of deletions) {
      const current = inspectPath(root, deletion.path);
      if (current.kind !== "file" || sha256Digest(current.contents) !== deletion.expectedDigest) {
        throw new Error(`Release preparation input changed before deleting: ${deletion.path}`);
      }
      Fs.unlinkSync(Path.join(root, deletion.path));
      changedFiles.push(deletion.path);
    }
    const rootPackageWrite = orderedWrites.find((write) => write.path === "package.json");
    if (rootPackageWrite) {
      if (sameCurrentDigest(root, rootPackageWrite.path, rootPackageWrite.expectedDigest) === false) {
        throw new Error("Root package.json changed before the release version commit point");
      }
      atomicWrite(root, rootPackageWrite);
      changedFiles.push(rootPackageWrite.path);
    }
  } catch (error) {
    throw new ReleasePreparationError(
      `Release preparation failed after changing: ${changedFiles.join(", ") || "no files"}: ${String(error)}`,
      changedFiles,
    );
  }
  return changedFiles.sort(compareStrings);
}

function atomicWrite(root: string, write: PendingWrite): void {
  const target = Path.join(root, write.path);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  const state = inspectPath(root, write.path);
  const mode = state.kind === "file" ? Fs.statSync(target).mode & 0o777 : 0o644;
  const temporary = `${target}.kepler-release-${process.pid}-${randomUUID()}`;
  let created = false;
  try {
    Fs.writeFileSync(temporary, write.contents, { flag: "wx", mode });
    created = true;
    Fs.renameSync(temporary, target);
  } catch (error) {
    if (created) {
      try {
        Fs.unlinkSync(temporary);
      } catch {
        throw new Error(`Release preparation failed and could not remove owned temporary file ${temporary}: ${String(error)}`);
      }
    }
    throw error;
  }
}

function sameCurrentDigest(
  root: string,
  relativePath: string,
  expectedDigest: ContentDigest | null,
): boolean {
  const current = inspectPath(root, relativePath);
  return current.kind === "file"
    ? sha256Digest(current.contents) === expectedDigest
    : current.kind === "missing" && expectedDigest === null;
}

function inspectPath(
  root: string,
  relativePath: string,
): { readonly kind: "missing" } | { readonly kind: "file"; readonly contents: Uint8Array } | { readonly kind: "other" } {
  const path = Path.join(root, relativePath);
  try {
    const stat = Fs.lstatSync(path);
    if (stat.isFile() && !stat.isSymbolicLink()) {
      return { kind: "file", contents: Fs.readFileSync(path) };
    }
    return { kind: "other" };
  } catch (error) {
    if (isMissingPath(error)) return { kind: "missing" };
    throw error;
  }
}

function readJsonObject(root: string, relativePath: string): Record<string, unknown> {
  const contents = Fs.readFileSync(Path.join(root, relativePath), "utf8");
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${String(error)}`);
  }
  if (!isRecord(value)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeRank(path: string): number {
  if (path === "package.json") return 2;
  if (path === "bundle/manifest.json") return 1;
  return 0;
}

function packageVersion(root: string, relativePath: string): string {
  const manifest = readJsonObject(root, relativePath);
  if (typeof manifest.version !== "string") throw new Error(`Package manifest has no version: ${relativePath}`);
  return manifest.version;
}

function sourceVersion(root: string, relativePath: string, exportName: "VERSION" | "CLI_RELEASE"): string {
  const source = Fs.readFileSync(Path.join(root, relativePath), "utf8");
  const match = sourceVersionExpression(exportName).exec(source);
  if (!match?.[2]) throw new Error(`Could not read ${exportName} from ${relativePath}`);
  return match[2];
}

function sourceVersionExpression(exportName: "VERSION" | "CLI_RELEASE"): RegExp {
  if (exportName === "VERSION") return /^(export const VERSION = ")([^"]+)(";?)$/gm;
  return /^(export const CLI_RELEASE = ")([^"]+)(";?)$/gm;
}

function readSchemaVersion(root: string): number {
  const source = Fs.readFileSync(Path.join(root, "packages/core/src/artifact.ts"), "utf8");
  const match = /^export const CONSTRUCTION_SCHEMA_VERSION = (\d+)(?: as const)?;$/m.exec(source);
  if (!match?.[1]) throw new Error("Could not read CONSTRUCTION_SCHEMA_VERSION from packages/core/src/artifact.ts");
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version)) throw new Error("Construction schema version must be a safe integer");
  return version;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function releaseNoteSkeleton(version: string): string {
  return [
    `# Kepler ${version}`,
    "",
    "## Added",
    "",
    "## Changed",
    "",
    "## Fixed",
    "",
    "## Compatibility",
    "",
    "## Verification",
    "",
  ].join("\n");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
