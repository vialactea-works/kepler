import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { EventJournal } from "../history/journal.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE, validateConstructionEvent, type ConstructionActivity, type ConstructionEventRecord, type EvidenceId, type MaterialInput, type RepositoryCheckpoint } from "./events.js";
import type { ConstructionHistoryFact, ConstructionTaskProjection } from "./projection.js";
import { ConstructionQueries, type TaskExecutionContext } from "./scoped-queries.js";
import { createNodeStageStartRuntime, type StageStartRuntime } from "./stage-start.js";
import { readImplementationPlanningCompletionRecord } from "./implementation-planning-completion.js";

export interface ActivityExecutionRuntime extends StageStartRuntime {
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export interface ActivityCompletionRequest {
  readonly evidence_ids: readonly string[];
}

export type ActivityExecutionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isCheckpoints = (value: unknown): value is readonly RepositoryCheckpoint[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && nonEmpty(item.repository_id) && nonEmpty(item.commit)) &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const checkpointKey = (value: readonly RepositoryCheckpoint[]): string => JSON.stringify(
  value.slice().sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
);
const sameStringSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length &&
  [...left].sort().join("\0") === [...right].sort().join("\0");
const sameInputs = (left: unknown, right: readonly MaterialInput[]): boolean =>
  Array.isArray(left) && left.every((item) => isRecord(item) && nonEmpty(item.reference) && nonEmpty(item.purpose)) &&
  JSON.stringify([...left].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) ===
  JSON.stringify([...right].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported Activity scope or evidence condition and retry without discarding recorded work.",
): ActivityExecutionResult => ({ kind: "failed", code, message, details, recovery });
const propagate = (result: Extract<AuditHistoryReadResult, { readonly kind: "failed" }>): ActivityExecutionResult =>
  failure(result.code, result.message, result.details, result.recovery);

export const validateActivityCompletionRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: ActivityCompletionRequest }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "evidence_ids") ||
      !Array.isArray(value.evidence_ids) || !value.evidence_ids.every(uuidV4) ||
      new Set(value.evidence_ids).size !== value.evidence_ids.length) {
    return { kind: "invalid", issues: [{ pointer: "/evidence_ids", message: "Expected a unique array of evidence UUIDs and no unknown fields." }] };
  }
  return { kind: "valid", request: { evidence_ids: value.evidence_ids as string[] } };
};

const currentParentStart = (unit: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>["unit"], attemptId: string): ConstructionHistoryFact | undefined => {
  const stage = unit.stages.find((item) => item.stage === "implementation");
  const attempt = stage?.attempts.find((item) => item.attemptId === attemptId && item.state === "running");
  if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt) return undefined;
  return attempt.facts.filter((fact) => fact.event.type === "construction.stage-attempt-started" || fact.event.type === "construction.stage-resumed").at(-1);
};

const planningGraphRef = (unit: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>["unit"]) => {
  const stage = unit.stages.find((item) => item.stage === "implementation-planning");
  if (!stage || stage.state !== "completed" || !stage.currentAttemptId) return undefined;
  const attempt = stage.attempts.find((item) => item.attemptId === stage.currentAttemptId && item.state === "completed");
  const completion = attempt?.facts.find((fact) => fact.event.type === "construction.stage-attempt-completed");
  if (!completion || completion.event.type !== "construction.stage-attempt-completed") return undefined;
  return readImplementationPlanningCompletionRecord(completion.event.data.implementation_planning_assessment)?.graph_ref;
};

const latestCompleted = (
  task: ConstructionTaskProjection,
  activity: ConstructionActivity,
  stageAttemptId: string,
): ConstructionHistoryFact | undefined => {
  const projection = task.activities.find((item) => item.activity === activity);
  if (!projection || projection.state !== "completed" || !projection.currentAttemptId) return undefined;
  const attempts = projection.attempts.filter((attempt) => attempt.attemptId === projection.currentAttemptId &&
    attempt.stageAttemptId === stageAttemptId && attempt.state === "completed");
  const completions = attempts.flatMap((attempt) => attempt.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed"));
  return completions.length === 1 ? completions[0] : undefined;
};

const admissionFact = (task: ConstructionTaskProjection, stageAttemptId: string): ConstructionHistoryFact | undefined => {
  const matches = task.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
    fact.event.data.stage_attempt_id === stageAttemptId);
  return matches.length === 1 ? matches[0] : undefined;
};

const taskInputs = (
  execution: TaskExecutionContext,
  unit: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>["unit"],
  task: ConstructionTaskProjection,
  parentAttemptId: string,
): readonly MaterialInput[] => {
  const inputs: MaterialInput[] = [...execution.task.inputs];
  const admission = admissionFact(task, parentAttemptId);
  if (admission?.event.type === "construction.task-admitted" && Array.isArray(admission.event.data.predecessor_provenance)) {
    for (const predecessor of admission.event.data.predecessor_provenance) {
      if (!isRecord(predecessor) || typeof predecessor.task_id !== "string" || typeof predecessor.integration_event_id !== "string") continue;
      const definition = execution.graph.tasks.find((candidate) => candidate.id === predecessor.task_id);
      const projection = unit.tasks.find((candidate) => candidate.taskId === predecessor.task_id);
      const acceptance = projection?.activities.find((item) => item.activity === "code-integration")?.accepted
        .find((fact) => fact.event.id === predecessor.integration_event_id && fact.event.type === "construction.integration-accepted");
      if (!definition || !acceptance) continue;
      for (const output of definition.outputs) inputs.push({
        reference: `task-output:${predecessor.task_id}:${output}`,
        purpose: `Accepted Integration output from predecessor ${predecessor.task_id}`,
      });
      inputs.push({ reference: predecessor.integration_event_id, purpose: `Accepted Integration provenance for predecessor ${predecessor.task_id}` });
    }
  }
  const unique = new Map<string, MaterialInput>();
  for (const input of inputs) unique.set(`${input.reference}\0${input.purpose}`, input);
  return [...unique.values()].sort((left, right) => left.reference.localeCompare(right.reference) || left.purpose.localeCompare(right.purpose));
};

const commonDirectory = async (runtime: ActivityExecutionRuntime, root: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(root, result.stdout.trim())); }
  catch { return undefined; }
};

const activityName = (value: string | undefined): value is ConstructionActivity =>
  value === "code-generation" || value === "code-validation" || value === "code-integration";

const requiredChecks = (activity: ConstructionActivity): readonly string[] => {
  if (activity === "code-generation") return ["code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review"];
  if (activity === "code-validation") return ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite", "code-validation-independent-review", "code-validation-self-review"];
  return ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite", "code-integration-self-review"];
};

const evidenceMatchesActivity = (
  fact: ConstructionHistoryFact | undefined,
  evidenceId: string,
  activity: ConstructionActivity,
  attemptId: string,
  parentAttemptId: string,
  taskId: string,
  expectedInputs: readonly MaterialInput[],
  start: ConstructionHistoryFact,
): fact is ConstructionHistoryFact => fact !== undefined && fact.event.type === "construction.evidence-recorded" &&
  fact.event.data.evidence_id === evidenceId && fact.event.data.stage === "implementation" &&
  fact.event.data.stage_attempt_id === parentAttemptId && fact.event.data.task_id === taskId &&
  fact.event.data.activity === activity && fact.event.data.activity_attempt_id === attemptId &&
  isRecord(fact.event.data.result) && fact.event.data.result.status === "passed" &&
  sameInputs(fact.event.data.inputs, expectedInputs) && fact.event.caused_by.some((cause) => String(cause) === String(start.event.id));

const selectedEvidence = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  ids: readonly string[],
  activity: ConstructionActivity,
  declaredOutputs: readonly string[],
  attemptId: string,
  parentAttemptId: string,
  taskId: string,
  inputs: readonly MaterialInput[],
  start: ConstructionHistoryFact,
): { readonly kind: "valid"; readonly facts: readonly ConstructionHistoryFact[]; readonly checkpoints: readonly RepositoryCheckpoint[] } | { readonly kind: "invalid"; readonly missing: readonly string[]; readonly invalid: readonly string[] } => {
  const matches = ids.map((id) => {
    const evidence = loaded.unit.evidence.map((item) => item.fact).filter((fact) =>
      fact.event.type === "construction.evidence-recorded" && fact.event.data.evidence_id === id);
    return evidence.length === 1 ? evidence[0] : undefined;
  });
  const invalid: string[] = [];
  const evidenceByCheck = new Map<string, ConstructionHistoryFact>();
  for (const [index, fact] of matches.entries()) {
    const evidenceId = ids[index]!;
    if (!evidenceMatchesActivity(fact, evidenceId, activity, attemptId, parentAttemptId, taskId, inputs, start)) {
      invalid.push(evidenceId);
      continue;
    }
    const check = fact.event.data.check;
    if (typeof check !== "string" || evidenceByCheck.has(check)) invalid.push(evidenceId);
    else evidenceByCheck.set(check, fact);
  }
  const missing = requiredChecks(activity).filter((check) => !evidenceByCheck.has(check));
  if ([...evidenceByCheck.keys()].some((check) => !requiredChecks(activity).includes(check))) invalid.push("unexpected-check");
  const checkpointSets = [...evidenceByCheck.values()].map((fact) => fact.event.type === "construction.evidence-recorded" &&
    isCheckpoints(fact.event.data.checkpoints) ? fact.event.data.checkpoints : undefined);
  const checkpoints = checkpointSets[0];
  if (!checkpoints || checkpoints.length === 0 || checkpointSets.some((set) => !set || checkpointKey(set) !== checkpointKey(checkpoints))) invalid.push("checkpoint-binding");
  if ([...evidenceByCheck.values()].some((fact) => !sameInputs(fact.event.data.inputs, inputs))) invalid.push("input-binding");
  if (activity !== "code-integration") {
    const coveredOutputs = new Set([...evidenceByCheck.values()].flatMap((fact) =>
      Array.isArray(fact.event.data.output_refs) ? fact.event.data.output_refs.filter((value): value is string => typeof value === "string") : []));
    const missingOutputs = declaredOutputs.filter((output) => !coveredOutputs.has(output));
    if (missingOutputs.length > 0) missing.push(...missingOutputs.map((output) => `output:${output}`));
  }
  return missing.length > 0 || invalid.length > 0 || !checkpoints
    ? { kind: "invalid", missing: [...new Set(missing)], invalid: [...new Set(invalid)] }
    : { kind: "valid", facts: [...evidenceByCheck.values()], checkpoints: [...checkpoints].sort((left, right) => left.repository_id.localeCompare(right.repository_id)) };
};

export class ActivityExecution {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly queries: ConstructionQueries,
    private readonly runtime: ActivityExecutionRuntime,
  ) {}

  async start(selectors: ScopeSelectors, project?: string): Promise<ActivityExecutionResult> {
    if (!selectors.unit || !selectors.task || !activityName(selectors.activity) || !selectors.implementationAttempt ||
        selectors.stage !== undefined || selectors.attempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_activity_scope", "Activity start requires exact --unit, --task, --activity, and --implementation-attempt selectors.", {
        unit_id: selectors.unit, task_id: selectors.task, activity: selectors.activity, implementation_attempt_id: selectors.implementationAttempt,
      });
    }
    return this.withLock(selectors, project, "start", async (loaded, execution) => {
      const unit = loaded.unit;
      const parentAttemptId = selectors.implementationAttempt!;
      const parentStart = currentParentStart(unit, parentAttemptId);
      const task = unit.tasks.find((item) => item.taskId === selectors.task);
      const admission = task && admissionFact(task, parentAttemptId);
      if (!parentStart || !task || !admission || task.state === "complete" || task.state === "unknown") {
        return failure("activity_task_not_admitted", "Activity start requires a current admitted task under the running Implementation attempt.", {
          task_id: selectors.task, implementation_attempt_id: parentAttemptId, task_state: task?.state,
        });
      }
      if (unit.workflow !== "standard" || unit.blocked) return failure("activity_history_blocked", "Activity start requires an unblocked Standard Construction history.", {
        history_issues: unit.historyIssues, projection_issues: unit.projectionIssues,
      });
      const acceptedGraph = planningGraphRef(unit);
      if (!acceptedGraph || acceptedGraph.graph_id !== execution.graphRef.graph_id || acceptedGraph.content_version !== execution.graphRef.content_version) {
        return failure("task_graph_version_stale", "The current task graph differs from accepted Implementation Planning.", { accepted_graph_ref: acceptedGraph, current_graph_ref: execution.graphRef });
      }
      const currentAdmission = task.admission?.event.id === admission.event.id && admission.event.type === "construction.task-admitted";
      if (!currentAdmission) return failure("activity_task_admission_stale", "The task admission is not the current admitted scope.", { task_id: task.taskId });
      const activity = selectors.activity!;
      const currentActivity = task.activities.find((item) => item.activity === activity);
      if (!currentActivity || ["running", "waiting", "pausing", "paused"].includes(currentActivity.state)) {
        return failure("activity_attempt_already_active", "The selected Activity already has an active attempt.", {
          activity, state: currentActivity?.state, attempt_id: currentActivity?.currentAttemptId,
        });
      }
      if (currentActivity.state === "completed") return failure("activity_already_completed", "A completed Activity requires a revision before it can be reopened.", { activity });
      const previousActivity = activity === "code-validation" ? "code-generation" : activity === "code-integration" ? "code-validation" : undefined;
      const previous = previousActivity ? latestCompleted(task, previousActivity, parentAttemptId) : undefined;
      if (previousActivity && !previous) return failure("activity_route_blocked", "The preceding Activity must complete with current evidence before this Activity can start.", {
        activity, required_previous_activity: previousActivity,
      });
      if (activity === "code-integration" && !latestCompleted(task, "code-generation", parentAttemptId)) {
        return failure("activity_route_blocked", "Code Integration requires current Code Generation outputs through Code Validation.", {
          activity, required_previous_activity: "code-generation",
        });
      }
      const inputs = taskInputs(execution, unit, task, parentAttemptId);
      let checkpoints: readonly RepositoryCheckpoint[];
      if (previous && previous.event.type === "construction.activity-attempt-completed" && isCheckpoints(previous.event.data.checkpoints)) {
        checkpoints = previous.event.data.checkpoints;
      } else if (admission.event.type === "construction.task-admitted" && isCheckpoints(admission.event.data.admission_baseline)) {
        checkpoints = admission.event.data.admission_baseline;
      } else {
        return failure("activity_input_checkpoints_unknown", "The current task's fixed admission baseline is unavailable.", { task_id: task.taskId });
      }
      const attemptId = this.runtime.identities.next();
      const eventId = this.runtime.identities.next();
      const journalId = this.runtime.identities.next();
      if (![attemptId, eventId, journalId].every(uuidV4) || new Set([attemptId, eventId, journalId]).size !== 3) {
        return failure("activity_identity_invalid", "Activity attempt or event identities are invalid or reused.");
      }
      const event = {
        id: eventId,
        phase: CONSTRUCTION_PHASE,
        type: "construction.activity-attempt-started",
        envelope_version: 1,
        event_version: CONSTRUCTION_EVENT_VERSION,
        journal_id: journalId,
        recorded_at: this.runtime.now(),
        producer: this.runtime.producer,
        caused_by: [parentStart.event.id, admission.event.id, ...(previous ? [previous.event.id] : [])],
        data: {
          mission_id: loaded.missionId,
          unit_id: unit.unitId,
          stage: "implementation",
          stage_attempt_id: parentAttemptId,
          task_id: task.taskId,
          activity,
          activity_attempt_id: attemptId,
          inputs,
          checkpoints,
        },
      };
      const validation = validateConstructionEvent(event);
      if (validation.status !== "valid") return failure("activity_start_event_invalid", "The typed Activity start event failed Construction validation.", {
        issues: validation.status === "invalid" ? validation.issues : [validation.reason],
      });
      const append = await this.append(loaded.root, loaded.missionId, validation.event);
      if (append.kind === "failed") return append;
      return { kind: "success", data: { activity_attempt_id: attemptId, event_id: validation.event.id, journal_id: validation.event.journal_id, mission_id: loaded.missionId, unit_id: unit.unitId, task_id: task.taskId, activity, implementation_attempt_id: parentAttemptId, inputs, checkpoints, worker_dispatched: false } };
    });
  }

  async complete(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<ActivityExecutionResult> {
    if (!selectors.unit || !selectors.task || !activityName(selectors.activity) || !selectors.implementationAttempt || !selectors.attempt ||
        selectors.stage !== undefined || selectors.mission !== undefined) {
      return failure("invalid_activity_scope", "Activity completion requires exact --unit, --task, --activity, --implementation-attempt, and --attempt selectors.", {
        unit_id: selectors.unit, task_id: selectors.task, activity: selectors.activity, implementation_attempt_id: selectors.implementationAttempt, attempt_id: selectors.attempt,
      });
    }
    const parsed = validateActivityCompletionRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_activity_completion_request", "The Activity completion request failed validation.", { issues: parsed.issues });
    return this.withLock(selectors, project, "complete", async (loaded, execution) => {
      const { unit } = loaded;
      const parentAttemptId = selectors.implementationAttempt!;
      const task = unit.tasks.find((item) => item.taskId === selectors.task);
      const activityProjection = task?.activities.find((item) => item.activity === selectors.activity);
      const attempt = activityProjection?.attempts.find((item) => item.attemptId === selectors.attempt && item.stageAttemptId === parentAttemptId);
      const start = attempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-started").at(-1);
      const parentStart = currentParentStart(unit, parentAttemptId);
      const admission = task && admissionFact(task, parentAttemptId);
      if (!task || !attempt || attempt.state !== "running" || !start || !parentStart || !admission ||
          start.event.type !== "construction.activity-attempt-started") {
        return failure("activity_attempt_not_current", "Activity completion requires the exact running Activity attempt and current admitted task scope.", {
          task_id: selectors.task, activity: selectors.activity, attempt_id: selectors.attempt, implementation_attempt_id: parentAttemptId,
        });
      }
      if (!planningGraphRef(unit) || planningGraphRef(unit)?.graph_id !== execution.graphRef.graph_id ||
          planningGraphRef(unit)?.content_version !== execution.graphRef.content_version) {
        return failure("task_graph_version_stale", "The current task graph differs from accepted Implementation Planning.", { graph_ref: execution.graphRef });
      }
      if (!activityProjection) return failure("activity_attempt_not_current", "The selected Activity occurrence is absent from the current task projection.");
      const inputs = Array.isArray(start.event.data.inputs) ? start.event.data.inputs as MaterialInput[] : [];
      const evidence = selectedEvidence(loaded, parsed.request.evidence_ids, selectors.activity!, execution.task.outputs, selectors.attempt!, parentAttemptId, task.taskId, inputs, start);
      if (selectors.activity === "code-integration") {
        const integrationAccepted = activityProjection.accepted.find((fact) => fact.event.type === "construction.integration-accepted" &&
          fact.event.data.activity_attempt_id === selectors.attempt && fact.event.data.stage_attempt_id === parentAttemptId);
        if (!integrationAccepted || integrationAccepted.event.type !== "construction.integration-accepted") {
          return failure("integration_acceptance_required", "Integration Activity completion requires an accepted checked Integration result for this exact occurrence.", {
            task_id: task.taskId, integration_attempt_id: selectors.attempt,
          });
        }
        const repositoryResults: { readonly evidence_ids: readonly unknown[] }[] =
          Array.isArray(integrationAccepted.event.data.repository_results)
            ? integrationAccepted.event.data.repository_results.flatMap((result) =>
              isRecord(result) && Array.isArray(result.evidence_ids) ? [{ evidence_ids: result.evidence_ids }] : [])
            : [];
        const integrationEvidenceIds = repositoryResults.flatMap((result) =>
          result.evidence_ids.filter((id: unknown): id is string => typeof id === "string"));
        const authorityEventIds = Array.isArray(integrationAccepted.event.data.authority_event_ids)
          ? integrationAccepted.event.data.authority_event_ids.filter((id): id is string => typeof id === "string")
          : [];
        const selfReviewEvidenceIds = authorityEventIds.flatMap((eventId) => {
          const fact = loaded.history.events.find((record) => record.event?.id === eventId)?.event;
          return fact?.type === "construction.evidence-recorded" && fact.data.activity === "code-integration" &&
            fact.data.activity_attempt_id === selectors.attempt && fact.data.check === "code-integration-self-review" &&
            typeof fact.data.evidence_id === "string"
            ? [fact.data.evidence_id]
            : [];
        });
        const integrationIds = [...integrationEvidenceIds, ...selfReviewEvidenceIds];
        if (parsed.request.evidence_ids.length > 0 && !sameStringSet(parsed.request.evidence_ids, integrationIds)) {
          return failure("integration_evidence_mismatch", "Integration completion evidence IDs must exactly match its accepted repository checks and self-review.", {
            expected_evidence_ids: integrationIds, supplied_evidence_ids: parsed.request.evidence_ids,
          });
        }
        const acceptedCheckpoints = integrationAccepted.event.data.candidate_checkpoints;
        if (!isCheckpoints(acceptedCheckpoints)) return failure("integration_candidate_invalid", "The accepted Integration candidate checkpoint set is invalid.");
        return this.recordCompletion(loaded, task, selectors.activity!, selectors.attempt!, parentAttemptId, start, parentStart, admission, integrationIds, acceptedCheckpoints, integrationAccepted, parsed.request.evidence_ids.length === 0 ? integrationIds : parsed.request.evidence_ids, execution.task.acceptance_criteria);
      }
      if (evidence.kind === "invalid") return failure("activity_evidence_incomplete", "The Activity lacks required passed, scope-bound evidence on one output checkpoint set.", {
        activity: selectors.activity, missing_checks: evidence.missing, invalid_evidence_ids: evidence.invalid,
      });
      if (selectors.activity === "code-validation") {
        const generation = latestCompleted(task, "code-generation", parentAttemptId);
        const generationExecutors = generation?.event.type === "construction.activity-attempt-completed"
          ? (Array.isArray(generation.event.data.evidence_ids) ? generation.event.data.evidence_ids : []).flatMap((id) => {
            const fact = loaded.unit.evidence.map((item) => item.fact).find((candidate) => candidate.event.type === "construction.evidence-recorded" && candidate.event.data.evidence_id === id);
            return fact?.event.type === "construction.evidence-recorded" ? [fact.event.data.executor] : [];
          })
          : [];
        const reviewer = evidence.facts.find((fact) => fact.event.type === "construction.evidence-recorded" && fact.event.data.check === "code-validation-independent-review");
        if (!reviewer || reviewer.event.type !== "construction.evidence-recorded" || generationExecutors.includes(reviewer.event.data.executor)) {
          return failure("independent_validation_reviewer_required", "Code Validation's independent reviewer must use a worker context distinct from Code Generation.", {
            generation_executors: generationExecutors,
            validation_reviewer: reviewer?.event.type === "construction.evidence-recorded" ? reviewer.event.data.executor : undefined,
          });
        }
        const generationOutput = generation?.event.type === "construction.activity-attempt-completed" ? generation.event.data.checkpoints : undefined;
        if (!isCheckpoints(generationOutput) || checkpointKey(generationOutput) !== checkpointKey(evidence.checkpoints)) {
          return failure("validation_output_changed", "Code Validation must verify the exact output checkpoint set produced by Code Generation.", {
            generation_checkpoints: generationOutput, validation_checkpoints: evidence.checkpoints,
          });
        }
      }
      return this.recordCompletion(loaded, task, selectors.activity!, selectors.attempt!, parentAttemptId, start, parentStart, admission, parsed.request.evidence_ids, evidence.checkpoints, undefined, parsed.request.evidence_ids);
    });
  }

  private async withLock(
    selectors: ScopeSelectors,
    project: string | undefined,
    operation: string,
    body: (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, execution: TaskExecutionContext) => Promise<ActivityExecutionResult>,
  ): Promise<ActivityExecutionResult> {
    const first = await this.contexts.readUnit(selectors.unit!, project);
    if (first.kind === "failed") return propagate(first);
    const commonDir = await commonDirectory(this.runtime, first.root);
    if (!commonDir) return failure("activity_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const resourceKey = createHash("sha256").update(JSON.stringify([first.missionId, selectors.unit, selectors.task, selectors.activity, selectors.implementationAttempt])).digest("hex");
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: first.missionId },
      resourceKey,
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: first.missionId,
        resource_scope: `construction/activity/${selectors.unit}/${selectors.task}/${selectors.activity}`,
        attempt_context: selectors.attempt ?? `${operation}:${selectors.implementationAttempt}`,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: ActivityExecutionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit!, project);
      if (loaded.kind === "failed") result = propagate(loaded);
      else if (loaded.root !== first.root || loaded.missionId !== first.missionId) result = failure("activity_scope_changed", "Unit membership changed while acquiring Activity coordination.");
      else {
        const execution = await this.queries.taskExecutionContext(selectors.unit!, selectors.task!, project);
        result = execution.kind === "failed" ? failure(execution.code, execution.message, execution.details, execution.recovery) : await body(loaded, execution);
      }
    } catch (error) {
      result = failure("activity_execution_failed", "Kepler could not validate the Activity operation safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return failure("activity_coordination_release_failed", "Kepler could not confirm release of the Activity coordination claim.", {
      ...released.details, operation_result: result.kind,
    }, released.recovery);
    return result;
  }

  private async append(root: string, missionId: string, event: ConstructionEventRecord): Promise<ActivityExecutionResult> {
    const journalPath = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${event.journal_id}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") {
      return failure("activity_journal_identity_conflict", "The selected Activity journal identity already has a filesystem entry.", { journal_id: event.journal_id });
    }
    try {
      await this.runtime.journals.create(root, missionId, event.journal_id).append(event);
    } catch (error) {
      return failure("activity_event_append_failed", "Kepler could not durably append the Activity event.", {
        event_id: event.id, journal_id: event.journal_id, message: error instanceof Error ? error.message : String(error),
      }, "Inspect the mission history for an appended or uncertain Activity event before retrying; preserve every record.");
    }
    return { kind: "success", data: { event_id: event.id, journal_id: event.journal_id } };
  }

  private async recordCompletion(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    task: ConstructionTaskProjection,
    activity: ConstructionActivity,
    activityAttemptId: string,
    stageAttemptId: string,
    start: ConstructionHistoryFact,
    parentStart: ConstructionHistoryFact,
    admission: ConstructionHistoryFact,
    evidenceIds: readonly string[],
    checkpoints: readonly RepositoryCheckpoint[],
    accepted?: ConstructionHistoryFact,
    completeEvidenceIds: readonly string[] = evidenceIds,
    acceptanceCriteria: readonly string[] = [],
  ): Promise<ActivityExecutionResult> {
    if (activity !== "code-integration") {
      const required = requiredChecks(activity);
      const selected = evidenceIds.flatMap((id) => loaded.unit.evidence.map((item) => item.fact).filter((fact) =>
        fact.event.type === "construction.evidence-recorded" && fact.event.data.evidence_id === id));
      const checks = new Set(selected.flatMap((fact) => fact.event.type === "construction.evidence-recorded" ? [fact.event.data.check] : []));
      if (required.some((check) => !checks.has(check))) return failure("activity_evidence_incomplete", "Required Activity evidence is missing before completion.", { required_checks: required, actual_checks: [...checks] });
      if (activity === "code-generation" && !task.facts.some((fact) => fact.event.type === "construction.task-admitted" && fact.event.data.task_id === task.taskId)) {
        return failure("activity_admission_missing", "The task definition is unavailable for the active scope.");
      }
    }
    const evidenceFacts = completeEvidenceIds.map((id) => loaded.unit.evidence.map((item) => item.fact).find((fact) =>
      fact.event.type === "construction.evidence-recorded" && fact.event.data.evidence_id === id));
    if (evidenceFacts.some((fact) => !fact || fact.event.type !== "construction.evidence-recorded")) {
      return failure("activity_evidence_missing", "One or more selected Activity evidence records are unavailable.");
    }
    const evidenceEvents = evidenceFacts.filter((fact): fact is ConstructionHistoryFact => fact !== undefined);
    const completionId = this.runtime.identities.next();
    const completionJournalId = this.runtime.identities.next();
    if (![completionId, completionJournalId].every(uuidV4) || new Set([completionId, completionJournalId]).size !== 2) {
      return failure("activity_identity_invalid", "Activity completion event identities are invalid or reused.");
    }
    const completionEvent = {
      id: completionId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.activity-attempt-completed",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: completionJournalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([start.event.id, parentStart.event.id, admission.event.id, ...(accepted ? [accepted.event.id] : []), ...evidenceEvents.map((fact) => fact.event.id)])],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage: "implementation",
        stage_attempt_id: stageAttemptId,
        task_id: task.taskId,
        activity,
        activity_attempt_id: activityAttemptId,
        evidence_ids: completeEvidenceIds as EvidenceId[],
        checkpoints,
      },
    };
    const completionValidation = validateConstructionEvent(completionEvent);
    if (completionValidation.status !== "valid") return failure("activity_completion_event_invalid", "The typed Activity completion event failed Construction validation.", {
      issues: completionValidation.status === "invalid" ? completionValidation.issues : [completionValidation.reason],
    });
    const completionPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${completionJournalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(completionPath) !== "missing") return failure("activity_journal_identity_conflict", "The selected Activity completion journal identity already has a filesystem entry.", { journal_id: completionJournalId });
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, completionJournalId).append(completionValidation.event);
    } catch (error) {
      return failure("activity_event_append_failed", "Kepler could not durably append the Activity completion.", {
        event_id: completionId, journal_id: completionJournalId, message: error instanceof Error ? error.message : String(error),
      }, "Inspect the mission history for an appended or uncertain completion before retrying; preserve every record.");
    }
    if (activity !== "code-integration" || !accepted || accepted.event.type !== "construction.integration-accepted") {
      return { kind: "success", data: { event_id: completionId, journal_id: completionJournalId, activity, activity_attempt_id: activityAttemptId, checkpoints } };
    }
    const existingTaskCompletion = task.completion?.event.type === "construction.task-completed" && task.completion.event.data.integration_event_id === accepted.event.id;
    if (existingTaskCompletion) return { kind: "success", data: { event_id: completionId, journal_id: completionJournalId, activity, activity_attempt_id: activityAttemptId, integration_event_id: accepted.event.id, task_completion_event_id: task.completion!.event.id, checkpoints } };
    const completedTaskId = this.runtime.identities.next();
    const taskCompletionJournalId = this.runtime.identities.next();
    if (![completedTaskId, taskCompletionJournalId].every(uuidV4) || new Set([completedTaskId, taskCompletionJournalId]).size !== 2) {
      return failure("task_completion_identity_invalid", "Task completion event identities are invalid or reused.", { activity_completion_event_id: completionId });
    }
    const taskCompletionEvent = {
      id: completedTaskId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.task-completed",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: taskCompletionJournalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [accepted.event.id, completionId, parentStart.event.id],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage: "implementation",
        stage_attempt_id: stageAttemptId,
        task_id: task.taskId,
        integration_event_id: accepted.event.id,
        conditions: acceptanceCriteria,
      },
    };
    const taskCompletionValidation = validateConstructionEvent(taskCompletionEvent);
    if (taskCompletionValidation.status !== "valid") return failure("task_completion_event_invalid", "The typed task completion event failed Construction validation.", {
      activity_completion_event_id: completionId,
      issues: taskCompletionValidation.status === "invalid" ? taskCompletionValidation.issues : [taskCompletionValidation.reason],
    });
    const taskCompletionPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${taskCompletionJournalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(taskCompletionPath) !== "missing") return failure("task_completion_journal_identity_conflict", "The selected task completion journal identity already has a filesystem entry.", { journal_id: taskCompletionJournalId, activity_completion_event_id: completionId });
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, taskCompletionJournalId).append(taskCompletionValidation.event);
    } catch (error) {
      return failure("task_completion_append_failed", "Activity completion was recorded, but task completion could not be durably appended.", {
        activity_completion_event_id: completionId, event_id: completedTaskId, journal_id: taskCompletionJournalId,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve the accepted Integration and Activity completion; inspect history before retrying task completion.");
    }
    return { kind: "success", data: { event_id: completionId, journal_id: completionJournalId, activity, activity_attempt_id: activityAttemptId, integration_event_id: accepted.event.id, task_completion_event_id: completedTaskId, checkpoints } };
  }
}

export const createNodeActivityExecutionRuntime = (producer: { readonly name: string; readonly version: string }): ActivityExecutionRuntime =>
  createNodeStageStartRuntime(producer);
