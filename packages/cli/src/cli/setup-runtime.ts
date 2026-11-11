import { KeplerHomeError, KeplerService } from "@vialactea-works/kepler-core";
import { resolvePackageRoot } from "./bundle-root.js";
import { readBuildIdentity, validateBuildIdentityForRuntime } from "./build-identity.js";
import { CLI_RELEASE } from "./version.js";
import { validateTargetPackageRoot } from "./release-archive.js";
import { createNodeHomeInitializationFiles } from "./home-files.js";
import { initializeHome } from "./home-initializer.js";
import { SetupFailure, type Setup } from "./setup.service.js";

export { SETUP_OPERATION } from "./setup.service.js";

export function createSetupRuntime(): Setup {
  return {
    setup() {
      try {
        const home = new KeplerService().globalHome();
        const identity = readBuildIdentity();
        if (!identity) throw new Error("The executing Kepler binary does not declare a package build identity.");
        validateBuildIdentityForRuntime(identity, {
          release: CLI_RELEASE,
          platform: process.platform,
          arch: process.arch,
        });
        if (identity.source.kind === "production" && Object.hasOwn(process.env, "KEPLER_PACKAGE_ROOT")) {
          throw new Error("A production Kepler binary cannot select a runtime package-root override.");
        }
        const packageRoot = resolvePackageRoot();
        const candidate = validateTargetPackageRoot(packageRoot, {
          expectedIdentity: identity,
          modePolicy: "runtime",
        });
        const manifest = candidate.files.find((file) => file.path === "bundle/manifest.json");
        if (!manifest) throw new Error("The package has no resource manifest.");
        const resourceFiles = candidate.files.flatMap((file) =>
          file.path.startsWith("bundle/") && file.path !== "bundle/manifest.json"
            ? [{ path: file.path.slice("bundle/".length), contents: file.contents }]
            : [],
        );
        const resources = {
          manifest: new TextDecoder("utf-8", { fatal: true }).decode(manifest.contents),
          files: resourceFiles,
        };
        return initializeHome(
          home,
          CLI_RELEASE,
          createNodeHomeInitializationFiles(home, () => resources),
          "{}\n",
        );
      } catch (error) {
        const code = error instanceof KeplerHomeError
          ? "kepler_home_required"
          : "home_initialization_failed";
        throw new SetupFailure(code, error instanceof Error ? error.message : String(error));
      }
    },
  };
}
