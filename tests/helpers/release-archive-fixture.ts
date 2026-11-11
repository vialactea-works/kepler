import {
  encodeBuildIdentityMarker,
  type RuntimeBuildIdentity,
} from "../../packages/cli/src/cli/build-identity.js";
import {
  createTargetArchive,
  type ReleaseTarget,
} from "../../packages/cli/src/cli/release-archive.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import type { ResourcePackageSnapshot } from "../../packages/cli/src/cli/release-resources.js";
import { createSetupBundleFixture } from "./setup-bundle-fixture.js";

export const archiveFixtureVersion = "3.0.0";
export const archiveFixtureSource: RuntimeBuildIdentity["source"] = {
  kind: "development",
  commit: "0123456789abcdef0123456789abcdef01234567",
  content_digest: sha256Digest("release archive source fixture"),
};
export const archiveFixtureTarget: ReleaseTarget = { os: "linux", arch: "x64" };

export function createReleaseArchiveFixture(input: {
  readonly version?: string;
  readonly target?: ReleaseTarget;
  readonly source?: RuntimeBuildIdentity["source"];
  readonly resources?: ResourcePackageSnapshot;
} = {}): Uint8Array {
  const version = input.version ?? archiveFixtureVersion;
  const target = input.target ?? archiveFixtureTarget;
  const source = input.source ?? archiveFixtureSource;
  const resources = input.resources ?? createSetupBundleFixture({ release: version });
  const resourceManifest = JSON.parse(resources.manifest) as { readonly resource_digest: `sha256:${string}` };
  const identity: RuntimeBuildIdentity = {
    format_version: 1,
    kepler_release: version,
    source,
    target,
    resource_digest: resourceManifest.resource_digest,
  };
  const executable = new TextEncoder().encode(`${encodeBuildIdentityMarker(identity)}\n`);
  return createTargetArchive({
    executable,
    resources,
    expectedVersion: version,
    expectedTarget: target,
    expectedSource: source,
  }).archive;
}
