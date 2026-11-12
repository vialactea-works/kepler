import { createHash } from "node:crypto";
import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import { CONSTRUCTION_ACTIVITIES, CONSTRUCTION_STAGES, validateConstructionEvent } from "../../packages/cli/src/construction/events.js";
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

type EventId = ConstructionHistoryFact["event"]["id"];

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

  it("keeps Integration-only retries outside the revision boundary", () => {
    expect(validateRevisionBoundary({
      unit: "unit-1",
      task: "task-1",
      activity: "code-integration",
      implementationAttempt: "implementation-1",
      attempt: "integration-1",
    } as ScopeSelectors).kind).toBe("invalid");
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

  it("derives direct and transitive dependent Activity scopes from admitted graph edges only", () => {
    const implementationAttemptId = "implementation-1";
    const makeTask = (taskId: string, dependencies: readonly string[], selected = false) => {
      const admissions = [{
        event: {
          type: "construction.task-admitted",
          data: {
            stage_attempt_id: implementationAttemptId,
            task_contract: { dependency_task_ids: dependencies },
            predecessor_provenance: dependencies.map((dependency) => ({
              task_id: dependency,
              integration_event_id: `integration-for-${dependency}`,
            })),
          },
        },
      }] as unknown as ConstructionHistoryFact[];
      const activities = CONSTRUCTION_ACTIVITIES.map((activity) => {
        const current = selected && activity === "code-generation";
        const attemptId = `${taskId}-${activity}`;
        return {
          activity,
          state: current ? "running" : "not_started",
          ...(current ? { currentAttemptId: attemptId, stageAttemptId: implementationAttemptId } : {}),
          attempts: current ? [{ attemptId, stageAttemptId: implementationAttemptId, state: "running", facts: [] }] : [],
          facts: [],
          prepared: [],
          accepted: [],
        };
      });
      return { taskId, state: selected ? "generating" : "admitted", stageAttemptId: implementationAttemptId, admissions, activities, facts: [] };
    };
    const taskA = makeTask("task-a", [], true);
    const taskB = makeTask("task-b", ["task-a"]);
    const taskC = makeTask("task-c", ["task-b"]);
    const unrelated = makeTask("task-unrelated", []);
    const result = deriveRevisionCascade(unitProjection([
      stageProjection("implementation", implementationAttemptId, "running"),
    ], [taskA, taskB, taskC, unrelated]), {
      kind: "activity",
      unitId: "unit-1",
      taskId: "task-a",
      activity: "code-generation",
      implementationAttemptId,
      attemptId: "task-a-code-generation",
    });
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid" || result.cascade.kind !== "activity") return;
    expect(result.cascade.attempts.map(({ taskId, activity }) => [taskId, activity])).toEqual([
      ...CONSTRUCTION_ACTIVITIES.map((activity) => ["task-a", activity]),
      ...CONSTRUCTION_ACTIVITIES.map((activity) => ["task-b", activity]),
      ...CONSTRUCTION_ACTIVITIES.map((activity) => ["task-c", activity]),
    ]);
  });

  it.each(["running", "waiting", "paused", "completed", "resumed"] as const)("orders %s affected attempts and resumes without duplicate acceptance", async (qualityState) => {
    const effectiveQualityState = qualityState === "resumed" ? "running" : qualityState;
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
    const qualityStart: ConstructionHistoryFact = {
      ...fact,
      event: {
        ...baseEvent,
        id: "10000000-0000-4000-8000-000000000008" as EventId,
        caused_by: [baseEvent.id],
        data: { ...baseEvent.data, stage: "quality-requirements", stage_attempt_id: qualityAttemptId },
      },
    };
    const qualityFacts = [qualityStart];
    const addQualityState = (
      id: EventId,
      type: ConstructionHistoryFact["event"]["type"],
      data: Readonly<Record<string, unknown>>,
    ): void => {
      const previous = qualityFacts.at(-1)!;
      const next: ConstructionHistoryFact = {
        ...qualityStart,
        line: previous.line + 1,
        event: { ...qualityStart.event, id, type, caused_by: [previous.event.id], data },
      };
      expect(validateConstructionEvent(next.event)).toMatchObject({ status: "valid" });
      qualityFacts.push(next);
    };
    const qualityScope = { mission_id: missionId, unit_id: unitId, stage: "quality-requirements", stage_attempt_id: qualityAttemptId };
    if (qualityState === "paused" || qualityState === "resumed") {
      addQualityState("10000000-0000-4000-8000-00000000000b" as EventId, "construction.stage-pause-requested", {
        ...qualityScope, reason: "Stop the exact worker before reconciliation",
      });
      addQualityState("10000000-0000-4000-8000-00000000000c" as EventId, "construction.stage-paused", {
        ...qualityScope, reason: "The worker ended and its effects were reconciled",
      });
    }
    if (qualityState === "resumed") {
      addQualityState("10000000-0000-4000-8000-000000000009" as EventId, "construction.stage-resumed", qualityStart.event.data);
    } else if (qualityState === "waiting") {
      addQualityState("10000000-0000-4000-8000-000000000009" as EventId, "construction.stage-waiting", {
        ...qualityScope, reason: "The required requester decision is pending",
      });
    } else if (qualityState === "completed") {
      addQualityState("10000000-0000-4000-8000-000000000009" as EventId, "construction.stage-attempt-completed", {
        ...qualityScope, evidence_ids: [], checkpoints: [],
      });
    }
    const qualityLatest = qualityFacts.at(-1)!;
    const implementationStart: ConstructionHistoryFact = {
      ...fact,
      event: {
        ...baseEvent,
        id: "10000000-0000-4000-8000-00000000000a" as EventId,
        data: { ...baseEvent.data, stage: "implementation", stage_attempt_id: implementationAttemptId },
      },
    };
    const implementationLatest: ConstructionHistoryFact = {
      ...implementationStart,
      line: implementationStart.line + 1,
      event: {
        ...implementationStart.event,
        id: "10000000-0000-4000-8000-00000000000d" as EventId,
        type: "construction.stage-attempt-completed",
        caused_by: [implementationStart.event.id],
        data: { mission_id: missionId, unit_id: unitId, stage: "implementation", stage_attempt_id: implementationAttemptId,
          evidence_ids: [], checkpoints: [] },
      },
    };
    for (const item of [fact, ...qualityFacts, implementationStart, implementationLatest]) {
      expect(validateConstructionEvent(item.event)).toMatchObject({ status: "valid" });
    }
    const stages = CONSTRUCTION_STAGES.map((stage) => {
      if (stage === "functional-design") {
        return {
          ...stageProjection(stage, selectedAttemptId, "running"),
          attempts: [{ attemptId: selectedAttemptId, state: "running", facts: [fact] }],
        };
      }
      if (stage === "quality-requirements") return {
        ...stageProjection(stage, qualityAttemptId, effectiveQualityState),
        attempts: [{ attemptId: qualityAttemptId, state: effectiveQualityState, facts: qualityFacts }],
      };
      if (stage === "implementation") return {
        ...stageProjection(stage, implementationAttemptId, "completed"),
        attempts: [{ attemptId: implementationAttemptId, state: "completed", facts: [implementationLatest] }],
      };
      return stageProjection(stage);
    });
    const eventRecords: Array<{ readonly event: ConstructionHistoryFact["event"] }> =
      [fact, ...qualityFacts, implementationStart, implementationLatest].map(({ event }) => ({ event }));
    const loaded = {
      kind: "loaded",
      root: "/tmp/kepler-revision-unit",
      missionId,
      history: { events: eventRecords },
      projection: {} as never,
      unit: unitProjection(stages, [], unitId, missionId),
    } as unknown as Awaited<ReturnType<AuditContextResolver["readUnit"]>>;
    const appended: ConstructionHistoryFact["event"][] = [];
    let unknownIntegrationLock = false;
    const commonDirectory = Path.resolve("/tmp/kepler-revision-unit", ".git");
    const integrationResourceKey = createHash("sha256").update(JSON.stringify([missionId, unitId, "construction-integration"])).digest("hex");
    const integrationLockPath = Path.join(commonDirectory, "kepler", "missions", missionId, "coordination", integrationResourceKey);
    const integrationDirectories = new Set([
      Path.join(commonDirectory, "kepler"),
      Path.join(commonDirectory, "kepler", "missions"),
      Path.join(commonDirectory, "kepler", "missions", missionId),
      Path.dirname(integrationLockPath),
      integrationLockPath,
    ]);
    let failFirstAuthorization = true;
    let failFirstStageReopen = true;
    const journal = {
      append: async (event: ConstructionHistoryFact["event"]) => {
        if (failFirstAuthorization && event.type === "construction.revision-authorized") {
          failFirstAuthorization = false;
          throw new Error("construction.revision-authorized append interrupted");
        }
        if (failFirstStageReopen && event.type === "construction.stage-reopened") {
          failFirstStageReopen = false;
          throw new Error("Interrupted after the stage-ending event.");
        }
        appended.push(event);
        eventRecords.push({ event });
        return { status: "appended", eventId: event.id, line: appended.length };
      },
    } as unknown as EventJournal;
    const revisionId = "20000000-0000-4000-8000-000000000009";
    const createdJournalIds = new Set<string>();
    const ids = [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
      "20000000-0000-4000-8000-000000000004",
      "20000000-0000-4000-8000-000000000008",
      "20000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-000000000010",
      "20000000-0000-4000-8000-000000000011",
      "20000000-0000-4000-8000-000000000012",
      "20000000-0000-4000-8000-000000000013",
      "20000000-0000-4000-8000-000000000014",
      "20000000-0000-4000-8000-000000000015",
      "20000000-0000-4000-8000-000000000016",
      "20000000-0000-4000-8000-000000000017",
      "20000000-0000-4000-8000-000000000018",
      "20000000-0000-4000-8000-000000000019",
      "20000000-0000-4000-8000-000000000020",
      "20000000-0000-4000-8000-000000000021",
      "20000000-0000-4000-8000-000000000022",
      "20000000-0000-4000-8000-000000000023",
      "20000000-0000-4000-8000-000000000024",
      "20000000-0000-4000-8000-000000000025",
    ];
    const runtime = {
      workspace: {
        git: { run: async () => ({ status: 0, stdout: ".git", stderr: "" }) },
        fileSystem: {
          realpath: async (path: string) => path,
          pathKind: async (path: string) => unknownIntegrationLock && integrationDirectories.has(path)
            ? "directory"
            : unknownIntegrationLock && [Path.join(integrationLockPath, "owner.json"), Path.join(integrationLockPath, "integration.json")].includes(path)
              ? "file"
              : [...createdJournalIds].some((journalId) => path.endsWith(`/${journalId}.jsonl`)) ? "file" : "missing",
          readDirectory: async () => [],
          readFile: async () => "{}",
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
      journals: { create: (_root: string, _missionId: string, journalId: string) => {
        createdJournalIds.add(journalId);
        return journal;
      } },
    };
    const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
    const service = new Revision(contexts, runtime as never);
    const selectors: ScopeSelectors = { unit: unitId, stage: "functional-design", attempt: selectedAttemptId };

    const first = await service.execute(selectors, request);
    expect(first).toMatchObject({ kind: "failed", data: { code: "revision_authorization_append_failed" } });
    expect(appended.map((event) => event.type)).toEqual(["construction.interaction-recorded"]);

    const authorizationRetry = await service.execute(selectors, request);
    expect(authorizationRetry).toMatchObject({ kind: "success", data: { status: "barrier_pending" } });
    expect(appended.map((event) => event.type)).toEqual([
      "construction.interaction-recorded",
      "construction.revision-authorized",
    ]);
    expect(appended[1]?.journal_id).toBe(appended[0]?.journal_id);
    expect(appended[1]?.caused_by).toContain(appended[0]?.id);
    expect(appended[1]?.data).toMatchObject({
      revision_id: revisionId,
      inputs: request.inputs,
      affected_scopes: [
        { kind: "stage", stage: "functional-design", prior_attempt: "present", stage_attempt_id: selectedAttemptId },
        { kind: "stage", stage: "quality-requirements", prior_attempt: "present", stage_attempt_id: qualityAttemptId },
        { kind: "stage", stage: "implementation-planning", prior_attempt: "none" },
        { kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: implementationAttemptId },
        { kind: "stage", stage: "unit-of-work-review", prior_attempt: "none" },
        { kind: "stage", stage: "deliver", prior_attempt: "none" },
      ],
    });
    if (authorizationRetry.kind === "success") expect(authorizationRetry.data.affected_attempts).toEqual([
      { stage: "functional-design", attemptId: selectedAttemptId },
      { stage: "quality-requirements", attemptId: qualityAttemptId },
      { stage: "implementation", attemptId: implementationAttemptId },
    ]);

    const restartedService = new Revision(contexts, runtime as never);
    unknownIntegrationLock = true;
    const unknownLock = await restartedService.execute(selectors, request);
    expect(unknownLock).toMatchObject({ kind: "failed", data: { code: "integration_lock_record_invalid" } });
    expect(appended).toHaveLength(2);
    unknownIntegrationLock = false;

    const overlapping = await restartedService.execute(selectors, { ...request, reason: "A different request for the same pending boundary." });
    expect(overlapping).toMatchObject({ kind: "failed", data: { code: "revision_barrier_pending" } });
    expect(appended).toHaveLength(2);

    const qualityAttempt = stages.find((stage) => stage.stage === "quality-requirements")!.attempts[0]!;
    qualityAttempt.facts = [];
    const missingHistory = await restartedService.execute(selectors, request);
    expect(missingHistory).toMatchObject({ kind: "failed", data: { code: "revision_transition_history_missing" } });
    expect(appended).toHaveLength(2);
    qualityAttempt.facts = qualityFacts;

    const interrupted = await restartedService.execute(selectors, request);
    expect(interrupted).toMatchObject({ kind: "failed", data: { code: "revision_transition_append_uncertain" } });
    expect(appended.map((event) => event.type)).toEqual([
      "construction.interaction-recorded",
      "construction.revision-authorized",
      "construction.stage-attempt-ended-by-revision",
    ]);

    const recoveredService = new Revision(contexts, runtime as never);
    const resumedCascade = await recoveredService.execute(selectors, request);
    expect(resumedCascade.kind).toBe("success");
    expect(appended.map((event) => event.type)).toEqual([
      "construction.interaction-recorded",
      "construction.revision-authorized",
      "construction.stage-attempt-ended-by-revision",
      "construction.stage-reopened",
      "construction.stage-attempt-ended-by-revision",
      "construction.stage-reopened",
      "construction.stage-attempt-ended-by-revision",
      "construction.stage-reopened",
    ]);
    if (resumedCascade.kind === "success") {
      expect(resumedCascade.data).toMatchObject({ status: "barrier_complete", resumed_authorization: true });
      expect(resumedCascade.data.transition_event_ids).toEqual(appended.slice(3).map((event) => event.id));
    }
    const ends = appended.filter((event) => event.type === "construction.stage-attempt-ended-by-revision");
    const reopens = appended.filter((event) => event.type === "construction.stage-reopened");
    expect(ends).toHaveLength(3);
    expect(reopens).toHaveLength(3);
    expect(ends.find((event) => event.data.stage === "functional-design")?.caused_by).toContain(fact.event.id);
    expect(ends.find((event) => event.data.stage === "quality-requirements")?.caused_by).toContain(qualityLatest.event.id);
    expect(ends.find((event) => event.data.stage === "implementation")?.caused_by).toContain(implementationLatest.event.id);
    for (let index = 0; index < ends.length; index += 1) {
      expect(ends[index]?.caused_by).toContain(appended[1]?.id);
      expect(reopens[index]?.caused_by).toContain(ends[index]?.id);
      expect(reopens[index]?.caused_by).toContain(appended[1]?.id);
    }

    const confirmedService = new Revision(contexts, runtime as never);
    const resumed = await confirmedService.execute(selectors, request);
    expect(resumed).toMatchObject({ kind: "success", data: { status: "barrier_complete", resumed_authorization: true } });
    expect(appended).toHaveLength(8);
  });

  it("reopens the earliest and later Activities under the same active Implementation parent", async () => {
    const missionId = "11000000-0000-4000-8000-000000000001";
    const unitId = "11000000-0000-4000-8000-000000000002";
    const taskId = "11000000-0000-4000-8000-000000000003";
    const implementationAttemptId = "11000000-0000-4000-8000-000000000004";
    const generationAttemptId = "11000000-0000-4000-8000-000000000005";
    const validationAttemptId = "11000000-0000-4000-8000-000000000006";
    const validationStart = {
      id: "11000000-0000-4000-8000-000000000007",
      phase: "construction",
      type: "construction.activity-attempt-started",
      envelope_version: 1,
      event_version: 1,
      journal_id: "11000000-0000-4000-8000-000000000008",
      recorded_at: "2026-10-20T00:00:00.000Z",
      producer: { name: "kepler-test", version: "1.0.0" },
      caused_by: [],
      data: {
        mission_id: missionId,
        unit_id: unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskId,
        activity: "code-validation",
        activity_attempt_id: validationAttemptId,
        inputs: [],
        checkpoints: [],
      },
    } as unknown as ConstructionHistoryFact["event"];
    const validationFact: ConstructionHistoryFact = {
      sourceId: "activity-revision-fixture",
      journalId: validationStart.journal_id,
      line: 1,
      byteOffset: 0,
      event: validationStart,
    };
    const activities = [
      {
        activity: "code-generation",
        state: "completed",
        currentAttemptId: generationAttemptId,
        stageAttemptId: implementationAttemptId,
        attempts: [{ attemptId: generationAttemptId, stageAttemptId: implementationAttemptId, state: "completed", facts: [] }],
        facts: [], prepared: [], accepted: [],
      },
      {
        activity: "code-validation",
        state: "running",
        currentAttemptId: validationAttemptId,
        stageAttemptId: implementationAttemptId,
        attempts: [{ attemptId: validationAttemptId, stageAttemptId: implementationAttemptId, state: "running", facts: [validationFact] }],
        facts: [], prepared: [], accepted: [],
      },
      { activity: "code-integration", state: "not_started", attempts: [], facts: [], prepared: [], accepted: [] },
    ];
    const task = { taskId, state: "active", stageAttemptId: implementationAttemptId, admissions: [], activities, facts: [] };
    const eventRecords: Array<{ readonly event: ConstructionHistoryFact["event"] }> = [{ event: validationStart }];
    const projectedUnit = unitProjection([stageProjection("implementation", implementationAttemptId, "running")], [task], unitId, missionId);
    const loaded = {
      kind: "loaded",
      root: "/tmp/kepler-activity-revision",
      missionId,
      history: { events: eventRecords },
      projection: {} as never,
      unit: projectedUnit,
    } as unknown as Awaited<ReturnType<AuditContextResolver["readUnit"]>>;
    const appended: ConstructionHistoryFact["event"][] = [];
    const createdJournalIds = new Set<string>();
    const identities = [
      "11000000-0000-4000-8000-000000000009",
      "11000000-0000-4000-8000-000000000010",
      "11000000-0000-4000-8000-000000000011",
      "11000000-0000-4000-8000-000000000012",
      "11000000-0000-4000-8000-000000000013",
      "11000000-0000-4000-8000-000000000014",
      "11000000-0000-4000-8000-000000000015",
      "11000000-0000-4000-8000-000000000016",
      "11000000-0000-4000-8000-000000000017",
    ];
    const journal = {
      append: async (event: ConstructionHistoryFact["event"]) => {
        appended.push(event);
        eventRecords.push({ event });
        return { status: "appended", eventId: event.id, line: appended.length };
      },
    } as unknown as EventJournal;
    const runtime = {
      workspace: {
        git: { run: async () => ({ status: 0, stdout: ".git", stderr: "" }) },
        fileSystem: {
          realpath: async (path: string) => path,
          pathKind: async (path: string) => [...createdJournalIds].some((journalId) => path.endsWith(`/${journalId}.jsonl`)) ? "file" : "missing",
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
        const next = identities.shift();
        if (!next) throw new Error("No more identities are available.");
        return next;
      } },
      now: () => "2026-10-20T00:01:00.000Z",
      producer: { name: "kepler-test", version: "1.0.0" },
      journals: { create: (_root: string, _missionId: string, journalId: string) => {
        createdJournalIds.add(journalId);
        return journal;
      } },
    } as never;
    const service = new Revision({ readUnit: async () => loaded } as unknown as AuditContextResolver, runtime);
    const selectors: ScopeSelectors = {
      unit: unitId,
      task: taskId,
      activity: "code-validation",
      implementationAttempt: implementationAttemptId,
      attempt: validationAttemptId,
    };

    const authorized = await service.execute(selectors, request);
    expect(authorized).toMatchObject({ kind: "success", data: { status: "barrier_pending" } });
    const validationAttempt = activities.find((activity) => activity.activity === "code-validation")!.attempts[0]!;
    validationAttempt.facts = [];
    const missingHistory = await service.execute(selectors, request);
    expect(missingHistory).toMatchObject({ kind: "failed", data: { code: "revision_transition_history_missing" } });
    expect(appended).toHaveLength(2);
    validationAttempt.facts = [validationFact];
    const resumed = await service.execute(selectors, request);
    expect(resumed).toMatchObject({ kind: "success", data: { status: "barrier_complete", resumed_authorization: true } });
    expect(appended.map((event) => event.type)).toEqual([
      "construction.interaction-recorded",
      "construction.revision-authorized",
      "construction.activity-attempt-ended-by-revision",
      "construction.activity-reopened",
      "construction.activity-reopened",
    ]);
    expect(appended[2]?.data).toMatchObject({ task_id: taskId, activity: "code-validation", activity_attempt_id: validationAttemptId });
    expect(appended[2]?.caused_by).toEqual([appended[1]?.id, validationStart.id]);
    expect(appended[3]?.caused_by).toContain(appended[2]?.id);
    expect(appended[4]?.data).toMatchObject({ task_id: taskId, activity: "code-integration", stage_attempt_id: implementationAttemptId });
    expect(appended[4]?.data.activity_attempt_id).toBeUndefined();
    expect(projectedUnit.stages[0]?.currentAttemptId).toBe(implementationAttemptId);
    expect(projectedUnit.stages[0]?.attempts[0]?.state).toBe("running");
    const repeated = await service.execute(selectors, request);
    expect(repeated).toMatchObject({ kind: "success", data: { status: "barrier_complete", resumed_authorization: true } });
    expect(appended).toHaveLength(5);
  });
});
