import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { parseResourceManifest, type ResourcePackageSnapshot } from "../../packages/cli/src/cli/release-resources.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import {
  createTargetPackage,
} from "../../packages/cli/src/cli/release-archive.js";
import { encodeBuildIdentityMarker, type RuntimeBuildIdentity } from "../../packages/cli/src/cli/build-identity.js";
import { createSetupRuntime, type SetupRuntimeOptions } from "../../packages/cli/src/cli/setup-runtime.js";
import { SetupService } from "../../packages/cli/src/cli/setup.service.js";
import { createSetupBundleFixture } from "./setup-bundle-fixture.js";

export const defaultSetupRelease = "3.0.0";
export const supportedPiLoaderSource = "npm:pi-subagents@0.76.1";

export interface SetupApplicationFixture {
  readonly root: string;
  readonly bundleRoot: string;
  readonly agentDirectory: string;
  readonly projectDirectory: string;
  readonly packageDirectory: string;
  readonly piAssetsDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
  writeBundle(snapshot: ResourcePackageSnapshot): void;
  createService(release?: string, options?: SetupRuntimeOptions): SetupService;
  cleanup(): void;
}

export function createSetupApplicationFixture(): SetupApplicationFixture {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-setup-application-"));
  const bundleRoot = Path.join(root, "candidate", "bundle");
  const runtimePackageRoot = Path.join(root, "running-package");
  const agentDirectory = Path.join(root, ".pi", "agent");
  const projectDirectory = Path.join(root, "project");
  const packageDirectory = Path.join(agentDirectory, "npm", "node_modules");
  const piAssetsDirectory = Path.join(root, "pi-assets");
  for (const directory of [bundleRoot, agentDirectory, packageDirectory, projectDirectory, piAssetsDirectory]) {
    Fs.mkdirSync(directory, { recursive: true });
  }
  const environment: NodeJS.ProcessEnv = {
    HOME: root,
    XDG_CONFIG_HOME: Path.join(root, ".config"),
    KEPLER_PI_AGENT_DIR: agentDirectory,
    PI_PACKAGE_DIR: piAssetsDirectory,
  };
  Fs.writeFileSync(
    Path.join(agentDirectory, "settings.json"),
    `${JSON.stringify({ packages: [supportedPiLoaderSource], skills: [], subagents: {} }, null, 2)}\n`,
  );
  const loaderRoot = Path.join(packageDirectory, "pi-subagents");
  Fs.mkdirSync(loaderRoot, { recursive: true });
  Fs.writeFileSync(Path.join(loaderRoot, "package.json"), JSON.stringify({
    name: "pi-subagents",
    version: "0.76.1",
    pi: { extensions: ["./index.js"] },
  }));
  Fs.writeFileSync(Path.join(loaderRoot, "index.js"), "export default function piSubagents() {}\n");
  writeBundle(bundleRoot, createSetupBundleFixture({ release: defaultSetupRelease }));

  return {
    root,
    bundleRoot,
    agentDirectory,
    projectDirectory,
    packageDirectory,
    piAssetsDirectory,
    environment,
    writeBundle: (snapshot) => writeBundle(bundleRoot, snapshot),
    createService: (release = defaultSetupRelease, options = {}) => {
      const bundle = readBundleSnapshot(bundleRoot);
      const manifest = parseResourceManifest(bundle.manifest);
      const target: RuntimeBuildIdentity["target"] = {
        os: process.platform === "darwin" ? "darwin" : "linux",
        arch: process.arch === "arm64" ? "arm64" : "x64",
      };
      const commit = sha256Digest(`setup-application:${release}`).slice(7, 47);
      const buildIdentity: RuntimeBuildIdentity = {
        format_version: 1 as const,
        kepler_release: release,
        source: {
          kind: "development" as const,
          commit,
          content_digest: sha256Digest(`setup-application-content:${release}`),
        },
        target,
        resource_digest: manifest.resource_digest,
      };
      const executable = new TextEncoder().encode(`${encodeBuildIdentityMarker(buildIdentity)}\n`);
      const targetPackage = createTargetPackage({
        executable,
        resources: bundle,
        expectedVersion: release,
        expectedTarget: buildIdentity.target,
        expectedSource: buildIdentity.source,
      });
      const releaseManifest = targetPackage.files.find((file) => file.path === "release-manifest.json")?.contents;
      if (!releaseManifest) throw new Error("Setup fixture target package has no release manifest");
      writeUnpackedPackage(runtimePackageRoot, targetPackage.files);
      const runtime = createSetupRuntime({
        ...options,
        environment,
        projectDirectory,
        buildIdentity,
        executable,
        releaseManifest,
        execPath: Path.join(runtimePackageRoot, "bin", "kepler"),
        detectPiVersion: options.detectPiVersion ?? (() => "1.2.0"),
      });
      return new SetupService(runtime.files, runtime.bundleLocator, release, runtime.platform);
    },
    cleanup: () => {
      makeWritable(root);
      Fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeUnpackedPackage(
  packageRoot: string,
  files: readonly { readonly path: string; readonly contents: Uint8Array; readonly executable?: boolean }[],
): void {
  makeWritable(packageRoot);
  Fs.rmSync(packageRoot, { recursive: true, force: true });
  Fs.mkdirSync(packageRoot, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const path = Path.join(packageRoot, ...file.path.split("/"));
    Fs.mkdirSync(Path.dirname(path), { recursive: true, mode: 0o700 });
    const mode = file.executable ? 0o755 : 0o644;
    Fs.writeFileSync(path, file.contents, { mode });
    Fs.chmodSync(path, mode);
  }
  sealDirectories(packageRoot);
}

function sealDirectories(path: string): void {
  for (const entry of Fs.readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) sealDirectories(Path.join(path, entry.name));
  }
  Fs.chmodSync(path, 0o555);
}

function writeBundle(bundleRoot: string, snapshot: ResourcePackageSnapshot): void {
  Fs.rmSync(bundleRoot, { recursive: true, force: true });
  Fs.mkdirSync(bundleRoot, { recursive: true });
  Fs.writeFileSync(Path.join(bundleRoot, "manifest.json"), snapshot.manifest);
  for (const file of snapshot.files) {
    const path = Path.join(bundleRoot, ...file.path.split("/"));
    Fs.mkdirSync(Path.dirname(path), { recursive: true });
    Fs.writeFileSync(path, file.contents);
  }
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

function readBundleSnapshot(bundleRoot: string): ResourcePackageSnapshot {
  const manifest = Fs.readFileSync(Path.join(bundleRoot, "manifest.json"), "utf8");
  const files: Array<{ path: string; contents: Uint8Array }> = [];
  const visit = (directory: string, relative: string): void => {
    for (const entry of Fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (childRelative === "manifest.json") continue;
      if (entry.isDirectory()) visit(path, childRelative);
      else if (entry.isFile()) files.push({ path: childRelative, contents: Fs.readFileSync(path) });
      else throw new Error(`Unexpected resource package entry: ${childRelative}`);
    }
  };
  visit(bundleRoot, "");
  return { manifest, files };
}
