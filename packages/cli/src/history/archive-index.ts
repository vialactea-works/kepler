import { Ajv, type AnySchemaObject } from "ajv";
import {
  HistoryError,
  historyDigest,
  safeHistoryRelativePath,
  type HistoryDigest,
  type HistorySourceEntry,
} from "./control.js";
import { canonicalJson } from "./journal.js";
import { parseStrictJson } from "../json/strict-json.js";

export interface HistoryPreviousArchive {
  readonly archive_id: string;
  readonly index_content_version: HistoryDigest | null;
}

export interface HistoryArchiveIndex {
  readonly format: "kepler.mission-history-archive";
  readonly version: 1;
  readonly mission_id: string;
  readonly archive_id: string;
  readonly manifest_hash: HistoryDigest;
  readonly source_inventory: readonly HistorySourceEntry[];
  readonly previous_archives: readonly HistoryPreviousArchive[];
}

const textSchema: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const uuidSchema: AnySchemaObject = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const digestSchema: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const objectSchema = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
const sourceSchema = objectSchema({
  source_id: textSchema,
  origin: textSchema,
  path: textSchema,
  byte_length: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  content_version: digestSchema,
});
const previousArchiveSchema = objectSchema({
  archive_id: uuidSchema,
  index_content_version: { anyOf: [digestSchema, { type: "null" }] },
});
const validateIndex = new Ajv({ strict: true, allErrors: false }).compile<HistoryArchiveIndex>(objectSchema({
  format: { const: "kepler.mission-history-archive" },
  version: { const: 1 },
  mission_id: uuidSchema,
  archive_id: uuidSchema,
  manifest_hash: digestSchema,
  source_inventory: { type: "array", items: sourceSchema },
  previous_archives: { type: "array", items: previousArchiveSchema },
}));

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const fail = (message: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new HistoryError("history_archive_index_invalid", message, details);
};

export const parseHistoryArchiveIndex = (input: unknown): HistoryArchiveIndex => {
  let value = input;
  if (typeof input === "string") {
    const parsed = parseStrictJson(input);
    if (parsed.kind !== "parsed") throw new HistoryError("history_archive_index_invalid", "Archive index must be one strict JSON object.", { reason: parsed });
    value = parsed.value;
  }
  try {
    canonicalJson(value);
  } catch {
    fail("Archive index must contain only JSON values.");
  }
  if (!validateIndex(value)) fail("Archive index does not match its strict version-1 format.", { issues: validateIndex.errors });
  const index = value as HistoryArchiveIndex;
  if (index.source_inventory.some((entry, position) => position > 0 &&
      (compare(index.source_inventory[position - 1]!.source_id, entry.source_id) > 0 ||
       (index.source_inventory[position - 1]!.source_id === entry.source_id && compare(index.source_inventory[position - 1]!.path, entry.path) >= 0)))) {
    fail("Archive source inventory must be sorted by unique source identity and path.");
  }
  if (new Set(index.source_inventory.map((entry) => entry.source_id)).size !== index.source_inventory.length) {
    fail("Archive source identities must identify one file each.");
  }
  for (const entry of index.source_inventory) {
    if (!safeHistoryRelativePath(entry.path)) fail("Archive source paths must be safe relative paths.", { path: entry.path });
  }
  if (index.previous_archives.some((archive, position) => archive.archive_id === index.archive_id ||
      (position > 0 && compare(index.previous_archives[position - 1]!.archive_id, archive.archive_id) >= 0))) {
    fail("Previous archives must be earlier, uniquely identified, and sorted by archive identity.");
  }
  return index;
};

export const historyArchiveIndexDigest = (index: HistoryArchiveIndex): HistoryDigest =>
  historyDigest(canonicalJson(parseHistoryArchiveIndex(index)));
