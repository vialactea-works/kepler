import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { parseCliEnvelope } from "./result-envelope.js";
import {
  RESULT_EXIT_SINK,
  RESULT_OUTPUT_SINK,
} from "../../packages/cli/src/cli/nest/result-reporter.js";
import { SetupFailure, type Setup } from "../../packages/cli/src/cli/setup.service.js";
import type { ContentDigest } from "../../packages/cli/src/cli/installation-record.js";
import {
  SETUP_BUNDLE_LOCATOR,
  SETUP_CLI_RELEASE,
  SETUP_FILES,
  SETUP_OPERATION,
  SETUP_PLATFORM,
  SETUP_RUNTIME,
  type SetupRuntime,
} from "../../packages/cli/src/cli/setup-runtime.js";

const transferDigest: ContentDigest = `sha256:${"a".repeat(64)}`;

async function createSetupHarness(setup: Setup) {
  const [{ SetupCommand }, { SetupModule }] = await Promise.all([
    import("../../packages/cli/src/cli/nest/setup.command.js"),
    import("../../packages/cli/src/cli/nest/setup.module.js"),
  ]);
  const events: Array<{ readonly type: string; readonly value: string | number }> = [];
  const module = await Test.createTestingModule({ imports: [SetupModule] })
    .overrideProvider(SETUP_OPERATION)
    .useValue(setup)
    .overrideProvider(SETUP_FILES)
    .useValue({})
    .overrideProvider(SETUP_BUNDLE_LOCATOR)
    .useValue(() => "/bundle")
    .overrideProvider(SETUP_CLI_RELEASE)
    .useValue("3.0.0")
    .overrideProvider(SETUP_PLATFORM)
    .useValue({ os: "linux", arch: "x64" })
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
  it("shares one runtime instance between package resolution and setup file ports", async () => {
    const { SetupModule } = await import("../../packages/cli/src/cli/nest/setup.module.js");
    const files = {} as SetupRuntime["files"];
    const bundleLocator = () => "/selected-package/bundle";
    const runtime: SetupRuntime = {
      files,
      bundleLocator,
      platform: { os: "linux", arch: "x64" },
    };
    const module = await Test.createTestingModule({ imports: [SetupModule] })
      .overrideProvider(SETUP_RUNTIME)
      .useValue(runtime)
      .compile();

    try {
      expect(module.get(SETUP_FILES)).toBe(files);
      expect(module.get(SETUP_BUNDLE_LOCATOR)).toBe(bundleLocator);
    } finally {
      await module.close();
    }
  });
  it("passes the exact native-transfer digest to setup and reports the structured result", async () => {
    const result = {
      generation_id: "550e8400-e29b-41d4-a716-446655440000",
      kepler_release: "3.0.0",
      installation_mode: "first-install" as const,
      resource_root: "/home/test/.kepler-dist/generations/550e8400-e29b-41d4-a716-446655440000",
      selector: "/home/test/.kepler-dist/current",
      package_source: "/home/test/.kepler-dist/current",
      compatibility: { check: "compatible" as const },
      templates: [],
      guidelines: [],
      created_files: [],
      updated_files: [],
      pi_binding: {
        host: { id: "pi" as const, release: "1.2.0", check: "matches" as const },
        loader: { id: "pi-subagents" as const, release: "0.76.1", check: "matches" as const },
        registration: {
          entry_digest: transferDigest,
          settings_digest: transferDigest,
          check: "matches" as const,
        },
      },
    };
    const setup: Setup = { setup: vi.fn(() => result) };
    const harness = await createSetupHarness(setup);

    try {
      const parsed = harness.command.parseNativeTransferDigest(transferDigest);
      await harness.command.run([], { acceptNativeTransfer: parsed });

      expect(setup.setup).toHaveBeenCalledWith({ acceptNativeTransferDigest: transferDigest });
      expect(harness.events).toHaveLength(2);
      expect(harness.events[0]).toEqual({ type: "exitCode", value: 0 });
      const output = harness.events[1];
      expect(output?.type).toBe("stdout");
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      const envelope = parseCliEnvelope(String(output.value));
      expect(envelope.status).toBe("success");
      expect(envelope.data).toMatchObject({
        generation_id: result.generation_id,
        installation_mode: "first-install",
        pi_binding: { registration: { check: "matches" } },
      });
    } finally {
      await harness.module.close();
    }
  });

  it("reports exact transfer details and recovery guidance on failure", async () => {
    const failure = new SetupFailure(
      "native_transfer_confirmation_required",
      "Review the exact transfer plan.",
      { native_transfer_plan: { digest: transferDigest }, command: `kepler setup --accept-native-transfer ${transferDigest}` },
      "No installation changes were made.",
    );
    const setup: Setup = { setup: vi.fn(() => { throw failure; }) };
    const harness = await createSetupHarness(setup);

    try {
      await harness.command.run([]);

      expect(harness.events[0]).toEqual({ type: "exitCode", value: 1 });
      const output = harness.events[1];
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      expect(parseCliEnvelope(String(output.value))).toMatchObject({
        status: "failed",
        data: {
          code: "native_transfer_confirmation_required",
          details: { native_transfer_plan: { digest: transferDigest } },
          recovery: "No installation changes were made.",
        },
      });
    } finally {
      await harness.module.close();
    }
  });
});
