#!/usr/bin/env bun
import "reflect-metadata";
import { CLI_RELEASE } from "./version.js";
import { readBuildIdentity } from "./build-identity.js";
import { reportCliResult } from "./nest/result-reporter.js";

const buildIdentityArgumentIndex = process.argv[1] === "--print-build-identity"
  ? 1
  : process.argv[2] === "--print-build-identity" && (
      process.argv[1]?.endsWith(".ts") || process.argv[1]?.startsWith("/$bunfs/")
    )
    ? 2
    : -1;

if (buildIdentityArgumentIndex >= 0) {
  if (process.argv.length !== buildIdentityArgumentIndex + 1) {
    process.stderr.write("--print-build-identity does not accept additional arguments\n");
    process.exitCode = 1;
  } else {
    const identity = readBuildIdentity();
    if (!identity) {
      process.stderr.write("This Kepler executable has no compiled build identity\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify(identity)}\n`);
    }
  }
} else {
  process.env.KEPLER_CLI_RELEASE = CLI_RELEASE;

  await import("@nestjs/common");
  const { CommandFactory } = await import("nest-commander");
  const { AppModule } = await import("./app.module.js");

  const isCommanderError = (
    error: unknown,
  ): error is Error & { code: string; exitCode: number } =>
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("commander.") &&
    "exitCode" in error &&
    typeof error.exitCode === "number";

  const reportFailure = (error: unknown): void => {
    if (isCommanderError(error) && error.exitCode === 0) {
      process.exitCode = 0;
      return;
    }

    const commanderError = isCommanderError(error);
    const message = error instanceof Error ? error.message : String(error);
    reportCliResult(
      {
        status: "failed",
        data: {
          code: commanderError ? "invalid_arguments" : "operation_failed",
          message: message || "The command did not complete successfully.",
          details: {},
          recovery: commanderError
            ? "Correct the command arguments and retry."
            : "Review the failure and resolve it before retrying.",
        },
      },
      {
        stdout: (value) => process.stdout.write(value),
        stderr: (value) => process.stderr.write(value),
        setExitCode: (value) => {
          process.exitCode = value;
        },
      },
      commanderError ? "" : `error: ${message}\n`,
    );
  };

  try {
    await CommandFactory.run(AppModule, {
      cliName: "kepler",
      version: CLI_RELEASE,
      errorHandler: (error) => {
        throw error;
      },
      serviceErrorHandler: reportFailure,
    });
  } catch (error) {
    reportFailure(error);
  }
}
