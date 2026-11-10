import { createHash } from "node:crypto";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  reconcileCorePackage,
  type CorePackageRegistry,
} from "../../scripts/core-package-reconciliation.js";

const version = "3.0.0";
const commit = "0123456789abcdef0123456789abcdef01234567";
const packageName = "@vialactea-works/kepler-core";
const tarballName = `kepler-core-${version}.tgz`;
const temporaryRoots: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createAssets(): { readonly root: string; readonly tarballPath: string; readonly bytes: Uint8Array } {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-core-reconcile-"));
  temporaryRoots.push(root);
  const bytes = new TextEncoder().encode("verified packed Core bytes\n");
  const tarballPath = Path.join(root, tarballName);
  Fs.writeFileSync(tarballPath, bytes);
  Fs.writeFileSync(Path.join(root, "RELEASE-MANIFEST.json"), `${JSON.stringify({
    format_version: 1,
    version,
    tag: `v${version}`,
    source: { repository: "vialactea-works/kepler", commit, workflow_run_id: "123", workflow_run_attempt: "1" },
    assets: [{ name: tarballName, sha256: sha256(bytes) }],
  })}\n`);
  Fs.writeFileSync(Path.join(root, "SHA256SUMS"), `${sha256(bytes)}  ${tarballName}\n`);
  return { root, tarballPath, bytes };
}

function fakeRegistry(initial?: Uint8Array, readBack: "matching" | "undefined" | "mismatched" = "matching"): CorePackageRegistry & {
  readonly published: string[];
  readonly reads: number;
  readonly value: Uint8Array | undefined;
} {
  const published: string[] = [];
  let value = initial;
  let reads = 0;
  return {
    published,
    get reads() { return reads; },
    get value() { return value; },
    readTarball() {
      reads += 1;
      return value;
    },
    publish(_name, _release, path) {
      published.push(path);
      if (readBack === "undefined") value = undefined;
      else if (readBack === "mismatched") value = new TextEncoder().encode("different read-back bytes\n");
      else value = new Uint8Array(Fs.readFileSync(path));
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) Fs.rmSync(root, { recursive: true, force: true });
});

describe("verified Core package publication reconciliation", () => {
  it("accepts an existing registry version only when its tarball bytes match the verified asset", () => {
    const assets = createAssets();
    const registry = fakeRegistry(assets.bytes);

    const result = reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry);

    expect(result).toBe("already-matched");
    expect(registry.reads).toBe(1);
    expect(registry.published).toEqual([]);
  });

  it("blocks an existing immutable version with different bytes instead of treating version presence as success", () => {
    const assets = createAssets();
    const registry = fakeRegistry(new TextEncoder().encode("different registry bytes\n"));

    expect(() => reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry)).toThrow(/different bytes/i);
    expect(registry.reads).toBe(1);
    expect(registry.published).toEqual([]);
  });

  it("publishes the exact verified tarball and requires a matching registry read-back", () => {
    const assets = createAssets();
    const registry = fakeRegistry();

    const result = reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry);

    expect(result).toBe("published-and-verified");
    expect(registry.reads).toBe(2);
    expect(registry.published).toEqual([assets.tarballPath]);
    expect(registry.value).toEqual(assets.bytes);
  });

  it("rejects local tarball drift before querying or publishing a registry version", () => {
    const assets = createAssets();
    const registry = fakeRegistry();
    Fs.writeFileSync(assets.tarballPath, "changed after release verification\n");

    expect(() => reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry)).toThrow(/do not match/i);
    expect(registry.reads).toBe(0);
    expect(registry.published).toEqual([]);
  });

  it("rejects manifest source drift before accessing the registry", () => {
    const assets = createAssets();
    const registry = fakeRegistry();
    const manifestPath = Path.join(assets.root, "RELEASE-MANIFEST.json");
    const manifest = JSON.parse(Fs.readFileSync(manifestPath, "utf8")) as { source: { commit: string } };
    manifest.source.commit = "fedcba9876543210fedcba9876543210fedcba98";
    Fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    expect(() => reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry)).toThrow(/release identity/i);
    expect(registry.reads).toBe(0);
    expect(registry.published).toEqual([]);
  });

  it.each(["undefined", "mismatched"] as const)("rejects a publish without matching read-back bytes (%s)", (readBack) => {
    const assets = createAssets();
    const registry = fakeRegistry(undefined, readBack);

    expect(() => reconcileCorePackage({
      assetsDirectory: assets.root,
      tarballPath: assets.tarballPath,
      packageName,
      version,
      sourceCommit: commit,
    }, registry)).toThrow(/could not be reconciled/i);
    expect(registry.reads).toBe(2);
    expect(registry.published).toEqual([assets.tarballPath]);
    if (readBack === "undefined") expect(registry.value).toBeUndefined();
    else expect(registry.value).toEqual(new TextEncoder().encode("different read-back bytes\n"));
  });
});
