import { createHash } from "node:crypto";
import { Ajv } from "ajv";
import type { AnySchemaObject } from "ajv";

export const INSTALLATION_RECORD_FORMAT_VERSION = 1 as const;
export const BUNDLE_MANIFEST_FORMAT_VERSION = 1 as const;

export type ContentDigest = `sha256:${string}`;
export type ResourceCheck = "matches" | "missing" | "mismatch" | "not_checked";
export type CompatibilityCheck = "compatible" | "unsupported" | "unknown";

export interface BundleSkillResource {
  readonly id: string;
  readonly release: string;
  readonly digest: ContentDigest;
  readonly required: boolean;
}

export interface BundleHostBindingResource {
  readonly role: string;
  readonly agent_id: string;
  readonly release: string;
  readonly digest: ContentDigest;
}

export interface BundleCompatibility {
  readonly cli_releases: readonly string[];
  readonly skills: readonly BundleSkillResource[];
  readonly host_bindings: readonly BundleHostBindingResource[];
}

export interface BundleManifest {
  readonly manifest_format_version: typeof BUNDLE_MANIFEST_FORMAT_VERSION;
  readonly bundle_release: string;
  readonly files: Readonly<Record<string, ContentDigest>>;
  readonly content_digest: ContentDigest;
  readonly compatibility: BundleCompatibility;
}

export interface BundleCompatibilityDecision {
  readonly check: CompatibilityCheck;
  readonly cli_release: string;
  readonly bundle_release: string;
}

export interface InstallationResourceCheck {
  readonly id: string;
  readonly release: string;
  readonly digest: ContentDigest;
  readonly required: boolean;
  readonly check: ResourceCheck;
}

export interface HostRoleCheck {
  readonly role: string;
  readonly agent_id: string;
  readonly release: string;
  readonly digest: ContentDigest;
  readonly check: ResourceCheck;
}

export interface InstallationRecord {
  readonly format_version: typeof INSTALLATION_RECORD_FORMAT_VERSION;
  readonly generation_id: string;
  readonly cli_release: string;
  readonly bundle_release: {
    readonly release: string;
    readonly content_digest: ContentDigest;
    readonly installed_files: Readonly<Record<string, ContentDigest>>;
  };
  readonly skills: readonly InstallationResourceCheck[];
  readonly host_binding: {
    readonly host: {
      readonly id: string | null;
      readonly release: string | null;
      readonly check: ResourceCheck;
    };
    readonly platform: {
      readonly os: string;
      readonly arch: string;
    };
    readonly roles: readonly HostRoleCheck[];
  };
  readonly compatibility: {
    readonly check: CompatibilityCheck;
  };
}

export class InstallationMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationMetadataError";
  }
}

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const digest: AnySchemaObject = {
  type: "string",
  pattern: "^sha256:[a-f0-9]{64}$",
};
const resourceCheck: AnySchemaObject = {
  enum: ["matches", "missing", "mismatch", "not_checked"],
};
const compatibilityCheck: AnySchemaObject = {
  enum: ["compatible", "unsupported", "unknown"],
};
const closedObject = (
  properties: Record<string, AnySchemaObject>,
): AnySchemaObject => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const digestMap: AnySchemaObject = {
  type: "object",
  propertyNames: text,
  additionalProperties: digest,
};

const bundleManifestSchema = closedObject({
  manifest_format_version: { const: BUNDLE_MANIFEST_FORMAT_VERSION },
  bundle_release: text,
  files: { ...digestMap, minProperties: 1 },
  content_digest: digest,
  compatibility: closedObject({
    cli_releases: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: text,
    },
    skills: {
      type: "array",
      minItems: 11,
      maxItems: 11,
      items: closedObject({
        id: text,
        release: text,
        digest,
        required: { type: "boolean" },
      }),
    },
    host_bindings: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: closedObject({
        role: text,
        agent_id: text,
        release: text,
        digest,
      }),
    },
  }),
});

const installationRecordSchema = closedObject({
  format_version: { const: INSTALLATION_RECORD_FORMAT_VERSION },
  generation_id: {
    type: "string",
    pattern:
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  },
  cli_release: text,
  bundle_release: closedObject({
    release: text,
    content_digest: digest,
    installed_files: digestMap,
  }),
  skills: {
    type: "array",
    minItems: 11,
    maxItems: 11,
    items: closedObject({
      id: text,
      release: text,
      digest,
      required: { type: "boolean" },
      check: resourceCheck,
    }),
  },
  host_binding: closedObject({
    host: closedObject({
      id: { anyOf: [text, { type: "null" }] },
      release: { anyOf: [text, { type: "null" }] },
      check: resourceCheck,
    }),
    platform: closedObject({ os: text, arch: text }),
    roles: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: closedObject({
        role: text,
        agent_id: text,
        release: text,
        digest,
        check: resourceCheck,
      }),
    },
  }),
  compatibility: closedObject({ check: compatibilityCheck }),
});

const ajv = new Ajv({ allErrors: false, strict: true });
const validateBundleManifest = ajv.compile<BundleManifest>(bundleManifestSchema);
const validateInstallationRecord = ajv.compile<InstallationRecord>(
  installationRecordSchema,
);

const standardSkillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
] as const;

const conditionalSkillIds = [
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
] as const;

const hostBindingRoles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

export function parseBundleManifest(content: string): BundleManifest {
  const value = parseJsonObject(content, "bundle manifest");
  if (value.manifest_format_version !== BUNDLE_MANIFEST_FORMAT_VERSION) {
    throw new InstallationMetadataError(
      `Unsupported bundle manifest version: ${String(value.manifest_format_version)}`,
    );
  }
  const parsed: unknown = value;
  if (!isBundleManifest(parsed)) {
    throw schemaError("bundle manifest", validateBundleManifest.errors);
  }

  const manifest = parsed;
  validateSkillSet(manifest.compatibility.skills);
  validateHostBindingSet(manifest.compatibility.host_bindings);
  validateRelativeDigestMap(manifest.files, "bundle manifest files");
  if (manifest.files["manifest.json"] !== undefined) {
    throw new InstallationMetadataError(
      "bundle manifest files must not include the self-referential manifest file",
    );
  }
  if (bundleManifestContentDigest(manifest) !== manifest.content_digest) {
    throw new InstallationMetadataError(
      "content_digest does not match bundle manifest metadata",
    );
  }
  return manifest;
}

export function bundleManifestContentDigest(
  manifest: BundleManifest,
): ContentDigest {
  const payload = {
    manifest_format_version: manifest.manifest_format_version,
    bundle_release: manifest.bundle_release,
    files: sortedRecord(manifest.files),
    compatibility: {
      cli_releases: [...manifest.compatibility.cli_releases].sort((left, right) =>
        left.localeCompare(right),
      ),
      skills: [...manifest.compatibility.skills].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      host_bindings: [...manifest.compatibility.host_bindings].sort((left, right) =>
        left.role.localeCompare(right.role),
      ),
    },
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export function evaluateBundleCompatibility(
  manifest: BundleManifest,
  cliRelease: string,
): BundleCompatibilityDecision {
  if (cliRelease.trim().length === 0) {
    return {
      check: "unknown",
      cli_release: cliRelease,
      bundle_release: manifest.bundle_release,
    };
  }
  return {
    check: manifest.compatibility.cli_releases.includes(cliRelease)
      ? "compatible"
      : "unsupported",
    cli_release: cliRelease,
    bundle_release: manifest.bundle_release,
  };
}

export function parseInstallationRecord(content: string): InstallationRecord {
  const value = parseJsonObject(content, "installation record");
  if (value.format_version !== INSTALLATION_RECORD_FORMAT_VERSION) {
    throw new InstallationMetadataError(
      `Unsupported installation record version: ${String(value.format_version)}`,
    );
  }
  const parsed: unknown = value;
  if (!isInstallationRecord(parsed)) {
    throw schemaError("installation record", validateInstallationRecord.errors);
  }

  const record = parsed;
  validateSkillSet(record.skills);
  validateHostBindingSet(record.host_binding.roles);
  validateRelativeDigestMap(
    record.bundle_release.installed_files,
    "bundle_release.installed_files",
  );
  const disallowedTarget = Object.keys(record.bundle_release.installed_files).find(
    (path) => !path.startsWith("templates/") && !path.startsWith("guidelines/"),
  );
  if (disallowedTarget) {
    throw new InstallationMetadataError(
      "bundle_release.installed_files may include only template and guideline targets",
    );
  }
  return record;
}

export function serializeInstallationRecord(
  record: InstallationRecord,
): string {
  const validated = parseInstallationRecord(JSON.stringify(record));
  return `${JSON.stringify(validated, null, 2)}\n`;
}

function isBundleManifest(value: unknown): value is BundleManifest {
  return validateBundleManifest(value) === true;
}

function isInstallationRecord(value: unknown): value is InstallationRecord {
  return validateInstallationRecord(value) === true;
}

function validateSkillSet(
  skills: readonly { readonly id: string; readonly required: boolean }[],
): void {
  const expected = new Map<string, boolean>([
    ...standardSkillIds.map((id) => [id, true] as const),
    ...conditionalSkillIds.map((id) => [id, false] as const),
  ]);
  if (
    skills.length !== expected.size ||
    new Set(skills.map((skill) => skill.id)).size !== skills.length ||
    skills.some((skill) => expected.get(skill.id) !== skill.required)
  ) {
    throw new InstallationMetadataError(
      "all eleven accepted skills must be declared with their required status",
    );
  }
}

function validateHostBindingSet(
  bindings: readonly { readonly role: string; readonly agent_id: string }[],
): void {
  const expected = new Map<string, string>(hostBindingRoles);
  if (
    bindings.length !== expected.size ||
    new Set(bindings.map((binding) => binding.role)).size !== bindings.length ||
    new Set(bindings.map((binding) => binding.agent_id)).size !== bindings.length ||
    bindings.some((binding) => expected.get(binding.role) !== binding.agent_id)
  ) {
    throw new InstallationMetadataError(
      "all four accepted host role bindings must be declared",
    );
  }
}

function validateRelativeDigestMap(
  map: Readonly<Record<string, ContentDigest>>,
  label: string,
): void {
  const invalid = Object.keys(map).find((path) => {
    const segments = path.split("/");
    return (
      path.length === 0 ||
      path.startsWith("/") ||
      path.includes("\\") ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..")
    );
  });
  if (invalid) {
    throw new InstallationMetadataError(
      `${label} paths must be normalized relative paths`,
    );
  }
}

function sortedRecord(
  value: Readonly<Record<string, ContentDigest>>,
): Record<string, ContentDigest> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseJsonObject(
  content: string,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new InstallationMetadataError(`Invalid ${label} JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InstallationMetadataError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function schemaError(
  label: string,
  errors: readonly { instancePath: string; message?: string }[] | null | undefined,
): InstallationMetadataError {
  const first = errors?.[0];
  const path = first?.instancePath || "/";
  return new InstallationMetadataError(
    `${label} is invalid at ${path}: ${first?.message ?? "schema mismatch"}`,
  );
}
