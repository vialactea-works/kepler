import { describe, expect, it } from "vitest";
import { collectHistory as collectHistoryFromSources, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
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

const event = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  journalId = "journal-main",
  causedBy: readonly string[] = [],
) => ({
  id,
  phase: "construction",
  type,
  envelope_version: 1,
  event_version: 1,
  journal_id: journalId,
  recorded_at: "2026-10-18T14:30:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
});

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
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-prefix", [unitCreated.id], "functional-design");
    const evidence = event("event-stage-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
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
      stage: "functional-design",
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
      check: "Inspect generated output",
      executor: "agent:builder",
      result: { status: "passed", summary: "Required output exists" },
      output_refs: ["opaque: retained output  "],
      conditions: ["Isolated worktree"],
    }, "journal-unit", [activityStarted.id]);
    const activityCompleted = event("event-code-generation-complete", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-generation",
      activity_attempt_id: ids.activityAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "checkpoint-output" }],
    }, "journal-unit", [activityStarted.id, evidence.id]);
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
      source("origin://unit-one", "journal-unit", [unitCreated, baseline, started, effort, admission, activityStarted, evidence, activityCompleted, approval]),
    ]);
    const second = collectHistory(missionId, [
      source("origin://unit-one", "journal-unit", [unitCreated, baseline, started, effort, admission, activityStarted, evidence, activityCompleted, approval]),
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

  it("keeps a late result bound to its ended attempt instead of completing a newer attempt", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-late");
    const firstStart = stageStart("event-stage-start-one", ids.stageAttempt, ids.unit, "journal-late", [unitCreated.id], "functional-design");
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
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
    }, "journal-late", [interaction.id]);
    const ended = event("event-stage-ended", "construction.stage-attempt-ended-by-revision", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision,
      reason: "Authorized revision",
    }, "journal-late", [authorized.id]);
    const reopened = event("event-stage-reopened", "construction.stage-reopened", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
      revision_id: ids.revision,
      reason: "Re-execute under the authorized revision",
    }, "journal-late", [ended.id, authorized.id]);
    const secondStart = stageStart("event-stage-start-two", ids.nextStageAttempt, ids.unit, "journal-late", [reopened.id], "functional-design");
    const lateCompletion = event("event-late-completion", "construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    }, "journal-late", [firstStart.id]);
    const history = collectHistory(missionId, [source("origin://late", "journal-late", [unitCreated, firstStart, interaction, authorized, ended, reopened, secondStart, lateCompletion])]);
    const projection = projectConstruction(history);
    const unit = projection.units[0];
    const stageView = unit?.stages.find((item) => item.stage === "functional-design");
    expect(projection.projectionIssues).toEqual([]);
    expect(projection.blocked).toBe(false);
    expect(stageView?.state).toBe("running");
    expect(stageView?.currentAttemptId).toBe(ids.nextStageAttempt);
    expect(stageView?.attempts.find((attempt) => attempt.attemptId === ids.stageAttempt)?.state).toBe("ended_by_revision");
    expect(stageView?.attempts.find((attempt) => attempt.attemptId === ids.nextStageAttempt)?.state).toBe("running");
  });

  it("rejects completion evidence bound to a different repository checkpoint", () => {
    const unitCreated = created("event-unit-created", ids.unit, "journal-checkpoint-mismatch");
    const started = stageStart("event-stage-start", ids.stageAttempt, ids.unit, "journal-checkpoint-mismatch", [unitCreated.id], "functional-design");
    const evidence = event("event-evidence", "construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "functional-design",
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
      stage: "functional-design",
      stage_attempt_id: ids.stageAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "different-checkpoint" }],
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
    expect(projection.units[0]?.stages.find((stage) => stage.stage === "functional-design")?.state).toBe("unknown");
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
    }, "journal-integration", [admission.id]);
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
      check: "Validate generated output",
      executor: "agent:validator",
      result: { status: "passed", summary: "The task output passed validation" },
      output_refs: ["opaque: task output"],
      conditions: [],
    }, "journal-integration", [validationStarted.id]);
    const validationCompleted = event("event-validation-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-validation",
      activity_attempt_id: ids.validationAttempt,
      evidence_ids: [ids.sourceEvidence],
      checkpoints: [{ repository_id: "repo-main", commit: "generated-commit" }],
    }, "journal-integration", [validationStarted.id, sourceEvidence.id]);
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
    }, "journal-integration", [admission.id, validationCompleted.id]);
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
      check: "Run integration checks",
      executor: "agent:integrator",
      result: { status: "passed", summary: "Candidate checks passed" },
      output_refs: ["opaque: integration output"],
      conditions: [],
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
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.evidence] }],
      authority_event_ids: [],
    }, "journal-integration", [prepared.id, integrationEvidence.id]);
    const activityCompleted = event("event-integration-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.activityAttempt,
      evidence_ids: [ids.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
    }, "journal-integration", [integrationStarted.id, accepted.id, integrationEvidence.id]);
    const taskCompleted = event("event-task-completed", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["Task conditions hold"],
    }, "journal-integration", [accepted.id, activityCompleted.id]);
    const records = [
      unitCreated,
      baseline,
      started,
      admission,
      validationStarted,
      sourceEvidence,
      validationCompleted,
      integrationStarted,
      prepared,
      integrationEvidence,
      accepted,
      activityCompleted,
      taskCompleted,
    ];
    const sources = [source("origin://integration", "journal-integration", records)];
    const history = collectHistory(missionId, sources);
    const projection = projectConstruction(history);
    const task = projection.units[0]?.tasks[0];
    expect(history.issues).toEqual([]);
    expect(projection.projectionIssues).toEqual([]);
    expect(task?.state).toBe("complete");
    expect(task?.completion?.event.data.integration_event_id).toBe(accepted.id);
    expect(task?.activities.find((activity) => activity.activity === "code-integration")?.accepted).toHaveLength(1);
    expect(projection.units[0]?.progress).toEqual({ completedStages: 0, totalStages: 6, completedTasks: 1, knownTasks: 1, reliable: true });
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
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
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
    const dependentValidationStarted = event("event-dependent-validation-started", "construction.activity-attempt-started", {
      ...validationStarted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
    }, "journal-integration", [dependentAdmissionBeforeRevision.id]);
    const dependentValidationEvidence = event("event-dependent-validation-evidence", "construction.evidence-recorded", {
      ...sourceEvidence.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
      evidence_id: ids.dependentSourceEvidence,
    }, "journal-integration", [dependentValidationStarted.id]);
    const dependentValidationCompleted = event("event-dependent-validation-completed", "construction.activity-attempt-completed", {
      ...validationCompleted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentValidationAttempt,
      evidence_ids: [ids.dependentSourceEvidence],
    }, "journal-integration", [dependentValidationStarted.id, dependentValidationEvidence.id]);
    const dependentIntegrationStarted = event("event-dependent-integration-started", "construction.activity-attempt-started", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.dependentTask,
      activity: "code-integration",
      activity_attempt_id: ids.dependentIntegrationAttempt,
      inputs: [{ reference: "opaque: stale predecessor input", purpose: "Integration input" }],
      checkpoints: [],
    }, "journal-integration", [dependentAdmissionBeforeRevision.id]);
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
    const dependentIntegrationAccepted = event("event-dependent-integration-accepted", "construction.integration-accepted", {
      ...accepted.data,
      task_id: ids.dependentTask,
      activity_attempt_id: ids.dependentIntegrationAttempt,
      prepared_event_id: dependentIntegrationPrepared.id,
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.dependentIntegrationEvidence] }],
    }, "journal-integration", [dependentIntegrationPrepared.id, dependentIntegrationEvidence.id]);
    const dependentCompletionAfterRevision = event("event-dependent-completion-after-revision", "construction.task-completed", {
      ...taskCompleted.data,
      task_id: ids.dependentTask,
      integration_event_id: dependentIntegrationAccepted.id,
    }, "journal-integration", [dependentIntegrationAccepted.id]);
    const dependentIntegrationAfterRevisionProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://dependent-integration-after-revision",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentValidationStarted, dependentValidationEvidence,
        dependentValidationCompleted, revisionInteraction, revision, taskEnded, taskReopened,
        dependentIntegrationStarted, dependentIntegrationPrepared, dependentIntegrationEvidence,
        dependentIntegrationAccepted, dependentCompletionAfterRevision],
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
      [...records, dependentAdmissionBeforeRevision, dependentValidationStarted, dependentValidationEvidence,
        dependentValidationCompleted, revisionInteraction, revision, taskEnded, taskReopened,
        dependentIntegrationStarted, dependentIntegrationPrepared, dependentIntegrationEvidence,
        dependentIntegrationAccepted, dependentCompletionAfterRevision, thirdTaskAdmissionAfterInvalidation],
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
      checkpoints: [],
    }, "journal-integration", [admission.id, resumeTaskReopened.id]);
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
      checkpoints: [],
    }, "journal-integration", [resumeIntegrationWaiting.id]);
    const resumePrepared = event("event-resume-integration-prepared", "construction.integration-prepared", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      captured_inputs: [],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
      task_output_refs: ["opaque: task output"],
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
      check: "Run checks after resuming Integration",
      executor: "agent:integrator",
      result: { status: "passed", summary: "The resumed candidate passed" },
      output_refs: ["opaque: resumed integration output"],
      conditions: [],
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
      repository_results: [{ repository_id: "repo-main", evidence_ids: [ids.resumeEvidence] }],
      authority_event_ids: [],
    }, "journal-integration", [resumePrepared.id, resumeEvidence.id]);
    const resumeCompleted = event("event-resume-integration-completed", "construction.activity-attempt-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.resumeActivityAttempt,
      evidence_ids: [ids.resumeEvidence],
      checkpoints: [{ repository_id: "repo-main", commit: "resumed-candidate" }],
    }, "journal-integration", [resumeIntegration.id, resumeAccepted.id, resumeEvidence.id]);
    const resumeTaskCompleted = event("event-resume-task-completed", "construction.task-completed", {
      mission_id: missionId,
      unit_id: ids.unit,
      stage: "implementation",
      stage_attempt_id: ids.stageAttempt,
      task_id: ids.task,
      integration_event_id: resumeAccepted.id,
      conditions: ["The resumed Integration attempt is current"],
    }, "journal-integration", [resumeAccepted.id, resumeCompleted.id]);
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
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
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
        original_evidence_ids: [ids.evidence],
        applicable: true,
        reason: "The predecessor Integration output remains applicable under the new parent",
        checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
      }],
    }, "journal-integration", [nextImplementationStarted.id, accepted.id, integrationEvidence.id]);
    const crossParentAdmissionWithRetention = crossParentAdmission("event-cross-parent-admission-with-retention",
      [nextImplementationStarted.id, baseline.id, accepted.id, retainedIntegrationAssessment.id]);
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
          original_evidence_ids: [ids.dependentIntegrationEvidence],
          applicable: true,
          reason: "The dependent Integration output remains applicable",
          checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        }],
      }, "journal-integration", [nextImplementationStarted.id, dependentIntegrationAccepted.id,
        dependentIntegrationEvidence.id]);
    const thirdTaskAdmissionAfterRestart = (id: string, retainedAssessment: string) => event(id,
      "construction.task-admitted", {
        mission_id: missionId,
        unit_id: ids.unit,
        stage: "implementation",
        stage_attempt_id: ids.nextStageAttempt,
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
      }, "journal-integration", [nextImplementationStarted.id, baseline.id,
        dependentIntegrationAccepted.id, retainedAssessment]);
    const thirdTaskAdmissionWithoutAncestorRetention = thirdTaskAdmissionAfterRestart(
      "event-third-task-admission-without-ancestor-retention", retainedDependentIntegrationOnly.id);
    const transitiveRetentionMissingProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://transitive-retention-missing",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentValidationStarted, dependentValidationEvidence,
        dependentValidationCompleted, dependentIntegrationStarted, dependentIntegrationPrepared,
        dependentIntegrationEvidence, dependentIntegrationAccepted, dependentCompletionAfterRevision,
        revisionInteraction, revision, taskEnded, taskReopened, parentRevisionInteraction, parentRevision,
        parentEnded, parentReopened, nextImplementationStarted, retainedDependentIntegrationOnly,
        thirdTaskAdmissionWithoutAncestorRetention],
    )]));
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
          original_evidence_ids: [ids.evidence],
          applicable: true,
          reason: "The predecessor Integration output remains applicable",
          checkpoints: [{ repository_id: "repo-main", commit: "candidate-commit" }],
        },
        {
          task_id: ids.dependentTask,
          activity: "code-integration",
          original_stage_attempt_id: ids.stageAttempt,
          original_activity_attempt_id: ids.dependentIntegrationAttempt,
          original_evidence_ids: [ids.dependentIntegrationEvidence],
          applicable: true,
          reason: "The dependent Integration output remains applicable with its retained input",
          checkpoints: [{ repository_id: "repo-main", commit: "dependent-candidate" }],
        },
      ],
    }, "journal-integration", [nextImplementationStarted.id, accepted.id, integrationEvidence.id,
      dependentIntegrationAccepted.id, dependentIntegrationEvidence.id]);
    const thirdTaskAdmissionWithAncestorRetention = thirdTaskAdmissionAfterRestart(
      "event-third-task-admission-with-ancestor-retention", retainedDependentAndAncestor.id);
    const transitiveRetentionCompleteProjection = projectConstruction(collectHistory(missionId, [source(
      "origin://transitive-retention-complete",
      "journal-integration",
      [...records, dependentAdmissionBeforeRevision, dependentValidationStarted, dependentValidationEvidence,
        dependentValidationCompleted, dependentIntegrationStarted, dependentIntegrationPrepared,
        dependentIntegrationEvidence, dependentIntegrationAccepted, dependentCompletionAfterRevision,
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
    expect(lateParentIntegration?.currentAttemptId).toBe(ids.resumeActivityAttempt);
    expect(lateParentIntegration?.attempts.find((attempt) => attempt.attemptId === ids.resumeActivityAttempt)?.state).toBe("running");
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
        lateActivityBeforeReplacement],
    )]));
    expect(lateActivityBeforeReplacementProjection.projectionIssues.map((issue) => issue.code))
      .toContain("invalid-revision-transition");
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
});