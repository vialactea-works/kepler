import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSourceIdentity } from "../../scripts/release-identity.js";
import { buildReleaseBinary } from "../../scripts/build-release-binary.js";
import {
  encodeBuildIdentityMarker,
  readEmbeddedBuildIdentity,
} from "../../packages/cli/src/cli/build-identity.js";
import type { ReleaseTarget } from "../../packages/cli/src/cli/release-archive.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const temporaryRoots: string[] = [];

function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) delete environment[key];
  }
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  return environment;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    env: isolatedGitEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");

function createBuildRepository(root: string): void {
  const bundle = createSetupBundleFixture({ release: "3.0.0" });
  Fs.mkdirSync(Path.join(root, "packages", "cli", "src", "cli"), { recursive: true });
  Fs.mkdirSync(Path.join(root, "packages", "core"), { recursive: true });
  Fs.mkdirSync(Path.join(root, "src"), { recursive: true });
  Fs.mkdirSync(Path.join(root, "bundle"), { recursive: true });
  Fs.writeFileSync(Path.join(root, ".gitignore"), "node_modules/\n");
  Fs.writeFileSync(Path.join(root, "package.json"), `${JSON.stringify({
    name: "kepler-build-fixture",
    version: "3.0.0",
    workspaces: ["packages/*"],
  }, null, 2)}\n`);
  Fs.writeFileSync(Path.join(root, "packages", "cli", "package.json"), `${JSON.stringify({
    name: "@vialactea-works/kepler-cli",
    version: "3.0.0",
  }, null, 2)}\n`);
  Fs.writeFileSync(Path.join(root, "packages", "core", "package.json"), `${JSON.stringify({
    name: "@vialactea-works/kepler-core",
    version: "3.0.0",
  }, null, 2)}\n`);
  Fs.writeFileSync(Path.join(root, "src", "main.ts"), "export const source = 1;\n");
  Fs.writeFileSync(
    Path.join(root, "packages", "cli", "src", "cli", "build-identity.ts"),
    Fs.readFileSync(Path.join(repositoryRoot, "packages", "cli", "src", "cli", "build-identity.ts")),
  );
  Fs.writeFileSync(Path.join(root, "bundle", "manifest.json"), bundle.manifest);
  for (const file of bundle.files) {
    const path = Path.join(root, "bundle", ...file.path.split("/"));
    Fs.mkdirSync(Path.dirname(path), { recursive: true });
    Fs.writeFileSync(path, file.contents);
  }
  const cachePath = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-build-fixture-cache-"));
  const buildHome = Path.join(root, "owned-home");
  const buildTemp = Path.join(root, "owned-tmp");
  Fs.mkdirSync(buildHome, { recursive: true });
  Fs.mkdirSync(buildTemp, { recursive: true });
  try {
    execFileSync(process.execPath, ["install", "--cache-dir", cachePath, "--no-progress"], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: buildHome,
        USERPROFILE: buildHome,
        XDG_CONFIG_HOME: Path.join(buildHome, ".config"),
        XDG_CACHE_HOME: Path.join(buildHome, ".cache"),
        TMPDIR: buildTemp,
      },
      stdio: "pipe",
      timeout: 10_000,
    });
  } finally {
    Fs.rmSync(cachePath, { recursive: true, force: true });
  }
  for (const relativePath of [
    "node_modules",
    "packages/cli/node_modules",
    "packages/core/node_modules",
  ]) {
    Fs.rmSync(Path.join(root, relativePath), { recursive: true, force: true });
  }
  git(root, ["init", "--quiet"]);
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=Kepler Test",
    "-c",
    "user.email=kepler-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "baseline build fixture",
  ]);
}

function nonNativeReleaseTarget(): ReleaseTarget {
  return process.platform === "darwin" && process.arch === "arm64"
    ? { os: "linux", arch: "x64" }
    : { os: "darwin", arch: "arm64" };
}

function writeFrozenIdentityBinary(input: {
  readonly executable: string;
  readonly cwd: string;
}): void {
  const identitySource = Fs.readFileSync(
    Path.join(input.cwd, "packages", "cli", "src", "cli", "build-identity.ts"),
    "utf8",
  );
  const marker = identitySource.match(
    /COMPILED_BUILD_IDENTITY_MARKER[^=]*= "([^"]+)";/,
  )?.[1];
  if (!marker) throw new Error("Frozen build identity was not embedded into its source snapshot");
  const identity = readEmbeddedBuildIdentity(Buffer.from(marker, "utf8"));
  Fs.writeFileSync(input.executable, `${encodeBuildIdentityMarker(identity)}\n`, { mode: 0o755 });
}

function createRepository(root: string, source: number): void {
  Fs.mkdirSync(Path.join(root, "src", "dist"), { recursive: true });
  Fs.mkdirSync(Path.join(root, "bundle", "skills", "kepler-code"), {
    recursive: true,
  });
  Fs.writeFileSync(Path.join(root, "src", "main.ts"), `export const source = ${source};\n`);
  Fs.writeFileSync(
    Path.join(root, "src", "dist", "authored.ts"),
    "export const authored = 1;\n",
  );
  Fs.writeFileSync(Path.join(root, "bundle", "manifest.json"), '{"generated":true}\n');
  Fs.writeFileSync(
    Path.join(root, "bundle", "skills", "kepler-code", "SKILL.md"),
    "generated mirror\n",
  );
  git(root, ["init", "--quiet"]);
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=Kepler Test",
    "-c",
    "user.email=kepler-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    `baseline ${source}`,
  ]);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("Git-backed release source identity", () => {
  it("distinguishes clean, tracked, staged, generated-only, untracked, and nested authored inputs", () => {
    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-source-identity-"));
    temporaryRoots.push(root);
    createRepository(root, 1);

    const clean = readSourceIdentity(root);
    expect(clean.kind).toBe("production");
    expect(clean.commit).toMatch(/^[a-f0-9]{40}$/);

    Fs.writeFileSync(Path.join(root, "bundle", "manifest.json"), '{"generated":false}\n');
    const generatedManifestOnly = readSourceIdentity(root);
    expect(generatedManifestOnly.kind).toBe("development");
    expect(generatedManifestOnly.content_digest).toBe(clean.content_digest);
    git(root, ["checkout", "--", "bundle/manifest.json"]);

    Fs.writeFileSync(Path.join(root, "src", "main.ts"), "export const source = 2;\n");
    const trackedDirty = readSourceIdentity(root);
    expect(trackedDirty.kind).toBe("development");
    expect(trackedDirty.content_digest).not.toBe(clean.content_digest);

    git(root, ["add", "src/main.ts"]);
    const staged = readSourceIdentity(root);
    expect(staged.kind).toBe("development");
    expect(staged.content_digest).toBe(trackedDirty.content_digest);

    Fs.mkdirSync(Path.join(root, "dist"), { recursive: true });
    Fs.writeFileSync(Path.join(root, "dist", "generated.js"), "generated bytes\n");
    const generatedOnly = readSourceIdentity(root);
    expect(generatedOnly.kind).toBe("development");
    expect(generatedOnly.content_digest).toBe(staged.content_digest);

    Fs.writeFileSync(Path.join(root, "new-input.md"), "untracked authored input\n");
    const untracked = readSourceIdentity(root);
    expect(untracked.kind).toBe("development");
    expect(untracked.content_digest).not.toBe(generatedOnly.content_digest);

    const nestedBefore = readSourceIdentity(root);
    Fs.writeFileSync(
      Path.join(root, "src", "dist", "authored.ts"),
      "export const authored = 2;\n",
    );
    const nestedAfter = readSourceIdentity(root);
    expect(nestedAfter.kind).toBe("development");
    expect(nestedAfter.content_digest).not.toBe(nestedBefore.content_digest);
  });

  it("requires a clean production source and truthfully stamps explicit development builds", () => {
    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-build-identity-"));
    temporaryRoots.push(root);
    const repository = Path.join(root, "repository");
    Fs.mkdirSync(repository);
    createBuildRepository(repository);
    const target = nonNativeReleaseTarget();
    const cleanIdentity = readSourceIdentity(repository);
    expect(cleanIdentity.kind).toBe("production");

    const productionOutput = Path.join(root, "production-binary");
    const production = buildReleaseBinary({
      repositoryRoot: repository,
      target,
      outputPath: productionOutput,
      requireClean: true,
      compile: (input) => writeFrozenIdentityBinary({ executable: productionOutput, cwd: input.cwd }),
    });
    expect(production.identity.source).toEqual(cleanIdentity);
    expect(production.identity.source.kind).toBe("production");
    expect(readEmbeddedBuildIdentity(Fs.readFileSync(productionOutput))).toEqual(production.identity);

    Fs.writeFileSync(Path.join(repository, "src", "main.ts"), "export const source = 2;\n");
    const development = readSourceIdentity(repository);
    const rejectedOutput = Path.join(root, "must-not-build");
    let compiled = false;
    expect(() => buildReleaseBinary({
      repositoryRoot: repository,
      target,
      outputPath: rejectedOutput,
      requireClean: true,
      compile: () => { compiled = true; },
    })).toThrow(/clean frozen source checkout/i);
    expect(compiled).toBe(false);
    expect(Fs.existsSync(rejectedOutput)).toBe(false);

    const developmentOutput = Path.join(root, "development-binary");
    const result = buildReleaseBinary({
      repositoryRoot: repository,
      target,
      outputPath: developmentOutput,
      compile: (input) => writeFrozenIdentityBinary({ executable: developmentOutput, cwd: input.cwd }),
    });
    expect(result.identity.source).toEqual(development);
    expect(result.identity.source.kind).toBe("development");
    expect(readEmbeddedBuildIdentity(Fs.readFileSync(developmentOutput))).toEqual(result.identity);
  });

  it("rejects output redirection and source drift from frozen build inputs", () => {
    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-build-drift-"));
    temporaryRoots.push(root);
    const repository = Path.join(root, "repository");
    Fs.mkdirSync(repository);
    createBuildRepository(repository);
    const target = nonNativeReleaseTarget();
    const alias = Path.join(root, "checkout-alias");
    Fs.symlinkSync(repository, alias, "dir");
    let compiled = false;
    expect(() => buildReleaseBinary({
      repositoryRoot: repository,
      target,
      outputPath: Path.join(alias, "redirected-output"),
      compile: () => { compiled = true; },
    })).toThrow(/resolve outside the source checkout/i);
    expect(compiled).toBe(false);
    expect(Fs.existsSync(Path.join(repository, "redirected-output"))).toBe(false);

    const driftOutput = Path.join(root, "drift-binary");
    expect(() => buildReleaseBinary({
      repositoryRoot: repository,
      target,
      outputPath: driftOutput,
      compile: (input) => {
        writeFrozenIdentityBinary({ executable: driftOutput, cwd: input.cwd });
        Fs.writeFileSync(Path.join(repository, "src", "main.ts"), "export const source = 9;\n");
      },
    })).toThrow(/source inputs changed during the build/i);
    expect(Fs.existsSync(driftOutput)).toBe(false);
  });

  it("ignores inherited Git redirection and binds identity to the requested worktree", () => {
    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-source-identity-roots-"));
    temporaryRoots.push(root);
    const repositoryA = Path.join(root, "a");
    const repositoryB = Path.join(root, "b");
    Fs.mkdirSync(repositoryA, { recursive: true });
    Fs.mkdirSync(repositoryB, { recursive: true });
    createRepository(repositoryA, 1);
    createRepository(repositoryB, 9);

    const baselineA = readSourceIdentity(repositoryA);
    expect(() => readSourceIdentity(Path.join(repositoryA, "src"))).toThrow(
      /Git repository root does not match the requested source root/,
    );
    Fs.writeFileSync(
      Path.join(repositoryA, "src", "main.ts"),
      "export const source = 2;\n",
    );
    const expectedA = readSourceIdentity(repositoryA);
    const redirected = {
      GIT_DIR: Path.join(repositoryB, ".git"),
      GIT_WORK_TREE: repositoryB,
      GIT_INDEX_FILE: Path.join(repositoryB, ".git", "index"),
      GIT_OBJECT_DIRECTORY: Path.join(repositoryB, ".git", "objects"),
      GIT_COMMON_DIR: Path.join(repositoryB, ".git"),
    };
    const previous = new Map(
      Object.keys(redirected).map((key) => [key, process.env[key]]),
    );

    try {
      Object.assign(process.env, redirected);
      const actualA = readSourceIdentity(repositoryA);

      expect(actualA).toEqual(expectedA);
      expect(actualA.commit).toBe(baselineA.commit);
      expect(actualA.kind).toBe("development");
      expect(actualA.content_digest).not.toBe(baselineA.content_digest);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
