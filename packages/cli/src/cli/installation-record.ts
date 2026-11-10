import { createHash } from "node:crypto";
import * as Path from "node:path";
import { Ajv } from "ajv";
import type { AnySchemaObject } from "ajv";

export const INSTALLATION_RECORD_FORMAT_VERSION = 1 as const;
export const INSTALLATION_RECEIPT_FORMAT_VERSION = 2 as const;
export const BUNDLE_MANIFEST_FORMAT_VERSION = 1 as const;

export type ContentDigest = `sha256:${string}`;
export type ResourceCheck = "matches" | "missing" | "mismatch" | "not_checked";
export type HostCompatibilityCheck = "matches" | "unsupported" | "unknown";
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
    readonly manifest: BundleManifest;
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

export interface InstallationRecordV2 {
  readonly format_version: typeof INSTALLATION_RECEIPT_FORMAT_VERSION;
  readonly generation_id: string;
  readonly release: {
    readonly version: string;
    readonly source: {
      readonly commit: string;
      readonly content_digest: ContentDigest;
      readonly kind: "production" | "development";
    };
    readonly target: { readonly os: "linux" | "darwin"; readonly arch: "x64" | "arm64" };
  };
  readonly resources: {
    readonly manifest_digest: ContentDigest;
    readonly files: Readonly<Record<string, ContentDigest>>;
  };
  readonly selector: { readonly path: string; readonly generation_id: string };
  readonly pi_binding: {
    readonly host: { readonly id: "pi"; readonly release: string; readonly check: HostCompatibilityCheck };
    readonly loader: {
      readonly id: "pi-subagents";
      readonly release: string;
      readonly check: HostCompatibilityCheck;
    };
    readonly scope: "user";
    readonly agent_directory: string;
    readonly settings_path: string;
    readonly package_source: string;
    readonly registration: { readonly entry_digest: ContentDigest; readonly check: ResourceCheck };
    readonly skills: readonly {
      readonly id: string;
      readonly digest: ContentDigest;
      readonly check: ResourceCheck;
    }[];
    readonly roles: readonly {
      readonly role: string;
      readonly agent_id: string;
      readonly digest: ContentDigest;
      readonly check: ResourceCheck;
    }[];
  };
  readonly compatibility: { readonly check: CompatibilityCheck };
}

export type ParsedInstallationReceipt =
  | { readonly kind: "legacy-v1"; readonly record: InstallationRecord }
  | { readonly kind: "current-v2"; readonly record: InstallationRecordV2 };

export function sha256Digest(content: string | Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
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
const stableVersion: AnySchemaObject = {
  type: "string",
  pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
};
const generationId: AnySchemaObject = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
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
    manifest: bundleManifestSchema,
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

const installationRecordV2Schema = closedObject({
  format_version: { const: INSTALLATION_RECEIPT_FORMAT_VERSION },
  generation_id: generationId,
  release: closedObject({
    version: stableVersion,
    source: closedObject({
      commit: { type: "string", pattern: "^[a-f0-9]{40}(?:[a-f0-9]{24})?$" },
      content_digest: digest,
      kind: { enum: ["production", "development"] },
    }),
    target: closedObject({
      os: { enum: ["linux", "darwin"] },
      arch: { enum: ["x64", "arm64"] },
    }),
  }),
  resources: closedObject({ manifest_digest: digest, files: { ...digestMap, minProperties: 1 } }),
  selector: closedObject({ path: text, generation_id: generationId }),
  pi_binding: closedObject({
    host: closedObject({ id: { const: "pi" }, release: text, check: { enum: ["matches", "unsupported", "unknown"] } }),
    loader: closedObject({
      id: { const: "pi-subagents" },
      release: text,
      check: { enum: ["matches", "unsupported", "unknown"] },
    }),
    scope: { const: "user" },
    agent_directory: text,
    settings_path: text,
    package_source: text,
    registration: closedObject({ entry_digest: digest, check: resourceCheck }),
    skills: {
      type: "array",
      minItems: 11,
      maxItems: 11,
      items: closedObject({ id: text, digest, check: resourceCheck }),
    },
    roles: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: closedObject({ role: text, agent_id: text, digest, check: resourceCheck }),
    },
  }),
  compatibility: closedObject({ check: compatibilityCheck }),
});

const ajv = new Ajv({ allErrors: false, strict: true });
const validateBundleManifest = ajv.compile<BundleManifest>(bundleManifestSchema);
const validateInstallationRecord = ajv.compile<InstallationRecord>(
  installationRecordSchema,
);
const validateInstallationRecordV2 = ajv.compile<InstallationRecordV2>(
  installationRecordV2Schema,
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
  const value = parseMetadataJsonObject(content, "bundle manifest");
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
  validateBundleResourceEntries(manifest);
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
      cli_releases: [...manifest.compatibility.cli_releases].sort(compareStrings),
      skills: manifest.compatibility.skills
        .map((skill) => ({
          id: skill.id,
          release: skill.release,
          digest: skill.digest,
          required: skill.required,
        }))
        .sort((left, right) => compareStrings(left.id, right.id)),
      host_bindings: manifest.compatibility.host_bindings
        .map((binding) => ({
          role: binding.role,
          agent_id: binding.agent_id,
          release: binding.release,
          digest: binding.digest,
        }))
        .sort((left, right) => compareStrings(left.role, right.role)),
    },
  };
  return sha256Digest(JSON.stringify(payload));
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
  const value = parseMetadataJsonObject(content, "installation record");
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
  const manifest = parseBundleManifest(
    JSON.stringify(record.bundle_release.manifest),
  );
  if (
    record.bundle_release.release !== manifest.bundle_release ||
    record.bundle_release.content_digest !== manifest.content_digest
  ) {
    throw new InstallationMetadataError(
      "installation record bundle identity does not match its manifest",
    );
  }
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
  validateRecordResourcesMatchManifest(record, manifest);
  validateRecordCompatibility(record, manifest);
  return record;
}

export function serializeInstallationRecord(
  record: InstallationRecord,
): string {
  const validated = parseInstallationRecord(JSON.stringify(record));
  const normalized = normalizeInstallationRecord(validated);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function parseInstallationReceipt(
  content: string,
): ParsedInstallationReceipt {
  const value = parseMetadataJsonObject(content, "installation receipt");
  if (value.format_version === INSTALLATION_RECORD_FORMAT_VERSION) {
    return { kind: "legacy-v1", record: parseInstallationRecord(content) };
  }
  if (value.format_version === INSTALLATION_RECEIPT_FORMAT_VERSION) {
    return { kind: "current-v2", record: parseInstallationRecordV2Value(value) };
  }
  throw new InstallationMetadataError(
    `Unsupported installation receipt version: ${String(value.format_version)}`,
  );
}

export function serializeInstallationRecordV2(
  record: InstallationRecordV2,
): string {
  const validated = parseInstallationRecordV2Value(record);
  if (validated.compatibility.check !== "compatible") {
    throw new InstallationMetadataError(
      "cannot write a v2 installation receipt before required resources are verified",
    );
  }
  const normalized = normalizeInstallationRecordV2(validated);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function parseInstallationRecordV2Value(value: unknown): InstallationRecordV2 {
  if (!isInstallationRecordV2(value)) {
    throw schemaError("installation receipt v2", validateInstallationRecordV2.errors);
  }
  const current = value;
  validateStableVersion(current.release.version);
  validateRelativeDigestMap(current.resources.files, "resources.files");
  const absolutePaths = [
    current.selector.path,
    current.pi_binding.agent_directory,
    current.pi_binding.settings_path,
    current.pi_binding.package_source,
  ];
  if (absolutePaths.some((path) => !isAbsolutePath(path))) {
    throw new InstallationMetadataError("installation receipt paths must be absolute");
  }
  if (current.generation_id !== current.selector.generation_id) {
    throw new InstallationMetadataError(
      "selector generation_id must match the receipt generation_id",
    );
  }
  if (current.selector.path !== current.pi_binding.package_source) {
    throw new InstallationMetadataError(
      "Pi package_source must match the selected package path",
    );
  }
  validateV2ResourceSet(current);
  validateV2Compatibility(current);
  return current;
}

function isInstallationRecordV2(value: unknown): value is InstallationRecordV2 {
  return validateInstallationRecordV2(value) === true;
}

function validateV2ResourceSet(record: InstallationRecordV2): void {
  if (record.resources.files["pi-package.json"] === undefined) {
    throw new InstallationMetadataError(
      "installation receipt resource inventory must include pi-package.json",
    );
  }
  const expectedSkills = new Set<string>([...standardSkillIds, ...conditionalSkillIds]);
  if (
    record.pi_binding.skills.length !== expectedSkills.size ||
    new Set(record.pi_binding.skills.map(({ id }) => id)).size !== record.pi_binding.skills.length ||
    record.pi_binding.skills.some(({ id }) => !expectedSkills.has(id))
  ) {
    throw new InstallationMetadataError(
      "installation receipt must declare all eleven accepted Pi skills",
    );
  }
  const expectedRoles = new Map<string, string>(hostBindingRoles);
  if (
    record.pi_binding.roles.length !== expectedRoles.size ||
    new Set(record.pi_binding.roles.map(({ role }) => role)).size !== record.pi_binding.roles.length ||
    new Set(record.pi_binding.roles.map(({ agent_id }) => agent_id)).size !== record.pi_binding.roles.length ||
    record.pi_binding.roles.some(({ role, agent_id }) => expectedRoles.get(role) !== agent_id)
  ) {
    throw new InstallationMetadataError(
      "installation receipt must declare the four accepted Pi roles",
    );
  }
  for (const skill of record.pi_binding.skills) {
    if (record.resources.files[`skills/${skill.id}/SKILL.md`] !== skill.digest) {
      throw new InstallationMetadataError(
        `installation receipt skill digest does not match its resource: ${skill.id}`,
      );
    }
  }
  for (const role of record.pi_binding.roles) {
    if (record.resources.files[`agents/pi/v1/${role.agent_id}.md`] !== role.digest) {
      throw new InstallationMetadataError(
        `installation receipt role digest does not match its resource: ${role.role}`,
      );
    }
  }
}

function validateV2Compatibility(record: InstallationRecordV2): void {
  if (
    record.pi_binding.host.check === "matches" &&
    record.pi_binding.host.release !== "1.2.0"
  ) {
    throw new InstallationMetadataError(
      "a matching Pi host check requires the supported Pi 1.2.0 release",
    );
  }
  if (
    record.pi_binding.loader.check === "matches" &&
    record.pi_binding.loader.release !== "0.76.1"
  ) {
    throw new InstallationMetadataError(
      "a matching pi-subagents check requires the supported 0.76.1 release",
    );
  }
  const checks = [
    record.pi_binding.host.check,
    record.pi_binding.loader.check,
    record.pi_binding.registration.check,
    ...record.pi_binding.skills.map(({ check }) => check),
    ...record.pi_binding.roles.map(({ check }) => check),
  ];
  const unsupported = checks.some(
    (check) => check === "unsupported" || check === "missing" || check === "mismatch",
  );
  const unknown = checks.some((check) => check === "unknown" || check === "not_checked");
  const expected = unsupported ? "unsupported" : unknown ? "unknown" : "compatible";
  if (record.compatibility.check !== expected) {
    throw new InstallationMetadataError(
      `compatibility check contradicts Pi/resource checks; expected ${expected}`,
    );
  }
}

function normalizeInstallationRecordV2(
  record: InstallationRecordV2,
): InstallationRecordV2 {
  return {
    format_version: INSTALLATION_RECEIPT_FORMAT_VERSION,
    generation_id: record.generation_id,
    release: {
      version: record.release.version,
      source: { ...record.release.source },
      target: { ...record.release.target },
    },
    resources: {
      manifest_digest: record.resources.manifest_digest,
      files: sortedRecord(record.resources.files),
    },
    selector: { ...record.selector },
    pi_binding: {
      host: { ...record.pi_binding.host },
      loader: { ...record.pi_binding.loader },
      scope: record.pi_binding.scope,
      agent_directory: record.pi_binding.agent_directory,
      settings_path: record.pi_binding.settings_path,
      package_source: record.pi_binding.package_source,
      registration: { ...record.pi_binding.registration },
      skills: record.pi_binding.skills
        .map((skill) => ({ ...skill }))
        .sort((left, right) => compareStrings(left.id, right.id)),
      roles: record.pi_binding.roles
        .map((role) => ({ ...role }))
        .sort((left, right) => compareStrings(left.role, right.role)),
    },
    compatibility: { ...record.compatibility },
  };
}

function validateStableVersion(version: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new InstallationMetadataError(`Invalid stable release version: ${version}`);
  }
  if (version.split(".").some((component) => !Number.isSafeInteger(Number(component)))) {
    throw new InstallationMetadataError(`Release version exceeds safe integer range: ${version}`);
  }
}

function isAbsolutePath(path: string): boolean {
  return Path.isAbsolute(path) || Path.win32.isAbsolute(path);
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

function validateBundleResourceEntries(manifest: BundleManifest): void {
  for (const skill of manifest.compatibility.skills) {
    const path = `skills/${skill.id}/SKILL.md`;
    if (manifest.files[path] !== skill.digest) {
      throw new InstallationMetadataError(
        `bundle skill digest does not match its declared resource: ${skill.id}`,
      );
    }
  }
  for (const binding of manifest.compatibility.host_bindings) {
    const path = `agents/claude-code/v1/${binding.agent_id}.md`;
    if (manifest.files[path] !== binding.digest) {
      throw new InstallationMetadataError(
        `bundle host-binding digest does not match its declared resource: ${binding.role}`,
      );
    }
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

function validateRecordResourcesMatchManifest(
  record: InstallationRecord,
  manifest: BundleManifest,
): void {
  const manifestSkills = new Map(
    manifest.compatibility.skills.map((skill) => [skill.id, skill]),
  );
  const mismatchedSkill = record.skills.find((skill) => {
    const expected = manifestSkills.get(skill.id);
    return (
      expected === undefined ||
      expected.release !== skill.release ||
      expected.digest !== skill.digest ||
      expected.required !== skill.required
    );
  });
  const manifestBindings = new Map(
    manifest.compatibility.host_bindings.map((binding) => [binding.role, binding]),
  );
  const mismatchedBinding = record.host_binding.roles.find((binding) => {
    const expected = manifestBindings.get(binding.role);
    return (
      expected === undefined ||
      expected.agent_id !== binding.agent_id ||
      expected.release !== binding.release ||
      expected.digest !== binding.digest
    );
  });
  if (mismatchedSkill || mismatchedBinding) {
    throw new InstallationMetadataError(
      "installation record resource facts do not match its bundle manifest",
    );
  }
  if (
    (record.host_binding.host.check === "matches" &&
      (record.host_binding.host.id === null ||
        record.host_binding.host.release === null))
  ) {
    throw new InstallationMetadataError(
      "a matching host check requires a host identity and release",
    );
  }
  for (const [path, digestValue] of Object.entries(
    record.bundle_release.installed_files,
  )) {
    if (manifest.files[path] !== digestValue) {
      throw new InstallationMetadataError(
        `installation receipt is not declared by its bundle manifest: ${path}`,
      );
    }
  }
}

function validateRecordCompatibility(
  record: InstallationRecord,
  manifest: BundleManifest,
): void {
  const declared = evaluateBundleCompatibility(manifest, record.cli_release);
  const resourceMismatch =
    record.skills.some((skill) => skill.check === "mismatch") ||
    record.host_binding.roles.some((role) => role.check === "mismatch") ||
    record.host_binding.host.check === "mismatch";
  const requiredResourceMissing =
    record.skills.some((skill) => skill.required && skill.check === "missing") ||
    record.host_binding.roles.some((role) => role.check === "missing") ||
    record.host_binding.host.check === "missing";
  let expected: "compatible" | "unknown" | "unsupported";
  if (resourceMismatch || declared.check === "unsupported") {
    expected = "unsupported";
  } else if (
    requiredResourceMissing || declared.check === "unknown"
  ) {
    expected = "unknown";
  } else {
    expected = "compatible";
  }
  if (record.compatibility.check !== expected) {
    throw new InstallationMetadataError(
      `compatibility check contradicts its declared versions or resource checks; expected ${expected}`,
    );
  }
}

function normalizeInstallationRecord(
  record: InstallationRecord,
): InstallationRecord {
  const manifest = record.bundle_release.manifest;
  const normalizedManifest: BundleManifest = {
    manifest_format_version: manifest.manifest_format_version,
    bundle_release: manifest.bundle_release,
    files: sortedRecord(manifest.files),
    content_digest: manifest.content_digest,
    compatibility: {
      cli_releases: [...manifest.compatibility.cli_releases].sort(compareStrings),
      skills: manifest.compatibility.skills
        .map((skill) => ({
          id: skill.id,
          release: skill.release,
          digest: skill.digest,
          required: skill.required,
        }))
        .sort((left, right) => compareStrings(left.id, right.id)),
      host_bindings: manifest.compatibility.host_bindings
        .map((binding) => ({
          role: binding.role,
          agent_id: binding.agent_id,
          release: binding.release,
          digest: binding.digest,
        }))
        .sort((left, right) => compareStrings(left.role, right.role)),
    },
  };
  return {
    format_version: record.format_version,
    generation_id: record.generation_id,
    cli_release: record.cli_release,
    bundle_release: {
      release: record.bundle_release.release,
      content_digest: record.bundle_release.content_digest,
      manifest: normalizedManifest,
      installed_files: sortedRecord(record.bundle_release.installed_files),
    },
    skills: record.skills
      .map((skill) => ({
        id: skill.id,
        release: skill.release,
        digest: skill.digest,
        required: skill.required,
        check: skill.check,
      }))
      .sort((left, right) => compareStrings(left.id, right.id)),
    host_binding: {
      host: {
        id: record.host_binding.host.id,
        release: record.host_binding.host.release,
        check: record.host_binding.host.check,
      },
      platform: {
        os: record.host_binding.platform.os,
        arch: record.host_binding.platform.arch,
      },
      roles: record.host_binding.roles
        .map((role) => ({
          role: role.role,
          agent_id: role.agent_id,
          release: role.release,
          digest: role.digest,
          check: role.check,
        }))
        .sort((left, right) => compareStrings(left.role, right.role)),
    },
    compatibility: { check: record.compatibility.check },
  };
}

function validateRelativeDigestMap(
  map: Readonly<Record<string, ContentDigest>>,
  label: string,
): void {
  const invalid = Object.keys(map).find((path) => {
    const segments = path.split("/");
    return (
      path.length === 0 ||
      Path.isAbsolute(path) ||
      Path.win32.isAbsolute(path) ||
      path.includes("\\") ||
      path.includes("\0") ||
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
    Object.entries(value).sort(([left], [right]) => compareStrings(left, right)),
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rejectDuplicateJsonMembers(content: string, label: string): void {
  let cursor = 0;
  const skipWhitespace = (): void => {
    while (/\s/.test(content[cursor] ?? "")) cursor += 1;
  };
  const readString = (): string => {
    const start = cursor;
    if (content[cursor] !== '"') throw new Error("Expected a JSON string");
    cursor += 1;
    while (cursor < content.length) {
      const character = content[cursor];
      if (character === "\\") {
        cursor += 2;
      } else if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(content.slice(start, cursor)) as string;
        } catch (error) {
          throw new Error(`Invalid JSON string: ${String(error)}`);
        }
      } else {
        if ((character?.charCodeAt(0) ?? 0) < 0x20) {
          throw new Error("Invalid control character in JSON string");
        }
        cursor += 1;
      }
    }
    throw new Error("Unterminated JSON string");
  };
  const readValue = (): void => {
    skipWhitespace();
    const character = content[cursor];
    if (character === "{") {
      readObject();
      return;
    }
    if (character === "[") {
      readArray();
      return;
    }
    if (character === '"') {
      readString();
      return;
    }
    const start = cursor;
    while (
      cursor < content.length &&
      !/[\s,\]}]/.test(content[cursor] ?? "")
    ) {
      cursor += 1;
    }
    if (cursor === start) throw new Error("Invalid JSON value");
  };
  const readObject = (): void => {
    cursor += 1;
    skipWhitespace();
    if (content[cursor] === "}") {
      cursor += 1;
      return;
    }
    const keys = new Set<string>();
    while (cursor < content.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) {
        throw new InstallationMetadataError(
          `Duplicate JSON object member in ${label}: ${key}`,
        );
      }
      keys.add(key);
      skipWhitespace();
      if (content[cursor] !== ":") throw new Error("Expected a JSON colon");
      cursor += 1;
      readValue();
      skipWhitespace();
      if (content[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (content[cursor] !== ",") throw new Error("Expected a JSON comma");
      cursor += 1;
    }
    throw new Error("Unterminated JSON object");
  };
  const readArray = (): void => {
    cursor += 1;
    skipWhitespace();
    if (content[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < content.length) {
      readValue();
      skipWhitespace();
      if (content[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (content[cursor] !== ",") throw new Error("Expected a JSON comma");
      cursor += 1;
    }
    throw new Error("Unterminated JSON array");
  };

  try {
    readValue();
    skipWhitespace();
    if (cursor !== content.length) throw new Error("Trailing JSON content");
  } catch (error) {
    if (error instanceof InstallationMetadataError) throw error;
    throw new InstallationMetadataError(`Invalid ${label} JSON`);
  }
}

export function parseMetadataJsonObject(
  content: string,
  label: string,
): Record<string, unknown> {
  rejectDuplicateJsonMembers(content, label);
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
