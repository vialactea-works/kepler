import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import {
  readRepositoryArtifact,
  validateConstructionArtifact,
  writeConstructionArtifact,
  writeVerifiedRepositoryFile,
} from "../../packages/cli/src/construction/artifacts.js";
import type {
  ConstructionArtifactOwnership,
  RepositoryArtifactFileIdentity,
} from "../../packages/cli/src/construction/artifacts.js";

const unitId = "2026-10-20-artifact-pipeline";
const unitRoot = `.kepler/missions/mission-1/construction/units-of-work/${unitId}`;
const ownership: ConstructionArtifactOwnership = {
  kind: "unit",
  unitId,
  unitRoot,
};

const metadata = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "functional-design",
  schema_version: 3,
  unit_id: unitId,
  author: "Ada Lovelace <ada@example.com>",
  ...overrides,
});

const sourceFor = (body: string, overrides: Record<string, unknown> = {}): string =>
  `---\n${Yaml.stringify(metadata(overrides)).trimEnd()}\n---\n${body}`;

const designBody = (firstSection: string): string =>
  `# Design\n\n## Domain behavior\n\n${firstSection}\n\n## Domain model\n\nThe domain model.\n\n## Boundaries and interactions\n\nThe interaction boundary.\n\n## Design decisions and open questions\n\nNo unresolved questions.\n`;

const temporaryRoots: string[] = [];
const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(Path.join(Os.tmpdir(), "kepler-m02-repository-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const artifactPath = (root: string): string => Path.join(root, unitRoot, "design.md");
const requestFor = (root: string, path = `${unitRoot}/design.md`) => ({
  repositoryRoot: root,
  artifactPath: path,
  ownership,
});

describe("Construction artifact filesystem integration", () => {
  it("reads and validates without changing valid or invalid source bytes", async () => {
    const root = await createRoot();
    const path = artifactPath(root);
    await mkdir(Path.dirname(path), { recursive: true });
    const validSource = sourceFor(
      designBody("The behavior preserves non-ASCII text: café, 世界, and 🚀."),
    ).replaceAll("\n", "\r\n");
    await writeFile(path, validSource, "utf8");
    const beforeValid = await readFile(path);

    const read = await readRepositoryArtifact(requestFor(root));
    const valid = await validateConstructionArtifact(requestFor(root));

    expect(read.kind).toBe("read");
    if (read.kind === "read") expect(read.artifact.source).toBe(validSource);
    expect(valid.kind).toBe("valid");
    expect(await readFile(path)).toEqual(beforeValid);

    const invalidSource = sourceFor(designBody("Unsupported schema."), {
      schema_version: 2,
    }).replaceAll("\n", "\r\n");
    await writeFile(path, invalidSource, "utf8");
    const beforeInvalid = await readFile(path);
    const invalid = await validateConstructionArtifact(requestFor(root));

    expect(invalid.kind).toBe("invalid");
    if (invalid.kind === "invalid")
      expect(invalid.diagnostics.map(({ code }) => code)).toContain(
        "unsupported-schema-version",
      );
    expect(await readFile(path)).toEqual(beforeInvalid);
  });

  it("rejects artifact and link symlinks that escape the repository", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const outsideArtifact = Path.join(outside, "design.md");
    const validSource = sourceFor(designBody("An outside artifact."));
    await writeFile(outsideArtifact, validSource, "utf8");
    const linkedArtifact = artifactPath(root);
    await mkdir(Path.dirname(linkedArtifact), { recursive: true });
    await symlink(outsideArtifact, linkedArtifact);

    const linkedResult = await validateConstructionArtifact(requestFor(root));
    expect(linkedResult.kind).toBe("invalid");
    if (linkedResult.kind === "invalid")
      expect(linkedResult.diagnostics.map(({ code }) => code)).toContain(
        "outside-repository",
      );

    await rm(linkedArtifact);
    const outsideLink = Path.join(outside, "detail.md");
    await writeFile(outsideLink, "External file.", "utf8");
    const localLink = Path.join(
      root,
      unitRoot,
      "details/functional-design/detail.md",
    );
    await mkdir(Path.dirname(localLink), { recursive: true });
    await symlink(outsideLink, localLink);
    const source = sourceFor(
      designBody(`[detail](details/functional-design/detail.md)`),
    );
    await writeFile(linkedArtifact, source, "utf8");

    const linkResult = await validateConstructionArtifact(requestFor(root));
    expect(linkResult.kind).toBe("invalid");
    if (linkResult.kind === "invalid")
      expect(linkResult.diagnostics.map(({ code }) => code)).toContain(
        "outside-repository",
      );
  });

  it("refuses a symlink installed after file identity is captured", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const target = Path.join(root, "artifact.md");
    const outsideFile = Path.join(outside, "outside.md");
    await writeFile(target, "validated content.\n", "utf8");
    await writeFile(outsideFile, "outside content.\n", "utf8");
    const original = await stat(target);
    const identity: RepositoryArtifactFileIdentity = {
      dev: original.dev,
      ino: original.ino,
    };

    await rm(target);
    await symlink(outsideFile, target);

    await expect(
      writeVerifiedRepositoryFile(
        target,
        "untrusted update.\n",
        identity,
        "validated content.\n",
      ),
    ).rejects.toThrow();
    expect(await readFile(outsideFile, "utf8")).toBe("outside content.\n");
  });

  it("refuses a regular file replacement with a different identity", async () => {
    const root = await createRoot();
    const target = Path.join(root, "artifact.md");
    const replacement = Path.join(root, "replacement.md");
    await writeFile(target, "validated content.\n", "utf8");
    await writeFile(replacement, "replacement content.\n", "utf8");
    const original = await stat(target);
    const identity: RepositoryArtifactFileIdentity = {
      dev: original.dev,
      ino: original.ino,
    };

    await rm(target);
    await rename(replacement, target);

    await expect(
      writeVerifiedRepositoryFile(
        target,
        "untrusted update.\n",
        identity,
        "validated content.\n",
      ),
    ).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("replacement content.\n");
  });

  it("rejects same-inode content changes made after validation", async () => {
    const root = await createRoot();
    const target = Path.join(root, "artifact.md");
    const originalSource = "validated content.\n";
    const changedSource = "concurrent edit.\n";
    await writeFile(target, originalSource, "utf8");
    const original = await stat(target);
    const identity: RepositoryArtifactFileIdentity = {
      dev: original.dev,
      ino: original.ino,
    };
    await writeFile(target, changedSource, "utf8");
    const changed = await stat(target);
    expect(changed.dev).toBe(identity.dev);
    expect(changed.ino).toBe(identity.ino);

    await expect(
      writeVerifiedRepositoryFile(
        target,
        "stale update.\n",
        identity,
        originalSource,
      ),
    ).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe(changedSource);
  });

  it("keeps cross-section links whose definitions lie in a replaced section", async () => {
    const root = await createRoot();
    const path = artifactPath(root);
    const detailPath = Path.join(root, unitRoot, "details/functional-design/model.md");
    await mkdir(Path.dirname(path), { recursive: true });
    await mkdir(Path.dirname(detailPath), { recursive: true });
    await writeFile(detailPath, "Supporting model detail.\n", "utf8");
    const source = sourceFor(
      "# Design\n\n## Domain behavior\n\nFind matching records.\n\n## Domain model\n\nCurrent model.\n\n[model-ref]: details/functional-design/model.md\n\n## Boundaries and interactions\n\nThe model is [documented here][model-ref].\n\n## Design decisions and open questions\n\nNo unresolved questions.\n",
    );
    await writeFile(path, source, "utf8");

    const result = await writeConstructionArtifact({
      ...requestFor(root),
      update: {
        sections: [{ heading: "Domain model", markdown: "Updated model.\n" }],
      },
    });

    expect(result.kind).toBe("written");
    if (result.kind === "written")
      expect(result.artifact.links.map(({ url }) => url)).toEqual([
        "details/functional-design/model.md",
      ]);
    const validated = await validateConstructionArtifact(requestFor(root));
    expect(validated.kind).toBe("valid");
  });

  it("round-trips authored changes without losing unrelated Markdown meaning", async () => {
    const root = await createRoot();
    const path = artifactPath(root);
    const detailPath = Path.join(root, unitRoot, "details/functional-design/model.md");
    await mkdir(Path.dirname(path), { recursive: true });
    await mkdir(Path.dirname(detailPath), { recursive: true });
    await writeFile(detailPath, "Supporting model detail.\n", "utf8");
    const original = sourceFor(
      `# Design\n\n${designBody("Original behavior.").split("\n\n").slice(1).join("\n\n")}\n\nSee [the model](details/functional-design/model.md).\n\n| Field | Value |\n| --- | --- |\n| Name | **Example** |\n\n\`\`\`ts\n## A heading inside code\nconst value = \"unchanged\";\n\`\`\`\n`,
    );
    await writeFile(path, original, "utf8");
    const before = await readFile(path, "utf8");
    const originalStatus = await stat(path);

    const result = await writeConstructionArtifact({
      ...requestFor(root),
      update: {
        metadata: { labels: ["walking-skeleton"] },
        sections: [
          { heading: "Domain behavior", markdown: "Updated **observable** behavior.\n" },
        ],
      },
    });

    expect(result.kind).toBe("written");
    const after = await readFile(path, "utf8");
    expect(after).not.toBe(before);
    expect((await stat(path)).mode & 0o7777).toBe(originalStatus.mode & 0o7777);
    const validated = await validateConstructionArtifact(requestFor(root));
    expect(validated.kind).toBe("valid");
    if (validated.kind === "valid") {
      expect(validated.artifact.metadata.id).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
      expect(validated.artifact.metadata.author).toBe(
        "Ada Lovelace <ada@example.com>",
      );
      expect(validated.artifact.metadata.labels).toEqual(["walking-skeleton"]);
      expect(validated.artifact.headings.some(({ value }) => value === "A heading inside code")).toBe(false);
      expect(validated.artifact.links.map(({ url }) => url)).toEqual([
        "details/functional-design/model.md",
      ]);
      expect(validated.artifact.body).toContain("Updated **observable** behavior.");
      expect(validated.artifact.body).toContain("| Name | **Example** |");
      expect(validated.artifact.body).toContain("const value = \"unchanged\";");
    }
  });

  it("leaves files unchanged when an authored update fails structural validation", async () => {
    const root = await createRoot();
    const path = artifactPath(root);
    await mkdir(Path.dirname(path), { recursive: true });
    const source = sourceFor(designBody("Original."));
    await writeFile(path, source, "utf8");
    const before = await readFile(path);

    const result = await writeConstructionArtifact({
      ...requestFor(root),
      update: {
        sections: [
          { heading: "Domain behavior", markdown: "[missing](missing.md)\n" },
        ],
      },
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics.map(({ code }) => code)).toContain("missing-link");
    expect(await readFile(path)).toEqual(before);
  });
});
