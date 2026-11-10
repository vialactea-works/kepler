import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function makeTemporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-dev-package-e2e-"));
  temporaryRoots.push(root);
  return root;
}

function makeWritable(path: string): void {
  let stat: Fs.Stats;
  try {
    stat = Fs.lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    Fs.chmodSync(path, 0o700);
    for (const entry of Fs.readdirSync(path)) makeWritable(Path.join(path, entry));
  } else {
    Fs.chmodSync(path, 0o600);
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    makeWritable(root);
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("isolated development package workflow", () => {
  it("packages and sets up a complete native candidate without changing stable home or project sentinels", async () => {
    const binary = process.env.KEPLER_PI_BINARY;
    const loader = process.env.KEPLER_PI_SUBAGENTS_ROOT;
    const nodeBinary = process.env.KEPLER_PI_NODE_BINARY;
    if (!binary || !loader) throw new Error("E2E requires actual Pi 1.2.0 and pi-subagents 0.76.1 paths");
    if (process.env.CI && !nodeBinary) throw new Error("CI dev:package E2E requires the selected Node interpreter path");

    const root = makeTemporaryRoot();
    const home = Path.join(root, "protected-home");
    const xdg = Path.join(home, ".config");
    const agent = Path.join(home, ".pi", "agent");
    const project = Path.join(root, "protected-project");
    const temporaryDirectory = Path.join(root, "tmp");
    const stableLauncher = Path.join(home, ".local", "bin", "kepler");
    const selector = Path.join(home, ".kepler-dist", "current");
    const settingsPath = Path.join(agent, "settings.json");
    const projectData = Path.join(project, ".kepler", "history.jsonl");
    const homeSentinel = Buffer.from("do not replace the stable command\n");
    const settingsSentinel = Buffer.from('{"packages":["npm:other@1.0.0"],"sentinel":"keep"}\n');
    const projectSentinel = Buffer.from('{"event":"historical-data"}\n');

    Fs.mkdirSync(Path.dirname(stableLauncher), { recursive: true });
    Fs.mkdirSync(Path.dirname(selector), { recursive: true });
    Fs.mkdirSync(Path.dirname(settingsPath), { recursive: true });
    Fs.mkdirSync(Path.dirname(projectData), { recursive: true });
    Fs.mkdirSync(temporaryDirectory, { recursive: true });
    Fs.writeFileSync(stableLauncher, homeSentinel, { mode: 0o600 });
    Fs.symlinkSync("generations/untouched", selector, "dir");
    Fs.writeFileSync(settingsPath, settingsSentinel);
    Fs.writeFileSync(projectData, projectSentinel);

    const manifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
      readonly scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.["dev:package"]).toBe("bun scripts/dev-package.ts");
    expect(manifest.scripts?.["install-local"]).toBeUndefined();

    const result = await execa(process.execPath, ["scripts/dev-package.ts"], {
      cwd: repositoryRoot,
      env: {
        PATH: [
          ...(nodeBinary ? [Path.dirname(nodeBinary)] : []),
          "/usr/bin",
          "/bin",
        ].join(Path.delimiter),
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: xdg,
        KEPLER_PI_AGENT_DIR: agent,
        KEPLER_PI_BINARY: binary,
        KEPLER_PI_SUBAGENTS_ROOT: loader,
        ...(nodeBinary ? { KEPLER_PI_NODE_BINARY: nodeBinary } : {}),
        TMPDIR: temporaryDirectory,
        LC_ALL: "C.UTF-8",
        NO_COLOR: "1",
        PI_OFFLINE: "1",
        TZ: "UTC",
      },
      extendEnv: false,
      reject: false,
      timeout: 600_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    const summaryLine = result.stdout.split(/\r?\n/).findLast((line) => line.startsWith('{"status":"success"'));
    if (!summaryLine) throw new Error(`dev:package did not emit its result envelope: ${result.stdout}`);
    const summary = JSON.parse(summaryLine) as {
      readonly status?: unknown;
      readonly data?: Record<string, unknown>;
    };
    expect(summary.status).toBe("success");
    expect(summary.data).toMatchObject({
      release: "3.0.0",
      target: expect.stringMatching(/^(linux|darwin)-(x64|arm64)$/),
      sourceKind: "development",
      sourceDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      archiveDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      generationId: expect.any(String),
    });
    expect(Fs.readFileSync(stableLauncher)).toEqual(homeSentinel);
    expect(Fs.readlinkSync(selector)).toBe("generations/untouched");
    expect(Fs.readFileSync(settingsPath)).toEqual(settingsSentinel);
    expect(Fs.readFileSync(projectData)).toEqual(projectSentinel);
    expect(Fs.readdirSync(temporaryDirectory)).toEqual([]);
  }, 600_000);
});
