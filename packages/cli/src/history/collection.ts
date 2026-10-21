import {
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ConstructionEventRecord,
} from "../construction/events.js";
import {
  scanJournalBytes,
  serializeJournalEvent,
  type JournalScan,
} from "./journal.js";
import type { EventEnvelope, EventEnvelopeIssue } from "@vialactea-works/kepler-core";

export interface HistoryJournalSource {
  readonly sourceId: string;
  readonly missionId: string;
  readonly phase: string;
  readonly journalId: string;
  readonly bytes: Uint8Array;
}

export interface HistoryCollectionOptions {
  readonly completeness: "complete" | "incomplete";
}

export interface HistoryScope {
  readonly missionId: string;
  readonly unitId?: string;
}

export type HistoryEventStatus = "valid" | "invalid" | "unsupported";

export type HistoryIssueCode =
  | "invalid-source"
  | "incomplete-history"
  | "source-identity-mismatch"
  | "journal-conflict"
  | "damaged-record"
  | "invalid-event"
  | "unsupported-event"
  | "event-conflict"
  | "missing-cause"
  | "cause-after-dependent"
  | "uncertain-cause"
  | "causal-cycle";

export interface HistoryIssue {
  readonly code: HistoryIssueCode;
  readonly message: string;
  readonly scope: HistoryScope;
  readonly sourceId?: string;
  readonly journalId?: string;
  readonly line?: number;
  readonly eventId?: string;
}

export interface CollectedHistoryEvent {
  readonly sourceId: string;
  readonly scope: HistoryScope;
  readonly missionId: string;
  readonly phase: string;
  readonly journalId: string;
  readonly line: number;
  readonly byteOffset: number;
  readonly status: HistoryEventStatus;
  readonly event?: EventEnvelope;
  readonly constructionEvent?: ConstructionEventRecord;
  readonly validationIssues: readonly EventEnvelopeIssue[];
  readonly issueCodes: readonly HistoryIssueCode[];
}

export interface CollectedHistoryJournal {
  readonly sourceId: string;
  readonly missionId: string;
  readonly phase: string;
  readonly journalId: string;
  readonly bytes: Uint8Array;
  readonly scan: JournalScan;
  readonly events: readonly CollectedHistoryEvent[];
}

export interface HistoryCollection {
  readonly missionId: string;
  readonly phase: string;
  readonly sourceSetComplete: boolean;
  readonly journals: readonly CollectedHistoryJournal[];
  readonly events: readonly CollectedHistoryEvent[];
  readonly issues: readonly HistoryIssue[];
  readonly blockedScopes: readonly HistoryScope[];
}

interface MutableHistoryEvent {
  readonly sourceId: string;
  readonly missionId: string;
  readonly phase: string;
  readonly journalId: string;
  readonly journalKey: string;
  readonly line: number;
  readonly byteOffset: number;
  readonly scope: HistoryScope;
  readonly event?: EventEnvelope;
  validationIssues: readonly EventEnvelopeIssue[];
  status: HistoryEventStatus;
  constructionEvent?: ConstructionEventRecord;
  readonly issueCodes: Set<HistoryIssueCode>;
}

interface MutableHistoryJournal {
  readonly source: HistoryJournalSource;
  readonly sourceBytes: Uint8Array;
  readonly journalKey: string;
  readonly scan: JournalScan;
  readonly events: MutableHistoryEvent[];
  readonly metadataValid: boolean;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const journalIdentity = (missionId: string, phase: string, journalId: string): string =>
  JSON.stringify([missionId, phase, journalId]);

const sourceIdentity = (source: HistoryJournalSource): string =>
  JSON.stringify([source.sourceId, source.missionId, source.phase, source.journalId]);

const scopeForEvent = (event: EventEnvelope, missionId: string): HistoryScope => {
  const data = event.data;
  if (data.mission_id === missionId && isNonEmptyString(data.unit_id)) {
    return { missionId, unitId: data.unit_id };
  }
  return { missionId };
};

const scopeForRaw = (raw: string | undefined, missionId: string): HistoryScope => {
  if (raw === undefined) return { missionId };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && isRecord(parsed.data) && parsed.data.mission_id === missionId &&
        isNonEmptyString(parsed.data.unit_id)) {
      return { missionId, unitId: parsed.data.unit_id };
    }
  } catch {
    return { missionId };
  }
  return { missionId };
};

const journalProblemCode = (code: string): HistoryIssueCode =>
  code === "unsupported-envelope-version" ? "unsupported-event" : "damaged-record";

const isUnsupportedEnvelopeProblem = (code: string): boolean => code === "unsupported-envelope-version";

const cyclicEventIds = (events: ReadonlyMap<string, MutableHistoryEvent>): ReadonlySet<string> => {
  const graph = new Map<string, readonly string[]>();
  const reverse = new Map<string, string[]>();
  for (const [id, record] of events) {
    const causes = record.event?.caused_by.filter((cause) => events.has(cause)) ?? [];
    graph.set(id, causes);
    for (const cause of causes) {
      const dependents = reverse.get(cause) ?? [];
      dependents.push(id);
      reverse.set(cause, dependents);
    }
  }
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const start of graph.keys()) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: { readonly id: string; index: number }[] = [{ id: start, index: 0 }];
    while (stack.length > 0) {
      const current = stack.at(-1);
      if (!current) break;
      const causes = graph.get(current.id) ?? [];
      if (current.index < causes.length) {
        const next = causes[current.index];
        current.index += 1;
        if (next !== undefined && !visited.has(next)) {
          visited.add(next);
          stack.push({ id: next, index: 0 });
        }
      } else {
        finished.push(current.id);
        stack.pop();
      }
    }
  }
  const assigned = new Set<string>();
  const cycles = new Set<string>();
  for (let index = finished.length - 1; index >= 0; index -= 1) {
    const start = finished[index];
    if (start === undefined || assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;
      component.push(current);
      for (const next of reverse.get(current) ?? []) {
        if (assigned.has(next)) continue;
        assigned.add(next);
        stack.push(next);
      }
    }
    if (component.length > 1 || (graph.get(start) ?? []).includes(start)) {
      for (const id of component) cycles.add(id);
    }
  }
  return cycles;
};

export const collectHistory = (
  missionId: string,
  sources: readonly HistoryJournalSource[],
  options: HistoryCollectionOptions,
): HistoryCollection => {
  const issues: HistoryIssue[] = [];
  const issueKeys = new Set<string>();
  const blockedScopes: HistoryScope[] = [];
  const blockedKeys = new Set<string>();
  const unusableEventIds = new Set<string>();
  const journals: MutableHistoryJournal[] = [];
  const events: MutableHistoryEvent[] = [];
  const seenSources = new Map<string, { readonly identity: string; readonly bytes: Uint8Array }>();
  const seenJournals = new Map<string, Uint8Array>();
  const conflictedSourceIds = new Set<string>();
  const conflictedJournalKeys = new Set<string>();

  const addIssue = (issue: HistoryIssue): void => {
    const key = JSON.stringify([
      issue.code,
      issue.sourceId,
      issue.journalId,
      issue.line,
      issue.eventId,
      issue.scope.missionId,
      issue.scope.unitId,
    ]);
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(issue);
    }
    const blockedKey = JSON.stringify([issue.scope.missionId, issue.scope.unitId]);
    if (!blockedKeys.has(blockedKey)) {
      blockedKeys.add(blockedKey);
      blockedScopes.push(issue.scope);
    }
  };

  const markEventIssue = (
    record: MutableHistoryEvent,
    code: HistoryIssueCode,
    message: string,
  ): void => {
    record.issueCodes.add(code);
    record.status = code === "unsupported-event" ? "unsupported" : "invalid";
    record.constructionEvent = undefined;
    if (record.event) unusableEventIds.add(record.event.id);
    addIssue({
      code,
      message,
      scope: record.scope,
      sourceId: record.sourceId,
      journalId: record.journalId,
      line: record.line,
      eventId: record.event?.id,
    });
  };

  const sourceSetComplete = options.completeness === "complete";
  if (!sourceSetComplete) {
    addIssue({
      code: "incomplete-history",
      message: "History source coverage is not established as complete",
      scope: { missionId },
    });
  }
  if (!uuidV4.test(missionId)) {
    addIssue({ code: "invalid-source", message: "Requested history scope has an invalid mission identity", scope: { missionId } });
  }

  for (const source of sources) {
    const hasBytes = source.bytes instanceof Uint8Array;
    const sourceBytes = hasBytes ? new Uint8Array(source.bytes) : new Uint8Array();
    const scan = scanJournalBytes(sourceBytes);
    const journalKey = journalIdentity(source.missionId, source.phase, source.journalId);
    const sourceKey = sourceIdentity(source);
    const metadataValid = isNonEmptyString(source.sourceId) && uuidV4.test(source.missionId) &&
      isNonEmptyString(source.phase) && isNonEmptyString(source.journalId) && hasBytes &&
      source.missionId === missionId;
    const journal: MutableHistoryJournal = {
      source,
      sourceBytes,
      journalKey,
      scan,
      events: [],
      metadataValid,
    };
    journals.push(journal);
    const problemsByLine = new Map<number, Array<JournalScan["problems"][number]>>();
    for (const problem of scan.problems) {
      const lineProblems = problemsByLine.get(problem.line) ?? [];
      lineProblems.push(problem);
      problemsByLine.set(problem.line, lineProblems);
    }

    const priorSource = seenSources.get(source.sourceId);
    if (priorSource && (priorSource.identity !== sourceKey || !bytesEqual(priorSource.bytes, sourceBytes))) {
      conflictedSourceIds.add(source.sourceId);
    } else if (!priorSource) {
      seenSources.set(source.sourceId, { identity: sourceKey, bytes: sourceBytes });
    }
    const priorJournal = seenJournals.get(journalKey);
    if (priorJournal && !bytesEqual(priorJournal, sourceBytes)) {
      conflictedJournalKeys.add(journalKey);
    } else if (!priorJournal) {
      seenJournals.set(journalKey, sourceBytes);
    }

    for (const line of scan.lines) {
      const event = line.event;
      const lineProblems = problemsByLine.get(line.line) ?? [];
      let status: HistoryEventStatus = event ? "valid" : "invalid";
      let constructionEvent: ConstructionEventRecord | undefined;
      let validationIssues = line.issues;
      let scope: HistoryScope;
      if (event) scope = scopeForEvent(event, missionId);
      else if (lineProblems.some((problem) => problem.code === "duplicate-json-key")) scope = { missionId };
      else scope = scopeForRaw(line.raw, missionId);
      const record: MutableHistoryEvent = {
        sourceId: source.sourceId,
        missionId: source.missionId,
        phase: source.phase,
        journalId: source.journalId,
        journalKey,
        line: line.line,
        byteOffset: line.byteOffset,
        scope,
        status,
        event,
        constructionEvent,
        validationIssues,
        issueCodes: new Set<HistoryIssueCode>(),
      };
      journal.events.push(record);
      events.push(record);

      if (lineProblems.length > 0) {
        const unsupported = lineProblems.some((problem) => isUnsupportedEnvelopeProblem(problem.code));
        for (const problem of lineProblems) {
          markEventIssue(record, journalProblemCode(problem.code), problem.message);
        }
        if (unsupported) record.status = "unsupported";
        continue;
      }
      if (!event) {
        markEventIssue(record, "invalid-event", "Journal line did not produce a validated event envelope");
        continue;
      }
      if (!metadataValid) {
        markEventIssue(record, "invalid-source", "Journal source metadata does not match the requested mission scope");
        continue;
      }
      if (event.phase !== source.phase || event.journal_id !== source.journalId ||
          (event.data.mission_id !== undefined && event.data.mission_id !== source.missionId)) {
        markEventIssue(record, "source-identity-mismatch", "Event identity does not match its original journal source");
        continue;
      }
      if (source.phase === CONSTRUCTION_PHASE) {
        const validation = validateConstructionEvent(event);
        if (validation.status === "invalid") {
          validationIssues = validation.issues;
          record.validationIssues = validationIssues;
          markEventIssue(record, "invalid-event", "Construction event payload failed validation");
          continue;
        }
        if (validation.status === "unsupported") {
          markEventIssue(record, "unsupported-event", `Construction event is unsupported: ${validation.reason}`);
          continue;
        }
        constructionEvent = validation.event;
        record.constructionEvent = constructionEvent;
      }
      record.status = "valid";
    }
  }

  for (const journal of journals) {
    if (!journal.metadataValid) {
      if (journal.events.length === 0) {
        addIssue({
          code: "invalid-source",
          message: "Journal source metadata does not match the requested mission scope",
          scope: { missionId },
          sourceId: journal.source.sourceId,
          journalId: journal.source.journalId,
        });
      }
    }
    if (conflictedSourceIds.has(journal.source.sourceId)) {
      if (journal.events.length === 0) {
        addIssue({
          code: "source-identity-mismatch",
          message: "One source identity refers to different journal metadata or bytes",
          scope: { missionId },
          sourceId: journal.source.sourceId,
          journalId: journal.source.journalId,
        });
      } else {
        for (const record of journal.events) {
          markEventIssue(record, "source-identity-mismatch", "One source identity refers to different journal metadata or bytes");
        }
      }
    }
    if (conflictedJournalKeys.has(journal.journalKey)) {
      if (journal.events.length === 0) {
        addIssue({
          code: "journal-conflict",
          message: "The same journal identity has different imported bytes",
          scope: { missionId },
          sourceId: journal.source.sourceId,
          journalId: journal.source.journalId,
        });
      } else {
        for (const record of journal.events) {
          markEventIssue(record, "journal-conflict", "The same journal identity has different imported bytes");
        }
      }
    }
  }

  const byEventId = new Map<string, MutableHistoryEvent[]>();
  for (const record of events) {
    if (!record.event) continue;
    const occurrences = byEventId.get(record.event.id) ?? [];
    occurrences.push(record);
    byEventId.set(record.event.id, occurrences);
  }
  for (const [eventId, occurrences] of byEventId) {
    const content = new Set<string>();
    for (const record of occurrences) {
      if (record.event) content.add(serializeJournalEvent(record.event));
    }
    if (content.size > 1) {
      for (const record of occurrences) {
        markEventIssue(record, "event-conflict", "Event ID has different content across collected history");
      }
    }
    if (occurrences.some((record) => record.status !== "valid")) unusableEventIds.add(eventId);
  }

  for (const record of events) {
    if (record.status !== "valid" || !record.event) continue;
    for (const causeId of record.event.caused_by) {
      if (unusableEventIds.has(causeId)) {
        markEventIssue(record, "uncertain-cause", `Cause ${causeId} is invalid, unsupported, or conflicting`);
        continue;
      }
      const causes = byEventId.get(causeId);
      if (!causes || causes.length === 0) {
        markEventIssue(record, "missing-cause", `Required cause ${causeId} is absent from collected history`);
        continue;
      }
      const validCauses = causes.filter((cause) => cause.status === "valid");
      if (validCauses.length === 0) {
        markEventIssue(record, "uncertain-cause", `Cause ${causeId} is not validated history`);
        continue;
      }
      const sameJournal = validCauses.filter((cause) => cause.journalKey === record.journalKey);
      const earlierInJournal = sameJournal.some((cause) => cause.line < record.line);
      const inOtherJournal = validCauses.some((cause) => cause.journalKey !== record.journalKey);
      if (sameJournal.length > 0 && !earlierInJournal && !inOtherJournal) {
        markEventIssue(record, "cause-after-dependent", `Cause ${causeId} appears after its dependent in the same journal`);
      }
    }
  }

  const uniqueValidEvents = new Map<string, MutableHistoryEvent>();
  for (const record of events) {
    if (record.status === "valid" && record.event && !unusableEventIds.has(record.event.id) &&
        !uniqueValidEvents.has(record.event.id)) {
      uniqueValidEvents.set(record.event.id, record);
    }
  }
  const cycles = cyclicEventIds(uniqueValidEvents);
  for (const eventId of cycles) {
    for (const record of byEventId.get(eventId) ?? []) {
      markEventIssue(record, "causal-cycle", "Causal references contain a cycle");
    }
  }

  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const record of events) {
      if (record.status !== "valid" || !record.event ||
          !record.event.caused_by.some((causeId) => unusableEventIds.has(causeId))) continue;
      markEventIssue(record, "uncertain-cause", "A required causal ancestor is not usable history");
      propagated = true;
    }
  }

  const freezeEvent = (record: MutableHistoryEvent): CollectedHistoryEvent => ({
    sourceId: record.sourceId,
    scope: record.scope,
    missionId: record.missionId,
    phase: record.phase,
    journalId: record.journalId,
    line: record.line,
    byteOffset: record.byteOffset,
    status: record.status,
    event: record.event,
    constructionEvent: record.constructionEvent,
    validationIssues: record.validationIssues,
    issueCodes: [...record.issueCodes],
  });
  const frozenEvents = events.map(freezeEvent);
  const frozenJournals = journals.map((journal) => ({
    sourceId: journal.source.sourceId,
    missionId: journal.source.missionId,
    phase: journal.source.phase,
    journalId: journal.source.journalId,
    bytes: journal.sourceBytes,
    scan: journal.scan,
    events: journal.events.map(freezeEvent),
  }));
  return {
    missionId,
    phase: CONSTRUCTION_PHASE,
    sourceSetComplete,
    journals: frozenJournals,
    events: frozenEvents,
    issues,
    blockedScopes,
  };
};

export const isHistoryScopeBlocked = (history: HistoryCollection, scope: HistoryScope): boolean =>
  history.blockedScopes.some((blocked) => blocked.missionId === scope.missionId &&
    (scope.unitId === undefined || blocked.unitId === undefined || blocked.unitId === scope.unitId));
