import { Ajv } from "ajv";
import type { AnySchemaObject } from "ajv";
import {
  parseMetadataJsonObject,
  sha256Digest,
  type ContentDigest,
} from "./installation-record.js";

export const RESOURCE_MANIFEST_FORMAT_VERSION = 2 as const;

export interface ResourceSkill {
  readonly id: string;
  readonly digest: ContentDigest;
  readonly required: boolean;
}

export interface PiAgentResource {
  readonly role: string;
  readonly agent_id: string;
  readonly digest: ContentDigest;
}

export interface ResourceManifest {
  readonly manifest_format_version: typeof RESOURCE_MANIFEST_FORMAT_VERSION;
  readonly kepler_release: string;
  readonly files: Readonly<Record<string, ContentDigest>>;
  readonly resource_digest: ContentDigest;
  readonly skills: readonly ResourceSkill[];
  readonly pi_agents: readonly PiAgentResource[];
}

export interface ResourcePackageSnapshot {
  readonly manifest: string;
  readonly files: readonly {
    readonly path: string;
    readonly contents: Uint8Array;
  }[];
}

export interface ValidatedResourcePackage {
  readonly manifest: ResourceManifest;
  readonly files: readonly {
    readonly path: string;
    readonly contents: Uint8Array;
    readonly digest: ContentDigest;
  }[];
}

export class ResourceManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceManifestError";
  }
}

const skillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
] as const;

const standardSkillIds = new Set(skillIds.slice(0, 8));

const piAgents = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

const constructionTemplates = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
] as const;

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const digest: AnySchemaObject = {
  type: "string",
  pattern: "^sha256:[a-f0-9]{64}$",
};
const stableVersion: AnySchemaObject = {
  type: "string",
  pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
};
const closedObject = (
  properties: Record<string, AnySchemaObject>,
): AnySchemaObject => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const resourceManifestSchema = closedObject({
  manifest_format_version: { const: RESOURCE_MANIFEST_FORMAT_VERSION },
  kepler_release: stableVersion,
  files: {
    type: "object",
    minProperties: 1,
    propertyNames: text,
    additionalProperties: digest,
  },
  resource_digest: digest,
  skills: {
    type: "array",
    minItems: 11,
    maxItems: 11,
    items: closedObject({ id: text, digest, required: { type: "boolean" } }),
  },
  pi_agents: {
    type: "array",
    minItems: 4,
    maxItems: 4,
    items: closedObject({ role: text, agent_id: text, digest }),
  },
});
const packageDescriptorSchema = closedObject({
  name: { const: "kepler-resources" },
  version: stableVersion,
  private: { const: true },
  type: { const: "module" },
  pi: closedObject({
    skills: { type: "array", minItems: 1, maxItems: 1, items: { const: "./bundle/skills" } },
    subagents: closedObject({
      agents: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: { const: "./bundle/agents/pi/v1" },
      },
    }),
  }),
});
const ajv = new Ajv({ allErrors: false, strict: true });
const validateResourceManifest = ajv.compile<ResourceManifest>(resourceManifestSchema);
const validatePackageDescriptor = ajv.compile(packageDescriptorSchema);

export function parseResourceManifest(content: string): ResourceManifest {
  const value = parseMetadataJsonObject(content, "resource manifest");
  if (value.manifest_format_version !== RESOURCE_MANIFEST_FORMAT_VERSION) {
    throw new ResourceManifestError(
      `Unsupported resource manifest version: ${String(value.manifest_format_version)}`,
    );
  }
  if (!isResourceManifest(value)) {
    const first = validateResourceManifest.errors?.[0];
    throw new ResourceManifestError(
      `Resource manifest is invalid at ${first?.instancePath || "/"}: ${first?.message ?? "schema mismatch"}`,
    );
  }

  const manifest = value;
  validateStableVersion(manifest.kepler_release);
  validateSkillSet(manifest.skills);
  validatePiAgentSet(manifest.pi_agents);
  validateDigestMap(manifest.files);
  if (manifest.files["manifest.json"] !== undefined) {
    throw new ResourceManifestError(
      "Resource manifest inventory must not include manifest.json",
    );
  }
  validateDeclaredResources(manifest);
  if (resourceManifestContentDigest(manifest) !== manifest.resource_digest) {
    throw new ResourceManifestError(
      "resource_digest does not match resource manifest metadata",
    );
  }
  return manifest;
}

export function resourceManifestContentDigest(
  manifest: ResourceManifest,
): ContentDigest {
  const payload = {
    manifest_format_version: manifest.manifest_format_version,
    kepler_release: manifest.kepler_release,
    files: sortedRecord(manifest.files),
    skills: manifest.skills
      .map(({ id, digest: fileDigest, required }) => ({
        id,
        digest: fileDigest,
        required,
      }))
      .sort((left, right) => compareStrings(left.id, right.id)),
    pi_agents: manifest.pi_agents
      .map(({ role, agent_id, digest: fileDigest }) => ({
        role,
        agent_id,
        digest: fileDigest,
      }))
      .sort((left, right) => compareStrings(left.role, right.role)),
  };
  return sha256Digest(JSON.stringify(payload));
}

export function createResourceManifest(
  keplerRelease: string,
  files: readonly { readonly path: string; readonly contents: Uint8Array }[],
): ResourceManifest {
  validateStableVersion(keplerRelease);
  const fileDigests: Record<string, ContentDigest> = {};
  for (const file of files) {
    if (!isNormalizedRelativePath(file.path) || file.path === "manifest.json") {
      throw new ResourceManifestError(
        `Resource file path is not a normalized relative path: ${file.path}`,
      );
    }
    if (fileDigests[file.path] !== undefined) {
      throw new ResourceManifestError(`Duplicate resource file: ${file.path}`);
    }
    fileDigests[file.path] = sha256Digest(file.contents);
  }
  const base: ResourceManifest = {
    manifest_format_version: RESOURCE_MANIFEST_FORMAT_VERSION,
    kepler_release: keplerRelease,
    files: sortedRecord(fileDigests),
    resource_digest: sha256Digest(new Uint8Array()),
    skills: skillIds.map((id) => ({
      id,
      digest: requiredDigest(fileDigests, `skills/${id}/SKILL.md`),
      required: standardSkillIds.has(id),
    })),
    pi_agents: piAgents.map(([role, agent_id]) => ({
      role,
      agent_id,
      digest: requiredDigest(fileDigests, `agents/pi/v1/${agent_id}.md`),
    })),
  };
  const manifest = { ...base, resource_digest: resourceManifestContentDigest(base) };
  return parseResourceManifest(JSON.stringify(manifest));
}

export function validateResourcePackage(
  snapshot: ResourcePackageSnapshot,
  expectedRelease: string,
): ValidatedResourcePackage {
  const manifest = parseResourceManifest(snapshot.manifest);
  if (manifest.kepler_release !== expectedRelease) {
    throw new ResourceManifestError(
      `Resource package release ${manifest.kepler_release} does not match expected Kepler release ${expectedRelease}`,
    );
  }
  const files = new Map<string, { path: string; contents: Uint8Array; digest: ContentDigest }>();
  for (const file of snapshot.files) {
    if (!isNormalizedRelativePath(file.path) || file.path === "manifest.json") {
      throw new ResourceManifestError(
        `Resource file path is not a normalized relative path: ${file.path}`,
      );
    }
    if (files.has(file.path)) {
      throw new ResourceManifestError(`Duplicate resource file: ${file.path}`);
    }
    files.set(file.path, {
      path: file.path,
      contents: file.contents,
      digest: sha256Digest(file.contents),
    });
  }

  for (const [path, expectedDigest] of Object.entries(manifest.files)) {
    const file = files.get(path);
    if (!file) throw new ResourceManifestError(`Missing resource file: ${path}`);
    if (file.digest !== expectedDigest) {
      throw new ResourceManifestError(`Resource file digest mismatch: ${path}`);
    }
  }
  for (const path of files.keys()) {
    if (manifest.files[path] === undefined) {
      throw new ResourceManifestError(`Unexpected resource file: ${path}`);
    }
  }

  validatePackageFiles(manifest, files);
  return { manifest, files: [...files.values()] };
}

function validatePackageFiles(
  manifest: ResourceManifest,
  files: ReadonlyMap<string, { readonly contents: Uint8Array }>,
): void {
  const descriptorFile = files.get("pi-package.json");
  if (!descriptorFile) {
    throw new ResourceManifestError("Missing Pi package descriptor: pi-package.json");
  }
  const descriptor = parseMetadataJsonObject(
    new TextDecoder().decode(descriptorFile.contents),
    "Pi package descriptor",
  );
  if (!validatePackageDescriptor(descriptor)) {
    const first = validatePackageDescriptor.errors?.[0];
    throw new ResourceManifestError(
      `Pi package descriptor is invalid at ${first?.instancePath || "/"}: ${first?.message ?? "schema mismatch"}`,
    );
  }
  if (descriptor.version !== manifest.kepler_release) {
    throw new ResourceManifestError(
      "Pi package descriptor version does not match the resource manifest release",
    );
  }

  for (const path of constructionTemplates) {
    if (!files.has(path)) {
      throw new ResourceManifestError(`Missing required Construction template: ${path}`);
    }
  }
  if (![...files.keys()].some((path) => path.startsWith("guidelines/"))) {
    throw new ResourceManifestError("Resource package must include guidelines");
  }

  const validSkillIds = new Set<string>(skillIds);
  const unknownSkill = [...files.keys()].find((path) => {
    if (!path.startsWith("skills/")) return false;
    const [, skillId] = path.split("/");
    return skillId === undefined || !validSkillIds.has(skillId);
  });
  if (unknownSkill) {
    throw new ResourceManifestError(`Unexpected skill resource: ${unknownSkill}`);
  }

  const validAgentPaths = new Set([
    ...piAgents.map(([, agentId]) => `agents/pi/v1/${agentId}.md`),
    ...piAgents.map(([, agentId]) => `agents/claude-code/v1/${agentId}.md`),
  ]);
  const unknownAgent = [...files.keys()].find(
    (path) => path.startsWith("agents/") && !validAgentPaths.has(path),
  );
  if (unknownAgent) {
    throw new ResourceManifestError(`Unexpected agent resource: ${unknownAgent}`);
  }
}

function isResourceManifest(value: unknown): value is ResourceManifest {
  return validateResourceManifest(value) === true;
}

function validateDeclaredResources(manifest: ResourceManifest): void {
  for (const skill of manifest.skills) {
    const path = `skills/${skill.id}/SKILL.md`;
    if (manifest.files[path] !== skill.digest) {
      throw new ResourceManifestError(
        `Resource manifest skill digest does not match its file: ${skill.id}`,
      );
    }
  }
  for (const agent of manifest.pi_agents) {
    const path = `agents/pi/v1/${agent.agent_id}.md`;
    if (manifest.files[path] !== agent.digest) {
      throw new ResourceManifestError(
        `Resource manifest Pi agent digest does not match its file: ${agent.role}`,
      );
    }
  }
  requiredDigest(manifest.files, "pi-package.json");
}

function validateSkillSet(skills: readonly ResourceSkill[]): void {
  const expected = new Map<string, boolean>();
  for (const id of skillIds) expected.set(id, standardSkillIds.has(id));
  if (
    skills.length !== expected.size ||
    new Set(skills.map(({ id }) => id)).size !== skills.length ||
    skills.some(({ id, required }) => expected.get(id) !== required)
  ) {
    throw new ResourceManifestError(
      "Resource manifest must declare the eleven accepted skills with their required status",
    );
  }
}

function validatePiAgentSet(agents: readonly PiAgentResource[]): void {
  const expected = new Map<string, string>(piAgents);
  if (
    agents.length !== expected.size ||
    new Set(agents.map(({ role }) => role)).size !== agents.length ||
    new Set(agents.map(({ agent_id }) => agent_id)).size !== agents.length ||
    agents.some(({ role, agent_id }) => expected.get(role) !== agent_id)
  ) {
    throw new ResourceManifestError(
      "Resource manifest must declare the four accepted Pi roles",
    );
  }
}

function validateDigestMap(files: Readonly<Record<string, ContentDigest>>): void {
  const invalid = Object.keys(files).find((path) => !isNormalizedRelativePath(path));
  if (invalid) {
    throw new ResourceManifestError(
      "Resource manifest file paths must be normalized relative paths",
    );
  }
}

function validateStableVersion(version: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new ResourceManifestError(`Invalid stable Kepler release version: ${version}`);
  }
  if (version.split(".").some((component) => !Number.isSafeInteger(Number(component)))) {
    throw new ResourceManifestError(`Kepler release version exceeds safe integer range: ${version}`);
  }
}

function isNormalizedRelativePath(path: string): boolean {
  const segments = path.split("/");
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function requiredDigest(
  files: Readonly<Record<string, ContentDigest>>,
  path: string,
): ContentDigest {
  const value = files[path];
  if (!value) throw new ResourceManifestError(`Missing required resource: ${path}`);
  return value;
}

function sortedRecord<T>(value: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compareStrings(left, right)),
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
