import { describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import { createArtifactReader } from "../../packages/cli/src/workbench/artifact-reader.js";
import { validateArtifact } from "../../packages/cli/src/workbench/artifact-contracts.js";

const readTemplate = (name: string): string =>
  Fs.readFileSync(new URL(`../../bundle/templates/${name}`, import.meta.url), "utf8");

const renderTemplate = (name: string, capability = "rest-api"): string =>
  readTemplate(name)
    .replaceAll("<Name <email>>", "AUTHOR_IDENTITY")
    .replaceAll("<YYYY-MM-DD-change-title>", "2026-10-12-api-boundary")
    .replaceAll("<YYYY-MM-DD>", "2026-10-12")
    .replaceAll("<capability-name>", capability)
    .replaceAll("<Change Title>", "API boundary")
    .replaceAll("accepted | rejected | skipped", "skipped")
    .replace(/^route_unit:.*$/m, "route_unit: null")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>\n]+>/g, "Example")
    .replaceAll("AUTHOR_IDENTITY", "Ada Lovelace <ada@example.com>");

const check = async (sourcePath: string, source: string) => {
  const read = await createArtifactReader({ readFile: () => source })(sourcePath);
  return validateArtifact(read);
};

const designPath = ".kepler/changes/2026-10-12-api-boundary/design.md";
const designSections = [
  "Context",
  "Goals / Non-Goals",
  "Decisions",
  "Architecture & Components",
  "Testing Strategy",
  "Constraints & Boundaries",
  "Risks / Trade-offs",
];
const legacyDesign = [
  "---",
  "artifact: design",
  "change: 2026-10-12-api-boundary",
  "status: draft",
  "created: 2026-10-12",
  "author: Ada Lovelace <ada@example.com>",
  "decision: accepted",
  "route_unit: null",
  "---",
  "# Design: API boundary",
  "",
  ...designSections.flatMap((heading) => [`## ${heading}`, "", "Existing content.", ""]),
].join("\n");

const legacyProposal = [
  "---",
  "artifact: proposal",
  "change: 2026-10-12-api-boundary",
  "status: approved",
  "decision: accepted",
  "author: Ada Lovelace <ada@example.com>",
  "created: 2026-10-12",
  "route_unit: null",
  "---",
  "# Proposal: API boundary",
  "",
  ...["Why", "Goals & Success Criteria", "Non-Goals", "Proposed Change", "Capabilities", "Impact"].flatMap(
    (heading) => [`## ${heading}`, "", "Existing approved content.", ""],
  ),
].join("\n");

describe("domain-language artifact templates", () => {
  it("keeps the glossary in the canonical requirements-spec contract", async () => {
    const template = readTemplate("glossary.md");
    expect(template).toContain("artifact: requirements-spec");
    expect(template).toContain("capability: glossary");
    expect(template).toContain("# Capability: glossary");
    expect(template.match(/^## .+$/gm)).toEqual([
      "## Overview", "## Contract", "## Behavior", "## Invariants", "## Decisions",
    ]);
    expect(template).toContain("| Term | Definition | Bounded context | Aliases / terms to avoid | Source |");
    expect((await check(".kepler/specs/glossary.md", renderTemplate("glossary.md")))._tag).toBe("valid");
  });

  it("accepts the same term with different scoped meanings without new metadata", async () => {
    const source = renderTemplate("glossary.md").replace(
      /^\| Example \|.*$/m,
      [
        "| Order | An accepted purchase request. | Ordering | Purchase request | docs/ordering.md |",
        "| Order | A billable purchase reference. | Billing | Purchase reference | docs/billing.md |",
      ].join("\n"),
    );
    expect(source).toContain("| Order | An accepted purchase request. | Ordering |");
    expect(source).toContain("| Order | A billable purchase reference. | Billing |");
    expect((await check(".kepler/specs/glossary.md", source))._tag).toBe("valid");
  });

  it("requires canonical glossary metadata and the existing structural sections", async () => {
    const source = renderTemplate("glossary.md");
    const missingAuthor = await check(".kepler/specs/glossary.md", source.replace(/^author:.*\n/m, ""));
    const missingSection = await check(".kepler/specs/glossary.md", source.replace("## Contract", "## Terms"));
    expect(missingAuthor._tag).toBe("invalid");
    expect(missingSection._tag).toBe("invalid");
    if (missingSection._tag === "invalid") {
      expect(missingSection.diagnostics.map(({ code }) => code)).toContain("missing-section");
    }
  });

  it("gives new proposals domain context and boundary impact without changing identity", async () => {
    const template = readTemplate("proposal.md");
    expect(template.indexOf("## Domain Context")).toBeGreaterThan(template.indexOf("## Proposed Change"));
    expect(template.indexOf("## Capabilities")).toBeGreaterThan(template.indexOf("## Domain Context"));
    expect(template).toContain("### Ubiquitous Language");
    expect(template).toContain("| Term | Meaning in this change | Bounded context | Source |");
    expect(template).toContain("### Subdomains and Bounded Contexts");
    expect(template).toContain("| Subdomain | Bounded context | Responsibility | Involvement in the change |");
    expect(template).toContain("### Affected Boundaries");
    expect(template).toContain("| Boundary | Current responsibility or contract | Proposed impact | Coordination needed |");
    expect(template).toContain("requirements/<capability>.md");
    expect((await check(".kepler/changes/2026-10-12-api-boundary/proposal.md", renderTemplate("proposal.md")))._tag).toBe("valid");
  });

  it("places the domain model and architecture before supporting decisions", async () => {
    const template = readTemplate("design.md");
    expect(template.indexOf("## Domain Model")).toBeGreaterThan(template.indexOf("## Goals / Non-Goals"));
    expect(template.indexOf("## Architecture & Components")).toBeGreaterThan(template.indexOf("## Domain Model"));
    expect(template.indexOf("## Decisions")).toBeGreaterThan(template.indexOf("## Data & Flow"));
    expect(template).toContain("### Packages");
    expect(template).toContain("| Package | Change | Responsibility | Domain / context and role | Exposes | Depends on |");
    expect(template).toContain("### Ports & Adapters");
    expect(template).toContain("| Port / contract | Direction and owner | Consumers / providers | Adapter and translation | Source / proposed change |");
    expect(template).toContain("### Code Attribution");
    expect(template).toContain("| Code | Existing / proposed / removed | Domain / context or infrastructure role | Responsibility | Source |");
    expect((await check(designPath, renderTemplate("design.md")))._tag).toBe("valid");
  });

  it("allows a proportionate design without optional model, flow or architecture tables", async () => {
    const optionalSections = ["Domain Model", "Data & Flow", "Error Handling & Edge Cases", "Migration / Rollout", "Open Questions"];
    const optionalSubsections = ["Packages", "Ports & Adapters", "Code Attribution"];
    const source = renderTemplate("design.md")
      .split(/\n(?=## )/)
      .filter((block) => !optionalSections.some((heading) => block.startsWith(`## ${heading}\n`)))
      .join("\n")
      .split(/\n(?=### )/)
      .filter((block) => !optionalSubsections.some((heading) => block.startsWith(`### ${heading}\n`)))
      .join("\n");
    expect(source).not.toContain("## Domain Model");
    expect(source).not.toContain("### Packages");
    expect((await check(designPath, source))._tag).toBe("valid");
  });

  it("accepts a historical design without new semantic sections or metadata", async () => {
    expect(legacyDesign).not.toContain("## Domain Model");
    expect(legacyDesign).not.toContain("### Ports & Adapters");
    const result = await check(designPath, legacyDesign);
    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(Object.keys(result.metadata)).toEqual([
        "artifact", "change", "status", "created", "author", "decision", "route_unit",
      ]);
    }
  });

  it.each(designSections)("still requires the existing design section %s", async (heading) => {
    const result = await check(designPath, legacyDesign.replace(`## ${heading}`, "## Other section"));
    expect(result._tag).toBe("invalid");
    if (result._tag === "invalid") {
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-section", expected: heading }));
    }
  });

  it("retains the stable infrastructure capability mapping for deltas and canonical specs", async () => {
    for (const [name, sourcePath] of [
      ["requirements-change.md", ".kepler/changes/2026-10-12-api-boundary/requirements/rest-api.md"],
      ["requirements-spec.md", ".kepler/specs/rest-api.md"],
    ]) {
      const source = renderTemplate(name)
        .replaceAll("draft | approved", "draft")
        .replaceAll("proposed | approved | rejected", "proposed");
      expect(source).toContain("capability: rest-api");
      expect(source).toContain("# Capability: rest-api");
      expect((await check(sourcePath, source))._tag).toBe("valid");
    }
  });

  it("guides durable architecture into the five canonical sections without extra metadata", async () => {
    const template = readTemplate("requirements-spec.md");
    expect(template.match(/^## .+$/gm)).toEqual([
      "## Overview", "## Contract", "## Behavior", "## Invariants", "## Decisions",
    ]);
    expect((await check(".kepler/specs/rest-api.md", renderTemplate("requirements-spec.md")))._tag).toBe("valid");
  });

  it("reads historical proposals and generic canonical glossaries unchanged", async () => {
    const originalProposal = legacyProposal;
    const originalGlossary = renderTemplate("requirements-spec.md", "glossary");
    expect((await check(".kepler/changes/2026-10-12-api-boundary/proposal.md", originalProposal))._tag).toBe("valid");
    expect((await check(".kepler/specs/glossary.md", originalGlossary))._tag).toBe("valid");
    expect(legacyProposal).toBe(originalProposal);
    expect(originalProposal).not.toContain("## Domain Context");
  });
});
