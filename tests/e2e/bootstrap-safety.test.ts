import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTargetArchive,
  expectedTargetArchiveNames,
  targetArchiveName,
  type ReleaseTarget,
} from "../../packages/cli/src/cli/release-archive.js";
import {
  encodeBuildIdentityMarker,
  type RuntimeBuildIdentity,
} from "../../packages/cli/src/cli/build-identity.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];
const encoder = new TextEncoder();

function makeTemporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-bootstrap-safety-e2e-"));
  temporaryRoots.push(root);
  return root;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function currentTarget(): ReleaseTarget {
  const os = process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Unsupported native target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

function otherTarget(target: ReleaseTarget): ReleaseTarget {
  return { os: target.os, arch: target.arch === "x64" ? "arm64" : "x64" };
}

function createIdentity(
  release: string,
  target: ReleaseTarget,
  sourceKind: RuntimeBuildIdentity["source"]["kind"] = "development",
): RuntimeBuildIdentity {
  const resources = createSetupBundleFixture({ release });
  const manifest = JSON.parse(resources.manifest) as { readonly resource_digest?: unknown };
  if (typeof manifest.resource_digest !== "string") throw new Error("Fixture resource digest is missing");
  return {
    format_version: 1,
    kepler_release: release,
    source: {
      kind: sourceKind,
      commit: "a".repeat(40),
      content_digest: sha256Digest(`bootstrap test source ${release} ${target.os}-${target.arch}`),
    },
    target,
    resource_digest: manifest.resource_digest as RuntimeBuildIdentity["resource_digest"],
  };
}

function createCandidateArchive(
  release: string,
  identityTarget: ReleaseTarget,
  setupBody: string,
  options: {
    readonly sourceKind?: RuntimeBuildIdentity["source"]["kind"];
    readonly identityOutput?: string;
  } = {},
): Uint8Array {
  const identity = createIdentity(release, identityTarget, options.sourceKind);
  const resources = createSetupBundleFixture({ release });
  const identityJson = shellQuote(options.identityOutput ?? JSON.stringify(identity));
  const executable = encoder.encode([
    "#!/bin/sh",
    "set -eu",
    'case "${1:-}" in',
    `  --print-build-identity) printf '%s\\n' ${identityJson} ;;`,
    `  setup) ${setupBody} ;;`,
    "  *) exit 2 ;;",
    "esac",
    `# ${encodeBuildIdentityMarker(identity)}`,
    "",
  ].join("\n"));
  return createTargetArchive({ executable, resources }).archive;
}

function createAssets(root: string, archive: Uint8Array, requestedTarget: ReleaseTarget): string {
  Fs.mkdirSync(root, { recursive: true });
  const version = "3.0.0";
  const archiveName = targetArchiveName(version, requestedTarget);
  Fs.writeFileSync(Path.join(root, archiveName), archive, { mode: 0o600 });
  const entries = [
    ...expectedTargetArchiveNames(version),
    `kepler-core-${version}.tgz`,
    "RELEASE-MANIFEST.json",
  ].map((name) => {
    const digest = name === archiveName ? sha256Digest(archive) : sha256Digest(encoder.encode(name));
    return `${digest.slice("sha256:".length)}  ${name}`;
  });
  Fs.writeFileSync(Path.join(root, "SHA256SUMS"), `${entries.join("\n")}\n`, { mode: 0o600 });
  return root;
}

function createFakeCurl(root: string): string {
  const bin = Path.join(root, "fake-bin");
  Fs.mkdirSync(bin, { recursive: true });
  const path = Path.join(bin, "curl");
  Fs.writeFileSync(
    path,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(Path.join(repositoryRoot, "tests/fixtures/fake-curl.ts"))} "$@"\n`,
    { mode: 0o755 },
  );
  Fs.chmodSync(path, 0o755);
  return bin;
}

function writeInstallerWithTestLimit(root: string, variable: string, value: number): string {
  const source = Fs.readFileSync(Path.join(repositoryRoot, "install.sh"), "utf8");
  const expression = new RegExp(`^${variable}=[0-9]+$`, "m");
  if (!expression.test(source)) throw new Error(`Bootstrap resource limit ${variable} is missing`);
  const copy = source.replace(expression, `${variable}=${value}`);
  const path = Path.join(root, "bounded-test-install.sh");
  Fs.writeFileSync(path, copy, { mode: 0o700 });
  Fs.chmodSync(path, 0o700);
  return path;
}

interface InstallerInput {
  readonly root: string;
  readonly assets: string;
  readonly fakeBin: string;
  readonly script?: string;
}

async function runInstaller(input: InstallerInput) {
  const home = Path.join(input.root, "home");
  const temporaryDirectory = Path.join(input.root, "tmp");
  Fs.mkdirSync(home, { recursive: true });
  Fs.mkdirSync(temporaryDirectory, { recursive: true });
  const result = await execa("bash", [input.script ?? Path.join(repositoryRoot, "install.sh")], {
    cwd: input.root,
    env: {
      PATH: [input.fakeBin, Path.dirname(process.execPath), "/usr/bin", "/bin"].join(Path.delimiter),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: Path.join(home, ".config"),
      TMPDIR: temporaryDirectory,
      KEPLER_REPO_SLUG: "fixture/kepler",
      KEPLER_VERSION: "v3.0.0",
      KEPLER_FAKE_CURL_SOURCE: Path.join(repositoryRoot, "tests/fixtures/fake-curl.ts"),
      KEPLER_TEST_ASSETS: input.assets,
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      TZ: "UTC",
    },
    extendEnv: false,
    reject: false,
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { ...result, home, temporaryDirectory };
}

function retainedWorkDirectory(temporaryDirectory: string): string {
  const entries = Fs.readdirSync(temporaryDirectory).filter(
    (entry) => entry.startsWith("kepler-bootstrap.") && !entry.endsWith(".displaced"),
  );
  if (entries.length !== 1) throw new Error(`Expected one retained bootstrap directory, found ${entries.length}`);
  return Path.join(temporaryDirectory, entries[0] as string);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

function malformedIdentityOutputs(target: ReleaseTarget): readonly (readonly [string, string])[] {
  const valid = JSON.stringify(createIdentity("3.0.0", target));
  return [
    ["unstructured text with identity-looking tokens", `not-json "kepler_release":"3.0.0" "os":"${target.os}" "arch":"${target.arch}"`],
    ["duplicate release field", valid.replace('"kepler_release":"3.0.0"', '"kepler_release":"3.0.0","kepler_release":"3.0.0"')],
    ["unknown root field", valid.replace('"format_version":1,', '"format_version":1,"unexpected":true,')],
    ["wrong format field type", valid.replace('"format_version":1', '"format_version":"1"')],
    ["wrong source field type", valid.replace('"kind":"development"', '"kind":1')],
    ["wrong target field type", valid.replace(`"arch":"${target.arch}"`, '"arch":1')],
    ["wrong resource digest", valid.replace(/"resource_digest":"[^"]+"/, '"resource_digest":"invalid"')],
    ["truncated JSON", valid.slice(0, -1)],
    ["tokens spoofed inside JSON text", JSON.stringify(`not an identity: ${valid}`)],
    ["trailing identity-looking tokens", `${valid} "kepler_release":"3.0.0" "os":"${target.os}" "arch":"${target.arch}"`],
    ["oversized output", "x".repeat(1025)],
  ];
}

describe("bootstrap archive identity and resource guards", () => {
  it.each(["development", "production"] as const)("accepts a complete canonical v1 %s identity", async (sourceKind) => {
    const root = makeTemporaryRoot();
    const target = currentTarget();
    const archive = createCandidateArchive(
      "3.0.0",
      target,
      'printf "setup invoked\\n" > "$HOME/setup-invoked"',
      { sourceKind },
    );
    const assets = createAssets(Path.join(root, "assets"), archive, target);
    const fakeBin = createFakeCurl(root);

    const result = await runInstaller({ root, assets, fakeBin });

    expect(result.exitCode).toBe(0);
    expect(Fs.readFileSync(Path.join(result.home, "setup-invoked"), "utf8")).toBe("setup invoked\n");
    expect(Fs.readdirSync(result.temporaryDirectory)).toEqual([]);
    expect(Fs.existsSync(Path.join(result.home, ".kepler-dist", "current"))).toBe(false);
  });

  it("reports an unexpected shell expansion failure without invoking candidate setup", async () => {
    const root = makeTemporaryRoot();
    const target = currentTarget();
    const archive = createCandidateArchive("3.0.0", target, 'printf "setup invoked\\n" > "$HOME/setup-invoked"');
    const assets = createAssets(Path.join(root, "assets"), archive, target);
    const fakeBin = createFakeCurl(root);
    const source = Fs.readFileSync(Path.join(repositoryRoot, "install.sh"), "utf8");
    const call = '  install_kepler "$platform" "$tag" "$work_dir"';
    expect(source).toContain(call);
    const script = Path.join(root, "expansion-failure-install.sh");
    Fs.writeFileSync(script, source.replace(call, `  printf '%s\\n' "$KEPLER_TEST_UNSET"\n${call}`));

    const result = await runInstaller({ root, assets, fakeBin, script });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("KEPLER_TEST_UNSET");
    expect(result.stderr).toContain("unbound variable");
    expect(Fs.existsSync(Path.join(result.home, "setup-invoked"))).toBe(false);
    const retained = retainedWorkDirectory(result.temporaryDirectory);
    expect(result.stderr).not.toContain("(exit 0)");
    expect(Fs.readdirSync(retained)).toEqual([]);
  });

  it.each(malformedIdentityOutputs(currentTarget()))("rejects malformed output: %s", async (_case, identityOutput) => {
    const root = makeTemporaryRoot();
    const target = currentTarget();
    const archive = createCandidateArchive(
      "3.0.0",
      target,
      'printf "setup invoked\\n" > "$HOME/setup-invoked"',
      { identityOutput },
    );
    const assets = createAssets(Path.join(root, "assets"), archive, target);
    const fakeBin = createFakeCurl(root);

    const result = await runInstaller({ root, assets, fakeBin });

    expect(result.exitCode).not.toBe(0);
    expect(Fs.existsSync(Path.join(result.home, "setup-invoked"))).toBe(false);
    expect(Fs.existsSync(Path.join(result.home, ".kepler-dist", "current"))).toBe(false);
    const retained = retainedWorkDirectory(result.temporaryDirectory);
    expect(Fs.statSync(Path.join(retained, "candidate", "bin", "kepler")).isFile()).toBe(true);
  });

  it.each([
    ["wrong release", "4.0.0", currentTarget()],
    ["wrong target", "3.0.0", otherTarget(currentTarget())],
  ] as const)("rejects a checksum-valid candidate with a %s before setup", async (_case, release, identityTarget) => {
    const root = makeTemporaryRoot();
    const requestedTarget = currentTarget();
    const archive = createCandidateArchive(release, identityTarget, 'printf "setup invoked\\n" > "$HOME/setup-invoked"');
    const assets = createAssets(Path.join(root, "assets"), archive, requestedTarget);
    const fakeBin = createFakeCurl(root);
    const setupMarker = Path.join(root, "home", "setup-invoked");

    const result = await runInstaller({ root, assets, fakeBin });

    expect(result.exitCode).not.toBe(0);
    expect(Fs.existsSync(setupMarker)).toBe(false);
    expect(Fs.existsSync(Path.join(result.home, ".kepler-dist", "current"))).toBe(false);
    expect(Fs.existsSync(Path.join(result.home, ".local", "bin", "kepler"))).toBe(false);
    const retained = retainedWorkDirectory(result.temporaryDirectory);
    expect(Fs.statSync(Path.join(retained, "candidate", "bin", "kepler")).isFile()).toBe(true);
    expect(Fs.readFileSync(Path.join(retained, targetArchiveName("3.0.0", requestedTarget))).byteLength).toBe(archive.byteLength);
  });

  it.each([
    ["compressed size", "MAX_COMPRESSED_BYTES"],
    ["expanded size", "MAX_EXPANDED_BYTES"],
    ["member count", "MAX_ARCHIVE_FILES"],
  ] as const)("rejects a valid candidate beyond the %s bound without setup", async (_case, limitName) => {
    const root = makeTemporaryRoot();
    const target = currentTarget();
    const archive = createCandidateArchive("3.0.0", target, 'printf "setup invoked\\n" > "$HOME/setup-invoked"');
    const assets = createAssets(Path.join(root, "assets"), archive, target);
    const fakeBin = createFakeCurl(root);
    const smallLimitInstaller = writeInstallerWithTestLimit(root, limitName, 1);

    const result = await runInstaller({ root, assets, fakeBin, script: smallLimitInstaller });

    expect(result.exitCode).not.toBe(0);
    expect(Fs.existsSync(Path.join(result.home, "setup-invoked"))).toBe(false);
    expect(Fs.existsSync(Path.join(result.home, ".kepler-dist", "current"))).toBe(false);
    const retained = retainedWorkDirectory(result.temporaryDirectory);
    expect(Fs.readFileSync(Path.join(retained, targetArchiveName("3.0.0", target)))).toEqual(Buffer.from(archive));
    expect(Fs.existsSync(Path.join(retained, "candidate"))).toBe(false);
  });

  it("preserves a replacement staging directory after candidate setup changes its owner identity", async () => {
    const root = makeTemporaryRoot();
    const target = currentTarget();
    const setupBody = [
      'printf "setup invoked\\n" > "$HOME/setup-invoked"',
      'work_dir=$(dirname "$(dirname "$(dirname "$0")")")',
      'printf "%s\\n" "$work_dir" > "$HOME/setup-work-path"',
      'mv "$work_dir" "$work_dir.displaced"',
      'mkdir "$work_dir"',
      'printf "replacement sentinel\\n" > "$work_dir/replacement-sentinel"',
    ].join("; ");
    const archive = createCandidateArchive("3.0.0", target, setupBody);
    const assets = createAssets(Path.join(root, "assets"), archive, target);
    const fakeBin = createFakeCurl(root);

    const result = await runInstaller({ root, assets, fakeBin });

    expect(result.exitCode).not.toBe(0);
    expect(Fs.existsSync(Path.join(result.home, "setup-invoked"))).toBe(true);
    const originalWorkPath = Fs.readFileSync(Path.join(result.home, "setup-work-path"), "utf8").trim();
    const workDirectory = originalWorkPath || retainedWorkDirectory(result.temporaryDirectory);
    expect(Fs.readFileSync(Path.join(workDirectory, "replacement-sentinel"), "utf8")).toBe("replacement sentinel\n");
    expect(Fs.existsSync(`${workDirectory}.displaced`)).toBe(true);
  });
});
