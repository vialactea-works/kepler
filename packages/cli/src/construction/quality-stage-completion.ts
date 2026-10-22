import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { readFunctionalDesignMaterial } from "./stage-completion.js";
import { readStageArtifactMaterial, type StageArtifactMaterial } from "./stage-artifact-material.js";
import {
  CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ArtifactBinding,
  type FunctionalDesignCompletionRecord,
  type MissionId,
  type StageAttemptId,
  type UnitId,
} from "./events.js";
import {
  readFunctionalDesignCompletionRecord,
  sameArtifactBindings,
} from "./functional-design-completion.js";
import {
  qualityRequirementsEvidenceIds,
  validateQualityRequirementsCompletionRequest,
  type QualityRequirementsCompletionRecord,
  type QualityRequirementsCompletionRequest,
} from "./quality-requirements-completion.js";
import type { ConstructionHistoryFact } from "./projection.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointMaterial, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";

export interface QualityStageCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type QualityStageCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

interface ValidQualityMaterialFacts {
  readonly evidence: readonly ConstructionHistoryFact[];
  readonly approval: ConstructionHistoryFact;
  readonly requestEvent?: ConstructionHistoryFact;
  readonly checkpoints: readonly unknown[];
}

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry the exact Quality Requirements attempt.",
): QualityStageCompletionResult => ({ kind: "failed", data: { code, message, details, recovery } });

const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): QualityStageCompletionResult =>
  failure(result.code, result.message, result.details, result.recovery);

const checkpointKey = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const checkpoints: string[] = [];
  const repositories = new Set<string>();
  for (const checkpoint of value) {
    if (!isRecord(checkpoint) || !isNonEmpty(checkpoint.repository_id) || !isNonEmpty(checkpoint.commit) || repositories.has(checkpoint.repository_id)) return undefined;
    repositories.add(checkpoint.repository_id);
    checkpoints.push(`${checkpoint.repository_id}\0${checkpoint.commit}`);
  }
  return JSON.stringify(checkpoints.sort());
};

const latestAttemptStart = (facts: readonly ConstructionHistoryFact[]): ConstructionHistoryFact | undefined =>
  facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)).at(-1);

const commonDirectory = async (
  runtime: QualityStageCompletionRuntime,
  repositoryRoot: string,
): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim()));
  } catch {
    return undefined;
  }
};

const currentFunctionalDesignRecord = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
): { readonly kind: "valid"; readonly record: FunctionalDesignCompletionRecord; readonly completion: ConstructionHistoryFact } | {
  readonly kind: "invalid";
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const stage = loaded.unit.stages.find((candidate) => candidate.stage === "functional-design");
  const attempt = stage?.attempts.find((candidate) => candidate.attemptId === stage.currentAttemptId);
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
  const record = readFunctionalDesignCompletionRecord(completions[0]?.event.data.functional_design_assessment);
  if (!stage || stage.state !== "completed" || completions.length !== 1 || !record) {
    return { kind: "invalid", details: { state: stage?.state, current_attempt_id: stage?.currentAttemptId, completion_events: completions.length } };
  }
  return { kind: "valid", record, completion: completions[0]! };
};

const requesterRequirementEvent = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  eventId: EventId,
  stage: "quality-requirements",
  attemptId: string,
  startEventId: EventId,
): ConstructionHistoryFact | undefined => {
  const matches = loaded.unit.interactions.filter((fact) => fact.event.id === eventId);
  const fact = matches.length === 1 ? matches[0] : undefined;
  if (!fact || fact.event.type !== "construction.interaction-recorded" || fact.event.data.stage !== stage ||
      fact.event.data.stage_attempt_id !== attemptId || !hasRequesterParticipant(fact.event.data.participants) ||
      !fact.event.caused_by.includes(startEventId)) return undefined;
  return fact;
};

const validateQualityMaterialFacts = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  stageAttemptId: string,
  startEventId: EventId,
  request: QualityRequirementsCompletionRequest,
  artifactBindings: StageArtifactMaterial["artifactBindings"],
): { readonly kind: "valid"; readonly facts: ValidQualityMaterialFacts } | {
  readonly kind: "invalid";
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const assessments = request.assessments;
  const named: { readonly kind: "artifact_validation" | "self_review" | "external_review"; readonly evidenceId: string; readonly check: string }[] = [
    { kind: "artifact_validation", evidenceId: assessments.artifact_validation.evidence_id, check: "quality-artifact-validation" },
    { kind: "self_review", evidenceId: assessments.self_review.evidence_id, check: "quality-self-review" },
    ...(assessments.external_review.requested ? [{ kind: "external_review" as const, evidenceId: assessments.external_review.evidence_id, check: "quality-external-review" }] : []),
  ];
  let requestEvent: ConstructionHistoryFact | undefined;
  if (assessments.external_review.requested) {
    requestEvent = requesterRequirementEvent(
      loaded,
      assessments.external_review.request_event_id,
      "quality-requirements",
      stageAttemptId,
      startEventId,
    );
    if (!requestEvent) {
      return { kind: "invalid", details: { request_event_id: assessments.external_review.request_event_id, reason: "external review has no matching requester request in this attempt" } };
    }
  }
  const evidence: ConstructionHistoryFact[] = [];
  let selectedCheckpoints: readonly unknown[] = [];
  for (const item of named) {
    const matches = loaded.unit.evidence.map((entry) => entry.fact).filter((fact) => fact.event.data.evidence_id === item.evidenceId);
    const fact = matches.length === 1 ? matches[0] : undefined;
    if (!fact || fact.event.type !== "construction.evidence-recorded" ||
        fact.event.data.mission_id !== loaded.missionId || fact.event.data.unit_id !== loaded.unit.unitId ||
        fact.event.data.stage !== "quality-requirements" || fact.event.data.stage_attempt_id !== stageAttemptId ||
        fact.event.data.check !== item.check || !isRecord(fact.event.data.result) || fact.event.data.result.status !== "passed" ||
        !sameArtifactBindings(fact.event.data.artifact_bindings, artifactBindings) ||
        !fact.event.caused_by.includes(startEventId) ||
        (item.kind === "external_review" && (!requestEvent || !fact.event.caused_by.includes(requestEvent.event.id)))) {
      return { kind: "invalid", details: { evidence: item.kind, evidence_id: item.evidenceId, reason: "missing, failed, stale-attempt, or stale-material evidence" } };
    }
    const observedKey = checkpointKey(fact.event.data.checkpoints);
    if (observedKey === undefined || observedKey === "[]" || !Array.isArray(fact.event.data.checkpoints)) {
      return { kind: "invalid", details: { evidence: item.kind, evidence_id: item.evidenceId, reason: "named evidence requires its own valid non-empty checkpoint set" } };
    }
    if (selectedCheckpoints.length === 0) selectedCheckpoints = fact.event.data.checkpoints;
    evidence.push(fact);
  }
  const approvalMatches = loaded.unit.approvals.map((entry) => entry.fact).filter((fact) => String(fact.event.id) === request.approval_event_id);
  const approval = approvalMatches.length === 1 ? approvalMatches[0] : undefined;
  if (!approval || approval.event.type !== "construction.approval-recorded" ||
      approval.event.data.mission_id !== loaded.missionId || approval.event.data.unit_id !== loaded.unit.unitId ||
      approval.event.data.stage !== "quality-requirements" || approval.event.data.stage_attempt_id !== stageAttemptId ||
      !sameArtifactBindings(approval.event.data.artifact_bindings, artifactBindings) ||
    checkpointKey(approval.event.data.checkpoints) === undefined || checkpointKey(approval.event.data.checkpoints) === "[]" ||
    !approval.event.caused_by.includes(startEventId)) {
    return { kind: "invalid", details: { approval_event_id: request.approval_event_id, reason: "missing approval for the current attempt or current Quality Requirements material" } };
  }
  return { kind: "valid", facts: { evidence, approval, ...(requestEvent ? { requestEvent } : {}), checkpoints: selectedCheckpoints } };
};

export class QualityRequirementsStageCompletion {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly runtime: QualityStageCompletionRuntime,
  ) {}

  async execute(
    selectors: ScopeSelectors,
    rawRequest: unknown,
    project?: string,
  ): Promise<QualityStageCompletionResult> {
    if (!selectors.unit || selectors.stage !== "quality-requirements" || !selectors.attempt ||
        selectors.task !== undefined || selectors.activity !== undefined || selectors.implementationAttempt !== undefined ||
        selectors.mission !== undefined) {
      return failure("invalid_stage_completion_scope", "Quality Requirements completion requires exactly --unit, --stage quality-requirements, and --attempt.", {
        unit_id: selectors.unit,
        stage: selectors.stage,
        attempt_id: selectors.attempt,
      });
    }
    const validated = validateQualityRequirementsCompletionRequest(rawRequest);
    if (validated.kind === "invalid") {
      return failure("invalid_quality_requirements_completion_request", "The typed Quality Requirements assessment request failed validation.", { issues: validated.issues }, "Correct the eight category decisions, objective requirements, review evidence, approval, and Planning handoff, then retry.");
    }
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const commonDir = await commonDirectory(this.runtime, firstRead.root);
    if (!commonDir) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", "quality-requirements"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/quality-requirements`,
        attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);

    let result: QualityStageCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) {
        result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      } else {
        result = await this.completeLoaded(loaded, selectors.attempt, validated.request);
      }
    } catch (error) {
      result = failure("stage_completion_failed", "Kepler could not validate Quality Requirements completion safely.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") {
      return failure("stage_coordination_release_failed", "The stage operation could not confirm that it released its coordination claim.", {
        ...released.details,
        operation_result: result.kind,
        ...(result.kind === "success" ? { completion_event_id: result.data.id } : {}),
      }, released.recovery);
    }
    return result;
  }

  private async completeLoaded(
    loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
    stageAttemptId: string,
    request: QualityRequirementsCompletionRequest,
  ): Promise<QualityStageCompletionResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Quality Requirements completion requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    if (loaded.unit.blocked) return failure("stage_history_blocked", "Construction history or projection issues prevent safe stage completion.", {
      history_issues: loaded.unit.historyIssues,
      projection_issues: loaded.unit.projectionIssues,
    });
    const stage = loaded.unit.stages.find((candidate) => candidate.stage === "quality-requirements");
    const attempt = stage?.attempts.find((candidate) => candidate.attemptId === stageAttemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== stageAttemptId || !attempt || attempt.state !== "running") {
      return failure("stage_attempt_not_current", "The selected Quality Requirements attempt is not the current running attempt.", {
        selected_attempt_id: stageAttemptId,
        current_attempt_id: stage?.currentAttemptId,
        state: stage?.state,
      });
    }
    const start = latestAttemptStart(attempt.facts);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart) return failure("stage_attempt_start_missing", "The selected Quality Requirements attempt has no validated start fact.", { attempt_id: stageAttemptId });
    const created = loaded.unit.created;
    const persistedUnitDirectory = created?.event.type === "construction.unit-created" ? created.event.data.directory : undefined;
    const upstream = currentFunctionalDesignRecord(loaded);
    if (upstream.kind === "invalid") return failure("functional_design_completion_invalid", "Quality Requirements requires one current validated Functional Design completion.", upstream.details);
    const authority = validateStageStartAuthority({
      stage: "quality-requirements",
      unitId: loaded.unit.unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: [String(upstream.completion.event.id)],
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") {
      return failure("quality_stage_start_authority_invalid", "The current Quality Requirements attempt must bind its accepted Functional Design and any authorized reopen chain.", {
        attempt_id: stageAttemptId,
        ...authority.details,
      });
    }
    const functionalDesign = await readFunctionalDesignMaterial(loaded.root, loaded.missionId, loaded.unit.unitId, persistedUnitDirectory);
    if (functionalDesign.kind === "invalid") return failure("functional_design_material_invalid", "Current Functional Design inputs failed validation.", { diagnostics: functionalDesign.diagnostics });
    if (!sameArtifactBindings(upstream.record.artifact_bindings, functionalDesign.material.artifactBindings)) {
      return failure("functional_design_material_stale", "The accepted Functional Design material changed after its completion assessment.", {
        expected_bindings: upstream.record.artifact_bindings,
        current_bindings: functionalDesign.material.artifactBindings,
      });
    }
    const materialResult = await readStageArtifactMaterial({
      repositoryRoot: loaded.root,
      missionId: loaded.missionId,
      unitId: loaded.unit.unitId,
      persistedUnitDirectory,
      primaryArtifact: "quality.md",
      supportFolder: "quality-requirements",
    });
    if (materialResult.kind === "invalid") return failure("quality_artifacts_invalid", "Quality Requirements artifacts or linked support failed validation.", { diagnostics: materialResult.diagnostics });
    const material = materialResult.material;
    if (material.artifactBindings.some((binding) => functionalDesign.material.artifactBindings.some((prior) => prior.artifact_id === binding.artifact_id))) {
      return failure("quality_artifact_identity_collision", "Quality Requirements artifact identities must differ from accepted Functional Design material.");
    }
    const handoff = request.assessments.handoff;
    const expectedHandoffArtifacts = [...functionalDesign.material.artifactPaths, ...material.artifactPaths]
      .sort((left, right) => left.localeCompare(right));
    if (handoff.unit_directory !== material.unitDirectory ||
        JSON.stringify([...handoff.artifacts].sort()) !== JSON.stringify(expectedHandoffArtifacts)) {
      return failure("quality_handoff_mismatch", "The Implementation Planning handoff must identify accepted Functional Design inputs, current quality.md, and every linked Quality Requirements support file.", {
        expected_unit_directory: material.unitDirectory,
        expected_artifacts: expectedHandoffArtifacts,
      });
    }
    const materialFacts = validateQualityMaterialFacts(loaded, stageAttemptId, start.event.id, request, material.artifactBindings);
    if (materialFacts.kind === "invalid") return failure("quality_evidence_invalid", "Named Quality Requirements evidence, requester approval, and any requested external review must bind to the current attempt and material.", materialFacts.details);
    const currentCommonDirectory = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: loaded.root });
    const actualCheckpoints = await captureStageCheckpoints(this.runtime, loaded, currentCommonDirectory);
    if (actualCheckpoints.kind === "failed") return failure(actualCheckpoints.code, actualCheckpoints.message, actualCheckpoints.details);
    const repositoryId = recordHomeRepositoryId(loaded.history.events);
    const artifactPaths = [
      ...functionalDesign.material.artifactPaths.map((artifactPath) => Path.join(functionalDesign.material.unitDirectory, artifactPath)),
      ...material.artifactPaths.map((artifactPath) => Path.join(material.unitDirectory, artifactPath)),
    ];
    const recordHomeCheckpoint = repositoryId ? actualCheckpoints.checkpoints.find((checkpoint) => checkpoint.repository_id === repositoryId) : undefined;
    if (!repositoryId || !recordHomeCheckpoint) return failure("quality_checkpoint_missing", "The record-home repository must have a current committed checkpoint.", { repository_id: repositoryId });
    const currentMaterial = await verifyStageCheckpointMaterial(this.runtime.workspace, {
      repositoryRoot: loaded.root, repositoryId, checkpoint: recordHomeCheckpoint, artifactPaths,
    });
    if (currentMaterial.kind === "invalid") return failure("quality_checkpoint_material_mismatch", "Functional Design and Quality Requirements material must match the current record-home checkpoint.", { artifact_paths: currentMaterial.artifactPaths });
    for (const fact of [...materialFacts.facts.evidence, materialFacts.facts.approval]) {
      const verifiedSet = await verifyStageCheckpointSet(this.runtime.workspace, actualCheckpoints.repositoryRoots, fact.event.data.checkpoints);
      if (verifiedSet.kind === "invalid") return failure("quality_evidence_checkpoint_invalid", "Every evidence and approval checkpoint must resolve in its selected repository workspace.", {
        event_id: fact.event.id, repository_ids: verifiedSet.repositoryIds, invalid_commits: verifiedSet.invalidCommits,
      });
      const checkpoint = Array.isArray(fact.event.data.checkpoints)
        ? fact.event.data.checkpoints.find((item) => isRecord(item) && item.repository_id === repositoryId)
        : undefined;
      if (!isRecord(checkpoint)) return failure("quality_evidence_checkpoint_missing", "Every evidence and approval checkpoint set must include the record-home repository.", { event_id: fact.event.id, repository_id: repositoryId });
      const materialAtCheckpoint = await verifyStageCheckpointMaterial(this.runtime.workspace, {
        repositoryRoot: loaded.root, repositoryId,
        checkpoint,
        artifactPaths,
      });
      if (materialAtCheckpoint.kind === "invalid") return failure("quality_evidence_material_checkpoint_mismatch", "The material covered by each Quality evidence result and approval must exist unchanged in its recorded checkpoint.", {
        event_id: fact.event.id, artifact_paths: materialAtCheckpoint.artifactPaths,
      });
    }

    const eventId = this.runtime.identities.next();
    const journalId = this.runtime.identities.next();
    const existingIds = new Set<string>(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id), String(record.event.journal_id)] : []));
    if (!uuidV4(eventId) || !uuidV4(journalId) || eventId === journalId || existingIds.has(eventId) || existingIds.has(journalId)) {
      return failure("stage_completion_identity_failed", "Kepler could not allocate distinct unused event and journal identities.");
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") {
      return failure("stage_completion_journal_identity_conflict", "The allocated stage journal identity already has a filesystem entry.", { journal_id: journalId });
    }
    const record: QualityRequirementsCompletionRecord = {
      approval_event_id: materialFacts.facts.approval.event.id,
      artifact_bindings: material.artifactBindings,
      functional_design_bindings: functionalDesign.material.artifactBindings.map((binding) => ({
        artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"],
        content_version: binding.content_version,
      })),
      artifact_paths: material.artifactPaths,
      assessments: request.assessments,
    };
    const causedBy = [
      start.event.id,
      materialFacts.facts.approval.event.id,
      ...materialFacts.facts.evidence.map((fact) => fact.event.id),
      ...(materialFacts.facts.requestEvent ? [materialFacts.facts.requestEvent.event.id] : []),
    ];
    const candidate = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.stage-attempt-completed",
      envelope_version: 1,
      event_version: CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set(causedBy)],
      data: {
        mission_id: loaded.missionId as MissionId,
        unit_id: loaded.unit.unitId as UnitId,
        stage: "quality-requirements",
        stage_attempt_id: stageAttemptId as StageAttemptId,
        evidence_ids: qualityRequirementsEvidenceIds(request.assessments),
        checkpoints: actualCheckpoints.checkpoints,
        quality_requirements_assessment: record,
      },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") {
      return failure("stage_completion_event_invalid", "The typed Quality Requirements completion event failed Construction validation.", {
        issues: validation.status === "invalid" ? validation.issues : [validation.reason],
      });
    }
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event);
    } catch (error) {
      return failure("stage_completion_append_failed", "Kepler could not durably append the Quality Requirements completion event.", {
        journal_id: journalId,
        message: error instanceof Error ? error.message : String(error),
      }, "Inspect the selected history journals for the exact event before retrying; preserve uncertain effects.");
    }
    return {
      kind: "success",
      data: {
        id: validation.event.id,
        journal_id: validation.event.journal_id,
        unit_id: loaded.unit.unitId,
        stage: "quality-requirements",
        attempt_id: stageAttemptId,
        evidence_ids: qualityRequirementsEvidenceIds(request.assessments),
        approval_event_id: materialFacts.facts.approval.event.id,
      },
    };
  }
}

export const createNodeQualityStageCompletionRuntime = (
  producer: { readonly name: string; readonly version: string },
): QualityStageCompletionRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return {
    workspace,
    identities: { next: randomUUID },
    now: () => new Date().toISOString(),
    producer,
    journals: {
      create: (recordHome, missionId, journalId) => createEventJournal({
        recordHome,
        missionId,
        journalId,
        phase: CONSTRUCTION_PHASE,
      }),
    },
  };
};
