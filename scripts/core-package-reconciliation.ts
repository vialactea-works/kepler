import { createHash } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { parseMetadataJsonObject } from "../packages/cli/src/cli/installation-record.js";
import { parseReleaseVersion } from "./release-version.js";

export interface CorePackageRegistry {
  readTarball(packageName: string, version: string): Uint8Array | undefined;
  publish(packageName: string, version: string, tarballPath: string): void;
}

export interface CorePackageReconciliationInput {
  readonly assetsDirectory: string;
  readonly tarballPath: string;
  readonly packageName: string;
  readonly version: string;
  readonly sourceCommit: string;
}

export type CorePackageReconciliationResult = "already-matched" | "published-and-verified";

export function reconcileCorePackage(
  input: CorePackageReconciliationInput,
  registry: CorePackageRegistry,
): CorePackageReconciliationResult {
  parseReleaseVersion(input.version);
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit)) {
    throw new Error(`Invalid release source commit: ${input.sourceCommit}`);
  }
  const expectedName = `kepler-core-${input.version}.tgz`;
  const tarballPath = Path.resolve(input.tarballPath);
  if (Path.basename(tarballPath) !== expectedName) {
    throw new Error(`Verified Core tarball must be named ${expectedName}`);
  }
  const tarballStat = Fs.lstatSync(tarballPath);
  if (!tarballStat.isFile() || tarballStat.isSymbolicLink()) {
    throw new Error("Verified Core tarball must be a regular file");
  }
  const assetsDirectory = Path.resolve(input.assetsDirectory);
  const manifest = readManifest(Path.join(assetsDirectory, "RELEASE-MANIFEST.json"));
  if (
    manifest.version !== input.version ||
    manifest.tag !== `v${input.version}` ||
    manifest.source?.commit !== input.sourceCommit
  ) {
    throw new Error("Core tarball manifest does not match the requested release identity");
  }
  const entries = manifest.assets;
  if (!Array.isArray(entries)) throw new Error("Release manifest has no asset inventory");
  const coreEntries = entries.filter((entry) => entry.name === expectedName);
  if (coreEntries.length !== 1 || typeof coreEntries[0]?.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(coreEntries[0].sha256)) {
    throw new Error("Release manifest does not bind exactly one valid Core tarball digest");
  }
  const expectedDigest = coreEntries[0].sha256;
  const localBytes = new Uint8Array(Fs.readFileSync(tarballPath));
  if (sha256(localBytes) !== expectedDigest) {
    throw new Error("Core tarball bytes do not match the verified release manifest");
  }
  verifyChecksumFile(assetsDirectory, expectedName, expectedDigest);

  const existing = registry.readTarball(input.packageName, input.version);
  if (existing !== undefined) {
    if (sha256(existing) !== expectedDigest) {
      throw new Error("Published Core version has different bytes; immutable reconciliation failed");
    }
    return "already-matched";
  }

  registry.publish(input.packageName, input.version, tarballPath);
  const published = registry.readTarball(input.packageName, input.version);
  if (published === undefined || sha256(published) !== expectedDigest) {
    throw new Error("Published Core tarball could not be reconciled to the verified release bytes");
  }
  return "published-and-verified";
}

function readManifest(path: string): {
  readonly format_version: number;
  readonly version: string;
  readonly tag: string;
  readonly source?: { readonly commit?: unknown };
  readonly assets?: readonly { readonly name?: unknown; readonly sha256?: unknown }[];
} {
  const value = parseMetadataJsonObject(Fs.readFileSync(path, "utf8"), "release manifest");
  if (value.format_version !== 1 || typeof value.version !== "string" || typeof value.tag !== "string") {
    throw new Error("Release manifest has an unsupported format or identity");
  }
  return value as ReturnType<typeof readManifest>;
}

function verifyChecksumFile(directory: string, assetName: string, expectedDigest: string): void {
  const lines = Fs.readFileSync(Path.join(directory, "SHA256SUMS"), "utf8").trimEnd().split("\n");
  const matches = lines.filter((line) => line === `${expectedDigest}  ${assetName}`);
  if (matches.length !== 1) throw new Error("SHA256SUMS does not bind the verified Core tarball bytes");
}

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}
