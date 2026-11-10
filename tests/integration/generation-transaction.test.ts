import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  beginGenerationTransaction,
  createNodeGenerationTransactionFiles,
  GenerationTransactionError,
  resolveGenerationLayout,
  type GenerationCandidate,
  type GenerationTransactionFiles,
} from "../../packages/cli/src/cli/generation-transaction.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import { createTargetPackage } from "../../packages/cli/src/cli/release-archive.js";
import { encodeBuildIdentityMarker } from "../../packages/cli/src/cli/build-identity.js";
import { validateResourcePackage } from "../../packages/cli/src/cli/release-resources.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const release = "3.0.0";
const candidateGenerationId = "550e8400-e29b-41d4-a716-446655440011";
const priorGenerationId = "550e8400-e29b-41d4-a716-446655440010";
const encoder = new TextEncoder();

type TestRoots = {
  readonly root: string;
  readonly roots: {
    readonly distributionRoot: string;
    readonly globalHome: string;
    readonly piAgentDirectory: string;
    readonly stableLauncherPath: string;
  };
};

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    makeWritable(root);
    Fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("generation filesystem transaction", () => {
  it("stages a validated candidate, establishes a valid empty bootstrap, then commits one selector", () => {
    const { roots } = makeRoots();
    const files = createNodeGenerationTransactionFiles();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
      files,
    });

    try {
      const staged = transaction.stage();
      const layout = resolveGenerationLayout(roots);
      const bootstrapRoot = Path.join(layout.generationsDirectory, "bootstrap");
      const bootstrapPackage = JSON.parse(
        Fs.readFileSync(Path.join(bootstrapRoot, "package.json"), "utf8"),
      ) as { pi: { skills: string[]; subagents: { agents: string[] } } };
      expect(staged.bootstrapSelected).toBe(true);
      expect(Fs.readlinkSync(layout.selector)).toBe("generations/bootstrap");
      expect(Fs.realpathSync(layout.selector)).toBe(bootstrapRoot);
      expect(Fs.statSync(Path.join(bootstrapRoot, "bundle", "skills")).isDirectory()).toBe(true);
      expect(Fs.statSync(Path.join(bootstrapRoot, "bundle", "agents", "pi", "v1")).isDirectory()).toBe(true);
      expect(bootstrapPackage.pi).toEqual({ skills: [], subagents: { agents: [] } });
      expect(Fs.existsSync(layout.stableLauncherPath)).toBe(false);
      expect(Buffer.from(Fs.readFileSync(Path.join(staged.candidatePath, "bin", "kepler")))).toEqual(
        Buffer.from(createCandidate().executable),
      );
      expect(Fs.readFileSync(Path.join(staged.candidatePath, "bundle", "manifest.json"), "utf8"))
        .toContain('"resource_digest"');
      expect(Fs.statSync(staged.candidatePath).mode & 0o222).toBe(0);

      const activation = transaction.activate();
      expect(activation.selectedGenerationId).toBe(candidateGenerationId);
      expect(Fs.readlinkSync(layout.selector)).toBe(`generations/${candidateGenerationId}`);
      expect(Fs.readlinkSync(layout.stableLauncherPath)).toBe(
        Path.join(layout.selector, "bin", "kepler"),
      );
      expect(Fs.existsSync(Path.join(layout.generationsDirectory, "bootstrap"))).toBe(true);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "selector_committed",
        effects: {
          candidate: "staged",
          bootstrap: "selected",
          selector: "selected",
          stable_launcher: "created",
        },
      });
      expect(Fs.existsSync(layout.installationRecord)).toBe(false);
    } finally {
      transaction.release();
    }
  });

  it("upgrades by switching the same selector and preserving the old generation, Pi settings, and launcher", () => {
    const test = makeRoots();
    const layout = resolveGenerationLayout(test.roots);
    Fs.mkdirSync(layout.generationsDirectory, { recursive: true });
    const previousPath = Path.join(layout.generationsDirectory, priorGenerationId);
    Fs.mkdirSync(previousPath, { recursive: true });
    Fs.writeFileSync(Path.join(previousPath, "preserved"), "prior bytes\n");
    Fs.mkdirSync(test.roots.globalHome, { recursive: true });
    Fs.writeFileSync(layout.installationRecord, "opaque previous receipt\n");
    Fs.mkdirSync(test.roots.piAgentDirectory, { recursive: true });
    const settingsBytes = encoder.encode('{"packages":["unrelated"]}\n');
    Fs.writeFileSync(layout.piSettings, settingsBytes);
    Fs.symlinkSync(`generations/${priorGenerationId}`, layout.selector);
    Fs.mkdirSync(Path.dirname(layout.stableLauncherPath), { recursive: true });
    Fs.symlinkSync(Path.join(layout.selector, "bin", "kepler"), layout.stableLauncherPath);

    const transaction = beginGenerationTransaction({
      roots: test.roots,
      candidate: createCandidate(),
      mode: { kind: "upgrade", previousGenerationId: priorGenerationId },
    });
    try {
      const staged = transaction.stage();
      expect(staged.bootstrapSelected).toBe(false);
      expect(Fs.readlinkSync(layout.selector)).toBe(`generations/${priorGenerationId}`);
      transaction.activate();

      expect(Fs.readlinkSync(layout.selector)).toBe(`generations/${candidateGenerationId}`);
      expect(Fs.readlinkSync(layout.stableLauncherPath)).toBe(
        Path.join(layout.selector, "bin", "kepler"),
      );
      expect(Fs.readFileSync(Path.join(previousPath, "preserved"), "utf8")).toBe("prior bytes\n");
      expect(Buffer.from(Fs.readFileSync(layout.piSettings))).toEqual(Buffer.from(settingsBytes));
      expect(Fs.readFileSync(layout.installationRecord, "utf8")).toBe("opaque previous receipt\n");
      expect(readJournal(transaction.recoveryJournalPath).preimages.pi_settings).toMatchObject({
        kind: "file",
        digest: sha256Digest(settingsBytes),
        contents_base64: Buffer.from(settingsBytes).toString("base64"),
      });
    } finally {
      transaction.release();
    }
  });

  it("does not take over a competing owner claim, regardless of its age", () => {
    const { roots } = makeRoots();
    const first = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      const ownerBefore = Fs.readFileSync(first.claim.path, "utf8");
      Fs.utimesSync(first.claim.path, new Date(0), new Date(0));
      expect(() => beginGenerationTransaction({
        roots,
        candidate: createCandidate(),
        mode: { kind: "first-install" },
      })).toThrow(GenerationTransactionError);
      expect(Fs.readFileSync(first.claim.path, "utf8")).toBe(ownerBefore);
      expect(first.claim.token).toBe(JSON.parse(ownerBefore).token);
    } finally {
      first.release();
    }
  });

  it("holds the previous selector and records observed Pi-settings drift", () => {
    const { roots } = makeRoots();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      transaction.stage();
      const layout = resolveGenerationLayout(roots);
      const drift = encoder.encode('{"packages":["manual edit"]}\n');
      Fs.writeFileSync(layout.piSettings, drift);

      expect(() => transaction.activate()).toThrow(
        expect.objectContaining({ code: "observed_drift" }),
      );
      expect(Fs.readlinkSync(layout.selector)).toBe("generations/bootstrap");
      expect(Buffer.from(Fs.readFileSync(layout.piSettings))).toEqual(Buffer.from(drift));
      expect(Fs.existsSync(layout.stableLauncherPath)).toBe(false);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        effects: { selector: "bootstrap_selected" },
        observed_roots: {
          pi_settings: { kind: "file", digest: sha256Digest(drift) },
        },
      });
      transaction.release();
      expect(() => beginGenerationTransaction({
        roots,
        candidate: createCandidate(),
        mode: { kind: "first-install" },
      })).toThrow(expect.objectContaining({ code: "recovery_required" }));
    } finally {
      transaction.release();
    }
  });

  it("cleans only its partial candidate and permits retry after an owned cleanup", () => {
    const { roots } = makeRoots();
    const candidatePath = Path.join(roots.distributionRoot, "generations", candidateGenerationId);
    const base = createNodeGenerationTransactionFiles();
    const files: GenerationTransactionFiles = {
      ...base,
      writeFile(path, contents, mode, exclusive) {
        if (path === Path.join(candidatePath, "bin", "kepler")) {
          throw new Error("injected candidate staging interruption");
        }
        base.writeFile(path, contents, mode, exclusive);
      },
    };
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
      files,
    });
    try {
      expect(() => transaction.stage()).toThrow();
      expect(Fs.existsSync(candidatePath)).toBe(false);
      expect(Fs.existsSync(resolveGenerationLayout(roots).selector)).toBe(false);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "aborted",
        effects: { candidate: "not_staged", selector: "unchanged" },
      });
    } finally {
      transaction.release();
    }
    const retry = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    retry.release();
  });

  it("preserves an unknown file instead of cleaning or adopting it with a partial candidate", () => {
    const { roots } = makeRoots();
    const candidatePath = Path.join(roots.distributionRoot, "generations", candidateGenerationId);
    const unknownPath = Path.join(candidatePath, "operator-file");
    const base = createNodeGenerationTransactionFiles();
    const files: GenerationTransactionFiles = {
      ...base,
      writeFile(path, contents, mode, exclusive) {
        if (path === Path.join(candidatePath, "bin", "kepler")) {
          base.writeFile(unknownPath, encoder.encode("preserve me\\n"), 0o600, true);
          throw new Error("interrupted after an unknown path appeared");
        }
        base.writeFile(path, contents, mode, exclusive);
      },
    };
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
      files,
    });
    try {
      expect(() => transaction.stage()).toThrow();
      expect(Fs.readFileSync(unknownPath, "utf8")).toBe("preserve me\\n");
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        effects: { candidate: "partial", selector: "unchanged" },
      });
      transaction.release();
      expect(() => beginGenerationTransaction({
        roots,
        candidate: createCandidate(),
        mode: { kind: "first-install" },
      })).toThrow(expect.objectContaining({ code: "recovery_required" }));
    } finally {
      transaction.release();
    }
  });

  it("retains interruption evidence without advancing the prior selector", () => {
    const { roots } = makeRoots();
    const layout = resolveGenerationLayout(roots);
    const base = createNodeGenerationTransactionFiles();
    const files = withRenameFailure(base, (_from, to) => to === layout.selector);
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
      files,
    });
    try {
      transaction.stage();
      expect(() => transaction.activate()).toThrow(
        expect.objectContaining({ code: "interrupted" }),
      );
      expect(Fs.readlinkSync(layout.selector)).toBe("generations/bootstrap");
      expect(Fs.existsSync(layout.stableLauncherPath)).toBe(false);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        effects: {
          bootstrap: "selected",
          selector: "bootstrap_selected",
          stable_launcher: "unchanged",
        },
      });
      expect(Fs.readdirSync(layout.generationsDirectory)).toContain(candidateGenerationId);
    } finally {
      transaction.release();
    }
  });

  it("leaves the journal unresolved when the caller has not written its exact receipt", () => {
    const { roots } = makeRoots();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      transaction.stage();
      transaction.activate();
      const receiptBytes = encoder.encode('{"format_version":2,"fixture":"not written"}\\n');
      transaction.expectInstallationRecord(receiptBytes);

      expect(() => transaction.finalizeJournal(receiptBytes)).toThrow(
        expect.objectContaining({ code: "observed_drift" }),
      );
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        effects: { selector: "selected", installation_record: "unchanged" },
        preimages: { installation_record: { kind: "missing" } },
        expected_receipt: {
          kind: "file",
          digest: sha256Digest(receiptBytes),
        },
        observed_roots: { installation_record: { kind: "missing" } },
      });
    } finally {
      transaction.release();
    }
  });

  it("reports a post-selector interruption without claiming launcher or setup completion", () => {
    const { roots } = makeRoots();
    const layout = resolveGenerationLayout(roots);
    const base = createNodeGenerationTransactionFiles();
    const files: GenerationTransactionFiles = {
      ...base,
      symlink(target, path) {
        if (path === layout.stableLauncherPath) {
          throw new Error("injected launcher interruption");
        }
        base.symlink(target, path);
      },
    };
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
      files,
    });
    try {
      transaction.stage();
      expect(() => transaction.activate()).toThrow(
        expect.objectContaining({ code: "interrupted" }),
      );
      expect(Fs.readlinkSync(layout.selector)).toBe(`generations/${candidateGenerationId}`);
      expect(Fs.existsSync(layout.stableLauncherPath)).toBe(false);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        effects: { selector: "selected", stable_launcher: "unchanged" },
        observed_roots: {
          selector: { kind: "symlink", target: `generations/${candidateGenerationId}` },
          stable_launcher: { kind: "missing" },
        },
      });
      expect(Fs.existsSync(layout.installationRecord)).toBe(false);
    } finally {
      transaction.release();
    }
  });

  it("writes the exact receipt only after activation and commits it after read-back", () => {
    const { roots } = makeRoots();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      transaction.stage();
      transaction.activate();
      const receipt = encoder.encode('{"format_version":2,"fixture":"verified"}\\n');
      transaction.expectInstallationRecord(receipt);
      transaction.writeInstallationRecord(receipt);
      expect(Buffer.from(Fs.readFileSync(transaction.layout.installationRecord))).toEqual(Buffer.from(receipt));
      expect(transaction.finalizeJournal(receipt).receiptDigest).toBe(sha256Digest(receipt));
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "committed",
        effects: { installation_record: "verified_update" },
        expected_receipt: { kind: "file", digest: sha256Digest(receipt) },
      });
    } finally {
      transaction.release();
    }
  });

  it("records observed cross-root effects and blocks an unverified Pi write", () => {
    const { roots } = makeRoots();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      transaction.stage();
      const settings = encoder.encode('{"packages":["/kepler/current"]}\\n');
      transaction.expectPiSettings(settings);
      Fs.writeFileSync(transaction.layout.piSettings, settings);
      const failure = transaction.recordFailure(new Error("Pi registration verification failed"));
      expect(failure.details.effects).toMatchObject({ selector: "bootstrap_selected", pi_settings: "expected_update" });
      expect(failure.details.recoveryJournalPath).toBe(transaction.recoveryJournalPath);
      expect(readJournal(transaction.recoveryJournalPath)).toMatchObject({
        state: "recovery_required",
        expected_pi_settings: { kind: "file", digest: sha256Digest(settings) },
        observed_roots: {
          selector: { kind: "symlink", target: "generations/bootstrap" },
          pi_settings: { kind: "file", digest: sha256Digest(settings) },
        },
      });
      transaction.release();
      expect(() => beginGenerationTransaction({
        roots,
        candidate: createCandidate(),
        mode: { kind: "first-install" },
      })).toThrow(expect.objectContaining({ code: "recovery_required" }));
    } finally {
      transaction.release();
    }
  });

  it("repairs only a missing registration on the exact selected generation", () => {
    const { roots } = makeRoots();
    const first = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      first.stage();
      first.activate();
      const receipt = encoder.encode('{"format_version":2,"fixture":"current"}\\n');
      first.expectInstallationRecord(receipt);
      first.writeInstallationRecord(receipt);
      first.finalizeJournal(receipt);
    } finally {
      first.release();
    }

    const repair = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "repair", generationId: candidateGenerationId },
    });
    try {
      const before = Fs.readlinkSync(repair.layout.selector);
      repair.stage();
      const settings = encoder.encode('{"packages":["/kepler/current"]}\\n');
      repair.expectPiSettings(settings);
      Fs.writeFileSync(repair.layout.piSettings, settings);
      repair.activate();
      const repairedReceipt = encoder.encode('{"format_version":2,"fixture":"repaired"}\\n');
      repair.expectInstallationRecord(repairedReceipt);
      repair.writeInstallationRecord(repairedReceipt);
      repair.finalizeJournal(repairedReceipt);
      expect(Fs.readlinkSync(repair.layout.selector)).toBe(before);
      expect(readJournal(repair.recoveryJournalPath)).toMatchObject({
        state: "committed",
        effects: { selector: "unchanged", stable_launcher: "unchanged", pi_settings: "expected_update" },
      });
    } finally {
      repair.release();
    }
  });

  it("replaces only the known legacy launcher and refuses an unknown launcher", () => {
    const test = makeRoots();
    const distributionRoot = test.roots.distributionRoot;
    const legacyBinary = Path.join(distributionRoot, "bin", "kepler");
    const layout = resolveGenerationLayout(test.roots);
    Fs.mkdirSync(Path.dirname(legacyBinary), { recursive: true });
    Fs.writeFileSync(legacyBinary, "preserved legacy bytes\n");
    Fs.mkdirSync(Path.dirname(test.roots.stableLauncherPath), { recursive: true });
    Fs.symlinkSync(legacyBinary, test.roots.stableLauncherPath);

    const transaction = beginGenerationTransaction({
      roots: test.roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    try {
      transaction.stage();
      transaction.activate();
      expect(Fs.readlinkSync(test.roots.stableLauncherPath)).toBe(
        Path.join(layout.selector, "bin", "kepler"),
      );
      expect(Fs.readFileSync(legacyBinary, "utf8")).toBe("preserved legacy bytes\n");
    } finally {
      transaction.release();
    }

    const unknown = makeRoots();
    Fs.mkdirSync(Path.dirname(unknown.roots.stableLauncherPath), { recursive: true });
    Fs.writeFileSync(unknown.roots.stableLauncherPath, "user-owned launcher\n");
    expect(() => beginGenerationTransaction({
      roots: unknown.roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    })).toThrow(expect.objectContaining({ code: "launcher_conflict" }));
    expect(Fs.readFileSync(unknown.roots.stableLauncherPath, "utf8")).toBe("user-owned launcher\n");
  });

  it("preserves same-token replacement files during explicit release and process-exit cleanup", () => {
    const { roots } = makeRoots();
    const transaction = beginGenerationTransaction({
      roots,
      candidate: createCandidate(),
      mode: { kind: "first-install" },
    });
    const claimPath = transaction.claim.path;
    const displacedPath = Path.join(Path.dirname(claimPath), "displaced-owner");
    const acquiredBytes = Fs.readFileSync(claimPath);
    const acquiredIdentity = transaction.claim.identity;
    Fs.renameSync(claimPath, displacedPath);
    Fs.writeFileSync(claimPath, acquiredBytes, { flag: "wx", mode: 0o600 });
    const replacementStat = Fs.lstatSync(claimPath);

    expect(replacementStat.dev === acquiredIdentity.dev && replacementStat.ino === acquiredIdentity.ino).toBe(false);
    expect(transaction.release()).toEqual({ state: "replaced" });
    expect(Fs.readFileSync(claimPath)).toEqual(acquiredBytes);
    expect(Fs.readFileSync(displacedPath)).toEqual(acquiredBytes);

    const exitFixture = makeRoots();
    const layout = resolveGenerationLayout(exitFixture.roots);
    const exitScript = [
      `import * as Fs from "node:fs";`,
      `import * as Path from "node:path";`,
      `import { acquireGenerationOwnerClaim } from ${JSON.stringify(new URL("../../packages/cli/src/cli/generation-transaction.ts", import.meta.url).href)};`,
      `const claim = acquireGenerationOwnerClaim({ distributionRoot: ${JSON.stringify(exitFixture.roots.distributionRoot)} });`,
      `const original = Fs.readFileSync(claim.path);`,
      `const acquired = Fs.lstatSync(claim.path);`,
      `const displaced = Path.join(Path.dirname(claim.path), "displaced-owner");`,
      `Fs.renameSync(claim.path, displaced);`,
      `Fs.writeFileSync(claim.path, original, { flag: "wx", mode: 0o600 });`,
      `const replacement = Fs.lstatSync(claim.path);`,
      `console.log(JSON.stringify({ claimPath: claim.path, differentIdentity: acquired.dev !== replacement.dev || acquired.ino !== replacement.ino }));`,
      `process.exit(0);`,
    ].join("\n");
    const child = spawnSync("bun", ["-e", exitScript], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(0);
    const exitResult = JSON.parse(child.stdout.trim()) as { claimPath: string; differentIdentity: boolean };
    expect(exitResult.claimPath).toBe(layout.ownerClaim);
    expect(exitResult.differentIdentity).toBe(true);
    expect(Fs.readFileSync(layout.ownerClaim)).toEqual(Fs.readFileSync(Path.join(exitFixture.roots.distributionRoot, "displaced-owner")));

    const cleanExitFixture = makeRoots();
    const cleanExitScript = [
      `import { acquireGenerationOwnerClaim } from ${JSON.stringify(new URL("../../packages/cli/src/cli/generation-transaction.ts", import.meta.url).href)};`,
      `const claim = acquireGenerationOwnerClaim({ distributionRoot: ${JSON.stringify(cleanExitFixture.roots.distributionRoot)} });`,
      `console.log(claim.path);`,
      `process.exit(0);`,
    ].join("\n");
    const cleanExit = spawnSync("bun", ["-e", cleanExitScript], { encoding: "utf8" });
    expect(cleanExit.status, cleanExit.stderr).toBe(0);
    expect(Fs.existsSync(cleanExit.stdout.trim())).toBe(false);
  });
});

function makeRoots(): TestRoots {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-generation-transaction-"));
  temporaryRoots.push(root);
  const roots = {
    distributionRoot: Path.join(root, ".kepler-dist"),
    globalHome: Path.join(root, ".config", "vialactea-works", "kepler"),
    piAgentDirectory: Path.join(root, ".pi", "agent"),
    stableLauncherPath: Path.join(root, ".local", "bin", "kepler"),
  };
  Fs.mkdirSync(roots.piAgentDirectory, { recursive: true });
  Fs.writeFileSync(Path.join(roots.piAgentDirectory, "settings.json"), '{"packages":[]}\n');
  return { root, roots };
}

function createCandidate(): GenerationCandidate {
  const resources = validateResourcePackage(createSetupBundleFixture(), release);
  const buildIdentity = {
    format_version: 1 as const,
    kepler_release: release,
    source: {
      kind: "development" as const,
      commit: "0123456789abcdef0123456789abcdef01234567",
      content_digest: sha256Digest("dirty source identity"),
    },
    target: { os: "linux" as const, arch: "x64" as const },
    resource_digest: resources.manifest.resource_digest,
  };
  const executable = encoder.encode(`${encodeBuildIdentityMarker(buildIdentity)}\n`);
  const targetPackage = createTargetPackage({
    executable,
    resources,
    expectedVersion: release,
    expectedTarget: buildIdentity.target,
    expectedSource: buildIdentity.source,
  });
  const releaseManifest = targetPackage.files.find((file) => file.path === "release-manifest.json")?.contents;
  if (!releaseManifest) throw new Error("Generation fixture target package has no release manifest");
  return {
    generationId: candidateGenerationId,
    buildIdentity,
    resources,
    executable,
    releaseManifest,
  };
}

function withRenameFailure(
  files: GenerationTransactionFiles,
  shouldFail: (from: string, to: string) => boolean,
): GenerationTransactionFiles {
  let failed = false;
  return {
    ...files,
    rename(from, to) {
      if (!failed && shouldFail(from, to)) {
        failed = true;
        throw new Error("injected interruption before selector replacement");
      }
      files.rename(from, to);
    },
  };
}

function readJournal(path: string): Record<string, any> {
  return JSON.parse(Fs.readFileSync(path, "utf8")) as Record<string, any>;
}

function makeWritable(root: string): void {
  if (!Fs.existsSync(root)) return;
  const state = Fs.lstatSync(root);
  if (state.isSymbolicLink()) return;
  if (state.isDirectory()) {
    for (const entry of Fs.readdirSync(root)) makeWritable(Path.join(root, entry));
    Fs.chmodSync(root, 0o755);
    return;
  }
  Fs.chmodSync(root, 0o644);
}
