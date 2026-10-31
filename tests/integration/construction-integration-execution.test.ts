import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditContextResolver, AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE, CONSTRUCTION_REVISION_EVENT_VERSION, validateConstructionEvent, type ActivityAttemptId, type ConstructionEventRecord, type IntegrationInputCheckpoint, type RepositoryCheckpoint, type StageAttemptId, type TaskId } from "../../packages/cli/src/construction/events.js";
import { IntegrationExecution, createNodeIntegrationExecutionRuntime, inspectConstructionIntegrationLock, type IntegrationEvidenceCheck } from "../../packages/cli/src/construction/integration-execution.js";
import type { ConstructionActivityProjection, ConstructionHistoryFact, ConstructionTaskProjection, ConstructionUnitProjection } from "../../packages/cli/src/construction/projection.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { ConstructionQueries, TaskExecutionContext } from "../../packages/cli/src/construction/scoped-queries.js";
import { admittedTaskContract } from "../../packages/cli/src/construction/task-admission.js";
import type { TaskGraphTask } from "../../packages/cli/src/construction/task-graph.js";

const temporaryRoots: string[] = [];
const unitId = "2026-10-22-integration-fixture";
const taskId = "30000000-0000-4000-8000-000000000001" as TaskId;
const implementationAttemptId = "40000000-0000-4000-8000-000000000001" as StageAttemptId;
const generationAttemptId = "50000000-0000-4000-8000-000000000001" as ActivityAttemptId;
const validationAttemptId = "50000000-0000-4000-8000-000000000002" as ActivityAttemptId;
const integrationAttemptId = "50000000-0000-4000-8000-000000000003" as ActivityAttemptId;
const taskOutput = "src/integration-output.ts";
const inputReferences = {
  generation: [{ reference: "source:task", purpose: "Generate the declared task output" }],
  validation: [{ reference: `output:${taskOutput}`, purpose: "Validate the generated task output" }],
  integration: [{ reference: "plan:integration", purpose: "Check the prepared candidate against the plan" }],
};
const verification: TaskGraphTask["verification"] = [
  { scope: "Integration typecheck", method: "Run typecheck with `repo-main: bun run typecheck`.", expected_result: "Typechecking passes." },
  { scope: "Integration build", method: "Run build with `repo-main: bun run build`.", expected_result: "The build passes." },
  { scope: "Full test suite", method: "Run the full test suite with `repo-main: bun run test`.", expected_result: "All tests pass." },
];
const planSource = `# Plan\n\n## Verification strategy\n\nTypecheck: \`repo-main: bun run typecheck\`\nBuild: \`repo-main: bun run build\`\nFull test suite: \`repo-main: bun run test\`\n`;
const taskDefinition: TaskGraphTask = {
  id: taskId,
  title: "Integration execution fixture",
  goal: "Integrate and verify the declared task output.",
  inputs: inputReferences.generation,
  outputs: [taskOutput],
  acceptance_criteria: ["The Integration candidate preserves the declared task output."],
  guidance: [],
  verification,
  depends_on: [],
  prerequisites: [],
};

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, {
  cwd,
  encoding: "utf8",
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0" },
}).trim();

const historyEvent = (type: string, data: Record<string, unknown>, causedBy: readonly string[] = []): ConstructionEventRecord => ({
  id: randomUUID(),
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: randomUUID(),
  recorded_at: "2026-10-22T10:00:00.000Z",
  producer: { name: "kepler-test", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
} as unknown as ConstructionEventRecord);

const fact = (event: ConstructionEventRecord): ConstructionHistoryFact => ({
  sourceId: "integration-execution-test",
  journalId: event.journal_id,
  line: 1,
  byteOffset: 0,
  event,
});

const setup = async (includeSecondPreparedRepository = false, includeExtraValidationOutput = false) => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-integration-execution-"));
  temporaryRoots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Kepler Integration test");
  git(root, "config", "user.email", "integration@example.invalid");
  await Fs.writeFile(Path.join(root, "README.md"), "Integration execution fixture\n", "utf8");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "Create Integration baseline");
  const baseline = git(root, "rev-parse", "HEAD");
  git(root, "switch", "-q", "-c", "feature");
  await Fs.writeFile(Path.join(root, "generated.txt"), "Generated task output\n", "utf8");
  git(root, "add", "generated.txt");
  git(root, "commit", "-q", "-m", "Generate task output");
  const generated = git(root, "rev-parse", "HEAD");
  git(root, "switch", "-q", "-c", "candidate-diverged", baseline);
  await Fs.writeFile(Path.join(root, "diverged.txt"), "Diverged candidate\n", "utf8");
  git(root, "add", "diverged.txt");
  git(root, "commit", "-q", "-m", "Create candidate without generated output");
  const diverged = git(root, "rev-parse", "HEAD");
  git(root, "switch", "-q", "feature");

  const missionId = randomUUID();
  const workspaceId = "a".repeat(64);
  const gitDirectory = git(root, "rev-parse", "--absolute-git-dir");
  const commonDirectory = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const missionCreated = historyEvent("construction.mission-created", {
    mission_id: missionId,
    workflow: "standard",
    record_home: { repository_id: "repo-main" },
    repositories: [{ repository_id: "repo-main" }],
  });
  const workspacesPrepared = historyEvent("construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [{
      repository_id: "repo-main",
      branch: "feature",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: baseline },
    }, ...(includeSecondPreparedRepository ? [{
      repository_id: "repo-secondary",
      branch: "feature",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: baseline },
    }] : [])],
  }, [missionCreated.id]);
  const workspaceDirectory = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces");
  await Fs.mkdir(workspaceDirectory, { recursive: true });
  await Fs.writeFile(Path.join(workspaceDirectory, `${workspaceId}.json`), `${JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: "repo-main",
    repository_id: "repo-main",
    workspace_id: workspaceId,
    workspace_path: root,
    repository_path: root,
    git_directory: gitDirectory,
    common_directory: commonDirectory,
    branch: "feature",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: baseline },
  })}\n`, "utf8");

  const stageStarted = historyEvent("construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    inputs: inputReferences.generation,
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
    authority_event_ids: [],
  }, [missionCreated.id]);
  const graphRef = { graph_id: randomUUID(), content_version: "sha256:integration-graph" };
  const taskDefinitionRef = { graph_id: graphRef.graph_id, task_id: taskId, content_version: "sha256:integration-task" };
  const admission = historyEvent("construction.task-admitted", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    graph_ref: graphRef,
    task_definition_ref: taskDefinitionRef,
    task_contract: admittedTaskContract(taskDefinition, planSource),
    admission_baseline: [{ repository_id: "repo-main", commit: baseline }],
    predecessor_provenance: [],
    prerequisite_evidence: [],
  }, [stageStarted.id]);

  const generationStarted = historyEvent("construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    inputs: inputReferences.generation,
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
  }, [admission.id]);
  const generationEvidence = ["code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review"].map((check) => historyEvent("construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    evidence_id: randomUUID(),
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
    inputs: inputReferences.generation,
    check,
    executor: "agent:generator",
    worker_context_id: "context-generation",
    result: { status: "passed", summary: "Generation evidence is current" },
    output_refs: [taskOutput],
    conditions: [],
  }, [generationStarted.id]));
  const generationCompleted = historyEvent("construction.activity-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    evidence_ids: generationEvidence.map((item) => item.data.evidence_id),
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
  }, [generationStarted.id, ...generationEvidence.map((item) => item.id)]);

  const validationStarted = historyEvent("construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    inputs: inputReferences.validation,
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
  }, [admission.id, generationCompleted.id]);
  const validationEvidence = ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite", "code-validation-independent-review", "code-validation-self-review"].map((check) => historyEvent("construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    evidence_id: randomUUID(),
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
    inputs: inputReferences.validation,
    check,
    executor: "agent:validator",
    worker_context_id: "context-validation",
    result: { status: "passed", summary: "Validation evidence is current" },
    output_refs: includeExtraValidationOutput ? [taskOutput, "output:unplanned"] : [taskOutput],
    conditions: [],
  }, [validationStarted.id]));
  const validationCompleted = historyEvent("construction.activity-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    evidence_ids: validationEvidence.map((item) => item.data.evidence_id),
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
  }, [validationStarted.id, ...validationEvidence.map((item) => item.id)]);
  const integrationStarted = historyEvent("construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    inputs: inputReferences.integration,
    checkpoints: [{ repository_id: "repo-main", commit: generated }],
  }, [admission.id, validationCompleted.id]);

  const stageStartFact = fact(stageStarted);
  const admissionFact = fact(admission);
  const generationStartFact = fact(generationStarted);
  const generationEvidenceFacts = generationEvidence.map(fact);
  const generationCompletionFact = fact(generationCompleted);
  const validationStartFact = fact(validationStarted);
  const validationEvidenceFacts = validationEvidence.map(fact);
  const validationCompletionFact = fact(validationCompleted);
  const integrationStartFact = fact(integrationStarted);
  const generationActivity: ConstructionActivityProjection = {
    activity: "code-generation",
    state: "completed",
    currentAttemptId: generationAttemptId,
    stageAttemptId: implementationAttemptId,
    attempts: [{ attemptId: generationAttemptId, stageAttemptId: implementationAttemptId, state: "completed", facts: [generationStartFact, ...generationEvidenceFacts, generationCompletionFact] }],
    facts: [],
    prepared: [],
    accepted: [],
  };
  const validationActivity: ConstructionActivityProjection = {
    activity: "code-validation",
    state: "completed",
    currentAttemptId: validationAttemptId,
    stageAttemptId: implementationAttemptId,
    attempts: [{ attemptId: validationAttemptId, stageAttemptId: implementationAttemptId, state: "completed", facts: [validationStartFact, ...validationEvidenceFacts, validationCompletionFact] }],
    facts: [],
    prepared: [],
    accepted: [],
  };
  const integrationActivity: ConstructionActivityProjection = {
    activity: "code-integration",
    state: "running",
    currentAttemptId: integrationAttemptId,
    stageAttemptId: implementationAttemptId,
    attempts: [{ attemptId: integrationAttemptId, stageAttemptId: implementationAttemptId, state: "running", facts: [integrationStartFact] }],
    facts: [],
    prepared: [],
    accepted: [],
  };
  const planningAttemptId = randomUUID() as StageAttemptId;
  const planningBindings = [
    { artifact_id: randomUUID(), content_version: "sha256:plan" },
    { artifact_id: randomUUID(), content_version: "sha256:task-graph" },
  ];
  const planningGraphRef = { graph_id: randomUUID(), content_version: "sha256:task-graph" };
  const planningAssessment = {
    graph_ref: planningGraphRef,
    artifact_bindings: planningBindings,
    reviewed_material_bindings: planningBindings,
    artifact_paths: ["plan.md"],
    task_graph_path: "tasks-dag.json",
    plan_graph_link: { plan_path: "plan.md", task_graph_path: "tasks-dag.json" },
    assessments: {
      artifact_validation: { evidence_id: randomUUID(), summary: "Planning artifacts are valid." },
      task_graph_validation: { evidence_id: randomUUID(), summary: "The task graph is valid." },
      self_review: {
        status: "passed",
        evidence_id: randomUUID(),
        reviewer: "agent:planner",
        summary: "Planning bindings are suitable for Integration.",
        checks: ["decision-rationale", "obligation-coverage", "consistency", "dependency-reasons", "prerequisite-conditions", "verification-feasibility", "input-relevance", "blocking-decisions"],
        decision_rationales: [{ decision: "Use the fixture graph.", rationale: "It covers the Integration task." }],
        task_reviews: [{
          task_id: taskId,
          inputs_relevant: true,
          outputs_explicit: true,
          acceptance_testable: true,
          dependency_reasons_justified: true,
          prerequisites_conditioned: true,
          verification_feasible: true,
          rationale: "The task contract is testable.",
        }],
        obligation_coverage: [{ reference: "obligation:integration", disposition: "planned", task_ids: [taskId], rationale: "The task covers Integration." }],
        unresolved_consequential_decisions: [],
        unsupported_assumptions: [],
      },
      external_review: { requested: false },
      approval_requirement: { required: false, rationale: "No approval is required." },
      handoff: {
        status: "ready",
        summary: "Planning is ready for Implementation.",
        recipient: "implementation",
        unit_directory: "units/integration-fixture",
        artifacts: ["plan.md", "tasks-dag.json"],
        input_bindings: planningBindings,
        graph_ref: planningGraphRef,
        task_ids: [taskId],
        verification_obligations: ["Verify the Integration candidate."],
        prerequisite_conditions: [],
        coordination_constraints: [],
        approval_required: false,
      },
    },
  };
  const planningStart = historyEvent("construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation-planning",
    stage_attempt_id: planningAttemptId,
    inputs: [],
    checkpoints: [],
    authority_event_ids: [],
  });
  const planningCompletion = historyEvent("construction.stage-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation-planning",
    stage_attempt_id: planningAttemptId,
    evidence_ids: [],
    checkpoints: [],
    implementation_planning_assessment: planningAssessment,
  }, [planningStart.id]);
  const planningFacts = [fact(planningStart), fact(planningCompletion)];
  const task: ConstructionTaskProjection = {
    taskId,
    state: "integrating",
    stageAttemptId: implementationAttemptId,
    admission: admissionFact,
    admissions: [admissionFact],
    activities: [generationActivity, validationActivity, integrationActivity],
    facts: [],
  };
  const unit: ConstructionUnitProjection = {
    missionId,
    unitId,
    initialized: true,
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    workflow: "standard",
    stages: [{
      stage: "implementation-planning",
      state: "completed",
      currentAttemptId: planningAttemptId,
      attempts: [{ attemptId: planningAttemptId, state: "completed", facts: planningFacts }],
      facts: planningFacts,
    }, {
      stage: "implementation",
      state: "running",
      currentAttemptId: implementationAttemptId,
      attempts: [{ attemptId: implementationAttemptId, state: "running", facts: [stageStartFact] }],
      facts: [stageStartFact],
    }],
    tasks: [task],
    evidence: [...generationEvidenceFacts, ...validationEvidenceFacts].map((item) => ({ fact: item, binding: "activity-attempt" })),
    approvals: [],
    interactions: [],
    revisions: [],
    retainedScopeAssessments: [],
    completionAssessments: [],
    progress: { completedStages: 0, totalStages: 6, completedTasks: 0, knownTasks: 1, reliable: true },
  };
  const allEvents = [missionCreated, workspacesPrepared, planningStart, planningCompletion, stageStarted, admission, generationStarted, ...generationEvidence,
    generationCompleted, validationStarted, ...validationEvidence, validationCompleted, integrationStarted];
  const historyRecords = allEvents.map((event) => ({ event }));
  const addIntegrationEvidence = (preparedEventId: string, check: IntegrationEvidenceCheck) => {
    const checkCommand = check === "code-integration-typecheck" ? { repository_id: "repo-main", executable: "bun", argv: ["run", "typecheck"] }
      : check === "code-integration-build" ? { repository_id: "repo-main", executable: "bun", argv: ["run", "build"] }
        : check === "code-integration-full-test-suite" ? { repository_id: "repo-main", executable: "bun", argv: ["run", "test"] } : undefined;
    const event = historyEvent("construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      activity: "code-integration",
      activity_attempt_id: integrationAttemptId,
      evidence_id: randomUUID(),
      artifact_bindings: planningBindings,
      checkpoints: [{ repository_id: "repo-main", commit: generated }],
      inputs: inputReferences.integration,
      check,
      executor: "orchestrator:integration-checker",
      result: { status: "passed", summary: `The ${check} result is valid before revision.` },
      output_refs: [`result:${check}`],
      conditions: check === "code-integration-self-review"
        ? ["Integration bindings match the accepted candidate and actual inputs.", ...taskDefinition.acceptance_criteria]
        : [],
      ...(checkCommand ? { check_command: checkCommand } : {}),
    }, [integrationStarted.id, preparedEventId]);
    const evidenceFact = fact(event);
    historyRecords.push({ event });
    (unit.evidence as Array<{ readonly fact: ConstructionHistoryFact; readonly binding: "activity-attempt" }>).push({
      fact: evidenceFact,
      binding: "activity-attempt",
    });
    (integrationActivity.attempts[0]?.facts as ConstructionHistoryFact[] | undefined)?.push(evidenceFact);
  };
  const loaded = {
    kind: "loaded",
    root,
    missionId,
    history: { events: historyRecords },
    projection: { missionId, blocked: false, projectionIssues: [], units: [unit] },
    unit,
  } as unknown as Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>;
  let executionContext = {
    kind: "execution-context",
    graph: { id: graphRef.graph_id, tasks: [taskDefinition] },
    task: taskDefinition,
    graphRef,
    taskDefinitionRef,
    planSource,
    context: {},
  } as unknown as TaskExecutionContext;
  const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
  const queries = { taskExecutionContext: async () => executionContext } as unknown as ConstructionQueries;
  const selectors: ScopeSelectors = {
    unit: unitId,
    task: taskId,
    activity: "code-integration",
    implementationAttempt: implementationAttemptId,
    attempt: integrationAttemptId,
  };
  const runtime = (processId: number, afterFirstUnitControlRelease?: () => void) => {
    const base = createNodeIntegrationExecutionRuntime({ name: "kepler-test", version: "0.10.3" });
    let triggered = false;
    return {
      ...base,
      journals: {
        ...base.journals,
        create: (...args: Parameters<typeof base.journals.create>) => {
          const journal = base.journals.create(...args);
          return {
            ...journal,
            append: async (event: unknown) => {
              const result = await journal.append(event);
              const recorded = event as ConstructionEventRecord;
              historyRecords.push({ event: recorded });
              if (recorded.type === "construction.integration-prepared") {
                const preparedFact = fact(recorded);
                const mutableActivity = integrationActivity as unknown as {
                  readonly facts: ConstructionHistoryFact[];
                  readonly prepared: ConstructionHistoryFact[];
                  readonly attempts: Array<{ readonly facts: ConstructionHistoryFact[] }>;
                };
                mutableActivity.facts.push(preparedFact);
                mutableActivity.prepared.push(preparedFact);
                mutableActivity.attempts[0]?.facts.push(preparedFact);
              }
              return result;
            },
          };
        },
      },
      workspace: {
        ...base.workspace,
        identity: { machine_id: "integration-test-host", process_id: processId, process_incarnation_id: randomUUID() },
        coordination: {
          ...base.workspace.coordination,
          acquire: async (request: Parameters<typeof base.workspace.coordination.acquire>[0]) => {
            const acquired = await base.workspace.coordination.acquire(request);
            if (acquired.kind === "failed" || !afterFirstUnitControlRelease || triggered ||
                request.owner.resource_scope !== `construction/unit-control/${unitId}`) return acquired;
            const release = acquired.lease.release;
            return {
              ...acquired,
              lease: {
                ...acquired.lease,
                release: async () => {
                  const result = await release();
                  if (result.kind === "released" && !triggered) {
                    triggered = true;
                    afterFirstUnitControlRelease();
                  }
                  return result;
                },
              },
            };
          },
        },
      },
    };
  };
  const execution = (processId: number, afterFirstUnitControlRelease?: () => void) =>
    new IntegrationExecution(contexts, queries, runtime(processId, afterFirstUnitControlRelease));
  const setRevisionBarrier = () => {
    const interaction = historyEvent("construction.interaction-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      participants: ["orchestrator"],
      content: JSON.stringify({ decision: "Reopen the current Implementation attempt." }),
      references: ["finding:revision"],
    }, [stageStarted.id]);
    const authorization = {
      ...historyEvent("construction.revision-authorized", {
        mission_id: missionId,
        unit_id: unitId,
        revision_id: randomUUID(),
        orchestrator_decision: "Reopen the current Implementation attempt.",
        reason: "A current upstream assumption requires re-execution.",
        inputs: [{ reference: "finding:revision", purpose: "Bind the revision finding." }],
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        affected_scopes: [
          { kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: implementationAttemptId },
          { kind: "stage", stage: "unit-of-work-review", prior_attempt: "none" },
          { kind: "stage", stage: "deliver", prior_attempt: "none" },
        ],
      }, [interaction.id, stageStarted.id]),
      event_version: CONSTRUCTION_REVISION_EVENT_VERSION,
    } as ConstructionEventRecord;
    expect(validateConstructionEvent(interaction).status).toBe("valid");
    expect(validateConstructionEvent(authorization).status).toBe("valid");
    historyRecords.push({ event: interaction }, { event: authorization });
  };
  return {
    root,
    missionId,
    baseline,
    generated,
    diverged,
    commonDirectory,
    selectors,
    runtime,
    execution,
    setRevisionBarrier,
    addIntegrationEvidence,
    setPlanSource: (source: string) => { executionContext = { ...executionContext, planSource: source }; },
  };
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("Construction Integration execution", () => {
  it("blocks lock acquisition behind a revision barrier before claiming Integration", async () => {
    const fixture = await setup();
    fixture.setRevisionBarrier();

    const result = await fixture.execution(41009).lock(fixture.selectors);

    expect(result).toMatchObject({ kind: "failed", code: "revision_barrier_pending" });
    const resourceKey = createHash("sha256").update(JSON.stringify([fixture.missionId, unitId, "construction-integration"])).digest("hex");
    await expect(Fs.stat(Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", resourceKey)))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not publish an Integration snapshot after a revision crosses the initial lock fence", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41015, fixture.setRevisionBarrier);

    const result = await execution.lock(fixture.selectors);

    expect(result).toMatchObject({ kind: "failed", code: "revision_barrier_pending" });
    const resourceKey = createHash("sha256").update(JSON.stringify([fixture.missionId, unitId, "construction-integration"])).digest("hex");
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", resourceKey);
    await expect(Fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a candidate result after authorization arrives during a long Integration check", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41016);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
    const prepared = await execution.prepare(fixture.selectors, acquired.data.lock_token as string, {
      captured_inputs: acquired.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: fixture.generated } satisfies RepositoryCheckpoint],
    });
    expect(prepared.kind).toBe("success");
    if (prepared.kind !== "success") return;

    let checkStarted!: () => void;
    let finishCheck!: () => void;
    const started = new Promise<void>((resolve) => { checkStarted = resolve; });
    const pendingCheck = new Promise<void>((resolve) => { finishCheck = resolve; });
    for (const check of ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite", "code-integration-self-review"] satisfies readonly IntegrationEvidenceCheck[]) {
      fixture.addIntegrationEvidence(String(prepared.data.prepared_event_id), check);
    }
    const longCheck = (async () => {
      checkStarted();
      await pendingCheck;
    })();
    await started;
    fixture.setRevisionBarrier();
    finishCheck();
    await longCheck;

    const lateEvidence = await execution.recordEvidence(fixture.selectors, acquired.data.lock_token as string, {
      prepared_event_id: prepared.data.prepared_event_id,
      check: "code-integration-full-test-suite",
      executor: "orchestrator:test-worker",
      result: { status: "passed", summary: "The long candidate check completed after revision authorization." },
      check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", "test"] },
      output_refs: ["result:integration-test-suite"],
      conditions: [],
    });
    expect(lateEvidence).toMatchObject({ kind: "failed", code: "revision_barrier_pending" });
    git(fixture.root, "update-ref", "refs/heads/main", fixture.generated);
    const lateAcceptance = await execution.accept(
      fixture.selectors,
      acquired.data.lock_token as string,
      String(prepared.data.prepared_event_id),
    );
    expect(lateAcceptance).toMatchObject({ kind: "failed", code: "revision_barrier_pending" });
  });

  it("rejects a multi-repository workspace before acquiring the Integration lock", async () => {
    const fixture = await setup(true);
    const execution = fixture.execution(41000);

    const result = await execution.lock(fixture.selectors);

    expect(result).toMatchObject({ kind: "failed", code: "multi_repository_integration_unsupported" });
    await expect(Fs.stat(Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps an unrelated Unit progressing while another Unit holds Integration", async () => {
    const active = await setup();
    const unaffected = await setup();
    const activeExecution = active.execution(41017);
    const unaffectedExecution = unaffected.execution(41018);
    const activeLock = await activeExecution.lock(active.selectors);
    expect(activeLock.kind).toBe("success");
    if (activeLock.kind !== "success") return;

    const unaffectedLock = await unaffectedExecution.lock(unaffected.selectors);
    expect(unaffectedLock.kind).toBe("success");
    if (unaffectedLock.kind !== "success") return;
    const prepared = await unaffectedExecution.prepare(unaffected.selectors, unaffectedLock.data.lock_token as string, {
      captured_inputs: unaffectedLock.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: unaffected.generated } satisfies RepositoryCheckpoint],
    });
    expect(prepared.kind).toBe("success");
    expect(await unaffectedExecution.release(unaffected.selectors, unaffectedLock.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });
    expect(await activeExecution.release(active.selectors, activeLock.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });
  });

  it("rejects verification-plan changes after admission before acquiring the Integration lock", async () => {
    const fixture = await setup();
    fixture.setPlanSource(planSource.replace("bun run typecheck", "bun run changed-typecheck"));

    const result = await fixture.execution(41008).lock(fixture.selectors);

    expect(result).toMatchObject({ kind: "failed", code: "integration_task_definition_stale" });
    await expect(Fs.stat(Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unplanned task outputs before writing an Integration preparation", async () => {
    const fixture = await setup(false, true);
    const execution = fixture.execution(41007);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;

    const prepared = await execution.prepare(fixture.selectors, acquired.data.lock_token as string, {
      captured_inputs: acquired.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: fixture.generated } satisfies RepositoryCheckpoint],
    });

    expect(prepared).toMatchObject({ kind: "failed", code: "integration_task_output_unverified" });
    expect(await execution.release(fixture.selectors, acquired.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });
  });

  it("blocks prepared-candidate append when a revision is authorized during preparation", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41013);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
    fixture.setRevisionBarrier();

    const prepared = await execution.prepare(fixture.selectors, acquired.data.lock_token as string, {
      captured_inputs: acquired.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: fixture.generated } satisfies RepositoryCheckpoint],
    });

    expect(prepared).toMatchObject({ kind: "failed", code: "revision_barrier_pending" });
    expect(await execution.release(fixture.selectors, acquired.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });
  });

  it("uses the durable common-directory lock across independent process owners", async () => {
    const fixture = await setup();
    const first = fixture.execution(41001);

    const acquired = await first.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
    expect(await inspectConstructionIntegrationLock(fixture.runtime(41001), fixture.commonDirectory, fixture.missionId, unitId)).toMatchObject({
      kind: "held", taskId: String(taskId), implementationAttemptId: String(implementationAttemptId), activityAttemptId: String(integrationAttemptId),
    });
    const resourceKey = String(acquired.data.resource_key);
    const coordinationModule = pathToFileURL(Path.resolve("packages/cli/src/construction/mission-coordination.js")).href;
    const runtimeModule = pathToFileURL(Path.resolve("packages/cli/src/construction/mission-coordination-runtime.js")).href;
    const childScript = `import { randomUUID } from "node:crypto";\nimport { createMissionCoordination } from ${JSON.stringify(coordinationModule)};\nimport { nodeMissionCoordinationFileSystem } from ${JSON.stringify(runtimeModule)};\nconst missionId = ${JSON.stringify(fixture.missionId)};\nconst result = await createMissionCoordination(nodeMissionCoordinationFileSystem, { next: randomUUID }).acquire({\n  commonDirectory: ${JSON.stringify(fixture.commonDirectory)},\n  location: { kind: "mission", missionId },\n  resourceKey: ${JSON.stringify(resourceKey)},\n  owner: {\n    machine_id: "integration-test-host",\n    process_id: process.pid,\n    process_incarnation_id: randomUUID(),\n    mission_id: missionId,\n    resource_scope: ${JSON.stringify(`construction/integration/${unitId}`)},\n    attempt_context: ${JSON.stringify(JSON.stringify([taskId, implementationAttemptId, integrationAttemptId]))},\n  },\n});\nconsole.log(JSON.stringify(result.kind === "failed" ? { kind: result.kind, code: result.code } : { kind: result.kind }));`;
    const child = await execa(process.execPath, ["--eval", childScript], { cwd: fixture.root });

    expect(JSON.parse(child.stdout)).toEqual({ kind: "failed", code: "resource_contended" });
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", String(acquired.data.resource_key));
    expect(await Fs.stat(lockPath).then((value) => value.isDirectory())).toBe(true);
    const released = await first.release(fixture.selectors, acquired.data.lock_token as string);
    expect(released).toMatchObject({ kind: "success", data: { aborted: true, lock_released: true } });
    expect(await inspectConstructionIntegrationLock(fixture.runtime(41001), fixture.commonDirectory, fixture.missionId, unitId)).toEqual({ kind: "clear" });
  });

  it("blocks revision reconciliation when an Integration owner record is unknown", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41010);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", String(acquired.data.resource_key));
    const ownerPath = Path.join(lockPath, "owner.json");
    const owner = JSON.parse(await Fs.readFile(ownerPath, "utf8")) as Record<string, unknown>;
    await Fs.writeFile(ownerPath, `${JSON.stringify({ ...owner, machine_id: "unknown-owner" })}\n`, "utf8");

    expect(await inspectConstructionIntegrationLock(fixture.runtime(41010), fixture.commonDirectory, fixture.missionId, unitId)).toMatchObject({
      kind: "unknown", code: "integration_lock_owner_mismatch",
    });
  });

  it("retries Integration under the same current Activity attempt", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41012);
    const first = await execution.lock(fixture.selectors);
    expect(first).toMatchObject({ kind: "success", data: { activity_attempt_id: integrationAttemptId } });
    if (first.kind !== "success") return;
    expect(await execution.release(fixture.selectors, first.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });

    const retry = await execution.lock(fixture.selectors);

    expect(retry).toMatchObject({
      kind: "success",
      data: { activity_attempt_id: integrationAttemptId, implementation_attempt_id: implementationAttemptId },
    });
    if (retry.kind === "success") expect(await execution.release(fixture.selectors, retry.data.lock_token as string)).toMatchObject({
      kind: "success", data: { aborted: true, lock_released: true },
    });
  });

  it("continues preparation and release with a new CLI process identity", async () => {
    const fixture = await setup();
    const firstProcess = fixture.execution(41002);
    const secondProcess = fixture.execution(41006);
    const acquired = await firstProcess.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;

    const prepared = await secondProcess.prepare(fixture.selectors, acquired.data.lock_token as string, {
      captured_inputs: acquired.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: fixture.generated } satisfies RepositoryCheckpoint],
    });
    expect(prepared.kind).toBe("success");
    if (prepared.kind !== "success") return;

    const released = await secondProcess.release(fixture.selectors, acquired.data.lock_token as string);

    expect(released).toMatchObject({ kind: "success", data: { aborted: true, lock_released: true } });
  });

  it("rejects a candidate that omits the current Generation output from its ancestry", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41003);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;

    const prepared = await execution.prepare(fixture.selectors, acquired.data.lock_token as string, {
      captured_inputs: acquired.data.captured_inputs as readonly IntegrationInputCheckpoint[],
      candidate_checkpoints: [{ repository_id: "repo-main", commit: fixture.diverged } satisfies RepositoryCheckpoint],
    });

    expect(prepared).toMatchObject({ kind: "failed", code: "integration_candidate_missing_required_input" });
    if (prepared.kind === "failed") expect(prepared.details.ancestor).toBe(fixture.generated);
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", String(acquired.data.resource_key));
    expect(await Fs.stat(lockPath).then((value) => value.isDirectory())).toBe(true);
    expect(await execution.release(fixture.selectors, acquired.data.lock_token as string)).toMatchObject({ kind: "success", data: { aborted: true } });
  });

  it("releases failed Integration work only while the target remains at its captured input", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41004);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;

    const released = await execution.release(fixture.selectors, acquired.data.lock_token as string);

    expect(released).toMatchObject({ kind: "success", data: { aborted: true, lock_released: true, captured_inputs: [{ repository_id: "repo-main", commit: fixture.baseline }] } });
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", String(acquired.data.resource_key));
    await expect(Fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the lock held when a failed Integration attempt changed the target", async () => {
    const fixture = await setup();
    const execution = fixture.execution(41005);
    const acquired = await execution.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
    git(fixture.root, "update-ref", "refs/heads/main", fixture.diverged);

    const released = await execution.release(fixture.selectors, acquired.data.lock_token as string);

    expect(released).toMatchObject({ kind: "failed", code: "integration_release_target_changed" });
    const lockPath = Path.join(fixture.commonDirectory, "kepler", "missions", fixture.missionId, "coordination", String(acquired.data.resource_key));
    expect(await Fs.stat(lockPath).then((value) => value.isDirectory())).toBe(true);
    expect(await Fs.stat(`${lockPath}.releasing`).then(() => true, () => false)).toBe(false);
  });
});
