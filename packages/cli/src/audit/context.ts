import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { randomUUID } from "node:crypto";
import type { EventJournal } from "../history/journal.js";
import { projectConstruction } from "../construction/projection.js";
import { historyReaderMetadata, knownHistoryUnitIds, unavailableHistoryMetadata, type HistoryReaderMetadata, type SelectedHistoryReader } from "../history/reader.js";
import { HistoryError } from "../history/control.js";
import { CONSTRUCTION_PHASE, type ConstructionStage } from "../construction/events.js";
import type { ProjectResolver } from "../cli/project-selection.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { AuditRecordContext, AuditRecordContextResolver, AuditRecordKind } from "./recording.js";
import { hasRequesterParticipant } from "./participants.js";

export interface AuditContextFileSystem {
  readonly directories: (path: string, root: string) => Promise<readonly string[]>;
}

export interface AuditJournalRequest {
  readonly recordHome: string;
  readonly missionId: string;
  readonly historyVersion: string;
  readonly generationId: string;
  readonly journalId: string;
  readonly phase: string;
}

export interface AuditJournalFactory {
  readonly create: (request: AuditJournalRequest) => EventJournal;
}

export interface AuditContextRuntime {
  readonly projects: ProjectResolver;
  readonly fileSystem: AuditContextFileSystem;
  readonly historyReader: SelectedHistoryReader;
  readonly journals: AuditJournalFactory;
  readonly identities: { readonly next: () => string };
  readonly taskExists?: (unitId: string, taskId: string, project?: string) => Promise<boolean>;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const inRoot = (root: string, path: string): boolean => {
  const relative = Path.relative(root, path);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};

export const createNodeAuditContextFileSystem = (): AuditContextFileSystem => ({
  directories: async (path, root) => {
    try {
      await Fs.access(path);
    } catch {
      return [];
    }
    const canonicalRoot = await Fs.realpath(root);
    const canonicalPath = await Fs.realpath(path);
    if (!inRoot(canonicalRoot, canonicalPath)) throw new Error("Audit history path escapes the selected record home.");
    const entries = await Fs.readdir(canonicalPath, { withFileTypes: true });
    if (entries.some((entry) => entry.isSymbolicLink())) throw new Error("Audit history contains a symbolic link and cannot be read safely.");
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  },
});

const failure = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, history_metadata?: HistoryReaderMetadata) => ({
  kind: "failed" as const,
  code,
  message,
  details,
  recovery: "Correct the explicit audit scope or reconcile the recorded history before retrying.",
  ...(history_metadata ? { history_metadata } : {}),
});

const invalidScope = (message: string, details: Readonly<Record<string, unknown>> = {}, history_metadata?: HistoryReaderMetadata) => ({
  kind: "failed" as const,
  code: "invalid_audit_scope",
  message,
  details,
  recovery: "Select an existing unit and an explicitly recorded scope and attempt.",
  ...(history_metadata ? { history_metadata } : {}),
});

const attemptContext = (
  kind: AuditRecordKind,
  selectors: ScopeSelectors,
  unit: ReturnType<typeof projectConstruction>["units"][number],
): { readonly ok: true; readonly stage?: ConstructionStage; readonly stageAttemptId?: string; readonly taskId?: string; readonly activity?: string; readonly activityAttemptId?: string; readonly causedBy: readonly string[] } | { readonly ok: false; readonly message: string } => {
  const stage = selectors.stage ?? ((selectors.task || selectors.activity || selectors.implementationAttempt) ? "implementation" : undefined);
  const isExecutionScope = selectors.task !== undefined || selectors.activity !== undefined;
  if (selectors.task && (stage !== "implementation" || !selectors.implementationAttempt)) {
    return { ok: false, message: "Task scopes require the selected Implementation parent attempt." };
  }
  if (selectors.activity && (stage !== "implementation" || !selectors.task || !selectors.implementationAttempt)) {
    return { ok: false, message: "Activity scopes require the task and its Implementation parent attempt." };
  }
  if (selectors.implementationAttempt && !isExecutionScope) {
    return { ok: false, message: "An Implementation parent attempt requires an explicit task or Activity scope." };
  }
  if ((selectors.task || selectors.activity) && selectors.stage && selectors.stage !== "implementation") {
    return { ok: false, message: "Task and Activity scopes require the Implementation stage." };
  }
  if (selectors.task && !selectors.activity && selectors.attempt) {
    return { ok: false, message: "Task scopes do not have a separate task-attempt selector." };
  }
  if (kind === "interaction" && !stage) return { ok: true, causedBy: [] };
  if (!stage) return { ok: false, message: "Evidence and approval require an explicit stage, task, or Activity scope." };

  const stageProjection = unit.stages.find((candidate) => candidate.stage === stage);
  const selectedStageAttempt = isExecutionScope ? selectors.implementationAttempt : selectors.attempt;
  const needsAttempt = kind !== "interaction" && !isExecutionScope;
  if ((needsAttempt || selectedStageAttempt) && (!selectedStageAttempt || !stageProjection?.attempts.some((candidate) => candidate.attemptId === selectedStageAttempt))) {
    return { ok: false, message: "The explicit stage attempt does not belong to the selected unit and stage." };
  }
  if (selectors.task) {
    const task = unit.tasks.find((candidate) => candidate.taskId === selectors.task);
    if (!task || task.stageAttemptId !== selectors.implementationAttempt) {
      return { ok: false, message: "The selected task is not admitted under the specified Implementation attempt." };
    }
  }
  if (selectors.activity) {
    const activityAttemptId = selectors.attempt;
    const task = unit.tasks.find((candidate) => candidate.taskId === selectors.task);
    if (!task) return { ok: false, message: "The selected Activity task does not belong to this unit." };
    const activity = task.activities.find((candidate) => candidate.activity === selectors.activity);
    if (!activity || activity.stageAttemptId !== selectors.implementationAttempt) {
      return { ok: false, message: "The Activity does not belong to the selected task and Implementation parent." };
    }
    if (!activityAttemptId) {
      if (kind !== "interaction") return { ok: false, message: "Evidence and approval for an Activity require an explicit Activity attempt." };
      return {
        ok: true,
        stage: "implementation",
        stageAttemptId: selectors.implementationAttempt!,
        taskId: selectors.task,
        activity: selectors.activity,
        causedBy: task.admission ? [task.admission.event.id] : [],
      };
    }
    if (!activity.attempts.some((candidate) => candidate.attemptId === activityAttemptId)) {
      return { ok: false, message: "The Activity attempt does not belong to the selected task and Implementation parent." };
    }
    const selectedAttempt = activity.attempts.find((candidate) => candidate.attemptId === activityAttemptId);
    const startFacts = selectedAttempt?.facts.filter((fact) => ["construction.activity-attempt-started", "construction.activity-resumed"].includes(fact.event.type)) ?? [];
    return {
      ok: true,
      stage: "implementation",
      stageAttemptId: selectors.implementationAttempt!,
      taskId: selectors.task,
      activity: selectors.activity,
      activityAttemptId,
      causedBy: startFacts.slice(-1).map((fact) => fact.event.id),
    };
  }

  const selectedAttempt = stageProjection?.attempts.find((candidate) => candidate.attemptId === selectedStageAttempt);
  const starts = selectedAttempt?.facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)) ?? [];
  return {
    ok: true,
    stage,
    ...(selectedStageAttempt ? { stageAttemptId: selectedStageAttempt } : {}),
    ...(selectors.task ? { taskId: selectors.task } : {}),
    causedBy: starts.slice(-1).map((fact) => fact.event.id),
  };
};

export type AuditHistoryReadResult =
  | {
      readonly kind: "loaded";
      readonly root: string;
      readonly missionId: string;
      readonly history: Awaited<ReturnType<SelectedHistoryReader["read"]>>["history"];
      readonly historyMetadata: HistoryReaderMetadata;
      readonly projection: ReturnType<typeof projectConstruction>;
      readonly unit: ReturnType<typeof projectConstruction>["units"][number];
    }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string; readonly history_metadata?: HistoryReaderMetadata };

export class AuditContextResolver implements AuditRecordContextResolver {
  constructor(private readonly runtime: AuditContextRuntime) {}

  async readUnit(unitId: string, project?: string): Promise<AuditHistoryReadResult> {
    const selected = await this.runtime.projects.resolve(project);
    if (selected.kind === "failed") return selected;
    let missionIds: readonly string[];
    try {
      const missionsRoot = Path.join(selected.root, ".kepler", "missions");
      missionIds = (await this.runtime.fileSystem.directories(missionsRoot, selected.root)).filter((value) => uuidV4.test(value));
    } catch (error) {
      return failure("audit_history_unavailable", "Kepler could not enumerate recorded missions.", { message: error instanceof Error ? error.message : String(error) });
    }
    const matches: Array<{ missionId: string; history: Awaited<ReturnType<SelectedHistoryReader["read"]>>["history"]; historyMetadata: HistoryReaderMetadata; projection: ReturnType<typeof projectConstruction>; unit?: ReturnType<typeof projectConstruction>["units"][number] }> = [];
    try {
      for (const missionId of missionIds) {
        const selectedHistory = await this.runtime.historyReader.read(selected.root, missionId);
        const historyMetadata = historyReaderMetadata(selectedHistory);
        const projection = projectConstruction(selectedHistory.history);
        const unit = projection.units.find((candidate) => candidate.unitId === unitId);
        if (unit || knownHistoryUnitIds(selectedHistory).includes(unitId)) {
          matches.push({ missionId, history: selectedHistory.history, historyMetadata, projection, ...(unit ? { unit } : {}) });
        }
      }
    } catch (error) {
      return failure("audit_history_unavailable", "Kepler could not read the selected record home's history safely.", {
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof HistoryError ? { history_error_code: error.code } : {}),
      }, unavailableHistoryMetadata());
    }
    if (matches.length !== 1) return invalidScope(matches.length === 0 ? "The selected unit has no recorded membership in this record home." : "The selected unit has conflicting mission ownership.", { unit_id: unitId, matches: matches.length });
    const match = matches[0]!;
    if (!match.unit) {
      const code = match.historyMetadata.mode === "recovering" ? "audit_history_recovering" : "audit_scope_unavailable";
      return failure(code, "The selected Unit of Work is known, but its selected history has no phase facts to project.", {
        mission_id: match.missionId,
        unit_id: unitId,
      }, match.historyMetadata);
    }
    if (!match.unit.initialized || match.unit.blocked) return failure("audit_scope_unavailable", "The selected unit's history is incomplete or inconsistent.", { mission_id: match.missionId, unit_id: match.unit.unitId, history_issues: match.unit.historyIssues, projection_issues: match.unit.projectionIssues }, match.historyMetadata);
    return { kind: "loaded", root: selected.root, missionId: match.missionId, history: match.history, historyMetadata: match.historyMetadata, projection: match.projection, unit: match.unit };
  }

  async resolve(
    selectors: ScopeSelectors,
    project?: string,
    kind: AuditRecordKind = "evidence",
    relatedRequestEventId?: string,
    relatedEventIds?: readonly string[],
    preAdmissionTaskEvidence = false,
  ) {
    if (!selectors.unit) return invalidScope("Audit recording requires an explicit --unit selector.");
    if (selectors.attempt && !selectors.stage && !selectors.activity) return invalidScope("--attempt requires --stage unless it selects an Activity attempt.");
    const loaded = await this.readUnit(selectors.unit, project);
    if (loaded.kind === "failed") return loaded;
    const explicitHistoryVersion = (selectors as ScopeSelectors & { readonly historyVersion?: string }).historyVersion;
    if (loaded.historyMetadata.migration_required) return failure("history_migration_required", "Legacy mission history is read-only until its approved layout migration completes.", { mission_id: loaded.missionId }, loaded.historyMetadata);
    if (loaded.historyMetadata.mode === "recovering" || loaded.historyMetadata.pending_recovery) return failure("history_recovery_pending", "Audit records cannot be written while mission history is recovering or has pending recovery work.", { mission_id: loaded.missionId }, loaded.historyMetadata);
    if (loaded.historyMetadata.mode !== "active") return failure("history_selection_unavailable", "Audit recording requires one selected active generation.", { mission_id: loaded.missionId }, loaded.historyMetadata);
    if (!explicitHistoryVersion) return failure("history_version_required", "Audit recording requires the exact selected history version.", { mission_id: loaded.missionId }, loaded.historyMetadata);
    if (explicitHistoryVersion !== loaded.historyMetadata.history_version) return failure("history_version_stale", "The selected audit history version changed before recording.", { mission_id: loaded.missionId, requested_history_version: explicitHistoryVersion, selected_history_version: loaded.historyMetadata.history_version }, loaded.historyMetadata);
    const generationId = loaded.historyMetadata.generation_id;
    if (!generationId) return failure("history_generation_missing", "The selected active history has no generation identity.", { mission_id: loaded.missionId }, loaded.historyMetadata);
    let bound = attemptContext(kind, selectors, loaded.unit);
    if (!bound.ok && preAdmissionTaskEvidence && selectors.task && selectors.implementationAttempt &&
        !selectors.activity && !selectors.attempt && (selectors.stage === undefined || selectors.stage === "implementation")) {
      const selectedTask = loaded.unit.tasks.find((candidate) => candidate.taskId === selectors.task);
      const stage = loaded.unit.stages.find((candidate) => candidate.stage === "implementation");
      const attempt = stage?.attempts.find((candidate) => candidate.attemptId === selectors.implementationAttempt && candidate.state === "running");
      const start = attempt?.facts.filter((fact) => ["construction.stage-attempt-started", "construction.stage-resumed"].includes(fact.event.type)).at(-1);
      let taskExists = false;
      try {
        taskExists = await this.runtime.taskExists?.(selectors.unit, selectors.task, project) ?? false;
      } catch {
        taskExists = false;
      }
      if (!taskExists) return invalidScope("Pre-admission prerequisite evidence must name a task in the current authored task graph.", { task_id: selectors.task }, loaded.historyMetadata);
      const admittedInCurrentAttempt = selectedTask?.admissions.some((fact) =>
        fact.event.type === "construction.task-admitted" && fact.event.data.stage_attempt_id === selectors.implementationAttempt,
      ) ?? false;
      if (admittedInCurrentAttempt || stage?.state !== "running" ||
          stage.currentAttemptId !== selectors.implementationAttempt || !start) {
        return invalidScope("Pre-admission prerequisite evidence requires a graph task without prior admission under the current running Implementation attempt.", {
          task_id: selectors.task, implementation_attempt_id: selectors.implementationAttempt,
        }, loaded.historyMetadata);
      }
      bound = { ok: true, stage: "implementation", stageAttemptId: selectors.implementationAttempt, taskId: selectors.task, causedBy: [start.event.id] };
    }
    if (!bound.ok) return invalidScope(bound.message, { mission_id: loaded.missionId, unit_id: loaded.unit.unitId }, loaded.historyMetadata);
    let causedBy = bound.causedBy;
    if (relatedRequestEventId !== undefined) {
      if (kind !== "evidence" || !selectors.stage || !selectors.attempt || !uuidV4.test(relatedRequestEventId)) {
        return invalidScope("A related requester interaction requires stage-scoped evidence for an explicit current attempt.", { stage: selectors.stage, attempt_id: selectors.attempt }, loaded.historyMetadata);
      }
      const matches = loaded.unit.interactions.filter((fact) => fact.event.id === relatedRequestEventId);
      const request = matches.length === 1 ? matches[0] : undefined;
      const currentStart = bound.causedBy.at(-1);
      if (!request || request.event.type !== "construction.interaction-recorded" ||
          request.event.data.stage !== selectors.stage || request.event.data.stage_attempt_id !== selectors.attempt ||
          !hasRequesterParticipant(request.event.data.participants) ||
          !currentStart || !request.event.caused_by.some((cause) => String(cause) === currentStart)) {
        return invalidScope("The related requester interaction must belong to the selected attempt and follow its current stage start.", {
          request_event_id: relatedRequestEventId, stage: selectors.stage, attempt_id: selectors.attempt,
        }, loaded.historyMetadata);
      }
      causedBy = [...causedBy, relatedRequestEventId];
    }
    if (relatedEventIds !== undefined) {
      if (kind !== "evidence" || !selectors.stage || !selectors.attempt || relatedEventIds.length === 0 ||
          new Set(relatedEventIds).size !== relatedEventIds.length || relatedEventIds.some((id) => !uuidV4.test(id))) {
        return invalidScope("Related event references require stage-scoped evidence for an explicit current attempt.", { stage: selectors.stage, attempt_id: selectors.attempt }, loaded.historyMetadata);
      }
      const currentStart = bound.causedBy.at(-1);
      for (const relatedEventId of relatedEventIds) {
        const matches = loaded.unit.evidence.map((item) => item.fact).filter((fact) => fact.event.id === relatedEventId);
        const evidence = matches.length === 1 ? matches[0] : undefined;
        if (!evidence || evidence.event.type !== "construction.evidence-recorded" ||
            evidence.event.data.stage !== selectors.stage || evidence.event.data.stage_attempt_id !== selectors.attempt ||
            !currentStart || !evidence.event.caused_by.some((cause) => String(cause) === currentStart)) {
          return invalidScope("Related evidence must belong to the selected current stage attempt and follow its stage start.", {
            evidence_event_id: relatedEventId, stage: selectors.stage, attempt_id: selectors.attempt,
          }, loaded.historyMetadata);
        }
      }
      causedBy = [...causedBy, ...relatedEventIds];
    }
    const journalId = this.runtime.identities.next();
    if (!uuidV4.test(journalId)) return failure("audit_identity_failed", "Kepler could not allocate a valid journal identity.", {}, loaded.historyMetadata);
    try {
      const journal = this.runtime.journals.create({ recordHome: loaded.root, missionId: loaded.missionId, historyVersion: explicitHistoryVersion, generationId, journalId, phase: CONSTRUCTION_PHASE });
      return {
        kind: "resolved" as const,
        context: {
          scope: {
          missionId: loaded.missionId,
          unitId: loaded.unit.unitId,
          ...(bound.stage ? { stage: bound.stage } : {}),
          ...(bound.stageAttemptId ? { stageAttemptId: bound.stageAttemptId } : {}),
          ...(bound.taskId ? { taskId: bound.taskId } : {}),
          ...(bound.activity ? { activity: bound.activity } : {}),
          ...(bound.activityAttemptId ? { activityAttemptId: bound.activityAttemptId } : {}),
          causedBy,
        },
        journalId,
        journal,
      } satisfies AuditRecordContext,
      historyMetadata: loaded.historyMetadata,
    };
    } catch (error) {
      return failure("audit_journal_unavailable", "Kepler could not create a journal for the selected generation.", { message: error instanceof Error ? error.message : String(error), history_version: explicitHistoryVersion, generation_id: generationId }, loaded.historyMetadata);
    }
  }
}

export const createNodeAuditContextRuntime = (
  projects: ProjectResolver,
  historyReader: SelectedHistoryReader,
  journals: AuditJournalFactory,
  taskExists?: AuditContextRuntime["taskExists"],
): AuditContextRuntime => ({
  projects,
  fileSystem: createNodeAuditContextFileSystem(),
  historyReader,
  journals,
  identities: { next: randomUUID },
  ...(taskExists ? { taskExists } : {}),
});
