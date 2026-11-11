import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { unwrapLegacyOutput } from "./result-envelope.js";
import { RESULT_EXIT_SINK, RESULT_OUTPUT_SINK } from "../../packages/cli/src/cli/nest/result-reporter.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import { WorkbenchModule } from "../../packages/cli/src/cli/nest/workbench.module.js";
import {
  IsolateService,
  type IsolationArguments,
  type IsolationResult,
} from "../../packages/cli/src/workbench/isolate.js";

type Event =
  | { readonly type: "stdout" | "stderr"; readonly value: string }
  | { readonly type: "exitCode"; readonly value: 0 | 1 };

const result = (
  overrides: Partial<IsolationResult> = {},
): IsolationResult => ({
  _tag: "IsolationResult",
  operation: "check",
  status: "success",
  exitCode: 0,
  stdout: "isolated: yes\n",
  stderr: "",
  lines: ["isolated: yes"],
  lastLine: "isolated: yes",
  ...overrides,
});

async function runCli(
  arguments_: string[],
  isolationResult: IsolationResult,
) {
  const { IsolateCommand } = await import(
    "../../packages/cli/src/cli/nest/isolate.command.js"
  );
  const calls: IsolationArguments[] = [];
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let exitCode: number | string | undefined;
  class IsolateCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: IsolateCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      {
        provide: IsolateService,
        useValue: {
          execute: async (args: IsolationArguments) => {
            calls.push(args);
            return isolationResult;
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

async function createHarness(isolationResult: IsolationResult) {
  const { IsolateCommand } = await import(
    "../../packages/cli/src/cli/nest/isolate.command.js"
  );
  const calls: IsolationArguments[] = [];
  const events: Event[] = [];
  const module = await Test.createTestingModule({
    imports: [WorkbenchModule],
  })
    .overrideProvider(IsolateService)
    .useValue({
      execute: async (args: IsolationArguments) => {
        calls.push(args);
        return isolationResult;
      },
    })
    .overrideProvider(RESULT_OUTPUT_SINK)
    .useValue({
      stdout: (value: string) =>
        events.push({ type: "stdout", value: unwrapLegacyOutput(value) }),
      stderr: (value: string) => events.push({ type: "stderr", value }),
    })
    .overrideProvider(RESULT_EXIT_SINK)
    .useValue({
      setExitCode: (value: 0 | 1) => events.push({ type: "exitCode", value }),
    })
    .compile();

  return {
    calls,
    command: module.get(IsolateCommand),
    events,
    module,
  };
}

describe("IsolateCommand", () => {
  it("registers its documented options and title in Nest help", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    let application: INestApplicationContext | undefined;
    let commandError: unknown;

    try {
      process.argv = [
        originalArgv[0],
        "kepler",
        "workbench",
        "isolate",
        "--help",
      ];
      process.exitCode = 0;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stderr.write;

      application = await CommandFactory.createWithoutRunning(WorkbenchModule, {
        cliName: "kepler",
        errorHandler: (error) => {
          throw error;
        },
        serviceErrorHandler: (error) => {
          throw error;
        },
      });
      await CommandFactory.runApplication(application);
    } catch (error) {
      commandError = error;
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      await application?.close();
    }

    expect(commandError).toBeDefined();
    expect(stdout).toContain("Usage: kepler workbench isolate [options] [title]");
    expect(stdout).toContain("--check");
    expect(stdout).toContain("--verify <title>");
    expect(stdout).toContain("--change-dir <directory>");
    expect(stderr).toBe("");
  });

  it("parses check, verify, and positional create arguments through Nest", async () => {
    const cases: {
      readonly arguments: string[];
      readonly expected: IsolationArguments;
    }[] = [
      {
        arguments: [
          "workbench",
          "isolate",
          "--check",
          "--change-dir",
          ".kepler",
        ],
        expected: { mode: "check", changeDir: ".kepler" },
      },
      {
        arguments: ["workbench", "isolate", "--verify", "new-worktree"],
        expected: { mode: "verify", title: "new-worktree" },
      },
      {
        arguments: ["workbench", "isolate", "new-worktree"],
        expected: { mode: "create", title: "new-worktree" },
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments, result());
      expect(harness.calls).toEqual([testCase.expected]);
      expect(harness.exitCode).toBe(0);
      expect(harness.stdout).toBe("isolated: yes\n");
      expect(harness.stderr).toBe("");
    }
  });

  it("maps check options to one service call and reports a negative result", async () => {
    const harness = await createHarness(
      result({ status: "negative", exitCode: 1, stdout: "isolated: no\n", lines: ["isolated: no"], lastLine: "isolated: no" }),
    );

    try {
      await harness.command.run([], { check: true, changeDir: ".kepler" });

      expect(harness.calls).toEqual([
        { mode: "check", changeDir: ".kepler" },
      ]);
      expect(harness.events).toEqual([
        { type: "exitCode", value: 1 },
        { type: "stdout", value: "isolated: no\n" },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("maps a positional title to create mode and preserves service streams", async () => {
    const harness = await createHarness(
      result({
        operation: "create",
        status: "error",
        exitCode: 1,
        stdout: "",
        stderr: "already exists\n",
        lines: [],
        lastLine: "",
      }),
    );

    try {
      await harness.command.run(["new-worktree"], {});

      expect(harness.calls).toEqual([
        { mode: "create", title: "new-worktree" },
      ]);
      expect(harness.events).toEqual([
        { type: "exitCode", value: 1 },
        { type: "stdout", value: "" },
        { type: "stderr", value: "already exists\n" },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("maps --verify to verify mode", async () => {
    const harness = await createHarness(
      result({
        operation: "verify",
        stdout: "verified: /repo/.worktrees/new-worktree\n",
        lines: ["verified: /repo/.worktrees/new-worktree"],
        lastLine: "verified: /repo/.worktrees/new-worktree",
      }),
    );

    try {
      await harness.command.run([], { verify: "new-worktree" });

      expect(harness.calls).toEqual([
        { mode: "verify", title: "new-worktree" },
      ]);
      expect(harness.events).toEqual([
        { type: "exitCode", value: 0 },
        {
          type: "stdout",
          value: "verified: /repo/.worktrees/new-worktree\n",
        },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("rejects invalid combinations without calling the service", async () => {
    const harness = await createHarness(result());
    const invalidCalls = [
      {
        params: ["new-worktree"],
        options: { check: true },
        message: "--check cannot be combined with --verify or a title",
      },
      {
        params: [],
        options: { check: true, verify: "new-worktree" },
        message: "--check cannot be combined with --verify or a title",
      },
      {
        params: ["new-worktree"],
        options: { verify: "other-worktree" },
        message: "--verify cannot be combined with --change-dir or a title",
      },
      {
        params: [],
        options: { verify: "new-worktree", changeDir: ".kepler" },
        message: "--verify cannot be combined with --change-dir or a title",
      },
      {
        params: [],
        options: {},
        message: "isolate create mode requires a title",
      },
      {
        params: ["new-worktree"],
        options: { changeDir: ".kepler" },
        message: "--change-dir requires --check",
      },
    ];

    try {
      for (const [index, invalid] of invalidCalls.entries()) {
        await harness.command.run(invalid.params, invalid.options);
        expect(harness.events.slice(index * 3, index * 3 + 3)).toEqual([
          { type: "exitCode", value: 1 },
          { type: "stdout", value: "" },
          { type: "stderr", value: `error: ${invalid.message}\n` },
        ]);
      }
      expect(harness.calls).toEqual([]);
    } finally {
      await harness.module.close();
    }
  });
});
