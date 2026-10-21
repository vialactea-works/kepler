import { describe, expect, it } from "vitest";
import {
  markdownArtifactReader,
  markdownArtifactWriter,
  parseKeplerSettings,
  type ArtifactReader,
  type ArtifactWriter,
  type KeplerEnvironment,
  type KeplerGlobalPaths,
  type KeplerServiceOptions,
  type KeplerSettings,
} from "../../../packages/core/src/index.js";
import {
  SetupService,
  type Setup,
  type SetupBundleLocator,
  type SetupFiles,
  type SetupResult,
} from "../../../packages/cli/src/cli/setup.service.js";

const environment: KeplerEnvironment = { HOME: "/temporary/home" };
const serviceOptions: KeplerServiceOptions = {
  homeDirectory: "/temporary/home",
  environment,
};
const globalPaths: KeplerGlobalPaths = {
  home: "/temporary/home/.config/vialactea-works/kepler",
  templates: "/temporary/home/.config/vialactea-works/kepler/templates",
  guidelines: "/temporary/home/.config/vialactea-works/kepler/guidelines",
  settings: "/temporary/home/.config/vialactea-works/kepler/settings.yaml",
};
const settings: KeplerSettings = parseKeplerSettings("enabled: true");
const artifactReader: ArtifactReader = markdownArtifactReader;
const artifactWriter: ArtifactWriter = markdownArtifactWriter;
const setupFiles: SetupFiles = {
  ensureHome: () => {},
  copyTemplates: () => ["plan.md"],
  copyGuidelineManifests: () => {},
  writeDefaultSettings: () => {},
};
const bundleLocator: SetupBundleLocator = () => "/bundle";
const setup: Setup = new SetupService(setupFiles, bundleLocator);
const setupResult: SetupResult = setup.setup();

describe("public Core and setup contracts", () => {
  it("exposes typed Core settings and path contracts", () => {
    expect(serviceOptions.environment).toBe(environment);
    expect(globalPaths.templates).toContain("/templates");
    expect(settings.enabled).toBe(true);
    expect(artifactReader).toBe(markdownArtifactReader);
    expect(artifactWriter).toBe(markdownArtifactWriter);
  });

  it("runs a use case through its narrow in-memory adapter contract", () => {
    expect(setupResult).toEqual({ templates: ["plan.md"] });
  });
});
