import { createHash } from "node:crypto";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectedTargetArchiveNames,
  targetArchiveName,
  type ReleaseTarget,
} from "../../packages/cli/src/cli/release-archive.js";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function makeTemporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-bootstrap-checksum-e2e-"));
  temporaryRoots.push(root);
  return root;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function targetForHost(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Unsupported native test target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("bootstrap checksum preflight", () => {
  it("rejects an incomplete release checksum set without touching the selected home", async () => {
    const root = makeTemporaryRoot();
    const target = targetForHost();
    const archiveName = targetArchiveName("3.0.0", target);
    const assets = Path.join(root, "assets");
    const fakeBin = Path.join(root, "fake-bin");
    const temporaryDirectory = Path.join(root, "tmp");
    const home = Path.join(root, "home");
    Fs.mkdirSync(assets, { recursive: true });
    Fs.mkdirSync(fakeBin, { recursive: true });
    Fs.mkdirSync(temporaryDirectory, { recursive: true });
    const archive = Buffer.from("checksum failure must precede extraction\n");
    Fs.writeFileSync(Path.join(assets, archiveName), archive);
    const digest = createHash("sha256").update(archive).digest("hex");
    Fs.writeFileSync(Path.join(assets, "SHA256SUMS"), `${digest}  ${archiveName}\n`);

    const curlPath = Path.join(fakeBin, "curl");
    Fs.writeFileSync(curlPath, `#!/bin/sh\nexec ${shellQuote(process.execPath)} "$KEPLER_FAKE_CURL_SOURCE" "$@"\n`, { mode: 0o755 });
    Fs.chmodSync(curlPath, 0o755);

    const stableLauncher = Path.join(home, ".local", "bin", "kepler");
    const selectorDirectory = Path.join(home, ".kepler-dist");
    const configSentinel = Path.join(home, ".config", "sentinel.txt");
    Fs.mkdirSync(Path.dirname(stableLauncher), { recursive: true });
    Fs.mkdirSync(selectorDirectory, { recursive: true });
    Fs.mkdirSync(Path.dirname(configSentinel), { recursive: true });
    const stableBytes = Buffer.from("preserve existing command\n");
    const configBytes = Buffer.from("preserve existing configuration\n");
    Fs.writeFileSync(stableLauncher, stableBytes);
    Fs.writeFileSync(Path.join(selectorDirectory, "sentinel.txt"), "preserve distribution sentinel\n");
    Fs.writeFileSync(configSentinel, configBytes);

    const result = await execa("bash", [Path.join(repositoryRoot, "install.sh")], {
      cwd: root,
      env: {
        PATH: [fakeBin, Path.dirname(process.execPath), "/usr/bin", "/bin"].join(Path.delimiter),
        HOME: home,
        XDG_CONFIG_HOME: Path.join(home, ".config"),
        TMPDIR: temporaryDirectory,
        KEPLER_REPO_SLUG: "fixture/kepler",
        KEPLER_VERSION: "v3.0.0",
        KEPLER_FAKE_CURL_SOURCE: Path.join(repositoryRoot, "tests/fixtures/fake-curl.ts"),
        KEPLER_TEST_ASSETS: assets,
      },
      extendEnv: false,
      reject: false,
      timeout: 30_000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("SHA256SUMS does not contain the complete release asset set");
    expect(Fs.readFileSync(stableLauncher)).toEqual(stableBytes);
    expect(Fs.readFileSync(configSentinel)).toEqual(configBytes);
    expect(Fs.readFileSync(Path.join(selectorDirectory, "sentinel.txt"), "utf8")).toBe("preserve distribution sentinel\n");
    const preserved = result.stderr.match(/candidate evidence preserved at (.+) \(exit /)?.[1];
    if (!preserved) throw new Error(`Installer did not preserve failure evidence: ${result.stderr}`);
    expect(Fs.readFileSync(Path.join(preserved, archiveName))).toEqual(archive);

    const packageRoot = Path.join(root, "unsafe-package");
    Fs.mkdirSync(Path.join(packageRoot, "bin"), { recursive: true });
    Fs.mkdirSync(Path.join(packageRoot, "bundle"), { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "bin", "kepler"), "not executed\n");
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), "{}\n");
    Fs.writeFileSync(Path.join(packageRoot, "release-manifest.json"), "{}\n");
    Fs.symlinkSync("../../outside-sentinel", Path.join(packageRoot, "bundle", "manifest.json"));
    const maliciousArchive = Path.join(assets, archiveName);
    await execa("tar", ["-czf", maliciousArchive, "-C", packageRoot, "bin/kepler", "bundle/manifest.json", "package.json", "release-manifest.json"]);
    const maliciousBytes = Fs.readFileSync(maliciousArchive);
    const requiredNames = [
      ...expectedTargetArchiveNames("3.0.0"),
      "kepler-core-3.0.0.tgz",
      "RELEASE-MANIFEST.json",
    ];
    const completeChecksums = requiredNames.map((name) => {
      const value = name === archiveName ? maliciousBytes : Buffer.from(name);
      return `${createHash("sha256").update(value).digest("hex")}  ${name}`;
    });
    Fs.writeFileSync(Path.join(assets, "SHA256SUMS"), `${completeChecksums.join("\n")}\n`);

    const unsafeArchive = await execa("bash", [Path.join(repositoryRoot, "install.sh")], {
      cwd: root,
      env: {
        PATH: [fakeBin, Path.dirname(process.execPath), "/usr/bin", "/bin"].join(Path.delimiter),
        HOME: home,
        XDG_CONFIG_HOME: Path.join(home, ".config"),
        TMPDIR: temporaryDirectory,
        KEPLER_REPO_SLUG: "fixture/kepler",
        KEPLER_VERSION: "v3.0.0",
        KEPLER_FAKE_CURL_SOURCE: Path.join(repositoryRoot, "tests/fixtures/fake-curl.ts"),
        KEPLER_TEST_ASSETS: assets,
      },
      extendEnv: false,
      reject: false,
      timeout: 30_000,
    });
    expect(unsafeArchive.exitCode).not.toBe(0);
    expect(unsafeArchive.stderr).toContain("target archive contains a link, special file, or uninspectable member");
    expect(Fs.readFileSync(stableLauncher)).toEqual(stableBytes);
    expect(Fs.readFileSync(configSentinel)).toEqual(configBytes);
    expect(Fs.readFileSync(Path.join(selectorDirectory, "sentinel.txt"), "utf8")).toBe("preserve distribution sentinel\n");
    expect(Fs.existsSync(Path.join(home, ".kepler-dist", "current"))).toBe(false);
  }, 30_000);
});
