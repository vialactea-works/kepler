import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packageTargetArchive } from "../../scripts/package-target-archive.js";
import { createDevelopmentSourceIdentity, readSourceIdentity } from "../../scripts/release-identity.js";
import { encodeBuildIdentityMarker, type RuntimeBuildIdentity } from "../../packages/cli/src/cli/build-identity.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import { targetArchiveName, validateTargetArchive } from "../../packages/cli/src/cli/release-archive.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const temporaryRoots: string[] = [];
const target = { os: "linux", arch: "x64" } as const;
const version = "3.0.0";

function write(root: string, path: string, contents: string | Uint8Array): void {
  const destination = Path.join(root, path);
  Fs.mkdirSync(Path.dirname(destination), { recursive: true });
  Fs.writeFileSync(destination, contents);
}

function fixture() {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-target-packaging-"));
  temporaryRoots.push(root);
  const repository = Path.join(root, "repository");
  const resources = createSetupBundleFixture({ release: version });
  write(repository, "package.json", JSON.stringify({ name: "packaging-fixture", version }));
  for (const name of ["core", "cli"]) {
    write(repository, `packages/${name}/package.json`, JSON.stringify({ name: `@vialactea-works/kepler-${name}`, version }));
  }
  write(repository, "src/index.ts", `export const VERSION = "${version}";\n`);
  write(repository, "packages/cli/src/cli/version.ts", `export const CLI_RELEASE = "${version}";\n`);
  write(repository, "packages/core/src/artifact.ts", "export const CONSTRUCTION_SCHEMA_VERSION = 3 as const;\n");
  write(repository, `docs/releases/${version}.md`, `# Kepler ${version}\n`);
  write(repository, "bundle/manifest.json", resources.manifest);
  for (const file of resources.files) {
    write(repository, `bundle/${file.path}`, file.contents);
    if (file.path.startsWith("skills/")) write(repository, file.path, file.contents);
  }
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (key.startsWith("GIT_")) delete environment[key];
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  for (const args of [
    ["init", "--quiet"],
    ["add", "."],
    ["-c", "user.name=Kepler Test", "-c", "user.email=kepler-test@example.invalid", "commit", "--quiet", "-m", "packaging fixture"],
  ]) execFileSync("git", args, { cwd: repository, env: environment, stdio: "pipe" });
  const source = readSourceIdentity(repository);
  expect(source.kind).toBe("production");
  const resourceManifest = JSON.parse(resources.manifest);
  const binary = Path.join(root, "kepler");
  const output = Path.join(root, targetArchiveName(version, target));
  return { root, repository, source, binary, output, resourceDigest: resourceManifest.resource_digest };
}

function binaryFor(
  input: ReturnType<typeof fixture>,
  source: RuntimeBuildIdentity["source"],
): RuntimeBuildIdentity {
  const identity: RuntimeBuildIdentity = {
    format_version: 1,
    kepler_release: version,
    source,
    target,
    resource_digest: input.resourceDigest,
  };
  const bytes = Buffer.from(encodeBuildIdentityMarker(identity));
  Fs.writeFileSync(input.binary, bytes, { mode: 0o755 });
  Fs.writeFileSync(`${input.binary}.identity.json`, JSON.stringify({
    format_version: 1,
    binary_digest: sha256Digest(bytes),
    identity,
  }));
  return identity;
}

function packageFixture(input: ReturnType<typeof fixture>) {
  return packageTargetArchive({ repositoryRoot: input.repository, binary: input.binary, target, output: input.output });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) Fs.rmSync(root, { recursive: true, force: true });
});

describe("target archive packaging source identity", () => {
  it.each(["development", "production"] as const)("preserves an explicit %s identity from clean source", (kind) => {
    const input = fixture();
    const source = kind === "development" ? createDevelopmentSourceIdentity(input.source) : input.source;
    const identity = binaryFor(input, source);
    const result = packageFixture(input);
    const archive = validateTargetArchive(Fs.readFileSync(result.outputPath), {
      expectedIdentity: identity,
      expectedSource: source,
    });
    expect(archive.identity.source).toEqual(source);
    expect(archive.manifest.source).toEqual(source);
    expect(readSourceIdentity(input.repository)).toEqual(input.source);
  });

  it.each([
    { commit: "f".repeat(40) },
    { content_digest: sha256Digest("different authored source") },
  ])("rejects stale binary provenance %j", (change) => {
    const input = fixture();
    binaryFor(input, { ...createDevelopmentSourceIdentity(input.source), ...change });
    expect(() => packageFixture(input)).toThrow(/source changed after the binary was built/i);
    expect(Fs.existsSync(input.output)).toBe(false);
  });

  it.each([
    { contents: "{", error: "Invalid root package manifest JSON" },
    { contents: "null", error: "root package manifest must be an object" },
  ])("rejects invalid root package metadata: $contents", ({ contents, error }) => {
    const input = fixture();
    binaryFor(input, input.source);
    write(input.repository, "package.json", contents);
    expect(() => packageFixture(input)).toThrow(error);
    expect(Fs.existsSync(input.output)).toBe(false);
  });

  it("rejects a production binary when only the checkout's clean status changes", () => {
    const input = fixture();
    binaryFor(input, input.source);
    write(input.repository, "dist/generated.js", "generated output\n");
    const dirty = readSourceIdentity(input.repository);
    expect(dirty).toEqual({ ...input.source, kind: "development" });
    expect(() => packageFixture(input)).toThrow(/source changed after the binary was built/i);
    expect(Fs.existsSync(input.output)).toBe(false);
  });
});
