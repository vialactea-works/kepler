import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { CONSTRUCTION_PHASE, CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION, isImplementationCompletionAssessedData, isUnitOfWorkReviewCompletionRecord, validateConstructionEvent, type ArtifactBinding, type MissionId, type StageAttemptId, type UnitId, type UnitOfWorkReviewCompletionRecord } from "./events.js";
import { sameArtifactBindings } from "./functional-design-completion.js";
import { readFunctionalDesignMaterial } from "./stage-completion.js";
import { readStageArtifactMaterial } from "./stage-artifact-material.js";
import { readPlanningMaterial } from "./planning-stage-completion.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointMaterial, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import type { ConstructionHistoryFact } from "./projection.js";

export interface UnitOfWorkReviewCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: { readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal };
}

export type UnitOfWorkReviewCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const uuidV4 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const checkpointKey = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const checkpoint of value) {
    if (!isRecord(checkpoint) || !nonEmpty(checkpoint.repository_id) || !nonEmpty(checkpoint.commit) || seen.has(checkpoint.repository_id)) return undefined;
    seen.add(checkpoint.repository_id);
    keys.push(`${checkpoint.repository_id}\0${checkpoint.commit}`);
  }
  return JSON.stringify(keys.sort());
};
const sameSet = (left: readonly unknown[], right: readonly string[]): boolean => {
  const values = left.map(String);
  return new Set(values).size === values.length && new Set(right).size === right.length &&
    JSON.stringify(values.slice().sort()) === JSON.stringify(right.slice().sort());
};
const dataOf = (fact: ConstructionHistoryFact): Record<string, unknown> => isRecord(fact.event.data) ? fact.event.data : {};
const fail = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, recovery = "Resolve the reported condition and retry the exact Unit of Work Review attempt."): UnitOfWorkReviewCompletionResult => ({ kind: "failed", data: { code, message, details, recovery } });
const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): UnitOfWorkReviewCompletionResult => fail(result.code, result.message, result.details, result.recovery);

const commonDirectory = async (runtime: UnitOfWorkReviewCompletionRuntime, repositoryRoot: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim())); } catch { return undefined; }
};

export class UnitOfWorkReviewStageCompletion {
  constructor(private readonly contexts: AuditContextResolver, private readonly runtime: UnitOfWorkReviewCompletionRuntime) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<UnitOfWorkReviewCompletionResult> {
    if (!selectors.unit || selectors.stage !== "unit-of-work-review" || !selectors.attempt || selectors.task !== undefined || selectors.activity !== undefined || selectors.implementationAttempt !== undefined || selectors.mission !== undefined) {
      return fail("invalid_stage_completion_scope", "Unit of Work Review completion requires exactly --unit, --stage unit-of-work-review, and --attempt.");
    }
    if (!isUnitOfWorkReviewCompletionRecord(rawRequest)) return fail("invalid_review_completion_request", "The typed Unit of Work Review assessment failed validation.");
    const first = await this.contexts.readUnit(selectors.unit, project);
    if (first.kind === "failed") return propagateReadFailure(first);
    const commonDir = await commonDirectory(this.runtime, first.root);
    if (!commonDir) return fail("stage_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: first.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([first.missionId, selectors.unit, "stage", "unit-of-work-review"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: first.missionId,
        resource_scope: `construction/stage/${selectors.unit}/unit-of-work-review`,
        attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return fail(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: UnitOfWorkReviewCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== first.root || loaded.missionId !== first.missionId) result = fail("stage_scope_changed", "Unit membership changed while acquiring stage coordination.");
      else result = await this.completeLoaded(loaded, selectors.attempt, rawRequest);
    } catch (error) {
      result = fail("stage_completion_failed", "Kepler could not validate Unit of Work Review completion safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return fail("stage_coordination_release_failed", "The stage operation could not confirm that it released its coordination claim.", { ...released.details, operation_result: result.kind }, released.recovery);
    return result;
  }

  private async completeLoaded(loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>, attemptId: string, request: UnitOfWorkReviewCompletionRecord): Promise<UnitOfWorkReviewCompletionResult> {
    if (loaded.unit.workflow !== "standard") return fail("unsupported_workflow", "Unit of Work Review completion requires the recorded Standard workflow binding.");
    if (loaded.unit.blocked) return fail("stage_history_blocked", "Construction history or projection issues prevent safe Review completion.", { history_issues: loaded.unit.historyIssues, projection_issues: loaded.unit.projectionIssues });
    const stages = loaded.unit.stages;
    const stage = stages.find((candidate) => candidate.stage === "unit-of-work-review");
    const attempt = stage?.attempts.find((candidate) => candidate.attemptId === attemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt || attempt.state !== "running") return fail("stage_attempt_not_current", "The selected Unit of Work Review attempt is not the current running attempt.", { selected_attempt_id: attemptId, current_attempt_id: stage?.currentAttemptId, state: stage?.state });
    const starts = attempt.facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type));
    const start = starts.at(-1);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart) return fail("stage_attempt_start_missing", "The selected Review attempt has no validated start fact.");
    const priorCompletions: ConstructionHistoryFact[] = [];
    for (const prior of stages.slice(0, stages.indexOf(stage))) {
      const priorAttempt = prior.attempts.find((candidate) => candidate.attemptId === prior.currentAttemptId);
      const completions = priorAttempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
      if (completions.length !== 1 || !completions[0]) return fail("review_upstream_completion_missing", "Every preceding Standard stage requires one current validated completion.", { stage: prior.stage, attempt_id: prior.currentAttemptId });
      priorCompletions.push(completions[0]);
    }
    const authority = validateStageStartAuthority({
      stage: "unit-of-work-review", unitId: loaded.unit.unitId,
      authorityEventIds: dataOf(originalStart).authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: priorCompletions.map((fact) => String(fact.event.id)),
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") return fail("review_stage_start_authority_invalid", "The current Review attempt must bind every preceding completion and any authorized reopen chain.", authority.details);
    const implementationCompletion = priorCompletions.at(-1);
    if (!implementationCompletion || implementationCompletion.event.type !== "construction.stage-attempt-completed") return fail("review_implementation_completion_missing", "Review requires the current completed Implementation attempt.");
    const implementationData = dataOf(implementationCompletion);
    const completionReference = implementationData.implementation_assessment;
    const implementationAssessmentEvent = isRecord(completionReference) && typeof completionReference.assessment_event_id === "string"
      ? loaded.history.events.filter((record) => record.event?.id === completionReference.assessment_event_id).map((record) => record.event)[0]
      : undefined;
    const implementationAssessment = implementationAssessmentEvent?.type === "construction.implementation-completion-assessed" &&
      isImplementationCompletionAssessedData(implementationAssessmentEvent.data)
      ? implementationAssessmentEvent.data
      : undefined;
    if (!implementationAssessment || !isUnitOfWorkReviewCompletionRecord(request) ||
        request.implementation_completion_event_id !== implementationCompletion.event.id ||
        !sameArtifactBindings(request.reviewed_material_bindings, implementationAssessment.reviewed_material_bindings) ||
        checkpointKey(request.final_checkpoints) !== checkpointKey(implementationAssessment.final_checkpoints) ||
        checkpointKey(request.final_checkpoints) !== checkpointKey(implementationData.checkpoints)) return fail("review_material_binding_invalid", "Review must identify the current Implementation completion, reviewed material, and exact integrated checkpoints.");
    const persistedDirectory = loaded.unit.created?.event.type === "construction.unit-created" ? loaded.unit.created.event.data.directory : undefined;
    const functional = await readFunctionalDesignMaterial(loaded.root, loaded.missionId, loaded.unit.unitId, persistedDirectory);
    const quality = await readStageArtifactMaterial({ repositoryRoot: loaded.root, missionId: loaded.missionId, unitId: loaded.unit.unitId, persistedUnitDirectory: persistedDirectory, primaryArtifact: "quality.md", supportFolder: "quality-requirements" });
    const planning = await readPlanningMaterial(loaded, persistedDirectory);
    if (functional.kind !== "valid" || quality.kind !== "valid" || planning.kind !== "valid") return fail("review_upstream_material_invalid", "Review requires current valid Functional Design, Quality Requirements, Planning, and task-graph material.", {
      functional_design: functional.kind === "invalid" ? functional.diagnostics : [],
      quality: quality.kind === "invalid" ? quality.diagnostics : [],
      planning: planning.kind === "invalid" ? planning.diagnostics : [],
    });
    const currentMaterialBindings: ArtifactBinding[] = [
      ...functional.material.artifactBindings.map((binding) => ({ artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"], content_version: binding.content_version })),
      ...quality.material.artifactBindings,
      ...planning.material.artifactBindings,
    ];
    if (new Set(currentMaterialBindings.map((binding) => binding.artifact_id)).size !== currentMaterialBindings.length || !sameArtifactBindings(currentMaterialBindings, implementationAssessment.reviewed_material_bindings)) return fail("review_upstream_material_stale", "The current upstream artifacts or task graph differ from Implementation's reviewed material.");
    const recordHomeId = recordHomeRepositoryId(loaded.history.events);
    const finalCheckpoints = request.final_checkpoints;
    const recordHomeCheckpoint = recordHomeId ? finalCheckpoints.find((checkpoint) => checkpoint.repository_id === recordHomeId) : undefined;
    const artifactPaths = [
      ...functional.material.artifactPaths.map((path) => Path.join(functional.material.unitDirectory, path)),
      ...quality.material.artifactPaths.map((path) => Path.join(quality.material.unitDirectory, path)),
      ...planning.material.artifactPaths.map((path) => Path.join(planning.material.unitDirectory, path)),
      Path.join(planning.material.unitDirectory, "tasks-dag.json"),
    ];
    if (!recordHomeId || !recordHomeCheckpoint) return fail("review_record_home_checkpoint_missing", "The reviewed checkpoint set must contain the record-home repository.");
    const checkpointMaterial = await verifyStageCheckpointMaterial(this.runtime.workspace, { repositoryRoot: loaded.root, repositoryId: recordHomeId, checkpoint: recordHomeCheckpoint, artifactPaths });
    if (checkpointMaterial.kind === "invalid") return fail("review_checkpoint_material_mismatch", "Upstream artifacts and task graph must match the reviewed record-home checkpoint.", { artifact_paths: checkpointMaterial.artifactPaths });
    const currentCommonDir = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDir) return fail("stage_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const currentCheckpoints = await captureStageCheckpoints(this.runtime, loaded, currentCommonDir);
    if (currentCheckpoints.kind === "failed") return fail(currentCheckpoints.code, currentCheckpoints.message, currentCheckpoints.details);
    if (checkpointKey(currentCheckpoints.checkpoints) !== checkpointKey(finalCheckpoints)) return fail("review_checkpoint_stale", "The current integrated workspace checkpoint set differs from the Implementation result.", { expected: finalCheckpoints, actual: currentCheckpoints.checkpoints });
    const evidenceById = new Map<string, ConstructionHistoryFact[]>();
    for (const record of loaded.unit.evidence) {
      const fact = record.fact;
      const id = String(dataOf(fact).evidence_id ?? "");
      const matches = evidenceById.get(id) ?? [];
      matches.push(fact);
      evidenceById.set(id, matches);
    }
    const getEvidence = (id: string, check: string): ConstructionHistoryFact | undefined => {
      const matches = evidenceById.get(id) ?? [];
      const fact = matches.length === 1 ? matches[0] : undefined;
      const data = fact ? dataOf(fact) : {};
      return fact && fact.event.type === "construction.evidence-recorded" && data.stage === "unit-of-work-review" &&
        data.stage_attempt_id === attemptId && data.task_id === undefined && data.activity === undefined && data.check === check &&
        isRecord(data.result) && data.result.status === "passed" &&
        sameArtifactBindings(data.artifact_bindings, request.reviewed_material_bindings) &&
        checkpointKey(data.checkpoints) === checkpointKey(finalCheckpoints) &&
        fact.event.caused_by.includes(start.event.id) ? fact : undefined;
    };
    const implementationEvidence = getEvidence(String(request.implementation_evidence_assessment_id), "implementation-evidence-assessment");
    const reviewEvidence = getEvidence(String(request.review_evidence_id), "unit-of-work-review");
    const selfReviewEvidence = getEvidence(String(request.self_review_evidence_id), "unit-of-work-review-self-review");
    if (!implementationEvidence || !reviewEvidence || !selfReviewEvidence || request.findings.blocking.length > 0 || request.handoff.status !== "ready") return fail("review_evidence_or_findings_invalid", "Implementation evidence, independent whole-unit review, self-review, resolved findings, and ready Deliver handoff are required.");
    const implementationEvidenceIds = implementationAssessment.required_check_evidence_ids.map(String);
    const implementationAuthors = [...new Set(implementationEvidenceIds.flatMap((id) => {
      const evidence = (evidenceById.get(id) ?? [])[0];
      const data = evidence ? dataOf(evidence) : {};
      return evidence?.event.type === "construction.evidence-recorded" && data.activity === "code-generation" && nonEmpty(data.executor) ? [data.executor] : [];
    }))].sort();
    if (implementationAuthors.length === 0 || !sameSet(request.implementation_authors, implementationAuthors) ||
        !nonEmpty(request.reviewer) || request.implementation_authors.includes(request.reviewer)) return fail("reviewer_not_independent", "The whole-unit reviewer must be identified by the review evidence and differ from all Code Generation evidence authors.", { expected_implementation_authors: implementationAuthors, reviewer: request.reviewer });
    const reviewEvidenceData = dataOf(reviewEvidence);
    const selfReviewEvidenceData = dataOf(selfReviewEvidence);
    if (reviewEvidenceData.executor !== request.reviewer || selfReviewEvidenceData.executor !== request.reviewer) return fail("reviewer_evidence_identity_mismatch", "Whole-unit review and self-review evidence executors must match the recorded independent reviewer.");
    const usedEvidenceIds = [request.implementation_evidence_assessment_id, request.review_evidence_id, request.self_review_evidence_id];
    const additionalCauseFacts: ConstructionHistoryFact[] = [];
    if (request.additional_review.requested) {
      const additionalReview = request.additional_review;
      const requestEvents = loaded.unit.interactions.filter((fact) => fact.event.id === additionalReview.request_event_id);
      const reviewRequest = requestEvents.length === 1 ? requestEvents[0] : undefined;
      const externalEvidence = getEvidence(String(request.additional_review.evidence_id), "unit-of-work-review-additional-review");
      if (!reviewRequest || reviewRequest.event.type !== "construction.interaction-recorded" || dataOf(reviewRequest).stage !== "unit-of-work-review" ||
          dataOf(reviewRequest).stage_attempt_id !== attemptId || !hasRequesterParticipant(dataOf(reviewRequest).participants) ||
          !reviewRequest.event.caused_by.includes(start.event.id) || !externalEvidence ||
          !externalEvidence.event.caused_by.includes(reviewRequest.event.id) || dataOf(externalEvidence).executor !== request.additional_review.reviewer ||
          request.additional_review.findings.length > 0 || request.additional_review.reviewer === request.reviewer ||
          request.implementation_authors.includes(request.additional_review.reviewer)) return fail("review_additional_review_invalid", "Requested additional review must be requester-originated, current, independent, and free of blocking findings.");
      usedEvidenceIds.push(request.additional_review.evidence_id);
      additionalCauseFacts.push(reviewRequest);
    }
    const approvalFact = request.acceptance_required
      ? loaded.unit.approvals.map((record) => record.fact).find((fact) => fact.event.id === request.approval_event_id)
      : undefined;
    if (request.acceptance_required) {
      const approvalData = approvalFact ? dataOf(approvalFact) : {};
      if (!approvalFact || approvalFact.event.type !== "construction.approval-recorded" || approvalData.stage !== "unit-of-work-review" ||
          approvalData.stage_attempt_id !== attemptId || !sameArtifactBindings(approvalData.artifact_bindings, request.reviewed_material_bindings) ||
          checkpointKey(approvalData.checkpoints) !== checkpointKey(finalCheckpoints) || !approvalFact.event.caused_by.includes(start.event.id)) return fail("review_acceptance_missing", "Required requester acceptance must bind the current Review attempt, material, and checkpoints.");
    } else if (request.approval_event_id !== undefined) return fail("review_unexpected_acceptance", "Requester acceptance must not be recorded unless required by authority or instruction.");
    const evidenceIds = [...new Set(usedEvidenceIds.map(String))].sort();
    if (evidenceIds.length !== usedEvidenceIds.length) return fail("review_evidence_duplicate", "Review evidence identities must be distinct.");
    const currentCommonDirectory = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDirectory) return fail("stage_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const actualCheckpoints = await captureStageCheckpoints(this.runtime, loaded, currentCommonDirectory);
    if (actualCheckpoints.kind === "failed") return fail(actualCheckpoints.code, actualCheckpoints.message, actualCheckpoints.details);
    if (checkpointKey(actualCheckpoints.checkpoints) !== checkpointKey(finalCheckpoints)) return fail("review_checkpoint_stale", "The final Review checkpoint set must remain identical to the Implementation result.");
    const verifyEvidence = async (fact: ConstructionHistoryFact): Promise<boolean> => {
      const verified = await verifyStageCheckpointSet(this.runtime.workspace, currentCheckpoints.repositoryRoots, dataOf(fact).checkpoints);
      return verified.kind === "valid";
    };
    for (const fact of [implementationEvidence, reviewEvidence, selfReviewEvidence, ...additionalCauseFacts, ...(approvalFact ? [approvalFact] : [])]) {
      if (fact.event.type === "construction.evidence-recorded" && !(await verifyEvidence(fact))) return fail("review_evidence_checkpoint_invalid", "Review evidence checkpoints must resolve in their selected repository workspaces.", { event_id: fact.event.id });
    }
    const eventId = this.runtime.identities.next();
    const journalId = this.runtime.identities.next();
    const existingIds = new Set(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    if (!uuidV4(eventId) || !uuidV4(journalId) || eventId === journalId || existingIds.has(eventId) || existingIds.has(journalId)) return fail("stage_completion_identity_failed", "Kepler could not allocate distinct unused event and journal identities.");
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return fail("stage_completion_journal_identity_conflict", "The allocated stage journal identity already has a filesystem entry.", { journal_id: journalId });
    const candidate = {
      id: eventId, phase: CONSTRUCTION_PHASE, type: "construction.stage-attempt-completed", envelope_version: 1,
      event_version: CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION, journal_id: journalId, recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([start.event.id, implementationCompletion.event.id, ...priorCompletions.map((fact) => fact.event.id), ...usedEvidenceIds.map((id) => (evidenceById.get(String(id)) ?? [])[0]?.event.id).filter((id): id is EventId => id !== undefined), ...additionalCauseFacts.map((fact) => fact.event.id), ...(approvalFact ? [approvalFact.event.id] : [])])],
      data: {
        mission_id: loaded.missionId as MissionId, unit_id: loaded.unit.unitId as UnitId,
        stage: "unit-of-work-review", stage_attempt_id: attemptId as StageAttemptId,
        evidence_ids: evidenceIds, checkpoints: actualCheckpoints.checkpoints,
        unit_of_work_review_assessment: request,
      },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") return fail("stage_completion_event_invalid", "The typed Unit of Work Review completion event failed Construction validation.", { issues: validation.status === "invalid" ? validation.issues : [validation.reason] });
    try { await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event); }
    catch (error) { return fail("stage_completion_append_failed", "Kepler could not durably append Unit of Work Review completion.", { journal_id: journalId, message: error instanceof Error ? error.message : String(error) }, "Inspect the selected history journals for the exact event before retrying; preserve uncertain effects."); }
    return { kind: "success", data: { id: validation.event.id, journal_id: validation.event.journal_id, unit_id: loaded.unit.unitId, stage: "unit-of-work-review", attempt_id: attemptId, evidence_ids: evidenceIds, ...(approvalFact ? { approval_event_id: approvalFact.event.id } : {}) } };
  }
}

export const createNodeUnitOfWorkReviewCompletionRuntime = (producer: { readonly name: string; readonly version: string }): UnitOfWorkReviewCompletionRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return { workspace, identities: { next: randomUUID }, now: () => new Date().toISOString(), producer, journals: { create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: CONSTRUCTION_PHASE }) } };
};
