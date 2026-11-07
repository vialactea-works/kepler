import { describe, expect, it } from "vitest";
import * as Path from "node:path";
import * as Yaml from "yaml";
import {
  parseInstallationRecord,
  sha256Digest,
} from "../../packages/cli/src/cli/installation-record.js";
import {
  SetupFailure,
  SetupService,
  type SetupApplyPlan,
  type SetupFiles,
  type SetupGlobalPaths,
  type SetupPathState,
} from "../../packages/cli/src/cli/setup.service.js";
import { buildSettingsYaml } from "../../packages/cli/src/cli/setup-settings.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const cliRelease = "0.10.3";
const paths: SetupGlobalPaths = {
  home: "/home/.config/vialactea-works/kepler",
  templates: "/home/.config/vialactea-works/kepler/templates",
  guidelines: "/home/.config/vialactea-works/kepler/guidelines",
  settings: "/home/.config/vialactea-works/kepler/settings.yaml",
  installationRecord: "/home/.config/vialactea-works/kepler/installation.json",
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const constructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];

function makePorts(options: {
  bundle?: ReturnType<typeof createSetupBundleFixture>;
  initial?: Readonly<Record<string, SetupPathState>>;
  pendingRecoveryPaths?: readonly string[];
  failEnsure?: boolean;
} = {}) {
  let bundle = options.bundle ?? createSetupBundleFixture();
  const states = new Map<string, SetupPathState>(Object.entries(options.initial ?? {}));
  const events: string[] = [];
  const plans: SetupApplyPlan[] = [];
  const setupFiles: SetupFiles = {
    readBundle: (root) => {
      events.push(`bundle:${root}`);
      return bundle;
    },
    globalPaths: () => {
      events.push("paths");
      return paths;
    },
    ensureHome: () => {
      events.push("ensure");
      if (options.failEnsure) throw new Error("permission denied");
    },
    inspectPath: (path) => states.get(path) ?? { kind: "missing" },
    pendingRecoveryPaths: () => options.pendingRecoveryPaths ?? [],
    applyPlan: (plan) => {
      events.push("apply");
      plans.push(plan);
      const createdFiles: string[] = [];
      const updatedFiles: string[] = [];
      for (const write of plan.resourceWrites) {
        states.set(write.path, { kind: "file", contents: write.contents });
        (write.expectedCurrentDigest === null ? createdFiles : updatedFiles).push(
          write.relativePath,
        );
      }
      if (plan.settingsWrite) {
        states.set(plan.settingsWrite.path, {
          kind: "file",
          contents: encoder.encode(plan.settingsWrite.contents),
        });
      }
      if (plan.installationRecordWrite) {
        states.set(plan.installationRecordWrite.path, {
          kind: "file",
          contents: encoder.encode(plan.installationRecordWrite.contents),
        });
      }
      return {
        createdFiles,
        updatedFiles,
        settingsCreated: plan.settingsWrite !== undefined,
      };
    },
  };
  return {
    setupFiles,
    states,
    events,
    plans,
    setBundle: (next: ReturnType<typeof createSetupBundleFixture>) => {
      bundle = next;
    },
  };
}

function createService(
  files: SetupFiles,
  bundleLocator: () => string = () => "/bundle",
  generationIds: string[] = ["550e8400-e29b-41d4-a716-446655440000"],
): SetupService {
  let nextId = 0;
  return new SetupService(
    files,
    bundleLocator,
    cliRelease,
    { os: "linux", arch: "x64" },
    () => generationIds[nextId++] ?? "550e8400-e29b-41d4-a716-446655440000",
  );
}

describe("SetupService", () => {
  it("validates the bundle before writes and persists an incomplete generation record", () => {
    const ports = makePorts();
    const result = createService(ports.setupFiles).setup();
    const plan = ports.plans[0];
    const recordState = ports.states.get(paths.installationRecord);

    expect(ports.events.indexOf("bundle:/bundle")).toBeLessThan(
      ports.events.indexOf("paths"),
    );
    expect(ports.events.indexOf("paths")).toBeLessThan(
      ports.events.indexOf("ensure"),
    );
    expect(result.templates).toEqual(constructionTemplatePaths);
    expect(result.guidelines).toEqual(["guidelines/general/01-code-style.md"]);
    expect(result.created_files).toEqual([
      ...constructionTemplatePaths,
      "guidelines/general/01-code-style.md",
    ]);
    expect(result.updated_files).toEqual([]);
    expect(result.settings.check).toBe("created");
    expect(result.compatibility.check).toBe("compatible");
    expect(result.host_binding.host).toEqual({
      id: "claude-code",
      release: null,
      check: "not_checked",
    });
    expect(result.skills.every((skill) => skill.check === "not_checked")).toBe(
      true,
    );
    expect(plan.resourceWrites).toHaveLength(constructionTemplatePaths.length + 1);
    expect(plan.resourceWrites.every((write) => write.expectedCurrentDigest === null)).toBe(
      true,
    );
    expect(recordState?.kind).toBe("file");
    if (recordState?.kind !== "file") throw new Error("record was not written");
    const record = parseInstallationRecord(decoder.decode(recordState.contents));
    expect(record.generation_id).toBe(result.generation_id);
    expect(record.bundle_release.manifest.content_digest).toBe(
      record.bundle_release.content_digest,
    );
  });

  it("preserves existing settings and creates defaults only when absent", () => {
    const customSettings = "extensions: []\nmodels: {}\n";
    const ports = makePorts({
      initial: {
        [paths.settings]: { kind: "file", contents: encoder.encode(customSettings) },
      },
    });

    const result = createService(ports.setupFiles).setup();

    expect(result.settings.check).toBe("preserved");
    expect(ports.plans[0].settingsWrite).toBeUndefined();
    expect(decoder.decode((ports.states.get(paths.settings) as { kind: "file"; contents: Uint8Array }).contents)).toBe(
      customSettings,
    );
  });

  it("reuses the same generation when a repeat setup changes nothing", () => {
    const ports = makePorts();
    const service = createService(ports.setupFiles);

    const first = service.setup();
    const second = service.setup();

    expect(second.generation_id).toBe(first.generation_id);
    expect(ports.plans).toHaveLength(1);
  });

  it("updates only unchanged files whose prior record receipt matches", () => {
    const ports = makePorts();
    const service = createService(ports.setupFiles, () => "/bundle", [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
    ]);
    const first = service.setup();
    const newBundle = createSetupBundleFixture({
      bundleRelease: "kepler-bundle-3.0.1",
      templateContent: "# Updated design template\n",
    });
    ports.setBundle(newBundle);

    const second = service.setup();

    expect(second.generation_id).not.toBe(first.generation_id);
    expect(second.created_files).toEqual([]);
    expect(second.updated_files).toEqual([
      "templates/v3/construction/design.md",
    ]);
    expect(ports.plans).toHaveLength(2);
    expect(ports.plans[1].resourceWrites).toHaveLength(1);
    expect(ports.plans[1].resourceWrites[0].relativePath).toBe(
      "templates/v3/construction/design.md",
    );
    expect(ports.plans[1].resourceWrites[0].expectedCurrentDigest).toBe(
      sha256Digest(encoder.encode("# Design template\n")),
    );
  });

  it("fails before writes when an existing necessary file is not owned or was modified", () => {
    const bundle = createSetupBundleFixture();
    const target = Path.join(paths.templates, "v3", "construction", "design.md");
    const userContent = encoder.encode("# User's design template\n");
    const ports = makePorts({
      bundle,
      initial: { [target]: { kind: "file", contents: userContent } },
    });

    expect(() => createService(ports.setupFiles).setup()).toThrow(SetupFailure);
    expect(ports.plans).toHaveLength(0);
    expect(ports.events).not.toContain("ensure");
    expect(ports.states.get(target)).toEqual({ kind: "file", contents: userContent });
  });

  it("rejects incompatible and digest-invalid selected bundles before resolving the home", () => {
    const incompatible = makePorts({
      bundle: createSetupBundleFixture({ cliReleases: ["0.10.2"] }),
    });
    const locatorCalls: string[] = [];
    const service = createService(incompatible.setupFiles, () => {
      locatorCalls.push("selected");
      return "/explicit-bundle";
    });

    expect(() => service.setup()).toThrow("unsupported");
    expect(locatorCalls).toEqual(["selected"]);
    expect(incompatible.events).not.toContain("paths");
    expect(incompatible.events).not.toContain("ensure");

    const invalid = makePorts();
    const snapshot = createSetupBundleFixture();
    invalid.setBundle({
      ...snapshot,
      files: snapshot.files.map((file, index) =>
        index === 0 ? { ...file, contents: encoder.encode("tampered") } : file,
      ),
    });
    expect(() => createService(invalid.setupFiles).setup()).toThrow(
      "digest mismatch",
    );
    expect(invalid.events).not.toContain("paths");
  });

  it("requires manual recovery before a new setup can change files", () => {
    const ports = makePorts({ pendingRecoveryPaths: ["/home/.kepler-setup-recovery-id"] });

    expect(() => createService(ports.setupFiles).setup()).toThrow(
      "manual recovery",
    );
    expect(ports.events).not.toContain("ensure");
    expect(ports.plans).toHaveLength(0);
  });

  it("reports global home failures with a structured setup error", () => {
    const ports = makePorts({ failEnsure: true });

    expect(() => createService(ports.setupFiles).setup()).toThrow(
      "Failed to create Kepler home directories",
    );
    expect(ports.plans).toHaveLength(0);
  });
});

describe("buildSettingsYaml", () => {
  it("produces valid YAML with extensions only", () => {
    const yaml = buildSettingsYaml();
    const parsed = Yaml.parse(yaml);
    expect(parsed.extensions).toHaveLength(3);
    expect(parsed.models).toBeUndefined();
  });

  it("produces valid YAML with extensions and model aliases", () => {
    const yaml = buildSettingsYaml({ cheap: "deepseek-v4" });
    const parsed = Yaml.parse(yaml);
    expect(parsed.extensions).toHaveLength(3);
    expect(parsed.models.aliases.cheap).toBe("deepseek-v4");
  });

  it("omits models section when aliases is empty", () => {
    const yaml = buildSettingsYaml({});
    const parsed = Yaml.parse(yaml);
    expect(parsed.models).toBeUndefined();
  });
});
