import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseResourceManifest,
  resourceManifestContentDigest,
  validateResourcePackage,
  type ResourceManifest,
} from "../../packages/cli/src/cli/release-resources.js";

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
const templatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const digest = (content: string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

function fixturePackage() {
  const packageDescriptor = {
    name: "kepler-resources",
    version: "3.0.0",
    private: true,
    type: "module",
    pi: {
      skills: ["./bundle/skills"],
      subagents: { agents: ["./bundle/agents/pi/v1"] },
    },
  };
  const files = [
    ...templatePaths.map((path) => ({ path, contents: `# ${path}\n` })),
    { path: "guidelines/general/style.md", contents: "# Style\n" },
    { path: "pi-package.json", contents: `${JSON.stringify(packageDescriptor)}\n` },
    ...skillIds.map((id) => ({
      path: `skills/${id}/SKILL.md`,
      contents: `---\nname: ${id}\ndescription: ${id}\n---\n${id}\n`,
    })),
    ...roles.map(([, agentId]) => ({
      path: `agents/pi/v1/${agentId}.md`,
      contents: `---\nname: ${agentId}\ndescription: ${agentId}\n---\n${agentId}\n`,
    })),
  ];
  const fileDigests = Object.fromEntries(
    files.map(({ path, contents }) => [path, digest(contents)]),
  );
  const base = {
    manifest_format_version: 2 as const,
    kepler_release: "3.0.0",
    files: fileDigests,
    skills: skillIds.map((id) => ({
      id,
      digest: fileDigests[`skills/${id}/SKILL.md`],
      required: standardSkillIds.has(id),
    })),
    pi_agents: roles.map(([role, agent_id]) => ({
      role,
      agent_id,
      digest: fileDigests[`agents/pi/v1/${agent_id}.md`],
    })),
  };
  const manifest: ResourceManifest = {
    ...base,
    resource_digest: resourceManifestContentDigest({
      ...base,
      resource_digest: digest(""),
    }),
  };
  return {
    files: files.map(({ path, contents }) => ({
      path,
      contents: new TextEncoder().encode(contents),
    })),
    manifest,
  };
}

describe("unified resource package manifest", () => {
  it("validates a complete release-3.0.0 inventory and Pi package descriptor", () => {
    const fixture = fixturePackage();
    const result = validateResourcePackage(
      {
        manifest: `${JSON.stringify(fixture.manifest)}\n`,
        files: fixture.files,
      },
      "3.0.0",
    );

    expect(result.manifest.kepler_release).toBe("3.0.0");
    expect(result.manifest.skills).toHaveLength(11);
    expect(result.manifest.pi_agents).toHaveLength(4);
    expect(result.files).toHaveLength(fixture.files.length);
  });

  it("rejects incomplete, unsafe, duplicate, or tampered inventory entries", () => {
    const fixture = fixturePackage();
    const snapshot = {
      manifest: `${JSON.stringify(fixture.manifest)}\n`,
      files: fixture.files,
    };
    expect(() =>
      validateResourcePackage({ ...snapshot, files: snapshot.files.slice(1) }, "3.0.0"),
    ).toThrow("Missing resource file");
    expect(() =>
      validateResourcePackage(
        {
          ...snapshot,
          files: [...snapshot.files, { path: "../outside", contents: new Uint8Array() }],
        },
        "3.0.0",
      ),
    ).toThrow("normalized relative path");
    expect(() =>
      validateResourcePackage(
        { ...snapshot, files: [...snapshot.files, snapshot.files[0]!] },
        "3.0.0",
      ),
    ).toThrow("Duplicate resource file");
    expect(() =>
      validateResourcePackage(
        {
          ...snapshot,
          files: snapshot.files.map((file, index) =>
            index === 0 ? { ...file, contents: new TextEncoder().encode("changed") } : file,
          ),
        },
        "3.0.0",
      ),
    ).toThrow("digest mismatch");
  });

  it("rejects unlisted skill roots exposed by the Pi package directory", () => {
    const fixture = fixturePackage();
    const extraFile = {
      path: "skills/unlisted-skill/SKILL.md",
      contents: new TextEncoder().encode("unlisted skill\n"),
    };
    const files = [...fixture.files, extraFile];
    const base = {
      ...fixture.manifest,
      files: {
        ...fixture.manifest.files,
        [extraFile.path]: digest(new TextDecoder().decode(extraFile.contents)),
      },
      resource_digest: digest(""),
    };
    const manifest = {
      ...base,
      resource_digest: resourceManifestContentDigest(base),
    };
    expect(() => validateResourcePackage(
      { manifest: JSON.stringify(manifest), files },
      "3.0.0",
    )).toThrow("Unexpected skill resource");
  });

  it("rejects wrong release identities and non-Pi package declarations", () => {
    const fixture = fixturePackage();
    expect(() => parseResourceManifest(JSON.stringify(fixture.manifest))).not.toThrow();
    expect(() => validateResourcePackage(
      { manifest: JSON.stringify(fixture.manifest), files: fixture.files },
      "3.0.1",
    )).toThrow("does not match expected Kepler release");

    const descriptor = JSON.parse(
      new TextDecoder().decode(fixture.files.find((file) => file.path === "pi-package.json")?.contents),
    ) as { pi: { skills: string[] } };
    descriptor.pi.skills = ["./skills"];
    const tamperedFiles = fixture.files.map((file) =>
      file.path === "pi-package.json"
        ? { ...file, contents: new TextEncoder().encode(`${JSON.stringify(descriptor)}\n`) }
        : file,
    );
    const changedDigests = Object.fromEntries(
      tamperedFiles.map((file) => [file.path, digest(new TextDecoder().decode(file.contents))]),
    );
    const base = { ...fixture.manifest, files: changedDigests, resource_digest: digest("") };
    const manifest = {
      ...base,
      resource_digest: resourceManifestContentDigest(base),
    };
    expect(() => validateResourcePackage(
      { manifest: JSON.stringify(manifest), files: tamperedFiles },
      "3.0.0",
    )).toThrow("Pi package descriptor");
  });
});
