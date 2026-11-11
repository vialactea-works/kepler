import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { GitAuthorLookup } from "../../packages/cli/src/cli/git-author.js";
import { GitAuthorCommand, GitCommand } from "../../packages/cli/src/cli/nest/capability.commands.js";
import {
  GIT_DIFF_PACKAGE_OPERATION,
  GitDiffPackageCommand,
  GitDiffPackageIntegrationCommand,
  GitDiffPackageUnitReviewCommand,
  GitDiffPackageValidationCommand,
  type GitDiffPackageOperation,
} from "../../packages/cli/src/cli/nest/diff-package.commands.js";
import type { DiffPackageCommandRequest } from "../../packages/cli/src/cli/diff-package-options.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { parseCliEnvelope } from "./result-envelope.js";

const unit = "2026-10-23-diff-package";
const task = "30000000-0000-4000-8000-000000000001";
const implementationAttempt = "40000000-0000-4000-8000-000000000001";
const generationAttempt = "50000000-0000-4000-8000-000000000001";
const integrationAttempt = "50000000-0000-4000-8000-000000000002";

async function runCli(arguments_: string[]) {
  const calls: DiffPackageCommandRequest[] = [];
  const operation: GitDiffPackageOperation = {
    execute: async (request) => {
      calls.push(request);
      return { kind: "success", data: { scope: request.scope, output: "/tmp/package.md" } };
    },
  };
  let stdout = "";
  let stderr = "";
  let thrown: unknown;
  let exitCode: number | string | undefined;
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalArgv = process.argv;
  let application: INestApplicationContext | undefined;
  class DiffPackageCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: DiffPackageCliHarnessModule,
    imports: [ResultModule],
    providers: [
      GitCommand,
      GitAuthorCommand,
      GitDiffPackageCommand,
      GitDiffPackageValidationCommand,
      GitDiffPackageIntegrationCommand,
      GitDiffPackageUnitReviewCommand,
      { provide: GitAuthorLookup, useValue: { execute: async () => ({ kind: "failed" }) } },
      { provide: GIT_DIFF_PACKAGE_OPERATION, useValue: operation },
    ],
  };

  try {
    process.exitCode = 0;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    application = await CommandFactory.createWithoutRunning(rootModule, {
      cliName: "kepler",
      errorHandler: (error) => { throw error; },
      serviceErrorHandler: (error) => { throw error; },
    });
    process.argv = [originalArgv[0], "kepler", ...arguments_];
    try {
      await CommandFactory.runApplication(application);
    } catch (error) {
      thrown = error;
    }
  } finally {
    exitCode = process.exitCode;
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await application?.close();
  }

  return { calls, exitCode, stderr, stdout: stdout.startsWith("{") ? parseCliEnvelope(stdout) : stdout, thrown };
}

describe("git diff-package command signatures", () => {
  it("dispatches exactly the three fixed source-bound signatures", async () => {
    const cases: { readonly arguments: string[]; readonly expected: DiffPackageCommandRequest }[] = [
      {
        arguments: ["git", "diff-package", "validation", "--unit", unit, "--task", task,
          "--implementation-attempt", implementationAttempt, "--generation-attempt", generationAttempt,
          "--project", "/workspace/project", "--out", ".kepler/packages/validation.md"],
        expected: {
          scope: { kind: "validation", unitId: unit, taskId: task, implementationAttemptId: implementationAttempt, generationAttemptId: generationAttempt },
          project: "/workspace/project",
          out: ".kepler/packages/validation.md",
        },
      },
      {
        arguments: ["git", "diff-package", "integration", "--unit", unit, "--task", task,
          "--implementation-attempt", implementationAttempt, "--integration-attempt", integrationAttempt],
        expected: {
          scope: { kind: "integration", unitId: unit, taskId: task, implementationAttemptId: implementationAttempt, integrationAttemptId: integrationAttempt },
        },
      },
      {
        arguments: ["git", "diff-package", "unit-review", "--unit", unit,
          "--implementation-attempt", implementationAttempt],
        expected: {
          scope: { kind: "unit-review", unitId: unit, implementationAttemptId: implementationAttempt },
        },
      },
    ];

    for (const testCase of cases) {
      const result = await runCli(testCase.arguments);
      expect(result.calls).toEqual([testCase.expected]);
      expect(result.stdout).toMatchObject({ status: "success" });
    }
  });

  it("rejects missing and repeated required selectors before invoking the operation", async () => {
    const missing = await runCli(["git", "diff-package", "validation"]);
    const repeated = await runCli([
      "git", "diff-package", "integration", "--unit", unit, "--task", task,
      "--implementation-attempt", implementationAttempt, "--integration-attempt", integrationAttempt,
      "--integration-attempt", generationAttempt,
    ]);

    expect(missing.calls).toEqual([]);
    expect(missing.stdout).toMatchObject({ status: "failed", data: { code: "required_selector_missing" } });
    expect(repeated.calls).toEqual([]);
    expect(repeated.stdout).toMatchObject({ status: "failed", data: { code: "duplicate_selector" } });
  });

  it("rejects trailing positional arguments, including tokens after --", async () => {
    const signatures = [
      ["git", "diff-package", "validation", "--unit", unit, "--task", task,
        "--implementation-attempt", implementationAttempt, "--generation-attempt", generationAttempt],
      ["git", "diff-package", "integration", "--unit", unit, "--task", task,
        "--implementation-attempt", implementationAttempt, "--integration-attempt", integrationAttempt],
      ["git", "diff-package", "unit-review", "--unit", unit, "--implementation-attempt", implementationAttempt],
    ];
    const results = [];
    for (const args of signatures) results.push(await runCli([...args, "main..HEAD"]));
    results.push(await runCli([...signatures[2]!, "--", "main..HEAD"]));

    for (const result of results) {
      expect(result.calls).toEqual([]);
      expect(result.stdout).toMatchObject({ status: "failed", data: { code: "invalid_arguments" } });
    }
  });

  it("rejects mission, repository, batch, format, and range options", async () => {
    const base = ["git", "diff-package", "unit-review", "--unit", unit, "--implementation-attempt", implementationAttempt];
    for (const option of ["--mission", "--repo", "--batch", "--format", "--base", "--head"]) {
      const result = await runCli([...base, option, "value"]);
      expect(result.calls).toEqual([]);
      expect(result.thrown).toBeDefined();
    }
  });
});
