import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import { hasRequesterParticipant } from "../audit/participants.js";
import { validateStageStartAuthority } from "./stage-authority.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import {
  CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ArtifactBinding,
  type FunctionalDesignCompletionRecord,
  type GraphReference,
  type MissionId,
  type StageAttemptId,
  type UnitId,
} from "./events.js";
import { validateConstructionArtifact } from "./artifacts.js";
import { readFunctionalDesignCompletionRecord, sameArtifactBindings } from "./functional-design-completion.js";
import {
  readQualityRequirementsCompletionRecord,
  type QualityRequirementsCompletionRecord as QualityRecord,
} from "./quality-requirements-completion.js";
import {
  planningEvidenceIds,
  validateImplementationPlanningCompletionRequest,
  type ImplementationPlanningCompletionRecord,
  type ImplementationPlanningCompletionRequest,
} from "./implementation-planning-completion.js";
import { readFunctionalDesignMaterial } from "./stage-completion.js";
import { readStageArtifactMaterial, type StageArtifactMaterial } from "./stage-artifact-material.js";
import { readTaskGraph, type TaskGraph } from "./task-graph.js";
import { validateTaskGraphPathOperands } from "./task-graph-paths.js";
import type { ConstructionHistoryFact } from "./projection.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { recordHomeRepositoryId, verifyStageCheckpointMaterial, verifyStageCheckpointSet } from "./stage-checkpoint-content.js";

export interface PlanningStageCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type PlanningStageCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

export interface PlanningMaterial extends StageArtifactMaterial {
  readonly graphRef: GraphReference;
  readonly taskIds: readonly string[];
  readonly graph: TaskGraph;
}

interface ValidPlanningFacts {
  readonly evidence: readonly ConstructionHistoryFact[];
  readonly approval?: ConstructionHistoryFact;
  readonly requestEvents: readonly ConstructionHistoryFact[];
  readonly checkpoints: readonly unknown[];
}

const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const checkpointKey = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const checkpoints: string[] = [];
  const repositories = new Set<string>();
  for (const checkpoint of value) {
    if (!isRecord(checkpoint) || !nonEmpty(checkpoint.repository_id) || !nonEmpty(checkpoint.commit) || repositories.has(checkpoint.repository_id)) return undefined;
    repositories.add(checkpoint.repository_id);
    checkpoints.push(`${checkpoint.repository_id}\0${checkpoint.commit}`);
  }
  return JSON.stringify(checkpoints.sort());
};
const latestAttemptStart = (facts: readonly ConstructionHistoryFact[]): ConstructionHistoryFact | undefined =>
  facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)).at(-1);
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry the exact Implementation Planning attempt.",
): PlanningStageCompletionResult => ({ kind: "failed", data: { code, message, details, recovery } });
const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): PlanningStageCompletionResult =>
  failure(result.code, result.message, result.details, result.recovery);
const sameGraphReference = (left: unknown, right: GraphReference): boolean =>
  isRecord(left) && left.graph_id === right.graph_id && left.content_version === right.content_version;
const localArtifactLinkPath = (url: string): string | undefined => {
  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return undefined;
  const path = url.split(/[?#]/, 1)[0];
  try { return decodeURIComponent(path ?? ""); } catch { return undefined; }
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
    return { kind: "invalid", details: { stage: "functional-design", state: stage?.state, current_attempt_id: stage?.currentAttemptId, completion_events: completions.length } };
  }
  return { kind: "valid", record, completion: completions[0]! };
};

const currentQualityRecord = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  functionalDesignPaths: readonly string[],
): { readonly kind: "valid"; readonly record: QualityRecord; readonly completion: ConstructionHistoryFact } | {
  readonly kind: "invalid";
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const stage = loaded.unit.stages.find((candidate) => candidate.stage === "quality-requirements");
  const attempt = stage?.attempts.find((candidate) => candidate.attemptId === stage.currentAttemptId);
  const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
  const record = readQualityRequirementsCompletionRecord(
    completions[0]?.event.data.quality_requirements_assessment,
    functionalDesignPaths,
  );
  if (!stage || stage.state !== "completed" || completions.length !== 1 || !record) {
    return { kind: "invalid", details: { stage: "quality-requirements", state: stage?.state, current_attempt_id: stage?.currentAttemptId, completion_events: completions.length } };
  }
  return { kind: "valid", record, completion: completions[0]! };
};

const requesterInstructionEvent = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  eventId: string,
  attemptId: string,
  startEventId: EventId,
): ConstructionHistoryFact | undefined => {
  const matches = loaded.unit.interactions.filter((fact) => fact.event.id === eventId);
  const fact = matches.length === 1 ? matches[0] : undefined;
  if (!fact || fact.event.type !== "construction.interaction-recorded" || fact.event.data.stage !== "implementation-planning" ||
      fact.event.data.stage_attempt_id !== attemptId || !hasRequesterParticipant(fact.event.data.participants) ||
      !fact.event.caused_by.includes(startEventId)) return undefined;
  return fact;
};

export const readPlanningMaterial = async (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  persistedUnitDirectory: unknown,
): Promise<{ readonly kind: "valid"; readonly material: PlanningMaterial } | {
  readonly kind: "invalid";
  readonly diagnostics: readonly Readonly<Record<string, unknown>>[];
}> => {
  const packageResult = await readStageArtifactMaterial({
    repositoryRoot: loaded.root,
    missionId: loaded.missionId,
    unitId: loaded.unit.unitId,
    persistedUnitDirectory,
    primaryArtifact: "plan.md",
    supportFolder: "implementation-planning",
  });
  if (packageResult.kind === "invalid") return packageResult;
  const unitRoot = packageResult.material.unitDirectory;
  const planArtifact = await validateConstructionArtifact({
    repositoryRoot: loaded.root,
    artifactPath: `${unitRoot}/plan.md`,
    ownership: { kind: "unit", unitId: loaded.unit.unitId, unitRoot },
  });
  if (planArtifact.kind === "invalid") {
    return { kind: "invalid", diagnostics: planArtifact.diagnostics.map((item) => ({ path: item.sourcePath, code: item.code, message: item.message })) };
  }
  const planId = planArtifact.artifact.metadata.id;
  const planUnitId = planArtifact.artifact.metadata.unit_id;
  if (!nonEmpty(planId) || !nonEmpty(planUnitId) || planArtifact.artifact.metadata.type !== "implementation-plan") {
    return { kind: "invalid", diagnostics: [{ path: `${unitRoot}/plan.md`, code: "plan-identity-invalid", message: "The canonical plan must identify its implementation-plan artifact and owning unit." }] };
  }
  const missionFacts = loaded.history.events.filter((record) =>
    record.event?.type === "construction.mission-created" && record.event.data.mission_id === loaded.missionId &&
    isRecord(record.event.data.record_home) && nonEmpty(record.event.data.record_home.repository_id),
  );
  if (missionFacts.length !== 1) {
    return { kind: "invalid", diagnostics: [{ path: unitRoot, code: "record-home-ambiguous", message: "One record-home repository identity is required to validate graph paths." }] };
  }
  const missionData = missionFacts[0]?.event?.data;
  const recordHomeRepositoryId = isRecord(missionData?.record_home) ? missionData.record_home.repository_id : undefined;
  if (!nonEmpty(recordHomeRepositoryId)) {
    return { kind: "invalid", diagnostics: [{ path: unitRoot, code: "record-home-missing", message: "The mission record-home repository identity is unavailable." }] };
  }
  const graphRelativePath = `${unitRoot}/tasks-dag.json`;
  let graphRealPath: string;
  try { graphRealPath = await Fs.realpath(Path.resolve(loaded.root, graphRelativePath)); }
  catch { graphRealPath = ""; }
  const planPath = Path.resolve(loaded.root, `${unitRoot}/plan.md`);
  let graphIsLinked = false;
  for (const link of planArtifact.artifact.links) {
    if (link.kind !== "link") continue;
    const linkPath = localArtifactLinkPath(link.url);
    if (linkPath === undefined || graphRealPath.length === 0) continue;
    const target = Path.isAbsolute(linkPath)
      ? Path.resolve(loaded.root, `.${linkPath}`)
      : Path.resolve(Path.dirname(planPath), linkPath);
    try {
      if (await Fs.realpath(target) === graphRealPath) graphIsLinked = true;
    } catch { continue; }
  }
  if (!graphIsLinked) {
    return { kind: "invalid", diagnostics: [{ path: `${unitRoot}/plan.md`, code: "task-graph-link-missing", message: "The canonical plan must link the current tasks-dag.json graph." }] };
  }
  const pathDiagnostics = await validateTaskGraphPathOperands(
    [{ id: recordHomeRepositoryId, path: loaded.root }],
    [{ repositoryId: recordHomeRepositoryId, basePath: ".", path: graphRelativePath, pointer: "" }],
  );
  if (pathDiagnostics.length > 0) {
    return { kind: "invalid", diagnostics: pathDiagnostics.map((item) => ({ path: graphRelativePath, code: item.code, message: item.message, pointer: item.pointer })) };
  }
  let graphSource: string;
  try {
    graphSource = await Fs.readFile(Path.join(loaded.root, graphRelativePath), "utf8");
  } catch {
    return { kind: "invalid", diagnostics: [{ path: graphRelativePath, code: "task-graph-unavailable", message: "The canonical task graph cannot be read." }] };
  }
  const executionIdentities = [...new Set(loaded.history.events.flatMap((record) => record.event ? [String(record.event.id)] : []))];
  const graph = readTaskGraph(graphSource, {
    unitDirectoryId: loaded.unit.unitId,
    planUnitId,
    planArtifactId: planId,
    executionIdentities,
  });
  if (graph.kind === "invalid") {
    return { kind: "invalid", diagnostics: graph.diagnostics.map((item) => ({ path: graphRelativePath, code: item.code, pointer: item.pointer, message: item.message })) };
  }
  const graphRef: GraphReference = {
    graph_id: graph.graph.id as GraphReference["graph_id"],
    content_version: `sha256:${createHash("sha256").update(graphSource, "utf8").digest("hex")}`,
  };
  return { kind: "valid", material: { ...packageResult.material, graphRef, taskIds: graph.graph.tasks.map((task) => task.id).sort(), graph: graph.graph } };
};

const mergeBindings = (
  ...bindingSets: readonly (readonly ArtifactBinding[])[]
): readonly ArtifactBinding[] | undefined => {
  const bindings = bindingSets.flat();
  if (new Set(bindings.map((binding) => binding.artifact_id)).size !== bindings.length) return undefined;
  return bindings.slice().sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
};

const validatePlanningFacts = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  attemptId: string,
  startEventId: EventId,
  request: ImplementationPlanningCompletionRequest,
  material: PlanningMaterial,
  reviewedBindings: readonly ArtifactBinding[],
): { readonly kind: "valid"; readonly facts: ValidPlanningFacts } | {
  readonly kind: "invalid";
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const assessments = request.assessments;
  let externalReviewRequest: ConstructionHistoryFact | undefined;
  if (assessments.external_review.requested) {
    externalReviewRequest = requesterInstructionEvent(
      loaded,
      assessments.external_review.request_event_id,
      attemptId,
      startEventId,
    );
    if (!externalReviewRequest) {
      return { kind: "invalid", details: { request_event_id: assessments.external_review.request_event_id, reason: "external review has no matching requester request in this attempt" } };
    }
  }
  const expectedTaskIds = material.taskIds.slice().sort();
  const reviewedTaskIds = assessments.self_review.task_reviews.map((item) => item.task_id).sort();
  if (JSON.stringify(expectedTaskIds) !== JSON.stringify(reviewedTaskIds)) {
    return { kind: "invalid", details: { reason: "semantic review must cover every current task graph identity exactly once", expected_task_ids: expectedTaskIds, reviewed_task_ids: reviewedTaskIds } };
  }
  if (assessments.self_review.obligation_coverage.some((item) => item.task_ids.some((id) => !expectedTaskIds.includes(id)))) {
    return { kind: "invalid", details: { reason: "obligation coverage references an unknown current task identity" } };
  }
  if (!sameGraphReference(assessments.handoff.graph_ref, material.graphRef) ||
      JSON.stringify([...assessments.handoff.task_ids].sort()) !== JSON.stringify(expectedTaskIds)) {
    return { kind: "invalid", details: { reason: "Implementation handoff must bind the current task graph and exact task set", graph_ref: material.graphRef, task_ids: expectedTaskIds } };
  }
  const named: { readonly kind: "artifact_validation" | "task_graph_validation" | "self_review" | "external_review"; readonly evidenceId: string; readonly check: string }[] = [
    { kind: "artifact_validation", evidenceId: assessments.artifact_validation.evidence_id, check: "planning-artifact-validation" },
    { kind: "task_graph_validation", evidenceId: assessments.task_graph_validation.evidence_id, check: "planning-task-graph-validation" },
    { kind: "self_review", evidenceId: assessments.self_review.evidence_id, check: "planning-self-review" },
    ...(assessments.external_review.requested ? [{ kind: "external_review" as const, evidenceId: assessments.external_review.evidence_id, check: "planning-external-review" }] : []),
  ];
  const evidence: ConstructionHistoryFact[] = [];
  let selectedCheckpoints: readonly unknown[] = [];
  for (const item of named) {
    const matches = loaded.unit.evidence.map((entry) => entry.fact).filter((fact) => fact.event.data.evidence_id === item.evidenceId);
    const fact = matches.length === 1 ? matches[0] : undefined;
    if (!fact || fact.event.type !== "construction.evidence-recorded" ||
        fact.event.data.mission_id !== loaded.missionId || fact.event.data.unit_id !== loaded.unit.unitId ||
        fact.event.data.stage !== "implementation-planning" || fact.event.data.stage_attempt_id !== attemptId ||
        fact.event.data.check !== item.check || !isRecord(fact.event.data.result) || fact.event.data.result.status !== "passed" ||
        !sameArtifactBindings(fact.event.data.artifact_bindings, reviewedBindings) ||
        !fact.event.caused_by.includes(startEventId) ||
        (item.kind === "external_review" && (!externalReviewRequest || !fact.event.caused_by.includes(externalReviewRequest.event.id)))) {
      return { kind: "invalid", details: { evidence: item.kind, evidence_id: item.evidenceId, reason: "missing, failed, stale-attempt, stale-material, or graph-unbound evidence" } };
    }
    const observedKey = checkpointKey(fact.event.data.checkpoints);
    if (observedKey === undefined || observedKey === "[]" || !Array.isArray(fact.event.data.checkpoints)) {
      return { kind: "invalid", details: { evidence: item.kind, evidence_id: item.evidenceId, reason: "named evidence requires its own valid non-empty checkpoint set" } };
    }
    if (selectedCheckpoints.length === 0) selectedCheckpoints = fact.event.data.checkpoints;
    evidence.push(fact);
  }
  const approvalRequired = assessments.approval_requirement.required;
  let approval: ConstructionHistoryFact | undefined;
  if (approvalRequired) {
    const approvalMatches = loaded.unit.approvals.map((entry) => entry.fact).filter((fact) => String(fact.event.id) === request.approval_event_id);
    approval = approvalMatches.length === 1 ? approvalMatches[0] : undefined;
    if (!approval || approval.event.type !== "construction.approval-recorded" ||
        approval.event.data.mission_id !== loaded.missionId || approval.event.data.unit_id !== loaded.unit.unitId ||
        approval.event.data.stage !== "implementation-planning" || approval.event.data.stage_attempt_id !== attemptId ||
        !sameArtifactBindings(approval.event.data.artifact_bindings, reviewedBindings) ||
        checkpointKey(approval.event.data.checkpoints) === undefined || checkpointKey(approval.event.data.checkpoints) === "[]" ||
        !approval.event.caused_by.includes(startEventId)) {
      return { kind: "invalid", details: { approval_event_id: request.approval_event_id, reason: "required requester approval is missing or bound to different material" } };
    }
  }
  const requestEvents: ConstructionHistoryFact[] = externalReviewRequest ? [externalReviewRequest] : [];
  if (approvalRequired && assessments.approval_requirement.basis.kind === "requester-instruction") {
    const approvalRequest = requesterInstructionEvent(loaded, assessments.approval_requirement.basis.request_event_id, attemptId, startEventId);
    if (!approvalRequest) return { kind: "invalid", details: { request_event_id: assessments.approval_requirement.basis.request_event_id, reason: "plan approval has no matching requester instruction in this attempt" } };
    requestEvents.push(approvalRequest);
  }
  return { kind: "valid", facts: { evidence, ...(approval ? { approval } : {}), requestEvents, checkpoints: selectedCheckpoints } };
};

const commonDirectory = async (runtime: PlanningStageCompletionRuntime, repositoryRoot: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return await runtime.workspace.fileSystem.realpath(Path.resolve(repositoryRoot, result.stdout.trim()));
  } catch {
    return undefined;
  }
};

export class ImplementationPlanningStageCompletion {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly runtime: PlanningStageCompletionRuntime,
  ) {}

  async execute(selectors: ScopeSelectors, rawRequest: unknown, project?: string): Promise<PlanningStageCompletionResult> {
    if (!selectors.unit || selectors.stage !== "implementation-planning" || !selectors.attempt ||
        selectors.task !== undefined || selectors.activity !== undefined || selectors.implementationAttempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_stage_completion_scope", "Implementation Planning completion requires exactly --unit, --stage implementation-planning, and --attempt.", {
        unit_id: selectors.unit, stage: selectors.stage, attempt_id: selectors.attempt,
      });
    }
    const validated = validateImplementationPlanningCompletionRequest(rawRequest);
    if (validated.kind === "invalid") return failure("invalid_implementation_planning_completion_request", "The typed Implementation Planning assessment failed validation.", { issues: validated.issues });
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const commonDir = await commonDirectory(this.runtime, firstRead.root);
    if (!commonDir) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", "implementation-planning"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/implementation-planning`,
        attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);
    let result: PlanningStageCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) {
        result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      } else {
        result = await this.completeLoaded(loaded, selectors.attempt, validated.request);
      }
    } catch (error) {
      result = failure("stage_completion_failed", "Kepler could not validate Implementation Planning completion safely.", {
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
    attemptId: string,
    request: ImplementationPlanningCompletionRequest,
  ): Promise<PlanningStageCompletionResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Implementation Planning completion requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    if (loaded.unit.blocked) return failure("stage_history_blocked", "Construction history or projection issues prevent safe stage completion.", {
      history_issues: loaded.unit.historyIssues, projection_issues: loaded.unit.projectionIssues,
    });
    const stage = loaded.unit.stages.find((candidate) => candidate.stage === "implementation-planning");
    const attempt = stage?.attempts.find((candidate) => candidate.attemptId === attemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt || attempt.state !== "running") {
      return failure("stage_attempt_not_current", "The selected Implementation Planning attempt is not the current running attempt.", {
        selected_attempt_id: attemptId, current_attempt_id: stage?.currentAttemptId, state: stage?.state,
      });
    }
    const start = latestAttemptStart(attempt.facts);
    const originalStart = attempt.facts.find((fact) => fact.event.type === "construction.stage-attempt-started");
    if (!start || !originalStart) return failure("stage_attempt_start_missing", "The selected Implementation Planning attempt has no validated start fact.", { attempt_id: attemptId });
    const persistedUnitDirectory = loaded.unit.created?.event.type === "construction.unit-created" ? loaded.unit.created.event.data.directory : undefined;
    const functionalDesignRecord = currentFunctionalDesignRecord(loaded);
    if (functionalDesignRecord.kind === "invalid") return failure("functional_design_completion_invalid", "Planning requires one current validated Functional Design completion.", functionalDesignRecord.details);
    const functionalDesignMaterial = await readFunctionalDesignMaterial(loaded.root, loaded.missionId, loaded.unit.unitId, persistedUnitDirectory);
    if (functionalDesignMaterial.kind === "invalid" || !sameArtifactBindings(functionalDesignRecord.record.artifact_bindings, functionalDesignMaterial.material?.artifactBindings)) {
      return failure("functional_design_material_stale", "Current Functional Design artifacts differ from the accepted completion material.", {
        diagnostics: functionalDesignMaterial.kind === "invalid" ? functionalDesignMaterial.diagnostics : [],
      });
    }
    const qualityRecord = currentQualityRecord(loaded, functionalDesignRecord.record.artifact_paths);
    if (qualityRecord.kind === "invalid") return failure("quality_requirements_completion_invalid", "Planning requires one current validated Quality Requirements completion.", qualityRecord.details);
    const authority = validateStageStartAuthority({
      stage: "implementation-planning",
      unitId: loaded.unit.unitId,
      authorityEventIds: originalStart.event.data.authority_event_ids,
      causedBy: originalStart.event.caused_by,
      expectedUpstreamEventIds: [String(functionalDesignRecord.completion.event.id), String(qualityRecord.completion.event.id)],
      facts: loaded.history.events.flatMap((record) => record.event ? [{ event: record.event }] : []),
    });
    if (authority.kind !== "valid") return failure(
      "planning_stage_start_authority_invalid",
      "The current Implementation Planning attempt must bind its accepted upstream completions and any authorized reopen chain.",
      authority.details,
    );
    const qualityMaterial = await readStageArtifactMaterial({
      repositoryRoot: loaded.root, missionId: loaded.missionId, unitId: loaded.unit.unitId, persistedUnitDirectory,
      primaryArtifact: "quality.md", supportFolder: "quality-requirements",
    });
    if (qualityMaterial.kind === "invalid" || !sameArtifactBindings(qualityRecord.record.artifact_bindings, qualityMaterial.material?.artifactBindings) ||
        !sameArtifactBindings(qualityRecord.record.functional_design_bindings, functionalDesignMaterial.material.artifactBindings)) {
      return failure("quality_requirements_material_stale", "Current Quality Requirements or accepted Functional Design inputs differ from the Quality Requirements completion bindings.", {
        diagnostics: qualityMaterial.kind === "invalid" ? qualityMaterial.diagnostics : [],
      });
    }
    const materialResult = await readPlanningMaterial(loaded, persistedUnitDirectory);
    if (materialResult.kind === "invalid") return failure("planning_artifacts_invalid", "Planning artifacts, task graph, linked support, or graph paths failed validation.", { diagnostics: materialResult.diagnostics });
    const material = materialResult.material;
    const reviewedBindings = mergeBindings(
      functionalDesignMaterial.material.artifactBindings.map((binding) => ({
        artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"],
        content_version: binding.content_version,
      })),
      qualityMaterial.material.artifactBindings,
      material.artifactBindings,
    );
    if (!reviewedBindings) return failure("planning_artifact_identity_collision", "Reviewed Functional Design, Quality Requirements, and Planning material must use distinct artifact identities.");
    const expectedInputBindings = mergeBindings(
        functionalDesignMaterial.material.artifactBindings.map((binding) => ({
        artifact_id: binding.artifact_id as ArtifactBinding["artifact_id"],
        content_version: binding.content_version,
        })),
        qualityMaterial.material.artifactBindings,
    );
    if (!expectedInputBindings || !sameArtifactBindings(request.assessments.handoff.input_bindings, expectedInputBindings)) {
        return failure("planning_handoff_inputs_mismatch", "The Implementation handoff must bind the current Functional Design and Quality Requirements inputs by identity and content hash.", {
        expected_input_bindings: expectedInputBindings,
        });
    }
    const expectedQualityRequirementReferences = qualityRecord.record.assessments.self_review.requirements.map((requirement) => requirement.reference);
    const coveredReferences = new Set(request.assessments.self_review.obligation_coverage.map((coverage) => coverage.reference));
    if (expectedQualityRequirementReferences.some((reference) => !coveredReferences.has(reference))) {
        return failure("planning_quality_obligation_coverage_incomplete", "Every accepted Quality Requirements reference needs planned or justified unchanged-behavior coverage.", {
        missing_references: expectedQualityRequirementReferences.filter((reference) => !coveredReferences.has(reference)),
        });
    }
    const requiredVerificationObligations = material.graph.tasks.flatMap((task) => task.verification.map((verification) =>
        `task:${task.id} ${verification.scope}: ${verification.method}; expected: ${verification.expected_result}`,
    ));
    const requiredPrerequisiteConditions = material.graph.tasks.flatMap((task) => task.prerequisites.map((prerequisite) =>
        `task:${task.id} ${prerequisite.description}; needed for ${prerequisite.needed_for} ${prerequisite.needed_when}; blocking: ${prerequisite.blocking}; condition: ${prerequisite.condition}; reason: ${prerequisite.reason}`,
    ));
    if (requiredVerificationObligations.some((obligation) => !request.assessments.handoff.verification_obligations.includes(obligation)) ||
        requiredPrerequisiteConditions.some((condition) => !request.assessments.handoff.prerequisite_conditions.includes(condition))) {
        return failure("planning_handoff_obligations_incomplete", "The Implementation handoff must include every task verification and external prerequisite condition.", {
        missing_verification_obligations: requiredVerificationObligations.filter((obligation) => !request.assessments.handoff.verification_obligations.includes(obligation)),
        missing_prerequisite_conditions: requiredPrerequisiteConditions.filter((condition) => !request.assessments.handoff.prerequisite_conditions.includes(condition)),
        });
    }
    const handoff = request.assessments.handoff;
    const expectedHandoffArtifacts = [...material.artifactPaths, "tasks-dag.json"].sort((left, right) => left.localeCompare(right));
    if (handoff.unit_directory !== material.unitDirectory ||
        JSON.stringify([...handoff.artifacts].sort((left, right) => left.localeCompare(right))) !== JSON.stringify(expectedHandoffArtifacts) ||
        handoff.approval_required !== request.assessments.approval_requirement.required) {
      return failure("planning_handoff_mismatch", "The Implementation handoff must identify the current plan, graph, support files, and approval condition.", {
        expected_unit_directory: material.unitDirectory, expected_artifacts: expectedHandoffArtifacts,
      });
    }
    const facts = validatePlanningFacts(loaded, attemptId, start.event.id, request, material, reviewedBindings);
    if (facts.kind === "invalid") return failure("planning_evidence_invalid", "Planning evidence, applicable approvals, and requested reviews must bind to the current attempt, outputs, upstream material, and graph.", facts.details);
    const currentCommonDirectory = await commonDirectory(this.runtime, loaded.root);
    if (!currentCommonDirectory) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: loaded.root });
    const actualCheckpoints = await captureStageCheckpoints(this.runtime, loaded, currentCommonDirectory);
    if (actualCheckpoints.kind === "failed") return failure(actualCheckpoints.code, actualCheckpoints.message, actualCheckpoints.details);
    const repositoryId = recordHomeRepositoryId(loaded.history.events);
    const artifactPaths = [
      ...functionalDesignMaterial.material.artifactPaths.map((artifactPath) => Path.join(functionalDesignMaterial.material.unitDirectory, artifactPath)),
      ...qualityMaterial.material.artifactPaths.map((artifactPath) => Path.join(qualityMaterial.material.unitDirectory, artifactPath)),
      ...material.artifactPaths.map((artifactPath) => Path.join(material.unitDirectory, artifactPath)),
      Path.join(material.unitDirectory, "tasks-dag.json"),
    ];
    const recordHomeCheckpoint = repositoryId ? actualCheckpoints.checkpoints.find((checkpoint) => checkpoint.repository_id === repositoryId) : undefined;
    if (!repositoryId || !recordHomeCheckpoint) return failure("planning_checkpoint_missing", "The record-home repository must have a current committed checkpoint.", { repository_id: repositoryId });
    const currentMaterial = await verifyStageCheckpointMaterial(this.runtime.workspace, {
      repositoryRoot: loaded.root, repositoryId, checkpoint: recordHomeCheckpoint, artifactPaths,
    });
    if (currentMaterial.kind === "invalid") return failure("planning_checkpoint_material_mismatch", "Functional Design, Quality Requirements, plan, support, and task graph material must match the current record-home checkpoint.", { artifact_paths: currentMaterial.artifactPaths });
    for (const fact of [...facts.facts.evidence, ...(facts.facts.approval ? [facts.facts.approval] : [])]) {
      const verifiedSet = await verifyStageCheckpointSet(this.runtime.workspace, actualCheckpoints.repositoryRoots, fact.event.data.checkpoints);
      if (verifiedSet.kind === "invalid") return failure("planning_evidence_checkpoint_invalid", "Every evidence and approval checkpoint must resolve in its selected repository workspace.", {
        event_id: fact.event.id, repository_ids: verifiedSet.repositoryIds, invalid_commits: verifiedSet.invalidCommits,
      });
      const checkpoint = Array.isArray(fact.event.data.checkpoints)
        ? fact.event.data.checkpoints.find((item) => isRecord(item) && item.repository_id === repositoryId)
        : undefined;
      if (!isRecord(checkpoint)) return failure("planning_evidence_checkpoint_missing", "Every evidence and approval checkpoint set must include the record-home repository.", { event_id: fact.event.id, repository_id: repositoryId });
      const materialAtCheckpoint = await verifyStageCheckpointMaterial(this.runtime.workspace, {
        repositoryRoot: loaded.root, repositoryId, checkpoint, artifactPaths,
      });
      if (materialAtCheckpoint.kind === "invalid") return failure("planning_evidence_material_checkpoint_mismatch", "Planning material and graph must exist unchanged in each evidence and approval checkpoint.", {
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
    const record: ImplementationPlanningCompletionRecord = {
      graph_ref: material.graphRef,
      artifact_bindings: material.artifactBindings,
      reviewed_material_bindings: reviewedBindings,
      artifact_paths: material.artifactPaths,
      task_graph_path: "tasks-dag.json",
      plan_graph_link: { plan_path: "plan.md", task_graph_path: "tasks-dag.json" },
      ...(facts.facts.approval ? { approval_event_id: facts.facts.approval.event.id } : {}),
      assessments: request.assessments,
    };
    const causedBy = [
      start.event.id,
      ...facts.facts.evidence.map((fact) => fact.event.id),
      ...(facts.facts.approval ? [facts.facts.approval.event.id] : []),
      ...facts.facts.requestEvents.map((fact) => fact.event.id),
    ];
    const candidate = {
      id: eventId, phase: CONSTRUCTION_PHASE, type: "construction.stage-attempt-completed",
      envelope_version: 1, event_version: CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION, journal_id: journalId,
      recorded_at: this.runtime.now(), producer: this.runtime.producer, caused_by: [...new Set(causedBy)],
      data: {
        mission_id: loaded.missionId as MissionId, unit_id: loaded.unit.unitId as UnitId,
        stage: "implementation-planning", stage_attempt_id: attemptId as StageAttemptId,
        evidence_ids: planningEvidenceIds(request.assessments), checkpoints: actualCheckpoints.checkpoints,
        implementation_planning_assessment: record,
      },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") {
      return failure("stage_completion_event_invalid", "The typed Implementation Planning completion event failed Construction validation.", {
        issues: validation.status === "invalid" ? validation.issues : [validation.reason],
      });
    }
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event);
    } catch (error) {
      return failure("stage_completion_append_failed", "Kepler could not durably append Implementation Planning completion.", {
        journal_id: journalId, message: error instanceof Error ? error.message : String(error),
      }, "Inspect the selected history journals for the exact event before retrying; preserve uncertain effects.");
    }
    return {
      kind: "success",
      data: {
        id: validation.event.id, journal_id: validation.event.journal_id, unit_id: loaded.unit.unitId,
        stage: "implementation-planning", attempt_id: attemptId, evidence_ids: planningEvidenceIds(request.assessments),
        graph_ref: material.graphRef, ...(facts.facts.approval ? { approval_event_id: facts.facts.approval.event.id } : {}),
      },
    };
  }
}

export const createNodePlanningStageCompletionRuntime = (
  producer: { readonly name: string; readonly version: string },
): PlanningStageCompletionRuntime => {
  const workspace = createNodeMissionWorkspaceRuntime();
  return {
    workspace, identities: { next: randomUUID }, now: () => new Date().toISOString(), producer,
    journals: { create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: CONSTRUCTION_PHASE }) },
  };
};
