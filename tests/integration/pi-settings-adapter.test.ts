import { execa } from "execa";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  packageRegistrationEntryDigest,
  planPiPackageRegistration,
  readPiSettingsSnapshot,
  registerPiPackage,
} from "../../packages/cli/src/cli/pi-settings-adapter.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import { acquirePiSettingsLock } from "../../packages/cli/src/cli/pi-settings-lock.js";
import { classifyNativePiCli } from "../helpers/native-pi-host.js";

const piBinary = process.env.KEPLER_PI_BINARY;
const nodeBinary = process.env.KEPLER_PI_NODE_BINARY;
const sdkEntryPath = process.env.KEPLER_PI_SDK_ENTRY_PATH;
const piCliKind = piBinary ? classifyNativePiCli(piBinary) : undefined;
const nativeSettingsProbe = Path.resolve(import.meta.dirname, "../fixtures/pi-settings-probe.ts");
const skipUnconfigured = !piBinary && process.env.CI !== "true";
if (piCliKind === "npm" && (!nodeBinary || !sdkEntryPath)) {
  throw new Error("npm-based Pi settings tests require the selected Node and public Pi SDK entry paths");
}
const temporaryRoots: string[] = [];

function createPiRoots(): {
  readonly root: string;
  readonly home: string;
  readonly agentDirectory: string;
  readonly workDirectory: string;
  readonly tempDirectory: string;
  readonly settingsPath: string;
  readonly reportPath: string;
} {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-settings-native-"));
  temporaryRoots.push(root);
  const home = Path.join(root, "home");
  const agentDirectory = Path.join(root, "agent");
  const workDirectory = Path.join(root, "work");
  const tempDirectory = Path.join(root, "tmp");
  for (const directory of [home, agentDirectory, workDirectory, tempDirectory]) {
    Fs.mkdirSync(directory, { recursive: true });
  }
  const settingsPath = Path.join(agentDirectory, "settings.json");
  Fs.writeFileSync(settingsPath, `${JSON.stringify({
    packages: ["npm:unrelated-package@1.0.0", { source: "./custom", skills: [] }],
    customSentinel: { preserve: true },
  }, null, 2)}\n`);
  return {
    root,
    home,
    agentDirectory,
    workDirectory,
    tempDirectory,
    settingsPath,
    reportPath: Path.join(root, "native-settings-report.json"),
  };
}

async function runPiSettingsProbe(root: ReturnType<typeof createPiRoots>) {
  if (!piBinary) throw new Error("KEPLER_PI_BINARY is required for native settings proof");
  const path = [
    ...(nodeBinary && piCliKind === "npm" ? [Path.dirname(nodeBinary)] : []),
    "/usr/bin",
    "/bin",
  ].join(Path.delimiter);
  const version = await execa(piBinary, ["--version"], {
    cwd: root.workDirectory,
    env: { PATH: path, HOME: root.home, PI_OFFLINE: "1" },
    extendEnv: false,
    timeout: 20_000,
  });
  expect(version.stdout.trim()).toBe("1.2.0");
  if (piCliKind === "npm") {
    if (!nodeBinary || !sdkEntryPath) throw new Error("npm-based Pi requires its selected Node and public SDK entry");
    const packageRoot = Path.resolve(Path.dirname(Fs.realpathSync(piBinary)), "../..");
    const sdkPath = Fs.realpathSync(sdkEntryPath);
    const relativeSdkPath = Path.relative(packageRoot, sdkPath);
    if (relativeSdkPath !== Path.join("dist", "index.js")) {
      throw new Error("npm-based Pi settings proof requires the public SDK at dist/index.js inside the configured Pi package");
    }
    const compiledProbe = Path.join(root.root, "pi-settings-probe.mjs");
    const source = Fs.readFileSync(nativeSettingsProbe, "utf8");
    const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
    Fs.writeFileSync(compiledProbe, transpiler.transformSync(source), { mode: 0o600 });
    await execa(nodeBinary, [compiledProbe], {
      cwd: root.workDirectory,
      env: {
        PATH: path,
        HOME: root.home,
        USERPROFILE: root.home,
        TMPDIR: root.tempDirectory,
        PI_CODING_AGENT_DIR: root.agentDirectory,
        PI_OFFLINE: "1",
        KEPLER_PI_SETTINGS_REPORT: root.reportPath,
        KEPLER_PI_SDK_ENTRY_PATH: sdkEntryPath,
        KEPLER_PI_PROBE_RUN_DIRECT: "1",
        TERM: "dumb",
        NO_COLOR: "1",
      },
      extendEnv: false,
      timeout: 30_000,
    });
  } else {
    const result = await execa(
      piBinary,
      [
        "--offline",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-mcp",
        "--no-session",
        "--no-approve",
        "--extension",
        nativeSettingsProbe,
        "--help",
      ],
      {
        cwd: root.workDirectory,
        env: {
          PATH: path,
          HOME: root.home,
          USERPROFILE: root.home,
          TMPDIR: root.tempDirectory,
          PI_CODING_AGENT_DIR: root.agentDirectory,
          PI_OFFLINE: "1",
          KEPLER_PI_SETTINGS_REPORT: root.reportPath,
          TERM: "dumb",
          NO_COLOR: "1",
        },
        extendEnv: false,
        timeout: 30_000,
      },
    );
    expect(result.exitCode).toBe(0);
  }
  return JSON.parse(Fs.readFileSync(root.reportPath, "utf8")) as {
    readonly errors: readonly { readonly code: string | null; readonly message: string }[];
    readonly current: Record<string, unknown>;
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("Pi settings registration", () => {
  it("previews a single exact package-entry replacement without losing unrelated settings", () => {
    const root = createPiRoots();
    const snapshot = readPiSettingsSnapshot(root.settingsPath);
    const priorEntry = snapshot.packages[0];
    const packageSource = Path.join(root.root, ".kepler-dist", "current");
    const plan = planPiPackageRegistration(snapshot, packageSource, {
      source: "npm:unrelated-package@1.0.0",
      packageIndex: 0,
      expectedEntry: priorEntry,
      operation: "replace",
    });
    const updated = JSON.parse(new TextDecoder().decode(plan.contents)) as Record<string, unknown>;

    expect(updated.customSentinel).toEqual({ preserve: true });
    expect(updated.packages).toEqual([
      packageSource,
      { source: "./custom", skills: [] },
    ]);
    expect(plan.entryDigest).toBe(packageRegistrationEntryDigest(packageSource));
    expect(Fs.readFileSync(root.settingsPath)).not.toEqual(plan.contents);
  });

  it("rejects stale transfer consent at the native write boundary", () => {
    const root = createPiRoots();
    const snapshot = readPiSettingsSnapshot(root.settingsPath);
    const original = Fs.readFileSync(root.settingsPath);
    const packageSource = Path.join(root.root, ".kepler-dist", "current");
    const transfer = {
      source: "npm:unrelated-package@1.0.0",
      packageIndex: 0,
      expectedEntry: snapshot.packages[0],
      operation: "replace" as const,
    };
    Fs.writeFileSync(root.settingsPath, `${JSON.stringify({
      ...JSON.parse(original.toString("utf8")),
      userEdit: true,
    })}\n`);

    expect(() => registerPiPackage(snapshot, packageSource, { transfer })).toThrow(
      expect.objectContaining({ code: "settings_drift", effect: "none" }),
    );
    expect(JSON.parse(Fs.readFileSync(root.settingsPath, "utf8"))).toMatchObject({ userEdit: true });
  });

  it("replaces only the consented package entry under the Pi native lock", () => {
    const root = createPiRoots();
    const snapshot = readPiSettingsSnapshot(root.settingsPath);
    const packageSource = Path.join(root.root, ".kepler-dist", "current");
    const transfer = {
      source: "npm:unrelated-package@1.0.0",
      packageIndex: 0,
      expectedEntry: snapshot.packages[0],
      operation: "replace" as const,
    };

    registerPiPackage(snapshot, packageSource, {
      transfer,
      validateTransfer: () => {},
    });

    const current = JSON.parse(Fs.readFileSync(root.settingsPath, "utf8")) as Record<string, unknown>;
    expect(current.customSentinel).toEqual({ preserve: true });
    expect(current.packages).toEqual([
      packageSource,
      { source: "./custom", skills: [] },
    ]);
  });

  it("runs transfer revalidation under the native lock and fails before writing when stale", () => {
    const root = createPiRoots();
    const snapshot = readPiSettingsSnapshot(root.settingsPath);
    const original = Fs.readFileSync(root.settingsPath);
    const packageSource = Path.join(root.root, ".kepler-dist", "current");
    const transfer = {
      source: "npm:unrelated-package@1.0.0",
      packageIndex: 0,
      expectedEntry: snapshot.packages[0],
      operation: "replace" as const,
    };
    let validationCalled = false;

    expect(() => registerPiPackage(snapshot, packageSource, {
      transfer,
      validateTransfer: () => {
        validationCalled = true;
        expect(Fs.existsSync(`${root.settingsPath}.lock`)).toBe(true);
        Fs.writeFileSync(Path.join(root.root, "package-owned-file"), "changed");
        throw new Error("stale transferred package");
      },
    })).toThrow("stale transferred package");

    expect(validationCalled).toBe(true);
    expect(Fs.readFileSync(root.settingsPath)).toEqual(original);
    expect(Fs.existsSync(`${root.settingsPath}.lock`)).toBe(false);
  });
});

describe("Pi 1.2.0 SettingsManager interoperability", () => {
  it.skipIf(skipUnconfigured)("preserves Pi writes and registers Kepler without losing unrelated settings", async () => {
    const root = createPiRoots();

    const native = await runPiSettingsProbe(root);

    expect(native.errors).toEqual([]);
    expect(native.current.defaultThinkingLevel).toBe("low");
    const snapshot = readPiSettingsSnapshot(root.settingsPath);
    const packageSource = Path.join(root.root, "generation-current");
    registerPiPackage(snapshot, packageSource);

    const final = JSON.parse(Fs.readFileSync(root.settingsPath, "utf8")) as Record<string, unknown>;
    expect(final.defaultThinkingLevel).toBe("low");
    expect(final.customSentinel).toEqual({ preserve: true });
    expect(final.packages).toEqual([
      "npm:unrelated-package@1.0.0",
      { source: "./custom", skills: [] },
      packageSource,
    ]);
  });

  it.skipIf(skipUnconfigured)("prevents the native writer from changing settings under a fresh Kepler lock", async () => {
    const root = createPiRoots();
    const original = Fs.readFileSync(root.settingsPath);
    const lock = acquirePiSettingsLock(root.settingsPath);
    const claimPath = `${root.settingsPath}.lock`;
    const identity = Fs.lstatSync(claimPath);
    const ownerPath = Path.join(claimPath, "kepler-owner");
    const ownerToken = Fs.readFileSync(ownerPath, "utf8");

    try {
      const native = await runPiSettingsProbe(root);
      expect(native.errors.map(({ code }) => code)).toContain("ELOCKED");
      expect(Fs.readFileSync(root.settingsPath)).toEqual(original);
      expect(Fs.lstatSync(claimPath).ino).toBe(identity.ino);
      expect(Fs.readFileSync(ownerPath, "utf8")).toBe(ownerToken);
    } finally {
      lock.release();
    }
    expect(Fs.existsSync(claimPath)).toBe(false);
  });

  it.skipIf(skipUnconfigured)("prevents Pi stale reaping from taking an aged Kepler lock", async () => {
    const root = createPiRoots();
    const original = Fs.readFileSync(root.settingsPath);
    const lock = acquirePiSettingsLock(root.settingsPath);
    const claimPath = `${root.settingsPath}.lock`;
    const identity = Fs.lstatSync(claimPath);
    const ownerPath = Path.join(claimPath, "kepler-owner");
    const ownerToken = Fs.readFileSync(ownerPath, "utf8");
    const old = new Date(Date.now() - 60_000);
    Fs.utimesSync(claimPath, old, old);

    try {
      const native = await runPiSettingsProbe(root);
      expect(native.errors.map(({ code }) => code)).toContain("ENOTEMPTY");
      expect(Fs.readFileSync(root.settingsPath)).toEqual(original);
      expect(Fs.lstatSync(claimPath).ino).toBe(identity.ino);
      expect(Fs.readFileSync(ownerPath, "utf8")).toBe(ownerToken);
    } finally {
      lock.release();
    }
    expect(Fs.existsSync(claimPath)).toBe(false);
  });
});
