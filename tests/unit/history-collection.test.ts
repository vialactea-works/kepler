import { describe, expect, it } from "vitest";
import {
  collectHistory as collectHistoryFromSources,
  isHistoryScopeBlocked,
  type HistoryJournalSource,
} from "../../packages/cli/src/history/collection.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const utf8 = new TextEncoder();

interface EventOptions {
  readonly id: string;
  readonly journalId: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly causedBy?: readonly string[];
  readonly recordedAt?: string;
  readonly type?: string;
  readonly eventVersion?: number;
  readonly phase?: string;
}

const envelope = ({
  id,
  journalId,
  data = {
    mission_id: missionId,
    unit_id: "unit-one",
    participants: ["caio"],
    content: id,
    references: [],
  },
  causedBy = [],
  recordedAt = "2026-10-18T14:30:00Z",
  type = "construction.interaction-recorded",
  eventVersion = 1,
  phase = "construction",
}: EventOptions) => ({
  id,
  phase,
  type,
  envelope_version: 1,
  event_version: eventVersion,
  journal_id: journalId,
  recorded_at: recordedAt,
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
});

const encode = (events: readonly unknown[]): Uint8Array =>
  utf8.encode(`${events.map((record) => JSON.stringify(record)).join("\n")}\n`);

const source = (
  sourceId: string,
  journalId: string,
  events: readonly unknown[],
  phase = "construction",
  bytes = encode(events),
): HistoryJournalSource => ({ sourceId, missionId, phase, journalId, bytes });

const collectHistory = (
  selectedMissionId: string,
  sources: readonly HistoryJournalSource[],
  completeness: "complete" | "incomplete" = "complete",
) => collectHistoryFromSources(selectedMissionId, sources, { completeness });

describe("Construction history collection", () => {
  it("blocks every unit when the collected source set is not complete", () => {
    const history = collectHistory(missionId, [source("origin://partial", "journal-partial", [envelope({
      id: "event-prefix",
      journalId: "journal-partial",
    })])], "incomplete");
    expect(history.sourceSetComplete).toBe(false);
    expect(history.issues.map((issue) => issue.code)).toContain("incomplete-history");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "another-unit" })).toBe(true);
  });

  it("keeps source identity and journal-local order while resolving imported causes", () => {
    const localBytes = encode([
      envelope({
        id: "event-child",
        journalId: "journal-local",
        causedBy: ["event-parent"],
        recordedAt: "2026-10-18T14:00:00Z",
      }),
      envelope({
        id: "event-later-line",
        journalId: "journal-local",
        recordedAt: "2025-01-01T00:00:00Z",
      }),
    ]);
    const importedBytes = encode([
      envelope({
        id: "event-parent",
        journalId: "journal-imported",
        data: {
          mission_id: missionId,
          unit_id: "unit-one",
          participants: ["caio"],
          content: "original source fact",
          references: [],
        },
        recordedAt: "2026-10-18T14:10:00Z",
      }),
    ]);
    const beforeLocal = localBytes.slice();
    const beforeImported = importedBytes.slice();
    const history = collectHistory(missionId, [
      source("origin://z/journal-local", "journal-local", [], "construction", localBytes),
      source("origin://a/journal-imported", "journal-imported", [], "construction", importedBytes),
    ]);
    expect(history.issues).toEqual([]);
    expect(history.events.map((record) => [record.event?.id, record.sourceId, record.line])).toEqual([
      ["event-child", "origin://z/journal-local", 1],
      ["event-later-line", "origin://z/journal-local", 2],
      ["event-parent", "origin://a/journal-imported", 1],
    ]);
    expect(history.events[0]?.event?.caused_by).toEqual(["event-parent"]);
    expect(history.events[2]?.event?.producer).toEqual({ name: "kepler", version: "0.10.3" });
    expect(history.journals[0]?.bytes).toEqual(beforeLocal);
    expect(history.journals[1]?.bytes).toEqual(beforeImported);
    expect(localBytes).toEqual(beforeLocal);
    expect(importedBytes).toEqual(beforeImported);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(false);
  });

  it("blocks an invalid imported Construction payload only in its identified unit scope", () => {
    const invalid = envelope({
      id: "event-invalid",
      journalId: "journal-invalid",
      data: {
        mission_id: missionId,
        unit_id: "unit-invalid",
        participants: ["caio"],
        content: "missing references",
      },
    });
    const valid = envelope({
      id: "event-valid",
      journalId: "journal-invalid",
      data: {
        mission_id: missionId,
        unit_id: "unit-valid",
        participants: ["caio"],
        content: "unaffected unit",
        references: [],
      },
    });
    const history = collectHistory(missionId, [source("origin://journal-invalid", "journal-invalid", [invalid, valid])]);
    expect(history.events.map((record) => record.status)).toEqual(["invalid", "valid"]);
    expect(history.issues.map((issue) => issue.code)).toContain("invalid-event");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-invalid" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-valid" })).toBe(false);
  });

  it("blocks missing causal records in the dependent scope and leaves unrelated units available", () => {
    const dependent = envelope({
      id: "event-dependent",
      journalId: "journal-one",
      causedBy: ["not-imported"],
      data: {
        mission_id: missionId,
        unit_id: "unit-blocked",
        participants: ["caio"],
        content: "depends on missing history",
        references: [],
      },
    });
    const unrelated = envelope({
      id: "event-independent",
      journalId: "journal-one",
      data: {
        mission_id: missionId,
        unit_id: "unit-independent",
        participants: ["caio"],
        content: "independent history",
        references: [],
      },
    });
    const history = collectHistory(missionId, [source("origin://journal-one", "journal-one", [dependent, unrelated])]);
    expect(history.issues.map((issue) => issue.code)).toContain("missing-cause");
    expect(history.events[0]?.status).toBe("invalid");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-blocked" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-independent" })).toBe(false);
  });

  it("rejects causes recorded after their dependent in the same journal", () => {
    const child = envelope({
      id: "event-child",
      journalId: "journal-order",
      causedBy: ["event-parent"],
    });
    const parent = envelope({ id: "event-parent", journalId: "journal-order" });
    const history = collectHistory(missionId, [source("origin://journal-order", "journal-order", [child, parent])]);
    expect(history.issues.map((issue) => issue.code)).toContain("cause-after-dependent");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
  });

  it("detects conflicting event IDs across imported journals and blocks every affected unit", () => {
    const left = envelope({
      id: "event-collision",
      journalId: "journal-left",
      data: {
        mission_id: missionId,
        unit_id: "unit-left",
        participants: ["caio"],
        content: "left content",
        references: [],
      },
    });
    const right = envelope({
      id: "event-collision",
      journalId: "journal-right",
      data: {
        mission_id: missionId,
        unit_id: "unit-right",
        participants: ["caio"],
        content: "different right content",
        references: [],
      },
    });
    const history = collectHistory(missionId, [
      source("origin://left", "journal-left", [left]),
      source("origin://right", "journal-right", [right]),
    ]);
    expect(history.issues.map((issue) => issue.code)).toContain("event-conflict");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-left" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-right" })).toBe(true);
  });

  it("keeps unsupported facts and blocks their scope instead of dropping them", () => {
    const unsupported = envelope({
      id: "event-future",
      journalId: "journal-future",
      type: "construction.future-event",
    });
    const history = collectHistory(missionId, [source("origin://future", "journal-future", [unsupported])]);
    expect(history.events[0]?.event?.id).toBe("event-future");
    expect(history.events[0]?.status).toBe("unsupported");
    expect(history.issues.map((issue) => issue.code)).toContain("unsupported-event");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
  });

  it("blocks causal cycles across journals without using timestamps as a global order", () => {
    const left = envelope({ id: "event-left", journalId: "journal-left", causedBy: ["event-right"] });
    const right = envelope({ id: "event-right", journalId: "journal-right", causedBy: ["event-left"] });
    const history = collectHistory(missionId, [
      source("origin://left", "journal-left", [left]),
      source("origin://right", "journal-right", [right]),
    ]);
    expect(history.issues.map((issue) => issue.code)).toContain("causal-cycle");
    expect(history.events.map((record) => record.status)).toEqual(["invalid", "invalid"]);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
  });

  it("blocks divergent snapshots of one journal identity in the affected units", () => {
    const first = envelope({
      id: "event-first",
      journalId: "journal-shared",
      data: { mission_id: missionId, unit_id: "unit-first", participants: ["caio"], content: "first", references: [] },
    });
    const second = envelope({
      id: "event-second",
      journalId: "journal-shared",
      data: { mission_id: missionId, unit_id: "unit-second", participants: ["caio"], content: "second", references: [] },
    });
    const history = collectHistory(missionId, [
      source("origin://snapshot-one", "journal-shared", [first]),
      source("origin://snapshot-two", "journal-shared", [second]),
    ]);
    expect(history.issues.map((issue) => issue.code)).toContain("journal-conflict");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-first" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-second" })).toBe(true);
    expect(history.journals.map((journal) => journal.bytes)).toHaveLength(2);
  });

  it("scopes damaged imported lines when their record data identifies a unit", () => {
    const valid = envelope({
      id: "event-valid",
      journalId: "journal-damaged",
      data: {
        mission_id: missionId,
        unit_id: "unit-safe",
        participants: ["caio"],
        content: "valid event",
        references: [],
      },
    });
    const validBytes = encode([valid]);
    const damagedLine = utf8.encode(JSON.stringify({
      id: "broken-event",
      data: { mission_id: missionId, unit_id: "unit-damaged" },
    }) + "\n");
    const bytes = new Uint8Array(validBytes.length + damagedLine.length);
    bytes.set(validBytes);
    bytes.set(damagedLine, validBytes.length);
    const history = collectHistory(missionId, [source("origin://damaged", "journal-damaged", [], "construction", bytes)]);
    expect(history.issues.map((issue) => issue.code)).toContain("damaged-record");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-damaged" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-safe" })).toBe(false);
  });

  it("blocks the whole mission when duplicate payload keys make unit scope ambiguous", () => {
    const raw = JSON.stringify(envelope({ id: "duplicate-scope", journalId: "journal-duplicate" }))
      .replace('"unit_id":"unit-one"', '"unit_id":"unit-one","unit_id":"unit-other"');
    const history = collectHistory(missionId, [
      source("origin://duplicate-scope", "journal-duplicate", [], "construction", utf8.encode(`${raw}\n`)),
    ]);
    expect(history.issues.map((issue) => issue.code)).toContain("damaged-record");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-unrelated" })).toBe(true);
  });

  it("blocks the whole mission when malformed records do not identify a safe unit scope", () => {
    const bytes = utf8.encode("not-json\n");
    const history = collectHistory(missionId, [source("origin://unknown", "journal-unknown", [], "construction", bytes)]);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-two" })).toBe(true);
  });

  it("rejects an event whose embedded journal identity differs from the preserved source identity", () => {
    const bytes = encode([envelope({ id: "event-original", journalId: "journal-original" })]);
    const history = collectHistory(missionId, [source("origin://renamed", "journal-renamed", [], "construction", bytes)]);
    expect(history.events[0]?.event?.journal_id).toBe("journal-original");
    expect(history.events[0]?.status).toBe("invalid");
    expect(history.issues.map((issue) => issue.code)).toContain("source-identity-mismatch");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unit-one" })).toBe(true);
  });
});
