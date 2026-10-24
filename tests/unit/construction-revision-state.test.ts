import { describe, expect, it } from "vitest";
import type { AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import type { ConstructionEventRecord } from "../../packages/cli/src/construction/events.js";
import { pendingRevisionBarrierFor } from "../../packages/cli/src/construction/revision-state.js";

const unitId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";
const implementationAttemptId = "30000000-0000-4000-8000-000000000001";
const taskA = "40000000-0000-4000-8000-000000000001";
const taskB = "40000000-0000-4000-8000-000000000002";
const validationAttemptId = "50000000-0000-4000-8000-000000000001";

const event = (
  id: string,
  type: string,
  data: Readonly<Record<string, unknown>>,
  caused_by: readonly string[] = [],
): ConstructionEventRecord => ({
  id,
  phase: "construction",
  type,
  envelope_version: 1,
  event_version: 1,
  journal_id: `journal-${id}`,
  recorded_at: "2026-10-23T00:00:00.000Z",
  producer: { name: "kepler-test", version: "1.0.0" },
  caused_by,
  data: { mission_id: "60000000-0000-4000-8000-000000000001", unit_id: unitId, ...data },
} as unknown as ConstructionEventRecord);

const loaded = (events: readonly ConstructionEventRecord[]) => ({
  kind: "loaded",
  root: "/tmp/revision-state",
  missionId: "60000000-0000-4000-8000-000000000001",
  history: { events: events.map((record) => ({ event: record })) },
  unit: { unitId, blocked: false, historyIssues: [], projectionIssues: [] },
} as unknown as Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>);

const stageAuthorization = (scopes: readonly Readonly<Record<string, unknown>>[]) => event(
  "70000000-0000-4000-8000-000000000001",
  "construction.revision-authorized",
  {
    revision_id: revisionId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    affected_scopes: scopes,
  },
);

const stageTransitions = (authorizationId: string) => {
  const ending = event(
    "80000000-0000-4000-8000-000000000001",
    "construction.stage-attempt-ended-by-revision",
    { stage: "implementation", stage_attempt_id: implementationAttemptId, revision_id: revisionId, reason: "Return the stage" },
    [authorizationId],
  );
  const reopening = event(
    "90000000-0000-4000-8000-000000000001",
    "construction.stage-reopened",
    { stage: "implementation", stage_attempt_id: implementationAttemptId, revision_id: revisionId, reason: "Open the revised stage" },
    [ending.id, authorizationId],
  );
  return [ending, reopening];
};

describe("Construction revision barriers", () => {
  it("blocks affected downstream starts until every prior attempt transition is recorded", () => {
    const authorization = stageAuthorization([
      { kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: implementationAttemptId },
      { kind: "stage", stage: "unit-of-work-review", prior_attempt: "none" },
    ]);
    const target = { unitId, stage: "unit-of-work-review" };

    expect(pendingRevisionBarrierFor(loaded([authorization]), target)?.revisionId).toBe(revisionId);
    expect(pendingRevisionBarrierFor(loaded([authorization]), { unitId, stage: "functional-design" })).toBeUndefined();
    expect(pendingRevisionBarrierFor(loaded([authorization, ...stageTransitions(authorization.id)]), target)).toBeUndefined();
  });

  it("fails closed when an authorization omits the prior-attempt disposition", () => {
    const authorization = stageAuthorization([
      { kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: implementationAttemptId },
      { kind: "stage", stage: "unit-of-work-review" },
    ]);
    const history = loaded([authorization, ...stageTransitions(authorization.id)]);

    expect(pendingRevisionBarrierFor(history, { unitId, stage: "deliver" })).toMatchObject({
      revisionId,
      authorizationEventId: authorization.id,
      affectedScopes: [],
    });
  });

  it("requires a causal reopen for a downstream Activity with no prior attempt", () => {
    const authorization = event(
      "70000000-0000-4000-8000-000000000003",
      "construction.revision-authorized",
      {
        revision_id: revisionId,
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskA,
        activity: "code-validation",
        activity_attempt_id: validationAttemptId,
        affected_scopes: [{ kind: "activity", task_id: taskA, stage_attempt_id: implementationAttemptId, activity: "code-integration", prior_attempt: "none" }],
      },
    );
    const target = { unitId, stage: "implementation", stageAttemptId: implementationAttemptId, taskId: taskA, activity: "code-integration" };
    const reopening = event(
      "90000000-0000-4000-8000-000000000003",
      "construction.activity-reopened",
      { stage: "implementation", stage_attempt_id: implementationAttemptId, task_id: taskA, activity: "code-integration", revision_id: revisionId, reason: "Open Integration" },
      [authorization.id],
    );

    expect(pendingRevisionBarrierFor(loaded([authorization]), target)?.revisionId).toBe(revisionId);
    expect(pendingRevisionBarrierFor(loaded([authorization, reopening]), target)).toBeUndefined();
  });

  it("blocks only the returned task while task-scope transitions are pending", () => {
    const authorization = event(
      "70000000-0000-4000-8000-000000000002",
      "construction.revision-authorized",
      {
        revision_id: revisionId,
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskA,
        activity: "code-validation",
        activity_attempt_id: validationAttemptId,
        affected_scopes: [
          { kind: "activity", task_id: taskA, stage_attempt_id: implementationAttemptId, activity: "code-validation", prior_attempt: "present", activity_attempt_id: validationAttemptId },
          { kind: "activity", task_id: taskA, stage_attempt_id: implementationAttemptId, activity: "code-integration", prior_attempt: "none" },
        ],
      },
    );
    const affected = { unitId, stage: "implementation", stageAttemptId: implementationAttemptId, taskId: taskA, activity: "code-integration" };
    const unaffected = { ...affected, taskId: taskB };
    expect(pendingRevisionBarrierFor(loaded([authorization]), affected)?.revisionId).toBe(revisionId);
    expect(pendingRevisionBarrierFor(loaded([authorization]), unaffected)).toBeUndefined();
    const ending = event(
      "80000000-0000-4000-8000-000000000002",
      "construction.task-scope-ended-by-revision",
      {
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskA,
        revision_id: revisionId,
        reason: "Return validation and integration",
        affected_activities: ["code-validation", "code-integration"],
      },
      [authorization.id],
    );
    const reopening = event(
      "90000000-0000-4000-8000-000000000002",
      "construction.task-scope-reopened",
      {
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskA,
        revision_id: revisionId,
        reason: "Resume the returned task route",
        affected_activities: ["code-validation", "code-integration"],
      },
      [ending.id, authorization.id],
    );
    expect(pendingRevisionBarrierFor(loaded([authorization, ending, reopening]), affected)).toBeUndefined();
  });
});
