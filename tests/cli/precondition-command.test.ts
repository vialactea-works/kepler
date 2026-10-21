import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { unwrapLegacyOutput } from "./result-envelope.js";
import { DiffCommand } from "../../packages/cli/src/cli/nest/diff.command.js";
import { IsolateCommand } from "../../packages/cli/src/cli/nest/isolate.command.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import {
  PreconditionService,
  type PreconditionArguments,
  type PreconditionResult,
} from "../../packages/cli/src/workbench/precondition.js";
import { DiffService } from "../../packages/cli/src/workbench/diff.js";
import { IsolateService } from "../../packages/cli/src/workbench/isolate.js";

const result = (
  overrides: Partial<PreconditionResult> = {},
): PreconditionResult => ({
  _tag: "PreconditionResult",
  status: "success",
  exitCode: 0,
  stdout:
    "verified-head: 1234567890123456789012345678901234567890\ngate: open\n",
  stderr: "",
  lines: [
    "verified-head: 1234567890123456789012345678901234567890",
    "gate: open",
  ],
  lastLine: "gate: open",
  ...overrides,
});

async function runCli(
  arguments_: string[],
  preconditionResult: PreconditionResult = result(),
) {
  const { PreconditionCommand } = await import(
    "../../packages/cli/src/cli/nest/precondition.command.js"
  );
  const calls: PreconditionArguments[] = [];
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let exitCode: number | string | undefined;
  class PreconditionCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: PreconditionCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      DiffCommand,
      PreconditionCommand,
      {
        provide: IsolateService,
        useValue: { execute: async () => { throw new Error("unexpected isolate invocation"); } },
      },
      {
        provide: DiffService,
        useValue: { execute: async () => { throw new Error("unexpected diff invocation"); } },
      },
      {
        provide: PreconditionService,
        useValue: {
          execute: async (args: PreconditionArguments) => {
            calls.push(args);
            return preconditionResult;
          },
        },
      },
    ],
  };
  const originalArgv = process.argv;
  let application: INestApplicationContext | undefined;

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
      errorHandler: (error) => {
        throw error;
      },
      serviceErrorHandler: (error) => {
        throw error;
      },
    });
    process.argv = [originalArgv[0], "kepler", ...arguments_];
    await CommandFactory.runApplication(application);
  } finally {
    exitCode = process.exitCode;
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await application?.close();
  }

  return { calls, exitCode, stderr, stdout: unwrapLegacyOutput(stdout) };
}

describe("PreconditionCommand", () => {
  it("forwards required options and the waiver flag to PreconditionService", async () => {
    const harness = await runCli([
      "workbench",
      "precondition",
      "--change-dir",
      ".kepler/change",
      "--test-cmd",
      "bun --bun vitest run",
      "--target-branch",
      "refs/remotes/origin/main",
      "--whole-change-waived",
    ]);

    expect(harness.calls).toEqual([
      {
        changeDir: ".kepler/change",
        testCommand: "bun --bun vitest run",
        targetBranch: "refs/remotes/origin/main",
        wholeChangeWaived: true,
      },
    ]);
    expect(harness.exitCode).toBe(0);
    expect(harness.stdout).toBe(
      "verified-head: 1234567890123456789012345678901234567890\ngate: open\n",
    );
    expect(harness.stderr).toBe("");
  });

  it("forwards the repair identity without converting repair-open into ordinary admission", async () => {
    const stdout = "admission: finalization-repair\nverified-head: 1234567890123456789012345678901234567890\ngate: repair-open\n";
    const harness = await runCli([
      "workbench", "precondition", "--change-dir", ".kepler/changes/demo", "--test-cmd", "full-tests && build",
      "--target-branch", "refs/heads/main", "--recover-finish", "1",
    ], result({ stdout, lines: stdout.trim().split("\n"), lastLine: "gate: repair-open" }));
    expect(harness.calls).toEqual([{ changeDir: ".kepler/changes/demo", testCommand: "full-tests && build", targetBranch: "refs/heads/main", wholeChangeWaived: false, recoverFinish: 1 }]);
    expect(harness.stdout).toBe(stdout);
    expect(harness.stdout).not.toContain("gate: open\n");
    expect(harness.exitCode).toBe(0);
  });

  it("preserves a closed gate result and its final line", async () => {
    const harness = await runCli(
      [
        "workbench",
        "precondition",
        "--change-dir",
        ".kepler/change",
        "--test-cmd",
        "bun --bun vitest run",
        "--target-branch",
        "refs/remotes/origin/main",
      ],
      result({
        status: "negative",
        exitCode: 1,
        stdout: "tests: passed\ngate: closed (1 failing)\n",
        stderr: "review feedback missing\n",
        lines: ["tests: passed", "gate: closed (1 failing)"],
        lastLine: "gate: closed (1 failing)",
      }),
    );

    expect(harness.calls).toEqual([
      {
        changeDir: ".kepler/change",
        testCommand: "bun --bun vitest run",
        targetBranch: "refs/remotes/origin/main",
        wholeChangeWaived: false,
      },
    ]);
    expect(harness.exitCode).toBe(1);
    expect(harness.stdout).toBe("tests: passed\ngate: closed (1 failing)\n");
    expect(harness.stderr).toBe("review feedback missing\n");
  });

  it("rejects missing required options before calling PreconditionService", async () => {
    const cases = [
      {
        arguments: [
          "workbench",
          "precondition",
          "--test-cmd",
          "bun --bun vitest run",
        ],
        message: "Expected to find option: '--change-dir'\n\nExpected to find option: '--target-branch'\n",
      },
      {
        arguments: [
          "workbench",
          "precondition",
          "--change-dir",
          ".kepler/change",
        ],
        message: "Expected to find option: '--test-cmd'\n\nExpected to find option: '--target-branch'\n",
      },
      {
        arguments: ["workbench", "precondition"],
        message:
          "Expected to find option: '--change-dir'\n\nExpected to find option: '--test-cmd'\n\nExpected to find option: '--target-branch'\n",
      },
      {
        arguments: [
          "workbench",
          "precondition",
          "--change-dir",
          ".kepler/change",
          "--test-cmd",
          "bun --bun vitest run",
        ],
        message: "Expected to find option: '--target-branch'\n",
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments);

      expect(harness.calls).toEqual([]);
      expect(harness.exitCode).toBe(1);
      expect(harness.stdout).toBe("");
      expect(harness.stderr).toBe(testCase.message);
    }
  });
});
