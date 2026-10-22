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
import { createNodeUnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries-runtime.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const missionJournalId = "20000000-0000-4000-8000-000000000002";
const preparationJournalId = "30000000-0000-4000-8000-000000000003";
const unitJournalId = "40000000-0000-4000-8000-000000000004";
const unitId = "2026-10-21-query-unit";
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

const snapshot = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await Fs.readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, entry.name);
      const relative = Path.relative(root, path);
      if (entry.isDirectory()) {
        result.push(`directory:${relative}`);
        await visit(path);
      } else if (entry.isFile()) {
        result.push(`file:${relative}:${(await Fs.readFile(path)).toString("base64")}`);
      }
    }
  };
  await visit(root);
  return result;
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("unit queries against real Construction history", () => {
  it("lists and shows bound and unbound units without changing record-home state", async () => {
    const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-unit-queries-"));
    temporaryRoots.push(root);
    await Fs.mkdir(Path.join(root, ".kepler", "missions", missionId), { recursive: true });
    await Fs.mkdir(Path.join(root, ".git"));
    const repository = {
      repository_id: "record-home",
      context: { kind: "existing" },
      branch: { kind: "current" },
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "no-commit" },
    };
    const missionJournal = createEventJournal({ recordHome: root, missionId, journalId: missionJournalId, phase: CONSTRUCTION_PHASE });
    await missionJournal.append(event(randomUUID(), missionJournalId, "construction.mission-created", {
      mission_id: missionId,
      title: "Exercise unit queries",
      request: "Read a unit from its mission-owned history.",
      workflow: "standard",
      record_home: { repository_id: "record-home" },
      contexts: [],
      repositories: [repository],
    }));
    const preparationJournal = createEventJournal({ recordHome: root, missionId, journalId: preparationJournalId, phase: CONSTRUCTION_PHASE });
    await preparationJournal.append(event(randomUUID(), preparationJournalId, "construction.mission-workspaces-prepared", {
      mission_id: missionId,
      repositories: [{
        repository_id: "record-home",
        context: { kind: "existing" },
        branch: "main",
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "no-commit" },
      }],
    }));
    const unitJournal = createEventJournal({ recordHome: root, missionId, journalId: unitJournalId, phase: CONSTRUCTION_PHASE });
    await unitJournal.append(event(randomUUID(), unitJournalId, "construction.unit-created", {
      mission_id: missionId,
      unit_id: unitId,
      directory: `construction/units-of-work/${unitId}`,
      workflow: "standard",
      initial_effort: {
        default: "standard",
        stage_overrides: { "functional-design": "minimal" },
        selected_by: "requester",
      },
    }));
    const stageAttemptId = randomUUID();
    await unitJournal.append(event(randomUUID(), unitJournalId, "construction.stage-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "functional-design",
      stage_attempt_id: stageAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }));
    await unitJournal.append(event(randomUUID(), unitJournalId, "construction.stage-waiting", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "functional-design",
      stage_attempt_id: stageAttemptId,
      reason: "Waiting for a design decision.",
    }));
    await Fs.mkdir(Path.join(root, ".kepler", "missions", missionId, "construction", "units-of-work", unitId), { recursive: true });
    await Fs.mkdir(Path.join(root, ".kepler", "units-of-work", "unbound-unit"), { recursive: true });

    const queries = new UnitQueries(
      { resolve: async () => ({ kind: "resolved", root }) },
      createNodeUnitQueryFileSystem(),
    );
    const before = await snapshot(root);
    const listed = await queries.list();
    const shown = await queries.show(unitId);
    const after = await snapshot(root);

    expect(listed.kind).toBe("listed");
    if (listed.kind !== "listed") return;
    expect(listed.units.map((unit) => unit.unit_id)).toEqual([unitId, "unbound-unit"]);
    expect(listed.units[0]).toMatchObject({
      directory: { status: "present" },
      membership: { status: "bound", mission_id: missionId },
      workflow: { status: "standard", value: "standard" },
      blockers: expect.arrayContaining([{ scope: "stage", id: "functional-design", state: "waiting" }]),
      progress: { reliable: true },
    });
    expect(listed.units[1]).toMatchObject({
      directory: { status: "present", paths: [{ path: ".kepler/units-of-work/unbound-unit", kind: "directory" }] },
      membership: { status: "missing", candidates: [] },
      workflow: { status: "unknown" },
      unknowns: expect.arrayContaining(["membership-missing", "construction-projection-unavailable"]),
    });
    expect(shown).toMatchObject({
      kind: "shown",
      unit: {
        unit_id: unitId,
        membership: { status: "bound", mission_id: missionId },
        effort: {
          default: { level: "standard", selected_by: "requester" },
          stage_overrides: { "functional-design": { level: "minimal", selected_by: "requester" } },
          effective_by_stage: { "functional-design": "minimal", "quality-requirements": "standard" },
        },
        stages: expect.arrayContaining([{ stage: "functional-design", state: "waiting", effort: "minimal" }]),
        blockers: expect.arrayContaining([{ scope: "stage", id: "functional-design", state: "waiting" }]),
        progress: { completed_stages: 0, total_stages: 6, completed_tasks: 0, known_tasks: 0, reliable: true },
      },
    });
    expect(after).toEqual(before);
  });

  it("returns explicit selector and missing-unit failures", async () => {
    const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-unit-queries-empty-"));
    temporaryRoots.push(root);
    await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
    const queries = new UnitQueries(
      { resolve: async () => ({ kind: "resolved", root }) },
      createNodeUnitQueryFileSystem(),
    );

    expect(await queries.show(" ")).toMatchObject({ kind: "failed", code: "invalid_unit_selector" });
    expect(await queries.show("unknown-unit")).toMatchObject({ kind: "failed", code: "unit_not_found" });
    expect(await queries.list()).toMatchObject({ kind: "listed", units: [] });
    expect((await Fs.readdir(Path.join(root, ".kepler"))).sort()).toEqual([]);
  });
});
