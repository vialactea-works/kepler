import { describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  bundleManifestContentDigest,
  sha256Digest,
  type BundleCompatibility,
  type BundleManifest,
} from "../../packages/cli/src/cli/installation-record.js";
import {
  validateSetupBundle,
  type SetupBundleSnapshot,
} from "../../packages/cli/src/cli/setup-bundle.js";
import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";

const cliRelease = "0.11.0";
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
const standardSkills = new Set(skills.slice(0, 8));
const bindings = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

function withFiles(
  bundle: SetupBundleSnapshot,
  files: SetupBundleSnapshot["files"],
): SetupBundleSnapshot {
  const manifest = JSON.parse(bundle.manifest) as BundleManifest;
  const base: BundleManifest = {
    ...manifest,
    files: Object.fromEntries(
      files.map((file) => [file.path, sha256Digest(file.contents)]),
    ),
    content_digest: sha256Digest(new Uint8Array()),
  };
  return {
    manifest: JSON.stringify({
      ...base,
      content_digest: bundleManifestContentDigest(base),
    }),
    files,
  };
}

function listFiles(root: string, directory = root): string[] {
  return Fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )
    .flatMap((entry) => {
      const path = Path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(root, path)
        : [Path.relative(root, path)];
    });
}

function fixtureBundle(): SetupBundleSnapshot {
  const skillFiles = skills.map((id) => ({
    path: `skills/${id}/SKILL.md`,
    contents: encoder.encode(`${id}\n`),
  }));
  const roleFiles = bindings.map(([, agent_id]) => ({
    path: `agents/claude-code/v1/${agent_id}.md`,
    contents: encoder.encode(`${agent_id}\n`),
  }));
  const files = [
    {
      path: "templates/v3/construction/design.md",
      contents: encoder.encode("# Design template\n"),
    },
    {
      path: "guidelines/general/01-code-style.md",
      contents: encoder.encode("# Code style\n"),
    },
    ...skillFiles,
    ...roleFiles,
  ];
  const compatibility: BundleCompatibility = {
    cli_releases: [cliRelease],
    skills: skillFiles.map((file) => {
      const id = file.path.split("/")[1];
      if (!id) throw new Error("missing skill id");
      return {
        id,
        release: "kepler-skills-3.0.0",
        digest: sha256Digest(file.contents),
        required: standardSkills.has(id),
      };
    }),
    host_bindings: bindings.map(([role, agent_id]) => ({
      role,
      agent_id,
      release: "claude-code-bindings-1.0.0",
      digest: sha256Digest(
        roleFiles.find((file) => file.path.endsWith(`${agent_id}.md`))?.contents ??
          new Uint8Array(),
      ),
    })),
  };
  const manifestBase: BundleManifest = {
    manifest_format_version: 1,
    bundle_release: "kepler-bundle-3.0.0",
    files: Object.fromEntries(
      files.map((file) => [file.path, sha256Digest(file.contents)]),
    ),
    content_digest: sha256Digest(new Uint8Array()),
    compatibility,
  };
  const manifest: BundleManifest = {
    ...manifestBase,
    content_digest: bundleManifestContentDigest(manifestBase),
  };
  return { manifest: JSON.stringify(manifest), files };
}

describe("validateSetupBundle", () => {
  it("validates the repository bundle and packages each source skill byte-for-byte", () => {
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

    expect(bundle.manifest.compatibility.skills).toHaveLength(11);
    expect(bundle.manifest.compatibility.host_bindings).toHaveLength(4);
    for (const skill of bundle.manifest.compatibility.skills) {
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
  });

  it("accepts a complete digest-verified compatible bundle", () => {
    const result = validateSetupBundle(fixtureBundle(), cliRelease);

    expect(result.compatibility).toEqual({
      check: "compatible",
      cli_release: cliRelease,
      bundle_release: "kepler-bundle-3.0.0",
    });
    expect(result.files.map((file) => file.path)).toEqual(
      fixtureBundle().files.map((file) => file.path),
    );
    expect(result.manifest.compatibility.skills).toHaveLength(11);
    expect(result.manifest.compatibility.host_bindings).toHaveLength(4);
  });

  it("rejects unsupported CLI releases before yielding installable files", () => {
    expect(() => validateSetupBundle(fixtureBundle(), "0.10.4")).toThrow(
      "unsupported",
    );
  });

  it("rejects missing, extra, and modified payload files", () => {
    const bundle = fixtureBundle();

    expect(() =>
      validateSetupBundle({ ...bundle, files: bundle.files.slice(1) }, cliRelease),
    ).toThrow("Missing bundle file");
    expect(() =>
      validateSetupBundle(
        {
          ...bundle,
          files: [
            ...bundle.files,
            { path: "templates/extra.md", contents: encoder.encode("extra") },
          ],
        },
        cliRelease,
      ),
    ).toThrow("Unexpected bundle file");
    expect(() =>
      validateSetupBundle(
        {
          ...bundle,
          files: bundle.files.map((file, index) =>
            index === 0
              ? { ...file, contents: encoder.encode("modified") }
              : file,
          ),
        },
        cliRelease,
      ),
    ).toThrow("digest mismatch");
  });

  it("rejects unsafe and duplicate payload paths", () => {
    const bundle = fixtureBundle();

    expect(() =>
      validateSetupBundle(
        {
          ...bundle,
          files: [
            ...bundle.files,
            { path: "../outside", contents: encoder.encode("bad") },
          ],
        },
        cliRelease,
      ),
    ).toThrow("normalized relative path");
    expect(() =>
      validateSetupBundle(
        {
          ...bundle,
          files: [...bundle.files, bundle.files[0]],
        },
        cliRelease,
      ),
    ).toThrow("Duplicate bundle file");
  });

  it("rejects bundles that omit either installable resource group", () => {
    const bundle = fixtureBundle();

    expect(() =>
      validateSetupBundle(
        withFiles(bundle, bundle.files.filter((file) => !file.path.startsWith("guidelines/"))),
        cliRelease,
      ),
    ).toThrow("must include template and guideline resources");
    expect(() =>
      validateSetupBundle(
        withFiles(bundle, bundle.files.filter((file) => !file.path.startsWith("templates/"))),
        cliRelease,
      ),
    ).toThrow("must include template and guideline resources");
  });

  it("rejects a modified manifest aggregate digest", () => {
    const bundle = fixtureBundle();
    const manifest = JSON.parse(bundle.manifest) as BundleManifest;
    const changed = JSON.stringify({
      ...manifest,
      bundle_release: "kepler-bundle-3.0.1",
    });

    expect(() =>
      validateSetupBundle({ ...bundle, manifest: changed }, cliRelease),
    ).toThrow("content_digest does not match");
  });
});
