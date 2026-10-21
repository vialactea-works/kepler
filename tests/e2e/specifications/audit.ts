import { expect } from "vitest";
import type { AuditCliDriver } from "../driver/audit-cli.js";
import { auditFixture } from "../fixtures/histories/audit.js";

export const exerciseAuditWorkflow = async (audit: AuditCliDriver): Promise<void> => {
  const scope = {
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.stageAttemptId,
  };
  const results = ["failed", "inconclusive"] as const;
  for (const [index, status] of results.entries()) {
    const check = index === 0 ? "First check" : "Late check";
    const written = audit.record("evidence", scope, {
      inputs: [{ reference: `opaque:${check}`, purpose: "Example verification material" }],
      artifact_bindings: [],
      checkpoints: [],
      check,
      executor: "E2E runner",
      result: { status, summary: `${check} result` },
    });
    expect(written.exitCode).toBe(0);
    expect(written.stderr).toBe("");
    expect(written.result).toMatchObject({
      status: "success",
      data: { id: expect.any(String), journal_id: expect.any(String), evidence_id: expect.any(String) },
    });
  }

  const lateEvidence = audit.record("evidence", {
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.priorStageAttemptId,
  }, {
    inputs: [{ reference: "opaque: prior-attempt-output", purpose: "Output from the ended attempt" }],
    artifact_bindings: [],
    checkpoints: [],
    check: "Review the prior attempt",
    executor: "E2E runner",
    result: { status: "passed", summary: "The prior attempt passed" },
  });
  expect(lateEvidence.exitCode).toBe(0);
  expect(lateEvidence.result.status).toBe("success");

  const approval = audit.record("approval", scope, {
    requester: "Requester",
    inputs: [{ reference: "opaque:approved-design", purpose: "Reviewed output" }],
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: "functional-design-output" }],
    decision_reference: "opaque:requester-decision",
  });
  expect(approval.exitCode).toBe(0);
  expect(approval.result).toMatchObject({ status: "success", data: { id: expect.any(String), journal_id: expect.any(String) } });

  const taskEvidence = audit.record("evidence", {
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    implementationAttempt: auditFixture.implementationAttemptId,
  }, {
    inputs: [{ reference: "opaque:task-output", purpose: "Task output" }],
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: "task-output" }],
    check: "Task review",
    executor: "E2E runner",
    result: { status: "passed", summary: "Task output is valid" },
  });
  expect(taskEvidence.exitCode).toBe(0);
  expect(taskEvidence.result.status).toBe("success");

  const activityApproval = audit.record("approval", {
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    activity: "code-generation",
    implementationAttempt: auditFixture.implementationAttemptId,
    attempt: auditFixture.activityAttemptId,
  }, {
    requester: "Requester",
    inputs: [{ reference: "opaque:activity-output", purpose: "Reviewed Activity output" }],
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: "activity-output" }],
    decision_reference: "opaque:activity-decision",
  });
  expect(activityApproval.exitCode).toBe(0);
  expect(activityApproval.result.status).toBe("success");

  const interaction = audit.record("interaction", {
    unit: auditFixture.unitId,
    stage: "functional-design",
  }, {
    participants: ["Requester"],
    content: "Change Functional Design effort to comprehensive.",
    effort_selection: {
      target: "stage",
      stage: "functional-design",
      action: "set",
      level: "comprehensive",
      selected_by: "Requester",
    },
  });
  expect(interaction.exitCode).toBe(0);
  expect(interaction.result.status).toBe("success");

  const taskInteraction = audit.record("interaction", {
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    implementationAttempt: auditFixture.implementationAttemptId,
  }, { participants: ["Requester"], content: "Clarify the task output." });
  expect(taskInteraction.exitCode).toBe(0);
  expect(taskInteraction.result.status).toBe("success");

  const activityInteraction = audit.record("interaction", {
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    activity: "code-generation",
    implementationAttempt: auditFixture.implementationAttemptId,
  }, { participants: ["Requester"], content: "Clarify the Activity output." });
  expect(activityInteraction.exitCode).toBe(0);
  expect(activityInteraction.result.status).toBe("success");

  const stageEvidence = audit.list({
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.stageAttemptId,
    type: "construction.evidence-recorded",
    fields: "data",
  });
  const stageEvidenceEvents = stageEvidence.result.data.events as Array<{ data: { result: { status: string } } }>;
  expect(stageEvidenceEvents).toHaveLength(2);
  expect(stageEvidenceEvents.map((event) => event.data.result.status)).toEqual(expect.arrayContaining(["failed", "inconclusive"]));
  const priorEvidence = audit.list({
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.priorStageAttemptId,
    type: "construction.evidence-recorded",
    fields: "data",
  });
  expect(priorEvidence.result.data.events).toHaveLength(1);
  expect((priorEvidence.result.data.events as Array<{ data: Record<string, unknown> }>)[0]?.data).toMatchObject({
    stage_attempt_id: auditFixture.priorStageAttemptId,
    result: { status: "passed" },
  });

  const beforeCompletionAttempt = await audit.journalSnapshot();
  const completionAttempt = audit.attemptStageCompletion(
    auditFixture.unitId,
    "functional-design",
    auditFixture.stageAttemptId,
  );
  expect(completionAttempt.exitCode).toBe(1);
  expect(completionAttempt.result).toMatchObject({ status: "failed", data: { code: "invalid_arguments" } });
  expect(await audit.journalSnapshot()).toBe(beforeCompletionAttempt);

  const beforeQueries = await audit.journalSnapshot();
  const effort = audit.list({
    unit: auditFixture.unitId,
    stage: "functional-design",
    type: "construction.interaction-recorded",
    fields: "data",
  });
  expect(effort.result.status, JSON.stringify(effort.result)).toBe("success");
  const effortEvent = (effort.result.data.events as Array<Record<string, unknown>>)
    .find((event) => (event.data as Record<string, unknown>).effort_selection !== undefined);
  expect(effortEvent?.data).toMatchObject({
    stage: "functional-design",
    effort_selection: { target: "stage", stage: "functional-design", action: "set", level: "comprehensive" },
  });
  const scopedInteraction = audit.show(auditFixture.unitId, String(effortEvent?.journal_id), String(effortEvent?.id));
  expect(scopedInteraction.result.data.event).toMatchObject({
    type: "construction.interaction-recorded",
    data: { stage: "functional-design", unit_id: auditFixture.unitId },
  });
  const taskInteractions = audit.list({
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    implementationAttempt: auditFixture.implementationAttemptId,
    type: "construction.interaction-recorded",
    fields: "data",
  });
  expect(taskInteractions.result.data.events).toHaveLength(2);
  const taskInteractionEvent = (taskInteractions.result.data.events as Array<Record<string, unknown>>)
    .find((event) => (event.data as Record<string, unknown>).content === "Clarify the task output.");
  expect(taskInteractionEvent?.data).toMatchObject({ task_id: auditFixture.taskId });
  expect(taskInteractionEvent?.data).not.toHaveProperty("activity");
  const activityInteractions = audit.list({
    unit: auditFixture.unitId,
    task: auditFixture.taskId,
    activity: "code-generation",
    implementationAttempt: auditFixture.implementationAttemptId,
    type: "construction.interaction-recorded",
    fields: "data",
  });
  expect(activityInteractions.result.data.events).toHaveLength(1);
  expect((activityInteractions.result.data.events as Array<Record<string, unknown>>)[0]?.data).toMatchObject({
    task_id: auditFixture.taskId,
    activity: "code-generation",
    stage_attempt_id: auditFixture.implementationAttemptId,
  });

  const first = audit.list({
    unit: auditFixture.unitId,
    type: "construction.evidence-recorded",
    fields: "type,recorded_at,data",
    limit: 1,
  });
  expect(first.exitCode).toBe(0);
  expect(first.result.status).toBe("success");
  expect(first.result.data.events).toHaveLength(1);
  expect(first.result.data.next_cursor).toEqual(expect.any(String));
  const firstEvent = (first.result.data.events as Array<Record<string, unknown>>)[0]!;
  expect(Object.keys(firstEvent)).toEqual(["id", "journal_id", "type", "recorded_at", "data"]);
  expect(firstEvent.data).toMatchObject({ result: { status: expect.stringMatching(/failed|inconclusive|passed/) } });

  const second = audit.list({
    unit: auditFixture.unitId,
    type: "construction.evidence-recorded",
    fields: "type,recorded_at,data",
    limit: 1,
    cursor: String(first.result.data.next_cursor),
  });
  expect(second.exitCode).toBe(0);
  expect(second.result.data.events).toHaveLength(1);
  expect(second.result.data.next_cursor).toEqual(expect.any(String));
  const third = audit.list({
    unit: auditFixture.unitId,
    type: "construction.evidence-recorded",
    fields: "type,recorded_at,data",
    limit: 1,
    cursor: String(second.result.data.next_cursor),
  });
  expect(third.result.data.events).toHaveLength(1);
  expect(third.result.data.next_cursor).toEqual(expect.any(String));
  const fourth = audit.list({
    unit: auditFixture.unitId,
    type: "construction.evidence-recorded",
    fields: "type,recorded_at,data",
    limit: 1,
    cursor: String(third.result.data.next_cursor),
  });
  expect(fourth.result.data.events).toHaveLength(1);
  expect(fourth.result.data.next_cursor).toBeNull();

  const shown = audit.show(auditFixture.unitId, String(firstEvent.journal_id), String(firstEvent.id));
  expect(shown.exitCode).toBe(0);
  expect(shown.result).toMatchObject({
    status: "success",
    data: { event: { id: firstEvent.id, journal_id: firstEvent.journal_id, type: "construction.evidence-recorded" } },
  });

  const noCompletion = audit.list({ unit: auditFixture.unitId, type: "construction.stage-attempt-completed" });
  expect(noCompletion.result).toMatchObject({ status: "success", data: { events: [], next_cursor: null } });

  expect(await audit.journalSnapshot()).toBe(beforeQueries);
  const originalHistory = await audit.journalSnapshot();
  const invalidScope = audit.record("evidence", {
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: "70000000-0000-4000-8000-000000000007",
  }, {
    inputs: [],
    artifact_bindings: [],
    checkpoints: [],
    check: "Rejected scope",
    executor: "E2E runner",
    result: { status: "passed", summary: "Passed" },
  });
  expect(invalidScope.exitCode).toBe(1);
  expect(invalidScope.result.status).toBe("failed");
  const invalidCursor = audit.list({ unit: auditFixture.unitId, cursor: "not-a-cursor" });
  expect(invalidCursor.exitCode).toBe(1);
  expect(invalidCursor.result.data.code).toBe("invalid_audit_cursor");
  expect(await audit.journalSnapshot()).toBe(originalHistory);
};
