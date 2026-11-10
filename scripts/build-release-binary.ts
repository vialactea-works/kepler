import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  encodeBuildIdentityMarker,
  parseBuildIdentity,
  readEmbeddedBuildIdentity,
  type BuildArtifactIdentityRecord,
  type RuntimeBuildIdentity,
} from "../packages/cli/src/cli/build-identity.js";
import {
  sha256Digest,
  type ContentDigest,
} from "../packages/cli/src/cli/installation-record.js";
import {
  parseReleaseTarget,
  type ReleaseTarget,
} from "../packages/cli/src/cli/release-archive.js";
import {
  validateResourcePackage,
  type ResourcePackageSnapshot,
} from "../packages/cli/src/cli/release-resources.js";
import {
  createDevelopmentSourceIdentity,
  readSourceIdentity,
  readSourceSnapshot,
  type SourceIdentity,
} from "./release-identity.js";
import { parseReleaseVersion } from "./release-version.js";
import { parseMetadataJsonObject } from "../packages/cli/src/cli/installation-record.js";

const externalModules = [
  "class-transformer",
  "class-validator",
  "@nestjs/platform-express",
  "@nestjs/microservices",
  "@nestjs/websockets",
];
const compiledIdentityDeclaration =
  "const COMPILED_BUILD_IDENTITY_MARKER: string | undefined = undefined;";

export interface BuildReleaseBinaryOptions {
  readonly repositoryRoot: string;
  readonly target: ReleaseTarget;
  readonly outputPath: string;
  readonly requireClean?: boolean;
  readonly identityKind?: "development";
  readonly compile?: (input: {
    readonly executable: string;
    readonly arguments: readonly string[];
    readonly environment: NodeJS.ProcessEnv;
    readonly cwd: string;
  }) => void;
}

export interface BuildReleaseBinaryResult {
  readonly outputPath: string;
  readonly identityPath: string;
  readonly identity: RuntimeBuildIdentity;
}

export interface FrozenDependencySnapshot {
  readonly digest: ContentDigest;
  readonly entries: number;
}

export function snapshotFrozenDependencies(snapshotRoot: string): FrozenDependencySnapshot {
  const root = Fs.realpathSync(Path.resolve(snapshotRoot));
  const entries: Array<Record<string, string | number>> = [];
  const nodeModulesRoots = [
    Path.join(root, "node_modules"),
    Path.join(root, "packages", "cli", "node_modules"),
    Path.join(root, "packages", "core", "node_modules"),
  ];
  const visit = (directory: string, relativeDirectory: string): void => {
    const children = Fs.readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => compareStrings(left.name, right.name),
    );
    for (const child of children) {
      const path = Path.join(directory, child.name);
      const relativePath = `${relativeDirectory}/${child.name}`;
      const stat = Fs.lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = Fs.realpathSync(path);
        if (!isWithin(root, target)) {
          throw new Error(`Frozen dependency symlink escapes its owned snapshot: ${relativePath}`);
        }
        entries.push({
          path: relativePath,
          kind: "symlink",
          target: Path.relative(root, target).split(Path.sep).join("/"),
          link: Fs.readlinkSync(path),
        });
      } else if (stat.isDirectory()) {
        entries.push({ path: relativePath, kind: "directory", mode: stat.mode & 0o777 });
        visit(path, relativePath);
      } else if (stat.isFile()) {
        if (stat.nlink !== 1) {
          throw new Error(`Frozen dependency file is shared by a hard link: ${relativePath}`);
        }
        const descriptor = Fs.openSync(path, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
        let contents: Buffer;
        try {
          const opened = Fs.fstatSync(descriptor);
          if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.nlink !== 1) {
            throw new Error(`Frozen dependency changed while being inspected: ${relativePath}`);
          }
          contents = Fs.readFileSync(descriptor);
        } finally {
          Fs.closeSync(descriptor);
        }
        entries.push({
          path: relativePath,
          kind: "file",
          mode: stat.mode & 0o777,
          size: stat.size,
          digest: sha256Digest(contents),
        });
      } else {
        throw new Error(`Frozen dependency contains a special file: ${relativePath}`);
      }
    }
  };
  let foundRoot = false;
  for (const nodeModulesRoot of nodeModulesRoots) {
    let stat: Fs.Stats;
    try {
      stat = Fs.lstatSync(nodeModulesRoot);
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Frozen dependency root must be a real directory: ${nodeModulesRoot}`);
    }
    foundRoot = true;
    const relativeRoot = Path.relative(root, nodeModulesRoot).split(Path.sep).join("/");
    entries.push({ path: relativeRoot, kind: "directory", mode: stat.mode & 0o777 });
    visit(nodeModulesRoot, relativeRoot);
  }
  if (!foundRoot || entries.length === 0) {
    throw new Error("Frozen build snapshot has no installed dependency closure");
  }
  return { digest: sha256Digest(JSON.stringify(entries)), entries: entries.length };
}

export function buildReleaseBinary(
  options: BuildReleaseBinaryOptions,
): BuildReleaseBinaryResult {
  const repositoryRoot = Fs.realpathSync(Path.resolve(options.repositoryRoot));
  const sourceSnapshot = readSourceSnapshot(repositoryRoot);
  const rootPackage = parseMetadataJsonObject(
    Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8"),
    "root package manifest",
  );
  if (typeof rootPackage.version !== "string") {
    throw new Error("Root package.json must declare the Kepler release version");
  }
  const release = rootPackage.version;
  parseReleaseVersion(release);
  if (options.requireClean && sourceSnapshot.identity.kind !== "production") {
    throw new Error("A production binary requires a clean frozen source checkout");
  }
  if (options.requireClean && options.identityKind === "development") {
    throw new Error("A production binary cannot use a development identity");
  }
  const sourceIdentity = options.identityKind === "development"
    ? createDevelopmentSourceIdentity(sourceSnapshot.identity)
    : sourceSnapshot.identity;
  const bundleRoot = Path.join(repositoryRoot, "bundle");
  const resourcePackage = validateResourcePackage(
    readResourcePackageSnapshot(bundleRoot),
    release,
  );
  const identity: RuntimeBuildIdentity = {
    format_version: 1,
    kepler_release: release,
    source: sourceIdentity,
    target: options.target,
    resource_digest: resourcePackage.manifest.resource_digest,
  };
  const requestedOutputPath = Path.resolve(options.outputPath);
  if (isWithin(repositoryRoot, requestedOutputPath)) {
    throw new Error("Release binary outputs must be outside the source checkout");
  }
  try {
    Fs.lstatSync(requestedOutputPath);
    throw new Error(`Refusing to replace an existing build output: ${requestedOutputPath}`);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  const physicalOutputPath = resolvePhysicalPath(requestedOutputPath);
  if (isWithin(repositoryRoot, physicalOutputPath)) {
    throw new Error("Release binary outputs must resolve outside the source checkout");
  }
  Fs.mkdirSync(Path.dirname(requestedOutputPath), { recursive: true });
  const outputParent = Fs.realpathSync(Path.dirname(requestedOutputPath));
  const outputPath = Path.join(outputParent, Path.basename(requestedOutputPath));
  if (outputPath !== physicalOutputPath || isWithin(repositoryRoot, outputPath)) {
    throw new Error("Release binary output parent changed while it was being prepared");
  }
  const identityPath = `${outputPath}.identity.json`;
  try {
    Fs.lstatSync(identityPath);
    throw new Error(`Refusing to replace an existing build identity record: ${identityPath}`);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const snapshotRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-release-build-"));
  let compiledOutputIdentity: Pick<Fs.Stats, "dev" | "ino"> | undefined;
  let compiledIdentityRecord: Pick<Fs.Stats, "dev" | "ino"> | undefined;
  try {
    if (isWithin(repositoryRoot, Fs.realpathSync(snapshotRoot))) {
      throw new Error("Frozen build snapshots must be outside the source checkout");
    }
    const dependencyCachePath = Path.join(snapshotRoot, ".bun-install-cache");
    const buildEnvironment = createFrozenBuildEnvironment(snapshotRoot, dependencyCachePath);
    writeFrozenBuildTree(snapshotRoot, sourceSnapshot.files, identity);
    const frozenDependencies = installFrozenDependencies(
      snapshotRoot,
      dependencyCachePath,
      buildEnvironment,
      sourceSnapshot.files,
    );
    if (!options.compile) buildFrozenCore(snapshotRoot, buildEnvironment);
    const arguments_ = [
      "build",
      "--compile",
      `--target=bun-${identity.target.os}-${identity.target.arch}`,
      ...externalModules.flatMap((module) => ["--external", module]),
      Path.join(snapshotRoot, "packages", "cli", "src", "cli", "main.ts"),
      `--outfile=${outputPath}`,
    ];
    (options.compile ?? runBuild)({
      executable: process.execPath,
      arguments: arguments_,
      environment: buildEnvironment,
      cwd: snapshotRoot,
    });
    const outputStat = Fs.lstatSync(outputPath);
    if (!outputStat.isFile() || outputStat.isSymbolicLink() || outputStat.size === 0) {
      throw new Error(`Compiler did not create a non-empty regular binary: ${outputPath}`);
    }
    compiledOutputIdentity = { dev: outputStat.dev, ino: outputStat.ino };
    Fs.chmodSync(outputPath, 0o755);
    const binaryDescriptor = Fs.openSync(outputPath, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
    let binary: Uint8Array;
    try {
      const openedOutput = Fs.fstatSync(binaryDescriptor);
      if (!openedOutput.isFile() || openedOutput.dev !== outputStat.dev || openedOutput.ino !== outputStat.ino) {
        throw new Error(`Compiled binary changed while being inspected: ${outputPath}`);
      }
      binary = new Uint8Array(Fs.readFileSync(binaryDescriptor));
    } finally {
      Fs.closeSync(binaryDescriptor);
    }
    const embeddedIdentity = readEmbeddedBuildIdentity(binary);
    if (!sameJson(embeddedIdentity, identity)) {
      throw new Error("Embedded binary identity does not match its frozen build inputs");
    }
    const currentDependencies = snapshotFrozenDependencies(snapshotRoot);
    if (currentDependencies.digest !== frozenDependencies.digest) {
      throw new Error("Frozen dependency inputs changed during the binary build; discard this binary and retry");
    }
    if (isCurrentNativeTarget(identity.target)) {
      const compiledIdentity = readNativeBuildIdentity(outputPath, snapshotRoot, buildEnvironment);
      if (!sameJson(compiledIdentity, embeddedIdentity)) {
        throw new Error("Native compiled identity does not match independently inspected binary metadata");
      }
    }
    const currentSource = readSourceIdentity(repositoryRoot);
    if (!sameSourceContent(currentSource, sourceSnapshot.identity)) {
      throw new Error("Source inputs changed during the build; discard this binary and retry from a stable snapshot");
    }
    const currentResources = validateResourcePackage(
      readResourcePackageSnapshot(bundleRoot),
      release,
    );
    if (
      currentResources.manifest.resource_digest !== resourcePackage.manifest.resource_digest ||
      !sameResourceFiles(currentResources, resourcePackage)
    ) {
      throw new Error("Resource inputs changed during the build; discard this binary and retry from a stable snapshot");
    }
    const identityRecord: BuildArtifactIdentityRecord = {
      format_version: 1,
      binary_digest: sha256Digest(binary),
      identity,
    };
    compiledIdentityRecord = writeIdentityRecord(identityPath, identityRecord);
    return { outputPath, identityPath, identity };
  } catch (error) {
    if (compiledIdentityRecord) {
      removeOwnedFile(identityPath, compiledIdentityRecord, error);
    }
    if (compiledOutputIdentity) {
      try {
        const currentOutput = Fs.lstatSync(outputPath);
        if (currentOutput.dev === compiledOutputIdentity.dev && currentOutput.ino === compiledOutputIdentity.ino) {
          Fs.unlinkSync(outputPath);
        }
      } catch (cleanupError) {
        if (!isMissingPath(cleanupError)) {
          throw new Error(`Build failed and its rejected output could not be removed: ${outputPath}: ${String(cleanupError)}`, {
            cause: error,
          });
        }
      }
    }
    throw error;
  } finally {
    Fs.rmSync(snapshotRoot, { recursive: true, force: true });
  }
}

function readResourcePackageSnapshot(bundleRoot: string): ResourcePackageSnapshot {
  const inputRootStat = Fs.lstatSync(bundleRoot);
  if (!inputRootStat.isDirectory() || inputRootStat.isSymbolicLink()) {
    throw new Error("Resource package root is not a real directory");
  }
  const root = Fs.realpathSync(bundleRoot);
  const rootStat = Fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Resource package root is not a real directory");
  }
  const manifestPath = Path.join(root, "manifest.json");
  const manifestStat = Fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error("Resource manifest is not a regular file");
  }
  const manifest = Fs.readFileSync(manifestPath, "utf8");
  const files: Array<{ path: string; contents: Uint8Array }> = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = Fs.readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (relativePath === "manifest.json") continue;
      const absolutePath = Path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Resource package contains a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push({ path: relativePath, contents: Fs.readFileSync(absolutePath) });
      } else {
        throw new Error(`Resource package contains a non-regular file: ${relativePath}`);
      }
    }
  };
  visit(root, "");
  return { manifest, files };
}

function writeFrozenBuildTree(
  snapshotRoot: string,
  sourceFiles: readonly { readonly path: string; readonly contents: Uint8Array; readonly executable?: boolean }[],
  identity: RuntimeBuildIdentity,
): void {
  const identityPath = "packages/cli/src/cli/build-identity.ts";
  let identityModuleFound = false;
  const encodedIdentityMarker = encodeBuildIdentityMarker(identity);
  for (const file of sourceFiles) {
    const targetPath = Path.join(snapshotRoot, ...file.path.split("/"));
    Fs.mkdirSync(Path.dirname(targetPath), { recursive: true });
    let contents = Buffer.from(file.contents);
    if (file.path === identityPath) {
      identityModuleFound = true;
      const source = contents.toString("utf8");
      const count = source.split(compiledIdentityDeclaration).length - 1;
      if (count !== 1) {
        throw new Error("Build identity source no longer has one frozen compile-time insertion point");
      }
      contents = Buffer.from(source.replace(
        compiledIdentityDeclaration,
        `const COMPILED_BUILD_IDENTITY_MARKER: string | undefined = ${JSON.stringify(encodedIdentityMarker)};`,
      ));
    }
    Fs.writeFileSync(targetPath, contents, { mode: file.executable ? 0o755 : 0o644 });
  }
  if (!identityModuleFound) throw new Error("Frozen source snapshot is missing build identity code");
  for (const relativePath of [
    "node_modules",
    "packages/cli/node_modules",
    "packages/core/node_modules",
  ]) {
    const dependencyRoot = Path.join(snapshotRoot, relativePath);
    try {
      Fs.lstatSync(dependencyRoot);
      throw new Error(`Frozen source snapshot unexpectedly includes dependencies: ${relativePath}`);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }
}

function createFrozenBuildEnvironment(
  snapshotRoot: string,
  dependencyCachePath?: string,
): NodeJS.ProcessEnv {
  const home = Path.join(snapshotRoot, ".owned-home");
  const temporaryDirectory = Path.join(snapshotRoot, ".owned-tmp");
  Fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  Fs.mkdirSync(temporaryDirectory, { recursive: true, mode: 0o700 });
  const environment: NodeJS.ProcessEnv = {
    PATH: [Path.dirname(process.execPath), process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"]
      .filter(Boolean)
      .join(Path.delimiter),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: Path.join(home, ".config"),
    XDG_CACHE_HOME: Path.join(home, ".cache"),
    XDG_DATA_HOME: Path.join(home, ".local", "share"),
    TMPDIR: temporaryDirectory,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
    NO_COLOR: "1",
    TZ: "UTC",
  };
  if (dependencyCachePath) {
    environment.BUN_INSTALL_CACHE_DIR = dependencyCachePath;
  }
  return environment;
}

function installFrozenDependencies(
  snapshotRoot: string,
  cachePath: string,
  environment: NodeJS.ProcessEnv,
  sourceFiles: readonly { readonly path: string; readonly contents: Uint8Array }[],
): FrozenDependencySnapshot {
  const lockfile = sourceFiles.find((file) => file.path === "bun.lock");
  if (!lockfile) throw new Error("Frozen build source is missing bun.lock");
  const manifests = sourceFiles.filter((file) =>
    file.path === "bun.lock" || file.path === "package.json" || file.path.endsWith("/package.json"),
  );
  for (const relativePath of [
    "node_modules",
    "packages/cli/node_modules",
    "packages/core/node_modules",
  ]) {
    try {
      Fs.lstatSync(Path.join(snapshotRoot, relativePath));
      throw new Error(`Refusing dependency installation over existing snapshot input: ${relativePath}`);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }
  Fs.mkdirSync(cachePath, { mode: 0o700 });
  if (Fs.readdirSync(cachePath).length !== 0) {
    throw new Error("Frozen Bun package cache must begin empty");
  }
  try {
    execFileSync(process.execPath, [
      "install",
      "--frozen-lockfile",
      "--no-save",
      "--cache-dir",
      cachePath,
      "--backend=copyfile",
      "--ignore-scripts",
      "--no-progress",
    ], {
      cwd: snapshotRoot,
      env: environment,
      stdio: "inherit",
      timeout: 120_000,
    });
  } catch (error) {
    throw new Error(`Could not install the locked dependency closure in the frozen build snapshot: ${String(error)}`);
  }
  for (const manifest of manifests) {
    const installedContents = Fs.readFileSync(Path.join(snapshotRoot, ...manifest.path.split("/")));
    if (!Buffer.from(manifest.contents).equals(installedContents)) {
      throw new Error(`Frozen dependency installation modified authored input: ${manifest.path}`);
    }
  }
  Fs.rmSync(cachePath, { recursive: true, force: false });
  return snapshotFrozenDependencies(snapshotRoot);
}

function isCurrentNativeTarget(target: ReleaseTarget): boolean {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  return target.os === os && target.arch === arch;
}

function readNativeBuildIdentity(
  executablePath: string,
  snapshotRoot: string,
  buildEnvironment: NodeJS.ProcessEnv,
): RuntimeBuildIdentity {
  try {
    const queryEnvironment = createFrozenBuildEnvironment(snapshotRoot);
    queryEnvironment.PATH = buildEnvironment.PATH;
    queryEnvironment.PI_OFFLINE = "1";
    const output = execFileSync(executablePath, ["--print-build-identity"], {
      cwd: Path.dirname(executablePath),
      env: queryEnvironment,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      windowsHide: true,
    });
    return parseBuildIdentity(output.trim());
  } catch (error) {
    throw new Error(`Could not read the compiled identity from the native binary: ${String(error)}`);
  }
}

function writeIdentityRecord(
  identityPath: string,
  record: BuildArtifactIdentityRecord,
): Pick<Fs.Stats, "dev" | "ino"> {
  const temporaryPath = `${identityPath}.${randomUUID()}.tmp`;
  const descriptor = Fs.openSync(
    temporaryPath,
    Fs.constants.O_WRONLY | Fs.constants.O_CREAT | Fs.constants.O_EXCL | (Fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    Fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
  try {
    Fs.chmodSync(temporaryPath, 0o644);
    Fs.linkSync(temporaryPath, identityPath);
    Fs.unlinkSync(temporaryPath);
  } catch (error) {
    try {
      Fs.unlinkSync(temporaryPath);
    } catch {
      throw new Error(`Could not finalize build identity; temporary output remains at ${temporaryPath}: ${String(error)}`);
    }
    throw error;
  }
  const stat = Fs.lstatSync(identityPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Build identity record is not a regular file");
  return { dev: stat.dev, ino: stat.ino };
}

function removeOwnedFile(
  path: string,
  identity: Pick<Fs.Stats, "dev" | "ino">,
  cause: unknown,
): void {
  try {
    const current = Fs.lstatSync(path);
    if (current.dev === identity.dev && current.ino === identity.ino) Fs.unlinkSync(path);
  } catch (error) {
    if (!isMissingPath(error)) {
      throw new Error(`Build failed and its rejected identity record could not be removed: ${path}: ${String(error)}`, {
        cause,
      });
    }
  }
}

function buildFrozenCore(snapshotRoot: string, environment: NodeJS.ProcessEnv): void {
  try {
    execFileSync(process.execPath, ["run", "build:core"], {
      cwd: snapshotRoot,
      env: environment,
      stdio: "inherit",
      timeout: 90_000,
    });
  } catch (error) {
    throw new Error(`Could not build frozen Core inputs for the release binary: ${String(error)}`);
  }
}

function runBuild(input: {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly cwd: string;
}): void {
  execFileSync(input.executable, [...input.arguments], {
    cwd: input.cwd,
    env: input.environment,
    stdio: "inherit",
    timeout: 90_000,
  });
}

function parseArguments(arguments_: readonly string[]): {
  readonly target: ReleaseTarget;
  readonly outputPath: string;
  readonly requireClean: boolean;
} {
  let target: ReleaseTarget | undefined;
  let outputPath: string | undefined;
  let requireClean = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--target") {
      const value = arguments_[++index];
      if (value === undefined) throw new Error("Missing value for --target");
      target = parseReleaseTarget(value);
    } else if (argument === "--output") {
      outputPath = arguments_[++index];
    } else if (argument === "--require-clean") {
      requireClean = true;
    } else {
      throw new Error(`Unknown build argument: ${argument}`);
    }
  }
  if (!target) throw new Error("Missing --target <linux-x64|linux-arm64|darwin-x64|darwin-arm64>");
  if (!outputPath) throw new Error("Missing --output <path>");
  return { target, outputPath, requireClean };
}

function sameSourceContent(left: SourceIdentity, right: SourceIdentity): boolean {
  return left.commit === right.commit && left.content_digest === right.content_digest;
}

function sameResourceFiles(
  left: ReturnType<typeof validateResourcePackage>,
  right: ReturnType<typeof validateResourcePackage>,
): boolean {
  if (left.files.length !== right.files.length) return false;
  const rightFiles = new Map(right.files.map((file) => [file.path, file.digest]));
  return left.files.every((file) => rightFiles.get(file.path) === file.digest);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

if (import.meta.main) {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const result = buildReleaseBinary({
      repositoryRoot: Path.resolve(import.meta.dir, ".."),
      ...arguments_,
    });
    process.stdout.write(`${JSON.stringify({
      output_path: result.outputPath,
      identity_path: result.identityPath,
      identity: result.identity,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
