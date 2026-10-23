import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { EventJournal } from "../history/journal.js";
import { readImplementationPlanningCompletionRecord } from "./implementation-planning-completion.js";
import { type ConstructionHistoryFact, type ConstructionUnitProjection } from "./projection.js";
import { ConstructionQueries, type TaskExecutionContext } from "./scoped-queries.js";
import { captureStageCheckpoints, createNodeStageStartRuntime, type StageStartRuntime } from "./stage-start.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ConstructionEventRecord,
  type EvidenceId,
  type GraphReference,
  type RepositoryCheckpoint,
  type TaskId,
} from "./events.js";

export interface TaskAdmissionRequest {
  readonly prerequisite_evidence_ids: readonly string[];
}

export interface TaskAdmissionRuntime extends StageStartRuntime {
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type TaskAdmissionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const commitId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
const isRepositoryCheckpoints = (value: unknown): value is readonly RepositoryCheckpoint[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.repository_id === "string" && commitId(item.commit)) &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const checkpointKey = (value: readonly RepositoryCheckpoint[]): string => JSON.stringify(
  value.slice().sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
);
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported task admission condition and retry without changing the authored graph or discarding work.",
): TaskAdmissionResult => ({ kind: "failed", code, message, details, recovery });
const propagate = (result: Extract<AuditHistoryReadResult, { readonly kind: "failed" }>): TaskAdmissionResult =>
  failure(result.code, result.message, result.details, result.recovery);

export const validateTaskAdmissionRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: TaskAdmissionRequest }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "prerequisite_evidence_ids") ||
      !Array.isArray(value.prerequisite_evidence_ids) || value.prerequisite_evidence_ids.some((id) => !uuidV4(id)) ||
      new Set(value.prerequisite_evidence_ids).size !== value.prerequisite_evidence_ids.length) {
    return { kind: "invalid", issues: [{ pointer: "/prerequisite_evidence_ids", message: "Expected a unique array of evidence UUIDs and no unknown fields." }] };
  }
  return { kind: "valid", request: { prerequisite_evidence_ids: value.prerequisite_evidence_ids as string[] } };
};

const commonDirectory = async (runtime: TaskAdmissionRuntime, root: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(root, result.stdout.trim())); }
  catch { return undefined; }
};

const currentParentStart = (
  unit: ConstructionUnitProjection,
  attemptId: string,
): ConstructionHistoryFact | undefined => {
  const stage = unit.stages.find((item) => item.stage === "implementation");
  const attempt = stage?.attempts.find((item) => item.attemptId === attemptId && item.state === "running");
  if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt) return undefined;
  const starts = attempt.facts.filter((fact) => fact.event.type === "construction.stage-attempt-started" || fact.event.type === "construction.stage-resumed");
  return starts.at(-1);
};

const planningGraphRef = (unit: ConstructionUnitProjection): GraphReference | undefined => {
  const stage = unit.stages.find((item) => item.stage === "implementation-planning");
  if (!stage || stage.state !== "completed" || !stage.currentAttemptId) return undefined;
  const attempt = stage.attempts.find((item) => item.attemptId === stage.currentAttemptId && item.state === "completed");
  const completion = attempt?.facts.find((fact) => fact.event.type === "construction.stage-attempt-completed");
  if (!completion || completion.event.type !== "construction.stage-attempt-completed") return undefined;
  const record = readImplementationPlanningCompletionRecord(completion.event.data.implementation_planning_assessment);
  return record?.graph_ref;
};

const evidenceFact = (unit: ConstructionUnitProjection, evidenceId: string): ConstructionHistoryFact | undefined => {
  const matches = unit.evidence.map((item) => item.fact).filter((fact) =>
    fact.event.type === "construction.evidence-recorded" && fact.event.data.evidence_id === evidenceId,
  );
  return matches.length === 1 ? matches[0] : undefined;
};

const selectedEvidence = (
  unit: ConstructionUnitProjection,
  evidenceIds: readonly string[],
  attemptId: string,
  taskId: string,
  task: TaskExecutionContext["task"],
): { readonly kind: "valid"; readonly facts: readonly ConstructionHistoryFact[] } | { readonly kind: "invalid"; readonly missing: readonly string[]; readonly invalid: readonly string[] } => {
  const facts = evidenceIds.map((id) => evidenceFact(unit, id));
  const invalid: string[] = [];
  for (const [index, fact] of facts.entries()) {
    const id = evidenceIds[index]!;
    if (!fact || fact.event.type !== "construction.evidence-recorded" || fact.event.data.stage !== "implementation" ||
        fact.event.data.stage_attempt_id !== attemptId || fact.event.data.task_id !== taskId ||
        fact.event.data.activity !== undefined || fact.event.data.check !== "task-prerequisite" ||
        !isRecord(fact.event.data.result) || fact.event.data.result.status !== "passed" ||
        !Array.isArray(fact.event.data.inputs)) invalid.push(id);
  }
  const missing = task.prerequisites.flatMap((prerequisite) => {
    if (!prerequisite.blocking || prerequisite.needed_for !== "implementation") return [];
    const covered = facts.some((fact) => fact?.event.type === "construction.evidence-recorded" &&
      Array.isArray(fact.event.data.inputs) && fact.event.data.inputs.some((input) => isRecord(input) &&
        [prerequisite.condition, prerequisite.description].includes(String(input.reference))));
    return covered ? [] : [prerequisite.description];
  });
  return missing.length > 0 || invalid.length > 0
    ? { kind: "invalid", missing, invalid }
    : { kind: "valid", facts: facts.filter((fact): fact is ConstructionHistoryFact => fact !== undefined) };
};

const readTargetCheckpoints = async (
  runtime: TaskAdmissionRuntime,
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  captured: Extract<Awaited<ReturnType<typeof captureStageCheckpoints>>, { readonly kind: "valid" }>,
): Promise<readonly RepositoryCheckpoint[] | undefined> => {
  const checkpoints: RepositoryCheckpoint[] = [];
  for (const repository of captured.repositoryRoots) {
    const target = repository.integrationTarget;
    if (!target.startsWith("refs/heads/") || target.includes("..") || target.endsWith("/")) return undefined;
    const targetStatus = await runtime.workspace.git.run(repository.repositoryRoot, ["show-ref", "--verify", "--quiet", target]);
    if (targetStatus.status === 1) {
      const explicitlyUnborn = loaded.history.events.some((record) => {
        const event = record.event;
        if (!event || event.type !== "construction.mission-workspaces-prepared" || !isRecord(event.data) ||
            !Array.isArray(event.data.repositories)) return false;
        return event.data.repositories.some((item) => isRecord(item) && item.repository_id === repository.repository_id &&
          item.integration_target === target && item.starting_checkpoint !== null && isRecord(item.starting_checkpoint) &&
          item.starting_checkpoint.kind === "no-commit" && item.branch === target.slice("refs/heads/".length));
      });
      if (explicitlyUnborn) continue;
      return undefined;
    }
    if (targetStatus.status !== 0) return undefined;
    const result = await runtime.workspace.git.run(repository.repositoryRoot, ["rev-parse", "--verify", `${target}^{commit}`]);
    if (result.status !== 0 || !commitId(result.stdout.trim())) return undefined;
    checkpoints.push({ repository_id: repository.repository_id, commit: result.stdout.trim() });
  }
  return checkpoints.sort((left, right) => left.repository_id.localeCompare(right.repository_id));
};

const acceptedIntegrations = (projectionUnits: readonly ConstructionUnitProjection[]): ConstructionHistoryFact[] =>
  projectionUnits.flatMap((unit) => unit.tasks.flatMap((task) => task.activities.flatMap((activity) =>
    activity.activity === "code-integration"
      ? activity.accepted.filter((fact) => fact.event.type === "construction.integration-accepted")
      : [],
  )));

const hasCausalPath = (events: ReadonlyMap<string, { readonly caused_by: readonly string[] }>, before: string, after: string): boolean => {
  const pending = [...(events.get(after)?.caused_by ?? [])];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    if (id === before) return true;
    seen.add(id);
    pending.push(...(events.get(id)?.caused_by ?? []));
  }
  return false;
};

const currentIntegration = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
): ConstructionHistoryFact | undefined => {
  const acceptances = acceptedIntegrations(loaded.projection.units);
  const events = new Map(loaded.history.events.flatMap((record) => record.event
    ? [[String(record.event.id), record.event] as const]
    : [],
  ));
  const leaves = acceptances.filter((candidate) => !acceptances.some((other) =>
    other.event.id !== candidate.event.id && hasCausalPath(events, String(candidate.event.id), String(other.event.id)),
  ));
  return leaves.length === 1 ? leaves[0] : undefined;
};

const predecessorProvenance = async (
  runtime: TaskAdmissionRuntime,
  unit: ConstructionUnitProjection,
  task: TaskExecutionContext["task"],
  baseline: readonly RepositoryCheckpoint[],
  roots: Extract<Awaited<ReturnType<typeof captureStageCheckpoints>>, { readonly kind: "valid" }>["repositoryRoots"],
): Promise<{ readonly kind: "valid"; readonly values: readonly { readonly task_id: TaskId; readonly integration_event_id: EventId; readonly checkpoints: readonly RepositoryCheckpoint[] }[] } | { readonly kind: "invalid"; readonly dependency: string; readonly reason: string }> => {
  const values: { task_id: TaskId; integration_event_id: EventId; checkpoints: readonly RepositoryCheckpoint[] }[] = [];
  for (const dependency of task.depends_on) {
    const predecessor = unit.tasks.find((item) => item.taskId === dependency.task_id);
    const integrationId = predecessor?.completion?.event.type === "construction.task-completed"
      ? predecessor.completion.event.data.integration_event_id
      : undefined;
    const integration = predecessor?.activities.find((item) => item.activity === "code-integration")?.accepted
      .find((fact) => fact.event.id === integrationId && fact.event.type === "construction.integration-accepted");
    if (!predecessor || predecessor.state !== "complete" || !integration || integration.event.type !== "construction.integration-accepted") {
      return { kind: "invalid", dependency: dependency.task_id, reason: "predecessor has no current accepted Integration and task completion" };
    }
    const checkpoints = integration.event.data.candidate_checkpoints as readonly RepositoryCheckpoint[];
    const baselineByRepository = new Map(baseline.map((item) => [item.repository_id, item.commit]));
    for (const checkpoint of checkpoints) {
      const current = baselineByRepository.get(checkpoint.repository_id);
      const repository = roots.find((item) => item.repository_id === checkpoint.repository_id);
      if (!current || !repository) return { kind: "invalid", dependency: dependency.task_id, reason: `integrated output ${checkpoint.repository_id} is absent from the current admission baseline` };
      const ancestry = await runtime.workspace.git.run(repository.repositoryRoot, ["merge-base", "--is-ancestor", checkpoint.commit, current]);
      if (ancestry.status !== 0) return { kind: "invalid", dependency: dependency.task_id, reason: `integrated output ${checkpoint.repository_id} is not an ancestor of the current admission baseline` };
    }
    values.push({ task_id: dependency.task_id as TaskId, integration_event_id: integration.event.id as EventId, checkpoints });
  }
  return { kind: "valid", values };
};

export class TaskAdmission {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly queries: ConstructionQueries,
    private readonly runtime: TaskAdmissionRuntime,
  ) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<TaskAdmissionResult> {
    if (!selectors.unit || !selectors.task || !selectors.implementationAttempt || selectors.stage !== undefined ||
        selectors.activity !== undefined || selectors.attempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_task_admission_scope", "Task admission requires exact --unit, --task, and --implementation-attempt selectors.", {
        unit_id: selectors.unit, task_id: selectors.task, implementation_attempt_id: selectors.implementationAttempt,
      });
    }
    const parsed = validateTaskAdmissionRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_task_admission_request", "The typed task admission request failed validation.", { issues: parsed.issues });
    const first = await this.contexts.readUnit(selectors.unit, project);
    if (first.kind === "failed") return propagate(first);
    const commonDir = await commonDirectory(this.runtime, first.root);
    if (!commonDir) return failure("task_admission_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: first.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: first.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([first.missionId, selectors.unit, "task-admission"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: first.missionId,
        resource_scope: `construction/task-admission/${selectors.unit}`,
        attempt_context: selectors.implementationAttempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: TaskAdmissionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagate(loaded);
      else if (loaded.root !== first.root || loaded.missionId !== first.missionId) result = failure("task_admission_scope_changed", "Unit membership changed while acquiring admission coordination.");
      else result = await this.admitLoaded(loaded, selectors.task, selectors.implementationAttempt, parsed.request, project);
    } catch (error) {
      result = failure("task_admission_failed", "Kepler could not validate task admission safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return failure("task_admission_coordination_release_failed", "Kepler could not confirm release of the task admission claim.", {
      ...released.details, operation_result: result.kind,
      ...(result.kind === "success" ? { event_id: result.data.admission_event_id } : {}),
    }, released.recovery);
    return result;
  }

  private async admitLoaded(
    loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
    taskId: string,
    implementationAttemptId: string,
    request: TaskAdmissionRequest,
    project?: string,
  ): Promise<TaskAdmissionResult> {
    const unit = loaded.unit;
    if (unit.workflow !== "standard" || unit.blocked) return failure("task_admission_history_blocked", "Task admission requires an unblocked Standard Construction history.", {
      workflow: unit.workflow, history_issues: unit.historyIssues, projection_issues: unit.projectionIssues,
    });
    const execution = await this.queries.taskExecutionContext(unit.unitId, taskId, project);
    if (execution.kind === "failed") return failure(execution.code, execution.message, execution.details, execution.recovery);
    const start = currentParentStart(unit, implementationAttemptId);
    if (!start) return failure("implementation_attempt_not_current", "Task admission requires the current running Implementation attempt.", { implementation_attempt_id: implementationAttemptId });
    const plannedGraphRef = planningGraphRef(unit);
    if (!plannedGraphRef || plannedGraphRef.graph_id !== execution.graphRef.graph_id ||
        plannedGraphRef.content_version !== execution.graphRef.content_version) {
      return failure("task_graph_version_stale", "The current task graph differs from the accepted Implementation Planning graph.", {
        planned_graph_ref: plannedGraphRef, current_graph_ref: execution.graphRef,
      });
    }
    const currentTask = unit.tasks.find((item) => item.taskId === taskId);
    const currentTaskAdmissions = currentTask?.admissions.filter((fact) => fact.event.data.stage_attempt_id === implementationAttemptId) ?? [];
    if (currentTaskAdmissions.length > 0) return failure("task_already_admitted", "The task is already admitted under the selected Implementation attempt.", { task_id: taskId });
    const selectedPrerequisites = selectedEvidence(unit, request.prerequisite_evidence_ids, implementationAttemptId, taskId, execution.task);
    if (selectedPrerequisites.kind === "invalid") return failure("task_prerequisite_unverified", "Blocking implementation prerequisites require passed, task-scoped evidence tied to the current Implementation attempt.", {
      missing_prerequisites: selectedPrerequisites.missing, invalid_evidence_ids: selectedPrerequisites.invalid,
    });
    const planningStage = unit.stages.find((item) => item.stage === "implementation-planning");
    const planningAttempt = planningStage?.attempts.find((item) => item.attemptId === planningStage.currentAttemptId);
    const planningCompletion = planningAttempt?.facts.find((fact) => fact.event.type === "construction.stage-attempt-completed");
    const planningRecord = planningCompletion?.event.type === "construction.stage-attempt-completed"
      ? readImplementationPlanningCompletionRecord(planningCompletion.event.data.implementation_planning_assessment)
      : undefined;
    if (!planningRecord?.assessments.handoff.task_ids.includes(taskId)) return failure("task_not_in_planned_handoff", "The selected task is not part of the current accepted Implementation handoff.", { task_id: taskId });
    const currentCommonDir = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDir) return failure("task_admission_workspace_unavailable", "Git could not resolve the record home's common directory.");
    const captured = await captureStageCheckpoints(this.runtime, loaded, currentCommonDir);
    if (captured.kind === "failed") return failure(captured.code, captured.message, captured.details);
    const admissionBaseline = await readTargetCheckpoints(this.runtime, loaded, captured);
    if (!admissionBaseline) return failure("task_admission_integration_state_unknown", "Kepler could not capture a repository-qualified Integration target set.", {
      repository_ids: captured.repositoryRoots.map((item) => item.repository_id),
    });
    const stableBaseline = await readTargetCheckpoints(this.runtime, loaded, captured);
    if (!stableBaseline || checkpointKey(admissionBaseline) !== checkpointKey(stableBaseline)) {
      return failure("task_admission_integration_state_changed", "Integration targets changed while the admission baseline was captured; retry after the current effects settle.");
    }
    const priorBaseline = unit.baseline;
    if (priorBaseline && priorBaseline.event.type !== "construction.unit-baseline-selected") return failure("unit_review_baseline_invalid", "The unit Review baseline fact is invalid.");
    const reviewBaseline = priorBaseline?.event.data.review_baseline as readonly RepositoryCheckpoint[] | undefined;
    const baselineTargets = captured.repositoryRoots.map((item) => ({ repository_id: item.repository_id, target: item.integrationTarget }));
    if (priorBaseline && JSON.stringify(priorBaseline.event.data.integration_targets) !== JSON.stringify(baselineTargets)) {
      return failure("unit_integration_targets_changed", "Prepared Integration targets differ from the fixed unit Review baseline.");
    }
    const acceptedHistory = acceptedIntegrations(loaded.projection.units);
    const latestIntegration = currentIntegration(loaded);
    if (acceptedHistory.length > 0 && !latestIntegration) return failure("task_admission_integration_history_ambiguous", "Mission Integration acceptances do not establish one causally latest candidate set.", {
      accepted_event_ids: acceptedHistory.map((fact) => fact.event.id),
    });
    const latestCandidateCheckpoints = latestIntegration?.event.type === "construction.integration-accepted" &&
      isRepositoryCheckpoints(latestIntegration.event.data.candidate_checkpoints)
      ? latestIntegration.event.data.candidate_checkpoints
      : undefined;
    if (latestIntegration && (!latestCandidateCheckpoints ||
        checkpointKey(latestCandidateCheckpoints) !== checkpointKey(admissionBaseline))) {
      return failure("task_admission_integration_state_unreconciled", "The live Integration targets differ from the latest accepted repository-qualified set.", {
        latest_integration_event_id: latestIntegration.event.id,
        latest_candidate_checkpoints: latestCandidateCheckpoints,
        current_checkpoints: admissionBaseline,
      });
    }
    if (!latestIntegration && priorBaseline && reviewBaseline && checkpointKey(reviewBaseline) !== checkpointKey(admissionBaseline)) {
      return failure("task_admission_integration_state_unreconciled", "Integration targets changed without a matching accepted Integration after the fixed unit Review baseline.", {
        review_baseline: reviewBaseline, current_checkpoints: admissionBaseline,
      });
    }
    const provenance = await predecessorProvenance(this.runtime, unit, execution.task, admissionBaseline, captured.repositoryRoots);
    if (provenance.kind === "invalid") return failure("task_predecessor_not_integrated", "A required predecessor output is not present in the current admission baseline.", {
      dependency_task_id: provenance.dependency, reason: provenance.reason,
    });
    const existing = new Set<string>(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    const admissionId = this.runtime.identities.next();
    const admissionJournalId = this.runtime.identities.next();
    const baselineId = priorBaseline ? undefined : this.runtime.identities.next();
    const baselineJournalId = priorBaseline ? undefined : this.runtime.identities.next();
    const ids = [admissionId, admissionJournalId, ...(baselineId ? [baselineId] : []), ...(baselineJournalId ? [baselineJournalId] : [])];
    if (ids.some((id) => !uuidV4(id)) || new Set(ids).size !== ids.length || ids.some((id) => existing.has(id))) {
      return failure("task_admission_identity_conflict", "The task admission event identities are invalid, reused, or already present.");
    }
    const journalRoot = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE);
    const appendEvents: ConstructionEventRecord[] = [];
    if (!priorBaseline) {
      const baselineEvent = {
        id: baselineId,
        phase: CONSTRUCTION_PHASE,
        type: "construction.unit-baseline-selected",
        envelope_version: 1,
        event_version: CONSTRUCTION_EVENT_VERSION,
        journal_id: baselineJournalId,
        recorded_at: this.runtime.now(),
        producer: this.runtime.producer,
        caused_by: [start.event.id, ...(latestIntegration ? [latestIntegration.event.id] : [])],
        data: {
          mission_id: loaded.missionId,
          unit_id: unit.unitId,
          review_baseline: admissionBaseline,
          integration_targets: baselineTargets,
        },
      };
      const baselineValidation = validateConstructionEvent(baselineEvent);
      if (baselineValidation.status !== "valid") return failure("unit_baseline_event_invalid", "The typed unit Review baseline event failed Construction validation.", {
        issues: baselineValidation.status === "invalid" ? baselineValidation.issues : [baselineValidation.reason],
      });
      appendEvents.push(baselineValidation.event);
    }
    const baselineEventId = priorBaseline?.event.id ?? baselineId!;
    const admissionEvent = {
      id: admissionId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.task-admitted",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: admissionJournalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([
        start.event.id,
        baselineEventId,
        ...(latestIntegration ? [latestIntegration.event.id] : []),
        ...provenance.values.map((item) => item.integration_event_id),
        ...selectedPrerequisites.facts.map((fact) => fact.event.id),
      ])],
      data: {
        mission_id: loaded.missionId,
        unit_id: unit.unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttemptId,
        task_id: taskId,
        graph_ref: execution.graphRef,
        task_definition_ref: execution.taskDefinitionRef,
        admission_baseline: admissionBaseline,
        predecessor_provenance: provenance.values,
        prerequisite_evidence: request.prerequisite_evidence_ids as EvidenceId[],
      },
    };
    const admissionValidation = validateConstructionEvent(admissionEvent);
    if (admissionValidation.status !== "valid") return failure("task_admission_event_invalid", "The typed task admission event failed Construction validation.", {
      issues: admissionValidation.status === "invalid" ? admissionValidation.issues : [admissionValidation.reason],
    });
    if (appendEvents.length > 0) {
      const baselineJournalPath = Path.join(journalRoot, `${baselineJournalId}.jsonl`);
      if (await this.runtime.workspace.fileSystem.pathKind(baselineJournalPath) !== "missing") return failure("unit_baseline_journal_identity_conflict", "The selected baseline journal identity already has a filesystem entry.");
    }
    const admissionJournalPath = Path.join(journalRoot, `${admissionJournalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(admissionJournalPath) !== "missing") return failure("task_admission_journal_identity_conflict", "The selected admission journal identity already has a filesystem entry.");
    for (const event of appendEvents) {
      try {
        await this.runtime.journals.create(loaded.root, loaded.missionId, event.journal_id).append(event);
      } catch (error) {
        return failure("unit_baseline_append_failed", "Kepler could not durably append the unit Review baseline.", {
          journal_id: event.journal_id, message: error instanceof Error ? error.message : String(error),
        }, "Inspect history for an appended or uncertain baseline before retrying; preserve all records.");
      }
    }
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, admissionJournalId).append(admissionValidation.event);
    } catch (error) {
      return failure("task_admission_append_failed", "Kepler could not durably append the task admission.", {
        journal_id: admissionJournalId, message: error instanceof Error ? error.message : String(error),
      }, "Inspect history for an appended or uncertain admission before retrying; preserve all records.");
    }
    return {
      kind: "success",
      data: {
        admission_event_id: admissionValidation.event.id,
        journal_id: admissionValidation.event.journal_id,
        mission_id: loaded.missionId,
        unit_id: unit.unitId,
        task_id: taskId,
        implementation_attempt_id: implementationAttemptId,
        graph_ref: execution.graphRef,
        task_definition_ref: execution.taskDefinitionRef,
        admission_baseline: admissionBaseline,
        review_baseline: priorBaseline ? reviewBaseline : admissionBaseline,
        predecessor_provenance: provenance.values,
        prerequisite_evidence_ids: request.prerequisite_evidence_ids,
      },
    };
  }
}

export const createNodeTaskAdmissionRuntime = (producer: { readonly name: string; readonly version: string }): TaskAdmissionRuntime =>
  createNodeStageStartRuntime(producer);
