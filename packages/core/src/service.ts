import * as Fs from "node:fs";
import * as Path from "node:path";
import { loadKeplerSettings, type KeplerSettings } from "./config.js";
import { resolveLegacyDataPath } from "./migration.js";

export interface KeplerEnvironment {
  KEPLER_HOME?: string;
}

export interface KeplerServiceOptions {
  environment?: KeplerEnvironment;
}

export interface KeplerGlobalPaths {
  home: string;
  templates: string;
  guidelines: string;
  skills: string;
  agents: string;
  settings: string;
  metadata: string;
}

export class KeplerHomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeplerHomeError";
  }
}

export class KeplerService {
  private readonly selectedHome: string | undefined;

  constructor(options: KeplerServiceOptions = {}) {
    this.selectedHome = (options.environment ?? process.env).KEPLER_HOME;
  }

  globalPaths(): KeplerGlobalPaths {
    const home = this.globalHome();
    return {
      home,
      templates: Path.join(home, "templates"),
      guidelines: Path.join(home, "guidelines"),
      skills: Path.join(home, "skills"),
      agents: Path.join(home, "agents"),
      settings: Path.join(home, "settings.yaml"),
      metadata: Path.join(home, "home-metadata.json"),
    };
  }

  globalHome(): string {
    const home = this.selectedHome;
    if (!home || !home.trim() || home.includes("\0") || !Path.isAbsolute(home)) {
      throw new KeplerHomeError("KEPLER_HOME must name an absolute version-specific Kepler home; no fallback home is selected.");
    }
    return Path.resolve(home);
  }

  projectDataPath(projectRoot: string): string {
    const root = Path.resolve(projectRoot);
    return resolveLegacyDataPath(Path.join(root, ".hamilton"), Path.join(root, ".kepler"));
  }

  loadConfig(): KeplerSettings | undefined {
    const settingsPath = this.globalPaths().settings;
    try {
      Fs.lstatSync(settingsPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    return loadKeplerSettings(settingsPath);
  }
}
