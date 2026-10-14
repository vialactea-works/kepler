import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { IsolateCommand } from "../../packages/cli/src/cli/nest/isolate.command.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import {
  DiffService,
  type DiffArguments,
  type DiffResult,
} from "../../packages/cli/src/workbench/diff.js";
import { IsolateService } from "../../packages/cli/src/workbench/isolate.js";

const serviceResult = (operation: DiffArguments["mode"]): DiffResult => ({
  _tag: "DiffResult",
  operation,
  status: "success",
  exitCode: 0,
  stdout: `${operation} result\n`,
  stderr: `${operation} warning\n`,
  lines: [`${operation} result`],
  lastLine: `${operation} result`,
});

async function runCli(
  arguments_: string[],
  resultOverrides: Partial<DiffResult> = {},
) {
  const { DiffCommand } = await import("../../packages/cli/src/cli/nest/diff.command.js");
  const calls: DiffArguments[] = [];
  let checkpointCreated = false;
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let exitCode: number | string | undefined;
  class DiffCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: DiffCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      DiffCommand,
      {
        provide: IsolateService,
        useValue: {
          execute: async () => {
            throw new Error("unexpected isolate invocation");
          },
        },
      },
      {
        provide: DiffService,
        useValue: {
          execute: async (args: DiffArguments) => {
            calls.push(args);
            if (args.mode === "record") checkpointCreated = true;
            return { ...serviceResult(args.mode), ...resultOverrides };
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

  return { calls, checkpointCreated, exitCode, stderr, stdout };
}

describe("DiffCommand", () => {
  it("maps all documented modes and reports the service result", async () => {
    const cases: {
      readonly arguments: string[];
      readonly expected: DiffArguments;
    }[] = [
      {
        arguments: [
          "workbench",
          "diff",
          "--record",
          "--task",
          "13",
          "--change-dir",
          ".kepler/change",
        ],
        expected: {
          mode: "record",
          task: "13",
          changeDir: ".kepler/change",
        },
      },
      {
        arguments: [
          "workbench",
          "diff",
          "--base",
          "abc123",
          "--change-dir",
          ".kepler/change",
          "--out",
          "review.diff",
        ],
        expected: {
          mode: "base",
          base: "abc123",
          changeDir: ".kepler/change",
          out: "review.diff",
        },
      },
      {
        arguments: [
          "workbench",
          "diff",
          "--task",
          "13",
          "--change-dir",
          ".kepler/change",
          "--out",
          "task.diff",
        ],
        expected: {
          mode: "task",
          task: "13",
          changeDir: ".kepler/change",
          out: "task.diff",
        },
      },
      {
        arguments: [
          "workbench",
          "diff",
          "--whole-change",
          "--target-branch",
          "refs/remotes/origin/main",
          "--out",
          "whole.diff",
        ],
        expected: {
          mode: "whole-change",
          targetBranch: "refs/remotes/origin/main",
          out: "whole.diff",
        },
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments);

      expect(harness.calls).toEqual([testCase.expected]);
      expect(harness.checkpointCreated).toBe(testCase.expected.mode === "record");
      expect(harness.exitCode).toBe(0);
      expect(harness.stdout).toBe(`${testCase.expected.mode} result\n`);
      expect(harness.stderr).toBe(`${testCase.expected.mode} warning\n`);
    }
  });

  it("reports a negative service result without changing its streams or code", async () => {
    const harness = await runCli(
      ["workbench", "diff", "--task", "13", "--out", "task.diff"],
      {
        status: "negative",
        exitCode: 1,
        stdout: "no diff available\n",
        stderr: "review base missing\n",
        lines: ["no diff available"],
        lastLine: "no diff available",
      },
    );

    expect(harness.calls).toEqual([
      { mode: "task", task: "13", out: "task.diff" },
    ]);
    expect(harness.exitCode).toBe(1);
    expect(harness.stdout).toBe("no diff available\n");
    expect(harness.stderr).toBe("review base missing\n");
  });

  it("rejects invalid combinations before calling DiffService", async () => {
    const cases = [
      {
        arguments: ["workbench", "diff", "--whole-change"],
        message: "--whole-change requires --target-branch",
      },
      {
        arguments: ["workbench", "diff", "--record", "--task", "13", "--out", "record.diff"],
        message:
          "--record requires --task and cannot be combined with --base, --whole-change, or --out",
      },
      {
        arguments: ["workbench", "diff", "--record", "--whole-change", "--task", "13"],
        message:
          "--record requires --task and cannot be combined with --base, --whole-change, or --out",
      },
      {
        arguments: ["workbench", "diff", "--record", "--task", "13", "--base", "abc123"],
        message:
          "--record requires --task and cannot be combined with --base, --whole-change, or --out",
      },
      {
        arguments: ["workbench", "diff", "--whole-change", "--change-dir", ".kepler/change"],
        message:
          "--whole-change cannot be combined with --base, --change-dir, or --task",
      },
      {
        arguments: ["workbench", "diff", "--whole-change", "--task", "13"],
        message:
          "--whole-change cannot be combined with --base, --change-dir, or --task",
      },
      {
        arguments: ["workbench", "diff", "--record"],
        message:
          "--record requires --task and cannot be combined with --base, --whole-change, or --out",
      },
      {
        arguments: ["workbench", "diff", "--whole-change", "--base", "abc123"],
        message:
          "--whole-change cannot be combined with --base, --change-dir, or --task",
      },
      {
        arguments: ["workbench", "diff", "--base", "abc123", "--task", "13"],
        message: "--task is meaningless with --base",
      },
      {
        arguments: ["workbench", "diff"],
        message: "--task is required when --base is not given",
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments);

      expect(harness.calls).toEqual([]);
      expect(harness.checkpointCreated).toBe(false);
      expect(harness.exitCode).toBe(2);
      expect(harness.stdout).toBe("");
      expect(harness.stderr).toBe(`error: ${testCase.message}\n`);
    }
  });
});
