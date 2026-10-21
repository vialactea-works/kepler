import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { unwrapLegacyOutput } from "./result-envelope.js";
import { DiffCommand } from "../../packages/cli/src/cli/nest/diff.command.js";
import { IsolateCommand } from "../../packages/cli/src/cli/nest/isolate.command.js";
import { LintCommand } from "../../packages/cli/src/cli/nest/lint.command.js";
import { PreconditionCommand } from "../../packages/cli/src/cli/nest/precondition.command.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { WorkbenchCommand } from "../../packages/cli/src/cli/nest/workbench.command.js";
import {
  DiffService,
  type DiffArguments,
} from "../../packages/cli/src/workbench/diff.js";
import {
  IsolateService,
  type IsolationArguments,
} from "../../packages/cli/src/workbench/isolate.js";
import {
  LintService,
  type LintResult,
  type LintScope,
} from "../../packages/cli/src/workbench/lint.js";
import {
  PreconditionService,
  type PreconditionArguments,
} from "../../packages/cli/src/workbench/precondition.js";

const result = (overrides: Partial<LintResult> = {}): LintResult => ({
  _tag: "LintResult",
  status: "success",
  exitCode: 0,
  findings: [],
  ...overrides,
});

async function runCli(
  arguments_: string[],
  serviceResult: LintResult = result(),
) {
  const calls: LintScope[] = [];
  let stdout = "";
  let stderr = "";
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalArgv = process.argv;
  let exitCode: number | string | undefined;
  let commandError: unknown;
  let application: INestApplicationContext | undefined;
  class LintCliHarnessModule {}
  const rootModule: DynamicModule = {
    module: LintCliHarnessModule,
    imports: [ResultModule],
    providers: [
      WorkbenchCommand,
      IsolateCommand,
      DiffCommand,
      PreconditionCommand,
      LintCommand,
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
        provide: LintService,
        useValue: {
          execute: async (scope: LintScope) => {
            calls.push(scope);
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

describe("LintCommand", () => {
  it("forwards either explicit scope through the Nest-resolved service", async () => {
    const cases: {
      readonly arguments: string[];
      readonly expected: LintScope;
    }[] = [
      {
        arguments: ["workbench", "lint", "--file", "/tmp/artifact.md"],
        expected: { file: "/tmp/artifact.md" },
      },
      {
        arguments: ["workbench", "lint", "--change-dir", "/tmp/change"],
        expected: { changeDir: "/tmp/change" },
      },
    ];

    for (const testCase of cases) {
      const harness = await runCli(testCase.arguments);

      expect(harness.commandError).toBeUndefined();
      expect(harness.calls).toEqual([testCase.expected]);
      expect(harness.exitCode).toBe(0);
      expect(harness.stdout).toBe("lint: success\n");
      expect(harness.stderr).toBe("");
    }
  });

  it("renders service findings in their original order with the findings code", async () => {
    const harness = await runCli(
      ["workbench", "lint", "--change-dir", "/tmp/change"],
      result({
        status: "findings",
        exitCode: 1,
        findings: [
          {
            kind: "error",
            sourcePath: "/tmp/change/z.md",
            line: 3,
            code: "later",
            message: "later finding",
          },
          {
            kind: "warning",
            sourcePath: "/tmp/change/a.md",
            line: 1,
            code: "earlier",
            message: "earlier finding",
          },
        ],
      }),
    );

    expect(harness.commandError).toBeUndefined();
    expect(harness.calls).toEqual([{ changeDir: "/tmp/change" }]);
    expect(harness.exitCode).toBe(1);
    expect(harness.stdout).toBe(
      "ERROR /tmp/change/z.md:3 [later] later finding\n" +
        "WARNING /tmp/change/a.md:1 [earlier] earlier finding\n" +
        "lint: findings\n",
    );
    expect(harness.stderr).toBe("");
  });

  it("preserves the invalid-scope result code and summary", async () => {
    const harness = await runCli(
      ["workbench", "lint", "--file", "/tmp/artifact.md"],
      result({ status: "invalid-scope", exitCode: 2 }),
    );

    expect(harness.commandError).toBeUndefined();
    expect(harness.calls).toEqual([{ file: "/tmp/artifact.md" }]);
    expect(harness.exitCode).toBe(1);
    expect(harness.stdout).toBe("lint: invalid scope\n");
    expect(harness.stderr).toBe("");
  });

  it("rejects both or neither selector without invoking the service", async () => {
    const invalidArguments = [
      [
        "workbench",
        "lint",
        "--file",
        "/tmp/missing.md",
        "--change-dir",
        "/tmp/missing-change",
      ],
      ["workbench", "lint"],
    ];

    for (const arguments_ of invalidArguments) {
      const harness = await runCli(arguments_);

      expect(harness.commandError).toBeUndefined();
      expect(harness.calls).toEqual([]);
      expect(harness.exitCode).toBe(1);
      expect(harness.stdout).toBe("");
      expect(harness.stderr).toBe(
        "error: lint requires exactly one of --file or --change-dir\n",
      );
    }
  });
});
