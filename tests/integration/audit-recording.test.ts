import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditContextResolver, createNodeAuditContextFileSystem, createNodeAuditJournalFactory } from "../../packages/cli/src/audit/context.js";
import { AuditRecording } from "../../packages/cli/src/audit/recording.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";

const temporaryRoots: string[] = [];
const missionId = "10000000-0000-4000-8000-000000000001";
const unitId = "2026-10-21-audit-tests";
const stageAttemptId = "30000000-0000-4000-8000-000000000003";
const implementationAttemptId = "70000000-0000-4000-8000-000000000007";
const taskId = "80000000-0000-4000-8000-000000000008";
const activityAttemptId = "90000000-0000-4000-8000-000000000009";
const initialJournalId = "40000000-0000-4000-8000-000000000004";
const eventIds = [
  "50000000-0000-4000-8000-000000000005",
  "60000000-0000-4000-8000-000000000006",
];

const createProject = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-audit-recording-"));
  temporaryRoots.push(root);
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  const history = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
  await Fs.mkdir(history, { recursive: true });
  const journal = createEventJournal({ recordHome: root, missionId, journalId: initialJournalId, phase: CONSTRUCTION_PHASE });
  await journal.append({
    id: eventIds[0],
    phase: CONSTRUCTION_PHASE,
    type: "construction.unit-created",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:00:00Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      directory: `units-of-work/${unitId}`,
      workflow: "standard",
      initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" },
    },
  });
  await journal.append({
    id: eventIds[1],
    phase: CONSTRUCTION_PHASE,
    type: "construction.stage-attempt-started",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:01:00Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      stage: "functional-design",
      stage_attempt_id: stageAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    },
  });
  await journal.append({
    id: "e0000000-0000-4000-8000-00000000000e",
    phase: CONSTRUCTION_PHASE,
    type: "construction.unit-baseline-selected",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:01:20Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [eventIds[0]],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    },
  });
  await journal.append({
    id: "a0000000-0000-4000-8000-00000000000a",
    phase: CONSTRUCTION_PHASE,
    type: "construction.stage-attempt-started",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:01:30Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [eventIds[0]],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    },
  });
  await journal.append({
    id: "b0000000-0000-4000-8000-00000000000b",
    phase: CONSTRUCTION_PHASE,
    type: "construction.task-admitted",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:01:40Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: ["a0000000-0000-4000-8000-00000000000a", "e0000000-0000-4000-8000-00000000000e"],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      graph_ref: { graph_id: "c0000000-0000-4000-8000-00000000000c", content_version: "graph-1" },
      task_definition_ref: { graph_id: "c0000000-0000-4000-8000-00000000000c", task_id: taskId, content_version: "task-1" },
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    },
  });
  await journal.append({
    id: "d0000000-0000-4000-8000-00000000000d",
    phase: CONSTRUCTION_PHASE,
    type: "construction.activity-attempt-started",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: initialJournalId,
    recorded_at: "2026-10-21T12:01:50Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: ["b0000000-0000-4000-8000-00000000000b"],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      activity: "code-generation",
      activity_attempt_id: activityAttemptId,
      inputs: [],
      checkpoints: [],
    },
  });
  return root;
};

const createRecorder = (root: string) => {
  const projects = new ProjectResolver({
    cwd: () => root,
    fileSystem: { realpath: (path) => Fs.realpath(path), directoryExists: async (path) => (await Fs.stat(path)).isDirectory() },
    git: { isBareRepository: async () => ({ status: 0, stdout: "false\n", stderr: "" }), repositoryRoot: async () => ({ status: 0, stdout: `${root}\n`, stderr: "" }), configValue: async () => ({ status: 0, stdout: "", stderr: "" }) },
  });
  const contexts = new AuditContextResolver({
    projects,
    fileSystem: createNodeAuditContextFileSystem(),
    journals: createNodeAuditJournalFactory(),
    identities: { next: randomUUID },
  });
  return new AuditRecording(contexts, {
    identities: { next: randomUUID },
    now: () => "2026-10-21T12:02:00Z",
    producer: { name: "kepler", version: "0.10.3" },
  });
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await Fs.rm(root, { recursive: true, force: true });
});

describe("audit recording with real journals", () => {
  it("appends a typed failed evidence result with explicit attempt and material bindings", async () => {
    const root = await createProject();
    const result = await createRecorder(root).execute("evidence", {
      unit: unitId,
      stage: "functional-design",
      attempt: stageAttemptId,
    }, {
      inputs: [{ reference: "opaque:design-check", purpose: "Design review" }],
      artifact_bindings: [],
      checkpoints: [],
      check: "Design review",
      executor: "Reviewer",
      result: { status: "failed", summary: "Blocking issue remains" },
    });

    expect(result).toMatchObject({ kind: "success", data: { id: expect.any(String), journal_id: expect.any(String), evidence_id: expect.any(String) } });
    const auditJournalId = String(result.data.journal_id);
    const journal = createEventJournal({ recordHome: root, missionId, journalId: auditJournalId, phase: CONSTRUCTION_PHASE });
    const scan = await journal.read();
    expect(scan.problems).toEqual([]);
    expect(scan.lines).toHaveLength(1);
    expect(scan.lines[0]?.event).toMatchObject({
      type: "construction.evidence-recorded",
      data: { result: { status: "failed" }, stage_attempt_id: stageAttemptId, unit_id: unitId },
    });
  });

  it("records task and Activity events through their phase-owned selectors without requiring --stage", async () => {
    const root = await createProject();
    const recorder = createRecorder(root);
    const taskEvidence = await recorder.execute("evidence", {
      unit: unitId,
      task: taskId,
      implementationAttempt: implementationAttemptId,
    }, {
      inputs: [{ reference: "opaque:task-output", purpose: "Task output" }],
      artifact_bindings: [],
      checkpoints: [],
      check: "Task review",
      executor: "Reviewer",
      result: { status: "passed", summary: "Task output is valid" },
    });
    const activityApproval = await recorder.execute("approval", {
      unit: unitId,
      task: taskId,
      activity: "code-generation",
      implementationAttempt: implementationAttemptId,
      attempt: activityAttemptId,
    }, {
      requester: "Requester",
      inputs: [{ reference: "opaque:activity-output", purpose: "Reviewed Activity output" }],
      artifact_bindings: [],
      checkpoints: [],
      decision_reference: "opaque:activity-decision",
    });

    expect(taskEvidence).toMatchObject({ kind: "success", data: { id: expect.any(String) } });
    expect(activityApproval).toMatchObject({ kind: "success", data: { id: expect.any(String) } });
  });

  it("rejects a nonexistent attempt without creating a journal", async () => {
    const root = await createProject();
    const result = await createRecorder(root).execute("approval", {
      unit: unitId,
      stage: "functional-design",
      attempt: "70000000-0000-4000-8000-000000000007",
    }, {
      requester: "Requester",
      inputs: [{ reference: "opaque:design", purpose: "Reviewed design" }],
      artifact_bindings: [],
      checkpoints: [],
      decision_reference: "opaque:decision",
    });

    expect(result.kind).toBe("failed");
    const files = await Fs.readdir(Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE));
    expect(files).toEqual([`${initialJournalId}.jsonl`]);
  });
});
