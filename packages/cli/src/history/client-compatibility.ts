import { Ajv, type AnySchemaObject } from "ajv";
import { parseStrictJson } from "../json/strict-json.js";
import { HistoryError, type HistoryDigest, type MissionHistoryBinding } from "./control.js";
import { canonicalJson } from "./journal.js";

export const HISTORY_CLIENT_COMPATIBILITY_FORMAT = "kepler.history-client-compatibility" as const;
export const HISTORY_CLIENT_COMPATIBILITY_PURPOSE = "history-client-compatibility";
export const HISTORY_CLIENT_GENERATION_PROTOCOL = "mission-history-generations/v1" as const;
export const HISTORY_UNSUPPORTED_LEGACY_CLIENT_REVISION = "d2a9f5037c227765818e220443f426303bef4b45";

export type HistoryClientCompatibilityOperation = "migrate" | "reset" | "publish";
export type HistoryClientKind = "interactive" | "worker" | "automation" | "sdk" | "quiescent-copy";
export type HistoryClientProtocolStatus = "compatible" | "incompatible" | "unverified";
export type HistoryClientOperationalState = "stopped" | "active-read-only";

export interface HistoryClientEvidenceMaterial {
  readonly reference: string;
  readonly content_version: HistoryDigest;
}

export interface HistoryClientCompatibilityEntry {
  readonly reference: string;
  readonly kind: HistoryClientKind;
  readonly run_references: readonly string[];
  readonly origin_ids: readonly string[];
  readonly protocol_status: HistoryClientProtocolStatus;
  readonly operational_state: HistoryClientOperationalState;
  readonly client_identity: string | null;
  readonly evidence: readonly HistoryClientEvidenceMaterial[];
}

export interface HistoryClientCompatibilityDocument {
  readonly format: typeof HISTORY_CLIENT_COMPATIBILITY_FORMAT;
  readonly version: 1;
  readonly mission_binding: MissionHistoryBinding;
  readonly generation_id: string;
  readonly operation: HistoryClientCompatibilityOperation;
  readonly required_protocol: typeof HISTORY_CLIENT_GENERATION_PROTOCOL;
  readonly confirmed_by: string;
  readonly scope_complete: true;
  readonly external_client_references: readonly string[];
  readonly clients: readonly HistoryClientCompatibilityEntry[];
  readonly unresolved_clients: readonly string[];
  readonly source_material: readonly HistoryClientEvidenceMaterial[];
}

export interface HistoryClientCompatibilityScope {
  readonly mission_binding: MissionHistoryBinding;
  readonly generation_id: string;
  readonly operation: HistoryClientCompatibilityOperation;
  readonly lead: string;
  readonly run_references: readonly string[];
  readonly origin_ids: readonly string[];
}

export interface HistoryClientCompatibilityReportBinding {
  readonly reference: string;
  readonly content_version: HistoryDigest;
  readonly report_reference: string;
  readonly materials: readonly { readonly reference: string; readonly purpose: string; readonly content_version: HistoryDigest }[];
  readonly scope_evidence_references: readonly string[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const digest: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: AnySchemaObject, minItems = 0): AnySchemaObject => ({ type: "array", items, minItems });
const uniqueStrings: AnySchemaObject = { ...array(text), uniqueItems: true };
const nullable = (schema: AnySchemaObject): AnySchemaObject => ({ anyOf: [schema, { type: "null" }] });
const binding = object({
  record_home_repository_id: text,
  mission_id: { type: "string", pattern: uuid.source },
  workflow: { const: "standard" },
  request_reference: text,
  unit_ids: uniqueStrings,
});
const material = object({ reference: text, content_version: digest });
const client = object({
  reference: text,
  kind: { enum: ["interactive", "worker", "automation", "sdk", "quiescent-copy"] },
  run_references: uniqueStrings,
  origin_ids: uniqueStrings,
  protocol_status: { enum: ["compatible", "incompatible", "unverified"] },
  operational_state: { enum: ["stopped", "active-read-only"] },
  client_identity: nullable(text),
  evidence: array(material, 1),
});
const documentSchema = object({
  format: { const: HISTORY_CLIENT_COMPATIBILITY_FORMAT },
  version: { const: 1 },
  mission_binding: binding,
  generation_id: { type: "string", pattern: uuid.source },
  operation: { enum: ["migrate", "reset", "publish"] },
  required_protocol: { const: HISTORY_CLIENT_GENERATION_PROTOCOL },
  confirmed_by: text,
  scope_complete: { const: true },
  external_client_references: uniqueStrings,
  clients: array(client, 1),
  unresolved_clients: { ...array(text), maxItems: 0 },
  source_material: array(material, 1),
});
const validateDocument = new Ajv({ strict: true, allErrors: false }).compile<HistoryClientCompatibilityDocument>(documentSchema);
const validText = (value: string): boolean => value.trim().length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
const fail = (reason: string): never => { throw new HistoryError("history_client_compatibility_invalid", reason); };
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const sameSet = (left: readonly string[], right: readonly string[]): boolean => canonicalJson([...new Set(left)].sort(compare)) === canonicalJson([...new Set(right)].sort(compare));
const includesLegacyUnsupportedBuild = (identity: string): boolean => identity.toLowerCase().includes(HISTORY_UNSUPPORTED_LEGACY_CLIENT_REVISION);
const specificClientIdentity = (identity: string): boolean => {
  const value = identity.toLowerCase();
  const placeholder = /^(?:unknown|unverified|unidentified|unspecified|unavailable|none|null|n\/a)(?:[ -]+(?:build|client|adapter|identity|label))?$/u;
  const versionOnly = /^(?:(?:kepler(?:[ -]+cli)?|version)[ @:/=-]+)?v?\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/u;
  return !placeholder.test(value) && !versionOnly.test(value);
};

export const parseHistoryClientCompatibilityDocument = (input: unknown): HistoryClientCompatibilityDocument => {
  let value = input;
  if (typeof input === "string") {
    const parsed = parseStrictJson(input);
    if (parsed.kind !== "parsed") return fail("The client compatibility document must be one strict JSON object.");
    value = parsed.value;
  }
  try { value = JSON.parse(canonicalJson(value)) as unknown; } catch { return fail("The client compatibility document must contain only JSON values."); }
  if (!validateDocument(value)) return fail("The client compatibility document does not match the strict version-1 format.");
  const document = value as HistoryClientCompatibilityDocument;
  const references = document.clients.map((entry) => entry.reference);
  if (new Set(references).size !== references.length || document.clients.some((entry) => !validText(entry.reference))) return fail("Client references must be explicit and unique.");
  if (![document.mission_binding.record_home_repository_id, document.mission_binding.request_reference, document.confirmed_by].every(validText)) return fail("The client compatibility binding and lead confirmation must be explicit.");
  for (const material of document.source_material) if (!validText(material.reference)) return fail("Source material references must be explicit.");
  if (new Set(document.source_material.map((entry) => entry.reference)).size !== document.source_material.length) return fail("Source material references must be unique.");
  for (const entry of document.clients) {
    if (![...entry.run_references, ...entry.origin_ids].every(validText)) return fail("Client run and origin references must be explicit.");
    if (entry.client_identity !== null && (!validText(entry.client_identity) || !specificClientIdentity(entry.client_identity))) return fail("A known client requires a specific build or adapter identity, not an unknown marker or version alone.");
    if (entry.client_identity === null && (entry.protocol_status !== "unverified" || entry.operational_state !== "stopped")) return fail("Only an unverified stopped client can have an unknown identity.");
    if (entry.protocol_status === "compatible" && (entry.client_identity === null || entry.evidence.length === 0)) return fail("A compatible client requires an identified build or adapter and supporting evidence.");
    if (entry.protocol_status !== "compatible" && entry.operational_state !== "stopped") return fail("Only a compatible client can remain active-read-only.");
    if (entry.run_references.length > 0 && entry.operational_state !== "stopped") return fail("Every client associated with an affected run must be stopped.");
    if (entry.client_identity !== null && includesLegacyUnsupportedBuild(entry.client_identity) && entry.protocol_status !== "incompatible") return fail("The pinned legacy Kepler 3.1.0 build is unsupported for generation-based history.");
    if (entry.kind === "quiescent-copy" && (entry.run_references.length > 0 || entry.protocol_status !== "unverified" || entry.operational_state !== "stopped" || entry.client_identity !== null)) return fail("A quiescent copy must be stopped, unverified, identity-unknown, and have no run references.");
    for (const evidence of entry.evidence) if (!validText(evidence.reference)) return fail("Client evidence references must be explicit.");
    if (new Set(entry.evidence.map((item) => item.reference)).size !== entry.evidence.length) return fail("Client evidence references must be unique.");
  }
  return document;
};

export const serializeHistoryClientCompatibilityDocument = (input: unknown): Uint8Array => {
  const document = parseHistoryClientCompatibilityDocument(input);
  return new TextEncoder().encode(`${canonicalJson(document)}\n`);
};

export const validateHistoryClientCompatibility = (
  document: HistoryClientCompatibilityDocument,
  scope: HistoryClientCompatibilityScope,
  report: HistoryClientCompatibilityReportBinding,
): void => {
  if (document.operation !== scope.operation || document.generation_id !== scope.generation_id || canonicalJson(document.mission_binding) !== canonicalJson(scope.mission_binding) || document.confirmed_by !== scope.lead) return fail("The client compatibility document has the wrong operation, mission, generation, or lead binding.");
  const requiredRuns = [...scope.run_references];
  const requiredOrigins = [...scope.origin_ids];
  const associatedRuns = document.clients.flatMap((entry) => [...entry.run_references]);
  const associatedOrigins = document.clients.flatMap((entry) => [...entry.origin_ids]);
  if (associatedRuns.some((reference) => !requiredRuns.includes(reference)) || !sameSet(associatedRuns, requiredRuns)) return fail("Client entries do not cover exactly the affected reconciliation runs.");
  if (associatedOrigins.some((origin) => !requiredOrigins.includes(origin)) || !sameSet(associatedOrigins, requiredOrigins)) return fail("Client entries do not cover exactly the affected working-copy origins.");
  const external = new Set(document.external_client_references);
  const byReference = new Map(document.clients.map((entry) => [entry.reference, entry]));
  if ([...external].some((reference) => !byReference.has(reference))) return fail("Every external client reference must identify exactly one client entry.");
  for (const entry of document.clients) {
    if (entry.run_references.length === 0 && entry.origin_ids.length === 0 && !external.has(entry.reference)) return fail("Every client entry must associate with an affected run, an affected origin, or an external reference.");
    if (entry.kind === "quiescent-copy" && entry.origin_ids.length === 0 && !external.has(entry.reference)) return fail("A quiescent copy without a resolved origin must be explicitly declared as external.");
  }
  const compatibilityMaterials = report.materials.filter((material) => material.purpose === HISTORY_CLIENT_COMPATIBILITY_PURPOSE);
  if (compatibilityMaterials.length !== 1 || compatibilityMaterials[0]!.reference !== report.reference || compatibilityMaterials[0]!.content_version !== report.content_version || !report.scope_evidence_references.includes(report.reference)) return fail("The exact compatibility document must be one scope-evidence material in the lead report.");
  const sourceByReference = new Map(document.source_material.map((material) => [material.reference, material.content_version]));
  if (sourceByReference.has(report.reference) || sourceByReference.has(report.report_reference)) return fail("The compatibility document cannot cite itself or the lead report as source material.");
  for (const source of document.source_material) {
    const materials = report.materials.filter((material) => material.reference === source.reference);
    if (materials.length !== 1 || materials[0]!.content_version !== source.content_version || !validText(materials[0]!.purpose) || !report.scope_evidence_references.includes(source.reference)) return fail("Every compatibility source material must be hash-bound once and used as report scope evidence.");
  }
  for (const entry of document.clients) for (const evidence of entry.evidence) {
    if (sourceByReference.get(evidence.reference) !== evidence.content_version) return fail("Client evidence must resolve to a declared source material with the same exact hash.");
  }
};
