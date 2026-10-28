import { randomUUID } from "node:crypto";
import * as Path from "node:path";
import {
  parseInstallationRecord,
  serializeInstallationRecord,
  sha256Digest,
  type ContentDigest,
  type InstallationRecord,
} from "./installation-record.js";
import {
  SetupBundleError,
  validateSetupBundle,
  type SetupBundleSnapshot,
  type ValidatedSetupBundle,
} from "./setup-bundle.js";
import { buildSettingsYaml } from "./setup-settings.js";

export interface SetupGlobalPaths {
  readonly home: string;
  readonly templates: string;
  readonly guidelines: string;
  readonly settings: string;
  readonly installationRecord: string;
}

export type SetupPathState =
  | { readonly kind: "missing" }
  | { readonly kind: "file"; readonly contents: Uint8Array }
  | {
      readonly kind: "other";
      readonly type: "directory" | "symlink" | "special";
    };

export interface SetupResourceWrite {
  readonly path: string;
  readonly relativePath: string;
  readonly contents: Uint8Array;
  readonly expectedCurrentDigest: ContentDigest | null;
}

export interface SetupRecordWrite {
  readonly path: string;
  readonly contents: string;
  readonly expectedCurrentDigest: ContentDigest | null;
}

export interface SetupApplyPlan {
  readonly generationId: string;
  readonly previousGenerationId: string | null;
  readonly resourceWrites: readonly SetupResourceWrite[];
  readonly settingsWrite?: {
    readonly path: string;
    readonly contents: string;
  };
  readonly installationRecordWrite?: SetupRecordWrite;
}

export interface SetupApplyEffects {
  readonly createdFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly settingsCreated: boolean;
  readonly recoveryPath?: string;
  readonly cleanupWarning?: string;
}

export interface SetupFiles {
  readBundle(bundleRoot: string): SetupBundleSnapshot;
  globalPaths(): SetupGlobalPaths;
  ensureHome(): void;
  inspectPath(path: string): SetupPathState;
  pendingRecoveryPaths(home: string): readonly string[];
  applyPlan(plan: SetupApplyPlan): SetupApplyEffects;
}

export type SetupBundleLocator = () => string;

export interface SetupPlatform {
  readonly os: string;
  readonly arch: string;
}

export class SetupFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly recovery: string,
  ) {
    super(message);
    this.name = "SetupFailure";
  }
}

export class SetupApplyFailure extends SetupFailure {
  constructor(message: string, details: Record<string, unknown>) {
    super(
      "setup_write_failed",
      message,
      details,
      "Use the recovery manifest to restore prior installer-managed files before retrying setup.",
    );
    this.name = "SetupApplyFailure";
  }
}

export interface SetupResult {
  readonly generation_id: string;
  readonly cli_release: string;
  readonly bundle_release: {
    readonly release: string;
    readonly content_digest: ContentDigest;
  };
  readonly compatibility: InstallationRecord["compatibility"];
  readonly templates: readonly string[];
  readonly guidelines: readonly string[];
  readonly created_files: readonly string[];
  readonly updated_files: readonly string[];
  readonly settings: {
    readonly check: "created" | "preserved";
  };
  readonly skills: InstallationRecord["skills"];
  readonly host_binding: InstallationRecord["host_binding"];
  readonly cleanup_warning?: string;
}

export interface Setup {
  setup(): SetupResult;
}

export class SetupService implements Setup {
  constructor(
    private readonly files: SetupFiles,
    private readonly bundleLocator: SetupBundleLocator,
    private readonly cliRelease: string,
    private readonly platform: SetupPlatform,
    private readonly generationId: () => string = randomUUID,
  ) {}

  setup(): SetupResult {
    const bundleRoot = this.locateBundle();
    const bundle = this.validateBundle(bundleRoot);
    const paths = this.resolveGlobalPaths();
    const pendingRecoveryPaths = this.files.pendingRecoveryPaths(paths.home);
    if (pendingRecoveryPaths.length > 0) {
      throw new SetupFailure(
        "setup_recovery_required",
        "An earlier setup operation needs manual recovery before setup can continue.",
        { recovery_paths: pendingRecoveryPaths },
        "Restore the files listed in the recovery manifest, then remove only that completed recovery directory before retrying.",
      );
    }

    const priorRecordState = this.files.inspectPath(paths.installationRecord);
    const priorRecord = this.readPriorRecord(priorRecordState);
    const targetPlan = this.planResourceWrites(bundle, paths, priorRecord);
    const settingsState = this.files.inspectPath(paths.settings);
    if (settingsState.kind === "other" && settingsState.type !== "symlink") {
      throw new SetupFailure(
        "settings_path_conflict",
        "The settings path is not a regular file and cannot be replaced safely.",
        { path: paths.settings, type: settingsState.type },
        "Preserve the existing path and resolve the conflict before retrying setup.",
      );
    }

    const settingsWrite =
      settingsState.kind === "missing"
        ? { path: paths.settings, contents: buildSettingsYaml() }
        : undefined;
    const settingsCheck = settingsWrite ? "created" : "preserved";
    const record = this.buildRecord(
      bundle,
      targetPlan.installedFiles,
      priorRecord,
    );
    const serializedRecord = serializeInstallationRecord(record);
    const priorRecordDigest =
      priorRecordState.kind === "file"
        ? sha256Digest(priorRecordState.contents)
        : null;
    const recordWrite =
      priorRecord &&
      serializeInstallationRecord(priorRecord) === serializedRecord
        ? undefined
        : {
            path: paths.installationRecord,
            contents: serializedRecord,
            expectedCurrentDigest: priorRecordDigest,
          };

    try {
      this.files.ensureHome();
    } catch (error) {
      throw new SetupFailure(
        "setup_write_failed",
        `Failed to create Kepler home directories: ${errorMessage(error)}`,
        {},
        "Resolve the filesystem failure and retry setup.",
      );
    }

    let effects: SetupApplyEffects = {
      createdFiles: [],
      updatedFiles: [],
      settingsCreated: false,
    };
    if (
      targetPlan.writes.length > 0 ||
      settingsWrite !== undefined ||
      recordWrite !== undefined
    ) {
      try {
        effects = this.files.applyPlan({
          generationId: record.generation_id,
          previousGenerationId: priorRecord?.generation_id ?? null,
          resourceWrites: targetPlan.writes,
          settingsWrite,
          installationRecordWrite: recordWrite,
        });
      } catch (error) {
        if (error instanceof SetupFailure) throw error;
        throw new SetupFailure(
          "setup_write_failed",
          `Failed to apply the installation generation: ${errorMessage(error)}`,
          {},
          "Resolve the filesystem failure and retry setup after checking the global home.",
        );
      }
    }

    return {
      generation_id: record.generation_id,
      cli_release: this.cliRelease,
      bundle_release: {
        release: bundle.manifest.bundle_release,
        content_digest: bundle.manifest.content_digest,
      },
      compatibility: record.compatibility,
      templates: targetPlan.templates,
      guidelines: targetPlan.guidelines,
      created_files: effects.createdFiles,
      updated_files: effects.updatedFiles,
      settings: { check: effects.settingsCreated ? "created" : settingsCheck },
      skills: record.skills,
      host_binding: record.host_binding,
      ...(effects.cleanupWarning ? { cleanup_warning: effects.cleanupWarning } : {}),
    };
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
        "Provide an existing compatible bundle directory and retry setup.",
      );
    }
  }

  private validateBundle(bundleRoot: string): ValidatedSetupBundle {
    try {
      return validateSetupBundle(
        this.files.readBundle(bundleRoot),
        this.cliRelease,
      );
    } catch (error) {
      const code =
        error instanceof SetupBundleError ? error.code : "invalid_bundle";
      throw new SetupFailure(
        code,
        errorMessage(error),
        { bundle_root: bundleRoot },
        "Use a complete bundle whose file digests and declared compatibility match this CLI release.",
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
        "Resolve the global home path before retrying setup.",
      );
    }
  }

  private readPriorRecord(
    state: SetupPathState,
  ): InstallationRecord | undefined {
    if (state.kind === "missing") return undefined;
    if (state.kind !== "file") {
      throw new SetupFailure(
        "installation_record_conflict",
        "The installation record path is not a regular file.",
        { type: state.type },
        "Preserve the existing path and resolve the conflict before retrying setup.",
      );
    }
    try {
      return parseInstallationRecord(new TextDecoder().decode(state.contents));
    } catch (error) {
      throw new SetupFailure(
        "installation_record_invalid",
        `The existing installation record is invalid: ${errorMessage(error)}`,
        {},
        "Preserve the existing record and resolve its format or contents before retrying setup.",
      );
    }
  }

  private planResourceWrites(
    bundle: ValidatedSetupBundle,
    paths: SetupGlobalPaths,
    priorRecord: InstallationRecord | undefined,
  ): {
    readonly writes: readonly SetupResourceWrite[];
    readonly installedFiles: Readonly<Record<string, ContentDigest>>;
    readonly templates: readonly string[];
    readonly guidelines: readonly string[];
  } {
    const templates: string[] = [];
    const guidelines: string[] = [];
    const writes: SetupResourceWrite[] = [];
    const installedFiles: Record<string, ContentDigest> = {};
    const conflicts: Array<{ path: string; reason: string }> = [];

    for (const file of bundle.files) {
      if (file.path.startsWith("templates/")) templates.push(file.path);
      else if (file.path.startsWith("guidelines/")) guidelines.push(file.path);
      else continue;

      if (file.path.endsWith("/.gitkeep")) continue;
      const rootPath = file.path.startsWith("templates/")
        ? paths.templates
        : paths.guidelines;
      const relativeTail = file.path.slice(file.path.indexOf("/") + 1);
      const targetPath = Path.join(rootPath, ...relativeTail.split("/"));
      const state = this.files.inspectPath(targetPath);
      const previousDigest =
        priorRecord?.bundle_release.installed_files[file.path];

      if (state.kind === "missing") {
        installedFiles[file.path] = file.digest;
        writes.push({
          path: targetPath,
          relativePath: file.path,
          contents: file.contents,
          expectedCurrentDigest: null,
        });
        continue;
      }

      if (state.kind !== "file") {
        conflicts.push({ path: file.path, reason: state.type });
        continue;
      }

      const currentDigest = sha256Digest(state.contents);
      if (currentDigest === file.digest) {
        if (previousDigest === currentDigest) {
          installedFiles[file.path] = file.digest;
        }
        continue;
      }

      if (previousDigest !== undefined && currentDigest === previousDigest) {
        installedFiles[file.path] = file.digest;
        writes.push({
          path: targetPath,
          relativePath: file.path,
          contents: file.contents,
          expectedCurrentDigest: previousDigest,
        });
        continue;
      }

      conflicts.push({
        path: file.path,
        reason:
          previousDigest === undefined
            ? "existing file is not recorded as installer-managed"
            : "existing file digest differs from its installation receipt",
      });
    }

    if (conflicts.length > 0) {
      throw new SetupFailure(
        "resource_conflict",
        "Setup found existing resources it cannot replace safely.",
        { conflicts },
        "Preserve the reported files and resolve the conflicts without deleting user data before retrying setup.",
      );
    }

    return {
      writes,
      installedFiles: Object.fromEntries(
        Object.entries(installedFiles).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      templates: templates.filter((path) => !path.endsWith("/.gitkeep")),
      guidelines: guidelines.filter((path) => !path.endsWith("/.gitkeep")),
    };
  }

  private buildRecord(
    bundle: ValidatedSetupBundle,
    installedFiles: Readonly<Record<string, ContentDigest>>,
    priorRecord: InstallationRecord | undefined,
  ): InstallationRecord {
    const candidate = (generationId: string): InstallationRecord => ({
      format_version: 1,
      generation_id: generationId,
      cli_release: this.cliRelease,
      bundle_release: {
        release: bundle.manifest.bundle_release,
        content_digest: bundle.manifest.content_digest,
        manifest: bundle.manifest,
        installed_files: installedFiles,
      },
      skills: bundle.manifest.compatibility.skills.map((skill) => ({
        ...skill,
        check: "not_checked",
      })),
      host_binding: {
        host: { id: "claude-code", release: null, check: "not_checked" },
        platform: this.platform,
        roles: bundle.manifest.compatibility.host_bindings.map((binding) => ({
          ...binding,
          check: "not_checked",
        })),
      },
      compatibility: { check: "compatible" },
    });

    if (priorRecord) {
      const existingGeneration = candidate(priorRecord.generation_id);
      if (
        serializeInstallationRecord(existingGeneration) ===
        serializeInstallationRecord(priorRecord)
      ) {
        return existingGeneration;
      }
    }
    return candidate(this.generationId());
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
