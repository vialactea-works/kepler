import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_EVENT_REQUIRED_FIELDS,
  CONSTRUCTION_EVENT_TYPES,
  CONSTRUCTION_PHASE,
  CONSTRUCTION_STAGES,
  CONSTRUCTION_STAGE_ACTIVITY_STATES,
  CONSTRUCTION_TASK_STATES,
  validateConstructionEvent,
} from "../../packages/cli/src/construction/events.js";

const identities = {
  mission: "10000000-0000-4000-8000-000000000001",
  stageAttempt: "20000000-0000-4000-8000-000000000002",
  task: "30000000-0000-4000-8000-000000000003",
  activityAttempt: "40000000-0000-4000-8000-000000000004",
  revision: "50000000-0000-4000-8000-000000000005",
  evidence: "60000000-0000-4000-8000-000000000006",
  graph: "70000000-0000-4000-8000-000000000007",
  artifact: "80000000-0000-4000-8000-000000000008",
};

const base = { mission_id: identities.mission, unit_id: "2026-10-18-example" };
const workspace = {
  repository_id: "repository-main",
  context: { kind: "existing" },
  branch: { kind: "current" },
  integration_target: "refs/heads/main",
  starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
};
const stage = { ...base, stage: "implementation", stage_attempt_id: identities.stageAttempt };
const task = { ...stage, task_id: identities.task };
const activity = { ...task, activity: "code-generation", activity_attempt_id: identities.activityAttempt };
const graphReference = { graph_id: identities.graph, content_version: "graph-revision-1" };

const payload = (type: (typeof CONSTRUCTION_EVENT_TYPES)[number]): Record<string, unknown> => {
  if (type === "construction.mission-created") {
    return {
      mission_id: identities.mission,
      title: "Prepare selected repositories",
      request: "Implement the requested workflow",
      workflow: "standard",
      record_home: { repository_id: "record-home" },
      contexts: [{ reference: "opaque: selected context", purpose: "Request context" }],
      repositories: [workspace],
    };
  }
  if (type === "construction.mission-workspaces-prepared") {
    return {
      mission_id: identities.mission,
      repositories: [{
        repository_id: workspace.repository_id,
        context: workspace.context,
        branch: "main",
        integration_target: workspace.integration_target,
        starting_checkpoint: workspace.starting_checkpoint,
      }],
    };
  }
  if (type === "construction.unit-created") {
    return { ...base, directory: "construction/units-of-work/2026-10-18-example", workflow: "standard", initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" } };
  }
  if (type === "construction.unit-baseline-selected") return { ...base, review_baseline: [], integration_targets: [] };
  if (type === "construction.stage-attempt-started" || type === "construction.stage-resumed") {
    return { ...stage, inputs: [], checkpoints: [], authority_event_ids: [] };
  }
  if (["construction.stage-waiting", "construction.stage-pause-requested", "construction.stage-paused"].includes(type)) return { ...stage, reason: "Awaiting a prerequisite" };
  if (type === "construction.stage-attempt-completed") return { ...stage, evidence_ids: [identities.evidence], checkpoints: [] };
  if (type === "construction.stage-attempt-ended-by-revision") return { ...stage, revision_id: identities.revision, reason: "Authorized revision" };
  if (type === "construction.stage-reopened") return { ...base, stage: "implementation", revision_id: identities.revision, reason: "Authorized revision" };
  if (type === "construction.task-admitted") {
    return {
      ...task,
      graph_ref: graphReference,
      task_definition_ref: { graph_id: identities.graph, task_id: identities.task, content_version: "task-revision-1" },
      admission_baseline: [],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    };
  }
  if (type === "construction.task-scope-ended-by-revision" || type === "construction.task-scope-reopened") {
    return { ...task, revision_id: identities.revision, reason: "Authorized revision", affected_activities: [] };
  }
  if (type === "construction.task-completed") return { ...task, integration_event_id: "integration-event", conditions: ["Task conditions hold"] };
  if (type === "construction.activity-attempt-started" || type === "construction.activity-resumed") return { ...activity, inputs: [], checkpoints: [] };
  if (type === "construction.activity-waiting" || type === "construction.activity-pause-requested" || type === "construction.activity-paused") return { ...activity, reason: "Awaiting a prerequisite" };
  if (type === "construction.activity-attempt-completed") return { ...activity, evidence_ids: [identities.evidence], checkpoints: [] };
  if (type === "construction.activity-attempt-ended-by-revision") return { ...activity, revision_id: identities.revision, reason: "Authorized revision" };
  if (type === "construction.activity-reopened") return { ...task, activity: "code-generation", revision_id: identities.revision, reason: "Authorized revision" };
  if (type === "construction.evidence-recorded") {
    return {
      ...base,
      stage: "implementation",
      stage_attempt_id: identities.stageAttempt,
      evidence_id: identities.evidence,
      artifact_bindings: [{ artifact_id: identities.artifact, content_version: "artifact-revision-1" }],
      checkpoints: [],
      inputs: [{ reference: "opaque: source material ", purpose: "Reviewed input" }],
      check: "Run the requested verification",
      executor: "test executor",
      result: { status: "passed", summary: "All assertions passed" },
      output_refs: ["output: retained-result"],
      conditions: ["Controlled environment"],
    };
  }
  if (type === "construction.approval-recorded") {
    return { ...base, stage: "implementation", stage_attempt_id: identities.stageAttempt, artifact_bindings: [], checkpoints: [], requester: "requester", inputs: [{ reference: "decision-ref", purpose: "Reviewed material" }], decision_reference: "opaque decision reference" };
  }
  if (type === "construction.interaction-recorded") return { ...base, participants: ["requester"], content: "A concise interaction", references: [] };
  if (type === "construction.integration-prepared") {
    return { ...activity, activity: "code-integration", captured_inputs: [], candidate_checkpoints: [], task_output_refs: ["output:task"], source_evidence_ids: [], inputs: [] };
  }
  if (type === "construction.integration-accepted") {
    return { ...activity, activity: "code-integration", prepared_event_id: "prepared-event", candidate_checkpoints: [], repository_results: [], authority_event_ids: [] };
  }
  if (type === "construction.revision-authorized") return { ...base, revision_id: identities.revision, orchestrator_decision: "Reopen implementation", reason: "Finding affects current work", stage: "implementation" };
  if (type === "construction.retained-scope-assessed") return { ...stage, assessments: [] };
  if (type === "construction.implementation-completion-assessed") {
    return { ...stage, final_checkpoints: [], graph_ref: graphReference, required_check_evidence_ids: [], integration_event_ids: [], retained_assessment_event_ids: [], handoff_assessment: { status: "ready", reason: "Required handoff conditions hold" } };
  }
  throw new Error(`No payload fixture for ${type}`);
};

const envelope = (type: string, data: Record<string, unknown>) => ({
  id: `event-${type}`,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: 1,
  journal_id: "construction-journal",
  recorded_at: "2026-10-18T14:30:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data,
});

describe("Construction event contracts", () => {
  it("exposes the approved state vocabulary and event catalog", () => {
    expect(CONSTRUCTION_STAGES).toEqual([
      "functional-design",
      "quality-requirements",
      "implementation-planning",
      "implementation",
      "unit-of-work-review",
      "deliver",
    ]);
    expect(CONSTRUCTION_STAGE_ACTIVITY_STATES).toEqual([
      "not_started",
      "running",
      "pausing",
      "paused",
      "waiting",
      "completed",
      "reopened",
      "ended_by_revision",
    ]);
    expect(CONSTRUCTION_TASK_STATES).toEqual([
      "blocked",
      "ready",
      "admitted",
      "generating",
      "validating",
      "integrating",
      "waiting",
      "complete",
      "reopened",
    ]);
    expect(Object.keys(CONSTRUCTION_EVENT_REQUIRED_FIELDS).sort()).toEqual([...CONSTRUCTION_EVENT_TYPES].sort());
  });

  it("validates every catalog event with its required typed payload", () => {
    for (const type of CONSTRUCTION_EVENT_TYPES) {
      const result = validateConstructionEvent(envelope(type, payload(type)));
      expect(result.status, type).toBe("valid");
    }
  });

  it("rejects each catalog event when any declared required payload field is absent", () => {
    for (const type of CONSTRUCTION_EVENT_TYPES) {
      const data = payload(type);
      for (const field of CONSTRUCTION_EVENT_REQUIRED_FIELDS[type]) {
        const incomplete = { ...data };
        delete incomplete[field];
        expect(validateConstructionEvent(envelope(type, incomplete)).status, `${type} missing ${field}`).toBe("invalid");
      }
    }
  });

  it("preserves unknown phase records and unsupported versions without treating them as Construction facts", () => {
    const source = envelope("construction.future-event", { ...base });
    const unknownType = validateConstructionEvent(source);
    expect(unknownType.status).toBe("unsupported");
    if (unknownType.status === "unsupported") expect(unknownType.event).toEqual(source);
    expect(validateConstructionEvent({ ...source, type: "future-phase.event", phase: "future-phase" }).status).toBe("unsupported");
    expect(validateConstructionEvent({ ...envelope("construction.unit-created", payload("construction.unit-created")), event_version: 2 }).status).toBe("unsupported");
    expect(validateConstructionEvent({ ...source, envelope_version: 2 }).status).toBe("unsupported");
  });

  it("accepts mission-scoped facts before a unit exists and validates their repository bindings", () => {
    const created = payload("construction.mission-created");
    expect("unit_id" in created).toBe(false);
    expect(validateConstructionEvent(envelope("construction.mission-created", created)).status).toBe("valid");

    const duplicateRepository = {
      ...created,
      repositories: [workspace, { ...workspace, branch: { kind: "default" } }],
    };
    expect(validateConstructionEvent(envelope("construction.mission-created", duplicateRepository)).status).toBe("invalid");

    const invalidCheckpoint = {
      ...created,
      repositories: [{ ...workspace, starting_checkpoint: { kind: "commit", commit: "" } }],
    };
    expect(validateConstructionEvent(envelope("construction.mission-created", invalidCheckpoint)).status).toBe("invalid");

    const prepared = payload("construction.mission-workspaces-prepared");
    expect("unit_id" in prepared).toBe(false);
    expect(validateConstructionEvent(envelope("construction.mission-workspaces-prepared", prepared)).status).toBe("valid");
  });

  it("keeps mission, original Review, task-admission, and lock-captured Integration checkpoints in separate event roles", () => {
    const mission = payload("construction.mission-created");
    expect(mission.repositories).toEqual([workspace]);
    expect(mission).not.toHaveProperty("review_baseline");
    expect(mission).not.toHaveProperty("admission_baseline");

    const review = payload("construction.unit-baseline-selected");
    expect(review).toHaveProperty("review_baseline");
    expect(review).not.toHaveProperty("starting_checkpoint");
    expect(review).not.toHaveProperty("admission_baseline");

    const admission = payload("construction.task-admitted");
    expect(admission).toHaveProperty("admission_baseline");
    expect(admission).not.toHaveProperty("review_baseline");
    expect(admission).not.toHaveProperty("captured_inputs");

    const integration = payload("construction.integration-prepared");
    expect(integration).toHaveProperty("captured_inputs");
    expect(integration).toHaveProperty("candidate_checkpoints");
    expect(integration).not.toHaveProperty("review_baseline");
    expect(integration).not.toHaveProperty("admission_baseline");
    for (const [type, data] of [
      ["construction.mission-created", mission],
      ["construction.unit-baseline-selected", review],
      ["construction.task-admitted", admission],
      ["construction.integration-prepared", integration],
    ] as const) {
      expect(validateConstructionEvent(envelope(type, data)).status, type).toBe("valid");
    }
  });

  it("requires evidence and approval to keep their applicable attempt scope", () => {
    const evidence = payload("construction.evidence-recorded");
    delete evidence.stage_attempt_id;
    expect(validateConstructionEvent(envelope("construction.evidence-recorded", evidence)).status).toBe("invalid");
    const incompleteActivityEvidence = payload("construction.evidence-recorded");
    incompleteActivityEvidence.task_id = identities.task;
    incompleteActivityEvidence.activity = "code-generation";
    incompleteActivityEvidence.activity_attempt_id = identities.activityAttempt;
    delete incompleteActivityEvidence.task_id;
    expect(validateConstructionEvent(envelope("construction.evidence-recorded", incompleteActivityEvidence)).status).toBe("invalid");
    const approval = payload("construction.approval-recorded");
    delete approval.stage;
    expect(validateConstructionEvent(envelope("construction.approval-recorded", approval)).status).toBe("invalid");
  });

  it("rejects invalid domain identities and keeps material references opaque", () => {
    const evidence = payload("construction.evidence-recorded");
    evidence.evidence_id = "not-a-uuid";
    expect(validateConstructionEvent(envelope("construction.evidence-recorded", evidence)).status).toBe("invalid");
    const validEvidence = payload("construction.evidence-recorded");
    const result = validateConstructionEvent(envelope("construction.evidence-recorded", validEvidence));
    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("Expected valid evidence event");
    expect(result.event.data.inputs).toEqual([{ reference: "opaque: source material ", purpose: "Reviewed input" }]);
  });
});
