import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execa } from "execa";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  bundleManifestContentDigest,
  parseBundleManifest,
  parseInstallationRecord,
  sha256Digest,
  type BundleManifest,
  type ContentDigest,
} from "../../packages/cli/src/cli/installation-record.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const installerPath = Path.join(projectRoot, "install.sh");
const fakeCurlSource = Path.join(projectRoot, "tests/fixtures/fake-curl.ts");
const hostPlatform =
  process.platform === "darwin" || process.platform === "linux"
    ? process.platform
    : undefined;
const hostArch =
  process.arch === "x64" || process.arch === "arm64"
    ? process.arch
    : undefined;
const platformTarget =
  hostPlatform && hostArch ? `${hostPlatform}-${hostArch}` : undefined;
const expectedPlatformTarget = process.env.KEPLER_EXPECTED_TARGET;
if (expectedPlatformTarget && platformTarget !== expectedPlatformTarget) {
  throw new Error(`Expected native target ${expectedPlatformTarget}; detected ${platformTarget ?? "unsupported"}.`);
}
let resourceRoot = "";
let assetsDirectory = "";
let fakeBinDirectory = "";
let executableName = "";

function hashFile(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function parseCliResult(stdout: string): {
  status: string;
  data: Record<string, unknown>;
} {
  const line = stdout
    .split(/\r?\n/)
    .findLast((entry) => entry.startsWith('{"status":'));
  if (!line) throw new Error("CLI output did not include a JSON result envelope.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error("CLI output contained invalid JSON.", { cause: error });
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("status" in parsed) ||
    typeof parsed.status !== "string" ||
    !("data" in parsed) ||
    parsed.data === null ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  ) {
    throw new Error("CLI result envelope had an unexpected shape.");
  }
  return { status: parsed.status, data: parsed.data as Record<string, unknown> };
}

async function updateManifest(
  bundleRoot: string,
  update: {
    readonly bundleRelease?: string;
    readonly cliReleases?: readonly string[];
    readonly removeFile?: string;
    readonly file?: { readonly path: string; readonly contents: Uint8Array };
  },
): Promise<BundleManifest> {
  const manifestPath = Path.join(bundleRoot, "manifest.json");
  const current = parseBundleManifest(await Fs.readFile(manifestPath, "utf8"));
  const files: Record<string, ContentDigest> = { ...current.files };
  if (update.removeFile) {
    await Fs.rm(Path.join(bundleRoot, ...update.removeFile.split("/")), {
      force: true,
    });
    delete files[update.removeFile];
  }
  if (update.file) {
    await Fs.writeFile(
      Path.join(bundleRoot, ...update.file.path.split("/")),
      update.file.contents,
    );
    files[update.file.path] = sha256Digest(update.file.contents);
  }
  const base: BundleManifest = {
    ...current,
    ...(update.bundleRelease === undefined
      ? {}
      : { bundle_release: update.bundleRelease }),
    files,
    compatibility: {
      ...current.compatibility,
      ...(update.cliReleases === undefined
        ? {}
        : { cli_releases: [...update.cliReleases] }),
    },
    content_digest: sha256Digest(new Uint8Array()),
  };
  const manifest: BundleManifest = {
    ...base,
    content_digest: bundleManifestContentDigest(base),
  };
  parseBundleManifest(JSON.stringify(manifest));
  await Fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function runInstaller(home: string, availableAssets: string) {
  const temporaryDirectory = Path.join(home, "tmp");
  await Fs.mkdir(temporaryDirectory, { recursive: true });
  const environment: NodeJS.ProcessEnv = {
    HOME: home,
    KEPLER_FAKE_CURL_SOURCE: fakeCurlSource,
    KEPLER_REPO_SLUG: "fixture/kepler",
    KEPLER_TEST_ASSETS: availableAssets,
    KEPLER_VERSION: "v0.10.3-e2e",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
    PATH: [fakeBinDirectory, Path.dirname(process.execPath), process.env.PATH ?? ""]
      .filter(Boolean)
      .join(Path.delimiter),
    TMPDIR: temporaryDirectory,
    TZ: "UTC",
    XDG_CONFIG_HOME: Path.join(home, ".config"),
  };
  return execa("bash", [installerPath], {
    cwd: projectRoot,
    env: environment,
    extendEnv: false,
    reject: false,
    timeout: 120_000,
  });
}

async function runInstalledSetup(
  executablePath: string,
  home: string,
  bundleOverride?: string,
  options: { readonly path?: string; readonly cwd?: string } = {},
) {
  return execa(executablePath, ["setup"], {
    cwd: options.cwd ?? projectRoot,
    env: {
      HOME: home,
      ...(bundleOverride === undefined
        ? {}
        : { KEPLER_BUNDLE_DIR: bundleOverride }),
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      PATH: options.path ?? process.env.PATH ?? "",
      TMPDIR: Path.join(home, "tmp"),
      TZ: "UTC",
      XDG_CONFIG_HOME: Path.join(home, ".config"),
    },
    extendEnv: false,
    reject: false,
    timeout: 30_000,
  });
}

beforeAll(async () => {
  if (!platformTarget) return;
  resourceRoot = await Fs.mkdtemp(
    Path.join(await Fs.realpath(Os.tmpdir()), "kepler-installer-e2e-"),
  );
  assetsDirectory = Path.join(resourceRoot, "assets");
  fakeBinDirectory = Path.join(resourceRoot, "fake-bin");
  executableName = `kepler-${platformTarget}`;
  await Promise.all([
    Fs.mkdir(assetsDirectory, { recursive: true }),
    Fs.mkdir(fakeBinDirectory, { recursive: true }),
  ]);

  const binaryPath = Path.join(assetsDirectory, executableName);
  const build = await execa(
    process.execPath,
    [
      "build",
      "--compile",
      `--target=bun-${platformTarget}`,
      "--external",
      "class-transformer",
      "--external",
      "class-validator",
      "--external",
      "@nestjs/platform-express",
      "--external",
      "@nestjs/microservices",
      "--external",
      "@nestjs/websockets",
      "packages/cli/src/cli/main.ts",
      "--outfile",
      binaryPath,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      reject: false,
      timeout: 120_000,
    },
  );
  if (build.exitCode !== 0) {
    throw new Error(`Standalone build failed: ${build.stderr || build.stdout}`);
  }
  await Fs.chmod(binaryPath, 0o755);

  await execa(
    "tar",
    ["-czf", Path.join(assetsDirectory, "kepler-bundle.tar.gz"), "bundle/"],
    { cwd: projectRoot, timeout: 30_000 },
  );
  const checksummedAssets = [
    "kepler-darwin-x64",
    "kepler-darwin-arm64",
    "kepler-linux-x64",
    "kepler-linux-arm64",
    "kepler-bundle.tar.gz",
    "kepler-core-0.11.0.tgz",
    "RELEASE-MANIFEST.json",
  ];
  for (const name of checksummedAssets) {
    if (name === executableName || name === "kepler-bundle.tar.gz") continue;
    await Fs.writeFile(
      Path.join(assetsDirectory, name),
      name === "RELEASE-MANIFEST.json"
        ? JSON.stringify({ format_version: 1, source: { commit: "fixture" } })
        : `Unrequested release asset: ${name}\n`,
    );
  }
  const checksumLines = await Promise.all(
    checksummedAssets.map(async (name) => {
      const contents = await Fs.readFile(Path.join(assetsDirectory, name));
      return `${hashFile(contents)}  ${name}`;
    }),
  );
  await Fs.writeFile(
    Path.join(assetsDirectory, "SHA256SUMS"),
    `${checksumLines.join("\n")}\n`,
  );

  const fakeCurlPath = Path.join(fakeBinDirectory, "curl");
  await Fs.writeFile(
    fakeCurlPath,
    '#!/bin/sh\nexec bun "$KEPLER_FAKE_CURL_SOURCE" "$@"\n',
  );
  await Fs.chmod(fakeCurlPath, 0o755);
}, 120_000);

afterAll(async () => {
  if (resourceRoot) await Fs.rm(resourceRoot, { recursive: true, force: true });
});

if (platformTarget) {
  describe("release installer and setup E2E", () => {
    it("installs checksummed assets, finds the sidecar through the executable symlink, and preserves resources on repeat setup", async () => {
      const home = Path.join(resourceRoot, "installed-home");
      const installation = await runInstaller(home, assetsDirectory);
      expect(
        installation.exitCode,
        `${installation.stdout}\n${installation.stderr}`,
      ).toBe(0);
      expect(installation.stderr).toBe("");
      expect(installation.stdout).toContain(`${executableName}: OK`);
      expect(installation.stdout).toContain("kepler-bundle.tar.gz: OK");
      const setupResult = parseCliResult(installation.stdout);
      expect(setupResult.status).toBe("success");
      expect(setupResult.data.compatibility).toEqual({ check: "compatible" });
      expect(setupResult.data.host_binding).toMatchObject({
        host: { id: "claude-code", check: "not_checked" },
      });

      const installedBinary = Path.join(home, ".kepler-dist/bin/kepler");
      const executablePath = Path.join(home, ".local/bin/kepler");
      const sidecarRoot = Path.join(home, ".kepler-dist/bundle");
      const globalHome = Path.join(
        home,
        ".config/vialactea-works/kepler",
      );
      const templatePath = Path.join(
        globalHome,
        "templates/v3/construction/design.md",
      );
      const guidelinePath = Path.join(
        globalHome,
        "guidelines/general/01-code-style.md",
      );
      const settingsPath = Path.join(globalHome, "settings.yaml");
      const unknownPath = Path.join(globalHome, "templates/user-owned.md");
      const recordPath = Path.join(globalHome, "installation.json");
      expect(await Fs.realpath(executablePath)).toBe(await Fs.realpath(installedBinary));
      expect(await Fs.readFile(templatePath, "utf8")).toContain(
        "# Functional design",
      );
      const runtimeFreePath = Path.join(resourceRoot, "no-runtime-path");
      const outsideCheckout = Path.join(resourceRoot, "outside-checkout");
      await Promise.all([
        Fs.mkdir(runtimeFreePath, { recursive: true }),
        Fs.mkdir(outsideCheckout, { recursive: true }),
      ]);
      const standaloneEnvironment: NodeJS.ProcessEnv = {
        HOME: home,
        LC_ALL: "C.UTF-8",
        NO_COLOR: "1",
        PATH: runtimeFreePath,
        TMPDIR: Path.join(home, "tmp"),
        TZ: "UTC",
        XDG_CONFIG_HOME: Path.join(home, ".config"),
      };
      const standaloneVersion = await execa(executablePath, ["--version"], {
        cwd: outsideCheckout,
        env: standaloneEnvironment,
        extendEnv: false,
        reject: false,
        timeout: 30_000,
      });
      expect(standaloneVersion.exitCode, standaloneVersion.stderr).toBe(0);
      expect(standaloneVersion.stdout).toContain("0.11.0");
      const standaloneSetup = await runInstalledSetup(executablePath, home, undefined, {
        path: runtimeFreePath,
        cwd: outsideCheckout,
      });
      expect(standaloneSetup.exitCode, standaloneSetup.stderr).toBe(0);
      expect(parseCliResult(standaloneSetup.stdout)).toMatchObject({ status: "success" });
      expect(
        parseInstallationRecord(await Fs.readFile(recordPath, "utf8")).bundle_release.release,
      ).toBe("kepler-bundle-3.0.3");

      const settings = "extensions:\n  - name: rtk\n    enabled: false\n";
      await Fs.writeFile(settingsPath, settings);
      await Fs.writeFile(unknownPath, "user-owned resource\n");
      const firstRecord = parseInstallationRecord(await Fs.readFile(recordPath, "utf8"));
      const installedRecord = await Fs.readFile(recordPath);
      const installedTemplate = await Fs.readFile(templatePath);
      const installedGuideline = await Fs.readFile(guidelinePath);
      const incompleteRoot = Path.join(resourceRoot, "incomplete-override");
      await Fs.cp(sidecarRoot, incompleteRoot, { recursive: true });
      await updateManifest(incompleteRoot, {
        removeFile: "templates/v3/construction/design.md",
        file: {
          path: "templates/arbitrary.md",
          contents: new TextEncoder().encode("# Extra template\n"),
        },
      });
      const incomplete = await runInstalledSetup(
        executablePath,
        home,
        incompleteRoot,
      );
      expect(incomplete.exitCode).toBe(1);
      expect(parseCliResult(incomplete.stdout)).toMatchObject({
        status: "failed",
        data: {
          code: "invalid_bundle",
          message: expect.stringContaining(
            "Missing required v3 Construction template: templates/v3/construction/design.md",
          ),
        },
      });
      expect(await Fs.readFile(recordPath)).toEqual(installedRecord);
      expect(await Fs.readFile(templatePath)).toEqual(installedTemplate);
      expect(await Fs.readFile(guidelinePath)).toEqual(installedGuideline);
      expect(await Fs.readFile(settingsPath, "utf8")).toBe(settings);
      await expect(
        Fs.access(Path.join(globalHome, "templates/arbitrary.md")),
      ).rejects.toThrow();

      const repeated = await runInstalledSetup(executablePath, home);
      expect(repeated.exitCode).toBe(0);
      expect(repeated.stderr).toBe("");
      expect(parseCliResult(repeated.stdout)).toMatchObject({
        status: "success",
        data: { generation_id: firstRecord.generation_id },
      });
      expect(await Fs.readFile(settingsPath, "utf8")).toBe(settings);
      expect(await Fs.readFile(unknownPath, "utf8")).toBe("user-owned resource\n");

      const overrideRoot = Path.join(resourceRoot, "compatible-override");
      await Fs.cp(sidecarRoot, overrideRoot, { recursive: true });
      await updateManifest(overrideRoot, {
        bundleRelease: "kepler-bundle-3.0.1",
        file: {
          path: "templates/v3/construction/design.md",
          contents: new TextEncoder().encode("# Updated Construction design\n"),
        },
      });
      const upgraded = await runInstalledSetup(executablePath, home, overrideRoot);
      expect(upgraded.exitCode).toBe(0);
      const upgradedResult = parseCliResult(upgraded.stdout);
      expect(upgradedResult.status).toBe("success");
      expect(upgradedResult.data.bundle_release).toEqual({
        release: "kepler-bundle-3.0.1",
        content_digest: expect.any(String),
      });
      expect(upgradedResult.data.generation_id).not.toBe(firstRecord.generation_id);
      expect(await Fs.readFile(templatePath, "utf8")).toBe(
        "# Updated Construction design\n",
      );
      expect(await Fs.readFile(settingsPath, "utf8")).toBe(settings);
      expect(await Fs.readFile(unknownPath, "utf8")).toBe("user-owned resource\n");

      const upgradedRecord = await Fs.readFile(recordPath);
      const incompatibleRoot = Path.join(resourceRoot, "incompatible-override");
      await Fs.cp(sidecarRoot, incompatibleRoot, { recursive: true });
      await updateManifest(incompatibleRoot, { cliReleases: ["0.10.2"] });
      const incompatible = await runInstalledSetup(
        executablePath,
        home,
        incompatibleRoot,
      );
      expect(incompatible.exitCode).toBe(1);
      expect(parseCliResult(incompatible.stdout)).toMatchObject({
        status: "failed",
        data: { code: "bundle_incompatible" },
      });
      expect(await Fs.readFile(recordPath)).toEqual(upgradedRecord);
      expect(await Fs.readFile(templatePath, "utf8")).toBe(
        "# Updated Construction design\n",
      );

      const modifiedContent = "# User-modified Construction design\n";
      await Fs.writeFile(templatePath, modifiedContent);
      const nextOverrideRoot = Path.join(resourceRoot, "next-override");
      await Fs.cp(overrideRoot, nextOverrideRoot, { recursive: true });
      await updateManifest(nextOverrideRoot, {
        bundleRelease: "kepler-bundle-3.0.2",
        file: {
          path: "templates/v3/construction/design.md",
          contents: new TextEncoder().encode("# Next Construction design\n"),
        },
      });
      const conflict = await runInstalledSetup(
        executablePath,
        home,
        nextOverrideRoot,
      );
      expect(conflict.exitCode).toBe(1);
      expect(parseCliResult(conflict.stdout)).toMatchObject({
        status: "failed",
        data: { code: "resource_conflict" },
      });
      expect(await Fs.readFile(templatePath, "utf8")).toBe(modifiedContent);
      expect(await Fs.readFile(recordPath)).toEqual(upgradedRecord);
      expect(await Fs.readFile(settingsPath, "utf8")).toBe(settings);
    }, 120_000);

    it("refuses a release with a bad checksum before installing or running setup", async () => {
      const tamperedAssets = Path.join(resourceRoot, "tampered-assets");
      await Fs.cp(assetsDirectory, tamperedAssets, { recursive: true });
      const sumsPath = Path.join(tamperedAssets, "SHA256SUMS");
      const sums = await Fs.readFile(sumsPath, "utf8");
      const tamperedSums = sums
        .split("\n")
        .map((line) =>
          line.endsWith(`  ${executableName}`)
            ? `${"0".repeat(64)}  ${executableName}`
            : line,
        )
        .join("\n");
      await Fs.writeFile(sumsPath, tamperedSums);
      const home = Path.join(resourceRoot, "bad-checksum-home");
      const installation = await runInstaller(home, tamperedAssets);

      expect(installation.exitCode).not.toBe(0);
      expect(`${installation.stdout}\n${installation.stderr}`).toContain("FAILED");
      await expect(Fs.access(Path.join(home, ".kepler-dist/bin/kepler"))).rejects.toThrow();
      await expect(Fs.access(Path.join(home, ".local/bin/kepler"))).rejects.toThrow();
      await expect(Fs.access(Path.join(home, ".config/vialactea-works/kepler"))).rejects.toThrow();
      expect(await Fs.readdir(Path.join(home, "tmp"))).toEqual([]);
    }, 120_000);
  });
}
