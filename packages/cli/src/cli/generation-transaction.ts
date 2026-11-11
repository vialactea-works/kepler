import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import type { RuntimeBuildIdentity } from "./build-identity.js";
import {
  sha256Digest,
  type ContentDigest,
} from "./installation-record.js";
import {
  parseResourceManifest,
  type ValidatedResourcePackage,
} from "./release-resources.js";
import { validateTargetPackageFiles } from "./release-archive.js";

export type GenerationPathKind = "missing" | "file" | "symlink" | "directory" | "special";

export interface GenerationFileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export type GenerationFileState =
  | { readonly kind: "missing" }
  | {
      readonly kind: "file";
      readonly contents: Uint8Array;
      readonly mode: number;
      readonly identity: GenerationFileIdentity;
    }
  | { readonly kind: "symlink"; readonly target: string }
  | { readonly kind: "directory" }
  | { readonly kind: "special" };

export interface GenerationDirectoryEntry {
  readonly name: string;
  readonly kind: Exclude<GenerationPathKind, "missing">;
}

export interface GenerationTransactionFiles {
  inspect(path: string): GenerationFileState;
  list(path: string): readonly GenerationDirectoryEntry[];
  mkdir(path: string, mode: number): void;
  createExclusiveFile(path: string, contents: Uint8Array, mode: number): GenerationFileIdentity;
  writeFile(path: string, contents: Uint8Array, mode: number, exclusive: boolean): void;
  rename(from: string, to: string): void;
  symlink(target: string, path: string): void;
  readlink(path: string): string;
  unlink(path: string): void;
  rmdir(path: string): void;
  chmod(path: string, mode: number): void;
  sync(path: string): void;
  onProcessExit(listener: () => void): () => void;
}

export interface GenerationTransactionRoots {
  readonly distributionRoot: string;
  readonly globalHome: string;
  readonly piAgentDirectory: string;
  readonly stableLauncherPath: string;
}

export interface GenerationLayout {
  readonly distributionRoot: string;
  readonly generationsDirectory: string;
  readonly selector: string;
  readonly transactionsDirectory: string;
  readonly ownerClaim: string;
  readonly globalHome: string;
  readonly installationRecord: string;
  readonly piAgentDirectory: string;
  readonly piSettings: string;
  readonly stableLauncherPath: string;
  readonly legacyLauncherPath: string;
}

export interface GenerationCandidate {
  readonly generationId: string;
  readonly buildIdentity: RuntimeBuildIdentity;
  readonly resources: ValidatedResourcePackage;
  readonly executable: Uint8Array;
  readonly releaseManifest: Uint8Array;
}

export type GenerationInstallMode =
  | { readonly kind: "first-install" }
  | { readonly kind: "upgrade"; readonly previousGenerationId: string }
  | { readonly kind: "repair"; readonly generationId: string };

export type GenerationPathPreimage =
  | { readonly path: string; readonly kind: "missing" }
  | {
      readonly path: string;
      readonly kind: "file";
      readonly contents_base64: string;
      readonly digest: ContentDigest;
    }
  | { readonly path: string; readonly kind: "symlink"; readonly target: string }
  | { readonly path: string; readonly kind: "directory" }
  | { readonly path: string; readonly kind: "special" };

export interface GenerationPreimages {
  readonly selector: GenerationPathPreimage;
  readonly installation_record: GenerationPathPreimage;
  readonly pi_settings: GenerationPathPreimage;
  readonly stable_launcher: GenerationPathPreimage;
}

export type GenerationTransactionErrorCode =
  | "invalid_roots"
  | "invalid_candidate"
  | "owner_busy"
  | "owner_replaced"
  | "recovery_required"
  | "selector_conflict"
  | "launcher_conflict"
  | "path_conflict"
  | "candidate_conflict"
  | "observed_drift"
  | "invalid_state"
  | "interrupted";

export interface GenerationEffects {
  readonly candidate: "not_staged" | "partial" | "staged" | "verified";
  readonly bootstrap: "not_created" | "partial" | "created" | "selected";
  readonly selector: "unchanged" | "bootstrap_selected" | "selected";
  readonly stable_launcher: "unchanged" | "created" | "replaced";
  readonly pi_settings: "unchanged" | "expected_update";
  readonly installation_record: "unchanged" | "expected_update" | "verified_update";
}

export class GenerationTransactionError extends Error {
  constructor(
    readonly code: GenerationTransactionErrorCode,
    message: string,
    readonly details: {
      readonly path?: string;
      readonly recoveryJournalPath?: string;
      readonly effects?: GenerationEffects;
      readonly observed?: GenerationPathPreimage;
      readonly observedRoots?: GenerationPreimages;
      readonly cleanupWarning?: string;
    } = {},
  ) {
    super(message);
    this.name = "GenerationTransactionError";
  }
}

export interface GenerationOwnerClaim {
  readonly token: string;
  readonly path: string;
  readonly identity: GenerationFileIdentity;
  release(): { readonly state: "released" | "missing" | "replaced" };
}

export interface GenerationStageResult {
  readonly generationId: string;
  readonly candidatePath: string;
  readonly selectorTarget: string;
  readonly bootstrapSelected: boolean;
  readonly recoveryJournalPath: string;
}

export interface GenerationSelectorCommitResult {
  readonly selectedGenerationId: string;
  readonly selector: string;
  readonly launcher: "unchanged" | "created" | "replaced";
  readonly recoveryJournalPath: string;
}

export interface GenerationJournalCompletion {
  readonly transactionId: string;
  readonly receiptDigest: ContentDigest;
  readonly recoveryJournalPath: string;
}

export interface GenerationTransaction {
  readonly layout: GenerationLayout;
  readonly claim: GenerationOwnerClaim;
  readonly transactionId: string;
  readonly recoveryJournalPath: string;
  readonly preimages: GenerationPreimages;
  stage(): GenerationStageResult;
  expectPiSettings(contents: Uint8Array): void;
  expectInstallationRecord(contents: Uint8Array): void;
  writeInstallationRecord(contents: Uint8Array): void;
  activate(): GenerationSelectorCommitResult;
  finalizeJournal(receiptContents: Uint8Array): GenerationJournalCompletion;
  recordFailure(error: unknown): GenerationTransactionError;
  release(): { readonly state: "released" | "missing" | "replaced" };
}

interface CandidateFile {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly digest: ContentDigest;
  readonly mode: number;
}

interface GenerationJournal {
  readonly owner: "kepler-generation-transaction";
  readonly transaction_format_version: 1;
  readonly transaction_id: string;
  readonly owner_token: string;
  readonly state:
    | "preparing"
    | "staged"
    | "bootstrap_selected"
    | "activation_pending"
    | "selector_committed"
    | "launcher_pending"
    | "receipt_pending"
    | "receipt_written"
    | "recovery_required"
    | "committed"
    | "aborted";
  readonly mode: GenerationInstallMode;
  readonly roots: GenerationLayout;
  readonly candidate: {
    readonly generation_id: string;
    readonly release: string;
    readonly source: RuntimeBuildIdentity["source"];
    readonly target: RuntimeBuildIdentity["target"];
    readonly resource_digest: ContentDigest;
    readonly files: Readonly<Record<string, ContentDigest>>;
  };
  readonly preimages: GenerationPreimages;
  readonly expected_pi_settings?: GenerationPathPreimage;
  readonly expected_receipt?: GenerationPathPreimage;
  readonly observed_roots?: GenerationPreimages;
  readonly effects: GenerationEffects;
  readonly failure?: string;
}

const generationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const bootstrapMetadata = `${JSON.stringify({
  name: "kepler-resources",
  private: true,
  type: "module",
  pi: { skills: [], subagents: { agents: [] } },
}, null, 2)}\n`;
const bootstrapDirectories = [
  "bundle",
  "bundle/skills",
  "bundle/agents",
  "bundle/agents/pi",
  "bundle/agents/pi/v1",
] as const;

export function createNodeGenerationTransactionFiles(): GenerationTransactionFiles {
  return {
    inspect(path) {
      try {
        const state = Fs.lstatSync(path);
        if (state.isSymbolicLink()) return { kind: "symlink", target: Fs.readlinkSync(path) };
        if (state.isDirectory()) return { kind: "directory" };
        if (state.isFile()) {
          const descriptor = Fs.openSync(path, Fs.constants.O_RDONLY | (Fs.constants.O_NOFOLLOW ?? 0));
          try {
            const opened = Fs.fstatSync(descriptor);
            if (!opened.isFile() || opened.dev !== state.dev || opened.ino !== state.ino) {
              throw new Error(`File changed while inspecting: ${path}`);
            }
            return {
              kind: "file",
              contents: Fs.readFileSync(descriptor),
              mode: opened.mode & 0o777,
              identity: { dev: opened.dev, ino: opened.ino },
            };
          } finally {
            Fs.closeSync(descriptor);
          }
        }
        return { kind: "special" };
      } catch (error) {
        if (isMissingPathError(error)) return { kind: "missing" };
        throw error;
      }
    },
    list(path) {
      return Fs.readdirSync(path, { withFileTypes: true })
        .map((entry) => ({
          name: entry.name,
          kind: classifyDirectoryEntry(entry),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    mkdir(path, mode) {
      Fs.mkdirSync(path, { mode });
    },
    createExclusiveFile(path, contents, mode) {
      const descriptor = Fs.openSync(
        path,
        Fs.constants.O_WRONLY | Fs.constants.O_CREAT | Fs.constants.O_EXCL | (Fs.constants.O_NOFOLLOW ?? 0),
        mode,
      );
      try {
        const created = Fs.fstatSync(descriptor);
        if (!created.isFile()) throw new Error(`Owner claim is not a regular file: ${path}`);
        Fs.writeFileSync(descriptor, contents);
        Fs.fsyncSync(descriptor);
        return { dev: created.dev, ino: created.ino };
      } finally {
        Fs.closeSync(descriptor);
      }
    },
    writeFile(path, contents, mode, exclusive) {
      Fs.writeFileSync(path, contents, { mode, flag: exclusive ? "wx" : "w" });
    },
    rename(from, to) {
      Fs.renameSync(from, to);
    },
    symlink(target, path) {
      Fs.symlinkSync(target, path);
    },
    readlink(path) {
      return Fs.readlinkSync(path);
    },
    unlink(path) {
      Fs.unlinkSync(path);
    },
    rmdir(path) {
      Fs.rmdirSync(path);
    },
    chmod(path, mode) {
      Fs.chmodSync(path, mode);
    },
    sync(path) {
      const descriptor = Fs.openSync(path, "r");
      try {
        Fs.fsyncSync(descriptor);
      } finally {
        Fs.closeSync(descriptor);
      }
    },
    onProcessExit(listener) {
      process.once("exit", listener);
      return () => process.removeListener("exit", listener);
    },
  };
}

export function resolveGenerationLayout(roots: GenerationTransactionRoots): GenerationLayout {
  const values = Object.entries(roots) as Array<[keyof GenerationTransactionRoots, string]>;
  for (const [name, value] of values) {
    if (typeof value !== "string" || !Path.isAbsolute(value)) {
      throw new GenerationTransactionError(
        "invalid_roots",
        `Generation root ${name} must be an explicit absolute path`,
      );
    }
  }
  const distributionRoot = Path.resolve(roots.distributionRoot);
  const globalHome = Path.resolve(roots.globalHome);
  const piAgentDirectory = Path.resolve(roots.piAgentDirectory);
  const stableLauncherPath = Path.resolve(roots.stableLauncherPath);
  return {
    distributionRoot,
    generationsDirectory: Path.join(distributionRoot, "generations"),
    selector: Path.join(distributionRoot, "current"),
    transactionsDirectory: Path.join(distributionRoot, "transactions"),
    ownerClaim: Path.join(distributionRoot, ".kepler-installation-owner"),
    globalHome,
    installationRecord: Path.join(globalHome, "installation.json"),
    piAgentDirectory,
    piSettings: Path.join(piAgentDirectory, "settings.json"),
    stableLauncherPath,
    legacyLauncherPath: Path.join(distributionRoot, "bin", "kepler"),
  };
}

export function acquireGenerationOwnerClaim(input: {
  readonly distributionRoot: string;
  readonly files?: GenerationTransactionFiles;
}): GenerationOwnerClaim {
  if (!Path.isAbsolute(input.distributionRoot)) {
    throw new GenerationTransactionError(
      "invalid_roots",
      "Generation distribution root must be an explicit absolute path",
    );
  }
  const files = input.files ?? createNodeGenerationTransactionFiles();
  const distributionRoot = Path.resolve(input.distributionRoot);
  ensureDirectoryTree(files, distributionRoot, 0o700);
  const path = Path.join(distributionRoot, ".kepler-installation-owner");
  const token = randomUUID();
  const content = `${JSON.stringify({
    owner: "kepler-generation-transaction",
    token,
    pid: process.pid,
  })}\n`;
  let identity: GenerationFileIdentity;
  try {
    identity = files.createExclusiveFile(path, new TextEncoder().encode(content), 0o600);
    syncDirectory(files, distributionRoot);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      throw new GenerationTransactionError(
        "owner_busy",
        "Another Kepler generation operation owns the installation claim; age does not permit takeover.",
        { path },
      );
    }
    throw error;
  }

  let released = false;
  let removeExitHandler = () => {};
  const release = (): { state: "released" | "missing" | "replaced" } => {
    if (released) return { state: "missing" };
    removeExitHandler();
    const current = files.inspect(path);
    if (current.kind === "missing") {
      released = true;
      return { state: "missing" };
    }
    if (
      current.kind !== "file" ||
      current.identity.dev !== identity.dev ||
      current.identity.ino !== identity.ino ||
      !hasClaimToken(current.contents, token)
    ) {
      released = true;
      return { state: "replaced" };
    }
    files.unlink(path);
    syncDirectory(files, distributionRoot);
    released = true;
    return { state: "released" };
  };
  removeExitHandler = files.onProcessExit(() => {
    try {
      release();
    } catch {
      process.exitCode = 1;
    }
  });
  return { token, path, identity, release };
}

export function beginGenerationTransaction(input: {
  readonly roots: GenerationTransactionRoots;
  readonly candidate: GenerationCandidate;
  readonly mode: GenerationInstallMode;
  readonly files?: GenerationTransactionFiles;
}): GenerationTransaction {
  const layout = resolveGenerationLayout(input.roots);
  const files = input.files ?? createNodeGenerationTransactionFiles();
  validateCandidate(input.candidate);
  validateMode(input.mode, input.candidate.generationId);
  const claim = acquireGenerationOwnerClaim({
    distributionRoot: layout.distributionRoot,
    files,
  });
  const transactionId = randomUUID();
  const recoveryJournalPath = Path.join(
    layout.transactionsDirectory,
    `${transactionId}.json`,
  );
  let journal: GenerationJournal | undefined;
  let staged = false;
  let candidateCreated = false;
  let bootstrapCreated = false;
  let bootstrapSelected = false;
  let selectorCommitted = false;
  let launcherChange: GenerationEffects["stable_launcher"] = "unchanged";
  let expectedPiSettings: GenerationPathPreimage | undefined;
  let expectedReceipt: GenerationPathPreimage | undefined;
  let preimages: GenerationPreimages;

  try {
    ensureDirectoryTree(files, layout.transactionsDirectory, 0o700);
    ensureDirectoryTree(files, layout.generationsDirectory, 0o755);
    assertNoPendingGenerationRecovery(files, layout.transactionsDirectory);
    assertPathAncestors(files, layout.globalHome);
    assertPathAncestors(files, layout.piAgentDirectory);
    assertPathAncestors(files, Path.dirname(layout.stableLauncherPath));
    preimages = capturePreimages(files, layout);
    validateInitialState(files, layout, input.mode, preimages);
    const candidatePath = Path.join(layout.generationsDirectory, input.candidate.generationId);
    const candidateState = files.inspect(candidatePath);
    if (input.mode.kind === "repair") {
      if (candidateState.kind !== "directory") {
        throw transactionError("candidate_conflict", "Repair requires an existing selected generation directory.", undefined, undefined, candidatePath);
      }
      verifyCandidateTree(files, candidatePath, candidateFiles(input.candidate));
    } else if (candidateState.kind !== "missing") {
      throw transactionError("candidate_conflict", "Candidate generation path already exists and will not be adopted or replaced.", undefined, undefined, candidatePath);
    }
    if (input.mode.kind === "first-install" && files.inspect(Path.join(layout.generationsDirectory, "bootstrap")).kind !== "missing") {
      throw transactionError("candidate_conflict", "Bootstrap generation already exists and will not be adopted.", undefined, undefined, Path.join(layout.generationsDirectory, "bootstrap"));
    }
    const inventory = candidateFiles(input.candidate);
    journal = {
      owner: "kepler-generation-transaction",
      transaction_format_version: 1,
      transaction_id: transactionId,
      owner_token: claim.token,
      state: "preparing",
      mode: input.mode,
      roots: layout,
      candidate: {
        generation_id: input.candidate.generationId,
        release: input.candidate.buildIdentity.kepler_release,
        source: input.candidate.buildIdentity.source,
        target: input.candidate.buildIdentity.target,
        resource_digest: input.candidate.buildIdentity.resource_digest,
        files: Object.fromEntries(inventory.map((file) => [file.path, file.digest])),
      },
      preimages,
      effects: {
        candidate: "not_staged",
        bootstrap: "not_created",
        selector: "unchanged",
        stable_launcher: "unchanged",
        pi_settings: "unchanged",
        installation_record: "unchanged",
      },
    };
    writeInitialJournal(files, recoveryJournalPath, journal);
  } catch (error) {
    let cleanupWarning: string | undefined;
    try {
      claim.release();
    } catch (cleanupError) {
      cleanupWarning = errorMessage(cleanupError);
    }
    if (error instanceof GenerationTransactionError) {
      if (!cleanupWarning) throw error;
      throw new GenerationTransactionError(error.code, error.message, {
        ...error.details,
        cleanupWarning,
      });
    }
    throw new GenerationTransactionError(
      "path_conflict",
      `Could not begin the generation transaction: ${errorMessage(error)}`,
      { recoveryJournalPath },
    );
  }

  const updateJournal = (next: GenerationJournal): void => {
    journal = next;
    writeUpdatedJournal(files, recoveryJournalPath, next, claim.token);
  };
  const currentJournal = (): GenerationJournal => {
    if (!journal) {
      throw new GenerationTransactionError("invalid_state", "Generation transaction journal is unavailable.", { recoveryJournalPath });
    }
    return journal;
  };

  const currentEffects = (): GenerationEffects => journal?.effects ?? {
    candidate: "not_staged",
    bootstrap: "not_created",
    selector: "unchanged",
    stable_launcher: "unchanged",
    pi_settings: "unchanged",
    installation_record: "unchanged",
  };

  const markRecoveryRequired = (error: unknown): GenerationTransactionError => {
    let observed: GenerationPathPreimage | undefined;
    let observedRoots: GenerationPreimages | undefined;
    let cleanupWarning: string | undefined;
    let effects = currentEffects();
    try {
      observedRoots = capturePreimages(files, layout);
      observed = observedRoots.selector;
      selectorCommitted = observedRoots.selector.kind === "symlink" && observedRoots.selector.target === selectorTarget(input.candidate.generationId);
      if (selectorCommitted) {
        effects = {
          ...currentEffects(),
          selector: input.mode.kind === "repair" ? "unchanged" : "selected",
        };
      }
      else if (
        input.mode.kind === "first-install" &&
        observedRoots.selector.kind === "symlink" &&
        observedRoots.selector.target === "generations/bootstrap"
      ) {
        effects = { ...currentEffects(), bootstrap: "selected", selector: "bootstrap_selected" };
      }
      if (expectedPiSettings && preimageEqual(observedRoots.pi_settings, expectedPiSettings)) {
        effects = { ...effects, pi_settings: "expected_update" };
      } else if (preimageEqual(observedRoots.pi_settings, preimages.pi_settings)) {
        effects = { ...effects, pi_settings: "unchanged" };
      }
      if (expectedReceipt && preimageEqual(observedRoots.installation_record, expectedReceipt)) {
        effects = {
          ...effects,
          installation_record: preimageEqual(expectedReceipt, preimages.installation_record)
            ? "unchanged"
            : "expected_update",
        };
      } else if (preimageEqual(observedRoots.installation_record, preimages.installation_record)) {
        effects = { ...effects, installation_record: "unchanged" };
      }
      if (
        observedRoots.stable_launcher.kind === "symlink" &&
        observedRoots.stable_launcher.target === activeLauncherTarget(layout)
      ) {
        launcherChange = preimages.stable_launcher.kind === "missing"
          ? "created"
          : preimages.stable_launcher.kind === "symlink" && preimages.stable_launcher.target === layout.legacyLauncherPath
            ? "replaced"
            : "unchanged";
        effects = { ...effects, stable_launcher: launcherChange };
      }
    } catch (inspectionError) {
      cleanupWarning = errorMessage(inspectionError);
    }
    if (journal) {
      try {
        updateJournal({
          ...journal,
          state: "recovery_required",
          effects,
          ...(observedRoots ? { observed_roots: observedRoots } : {}),
          failure: errorMessage(error),
        });
      } catch (journalError) {
        cleanupWarning = [cleanupWarning, errorMessage(journalError)].filter(Boolean).join("; ");
      }
    }
    const code = error instanceof GenerationTransactionError
      ? error.code
      : "interrupted";
    const message = error instanceof Error
      ? error.message
      : `Generation transaction stopped after partial effects: ${errorMessage(error)}`;
    const details = error instanceof GenerationTransactionError ? error.details : {};
    return new GenerationTransactionError(code, message, {
      ...details,
      recoveryJournalPath,
      effects,
      ...(observed ? { observed } : {}),
      ...(observedRoots ? { observedRoots } : {}),
      ...(cleanupWarning ? { cleanupWarning } : {}),
    });
  };
  const candidatePath = Path.join(layout.generationsDirectory, input.candidate.generationId);
  const initialSelectorTarget = input.mode.kind === "upgrade"
    ? `generations/${input.mode.previousGenerationId}`
    : input.mode.kind === "repair"
      ? `generations/${input.mode.generationId}`
      : "generations/bootstrap";

  const transaction: GenerationTransaction = {
    layout,
    claim,
    transactionId,
    recoveryJournalPath,
    preimages,
    stage() {
      if (staged) throw transactionError("invalid_state", "Generation candidate was already staged.", recoveryJournalPath, currentEffects());
      try {
        if (input.mode.kind === "repair") {
          verifyCandidateTree(files, candidatePath, candidateFiles(input.candidate));
          staged = true;
          updateJournal({
            ...currentJournal(),
            state: "staged",
            effects: { ...currentJournal().effects, candidate: "verified" },
          });
          return {
            generationId: input.candidate.generationId,
            candidatePath,
            selectorTarget: initialSelectorTarget,
            bootstrapSelected: false,
            recoveryJournalPath,
          };
        }
        if (files.inspect(candidatePath).kind !== "missing") {
          throw transactionError("candidate_conflict", "Candidate generation path already exists and will not be adopted or replaced.", recoveryJournalPath, currentEffects(), candidatePath);
        }
        updateJournal({
          ...currentJournal(),
          effects: { ...currentJournal().effects, candidate: "partial" },
        });
        files.mkdir(candidatePath, 0o700);
        syncDirectory(files, layout.generationsDirectory);
        candidateCreated = true;
        const ownerMarker = Path.join(candidatePath, ".kepler-owner-token");
        files.writeFile(ownerMarker, encoder.encode(claim.token), 0o600, true);
        files.sync(ownerMarker);
        for (const file of candidateFiles(input.candidate)) {
          const destination = Path.join(candidatePath, ...file.path.split("/"));
          ensureDirectoryTree(files, Path.dirname(destination), 0o755);
          files.writeFile(destination, file.contents, file.mode, true);
          files.sync(destination);
          syncDirectory(files, Path.dirname(destination));
        }
        if (!hasExactFile(files, ownerMarker, claim.token)) {
          throw transactionError("observed_drift", "Candidate ownership marker changed during staging.", recoveryJournalPath, currentEffects(), ownerMarker);
        }
        files.unlink(ownerMarker);
        verifyCandidateTree(files, candidatePath, candidateFiles(input.candidate));
        const directories = collectDirectories(files, candidatePath).sort(
          (left, right) => right.split(Path.sep).length - left.split(Path.sep).length,
        );
        for (const path of candidateFiles(input.candidate).map((file) => Path.join(candidatePath, ...file.path.split("/")))) {
          files.chmod(path, path === Path.join(candidatePath, "bin", "kepler") ? 0o555 : 0o444);
          files.sync(path);
        }
        for (const directory of directories) {
          files.chmod(directory, 0o555);
          syncDirectory(files, directory);
        }
        files.chmod(candidatePath, 0o555);
        syncDirectory(files, candidatePath);
        candidateCreated = true;
        staged = true;
        updateJournal({
          ...currentJournal(),
          state: "staged",
          effects: { ...currentJournal().effects, candidate: "staged" },
        });

        if (input.mode.kind === "first-install") {
          recheckOriginalPreimages(files, preimages, recoveryJournalPath, currentEffects());
          updateJournal({
            ...currentJournal(),
            effects: { ...currentJournal().effects, bootstrap: "partial" },
          });
          createBootstrap(files, layout);
          bootstrapCreated = true;
          updateJournal({
            ...currentJournal(),
            effects: { ...currentJournal().effects, bootstrap: "created" },
          });
          const selectorNow = files.inspect(layout.selector);
          if (selectorNow.kind !== "missing") {
            throw driftError(files, layout.selector, recoveryJournalPath, currentEffects());
          }
          files.symlink("generations/bootstrap", layout.selector);
          syncDirectory(files, layout.distributionRoot);
          const selected = files.inspect(layout.selector);
          if (selected.kind !== "symlink" || selected.target !== "generations/bootstrap") {
            throw transactionError("interrupted", "Could not establish the bootstrap selector.", recoveryJournalPath, currentEffects(), layout.selector);
          }
          bootstrapSelected = true;
          updateJournal({
            ...currentJournal(),
            state: "bootstrap_selected",
            effects: {
              ...currentJournal().effects,
              bootstrap: "selected",
              selector: "bootstrap_selected",
            },
          });
        }
        return {
          generationId: input.candidate.generationId,
          candidatePath,
          selectorTarget: initialSelectorTarget,
          bootstrapSelected,
          recoveryJournalPath,
        };
      } catch (error) {
        let cleanupWarning: string | undefined;
        if (candidateCreated && !staged && !bootstrapSelected) {
          try {
            if (cleanupOwnedPartialCandidate(files, candidatePath, claim.token, candidateFiles(input.candidate))) {
              candidateCreated = false;
            } else {
              cleanupWarning = "Partial candidate contained changed or unowned paths and was preserved.";
            }
          } catch (cleanupError) {
            cleanupWarning = errorMessage(cleanupError);
          }
        }
        let observedRoots: GenerationPreimages | undefined;
        try {
          observedRoots = capturePreimages(files, layout);
        } catch (inspectionError) {
          cleanupWarning = errorMessage(inspectionError);
        }
        let effects = currentEffects();
        if (staged) effects = {
          ...effects,
          candidate: input.mode.kind === "repair" ? "verified" : "staged",
        };
        else if (candidateCreated) effects = { ...effects, candidate: "partial" };
        else if (effects.candidate === "partial") effects = { ...effects, candidate: "not_staged" };
        if (bootstrapSelected) effects = { ...effects, bootstrap: "selected", selector: "bootstrap_selected" };
        else if (input.mode.kind === "first-install" && observedRoots?.selector.kind === "symlink" && observedRoots.selector.target === "generations/bootstrap") {
          bootstrapSelected = true;
          effects = { ...effects, bootstrap: "selected", selector: "bootstrap_selected" };
        } else if (bootstrapCreated) {
          effects = { ...effects, bootstrap: "created" };
        }
        const hasDurableEffects = candidateCreated || bootstrapSelected;
        try {
          updateJournal({
            ...currentJournal(),
            state: hasDurableEffects ? "recovery_required" : "aborted",
            effects,
            ...(observedRoots ? { observed_roots: observedRoots } : {}),
            failure: errorMessage(error),
          });
        } catch (journalError) {
          cleanupWarning = errorMessage(journalError);
        }
        let code: GenerationTransactionErrorCode;
        if (error instanceof GenerationTransactionError) {
          code = error.code;
        } else {
          code = hasDurableEffects ? "interrupted" : "path_conflict";
        }
        throw new GenerationTransactionError(code, `Could not stage the generation candidate: ${errorMessage(error)}`, {
          recoveryJournalPath,
          effects,
          ...(error instanceof GenerationTransactionError ? error.details : {}),
          ...(observedRoots ? { observedRoots } : {}),
          ...(cleanupWarning ? { cleanupWarning } : {}),
        });
      }
    },
    expectPiSettings(contents) {
      if (!staged || selectorCommitted) {
        throw transactionError("invalid_state", "Pi settings effects may be recorded only after staging and before selector activation.", recoveryJournalPath, currentEffects());
      }
      try {
        assertMatches(files, preimages.pi_settings, recoveryJournalPath, currentEffects());
        expectedPiSettings = snapshotFile(layout.piSettings, contents);
        updateJournal({
          ...currentJournal(),
          expected_pi_settings: expectedPiSettings,
          effects: { ...currentJournal().effects, pi_settings: "expected_update" },
        });
      } catch (error) {
        throw markRecoveryRequired(error);
      }
    },
    expectInstallationRecord(contents) {
      if (!selectorCommitted || !staged) {
        throw transactionError("invalid_state", "Installation-record effects may be recorded only after selector activation.", recoveryJournalPath, currentEffects());
      }
      try {
        assertMatches(files, preimages.installation_record, recoveryJournalPath, currentEffects());
        expectedReceipt = snapshotFile(layout.installationRecord, contents);
        updateJournal({
          ...currentJournal(),
          expected_receipt: expectedReceipt,
          effects: {
            ...currentJournal().effects,
            installation_record: preimageEqual(expectedReceipt, preimages.installation_record)
              ? "unchanged"
              : "expected_update",
          },
        });
      } catch (error) {
        throw markRecoveryRequired(error);
      }
    },
    writeInstallationRecord(contents) {
      if (!selectorCommitted || !staged || expectedReceipt?.kind !== "file") {
        throw transactionError("invalid_state", "An activated generation and a journaled receipt are required before writing the installation record.", recoveryJournalPath, currentEffects(), layout.installationRecord);
      }
      const expectedBytes = Buffer.from(expectedReceipt.contents_base64, "base64");
      if (!bytesEqual(expectedBytes, contents)) {
        throw transactionError("invalid_state", "Installation-record bytes do not match the journaled receipt.", recoveryJournalPath, currentEffects(), layout.installationRecord);
      }
      const temporaryPath = `${layout.installationRecord}.kepler-${claim.token}.tmp`;
      try {
        assertMatches(files, preimages.installation_record, recoveryJournalPath, currentEffects());
        updateJournal({
          ...currentJournal(),
          state: "receipt_pending",
          effects: { ...currentJournal().effects, installation_record: "expected_update" },
        });
        ensureDirectoryTree(files, Path.dirname(layout.installationRecord), 0o700);
        if (files.inspect(temporaryPath).kind !== "missing") {
          throw transactionError("path_conflict", "Owned receipt staging path is occupied.", recoveryJournalPath, currentEffects(), temporaryPath);
        }
        files.writeFile(temporaryPath, contents, 0o600, true);
        files.sync(temporaryPath);
        const stagedReceipt = files.inspect(temporaryPath);
        if (stagedReceipt.kind !== "file" || !bytesEqual(stagedReceipt.contents, contents)) {
          throw transactionError("interrupted", "Staged installation receipt could not be verified.", recoveryJournalPath, currentEffects(), temporaryPath);
        }
        assertMatches(files, preimages.installation_record, recoveryJournalPath, currentEffects());
        files.rename(temporaryPath, layout.installationRecord);
        syncDirectory(files, Path.dirname(layout.installationRecord));
        assertMatches(files, expectedReceipt, recoveryJournalPath, currentEffects());
        updateJournal({
          ...currentJournal(),
          state: "receipt_written",
          effects: { ...currentJournal().effects, installation_record: "expected_update" },
        });
      } catch (error) {
        const journaledError = error instanceof GenerationTransactionError
          ? error
          : new GenerationTransactionError(
            "interrupted",
            `Could not write the installation receipt: ${errorMessage(error)}`,
            { path: temporaryPath, recoveryJournalPath, effects: currentEffects() },
          );
        throw markRecoveryRequired(journaledError);
      }
    },
    activate() {
      if (!staged || selectorCommitted) {
        throw transactionError("invalid_state", "A staged generation is required before selector activation.", recoveryJournalPath, currentEffects());
      }
      try {
        recheckActivationPreimages(files, layout, input.mode, preimages, expectedPiSettings, recoveryJournalPath, currentEffects());
        verifyCandidateTree(files, candidatePath, candidateFiles(input.candidate));
        if (input.mode.kind === "repair") {
          selectorCommitted = true;
          updateJournal({
            ...currentJournal(),
            state: "selector_committed",
            effects: { ...currentJournal().effects, selector: "unchanged", stable_launcher: "unchanged" },
          });
          return {
            selectedGenerationId: input.candidate.generationId,
            selector: layout.selector,
            launcher: "unchanged",
            recoveryJournalPath,
          };
        }
        if (input.mode.kind === "first-install") {
          verifyBootstrapTree(files, Path.join(layout.generationsDirectory, "bootstrap"));
        }
        const previousTarget = input.mode.kind === "upgrade"
          ? `generations/${input.mode.previousGenerationId}`
          : "generations/bootstrap";
        updateJournal({ ...currentJournal(), state: "activation_pending" });
        replaceKnownSymlink(
          files,
          layout.selector,
          previousTarget,
          selectorTarget(input.candidate.generationId),
          claim.token,
        );
        selectorCommitted = true;
        updateJournal({
          ...currentJournal(),
          state: "selector_committed",
          effects: { ...currentJournal().effects, selector: "selected" },
        });
        updateJournal({ ...currentJournal(), state: "launcher_pending" });

        if (preimages.stable_launcher.kind === "missing") {
          if (files.inspect(layout.stableLauncherPath).kind !== "missing") {
            throw driftError(files, layout.stableLauncherPath, recoveryJournalPath, currentEffects());
          }
          ensureDirectoryTree(files, Path.dirname(layout.stableLauncherPath), 0o755);
          files.symlink(activeLauncherTarget(layout), layout.stableLauncherPath);
          syncDirectory(files, Path.dirname(layout.stableLauncherPath));
          launcherChange = "created";
        } else if (
          preimages.stable_launcher.kind === "symlink" &&
          preimages.stable_launcher.target === layout.legacyLauncherPath
        ) {
          replaceKnownSymlink(
            files,
            layout.stableLauncherPath,
            layout.legacyLauncherPath,
            activeLauncherTarget(layout),
            claim.token,
          );
          launcherChange = "replaced";
        }
        const launcher = files.inspect(layout.stableLauncherPath);
        if (launcher.kind !== "symlink" || launcher.target !== activeLauncherTarget(layout)) {
          throw driftError(files, layout.stableLauncherPath, recoveryJournalPath, currentEffects());
        }
        updateJournal({
          ...currentJournal(),
          state: "selector_committed",
          effects: { ...currentJournal().effects, stable_launcher: launcherChange },
        });
        return {
          selectedGenerationId: input.candidate.generationId,
          selector: layout.selector,
          launcher: launcherChange,
          recoveryJournalPath,
        };
      } catch (error) {
        throw markRecoveryRequired(error);
      }
    },
    finalizeJournal(receiptContents) {
      if (!selectorCommitted || !staged) {
        throw transactionError("invalid_state", "The candidate selector must be committed before finalizing its journal.", recoveryJournalPath, currentEffects());
      }
      try {
        recheckCommittedState(files, layout, input.candidate.generationId, expectedPiSettings, preimages, recoveryJournalPath, currentEffects());
        verifyCandidateTree(files, candidatePath, candidateFiles(input.candidate));
        if (!expectedReceipt || expectedReceipt.kind !== "file" || !bytesEqual(Buffer.from(expectedReceipt.contents_base64, "base64"), receiptContents)) {
          throw transactionError("invalid_state", "The expected installation-record bytes must be journaled before read-back.", recoveryJournalPath, currentEffects(), layout.installationRecord);
        }
        assertMatches(files, expectedReceipt, recoveryJournalPath, currentEffects());
        const digest = sha256Digest(receiptContents);
        updateJournal({
          ...currentJournal(),
          state: "committed",
          expected_receipt: expectedReceipt,
          effects: {
            ...currentJournal().effects,
            selector: input.mode.kind === "repair" ? "unchanged" : "selected",
            stable_launcher: launcherChange,
            pi_settings: expectedPiSettings ? "expected_update" : "unchanged",
            installation_record: preimageEqual(expectedReceipt, preimages.installation_record)
              ? "unchanged"
              : "verified_update",
          },
        });
        return { transactionId, receiptDigest: digest, recoveryJournalPath };
      } catch (error) {
        throw markRecoveryRequired(error);
      }
    },
    recordFailure(error) {
      return markRecoveryRequired(error);
    },
    release() {
      return claim.release();
    },
  };
  return transaction;
}

function classifyDirectoryEntry(entry: Fs.Dirent): GenerationDirectoryEntry["kind"] {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return "special";
}

function validateCandidate(candidate: GenerationCandidate): void {
  if (!generationIdPattern.test(candidate.generationId)) {
    throw new GenerationTransactionError("invalid_candidate", "Candidate generation id must be a UUIDv4.");
  }
  const identity = candidate.buildIdentity;
  if (
    identity.format_version !== 1 ||
    !isStableVersion(identity.kepler_release) ||
    !digestPattern.test(identity.resource_digest) ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(identity.source.commit) ||
    !digestPattern.test(identity.source.content_digest) ||
    !["production", "development"].includes(identity.source.kind) ||
    !["linux", "darwin"].includes(identity.target.os) ||
    !["x64", "arm64"].includes(identity.target.arch) ||
    !(candidate.executable instanceof Uint8Array) ||
    candidate.executable.byteLength === 0
  ) {
    throw new GenerationTransactionError("invalid_candidate", "Candidate build identity or executable is invalid.");
  }
  try {
    const manifest = parseResourceManifest(JSON.stringify(candidate.resources.manifest));
    if (
      manifest.kepler_release !== identity.kepler_release ||
      manifest.resource_digest !== identity.resource_digest
    ) {
      throw new Error("Validated resource package does not match the build identity");
    }
    const declaredPaths = Object.keys(manifest.files).sort(compareStrings);
    const files = [...candidate.resources.files].sort((left, right) => compareStrings(left.path, right.path));
    if (files.length !== declaredPaths.length) throw new Error("Validated resource inventory is incomplete");
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) throw new Error("Validated resource inventory order is incomplete");
      if (
        file.path !== declaredPaths[index] ||
        manifest.files[file.path] !== file.digest ||
        sha256Digest(file.contents) !== file.digest ||
        !isNormalizedRelativePath(file.path)
      ) {
        throw new Error(`Validated resource identity mismatch for ${file.path}`);
      }
    }
    const packageDescriptor = files.find((file) => file.path === "pi-package.json");
    if (!packageDescriptor) throw new Error("Validated resource package metadata is missing");
    if (!(candidate.releaseManifest instanceof Uint8Array) || candidate.releaseManifest.byteLength === 0) {
      throw new Error("Validated target archive manifest is missing");
    }
    validateTargetPackageFiles([
      { path: "bin/kepler", contents: candidate.executable, executable: true },
      {
        path: "bundle/manifest.json",
        contents: encoder.encode(`${JSON.stringify(candidate.resources.manifest, null, 2)}\n`),
      },
      ...files.map((file) => ({ path: `bundle/${file.path}`, contents: file.contents })),
      { path: "package.json", contents: packageDescriptor.contents },
      { path: "release-manifest.json", contents: candidate.releaseManifest },
    ], { expectedIdentity: identity });
  } catch (error) {
    throw new GenerationTransactionError(
      "invalid_candidate",
      `Candidate resource identity is invalid: ${errorMessage(error)}`,
    );
  }
}

function validateMode(mode: GenerationInstallMode, candidateId: string): void {
  if (mode.kind === "upgrade") {
    if (!generationIdPattern.test(mode.previousGenerationId) || mode.previousGenerationId === candidateId) {
      throw new GenerationTransactionError("invalid_candidate", "Upgrade requires a different prior UUIDv4 generation.");
    }
  } else if (mode.kind === "repair" && mode.generationId !== candidateId) {
    throw new GenerationTransactionError("invalid_candidate", "Repair candidate must match the selected UUIDv4 generation.");
  }
}

function candidateFiles(candidate: GenerationCandidate): CandidateFile[] {
  const files: CandidateFile[] = [
    {
      path: "bin/kepler",
      contents: candidate.executable,
      digest: sha256Digest(candidate.executable),
      mode: 0o755,
    },
    {
      path: "bundle/manifest.json",
      contents: encoder.encode(`${JSON.stringify(candidate.resources.manifest, null, 2)}\n`),
      digest: sha256Digest(`${JSON.stringify(candidate.resources.manifest, null, 2)}\n`),
      mode: 0o644,
    },
    ...candidate.resources.files.map((file) => ({
      path: `bundle/${file.path}`,
      contents: file.contents,
      digest: file.digest,
      mode: 0o644,
    })),
  ];
  const packageDescriptor = candidate.resources.files.find((file) => file.path === "pi-package.json");
  if (!packageDescriptor) throw new GenerationTransactionError("invalid_candidate", "Package metadata is missing.");
  files.push({
    path: "package.json",
    contents: packageDescriptor.contents,
    digest: packageDescriptor.digest,
    mode: 0o644,
  });
  files.push({
    path: "release-manifest.json",
    contents: candidate.releaseManifest,
    digest: sha256Digest(candidate.releaseManifest),
    mode: 0o644,
  });
  return files.sort((left, right) => compareStrings(left.path, right.path));
}

function validateInitialState(
  files: GenerationTransactionFiles,
  layout: GenerationLayout,
  mode: GenerationInstallMode,
  preimages: GenerationPreimages,
): void {
  if (mode.kind === "first-install") {
    if (preimages.selector.kind !== "missing") {
      throw transactionError("selector_conflict", "First install requires an absent selector.", undefined, undefined, layout.selector);
    }
    if (
      preimages.stable_launcher.kind !== "missing" &&
      !(
        preimages.stable_launcher.kind === "symlink" &&
        preimages.stable_launcher.target === layout.legacyLauncherPath &&
        files.inspect(layout.legacyLauncherPath).kind === "file"
      )
    ) {
      throw transactionError("launcher_conflict", "Stable launcher is neither absent nor the known legacy Kepler symlink.", undefined, undefined, layout.stableLauncherPath);
    }
  } else if (mode.kind === "upgrade") {
    const expectedTarget = `generations/${mode.previousGenerationId}`;
    if (preimages.selector.kind !== "symlink" || preimages.selector.target !== expectedTarget) {
      throw transactionError("selector_conflict", "Upgrade selector does not identify the expected prior generation.", undefined, undefined, layout.selector);
    }
    const priorGeneration = files.inspect(Path.join(layout.generationsDirectory, mode.previousGenerationId));
    if (priorGeneration.kind !== "directory") {
      throw transactionError("selector_conflict", "Prior selected generation is not a regular directory.", undefined, undefined, Path.join(layout.generationsDirectory, mode.previousGenerationId));
    }
    if (
      preimages.stable_launcher.kind !== "symlink" ||
      preimages.stable_launcher.target !== activeLauncherTarget(layout)
    ) {
      throw transactionError("launcher_conflict", "Upgrade launcher does not point through the current selector.", undefined, undefined, layout.stableLauncherPath);
    }
  } else {
    const expectedTarget = `generations/${mode.generationId}`;
    if (preimages.selector.kind !== "symlink" || preimages.selector.target !== expectedTarget) {
      throw transactionError("selector_conflict", "Repair requires the expected generation to remain selected.", undefined, undefined, layout.selector);
    }
    if (files.inspect(Path.join(layout.generationsDirectory, mode.generationId)).kind !== "directory") {
      throw transactionError("selector_conflict", "Repair requires the selected generation directory.", undefined, undefined, Path.join(layout.generationsDirectory, mode.generationId));
    }
    if (
      preimages.stable_launcher.kind !== "symlink" ||
      preimages.stable_launcher.target !== activeLauncherTarget(layout)
    ) {
      throw transactionError("launcher_conflict", "Repair requires the known stable launcher to follow the selector.", undefined, undefined, layout.stableLauncherPath);
    }
    if (preimages.installation_record.kind !== "file") {
      throw transactionError("path_conflict", "Repair requires an existing version-2 installation receipt.", undefined, undefined, layout.installationRecord);
    }
  }
  for (const preimage of [preimages.installation_record, preimages.pi_settings]) {
    if (preimage.kind !== "missing" && preimage.kind !== "file") {
      throw transactionError("path_conflict", "A known cross-root transaction path is not missing or a regular file.", undefined, undefined, preimage.path);
    }
  }
}

function capturePreimages(files: GenerationTransactionFiles, layout: GenerationLayout): GenerationPreimages {
  return {
    selector: snapshotPath(files, layout.selector),
    installation_record: snapshotPath(files, layout.installationRecord),
    pi_settings: snapshotPath(files, layout.piSettings),
    stable_launcher: snapshotPath(files, layout.stableLauncherPath),
  };
}

function snapshotPath(files: GenerationTransactionFiles, path: string): GenerationPathPreimage {
  const state = files.inspect(path);
  if (state.kind === "file") {
    return {
      path,
      kind: "file",
      contents_base64: Buffer.from(state.contents).toString("base64"),
      digest: sha256Digest(state.contents),
    };
  }
  if (state.kind === "symlink") return { path, kind: "symlink", target: state.target };
  return { path, kind: state.kind };
}

function snapshotFile(path: string, contents: Uint8Array): GenerationPathPreimage {
  return {
    path,
    kind: "file",
    contents_base64: Buffer.from(contents).toString("base64"),
    digest: sha256Digest(contents),
  };
}

function recheckOriginalPreimages(
  files: GenerationTransactionFiles,
  preimages: GenerationPreimages,
  journalPath: string,
  effects: GenerationEffects,
): void {
  for (const preimage of Object.values(preimages)) {
    assertMatches(files, preimage, journalPath, effects);
  }
}

function recheckActivationPreimages(
  files: GenerationTransactionFiles,
  layout: GenerationLayout,
  mode: GenerationInstallMode,
  preimages: GenerationPreimages,
  expectedPiSettings: GenerationPathPreimage | undefined,
  journalPath: string,
  effects: GenerationEffects,
): void {
  const expectedSelector = mode.kind === "first-install"
    ? "generations/bootstrap"
    : mode.kind === "upgrade"
      ? `generations/${mode.previousGenerationId}`
      : `generations/${mode.generationId}`;
  const selector = files.inspect(layout.selector);
  if (selector.kind !== "symlink" || selector.target !== expectedSelector) {
    throw driftError(files, layout.selector, journalPath, effects);
  }
  assertUnchanged(files, preimages.installation_record, journalPath, effects);
  assertMatches(files, expectedPiSettings ?? preimages.pi_settings, journalPath, effects);
  assertUnchanged(files, preimages.stable_launcher, journalPath, effects);
}

function recheckCommittedState(
  files: GenerationTransactionFiles,
  layout: GenerationLayout,
  generationId: string,
  expectedPiSettings: GenerationPathPreimage | undefined,
  preimages: GenerationPreimages,
  journalPath: string,
  effects: GenerationEffects,
): void {
  const selector = files.inspect(layout.selector);
  if (selector.kind !== "symlink" || selector.target !== selectorTarget(generationId)) {
    throw driftError(files, layout.selector, journalPath, effects);
  }
  const launcher = files.inspect(layout.stableLauncherPath);
  if (launcher.kind !== "symlink" || launcher.target !== activeLauncherTarget(layout)) {
    throw driftError(files, layout.stableLauncherPath, journalPath, effects);
  }
  assertMatches(files, expectedPiSettings ?? preimages.pi_settings, journalPath, effects);
}

function assertUnchanged(
  files: GenerationTransactionFiles,
  expected: GenerationPathPreimage,
  journalPath: string,
  effects: GenerationEffects,
): void {
  assertMatches(files, expected, journalPath, effects);
}

function assertMatches(
  files: GenerationTransactionFiles,
  expected: GenerationPathPreimage,
  journalPath: string,
  effects: GenerationEffects,
): void {
  const observed = snapshotPath(files, expected.path);
  if (!preimageEqual(observed, expected)) {
    throw new GenerationTransactionError(
      "observed_drift",
      `A transaction preimage changed after it was recorded: ${expected.path}`,
      { path: expected.path, recoveryJournalPath: journalPath || undefined, effects, observed },
    );
  }
}

function replaceKnownSymlink(
  files: GenerationTransactionFiles,
  path: string,
  expectedTarget: string,
  nextTarget: string,
  token: string,
): void {
  const before = files.inspect(path);
  if (before.kind !== "symlink" || before.target !== expectedTarget) {
    throw new GenerationTransactionError(
      "observed_drift",
      `Refusing to replace a selector that no longer matches its known target: ${path}`,
      { path, observed: snapshotPath(files, path) },
    );
  }
  const temporary = `${path}.kepler-${token}.tmp`;
  if (files.inspect(temporary).kind !== "missing") {
    throw new GenerationTransactionError("path_conflict", "Owned temporary symlink path is occupied.", { path: temporary });
  }
  files.symlink(nextTarget, temporary);
  try {
    const current = files.inspect(path);
    if (current.kind !== "symlink" || current.target !== expectedTarget) {
      throw new GenerationTransactionError(
        "observed_drift",
        `Refusing to replace a path changed during selector commit: ${path}`,
        { path, observed: snapshotPath(files, path) },
      );
    }
    files.rename(temporary, path);
    syncDirectory(files, Path.dirname(path));
    const after = files.inspect(path);
    if (after.kind !== "symlink" || after.target !== nextTarget) {
      throw new GenerationTransactionError(
        "interrupted",
        `Atomic symlink replacement did not select the requested target: ${path}`,
        { path, observed: snapshotPath(files, path) },
      );
    }
  } catch (error) {
    const leftover = files.inspect(temporary);
    if (leftover.kind === "symlink" && leftover.target === nextTarget) {
      try {
        files.unlink(temporary);
      } catch (cleanupError) {
        throw new GenerationTransactionError(
          "interrupted",
          `Symlink commit failed and its owned temporary link could not be cleaned: ${errorMessage(error)}`,
          { path: temporary, cleanupWarning: errorMessage(cleanupError) },
        );
      }
    } else if (leftover.kind !== "missing") {
      throw new GenerationTransactionError(
        "interrupted",
        `Symlink commit failed and a replacement temporary path was preserved: ${errorMessage(error)}`,
        { path: temporary },
      );
    }
    throw error;
  }
}

function createBootstrap(files: GenerationTransactionFiles, layout: GenerationLayout): void {
  const path = Path.join(layout.generationsDirectory, "bootstrap");
  if (files.inspect(path).kind !== "missing") {
    throw transactionError("candidate_conflict", "Bootstrap generation already exists and will not be adopted.", undefined, undefined, path);
  }
  files.mkdir(path, 0o700);
  for (const relative of bootstrapDirectories) {
    const directory = Path.join(path, ...relative.split("/"));
    ensureDirectoryTree(files, directory, 0o755);
  }
  const packagePath = Path.join(path, "package.json");
  files.writeFile(packagePath, encoder.encode(bootstrapMetadata), 0o644, true);
  files.sync(packagePath);
  syncDirectory(files, path);
  for (const directory of [...bootstrapDirectories]
    .map((relative) => Path.join(path, ...relative.split("/")))
    .sort((left, right) => right.split(Path.sep).length - left.split(Path.sep).length)) {
    files.chmod(directory, 0o555);
    syncDirectory(files, directory);
  }
  files.chmod(path, 0o555);
  syncDirectory(files, path);
  syncDirectory(files, layout.generationsDirectory);
}

function verifyBootstrapTree(files: GenerationTransactionFiles, root: string): void {
  const state = files.inspect(root);
  if (state.kind !== "directory") {
    throw new GenerationTransactionError("observed_drift", "Bootstrap package root is no longer a regular directory.", { path: root });
  }
  const actualFiles = readRegularFiles(files, root);
  const expectedDigest = sha256Digest(bootstrapMetadata);
  if (actualFiles.size !== 1 || sha256Digest(actualFiles.get("package.json") ?? new Uint8Array()) !== expectedDigest) {
    throw new GenerationTransactionError("observed_drift", "Bootstrap package contents changed after staging.", { path: root });
  }
  const actualDirectories = collectDirectories(files, root)
    .map((directory) => Path.relative(root, directory).split(Path.sep).join("/"))
    .filter(Boolean)
    .sort(compareStrings);
  if (JSON.stringify(actualDirectories) !== JSON.stringify([...bootstrapDirectories].sort(compareStrings))) {
    throw new GenerationTransactionError("observed_drift", "Bootstrap resource roots changed after staging.", { path: root });
  }
}

function verifyCandidateTree(
  files: GenerationTransactionFiles,
  root: string,
  expected: readonly CandidateFile[],
): void {
  const actual = readRegularFiles(files, root);
  const expectedByPath = new Map(expected.map((file) => [file.path, file.digest]));
  if (actual.size !== expectedByPath.size) {
    throw new GenerationTransactionError("observed_drift", "Staged candidate inventory does not match its validated identity.", { path: root });
  }
  for (const [relative, digest] of expectedByPath) {
    const contents = actual.get(relative);
    if (!contents || sha256Digest(contents) !== digest) {
      throw new GenerationTransactionError("observed_drift", `Staged candidate content changed: ${relative}`, { path: Path.join(root, relative) });
    }
  }
}

function cleanupOwnedPartialCandidate(
  files: GenerationTransactionFiles,
  root: string,
  token: string,
  expected: readonly CandidateFile[],
): boolean {
  const ownerMarker = Path.join(root, ".kepler-owner-token");
  if (!hasExactFile(files, ownerMarker, token)) return false;
  const actual = readRegularFiles(files, root);
  const expectedFiles = new Map(expected.map((file) => [file.path, file.digest]));
  const expectedDirectories = new Set<string>();
  for (const file of expected) {
    let parent = Path.posix.dirname(file.path);
    while (parent !== ".") {
      expectedDirectories.add(parent);
      parent = Path.posix.dirname(parent);
    }
  }
  for (const [relative, contents] of actual) {
    if (relative === ".kepler-owner-token") {
      if (new TextDecoder().decode(contents) !== token) return false;
      continue;
    }
    const digest = expectedFiles.get(relative);
    if (!digest || sha256Digest(contents) !== digest) return false;
  }
  const allowedFileCount = expectedFiles.size + 1;
  if (actual.size > allowedFileCount) return false;
  const directories = collectDirectories(files, root);
  for (const directory of directories) {
    const relative = Path.relative(root, directory).split(Path.sep).join("/");
    if (relative && !expectedDirectories.has(relative)) return false;
  }
  for (const directory of directories) files.chmod(directory, 0o700);
  for (const [relative, contents] of actual) {
    const path = Path.join(root, ...relative.split("/"));
    const expectedDigest = relative === ".kepler-owner-token"
      ? undefined
      : expectedFiles.get(relative);
    const current = files.inspect(path);
    if (
      current.kind !== "file" ||
      (expectedDigest && sha256Digest(current.contents) !== expectedDigest) ||
      (relative === ".kepler-owner-token" && new TextDecoder().decode(current.contents) !== token)
    ) {
      return false;
    }
    if (!bytesEqual(contents, current.contents)) return false;
    files.unlink(path);
  }
  for (const directory of [...directories].reverse()) files.rmdir(directory);
  syncDirectory(files, Path.dirname(root));
  return files.inspect(root).kind === "missing";
}

function readRegularFiles(files: GenerationTransactionFiles, root: string): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  const visit = (directory: string, prefix: string): void => {
    for (const entry of files.list(directory)) {
      const path = Path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        visit(path, relative);
        continue;
      }
      if (entry.kind !== "file") {
        throw new GenerationTransactionError("path_conflict", `Candidate contains an unsupported path kind: ${relative}`, { path });
      }
      const state = files.inspect(path);
      if (state.kind !== "file") throw new GenerationTransactionError("observed_drift", `Candidate file changed while being inspected: ${relative}`, { path });
      result.set(relative, state.contents);
    }
  };
  visit(root, "");
  return result;
}

function collectDirectories(files: GenerationTransactionFiles, root: string): string[] {
  const result = [root];
  const visit = (directory: string): void => {
    for (const entry of files.list(directory)) {
      if (entry.kind !== "directory") continue;
      const path = Path.join(directory, entry.name);
      result.push(path);
      visit(path);
    }
  };
  visit(root);
  return result;
}

function assertPathAncestors(files: GenerationTransactionFiles, target: string): void {
  const absolute = Path.resolve(target);
  const parsed = Path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(Path.sep).filter(Boolean)) {
    current = Path.join(current, segment);
    const state = files.inspect(current);
    if (state.kind === "missing") return;
    if (state.kind !== "directory") {
      throw new GenerationTransactionError(
        "path_conflict",
        `A cross-root transaction ancestor is not a real directory: ${current}`,
        { path: current },
      );
    }
  }
}

function ensureDirectoryTree(files: GenerationTransactionFiles, target: string, mode: number): void {
  const absolute = Path.resolve(target);
  const parsed = Path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(Path.sep).filter(Boolean)) {
    current = Path.join(current, segment);
    const state = files.inspect(current);
    if (state.kind === "missing") {
      files.mkdir(current, mode);
      syncDirectory(files, Path.dirname(current));
      continue;
    }
    if (state.kind !== "directory") {
      throw new GenerationTransactionError(
        "path_conflict",
        `Managed directory is not a real directory: ${current}`,
        { path: current },
      );
    }
  }
}

export function assertNoPendingGenerationRecovery(files: GenerationTransactionFiles, directory: string): void {
  const state = files.inspect(directory);
  if (state.kind !== "directory") {
    throw new GenerationTransactionError("path_conflict", "Transaction journal directory is not a regular directory.", { path: directory });
  }
  for (const entry of files.list(directory)) {
    const path = Path.join(directory, entry.name);
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) {
      throw new GenerationTransactionError("recovery_required", "Unknown transaction evidence prevents a new generation operation.", { path });
    }
    let journal: unknown;
    try {
      const contents = files.inspect(path);
      if (contents.kind !== "file") throw new Error("journal is not a regular file");
      journal = JSON.parse(new TextDecoder().decode(contents.contents));
    } catch {
      throw new GenerationTransactionError("recovery_required", "Malformed transaction evidence prevents a new generation operation.", { path });
    }
    if (!isTerminalJournal(journal)) {
      throw new GenerationTransactionError("recovery_required", "An earlier generation operation requires reconciliation before retry.", { path });
    }
  }
}

function isTerminalJournal(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const journal = value as Record<string, unknown>;
  return journal.owner === "kepler-generation-transaction" &&
    journal.transaction_format_version === 1 &&
    (journal.state === "committed" || journal.state === "aborted");
}

function writeInitialJournal(files: GenerationTransactionFiles, path: string, journal: GenerationJournal): void {
  ensureDirectoryTree(files, Path.dirname(path), 0o700);
  const contents = encoder.encode(`${JSON.stringify(journal, null, 2)}\n`);
  files.writeFile(path, contents, 0o600, true);
  files.sync(path);
  syncDirectory(files, Path.dirname(path));
}

function writeUpdatedJournal(
  files: GenerationTransactionFiles,
  path: string,
  journal: GenerationJournal,
  token: string,
): void {
  const current = files.inspect(path);
  if (current.kind !== "file") {
    throw new GenerationTransactionError("recovery_required", "Owned recovery journal is missing or no longer a regular file.", { path });
  }
  let prior: unknown;
  try {
    prior = JSON.parse(new TextDecoder().decode(current.contents));
  } catch {
    throw new GenerationTransactionError("recovery_required", "Owned recovery journal is malformed.", { path });
  }
  if (
    !prior || typeof prior !== "object" || Array.isArray(prior) ||
    (prior as Record<string, unknown>).owner_token !== token
  ) {
    throw new GenerationTransactionError("observed_drift", "Recovery journal ownership changed.", { path });
  }
  const temporary = `${path}.${token}.tmp`;
  if (files.inspect(temporary).kind !== "missing") {
    throw new GenerationTransactionError("path_conflict", "Owned recovery journal temporary path is occupied.", { path: temporary });
  }
  const nextContents = encoder.encode(`${JSON.stringify(journal, null, 2)}\n`);
  let installed = false;
  try {
    files.writeFile(temporary, nextContents, 0o600, true);
    files.sync(temporary);
    const recheck = files.inspect(path);
    if (
      recheck.kind !== "file" ||
      !hasJournalToken(recheck.contents, token)
    ) {
      throw new GenerationTransactionError("observed_drift", "Recovery journal changed before atomic update.", { path });
    }
    files.rename(temporary, path);
    installed = true;
    syncDirectory(files, Path.dirname(path));
  } catch (error) {
    const leftover = files.inspect(temporary);
    let cleanupWarning: string | undefined;
    if (!installed && leftover.kind === "file" && bytesEqual(leftover.contents, nextContents)) {
      try {
        files.unlink(temporary);
      } catch (cleanupError) {
        cleanupWarning = errorMessage(cleanupError);
      }
    } else if (!installed && leftover.kind !== "missing") {
      cleanupWarning = "Temporary journal path changed and was preserved.";
    }
    if (error instanceof GenerationTransactionError && !cleanupWarning) throw error;
    throw new GenerationTransactionError("interrupted", `Recovery journal update failed: ${errorMessage(error)}`, {
      path,
      ...(cleanupWarning ? { cleanupWarning } : {}),
    });
  }
}

function preimageEqual(left: GenerationPathPreimage, right: GenerationPathPreimage): boolean {
  if (left.kind !== right.kind || left.path !== right.path) return false;
  if (left.kind === "file" && right.kind === "file") {
    return left.digest === right.digest && left.contents_base64 === right.contents_base64;
  }
  if (left.kind === "symlink" && right.kind === "symlink") return left.target === right.target;
  return true;
}

function hasExactFile(files: GenerationTransactionFiles, path: string, contents: string): boolean {
  const state = files.inspect(path);
  return state.kind === "file" && new TextDecoder().decode(state.contents) === contents;
}

function hasClaimToken(contents: Uint8Array, token: string): boolean {
  try {
    const value = JSON.parse(new TextDecoder().decode(contents)) as Record<string, unknown>;
    return value.owner === "kepler-generation-transaction" && value.token === token;
  } catch {
    return false;
  }
}

function hasJournalToken(contents: Uint8Array, token: string): boolean {
  try {
    const value = JSON.parse(new TextDecoder().decode(contents)) as Record<string, unknown>;
    return value.owner === "kepler-generation-transaction" && value.owner_token === token;
  } catch {
    return false;
  }
}

function syncDirectory(files: GenerationTransactionFiles, path: string): void {
  files.sync(path);
}

function selectorTarget(generationId: string): string {
  return `generations/${generationId}`;
}

function activeLauncherTarget(layout: GenerationLayout): string {
  return Path.join(layout.selector, "bin", "kepler");
}

function driftError(
  files: GenerationTransactionFiles,
  path: string,
  recoveryJournalPath: string,
  effects: GenerationEffects,
): GenerationTransactionError {
  return new GenerationTransactionError(
    "observed_drift",
    `Observed filesystem state changed before the transaction effect: ${path}`,
    { path, recoveryJournalPath, effects, observed: snapshotPath(files, path) },
  );
}

function transactionError(
  code: GenerationTransactionErrorCode,
  message: string,
  recoveryJournalPath?: string,
  effects?: GenerationEffects,
  path?: string,
): GenerationTransactionError {
  return new GenerationTransactionError(code, message, {
    ...(path ? { path } : {}),
    ...(recoveryJournalPath ? { recoveryJournalPath } : {}),
    ...(effects ? { effects } : {}),
  });
}

function isNormalizedRelativePath(path: string): boolean {
  return path.length > 0 &&
    !Path.posix.isAbsolute(path) &&
    !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isStableVersion(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split(".").every((component) => Number.isSafeInteger(Number(component)));
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.from(left).equals(Buffer.from(right));
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT");
}

function isAlreadyExistsError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "EEXIST");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const encoder = new TextEncoder();
