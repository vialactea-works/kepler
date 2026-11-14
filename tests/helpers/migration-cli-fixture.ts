import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { buildReleaseBinary } from "../../scripts/build-release-binary.js";
import { listRegularFiles, planResourceGeneration } from "../../scripts/resource-generation.js";
import { createTargetPackage, validateTargetPackageRoot, type ReleaseTarget } from "../../packages/cli/src/cli/release-archive.js";
import { CLI_RELEASE } from "../../packages/cli/src/cli/version.js";
import type { RuntimeBuildIdentity } from "../../packages/cli/src/cli/build-identity.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const guidePath = "skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md";

export interface MigrationCliFixture {
  readonly rootDirectory: string;
  readonly sourceRoot: string;
  readonly packageRoot: string;
  readonly binaryPath: string;
  readonly guidePath: string;
  readonly guideBytes: Uint8Array;
  readonly identity: RuntimeBuildIdentity;
  readonly sourceGuidePath: string;
  cleanup(): Promise<void>;
}

export async function createMigrationCliFixture(): Promise<MigrationCliFixture> {
  const rootDirectory = await Fs.mkdtemp(Path.join(await Fs.realpath(Os.tmpdir()), "kepler-migration-cli-"));
  const sourceRoot = Path.join(rootDirectory, "source");
  const packageRoot = Path.join(rootDirectory, "package");
  const sourceGuidePath = Path.join(projectRoot, "skills", "kepler-lifecycle-migration", "referenses", "migrations", "2026-11-13-mission-history-generations.md");
  try {
    await Fs.mkdir(sourceRoot);
    const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
      cwd: projectRoot,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const archivePath = Path.join(rootDirectory, "source.tar");
    await Fs.writeFile(archivePath, archive, { mode: 0o600 });
    execFileSync("tar", ["-xf", archivePath, "-C", sourceRoot], { stdio: "ignore" });
    await Fs.unlink(archivePath);
    initializeSourceRepository(sourceRoot);

    const fixtureGuidePath = Path.join(sourceRoot, ...guidePath.split("/"));
    const plannedGuide = await Fs.readFile(fixtureGuidePath, "utf8");
    const releasedGuide = plannedGuide.replace(
      "status: planned\navailable_in: null",
      `status: released\navailable_in: ${CLI_RELEASE}`,
    );
    if (releasedGuide === plannedGuide) throw new Error("The disposable source export does not contain the planned migration guide metadata");
    await Fs.writeFile(fixtureGuidePath, releasedGuide);
    await applyResourceGeneration(sourceRoot);

    const target = currentTarget();
    const build = buildReleaseBinary({
      repositoryRoot: sourceRoot,
      target,
      outputPath: Path.join(rootDirectory, "build", "kepler"),
      identityKind: "development",
    });
    const bundleRoot = Path.join(sourceRoot, "bundle");
    const bundleFiles = listRegularFiles(bundleRoot, "");
    const resourceManifest = bundleFiles.get("manifest.json");
    if (!resourceManifest) throw new Error("The disposable source export has no generated resource manifest");
    bundleFiles.delete("manifest.json");
    const resources = {
      manifest: new TextDecoder("utf-8", { fatal: true }).decode(resourceManifest),
      files: [...bundleFiles].map(([path, contents]) => ({ path, contents })),
    };
    const packaged = createTargetPackage({
      executable: new Uint8Array(await Fs.readFile(build.outputPath)),
      resources,
      expectedVersion: CLI_RELEASE,
      expectedTarget: target,
      expectedSource: build.identity.source,
    });
    await Fs.mkdir(packageRoot, { recursive: true, mode: 0o700 });
    for (const file of packaged.files) {
      const path = Path.join(packageRoot, ...file.path.split("/"));
      await Fs.mkdir(Path.dirname(path), { recursive: true, mode: 0o700 });
      await Fs.writeFile(path, file.contents, { mode: file.executable ? 0o755 : 0o644 });
      await Fs.chmod(path, file.executable ? 0o755 : 0o644);
    }
    validateTargetPackageRoot(packageRoot, {
      expectedVersion: CLI_RELEASE,
      expectedTarget: target,
      expectedIdentity: build.identity,
      modePolicy: "runtime",
    });
    const packageGuidePath = Path.join(packageRoot, "bundle", ...guidePath.split("/"));
    const guideBytes = new Uint8Array(await Fs.readFile(packageGuidePath));
    const originalGuide = await Fs.readFile(sourceGuidePath, "utf8");
    if (!originalGuide.includes("status: planned\navailable_in: null")) throw new Error("The repository migration guide must remain planned with no supporting release");
    if (!releasedGuide.startsWith("---\n") || !releasedGuide.includes(`status: released\navailable_in: ${CLI_RELEASE}`)) throw new Error("The disposable migration guide is not a released test resource");
    if (!Buffer.from(guideBytes).equals(Buffer.from(releasedGuide))) throw new Error("The package guide differs from its disposable released test source");
    if (build.identity.source.kind !== "development") throw new Error("Migration CLI fixture must use a compiled development identity");

    return {
      rootDirectory,
      sourceRoot,
      packageRoot,
      binaryPath: Path.join(packageRoot, "bin", "kepler"),
      guidePath: packageGuidePath,
      guideBytes,
      identity: build.identity,
      sourceGuidePath,
      cleanup: async () => {
        await Fs.rm(rootDirectory, { recursive: true, force: true });
        try {
          await Fs.access(rootDirectory);
          throw new Error(`Migration CLI fixture was not removed: ${rootDirectory}`);
        } catch (error) {
          if (isMissingPath(error)) return;
          throw error;
        }
      },
    };
  } catch (error) {
    await Fs.rm(rootDirectory, { recursive: true, force: true });
    throw error;
  }
}

function initializeSourceRepository(root: string): void {
  const environment: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  const run = (arguments_: readonly string[]): void => {
    execFileSync("git", [...arguments_], {
      cwd: root,
      env: environment,
      stdio: "ignore",
      timeout: 15_000,
    });
  };
  run(["init", "-q"]);
  run(["config", "user.name", "Kepler migration E2E fixture"]);
  run(["config", "user.email", "migration-e2e@example.invalid"]);
  run(["config", "commit.gpgsign", "false"]);
  run(["add", "--all"]);
  run(["commit", "--quiet", "--no-gpg-sign", "-m", "Create private migration CLI source export"]);
}

async function applyResourceGeneration(root: string): Promise<void> {
  const plan = planResourceGeneration(root, CLI_RELEASE);
  for (const deletion of plan.deletions) await Fs.rm(Path.join(root, deletion.path), { force: true });
  for (const change of plan.changes) {
    const target = Path.join(root, change.path);
    await Fs.mkdir(Path.dirname(target), { recursive: true });
    await Fs.writeFile(target, change.contents);
  }
}

function currentTarget(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Migration CLI fixture requires a supported native target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
