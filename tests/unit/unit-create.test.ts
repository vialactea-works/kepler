import { describe, expect, it } from "vitest";
import {
  UnitCreate,
  validateUnitCreateRequest,
  type UnitCreateRuntime,
} from "../../packages/cli/src/construction/unit-create.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const journalId = "20000000-0000-4000-8000-000000000002";
const eventId = "30000000-0000-4000-8000-000000000003";
const unitId = "2026-10-21-order-cancellation";

const request = {
  slug: "order-cancellation",
  mission: missionId,
  effort: "comprehensive",
  stageEffort: ["implementation=minimal", "deliver=standard"],
  project: "../record-home",
};

const createRuntime = (overrides: {
  readonly project?: () => Promise<unknown>;
  readonly inspect?: () => Promise<unknown>;
  readonly createDirectory?: () => Promise<unknown>;
  readonly append?: (event: unknown) => Promise<unknown>;
  readonly ids?: readonly string[];
  readonly today?: string;
} = {}) => {
  const events: unknown[] = [];
  const effects: string[] = [];
  let nextIdentity = 0;
  const ids = overrides.ids ?? [journalId, eventId];
  const journal: EventJournal = {
    path: `/record/.kepler/missions/${missionId}/history/construction/${journalId}.jsonl`,
    read: async () => {
      throw new Error("not used");
    },
    append: async (event) => {
      events.push(event);
      effects.push("append");
      if (overrides.append) return await overrides.append(event) as never;
      return { status: "appended", eventId, line: 1 };
    },
  };
  const runtime: UnitCreateRuntime = {
    projects: {
      resolve: overrides.project
        ? async (project) => {
          effects.push(`resolve:${project ?? ""}`);
          return await overrides.project!() as never;
        }
        : async (project) => {
          effects.push(`resolve:${project ?? ""}`);
          return { kind: "resolved", root: "/record" };
        },
    },
    records: {
      inspect: overrides.inspect
        ? async () => {
          effects.push("inspect");
          return await overrides.inspect!() as never;
        }
        : async () => {
          effects.push("inspect");
          return {
            kind: "inspected",
            mission: { id: missionId, workflow: "standard", prepared: true },
            unitIds: [],
          };
        },
      createDirectory: overrides.createDirectory
        ? async () => {
          effects.push("directory");
          return await overrides.createDirectory!() as never;
        }
        : async () => {
          effects.push("directory");
          return { kind: "created" };
        },
    },
    journals: {
      create: (recordHome, selectedMissionId, selectedJournalId) => {
        effects.push("journal");
        if (recordHome !== "/record" || selectedMissionId !== missionId || selectedJournalId !== journalId) {
          throw new Error("Unexpected journal coordinates");
        }
        return journal;
      },
    },
    identities: {
      next: () => ids[nextIdentity++] ?? "40000000-0000-4000-8000-000000000004",
    },
    today: () => overrides.today ?? "2026-10-21",
    now: () => "2026-10-21T12:00:00.000Z",
    producer: { name: "kepler-cli", version: "0.10.3" },
  };
  return { runtime, events, effects };
};

describe("unit create request validation", () => {
  it("accepts an exact slug, mission UUIDv4, effort, distinct stage overrides, and project", () => {
    expect(validateUnitCreateRequest(request)).toMatchObject({
      kind: "valid",
      request: {
        slug: "order-cancellation",
        missionId,
        effort: "comprehensive",
        stageEffort: {
          implementation: "minimal",
          deliver: "standard",
        },
        project: "../record-home",
      },
    });
  });

  it.each([
    { ...request, slug: "Order-cancellation" },
    { ...request, slug: "-order" },
    { ...request, slug: "order--cancellation" },
    { ...request, slug: "order-cancellation-" },
    { ...request, mission: "10000000-0000-5000-8000-000000000001" },
    { ...request, mission: "10000000-0000-4000-7000-000000000001" },
    { ...request, mission: "10000000-0000-4000-8000-00000000000A" },
    { ...request, mission: [missionId, missionId] },
    { ...request, effort: "Standard" },
    { ...request, effort: ["standard", "minimal"] },
    { ...request, stageEffort: ["implementation=minimal", "implementation=standard"] },
    { ...request, stageEffort: ["implementation=minimal", "implementationPlanning=standard"] },
    { ...request, stageEffort: ["implementation="] },
    { ...request, stageEffort: ["deliver=standard=extra"] },
    { ...request, stageEffort: ["deliver=unknown"] },
    { ...request, project: ["one", "two"] },
    { ...request, project: "" },
    { ...request, extra: "not accepted" },
  ])("rejects invalid unit-create input before resolving a project", (value) => {
    const { runtime, effects } = createRuntime();

    expect(validateUnitCreateRequest(value).kind).toBe("invalid");
    expect(effects).toEqual([]);
    expect(runtime).toBeDefined();
  });
});

describe("UnitCreate", () => {
  it("records the dated identity, Standard membership, initial effort, and empty unit directory", async () => {
    const { runtime, events, effects } = createRuntime();

    const result = await new UnitCreate(runtime).execute(request);

    expect(result).toMatchObject({
      kind: "created",
      unitId,
      missionId,
      recordHome: "/record",
      directory: `construction/units-of-work/${unitId}`,
      workflow: "standard",
      effort: {
        default: "comprehensive",
        stageOverrides: { implementation: "minimal", deliver: "standard" },
      },
    });
    expect(effects).toEqual(["resolve:../record-home", "inspect", "journal", "directory", "append"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: eventId,
      journal_id: journalId,
      phase: "construction",
      type: "construction.unit-created",
      data: {
        mission_id: missionId,
        unit_id: unitId,
        directory: `construction/units-of-work/${unitId}`,
        workflow: "standard",
        initial_effort: {
          default: "comprehensive",
          stage_overrides: { implementation: "minimal", deliver: "standard" },
          selected_by: "requester",
        },
      },
    });
    expect(JSON.stringify(events)).not.toContain("stage_attempt_id");
    expect(JSON.stringify(events)).not.toContain("unit-of-work.md");
    expect(JSON.stringify(events)).not.toContain("tasks-dag.json");
  });

  it("uses Standard by default and the local creation date, not the UTC event date", async () => {
    const { runtime, events } = createRuntime({
      today: "2026-10-20",
    });
    const result = await new UnitCreate(runtime).execute({ slug: "greenfield", mission: missionId });

    expect(result).toMatchObject({ kind: "created", unitId: "2026-10-20-greenfield" });
    expect(events[0]).toMatchObject({
      recorded_at: "2026-10-21T12:00:00.000Z",
      data: { initial_effort: { default: "standard", stage_overrides: {} } },
    });
  });

  it("fails invalid requests before project resolution, identity allocation, reads, or writes", async () => {
    const { runtime, effects } = createRuntime();

    const result = await new UnitCreate(runtime).execute({ ...request, slug: "Uppercase" });

    expect(result).toMatchObject({ kind: "failed", code: "invalid_unit_request" });
    expect(effects).toEqual([]);
  });

  it.each([
    { name: "missing mission", inspection: { kind: "inspected", unitIds: [] }, code: "mission_not_found" },
    { name: "mismatched workflow", inspection: { kind: "inspected", mission: { id: missionId, workflow: "experimental", prepared: true }, unitIds: [] }, code: "mission_workflow_mismatch" },
    { name: "unprepared mission", inspection: { kind: "inspected", mission: { id: missionId, workflow: "standard", prepared: false }, unitIds: [] }, code: "mission_not_prepared" },
    { name: "directory identity", inspection: { kind: "inspected", mission: { id: missionId, workflow: "standard", prepared: true }, unitIds: [unitId] }, code: "unit_id_conflict" },
    { name: "history identity", inspection: { kind: "inspected", mission: { id: missionId, workflow: "standard", prepared: true }, unitIds: [unitId] }, code: "unit_id_conflict" },
  ])("does not write when $name prevents creation", async ({ inspection, code }) => {
    const { runtime, events, effects } = createRuntime({ inspect: async () => inspection });

    const result = await new UnitCreate(runtime).execute(request);

    expect(result).toMatchObject({ kind: "failed", code });
    expect(events).toHaveLength(0);
    expect(effects).toEqual(["resolve:../record-home", "inspect"]);
  });

  it("does not write when project selection fails", async () => {
    const { runtime, events, effects } = createRuntime({
      project: async () => ({ kind: "failed", code: "project_not_worktree", message: "invalid", details: {}, recovery: "select a project" }),
    });

    const result = await new UnitCreate(runtime).execute(request);

    expect(result).toMatchObject({ kind: "failed", code: "project_not_worktree" });
    expect(events).toHaveLength(0);
    expect(effects).toEqual(["resolve:../record-home"]);
  });

  it("does not append when the exact unit directory already exists", async () => {
    const { runtime, events, effects } = createRuntime({
      createDirectory: async () => ({ kind: "exists" }),
    });

    const result = await new UnitCreate(runtime).execute(request);

    expect(result).toMatchObject({ kind: "failed", code: "unit_directory_exists" });
    expect(events).toHaveLength(0);
    expect(effects).toEqual(["resolve:../record-home", "inspect", "journal", "directory"]);
  });

  it("reports a journal failure without deleting the created directory", async () => {
    const { runtime, events, effects } = createRuntime({
      append: async () => { throw new Error("journal unavailable"); },
    });

    const result = await new UnitCreate(runtime).execute(request);

    expect(result).toMatchObject({
      kind: "failed",
      code: "unit_record_failed",
      details: { unit_id: unitId, directory_created: true },
    });
    expect(events).toHaveLength(1);
    expect(effects).toEqual(["resolve:../record-home", "inspect", "journal", "directory", "append"]);
  });
});
