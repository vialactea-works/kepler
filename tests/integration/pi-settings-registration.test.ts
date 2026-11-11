import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";

const adapterModule = import.meta.resolve(
  "../../packages/cli/src/cli/pi-settings-adapter.ts",
);
const nativeTemporaryFailureProbe = Path.resolve(
  import.meta.dirname,
  "../fixtures/pi-settings-temp-failure-probe.ts",
);
const temporaryRoots: string[] = [];

function createSettings(value: unknown = {
  packages: ["npm:unrelated-package@1.0.0", { source: "./custom", skills: [] }],
  defaultProvider: "local",
  custom: { preserve: true },
}): { root: string; settingsPath: string; bytes: Uint8Array } {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-settings-adapter-"));
  temporaryRoots.push(root);
  const settingsPath = Path.join(root, "settings.json");
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  Fs.writeFileSync(settingsPath, bytes);
  return { root, settingsPath, bytes };
}

function replaceOwnedSettingsLock(settingsPath: string, root: string): {
  readonly lockPath: string;
  readonly displacedLockPath: string;
  readonly ownerToken: string;
  readonly replacementIdentity: Fs.Stats;
  readonly replacementSentinelPath: string;
} {
  const lockPath = `${settingsPath}.lock`;
  const displacedLockPath = Path.join(root, "displaced-owned-lock");
  const ownerToken = Fs.readFileSync(Path.join(lockPath, "kepler-owner"), "utf8");
  Fs.renameSync(lockPath, displacedLockPath);
  Fs.mkdirSync(lockPath);
  const replacementSentinelPath = Path.join(lockPath, "replacement-owner");
  Fs.writeFileSync(replacementSentinelPath, "preserve replacement lock\n");
  return {
    lockPath,
    displacedLockPath,
    ownerToken,
    replacementIdentity: Fs.lstatSync(lockPath),
    replacementSentinelPath,
  };
}

const nodeVersionPattern = /^v\d+\.\d+\.\d+$/;
const bunCompatibilityShimPathPattern = /(?:^|[\\/])bun-node-[^\\/]+(?:[\\/]|$)/i;

function nodeBinaryCandidates(binary: string, pathValue: string): string[] {
  if (Path.isAbsolute(binary) || binary.includes(Path.sep)) return [Path.resolve(binary)];
  return pathValue.split(Path.delimiter)
    .map((directory) => Path.resolve(directory || process.cwd(), binary));
}

async function validateProbeNodeBinary(binary: string): Promise<{
  readonly path?: string;
  readonly reason?: string;
}> {
  const candidate = Path.resolve(binary);
  if (bunCompatibilityShimPathPattern.test(candidate)) {
    return { reason: "candidate is under a Bun Node-compatibility shim directory" };
  }

  let canonicalPath: string;
  try {
    if (!Fs.statSync(candidate).isFile()) return { reason: "candidate is not a regular file" };
    Fs.accessSync(candidate, Fs.constants.X_OK);
    canonicalPath = Fs.realpathSync(candidate);
  } catch (error) {
    return { reason: `candidate is unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (bunCompatibilityShimPathPattern.test(canonicalPath)) {
    return { reason: "candidate resolves into a Bun Node-compatibility shim directory" };
  }

  try {
    const version = await execa(canonicalPath, ["--version"], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      extendEnv: false,
      timeout: 5_000,
    });
    const versionText = version.stdout.trim();
    if (!nodeVersionPattern.test(versionText)) {
      return { reason: `--version returned non-Node output ${JSON.stringify(versionText)}` };
    }
    const runtime = await execa(canonicalPath, ["-p", "process.versions.node"], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      extendEnv: false,
      timeout: 5_000,
    });
    if (runtime.stdout.trim() !== versionText.slice(1)) {
      return { reason: "runtime Node version did not match --version" };
    }
    return { path: canonicalPath };
  } catch (error) {
    return { reason: `candidate failed Node runtime validation: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function resolveProbeNodeBinary(): Promise<string> {
  const pathValue = process.env.PATH ?? "/usr/bin:/bin";
  const configured = process.env.KEPLER_PI_NODE_BINARY;
  if (configured !== undefined) {
    const candidate = nodeBinaryCandidates(configured, pathValue)
      .find((path) => Fs.existsSync(path));
    if (!candidate) {
      throw new Error(`KEPLER_PI_NODE_BINARY does not resolve to an executable: ${configured}`);
    }
    const validated = await validateProbeNodeBinary(candidate);
    if (!validated.path) {
      throw new Error(`KEPLER_PI_NODE_BINARY is not an actual Node.js interpreter: ${validated.reason}`);
    }
    return validated.path;
  }

  const rejected: string[] = [];
  for (const candidate of nodeBinaryCandidates("node", pathValue)) {
    const validated = await validateProbeNodeBinary(candidate);
    if (validated.path) return validated.path;
    rejected.push(`${candidate}: ${validated.reason}`);
  }
  throw new Error(`No actual Node.js interpreter found on PATH. ${rejected.join("; ")}`);
}

async function runNativeTemporaryFailureProbe(mode: string) {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-settings-temp-probe-"));
  temporaryRoots.push(root);
  const bundledProbe = Path.join(root, "settings-temp-failure-probe.mjs");
  await execa("bun", [
    "build",
    nativeTemporaryFailureProbe,
    "--target=node",
    "--format=esm",
    `--outfile=${bundledProbe}`,
  ], { timeout: 30_000 });
  const nodeBinary = await resolveProbeNodeBinary();
  const nodeVersion = await execa(nodeBinary, ["--version"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    extendEnv: false,
    timeout: 5_000,
  });
  if (!/^v\d+\.\d+\.\d+$/.test(nodeVersion.stdout.trim())) {
    throw new Error(`Expected an actual Node.js interpreter, found ${nodeVersion.stdout.trim()}`);
  }
  const result = await execa(nodeBinary, [bundledProbe], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TMPDIR: root,
      KEPLER_SETTINGS_TEMP_FAILURE_MODE: mode,
    },
    extendEnv: false,
    timeout: 60_000,
  });
  return JSON.parse(result.stdout) as {
    readonly mode: string;
    readonly error: {
      readonly code?: string;
      readonly message: string;
      readonly cause?: { readonly message?: string; readonly cause?: string };
      readonly details?: Record<string, unknown>;
    };
    readonly settingsUnchanged: boolean;
    readonly externalEditPreserved: boolean;
    readonly selectorUnchanged: boolean;
    readonly receiptUnchanged: boolean;
    readonly residualTemporaryFiles: readonly {
      readonly path: string;
      readonly content: string;
      readonly identity: { readonly dev: number; readonly ino: number };
    }[];
    readonly journal?: {
      readonly path: string;
      readonly state: string;
      readonly failure?: string;
      readonly effects?: Record<string, unknown>;
    };
  };
}

async function adapter() {
  return await import(adapterModule) as {
    PiSettingsAdapterError: new (
      code: string,
      message: string,
      effect: "none" | "applied" | "unknown",
      options?: ErrorOptions,
    ) => Error;
    readPiSettingsSnapshot(settingsPath: string): {
      readonly settingsPath: string;
      readonly contentDigest: string;
      readonly packages: readonly unknown[];
    };
    packageRegistrationEntryDigest(packageSource: string): string;
    registerPiPackage(snapshot: {
      readonly settingsPath: string;
      readonly contentDigest: string;
      readonly packages: readonly unknown[];
    }, packageSource: string, operations?: {
      readonly transfer?: {
        readonly source: string;
        readonly packageIndex: number;
        readonly expectedEntry: unknown;
        readonly operation: "replace" | "remove";
      };
      readonly validateTransfer?: () => void;
      readonly readSettingsFile?: (path: string) => {
        readonly bytes: Uint8Array;
        readonly value: Record<string, unknown> & { packages?: unknown[] };
        readonly mode: number;
        readonly identity: { readonly dev: number; readonly ino: number };
      };
      readonly replaceSettingsFile?: (
        path: string,
        contents: string,
        mode: number,
        assertPreimageUnchanged: () => void,
      ) => void;
    }): {
      readonly entryDigest: string;
      readonly settingsDigest: string;
    };
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("Pi settings package registration", () => {
  it("reports an unidentified temporary file through setup failure and journal evidence", async () => {
    const report = await runNativeTemporaryFailureProbe("identity-failure");
    const evidence = report.error.details?.temporary_file_evidence as Record<string, unknown> | undefined;

    expect(report.error).toMatchObject({
      code: "settings_write_failed",
      message: expect.stringContaining("injected owned temporary fstat failure"),
    });
    expect(report.error.details).toMatchObject({ effect: "none" });
    expect(evidence).toMatchObject({
      path: expect.any(String),
      ownership: "unknown",
      state: "unknown",
      pathState: "present",
      cleanupAttempted: false,
    });
    expect(report.error.message).toContain(String(evidence?.path));
    expect(report.residualTemporaryFiles.map(({ path }) => path)).toContain(evidence?.path);
    expect(report.settingsUnchanged).toBe(true);
    expect(report.selectorUnchanged).toBe(true);
    expect(report.receiptUnchanged).toBe(true);
    expect(report.journal).toMatchObject({ state: "recovery_required" });
    expect(report.journal?.failure).toContain(String(evidence?.path));
    expect(report.journal?.failure).toContain("temporary_file_evidence");
  });

  it("reports cleanup failure beside the primary settings write failure", async () => {
    const report = await runNativeTemporaryFailureProbe("cleanup-failure");
    const evidence = report.error.details?.temporary_file_evidence as Record<string, unknown> | undefined;

    expect(report.error).toMatchObject({
      code: "settings_write_failed",
      cause: {
        message: expect.stringContaining("injected settings temporary fsync failure"),
        cause: "injected settings temporary fsync failure",
      },
    });
    expect(report.error.details).toMatchObject({ effect: "none" });
    expect(evidence).toMatchObject({
      path: expect.any(String),
      ownership: "verified",
      state: "present",
      pathState: "present",
      cleanupAttempted: true,
      cleanupError: { message: "injected settings temporary unlink failure" },
    });
    expect(report.residualTemporaryFiles.map(({ path }) => path)).toContain(evidence?.path);
    expect(report.settingsUnchanged).toBe(true);
    expect(report.selectorUnchanged).toBe(true);
    expect(report.receiptUnchanged).toBe(true);
    expect(report.journal?.failure).toContain("injected settings temporary unlink failure");
  });

  it("reports successful owned temporary cleanup after a primary write failure", async () => {
    const report = await runNativeTemporaryFailureProbe("cleanup-success");
    const evidence = report.error.details?.temporary_file_evidence as Record<string, unknown> | undefined;

    expect(report.error.code).toBe("settings_write_failed");
    expect(report.error.details).toMatchObject({ effect: "none" });
    expect(evidence).toMatchObject({
      path: expect.any(String),
      ownership: "verified",
      state: "removed",
      pathState: "absent",
      cleanupAttempted: true,
    });
    expect(report.residualTemporaryFiles).toEqual([]);
    expect(report.settingsUnchanged).toBe(true);
    expect(report.selectorUnchanged).toBe(true);
    expect(report.receiptUnchanged).toBe(true);
    expect(report.journal?.failure).toContain(String(evidence?.path));
  });

  it("preserves and reports a replacement at the temporary path", async () => {
    const report = await runNativeTemporaryFailureProbe("replacement");
    const evidence = report.error.details?.temporary_file_evidence as Record<string, unknown> | undefined;
    const residual = report.residualTemporaryFiles.find(({ path }) => path === evidence?.path);

    expect(report.error.code).toBe("settings_write_failed");
    expect(evidence).toMatchObject({
      path: expect.any(String),
      ownership: "unknown",
      state: "replacement_preserved",
      pathState: "present",
      cleanupAttempted: true,
    });
    expect(residual?.content).toBe("preserve replacement temporary\n");
    expect(report.settingsUnchanged).toBe(true);
    expect(report.selectorUnchanged).toBe(true);
    expect(report.receiptUnchanged).toBe(true);
    expect(report.journal?.failure).toContain(String(evidence?.path));
  });

  it("keeps final settings drift primary when temporary cleanup fails", async () => {
    const report = await runNativeTemporaryFailureProbe("drift-cleanup-failure");
    const evidence = report.error.details?.temporary_file_evidence as Record<string, unknown> | undefined;

    expect(report.error).toMatchObject({
      code: "settings_drift",
      message: expect.stringContaining("changed after the registration plan"),
    });
    expect(report.error.details).toMatchObject({ effect: "none" });
    expect(evidence).toMatchObject({
      path: expect.any(String),
      ownership: "verified",
      state: "present",
      pathState: "present",
      cleanupError: { message: "injected settings temporary unlink failure" },
    });
    expect(report.externalEditPreserved).toBe(true);
    expect(report.residualTemporaryFiles.map(({ path }) => path)).toContain(evidence?.path);
    expect(report.selectorUnchanged).toBe(true);
    expect(report.receiptUnchanged).toBe(true);
    expect(report.journal?.failure).toContain(String(evidence?.path));
    expect(report.journal?.failure).toContain("changed after the registration plan");
  });

  it("registers one exact source while preserving unrelated fields and package entries", async () => {
    const { settingsPath, bytes } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(Path.dirname(settingsPath), "kepler-current");

    const result = module.registerPiPackage(snapshot, source);

    const updated = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(updated).toMatchObject({
      packages: ["npm:unrelated-package@1.0.0", { source: "./custom", skills: [] }, source],
      defaultProvider: "local",
      custom: { preserve: true },
    });
    expect(Fs.readFileSync(settingsPath)).not.toEqual(bytes);
    expect(result.entryDigest).toBe(module.packageRegistrationEntryDigest(source));
    expect(result.settingsDigest).toBe(sha256Digest(Fs.readFileSync(settingsPath)));
  });

  it("rejects settings drift after the plan without writing", async () => {
    const { settingsPath } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    Fs.writeFileSync(settingsPath, '{"packages":[],"externalEdit":true}\n');
    const before = Fs.readFileSync(settingsPath);

    expect(() => module.registerPiPackage(snapshot, "/kepler/current")).toThrow(/changed after preflight/i);

    expect(Fs.readFileSync(settingsPath)).toEqual(before);
  });

  it("preserves an external edit made after the locked read and removes its prepared temporary file", async () => {
    const { root, settingsPath } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(root, "kepler-current");
    const externalEdit = Buffer.from('{"packages":["npm:user-package@2.0.0"],"userEdit":true}\n');

    expect(() => module.registerPiPackage(snapshot, source, {
      transfer: {
        source: "npm:unrelated-package@1.0.0",
        packageIndex: 0,
        expectedEntry: snapshot.packages[0],
        operation: "replace",
      },
      validateTransfer: () => Fs.writeFileSync(settingsPath, externalEdit),
    })).toThrow(expect.objectContaining({ code: "settings_drift", effect: "none" }));

    expect(Fs.readFileSync(settingsPath)).toEqual(externalEdit);
    expect(Fs.readdirSync(root)).toEqual(["settings.json"]);
  });

  it("rechecks the preimage after replacement preparation before committing the rename", async () => {
    const { root, settingsPath } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(root, "kepler-current");
    const externalEdit = Buffer.from('{"packages":["npm:user-package@2.0.0"],"userEdit":true}\n');
    let preimageChecked = false;

    expect(() => module.registerPiPackage(snapshot, source, {
      replaceSettingsFile: (path, contents, mode, assertPreimageUnchanged) => {
        const temporaryPath = `${path}.test-replacement.tmp`;
        Fs.writeFileSync(temporaryPath, contents, { mode });
        Fs.writeFileSync(path, externalEdit);
        try {
          preimageChecked = true;
          assertPreimageUnchanged();
        } finally {
          Fs.unlinkSync(temporaryPath);
        }
      },
    })).toThrow(expect.objectContaining({ code: "settings_drift", effect: "none" }));

    expect(preimageChecked).toBe(true);
    expect(Fs.readFileSync(settingsPath)).toEqual(externalEdit);
    expect(Fs.readdirSync(root)).toEqual(["settings.json"]);
  });

  it("fails closed when packages is malformed and leaves settings byte-identical", async () => {
    const { settingsPath } = createSettings({ packages: { source: "./custom" } });
    const module = await adapter();
    const before = Fs.readFileSync(settingsPath);

    expect(() => module.readPiSettingsSnapshot(settingsPath)).toThrow(/packages must be an array/i);

    expect(Fs.readFileSync(settingsPath)).toEqual(before);
  });

  it("requires an existing regular settings file", async () => {
    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-settings-missing-"));
    temporaryRoots.push(root);
    const module = await adapter();

    expect(() => module.readPiSettingsSnapshot(Path.join(root, "settings.json"))).toThrow(/existing regular file/i);
    expect(Fs.readdirSync(root)).toEqual([]);
  });

  it("preserves a no-effect replacement failure and its original error", async () => {
    const { settingsPath, bytes } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(Path.dirname(settingsPath), "kepler-current");
    const originalError = new Error("rename denied");
    let thrown: unknown;
    try {
      module.registerPiPackage(snapshot, source, {
        replaceSettingsFile: () => {
          throw new module.PiSettingsAdapterError(
            "settings_write_failed",
            originalError.message,
            "none",
            { cause: originalError },
          );
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "settings_write_failed", effect: "none" });
    expect((thrown as Error).cause).toBe(originalError);
    expect(new Uint8Array(Fs.readFileSync(settingsPath))).toEqual(bytes);
    expect(Fs.readdirSync(Path.dirname(settingsPath))).toEqual(["settings.json"]);
  });

  it("reports an applied settings write if post-write verification fails", async () => {
    const { settingsPath, bytes } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(Path.dirname(settingsPath), "kepler-current");
    const originalError = new Error("read-back unavailable");
    let settingsReads = 0;
    let thrown: unknown;
    try {
      module.registerPiPackage(snapshot, source, {
        readSettingsFile: (path) => {
          if (Path.resolve(path) === settingsPath && ++settingsReads === 2) {
            throw originalError;
          }
          const currentBytes = new Uint8Array(Fs.readFileSync(path));
          return {
            bytes: currentBytes,
            value: JSON.parse(new TextDecoder().decode(currentBytes)) as Record<string, unknown> & { packages?: unknown[] },
            mode: Fs.statSync(path).mode & 0o777,
            identity: { dev: Fs.lstatSync(path).dev, ino: Fs.lstatSync(path).ino },
          };
        },
        replaceSettingsFile: (path, contents) => Fs.writeFileSync(path, contents),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "settings_write_failed", effect: "applied" });
    expect((thrown as Error).cause).toBe(originalError);
    const updated = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(updated.packages).toEqual([
      "npm:unrelated-package@1.0.0",
      { source: "./custom", skills: [] },
      source,
    ]);
    expect(Fs.readFileSync(settingsPath)).not.toEqual(bytes);
  });

  it("preserves the registration failure and reports a replaced owned lock", async () => {
    const { root, settingsPath, bytes } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(root, "kepler-current");
    const primaryError = new Error("registration write failed");
    let replacement: ReturnType<typeof replaceOwnedSettingsLock> | undefined;
    let thrown: unknown;

    try {
      module.registerPiPackage(snapshot, source, {
        replaceSettingsFile: () => {
          replacement = replaceOwnedSettingsLock(settingsPath, root);
          throw new module.PiSettingsAdapterError(
            "settings_write_failed",
            primaryError.message,
            "none",
            { cause: primaryError },
          );
        },
      });
    } catch (error) {
      thrown = error;
    }

    const failure = thrown as Error & {
      readonly code: string;
      readonly effect: string;
      readonly lockReleaseError?: NodeJS.ErrnoException;
      readonly lockEvidence?: {
        readonly path: string;
        readonly stateAfterRelease: string;
        readonly identityAfterRelease?: { readonly dev: number; readonly ino: number };
      };
    };
    const operationFailure = failure.cause as Error & { readonly cause?: unknown };
    expect(failure).toMatchObject({ code: "settings_write_failed", effect: "none" });
    expect(operationFailure.cause).toBe(primaryError);
    expect(failure.message).toContain(primaryError.message);
    expect(failure.lockReleaseError).toMatchObject({ code: "ECOMPROMISED" });
    expect(failure.lockEvidence).toMatchObject({
      path: `${settingsPath}.lock`,
      stateAfterRelease: "present",
      identityAfterRelease: {
        dev: replacement?.replacementIdentity.dev,
        ino: replacement?.replacementIdentity.ino,
      },
    });
    expect(replacement).toBeDefined();
    expect(Fs.readFileSync(Path.join(replacement?.displacedLockPath ?? "", "kepler-owner"), "utf8"))
      .toBe(replacement?.ownerToken);
    expect(Fs.readFileSync(replacement?.replacementSentinelPath ?? "", "utf8"))
      .toBe("preserve replacement lock\n");
    expect(Fs.lstatSync(`${settingsPath}.lock`).ino).toBe(replacement?.replacementIdentity.ino);
    expect(new Uint8Array(Fs.readFileSync(settingsPath))).toEqual(bytes);
  });

  it("reports a successful registration when lock release fails", async () => {
    const { root, settingsPath } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const source = Path.join(root, "kepler-current");
    let replacement: ReturnType<typeof replaceOwnedSettingsLock> | undefined;
    let thrown: unknown;

    try {
      module.registerPiPackage(snapshot, source, {
        readSettingsFile: (path) => {
          const currentBytes = new Uint8Array(Fs.readFileSync(path));
          const state = {
            bytes: currentBytes,
            value: JSON.parse(new TextDecoder().decode(currentBytes)) as Record<string, unknown> & { packages?: unknown[] },
            mode: Fs.statSync(path).mode & 0o777,
            identity: { dev: Fs.lstatSync(path).dev, ino: Fs.lstatSync(path).ino },
          };
          if (!replacement) replacement = replaceOwnedSettingsLock(settingsPath, root);
          return state;
        },
      });
    } catch (error) {
      thrown = error;
    }

    const failure = thrown as Error & {
      readonly code: string;
      readonly effect: string;
      readonly cause?: NodeJS.ErrnoException;
      readonly lockReleaseError?: NodeJS.ErrnoException;
      readonly lockEvidence?: {
        readonly path: string;
        readonly stateAfterRelease: string;
        readonly identityAfterRelease?: { readonly dev: number; readonly ino: number };
      };
    };
    expect(failure).toMatchObject({ code: "settings_write_failed", effect: "applied" });
    expect(failure.lockReleaseError).toBe(failure.cause);
    expect(failure.lockReleaseError).toMatchObject({ code: "ECOMPROMISED" });
    expect(failure.lockEvidence).toMatchObject({
      path: `${settingsPath}.lock`,
      stateAfterRelease: "present",
      identityAfterRelease: {
        dev: replacement?.replacementIdentity.dev,
        ino: replacement?.replacementIdentity.ino,
      },
    });
    expect(replacement).toBeDefined();
    const updated = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(updated.packages).toEqual([
      "npm:unrelated-package@1.0.0",
      { source: "./custom", skills: [] },
      source,
    ]);
    expect(updated.custom).toEqual({ preserve: true });
    expect(Fs.readFileSync(replacement?.replacementSentinelPath ?? "", "utf8"))
      .toBe("preserve replacement lock\n");
    expect(Fs.lstatSync(`${settingsPath}.lock`).ino).toBe(replacement?.replacementIdentity.ino);
  });

  it("does not write when a no-takeover native holder already exists", async () => {
    const { settingsPath, bytes } = createSettings();
    const module = await adapter();
    const snapshot = module.readPiSettingsSnapshot(settingsPath);
    const lockPath = `${settingsPath}.lock`;
    Fs.mkdirSync(lockPath);
    const old = new Date(Date.now() - 120_000);
    Fs.utimesSync(lockPath, old, old);
    const identity = Fs.lstatSync(lockPath);

    expect(() => module.registerPiPackage(snapshot, "/kepler/current")).toThrow();

    const after = Fs.lstatSync(lockPath);
    expect(after.ino).toBe(identity.ino);
    expect(after.mtimeMs).toBe(identity.mtimeMs);
    expect(new Uint8Array(Fs.readFileSync(settingsPath))).toEqual(bytes);
  });
});
