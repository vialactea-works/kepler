import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { validateConstructionArtifact } from "./artifacts.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
} from "./events.js";
import type { ConstructionHistoryFact } from "./projection.js";
import {
  functionalDesignEvidenceIds,
  sameArtifactBindings,
  validateFunctionalDesignCompletionRequest,
  type FunctionalDesignCompletionRequest,
} from "./functional-design-completion.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";

export interface FunctionalDesignStageCompletionRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type FunctionalDesignStageCompletionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

interface FunctionalDesignMaterial {
  readonly artifactBindings: readonly { readonly artifact_id: string; readonly content_version: string }[];
  readonly artifactPaths: readonly string[];
  readonly unitDirectory: string;
}

interface ValidatedMaterialFacts {
  readonly evidence: readonly ConstructionHistoryFact[];
  readonly approval: ConstructionHistoryFact;
  readonly checkpoints: readonly unknown[];
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const contained = (root: string, path: string): boolean => {
  const relative = Path.relative(root, path);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};
const normalized = (value: string): string => value.split(Path.sep).join("/");

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry the exact Functional Design attempt.",
): FunctionalDesignStageCompletionResult => ({
  kind: "failed",
  data: { code, message, details, recovery },
});

const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): FunctionalDesignStageCompletionResult =>
  failure(result.code, result.message, result.details, result.recovery);

const parseLinkPath = (url: string): string | undefined => {
  if (url.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return undefined;
  const suffix = url.search(/[?#]/);
  const rawPath = suffix < 0 ? url : url.slice(0, suffix);
  if (rawPath.length === 0) return undefined;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
};

const readFunctionalDesignMaterial = async (
  repositoryRoot: string,
  missionId: string,
  unitId: string,
  persistedUnitDirectory: unknown,
): Promise<{ readonly kind: "valid"; readonly material: FunctionalDesignMaterial } | {
  readonly kind: "invalid";
  readonly diagnostics: readonly Readonly<Record<string, unknown>>[];
}> => {
  const canonicalDirectory = `construction/units-of-work/${unitId}`;
  if (typeof persistedUnitDirectory !== "string" || persistedUnitDirectory !== canonicalDirectory) {
    return { kind: "invalid", diagnostics: [{
      path: persistedUnitDirectory,
      code: "unit-directory-mismatch",
      message: "The unit-created directory does not match the canonical Construction Unit of Work path.",
      expected: canonicalDirectory,
    }] };
  }
  const unitDirectory = `.kepler/missions/${missionId}/${persistedUnitDirectory}`;
  const absoluteUnitDirectory = Path.resolve(repositoryRoot, unitDirectory);
  const functionalDesignDirectory = Path.join(absoluteUnitDirectory, "details", "functional-design");
  const requiredPaths = [`${unitDirectory}/unit-of-work.md`, `${unitDirectory}/design.md`];
  const pending = [...requiredPaths];
  const visited = new Set<string>();
  const artifacts: Array<{
    readonly path: string;
    readonly id: string;
    readonly contentVersion: string;
    readonly links: readonly { readonly url: string }[];
  }> = [];
  const diagnostics: Readonly<Record<string, unknown>>[] = [];

  while (pending.length > 0) {
    const artifactPath = pending.shift();
    if (artifactPath === undefined || visited.has(artifactPath)) continue;
    visited.add(artifactPath);
    const validation = await validateConstructionArtifact({
      repositoryRoot,
      artifactPath,
      ownership: { kind: "unit", unitId, unitRoot: unitDirectory },
    });
    if (validation.kind === "invalid") {
      diagnostics.push(...validation.diagnostics.map((item) => ({
        path: item.sourcePath,
        code: item.code,
        message: item.message,
      })));
      continue;
    }
    const artifact = validation.artifact;
    artifacts.push({
      path: artifactPath,
      id: artifact.metadata.id,
      contentVersion: `sha256:${createHash("sha256").update(artifact.source, "utf8").digest("hex")}`,
      links: artifact.links,
    });
    for (const link of artifact.links) {
      const linkPath = parseLinkPath(link.url);
      if (linkPath === undefined) continue;
      const target = Path.isAbsolute(linkPath)
        ? Path.resolve(repositoryRoot, `.${linkPath}`)
        : Path.resolve(Path.dirname(Path.resolve(repositoryRoot, artifactPath)), linkPath);
      if (!contained(functionalDesignDirectory, target)) continue;
      if (Path.extname(target).toLowerCase() !== ".md") {
        diagnostics.push({ path: artifactPath, code: "invalid-functional-design-support", message: `Linked Functional Design support must be Markdown: ${link.url}` });
        continue;
      }
      let realTarget: string;
      try {
        realTarget = await Fs.realpath(target);
      } catch {
        diagnostics.push({ path: artifactPath, code: "missing-functional-design-support", message: `Linked Functional Design support does not exist: ${link.url}` });
        continue;
      }
      if (!contained(functionalDesignDirectory, realTarget)) {
        diagnostics.push({ path: artifactPath, code: "outside-functional-design-support", message: `Linked Functional Design support must remain under details/functional-design/: ${link.url}` });
        continue;
      }
      pending.push(normalized(Path.relative(repositoryRoot, realTarget)));
    }
  }

  if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
  if (!requiredPaths.every((required) => visited.has(required))) {
    return {
      kind: "invalid",
      diagnostics: [{ path: unitDirectory, code: "required-artifact-missing", message: "Both unit-of-work.md and design.md are required." }],
    };
  }
  if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
    return {
      kind: "invalid",
      diagnostics: [{ path: unitDirectory, code: "duplicate-artifact-id", message: "Functional Design material contains duplicate artifact identities." }],
    };
  }
  const sortedArtifacts = artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const primaryPaths = requiredPaths.map((path) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(repositoryRoot, path))));
  const supportPaths = sortedArtifacts
    .map((artifact) => normalized(Path.relative(absoluteUnitDirectory, Path.resolve(repositoryRoot, artifact.path))))
    .filter((path) => path.startsWith("details/functional-design/"));
  const artifactBindings = sortedArtifacts.map((artifact) => ({
    artifact_id: artifact.id,
    content_version: artifact.contentVersion,
  }));
  return {
    kind: "valid",
    material: {
      artifactBindings,
      artifactPaths: [...primaryPaths, ...supportPaths],
      unitDirectory,
    },
  };
};

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

type FunctionalDesignHistoryUnit = Pick<
  Extract<AuditHistoryReadResult, { kind: "loaded" }>["unit"],
  "missionId" | "unitId" | "evidence" | "approvals"
>;

const validateFunctionalDesignCompletionFacts = (
  unit: FunctionalDesignHistoryUnit,
  stageAttemptId: string,
  startEventId: EventId,
  approvalEventId: string,
  artifactBindings: FunctionalDesignMaterial["artifactBindings"],
  assessments: FunctionalDesignCompletionRequest["assessments"],
): { readonly kind: "valid"; readonly facts: ValidatedMaterialFacts } | {
  readonly kind: "invalid";
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const idsByKind = {
    self_review: assessments.self_review.evidence_id,
    decision_resolution: assessments.decision_resolution.evidence_id,
    handoff: assessments.handoff.evidence_id,
  } as const;
  const checksByKind = {
    self_review: "functional-design-self-review",
    decision_resolution: "functional-design-decision-resolution",
    handoff: "functional-design-quality-handoff",
  } as const;
  const evidence: ConstructionHistoryFact[] = [];
  let selectedCheckpointKey: string | undefined;
  let selectedCheckpoints: readonly unknown[] = [];
  for (const kind of ["self_review", "decision_resolution", "handoff"] as const) {
    const matches = unit.evidence
      .map((entry) => entry.fact)
      .filter((fact) => fact.event.data.evidence_id === idsByKind[kind]);
    const fact = matches.length === 1 ? matches[0] : undefined;
    if (!fact || fact.event.type !== "construction.evidence-recorded" ||
        fact.event.data.mission_id !== unit.missionId || fact.event.data.unit_id !== unit.unitId ||
        fact.event.data.stage !== "functional-design" || fact.event.data.stage_attempt_id !== stageAttemptId ||
        fact.event.data.check !== checksByKind[kind] || !isRecord(fact.event.data.result) ||
        fact.event.data.result.status !== "passed" ||
        !sameArtifactBindings(fact.event.data.artifact_bindings, artifactBindings) ||
        !fact.event.caused_by.includes(startEventId)) {
      return { kind: "invalid", details: { evidence: kind, evidence_id: idsByKind[kind], reason: "missing, failed, stale-attempt, or stale-material evidence" } };
    }
    const observedCheckpointKey = checkpointKey(fact.event.data.checkpoints);
    if (observedCheckpointKey === undefined || observedCheckpointKey === "[]" ||
        (selectedCheckpointKey !== undefined && observedCheckpointKey !== selectedCheckpointKey)) {
      return { kind: "invalid", details: { evidence: kind, evidence_id: idsByKind[kind], reason: "named evidence does not share one valid checkpoint set" } };
    }
    if (!Array.isArray(fact.event.data.checkpoints)) {
      return { kind: "invalid", details: { evidence: kind, evidence_id: idsByKind[kind], reason: "named evidence has no valid checkpoint set" } };
    }
    selectedCheckpointKey = observedCheckpointKey;
    selectedCheckpoints = fact.event.data.checkpoints;
    evidence.push(fact);
  }
  const approvalMatches = unit.approvals
    .map((entry) => entry.fact)
    .filter((fact) => String(fact.event.id) === approvalEventId);
  const approval = approvalMatches.length === 1 ? approvalMatches[0] : undefined;
  if (!approval || approval.event.type !== "construction.approval-recorded" ||
      approval.event.data.mission_id !== unit.missionId || approval.event.data.unit_id !== unit.unitId ||
      approval.event.data.stage !== "functional-design" || approval.event.data.stage_attempt_id !== stageAttemptId ||
      !sameArtifactBindings(approval.event.data.artifact_bindings, artifactBindings) ||
      selectedCheckpointKey === undefined || selectedCheckpointKey === "[]" ||
      checkpointKey(approval.event.data.checkpoints) !== selectedCheckpointKey ||
      !approval.event.caused_by.includes(startEventId)) {
    return { kind: "invalid", details: { approval_event_id: approvalEventId, reason: "missing approval for the current attempt or current material" } };
  }
  return {
    kind: "valid",
    facts: { evidence, approval, checkpoints: selectedCheckpoints },
  };
};

const commonDirectory = async (
  runtime: FunctionalDesignStageCompletionRuntime,
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

export class FunctionalDesignStageCompletion {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly runtime: FunctionalDesignStageCompletionRuntime,
  ) {}

  async execute(
    selectors: ScopeSelectors,
    rawRequest: unknown,
    project?: string,
  ): Promise<FunctionalDesignStageCompletionResult> {
    if (!selectors.unit || selectors.stage !== "functional-design" || !selectors.attempt ||
        selectors.task !== undefined || selectors.activity !== undefined || selectors.implementationAttempt !== undefined ||
        selectors.mission !== undefined) {
      return failure("invalid_stage_completion_scope", "Functional Design completion requires exactly --unit, --stage functional-design, and --attempt.", {
        unit_id: selectors.unit,
        stage: selectors.stage,
        attempt_id: selectors.attempt,
      });
    }
    const validated = validateFunctionalDesignCompletionRequest(rawRequest);
    if (validated.kind === "invalid") {
      return failure("invalid_functional_design_completion_request", "The typed Functional Design assessment request failed validation.", { issues: validated.issues }, "Correct the typed assessments and exact approval event reference, then retry.");
    }
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const commonDir = await commonDirectory(this.runtime, firstRead.root);
    if (!commonDir) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", "functional-design"])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/functional-design`,
        attempt_context: selectors.attempt,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);

    let result: FunctionalDesignStageCompletionResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") result = propagateReadFailure(loaded);
      else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) {
        result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      } else {
        result = await this.completeLoaded(loaded, selectors.attempt, validated.request);
      }
    } catch (error) {
      result = failure("stage_completion_failed", "Kepler could not validate Functional Design completion safely.", {
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
    request: FunctionalDesignCompletionRequest,
  ): Promise<FunctionalDesignStageCompletionResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Functional Design completion requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    const stage = loaded.unit.stages.find((candidate) => candidate.stage === "functional-design");
    const attempt = stage?.attempts.find((candidate) => candidate.attemptId === stageAttemptId);
    if (!stage || stage.state !== "running" || stage.currentAttemptId !== stageAttemptId || !attempt || attempt.state !== "running") {
      return failure("stage_attempt_not_current", "The selected Functional Design attempt is not the current running attempt.", {
        selected_attempt_id: stageAttemptId,
        current_attempt_id: stage?.currentAttemptId,
        state: stage?.state,
      });
    }
    const start = latestAttemptStart(attempt.facts);
    if (!start) return failure("stage_attempt_start_missing", "The selected running attempt has no validated start fact.", { attempt_id: stageAttemptId });

    const created = loaded.unit.created;
    const persistedUnitDirectory = created?.event.type === "construction.unit-created"
      ? created.event.data.directory
      : undefined;
    const materialResult = await readFunctionalDesignMaterial(
      loaded.root,
      loaded.missionId,
      loaded.unit.unitId,
      persistedUnitDirectory,
    );
    if (materialResult.kind === "invalid") return failure("functional_design_artifacts_invalid", "Functional Design artifacts or linked stage-supporting documents failed validation.", { diagnostics: materialResult.diagnostics }, "Correct the reported artifacts and rerun completion.");
    const material = materialResult.material;
    const handoff = request.assessments.handoff;
    if (handoff.unit_directory !== material.unitDirectory || JSON.stringify(handoff.artifacts) !== JSON.stringify(material.artifactPaths)) {
      return failure("functional_design_handoff_mismatch", "The Quality handoff must identify the current Unit of Work directory and all required and linked Functional Design artifacts.", {
        expected_unit_directory: material.unitDirectory,
        expected_artifacts: material.artifactPaths,
      });
    }
    const materialFacts = validateFunctionalDesignCompletionFacts(
      loaded.unit,
      stageAttemptId,
      start.event.id,
      request.approval_event_id,
      material.artifactBindings,
      request.assessments,
    );
    if (materialFacts.kind === "invalid") {
      return failure("functional_design_evidence_invalid", "Every named Functional Design evidence result and requester approval must be bound to this attempt and current artifact material.", materialFacts.details);
    }

    const eventId = this.runtime.identities.next();
    const journalId = this.runtime.identities.next();
    if (!uuidV4.test(eventId) || !uuidV4.test(journalId) || eventId === journalId ||
        loaded.history.events.some((record) => record.event?.id === eventId)) {
      return failure("stage_completion_identity_failed", "Kepler could not allocate distinct event and journal identities.");
    }
    const evidenceIds = functionalDesignEvidenceIds(request.assessments);
    const causedBy = [start.event.id, materialFacts.facts.approval.event.id, ...materialFacts.facts.evidence.map((fact) => fact.event.id)];
    const candidate = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.stage-attempt-completed",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set(causedBy)],
      data: {
        mission_id: loaded.missionId,
        unit_id: loaded.unit.unitId,
        stage: "functional-design",
        stage_attempt_id: stageAttemptId,
        evidence_ids: evidenceIds,
        checkpoints: materialFacts.facts.checkpoints,
        functional_design_assessment: {
          approval_event_id: materialFacts.facts.approval.event.id,
          artifact_bindings: material.artifactBindings,
          assessments: request.assessments,
        },
      },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") {
      return failure("stage_completion_event_invalid", "The typed Functional Design completion event failed Construction validation.", {
        issues: validation.status === "invalid" ? validation.issues : [validation.reason],
      });
    }
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event);
    } catch (error) {
      return failure("stage_completion_append_failed", "Kepler could not durably append the completion event.", {
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
        stage: "functional-design",
        attempt_id: stageAttemptId,
        evidence_ids: evidenceIds,
        approval_event_id: materialFacts.facts.approval.event.id,
      },
    };
  }
}

export const createNodeFunctionalDesignStageCompletionRuntime = (
  producer: { readonly name: string; readonly version: string },
): FunctionalDesignStageCompletionRuntime => {
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