import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractTargetArchive,
  validateTargetPackageRoot,
} from "../../packages/cli/src/cli/release-archive.js";
import { createResourceManifest } from "../../packages/cli/src/cli/release-resources.js";
import { archiveFixtureVersion, createReleaseArchiveFixture } from "../helpers/release-archive-fixture.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Fs.realpathSync(Os.tmpdir()), "kepler-release-archive-integration-"));
  temporaryRoots.push(root);
  return root;
}

function setPackageModes(
  directory: string,
  executableMode: number,
  dataMode: number,
  root = directory,
): void {
  for (const entry of Fs.readdirSync(directory, { withFileTypes: true })) {
    const path = Path.join(directory, entry.name);
    if (entry.isDirectory()) setPackageModes(path, executableMode, dataMode, root);
    else Fs.chmodSync(path, Path.relative(root, path) === Path.join("bin", "kepler") ? executableMode : dataMode);
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("target archive filesystem integration", () => {
  it("extracts a complete validated archive with exact archive modes", () => {
    const root = temporaryRoot();
    const destination = Path.join(root, "unpacked");
    const validated = extractTargetArchive(createReleaseArchiveFixture(), destination);

    expect(validateTargetPackageRoot(destination)).toEqual(validated);
    expect(Fs.statSync(Path.join(destination, "bin", "kepler")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(destination, "release-manifest.json")).mode & 0o777).toBe(0o644);
    expect(JSON.parse(Fs.readFileSync(Path.join(destination, "package.json"), "utf8"))).toEqual({
      name: "kepler",
      version: "3.0.0",
      private: true,
      type: "module",
      bin: { kepler: "./bin/kepler" },
    });
  });

  it("preserves long resource paths and full-width UTF-8 fields through system tar extraction", () => {
    const root = temporaryRoot();
    const base = createSetupBundleFixture({ release: archiveFixtureVersion });
    const paths = [
      "skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md",
      `guidelines/${"é".repeat(68)}x/${"é".repeat(50)}`,
    ];
    const contents = new Uint8Array([0x00, 0xff, 0x0a, 0xc3, 0xa9]);
    const files = [...base.files, ...paths.map((path) => ({ path, contents }))];
    const archive = createReleaseArchiveFixture({ resources: {
      files,
      manifest: `${JSON.stringify(createResourceManifest(archiveFixtureVersion, files))}\n`,
    } });
    const archivePath = Path.join(root, "candidate.tar.gz");
    const destination = Path.join(root, "system-tar");
    Fs.writeFileSync(archivePath, archive);
    const previousUmask = process.umask(0o022);
    try {
      Fs.mkdirSync(destination, { mode: 0o755 });
      execFileSync("tar", ["-xzpf", archivePath, "-C", destination], {
        env: { ...process.env, TAR_OPTIONS: "" },
        stdio: "pipe",
      });
    } finally {
      process.umask(previousUmask);
    }
    const validated = validateTargetPackageRoot(destination);
    for (const path of paths) {
      expect(new Uint8Array(Fs.readFileSync(Path.join(destination, "bundle", path)))).toEqual(contents);
      const file = validated.files.find((file) => file.path === `bundle/${path}`);
      expect(file).toBeDefined();
      expect(new Uint8Array(file!.contents)).toEqual(contents);
    }
  });

  it("enforces canonical file and directory modes under a restrictive umask before publication", () => {
    const root = temporaryRoot();
    const destination = Path.join(root, "unpacked");
    const previousUmask = process.umask(0o077);
    try {
      extractTargetArchive(createReleaseArchiveFixture(), destination);
    } finally {
      process.umask(previousUmask);
    }
    expect(Fs.statSync(destination).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(destination, "bin")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(destination, "bundle")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(destination, "bin", "kepler")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(destination, "release-manifest.json")).mode & 0o777).toBe(0o644);
    expect(Fs.readdirSync(root)).toEqual(["unpacked"]);
  });

  it("rejects non-normalized, existing, and symlink-redirected extraction destinations without effects", () => {
    const root = temporaryRoot();
    const archive = createReleaseArchiveFixture();
    expect(() => extractTargetArchive(archive, Path.join(root, "missing-parent", "unpacked")))
      .toThrow(/parent must already exist/i);

    const existing = Path.join(root, "existing");
    Fs.mkdirSync(existing, { mode: 0o700 });
    const existingBefore = Fs.lstatSync(existing);
    expect(() => extractTargetArchive(archive, existing)).toThrow(/already exists/i);
    const existingAfter = Fs.lstatSync(existing);
    expect(existingAfter.ino).toBe(existingBefore.ino);
    expect(existingAfter.dev).toBe(existingBefore.dev);
    expect(Fs.readdirSync(existing)).toEqual([]);
    expect(Fs.readdirSync(root)).toEqual(["existing"]);


    const redirected = Path.join(root, "redirected");
    Fs.symlinkSync(root, redirected, "dir");
    expect(() => extractTargetArchive(archive, Path.join(redirected, "through-link")))
      .toThrow(/normalized child/i);
    expect(Fs.existsSync(Path.join(root, "through-link"))).toBe(false);

    const physicalDestination = Path.join(Fs.realpathSync(redirected), "through-link");
    const validated = extractTargetArchive(archive, physicalDestination);
    expect(validateTargetPackageRoot(physicalDestination)).toEqual(validated);
    expect(Fs.statSync(Path.join(physicalDestination, "bin", "kepler")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(physicalDestination, "package.json")).mode & 0o777).toBe(0o644);
  });

  it("requires exact inventory, regular files, checksums, and whole-package mode profiles", () => {
    const root = temporaryRoot();
    const archive = createReleaseArchiveFixture();
    const extracted = Path.join(root, "extracted");
    extractTargetArchive(archive, extracted);

    const installed = Path.join(root, "installed-mode");
    extractTargetArchive(archive, installed);
    setPackageModes(installed, 0o555, 0o444);
    expect(validateTargetPackageRoot(installed, { modePolicy: "installed" }).identity.kepler_release).toBe("3.0.0");
    expect(validateTargetPackageRoot(installed, { modePolicy: "runtime" }).identity.kepler_release).toBe("3.0.0");
    Fs.chmodSync(Path.join(installed, "bin", "kepler"), 0o755);
    expect(() => validateTargetPackageRoot(installed, { modePolicy: "runtime" })).toThrow(/mode mismatch/i);

    const extraFile = Path.join(extracted, "unexpected.txt");
    Fs.writeFileSync(extraFile, "unexpected\n");
    expect(() => validateTargetPackageRoot(extracted)).toThrow(/missing or unexpected inventory/i);
    Fs.rmSync(extraFile);

    Fs.writeFileSync(Path.join(extracted, "bundle", "manifest.json"), "tampered\n");
    expect(() => validateTargetPackageRoot(extracted)).toThrow(/checksum mismatch/i);
    Fs.writeFileSync(Path.join(extracted, "bundle", "manifest.json"), "restored\n");

    const linkRoot = Path.join(root, "link-root");
    extractTargetArchive(archive, linkRoot);
    Fs.unlinkSync(Path.join(linkRoot, "package.json"));
    Fs.symlinkSync(Path.join(linkRoot, "release-manifest.json"), Path.join(linkRoot, "package.json"));
    expect(() => validateTargetPackageRoot(linkRoot)).toThrow(/symbolic link/i);
  });
});
