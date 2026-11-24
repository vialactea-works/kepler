import { parseStrictJson } from "../json/strict-json.js";
import { HistoryError, type HistoryDigest } from "./control.js";
import { canonicalJson } from "./journal.js";

export interface SettledHistoryJournal {
  readonly phase: "construction";
  readonly journal_id: string;
  readonly byte_length: number;
  readonly content_version: HistoryDigest;
}

export interface SettledHistorySource {
  readonly origin_id: string;
  readonly journals: readonly SettledHistoryJournal[];
}

export interface LiveHistoryBinding {
  readonly format: "kepler.mission-history-binding";
  readonly version: 1;
  readonly mission_id: string;
  readonly generation_id: string;
  readonly history_version: string;
  readonly selection_hash: HistoryDigest;
  readonly origins: readonly string[];
  readonly settled_sources?: readonly SettledHistorySource[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const utf8 = new TextDecoder("utf-8", { fatal: true });
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const parseLiveHistoryBinding = (input: Uint8Array): LiveHistoryBinding => {
  let value: unknown;
  try {
    const parsed = parseStrictJson(utf8.decode(input));
    if (parsed.kind !== "parsed") throw new Error("Expected one strict JSON object");
    value = parsed.value;
  } catch (error) { throw new HistoryError("history_binding_invalid", "The shared history binding is damaged. Use raw recovery inspection.", { message: message(error) }); }
  const keys = ["format", "version", "mission_id", "generation_id", "history_version", "selection_hash", "origins"];
  if (!record(value) || ![keys.length, keys.length + 1].includes(Object.keys(value).length) || !keys.every((key) => Object.hasOwn(value, key)) || Object.keys(value).some((key) => !keys.includes(key) && key !== "settled_sources") || value.format !== "kepler.mission-history-binding" || value.version !== 1 || ![value.mission_id, value.generation_id, value.history_version].every((id) => typeof id === "string" && uuid.test(id)) || typeof value.selection_hash !== "string" || !digest.test(value.selection_hash) || !Array.isArray(value.origins) || !value.origins.length || !value.origins.every((id: unknown) => typeof id === "string" && id.trim().length > 0 && id.trim() === id)) throw new HistoryError("history_binding_invalid", "The shared history binding has unsupported fields or identities.");
  const origins = value.origins as string[];
  if (new Set(origins).size !== origins.length || canonicalJson([...origins].sort(compare)) !== canonicalJson(origins)) throw new HistoryError("history_binding_invalid", "Shared history origins must be unique and sorted.");
  let settled_sources: SettledHistorySource[] | undefined;
  if (Object.hasOwn(value, "settled_sources")) {
    if (!Array.isArray(value.settled_sources) || value.settled_sources.length !== origins.length) throw new HistoryError("history_binding_invalid", "Settled source proof must cover every bound origin exactly once.");
    const parsedSources: SettledHistorySource[] = value.settled_sources.map((source: unknown) => {
      if (!record(source) || Object.keys(source).length !== 2 || !Object.hasOwn(source, "origin_id") || !Object.hasOwn(source, "journals") || typeof source.origin_id !== "string" || !origins.includes(source.origin_id) || !Array.isArray(source.journals)) throw new HistoryError("history_binding_invalid", "Settled source proof contains an unsupported origin or shape.");
      const journals: SettledHistoryJournal[] = source.journals.map((journal: unknown) => {
        if (!record(journal) || Object.keys(journal).length !== 4 || !Object.hasOwn(journal, "phase") || !Object.hasOwn(journal, "journal_id") || !Object.hasOwn(journal, "byte_length") || !Object.hasOwn(journal, "content_version") || journal.phase !== "construction" || typeof journal.journal_id !== "string" || !uuid.test(journal.journal_id) || !Number.isSafeInteger(journal.byte_length) || Number(journal.byte_length) < 0 || typeof journal.content_version !== "string" || !digest.test(journal.content_version)) throw new HistoryError("history_binding_invalid", "Settled journal proof has an unsupported identity, length, or digest.");
        return { phase: "construction", journal_id: journal.journal_id, byte_length: Number(journal.byte_length), content_version: journal.content_version as HistoryDigest };
      });
      if (new Set(journals.map((journal) => journal.journal_id)).size !== journals.length || canonicalJson([...journals].sort((left, right) => compare(left.phase, right.phase) || compare(left.journal_id, right.journal_id))) !== canonicalJson(journals)) throw new HistoryError("history_binding_invalid", "Settled source proof must be unique and sorted.");
      return { origin_id: source.origin_id, journals };
    });
    if (new Set(parsedSources.map((source) => source.origin_id)).size !== origins.length || canonicalJson([...parsedSources].sort((left, right) => compare(left.origin_id, right.origin_id))) !== canonicalJson(parsedSources) || canonicalJson(parsedSources.map((source) => source.origin_id)) !== canonicalJson(origins)) throw new HistoryError("history_binding_invalid", "Settled source proof must exactly match the sorted bound origins.");
    settled_sources = parsedSources;
  }
  return { format: "kepler.mission-history-binding", version: 1, mission_id: String(value.mission_id), generation_id: String(value.generation_id), history_version: String(value.history_version), selection_hash: value.selection_hash as HistoryDigest, origins: [...origins], ...(settled_sources ? { settled_sources } : {}) };
};
