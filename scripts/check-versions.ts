import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseBundleManifest,
  sha256Digest,
} from "../packages/cli/src/cli/installation-record.js";

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly main?: unknown;
  readonly types?: unknown;
  readonly exports?: unknown;
  readonly files?: unknown;
  readonly bin?: unknown;
}

const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
] as const;

const readJson = (file: string): PackageManifest => {
  try {
    const value: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
    if (typeof value !== "object" || value === null) {
      throw new Error("manifest must be a JSON object");
    }
    return value as PackageManifest;
  } catch (error) {
    throw new Error(`Could not read package manifest ${file}: ${String(error)}`);
  }
};

const packageManifests = packageFiles.map((file) => ({
  file,
  manifest: readJson(file),
}));
const packageVersions = packageManifests.map(({ file, manifest }) => {
  if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error(`Package manifest has no version: ${file}`);
  }
  return { file, version: manifest.version };
});

const coreManifest = packageManifests[1]?.manifest;
const coreExport = coreManifest?.exports;
const rootExport =
  typeof coreExport === "object" && coreExport !== null && "." in coreExport
    ? (coreExport as Record<string, unknown>)["."]
    : undefined;
const coreFiles = coreManifest?.files;
if (
  coreManifest?.name !== "@vialactea-works/kepler-core" ||
  coreManifest.main !== "./dist/index.js" ||
  coreManifest.types !== "./dist/index.d.ts" ||
  typeof rootExport !== "object" ||
  rootExport === null ||
  (rootExport as Record<string, unknown>).types !== coreManifest.types ||
  (rootExport as Record<string, unknown>).import !== coreManifest.main ||
  !Array.isArray(coreFiles) ||
  !coreFiles.includes("dist")
) {
  throw new Error(
    "Core package main, types, exports, or packed files do not expose the built public API",
  );
}

const cliManifest = packageManifests[2]?.manifest;
const cliBin = cliManifest?.bin;
if (
  cliManifest?.name !== "@vialactea-works/kepler-cli" ||
  typeof cliBin !== "object" ||
  cliBin === null ||
  (cliBin as Record<string, unknown>).kepler !== "./dist/cli/main.js"
) {
  throw new Error("CLI package manifest does not expose the built kepler executable");
}

let sourceVersion: string | undefined;
try {
  const source = readFileSync(resolve("src/index.ts"), "utf8");
  sourceVersion = source.match(/^export const VERSION = "([^\"]+)"$/m)?.[1];
} catch (error) {
  throw new Error(
    `Could not read canonical VERSION from src/index.ts: ${String(error)}`,
  );
}

if (!sourceVersion) {
  throw new Error("Could not read canonical VERSION from src/index.ts");
}

let cliSourceVersion: string | undefined;
try {
  const source = readFileSync(resolve("packages/cli/src/cli/version.ts"), "utf8");
  cliSourceVersion = source.match(/^export const CLI_RELEASE = "([^\"]+)";$/m)?.[1];
} catch (error) {
  throw new Error(
    `Could not read CLI_RELEASE from packages/cli/src/cli/version.ts: ${String(error)}`,
  );
}

if (!cliSourceVersion) {
  throw new Error("Could not read CLI_RELEASE from packages/cli/src/cli/version.ts");
}

const versions = [
  ...packageVersions.map(({ version }) => version),
  sourceVersion,
  cliSourceVersion,
];
if (new Set(versions).size !== 1) {
  throw new Error(
    [
      ...packageVersions.map(({ file, version }) => `${file}: ${version}`),
      `src/index.ts: ${sourceVersion}`,
      `packages/cli/src/cli/version.ts: ${cliSourceVersion}`,
    ].join("\n"),
  );
}

let bundleManifestContent: string;
try {
  bundleManifestContent = readFileSync(resolve("bundle/manifest.json"), "utf8");
} catch (error) {
  throw new Error(`Could not read bundle/manifest.json: ${String(error)}`);
}

let bundleManifest;
try {
  bundleManifest = parseBundleManifest(bundleManifestContent);
} catch (error) {
  throw new Error(`Invalid bundle/manifest.json: ${String(error)}`);
}

if (!bundleManifest.compatibility.cli_releases.includes(sourceVersion)) {
  throw new Error(
    `Bundle ${bundleManifest.bundle_release} does not declare CLI release ${sourceVersion} as compatible`,
  );
}

for (const [relativePath, expectedDigest] of Object.entries(bundleManifest.files)) {
  let actualDigest: string;
  try {
    actualDigest = sha256Digest(readFileSync(resolve("bundle", relativePath)));
  } catch (error) {
    throw new Error(`Could not read bundle/${relativePath}: ${String(error)}`);
  }
  if (actualDigest !== expectedDigest) {
    throw new Error(`Bundle digest mismatch: bundle/${relativePath}`);
  }
}

process.stdout.write(
  `Kepler package versions synchronized: ${sourceVersion}; Core exports and bundle ${bundleManifest.bundle_release} verified\n`,
);
