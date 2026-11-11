import { createResourceManifest, type ResourcePackageSnapshot } from "../../packages/cli/src/cli/release-resources.js";

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
const constructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];
const agentRoles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;
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
  const descriptor = {
    name: "kepler-resources",
    version: release,
    private: true,
    type: "module",
    pi: {
      skills: ["./bundle/skills"],
      subagents: { agents: ["./bundle/agents/pi/v1"] },
    },
  };
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
    ...agentRoles.flatMap(([, agentId]) => [
      {
        path: `agents/pi/v1/${agentId}.md`,
        contents: encoder.encode(`---\nname: ${agentId}\ndescription: ${agentId} role\n---\n\n${agentId} Pi profile\n`),
      },
      {
        path: `agents/claude-code/v1/${agentId}.md`,
        contents: encoder.encode(`---\nname: ${agentId}\ndescription: ${agentId} role\n---\n\n${agentId} Claude Code profile\n`),
      },
    ]),
    { path: "pi-package.json", contents: encoder.encode(`${JSON.stringify(descriptor, null, 2)}\n`) },
  ];
  const manifest = createResourceManifest(release, files);
  return { manifest: `${JSON.stringify(manifest, null, 2)}\n`, files };
}
