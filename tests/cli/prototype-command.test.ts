import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { unwrapLegacyOutput } from "./result-envelope.js";
import { ContextCommand } from "../../packages/cli/src/cli/nest/context.command.js";
import { DiffCommand } from "../../packages/cli/src/cli/nest/diff.command.js";
import { IsolateCommand } from "../../packages/cli/src/cli/nest/isolate.command.js";
import { PreconditionCommand } from "../../packages/cli/src/cli/nest/precondition.command.js";
import { PrototypeCommand } from "../../packages/cli/src/cli/nest/prototype.command.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import {
  ContextService,
  type ContextArguments,
} from "../../packages/cli/src/workbench/context.js";
import { DiffService, type DiffArguments } from "../../packages/cli/src/workbench/diff.js";
import { IsolateService, type IsolationArguments } from "../../packages/cli/src/workbench/isolate.js";
import {
  PreconditionService,
  type PreconditionArguments,
} from "../../packages/cli/src/workbench/precondition.js";
import {
  PrototypeService,
  type PrototypeArguments,
  type PrototypeResult,
} from "../../packages/cli/src/workbench/prototype.js";

const result = (
  overrides: Partial<PrototypeResult> = {},
): PrototypeResult => ({
  _tag: "PrototypeResult",
  operation: "mapped",
  status: "success",
  exitCode: 0,
  stdout: "mode: created\nprototype/demo/TKT-1\n",
  stderr: "",
  lines: ["mode: created", "prototype/demo/TKT-1"],
  lastLine: "prototype/demo/TKT-1",
  ...overrides,
});

async function runCli(
  arguments_: string[],
  serviceResult: PrototypeResult = result(),
) {
  const calls: PrototypeArguments[] = [];
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalArgv = process.argv;
  let exitCode: number | string | undefined;
  let commandError: unknown;
  let application: INestApplicationContext | undefined;
  class PrototypeCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: PrototypeCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      DiffCommand,
      PreconditionCommand,
      ContextCommand,
      PrototypeCommand,
      {
        provide: IsolateService,
        useValue: {
          execute: async (_args: IsolationArguments) => {
            throw new Error("unexpected isolate invocation");
          },
        },
      },
      {
        provide: DiffService,
        useValue: {
          execute: async (_args: DiffArguments) => {
            throw new Error("unexpected diff invocation");
          },
        },
      },
      {
        provide: PreconditionService,
        useValue: {
          execute: async (_args: PreconditionArguments) => {
            throw new Error("unexpected precondition invocation");
          },
        },
      },
      {
        provide: ContextService,
        useValue: {
          execute: async (_args: ContextArguments) => {
            throw new Error("unexpected context invocation");
          },
        },
      },
      {
        provide: PrototypeService,
        useValue: {
          execute: async (args: PrototypeArguments) => {
            calls.push(args);
            return serviceResult;
          },
        },
      },
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
      errorHandler: (error) => {
        throw error;
      },
      serviceErrorHandler: (error) => {
        throw error;
      },
    });
    process.argv = [originalArgv[0], "kepler", ...arguments_];
    try {
      await CommandFactory.runApplication(application);
    } catch (error) {
      commandError = error;
    }
  } finally {
    exitCode = process.exitCode;
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await application?.close();
  }

  return {
    calls,
    commandError,
    exitCode,
    stderr,
    stdout: unwrapLegacyOutput(stdout),
  };
}

describe("PrototypeCommand", () => {
  it("registers both mapped positionals and the documented options", async () => {
    const harness = await runCli(["workbench", "prototype", "--help"]);

    expect(harness.stdout).toContain(
      "Usage: kepler workbench prototype [options] [map-name] [ticket-name]",
    );
    expect(harness.stdout).toContain("--standalone <name>");
    expect(harness.stdout).toContain("--verify <branch>");
    expect(harness.calls).toEqual([]);
  });

  it("maps mapped, standalone, and verify inputs through the Nest handler", async () => {
    const serviceResult = result({
      status: "negative",
      exitCode: 1,
      stderr: "prototype check did not pass\n",
    });
    const cases: {
      readonly arguments: string[];
      readonly expected: PrototypeArguments;
    }[] = [
      {
        arguments: ["workbench", "prototype", "city-map", "HAM-123"],
        expected: {
          mode: "mapped",
          mapName: "city-map",
          ticketName: "HAM-123",
        },
      },
      {
        arguments: ["workbench", "prototype", "--standalone", "new-map"],
        expected: { mode: "standalone", slug: "new-map" },
      },
      {
        arguments: [
          "workbench",
          "prototype",
          "--verify",
          "prototype/city-map/HAM-123",
        ],
        expected: {
          mode: "verify",
          expectedBranch: "prototype/city-map/HAM-123",
        },
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments, serviceResult);

      expect(harness.commandError).toBeUndefined();
      expect(harness.calls).toEqual([testCase.expected]);
      expect(harness.exitCode).toBe(1);
      expect(harness.stdout).toBe(serviceResult.stdout);
      expect(harness.stderr).toBe(serviceResult.stderr);
    }
  });

  it("reports successful service results with exact output streams", async () => {
    const serviceResult = result({
      status: "success",
      exitCode: 0,
      stdout: "prototype succeeded: exact stdout\n",
      stderr: "prototype succeeded: exact stderr\n",
    });
    const harness = await runCli(
      ["workbench", "prototype", "city-map", "HAM-123"],
      serviceResult,
    );

    expect(harness.commandError).toBeUndefined();
    expect(harness.calls).toEqual([
      { mode: "mapped", mapName: "city-map", ticketName: "HAM-123" },
    ]);
    expect(harness.exitCode).toBe(0);
    expect(harness.stdout).toBe("prototype succeeded: exact stdout\n");
    expect(harness.stderr).toBe("prototype succeeded: exact stderr\n");
  });

  it("reports parser usage errors without calling the service", async () => {
    const invalidArguments = [
      ["workbench", "prototype", "--unknown"],
      ["workbench", "prototype", "--standalone"],
      ["workbench", "prototype", "--verify"],
    ];

    for (const arguments_ of invalidArguments) {
      const harness = await runCli(arguments_);

      expect(harness.calls).toEqual([]);
      expect(harness.commandError).toBeDefined();
      expect(harness.stdout).toBe("");
      expect(harness.stderr.match(/error:/g)).toHaveLength(1);
    }
  });

  it("rejects conflicting and incomplete modes without calling the service", async () => {
    const invalidCases = [
      {
        arguments: [
          "workbench",
          "prototype",
          "--standalone",
          "new-map",
          "--verify",
          "prototype/expected",
        ],
        message:
          "--standalone cannot be combined with --verify or mapped arguments",
      },
      {
        arguments: [
          "workbench",
          "prototype",
          "--standalone",
          "new-map",
          "city-map",
        ],
        message:
          "--standalone cannot be combined with --verify or mapped arguments",
      },
      {
        arguments: [
          "workbench",
          "prototype",
          "--verify",
          "prototype/expected",
          "city-map",
        ],
        message: "--verify cannot be combined with mapped arguments",
      },
      {
        arguments: ["workbench", "prototype"],
        message: "prototype mapped mode requires <map-name> <ticket-name>",
      },
      {
        arguments: ["workbench", "prototype", "city-map"],
        message: "prototype mapped mode requires <map-name> <ticket-name>",
      },
    ];

    for (const invalid of invalidCases) {
      const harness = await runCli(invalid.arguments);

      expect(harness.commandError).toBeUndefined();
      expect(harness.calls).toEqual([]);
      expect(harness.exitCode).toBe(1);
      expect(harness.stdout).toBe("");
      expect(harness.stderr).toBe(`error: ${invalid.message}\n`);
    }
  });
});
