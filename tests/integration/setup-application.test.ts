import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  bundleManifestContentDigest,
  parseInstallationReceipt,
  serializeInstallationRecord,
  sha256Digest,
  type BundleManifest,
  type InstallationRecord,
  type InstallationRecordV2,
} from "../../packages/cli/src/cli/installation-record.js";
import { SetupFailure } from "../../packages/cli/src/cli/setup.service.js";
import { BundleRootNotFoundError } from "../../packages/cli/src/cli/bundle-root.js";
import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";
import { encodeBuildIdentityMarker, type RuntimeBuildIdentity } from "../../packages/cli/src/cli/build-identity.js";
import { createTargetPackage, validateTargetPackageRoot } from "../../packages/cli/src/cli/release-archive.js";
import { parseResourceManifest } from "../../packages/cli/src/cli/release-resources.js";
import {
  createNodeGenerationTransactionFiles,
  type GenerationFileIdentity,
  type GenerationTransactionFiles,
} from "../../packages/cli/src/cli/generation-transaction.js";
import {
  packageRegistrationEntryDigest,
  registerPiPackage,
} from "../../packages/cli/src/cli/pi-settings-adapter.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";
import {
  createSetupApplicationFixture,
  defaultSetupRelease,
  supportedPiLoaderSource,
} from "../helpers/setup-application-fixture.js";

const fixtures: ReturnType<typeof createSetupApplicationFixture>[] = [];
const skillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
];
const roles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

function fixture() {
  const value = createSetupApplicationFixture();
  fixtures.push(value);
  return value;
}

function generationFilesWithClaimUnlinkFailure(root: string): {
  readonly files: GenerationTransactionFiles;
  readonly acquiredIdentity: () => GenerationFileIdentity | undefined;
} {
  const base = createNodeGenerationTransactionFiles();
  const claimPath = Path.join(root, ".kepler-dist", ".kepler-installation-owner");
  let identity: GenerationFileIdentity | undefined;
  return {
    files: {
      ...base,
      createExclusiveFile(path, contents, mode) {
        const created = base.createExclusiveFile(path, contents, mode);
        if (path === claimPath) identity = created;
        return created;
      },
      unlink(path) {
        if (path === claimPath) throw new Error("injected owner-claim unlink failure");
        base.unlink(path);
      },
    },
    acquiredIdentity: () => identity,
  };
}

function settings(fixtureValue: ReturnType<typeof fixture>): { packages: unknown[] } {
  return JSON.parse(
    Fs.readFileSync(Path.join(fixtureValue.agentDirectory, "settings.json"), "utf8"),
  ) as { packages: unknown[] };
}

function setTargetPackageFileModes(
  packageRoot: string,
  executableMode: number,
  dataMode: number,
  root = packageRoot,
): void {
  for (const entry of Fs.readdirSync(packageRoot, { withFileTypes: true })) {
    const path = Path.join(packageRoot, entry.name);
    if (entry.isDirectory()) {
      setTargetPackageFileModes(path, executableMode, dataMode, root);
    } else {
      Fs.chmodSync(path, Path.relative(root, path) === Path.join("bin", "kepler")
        ? executableMode
        : dataMode);
    }
  }
}

function legacyReceipt(): InstallationRecord {
  const digest = sha256Digest("legacy-flat-resource");
  const bundleRelease = "kepler-bundle-3.0.0";
  const skillsRelease = "kepler-skills-3.0.0";
  const rolesRelease = "claude-code-bindings-1.0.0";
  const files = {
    "templates/v3/construction/design.md": digest,
    "guidelines/general/01-code-style.md": digest,
    ...Object.fromEntries(skillIds.map((id) => [`skills/${id}/SKILL.md`, digest])),
    ...Object.fromEntries(roles.map(([, agentId]) => [`agents/claude-code/v1/${agentId}.md`, digest])),
  };
  const base: BundleManifest = {
    manifest_format_version: 1,
    bundle_release: bundleRelease,
    files,
    content_digest: digest,
    compatibility: {
      cli_releases: [defaultSetupRelease],
      skills: skillIds.map((id) => ({
        id,
        release: skillsRelease,
        digest,
        required: skillIds.indexOf(id) < 8,
      })),
      host_bindings: roles.map(([role, agentId]) => ({
        role,
        agent_id: agentId,
        release: rolesRelease,
        digest,
      })),
    },
  };
  const manifest: BundleManifest = {
    ...base,
    content_digest: bundleManifestContentDigest(base),
  };
  const record: InstallationRecord = {
    format_version: 1,
    generation_id: "550e8400-e29b-41d4-a716-446655440000",
    cli_release: defaultSetupRelease,
    bundle_release: {
      release: bundleRelease,
      content_digest: manifest.content_digest,
      manifest,
      installed_files: {
        "templates/v3/construction/design.md": digest,
        "guidelines/general/01-code-style.md": digest,
      },
    },
    skills: manifest.compatibility.skills.map((skill) => ({ ...skill, check: "not_checked" })),
    host_binding: {
      host: { id: "claude-code", release: null, check: "not_checked" },
      platform: { os: process.platform, arch: process.arch },
      roles: manifest.compatibility.host_bindings.map((role) => ({ ...role, check: "not_checked" })),
    },
    compatibility: { check: "compatible" },
  };
  return record;
}

function installLegacyFlatState(fixtureValue: ReturnType<typeof fixture>): {
  readonly globalHome: string;
  readonly distributionRoot: string;
  readonly stableLauncher: string;
  readonly flatBinary: string;
} {
  const globalHome = Path.join(fixtureValue.root, ".config", "vialactea-works", "kepler");
  const distributionRoot = Path.join(fixtureValue.root, ".kepler-dist");
  const flatBinary = Path.join(distributionRoot, "bin", "kepler");
  const stableLauncher = Path.join(fixtureValue.root, ".local", "bin", "kepler");
  Fs.mkdirSync(globalHome, { recursive: true });
  Fs.mkdirSync(Path.dirname(flatBinary), { recursive: true });
  Fs.mkdirSync(Path.dirname(stableLauncher), { recursive: true });
  Fs.writeFileSync(flatBinary, "preserved legacy executable\n");
  Fs.symlinkSync(flatBinary, stableLauncher);
  Fs.writeFileSync(Path.join(globalHome, "settings.yaml"), "models: { user: true }\n");
  Fs.mkdirSync(Path.join(globalHome, "templates"), { recursive: true });
  Fs.writeFileSync(Path.join(globalHome, "templates", "user.md"), "preserved user template\n");
  Fs.writeFileSync(Path.join(globalHome, "installation.json"), serializeInstallationRecord(legacyReceipt()));
  return { globalHome, distributionRoot, stableLauncher, flatBinary };
}

function createExternalSkillPackage(fixtureValue: ReturnType<typeof fixture>): {
  readonly source: string;
  readonly packageRoot: string;
  readonly skillPath: string;
} {
  const source = "npm:@example/skill-pack@1.0.0";
  const packageRoot = Path.join(fixtureValue.packageDirectory, "@example", "skill-pack");
  const skillPath = Path.join(packageRoot, "skills", "custom", "SKILL.md");
  Fs.mkdirSync(Path.dirname(skillPath), { recursive: true });
  Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
    name: "@example/skill-pack",
    version: "1.0.0",
    pi: { skills: ["skills"] },
  }));
  Fs.writeFileSync(skillPath, "---\nname: kepler-quality\ndescription: external skill\n---\n\ncustom content\n");
  const current = settings(fixtureValue);
  Fs.writeFileSync(Path.join(fixtureValue.agentDirectory, "settings.json"), `${JSON.stringify({
    ...current,
    packages: [...current.packages, source],
  }, null, 2)}\n`);
  return { source, packageRoot, skillPath };
}

afterEach(() => {
  for (const value of fixtures.splice(0)) value.cleanup();
});

describe("unified setup application", () => {
  it("validates and caches the running immutable package root while rejecting checkout/cwd fallback", () => {
    const value = fixture();
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    const generationA = Path.join(distributionRoot, "generations", "runtime-a");
    const generationB = Path.join(distributionRoot, "generations", "runtime-b");
    const writePackage = (root: string, templateContent: string): RuntimeBuildIdentity => {
      const bundle = createSetupBundleFixture({ templateContent });
      const manifest = parseResourceManifest(bundle.manifest);
      const identity: RuntimeBuildIdentity = {
        format_version: 1,
        kepler_release: defaultSetupRelease,
        source: {
          kind: "development",
          commit: sha256Digest(`runtime-${templateContent}`).slice(7, 47),
          content_digest: sha256Digest(`runtime-source-${templateContent}`),
        },
        target: {
          os: process.platform === "darwin" ? "darwin" : "linux",
          arch: process.arch === "arm64" ? "arm64" : "x64",
        },
        resource_digest: manifest.resource_digest,
      };
      const executable = new TextEncoder().encode(`${encodeBuildIdentityMarker(identity)}\n`);
      const targetPackage = createTargetPackage({
        executable,
        resources: bundle,
        expectedVersion: defaultSetupRelease,
        expectedTarget: identity.target,
        expectedSource: identity.source,
      });
      Fs.mkdirSync(root, { recursive: true });
      for (const file of targetPackage.files) {
        const path = Path.join(root, ...file.path.split("/"));
        Fs.mkdirSync(Path.dirname(path), { recursive: true, mode: 0o700 });
        const mode = file.executable ? 0o555 : 0o444;
        Fs.writeFileSync(path, file.contents, { mode });
        Fs.chmodSync(path, mode);
      }
      const seal = (directory: string): void => {
        for (const entry of Fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) seal(Path.join(directory, entry.name));
        }
        Fs.chmodSync(directory, 0o555);
      };
      seal(root);
      return identity;
    };
    const identity = writePackage(generationA, "# generation A\n");
    writePackage(generationB, "# generation B\n");
    Fs.mkdirSync(distributionRoot, { recursive: true });
    Fs.symlinkSync("generations/runtime-a", Path.join(distributionRoot, "current"));
    expect(() => validateTargetPackageRoot(generationA, { expectedIdentity: identity }))
      .toThrow("mode mismatch");

    const runtime = createSetupRuntime({
      environment: { HOME: value.root },
      buildIdentity: identity,
      execPath: Path.join(distributionRoot, "current", "bin", "kepler"),
    });
    const selectedBundleRoot = runtime.bundleLocator();
    const selectedSnapshot = runtime.files.readBundle(selectedBundleRoot);
    const selectedDesign = selectedSnapshot.files.find((file) => file.path === "templates/v3/construction/design.md");
    expect(selectedBundleRoot).toBe(Path.join(generationA, "bundle"));
    expect(new TextDecoder().decode(selectedDesign?.contents)).toBe("# generation A\n");

    Fs.unlinkSync(Path.join(distributionRoot, "current"));
    Fs.symlinkSync("generations/runtime-b", Path.join(distributionRoot, "current"));
    expect(runtime.bundleLocator()).toBe(selectedBundleRoot);
    const stillSelected = runtime.files.readBundle(runtime.bundleLocator())
      .files.find((file) => file.path === "templates/v3/construction/design.md");
    expect(new TextDecoder().decode(stillSelected?.contents)).toBe("# generation A\n");

    const incompleteRoot = Path.join(value.root, "unselected-checkout");
    const incompleteExec = Path.join(incompleteRoot, "bin", "kepler");
    Fs.mkdirSync(Path.dirname(incompleteExec), { recursive: true });
    Fs.writeFileSync(incompleteExec, "unselected executable\n");
    const unselectedRuntime = createSetupRuntime({
      environment: { HOME: value.root },
      execPath: incompleteExec,
    });
    expect(Fs.existsSync(Path.resolve(import.meta.dirname, "../../bundle/manifest.json"))).toBe(true);
    expect(() => unselectedRuntime.bundleLocator()).toThrow(BundleRootNotFoundError);
  });

  it("installs a direct unpacked archive-mode runtime package into an immutable generation", () => {
    const value = fixture();
    const runningPackageRoot = Path.join(value.root, "running-package");
    const service = value.createService();
    const validatedUnpacked = validateTargetPackageRoot(runningPackageRoot);
    expect(validatedUnpacked.identity.kepler_release).toBe(defaultSetupRelease);
    expect(Fs.statSync(Path.join(runningPackageRoot, "bin", "kepler")).mode & 0o777).toBe(0o755);
    expect(Fs.statSync(Path.join(runningPackageRoot, "release-manifest.json")).mode & 0o777).toBe(0o644);
    expect(() => validateTargetPackageRoot(runningPackageRoot, { modePolicy: "installed" }))
      .toThrow(/Installed package mode mismatch/);

    const result = service.setup();

    const selectedRoot = Path.join(value.root, ".kepler-dist", "generations", result.generation_id);
    expect(result.installation_mode).toBe("first-install");
    expect(Fs.statSync(Path.join(selectedRoot, "bin", "kepler")).mode & 0o777).toBe(0o555);
    expect(Fs.statSync(Path.join(selectedRoot, "release-manifest.json")).mode & 0o777).toBe(0o444);
    expect(validateTargetPackageRoot(selectedRoot, { modePolicy: "installed" }).identity.kepler_release)
      .toBe(defaultSetupRelease);
  });

  it("accepts an immutable installed runtime package for a repeat setup no-op", () => {
    const value = fixture();
    const first = value.createService().setup();
    const service = value.createService();
    const runningPackageRoot = Path.join(value.root, "running-package");
    setTargetPackageFileModes(runningPackageRoot, 0o555, 0o444);

    const repeated = service.setup();

    expect(repeated.installation_mode).toBe("no-op");
    expect(repeated.generation_id).toBe(first.generation_id);
    expect(validateTargetPackageRoot(runningPackageRoot, { modePolicy: "installed" }).identity.kepler_release)
      .toBe(defaultSetupRelease);
    expect(() => validateTargetPackageRoot(runningPackageRoot)).toThrow(/Target archive mode mismatch/);
  });

  it("rejects and preserves a mixed-mode running package before installation effects", () => {
    const value = fixture();
    const service = value.createService();
    const runningPackageRoot = Path.join(value.root, "running-package");
    const runningExecutable = Path.join(runningPackageRoot, "bin", "kepler");
    const mixedDataFile = Path.join(runningPackageRoot, "bundle", "manifest.json");
    const executableBytes = Fs.readFileSync(runningExecutable);
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const settingsBefore = Fs.readFileSync(settingsPath);
    Fs.chmodSync(mixedDataFile, 0o444);
    const mixedDataBytes = Fs.readFileSync(mixedDataFile);

    expect(() => service.setup()).toThrow(expect.objectContaining({ code: "bundle_not_found" }));

    expect(Fs.statSync(runningExecutable).mode & 0o777).toBe(0o755);
    expect(Fs.readFileSync(runningExecutable)).toEqual(executableBytes);
    expect(Fs.statSync(mixedDataFile).mode & 0o777).toBe(0o444);
    expect(Fs.readFileSync(mixedDataFile)).toEqual(mixedDataBytes);
    expect(Fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler"))).toBe(false);
  });

  it("installs a validated generation and writes receipt v2 only after selected and native state verify", () => {
    const value = fixture();
    const result = value.createService().setup();
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    const selector = Path.join(distributionRoot, "current");
    const selectedRoot = Fs.realpathSync(selector);
    const globalHome = Path.join(value.root, ".config", "vialactea-works", "kepler");
    const receipt = parseInstallationReceipt(Fs.readFileSync(Path.join(globalHome, "installation.json"), "utf8"));

    expect(result.installation_mode).toBe("first-install");
    expect(Fs.readlinkSync(selector)).toBe(`generations/${result.generation_id}`);
    expect(selectedRoot).toBe(Path.join(distributionRoot, "generations", result.generation_id));
    expect(Fs.readlinkSync(Path.join(value.root, ".local", "bin", "kepler"))).toBe(
      Path.join(selector, "bin", "kepler"),
    );
    expect(receipt.kind).toBe("current-v2");
    if (receipt.kind !== "current-v2") throw new Error("setup did not write receipt v2");
    expect(receipt.record.selector).toEqual({ path: selector, generation_id: result.generation_id });
    expect(receipt.record.pi_binding.package_source).toBe(selector);
    expect(receipt.record.pi_binding.registration.check).toBe("matches");
    expect(receipt.record.pi_binding.registration.entry_digest).toBe(packageRegistrationEntryDigest(selector));
    expect(settings(value).packages.filter((entry) => entry === selector)).toHaveLength(1);
    expect(Fs.existsSync(Path.join(globalHome, "templates"))).toBe(false);
    expect(Fs.existsSync(Path.join(globalHome, "guidelines"))).toBe(false);
    expect(result.resource_root).toBe(selectedRoot);
    const installedSkillDirectory = Path.join(result.resource_root, "bundle", "skills", "kepler-design");
    const installedDesign = Path.resolve(installedSkillDirectory, "../../templates/v3/construction/design.md");
    const installedGuide = Path.resolve(
      Path.join(result.resource_root, "bundle", "skills", "kepler-code"),
      "../../guidelines/general/01-code-style.md",
    );
    expect(Fs.readFileSync(installedDesign, "utf8")).toBe("# Design template\n");
    expect(Fs.readFileSync(installedGuide, "utf8")).toBe("# Code style\n");
    expect(result.compatibility.check).toBe("compatible");
  });

  it("keeps a repeat install a verified no-op without changing the receipt, settings, selector, or generation", () => {
    const value = fixture();
    const first = value.createService().setup();
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const beforeSettings = Fs.readFileSync(settingsPath);
    const beforeReceipt = Fs.readFileSync(receiptPath);
    const selector = Path.join(value.root, ".kepler-dist", "current");
    const transactions = Path.join(value.root, ".kepler-dist", "transactions");
    const beforeTransactions = Object.fromEntries(Fs.readdirSync(transactions).sort().map((name) => [
      name,
      Fs.readFileSync(Path.join(transactions, name)),
    ]));

    const second = value.createService().setup();

    expect(second.installation_mode).toBe("no-op");
    expect(second.generation_id).toBe(first.generation_id);
    expect(Fs.readlinkSync(selector)).toBe(`generations/${first.generation_id}`);
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist", ".kepler-installation-owner"))).toBe(false);
    expect(Fs.readFileSync(settingsPath)).toEqual(beforeSettings);
    expect(Fs.readFileSync(receiptPath)).toEqual(beforeReceipt);
    expect(Object.fromEntries(Fs.readdirSync(transactions).sort().map((name) => [
      name,
      Fs.readFileSync(Path.join(transactions, name)),
    ]))).toEqual(beforeTransactions);
    expect(second.created_files).toEqual([]);
    expect(second.updated_files).toEqual([]);
  });

  it("blocks read-only no-op while unresolved transaction evidence remains", () => {
    const value = fixture();
    value.createService().setup();
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    const transactions = Path.join(distributionRoot, "transactions");
    const evidencePath = Path.join(transactions, "unresolved.json");
    const evidence = `${JSON.stringify({ owner: "unknown", state: "preparing" })}\n`;
    Fs.writeFileSync(evidencePath, evidence);
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const settingsBefore = Fs.readFileSync(settingsPath);
    const receiptBefore = Fs.readFileSync(receiptPath);
    const selector = Path.join(distributionRoot, "current");
    const selectorTarget = Fs.readlinkSync(selector);

    expect(() => value.createService().setup()).toThrow(
      expect.objectContaining({ code: "generation_recovery_required" }),
    );
    expect(Fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
    expect(Fs.readlinkSync(selector)).toBe(selectorTarget);
    expect(Fs.readFileSync(evidencePath, "utf8")).toBe(evidence);
    expect(Fs.existsSync(Path.join(distributionRoot, ".kepler-installation-owner"))).toBe(false);
  });

  it("preserves a setup failure and journals owner-claim release failure evidence", () => {
    const value = fixture();
    const beforeSettings = Fs.readFileSync(Path.join(value.agentDirectory, "settings.json"));
    const injected = generationFilesWithClaimUnlinkFailure(value.root);
    const primary = new SetupFailure(
      "primary_registration_failure",
      "Primary Pi registration failure.",
      { primary_fixture: "registration" },
      "Resolve the injected registration failure.",
    );
    let thrown: unknown;
    try {
      value.createService(defaultSetupRelease, {
        generationFiles: injected.files,
        registerPiPackage: () => { throw primary; },
      }).setup();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SetupFailure);
    const failure = thrown as SetupFailure;
    expect(failure.code).toBe("primary_registration_failure");
    expect(failure.message).toContain("Primary Pi registration failure.");
    expect(failure.message).toContain("injected owner-claim unlink failure");
    expect(failure.details.primary_fixture).toBe("registration");
    expect(failure.details.journal_state).toBe("recovery_required");
    expect(failure.details.operation_effects).toMatchObject({
      candidate: "staged",
      bootstrap: "selected",
      selector: "bootstrap_selected",
    });
    const journalPath = failure.details.recovery_journal_path as string;
    expect(JSON.parse(Fs.readFileSync(journalPath, "utf8"))).toMatchObject({
      state: "recovery_required",
      failure: "Primary Pi registration failure.",
    });
    const identity = injected.acquiredIdentity();
    if (!identity) throw new Error("owner claim identity was not captured from its creation descriptor");
    const claimPath = Path.join(value.root, ".kepler-dist", ".kepler-installation-owner");
    const claim = failure.details.claim_release_failure as { evidence: Record<string, unknown>; error: Record<string, unknown> };
    expect(claim.error.message).toBe("injected owner-claim unlink failure");
    expect(claim.evidence).toMatchObject({
      path: claimPath,
      acquired_identity: identity,
      observed_identity: identity,
      state_after_release: "acquired_claim_remains",
      identity_matches: true,
      token_matches: true,
    });
    expect(Fs.lstatSync(claimPath)).toMatchObject({ dev: identity.dev, ino: identity.ino });
    expect(Fs.readFileSync(Path.join(value.agentDirectory, "settings.json"))).toEqual(beforeSettings);
  });

  it("fails a successful setup truthfully when owner-claim release fails", () => {
    const value = fixture();
    const injected = generationFilesWithClaimUnlinkFailure(value.root);
    let thrown: unknown;
    try {
      value.createService(defaultSetupRelease, { generationFiles: injected.files }).setup();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SetupFailure);
    const failure = thrown as SetupFailure;
    expect(failure.code).toBe("setup_owner_release_uncertain");
    expect(failure.message).toContain("injected owner-claim unlink failure");
    expect(failure.details.journal_state).toBe("committed");
    expect(failure.details.operation_effects).toMatchObject({
      candidate: "staged",
      selector: "selected",
      installation_record: "verified_update",
    });
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json"))).toBe(true);
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current")).startsWith("generations/")).toBe(true);
    const identity = injected.acquiredIdentity();
    if (!identity) throw new Error("owner claim identity was not captured from its creation descriptor");
    expect(Fs.lstatSync(Path.join(value.root, ".kepler-dist", ".kepler-installation-owner")))
      .toMatchObject({ dev: identity.dev, ino: identity.ino });
  });

  it("preserves a read-only no-op failure when claim release also fails", () => {
    const value = fixture();
    value.createService().setup();
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    const transactions = Path.join(distributionRoot, "transactions");
    const unresolvedPath = Path.join(transactions, "unresolved.json");
    const unresolvedBytes = `${JSON.stringify({ owner: "unknown", state: "preparing" })}\n`;
    Fs.writeFileSync(unresolvedPath, unresolvedBytes);
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const settingsBefore = Fs.readFileSync(settingsPath);
    const receiptBefore = Fs.readFileSync(receiptPath);
    const selectorBefore = Fs.readlinkSync(Path.join(distributionRoot, "current"));
    const injected = generationFilesWithClaimUnlinkFailure(value.root);
    let thrown: unknown;
    try {
      value.createService(defaultSetupRelease, { generationFiles: injected.files }).setup();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SetupFailure);
    const failure = thrown as SetupFailure;
    expect(failure.code).toBe("generation_recovery_required");
    expect(failure.message).toContain("earlier generation operation requires reconciliation");
    expect(failure.message).toContain("injected owner-claim unlink failure");
    expect(failure.details.claim_release_failure).toMatchObject({
      error: { message: "injected owner-claim unlink failure" },
      evidence: { state_after_release: "acquired_claim_remains", identity_matches: true, token_matches: true },
    });
    expect(failure.details.journal_evidence).toMatchObject({ created_by_no_op: false });
    expect(failure.details.operation_effects).toEqual({
      candidate: "unchanged",
      bootstrap: "unchanged",
      selector: "unchanged",
      stable_launcher: "unchanged",
      pi_settings: "unchanged",
      installation_record: "unchanged",
    });
    expect(Fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
    expect(Fs.readlinkSync(Path.join(distributionRoot, "current"))).toBe(selectorBefore);
    expect(Fs.readFileSync(unresolvedPath, "utf8")).toBe(unresolvedBytes);
  });

  it("upgrades by selecting a new immutable generation while retaining the old generation and stable registration", () => {
    const value = fixture();
    const first = value.createService().setup();
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const beforeSettings = Fs.readFileSync(settingsPath);
    value.writeBundle(createSetupBundleFixture({ release: "3.0.1", templateContent: "# Updated design\n" }));

    const upgraded = value.createService("3.0.1").setup();

    expect(upgraded.installation_mode).toBe("upgrade");
    expect(upgraded.generation_id).not.toBe(first.generation_id);
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist", "generations", first.generation_id))).toBe(true);
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"))).toBe(`generations/${upgraded.generation_id}`);
    expect(Fs.readFileSync(settingsPath)).toEqual(beforeSettings);
    const receipt = parseInstallationReceipt(Fs.readFileSync(Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json"), "utf8"));
    expect(receipt.kind).toBe("current-v2");
    if (receipt.kind !== "current-v2") throw new Error("upgrade did not write receipt v2");
    expect(receipt.record.release.version).toBe("3.0.1");
  });

  it.each([
    { name: "empty skill filter", entry: (source: string) => ({ source, skills: [] }) },
    { name: "source-only object", entry: (source: string) => ({ source }) },
  ])("rejects a modified same-source user registration ($name) without adopting or repairing it", ({ entry }) => {
    const value = fixture();
    value.createService().setup();
    const source = Path.join(value.root, ".kepler-dist", "current");
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const prior = settings(value);
    const modified = { ...prior, packages: [entry(source), ...prior.packages.filter((item) => item !== source)] };
    Fs.writeFileSync(settingsPath, `${JSON.stringify(modified, null, 2)}\n`);
    const settingsBefore = Fs.readFileSync(settingsPath);
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const receiptBefore = Fs.readFileSync(receiptPath);
    const selectorPath = Path.join(value.root, ".kepler-dist", "current");
    const selectorBefore = Fs.readlinkSync(selectorPath);

    expect(() => value.createService().setup()).toThrow(
      expect.objectContaining({ code: "setup_registration_conflict" }),
    );
    expect(Fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
    expect(Fs.readlinkSync(selectorPath)).toBe(selectorBefore);
  });

  it("rejects a project-level package filter for the selected generation and preserves both settings files", () => {
    const value = fixture();
    value.createService().setup();
    const source = Path.join(value.root, ".kepler-dist", "current");
    const projectSettingsPath = Path.join(value.projectDirectory, ".pi", "settings.json");
    Fs.mkdirSync(Path.dirname(projectSettingsPath), { recursive: true });
    Fs.writeFileSync(projectSettingsPath, `${JSON.stringify({ packages: [{ source, skills: [] }] }, null, 2)}\n`);
    const projectBefore = Fs.readFileSync(projectSettingsPath);
    const userSettingsPath = Path.join(value.agentDirectory, "settings.json");
    const userBefore = Fs.readFileSync(userSettingsPath);
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const receiptBefore = Fs.readFileSync(receiptPath);

    expect(() => value.createService().setup()).toThrow(
      expect.objectContaining({ code: "setup_registration_conflict" }),
    );
    expect(Fs.readFileSync(projectSettingsPath)).toEqual(projectBefore);
    expect(Fs.readFileSync(userSettingsPath)).toEqual(userBefore);
    expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
  });

  it("repairs a missing native package registration only after verifying its selected generation and receipt", () => {
    const value = fixture();
    const installed = value.createService().setup();
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const current = settings(value);
    Fs.writeFileSync(settingsPath, `${JSON.stringify({ ...current, packages: [supportedPiLoaderSource] }, null, 2)}\n`);

    const repaired = value.createService().setup();

    expect(repaired.installation_mode).toBe("repair");
    expect(repaired.generation_id).toBe(installed.generation_id);
    expect(settings(value).packages).toContain(Path.join(value.root, ".kepler-dist", "current"));
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"))).toBe(`generations/${installed.generation_id}`);
  });

  it("transitions a genuine v1 flat install without deleting its binary or user files", () => {
    const value = fixture();
    const legacy = installLegacyFlatState(value);
    const oldBinary = Fs.readFileSync(legacy.flatBinary);
    const oldUserSettings = Fs.readFileSync(Path.join(legacy.globalHome, "settings.yaml"));
    const oldUserTemplate = Fs.readFileSync(Path.join(legacy.globalHome, "templates", "user.md"));

    const result = value.createService().setup();

    expect(result.installation_mode).toBe("legacy-transition");
    expect(Fs.readFileSync(legacy.flatBinary)).toEqual(oldBinary);
    expect(Fs.readFileSync(Path.join(legacy.globalHome, "settings.yaml"))).toEqual(oldUserSettings);
    expect(Fs.readFileSync(Path.join(legacy.globalHome, "templates", "user.md"))).toEqual(oldUserTemplate);
    expect(Fs.readlinkSync(legacy.stableLauncher)).toBe(Path.join(legacy.distributionRoot, "current", "bin", "kepler"));
    const migrated = parseInstallationReceipt(Fs.readFileSync(Path.join(legacy.globalHome, "installation.json"), "utf8"));
    expect(migrated.kind).toBe("current-v2");
    if (migrated.kind !== "current-v2") throw new Error("legacy receipt did not transition to v2");
    expect(migrated.record.generation_id).toBe(result.generation_id);
  });

  it("rejects a corrupted selected generation before repair and preserves user data", () => {
    const value = fixture();
    const installed = value.createService().setup();
    const resource = Path.join(value.root, ".kepler-dist", "generations", installed.generation_id, "bundle", "skills", "kepler-quality", "SKILL.md");
    const modified = "user edit to selected managed generation\n";
    Fs.chmodSync(resource, 0o644);
    Fs.writeFileSync(resource, modified);
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const beforeReceipt = Fs.readFileSync(receiptPath);

    expect(() => value.createService().setup()).toThrow(
      expect.objectContaining({ code: "selected_generation_invalid" }),
    );

    expect(Fs.readFileSync(resource, "utf8")).toBe(modified);
    expect(Fs.readFileSync(receiptPath)).toEqual(beforeReceipt);
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"))).toBe(`generations/${installed.generation_id}`);
  });

  it.each(["no-op", "repair", "upgrade"] as const)(
    "rejects and preserves a selected executable with missing execute bits during %s planning",
    (mode) => {
      const value = fixture();
      const installed = value.createService().setup();
      const settingsPath = Path.join(value.agentDirectory, "settings.json");
      if (mode === "repair") {
        const current = settings(value);
        Fs.writeFileSync(settingsPath, `${JSON.stringify({ ...current, packages: [supportedPiLoaderSource] }, null, 2)}\n`);
      }
      if (mode === "upgrade") {
        value.writeBundle(createSetupBundleFixture({ release: "3.0.1", templateContent: "# upgrade candidate\n" }));
      }
      const selectedRoot = Path.join(value.root, ".kepler-dist", "generations", installed.generation_id);
      const executable = Path.join(selectedRoot, "bin", "kepler");
      const executableBytes = Fs.readFileSync(executable);
      const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
      const receiptBefore = Fs.readFileSync(receiptPath);
      const settingsBefore = Fs.readFileSync(settingsPath);
      const selectorPath = Path.join(value.root, ".kepler-dist", "current");
      const selectorBefore = Fs.readlinkSync(selectorPath);
      Fs.chmodSync(executable, 0o444);

      expect(() => value.createService(mode === "upgrade" ? "3.0.1" : defaultSetupRelease).setup()).toThrow(
        expect.objectContaining({ code: "selected_generation_invalid" }),
      );
      expect(Fs.readFileSync(executable)).toEqual(executableBytes);
      expect(Fs.statSync(executable).mode & 0o777).toBe(0o444);
      expect(Fs.readFileSync(receiptPath)).toEqual(receiptBefore);
      expect(Fs.readFileSync(settingsPath)).toEqual(settingsBefore);
      expect(Fs.readlinkSync(selectorPath)).toBe(selectorBefore);
    },
  );

  it("revalidates consented package ownership and files under the native write lock", () => {
    const value = fixture();
    const prior = createExternalSkillPackage(value);
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const beforeSettings = Fs.readFileSync(settingsPath);
    let confirmation: SetupFailure | undefined;
    try {
      value.createService().setup();
    } catch (error) {
      if (error instanceof SetupFailure) confirmation = error;
      else throw error;
    }
    const plan = confirmation?.details.native_transfer_plan as { digest: string } | undefined;
    if (!plan) throw new Error("missing transfer digest");

    let failure: SetupFailure | undefined;
    try {
      value.createService(defaultSetupRelease, {
        registerPiPackage: (snapshot, packageSource, transfer, validateTransfer) => {
          Fs.writeFileSync(prior.skillPath, "---\nname: kepler-quality\ndescription: changed\n---\n\nchanged\n");
          if (!transfer || !validateTransfer) throw new Error("transfer validation was not provided");
          return registerPiPackage(snapshot, packageSource, { transfer, validateTransfer });
        },
      }).setup({ acceptNativeTransferDigest: plan.digest });
    } catch (error) {
      if (error instanceof SetupFailure) failure = error;
      else throw error;
    }

    expect(failure?.code).toBe("native_transfer_stale");
    expect(Fs.readFileSync(settingsPath)).toEqual(beforeSettings);
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"))).toBe("generations/bootstrap");
    const transactionDirectory = Path.join(value.root, ".kepler-dist", "transactions");
    const journals = Fs.readdirSync(transactionDirectory).filter((name) => name.endsWith(".json"));
    expect(journals).toHaveLength(1);
    expect(JSON.parse(Fs.readFileSync(Path.join(transactionDirectory, journals[0]!), "utf8"))).toMatchObject({
      state: "recovery_required",
      failure: expect.stringContaining("Native transfer consent became stale"),
    });
    expect(Fs.readFileSync(prior.skillPath, "utf8")).toContain("changed");
  });

  it("preserves an intervening Pi settings edit and keeps the bootstrap selector on final-boundary drift", () => {
    const value = fixture();
    createExternalSkillPackage(value);
    let confirmation: SetupFailure | undefined;
    try {
      value.createService().setup();
    } catch (error) {
      if (error instanceof SetupFailure) confirmation = error;
      else throw error;
    }
    const plan = confirmation?.details.native_transfer_plan as { digest: string } | undefined;
    if (!plan) throw new Error("missing transfer digest");

    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const current = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    const externalEdit = Buffer.from(`${JSON.stringify({ ...current, externalEdit: { preserve: true } }, null, 2)}\n`);
    let failure: SetupFailure | undefined;
    try {
      value.createService(defaultSetupRelease, {
        registerPiPackage: (snapshot, packageSource, transfer, validateTransfer) => {
          if (!transfer || !validateTransfer) throw new Error("transfer validation was not provided");
          return registerPiPackage(snapshot, packageSource, {
            transfer,
            validateTransfer: () => {
              validateTransfer();
              Fs.writeFileSync(settingsPath, externalEdit);
            },
          });
        },
      }).setup({ acceptNativeTransferDigest: plan.digest });
    } catch (error) {
      if (error instanceof SetupFailure) failure = error;
      else throw error;
    }

    expect(failure).toBeInstanceOf(SetupFailure);
    expect(failure?.message).toMatch(/settings changed after the registration plan/i);
    expect(Fs.readFileSync(settingsPath)).toEqual(externalEdit);
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    expect(Fs.readlinkSync(Path.join(distributionRoot, "current"))).toBe("generations/bootstrap");
    expect(Fs.existsSync(Path.join(value.root, ".local", "bin", "kepler"))).toBe(false);
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json"))).toBe(false);
    const journalPath = failure?.details.recovery_journal_path as string;
    const journal = JSON.parse(Fs.readFileSync(journalPath, "utf8")) as {
      state: string;
      failure: string;
      effects: Record<string, unknown>;
      observed_roots: { pi_settings: { contents_base64: string } };
    };
    expect(journal).toMatchObject({
      state: "recovery_required",
      failure: expect.stringMatching(/settings changed after the registration plan/i),
      effects: { selector: "bootstrap_selected", stable_launcher: "unchanged" },
    });
    expect(Buffer.from(journal.observed_roots.pi_settings.contents_base64, "base64")).toEqual(externalEdit);
  });

  it("validates selected manifest paths before reading any out-of-generation resource", () => {
    const value = fixture();
    const installed = value.createService().setup();
    const generationRoot = Path.join(value.root, ".kepler-dist", "generations", installed.generation_id);
    const manifestPath = Path.join(generationRoot, "bundle", "manifest.json");
    const manifest = JSON.parse(Fs.readFileSync(manifestPath, "utf8")) as {
      files: Record<string, string>;
    };
    const sentinelPath = Path.join(value.root, "outside-resource.txt");
    Fs.writeFileSync(sentinelPath, "preserve out-of-generation state\n");
    const traversal = Path.relative(Path.join(generationRoot, "bundle"), sentinelPath)
      .split(Path.sep)
      .join("/");
    manifest.files[traversal] = sha256Digest("outside resource");
    Fs.chmodSync(manifestPath, 0o644);
    Fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const base = createNodeGenerationTransactionFiles();
    let outsideInspections = 0;
    const generationFiles = {
      ...base,
      inspect: (path: string) => {
        if (Path.resolve(path) === Path.resolve(sentinelPath)) outsideInspections += 1;
        return base.inspect(path);
      },
    };

    expect(() => value.createService(defaultSetupRelease, { generationFiles }).setup()).toThrow(
      expect.objectContaining({ code: "selected_generation_invalid" }),
    );
    expect(outsideInspections).toBe(0);
    expect(Fs.readFileSync(sentinelPath, "utf8")).toBe("preserve out-of-generation state\n");
  });

  it.each([
    ["source", "selected_generation_invalid"],
    ["target", "selected_generation_invalid"],
    ["skill", "installation_record_invalid"],
    ["role", "installation_record_invalid"],
    ["generation", "setup_selector_conflict"],
  ] as const)("rejects a v2 receipt whose %s identity is not bound to the selected generation", (field, code) => {
    const value = fixture();
    value.createService().setup();
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");
    const parsed = parseInstallationReceipt(Fs.readFileSync(receiptPath, "utf8"));
    if (parsed.kind !== "current-v2") throw new Error("setup did not write receipt v2");
    let changed: InstallationRecordV2;
    if (field === "source") {
      changed = {
        ...parsed.record,
        release: {
          ...parsed.record.release,
          source: { ...parsed.record.release.source, content_digest: sha256Digest("wrong source") },
        },
      };
    } else if (field === "target") {
      changed = {
        ...parsed.record,
        release: {
          ...parsed.record.release,
          target: {
            ...parsed.record.release.target,
            arch: parsed.record.release.target.arch === "x64" ? "arm64" : "x64",
          },
        },
      };
    } else if (field === "skill") {
      changed = {
        ...parsed.record,
        pi_binding: {
          ...parsed.record.pi_binding,
          skills: parsed.record.pi_binding.skills.map((skill, index) =>
            index === 0 ? { ...skill, digest: sha256Digest("wrong skill") } : skill,
          ),
        },
      };
    } else if (field === "role") {
      changed = {
        ...parsed.record,
        pi_binding: {
          ...parsed.record.pi_binding,
          roles: parsed.record.pi_binding.roles.map((role, index) =>
            index === 0 ? { ...role, agent_id: "unknown-role" } : role,
          ),
        },
      };
    } else {
      const generationId = "550e8400-e29b-41d4-a716-446655440000";
      changed = {
        ...parsed.record,
        generation_id: generationId,
        selector: { ...parsed.record.selector, generation_id: generationId },
      };
    }
    const changedContents = `${JSON.stringify(changed, null, 2)}\n`;
    Fs.writeFileSync(receiptPath, changedContents);
    const beforeSettings = Fs.readFileSync(Path.join(value.agentDirectory, "settings.json"));
    const beforeSelector = Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"));

    expect(() => value.createService().setup()).toThrow(expect.objectContaining({ code }));
    expect(Fs.readFileSync(receiptPath, "utf8")).toBe(changedContents);
    expect(Fs.readFileSync(Path.join(value.agentDirectory, "settings.json"))).toEqual(beforeSettings);
    expect(Fs.readlinkSync(Path.join(value.root, ".kepler-dist", "current"))).toBe(beforeSelector);
  });

  it("requires digest-bound consent to transfer a single exact user package and preserves its files", () => {
    const value = fixture();
    const prior = createExternalSkillPackage(value);
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const beforeSettings = Fs.readFileSync(settingsPath);

    let failure: SetupFailure | undefined;
    try {
      value.createService().setup();
    } catch (error) {
      if (error instanceof SetupFailure) failure = error;
      else throw error;
    }
    expect(failure?.code).toBe("native_transfer_confirmation_required");
    const plan = failure?.details.native_transfer_plan as { digest: string; conflicts: readonly unknown[] } | undefined;
    expect(plan?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(plan?.conflicts).toHaveLength(1);
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json"))).toBe(false);
    expect(Fs.readFileSync(settingsPath)).toEqual(beforeSettings);

    const result = value.createService().setup({ acceptNativeTransferDigest: plan?.digest });

    expect(result.native_transfer).toMatchObject({
      digest: plan?.digest,
      source: prior.source,
      operation: "replace-package-entry",
    });
    expect(settings(value).packages).toEqual([supportedPiLoaderSource, Path.join(value.root, ".kepler-dist", "current")]);
    expect(Fs.readFileSync(prior.skillPath, "utf8")).toContain("custom content");
    expect(Fs.existsSync(prior.packageRoot)).toBe(true);
  });

  it("rejects stale digest consent and user/project shadows before installation effects", () => {
    const value = fixture();
    const prior = createExternalSkillPackage(value);
    let failure: SetupFailure | undefined;
    try {
      value.createService().setup();
    } catch (error) {
      if (error instanceof SetupFailure) failure = error;
      else throw error;
    }
    const plan = failure?.details.native_transfer_plan as { digest: string } | undefined;
    if (!plan) throw new Error("missing transfer digest");
    Fs.writeFileSync(prior.skillPath, "---\nname: kepler-quality\ndescription: changed\n---\n\nchanged\n");
    const settingsPath = Path.join(value.agentDirectory, "settings.json");
    const beforeSettings = Fs.readFileSync(settingsPath);

    expect(() => value.createService().setup({ acceptNativeTransferDigest: plan.digest })).toThrow(
      expect.objectContaining({ code: "native_transfer_stale" }),
    );
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.readFileSync(settingsPath)).toEqual(beforeSettings);

    Fs.rmSync(prior.packageRoot, { recursive: true, force: true });
    Fs.writeFileSync(settingsPath, `${JSON.stringify({ packages: [supportedPiLoaderSource], skills: [], subagents: {} }, null, 2)}\n`);
    const projectAgent = Path.join(value.projectDirectory, ".pi", "agents", "kepler-architect.md");
    Fs.mkdirSync(Path.dirname(projectAgent), { recursive: true });
    Fs.writeFileSync(projectAgent, "---\nname: kepler-architect\ndescription: project override\n---\n\ncustom\n");
    const projectSettingsBefore = Fs.readFileSync(settingsPath);

    expect(() => value.createService().setup()).toThrow(
      expect.objectContaining({ code: "pi_resource_conflict" }),
    );
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.readFileSync(settingsPath)).toEqual(projectSettingsBefore);
    expect(Fs.readFileSync(projectAgent, "utf8")).toContain("custom");
  });

  it("fails an unmet Pi prerequisite before creating the selected distribution or receipt", () => {
    const value = fixture();
    const service = value.createService(defaultSetupRelease, {
      detectPiVersion: () => {
        throw new Error("Pi unavailable");
      },
    });

    expect(() => service.setup()).toThrow(expect.objectContaining({ code: "pi_unavailable" }));
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler"))).toBe(false);
  });
});
