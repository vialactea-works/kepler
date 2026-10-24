import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditContextResolver, AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import {
  ConstructionPauseResume,
  createNodeConstructionPauseResumeRuntime,
  validateConstructionPauseRequest,
  validateConstructionResumeRequest,
  type ConstructionPauseResumeRuntime,
} from "../../packages/cli/src/construction/pause-resume.js";
import type { ConstructionHistoryFact } from "../../packages/cli/src/construction/projection.js";
import type { ConstructionQueries, TaskExecutionContext } from "../../packages/cli/src/construction/scoped-queries.js";
import { admittedTaskContract } from "../../packages/cli/src/construction/task-admission.js";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const unitId = "20000000-0000-4000-8000-000000000001";
const stageAttemptId = "30000000-0000-4000-8000-000000000001";
const taskId = "40000000-0000-4000-8000-000000000001";
const activityAttemptId = "50000000-0000-4000-8000-000000000001";
const staleAuthorityId = "60000000-0000-4000-8000-000000000001";
const currentGraphId = "70000000-0000-4000-8000-000000000001";
const oldGraphId = "70000000-0000-4000-8000-000000000002";
const planningAttemptId = "30000000-0000-4000-8000-000000000002";
const input = { reference: "input:task", purpose: "Current task input" };
const temporaryDirectories: string[] = [];

const eventFact = (id: string, type: string, data: Readonly<Record<string, unknown>>, caused_by: readonly string[] = []): ConstructionHistoryFact => ({
  event: {
    id,
    phase: "construction",
    type,
    envelope_version: 1,
    event_version: 3,
    journal_id: `journal:${id}`,
    recorded_at: "2026-01-01T00:00:00.000Z",
    producer: { name: "test", version: "1" },
    caused_by,
    data,
  },
} as unknown as ConstructionHistoryFact);

const tempRepository = async (): Promise<string> => {
  const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-pause-resume-"));
  temporaryDirectories.push(parent);
  const root = Path.join(parent, "project");
  await Fs.mkdir(root);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  return root;
};

const committedRepository = async (): Promise<string> => {
  const root = await tempRepository();
  await Fs.writeFile(Path.join(root, "README.md"), "pause resume fixture\n");
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "add", "README.md"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"], { cwd: root });
  const commonDirectory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  const gitDirectory = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim();
  const workspaceDirectory = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces");
  await Fs.mkdir(workspaceDirectory, { recursive: true });
  const workspaceId = "c".repeat(64);
  await Fs.writeFile(Path.join(workspaceDirectory, `${workspaceId}.json`), JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: "application",
    repository_id: "application",
    workspace_id: workspaceId,
    workspace_path: root,
    repository_path: root,
    git_directory: gitDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
  }));
  return root;
};

const fakeRuntime = (
  inspection: ConstructionPauseResumeRuntime["inspectIntegrationLock"],
  appended: { value: boolean; event?: unknown },
): ConstructionPauseResumeRuntime => {
  const base = createNodeConstructionPauseResumeRuntime({ name: "test", version: "1" });
  const coordination: MissionWorkspaceRuntime["coordination"] = {
    ...base.workspace.coordination,
    acquire: async () => ({
      kind: "acquired",
      lease: {
        lockPath: "/tmp/unit-control",
        owner: {
          token: "test-token",
          machine_id: "test-machine",
          process_id: 1,
          process_incarnation_id: "test-process",
          mission_id: missionId,
          resource_scope: "test",
        },
        release: async () => ({ kind: "released" }),
      },
    }),
  };
  return {
    ...base,
    workspace: { ...base.workspace, coordination },
    inspectIntegrationLock: inspection,
    journals: {
      create: () => ({
        path: "/tmp/kepler-pause-test.jsonl",
        read: async () => ({ bytes: new Uint8Array(), lines: [], problems: [], endedWithNewline: true }),
        append: async (event) => {
          appended.value = true;
          appended.event = event;
          return { status: "appended", eventId: String((event as { readonly id?: unknown }).id), line: 1 };
        },
      }),
    },
  };
};

const loadedResult = (
  root: string,
  unit: Readonly<Record<string, unknown>>,
  facts: readonly ConstructionHistoryFact[],
): Extract<AuditHistoryReadResult, { readonly kind: "loaded" }> => ({
  kind: "loaded",
  root,
  missionId,
  history: { events: facts.map((fact) => ({ event: fact.event })) },
  projection: {},
  unit,
} as unknown as Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>);

const serviceFor = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  runtime: ConstructionPauseResumeRuntime,
  taskExecutionContext?: TaskExecutionContext,
): ConstructionPauseResume => {
  const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
  const queries = {
    taskExecutionContext: async () => taskExecutionContext ?? { kind: "failed", code: "unused", message: "unused", details: {}, recovery: "unused" },
  } as unknown as ConstructionQueries;
  return new ConstructionPauseResume(contexts, queries, runtime);
};

const pauseStageFixture = (
  root: string,
  stage: "functional-design" | "implementation",
  state: "running" | "pausing" | "paused",
): { readonly loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>; readonly facts: readonly ConstructionHistoryFact[] } => {
  const start = eventFact("81000000-0000-4000-8000-000000000001", "construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage,
    stage_attempt_id: stageAttemptId,
    inputs: [input],
    checkpoints: [{ repository_id: "application", commit: "a".repeat(40) }],
    authority_event_ids: [staleAuthorityId],
  }, [staleAuthorityId]);
  const request = eventFact("81000000-0000-4000-8000-000000000002", "construction.stage-pause-requested", {
    mission_id: missionId, unit_id: unitId, stage, stage_attempt_id: stageAttemptId, reason: "Pause requested",
  }, [start.event.id]);
  const paused = eventFact("81000000-0000-4000-8000-000000000003", "construction.stage-paused", {
    mission_id: missionId, unit_id: unitId, stage, stage_attempt_id: stageAttemptId, reason: "Worker stopped; effects reconciled",
  }, [request.event.id]);
  const facts = [start, ...(state === "running" ? [] : [request]), ...(state === "paused" ? [paused] : [])];
  const unit = {
    unitId,
    workflow: "standard",
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    stages: [{
      stage,
      state,
      currentAttemptId: stageAttemptId,
      attempts: [{ attemptId: stageAttemptId, state, facts }],
    }],
    revisions: [],
    retainedScopeAssessments: [],
    tasks: [],
  };
  return { loaded: loadedResult(root, unit, facts), facts };
};

const stageResumeFixture = async (
  root: string,
): Promise<{ readonly loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>; readonly checkpoint: string }> => {
  const checkpoint = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const mission = eventFact("85000000-0000-4000-8000-000000000001", "construction.mission-created", {
    mission_id: missionId,
    workflow: "standard",
    record_home: { repository_id: "application" },
    repositories: [{ repository_id: "application" }],
  });
  const prepared = eventFact("85000000-0000-4000-8000-000000000002", "construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [{
      repository_id: "application",
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
    }],
  }, [mission.event.id]);
  const created = eventFact("85000000-0000-4000-8000-000000000003", "construction.unit-created", {
    mission_id: missionId,
    unit_id: unitId,
  }, [prepared.event.id]);
  const authorityEventIds = [mission.event.id, prepared.event.id, created.event.id];
  const started = eventFact("85000000-0000-4000-8000-000000000004", "construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: stageAttemptId,
    inputs: [input],
    checkpoints: [{ repository_id: "application", commit: checkpoint }],
    authority_event_ids: authorityEventIds,
  }, authorityEventIds);
  const pauseRequested = eventFact("85000000-0000-4000-8000-000000000005", "construction.stage-pause-requested", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: stageAttemptId,
    reason: "Pause requested",
  }, [started.event.id]);
  const paused = eventFact("85000000-0000-4000-8000-000000000006", "construction.stage-paused", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: stageAttemptId,
    reason: "Worker stopped; effects reconciled",
  }, [pauseRequested.event.id]);
  const attemptFacts = [started, pauseRequested, paused];
  const unit = {
    unitId,
    workflow: "standard",
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    created,
    stages: [{ stage: "functional-design", state: "paused", currentAttemptId: stageAttemptId, attempts: [{ attemptId: stageAttemptId, state: "paused", facts: attemptFacts }] }],
    revisions: [],
    retainedScopeAssessments: [],
    tasks: [],
  };
  return {
    loaded: loadedResult(root, unit, [mission, prepared, created, ...attemptFacts]),
    checkpoint,
  };
};

const planningRecord = () => ({
  graph_ref: { graph_id: oldGraphId, content_version: "graph-v1" },
  artifact_bindings: [{ artifact_id: "82000000-0000-4000-8000-000000000001", content_version: "artifacts-v1" }],
  reviewed_material_bindings: [{ artifact_id: "82000000-0000-4000-8000-000000000001", content_version: "artifacts-v1" }],
  assessments: {
    artifact_validation: { evidence_id: "83000000-0000-4000-8000-000000000001", summary: "Current planning artifacts were validated." },
    task_graph_validation: { evidence_id: "83000000-0000-4000-8000-000000000002", summary: "The accepted task graph was validated." },
    self_review: {
      status: "passed",
      evidence_id: "83000000-0000-4000-8000-000000000003",
      reviewer: "Planning owner",
      summary: "The implementation plan and task breakdown were reviewed.",
      checks: ["decision-rationale", "obligation-coverage", "consistency", "dependency-reasons", "prerequisite-conditions", "verification-feasibility", "input-relevance", "blocking-decisions"],
      decision_rationales: [{ decision: "Keep the task boundary explicit", rationale: "The graph records one independently verifiable task." }],
      task_reviews: [{
        task_id: taskId,
        inputs_relevant: true,
        outputs_explicit: true,
        acceptance_testable: true,
        dependency_reasons_justified: true,
        prerequisites_conditioned: true,
        verification_feasible: true,
        rationale: "The task has explicit inputs, outputs, and verification.",
      }],
      obligation_coverage: [{ reference: "requirements.md#task", disposition: "planned", task_ids: [taskId], rationale: "The task owns the requirement." }],
      unresolved_consequential_decisions: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false },
    approval_requirement: { required: false, rationale: "No approval requirement applies." },
    handoff: {
      status: "ready",
      summary: "The task graph is ready for Implementation.",
      recipient: "implementation",
      unit_directory: ".kepler/units/example",
      artifacts: ["plan.md", "tasks-dag.json"],
      input_bindings: [{ artifact_id: "84000000-0000-4000-8000-000000000001", content_version: "input-v1" }],
      graph_ref: { graph_id: oldGraphId, content_version: "graph-v1" },
      task_ids: [taskId],
      verification_obligations: ["Run the focused tests."],
      prerequisite_conditions: [],
      coordination_constraints: ["Serialize Integration per Unit."],
      approval_required: false,
    },
  },
});

const activityResumeFixture = (
  root: string,
  graphChanged = true,
  activityState: "running" | "pausing" | "paused" = "paused",
  checkpoint = "a".repeat(40),
): { readonly loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>; readonly execution: TaskExecutionContext } => {
  const graphId = graphChanged ? currentGraphId : oldGraphId;
  const graphVersion = graphChanged ? "graph-v2" : "graph-v1";
  const taskDefinitionVersion = graphChanged ? "task-v2" : "task-v1";
  const taskDefinition = {
    id: taskId,
    title: "Implement the accepted task",
    goal: "Produce the declared output.",
    inputs: [input],
    outputs: ["result"],
    acceptance_criteria: ["The output satisfies the requirement."],
    guidance: [],
    verification: [],
    depends_on: [],
    prerequisites: [],
  };
  const mission = eventFact("85000000-0000-4000-8000-000000000007", "construction.mission-created", {
    mission_id: missionId,
    workflow: "standard",
    record_home: { repository_id: "application" },
    repositories: [{ repository_id: "application" }],
  });
  const prepared = eventFact("85000000-0000-4000-8000-000000000008", "construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [{
      repository_id: "application",
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
    }],
  }, [mission.event.id]);
  const planningCompletion = eventFact("85000000-0000-4000-8000-000000000001", "construction.stage-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation-planning",
    stage_attempt_id: planningAttemptId,
    implementation_planning_assessment: planningRecord(),
  });
  const implementationStart = eventFact("85000000-0000-4000-8000-000000000002", "construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: stageAttemptId,
    inputs: [input],
    checkpoints: [{ repository_id: "application", commit: checkpoint }],
    authority_event_ids: [],
  });
  const graphRef = { graph_id: oldGraphId, content_version: "graph-v1" };
  const taskDefinitionRef = { graph_id: oldGraphId, task_id: taskId, content_version: "task-v1" };
  const admission = eventFact("85000000-0000-4000-8000-000000000003", "construction.task-admitted", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: stageAttemptId,
    task_id: taskId,
    graph_ref: graphRef,
    task_definition_ref: taskDefinitionRef,
    task_contract: admittedTaskContract(taskDefinition, ""),
    admission_baseline: [{ repository_id: "application", commit: checkpoint }],
    predecessor_provenance: [],
    prerequisite_evidence: [],
  }, [implementationStart.event.id]);
  const activityStart = eventFact("85000000-0000-4000-8000-000000000004", "construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: stageAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: activityAttemptId,
    inputs: [input],
    checkpoints: [{ repository_id: "application", commit: checkpoint }],
  }, [implementationStart.event.id, admission.event.id]);
  const pauseRequest = eventFact("85000000-0000-4000-8000-000000000005", "construction.activity-pause-requested", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: stageAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: activityAttemptId,
    reason: "Pause requested",
  }, [activityStart.event.id]);
  const paused = eventFact("85000000-0000-4000-8000-000000000006", "construction.activity-paused", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: stageAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: activityAttemptId,
    reason: "Worker stopped; effects reconciled",
  }, [pauseRequest.event.id]);
  const activityFacts = [activityStart, ...(activityState === "running" ? [] : [pauseRequest]), ...(activityState === "paused" ? [paused] : [])];
  const facts = [mission, prepared, planningCompletion, implementationStart, admission, ...activityFacts];
  const task = {
    taskId,
    state: "ready",
    admissions: [admission],
    admission,
    activities: [{
      activity: "code-generation",
      state: activityState,
      currentAttemptId: activityAttemptId,
      stageAttemptId: stageAttemptId,
      accepted: [],
      attempts: [{ attemptId: activityAttemptId, stageAttemptId, state: activityState, facts: activityFacts }],
    }],
  };
  const unit = {
    unitId,
    workflow: "standard",
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    stages: [
      { stage: "implementation-planning", state: "completed", currentAttemptId: planningAttemptId, attempts: [{ attemptId: planningAttemptId, state: "completed", facts: [planningCompletion] }] },
      { stage: "implementation", state: "running", currentAttemptId: stageAttemptId, attempts: [{ attemptId: stageAttemptId, state: "running", facts: [implementationStart] }] },
    ],
    revisions: [],
    retainedScopeAssessments: [],
    tasks: [task],
  };
  const execution = {
    kind: "execution-context",
    graph: { format: "kepler-task-dag", version: 1, id: graphId, unit_id: unitId, tasks: [taskDefinition] },
    task: taskDefinition,
    graphRef: { graph_id: graphId, content_version: graphVersion },
    taskDefinitionRef: { graph_id: graphId, task_id: taskId, content_version: taskDefinitionVersion },
    planSource: "",
    context: {},
  } as unknown as TaskExecutionContext;
  return { loaded: loadedResult(root, unit, facts), execution };
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => Fs.rm(directory, { recursive: true, force: true })));
});

describe("Construction pause and resume", () => {
  it.each([
    ["held", { kind: "held", taskId, implementationAttemptId: stageAttemptId, activityAttemptId, resourceKey: "resource", lockPath: "/lock" }],
    ["unknown", { kind: "unknown", code: "integration_lock_unknown", details: { resource_key: "resource" }, recovery: "Preserve lock artifacts and inspect them." }],
  ] as const)("fails closed for an %s Integration lock before acknowledging stage pause", async (_label, inspection) => {
    const root = await tempRepository();
    const { loaded } = pauseStageFixture(root, "implementation", "pausing");
    const appended = { value: false };
    const runtime = fakeRuntime(async () => inspection, appended);
    const service = serviceFor(loaded, runtime);
    const selectors: ScopeSelectors = { unit: unitId, stage: "implementation", attempt: stageAttemptId };

    const result = await service.pause(selectors, {
      phase: "acknowledge",
      reason: "Worker stopped and effects reconciled",
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: "orchestrator-run:stage-implementation",
        reconciliation_references: ["reconciliation:worker", "reconciliation:effects"],
      },
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.code).toBe(inspection.kind === "held" ? "pause_integration_lock_held" : "integration_lock_unknown");
    expect(appended.value).toBe(false);
  });

  it("requires a typed orchestrator attestation and accepts an exact empty Activity input set", () => {
    expect(validateConstructionPauseRequest({
      phase: "acknowledge",
      reason: "Stopped",
      workers_stopped: true,
      effects_reconciled: true,
    }).kind).toBe("invalid");
    const validAcknowledgment = {
      phase: "acknowledge",
      reason: "Stopped",
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: "orchestrator-run:exact-1",
        reconciliation_references: ["effects:1"],
      },
    };
    expect(validateConstructionPauseRequest(validAcknowledgment).kind).toBe("valid");
    expect(validateConstructionPauseRequest({
      ...validAcknowledgment,
      orchestrator_attestation: { ...validAcknowledgment.orchestrator_attestation, exact_run_terminal: false },
    }).kind).toBe("invalid");
    expect(validateConstructionPauseRequest({
      ...validAcknowledgment,
      orchestrator_attestation: { ...validAcknowledgment.orchestrator_attestation, effects_reconciled: false },
    }).kind).toBe("invalid");
    expect(validateConstructionResumeRequest({ inputs: [] }).kind).toBe("valid");
  });

  it("refuses an Implementation pause request while any child Activity is active", async () => {
    const root = await tempRepository();
    const { loaded, facts } = pauseStageFixture(root, "implementation", "running");
    const unit = {
      ...(loaded.unit as unknown as Readonly<Record<string, unknown>>),
      tasks: [{ taskId, activities: [{ activity: "code-generation", stageAttemptId, currentAttemptId: activityAttemptId, state: "running" }] }],
    };
    const scoped = loadedResult(root, unit, facts);
    const appended = { value: false };
    const service = serviceFor(scoped, fakeRuntime(async () => ({ kind: "clear" }), appended));

    const result = await service.pause({ unit: unitId, stage: "implementation", attempt: stageAttemptId }, {
      phase: "request",
      reason: "Pause Implementation",
    });

    expect(result).toMatchObject({ kind: "failed", code: "stage_pause_activities_active" });
    expect(appended.value).toBe(false);

    const { loaded: pausing, facts: pausingFacts } = pauseStageFixture(root, "implementation", "pausing");
    const pausingUnit = {
      ...(pausing.unit as unknown as Readonly<Record<string, unknown>>),
      tasks: [{ taskId, activities: [{ activity: "code-generation", stageAttemptId, currentAttemptId: activityAttemptId, state: "running" }] }],
    };
    const ackService = serviceFor(loadedResult(root, pausingUnit, pausingFacts), fakeRuntime(async () => ({ kind: "clear" }), appended));
    const acknowledged = await ackService.pause({ unit: unitId, stage: "implementation", attempt: stageAttemptId }, {
      phase: "acknowledge",
      reason: "Implementation pause must wait for its child Activity",
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: "orchestrator-run:child-active",
        reconciliation_references: ["effects:child-active"],
      },
    });
    expect(acknowledged).toMatchObject({ kind: "failed", code: "stage_pause_activities_active" });
    expect(appended.value).toBe(false);
  });

  it("records Activity pause request and acknowledgment with exact orchestrator references", async () => {
    const root = await tempRepository();
    const selectors: ScopeSelectors = {
      unit: unitId,
      task: taskId,
      activity: "code-generation",
      implementationAttempt: stageAttemptId,
      attempt: activityAttemptId,
    };
    const running = activityResumeFixture(root, false, "running");
    const requestAppend = { value: false, event: undefined as unknown };
    const requestService = serviceFor(running.loaded, fakeRuntime(async () => ({ kind: "clear" }), requestAppend));
    const requested = await requestService.pause(selectors, { phase: "request", reason: "Pause Code Generation" });
    expect(requested).toMatchObject({ kind: "success", data: { attempt_id: activityAttemptId, pause_state: "pausing" } });
    expect(requestAppend.event).toMatchObject({ type: "construction.activity-pause-requested", data: { activity_attempt_id: activityAttemptId } });

    const pausing = activityResumeFixture(root, false, "pausing");
    const ackAppend = { value: false, event: undefined as unknown };
    const ackService = serviceFor(pausing.loaded, fakeRuntime(async () => ({ kind: "clear" }), ackAppend));
    const acknowledged = await ackService.pause(selectors, {
      phase: "acknowledge",
      reason: "Exact worker stopped and effects reconciled",
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: "orchestrator-run:activity-1",
        reconciliation_references: ["effects:activity-1"],
      },
    });
    expect(acknowledged).toMatchObject({ kind: "success", data: { attempt_id: activityAttemptId, pause_state: "paused" } });
    expect(ackAppend.event).toMatchObject({
      type: "construction.activity-paused",
      data: { activity_attempt_id: activityAttemptId, reason: expect.stringContaining("orchestrator-run:activity-1") },
    });
  });

  it("rejects stage resume when the recorded Standard authority is stale", async () => {
    const root = await tempRepository();
    const { facts } = pauseStageFixture(root, "functional-design", "paused");
    const mission = eventFact("86000000-0000-4000-8000-000000000001", "construction.mission-created", {
      mission_id: missionId, workflow: "standard",
    });
    const prepared = eventFact("86000000-0000-4000-8000-000000000002", "construction.mission-workspaces-prepared", {
      mission_id: missionId,
    });
    const created = eventFact("86000000-0000-4000-8000-000000000003", "construction.unit-created", { unit_id: unitId });
    const stage = {
      stage: "functional-design",
      state: "paused",
      currentAttemptId: stageAttemptId,
      attempts: [{ attemptId: stageAttemptId, state: "paused", facts }],
    };
    const unit = {
      unitId,
      workflow: "standard",
      blocked: false,
      historyIssues: [],
      projectionIssues: [],
      created,
      stages: [stage],
      revisions: [],
      retainedScopeAssessments: [],
      tasks: [],
    };
    const loaded = loadedResult(root, unit, [mission, prepared, created, ...facts]);
    const appended = { value: false };
    const runtime = fakeRuntime(async () => ({ kind: "clear" }), appended);
    const service = serviceFor(loaded, runtime);
    const selectors: ScopeSelectors = { unit: unitId, stage: "functional-design", attempt: stageAttemptId };

    const result = await service.resume(selectors, { inputs: [input] });

    expect(result).toMatchObject({ kind: "failed", code: "stage_resume_authority_changed" });
    expect(appended.value).toBe(false);
  });

  it("rejects a Stage resume when current captured checkpoints differ from the same attempt's latest start", async () => {
    const root = await committedRepository();
    const mission = eventFact("87000000-0000-4000-8000-000000000001", "construction.mission-created", {
      mission_id: missionId,
      workflow: "standard",
      record_home: { repository_id: "application" },
      repositories: [{ repository_id: "application" }],
    });
    const prepared = eventFact("87000000-0000-4000-8000-000000000002", "construction.mission-workspaces-prepared", {
      mission_id: missionId,
      repositories: [{
        repository_id: "application",
        branch: "main",
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
      }],
    }, [mission.event.id]);
    const created = eventFact("87000000-0000-4000-8000-000000000003", "construction.unit-created", { unit_id: unitId });
    const authorityEventIds = [mission.event.id, prepared.event.id, created.event.id];
    const start = eventFact("87000000-0000-4000-8000-000000000004", "construction.stage-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "functional-design",
      stage_attempt_id: stageAttemptId,
      inputs: [input],
      checkpoints: [{ repository_id: "application", commit: "b".repeat(40) }],
      authority_event_ids: authorityEventIds,
    }, authorityEventIds);
    const request = eventFact("87000000-0000-4000-8000-000000000005", "construction.stage-pause-requested", {
      mission_id: missionId, unit_id: unitId, stage: "functional-design", stage_attempt_id: stageAttemptId, reason: "Pause requested",
    }, [start.event.id]);
    const paused = eventFact("87000000-0000-4000-8000-000000000006", "construction.stage-paused", {
      mission_id: missionId, unit_id: unitId, stage: "functional-design", stage_attempt_id: stageAttemptId, reason: "Worker stopped and reconciled",
    }, [request.event.id]);
    const facts = [mission, prepared, created, start, request, paused];
    const unit = {
      unitId,
      workflow: "standard",
      blocked: false,
      historyIssues: [],
      projectionIssues: [],
      created,
      stages: [{ stage: "functional-design", state: "paused", currentAttemptId: stageAttemptId, attempts: [{ attemptId: stageAttemptId, state: "paused", facts: [start, request, paused] }] }],
      revisions: [],
      retainedScopeAssessments: [],
      tasks: [],
    };
    const loaded = loadedResult(root, unit, facts);
    const appended = { value: false };
    const runtime = fakeRuntime(async () => ({ kind: "clear" }), appended);
    const service = serviceFor(loaded, runtime);

    const result = await service.resume({ unit: unitId, stage: "functional-design", attempt: stageAttemptId }, { inputs: [input] });

    expect(result).toMatchObject({ kind: "failed", code: "stage_resume_material_drift" });
    expect(appended.value).toBe(false);
  });

  it("records stage pause acknowledgment with the exact stop and effects reconciliation references", async () => {
    const root = await tempRepository();
    const { loaded } = pauseStageFixture(root, "implementation", "pausing");
    const appended = { value: false, event: undefined as unknown };
    const service = serviceFor(loaded, fakeRuntime(async () => ({ kind: "clear" }), appended));

    const result = await service.pause({ unit: unitId, stage: "implementation", attempt: stageAttemptId }, {
      phase: "acknowledge",
      reason: "Worker stopped and all effects were reconciled",
      orchestrator_attestation: {
        exact_run_terminal: true,
        effects_reconciled: true,
        run_reference: "orchestrator-run:implementation-1",
        reconciliation_references: ["effects:implementation-1", "workspace:implementation-1"],
      },
    });

    expect(result).toMatchObject({ kind: "success", data: { attempt_id: stageAttemptId, pause_state: "paused" } });
    expect(appended.event).toMatchObject({
      type: "construction.stage-paused",
      data: { stage_attempt_id: stageAttemptId, reason: expect.stringContaining("orchestrator-run:implementation-1") },
    });
  });

  it("resumes the same stage attempt after rechecking authority, inputs, repository ownership, and material", async () => {
    const root = await committedRepository();
    const { loaded, checkpoint } = await stageResumeFixture(root);
    const appended = { value: false, event: undefined as unknown };
    const service = serviceFor(loaded, fakeRuntime(async () => ({ kind: "clear" }), appended));

    const result = await service.resume({ unit: unitId, stage: "functional-design", attempt: stageAttemptId }, { inputs: [input] });

    expect(result).toMatchObject({
      kind: "success",
      data: { stage: "functional-design", attempt_id: stageAttemptId, checkpoints: [{ repository_id: "application", commit: checkpoint }], worker_dispatched: false },
    });
    expect(appended.event).toMatchObject({
      type: "construction.stage-resumed",
      data: { stage_attempt_id: stageAttemptId, inputs: [input], checkpoints: [{ repository_id: "application", commit: checkpoint }] },
    });
  });

  it("resumes the same Activity attempt after rechecking admission material and repository ownership", async () => {
    const root = await committedRepository();
    const checkpoint = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const { loaded, execution } = activityResumeFixture(root, false, "paused", checkpoint);
    const appended = { value: false, event: undefined as unknown };
    const service = serviceFor(loaded, fakeRuntime(async () => ({ kind: "clear" }), appended), execution);
    const selectors: ScopeSelectors = {
      unit: unitId,
      task: taskId,
      activity: "code-generation",
      implementationAttempt: stageAttemptId,
      attempt: activityAttemptId,
    };

    const result = await service.resume(selectors, { inputs: [input] });

    expect(result).toMatchObject({ kind: "success", data: { attempt_id: activityAttemptId, worker_dispatched: false } });
    expect(appended.event).toMatchObject({
      type: "construction.activity-resumed",
      data: { activity_attempt_id: activityAttemptId, checkpoints: [{ repository_id: "application", commit: checkpoint }] },
    });
  });

  it("rejects Activity resume when the current graph differs from accepted planning material", async () => {
    const root = await tempRepository();
    const { loaded, execution } = activityResumeFixture(root);
    const appended = { value: false };
    const runtime = fakeRuntime(async () => ({ kind: "clear" }), appended);
    const service = serviceFor(loaded, runtime, execution);
    const selectors: ScopeSelectors = {
      unit: unitId,
      task: taskId,
      activity: "code-generation",
      implementationAttempt: stageAttemptId,
      attempt: activityAttemptId,
    };

    const result = await service.resume(selectors, { inputs: [input] });

    expect(result).toMatchObject({ kind: "failed", code: "activity_resume_material_drift" });
    expect(appended.value).toBe(false);
  });
});
