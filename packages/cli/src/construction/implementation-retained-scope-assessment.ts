import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { CONSTRUCTION_PHASE, isActivityAttemptCompletedData, isRetainedScopeAssessment, validateConstructionEvent, type ArtifactBinding, type RepositoryCheckpoint, type RetainedScopeAssessment } from "./events.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import { readFunctionalDesignCompletionRecord, sameArtifactBindings } from "./functional-design-completion.js";
import { readQualityRequirementsCompletionRecord } from "./quality-requirements-completion.js";
import { readImplementationPlanningCompletionRecord } from "./implementation-planning-completion.js";
import { readFunctionalDesignMaterial } from "./stage-completion.js";
import { readStageArtifactMaterial } from "./stage-artifact-material.js";
import { readPlanningMaterial } from "./planning-stage-completion.js";
import type { ImplementationStageCompletionRuntime } from "./implementation-stage-completion.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import type { ConstructionHistoryFact } from "./projection.js";

export interface ImplementationRetainedScopeAssessmentRequest {
  readonly assessments: readonly RetainedScopeAssessment[];
}

export interface ImplementationRetainedScopeAssessmentRuntime extends ImplementationStageCompletionRuntime {
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type ImplementationRetainedScopeAssessmentResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
const isCheckpointSet = (value: unknown): value is readonly RepositoryCheckpoint[] => Array.isArray(value) && value.length > 0 &&
  value.every((item) => isRecord(item) && nonEmpty(item.repository_id) && nonEmpty(item.commit)) &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const checkpointKey = (value: unknown): string | undefined => {
  if (!isCheckpointSet(value)) return undefined;
  return JSON.stringify(value.map((item) => `${item.repository_id}\0${item.commit}`).sort());
};
const sameStringSet = (left: readonly string[], right: readonly string[]): boolean =>
  new Set(left).size === left.length && new Set(right).size === right.length &&
  [...left].sort().join("\0") === [...right].sort().join("\0");
const isAssessment = (value: unknown): value is RetainedScopeAssessment =>
  isRetainedScopeAssessment(value) && value.applicable;
const isRequest = (value: unknown): value is ImplementationRetainedScopeAssessmentRequest => {
  if (!isRecord(value) || !onlyKeys(value, ["assessments"]) || !Array.isArray(value.assessments) || value.assessments.length === 0 ||
      !value.assessments.every(isAssessment)) return false;
  const scopes = value.assessments.map((item) => JSON.stringify([item.task_id, item.activity]));
  return new Set(scopes).size === scopes.length;
};

export const validateImplementationRetainedScopeAssessmentRequest = (value: unknown):
  | { readonly kind: "valid"; readonly request: ImplementationRetainedScopeAssessmentRequest }
  | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  if (!isRequest(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one or more distinct, applicable retained Activity assessments with original evidence and checkpoints." }] };
  return { kind: "valid", request: value };
};

const failure = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, recovery = "Resolve the reported condition and retry the exact Implementation attempt."): ImplementationRetainedScopeAssessmentResult =>
  ({ kind: "failed", data: { code, message, details, recovery } });
const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): ImplementationRetainedScopeAssessmentResult =>
  failure(result.code, result.message, result.details, result.recovery);
const currentCompletion = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  stageName: "functional-design" | "quality-requirements" | "implementation-planning",
): ConstructionHistoryFact | undefined => {
  const stage = loaded.unit.stages.find((item) => item.stage === stageName);
  const attempt = stage?.attempts.find((item) => item.attemptId === stage.currentAttemptId);
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
  return stage?.state === "completed" && completions.length === 1 ? completions[0] : undefined;
};
const mergeBindings = (...sets: readonly (readonly ArtifactBinding[])[]): readonly ArtifactBinding[] | undefined => {
  const byId = new Map<string, ArtifactBinding>();
  for (const bindings of sets) for (const binding of bindings) {
    const previous = byId.get(binding.artifact_id);
    if (previous && previous.content_version !== binding.content_version) return undefined;
    byId.set(binding.artifact_id, binding);
  }
  return [...byId.values()].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
};
const latestStart = (facts: readonly ConstructionHistoryFact[]): ConstructionHistoryFact | undefined =>
  facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)).at(-1);
const recordHomeCommonDirectory = async (runtime: ImplementationRetainedScopeAssessmentRuntime, repositoryRoot: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim())); }
  catch { return undefined; }
};

export class ImplementationRetainedScopeAssessment {
  constructor(private readonly contexts: AuditContextResolver, private readonly runtime: ImplementationRetainedScopeAssessmentRuntime) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<ImplementationRetainedScopeAssessmentResult> {
    if (!selectors.unit || selectors.stage !== "implementation" || !selectors.attempt || selectors.task !== undefined ||
        selectors.activity !== undefined || selectors.implementationAttempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_retained_scope_assessment_scope", "Retained-scope assessment requires exactly --unit, --stage implementation, and --attempt.", {
        unit_id: selectors.unit, stage: selectors.stage, attempt_id: selectors.attempt,
      });
    }
    const parsed = validateImplementationRetainedScopeAssessmentRequest(rawRequest);
    if (parsed.kind === "invalid") return failure("invalid_retained_scope_assessment_request", "The retained-scope assessment request failed validation.", { issues: parsed.issues });
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const commonDirectory = await recordHomeCommonDirectory(this.runtime, firstRead.root);
    if (!commonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory, location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", "implementation"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id, process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id, mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/implementation`, attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: ImplementationRetainedScopeAssessmentResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      else result = await this.assessLoaded(loaded, selectors.attempt, parsed.request);
    } catch (error) {
      result = failure("retained_scope_assessment_failed", "Kepler could not validate retained Activity scope safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return failure("stage_coordination_release_failed", "The retained-scope assessment could not confirm that it released its coordination claim.", {
      ...released.details, operation_result: result.kind,
    }, released.recovery);
    return result;
  }

  private async assessLoaded(
    loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>, attemptId: string,
    request: ImplementationRetainedScopeAssessmentRequest,
  ): Promise<ImplementationRetainedScopeAssessmentResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Retained Activity assessment requires the recorded Standard workflow binding.");
    if (loaded.unit.blocked) return failure("stage_history_blocked", "Construction history or projection issues prevent safe retained-scope assessment.", {
      history_issues: loaded.unit.historyIssues, projection_issues: loaded.unit.projectionIssues,
    });
    const stage = loaded.unit.stages.find((item) => item.stage === "implementation");
    const attempt = stage?.attempts.find((item) => item.attemptId === attemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt || attempt.state !== "running") {
      return failure("stage_attempt_not_current", "Retained-scope assessment requires the current running Implementation attempt.", { selected_attempt_id: attemptId, current_attempt_id: stage?.currentAttemptId, state: stage?.state });
    }
    if (loaded.unit.retainedScopeAssessments.some((fact) => fact.event.data.stage_attempt_id === attemptId)) {
      return failure("retained_scope_assessment_already_recorded", "The current Implementation attempt already has a retained-scope assessment event.", { attempt_id: attemptId });
    }
    const start = latestStart(attempt.facts);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart || originalStart.event.type !== "construction.stage-attempt-started") {
      return failure("stage_attempt_start_missing", "The selected Implementation attempt has no validated start fact.", { attempt_id: attemptId });
    }
    const upstream = ["functional-design", "quality-requirements", "implementation-planning"] as const;
    const upstreamFacts = upstream.map((name) => currentCompletion(loaded, name));
    if (upstreamFacts.some((fact) => fact === undefined)) return failure("implementation_authority_missing", "Retained Activity assessment requires current completed Functional Design, Quality Requirements, and Implementation Planning attempts.");
    const authority = validateStageStartAuthority({
      stage: "implementation", unitId: loaded.unit.unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids, causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: upstreamFacts.map((fact) => String(fact!.event.id)),
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") return failure("implementation_start_authority_invalid", "The current Implementation attempt must descend from the three current upstream completions and any authorized reopen chain.", authority.details);
    const fdFact = upstreamFacts[0]!;
    const qualityFact = upstreamFacts[1]!;
    const planningFact = upstreamFacts[2]!;
    const fdRecord = fdFact.event.type === "construction.stage-attempt-completed"
      ? readFunctionalDesignCompletionRecord(fdFact.event.data.functional_design_assessment) : undefined;
    const qualityRecord = fdRecord && qualityFact.event.type === "construction.stage-attempt-completed"
      ? readQualityRequirementsCompletionRecord(qualityFact.event.data.quality_requirements_assessment, fdRecord.artifact_paths) : undefined;
    const planningRecord = planningFact.event.type === "construction.stage-attempt-completed"
      ? readImplementationPlanningCompletionRecord(planningFact.event.data.implementation_planning_assessment) : undefined;
    if (!fdRecord || !qualityRecord || !planningRecord) return failure("implementation_upstream_assessment_invalid", "Current upstream completion records do not satisfy their typed assessment contracts.");
    const persistedDirectory = loaded.unit.created?.event.type === "construction.unit-created" ? loaded.unit.created.event.data.directory : undefined;
    const fdMaterial = await readFunctionalDesignMaterial(loaded.root, loaded.missionId, loaded.unit.unitId, persistedDirectory);
    const qualityMaterial = await readStageArtifactMaterial({
      repositoryRoot: loaded.root, missionId: loaded.missionId, unitId: loaded.unit.unitId, persistedUnitDirectory: persistedDirectory,
      primaryArtifact: "quality.md", supportFolder: "quality-requirements",
    });
    const planningMaterial = await readPlanningMaterial(loaded, persistedDirectory);
    if (fdMaterial.kind !== "valid" || qualityMaterial.kind !== "valid" || planningMaterial.kind !== "valid") {
      return failure("implementation_upstream_material_invalid", "Current upstream artifacts or task graph failed validation before retained Activity assessment.", {
        functional_design: fdMaterial.kind === "invalid" ? fdMaterial.diagnostics : [],
        quality: qualityMaterial.kind === "invalid" ? qualityMaterial.diagnostics : [],
        planning: planningMaterial.kind === "invalid" ? planningMaterial.diagnostics : [],
      });
    }
    const expectedBindings = mergeBindings(
      fdMaterial.material.artifactBindings.map((binding) => ({ artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"], content_version: binding.content_version })),
      qualityMaterial.material.artifactBindings, planningMaterial.material.artifactBindings,
    );
    if (!expectedBindings || !sameArtifactBindings(fdRecord.artifact_bindings, fdMaterial.material.artifactBindings) ||
        !sameArtifactBindings(qualityRecord.artifact_bindings, qualityMaterial.material.artifactBindings) ||
        !sameArtifactBindings(qualityRecord.functional_design_bindings, fdMaterial.material.artifactBindings) ||
        !sameArtifactBindings(planningRecord.artifact_bindings, planningMaterial.material.artifactBindings) ||
        !sameArtifactBindings(planningRecord.reviewed_material_bindings, expectedBindings) ||
        planningRecord.graph_ref.graph_id !== planningMaterial.material.graphRef.graph_id ||
        planningRecord.graph_ref.content_version !== planningMaterial.material.graphRef.content_version) {
      return failure("implementation_upstream_material_stale", "Current Design, Quality, Planning, or task graph material differs from its accepted completion bindings.");
    }
    const commonDirectory = await recordHomeCommonDirectory(this.runtime, loaded.root);
    if (!commonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: loaded.root });
    const captured = await captureStageCheckpoints(this.runtime, loaded, commonDirectory);
    if (captured.kind === "failed") return failure(captured.code, captured.message, captured.details);
    const repositoryId = recordHomeRepositoryId(loaded.history.events);
    if (!repositoryId) return failure("implementation_record_home_checkpoint_missing", "The mission record-home repository identity is unavailable.");
    const retainedAssessments: RetainedScopeAssessment[] = [];
    const sourceIds = new Set<string>([String(start.event.id)]);
    for (const assessment of request.assessments) {
      if (!planningMaterial.material.taskIds.includes(assessment.task_id)) {
        return failure("retained_scope_task_not_current", "A retained Activity task is not part of the current accepted task graph.", { task_id: assessment.task_id });
      }
      const task = loaded.unit.tasks.find((candidate) => candidate.taskId === assessment.task_id);
      const activity = task?.activities.find((candidate) => candidate.activity === assessment.activity);
      const originalAttempt = activity?.attempts.find((candidate) => candidate.attemptId === assessment.original_activity_attempt_id);
      const originalCompletions = originalAttempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed" && isActivityAttemptCompletedData(fact.event.data)) ?? [];
      const originalStageAttempt = stage.attempts.find((candidate) => candidate.attemptId === assessment.original_stage_attempt_id);
      const originalAdmission = task?.admissions.filter((fact) => fact.event.type === "construction.task-admitted" &&
        fact.event.data.stage_attempt_id === assessment.original_stage_attempt_id) ?? [];
      const originalCompletion = originalCompletions.length === 1 ? originalCompletions[0] : undefined;
      const originalCompletionData = originalCompletion?.event.type === "construction.activity-attempt-completed" &&
        isActivityAttemptCompletedData(originalCompletion.event.data) ? originalCompletion.event.data : undefined;
      if (!task || !activity || !originalAttempt || originalAttempt.state !== "completed" ||
          originalAttempt.stageAttemptId !== assessment.original_stage_attempt_id || assessment.original_stage_attempt_id === attemptId ||
          !originalStageAttempt || originalStageAttempt.state !== "ended_by_revision" || originalAdmission.length !== 1 ||
          !isRecord(originalAdmission[0]?.event.data.graph_ref) ||
          originalAdmission[0]?.event.data.graph_ref.graph_id !== planningRecord.graph_ref.graph_id ||
          originalAdmission[0]?.event.data.graph_ref.content_version !== planningRecord.graph_ref.content_version ||
          !originalCompletion || !originalCompletionData || originalCompletionData.stage_attempt_id !== assessment.original_stage_attempt_id ||
          originalCompletionData.task_id !== assessment.task_id || originalCompletionData.activity !== assessment.activity ||
          originalCompletionData.activity_attempt_id !== assessment.original_activity_attempt_id ||
          !sameStringSet(assessment.original_evidence_ids.map(String), originalCompletionData.evidence_ids.map(String)) ||
          checkpointKey(assessment.checkpoints) !== checkpointKey(originalCompletionData.checkpoints)) {
        return failure("retained_scope_origin_invalid", "Each retained assessment must identify a completed Activity from an ended older Implementation parent and the current task graph.", {
          task_id: assessment.task_id, activity: assessment.activity,
          original_stage_attempt_id: assessment.original_stage_attempt_id, original_activity_attempt_id: assessment.original_activity_attempt_id,
        });
      }
      const verifiedCheckpoints = await verifyStageCheckpointSet(this.runtime.workspace, captured.repositoryRoots, assessment.checkpoints);
      if (verifiedCheckpoints.kind === "invalid") return failure("retained_scope_checkpoint_invalid", "Original Activity checkpoint commits must remain available in their prepared repositories.", {
        repository_ids: verifiedCheckpoints.repositoryIds, invalid_commits: verifiedCheckpoints.invalidCommits,
      });
      if (!assessment.checkpoints.some((checkpoint) => checkpoint.repository_id === repositoryId)) {
        return failure("retained_scope_record_home_checkpoint_missing", "Every retained Activity checkpoint set must include the record-home repository.", { task_id: assessment.task_id, activity: assessment.activity, repository_id: repositoryId });
      }
      for (const evidenceId of assessment.original_evidence_ids) {
        const matches = loaded.unit.evidence.filter((item) => item.fact.event.data.evidence_id === evidenceId).map((item) => item.fact);
        const evidence = matches.length === 1 ? matches[0] : undefined;
        if (!evidence || evidence.event.type !== "construction.evidence-recorded" || evidence.event.data.stage !== "implementation" ||
            evidence.event.data.stage_attempt_id !== assessment.original_stage_attempt_id || evidence.event.data.task_id !== assessment.task_id ||
            evidence.event.data.activity !== assessment.activity || evidence.event.data.activity_attempt_id !== assessment.original_activity_attempt_id ||
            !isRecord(evidence.event.data.result) || evidence.event.data.result.status !== "passed" ||
            !sameArtifactBindings(evidence.event.data.artifact_bindings, expectedBindings) ||
            checkpointKey(evidence.event.data.checkpoints) !== checkpointKey(assessment.checkpoints) ||
            !originalCompletion.event.caused_by.includes(evidence.event.id)) {
          return failure("retained_scope_evidence_invalid", "Original evidence must remain passed and bound to the exact Activity attempt, accepted material, and checkpoint set.", {
            task_id: assessment.task_id, activity: assessment.activity, evidence_id: evidenceId,
          });
        }
        sourceIds.add(String(evidence.event.id));
      }
      if (assessment.activity === "code-integration") {
        const acceptances = activity.accepted.filter((fact) => fact.event.type === "construction.integration-accepted" &&
          fact.event.data.stage_attempt_id === assessment.original_stage_attempt_id &&
          fact.event.data.task_id === assessment.task_id && fact.event.data.activity_attempt_id === assessment.original_activity_attempt_id);
        if (acceptances.length !== 1) return failure("retained_scope_integration_provenance_missing", "Retained Code Integration requires its unique original accepted Integration event.", {
          task_id: assessment.task_id, activity_attempt_id: assessment.original_activity_attempt_id,
        });
        sourceIds.add(String(acceptances[0]!.event.id));
      }
      sourceIds.add(String(originalCompletion.event.id));
      retainedAssessments.push(assessment);
    }
    const existingIds = new Set(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    let eventId: string;
    let journalId: string;
    try { eventId = this.runtime.identities.next(); journalId = this.runtime.identities.next(); }
    catch (error) { return failure("retained_scope_identity_failed", "Kepler could not allocate retained-scope assessment identities.", { message: error instanceof Error ? error.message : String(error) }); }
    if (!uuidV4(eventId) || !uuidV4(journalId) || eventId === journalId || existingIds.has(eventId) || existingIds.has(journalId)) {
      return failure("retained_scope_identity_failed", "Retained-scope assessment event and journal identities must be distinct, valid, and unused.");
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return failure("retained_scope_journal_identity_conflict", "A retained-scope assessment journal identity already has a filesystem entry.", { journal_id: journalId });
    const candidate = {
      id: eventId, phase: CONSTRUCTION_PHASE, type: "construction.retained-scope-assessed", envelope_version: 1, event_version: 1,
      journal_id: journalId, recorded_at: this.runtime.now(), producer: this.runtime.producer,
      caused_by: [...sourceIds] as EventId[],
      data: { mission_id: loaded.missionId, unit_id: loaded.unit.unitId, stage: "implementation", stage_attempt_id: attemptId, assessments: retainedAssessments },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") return failure("retained_scope_event_invalid", "The retained-scope assessment event failed Construction validation.", {
      issues: validation.status === "invalid" ? validation.issues : [validation.reason],
    });
    try { await this.runtime.journals.create(loaded.root, loaded.missionId, validation.event.journal_id).append(validation.event); }
    catch (error) { return failure("retained_scope_append_failed", "Kepler could not durably append retained-scope assessment history.", {
      journal_id: validation.event.journal_id, message: error instanceof Error ? error.message : String(error),
    }, "Inspect the selected history journals for appended or uncertain records before retrying; preserve uncertain effects."); }
    return { kind: "success", data: { id: validation.event.id, journal_id: validation.event.journal_id, unit_id: loaded.unit.unitId, stage: "implementation", attempt_id: attemptId, assessed_count: retainedAssessments.length } };
  }
}

export const createNodeImplementationRetainedScopeAssessmentRuntime = (
  producer: { readonly name: string; readonly version: string },
): ImplementationRetainedScopeAssessmentRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return {
    workspace, identities: { next: randomUUID }, now: () => new Date().toISOString(), producer,
    journals: { create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: CONSTRUCTION_PHASE }) },
  };
};
