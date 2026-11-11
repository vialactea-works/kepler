import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { classifyNativePiCli } from "../helpers/native-pi-host.js";

const preflightModule = import.meta.resolve(
  "../../packages/cli/src/cli/pi-preflight.ts",
);
const temporaryRoots: string[] = [];
const supportedLoaderSource = "npm:pi-subagents@0.76.1";
const piBinary = process.env.KEPLER_PI_BINARY;
const nodeBinary = process.env.KEPLER_PI_NODE_BINARY;
const piCliKind = piBinary ? classifyNativePiCli(piBinary) : undefined;
const nativePiPath = nodeBinary
  ? [Path.dirname(nodeBinary), "/usr/bin", "/bin"].join(Path.delimiter)
  : process.env.PATH ?? "";
const skipNativeFilterProof = !piBinary && process.env.CI !== "true";
if (process.env.CI === "true" && piCliKind === "npm" && !nodeBinary) {
  throw new Error("CI npm-based Pi package-filter tests require the selected Node interpreter path");
}

async function preflight() {
  return await import(preflightModule) as {
    preflightPi(options: {
      readonly environment: NodeJS.ProcessEnv;
      readonly projectDirectory: string;
      readonly packageSource: string;
      readonly detectPiVersion?: () => string;
      readonly allowResourceConflicts?: boolean;
    }): {
      readonly host: { readonly id: string; readonly release: string; readonly check: string };
      readonly loader: { readonly id: string; readonly release: string; readonly check: string };
      readonly agentDirectory: string;
      readonly packageDirectory: string;
      readonly piAssetsDirectory?: string;
      readonly settingsPath: string;
      readonly packageSource: string;
      readonly settingsSnapshot: { readonly contentDigest: string; readonly packages: readonly unknown[] };
      readonly conflicts: readonly {
        readonly scope: "user" | "project";
        readonly kind: "agent" | "skill" | "override" | "package" | "settings";
        readonly name: string;
        readonly path: string;
        readonly source?: string;
        readonly package_root?: string;
      }[];
    };
  };
}

function createPiEnvironment(): {
  readonly root: string;
  readonly agentDirectory: string;
  readonly packageDirectory: string;
  readonly piAssetsDirectory: string;
  readonly projectDirectory: string;
  readonly settingsPath: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly packageSource: string;
  readonly detectPiVersion: () => string;
} {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-preflight-"));
  temporaryRoots.push(root);
  const agentDirectory = Path.join(root, "agent");
  const packageDirectory = Path.join(agentDirectory, "npm", "node_modules");
  const piAssetsDirectory = Path.join(root, "pi-assets");
  const projectDirectory = Path.join(root, "project");
  for (const directory of [agentDirectory, packageDirectory, piAssetsDirectory, projectDirectory]) {
    Fs.mkdirSync(directory, { recursive: true });
  }
  const settingsPath = Path.join(agentDirectory, "settings.json");
  Fs.writeFileSync(settingsPath, `${JSON.stringify({
    packages: [supportedLoaderSource],
    skills: [],
    subagents: {},
  })}\n`);
  const loaderPackage = Path.join(packageDirectory, "pi-subagents");
  Fs.mkdirSync(loaderPackage, { recursive: true });
  Fs.writeFileSync(Path.join(loaderPackage, "package.json"), JSON.stringify({
    name: "pi-subagents",
    version: "0.76.1",
    pi: { extensions: ["./index.js"] },
  }));
  Fs.writeFileSync(Path.join(loaderPackage, "index.js"), "export default function piSubagents() {}\n");
  const assetLookalike = Path.join(piAssetsDirectory, "node_modules", "pi-subagents");
  Fs.mkdirSync(assetLookalike, { recursive: true });
  Fs.writeFileSync(Path.join(assetLookalike, "package.json"), JSON.stringify({
    name: "pi-subagents",
    version: "9.9.9",
  }));
  return {
    root,
    agentDirectory,
    packageDirectory,
    piAssetsDirectory,
    projectDirectory,
    settingsPath,
    environment: {
      HOME: root,
      KEPLER_PI_AGENT_DIR: agentDirectory,
      PI_CODING_AGENT_DIR: Path.join(root, "ignored-agent"),
      PI_PACKAGE_DIR: piAssetsDirectory,
    },
    packageSource: Path.join(root, ".kepler-dist", "current"),
    detectPiVersion: () => "1.2.0",
  };
}

function createNativePiFilterEnvironment(): {
  readonly root: string;
  readonly home: string;
  readonly agentDirectory: string;
  readonly projectDirectory: string;
  readonly settingsPath: string;
  readonly projectSettingsPath: string;
  readonly loaderDirectory: string;
  readonly markerPath: string;
} {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-native-filter-"));
  temporaryRoots.push(root);
  const home = Path.join(root, "home");
  const agentDirectory = Path.join(home, ".pi", "agent");
  const projectDirectory = Path.join(root, "project");
  const loaderDirectory = Path.join(root, "loader");
  Fs.mkdirSync(agentDirectory, { recursive: true });
  Fs.mkdirSync(Path.join(projectDirectory, ".pi"), { recursive: true });
  Fs.mkdirSync(loaderDirectory, { recursive: true });
  return {
    root,
    home,
    agentDirectory,
    projectDirectory,
    settingsPath: Path.join(agentDirectory, "settings.json"),
    projectSettingsPath: Path.join(projectDirectory, ".pi", "settings.json"),
    loaderDirectory,
    markerPath: Path.join(root, "extension-loaded"),
  };
}

function writeAgent(root: string, filePath: string, name: string): void {
  const target = Path.join(root, filePath);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, `---\nname: ${name}\ndescription: conflict fixture\n---\nAgent\n`);
}

function writeExecutable(root: string, name: string, source: string): string {
  const executable = Path.join(root, name);
  Fs.writeFileSync(executable, `#!/usr/bin/env node\n${source}\n`);
  Fs.chmodSync(executable, 0o755);
  return executable;
}

function writeSkill(root: string, filePath: string, name: string): void {
  const target = Path.join(root, filePath);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, `---\nname: ${name}\ndescription: conflict fixture\n---\nSkill\n`);
}

function writeNestedLoaderPackage(fixture: ReturnType<typeof createPiEnvironment>): {
  readonly source: string;
  readonly settingsEntry: { readonly source: string; readonly extensions: readonly string[] };
} {
  const packageRoot = Path.join(
    fixture.packageDirectory,
    "@vialactea-works",
    "sagittarius-pi-dev",
  );
  const loaderRoot = Path.join(packageRoot, "node_modules", "pi-subagents");
  Fs.mkdirSync(loaderRoot, { recursive: true });
  Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
    name: "@vialactea-works/sagittarius-pi-dev",
    version: "0.3.18",
    pi: { extensions: ["./node_modules/pi-subagents/index.js"] },
  }));
  Fs.writeFileSync(Path.join(loaderRoot, "package.json"), JSON.stringify({
    name: "pi-subagents",
    version: "0.76.1",
    pi: { extensions: ["./index.js"] },
  }));
  Fs.writeFileSync(Path.join(loaderRoot, "index.js"), "export default function piSubagents() {}\n");
  const source = "npm:@vialactea-works/sagittarius-pi-dev@0.3.18";
  return {
    source,
    settingsEntry: {
      source,
      extensions: ["+node_modules/pi-subagents/index.js"],
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("Pi setup preflight", () => {
  it("resolves the Kepler, Pi, then default agent-directory precedence and reads without writing", async () => {
    const fixture = createPiEnvironment();
    const before = Fs.readFileSync(fixture.settingsPath);
    const module = await preflight();

    const result = module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    });

    expect(result).toMatchObject({
      host: { id: "pi", release: "1.2.0", check: "matches" },
      loader: { id: "pi-subagents", release: "0.76.1", check: "matches" },
      agentDirectory: fixture.agentDirectory,
      packageDirectory: fixture.packageDirectory,
      piAssetsDirectory: fixture.piAssetsDirectory,
      settingsPath: fixture.settingsPath,
      packageSource: fixture.packageSource,
    });
    expect(result.settingsSnapshot.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Fs.readFileSync(fixture.settingsPath)).toEqual(before);
    expect(Fs.existsSync(fixture.packageSource)).toBe(false);
  });

  it("accepts an existing configured local loader without creating an npm cache", async () => {
    const fixture = createPiEnvironment();
    const localLoader = Path.join(fixture.root, "local-pi-subagents");
    Fs.mkdirSync(localLoader, { recursive: true });
    Fs.writeFileSync(Path.join(localLoader, "package.json"), JSON.stringify({
      name: "pi-subagents",
      version: "0.76.1",
      pi: { extensions: ["./index.js"] },
    }));
    Fs.writeFileSync(Path.join(localLoader, "index.js"), "export default function piSubagents() {}\n");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({ packages: [localLoader], skills: [], subagents: {} }));
    Fs.rmSync(Path.join(fixture.agentDirectory, "npm"), { recursive: true });
    const module = await preflight();

    expect(module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    }).loader).toMatchObject({ id: "pi-subagents", release: "0.76.1", check: "matches" });
    expect(Fs.existsSync(Path.join(fixture.agentDirectory, "npm"))).toBe(false);
  });

  it("rejects cached pi-subagents metadata when no settings package enables it", async () => {
    const fixture = createPiEnvironment();
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({ packages: [], skills: [], subagents: {} }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/configured.*pi-subagents|pi-subagents.*configured/i);
  });

  it("requires an enabled, existing direct loader extension entry", async () => {
    const fixture = createPiEnvironment();
    Fs.rmSync(Path.join(fixture.packageDirectory, "pi-subagents", "index.js"));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*entry|entry.*pi-subagents/i);
  });

  it("requires the package filter to enable the direct loader extension", async () => {
    const fixture = createPiEnvironment();
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [{ source: supportedLoaderSource, extensions: ["-index.js"] }],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*enabled|enabled.*pi-subagents/i);
  });

  it("rejects a project package replacement that disables the personal loader entry", async () => {
    const fixture = createPiEnvironment();
    const projectPiDirectory = Path.join(fixture.projectDirectory, ".pi");
    const projectLoader = Path.join(projectPiDirectory, "npm", "node_modules", "pi-subagents");
    Fs.mkdirSync(projectLoader, { recursive: true });
    Fs.writeFileSync(Path.join(projectLoader, "package.json"), JSON.stringify({
      name: "pi-subagents",
      version: "0.76.1",
      pi: { extensions: ["./index.js"] },
    }));
    Fs.writeFileSync(Path.join(projectLoader, "index.js"), "export default function piSubagents() {}\n");
    Fs.writeFileSync(Path.join(projectPiDirectory, "settings.json"), JSON.stringify({
      packages: [{ source: supportedLoaderSource, extensions: [] }],
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*configured enabled entry/i);
  });

  it("lets a project +path delta explicitly include a personal-package loader", async () => {
    const fixture = createPiEnvironment();
    const loaderRoot = Path.join(fixture.packageDirectory, "pi-subagents");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [{ source: loaderRoot, extensions: [] }],
      skills: [],
      subagents: {},
    }));
    Fs.mkdirSync(Path.join(fixture.projectDirectory, ".pi"), { recursive: true });
    Fs.writeFileSync(Path.join(fixture.projectDirectory, ".pi", "settings.json"), JSON.stringify({
      packages: [{ source: loaderRoot, autoload: false, extensions: ["+index.js"] }],
    }));
    const module = await preflight();

    expect(module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    }).loader).toMatchObject({ id: "pi-subagents", release: "0.76.1", check: "matches" });
  });

  it("applies an autoload-false project delta to the personal package", async () => {
    const fixture = createPiEnvironment();
    const projectPiDirectory = Path.join(fixture.projectDirectory, ".pi");
    const projectLoader = Path.join(projectPiDirectory, "npm", "node_modules", "pi-subagents");
    Fs.mkdirSync(projectLoader, { recursive: true });
    Fs.writeFileSync(Path.join(projectLoader, "package.json"), JSON.stringify({
      name: "pi-subagents",
      version: "0.76.1",
      pi: { extensions: ["./index.js"] },
    }));
    Fs.writeFileSync(Path.join(projectLoader, "index.js"), "export default function piSubagents() {}\n");
    Fs.writeFileSync(Path.join(projectPiDirectory, "settings.json"), JSON.stringify({
      packages: [{
        source: supportedLoaderSource,
        autoload: false,
        extensions: ["-index.js"],
      }],
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*configured enabled entry/i);
  });

  it("accepts the loader when a positive package extension glob selects its declared entry", async () => {
    const fixture = createPiEnvironment();
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [{ source: supportedLoaderSource, extensions: ["*.js"] }],
    }));
    const module = await preflight();

    expect(module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    }).loader).toMatchObject({ id: "pi-subagents", release: "0.76.1", check: "matches" });
  });

  it("rejects a current-project extension exclusion of the user-registered loader", async () => {
    const fixture = createPiEnvironment();
    const projectPiDirectory = Path.join(fixture.projectDirectory, ".pi");
    Fs.mkdirSync(projectPiDirectory, { recursive: true });
    const loaderEntry = Path.join(fixture.packageDirectory, "pi-subagents", "index.js");
    Fs.writeFileSync(Path.join(projectPiDirectory, "settings.json"), JSON.stringify({
      extensions: [`-${loaderEntry}`],
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*configured enabled entry/i);
  });

  it("accepts the configured parent package and existing nested loader entry", async () => {
    const fixture = createPiEnvironment();
    Fs.rmSync(Path.join(fixture.packageDirectory, "pi-subagents"), { recursive: true });
    const nested = writeNestedLoaderPackage(fixture);
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [nested.settingsEntry],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    expect(module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    }).loader).toMatchObject({ id: "pi-subagents", release: "0.76.1", check: "matches" });
  });

  it("rejects a configured helper file that is not the loader's declared extension entry", async () => {
    const fixture = createPiEnvironment();
    Fs.rmSync(Path.join(fixture.packageDirectory, "pi-subagents"), { recursive: true });
    const nested = writeNestedLoaderPackage(fixture);
    const packageRoot = Path.join(
      fixture.packageDirectory,
      "@vialactea-works",
      "sagittarius-pi-dev",
    );
    const loaderRoot = Path.join(packageRoot, "node_modules", "pi-subagents");
    Fs.writeFileSync(Path.join(loaderRoot, "helper.js"), "export const helper = true;\n");
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
      name: "@vialactea-works/sagittarius-pi-dev",
      version: "0.3.18",
      pi: { extensions: ["./node_modules/pi-subagents/helper.js"] },
    }));
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [{
        source: nested.source,
        extensions: ["+node_modules/pi-subagents/helper.js"],
      }],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/pi-subagents.*configured enabled entry|pi-subagents.*existing enabled extension entry file/i);
  });

  it("rejects ambiguous configured loader roots and unsupported nested versions", async () => {
    const fixture = createPiEnvironment();
    const nested = writeNestedLoaderPackage(fixture);
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource, nested.settingsEntry],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/ambiguous.*pi-subagents|pi-subagents.*ambiguous/i);

    Fs.writeFileSync(Path.join(fixture.packageDirectory, "pi-subagents", "package.json"), JSON.stringify({
      name: "pi-subagents",
      version: "0.75.0",
      pi: { extensions: ["./index.js"] },
    }));
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource],
      skills: [],
      subagents: {},
    }));
    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/unsupported.*pi-subagents|pi-subagents.*unsupported/i);
  });

  it("uses the explicitly selected Pi binary and rejects an unsupported version", async () => {
    const fixture = createPiEnvironment();
    const executable = writeExecutable(fixture.root, "pi-unsupported", 'process.stdout.write("Pi 9.9.9\\n");');
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: { ...fixture.environment, KEPLER_PI_BINARY: executable },
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
    })).toThrow(/unsupported Pi version 9.9.9/i);
  });

  it("bounds Pi version probing and preserves the subprocess timeout error", async () => {
    const fixture = createPiEnvironment();
    const executable = writeExecutable(
      fixture.root,
      "pi-stalled",
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);",
    );
    const module = await preflight();
    let thrown: unknown;

    try {
      module.preflightPi({
        environment: { ...fixture.environment, KEPLER_PI_BINARY: executable },
        projectDirectory: fixture.projectDirectory,
        packageSource: fixture.packageSource,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "pi_unavailable" });
    expect((thrown as Error).cause).toMatchObject({ code: "ETIMEDOUT" });
  }, 10_000);

  it("fails before creating or changing settings when the selected directory lacks settings.json", async () => {
    const fixture = createPiEnvironment();
    Fs.rmSync(fixture.settingsPath);
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/existing regular file/i);

    expect(Fs.existsSync(fixture.settingsPath)).toBe(false);
  });

  it("fails closed for unknown Pi versions or missing and unsupported loaders", async () => {
    const fixture = createPiEnvironment();
    const module = await preflight();
    const options = {
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
    };

    expect(() => module.preflightPi({ ...options, detectPiVersion: () => "unknown" }))
      .toThrow(/unsupported Pi version/i);
    Fs.rmSync(Path.join(fixture.packageDirectory, "pi-subagents"), { recursive: true });
    expect(() => module.preflightPi({ ...options, detectPiVersion: fixture.detectPiVersion }))
      .toThrow(/pi-subagents.*no configured enabled entry|pi-subagents.*no existing enabled extension entry file/i);
  });

  it("blocks a user role override and user agent definition that shadow Kepler", async () => {
    const fixture = createPiEnvironment();
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource],
      skills: [],
      subagents: { agentOverrides: { "kepler-coder": { description: "custom" } } },
    }));
    writeAgent(fixture.agentDirectory, "agents/custom.md", "kepler-coder");
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-coder.*agentOverrides|agentOverrides.*kepler-coder/i);
  });

  it("blocks provider-specific role overrides in project settings", async () => {
    const fixture = createPiEnvironment();
    Fs.mkdirSync(Path.join(fixture.projectDirectory, ".pi"), { recursive: true });
    Fs.writeFileSync(Path.join(fixture.projectDirectory, ".pi/settings.json"), JSON.stringify({
      packages: [],
      subagents: {
        agentOverridesByProvider: {
          openai: { "kepler-reviewer": { model: "custom-model" } },
        },
      },
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-reviewer.*agentOverridesByProvider/i);
  });

  it("blocks current-project skill and role collisions in the visible scope", async () => {
    const fixture = createPiEnvironment();
    writeSkill(fixture.projectDirectory, ".pi/skills/custom/SKILL.md", "kepler-code");
    writeAgent(fixture.projectDirectory, ".pi/agents/custom.md", "kepler-reviewer");
    Fs.writeFileSync(Path.join(fixture.projectDirectory, ".pi/settings.json"), JSON.stringify({
      skills: ["./skills/custom"],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-code.*skills|kepler-reviewer.*agent/i);
  });

  it("blocks a same-name role from the user's default .agents directory", async () => {
    const fixture = createPiEnvironment();
    writeAgent(fixture.root, ".agents/custom.md", "kepler-coder");
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-coder.*\.agents/i);
  });

  it("blocks roles from additional agent directories exposed to the loader", async () => {
    const fixture = createPiEnvironment();
    const extraDirectory = Path.join(fixture.root, "extra-agents");
    writeAgent(extraDirectory, "custom.md", "kepler-orchestrator");
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: {
        ...fixture.environment,
        PI_SUBAGENT_EXTRA_AGENT_DIRS: extraDirectory,
      },
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-orchestrator.*custom.md/i);
  });

  it("blocks roles discovered in the loader's installed npm package roots", async () => {
    const fixture = createPiEnvironment();
    const packageRoot = Path.join(fixture.packageDirectory, "@example", "role-pack");
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
      name: "@example/role-pack",
      version: "1.0.0",
      pi: { subagents: { agents: ["agents"] } },
    }));
    writeAgent(packageRoot, "agents/role.md", "kepler-reviewer");
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-reviewer.*role.md/i);
  });

  it("blocks a project npm package role using the project package root", async () => {
    const fixture = createPiEnvironment();
    const packageRoot = Path.join(fixture.projectDirectory, ".pi", "npm", "node_modules", "@example", "project-tools");
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
      name: "@example/project-tools",
      version: "1.0.0",
      pi: { subagents: { agents: ["agents"] } },
    }));
    writeAgent(packageRoot, "agents/role.md", "kepler-architect");
    Fs.writeFileSync(Path.join(fixture.projectDirectory, ".pi/settings.json"), JSON.stringify({
      packages: ["npm:@example/project-tools@1.0.0"],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-architect.*role.md/i);
  });

  it("blocks a same-name role discovered through user agentScanDirs", async () => {
    const fixture = createPiEnvironment();
    writeAgent(fixture.agentDirectory, "custom-agents/role.md", "kepler-architect");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource],
      skills: [],
      subagents: { agentScanDirs: ["./custom-agents"] },
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-architect.*role.md/i);
  });

  it("returns exact package provenance for explicitly planned native ownership transfer", async () => {
    const fixture = createPiEnvironment();
    const source = "npm:@example/skill-pack@1.0.0";
    const packageRoot = Path.join(fixture.packageDirectory, "@example", "skill-pack");
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
      name: "@example/skill-pack",
      version: "1.0.0",
      pi: { skills: ["skills"] },
    }));
    writeSkill(packageRoot, "skills/custom/SKILL.md", "kepler-quality");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource, source],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    const result = module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
      allowResourceConflicts: true,
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        scope: "user",
        kind: "skill",
        name: "kepler-quality",
        source,
        package_root: packageRoot,
        path: Path.join(packageRoot, "skills/custom/SKILL.md"),
      }),
    ]);
  });

  it("blocks a same-name skill from an npm package resource", async () => {
    const fixture = createPiEnvironment();
    const packageRoot = Path.join(fixture.packageDirectory, "@example", "pi-tools");
    Fs.mkdirSync(Path.join(packageRoot, "skills", "custom"), { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "package.json"), JSON.stringify({
      name: "@example/pi-tools",
      version: "1.0.0",
      pi: { skills: ["skills"] },
    }));
    writeSkill(packageRoot, "skills/custom/SKILL.md", "kepler-quality");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource, "npm:@example/pi-tools@1.0.0"],
      skills: [],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-quality.*SKILL.md/i);
  });

  it("blocks a same-name skill from a directly configured user resource", async () => {
    const fixture = createPiEnvironment();
    writeSkill(fixture.agentDirectory, "skills/custom/SKILL.md", "kepler-plan");
    Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
      packages: [supportedLoaderSource],
      skills: ["./skills/custom"],
      subagents: {},
    }));
    const module = await preflight();

    expect(() => module.preflightPi({
      environment: fixture.environment,
      projectDirectory: fixture.projectDirectory,
      packageSource: fixture.packageSource,
      detectPiVersion: fixture.detectPiVersion,
    })).toThrow(/kepler-plan.*skill/i);
  });
});

describe("Pi 1.2.0 package filter interoperability", () => {
  const cases = [
    { name: "baseline", extensionPath: "./index.js", filter: undefined, project: "none", enabled: true },
    { name: "project replacement", extensionPath: "./index.js", filter: undefined, project: "replace", enabled: false },
    { name: "autoload false delta", extensionPath: "./index.js", filter: undefined, project: "delta", enabled: false },
    { name: "autoload false force include delta", extensionPath: "./index.js", filter: [], project: "force-include", enabled: true },
    { name: "positive extension glob", extensionPath: "./extensions/loader.ts", filter: ["extensions/*.ts"], project: "none", enabled: true }
  ] as const;

  for (const scenario of cases) {
    it.skipIf(skipNativeFilterProof)(`matches native Pi and Kepler preflight for ${scenario.name}`, async () => {
      if (!piBinary) throw new Error("KEPLER_PI_BINARY is required for native package-filter proof");
      const fixture = createNativePiFilterEnvironment();
      const gitConfigPath = Path.join(fixture.root, "gitconfig");
      Fs.writeFileSync(gitConfigPath, "");
      await execa("git", ["init", "--quiet", fixture.projectDirectory], {
        cwd: fixture.root,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: fixture.home,
          GIT_CONFIG_GLOBAL: gitConfigPath,
          GIT_CONFIG_NOSYSTEM: "1",
        },
        extendEnv: false,
        timeout: 5_000,
      });

      const loaderEntryPath = Path.resolve(fixture.loaderDirectory, scenario.extensionPath);
      Fs.mkdirSync(Path.dirname(loaderEntryPath), { recursive: true });
      Fs.writeFileSync(Path.join(fixture.loaderDirectory, "package.json"), JSON.stringify({
        name: "pi-subagents",
        version: "0.76.1",
        type: "module",
        pi: { extensions: [scenario.extensionPath] },
      }));
      Fs.writeFileSync(
        loaderEntryPath,
        'import fs from "node:fs"; export default function(){fs.writeFileSync(process.env.KEPLER_MARKER,"loaded");}\n',
      );
      const userPackage = scenario.filter === undefined
        ? fixture.loaderDirectory
        : { source: fixture.loaderDirectory, extensions: scenario.filter };
      const projectPackages = scenario.project === "replace"
        ? [{ source: fixture.loaderDirectory, extensions: [] }]
        : scenario.project === "delta"
          ? [{ source: fixture.loaderDirectory, autoload: false, extensions: ["-index.js"] }]
          : scenario.project === "force-include"
            ? [{ source: fixture.loaderDirectory, autoload: false, extensions: ["+index.js"] }]
            : [];
      Fs.writeFileSync(fixture.settingsPath, JSON.stringify({
        defaultProjectTrust: "always",
        packages: [userPackage],
      }));
      Fs.writeFileSync(fixture.projectSettingsPath, JSON.stringify({ packages: projectPackages }));

      const nativeEnvironment = {
        PATH: nativePiPath,
        HOME: fixture.home,
        USERPROFILE: fixture.home,
        XDG_CONFIG_HOME: Path.join(fixture.home, ".config"),
        XDG_CACHE_HOME: Path.join(fixture.home, ".cache"),
        XDG_DATA_HOME: Path.join(fixture.home, ".local", "share"),
        PI_CODING_AGENT_DIR: fixture.agentDirectory,
        PI_OFFLINE: "1",
        KEPLER_MARKER: fixture.markerPath,
        TERM: "dumb",
        NO_COLOR: "1",
      };
      const native = await execa(piBinary, [
        "--offline",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-mcp",
        "--no-session",
        "--approve",
        "--help",
      ], {
        cwd: fixture.projectDirectory,
        env: nativeEnvironment,
        extendEnv: false,
        timeout: 15_000,
      });
      expect(native.exitCode).toBe(0);
      const nativeEnabled = Fs.existsSync(fixture.markerPath);

      expect(Fs.existsSync(Path.join(fixture.agentDirectory, "npm"))).toBe(false);
      const module = await preflight();
      let preflightEnabled = false;
      let preflightError: unknown;
      try {
        const result = module.preflightPi({
          environment: {
            PATH: nativePiPath,
            HOME: fixture.home,
            PI_CODING_AGENT_DIR: fixture.agentDirectory,
            KEPLER_PI_AGENT_DIR: fixture.agentDirectory,
            KEPLER_PI_BINARY: piBinary,
            PI_OFFLINE: "1",
          },
          projectDirectory: fixture.projectDirectory,
          packageSource: Path.join(fixture.root, "current"),
        });
        preflightEnabled = result.loader.release === "0.76.1";
      } catch (error) {
        preflightError = error;
      }

      expect(nativeEnabled).toBe(scenario.enabled);
      expect(preflightEnabled).toBe(scenario.enabled);
      expect(preflightEnabled).toBe(nativeEnabled);
      if (!scenario.enabled) expect(preflightError).toMatchObject({ code: "pi_loader_unavailable" });
      expect(Fs.existsSync(Path.join(fixture.agentDirectory, "npm"))).toBe(false);
    }, 30_000);
  }
});
