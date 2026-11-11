import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractTargetArchive,
  targetArchiveName,
  validateTargetArchive,
  type ReleaseTarget,
  type ValidatedTargetArchive,
} from "../../packages/cli/src/cli/release-archive.js";
import { sha256Digest } from "../../packages/cli/src/cli/content-digest.js";
import { CLI_RELEASE } from "../../packages/cli/src/cli/version.js";

const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Fs.realpathSync(Os.tmpdir()), "kepler-versioned-home-e2e-"));
  temporaryRoots.push(root);
  return root;
}

function currentTarget(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Unsupported native target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

function readExactArchive(): { readonly bytes: Uint8Array; readonly validated: ValidatedTargetArchive } {
  const archivePath = process.env.KEPLER_VERIFIED_ARCHIVE_PATH;
  const expectedTarget = process.env.KEPLER_EXPECTED_TARGET;
  const expectedDigest = process.env.KEPLER_VERIFIED_ARCHIVE_SHA256;
  const expectedCommit = process.env.KEPLER_EXPECTED_SOURCE_COMMIT;
  if (!archivePath || !expectedTarget || !expectedDigest || !expectedCommit) {
    throw new Error("Native home E2E requires the exact workflow-built archive, target, digest, and source commit");
  }
  const target = currentTarget();
  const targetName = `${target.os}-${target.arch}`;
  if (expectedTarget !== targetName) {
    throw new Error(`Expected native target ${expectedTarget}; detected ${targetName}`);
  }
  const absolutePath = Path.resolve(archivePath);
  const status = Fs.lstatSync(absolutePath);
  if (!status.isFile() || status.isSymbolicLink()) throw new Error("Configured target archive must be a regular file");
  if (Path.basename(absolutePath) !== targetArchiveName(CLI_RELEASE, target)) {
    throw new Error(`Configured archive must be named ${targetArchiveName(CLI_RELEASE, target)}`);
  }
  const bytes = new Uint8Array(Fs.readFileSync(absolutePath));
  const actualDigest = sha256Digest(bytes);
  const expected = expectedDigest.startsWith("sha256:") ? expectedDigest : `sha256:${expectedDigest}`;
  if (actualDigest !== expected) throw new Error(`Target archive digest mismatch: ${actualDigest}`);
  const validated = validateTargetArchive(bytes, { expectedVersion: CLI_RELEASE, expectedTarget: target });
  if (validated.identity.source.kind !== "production" || validated.identity.source.commit !== expectedCommit) {
    throw new Error("Native E2E archive does not bind the frozen production source commit");
  }
  return { bytes, validated };
}

function unpackCandidate(root: string) {
  const { bytes, validated } = readExactArchive();
  const packageRoot = Path.join(root, "candidate");
  extractTargetArchive(bytes, packageRoot, {
    expectedVersion: CLI_RELEASE,
    expectedTarget: currentTarget(),
  });
  return {
    packageRoot,
    binary: Path.join(packageRoot, "bin", "kepler"),
    validated,
  };
}

function parseResult(stdout: string): { readonly status: string; readonly data: Record<string, unknown> } {
  const value = JSON.parse(stdout) as { readonly status?: unknown; readonly data?: unknown };
  if (typeof value.status !== "string" || value.data === null || typeof value.data !== "object") {
    throw new Error(`Kepler returned an invalid result envelope: ${stdout}`);
  }
  return { status: value.status, data: value.data as Record<string, unknown> };
}

async function runSetup(binary: string, home: string, cwd: string) {
  return execa(binary, ["setup"], {
    cwd,
    env: {
      HOME: Path.resolve(home, "../../.."),
      XDG_CONFIG_HOME: Path.join(Path.resolve(home, "../../.."), ".config"),
      KEPLER_HOME: home,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TMPDIR: Path.dirname(home),
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      TZ: "UTC",
    },
    extendEnv: false,
    reject: false,
    timeout: 120_000,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("native target archive versioned-home E2E", () => {
  it("runs setup from the exact native archive and preserves home edits and deletions", async () => {
    const root = createRoot();
    const candidate = unpackCandidate(root);
    const managerHome = Path.join(root, "manager-home");
    const home = Path.join(managerHome, "kepler", "versions", CLI_RELEASE);
    const project = Path.join(root, "project");
    Fs.mkdirSync(project);

    const first = await runSetup(candidate.binary, home, project);
    expect(first.exitCode, `${first.stdout}\n${first.stderr}`).toBe(0);
    expect(first.stderr).toBe("");
    expect(parseResult(first.stdout)).toEqual({
      status: "success",
      data: { home, release: CLI_RELEASE, status: "initialized" },
    });
    expect(Fs.statSync(home).mode & 0o777).toBe(0o700);
    expect(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8")).toContain(`"release": "${CLI_RELEASE}"`);

    for (const file of candidate.validated.files) {
      if (!file.path.startsWith("bundle/skills/") &&
          !file.path.startsWith("bundle/templates/") &&
          !file.path.startsWith("bundle/guidelines/") &&
          !file.path.startsWith("bundle/agents/")) continue;
      const relative = file.path.slice("bundle/".length);
      expect(Buffer.compare(
        Fs.readFileSync(Path.join(home, ...relative.split("/"))),
        Buffer.from(file.contents),
      )).toBe(0);
    }

    const settingsPath = Path.join(home, "settings.yaml");
    const userSettings = Buffer.from("custom: true\n");
    const deletedResource = Path.join(home, "skills", "kepler-code", "SKILL.md");
    Fs.writeFileSync(settingsPath, userSettings);
    Fs.unlinkSync(deletedResource);
    const beforeRetry = Fs.readFileSync(Path.join(home, "home-metadata.json"));

    const repeated = await runSetup(candidate.binary, home, project);
    expect(repeated.exitCode, `${repeated.stdout}\n${repeated.stderr}`).toBe(0);
    expect(repeated.stderr).toBe("");
    expect(parseResult(repeated.stdout)).toEqual({
      status: "success",
      data: { home, release: CLI_RELEASE, status: "unchanged" },
    });
    expect(Fs.readFileSync(settingsPath)).toEqual(userSettings);
    expect(Fs.existsSync(deletedResource)).toBe(false);
    expect(Fs.readFileSync(Path.join(home, "home-metadata.json"))).toEqual(beforeRetry);
    expect(Fs.existsSync(Path.join(managerHome, ".local", "bin"))).toBe(false);
    expect(Fs.existsSync(Path.join(managerHome, ".kepler-dist"))).toBe(false);
  }, 120_000);

  it("requires KEPLER_HOME and refuses unknown non-empty homes without modifying them", async () => {
    const root = createRoot();
    const candidate = unpackCandidate(root);
    const project = Path.join(root, "project");
    const managerHome = Path.join(root, "manager-home");
    const home = Path.join(managerHome, "kepler", "versions", CLI_RELEASE);
    Fs.mkdirSync(project);

    const missing = await execa(candidate.binary, ["setup"], {
      cwd: project,
      env: {
        HOME: Path.join(root, "ordinary-home"),
        XDG_CONFIG_HOME: Path.join(root, "xdg"),
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
      extendEnv: false,
      reject: false,
      timeout: 120_000,
    });
    expect(missing.exitCode).toBe(1);
    expect(parseResult(missing.stdout)).toMatchObject({
      status: "failed",
      data: { code: "kepler_home_required" },
    });
    expect(Fs.existsSync(Path.join(root, "ordinary-home"))).toBe(false);
    expect(Fs.existsSync(Path.join(root, "xdg"))).toBe(false);

    Fs.mkdirSync(home, { recursive: true });
    const sentinel = Buffer.from("user-owned\n");
    Fs.writeFileSync(Path.join(home, "notes.txt"), sentinel);
    const result = await runSetup(candidate.binary, home, project);
    expect(result.exitCode).toBe(1);
    expect(parseResult(result.stdout)).toMatchObject({
      status: "failed",
      data: { code: "home_initialization_failed", message: expect.stringContaining("no compatible metadata") },
    });
    expect(Fs.readFileSync(Path.join(home, "notes.txt"))).toEqual(sentinel);
    expect(Fs.readdirSync(home)).toEqual(["notes.txt"]);
    expect(Fs.existsSync(Path.join(managerHome, ".local", "bin"))).toBe(false);
    expect(Fs.existsSync(Path.join(managerHome, ".kepler-dist"))).toBe(false);
  }, 120_000);
});
