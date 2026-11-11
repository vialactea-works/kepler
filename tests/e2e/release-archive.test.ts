import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectedTargetArchiveNames,
  extractTargetArchive,
  targetArchiveName,
  validateTargetArchive,
  type ReleaseTarget,
} from "../../packages/cli/src/cli/release-archive.js";
import {
  bundleManifestContentDigest,
  parseInstallationReceipt,
  serializeInstallationRecord,
  sha256Digest,
  type BundleManifest,
  type ContentDigest,
  type InstallationRecord,
} from "../../packages/cli/src/cli/installation-record.js";
import { buildReleaseBinary } from "../../scripts/build-release-binary.js";
import { packageTargetArchive } from "../../scripts/package-target-archive.js";
import { resolveNativePiHostConfig, type NativePiCliKind } from "../helpers/native-pi-host.js";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const expectedPiRelease = "1.2.0";
const expectedLoaderRelease = "0.76.1";
const temporaryRoots: string[] = [];

interface NativeHost {
  readonly piBinary: string;
  readonly piCliKind: NativePiCliKind;
  readonly loaderRoot: string;
  readonly nodeBinary?: string;
  readonly sdkEntryPath?: string;
}

interface CandidateArchive {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly version: string;
  readonly target: ReleaseTarget;
  readonly sourceDigest: ContentDigest;
  readonly sourceKind: "production" | "development";
  readonly sourceCommit: string;
}

function nativeHostFromEnvironment(): NativeHost {
  const configured = resolveNativePiHostConfig(process.env);
  if (!configured) throw new Error("Native archive E2E requires the actual pinned Pi and pi-subagents paths");
  const piBinary = Fs.realpathSync(configured.piBinary);
  const piStat = Fs.statSync(piBinary);
  if (!piStat.isFile() || (piStat.mode & 0o111) === 0) {
    throw new Error(`Configured Pi is not an executable regular file: ${configured.piBinary}`);
  }
  const loaderRoot = Fs.realpathSync(configured.loaderRoot);
  if (!Fs.statSync(loaderRoot).isDirectory()) {
    throw new Error(`Configured pi-subagents root is not a directory: ${configured.loaderRoot}`);
  }
  const nodeBinary = configured.nodeBinary ? Fs.realpathSync(configured.nodeBinary) : undefined;
  if (nodeBinary) {
    const nodeStat = Fs.statSync(nodeBinary);
    if (!nodeStat.isFile() || (nodeStat.mode & 0o111) === 0) {
      throw new Error(`Configured Node is not an executable regular file: ${configured.nodeBinary}`);
    }
  }
  const sdkEntryPath = configured.sdkEntryPath
    ? Fs.realpathSync(configured.sdkEntryPath)
    : undefined;
  if (configured.piCliKind === "npm") {
    if (!nodeBinary || !sdkEntryPath) {
      throw new Error("Node-based npm Pi requires an explicit Node interpreter and public SDK entry");
    }
    const packageRoot = Path.resolve(Path.dirname(piBinary), "../..");
    const sdkStat = Fs.statSync(sdkEntryPath);
    const sdkRelativePath = Path.relative(packageRoot, sdkEntryPath);
    if (!sdkStat.isFile() || sdkRelativePath !== Path.join("dist", "index.js")) {
      throw new Error("Pinned npm Pi SDK entry must be the public dist/index.js inside the configured package");
    }
  }
  const loaderManifest = JSON.parse(Fs.readFileSync(Path.join(loaderRoot, "package.json"), "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  if (loaderManifest.name !== "pi-subagents" || loaderManifest.version !== expectedLoaderRelease) {
    throw new Error(`Expected actual pi-subagents ${expectedLoaderRelease}; found ${String(loaderManifest.name)}@${String(loaderManifest.version)}`);
  }
  return {
    piBinary,
    piCliKind: configured.piCliKind,
    loaderRoot,
    ...(nodeBinary ? { nodeBinary } : {}),
    ...(sdkEntryPath ? { sdkEntryPath } : {}),
  };
}

const nativeHost = nativeHostFromEnvironment();

function restrictedPiPath(prefix: readonly string[] = []): string {
  return [
    ...prefix,
    ...(nativeHost.nodeBinary ? [Path.dirname(nativeHost.nodeBinary)] : []),
    "/usr/bin",
    "/bin",
  ].join(Path.delimiter);
}

function supportsPinnedPiNode(version: string): boolean {
  const match = version.trim().match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major! > 22 || (major === 22 && (minor! > 19 || (minor === 19 && patch! >= 0)));
}

function currentTarget(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Native target is unsupported: ${process.platform}/${process.arch}`);
  return { os, arch };
}

function makeTemporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Fs.realpathSync(Os.tmpdir()), "kepler-bootstrap-e2e-"));
  temporaryRoots.push(root);
  return root;
}

function makeWritable(path: string): void {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    Fs.chmodSync(path, 0o700);
    for (const entry of Fs.readdirSync(path)) makeWritable(Path.join(path, entry));
  } else {
    Fs.chmodSync(path, 0o600);
  }
}

function parseCliEnvelope(output: string): { readonly status: string; readonly data: Record<string, unknown> } {
  const line = output.split(/\r?\n/).findLast((entry) => entry.startsWith('{"status":'));
  if (!line) throw new Error(`CLI output has no JSON result envelope: ${output}`);
  const result = JSON.parse(line) as { readonly status?: unknown; readonly data?: unknown };
  if (
    typeof result.status !== "string" ||
    typeof result.data !== "object" || result.data === null || Array.isArray(result.data)
  ) {
    throw new Error(`CLI result envelope has an invalid shape: ${output}`);
  }
  return { status: result.status, data: result.data as Record<string, unknown> };
}

function parseSuccessfulSetup(output: string): {
  readonly generationId: string;
  readonly installationMode: string;
  readonly release: string;
} {
  const result = parseCliEnvelope(output);
  if (result.status !== "success") throw new Error(`Compiled setup did not succeed: ${output}`);
  const generationId = result.data.generation_id;
  const installationMode = result.data.installation_mode;
  const release = result.data.kepler_release;
  if (typeof generationId !== "string" || typeof installationMode !== "string" || typeof release !== "string") {
    throw new Error(`Compiled setup returned incomplete success data: ${output}`);
  }
  return { generationId, installationMode, release };
}

function buildCurrentArchive(
  root: string,
  target: ReleaseTarget,
  identityKind?: "development",
): CandidateArchive {
  const packageManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
    readonly version?: unknown;
  };
  if (typeof packageManifest.version !== "string") throw new Error("Root package version is missing");
  const version = packageManifest.version;
  const binaryPath = Path.join(root, `kepler-${version}-${target.os}-${target.arch}`);
  const archivePath = Path.join(root, targetArchiveName(version, target));
  const build = buildReleaseBinary({
    repositoryRoot,
    target,
    outputPath: binaryPath,
    ...(identityKind ? { identityKind } : {}),
  });
  const packaged = packageTargetArchive({ repositoryRoot, binary: binaryPath, target, output: archivePath });
  const bytes = new Uint8Array(Fs.readFileSync(archivePath));
  if (sha256Digest(bytes) !== packaged.archiveDigest) throw new Error("Built target archive digest changed after packaging");
  return {
    bytes,
    digest: packaged.archiveDigest,
    version,
    target,
    sourceDigest: build.identity.source.content_digest,
    sourceKind: build.identity.source.kind,
    sourceCommit: build.identity.source.commit,
  };
}

function readConfiguredArchive(
  archivePath: string,
  expectedDigest: string | undefined,
  target: ReleaseTarget,
  expectedSourceCommit?: string,
): CandidateArchive {
  const absoluteArchivePath = Path.resolve(archivePath);
  const stat = Fs.lstatSync(absoluteArchivePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Configured target archive must be a regular file");
  const bytes = new Uint8Array(Fs.readFileSync(absoluteArchivePath));
  const digest = sha256Digest(bytes);
  if (!expectedDigest) throw new Error("Configured target archive requires its independently calculated SHA-256");
  const normalizedExpectedDigest = expectedDigest.startsWith("sha256:") ? expectedDigest : `sha256:${expectedDigest}`;
  if (digest !== normalizedExpectedDigest) {
    throw new Error(`Configured target archive digest changed: expected ${normalizedExpectedDigest}, found ${digest}`);
  }
  const version = currentReleaseVersion();
  const validated = validateTargetArchive(bytes, { expectedVersion: version, expectedTarget: target });
  if (expectedSourceCommit && (
    validated.identity.source.kind !== "production" ||
    validated.identity.source.commit !== expectedSourceCommit
  )) {
    throw new Error("CI target archive must bind the frozen production source commit");
  }
  return {
    bytes,
    digest,
    version: validated.identity.kepler_release,
    target,
    sourceDigest: validated.identity.source.content_digest,
    sourceKind: validated.identity.source.kind,
    sourceCommit: validated.identity.source.commit,
  };
}

function readConfiguredCandidate(target: ReleaseTarget): CandidateArchive | undefined {
  const archivePath = process.env.KEPLER_VERIFIED_ARCHIVE_PATH;
  if (!archivePath) {
    if (process.env.CI) throw new Error("CI native archive E2E requires the exact workflow-built archive path and digest");
    return undefined;
  }
  return readConfiguredArchive(
    archivePath,
    process.env.KEPLER_VERIFIED_ARCHIVE_SHA256,
    target,
    process.env.CI ? process.env.KEPLER_EXPECTED_SOURCE_COMMIT : undefined,
  );
}

function readConfiguredPriorCandidate(
  target: ReleaseTarget,
  exactCandidate: CandidateArchive,
): CandidateArchive | undefined {
  const archivePath = process.env.KEPLER_PRIOR_ARCHIVE_PATH;
  if (!archivePath) return undefined;
  const candidate = readConfiguredArchive(
    archivePath,
    process.env.KEPLER_PRIOR_ARCHIVE_SHA256,
    target,
  );
  if (
    candidate.digest === exactCandidate.digest ||
    (candidate.sourceDigest === exactCandidate.sourceDigest && candidate.sourceKind === exactCandidate.sourceKind)
  ) {
    throw new Error("Prior archive must bind a distinct build identity from the exact candidate");
  }
  return candidate;
}

function currentReleaseVersion(): string {
  const packageManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
    readonly version?: unknown;
  };
  if (typeof packageManifest.version !== "string") throw new Error("Root package version is missing");
  return packageManifest.version;
}

let cachedTarget: ReleaseTarget | undefined;
let cachedExactCandidate: CandidateArchive | undefined;
let cachedPriorCandidate: CandidateArchive | undefined;

function exactCandidateFor(target: ReleaseTarget): CandidateArchive {
  if (cachedExactCandidate) {
    if (cachedTarget?.os !== target.os || cachedTarget.arch !== target.arch) {
      throw new Error("One native archive E2E process cannot reuse a candidate from another target");
    }
    return cachedExactCandidate;
  }
  cachedTarget = target;
  cachedExactCandidate = readConfiguredCandidate(target)
    ?? buildCurrentArchive(Path.join(makeTemporaryRoot(), "exact-build"), target);
  return cachedExactCandidate;
}

function priorCandidateFor(target: ReleaseTarget, exact: CandidateArchive): CandidateArchive | undefined {
  if (cachedPriorCandidate) return cachedPriorCandidate;
  const configured = readConfiguredPriorCandidate(target, exact);
  if (configured) {
    cachedPriorCandidate = configured;
    return configured;
  }
  if (exact.sourceKind !== "production") return undefined;
  cachedPriorCandidate = buildCurrentArchive(
    Path.join(makeTemporaryRoot(), "prior-development-build"),
    target,
    "development",
  );
  return cachedPriorCandidate;
}

function createAssets(root: string, candidate: CandidateArchive): string {
  Fs.mkdirSync(root, { recursive: true });
  const archiveName = targetArchiveName(candidate.version, candidate.target);
  Fs.writeFileSync(Path.join(root, archiveName), candidate.bytes, { mode: 0o600 });
  const requiredNames = [
    ...expectedTargetArchiveNames(candidate.version),
    `kepler-core-${candidate.version}.tgz`,
    "RELEASE-MANIFEST.json",
  ];
  const lines = requiredNames.map((name) => {
    const digest = name === archiveName ? candidate.digest.slice("sha256:".length) : sha256Digest(name).slice("sha256:".length);
    return `${digest}  ${name}`;
  });
  Fs.writeFileSync(Path.join(root, "SHA256SUMS"), `${lines.join("\n")}\n`, { mode: 0o600 });
  return root;
}

function preparePiHome(home: string, project: string): { readonly agentDirectory: string; readonly settingsPath: string } {
  const agentDirectory = Path.join(home, ".pi", "agent");
  const packageDirectory = Path.join(agentDirectory, "npm", "node_modules");
  const settingsPath = Path.join(agentDirectory, "settings.json");
  Fs.mkdirSync(packageDirectory, { recursive: true });
  Fs.symlinkSync(nativeHost.loaderRoot, Path.join(packageDirectory, "pi-subagents"), "dir");
  Fs.writeFileSync(settingsPath, `${JSON.stringify({
    packages: [`npm:pi-subagents@${expectedLoaderRelease}`],
    skills: [],
    subagents: {},
    defaultThinkingLevel: "low",
    customSentinel: { preserve: "archive-e2e" },
    unrelated: { preserve: "bootstrap-e2e-sentinel" },
  }, null, 2)}\n`);
  Fs.mkdirSync(Path.join(project, ".pi"), { recursive: true });
  Fs.writeFileSync(Path.join(project, ".pi", "settings.json"), "{}\n");
  return { agentDirectory, settingsPath };
}

function setupEnvironment(input: {
  readonly home: string;
  readonly project: string;
  readonly agentDirectory: string;
  readonly temporaryDirectory: string;
}): NodeJS.ProcessEnv {
  return {
    PATH: restrictedPiPath(),
    HOME: input.home,
    USERPROFILE: input.home,
    XDG_CONFIG_HOME: Path.join(input.home, ".config"),
    KEPLER_PI_AGENT_DIR: input.agentDirectory,
    PI_CODING_AGENT_DIR: input.agentDirectory,
    KEPLER_PI_BINARY: nativeHost.piBinary,
    PI_OFFLINE: "1",
    TMPDIR: input.temporaryDirectory,
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
    TZ: "UTC",
  };
}

async function runCandidateSetup(input: {
  readonly binary: string;
  readonly home: string;
  readonly project: string;
  readonly agentDirectory: string;
  readonly temporaryDirectory: string;
  readonly arguments?: readonly string[];
}) {
  return await execa(input.binary, ["setup", ...(input.arguments ?? [])], {
    cwd: input.project,
    env: setupEnvironment(input),
    extendEnv: false,
    reject: false,
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function legacyInstallationRecord(): InstallationRecord {
  const digest = sha256Digest("authentic legacy flat installation fixture");
  const bundleRelease = "kepler-bundle-3.0.0";
  const skillsRelease = "kepler-skills-3.0.0";
  const rolesRelease = "claude-code-bindings-1.0.0";
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
  ];
  const roles = [
    ["architect", "kepler-architect"],
    ["orchestrator", "kepler-orchestrator"],
    ["coder", "kepler-coder"],
    ["reviewer", "kepler-reviewer"],
  ] as const;
  const files = {
    "templates/v3/construction/design.md": digest,
    "guidelines/general/01-code-style.md": digest,
    ...Object.fromEntries(skillIds.map((id) => [`skills/${id}/SKILL.md`, digest])),
    ...Object.fromEntries(roles.map(([, agentId]) => [`agents/claude-code/v1/${agentId}.md`, digest])),
  };
  const base: BundleManifest = {
    manifest_format_version: 1,
    bundle_release: bundleRelease,
    files,
    content_digest: digest,
    compatibility: {
      cli_releases: [currentReleaseVersion()],
      skills: skillIds.map((id) => ({
        id,
        release: skillsRelease,
        digest,
        required: skillIds.indexOf(id) < 8,
      })),
      host_bindings: roles.map(([role, agentId]) => ({ role, agent_id: agentId, release: rolesRelease, digest })),
    },
  };
  const manifest: BundleManifest = { ...base, content_digest: bundleManifestContentDigest(base) };
  return {
    format_version: 1,
    generation_id: "550e8400-e29b-41d4-a716-446655440000",
    cli_release: currentReleaseVersion(),
    bundle_release: {
      release: bundleRelease,
      content_digest: manifest.content_digest,
      manifest,
      installed_files: {
        "templates/v3/construction/design.md": digest,
        "guidelines/general/01-code-style.md": digest,
      },
    },
    skills: manifest.compatibility.skills.map((skill) => ({ ...skill, check: "not_checked" })),
    host_binding: {
      host: { id: "claude-code", release: null, check: "not_checked" },
      platform: { os: process.platform, arch: process.arch },
      roles: manifest.compatibility.host_bindings.map((role) => ({ ...role, check: "not_checked" })),
    },
    compatibility: { check: "compatible" },
  };
}

function installLegacyFlatState(home: string): {
  readonly flatBinary: string;
  readonly stableLauncher: string;
  readonly oldBinary: Uint8Array;
  readonly oldSettings: Uint8Array;
  readonly userTemplate: Uint8Array;
  readonly oldReceipt: Uint8Array;
} {
  const globalHome = Path.join(home, ".config", "vialactea-works", "kepler");
  const distributionRoot = Path.join(home, ".kepler-dist");
  const flatBinary = Path.join(distributionRoot, "bin", "kepler");
  const stableLauncher = Path.join(home, ".local", "bin", "kepler");
  const settingsPath = Path.join(globalHome, "settings.yaml");
  const userTemplatePath = Path.join(globalHome, "templates", "user.md");
  Fs.mkdirSync(globalHome, { recursive: true });
  Fs.mkdirSync(Path.dirname(flatBinary), { recursive: true });
  Fs.mkdirSync(Path.dirname(stableLauncher), { recursive: true });
  Fs.mkdirSync(Path.dirname(userTemplatePath), { recursive: true });
  const oldBinary = Buffer.from("preserved legacy flat executable\n");
  const oldSettings = Buffer.from("models: { user: true }\n");
  const userTemplate = Buffer.from("preserved legacy custom template\n");
  Fs.writeFileSync(flatBinary, oldBinary, { mode: 0o755 });
  Fs.symlinkSync(flatBinary, stableLauncher);
  Fs.writeFileSync(settingsPath, oldSettings);
  Fs.writeFileSync(userTemplatePath, userTemplate);
  const oldReceipt = Buffer.from(`${serializeInstallationRecord(legacyInstallationRecord())}\n`);
  Fs.writeFileSync(Path.join(globalHome, "installation.json"), oldReceipt);
  return { flatBinary, stableLauncher, oldBinary, oldSettings, userTemplate, oldReceipt };
}

function createExternalSkillPackage(agentDirectory: string, settingsPath: string): {
  readonly source: string;
  readonly packageRoot: string;
  readonly skillPath: string;
} {
  const source = "npm:@example/skill-pack@1.0.0";
  const packageRoot = Path.join(agentDirectory, "npm", "node_modules", "@example", "skill-pack");
  const skillPath = Path.join(packageRoot, "skills", "custom", "SKILL.md");
  Fs.mkdirSync(Path.dirname(skillPath), { recursive: true });
  Fs.writeFileSync(Path.join(packageRoot, "package.json"), `${JSON.stringify({
    name: "@example/skill-pack",
    version: "1.0.0",
    pi: { skills: ["skills"] },
  }, null, 2)}\n`);
  Fs.writeFileSync(skillPath, "---\nname: kepler-quality\ndescription: external skill\n---\n\nexternal custom content\n");
  const settings = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown> & { packages?: unknown[] };
  Fs.writeFileSync(settingsPath, `${JSON.stringify({ ...settings, packages: [...(settings.packages ?? []), source] }, null, 2)}\n`);
  return { source, packageRoot, skillPath };
}

function extractCandidate(root: string, candidate: CandidateArchive): string {
  const packageRoot = Path.join(root, "candidate");
  extractTargetArchive(candidate.bytes, packageRoot, {
    expectedVersion: candidate.version,
    expectedTarget: candidate.target,
    expectedSource: {
      kind: candidate.sourceKind,
      commit: candidate.sourceCommit,
      content_digest: candidate.sourceDigest,
    },
  });
  return Path.join(packageRoot, "bin", "kepler");
}

function createDirectRoots(root: string): {
  readonly home: string;
  readonly project: string;
  readonly temporaryDirectory: string;
  readonly agentDirectory: string;
  readonly settingsPath: string;
} {
  const home = Path.join(root, "home");
  const project = Path.join(root, "project");
  const temporaryDirectory = Path.join(root, "tmp");
  Fs.mkdirSync(home, { recursive: true });
  Fs.mkdirSync(project, { recursive: true });
  Fs.mkdirSync(temporaryDirectory, { recursive: true });
  const pi = preparePiHome(home, project);
  return { home, project, temporaryDirectory, agentDirectory: pi.agentDirectory, settingsPath: pi.settingsPath };
}

async function discoverActualPiResources(input: {
  readonly home: string;
  readonly project: string;
  readonly agentDirectory: string;
  readonly temporaryDirectory: string;
  readonly packageSource: string;
}): Promise<void> {
  const reportPath = Path.join(input.temporaryDirectory, "pi-resource-discovery.json");
  const probeSourcePath = Path.join(repositoryRoot, "tests", "fixtures", "pi-release-resource-probe.ts");
  const environment: NodeJS.ProcessEnv = {
    ...setupEnvironment(input),
    KEPLER_PI_SUBAGENTS_ROOT: nativeHost.loaderRoot,
    KEPLER_PROJECT_DIR: input.project,
    KEPLER_PI_PROBE_REPORT: reportPath,
    KEPLER_PACKAGE_SOURCE: input.packageSource,
    ...(nativeHost.piCliKind === "npm" && nativeHost.sdkEntryPath
      ? { KEPLER_PI_SDK_ENTRY_PATH: nativeHost.sdkEntryPath }
      : {}),
  };
  let command = nativeHost.piBinary;
  let arguments_: string[] = [
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-mcp",
    "--no-session",
    "--extension",
    probeSourcePath,
    "--help",
  ];
  if (nativeHost.piCliKind === "npm") {
    if (!nativeHost.nodeBinary || !nativeHost.sdkEntryPath) {
      throw new Error("Node-based npm Pi requires its selected Node and public SDK entry");
    }
    const compiledProbePath = Path.join(input.temporaryDirectory, "pi-release-resource-probe.mjs");
    const source = Fs.readFileSync(probeSourcePath, "utf8");
    const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
    Fs.writeFileSync(compiledProbePath, transpiler.transformSync(source), { mode: 0o600 });
    command = nativeHost.nodeBinary;
    arguments_ = [compiledProbePath];
    environment.KEPLER_PI_PROBE_RUN_DIRECT = "1";
  }
  const result = await execa(command, arguments_, {
    cwd: input.project,
    env: environment,
    extendEnv: false,
    reject: false,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
  const report = JSON.parse(Fs.readFileSync(reportPath, "utf8")) as {
    readonly packageSource: string;
    readonly packages: readonly unknown[];
    readonly defaultThinkingLevel: unknown;
    readonly customSentinel: unknown;
    readonly settingsErrors: readonly unknown[];
    readonly sdkKeplerSkills: readonly unknown[];
    readonly sdkSkillDiagnostics: readonly unknown[];
    readonly skills: readonly { readonly name?: unknown; readonly source?: unknown }[];
    readonly roles: readonly {
      readonly name?: unknown;
      readonly source?: unknown;
      readonly filePath?: unknown;
      readonly packageSourceRoot?: unknown;
      readonly tools?: readonly string[];
    }[];
    readonly diagnostics: readonly unknown[];
  };
  expect(report.packageSource).toBe(input.packageSource);
  expect(report.packages).toContain(input.packageSource);
  expect(report.defaultThinkingLevel).toBe("low");
  expect(report.customSentinel).toEqual({ preserve: "archive-e2e" });
  expect(report.settingsErrors).toEqual([]);
  expect(report.diagnostics).toEqual([]);
  const expectedSkills = [
    "kepler-code",
    "kepler-code-feedback",
    "kepler-design",
    "kepler-domain-modelling",
    "kepler-finish-work",
    "kepler-grilling",
    "kepler-orchestrate",
    "kepler-plan",
    "kepler-quality",
    "kepler-research",
    "kepler-review",
  ];
  expect(report.sdkSkillDiagnostics).toEqual([]);
  expect([...report.sdkKeplerSkills].sort()).toEqual([...expectedSkills].sort());
  const keplerSkills = report.skills.filter(({ name }) => typeof name === "string" && name.startsWith("kepler-"));
  expect(keplerSkills.map(({ name }) => name).sort()).toEqual([...expectedSkills].sort());
  const expectedRoles = ["kepler-architect", "kepler-coder", "kepler-orchestrator", "kepler-reviewer"];
  const keplerRoles = report.roles.filter(({ name }) => typeof name === "string" && name.startsWith("kepler-"));
  expect(keplerRoles.map(({ name }) => name).sort()).toEqual([...expectedRoles].sort());
  const selectedRoot = Fs.realpathSync(input.packageSource);
  for (const skill of keplerSkills) expect(skill.source).toBe("user-package");
  for (const role of keplerRoles) {
    if (typeof role.filePath !== "string" || typeof role.packageSourceRoot !== "string") {
      throw new Error("Actual Pi loader did not report package-backed role paths");
    }
    expect(role.source).toBe("package");
    expect(Fs.realpathSync(role.packageSourceRoot)).toBe(selectedRoot);
    const realPath = Fs.realpathSync(role.filePath);
    const relative = Path.relative(selectedRoot, realPath);
    expect(relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== "..")).toBe(true);
  }
  const roles = new Map(keplerRoles.map((role) => [role.name, role]));
  expect(roles.get("kepler-orchestrator")?.tools).toContain("subagent");
  expect(roles.get("kepler-coder")?.tools).not.toContain("subagent");
  expect(roles.get("kepler-reviewer")?.tools).not.toContain("write");
  expect(roles.get("kepler-reviewer")?.tools).not.toContain("edit");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function createFakeCurl(root: string): string {
  const bin = Path.join(root, "fake-bin");
  Fs.mkdirSync(bin, { recursive: true });
  const path = Path.join(bin, "curl");
  Fs.writeFileSync(path, `#!/bin/sh\nexec ${shellQuote(process.execPath)} "$KEPLER_FAKE_CURL_SOURCE" "$@"\n`, { mode: 0o755 });
  Fs.chmodSync(path, 0o755);
  return bin;
}

interface InstallerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runInstaller(input: {
  readonly root: string;
  readonly home: string;
  readonly project: string;
  readonly assets: string;
  readonly fakeBin: string;
  readonly agentDirectory?: string;
}): Promise<InstallerResult> {
  const temporaryDirectory = Path.join(input.root, "tmp");
  Fs.mkdirSync(temporaryDirectory, { recursive: true });
  const result = await execa("bash", [Path.join(repositoryRoot, "install.sh")], {
    cwd: input.project,
    env: {
      PATH: restrictedPiPath([input.fakeBin, Path.dirname(process.execPath)]),
      HOME: input.home,
      USERPROFILE: input.home,
      XDG_CONFIG_HOME: Path.join(input.home, ".config"),
      TMPDIR: temporaryDirectory,
      KEPLER_REPO_SLUG: "fixture/kepler",
      KEPLER_VERSION: `v${currentReleaseVersion()}`,
      KEPLER_FAKE_CURL_SOURCE: Path.join(repositoryRoot, "tests/fixtures/fake-curl.ts"),
      KEPLER_TEST_ASSETS: input.assets,
      KEPLER_PI_BINARY: nativeHost.piBinary,
      ...(input.agentDirectory ? { KEPLER_PI_AGENT_DIR: input.agentDirectory } : {}),
      PI_OFFLINE: "1",
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      TZ: "UTC",
    },
    extendEnv: false,
    reject: false,
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    exitCode: result.exitCode ?? -1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function assertPreservedSentinels(input: {
  readonly home: string;
  readonly project: string;
  readonly globalSentinel: Buffer;
  readonly localSentinel: Buffer;
  readonly projectSentinel: Buffer;
}): void {
  expect(Fs.readFileSync(Path.join(input.home, ".config", "vialactea-works", "kepler", "user-owned.txt"))).toEqual(input.globalSentinel);
  expect(Fs.readFileSync(Path.join(input.home, ".local", "bin", "unrelated-command"))).toEqual(input.localSentinel);
  expect(Fs.readFileSync(Path.join(input.project, ".kepler", "history.jsonl"))).toEqual(input.projectSentinel);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    makeWritable(root);
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("native target archive bootstrap E2E", () => {
  it("installs the approved archive, retries preflight and checksum failures, upgrades safely, and keeps user data intact", async () => {
    const target = currentTarget();
    const configuredTarget = process.env.KEPLER_EXPECTED_TARGET;
    if (configuredTarget && `${target.os}-${target.arch}` !== configuredTarget) {
      throw new Error(`Expected native target ${configuredTarget}; detected ${target.os}-${target.arch}`);
    }
    const root = makeTemporaryRoot();
    const exactCandidate = exactCandidateFor(target);
    const initialCandidate = priorCandidateFor(target, exactCandidate) ?? exactCandidate;
    const upgradeCandidate = initialCandidate.digest === exactCandidate.digest ? undefined : exactCandidate;
    if (!upgradeCandidate && process.env.CI) {
      throw new Error("Native CI archive E2E requires a distinct prior package identity to exercise upgrade");
    }

    const assets = createAssets(Path.join(root, "initial-assets"), initialCandidate);
    const fakeBin = createFakeCurl(root);
    const home = Path.join(root, "owned-home");
    const project = Path.join(root, "owned-project");
    const agentDirectory = Path.join(home, ".pi", "agent");
    Fs.mkdirSync(Path.join(home, ".config", "vialactea-works", "kepler"), { recursive: true });
    Fs.mkdirSync(Path.join(home, ".local", "bin"), { recursive: true });
    Fs.mkdirSync(Path.join(project, ".kepler"), { recursive: true });
    const globalSentinel = Buffer.from("preserve user configuration\n");
    const localSentinel = Buffer.from("preserve unrelated command\n");
    const projectSentinel = Buffer.from('{"event":"historical-project-data"}\n');
    Fs.writeFileSync(Path.join(home, ".config", "vialactea-works", "kepler", "user-owned.txt"), globalSentinel);
    Fs.writeFileSync(Path.join(home, ".local", "bin", "unrelated-command"), localSentinel);
    Fs.writeFileSync(Path.join(project, ".kepler", "history.jsonl"), projectSentinel);

    if (nativeHost.nodeBinary) {
      const nodeVersion = await execa(nativeHost.nodeBinary, ["--version"], {
        cwd: project,
        env: { PATH: "/usr/bin:/bin", HOME: home },
        extendEnv: false,
        reject: false,
        timeout: 20_000,
      });
      expect(nodeVersion.exitCode, `${nodeVersion.stdout}\n${nodeVersion.stderr}`).toBe(0);
      expect(supportsPinnedPiNode(nodeVersion.stdout)).toBe(true);
    }

    const piVersion = await execa(nativeHost.piBinary, ["--version"], {
      cwd: project,
      env: {
        PATH: restrictedPiPath(),
        HOME: home,
        USERPROFILE: home,
        PI_OFFLINE: "1",
      },
      extendEnv: false,
      reject: false,
      timeout: 20_000,
    });
    expect(piVersion.exitCode, `${String(piVersion.stdout)}\n${String(piVersion.stderr)}`).toBe(0);
    expect(String(piVersion.stdout)).toMatch(new RegExp(`\\b${expectedPiRelease.replaceAll(".", "\\.")}\\b`));

    const firstAttempt = await runInstaller({ root, home, project, assets, fakeBin, agentDirectory });
    expect(firstAttempt.exitCode).not.toBe(0);
    expect(parseCliEnvelope(firstAttempt.stdout).status).toBe("failed");
    expect(firstAttempt.stdout).toContain("pi_settings_unavailable");
    const preservedEvidence = firstAttempt.stderr.match(/candidate evidence preserved at (.+) \(exit /)?.[1];
    if (!preservedEvidence) throw new Error(`Bootstrap did not report its failure evidence path: ${firstAttempt.stderr}`);
    expect(Fs.statSync(Path.join(preservedEvidence, "candidate", "bin", "kepler")).isFile()).toBe(true);
    expect(Fs.existsSync(Path.join(home, ".kepler-dist", "current"))).toBe(false);
    expect(Fs.existsSync(Path.join(home, ".local", "bin", "kepler"))).toBe(false);
    expect(Fs.existsSync(Path.join(home, ".config", "vialactea-works", "kepler", "installation.json"))).toBe(false);
    assertPreservedSentinels({ home, project, globalSentinel, localSentinel, projectSentinel });

    const pi = preparePiHome(home, project);
    const firstInstall = await runInstaller({ root, home, project, assets, fakeBin, agentDirectory: pi.agentDirectory });
    expect(firstInstall.exitCode, `${firstInstall.stdout}\n${firstInstall.stderr}`).toBe(0);
    expect(firstInstall.stdout).toContain(`${targetArchiveName(initialCandidate.version, target)}: OK`);
    const first = parseSuccessfulSetup(firstInstall.stdout);
    expect(first).toEqual({ generationId: expect.any(String), installationMode: "first-install", release: "3.0.0" });
    const selector = Path.join(home, ".kepler-dist", "current");
    const launcher = Path.join(home, ".local", "bin", "kepler");
    const receiptPath = Path.join(home, ".config", "vialactea-works", "kepler", "installation.json");
    const selectedBefore = Fs.readlinkSync(selector);
    const selectedRootBefore = Fs.realpathSync(selector);
    const receiptBefore = Fs.readFileSync(receiptPath);
    const settingsBefore = Fs.readFileSync(pi.settingsPath);
    expect(selectedBefore).toBe(`generations/${first.generationId}`);
    expect(Fs.readlinkSync(launcher)).toBe(Path.join(selector, "bin", "kepler"));
    assertPreservedSentinels({ home, project, globalSentinel, localSentinel, projectSentinel });

    const noOp = await runInstaller({ root, home, project, assets, fakeBin, agentDirectory: pi.agentDirectory });
    expect(noOp.exitCode, `${noOp.stdout}\n${noOp.stderr}`).toBe(0);
    expect(parseSuccessfulSetup(noOp.stdout)).toEqual({
      generationId: first.generationId,
      installationMode: "no-op",
      release: "3.0.0",
    });
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
    expect(Fs.readFileSync(pi.settingsPath)).toEqual(settingsBefore);
    expect(Fs.readlinkSync(selector)).toBe(selectedBefore);
    expect(Fs.realpathSync(selector)).toBe(selectedRootBefore);
    expect(Fs.readdirSync(Path.join(root, "tmp"))).toContain(Path.basename(preservedEvidence));

    const selectedAssets = upgradeCandidate
      ? createAssets(Path.join(root, "upgrade-assets"), upgradeCandidate)
      : assets;
    const selectedArchiveName = targetArchiveName(initialCandidate.version, target);
    const selectedAssetDirectory = upgradeCandidate ? selectedAssets : assets;
    const selectedArchivePath = Path.join(selectedAssetDirectory, selectedArchiveName);
    const originalArchive = Fs.readFileSync(selectedArchivePath);
    const tamperedArchive = Buffer.from(originalArchive);
    tamperedArchive[tamperedArchive.length - 1] = (tamperedArchive.at(-1) ?? 0) ^ 1;
    Fs.writeFileSync(selectedArchivePath, tamperedArchive);
    const stateBeforeTamper = {
      selector: Fs.readlinkSync(selector),
      receipt: Fs.readFileSync(receiptPath),
      settings: Fs.readFileSync(pi.settingsPath),
    };
    const rejected = await runInstaller({
      root,
      home,
      project,
      assets: selectedAssetDirectory,
      fakeBin,
      agentDirectory: pi.agentDirectory,
    });
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.stderr).toContain("target archive checksum does not match SHA256SUMS");
    expect(Fs.readlinkSync(selector)).toBe(stateBeforeTamper.selector);
    expect(Fs.readFileSync(receiptPath)).toEqual(stateBeforeTamper.receipt);
    expect(Fs.readFileSync(pi.settingsPath)).toEqual(stateBeforeTamper.settings);
    const tamperEvidence = rejected.stderr.match(/candidate evidence preserved at (.+) \(exit /)?.[1];
    if (!tamperEvidence) throw new Error(`Bootstrap did not preserve tamper evidence: ${rejected.stderr}`);
    const retainedTamperedArchive = Fs.readFileSync(Path.join(tamperEvidence, targetArchiveName(initialCandidate.version, target)));
    expect(retainedTamperedArchive.byteLength).toBe(tamperedArchive.byteLength);
    expect(sha256Digest(retainedTamperedArchive)).toBe(sha256Digest(tamperedArchive));
    Fs.writeFileSync(selectedArchivePath, originalArchive);

    if (upgradeCandidate) {
      const upgrade = await runInstaller({
        root,
        home,
        project,
        assets: selectedAssets,
        fakeBin,
        agentDirectory: pi.agentDirectory,
      });
      expect(upgrade.exitCode, `${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);
      const upgraded = parseSuccessfulSetup(upgrade.stdout);
      expect(upgraded.installationMode).toBe("upgrade");
      expect(upgraded.release).toBe("3.0.0");
      expect(upgraded.generationId).not.toBe(first.generationId);
      expect(Fs.existsSync(selectedRootBefore)).toBe(true);
      expect(Fs.readlinkSync(selector)).toBe(`generations/${upgraded.generationId}`);
      expect(Fs.readlinkSync(launcher)).toBe(Path.join(selector, "bin", "kepler"));
      expect(Fs.readFileSync(pi.settingsPath)).toEqual(settingsBefore);
      const upgradedReceipt = Fs.readFileSync(receiptPath);
      const repeatedUpgrade = await runInstaller({
        root,
        home,
        project,
        assets: selectedAssets,
        fakeBin,
        agentDirectory: pi.agentDirectory,
      });
      expect(repeatedUpgrade.exitCode, `${repeatedUpgrade.stdout}\n${repeatedUpgrade.stderr}`).toBe(0);
      expect(parseSuccessfulSetup(repeatedUpgrade.stdout)).toEqual({
        generationId: upgraded.generationId,
        installationMode: "no-op",
        release: "3.0.0",
      });
      expect(Fs.readFileSync(receiptPath)).toEqual(upgradedReceipt);
      expect(Fs.readFileSync(pi.settingsPath)).toEqual(settingsBefore);
    }

    await discoverActualPiResources({
      home,
      project,
      agentDirectory: pi.agentDirectory,
      temporaryDirectory: Path.join(root, "tmp"),
      packageSource: Path.join(home, ".kepler-dist", "current"),
    });
    assertPreservedSentinels({ home, project, globalSentinel, localSentinel, projectSentinel });
  }, 600_000);

  it("installs the configured target archive directly and discovers its resources through actual Pi and pi-subagents", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const binary = extractCandidate(root, candidate);
    const first = await runCandidateSetup({ binary, ...roots });
    expect(first.exitCode, `${first.stdout}\n${first.stderr}`).toBe(0);
    const installed = parseSuccessfulSetup(first.stdout);
    expect(installed).toEqual({
      generationId: expect.any(String),
      installationMode: "first-install",
      release: currentReleaseVersion(),
    });
    const selector = Path.join(roots.home, ".kepler-dist", "current");
    const launcher = Path.join(roots.home, ".local", "bin", "kepler");
    const receiptPath = Path.join(roots.home, ".config", "vialactea-works", "kepler", "installation.json");
    expect(Fs.readlinkSync(selector)).toBe(`generations/${installed.generationId}`);
    expect(Fs.readlinkSync(launcher)).toBe(Path.join(selector, "bin", "kepler"));
    await discoverActualPiResources({
      ...roots,
      packageSource: Path.join(roots.home, ".kepler-dist", "current"),
    });
    const receiptBeforeNoOp = Fs.readFileSync(receiptPath);
    const settingsBeforeNoOp = Fs.readFileSync(roots.settingsPath);
    const noOp = await runCandidateSetup({ binary: launcher, ...roots });
    expect(noOp.exitCode, `${noOp.stdout}\n${noOp.stderr}`).toBe(0);
    expect(parseSuccessfulSetup(noOp.stdout)).toEqual({
      generationId: installed.generationId,
      installationMode: "no-op",
      release: currentReleaseVersion(),
    });
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBeforeNoOp);
    expect(Fs.readFileSync(roots.settingsPath)).toEqual(settingsBeforeNoOp);
  }, 600_000);

  it("transitions a genuine flat installation while preserving its legacy receipt and user-owned data", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const legacy = installLegacyFlatState(roots.home);
    const binary = extractCandidate(root, candidate);
    const result = await runCandidateSetup({ binary, ...roots });
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    const installed = parseSuccessfulSetup(result.stdout);
    expect(installed.installationMode).toBe("legacy-transition");
    expect(Fs.readFileSync(legacy.flatBinary)).toEqual(legacy.oldBinary);
    expect(Fs.readlinkSync(legacy.stableLauncher)).toBe(Path.join(roots.home, ".kepler-dist", "current", "bin", "kepler"));
    const globalHome = Path.join(roots.home, ".config", "vialactea-works", "kepler");
    expect(Fs.readFileSync(Path.join(globalHome, "settings.yaml"))).toEqual(legacy.oldSettings);
    expect(Fs.readFileSync(Path.join(globalHome, "templates", "user.md"))).toEqual(legacy.userTemplate);
    const receiptPath = Path.join(globalHome, "installation.json");
    const receipt = parseInstallationReceipt(Fs.readFileSync(receiptPath, "utf8"));
    expect(receipt.kind).toBe("current-v2");
    const transactionDirectory = Path.join(roots.home, ".kepler-dist", "transactions");
    const journals = Fs.readdirSync(transactionDirectory).filter((name) => name.endsWith(".json"));
    expect(journals).toHaveLength(1);
    const journal = JSON.parse(Fs.readFileSync(Path.join(transactionDirectory, journals[0]!), "utf8")) as {
      readonly state?: unknown;
      readonly preimages?: { readonly installation_record?: { readonly contents_base64?: unknown } };
    };
    expect(journal.state).toBe("committed");
    expect(Buffer.from(String(journal.preimages?.installation_record?.contents_base64 ?? ""), "base64")).toEqual(legacy.oldReceipt);
    await discoverActualPiResources({
      ...roots,
      packageSource: Path.join(roots.home, ".kepler-dist", "current"),
    });
  }, 600_000);

  it("requires an exact native-transfer digest and fails closed if package ownership changes", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const external = createExternalSkillPackage(roots.agentDirectory, roots.settingsPath);
    const binary = extractCandidate(root, candidate);
    const settingsBefore = Fs.readFileSync(roots.settingsPath);
    const confirmation = await runCandidateSetup({ binary, ...roots });
    expect(confirmation.exitCode).not.toBe(0);
    const confirmationEnvelope = parseCliEnvelope(confirmation.stdout);
    expect(confirmationEnvelope.status).toBe("failed");
    expect(confirmationEnvelope.data.code).toBe("native_transfer_confirmation_required");
    const confirmationDetails = confirmationEnvelope.data.details as { readonly native_transfer_plan?: { readonly digest?: unknown } };
    const consentDigest = confirmationDetails.native_transfer_plan?.digest;
    if (typeof consentDigest !== "string") throw new Error("Setup did not return an exact native-transfer consent digest");
    expect(Fs.readFileSync(roots.settingsPath)).toEqual(settingsBefore);
    Fs.writeFileSync(external.skillPath, "---\nname: kepler-quality\ndescription: changed\n---\n\nchanged user content\n");
    const stale = await runCandidateSetup({
      binary,
      ...roots,
      arguments: ["--accept-native-transfer", consentDigest],
    });
    expect(stale.exitCode).not.toBe(0);
    const staleEnvelope = parseCliEnvelope(stale.stdout);
    expect(staleEnvelope.status).toBe("failed");
    expect(staleEnvelope.data.code).toBe("native_transfer_stale");
    expect(Fs.readFileSync(roots.settingsPath)).toEqual(settingsBefore);
    expect(Fs.readFileSync(external.skillPath, "utf8")).toContain("changed user content");
    expect(Fs.existsSync(Path.join(roots.home, ".kepler-dist"))).toBe(false);
    expect(Fs.existsSync(Path.join(roots.home, ".config", "vialactea-works", "kepler", "installation.json"))).toBe(false);
  }, 600_000);

  it("transfers a native package only after explicit consent to the current digest", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const external = createExternalSkillPackage(roots.agentDirectory, roots.settingsPath);
    const externalFileBefore = Fs.readFileSync(external.skillPath);
    const binary = extractCandidate(root, candidate);
    const confirmation = await runCandidateSetup({ binary, ...roots });
    expect(confirmation.exitCode).not.toBe(0);
    const confirmationEnvelope = parseCliEnvelope(confirmation.stdout);
    expect(confirmationEnvelope.data.code).toBe("native_transfer_confirmation_required");
    const details = confirmationEnvelope.data.details as { readonly native_transfer_plan?: { readonly digest?: unknown } };
    const digest = details.native_transfer_plan?.digest;
    if (typeof digest !== "string") throw new Error("Setup did not return a native-transfer digest");
    const accepted = await runCandidateSetup({
      binary,
      ...roots,
      arguments: ["--accept-native-transfer", digest],
    });
    expect(accepted.exitCode, `${accepted.stdout}\n${accepted.stderr}`).toBe(0);
    const installed = parseSuccessfulSetup(accepted.stdout);
    expect(installed.installationMode).toBe("first-install");
    const successEnvelope = parseCliEnvelope(accepted.stdout);
    expect(successEnvelope.data.native_transfer).toMatchObject({
      digest,
      source: external.source,
      operation: "replace-package-entry",
    });
    const settings = JSON.parse(Fs.readFileSync(roots.settingsPath, "utf8")) as {
      readonly packages?: readonly unknown[];
      readonly defaultThinkingLevel?: unknown;
      readonly customSentinel?: unknown;
      readonly unrelated?: unknown;
    };
    expect(settings.packages).not.toContain(external.source);
    expect(settings.packages).toContain(Path.join(roots.home, ".kepler-dist", "current"));
    expect(settings.defaultThinkingLevel).toBe("low");
    expect(settings.customSentinel).toEqual({ preserve: "archive-e2e" });
    expect(settings.unrelated).toEqual({ preserve: "bootstrap-e2e-sentinel" });
    expect(Fs.readFileSync(external.skillPath)).toEqual(externalFileBefore);
    expect(Fs.existsSync(external.packageRoot)).toBe(true);
    await discoverActualPiResources({
      ...roots,
      packageSource: Path.join(roots.home, ".kepler-dist", "current"),
    });
  }, 600_000);

  it("repairs missing native package registration without replacing the selected generation", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const binary = extractCandidate(root, candidate);
    const first = await runCandidateSetup({ binary, ...roots });
    expect(first.exitCode, `${first.stdout}\n${first.stderr}`).toBe(0);
    const installed = parseSuccessfulSetup(first.stdout);
    const selector = Path.join(roots.home, ".kepler-dist", "current");
    const selectedTarget = Fs.readlinkSync(selector);
    const selectedGenerationRoot = Fs.realpathSync(selector);
    const settings = JSON.parse(Fs.readFileSync(roots.settingsPath, "utf8")) as Record<string, unknown> & {
      readonly packages?: readonly unknown[];
    };
    const managedPackage = settings.packages?.find((item) =>
      typeof item === "string" && item.includes(".kepler-dist")
    );
    if (typeof managedPackage !== "string") throw new Error("Installed package source was not registered in native Pi settings");
    Fs.writeFileSync(roots.settingsPath, `${JSON.stringify({
      ...settings,
      packages: settings.packages?.filter((item) => item !== managedPackage),
    }, null, 2)}\n`);
    const repair = await runCandidateSetup({ binary: Path.join(roots.home, ".local", "bin", "kepler"), ...roots });
    expect(repair.exitCode, `${repair.stdout}\n${repair.stderr}`).toBe(0);
    expect(parseSuccessfulSetup(repair.stdout)).toEqual({
      generationId: installed.generationId,
      installationMode: "repair",
      release: currentReleaseVersion(),
    });
    expect(Fs.readlinkSync(selector)).toBe(selectedTarget);
    expect(Fs.realpathSync(selector)).toBe(selectedGenerationRoot);
    const repairedSettings = JSON.parse(Fs.readFileSync(roots.settingsPath, "utf8")) as Record<string, unknown> & {
      readonly packages?: readonly unknown[];
    };
    expect(repairedSettings.packages).toContain(managedPackage);
    expect(repairedSettings.defaultThinkingLevel).toBe("low");
    expect(repairedSettings.customSentinel).toEqual({ preserve: "archive-e2e" });
    expect(repairedSettings.unrelated).toEqual({ preserve: "bootstrap-e2e-sentinel" });
    await discoverActualPiResources({
      ...roots,
      packageSource: Path.join(roots.home, ".kepler-dist", "current"),
    });
  }, 600_000);

  it("refuses an unknown generation-recovery record without mutating selected installation state", async () => {
    const target = currentTarget();
    const candidate = exactCandidateFor(target);
    const root = makeTemporaryRoot();
    const roots = createDirectRoots(root);
    const binary = extractCandidate(root, candidate);
    const installed = await runCandidateSetup({ binary, ...roots });
    expect(installed.exitCode, `${installed.stdout}\n${installed.stderr}`).toBe(0);
    const selector = Path.join(roots.home, ".kepler-dist", "current");
    const receiptPath = Path.join(roots.home, ".config", "vialactea-works", "kepler", "installation.json");
    const before = {
      selector: Fs.readlinkSync(selector),
      receipt: Fs.readFileSync(receiptPath),
      settings: Fs.readFileSync(roots.settingsPath),
    };
    const transactionDirectory = Path.join(roots.home, ".kepler-dist", "transactions");
    const unknownRecord = Path.join(transactionDirectory, "unrecognized.json");
    const unknownBytes = Buffer.from("{ not a valid owned generation journal }\n");
    Fs.writeFileSync(unknownRecord, unknownBytes);
    const retry = await runCandidateSetup({ binary: Path.join(roots.home, ".local", "bin", "kepler"), ...roots });
    expect(retry.exitCode).not.toBe(0);
    const envelope = parseCliEnvelope(retry.stdout);
    expect(envelope.status).toBe("failed");
    expect(String(envelope.data.message)).toContain("Malformed transaction evidence");
    expect(Fs.readlinkSync(selector)).toBe(before.selector);
    expect(Fs.readFileSync(receiptPath)).toEqual(before.receipt);
    expect(Fs.readFileSync(roots.settingsPath)).toEqual(before.settings);
    expect(Fs.readFileSync(unknownRecord)).toEqual(unknownBytes);
  }, 600_000);
});
