import type { EventEnvelope } from "@vialactea-works/kepler-core";
import { projectConstruction } from "../construction/projection.js";
import { parseStrictJson } from "../json/strict-json.js";
import { collectHistory, type HistoryCollection, type HistoryJournalSource } from "./collection.js";
import { HistoryError, historyDigest, historyMode, parseHistoryControl, parseHistoryGuard, type HistoryControl } from "./control.js";
import { canonicalJson, scanJournalBytes } from "./journal.js";

export interface HistoryControlJournal {
  readonly journalId: string;
  readonly bytes: Uint8Array;
}

export interface HistoryGenerationSource extends HistoryJournalSource {
  readonly generationId: string;
}

export interface HistoryGatewayInput {
  readonly missionId: string;
  readonly activation: Uint8Array | null;
  readonly controlJournals: readonly HistoryControlJournal[];
  readonly guardJournals: readonly HistoryControlJournal[];
  readonly generationSources: readonly HistoryGenerationSource[];
  readonly legacySources: readonly HistoryJournalSource[];
  readonly generationEvidence: boolean;
  readonly complete: boolean;
  readonly pendingRecovery: boolean;
  readonly sharedHistoryVersion?: string;
}

export interface MissionHistoryView {
  readonly missionId: string;
  readonly mode: "legacy" | "active" | "recovering";
  readonly generationId?: string;
  readonly historyVersion?: string;
  readonly control?: HistoryControl;
  readonly controlReceipts: readonly HistoryControl[];
  readonly sources: readonly HistoryJournalSource[];
  readonly history: HistoryCollection;
  readonly pendingRecovery: boolean;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);
const prefix = (shorter: Uint8Array, longer: Uint8Array): boolean => shorter.length <= longer.length && shorter.every((byte, index) => byte === longer[index]);

const envelopeFromJournal = (journal: HistoryControlJournal): EventEnvelope => {
  const scan = scanJournalBytes(journal.bytes);
  if (scan.problems.length || scan.lines.length !== 1 || !scan.lines[0]?.event) throw new HistoryError("history_control_invalid", "A control journal must contain one complete event.", { journal_id: journal.journalId });
  const event = scan.lines[0].event;
  if (!uuid.test(journal.journalId) || event.journal_id !== journal.journalId) throw new HistoryError("history_control_invalid", "A control journal has mismatched identity.", { journal_id: journal.journalId });
  return event;
};

const requiredControl = (journals: readonly HistoryControlJournal[], id: string, digest?: string): HistoryControl => {
  const matching = journals.flatMap((journal) => scanJournalBytes(journal.bytes).lines.flatMap((line) => {
    if (line.raw === undefined) return [];
    const parsed = parseStrictJson(line.raw);
    return parsed.kind === "parsed" && record(parsed.value) && parsed.value.id === id ? [journal] : [];
  }));
  if (matching.length > 1) throw new HistoryError("history_control_conflict", "A selected or required control identity has multiple recorded claims.", { event_id: id });
  if (matching.length === 0) throw new HistoryError("history_control_missing", "A required control event is unavailable.", { event_id: id });
  if (digest !== undefined && historyDigest(matching[0]!.bytes) !== digest) throw new HistoryError("history_control_conflict", "A required prior control no longer matches its recorded byte hash.", { event_id: id });
  return parseHistoryControl(envelopeFromJournal(matching[0]!));
};

export const mergeGenerationSources = (sources: readonly HistoryGenerationSource[], missionId: string, generationId: string): readonly HistoryJournalSource[] => {
  const selected = new Map<string, HistoryGenerationSource>();
  for (const source of sources) {
    if (source.generationId !== generationId) continue;
    if (source.missionId !== missionId || source.phase !== "construction" || !uuid.test(source.journalId)) throw new HistoryError("history_source_invalid", "A selected journal has unsupported phase or mismatched ownership.", { source_id: source.sourceId });
    const key = `${source.phase}/${source.journalId}`;
    const previous = selected.get(key);
    if (!previous || prefix(previous.bytes, source.bytes)) selected.set(key, source);
    else if (!prefix(source.bytes, previous.bytes)) throw new HistoryError("history_journal_conflict", "Current copies of a selected journal have contradictory bytes.", { journal_id: source.journalId, source_ids: [previous.sourceId, source.sourceId] });
  }
  return [...selected.values()].sort((a, b) => a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : a.journalId < b.journalId ? -1 : a.journalId > b.journalId ? 1 : 0);
};

const verifyGuard = (input: HistoryGatewayInput, root: HistoryControl): void => {
  const matches = input.guardJournals.filter((journal) => {
    try {
      const parsed = parseStrictJson(utf8.decode(journal.bytes));
      return parsed.kind === "parsed" && record(parsed.value) && record(parsed.value.data) && parsed.value.data.control_event_id === root.id;
    } catch { return false; }
  });
  if (matches.length !== 1) throw new HistoryError("history_guard_missing", "The required older-reader guard is missing or ambiguous.", { control_event_id: root.id });
  parseHistoryGuard(envelopeFromJournal(matches[0]!), root);
};

export interface HistoryControlSelection extends Omit<MissionHistoryView, "sources" | "history"> {
  readonly rootControl?: HistoryControl;
}

export const selectHistoryControl = (input: HistoryGatewayInput): HistoryControlSelection => {
  if (!uuid.test(input.missionId)) throw new HistoryError("history_scope_invalid", "The mission requires a full lowercase UUIDv4 identity.");
  if (!input.complete) throw new HistoryError("history_source_incomplete", "Current history source coverage is incomplete.");
  if (input.activation === null) {
    if (input.generationEvidence || input.generationSources.length || input.controlJournals.length || input.guardJournals.length || input.sharedHistoryVersion || input.pendingRecovery) throw new HistoryError("history_selection_missing", "Generation or recovery evidence exists without an active selection. Preserve it and inspect recovery status.");
    if (input.legacySources.some((source) => source.phase !== "construction" || source.generationId !== undefined)) throw new HistoryError("history_phase_unsupported", "Legacy history includes an unsupported phase or generation.");
    return {
      missionId: input.missionId, mode: "legacy", controlReceipts: [], pendingRecovery: false,
    };
  }
  let control: HistoryControl;
  try { control = parseHistoryControl(utf8.decode(input.activation)); } catch (error) {
    throw new HistoryError("history_control_invalid", "The active history selection is damaged or unsupported. Use raw recovery inspection.", { message: error instanceof Error ? error.message : String(error) });
  }
  if (control.data.mission_id !== input.missionId) throw new HistoryError("history_scope_invalid", "The activation record belongs to another mission.");
  if (input.sharedHistoryVersion !== undefined && input.sharedHistoryVersion !== control.id) throw new HistoryError("history_stale_checkout", "This working copy does not have the effective shared history version.", { local_history_version: control.id, shared_history_version: input.sharedHistoryVersion });
  const matching = input.controlJournals.filter((journal) => journal.journalId === control.journal_id);
  if (matching.length !== 1 || !equalBytes(matching[0]!.bytes, input.activation)) throw new HistoryError("history_control_conflict", "The activation bytes do not match the one recorded control journal.");
  const recorded = parseHistoryControl(envelopeFromJournal(matching[0]!));
  if (recorded.id !== control.id) throw new HistoryError("history_control_conflict", "The activation event identity does not match its journal.");
  requiredControl(input.controlJournals, control.id, historyDigest(input.activation));
  let root = control;
  const receipts: HistoryControl[] = [control];
  if (control.type === "mission.history-rebuilt") {
    const manifest = control.data.manifest;
    if (manifest.format !== "kepler.mission-history-rebuild") throw new HistoryError("history_control_invalid", "A rebuilt selection has the wrong manifest.");
    root = requiredControl(input.controlJournals, manifest.reset_event_id);
    if (root.type !== "mission.history-reset" || root.data.mission_id !== input.missionId || root.data.generation_id !== control.data.generation_id) throw new HistoryError("history_control_invalid", "The rebuilt selection has a mismatched reset context.");
    receipts.unshift(root);
  }
  if (root.type === "mission.history-reset" && root.data.manifest.format === "kepler.mission-history-reset" && root.data.manifest.previous_control.event_id !== null) {
    const previous = requiredControl(input.controlJournals, root.data.manifest.previous_control.event_id, root.data.manifest.previous_control.content_version ?? undefined);
    if (previous.data.mission_id !== input.missionId) throw new HistoryError("history_scope_invalid", "The prior control belongs to another mission.");
    if (previous.data.generation_id === root.data.generation_id) throw new HistoryError("history_generation_reused", "A reset cannot reuse its verified predecessor's generation.");
    receipts.unshift(previous);
  }
  verifyGuard(input, root);
  return { missionId: input.missionId, mode: historyMode(control), generationId: control.data.generation_id, historyVersion: control.id, control, rootControl: root, controlReceipts: receipts, pendingRecovery: input.pendingRecovery };
};

export const selectMissionHistory = (input: HistoryGatewayInput): MissionHistoryView => {
  const selection = selectHistoryControl(input);
  if (selection.mode === "legacy") return { ...selection, sources: input.legacySources, history: collectHistory(input.missionId, input.legacySources, { completeness: "complete" }) };
  const control = selection.control!;
  const { mode } = selection;
  const sources = mode === "recovering" ? [] : mergeGenerationSources(input.generationSources, input.missionId, control.data.generation_id);
  const history = collectHistory(input.missionId, sources, { completeness: "complete", generationId: control.data.generation_id });
  if (mode === "active") {
    const manifest = control.data.manifest;
    if (manifest.format === "kepler.mission-history-reset") throw new HistoryError("history_control_invalid", "An active selection cannot use a reset manifest.");
    const prefixes: HistoryJournalSource[] = [];
    for (const expected of manifest.candidate_journals) {
      const source = sources.find((item) => item.phase === expected.phase && item.journalId === expected.journal_id);
      if (!source || source.bytes.length < expected.byte_length || historyDigest(source.bytes.subarray(0, expected.byte_length)) !== expected.content_version) throw new HistoryError("history_original_prefix_changed", "A published initial journal prefix is missing or changed.", { journal_id: expected.journal_id });
      prefixes.push({ ...source, bytes: source.bytes.subarray(0, expected.byte_length) });
    }
    const published = collectHistory(input.missionId, prefixes, { completeness: "complete", generationId: control.data.generation_id });
    if (canonicalJson(historyState(published)) !== canonicalJson(manifest.expected_state)) throw new HistoryError("history_expected_state_mismatch", "The published journal prefixes do not establish the approved initial state.");
    if (control.type === "mission.history-initialized" && manifest.format === "kepler.mission-history-initialization") {
      const creation = published.events.find((item) => item.event?.id === control.caused_by[0] && item.status === "valid")?.constructionEvent;
      if (!creation || creation.type !== "construction.mission-created" || creation.data.mission_id !== input.missionId) throw new HistoryError("history_initial_creation_missing", "The initial selection requires its valid published mission-creation event.");
      const binding = manifest.mission_binding;
      const home = creation.data.record_home;
      const contexts = creation.data.contexts;
      if (!record(home) || !Array.isArray(contexts) || home.repository_id !== binding.record_home_repository_id || creation.data.workflow !== binding.workflow || !(creation.data.request === binding.request_reference || `event:${creation.id}` === binding.request_reference || contexts.some((item: unknown) => record(item) && item.reference === binding.request_reference))) throw new HistoryError("history_initial_binding_mismatch", "The published creation fact does not establish the initial mission binding.");
      const unknownUnits = published.events.flatMap((item) => {
        const id = item.constructionEvent?.type === "construction.unit-created" ? item.constructionEvent.data.unit_id : undefined;
        return typeof id === "string" && !binding.unit_ids.includes(id) ? [id] : [];
      });
      if (unknownUnits.length) throw new HistoryError("history_initial_binding_mismatch", "Published units are absent from their known mission identities.", { unit_ids: unknownUnits });
    }
    const controlIds = new Set(selection.controlReceipts.map((receipt) => receipt.id));
    if (history.events.some((item) => item.event && controlIds.has(item.event.id))) throw new HistoryError("history_event_identity_conflict", "A phase event reuses a selected control identity.");
  }
  return { ...selection, sources, history };
};

const withoutSourceCoordinates = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutSourceCoordinates);
  if (!record(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 5 && ["sourceId", "journalId", "line", "byteOffset", "event"].every((key) => Object.hasOwn(value, key))) return { event: value.event };
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutSourceCoordinates(item)]));
};

export const historyState = (history: HistoryCollection): Readonly<Record<string, unknown>> => {
  const projection = projectConstruction(history);
  if (projection.blocked || history.issues.length) throw new HistoryError("history_candidate_invalid", "The proposed history does not satisfy normal history and projection guards.", { history_issues: history.issues, projection_issues: projection.projectionIssues });
  const state = withoutSourceCoordinates(projection);
  if (!record(state)) throw new HistoryError("history_candidate_invalid", "The phase projection did not produce a state object.");
  return state;
};

