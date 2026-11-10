import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  parseBuildArtifactIdentity,
  readEmbeddedBuildIdentity,
  type RuntimeBuildIdentity,
} from "../packages/cli/src/cli/build-identity.js";
import {
  createTargetArchive,
  targetArchiveName,
  validateTargetArchive,
  parseReleaseTarget,
  type ReleaseTarget,
} from "../packages/cli/src/cli/release-archive.js";
import { sha256Digest } from "../packages/cli/src/cli/installation-record.js";
import { validateResourcePackage } from "../packages/cli/src/cli/release-resources.js";
import { checkReleaseConsistency } from "./release-preparation.js";
import { listRegularFiles } from "./resource-generation.js";
import { readSourceIdentity } from "./release-identity.js";
import { parseReleaseVersion } from "./release-version.js";

interface PackageArguments {
  readonly binary: string;
  readonly target: ReleaseTarget;
  readonly output: string;
  readonly repositoryRoot: string;
}

export function packageTargetArchive(input: PackageArguments): {
  readonly outputPath: string;
  readonly archiveDigest: string;
  readonly archiveBytes: number;
  readonly identity: RuntimeBuildIdentity;
} {
  const repositoryRoot = Fs.realpathSync(Path.resolve(input.repositoryRoot));
  const binaryPath = Path.resolve(input.binary);
  const binaryStat = Fs.lstatSync(binaryPath);
  if (!binaryStat.isFile() || binaryStat.isSymbolicLink()) {
    throw new Error("Release binary must be a regular file");
  }
  const binaryDescriptor = Fs.openSync(binaryPath, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
  let executable: Uint8Array;
  try {
    const openedBinary = Fs.fstatSync(binaryDescriptor);
    if (!openedBinary.isFile() || openedBinary.dev !== binaryStat.dev || openedBinary.ino !== binaryStat.ino) {
      throw new Error("Release binary changed while being inspected");
    }
    executable = new Uint8Array(Fs.readFileSync(binaryDescriptor));
  } finally {
    Fs.closeSync(binaryDescriptor);
  }
  const identityPath = `${binaryPath}.identity.json`;
  const identityStat = Fs.lstatSync(identityPath);
  if (!identityStat.isFile() || identityStat.isSymbolicLink()) {
    throw new Error("Release build identity record must be a regular file");
  }
  const identityDescriptor = Fs.openSync(identityPath, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
  let identityContent: string;
  try {
    const openedIdentity = Fs.fstatSync(identityDescriptor);
    if (!openedIdentity.isFile() || openedIdentity.dev !== identityStat.dev || openedIdentity.ino !== identityStat.ino) {
      throw new Error("Release build identity record changed while being inspected");
    }
    identityContent = Fs.readFileSync(identityDescriptor, "utf8");
  } finally {
    Fs.closeSync(identityDescriptor);
  }
  const identityRecord = parseBuildArtifactIdentity(identityContent);
  if (sha256Digest(executable) !== identityRecord.binary_digest) {
    throw new Error("Release binary does not match its build identity record");
  }
  const identity = readEmbeddedBuildIdentity(executable);
  if (!sameJson(identity, identityRecord.identity)) {
    throw new Error("Release build identity record does not match embedded executable metadata");
  }
  const rootPackage = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
    readonly version?: unknown;
  };
  if (typeof rootPackage.version !== "string") {
    throw new Error("Root package.json must declare the Kepler release version");
  }
  parseReleaseVersion(rootPackage.version);
  if (
    identity.kepler_release !== rootPackage.version ||
    identity.target.os !== input.target.os ||
    identity.target.arch !== input.target.arch
  ) {
    throw new Error("Release binary identity does not match the root version and requested target");
  }
  const source = readSourceIdentity(repositoryRoot);
  if (
    source.commit !== identity.source.commit ||
    source.content_digest !== identity.source.content_digest ||
    (identity.source.kind === "production" && source.kind !== "production")
  ) {
    throw new Error("Release source changed after the binary was built; refusing stale metadata");
  }
  const releaseCheck = checkReleaseConsistency(repositoryRoot);
  if (releaseCheck.staleFiles.length > 0) {
    throw new Error(`Generated release resources are stale: ${releaseCheck.staleFiles.join(", ")}`);
  }
  const bundleFiles = listRegularFiles(Path.join(repositoryRoot, "bundle"), "");
  const manifestBytes = bundleFiles.get("manifest.json");
  if (!manifestBytes) throw new Error("Resource package manifest is missing");
  const resourcePackage = validateResourcePackage(
    {
      manifest: new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
      files: [...bundleFiles]
        .filter(([path]) => path !== "manifest.json")
        .map(([path, contents]) => ({ path, contents })),
    },
    rootPackage.version,
  );
  if (resourcePackage.manifest.resource_digest !== identity.resource_digest) {
    throw new Error("Current resource package does not match the compiled binary identity");
  }
  const archivePackage = createTargetArchive({
    executable,
    resources: resourcePackage,
    identity,
    expectedVersion: rootPackage.version,
    expectedTarget: input.target,
    expectedSource: source,
  });
  const requestedOutputPath = Path.resolve(input.output);
  const expectedName = targetArchiveName(rootPackage.version, input.target);
  if (Path.basename(requestedOutputPath) !== expectedName) {
    throw new Error(`Target archive output must be named ${expectedName}`);
  }
  if (isWithin(repositoryRoot, requestedOutputPath)) {
    throw new Error("Release archive outputs must be outside the source checkout");
  }
  try {
    Fs.lstatSync(requestedOutputPath);
    throw new Error(`Refusing to replace an existing target archive: ${requestedOutputPath}`);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  const physicalOutputPath = resolvePhysicalPath(requestedOutputPath);
  if (isWithin(repositoryRoot, physicalOutputPath)) {
    throw new Error("Release archive outputs must resolve outside the source checkout");
  }
  Fs.mkdirSync(Path.dirname(requestedOutputPath), { recursive: true });
  const outputPath = Path.join(Fs.realpathSync(Path.dirname(requestedOutputPath)), expectedName);
  if (outputPath !== physicalOutputPath || isWithin(repositoryRoot, outputPath)) {
    throw new Error("Release archive output parent changed while it was being prepared");
  }
  const currentSource = readSourceIdentity(repositoryRoot);
  const currentReleaseCheck = checkReleaseConsistency(repositoryRoot);
  if (
    JSON.stringify(currentSource) !== JSON.stringify(source) ||
    currentReleaseCheck.staleFiles.length > 0 ||
    currentReleaseCheck.resourceDigest !== resourcePackage.manifest.resource_digest
  ) {
    throw new Error("Release inputs changed while the target archive was being assembled");
  }

  const temporaryPath = Path.join(Path.dirname(outputPath), `.${expectedName}.${randomUUID()}.tmp`);
  const descriptor = Fs.openSync(
    temporaryPath,
    Fs.constants.O_WRONLY | Fs.constants.O_CREAT | Fs.constants.O_EXCL | (Fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    Fs.writeFileSync(descriptor, archivePackage.archive);
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
  try {
    Fs.chmodSync(temporaryPath, 0o644);
    Fs.linkSync(temporaryPath, outputPath);
    Fs.unlinkSync(temporaryPath);
  } catch (error) {
    try {
      Fs.unlinkSync(temporaryPath);
    } catch {
      throw new Error(`Could not finalize target archive; temporary output remains at ${temporaryPath}: ${String(error)}`);
    }
    throw error;
  }
  const outputStat = Fs.lstatSync(outputPath);
  if (!outputStat.isFile() || outputStat.isSymbolicLink()) {
    throw new Error(`Final target archive is not a regular file: ${outputPath}`);
  }
  const outputDescriptor = Fs.openSync(outputPath, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
  let writtenArchive: Uint8Array;
  try {
    const openedOutput = Fs.fstatSync(outputDescriptor);
    if (!openedOutput.isFile() || openedOutput.dev !== outputStat.dev || openedOutput.ino !== outputStat.ino) {
      throw new Error(`Final target archive changed while being inspected: ${outputPath}`);
    }
    writtenArchive = new Uint8Array(Fs.readFileSync(outputDescriptor));
  } finally {
    Fs.closeSync(outputDescriptor);
  }
  const validatedOutput = validateTargetArchive(writtenArchive, {
    expectedVersion: identity.kepler_release,
    expectedTarget: identity.target,
    expectedSource: identity.source,
    expectedIdentity: identity,
  });
  return {
    outputPath,
    archiveDigest: validatedOutput.archiveDigest,
    archiveBytes: validatedOutput.archiveBytes,
    identity,
  };
}

function parseArguments(arguments_: readonly string[]): PackageArguments {
  const values = new Map<string, string>();
  if (arguments_.length % 2 !== 0) throw new Error("Expected --name value pairs");
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) {
      throw new Error(`Invalid or duplicate argument: ${String(key)}`);
    }
    values.set(key, value);
  }
  const expected = new Set(["--binary", "--target", "--output", "--repository-root"]);
  const unknown = [...values.keys()].find((key) => !expected.has(key));
  if (unknown) throw new Error(`Unknown archive argument: ${unknown}`);
  const binary = values.get("--binary");
  const targetValue = values.get("--target");
  const output = values.get("--output");
  if (!binary || !targetValue || !output) {
    throw new Error("Usage: package-target-archive --binary <path> --target <target> --output <archive>");
  }
  return {
    binary,
    target: parseReleaseTarget(targetValue),
    output,
    repositoryRoot: Path.resolve(values.get("--repository-root") ?? Path.resolve(import.meta.dir, "..")),
  };
}

function isWithin(root: string, candidate: string): boolean {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolvePhysicalPath(candidate: string): string {
  let cursor = Path.resolve(candidate);
  const remaining: string[] = [];
  while (true) {
    try {
      return Path.join(Fs.realpathSync(cursor), ...remaining);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = Path.dirname(cursor);
      if (parent === cursor) throw new Error(`Could not resolve output path: ${candidate}`);
      remaining.unshift(Path.basename(cursor));
      cursor = parent;
    }
  }
}

if (import.meta.main) {
  try {
    const result = packageTargetArchive(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
