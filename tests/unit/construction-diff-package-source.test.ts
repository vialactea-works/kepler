import { describe, expect, it } from "vitest";
import type { AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import type {
  ActivityAttemptId,
  ConstructionEventRecord,
  ConstructionEventType,
  StageAttemptId,
  TaskId,
} from "../../packages/cli/src/construction/events.js";
import { ConstructionDiffPackageSources } from "../../packages/cli/src/construction/diff-package-source.js";
import type { ConstructionHistoryFact, ConstructionTaskProjection, ConstructionUnitProjection } from "../../packages/cli/src/construction/projection.js";
import type { HistoryCollection } from "../../packages/cli/src/history/collection.js";

const ids = {
  mission: "10000000-0000-4000-8000-000000000001",
  oldImplementation: "20000000-0000-4000-8000-000000000001",
  implementation: "20000000-0000-4000-8000-000000000002",
  task: "30000000-0000-4000-8000-000000000001",
  generation: "40000000-0000-4000-8000-000000000001",
  validation: "40000000-0000-4000-8000-000000000002",
  integration: "40000000-0000-4000-8000-000000000003",
  priorIntegration: "40000000-0000-4000-8000-000000000004",
  generationEvidence: "60000000-0000-4000-8000-000000000001",
  validationEvidence: "60000000-0000-4000-8000-000000000002",
  priorIntegrationEvidence: "60000000-0000-4000-8000-000000000003",
};
const unitId = "2026-10-23-source-package";
const repositoryId = "repo-main";
const checkpoint = (character: string) => character.repeat(40);

const record = (
  id: string,
  type: ConstructionEventType,
  data: Record<string, unknown>,
  causedBy: readonly ConstructionEventRecord["id"][] = [],
): ConstructionEventRecord => ({
  id: id as ConstructionEventRecord["id"],
  phase: "construction",
  type,
  envelope_version: 1,
  event_version: 1,
  journal_id: "journal-source" as ConstructionEventRecord["journal_id"],
  recorded_at: "2026-10-23T10:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
});

const fact = (event: ConstructionEventRecord): ConstructionHistoryFact => ({
  sourceId: String(event.id),
  journalId: String(event.journal_id),
  line: 1,
  byteOffset: 0,
  event,
});

const eventFact = (
  id: string,
  type: ConstructionEventType,
  data: Record<string, unknown>,
  causedBy: readonly ConstructionEventRecord["id"][] = [],
): ConstructionHistoryFact => fact(record(id, type, data, causedBy));

interface FixtureOptions {
  readonly repositories?: readonly string[];
  readonly includeIntegration?: boolean;
  readonly includeUnitReview?: boolean;
  readonly integrationCompleted?: boolean;
  readonly generationAttempt?: string;
  readonly reverseAcceptedCandidateRepositories?: boolean;
  readonly omitIntegrationRepository?: string;
  readonly includeEarlierReviewCompletion?: boolean;
  readonly retainedValidationGeneration?: boolean;
}

const makeLoaded = (options: FixtureOptions = {}): Extract<AuditHistoryReadResult, { readonly kind: "loaded" }> => {
  const repositories = options.repositories ?? [repositoryId];
  const checkpoints = (character: string) => repositories.map((id) => ({ repository_id: id, commit: checkpoint(character) }));
  const integrationCheckpoints = (character: string) => checkpoints(character).filter((item) => item.repository_id !== options.omitIntegrationRepository);
  const workspaceRepositories = repositories.map((id) => ({
    repository_id: id,
    context: { kind: "existing" },
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: checkpoint("a") },
  }));
  const missionCreated = record("90000000-0000-4000-8000-000000000001", "construction.mission-created", {
    mission_id: ids.mission,
    title: "Source package test",
    request: "Inspect fixed Construction source checkpoints",
    workflow: "standard",
    record_home: { repository_id: repositoryId },
    contexts: [],
    repositories: workspaceRepositories,
  });
  const preparedWorkspaces = record("90000000-0000-4000-8000-000000000002", "construction.mission-workspaces-prepared", {
    mission_id: ids.mission,
    repositories: workspaceRepositories,
  });
  const created = eventFact("90000000-0000-4000-8000-000000000003", "construction.unit-created", {
    mission_id: ids.mission,
    unit_id: unitId,
    directory: ".kepler/units-of-work/source-package",
    workflow: "standard",
    initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" },
  });
  const baseline = eventFact("90000000-0000-4000-8000-000000000004", "construction.unit-baseline-selected", {
    mission_id: ids.mission,
    unit_id: unitId,
    review_baseline: checkpoints("a"),
    integration_targets: repositories.map((id) => ({ repository_id: id, target: "refs/heads/main" })),
  });
  const oldAdmission = eventFact("90000000-0000-4000-8000-000000000005", "construction.task-admitted", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.oldImplementation,
    task_id: ids.task,
    graph_ref: { graph_id: "70000000-0000-4000-8000-000000000001", content_version: "graph-old" },
    task_definition_ref: { graph_id: "70000000-0000-4000-8000-000000000001", task_id: ids.task, content_version: "task-old" },
    task_contract: { outputs: ["src/feature.ts"], acceptance_criteria: ["feature works"], dependency_task_ids: [], implementation_prerequisites: [] },
    admission_baseline: checkpoints("a"),
    predecessor_provenance: [],
    prerequisite_evidence: [],
  });
  const currentAdmission = eventFact("90000000-0000-4000-8000-000000000006", "construction.task-admitted", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.implementation,
    task_id: ids.task,
    graph_ref: { graph_id: "70000000-0000-4000-8000-000000000002", content_version: "graph-current" },
    task_definition_ref: { graph_id: "70000000-0000-4000-8000-000000000002", task_id: ids.task, content_version: "task-current" },
    task_contract: { outputs: ["src/feature.ts"], acceptance_criteria: ["feature works"], dependency_task_ids: [], implementation_prerequisites: [] },
    admission_baseline: checkpoints("a"),
    predecessor_provenance: [],
    prerequisite_evidence: [],
  });
  const generationAttempt = options.generationAttempt ?? ids.generation;
  const generationStart = eventFact("90000000-0000-4000-8000-000000000010", "construction.activity-attempt-started", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.oldImplementation,
    task_id: ids.task,
    activity: "code-generation",
    activity_attempt_id: generationAttempt,
    inputs: [{ reference: "spec:feature", purpose: "Implement the selected output" }],
    checkpoints: checkpoints("a"),
  });
  const generationEvidence = record(ids.generationEvidence, "construction.evidence-recorded", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.oldImplementation,
    task_id: ids.task,
    activity: "code-generation",
    activity_attempt_id: generationAttempt,
    evidence_id: ids.generationEvidence,
    artifact_bindings: [],
    checkpoints: checkpoints("b"),
    inputs: [{ reference: "spec:feature", purpose: "Implement the selected output" }],
    check: "code-generation-related-tests",
    executor: "test worker",
    result: { status: "passed", summary: "Feature tests passed" },
    output_refs: ["src/feature.ts"],
    conditions: [],
  });
  const generationCompletion = eventFact("90000000-0000-4000-8000-000000000011", "construction.activity-attempt-completed", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.oldImplementation,
    task_id: ids.task,
    activity: "code-generation",
    activity_attempt_id: generationAttempt,
    evidence_ids: [ids.generationEvidence],
    checkpoints: checkpoints("b"),
  });
  const validationParentId = options.retainedValidationGeneration ? ids.implementation : ids.oldImplementation;
  const retainedValidationGeneration = options.retainedValidationGeneration ? record("90000000-0000-4000-8000-000000000038", "construction.retained-scope-assessed", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.implementation,
    assessments: [{
      task_id: ids.task,
      activity: "code-generation",
      original_stage_attempt_id: ids.oldImplementation,
      original_activity_attempt_id: generationAttempt,
      original_evidence_ids: [ids.generationEvidence],
      applicable: true,
      reason: "The Generation output is retained for Validation",
      checkpoints: checkpoints("b"),
    }],
  }, [generationCompletion.event.id]) : undefined;
  const validationStart = eventFact("90000000-0000-4000-8000-000000000012", "construction.activity-attempt-started", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: validationParentId,
    task_id: ids.task,
    activity: "code-validation",
    activity_attempt_id: ids.validation,
    inputs: [{ reference: "src/feature.ts", purpose: "Validate generated task output" }],
    checkpoints: checkpoints("b"),
  }, [retainedValidationGeneration?.id ?? generationCompletion.event.id]);
  const validationEvidence = record(ids.validationEvidence, "construction.evidence-recorded", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: validationParentId,
    task_id: ids.task,
    activity: "code-validation",
    activity_attempt_id: ids.validation,
    evidence_id: ids.validationEvidence,
    artifact_bindings: [],
    checkpoints: checkpoints("b"),
    inputs: [{ reference: "src/feature.ts", purpose: "Validate generated task output" }],
    check: "code-validation-independent-review",
    executor: "review worker",
    result: { status: "passed", summary: "Validation passed" },
    output_refs: ["src/feature.ts"],
    conditions: [],
  });
  const validationCompletion = eventFact("90000000-0000-4000-8000-000000000013", "construction.activity-attempt-completed", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: validationParentId,
    task_id: ids.task,
    activity: "code-validation",
    activity_attempt_id: ids.validation,
    evidence_ids: [ids.validationEvidence],
    checkpoints: checkpoints("b"),
  }, [validationStart.event.id, validationEvidence.id]);
  const taskFacts: ConstructionHistoryFact[] = [oldAdmission, currentAdmission, generationStart, generationCompletion, validationStart, validationCompletion];
  const activityAttempts = [
    { activity: "code-generation" as const, attemptId: generationAttempt, stageAttemptId: ids.oldImplementation, facts: [generationStart, fact(generationEvidence), generationCompletion] },
    { activity: "code-validation" as const, attemptId: ids.validation, stageAttemptId: validationParentId, facts: [validationStart, fact(validationEvidence), validationCompletion] },
  ];
  const activityProjections = activityAttempts.map((attempt) => ({
    activity: attempt.activity,
    state: "completed" as const,
    currentAttemptId: attempt.attemptId as ActivityAttemptId,
    stageAttemptId: attempt.stageAttemptId as StageAttemptId,
    attempts: [{
      attemptId: attempt.attemptId as ActivityAttemptId,
      stageAttemptId: attempt.stageAttemptId as StageAttemptId,
      state: "completed" as const,
      facts: attempt.facts,
    }],
    facts: attempt.facts,
    prepared: [],
    accepted: [],
  }));
  const taskActivities: ConstructionTaskProjection["activities"][number][] = [...activityProjections];
  const retainedScopeFacts: ConstructionHistoryFact[] = retainedValidationGeneration ? [fact(retainedValidationGeneration)] : [];
  const completionAssessmentFacts: ConstructionHistoryFact[] = [];
  let taskCompletionFact: ConstructionHistoryFact | undefined;
  const implementationStart = eventFact("90000000-0000-4000-8000-000000000020", "construction.stage-attempt-started", {
    mission_id: ids.mission,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: ids.implementation,
    inputs: [],
    checkpoints: checkpoints("a"),
    authority_event_ids: [],
  });
  const implementationStage = {
    stage: "implementation" as const,
    state: "completed" as const,
    currentAttemptId: ids.implementation as StageAttemptId,
    attempts: [
      { attemptId: ids.oldImplementation as StageAttemptId, state: "ended_by_revision" as const, facts: [implementationStart] },
      { attemptId: ids.implementation as StageAttemptId, state: "completed" as const, facts: [implementationStart] },
    ],
    facts: [implementationStart],
  };

  const events: ConstructionEventRecord[] = [
    missionCreated,
    preparedWorkspaces,
    created.event,
    baseline.event,
    oldAdmission.event,
    currentAdmission.event,
    generationStart.event,
    generationEvidence,
    generationCompletion.event,
    ...(retainedValidationGeneration ? [retainedValidationGeneration] : []),
    validationStart.event,
    validationEvidence,
    validationCompletion.event,
    implementationStart.event,
  ];
  if (options.includeIntegration) {
    const integrationStart = eventFact("90000000-0000-4000-8000-000000000030", "construction.activity-attempt-started", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.integration,
      inputs: [{ reference: "output:task", purpose: "Integrate validated output" }],
      checkpoints: checkpoints("b"),
    });
    const priorIntegrationStart = options.includeUnitReview ? eventFact("90000000-0000-4000-8000-000000000042", "construction.activity-attempt-started", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.oldImplementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.priorIntegration,
      inputs: [{ reference: "output:task", purpose: "Integrate the earlier task output" }],
      checkpoints: checkpoints("a"),
    }) : undefined;
    const priorIntegrationEvidence = options.includeUnitReview ? record(ids.priorIntegrationEvidence, "construction.evidence-recorded", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.oldImplementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.priorIntegration,
      evidence_id: ids.priorIntegrationEvidence,
      artifact_bindings: [],
      checkpoints: integrationCheckpoints("c"),
      inputs: [],
      check: "earlier-integration-candidate-review",
      executor: "integration worker",
      result: { status: "passed", summary: "Earlier Integration candidate was accepted" },
      output_refs: ["src/feature.ts"],
      conditions: [],
    }) : undefined;
    const preparedOne = record("90000000-0000-4000-8000-000000000031", "construction.integration-prepared", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: options.includeUnitReview ? ids.oldImplementation : ids.implementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: options.includeUnitReview ? ids.priorIntegration : ids.integration,
      captured_inputs: integrationCheckpoints("b"),
      candidate_checkpoints: integrationCheckpoints("c"),
      task_output_refs: ["src/feature.ts"],
      source_evidence_ids: [options.includeUnitReview ? ids.priorIntegrationEvidence : ids.validationEvidence],
      inputs: [{ reference: "output:task", purpose: "Integrate validated output" }],
    });
    const preparedTwo = record("90000000-0000-4000-8000-000000000032", "construction.integration-prepared", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.integration,
      captured_inputs: integrationCheckpoints(options.includeUnitReview ? "c" : "b"),
      candidate_checkpoints: integrationCheckpoints("d"),
      task_output_refs: ["src/feature.ts"],
      source_evidence_ids: [ids.validationEvidence],
      inputs: [{ reference: "output:task", purpose: "Integrate validated output" }],
    });
    const accepted = record("90000000-0000-4000-8000-000000000033", "construction.integration-accepted", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.integration,
      prepared_event_id: preparedTwo.id,
      candidate_checkpoints: options.reverseAcceptedCandidateRepositories ? integrationCheckpoints("d").reverse() : integrationCheckpoints("d"),
      repository_results: [],
      authority_event_ids: [],
    });
    const integrationCompletion = eventFact("90000000-0000-4000-8000-000000000034", "construction.activity-attempt-completed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.integration,
      evidence_ids: [],
      checkpoints: integrationCheckpoints("d"),
    });
    const priorAccepted = options.includeUnitReview ? record("90000000-0000-4000-8000-000000000040", "construction.integration-accepted", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.oldImplementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.priorIntegration,
      prepared_event_id: preparedOne.id,
      candidate_checkpoints: integrationCheckpoints("c"),
    }, [preparedOne.id]) : undefined;
    const priorIntegrationCompletion = priorAccepted ? eventFact("90000000-0000-4000-8000-000000000043", "construction.activity-attempt-completed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.oldImplementation,
      task_id: ids.task,
      activity: "code-integration",
      activity_attempt_id: ids.priorIntegration,
      evidence_ids: [],
      checkpoints: integrationCheckpoints("c"),
    }) : undefined;
    const priorTaskCompletion = priorAccepted ? eventFact("90000000-0000-4000-8000-000000000041", "construction.task-completed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.oldImplementation,
      task_id: ids.task,
      integration_event_id: priorAccepted.id,
      conditions: ["Superseded task completion retained as history"],
    }, [priorAccepted.id]) : undefined;
    const taskCompletion = eventFact("90000000-0000-4000-8000-000000000035", "construction.task-completed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      task_id: ids.task,
      integration_event_id: accepted.id,
      conditions: ["Integrated candidate accepted"],
    }, [accepted.id]);
    const retained = record("90000000-0000-4000-8000-000000000036", "construction.retained-scope-assessed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      assessments: [{
        task_id: ids.task,
        activity: "code-generation",
        original_stage_attempt_id: ids.oldImplementation,
        original_activity_attempt_id: generationAttempt,
        original_evidence_ids: [ids.generationEvidence],
        applicable: true,
        reason: "Original generated output remains applicable",
        checkpoints: checkpoints("b"),
      }],
    });
    const completionAssessment = record("90000000-0000-4000-8000-000000000037", "construction.implementation-completion-assessed", {
      mission_id: ids.mission,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: ids.implementation,
      final_checkpoints: checkpoints("e"),
      artifact_paths: ["plan.md"],
      task_graph_path: "tasks-dag.json",
      graph_ref: { graph_id: "70000000-0000-4000-8000-000000000002", content_version: "graph-current" },
      task_ids: [ids.task],
      reviewed_material_bindings: [],
      self_review_evidence_id: ids.generationEvidence,
      handoff_evidence_id: ids.validationEvidence,
      unit_check_evidence_ids: [],
      required_check_evidence_ids: [],
      integration_event_ids: [accepted.id],
      retained_assessment_event_ids: [retained.id],
      additional_review: { requested: false },
      blocking_findings: [],
      handoff_assessment: { status: "ready", reason: "Ready", recipient: "unit-of-work-review", artifacts: [] },
    }, [taskCompletion.event.id]);
    const earlierCompletionAssessment = options.includeEarlierReviewCompletion && priorTaskCompletion && priorAccepted
      ? record("90000000-0000-4000-8000-000000000044", "construction.implementation-completion-assessed", {
        mission_id: ids.mission,
        unit_id: unitId,
        stage: "implementation",
        stage_attempt_id: ids.oldImplementation,
        final_checkpoints: checkpoints("c"),
        task_ids: [ids.task],
        integration_event_ids: [priorAccepted.id],
        retained_assessment_event_ids: [],
        self_review_evidence_id: null,
        handoff_evidence_id: null,
        unit_check_evidence_ids: [],
        required_check_evidence_ids: [],
      }, [priorTaskCompletion.event.id])
      : undefined;
    const integrationCompleted = options.integrationCompleted !== false;
    const priorIntegrationFacts = priorIntegrationStart && priorIntegrationCompletion && priorAccepted
      ? [priorIntegrationStart, fact(preparedOne), fact(priorAccepted), priorIntegrationCompletion]
      : [];
    const currentIntegrationFacts = [integrationStart, ...(priorIntegrationFacts.length === 0 ? [fact(preparedOne)] : []), fact(preparedTwo), fact(accepted), ...(integrationCompleted ? [integrationCompletion] : [])];
    const integrationActivityFacts = [...priorIntegrationFacts, ...currentIntegrationFacts];
    const integrationActivity = {
      activity: "code-integration" as const,
      state: integrationCompleted ? "completed" as const : "running" as const,
      currentAttemptId: ids.integration as ActivityAttemptId,
      stageAttemptId: ids.implementation as StageAttemptId,
      attempts: [
        ...(priorIntegrationFacts.length > 0 ? [{
          attemptId: ids.priorIntegration as ActivityAttemptId,
          stageAttemptId: ids.oldImplementation as StageAttemptId,
          state: "completed" as const,
          facts: priorIntegrationFacts,
        }] : []),
        {
          attemptId: ids.integration as ActivityAttemptId,
          stageAttemptId: ids.implementation as StageAttemptId,
          state: integrationCompleted ? "completed" as const : "running" as const,
          facts: currentIntegrationFacts,
        },
      ],
      facts: integrationActivityFacts,
      prepared: [fact(preparedOne), fact(preparedTwo)],
      accepted: [...(priorAccepted ? [fact(priorAccepted)] : []), fact(accepted)],
    };
    taskActivities.push(integrationActivity);
    if (options.includeUnitReview) {
      if (!priorTaskCompletion) throw new Error("Unit Review correction fixture requires its superseded task completion.");
      taskFacts.push(priorTaskCompletion, taskCompletion, fact(retained));
      taskCompletionFact = taskCompletion;
      retainedScopeFacts.push(fact(retained));
      completionAssessmentFacts.push(fact(completionAssessment));
      if (earlierCompletionAssessment) {
        completionAssessmentFacts.push(fact(earlierCompletionAssessment));
        implementationStage.attempts[0]?.facts.push(fact(earlierCompletionAssessment));
        implementationStage.facts.push(fact(earlierCompletionAssessment));
      }
      implementationStage.attempts[1]?.facts.push(fact(completionAssessment));
      implementationStage.facts.push(fact(completionAssessment));
    }
    events.push(integrationStart.event, ...(priorIntegrationStart ? [priorIntegrationStart.event] : []), ...(priorIntegrationEvidence ? [priorIntegrationEvidence] : []),
      preparedOne, preparedTwo, ...(priorAccepted ? [priorAccepted] : []), accepted,
      ...(priorIntegrationCompletion ? [priorIntegrationCompletion.event] : []),
      ...(integrationCompleted ? [integrationCompletion.event] : []),
      ...(priorTaskCompletion ? [priorTaskCompletion.event] : []),
      ...(earlierCompletionAssessment ? [earlierCompletionAssessment] : []),
      ...(options.includeUnitReview ? [taskCompletion.event, retained, completionAssessment] : []));
  }

  const task: ConstructionTaskProjection = {
    taskId: ids.task as TaskId,
    state: options.includeIntegration && !options.includeUnitReview ? "integrating" : "complete",
    stageAttemptId: ids.implementation as StageAttemptId,
    admission: currentAdmission,
    admissions: [oldAdmission, currentAdmission],
    activities: taskActivities,
    facts: taskFacts,
    ...(taskCompletionFact ? { completion: taskCompletionFact } : {}),
  };
  const historyEvents = events.map((event, index) => ({
    sourceId: String(event.id),
    scope: { missionId: ids.mission, unitId },
    missionId: ids.mission,
    phase: "construction",
    journalId: String(event.journal_id),
    line: index + 1,
    byteOffset: index,
    status: "valid" as const,
    event,
    constructionEvent: event,
    validationIssues: [],
    issueCodes: [],
  }));
  const history: HistoryCollection = {
    missionId: ids.mission,
    phase: "construction",
    sourceSetComplete: true,
    journals: [],
    events: historyEvents,
    issues: [],
    blockedScopes: [],
  };
  const unit: ConstructionUnitProjection = {
    missionId: ids.mission,
    unitId,
    initialized: true,
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    created,
    workflow: "standard",
    baseline,
    stages: [implementationStage],
    tasks: [task],
    evidence: [],
    approvals: [],
    interactions: [],
    revisions: [],
    retainedScopeAssessments: retainedScopeFacts,
    completionAssessments: completionAssessmentFacts,
    progress: { completedStages: 0, totalStages: 6, completedTasks: options.includeUnitReview ? 1 : 0, knownTasks: 1, reliable: true },
  };
  const loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }> = {
    kind: "loaded",
    root: "/record-home",
    missionId: ids.mission,
    history,
    projection: { missionId: ids.mission, blocked: false, historyIssues: [], projectionIssues: [], units: [unit] },
    unit,
  };
  return loaded;
};

describe("ConstructionDiffPackageSources", () => {
  it("resolves Validation from the fixed admission baseline and the explicit Generation output across repositories", async () => {
    const loaded = makeLoaded({ repositories: ["repo-main", "repo-library"] });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "validation",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.oldImplementation,
      generationAttemptId: ids.generation,
    }, "/record-home");

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source.comparisons).toHaveLength(2);
    expect(result.source.comparisons.map((comparison) => comparison.repositoryId)).toEqual(["repo-library", "repo-main"]);
    expect(result.source.comparisons.every((comparison) => comparison.role === "validation-admission-to-generation-output")).toBe(true);
    expect(result.source.comparisons.every((comparison) => "commit" in comparison.base && comparison.base.commit === checkpoint("a"))).toBe(true);
    expect(result.source.comparisons.every((comparison) => comparison.target.commit === checkpoint("b"))).toBe(true);
    expect(result.source.taskDefinitions.map((event) => String(event.id))).toContain("90000000-0000-4000-8000-000000000005");
  });

  it("keeps every Integration preparation, uses each recorded lock input, and preserves generation and validation evidence", async () => {
    const loaded = makeLoaded({ includeIntegration: true });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "integration",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.implementation,
      integrationAttemptId: ids.integration,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    const integrationComparisons = result.source.comparisons.filter((comparison) => comparison.role === "integration-captured-input-to-candidate");
    expect(integrationComparisons).toHaveLength(2);
    expect(integrationComparisons.map((comparison) => comparison.target.commit)).toEqual([checkpoint("c"), checkpoint("d")]);
    expect(integrationComparisons.every((comparison) => "commit" in comparison.base && comparison.base.commit === checkpoint("b"))).toBe(true);
    expect(integrationComparisons.map((comparison) => comparison.accepted)).toEqual([null, true]);
    expect(result.source.activityEvidence.map((event) => String(event.data.evidence_id))).toEqual(expect.arrayContaining([ids.generationEvidence, ids.validationEvidence]));
    expect(result.source.sourceAttempts.map((attempt) => attempt.activity)).toEqual(expect.arrayContaining(["code-generation", "code-validation", "code-integration"]));
    expect(result.source.integrationHistory.map((event) => event.type)).toContain("construction.integration-accepted");
  });

  it("resolves Integration Generation provenance through Validation's retained source binding", async () => {
    const loaded = makeLoaded({ includeIntegration: true, retainedValidationGeneration: true });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "integration",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.implementation,
      integrationAttemptId: ids.integration,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source.sourceAttempts).toContainEqual(expect.objectContaining({
      activity: "code-generation",
      attemptId: ids.generation,
      implementationAttemptId: ids.oldImplementation,
    }));
    expect(result.source.retainedScopes.map((event) => String(event.id))).toContain("90000000-0000-4000-8000-000000000038");
    expect(result.source.activityEvidence.map((event) => String(event.data.evidence_id))).toContain(ids.generationEvidence);
  });

  it("matches accepted Integration checkpoints by repository identity, independent of array order", async () => {
    const loaded = makeLoaded({
      includeIntegration: true,
      repositories: ["repo-main", "repo-library"],
      reverseAcceptedCandidateRepositories: true,
    });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "integration",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.implementation,
      integrationAttemptId: ids.integration,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source.comparisons.filter((comparison) => comparison.role === "integration-captured-input-to-candidate")).toHaveLength(4);
  });

  it("rejects Integration checkpoint sets that omit a prepared workspace repository on both sides", async () => {
    const loaded = makeLoaded({ includeIntegration: true, repositories: ["repo-main", "repo-library"], omitIntegrationRepository: "repo-library" });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "integration",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.implementation,
      integrationAttemptId: ids.integration,
    });

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_repository_set_incomplete" });
  });

  it("renders Integration from prepared lock bindings before the Activity has a completion record", async () => {
    const loaded = makeLoaded({ includeIntegration: true, integrationCompleted: false });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "integration",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.implementation,
      integrationAttemptId: ids.integration,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source.comparisons.filter((comparison) => comparison.role === "integration-captured-input-to-candidate")).toHaveLength(2);
    expect(result.source.sourceAttempts.some((attempt) => attempt.activity === "code-integration")).toBe(true);
  });

  it("uses the original Review baseline and includes retained source applicability and Integration history", async () => {
    const loaded = makeLoaded({ includeIntegration: true, includeUnitReview: true });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "unit-review",
      unitId,
      implementationAttemptId: ids.implementation,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    const review = result.source.comparisons.find((comparison) => comparison.role === "unit-review-original-baseline-to-completion");
    expect(review).toMatchObject({ repositoryId, base: { commit: checkpoint("a") }, target: { commit: checkpoint("e") } });
    expect(result.source.retainedScopes).toHaveLength(1);
    expect(result.source.retainedScopes[0]?.data).toMatchObject({ stage_attempt_id: ids.implementation });
    expect(result.source.comparisons.some((comparison) => comparison.role === "retained-scope-original-admission-to-output")).toBe(true);
    const integrationHistoryIds = result.source.integrationHistory.map((event) => String(event.id));
    expect(integrationHistoryIds).toEqual(expect.arrayContaining(["90000000-0000-4000-8000-000000000031", "90000000-0000-4000-8000-000000000040"]));
    expect(result.source.activityEvidence.map((event) => String(event.data.evidence_id))).toContain(ids.priorIntegrationEvidence);
    expect(result.source.sourceAttempts.filter((attempt) => attempt.activity === "code-integration").map((attempt) => attempt.attemptId)).toEqual([ids.priorIntegration, ids.integration]);
    const historicalCandidates = result.source.comparisons.filter((comparison) => comparison.role === "task-admission-to-integrated-candidate");
    expect(historicalCandidates.map((comparison) => comparison.target.commit)).toEqual([checkpoint("c"), checkpoint("d")]);
    expect(historicalCandidates.map((comparison) => "commit" in comparison.base ? comparison.base.commit : "no-commit")).toEqual([checkpoint("a"), checkpoint("a")]);
    const integrationComparisons = result.source.comparisons.filter((comparison) => comparison.role === "integration-captured-input-to-candidate");
    expect(integrationComparisons.map((comparison) => comparison.target.commit)).toEqual([checkpoint("c"), checkpoint("d")]);
    expect(integrationComparisons.map((comparison) => "commit" in comparison.base ? comparison.base.commit : "no-commit")).toEqual([checkpoint("b"), checkpoint("c")]);
    expect(result.source.sourceRecords.filter((event) => event.type === "construction.task-completed")).toHaveLength(2);
  });

  it("excludes task completions from implementation attempts after the selected historical review", async () => {
    const loaded = makeLoaded({ includeIntegration: true, includeUnitReview: true, includeEarlierReviewCompletion: true });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "unit-review",
      unitId,
      implementationAttemptId: ids.oldImplementation,
    });

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source.comparisons.find((comparison) => comparison.role === "unit-review-original-baseline-to-completion"))
      .toMatchObject({ target: { commit: checkpoint("c") } });
    expect(result.source.sourceAttempts.filter((attempt) => attempt.activity === "code-integration").map((attempt) => attempt.attemptId))
      .toEqual([ids.priorIntegration]);
    expect(result.source.sourceRecords.filter((event) => event.type === "construction.task-completed").map((event) => String(event.id)))
      .toEqual(["90000000-0000-4000-8000-000000000041"]);
    expect(result.source.integrationHistory.map((event) => String(event.id)))
      .toEqual(expect.arrayContaining(["90000000-0000-4000-8000-000000000031", "90000000-0000-4000-8000-000000000040"]));
    expect(result.source.integrationHistory.map((event) => String(event.id))).not.toContain("90000000-0000-4000-8000-000000000032");
    expect(result.source.integrationHistory.map((event) => String(event.id))).not.toContain("90000000-0000-4000-8000-000000000033");
    expect(result.source.comparisons.filter((comparison) => comparison.role === "integration-captured-input-to-candidate").map((comparison) => comparison.target.commit))
      .toEqual([checkpoint("c")]);
  });

  it("rejects a source attempt from another task or parent instead of substituting another attempt", async () => {
    const loaded = makeLoaded({ generationAttempt: "40000000-0000-4000-8000-000000000099" });
    const sources = new ConstructionDiffPackageSources({ readUnit: async () => loaded });
    const result = await sources.resolve({
      kind: "validation",
      unitId,
      taskId: ids.task,
      implementationAttemptId: ids.oldImplementation,
      generationAttemptId: ids.generation,
    });

    expect(result).toMatchObject({ kind: "failed", code: "diff_package_generation_attempt_mismatch" });
  });
});
