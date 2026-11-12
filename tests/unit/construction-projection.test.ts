import { describe, expect, it } from "vitest";
import { collectHistory as collectHistoryFromSources, type CollectedHistoryEvent, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import type { ConstructionEventRecord } from "../../packages/cli/src/construction/events.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const ids = {
  unit: "2026-10-18-example",
  otherUnit: "2026-10-19-example",
  dependentTask: "30000000-0000-4000-8000-000000000009",
  thirdTask: "30000000-0000-4000-8000-000000000010",
  dependentSourceEvidence: "60000000-0000-4000-8000-000000000009",
  dependentIntegrationEvidence: "60000000-0000-4000-8000-000000000010",
  resumeActivityAttempt: "40000000-0000-4000-8000-000000000006",
  dependentActivityAttempt: "40000000-0000-4000-8000-000000000007",
  dependentValidationAttempt: "40000000-0000-4000-8000-000000000008",
  dependentIntegrationAttempt: "40000000-0000-4000-8000-000000000009",
  lateActivityAttempt: "40000000-0000-4000-8000-000000000010",
  lateResumeAttempt: "40000000-0000-4000-8000-000000000011",
  resumeEvidence: "60000000-0000-4000-8000-000000000008",
  stageAttempt: "20000000-0000-4000-8000-000000000002",
  nextStageAttempt: "20000000-0000-4000-8000-000000000003",
  task: "30000000-0000-4000-8000-000000000003",
  activityAttempt: "40000000-0000-4000-8000-000000000004",
  validationAttempt: "40000000-0000-4000-8000-000000000005",
  revision: "50000000-0000-4000-8000-000000000005",
  nextRevision: "50000000-0000-4000-8000-000000000006",
  lateRevision: "50000000-0000-4000-8000-000000000007",
  evidence: "60000000-0000-4000-8000-000000000006",
  sourceEvidence: "60000000-0000-4000-8000-000000000007",
  artifact: "80000000-0000-4000-8000-000000000008",
  graph: "70000000-0000-4000-8000-000000000007",
};
const utf8 = new TextEncoder();
const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const event = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  journalId = "journal-main",
  causedBy: readonly string[] = [],
  eventVersion = 1,
) => {
  const predecessorTaskIds = Array.isArray(data.predecessor_provenance)
    ? data.predecessor_provenance.flatMap((item) => isRecordValue(item) && typeof item.task_id === "string" ? [item.task_id] : []) : [];
  const withTaskContract = type === "construction.task-admitted" && data.task_contract === undefined
    ? { ...data, task_contract: {
        outputs: data.task_id === ids.task ? ["output:task"] : ["opaque: task output"],
        acceptance_criteria: ["Complete the task"], dependency_task_ids: predecessorTaskIds, implementation_prerequisites: [],
        planned_integration_commands: [
          { check: "code-integration-typecheck", repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
          { check: "code-integration-build", repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
          { check: "code-integration-full-test-suite", repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
        ],
      } }
    : data;
  const workerContextId = data.activity === "code-generation" ? "context-generation"
    : data.activity === "code-validation" && data.check === "code-validation-independent-review" ? "context-validation-review"
      : data.activity === "code-validation" ? "context-validation" : undefined;
  const withWorkerContext = type === "construction.evidence-recorded" && workerContextId && data.worker_context_id === undefined
    ? { ...withTaskContract, worker_context_id: workerContextId }
    : withTaskContract;
  const withCheckCommand = type === "construction.evidence-recorded" && data.activity === "code-integration" &&
    data.check !== "code-integration-self-review" && data.check_command === undefined
    ? { ...withWorkerContext, check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", String(data.check)] } }
    : withWorkerContext;
  return {
    id,
    phase: "construction",
    type,
    envelope_version: 1,
    event_version: eventVersion,
    journal_id: journalId,
    recorded_at: "2026-10-18T14:30:00Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [...causedBy],
    data: withCheckCommand,
  };
};

const created = (id: string, unitId: string, journalId: string) => event(id, "construction.unit-created", {
  mission_id: missionId,
  unit_id: unitId,
  directory: `construction/units-of-work/${unitId}`,
  workflow: "standard",
  initial_effort: { default: "standard", stage_overrides: { implementation: "minimal" }, selected_by: "requester" },
}, journalId);

const stageStart = (
  id: string,
  attemptId: string,
  unitId: string,
  journalId: string,
  causedBy: readonly string[] = [],
  stage = "implementation",
) => event(id, "construction.stage-attempt-started", {
  mission_id: missionId,
  unit_id: unitId,
  stage,
  stage_attempt_id: attemptId,
  inputs: [{ reference: "opaque: stage input ", purpose: "Required source material" }],
  checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
  authority_event_ids: [],
}, journalId, causedBy);

const taskAdmission = (unitId: string, journalId: string, causedBy: readonly string[]) => event(
  "event-task-admitted",
  "construction.task-admitted",
  {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.stageAttempt,
    task_id: ids.task,
    graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
    task_definition_ref: { graph_id: ids.graph, task_id: ids.task, content_version: "task-version-1" },
    admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
    predecessor_provenance: [],
    prerequisite_evidence: [],
  },
  journalId,
  causedBy,
);

const encode = (records: readonly unknown[]): Uint8Array =>
  utf8.encode(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);

const source = (sourceId: string, journalId: string, records: readonly unknown[]): HistoryJournalSource => ({
  sourceId,
  missionId,
  phase: "construction",
  journalId,
  bytes: encode(records),
});

const collectHistory = (
  selectedMissionId: string,
  sources: readonly HistoryJournalSource[],
  completeness: "complete" | "incomplete" = "complete",
) => collectHistoryFromSources(selectedMissionId, sources, { completeness });

describe("Construction history projection", () => {
  it("withholds prior state when the source set is not known to be complete", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-prefix");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-prefix", [unitCreated.id]);
    const evidence = event("event-stage-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "design-checkpoint" }],
      inputs: [{ reference: "opaque: design input", purpose: "Design material" }],
      check: "Review the design",
      executor: "agent:reviewer",
      result: { status: "passed", summary: "The design satisfies its contract" },
      output_refs: [],
      conditions: [],
    }, "journal-prefix", [started.id]);
    const completed = event("event-stage-completed", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "design-checkpoint" }],
    }, "journal-prefix", [started.id, evidence.id]);
    const history = collectHistory(missionId, [source("origin://prefix", "journal-prefix", [unitCreated, started, evidence, completed])], "incomplete");
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "functional-design")?.state).toBe("unknown");
    expect(projection.units[0]?.effort).toBeUndefined();
    expect(projection.units[0]?.progress).toEqual({
      completedStages: 0,
      totalStages: 6,
      completedTasks: 0,
      knownTasks: 0,
      reliable: false,
    });
  });

  it("does not project a generic Quality Requirements completion as complete", () => {
    const journalId = "71000000-0000-4000-8000-000000000001";
    const unitCreated = created("71000000-0000-4000-8000-000000000002", ids.unit, journalId);
    const started = stageStart(
      "71000000-0000-4000-8000-000000000003",
      ids.stageAttempt,
      ids.unit,
      journalId,
      [unitCreated.id],
      "quality-requirements",
    );
    const history = collectHistory(missionId, [source("origin://quality", journalId, [unitCreated, started])]);
    const unguardedCompletion = event("71000000-0000-4000-8000-000000000004", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "quality-requirements",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    }, journalId, [started.id]);
    const forgedRecord = {
      sourceId: "origin://quality-forged",
      scope: { missionId, unitId: ids.unit },
      missionId,
      phase: "construction",
      journalId,
      line: 3,
      byteOffset: 0,
      status: "valid",
      constructionEvent: unguardedCompletion as unknown as ConstructionEventRecord,
      validationIssues: [],
      issueCodes: [],
    } as unknown as CollectedHistoryEvent;
    const projection = projectConstruction({ ...history, events: [...history.events, forgedRecord] });

    expect(projection.units[0]?.stages.find((stage) => stage.stage === "quality-requirements")?.state).toBe("unknown");
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [unguardedCompletion.id],
    }));
  });

  it("does not project a generic Implementation Planning completion as complete", () => {
    const journalId = "72000000-0000-4000-8000-000000000001";
    const unitCreated = created("72000000-0000-4000-8000-000000000002", ids.unit, journalId);
    const started = stageStart(
      "72000000-0000-4000-8000-000000000003",
      ids.stageAttempt,
      ids.unit,
      journalId,
      [unitCreated.id],
      "implementation-planning",
    );
    const history = collectHistory(missionId, [source("origin://planning", journalId, [unitCreated, started])]);
    const unguardedCompletion = event("72000000-0000-4000-8000-000000000004", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation-planning",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    }, journalId, [started.id]);
    const forgedRecord = {
      sourceId: "origin://planning-forged",
      scope: { missionId, unitId: ids.unit },
      missionId,
      phase: "construction",
      journalId,
      line: 3,
      byteOffset: 0,
      status: "valid",
      constructionEvent: unguardedCompletion as unknown as ConstructionEventRecord,
      validationIssues: [],
      issueCodes: [],
    } as unknown as CollectedHistoryEvent;
    const projection = projectConstruction({ ...history, events: [...history.events, forgedRecord] });

    expect(projection.units[0]?.stages.find((stage) => stage.stage === "implementation-planning")?.state).toBe("unknown");
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [unguardedCompletion.id],
    }));
  });

  it("does not project a generic Implementation completion as complete", () => {
    const journalId = "73000000-0000-4000-8000-000000000001";
    const unitCreated = created("73000000-0000-4000-8000-000000000002", ids.unit, journalId);
    const started = stageStart("73000000-0000-4000-8000-000000000003", ids.stageAttempt, ids.unit, journalId, [unitCreated.id]);
    const history = collectHistory(missionId, [source("origin://implementation", journalId, [unitCreated, started])]);
    const unguardedCompletion = event("73000000-0000-4000-8000-000000000004", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    }, journalId, [started.id]);
    const forgedRecord = {
      sourceId: "origin://implementation-forged",
      scope: { missionId, unitId: ids.unit },
      missionId,
      phase: "construction",
      journalId,
      line: 3,
      byteOffset: 0,
      status: "valid",
      constructionEvent: unguardedCompletion as unknown as ConstructionEventRecord,
      validationIssues: [],
      issueCodes: [],
    } as unknown as CollectedHistoryEvent;
    const projection = projectConstruction({ ...history, events: [...history.events, forgedRecord] });

    expect(projection.units[0]?.stages.find((stage) => stage.stage === "implementation")?.state).toBe("unknown");
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [unguardedCompletion.id],
    }));
  });

  it.each(["unit-of-work-review", "deliver"] as const)("does not project a generic %s completion as complete", (stage) => {
    const journalId = `74000000-0000-4000-8000-00000000000${stage === "deliver" ? "1" : "2"}`;
    const unitCreated = created(`74000000-0000-4000-8000-00000000000${stage === "deliver" ? "3" : "4"}`, ids.unit, journalId);
    const started = stageStart(`74000000-0000-4000-8000-00000000000${stage === "deliver" ? "5" : "6"}`, ids.stageAttempt, ids.unit, journalId, [unitCreated.id], stage);
    const history = collectHistory(missionId, [source(`origin://${stage}`, journalId, [unitCreated, started])]);
    const unguardedCompletion = event(`74000000-0000-4000-8000-00000000000${stage === "deliver" ? "7" : "8"}`, "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage,
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    }, journalId, [started.id]);
    const forgedRecord = {
      sourceId: `origin://${stage}-forged`,
      scope: { missionId, unitId: ids.unit },
      missionId,
      phase: "construction",
      journalId,
      line: 3,
      byteOffset: 0,
      status: "valid",
      constructionEvent: unguardedCompletion as unknown as ConstructionEventRecord,
      validationIssues: [],
      issueCodes: [],
    } as unknown as CollectedHistoryEvent;
    const projection = projectConstruction({ ...history, events: [...history.events, forgedRecord] });

    expect(projection.units[0]?.stages.find((item) => item.stage === stage)?.state).toBe("unknown");
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [unguardedCompletion.id],
    }));
  });

  it("rebuilds deterministically and preserves scope, attempt, artifact, checkpoint, and input bindings", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-unit");
    const baseline = event("event-baseline", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, "journal-unit", [unitCreated.id]);
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-unit", [unitCreated.id]);
    const effort = event("event-effort", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["requester"],
      content: "Set implementation effort",
      references: [],
      effort_selection: { target: "stage", stage: "implementation", action: "set", level: "comprehensive", selected_by: "requester" },
    }, "journal-unit", [unitCreated.id]);
    const admission = taskAdmission(ids.unit, "journal-unit", [started.id, baseline.id]);
    const activityStarted = event("event-code-generation-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.activityAttempt,
      inputs: [{ reference: "opaque: source input  ", purpose: "Generate the requested implementation" }],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
    }, "journal-unit", [admission.id]);
    const evidence = event("event-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.activityAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [{
        artifact_id: ids.artifact,
        content_version: "artifact-version-1",
        checkpoint: { repository_id: "repo-main", commit: "checkpoint-output" },
      }],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-output" }],
      inputs: [{ reference: "opaque: checked input  ", purpose: "Input actually checked" }],
      check: "code-generation-self-review",
      executor: "agent:builder",
      result: { status: "passed", summary: "Required output exists" },
      output_refs: ["output:task"],
      conditions: ["Isolated worktree"],
    }, "journal-unit", [activityStarted.id]);
    const typecheckEvidence = event("event-generation-typecheck-evidence", "construction.evidence-recorded", {
      ...evidence.data, evidence_id: "60000000-0000-4000-8000-000000000012", check: "code-generation-typecheck",
    }, "journal-unit", [activityStarted.id]);
    const relatedTestsEvidence = event("event-generation-related-tests-evidence", "construction.evidence-recorded", {
      ...evidence.data, evidence_id: "60000000-0000-4000-8000-000000000013", check: "code-generation-related-tests",
    }, "journal-unit", [activityStarted.id]);
    const activityCompleted = event("event-code-generation-complete", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.activityAttempt,
      evidence_ids: [ids.evidence, "60000000-0000-4000-8000-000000000012", "60000000-0000-4000-8000-000000000013"],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-output" }],
    }, "journal-unit", [activityStarted.id, evidence.id, typecheckEvidence.id, relatedTestsEvidence.id]);
    const approval = event("event-approval", "construction.approval-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      artifact_bindings: [{ artifact_id: ids.artifact, content_version: "artifact-version-1" }],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-output" }],
      requester: "requester",
      inputs: [{ reference: "opaque: approved input  ", purpose: "Material reviewed by requester" }],
      decision_reference: "opaque: explicit approval  ",
    }, "journal-unit", [evidence.id]);
    const unitTwo = created("event-unit-two-created", ids.otherUnit, "journal-other-unit");
    const first = collectHistory(missionId, [
      source("origin://unit-two", "journal-other-unit", [unitTwo]),
      source("origin://unit-one", "journal-unit", [unitCreated, baseline, started, effort, admission, activityStarted, evidence, typecheckEvidence, relatedTestsEvidence, activityCompleted, approval]),
    ]);
    const second = collectHistory(missionId, [
      source("origin://unit-one", "journal-unit", [unitCreated, baseline, started, effort, admission, activityStarted, evidence, typecheckEvidence, relatedTestsEvidence, activityCompleted, approval]),
      source("origin://unit-two", "journal-other-unit", [unitTwo]),
    ]);
    const projection = projectConstruction(first);
    expect(projectConstruction(second)).toEqual(projection);
    expect(projection.blocked).toBe(false);
    expect(projection.projectionIssues).toEqual([]);
    const unit = projection.units.find((item) => item.unitId === ids.unit);
    expect(unit?.blocked).toBe(false);
    expect(unit?.workflow).toBe("standard");
    expect(unit?.baseline?.event.data.review_baseline).toEqual([{ repository_id: "repo-main", commit: "checkpoint-start" }]);
    expect(unit?.effort?.default.level).toBe("standard");
    expect(unit?.effort?.stageOverrides.implementation).toEqual({ level: "comprehensive", selectedBy: "requester" });
    expect(unit?.effort?.effectiveByStage.implementation).toBe("comprehensive");
    expect(unit?.stages.find((item) => item.stage === "implementation")?.state).toBe("running");
    expect(unit?.tasks[0]?.state).toBe("admitted");
    expect(unit?.tasks[0]?.admission?.event.data.admission_baseline).toEqual([
      { repository_id: "repo-main", commit: "checkpoint-start" },
    ]);
    const codeGeneration = unit?.tasks[0]?.activities.find((item) => item.activity === "code-generation");
    expect(codeGeneration?.state).toBe("completed");
    expect(codeGeneration?.attempts[0]?.facts[0]?.event.data.inputs).toEqual([
      { reference: "opaque: source input  ", purpose: "Generate the requested implementation" },
    ]);
    expect(unit?.evidence[0]?.binding).toBe("activity-attempt");
    expect(unit?.evidence[0]?.fact.event.data.activity_attempt_id).toBe(ids.activityAttempt);
    expect(unit?.evidence[0]?.fact.event.data.artifact_bindings).toEqual([{
      artifact_id: ids.artifact,
      content_version: "artifact-version-1",
      checkpoint: { repository_id: "repo-main", commit: "checkpoint-output" },
    }]);
    expect(unit?.evidence[0]?.fact.event.data.inputs).toEqual([
      { reference: "opaque: checked input  ", purpose: "Input actually checked" },
    ]);
    expect(unit?.approvals[0]?.binding).toBe("stage-attempt");
    expect(unit?.approvals[0]?.fact.event.data.inputs).toEqual([
      { reference: "opaque: approved input  ", purpose: "Material reviewed by requester" },
    ]);
    expect(unit?.approvals[0]?.fact.event.data.artifact_bindings).toEqual([
      { artifact_id: ids.artifact, content_version: "artifact-version-1" },
    ]);
    expect(unit?.progress).toEqual({ completedStages: 0, totalStages: 6, completedTasks: 0, knownTasks: 1, reliable: true });
  });

  it("does not grant a task admission without its stage-start and baseline causes", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-missing-admission-causes");
    const admission = taskAdmission(ids.unit, "journal-missing-admission-causes", []);
    const history = collectHistory(missionId, [source("origin://missing-admission-causes", "journal-missing-admission-causes", [
      unitCreated,
      admission,
    ])]);
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-admission");
    expect(projection.units[0]?.tasks[0]?.state).toBe("unknown");
  });

  it("rejects Integration preparation without validated source evidence", () => {
    const journalId = "journal-integration-without-source";
    const unitCreated = created("event-unit-created", ids.unit, journalId);
    const baseline = event("event-baseline", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, journalId, [unitCreated.id]);
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, journalId, [unitCreated.id]);
    const admission = taskAdmission(ids.unit, journalId, [started.id, baseline.id]);
    const integrationStarted = event("event-integration-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      checkpoints: [],
    }, journalId, [admission.id]);
    const prepared = event("event-integration-prepared", "construction.integration-prepared", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      captured_inputs: [],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      task_output_refs: ["opaque: task output"],
      source_evidence_ids: [],
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
    }, journalId, [integrationStarted.id, admission.id]);
    const history = collectHistory(missionId, [source("origin://integration-without-source", journalId, [
      unitCreated,
      baseline,
      started,
      admission,
      integrationStarted,
      prepared,
    ])]);
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-integration-binding");
  });

  it("rejects a revision transition without its matching authorized cause", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-unauthorized-revision");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-unauthorized-revision", [unitCreated.id], "functional-design");
    const ended = event("event-stage-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision,
      reason: "Attempted without authorization",
    }, "journal-unauthorized-revision", [started.id]);
    const history = collectHistory(missionId, [source("origin://unauthorized-revision", "journal-unauthorized-revision", [
      unitCreated,
      started,
      ended,
    ])]);
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "functional-design")?.state).toBe("unknown");
  });

  it.each(["shared", "separate", "separate-ordered"])("requires recorded ordering for revision transitions across %s journals", (journals) => {
    const journalId = "journal-stage-revision-cascade";
    const unitCreated = created("event-stage-cascade-unit", ids.unit, journalId);
    const designAttempt = "20000000-0000-4000-8000-000000000020";
    const qualityAttempt = "20000000-0000-4000-8000-000000000021";
    const implementationAttempt = "20000000-0000-4000-8000-000000000022";
    const designStart = stageStart("event-stage-cascade-design", designAttempt, ids.unit, journalId, [unitCreated.id], "functional-design");
    const qualityStart = stageStart("event-stage-cascade-quality", qualityAttempt, ids.unit, journalId, [designStart.id], "quality-requirements");
    const implementationStart = stageStart("event-stage-cascade-implementation", implementationAttempt, ids.unit, journalId, [qualityStart.id], "implementation");
    const interaction = event("event-stage-cascade-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["orchestrator"],
      content: "Quality Requirements must be revised",
      references: ["evidence:quality-finding"],
    }, journalId, [qualityStart.id]);
    const authorized = event("event-stage-cascade-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.revision,
      orchestrator_decision: "Reopen Quality Requirements",
      reason: "The accepted quality contract is incomplete",
      inputs: [{ reference: "evidence:quality-finding", purpose: "Supporting revision evidence" }],
      stage: "quality-requirements",
      stage_attempt_id: qualityAttempt,
      affected_scopes: [
        { kind: "stage", stage: "quality-requirements", prior_attempt: "present", stage_attempt_id: qualityAttempt },
        { kind: "stage", stage: "implementation-planning", prior_attempt: "none" },
        { kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: implementationAttempt },
        { kind: "stage", stage: "unit-of-work-review", prior_attempt: "none" },
        { kind: "stage", stage: "deliver", prior_attempt: "none" },
      ],
    }, journalId, [interaction.id, qualityStart.id], 2);
    const qualityEnded = event("event-stage-cascade-quality-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId, unit_id: ids.unit, stage: "quality-requirements", stage_attempt_id: qualityAttempt,
      revision_id: ids.revision, reason: "Authorized revision",
    }, journalId, [authorized.id]);
    const qualityReopened = event("event-stage-cascade-quality-reopened", "construction.stage-reopened", {
      mission_id: missionId, unit_id: ids.unit, stage: "quality-requirements", stage_attempt_id: qualityAttempt,
      revision_id: ids.revision, reason: "Re-execute Quality Requirements",
    }, journalId, [qualityEnded.id, authorized.id]);
    const implementationEnded = event("event-stage-cascade-implementation-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: implementationAttempt,
      revision_id: ids.revision, reason: "Authorized revision",
    }, journalId, journals === "separate-ordered" ? [authorized.id, implementationStart.id] : [authorized.id]);
    const implementationReopened = event("event-stage-cascade-implementation-reopened", "construction.stage-reopened", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: implementationAttempt,
      revision_id: ids.revision, reason: "Re-execute Implementation",
    }, journalId, [implementationEnded.id, authorized.id]);
    const records = [
      unitCreated, designStart, qualityStart, implementationStart, interaction, authorized,
      qualityEnded, qualityReopened, implementationEnded, implementationReopened,
    ];
    const sources = journals === "shared"
      ? [source("origin://stage-revision-cascade", journalId, records)]
      : records.map((record) => {
          const separate = { ...record, journal_id: `${journalId}-${record.id}` };
          return source(`origin://${separate.journal_id}`, separate.journal_id, [separate]);
        });
    const history = collectHistory(missionId, sources);
    const projection = projectConstruction(history);
    const unit = projection.units[0];

    expect(projection.projectionIssues.map((issue) => issue.code)).not.toContain("invalid-revision-transition");
    if (journals === "separate") {
      expect(unit?.blocked).toBe(true);
      expect(projection.projectionIssues.map((issue) => issue.code)).toContain("unordered-transitions");
      expect(unit?.stages.every((stage) => stage.state === "unknown")).toBe(true);
      return;
    }
    expect(unit?.stages.find((stage) => stage.stage === "functional-design")).toMatchObject({
      state: "running",
      currentAttemptId: designAttempt,
    });
    expect(unit?.stages.find((stage) => stage.stage === "quality-requirements")).toMatchObject({ state: "reopened" });
    expect(unit?.stages.find((stage) => stage.stage === "quality-requirements")?.attempts[0]?.state).toBe("ended_by_revision");
    expect(unit?.stages.find((stage) => stage.stage === "implementation")).toMatchObject({ state: "reopened" });
    expect(unit?.stages.find((stage) => stage.stage === "implementation")?.attempts[0]?.state).toBe("ended_by_revision");
  });

  it("does not let late evidence from an ended attempt complete its successor", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-late");
    const firstStart = stageStart("event-stage-start-one", ids.stageAttempt, ids.unit, "journal-late", [unitCreated.id]);
    const interaction = event("event-revision-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["requester"],
      content: "The stage result requires correction",
      references: ["opaque: revision context"],
    }, "journal-late", [firstStart.id]);
    const authorized = event("event-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.revision,
      orchestrator_decision: "Reopen the stage",
      reason: "The stage result needs correction",
      inputs: [{ reference: "evidence:stage-result", purpose: "Supporting stage evidence" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
    }, "journal-late", [interaction.id]);
    const ended = event("event-stage-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision,
      reason: "Authorized revision",
    }, "journal-late", [authorized.id]);
    const reopened = event("event-stage-reopened", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision,
      reason: "Re-execute under the authorized revision",
    }, "journal-late", [ended.id, authorized.id]);
    const secondStart = stageStart("event-stage-start-two", ids.nextStageAttempt, ids.unit, "journal-late", [reopened.id]);
    const lateEvidence = event("event-late-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      inputs: [{ reference: "opaque: late result", purpose: "Evidence from the ended attempt" }],
      check: "Complete the ended attempt",
      executor: "agent:reviewer",
      result: { status: "passed", summary: "The ended attempt passed" },
      output_refs: [],
      conditions: [],
    }, "journal-late", [firstStart.id]);
    const lateCompletion = event("event-late-completion", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      implementation_assessment: { assessment_event_id: ids.revision },
    }, "journal-late", [secondStart.id, lateEvidence.id]);
    const history = collectHistory(missionId, [source("origin://late", "journal-late", [unitCreated, firstStart, interaction, authorized, ended, reopened, secondStart, lateEvidence, lateCompletion])]);
    const projection = projectConstruction(history);
    const unit = projection.units[0];
    const stageView = unit?.stages.find((item) => item.stage === "implementation");
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-completion-evidence");
    expect(stageView?.state).not.toBe("completed");
    expect(stageView?.currentAttemptId).toBe(ids.nextStageAttempt);
    expect(stageView?.attempts.find((attempt) => attempt.attemptId === ids.stageAttempt)?.state).toBe("ended_by_revision");
    expect(stageView?.attempts.find((attempt) => attempt.attemptId === ids.nextStageAttempt)?.state).toBe("running");
  });

  it("does not let failed evidence authorize stage completion", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-failed-evidence");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-failed-evidence", [unitCreated.id]);
    const evidence = event("event-failed-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      inputs: [{ reference: "opaque: failed result", purpose: "Material checked" }],
      check: "Inspect the design output",
      executor: "agent:reviewer",
      result: { status: "failed", summary: "The design is incomplete" },
      output_refs: [],
      conditions: [],
    }, "journal-failed-evidence", [started.id]);
    const completed = event("event-stage-completed", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      implementation_assessment: { assessment_event_id: ids.revision },
    }, "journal-failed-evidence", [started.id, evidence.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://failed-evidence",
      "journal-failed-evidence",
      [unitCreated, started, evidence, completed],
    )]));

    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-completion-evidence");
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "implementation")?.state).not.toBe("completed");
  });

  it("rejects completion evidence bound to a different repository checkpoint", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-checkpoint-mismatch");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-checkpoint-mismatch", [unitCreated.id]);
    const evidence = event("event-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "checked-checkpoint" }],
      inputs: [{ reference: "opaque: checked material", purpose: "Material inspected" }],
      check: "Inspect the design output",
      executor: "agent:reviewer",
      result: { status: "passed", summary: "The design is complete" },
      output_refs: [],
      conditions: [],
    }, "journal-checkpoint-mismatch", [started.id]);
    const completed = event("event-stage-completed", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "different-checkpoint" }],
      implementation_assessment: { assessment_event_id: ids.revision },
    }, "journal-checkpoint-mismatch", [started.id, evidence.id]);
    const history = collectHistory(missionId, [source("origin://checkpoint-mismatch", "journal-checkpoint-mismatch", [
      unitCreated,
      started,
      evidence,
      completed,
    ])]);
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("invalid-completion-evidence");
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "implementation")?.state).toBe("unknown");
  });

  it("keeps the first unit Review baseline and blocks later baseline selections", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-replaced-baseline");
    const firstBaseline = event("event-baseline-first", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "first-checkpoint" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, "journal-replaced-baseline", [unitCreated.id]);
    const replacementBaseline = event("event-baseline-replacement", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "replacement-checkpoint" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, "journal-replaced-baseline", [firstBaseline.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://replaced-baseline",
      "journal-replaced-baseline",
      [unitCreated, firstBaseline, replacementBaseline],
    )]));
    const unit = projection.units[0];
    expect(unit?.blocked).toBe(true);
    expect(unit?.baseline?.event.id).toBe(firstBaseline.id);
    expect(unit?.baseline?.event.data.review_baseline).toEqual([{ repository_id: "repo-main", commit: "first-checkpoint" }]);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("duplicate-unit-baseline");
  });

  it("does not expose current state as usable when unsupported history affects the unit", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-unsupported");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-unsupported", [unitCreated.id]);
    const unsupported = event("event-future", "construction.future-event", {
      mission_id: missionId,
      unit_id: ids.unit,
    }, "journal-unsupported", [started.id]);
    const history = collectHistory(missionId, [source("origin://unsupported", "journal-unsupported", [unitCreated, started, unsupported])]);
    const projection = projectConstruction(history);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.stages.find((item) => item.stage === "implementation")?.state).toBe("unknown");
    expect(projection.units[0]?.progress.reliable).toBe(false);
  });

  it("blocks a unit when state transitions in separate journals have no recorded order", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-start");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-start", [unitCreated.id]);
    const waiting = event("event-stage-waiting", "construction.stage-waiting", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      reason: "Awaiting a prerequisite",
    }, "journal-waiting");
    const history = collectHistory(missionId, [
      source("origin://start", "journal-start", [unitCreated, started]),
      source("origin://waiting", "journal-waiting", [waiting]),
    ]);
    const projection = projectConstruction(history);
    expect(history.issues).toEqual([]);
    expect(projection.projectionIssues.map((issue) => issue.code)).toContain("unordered-transitions");
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.stages.find((item) => item.stage === "implementation")?.state).toBe("unknown");
  });

  it("projects completed tasks only from accepted Integration facts with matching attempt bindings", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-integration");
    const baseline = event("event-baseline", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, "journal-integration", [unitCreated.id]);
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-integration", [unitCreated.id]);
    const admission = taskAdmission(ids.unit, "journal-integration", [started.id, baseline.id]);
    const admittedContract = admission.data.task_contract;
    if (!isRecordValue(admittedContract)) throw new Error("Test task admission contract is missing");
    admission.data.task_contract = { ...admittedContract, acceptance_criteria: ["Complete the task", "Complete the task"] };
    const generationStarted = event("event-generation-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: "40000000-0000-4000-8000-000000000012",
      inputs: [],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
    }, "journal-integration", [admission.id]);
    const generationEvidence = [
      ["60000000-0000-4000-8000-000000000012", "code-generation-typecheck"],
      ["60000000-0000-4000-8000-000000000022", "code-generation-related-tests"],
      ["60000000-0000-4000-8000-000000000023", "code-generation-self-review"],
    ].map(([evidenceId, check], index) => event(`event-generation-evidence-${index}`, "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: "40000000-0000-4000-8000-000000000012",
      evidence_id: evidenceId,
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
      inputs: [],
      check,
      executor: "agent:generator",
      result: { status: "passed", summary: "Generated task output" },
      output_refs: ["output:task"],
      conditions: [],
    }, "journal-integration", [generationStarted.id]));
    const generationCompleted = event("event-generation-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: "40000000-0000-4000-8000-000000000012",
      evidence_ids: generationEvidence.map((item) => String(item.data.evidence_id)),
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [generationStarted.id, ...generationEvidence.map((item) => item.id)]);
    const validationStarted = event("event-validation-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-validation",
      activity_attempt_id: ids.validationAttempt,
      inputs: [{ reference: "opaque: generated output", purpose: "Generated task output" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [admission.id, generationCompleted.id]);
    const sourceEvidence = event("event-validation-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-validation",
      activity_attempt_id: ids.validationAttempt,
      evidence_id: ids.sourceEvidence,
      artifact_bindings: [{ artifact_id: ids.artifact, content_version: "generated-version" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
      inputs: [{ reference: "opaque: generated output", purpose: "Generated task output" }],
      check: "code-validation-independent-review",
      executor: "agent:validator",
      result: { status: "passed", summary: "The task output passed validation" },
      output_refs: ["output:task"],
      conditions: [],
    }, "journal-integration", [validationStarted.id]);
    const validationSupplementalEvidence = [
      ["60000000-0000-4000-8000-000000000018", "code-validation-typecheck"],
      ["60000000-0000-4000-8000-000000000019", "code-validation-build"],
      ["60000000-0000-4000-8000-000000000020", "code-validation-full-test-suite"],
      ["60000000-0000-4000-8000-000000000021", "code-validation-self-review"],
    ].map(([evidenceId, check], index) => event(`event-validation-evidence-${index}`, "construction.evidence-recorded", {
      ...sourceEvidence.data, evidence_id: evidenceId, check, executor: "agent:validator", worker_context_id: "context-validation",
    }, "journal-integration", [validationStarted.id]));
    const validationEvidence = [sourceEvidence, ...validationSupplementalEvidence];
    const validationCompleted = event("event-validation-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-validation",
      activity_attempt_id: ids.validationAttempt,
      evidence_ids: validationEvidence.map((item) => String(item.data.evidence_id)),
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [validationStarted.id, ...validationEvidence.map((item) => item.id)]);
    const integrationStarted = event("event-integration-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [admission.id, validationCompleted.id]);
    const prepared = event("event-integration-prepared", "construction.integration-prepared", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      captured_inputs: [{ repository_id: "repo-main", commit: "generated-commit" }],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      task_output_refs: ["output:task"],
      source_evidence_ids: [ids.sourceEvidence],
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
    }, "journal-integration", [integrationStarted.id, admission.id, validationCompleted.id, sourceEvidence.id]);
    const integrationEvidence = event("event-integration-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      evidence_id: ids.evidence,
      artifact_bindings: [{ artifact_id: ids.artifact, content_version: "candidate-version" }],
      checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      check: "code-integration-typecheck",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
      executor: "agent:integrator",
      result: { status: "passed", summary: "Candidate checks passed" },
      output_refs: ["output:integration"],
      conditions: [],
    }, "journal-integration", [prepared.id]);
    const integrationBuildEvidence = event("event-integration-build-evidence", "construction.evidence-recorded", {
      ...integrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000013",
      check: "code-integration-build",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
    }, "journal-integration", [prepared.id]);
    const integrationSuiteEvidence = event("event-integration-suite-evidence", "construction.evidence-recorded", {
      ...integrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000014",
      check: "code-integration-full-test-suite",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
    }, "journal-integration", [prepared.id]);
    const integrationSelfReviewEvidence = event("event-integration-self-review-evidence", "construction.evidence-recorded", {
      ...integrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000015",
      check: "code-integration-self-review",
      conditions: ["Integration bindings match the accepted candidate and actual inputs.", "Complete the task"],
    }, "journal-integration", [prepared.id]);
    const accepted = event("event-integration-accepted", "construction.integration-accepted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      prepared_event_id: prepared.id,
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.evidence, "60000000-0000-4000-8000-000000000013", "60000000-0000-4000-8000-000000000014"] }],
      authority_event_ids: [integrationSelfReviewEvidence.id],
    }, "journal-integration", [prepared.id, integrationEvidence.id, integrationBuildEvidence.id,
      integrationSuiteEvidence.id, integrationSelfReviewEvidence.id]);
    const activityCompleted = event("event-integration-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      evidence_ids: [ids.evidence, "60000000-0000-4000-8000-000000000013", "60000000-0000-4000-8000-000000000014", "60000000-0000-4000-8000-000000000015"],
      checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
    }, "journal-integration", [integrationStarted.id, accepted.id, integrationEvidence.id, integrationBuildEvidence.id,
      integrationSuiteEvidence.id, integrationSelfReviewEvidence.id]);
    const taskCompleted = event("event-task-completed", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["Complete the task", "Complete the task"],
    }, "journal-integration", [accepted.id, activityCompleted.id, admission.id]);
    const records = [
      unitCreated,
      baseline,
      started,
      admission,
      generationStarted,
      ...generationEvidence,
      generationCompleted,
      validationStarted,
      ...validationEvidence,
      validationCompleted,
      integrationStarted,
      prepared,
      integrationEvidence,
      integrationBuildEvidence,
      integrationSuiteEvidence,
      integrationSelfReviewEvidence,
      accepted,
      activityCompleted,
      taskCompleted,
    ];
    const acceptedBeforeActivityCompletion = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-accepted-before-activity-completion",
      "journal-integration",
      records.slice(0, records.indexOf(activityCompleted)),
    )]));
    expect(acceptedBeforeActivityCompletion.units[0]?.tasks[0]?.activities
      .find((activity) => activity.activity === "code-integration")?.accepted).toHaveLength(1);
    const sources = [source("origin://integration", "journal-integration", records)];
    const history = collectHistory(missionId, sources);
    const projection = projectConstruction(history);
    const task = projection.units[0]?.tasks[0];
    expect(history.issues).toEqual([]);
    expect(projection.projectionIssues).toEqual([]);
    expect(task?.state).toBe("complete");
    expect(task?.completion?.event.data.integration_event_id).toBe(accepted.id);
    const legacyActivityRecords = records.slice(0, records.indexOf(integrationStarted)).map((record) => {
      const data = record.data as Record<string, unknown>;
      if (record.id === admission.id) {
        const { task_contract: _taskContract, ...legacyData } = data;
        return { ...record, data: legacyData };
      }
      if (record.type === "construction.evidence-recorded") {
        const { worker_context_id: _workerContextId, ...legacyData } = data;
        return { ...record, data: legacyData };
      }
      return record;
    });
    const legacyActivityHistory = collectHistory(missionId, [source(
      "origin://legacy-v1-task-admission-and-activity-evidence",
      "journal-integration",
      legacyActivityRecords,
    )]);
    const legacyActivityProjection = projectConstruction(legacyActivityHistory);
    expect(legacyActivityHistory.issues).toEqual([]);
    expect(legacyActivityProjection.projectionIssues).toEqual([]);
    expect(legacyActivityProjection.units[0]?.blocked).toBe(false);
    expect(task?.activities.find((activity) => activity.activity === "code-integration")?.accepted).toHaveLength(1);
    expect(projection.units[0]?.progress).toEqual({ completedStages: 0, totalStages: 6, completedTasks: 1, knownTasks: 1, reliable: true });
    const sharedCheckCommand = { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] };
    const sharedCommandProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-shared-typecheck-build-command",
      "journal-integration",
      records.map((record) => record.id === integrationEvidence.id || record.id === integrationBuildEvidence.id
        ? { ...record, data: { ...record.data, check_command: sharedCheckCommand } }
        : record),
    )]));
    expect(sharedCommandProjection.projectionIssues).toEqual([]);
    expect(sharedCommandProjection.units[0]?.tasks[0]?.state).toBe("complete");
    const generationContextValidationEvidenceIds = new Set(validationEvidence.filter((item) =>
      ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite"].includes(String(item.data.check)))
      .map((item) => item.id));
    const reusedGenerationContextProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-validation-reuses-generation-context",
      "journal-integration",
      records.map((record) => generationContextValidationEvidenceIds.has(record.id)
        ? { ...record, data: { ...record.data, worker_context_id: "context-generation" } }
        : record),
    )]));
    expect(reusedGenerationContextProjection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence", eventIds: [validationCompleted.id],
    }));
    const failedCheckProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-failed-check",
      "journal-integration",
      records.map((record) => record.id === integrationEvidence.id
        ? { ...record, data: { ...record.data, result: { status: "failed", summary: "Typechecking failed" } } }
        : record),
    )]));
    expect(failedCheckProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-integration-binding");
    expect(failedCheckProjection.units[0]?.tasks[0]?.activities
      .find((activity) => activity.activity === "code-integration")?.accepted).toHaveLength(0);
    const validationEvidenceIds = new Set(validationEvidence.map((item) => item.id));
    const extraValidationOutputProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-validation-extra-output",
      "journal-integration",
      records.map((record) => validationEvidenceIds.has(record.id) && record.id === validationEvidence[0]?.id
        ? { ...record, data: { ...record.data, output_refs: ["output:task", "output:unplanned"] } }
        : record),
    )]));
    expect(extraValidationOutputProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-integration-binding");
    const unplannedCheckProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-unplanned-check",
      "journal-integration",
      records.map((record) => record.id === integrationEvidence.id
        ? { ...record, data: { ...record.data, check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "unplanned"] } } }
        : record),
    )]));
    expect(unplannedCheckProjection.units[0]?.tasks[0]?.state).not.toBe("complete");
    const checkpointTampered = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-checkpoint-tampered",
      "journal-integration",
      records.map((record) => record.id === integrationEvidence.id
        ? { ...record, data: { ...record.data, checkpoints: [{ repository_id: "repo-main", commit: "ffffffffffffffffffffffffffffffffffffffff" }] } }
        : record),
    )]));
    expect(checkpointTampered.projectionIssues.map((issue) => issue.code)).toContain("invalid-integration-binding");
    const activityRevisionInteraction = event("event-activity-revision-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["orchestrator"],
      content: "Reopen the completed Integration scope within the same parent",
      references: ["opaque: Activity revision"],
    }, "journal-integration", [activityCompleted.id]);
    const activityRevision = event("event-activity-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.nextRevision,
      orchestrator_decision: "Reopen Code Integration",
      reason: "The completed Activity needs correction",
      inputs: [{ reference: "evidence:integration", purpose: "Supporting Activity evidence" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
    }, "journal-integration", [activityRevisionInteraction.id]);
    const activityReopened = event("event-activity-reopened", "construction.activity-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      revision_id: ids.nextRevision,
      reason: "Open a replacement Integration attempt",
    }, "journal-integration", [activityRevision.id]);
    const sameParentReopenProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://same-parent-activity-reopen",
      "journal-integration",
      [...records.slice(0, -1), activityRevisionInteraction, activityRevision, activityReopened],
    )]));
    const reopenedActivity = sameParentReopenProjection.units[0]?.tasks[0]?.activities.find((item) => item.activity === "code-integration");
    expect(reopenedActivity?.state).toBe("reopened");
    expect(reopenedActivity?.attempts.find((attempt) => attempt.attemptId === ids.activityAttempt)?.state).toBe("ended_by_revision");
    const currentActivityRevision = event("event-current-activity-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.lateRevision,
      orchestrator_decision: "Return Code Integration within the active parent",
      reason: "The current candidate must be reassessed",
      inputs: [{ reference: "evidence:integration-revision", purpose: "Support the current Activity return" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      affected_scopes: [{ kind: "activity", task_id: ids.task, stage_attempt_id: ids.stageAttempt, activity: "code-integration", prior_attempt: "present", activity_attempt_id: ids.activityAttempt }],
    }, "journal-integration", [activityRevisionInteraction.id], 2);
    const currentActivityEnding = event("event-current-activity-ending", "construction.activity-attempt-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      revision_id: ids.lateRevision,
      reason: "End the superseded Integration attempt",
    }, "journal-integration", [currentActivityRevision.id]);
    const currentActivityReopened = event("event-current-activity-reopened", "construction.activity-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      revision_id: ids.lateRevision,
      reason: "Reopen Integration under the same parent",
    }, "journal-integration", [currentActivityEnding.id, currentActivityRevision.id]);
    const currentActivityProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://current-activity-revision",
      "journal-integration",
      [...records.slice(0, -1), activityRevisionInteraction, currentActivityRevision, currentActivityEnding, currentActivityReopened],
    )]));
    expect(currentActivityProjection.units[0]?.blocked).toBe(false);
    expect(currentActivityProjection.projectionIssues.map((issue) => issue.code)).not.toContain("invalid-revision-transition");
    expect(currentActivityProjection.units[0]?.tasks[0]?.activities.find((item) => item.activity === "code-integration")?.state).toBe("reopened");
    expect(currentActivityProjection.units[0]?.tasks[0]?.activities.find((item) => item.activity === "code-integration")?.attempts.find((attempt) => attempt.attemptId === ids.activityAttempt)?.state).toBe("ended_by_revision");
    const revisionInteraction = event("event-task-revision-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["orchestrator"],
      content: "The task needs an authorized revision",
      references: ["opaque: task revision"],
    }, "journal-integration", [taskCompleted.id]);
    const revision = event("event-task-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.revision,
      orchestrator_decision: "Reopen the task",
      reason: "The integrated task result needs correction",
      inputs: [{ reference: "evidence:task", purpose: "Supporting task evidence" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
    }, "journal-integration", [revisionInteraction.id]);
    const taskEnded = event("event-task-ended", "construction.task-scope-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      revision_id: ids.revision,
      reason: "End the affected task scope",
      affected_activities: ["code-generation", "code-validation", "code-integration"],
    }, "journal-integration", [revision.id, taskCompleted.id]);
    const taskReopened = event("event-task-reopened", "construction.task-scope-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      revision_id: ids.revision,
      reason: "Reopen the affected task scope",
      affected_activities: ["code-generation", "code-validation", "code-integration"],
    }, "journal-integration", [taskEnded.id, revision.id]);
    const lateTaskCompletion = event("event-late-task-completion", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["A late completion reused stale Integration evidence"],
    }, "journal-integration", [accepted.id, activityCompleted.id, taskReopened.id]);
    const revisedProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://integration-after-revision",
      "journal-integration",
      [...records, revisionInteraction, revision, taskEnded, taskReopened, lateTaskCompletion],
    )]));
    expect(revisedProjection.projectionIssues).toEqual([]);
    expect(revisedProjection.units[0]?.blocked).toBe(false);
    expect(revisedProjection.units[0]?.tasks[0]?.state).toBe("reopened");
    expect(revisedProjection.units[0]?.tasks[0]?.completion).toBeUndefined();
    const lateCompletionBeforeReopen = event("event-late-completion-before-reopen", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["A late completion followed an ended task scope"],
    }, "journal-integration", [accepted.id, activityCompleted.id, taskEnded.id]);
    const endedProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://ended-task",
      "journal-integration",
      [...records, revisionInteraction, revision, taskEnded, lateCompletionBeforeReopen],
    )]));
    expect(endedProjection.projectionIssues).toEqual([]);
    expect(endedProjection.units[0]?.blocked).toBe(false);
    expect(endedProjection.units[0]?.tasks[0]?.state).toBe("blocked");
    expect(endedProjection.units[0]?.tasks[0]?.completion).toBeUndefined();
    const mismatchedReopen = event("event-task-reopened-mismatched", "construction.task-scope-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      revision_id: ids.revision,
      reason: "Reopen with a different affected scope",
      affected_activities: ["code-generation"],
    }, "journal-integration", [taskEnded.id, revision.id]);
    const mismatchedLateCompletion = event("event-mismatched-late-completion", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["A late completion followed a mismatched reopen"],
    }, "journal-integration", [accepted.id, activityCompleted.id, mismatchedReopen.id]);
    const mismatchedProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://mismatched-task-reopen",
      "journal-integration",
      [...records, revisionInteraction, revision, taskEnded, mismatchedReopen, mismatchedLateCompletion],
    )]));
    expect(mismatchedProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(mismatchedProjection.units[0]?.blocked).toBe(true);
    expect(mismatchedProjection.units[0]?.tasks[0]?.completion).toBeUndefined();
    const lateAcceptance = event("event-late-integration-acceptance", "construction.integration-accepted", accepted.data,
      "journal-integration", [taskEnded.id, prepared.id, integrationEvidence.id]);
    const dependentAdmission = event("event-dependent-task-admitted", "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.dependentTask, content_version: "dependent-task-version" },
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      predecessor_provenance: [{
        task_id: ids.task,
        integration_event_id: lateAcceptance.id,
        checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      }],
      prerequisite_evidence: [],
    }, "journal-integration", [started.id, baseline.id, lateAcceptance.id]);
    const dependentProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://stale-predecessor-acceptance",
      "journal-integration",
      [...records, revisionInteraction, revision, taskEnded, lateAcceptance, dependentAdmission],
    )]));
    expect(dependentProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-admission");
    expect(dependentProjection.units[0]?.blocked).toBe(true);
    expect(dependentProjection.units[0]?.tasks.find((task) => task.taskId === ids.dependentTask)?.state).toBe("unknown");
    const dependentAdmissionBeforeRevision = event("event-dependent-admission-before-revision", "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.dependentTask, content_version: "dependent-task-version" },
      admission_baseline: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      predecessor_provenance: [{
        task_id: ids.task,
        integration_event_id: accepted.id,
        checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      }],
      prerequisite_evidence: [],
    }, "journal-integration", [started.id, baseline.id, accepted.id]);
    const dependentAfterRevisionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://dependent-admission-before-revision",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, revisionInteraction, revision, taskEnded, taskReopened],
    )]));
    const dependentAfterRevision = dependentAfterRevisionProjection.units[0]?.tasks.find((task) => task.taskId === ids.dependentTask);
    expect(dependentAfterRevisionProjection.projectionIssues.map((issue) => issue.code)).not.toContain("invalid-task-admission");
    expect(dependentAfterRevisionProjection.units[0]?.blocked).toBe(false);
    expect(dependentAfterRevision?.admission?.event.id).toBe(dependentAdmissionBeforeRevision.id);
    expect(dependentAfterRevision?.state).toBe("blocked");
    const dependentActivityStartedAfterRevision = event("event-dependent-activity-after-revision", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-generation",
      activity_attempt_id: ids.dependentActivityAttempt,
      inputs: [{ reference: "opaque: stale predecessor input", purpose: "Generated task input" }],
      checkpoints: [],
    }, "journal-integration", [dependentAdmissionBeforeRevision.id]);
    const dependentActivityAfterRevisionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://dependent-activity-after-revision",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, revisionInteraction, revision, taskEnded, taskReopened,
        dependentActivityStartedAfterRevision],
    )]));
    const dependentAfterActivityStart = dependentActivityAfterRevisionProjection.units[0]?.tasks.find((task) => task.taskId === ids.dependentTask);
    expect(dependentActivityAfterRevisionProjection.projectionIssues.map((issue) => issue.code)).not.toContain("invalid-activity-start");
    expect(dependentActivityAfterRevisionProjection.units[0]?.blocked).toBe(false);
    expect(dependentAfterActivityStart?.state).toBe("blocked");
    expect(dependentAfterActivityStart?.activities.find((activity) => activity.activity === "code-generation")?.state).not.toBe("running");
    const dependentGenerationStarted = event("event-dependent-generation-started", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-generation",
      activity_attempt_id: ids.dependentActivityAttempt,
      inputs: [],
      checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
    }, "journal-integration", [dependentAdmissionBeforeRevision.id]);
    const dependentGenerationEvidence = event("event-dependent-generation-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-generation",
      activity_attempt_id: ids.dependentActivityAttempt,
      evidence_id: "60000000-0000-4000-8000-000000000011",
      artifact_bindings: [],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
      inputs: [],
      check: "code-generation-self-review",
      executor: "agent:generator",
      result: { status: "passed", summary: "Generated dependent task output" },
      output_refs: ["opaque: task output"],
      conditions: [],
    }, "journal-integration", [dependentGenerationStarted.id]);
    const dependentGenerationTypecheck = event("event-dependent-generation-typecheck", "construction.evidence-recorded", {
      ...dependentGenerationEvidence.data, evidence_id: "60000000-0000-4000-8000-000000000024", check: "code-generation-typecheck",
    }, "journal-integration", [dependentGenerationStarted.id]);
    const dependentGenerationRelatedTests = event("event-dependent-generation-related-tests", "construction.evidence-recorded", {
      ...dependentGenerationEvidence.data, evidence_id: "60000000-0000-4000-8000-000000000025", check: "code-generation-related-tests",
    }, "journal-integration", [dependentGenerationStarted.id]);
    const dependentGenerationCompleted = event("event-dependent-generation-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-generation",
      activity_attempt_id: ids.dependentActivityAttempt,
      evidence_ids: ["60000000-0000-4000-8000-000000000011", "60000000-0000-4000-8000-000000000024", "60000000-0000-4000-8000-000000000025"],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [dependentGenerationStarted.id, dependentGenerationEvidence.id, dependentGenerationTypecheck.id, dependentGenerationRelatedTests.id]);
    const dependentValidationStarted = event("event-dependent-validation-started", "construction.activity-attempt-started", {
      ...validationStarted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
    }, "journal-integration", [dependentAdmissionBeforeRevision.id, dependentGenerationCompleted.id]);
    const dependentValidationEvidence = event("event-dependent-validation-evidence", "construction.evidence-recorded", {
      ...sourceEvidence.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
      evidence_id: ids.dependentSourceEvidence,
      output_refs: ["opaque: task output"],
    }, "journal-integration", [dependentValidationStarted.id]);
    const dependentValidationSupplementalEvidence = [
      ["60000000-0000-4000-8000-000000000026", "code-validation-typecheck"],
      ["60000000-0000-4000-8000-000000000027", "code-validation-build"],
      ["60000000-0000-4000-8000-000000000028", "code-validation-full-test-suite"],
      ["60000000-0000-4000-8000-000000000029", "code-validation-self-review"],
    ].map(([evidenceId, check], index) => event(`event-dependent-validation-evidence-${index}`, "construction.evidence-recorded", {
      ...dependentValidationEvidence.data, evidence_id: evidenceId, check, executor: "agent:validator", worker_context_id: "context-validation",
    }, "journal-integration", [dependentValidationStarted.id]));
    const dependentValidationEvidenceRecords = [dependentValidationEvidence, ...dependentValidationSupplementalEvidence];
    const dependentValidationCompleted = event("event-dependent-validation-completed", "construction.activity-attempt-completed", {
      ...validationCompleted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
      evidence_ids: dependentValidationEvidenceRecords.map((item) => String(item.data.evidence_id)),
    }, "journal-integration", [dependentValidationStarted.id, ...dependentValidationEvidenceRecords.map((item) => item.id)]);
    const dependentIntegrationStarted = event("event-dependent-integration-started", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-integration",
      activity_attempt_id: ids.dependentIntegrationAttempt,
      inputs: [{ reference: "opaque: stale predecessor input", purpose: "Integration input" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [dependentAdmissionBeforeRevision.id, dependentValidationCompleted.id]);
    const dependentIntegrationPrepared = event("event-dependent-integration-prepared", "construction.integration-prepared", {
      ...prepared.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentIntegrationAttempt,
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
      task_output_refs: ["opaque: task output"],
      source_evidence_ids: [ids.dependentSourceEvidence],
    }, "journal-integration", [dependentIntegrationStarted.id, dependentAdmissionBeforeRevision.id,
      dependentValidationCompleted.id, dependentValidationEvidence.id]);
    const dependentIntegrationEvidence = event("event-dependent-integration-evidence", "construction.evidence-recorded", {
      ...integrationEvidence.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentIntegrationAttempt,
      evidence_id: ids.dependentIntegrationEvidence,
      checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
    }, "journal-integration", [dependentIntegrationPrepared.id]);
    const dependentIntegrationBuildEvidence = event("event-dependent-integration-build-evidence", "construction.evidence-recorded", {
      ...dependentIntegrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000030",
      check: "code-integration-build",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
    }, "journal-integration", [dependentIntegrationPrepared.id]);
    const dependentIntegrationSuiteEvidence = event("event-dependent-integration-suite-evidence", "construction.evidence-recorded", {
      ...dependentIntegrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000031",
      check: "code-integration-full-test-suite",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
    }, "journal-integration", [dependentIntegrationPrepared.id]);
    const dependentIntegrationSelfReview = event("event-dependent-integration-self-review", "construction.evidence-recorded", {
      ...dependentIntegrationEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000032",
      check: "code-integration-self-review",
      conditions: ["Integration bindings match the accepted candidate and actual inputs.", "Complete the task"],
    }, "journal-integration", [dependentIntegrationPrepared.id]);
    const dependentIntegrationAccepted = event("event-dependent-integration-accepted", "construction.integration-accepted", {
      ...accepted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentIntegrationAttempt,
      prepared_event_id: dependentIntegrationPrepared.id,
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.dependentIntegrationEvidence, "60000000-0000-4000-8000-000000000030", "60000000-0000-4000-8000-000000000031"] }],
      authority_event_ids: [dependentIntegrationSelfReview.id],
    }, "journal-integration", [dependentIntegrationPrepared.id, dependentIntegrationEvidence.id,
      dependentIntegrationBuildEvidence.id, dependentIntegrationSuiteEvidence.id, dependentIntegrationSelfReview.id]);
    const dependentIntegrationCompleted = event("event-dependent-integration-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-integration",
      activity_attempt_id: ids.dependentIntegrationAttempt,
      evidence_ids: [ids.dependentIntegrationEvidence, "60000000-0000-4000-8000-000000000030", "60000000-0000-4000-8000-000000000031", "60000000-0000-4000-8000-000000000032"],
      checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
    }, "journal-integration", [dependentIntegrationStarted.id, dependentIntegrationAccepted.id, dependentIntegrationEvidence.id,
      dependentIntegrationBuildEvidence.id, dependentIntegrationSuiteEvidence.id, dependentIntegrationSelfReview.id]);
    const dependentCompletionAfterRevision = event("event-dependent-completion-after-revision", "construction.task-completed", {
      ...taskCompleted.data,
      task_id: ids.dependentTask,
      integration_event_id: dependentIntegrationAccepted.id,
    }, "journal-integration", [dependentIntegrationAccepted.id, dependentIntegrationCompleted.id, dependentAdmissionBeforeRevision.id]);
    const dependentIntegrationAfterRevisionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://dependent-integration-after-revision",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentGenerationStarted, dependentGenerationEvidence,
        dependentGenerationTypecheck, dependentGenerationRelatedTests, dependentGenerationCompleted, dependentValidationStarted,
        ...dependentValidationEvidenceRecords, dependentValidationCompleted, revisionInteraction, revision, taskEnded, taskReopened,
        dependentIntegrationStarted, dependentIntegrationPrepared, dependentIntegrationEvidence,
        dependentIntegrationBuildEvidence, dependentIntegrationSuiteEvidence, dependentIntegrationSelfReview,
        dependentIntegrationAccepted, dependentIntegrationCompleted, dependentCompletionAfterRevision],
    )]));
    const dependentAfterIntegration = dependentIntegrationAfterRevisionProjection.units[0]?.tasks.find((task) => task.taskId === ids.dependentTask);
    expect(dependentIntegrationAfterRevisionProjection.projectionIssues).toEqual([]);
    expect(dependentIntegrationAfterRevisionProjection.units[0]?.blocked).toBe(false);
    expect(dependentAfterIntegration?.state).toBe("blocked");
    expect(dependentAfterIntegration?.completion).toBeUndefined();
    expect(dependentAfterIntegration?.activities.find((activity) => activity.activity === "code-integration")?.state).not.toBe("running");
    const thirdTaskAdmissionAfterInvalidation = event("event-third-task-admission-after-invalidation", "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.thirdTask,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.thirdTask, content_version: "third-task-version" },
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      predecessor_provenance: [{
        task_id: ids.dependentTask,
        integration_event_id: dependentIntegrationAccepted.id,
        checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
      }],
      prerequisite_evidence: [],
    }, "journal-integration", [started.id, baseline.id, dependentIntegrationAccepted.id]);
    const transitiveInvalidationProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://transitive-invalidation",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentGenerationStarted, dependentGenerationEvidence,
        dependentGenerationTypecheck, dependentGenerationRelatedTests, dependentGenerationCompleted, dependentValidationStarted,
        ...dependentValidationEvidenceRecords, dependentValidationCompleted, revisionInteraction, revision, taskEnded, taskReopened,
        dependentIntegrationStarted, dependentIntegrationPrepared, dependentIntegrationEvidence,
        dependentIntegrationBuildEvidence, dependentIntegrationSuiteEvidence, dependentIntegrationSelfReview,
        dependentIntegrationAccepted, dependentIntegrationCompleted, dependentCompletionAfterRevision, thirdTaskAdmissionAfterInvalidation],
    )]));
    expect(transitiveInvalidationProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-admission");
    expect(transitiveInvalidationProjection.units[0]?.blocked).toBe(true);
    expect(transitiveInvalidationProjection.units[0]?.tasks.find((task) => task.taskId === ids.thirdTask)?.state).toBe("unknown");
    const resumeInteraction = event("event-resume-revision-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["orchestrator"],
      content: "Reopen Integration for a current attempt",
      references: ["opaque: Integration retry"],
    }, "journal-integration", [taskCompleted.id]);
    const resumeRevision = event("event-resume-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.revision,
      orchestrator_decision: "Reopen Integration",
      reason: "Integration must run on the reopened scope",
      inputs: [{ reference: "evidence:retry", purpose: "Supporting retry evidence" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
    }, "journal-integration", [resumeInteraction.id]);
    const resumeTaskEnded = event("event-resume-task-ended", "construction.task-scope-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      revision_id: ids.revision,
      reason: "End the Integration scope",
      affected_activities: ["code-integration"],
    }, "journal-integration", [resumeRevision.id, taskCompleted.id]);
    const resumeTaskReopened = event("event-resume-task-reopened", "construction.task-scope-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      revision_id: ids.revision,
      reason: "Reopen the Integration scope",
      affected_activities: ["code-integration"],
    }, "journal-integration", [resumeTaskEnded.id, resumeRevision.id]);
    const resumeIntegrationStarted = event("event-resume-integration-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [admission.id, validationCompleted.id, resumeTaskReopened.id]);
    const resumeIntegrationWaiting = event("event-resume-integration-waiting", "construction.activity-waiting", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      reason: "Wait for the integration runner",
    }, "journal-integration", [resumeIntegrationStarted.id]);
    const resumeIntegration = event("event-resume-integration", "construction.activity-resumed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [resumeIntegrationWaiting.id]);
    const resumePrepared = event("event-resume-integration-prepared", "construction.integration-prepared", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      captured_inputs: [{ repository_id: "repo-main", commit: "generated-commit" }],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
      task_output_refs: ["output:task"],
      source_evidence_ids: [ids.sourceEvidence],
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
    }, "journal-integration", [resumeIntegration.id, admission.id, validationCompleted.id, sourceEvidence.id]);
    const resumeEvidence = event("event-resume-integration-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      evidence_id: ids.resumeEvidence,
      artifact_bindings: [{ artifact_id: ids.artifact, content_version: "resumed-candidate-version" }],
      checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      check: "code-integration-typecheck",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
      executor: "agent:integrator",
      result: { status: "passed", summary: "The resumed candidate passed" },
      output_refs: ["opaque: resumed integration output"],
      conditions: [],
    }, "journal-integration", [resumePrepared.id]);
    const resumeBuildEvidence = event("event-resume-integration-build-evidence", "construction.evidence-recorded", {
      ...resumeEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000033",
      check: "code-integration-build",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] },
    }, "journal-integration", [resumePrepared.id]);
    const resumeSuiteEvidence = event("event-resume-integration-suite-evidence", "construction.evidence-recorded", {
      ...resumeEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000034",
      check: "code-integration-full-test-suite",
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
    }, "journal-integration", [resumePrepared.id]);
    const resumeSelfReview = event("event-resume-integration-self-review", "construction.evidence-recorded", {
      ...resumeEvidence.data,
      evidence_id: "60000000-0000-4000-8000-000000000035",
      check: "code-integration-self-review",
      conditions: ["Integration bindings match the accepted candidate and actual inputs.", "Complete the task"],
    }, "journal-integration", [resumePrepared.id]);
    const resumeAccepted = event("event-resume-integration-accepted", "construction.integration-accepted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      prepared_event_id: resumePrepared.id,
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.resumeEvidence, "60000000-0000-4000-8000-000000000033", "60000000-0000-4000-8000-000000000034"] }],
      authority_event_ids: [resumeSelfReview.id],
    }, "journal-integration", [resumePrepared.id, resumeEvidence.id, resumeBuildEvidence.id,
      resumeSuiteEvidence.id, resumeSelfReview.id]);
    const resumeCompleted = event("event-resume-integration-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      evidence_ids: [ids.resumeEvidence, "60000000-0000-4000-8000-000000000033", "60000000-0000-4000-8000-000000000034", "60000000-0000-4000-8000-000000000035"],
      checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
    }, "journal-integration", [resumeIntegration.id, resumeAccepted.id, resumeEvidence.id, resumeBuildEvidence.id,
      resumeSuiteEvidence.id, resumeSelfReview.id]);
    const resumeTaskCompleted = event("event-resume-task-completed", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: resumeAccepted.id,
      conditions: ["Complete the task", "Complete the task"],
    }, "journal-integration", [resumeAccepted.id, resumeCompleted.id, admission.id]);
    const resumedProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://resumed-integration",
      "journal-integration",
      [
        ...records,
        resumeInteraction,
        resumeRevision,
        resumeTaskEnded,
        resumeTaskReopened,
        resumeIntegrationStarted,
        resumeIntegrationWaiting,
        resumeIntegration,
        resumePrepared,
        resumeEvidence,
        resumeBuildEvidence,
        resumeSuiteEvidence,
        resumeSelfReview,
        resumeAccepted,
        resumeCompleted,
        resumeTaskCompleted,
      ],
    )]));
    expect(resumedProjection.projectionIssues).toEqual([]);
    expect(resumedProjection.units[0]?.blocked).toBe(false);
    expect(resumedProjection.units[0]?.tasks[0]?.state).toBe("complete");
    expect(resumedProjection.units[0]?.tasks[0]?.completion?.event.id).toBe(resumeTaskCompleted.id);
    const resumedIntegration = resumedProjection.units[0]?.tasks[0]?.activities.find((activity) => activity.activity === "code-integration");
    expect(resumedIntegration?.attempts.find((attempt) => attempt.attemptId === ids.activityAttempt)?.state).toBe("ended_by_revision");
    expect(resumedIntegration?.attempts.find((attempt) => attempt.attemptId === ids.resumeActivityAttempt)?.state).toBe("completed");
    const parentRevisionInteraction = event("event-parent-revision-interaction", "construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      participants: ["orchestrator"],
      content: "Restart Implementation with the completed Integration as an input candidate",
      references: ["opaque: parent revision"],
    }, "journal-integration", [taskCompleted.id]);
    const parentRevision = event("event-parent-revision", "construction.revision-authorized", {
      mission_id: missionId,
      unit_id: ids.unit,
      revision_id: ids.nextRevision,
      orchestrator_decision: "Restart Implementation",
      reason: "A new Implementation parent is required",
      inputs: [{ reference: "evidence:parent", purpose: "Supporting parent-revision evidence" }],
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
    }, "journal-integration", [parentRevisionInteraction.id]);
    const parentEnded = event("event-parent-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.nextRevision,
      reason: "End the old Implementation parent",
    }, "journal-integration", [parentRevision.id, taskCompleted.id]);
    const parentReopened = event("event-parent-reopened", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.nextRevision,
      reason: "Open the new Implementation parent",
    }, "journal-integration", [parentEnded.id, parentRevision.id]);
    const parentReopenedWithoutAttempt = event("event-parent-reopened-without-attempt", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      revision_id: ids.nextRevision,
      reason: "Omit the ended Implementation attempt",
    }, "journal-integration", [parentEnded.id, parentRevision.id]);
    const missingParentAttemptHistory = collectHistory(missionId, [source(
      "origin://parent-reopen-without-attempt",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopenedWithoutAttempt],
    )]);
    const missingParentAttemptProjection = projectConstruction(missingParentAttemptHistory);
    expect(missingParentAttemptProjection.historyIssues.map((issue) => issue.code)).toContain("invalid-event");
    expect(missingParentAttemptProjection.units[0]?.blocked).toBe(true);
    const parentReopenedForWrongAttempt = event("event-parent-reopened-for-wrong-attempt", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      revision_id: ids.nextRevision,
      reason: "Target a different ended Implementation attempt",
    }, "journal-integration", [parentEnded.id, parentRevision.id]);
    const wrongParentAttemptProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://parent-reopen-wrong-attempt",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopenedForWrongAttempt],
    )]));
    expect(wrongParentAttemptProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(wrongParentAttemptProjection.units[0]?.blocked).toBe(true);
    const parentReopenedWithoutEndCause = event("event-parent-reopened-without-end-cause", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.nextRevision,
      reason: "Omit the matching revision-end event as a direct cause",
    }, "journal-integration", [parentRevision.id]);
    const missingEndCauseProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://parent-reopen-without-end-cause",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopenedWithoutEndCause],
    )]));
    expect(missingEndCauseProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(missingEndCauseProjection.units[0]?.blocked).toBe(true);
    const nextImplementationStarted = stageStart("event-next-implementation-start", ids.nextStageAttempt, ids.unit,
      "journal-integration", [parentReopened.id]);
    const crossParentAdmission = (id: string, causedBy: readonly string[]) => event(id, "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      task_id: ids.dependentTask,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.dependentTask, content_version: "dependent-task-version" },
      admission_baseline: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      predecessor_provenance: [{
        task_id: ids.task,
        integration_event_id: accepted.id,
        checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      }],
      prerequisite_evidence: [],
    }, "journal-integration", causedBy);
    const crossParentAdmissionWithoutRetention = crossParentAdmission("event-cross-parent-admission-without-retention",
      [nextImplementationStarted.id, baseline.id, accepted.id]);
    const crossParentWithoutRetentionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://cross-parent-without-retention",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        crossParentAdmissionWithoutRetention],
    )]));
    expect(crossParentWithoutRetentionProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-admission");
    expect(crossParentWithoutRetentionProjection.units[0]?.blocked).toBe(true);
    const retainedIntegrationAssessment = event("event-retained-integration-assessment", "construction.retained-scope-assessed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      assessments: [{
        task_id: ids.task,
        activity: "code-integration",
        original_stage_attempt_id: ids.stageAttempt,
        original_activity_attempt_id: ids.activityAttempt,
        original_evidence_ids: [ids.evidence, "60000000-0000-4000-8000-000000000013", "60000000-0000-4000-8000-000000000014", "60000000-0000-4000-8000-000000000015"],
        applicable: true,
        reason: "The predecessor Integration output remains applicable under the new parent",
        checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      }],
    }, "journal-integration", [nextImplementationStarted.id, accepted.id, integrationEvidence.id, activityCompleted.id]);
    const crossParentAdmissionWithRetention = crossParentAdmission("event-cross-parent-admission-with-retention",
      [nextImplementationStarted.id, baseline.id, accepted.id, retainedIntegrationAssessment.id]);
    const retainedActivityProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://retained-completed-activity",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        retainedIntegrationAssessment],
    )]));
    expect(retainedActivityProjection.projectionIssues).toEqual([]);
    const retainedActivity = retainedActivityProjection.units[0]?.tasks.find((task) => task.taskId === ids.task)
      ?.activities.find((activity) => activity.activity === "code-integration");
    expect(retainedActivity?.state).toBe("completed");
    expect(retainedActivity?.currentAttemptId).toBe(ids.activityAttempt);
    expect(retainedActivity?.stageAttemptId).toBe(ids.stageAttempt);
    const crossParentWithRetentionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://cross-parent-with-retention",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        retainedIntegrationAssessment, crossParentAdmissionWithRetention],
    )]));
    expect(crossParentWithRetentionProjection.projectionIssues).toEqual([]);
    expect(crossParentWithRetentionProjection.units[0]?.blocked).toBe(false);
    expect(crossParentWithRetentionProjection.units[0]?.tasks.find((task) => task.taskId === ids.dependentTask)?.admission?.event.id)
      .toBe(crossParentAdmissionWithRetention.id);
    const retainedTaskAdmission = event("event-retained-task-admission", "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      task_id: ids.task,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.task, content_version: "task-version-1" },
      admission_baseline: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    }, "journal-integration", [nextImplementationStarted.id, baseline.id, accepted.id, retainedIntegrationAssessment.id]);
    const retainedTaskCompletion = event("event-retained-task-completion", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["Complete the task"],
    }, "journal-integration", [nextImplementationStarted.id, retainedTaskAdmission.id,
      retainedIntegrationAssessment.id, accepted.id, activityCompleted.id]);
    const retainedTaskCompletionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://retained-task-completion",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        retainedIntegrationAssessment, retainedTaskAdmission, retainedTaskCompletion],
    )]));
    expect(retainedTaskCompletionProjection.projectionIssues).toEqual([]);
    expect(retainedTaskCompletionProjection.units[0]?.blocked).toBe(false);
    expect(retainedTaskCompletionProjection.units[0]?.tasks.find((task) => task.taskId === ids.task)).toMatchObject({
      state: "complete",
      stageAttemptId: ids.nextStageAttempt,
      completion: { event: { id: retainedTaskCompletion.id, data: { integration_event_id: accepted.id } } },
    });
    const retainedDependentIntegrationOnly = event("event-retained-dependent-integration-only",
      "construction.retained-scope-assessed", {
        mission_id: missionId,
        unit_id: ids.unit,
        stage: "implementation",
        stage_attempt_id: ids.nextStageAttempt,
        assessments: [{
          task_id: ids.dependentTask,
          activity: "code-integration",
          original_stage_attempt_id: ids.stageAttempt,
          original_activity_attempt_id: ids.dependentIntegrationAttempt,
          original_evidence_ids: [ids.dependentIntegrationEvidence, "60000000-0000-4000-8000-000000000030", "60000000-0000-4000-8000-000000000031", "60000000-0000-4000-8000-000000000032"],
          applicable: true,
          reason: "The dependent Integration output remains applicable",
          checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        }],
      }, "journal-integration", [nextImplementationStarted.id, dependentIntegrationAccepted.id,
        dependentIntegrationEvidence.id, dependentIntegrationBuildEvidence.id, dependentIntegrationSuiteEvidence.id, dependentIntegrationSelfReview.id]);
    const thirdTaskAdmissionAfterRestart = (id: string, retainedAssessment: string) => event(id,
      "construction.task-admitted", {
        mission_id: missionId,
        unit_id: ids.unit,
        stage: "implementation",
        stage_attempt_id: ids.nextStageAttempt,
        task_id: ids.thirdTask,
        graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
        task_definition_ref: { graph_id: ids.graph, task_id: ids.thirdTask, content_version: "third-task-version" },
        admission_baseline: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        predecessor_provenance: [{
          task_id: ids.dependentTask,
          integration_event_id: dependentIntegrationAccepted.id,
          checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        }],
        prerequisite_evidence: [],
      }, "journal-integration", [nextImplementationStarted.id, baseline.id,
        dependentIntegrationAccepted.id, retainedAssessment]);
    const thirdTaskAdmissionWithoutAncestorRetention = thirdTaskAdmissionAfterRestart(
      "event-third-task-admission-without-ancestor-retention", retainedDependentIntegrationOnly.id);
    const transitiveRetentionHistory = collectHistory(missionId, [source(
      "origin://transitive-retention-missing",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentGenerationStarted, dependentGenerationEvidence,
        dependentGenerationTypecheck, dependentGenerationRelatedTests, dependentGenerationCompleted, dependentValidationStarted,
        ...dependentValidationEvidenceRecords, dependentValidationCompleted, dependentIntegrationStarted, dependentIntegrationPrepared,
        dependentIntegrationEvidence, dependentIntegrationBuildEvidence, dependentIntegrationSuiteEvidence,
        dependentIntegrationSelfReview, dependentIntegrationAccepted, dependentIntegrationCompleted, dependentCompletionAfterRevision,
        revisionInteraction, revision, taskEnded, taskReopened, parentRevisionInteraction, parentRevision,
        parentEnded, parentReopened, nextImplementationStarted, retainedDependentIntegrationOnly,
        thirdTaskAdmissionWithoutAncestorRetention],
    )]);
    const transitiveRetentionMissingProjection = projectConstruction(transitiveRetentionHistory);
    expect(transitiveRetentionMissingProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-admission");
    expect(transitiveRetentionMissingProjection.units[0]?.blocked).toBe(true);
    const retainedDependentAndAncestor = event("event-retained-dependent-and-ancestor", "construction.retained-scope-assessed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      assessments: [
        {
          task_id: ids.task,
          activity: "code-integration",
          original_stage_attempt_id: ids.stageAttempt,
          original_activity_attempt_id: ids.activityAttempt,
          original_evidence_ids: [ids.evidence, "60000000-0000-4000-8000-000000000013", "60000000-0000-4000-8000-000000000014", "60000000-0000-4000-8000-000000000015"],
          applicable: true,
          reason: "The predecessor Integration output remains applicable",
          checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
        },
        {
          task_id: ids.dependentTask,
          activity: "code-integration",
          original_stage_attempt_id: ids.stageAttempt,
          original_activity_attempt_id: ids.dependentIntegrationAttempt,
          original_evidence_ids: [ids.dependentIntegrationEvidence, "60000000-0000-4000-8000-000000000030", "60000000-0000-4000-8000-000000000031", "60000000-0000-4000-8000-000000000032"],
          applicable: true,
          reason: "The dependent Integration output remains applicable with its retained input",
          checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        },
      ],
    }, "journal-integration", [nextImplementationStarted.id, accepted.id, integrationEvidence.id, integrationBuildEvidence.id,
      integrationSuiteEvidence.id, integrationSelfReviewEvidence.id, dependentIntegrationAccepted.id, dependentIntegrationEvidence.id,
      dependentIntegrationBuildEvidence.id, dependentIntegrationSuiteEvidence.id, dependentIntegrationSelfReview.id]);
    const thirdTaskAdmissionWithAncestorRetention = thirdTaskAdmissionAfterRestart(
      "event-third-task-admission-with-ancestor-retention", retainedDependentAndAncestor.id);
    const transitiveRetentionCompleteProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://transitive-retention-complete",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentGenerationStarted, dependentGenerationEvidence,
        dependentGenerationTypecheck, dependentGenerationRelatedTests, dependentGenerationCompleted, dependentValidationStarted,
        ...dependentValidationEvidenceRecords, dependentValidationCompleted, dependentIntegrationStarted, dependentIntegrationPrepared,
        dependentIntegrationEvidence, dependentIntegrationBuildEvidence, dependentIntegrationSuiteEvidence,
        dependentIntegrationSelfReview, dependentIntegrationAccepted, dependentIntegrationCompleted, dependentCompletionAfterRevision,
        revisionInteraction, revision, taskEnded, taskReopened, parentRevisionInteraction, parentRevision,
        parentEnded, parentReopened, nextImplementationStarted, retainedDependentAndAncestor,
        thirdTaskAdmissionWithAncestorRetention],
    )]));
    expect(transitiveRetentionCompleteProjection.projectionIssues).toEqual([]);
    expect(transitiveRetentionCompleteProjection.units[0]?.blocked).toBe(false);
    expect(transitiveRetentionCompleteProjection.units[0]?.tasks.find((task) => task.taskId === ids.thirdTask)?.admission?.event.id)
      .toBe(thirdTaskAdmissionWithAncestorRetention.id);
    const newerParentTaskAdmission = event("event-newer-parent-task-admission", "construction.task-admitted", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      task_id: ids.task,
      graph_ref: { graph_id: ids.graph, content_version: "graph-version-1" },
      task_definition_ref: { graph_id: ids.graph, task_id: ids.task, content_version: "task-version-1" },
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    }, "journal-integration", [nextImplementationStarted.id, baseline.id]);
    const newerParentIntegrationStart = event("event-newer-parent-integration-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.nextStageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      inputs: [{ reference: "opaque: candidate input", purpose: "Candidate input" }],
      checkpoints: [],
    }, "journal-integration", [newerParentTaskAdmission.id, nextImplementationStarted.id]);
    const parentActivityRestartProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://parent-activity-restart",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        retainedIntegrationAssessment, newerParentTaskAdmission, newerParentIntegrationStart],
    )]));
    const restartedIntegration = parentActivityRestartProjection.units[0]?.tasks.find((task) => task.taskId === ids.task)
      ?.activities.find((activity) => activity.activity === "code-integration");
    expect(parentActivityRestartProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-activity-start");
    expect(restartedIntegration?.currentAttemptId).toBe(ids.activityAttempt);
    expect(restartedIntegration?.attempts.find((attempt) => attempt.attemptId === ids.activityAttempt)?.state).toBe("completed");
    const lateParentScopeProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://late-parent-scope-transition",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened, nextImplementationStarted,
        newerParentTaskAdmission, newerParentIntegrationStart,
        resumeInteraction, resumeRevision, resumeTaskEnded, resumeTaskReopened],
    )]));
    const lateParentIntegration = lateParentScopeProjection.units[0]?.tasks.find((task) => task.taskId === ids.task)
      ?.activities.find((activity) => activity.activity === "code-integration");
    expect(lateParentScopeProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(lateParentScopeProjection.units[0]?.blocked).toBe(true);
    expect(lateParentIntegration?.currentAttemptId).toBe(ids.activityAttempt);
    expect(lateParentIntegration?.attempts.find((attempt) => attempt.attemptId === ids.resumeActivityAttempt)).toBeUndefined();
    const lateActivityStart = event("event-late-activity-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.lateActivityAttempt,
      inputs: [{ reference: "opaque: delayed input", purpose: "Integration input" }],
      checkpoints: [],
    }, "journal-integration", [admission.id]);
    const lateActivityStartProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://late-activity-start",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened,
        nextImplementationStarted, lateActivityStart],
    )]));
    const lateStartTask = lateActivityStartProjection.units[0]?.tasks.find((task) => task.taskId === ids.task);
    const lateStartIntegration = lateStartTask?.activities.find((activity) => activity.activity === "code-integration");
    expect(lateActivityStartProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(lateActivityStartProjection.units[0]?.blocked).toBe(true);
    expect(lateStartTask?.state).not.toBe("generating");
    expect(lateStartIntegration?.attempts.find((attempt) => attempt.attemptId === ids.lateActivityAttempt)).toBeUndefined();
    const invalidStageResumeBeforeReplacement = event("event-invalid-stage-resume-before-replacement", "construction.stage-resumed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }, "journal-integration", [parentReopened.id]);
    const lateActivityBeforeReplacement = event("event-late-activity-before-replacement", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.lateActivityAttempt,
      inputs: [{ reference: "opaque: delayed input", purpose: "Integration input" }],
      checkpoints: [],
    }, "journal-integration", [admission.id]);
    const lateActivityBeforeReplacementProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://late-activity-before-replacement",
      "journal-integration",
      [...records, parentRevisionInteraction, parentRevision, parentEnded, parentReopened,
        invalidStageResumeBeforeReplacement, lateActivityBeforeReplacement],
    )]));
    expect(lateActivityBeforeReplacementProjection.projectionIssues.map((issue) => issue.code))
      .toContain("invalid-revision-transition");
    expect(lateActivityBeforeReplacementProjection.projectionIssues.map((issue) => issue.code))
      .toContain("invalid-attempt-transition");
    expect(lateActivityBeforeReplacementProjection.units[0]?.blocked).toBe(true);
    expect(lateActivityBeforeReplacementProjection.units[0]?.tasks[0]?.activities
      .find((activity) => activity.activity === "code-integration")?.attempts
      .find((attempt) => attempt.attemptId === ids.lateActivityAttempt)).toBeUndefined();
    const pausedBeforeParentReopen = event("event-paused-before-parent-reopen", "construction.activity-paused", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.lateResumeAttempt,
      reason: "Pause generated work before revising the parent",
    }, "journal-integration", ["event-generation-before-parent-reopen"]);
    const generationStartedBeforeParentReopen = event("event-generation-before-parent-reopen",
      "construction.activity-attempt-started", {
        mission_id: missionId,
        unit_id: ids.unit,
        stage: "implementation",
        stage_attempt_id: ids.stageAttempt,
        task_id: ids.task,
        activity: "code-generation",
        activity_attempt_id: ids.lateResumeAttempt,
        inputs: [{ reference: "opaque: generation input", purpose: "Task input" }],
        checkpoints: [],
      }, "journal-integration", [admission.id]);
    const lateActivityResume = event("event-late-activity-resume", "construction.activity-resumed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.lateResumeAttempt,
      inputs: [{ reference: "opaque: generation input", purpose: "Task input" }],
      checkpoints: [],
    }, "journal-integration", [pausedBeforeParentReopen.id, parentReopened.id]);
    const lateActivityResumeProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://late-activity-resume",
      "journal-integration",
      [...records, generationStartedBeforeParentReopen, pausedBeforeParentReopen,
        parentRevisionInteraction, parentRevision, parentEnded, parentReopened, lateActivityResume],
    )]));
    expect(lateActivityResumeProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-revision-transition");
    expect(lateActivityResumeProjection.units[0]?.blocked).toBe(true);
    expect(lateActivityResumeProjection.units[0]?.tasks[0]?.activities
      .find((activity) => activity.activity === "code-generation")?.attempts
      .find((attempt) => attempt.attemptId === ids.lateResumeAttempt)?.state).toBe("ended_by_revision");
    const incompleteProjection = projectConstruction(collectHistory(missionId, sources, "incomplete"));
    const incompleteUnit = incompleteProjection.units[0];
    const incompleteTask = incompleteUnit?.tasks[0];
    expect(incompleteProjection.historyIssues.map((issue) => issue.code)).toContain("incomplete-history");
    expect(incompleteUnit?.blocked).toBe(true);
    expect(incompleteTask?.state).toBe("unknown");
    expect(incompleteTask?.completion?.event.id).toBe(taskCompleted.id);
    expect(incompleteUnit?.progress).toEqual({
      completedStages: 0,
      totalStages: 6,
      completedTasks: 0,
      knownTasks: 0,
      reliable: false,
    });
  });

  it("retains standalone pre-admission task-prerequisite evidence without inventing a task state", () => {
    const unitCreated = created("event-pre-admission-unit-created", ids.unit, "journal-prerequisite");
    const started = stageStart("event-pre-admission-stage-start", ids.stageAttempt, ids.unit, "journal-prerequisite", [unitCreated.id]);
    const evidence = event("event-pre-admission-prerequisite-proof", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      evidence_id: ids.dependentSourceEvidence,
      artifact_bindings: [],
      checkpoints: [],
      inputs: [{ reference: "opaque: prerequisite#exact", purpose: "Prerequisite evidence" }],
      check: "task-prerequisite",
      executor: "requester",
      result: { status: "passed", summary: "The prerequisite is satisfied." },
      output_refs: [],
      conditions: [],
    }, "journal-prerequisite", [started.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://pre-admission-prerequisite",
      "journal-prerequisite",
      [unitCreated, started, evidence],
    )]));
    const unit = projection.units[0];

    expect(unit?.blocked).toBe(false);
    expect(unit?.stages.find((stage) => stage.stage === "implementation")).toMatchObject({ state: "running", currentAttemptId: ids.stageAttempt });
    expect(unit?.tasks).toEqual([]);
    expect(unit?.evidence.map(({ fact }) => fact.event.id)).toContain(evidence.id);
    expect(unit?.projectionIssues.map((issue) => issue.code)).not.toContain("attempt-transition-without-start");
  });

  it.each([
    ["empty parent cause", []],
    ["unrelated parent cause", ["event-pre-admission-unit-created"]],
  ] as const)("fails closed on a standalone prerequisite fact with %s", (_name, causedBy) => {
    const unitCreated = created("event-unbound-prerequisite-unit-created", ids.unit, "journal-unbound-prerequisite");
    const started = stageStart("event-unbound-prerequisite-stage-start", ids.stageAttempt, ids.unit,
      "journal-unbound-prerequisite", [unitCreated.id]);
    const unrelated = created("event-pre-admission-unit-created", ids.otherUnit, "journal-unbound-prerequisite");
    const evidence = event("event-unbound-prerequisite-proof", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      evidence_id: ids.dependentSourceEvidence,
      artifact_bindings: [],
      checkpoints: [],
      inputs: [{ reference: "opaque: prerequisite#exact", purpose: "Prerequisite evidence" }],
      check: "task-prerequisite",
      executor: "requester",
      result: { status: "passed", summary: "The prerequisite is satisfied." },
      output_refs: [],
      conditions: [],
    }, "journal-unbound-prerequisite", causedBy);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://unbound-prerequisite",
      "journal-unbound-prerequisite",
      [unitCreated, started, unrelated, evidence],
    )]));
    const unit = projection.units.find((candidate) => candidate.unitId === ids.unit);

    expect(unit?.blocked).toBe(true);
    expect(unit?.evidence.map(({ fact }) => fact.event.id)).toContain(evidence.id);
    expect(unit?.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-prerequisite-evidence");
  });

  it("preserves proof recorded before a pause but rejects proof recorded after it", () => {
    const unitCreated = created("event-paused-prerequisite-unit-created", ids.unit, "journal-paused-prerequisite");
    const started = stageStart("event-paused-prerequisite-stage-start", ids.stageAttempt, ids.unit,
      "journal-paused-prerequisite", [unitCreated.id]);
    const proofBeforePause = event("event-prerequisite-before-pause", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      evidence_id: ids.dependentSourceEvidence,
      artifact_bindings: [],
      checkpoints: [],
      inputs: [{ reference: "opaque: prerequisite#exact", purpose: "Prerequisite evidence" }],
      check: "task-prerequisite",
      executor: "requester",
      result: { status: "passed", summary: "The prerequisite is satisfied." },
      output_refs: [],
      conditions: [],
    }, "journal-paused-prerequisite", [started.id]);
    const pauseRequested = event("event-prerequisite-pause-requested", "construction.stage-pause-requested", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: ids.stageAttempt,
      reason: "Pause after recording the prerequisite proof.",
    }, "journal-paused-prerequisite", [started.id]);
    const paused = event("event-prerequisite-paused", "construction.stage-paused", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: ids.stageAttempt,
      reason: "Pause after recording the prerequisite proof.",
    }, "journal-paused-prerequisite", [pauseRequested.id]);
    const validProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://prerequisite-before-pause",
      "journal-paused-prerequisite",
      [unitCreated, started, proofBeforePause, pauseRequested, paused],
    )]));
    expect(validProjection.units[0]?.blocked).toBe(false);
    expect(validProjection.units[0]?.stages.find((stage) => stage.stage === "implementation")).toMatchObject({
      state: "paused", currentAttemptId: ids.stageAttempt,
    });
    expect(validProjection.units[0]?.evidence.map(({ fact }) => fact.event.id)).toContain(proofBeforePause.id);

    const proofAfterPause = event("event-prerequisite-after-pause", "construction.evidence-recorded", {
      ...proofBeforePause.data,
      evidence_id: "60000000-0000-4000-8000-000000000077",
    }, "journal-paused-prerequisite", [paused.id]);
    const invalidProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://prerequisite-after-pause",
      "journal-paused-prerequisite",
      [unitCreated, started, pauseRequested, paused, proofAfterPause],
    )]));
    expect(invalidProjection.units[0]?.blocked).toBe(true);
    expect(invalidProjection.units[0]?.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-prerequisite-evidence");
  });

  it.each(["closed", "reopened"] as const)("rejects standalone prerequisite proof after a %s parent boundary", (boundary) => {
    const journalId = `journal-prerequisite-${boundary}`;
    const unitCreated = created(`event-prerequisite-${boundary}-unit-created`, ids.unit, journalId);
    const started = stageStart(`event-prerequisite-${boundary}-start`, ids.stageAttempt, ids.unit, journalId, [unitCreated.id]);
    const interaction = event(`event-prerequisite-${boundary}-interaction`, "construction.interaction-recorded", {
      mission_id: missionId, unit_id: ids.unit, participants: ["requester"],
      content: "Authorize a new Implementation parent scope.", references: [],
    }, journalId, [started.id]);
    const authorized = event(`event-prerequisite-${boundary}-authorization`, "construction.revision-authorized", {
      mission_id: missionId, unit_id: ids.unit, revision_id: ids.revision,
      orchestrator_decision: "Reopen Implementation", reason: "The prior parent is no longer usable.",
      inputs: [{ reference: "evidence:revision", purpose: "Revision context" }],
      stage: "implementation", stage_attempt_id: ids.stageAttempt,
    }, journalId, [interaction.id]);
    const ended = event(`event-prerequisite-${boundary}-ended`, "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision, reason: "Authorized revision.",
    }, journalId, [authorized.id]);
    const reopened = event(`event-prerequisite-${boundary}-reopened`, "construction.stage-reopened", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision, reason: "Open a replacement parent.",
    }, journalId, [ended.id, authorized.id]);
    const parentBoundary = boundary === "closed" ? ended : reopened;
    const evidence = event(`event-prerequisite-${boundary}-proof`, "construction.evidence-recorded", {
      mission_id: missionId, unit_id: ids.unit, stage: "implementation", stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask, evidence_id: ids.dependentSourceEvidence,
      artifact_bindings: [], checkpoints: [],
      inputs: [{ reference: "opaque: prerequisite#exact", purpose: "Prerequisite evidence" }],
      check: "task-prerequisite", executor: "requester",
      result: { status: "passed", summary: "The prerequisite is satisfied." }, output_refs: [], conditions: [],
    }, journalId, [parentBoundary.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      `origin://prerequisite-${boundary}`, journalId,
      [unitCreated, started, interaction, authorized, ended, ...(boundary === "reopened" ? [reopened] : []), evidence],
    )]));

    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-prerequisite-evidence");
  });

  it("marks invalid prerequisite evidence unsafe even when an admission event already projects its task", () => {
    const unitCreated = created("event-admitted-invalid-prerequisite-unit-created", ids.unit, "journal-admitted-invalid-prerequisite");
    const started = stageStart("event-admitted-invalid-prerequisite-start", ids.stageAttempt, ids.unit,
      "journal-admitted-invalid-prerequisite", [unitCreated.id]);
    const baseline = event("event-admitted-invalid-prerequisite-baseline", "construction.unit-baseline-selected", {
      mission_id: missionId,
      unit_id: ids.unit,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, "journal-admitted-invalid-prerequisite", [unitCreated.id]);
    const admission = taskAdmission(ids.unit, "journal-admitted-invalid-prerequisite", [started.id, baseline.id]);
    const evidence = event("event-admitted-invalid-prerequisite-proof", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      evidence_id: ids.dependentSourceEvidence,
      artifact_bindings: [],
      checkpoints: [],
      inputs: [{ reference: "opaque: prerequisite#exact", purpose: "Prerequisite evidence" }],
      check: "task-prerequisite",
      executor: "requester",
      result: { status: "passed", summary: "The prerequisite is satisfied." },
      output_refs: [],
      conditions: [],
    }, "journal-admitted-invalid-prerequisite", [unitCreated.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://admitted-invalid-prerequisite",
      "journal-admitted-invalid-prerequisite",
      [unitCreated, started, baseline, admission, evidence],
    )]));

    expect(projection.units[0]?.tasks.map((task) => task.taskId)).toContain(ids.task);
    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.projectionIssues.map((issue) => issue.code)).toContain("invalid-task-prerequisite-evidence");
  });

  it("continues blocking task Activity transitions without a validated task admission", () => {
    const unitCreated = created("event-unadmitted-work-unit-created", ids.unit, "journal-unadmitted-work");
    const started = stageStart("event-unadmitted-work-stage-start", ids.stageAttempt, ids.unit, "journal-unadmitted-work", [unitCreated.id]);
    const activityStart = event("event-unadmitted-work-activity-start", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-generation",
      activity_attempt_id: ids.dependentActivityAttempt,
      inputs: [],
      checkpoints: [],
    }, "journal-unadmitted-work", [started.id]);
    const projection = projectConstruction(collectHistory(missionId, [source(
      "origin://unadmitted-task-work",
      "journal-unadmitted-work",
      [unitCreated, started, activityStart],
    )]));

    expect(projection.units[0]?.blocked).toBe(true);
    expect(projection.units[0]?.projectionIssues.map((issue) => issue.code)).toContain("attempt-transition-without-start");
  });
});