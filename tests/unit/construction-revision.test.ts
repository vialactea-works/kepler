import { describe, expect, it } from "vitest";
import { CONSTRUCTION_ACTIVITIES, CONSTRUCTION_STAGES } from "../../packages/cli/src/construction/events.js";
import {
  deriveRevisionCascade,
  Revision,
  validateRevisionBoundary,
  validateRevisionRequest,
} from "../../packages/cli/src/construction/revision.js";
import type { AuditContextResolver } from "../../packages/cli/src/audit/context.js";
import type { ConstructionHistoryFact, ConstructionUnitProjection } from "../../packages/cli/src/construction/projection.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";

const request = {
  orchestrator_decision: "Return implementation to Code Generation",
  reason: "Validation found a defect in the generated output.",
  inputs: [{ reference: "evidence:validation-1", purpose: "Failed validation evidence" }],
};

const unitProjection = (
  stages: readonly unknown[],
  tasks: readonly unknown[] = [],
  unitId = "unit-1",
  missionId = "mission-1",
): ConstructionUnitProjection => ({
  missionId,
  unitId,
  initialized: true,
  blocked: false,
  historyIssues: [],
  projectionIssues: [],
  workflow: "standard",
  stages,
  tasks,
  evidence: [],
  approvals: [],
  interactions: [],
  revisions: [],
  retainedScopeAssessments: [],
  completionAssessments: [],
  progress: { completedStages: 0, totalStages: 8, completedTasks: 0, knownTasks: 0, reliable: true },
} as unknown as ConstructionUnitProjection);

const stageProjection = (
  stage: string,
  attemptId?: string,
  state = "not_started",
  attemptState = state,
) => ({
  stage,
  state,
  ...(attemptId ? { currentAttemptId: attemptId } : {}),
  attempts: attemptId ? [{ attemptId, state: attemptState, facts: [] }] : [],
});

const validStageProjections = (currentStage: string, attemptId: string) => CONSTRUCTION_STAGES.map((stage) =>
  stage === currentStage ? stageProjection(stage, attemptId, "running") : stageProjection(stage),
);

describe("revision request validation", () => {
  it("accepts typed decision, reason, and supporting inputs", () => {
    expect(validateRevisionRequest(request)).toEqual({ kind: "valid", request });
  });

  it("rejects missing authority, reason, and supporting inputs", () => {
    const result = validateRevisionRequest({ orchestrator_decision: " ", reason: "", inputs: [] });
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.issues.map((issue) => issue.pointer)).toEqual([
        "/orchestrator_decision",
        "/reason",
        "/inputs",
      ]);
    }
  });

  it("rejects unknown request and input fields", () => {
    const result = validateRevisionRequest({
      ...request,
      force: true,
      inputs: [{ ...request.inputs[0], trusted: true }],
    });
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.issues.map((issue) => issue.pointer)).toEqual(["/force", "/inputs/0"]);
    }
  });

  it("rejects non-object requests and empty input references", () => {
    expect(validateRevisionRequest(null).kind).toBe("invalid");
    expect(validateRevisionRequest({ ...request, inputs: [{ reference: "  ", purpose: "source" }] }).kind).toBe("invalid");
  });
});

describe("revision boundary selection", () => {
  it("accepts an exact stage and attempt boundary", () => {
    expect(validateRevisionBoundary({ unit: "unit-1", stage: "unit-of-work-review", attempt: "review-1" })).toEqual({
      kind: "valid",
      boundary: { kind: "stage", unitId: "unit-1", stage: "unit-of-work-review", attemptId: "review-1" },
    });
  });

  it("accepts an exact task Activity and Implementation-attempt boundary", () => {
    expect(validateRevisionBoundary({
      unit: "unit-1",
      task: "task-1",
      activity: "code-validation",
      implementationAttempt: "implementation-1",
      attempt: "validation-1",
    })).toEqual({
      kind: "valid",
      boundary: {
        kind: "activity",
        unitId: "unit-1",
        taskId: "task-1",
        activity: "code-validation",
        implementationAttemptId: "implementation-1",
        attemptId: "validation-1",
      },
    });
  });

  it("rejects missing and mixed boundary selectors", () => {
    expect(validateRevisionBoundary({ unit: "unit-1", stage: "implementation" } as ScopeSelectors).kind).toBe("invalid");
    expect(validateRevisionBoundary({
      unit: "unit-1",
      stage: "implementation",
      task: "task-1",
      activity: "code-generation",
      attempt: "attempt-1",
      implementationAttempt: "implementation-1",
    } as ScopeSelectors).kind).toBe("invalid");
  });
});

describe("revision cascade derivation", () => {
  it("derives the selected stage through Deliver and only current attempts", () => {
    const stages = validStageProjections("implementation", "implementation-1");
    const laterStage = stages.find((stage) => stage.stage === "unit-of-work-review");
    if (laterStage) Object.assign(laterStage, stageProjection("unit-of-work-review", "review-1", "completed"));
    const result = deriveRevisionCascade(unitProjection(stages), {
      kind: "stage",
      unitId: "unit-1",
      stage: "implementation",
      attemptId: "implementation-1",
    });
    expect(result).toEqual({
      kind: "valid",
      cascade: {
        kind: "stage",
        stages: CONSTRUCTION_STAGES.slice(CONSTRUCTION_STAGES.indexOf("implementation")),
        attempts: [
          { stage: "implementation", attemptId: "implementation-1" },
          { stage: "unit-of-work-review", attemptId: "review-1" },
        ],
      },
    });
  });

  it("rejects an attempt that is not the current exact stage attempt", () => {
    const result = deriveRevisionCascade(unitProjection([
      stageProjection("implementation", "implementation-2", "running"),
    ]), {
      kind: "stage",
      unitId: "unit-1",
      stage: "implementation",
      attemptId: "implementation-1",
    });
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.code).toBe("revision_attempt_not_current");
  });

  it("derives the target and later Activity scopes under one active parent", () => {
    const implementationAttemptId = "implementation-1";
    const activities = CONSTRUCTION_ACTIVITIES.map((activity, index) => ({
      activity,
      state: index < 2 ? "completed" : "not_started",
      ...(index < 2 ? { currentAttemptId: `${activity}-1`, stageAttemptId: implementationAttemptId } : {}),
      attempts: index < 2 ? [{
        attemptId: `${activity}-1`,
        stageAttemptId: implementationAttemptId,
        state: "completed",
        facts: [],
      }] : [],
      facts: [],
      prepared: [],
      accepted: [],
    }));
    const task = {
      taskId: "task-1",
      state: "active",
      stageAttemptId: implementationAttemptId,
      admissions: [],
      activities,
      facts: [],
    };
    const result = deriveRevisionCascade(unitProjection([
      stageProjection("implementation", implementationAttemptId, "running"),
    ], [task]), {
      kind: "activity",
      unitId: "unit-1",
      taskId: "task-1",
      activity: "code-validation",
      implementationAttemptId,
      attemptId: "code-validation-1",
    });
    expect(result).toEqual({
      kind: "valid",
      cascade: {
        kind: "activity",
        activities: CONSTRUCTION_ACTIVITIES.slice(CONSTRUCTION_ACTIVITIES.indexOf("code-validation")),
        attempts: [
          { taskId: "task-1", activity: "code-validation", implementationAttemptId, attemptId: "code-validation-1" },
          { taskId: "task-1", activity: "code-integration", implementationAttemptId },
        ],
      },
    });
  });

  it("appends one causal authorization with derived scopes and resumes without duplicate acceptance", async () => {
    const missionId = "10000000-0000-4000-8000-000000000001";
    const unitId = "10000000-0000-4000-8000-000000000002";
    const selectedAttemptId = "10000000-0000-4000-8000-000000000003";
    const qualityAttemptId = "10000000-0000-4000-8000-000000000004";
    const implementationAttemptId = "10000000-0000-4000-8000-000000000005";
    const baseEvent = {
      id: "10000000-0000-4000-8000-000000000006",
      phase: "construction",
      envelope_version: 1,
      event_version: 1,
      journal_id: "10000000-0000-4000-8000-000000000007",
      type: "construction.stage-attempt-started",
      recorded_at: "2026-10-20T00:00:00.000Z",
      producer: { name: "kepler-test", version: "1.0.0" },
      caused_by: [],
      data: {
        mission_id: missionId,
        unit_id: unitId,
        stage: "functional-design",
        stage_attempt_id: selectedAttemptId,
        inputs: [],
        checkpoints: [],
        authority_event_ids: [],
      },
    } as unknown as ConstructionHistoryFact["event"];
    const fact: ConstructionHistoryFact = {
      sourceId: "fixture-source",
      journalId: baseEvent.journal_id,
      line: 1,
      byteOffset: 0,
      event: baseEvent,
    };
    const stages = CONSTRUCTION_STAGES.map((stage) => {
      if (stage === "functional-design") {
        return {
          ...stageProjection(stage, selectedAttemptId, "running"),
          attempts: [{ attemptId: selectedAttemptId, state: "running", facts: [fact] }],
        };
      }
      if (stage === "quality-requirements") return stageProjection(stage, qualityAttemptId, "completed");
      if (stage === "implementation") return stageProjection(stage, implementationAttemptId, "completed");
      return stageProjection(stage);
    });
    const eventRecords: Array<{ readonly event: ConstructionHistoryFact["event"] }> = [{ event: baseEvent }];
    const loaded = {
      kind: "loaded",
      root: "/tmp/kepler-revision-unit",
      missionId,
      history: { events: eventRecords },
      projection: {} as never,
      unit: unitProjection(stages, [], unitId, missionId),
    } as unknown as Awaited<ReturnType<AuditContextResolver["readUnit"]>>;
    const appended: ConstructionHistoryFact["event"][] = [];
    const journal = {
      append: async (event: ConstructionHistoryFact["event"]) => {
        appended.push(event);
        eventRecords.push({ event });
        return { status: "appended", eventId: event.id, line: appended.length };
      },
    } as unknown as EventJournal;
    const revisionId = "20000000-0000-4000-8000-000000000004";
    const ids = [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
      revisionId,
    ];
    const runtime = {
      workspace: {
        git: { run: async () => ({ status: 0, stdout: ".git", stderr: "" }) },
        fileSystem: {
          realpath: async (path: string) => path,
          pathKind: async () => "missing",
        },
        coordination: {
          acquire: async () => ({
            kind: "acquired",
            lease: { lockPath: "/tmp/coordination", owner: {}, release: async () => ({ kind: "released" }) },
          }),
        },
        identity: { machine_id: "saturn", process_id: 1, process_incarnation_id: "process-incarnation" },
      },
      identities: { next: () => {
        const next = ids.shift();
        if (!next) throw new Error("No more identities are available.");
        return next;
      } },
      now: () => "2026-10-20T00:01:00.000Z",
      producer: { name: "kepler-test", version: "1.0.0" },
      journals: { create: () => journal },
    } as never;
    const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
    const service = new Revision(contexts, runtime);
    const selectors: ScopeSelectors = { unit: unitId, stage: "functional-design", attempt: selectedAttemptId };

    const first = await service.execute(selectors, request);
    expect(first.kind).toBe("success");
    expect(appended.map((event) => event.type)).toEqual([
      "construction.interaction-recorded",
      "construction.revision-authorized",
    ]);
    expect(appended[1]?.data).toMatchObject({
      revision_id: revisionId,
      inputs: request.inputs,
      affected_scopes: [
        { kind: "stage", stage: "functional-design", stage_attempt_id: selectedAttemptId },
        { kind: "stage", stage: "quality-requirements", stage_attempt_id: qualityAttemptId },
        { kind: "stage", stage: "implementation-planning" },
        { kind: "stage", stage: "implementation", stage_attempt_id: implementationAttemptId },
        { kind: "stage", stage: "unit-of-work-review" },
        { kind: "stage", stage: "deliver" },
      ],
    });
    expect(first.data.affected_attempts).toEqual([
      { stage: "functional-design", attemptId: selectedAttemptId },
      { stage: "quality-requirements", attemptId: qualityAttemptId },
      { stage: "implementation", attemptId: implementationAttemptId },
    ]);

    const retry = await service.execute(selectors, request);
    expect(retry.kind).toBe("success");
    expect(appended).toHaveLength(2);
    if (retry.kind === "success") expect(retry.data.resumed_authorization).toBe(true);
  });
});
