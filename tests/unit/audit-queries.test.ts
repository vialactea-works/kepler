import { describe, expect, it } from "vitest";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { listAuditEvents, showAuditEvent } from "../../packages/cli/src/audit/queries.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const unitId = "2026-10-21-audit-query";
const journalId = "20000000-0000-4000-8000-000000000002";

const event = (id: string, type: string, data: Record<string, unknown>) => ({
  id,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId,
  recorded_at: "2026-10-21T12:00:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data,
});

const records = () => [
  event("30000000-0000-4000-8000-000000000003", "construction.unit-created", {
    mission_id: missionId,
    unit_id: unitId,
    directory: `units-of-work/${unitId}`,
    workflow: "standard",
    initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" },
  }),
  ...[4, 5, 6].map((index) => event(`30000000-0000-4000-8000-${String(index).padStart(12, "0")}`, "construction.interaction-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    participants: ["Requester"],
    content: `Interaction ${index}`,
    references: [],
  })),
];

const history = (events = records(), selectedMissionId = missionId) => collectHistory(selectedMissionId, [{
  sourceId: `${selectedMissionId}/${CONSTRUCTION_PHASE}/${journalId}`,
  missionId: selectedMissionId,
  phase: CONSTRUCTION_PHASE,
  journalId,
  bytes: new TextEncoder().encode(`${events.map((value) => JSON.stringify(value)).join("\n")}\n`),
}], { completeness: "complete" });

const selectors = { unit: unitId };

describe("audit list projections", () => {
  it("returns the accepted default fields", () => {
    const result = listAuditEvents(history(), { selectors, limit: 1 });
    const projected = (result.data.events as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(projected)).toEqual(["id", "journal_id", "phase", "type", "recorded_at"]);
  });

  it("applies explicit projection and keeps IDs", () => {
    const result = listAuditEvents(history(), { selectors, fields: "type,recorded_at", limit: 2 });

    expect(result.kind).toBe("success");
    expect(result.data.events).toHaveLength(2);
    expect(result.data.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String), journal_id: journalId, type: "construction.unit-created" }),
    ]));
    const projected = (result.data.events as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(projected)).toEqual(["id", "journal_id", "type", "recorded_at"]);
    expect(projected).not.toHaveProperty("data");
    expect(result.data.next_cursor).toEqual(expect.any(String));
  });

  it("continues the original stable view and returns null after the last page", () => {
    const first = listAuditEvents(history(), { selectors, limit: 2 });
    const cursor = first.data.next_cursor;
    expect(typeof cursor).toBe("string");
    const second = listAuditEvents(history(), { selectors, limit: 2, cursor: cursor as string });

    expect(second.kind).toBe("success");
    expect(second.data.events).toHaveLength(2);
    expect(second.data.next_cursor).toBeNull();
  });

  it("keeps a cursor on its original matching view when new records are appended", () => {
    const initialHistory = history();
    const first = listAuditEvents(initialHistory, { selectors, limit: 2 });
    const originalIds = (initialHistory.events.flatMap((record) => record.event?.data.unit_id === unitId && record.event.id ? [record.event.id] : []));
    const appended = event("30000000-0000-4000-8000-000000000007", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      participants: ["Requester"],
      content: "New interaction after snapshot",
      references: [],
    });
    const second = listAuditEvents(history([...records(), appended]), {
      selectors,
      limit: 2,
      cursor: String(first.data.next_cursor),
    });

    expect(second.kind).toBe("success");
    expect((second.data.events as Array<Record<string, unknown>>).map((item) => item.id)).toEqual(originalIds.slice(2));
    expect(second.data.next_cursor).toBeNull();
  });

  it("rejects malformed, mismatched, expired, and out-of-range cursors", () => {
    const initial = listAuditEvents(history(), { selectors, limit: 1 });
    const cursor = initial.data.next_cursor as string;
    expect(listAuditEvents(history(), { selectors, limit: 1, cursor: `${cursor}x` }).kind).toBe("failed");
    expect(listAuditEvents(history(), { selectors, type: "construction.evidence-recorded", limit: 1, cursor }).kind).toBe("failed");
    expect(listAuditEvents(history(records().slice(0, 2)), { selectors, limit: 1, cursor }).data.code).toBe("expired_audit_cursor");
    const otherMissionId = "90000000-0000-4000-8000-000000000009";
    const copiedRecords = records().map((record) => ({ ...record, data: { ...record.data, mission_id: otherMissionId } }));
    expect(listAuditEvents(history(copiedRecords, otherMissionId), { selectors, limit: 1, cursor }).data.code).toBe("invalid_audit_cursor");
  });

  it("validates limits, field names, and exact scope ownership", () => {
    expect(listAuditEvents(history(), { selectors, limit: 0 }).data.code).toBe("invalid_audit_limit");
    expect(listAuditEvents(history(), { selectors, limit: 1001 }).data.code).toBe("invalid_audit_limit");
    expect(listAuditEvents(history(), { selectors, fields: "id,invalid" }).data.code).toBe("invalid_audit_fields");
    expect(listAuditEvents(history(), { selectors, fields: "id,id" }).data.code).toBe("invalid_audit_fields");
    expect(listAuditEvents(history(), { selectors: { unit: "other-unit" } }).data.code).toBe("audit_scope_mismatch");
    expect(listAuditEvents(history(), { selectors: { unit: unitId, task: "40000000-0000-4000-8000-000000000004" } }).data.code).toBe("audit_scope_mismatch");
    expect(listAuditEvents(history(), { selectors: { unit: unitId, stage: "functional-design", attempt: "70000000-0000-4000-8000-000000000007" } }).data.code).toBe("audit_scope_mismatch");
  });

  it("filters by exact type and returns success with an empty page", () => {
    const result = listAuditEvents(history(), { selectors, type: "construction.evidence-recorded" });
    expect(result).toMatchObject({ kind: "success", data: { events: [], next_cursor: null } });
  });
});

describe("audit show", () => {
  it("returns the complete stored event and fails for an absent event", () => {
    const source = history();
    const selected = records()[1]!;
    expect(showAuditEvent(source, unitId, journalId, selected.id)).toMatchObject({ kind: "success", data: { event: selected } });
    expect(showAuditEvent(source, unitId, journalId, "not-the-event").kind).toBe("failed");
  });
});
