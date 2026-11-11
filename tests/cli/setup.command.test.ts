import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { parseCliEnvelope } from "./result-envelope.js";
import { RESULT_EXIT_SINK, RESULT_OUTPUT_SINK } from "../../packages/cli/src/cli/nest/result-reporter.js";
import { SetupFailure, type Setup } from "../../packages/cli/src/cli/setup.service.js";

async function createSetupHarness(setup: Setup) {
  const [{ SetupCommand }, { SetupModule }] = await Promise.all([
    import("../../packages/cli/src/cli/nest/setup.command.js"),
    import("../../packages/cli/src/cli/nest/setup.module.js"),
  ]);
  const events: Array<{ readonly type: string; readonly value: string | number }> = [];
  const module = await Test.createTestingModule({ imports: [SetupModule] })
    .overrideProvider(Symbol.for("kepler.setup.operation"))
    .useValue(setup)
    .overrideProvider(RESULT_OUTPUT_SINK)
    .useValue({
      stdout: (value: string) => events.push({ type: "stdout", value }),
      stderr: (value: string) => events.push({ type: "stderr", value }),
    })
    .overrideProvider(RESULT_EXIT_SINK)
    .useValue({ setExitCode: (value: 0 | 1) => events.push({ type: "exitCode", value }) })
    .compile();
  return { command: module.get(SetupCommand), events, module };
}

describe("SetupCommand", () => {
  it("reports the initialized versioned home in the standard result envelope", async () => {
    const result = { home: "/home/test/kepler/versions/3.0.0", release: "3.0.0", status: "initialized" as const };
    const setup: Setup = { setup: vi.fn(() => result) };
    const harness = await createSetupHarness(setup);

    try {
      await harness.command.run();

      expect(setup.setup).toHaveBeenCalledOnce();
      expect(harness.events[0]).toEqual({ type: "exitCode", value: 0 });
      const output = harness.events[1];
      expect(output?.type).toBe("stdout");
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      expect(parseCliEnvelope(String(output.value))).toEqual({
        status: "success",
        data: result,
      });
    } finally {
      await harness.module.close();
    }
  });

  it("reports initialization failures with recovery guidance", async () => {
    const failure = new SetupFailure(
      "home_initialization_failed",
      "Existing Kepler home is incompatible.",
      {},
      "Preserve the existing home and resolve the reported problem before retrying.",
    );
    const setup: Setup = { setup: vi.fn(() => { throw failure; }) };
    const harness = await createSetupHarness(setup);

    try {
      await harness.command.run();

      expect(harness.events[0]).toEqual({ type: "exitCode", value: 1 });
      const output = harness.events[1];
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      expect(parseCliEnvelope(String(output.value))).toMatchObject({
        status: "failed",
        data: {
          code: "home_initialization_failed",
          message: "Existing Kepler home is incompatible.",
          details: {},
          recovery: "Preserve the existing home and resolve the reported problem before retrying.",
        },
      });
    } finally {
      await harness.module.close();
    }
  });
});
