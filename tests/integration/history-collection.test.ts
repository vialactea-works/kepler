import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import Path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectHistory as collectHistoryFromSources,
  isHistoryScopeBlocked,
  type HistoryJournalSource,
} from "../../packages/cli/src/history/collection.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const unitId = "integration-unit";
const journalId = "journal-integration";
const directories: string[] = [];
const encoder = new TextEncoder();

const createHome = async (): Promise<string> => {
  const directory = await mkdtemp(Path.join(tmpdir(), "kepler-history-integration-"));
  directories.push(directory);
  return directory;
};

const coordinates = (recordHome: string) => ({ recordHome, missionId, phase: "construction", journalId });

const event = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[] = [],
  eventVersion = 1,
) => ({
  id,
  phase: "construction",
  type,
  envelope_version: 1,
  event_version: eventVersion,
  journal_id: journalId,
  recorded_at: "2026-10-18T14:30:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
});

const unitCreated = (id: string, selectedUnitId: string) => event(id, "construction.unit-created", {
  mission_id: missionId,
  unit_id: selectedUnitId,
  directory: `construction/units-of-work/${selectedUnitId}`,
  workflow: "standard",
  initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" },
});

const collectHistory = (
  selectedMissionId: string,
  sources: readonly HistoryJournalSource[],
  completeness: "complete" | "incomplete" = "complete",
) => collectHistoryFromSources(selectedMissionId, sources, { completeness });

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("persisted Construction history integration", () => {
  it("collects a historical version 1 Quality completion without newer required fields", async () => {
    const home = await createHome();
    const journal = createEventJournal(coordinates(home));
    const created = unitCreated("event-historical-unit", unitId);
    const completed = event("event-historical-quality", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "quality-requirements",
      stage_attempt_id: "20000000-0000-4000-8000-000000000002",
      evidence_ids: [],
      checkpoints: [],
      quality_requirements_assessment: {
        approval_event_id: "30000000-0000-4000-8000-000000000003",
        artifact_bindings: [],
        assessments: {},
      },
    }, [created.id], 1);
    await journal.append(created);
    await journal.append(completed);
    const persisted = await journal.read();
    const history = collectHistory(missionId, [{
      sourceId: "origin://integration/historical-quality-v1",
      missionId,
      phase: "construction",
      journalId,
      bytes: persisted.bytes,
    }]);
    expect(history.issues).toEqual([]);
    expect(history.events.map((fact) => fact.status)).toEqual(["valid", "valid"]);
    expect(projectConstruction(history).projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [completed.id],
    }));
  });

  it("imports journal-local causal dependencies and rebuilds the same projection", async () => {
    const home = await createHome();
    const journal = createEventJournal(coordinates(home));
    const created = unitCreated("event-unit-created", unitId);
    const started = event("event-stage-started", "construction.stage-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: "20000000-0000-4000-8000-000000000002",
      inputs: [{ reference: "opaque: source  ", purpose: "Accepted source material" }],
      checkpoints: [{ repository_id: "repository-main", commit: "checkpoint-1" }],
      authority_event_ids: [],
    }, [created.id]);
    const evidence = event("event-stage-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: "20000000-0000-4000-8000-000000000002",
      evidence_id: "60000000-0000-4000-8000-000000000006",
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repository-main", commit: "checkpoint-1" }],
      inputs: [{ reference: "opaque: checked material  ", purpose: "Material inspected" }],
      check: "Inspect the design result",
      executor: "agent:reviewer",
      result: { status: "passed", summary: "The design result is complete" },
      output_refs: ["opaque: design output  "],
      conditions: [],
    }, [started.id]);
    const completed = event("event-stage-completed", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: "20000000-0000-4000-8000-000000000002",
      evidence_ids: ["60000000-0000-4000-8000-000000000006"],
      checkpoints: [{ repository_id: "repository-main", commit: "checkpoint-1" }],
    }, [started.id, evidence.id]);
    await journal.append(created);
    await journal.append(started);
    await journal.append(evidence);
    await journal.append(completed);
    const persisted = await journal.read();
    const source: HistoryJournalSource = {
      sourceId: "origin://integration/journal-integration",
      missionId,
      phase: "construction",
      journalId,
      bytes: persisted.bytes,
    };
    const first = collectHistory(missionId, [source]);
    const rebuilt = collectHistory(missionId, [{ ...source, bytes: persisted.bytes.slice() }]);
    const projection = projectConstruction(first);
    expect(first.issues).toEqual([]);
    expect(first.events.map((record) => [record.event?.id, record.line, record.sourceId])).toEqual([
      [created.id, 1, source.sourceId],
      [started.id, 2, source.sourceId],
      [evidence.id, 3, source.sourceId],
      [completed.id, 4, source.sourceId],
    ]);
    expect(projection).toEqual(projectConstruction(rebuilt));
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "implementation")?.state).toBe("unknown");
    expect(projection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [completed.id],
    }));
    expect(projection.units[0]?.progress).toEqual({
      completedStages: 0,
      totalStages: 6,
      completedTasks: 0,
      knownTasks: 0,
      reliable: false,
    });
    expect(await readdir(Path.dirname(journal.path))).toEqual([Path.basename(journal.path)]);
    const incompleteProjection = projectConstruction(collectHistory(missionId, [source], "incomplete"));
    expect(incompleteProjection.blocked).toBe(true);
    expect(incompleteProjection.units[0]?.blocked).toBe(true);
    expect(incompleteProjection.units[0]?.stages.find((stage) => stage.stage === "implementation")?.state)
      .toBe("unknown");
    expect(incompleteProjection.units[0]?.progress).toEqual({
      completedStages: 0,
      totalStages: 6,
      completedTasks: 0,
      knownTasks: 0,
      reliable: false,
    });
    expect(projection.blocked).toBe(false);
  });

  it("blocks only the unit with an unsupported imported event version", async () => {
    const home = await createHome();
    const journal = createEventJournal(coordinates(home));
    await journal.append(unitCreated("event-unit-valid", unitId));
    const unsupported = unitCreated("event-unit-unsupported", "unsupported-unit");
    const unsupportedBytes = encoder.encode(`${JSON.stringify({ ...unsupported, event_version: 2 })}\n`);
    const existing = await journal.read();
    const combined = new Uint8Array(existing.bytes.length + unsupportedBytes.length);
    combined.set(existing.bytes);
    combined.set(unsupportedBytes, existing.bytes.length);
    await writeFile(journal.path, combined);
    const persisted = await journal.read();
    const source: HistoryJournalSource = {
      sourceId: "origin://integration/journal-integration",
      missionId,
      phase: "construction",
      journalId,
      bytes: persisted.bytes,
    };
    const history = collectHistory(missionId, [source]);
    expect(history.events.at(-1)?.status).toBe("unsupported");
    expect(isHistoryScopeBlocked(history, { missionId, unitId: "unsupported-unit" })).toBe(true);
    expect(isHistoryScopeBlocked(history, { missionId, unitId })).toBe(false);
    expect(persisted.bytes).toEqual(combined);
  });
});
