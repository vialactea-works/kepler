import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import {
  parseMarkdownArtifact,
  validateArtifact,
} from "@vialactea-works/kepler-core";
import type {
  ArtifactDiagnostic,
  ArtifactDiagnosticCode,
  ArtifactOwnership,
  MarkdownArtifact,
} from "@vialactea-works/kepler-core";

export interface MetadataLintFileSystem {
  readonly realpath: (path: string) => string | Promise<string>;
  readonly isFile: (path: string) => boolean | Promise<boolean>;
  readonly readFile: (path: string) => string | Promise<string>;
}

export interface MetadataLintFinding {
  readonly path: string;
  readonly field: string | null;
  readonly code: string;
  readonly message: string;
}

export interface MetadataLintFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type MetadataLintResult =
  | { readonly kind: "valid"; readonly findings: readonly [] }
  | { readonly kind: "invalid"; readonly findings: readonly MetadataLintFinding[] }
  | MetadataLintFailure;

const metadataDiagnosticFields: Partial<
  Record<ArtifactDiagnosticCode, string>
> = {
  "invalid-id": "id",
  "invalid-type": "type",
  "invalid-schema-version": "schema_version",
  "unsupported-schema-version": "schema_version",
  "invalid-unit-id": "unit_id",
  "missing-unit-id": "unit_id",
  "forbidden-unit-id": "unit_id",
  "unit-ownership-mismatch": "unit_id",
  "invalid-author": "author",
  "invalid-labels": "labels",
  "invalid-label": "labels",
  "duplicate-label": "labels",
};

const nodeFileSystem: MetadataLintFileSystem = {
  realpath: (path) => Fs.realpath(path),
  isFile: async (path) => {
    try {
      return (await Fs.stat(path)).isFile();
    } catch {
      return false;
    }
  },
  readFile: async (path) => Fs.readFile(path, "utf8"),
};

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  recovery: string,
): MetadataLintFailure => ({ kind: "failed", code, message, details, recovery });

const isInsideProject = (root: string, path: string): boolean => {
  const relative = Path.relative(root, path);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${Path.sep}`) &&
    !Path.isAbsolute(relative)
  );
};

const projectRelativePath = (root: string, path: string): string =>
  Path.relative(root, path).split(Path.sep).join("/");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const ownershipFor = (artifact: MarkdownArtifact): ArtifactOwnership => {
  if (!isRecord(artifact.metadata)) return { scope: "unit" };
  if (artifact.metadata.type === "project-reference") return { scope: "project" };
  if (
    artifact.metadata.type === "supporting-document" &&
    !Object.hasOwn(artifact.metadata, "unit_id")
  ) {
    return { scope: "project" };
  }
  return { scope: "unit" };
};

const fieldFor = (
  diagnostic: ArtifactDiagnostic,
  artifact?: MarkdownArtifact,
): string | null => {
  if (artifact && diagnostic.location) {
    const matchingField = Object.entries(artifact.frontmatter.fieldLocations).find(
      ([, location]) =>
        location.offset === diagnostic.location?.offset &&
        location.line === diagnostic.location?.line &&
        location.column === diagnostic.location?.column,
    )?.[0];
    if (matchingField !== undefined) return matchingField;
  }
  const fieldFromMessage = /field '([^']+)'/.exec(diagnostic.message)?.[1];
  return (
    metadataDiagnosticFields[diagnostic.code] ??
    fieldFromMessage ??
    null
  );
};

const toFinding = (
  diagnostic: ArtifactDiagnostic,
  path: string,
  artifact?: MarkdownArtifact,
): MetadataLintFinding => ({
  path,
  field: fieldFor(diagnostic, artifact),
  code: diagnostic.code,
  message: diagnostic.message,
});

export class MetadataLinter {
  constructor(private readonly fileSystem: MetadataLintFileSystem = nodeFileSystem) {}

  async execute(
    projectRoot: string,
    paths: readonly string[],
  ): Promise<MetadataLintResult> {
    if (paths.length === 0) {
      return failure(
        "invalid_lint_paths",
        "Metadata lint requires one or more explicit Markdown file paths.",
        {},
        "Provide at least one Markdown file path and retry.",
      );
    }

    const root = Path.resolve(projectRoot);
    const findings: MetadataLintFinding[] = [];
    for (const inputPath of paths) {
      if (inputPath.length === 0 || Path.extname(inputPath).toLowerCase() !== ".md") {
        return failure(
          "invalid_lint_path",
          "Metadata lint accepts explicit Markdown file paths ending in .md.",
          { path: inputPath },
          "Select an existing .md file and retry.",
        );
      }

      const requestedPath = Path.resolve(root, inputPath);
      const displayPath = projectRelativePath(root, requestedPath);
      let actualPath: string;
      try {
        actualPath = await this.fileSystem.realpath(requestedPath);
      } catch {
        return failure(
          "lint_file_unavailable",
          "The selected Markdown file does not exist or cannot be resolved.",
          { path: displayPath },
          "Check the selected file path and retry.",
        );
      }

      if (!isInsideProject(root, actualPath)) {
        return failure(
          "lint_path_outside_project",
          "Selected Markdown files must resolve inside the selected project.",
          { path: displayPath },
          "Select a Markdown file within the selected project and retry.",
        );
      }
      if (Path.extname(actualPath).toLowerCase() !== ".md") {
        return failure(
          "invalid_lint_path",
          "The selected path does not resolve to a Markdown file.",
          { path: displayPath },
          "Select an existing .md file and retry.",
        );
      }

      let regularFile = false;
      try {
        regularFile = await this.fileSystem.isFile(actualPath);
      } catch {
        regularFile = false;
      }
      if (!regularFile) {
        return failure(
          "lint_path_not_file",
          "The selected Markdown path is not a regular file.",
          { path: displayPath },
          "Select an existing Markdown file and retry.",
        );
      }

      let source: string;
      try {
        source = await this.fileSystem.readFile(actualPath);
      } catch {
        return failure(
          "lint_file_unreadable",
          "Kepler could not read the selected Markdown file.",
          { path: displayPath },
          "Check file permissions and retry.",
        );
      }

      const parsed = parseMarkdownArtifact(displayPath, source);
      if (parsed.kind === "invalid") {
        findings.push(
          ...parsed.diagnostics.map((diagnostic) => toFinding(diagnostic, displayPath)),
        );
        continue;
      }

      const validated = validateArtifact(parsed, ownershipFor(parsed.artifact));
      if (validated.kind === "invalid") {
        findings.push(
          ...validated.diagnostics.map((diagnostic) =>
            toFinding(diagnostic, displayPath, parsed.artifact),
          ),
        );
      }
    }

    return findings.length === 0
      ? { kind: "valid", findings: [] }
      : { kind: "invalid", findings };
  }
}
