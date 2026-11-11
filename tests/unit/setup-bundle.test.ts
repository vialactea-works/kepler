import { describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  createResourceManifest,
  parseResourceManifest,
  type ResourceManifest,
} from "../../packages/cli/src/cli/release-resources.js";
import { sha256Digest } from "../../packages/cli/src/cli/installation-record.js";
import {
  SetupBundleError,
  validateSetupBundle,
  type SetupBundleSnapshot,
} from "../../packages/cli/src/cli/setup-bundle.js";
import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const cliRelease = "3.0.0";
const encoder = new TextEncoder();
const skills = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
];
const requiredTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const roles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

function withFiles(
  bundle: SetupBundleSnapshot,
  files: SetupBundleSnapshot["files"],
): SetupBundleSnapshot {
  const manifest = parseResourceManifest(bundle.manifest);
  const next: ResourceManifest = createResourceManifest(manifest.kepler_release, files);
  return { manifest: `${JSON.stringify(next, null, 2)}\n`, files };
}

function listFiles(root: string, directory = root): string[] {
  return Fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = Path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(root, path)
        : [Path.relative(root, path)];
    });
}

describe("validateSetupBundle", () => {
  it("validates the repository format-2 package and all source skill bytes", () => {
    const projectRoot = Path.resolve(import.meta.dirname, "../..");
    const bundleRoot = Path.join(projectRoot, "bundle");
    const runtime = createSetupRuntime({
      environment: {
        HOME: Path.join(projectRoot, ".isolated-test-home"),
        XDG_CONFIG_HOME: Path.join(projectRoot, ".isolated-test-home", ".config"),
      },
    });
    const snapshot = runtime.files.readBundle(bundleRoot);
    const bundle = validateSetupBundle(snapshot, cliRelease);

    expect(bundle.manifest.kepler_release).toBe(cliRelease);
    expect(bundle.compatibility).toEqual({
      check: "compatible",
      cli_release: cliRelease,
      resource_release: cliRelease,
    });
    expect(bundle.manifest.skills).toHaveLength(11);
    expect(bundle.manifest.pi_agents).toHaveLength(4);
    expect(Object.keys(bundle.manifest.files)).toEqual(
      Object.keys(bundle.manifest.files).slice().sort(),
    );
    for (const skill of bundle.manifest.skills) {
      const source = Path.join(projectRoot, "skills", skill.id);
      const packaged = Path.join(bundleRoot, "skills", skill.id);
      const sourceFiles = listFiles(source);
      expect(listFiles(packaged)).toEqual(sourceFiles);
      for (const relativePath of sourceFiles) {
        const sourcePath = Path.join(source, relativePath);
        const packagedPath = Path.join(packaged, relativePath);
        const contents = Fs.readFileSync(sourcePath);
        expect(Fs.readFileSync(packagedPath)).toEqual(contents);
        expect(bundle.manifest.files[`skills/${skill.id}/${relativePath.replaceAll(Path.sep, "/")}`]).toBe(
          sha256Digest(contents),
        );
      }
    }
    for (const [, agentId] of roles) {
      expect(bundle.manifest.files[`agents/pi/v1/${agentId}.md`]).toBeDefined();
      expect(bundle.manifest.files[`agents/claude-code/v1/${agentId}.md`]).toBeDefined();
    }
    expect(bundle.manifest.files["pi-package.json"]).toBeDefined();
  });

  it("accepts a complete digest-verified compatible format-2 package", () => {
    const fixture = createSetupBundleFixture();
    const result = validateSetupBundle(fixture, cliRelease);

    expect(result.compatibility).toEqual({
      check: "compatible",
      cli_release: cliRelease,
      resource_release: cliRelease,
    });
    expect(result.files.map((file) => file.path)).toEqual(
      fixture.files.map((file) => file.path),
    );
    expect(result.manifest.skills).toHaveLength(11);
    expect(result.manifest.pi_agents).toHaveLength(4);
  });

  it("rejects a different CLI release before yielding installable files", () => {
    expect(() => validateSetupBundle(createSetupBundleFixture(), "3.0.1"))
      .toThrow("does not match expected Kepler release 3.0.1");
  });

  it("rejects missing, extra, and modified inventory files", () => {
    const fixture = createSetupBundleFixture();

    expect(() => validateSetupBundle({ ...fixture, files: fixture.files.slice(1) }, cliRelease))
      .toThrow("Missing resource file");
    expect(() => validateSetupBundle({
      ...fixture,
      files: [...fixture.files, { path: "templates/extra.md", contents: encoder.encode("extra") }],
    }, cliRelease)).toThrow("Unexpected resource file");
    expect(() => validateSetupBundle({
      ...fixture,
      files: fixture.files.map((file, index) =>
        index === 0 ? { ...file, contents: encoder.encode("modified") } : file,
      ),
    }, cliRelease)).toThrow("digest mismatch");
  });

  it("rejects unsafe and duplicate payload paths", () => {
    const fixture = createSetupBundleFixture();

    expect(() => validateSetupBundle({
      ...fixture,
      files: [...fixture.files, { path: "../outside", contents: encoder.encode("bad") }],
    }, cliRelease)).toThrow("normalized relative path");
    expect(() => validateSetupBundle({
      ...fixture,
      files: [...fixture.files, fixture.files[0]!],
    }, cliRelease)).toThrow("Duplicate resource file");
  });

  it.each(requiredTemplatePaths)("rejects a self-consistent package missing template %s", (missingPath) => {
    const fixture = createSetupBundleFixture();
    const incomplete = withFiles(fixture, [
      ...fixture.files.filter((file) => file.path !== missingPath),
      { path: "templates/extra.md", contents: encoder.encode("# Extra\n") },
    ]);
    let caught: unknown;
    try {
      validateSetupBundle(incomplete, cliRelease);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SetupBundleError);
    expect(caught).toMatchObject({
      code: "invalid_bundle",
      message: `Missing required Construction template: ${missingPath}`,
    });
  });

  it("rejects packages that omit a guideline or Pi role definition", () => {
    const fixture = createSetupBundleFixture();
    expect(() => validateSetupBundle(
      withFiles(fixture, fixture.files.filter((file) => !file.path.startsWith("guidelines/"))),
      cliRelease,
    )).toThrow("must include guidelines");
    expect(() => validateSetupBundle(
      withFiles(fixture, fixture.files.filter((file) => file.path !== "agents/pi/v1/kepler-coder.md")),
      cliRelease,
    )).toThrow("Missing required resource: agents/pi/v1/kepler-coder.md");
  });

  it("rejects a modified manifest aggregate digest", () => {
    const fixture = createSetupBundleFixture();
    const manifest = JSON.parse(fixture.manifest) as ResourceManifest;
    const changed = JSON.stringify({ ...manifest, kepler_release: "3.0.1" });

    expect(() => validateSetupBundle({ ...fixture, manifest: changed }, cliRelease))
      .toThrow("resource_digest does not match");
  });
});
