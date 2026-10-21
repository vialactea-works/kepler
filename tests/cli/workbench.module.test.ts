import "reflect-metadata";
import { type INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { parseCliEnvelope } from "./result-envelope.js";
import { WorkbenchModule } from "../../packages/cli/src/cli/nest/workbench.module.js";
import {
  CONTEXT_RUNTIME,
  ContextService,
} from "../../packages/cli/src/workbench/context.js";
import {
  DIFF_RUNTIME,
  DiffService,
  type DiffRuntime,
} from "../../packages/cli/src/workbench/diff.js";
import {
  ISOLATION_RUNTIME,
  IsolateService,
} from "../../packages/cli/src/workbench/isolate.js";
import {
  LINT_DEPENDENCIES,
  LintService,
} from "../../packages/cli/src/workbench/lint.js";
import {
  PRECONDITION_RUNTIME,
  PreconditionService,
} from "../../packages/cli/src/workbench/precondition.js";
import {
  PROTOTYPE_RUNTIME,
  PrototypeService,
} from "../../packages/cli/src/workbench/prototype.js";

describe("WorkbenchModule", () => {
  it("resolves each use case and isolates a runtime override to its operation", async () => {
    const baselineModule = await Test.createTestingModule({
      imports: [WorkbenchModule],
    }).compile();
    const fakeRuntime = {
      cwd: () => "/fake",
      fileSystem: {
        directoryExists: async () => true,
        realpath: async () => "/fake",
      },
      git: {
        repositoryRoot: async () => ({
          status: 1,
          stdout: "",
          stderr: "overridden diff runtime",
        }),
      },
    } as unknown as DiffRuntime;
    const overriddenModule = await Test.createTestingModule({
      imports: [WorkbenchModule],
    })
      .overrideProvider(DIFF_RUNTIME)
      .useValue(fakeRuntime)
      .compile();

    try {
      const baselineServices = [
        baselineModule.get(IsolateService),
        baselineModule.get(DiffService),
        baselineModule.get(PreconditionService),
        baselineModule.get(ContextService),
        baselineModule.get(PrototypeService),
        baselineModule.get(LintService),
      ];
      expect(baselineServices[0]).toBeInstanceOf(IsolateService);
      expect(baselineServices[1]).toBeInstanceOf(DiffService);
      expect(baselineServices[2]).toBeInstanceOf(PreconditionService);
      expect(baselineServices[3]).toBeInstanceOf(ContextService);
      expect(baselineServices[4]).toBeInstanceOf(PrototypeService);
      expect(baselineServices[5]).toBeInstanceOf(LintService);
      expect(new Set(baselineServices).size).toBe(6);
      expect(baselineModule.get(ISOLATION_RUNTIME)).toMatchObject({
        cwd: expect.any(Function),
        process: expect.any(Object),
        fileSystem: expect.any(Object),
        git: expect.any(Object),
      });
      expect(baselineModule.get(DIFF_RUNTIME)).toMatchObject({
        cwd: expect.any(Function),
        fileSystem: expect.any(Object),
        git: expect.any(Object),
      });
      expect(baselineModule.get(PRECONDITION_RUNTIME)).toMatchObject({
        cwd: expect.any(Function),
        process: expect.any(Object),
        fileSystem: expect.any(Object),
        git: expect.any(Object),
      });
      expect(baselineModule.get(CONTEXT_RUNTIME)).toMatchObject({
        cwd: expect.any(Function),
        fileSystem: expect.any(Object),
        git: expect.any(Object),
      });
      expect(baselineModule.get(PROTOTYPE_RUNTIME)).toMatchObject({
        cwd: expect.any(Function),
        git: expect.any(Object),
      });
      expect(baselineModule.get(LINT_DEPENDENCIES)).toEqual({});

      const baselineDiff = await baselineModule
        .get(DiffService)
        .execute({ mode: "record", task: 10, changeDir: "/__missing_workbench_change__" });
      const overriddenDiff = await overriddenModule
        .get(DiffService)
        .execute({ mode: "record", task: 10, changeDir: "/__missing_workbench_change__" });
      expect(baselineDiff).not.toEqual(overriddenDiff);
      expect(overriddenDiff).toMatchObject({
        _tag: "DiffResult",
        operation: "record",
        status: "error",
        exitCode: 2,
        stderr: "error: not inside a git repository: overridden diff runtime\n",
      });

      const changeDir = "/__missing_workbench_context_change__";
      const baselineContext = await baselineModule
        .get(ContextService)
        .execute({ changeDir });
      const overriddenContext = await overriddenModule
        .get(ContextService)
        .execute({ changeDir });
      expect(overriddenContext).toEqual(baselineContext);
    } finally {
      await overriddenModule.close();
      await baselineModule.close();
    }
  });

  it("reports usage for the bare workbench group without starting an operation", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    let application: INestApplicationContext | undefined;

    try {
      process.argv = [...originalArgv.slice(0, 2), "workbench"];
      process.exitCode = 0;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stderr.write;

      application = await CommandFactory.runWithoutClosing(WorkbenchModule, {
        serviceErrorHandler: (error) => {
          throw error;
        },
      });

      expect(process.exitCode).toBe(1);
      expect(parseCliEnvelope(stdout)).toMatchObject({
        status: "failed",
        data: {
          code: "operation_failed",
          message: "error: workbench requires a subcommand",
          details: {},
          recovery: expect.any(String),
        },
      });
      expect(stderr).toBe("error: workbench requires a subcommand\n");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      await application?.close();
    }
  });
});
