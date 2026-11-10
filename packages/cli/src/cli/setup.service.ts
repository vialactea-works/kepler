import { randomUUID } from "node:crypto";
import * as Path from "node:path";
import * as Yaml from "yaml";
import {
  parseInstallationReceipt,
  serializeInstallationRecordV2,
  sha256Digest,
  type ContentDigest,
  type InstallationRecordV2,
  type ParsedInstallationReceipt,
} from "./installation-record.js";
import {
  parseResourceManifest,
  validateResourcePackage,
  type ResourcePackageSnapshot,
  type ValidatedResourcePackage,
} from "./release-resources.js";
import {
  validateBuildIdentityForRuntime,
  type RuntimeBuildIdentity,
} from "./build-identity.js";
import {
  validateTargetPackageFiles,
  type TargetPackageFile,
} from "./release-archive.js";
import {
  type GenerationCandidate,
  type GenerationDirectoryEntry,
  type GenerationFileState,
  type GenerationInstallMode,
  type GenerationLayout,
  type GenerationOwnerClaim,
  type GenerationTransaction,
  type GenerationTransactionFiles,
  type GenerationTransactionRoots,
  type GenerationTransactionError,
} from "./generation-transaction.js";
import {
  acquireGenerationOwnerClaim,
  assertNoPendingGenerationRecovery,
} from "./generation-transaction.js";
import {
  packageRegistrationEntryDigest,
  type PiPackageRegistrationPlan,
  type PiPackageTransfer,
  type PiRegistrationResult,
  type PiSettingsSnapshot,
  type PiSettingsTemporaryFileEvidence,
} from "./pi-settings-adapter.js";
import type { PiPreflightResult } from "./pi-preflight.js";

export const SETUP_OPERATION = Symbol.for("kepler.setup.operation");
export const SETUP_RUNTIME = Symbol.for("kepler.setup.runtime");
export const SETUP_FILES = Symbol.for("kepler.setup.files");
export const SETUP_BUNDLE_LOCATOR = Symbol.for("kepler.setup.bundle-locator");
export const SETUP_CLI_RELEASE = Symbol.for("kepler.setup.cli-release");
export const SETUP_PLATFORM = Symbol.for("kepler.setup.platform");

export interface SetupGlobalPaths {
  readonly home: string;
  readonly templates: string;
  readonly guidelines: string;
  readonly settings: string;
  readonly installationRecord: string;
}

export type SetupPathState = GenerationFileState;

export type SetupBundleLocator = () => string;

export interface SetupPlatform {
  readonly os: string;
  readonly arch: string;
}

export interface SetupOptions {
  readonly acceptNativeTransferDigest?: string;
}

interface SetupCandidateIdentity {
  readonly version: string;
  readonly source: RuntimeBuildIdentity["source"];
  readonly target: RuntimeBuildIdentity["target"];
  readonly resource_digest: ContentDigest;
}

export interface NativeTransferFile {
  readonly path: string;
  readonly name: string;
  readonly kind: "skill" | "agent";
  readonly digest: ContentDigest;
}

export interface NativeTransferPlan {
  readonly format_version: 1;
  readonly digest: ContentDigest;
  readonly candidate: SetupCandidateIdentity;
  readonly scope: {
    readonly id: "user";
    readonly agent_directory: string;
    readonly settings_path: string;
    readonly settings_digest: ContentDigest;
    readonly package_source: string;
  };
  readonly prior_registration: {
    readonly source: string;
    readonly package_index: number;
    readonly entry_digest: ContentDigest;
    readonly package_root: string;
    readonly package_manifest_digest: ContentDigest;
  };
  readonly conflicts: readonly NativeTransferFile[];
  readonly retained_content: readonly {
    readonly path: string;
    readonly digest: ContentDigest;
  }[];
  readonly operation: {
    readonly kind: "replace-package-entry" | "remove-conflicting-entry";
    readonly package_index: number;
    readonly from: string;
    readonly to: string;
  };
}

export interface SetupFiles {
  readBundle(bundleRoot: string): ResourcePackageSnapshot;
  globalPaths(): SetupGlobalPaths;
  distributionRoot(): string;
  stableLauncherPath(): string;
  buildIdentity(): RuntimeBuildIdentity | undefined;
  readExecutable(): Uint8Array;
  releaseManifest?(): Uint8Array | undefined;
  preflightPi(packageSource: string): PiPreflightResult;
  inspectPath(path: string): SetupPathState;
  listDirectory(path: string): readonly GenerationDirectoryEntry[];
  readPiSettingsSnapshot(settingsPath: string): PiSettingsSnapshot;
  planPiPackageRegistration(
    snapshot: PiSettingsSnapshot,
    packageSource: string,
    transfer?: PiPackageTransfer,
  ): PiPackageRegistrationPlan;
  registerPiPackage(
    snapshot: PiSettingsSnapshot,
    packageSource: string,
    transfer?: PiPackageTransfer,
    validateTransfer?: () => void,
  ): PiRegistrationResult;
  beginTransaction(input: {
    readonly roots: GenerationTransactionRoots;
    readonly candidate: GenerationCandidate;
    readonly mode: GenerationInstallMode;
  }): GenerationTransaction;
  readonly transactionFiles: GenerationTransactionFiles;
}

export class SetupFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly recovery: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SetupFailure";
  }
}

export interface SetupResult {
  readonly generation_id: string;
  readonly kepler_release: string;
  readonly installation_mode:
    | "first-install"
    | "legacy-transition"
    | "upgrade"
    | "no-op"
    | "repair";
  readonly resource_root: string;
  readonly selector: string;
  readonly package_source: string;
  readonly compatibility: { readonly check: "compatible" };
  readonly templates: readonly string[];
  readonly guidelines: readonly string[];
  readonly created_files: readonly string[];
  readonly updated_files: readonly string[];
  readonly pi_binding: {
    readonly host: PiPreflightResult["host"];
    readonly loader: PiPreflightResult["loader"];
    readonly registration: {
      readonly entry_digest: ContentDigest;
      readonly settings_digest: ContentDigest;
      readonly check: "matches";
    };
  };
  readonly native_transfer?: {
    readonly digest: ContentDigest;
    readonly source: string;
    readonly operation: NativeTransferPlan["operation"]["kind"];
  };
}

export interface Setup {
  setup(options?: SetupOptions): SetupResult;
}

interface PlannedSetup {
  readonly mode: SetupResult["installation_mode"];
  readonly transactionMode: GenerationInstallMode;
  readonly generationId: string;
  readonly registerPackage: boolean;
  readonly transfer?: NativeTransferPlan;
  readonly priorReceipt?: InstallationRecordV2;
}

const recoveryInstructions =
  "Inspect the retained generation journal and its exact preimages/effects. Reconcile only unchanged Kepler-owned state; do not delete or overwrite drifted user data before retrying.";
export class SetupService implements Setup {
  constructor(
    private readonly files: SetupFiles,
    private readonly bundleLocator: SetupBundleLocator,
    private readonly cliRelease: string,
    private readonly platform: SetupPlatform,
    private readonly generationId: () => string = randomUUID,
  ) {}

  setup(options: SetupOptions = {}): SetupResult {
    const bundleRoot = this.locateBundle();
    const resources = this.validateBundle(bundleRoot);
    const identity = this.resolveBuildIdentity(resources);
    let executable: Uint8Array;
    try {
      executable = this.files.readExecutable();
    } catch (error) {
      throw new SetupFailure(
        "setup_executable_unavailable",
        `Could not read the executing Kepler binary: ${errorMessage(error)}`,
        {},
        "Run setup from a complete selected Kepler package generation.",
      );
    }
    if (executable.byteLength === 0) {
      throw new SetupFailure(
        "setup_executable_unavailable",
        "The executing Kepler binary is empty.",
        {},
        "Run setup from a complete selected Kepler package generation.",
      );
    }
    const releaseManifest = this.validateTargetPackage(resources, identity, executable);

    const paths = this.resolveGlobalPaths();
    const roots: GenerationTransactionRoots = {
      distributionRoot: this.files.distributionRoot(),
      globalHome: paths.home,
      piAgentDirectory: "",
      stableLauncherPath: this.files.stableLauncherPath(),
    };
    const packageSource = Path.join(Path.resolve(roots.distributionRoot), "current");
    const preflight = this.preflight(packageSource);
    const resolvedRoots = { ...roots, piAgentDirectory: preflight.agentDirectory };
    const layout = this.layoutFor(resolvedRoots);
    const priorReceipt = this.readPriorReceipt(layout.installationRecord);
    const registrationCount = this.validateRegistrationContext(preflight, packageSource);
    const transfer = this.nativeTransferPlan(
      preflight,
      packageSource,
      resources,
      identity,
      options.acceptNativeTransferDigest,
    );
    const planned = this.planInstallation(
      layout,
      priorReceipt,
      preflight,
      packageSource,
      resources,
      identity,
      registrationCount,
      transfer,
    );

    const candidate: GenerationCandidate = {
      generationId: planned.generationId,
      buildIdentity: identity,
      resources,
      executable,
      releaseManifest,
    };
    if (planned.mode === "no-op") {
      return this.verifyReadOnlyNoOp(
        planned,
        resolvedRoots,
        layout,
        candidate,
        resources,
        identity,
        preflight,
        packageSource,
      );
    }
    const registrationPlan = planned.registerPackage
      ? this.planRegistration(
          preflight.settingsSnapshot,
          packageSource,
          transfer,
        )
      : undefined;
    const receipt = this.buildReceipt(
      identity,
      resources,
      planned.generationId,
      layout,
      preflight,
      packageSource,
    );
    const receiptContents = new TextEncoder().encode(serializeInstallationRecordV2(receipt));
    const transaction = this.beginTransaction(resolvedRoots, candidate, planned.transactionMode);
    let stageCompleted = false;
    let result: SetupResult | undefined;
    let failure: SetupFailure | undefined;
    let releaseIssue: { readonly error: unknown; readonly state?: "missing" | "replaced" } | undefined;

    try {
      transaction.stage();
      stageCompleted = true;
      let registration: PiRegistrationResult;
      if (planned.registerPackage) {
        if (!registrationPlan) {
          throw new SetupFailure(
            "setup_registration_plan_invalid",
            "The planned Pi registration has no exact settings update.",
            {},
            recoveryInstructions,
          );
        }
        transaction.expectPiSettings(registrationPlan.contents);
        registration = this.registerPackage(
          preflight.settingsSnapshot,
          packageSource,
          transfer,
          transfer
            ? () => this.verifyTransferPlanCurrent(transfer, packageSource, resources, identity)
            : undefined,
        );
        this.verifyRegistrationAfterWrite(
          preflight.settingsSnapshot.settingsPath,
          packageSource,
          registrationPlan,
          registration,
        );
      } else {
        registration = this.verifyExistingRegistration(
          preflight.settingsSnapshot,
          packageSource,
          preflight,
        );
      }

      transaction.activate();
      this.verifySelectedCandidate(transaction.layout, planned.generationId, candidate);
      const verifiedPreflight = this.preflight(packageSource);
      this.verifyExistingRegistration(
        verifiedPreflight.settingsSnapshot,
        packageSource,
        verifiedPreflight,
      );
      transaction.expectInstallationRecord(receiptContents);
      transaction.writeInstallationRecord(receiptContents);
      this.verifyWrittenReceipt(transaction.layout.installationRecord, receiptContents, receipt);
      transaction.finalizeJournal(receiptContents);
      result = this.result(
        planned,
        transaction.layout,
        resources,
        identity,
        preflight,
        packageSource,
        registration,
        transfer,
      );
    } catch (error) {
      let transactionError: GenerationTransactionError | undefined;
      if (stageCompleted) {
        try {
          transactionError = transaction.recordFailure(error);
        } catch (recoveryError) {
          failure = this.failureFrom(error, recoveryError, transaction);
        }
      }
      failure ??= this.failureFrom(error, transactionError, transaction);
    } finally {
      try {
        const released = transaction.release();
        if (released.state !== "released") {
          releaseIssue = {
            state: released.state,
            error: new Error(`Coordination claim release returned ${released.state}.`),
          };
        }
      } catch (error) {
        releaseIssue = { error };
      }
    }

    if (releaseIssue) {
      throw this.failureWithClaimRelease(
        releaseIssue.error,
        transaction.claim,
        transaction,
        failure,
        { generation_id: planned.generationId },
        releaseIssue.state,
      );
    }
    if (failure) throw failure;
    if (!result) {
      throw new SetupFailure(
        "setup_incomplete",
        "Setup ended without a verified selected generation and Pi registration.",
        { recovery_journal_path: transaction.recoveryJournalPath },
        recoveryInstructions,
      );
    }
    return result;
  }

  private locateBundle(): string {
    try {
      return this.bundleLocator();
    } catch (error) {
      if (error instanceof SetupFailure) throw error;
      throw new SetupFailure(
        "bundle_not_found",
        errorMessage(error),
        {},
        "Provide a complete selected Kepler package generation and retry setup.",
      );
    }
  }

  private validateBundle(bundleRoot: string): ValidatedResourcePackage {
    try {
      const validated = validateResourcePackage(
        this.files.readBundle(bundleRoot),
        this.cliRelease,
      );
      return validated;
    } catch (error) {
      throw new SetupFailure(
        "invalid_bundle",
        errorMessage(error),
        { bundle_root: bundleRoot },
        "Use a complete resource package whose inventory and digests match its selected Kepler release.",
      );
    }
  }

  private resolveBuildIdentity(resources: ValidatedResourcePackage): RuntimeBuildIdentity {
    let identity: RuntimeBuildIdentity | undefined;
    try {
      identity = this.files.buildIdentity();
    } catch (error) {
      throw new SetupFailure(
        "build_identity_invalid",
        `The executing Kepler build identity is invalid: ${errorMessage(error)}`,
        {},
        "Run setup from a complete selected Kepler package generation.",
      );
    }
    if (!identity) {
      throw new SetupFailure(
        "build_identity_missing",
        "The executing Kepler binary does not declare a package build identity.",
        {},
        "Use an identifiable Kepler package candidate; setup does not fall back to the source checkout or current directory.",
      );
    }
    try {
      validateBuildIdentityForRuntime(identity, {
        release: this.cliRelease,
        platform: this.platform.os as NodeJS.Platform,
        arch: this.platform.arch,
      });
    } catch (error) {
      throw new SetupFailure(
        "build_identity_mismatch",
        errorMessage(error),
        { build_identity: identity },
        "Run setup from the package generation matching this executable and host target.",
      );
    }
    if (identity.resource_digest !== resources.manifest.resource_digest) {
      throw new SetupFailure(
        "build_identity_mismatch",
        "The executing Kepler binary resource digest does not match its selected resource package.",
        {
          expected_resource_digest: identity.resource_digest,
          actual_resource_digest: resources.manifest.resource_digest,
        },
        "Use a complete package generation built with matching resources.",
      );
    }
    return identity;
  }

  private validateTargetPackage(
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
    executable: Uint8Array,
  ): Uint8Array {
    const releaseManifest = this.files.releaseManifest?.();
    const packageDescriptor = resources.files.find((file) => file.path === "pi-package.json");
    if (!releaseManifest || !packageDescriptor) {
      throw new SetupFailure(
        "target_package_invalid",
        "The executing Kepler package is missing its complete release manifest or package descriptor.",
        {},
        "Use a complete validated target archive and retry setup.",
      );
    }
    const packageFiles = [
      { path: "bin/kepler", contents: executable, executable: true },
      {
        path: "bundle/manifest.json",
        contents: new TextEncoder().encode(`${JSON.stringify(resources.manifest, null, 2)}\n`),
      },
      ...resources.files.map((file) => ({ path: `bundle/${file.path}`, contents: file.contents })),
      { path: "package.json", contents: packageDescriptor.contents },
      { path: "release-manifest.json", contents: releaseManifest },
    ];
    try {
      validateTargetPackageFiles(packageFiles, {
        expectedVersion: this.cliRelease,
        expectedIdentity: identity,
      });
      return new Uint8Array(releaseManifest);
    } catch (error) {
      throw new SetupFailure(
        "target_package_invalid",
        `The executing Kepler package inventory does not match its compiled identity: ${errorMessage(error)}`,
        {},
        "Use a complete target archive whose manifest, binary, resources, and root inventory agree.",
      );
    }
  }

  private resolveGlobalPaths(): SetupGlobalPaths {
    try {
      return this.files.globalPaths();
    } catch (error) {
      throw new SetupFailure(
        "global_home_unavailable",
        `Failed to resolve Kepler global paths: ${errorMessage(error)}`,
        {},
        "Resolve the Kepler global home path before retrying setup.",
      );
    }
  }

  private preflight(packageSource: string): PiPreflightResult {
    try {
      return this.files.preflightPi(packageSource);
    } catch (error) {
      if (error instanceof SetupFailure) throw error;
      const code = isPiPreflightError(error) ? error.code : "pi_preflight_failed";
      throw new SetupFailure(
        code,
        errorMessage(error),
        isPiPreflightError(error) ? error.details : {},
        "Resolve the reported Pi host, loader, settings, or visible resource conflict before setup; no managed installation effects were made.",
      );
    }
  }

  private layoutFor(roots: GenerationTransactionRoots): GenerationLayout {
    const distributionRoot = Path.resolve(roots.distributionRoot);
    return {
      distributionRoot,
      generationsDirectory: Path.join(distributionRoot, "generations"),
      selector: Path.join(distributionRoot, "current"),
      transactionsDirectory: Path.join(distributionRoot, "transactions"),
      ownerClaim: Path.join(distributionRoot, ".kepler-installation-owner"),
      globalHome: Path.resolve(roots.globalHome),
      installationRecord: Path.join(Path.resolve(roots.globalHome), "installation.json"),
      piAgentDirectory: Path.resolve(roots.piAgentDirectory),
      piSettings: Path.join(Path.resolve(roots.piAgentDirectory), "settings.json"),
      stableLauncherPath: Path.resolve(roots.stableLauncherPath),
      legacyLauncherPath: Path.join(distributionRoot, "bin", "kepler"),
    };
  }

  private readPriorReceipt(path: string): ParsedInstallationReceipt | undefined {
    const state = this.files.inspectPath(path);
    if (state.kind === "missing") return undefined;
    if (state.kind !== "file") {
      throw new SetupFailure(
        "installation_record_conflict",
        "The installation receipt path is not a regular file.",
        { path, kind: state.kind },
        "Preserve the existing path and resolve the conflict before setup.",
      );
    }
    try {
      return parseInstallationReceipt(new TextDecoder().decode(state.contents));
    } catch (error) {
      throw new SetupFailure(
        "installation_record_invalid",
        `The existing installation receipt is invalid: ${errorMessage(error)}`,
        { path },
        "Preserve the existing receipt and resolve its format or contents before setup.",
      );
    }
  }

  private nativeTransferPlan(
    preflight: PiPreflightResult,
    packageSource: string,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
    consent?: string,
  ): NativeTransferPlan | undefined {
    if (preflight.conflicts.length === 0) {
      if (consent !== undefined) {
        throw new SetupFailure(
          "native_transfer_stale",
          "Native transfer consent no longer matches the current conflict set; setup made no installation changes.",
          { accepted_digest: consent, current_plan: null },
          "Re-run setup without consent and review any current transfer proposal.",
        );
      }
      return undefined;
    }

    const plan = this.createNativeTransferPlan(preflight, packageSource, resources, identity);
    if (!plan) {
      throw new SetupFailure(
        "pi_resource_conflict",
        "Setup found visible Pi resources it cannot safely transfer. User, project, unknown, modified-shape, and mixed package resources remain untouched.",
        { conflicts: preflight.conflicts },
        "Resolve each conflict explicitly without deleting or overwriting custom resources.",
      );
    }
    if (consent === undefined) {
      throw new SetupFailure(
        "native_transfer_confirmation_required",
        "Setup found a transferable Pi package conflict. Review the exact plan and accept only its current digest.",
        {
          native_transfer_plan: plan,
          command: `kepler setup --accept-native-transfer ${plan.digest}`,
        },
        "No candidate, selector, receipt, or Pi settings were changed; repeat with the exact accepted digest only after reviewing this plan.",
      );
    }
    if (consent !== plan.digest) {
      throw new SetupFailure(
        "native_transfer_stale",
        "Native transfer consent is stale or does not match the current package, settings, and resource digests.",
        {
          accepted_digest: consent,
          native_transfer_plan: plan,
          current_digest: plan.digest,
        },
        "Review the current transfer plan and retry only with its exact digest.",
      );
    }
    return plan;
  }

  private createNativeTransferPlan(
    preflight: PiPreflightResult,
    packageSource: string,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
  ): NativeTransferPlan | undefined {
    const conflicts = preflight.conflicts;
    if (conflicts.some((conflict) => conflict.scope !== "user" || !conflict.source || !conflict.package_root)) {
      return undefined;
    }
    const sources = new Set(conflicts.map((conflict) => conflict.source));
    const roots = new Set(conflicts.map((conflict) => conflict.package_root));
    if (sources.size !== 1 || roots.size !== 1) return undefined;
    const source = [...sources][0];
    const packageRoot = [...roots][0];
    if (!source || !packageRoot || !Path.isAbsolute(packageRoot)) return undefined;
    const packages = preflight.settingsSnapshot.packages;
    const packageIndexes = packages.flatMap((entry, index) =>
      packageEntrySource(entry) === source ? [index] : [],
    );
    if (packageIndexes.length !== 1) return undefined;
    const packageIndex = packageIndexes[0];
    if (packageIndex === undefined || typeof packages[packageIndex] !== "string") return undefined;
    const stableIndexes = packages.flatMap((entry, index) =>
      packageEntrySource(entry) === packageSource ? [index] : [],
    );
    if (stableIndexes.length > 1) return undefined;
    const transferOperation: PiPackageTransfer["operation"] = stableIndexes.length === 0
      ? "replace"
      : "remove";
    const transferFiles = this.inspectTransferPackage(packageRoot, resources);
    if (!transferFiles) return undefined;
    const transferPaths = new Set(transferFiles.conflicts.map((file) => file.path));
    const expectedPaths = new Set(conflicts.map((conflict) => conflict.path));
    if (
      transferPaths.size !== expectedPaths.size ||
      [...transferPaths].some((path) => !expectedPaths.has(path))
    ) return undefined;

    const candidate: SetupCandidateIdentity = {
      version: identity.kepler_release,
      source: identity.source,
      target: identity.target,
      resource_digest: identity.resource_digest,
    };
    const priorEntry = packages[packageIndex];
    const operation: NativeTransferPlan["operation"] = {
      kind: transferOperation === "replace" ? "replace-package-entry" : "remove-conflicting-entry",
      package_index: packageIndex,
      from: source,
      to: transferOperation === "replace" ? packageSource : packageSource,
    };
    const base = {
      format_version: 1 as const,
      candidate,
      scope: {
        id: "user" as const,
        agent_directory: preflight.agentDirectory,
        settings_path: preflight.settingsPath,
        settings_digest: preflight.settingsSnapshot.contentDigest,
        package_source: packageSource,
      },
      prior_registration: {
        source,
        package_index: packageIndex,
        entry_digest: sha256Digest(canonicalJson(priorEntry)),
        package_root: packageRoot,
        package_manifest_digest: transferFiles.manifestDigest,
      },
      conflicts: transferFiles.conflicts,
      retained_content: transferFiles.retainedContent,
      operation,
    };
    return {
      ...base,
      digest: sha256Digest(canonicalJson(base)),
    };
  }

  private inspectTransferPackage(
    packageRoot: string,
    resources: ValidatedResourcePackage,
  ): {
    readonly manifestDigest: ContentDigest;
    readonly conflicts: readonly NativeTransferFile[];
    readonly retainedContent: readonly { readonly path: string; readonly digest: ContentDigest }[];
  } | undefined {
    const rootState = this.files.inspectPath(packageRoot);
    if (rootState.kind !== "directory") return undefined;
    const manifestPath = Path.join(packageRoot, "package.json");
    const manifestState = this.files.inspectPath(manifestPath);
    if (manifestState.kind !== "file") return undefined;
    let packageManifest: Record<string, unknown>;
    try {
      packageManifest = parseJsonObject(new TextDecoder().decode(manifestState.contents));
    } catch {
      return undefined;
    }
    if (!isTransferPackageManifest(packageManifest)) return undefined;
    const pi = asObject(packageManifest.pi);
    const subagents = asObject(pi?.subagents);
    const roots: Array<{ readonly path: string; readonly kind: "skill" | "agent" }> = [];
    for (const path of stringArray(pi?.skills) ?? []) roots.push({ path, kind: "skill" });
    for (const path of stringArray(subagents?.agents) ?? []) roots.push({ path, kind: "agent" });
    if (roots.length === 0 || roots.some(({ path }) => !isTransferResourceRoot(path))) return undefined;

    const expectedSkills = new Set(resources.manifest.skills.map(({ id }) => id));
    const expectedAgents = new Set(resources.manifest.pi_agents.map(({ agent_id }) => agent_id));
    const conflicts: NativeTransferFile[] = [];
    const retainedContent: Array<{ path: string; digest: ContentDigest }> = [
      { path: manifestPath, digest: sha256Digest(manifestState.contents) },
    ];
    const seenPaths = new Set<string>();
    const seenNames = new Set<string>();
    for (const resourceRoot of roots) {
      const absoluteRoot = Path.resolve(packageRoot, resourceRoot.path);
      if (!isPathWithin(packageRoot, absoluteRoot)) return undefined;
      const rootState = this.files.inspectPath(absoluteRoot);
      if (rootState.kind !== "directory") return undefined;
      const files = this.listProfileFiles(absoluteRoot, resourceRoot.kind);
      if (!files) return undefined;
      for (const path of files) {
        const state = this.files.inspectPath(path);
        if (state.kind !== "file") return undefined;
        const name = profileName(new TextDecoder().decode(state.contents));
        const validName = resourceRoot.kind === "skill"
          ? expectedSkills.has(name ?? "")
          : expectedAgents.has(name ?? "");
        if (!name || !validName || seenNames.has(`${resourceRoot.kind}:${name}`) || seenPaths.has(path)) {
          return undefined;
        }
        seenNames.add(`${resourceRoot.kind}:${name}`);
        seenPaths.add(path);
        const digest = sha256Digest(state.contents);
        const relative = Path.relative(packageRoot, path).split(Path.sep).join("/");
        conflicts.push({ path, name, kind: resourceRoot.kind, digest });
        retainedContent.push({ path: relative, digest });
      }
    }
    const conflictByPath = new Set(conflicts.map((file) => file.path));
    if (
      conflicts.length !== new Set(conflicts.map((file) => `${file.kind}:${file.name}`)).size ||
      conflictByPath.size !== conflicts.length
    ) return undefined;
    return {
      manifestDigest: sha256Digest(manifestState.contents),
      conflicts: conflicts.sort((left, right) => left.path.localeCompare(right.path)),
      retainedContent: retainedContent.sort((left, right) => left.path.localeCompare(right.path)),
    };
  }

  private listProfileFiles(
    root: string,
    kind: "skill" | "agent",
  ): string[] | undefined {
    const found: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
      const directory = pending.pop();
      if (!directory) continue;
      let entries: readonly GenerationDirectoryEntry[];
      try {
        entries = this.files.listDirectory(directory);
      } catch {
        return undefined;
      }
      for (const entry of entries) {
        const path = Path.join(directory, entry.name);
        if (entry.kind === "symlink" || entry.kind === "special") return undefined;
        if (entry.kind === "directory") {
          pending.push(path);
        } else if (
          (kind === "skill" && entry.name === "SKILL.md") ||
          (kind === "agent" && entry.name.endsWith(".md") && !entry.name.endsWith(".chain.md"))
        ) {
          found.push(path);
        }
      }
    }
    return found.sort((left, right) => left.localeCompare(right));
  }

  private verifyReadOnlyNoOp(
    planned: PlannedSetup,
    roots: GenerationTransactionRoots,
    layout: GenerationLayout,
    candidate: GenerationCandidate,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
    initialPreflight: PiPreflightResult,
    packageSource: string,
  ): SetupResult {
    const receipt = planned.priorReceipt;
    if (!receipt) {
      throw new SetupFailure(
        "setup_noop_invalid",
        "A read-only no-op requires its exact version-2 receipt.",
        { generation_id: planned.generationId },
        recoveryInstructions,
      );
    }
    const receiptBytes = this.readReceiptBytes(layout.installationRecord, planned.generationId);
    const claim = (() => {
      try {
        return acquireGenerationOwnerClaim({
          distributionRoot: roots.distributionRoot,
          files: this.files.transactionFiles,
        });
      } catch (error) {
        throw this.failureFrom(error);
      }
    })();
    let result: SetupResult | undefined;
    let operationFailure: unknown;
    try {
      try {
        assertNoPendingGenerationRecovery(this.files.transactionFiles, layout.transactionsDirectory);
      } catch (error) {
        throw this.failureFrom(error);
      }
      const current = this.preflight(packageSource);
      if (
        current.settingsPath !== initialPreflight.settingsPath ||
        current.agentDirectory !== initialPreflight.agentDirectory ||
        current.settingsSnapshot.contentDigest !== initialPreflight.settingsSnapshot.contentDigest ||
        current.host.release !== initialPreflight.host.release ||
        current.loader.release !== initialPreflight.loader.release ||
        current.conflicts.length !== 0
      ) {
        throw new SetupFailure(
          "setup_state_drift",
          "The verified no-op state changed during setup planning; no installation files were written.",
          {
            settings_path: current.settingsPath,
            settings_digest: current.settingsSnapshot.contentDigest,
            conflict_count: current.conflicts.length,
          },
          "Re-run setup to obtain a current plan; resolve any newly visible Pi resource conflict first.",
        );
      }
      const currentReceipt = this.files.inspectPath(layout.installationRecord);
      if (currentReceipt.kind !== "file" || !bytesEqual(currentReceipt.contents, receiptBytes)) {
        throw new SetupFailure(
          "setup_state_drift",
          "The version-2 receipt changed during no-op verification; setup made no installation changes.",
          { installation_record: layout.installationRecord, state: currentReceipt.kind },
          recoveryInstructions,
        );
      }
      this.verifyReceiptLocation(receipt, layout, current, packageSource);
      this.verifyReceiptGeneration(layout, receipt);
      this.verifySelectedCandidate(layout, planned.generationId, candidate);
      this.verifyWrittenReceipt(layout.installationRecord, receiptBytes, receipt);
      const final = this.preflight(packageSource);
      if (
        final.settingsPath !== current.settingsPath ||
        final.agentDirectory !== current.agentDirectory ||
        final.settingsSnapshot.contentDigest !== current.settingsSnapshot.contentDigest ||
        final.host.release !== current.host.release ||
        final.loader.release !== current.loader.release ||
        final.conflicts.length !== 0
      ) {
        throw new SetupFailure(
          "setup_state_drift",
          "The read-only setup state changed during final verification; no installation files were written.",
          {
            settings_path: final.settingsPath,
            settings_digest: final.settingsSnapshot.contentDigest,
            conflict_count: final.conflicts.length,
          },
          "Re-run setup to obtain a current plan; resolve any newly visible Pi resource conflict first.",
        );
      }
      this.verifyReceiptLocation(receipt, layout, final, packageSource);
      const registration = this.verifyExistingRegistration(final.settingsSnapshot, packageSource, final);
      result = this.result(
        planned,
        layout,
        resources,
        identity,
        final,
        packageSource,
        registration,
      );
    } catch (error) {
      operationFailure = error;
    }
    let releaseIssue: { readonly error: unknown; readonly state?: "missing" | "replaced" } | undefined;
    try {
      const released = claim.release();
      if (released.state !== "released") {
        releaseIssue = {
          state: released.state,
          error: new Error(`Read-only coordination claim release returned ${released.state}.`),
        };
      }
    } catch (error) {
      releaseIssue = { error };
    }
    if (releaseIssue) {
      throw this.failureWithClaimRelease(
        releaseIssue.error,
        claim,
        undefined,
        operationFailure,
        {
          generation_id: planned.generationId,
          operation_mode: "no-op",
          journal_evidence: {
            transactions_directory: layout.transactionsDirectory,
            created_by_no_op: false,
          },
          operation_effects: {
            candidate: "unchanged",
            bootstrap: "unchanged",
            selector: "unchanged",
            stable_launcher: "unchanged",
            pi_settings: "unchanged",
            installation_record: "unchanged",
          },
        },
        releaseIssue.state,
      );
    }
    if (operationFailure) throw operationFailure;
    if (!result) {
      throw new SetupFailure(
        "setup_noop_incomplete",
        "Read-only setup verification ended without a verified result.",
        { generation_id: planned.generationId },
        recoveryInstructions,
      );
    }
    return result;
  }

  private planInstallation(
    layout: GenerationLayout,
    prior: ParsedInstallationReceipt | undefined,
    preflight: PiPreflightResult,
    packageSource: string,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
    registrationCount: number,
    transfer?: NativeTransferPlan,
  ): PlannedSetup {
    const selector = this.files.inspectPath(layout.selector);
    const launcher = this.files.inspectPath(layout.stableLauncherPath);
    const oldFlat = this.files.inspectPath(layout.legacyLauncherPath);
    if (!prior) {
      if (selector.kind !== "missing") {
        throw stateConflict("A selector exists without a trusted version-2 receipt.", layout.selector, selector.kind);
      }
      if (oldFlat.kind === "file" || isLegacyLauncher(launcher, layout) || registrationCount > 0) {
        throw new SetupFailure(
          "legacy_installation_unverified",
          "Legacy distribution or Pi registration state exists without its version-1 receipt; setup will not adopt it.",
          { selector, launcher, legacy_binary: oldFlat.kind, package_source: packageSource },
          "Preserve the existing installation and obtain its authentic receipt before a transition.",
        );
      }
      return {
        mode: "first-install",
        transactionMode: { kind: "first-install" },
        generationId: this.newGenerationId(),
        registerPackage: true,
        ...(transfer ? { transfer } : {}),
      };
    }

    if (prior.kind === "legacy-v1") {
      if (selector.kind !== "missing" || oldFlat.kind !== "file" ||
        (launcher.kind !== "missing" && !isLegacyLauncher(launcher, layout))) {
        throw new SetupFailure(
          "legacy_transition_conflict",
          "Version-1 transition requires an absent selector, a preserved flat Kepler binary, and an absent or exact known legacy launcher.",
          { selector, launcher, legacy_binary: oldFlat.kind },
          "Preserve the version-1 receipt, flat installation, and all custom data while resolving these conflicts.",
        );
      }
      if (registrationCount > 0) {
        throw new SetupFailure(
          "native_registration_unowned",
          "A stable Kepler package source is already registered but no version-2 receipt proves ownership.",
          { package_source: packageSource },
          "Review and reconcile the existing registration; version-1 native fields do not authorize it.",
        );
      }
      return {
        mode: "legacy-transition",
        transactionMode: { kind: "first-install" },
        generationId: this.newGenerationId(),
        registerPackage: true,
        ...(transfer ? { transfer } : {}),
      };
    }

    const receipt = prior.record;
    this.verifyReceiptLocation(receipt, layout, preflight, packageSource);
    if (
      selector.kind !== "symlink" ||
      selector.target !== `generations/${receipt.generation_id}` ||
      launcher.kind !== "symlink" ||
      launcher.target !== Path.join(layout.selector, "bin", "kepler")
    ) {
      throw new SetupFailure(
        "setup_selector_conflict",
        "The selected generation, stable launcher, and version-2 receipt disagree; setup will not fall back or repair unknown state.",
        { selector, launcher, receipt_generation_id: receipt.generation_id },
        recoveryInstructions,
      );
    }
    this.verifyReceiptGeneration(layout, receipt);
    const sameCandidate = sameBuildIdentity(receipt, identity) &&
      receipt.resources.manifest_digest === resources.manifest.resource_digest &&
      sameDigestMap(receipt.resources.files, resources.manifest.files);
    if (receipt.pi_binding.registration.check === "mismatch" ||
      receipt.pi_binding.registration.check === "not_checked") {
      throw new SetupFailure(
        "setup_registration_unverified",
        "The version-2 receipt does not contain authoritative Pi registration evidence.",
        { registration_check: receipt.pi_binding.registration.check },
        "Reconcile the recorded native owner before setup; unknown registrations are not adopted.",
      );
    }
    if (registrationCount > 1) {
      throw new SetupFailure(
        "setup_registration_conflict",
        "Pi settings contain duplicate registrations for the stable Kepler package source.",
        { package_source: packageSource, registration_count: registrationCount },
        "Preserve the current settings and resolve the duplicate registration explicitly.",
      );
    }

    if (sameCandidate) {
      if (registrationCount === 1) {
        const receiptChecks = [
          receipt.pi_binding.registration.check,
          ...receipt.pi_binding.skills.map(({ check }) => check),
          ...receipt.pi_binding.roles.map(({ check }) => check),
        ];
        const bindingReleasesMatch =
          receipt.pi_binding.host.release === preflight.host.release &&
          receipt.pi_binding.loader.release === preflight.loader.release;
        const noOp = !transfer &&
          bindingReleasesMatch &&
          receipt.compatibility.check === "compatible" &&
          receiptChecks.every((check) => check === "matches");
        return {
          mode: noOp ? "no-op" : "repair",
          transactionMode: { kind: "repair", generationId: receipt.generation_id },
          generationId: receipt.generation_id,
          registerPackage: transfer !== undefined,
          ...(transfer ? { transfer } : {}),
          priorReceipt: receipt,
        };
      }
      if (
        registrationCount === 0 &&
        receipt.pi_binding.registration.entry_digest === packageRegistrationEntryDigest(packageSource) &&
        (receipt.pi_binding.registration.check === "missing" || receipt.pi_binding.registration.check === "matches") &&
        (transfer === undefined || transfer.operation.kind === "replace-package-entry")
      ) {
        return {
          mode: "repair",
          transactionMode: { kind: "repair", generationId: receipt.generation_id },
          generationId: receipt.generation_id,
          registerPackage: true,
          ...(transfer ? { transfer } : {}),
          priorReceipt: receipt,
        };
      }
    }

    if ((registrationCount !== 1 && !transfer) || (registrationCount > 1)) {
      throw new SetupFailure(
        "setup_registration_conflict",
        "A version-2 upgrade requires its known stable Pi registration or a currently accepted exact transfer.",
        { package_source: packageSource, registration_count: registrationCount, native_transfer_plan: transfer ?? null },
        "Repair the verified selected generation first or resolve the explicit native conflict.",
      );
    }
    return {
      mode: "upgrade",
      transactionMode: { kind: "upgrade", previousGenerationId: receipt.generation_id },
      generationId: this.newGenerationId(),
      registerPackage: transfer !== undefined,
      ...(transfer ? { transfer } : {}),
      priorReceipt: receipt,
    };
  }

  private verifyReceiptLocation(
    receipt: InstallationRecordV2,
    layout: GenerationLayout,
    preflight: PiPreflightResult,
    packageSource: string,
  ): void {
    if (
      receipt.selector.path !== layout.selector ||
      receipt.selector.generation_id !== receipt.generation_id ||
      receipt.pi_binding.scope !== "user" ||
      receipt.pi_binding.agent_directory !== preflight.agentDirectory ||
      receipt.pi_binding.settings_path !== preflight.settingsPath ||
      receipt.pi_binding.package_source !== packageSource ||
      receipt.pi_binding.registration.entry_digest !== packageRegistrationEntryDigest(packageSource) ||
      receipt.pi_binding.host.id !== "pi" ||
      receipt.pi_binding.loader.id !== "pi-subagents" ||
      receipt.pi_binding.host.check !== "matches" ||
      receipt.pi_binding.loader.check !== "matches"
    ) {
      throw new SetupFailure(
        "installation_record_conflict",
        "The version-2 receipt is bound to a different selector or Pi user configuration.",
        { generation_id: receipt.generation_id, selector: receipt.selector, pi_binding: receipt.pi_binding },
        "Preserve the existing receipt and settings and resolve the ownership mismatch explicitly.",
      );
    }
    const checks = [
      ...receipt.pi_binding.skills.map(({ check }) => check),
      ...receipt.pi_binding.roles.map(({ check }) => check),
    ];
    if (checks.some((check) => check === "mismatch" || check === "not_checked")) {
      throw new SetupFailure(
        "installation_record_conflict",
        "The receipt contains unknown or mismatching Pi resource checks and cannot authorize repair.",
        { resource_checks: checks },
        "Reconcile the recorded native resources before retrying setup.",
      );
    }
  }

  private verifyReceiptGeneration(layout: GenerationLayout, receipt: InstallationRecordV2): void {
    const generationRoot = Path.join(layout.generationsDirectory, receipt.generation_id);
    const expectedIdentity: RuntimeBuildIdentity = {
      format_version: 1,
      kepler_release: receipt.release.version,
      source: receipt.release.source,
      target: receipt.release.target,
      resource_digest: receipt.resources.manifest_digest,
    };
    let resources: ValidatedResourcePackage;
    try {
      resources = this.readGenerationResources(generationRoot, expectedIdentity);
      this.verifyGenerationTree(generationRoot, resources);
    } catch (error) {
      throw new SetupFailure(
        "selected_generation_invalid",
        `The receipt-selected generation is incomplete or corrupt: ${errorMessage(error)}`,
        { generation_id: receipt.generation_id, generation_root: generationRoot },
        recoveryInstructions,
      );
    }
    if (
      resources.manifest.resource_digest !== receipt.resources.manifest_digest ||
      !sameDigestMap(resources.manifest.files, receipt.resources.files) ||
      resources.manifest.kepler_release !== receipt.release.version ||
      !sameResourceBindings(
        receipt.pi_binding.skills,
        resources.manifest.skills.map(({ id, digest }) => ({ id, digest })),
      ) ||
      !sameRoleBindings(
        receipt.pi_binding.roles,
        resources.manifest.pi_agents.map(({ role, agent_id, digest }) => ({ role, agent_id, digest })),
      )
    ) {
      throw new SetupFailure(
        "selected_generation_mismatch",
        "The selected resource generation does not match the version-2 receipt inventory.",
        {
          generation_id: receipt.generation_id,
          manifest_digest: resources.manifest.resource_digest,
          resource_digest_matches: resources.manifest.resource_digest === receipt.resources.manifest_digest,
          file_inventory_matches: sameDigestMap(resources.manifest.files, receipt.resources.files),
          skill_bindings_match: sameResourceBindings(
            receipt.pi_binding.skills,
            resources.manifest.skills.map(({ id, digest }) => ({ id, digest })),
          ),
          role_bindings_match: sameRoleBindings(
            receipt.pi_binding.roles,
            resources.manifest.pi_agents.map(({ role, agent_id, digest }) => ({ role, agent_id, digest })),
          ),
        },
        recoveryInstructions,
      );
    }
  }

  private readGenerationResources(root: string, expectedIdentity: RuntimeBuildIdentity): ValidatedResourcePackage {
    const rootState = this.files.inspectPath(root);
    if (rootState.kind !== "directory") throw new Error("generation root is not a regular directory");
    this.walkGenerationTree(root);
    const manifestPath = Path.join(root, "bundle", "manifest.json");
    const manifestState = this.files.inspectPath(manifestPath);
    if (manifestState.kind !== "file") throw new Error("generation manifest is not a regular file");
    const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestState.contents);
    const manifest = parseResourceManifest(manifestText);
    const installedModes = new Map<string, number>([["bundle/manifest.json", manifestState.mode]]);
    const files = Object.keys(manifest.files).sort(compareStrings).map((relativePath) => {
      const state = this.files.inspectPath(Path.join(root, "bundle", ...relativePath.split("/")));
      if (state.kind !== "file") throw new Error(`generation resource is not a regular file: ${relativePath}`);
      installedModes.set(`bundle/${relativePath}`, state.mode);
      return { path: relativePath, contents: state.contents };
    });
    const validated = validateResourcePackage({ manifest: manifestText, files }, expectedIdentity.kepler_release);
    const packageDescriptor = this.files.inspectPath(Path.join(root, "package.json"));
    const bundledDescriptor = validated.files.find((file) => file.path === "pi-package.json");
    if (
      packageDescriptor.kind !== "file" ||
      !bundledDescriptor ||
      !bytesEqual(packageDescriptor.contents, bundledDescriptor.contents)
    ) {
      throw new Error("generation package descriptor differs from the resource inventory");
    }
    const executable = this.files.inspectPath(Path.join(root, "bin", "kepler"));
    if (executable.kind !== "file" || executable.contents.byteLength === 0) {
      throw new Error("generation executable is missing or empty");
    }
    const releaseManifest = this.files.inspectPath(Path.join(root, "release-manifest.json"));
    if (releaseManifest.kind !== "file") throw new Error("generation target manifest is not a regular file");
    installedModes.set("bin/kepler", executable.mode);
    installedModes.set("package.json", packageDescriptor.mode);
    installedModes.set("release-manifest.json", releaseManifest.mode);
    const packageFiles: TargetPackageFile[] = [
      { path: "bin/kepler", contents: executable.contents, executable: (executable.mode & 0o111) !== 0 },
      {
        path: "bundle/manifest.json",
        contents: manifestState.contents,
        executable: (manifestState.mode & 0o111) !== 0,
      },
      ...validated.files.map((file) => ({
        path: `bundle/${file.path}`,
        contents: file.contents,
        executable: ((installedModes.get(`bundle/${file.path}`) ?? 0) & 0o111) !== 0,
      })),
      {
        path: "package.json",
        contents: packageDescriptor.contents,
        executable: (packageDescriptor.mode & 0o111) !== 0,
      },
      {
        path: "release-manifest.json",
        contents: releaseManifest.contents,
        executable: (releaseManifest.mode & 0o111) !== 0,
      },
    ];
    validateTargetPackageFiles(
      packageFiles,
      { expectedVersion: expectedIdentity.kepler_release, expectedIdentity },
      installedModes,
      "installed",
    );
    return validated;
  }

  private verifyGenerationTree(root: string, resources: ValidatedResourcePackage): void {
    const expected = new Set([
      "bin/kepler",
      "bundle/manifest.json",
      "package.json",
      "release-manifest.json",
      ...resources.files.map(({ path }) => `bundle/${path}`),
    ]);
    const actual = this.walkGenerationTree(root);
    if (
      actual.length !== expected.size ||
      actual.some((path) => !expected.has(path))
    ) {
      throw new Error("generation contains missing or unexpected files");
    }
  }

  private walkGenerationTree(root: string): string[] {
    const found: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
      const directory = pending.pop();
      if (!directory) continue;
      const entries = this.files.listDirectory(directory);
      for (const entry of entries) {
        if (entry.kind === "symlink" || entry.kind === "special") {
          throw new Error(`generation contains an unsafe path: ${Path.join(directory, entry.name)}`);
        }
        const path = Path.join(directory, entry.name);
        if (entry.kind === "directory") pending.push(path);
        else found.push(Path.relative(root, path).split(Path.sep).join("/"));
      }
    }
    return found.sort((left, right) => left.localeCompare(right));
  }

  private readReceiptBytes(path: string, generationId: string): Uint8Array {
    const state = this.files.inspectPath(path);
    if (state.kind !== "file") {
      throw stateConflict("The version-2 receipt changed before no-op verification.", path, state.kind);
    }
    const parsed = parseInstallationReceipt(new TextDecoder().decode(state.contents));
    if (parsed.kind !== "current-v2" || parsed.record.generation_id !== generationId) {
      throw stateConflict("The version-2 receipt changed before no-op verification.", path, state.kind);
    }
    return state.contents;
  }

  private verifyCandidateInSelected(
    layout: GenerationLayout,
    generationId: string,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
  ): void {
    const selected = this.readGenerationResources(
      Path.join(layout.generationsDirectory, generationId),
      identity,
    );
    if (
      selected.manifest.resource_digest !== resources.manifest.resource_digest ||
      !sameDigestMap(selected.manifest.files, resources.manifest.files)
    ) {
      throw new SetupFailure(
        "selected_generation_mismatch",
        "The currently selected generation differs from the executing candidate; setup will not fall back to another package.",
        { generation_id: generationId },
        recoveryInstructions,
      );
    }
    this.verifyGenerationTree(Path.join(layout.generationsDirectory, generationId), selected);
  }

  private buildReceipt(
    identity: RuntimeBuildIdentity,
    resources: ValidatedResourcePackage,
    generationId: string,
    layout: GenerationLayout,
    preflight: PiPreflightResult,
    packageSource: string,
  ): InstallationRecordV2 {
    return {
      format_version: 2,
      generation_id: generationId,
      release: {
        version: identity.kepler_release,
        source: identity.source,
        target: identity.target,
      },
      resources: {
        manifest_digest: resources.manifest.resource_digest,
        files: resources.manifest.files,
      },
      selector: { path: layout.selector, generation_id: generationId },
      pi_binding: {
        host: { ...preflight.host },
        loader: { ...preflight.loader },
        scope: "user",
        agent_directory: preflight.agentDirectory,
        settings_path: preflight.settingsPath,
        package_source: packageSource,
        registration: { entry_digest: packageRegistrationEntryDigest(packageSource), check: "matches" },
        skills: resources.manifest.skills.map(({ id, digest }) => ({ id, digest, check: "matches" })),
        roles: resources.manifest.pi_agents.map(({ role, agent_id, digest }) => ({
          role,
          agent_id,
          digest,
          check: "matches",
        })),
      },
      compatibility: { check: "compatible" },
    };
  }

  private planRegistration(
    snapshot: PiSettingsSnapshot,
    packageSource: string,
    transfer?: NativeTransferPlan,
  ): PiPackageRegistrationPlan {
    try {
      return this.files.planPiPackageRegistration(
        snapshot,
        packageSource,
        transfer ? this.transferOperation(transfer) : undefined,
      );
    } catch (error) {
      throw new SetupFailure(
        "setup_registration_plan_invalid",
        errorMessage(error),
        { native_transfer_plan: transfer ?? null },
        "Recompute the exact Pi settings plan before setup; no managed files have been changed.",
      );
    }
  }

  private verifyTransferPlanCurrent(
    accepted: NativeTransferPlan,
    packageSource: string,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
  ): void {
    let current: PiPreflightResult;
    try {
      current = this.preflight(packageSource);
    } catch (error) {
      throw new SetupFailure(
        "native_transfer_stale",
        `Native transfer preconditions changed before the settings write: ${errorMessage(error)}`,
        { accepted_digest: accepted.digest, settings_path: accepted.scope.settings_path },
        recoveryInstructions,
      );
    }
    const currentPlan = this.createNativeTransferPlan(current, packageSource, resources, identity);
    if (
      current.settingsPath !== accepted.scope.settings_path ||
      current.agentDirectory !== accepted.scope.agent_directory ||
      current.settingsSnapshot.contentDigest !== accepted.scope.settings_digest ||
      currentPlan?.digest !== accepted.digest
    ) {
      throw new SetupFailure(
        "native_transfer_stale",
        "Native transfer consent became stale before the Pi settings write; current ownership, files, or configuration differ from the accepted plan.",
        {
          accepted_digest: accepted.digest,
          current_digest: currentPlan?.digest ?? null,
          settings_path: current.settingsPath,
          settings_digest: current.settingsSnapshot.contentDigest,
        },
        recoveryInstructions,
      );
    }
  }

  private transferOperation(plan: NativeTransferPlan): PiPackageTransfer {
    return {
      source: plan.prior_registration.source,
      packageIndex: plan.prior_registration.package_index,
      expectedEntry: plan.prior_registration.source,
      operation: plan.operation.kind === "replace-package-entry" ? "replace" : "remove",
    };
  }

  private registerPackage(
    snapshot: PiSettingsSnapshot,
    packageSource: string,
    transfer?: NativeTransferPlan,
    validateTransfer?: () => void,
  ): PiRegistrationResult {
    try {
      return this.files.registerPiPackage(
        snapshot,
        packageSource,
        transfer ? this.transferOperation(transfer) : undefined,
        validateTransfer,
      );
    } catch (error) {
      if (error instanceof SetupFailure) throw error;
      const details = isPiSettingsAdapterError(error)
        ? {
            effect: error.effect,
            lock_evidence: error.lockEvidence,
            ...(error.temporaryFileEvidence
              ? { temporary_file_evidence: error.temporaryFileEvidence }
              : {}),
          }
        : {};
      throw new SetupFailure(
        isPiSettingsAdapterError(error) ? error.code : "settings_write_failed",
        errorMessage(error),
        { ...details, native_transfer_plan: transfer ?? null },
        "Inspect the generation journal and Pi settings. Preserve observed effects and reconcile only exact unchanged state.",
        { cause: error },
      );
    }
  }

  private verifyRegistrationAfterWrite(
    settingsPath: string,
    packageSource: string,
    plan: PiPackageRegistrationPlan,
    result: PiRegistrationResult,
  ): void {
    const snapshot = this.readSettingsSnapshot(settingsPath);
    if (
      result.entryDigest !== packageRegistrationEntryDigest(packageSource) ||
      result.settingsDigest !== plan.settingsDigest ||
      snapshot.contentDigest !== plan.settingsDigest ||
      snapshot.packages.filter((entry) => entry === packageSource).length !== 1 ||
      snapshot.packages.filter((entry) => packageEntrySource(entry) === packageSource).length !== 1
    ) {
      throw new SetupFailure(
        "settings_write_failed",
        "Pi settings registration read-back did not match the exact planned generation source.",
        {
          expected_settings_digest: plan.settingsDigest,
          observed_settings_digest: snapshot.contentDigest,
          entry_digest: result.entryDigest,
        },
        "Inspect the generation journal and Pi settings; do not claim setup success or overwrite observed edits.",
      );
    }
  }

  private validateRegistrationContext(
    preflight: PiPreflightResult,
    packageSource: string,
  ): number {
    const matchingEntries = preflight.settingsSnapshot.packages.filter(
      (entry) => packageEntrySource(entry) === packageSource,
    );
    const exactEntries = preflight.settingsSnapshot.packages.filter((entry) => entry === packageSource);
    if (
      matchingEntries.length !== exactEntries.length ||
      preflight.projectPackageEntries.length !== 0 ||
      !preflight.projectPackagesValid
    ) {
      throw new SetupFailure(
        "setup_registration_conflict",
        "The stable Kepler package registration has a user customization or project-level filter; setup will not adopt or repair it.",
        {
          package_source: packageSource,
          user_matching_entries: matchingEntries.length,
          user_exact_entries: exactEntries.length,
          project_matching_entries: preflight.projectPackageEntries.length,
          project_packages_valid: preflight.projectPackagesValid,
        },
        "Preserve the current Pi settings and remove or explicitly reconcile custom package registrations before retrying setup.",
      );
    }
    return exactEntries.length;
  }

  private verifyExistingRegistration(
    snapshot: PiSettingsSnapshot,
    packageSource: string,
    preflight: PiPreflightResult,
  ): PiRegistrationResult {
    const matchingEntries = snapshot.packages.filter(
      (entry) => packageEntrySource(entry) === packageSource,
    );
    const exactCount = snapshot.packages.filter((entry) => entry === packageSource).length;
    if (
      matchingEntries.length !== 1 ||
      exactCount !== 1 ||
      preflight.projectPackageEntries.length !== 0 ||
      !preflight.projectPackagesValid
    ) {
      throw new SetupFailure(
        "setup_registration_conflict",
        "The stable Kepler package source is not the exact enabled user registration or has a project-level override.",
        {
          package_source: packageSource,
          registration_count: matchingEntries.length,
          exact_registration_count: exactCount,
          project_matching_entries: preflight.projectPackageEntries.length,
          project_packages_valid: preflight.projectPackagesValid,
        },
        recoveryInstructions,
      );
    }
    return {
      entryDigest: packageRegistrationEntryDigest(packageSource),
      settingsDigest: snapshot.contentDigest,
    };
  }

  private readSettingsSnapshot(settingsPath: string): PiSettingsSnapshot {
    try {
      return this.files.readPiSettingsSnapshot(settingsPath);
    } catch (error) {
      throw new SetupFailure(
        "pi_settings_unavailable",
        errorMessage(error),
        { settings_path: settingsPath },
        recoveryInstructions,
      );
    }
  }

  private verifySelectedCandidate(
    layout: GenerationLayout,
    generationId: string,
    candidate: GenerationCandidate,
  ): void {
    const selector = this.files.inspectPath(layout.selector);
    const launcher = this.files.inspectPath(layout.stableLauncherPath);
    if (
      selector.kind !== "symlink" || selector.target !== `generations/${generationId}` ||
      launcher.kind !== "symlink" || launcher.target !== Path.join(layout.selector, "bin", "kepler")
    ) {
      throw stateConflict("The selected generation or stable launcher did not verify after activation.", layout.selector, selector.kind);
    }
    this.verifyCandidateInSelected(layout, generationId, candidate.resources, candidate.buildIdentity);
  }

  private verifyWrittenReceipt(
    path: string,
    expected: Uint8Array,
    record: InstallationRecordV2,
  ): void {
    const state = this.files.inspectPath(path);
    if (state.kind !== "file" || !bytesEqual(state.contents, expected)) {
      throw new SetupFailure(
        "installation_record_unverified",
        "The installation receipt was not read back exactly after writing.",
        { path, observed_kind: state.kind },
        recoveryInstructions,
      );
    }
    const parsed = parseInstallationReceipt(new TextDecoder().decode(state.contents));
    if (parsed.kind !== "current-v2" || parsed.record.generation_id !== record.generation_id) {
      throw new SetupFailure(
        "installation_record_unverified",
        "The read-back installation receipt does not identify the verified selected generation.",
        { path, generation_id: record.generation_id },
        recoveryInstructions,
      );
    }
  }

  private result(
    planned: PlannedSetup,
    layout: GenerationLayout,
    resources: ValidatedResourcePackage,
    identity: RuntimeBuildIdentity,
    preflight: PiPreflightResult,
    packageSource: string,
    registration: PiRegistrationResult,
    transfer?: NativeTransferPlan,
  ): SetupResult {
    const generationRoot = Path.join(layout.generationsDirectory, planned.generationId);
    const createdFiles = planned.mode === "repair" || planned.mode === "no-op"
      ? []
      : [
          `${generationRoot}/bin/kepler`,
          `${generationRoot}/package.json`,
          `${generationRoot}/bundle/manifest.json`,
          ...resources.files.map(({ path }) => `${generationRoot}/bundle/${path}`),
        ];
    return {
      generation_id: planned.generationId,
      kepler_release: identity.kepler_release,
      installation_mode: planned.mode,
      resource_root: generationRoot,
      selector: layout.selector,
      package_source: packageSource,
      compatibility: { check: "compatible" },
      templates: resourcePaths(resources, "templates/"),
      guidelines: resourcePaths(resources, "guidelines/"),
      created_files: createdFiles,
      updated_files: planned.mode === "no-op"
        ? []
        : planned.registerPackage
          ? [layout.piSettings, layout.installationRecord]
          : [layout.installationRecord],
      pi_binding: {
        host: preflight.host,
        loader: preflight.loader,
        registration: {
          entry_digest: registration.entryDigest,
          settings_digest: registration.settingsDigest,
          check: "matches",
        },
      },
      ...(transfer ? {
        native_transfer: {
          digest: transfer.digest,
          source: transfer.prior_registration.source,
          operation: transfer.operation.kind,
        },
      } : {}),
    };
  }

  private failureWithClaimRelease(
    releaseError: unknown,
    claim: GenerationOwnerClaim,
    transaction?: GenerationTransaction,
    primaryError?: unknown,
    extraDetails: Record<string, unknown> = {},
    releaseState?: "missing" | "replaced",
  ): SetupFailure {
    const primary = primaryError === undefined
      ? undefined
      : this.failureFrom(primaryError, undefined, transaction);
    const details = {
      ...(primary?.details ?? {}),
      ...(transaction ? this.inspectTransactionReleaseEvidence(transaction) : {}),
      ...extraDetails,
      claim_release_failure: {
        error: errorDetails(releaseError),
        requested_state: releaseState ?? "threw",
        evidence: this.inspectOwnerClaim(claim, releaseState),
      },
    };
    if (primary) {
      return new SetupFailure(
        primary.code,
        `${primary.message}; additionally, owner-claim release failed: ${errorMessage(releaseError)}`,
        details,
        primary.recovery,
        { cause: primary },
      );
    }
    return new SetupFailure(
      "setup_owner_release_uncertain",
      `The setup operation could not verify owner-claim release: ${errorMessage(releaseError)}`,
      details,
      recoveryInstructions,
      { cause: releaseError },
    );
  }

  private inspectOwnerClaim(
    claim: GenerationOwnerClaim,
    releaseState?: "missing" | "replaced",
  ): Record<string, unknown> {
    const evidence: Record<string, unknown> = {
      path: claim.path,
      token: claim.token,
      acquired_identity: claim.identity,
      release_state: releaseState ?? "threw",
    };
    try {
      const observed = this.files.inspectPath(claim.path);
      evidence.observed_kind = observed.kind;
      if (observed.kind === "file") {
        const identityMatches = observed.identity.dev === claim.identity.dev &&
          observed.identity.ino === claim.identity.ino;
        let tokenMatches = false;
        try {
          const value = JSON.parse(new TextDecoder().decode(observed.contents)) as Record<string, unknown>;
          tokenMatches = value.owner === "kepler-generation-transaction" && value.token === claim.token;
        } catch {
          tokenMatches = false;
        }
        evidence.observed_identity = observed.identity;
        evidence.observed_mode = observed.mode;
        evidence.identity_matches = identityMatches;
        evidence.token_matches = tokenMatches;
        evidence.state_after_release = identityMatches && tokenMatches ? "acquired_claim_remains" : "replacement_preserved";
      } else {
        evidence.state_after_release = observed.kind;
      }
    } catch (error) {
      evidence.observed_kind = "unavailable";
      evidence.inspection_error = errorMessage(error);
    }
    return evidence;
  }

  private inspectTransactionReleaseEvidence(transaction: GenerationTransaction): Record<string, unknown> {
    const path = transaction.recoveryJournalPath;
    try {
      const state = this.files.inspectPath(path);
      if (state.kind !== "file") {
        return { recovery_journal_path: path, journal_state: state.kind };
      }
      const content = new TextDecoder().decode(state.contents);
      const journal = asObject(JSON.parse(content));
      return {
        recovery_journal_path: path,
        journal_state: journal?.state ?? "invalid",
        operation_effects: asObject(journal?.effects) ?? this.inspectTransactionEffects(transaction),
        ...(journal?.observed_roots ? { observed_roots: journal.observed_roots } : {}),
        ...(typeof journal?.failure === "string" ? { journal_failure: journal.failure } : {}),
        journal_digest: sha256Digest(state.contents),
      };
    } catch (error) {
      return {
        recovery_journal_path: path,
        journal_state: "unreadable",
        journal_inspection_error: errorMessage(error),
      };
    }
  }

  private inspectTransactionEffects(transaction: GenerationTransaction): Record<string, unknown> {
    const state = this.files.inspectPath(transaction.recoveryJournalPath);
    if (state.kind !== "file") return { recovery_journal_path: transaction.recoveryJournalPath };
    try {
      const journal = JSON.parse(new TextDecoder().decode(state.contents)) as { effects?: unknown };
      return asObject(journal.effects) ?? { recovery_journal_path: transaction.recoveryJournalPath };
    } catch {
      return { recovery_journal_path: transaction.recoveryJournalPath, journal: "unreadable" };
    }
  }

  private beginTransaction(
    roots: GenerationTransactionRoots,
    candidate: GenerationCandidate,
    mode: GenerationInstallMode,
  ): GenerationTransaction {
    try {
      return this.files.beginTransaction({ roots, candidate, mode });
    } catch (error) {
      throw this.failureFrom(error);
    }
  }

  private failureFrom(
    error: unknown,
    transactionError?: unknown,
    transaction?: GenerationTransaction,
  ): SetupFailure {
    const journalError = isGenerationTransactionError(transactionError)
      ? transactionError
      : isGenerationTransactionError(error)
        ? error
        : undefined;
    if (error instanceof SetupFailure) {
      return new SetupFailure(
        error.code,
        error.message,
        {
          ...error.details,
          ...(journalError?.details.recoveryJournalPath
            ? { recovery_journal_path: journalError.details.recoveryJournalPath }
            : transaction
              ? { recovery_journal_path: transaction.recoveryJournalPath }
              : {}),
          ...(journalError?.details.effects ? { operation_effects: journalError.details.effects } : {}),
          ...(journalError?.details.observedRoots ? { observed_roots: journalError.details.observedRoots } : {}),
          ...(journalError?.details.cleanupWarning ? { cleanup_warning: journalError.details.cleanupWarning } : {}),
        },
        journalError?.details.recoveryJournalPath || transaction
          ? recoveryInstructions
          : error.recovery,
        error.cause === undefined ? undefined : { cause: error.cause },
      );
    }
    if (isGenerationTransactionError(error) || journalError) {
      const failure = journalError ?? error as GenerationTransactionError;
      return new SetupFailure(
        `generation_${failure.code}`,
        failure.message,
        {
          ...failure.details,
          ...(transaction ? { recovery_journal_path: transaction.recoveryJournalPath } : {}),
          ...(transaction ? { observed_operation_effects: this.inspectTransactionEffects(transaction) } : {}),
        },
        recoveryInstructions,
      );
    }
    if (isPiSettingsAdapterError(error)) {
      return new SetupFailure(
        error.code,
        error.message,
        {
          effect: error.effect,
          ...(error.lockEvidence ? { lock_evidence: error.lockEvidence } : {}),
          ...(error.temporaryFileEvidence
            ? { temporary_file_evidence: error.temporaryFileEvidence }
            : {}),
          ...(transaction ? { recovery_journal_path: transaction.recoveryJournalPath } : {}),
        },
        transaction ? recoveryInstructions : "Resolve the Pi settings error without replacing user settings.",
        { cause: error },
      );
    }
    return new SetupFailure(
      "setup_failed",
      errorMessage(error),
      transaction ? {
        recovery_journal_path: transaction.recoveryJournalPath,
        observed_operation_effects: this.inspectTransactionEffects(transaction),
      } : {},
      transaction ? recoveryInstructions : "Resolve the reported prerequisite and retry setup.",
    );
  }

  private newGenerationId(): string {
    const id = this.generationId();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      throw new SetupFailure(
        "setup_generation_id_invalid",
        "Setup generation id must be a UUIDv4.",
        {},
        "Use a valid generation id source and retry setup.",
      );
    }
    return id;
  }
}

function resourcePaths(
  resources: ValidatedResourcePackage,
  prefix: "templates/" | "guidelines/",
): string[] {
  return resources.files
    .map(({ path }) => path)
    .filter((path) => path.startsWith(prefix) && !path.endsWith("/.gitkeep"))
    .sort((left, right) => left.localeCompare(right));
}

function packageEntrySource(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    "source" in entry &&
    typeof entry.source === "string"
  ) return entry.source;
  return undefined;
}

function isLegacyLauncher(state: GenerationFileState, layout: GenerationLayout): boolean {
  return state.kind === "symlink" && state.target === layout.legacyLauncherPath;
}

function sameBuildIdentity(
  receipt: InstallationRecordV2,
  identity: RuntimeBuildIdentity,
): boolean {
  return receipt.release.version === identity.kepler_release &&
    receipt.release.source.kind === identity.source.kind &&
    receipt.release.source.commit === identity.source.commit &&
    receipt.release.source.content_digest === identity.source.content_digest &&
    receipt.release.target.os === identity.target.os &&
    receipt.release.target.arch === identity.target.arch &&
    receipt.resources.manifest_digest === identity.resource_digest;
}

function sameDigestMap(
  left: Readonly<Record<string, ContentDigest>>,
  right: Readonly<Record<string, ContentDigest>>,
): boolean {
  const leftKeys = Object.keys(left).sort(compareStrings);
  const rightKeys = Object.keys(right).sort(compareStrings);
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && left[key] === right[key],
  );
}

function sameResourceBindings(
  left: readonly { readonly id: string; readonly digest: ContentDigest }[],
  right: readonly { readonly id: string; readonly digest: ContentDigest }[],
): boolean {
  const orderedLeft = [...left].sort((a, b) => a.id.localeCompare(b.id));
  const orderedRight = [...right].sort((a, b) => a.id.localeCompare(b.id));
  return orderedLeft.length === orderedRight.length && orderedLeft.every((entry, index) =>
    entry.id === orderedRight[index]?.id && entry.digest === orderedRight[index]?.digest,
  );
}

function sameRoleBindings(
  left: readonly { readonly role: string; readonly agent_id: string; readonly digest: ContentDigest }[],
  right: readonly { readonly role: string; readonly agent_id: string; readonly digest: ContentDigest }[],
): boolean {
  const orderedLeft = [...left].sort((a, b) => a.role.localeCompare(b.role));
  const orderedRight = [...right].sort((a, b) => a.role.localeCompare(b.role));
  return orderedLeft.length === orderedRight.length && orderedLeft.every((entry, index) =>
    entry.role === orderedRight[index]?.role &&
    entry.agent_id === orderedRight[index]?.agent_id &&
    entry.digest === orderedRight[index]?.digest,
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function stateConflict(message: string, path: string, kind: string): SetupFailure {
  return new SetupFailure(
    "setup_path_conflict",
    message,
    { path, observed_kind: kind },
    recoveryInstructions,
  );
}

function isPathWithin(root: string, target: string): boolean {
  const relative = Path.relative(Path.resolve(root), Path.resolve(target));
  return relative.length > 0 && !Path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${Path.sep}`);
}

function isTransferResourceRoot(path: string): boolean {
  return path.length > 0 &&
    !Path.isAbsolute(path) &&
    !/[!*?{}[\]]/.test(path) &&
    !path.split(/[\\/]/).some((part) => part === ".." || part === "");
}

function isTransferPackageManifest(value: Record<string, unknown>): boolean {
  const allowed = new Set(["name", "version", "private", "type", "description", "license", "author", "repository", "pi"]);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    typeof value.name !== "string" ||
    typeof value.version !== "string"
  ) return false;
  const pi = asObject(value.pi);
  if (!pi || Object.keys(pi).some((key) => key !== "skills" && key !== "subagents")) return false;
  const subagents = pi.subagents === undefined ? {} : asObject(pi.subagents);
  return Boolean(subagents) && Object.keys(subagents ?? {}).every((key) => key === "agents") &&
    (pi.skills === undefined || Array.isArray(pi.skills)) &&
    (subagents?.agents === undefined || Array.isArray(subagents.agents));
}

function profileName(content: string): string | undefined {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return undefined;
  try {
    const parsed = Yaml.parse(frontmatter) as unknown;
    const value = asObject(parsed);
    return typeof value?.name === "string" ? value.name : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonObject(content: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`invalid JSON: ${errorMessage(error)}`, { cause: error });
  }
  const object = asObject(value);
  if (!object) throw new Error("expected a JSON object");
  return object;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = asObject(value);
  if (object) {
    return `{${Object.keys(object).sort(compareStrings).map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return undefined;
  return value as string[];
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isPiPreflightError(error: unknown): error is Error & {
  readonly code: string;
  readonly details: Record<string, unknown>;
} {
  return error instanceof Error &&
    "code" in error && typeof error.code === "string" &&
    "details" in error && typeof error.details === "object" && error.details !== null;
}

function isPiSettingsAdapterError(error: unknown): error is Error & {
  readonly code: string;
  readonly effect: "none" | "applied" | "unknown";
  readonly lockEvidence?: unknown;
  readonly temporaryFileEvidence?: PiSettingsTemporaryFileEvidence;
} {
  return error instanceof Error &&
    "code" in error && typeof error.code === "string" &&
    "effect" in error && (error.effect === "none" || error.effect === "applied" || error.effect === "unknown");
}

function isGenerationTransactionError(error: unknown): error is GenerationTransactionError {
  return error instanceof Error && "code" in error && typeof error.code === "string" && "details" in error;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;
    return {
      name: error.name,
      message: error.message,
      ...(cause !== undefined ? { cause: errorMessage(cause) } : {}),
      ...("code" in error ? { code: String(error.code) } : {}),
    };
  }
  return { name: typeof error, message: String(error) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
