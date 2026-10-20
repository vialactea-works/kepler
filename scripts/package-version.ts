import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VersionManifest {
  readonly version?: unknown;
}

const file = process.argv[2];
if (!file) throw new Error("Expected a package manifest path");

let manifest: unknown;
try {
  manifest = JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
} catch (error) {
  throw new Error(`Could not read package manifest ${file}: ${String(error)}`);
}

if (
  typeof manifest !== "object" ||
  manifest === null ||
  !("version" in manifest) ||
  typeof (manifest as VersionManifest).version !== "string"
) {
  throw new Error(`Package manifest has no version: ${file}`);
}

process.stdout.write(`${(manifest as VersionManifest).version}\n`);
