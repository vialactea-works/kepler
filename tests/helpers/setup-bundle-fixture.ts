import {
  bundleManifestContentDigest,
  sha256Digest,
  type BundleCompatibility,
  type BundleManifest,
} from "../../packages/cli/src/cli/installation-record.js";
import type { SetupBundleSnapshot } from "../../packages/cli/src/cli/setup-bundle.js";

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
const requiredSkills = new Set(skillIds.slice(0, 8));
const constructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const hostRoles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;
const encoder = new TextEncoder();

export interface SetupBundleFixtureOptions {
  readonly cliReleases?: readonly string[];
  readonly bundleRelease?: string;
  readonly templateContent?: string;
  readonly guidelineContent?: string;
}

export function createSetupBundleFixture(
  options: SetupBundleFixtureOptions = {},
): SetupBundleSnapshot {
  const files = [
    ...constructionTemplatePaths.map((path) => ({
      path,
      contents: encoder.encode(
        path.endsWith("/design.md")
          ? options.templateContent ?? "# Design template\n"
          : `# ${path.split("/").at(-1)}\n`,
      ),
    })),
    {
      path: "guidelines/general/01-code-style.md",
      contents: encoder.encode(options.guidelineContent ?? "# Code style\n"),
    },
    ...skillIds.map((id) => ({
      path: `skills/${id}/SKILL.md`,
      contents: encoder.encode(`${id}\n`),
    })),
    ...hostRoles.map(([, agent_id]) => ({
      path: `agents/claude-code/v1/${agent_id}.md`,
      contents: encoder.encode(`${agent_id}\n`),
    })),
  ];
  const compatibility: BundleCompatibility = {
    cli_releases: [...(options.cliReleases ?? ["0.10.3"])],
    skills: skillIds.map((id) => ({
      id,
      release: "kepler-skills-3.0.0",
      digest: sha256Digest(encoder.encode(`${id}\n`)),
      required: requiredSkills.has(id),
    })),
    host_bindings: hostRoles.map(([role, agent_id]) => ({
      role,
      agent_id,
      release: "claude-code-bindings-1.0.0",
      digest: sha256Digest(encoder.encode(`${agent_id}\n`)),
    })),
  };
  const manifestBase: BundleManifest = {
    manifest_format_version: 1,
    bundle_release: options.bundleRelease ?? "kepler-bundle-3.0.0",
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
