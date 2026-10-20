import * as Fs from "node:fs";
import * as Path from "node:path";
import { KeplerService } from "@vialactea-works/kepler-core";
import { resolveBundleRoot } from "./bundle-root.js";
import type { SetupBundleLocator, SetupFiles } from "./setup.service.js";

export const SETUP_OPERATION = Symbol("SETUP_OPERATION");
export const SETUP_FILES = Symbol("SETUP_FILES");
export const SETUP_BUNDLE_LOCATOR = Symbol("SETUP_BUNDLE_LOCATOR");

export function createSetupRuntime(): {
  files: SetupFiles;
  bundleLocator: SetupBundleLocator;
} {
  const kepler = new KeplerService();

  return {
    files: {
      ensureHome: () => {
        kepler.ensureGlobalHome();
      },
      copyTemplates: (bundleRoot) => {
        const source = Path.join(bundleRoot, "templates");
        if (!Fs.existsSync(source)) return [];

        const destination = kepler.globalPaths().templates;
        Fs.cpSync(source, destination, { recursive: true, force: true });

        return (Fs.readdirSync(destination, { recursive: true }) as string[])
          .filter((name) =>
            Fs.statSync(Path.join(destination, name)).isFile(),
          )
          .map((name) => name.split(Path.sep).join("/"))
          .sort();
      },
      copyGuidelineManifests: (bundleRoot) => {
        const source = Path.join(bundleRoot, "guidelines");
        if (!Fs.existsSync(source)) return;
        Fs.cpSync(source, kepler.globalPaths().guidelines, {
          recursive: true,
          force: true,
        });
      },
      writeDefaultSettings: (content) => {
        const path = kepler.globalPaths().settings;
        if (!Fs.existsSync(path)) Fs.writeFileSync(path, content);
      },
    },
    bundleLocator: resolveBundleRoot,
  };
}
