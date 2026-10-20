import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VersionManifest {
  readonly version?: unknown;
}

const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
] as const;

const isVersionManifest = (value: unknown): value is VersionManifest =>
  typeof value === "object" && value !== null && "version" in value;

const readPackageVersion = (file: string): string => {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Could not read package manifest ${file}: ${String(error)}`);
  }

  if (!isVersionManifest(manifest) || typeof manifest.version !== "string") {
    throw new Error(`Package manifest has no version: ${file}`);
  }

  return manifest.version;
};

const packageVersions = packageFiles.map((file) => ({
  file,
  version: readPackageVersion(file),
}));

let sourceVersion: string | undefined;
try {
  const source = readFileSync(resolve("src/index.ts"), "utf8");
  sourceVersion = source.match(/^export const VERSION = "([^"]+)"$/m)?.[1];
} catch (error) {
  throw new Error(
    `Could not read canonical VERSION from src/index.ts: ${String(error)}`,
  );
}

if (!sourceVersion) {
  throw new Error("Could not read canonical VERSION from src/index.ts");
}

const versions = [...packageVersions.map(({ version }) => version), sourceVersion];
if (new Set(versions).size !== 1) {
  throw new Error(
    [
      ...packageVersions.map(({ file, version }) => `${file}: ${version}`),
      `src/index.ts: ${sourceVersion}`,
    ].join("\n"),
  );
}

process.stdout.write(`Kepler package versions synchronized: ${sourceVersion}\n`);
