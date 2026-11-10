import { describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import { SetupService, type SetupFiles } from "../../packages/cli/src/cli/setup.service.js";
import { buildSettingsYaml } from "../../packages/cli/src/cli/setup-settings.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

describe("SetupService candidate validation", () => {
  it("rejects a digest-invalid resource package before resolving installation ports", () => {
    const bundle = createSetupBundleFixture();
    const invalidBundle = {
      ...bundle,
      files: bundle.files.map((file, index) =>
        index === 0 ? { ...file, contents: new TextEncoder().encode("tampered\n") } : file,
      ),
    };
    const files = { readBundle: () => invalidBundle } as unknown as SetupFiles;
    const service = new SetupService(files, () => "/bundle", "3.0.0", { os: "linux", arch: "x64" });

    expect(() => service.setup()).toThrow(expect.objectContaining({ code: "invalid_bundle" }));
  });

  it("requires an embedded build identity instead of adopting cwd or source-checkout identity", () => {
    const files = {
      readBundle: () => createSetupBundleFixture(),
      buildIdentity: () => undefined,
    } as unknown as SetupFiles;
    const service = new SetupService(files, () => "/bundle", "3.0.0", { os: "linux", arch: "x64" });

    expect(() => service.setup()).toThrow(expect.objectContaining({ code: "build_identity_missing" }));
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
