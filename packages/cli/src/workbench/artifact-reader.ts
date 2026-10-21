import { parseMarkdownFrontmatter } from "@vialactea-works/kepler-core";
import * as Fs from "node:fs/promises";
import * as Yaml from "yaml";

export interface ArtifactFileSystem {
  readonly readFile: (sourcePath: string) => string | Promise<string>;
}

export interface ArtifactLineLocation {
  readonly startLine: number;
  readonly endLine: number;
}

export interface ArtifactLocations {
  readonly frontmatter: ArtifactLineLocation;
  readonly metadata: ArtifactLineLocation;
  readonly body: ArtifactLineLocation;
}

export type ArtifactDiagnosticCode =
  | "read-failure"
  | "invalid-yaml"
  | "duplicate-key"
  | "unterminated-frontmatter"
  | "missing-artifact"
  | "invalid-metadata";

export interface ArtifactDiagnostic {
  readonly _tag: "ArtifactDiagnostic";
  readonly code: ArtifactDiagnosticCode;
  readonly message: string;
  readonly sourcePath: string;
  readonly location?: { readonly line: number; readonly column?: number };
}

export interface RecognizedArtifact {
  readonly _tag: "recognized";
  readonly sourcePath: string;
  readonly metadata: Record<string, unknown>;
  readonly body: string;
  readonly locations: ArtifactLocations;
}

export interface UnrelatedArtifactFile {
  readonly _tag: "unrelated";
  readonly sourcePath: string;
  readonly reason: "no-frontmatter";
  readonly body: string;
  readonly locations: Pick<ArtifactLocations, "body">;
}

export interface InvalidArtifactFile {
  readonly _tag: "invalid";
  readonly sourcePath: string;
  readonly diagnostic: ArtifactDiagnostic;
}

export type ArtifactReadResult =
  | RecognizedArtifact
  | UnrelatedArtifactFile
  | InvalidArtifactFile;

const defaultFileSystem: ArtifactFileSystem = {
  readFile: (sourcePath) => Fs.readFile(sourcePath, "utf8"),
};

const lineAt = (source: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n" && source[index - 1] !== "\r") line += 1;
    if (source[index] === "\r") line += 1;
  }
  return line;
};

const endLine = (source: string): number => lineAt(source, source.length);

const diagnostic = (
  sourcePath: string,
  code: ArtifactDiagnosticCode,
  message: string,
  location?: { readonly line: number; readonly column?: number } | null,
): InvalidArtifactFile => ({
  _tag: "invalid",
  sourcePath,
  diagnostic: {
    _tag: "ArtifactDiagnostic",
    code,
    message,
    sourcePath,
    ...(location === undefined || location === null ? {} : { location }),
  },
});

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorLocation = (
  source: string,
  offsetBase: number,
  error: Yaml.YAMLError,
) => {
  const offset = error.pos?.[0] ?? null;
  if (offset === null) return null;
  const sourceOffset = offsetBase + offset;
  return {
    line: lineAt(source, sourceOffset),
    column: sourceOffset - source.lastIndexOf("\n", sourceOffset - 1),
  };
};

const parseArtifact = (
  sourcePath: string,
  source: string,
): ArtifactReadResult => {
  const frontmatter = parseMarkdownFrontmatter(source);
  if (frontmatter.kind === "absent") {
    return {
      _tag: "unrelated",
      sourcePath,
      reason: "no-frontmatter",
      body: source,
      locations: { body: { startLine: 1, endLine: endLine(source) } },
    };
  }

  if (frontmatter.kind === "unterminated") {
    return diagnostic(
      sourcePath,
      "unterminated-frontmatter",
      "Frontmatter has no closing delimiter",
      {
        line: lineAt(source, source.length),
      },
    );
  }

  let document: Yaml.Document;
  try {
    document = Yaml.parseDocument(frontmatter.yaml, { uniqueKeys: true });
  } catch (error) {
    return diagnostic(
      sourcePath,
      "invalid-yaml",
      `Unable to parse YAML: ${String(error)}`,
      {
        line: lineAt(source, frontmatter.yamlStartOffset),
      },
    );
  }

  const yamlError = document.errors[0];
  if (yamlError) {
    const code =
      yamlError.code === "DUPLICATE_KEY" ? "duplicate-key" : "invalid-yaml";
    return diagnostic(
      sourcePath,
      code,
      yamlError.message,
      errorLocation(source, frontmatter.yamlStartOffset, yamlError),
    );
  }

  let metadata: unknown;
  try {
    metadata = document.toJS();
  } catch (error) {
    return diagnostic(
      sourcePath,
      "invalid-yaml",
      `Unable to read YAML: ${String(error)}`,
    );
  }

  if (!isMapping(metadata)) {
    return diagnostic(
      sourcePath,
      "invalid-metadata",
      "Frontmatter must contain a YAML mapping",
      {
        line: lineAt(source, frontmatter.yamlStartOffset),
      },
    );
  }

  if (!Object.hasOwn(metadata, "artifact")) {
    return diagnostic(
      sourcePath,
      "missing-artifact",
      "Frontmatter is missing the artifact field",
      {
        line: lineAt(source, frontmatter.yamlStartOffset),
      },
    );
  }

  return {
    _tag: "recognized",
    sourcePath,
    metadata,
    body: frontmatter.body,
    locations: {
      frontmatter: {
        startLine: frontmatter.startLine,
        endLine: frontmatter.endLine,
      },
      metadata: {
        startLine: lineAt(source, frontmatter.yamlStartOffset),
        endLine: Math.max(frontmatter.endLine - 1, 1),
      },
      body: {
        startLine: lineAt(source, frontmatter.bodyStartOffset),
        endLine: endLine(source),
      },
    },
  };
};

export const createArtifactReader =
  (fileSystem: ArtifactFileSystem = defaultFileSystem) =>
  async (sourcePath: string): Promise<ArtifactReadResult> => {
    let source: string;
    try {
      source = await fileSystem.readFile(sourcePath);
    } catch (error) {
      return diagnostic(
        sourcePath,
        "read-failure",
        `Unable to read ${sourcePath}: ${String(error)}`,
      );
    }
    return parseArtifact(sourcePath, source);
  };

export const readArtifact = createArtifactReader();
