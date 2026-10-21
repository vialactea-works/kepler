import { describe, expect, it } from "vitest";
import {
  createArtifactReader,
  type ArtifactFileSystem,
  type ArtifactReadResult,
} from "../../packages/cli/src/workbench/artifact-reader.js";

const readFrom = (contents: string): ArtifactFileSystem => ({
  readFile: () => contents,
});

const expectInvalid = (result: ArtifactReadResult, code: string) => {
  expect(result._tag).toBe("invalid");
  if (result._tag === "invalid") expect(result.diagnostic.code).toBe(code);
};

describe("artifact reader", () => {
  it("reads recognized frontmatter and preserves multiline body locations", async () => {
    const result = await createArtifactReader(
      readFrom("---\nartifact: proposal\nchange: demo\n---\n# Title\n\nBody\n"),
    )("changes/demo/proposal.md");

    expect(result).toEqual({
      _tag: "recognized",
      sourcePath: "changes/demo/proposal.md",
      metadata: { artifact: "proposal", change: "demo" },
      body: "# Title\n\nBody\n",
      locations: {
        frontmatter: { startLine: 1, endLine: 4 },
        body: { startLine: 5, endLine: 8 },
        metadata: { startLine: 2, endLine: 3 },
      },
    });
  });

  it("reads BOM-prefixed CRLF frontmatter with a YAML document-end marker", async () => {
    const source =
      "\uFEFF---\r\nartifact: proposal\r\nchange: demo\r\n...\r\n# Title\r\nBody\r\n";
    const result = await createArtifactReader(readFrom(source))("proposal.md");

    expect(result).toEqual({
      _tag: "recognized",
      sourcePath: "proposal.md",
      metadata: { artifact: "proposal", change: "demo" },
      body: "# Title\r\nBody\r\n",
      locations: {
        frontmatter: { startLine: 1, endLine: 4 },
        metadata: { startLine: 2, endLine: 3 },
        body: { startLine: 5, endLine: 7 },
      },
    });
  });

  it("reads the first frontmatter block", async () => {
    const result = await createArtifactReader(
      readFrom(
        "---\nartifact: proposal\n---\nbody\n---\nartifact: review\n---\n",
      ),
    )("proposal.md");

    expect(result._tag).toBe("recognized");
    if (result._tag === "recognized")
      expect(result.metadata.artifact).toBe("proposal");
  });

  it("reports malformed YAML", async () => {
    const result = await createArtifactReader(
      readFrom("---\nartifact: [broken\n---\nbody"),
    )("broken.md");

    expectInvalid(result, "invalid-yaml");
  });

  it("reports duplicate YAML keys", async () => {
    const result = await createArtifactReader(
      readFrom("---\nartifact: proposal\nartifact: review\n---\nbody"),
    )("duplicate.md");

    expectInvalid(result, "duplicate-key");
  });

  it("reports frontmatter without artifact metadata", async () => {
    const result = await createArtifactReader(
      readFrom("---\ntitle: unrelated\n---\nbody"),
    )("missing.md");

    expectInvalid(result, "missing-artifact");
  });

  it("classifies files without frontmatter as unrelated", async () => {
    const result = await createArtifactReader(
      readFrom("# Not an artifact\n\nText\n"),
    )("notes.md");

    expect(result).toEqual({
      _tag: "unrelated",
      sourcePath: "notes.md",
      reason: "no-frontmatter",
      body: "# Not an artifact\n\nText\n",
      locations: { body: { startLine: 1, endLine: 4 } },
    });
  });

  it("reports an unterminated frontmatter block", async () => {
    const result = await createArtifactReader(
      readFrom("---\nartifact: proposal\n# body"),
    )("unterminated.md");

    expectInvalid(result, "unterminated-frontmatter");
  });

  it("reports read failures through a typed diagnostic", async () => {
    const fileSystem: ArtifactFileSystem = {
      readFile: () => {
        throw new Error("permission denied");
      },
    };
    const result = await createArtifactReader(fileSystem)("secret.md");

    expectInvalid(result, "read-failure");
    if (result._tag === "invalid")
      expect(result.diagnostic.message).toContain("permission denied");
  });

  it("supports asynchronous injected file access", async () => {
    const result = await createArtifactReader({
      readFile: async () => "---\nartifact: plan\n---\nbody",
    })("plan.md");

    expect(result._tag).toBe("recognized");
  });
});
