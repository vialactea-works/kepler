import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeBuildIdentity } from "../../packages/cli/src/cli/build-identity.js";
import { sha256Digest } from "../../packages/cli/src/cli/content-digest.js";
import { CLI_RELEASE } from "../../packages/cli/src/cli/version.js";

const { readBuildIdentityMock } = vi.hoisted(() => ({
  readBuildIdentityMock: vi.fn(),
}));

vi.mock("../../packages/cli/src/cli/build-identity.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../packages/cli/src/cli/build-identity.js")>();
  return { ...actual, readBuildIdentity: readBuildIdentityMock };
});

import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";

let temporaryRoot: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  readBuildIdentityMock.mockReset();
  if (temporaryRoot) Fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

function nextPatchVersion(version: string): string {
  const [major, minor, patchText] = version.split(".");
  const patch = Number(patchText);
  if (!major || !minor || patchText === undefined || !Number.isSafeInteger(patch)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  return `${major}.${minor}.${patch + 1}`;
}

function currentTarget(): RuntimeBuildIdentity["target"] {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : undefined;
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : undefined;
  if (!os || !arch) throw new Error(`Unsupported setup runtime target: ${process.platform}/${process.arch}`);
  return { os, arch };
}

describe("setup runtime", () => {
  it("rejects a compiled identity for another CLI release before creating the home", () => {
    const wrongRelease = nextPatchVersion(CLI_RELEASE);
    const digest = sha256Digest("mismatched runtime identity fixture");
    const identity: RuntimeBuildIdentity = {
      format_version: 1,
      kepler_release: wrongRelease,
      source: {
        kind: "production",
        commit: "a".repeat(40),
        content_digest: digest,
      },
      target: currentTarget(),
      resource_digest: digest,
    };
    temporaryRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-setup-runtime-"));
    const home = Path.join(temporaryRoot, "home");
    vi.stubEnv("KEPLER_HOME", home);
    readBuildIdentityMock.mockReturnValue(identity);

    expect(() => createSetupRuntime().setup()).toThrow(
      `Build identity release ${wrongRelease} does not match CLI release ${CLI_RELEASE}`,
    );
    expect(Fs.existsSync(home)).toBe(false);
  });
});
