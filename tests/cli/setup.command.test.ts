import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommandFactory } from "nest-commander";
import { describe, expect, it } from "vitest";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import {
  RESULT_EXIT_SINK,
  RESULT_OUTPUT_SINK,
  ResultReporter,
} from "../../packages/cli/src/cli/nest/result-reporter.js";
import {
  SetupService,
  type Setup,
  type SetupFiles,
} from "../../packages/cli/src/cli/setup.service.js";
import {
  SETUP_BUNDLE_LOCATOR,
  SETUP_FILES,
  SETUP_OPERATION,
} from "../../packages/cli/src/cli/setup-runtime.js";

type Event =
  | { readonly type: "stdout" | "stderr"; readonly value: string }
  | { readonly type: "exitCode"; readonly value: 0 | 1 | 2 };

function makeFiles(overrides: Partial<SetupFiles> = {}): SetupFiles {
  return {
    ensureHome: () => {},
    copyTemplates: () => ["nested/requirements.md", "plan.md"],
    copyGuidelineManifests: () => {},
    writeDefaultSettings: () => {},
    ...overrides,
  };
}

async function createSetupHarness(options?: {
  files?: SetupFiles;
  bundleLocator?: () => string;
}) {
  const [{ SetupCommand }, { SetupModule }] = await Promise.all([
    import("../../packages/cli/src/cli/nest/setup.command.js"),
    import("../../packages/cli/src/cli/nest/setup.module.js"),
  ]);
  const events: Event[] = [];
  const module = await Test.createTestingModule({
    imports: [SetupModule],
  })
    .overrideProvider(SETUP_FILES)
    .useValue(options?.files ?? makeFiles())
    .overrideProvider(SETUP_BUNDLE_LOCATOR)
    .useValue(options?.bundleLocator ?? (() => "/bundle"))
    .overrideProvider(RESULT_OUTPUT_SINK)
    .useValue({
      stdout: (value: string) => events.push({ type: "stdout", value }),
      stderr: (value: string) => events.push({ type: "stderr", value }),
    })
    .overrideProvider(RESULT_EXIT_SINK)
    .useValue({
      setExitCode: (value: 0 | 1 | 2) => events.push({ type: "exitCode", value }),
    })
    .compile();

  return {
    command: module.get(SetupCommand),
    events,
    module,
    reporter: module.get(ResultReporter),
    setup: module.get<Setup>(SETUP_OPERATION),
  };
}

describe("SetupCommand", () => {
  it("resolves its setup runtime and reporter from Nest and reports the existing success listing", async () => {
    const harness = await createSetupHarness();

    try {
      expect(harness.setup).toBeInstanceOf(SetupService);
      expect(harness.reporter).toBeInstanceOf(ResultReporter);

      await harness.command.run([], { force: true });

      expect(harness.events).toEqual([
        { type: "exitCode", value: 0 },
        {
          type: "stdout",
          value:
            "Kepler set up successfully.\nInstalled 2 templates.\n  nested/requirements.md\n  plan.md\nInstalled guidelines.\n",
        },
        { type: "stderr", value: "" },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("reports a filesystem failure once with exit code 2", async () => {
    const harness = await createSetupHarness({
      files: makeFiles({
        ensureHome: () => {
          throw new Error("permission denied");
        },
      }),
    });

    try {
      await harness.command.run([], { force: true });

      expect(harness.events).toEqual([
        { type: "exitCode", value: 2 },
        { type: "stdout", value: "" },
        {
          type: "stderr",
          value:
            "Setup failed: Failed to create Kepler home directories: Error: permission denied\n",
        },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("reports a bundle failure once with exit code 2", async () => {
    const harness = await createSetupHarness({
      bundleLocator: () => {
        throw new Error("bundle unavailable");
      },
    });

    try {
      await harness.command.run([], { force: true });

      expect(harness.events).toEqual([
        { type: "exitCode", value: 2 },
        { type: "stdout", value: "" },
        { type: "stderr", value: "Setup failed: Error: bundle unavailable\n" },
      ]);
    } finally {
      await harness.module.close();
    }
  });

  it("accepts --force through nest-commander", async () => {
    const { SetupCommand } = await import(
      "../../packages/cli/src/cli/nest/setup.command.js"
    );
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    let setupCalls = 0;
    let application: INestApplicationContext | undefined;
    class SetupCommandHarness {}
    const rootModule: DynamicModule = {
      module: SetupCommandHarness,
      imports: [ResultModule],
      providers: [
        SetupCommand,
        {
          provide: SETUP_OPERATION,
          useValue: {
            setup: () => {
              setupCalls += 1;
              return { templates: [] };
            },
          },
        },
      ],
    };

    try {
      process.argv = [...originalArgv.slice(0, 2), "setup", "--force"];
      process.exitCode = 0;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      }) as typeof process.stderr.write;

      application = await CommandFactory.runWithoutClosing(rootModule, {
        serviceErrorHandler: (error) => {
          throw error;
        },
      });

      expect(setupCalls).toBe(1);
      expect(process.exitCode).toBe(0);
      expect(stdout).toBe(
        "Kepler set up successfully.\nInstalled 0 templates.\nInstalled guidelines.\n",
      );
      expect(stderr).toBe("");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      await application?.close();
    }
  });
});
