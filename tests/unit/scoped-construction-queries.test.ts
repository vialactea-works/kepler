import { describe, expect, it } from "vitest";
import { ConstructionQueries } from "../../packages/cli/src/construction/scoped-queries.js";
import type { ConstructionHistoryFact } from "../../packages/cli/src/construction/projection.js";
import type { UnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const scopeFailure = {
  kind: "failed" as const,
  code: "unit_membership_missing",
  message: "No unique recorded mission membership exists for the selected unit.",
  details: { unit_id: "unit" },
  recovery: "Resolve the recorded unit membership before retrying.",
};

const prerequisite = {
  description: "The exact opaque prerequisite is satisfied.",
  needed_for: "implementation" as const,
  needed_when: "Before admission",
  blocking: true,
  condition: "opaque:condition#exact",
  reason: "Admission requires this recorded fact.",
};
const verificationPrerequisite = {
  description: "Verification environment",
  needed_for: "verification" as const,
  needed_when: "Before verification",
  blocking: true,
  condition: "opaque:verification",
  reason: "Verification needs an environment.",
};
const optionalPrerequisite = {
  description: "Optional implementation context",
  needed_for: "implementation" as const,
  needed_when: "When available",
  blocking: false,
  condition: "opaque:optional",
  reason: "This context is informative, not an admission requirement.",
};
const implementationAttemptId = "40000000-0000-4000-8000-000000000001";
const task = { ...taskGraphExample().tasks[0]!, prerequisites: [prerequisite, verificationPrerequisite, optionalPrerequisite] };
const graph = { ...taskGraphExample(), unit_id: "unit", tasks: [task] };
const planSource = [
  "---",
  "id: 11111111-1111-4111-8111-111111111111",
  "type: implementation-plan",
  "schema_version: 3",
  "unit_id: unit",
  "author: Query Test <query@example.invalid>",
  "---",
  "# Plan",
  "",
  "## Technical solution",
  "",
  "Use the authored task contract.",
  "",
  "## Task graph context",
  "",
  "The graph is [tasks-dag.json](tasks-dag.json).",
  "",
  "## Verification strategy",
  "",
  "Run the focused checks.",
  "",
  "## Decisions and open questions",
  "",
  "No open decisions.",
  "",
].join("\n");

const evidenceFact = (
  evidenceId: string,
  inputReference: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): ConstructionHistoryFact => ({
  sourceId: "source",
  journalId: "journal",
  line: 1,
  byteOffset: 0,
  event: {
    id: `50000000-0000-4000-8000-${evidenceId.slice(-12)}`,
    type: "construction.evidence-recorded",
    caused_by: [],
    data: {
      evidence_id: evidenceId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: task.id,
      check: "task-prerequisite",
      result: { status: "passed", summary: "Prerequisite satisfied." },
      inputs: [{ reference: inputReference, purpose: "Exact prerequisite proof." }],
      ...overrides,
    },
  },
} as unknown as ConstructionHistoryFact);

const createReadinessQueries = (options: {
  readonly evidence?: readonly ConstructionHistoryFact[];
  readonly currentAttempt?: string;
  readonly parentState?: "running" | "paused" | "completed";
  readonly currentAttemptState?: "running" | "paused" | "completed";
  readonly taskState?: "admitted" | "complete";
  readonly blocked?: boolean;
  readonly noPrerequisites?: boolean;
} = {}): ConstructionQueries => {
  const root = "/virtual-record-home";
  const queryGraph = options.noPrerequisites
    ? { ...graph, tasks: [{ ...task, prerequisites: [] }] }
    : graph;
  const unit = {
    blocked: options.blocked ?? false,
    historyIssues: [],
    projectionIssues: [],
    stages: options.currentAttempt === undefined ? [] : [{
      stage: "implementation",
      state: options.parentState ?? "running",
      currentAttemptId: options.currentAttempt,
      attempts: [{ attemptId: options.currentAttempt, state: options.currentAttemptState ?? "running", facts: [] }],
    }],
    tasks: options.taskState === undefined ? [] : [{
      taskId: task.id,
      state: options.taskState,
      admissions: [],
      activities: [],
    }],
    evidence: (options.evidence ?? []).map((fact) => ({ fact, binding: "stage-attempt" })),
    approvals: [],
  };
  const context = {
    kind: "context",
    recordHome: root,
    missionId: "60000000-0000-4000-8000-000000000001",
    history: { events: [] },
    projection: {},
    unit,
  };
  const units = { readContext: async () => context } as unknown as UnitQueries;
  const fileSystem = {
    read: async (path: string) => new TextEncoder().encode(path.endsWith("tasks-dag.json") ? JSON.stringify(queryGraph) : planSource),
  } as unknown as UnitQueryFileSystem;
  return new ConstructionQueries(units, fileSystem);
};

describe("ConstructionQueries", () => {
  it("rejects invalid stage and Activity selectors before reading project state", async () => {
    const units = { readContext: async () => { throw new Error("unexpected query"); } } as unknown as UnitQueries;
    const queries = new ConstructionQueries(units, {} as UnitQueryFileSystem);

    expect(await queries.stageShow("unit", "unknown-stage")).toMatchObject({ kind: "failed", code: "invalid_stage" });
    expect(await queries.activityShow("unit", "task", "unknown-activity", "attempt")).toMatchObject({ kind: "failed", code: "invalid_activity" });
  });

  it("reports matching optional and verification facts without adding admission blockers", async () => {
    const blockingEvidenceId = "70000000-0000-4000-8000-000000000001";
    const verificationEvidenceId = "70000000-0000-4000-8000-000000000002";
    const optionalEvidenceId = "70000000-0000-4000-8000-000000000003";
    const queries = createReadinessQueries({
      currentAttempt: implementationAttemptId,
      evidence: [
        evidenceFact(blockingEvidenceId, prerequisite.condition),
        evidenceFact(verificationEvidenceId, verificationPrerequisite.condition),
        evidenceFact(optionalEvidenceId, optionalPrerequisite.condition),
      ],
    });

    const [ready, listed, shown] = await Promise.all([
      queries.taskReady("unit", task.id),
      queries.taskList("unit"),
      queries.taskShow("unit", task.id),
    ]);

    expect(ready).toMatchObject({
      kind: "task-readiness",
      readiness: "ready",
      known_prerequisite_facts: [
        { evidence_id: blockingEvidenceId, type: "construction.evidence-recorded" },
        { evidence_id: verificationEvidenceId, type: "construction.evidence-recorded" },
        { evidence_id: optionalEvidenceId, type: "construction.evidence-recorded" },
      ],
      unknown_prerequisites: [],
      blockers: [],
    });
    expect(listed).toMatchObject({ kind: "tasks-listed", tasks: [{ task_id: task.id, state: "ready", blockers: [] }] });
    expect(shown).toMatchObject({ kind: "task-shown", state: "ready", blockers: [] });
  });

  it("keeps uncovered optional and verification prerequisites unknown without gating admission readiness", async () => {
    const blockingEvidenceId = "70000000-0000-4000-8000-000000000004";
    const queries = createReadinessQueries({
      currentAttempt: implementationAttemptId,
      evidence: [evidenceFact(blockingEvidenceId, prerequisite.condition)],
    });

    expect(await queries.taskReady("unit", task.id)).toMatchObject({
      readiness: "ready",
      known_prerequisite_facts: [{ evidence_id: blockingEvidenceId }],
      unknown_prerequisites: [
        { index: 1, description: verificationPrerequisite.description, status: "unknown" },
        { index: 2, description: optionalPrerequisite.description, status: "unknown" },
      ],
      blockers: [],
    });
  });

  it("does not apply stale evidence or gate tasks without prerequisites when no Implementation attempt is current", async () => {
    const stale = evidenceFact("70000000-0000-4000-8000-000000000002", prerequisite.condition, {
      stage_attempt_id: "40000000-0000-4000-8000-000000000099",
    });
    const queries = createReadinessQueries({ evidence: [stale] });

    const readiness = await queries.taskReady("unit", task.id);
    expect(readiness).toMatchObject({
      readiness: "blocked",
      known_prerequisite_facts: [],
      blockers: [`blocking-prerequisite-unverified:${prerequisite.description}`],
    });
    expect(readiness.kind === "task-readiness" && readiness.unknown_prerequisites).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, description: prerequisite.description, status: "unknown" }),
    ]));
    expect(await createReadinessQueries({ noPrerequisites: true }).taskReady("unit", task.id)).toMatchObject({
      readiness: "ready",
      blockers: [],
    });
  });

  it.each([
    ["admitted", "already_admitted"],
    ["complete", "complete"],
  ] as const)("preserves projected %s state while reporting current prerequisite proof", async (taskState, readiness) => {
    const evidenceId = "70000000-0000-4000-8000-000000000003";
    const queries = createReadinessQueries({
      currentAttempt: implementationAttemptId,
      taskState,
      evidence: [evidenceFact(evidenceId, prerequisite.description)],
    });

    expect(await queries.taskReady("unit", task.id)).toMatchObject({
      task_state: taskState,
      readiness,
      known_prerequisite_facts: [{ evidence_id: evidenceId }],
      blockers: [],
    });
  });

  it.each([
    ["paused", "paused", "admitted", "already_admitted"],
    ["completed", "completed", "complete", "complete"],
  ] as const)("retains prerequisite proof for a %s current parent and %s task", async (parentState, currentAttemptState, taskState, readiness) => {
    const evidenceId = "70000000-0000-4000-8000-000000000005";
    const queries = createReadinessQueries({
      currentAttempt: implementationAttemptId,
      parentState,
      currentAttemptState,
      taskState,
      evidence: [evidenceFact(evidenceId, prerequisite.condition)],
    });

    const [ready, listed, shown] = await Promise.all([
      queries.taskReady("unit", task.id),
      queries.taskList("unit"),
      queries.taskShow("unit", task.id),
    ]);
    expect(ready).toMatchObject({
      task_state: taskState,
      readiness,
      known_prerequisite_facts: [{ evidence_id: evidenceId }],
      unknown_prerequisites: [
        { index: 1, description: verificationPrerequisite.description, status: "unknown" },
        { index: 2, description: optionalPrerequisite.description, status: "unknown" },
      ],
      blockers: [],
    });
    expect(listed).toMatchObject({ kind: "tasks-listed", tasks: [{ task_id: task.id, state: taskState, blockers: [] }] });
    expect(shown).toMatchObject({ kind: "task-shown", state: taskState, blockers: [] });
  });

  it("does not carry proof from a different current Implementation attempt", async () => {
    const oldEvidence = evidenceFact("70000000-0000-4000-8000-000000000006", prerequisite.condition, {
      stage_attempt_id: "40000000-0000-4000-8000-000000000099",
    });
    const queries = createReadinessQueries({ currentAttempt: implementationAttemptId, evidence: [oldEvidence] });

    expect(await queries.taskReady("unit", task.id)).toMatchObject({
      readiness: "blocked",
      known_prerequisite_facts: [],
      unknown_prerequisites: expect.arrayContaining([expect.objectContaining({ index: 0, status: "unknown" })]),
      blockers: [`blocking-prerequisite-unverified:${prerequisite.description}`],
    });
  });

  it("does not expose raw prerequisite evidence from blocked projection history", async () => {
    const evidenceId = "70000000-0000-4000-8000-000000000007";
    const queries = createReadinessQueries({
      currentAttempt: implementationAttemptId,
      taskState: "admitted",
      blocked: true,
      evidence: [evidenceFact(evidenceId, prerequisite.condition)],
    });

    expect(await queries.taskReady("unit", task.id)).toMatchObject({
      readiness: "unknown",
      known_prerequisite_facts: [],
      unknown_prerequisites: expect.arrayContaining([expect.objectContaining({ index: 0, status: "unknown" })]),
      blockers: [`blocking-prerequisite-unverified:${prerequisite.description}`],
    });
  });

  it("propagates missing unit binding through each scoped query without reading graph files", async () => {
    const units = { readContext: async () => scopeFailure } as unknown as UnitQueries;
    const queries = new ConstructionQueries(units, {} as UnitQueryFileSystem);

    expect(await queries.stageShow("unit", "implementation")).toEqual(scopeFailure);
    expect(await queries.taskList("unit")).toEqual(scopeFailure);
    expect(await queries.taskShow("unit", "task")).toEqual(scopeFailure);
    expect(await queries.taskReady("unit", "task")).toEqual(scopeFailure);
    expect(await queries.activityShow("unit", "task", "code-generation", "attempt")).toEqual(scopeFailure);
  });
});
