import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createTargetArchive,
  expectedTargetArchiveNames,
  RELEASE_TARGETS,
  targetArchiveName,
  validateTargetArchive,
  validateTargetArchiveSet,
  validateTargetPackageFiles,
  type ReleaseTarget,
} from "../../packages/cli/src/cli/release-archive.js";
import {
  buildIdentityDigest,
  encodeBuildIdentityMarker,
  type RuntimeBuildIdentity,
} from "../../packages/cli/src/cli/build-identity.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";
import {
  archiveFixtureSource,
  archiveFixtureTarget,
  archiveFixtureVersion,
  createReleaseArchiveFixture,
} from "../helpers/release-archive-fixture.js";

function makeArchiveSet(input: {
  readonly source?: RuntimeBuildIdentity["source"];
  readonly differentSourceTarget?: ReleaseTarget;
  readonly differentResourceTarget?: ReleaseTarget;
} = {}): Record<string, Uint8Array> {
  return Object.fromEntries(RELEASE_TARGETS.map((target) => {
    const source = targetKey(target) === targetKey(input.differentSourceTarget)
      ? { ...archiveFixtureSource, content_digest: sha256Digest("different source") }
      : input.source ?? archiveFixtureSource;
    const resources = targetKey(target) === targetKey(input.differentResourceTarget)
      ? createSetupBundleFixture({ release: archiveFixtureVersion, guidelineContent: "# Different package\n" })
      : createSetupBundleFixture({ release: archiveFixtureVersion });
    const archive = createReleaseArchiveFixture({ target, source, resources });
    return [targetArchiveName(archiveFixtureVersion, target), archive];
  }));
}

function tar(entries: readonly {
  readonly path: string;
  readonly contents?: Uint8Array;
  readonly type?: string;
}[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const contents = entry.contents ?? new Uint8Array();
    const header = Buffer.alloc(512);
    header.write(entry.path, 0, 100, "utf8");
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, contents.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeOctal(header, 148, 8, checksum);
    blocks.push(header, contents);
    const padding = (512 - (contents.byteLength % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks.map((block) => Buffer.from(block))));
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
}

function rewriteArchiveFile(archive: Uint8Array, path: string, update: (contents: Buffer) => Buffer): Uint8Array {
  const tarBytes = gunzipSync(archive);
  let offset = 0;
  while (offset + 512 <= tarBytes.byteLength && tarBytes.subarray(offset, offset + 512).some((byte) => byte !== 0)) {
    const header = Buffer.from(tarBytes.subarray(offset, offset + 512));
    const filePath = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8);
    const start = offset + 512;
    const contents = Buffer.from(tarBytes.subarray(start, start + size));
    if (filePath === path) {
      const updated = update(contents);
      if (updated.byteLength !== contents.byteLength) throw new Error("Archive test replacement must preserve file size");
      const replacement = Buffer.from(tarBytes);
      updated.copy(replacement, start);
      return gzipSync(replacement);
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Archive fixture is missing ${path}`);
}

function targetKey(target: ReleaseTarget | undefined): string | undefined {
  return target ? `${target.os}-${target.arch}` : undefined;
}

describe("complete target release archives", () => {
  it("uses one versioned name function and requires exactly the four supported targets", () => {
    expect(targetArchiveName(archiveFixtureVersion, archiveFixtureTarget)).toBe("kepler-3.0.0-linux-x64.tar.gz");
    expect(expectedTargetArchiveNames(archiveFixtureVersion)).toEqual([
      "kepler-3.0.0-darwin-arm64.tar.gz",
      "kepler-3.0.0-darwin-x64.tar.gz",
      "kepler-3.0.0-linux-arm64.tar.gz",
      "kepler-3.0.0-linux-x64.tar.gz",
    ]);
    expect(validateTargetArchiveSet(makeArchiveSet(), archiveFixtureVersion)).toHaveLength(4);
    expect(() => validateTargetArchiveSet({ ...makeArchiveSet(), "unexpected.tar.gz": new Uint8Array() }, archiveFixtureVersion))
      .toThrow(/exactly the four supported target archives/i);
  });

  it("rejects four individually valid archives that mix source or resource identity", () => {
    expect(() => validateTargetArchiveSet(makeArchiveSet({
      differentSourceTarget: { os: "darwin", arch: "x64" },
    }), archiveFixtureVersion)).toThrow(/share one source/i);
    expect(() => validateTargetArchiveSet(makeArchiveSet({
      differentResourceTarget: { os: "linux", arch: "arm64" },
    }), archiveFixtureVersion)).toThrow(/share one resource/i);
  });

  it("creates deterministic archive bytes and validates the final archive digest separately", () => {
    const resources = createSetupBundleFixture({ release: archiveFixtureVersion });
    const resourceManifest = JSON.parse(resources.manifest) as { resource_digest: `sha256:${string}` };
    const identity: RuntimeBuildIdentity = {
      format_version: 1,
      kepler_release: archiveFixtureVersion,
      source: archiveFixtureSource,
      target: archiveFixtureTarget,
      resource_digest: resourceManifest.resource_digest,
    };
    const executable = new TextEncoder().encode(encodeBuildIdentityMarker(identity));
    const input = { executable, resources, expectedVersion: archiveFixtureVersion, expectedTarget: archiveFixtureTarget, expectedSource: archiveFixtureSource };
    const first = createTargetArchive(input).archive;
    const second = createTargetArchive(input).archive;
    expect(first).toEqual(second);
    const verified = validateTargetArchive(first, { expectedVersion: archiveFixtureVersion, expectedTarget: archiveFixtureTarget });
    expect(verified.archiveDigest).toBe(sha256Digest(first));
    expect(verified.manifest.files["release-manifest.json"]).toBeUndefined();
    expect(verified.manifest.files["bin/kepler"]?.executable).toBe(true);
  });

  it("treats expected and manifest identity only as assertions against embedded executable metadata", () => {
    const resources = createSetupBundleFixture({ release: archiveFixtureVersion });
    const resourceManifest = JSON.parse(resources.manifest) as { resource_digest: `sha256:${string}` };
    const embedded: RuntimeBuildIdentity = {
      format_version: 1,
      kepler_release: archiveFixtureVersion,
      source: archiveFixtureSource,
      target: archiveFixtureTarget,
      resource_digest: resourceManifest.resource_digest,
    };
    const declared = {
      ...embedded,
      source: { ...embedded.source, content_digest: sha256Digest("declared but not compiled") },
    };
    const executable = new TextEncoder().encode(encodeBuildIdentityMarker(embedded));

    expect(() => createTargetArchive({
      executable,
      resources,
      expectedSource: { ...embedded.source, kind: "production" },
    })).toThrow(/source identity does not match the expected source/i);
    expect(() => createTargetArchive({ executable, resources, identity: declared }))
      .toThrow(/identity assertion.*embedded executable metadata/i);
    const archive = createTargetArchive({ executable, resources }).archive;
    expect(() => validateTargetArchive(archive, { expectedIdentity: declared }))
      .toThrow(/expected identity/i);
    expect(() => validateTargetArchive(archive, {
      expectedSource: { ...embedded.source, kind: "production" },
    })).toThrow(/source identity does not match the expected source/i);

    const validated = validateTargetArchive(archive);
    const arbitraryExecutable = new TextEncoder().encode("arbitrary markerless executable bytes");
    const forgedManifest = {
      ...validated.manifest,
      source: declared.source,
      build_identity_digest: buildIdentityDigest(declared),
      files: {
        ...validated.manifest.files,
        "bin/kepler": { digest: sha256Digest(arbitraryExecutable), executable: true },
      },
    };
    const forgedFiles = validated.files.map((file) => file.path === "bin/kepler"
      ? { ...file, contents: arbitraryExecutable }
      : file.path === "release-manifest.json"
        ? { ...file, contents: new TextEncoder().encode(`${JSON.stringify(forgedManifest, null, 2)}\n`) }
        : file);
    expect(() => validateTargetPackageFiles(forgedFiles))
      .toThrow(/exactly one compiled.*identity/i);
    expect(() => validateTargetPackageFiles(forgedFiles, { expectedIdentity: declared }))
      .toThrow(/exactly one compiled.*identity/i);
    expect(() => createTargetArchive({ executable: arbitraryExecutable, resources, identity: declared }))
      .toThrow(/exactly one compiled.*identity/i);
  });

  it("rejects malformed, traversal, link, duplicate, checksum, and mismatched identity archives", () => {
    const archive = createReleaseArchiveFixture();
    expect(() => validateTargetArchive(new Uint8Array([1, 2, 3]))).toThrow(/gzip|archive/i);
    expect(() => validateTargetArchive(tar([{ path: "../outside" }]))).toThrow(/unsafe|normalized/i);
    expect(() => validateTargetArchive(tar([{ path: "link", type: "2" }]))).toThrow(/link|regular file/i);
    expect(() => validateTargetArchive(tar([{ path: "hardlink", type: "1" }]))).toThrow(/link|regular file/i);
    expect(() => validateTargetArchive(tar([
      { path: "duplicate", contents: new Uint8Array([1]) },
      { path: "duplicate", contents: new Uint8Array([2]) },
    ]))).toThrow(/duplicate/i);

    const corruptHeader = gunzipSync(tar([{ path: "file", contents: new Uint8Array([1]) }]));
    corruptHeader[0] ^= 1;
    expect(() => validateTargetArchive(gzipSync(corruptHeader))).toThrow(/header checksum/i);

    expect(() => validateTargetArchive(rewriteArchiveFile(archive, "bundle/manifest.json", (contents) => {
      const changed = Buffer.from(contents);
      changed[0] = changed[0] === 0x7b ? 0x5b : 0x7b;
      return changed;
    }))).toThrow(/checksum|manifest|json/i);
    expect(() => validateTargetArchive(rewriteArchiveFile(archive, "release-manifest.json", (contents) => {
      return Buffer.from(contents.toString("utf8").replace('"kepler_release": "3.0.0"', '"kepler_release": "3.0.1"'));
    }), { expectedVersion: archiveFixtureVersion })).toThrow(/identity|release/i);
  });
});
