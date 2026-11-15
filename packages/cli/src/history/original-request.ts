import { Ajv, type AnySchemaObject } from "ajv";
import { validateConstructionEvent } from "../construction/events.js";
import { parseStrictJson } from "../json/strict-json.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex } from "./archive-index.js";
import { HistoryError, historyDigest, historyManifestDigest, type HistoryControl, type HistoryDigest, type HistoryMaterial, type HistoryRequiredMaterial, type MissionHistoryBinding } from "./control.js";
import type { HistoryCollection } from "./collection.js";
import { canonicalJson, scanJournalBytes } from "./journal.js";
import { missionBindingMatchesCreation, validateCandidateMissionIdentity } from "./reconstruction-binding.js";
import { parseReconstructionPlan, type ReconstructionArchive, type ReconstructionCheck, type ReconstructionPlan } from "./reconstruction.js";

export interface HistoryOriginalRequestConflict {
  readonly reference: string;
  readonly content_version: HistoryDigest;
  readonly source_id: string;
  readonly byte_offset: number;
  readonly byte_length: number;
  readonly event_id: string;
}

export interface HistoryOriginalRequestDocument {
  readonly format: "kepler.history-original-request";
  readonly version: 1;
  readonly mission_binding: MissionHistoryBinding;
  readonly reset_event_id: string;
  readonly generation_id: string;
  readonly original_request: string;
  readonly requester: string;
  readonly decision_reference: string;
  readonly assertion: "exact-original-request-unchanged";
  readonly source_material: readonly HistoryMaterial[];
  readonly conflicting_sources: readonly HistoryOriginalRequestConflict[];
}

export interface HistoryOriginalRequestResolvedMaterial extends HistoryMaterial {
  readonly bytes: Uint8Array;
  readonly source_path: string;
}

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const digest: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const uuid: AnySchemaObject = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const integer: AnySchemaObject = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const binding = object({
  record_home_repository_id: text,
  mission_id: uuid,
  workflow: { const: "standard" },
  request_reference: text,
  unit_ids: { type: "array", uniqueItems: true, items: text },
});
const material = object({ reference: text, content_version: digest });
const conflict = object({ reference: text, content_version: digest, source_id: text, byte_offset: integer, byte_length: integer, event_id: uuid });
const validateOriginalRequest = new Ajv({ strict: true }).compile<HistoryOriginalRequestDocument>(object({
  format: { const: "kepler.history-original-request" },
  version: { const: 1 },
  mission_binding: binding,
  reset_event_id: uuid,
  generation_id: uuid,
  original_request: { type: "string", minLength: 1, pattern: "\\S" },
  requester: text,
  decision_reference: text,
  assertion: { const: "exact-original-request-unchanged" },
  source_material: { type: "array", minItems: 1, items: material },
  conflicting_sources: { type: "array", uniqueItems: true, items: conflict },
}));
const decoder = new TextDecoder("utf-8", { fatal: true });
type StrictJsonValue = null | boolean | number | string | StrictJsonValue[] | { readonly [key: string]: StrictJsonValue };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (reason: string): ReconstructionCheck => ({ status: "invalid", reason });
const strict = (input: unknown): StrictJsonValue => {
  const parsed = parseStrictJson(typeof input === "string" ? input : canonicalJson(input));
  if (parsed.kind !== "parsed") throw new HistoryError("history_original_request_invalid", "Original-request evidence must contain one strict JSON value.");
  return parsed.value as StrictJsonValue;
};

const isHistoryOriginalRequestDocument = (value: unknown): value is HistoryOriginalRequestDocument => validateOriginalRequest(value) === true;

export const parseHistoryOriginalRequestDocument = (input: unknown): HistoryOriginalRequestDocument => {
  const value = strict(input);
  if (!isHistoryOriginalRequestDocument(value)) throw new HistoryError("history_original_request_invalid", "The original-request assertion must match its exact strict version-1 contract.");
  return value;
};

interface JournalCoordinates {
  readonly journal_id: string;
}

interface CreationOccurrence extends HistoryOriginalRequestConflict {
  readonly request: string;
  readonly bound: boolean;
  readonly source_path: string;
  readonly bytes: Uint8Array;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const renderHistoryOriginalRequestStatement = (input: Pick<HistoryOriginalRequestDocument, "requester" | "mission_binding" | "reset_event_id" | "generation_id" | "original_request">): Uint8Array => new TextEncoder().encode([
  "I confirm that this is the exact original request and that the actual work request is unchanged.",
  `Requester: ${canonicalJson(input.requester)}`,
  `Mission: ${input.mission_binding.mission_id}`,
  `Reset: ${input.reset_event_id}`,
  `Generation: ${input.generation_id}`,
  `Original request: ${canonicalJson(input.original_request)}`,
  "",
].join("\n"));

const constructionJournal = (path: string, missionId: string): JournalCoordinates | undefined => {
  const prefix = `.kepler/missions/${missionId}/history/`;
  if (!path.startsWith(prefix) || !path.endsWith(".jsonl")) return undefined;
  const parts = path.slice(prefix.length).split("/");
  if (parts.length === 2 && parts[0] === "construction") {
    const journal = parts[1];
    if (!journal) return undefined;
    const journalId = journal.slice(0, -6);
    return uuidV4.test(journalId) ? { journal_id: journalId } : undefined;
  }
  if (parts.length === 4 && parts[0] === "generations" && parts[2] === "construction") {
    const generation = parts[1];
    const journal = parts[3];
    if (!generation || !journal || !uuidV4.test(generation)) return undefined;
    const journalId = journal.slice(0, -6);
    return uuidV4.test(journalId) ? { journal_id: journalId } : undefined;
  }
  return undefined;
};

const archiveReference = (archiveId: string, sourceId: string): string => `local-archive:${archiveId}/source/${historyDigest(sourceId).slice(7)}.bin`;

const verifyArchive = (reset: HistoryControl, plan: ReconstructionPlan, archive: ReconstructionArchive): readonly CreationOccurrence[] => {
  if (reset.type !== "mission.history-reset" || reset.data.manifest.format !== "kepler.mission-history-reset") throw new HistoryError("history_original_request_scope_invalid", "Original-request recovery requires the exact selected reset.");
  const manifest = reset.data.manifest;
  const index = parseHistoryArchiveIndex(archive.index);
  if (index.mission_id !== plan.mission_id || index.archive_id !== plan.archive_id || index.archive_id !== manifest.archive_id ||
      index.manifest_hash !== historyManifestDigest(manifest) || historyArchiveIndexDigest(index) !== plan.archive_inventory_hash ||
      canonicalJson(index.source_inventory) !== canonicalJson(manifest.source_inventory) ||
      reset.data.mission_id !== plan.mission_id || reset.data.generation_id !== plan.generation_id || reset.id !== plan.reset_event_id) {
    throw new HistoryError("history_original_request_scope_invalid", "The original-request sources are not bound to this reset and verified archive.");
  }
  if (!Array.isArray(archive.files) || archive.files.length !== index.source_inventory.length) throw new HistoryError("history_original_request_archive_invalid", "Original-request recovery requires every indexed archive source exactly once.");
  const filesById = new Map<string, (typeof archive.files)[number]>();
  for (const file of archive.files) {
    if (!file || filesById.has(file.source_id)) throw new HistoryError("history_original_request_archive_invalid", "Archive sources must have unique identities.");
    filesById.set(file.source_id, file);
  }
  const occurrences: CreationOccurrence[] = [];
  for (const entry of index.source_inventory) {
    const file = filesById.get(entry.source_id);
    if (!file || file.origin !== entry.origin || file.path !== entry.path || !(file.bytes instanceof Uint8Array) ||
        file.bytes.length !== entry.byte_length || historyDigest(file.bytes) !== entry.content_version) {
      throw new HistoryError("history_original_request_archive_invalid", "An original-request source differs from its exact archived identity and hash.");
    }
    const coordinates = constructionJournal(file.path, plan.mission_id);
    if (!coordinates) continue;
    const scan = scanJournalBytes(file.bytes);
    for (let lineIndex = 0; lineIndex < scan.lines.length; lineIndex += 1) {
      const line = scan.lines[lineIndex];
      if (!line?.event || scan.problems.some((problem) => problem.line === lineIndex + 1)) continue;
      const validation = validateConstructionEvent(line.event);
      if (validation.status !== "valid" || validation.event.type !== "construction.mission-created" ||
          validation.event.phase !== "construction" || validation.event.journal_id !== coordinates.journal_id) continue;
      const data = validation.event.data;
      const home = data.record_home;
      if (typeof data.mission_id !== "string" || data.mission_id !== manifest.mission_binding.mission_id ||
          !record(home) || typeof home.repository_id !== "string" || home.repository_id !== manifest.mission_binding.record_home_repository_id ||
          data.workflow !== manifest.mission_binding.workflow || typeof data.request !== "string") continue;
      const byteLength = line.byteLength + (line.terminated ? 1 : 0);
      occurrences.push({
        reference: archiveReference(index.archive_id, file.source_id),
        content_version: entry.content_version,
        source_id: file.source_id,
        byte_offset: line.byteOffset,
        byte_length: byteLength,
        event_id: validation.event.id,
        request: data.request,
        bound: missionBindingMatchesCreation(manifest.mission_binding, validation.event),
        source_path: file.path,
        bytes: new Uint8Array(file.bytes),
      });
    }
  }
  return occurrences;
};

const occurrenceKey = (source: Pick<HistoryOriginalRequestConflict, "source_id" | "byte_offset" | "byte_length" | "event_id">): string => canonicalJson({
  source_id: source.source_id,
  byte_offset: source.byte_offset,
  byte_length: source.byte_length,
  event_id: source.event_id,
});
const conflictCarrierMatchesSource = (reference: string, archiveId: string, source: CreationOccurrence): boolean => {
  if (reference === archiveReference(archiveId, source.source_id) || reference === `snapshot:${source.source_id}`) return true;
  const match = reference.match(/^checkpoint:([^/]+)\/((?:[0-9a-f]{40}|[0-9a-f]{64}))\/([^/]+)$/);
  if (!match) return false;
  try {
    const repositoryId = decodeURIComponent(match[1]!);
    const path = decodeURIComponent(match[3]!);
    const canonical = `checkpoint:${encodeURIComponent(repositoryId)}/${match[2]}/${encodeURIComponent(path)}`;
    return reference === canonical && source.source_path === path;
  } catch {
    return false;
  }
};
const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);

const assertionMaterials = (evidence: readonly HistoryOriginalRequestResolvedMaterial[]): readonly { readonly material: HistoryOriginalRequestResolvedMaterial; readonly document: HistoryOriginalRequestDocument }[] => {
  const found: Array<{ readonly material: HistoryOriginalRequestResolvedMaterial; readonly document: HistoryOriginalRequestDocument }> = [];
  for (const material of evidence) {
    let text: string;
    try { text = decoder.decode(material.bytes); } catch { continue; }
    let parsed: unknown;
    const strictResult = parseStrictJson(text);
    if (strictResult.kind === "parsed") parsed = strictResult.value;
    else {
      try { parsed = JSON.parse(text) as unknown; } catch { continue; }
      if (!record(parsed) || parsed.format !== "kepler.history-original-request") continue;
      throw new HistoryError("history_original_request_invalid", "An original-request assertion contains malformed or duplicate-key JSON.");
    }
    if (record(parsed) && parsed.format === "kepler.history-original-request") found.push({ material, document: parseHistoryOriginalRequestDocument(text) });
  }
  if (found.length > 1) throw new HistoryError("history_original_request_conflict", "Required material contains more than one original-request assertion.");
  return found;
};

export const verifyOriginalRequestMaterial = async (input: {
  readonly reset: HistoryControl;
  readonly plan: ReconstructionPlan;
  readonly archive: ReconstructionArchive;
  readonly required_material: HistoryRequiredMaterial;
  readonly evidence: readonly HistoryOriginalRequestResolvedMaterial[];
  readonly history: HistoryCollection;
  readonly readMaterial: (reference: string, expected: HistoryDigest) => Promise<HistoryOriginalRequestResolvedMaterial>;
}): Promise<ReconstructionCheck> => {
  try {
    const reset = input.reset;
    const plan = parseReconstructionPlan(input.plan);
    const occurrences = verifyArchive(reset, plan, input.archive);
    const manifest = reset.data.manifest;
    if (manifest.format !== "kepler.mission-history-reset") return invalid("The selected control is not a reset manifest.");
    validateCandidateMissionIdentity(manifest.mission_binding, input.history, "history_original_request_candidate_invalid");
    const candidateCreations = input.history.events.flatMap((entry) => entry.status === "valid" && entry.constructionEvent?.type === "construction.mission-created" ? [entry.constructionEvent] : []);
    const candidateCreation = candidateCreations[0];
    if (candidateCreations.length !== 1 || !candidateCreation) return invalid("The checked candidate must contain exactly one valid mission creation.");
    const candidateRequestValue = candidateCreation.data.request;
    if (typeof candidateRequestValue !== "string") return invalid("The candidate creation request is not a supported string.");
    const candidateRequest = candidateRequestValue;
    const boundRequests = new Set(occurrences.filter((occurrence) => occurrence.bound).map((occurrence) => occurrence.request));
    const knownRequests = new Set(occurrences.map((occurrence) => occurrence.request));
    const assertions = assertionMaterials(input.evidence);
    const assertionEntry = assertions[0];
    if (!assertionEntry) {
      if (boundRequests.size !== 1 || knownRequests.size !== 1) return invalid("The retained archive does not establish one exact original request without conflicts; a bound B3 assertion is required.");
      const [originalRequest] = boundRequests;
      return candidateRequest === originalRequest
        ? { status: "valid", reference: `verified-original-request:${historyDigest(originalRequest).slice(7)}` }
        : invalid("The candidate request differs from the exact request in the verified original creation; an exact B3 assertion is required.");
    }

    const { material: assertionMaterial, document } = assertionEntry;
    const boundAssertions = input.required_material.evidence.filter((entry) => entry.reference === assertionMaterial.reference);
    const [boundAssertion] = boundAssertions;
    if (boundAssertions.length !== 1 || !boundAssertion || boundAssertion.content_version !== assertionMaterial.content_version) {
      return invalid("The original-request assertion is not uniquely bound by its exact required-material hash.");
    }
    if (canonicalJson(document.mission_binding) !== canonicalJson(manifest.mission_binding) || document.reset_event_id !== reset.id ||
        document.generation_id !== reset.data.generation_id || document.requester !== plan.requester ||
        document.assertion !== "exact-original-request-unchanged") return invalid("The original-request assertion has the wrong requester, mission, reset, generation, or assertion scope.");
    if (document.original_request !== candidateRequest) return invalid("The candidate request differs from the exact string asserted by the requester.");

    const sourceMaterials = new Map<string, HistoryMaterial>();
    for (const item of document.source_material) {
      if (item.reference === assertionMaterial.reference || sourceMaterials.has(item.reference)) return invalid("Original-request source material must be unique and cannot include its own assertion bytes.");
      sourceMaterials.set(item.reference, item);
    }
    const decision = sourceMaterials.get(document.decision_reference);
    if (!decision) return invalid("The retained requester decision must identify exactly one material in the assertion's source material.");
    const resolvedSources = new Map<string, HistoryOriginalRequestResolvedMaterial>();
    for (const item of document.source_material) {
      const resolved = await input.readMaterial(item.reference, item.content_version);
      if (resolved.reference !== item.reference || resolved.content_version !== item.content_version || historyDigest(resolved.bytes) !== item.content_version) return invalid("Original-request source material differs from its exact retained hash.");
      resolvedSources.set(item.reference, resolved);
    }
    const decisionBytes = resolvedSources.get(document.decision_reference)?.bytes;
    if (!decisionBytes || !sameBytes(decisionBytes, renderHistoryOriginalRequestStatement(document))) return invalid("The retained decision source does not contain the exact canonical original-request statement.");

    const expectedConflicts = occurrences.filter((occurrence) => occurrence.request !== document.original_request);
    const expectedByKey = new Map(expectedConflicts.map((occurrence) => [occurrenceKey(occurrence), occurrence]));
    const actualByKey = new Map(document.conflicting_sources.map((conflict) => [occurrenceKey(conflict), conflict]));
    if (expectedByKey.size !== expectedConflicts.length || actualByKey.size !== document.conflicting_sources.length ||
        expectedByKey.size !== actualByKey.size || [...expectedByKey.keys()].some((key) => !actualByKey.has(key))) return invalid("The assertion must identify every and only exact conflicting creation occurrence.");
    for (const [key, occurrence] of expectedByKey) {
      const conflict = actualByKey.get(key);
      if (!conflict || conflict.content_version !== occurrence.content_version) return invalid("A conflicting creation must identify its exact indexed source hash and byte occurrence.");
      const source = await input.readMaterial(conflict.reference, conflict.content_version);
      if (!conflictCarrierMatchesSource(conflict.reference, input.archive.index.archive_id, occurrence) ||
          source.reference !== conflict.reference || source.content_version !== conflict.content_version ||
          source.source_path !== occurrence.source_path || !sameBytes(source.bytes, occurrence.bytes)) return invalid("A conflicting creation reference does not resolve to its exact indexed source identity, path, hash, and bytes.");
      const dispositions = plan.actions.filter((action) => action.source?.source_id === occurrence.source_id && action.source.byte_offset === occurrence.byte_offset && action.source.byte_length === occurrence.byte_length);
      const [disposition] = dispositions;
      if (dispositions.length !== 1 || !disposition || disposition.action === "retain") return invalid("Each conflicting creation occurrence requires its exact non-retain archive disposition.");
    }

    return { status: "valid", reference: `verified-original-request:${historyDigest(candidateRequest).slice(7)}` };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
};
