import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MetadataLinter,
  type MetadataLintFileSystem,
} from "../../packages/cli/src/cli/metadata-lint.js";

const root = "/project";
const goodId = "11111111-1111-4111-8111-111111111111";
const unitId = "2026-10-21-metadata-check";

const artifact = (
  metadata: Readonly<Record<string, unknown>>,
  body = "# Artifact\n",
): string => {
  const fields = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${fields}\n---\n${body}`;
};

const validProjectReference = artifact({
  id: goodId,
  type: "project-reference",
  schema_version: 3,
  author: "Ada Lovelace <ada@example.com>",
});

interface FileSystemOptions {
  readonly files?: Readonly<Record<string, string>>;
  readonly directories?: readonly string[];
  readonly realpaths?: Readonly<Record<string, string>>;
  readonly unreadable?: readonly string[];
}

const createLinter = (options: FileSystemOptions = {}) => {
  const files = new Map(Object.entries(options.files ?? {}));
  const directories = new Set(options.directories ?? []);
  const realpaths = options.realpaths ?? {};
  const unreadable = new Set(options.unreadable ?? []);
  const calls: string[] = [];
  const fileSystem: MetadataLintFileSystem = {
    realpath: async (path) => {
      calls.push(`realpath:${path}`);
      if (path in realpaths) return realpaths[path] as string;
      if (files.has(path) || directories.has(path)) return path;
      throw new Error("ENOENT");
    },
    isFile: async (path) => {
      calls.push(`isFile:${path}`);
      return files.has(path);
    },
    readFile: async (path) => {
      calls.push(`readFile:${path}`);
      if (unreadable.has(path)) throw new Error("EACCES");
      const value = files.get(path);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
  };
  return { linter: new MetadataLinter(fileSystem), files, calls };
};

describe("MetadataLinter", () => {
  it("validates explicit files relative to the selected root", async () => {
    const path = Path.join(root, "docs", "reference.md");
    const { linter, calls } = createLinter({ files: { [path]: validProjectReference } });

    await expect(linter.execute(root, ["docs/reference.md"])).resolves.toEqual({
      kind: "valid",
      findings: [],
    });
    expect(calls).toEqual([
      `realpath:${path}`,
      `isFile:${path}`,
      `readFile:${path}`,
    ]);
  });

  it("validates unbound project and supporting documents without mission adoption", async () => {
    const projectReference = Path.join(root, "project.md");
    const supportingDocument = Path.join(root, "research.md");
    const { linter } = createLinter({
      files: {
        [projectReference]: validProjectReference,
        [supportingDocument]: artifact({
          id: goodId,
          type: "supporting-document",
          schema_version: 3,
          author: "Ada Lovelace <ada@example.com>",
        }),
      },
    });

    await expect(
      linter.execute(root, ["project.md", "research.md"]),
    ).resolves.toEqual({ kind: "valid", findings: [] });
  });

  it("returns field-specific metadata findings without file contents", async () => {
    const path = Path.join(root, "design.md");
    const invalid = artifact({
      id: "not-a-uuid",
      type: "functional-design",
      schema_version: 4,
      unit_id: unitId,
      author: " ",
      custom: true,
    });
    const { linter } = createLinter({ files: { [path]: invalid } });

    const result = await linter.execute(root, ["design.md"]);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "design.md", field: "id", code: "invalid-id" }),
          expect.objectContaining({
            path: "design.md",
            field: "schema_version",
            code: "unsupported-schema-version",
          }),
          expect.objectContaining({
            path: "design.md",
            field: "author",
            code: "invalid-author",
          }),
          expect.objectContaining({ path: "design.md", field: "custom", code: "unknown-field" }),
        ]),
      );
      expect(JSON.stringify(result)).not.toContain(invalid);
    }
  });

  it("identifies missing fields and reports parser failures as file-level findings", async () => {
    const missingPath = Path.join(root, "missing-author.md");
    const malformedPath = Path.join(root, "malformed.md");
    const { linter } = createLinter({
      files: {
        [missingPath]: artifact({
          id: goodId,
          type: "project-reference",
          schema_version: 3,
        }),
        [malformedPath]: "---\nid: [bad\n---\n# Broken\n",
      },
    });

    const result = await linter.execute(root, ["missing-author.md", "malformed.md"]);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "missing-author.md",
            field: "author",
            code: "missing-field",
          }),
          expect.objectContaining({
            path: "malformed.md",
            field: null,
            code: "malformed-frontmatter",
          }),
        ]),
      );
    }
  });

  it.each([
    {
      name: "requires explicit Markdown paths",
      paths: [],
      options: {},
      code: "invalid_lint_paths",
    },
    {
      name: "rejects non-Markdown paths",
      paths: ["notes.txt"],
      options: {},
      code: "invalid_lint_path",
    },
    {
      name: "rejects missing files",
      paths: ["missing.md"],
      options: {},
      code: "lint_file_unavailable",
    },
    {
      name: "rejects directories passed as files",
      paths: ["folder.md"],
      options: { directories: [Path.join(root, "folder.md")] },
      code: "lint_path_not_file",
    },
    {
      name: "rejects paths whose real target escapes the project",
      paths: ["secret.md"],
      options: {
        files: { "/outside/secret.md": validProjectReference },
        realpaths: { [Path.join(root, "secret.md")]: "/outside/secret.md" },
      },
      code: "lint_path_outside_project",
    },
    {
      name: "reports unreadable files as operation failures",
      paths: ["locked.md"],
      options: {
        files: { [Path.join(root, "locked.md")]: validProjectReference },
        unreadable: [Path.join(root, "locked.md")],
      },
      code: "lint_file_unreadable",
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly paths: readonly string[];
    readonly options: FileSystemOptions;
    readonly code: string;
  }>)("$name", async ({ paths, options, code }) => {
    const { linter } = createLinter(options);

    await expect(linter.execute(root, paths)).resolves.toMatchObject({
      kind: "failed",
      code,
    });
  });

  it("does not modify selected files", async () => {
    const path = Path.join(root, "reference.md");
    const source = validProjectReference;
    const { linter, files, calls } = createLinter({ files: { [path]: source } });

    await linter.execute(root, ["reference.md"]);

    expect(files.get(path)).toBe(source);
    expect(calls.every((call) => /^(realpath|isFile|readFile):/.test(call))).toBe(true);
  });
});
