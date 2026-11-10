import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { KeplerService, type KeplerEnvironment } from "@vialactea-works/kepler-core";
import { resolveBundleRoot, resolvePackageRoot } from "./bundle-root.js";
import { readBuildIdentity, type RuntimeBuildIdentity } from "./build-identity.js";
import { validateTargetPackageRoot } from "./release-archive.js";
import {
  beginGenerationTransaction,
  createNodeGenerationTransactionFiles,
  type GenerationTransactionFiles,
} from "./generation-transaction.js";
import { planPiPackageRegistration, readPiSettingsSnapshot, registerPiPackage } from "./pi-settings-adapter.js";
import { preflightPi } from "./pi-preflight.js";
import {
  SETUP_BUNDLE_LOCATOR,
  SETUP_CLI_RELEASE,
  SETUP_FILES,
  SETUP_OPERATION,
  SETUP_RUNTIME,
  SETUP_PLATFORM,
  type SetupBundleLocator,
  type SetupFiles,
  type SetupGlobalPaths,
} from "./setup.service.js";

export { SETUP_OPERATION, SETUP_RUNTIME, SETUP_FILES, SETUP_BUNDLE_LOCATOR, SETUP_CLI_RELEASE, SETUP_PLATFORM };

export const SETUP_OPERATION_TOKEN = SETUP_OPERATION;
export const SETUP_FILES_TOKEN = SETUP_FILES;
export const SETUP_BUNDLE_LOCATOR_TOKEN = SETUP_BUNDLE_LOCATOR;
export const SETUP_CLI_RELEASE_TOKEN = SETUP_CLI_RELEASE;
export const SETUP_PLATFORM_TOKEN = SETUP_PLATFORM;

export interface SetupRuntimeOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly projectDirectory?: string;
  readonly buildIdentity?: RuntimeBuildIdentity;
  readonly executable?: Uint8Array;
  readonly releaseManifest?: Uint8Array;
  readonly execPath?: string;
  readonly detectPiVersion?: () => string;
  readonly generationFiles?: GenerationTransactionFiles;
  readonly renameTarget?: (stagedPath: string, targetPath: string) => void;
  readonly registerPiPackage?: SetupFiles["registerPiPackage"];
}

export interface SetupRuntime {
  readonly files: SetupFiles;
  readonly bundleLocator: SetupBundleLocator;
  readonly platform: { readonly os: string; readonly arch: string };
}

export function createSetupRuntime(options: SetupRuntimeOptions = {}): SetupRuntime {
  const environment = options.environment ?? process.env;
  const bundleEnvironment: NodeJS.ProcessEnv = { ...environment };
  const keplerEnvironment: KeplerEnvironment = {
    HOME: environment.HOME,
    XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME,
  };
  const kepler = new KeplerService({ environment: keplerEnvironment });
  let selectedBundleRoot: string | undefined;
  let selectedReleaseManifest: Uint8Array | undefined = options.releaseManifest
    ? new Uint8Array(options.releaseManifest)
    : undefined;
  const baseGenerationFiles = options.generationFiles ?? createNodeGenerationTransactionFiles();
  const generationFiles: GenerationTransactionFiles = options.renameTarget
    ? {
        ...baseGenerationFiles,
        rename: (stagedPath, targetPath) => options.renameTarget?.(stagedPath, targetPath),
      }
    : baseGenerationFiles;
  const globalPaths = (): SetupGlobalPaths => {
    const paths = kepler.globalPaths();
    return {
      ...paths,
      installationRecord: Path.join(paths.home, "installation.json"),
    };
  };
  const distributionRoot = (): string =>
    Path.join(environment.HOME ?? Os.homedir(), ".kepler-dist");
  const stableLauncherPath = (): string =>
    Path.join(environment.HOME ?? Os.homedir(), ".local", "bin", "kepler");

  const files: SetupFiles = {
    readBundle: readBundleSnapshot,
    globalPaths,
    distributionRoot,
    stableLauncherPath,
    buildIdentity: () => options.buildIdentity ?? readBuildIdentity(environment),
    readExecutable: () => options.executable
      ? new Uint8Array(options.executable)
      : new Uint8Array(Fs.readFileSync(options.execPath ?? process.execPath)),
    releaseManifest: () => selectedReleaseManifest
      ? new Uint8Array(selectedReleaseManifest)
      : undefined,
    preflightPi: (packageSource) => preflightPi({
      environment,
      projectDirectory: options.projectDirectory ?? process.cwd(),
      packageSource,
      detectPiVersion: options.detectPiVersion,
      allowResourceConflicts: true,
    }),
    inspectPath: (path) => generationFiles.inspect(path),
    listDirectory: (path) => generationFiles.list(path),
    readPiSettingsSnapshot,
    planPiPackageRegistration: (snapshot, packageSource, transfer) =>
      planPiPackageRegistration(snapshot, packageSource, transfer),
    registerPiPackage: options.registerPiPackage ?? ((snapshot, packageSource, transfer, validateTransfer) =>
      registerPiPackage(snapshot, packageSource, transfer ? { transfer, validateTransfer } : {})),
    beginTransaction: (input) => beginGenerationTransaction({ ...input, files: generationFiles }),
    transactionFiles: generationFiles,
  };

  return {
    files,
    bundleLocator: () => {
      if (selectedBundleRoot !== undefined) return selectedBundleRoot;
      const compiledIdentity = options.buildIdentity ?? readBuildIdentity(environment);
      if (compiledIdentity) {
        if (compiledIdentity.source.kind === "production" && Object.hasOwn(environment, "KEPLER_PACKAGE_ROOT")) {
          throw new Error("A production Kepler binary cannot select a runtime package-root override");
        }
        const packageRoot = resolvePackageRoot({
          env: bundleEnvironment,
          execPath: options.execPath ?? process.execPath,
        });
        const validated = validateTargetPackageRoot(packageRoot, {
          expectedIdentity: compiledIdentity,
          modePolicy: "runtime",
        });
        const releaseManifest = validated.files.find((file) => file.path === "release-manifest.json")?.contents;
        selectedReleaseManifest = releaseManifest ? new Uint8Array(releaseManifest) : undefined;
        if (!selectedReleaseManifest) throw new Error("Selected Kepler package has no release manifest");
        selectedBundleRoot = Path.join(packageRoot, "bundle");
      } else {
        selectedBundleRoot = resolveBundleRoot({
          env: bundleEnvironment,
          execPath: options.execPath ?? process.execPath,
        });
      }
      return selectedBundleRoot;
    },
    platform: { os: process.platform, arch: process.arch },
  };
}

function readBundleSnapshot(bundleRoot: string) {
  const root = Fs.realpathSync(bundleRoot);
  const rootStat = Fs.statSync(root);
  if (!rootStat.isDirectory()) throw new Error("Resource package root is not a directory");
  const manifestPath = Path.join(root, "manifest.json");
  const manifestStat = Fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error("Resource manifest is not a regular file");
  }
  const manifest = Fs.readFileSync(manifestPath, "utf8");
  const files: Array<{ path: string; contents: Uint8Array }> = [];

  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = Fs.readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
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
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Resource package contains a non-regular file: ${relativePath}`);
      }
      files.push({ path: relativePath, contents: Fs.readFileSync(absolutePath) });
    }
  };

  visit(root, "");
  return { manifest, files };
}
