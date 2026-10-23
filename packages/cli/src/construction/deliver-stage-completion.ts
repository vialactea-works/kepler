import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { CONSTRUCTION_DELIVER_COMPLETION_EVENT_VERSION, CONSTRUCTION_PHASE, isDeliverCompletionRecord, isUnitOfWorkReviewCompletionRecord, validateConstructionEvent, type DeliverCompletionRecord, type MissionId, type StageAttemptId, type UnitId } from "./events.js";
import { sameArtifactBindings } from "./functional-design-completion.js";
import { readStageArtifactMaterial } from "./stage-artifact-material.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointMaterial, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import type { ConstructionHistoryFact } from "./projection.js";

export interface DeliverStageCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: { readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal };
}

export type DeliverStageCompletionResult =
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
const dataOf = (fact: ConstructionHistoryFact): Record<string, unknown> => isRecord(fact.event.data) ? fact.event.data : {};
const fail = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, recovery = "Resolve the reported condition and retry the exact Deliver attempt."): DeliverStageCompletionResult => ({ kind: "failed", data: { code, message, details, recovery } });
const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): DeliverStageCompletionResult => fail(result.code, result.message, result.details, result.recovery);
const commonDirectory = async (runtime: DeliverStageCompletionRuntime, repositoryRoot: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim())); } catch { return undefined; }
};

export class DeliverStageCompletion {
  constructor(private readonly contexts: AuditContextResolver, private readonly runtime: DeliverStageCompletionRuntime) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<DeliverStageCompletionResult> {
    if (!selectors.unit || selectors.stage !== "deliver" || !selectors.attempt || selectors.task !== undefined || selectors.activity !== undefined || selectors.implementationAttempt !== undefined || selectors.mission !== undefined) return fail("invalid_stage_completion_scope", "Deliver completion requires exactly --unit, --stage deliver, and --attempt.");
    if (!isDeliverCompletionRecord(rawRequest)) return fail("invalid_deliver_completion_request", "The typed Deliver assessment failed validation.");
    const first = await this.contexts.readUnit(selectors.unit, project);
    if (first.kind === "failed") return propagateReadFailure(first);
    const commonDir = await commonDirectory(this.runtime, first.root);
    if (!commonDir) return fail("stage_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: first.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([first.missionId, selectors.unit, "stage", "deliver"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: first.missionId,
        resource_scope: `construction/stage/${selectors.unit}/deliver`,
        attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return fail(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: DeliverStageCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== first.root || loaded.missionId !== first.missionId) result = fail("stage_scope_changed", "Unit membership changed while acquiring stage coordination.");
      else result = await this.completeLoaded(loaded, selectors.attempt, rawRequest);
    } catch (error) {
      result = fail("stage_completion_failed", "Kepler could not validate Deliver completion safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") return fail("stage_coordination_release_failed", "The stage operation could not confirm that it released its coordination claim.", { ...released.details, operation_result: result.kind }, released.recovery);
    return result;
  }

  private async completeLoaded(loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>, attemptId: string, request: DeliverCompletionRecord): Promise<DeliverStageCompletionResult> {
    if (loaded.unit.workflow !== "standard") return fail("unsupported_workflow", "Deliver completion requires the recorded Standard workflow binding.");
    if (loaded.unit.blocked) return fail("stage_history_blocked", "Construction history or projection issues prevent safe Deliver completion.", { history_issues: loaded.unit.historyIssues, projection_issues: loaded.unit.projectionIssues });
    const stages = loaded.unit.stages;
    const stage = stages.find((candidate) => candidate.stage === "deliver");
    const attempt = stage?.attempts.find((candidate) => candidate.attemptId === attemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt || attempt.state !== "running") return fail("stage_attempt_not_current", "The selected Deliver attempt is not the current running attempt.", { selected_attempt_id: attemptId, current_attempt_id: stage?.currentAttemptId, state: stage?.state });
    const starts = attempt.facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type));
    const start = starts.at(-1);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart) return fail("stage_attempt_start_missing", "The selected Deliver attempt has no validated start fact.");
    const priorCompletions: ConstructionHistoryFact[] = [];
    for (const prior of stages.slice(0, stages.indexOf(stage))) {
      const priorAttempt = prior.attempts.find((candidate) => candidate.attemptId === prior.currentAttemptId);
      const completions = priorAttempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
      if (completions.length !== 1 || !completions[0]) return fail("deliver_upstream_completion_missing", "Every preceding Standard stage requires one current validated completion.", { stage: prior.stage, attempt_id: prior.currentAttemptId });
      priorCompletions.push(completions[0]);
    }
    const authority = validateStageStartAuthority({
      stage: "deliver", unitId: loaded.unit.unitId,
      authorityEventIds: dataOf(originalStart).authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: priorCompletions.map((fact) => String(fact.event.id)),
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") return fail("deliver_stage_start_authority_invalid", "The current Deliver attempt must bind every preceding completion and any authorized reopen chain.", authority.details);
    const reviewCompletion = priorCompletions.at(-1);
    if (!reviewCompletion || reviewCompletion.event.type !== "construction.stage-attempt-completed" ||
        reviewCompletion.event.data.stage !== "unit-of-work-review" ||
        !isUnitOfWorkReviewCompletionRecord(reviewCompletion.event.data.unit_of_work_review_assessment)) return fail("deliver_review_completion_missing", "Deliver requires the current typed Unit of Work Review completion.");
    const outcomeRequests = loaded.unit.interactions.filter((fact) => fact.event.id === request.outcome_request_event_id);
    const outcomeRequest = outcomeRequests.length === 1 ? outcomeRequests[0] : undefined;
    const recordedOutcome = outcomeRequest ? dataOf(outcomeRequest).delivery_outcome : undefined;
    if (!outcomeRequest || outcomeRequest.event.type !== "construction.interaction-recorded" ||
        dataOf(outcomeRequest).stage !== "deliver" || dataOf(outcomeRequest).stage_attempt_id !== attemptId ||
        dataOf(outcomeRequest).task_id !== undefined || dataOf(outcomeRequest).activity !== undefined ||
        dataOf(outcomeRequest).activity_attempt_id !== undefined || !hasRequesterParticipant(dataOf(outcomeRequest).participants) ||
        !outcomeRequest.event.caused_by.includes(start.event.id) || !isRecord(recordedOutcome) ||
        recordedOutcome.outcome !== request.outcome || recordedOutcome.requested_outcome !== request.requested_outcome ||
        recordedOutcome.destination !== request.destination || recordedOutcome.recipient !== request.recipient) {
      return fail("deliver_outcome_request_invalid", "The typed outcome, destination, and recipient must match the current requester interaction recorded before delivery.", { outcome_request_event_id: request.outcome_request_event_id });
    }
    const reviewAssessment = reviewCompletion.event.data.unit_of_work_review_assessment;
    if (request.review_completion_event_id !== reviewCompletion.event.id || request.handoff.status !== "ready" ||
        checkpointKey(request.reviewed_checkpoints) !== checkpointKey(reviewAssessment.final_checkpoints) ||
        reviewAssessment.handoff.status !== "ready") return fail("deliver_review_binding_invalid", "Deliver must bind the current ready Review result and its reviewed checkpoint set.");
    const persistedDirectory = loaded.unit.created?.event.type === "construction.unit-created" ? loaded.unit.created.event.data.directory : undefined;
    const deliveryMaterial = await readStageArtifactMaterial({ repositoryRoot: loaded.root, missionId: loaded.missionId, unitId: loaded.unit.unitId, persistedUnitDirectory: persistedDirectory, primaryArtifact: "delivery.md", supportFolder: "deliver" });
    if (deliveryMaterial.kind !== "valid") return fail("deliver_instructions_invalid", "The current delivery.md and linked Deliver support failed artifact validation.", { diagnostics: deliveryMaterial.diagnostics });
    const expectedBindings = [...reviewAssessment.reviewed_material_bindings, ...deliveryMaterial.material.artifactBindings];
    if (new Set(expectedBindings.map((binding) => binding.artifact_id)).size !== expectedBindings.length || !sameArtifactBindings(request.artifact_bindings, expectedBindings)) return fail("deliver_material_binding_invalid", "Delivery evidence must bind the reviewed material and current delivery instructions by identity and content hash.");
    const currentCommonDir = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDir) return fail("stage_coordination_unavailable", "Git could not resolve the record home's common directory.");
    const actualCheckpoints = await captureStageCheckpoints(this.runtime, loaded, currentCommonDir);
    if (actualCheckpoints.kind === "failed") return fail(actualCheckpoints.code, actualCheckpoints.message, actualCheckpoints.details);
    const reviewedCheckpointsKey = checkpointKey(request.reviewed_checkpoints);
    if (!reviewedCheckpointsKey || reviewedCheckpointsKey === "[]") return fail("deliver_review_checkpoint_invalid", "Deliver requires a non-empty reviewed source checkpoint set.");
    const reviewedCheckpointSet = await verifyStageCheckpointSet(this.runtime.workspace, actualCheckpoints.repositoryRoots, request.reviewed_checkpoints);
    if (reviewedCheckpointSet.kind === "invalid") return fail("deliver_review_checkpoint_invalid", "The reviewed source checkpoints must resolve in the selected repository workspaces.", {
      repository_ids: reviewedCheckpointSet.repositoryIds, invalid_commits: reviewedCheckpointSet.invalidCommits,
    });
    const recordHomeId = recordHomeRepositoryId(loaded.history.events);
    const recordHomeCheckpoint = recordHomeId ? actualCheckpoints.checkpoints.find((checkpoint) => checkpoint.repository_id === recordHomeId) : undefined;
    if (!recordHomeId || !recordHomeCheckpoint) return fail("deliver_record_home_checkpoint_missing", "The current delivery checkpoint set must include the record-home repository.");
    const artifactPaths = deliveryMaterial.material.artifactPaths.map((path) => Path.join(deliveryMaterial.material.unitDirectory, path));
    const checkpointMaterial = await verifyStageCheckpointMaterial(this.runtime.workspace, { repositoryRoot: loaded.root, repositoryId: recordHomeId, checkpoint: recordHomeCheckpoint, artifactPaths });
    if (checkpointMaterial.kind === "invalid") return fail("deliver_checkpoint_material_mismatch", "delivery.md and linked Deliver support must match the record-home delivery checkpoint.", { artifact_paths: checkpointMaterial.artifactPaths });
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
      return fact && fact.event.type === "construction.evidence-recorded" && data.stage === "deliver" &&
        data.stage_attempt_id === attemptId && data.task_id === undefined && data.activity === undefined && data.check === check &&
        isRecord(data.result) && data.result.status === "passed" && sameArtifactBindings(data.artifact_bindings, request.artifact_bindings) &&
        checkpointKey(data.checkpoints) === checkpointKey(actualCheckpoints.checkpoints) && fact.event.caused_by.includes(start.event.id) ? fact : undefined;
    };
    const preparation = getEvidence(String(request.preparation_evidence_id), "deliver-preparation");
    const selfReview = getEvidence(String(request.self_review_evidence_id), "deliver-self-review");
    const handoff = getEvidence(String(request.handoff_evidence_id), "deliver-recipient-handoff");
    if (!preparation || !selfReview || !handoff) return fail("deliver_preparation_evidence_invalid", "Current delivery preparation, self-review, and recipient-handoff evidence must pass and bind the delivery instructions.");
    const operationFacts: ConstructionHistoryFact[] = [];
    const authorityFacts: ConstructionHistoryFact[] = [];
    for (const operation of request.operation_results) {
      if (checkpointKey(operation.source_checkpoints) !== reviewedCheckpointsKey) return fail("deliver_source_provenance_invalid", "Every delivery operation must identify the exact source checkpoints accepted by Unit of Work Review.", { operation: operation.operation, expected: request.reviewed_checkpoints, actual: operation.source_checkpoints });
      if (operation.status !== "succeeded") return fail("deliver_operation_incomplete", "Failed or partial delivery operations cannot complete the Deliver stage.", { operation: operation.operation, status: operation.status });
      const operationEvidence = getEvidence(String(operation.evidence_id), "deliver-operation-result");
      const operationEvidenceData = operationEvidence ? dataOf(operationEvidence) : {};
      if (!operationEvidence || !Array.isArray(operationEvidenceData.output_refs) || operationEvidenceData.output_refs.length === 0 ||
          !operationEvidence.event.caused_by.includes(outcomeRequest.event.id)) return fail("deliver_operation_evidence_invalid", "Each successful delivery operation requires retained effect evidence that follows the requested outcome.", { operation: operation.operation, evidence_id: operation.evidence_id });
      operationFacts.push(operationEvidence);
      const authorityRecord = operation.authority;
      if (authorityRecord.kind === "requester-instruction") {
        const interactions = loaded.unit.interactions.filter((fact) => fact.event.id === authorityRecord.event_id);
        const instruction = interactions.length === 1 ? interactions[0] : undefined;
        const instructionData = instruction ? dataOf(instruction) : {};
        if (!instruction || instruction.event.type !== "construction.interaction-recorded" || instructionData.stage !== "deliver" ||
            instructionData.stage_attempt_id !== attemptId || !hasRequesterParticipant(instructionData.participants) ||
            !instruction.event.caused_by.includes(start.event.id) || !Array.isArray(instructionData.references) || instructionData.references.length === 0 ||
            !operationEvidence.event.caused_by.includes(instruction.event.id)) return fail("deliver_operation_authority_invalid", "Requester-instruction authority must identify a current requester interaction before the operation.", { operation: operation.operation, authority_event_id: authorityRecord.event_id });
        authorityFacts.push(instruction);
      }
    }
    if (request.outcome !== "repository-handoff" && request.operation_results.length === 0) return fail("deliver_operation_missing", "The requested outcome requires at least one completed authorized operation.", { outcome: request.outcome });
    const verificationIds = request.verification_evidence_ids.map(String);
    if (verificationIds.length === 0) return fail("deliver_verification_missing", "Deliver requires current verification evidence for the requested outcome.");
    const verificationFacts = verificationIds.map((id) => getEvidence(id, "deliver-outcome-verification"));
    if (verificationFacts.some((fact) => fact === undefined)) return fail("deliver_verification_invalid", "Every delivery outcome verification must pass against current material and checkpoints.");
    for (const verification of verificationFacts) {
      if (!verification || !verification.event.caused_by.includes(outcomeRequest.event.id) ||
          operationFacts.some((operation) => !verification.event.caused_by.includes(operation.event.id))) {
        return fail("deliver_verification_provenance_invalid", "Every outcome verification must causally follow the selected outcome and each delivery operation result it verifies.");
      }
    }
    const additionalReviewFacts: ConstructionHistoryFact[] = [];
    const additionalEvidenceIds: string[] = [];
    const additionalReview = request.additional_review;
    if (additionalReview?.requested) {
      const interactions = loaded.unit.interactions.filter((fact) => fact.event.id === additionalReview.request_event_id);
      const reviewRequest = interactions.length === 1 ? interactions[0] : undefined;
      const additionalEvidence = getEvidence(String(additionalReview.evidence_id), "deliver-additional-review");
      if (!reviewRequest || reviewRequest.event.type !== "construction.interaction-recorded" || dataOf(reviewRequest).stage !== "deliver" ||
          dataOf(reviewRequest).stage_attempt_id !== attemptId || !hasRequesterParticipant(dataOf(reviewRequest).participants) ||
          !reviewRequest.event.caused_by.includes(start.event.id) || !additionalEvidence ||
          !additionalEvidence.event.caused_by.includes(reviewRequest.event.id) || dataOf(additionalEvidence).executor !== additionalReview.reviewer ||
          additionalReview.findings.length > 0) return fail("deliver_additional_review_invalid", "Requested additional review must be requester-originated, current, and free of blocking findings.");
      additionalReviewFacts.push(reviewRequest);
      additionalEvidenceIds.push(String(additionalReview.evidence_id));
    }
    if (request.approval_required) {
      const approval = loaded.unit.approvals.map((record) => record.fact).find((fact) => fact.event.id === request.approval_event_id);
      const approvalData = approval ? dataOf(approval) : {};
      if (!approval || approval.event.type !== "construction.approval-recorded" || approvalData.stage !== "deliver" ||
          approvalData.stage_attempt_id !== attemptId || !sameArtifactBindings(approvalData.artifact_bindings, request.artifact_bindings) ||
          checkpointKey(approvalData.checkpoints) !== checkpointKey(actualCheckpoints.checkpoints) || !approval.event.caused_by.includes(start.event.id)) return fail("deliver_approval_missing", "Applicable requester approval must bind the current Deliver attempt, material, and checkpoint.");
      authorityFacts.push(approval);
    } else if (request.approval_event_id !== undefined) return fail("deliver_unexpected_approval", "Requester approval must not be recorded unless an applicable authority rule or instruction requires it.");
    const handoffOutputRefs = dataOf(handoff).output_refs;
    const verificationOutputsValid = verificationFacts.every((fact) => {
      const outputRefs = fact ? dataOf(fact).output_refs : undefined;
      return Array.isArray(outputRefs) && outputRefs.length > 0;
    });
    if (operationFacts.some((fact) => !handoff.event.caused_by.includes(fact.event.id)) ||
        verificationFacts.some((fact) => fact && !handoff.event.caused_by.includes(fact.event.id)) ||
        !handoff.event.caused_by.includes(preparation.event.id) ||
        !handoff.event.caused_by.includes(selfReview.event.id) || !Array.isArray(handoffOutputRefs) ||
        handoffOutputRefs.length === 0 || !verificationOutputsValid) return fail("deliver_handoff_provenance_invalid", "Recipient handoff evidence must retain the actual result and depend on preparation, every operation, and every outcome verification.");
    for (const fact of [preparation, selfReview, handoff, ...operationFacts, ...verificationFacts.filter((fact): fact is ConstructionHistoryFact => fact !== undefined)]) {
      const verified = await verifyStageCheckpointSet(this.runtime.workspace, actualCheckpoints.repositoryRoots, dataOf(fact).checkpoints);
      if (verified.kind === "invalid") return fail("deliver_evidence_checkpoint_invalid", "Deliver evidence checkpoints must resolve in the selected repository workspaces.", { event_id: fact.event.id });
    }
    const evidenceIds = [...new Set([
      String(request.preparation_evidence_id), String(request.self_review_evidence_id), ...request.operation_results.map((operation) => String(operation.evidence_id)),
      ...verificationIds, String(request.handoff_evidence_id), ...additionalEvidenceIds,
    ])].sort();
    const expectedEvidenceCount = 3 + request.operation_results.length + verificationIds.length + additionalEvidenceIds.length;
    if (evidenceIds.length !== expectedEvidenceCount) return fail("deliver_evidence_duplicate", "Deliver evidence identities must be distinct.");
    const eventId = this.runtime.identities.next();
    const journalId = this.runtime.identities.next();
    const existingIds = new Set(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    if (!uuidV4(eventId) || !uuidV4(journalId) || eventId === journalId || existingIds.has(eventId) || existingIds.has(journalId)) return fail("stage_completion_identity_failed", "Kepler could not allocate distinct unused event and journal identities.");
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return fail("stage_completion_journal_identity_conflict", "The allocated stage journal identity already has a filesystem entry.", { journal_id: journalId });
    const causeIds = [
      start.event.id, ...priorCompletions.map((fact) => fact.event.id), reviewCompletion.event.id, outcomeRequest.event.id,
      preparation.event.id, selfReview.event.id, handoff.event.id, ...operationFacts.map((fact) => fact.event.id),
      ...verificationFacts.flatMap((fact) => fact ? [fact.event.id] : []), ...authorityFacts.map((fact) => fact.event.id),
      ...additionalReviewFacts.map((fact) => fact.event.id), ...additionalEvidenceIds.map((id) => (evidenceById.get(id) ?? [])[0]?.event.id).filter((id): id is EventId => id !== undefined),
    ];
    const candidate = {
      id: eventId, phase: CONSTRUCTION_PHASE, type: "construction.stage-attempt-completed", envelope_version: 1,
      event_version: CONSTRUCTION_DELIVER_COMPLETION_EVENT_VERSION, journal_id: journalId, recorded_at: this.runtime.now(),
      producer: this.runtime.producer, caused_by: [...new Set(causeIds)],
      data: { mission_id: loaded.missionId as MissionId, unit_id: loaded.unit.unitId as UnitId, stage: "deliver", stage_attempt_id: attemptId as StageAttemptId, evidence_ids: evidenceIds, checkpoints: actualCheckpoints.checkpoints, deliver_assessment: request },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") return fail("stage_completion_event_invalid", "The typed Deliver completion event failed Construction validation.", { issues: validation.status === "invalid" ? validation.issues : [validation.reason] });
    try { await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event); }
    catch (error) { return fail("stage_completion_append_failed", "Kepler could not durably append Deliver completion.", { journal_id: journalId, message: error instanceof Error ? error.message : String(error) }, "Inspect the selected history journals for the exact event before retrying; preserve uncertain effects."); }
    return { kind: "success", data: { id: validation.event.id, journal_id: validation.event.journal_id, unit_id: loaded.unit.unitId, stage: "deliver", attempt_id: attemptId, outcome: request.outcome, evidence_ids: evidenceIds, ...(request.approval_event_id ? { approval_event_id: request.approval_event_id } : {}) } };
  }
}

export const createNodeDeliverStageCompletionRuntime = (producer: { readonly name: string; readonly version: string }): DeliverStageCompletionRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return { workspace, identities: { next: randomUUID }, now: () => new Date().toISOString(), producer, journals: { create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: CONSTRUCTION_PHASE }) } };
};
