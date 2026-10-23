import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditContextResolver, AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE, type ActivityAttemptId, type ConstructionEventRecord, type IntegrationInputCheckpoint, type RepositoryCheckpoint, type StageAttemptId, type TaskId } from "../../packages/cli/src/construction/events.js";
import { IntegrationExecution, createNodeIntegrationExecutionRuntime } from "../../packages/cli/src/construction/integration-execution.js";
import type { ConstructionActivityProjection, ConstructionHistoryFact, ConstructionTaskProjection, ConstructionUnitProjection } from "../../packages/cli/src/construction/projection.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { ConstructionQueries, TaskExecutionContext } from "../../packages/cli/src/construction/scoped-queries.js";

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
const verification = [
  { scope: "Integration typecheck", method: "Run typecheck with `repo-main: bun run typecheck`." },
  { scope: "Integration build", method: "Run build with `repo-main: bun run build`." },
  { scope: "Full test suite", method: "Run the full test suite with `repo-main: bun run test`." },
];
const planSource = `# Plan\n\n## Verification strategy\n\nTypecheck: \`repo-main: bun run typecheck\`\nBuild: \`repo-main: bun run build\`\nFull test suite: \`repo-main: bun run test\`\n`;

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

const setup = async () => {
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
    }],
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
    result: { status: "passed", summary: "Validation evidence is current" },
    output_refs: [taskOutput],
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
  const allEvents = [missionCreated, workspacesPrepared, stageStarted, admission, generationStarted, ...generationEvidence,
    generationCompleted, validationStarted, ...validationEvidence, validationCompleted, integrationStarted];
  const loaded = {
    kind: "loaded",
    root,
    missionId,
    history: { events: allEvents.map((event) => ({ event })) },
    projection: { missionId, blocked: false, projectionIssues: [], units: [unit] },
    unit,
  } as unknown as Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>;
  const taskDefinition = {
    id: taskId,
    outputs: [taskOutput],
    verification,
    acceptance_criteria: ["The Integration candidate preserves the declared task output."],
  };
  const executionContext = {
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
  const execution = (processId: number) => {
    const base = createNodeIntegrationExecutionRuntime({ name: "kepler-test", version: "0.10.3" });
    const runtime = {
      ...base,
      workspace: {
        ...base.workspace,
        identity: { machine_id: "integration-test-host", process_id: processId, process_incarnation_id: randomUUID() },
      },
    };
    return new IntegrationExecution(contexts, queries, runtime);
  };
  return { root, missionId, baseline, generated, diverged, commonDirectory, selectors, execution };
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("Construction Integration execution", () => {
  it("uses the durable common-directory lock across independent process owners", async () => {
    const fixture = await setup();
    const first = fixture.execution(41001);

    const acquired = await first.lock(fixture.selectors);
    expect(acquired.kind).toBe("success");
    if (acquired.kind !== "success") return;
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
