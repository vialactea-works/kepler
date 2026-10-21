export const artifactTypes = [
  "unit-of-work",
  "functional-design",
  "non-functional-requirements",
  "project-reference",
  "supporting-document",
  "implementation-plan",
  "delivery-plan",
] as const;

export type ArtifactType = (typeof artifactTypes)[number];

export interface ArtifactMetadata {
  readonly id: string;
  readonly type: ArtifactType;
  readonly schema_version: 3;
  readonly unit_id?: string;
  readonly author: string;
  readonly labels?: readonly string[];
}

export type ArtifactOwnership =
  | { readonly scope: "project" }
  | { readonly scope: "unit"; readonly unitId?: string };

export interface ArtifactSourceLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export type ArtifactDiagnosticCode =
  | "missing-frontmatter"
  | "malformed-frontmatter"
  | "duplicate-key"
  | "invalid-markdown"
  | "missing-field"
  | "invalid-id"
  | "invalid-type"
  | "invalid-schema-version"
  | "unsupported-schema-version"
  | "invalid-unit-id"
  | "missing-unit-id"
  | "forbidden-unit-id"
  | "unit-ownership-mismatch"
  | "invalid-author"
  | "invalid-labels"
  | "invalid-label"
  | "duplicate-label"
  | "unknown-field"
  | "execution-state-metadata"
  | "immutable-field"
  | "missing-section"
  | "duplicate-section"
  | "invalid-path"
  | "missing-link"
  | "invalid-link";

export interface ArtifactDiagnostic {
  readonly code: ArtifactDiagnosticCode;
  readonly sourcePath: string;
  readonly message: string;
  readonly location?: ArtifactSourceLocation;
}

export interface ArtifactHeading {
  readonly depth: number;
  readonly value: string;
  readonly location: ArtifactSourceLocation;
  readonly topLevel: boolean;
}

export interface ArtifactLink {
  readonly kind: "link" | "image";
  readonly url: string;
  readonly location: ArtifactSourceLocation;
}

export interface MarkdownArtifact {
  readonly sourcePath: string;
  readonly source: string;
  readonly metadata: unknown;
  readonly body: string;
  readonly headings: readonly ArtifactHeading[];
  readonly links: readonly ArtifactLink[];
  readonly frontmatter: {
    readonly value: string;
    readonly valueStartOffset: number;
    readonly valueEndOffset: number;
    readonly endOffset: number;
    readonly fieldLocations: Readonly<Record<string, ArtifactSourceLocation>>;
  };
}

export type ArtifactParseResult =
  | { readonly kind: "parsed"; readonly artifact: MarkdownArtifact }
  | {
      readonly kind: "invalid";
      readonly sourcePath: string;
      readonly diagnostics: readonly ArtifactDiagnostic[];
    };

export type ArtifactValidationResult =
  | {
      readonly kind: "valid";
      readonly artifact: MarkdownArtifact & { readonly metadata: ArtifactMetadata };
    }
  | {
      readonly kind: "invalid";
      readonly artifact: MarkdownArtifact;
      readonly diagnostics: readonly ArtifactDiagnostic[];
    };

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unitIdPattern = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const authorPattern = /^([^<>\r\n]+) <([^<>\s\r\n]+)>$/;
const labelNamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9])?$/;
const dnsSegmentPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const executionStateFields = new Set([
  "approval",
  "approvals",
  "attempt",
  "attempts",
  "completed_at",
  "content_fingerprint",
  "content_version",
  "effort",
  "execution_state",
  "pause_checkpoint",
  "progress",
  "recorded_at",
  "stage_effort",
  "stage_efforts",
  "started_at",
  "status",
]);
const metadataFields = new Set([
  "id",
  "type",
  "schema_version",
  "unit_id",
  "author",
  "labels",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isArtifactType = (value: unknown): value is ArtifactType =>
  typeof value === "string" &&
  artifactTypes.some((artifactType) => artifactType === value);

const validUnitId = (value: string): boolean => {
  const match = unitIdPattern.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const validLabel = (label: string): boolean => {
  const separator = label.indexOf("/");
  if (separator !== label.lastIndexOf("/")) return false;
  if (separator < 0) return labelNamePattern.test(label);
  const prefix = label.slice(0, separator);
  const name = label.slice(separator + 1);
  return (
    prefix.length <= 253 &&
    prefix.split(".").every((segment) => dnsSegmentPattern.test(segment)) &&
    labelNamePattern.test(name)
  );
};

const metadataLocation = (
  artifact: MarkdownArtifact,
  field: string,
): ArtifactSourceLocation =>
  artifact.frontmatter.fieldLocations[field] ?? {
    line: 1,
    column: 1,
    offset: 0,
  };

const diagnostic = (
  artifact: MarkdownArtifact,
  code: ArtifactDiagnosticCode,
  field: string,
  message: string,
): ArtifactDiagnostic => ({
  code,
  sourcePath: artifact.sourcePath,
  message,
  location: metadataLocation(artifact, field),
});

export const validateArtifactMetadata = (
  artifact: MarkdownArtifact,
  ownership: ArtifactOwnership,
): readonly ArtifactDiagnostic[] => {
  const metadata = artifact.metadata;
  if (!isRecord(metadata))
    return [
      diagnostic(
        artifact,
        "malformed-frontmatter",
        "",
        "Artifact frontmatter must be a YAML mapping",
      ),
    ];

  const diagnostics: ArtifactDiagnostic[] = [];
  for (const field of Object.keys(metadata)) {
    if (metadataFields.has(field)) continue;
    diagnostics.push(
      diagnostic(
        artifact,
        executionStateFields.has(field)
          ? "execution-state-metadata"
          : "unknown-field",
        field,
        executionStateFields.has(field)
          ? `Execution-state field '${field}' is not allowed in artifact metadata`
          : `Unknown artifact metadata field '${field}'`,
      ),
    );
  }

  for (const field of ["id", "type", "schema_version", "author"] as const) {
    if (!Object.hasOwn(metadata, field))
      diagnostics.push(
        diagnostic(
          artifact,
          "missing-field",
          field,
          `Artifact metadata is missing required field '${field}'`,
        ),
      );
  }

  if (
    Object.hasOwn(metadata, "id") &&
    (typeof metadata.id !== "string" || !uuidV4Pattern.test(metadata.id))
  )
    diagnostics.push(
      diagnostic(
        artifact,
        "invalid-id",
        "id",
        "Artifact id must be a lowercase UUIDv4",
      ),
    );

  if (Object.hasOwn(metadata, "type") && !isArtifactType(metadata.type))
    diagnostics.push(
      diagnostic(
        artifact,
        "invalid-type",
        "type",
        `Artifact type must be one of: ${artifactTypes.join(", ")}`,
      ),
    );

  if (Object.hasOwn(metadata, "schema_version")) {
    if (
      typeof metadata.schema_version !== "number" ||
      !Number.isInteger(metadata.schema_version)
    )
      diagnostics.push(
        diagnostic(
          artifact,
          "invalid-schema-version",
          "schema_version",
          "schema_version must be the integer 3",
        ),
      );
    else if (metadata.schema_version !== 3)
      diagnostics.push(
        diagnostic(
          artifact,
          "unsupported-schema-version",
          "schema_version",
          `Unsupported artifact schema_version '${String(metadata.schema_version)}'`,
        ),
      );
  }

  const expectsUnit = (): boolean => {
    if (!isArtifactType(metadata.type)) return ownership.scope === "unit";
    if (metadata.type === "project-reference") return false;
    if (metadata.type === "supporting-document")
      return ownership.scope === "unit";
    return true;
  };
  const unitOwned = expectsUnit();
  if (unitOwned && !Object.hasOwn(metadata, "unit_id"))
    diagnostics.push(
      diagnostic(
        artifact,
        "missing-unit-id",
        "unit_id",
        "Unit-owned artifacts require unit_id",
      ),
    );
  if (!unitOwned && Object.hasOwn(metadata, "unit_id"))
    diagnostics.push(
      diagnostic(
        artifact,
        "forbidden-unit-id",
        "unit_id",
        "Project-scoped artifacts must omit unit_id",
      ),
    );
  if (Object.hasOwn(metadata, "unit_id")) {
    if (
      typeof metadata.unit_id !== "string" ||
      !validUnitId(metadata.unit_id)
    )
      diagnostics.push(
        diagnostic(
          artifact,
          "invalid-unit-id",
          "unit_id",
          "unit_id must use YYYY-MM-DD-<lowercase-slug> form",
        ),
      );
    else if (
      ownership.scope === "unit" &&
      ownership.unitId !== undefined &&
      metadata.unit_id !== ownership.unitId
    )
      diagnostics.push(
        diagnostic(
          artifact,
          "unit-ownership-mismatch",
          "unit_id",
          `Artifact unit_id '${metadata.unit_id}' does not match '${ownership.unitId}'`,
        ),
      );
  }

  if (Object.hasOwn(metadata, "author")) {
    const author = metadata.author;
    const match = typeof author === "string" ? authorPattern.exec(author) : null;
    if (
      match === null ||
      match[1].trim().length === 0 ||
      match[2].trim().length === 0
    )
      diagnostics.push(
        diagnostic(
          artifact,
          "invalid-author",
          "author",
          "author must use Name <email> form with non-empty name and email",
        ),
      );
  }

  if (Object.hasOwn(metadata, "labels")) {
    if (
      !Array.isArray(metadata.labels) ||
      metadata.labels.length === 0 ||
      metadata.labels.some((label) => typeof label !== "string")
    ) {
      diagnostics.push(
        diagnostic(
          artifact,
          "invalid-labels",
          "labels",
          "labels must be a non-empty list of strings when present",
        ),
      );
    } else {
      const seen = new Set<string>();
      for (const label of metadata.labels) {
        if (typeof label !== "string") continue;
        if (!validLabel(label))
          diagnostics.push(
            diagnostic(
              artifact,
              "invalid-label",
              "labels",
              `Label '${label}' does not match the accepted label-key syntax`,
            ),
          );
        if (seen.has(label))
          diagnostics.push(
            diagnostic(
              artifact,
              "duplicate-label",
              "labels",
              `Label '${label}' appears more than once`,
            ),
          );
        seen.add(label);
      }
    }
  }

  return diagnostics;
};

const isArtifactMetadata = (value: unknown): value is ArtifactMetadata =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isArtifactType(value.type) &&
  value.schema_version === 3 &&
  typeof value.author === "string" &&
  (value.unit_id === undefined || typeof value.unit_id === "string") &&
  (value.labels === undefined ||
    (Array.isArray(value.labels) &&
      value.labels.every((label) => typeof label === "string")));

export const validateMarkdownArtifact = (
  artifact: MarkdownArtifact,
  ownership: ArtifactOwnership,
): ArtifactValidationResult => {
  const diagnostics = validateArtifactMetadata(artifact, ownership);
  if (diagnostics.length > 0 || !isArtifactMetadata(artifact.metadata))
    return {
      kind: "invalid",
      artifact,
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              diagnostic(
                artifact,
                "malformed-frontmatter",
                "",
                "Artifact metadata is invalid",
              ),
            ],
    };
  return { kind: "valid", artifact: { ...artifact, metadata: artifact.metadata } };
};
