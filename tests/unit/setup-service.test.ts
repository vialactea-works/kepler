import { describe, expect, it } from "vitest";
import * as Path from "node:path";
import * as Yaml from "yaml";
import {
  SetupService,
  type SetupFiles,
} from "../../packages/cli/src/cli/setup.service.js";
import { buildSettingsYaml } from "../../packages/cli/src/cli/setup-settings.js";

describe("SetupService", () => {
  const bundleRoot = "/bundle";
  const templates = "/home/.config/vialactea-works/kepler/templates";
  const guidelines = "/home/.config/vialactea-works/kepler/guidelines";
  const settings = "/home/.config/vialactea-works/kepler/settings.yaml";

  function makePorts(existingSettings?: string) {
    const files = new Map<string, string>();
    if (existingSettings !== undefined) files.set(settings, existingSettings);
    const copies: Array<[string, string]> = [];
    const setupFiles: SetupFiles = {
      ensureHome: () => {},
      copyTemplates: (root) => {
        const source = Path.join(root, "templates");
        copies.push([source, templates]);
        return ["plan.md"];
      },
      copyGuidelineManifests: (root) => {
        copies.push([Path.join(root, "guidelines"), guidelines]);
      },
      writeDefaultSettings: (content) => {
        if (!files.has(settings)) files.set(settings, content);
      },
    };
    return { setupFiles, files, copies };
  }

  it("installs into fresh and existing homes through supplied ports", () => {
    const fresh = makePorts();
    const freshService = new SetupService(
      fresh.setupFiles,
      () => bundleRoot,
    );
    expect(freshService.setup()).toEqual({ templates: ["plan.md"] });
    expect(fresh.files.get(settings)).toContain("name: rtk");
    expect(fresh.copies).toEqual([
      [Path.join(bundleRoot, "templates"), templates],
      [Path.join(bundleRoot, "guidelines"), guidelines],
    ]);

    const existing = makePorts("custom settings\n");
    const existingService = new SetupService(
      existing.setupFiles,
      () => bundleRoot,
    );
    existingService.setup();
    expect(existing.files.get(settings)).toBe("custom settings\n");
  });

  it("reports filesystem and bundle failures from supplied ports", () => {
    const filesystemFailure = makePorts();
    filesystemFailure.setupFiles.ensureHome = () => {
      throw new Error("permission denied");
    };
    expect(
      () =>
        new SetupService(
          filesystemFailure.setupFiles,
          () => bundleRoot,
        ).setup(),
    ).toThrow("Failed to create Kepler home directories");

    const bundleFailure = makePorts();
    expect(
      () =>
        new SetupService(bundleFailure.setupFiles, () => {
          throw new Error("bundle unavailable");
        }).setup(),
    ).toThrow("bundle unavailable");
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
