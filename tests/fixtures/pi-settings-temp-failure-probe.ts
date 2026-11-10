import Fs from "node:fs";
import * as Path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { createSetupApplicationFixture } from "../helpers/setup-application-fixture.js";

const patchableFs = Fs as unknown as { lstatSync: typeof Fs.lstatSync };
const mode = process.env.KEPLER_SETTINGS_TEMP_FAILURE_MODE;
if (!mode || !["identity-failure", "cleanup-failure", "cleanup-success", "replacement", "drift-cleanup-failure"].includes(mode)) {
  throw new Error("A supported settings temporary failure mode is required");
}

const fixture = createSetupApplicationFixture();
const settingsPath = Path.join(fixture.agentDirectory, "settings.json");
const selectorPath = Path.join(fixture.root, ".kepler-dist", "current");
const receiptPath = Path.join(fixture.root, ".config", "vialactea-works", "kepler", "installation.json");
let report: Record<string, unknown>;
try {
  fixture.createService().setup();
  const selectorBefore = Fs.readlinkSync(selectorPath);
  const receiptBefore = Fs.readFileSync(receiptPath);
  const settings = JSON.parse(Fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown> & {
    packages: unknown[];
  };
  const packageSource = Path.join(fixture.root, ".kepler-dist", "current");
  const packages = settings.packages.filter((entry) => entry !== packageSource);
  if (packages.length === settings.packages.length) {
    throw new Error("The setup fixture is missing its registered Kepler package entry");
  }
  const userSettings = {
    ...settings,
    packages,
    customUserData: { preserve: true, nested: ["user-owned"] },
  };
  Fs.writeFileSync(settingsPath, `${JSON.stringify(userSettings, null, 2)}\n`);
  const settingsBefore = Fs.readFileSync(settingsPath);
  const originalOpen = Fs.openSync;
  const originalFstat = Fs.fstatSync;
  const originalFsync = Fs.fsyncSync;
  const originalLstat = Fs.lstatSync;
  const originalUnlink = Fs.unlinkSync;
  const originalWriteFile = Fs.writeFileSync;
  let temporaryPath: string | undefined;
  let temporaryDescriptor: number | undefined;
  let identityFailureInjected = false;
  let syncFailureInjected = false;
  let temporaryFlushed = false;
  let externalEditWritten = false;
  let replacementCreated = false;
  const externalEdit = Buffer.from('{"packages":["npm:external-package@1.0.0"],"externalEdit":true}\n');
  const shouldInjectFailure = (path: Fs.PathLike): boolean =>
    String(path).startsWith(`${settingsPath}.kepler-`) && String(path).endsWith(".tmp");

  try {
    Fs.openSync = ((path: Fs.PathLike, flags: Fs.OpenMode, fileMode?: Fs.Mode) => {
      const descriptor = originalOpen(path, flags, fileMode);
      if (shouldInjectFailure(path)) {
        temporaryPath = String(path);
        temporaryDescriptor = descriptor;
      }
      return descriptor;
    }) as typeof Fs.openSync;
    Fs.fstatSync = ((descriptor: number, options?: unknown) => {
      if (mode === "identity-failure" && descriptor === temporaryDescriptor && !identityFailureInjected) {
        identityFailureInjected = true;
        throw new Error("injected owned temporary fstat failure");
      }
      return originalFstat(descriptor, options as never);
    }) as typeof Fs.fstatSync;
    Fs.fsyncSync = ((descriptor: number) => {
      if (
        ["cleanup-failure", "cleanup-success", "replacement"].includes(mode ?? "") &&
        descriptor === temporaryDescriptor &&
        !syncFailureInjected
      ) {
        syncFailureInjected = true;
        throw new Error("injected settings temporary fsync failure");
      }
      const result = originalFsync(descriptor);
      if (mode === "drift-cleanup-failure" && descriptor === temporaryDescriptor) {
        temporaryFlushed = true;
      }
      return result;
    }) as typeof Fs.fsyncSync;
    Fs.unlinkSync = ((path: Fs.PathLike) => {
      if (["cleanup-failure", "drift-cleanup-failure"].includes(mode ?? "") && String(path) === temporaryPath) {
        throw new Error("injected settings temporary unlink failure");
      }
      return originalUnlink(path);
    }) as typeof Fs.unlinkSync;
    patchableFs.lstatSync = ((path: Fs.PathLike, options?: unknown) => {
      if (
        mode === "drift-cleanup-failure" &&
        temporaryFlushed &&
        String(path) === settingsPath &&
        !externalEditWritten
      ) {
        externalEditWritten = true;
        originalWriteFile(settingsPath, externalEdit);
      }
      if (mode === "replacement" && String(path) === temporaryPath && !replacementCreated) {
        replacementCreated = true;
        originalUnlink(String(path));
        const descriptor = originalOpen(String(path), "wx", 0o600);
        try {
          originalWriteFile(descriptor, "preserve replacement temporary\n", "utf8");
        } finally {
          Fs.closeSync(descriptor);
        }
      }
      return originalLstat(path, options as never);
    }) as typeof Fs.lstatSync;
    syncBuiltinESMExports();

    let error: unknown;
    try {
      fixture.createService().setup();
    } catch (caught) {
      error = caught;
    }
    if (!error) throw new Error("Setup unexpectedly succeeded after the injected settings failure");
    const failure = error as Error & {
      readonly code?: string;
      readonly cause?: unknown;
      readonly details?: Record<string, unknown>;
    };
    const residualTemporaryFiles = Fs.readdirSync(Path.dirname(settingsPath))
      .filter((name) => name.startsWith(`${Path.basename(settingsPath)}.kepler-`) && name.endsWith(".tmp"))
      .map((name) => {
        const path = Path.join(Path.dirname(settingsPath), name);
        return {
          path,
          content: Fs.readFileSync(path, "utf8"),
          identity: { dev: Fs.lstatSync(path).dev, ino: Fs.lstatSync(path).ino },
        };
      });
    const journalPath = failure.details?.recovery_journal_path;
    const journal = typeof journalPath === "string"
      ? JSON.parse(Fs.readFileSync(journalPath, "utf8")) as Record<string, unknown>
      : undefined;
    report = {
      mode,
      error: {
        code: failure.code,
        message: failure.message,
        cause: failure.cause instanceof Error
          ? { name: failure.cause.name, message: failure.cause.message, cause: failure.cause.cause instanceof Error ? failure.cause.cause.message : undefined }
          : failure.cause,
        details: failure.details,
      },
      settingsUnchanged: Fs.readFileSync(settingsPath).equals(settingsBefore),
      externalEditPreserved: mode === "drift-cleanup-failure" && Fs.readFileSync(settingsPath).equals(externalEdit),
      selectorUnchanged: Fs.readlinkSync(selectorPath) === selectorBefore,
      receiptUnchanged: Fs.readFileSync(receiptPath).equals(receiptBefore),
      residualTemporaryFiles,
      journal: journal
        ? { path: journalPath, state: journal.state, failure: journal.failure, effects: journal.effects }
        : undefined,
    };
  } finally {
    Fs.openSync = originalOpen;
    Fs.fstatSync = originalFstat;
    Fs.fsyncSync = originalFsync;
    patchableFs.lstatSync = originalLstat;
    Fs.unlinkSync = originalUnlink;
    Fs.writeFileSync = originalWriteFile;
    syncBuiltinESMExports();
  }
} finally {
  fixture.cleanup();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
