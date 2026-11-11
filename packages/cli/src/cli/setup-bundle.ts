import {
  ResourceManifestError,
  validateResourcePackage,
  type ResourceManifest,
  type ResourcePackageSnapshot,
} from "./release-resources.js";
import type { ContentDigest } from "./installation-record.js";

export interface SetupBundleSnapshot extends ResourcePackageSnapshot {}

export interface ValidatedSetupBundle {
  readonly manifest: ResourceManifest;
  readonly compatibility: {
    readonly check: "compatible";
    readonly cli_release: string;
    readonly resource_release: string;
  };
  readonly files: readonly {
    readonly path: string;
    readonly contents: Uint8Array;
    readonly digest: ContentDigest;
  }[];
}

export class SetupBundleError extends Error {
  constructor(
    readonly code: "invalid_bundle" | "bundle_incompatible",
    message: string,
  ) {
    super(message);
    this.name = "SetupBundleError";
  }
}

export function validateSetupBundle(
  snapshot: SetupBundleSnapshot,
  cliRelease: string,
): ValidatedSetupBundle {
  try {
    const validated = validateResourcePackage(snapshot, cliRelease);
    return {
      ...validated,
      compatibility: {
        check: "compatible",
        cli_release: cliRelease,
        resource_release: validated.manifest.kepler_release,
      },
    };
  } catch (error) {
    const message = errorMessage(error);
    const code =
      error instanceof ResourceManifestError &&
      message.startsWith("Resource package release ")
        ? "bundle_incompatible"
        : "invalid_bundle";
    throw new SetupBundleError(code, message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
