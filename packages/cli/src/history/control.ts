import { Ajv, type AnySchemaObject } from "ajv";
import { createHash } from "node:crypto";
import { validateEventEnvelope, type EventEnvelope } from "@vialactea-works/kepler-core";
import { parseStrictJson } from "../json/strict-json.js";
import { canonicalJson } from "./journal.js";

export type HistoryMode = "active" | "recovering";
export type HistoryDigest = `sha256:${string}`;

export interface HistoryMaterial {
  readonly reference: string;
  readonly content_version: HistoryDigest;
}

export interface HistoryReference {
  readonly reference: string;
  readonly purpose: string;
}

export interface MissionHistoryBinding {
  readonly record_home_repository_id: string;
  readonly mission_id: string;
  readonly workflow: "standard";
  readonly request_reference: string;
  readonly unit_ids: readonly string[];
}

export interface HistorySourceEntry {
  readonly source_id: string;
  readonly origin: string;
  readonly path: string;
  readonly byte_length: number;
  readonly content_version: HistoryDigest;
}

export interface HistoryRetirement {
  readonly source_id: string;
  readonly path: string;
  readonly byte_length: number;
  readonly content_version: HistoryDigest;
  readonly archive_reference: string;
}

export interface HistoryReconciliation {
  readonly orchestrator: string;
  readonly affected_workers_terminal: true;
  readonly effects_reconciled: true;
  readonly integration_lock_reconciled: true;
  readonly run_references: readonly string[];
  readonly references: readonly HistoryReference[];
  readonly summary: string;
}

export interface HistoryCandidateJournal {
  readonly phase: string;
  readonly journal_id: string;
  readonly byte_length: number;
  readonly content_version: HistoryDigest;
  readonly reference: string;
}

export interface HistorySourceRange {
  readonly source_id: string;
  readonly byte_offset: number;
  readonly byte_length: number;
}

export interface HistoryProposedEvent {
  readonly phase: "construction";
  readonly type: string;
  readonly event_version: number;
  readonly data: Readonly<Record<string, unknown>>;
  readonly causes: readonly { readonly event_id: string | null; readonly action_id: string | null }[];
}

export interface HistoryAction {
  readonly id: string;
  readonly action: "retain" | "replace" | "add" | "exclude";
  readonly source: HistorySourceRange | null;
  readonly event: HistoryProposedEvent | null;
  readonly reason: string;
  readonly authority: {
    readonly decision_reference: string;
    readonly artifact_bindings: readonly { readonly artifact_id: string; readonly content_version: HistoryDigest }[];
  } | null;
  readonly proof: HistoryMaterial | null;
}

export interface HistoryRequiredMaterial {
  readonly artifact_bindings: readonly (HistoryMaterial & { readonly artifact_id: string })[];
  readonly checkpoints: readonly { readonly repository_id: string; readonly commit: string }[];
  readonly evidence: readonly HistoryMaterial[];
}

export interface HistoryResetManifest {
  readonly format: "kepler.mission-history-reset";
  readonly version: 1;
  readonly mission_binding: MissionHistoryBinding;
  readonly previous_control: { readonly event_id: string | null; readonly content_version: HistoryDigest | null };
  readonly source_inventory: readonly HistorySourceEntry[];
  readonly known_missing_sources: readonly { readonly reference: string; readonly reason: string; readonly consequences: string }[];
  readonly archive_id: string;
  readonly generation_id: string;
  readonly source_retirement: readonly HistoryRetirement[];
  readonly requester: string;
  readonly reason: string;
  readonly reconciliation: HistoryReconciliation;
  readonly accepted_limits: readonly string[];
}

export interface HistoryInitializationManifest {
  readonly format: "kepler.mission-history-initialization";
  readonly version: 1;
  readonly operation: "create" | "migrate";
  readonly mission_binding: MissionHistoryBinding;
  readonly generation_id: string;
  readonly source_inventory: readonly HistorySourceEntry[];
  readonly archive_id: string | null;
  readonly guide: string | null;
  readonly guide_hash: HistoryDigest | null;
  readonly candidate_journals: readonly HistoryCandidateJournal[];
  readonly expected_state: Readonly<Record<string, unknown>>;
  readonly source_retirement: readonly HistoryRetirement[];
  readonly requester: string;
  readonly operation_authority: { readonly kind: "startup-request" | "manifest-approval"; readonly request_reference: string };
}

export interface HistoryRebuildManifest {
  readonly format: "kepler.mission-history-rebuild";
  readonly version: 1;
  readonly mission_id: string;
  readonly generation_id: string;
  readonly reset_event_id: string;
  readonly archive_id: string;
  readonly archive_inventory_hash: HistoryDigest;
  readonly actions: readonly HistoryAction[];
  readonly candidate_journals: readonly HistoryCandidateJournal[];
  readonly required_material: HistoryRequiredMaterial;
  readonly expected_state: Readonly<Record<string, unknown>>;
  readonly continuation: { readonly operation: string; readonly unresolved_work: readonly string[]; readonly required_approvals: readonly string[] };
  readonly requester: string;
  readonly reconciliation: HistoryReconciliation;
}

export type HistoryManifest = HistoryResetManifest | HistoryInitializationManifest | HistoryRebuildManifest;
export type HistoryControlType = "mission.history-initialized" | "mission.history-reset" | "mission.history-rebuilt";
export interface HistoryControlData extends Readonly<Record<string, unknown>> {
  readonly mission_id: string;
  readonly generation_id: string;
  readonly manifest: HistoryManifest;
  readonly manifest_hash: HistoryDigest;
  readonly requester: string;
  readonly decision_reference: string;
}
export type HistoryControl = EventEnvelope<HistoryControlData> & {
  readonly phase: "mission-recovery";
  readonly type: HistoryControlType;
};

export class HistoryError extends Error {
  constructor(readonly code: string, message: string, readonly details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "HistoryError";
  }
}

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid: AnySchemaObject = { type: "string", pattern: uuidPattern.source };
const digest: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const integer: AnySchemaObject = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const jsonObject: AnySchemaObject = { type: "object" };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: AnySchemaObject, minItems = 0): AnySchemaObject => ({ type: "array", items, minItems });
const nullable = (schema: AnySchemaObject): AnySchemaObject => ({ anyOf: [schema, { type: "null" }] });
const uniqueStrings: AnySchemaObject = { ...array(text), uniqueItems: true };
const reference = object({ reference: text, purpose: text });
const material = object({ reference: text, content_version: digest });
const binding = object({ record_home_repository_id: text, mission_id: uuid, workflow: { const: "standard" }, request_reference: text, unit_ids: uniqueStrings });
const source = object({ source_id: text, origin: text, path: text, byte_length: integer, content_version: digest });
const retirement = object({ source_id: text, path: text, byte_length: integer, content_version: digest, archive_reference: text });
const reconciliation = object({
  orchestrator: text,
  affected_workers_terminal: { const: true },
  effects_reconciled: { const: true },
  integration_lock_reconciled: { const: true },
  run_references: uniqueStrings,
  references: array(reference, 1),
  summary: text,
});
const journal = object({ phase: { const: "construction" }, journal_id: uuid, byte_length: integer, content_version: digest, reference: text });
const sourceRange = object({ source_id: text, byte_offset: integer, byte_length: { ...integer, minimum: 1 } });
const proposedEvent = object({
  phase: { const: "construction" }, type: text, event_version: { type: "integer", minimum: 1 }, data: jsonObject,
  causes: array({
    ...object({ event_id: nullable(uuid), action_id: nullable(uuid) }),
    oneOf: [
      { properties: { event_id: uuid, action_id: { type: "null" } } },
      { properties: { event_id: { type: "null" }, action_id: uuid } },
    ],
  }),
});
const approval = object({ decision_reference: text, artifact_bindings: array(object({ artifact_id: uuid, content_version: digest })) });
const action = object({
  id: uuid, action: { enum: ["retain", "replace", "add", "exclude"] }, source: nullable(sourceRange), event: nullable(proposedEvent),
  reason: text, authority: nullable(approval), proof: nullable(material),
});
const resetSchema = object({
  format: { const: "kepler.mission-history-reset" }, version: { const: 1 }, mission_binding: binding,
  previous_control: object({ event_id: nullable(uuid), content_version: nullable(digest) }),
  source_inventory: array(source), known_missing_sources: array(object({ reference: text, reason: text, consequences: text })),
  archive_id: uuid, generation_id: uuid, source_retirement: array(retirement), requester: text, reason: text,
  reconciliation, accepted_limits: array(text),
});
const initializationSchema = object({
  format: { const: "kepler.mission-history-initialization" }, version: { const: 1 }, operation: { enum: ["create", "migrate"] },
  mission_binding: binding, generation_id: uuid, source_inventory: array(source), archive_id: nullable(uuid),
  guide: nullable(text), guide_hash: nullable(digest), candidate_journals: array(journal, 1), expected_state: jsonObject,
  source_retirement: array(retirement), requester: text,
  operation_authority: object({ kind: { enum: ["startup-request", "manifest-approval"] }, request_reference: text }),
});
const rebuildSchema = object({
  format: { const: "kepler.mission-history-rebuild" }, version: { const: 1 }, mission_id: uuid, generation_id: uuid,
  reset_event_id: uuid, archive_id: uuid, archive_inventory_hash: digest, actions: array(action),
  candidate_journals: array(journal, 1),
  required_material: object({
    artifact_bindings: array(object({ artifact_id: uuid, reference: text, content_version: digest })),
    checkpoints: array(object({ repository_id: text, commit: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" } })),
    evidence: array(material),
  }),
  expected_state: jsonObject,
  continuation: object({ operation: text, unresolved_work: array(text), required_approvals: array(text) }), requester: text, reconciliation,
});
const ajv = new Ajv({ strict: true, allErrors: false });
const validateManifest = ajv.compile<HistoryManifest>({ oneOf: [resetSchema, initializationSchema, rebuildSchema] });

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message: string, details: Readonly<Record<string, unknown>> = {}): never => { throw new HistoryError("history_manifest_invalid", message, details); };
const duplicate = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
};
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
export const historyDigest = (value: string | Uint8Array): HistoryDigest => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const historyManifestDigest = (manifest: HistoryManifest): HistoryDigest => historyDigest(canonicalJson(manifest));
export const historyManifestMission = (manifest: HistoryManifest): string =>
  manifest.format === "kepler.mission-history-rebuild" ? manifest.mission_id : manifest.mission_binding.mission_id;

export const parseHistoryManifest = (input: unknown): HistoryManifest => {
  let value = input;
  if (typeof value === "string") {
    const parsed = parseStrictJson(value);
    if (parsed.kind !== "parsed") return fail("The manifest must be one strict JSON object.", { reason: parsed });
    value = parsed.value;
  }
  try { canonicalJson(value); } catch { return fail("The manifest must contain only JSON values."); }
  if (!validateManifest(value)) return fail("The history manifest does not match a supported format.", { issues: validateManifest.errors });
  const manifest = value;
  if (manifest.format !== "kepler.mission-history-rebuild") {
    duplicate(manifest.source_inventory.map((entry) => `${entry.source_id}\u0000${entry.path}`), "Source entries");
    duplicate(manifest.source_retirement.map((entry) => `${entry.source_id}\u0000${entry.path}`), "Retirement entries");
    const sorted = [...manifest.source_inventory].sort((a, b) => compare(a.source_id, b.source_id) || compare(a.path, b.path));
    if (canonicalJson(sorted) !== canonicalJson(manifest.source_inventory)) fail("Source inventory must be sorted by source identity and path.");
    for (const item of [...manifest.source_inventory, ...manifest.source_retirement]) {
      if (!safeHistoryRelativePath(item.path)) fail("History source paths must be exact relative paths.", { path: item.path });
    }
    for (const item of manifest.source_retirement) {
      const original = manifest.source_inventory.find((entry) => entry.source_id === item.source_id && entry.path === item.path);
      if (!original || original.byte_length !== item.byte_length || original.content_version !== item.content_version) fail("Retirement must bind an exact inventoried source.");
      const prefix = `.kepler/missions/${historyManifestMission(manifest)}/history/`;
      const parts = item.path.slice(prefix.length).split("/");
      if (!item.path.startsWith(prefix) || parts.length !== 2 || ["control", "generations"].includes(parts[0]!)) fail("Only direct legacy phase files in this mission can be retired.");
      if (item.archive_reference !== `local-archive:${manifest.archive_id}`) fail("Retirement requires its exact approved local archive binding.");
    }
  }
  if (manifest.format === "kepler.mission-history-reset" && manifest.previous_control.event_id !== null && manifest.previous_control.content_version === null) fail("A prior control identity requires its original byte hash.");
  if (manifest.format === "kepler.mission-history-initialization") {
    if (manifest.operation === "create" && (manifest.archive_id !== null || manifest.source_inventory.length || manifest.source_retirement.length || manifest.guide !== null || manifest.guide_hash !== null || manifest.operation_authority.kind !== "startup-request")) fail("New startup cannot adopt migration inputs or approvals.");
    if (manifest.operation === "migrate" && (!manifest.archive_id || !manifest.guide || !manifest.guide_hash || !manifest.source_inventory.length || manifest.operation_authority.kind !== "manifest-approval")) fail("Migration requires an archive, guide, source inventory, and manifest approval.");
  }
  if (manifest.format === "kepler.mission-history-rebuild") {
    duplicate(manifest.actions.map((entry) => entry.id), "Action identities");
    for (const item of manifest.actions) {
      if ((item.action === "retain" || item.action === "exclude") && (!item.source || item.event !== null || item.authority !== null || item.proof !== null)) fail("Retain and exclude actions require source bytes and cannot invent event data.");
      if (item.action === "replace" && (!item.source || !item.event)) fail("A replacement requires source bytes and supported event data.");
      if (item.action === "add" && (item.source !== null || !item.event)) fail("An added event cannot impersonate an existing source range.");
    }
  }
  if (manifest.format !== "kepler.mission-history-reset") {
    duplicate(manifest.candidate_journals.map((entry) => `${entry.phase}/${entry.journal_id}`), "Candidate journals");
    const sorted = [...manifest.candidate_journals].sort((a, b) => compare(a.phase, b.phase) || compare(a.journal_id, b.journal_id));
    if (canonicalJson(sorted) !== canonicalJson(manifest.candidate_journals)) fail("Candidate journals must be sorted by phase and identity.");
  }
  return manifest;
};

export const safeHistoryRelativePath = (value: string): boolean => value.length > 0 && !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");

export const parseHistoryControl = (input: unknown): HistoryControl => {
  let value = input;
  if (typeof value === "string") {
    const parsed = parseStrictJson(value);
    if (parsed.kind !== "parsed") throw new HistoryError("history_control_invalid", "The activation record must be one strict JSON event.");
    value = parsed.value;
  }
  const validated = validateEventEnvelope(value);
  if (validated.status !== "valid") throw new HistoryError("history_control_invalid", "The activation envelope is invalid or unsupported.", { validation: validated });
  const event = validated.event;
  if (![event.id, event.journal_id, ...event.caused_by].every((id) => uuidPattern.test(id))) throw new HistoryError("history_control_invalid", "Control identities and causes must be full lowercase UUIDv4 values.");
  if (event.phase !== "mission-recovery" || event.event_version !== 1 || !["mission.history-initialized", "mission.history-reset", "mission.history-rebuilt"].includes(event.type)) throw new HistoryError("history_control_invalid", "The history control event is unsupported.");
  const data = event.data;
  if (!record(data) || !exact(data, ["mission_id", "generation_id", "manifest", "manifest_hash", "requester", "decision_reference"])) throw new HistoryError("history_control_invalid", "The control payload must contain exactly the supported fields.");
  const manifest = parseHistoryManifest(data.manifest);
  const expectedType = manifest.format === "kepler.mission-history-reset" ? "mission.history-reset" : manifest.format === "kepler.mission-history-rebuild" ? "mission.history-rebuilt" : "mission.history-initialized";
  if (event.type !== expectedType || data.mission_id !== historyManifestMission(manifest) || data.generation_id !== manifest.generation_id || data.requester !== manifest.requester || data.manifest_hash !== historyManifestDigest(manifest) || typeof data.decision_reference !== "string" || !data.decision_reference.trim()) throw new HistoryError("history_control_invalid", "The control event does not match its complete approved manifest.");
  if (manifest.format === "kepler.mission-history-reset") {
    const expected = manifest.previous_control.event_id === null ? [] : [manifest.previous_control.event_id];
    if (canonicalJson(event.caused_by) !== canonicalJson(expected)) throw new HistoryError("history_control_invalid", "Reset causes must match the verified prior control or start a new control root.");
  }
  if (manifest.format === "kepler.mission-history-rebuild" && canonicalJson(event.caused_by) !== canonicalJson([manifest.reset_event_id])) throw new HistoryError("history_control_invalid", "A rebuilt selection must name its exact reset cause.");
  if (manifest.format === "kepler.mission-history-initialization" && event.caused_by.length !== 1) throw new HistoryError("history_control_invalid", "Initial history selection requires its exact mission-creation cause.");
  return {
    ...event,
    phase: "mission-recovery",
    type: expectedType,
    data: {
      mission_id: historyManifestMission(manifest),
      generation_id: manifest.generation_id,
      manifest,
      manifest_hash: historyManifestDigest(manifest),
      requester: manifest.requester,
      decision_reference: data.decision_reference,
    },
  };
};

export const createHistoryControl = (input: {
  readonly id: string;
  readonly journalId: string;
  readonly recordedAt: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly manifest: HistoryManifest;
  readonly decisionReference: string;
  readonly causes: readonly string[];
}): HistoryControl => {
  const manifest = parseHistoryManifest(input.manifest);
  return parseHistoryControl({
    id: input.id,
    phase: "mission-recovery",
    type: manifest.format === "kepler.mission-history-reset" ? "mission.history-reset" : manifest.format === "kepler.mission-history-rebuild" ? "mission.history-rebuilt" : "mission.history-initialized",
    envelope_version: 1,
    event_version: 1,
    journal_id: input.journalId,
    recorded_at: input.recordedAt,
    producer: input.producer,
    caused_by: input.causes,
    data: {
      mission_id: historyManifestMission(manifest),
      generation_id: manifest.generation_id,
      manifest,
      manifest_hash: historyManifestDigest(manifest),
      requester: manifest.requester,
      decision_reference: input.decisionReference,
    },
  });
};

export const historyMode = (control: HistoryControl): HistoryMode => control.type === "mission.history-reset" ? "recovering" : "active";

export const assertHistoryVersion = (control: HistoryControl | undefined, expected: string | undefined): void => {
  if (!control) throw new HistoryError("history_migration_required", "Legacy phase journals are read-only. Use an approved lifecycle migration.");
  if (!expected) throw new HistoryError("history_version_required", "An explicit --history-version is required before a mission mutation.");
  if (expected !== control.id) throw new HistoryError("history_version_mismatch", "The requested history version is no longer current.", { expected, actual: control.id });
  if (historyMode(control) !== "active") throw new HistoryError("history_recovery_pending", "Ordinary mission mutations are blocked during recovery.", { history_version: control.id });
};
