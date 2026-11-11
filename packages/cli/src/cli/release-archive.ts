import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  buildIdentityDigest,
  parseBuildIdentity,
  readEmbeddedBuildIdentity,
  type RuntimeBuildIdentity,
} from "./build-identity.js";
import {
  parseMetadataJsonObject,
  sha256Digest,
  type ContentDigest,
} from "./installation-record.js";
import {
  validateResourcePackage,
  type ResourcePackageSnapshot,
  type ValidatedResourcePackage,
} from "./release-resources.js";

export type ReleaseTarget = RuntimeBuildIdentity["target"];

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
];

export interface TargetArchiveFile {
  readonly digest: ContentDigest;
  readonly executable: boolean;
}

export interface TargetArchiveManifest {
  readonly format_version: 1;
  readonly kepler_release: string;
  readonly source: RuntimeBuildIdentity["source"];
  readonly target: ReleaseTarget;
  readonly resource_digest: ContentDigest;
  readonly build_identity_digest: ContentDigest;
  readonly files: Readonly<Record<string, TargetArchiveFile>>;
}

export interface TargetPackageFile {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly executable?: boolean;
}

export interface TargetArchiveValidationOptions {
  readonly expectedVersion?: string;
  readonly expectedTarget?: ReleaseTarget;
  readonly expectedSource?: RuntimeBuildIdentity["source"];
  readonly expectedIdentity?: RuntimeBuildIdentity;
}

export type TargetPackageRootModePolicy = "archive" | "installed" | "runtime";

export interface TargetPackageRootValidationOptions extends TargetArchiveValidationOptions {
  readonly modePolicy?: TargetPackageRootModePolicy;
}

export interface ValidatedTargetPackage {
  readonly manifest: TargetArchiveManifest;
  readonly identity: RuntimeBuildIdentity;
  readonly files: readonly TargetPackageFile[];
}

export interface ValidatedTargetArchive extends ValidatedTargetPackage {
  readonly archiveDigest: ContentDigest;
  readonly archiveBytes: number;
}

export class ReleaseArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseArchiveError";
  }
}

const archiveManifestPath = "release-manifest.json";
const executablePath = "bin/kepler";
const maxCompressedBytes = 512 * 1024 * 1024;
const maxExpandedBytes = 1024 * 1024 * 1024;
const maxArchiveFiles = 20_000;
const tarBlockSize = 512;
const targetSet = new Set(RELEASE_TARGETS.map(targetKey));

export function parseReleaseTarget(value: string): ReleaseTarget {
  const [os, arch, ...extra] = value.split("-");
  if (
    extra.length === 0 &&
    (os === "linux" || os === "darwin") &&
    (arch === "x64" || arch === "arm64")
  ) {
    const target = { os, arch } as const;
    if (targetSet.has(targetKey(target))) return target;
  }
  throw new ReleaseArchiveError(`Unsupported release target: ${value}`);
}

export function releaseTargetName(target: ReleaseTarget): string {
  if (!targetSet.has(targetKey(target))) {
    throw new ReleaseArchiveError(`Unsupported release target: ${target.os}/${target.arch}`);
  }
  return `${target.os}-${target.arch}`;
}

export function targetArchiveName(version: string, target: ReleaseTarget): string {
  assertStableVersion(version);
  return `kepler-${version}-${releaseTargetName(target)}.tar.gz`;
}

export function expectedTargetArchiveNames(version: string): readonly string[] {
  assertStableVersion(version);
  return RELEASE_TARGETS.map((target) => targetArchiveName(version, target));
}

export function createTargetPackage(
  input: {
    readonly executable: Uint8Array;
    readonly resources: ResourcePackageSnapshot | ValidatedResourcePackage;
    readonly identity?: RuntimeBuildIdentity;
    readonly expectedVersion?: string;
    readonly expectedTarget?: ReleaseTarget;
    readonly expectedSource?: RuntimeBuildIdentity["source"];
  },
): ValidatedTargetPackage {
  if (!(input.executable instanceof Uint8Array) || input.executable.byteLength === 0) {
    throw new ReleaseArchiveError("Target package executable is empty");
  }
  const identity = readEmbeddedBuildIdentity(input.executable);
  if (input.identity !== undefined && !sameJson(identity, parseBuildIdentity(JSON.stringify(input.identity)))) {
    throw new ReleaseArchiveError("Target package identity assertion does not match embedded executable metadata");
  }
  const validatedResources = validateResources(input.resources, identity.kepler_release);
  const files: TargetPackageFile[] = [
    { path: executablePath, contents: input.executable, executable: true },
    {
      path: "bundle/manifest.json",
      contents: new TextEncoder().encode(`${JSON.stringify(validatedResources.manifest, null, 2)}\n`),
    },
    ...validatedResources.files.map((file) => ({
      path: `bundle/${file.path}`,
      contents: file.contents,
    })),
  ];
  const packageDescriptor = validatedResources.files.find((file) => file.path === "pi-package.json");
  if (!packageDescriptor) throw new ReleaseArchiveError("Resource package metadata is missing");
  files.push({ path: "package.json", contents: packageDescriptor.contents });
  const manifest = createTargetArchiveManifest(identity, files);
  const allFiles = [
    ...files,
    {
      path: archiveManifestPath,
      contents: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
    },
  ];
  return validateTargetPackageFiles(allFiles, {
    ...input,
    expectedIdentity: identity,
  });
}

export function createTargetArchive(
  input: {
    readonly executable: Uint8Array;
    readonly resources: ResourcePackageSnapshot | ValidatedResourcePackage;
    readonly identity?: RuntimeBuildIdentity;
    readonly expectedVersion?: string;
    readonly expectedTarget?: ReleaseTarget;
    readonly expectedSource?: RuntimeBuildIdentity["source"];
  },
): { readonly archive: Uint8Array; readonly package: ValidatedTargetPackage } {
  const package_ = createTargetPackage(input);
  const archive = gzipSync(writeTar(package_.files), { level: 9 });
  const validated = validateTargetArchive(archive, {
    expectedVersion: input.expectedVersion,
    expectedTarget: input.expectedTarget,
    expectedSource: input.expectedSource,
    expectedIdentity: package_.identity,
  });
  return { archive, package: validated };
}

export function validateTargetArchive(
  archive: Uint8Array,
  options: TargetArchiveValidationOptions = {},
): ValidatedTargetArchive {
  if (!(archive instanceof Uint8Array) || archive.byteLength === 0 || archive.byteLength > maxCompressedBytes) {
    throw new ReleaseArchiveError("Target archive is empty or exceeds the compressed-size limit");
  }
  let expanded: Buffer;
  try {
    expanded = gunzipSync(archive, { maxOutputLength: maxExpandedBytes });
  } catch (error) {
    throw new ReleaseArchiveError(`Target archive is not a valid bounded gzip stream: ${errorMessage(error)}`);
  }
  const files = parseTar(expanded);
  const package_ = validateTargetPackageFiles(
    [...files].map(([path, entry]) => ({
      path,
      contents: entry.contents,
      executable: entry.mode === 0o755,
    })),
    options,
    new Map([...files].map(([path, entry]) => [path, entry.mode])),
  );
  return {
    ...package_,
    archiveDigest: sha256Digest(archive),
    archiveBytes: archive.byteLength,
  };
}

export function validateTargetArchiveSet(
  archives: Readonly<Record<string, Uint8Array>> | ReadonlyMap<string, Uint8Array>,
  version: string,
): readonly ValidatedTargetArchive[] {
  const entries = archives instanceof Map ? [...archives.entries()] : Object.entries(archives);
  const expectedNames = [...expectedTargetArchiveNames(version)].sort(compareStrings);
  const actualNames = entries.map(([name]) => name).sort(compareStrings);
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new ReleaseArchiveError(
      `Release must contain exactly the four supported target archives: ${actualNames.join(", ")}`,
    );
  }
  const byName = new Map(entries);
  const validated = RELEASE_TARGETS.map((target) => {
    const name = targetArchiveName(version, target);
    const archive = byName.get(name);
    if (!archive) throw new ReleaseArchiveError(`Target archive is missing: ${name}`);
    return validateTargetArchive(archive, { expectedVersion: version, expectedTarget: target });
  });
  const reference = validated[0];
  if (validated.some(({ manifest }) =>
    manifest.source.kind !== reference?.manifest.source.kind ||
    manifest.source.commit !== reference?.manifest.source.commit ||
    manifest.source.content_digest !== reference?.manifest.source.content_digest
  )) {
    throw new ReleaseArchiveError("All target archives must share one source identity");
  }
  if (validated.some(({ manifest }) => manifest.resource_digest !== reference?.manifest.resource_digest)) {
    throw new ReleaseArchiveError("All target archives must share one resource identity");
  }
  return validated;
}

export function validateTargetPackageRoot(
  packageRoot: string,
  options: TargetPackageRootValidationOptions = {},
): ValidatedTargetPackage {
  const absoluteRoot = Path.resolve(packageRoot);
  let rootStat: Fs.Stats;
  try {
    rootStat = Fs.lstatSync(absoluteRoot);
  } catch (error) {
    throw new ReleaseArchiveError(`Target package root is unavailable: ${errorMessage(error)}`);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new ReleaseArchiveError("Target package root must be a real directory");
  }
  const files: TargetPackageFile[] = [];
  const modes = new Map<string, number>();
  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = Fs.readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = Path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ReleaseArchiveError(`Target package contains a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stat = Fs.lstatSync(absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new ReleaseArchiveError(`Target package contains an unsafe file: ${relativePath}`);
        }
        const descriptor = Fs.openSync(
          absolutePath,
          Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0),
        );
        try {
          const opened = Fs.fstatSync(descriptor);
          if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
            throw new ReleaseArchiveError(`Target package file changed while being inspected: ${relativePath}`);
          }
          files.push({
            path: relativePath,
            contents: Fs.readFileSync(descriptor),
            executable: (opened.mode & 0o111) !== 0,
          });
          modes.set(relativePath, opened.mode & 0o777);
        } finally {
          Fs.closeSync(descriptor);
        }
      } else {
        throw new ReleaseArchiveError(`Target package contains a special file: ${relativePath}`);
      }
    }
  };
  visit(absoluteRoot, "");
  const { modePolicy = "archive", ...identityOptions } = options;
  return validateTargetPackageFiles(files, identityOptions, modes, modePolicy);
}

export function extractTargetArchive(
  archive: Uint8Array,
  destination: string,
  options: TargetArchiveValidationOptions = {},
): ValidatedTargetPackage {
  const validated = validateTargetArchive(archive, options);
  const absoluteDestination = Path.resolve(destination);
  const parent = Path.dirname(absoluteDestination);
  let parentRealPath: string;
  try {
    parentRealPath = Fs.realpathSync(parent);
  } catch (error) {
    throw new ReleaseArchiveError(`Extraction parent must already exist: ${errorMessage(error)}`);
  }
  if (!Fs.statSync(parentRealPath).isDirectory()) {
    throw new ReleaseArchiveError("Extraction parent must be a directory");
  }
  if (Path.resolve(parentRealPath, Path.basename(absoluteDestination)) !== absoluteDestination) {
    throw new ReleaseArchiveError("Extraction destination is not a normalized child of its real parent");
  }
  const temporary = Path.join(parentRealPath, `.${Path.basename(absoluteDestination)}.kepler-${randomUUID()}`);
  let temporaryIdentity: Pick<Fs.Stats, "dev" | "ino"> | undefined;
  let destinationIdentity: Pick<Fs.Stats, "dev" | "ino"> | undefined;
  let destinationModeMayBePublic = false;
  try {
    Fs.mkdirSync(temporary, { mode: 0o700 });
    temporaryIdentity = readOwnedDirectoryIdentity(temporary);
    const stagedDirectories = new Set<string>([temporary]);
    for (const file of validated.files) {
      const stagedPath = Path.join(temporary, ...file.path.split("/"));
      const stagedParent = Path.dirname(stagedPath);
      createDirectories(temporary, stagedParent, 0o700);
      const relativeSegments = file.path.split("/");
      for (let index = 1; index < relativeSegments.length; index += 1) {
        stagedDirectories.add(Path.join(temporary, ...relativeSegments.slice(0, index)));
      }
      writeCanonicalFile(stagedPath, file.contents, file.executable ? 0o755 : 0o644);
    }
    const stagedPackage = validateTargetPackageRoot(temporary, options);
    const relativeDirectories = new Set<string>();
    for (const file of validated.files) {
      const segments = file.path.split("/");
      for (let index = 1; index < segments.length; index += 1) {
        relativeDirectories.add(segments.slice(0, index).join("/"));
      }
    }
    Fs.mkdirSync(absoluteDestination, { mode: 0o700 });
    destinationIdentity = readOwnedDirectoryIdentity(absoluteDestination);
    for (const relativeDirectory of [...relativeDirectories].sort(compareStrings)) {
      createDirectories(absoluteDestination, Path.join(absoluteDestination, ...relativeDirectory.split("/")), 0o700);
    }
    for (const file of validated.files) {
      const stagedPath = Path.join(temporary, ...file.path.split("/"));
      const destinationPath = Path.join(absoluteDestination, ...file.path.split("/"));
      Fs.renameSync(stagedPath, destinationPath);
    }
    const destinationDirectories = [...relativeDirectories]
      .map((relative) => Path.join(absoluteDestination, ...relative.split("/")))
      .sort((left, right) => depth(right) - depth(left) || compareStrings(right, left));
    for (const directory of destinationDirectories) {
      setDirectoryMode(directory, 0o755);
    }
    const destinationPackage = validateTargetPackageRoot(absoluteDestination, options);
    if (!sameJson(destinationPackage.identity, stagedPackage.identity)) {
      throw new ReleaseArchiveError("Validated extraction changed package identity before publication");
    }
    for (const directory of [...stagedDirectories].sort((left, right) => depth(right) - depth(left))) {
      syncDirectory(directory);
    }
    removeOwnedDirectory(temporary, temporaryIdentity);
    temporaryIdentity = undefined;
    destinationModeMayBePublic = true;
    setDirectoryMode(absoluteDestination, 0o755);
    return destinationPackage;
  } catch (error) {
    const cleanupErrors: string[] = [];
    if (destinationIdentity) {
      try {
        if (destinationModeMayBePublic) setDirectoryMode(absoluteDestination, 0o700);
        removeOwnedDirectory(absoluteDestination, destinationIdentity);
      } catch (cleanupError) {
        cleanupErrors.push(`owned destination ${absoluteDestination}: ${errorMessage(cleanupError)}`);
      }
    }
    if (temporaryIdentity) {
      try {
        removeOwnedDirectory(temporary, temporaryIdentity);
      } catch (cleanupError) {
        cleanupErrors.push(`private staging ${temporary}: ${errorMessage(cleanupError)}`);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new ReleaseArchiveError(
        `Archive extraction failed (${errorMessage(error)}); cleanup was incomplete: ${cleanupErrors.join("; ")}`,
      );
    }
    if (isAlreadyExists(error)) {
      throw new ReleaseArchiveError(`Extraction destination already exists: ${absoluteDestination}`);
    }
    if (error instanceof ReleaseArchiveError) throw error;
    throw new ReleaseArchiveError(`Could not safely extract target archive: ${errorMessage(error)}`);
  }
}

export function validateTargetPackageFiles(
  inputFiles: readonly TargetPackageFile[],
  options: TargetArchiveValidationOptions = {},
  archiveModes?: ReadonlyMap<string, number>,
  modePolicy: TargetPackageRootModePolicy = "archive",
): ValidatedTargetPackage {
  const files = new Map<string, TargetPackageFile>();
  for (const input of inputFiles) {
    if (!isNormalizedRelativePath(input.path)) {
      throw new ReleaseArchiveError(`Target package path is not normalized and relative: ${input.path}`);
    }
    if (files.has(input.path)) throw new ReleaseArchiveError(`Duplicate target package file: ${input.path}`);
    files.set(input.path, {
      path: input.path,
      contents: input.contents,
      executable: input.executable === true,
    });
  }
  const manifestFile = files.get(archiveManifestPath);
  if (!manifestFile) throw new ReleaseArchiveError(`Target package is missing ${archiveManifestPath}`);
  const manifest = parseTargetArchiveManifest(new TextDecoder("utf-8", { fatal: true }).decode(manifestFile.contents));
  const inventoryPaths = Object.keys(manifest.files);
  const expectedInventoryPaths = [...inventoryPaths].sort(compareStrings);
  if (inventoryPaths.some((path, index) => path !== expectedInventoryPaths[index])) {
    throw new ReleaseArchiveError("Target archive manifest inventory is not in canonical path order");
  }
  if (files.size !== inventoryPaths.length + 1) {
    throw new ReleaseArchiveError("Target package contains missing or unexpected inventory files");
  }
  for (const [path, file] of files) {
    const entry = manifest.files[path];
    if (path !== archiveManifestPath) {
      if (!entry) throw new ReleaseArchiveError(`Unexpected target package file: ${path}`);
      if (sha256Digest(file.contents) !== entry.digest) {
        throw new ReleaseArchiveError(`Target package checksum mismatch: ${path}`);
      }
      if (file.executable !== entry.executable) {
        throw new ReleaseArchiveError(`Target package executable mode mismatch: ${path}`);
      }
    }
    if (archiveModes && modePolicy !== "runtime") {
      const expectedMode = expectedTargetPackageMode(path, manifest, modePolicy);
      if (archiveModes.get(path) !== expectedMode) {
        const description = modePolicy === "installed" ? "Installed package" : "Target archive";
        throw new ReleaseArchiveError(`${description} mode mismatch: ${path}`);
      }
    }
  }
  if (modePolicy === "runtime") {
    if (!archiveModes) {
      throw new ReleaseArchiveError("Runtime package mode validation requires observed filesystem modes");
    }
    const archiveMismatch = firstTargetPackageModeMismatch(files, manifest, archiveModes, "archive");
    const installedMismatch = firstTargetPackageModeMismatch(files, manifest, archiveModes, "installed");
    if (archiveMismatch !== undefined && installedMismatch !== undefined) {
      throw new ReleaseArchiveError(`Runtime target package mode mismatch: ${archiveMismatch}`);
    }
  }
  const executable = files.get(executablePath);
  if (!executable || !manifest.files[executablePath]?.executable) {
    throw new ReleaseArchiveError("Target package executable is missing or not executable");
  }
  const identity = readEmbeddedBuildIdentity(executable.contents);
  validateTargetIdentity(manifest, identity, options);
  const expectedPackagePaths = expectedResourcePackagePaths(files);
  const actualPackagePaths = [...files.keys()].filter((path) => path.startsWith("bundle/") && path !== "bundle/manifest.json");
  if (
    expectedPackagePaths.length !== actualPackagePaths.length ||
    expectedPackagePaths.some((path, index) => path !== actualPackagePaths.sort(compareStrings)[index])
  ) {
    throw new ReleaseArchiveError("Target package has an incomplete or unexpected resource inventory");
  }
  const resourceManifest = files.get("bundle/manifest.json");
  if (!resourceManifest) throw new ReleaseArchiveError("Target package resource manifest is missing");
  const resources = validateResourcePackage(
    {
      manifest: new TextDecoder("utf-8", { fatal: true }).decode(resourceManifest.contents),
      files: actualPackagePaths.map((path) => ({
        path: path.slice("bundle/".length),
        contents: files.get(path)!.contents,
      })),
    },
    identity.kepler_release,
  );
  if (resources.manifest.resource_digest !== identity.resource_digest || manifest.resource_digest !== identity.resource_digest) {
    throw new ReleaseArchiveError("Target package resource identity does not match the compiled binary");
  }
  const descriptor = files.get("package.json");
  const resourceDescriptor = files.get("bundle/pi-package.json");
  if (!descriptor || !resourceDescriptor || !bytesEqual(descriptor.contents, resourceDescriptor.contents)) {
    throw new ReleaseArchiveError("Target package root descriptor differs from the resource inventory");
  }
  if (manifest.build_identity_digest !== buildIdentityDigest(identity)) {
    throw new ReleaseArchiveError("Target archive build identity digest does not match the compiled binary");
  }
  return {
    manifest,
    identity,
    files: [...files.values()].sort((left, right) => compareStrings(left.path, right.path)),
  };
}

function expectedTargetPackageMode(
  path: string,
  manifest: TargetArchiveManifest,
  modePolicy: "archive" | "installed",
): number {
  const executable = manifest.files[path]?.executable === true;
  if (modePolicy === "installed") return executable ? 0o555 : 0o444;
  return executable ? 0o755 : 0o644;
}

function firstTargetPackageModeMismatch(
  files: ReadonlyMap<string, TargetPackageFile>,
  manifest: TargetArchiveManifest,
  observedModes: ReadonlyMap<string, number>,
  modePolicy: "archive" | "installed",
): string | undefined {
  for (const path of files.keys()) {
    if (observedModes.get(path) !== expectedTargetPackageMode(path, manifest, modePolicy)) return path;
  }
  return undefined;
}

function createTargetArchiveManifest(
  identity: RuntimeBuildIdentity,
  inputFiles: readonly TargetPackageFile[],
): TargetArchiveManifest {
  const fileEntries: Record<string, TargetArchiveFile> = {};
  for (const file of inputFiles) {
    if (!isNormalizedRelativePath(file.path) || file.path === archiveManifestPath) {
      throw new ReleaseArchiveError(`Invalid target archive inventory path: ${file.path}`);
    }
    if (fileEntries[file.path]) throw new ReleaseArchiveError(`Duplicate target archive inventory path: ${file.path}`);
    fileEntries[file.path] = {
      digest: sha256Digest(file.contents),
      executable: file.executable === true,
    };
  }
  const sortedEntries = Object.fromEntries(
    Object.entries(fileEntries).sort(([left], [right]) => compareStrings(left, right)),
  );
  return {
    format_version: 1,
    kepler_release: identity.kepler_release,
    source: identity.source,
    target: identity.target,
    resource_digest: identity.resource_digest,
    build_identity_digest: buildIdentityDigest(identity),
    files: sortedEntries,
  };
}

function parseTargetArchiveManifest(content: string): TargetArchiveManifest {
  let value: Record<string, unknown>;
  try {
    value = parseMetadataJsonObject(content, "target archive manifest");
  } catch (error) {
    throw new ReleaseArchiveError(errorMessage(error));
  }
  assertClosedKeys(value, [
    "format_version",
    "kepler_release",
    "source",
    "target",
    "resource_digest",
    "build_identity_digest",
    "files",
  ], "target archive manifest");
  if (value.format_version !== 1) throw new ReleaseArchiveError("Unsupported target archive manifest format");
  if (typeof value.kepler_release !== "string") throw new ReleaseArchiveError("Target archive release is invalid");
  assertStableVersion(value.kepler_release);
  const source = parseSourceIdentity(value.source);
  const target = parseTarget(value.target);
  if (!isDigest(value.resource_digest) || !isDigest(value.build_identity_digest)) {
    throw new ReleaseArchiveError("Target archive manifest contains an invalid identity digest");
  }
  if (!isRecord(value.files) || Object.keys(value.files).length === 0) {
    throw new ReleaseArchiveError("Target archive manifest has no file inventory");
  }
  const files: Record<string, TargetArchiveFile> = {};
  for (const [path, rawEntry] of Object.entries(value.files)) {
    if (!isNormalizedRelativePath(path)) throw new ReleaseArchiveError(`Target archive path is unsafe: ${path}`);
    if (!isRecord(rawEntry)) throw new ReleaseArchiveError(`Target archive entry is invalid: ${path}`);
    assertClosedKeys(rawEntry, ["digest", "executable"], `target archive entry ${path}`);
    if (!isDigest(rawEntry.digest) || typeof rawEntry.executable !== "boolean") {
      throw new ReleaseArchiveError(`Target archive entry is invalid: ${path}`);
    }
    if (rawEntry.executable !== (path === executablePath)) {
      throw new ReleaseArchiveError(`Target archive executable declaration is invalid: ${path}`);
    }
    files[path] = { digest: rawEntry.digest, executable: rawEntry.executable };
  }
  return {
    format_version: 1,
    kepler_release: value.kepler_release,
    source,
    target,
    resource_digest: value.resource_digest,
    build_identity_digest: value.build_identity_digest,
    files,
  };
}

function validateTargetIdentity(
  manifest: TargetArchiveManifest,
  identity: RuntimeBuildIdentity,
  options: TargetArchiveValidationOptions,
): void {
  if (
    manifest.kepler_release !== identity.kepler_release ||
    !sameJson(manifest.source, identity.source) ||
    !sameJson(manifest.target, identity.target) ||
    manifest.resource_digest !== identity.resource_digest
  ) {
    throw new ReleaseArchiveError("Target archive identity does not match the compiled binary");
  }
  if (options.expectedVersion !== undefined && manifest.kepler_release !== options.expectedVersion) {
    throw new ReleaseArchiveError("Target archive release does not match the expected version");
  }
  if (options.expectedTarget !== undefined && !sameJson(manifest.target, options.expectedTarget)) {
    throw new ReleaseArchiveError("Target archive target does not match the expected target");
  }
  if (options.expectedSource !== undefined && !sameJson(manifest.source, options.expectedSource)) {
    throw new ReleaseArchiveError("Target archive source identity does not match the expected source");
  }
  if (options.expectedIdentity !== undefined && !sameJson(identity, options.expectedIdentity)) {
    throw new ReleaseArchiveError("Target archive compiled identity does not match the expected identity");
  }
}

function validateResources(
  input: ResourcePackageSnapshot | ValidatedResourcePackage,
  expectedVersion: string,
): ValidatedResourcePackage {
  if ("manifest" in input && typeof input.manifest !== "string") {
    return validateResourcePackage({
      manifest: `${JSON.stringify(input.manifest, null, 2)}\n`,
      files: input.files,
    }, expectedVersion);
  }
  return validateResourcePackage(input as ResourcePackageSnapshot, expectedVersion);
}

function expectedResourcePackagePaths(files: ReadonlyMap<string, TargetPackageFile>): string[] {
  const resourceManifest = files.get("bundle/manifest.json");
  if (!resourceManifest) throw new ReleaseArchiveError("Target package resource manifest is missing");
  const manifest = parseMetadataJsonObject(
    new TextDecoder("utf-8", { fatal: true }).decode(resourceManifest.contents),
    "resource manifest",
  );
  if (!isRecord(manifest.files)) throw new ReleaseArchiveError("Resource manifest inventory is invalid");
  return Object.keys(manifest.files).map((path) => `bundle/${path}`).sort(compareStrings);
}

function parseTar(contents: Uint8Array): Map<string, { readonly contents: Uint8Array; readonly mode: number }> {
  if (contents.byteLength > maxExpandedBytes || contents.byteLength < tarBlockSize * 2) {
    throw new ReleaseArchiveError("Expanded target archive has an invalid size");
  }
  const entries = new Map<string, { readonly contents: Uint8Array; readonly mode: number }>();
  let offset = 0;
  let zeroBlocks = 0;
  let totalFileBytes = 0;
  while (offset + tarBlockSize <= contents.byteLength) {
    const header = contents.subarray(offset, offset + tarBlockSize);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += tarBlockSize;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) throw new ReleaseArchiveError("Tar archive has a non-zero header after its end marker");
    if (entries.size >= maxArchiveFiles) throw new ReleaseArchiveError("Target archive contains too many files");
    validateTarChecksum(header);
    const magic = readTarText(header.subarray(257, 263));
    const version = readTarText(header.subarray(263, 265));
    if (magic !== "ustar" || (version !== "00" && version !== "")) {
      throw new ReleaseArchiveError("Target archive must use the supported USTAR format");
    }
    const name = readTarText(header.subarray(0, 100));
    const prefix = readTarText(header.subarray(345, 500));
    const path = prefix ? `${prefix}/${name}` : name;
    if (!isNormalizedRelativePath(path)) throw new ReleaseArchiveError(`Target archive contains an unsafe path: ${path}`);
    const type = header[156];
    if (type !== 0 && type !== 48) {
      throw new ReleaseArchiveError(`Target archive contains a link or non-regular member: ${path}`);
    }
    if (readTarText(header.subarray(157, 257)) !== "") {
      throw new ReleaseArchiveError(`Target archive member has an unsupported link target: ${path}`);
    }
    if (entries.has(path)) throw new ReleaseArchiveError(`Target archive contains a duplicate path: ${path}`);
    const mode = parseTarOctal(header.subarray(100, 108), `mode for ${path}`);
    const size = parseTarOctal(header.subarray(124, 136), `size for ${path}`);
    if (size > maxExpandedBytes || totalFileBytes + size > maxExpandedBytes) {
      throw new ReleaseArchiveError("Target archive exceeds the expanded file-size limit");
    }
    const dataOffset = offset + tarBlockSize;
    const dataEnd = dataOffset + size;
    const paddedEnd = dataOffset + Math.ceil(size / tarBlockSize) * tarBlockSize;
    if (dataEnd > contents.byteLength || paddedEnd > contents.byteLength) {
      throw new ReleaseArchiveError(`Target archive member is truncated: ${path}`);
    }
    if (contents.subarray(dataEnd, paddedEnd).some((byte) => byte !== 0)) {
      throw new ReleaseArchiveError(`Target archive member has non-zero padding: ${path}`);
    }
    entries.set(path, { contents: new Uint8Array(contents.subarray(dataOffset, dataEnd)), mode });
    totalFileBytes += size;
    offset = paddedEnd;
  }
  if (zeroBlocks < 2) throw new ReleaseArchiveError("Tar archive is missing its end markers");
  if (contents.subarray(offset).some((byte) => byte !== 0)) {
    throw new ReleaseArchiveError("Tar archive has non-zero trailing data");
  }
  if (entries.size === 0) throw new ReleaseArchiveError("Target archive contains no files");
  for (const path of entries.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join("/");
      if (entries.has(parent)) throw new ReleaseArchiveError(`Target archive file blocks a directory: ${parent}`);
    }
  }
  return entries;
}

function writeTar(files: readonly TargetPackageFile[]): Uint8Array {
  const blocks: Buffer[] = [];
  for (const file of [...files].sort((left, right) => compareStrings(left.path, right.path))) {
    if (!isNormalizedRelativePath(file.path)) throw new ReleaseArchiveError(`Cannot archive unsafe path: ${file.path}`);
    const name = Buffer.from(file.path, "utf8");
    if (name.byteLength > 100) throw new ReleaseArchiveError(`Target archive path exceeds USTAR name limit: ${file.path}`);
    const header = Buffer.alloc(tarBlockSize);
    name.copy(header, 0);
    writeTarOctal(header, 100, 8, file.executable ? 0o755 : 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, file.contents.byteLength);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = 48;
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    const checksumField = `${checksum.toString(8).padStart(6, "0")}\0 `;
    header.write(checksumField, 148, 8, "ascii");
    blocks.push(header, Buffer.from(file.contents));
    const padding = (tarBlockSize - (file.contents.byteLength % tarBlockSize)) % tarBlockSize;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(tarBlockSize * 2));
  return new Uint8Array(Buffer.concat(blocks));
}

function validateTarChecksum(header: Uint8Array): void {
  const expected = parseTarOctal(header.subarray(148, 156), "header checksum");
  let actual = 0;
  for (let index = 0; index < tarBlockSize; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index] ?? 0;
  }
  if (actual !== expected) throw new ReleaseArchiveError("Target archive has an invalid tar header checksum");
}

function parseTarOctal(field: Uint8Array, description: string): number {
  const text = readTarText(field).trim();
  if (text.length === 0) return 0;
  if (!/^[0-7]+$/.test(text)) throw new ReleaseArchiveError(`Target archive has an invalid ${description}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new ReleaseArchiveError(`Target archive has an invalid ${description}`);
  return value;
}

function writeTarOctal(header: Buffer, offset: number, length: number, value: number): void {
  const encoded = value.toString(8);
  if (encoded.length > length - 1) throw new ReleaseArchiveError("Target archive numeric field exceeds USTAR limits");
  header.write(`${encoded.padStart(length - 1, "0")}\0`, offset, length, "ascii");
}

function readTarText(field: Uint8Array): string {
  const end = field.indexOf(0);
  const bytes = end === -1 ? field : field.subarray(0, end);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ReleaseArchiveError(`Target archive contains invalid UTF-8 header data: ${errorMessage(error)}`);
  }
}

function createDirectories(root: string, destination: string, mode: number): void {
  const relative = Path.relative(root, destination);
  if (relative === "") return;
  if (relative.startsWith(`..${Path.sep}`) || Path.isAbsolute(relative)) {
    throw new ReleaseArchiveError("Archive extraction directory escaped its private root");
  }
  let current = root;
  for (const segment of relative.split(Path.sep)) {
    current = Path.join(current, segment);
    try {
      Fs.mkdirSync(current, { mode });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    setDirectoryMode(current, mode);
  }
}

function writeCanonicalFile(path: string, contents: Uint8Array, mode: number): void {
  const descriptor = Fs.openSync(
    path,
    Fs.constants.O_WRONLY | Fs.constants.O_CREAT | Fs.constants.O_EXCL | noFollowFlag(),
    0o600,
  );
  try {
    const created = Fs.fstatSync(descriptor);
    if (!created.isFile()) throw new ReleaseArchiveError(`Archive extraction path is not a regular file: ${path}`);
    Fs.writeFileSync(descriptor, contents);
    Fs.fchmodSync(descriptor, mode);
    const finalized = Fs.fstatSync(descriptor);
    if (!finalized.isFile() || (finalized.mode & 0o777) !== mode) {
      throw new ReleaseArchiveError(`Could not enforce canonical mode for extracted file: ${path}`);
    }
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
}

function readOwnedDirectoryIdentity(path: string): Pick<Fs.Stats, "dev" | "ino"> {
  const descriptor = openDirectoryDescriptor(path);
  try {
    const stat = Fs.fstatSync(descriptor);
    return { dev: stat.dev, ino: stat.ino };
  } finally {
    Fs.closeSync(descriptor);
  }
}

function openDirectoryDescriptor(path: string): number {
  const before = Fs.lstatSync(path);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new ReleaseArchiveError(`Archive extraction path is not a real directory: ${path}`);
  }
  const descriptor = Fs.openSync(
    path,
    Fs.constants.O_RDONLY | noFollowFlag() | (Fs.constants.O_DIRECTORY ?? 0),
  );
  const opened = Fs.fstatSync(descriptor);
  if (!opened.isDirectory() || opened.dev !== before.dev || opened.ino !== before.ino) {
    Fs.closeSync(descriptor);
    throw new ReleaseArchiveError(`Archive extraction directory changed while being inspected: ${path}`);
  }
  return descriptor;
}

function setDirectoryMode(path: string, mode: number): void {
  const descriptor = openDirectoryDescriptor(path);
  try {
    Fs.fchmodSync(descriptor, mode);
    if ((Fs.fstatSync(descriptor).mode & 0o777) !== mode) {
      throw new ReleaseArchiveError(`Could not enforce canonical directory mode: ${path}`);
    }
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
}

function syncDirectory(path: string): void {
  const descriptor = openDirectoryDescriptor(path);
  try {
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
}

function removeOwnedDirectory(path: string, identity: Pick<Fs.Stats, "dev" | "ino">): void {
  let current: Fs.Stats;
  try {
    current = Fs.lstatSync(path);
  } catch (error) {
    if (isMissingPath(error)) return;
    throw error;
  }
  if (
    !current.isDirectory() || current.isSymbolicLink() ||
    current.dev !== identity.dev || current.ino !== identity.ino
  ) {
    throw new ReleaseArchiveError(`Refusing to remove a directory not owned by this extraction: ${path}`);
  }
  Fs.rmSync(path, { recursive: true, force: false });
}

function depth(path: string): number {
  return path.split(Path.sep).length;
}

function parseSourceIdentity(value: unknown): RuntimeBuildIdentity["source"] {
  if (!isRecord(value)) throw new ReleaseArchiveError("Target archive source identity is invalid");
  assertClosedKeys(value, ["kind", "commit", "content_digest"], "target archive source identity");
  if (
    (value.kind !== "production" && value.kind !== "development") ||
    typeof value.commit !== "string" ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.commit) ||
    !isDigest(value.content_digest)
  ) {
    throw new ReleaseArchiveError("Target archive source identity is invalid");
  }
  return { kind: value.kind, commit: value.commit, content_digest: value.content_digest };
}

function parseTarget(value: unknown): ReleaseTarget {
  if (!isRecord(value)) throw new ReleaseArchiveError("Target archive target is invalid");
  assertClosedKeys(value, ["os", "arch"], "target archive target");
  if (
    (value.os !== "linux" && value.os !== "darwin") ||
    (value.arch !== "x64" && value.arch !== "arm64")
  ) {
    throw new ReleaseArchiveError("Target archive target is unsupported");
  }
  return { os: value.os, arch: value.arch };
}

function isNormalizedRelativePath(value: string): boolean {
  const segments = value.split("/");
  return (
    value.length > 0 &&
    !Path.isAbsolute(value) &&
    !Path.win32.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    !/^[a-zA-Z]:/.test(value) &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function assertStableVersion(value: string): void {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ||
    value.split(".").some((part) => !Number.isSafeInteger(Number(part)))
  ) {
    throw new ReleaseArchiveError(`Invalid stable release version: ${value}`);
  }
}

function assertClosedKeys(value: Record<string, unknown>, expected: readonly string[], description: string): void {
  const actual = Object.keys(value).sort(compareStrings);
  const allowed = [...expected].sort(compareStrings);
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new ReleaseArchiveError(`${description} contains missing or unsupported fields`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDigest(value: unknown): value is ContentDigest {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function targetKey(target: ReleaseTarget): string {
  return `${target.os}-${target.arch}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function noFollowFlag(): number {
  return "O_NOFOLLOW" in Fs.constants ? Fs.constants.O_NOFOLLOW : 0;
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
