import { describe, expect, it } from "vitest";
import {
  buildIdentityDigest,
  encodeBuildIdentityMarker,
  parseBuildArtifactIdentity,
  parseBuildIdentity,
  readBuildIdentity,
  readEmbeddedBuildIdentity,
  validateBuildIdentityForRuntime,
  type RuntimeBuildIdentity,
} from "../../packages/cli/src/cli/build-identity.js";
import { sha256Digest } from "../../packages/cli/src/cli/content-digest.js";

const release = "3.0.0";
const digest = sha256Digest("build identity fixture");
const identity: RuntimeBuildIdentity = {
  format_version: 1,
  kepler_release: release,
  source: {
    kind: "development",
    commit: "a".repeat(40),
    content_digest: digest,
  },
  target: { os: "linux", arch: "x64" },
  resource_digest: digest,
};

describe("compiled build identity", () => {
  it("does not accept a runtime environment value as compiled identity", () => {
    expect(readBuildIdentity({})).toBeUndefined();
    expect(readBuildIdentity({ KEPLER_BUILD_IDENTITY: JSON.stringify(identity) })).toBeUndefined();
  });

  it("parses a binary-digest-bound build artifact record", () => {
    const record = {
      format_version: 1,
      binary_digest: digest,
      identity,
    };
    expect(parseBuildArtifactIdentity(JSON.stringify(record))).toEqual(record);
    expect(() => parseBuildArtifactIdentity(JSON.stringify({ ...record, binary_digest: "sha256:invalid" })))
      .toThrow(/binary digest/i);
    expect(() => parseBuildArtifactIdentity(JSON.stringify({ ...record, unbound: true })))
      .toThrow(/missing or unsupported fields/i);
  });

  it("parses only a closed identity with valid source and resource digests", () => {
    expect(parseBuildIdentity(JSON.stringify(identity))).toEqual(identity);
    expect(() => parseBuildIdentity("not-json")).toThrow(/build identity/i);
    expect(() => parseBuildIdentity(JSON.stringify({ ...identity, extra: true })))
      .toThrow(/missing or unsupported fields/i);
    expect(() => parseBuildIdentity(JSON.stringify({ ...identity, format_version: 2 })))
      .toThrow(/unsupported build identity format/i);
    expect(() => parseBuildIdentity(JSON.stringify({
      ...identity,
      source: { ...identity.source, commit: "short" },
    }))).toThrow(/source commit/i);
    expect(() => parseBuildIdentity(JSON.stringify({ ...identity, resource_digest: "sha256:invalid" })))
      .toThrow(/resource digest/i);
  });

  it("extracts the compiled identity marker and rejects missing or duplicate markers", () => {
    const binary = new TextEncoder().encode(`standalone bytes\n${encodeBuildIdentityMarker(identity)}\n`);
    expect(readEmbeddedBuildIdentity(binary)).toEqual(identity);
    expect(() => readEmbeddedBuildIdentity(new TextEncoder().encode("no marker")))
      .toThrow(/exactly one compiled/i);
    expect(() => readEmbeddedBuildIdentity(new TextEncoder().encode(
      `${encodeBuildIdentityMarker(identity)}${encodeBuildIdentityMarker(identity)}`,
    ))).toThrow(/exactly one compiled/i);
  });

  it("rejects a release or target that does not match the running CLI", () => {
    expect(() => validateBuildIdentityForRuntime(identity, {
      release: "3.0.1",
      platform: "linux",
      arch: "x64",
    })).toThrow(/does not match CLI release/i);
    expect(() => validateBuildIdentityForRuntime(identity, {
      release,
      platform: "darwin",
      arch: "x64",
    })).toThrow(/does not match runtime/i);
  });

  it("hashes the normalized compiled identity", () => {
    expect(buildIdentityDigest(identity)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(buildIdentityDigest(identity)).toBe(buildIdentityDigest(parseBuildIdentity(JSON.stringify(identity))));
  });
});
