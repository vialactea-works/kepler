import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE, validateConstructionEvent } from "../../../../packages/cli/src/construction/events.js";
import { missionWorkspaceKey } from "../../../../packages/cli/src/construction/mission-workspace.js";
import type { E2EResources } from "../../resources.js";

export interface DiffPackageFixture {
  readonly missionId: string;
  readonly unitId: string;
  readonly taskId: string;
  readonly implementationAttemptId: string;
  readonly generationAttemptId: string;
  readonly integrationAttemptId: string;
  readonly generationEvidenceId: string;
  readonly validationEvidenceId: string;
  readonly generationCompletionEventId: string;
  readonly historyPath: string;
  readonly base: string;
  readonly generation: string;
  readonly candidate: string;
  readonly final: string;
}

const event = (
  journalId: string,
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[] = [],
) => ({
  id: randomUUID(),
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId,
  recorded_at: "2026-10-23T10:00:00.000Z",
  producer: { name: "kepler-e2e", version: "0.10.3" },
  caused_by: [...causedBy],
  data,
});

export const createDiffPackageHistory = async (
  resources: E2EResources,
): Promise<DiffPackageFixture> => {
  const repository = resources.repositoryDirectory;
  const missionId = randomUUID();
  const unitId = "2026-10-23-diff-package-e2e";
  const taskId = randomUUID();
  const implementationAttemptId = randomUUID();
  const generationAttemptId = randomUUID();
  const integrationAttemptId = randomUUID();
  const generationEvidenceId = randomUUID();
  const generationEvidenceIds = [generationEvidenceId, randomUUID(), randomUUID()];
  const validationAttemptId = randomUUID();
  const validationEvidenceId = randomUUID();
  const validationEvidenceIds = [validationEvidenceId, randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const integrationCheckIds = [randomUUID(), randomUUID(), randomUUID()];
  const integrationSelfReviewEvidenceId = randomUUID();
  const implementationSelfReviewEvidenceId = randomUUID();
  const implementationHandoffEvidenceId = randomUUID();
  const unitCheckEvidenceId = randomUUID();
  const journalId = randomUUID();
  const base = resources.runGit(repository, "rev-parse", "HEAD");
  await Fs.mkdir(Path.join(repository, "src"), { recursive: true });
  await Fs.writeFile(Path.join(repository, "src", "output.txt"), "Generated task output\n", "utf8");
  resources.runGit(repository, "add", "src/output.txt");
  resources.runGit(repository, "commit", "-q", "-m", "Record generated task output");
  const generation = resources.runGit(repository, "rev-parse", "HEAD");
  await Fs.writeFile(Path.join(repository, "src", "integration.txt"), "Integrated candidate\n", "utf8");
  await Fs.writeFile(Path.join(repository, "plan.md"), "# E2E plan\n", "utf8");
  await Fs.writeFile(Path.join(repository, "tasks-dag.json"), "{\"tasks\": []}\n", "utf8");
  resources.runGit(repository, "add", "src/integration.txt", "plan.md", "tasks-dag.json");
  resources.runGit(repository, "commit", "-q", "-m", "Record Integration candidate");
  const candidate = resources.runGit(repository, "rev-parse", "HEAD");
  const final = candidate;
  const repositoryPath = await Fs.realpath(repository);
  const commonDirectory = await Fs.realpath(resources.runGit(repository, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const workspaceId = missionWorkspaceKey(commonDirectory, repositoryPath);
  const workspace = {
    repository_id: "repo-main",
    context: { kind: "existing" },
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: base },
  };
  const missionCreated = event(journalId, "construction.mission-created", {
    mission_id: missionId,
    title: "Diff package E2E",
    request: "Render fixed source-bound comparisons",
    workflow: "standard",
    record_home: { repository_id: "repo-main" },
    contexts: [],
    repositories: [{
      repository_id: "repo-main",
      context: { kind: "existing" },
      branch: { kind: "current" },
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: base },
    }],
  });
  const workspacesPrepared = event(journalId, "construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [workspace],
  }, [missionCreated.id]);
  const unitCreated = event(journalId, "construction.unit-created", {
    mission_id: missionId,
    unit_id: unitId,
    directory: `.kepler/units-of-work/${unitId}`,
    workflow: "standard",
    initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" },
  }, [missionCreated.id]);
  const baselineSelected = event(journalId, "construction.unit-baseline-selected", {
    mission_id: missionId,
    unit_id: unitId,
    review_baseline: [{ repository_id: "repo-main", commit: base }],
    integration_targets: [{ repository_id: "repo-main", target: "refs/heads/main" }],
  }, [unitCreated.id]);
  const implementationStarted = event(journalId, "construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    inputs: [],
    checkpoints: [{ repository_id: "repo-main", commit: base }],
    authority_event_ids: [],
  }, [baselineSelected.id]);
  const graphId = randomUUID();
  const taskAdmitted = event(journalId, "construction.task-admitted", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    graph_ref: { graph_id: graphId, content_version: "sha256:diff-package-graph" },
    task_definition_ref: { graph_id: graphId, task_id: taskId, content_version: "sha256:diff-package-task" },
    task_contract: {
      outputs: ["src/output.txt"],
      acceptance_criteria: ["The generated task output is recorded."],
      dependency_task_ids: [],
      implementation_prerequisites: [],
    },
    admission_baseline: [{ repository_id: "repo-main", commit: base }],
    predecessor_provenance: [],
    prerequisite_evidence: [],
  }, [implementationStarted.id, baselineSelected.id]);
  const generationStarted = event(journalId, "construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    inputs: [{ reference: "task:definition", purpose: "Generate the admitted task output" }],
    checkpoints: [{ repository_id: "repo-main", commit: base }],
  }, [implementationStarted.id, taskAdmitted.id]);
  const generationEvidenceChecks = [
    "code-generation-typecheck",
    "code-generation-related-tests",
    "code-generation-self-review",
  ] as const;
  const generationEvidenceEvents = generationEvidenceChecks.map((check, index) => event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    evidence_id: generationEvidenceIds[index],
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
    inputs: [{ reference: "task:definition", purpose: "Generate the admitted task output" }],
    check,
    worker_context_id: `${generationAttemptId}:worker`,
    executor: "e2e fixture",
    result: { status: "passed", summary: `${check} evidence recorded` },
    output_refs: ["src/output.txt"],
    conditions: [],
  }, [generationStarted.id]));
  const generationCompleted = event(journalId, "construction.activity-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-generation",
    activity_attempt_id: generationAttemptId,
    evidence_ids: generationEvidenceIds,
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
  }, [generationStarted.id, ...generationEvidenceEvents.map((evidence) => evidence.id)]);
  const validationStarted = event(journalId, "construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    inputs: [{ reference: "src/output.txt", purpose: "Validate the generated task output" }],
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
  }, [implementationStarted.id, taskAdmitted.id, generationCompleted.id]);
  const validationEvidenceChecks = [
    "code-validation-typecheck",
    "code-validation-build",
    "code-validation-full-test-suite",
    "code-validation-independent-review",
    "code-validation-self-review",
  ] as const;
  const validationEvidenceEvents = validationEvidenceChecks.map((check, index) => event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    evidence_id: validationEvidenceIds[index],
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
    inputs: [{ reference: "src/output.txt", purpose: "Validate the generated task output" }],
    check,
    worker_context_id: check === "code-validation-independent-review"
      ? `${validationAttemptId}:reviewer`
      : `${validationAttemptId}:worker`,
    executor: "e2e fixture",
    result: { status: "passed", summary: `${check} evidence recorded` },
    output_refs: ["src/output.txt"],
    conditions: [],
  }, [validationStarted.id]));
  const validationCompleted = event(journalId, "construction.activity-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-validation",
    activity_attempt_id: validationAttemptId,
    evidence_ids: validationEvidenceIds,
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
  }, [validationStarted.id, ...validationEvidenceEvents.map((evidence) => evidence.id)]);
  const integrationStarted = event(journalId, "construction.activity-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    inputs: [{ reference: "plan:integration", purpose: "Prepare the task candidate" }],
    checkpoints: [{ repository_id: "repo-main", commit: generation }],
  }, [implementationStarted.id, taskAdmitted.id, validationCompleted.id]);
  const integrationPrepared = event(journalId, "construction.integration-prepared", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    captured_inputs: [{ repository_id: "repo-main", commit: generation }],
    candidate_checkpoints: [{ repository_id: "repo-main", commit: candidate }],
    task_output_refs: ["src/output.txt"],
    source_evidence_ids: validationEvidenceIds,
    inputs: [{ reference: "plan:integration", purpose: "Prepare the task candidate" }],
  }, [integrationStarted.id, taskAdmitted.id, validationCompleted.id, ...validationEvidenceEvents.map((evidence) => evidence.id)]);
  const integrationCheckNames = [
    "code-integration-typecheck",
    "code-integration-build",
    "code-integration-full-test-suite",
  ] as const;
  const integrationChecks = integrationCheckNames.map((check, index) => event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    evidence_id: integrationCheckIds[index],
    check_command: { repository_id: "repo-main", executable: "bun", argv: ["run", check] },
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: candidate }],
    inputs: [{ reference: "plan:integration", purpose: "Prepare the task candidate" }],
    check,
    executor: "e2e fixture",
    result: { status: "passed", summary: `${check} evidence recorded` },
    output_refs: ["src/output.txt"],
    conditions: [],
  }, [integrationPrepared.id]));
  const integrationSelfReview = event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    evidence_id: integrationSelfReviewEvidenceId,
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: candidate }],
    inputs: [{ reference: "plan:integration", purpose: "Prepare the task candidate" }],
    check: "code-integration-self-review",
    executor: "e2e fixture",
    result: { status: "passed", summary: "The Integration candidate matches its recorded bindings." },
    output_refs: ["src/output.txt"],
    conditions: ["Integration bindings match the accepted candidate and actual inputs.", "The generated task output is recorded."],
  }, [integrationPrepared.id]);
  const integrationAccepted = event(journalId, "construction.integration-accepted", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    prepared_event_id: integrationPrepared.id,
    candidate_checkpoints: [{ repository_id: "repo-main", commit: candidate }],
    repository_results: [{ repository_id: "repo-main", evidence_ids: integrationCheckIds }],
    authority_event_ids: [integrationSelfReview.id],
  }, [integrationPrepared.id, ...integrationChecks.map((check) => check.id), integrationSelfReview.id]);
  const integrationCompletionEvidenceIds = [...integrationCheckIds, integrationSelfReviewEvidenceId];
  const integrationCompleted = event(journalId, "construction.activity-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    activity: "code-integration",
    activity_attempt_id: integrationAttemptId,
    evidence_ids: integrationCompletionEvidenceIds,
    checkpoints: [{ repository_id: "repo-main", commit: candidate }],
  }, [integrationStarted.id, integrationAccepted.id, ...integrationChecks.map((check) => check.id), integrationSelfReview.id]);
  const taskCompleted = event(journalId, "construction.task-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    task_id: taskId,
    integration_event_id: integrationAccepted.id,
    conditions: ["The generated task output is recorded."],
  }, [taskAdmitted.id, integrationAccepted.id, integrationCompleted.id]);
  const implementationSelfReview = event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    evidence_id: implementationSelfReviewEvidenceId,
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: final }],
    inputs: [],
    check: "implementation-self-review",
    executor: "e2e fixture",
    result: { status: "passed", summary: "The Implementation result is ready for review." },
    output_refs: ["assessment:implementation-self-review"],
    conditions: [],
  }, [implementationStarted.id, taskCompleted.id]);
  const implementationHandoff = event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    evidence_id: implementationHandoffEvidenceId,
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: final }],
    inputs: [],
    check: "implementation-review-handoff",
    executor: "e2e fixture",
    result: { status: "passed", summary: "The Review handoff is complete." },
    output_refs: ["assessment:implementation-review-handoff"],
    conditions: [],
  }, [implementationStarted.id, taskCompleted.id]);
  const unitCheck = event(journalId, "construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    evidence_id: unitCheckEvidenceId,
    artifact_bindings: [],
    checkpoints: [{ repository_id: "repo-main", commit: final }],
    inputs: [],
    check: "implementation-combined-result-check",
    executor: "e2e fixture",
    result: { status: "passed", summary: "The combined result check passed." },
    output_refs: ["assessment:implementation-combined-result-check"],
    conditions: [],
  }, [implementationStarted.id, taskCompleted.id]);
  const activityEvidenceIds = [...generationEvidenceIds, ...validationEvidenceIds, ...integrationCompletionEvidenceIds];
  const implementationCompletion = event(journalId, "construction.implementation-completion-assessed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "implementation",
    stage_attempt_id: implementationAttemptId,
    final_checkpoints: [{ repository_id: "repo-main", commit: final }],
    artifact_paths: ["plan.md"],
    task_graph_path: "tasks-dag.json",
    graph_ref: { graph_id: graphId, content_version: "sha256:diff-package-graph" },
    task_ids: [taskId],
    reviewed_material_bindings: [],
    self_review_evidence_id: implementationSelfReviewEvidenceId,
    handoff_evidence_id: implementationHandoffEvidenceId,
    unit_check_evidence_ids: [unitCheckEvidenceId],
    required_check_evidence_ids: [...activityEvidenceIds, unitCheckEvidenceId],
    integration_event_ids: [integrationAccepted.id],
    retained_assessment_event_ids: [],
    additional_review: { requested: false },
    blocking_findings: [],
    handoff_assessment: { status: "ready", reason: "The unit is ready for review.", recipient: "unit-of-work-review", artifacts: ["plan.md", "tasks-dag.json"] },
  }, [implementationStarted.id, taskCompleted.id, integrationAccepted.id,
    ...generationEvidenceEvents.map((evidence) => evidence.id), ...validationEvidenceEvents.map((evidence) => evidence.id),
    ...integrationChecks.map((check) => check.id), integrationSelfReview.id, implementationSelfReview.id, implementationHandoff.id, unitCheck.id]);
  const events = [
    missionCreated,
    workspacesPrepared,
    unitCreated,
    baselineSelected,
    implementationStarted,
    taskAdmitted,
    generationStarted,
    ...generationEvidenceEvents,
    generationCompleted,
    validationStarted,
    ...validationEvidenceEvents,
    validationCompleted,
    integrationStarted,
    integrationPrepared,
    ...integrationChecks,
    integrationSelfReview,
    integrationAccepted,
    integrationCompleted,
    taskCompleted,
    implementationSelfReview,
    implementationHandoff,
    unitCheck,
    implementationCompletion,
  ];
  for (const entry of events) {
    const validation = validateConstructionEvent(entry);
    if (validation.status !== "valid") throw new Error(`Invalid diff-package E2E event ${entry.type}: ${JSON.stringify(validation)}`);
  }
  const historyDirectory = Path.join(repository, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
  await Fs.mkdir(Path.join(repository, ".kepler", "units-of-work", unitId), { recursive: true });
  await Fs.mkdir(historyDirectory, { recursive: true });
  const historyPath = Path.join(historyDirectory, `${journalId}.jsonl`);
  await Fs.writeFile(historyPath, `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces");
  await Fs.mkdir(attachmentDirectory, { recursive: true });
  await Fs.writeFile(Path.join(attachmentDirectory, `${workspaceId}.json`), `${JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: "repo-main",
    repository_id: "repo-main",
    workspace_id: workspaceId,
    workspace_path: repositoryPath,
    repository_path: repositoryPath,
    git_directory: commonDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: base },
  })}\n`, "utf8");
  return {
    missionId,
    unitId,
    taskId,
    implementationAttemptId,
    generationAttemptId,
    integrationAttemptId,
    generationEvidenceId,
    validationEvidenceId,
    generationCompletionEventId: generationCompleted.id,
    historyPath,
    base,
    generation,
    candidate,
    final,
  };
};
