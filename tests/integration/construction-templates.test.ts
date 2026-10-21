import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateConstructionArtifact } from "../../packages/cli/src/construction/artifacts.js";
import { writeMarkdownArtifact } from "../../packages/core/src/index.js";
import type { ConstructionArtifactOwnership } from "../../packages/cli/src/construction/artifacts.js";
import type { MarkdownSectionUpdate } from "../../packages/core/src/index.js";

const unitId = "2026-10-20-template-validation";
const unitRoot = `.kepler/missions/mission-template/construction/units-of-work/${unitId}`;
const ownership: ConstructionArtifactOwnership = {
  kind: "unit",
  unitId,
  unitRoot,
};
const templatesRoot = Path.resolve("bundle/templates/v3/construction");
const temporaryRoots: string[] = [];

const sectionContent: Record<string, readonly MarkdownSectionUpdate[]> = {
  "unit-of-work.md": [
    { heading: "Purpose", markdown: "Operators need reliable search results.\n" },
    { heading: "Scope", markdown: "Include search and exclude administration.\n" },
    { heading: "Context", markdown: "The existing CLI has no search command.\n" },
  ],
  "design.md": [
    { heading: "Domain behavior", markdown: "Users can find matching records.\n" },
    { heading: "Domain model", markdown: "A query returns matching records.\n" },
    { heading: "Boundaries and interactions", markdown: "The CLI calls the search adapter.\n" },
    {
      heading: "Design decisions and open questions",
      markdown: "Detailed model: [domain notes](details/functional-design/domain-model.md).\n",
    },
  ],
  "quality.md": [
    { heading: "Quality requirements", markdown: "Search results remain compatible with current records.\n" },
    { heading: "Constraints and dependencies", markdown: "The existing index remains the source of records.\n" },
    { heading: "Decisions and open questions", markdown: "The unit keeps the current index format.\n" },
  ],
  "plan.md": [
    { heading: "Technical solution", markdown: "Reuse the current index behind a typed adapter.\n" },
    {
      heading: "Task graph context",
      markdown: "The task graph is [`tasks-dag.json`](tasks-dag.json).\n",
    },
    { heading: "Verification strategy", markdown: "Run the repository's unit and integration checks.\n" },
    { heading: "Decisions and open questions", markdown: "The adapter keeps existing index behavior.\n" },
  ],
  "delivery.md": [
    { heading: "Outcome and destination", markdown: "Deliver the search command to CLI users.\n" },
    { heading: "Operations and prerequisites", markdown: "A repository handoff needs no deployment target.\n" },
    { heading: "Verification and recovery", markdown: "Run the CLI checks and revert the change if they fail.\n" },
    { heading: "Decisions and open questions", markdown: "No external delivery operation remains.\n" },
  ],
  "supporting-document.md": [
    { heading: "Purpose", markdown: "This note adds the search model detail.\n" },
    { heading: "Detail", markdown: "A query matches normalized record terms.\n" },
    {
      heading: "References",
      markdown: "Owning artifact: [functional design](../../design.md).\n",
    },
  ],
};

const renderTemplate = async (name: string, suffix: string): Promise<string> => {
  const template = await readFile(Path.join(templatesRoot, name), "utf8");
  const rendered = template
    .replaceAll("{{artifact-uuid-v4}}", `00000000-0000-4000-8000-${suffix}`)
    .replaceAll("{{unit-id}}", unitId)
    .replaceAll("{{original Name <email>}}", "Ada Lovelace <ada@example.com>")
    .replaceAll("{{unit-title}}", "Template validation")
    .replaceAll("{{document-title}}", "Domain model detail");
  const written = writeMarkdownArtifact(name, rendered, {
    ownership: { scope: "unit", unitId },
    sections: sectionContent[name] ?? [],
  });
  if (written.kind === "invalid")
    throw new Error(written.diagnostics.map(({ message }) => message).join("; "));
  return written.source;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("v3 Construction templates", () => {
  it("renders all required and supporting templates as valid repository artifacts", async () => {
    const root = await mkdtemp(Path.join(Os.tmpdir(), "kepler-m02-templates-"));
    temporaryRoots.push(root);
    const absoluteUnitRoot = Path.join(root, unitRoot);
    const detailPath = Path.join(
      absoluteUnitRoot,
      "details/functional-design/domain-model.md",
    );
    await mkdir(Path.dirname(detailPath), { recursive: true });
    await writeFile(Path.join(absoluteUnitRoot, "tasks-dag.json"), "{}\n", "utf8");

    const artifacts = [
      ["unit-of-work.md", "unit-of-work.md", "unit-of-work", "111111111111"],
      ["design.md", "design.md", "functional-design", "222222222222"],
      [
        "quality.md",
        "quality.md",
        "non-functional-requirements",
        "333333333333",
      ],
      ["plan.md", "plan.md", "implementation-plan", "444444444444"],
      ["delivery.md", "delivery.md", "delivery-plan", "555555555555"],
      [
        "supporting-document.md",
        "details/functional-design/domain-model.md",
        "supporting-document",
        "666666666666",
      ],
    ] as const;

    for (const [templateName, artifactName, , suffix] of artifacts) {
      const source = await renderTemplate(templateName, suffix);
      const path = Path.join(absoluteUnitRoot, artifactName);
      await mkdir(Path.dirname(path), { recursive: true });
      await writeFile(path, source, "utf8");
    }

    for (const [templateName, artifactName, expectedType] of artifacts) {
      const path = Path.join(absoluteUnitRoot, artifactName);
      const result = await validateConstructionArtifact({
        repositoryRoot: root,
        artifactPath: Path.relative(root, path),
        ownership,
      });
      expect(result, templateName).toMatchObject({
        kind: "valid",
        artifact: { metadata: { type: expectedType } },
      });
    }

    const markdownFiles = artifacts.map(([, artifactName]) =>
      Path.relative(root, Path.join(absoluteUnitRoot, artifactName)),
    );
    expect(markdownFiles).toEqual([
      `${unitRoot}/unit-of-work.md`,
      `${unitRoot}/design.md`,
      `${unitRoot}/quality.md`,
      `${unitRoot}/plan.md`,
      `${unitRoot}/delivery.md`,
      `${unitRoot}/details/functional-design/domain-model.md`,
    ]);
  });
});
