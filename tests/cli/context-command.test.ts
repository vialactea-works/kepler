import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { DiffCommand } from "../../packages/cli/src/cli/nest/diff.command.js";
import { IsolateCommand } from "../../packages/cli/src/cli/nest/isolate.command.js";
import { PreconditionCommand } from "../../packages/cli/src/cli/nest/precondition.command.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import {
  ContextService,
  type ContextArguments,
  type ContextResult,
} from "../../packages/cli/src/workbench/context.js";
import { DiffService } from "../../packages/cli/src/workbench/diff.js";
import { IsolateService } from "../../packages/cli/src/workbench/isolate.js";
import { PreconditionService } from "../../packages/cli/src/workbench/precondition.js";

const result = (
  overrides: Partial<ContextResult> = {},
): ContextResult => ({
  _tag: "ContextResult",
  operation: "one",
  status: "success",
  exitCode: 0,
  stdout: "change: sample\nformat: split\ntasks: 1/3\n",
  stderr: "",
  lines: ["change: sample", "format: split", "tasks: 1/3"],
  lastLine: "tasks: 1/3",
  changes: [],
  ...overrides,
});

async function runCli(
  arguments_: string[],
  contextResult: ContextResult = result(),
) {
  const { ContextCommand } = await import(
    "../../packages/cli/src/cli/nest/context.command.js"
  );
  const calls: ContextArguments[] = [];
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let exitCode: number | string | undefined;
  class ContextCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: ContextCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      DiffCommand,
      PreconditionCommand,
      ContextCommand,
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
          execute: async () => {
            throw new Error("unexpected diff invocation");
          },
        },
      },
      {
        provide: PreconditionService,
        useValue: {
          execute: async () => {
            throw new Error("unexpected precondition invocation");
          },
        },
      },
      {
        provide: ContextService,
        useValue: {
          execute: async (args: ContextArguments) => {
            calls.push(args);
            return contextResult;
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

  return { calls, exitCode, stderr, stdout };
}

describe("ContextCommand", () => {
  it("forwards the optional positional change directory and preserves output", async () => {
    const serviceResult = result({
      exitCode: 1,
      status: "negative",
      stdout: "change: sample\nformat: split\ntasks: 0/3\n",
      stderr: "review feedback missing\n",
      lines: ["change: sample", "format: split", "tasks: 0/3"],
      lastLine: "tasks: 0/3",
    });
    const harness = await runCli(
      ["workbench", "context", ".kepler/change"],
      serviceResult,
    );

    expect(harness.calls).toEqual([
      { all: false, changeDir: ".kepler/change", inputPaths: [] },
    ]);
    expect(harness.exitCode).toBe(1);
    expect(harness.stdout).toBe(
      "change: sample\nformat: split\ntasks: 0/3\n",
    );
    expect(harness.stderr).toBe("review feedback missing\n");
  });

  it("forwards --all without a change directory and preserves structured output", async () => {
    const serviceResult = result({
      operation: "all",
      stdout:
        "change                         format               artifacts                                          tasks    whole change       last modified\nsample                         split                proposal,plan                                      1/3      approved           2026-09-25\n",
      lines: [
        "change                         format               artifacts                                          tasks    whole change       last modified",
        "sample                         split                proposal,plan                                      1/3      approved           2026-09-25",
      ],
      lastLine:
        "sample                         split                proposal,plan                                      1/3      approved           2026-09-25",
    });
    const harness = await runCli(
      ["workbench", "context", "--all"],
      serviceResult,
    );

    expect(harness.calls).toEqual([{ all: true, changeDir: undefined, inputPaths: [] }]);
    expect(harness.exitCode).toBe(0);
    expect(harness.stdout).toBe(serviceResult.stdout);
    expect(harness.stderr).toBe("");
  });

  it("forwards repeatable current-input probes", async () => {
    const serviceResult = result({ stdout: "plan-contract-data: {}\n" });
    const harness = await runCli(
      [
        "workbench",
        "context",
        ".kepler/change",
        "--input",
        "AGENTS.md",
        "--input",
        "src/main.ts",
      ],
      serviceResult,
    );

    expect(harness.calls).toEqual([
      {
        all: false,
        changeDir: ".kepler/change",
        inputPaths: ["AGENTS.md", "src/main.ts"],
      },
    ]);
    expect(harness.stdout).toBe(serviceResult.stdout);
  });

  it("rejects --all with a change directory before calling ContextService", async () => {
    const harness = await runCli([
      "workbench",
      "context",
      "--all",
      ".kepler/change",
    ]);

    expect(harness.calls).toEqual([]);
    expect(harness.exitCode).toBe(2);
    expect(harness.stdout).toBe("");
    expect(harness.stderr).toBe("error: --all takes no change directory\n");
  });
});
