import { execaSync } from "execa";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import type { CommandResult } from "./connectors.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const fixedGitDate = "2026-10-20T00:00:00Z";
const maxOutputBytes = 1_000_000;
const maxDiagnosticCharacters = 2048;

export interface E2EResources {
  readonly rootDirectory: string;
  readonly homeDirectory: string;
  readonly configDirectory: string;
  readonly cacheDirectory: string;
  readonly temporaryDirectory: string;
  readonly repositoryDirectory: string;
  readonly workspaceDirectory: string;
  readonly gitConfigPath: string;
  readonly dockerConfigDirectory: string;
  environment(): NodeJS.ProcessEnv;
  dockerEnvironment(): NodeJS.ProcessEnv;
  runGit(cwd: string, ...args: string[]): string;
  cleanup(): Promise<void>;
}

export interface E2EResourceConnector {
  create(): Promise<E2EResources>;
}

const tail = (value: unknown): string =>
  typeof value === "string"
    ? value.slice(-maxDiagnosticCharacters)
    : "";

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const run = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): CommandResult => {
  const label = `${command} ${args.join(" ")}`.slice(0, 512);
  let result;
  try {
    result = execaSync(command, [...args], {
      cwd,
      encoding: "utf8",
      env,
      extendEnv: false,
      maxBuffer: maxOutputBytes,
      reject: false,
      timeout: 15_000,
    });
  } catch (error) {
    const failure = error as {
      readonly exitCode?: unknown;
      readonly stderr?: unknown;
      readonly stdout?: unknown;
    };
    throw new Error(
      [
        `${label} failed to start`,
        `exit code: ${String(failure.exitCode)}`,
        error instanceof Error ? tail(error.message) : "",
        tail(failure.stderr),
        tail(failure.stdout),
      ].filter(Boolean).join("\n"),
    );
  }
  if (result.timedOut || result.isMaxBuffer || result.exitCode === undefined) {
    throw new Error(
      [
        `${label} did not complete normally`,
        result.timedOut ? "process timed out after 15000ms" : "",
        result.isMaxBuffer ? `exceeded ${maxOutputBytes} output bytes` : "",
        tail(result.stderr),
        tail(result.stdout),
      ].filter(Boolean).join("\n"),
    );
  }
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

export class TemporaryE2EResourceConnector implements E2EResourceConnector {
  async create(): Promise<E2EResources> {
    const rootDirectory = await Fs.mkdtemp(
      Path.join(await Fs.realpath(Os.tmpdir()), "kepler-e2e-"),
    );
    let cleaned = false;
    try {
      const homeDirectory = Path.join(rootDirectory, "home");
      const configDirectory = Path.join(rootDirectory, "config");
      const cacheDirectory = Path.join(rootDirectory, "cache");
      const temporaryDirectory = Path.join(rootDirectory, "tmp");
      const repositoryDirectory = Path.join(rootDirectory, "repository");
      const workspaceDirectory = Path.join(rootDirectory, "workspace");
      const dockerConfigDirectory = Path.join(rootDirectory, "docker-config");
      const gitConfigPath = Path.join(rootDirectory, "gitconfig");
      await Promise.all([
        Fs.mkdir(homeDirectory, { recursive: true }),
        Fs.mkdir(configDirectory, { recursive: true }),
        Fs.mkdir(cacheDirectory, { recursive: true }),
        Fs.mkdir(temporaryDirectory, { recursive: true }),
        Fs.mkdir(repositoryDirectory, { recursive: true }),
        Fs.mkdir(workspaceDirectory, { recursive: true }),
        Fs.mkdir(dockerConfigDirectory, { recursive: true }),
        Fs.writeFile(gitConfigPath, ""),
      ]);

      const executablePath = [
        Path.dirname(process.execPath),
        process.env.PATH ?? "",
      ].filter(Boolean).join(Path.delimiter);
      await Fs.writeFile(
        Path.join(homeDirectory, ".profile"),
        `PATH=${shellQuote(executablePath)}\nexport PATH\n`,
      );
      const environment: NodeJS.ProcessEnv = {
        CI: "1",
        GIT_CONFIG_GLOBAL: gitConfigPath,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        HOME: homeDirectory,
        KEPLER_BUNDLE_DIR: Path.join(projectRoot, "bundle"),
        LC_ALL: "C.UTF-8",
        NO_COLOR: "1",
        PATH: executablePath,
        TMPDIR: temporaryDirectory,
        TZ: "UTC",
        XDG_CACHE_HOME: cacheDirectory,
        XDG_CONFIG_HOME: configDirectory,
      };
      const runGit = (cwd: string, ...args: string[]): string => {
        const result = run(
          "git",
          args,
          cwd,
          {
            ...environment,
            GIT_AUTHOR_DATE: fixedGitDate,
            GIT_AUTHOR_EMAIL: "e2e@example.invalid",
            GIT_AUTHOR_NAME: "Kepler E2E Fixture",
            GIT_COMMITTER_DATE: fixedGitDate,
            GIT_COMMITTER_EMAIL: "e2e@example.invalid",
            GIT_COMMITTER_NAME: "Kepler E2E Fixture",
          },
        );
        if (result.exitCode !== 0) {
          throw new Error(
            `git ${args.join(" ")} failed with exit code ${result.exitCode}: ${tail(result.stderr)}`,
          );
        }
        return result.stdout.trim();
      };

      runGit(repositoryDirectory, "init", "-q", "-b", "main");
      runGit(repositoryDirectory, "config", "user.name", "Kepler E2E Fixture");
      runGit(repositoryDirectory, "config", "user.email", "e2e@example.invalid");
      runGit(repositoryDirectory, "config", "commit.gpgsign", "false");
      await Fs.writeFile(
        Path.join(repositoryDirectory, "README.md"),
        "# Kepler E2E fixture\n",
      );
      runGit(repositoryDirectory, "add", "README.md");
      runGit(repositoryDirectory, "commit", "-q", "-m", "Create deterministic fixture");
      runGit(
        repositoryDirectory,
        "remote",
        "add",
        "origin",
        "https://example.invalid/kepler-fixture.git",
      );

      return {
        rootDirectory,
        homeDirectory,
        configDirectory,
        cacheDirectory,
        temporaryDirectory,
        repositoryDirectory,
        workspaceDirectory,
        gitConfigPath,
        dockerConfigDirectory,
        environment: () => ({ ...environment }),
        dockerEnvironment: () => ({
          DOCKER_CONFIG: dockerConfigDirectory,
          HOME: dockerConfigDirectory,
          LANG: "C.UTF-8",
          NO_COLOR: "1",
          PATH: process.env.PATH ?? "",
        }),
        runGit,
        cleanup: async () => {
          if (cleaned) return;
          cleaned = true;
          await Fs.rm(rootDirectory, { recursive: true, force: true });
          try {
            await Fs.access(rootDirectory);
          } catch (error) {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              return;
            }
            throw error;
          }
          throw new Error(`E2E resources were not removed: ${rootDirectory}`);
        },
      };
    } catch (error) {
      await Fs.rm(rootDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}
