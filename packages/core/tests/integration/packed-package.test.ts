import { execa } from "execa";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../../../..");
const coreDirectory = Path.join(repositoryRoot, "packages", "core");
const temporaryRoots: string[] = [];
const maxDiagnosticCharacters = 4096;

const diagnosticTail = (value: unknown): string =>
  typeof value === "string"
    ? value.slice(-maxDiagnosticCharacters)
    : "";

const run = async (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  try {
    await execa(command, [...args], {
      cwd,
      env,
      extendEnv: false,
      maxBuffer: 1_000_000,
      timeout: 120_000,
    });
  } catch (error) {
    const result = error as {
      readonly exitCode?: unknown;
      readonly stderr?: unknown;
      readonly stdout?: unknown;
    };
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${String(result.exitCode)}`,
        diagnosticTail(result.stderr),
        diagnosticTail(result.stdout),
      ].filter(Boolean).join("\n"),
    );
  }
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.access(root)).rejects.toThrow();
  }
});

describe("packed Core package", () => {
  it("installs into an isolated consumer with usable declarations and runtime behavior", async () => {
    const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-packed-core-"));
    temporaryRoots.push(root);
    const archive = Path.join(root, "kepler-core.tgz");
    const consumer = Path.join(root, "consumer");
    const home = Path.join(root, "home");
    const config = Path.join(root, "config");
    const cache = Path.join(root, "cache");
    await Promise.all([
      Fs.mkdir(consumer, { recursive: true }),
      Fs.mkdir(home, { recursive: true }),
      Fs.mkdir(config, { recursive: true }),
      Fs.mkdir(cache, { recursive: true }),
    ]);

    const env: NodeJS.ProcessEnv = {
      HOME: home,
      XDG_CACHE_HOME: cache,
      XDG_CONFIG_HOME: config,
      npm_config_registry: "https://registry.npmjs.org",
      npm_config_userconfig: Path.join(home, ".npmrc"),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      PATH: process.env.PATH ?? "",
      TMPDIR: root,
    };

    await run("bun", ["pm", "pack", "--filename", archive, "--quiet"], coreDirectory, env);
    await Fs.writeFile(
      Path.join(consumer, "package.json"),
      JSON.stringify({ name: "kepler-core-consumer", private: true, type: "module" }),
    );
    await run("bun", ["add", `file:${archive}`], consumer, env);

    const expectedHome = Path.join(config, "vialactea-works", "kepler");
    await Fs.writeFile(
      Path.join(consumer, "index.ts"),
      [
        'import { KeplerService, parseKeplerSettings, type KeplerServiceOptions, type KeplerSettings } from "@vialactea-works/kepler-core";',
        `const options: KeplerServiceOptions = { homeDirectory: ${JSON.stringify(home)}, xdgConfigHome: ${JSON.stringify(config)} };`,
        'const settings: KeplerSettings = parseKeplerSettings("enabled: true");',
        "const paths = new KeplerService(options).globalPaths();",
        `if (paths.home !== ${JSON.stringify(expectedHome)} || settings.enabled !== true) throw new Error("Packed Core contract failed");`,
        "",
      ].join("\n"),
    );
    const tsconfig = Path.join(consumer, "tsconfig.json");
    await Fs.writeFile(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2024",
          types: [],
        },
        files: ["index.ts"],
      }),
    );

    await run(
      process.execPath,
      [Path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--project", tsconfig],
      consumer,
      env,
    );
    await run(process.execPath, [Path.join(consumer, "index.ts")], consumer, env);
  }, 120_000);
});
