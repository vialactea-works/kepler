import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { parseCliEnvelope } from "./result-envelope.js";
import {
  RESULT_EXIT_SINK,
  RESULT_OUTPUT_SINK,
  ResultReporter,
} from "../../packages/cli/src/cli/nest/result-reporter.js";
import {
  SetupFailure,
  SetupService,
  type Setup,
  type SetupFiles,
  type SetupGlobalPaths,
} from "../../packages/cli/src/cli/setup.service.js";
import {
  SETUP_BUNDLE_LOCATOR,
  SETUP_CLI_RELEASE,
  SETUP_FILES,
  SETUP_OPERATION,
  SETUP_PLATFORM,
} from "../../packages/cli/src/cli/setup-runtime.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const constructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const paths: SetupGlobalPaths = {
  home: "/isolated/.config/vialactea-works/kepler",
  templates: "/isolated/.config/vialactea-works/kepler/templates",
  guidelines: "/isolated/.config/vialactea-works/kepler/guidelines",
  settings: "/isolated/.config/vialactea-works/kepler/settings.yaml",
  installationRecord: "/isolated/.config/vialactea-works/kepler/installation.json",
};

type Event =
  | { readonly type: "stdout" | "stderr"; readonly value: string }
  | { readonly type: "exitCode"; readonly value: 0 | 1 };

function makeFiles(overrides: Partial<SetupFiles> = {}): SetupFiles {
  return {
    readBundle: () => createSetupBundleFixture(),
    globalPaths: () => paths,
    ensureHome: () => {},
    inspectPath: () => ({ kind: "missing" }),
    pendingRecoveryPaths: () => [],
    applyPlan: () => ({
      createdFiles: [
        ...constructionTemplatePaths,
        "guidelines/general/01-code-style.md",
      ],
      updatedFiles: [],
      settingsCreated: true,
    }),
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
    .overrideProvider(SETUP_CLI_RELEASE)
    .useValue("0.10.3")
    .overrideProvider(SETUP_PLATFORM)
    .useValue({ os: "linux", arch: "x64" })
    .overrideProvider(RESULT_OUTPUT_SINK)
    .useValue({
      stdout: (value: string) => events.push({ type: "stdout", value }),
      stderr: (value: string) => events.push({ type: "stderr", value }),
    })
    .overrideProvider(RESULT_EXIT_SINK)
    .useValue({
      setExitCode: (value: 0 | 1) => events.push({ type: "exitCode", value }),
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
  it("resolves its setup runtime and reports generation and unchecked resource facts", async () => {
    const harness = await createSetupHarness();

    try {
      expect(harness.setup).toBeInstanceOf(SetupService);
      expect(harness.reporter).toBeInstanceOf(ResultReporter);

      await harness.command.run([]);

      expect(harness.events).toHaveLength(2);
      expect(harness.events[0]).toEqual({ type: "exitCode", value: 0 });
      const output = harness.events[1];
      expect(output?.type).toBe("stdout");
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      const result = parseCliEnvelope(output.value);
      expect(result.status).toBe("success");
      expect(result.data.compatibility).toEqual({ check: "compatible" });
      expect(result.data.created_files).toEqual([
        ...constructionTemplatePaths,
        "guidelines/general/01-code-style.md",
      ]);
      expect(result.data.updated_files).toEqual([]);
      expect(result.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "kepler-design", check: "not_checked" }),
        ]),
      );
      expect(result.data.host_binding).toEqual(
        expect.objectContaining({
          host: expect.objectContaining({
            check: "not_checked",
            id: "claude-code",
          }),
        }),
      );
      expect(result.data.generation_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      await harness.module.close();
    }
  });

  it("reports filesystem failure in the shared failure envelope", async () => {
    const harness = await createSetupHarness({
      files: makeFiles({
        ensureHome: () => {
          throw new Error("permission denied");
        },
      }),
    });

    try {
      await harness.command.run([]);

      expect(harness.events).toHaveLength(2);
      expect(harness.events[0]).toEqual({ type: "exitCode", value: 1 });
      const output = harness.events[1];
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      const result = parseCliEnvelope(output.value);
      expect(result.status).toBe("failed");
      expect(result.data).toMatchObject({
        code: "setup_write_failed",
        message: "Failed to create Kepler home directories: permission denied",
      });
    } finally {
      await harness.module.close();
    }
  });

  it("reports bundle failure with recovery details and no success output", async () => {
    const harness = await createSetupHarness({
      bundleLocator: () => {
        throw new SetupFailure(
          "bundle_not_found",
          "bundle unavailable",
          {},
          "Provide a compatible bundle.",
        );
      },
    });

    try {
      await harness.command.run([]);

      expect(harness.events).toHaveLength(2);
      expect(harness.events[0]).toEqual({ type: "exitCode", value: 1 });
      const output = harness.events[1];
      if (output?.type !== "stdout") throw new Error("missing CLI result");
      expect(parseCliEnvelope(output.value)).toMatchObject({
        status: "failed",
        data: {
          code: "bundle_not_found",
          message: "bundle unavailable",
          recovery: "Provide a compatible bundle.",
        },
      });
    } finally {
      await harness.module.close();
    }
  });
});
