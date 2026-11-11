import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  parseMetadataJsonObject,
  sha256Digest,
  type ContentDigest,
} from "./installation-record.js";
import { acquirePiSettingsLock } from "./pi-settings-lock.js";

export interface PiSettingsSnapshot {
  readonly settingsPath: string;
  readonly contentDigest: ContentDigest;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly packages: readonly unknown[];
}

export interface PiPackageTransfer {
  readonly source: string;
  readonly packageIndex: number;
  readonly expectedEntry: unknown;
  readonly operation: "replace" | "remove";
}

export interface PiPackageRegistrationPlan {
  readonly contents: Uint8Array;
  readonly entryDigest: ContentDigest;
  readonly settingsDigest: ContentDigest;
}

export interface PiSettingsFileState {
  readonly bytes: Uint8Array;
  readonly value: Record<string, unknown> & { packages?: unknown[] };
  readonly mode: number;
  readonly identity: { readonly dev: number; readonly ino: number };
}

export interface PiSettingsAdapterOperations {
  readonly readSettingsFile?: (path: string) => PiSettingsFileState;
  readonly replaceSettingsFile?: (
    path: string,
    contents: string,
    mode: number,
    assertPreimageUnchanged: () => void,
  ) => void;
  readonly transfer?: PiPackageTransfer;
  readonly validateTransfer?: () => void;
}

export interface PiSettingsLockEvidence {
  readonly path: string;
  readonly stateAfterRelease: "present" | "absent" | "unknown";
  readonly identityAfterRelease?: { readonly dev: number; readonly ino: number };
}

export interface PiSettingsTemporaryFileEvidence {
  readonly path: string;
  readonly ownership: "verified" | "unknown";
  readonly state: "removed" | "absent" | "present" | "replacement_preserved" | "unknown";
  readonly pathState: "present" | "absent" | "unknown";
  readonly cleanupAttempted: boolean;
  readonly identity?: { readonly dev: number; readonly ino: number };
  readonly observedIdentity?: { readonly dev: number; readonly ino: number };
  readonly cleanupError?: { readonly name: string; readonly message: string; readonly code?: string };
  readonly inspectionError?: { readonly name: string; readonly message: string; readonly code?: string };
}

export interface PiSettingsAdapterErrorOptions extends ErrorOptions {
  readonly lockReleaseError?: unknown;
  readonly lockEvidence?: PiSettingsLockEvidence;
  readonly temporaryFileEvidence?: PiSettingsTemporaryFileEvidence;
}

export interface PiRegistrationResult {
  readonly entryDigest: ContentDigest;
  readonly settingsDigest: ContentDigest;
}

export class PiSettingsAdapterError extends Error {
  constructor(
    readonly code:
      | "settings_conflict"
      | "settings_drift"
      | "settings_invalid"
      | "settings_write_failed"
      | "package_already_registered",
    message: string,
    readonly effect: "none" | "applied" | "unknown" = "none",
    options?: PiSettingsAdapterErrorOptions,
  ) {
    super(message, options);
    this.lockReleaseError = options?.lockReleaseError;
    this.lockEvidence = options?.lockEvidence;
    this.temporaryFileEvidence = options?.temporaryFileEvidence;
    this.name = "PiSettingsAdapterError";
  }

  readonly lockReleaseError?: unknown;
  readonly lockEvidence?: PiSettingsLockEvidence;
  readonly temporaryFileEvidence?: PiSettingsTemporaryFileEvidence;
}

export function readPiSettingsSnapshot(settingsPath: string): PiSettingsSnapshot {
  const path = Path.resolve(settingsPath);
  const settings = readSettingsFile(path);
  return {
    settingsPath: path,
    contentDigest: sha256Digest(settings.bytes),
    settings: structuredClone(settings.value),
    packages: structuredClone(settings.value.packages ?? []),
  };
}

export function packageRegistrationEntryDigest(packageSource: string): ContentDigest {
  return sha256Digest(JSON.stringify(packageSource));
}

export function planPiPackageRegistration(
  snapshot: PiSettingsSnapshot,
  packageSource: string,
  transfer?: PiPackageTransfer,
): PiPackageRegistrationPlan {
  if (!Path.isAbsolute(packageSource)) {
    throw new PiSettingsAdapterError("settings_conflict", "Pi package source must be an absolute path.");
  }
  const packages = snapshot.settings.packages;
  if (packages !== undefined && !Array.isArray(packages)) {
    throw new PiSettingsAdapterError("settings_invalid", "Pi settings packages must be an array.");
  }
  const currentPackages = (packages ?? []) as unknown[];
  if (!isDeepStrictEqual(currentPackages, snapshot.packages)) {
    throw new PiSettingsAdapterError("settings_conflict", "Pi settings snapshot packages do not match its settings object.");
  }
  const sources = currentPackages.map(packageEntrySource);
  const packageSourceCount = sources.filter((source) => source === packageSource).length;
  let nextPackages: unknown[];
  if (transfer) {
    if (
      !Number.isSafeInteger(transfer.packageIndex) ||
      transfer.packageIndex < 0 ||
      transfer.packageIndex >= currentPackages.length ||
      transfer.source === packageSource ||
      sources.filter((source) => source === transfer.source).length !== 1 ||
      sources[transfer.packageIndex] !== transfer.source ||
      !isDeepStrictEqual(currentPackages[transfer.packageIndex], transfer.expectedEntry) ||
      typeof transfer.expectedEntry !== "string" ||
      (transfer.operation === "replace" && packageSourceCount !== 0) ||
      (transfer.operation === "remove" && packageSourceCount !== 1)
    ) {
      throw new PiSettingsAdapterError("settings_drift", "The exact consented Pi package entry is no longer present.");
    }
    nextPackages = [...currentPackages];
    if (transfer.operation === "replace") nextPackages[transfer.packageIndex] = packageSource;
    else nextPackages.splice(transfer.packageIndex, 1);
    if (nextPackages.filter((entry) => packageEntrySource(entry) === packageSource).length !== 1) {
      throw new PiSettingsAdapterError("settings_drift", "The transfer plan does not leave exactly one stable Kepler package registration.");
    }
  } else {
    if (packageSourceCount > 0) {
      throw new PiSettingsAdapterError(
        "package_already_registered",
        "The exact Kepler package source is already registered; setup must verify it as a no-op instead of rewriting settings.",
      );
    }
    nextPackages = [...currentPackages, packageSource];
  }
  const updated = { ...snapshot.settings, packages: nextPackages };
  const contents = new TextEncoder().encode(`${JSON.stringify(updated, null, 2)}\n`);
  return {
    contents,
    entryDigest: packageRegistrationEntryDigest(packageSource),
    settingsDigest: sha256Digest(contents),
  };
}

export function registerPiPackage(
  snapshot: PiSettingsSnapshot,
  packageSource: string,
  operations: PiSettingsAdapterOperations = {},
): PiRegistrationResult {
  const settingsPath = Path.resolve(snapshot.settingsPath);
  if (!Path.isAbsolute(packageSource)) {
    throw new PiSettingsAdapterError(
      "settings_conflict",
      "Pi package source must be an absolute path.",
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(snapshot.contentDigest)) {
    throw new PiSettingsAdapterError(
      "settings_conflict",
      "Pi settings snapshot has an invalid content digest.",
    );
  }

  const readSettings = operations.readSettingsFile ?? readSettingsFile;
  const replaceSettings = operations.replaceSettingsFile ?? replaceSettingsFile;
  const lock = acquirePiSettingsLock(settingsPath);
  let effect: "none" | "applied" | "unknown" = "none";
  let result: PiRegistrationResult | undefined;
  let operationError: unknown;
  let failed = false;
  try {
    const current = readSettings(settingsPath);
    if (sha256Digest(current.bytes) !== snapshot.contentDigest) {
      throw new PiSettingsAdapterError(
        "settings_drift",
        "Pi settings changed after preflight; recompute the setup plan before retrying.",
      );
    }
    const currentSnapshot: PiSettingsSnapshot = {
      settingsPath,
      contentDigest: sha256Digest(current.bytes),
      settings: current.value,
      packages: structuredClone(current.value.packages ?? []),
    };
    if (operations.transfer) {
      if (!operations.validateTransfer) {
        throw new PiSettingsAdapterError(
          "settings_conflict",
          "Native package transfer requires current ownership and resource validation under the Pi settings lock.",
        );
      }
      operations.validateTransfer();
    }
    const plan = planPiPackageRegistration(currentSnapshot, packageSource, operations.transfer);
    const updated = JSON.parse(new TextDecoder().decode(plan.contents)) as Record<string, unknown>;
    try {
      replaceSettings(
        settingsPath,
        new TextDecoder().decode(plan.contents),
        current.mode,
        () => assertSettingsPreimageUnchanged(settingsPath, current, readSettings),
      );
    } catch (error) {
      if (error instanceof PiSettingsAdapterError) throw error;
      throw new PiSettingsAdapterError(
        "settings_write_failed",
        `Could not update Pi settings: ${errorMessage(error)}`,
        "unknown",
        { cause: error },
      );
    }
    effect = "applied";

    let readBack: PiSettingsFileState;
    try {
      readBack = readSettings(settingsPath);
    } catch (error) {
      throw new PiSettingsAdapterError(
        "settings_write_failed",
        `Pi settings were written but could not be verified: ${errorMessage(error)}`,
        "applied",
        { cause: error },
      );
    }
    if (!isDeepStrictEqual(readBack.value, updated)) {
      throw new PiSettingsAdapterError(
        "settings_write_failed",
        "Pi settings read-back did not match the requested Kepler package registration.",
        "unknown",
      );
    }
    const readBackPackages = readBack.value.packages ?? [];
    if (
      readBackPackages.filter((entry) => packageEntrySource(entry) === packageSource)
        .length !== 1 ||
      !isDeepStrictEqual(readBack.value, updated)
    ) {
      throw new PiSettingsAdapterError(
        "settings_write_failed",
        "Pi settings read-back does not contain exactly one Kepler package registration.",
        "unknown",
      );
    }
    result = {
      entryDigest: plan.entryDigest,
      settingsDigest: sha256Digest(readBack.bytes),
    };
  } catch (error) {
    operationError = error;
    failed = true;
  }

  try {
    lock.release();
  } catch (error) {
    const lockEvidence = inspectLockEvidence(`${settingsPath}.lock`);
    if (!failed) {
      operationError = new PiSettingsAdapterError(
        "settings_write_failed",
        `Pi settings lock could not be released: ${errorMessage(error)}`,
        effect,
        {
          cause: error,
          lockReleaseError: error,
          lockEvidence,
        },
      );
      failed = true;
    } else {
      const primaryError = operationError;
      const primaryCode = primaryError instanceof PiSettingsAdapterError
        ? primaryError.code
        : "settings_write_failed";
      const primaryEffect = primaryError instanceof PiSettingsAdapterError
        ? primaryError.effect
        : effect;
        operationError = new PiSettingsAdapterError(
          primaryCode,
          `${errorMessage(primaryError)}; Pi settings lock release also failed: ${errorMessage(error)}`,
          primaryEffect,
          {
            cause: primaryError,
            lockReleaseError: error,
            lockEvidence,
            ...(primaryError instanceof PiSettingsAdapterError && primaryError.temporaryFileEvidence
              ? { temporaryFileEvidence: primaryError.temporaryFileEvidence }
              : {}),
          },
        );
    }
  }
  if (failed) throw operationError;
  if (!result) {
    throw new PiSettingsAdapterError(
      "settings_write_failed",
      "Pi settings registration ended without a verified result.",
      effect,
    );
  }
  return result;
}

function assertSettingsPreimageUnchanged(
  path: string,
  expected: PiSettingsFileState,
  readSettings: (path: string) => PiSettingsFileState,
): void {
  let current: PiSettingsFileState;
  try {
    current = readSettings(path);
  } catch (error) {
    throw new PiSettingsAdapterError(
      "settings_drift",
      `Pi settings path changed after the registration plan; recompute setup before retrying: ${errorMessage(error)}`,
      "none",
      { cause: error },
    );
  }
  if (
    !isDeepStrictEqual(current.bytes, expected.bytes) ||
    current.mode !== expected.mode ||
    current.identity.dev !== expected.identity.dev ||
    current.identity.ino !== expected.identity.ino
  ) {
    throw new PiSettingsAdapterError(
      "settings_drift",
      "Pi settings changed after the registration plan; recompute setup before retrying.",
    );
  }
}

function readSettingsFile(path: string): PiSettingsFileState {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(path);
  } catch (error) {
    if (isMissingPath(error)) {
      throw new PiSettingsAdapterError(
        "settings_conflict",
        `Pi requires an existing regular file for native settings: ${path}`,
      );
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new PiSettingsAdapterError(
      "settings_conflict",
      `Pi settings path must be an existing regular file: ${path}`,
    );
  }

  const bytes = Fs.readFileSync(path);
  let value: Record<string, unknown>;
  try {
    value = parseMetadataJsonObject(new TextDecoder().decode(bytes), "Pi settings");
  } catch (error) {
    throw new PiSettingsAdapterError(
      "settings_invalid",
      errorMessage(error),
      "none",
      { cause: error },
    );
  }
  const packages = value.packages;
  if (packages !== undefined && !Array.isArray(packages)) {
    throw new PiSettingsAdapterError(
      "settings_invalid",
      "Pi settings packages must be an array.",
    );
  }
  return {
    bytes: new Uint8Array(bytes),
    value: value as Record<string, unknown> & { packages?: unknown[] },
    mode: stat.mode & 0o777,
    identity: { dev: stat.dev, ino: stat.ino },
  };
}

function packageEntrySource(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    "source" in entry &&
    typeof entry.source === "string"
  ) {
    return entry.source;
  }
  return undefined;
}

function replaceSettingsFile(
  path: string,
  contents: string,
  mode: number,
  assertPreimageUnchanged: () => void,
): void {
  const temporaryPath = `${path}.kepler-${randomUUID()}.tmp`;
  let temporaryCreated = false;
  let temporaryIdentity: Fs.Stats | undefined;
  let temporaryFileEvidence: PiSettingsTemporaryFileEvidence | undefined;
  let descriptor: number | undefined;
  let renameStarted = false;
  let renamed = false;
  let failure: unknown;
  try {
    descriptor = Fs.openSync(temporaryPath, "wx", mode);
    temporaryCreated = true;
    temporaryIdentity = Fs.fstatSync(descriptor);
    Fs.writeFileSync(descriptor, contents, "utf8");
    Fs.fchmodSync(descriptor, mode);
    Fs.fsyncSync(descriptor);
    Fs.closeSync(descriptor);
    descriptor = undefined;
    assertPreimageUnchanged();
    renameStarted = true;
    Fs.renameSync(temporaryPath, path);
    renamed = true;
  } catch (error) {
    failure = error;
  }
  if (descriptor !== undefined) {
    try {
      Fs.closeSync(descriptor);
    } catch (error) {
      failure ??= error;
    }
  }
  if (temporaryCreated) {
    if (temporaryIdentity) {
      try {
        temporaryFileEvidence = removeOwnedTemporary(temporaryPath, temporaryIdentity);
      } catch (error) {
        temporaryFileEvidence = inspectTemporaryAfterCleanupFailure(temporaryPath, temporaryIdentity, error);
        failure ??= error;
      }
    } else {
      temporaryFileEvidence = inspectUnidentifiedTemporary(temporaryPath);
    }
  }
  if (
    failure === undefined &&
    temporaryFileEvidence &&
    temporaryFileEvidence.state !== "removed" &&
    temporaryFileEvidence.state !== "absent"
  ) {
    failure = new Error("Pi settings were updated but temporary file cleanup could not be verified safely.");
  }
  if (failure !== undefined) {
    const adapterFailure = failure instanceof PiSettingsAdapterError ? failure : undefined;
    const code = adapterFailure?.code ?? "settings_write_failed";
    const effect = adapterFailure?.effect ?? renameEffect(renamed, renameStarted);
    const primaryMessage = adapterFailure
      ? adapterFailure.message
      : `Could not update Pi settings: ${errorMessage(failure)}`;
    const message = temporaryFileEvidence
      ? `${primaryMessage} temporary_file_evidence=${JSON.stringify(temporaryFileEvidence)}`
      : primaryMessage;
    throw new PiSettingsAdapterError(code, message, effect, {
      cause: adapterFailure?.cause ?? failure,
      ...(adapterFailure?.lockReleaseError !== undefined
        ? { lockReleaseError: adapterFailure.lockReleaseError }
        : {}),
      ...(adapterFailure?.lockEvidence ? { lockEvidence: adapterFailure.lockEvidence } : {}),
      ...(temporaryFileEvidence ? { temporaryFileEvidence } : {}),
    });
  }
}

function renameEffect(renamed: boolean, renameStarted: boolean): "none" | "applied" | "unknown" {
  if (renamed) return "applied";
  if (renameStarted) return "unknown";
  return "none";
}

function inspectLockEvidence(path: string): PiSettingsLockEvidence {
  try {
    const identity = Fs.lstatSync(path);
    return {
      path,
      stateAfterRelease: "present",
      identityAfterRelease: { dev: identity.dev, ino: identity.ino },
    };
  } catch (error) {
    return {
      path,
      stateAfterRelease: isMissingPath(error) ? "absent" : "unknown",
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function removeOwnedTemporary(path: string, identity: Fs.Stats): PiSettingsTemporaryFileEvidence {
  const ownedIdentity = { dev: identity.dev, ino: identity.ino };
  let current: Fs.Stats;
  try {
    current = Fs.lstatSync(path);
  } catch (error) {
    if (isMissingPath(error)) {
      return {
        path,
        ownership: "verified",
        state: "absent",
        pathState: "absent",
        cleanupAttempted: true,
        identity: ownedIdentity,
      };
    }
    throw error;
  }
  const observedIdentity = { dev: current.dev, ino: current.ino };
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino
  ) {
    return {
      path,
      ownership: "unknown",
      state: "replacement_preserved",
      pathState: "present",
      cleanupAttempted: true,
      identity: ownedIdentity,
      observedIdentity,
    };
  }
  Fs.unlinkSync(path);
  return {
    path,
    ownership: "verified",
    state: "removed",
    pathState: "absent",
    cleanupAttempted: true,
    identity: ownedIdentity,
  };
}

function inspectUnidentifiedTemporary(path: string): PiSettingsTemporaryFileEvidence {
  try {
    const current = Fs.lstatSync(path);
    return {
      path,
      ownership: "unknown",
      state: "unknown",
      pathState: "present",
      cleanupAttempted: false,
      observedIdentity: { dev: current.dev, ino: current.ino },
    };
  } catch (error) {
    return {
      path,
      ownership: "unknown",
      state: isMissingPath(error) ? "absent" : "unknown",
      pathState: isMissingPath(error) ? "absent" : "unknown",
      cleanupAttempted: false,
      ...(!isMissingPath(error) ? { inspectionError: fileErrorEvidence(error) } : {}),
    };
  }
}

function inspectTemporaryAfterCleanupFailure(
  path: string,
  identity: Fs.Stats,
  cleanupError: unknown,
): PiSettingsTemporaryFileEvidence {
  const ownedIdentity = { dev: identity.dev, ino: identity.ino };
  try {
    const current = Fs.lstatSync(path);
    const observedIdentity = { dev: current.dev, ino: current.ino };
    const isOwned = current.isFile() && !current.isSymbolicLink() &&
      current.dev === identity.dev && current.ino === identity.ino;
    return {
      path,
      ownership: isOwned ? "verified" : "unknown",
      state: isOwned ? "present" : "replacement_preserved",
      pathState: "present",
      cleanupAttempted: true,
      identity: ownedIdentity,
      observedIdentity,
      cleanupError: fileErrorEvidence(cleanupError),
    };
  } catch (inspectionError) {
    return {
      path,
      ownership: isMissingPath(inspectionError) ? "verified" : "unknown",
      state: isMissingPath(inspectionError) ? "absent" : "unknown",
      pathState: isMissingPath(inspectionError) ? "absent" : "unknown",
      cleanupAttempted: true,
      identity: ownedIdentity,
      cleanupError: fileErrorEvidence(cleanupError),
      ...(!isMissingPath(inspectionError) ? { inspectionError: fileErrorEvidence(inspectionError) } : {}),
    };
  }
}

function fileErrorEvidence(error: unknown): {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
} {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: errorMessage(error),
    ...(typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? { code: error.code }
      : {}),
  };
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
