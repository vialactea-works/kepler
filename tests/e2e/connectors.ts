import { execaSync } from "execa";
import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import type { E2EResources } from "./resources.js";

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliInvocation {
  readonly cliPath: string;
  readonly projectRoot: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly stdin?: string;
  readonly resources: E2EResources;
}

export interface ApplicationConnector {
  readonly kind: "docker" | "native";
  assertAvailable(resources: E2EResources, cliPath: string): void;
  invoke(invocation: CliInvocation): CommandResult;
}

const maxOutputBytes = 16_000_000;
const maxDiagnosticCharacters = 4096;

const tail = (value: unknown): string =>
  typeof value === "string" ? value.slice(-maxDiagnosticCharacters) : "";

const execute = (
  file: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  input?: string,
): CommandResult => {
  const label = `${file} ${args.join(" ")}`.slice(0, 1024);
  let result;
  try {
    result = execaSync(file, [...args], {
      cwd,
      encoding: "utf8",
      env,
      extendEnv: false,
      maxBuffer: maxOutputBytes,
      reject: false,
      stripFinalNewline: false,
      timeout: timeoutMs,
      ...(input === undefined ? {} : { input }),
    });
  } catch (error) {
    const failure = error as {
      readonly exitCode?: unknown;
      readonly stderr?: unknown;
      readonly stdout?: unknown;
      readonly timedOut?: unknown;
    };
    throw new Error(
      [
        `${label} failed to start or exceeded ${timeoutMs}ms`,
        `exit code: ${String(failure.exitCode)}`,
        failure.timedOut === true ? "process timed out" : "",
        error instanceof Error ? tail(error.message) : "",
        tail(failure.stderr),
        tail(failure.stdout),
      ].filter(Boolean).join("\n"),
    );
  }
  if (
    result.timedOut ||
    result.isMaxBuffer ||
    result.exitCode === undefined
  ) {
    throw new Error(
      [
        `${label} did not complete normally`,
        result.timedOut ? `timed out after ${timeoutMs}ms` : "",
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

const projectRoot = Path.resolve(import.meta.dirname, "../..");

export class NativeApplicationConnector implements ApplicationConnector {
  readonly kind = "native" as const;

  assertAvailable(_resources: E2EResources, cliPath: string): void {
    if (!Fs.existsSync(cliPath)) {
      throw new Error(`Compiled Kepler CLI is missing: ${cliPath}`);
    }
  }

  invoke(invocation: CliInvocation): CommandResult {
    return execute(
      process.execPath,
      [invocation.cliPath, ...invocation.args],
      invocation.cwd,
      invocation.env,
      invocation.timeoutMs,
      invocation.stdin,
    );
  }
}

export class DockerApplicationConnector implements ApplicationConnector {
  readonly kind = "docker" as const;

  constructor(
    readonly image = "oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6",
  ) {}

  assertAvailable(resources: E2EResources, cliPath: string): void {
    if (!Fs.existsSync(cliPath)) {
      throw new Error(`Compiled Kepler CLI is missing: ${cliPath}`);
    }
    const result = execute(
      "docker",
      ["image", "inspect", this.image],
      projectRoot,
      resources.dockerEnvironment(),
      15_000,
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Required Docker image ${this.image} is unavailable. Pull it with: docker pull ${this.image}\n${tail(result.stderr)}`,
      );
    }
  }

  invoke(invocation: CliInvocation): CommandResult {
    const root = invocation.resources.rootDirectory;
    const toContainerPath = (value: string): string => {
      if (value === root) return "/test";
      if (value.startsWith(`${root}${Path.sep}`)) {
        return Path.posix.join("/test", Path.relative(root, value));
      }
      if (value === invocation.projectRoot) return "/workspace";
      if (value.startsWith(`${invocation.projectRoot}${Path.sep}`)) {
        return Path.posix.join(
          "/workspace",
          Path.relative(invocation.projectRoot, value),
        );
      }
      return value;
    };
    const toContainerArgument = (value: string): string => {
      const separator = value.indexOf("=");
      if (separator >= 0) {
        const key = value.slice(0, separator + 1);
        const pathValue = value.slice(separator + 1);
        const mapped = toContainerPath(pathValue);
        return mapped === pathValue ? value : `${key}${mapped}`;
      }
      return toContainerPath(value);
    };
    const relativeCwd = Path.relative(root, invocation.cwd);
    const relativeProjectCwd = Path.relative(
      invocation.projectRoot,
      invocation.cwd,
    );
    const cwdIsInResources =
      relativeCwd === "" ||
      (!relativeCwd.startsWith("..") && !Path.isAbsolute(relativeCwd));
    const cwdIsInProject =
      relativeProjectCwd === "" ||
      (!relativeProjectCwd.startsWith("..") &&
        !Path.isAbsolute(relativeProjectCwd));
    if (!cwdIsInResources && !cwdIsInProject) {
      throw new Error(
        `Docker E2E working directory must be inside the project or test resources: ${invocation.cwd}`,
      );
    }

    const dockerCwd = toContainerPath(invocation.cwd);
    const containerName = `kepler-e2e-${randomUUID()}`;
    const args = [
      "run",
      "--pull=never",
      "--name",
      containerName,
      "--network=none",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--volume",
      `${invocation.projectRoot}:/workspace:ro`,
      "--volume",
      `${root}:/test:rw`,
      "--workdir",
      dockerCwd,
    ];
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    if (uid !== undefined && gid !== undefined) {
      args.push("--user", `${uid}:${gid}`);
    }
    for (const [key, value] of Object.entries(invocation.env)) {
      if (value === undefined || key === "PATH") continue;
      args.push("--env", `${key}=${toContainerPath(value)}`);
    }
    if (invocation.stdin !== undefined) args.push("--interactive");
    args.push(
      this.image,
      toContainerPath(invocation.cliPath),
      ...invocation.args.map(toContainerArgument),
    );

    let result: CommandResult | undefined;
    let executionFailure: unknown;
    try {
      result = execute(
        "docker",
        args,
        invocation.projectRoot,
        invocation.resources.dockerEnvironment(),
        invocation.timeoutMs,
        invocation.stdin,
      );
    } catch (error) {
      executionFailure = error;
    }

    let cleanupFailure: unknown;
    try {
      const cleanup = execute(
        "docker",
        ["rm", "--force", containerName],
        invocation.projectRoot,
        invocation.resources.dockerEnvironment(),
        15_000,
      );
      if (
        cleanup.exitCode !== 0 &&
        !/no such container/i.test(cleanup.stderr)
      ) {
        cleanupFailure = new Error(
          `docker rm --force ${containerName} failed with exit code ${cleanup.exitCode}: ${tail(cleanup.stderr)}`,
        );
      }
    } catch (error) {
      cleanupFailure = error;
    }

    if (executionFailure !== undefined && cleanupFailure !== undefined) {
      throw new Error(`${String(executionFailure)}\nContainer cleanup failed: ${String(cleanupFailure)}`);
    }
    if (executionFailure !== undefined) throw executionFailure;
    if (cleanupFailure !== undefined) throw cleanupFailure;
    if (result === undefined) throw new Error("Docker CLI invocation returned no result");
    return result;
  }
}
