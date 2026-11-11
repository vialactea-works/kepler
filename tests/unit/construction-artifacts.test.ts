import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import {
  validateConstructionArtifact,
  writeConstructionArtifact,
} from "../../packages/cli/src/construction/artifacts.js";
import type {
  ConstructionArtifactOwnership,
  RepositoryArtifactFileSystem,
} from "../../packages/cli/src/construction/artifacts.js";

const repositoryRoot = "/repository";
const unitId = "2026-10-20-artifact-pipeline";
const unitRoot = `.kepler/missions/mission-1/construction/units-of-work/${unitId}`;
const ownership: ConstructionArtifactOwnership = {
  kind: "unit",
  unitId,
  unitRoot,
};

const metadata = (type = "functional-design") => ({
  id: "11111111-1111-4111-8111-111111111111",
  type,
  schema_version: 3,
  unit_id: unitId,
  author: "Ada Lovelace <ada@example.com>",
});

const sourceFor = (body: string, type?: string): string =>
  `---\n${Yaml.stringify(metadata(type)).trimEnd()}\n---\n${body}`;

const designBody = (content = "A domain behavior."): string =>
  `# Design\n\n## Domain behavior\n\n${content}\n\n## Domain model\n\nA model.\n\n## Boundaries and interactions\n\nA boundary.\n\n## Design decisions and open questions\n\nNo open questions.\n`;

const memoryFileSystem = (
  files: Readonly<Record<string, string>>,
): { readonly fileSystem: RepositoryArtifactFileSystem; readonly contents: Map<string, string> } => {
  const contents = new Map(
    Object.entries(files).map(([path, source]) => [
      Path.resolve(repositoryRoot, path),
      source,
    ]),
  );
  const identities = new Map<string, { readonly dev: number; readonly ino: number }>();
  let nextInode = 1;
  for (const path of contents.keys()) {
    identities.set(path, { dev: 1, ino: nextInode });
    nextInode += 1;
  }
  const directories = new Set([repositoryRoot]);
  for (const file of contents.keys()) {
    let parent = Path.dirname(file);
    while (parent.startsWith(`${repositoryRoot}${Path.sep}`)) {
      directories.add(parent);
      parent = Path.dirname(parent);
    }
  }
  const fileSystem: RepositoryArtifactFileSystem = {
    readFile: async (path) => {
      const source = contents.get(Path.resolve(path));
      if (source === undefined) throw new Error("File does not exist");
      return source;
    },
    writeFile: async (path, source, expectedIdentity, expectedSource) => {
      const absolute = Path.resolve(path);
      const identity = identities.get(absolute);
      if (
        identity === undefined ||
        identity.dev !== expectedIdentity.dev ||
        identity.ino !== expectedIdentity.ino
      )
        throw new Error("File identity changed");
      if (contents.get(absolute) !== expectedSource)
        throw new Error("File content changed");
      contents.set(absolute, source);
    },
    realpath: async (path) => {
      const absolute = Path.resolve(path);
      if (!contents.has(absolute) && !directories.has(absolute))
        throw new Error("Path does not exist");
      return absolute;
    },
    stat: async (path) => {
      const absolute = Path.resolve(path);
      const identity = identities.get(absolute);
      if (identity !== undefined && contents.has(absolute))
        return {
          ...identity,
          isFile: () => true,
          isDirectory: () => false,
        };
      if (directories.has(absolute))
        return { dev: 1, ino: 0, isFile: () => false, isDirectory: () => true };
      throw new Error("Path does not exist");
    },
  };
  return { fileSystem, contents };
};

const artifactPath = `${unitRoot}/design.md`;

describe("Construction artifact checks", () => {
  it("checks root-level sections and real links, excluding code and nested headings", async () => {
    const source = sourceFor(
      `# Design\n\n> ## Domain behavior\n\nQuoted text.\n\n## Domain model\n\nA model.\n\n## Boundaries and interactions\n\n[detail](details/functional-design/model.md)\n\n## Design decisions and open questions\n\nNo open questions.\n\n\`\`\`md\n[missing](missing.md)\n## Hidden section\n\`\`\`\n`,
    );
    const { fileSystem } = memoryFileSystem({
      [artifactPath]: source,
      [`${unitRoot}/details/functional-design/model.md`]: "Supporting details.",
    });
    const result = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      fileSystem,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "missing-section",
      ]);
  });

  it("rejects duplicate required sections", async () => {
    const source = sourceFor(`${designBody()}\n## Domain model\n\nA duplicate.\n`);
    const { fileSystem } = memoryFileSystem({ [artifactPath]: source });
    const result = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      fileSystem,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        "duplicate-section",
      );
  });

  it("rejects missing links, links outside the repository, and mismatched ownership", async () => {
    const missingLink = sourceFor(
      designBody("[missing](details/functional-design/missing.md)"),
    );
    const { fileSystem } = memoryFileSystem({ [artifactPath]: missingLink });
    const missing = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      fileSystem,
    );
    expect(missing.kind).toBe("invalid");
    if (missing.kind === "invalid")
      expect(missing.diagnostics.map(({ code }) => code)).toContain("missing-link");

    const outsideLinkSource = sourceFor(
      designBody("[escape](../../../../../../../outside.md)"),
    );
    const outsideLinkFs = memoryFileSystem({ [artifactPath]: outsideLinkSource });
    const outsideLink = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      outsideLinkFs.fileSystem,
    );
    expect(outsideLink.kind).toBe("invalid");
    if (outsideLink.kind === "invalid")
      expect(outsideLink.diagnostics.map(({ code }) => code)).toContain(
        "outside-repository",
      );

    const outside = await validateConstructionArtifact(
      { repositoryRoot, artifactPath: "../outside.md", ownership },
      fileSystem,
    );
    expect(outside.kind).toBe("invalid");
    if (outside.kind === "invalid")
      expect(outside.diagnostics.map(({ code }) => code)).toContain(
        "outside-repository",
      );

    const wrongOwner = sourceFor(
      designBody(),
    ).replace(unitId, "2026-10-20-other-unit");
    const mismatchFs = memoryFileSystem({ [artifactPath]: wrongOwner });
    const mismatch = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      mismatchFs.fileSystem,
    );
    expect(mismatch.kind).toBe("invalid");
    if (mismatch.kind === "invalid")
      expect(mismatch.diagnostics.map(({ code }) => code)).toContain(
        "unit-ownership-mismatch",
      );
  });

  it("enforces required artifact locations and project ownership", async () => {
    const source = sourceFor(designBody());
    const wrongPath = `${unitRoot}/details/functional-design/design.md`;
    const wrongPathFs = memoryFileSystem({ [wrongPath]: source });
    const wrongLocation = await validateConstructionArtifact(
      { repositoryRoot, artifactPath: wrongPath, ownership },
      wrongPathFs.fileSystem,
    );
    expect(wrongLocation.kind).toBe("invalid");
    if (wrongLocation.kind === "invalid")
      expect(wrongLocation.diagnostics.map(({ code }) => code)).toContain(
        "wrong-artifact-location",
      );

    const projectPath = ".kepler/reference/security-model.md";
    const projectSource = `---\n${Yaml.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      type: "project-reference",
      schema_version: 3,
      author: "Ada Lovelace <ada@example.com>",
    }).trimEnd()}\n---\n# Security model\n\nThe project reference.\n`;
    const projectFs = memoryFileSystem({ [projectPath]: projectSource });
    const projectResult = await validateConstructionArtifact(
      {
        repositoryRoot,
        artifactPath: projectPath,
        ownership: { kind: "project" },
      },
      projectFs.fileSystem,
    );
    expect(projectResult.kind).toBe("valid");

    const directoryPath = ".kepler/reference";
    const directoryPathFs = memoryFileSystem({ [directoryPath]: projectSource });
    const directoryPathResult = await validateConstructionArtifact(
      {
        repositoryRoot,
        artifactPath: directoryPath,
        ownership: { kind: "project" },
      },
      directoryPathFs.fileSystem,
    );
    expect(directoryPathResult.kind).toBe("invalid");
    if (directoryPathResult.kind === "invalid")
      expect(directoryPathResult.diagnostics.map(({ code }) => code)).toContain(
        "wrong-artifact-location",
      );
  });

  it("uses the first Markdown reference definition when checking local links", async () => {
    const source = sourceFor(
      `${designBody("[model][model-ref]")}\n[model-ref]: details/functional-design/missing.md\n[model-ref]: details/functional-design/present.md\n`,
    );
    const { fileSystem } = memoryFileSystem({
      [artifactPath]: source,
      [`${unitRoot}/details/functional-design/present.md`]: "The later target.",
    });
    const result = await validateConstructionArtifact(
      { repositoryRoot, artifactPath, ownership },
      fileSystem,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toContain("missing-link");
  });

  it("rejects content changed in place after artifact validation", async () => {
    const original = sourceFor(designBody());
    const { fileSystem, contents } = memoryFileSystem({
      [artifactPath]: original,
    });
    const absolutePath = Path.resolve(repositoryRoot, artifactPath);
    const concurrentEdit = `${original}\nConcurrent edit.\n`;
    const racingFileSystem: RepositoryArtifactFileSystem = {
      ...fileSystem,
      writeFile: async (path, source, identity, expectedSource) => {
        contents.set(absolutePath, concurrentEdit);
        await fileSystem.writeFile(path, source, identity, expectedSource);
      },
    };

    const result = await writeConstructionArtifact(
      {
        repositoryRoot,
        artifactPath,
        ownership,
        update: { metadata: { labels: ["walking-skeleton"] } },
      },
      racingFileSystem,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        "write-failure",
      );
    expect(contents.get(absolutePath)).toBe(concurrentEdit);
  });

  it("keeps identity and attribution when writing supported metadata", async () => {
    const original = sourceFor(designBody());
    const { fileSystem, contents } = memoryFileSystem({
      [artifactPath]: original,
    });
    const result = await writeConstructionArtifact(
      {
        repositoryRoot,
        artifactPath,
        ownership,
        update: { metadata: { labels: ["walking-skeleton"] } },
      },
      fileSystem,
    );

    expect(result.kind).toBe("written");
    const written = contents.get(Path.resolve(repositoryRoot, artifactPath));
    expect(written).toContain("walking-skeleton");
    expect(written).toContain("Ada Lovelace <ada@example.com>");
    expect(written).toContain("11111111-1111-4111-8111-111111111111");
    expect(written).toContain("## Domain model\n\nA model.");
  });
});
