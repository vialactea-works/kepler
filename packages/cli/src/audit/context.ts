import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { randomUUID } from "node:crypto";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { collectHistory, type HistoryJournalSource } from "../history/collection.js";
import { projectConstruction } from "../construction/projection.js";
import { CONSTRUCTION_PHASE, type ConstructionStage } from "../construction/events.js";
import type { ProjectResolver } from "../cli/project-selection.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { AuditRecordContext, AuditRecordContextResolver, AuditRecordKind } from "./recording.js";

export interface AuditContextFileSystem {
  readonly directories: (path: string, root: string) => Promise<readonly string[]>;
  readonly files: (path: string, root: string) => Promise<readonly string[]>;
  readonly read: (path: string, root: string) => Promise<Uint8Array>;
}

export interface AuditJournalFactory {
  readonly create: (recordHome: string, missionId: string, journalId: string, phase: string) => EventJournal;
}

export interface AuditContextRuntime {
  readonly projects: ProjectResolver;
  readonly fileSystem: AuditContextFileSystem;
  readonly journals: AuditJournalFactory;
  readonly identities: { readonly next: () => string };
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
  files: async (path, root) => {
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
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => entry.name.slice(0, -6));
  },
  read: async (path, root) => {
    const canonicalRoot = await Fs.realpath(root);
    const canonicalPath = await Fs.realpath(path);
    if (!inRoot(canonicalRoot, canonicalPath)) throw new Error("Audit journal path escapes the selected record home.");
    const metadata = await Fs.lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Audit journal is not a regular file.");
    return new Uint8Array(await Fs.readFile(canonicalPath));
  },
});

export const createNodeAuditJournalFactory = (): AuditJournalFactory => ({
  create: (recordHome, missionId, journalId, phase) => createEventJournal({ recordHome, missionId, journalId, phase }),
});

const failure = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}) => ({
  kind: "failed" as const,
  code,
  message,
  details,
  recovery: "Correct the explicit audit scope or reconcile the recorded history before retrying.",
});

const invalidScope = (message: string, details: Readonly<Record<string, unknown>> = {}) => ({
  kind: "failed" as const,
  code: "invalid_audit_scope",
  message,
  details,
  recovery: "Select an existing unit and an explicitly recorded scope and attempt.",
});

const loadSources = async (
  root: string,
  missionId: string,
  fileSystem: AuditContextFileSystem,
): Promise<readonly HistoryJournalSource[]> => {
  const historyRoot = Path.join(root, ".kepler", "missions", missionId, "history");
  const phases = await fileSystem.directories(historyRoot, root);
  const sources: HistoryJournalSource[] = [];
  for (const phase of phases) {
    const phaseRoot = Path.join(historyRoot, phase);
    const journalIds = await fileSystem.files(phaseRoot, root);
    for (const journalId of journalIds) {
      const file = Path.join(phaseRoot, `${journalId}.jsonl`);
      sources.push({ sourceId: `${missionId}/${phase}/${journalId}`, missionId, phase, journalId, bytes: await fileSystem.read(file, root) });
    }
  }
  return sources;
};

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
      readonly history: ReturnType<typeof collectHistory>;
      readonly projection: ReturnType<typeof projectConstruction>;
      readonly unit: ReturnType<typeof projectConstruction>["units"][number];
    }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

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
    const matches: Array<{ missionId: string; history: ReturnType<typeof collectHistory>; projection: ReturnType<typeof projectConstruction>; unit: ReturnType<typeof projectConstruction>["units"][number] }> = [];
    try {
      for (const missionId of missionIds) {
        const sources = await loadSources(selected.root, missionId, this.runtime.fileSystem);
        const history = collectHistory(missionId, sources, { completeness: "complete" });
        const projection = projectConstruction(history);
        const unit = projection.units.find((candidate) => candidate.unitId === unitId);
        if (unit) matches.push({ missionId, history, projection, unit });
      }
    } catch (error) {
      return failure("audit_history_unavailable", "Kepler could not read the selected record home's history safely.", { message: error instanceof Error ? error.message : String(error) });
    }
    if (matches.length !== 1) return invalidScope(matches.length === 0 ? "The selected unit has no recorded membership in this record home." : "The selected unit has conflicting mission ownership.", { unit_id: unitId, matches: matches.length });
    const match = matches[0]!;
    if (!match.unit.initialized || match.unit.blocked) return failure("audit_scope_unavailable", "The selected unit's history is incomplete or inconsistent.", { mission_id: match.missionId, unit_id: match.unit.unitId, history_issues: match.unit.historyIssues, projection_issues: match.unit.projectionIssues });
    return { kind: "loaded", root: selected.root, missionId: match.missionId, history: match.history, projection: match.projection, unit: match.unit };
  }

  async resolve(
    selectors: ScopeSelectors,
    project?: string,
    kind: AuditRecordKind = "evidence",
    relatedRequestEventId?: string,
  ) {
    if (!selectors.unit) return invalidScope("Audit recording requires an explicit --unit selector.");
    if (selectors.attempt && !selectors.stage && !selectors.activity) return invalidScope("--attempt requires --stage unless it selects an Activity attempt.");
    const loaded = await this.readUnit(selectors.unit, project);
    if (loaded.kind === "failed") return loaded;
    const bound = attemptContext(kind, selectors, loaded.unit);
    if (!bound.ok) return invalidScope(bound.message, { mission_id: loaded.missionId, unit_id: loaded.unit.unitId });
    let causedBy = bound.causedBy;
    if (relatedRequestEventId !== undefined) {
      if (kind !== "evidence" || !selectors.stage || !selectors.attempt || !uuidV4.test(relatedRequestEventId)) {
        return invalidScope("A related requester interaction requires stage-scoped evidence for an explicit current attempt.", { stage: selectors.stage, attempt_id: selectors.attempt });
      }
      const matches = loaded.unit.interactions.filter((fact) => fact.event.id === relatedRequestEventId);
      const request = matches.length === 1 ? matches[0] : undefined;
      const currentStart = bound.causedBy.at(-1);
      if (!request || request.event.type !== "construction.interaction-recorded" ||
          request.event.data.stage !== selectors.stage || request.event.data.stage_attempt_id !== selectors.attempt ||
          !Array.isArray(request.event.data.participants) || !request.event.data.participants.includes("requester") ||
          !currentStart || !request.event.caused_by.some((cause) => String(cause) === currentStart)) {
        return invalidScope("The related requester interaction must belong to the selected attempt and follow its current stage start.", {
          request_event_id: relatedRequestEventId, stage: selectors.stage, attempt_id: selectors.attempt,
        });
      }
      causedBy = [...causedBy, relatedRequestEventId];
    }
    const journalId = this.runtime.identities.next();
    if (!uuidV4.test(journalId)) return failure("audit_identity_failed", "Kepler could not allocate a valid journal identity.");
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
        journal: this.runtime.journals.create(loaded.root, loaded.missionId, journalId, CONSTRUCTION_PHASE),
      } satisfies AuditRecordContext,
    };
  }
}

export const createNodeAuditContextRuntime = (projects: ProjectResolver): AuditContextRuntime => ({
  projects,
  fileSystem: createNodeAuditContextFileSystem(),
  journals: createNodeAuditJournalFactory(),
  identities: { next: randomUUID },
});
