import { describe, expect, it } from "vitest";
import { collectHistory as collectHistoryFromSources, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const ids = {
  unit: "2026-10-18-example",
  otherUnit: "2026-10-19-example",
  stageAttempt: "20000000-0000-4000-8000-000000000002",
  nextStageAttempt: "20000000-0000-4000-8000-000000000003",
  task: "30000000-0000-4000-8000-000000000003",
  activityAttempt: "40000000-0000-4000-8000-000000000004",
  validationAttempt: "40000000-0000-4000-8000-000000000005",
  revision: "50000000-0000-4000-8000-000000000005",
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
    const sources = [source("origin://integration", "journal-integration", [
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
    ])];
    const history = collectHistory(missionId, sources);
    const projection = projectConstruction(history);
    const task = projection.units[0]?.tasks[0];
    expect(history.issues).toEqual([]);
    expect(projection.projectionIssues).toEqual([]);
    expect(task?.state).toBe("complete");
    expect(task?.completion?.event.data.integration_event_id).toBe(accepted.id);
    expect(task?.activities.find((activity) => activity.activity === "code-integration")?.accepted).toHaveLength(1);
    expect(projection.units[0]?.progress).toEqual({ completedStages: 0, totalStages: 6, completedTasks: 1, knownTasks: 1, reliable: true });
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