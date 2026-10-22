import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "../../packages/core/src/event-envelope.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { createNodeUnitCreateRecords } from "../../packages/cli/src/construction/unit-create-runtime.js";
import { UnitCreate, type UnitCreateRuntime } from "../../packages/cli/src/construction/unit-create.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const creationJournalId = "20000000-0000-4000-8000-000000000002";
const preparationJournalId = "30000000-0000-4000-8000-000000000003";
const creationEventId = "40000000-0000-4000-8000-000000000004";
const preparationEventId = "50000000-0000-4000-8000-000000000005";
const unitJournalId = "60000000-0000-4000-8000-000000000006";
const unitEventId = "70000000-0000-4000-8000-000000000007";
const temporaryRoots: string[] = [];

const event = (
  id: string,
  journalId: string,
  type: string,
  data: Record<string, unknown>,
): EventEnvelope<Record<string, unknown>> => ({
  id: id as EventId,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: EVENT_ENVELOPE_VERSION,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId as JournalId,
  recorded_at: "2026-10-21T12:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data,
});

const createRecordHome = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-unit-create-"));
  temporaryRoots.push(root);
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  return root;
};

const recordMission = async (root: string, prepared = true): Promise<void> => {
  const repository = {
    repository_id: "record-home",
    context: { kind: "existing" },
    branch: { kind: "current" },
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "no-commit" },
  };
  const creation = createEventJournal({ recordHome: root, missionId, journalId: creationJournalId, phase: CONSTRUCTION_PHASE });
  await creation.append(event(creationEventId, creationJournalId, "construction.mission-created", {
    mission_id: missionId,
    title: "Prepare the unit-create test mission",
    request: "Exercise unit creation against real history and filesystem paths.",
    workflow: "standard",
    record_home: { repository_id: "record-home" },
    contexts: [],
    repositories: [repository],
  }));
  if (prepared) {
    const preparation = createEventJournal({ recordHome: root, missionId, journalId: preparationJournalId, phase: CONSTRUCTION_PHASE });
    await preparation.append(event(preparationEventId, preparationJournalId, "construction.mission-workspaces-prepared", {
      mission_id: missionId,
      repositories: [{
        repository_id: "record-home",
        context: { kind: "existing" },
        branch: "main",
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "no-commit" },
      }],
    }));
  }
};

const createRuntime = (root: string): UnitCreateRuntime => ({
  projects: { resolve: async () => ({ kind: "resolved", root }) },
  records: createNodeUnitCreateRecords(),
  journals: {
    create: (recordHome, selectedMissionId, journalId) => createEventJournal({
      recordHome,
      missionId: selectedMissionId,
      journalId,
      phase: CONSTRUCTION_PHASE,
    }),
  },
  identities: {
    next: (() => {
      const values = [unitJournalId, unitEventId];
      let index = 0;
      return () => values[index++] ?? randomUUID();
    })(),
  },
  today: () => "2026-10-21",
  now: () => "2026-10-21T12:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("unit creation with real mission journals and filesystem", () => {
  it("records a unit only under a prepared Standard mission and creates no authored artifacts", async () => {
    const root = await createRecordHome();
    await recordMission(root);

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({
      kind: "created",
      unitId: "2026-10-21-order-cancellation",
      missionId,
      recordHome: root,
      workflow: "standard",
      directory: "construction/units-of-work/2026-10-21-order-cancellation",
    });
    const unitDirectory = Path.join(root, ".kepler", "missions", missionId, result.kind === "created" ? result.directory : "");
    expect((await Fs.readdir(unitDirectory)).sort()).toEqual([]);
    const journalPath = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${unitJournalId}.jsonl`);
    const recorded = (await Fs.readFile(journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      id: unitEventId,
      type: "construction.unit-created",
      data: {
        mission_id: missionId,
        unit_id: "2026-10-21-order-cancellation",
        workflow: "standard",
        initial_effort: { default: "standard", stage_overrides: {} },
      },
    });
  });

  it("rejects an unprepared mission without creating unit paths or appending history", async () => {
    const root = await createRecordHome();
    await recordMission(root, false);

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "unfinished", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "mission_not_prepared" });
    expect(await Fs.readdir(Path.join(root, ".kepler", "missions", missionId))).toEqual(["history"]);
  });

  it("reserves IDs known from legacy unbound unit directories", async () => {
    const root = await createRecordHome();
    await recordMission(root);
    const legacyUnit = Path.join(root, ".kepler", "units-of-work", "2026-10-21-order-cancellation");
    await Fs.mkdir(legacyUnit, { recursive: true });

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "unit_id_conflict" });
    expect(await Fs.readdir(legacyUnit)).toEqual([]);
    expect(await Fs.readdir(Path.join(root, ".kepler", "missions", missionId, "construction")).catch(() => [])).toEqual([]);
  });
});
