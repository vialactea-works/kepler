import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { extractTargetArchive, targetArchiveName, type ReleaseTarget } from "../packages/cli/src/cli/release-archive.js";
import { sha256Digest } from "../packages/cli/src/cli/installation-record.js";
import { buildReleaseBinary } from "./build-release-binary.js";
import { packageTargetArchive } from "./package-target-archive.js";
import { parseReleaseVersion } from "./release-version.js";

interface OwnedDirectoryIdentity {
  readonly device: number;
  readonly inode: number;
}

interface SetupResult {
  readonly status: string;
  readonly data: Record<string, unknown>;
}

const repositoryRoot = Path.resolve(import.meta.dir, "..");
const pinnedLoaderRelease = "0.76.1";

export async function runDevelopmentPackage(): Promise<{
  readonly release: string;
  readonly target: string;
  readonly sourceKind: string;
  readonly sourceDigest: string;
  readonly archiveDigest: string;
  readonly generationId: string;
}> {
  const target = currentTarget();
  const host = requirePiHost(process.env);
  const rootManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
    readonly version?: unknown;
  };
  if (typeof rootManifest.version !== "string") throw new Error("The root package version is missing");
  const release = rootManifest.version;
  parseReleaseVersion(release);

  const temporaryBase = Fs.realpathSync(Os.tmpdir());
  assertTemporaryBaseIsIsolated(temporaryBase, process.env);
  const temporaryRoot = Fs.mkdtempSync(Path.join(temporaryBase, "kepler-dev-package-"));
  const temporaryStat = Fs.lstatSync(temporaryRoot);
  const identity = { device: temporaryStat.dev, inode: temporaryStat.ino };
  try {
    const buildDirectory = Path.join(temporaryRoot, "build");
    const binaryPath = Path.join(buildDirectory, `kepler-${release}-${target.os}-${target.arch}`);
    const archivePath = Path.join(buildDirectory, targetArchiveName(release, target));
    const build = buildReleaseBinary({
      repositoryRoot,
      target,
      outputPath: binaryPath,
      identityKind: "development",
    });
    if (build.identity.source.kind !== "development") {
      throw new Error("dev:package requires a development source identity");
    }
    const packaged = packageTargetArchive({ repositoryRoot, binary: binaryPath, target, output: archivePath });
    const archive = new Uint8Array(Fs.readFileSync(archivePath));
    if (sha256Digest(archive) !== packaged.archiveDigest) {
      throw new Error("The written development archive does not match its package identity");
    }

    const candidateRoot = Path.join(temporaryRoot, "candidate");
    extractTargetArchive(archive, candidateRoot, {
      expectedVersion: release,
      expectedTarget: target,
      expectedIdentity: build.identity,
    });

    const home = Path.join(temporaryRoot, "home");
    const project = Path.join(temporaryRoot, "project");
    const agentDirectory = Path.join(home, ".pi", "agent");
    const packageDirectory = Path.join(agentDirectory, "npm", "node_modules");
    const settingsPath = Path.join(agentDirectory, "settings.json");
    const projectSentinel = Path.join(project, ".kepler", "development-sentinel.txt");
    const unrelatedSettings = { development_sentinel: { preserved: true } };
    Fs.mkdirSync(Path.join(temporaryRoot, "tmp"), { recursive: true });
    Fs.mkdirSync(packageDirectory, { recursive: true });
    Fs.mkdirSync(Path.dirname(projectSentinel), { recursive: true });
    Fs.mkdirSync(Path.join(project, ".pi"), { recursive: true });
    Fs.symlinkSync(host.loaderRoot, Path.join(packageDirectory, "pi-subagents"), "dir");
    Fs.writeFileSync(settingsPath, `${JSON.stringify({
      packages: [`npm:pi-subagents@${pinnedLoaderRelease}`],
      skills: [],
      subagents: {},
      ...unrelatedSettings,
    }, null, 2)}\n`);
    Fs.writeFileSync(Path.join(project, ".pi", "settings.json"), "{}\n");
    Fs.writeFileSync(projectSentinel, "development package must preserve project data\n");
    const projectSentinelBefore = Fs.readFileSync(projectSentinel);

    const environment: NodeJS.ProcessEnv = {
      PATH: [
        ...(host.nodeBinary ? [Path.dirname(host.nodeBinary)] : []),
        "/usr/bin",
        "/bin",
      ].join(Path.delimiter),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: Path.join(home, ".config"),
      XDG_CACHE_HOME: Path.join(home, ".cache"),
      XDG_DATA_HOME: Path.join(home, ".local", "share"),
      TMPDIR: Path.join(temporaryRoot, "tmp"),
      KEPLER_PI_AGENT_DIR: agentDirectory,
      KEPLER_PI_BINARY: host.piBinary,
      PI_OFFLINE: "1",
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      TERM: "dumb",
      TZ: "UTC",
    };
    const candidateBinary = Path.join(candidateRoot, "bin", "kepler");
    const first = await invokeSetup(candidateBinary, project, environment);
    const firstGenerationId = stringField(first.data, "generation_id");
    if (first.data.installation_mode !== "first-install") {
      throw new Error(`Development candidate setup did not perform first-install: ${String(first.data.installation_mode)}`);
    }

    const selector = Path.join(home, ".kepler-dist", "current");
    const stableLauncher = Path.join(home, ".local", "bin", "kepler");
    if (Fs.readlinkSync(selector) !== `generations/${firstGenerationId}`) {
      throw new Error("Development setup did not select its complete generation");
    }
    if (Fs.readlinkSync(stableLauncher) !== Path.join(selector, "bin", "kepler")) {
      throw new Error("Development setup did not create its isolated stable launcher");
    }
    const settingsAfter = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    if (JSON.stringify(settingsAfter.development_sentinel) !== JSON.stringify(unrelatedSettings.development_sentinel)) {
      throw new Error("Development setup changed unrelated Pi settings");
    }
    if (Buffer.compare(Fs.readFileSync(projectSentinel), projectSentinelBefore) !== 0) {
      throw new Error("Development setup changed the isolated project sentinel");
    }

    const repeated = await invokeSetup(stableLauncher, project, environment);
    if (
      repeated.data.installation_mode !== "no-op" ||
      repeated.data.generation_id !== firstGenerationId
    ) {
      throw new Error("The installed development package did not verify as a stable no-op");
    }

    return {
      release,
      target: `${target.os}-${target.arch}`,
      sourceKind: build.identity.source.kind,
      sourceDigest: build.identity.source.content_digest,
      archiveDigest: packaged.archiveDigest,
      generationId: firstGenerationId,
    };
  } finally {
    removeOwnedTemporaryRoot(temporaryRoot, identity);
  }
}

async function invokeSetup(
  binary: string,
  project: string,
  environment: NodeJS.ProcessEnv,
): Promise<SetupResult> {
  const result = await execa(binary, ["setup"], {
    cwd: project,
    env: environment,
    extendEnv: false,
    reject: false,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Isolated development setup failed: ${result.stdout}\n${result.stderr}`);
  }
  const line = result.stdout.split(/\r?\n/).findLast((entry) => entry.startsWith('{"status":'));
  if (!line) throw new Error(`Isolated development setup returned no JSON result: ${result.stdout}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error("Isolated development setup returned invalid JSON", { cause: error });
  }
  if (
    typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
    !("status" in parsed) || parsed.status !== "success" ||
    !("data" in parsed) || typeof parsed.data !== "object" || parsed.data === null || Array.isArray(parsed.data)
  ) {
    throw new Error(`Isolated development setup did not succeed: ${result.stdout}`);
  }
  return { status: parsed.status, data: parsed.data as Record<string, unknown> };
}

function currentTarget(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Unsupported development package target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

function requirePiHost(environment: NodeJS.ProcessEnv): {
  readonly piBinary: string;
  readonly loaderRoot: string;
  readonly nodeBinary?: string;
} {
  const binary = environment.KEPLER_PI_BINARY;
  const loader = environment.KEPLER_PI_SUBAGENTS_ROOT;
  if (!binary || !loader) {
    throw new Error("dev:package requires KEPLER_PI_BINARY and KEPLER_PI_SUBAGENTS_ROOT for the actual offline Pi host");
  }
  const piBinary = Fs.realpathSync(binary);
  const binaryStat = Fs.statSync(piBinary);
  if (!binaryStat.isFile() || (binaryStat.mode & 0o111) === 0) {
    throw new Error(`Configured Pi is not an executable regular file: ${binary}`);
  }
  const loaderRoot = Fs.realpathSync(loader);
  const loaderStat = Fs.statSync(loaderRoot);
  if (!loaderStat.isDirectory()) throw new Error(`Configured pi-subagents root is not a directory: ${loader}`);
  const configuredNode = environment.KEPLER_PI_NODE_BINARY;
  const nodeBinary = configuredNode ? Fs.realpathSync(configuredNode) : undefined;
  if (nodeBinary) {
    const nodeStat = Fs.statSync(nodeBinary);
    if (!nodeStat.isFile() || (nodeStat.mode & 0o111) === 0) {
      throw new Error(`Configured Node is not an executable regular file: ${configuredNode}`);
    }
  }
  const isNodeEntrypoint = binaryStat.size < 4096 &&
    Fs.readFileSync(piBinary, "utf8").startsWith("#!/usr/bin/env node");
  if (isNodeEntrypoint && !nodeBinary) {
    throw new Error("dev:package requires KEPLER_PI_NODE_BINARY for the npm Pi CLI entrypoint");
  }
  const packageManifest = JSON.parse(Fs.readFileSync(Path.join(loaderRoot, "package.json"), "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  if (packageManifest.name !== "pi-subagents" || packageManifest.version !== pinnedLoaderRelease) {
    throw new Error(`dev:package requires pi-subagents ${pinnedLoaderRelease}`);
  }
  return {
    piBinary,
    loaderRoot,
    ...(nodeBinary ? { nodeBinary } : {}),
  };
}

function assertTemporaryBaseIsIsolated(temporaryBase: string, environment: NodeJS.ProcessEnv): void {
  const protectedPaths = [
    Path.resolve(environment.HOME ?? Os.homedir()),
    Path.resolve(environment.XDG_CONFIG_HOME ?? Path.join(environment.HOME ?? Os.homedir(), ".config")),
    Path.resolve(environment.KEPLER_PI_AGENT_DIR ?? Path.join(environment.HOME ?? Os.homedir(), ".pi", "agent")),
    repositoryRoot,
  ];
  for (const protectedPath of protectedPaths) {
    if (isWithin(protectedPath, temporaryBase)) {
      throw new Error(`dev:package temporary root overlaps a protected path: ${protectedPath}`);
    }
  }
}

function removeOwnedTemporaryRoot(path: string, identity: OwnedDirectoryIdentity): void {
  let current: Fs.Stats;
  try {
    current = Fs.lstatSync(path);
  } catch (error) {
    if (isMissingPath(error)) return;
    throw error;
  }
  if (
    !current.isDirectory() || current.isSymbolicLink() ||
    current.dev !== identity.device || current.ino !== identity.inode ||
    Fs.realpathSync(path) !== path
  ) {
    throw new Error(`dev:package refuses to remove a temporary root it no longer owns: ${path}`);
  }
  makeOwnedTreeRemovable(path);
  Fs.rmSync(path, { recursive: true, force: false });
}

function makeOwnedTreeRemovable(path: string): void {
  const stat = Fs.lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    Fs.chmodSync(path, 0o700);
    for (const entry of Fs.readdirSync(path)) makeOwnedTreeRemovable(Path.join(path, entry));
  } else if (stat.isFile()) {
    Fs.chmodSync(path, 0o600);
  } else {
    throw new Error(`dev:package found a special file in its owned temporary root: ${path}`);
  }
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`Development setup result is missing ${field}`);
  }
  return result;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("dev:package does not accept arguments");
  const result = await runDevelopmentPackage();
  process.stdout.write(`${JSON.stringify({ status: "success", data: result })}\n`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`dev:package failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
