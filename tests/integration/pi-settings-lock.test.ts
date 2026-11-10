import { execa } from "execa";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];
const settingsLockModule = pathToFileURL(
  Path.resolve(import.meta.dirname, "../../packages/cli/src/cli/pi-settings-lock.ts"),
).href;

function createSettingsFile(): { root: string; settingsPath: string; lockPath: string } {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-settings-lock-"));
  temporaryRoots.push(root);
  const settingsPath = Path.join(root, "settings.json");
  Fs.writeFileSync(settingsPath, '{"packages":[],"models":{}}\n');
  return { root, settingsPath, lockPath: `${settingsPath}.lock` };
}

function lockIdentity(path: string): string {
  const stat = Fs.lstatSync(path);
  return `${stat.dev}:${stat.ino}`;
}

async function acquire(settingsPath: string): Promise<{ release(): void }> {
  const module = await import(settingsLockModule) as {
    acquirePiSettingsLock(path: string): { release(): void };
  };
  return module.acquirePiSettingsLock(settingsPath);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("Pi native settings lock adapter", () => {
  it("does not take over or modify an aged holder", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    Fs.mkdirSync(lockPath);
    const old = new Date(Date.now() - 120_000);
    Fs.utimesSync(lockPath, old, old);
    const before = lockIdentity(lockPath);

    await expect(acquire(settingsPath)).rejects.toMatchObject({ code: "ELOCKED" });

    expect(lockIdentity(lockPath)).toBe(before);
    expect(Fs.statSync(lockPath).mtimeMs).toBeLessThan(Date.now() - 60_000);
  });

  it("does not take over or modify a fresh holder", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    Fs.mkdirSync(lockPath);
    const before = lockIdentity(lockPath);
    const mtime = Fs.statSync(lockPath).mtimeMs;

    await expect(acquire(settingsPath)).rejects.toMatchObject({ code: "ELOCKED" });

    expect(lockIdentity(lockPath)).toBe(before);
    expect(Fs.statSync(lockPath).mtimeMs).toBe(mtime);
  });

  it("releases only the exact lock directory it acquired", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    const owned = await acquire(settingsPath);
    const acquiredIdentity = lockIdentity(lockPath);
    const replacementPath = Path.join(Path.dirname(lockPath), "replacement-lock");
    Fs.mkdirSync(replacementPath);
    const replacementIdentity = lockIdentity(replacementPath);
    expect(replacementIdentity).not.toBe(acquiredIdentity);
    Fs.rmSync(lockPath, { recursive: true });
    Fs.renameSync(replacementPath, lockPath);

    expect(() => owned.release()).toThrow(/holder changed/i);

    expect(Fs.existsSync(lockPath)).toBe(true);
    expect(lockIdentity(lockPath)).toBe(replacementIdentity);
  });

  it("preserves unknown contents inside the owned lock directory", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    const owned = await acquire(settingsPath);
    const unknownPath = Path.join(lockPath, "unknown-holder-data");
    Fs.writeFileSync(unknownPath, "preserve me\n");
    const marker = Path.join(lockPath, "kepler-owner");
    const markerBytes = Fs.readFileSync(marker);

    expect(() => owned.release()).toThrow(/holder changed/i);

    expect(Fs.readFileSync(unknownPath, "utf8")).toBe("preserve me\n");
    expect(Fs.readFileSync(marker)).toEqual(markerBytes);
    expect(Fs.existsSync(lockPath)).toBe(true);
  });

  it("removes its own lock on normal release", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    const owned = await acquire(settingsPath);

    owned.release();

    expect(Fs.existsSync(lockPath)).toBe(false);
  });

  it("preserves a replacement holder during process-exit cleanup", async () => {
    const { settingsPath, lockPath } = createSettingsFile();
    const childScript = [
      `const module = await import(${JSON.stringify(settingsLockModule)});`,
      `module.acquirePiSettingsLock(process.env.KEPLER_TEST_SETTINGS);`,
      'process.stdout.write("READY\\n");',
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const child = execa(process.execPath, ["--eval", childScript], {
      env: { KEPLER_TEST_SETTINGS: settingsPath },
      extendEnv: false,
      reject: false,
      cleanup: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Uint8Array) => {
      stdout += new TextDecoder().decode(chunk);
    });
    child.stderr?.on("data", (chunk: Uint8Array) => {
      stderr += new TextDecoder().decode(chunk);
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("lock child did not start")), 5000);
      child.stdout?.on("data", () => {
        if (stdout.includes("READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`lock child exited before acquiring its lock: ${stderr}`));
      });
    });

    const replacementPath = Path.join(Path.dirname(lockPath), "replacement-lock");
    Fs.mkdirSync(replacementPath);
    const replacementIdentity = lockIdentity(replacementPath);
    Fs.rmSync(lockPath, { recursive: true });
    Fs.renameSync(replacementPath, lockPath);
    child.kill("SIGTERM");
    await child;

    expect(lockIdentity(lockPath)).toBe(replacementIdentity);
    expect(stdout).toContain("READY");
  });
});
