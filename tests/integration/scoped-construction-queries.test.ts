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
import { ConstructionQueries } from "../../packages/cli/src/construction/scoped-queries.js";
import { createNodeUnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries-runtime.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const journalId = "20000000-0000-4000-8000-000000000002";
const planArtifactId = "11111111-1111-4111-8111-111111111111";
const unitId = "2026-10-21-scoped-query-unit";
const graph = { ...taskGraphExample(), unit_id: unitId };
const task = graph.tasks[0]!;
const dependentTask = graph.tasks[1]!;
const temporaryRoots: string[] = [];

const event = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[] = [],
): EventEnvelope<Record<string, unknown>> => ({
  id: id as EventId,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: EVENT_ENVELOPE_VERSION,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId as JournalId,
  recorded_at: "2026-10-21T12:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: causedBy as EventId[],
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
      } else if (entry.isFile()) result.push(`file:${relative}:${(await Fs.readFile(path)).toString("base64")}`);
    }
  };
  await visit(root);
  return result;
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("scoped Construction queries", () => {
  it("projects stage, task, readiness, and Activity state with original links without writing", async () => {
    const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-scoped-queries-"));
    temporaryRoots.push(root);
    const unitRoot = Path.join(root, ".kepler", "missions", missionId, "construction", "units-of-work", unitId);
    await Fs.mkdir(unitRoot, { recursive: true });
    await Fs.mkdir(Path.join(root, ".git"));
    await Fs.writeFile(Path.join(unitRoot, "tasks-dag.json"), `${JSON.stringify(graph, null, 2)}\n`);
    await Fs.writeFile(Path.join(unitRoot, "plan.md"), `---\nid: ${planArtifactId}\ntype: implementation-plan\nschema_version: 3\nunit_id: ${unitId}\nauthor: Query Test <query@example.invalid>\n---\n# Plan\n`);
    const journal = createEventJournal({ recordHome: root, missionId, journalId, phase: CONSTRUCTION_PHASE });
    const missionCreatedId = randomUUID();
    await journal.append(event(missionCreatedId, "construction.mission-created", {
      mission_id: missionId,
      title: "Exercise scoped queries",
      request: "Read Construction state without changing it.",
      workflow: "standard",
      record_home: { repository_id: "record-home" },
      contexts: [],
      repositories: [{
        repository_id: "record-home",
        context: { kind: "existing" },
        branch: { kind: "current" },
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "no-commit" },
      }],
    }));
    const creationId = randomUUID();
    await journal.append(event(creationId, "construction.unit-created", {
      mission_id: missionId,
      unit_id: unitId,
      directory: `construction/units-of-work/${unitId}`,
      workflow: "standard",
      initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" },
    }));
    const implementationAttemptId = randomUUID();
    const implementationStartId = randomUUID();
    await journal.append(event(implementationStartId, "construction.stage-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }, [creationId]));
    const baselineId = randomUUID();
    await journal.append(event(baselineId, "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: unitId,
      review_baseline: [],
      integration_targets: [{ repository_id: "record-home", target: "refs/heads/main" }],
    }, [implementationStartId]));
    const admissionId = randomUUID();
    await journal.append(event(admissionId, "construction.task-admitted", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: task.id,
      graph_ref: { graph_id: graph.id, content_version: "graph-v1" },
      task_definition_ref: { graph_id: graph.id, task_id: task.id, content_version: "task-v1" },
      admission_baseline: [],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    }, [implementationStartId, baselineId]));
    const activityAttemptId = randomUUID();
    const activityStartId = randomUUID();
    await journal.append(event(activityStartId, "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: task.id,
      activity: "code-generation",
      activity_attempt_id: activityAttemptId,
      inputs: [],
      checkpoints: [],
    }, [admissionId]));
    const evidenceEventId = randomUUID();
    await journal.append(event(evidenceEventId, "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      evidence_id: randomUUID(),
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: task.id,
      activity: "code-generation",
      activity_attempt_id: activityAttemptId,
      artifact_bindings: [],
      checkpoints: [],
      inputs: [],
      check: "generation-self-review",
      executor: "requester",
      result: { status: "passed", summary: "The change follows the task contract." },
      output_refs: ["source-review"],
      conditions: [],
    }, [activityStartId]));
    const activityWaitingId = randomUUID();
    await journal.append(event(activityWaitingId, "construction.activity-waiting", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: task.id,
      activity: "code-generation",
      activity_attempt_id: activityAttemptId,
      reason: "Waiting for the next orchestration decision.",
    }, [activityStartId]));

    const fileSystem = createNodeUnitQueryFileSystem();
    const units = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem);
    const queries = new ConstructionQueries(units, fileSystem);
    const before = await snapshot(root);
    const stage = await queries.stageShow(unitId, "implementation");
    const tasks = await queries.taskList(unitId);
    const shownTask = await queries.taskShow(unitId, task.id);
    const readiness = await queries.taskReady(unitId, dependentTask.id);
    const activity = await queries.activityShow(unitId, task.id, "code-generation", implementationAttemptId);
    const after = await snapshot(root);

    expect(stage).toMatchObject({
      kind: "stage-shown",
      stage: "implementation",
      state: "running",
      current_attempt_id: implementationAttemptId,
      effort: "standard",
    });
    expect(tasks).toMatchObject({
      kind: "tasks-listed",
      tasks: [
        { task_id: task.id, state: "waiting" },
        { task_id: dependentTask.id, state: "blocked" },
      ],
    });
    expect(shownTask).toMatchObject({
      kind: "task-shown",
      state: "waiting",
      current_scope: { implementation_attempt_id: implementationAttemptId },
      activities: expect.arrayContaining([expect.objectContaining({
        activity: "code-generation",
        attempts: expect.arrayContaining([expect.objectContaining({
          attempt_id: activityAttemptId,
          implementation_attempt_id: implementationAttemptId,
        })]),
      })]),
      evidence: expect.arrayContaining([expect.objectContaining({ event_id: evidenceEventId, type: "construction.evidence-recorded" })]),
    });
    expect(readiness).toMatchObject({
      kind: "task-readiness",
      readiness: "blocked",
      dependencies: [{ task_id: task.id, status: "not_integrated", declared_outputs: task.outputs, integration_events: [], integrated_output_refs: [] }],
      unknown_prerequisites: [{ description: dependentTask.prerequisites[0]?.description, blocking: true, status: "unknown" }],
      blockers: expect.arrayContaining([`predecessor-not-integrated:${task.id}`]),
    });
    expect(activity).toMatchObject({
      kind: "activity-shown",
      state: "waiting",
      current_attempt_id: activityAttemptId,
      implementation_attempt_id: implementationAttemptId,
      attempts: [expect.objectContaining({
        attempt_id: activityAttemptId,
        implementation_attempt_id: implementationAttemptId,
        events: expect.arrayContaining([
          { event_id: activityStartId, type: "construction.activity-attempt-started", caused_by: [admissionId] },
          { event_id: activityWaitingId, type: "construction.activity-waiting", caused_by: [activityStartId] },
        ]),
      })],
      evidence: expect.arrayContaining([expect.objectContaining({ event_id: evidenceEventId, type: "construction.evidence-recorded" })]),
    });
    expect(after).toEqual(before);
  });

  it("rejects unbound units without writing", async () => {
    const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-scoped-queries-invalid-"));
    temporaryRoots.push(root);
    await Fs.mkdir(Path.join(root, ".kepler", "units-of-work", "unbound-unit"), { recursive: true });
    const fileSystem = createNodeUnitQueryFileSystem();
    const units = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem);
    const queries = new ConstructionQueries(units, fileSystem);

    expect(await queries.stageShow("unbound-unit", "implementation")).toMatchObject({ kind: "failed", code: "unit_membership_missing" });
    expect(await queries.taskList("unbound-unit")).toMatchObject({ kind: "failed", code: "unit_membership_missing" });
    expect((await Fs.readdir(Path.join(root, ".kepler", "units-of-work", "unbound-unit"))).sort()).toEqual([]);
  });
});
