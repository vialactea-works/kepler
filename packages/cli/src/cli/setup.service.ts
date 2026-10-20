import { buildSettingsYaml } from "./setup-settings.js";

export interface SetupResult {
  readonly templates: readonly string[];
}

export interface SetupFiles {
  ensureHome(): void;
  copyTemplates(bundleRoot: string): string[];
  copyGuidelineManifests(bundleRoot: string): void;
  writeDefaultSettings(content: string): void;
}

export type SetupBundleLocator = () => string;

export interface Setup {
  setup(): SetupResult;
}

export class SetupService implements Setup {
  constructor(
    private readonly files: SetupFiles,
    private readonly bundleLocator: SetupBundleLocator,
  ) {}

  setup(): SetupResult {
    try {
      this.files.ensureHome();
    } catch (error) {
      throw new Error(
        `Failed to create Kepler home directories: ${String(error)}`,
      );
    }

    let bundleRoot: string;
    try {
      bundleRoot = this.bundleLocator();
    } catch (error) {
      throw new Error(String(error));
    }

    const templates = this.copyTemplates(bundleRoot);
    this.copyGuidelineManifests(bundleRoot);
    this.writeDefaultSettings();

    return { templates };
  }

  private copyGuidelineManifests(bundleRoot: string): void {
    try {
      this.files.copyGuidelineManifests(bundleRoot);
    } catch (error) {
      throw new Error(
        `Failed to copy guideline manifests: ${String(error)}`,
      );
    }
  }

  private copyTemplates(bundleRoot: string): string[] {
    try {
      return this.files.copyTemplates(bundleRoot);
    } catch (error) {
      throw new Error(`Failed to copy templates: ${String(error)}`);
    }
  }

  private writeDefaultSettings(): void {
    try {
      this.files.writeDefaultSettings(buildSettingsYaml());
    } catch (error) {
      throw new Error(`Failed to write settings: ${String(error)}`);
    }
  }
}
