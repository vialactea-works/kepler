import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { UnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";
import type { SelectedHistoryReader } from "../../packages/cli/src/history/reader.js";
import { createHistoryControl, HistoryError } from "../../packages/cli/src/history/control.js";
import { selectMissionHistory } from "../../packages/cli/src/history/gateway.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyAccessFixture } from "../support/history-access.js";
import type { MissionHistoryView } from "../../packages/cli/src/history/gateway.js";

const root = "/tmp/kepler-unit-query-test";

const emptyHistoryReader: SelectedHistoryReader = { read: async () => { throw new Error("No mission history is expected in this fixture."); } };

const createFileSystem = (missionId?: string, unitId?: string, recordHome = root): UnitQueryFileSystem => ({
  entries: vi.fn(async (path: string) => {
    if (missionId && path === `${recordHome}/.kepler/missions`) return [{ name: missionId, kind: "directory" as const }];
    if (unitId && path.endsWith("/construction/units-of-work")) return [{ name: unitId, kind: "directory" as const }];
    return [];
  }),
  directories: vi.fn(async () => []),
  journals: vi.fn(async () => []),
  read: vi.fn(async () => new Uint8Array()),
});

const viewReader = (view: MissionHistoryView): SelectedHistoryReader => ({ read: async () => view });

const resetView = () => {
  const f = historyGenerationFixture();
  const reset = createHistoryControl({
    id: randomUUID(),
    journalId: randomUUID(),
    recordedAt: "2026-11-13T00:01:00Z",
    producer: { name: "kepler-test", version: "3.1.0" },
    manifest: f.resetManifest,
    decisionReference: "decision:query-reset",
    causes: [],
  });
  const activation = historyTestBytes([reset]);
  const guard = historyTestEvent("construction.history-generation-required", {
    mission_id: f.missionId,
    generation_id: f.generationId,
    control_event_id: reset.id,
  }, randomUUID(), [reset.id]);
  return {
    f,
    view: selectMissionHistory({
      ...f.input,
      activation,
      controlJournals: [{ journalId: reset.journal_id, bytes: activation }],
      guardJournals: [{ journalId: guard.journal_id, bytes: historyTestBytes([guard]) }],
      pendingRecovery: false,
    }),
  };
};

describe("UnitQueries", () => {
  it("returns an empty list for an empty record home without creating paths", async () => {
    const fileSystem = createFileSystem();
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem, emptyHistoryReader);

    const result = await queries.list();

    expect(result).toEqual({ kind: "listed", recordHome: root, history_metadata: [], units: [] });
    expect(fileSystem.entries).toHaveBeenCalledTimes(2);
    expect(fileSystem.directories).not.toHaveBeenCalled();
    expect(fileSystem.read).not.toHaveBeenCalled();
  });

  it("rejects an invalid exact unit selector before resolving or reading a project", async () => {
    const fileSystem = createFileSystem();
    const resolve = vi.fn(async () => ({ kind: "resolved" as const, root }));
    const queries = new UnitQueries({ resolve }, fileSystem, emptyHistoryReader);

    const result = await queries.show(" unit ");

    expect(result).toMatchObject({ kind: "failed", code: "invalid_unit_selector" });
    expect(resolve).not.toHaveBeenCalled();
    expect(fileSystem.entries).not.toHaveBeenCalled();
  });

  it("rejects path-bearing Construction scope IDs before resolving or reading a project", async () => {
    const fileSystem = createFileSystem();
    const resolve = vi.fn(async () => ({ kind: "resolved" as const, root }));
    const queries = new UnitQueries({ resolve }, fileSystem, emptyHistoryReader);

    const result = await queries.readContext("../../outside");

    expect(result).toMatchObject({ kind: "failed", code: "invalid_unit_selector" });
    expect(resolve).not.toHaveBeenCalled();
    expect(fileSystem.entries).not.toHaveBeenCalled();
  });

  it("projects only selected history and reports bounded generation metadata", async () => {
    const f = historyGenerationFixture();
    const excludedGeneration = randomUUID();
    const selected = historyAccessFixture(f, {
      extraEntries: new Map([[`/record/.kepler/missions/${f.missionId}/history/generations/${excludedGeneration}/construction/${f.journalId}.jsonl`, new Uint8Array([255])]]),
    });
    const fileSystem = createFileSystem(f.missionId, f.unitId, "/record");
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root: "/record" }) }, fileSystem, selected.access);

    const listed = await queries.list();
    const context = await queries.readContext(f.unitId);

    expect(listed.kind).toBe("listed");
    if (listed.kind === "listed") {
      expect(listed.history_metadata).toHaveLength(1);
      expect(listed.history_metadata[0]).toMatchObject({
        mission_id: f.missionId,
        mode: "active",
        history_version: f.control.id,
        generation_id: f.generationId,
        pending_recovery: false,
        migration_required: false,
        control_receipts: [{ id: f.control.id, type: "mission.history-initialized", generation_id: f.generationId }],
      });
      expect(listed.units[0]?.unit_id).toBe(f.unitId);
      expect(listed.units[0]?.history_metadata?.mode).toBe("active");
    }
    expect(listed).not.toHaveProperty("sources");
    expect(context).toMatchObject({ kind: "context", historyMetadata: { mode: "active", history_version: f.control.id } });
    if (context.kind === "context") {
      expect(context.history.issues).toEqual([]);
      expect(context.history.journals).toHaveLength(1);
      expect(context.history.journals[0]?.sourceId).toContain(`/generations/${f.generationId}/`);
      expect(context.history.journals[0]?.sourceId).not.toContain(excludedGeneration);
    }
    expect(fileSystem.directories).not.toHaveBeenCalled();
    expect(fileSystem.journals).not.toHaveBeenCalled();
    expect(fileSystem.read).not.toHaveBeenCalled();
  });

  it("keeps legacy history readable and explicitly marks it migration-required", async () => {
    const f = historyGenerationFixture();
    const legacy = selectMissionHistory({ ...f.input, activation: null, controlJournals: [], guardJournals: [], generationSources: [], generationEvidence: false });
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, createFileSystem(f.missionId, f.unitId), viewReader(legacy));

    const result = await queries.show(f.unitId);

    expect(result).toMatchObject({
      kind: "shown",
      unit: {
        membership: { status: "bound", mission_id: f.missionId },
        history_metadata: { mode: "legacy", history_version: null, generation_id: null, migration_required: true },
        progress: { reliable: true },
      },
    });
  });

  it("preserves known membership without inventing phase progress while recovering", async () => {
    const { f, view } = resetView();
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, createFileSystem(f.missionId), viewReader(view));

    const result = await queries.show(f.unitId);
    const context = await queries.readContext(f.unitId);

    expect(result.kind).toBe("shown");
    if (result.kind === "shown") {
      expect(result.unit.membership).toMatchObject({ status: "bound", mission_id: f.missionId });
      expect(result.unit.history_metadata).toMatchObject({ mode: "recovering", generation_id: f.generationId, pending_recovery: false });
      expect(result.unit.progress).toMatchObject({ reliable: false, completed_stages: null });
      expect(result.unit.stages.every((stage) => stage.state === "unknown")).toBe(true);
      expect(result.unit.unknowns).toEqual(expect.arrayContaining(["history-recovering", "construction-projection-unavailable"]));
    }
    expect(context).toMatchObject({ kind: "context", history: { events: [] }, unit: undefined });
  });

  it("surfaces pending recovery rather than presenting the selected workflow as healthy", async () => {
    const f = historyGenerationFixture();
    const pending = { ...selectMissionHistory(f.input), pendingRecovery: true };
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, createFileSystem(f.missionId, f.unitId), viewReader(pending));

    const result = await queries.show(f.unitId);

    expect(result).toMatchObject({
      kind: "shown",
      unit: {
        history_metadata: { mode: "active", pending_recovery: true },
        unknowns: expect.arrayContaining(["history-pending-recovery"]),
      },
    });
  });

  it("fails closed on a corrupt active selection without scanning direct phase paths", async () => {
    const f = historyGenerationFixture();
    const selected = historyAccessFixture(f);
    selected.entries.set(`/record/.kepler/missions/${f.missionId}/history/control/active.json`, new TextEncoder().encode("{"));
    const fileSystem = createFileSystem(f.missionId, f.unitId, "/record");
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root: "/record" }) }, fileSystem, selected.access);

    await expect(selected.access.read("/record", f.missionId)).rejects.toBeInstanceOf(HistoryError);
    expect(await queries.list()).toMatchObject({ kind: "failed", history_metadata: { mode: "unavailable", migration_required: null } });
    expect(fileSystem.directories).not.toHaveBeenCalled();
    expect(fileSystem.journals).not.toHaveBeenCalled();
    expect(fileSystem.read).not.toHaveBeenCalled();
  });

  it("returns a bounded read failure without attempting any write operation", async () => {
    const fileSystem = createFileSystem();
    vi.mocked(fileSystem.entries).mockRejectedValue(new Error("record home unavailable"));
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem, emptyHistoryReader);

    const result = await queries.list();

    expect(result).toMatchObject({
      kind: "failed",
      code: "unit_query_read_failed",
      details: { record_home: root, message: "record home unavailable" },
    });
    expect(fileSystem.entries).toHaveBeenCalledTimes(1);
    expect(fileSystem.read).not.toHaveBeenCalled();
  });
});
