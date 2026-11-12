import { createResourceManifest, type ResourcePackageSnapshot } from "../../packages/cli/src/cli/release-resources.js";

const skillIds = [
  "kepler-init",
  "kepler-mission-startup",
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
  "kepler-resume",
];
const constructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const agentProfilePaths = [
  ...["pi", "claude-code"].flatMap((host) =>
    ["architect", "orchestrator", "coder", "reviewer"].map(
      (role) => `agents/${host}/v1/kepler-${role}.md`,
    ),
  ),
];
const encoder = new TextEncoder();

export interface SetupBundleFixtureOptions {
  readonly release?: string;
  readonly templateContent?: string;
  readonly guidelineContent?: string;
}

export function createSetupBundleFixture(
  options: SetupBundleFixtureOptions = {},
): ResourcePackageSnapshot {
  const release = options.release ?? "3.0.0";
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
      contents: encoder.encode(`---\nname: ${id}\ndescription: ${id} skill\n---\n\n${id}\n`),
    })),
    ...agentProfilePaths.map((path) => ({
      path,
      contents: encoder.encode(`---\nname: ${path.split("/").at(-1)?.replace(".md", "")}\ndescription: Kepler agent profile\n---\n\n${path}\n`),
    })),
  ];
  const manifest = createResourceManifest(release, files);
  return { manifest: `${JSON.stringify(manifest, null, 2)}\n`, files };
}
