import { describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import {
  markdownArtifactReader,
  markdownArtifactWriter,
  parseMarkdownArtifact,
  parseMarkdownFrontmatter,
  validateArtifact,
  writeMarkdownArtifact,
} from "../../src/index.js";
import type {
  ArtifactOwnership,
  ArtifactReader,
  ArtifactWriter,
} from "../../src/index.js";

const unitId = "2026-10-20-artifact-pipeline";
const unitOwnership: ArtifactOwnership = { scope: "unit", unitId };
const artifactReader: ArtifactReader = markdownArtifactReader;
const artifactWriter: ArtifactWriter = markdownArtifactWriter;
const validMetadata = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "functional-design",
  schema_version: 3,
  unit_id: unitId,
  author: "Ada Lovelace <ada@example.com>",
};

const sourceFor = (
  metadata: Record<string, unknown> = validMetadata,
  body = "# Design\n\n## Domain behavior\n\nCurrent behavior.\n",
): string => `---\n${Yaml.stringify(metadata).trimEnd()}\n---\n${body}`;

const validated = (
  source: string,
  ownership: ArtifactOwnership = unitOwnership,
) => validateArtifact(parseMarkdownArtifact("design.md", source), ownership);

const expectCode = (source: string, code: string): void => {
  const result = validated(source);
  expect(result.kind).toBe("invalid");
  if (result.kind === "invalid")
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
};

describe("shared Markdown artifact parsing", () => {
  it("extracts Markdown structure and source positions while ignoring fenced code", () => {
    const source = `${sourceFor()}\n# Domain **Overview**\n\n[direct](details/functional-design/direct.md) [reference][detail]\n\n![image](assets/diagram.svg)\n\n[detail]: details/functional-design/reference.md\n\n\`\`\`md\n## Fake section\n[hidden](missing.md)\n\`\`\`\n`;
    const result = parseMarkdownArtifact("design.md", source);

    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.artifact.headings.map(({ value }) => value)).toEqual([
      "Design",
      "Domain behavior",
      "Domain Overview",
    ]);
    expect(result.artifact.links.map(({ url, kind }) => [url, kind])).toEqual([
      ["details/functional-design/direct.md", "link"],
      ["details/functional-design/reference.md", "link"],
      ["assets/diagram.svg", "image"],
    ]);
    expect(result.artifact.headings.at(-1)?.location.line).toBe(
      source.split("\n").findIndex((line) => line === "# Domain **Overview**") + 1,
    );
    expect(result.artifact.links[0]?.location.line).toBe(
      source
        .split("\n")
        .findIndex((line) => line.startsWith("[direct](details/functional-design/direct.md)")) +
        1,
    );
    expect(result.artifact.source).toBe(source);
  });

  it("does not treat unresolved reference-like text as an actual link", () => {
    const result = parseMarkdownArtifact(
      "design.md",
      sourceFor(
        validMetadata,
        "# Design\n\n## Domain behavior\n\n[the model][missing-model]\n",
      ),
    );

    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") expect(result.artifact.links).toEqual([]);
  });

  it("marks nested Markdown headings as non-root structure", () => {
    const result = parseMarkdownArtifact(
      "nested.md",
      sourceFor(validMetadata, "# Design\n\n> ## Quoted section\n\nQuoted.\n"),
    );

    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed")
      expect(result.artifact.headings.find(({ value }) => value === "Quoted section"))
        .toMatchObject({ topLevel: false, depth: 2 });
  });

  it.each([
    ["# Missing frontmatter\n", "missing-frontmatter"],
    ["---\nid: [broken\n---\n# Bad\n", "malformed-frontmatter"],
    [
      "---\nid: 11111111-1111-4111-8111-111111111111\nid: 22222222-2222-4222-8222-222222222222\n---\n# Duplicate\n",
      "duplicate-key",
    ],
  ])("reports parser diagnostics for %s", (source, code) => {
    const result = parseMarkdownArtifact("artifact.md", source);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
      expect(result.diagnostics[0]?.location?.line).toBeGreaterThan(0);
    }
  });
});

describe("shared artifact metadata", () => {
  it("accepts common and requester-selected labels with unit ownership", () => {
    const source = sourceFor({
      ...validMetadata,
      labels: ["walking-skeleton", "example.com/Customer-Experience", "plain_label"],
    });
    expect(validated(source).kind).toBe("valid");
  });

  it("requires every shared metadata field", () => {
    for (const field of ["id", "type", "schema_version", "author"] as const) {
      const incomplete: Record<string, unknown> = { ...validMetadata };
      delete incomplete[field];
      expectCode(sourceFor(incomplete), "missing-field");
    }
  });

  it("rejects non-mapping YAML metadata", () => {
    const result = validated("---\n- item\n---\n# Artifact\n");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        "malformed-frontmatter",
      );
  });

  it("allows project-scoped reference and supporting documents without unit_id", () => {
    for (const type of ["project-reference", "supporting-document"]) {
      const metadata: Record<string, unknown> = { ...validMetadata, type };
      delete metadata.unit_id;
      expect(
        validated(sourceFor(metadata), { scope: "project" }).kind,
      ).toBe("valid");
    }
  });

  it.each([
    [{ ...validMetadata, id: "11111111-1111-1111-8111-111111111111" }, "invalid-id"],
    [{ ...validMetadata, schema_version: "3" }, "invalid-schema-version"],
    [{ ...validMetadata, schema_version: 4 }, "unsupported-schema-version"],
    [{ ...validMetadata, type: "functional-design-v2" }, "invalid-type"],
    [{ ...validMetadata, unit_id: "2026-02-30-bad-date" }, "invalid-unit-id"],
    [{ ...validMetadata, author: "Ada Lovelace" }, "invalid-author"],
    [{ ...validMetadata, labels: [] }, "invalid-labels"],
    [{ ...validMetadata, labels: ["bad label"] }, "invalid-label"],
    [{ ...validMetadata, labels: ["example.com/name", "example.com/name"] }, "duplicate-label"],
    [{ ...validMetadata, status: "complete" }, "execution-state-metadata"],
    [{ ...validMetadata, custom: true }, "unknown-field"],
  ])("rejects metadata outside the shared contract", (metadata, code) => {
    expectCode(sourceFor(metadata), code);
  });

  it("requires unit ownership only for unit artifacts and checks the owning unit", () => {
    const missing: Record<string, unknown> = { ...validMetadata };
    delete missing.unit_id;
    expectCode(sourceFor(missing), "missing-unit-id");
    expectCode(
      sourceFor({ ...validMetadata, unit_id: "2026-10-20-other-unit" }),
      "unit-ownership-mismatch",
    );
    expect(
      validated(
        sourceFor({ ...validMetadata, type: "project-reference", unit_id: unitId }),
        { scope: "project" },
      ).kind,
    ).toBe("invalid");
  });

  it("keeps read and validation operations non-mutating", () => {
    const source = sourceFor();
    const before = new TextEncoder().encode(source);
    const result = validated(source);
    const after = new TextEncoder().encode(source);

    expect(result.kind).toBe("valid");
    expect(after).toEqual(before);
    if (result.kind === "valid") expect(result.artifact.source).toBe(source);
  });
});

describe("artifact reader and writer contracts", () => {
  it("parses, validates, and writes through the shared interfaces", () => {
    const parsed = artifactReader.parse("design.md", sourceFor());
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    expect(artifactReader.validate(parsed.artifact, unitOwnership).kind).toBe("valid");

    const written = artifactWriter.write("design.md", parsed.artifact.source, {
      ownership: unitOwnership,
      metadata: { labels: ["walking-skeleton"] },
    });
    expect(written.kind).toBe("written");
  });
});

describe("supported artifact writes", () => {
  it("preserves all source bytes for a validated no-op write", () => {
    const source = sourceFor(
      validMetadata,
      "# Design\r\n\r\n## Domain behavior\r\n\r\nPreserve this.\r\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
    });

    expect(result).toEqual({ kind: "written", source });
  });

  it("updates the root-level section when a title shares its name", () => {
    const source = sourceFor(
      validMetadata,
      "# Domain behavior\n\n## Domain behavior\nOld behavior.\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      sections: [{ heading: "Domain behavior", markdown: "New behavior.\n" }],
    });

    expect(result.kind).toBe("written");
    if (result.kind === "written") {
      expect(result.source).toContain("# Domain behavior");
      expect(result.source).toContain("## Domain behavior\n\nNew behavior.");
    }
  });

  it("keeps identity, attribution, and unrelated Markdown meaning during a section update", () => {
    const source = sourceFor(
      { ...validMetadata, labels: ["walking-skeleton"] },
      "# Design\n\n## Domain behavior\n\nReplace this.\n\n## Domain model\n\nKeep **bold** text and [the linked detail](details/functional-design/model.md).\n\n- [x] Keep task-list syntax.\n\nKeep ~~strikethrough~~ syntax.\n\n```ts\n## Code, not a section\nconst value = \"unchanged\";\n```\n".replaceAll("\n", "\r\n"),
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      metadata: { labels: ["walking-skeleton", "example.com/reviewed"] },
      sections: [{ heading: "Domain behavior", markdown: "Describe **new** behavior.\n" }],
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    const parsed = parseMarkdownArtifact("design.md", result.source);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    const validation = validateArtifact(parsed, unitOwnership);
    expect(validation.kind).toBe("valid");
    expect(parsed.artifact.headings.map(({ value }) => value)).toEqual([
      "Design",
      "Domain behavior",
      "Domain model",
    ]);
    expect(parsed.artifact.links.map(({ url }) => url)).toEqual([
      "details/functional-design/model.md",
    ]);
    expect(parsed.artifact.body).toContain("Keep **bold** text");
    expect(parsed.artifact.body).toContain("- [x] Keep task-list syntax.");
    expect(parsed.artifact.body).toContain("Keep ~~strikethrough~~ syntax.");
    expect(parsed.artifact.body).toContain("## Code, not a section");
    if (validation.kind === "valid") {
      expect(validation.artifact.metadata.id).toBe(validMetadata.id);
      expect(validation.artifact.metadata.author).toBe(validMetadata.author);
      expect(validation.artifact.metadata.labels).toEqual([
        "walking-skeleton",
        "example.com/reviewed",
      ]);
    }
  });

  it("retains reference definitions from a replaced section when other sections use them", () => {
    const source = sourceFor(
      validMetadata,
      "# Design\n\n## Domain behavior\n\nFind matching records.\n\n## Domain model\n\nCurrent model.\n\n[model-ref]: details/functional-design/model.md\n\n## Boundaries and interactions\n\nThe model is [documented here][model-ref].\n\n## Design decisions and open questions\n\nNo unresolved questions.\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      sections: [{ heading: "Domain model", markdown: "Updated model.\n" }],
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    const parsed = parseMarkdownArtifact("design.md", result.source);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed")
      expect(parsed.artifact.links.map(({ url }) => url)).toEqual([
        "details/functional-design/model.md",
      ]);
  });

  it("drops reference definitions when every use is replaced", () => {
    const source = sourceFor(
      validMetadata,
      "# Design\n\n## Domain behavior\n\nFind matching records.\n\n## Domain model\n\nCurrent model.\n\n[model-ref]: details/functional-design/model.md\n\n## Boundaries and interactions\n\nThe model is [documented here][model-ref].\n\n## Design decisions and open questions\n\nNo unresolved questions.\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      sections: [
        { heading: "Domain model", markdown: "Updated model.\n" },
        { heading: "Boundaries and interactions", markdown: "No model link.\n" },
      ],
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    expect(result.source).not.toContain("[model-ref]:");
    const parsed = parseMarkdownArtifact("design.md", result.source);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed") expect(parsed.artifact.links).toEqual([]);
  });

  it("lets a surviving later definition take over after replacing the first definition", () => {
    const source = sourceFor(
      validMetadata,
      "# Design\n\n## Domain behavior\n\nFind matching records.\n\n## Domain model\n\nCurrent model.\n\n[model-ref]: details/functional-design/old-model.md\n\n## Boundaries and interactions\n\nThe model is [documented here][model-ref].\n\n[model-ref]: details/functional-design/new-model.md\n\n## Design decisions and open questions\n\nNo unresolved questions.\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      sections: [{ heading: "Domain model", markdown: "Updated model.\n" }],
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    const parsed = parseMarkdownArtifact("design.md", result.source);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed")
      expect(parsed.artifact.links.map(({ url }) => url)).toEqual([
        "details/functional-design/new-model.md",
      ]);
  });

  it("retains only the first needed reference definition across replaced sections", () => {
    const source = sourceFor(
      validMetadata,
      "# Design\n\n## Domain behavior\n\nFind matching records.\n\n## Domain model\n\nCurrent model.\n\n[model-ref]: details/functional-design/first-model.md\n\n## Boundaries and interactions\n\nCurrent boundary.\n\n[model-ref]: details/functional-design/second-model.md\n\n## Design decisions and open questions\n\nThe model is [documented here][model-ref].\n",
    );
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      sections: [
        { heading: "Domain model", markdown: "Updated model.\n" },
        { heading: "Boundaries and interactions", markdown: "Updated boundary.\n" },
      ],
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    expect(result.source).toContain(
      "[model-ref]: details/functional-design/first-model.md",
    );
    expect(result.source).not.toContain(
      "[model-ref]: details/functional-design/second-model.md",
    );
    const parsed = parseMarkdownArtifact("design.md", result.source);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed")
      expect(parsed.artifact.links.map(({ url }) => url)).toEqual([
        "details/functional-design/first-model.md",
      ]);
  });

  it("uses remark frontmatter with BOM, CRLF, and YAML document-end markers", () => {
    const yaml = Yaml.stringify(validMetadata).trimEnd().replaceAll("\n", "\r\n");
    const body = "# Design\r\n\r\n## Domain behavior\r\n\r\nCurrent behavior.\r\n";
    const source = `\uFEFF---\r\n${yaml}\r\n...\r\n${body}`;
    const frontmatter = parseMarkdownFrontmatter(source);

    expect(frontmatter.kind).toBe("present");
    if (frontmatter.kind !== "present") return;
    expect(frontmatter.yaml).toBe(`${yaml}\r\n`);
    expect(frontmatter.value).toBe(yaml);
    expect(source.slice(frontmatter.valueStartOffset, frontmatter.valueEndOffset)).toBe(yaml);
    expect(frontmatter.body).toBe(body);
    expect(source.slice(frontmatter.bodyStartOffset)).toBe(body);
    expect(frontmatter.startLine).toBe(1);
    expect(frontmatter.endLine).toBe(yaml.split("\r\n").length + 2);

    const artifact = parseMarkdownArtifact("design.md", source);
    expect(artifact.kind).toBe("parsed");
    if (artifact.kind === "parsed") {
      expect(artifact.artifact.source).toBe(source);
      expect(artifact.artifact.body).toBe(body);
      expect(artifact.artifact.metadata).toEqual(validMetadata);
    }
  });

  it("distinguishes absent and unterminated YAML frontmatter through remark structure", () => {
    expect(parseMarkdownFrontmatter("# Notes\n")).toEqual({ kind: "absent" });
    expect(parseMarkdownFrontmatter("---\nartifact: proposal\n")).toEqual({
      kind: "unterminated",
    });
  });

  it("preserves the complete body text on metadata-only writes", () => {
    const source = sourceFor(validMetadata, "# Design\r\n\r\n## Domain behavior\r\n\r\nText.\r\n");
    const body = parseMarkdownArtifact("design.md", source);
    expect(body.kind).toBe("parsed");
    if (body.kind !== "parsed") return;
    const result = writeMarkdownArtifact("design.md", source, {
      ownership: unitOwnership,
      metadata: { labels: ["example.com/edited"] },
    });

    expect(result.kind).toBe("written");
    if (result.kind !== "written") return;
    const updated = parseMarkdownArtifact("design.md", result.source);
    expect(updated.kind).toBe("parsed");
    if (updated.kind === "parsed") expect(updated.artifact.body).toBe(body.artifact.body);
  });

  it("rejects unsupported schemas and immutable identity changes", () => {
    const unsupported = sourceFor({ ...validMetadata, schema_version: 2 });
    expect(
      writeMarkdownArtifact("design.md", unsupported, {
        ownership: unitOwnership,
        metadata: { labels: ["example.com/edited"] },
      }),
    ).toMatchObject({ kind: "invalid", diagnostics: [{ code: "unsupported-schema-version" }] });

    const immutable = {
      id: "22222222-2222-4222-8222-222222222222",
      labels: ["walking-skeleton"],
    };
    expect(
      writeMarkdownArtifact("design.md", sourceFor(), {
        ownership: unitOwnership,
        metadata: immutable,
      }),
    ).toMatchObject({ kind: "invalid", diagnostics: [{ code: "immutable-field" }] });
  });
});
