import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import type { EventId } from "@vialactea-works/kepler-core";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import { createEventJournal, type EventJournal } from "../history/journal.js";
import { parseAttachment, type LocalWorkspaceAttachment, type MissionWorkspaceRuntime } from "./mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "./mission-workspace-runtime.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  CONSTRUCTION_STAGES,
  validateConstructionEvent,
  type ConstructionStage,
  type MissionId,
  type StageAttemptId,
  type UnitId,
} from "./events.js";

export interface StageStartRequest {
  readonly inputs: readonly { readonly reference: string; readonly purpose: string }[];
}

export interface StageStartRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

export type StageStartRequestValidation =
  | { readonly kind: "valid"; readonly request: StageStartRequest }
  | { readonly kind: "invalid"; readonly issues: readonly StageStartRequestIssue[] };

export interface StageStartRuntime {
  readonly workspace: MissionWorkspaceRuntime;
  readonly identities: { readonly next: () => string };
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly journals: {
    readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
  };
}

export type StageStartResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly data: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const uuidV4 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const commitId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

export const validateStageStartRequest = (value: unknown): StageStartRequestValidation => {
  const issues: StageStartRequestIssue[] = [];
  const issue = (pointer: string, message: string) => issues.push({ pointer, message });
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one stage-start request object." }] };
  for (const key of Object.keys(value)) {
    if (key !== "inputs") issue(`/${key}`, "Unknown stage-start request field.");
  }
  const inputs: { reference: string; purpose: string }[] = [];
  if (!Array.isArray(value.inputs) || value.inputs.length === 0) {
    issue("/inputs", "Select at least one applicable stage input.");
  } else {
    value.inputs.forEach((input, index) => {
      const pointer = `/inputs/${index}`;
      if (!isRecord(input) || !onlyKeys(input, ["reference", "purpose"]) ||
          !nonEmpty(input.reference) || !nonEmpty(input.purpose)) {
        issue(pointer, "Each stage input requires only a non-empty reference and purpose.");
      } else {
        inputs.push({ reference: input.reference, purpose: input.purpose });
      }
    });
  }
  if (issues.length > 0) return { kind: "invalid", issues };
  return { kind: "valid", request: { inputs } };
};

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry the stage start without dispatching work.",
): StageStartResult => ({ kind: "failed", data: { code, message, details, recovery } });

const propagateReadFailure = (result: Extract<AuditHistoryReadResult, { kind: "failed" }>): StageStartResult =>
  failure(result.code, result.message, result.details, result.recovery);

const commonDirectory = async (
  runtime: StageStartRuntime,
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

type CapturedCheckpoints =
  | { readonly kind: "valid"; readonly checkpoints: readonly { readonly repository_id: string; readonly commit: string }[] }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>> };

const pathContains = (parent: string, child: string): boolean => {
  const relative = Path.relative(parent, child);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${Path.sep}`) && !Path.isAbsolute(relative);
};

const sameStartingCheckpoint = (
  expected: unknown,
  actual: LocalWorkspaceAttachment["starting_checkpoint"],
): boolean => isRecord(expected) && expected.kind === actual.kind &&
  (actual.kind === "no-commit" || expected.commit === actual.commit);

const captureStageCheckpoints = async (
  runtime: StageStartRuntime,
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  commonDir: string,
): Promise<CapturedCheckpoints> => {
  const fail = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}): CapturedCheckpoints => ({
    kind: "failed",
    code,
    message,
    details,
  });
  const readDirectory = runtime.workspace.fileSystem.readDirectory;
  if (!readDirectory) return fail("stage_workspace_listing_unavailable", "The runtime cannot enumerate prepared workspace attachments.");
  const createdEvents = loaded.history.events.filter((record) =>
    record.event?.type === "construction.mission-created" && record.event.data.mission_id === loaded.missionId &&
    record.event.data.workflow === "standard",
  );
  const preparedEvents = loaded.history.events.filter((record) =>
    record.event?.type === "construction.mission-workspaces-prepared" && record.event.data.mission_id === loaded.missionId,
  );
  const missionEvent = createdEvents[0]?.event;
  const preparedEvent = preparedEvents[0]?.event;
  if (createdEvents.length !== 1 || preparedEvents.length !== 1 || !missionEvent || !preparedEvent) {
    return fail("stage_workspace_binding_invalid", "Stage checkpoints require unique Standard mission and prepared-workspace facts.", {
      mission_created_events: createdEvents.length,
      workspace_prepared_events: preparedEvents.length,
    });
  }
  const missionData = missionEvent.data;
  const preparedData = preparedEvent.data;
  const recordHome = isRecord(missionData.record_home) ? missionData.record_home.repository_id : undefined;
  const selected: unknown[] = [];
  if (Array.isArray(missionData.repositories)) {
    for (const repository of missionData.repositories) {
      if (isRecord(repository)) selected.push(repository.repository_id);
    }
  }
  const preparedById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(preparedData.repositories)) {
    for (const value of preparedData.repositories) {
      if (!isRecord(value)) continue;
      const repository = value;

    if (!nonEmpty(repository.repository_id) || preparedById.has(repository.repository_id)) {
      return fail("stage_workspace_binding_invalid", "Prepared repository identities must be non-empty and unique.");
    }
      preparedById.set(repository.repository_id, repository);
    }
  }
  if (!nonEmpty(recordHome) || selected.length === 0 || selected.some((id) => !nonEmpty(id) || !preparedById.has(id)) ||
      preparedById.size !== selected.length) {
    return fail("stage_workspace_binding_invalid", "Prepared workspace facts do not match the mission's selected repository set.", {
      selected_repository_ids: selected,
      prepared_repository_ids: [...preparedById.keys()],
    });
  }
  const directory = Path.join(commonDir, "kepler", "missions", loaded.missionId, "workspaces");
  if (await runtime.workspace.fileSystem.pathKind(directory) !== "directory") {
    return fail("stage_workspace_attachments_missing", "The mission's local prepared-workspace attachment directory is unavailable.", { directory });
  }
  let canonicalDirectory: string;
  let names: readonly string[];
  try {
    canonicalDirectory = await runtime.workspace.fileSystem.realpath(directory);
    if (!pathContains(commonDir, canonicalDirectory)) {
      return fail("stage_workspace_attachment_path_invalid", "The prepared-workspace attachment directory escapes the record home's Git common directory.", { directory: canonicalDirectory });
    }
    names = (await readDirectory(canonicalDirectory)).filter((name) => name.endsWith(".json")).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    return fail("stage_workspace_attachments_unreadable", "Kepler could not enumerate the mission's prepared-workspace attachments.", {
      directory,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const seenRepositories = new Set<string>();
  const checkpoints: { repository_id: string; commit: string }[] = [];
  for (const name of names) {
    const attachmentPath = Path.join(canonicalDirectory, name);
    if (await runtime.workspace.fileSystem.pathKind(attachmentPath) !== "file") {
      return fail("stage_workspace_attachment_invalid", "Every workspace attachment must be a regular file.", { attachment_path: attachmentPath });
    }
    let attachment: LocalWorkspaceAttachment | undefined;
    try {
      attachment = parseAttachment(JSON.parse(await runtime.workspace.fileSystem.readFile(attachmentPath)) as unknown);
    } catch {
      attachment = undefined;
    }
    if (!attachment || attachment.mission_id !== loaded.missionId ||
        attachment.record_home_repository_id !== recordHome ||
        attachment.workspace_id.length === 0 || name !== `${attachment.workspace_id}.json` ||
        attachment.common_directory !== commonDir || attachment.repository_path !== attachment.workspace_path ||
        !preparedById.has(attachment.repository_id) || seenRepositories.has(attachment.repository_id)) {
      return fail("stage_workspace_attachment_invalid", "A local workspace attachment does not match this mission's prepared repository binding.", {
        attachment_path: attachmentPath,
        repository_id: attachment?.repository_id,
      });
    }
    const preparedRepository = preparedById.get(attachment.repository_id);
    if (!preparedRepository) {
      return fail("stage_workspace_attachment_invalid", "A local workspace attachment names an unprepared repository.", {
        repository_id: attachment.repository_id,
        workspace_id: attachment.workspace_id,
      });
    }
    if (attachment.branch !== preparedRepository.branch ||
        attachment.integration_target !== preparedRepository.integration_target ||
        !sameStartingCheckpoint(preparedRepository.starting_checkpoint, attachment.starting_checkpoint)) {
      return fail("stage_workspace_attachment_stale", "A local workspace attachment no longer matches its prepared history fact.", {
        repository_id: attachment.repository_id,
        workspace_id: attachment.workspace_id,
      });
    }
    seenRepositories.add(attachment.repository_id);
    const workspacePath = attachment.workspace_path;
    if (!Path.isAbsolute(workspacePath) || await runtime.workspace.fileSystem.pathKind(workspacePath) !== "directory") {
      return fail("stage_workspace_unavailable", "A prepared repository workspace is unavailable.", {
        repository_id: attachment.repository_id,
        workspace_path: workspacePath,
      });
    }
    let actualRoot: string;
    try {
      actualRoot = await runtime.workspace.fileSystem.realpath(workspacePath);
      if (actualRoot !== workspacePath) {
        return fail("stage_workspace_identity_changed", "A prepared workspace path no longer resolves to its canonical recorded path.", {
          repository_id: attachment.repository_id,
          workspace_path: workspacePath,
          actual_path: actualRoot,
        });
      }
    } catch (error) {
      return fail("stage_workspace_unavailable", "Kepler could not resolve a prepared repository workspace.", {
        repository_id: attachment.repository_id,
        workspace_path: workspacePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const topLevel = await runtime.workspace.git.run(actualRoot, ["rev-parse", "--show-toplevel"]);
    const actualCommon = await commonDirectory(runtime, actualRoot);
    const gitDirectory = await runtime.workspace.git.run(actualRoot, ["rev-parse", "--absolute-git-dir"]);
    if (topLevel.status !== 0 || await runtime.workspace.fileSystem.realpath(topLevel.stdout.trim()) !== actualRoot ||
        actualCommon !== commonDir || gitDirectory.status !== 0 ||
        await runtime.workspace.fileSystem.realpath(gitDirectory.stdout.trim()) !== attachment.git_directory) {
      return fail("stage_workspace_identity_changed", "A prepared workspace no longer resolves to its recorded Git repository identity.", {
        repository_id: attachment.repository_id,
        workspace_path: workspacePath,
      });
    }
    const head = await runtime.workspace.git.run(actualRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
    if (head.status === 0 && commitId(head.stdout.trim())) {
      checkpoints.push({ repository_id: attachment.repository_id, commit: head.stdout.trim() });
      continue;
    }
    if (attachment.starting_checkpoint.kind !== "no-commit") {
      return fail("stage_workspace_head_unavailable", "A prepared repository with a recorded starting commit has no resolvable current HEAD.", {
        repository_id: attachment.repository_id,
        stderr: head.stderr.trim(),
      });
    }
    const symbolicHead = await runtime.workspace.git.run(actualRoot, ["symbolic-ref", "--quiet", "HEAD"]);
    const branch = symbolicHead.stdout.trim();
    const branchExists = nonEmpty(branch)
      ? await runtime.workspace.git.run(actualRoot, ["show-ref", "--verify", "--quiet", branch])
      : undefined;
    if (symbolicHead.status !== 0 || !branch.startsWith("refs/heads/") || branchExists?.status !== 1) {
      return fail("stage_workspace_head_unavailable", "Kepler could not verify that a commitless prepared repository still has an unborn branch.", {
        repository_id: attachment.repository_id,
        stderr: head.stderr.trim(),
      });
    }
  }
  if (seenRepositories.size !== preparedById.size) {
    return fail("stage_workspace_attachment_missing", "Every prepared mission repository requires one current local workspace attachment.", {
      prepared_repository_ids: [...preparedById.keys()],
      attached_repository_ids: [...seenRepositories],
    });
  }
  return { kind: "valid", checkpoints: checkpoints.sort((left, right) => left.repository_id.localeCompare(right.repository_id)) };
};

const currentAuthority = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  stage: ConstructionStage,
): { readonly kind: "valid"; readonly eventIds: readonly string[] } | {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
} => {
  const stageIndex = CONSTRUCTION_STAGES.indexOf(stage);
  const selected = loaded.unit.stages[stageIndex];
  if (!selected || !["not_started", "reopened"].includes(selected.state)) {
    return {
      kind: "failed",
      code: "stage_attempt_unavailable",
      message: "The selected stage is not eligible to start a new attempt.",
      details: { stage, state: selected?.state, current_attempt_id: selected?.currentAttemptId },
    };
  }
  const priorStages = loaded.unit.stages.slice(0, stageIndex);
  if (priorStages.some((prior) => prior.state !== "completed")) {
    return {
      kind: "failed",
      code: "standard_stage_order_blocked",
      message: "Every preceding Standard stage must be complete before this stage can start.",
      details: {
        stage,
        blockers: priorStages.flatMap((prior) => prior.state === "completed" ? [] : [{ stage: prior.stage, state: prior.state }]),
      },
    };
  }
  const eventIds: string[] = [];
  if (stageIndex === 0) {
    const missionCreated = loaded.history.events.filter((record) =>
      record.event?.type === "construction.mission-created" && record.event.data.mission_id === loaded.missionId &&
      record.event.data.workflow === "standard",
    );
    const prepared = loaded.history.events.filter((record) =>
      record.event?.type === "construction.mission-workspaces-prepared" && record.event.data.mission_id === loaded.missionId,
    );
    const missionCreatedFact = missionCreated[0]?.event;
    const preparedFact = prepared[0]?.event;
    const created = loaded.unit.created;
    if (missionCreated.length !== 1 || prepared.length !== 1 || !missionCreatedFact || !preparedFact || !created) {
      return {
        kind: "failed",
        code: "stage_start_workspace_unprepared",
        message: "Functional Design requires the Standard mission, prepared selected workspaces, and unit membership.",
        details: { mission_created_events: missionCreated.length, workspace_prepared_events: prepared.length, unit_created: created !== undefined },
      };
    }
    const missionData = missionCreatedFact.data;
    const preparedData = preparedFact.data;
    const selectedRepositories: unknown[] = [];
    const preparedRepositories: unknown[] = [];
    if (isRecord(missionData) && Array.isArray(missionData.repositories)) {
      for (const repository of missionData.repositories) {
        if (isRecord(repository)) selectedRepositories.push(repository.repository_id);
      }
    }
    if (isRecord(preparedData) && Array.isArray(preparedData.repositories)) {
      for (const repository of preparedData.repositories) {
        if (isRecord(repository)) preparedRepositories.push(repository.repository_id);
      }
    }
    if (selectedRepositories.length === 0 || selectedRepositories.some((repository) =>
      typeof repository !== "string" || !preparedRepositories.includes(repository))) {
      return {
        kind: "failed",
        code: "stage_start_workspace_unprepared",
        message: "Every selected mission repository must have a recorded prepared workspace before Functional Design starts.",
        details: { selected_repository_ids: selectedRepositories, prepared_repository_ids: preparedRepositories },
      };
    }
    eventIds.push(missionCreatedFact.id, preparedFact.id, created.event.id);
  } else {
    for (const prior of priorStages) {
      const attempt = prior.attempts.find((candidate) => candidate.attemptId === prior.currentAttemptId);
      const completions = attempt?.facts.filter((fact) => fact.event.type === "construction.stage-attempt-completed") ?? [];
      if (completions.length !== 1 || !completions[0]) {
        return {
          kind: "failed",
          code: "standard_stage_authority_missing",
          message: "A preceding Standard stage has no unique validated completion fact for its current attempt.",
          details: { stage: prior.stage, attempt_id: prior.currentAttemptId, completion_events: completions.length },
        };
      }
      eventIds.push(completions[0].event.id);
    }
  }
  if (selected.state === "reopened") {
    const reopen = selected.facts.at(-1);
    const revisionId = reopen?.event.type === "construction.stage-reopened" ? reopen.event.data.revision_id : undefined;
    const authorizations = loaded.unit.revisions.filter((fact) => fact.event.data.revision_id === revisionId);
    const authorization = authorizations[0];
    if (!reopen || !revisionId || authorizations.length !== 1 || !authorization) {
      return {
        kind: "failed",
        code: "stage_reopen_authority_missing",
        message: "The reopened stage has no unique current orchestrator authorization.",
        details: { stage, revision_id: revisionId, authorization_events: authorizations.length },
      };
    }
    eventIds.push(reopen.event.id, authorization.event.id);
  }
  return { kind: "valid", eventIds: [...new Set(eventIds)] };
};

const validIdentities = (
  eventId: string,
  journalId: string,
  attemptId: string,
  existing: ReadonlySet<string>,
): boolean => uuidV4(eventId) && uuidV4(journalId) && uuidV4(attemptId) &&
  new Set([eventId, journalId, attemptId]).size === 3 &&
  !existing.has(eventId) && !existing.has(journalId) && !existing.has(attemptId);

const existingIdentities = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
): Set<string> => {
  const values = new Set<string>();
  for (const record of loaded.history.events) {
    if (record.event) {
      values.add(record.event.id);
      values.add(record.event.journal_id);
      for (const field of ["mission_id", "unit_id", "stage_attempt_id", "task_id", "activity_attempt_id", "revision_id", "evidence_id"] as const) {
        const value = record.event.data[field];
        if (typeof value === "string") values.add(value);
      }
    }
  }
  for (const stage of loaded.unit.stages) {
    for (const attempt of stage.attempts) values.add(attempt.attemptId);
  }
  return values;
};

export class StageStart {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly runtime: StageStartRuntime,
  ) {}

  async execute(
    selectors: ScopeSelectors,
    rawRequest: unknown,
    project?: string,
  ): Promise<StageStartResult> {
    if (!selectors.unit || !selectors.stage || !CONSTRUCTION_STAGES.includes(selectors.stage) ||
        selectors.attempt !== undefined || selectors.task !== undefined || selectors.activity !== undefined ||
        selectors.implementationAttempt !== undefined || selectors.mission !== undefined) {
      return failure("invalid_stage_start_scope", "Stage start requires exactly --unit and --stage; the operation creates the attempt identity.", {
        unit_id: selectors.unit,
        stage: selectors.stage,
        attempt_id: selectors.attempt,
      });
    }
    const parsed = validateStageStartRequest(rawRequest);
    if (parsed.kind === "invalid") {
      return failure("invalid_stage_start_request", "The typed stage-start request failed validation.", { issues: parsed.issues }, "Provide applicable stage input references, then retry.");
    }
    const stage = selectors.stage;
    const firstRead = await this.contexts.readUnit(selectors.unit, project);
    if (firstRead.kind === "failed") return propagateReadFailure(firstRead);
    const firstAuthority = currentAuthority(firstRead, stage);
    if (firstAuthority.kind === "failed") return failure(firstAuthority.code, firstAuthority.message, firstAuthority.details);
    const commonDir = await commonDirectory(this.runtime, firstRead.root);
    if (!commonDir) return failure("stage_coordination_unavailable", "Git could not resolve the record home's common directory.", { repository_root: firstRead.root });
    const acquired = await this.runtime.workspace.coordination.acquire({
      commonDirectory: commonDir,
      location: { kind: "mission", missionId: firstRead.missionId },
      resourceKey: createHash("sha256").update(JSON.stringify([firstRead.missionId, selectors.unit, "stage", stage])).digest("hex"),
      owner: {
        machine_id: this.runtime.workspace.identity.machine_id,
        process_id: this.runtime.workspace.identity.process_id,
        process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
        mission_id: firstRead.missionId,
        resource_scope: `construction/stage/${selectors.unit}/${stage}`,
      },
    });
    if (acquired.kind === "failed") return failure(acquired.code, acquired.message, acquired.details, acquired.recovery);

    let result: StageStartResult;
    try {
      const loaded = await this.contexts.readUnit(selectors.unit, project);
      if (loaded.kind === "failed") {
        result = propagateReadFailure(loaded);
      } else if (loaded.root !== firstRead.root || loaded.missionId !== firstRead.missionId) {
        result = failure("stage_scope_changed", "Unit membership changed while acquiring stage coordination.", { unit_id: selectors.unit });
      } else {
        result = await this.startLoaded(loaded, stage, parsed.request, commonDir);
      }
    } catch (error) {
      result = failure("stage_start_failed", "Kepler could not validate the selected Standard stage start safely.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const released = await acquired.lease.release();
    if (released.kind === "failed") {
      return failure("stage_coordination_release_failed", "The stage operation could not confirm that it released its coordination claim.", {
        ...released.details,
        operation_result: result.kind,
        ...(result.kind === "success" ? { event_id: result.data.id } : {}),
      }, released.recovery);
    }
    return result;
  }

  private async startLoaded(
    loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
    stage: ConstructionStage,
    request: StageStartRequest,
    commonDir: string,
  ): Promise<StageStartResult> {
    if (loaded.unit.workflow !== "standard") return failure("unsupported_workflow", "Stage start requires the recorded Standard workflow binding.", { workflow: loaded.unit.workflow });
    if (loaded.unit.blocked) return failure("stage_history_blocked", "Construction history or projection issues prevent a safe stage transition.", {
      history_issues: loaded.unit.historyIssues,
      projection_issues: loaded.unit.projectionIssues,
    });
    const authority = currentAuthority(loaded, stage);
    if (authority.kind === "failed") return failure(authority.code, authority.message, authority.details);
    const captured = await captureStageCheckpoints(this.runtime, loaded, commonDir);
    if (captured.kind === "failed") return failure(captured.code, captured.message, captured.details);
    let eventId: string;
    let journalId: string;
    let stageAttemptId: string;
    try {
      eventId = this.runtime.identities.next();
      journalId = this.runtime.identities.next();
      stageAttemptId = this.runtime.identities.next();
    } catch (error) {
      return failure("stage_start_identity_failed", "Kepler could not allocate stage-start identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!validIdentities(eventId, journalId, stageAttemptId, existingIdentities(loaded))) {
      return failure("stage_start_identity_conflict", "The allocated stage-start identities are invalid, reused, or already present in history.");
    }
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") {
      return failure("stage_start_journal_identity_conflict", "The allocated stage journal identity already has a filesystem entry.", { journal_id: journalId });
    }
    const candidate = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.stage-attempt-started",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: authority.eventIds,
      data: {
        mission_id: loaded.missionId as MissionId,
        unit_id: loaded.unit.unitId as UnitId,
        stage,
        stage_attempt_id: stageAttemptId as StageAttemptId,
        inputs: request.inputs,
        checkpoints: captured.checkpoints,
        authority_event_ids: authority.eventIds as EventId[],
      },
    };
    const validation = validateConstructionEvent(candidate);
    if (validation.status !== "valid") {
      return failure("stage_start_event_invalid", "The typed Construction stage-start event failed validation.", {
        issues: validation.status === "invalid" ? validation.issues : [validation.reason],
      });
    }
    try {
      await this.runtime.journals.create(loaded.root, loaded.missionId, journalId).append(validation.event);
    } catch (error) {
      return failure("stage_start_append_failed", "Kepler could not durably append the stage-start event.", {
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
        stage,
        attempt_id: stageAttemptId,
        inputs: request.inputs,
        checkpoints: captured.checkpoints,
        authority_event_ids: authority.eventIds,
        worker_dispatched: false,
      },
    };
  }
}

export const createNodeStageStartRuntime = (
  producer: { readonly name: string; readonly version: string },
): StageStartRuntime => {
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
