import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import * as Yaml from "yaml";
import {
  parseMetadataJsonObject,
} from "./installation-record.js";
import {
  readPiSettingsSnapshot,
  type PiSettingsSnapshot,
} from "./pi-settings-adapter.js";

export const SUPPORTED_PI_RELEASE = "1.2.0";
export const SUPPORTED_PI_SUBAGENTS_RELEASE = "0.76.1";

const keplerSkills = new Set([
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
]);
const keplerAgents = new Set([
  "kepler-architect",
  "kepler-orchestrator",
  "kepler-coder",
  "kepler-reviewer",
]);

export interface PiPreflightOptions {
  readonly environment: NodeJS.ProcessEnv;
  readonly projectDirectory: string;
  readonly packageSource: string;
  readonly detectPiVersion?: () => string;
  readonly allowResourceConflicts?: boolean;
}

export interface PiPreflightResult {
  readonly host: { readonly id: "pi"; readonly release: string; readonly check: "matches" };
  readonly loader: {
    readonly id: "pi-subagents";
    readonly release: string;
    readonly check: "matches";
  };
  readonly agentDirectory: string;
  readonly packageDirectory: string;
  readonly piAssetsDirectory?: string;
  readonly settingsPath: string;
  readonly projectSettingsPath: string;
  readonly projectPackageEntries: readonly unknown[];
  readonly projectPackagesValid: boolean;
  readonly packageSource: string;
  readonly settingsSnapshot: PiSettingsSnapshot;
  readonly conflicts: readonly PiPreflightConflict[];
}

export interface PiPreflightConflict {
  readonly scope: "user" | "project";
  readonly kind: "agent" | "skill" | "override" | "package" | "settings";
  readonly name: string;
  readonly path: string;
  readonly message: string;
  readonly source?: string;
  readonly package_root?: string;
}

export class PiPreflightError extends Error {
  constructor(
    readonly code: "pi_unavailable" | "pi_unsupported" | "pi_settings_unavailable" | "pi_loader_unavailable" | "pi_resource_conflict",
    message: string,
    readonly details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PiPreflightError";
  }
}

export function preflightPi(options: PiPreflightOptions): PiPreflightResult {
  const agentDirectory = resolveAgentDirectory(options.environment);
  const settingsPath = Path.join(agentDirectory, "settings.json");
  let settingsSnapshot: PiSettingsSnapshot;
  try {
    settingsSnapshot = readPiSettingsSnapshot(settingsPath);
  } catch (error) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      errorMessage(error),
      { settings_path: settingsPath },
      { cause: error },
    );
  }

  const packageDirectory = resolvePackageDirectory(agentDirectory);
  const piAssetsDirectory = resolvePiAssetsDirectory(options.environment);
  const piRelease = detectSupportedPiRelease(
    options.detectPiVersion ?? (() => readPiVersion(options.environment, agentDirectory)),
  );
  const projectDirectory = resolveVisibleProjectDirectory(
    options.projectDirectory,
    options.environment.HOME ?? Os.homedir(),
  );
  const projectSettingsPath = Path.join(projectDirectory, ".pi", "settings.json");
  const userSettings = readSettingsObject(settingsPath, "user");
  const projectSettings = readOptionalSettingsObject(projectSettingsPath, "project");
  const homeDirectory = options.environment.HOME ?? Os.homedir();
  const loaderRelease = detectPiSubagentsRelease({
    packageDirectory,
    userSettings,
    userSettingsDirectory: agentDirectory,
    projectSettings,
    projectSettingsDirectory: Path.dirname(projectSettingsPath),
    homeDirectory,
  });
  const conflicts = collectResourceConflicts({
    agentDirectory,
    packageDirectory,
    projectDirectory,
    projectSettingsPath,
    userSettings,
    projectSettings,
    packageSource: options.packageSource,
    homeDirectory: options.environment.HOME ?? Os.homedir(),
    extraAgentDirectories: options.environment.PI_SUBAGENT_EXTRA_AGENT_DIRS ?? "",
  });
  if (conflicts.length > 0 && !options.allowResourceConflicts) {
    throw new PiPreflightError(
      "pi_resource_conflict",
      `Pi preflight found visible resource conflicts: ${conflicts.map(({ name, path }) => `${name} at ${path}`).join("; ")}.`,
      { conflicts },
    );
  }

  return {
    host: { id: "pi", release: piRelease, check: "matches" },
    loader: {
      id: "pi-subagents",
      release: loaderRelease,
      check: "matches",
    },
    agentDirectory,
    packageDirectory,
    ...(piAssetsDirectory ? { piAssetsDirectory } : {}),
    settingsPath,
    projectSettingsPath,
    projectPackageEntries: matchingLocalPackageEntries(
      projectSettings,
      Path.dirname(projectSettingsPath),
      options.packageSource,
      homeDirectory,
    ),
    projectPackagesValid: projectSettings.packages === undefined || Array.isArray(projectSettings.packages),
    packageSource: Path.resolve(options.packageSource),
    settingsSnapshot,
    conflicts,
  };
}

function resolveAgentDirectory(environment: NodeJS.ProcessEnv): string {
  let requested: string | undefined;
  if (Object.hasOwn(environment, "KEPLER_PI_AGENT_DIR")) {
    requested = environment.KEPLER_PI_AGENT_DIR;
  } else if (Object.hasOwn(environment, "PI_CODING_AGENT_DIR")) {
    requested = environment.PI_CODING_AGENT_DIR;
  } else {
    requested = Path.join(environment.HOME ?? Os.homedir(), ".pi", "agent");
  }
  if (!requested) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      "The selected Pi agent directory is empty.",
    );
  }
  const homeDirectory = environment.HOME ?? Os.homedir();
  let expanded = requested;
  if (requested === "~") {
    expanded = homeDirectory;
  } else if (requested.startsWith("~/") || requested.startsWith("~\\")) {
    expanded = Path.join(homeDirectory, requested.slice(2));
  }
  const directory = Path.resolve(expanded);
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(directory);
  } catch (error) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      `The selected Pi agent directory is unavailable: ${errorMessage(error)}`,
      { agent_directory: directory },
      { cause: error },
    );
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      `The selected Pi agent directory must be a regular directory: ${directory}`,
      { agent_directory: directory },
    );
  }
  return directory;
}

function resolvePackageDirectory(agentDirectory: string): string {
  const directory = Path.join(agentDirectory, "npm", "node_modules");
  let stat: Fs.Stats;
  try {
    stat = Fs.statSync(directory);
  } catch (error) {
    if (isMissingPath(error)) return directory;
    throw new PiPreflightError(
      "pi_loader_unavailable",
      `Pi package directory is unavailable: ${errorMessage(error)}`,
      { package_directory: directory },
      { cause: error },
    );
  }
  if (!stat.isDirectory()) {
    throw new PiPreflightError(
      "pi_loader_unavailable",
      `Pi package directory is not a directory: ${directory}`,
      { package_directory: directory },
    );
  }
  return directory;
}

function resolvePiAssetsDirectory(environment: NodeJS.ProcessEnv): string | undefined {
  if (!Object.hasOwn(environment, "PI_PACKAGE_DIR")) return undefined;
  const requested = environment.PI_PACKAGE_DIR;
  if (!requested) {
    throw new PiPreflightError(
      "pi_unavailable",
      "PI_PACKAGE_DIR is set but empty.",
    );
  }
  return Path.resolve(requested);
}

function detectSupportedPiRelease(detect: () => string): string {
  let release: string;
  try {
    release = detect().trim();
  } catch (error) {
    throw new PiPreflightError(
      "pi_unavailable",
      `Could not detect the installed Pi CLI: ${errorMessage(error)}`,
      {},
      { cause: error },
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(release) || release !== SUPPORTED_PI_RELEASE) {
    throw new PiPreflightError(
      "pi_unsupported",
      `Unsupported Pi version ${release || "unknown"}; setup requires Pi ${SUPPORTED_PI_RELEASE}.`,
      { detected_release: release || null, supported_release: SUPPORTED_PI_RELEASE },
    );
  }
  return release;
}

function readPiVersion(environment: NodeJS.ProcessEnv, agentDirectory: string): string {
  const safeEnvironment: NodeJS.ProcessEnv = {
    PATH: environment.PATH ?? process.env.PATH ?? "",
    HOME: environment.HOME ?? Os.homedir(),
    USERPROFILE: environment.USERPROFILE ?? environment.HOME ?? Os.homedir(),
    PI_CODING_AGENT_DIR: agentDirectory,
    PI_PACKAGE_DIR: environment.PI_PACKAGE_DIR,
    PI_OFFLINE: "1",
  };
  const output = execFileSync(environment.KEPLER_PI_BINARY ?? "pi", ["--version"], {
    env: safeEnvironment,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
    windowsHide: true,
  });
  const release = output.trim().match(/(?:^|\s)(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
  if (!release) throw new Error("Pi CLI did not report a stable version");
  return release;
}

function detectPiSubagentsRelease(input: {
  readonly packageDirectory: string;
  readonly userSettings: Record<string, unknown>;
  readonly userSettingsDirectory: string;
  readonly projectSettings: Record<string, unknown>;
  readonly projectSettingsDirectory: string;
  readonly homeDirectory: string;
}): string {
  const packageSelections = effectivePiPackageSelections(input);
  const candidates = packageSelections.flatMap((selection) => {
    if (!selection.packageRoot) return [];
    return findPiSubagentsInPackage(
      selection.packageRoot,
      selection.filters,
      selection.deltas,
      input.homeDirectory,
    );
  }).filter((candidate) => isEnabledByVisibleExtensionSettings(candidate.entryPath, input));
  const uniqueCandidates = [...new Map(
    candidates.map((candidate) => [Path.resolve(candidate.packageRoot), candidate]),
  ).values()];
  if (uniqueCandidates.length === 0) {
    throw new PiPreflightError(
      "pi_loader_unavailable",
      "The pi-subagents loader has no configured enabled entry in Pi settings or no existing enabled extension entry file.",
      {
        package_directory: input.packageDirectory,
        user_settings_path: Path.join(input.userSettingsDirectory, "settings.json"),
        project_settings_path: Path.join(input.projectSettingsDirectory, "settings.json"),
      },
    );
  }
  if (uniqueCandidates.length !== 1) {
    const detected = uniqueCandidates
      .map(({ packageRoot, version }) => `${version} at ${packageRoot}`)
      .sort((left, right) => left.localeCompare(right));
    throw new PiPreflightError(
      "pi_loader_unavailable",
      `Ambiguous pi-subagents loader roots: ${detected.join("; ")}.`,
      { package_directory: input.packageDirectory, detected_loader_roots: detected },
    );
  }
  const candidate = uniqueCandidates[0];
  if (candidate.version !== SUPPORTED_PI_SUBAGENTS_RELEASE) {
    throw new PiPreflightError(
      "pi_loader_unavailable",
      `Unsupported pi-subagents version ${candidate.version}; setup requires ${SUPPORTED_PI_SUBAGENTS_RELEASE}.`,
      {
        package_directory: input.packageDirectory,
        detected_release: candidate.version,
        package_root: candidate.packageRoot,
      },
    );
  }
  return candidate.version;
}

function effectivePiPackageSelections(input: {
  readonly userSettings: Record<string, unknown>;
  readonly userSettingsDirectory: string;
  readonly projectSettings: Record<string, unknown>;
  readonly projectSettingsDirectory: string;
  readonly homeDirectory: string;
}): Array<{ packageRoot: string | undefined; filters: unknown[]; deltas: unknown[] }> {
  const selections = new Map<string, { packageRoot: string | undefined; filters: unknown[]; deltas: unknown[] }>();
  const addPersonalPackages = (settings: Record<string, unknown>, settingsDirectory: string) => {
    const packages = settings.packages;
    if (!Array.isArray(packages)) return;
    for (const entry of packages) {
      const source = packageEntrySource(entry);
      if (!source) continue;
      const identity = piPackageIdentity(source, settingsDirectory, input.homeDirectory);
      if (!identity) continue;
      selections.set(identity, {
        packageRoot: resolvePackageSource(source, settingsDirectory, input.homeDirectory),
        filters: [entry],
        deltas: [],
      });
    }
  };
  addPersonalPackages(input.userSettings, input.userSettingsDirectory);

  const projectPackages = input.projectSettings.packages;
  if (Array.isArray(projectPackages)) {
    for (const entry of projectPackages) {
      const source = packageEntrySource(entry);
      if (!source) continue;
      const identity = piPackageIdentity(source, input.projectSettingsDirectory, input.homeDirectory);
      if (!identity) continue;
      if (asObject(entry)?.autoload === false) {
        const personal = selections.get(identity);
        if (personal) personal.deltas.push(entry);
        continue;
      }
      selections.set(identity, {
        packageRoot: resolvePackageSource(source, input.projectSettingsDirectory, input.homeDirectory),
        filters: [entry],
        deltas: [],
      });
    }
  }
  return [...selections.values()];
}

function piPackageIdentity(
  source: string,
  settingsDirectory: string,
  homeDirectory: string,
): string | undefined {
  if (source.startsWith("npm:")) {
    const packageName = source.slice("npm:".length).replace(/@[^/@]+$/, "");
    return packageName ? `npm:${packageName}` : undefined;
  }
  const localSource = resolveLocalPackageSource(source, settingsDirectory, homeDirectory);
  return localSource ? `local:${Path.resolve(localSource)}` : undefined;
}

function findPiSubagentsInPackage(
  packageRoot: string,
  filters: readonly unknown[],
  deltas: readonly unknown[],
  homeDirectory: string,
): Array<{ packageRoot: string; version: string; entryPath: string }> {
  const packageManifest = readPackageManifest(Path.join(packageRoot, "package.json"));
  const extensionEntries = stringArray(asObject(packageManifest?.pi)?.extensions);
  if (!packageManifest || !extensionEntries) return [];
  const candidates: Array<{ packageRoot: string; version: string; entryPath: string }> = [];
  for (const extensionEntry of extensionEntries) {
    for (const extensionPath of expandResourcePattern(extensionEntry, packageRoot, homeDirectory)) {
      if (!isRegularFile(extensionPath)) continue;
      const personallyEnabled = filters.every((filter) =>
        isPackageExtensionEnabled(filter, extensionPath, packageRoot, homeDirectory),
      );
      const delta = packageExtensionDeltaDecision(deltas, extensionPath, packageRoot, homeDirectory);
      if (delta === false || (!personallyEnabled && delta !== true)) continue;
      const loaderPackage = findPiSubagentsPackage(extensionPath, packageRoot);
      if (!loaderPackage || !isDeclaredExistingLoaderEntry(
        loaderPackage.root,
        loaderPackage.manifest,
        extensionPath,
        homeDirectory,
      )) continue;
      candidates.push({
        packageRoot: loaderPackage.root,
        version: typeof loaderPackage.manifest.version === "string"
          ? loaderPackage.manifest.version
          : "unknown",
        entryPath: extensionPath,
      });
    }
  }
  return candidates;
}

function findPiSubagentsPackage(
  extensionPath: string,
  packageRoot: string,
): { root: string; manifest: Record<string, unknown> } | undefined {
  const resolvedRoot = Path.resolve(packageRoot);
  let current = Path.dirname(Path.resolve(extensionPath));
  while (isPathWithin(resolvedRoot, current)) {
    const manifest = readPackageManifest(Path.join(current, "package.json"));
    if (manifest?.name === "pi-subagents") return { root: current, manifest };
    if (current === resolvedRoot) break;
    current = Path.dirname(current);
  }
  return undefined;
}

function isDeclaredExistingLoaderEntry(
  packageRoot: string,
  manifest: Record<string, unknown>,
  configuredEntryPath: string,
  homeDirectory: string,
): boolean {
  const extensionEntries = stringArray(asObject(manifest.pi)?.extensions);
  if (!extensionEntries || extensionEntries.length === 0) return false;
  const configuredPath = Path.resolve(configuredEntryPath);
  return extensionEntries.some((entry) =>
    expandResourcePattern(entry, packageRoot, homeDirectory).some((path) =>
      isRegularFile(path) &&
      isPathWithin(packageRoot, path) &&
      Path.resolve(path) === configuredPath,
    ),
  );
}

function isPackageExtensionEnabled(
  packageEntry: unknown,
  extensionPath: string,
  packageRoot: string,
  homeDirectory: string,
): boolean {
  const rawFilters = asObject(packageEntry)?.extensions;
  if (rawFilters === undefined) return true;
  const filters = stringArray(rawFilters);
  if (!filters || filters.length === 0) return false;
  const target = Path.resolve(extensionPath);
  let hasIncludes = false;
  let included = false;
  let excluded = false;
  for (const filter of filters) {
    if (filter.startsWith("!")) {
      excluded ||= expandResourcePattern(filter.slice(1), packageRoot, homeDirectory)
        .some((path) => Path.resolve(path) === target);
      continue;
    }
    if (filter.startsWith("-")) {
      excluded ||= Path.resolve(resolveResourcePath(filter.slice(1), packageRoot, homeDirectory)) === target;
      continue;
    }
    hasIncludes = true;
    if (filter.startsWith("+")) {
      included ||= Path.resolve(resolveResourcePath(filter.slice(1), packageRoot, homeDirectory)) === target;
    } else {
      included ||= packageFilterMatches(filter, target, packageRoot, homeDirectory);
    }
  }
  if (excluded) return false;
  return hasIncludes ? included : true;
}

function packageExtensionDeltaDecision(
  entries: readonly unknown[],
  extensionPath: string,
  packageRoot: string,
  homeDirectory: string,
): boolean | undefined {
  const target = Path.resolve(extensionPath);
  let forceIncluded = false;
  let excluded = false;
  for (const entry of entries) {
    const rawFilters = asObject(entry)?.extensions;
    if (rawFilters === undefined) continue;
    const filters = stringArray(rawFilters);
    if (!filters || filters.length === 0) return false;
    for (const filter of filters) {
      if (filter.startsWith("!")) {
        excluded ||= expandResourcePattern(filter.slice(1), packageRoot, homeDirectory)
          .some((path) => Path.resolve(path) === target);
      } else if (filter.startsWith("-")) {
        excluded ||= Path.resolve(resolveResourcePath(filter.slice(1), packageRoot, homeDirectory)) === target;
      } else if (filter.startsWith("+")) {
        forceIncluded ||= Path.resolve(resolveResourcePath(filter.slice(1), packageRoot, homeDirectory)) === target;
      }
    }
  }
  if (excluded) return false;
  return forceIncluded ? true : undefined;
}

function packageFilterMatches(
  pattern: string,
  targetPath: string,
  packageRoot: string,
  homeDirectory: string,
): boolean {
  const resolvedPattern = resolveResourcePath(pattern, packageRoot, homeDirectory);
  if (!isGlobPattern(resolvedPattern)) return Path.resolve(resolvedPattern) === targetPath;
  return expandResourcePattern(pattern, packageRoot, homeDirectory)
    .some((path) => Path.resolve(path) === targetPath);
}

function isEnabledByVisibleExtensionSettings(
  extensionPath: string,
  input: {
    readonly userSettings: Record<string, unknown>;
    readonly userSettingsDirectory: string;
    readonly projectSettings: Record<string, unknown>;
    readonly projectSettingsDirectory: string;
    readonly homeDirectory: string;
  },
): boolean {
  const projectOverride = extensionSettingOverride(
    input.projectSettings,
    input.projectSettingsDirectory,
    extensionPath,
    input.homeDirectory,
  );
  if (projectOverride !== undefined) return projectOverride;
  return extensionSettingOverride(
    input.userSettings,
    input.userSettingsDirectory,
    extensionPath,
    input.homeDirectory,
  ) ?? true;
}

function extensionSettingOverride(
  settings: Record<string, unknown>,
  settingsDirectory: string,
  extensionPath: string,
  homeDirectory: string,
): boolean | undefined {
  const rawEntries = settings.extensions;
  if (rawEntries === undefined) return undefined;
  const entries = stringArray(rawEntries);
  if (!entries) return false;
  const target = Path.resolve(extensionPath);
  let enabled = false;
  let disabled = false;
  for (const entry of entries) {
    if (entry.startsWith("!")) {
      disabled ||= expandResourcePattern(entry.slice(1), settingsDirectory, homeDirectory)
        .some((path) => Path.resolve(path) === target);
      continue;
    }
    const hasPrefix = entry.startsWith("+") || entry.startsWith("-");
    const source = hasPrefix ? entry.slice(1) : entry;
    if (Path.resolve(resolveResourcePath(source, settingsDirectory, homeDirectory)) !== target) continue;
    if (entry.startsWith("-")) disabled = true;
    else enabled = true;
  }
  if (disabled) return false;
  return enabled ? true : undefined;
}

function isRegularFile(path: string): boolean {
  try {
    return Fs.lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isPathWithin(root: string, path: string): boolean {
  const relative = Path.relative(Path.resolve(root), Path.resolve(path));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${Path.sep}`) &&
    !Path.isAbsolute(relative)
  );
}

function readPackageManifest(path: string): Record<string, unknown> | undefined {
  try {
    return parseMetadataJsonObject(Fs.readFileSync(path, "utf8"), "Pi package manifest");
  } catch {
    return undefined;
  }
}

function readSettingsObject(path: string, scope: "user" | "project"): Record<string, unknown> {
  const state = readSettingsPath(path, scope);
  return state ?? {};
}

function readOptionalSettingsObject(
  path: string,
  scope: "user" | "project",
): Record<string, unknown> {
  return readSettingsPath(path, scope) ?? {};
}

function readSettingsPath(
  path: string,
  scope: "user" | "project",
): Record<string, unknown> | undefined {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(path);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw new PiPreflightError(
      "pi_settings_unavailable",
      `Could not inspect ${scope} Pi settings: ${path}`,
      { settings_path: path, scope },
      { cause: error },
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      `${scope} Pi settings must be a regular file: ${path}`,
      { settings_path: path, scope },
    );
  }
  try {
    return parseMetadataJsonObject(Fs.readFileSync(path, "utf8"), `${scope} Pi settings`);
  } catch (error) {
    throw new PiPreflightError(
      "pi_settings_unavailable",
      errorMessage(error),
      { settings_path: path, scope },
      { cause: error },
    );
  }
}

function resolveVisibleProjectDirectory(projectDirectory: string, homeDirectory: string): string {
  const requested = Path.resolve(projectDirectory);
  const home = Path.resolve(homeDirectory);
  let current = requested;
  while (true) {
    if (Path.resolve(current) === home) return requested;
    if (
      isDirectory(Path.join(current, ".pi")) ||
      isDirectory(Path.join(current, ".agents"))
    ) return current;
    const parent = Path.dirname(current);
    if (parent === current) return requested;
    current = parent;
  }
}

function collectResourceConflicts(input: {
  readonly agentDirectory: string;
  readonly packageDirectory: string;
  readonly projectDirectory: string;
  readonly projectSettingsPath: string;
  readonly userSettings: Record<string, unknown>;
  readonly projectSettings: Record<string, unknown>;
  readonly packageSource: string;
  readonly homeDirectory: string;
  readonly extraAgentDirectories: string;
}): PiPreflightConflict[] {
  const conflicts: PiPreflightConflict[] = [];
  collectAgentOverrides(input.userSettings, "user", conflicts);
  collectAgentOverrides(input.projectSettings, "project", conflicts);
  collectAgentScanDirs(input.userSettings, input.agentDirectory, input.homeDirectory, "user", conflicts);
  collectAgentScanDirs(
    input.projectSettings,
    Path.dirname(input.projectSettingsPath),
    input.homeDirectory,
    "project",
    conflicts,
  );
  collectProfiles(Path.join(input.agentDirectory, "agents"), "user", "agent", conflicts);
  collectProfiles(Path.join(input.homeDirectory, ".agents"), "user", "agent", conflicts);
  for (const directory of input.extraAgentDirectories.split(Path.delimiter)) {
    if (directory) collectProfiles(Path.resolve(directory), "user", "agent", conflicts);
  }
  collectProfiles(Path.join(input.projectDirectory, ".pi", "agents"), "project", "agent", conflicts);
  collectProfiles(Path.join(input.projectDirectory, ".agents"), "project", "agent", conflicts);
  collectPackageResources(
    input.projectDirectory,
    "project root",
    input.packageSource,
    input.homeDirectory,
    "project",
    conflicts,
  );
  collectConfiguredResources(input.userSettings, input.agentDirectory, input.homeDirectory, "user", "skill", conflicts);
  collectConfiguredResources(
    input.projectSettings,
    Path.dirname(input.projectSettingsPath),
    input.homeDirectory,
    "project",
    "skill",
    conflicts,
  );
  collectConfiguredPackageResources(
    input.userSettings,
    input.agentDirectory,
    input.packageSource,
    input.homeDirectory,
    "user",
    conflicts,
  );
  collectConfiguredPackageResources(
    input.projectSettings,
    Path.dirname(input.projectSettingsPath),
    input.packageSource,
    input.homeDirectory,
    "project",
    conflicts,
  );
  collectNodeModulesPackageResources(
    input.packageDirectory,
    input.packageSource,
    input.homeDirectory,
    "user",
    conflicts,
  );
  collectNodeModulesPackageResources(
    Path.join(Path.dirname(input.projectSettingsPath), "npm", "node_modules"),
    input.packageSource,
    input.homeDirectory,
    "project",
    conflicts,
  );
  const unique = new Map<string, PiPreflightConflict>();
  for (const conflict of conflicts) {
    const key = `${conflict.scope}:${conflict.kind}:${conflict.name}:${conflict.path}`;
    const previous = unique.get(key);
    if (!previous || (!previous.source && conflict.source)) unique.set(key, conflict);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.scope}:${left.kind}:${left.name}:${left.path}`.localeCompare(
      `${right.scope}:${right.kind}:${right.name}:${right.path}`,
    ),
  );
}

function collectAgentOverrides(
  settings: Record<string, unknown>,
  scope: "user" | "project",
  conflicts: PiPreflightConflict[],
): void {
  const subagents = asObject(settings.subagents);
  for (const key of ["agentOverrides", "agentOverridesByProvider"]) {
    const overrides = asObject(subagents?.[key]);
    if (!overrides) continue;
    for (const [name, value] of Object.entries(overrides)) {
      const names = key === "agentOverridesByProvider"
        ? Object.keys(asObject(value) ?? {})
        : [name];
      for (const agentName of names) {
        if (keplerAgents.has(agentName)) {
          conflicts.push({
            scope,
            kind: "override",
            name: agentName,
            path: `settings.json#/subagents/${key}`,
            message: `A ${scope} Pi subagent override shadows ${agentName}.`,
          });
        }
      }
    }
  }
}

function collectAgentScanDirs(
  settings: Record<string, unknown>,
  baseDirectory: string,
  homeDirectory: string,
  scope: "user" | "project",
  conflicts: PiPreflightConflict[],
): void {
  const subagents = asObject(settings.subagents);
  const scanDirs = subagents?.agentScanDirs;
  if (scanDirs === undefined) return;
  if (!Array.isArray(scanDirs) || scanDirs.some((entry) => typeof entry !== "string")) {
    conflicts.push({
      scope,
      kind: "settings",
      name: "agentScanDirs",
      path: "settings.json#/subagents/agentScanDirs",
      message: `The ${scope} Pi agentScanDirs setting cannot be checked safely.`,
    });
    return;
  }
  const excluded = new Set<string>();
  if (Array.isArray(subagents?.agentExcludeDirs)) {
    for (const entry of subagents.agentExcludeDirs) {
      if (typeof entry === "string") {
        excluded.add(Path.resolve(resolveResourcePath(entry, baseDirectory, homeDirectory)));
      }
    }
  }
  for (const source of scanDirs as string[]) {
    for (const directory of expandResourcePattern(source, baseDirectory, homeDirectory)) {
      const resolved = Path.resolve(directory);
      if (excluded.has(resolved)) continue;
      collectProfiles(resolved, scope, "agent", conflicts);
    }
  }
}

function collectConfiguredResources(
  settings: Record<string, unknown>,
  baseDirectory: string,
  homeDirectory: string,
  scope: "user" | "project",
  kind: "agent" | "skill",
  conflicts: PiPreflightConflict[],
): void {
  const settingKey = kind === "skill" ? "skills" : "agents";
  const entries = settings[settingKey];
  if (entries === undefined) return;
  if (!Array.isArray(entries)) {
    conflicts.push({
      scope,
      kind: "settings",
      name: settingKey,
      path: "settings.json",
      message: `The ${scope} Pi ${settingKey} setting is not an array and cannot be checked safely.`,
    });
    return;
  }
  for (const entry of entries) {
    if (typeof entry !== "string") {
      conflicts.push({
        scope,
        kind: "settings",
        name: settingKey,
        path: "settings.json",
        message: `A ${scope} Pi ${settingKey} entry is not a string and cannot be checked safely.`,
      });
      continue;
    }
    if (entry.startsWith("!") || entry.startsWith("-")) continue;
    const source = entry.startsWith("+") ? entry.slice(1) : entry;
    const expanded = expandResourcePattern(source, baseDirectory, homeDirectory);
    for (const resourcePath of expanded) {
      if (kind === "skill") collectProfiles(resourcePath, scope, "skill", conflicts);
      else collectProfiles(resourcePath, scope, "agent", conflicts);
    }
  }
}

function collectConfiguredPackageResources(
  settings: Record<string, unknown>,
  settingsDirectory: string,
  packageSource: string,
  homeDirectory: string,
  scope: "user" | "project",
  conflicts: PiPreflightConflict[],
): void {
  const packages = settings.packages;
  if (packages === undefined) return;
  if (!Array.isArray(packages)) {
    conflicts.push({
      scope,
      kind: "settings",
      name: "packages",
      path: "settings.json",
      message: `The ${scope} Pi packages setting is not an array and cannot be checked safely.`,
    });
    return;
  }
  for (const entry of packages) {
    const source = packageEntrySource(entry);
    if (!source) {
      conflicts.push({
        scope,
        kind: "settings",
        name: "packages",
        path: "settings.json",
        message: `A ${scope} Pi package entry has no readable source and cannot be checked safely.`,
      });
      continue;
    }
    const localSource = resolveLocalPackageSource(source, settingsDirectory, homeDirectory);
    if (localSource && Path.resolve(localSource) === Path.resolve(packageSource)) continue;
    const packageRoot = resolvePackageSource(source, settingsDirectory, homeDirectory);
    if (!packageRoot) {
      conflicts.push({
        scope,
        kind: "package",
        name: source,
        path: "settings.json#/packages",
        message: `Could not inspect the configured ${scope} Pi package source ${source}.`,
      });
      continue;
    }
    collectPackageResources(
      packageRoot,
      source,
      packageSource,
      homeDirectory,
      scope,
      conflicts,
      true,
      { source, packageRoot },
    );
  }
}

function collectNodeModulesPackageResources(
  nodeModulesDirectory: string,
  packageSource: string,
  homeDirectory: string,
  scope: "user" | "project",
  conflicts: PiPreflightConflict[],
): void {
  for (const packageRoot of listPackageRoots(nodeModulesDirectory)) {
    collectPackageResources(packageRoot, packageRoot, packageSource, homeDirectory, scope, conflicts);
  }
}

function listPackageRoots(nodeModulesDirectory: string): string[] {
  let entries: Fs.Dirent[];
  try {
    entries = Fs.readdirSync(nodeModulesDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const path = Path.join(nodeModulesDirectory, entry.name);
    if (!entry.name.startsWith("@")) {
      roots.push(path);
      continue;
    }
    let scopedEntries: Fs.Dirent[];
    try {
      scopedEntries = Fs.readdirSync(path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const scopedEntry of scopedEntries) {
      if (scopedEntry.name.startsWith(".")) continue;
      if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
        roots.push(Path.join(path, scopedEntry.name));
      }
    }
  }
  return roots;
}

function collectPackageResources(
  packageRoot: string,
  source: string,
  packageSource: string,
  homeDirectory: string,
  scope: "user" | "project",
  conflicts: PiPreflightConflict[],
  requiredManifest = false,
  owner?: { readonly source: string; readonly packageRoot: string },
): void {
  if (Path.resolve(packageRoot) === Path.resolve(packageSource)) return;
  const manifestPath = Path.join(packageRoot, "package.json");
  const manifest = readPackageManifest(manifestPath);
  if (!manifest) {
    if (requiredManifest || Fs.existsSync(manifestPath)) {
      conflicts.push({
        scope,
        kind: "package",
        name: source,
        path: packageRoot,
        message: `Could not read the configured ${scope} Pi package manifest.`,
        ...(owner ? { source: owner.source, package_root: owner.packageRoot } : {}),
      });
    }
    return;
  }
  const pi = asObject(manifest.pi);
  const subagents = asObject(pi?.subagents);
  const subagentManifest = asObject(manifest["pi-subagents"]);
  const rawAgentRoots = subagents?.agents ?? subagentManifest?.agents;
  const agentRoots = stringArray(rawAgentRoots);
  const rawSkillRoots = pi?.skills;
  const skillRoots = stringArray(rawSkillRoots);
  if ((rawAgentRoots !== undefined && !agentRoots) || (rawSkillRoots !== undefined && !skillRoots)) {
    conflicts.push({
      scope,
      kind: "package",
      name: source,
      path: manifestPath,
      message: `The ${scope} Pi package resource paths cannot be checked safely.`,
    });
    return;
  }
  for (const root of agentRoots ?? []) {
    for (const profileRoot of expandResourcePattern(root, packageRoot, homeDirectory)) {
      collectProfiles(profileRoot, scope, "agent", conflicts, owner);
    }
  }
  for (const root of skillRoots ?? []) {
    for (const profileRoot of expandResourcePattern(root, packageRoot, homeDirectory)) {
      collectProfiles(profileRoot, scope, "skill", conflicts, owner);
    }
  }
}

function matchingLocalPackageEntries(
  settings: Record<string, unknown>,
  settingsDirectory: string,
  packageSource: string,
  homeDirectory: string,
): unknown[] {
  if (!Array.isArray(settings.packages)) return [];
  return settings.packages.filter((entry) => {
    const source = packageEntrySource(entry);
    if (!source) return false;
    const localSource = resolveLocalPackageSource(source, settingsDirectory, homeDirectory);
    return localSource !== undefined && Path.resolve(localSource) === Path.resolve(packageSource);
  });
}

function packageEntrySource(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    "source" in entry &&
    typeof entry.source === "string"
  ) {
    return entry.source;
  }
  return undefined;
}

function resolveLocalPackageSource(source: string, base: string, homeDirectory: string): string | undefined {
  if (source.startsWith("npm:") || source.startsWith("git:") || /^https?:\/\//.test(source)) {
    return undefined;
  }
  return resolveResourcePath(source, base, homeDirectory);
}

function resolvePackageSource(
  source: string,
  settingsDirectory: string,
  homeDirectory: string,
): string | undefined {
  const local = resolveLocalPackageSource(source, settingsDirectory, homeDirectory);
  if (local) return isDirectory(local) ? local : undefined;
  if (source.startsWith("npm:")) {
    const packageName = source.slice("npm:".length).replace(/@[^/@]+$/, "");
    const candidate = Path.join(settingsDirectory, "npm", "node_modules", ...packageName.split("/"));
    return isDirectory(candidate) ? candidate : undefined;
  }
  return undefined;
}

function collectProfiles(
  root: string,
  scope: "user" | "project",
  kind: "agent" | "skill",
  conflicts: PiPreflightConflict[],
  owner?: { readonly source: string; readonly packageRoot: string },
): void {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(root);
  } catch (error) {
    if (isMissingPath(error)) return;
    return;
  }
  if (stat.isSymbolicLink()) {
    conflicts.push({
      scope,
      kind,
      name: Path.basename(root),
      path: root,
      message: `A ${scope} Pi ${kind} resource root is a symbolic link and cannot be inspected safely.`,
      ...(owner ? { source: owner.source, package_root: owner.packageRoot } : {}),
    });
    return;
  }
  if (stat.isFile()) {
    inspectProfileFile(root, scope, kind, conflicts, owner);
    return;
  }
  if (!stat.isDirectory()) return;
  const pending = [root];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory || visited.has(directory)) continue;
    visited.add(directory);
    let entries: Fs.Dirent[];
    try {
      entries = Fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = Path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        conflicts.push({
          scope,
          kind,
          name: entry.name,
          path,
          message: `A ${scope} Pi ${kind} resource contains an uninspectable symbolic link.`,
          ...(owner ? { source: owner.source, package_root: owner.packageRoot } : {}),
        });
      } else if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && (kind === "skill" ? entry.name === "SKILL.md" : entry.name.endsWith(".md"))) {
        inspectProfileFile(path, scope, kind, conflicts, owner);
      }
    }
  }
}

function inspectProfileFile(
  path: string,
  scope: "user" | "project",
  kind: "agent" | "skill",
  conflicts: PiPreflightConflict[],
  owner?: { readonly source: string; readonly packageRoot: string },
): void {
  if (kind === "agent" && path.endsWith(".chain.md")) return;
  let name: string | undefined;
  try {
    const content = Fs.readFileSync(path, "utf8");
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (!frontmatter) return;
    const parsed = Yaml.parse(frontmatter) as unknown;
    const value = asObject(parsed);
    if (typeof value?.name === "string") name = value.name;
  } catch {
    return;
  }
  const expected = kind === "skill" ? keplerSkills : keplerAgents;
  if (name && expected.has(name)) {
    conflicts.push({
      scope,
      kind,
      name,
      path,
      message: `A ${scope} Pi ${kind} resource shadows packaged ${name}.`,
      ...(owner ? { source: owner.source, package_root: owner.packageRoot } : {}),
    });
  }
}

function expandResourcePattern(
  pattern: string,
  baseDirectory: string,
  homeDirectory: string,
): string[] {
  const path = resolveResourcePath(pattern, baseDirectory, homeDirectory);
  try {
    const matches = [...Fs.globSync(path)];
    if (matches.length > 0) return matches;
  } catch {
    return [];
  }
  return isGlobPattern(path) ? [] : Fs.existsSync(path) ? [path] : [];
}

function resolveResourcePath(value: string, baseDirectory: string, homeDirectory: string): string {
  let expanded = value;
  if (value === "~") {
    expanded = homeDirectory;
  } else if (value.startsWith("~/") || value.startsWith("~\\")) {
    expanded = Path.join(homeDirectory, value.slice(2));
  }
  return Path.isAbsolute(expanded) ? expanded : Path.resolve(baseDirectory, expanded);
}

function isGlobPattern(value: string): boolean {
  return /[*?\[\]{}]/.test(value);
}

function isDirectory(path: string): boolean {
  try {
    return Fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return undefined;
  return value;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
