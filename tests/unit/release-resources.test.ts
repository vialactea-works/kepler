import { describe, expect, it } from "vitest";
import {
  createResourceManifest,
  parseResourceManifest,
  resourceManifestContentDigest,
  validateResourcePackage,
} from "../../packages/cli/src/cli/release-resources.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const encoder = new TextEncoder();

function packageWithFiles(files: readonly { readonly path: string; readonly contents: Uint8Array }[]) {
  const manifest = createResourceManifest("3.0.0", files);
  return { manifest: `${JSON.stringify(manifest)}\n`, files };
}

describe("versioned home resource manifest", () => {
  it("validates the complete template, guideline, skill, and agent-profile inventory", () => {
    const fixture = createSetupBundleFixture();
    const result = validateResourcePackage(fixture, "3.0.0");

    expect(result.manifest.manifest_format_version).toBe(3);
    expect(result.manifest.kepler_release).toBe("3.0.0");
    expect(result.manifest.skills).toHaveLength(13);
    expect(result.manifest.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "kepler-mission-startup", required: true }),
      expect.objectContaining({ id: "kepler-resume", required: false }),
      expect.objectContaining({ id: "kepler-design", required: true }),
      expect.objectContaining({ id: "kepler-research", required: false }),
    ]));
    expect(result.manifest.agent_profiles).toHaveLength(8);
    expect(result.manifest).not.toHaveProperty("pi_agents");
    expect(result.files).toHaveLength(fixture.files.length);
  });

  it("rejects missing or misclassified entry and recovery skills", () => {
    const fixture = createSetupBundleFixture();
    const manifest = parseResourceManifest(fixture.manifest);
    const withoutStartup = fixture.files.filter((file) => file.path !== "skills/kepler-mission-startup/SKILL.md");
    expect(() => createResourceManifest("3.0.0", withoutStartup)).toThrow("Missing required resource");
    for (const id of ["kepler-mission-startup", "kepler-resume"]) {
      const changed = { ...manifest, skills: manifest.skills.map((skill) => skill.id === id ? { ...skill, required: !skill.required } : skill) };
      expect(() => parseResourceManifest(JSON.stringify({ ...changed, resource_digest: resourceManifestContentDigest(changed) })))
        .toThrow("thirteen accepted skills with their required status");
    }
  });

  it("rejects incomplete, unsafe, duplicate, or tampered inventory entries", () => {
    const fixture = createSetupBundleFixture();
    expect(() => validateResourcePackage({ ...fixture, files: fixture.files.slice(1) }, "3.0.0"))
      .toThrow("Missing resource file");
    expect(() => validateResourcePackage({
      ...fixture,
      files: [...fixture.files, { path: "../outside", contents: encoder.encode("bad") }],
    }, "3.0.0")).toThrow("normalized relative path");
    expect(() => validateResourcePackage({
      ...fixture,
      files: [...fixture.files, fixture.files[0]!],
    }, "3.0.0")).toThrow("Duplicate resource file");
    expect(() => validateResourcePackage({
      ...fixture,
      files: fixture.files.map((file, index) =>
        index === 0 ? { ...file, contents: encoder.encode("tampered") } : file,
      ),
    }, "3.0.0")).toThrow("digest mismatch");
  });

  it("rejects files outside the resource trees that setup copies into the home", () => {
    const fixture = createSetupBundleFixture();
    expect(() => validateResourcePackage(
      packageWithFiles([...fixture.files, { path: "unexpected.txt", contents: encoder.encode("omitted") }]),
      "3.0.0",
    )).toThrow("Unexpected resource package path: unexpected.txt");
  });

  it("rejects Pi package descriptors and unknown skill or agent paths", () => {
    const fixture = createSetupBundleFixture();
    const descriptor = { path: "pi-package.json", contents: encoder.encode("{}\n") };
    expect(() => validateResourcePackage(
      packageWithFiles([...fixture.files, descriptor]),
      "3.0.0",
    )).toThrow("Pi package descriptors are not Kepler home resources");

    const unknownSkill = {
      path: "skills/unlisted/SKILL.md",
      contents: encoder.encode("unlisted skill\n"),
    };
    expect(() => validateResourcePackage(
      packageWithFiles([...fixture.files, unknownSkill]),
      "3.0.0",
    )).toThrow("Unexpected skill resource");

    const unknownAgent = {
      path: "agents/pi/v1/unlisted.md",
      contents: encoder.encode("unlisted agent\n"),
    };
    expect(() => validateResourcePackage(
      packageWithFiles([...fixture.files, unknownAgent]),
      "3.0.0",
    )).toThrow("Unexpected agent resource");
  });

  it("rejects a wrong release and a changed aggregate metadata digest", () => {
    const fixture = createSetupBundleFixture();
    expect(() => validateResourcePackage(fixture, "3.0.1"))
      .toThrow("does not match expected Kepler release");
    const manifest = parseResourceManifest(fixture.manifest);
    expect(resourceManifestContentDigest(manifest)).toBe(manifest.resource_digest);
    expect(() => parseResourceManifest(JSON.stringify({
      ...manifest,
      kepler_release: "3.0.1",
    }))).toThrow("resource_digest does not match");
  });

  it("rejects an unsupported manifest format before accepting a package", () => {
    const fixture = createSetupBundleFixture();
    const manifest = JSON.parse(fixture.manifest) as Record<string, unknown>;

    expect(() => parseResourceManifest(JSON.stringify({
      ...manifest,
      manifest_format_version: 2,
    }))).toThrow("Unsupported resource manifest version: 2");
  });
});
