import * as Fs from "node:fs";
import * as Path from "node:path";
import { KeplerService, type KeplerEnvironment } from "@vialactea-works/kepler-core";
import { resolveBundleRoot } from "./bundle-root.js";
import { sha256Digest } from "./installation-record.js";
import {
  SetupApplyFailure,
  type SetupApplyPlan,
  type SetupFiles,
  type SetupGlobalPaths,
  type SetupPathState,
  type SetupBundleLocator,
} from "./setup.service.js";

export const SETUP_OPERATION = Symbol("SETUP_OPERATION");
export const SETUP_FILES = Symbol("SETUP_FILES");
export const SETUP_BUNDLE_LOCATOR = Symbol("SETUP_BUNDLE_LOCATOR");
export const SETUP_CLI_RELEASE = Symbol("SETUP_CLI_RELEASE");
export const SETUP_PLATFORM = Symbol("SETUP_PLATFORM");

export interface SetupRuntimeOptions {
  readonly environment?: KeplerEnvironment;
  readonly renameTarget?: (stagedPath: string, targetPath: string) => void;
}

interface PlannedWrite {
  readonly kind: "resource" | "settings" | "installation_record";
  readonly path: string;
  readonly relativePath: string;
  readonly contents: Uint8Array;
  readonly expectedCurrentDigest: string | null;
}

interface RecoveryWrite {
  readonly kind: PlannedWrite["kind"];
  readonly relative_path: string;
  readonly expected_current_digest: string | null;
  readonly installed_digest: string;
  readonly backup_path: string | null;
}

interface RecoveryJournal {
  readonly owner: "kepler-setup";
  readonly format_version: 1;
  readonly state: "preparing" | "applying" | "recovery_required" | "committed";
  readonly generation_id: string;
  readonly previous_generation_id: string | null;
  readonly writes: readonly RecoveryWrite[];
  readonly completed_paths: readonly string[];
  readonly failure?: string;
}

export function createSetupRuntime(options: SetupRuntimeOptions = {}): {
  files: SetupFiles;
  bundleLocator: SetupBundleLocator;
  platform: { readonly os: string; readonly arch: string };
} {
  const environment = options.environment ?? {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  };
  const bundleEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    ...environment,
  };
  const kepler = new KeplerService({ environment });
  const renameTarget = options.renameTarget ?? Fs.renameSync;
  const globalPaths = (): SetupGlobalPaths => {
    const paths = kepler.globalPaths();
    return {
      ...paths,
      installationRecord: Path.join(paths.home, "installation.json"),
    };
  };

  const inspectPath = (targetPath: string): SetupPathState => {
    const home = globalPaths().home;
    const relative = Path.relative(home, targetPath);
    if (
      relative.length === 0 ||
      Path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${Path.sep}`)
    ) {
      throw new Error(`Setup target is outside the Kepler global home: ${targetPath}`);
    }

    let homeStat: Fs.Stats;
    try {
      homeStat = Fs.statSync(home);
    } catch (error) {
      if (isMissingPathError(error)) return { kind: "missing" };
      throw error;
    }
    if (!homeStat.isDirectory()) return { kind: "other", type: "special" };

    const segments = relative.split(Path.sep);
    let parent = home;
    for (const segment of segments.slice(0, -1)) {
      parent = Path.join(parent, segment);
      let stat: Fs.Stats;
      try {
        stat = Fs.lstatSync(parent);
      } catch (error) {
        if (isMissingPathError(error)) return { kind: "missing" };
        throw error;
      }
      if (stat.isSymbolicLink()) return { kind: "other", type: "symlink" };
      if (!stat.isDirectory()) return { kind: "other", type: "special" };
    }

    const path = Path.join(parent, segments.at(-1) ?? "");
    let stat: Fs.Stats;
    try {
      stat = Fs.lstatSync(path);
    } catch (error) {
      if (isMissingPathError(error)) return { kind: "missing" };
      throw error;
    }
    if (stat.isSymbolicLink()) return { kind: "other", type: "symlink" };
    if (stat.isDirectory()) return { kind: "other", type: "directory" };
    if (!stat.isFile()) return { kind: "other", type: "special" };
    return { kind: "file", contents: Fs.readFileSync(path) };
  };

  const pendingRecoveryPaths = (home: string): string[] => {
    let entries: Fs.Dirent[];
    try {
      entries = Fs.readdirSync(home, { withFileTypes: true });
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw error;
    }

    const pending: string[] = [];
    for (const entry of entries) {
      if (!entry.name.startsWith(".kepler-setup-recovery-")) continue;
      const recoveryPath = Path.join(home, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        pending.push(recoveryPath);
        continue;
      }
      const journalPath = Path.join(recoveryPath, "recovery.json");
      let journal: RecoveryJournal | undefined;
      try {
        journal = parseRecoveryJournal(Fs.readFileSync(journalPath, "utf8"));
      } catch {
        pending.push(recoveryPath);
        continue;
      }
      if (journal.state === "applying" || journal.state === "recovery_required") {
        pending.push(recoveryPath);
      }
    }
    return pending;
  };

  const applyPlan = (plan: SetupApplyPlan) => {
    const paths = globalPaths();
    const home = paths.home;
    const writes = toPlannedWrites(plan, home);
    const initialConflicts = writes.flatMap((write) =>
      matchesExpected(inspectPath(write.path), write.expectedCurrentDigest)
        ? []
        : [{ path: write.relativePath, reason: "path changed after setup preflight" }],
    );
    if (initialConflicts.length > 0) {
      throw new SetupApplyFailure("Setup paths changed during preflight.", {
        conflicts: initialConflicts,
      });
    }

    const recoveryPath = Fs.mkdtempSync(
      Path.join(home, ".kepler-setup-recovery-"),
    );
    const stagingPath = Path.join(recoveryPath, "staged");
    const backupPath = Path.join(recoveryPath, "backups");
    const journalPath = Path.join(recoveryPath, "recovery.json");
    const recoveryWrites: RecoveryWrite[] = writes.map((write) => ({
      kind: write.kind,
      relative_path: write.relativePath,
      expected_current_digest: write.expectedCurrentDigest,
      installed_digest: sha256Digest(write.contents),
      backup_path:
        write.expectedCurrentDigest === null
          ? null
          : Path.posix.join("backups", write.relativePath.split(Path.sep).join("/")),
    }));
    const completedPaths: string[] = [];
    let journal: RecoveryJournal = {
      owner: "kepler-setup",
      format_version: 1,
      state: "preparing",
      generation_id: plan.generationId,
      previous_generation_id: plan.previousGenerationId,
      writes: recoveryWrites,
      completed_paths: completedPaths,
    };
    let currentWrite: PlannedWrite | undefined;

    try {
      writeRecoveryJournal(journalPath, journal);
      for (const write of writes) {
        const staged = Path.join(stagingPath, ...write.relativePath.split(Path.sep));
        createParentDirectories(staged);
        Fs.writeFileSync(staged, write.contents, { flag: "wx", mode: 0o600 });
        if (write.expectedCurrentDigest !== null) {
          const backup = Path.join(backupPath, ...write.relativePath.split(Path.sep));
          createParentDirectories(backup);
          const state = inspectPath(write.path);
          if (!matchesExpected(state, write.expectedCurrentDigest)) {
            throw new Error(`Setup target changed before backup: ${write.relativePath}`);
          }
          Fs.copyFileSync(write.path, backup, Fs.constants.COPYFILE_EXCL);
        }
      }

      for (const write of writes) {
        ensureSafeTargetParents(home, write.path);
      }
      journal = { ...journal, state: "applying" };
      writeRecoveryJournal(journalPath, journal);

      for (const write of writes) {
        currentWrite = write;
        const state = inspectPath(write.path);
        if (!matchesExpected(state, write.expectedCurrentDigest)) {
          throw new Error(`Setup target changed before write: ${write.relativePath}`);
        }
        const staged = Path.join(stagingPath, ...write.relativePath.split(Path.sep));
        renameTarget(staged, write.path);
        completedPaths.push(write.relativePath);
        currentWrite = undefined;
        journal = { ...journal, completed_paths: [...completedPaths] };
        writeRecoveryJournal(journalPath, journal);
      }

      journal = { ...journal, state: "committed" };
      writeRecoveryJournal(journalPath, journal);
      const cleanupWarning = removeOwnedDirectory(recoveryPath);
      return {
        createdFiles: writes.flatMap((write) =>
          write.kind === "resource" && write.expectedCurrentDigest === null
            ? [write.relativePath]
            : [],
        ),
        updatedFiles: writes.flatMap((write) =>
          write.kind === "resource" && write.expectedCurrentDigest !== null
            ? [write.relativePath]
            : [],
        ),
        settingsCreated: writes.some((write) => write.kind === "settings"),
        ...(cleanupWarning ? { cleanupWarning } : {}),
      };
    } catch (error) {
      const cleanupWarnings: string[] = [];
      if (currentWrite) {
        try {
          if (wasWritten(currentWrite)) completedPaths.push(currentWrite.relativePath);
        } catch (inspectionError) {
          cleanupWarnings.push(errorMessage(inspectionError));
        }
      }
      const uniqueCompleted = [...new Set(completedPaths)];
      if (uniqueCompleted.length === 0) {
        const cleanupWarning = removeOwnedDirectory(recoveryPath);
        if (cleanupWarning) cleanupWarnings.push(cleanupWarning);
      } else {
        journal = {
          ...journal,
          state: "recovery_required",
          completed_paths: uniqueCompleted,
          failure: errorMessage(error),
        };
        try {
          writeRecoveryJournal(journalPath, journal);
        } catch (journalError) {
          cleanupWarnings.push(errorMessage(journalError));
        }
        const cleanupWarning = removeOwnedDirectory(stagingPath);
        if (cleanupWarning) cleanupWarnings.push(cleanupWarning);
      }
      throw new SetupApplyFailure(
        `Failed to apply installation generation: ${errorMessage(error)}`,
        {
          generation_id: plan.generationId,
          previous_generation_id: plan.previousGenerationId,
          changed_paths: uniqueCompleted,
          ...(uniqueCompleted.length > 0 || cleanupWarnings.length > 0
            ? {
                recovery_path: recoveryPath,
                recovery_manifest: journalPath,
              }
            : {}),
          ...(cleanupWarnings.length > 0
            ? { cleanup_warnings: cleanupWarnings }
            : {}),
        },
      );
    }

    function wasWritten(write: PlannedWrite): boolean {
      const state = inspectPath(write.path);
      return (
        state.kind === "file" &&
        sha256Digest(state.contents) === sha256Digest(write.contents)
      );
    }
  };

  const files: SetupFiles = {
    readBundle: readBundleSnapshot,
    globalPaths,
    ensureHome: () => {
      kepler.ensureGlobalHome();
    },
    inspectPath,
    pendingRecoveryPaths,
    applyPlan,
  };

  return {
    files,
    bundleLocator: () => resolveBundleRoot({ env: bundleEnvironment }),
    platform: { os: process.platform, arch: process.arch },
  };
}

function readBundleSnapshot(bundleRoot: string) {
  const root = Fs.realpathSync(bundleRoot);
  const rootStat = Fs.statSync(root);
  if (!rootStat.isDirectory()) throw new Error("Bundle root is not a directory");
  const manifestPath = Path.join(root, "manifest.json");
  const manifestStat = Fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error("Bundle manifest is not a regular file");
  }
  const manifest = Fs.readFileSync(manifestPath, "utf8");
  const files: Array<{ path: string; contents: Uint8Array }> = [];

  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = Fs.readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (relativePath === "manifest.json") continue;
      const absolutePath = Path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Bundle contains a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Bundle contains a non-regular file: ${relativePath}`);
      }
      files.push({ path: relativePath, contents: Fs.readFileSync(absolutePath) });
    }
  };

  visit(root, "");
  return { manifest, files };
}

function toPlannedWrites(plan: SetupApplyPlan, home: string): PlannedWrite[] {
  const writes: PlannedWrite[] = [
    ...plan.resourceWrites.map((write) => ({
      kind: "resource" as const,
      ...write,
      relativePath: homeRelativePath(home, write.path),
    })),
  ];
  if (plan.settingsWrite) {
    writes.push({
      kind: "settings",
      path: plan.settingsWrite.path,
      relativePath: homeRelativePath(home, plan.settingsWrite.path),
      contents: new TextEncoder().encode(plan.settingsWrite.contents),
      expectedCurrentDigest: null,
    });
  }
  if (plan.installationRecordWrite) {
    writes.push({
      kind: "installation_record",
      path: plan.installationRecordWrite.path,
      relativePath: homeRelativePath(home, plan.installationRecordWrite.path),
      contents: new TextEncoder().encode(plan.installationRecordWrite.contents),
      expectedCurrentDigest: plan.installationRecordWrite.expectedCurrentDigest,
    });
  }
  return writes;
}

function homeRelativePath(home: string, targetPath: string): string {
  const relative = Path.relative(home, targetPath);
  if (
    relative.length === 0 ||
    Path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${Path.sep}`)
  ) {
    throw new Error(`Setup target is outside the Kepler global home: ${targetPath}`);
  }
  return relative;
}

function matchesExpected(
  state: SetupPathState,
  expectedDigest: string | null,
): boolean {
  if (expectedDigest === null) return state.kind === "missing";
  return (
    state.kind === "file" && sha256Digest(state.contents) === expectedDigest
  );
}

function createParentDirectories(path: string): void {
  Fs.mkdirSync(Path.dirname(path), { recursive: true });
}

function ensureSafeTargetParents(home: string, targetPath: string): void {
  const relative = homeRelativePath(home, targetPath);
  let parent = home;
  const segments = relative.split(Path.sep).slice(0, -1);
  for (const segment of segments) {
    parent = Path.join(parent, segment);
    try {
      const stat = Fs.lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Unsafe setup parent directory: ${parent}`);
      }
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      Fs.mkdirSync(parent);
    }
  }
}

function writeRecoveryJournal(path: string, journal: RecoveryJournal): void {
  const temporary = `${path}.tmp`;
  Fs.writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, {
    flag: "w",
    mode: 0o600,
  });
  Fs.renameSync(temporary, path);
}

function parseRecoveryJournal(content: string): RecoveryJournal {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Recovery journal is not valid JSON: ${errorMessage(error)}`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("owner" in value) ||
    value.owner !== "kepler-setup" ||
    !("format_version" in value) ||
    value.format_version !== 1 ||
    !("state" in value) ||
    !["preparing", "applying", "recovery_required", "committed"].includes(
      String(value.state),
    ) ||
    !("generation_id" in value) ||
    typeof value.generation_id !== "string" ||
    !("previous_generation_id" in value) ||
    !(value.previous_generation_id === null ||
      typeof value.previous_generation_id === "string") ||
    !("writes" in value) ||
    !Array.isArray(value.writes) ||
    !("completed_paths" in value) ||
    !Array.isArray(value.completed_paths)
  ) {
    throw new Error("Invalid Kepler setup recovery journal");
  }
  return value as RecoveryJournal;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function removeOwnedDirectory(path: string): string | undefined {
  try {
    Fs.rmSync(path, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    return errorMessage(error);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
