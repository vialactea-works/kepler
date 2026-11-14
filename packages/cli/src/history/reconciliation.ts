import { Ajv, type AnySchemaObject } from "ajv";
import { HistoryAccess, parseLiveHistoryBinding } from "./access.js";
import { HistoryArchives } from "./archives.js";
import { historyArchiveIndexDigest } from "./archive-index.js";
import {
  HistoryError,
  historyDigest,
  historyManifestMission,
  parseHistoryControl,
  parseHistoryManifest,
  safeHistoryRelativePath,
  type HistoryDigest,
  type HistoryManifest,
  type HistorySourceEntry,
} from "./control.js";
import { parseStrictJson } from "../json/strict-json.js";
import type { HistoryOrigin, HistoryRepositoryContext, HistorySnapshot, HistorySnapshotFile } from "./files.js";
import { canonicalJson, serializeJournalEvent } from "./journal.js";
import { parseHistoryOperationIntent, type HistoryOperationIntent } from "./operation-intent.js";
import { historyInventory } from "./storage.js";
import { parseHistoryDraft } from "./drafts.js";
import { collectHistory } from "./collection.js";
import { historyState } from "./gateway.js";

export const HISTORY_LEAD_RECONCILIATION_FORMAT = "kepler.history-lead-reconciliation" as const;
export const HISTORY_LEAD_RECONCILIATION_PURPOSE = "lead-reconciliation-report";

export interface HistoryLeadReconciliationReport {
  readonly format: typeof HISTORY_LEAD_RECONCILIATION_FORMAT;
  readonly version: 1;
  readonly mission: {
    readonly mission_id: string;
    readonly record_home_repository_id: string;
    readonly workflow: "standard";
    readonly request_reference: string;
  };
  readonly prior_history: {
    readonly generation_id: string;
    readonly history_version: string;
    readonly content_version: HistoryDigest;
  } | null;
  readonly target_generation_id: string;
  readonly attribution: { readonly orchestrator: string; readonly lead: string };
  readonly original_inventory: readonly HistorySourceEntry[];
  readonly original_inventory_hash: HistoryDigest;
  readonly scope_evidence_references: readonly string[];
  readonly affected_workers: readonly {
    readonly run_reference: string;
    readonly terminal_confirmation: {
      readonly outcome: "terminated";
      readonly confirmed_by: string;
      readonly evidence_references: readonly string[];
    };
  }[];
  readonly materials: readonly {
    readonly reference: string;
    readonly purpose: string;
    readonly content_version: HistoryDigest;
  }[];
  readonly effects: {
    readonly files: readonly {
      readonly origin: string;
      readonly path: string;
      readonly outcome: "unchanged" | "retained" | "restored" | "removed" | "reconciled";
      readonly summary: string;
      readonly evidence_references: readonly string[];
    }[];
    readonly repositories: readonly {
      readonly repository_id: string;
      readonly outcome: "unchanged" | "reconciled";
      readonly summary: string;
      readonly evidence_references: readonly string[];
    }[];
    readonly external: readonly {
      readonly effect_id: string;
      readonly outcome: "reconciled";
      readonly summary: string;
      readonly evidence_references: readonly string[];
    }[];
    readonly local_claims: { readonly outcome: "clear" };
  };
  readonly unresolved_items: readonly string[];
  readonly unknown_items: readonly string[];
}

export interface HistoryReconciliationRequest {
  readonly phase: "preview" | "apply";
  readonly recordHome: string;
  readonly manifest: HistoryManifest;
  readonly snapshot: HistorySnapshot;
  readonly intent: HistoryOperationIntent | null;
}

export type HistoryReconciliationResult =
  | { readonly status: "valid"; readonly reference: string; readonly content_version: HistoryDigest }
  | { readonly status: "invalid"; readonly reason: string };

export interface HistoryReconciliationEvidence {
  readonly reference: string;
  readonly content_version: HistoryDigest;
  readonly bytes: Uint8Array;
}

export type HistoryReconciliationEvidenceReader = (reference: string) => Promise<HistoryReconciliationEvidence>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" } satisfies AnySchemaObject;
const text = { type: "string", minLength: 1, pattern: "\\S" } satisfies AnySchemaObject;
const uuidSchema = { type: "string", pattern: uuid.source } satisfies AnySchemaObject;
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: AnySchemaObject, minItems = 0): AnySchemaObject => ({ type: "array", items, minItems });
const nullable = (schema: AnySchemaObject): AnySchemaObject => ({ anyOf: [schema, { type: "null" }] });
const strings = (minItems = 0): AnySchemaObject => ({ ...array(text, minItems), uniqueItems: true });
const sourceSchema = object({
  source_id: text,
  origin: text,
  path: text,
  byte_length: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  content_version: digest,
});
const evidenceReferences = strings(1);
const reportSchema = object({
  format: { const: HISTORY_LEAD_RECONCILIATION_FORMAT },
  version: { const: 1 },
  mission: object({ mission_id: uuidSchema, record_home_repository_id: text, workflow: { const: "standard" }, request_reference: text }),
  prior_history: nullable(object({ generation_id: uuidSchema, history_version: uuidSchema, content_version: digest })),
  target_generation_id: uuidSchema,
  attribution: object({ orchestrator: text, lead: text }),
  original_inventory: array(sourceSchema),
  original_inventory_hash: digest,
  scope_evidence_references: strings(1),
  affected_workers: array(object({
    run_reference: text,
    terminal_confirmation: object({ outcome: { const: "terminated" }, confirmed_by: text, evidence_references: evidenceReferences }),
  })),
  materials: array(object({ reference: text, purpose: text, content_version: digest }), 1),
  effects: object({
    files: array(object({
      origin: text, path: text,
      outcome: { enum: ["unchanged", "retained", "restored", "removed", "reconciled"] },
      summary: text, evidence_references: evidenceReferences,
    })),
    repositories: array(object({
      repository_id: text, outcome: { enum: ["unchanged", "reconciled"] }, summary: text, evidence_references: evidenceReferences,
    })),
    external: array(object({
      effect_id: { type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" },
      outcome: { const: "reconciled" }, summary: text, evidence_references: evidenceReferences,
    })),
    local_claims: object({ outcome: { const: "clear" } }),
  }),
  unresolved_items: strings(),
  unknown_items: strings(),
});
const validateReport = new Ajv({ strict: true, allErrors: false }).compile<HistoryLeadReconciliationReport>(reportSchema);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);
const fail = (reason: string): never => { throw new HistoryError("history_reconciliation_invalid", reason); };
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const sourceKey = (source: Pick<HistorySourceEntry, "source_id" | "origin" | "path">): string => `${source.source_id}\u0000${source.origin}\u0000${source.path}`;
const fileKey = (origin: string, path: string): string => `${origin}\u0000${path}`;
const snapshotReference = (sourceId: string): string => `snapshot:${sourceId}`;
const sourceReference = (reference: string): string | undefined => reference.startsWith("snapshot:") ? reference.slice("snapshot:".length) : undefined;
const missionBase = (missionId: string): string => `.kepler/missions/${missionId}`;
const runtimeBase = (missionId: string): string => `kepler/missions/${missionId}`;
const resetReportPath = (missionId: string, manifest: HistoryManifest): string => {
  const operation = manifest.format === "kepler.mission-history-reset" ? "reset" : manifest.format === "kepler.mission-history-rebuild" ? "publish" : "migrate";
  return `${missionBase(missionId)}/recovery/reconciliation/${operation}-${manifest.generation_id}.json`;
};
const validText = (value: string): boolean => value.trim().length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
const inventoryWithout = (inventory: readonly HistorySourceEntry[], source: HistorySourceEntry): HistorySourceEntry[] => inventory.filter((entry) => sourceKey(entry) !== sourceKey(source)).map((entry) => ({ ...entry }));
const sameInventory = (left: readonly HistorySourceEntry[], right: readonly HistorySourceEntry[]): boolean => canonicalJson(left) === canonicalJson(right);
const sortInventory = (inventory: readonly HistorySourceEntry[]): HistorySourceEntry[] => [...inventory].map((entry) => ({ ...entry })).sort((left, right) => compare(left.source_id, right.source_id) || compare(left.path, right.path));

export const historyLeadReconciliationSnapshotReference = (sourceId: string): string => snapshotReference(sourceId);

export const parseHistoryLeadReconciliationReport = (input: unknown): HistoryLeadReconciliationReport => {
  let value = input;
  if (typeof input === "string") {
    const parsed = parseStrictJson(input);
    if (parsed.kind !== "parsed") return fail("The lead report must be one strict JSON object.");
    value = parsed.value;
  }
  try { value = JSON.parse(canonicalJson(value)) as unknown; } catch { return fail("The lead report must contain only JSON values."); }
  if (!validateReport(value)) return fail("The lead report does not match the strict version-1 format.");
  const report = value as HistoryLeadReconciliationReport;
  const inventory = sortInventory(report.original_inventory);
  if (!sameInventory(inventory, report.original_inventory) || new Set(inventory.map((entry) => entry.source_id)).size !== inventory.length ||
      inventory.some((entry) => !safeHistoryRelativePath(entry.path) || entry.source_id !== `${entry.origin}:${entry.path}`)) return fail("The lead report inventory must use sorted, unique, safe source identities.");
  if (historyDigest(canonicalJson(inventory)) !== report.original_inventory_hash) return fail("The lead report inventory digest does not match its retained source entries.");
  if (new Set(report.affected_workers.map((worker) => worker.run_reference)).size !== report.affected_workers.length ||
      [...report.affected_workers].sort((left, right) => compare(left.run_reference, right.run_reference)).some((worker, index) => worker.run_reference !== report.affected_workers[index]?.run_reference)) return fail("Affected worker references must be unique and sorted.");
  const materials = [...report.materials].sort((left, right) => compare(left.reference, right.reference));
  if (new Set(materials.map((material) => material.reference)).size !== materials.length || canonicalJson(materials) !== canonicalJson(report.materials)) return fail("Retained material references must be unique and sorted.");
  const inventoryByReference = new Map(inventory.map((entry) => [snapshotReference(entry.source_id), entry]));
  const materialByReference = new Map(materials.map((material) => [material.reference, material]));
  const uses = new Set<string>();
  const useEvidence = (references: readonly string[]): void => {
    for (const reference of references) {
      if (!materialByReference.has(reference)) fail("Every evidence reference must name a declared content-bound material.");
      uses.add(reference);
    }
  };
  useEvidence(report.scope_evidence_references);
  for (const worker of report.affected_workers) {
    if (!validText(worker.run_reference) || worker.terminal_confirmation.confirmed_by !== report.attribution.lead) return fail("Each worker termination must be explicitly confirmed by the attributed lead.");
    useEvidence(worker.terminal_confirmation.evidence_references);
  }
  for (const material of materials) {
    if (!validText(material.reference) || sourceReference(material.reference) === undefined || material.reference.startsWith("snapshot:snapshot:")) return fail("Retained materials must use the closed snapshot source-reference grammar.");
    const entry = inventoryByReference.get(material.reference);
    if (!entry || entry.content_version !== material.content_version || entry.byte_length === 0) return fail("Every retained material must bind nonempty inventoried bytes.");
  }
  const fileTargets = report.effects.files.map((effect) => fileKey(effect.origin, effect.path));
  const repositoryTargets = report.effects.repositories.map((effect) => effect.repository_id);
  const externalTargets = report.effects.external.map((effect) => effect.effect_id);
  if (new Set(fileTargets).size !== fileTargets.length || new Set(repositoryTargets).size !== repositoryTargets.length || new Set(externalTargets).size !== externalTargets.length) return fail("Reconciled effect targets must be unique.");
  for (const effect of report.effects.files) {
    if (!safeHistoryRelativePath(effect.path) || !validText(effect.origin)) return fail("File effect coordinates must be safe relative paths and named origins.");
    useEvidence(effect.evidence_references);
  }
  for (const effect of report.effects.repositories) {
    if (!validText(effect.repository_id)) return fail("Repository effect identities must be nonempty.");
    useEvidence(effect.evidence_references);
  }
  for (const effect of report.effects.external) useEvidence(effect.evidence_references);
  if (materials.some((material) => !uses.has(material.reference))) return fail("Every declared retained material must support a reconciliation assertion.");
  if (report.unresolved_items.length || report.unknown_items.length) return fail("The lead report contains unresolved or unknown items.");
  return report;
};

export const serializeHistoryLeadReconciliationReport = (input: unknown): Uint8Array => {
  const report = parseHistoryLeadReconciliationReport(input);
  return encoder.encode(`${canonicalJson(report)}\n`);
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const cloneSnapshot = (input: unknown): HistorySnapshot => {
  if (!record(input) || !exactKeys(input, ["recordHome", "commonDirectory", "missionId", "origins", "files", "unavailable"]) ||
      typeof input.recordHome !== "string" || typeof input.commonDirectory !== "string" || typeof input.missionId !== "string" ||
      !Array.isArray(input.origins) || !Array.isArray(input.files) || !Array.isArray(input.unavailable)) return fail("The request snapshot is not a complete history snapshot.");
  const origins: HistoryOrigin[] = input.origins.map((value): HistoryOrigin => {
    if (!record(value) || !exactKeys(value, ["id", "label", "root"]) || ![value.id, value.label, value.root].every((item) => typeof item === "string")) return fail("The request snapshot contains an invalid physical origin.");
    return { id: value.id as string, label: value.label as string, root: value.root as string };
  });
  const files: HistorySnapshotFile[] = input.files.map((value): HistorySnapshotFile => {
    if (!record(value) || !exactKeys(value, ["sourceId", "origin", "path", "bytes"]) ||
        typeof value.sourceId !== "string" || typeof value.origin !== "string" || typeof value.path !== "string" || !(value.bytes instanceof Uint8Array)) return fail("The request snapshot contains an invalid source file.");
    return { sourceId: value.sourceId, origin: value.origin, path: value.path, bytes: new Uint8Array(value.bytes) };
  });
  const unavailable = input.unavailable.map((value) => {
    if (!record(value) || !exactKeys(value, ["source_id", "path", "kind", "reason"]) ||
        typeof value.source_id !== "string" || typeof value.path !== "string" || !["missing", "unreadable", "unsafe"].includes(String(value.kind)) || typeof value.reason !== "string") return fail("The request snapshot contains an invalid unavailable source.");
    return { source_id: value.source_id, path: value.path, kind: value.kind as HistorySnapshot["unavailable"][number]["kind"], reason: value.reason };
  });
  return { recordHome: input.recordHome, commonDirectory: input.commonDirectory, missionId: input.missionId, origins, files, unavailable };
};

const cloneRequest = (input: unknown): HistoryReconciliationRequest => {
  if (!record(input) || !exactKeys(input, ["phase", "recordHome", "manifest", "snapshot", "intent"]) ||
      !["preview", "apply"].includes(String(input.phase)) || typeof input.recordHome !== "string") return fail("The reconciliation request contains missing or unsupported fields.");
  const manifest = parseHistoryManifest(canonicalJson(input.manifest));
  const intent = input.intent === null ? null : parseHistoryOperationIntent(canonicalJson(input.intent));
  return { phase: input.phase as "preview" | "apply", recordHome: input.recordHome, manifest, snapshot: cloneSnapshot(input.snapshot), intent };
};

const inventoryEntry = (file: HistorySnapshotFile): HistorySourceEntry => ({ source_id: file.sourceId, origin: file.origin, path: file.path, byte_length: file.bytes.length, content_version: historyDigest(file.bytes) });
interface HistorySnapshotDescription {
  readonly recordHome: string;
  readonly commonDirectory: string;
  readonly missionId: string;
  readonly origins: readonly HistoryOrigin[];
  readonly files: readonly HistorySourceEntry[];
  readonly unavailable: readonly { readonly source_id: string; readonly path: string; readonly kind: HistorySnapshot["unavailable"][number]["kind"] }[];
}
const snapshotDescription = (snapshot: HistorySnapshot): HistorySnapshotDescription => ({
  recordHome: snapshot.recordHome,
  commonDirectory: snapshot.commonDirectory,
  missionId: snapshot.missionId,
  origins: [...snapshot.origins].map(({ id, label, root }) => ({ id, label, root })).sort((left, right) => compare(left.id, right.id)),
  files: sortInventory(snapshot.files.map(inventoryEntry)),
  unavailable: snapshot.unavailable.map(({ source_id, path, kind }) => ({ source_id, path, kind })).sort((left, right) => compare(left.source_id, right.source_id)),
});
const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => equalBytes(left, right);

const validateSnapshotScope = (snapshot: HistorySnapshot, context: HistoryRepositoryContext, recordHome: string, missionId: string): ReadonlyMap<string, HistoryOrigin> => {
  if (snapshot.recordHome !== recordHome || context.recordHome !== recordHome || snapshot.commonDirectory !== context.commonDirectory || snapshot.missionId !== missionId) return fail("The snapshot does not match the verified record-home repository and mission.");
  if (context.unavailableOrigins.some((origin) => origin.kind !== "missing")) return fail("An unreadable or unsafe registered repository origin blocks independent reconciliation.");
  for (const origin of context.unavailableOrigins) {
    const sourceId = `${origin.id}:${missionBase(missionId)}`;
    if (!snapshot.unavailable.some((source) => source.source_id === sourceId && source.path === missionBase(missionId) && source.kind === "missing")) return fail("A missing repository origin is not represented by its exact scoped snapshot declaration.");
  }
  const expectedOrigins: HistoryOrigin[] = [...context.origins, { id: "local-runtime", label: "private local runtime", root: context.commonDirectory }];
  const expected = expectedOrigins.map(({ id, label, root }) => ({ id, label, root })).sort((left, right) => compare(left.id, right.id));
  const actual = snapshot.origins.map(({ id, label, root }) => ({ id, label, root })).sort((left, right) => compare(left.id, right.id));
  if (canonicalJson(actual) !== canonicalJson(expected) || new Set(actual.map((origin) => origin.id)).size !== actual.length || new Set(actual.map((origin) => origin.root)).size !== actual.length) return fail("Physical source origins do not match the currently resolved repository roots.");
  const origins = new Map(snapshot.origins.map((origin) => [origin.id, origin]));
  if (!snapshot.origins.some((origin) => origin.root === recordHome) || origins.get("local-runtime")?.root !== context.commonDirectory) return fail("The snapshot has no unique verified record-home and Git-common-directory origins.");
  const sourceIds = new Set<string>();
  const coordinates = new Set<string>();
  for (const file of snapshot.files) {
    const origin = origins.get(file.origin);
    if (!origin || !safeHistoryRelativePath(file.path) || file.sourceId !== `${file.origin}:${file.path}` || sourceIds.has(file.sourceId) || coordinates.has(fileKey(file.origin, file.path))) return fail("The snapshot contains an unsafe, duplicate, or mismatched source identity.");
    const scoped = file.origin === "local-runtime" ? file.path.startsWith(`${runtimeBase(missionId)}/`) : file.path.startsWith(`${missionBase(missionId)}/`);
    if (!scoped) return fail("A snapshot source is outside the selected mission's portable or private scope.");
    sourceIds.add(file.sourceId);
    coordinates.add(fileKey(file.origin, file.path));
  }
  for (const unavailable of snapshot.unavailable) {
    if (!safeHistoryRelativePath(unavailable.path) || unavailable.kind !== "missing") return fail("An unreadable or unsafe source blocks independent reconciliation.");
    const unavailableOrigin = context.unavailableOrigins.find((candidate) => unavailable.source_id === `${candidate.id}:${unavailable.path}`);
    if (unavailableOrigin) {
      if (unavailableOrigin.kind !== "missing" || unavailable.path !== missionBase(missionId)) return fail("A missing repository origin is outside the selected mission scope.");
      continue;
    }
    const origin = snapshot.origins.find((candidate) => unavailable.source_id === `${candidate.id}:${unavailable.path}`);
    if (!origin) return fail("An unavailable source has an unsafe or mismatched identity.");
    const scoped = origin.id === "local-runtime" ? unavailable.path.startsWith(`${runtimeBase(missionId)}/`) : unavailable.path.startsWith(`${missionBase(missionId)}/`);
    if (!scoped) return fail("An unavailable source is outside the selected mission's portable or private scope.");
  }
  return origins;
};

export const createHistoryReconciliationEvidenceReader = (access: HistoryAccess, recordHome: string, snapshotInput: HistorySnapshot): HistoryReconciliationEvidenceReader => {
  const snapshot = cloneSnapshot(snapshotInput);
  return async (reference) => {
    if (!validText(reference)) return fail("An evidence reference must be explicit.");
    const sourceId = sourceReference(reference);
    if (!sourceId) return fail("Evidence references must use the closed snapshot source-reference grammar.");
    const matches = snapshot.files.filter((file) => file.sourceId === sourceId);
    if (matches.length !== 1) return fail("The evidence source is missing or ambiguous in the captured mission snapshot.");
    const file = matches[0]!;
    const context = await access.storage.context(recordHome);
    const origins = validateSnapshotScope(snapshot, context, recordHome, snapshot.missionId);
    const origin = origins.get(file.origin);
    if (!origin || file.bytes.length === 0) return fail("Evidence must resolve to nonempty mission-scoped snapshot bytes.");
    const bytes = await access.storage.files.read({ root: origin.root, relative: file.path }).catch(() => undefined);
    if (!bytes || bytes.length === 0 || !equalBytes(bytes, file.bytes)) return fail("The retained evidence bytes are missing or changed.");
    return { reference, content_version: historyDigest(bytes), bytes: new Uint8Array(bytes) };
  };
};

const checkLocalClaims = (snapshot: HistorySnapshot, missionId: string): void => {
  const coordination = `${runtimeBase(missionId)}/coordination/`;
  const writerPrefix = `${coordination}history-writers/`;
  for (const file of snapshot.files) {
    if (file.origin !== "local-runtime" || !file.path.startsWith(coordination)) continue;
    const rest = file.path.slice(coordination.length);
    if (rest.startsWith("history-writers/")) fail("A registered history writer remains unresolved.");
    const name = rest.split("/")[0]!;
    if (/^[0-9a-f]{64}(?:$|\.)/.test(name)) fail("A local mission claim or release marker remains unresolved.");
    if (rest !== "history-selection.json" && !rest.startsWith("history-writers/")) fail("An unrecognized local coordination record remains unresolved.");
  }
  if (snapshot.unavailable.some((source) => source.path.startsWith(writerPrefix))) fail("A local history-writer record is unavailable for reconciliation.");
};

const operationOutputBytes = (intent: HistoryOperationIntent): readonly { readonly origin: string; readonly path: string; readonly bytes: Uint8Array }[] => {
  const missionId = intent.mission_id;
  const base = `kepler/missions/${missionId}`;
  const controlBytes = encoder.encode(`${serializeJournalEvent(intent.control)}\n`);
  const guardBytes = encoder.encode(`${serializeJournalEvent(intent.guard)}\n`);
  const binding = {
    format: "kepler.mission-history-binding",
    version: 1,
    mission_id: missionId,
    generation_id: intent.generation_id,
    history_version: intent.control.id,
    selection_hash: historyDigest(controlBytes),
    origins: [intent.record_home_origin],
  };
  const encode = (value: unknown): Uint8Array => encoder.encode(`${canonicalJson(value)}\n`);
  return [
    { origin: "local-runtime", path: `${base}/recovery/pending/${intent.key.slice(7)}.json`, bytes: encode(intent) },
    { origin: "local-runtime", path: `${base}/recovery/completed/${intent.key.slice(7)}.json`, bytes: encode(intent) },
    { origin: intent.record_home_origin, path: `.kepler/missions/${missionId}/history/control/events/${intent.control.journal_id}.jsonl`, bytes: controlBytes },
    { origin: intent.record_home_origin, path: `.kepler/missions/${missionId}/history/control/${intent.guard.journal_id}.jsonl`, bytes: guardBytes },
    { origin: intent.record_home_origin, path: `.kepler/missions/${missionId}/history/control/active.json`, bytes: controlBytes },
    { origin: "local-runtime", path: `${base}/coordination/history-selection.json`, bytes: encode(binding) },
    ...intent.candidate_journals.map((candidate) => ({
      origin: intent.record_home_origin,
      path: `.kepler/missions/${missionId}/history/generations/${intent.generation_id}/${candidate.phase}/${candidate.journal_id}.jsonl`,
      bytes: new Uint8Array(Buffer.from(candidate.bytes_base64, "base64")),
    })),
    ...(intent.predecessor ? [{ origin: intent.record_home_origin, path: `.kepler/missions/${missionId}/history/control/events/${intent.predecessor.event.journal_id}.jsonl`, bytes: new Uint8Array(Buffer.from(intent.predecessor.bytes_base64, "base64")) }] : []),
  ];
};

const temporaryOutputMatches = (file: HistorySnapshotFile, output: { readonly origin: string; readonly path: string; readonly bytes: Uint8Array }): boolean => {
  const parts = output.path.split("/");
  const name = parts.pop()!;
  const path = `${parts.join("/")}/.${name}.${historyDigest(output.bytes).slice(7)}.pending`;
  return file.origin === output.origin && file.path === path && file.bytes.length <= output.bytes.length && file.bytes.every((byte, index) => byte === output.bytes[index]);
};

const archivedOriginals = async (access: HistoryAccess, request: HistoryReconciliationRequest): Promise<ReadonlyMap<string, Uint8Array>> => {
  const intent = request.intent;
  if (!intent || !["reset", "migrate"].includes(intent.operation)) return new Map();
  const manifest = intent.control.data.manifest;
  if (manifest.format === "kepler.mission-history-rebuild") return new Map();
  const archive = await new HistoryArchives(access.storage).verify(request.recordHome, intent.mission_id, intent.archive_index.archive_id, {
    manifestHash: intent.archive_index.manifest_hash,
    indexHash: historyArchiveIndexDigest(intent.archive_index),
  });
  return new Map(archive.files.map((file) => [sourceKey({ source_id: file.source_id, origin: file.origin, path: file.path }), new Uint8Array(file.bytes)]));
};

const verifyOriginalInputs = async (access: HistoryAccess, request: HistoryReconciliationRequest, origins: ReadonlyMap<string, HistoryOrigin>): Promise<readonly HistorySourceEntry[]> => {
  const manifest = request.manifest;
  const snapshot = request.snapshot;
  const intent = request.intent;
  const sourceBearingManifest = manifest.format !== "kepler.mission-history-rebuild";
  const actualInventory = historyInventory(snapshot);
  const expectedInventory = intent?.original_sources ?? (sourceBearingManifest ? manifest.source_inventory : actualInventory);
  if (intent && canonicalJson(intent.original_unavailable) !== canonicalJson(snapshot.unavailable)) return fail("The retained operation intent no longer binds the original unavailable-source state.");
  if (sourceBearingManifest && !sameInventory(expectedInventory, manifest.source_inventory)) return fail("The retained operation intent no longer binds the exact manifest inventory.");
  if (!intent && sourceBearingManifest && !sameInventory(actualInventory, manifest.source_inventory)) return fail("The manifest inventory differs from the complete current mission snapshot.");
  const outputs = intent ? operationOutputBytes(intent) : [];
  const actualByCoordinate = new Map(snapshot.files.map((file) => [fileKey(file.origin, file.path), file]));
  const outputByCoordinate = new Map(outputs.map((output) => [fileKey(output.origin, output.path), output]));
  const originalByCoordinate = new Map(expectedInventory.map((source) => [fileKey(source.origin, source.path), source]));
  const retirement = sourceBearingManifest ? manifest.source_retirement : [];
  let archived: ReadonlyMap<string, Uint8Array> | undefined;
  const needArchive = expectedInventory.some((source) => {
    const actual = actualByCoordinate.get(fileKey(source.origin, source.path));
    const output = outputByCoordinate.get(fileKey(source.origin, source.path));
    return (!actual || actual.bytes.length !== source.byte_length || historyDigest(actual.bytes) !== source.content_version) && output !== undefined;
  }) || expectedInventory.some((source) => retirement.some((entry) => entry.source_id === source.source_id && entry.path === source.path) && !actualByCoordinate.has(fileKey(source.origin, source.path)));
  if (needArchive && intent && ["reset", "migrate"].includes(intent.operation)) archived = await archivedOriginals(access, request);
  for (const source of expectedInventory) {
    const actual = actualByCoordinate.get(fileKey(source.origin, source.path));
    const output = outputByCoordinate.get(fileKey(source.origin, source.path));
    const currentMatches = actual?.sourceId === source.source_id && actual.bytes.length === source.byte_length && historyDigest(actual.bytes) === source.content_version;
    if (currentMatches) continue;
    const replacedByOwnOutput = output !== undefined && actual !== undefined && actual.sourceId === source.source_id && sameBytes(actual.bytes, output.bytes);
    const retired = retirement.some((entry) => entry.source_id === source.source_id && entry.path === source.path && entry.byte_length === source.byte_length && entry.content_version === source.content_version);
    const retainedReplacement = intent?.replacement_inputs.find((input) => input.source_id === source.source_id);
    const originalBytes = retainedReplacement ? new Uint8Array(Buffer.from(retainedReplacement.bytes_base64, "base64")) : undefined;
    const archivedBytes = originalBytes && originalBytes.length === source.byte_length && historyDigest(originalBytes) === source.content_version ? originalBytes : archived?.get(sourceKey(source));
    const predecessor = intent?.operation === "publish" && intent.predecessor ? new Uint8Array(Buffer.from(intent.predecessor.bytes_base64, "base64")) : undefined;
    const replacedPredecessor = predecessor !== undefined && actual !== undefined && actual.sourceId === source.source_id && output !== undefined && sameBytes(actual.bytes, output.bytes) && source.path.endsWith("/history/control/active.json") && predecessor.length === source.byte_length && historyDigest(predecessor) === source.content_version;
    if (replacedByOwnOutput && (archivedBytes && archivedBytes.length === source.byte_length && historyDigest(archivedBytes) === source.content_version || replacedPredecessor)) continue;
    if (!actual && retired && archivedBytes && archivedBytes.length === source.byte_length && historyDigest(archivedBytes) === source.content_version) continue;
    return fail("An original source is missing or changed outside the exact retained operation outputs and verified archive.");
  }
  for (const file of snapshot.files) {
    const source = originalByCoordinate.get(fileKey(file.origin, file.path));
    const output = outputByCoordinate.get(fileKey(file.origin, file.path));
    const originalMatches = source?.source_id === file.sourceId && source.byte_length === file.bytes.length && source.content_version === historyDigest(file.bytes);
    const outputMatches = output !== undefined && file.sourceId === `${output.origin}:${output.path}` && sameBytes(output.bytes, file.bytes);
    const temporaryOutput = outputs.find((candidate) => temporaryOutputMatches(file, candidate));
    if (!originalMatches && !outputMatches && !temporaryOutput) return fail("The snapshot contains an unapproved source or a changed operation-owned output.");
    const origin = origins.get(file.origin);
    if (!origin) return fail("A snapshot source has no verified physical origin.");
    const current = await access.storage.files.read({ root: origin.root, relative: file.path }).catch(() => undefined);
    if (!current || !sameBytes(current, file.bytes)) return fail("A source changed after the operation snapshot was captured.");
  }
  for (const unavailable of snapshot.unavailable) {
    if (unavailable.kind !== "missing") return fail("An unavailable source blocks reconciliation.");
    if (manifest.format !== "kepler.mission-history-reset" || !manifest.known_missing_sources.some((missing) => missing.reference === unavailable.source_id)) return fail("A missing source has no exact approved loss declaration.");
  }
  return expectedInventory;
};

const readCurrentPrior = async (access: HistoryAccess, request: HistoryReconciliationRequest): Promise<{ readonly prior: HistoryLeadReconciliationReport["prior_history"]; readonly control?: ReturnType<typeof parseHistoryControl> }> => {
  const missionId = historyManifestMission(request.manifest);
  const context = await access.storage.context(request.recordHome);
  const bindingPath = `${runtimeBase(missionId)}/coordination/history-selection.json`;
  const bindingFile = request.snapshot.files.find((file) => file.origin === "local-runtime" && file.path === bindingPath);
  let binding: ReturnType<typeof parseLiveHistoryBinding> | undefined;
  try { binding = bindingFile ? parseLiveHistoryBinding(bindingFile.bytes) : undefined; } catch { binding = undefined; }
  if (binding?.mission_id !== missionId) binding = undefined;
  const candidates = binding ? context.origins.filter((origin) => binding!.origins.includes(origin.id)) : context.origins.filter((origin) => origin.root === context.recordHome);
  const matched: { readonly prior: NonNullable<HistoryLeadReconciliationReport["prior_history"]>; readonly control: ReturnType<typeof parseHistoryControl> }[] = [];
  const failures: unknown[] = [];
  for (const origin of candidates) {
    const relative = `${missionBase(missionId)}/history/control/active.json`;
    const captured = request.snapshot.files.find((file) => file.origin === origin.id && file.path === relative);
    if (!captured || binding && historyDigest(captured.bytes) !== binding.selection_hash) continue;
    let selection;
    try {
      selection = await access.storage.selection(origin.root, missionId, {
        originIds: new Set([origin.id]),
        ...(binding ? { sharedHistoryVersion: binding.history_version } : {}),
      });
    } catch (error) {
      failures.push(error);
      continue;
    }
    if (!selection.control) continue;
    let bytes: Uint8Array | undefined;
    try { bytes = await access.storage.files.read({ root: origin.root, relative }); } catch (error) { failures.push(error); continue; }
    if (!bytes || !equalBytes(bytes, captured.bytes)) return fail("The selected prior activation changed during reconciliation.");
    let control: ReturnType<typeof parseHistoryControl>;
    try { control = parseHistoryControl(decoder.decode(bytes)); } catch (error) { failures.push(error); continue; }
    if (control.id !== selection.control.id || canonicalJson(control) !== canonicalJson(selection.control)) return fail("The selected prior control differs from its verified physical source.");
    matched.push({ prior: { generation_id: control.data.generation_id, history_version: control.id, content_version: historyDigest(bytes) }, control });
  }
  if (matched.length > 1 && matched.some((item) => canonicalJson(item) !== canonicalJson(matched[0]))) return fail("Registered working copies contain conflicting prior history selections.");
  if (matched.length) return matched[0]!;
  if (failures.length) throw failures[0];
  return { prior: null };
};

const readPrior = async (access: HistoryAccess, request: HistoryReconciliationRequest): Promise<{ readonly prior: HistoryLeadReconciliationReport["prior_history"]; readonly control?: ReturnType<typeof parseHistoryControl> }> => {
  const { manifest, snapshot, intent, recordHome } = request;
  const missionId = historyManifestMission(manifest);
  if (intent && intent.operation !== "migrate") {
    const predecessor = intent.predecessor;
    if (manifest.format === "kepler.mission-history-rebuild") {
      if (!predecessor) return fail("Publication reconciliation requires its exact retained reset control.");
      const control = parseHistoryControl(predecessor.event);
      if (control.type !== "mission.history-reset" || control.id !== manifest.reset_event_id || control.data.generation_id !== manifest.generation_id) return fail("The retained publication predecessor does not match its reset context.");
      return { prior: { generation_id: control.data.generation_id, history_version: control.id, content_version: historyDigest(Buffer.from(predecessor.bytes_base64, "base64")) }, control };
    }
    if (manifest.format === "kepler.mission-history-reset") {
      if (manifest.previous_control.event_id === null) {
        if (predecessor !== null) return fail("The retained reset predecessor conflicts with its approved manifest.");
        return { prior: null };
      }
      if (!predecessor) return fail("The retained reset has no exact verified predecessor bytes.");
      const control = parseHistoryControl(predecessor.event);
      const contentVersion = historyDigest(Buffer.from(predecessor.bytes_base64, "base64"));
      if (control.id !== manifest.previous_control.event_id || contentVersion !== manifest.previous_control.content_version) return fail("The retained reset predecessor differs from its approved history binding.");
      return { prior: { generation_id: control.data.generation_id, history_version: control.id, content_version: contentVersion }, control };
    }
  }
  if (intent?.operation === "migrate") {
    const source = intent.original_sources.find((entry) => entry.path === `${missionBase(missionId)}/history/control/active.json` && entry.origin === intent.record_home_origin);
    if (!source) return { prior: null };
    const current = snapshot.files.find((file) => file.sourceId === source.source_id && file.origin === source.origin && file.path === source.path && file.bytes.length === source.byte_length && historyDigest(file.bytes) === source.content_version);
    let bytes = current?.bytes;
    if (!bytes) {
      const archive = await archivedOriginals(access, request);
      bytes = archive.get(sourceKey(source));
    }
    if (!bytes || bytes.length !== source.byte_length || historyDigest(bytes) !== source.content_version) return fail("The migration archive cannot verify the prior activation bytes.");
    const control = parseHistoryControl(decoder.decode(bytes));
    return { prior: { generation_id: control.data.generation_id, history_version: control.id, content_version: historyDigest(bytes) }, control };
  }
  try {
    const current = await readCurrentPrior(access, request);
    if (!current.control) {
      if (manifest.format === "kepler.mission-history-reset") {
        if (manifest.previous_control.event_id !== null) return fail("The reset's approved prior control cannot be independently verified.");
        const recordOrigin = snapshot.origins.find((origin) => origin.root === recordHome);
        const active = snapshot.files.find((file) => file.origin === recordOrigin?.id && file.path === `${missionBase(missionId)}/history/control/active.json`);
        if (active ? manifest.previous_control.content_version === null || historyDigest(active.bytes) !== manifest.previous_control.content_version : manifest.previous_control.content_version !== null) return fail("The unselected prior activation differs from the reset's exact raw input binding.");
        return { prior: null };
      }
      if (manifest.format === "kepler.mission-history-initialization" && manifest.operation === "migrate" && snapshot.files.some((file) => file.path === `${missionBase(missionId)}/history/control/active.json` || file.origin === "local-runtime" && file.path === `${runtimeBase(missionId)}/coordination/history-selection.json`)) return fail("Migration has an active control or selection binding that cannot be independently verified.");
      return { prior: null };
    }
    const control = current.control;
    if (manifest.format === "kepler.mission-history-reset" && control.id !== manifest.previous_control.event_id) return fail("The live prior history differs from the reset manifest.");
    if (manifest.format === "kepler.mission-history-rebuild" && control.id !== manifest.reset_event_id) return fail("Publication is not based on its exact selected reset.");
    if (manifest.format === "kepler.mission-history-initialization" && manifest.operation === "create") return fail("New-startup initialization cannot use existing recovery history.");
    if (manifest.format === "kepler.mission-history-reset" && current.prior?.content_version !== manifest.previous_control.content_version) return fail("The live prior control bytes differ from the reset manifest.");
    return current;
  } catch (error) {
    if (manifest.format === "kepler.mission-history-reset" && manifest.previous_control.event_id === null) {
      const recordOrigin = snapshot.origins.find((origin) => origin.root === recordHome);
      const active = snapshot.files.find((file) => file.origin === recordOrigin?.id && file.path === `${missionBase(missionId)}/history/control/active.json` && file.bytes.length > 0);
      if (manifest.previous_control.content_version === null && !active) return { prior: null };
      if (active && manifest.previous_control.content_version !== null && historyDigest(active.bytes) === manifest.previous_control.content_version) return { prior: null };
    }
    if (manifest.format === "kepler.mission-history-initialization" && manifest.operation === "migrate" && !snapshot.files.some((file) => file.path === `${missionBase(missionId)}/history/control/active.json`)) return { prior: null };
    return fail(error instanceof Error ? `Prior history could not be independently verified: ${error.message}` : "Prior history could not be independently verified.");
  }
};

const missionBinding = (manifest: HistoryManifest, priorControl?: ReturnType<typeof parseHistoryControl>): { readonly mission_id: string; readonly record_home_repository_id: string; readonly workflow: "standard"; readonly request_reference: string } => {
  if (manifest.format !== "kepler.mission-history-rebuild") return {
    mission_id: manifest.mission_binding.mission_id,
    record_home_repository_id: manifest.mission_binding.record_home_repository_id,
    workflow: manifest.mission_binding.workflow,
    request_reference: manifest.mission_binding.request_reference,
  };
  const priorManifest = priorControl?.data.manifest;
  if (!priorManifest || priorManifest.format === "kepler.mission-history-rebuild") return fail("Publication has no verified mission binding in its selected reset.");
  return {
    mission_id: priorManifest.mission_binding.mission_id,
    record_home_repository_id: priorManifest.mission_binding.record_home_repository_id,
    workflow: priorManifest.mission_binding.workflow,
    request_reference: priorManifest.mission_binding.request_reference,
  };
};

const reportReference = (request: HistoryReconciliationRequest, context: HistoryRepositoryContext): string => {
  const missionId = historyManifestMission(request.manifest);
  const expectedPath = resetReportPath(missionId, request.manifest);
  const recordHomeOrigin = context.origins.find((origin) => origin.root === context.recordHome);
  if (!recordHomeOrigin) return fail("The verified record home has no portable source identity.");
  if (request.manifest.format === "kepler.mission-history-reset" || request.manifest.format === "kepler.mission-history-rebuild") {
    const references = request.manifest.reconciliation.references;
    if (new Set(references.map((item) => item.reference)).size !== references.length) return fail("Reconciliation source references must be unique.");
    const reports = references.filter((item) => item.purpose === HISTORY_LEAD_RECONCILIATION_PURPOSE);
    if (reports.length !== 1) return fail("The manifest must identify exactly one retained lead report.");
    const expected = snapshotReference(`${recordHomeOrigin.id}:${expectedPath}`);
    if (reports[0]!.reference !== expected) return fail("The lead report reference must use its exact portable mission-local source identity.");
    return expected;
  }
  if (request.manifest.operation === "create") return fail("New-startup initialization has no retained mission-local reconciliation input.");
  return snapshotReference(`${recordHomeOrigin.id}:${expectedPath}`);
};

const verifyReportReferences = (request: HistoryReconciliationRequest, reportReferenceValue: string, report: HistoryLeadReconciliationReport): void => {
  const reportSourceId = sourceReference(reportReferenceValue);
  if (!reportSourceId) return fail("The lead report must use a portable snapshot source reference.");
  if (request.manifest.format === "kepler.mission-history-reset" || request.manifest.format === "kepler.mission-history-rebuild") {
    const references = request.manifest.reconciliation.references;
    const reportEntries = references.filter((entry) => entry.reference === reportReferenceValue && entry.purpose === HISTORY_LEAD_RECONCILIATION_PURPOSE);
    if (reportEntries.length !== 1) return fail("The exact lead report reference is absent or ambiguous in the approved manifest.");
    const expected = new Map<string, string>([[reportReferenceValue, HISTORY_LEAD_RECONCILIATION_PURPOSE], ...report.materials.map((material) => [material.reference, material.purpose] as const)]);
    if (expected.size !== references.length || references.some((entry) => expected.get(entry.reference) !== entry.purpose)) return fail("The manifest evidence references do not exactly match the report's retained materials.");
  }
  if (request.manifest.format === "kepler.mission-history-rebuild") {
    const required = request.manifest.required_material.evidence;
    if (new Set(required.map((material) => material.reference)).size !== required.length) return fail("Approved reconstruction evidence references must be unique.");
    const requiredByReference = new Map(required.map((material) => [material.reference, material.content_version]));
    const reportBytes = request.snapshot.files.find((file) => file.sourceId === reportSourceId)?.bytes;
    if (!reportBytes || requiredByReference.get(reportReferenceValue) !== historyDigest(reportBytes)) return fail("The approved reconstruction material must bind the exact lead report bytes.");
    for (const material of report.materials) if (requiredByReference.get(material.reference) !== material.content_version) return fail("Every report material hash must appear in the approved reconstruction evidence inventory.");
  }
};

const selectedDraftSources = (request: HistoryReconciliationRequest): ReadonlySet<string> => {
  const manifest = request.manifest;
  if (manifest.format !== "kepler.mission-history-rebuild" || !manifest.candidate_journals.some((journal) => journal.reference.startsWith("local-draft:"))) return new Set();
  const id = manifest.candidate_journals[0]?.reference.match(/^local-draft:([0-9a-f-]{36})\/construction\/[0-9a-f-]{36}\.jsonl$/)?.[1];
  if (!id || !uuid.test(id)) return fail("Publication has no unambiguous retained draft identity.");
  const base = `${runtimeBase(manifest.mission_id)}/recovery/drafts/${id}`;
  const files = request.snapshot.files.filter((file) => file.origin === "local-runtime");
  const metadata = files.find((file) => file.path === `${base}/draft.json`);
  if (!metadata) return fail("The selected draft has no retained preparation metadata.");
  const draft = parseHistoryDraft(decoder.decode(metadata.bytes));
  if (draft.candidate_id !== id || canonicalJson(draft.manifest) !== canonicalJson(manifest) || !equalBytes(metadata.bytes, encoder.encode(`${canonicalJson(draft)}\n`))) return fail("The selected draft metadata differs from its exact approved candidate.");
  const generated = new Set([metadata.sourceId]);
  const sources = manifest.candidate_journals.map((journal) => {
    if (journal.reference !== `local-draft:${id}/${journal.phase}/${journal.journal_id}.jsonl`) return fail("One publication cannot mix retained draft identities.");
    const file = files.find((file) => file.path === `${base}/${journal.phase}/${journal.journal_id}.jsonl`);
    if (!file || file.bytes.length !== journal.byte_length || historyDigest(file.bytes) !== journal.content_version) return fail("A selected draft journal differs from its approved exact bytes.");
    generated.add(file.sourceId);
    return { sourceId: file.sourceId, missionId: manifest.mission_id, generationId: manifest.generation_id, phase: journal.phase, journalId: journal.journal_id, bytes: new Uint8Array(file.bytes) };
  });
  if (canonicalJson(historyState(collectHistory(manifest.mission_id, sources, { completeness: "complete", generationId: manifest.generation_id }))) !== canonicalJson(manifest.expected_state)) return fail("The retained draft does not establish its approved normal workflow state.");
  return generated;
};

const verifyReport = async (access: HistoryAccess, request: HistoryReconciliationRequest, context: HistoryRepositoryContext, origins: ReadonlyMap<string, HistoryOrigin>, originalInventory: readonly HistorySourceEntry[], prior: HistoryLeadReconciliationReport["prior_history"], priorControl?: ReturnType<typeof parseHistoryControl>): Promise<HistoryReconciliationResult> => {
  const manifest = request.manifest;
  const missionId = historyManifestMission(manifest);
  const reference = reportReference(request, context);
  const sourceId = sourceReference(reference)!;
  const matches = request.snapshot.files.filter((file) => file.sourceId === sourceId);
  if (matches.length !== 1) return fail("The retained lead report is missing or ambiguous in the mission snapshot.");
  const file = matches[0]!;
  const expectedPath = resetReportPath(missionId, manifest);
  const recordHomeOrigin = context.origins.find((origin) => origin.root === context.recordHome)!;
  if (file.origin !== recordHomeOrigin.id || file.path !== expectedPath || file.bytes.length === 0) return fail("The lead report is not a nonempty report at its canonical mission-local path.");
  const reportSource = inventoryEntry(file);
  const expectedReportInventory = sortInventory(originalInventory);
  if (!expectedReportInventory.some((source) => sourceKey(source) === sourceKey(reportSource) && source.byte_length === reportSource.byte_length && source.content_version === reportSource.content_version)) return fail("The retained lead report is not bound by the original input inventory.");
  const reportBytes = await access.storage.files.read({ root: recordHomeOrigin.root, relative: expectedPath }).catch(() => undefined);
  if (!reportBytes || reportBytes.length === 0 || !equalBytes(reportBytes, file.bytes)) return fail("The retained lead report changed or cannot be reread.");
  let parsed: unknown;
  try {
    const raw = decoder.decode(reportBytes);
    const strict = parseStrictJson(raw);
    if (strict.kind !== "parsed") return fail("The lead report is not strict JSON.");
    parsed = strict.value;
    const report = parseHistoryLeadReconciliationReport(parsed);
    if (raw !== `${canonicalJson(report)}\n`) return fail("The lead report bytes must use canonical JSON followed by one line ending.");
    const draftSources = selectedDraftSources(request);
    if (!sameInventory(sortInventory(inventoryWithout(expectedReportInventory, reportSource).filter((source) => !draftSources.has(source.source_id))), report.original_inventory)) return fail("The lead report inventory differs from the complete originals apart from its own bytes and the exact selected compiler output.");
    if (![report.attribution.orchestrator, report.attribution.lead, report.mission.record_home_repository_id, report.mission.request_reference].every(validText)) return fail("The lead report attribution and mission binding must be explicit.");
    if (report.mission.mission_id !== missionId || report.target_generation_id !== manifest.generation_id ||
        canonicalJson(report.mission) !== canonicalJson(missionBinding(manifest, priorControl)) || canonicalJson(report.prior_history) !== canonicalJson(prior)) return fail("The lead report mission, prior history, or target generation differs from verified history scope.");
    const orchestrator = manifest.format === "kepler.mission-history-reset" || manifest.format === "kepler.mission-history-rebuild" ? manifest.reconciliation.orchestrator : undefined;
    if (orchestrator !== undefined && report.attribution.orchestrator !== orchestrator) return fail("The lead report attribution differs from the approved orchestrator identity.");
    const declaredRuns = manifest.format === "kepler.mission-history-reset" || manifest.format === "kepler.mission-history-rebuild" ? manifest.reconciliation.run_references : [];
    if (canonicalJson([...report.affected_workers].map((worker) => worker.run_reference).sort(compare)) !== canonicalJson([...declaredRuns].sort(compare))) return fail("The lead report does not cover exactly the manifest's affected worker run references.");
    if (report.effects.local_claims.outcome !== "clear") return fail("Local coordination claims are not reconciled.");
    verifyReportReferences(request, reference, report);
    const sourceEntries = new Map(report.original_inventory.map((entry) => [snapshotReference(entry.source_id), entry]));
    const readEvidence = createHistoryReconciliationEvidenceReader(access, request.recordHome, request.snapshot);
    for (const material of report.materials) {
      const evidenceSourceId = sourceReference(material.reference);
      if (!evidenceSourceId) return fail("Retained evidence must use portable snapshot source identities.");
      const candidates = request.snapshot.files.filter((candidate) => candidate.sourceId === evidenceSourceId);
      if (candidates.length !== 1) return fail("A retained evidence source is missing or ambiguous.");
      const evidenceFile = candidates[0]!;
      const entry = sourceEntries.get(material.reference);
      if (!entry || sourceKey(entry) !== sourceKey(inventoryEntry(evidenceFile)) || entry.byte_length !== evidenceFile.bytes.length || entry.content_version !== material.content_version || evidenceFile.bytes.length === 0) return fail("Retained evidence bytes do not match the report's original inventory and content hash.");
      const retained = await readEvidence(material.reference);
      if (retained.content_version !== material.content_version || !equalBytes(retained.bytes, evidenceFile.bytes)) return fail("Retained evidence bytes are missing or changed.");
    }
    for (const effect of report.effects.files) {
      const unavailable = context.unavailableOrigins.some((origin) => origin.id === effect.origin && origin.kind === "missing" && request.snapshot.unavailable.some((source) => source.source_id === `${origin.id}:${missionBase(missionId)}` && source.path === missionBase(missionId) && source.kind === "missing"));
      if (!origins.has(effect.origin) && !unavailable) return fail("A file effect names an origin outside the verified repository scope.");
    }
    return { status: "valid", reference, content_version: historyDigest(reportBytes) };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The lead report could not be validated.");
  }
};

const validatePriorBinding = (manifest: HistoryManifest, priorControl?: ReturnType<typeof parseHistoryControl>): void => {
  if (!priorControl || manifest.format === "kepler.mission-history-rebuild") return;
  if (priorControl.data.mission_id !== historyManifestMission(manifest)) return fail("Prior history belongs to another mission.");
  const previousManifest = priorControl.data.manifest;
  if (previousManifest.format === "kepler.mission-history-rebuild") return;
  if (canonicalJson(previousManifest.mission_binding) !== canonicalJson(manifest.mission_binding)) return fail("The proposed operation changes the established mission binding.");
};

const verify = async (access: HistoryAccess, request: HistoryReconciliationRequest): Promise<HistoryReconciliationResult> => {
  const missionId = historyManifestMission(request.manifest);
  if (request.snapshot.missionId !== missionId) return fail("The request mission and raw snapshot identities differ.");
  if (request.intent && request.phase !== "apply") return fail("A retained operation intent is valid only for fenced apply verification.");
  if (request.intent && (request.intent.mission_id !== missionId || request.intent.generation_id !== request.manifest.generation_id || canonicalJson(request.intent.control.data.manifest) !== canonicalJson(request.manifest))) return fail("The retained operation intent belongs to another manifest, mission, or generation.");
  const context = await access.storage.context(request.recordHome);
  const origins = validateSnapshotScope(request.snapshot, context, request.recordHome, missionId);
  if (request.intent && request.intent.record_home_origin !== [...origins.values()].find((origin) => origin.root === context.recordHome)?.id) return fail("The retained operation intent belongs to another verified record-home origin.");
  checkLocalClaims(request.snapshot, missionId);
  if (request.phase === "preview") {
    const fresh = await access.storage.snapshot(request.recordHome, missionId);
    if (canonicalJson(snapshotDescription(fresh)) !== canonicalJson(snapshotDescription(request.snapshot))) return fail("The read-only preview snapshot changed during reconciliation.");
  }
  const originalInventory = await verifyOriginalInputs(access, request, origins);
  const current = await readPrior(access, request);
  validatePriorBinding(request.manifest, current.control);
  return verifyReport(access, request, context, origins, originalInventory, current.prior, current.control);
};

export const createNodeHistoryReconciliation = (access: HistoryAccess): ((request: HistoryReconciliationRequest) => Promise<HistoryReconciliationResult>) => async (input) => {
  try {
    return await verify(access, cloneRequest(input));
  } catch (error) {
    return { status: "invalid", reason: error instanceof Error ? error.message : "History reconciliation could not be verified." };
  }
};
