import { createHash } from "node:crypto";
import type { EventEnvelope } from "@vialactea-works/kepler-core";
import type { HistoryCollection } from "../history/collection.js";
import type { AuditContextResolver } from "./context.js";
import { serializeJournalEvent } from "../history/journal.js";
import { constructionActivities, constructionStages, type ScopeSelectors } from "../cli/scope-selectors.js";

const envelopeFields = [
  "id",
  "phase",
  "type",
  "envelope_version",
  "event_version",
  "journal_id",
  "recorded_at",
  "producer",
  "caused_by",
  "data",
] as const;

type EnvelopeField = (typeof envelopeFields)[number];

export interface AuditListOptions {
  readonly selectors: ScopeSelectors;
  readonly type?: string;
  readonly fields?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface AuditQueryResult {
  readonly kind: "success" | "failed";
  readonly data: Readonly<Record<string, unknown>>;
}

interface JournalSnapshot {
  readonly journal_id: string;
  readonly count: number;
  readonly digest: string;
}

interface CursorPayload {
  readonly version: 1;
  readonly query: string;
  readonly offset: number;
  readonly journals: readonly JournalSnapshot[];
}

const failed = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}): AuditQueryResult => ({
  kind: "failed",
  data: {
    code,
    message,
    details,
    recovery: "Correct the audit query or select an unexpired cursor for the same scope and filters.",
  },
});

const compare = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

const validateLimit = (value: number | undefined): number | AuditQueryResult => {
  const limit = value ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return failed("invalid_audit_limit", "Audit list limit must be a positive integer no greater than 1000.", { limit: value, maximum: 1000 });
  }
  return limit;
};

const validateFields = (value: string | undefined): readonly EnvelopeField[] | AuditQueryResult => {
  if (value === undefined) return ["id", "journal_id", "phase", "type", "recorded_at"];
  if (value.length === 0) return failed("invalid_audit_fields", "The audit field list must not be empty.");
  const fields = value.split(",");
  if (new Set(fields).size !== fields.length) return failed("invalid_audit_fields", "The audit field list cannot contain duplicates.", { fields });
  const unknown = fields.filter((field) => !envelopeFields.includes(field as EnvelopeField));
  if (unknown.length > 0) return failed("invalid_audit_fields", "The audit field list contains an unknown event envelope field.", { fields: unknown });
  return [...new Set(["id", "journal_id", ...fields])] as EnvelopeField[];
};

const queryKey = (missionId: string, options: AuditListOptions, fields: readonly EnvelopeField[], limit: number): string => digest(JSON.stringify({
  mission: missionId,
  unit: options.selectors.unit,
  stage: options.selectors.stage,
  task: options.selectors.task,
  activity: options.selectors.activity,
  attempt: options.selectors.attempt,
  implementation_attempt: options.selectors.implementationAttempt,
  type: options.type,
  fields,
  limit,
}));

const matchingEvents = (history: HistoryCollection, selectors: ScopeSelectors, eventType?: string): readonly { readonly journalId: string; readonly line: number; readonly event: EventEnvelope }[] =>
  history.events.flatMap((record) => {
    const event = record.event;
    if (record.status !== "valid" || !event || event.data.unit_id !== selectors.unit) return [];
    const data = event.data;
    if (selectors.stage !== undefined && data.stage !== selectors.stage) return [];
    if (selectors.task !== undefined && data.task_id !== selectors.task) return [];
    if (selectors.activity !== undefined && data.activity !== selectors.activity) return [];
    if (selectors.implementationAttempt !== undefined && data.stage_attempt_id !== selectors.implementationAttempt) return [];
    if (selectors.attempt !== undefined) {
      const selected = selectors.activity === undefined ? data.stage_attempt_id : data.activity_attempt_id;
      if (selected !== selectors.attempt) return [];
    }
    if (eventType !== undefined && event.type !== eventType) return [];
    return [{ journalId: record.journalId, line: record.line, event }];
  }).sort((left, right) => compare(left.journalId, right.journalId) || left.line - right.line);

const snapshotFor = (events: readonly { readonly journalId: string; readonly event: EventEnvelope }[]): readonly JournalSnapshot[] => {
  const grouped = new Map<string, EventEnvelope[]>();
  for (const item of events) grouped.set(item.journalId, [...(grouped.get(item.journalId) ?? []), item.event]);
  return [...grouped.entries()].sort(([left], [right]) => compare(left, right)).map(([journalId, journalEvents]) => ({
    journal_id: journalId,
    count: journalEvents.length,
    digest: digest(journalEvents.map(serializeJournalEvent).join("\n")),
  }));
};

const packCursor = (payload: CursorPayload): string => {
  const json = JSON.stringify(payload);
  return `${Buffer.from(json, "utf8").toString("base64url")}.${digest(json)}`;
};

const unpackCursor = (token: string): CursorPayload | undefined => {
  const separator = token.lastIndexOf(".");
  if (separator < 1) return undefined;
  try {
    const json = Buffer.from(token.slice(0, separator), "base64url").toString("utf8");
    if (digest(json) !== token.slice(separator + 1)) return undefined;
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const payload = value as Partial<CursorPayload>;
    if (payload.version !== 1 || typeof payload.query !== "string" || !Number.isInteger(payload.offset) ||
        (payload.offset ?? -1) < 0 || !Array.isArray(payload.journals) || payload.journals.some((item) =>
          typeof item !== "object" || item === null || typeof item.journal_id !== "string" ||
          !Number.isInteger(item.count) || (item.count as number) < 0 || typeof item.digest !== "string")) return undefined;
    return payload as CursorPayload;
  } catch {
    return undefined;
  }
};

const isQueryResult = (value: unknown): value is AuditQueryResult =>
  typeof value === "object" && value !== null && "kind" in value && "data" in value;

const projectEvent = (event: EventEnvelope, fields: readonly EnvelopeField[]): Readonly<Record<string, unknown>> =>
  Object.fromEntries(fields.map((field) => [field, event[field]]));

const validateSelectedOwnership = (history: HistoryCollection, selectors: ScopeSelectors): AuditQueryResult | undefined => {
  const unit = history.events.some((record) => record.status === "valid" && record.event?.type === "construction.unit-created" &&
    record.event.data.unit_id === selectors.unit);
  if (!unit) return failed("audit_scope_mismatch", "The selected unit has no validated creation record.", { unit_id: selectors.unit });
  if (selectors.stage && !constructionStages.includes(selectors.stage)) return failed("invalid_stage", "The selected stage is not supported.", { stage: selectors.stage });
  if (selectors.activity && !constructionActivities.includes(selectors.activity)) return failed("invalid_activity", "The selected Activity is not supported.", { activity: selectors.activity });
  const records = history.events.filter((record) => record.status === "valid" && record.event?.data.unit_id === selectors.unit);
  const hasEvent = (predicate: (data: Record<string, unknown>) => boolean): boolean => records.some((record) => predicate(record.event!.data));
  if (selectors.task && !hasEvent((data) => data.task_id === selectors.task)) return failed("audit_scope_mismatch", "The selected task does not belong to this unit.", { task_id: selectors.task, unit_id: selectors.unit });
  if (selectors.task && selectors.stage && selectors.stage !== "implementation") return failed("audit_scope_mismatch", "Task filters are scoped to the Implementation stage.", { stage: selectors.stage });
  if (selectors.implementationAttempt && selectors.stage && selectors.stage !== "implementation") return failed("audit_scope_mismatch", "Implementation attempts require the Implementation stage selector.", { stage: selectors.stage });
  if (selectors.implementationAttempt && !hasEvent((data) => data.stage === "implementation" && data.stage_attempt_id === selectors.implementationAttempt)) {
    return failed("audit_scope_mismatch", "The Implementation attempt does not belong to this unit.", { attempt_id: selectors.implementationAttempt });
  }
  if (selectors.activity && !hasEvent((data) => data.task_id === selectors.task && data.activity === selectors.activity &&
      data.stage_attempt_id === selectors.implementationAttempt)) return failed("audit_scope_mismatch", "The selected Activity does not belong to this task and Implementation attempt.", { activity: selectors.activity });
  if (selectors.attempt && selectors.activity === undefined && !hasEvent((data) => data.stage_attempt_id === selectors.attempt &&
      (selectors.stage === undefined || data.stage === selectors.stage) && (selectors.task === undefined || data.task_id === selectors.task))) {
    return failed("audit_scope_mismatch", "The selected attempt does not belong to this unit and requested scope.", { attempt_id: selectors.attempt });
  }
  if (selectors.activity && selectors.attempt && !hasEvent((data) => data.task_id === selectors.task &&
      data.activity === selectors.activity && data.activity_attempt_id === selectors.attempt &&
      data.stage_attempt_id === selectors.implementationAttempt)) return failed("audit_scope_mismatch", "The Activity attempt does not belong to the selected task and Implementation attempt.", { attempt_id: selectors.attempt });
  return undefined;
};

export const listAuditEvents = (history: HistoryCollection, options: AuditListOptions): AuditQueryResult => {
  if (!options.selectors.unit) return failed("required_selector_missing", "Audit list requires --unit.");
  const ownershipFailure = validateSelectedOwnership(history, options.selectors);
  if (ownershipFailure) return ownershipFailure;
  const limit = validateLimit(options.limit);
  if (typeof limit !== "number") return limit;
  const fields = validateFields(options.fields);
  if (isQueryResult(fields)) return fields;
  const key = queryKey(history.missionId, options, fields, limit);
  const events = matchingEvents(history, options.selectors, options.type);
  let view = events;
  let offset = 0;
  if (options.cursor !== undefined) {
    const cursor = unpackCursor(options.cursor);
    if (!cursor || cursor.query !== key) return failed("invalid_audit_cursor", "The audit cursor is invalid or belongs to a different query.");
    const currentSnapshots = new Map(snapshotFor(events).map((snapshot) => [snapshot.journal_id, snapshot]));
    const allowedJournals = new Set<string>();
    for (const snapshot of cursor.journals) {
      const current = currentSnapshots.get(snapshot.journal_id);
      const prefix = events.filter((item) => item.journalId === snapshot.journal_id).slice(0, snapshot.count);
      if (!current || prefix.length !== snapshot.count || digest(prefix.map((item) => serializeJournalEvent(item.event)).join("\n")) !== snapshot.digest) {
        return failed("expired_audit_cursor", "The audit cursor's original journal view is no longer available.");
      }
      allowedJournals.add(snapshot.journal_id);
    }
    view = cursor.journals.flatMap((snapshot) => events.filter((item) => item.journalId === snapshot.journal_id).slice(0, snapshot.count));
    offset = cursor.offset;
    if (offset > view.length) return failed("expired_audit_cursor", "The audit cursor position is outside its original journal view.");
  }
  const page = view.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < view.length;
  const journals = options.cursor === undefined ? snapshotFor(events) : unpackCursor(options.cursor)!.journals;
  const nextCursor = hasMore ? packCursor({ version: 1, query: key, offset: nextOffset, journals }) : null;
  return { kind: "success", data: { events: page.map((item) => projectEvent(item.event, fields)), next_cursor: nextCursor } };
};

export const showAuditEvent = (
  history: HistoryCollection,
  unitId: string,
  journalId: string,
  eventId: string,
): AuditQueryResult => {
  const unitExists = history.events.some((record) => record.status === "valid" && record.event?.type === "construction.unit-created" && record.event.data.unit_id === unitId);
  if (!unitExists) return failed("audit_scope_mismatch", "The selected unit has no validated creation record.", { unit_id: unitId });
  const records = history.events.filter((record) => record.status === "valid" && record.event?.data.unit_id === unitId &&
    record.journalId === journalId && record.event.id === eventId);
  if (records.length !== 1) return failed("audit_event_not_found", "The selected event does not exist in this unit and journal.", { unit_id: unitId, journal_id: journalId, id: eventId });
  return { kind: "success", data: { event: records[0]!.event } };
};

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class AuditQueries {
  constructor(private readonly history: AuditContextResolver) {}

  async list(options: AuditListOptions, project?: string): Promise<AuditQueryResult> {
    const unitId = options.selectors.unit;
    if (!unitId) return failed("required_selector_missing", "Audit list requires --unit.");
    const loaded = await this.history.readUnit(unitId, project);
    if (loaded.kind === "failed") return { kind: "failed", data: {
      code: loaded.code,
      message: loaded.message,
      details: loaded.details,
      recovery: loaded.recovery,
    } };
    return listAuditEvents(loaded.history, options);
  }

  async show(unitId: string, journalId: string, eventId: string, project?: string): Promise<AuditQueryResult> {
    if (!uuidV4.test(journalId) || !uuidV4.test(eventId)) {
      return failed("invalid_identity", "Audit show requires full lowercase UUIDv4 journal and event identities.", { journal_id: journalId, id: eventId });
    }
    const loaded = await this.history.readUnit(unitId, project);
    if (loaded.kind === "failed") return { kind: "failed", data: {
      code: loaded.code,
      message: loaded.message,
      details: loaded.details,
      recovery: loaded.recovery,
    } };
    return showAuditEvent(loaded.history, unitId, journalId, eventId);
  }
}
