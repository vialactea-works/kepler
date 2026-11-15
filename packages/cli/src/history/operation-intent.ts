import { Ajv, type AnySchemaObject } from "ajv";
import { parseStrictJson } from "../json/strict-json.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex, type HistoryArchiveIndex } from "./archive-index.js";
import { HistoryError, historyDigest, historyManifestDigest, parseHistoryControl, parseHistoryGuard, parseHistoryManifest, safeHistoryRelativePath, type HistoryCandidateJournal, type HistoryControl, type HistoryDigest, type HistoryGenerationGuard, type HistoryManifest, type HistoryMaterial, type HistorySourceEntry } from "./control.js";
import type { HistorySnapshot } from "./files.js";
import { canonicalJson } from "./journal.js";

export type HistoryOperation = "migrate" | "reset" | "publish";

export interface HistoryPendingCandidate extends HistoryCandidateJournal {
  readonly bytes_base64: string;
}

export interface HistoryOperationIntent {
  readonly format: "kepler.mission-history-operation";
  readonly version: 1;
  readonly key: HistoryDigest;
  readonly operation: HistoryOperation;
  readonly record_home_origin: string;
  readonly mission_id: string;
  readonly generation_id: string;
  readonly manifest_hash: HistoryDigest;
  readonly requester: string;
  readonly decision_reference: string;
  readonly control: HistoryControl;
  readonly guard: HistoryGenerationGuard;
  readonly predecessor: { readonly event: HistoryControl; readonly bytes_base64: string } | null;
  readonly archive_index: HistoryArchiveIndex;
  readonly candidate_journals: readonly HistoryPendingCandidate[];
  readonly original_sources: readonly HistorySourceEntry[];
  readonly replacement_inputs: readonly { readonly source_id: string; readonly bytes_base64: string }[];
  readonly original_unavailable: HistorySnapshot["unavailable"];
  readonly activation_input: HistoryDigest | null;
  readonly binding_input: HistoryDigest | null;
  readonly checks: readonly HistoryMaterial[];
}

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const uuid: AnySchemaObject = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const digest: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const integer: AnySchemaObject = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const nullable = (schema: AnySchemaObject): AnySchemaObject => ({ anyOf: [schema, { type: "null" }] });
const jsonObject: AnySchemaObject = { type: "object" };
const source = object({ source_id: text, origin: text, path: text, byte_length: integer, content_version: digest });
const candidate = object({ phase: { const: "construction" }, journal_id: uuid, byte_length: integer, content_version: digest, reference: text, bytes_base64: { type: "string" } });
const validate = new Ajv({ strict: true, allErrors: false }).compile<HistoryOperationIntent>(object({
  format: { const: "kepler.mission-history-operation" }, version: { const: 1 }, key: digest,
  operation: { enum: ["migrate", "reset", "publish"] }, record_home_origin: text,
  mission_id: uuid, generation_id: uuid, manifest_hash: digest, requester: text, decision_reference: text,
  control: jsonObject, guard: jsonObject, predecessor: nullable(object({ event: jsonObject, bytes_base64: { type: "string" } })),
  archive_index: jsonObject, candidate_journals: { type: "array", items: candidate }, original_sources: { type: "array", items: source },
  replacement_inputs: { type: "array", items: object({ source_id: text, bytes_base64: { type: "string" } }) },
  original_unavailable: { type: "array", items: object({ source_id: text, path: text, kind: { enum: ["missing", "unreadable", "unsafe"] }, reason: text }) },
  activation_input: nullable(digest), binding_input: nullable(digest), checks: { type: "array", minItems: 1, items: object({ reference: text, content_version: digest }) },
}));

const decoder = new TextDecoder("utf-8", { fatal: true });
const strictValue = (input: unknown, code: string): unknown => {
  try {
    const parsed = parseStrictJson(typeof input === "string" ? input : canonicalJson(input));
    if (parsed.kind === "parsed") return parsed.value;
  } catch {}
  throw new HistoryError(code, "History operation data must contain one strict JSON value.");
};
const fail = (message: string): never => { throw new HistoryError("history_intent_invalid", message); };
const decodeBytes = (encoded: string): Uint8Array => {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) fail("Retained operation bytes must use exact canonical base64.");
  return new Uint8Array(bytes);
};

export const historyOperationKey = (input: { readonly operation: HistoryOperation; readonly missionId: string; readonly generationId: string; readonly manifestHash: HistoryDigest; readonly requester: string; readonly decisionReference: string }): HistoryDigest => historyDigest(canonicalJson(input));

export const parseHistoryOperationIntent = (input: unknown): HistoryOperationIntent => {
  const value = strictValue(input, "history_intent_invalid");
  if (!validate(value)) return fail("Retained operation instructions must match the strict version-1 format.");
  const intent = value as HistoryOperationIntent;
  const control = parseHistoryControl(intent.control);
  const manifest = control.data.manifest;
  const kind: HistoryOperation = manifest.format === "kepler.mission-history-reset" ? "reset" : manifest.format === "kepler.mission-history-rebuild" ? "publish" : "migrate";
  if (manifest.format === "kepler.mission-history-initialization" && manifest.operation !== "migrate") fail("Recovery instructions cannot adopt new-startup authority.");
  if (kind !== intent.operation || intent.mission_id !== control.data.mission_id || intent.generation_id !== control.data.generation_id || intent.manifest_hash !== historyManifestDigest(manifest) || intent.requester !== manifest.requester || intent.decision_reference !== control.data.decision_reference) fail("Retained control authority must match its operation, scope, manifest, and requester decision.");
  if (intent.key !== historyOperationKey({ operation: intent.operation, missionId: intent.mission_id, generationId: intent.generation_id, manifestHash: intent.manifest_hash, requester: intent.requester, decisionReference: intent.decision_reference })) fail("The operation key does not match the exact original request.");
  const index = parseHistoryArchiveIndex(intent.archive_index);
  if (index.mission_id !== intent.mission_id || index.archive_id !== manifest.archive_id) fail("The retained archive belongs to another operation scope.");
  const predecessor = intent.predecessor === null ? null : parseHistoryControl(intent.predecessor.event);
  if (predecessor && intent.predecessor) {
    const raw = decodeBytes(intent.predecessor.bytes_base64);
    if (canonicalJson(parseHistoryControl(decoder.decode(raw))) !== canonicalJson(predecessor)) fail("Original predecessor bytes do not match their retained control.");
  }
  if (manifest.format === "kepler.mission-history-rebuild") {
    if (!predecessor || predecessor.type !== "mission.history-reset" || predecessor.id !== manifest.reset_event_id || predecessor.data.generation_id !== intent.generation_id || index.manifest_hash !== historyManifestDigest(predecessor.data.manifest) || historyArchiveIndexDigest(index) !== manifest.archive_inventory_hash) fail("Publication instructions require the exact selected reset and verified archive.");
  } else {
    if (index.manifest_hash !== intent.manifest_hash || canonicalJson(index.source_inventory) !== canonicalJson(manifest.source_inventory) || canonicalJson(intent.original_sources) !== canonicalJson(manifest.source_inventory)) fail("Preservation instructions must bind the complete original inventory.");
    if (manifest.format === "kepler.mission-history-reset") {
      if ((predecessor?.id ?? null) !== manifest.previous_control.event_id || predecessor && intent.predecessor && historyDigest(decodeBytes(intent.predecessor.bytes_base64)) !== manifest.previous_control.content_version) fail("Reset instructions contain another or changed predecessor.");
    } else if (predecessor !== null) fail("Healthy migration must not adopt generation recovery authority.");
  }
  const guardControl = intent.operation === "publish" ? predecessor! : control;
  const guard = parseHistoryGuard(intent.guard, guardControl);
  const metadata = intent.candidate_journals.map(({ bytes_base64: _bytes, ...entry }) => entry);
  if (manifest.format === "kepler.mission-history-reset" ? metadata.length !== 0 : canonicalJson(metadata) !== canonicalJson(manifest.candidate_journals)) fail("Retained candidate bytes must match the complete approved candidate inventory.");
  for (const journal of intent.candidate_journals) {
    const raw = decodeBytes(journal.bytes_base64);
    if (raw.length !== journal.byte_length || historyDigest(raw) !== journal.content_version) fail("Retained candidate bytes have a different length or digest.");
  }
  const activationPath = `.kepler/missions/${intent.mission_id}/history/control/active.json`;
  const bindingPath = `kepler/missions/${intent.mission_id}/coordination/history-selection.json`;
  const replaced = intent.original_sources.filter((source) => source.origin === intent.record_home_origin && source.path === activationPath || source.origin === "local-runtime" && source.path === bindingPath);
  if (replaced.length !== intent.replacement_inputs.length || new Set(intent.replacement_inputs.map((input) => input.source_id)).size !== replaced.length) fail("Retained replacements must cover exactly the original selector and shared binding inputs.");
  for (const source of replaced) {
    const input = intent.replacement_inputs.find((input) => input.source_id === source.source_id);
    const raw = input ? decodeBytes(input.bytes_base64) : undefined;
    const expected = source.path === activationPath ? intent.activation_input : intent.binding_input;
    if (!raw || raw.length !== source.byte_length || historyDigest(raw) !== source.content_version || source.content_version !== expected) fail("Retained replacement bytes must match their original inventory and compare-and-replace version.");
  }
  if (!replaced.some((source) => source.path === activationPath) && intent.activation_input !== null || !replaced.some((source) => source.path === bindingPath) && intent.binding_input !== null) fail("Absent original selectors or bindings require an absent compare-and-replace version.");
  if (intent.operation === "publish" && (!intent.predecessor || intent.activation_input !== historyDigest(decodeBytes(intent.predecessor.bytes_base64)))) fail("Publication must retain the exact currently selected reset bytes before activation.");
  const sorted = [...intent.original_sources].sort((left, right) => left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (canonicalJson(sorted) !== canonicalJson(intent.original_sources) || new Set(intent.original_sources.map((entry) => entry.source_id)).size !== intent.original_sources.length || new Set(intent.original_sources.map((entry) => `${entry.origin}\u0000${entry.path}`)).size !== intent.original_sources.length) fail("Original source coordinates must be sorted and file-scoped.");
  if (intent.original_sources.some((entry) => !safeHistoryRelativePath(entry.path)) || intent.original_unavailable.some((entry) => !safeHistoryRelativePath(entry.path))) fail("Original operation coordinates must remain within their relative source roots.");
  return { ...intent, control, guard, archive_index: index, predecessor: predecessor && intent.predecessor ? { event: predecessor, bytes_base64: intent.predecessor.bytes_base64 } : null };
};

export interface HistoryOperationRequest {
  readonly phase: "preview" | "apply";
  readonly manifest: HistoryManifest;
  readonly approved_manifest_hash?: HistoryDigest;
  readonly requester?: string;
  readonly decision_reference?: string;
}

export const parseHistoryOperationRequest = (input: unknown, operation: HistoryOperation): HistoryOperationRequest => {
  const parsed = strictValue(input, "history_request_invalid");
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new HistoryError("history_request_invalid", "Recovery input must be one strict JSON object.");
  const value = parsed as Record<string, unknown>;
  const phase = value.phase;
  const keys = phase === "preview" ? ["phase", "manifest"] : ["phase", "manifest", "approved_manifest_hash", "requester", "decision_reference"];
  if (!["preview", "apply"].includes(String(phase)) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) throw new HistoryError("history_request_invalid", "Recovery input contains missing, duplicate, or unsupported fields.");
  const manifest = parseHistoryControlManifest(value.manifest, operation);
  if (phase === "preview") return { phase, manifest };
  if (value.approved_manifest_hash !== historyManifestDigest(manifest) || value.requester !== manifest.requester || typeof value.decision_reference !== "string" || !value.decision_reference.trim()) throw new HistoryError("history_manifest_approval_required", "Apply requires the exact manifest hash, matching requester, and explicit decision reference.");
  return { phase: "apply", manifest, approved_manifest_hash: value.approved_manifest_hash as HistoryDigest, requester: String(value.requester), decision_reference: value.decision_reference };
};

const parseHistoryControlManifest = (input: unknown, operation: HistoryOperation): HistoryManifest => {
  const manifest = parseHistoryManifest(input);
  const kind = manifest.format === "kepler.mission-history-reset" ? "reset" : manifest.format === "kepler.mission-history-rebuild" ? "publish" : manifest.operation === "migrate" ? "migrate" : "create";
  if (operation !== kind) throw new HistoryError("history_manifest_operation_mismatch", "The selected recovery command requires its corresponding manifest authority.");
  return manifest;
};
