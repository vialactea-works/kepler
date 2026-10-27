import { describe, expect, it } from "vitest";
import {
  bundleManifestContentDigest,
  evaluateBundleCompatibility,
  parseBundleManifest,
  parseInstallationRecord,
  serializeInstallationRecord,
  type BundleCompatibility,
  type BundleManifest,
  type ContentDigest,
  type InstallationRecord,
} from "../../packages/cli/src/cli/installation-record.js";

const digest: ContentDigest = `sha256:${"a".repeat(64)}`;
const cliRelease = "0.10.3";
const bundleRelease = "kepler-bundle-3.0.0";
const skillsRelease = "kepler-skills-3.0.0";
const hostBindingRelease = "claude-code-bindings-1.0.0";

const skillIds = [
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

const standardSkillIds = new Set(skillIds.slice(0, 8));
const roles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

const bundleCompatibility: BundleCompatibility = {
  cli_releases: [cliRelease],
  skills: skillIds.map((id) => ({
    id,
    release: skillsRelease,
    digest,
    required: standardSkillIds.has(id),
  })),
  host_bindings: roles.map(([role, agent_id]) => ({
    role,
    agent_id,
    release: hostBindingRelease,
    digest,
  })),
};

const bundleManifestBase: BundleManifest = {
  manifest_format_version: 1,
  bundle_release: bundleRelease,
  files: {
    "guidelines/general/01-code-style.md": digest,
    "templates/v3/construction/design.md": digest,
  },
  content_digest: digest,
  compatibility: bundleCompatibility,
};

const bundleManifest: BundleManifest = {
  ...bundleManifestBase,
  content_digest: bundleManifestContentDigest(bundleManifestBase),
};

function installationRecord(): InstallationRecord {
  return {
    format_version: 1,
    generation_id: "550e8400-e29b-41d4-a716-446655440000",
    cli_release: cliRelease,
    bundle_release: {
      release: bundleRelease,
      content_digest: bundleManifest.content_digest,
      installed_files: {
        "templates/v3/construction/design.md": digest,
      },
    },
    skills: bundleCompatibility.skills.map((skill) => ({
      ...skill,
      check: "not_checked",
    })),
    host_binding: {
      host: {
        id: "claude-code",
        release: hostBindingRelease,
        check: "not_checked",
      },
      platform: { os: "linux", arch: "x64" },
      roles: bundleCompatibility.host_bindings.map((binding) => ({
        ...binding,
        check: "not_checked",
      })),
    },
    compatibility: { check: "compatible" },
  };
}

describe("installation generation metadata", () => {
  it("parses a compatible bundle manifest with separate release domains", () => {
    const parsed = parseBundleManifest(JSON.stringify(bundleManifest));

    expect(parsed).toEqual(bundleManifest);
    expect(parsed.bundle_release).not.toBe(skillsRelease);
    expect(parsed.bundle_release).not.toBe(hostBindingRelease);
    expect(parsed.manifest_format_version).toBe(1);
    expect(parsed.compatibility.cli_releases).toEqual([cliRelease]);
  });

  it("rejects unsupported bundle manifest versions and invalid file digests", () => {
    expect(() =>
      parseBundleManifest(
        JSON.stringify({ ...bundleManifest, manifest_format_version: 2 }),
      ),
    ).toThrow("Unsupported bundle manifest version");
    expect(() =>
      parseBundleManifest(
        JSON.stringify({
          ...bundleManifest,
          files: { "templates/plan.md": "sha256:bad" },
        }),
      ),
    ).toThrow("must match pattern");
  });

  it("computes a deterministic digest over the manifest generation and declared files", () => {
    const reordered: BundleManifest = {
      ...bundleManifest,
      files: {
        "templates/v3/construction/design.md": digest,
        "guidelines/general/01-code-style.md": digest,
      },
    };

    expect(bundleManifestContentDigest(reordered)).toBe(
      bundleManifest.content_digest,
    );
    const changedFiles = {
      ...reordered.files,
      "templates/plan.md": digest,
    };
    expect(
      bundleManifestContentDigest({ ...reordered, files: changedFiles }),
    ).not.toBe(bundleManifest.content_digest);
    expect(() =>
      parseBundleManifest(
        JSON.stringify({ ...bundleManifest, files: changedFiles }),
      ),
    ).toThrow("content_digest does not match bundle manifest metadata");
  });

  it("rejects incomplete declared skill or host-binding sets", () => {
    expect(() =>
      parseBundleManifest(
        JSON.stringify({
          ...bundleManifest,
          compatibility: {
            ...bundleManifest.compatibility,
            skills: bundleManifest.compatibility.skills.slice(1),
          },
        }),
      ),
    ).toThrow("must NOT have fewer than 11 items");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...installationRecord(),
          host_binding: {
            ...installationRecord().host_binding,
            roles: installationRecord().host_binding.roles.slice(1),
          },
        }),
      ),
    ).toThrow("must NOT have fewer than 4 items");
  });

  it("matches only explicitly supported CLI releases", () => {
    const parsed = parseBundleManifest(JSON.stringify(bundleManifest));

    expect(evaluateBundleCompatibility(parsed, cliRelease)).toEqual({
      check: "compatible",
      cli_release: cliRelease,
      bundle_release: bundleRelease,
    });
    expect(evaluateBundleCompatibility(parsed, "0.10.4")).toEqual({
      check: "unsupported",
      cli_release: "0.10.4",
      bundle_release: bundleRelease,
    });
    expect(evaluateBundleCompatibility(parsed, "").check).toBe("unknown");
  });

  it("round-trips a version-one installation record without claiming native readiness", () => {
    const record = installationRecord();
    const encoded = serializeInstallationRecord(record);
    const parsed = parseInstallationRecord(encoded);

    expect(encoded.endsWith("\n")).toBe(true);
    expect(parsed).toEqual(record);
    expect(parsed.format_version).toBe(1);
    expect(parsed.bundle_release.release).toBe(bundleRelease);
    expect(parsed.bundle_release.content_digest).toBe(
      bundleManifest.content_digest,
    );
    expect(parsed.skills.map((skill) => skill.id)).toEqual(skillIds);
    expect(parsed.skills.filter((skill) => skill.required)).toHaveLength(8);
    expect(parsed.host_binding.roles.map((role) => role.agent_id)).toEqual(
      roles.map(([, agent_id]) => agent_id),
    );
    expect(parsed.skills.every((skill) => skill.check === "not_checked")).toBe(
      true,
    );
    expect(
      parsed.host_binding.roles.every((role) => role.check === "not_checked"),
    ).toBe(true);
  });

  it("rejects unsupported record versions and unsafe ownership receipts", () => {
    const record = installationRecord();

    expect(() =>
      parseInstallationRecord(
        JSON.stringify({ ...record, format_version: 2 }),
      ),
    ).toThrow("Unsupported installation record version");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...record,
          bundle_release: {
            ...record.bundle_release,
            installed_files: { "../outside": digest },
          },
        }),
      ),
    ).toThrow("paths must be normalized relative paths");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...record,
          bundle_release: {
            ...record.bundle_release,
            installed_files: { "settings.yaml": digest },
          },
        }),
      ),
    ).toThrow("only template and guideline targets");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({ ...record, generation_id: "not-a-uuid" }),
      ),
    ).toThrow("generation_id");
  });
});
