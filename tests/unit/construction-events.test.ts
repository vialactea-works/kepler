import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_DELIVER_COMPLETION_EVENT_VERSION,
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
  if (type === "construction.stage-attempt-completed") return {
    ...stage,
    evidence_ids: [identities.evidence],
    checkpoints: [{ repository_id: workspace.repository_id, commit: "a".repeat(40) }],
    implementation_assessment: { assessment_event_id: identities.revision },
  };
  if (type === "construction.stage-attempt-ended-by-revision") return { ...stage, revision_id: identities.revision, reason: "Authorized revision" };
  if (type === "construction.stage-reopened") return { ...stage, revision_id: identities.revision, reason: "Authorized revision" };
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
  if (type === "construction.retained-scope-assessed") return {
    ...stage,
    assessments: [{
      task_id: identities.task,
      activity: "code-generation",
      original_stage_attempt_id: identities.stageAttempt,
      original_activity_attempt_id: identities.activityAttempt,
      original_evidence_ids: [identities.evidence],
      applicable: true,
      reason: "The completed Activity remains applicable to the accepted task material",
      checkpoints: [{ repository_id: workspace.repository_id, commit: "a".repeat(40) }],
    }],
  };
  if (type === "construction.implementation-completion-assessed") {
    return {
      ...stage,
      final_checkpoints: [{ repository_id: workspace.repository_id, commit: "a".repeat(40) }],
      artifact_paths: ["plan.md"],
      task_graph_path: "tasks-dag.json",
      graph_ref: graphReference,
      task_ids: [identities.task],
      reviewed_material_bindings: [],
      self_review_evidence_id: identities.evidence,
      handoff_evidence_id: identities.evidence,
      unit_check_evidence_ids: [identities.evidence],
      required_check_evidence_ids: [identities.evidence],
      integration_event_ids: ["91000000-0000-4000-8000-000000000001"],
      retained_assessment_event_ids: [],
      additional_review: { requested: false },
      blocking_findings: [],
      handoff_assessment: { status: "ready", reason: "Required handoff conditions hold", recipient: "unit-of-work-review", artifacts: ["plan.md", "tasks-dag.json"] },
    };
  }
  throw new Error(`No payload fixture for ${type}`);
};

const envelope = (type: string, data: Record<string, unknown>, eventVersion = type === "construction.stage-attempt-completed" ? 2 : 1) => ({
  id: `event-${type}`,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: eventVersion,
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

  it("validates typed whole-unit Review and Deliver completion records", () => {
    const checkpoint = { repository_id: workspace.repository_id, commit: "b".repeat(40) };
    const bindings = [{ artifact_id: identities.artifact, content_version: "sha256:reviewed-material" }];
    const review = {
      implementation_completion_event_id: identities.revision,
      reviewed_material_bindings: bindings,
      final_checkpoints: [checkpoint],
      reviewer: "agent:reviewer",
      implementation_authors: ["agent:builder"],
      implementation_evidence_assessment_id: identities.evidence,
      review_evidence_id: identities.activityAttempt,
      self_review_evidence_id: identities.graph,
      findings: { blocking: [], limitations: [] },
      additional_review: { requested: false },
      acceptance_required: false,
      handoff: { status: "ready", recipient: "deliver", summary: "Reviewed result and limitations are ready for delivery" },
    };
    const reviewEvent = envelope("construction.stage-attempt-completed", {
      ...stage,
      stage: "unit-of-work-review",
      evidence_ids: [identities.evidence, identities.activityAttempt, identities.graph],
      checkpoints: [checkpoint],
      unit_of_work_review_assessment: review,
    });
    expect(validateConstructionEvent(reviewEvent).status).toBe("valid");

    const deliver = {
      review_completion_event_id: identities.revision,
      outcome: "publication",
      requested_outcome: "Publish the reviewed artifact",
      destination: "registry:stable",
      recipient: "release operators",
      artifact_bindings: bindings,
      reviewed_checkpoints: [checkpoint],
      preparation_evidence_id: identities.evidence,
      self_review_evidence_id: identities.activityAttempt,
      operation_results: [{
        operation: "publish reviewed artifact",
        status: "succeeded",
        evidence_id: identities.revision,
        source_checkpoints: [checkpoint],
        authority: { kind: "project-authority", reference: "release-policy:stable" },
      }],
      verification_evidence_ids: [identities.graph],
      handoff_evidence_id: identities.artifact,
      additional_review: { requested: false },
      approval_required: false,
      handoff: { status: "ready", summary: "Published result and recovery details were handed to the release operators" },
    };
    const deliverEvent = envelope("construction.stage-attempt-completed", {
      ...stage,
      stage: "deliver",
      evidence_ids: [identities.evidence, identities.activityAttempt, identities.revision, identities.graph, identities.artifact],
      checkpoints: [checkpoint],
      deliver_assessment: deliver,
    });
    expect(validateConstructionEvent(deliverEvent).status).toBe("valid");
    expect(validateConstructionEvent({
      ...deliverEvent,
      data: { ...deliverEvent.data, deliver_assessment: { ...deliver, approval_required: true } },
    }).status).toBe("invalid");
    const currentDeliver = {
      ...deliver,
      outcome_request_event_id: identities.graph,
      operation_results: [{
        ...deliver.operation_results[0],
        authority: { kind: "project-authority", reference: "release-policy:stable" },
      }],
    };
    const currentDeliverEvent = envelope("construction.stage-attempt-completed", {
      ...stage,
      stage: "deliver",
      evidence_ids: [identities.evidence, identities.activityAttempt, identities.revision, identities.graph, identities.artifact],
      checkpoints: [checkpoint],
      deliver_assessment: currentDeliver,
    }, CONSTRUCTION_DELIVER_COMPLETION_EVENT_VERSION);
    expect(validateConstructionEvent(currentDeliverEvent).status).toBe("valid");
    expect(validateConstructionEvent({
      ...currentDeliverEvent,
      data: { ...currentDeliverEvent.data, deliver_assessment: { ...currentDeliver, outcome_request_event_id: undefined } },
    }).status).toBe("invalid");
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

  it("requires stage reopens, evidence, and approval to name their applicable attempt scope", () => {
    const reopened = payload("construction.stage-reopened");
    delete reopened.stage_attempt_id;
    expect(validateConstructionEvent(envelope("construction.stage-reopened", reopened)).status).toBe("invalid");
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

  it("validates optional interaction scope bindings", () => {
    const stageScoped = payload("construction.interaction-recorded");
    stageScoped.stage = "functional-design";
    expect(validateConstructionEvent(envelope("construction.interaction-recorded", stageScoped)).status).toBe("valid");

    const activityScoped = payload("construction.interaction-recorded");
    activityScoped.stage = "implementation";
    activityScoped.stage_attempt_id = identities.stageAttempt;
    activityScoped.task_id = identities.task;
    activityScoped.activity = "code-generation";
    activityScoped.activity_attempt_id = identities.activityAttempt;
    expect(validateConstructionEvent(envelope("construction.interaction-recorded", activityScoped)).status).toBe("valid");

    const activityContext = { ...activityScoped };
    delete activityContext.activity_attempt_id;
    expect(validateConstructionEvent(envelope("construction.interaction-recorded", activityContext)).status).toBe("valid");

    const incompleteActivity = { ...activityContext };
    delete incompleteActivity.stage_attempt_id;
    expect(validateConstructionEvent(envelope("construction.interaction-recorded", incompleteActivity)).status).toBe("invalid");
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

  it("requires retained-scope events to contain distinct, fully identified applicable scopes", () => {
    const valid = payload("construction.retained-scope-assessed");
    const assessments = valid.assessments as Record<string, unknown>[];
    expect(validateConstructionEvent(envelope("construction.retained-scope-assessed", valid)).status).toBe("valid");

    const empty = { ...valid, assessments: [] };
    expect(validateConstructionEvent(envelope("construction.retained-scope-assessed", empty)).status).toBe("invalid");

    const incompleteAssessment = { ...assessments[0] };
    delete incompleteAssessment.original_activity_attempt_id;
    const incomplete = { ...valid, assessments: [incompleteAssessment] };
    expect(validateConstructionEvent(envelope("construction.retained-scope-assessed", incomplete)).status).toBe("invalid");

    const duplicate = {
      ...valid,
      assessments: [...assessments, { ...assessments[0] }],
    };
    expect(validateConstructionEvent(envelope("construction.retained-scope-assessed", duplicate)).status).toBe("invalid");
  });

  it("rejects generic Quality Requirements completion without its stage-specific assessment", () => {
    const data = {
      ...base,
      stage: "quality-requirements",
      stage_attempt_id: identities.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", data)).status).toBe("invalid");
  });

  it("rejects generic Implementation Planning completion without its typed assessment", () => {
    const data = {
      ...base,
      stage: "implementation-planning",
      stage_attempt_id: identities.stageAttempt,
      evidence_ids: [],
      checkpoints: [],
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", data)).status).toBe("invalid");
  });

  it("keeps Quality Requirements event version 1 readable under its historical payload schema", () => {
    const data = {
      ...base,
      stage: "quality-requirements",
      stage_attempt_id: identities.stageAttempt,
      evidence_ids: [identities.evidence],
      checkpoints: [{ repository_id: "repo-main", commit: "a".repeat(40) }],
      quality_requirements_assessment: {
        approval_event_id: identities.revision,
        artifact_bindings: [{ artifact_id: identities.artifact, content_version: "sha256:quality" }],
        assessments: {},
      },
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", data, 1)).status).toBe("valid");
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", data, 2)).status).toBe("invalid");
  });

  it("requires a typed Functional Design assessment and matching named evidence", () => {
    const assessments = {
      self_review: {
        status: "passed",
        evidence_id: "60000000-0000-4000-8000-000000000006",
        reviewer: "Functional Design owner",
        summary: "All required content is present and coherent.",
        checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"],
        findings: [],
      },
      decision_resolution: {
        status: "resolved",
        evidence_id: "61000000-0000-4000-8000-000000000006",
        summary: "Material choices and assumptions are resolved.",
        resolved_material_choices: [{ choice: "Preserve existing behavior", owner: "Requester", resolution: "Keep the current contract." }],
        unresolved_material_choices: [],
        unsupported_assumptions: [],
        quality_concerns: [{ concern: "Define applicable observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }],
        technical_questions: [{ question: "Select the implementation strategy.", responsible_stage: "implementation-planning", owner: "Implementation Planning owner" }],
      },
      handoff: {
        status: "ready",
        evidence_id: "62000000-0000-4000-8000-000000000006",
        summary: "The documents and concerns are ready for Quality Requirements.",
        recipient: "quality-requirements",
        unit_directory: ".kepler/missions/10000000-0000-4000-8000-000000000001/construction/units-of-work/2026-10-18-example",
        artifacts: ["unit-of-work.md", "design.md"],
        project_references: [],
        known_constraints: ["Keep the current public contract."],
        quality_concerns: [{ concern: "Define applicable observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }],
        technical_questions: [{ question: "Select the implementation strategy.", responsible_stage: "implementation-planning", owner: "Implementation Planning owner" }],
      },
    };
    const assessmentRecord = {
      approval_event_id: "63000000-0000-4000-8000-000000000006",
      artifact_bindings: [
        { artifact_id: "80000000-0000-4000-8000-000000000008", content_version: "sha256:unit" },
        { artifact_id: "90000000-0000-4000-8000-000000000009", content_version: "sha256:design" },
      ],
      artifact_paths: ["unit-of-work.md", "design.md"],
      assessments,
    };
    const data = {
      ...base,
      stage: "functional-design",
      stage_attempt_id: identities.stageAttempt,
      evidence_ids: [assessments.self_review.evidence_id, assessments.decision_resolution.evidence_id, assessments.handoff.evidence_id],
      checkpoints: [{ repository_id: "repo-main", commit: "output-checkpoint" }],
      functional_design_assessment: assessmentRecord,
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", data)).status).toBe("valid");

    const missing = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "functional_design_assessment"));
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", missing)).status).toBe("invalid");
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", { ...data, checkpoints: [] })).status).toBe("invalid");

    const incompleteChecks = {
      ...data,
      functional_design_assessment: {
        ...assessmentRecord,
        assessments: { ...assessments, self_review: { ...assessments.self_review, checks: ["required-content"] } },
      },
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", incompleteChecks)).status).toBe("invalid");

    const repeatedAssessmentEvidence = {
      ...data,
      functional_design_assessment: {
        ...assessmentRecord,
        assessments: { ...assessments, decision_resolution: { ...assessments.decision_resolution, evidence_id: assessments.self_review.evidence_id } },
      },
    };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", repeatedAssessmentEvidence)).status).toBe("invalid");

    const mismatchedEvidence = { ...data, evidence_ids: [assessments.self_review.evidence_id] };
    expect(validateConstructionEvent(envelope("construction.stage-attempt-completed", mismatchedEvidence)).status).toBe("invalid");
  });
});
