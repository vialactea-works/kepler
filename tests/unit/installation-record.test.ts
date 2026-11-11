import { describe, expect, it } from "vitest";
import {
  bundleManifestContentDigest,
  evaluateBundleCompatibility,
  parseBundleManifest,
  parseInstallationRecord,
  parseInstallationReceipt,
  serializeInstallationRecord,
  serializeInstallationRecordV2,
  type BundleCompatibility,
  type BundleManifest,
  type ContentDigest,
  type InstallationRecord,
  type InstallationRecordV2,
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
    ...Object.fromEntries(
      skillIds.map((id) => [`skills/${id}/SKILL.md`, digest] as const),
    ),
    ...Object.fromEntries(
      roles.map(([, agent_id]) => [
        `agents/claude-code/v1/${agent_id}.md`,
        digest,
      ] as const),
    ),
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
      manifest: bundleManifest,
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
        release: null,
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

function installationRecordV2(): InstallationRecordV2 {
  const generationId = "550e8400-e29b-41d4-a716-446655440001";
  return {
    format_version: 2,
    generation_id: generationId,
    release: {
      version: "3.0.0",
      source: {
        commit: "0123456789abcdef0123456789abcdef01234567",
        content_digest: digest,
        kind: "development",
      },
      target: { os: "linux", arch: "x64" },
    },
    resources: {
      manifest_digest: digest,
      files: {
        "pi-package.json": digest,
        ...Object.fromEntries(skillIds.map((id) => [`skills/${id}/SKILL.md`, digest])),
        ...Object.fromEntries(roles.map(([, agent_id]) => [`agents/pi/v1/${agent_id}.md`, digest])),
      },
    },
    selector: {
      path: "/home/kepler/.kepler-dist/current",
      generation_id: generationId,
    },
    pi_binding: {
      host: { id: "pi", release: "1.2.0", check: "matches" },
      loader: { id: "pi-subagents", release: "0.76.1", check: "matches" },
      scope: "user",
      agent_directory: "/home/kepler/.pi/agent",
      settings_path: "/home/kepler/.pi/agent/settings.json",
      package_source: "/home/kepler/.kepler-dist/current",
      registration: { entry_digest: digest, check: "matches" },
      skills: skillIds.map((id) => ({ id, digest, check: "matches" })),
      roles: roles.map(([role, agent_id]) => ({
        role,
        agent_id,
        digest,
        check: "matches",
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

  it("canonicalizes nested resource members, array order, and Unicode file paths", () => {
    const reordered: BundleManifest = {
      ...bundleManifest,
      compatibility: {
        cli_releases: [...bundleCompatibility.cli_releases].reverse(),
        skills: bundleCompatibility.skills
          .map((skill) => ({
            required: skill.required,
            digest: skill.digest,
            release: skill.release,
            id: skill.id,
          }))
          .reverse(),
        host_bindings: bundleCompatibility.host_bindings
          .map((binding) => ({
            digest: binding.digest,
            release: binding.release,
            agent_id: binding.agent_id,
            role: binding.role,
          }))
          .reverse(),
      },
    };
    const unicodeFiles = {
      ...bundleManifest,
      files: { "templates/Ω.md": digest, "templates/é.md": digest },
    };
    const reorderedUnicodeFiles = {
      ...unicodeFiles,
      files: { "templates/é.md": digest, "templates/Ω.md": digest },
    };

    expect(bundleManifestContentDigest(reordered)).toBe(
      bundleManifest.content_digest,
    );
    expect(bundleManifestContentDigest(unicodeFiles)).toBe(
      bundleManifestContentDigest(reorderedUnicodeFiles),
    );
    expect(() => parseBundleManifest(JSON.stringify(reordered))).not.toThrow();
  });

  it("computes a deterministic digest over the manifest generation and declared files", () => {
    const reordered: BundleManifest = {
      ...bundleManifest,
      files: Object.fromEntries(
        Object.entries(bundleManifest.files).reverse(),
      ),
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

  it("binds skill and host-role digests to their declared bundle files", () => {
    const wrongDigest = `sha256:${"b".repeat(64)}` as ContentDigest;
    const changedSkillManifest: BundleManifest = {
      ...bundleManifest,
      compatibility: {
        ...bundleManifest.compatibility,
        skills: bundleManifest.compatibility.skills.map((skill, index) =>
          index === 0 ? { ...skill, digest: wrongDigest } : skill,
        ),
      },
    };
    const changedBindingManifest: BundleManifest = {
      ...bundleManifest,
      compatibility: {
        ...bundleManifest.compatibility,
        host_bindings: bundleManifest.compatibility.host_bindings.map(
          (binding, index) =>
            index === 0 ? { ...binding, digest: wrongDigest } : binding,
        ),
      },
    };

    expect(() =>
      parseBundleManifest(
        JSON.stringify({
          ...changedSkillManifest,
          content_digest: bundleManifestContentDigest(changedSkillManifest),
        }),
      ),
    ).toThrow("bundle skill digest does not match");
    expect(() =>
      parseBundleManifest(
        JSON.stringify({
          ...changedBindingManifest,
          content_digest: bundleManifestContentDigest(changedBindingManifest),
        }),
      ),
    ).toThrow("bundle host-binding digest does not match");
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
    expect(serializeInstallationRecord(parsed)).toBe(encoded);
    expect(parsed.format_version).toBe(1);
    expect(parsed.bundle_release.release).toBe(bundleRelease);
    expect(parsed.bundle_release.content_digest).toBe(
      bundleManifest.content_digest,
    );
    expect(parsed.skills.map((skill) => skill.id)).toEqual([...skillIds].sort());
    expect(parsed.skills.filter((skill) => skill.required)).toHaveLength(8);
    expect(parsed.host_binding.roles.map((role) => role.agent_id)).toEqual(
      roles.map(([, agent_id]) => agent_id).sort(),
    );
    expect(parsed.skills.every((skill) => skill.check === "not_checked")).toBe(
      true,
    );
    expect(
      parsed.host_binding.roles.every((role) => role.check === "not_checked"),
    ).toBe(true);
  });

  it("binds ownership receipts and installed resource facts to the embedded manifest", () => {
    const record = installationRecord();
    const wrongDigest = `sha256:${"b".repeat(64)}` as ContentDigest;

    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...record,
          bundle_release: {
            ...record.bundle_release,
            installed_files: {
              "templates/v3/construction/design.md": wrongDigest,
            },
          },
        }),
      ),
    ).toThrow("installation receipt is not declared by its bundle manifest");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...record,
          bundle_release: {
            ...record.bundle_release,
            installed_files: { "templates/unlisted.md": digest },
          },
        }),
      ),
    ).toThrow("installation receipt is not declared by its bundle manifest");
    expect(() =>
      parseInstallationRecord(
        JSON.stringify({
          ...record,
          bundle_release: {
            ...record.bundle_release,
            content_digest: wrongDigest,
          },
        }),
      ),
    ).toThrow("bundle identity does not match its manifest");
  });

  it("rejects compatibility claims that contradict known resource checks", () => {
    const record = installationRecord();
    const missingRequiredSkill: InstallationRecord = {
      ...record,
      skills: record.skills.map((skill, index) =>
        index === 0 ? { ...skill, check: "missing" } : skill,
      ),
    };
    const mismatchedRole: InstallationRecord = {
      ...record,
      host_binding: {
        ...record.host_binding,
        roles: record.host_binding.roles.map((role, index) =>
          index === 0 ? { ...role, check: "mismatch" } : role,
        ),
      },
    };
    const missingHostIdentity: InstallationRecord = {
      ...record,
      host_binding: {
        ...record.host_binding,
        host: { id: null, release: null, check: "matches" },
      },
    };

    expect(() =>
      parseInstallationRecord(JSON.stringify(missingRequiredSkill)),
    ).toThrow("expected unknown");
    expect(() => parseInstallationRecord(JSON.stringify(mismatchedRole))).toThrow(
      "expected unsupported",
    );
    expect(() =>
      parseInstallationRecord(JSON.stringify(missingHostIdentity)),
    ).toThrow("requires a host identity");
    expect(
      parseInstallationRecord(
        JSON.stringify({
          ...missingRequiredSkill,
          compatibility: { check: "unknown" },
        }),
      ).compatibility.check,
    ).toBe("unknown");
  });

  it("rejects duplicate JSON object members before parsing manifests or records", () => {
    const record = installationRecord();
    const encoded = JSON.stringify(record);
    const duplicateCompatibility = encoded.replace(
      '"compatibility":{"check":"compatible"}',
      '"compatibility":{"check":"compatible"},"compatibility":{"check":"compatible"}',
    );
    const bundleRelease = JSON.stringify(record.bundle_release);
    const duplicateBundleRelease = encoded.replace(
      `"bundle_release":${bundleRelease}`,
      `"bundle_release":${bundleRelease},"bundle_release":${bundleRelease}`,
    );
    const receiptPath = "templates/v3/construction/design.md";
    const receipt = `"installed_files":{"${receiptPath}":"${digest}"}`;
    const duplicateReceiptPath = encoded.replace(
      receipt,
      `"installed_files":{"${receiptPath}":"${digest}","${receiptPath}":"${digest}"}`,
    );
    const duplicateManifestMember = JSON.stringify(bundleManifest).replace(
      '"bundle_release":"kepler-bundle-3.0.0"',
      '"bundle_release":"kepler-bundle-3.0.0","bundle_release":"kepler-bundle-3.0.0"',
    );

    expect(() => parseInstallationRecord(duplicateCompatibility)).toThrow(
      "Duplicate JSON object member",
    );
    expect(() => parseInstallationRecord(duplicateBundleRelease)).toThrow(
      "Duplicate JSON object member",
    );
    expect(() => parseInstallationRecord(duplicateReceiptPath)).toThrow(
      "Duplicate JSON object member",
    );
    expect(() => parseBundleManifest(duplicateManifestMember)).toThrow(
      "Duplicate JSON object member",
    );
  });

  it("reads v1 receipts as tagged legacy data and round-trips closed v2 receipts", () => {
    const legacy = installationRecord();
    const legacyEncoded = serializeInstallationRecord(legacy);
    const legacyRead = parseInstallationReceipt(legacyEncoded);
    expect(legacyRead).toEqual({
      kind: "legacy-v1",
      record: parseInstallationRecord(legacyEncoded),
    });
    expect(legacyRead.kind === "legacy-v1" && legacyRead.record.host_binding.host).toEqual({
      id: "claude-code",
      release: null,
      check: "not_checked",
    });

    const current = installationRecordV2();
    const encoded = serializeInstallationRecordV2(current);
    const currentRead = parseInstallationReceipt(encoded);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(currentRead.kind).toBe("current-v2");
    if (currentRead.kind !== "current-v2") throw new Error("v2 receipt was not recognized");
    expect(serializeInstallationRecordV2(currentRead.record)).toBe(encoded);
    const unknownHost = {
      ...current,
      pi_binding: {
        ...current.pi_binding,
        host: { ...current.pi_binding.host, check: "unknown" as const },
      },
      compatibility: { check: "unknown" as const },
    };
    expect(parseInstallationReceipt(JSON.stringify(unknownHost))).toMatchObject({
      kind: "current-v2",
      record: { compatibility: { check: "unknown" } },
    });
    expect(() => serializeInstallationRecordV2(unknownHost)).toThrow(
      "before required resources are verified",
    );
    expect(() => parseInstallationRecord(encoded)).toThrow(
      "Unsupported installation record version",
    );
  });

  it("rejects malformed v2 receipt ownership paths and unknown fields", () => {
    const record = installationRecordV2();
    expect(() =>
      parseInstallationReceipt(
        JSON.stringify({
          ...record,
          resources: { ...record.resources, files: { "other.txt": digest } },
        }),
      ),
    ).toThrow("must include pi-package.json");
    expect(() =>
      parseInstallationReceipt(
        JSON.stringify({
          ...record,
          resources: { ...record.resources, files: { "../outside": digest } },
        }),
      ),
    ).toThrow("normalized relative paths");
    expect(() =>
      parseInstallationReceipt(
        JSON.stringify({
          ...record,
          resources: { ...record.resources, files: { "C:/outside": digest } },
        }),
      ),
    ).toThrow("normalized relative paths");
    expect(() =>
      parseInstallationReceipt(JSON.stringify({ ...record, unexpected: true })),
    ).toThrow("must NOT have additional properties");
    expect(() =>
      parseInstallationReceipt(
        JSON.stringify({
          ...record,
          selector: { ...record.selector, generation_id: "550e8400-e29b-41d4-a716-446655440002" },
        }),
      ),
    ).toThrow("selector generation_id");
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
