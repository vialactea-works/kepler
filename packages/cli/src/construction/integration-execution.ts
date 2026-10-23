import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { AuditContextResolver, AuditHistoryReadResult } from "../audit/context.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { MissionCoordination, MissionCoordinationOwner, MissionCoordinationRequest } from "./mission-coordination.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE, validateConstructionEvent, type ConstructionEventRecord, type EvidenceId, type IntegrationInputCheckpoint, type MaterialInput, type RepositoryCheckpoint } from "./events.js";
import type { ConstructionHistoryFact, ConstructionUnitProjection } from "./projection.js";
import { ConstructionQueries, type TaskExecutionContext } from "./scoped-queries.js";
import { captureStageCheckpoints, createNodeStageStartRuntime, type StageStartRuntime } from "./stage-start.js";

export interface IntegrationEvidenceRequest {
  readonly prepared_event_id: string;
  readonly check: IntegrationEvidenceCheck;
  readonly executor: string;
  readonly result: { readonly status: "passed" | "failed" | "inconclusive"; readonly summary: string };
  readonly check_command?: { readonly repository_id: string; readonly executable: string; readonly argv: readonly string[] };
  readonly output_refs: readonly string[];
  readonly conditions: readonly string[];
}

export type IntegrationEvidenceCheck =
  | "code-integration-typecheck"
  | "code-integration-build"
  | "code-integration-full-test-suite"
  | "code-integration-self-review";

export interface IntegrationEvidenceRecordedData extends Record<string, unknown> {
  readonly check_command?: { readonly repository_id: string; readonly executable: string; readonly argv: readonly string[] };
}

export interface IntegrationExecutionRuntime extends Omit<StageStartRuntime, "workspace"> {
  readonly workspace: Omit<StageStartRuntime["workspace"], "coordination"> & {
    readonly coordination: MissionCoordination;
  };
}

export type IntegrationExecutionFailure = { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };
export type IntegrationExecutionResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | IntegrationExecutionFailure;

interface IntegrationScope {
  readonly unitId: string;
  readonly taskId: string;
  readonly implementationAttemptId: string;
  readonly activityAttemptId: string;
}

interface IntegrationLockSnapshot {
  readonly format: "kepler.construction.integration-lock.v1";
  readonly token: string;
  readonly mission_id: string;
  readonly unit_id: string;
  readonly task_id: string;
  readonly implementation_attempt_id: string;
  readonly activity_attempt_id: string;
  readonly common_directory: string;
  readonly resource_key: string;
  readonly location: { readonly kind: "mission"; readonly mission_id: string };
  readonly owner: MissionCoordinationOwner;
  readonly repository: { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string };
  readonly captured_inputs: readonly IntegrationInputCheckpoint[];
}

interface IntegrationScopeState {
  readonly loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>;
  readonly execution: TaskExecutionContext;
  readonly scope: IntegrationScope;
  readonly commonDirectory: string;
  readonly parentStart: ConstructionHistoryFact;
  readonly admission: ConstructionHistoryFact;
  readonly generationCompletion: ConstructionHistoryFact;
  readonly validationStart: ConstructionHistoryFact;
  readonly validationCompletion: ConstructionHistoryFact;
  readonly integrationStart: ConstructionHistoryFact;
  readonly validationEvidence: readonly ConstructionHistoryFact[];
  readonly taskOutputRefs: readonly string[];
}

const uuidV4 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const commitId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
};
const checkpointKey = (value: readonly RepositoryCheckpoint[]): string => JSON.stringify(value.slice().sort((left, right) => left.repository_id.localeCompare(right.repository_id)));
const integrationInputKey = (value: readonly IntegrationInputCheckpoint[]): string => JSON.stringify(value.slice().sort((left, right) => left.repository_id.localeCompare(right.repository_id)));
const sameStrings = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && [...left].sort().join("\0") === [...right].sort().join("\0");
const sameInputs = (left: unknown, right: readonly MaterialInput[]): boolean => Array.isArray(left) && stable(left) === stable(right);
const isMaterialInputSet = (value: unknown): value is readonly MaterialInput[] => Array.isArray(value) && value.every((item) =>
  isRecord(item) && nonEmpty(item.reference) && nonEmpty(item.purpose));
const isEvidenceId = (value: unknown): value is EvidenceId => uuidV4(value);
const fail = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}, recovery = "Resolve the reported Integration condition and retry without discarding the lock, candidate, or evidence."): IntegrationExecutionFailure => ({ kind: "failed", code, message, details, recovery });
const propagate = (result: Extract<AuditHistoryReadResult, { readonly kind: "failed" }>): IntegrationExecutionFailure => fail(result.code, result.message, result.details, result.recovery);
const uuidIdentity = (runtime: IntegrationExecutionRuntime, existing: ReadonlySet<string>): string | undefined => {
  const id = runtime.identities.next();
  return uuidV4(id) && !existing.has(id) ? id : undefined;
};

const currentParentStart = (unit: ConstructionUnitProjection, attemptId: string): ConstructionHistoryFact | undefined => {
  const stage = unit.stages.find((item) => item.stage === "implementation");
  const attempt = stage?.attempts.find((item) => item.attemptId === attemptId && item.state === "running");
  if (!stage || stage.state !== "running" || stage.currentAttemptId !== attemptId || !attempt) return undefined;
  return attempt.facts.filter((fact) => fact.event.type === "construction.stage-attempt-started" || fact.event.type === "construction.stage-resumed").at(-1);
};

const currentAdmission = (unit: ConstructionUnitProjection, taskId: string, parentAttemptId: string): ConstructionHistoryFact | undefined => {
  const task = unit.tasks.find((item) => item.taskId === taskId);
  const matches = task?.admissions.filter((fact) => fact.event.type === "construction.task-admitted" && fact.event.data.stage_attempt_id === parentAttemptId) ?? [];
  return matches.length === 1 && task?.admission?.event.id === matches[0]?.event.id ? matches[0] : undefined;
};

const latestCompleted = (unit: ConstructionUnitProjection, taskId: string, activityName: "code-generation" | "code-validation", parentAttemptId: string): ConstructionHistoryFact | undefined => {
  const task = unit.tasks.find((item) => item.taskId === taskId);
  const activity = task?.activities.find((item) => item.activity === activityName);
  if (!activity || activity.state !== "completed" || !activity.currentAttemptId) return undefined;
  const attempts = activity.attempts.filter((attempt) => attempt.attemptId === activity.currentAttemptId && attempt.stageAttemptId === parentAttemptId && attempt.state === "completed");
  const completions = attempts.flatMap((attempt) => attempt.facts.filter((fact) => fact.event.type === "construction.activity-attempt-completed"));
  return completions.length === 1 ? completions[0] : undefined;
};

const evidenceForCompletion = (
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  completion: ConstructionHistoryFact,
  activity: "code-generation" | "code-validation",
  requiredChecks: readonly string[],
  start: ConstructionHistoryFact,
  taskId: string,
  parentAttemptId: string,
  expectedCheckpoints: readonly RepositoryCheckpoint[],
  expectedInputs: readonly MaterialInput[],
): { readonly kind: "valid"; readonly facts: readonly ConstructionHistoryFact[] } | { readonly kind: "invalid"; readonly reason: string } => {
  if (completion.event.type !== "construction.activity-attempt-completed" || !Array.isArray(completion.event.data.evidence_ids)) return { kind: "invalid", reason: `${activity}-completion-evidence-unavailable` };
  const facts: ConstructionHistoryFact[] = [];
  const checks = new Set<string>();
  for (const id of completion.event.data.evidence_ids) {
    const matches = loaded.unit.evidence.map((item) => item.fact).filter((fact) => fact.event.type === "construction.evidence-recorded" && fact.event.data.evidence_id === id);
    const fact = matches.length === 1 ? matches[0] : undefined;
      if (!fact || fact.event.type !== "construction.evidence-recorded" || fact.event.data.stage !== "implementation" ||
        fact.event.data.stage_attempt_id !== parentAttemptId || fact.event.data.task_id !== taskId ||
        fact.event.data.activity !== activity || fact.event.data.activity_attempt_id !== completion.event.data.activity_attempt_id ||
        !isRecord(fact.event.data.result) || fact.event.data.result.status !== "passed" ||
        !sameInputs(fact.event.data.inputs, expectedInputs) || !isRepositoryCheckpointSet(fact.event.data.checkpoints) ||
        checkpointKey(fact.event.data.checkpoints) !== checkpointKey(expectedCheckpoints) ||
        !fact.event.caused_by.some((cause) => String(cause) === String(start.event.id)) || !completion.event.caused_by.some((cause) => String(cause) === String(fact.event.id))) {
      return { kind: "invalid", reason: `${activity}-evidence-invalid` };
    }
    if (typeof fact.event.data.check !== "string" || checks.has(fact.event.data.check)) return { kind: "invalid", reason: `${activity}-check-duplicate` };
    checks.add(fact.event.data.check);
    facts.push(fact);
  }
  if (!sameStrings([...checks], requiredChecks)) return { kind: "invalid", reason: `${activity}-checks-incomplete` };
  return { kind: "valid", facts };
};

const commonDirectory = async (runtime: IntegrationExecutionRuntime, root: string): Promise<string | undefined> => {
  const result = await runtime.workspace.git.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result.status !== 0 || result.stdout.trim().length === 0) return undefined;
  try { return await runtime.workspace.fileSystem.realpath(Path.resolve(root, result.stdout.trim())); }
  catch { return undefined; }
};

const integrationOwnerScope = (scope: IntegrationScope): { readonly resourceScope: string; readonly attemptContext: string } => ({
  resourceScope: `construction/integration/${scope.unitId}`,
  attemptContext: JSON.stringify([scope.taskId, scope.implementationAttemptId, scope.activityAttemptId]),
});

const lockRequest = (
  runtime: IntegrationExecutionRuntime,
  commonDir: string,
  missionId: string,
  scope: IntegrationScope,
): MissionCoordinationRequest => {
  const ownerScope = integrationOwnerScope(scope);
  return {
    commonDirectory: commonDir,
    location: { kind: "mission", missionId },
    resourceKey: createHash("sha256").update(JSON.stringify([missionId, scope.unitId, "construction-integration"])).digest("hex"),
    owner: {
      machine_id: runtime.workspace.identity.machine_id,
      process_id: runtime.workspace.identity.process_id,
      process_incarnation_id: runtime.workspace.identity.process_incarnation_id,
      mission_id: missionId,
      resource_scope: ownerScope.resourceScope,
      attempt_context: ownerScope.attemptContext,
    },
  };
};

const targetDirectory = (request: MissionCoordinationRequest): string => Path.join(request.commonDirectory, "kepler", "missions", request.location.kind === "mission" ? request.location.missionId : "", "coordination");
const snapshotPath = (request: MissionCoordinationRequest): string => Path.join(targetDirectory(request), request.resourceKey, "integration.json");
const releaseRequestForSnapshot = (request: MissionCoordinationRequest, snapshot: IntegrationLockSnapshot): MissionCoordinationRequest => ({
  ...request,
  owner: {
    machine_id: snapshot.owner.machine_id,
    process_id: snapshot.owner.process_id,
    process_incarnation_id: snapshot.owner.process_incarnation_id,
    mission_id: snapshot.owner.mission_id,
    resource_scope: snapshot.owner.resource_scope,
    attempt_context: snapshot.owner.attempt_context,
  },
});

const historyEvents = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>): readonly ConstructionEventRecord[] =>
  loaded.history.events.flatMap((record) => record.event ? [record.event as ConstructionEventRecord] : []);

const factForEvent = (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, eventId: string): ConstructionHistoryFact | undefined =>
  loaded.unit.tasks.flatMap((task) => task.facts).concat(
    loaded.unit.stages.flatMap((stage) => stage.facts),
    loaded.unit.evidence.map((item) => item.fact),
  ).find((fact) => fact.event.id === eventId);

const hasCausalPath = (events: ReadonlyMap<string, { readonly caused_by: readonly string[] }>, before: string, after: string): boolean => {
  const pending = [...(events.get(after)?.caused_by ?? [])];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    if (current === before) return true;
    seen.add(current);
    pending.push(...(events.get(current)?.caused_by ?? []));
  }
  return false;
};

const targetInputs = async (
  runtime: IntegrationExecutionRuntime,
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  repository: { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string },
): Promise<IntegrationInputCheckpoint | undefined> => {
  const target = repository.integration_target;
  if (!target.startsWith("refs/heads/") || target.includes("..") || target.endsWith("/")) return undefined;
  const resolved = await runtime.workspace.git.run(repository.repository_root, ["show-ref", "--verify", "--quiet", target]);
  if (resolved.status === 0) {
    const commit = await runtime.workspace.git.run(repository.repository_root, ["rev-parse", "--verify", `${target}^{commit}`]);
    const value = commit.stdout.trim();
    return commit.status === 0 && commitId(value) ? { repository_id: repository.repository_id, commit: value } : undefined;
  }
  if (resolved.status !== 1) return undefined;
  const prepared = historyEvents(loaded).filter((event) => event.type === "construction.mission-workspaces-prepared" &&
    event.data.mission_id === loaded.missionId).flatMap((event) => Array.isArray(event.data.repositories) ? event.data.repositories : []);
  const match = prepared.filter((item) => isRecord(item) && item.repository_id === repository.repository_id &&
    item.integration_target === target && item.branch === target.slice("refs/heads/".length) &&
    isRecord(item.starting_checkpoint) && item.starting_checkpoint.kind === "no-commit");
  return match.length === 1 ? { repository_id: repository.repository_id, no_commit: true } : undefined;
};

const readInputs = async (
  runtime: IntegrationExecutionRuntime,
  loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>,
  repositories: readonly { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string }[],
): Promise<readonly IntegrationInputCheckpoint[] | undefined> => {
  const values: IntegrationInputCheckpoint[] = [];
  for (const repository of repositories) {
    const value = await targetInputs(runtime, loaded, repository);
    if (!value) return undefined;
    values.push(value);
  }
  return values.sort((left, right) => left.repository_id.localeCompare(right.repository_id));
};

const isIntegrationInputSet = (value: unknown): value is readonly IntegrationInputCheckpoint[] => Array.isArray(value) && value.every((item) =>
  isRecord(item) && nonEmpty(item.repository_id) && ((commitId(item.commit) && item.no_commit === undefined) || (item.no_commit === true && item.commit === undefined))) &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;
const isRepositoryCheckpointSet = (value: unknown): value is readonly RepositoryCheckpoint[] => Array.isArray(value) && value.every((item) =>
  isRecord(item) && nonEmpty(item.repository_id) && commitId(item.commit)) &&
  new Set(value.map((item) => isRecord(item) ? item.repository_id : undefined)).size === value.length;

const checkTerms = (check: IntegrationEvidenceCheck): readonly RegExp[] => {
  if (check === "code-integration-typecheck") return [/type[ -]?check/i, /typechecking/i];
  if (check === "code-integration-build") return [/\bbuild\b/i];
  if (check === "code-integration-full-test-suite") return [/\b(full|complete|entire|application)\b/i, /\btests?\b/i];
  return [];
};
const mentionsCheck = (value: string, check: IntegrationEvidenceCheck): boolean => {
  const terms = checkTerms(check);
  return terms.length > 0 && terms.every((term) => term.test(value));
};
const isPlannedIntegrationCommand = (
  execution: TaskExecutionContext,
  check: IntegrationEvidenceCheck,
  command: NonNullable<IntegrationEvidenceRequest["check_command"]>,
  planSource: string,
): boolean => {
  const words = [command.executable, ...command.argv];
  if (!words.every(safeCommandWord)) return false;
  const exact = `\`${command.repository_id}: ${words.join(" ")}\``;
  const methodMatches = execution.task.verification.some((verification) => {
    const source = `${verification.scope}\n${verification.method}`;
    return source.includes(exact) && source.includes(command.repository_id) && mentionsCheck(source, check);
  });
  const planMatches = planSource.split(/\r?\n/).some((line) => line.includes(exact) && line.includes(command.repository_id) && mentionsCheck(line, check));
  return methodMatches && planMatches;
};

const validateScope = (selectors: ScopeSelectors): IntegrationScope | undefined => {
  if (!selectors.unit || !selectors.task || !selectors.implementationAttempt || !selectors.attempt || selectors.activity !== "code-integration" ||
      selectors.stage !== undefined || selectors.mission !== undefined) return undefined;
  return { unitId: selectors.unit, taskId: selectors.task, implementationAttemptId: selectors.implementationAttempt, activityAttemptId: selectors.attempt };
};

const isIntegrationEvidenceCheck = (value: unknown): value is IntegrationEvidenceCheck =>
  ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite", "code-integration-self-review"].includes(String(value));
const safeCommandWord = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_./:@+=,-]+$/.test(value);
const isIntegrationEvidenceCommand = (value: unknown): value is NonNullable<IntegrationEvidenceRequest["check_command"]> =>
  isRecord(value) && onlyKeys(value, ["repository_id", "executable", "argv"]) && nonEmpty(value.repository_id) &&
  safeCommandWord(value.executable) && Array.isArray(value.argv) && value.argv.every(safeCommandWord);
const isIntegrationEvidenceResult = (value: unknown): value is IntegrationEvidenceRequest["result"] =>
  isRecord(value) && onlyKeys(value, ["status", "summary"]) && ["passed", "failed", "inconclusive"].includes(String(value.status)) && nonEmpty(value.summary);
const isNonEmptyStringList = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
const isStringList = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(nonEmpty);

const parseEvidenceRequest = (value: unknown): { readonly kind: "valid"; readonly request: IntegrationEvidenceRequest } | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  const issues: { pointer: string; message: string }[] = [];
  if (!isRecord(value)) return { kind: "invalid", issues: [{ pointer: "", message: "Expected one Integration evidence request object." }] };
  const keys = ["prepared_event_id", "check", "executor", "result", "check_command", "output_refs", "conditions"];
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push({ pointer: `/${key}`, message: "Unknown Integration evidence field." });
  const preparedEventId = value.prepared_event_id;
  const check = value.check;
  const executor = value.executor;
  const result = value.result;
  const outputRefs = value.output_refs;
  const conditions = value.conditions;
  const checkCommand = value.check_command;
  if (!uuidV4(preparedEventId)) issues.push({ pointer: "/prepared_event_id", message: "Expected the current Integration preparation event UUIDv4." });
  if (!isIntegrationEvidenceCheck(check)) issues.push({ pointer: "/check", message: "Select one required Integration check or self-review." });
  if (!nonEmpty(executor)) issues.push({ pointer: "/executor", message: "Expected the actual Integration executor." });
  if (!isIntegrationEvidenceResult(result)) issues.push({ pointer: "/result", message: "Expected an explicit passed, failed, or inconclusive result and summary." });
  if (!isNonEmptyStringList(outputRefs)) issues.push({ pointer: "/output_refs", message: "Retain at least one non-empty result or review reference." });
  if (!isStringList(conditions)) issues.push({ pointer: "/conditions", message: "Expected the applicable execution conditions." });
  const commandCheck = check !== "code-integration-self-review";
  if (commandCheck && !isIntegrationEvidenceCommand(checkCommand)) {
    issues.push({ pointer: "/check_command", message: "Each repository check must record its explicit repository, executable, and argument array." });
  } else if (!commandCheck && checkCommand !== undefined) issues.push({ pointer: "/check_command", message: "Self-review does not accept a command binding." });
  if (issues.length > 0 || !uuidV4(preparedEventId) || !isIntegrationEvidenceCheck(check) || !nonEmpty(executor) ||
      !isIntegrationEvidenceResult(result) || !isNonEmptyStringList(outputRefs) || !isStringList(conditions) ||
      (commandCheck && !isIntegrationEvidenceCommand(checkCommand))) return { kind: "invalid", issues };
  return { kind: "valid", request: {
    prepared_event_id: preparedEventId,
    check,
    executor,
    result,
    ...(isIntegrationEvidenceCommand(checkCommand) ? { check_command: checkCommand } : {}),
    output_refs: outputRefs,
    conditions,
  } };
};

export class IntegrationExecution {
  constructor(
    private readonly contexts: AuditContextResolver,
    private readonly queries: ConstructionQueries,
    private readonly runtime: IntegrationExecutionRuntime,
  ) {}

  async lock(selectors: ScopeSelectors, project?: string): Promise<IntegrationExecutionResult> {
    const scope = validateScope(selectors);
    if (!scope) return fail("invalid_integration_scope", "Integration lock requires exact --unit, --task, --activity code-integration, --implementation-attempt, and --attempt selectors.", { selectors });
    const first = await this.readScope(scope, project);
    if (first.kind === "failed") return first;
    const commonDir = first.state.commonDirectory;
    const preparedWorkspaceEvents = historyEvents(first.state.loaded).filter((event) => event.type === "construction.mission-workspaces-prepared" &&
      event.data.mission_id === first.state.loaded.missionId);
    const preparedRepositories = preparedWorkspaceEvents.length === 1 && Array.isArray(preparedWorkspaceEvents[0]!.data.repositories)
      ? preparedWorkspaceEvents[0]!.data.repositories : [];
    if (preparedWorkspaceEvents.length !== 1 || preparedRepositories.length === 0) return fail("integration_workspace_binding_invalid", "Integration requires one unique prepared-workspace binding before it can acquire a unit lock.", {
      prepared_workspace_events: preparedWorkspaceEvents.length,
    });
    if (preparedRepositories.length !== 1) return fail("multi_repository_integration_unsupported", "Construction Integration currently supports exactly one prepared repository; no Integration lock was acquired.", {
      repository_ids: preparedRepositories.flatMap((item) => isRecord(item) && typeof item.repository_id === "string" ? [item.repository_id] : []),
    }, "Select the single-repository MVP workspace or wait for multi-repository Integration support.");
    const request = lockRequest(this.runtime, commonDir, first.state.loaded.missionId, scope);
    const acquired = await this.runtime.workspace.coordination.acquire(request);
    if (acquired.kind === "failed") return fail(acquired.code, acquired.message, acquired.details, acquired.recovery);
    const token = acquired.lease.owner.token;
    const expectedLockPath = Path.join(targetDirectory(request), request.resourceKey);
    if (acquired.lease.lockPath !== expectedLockPath || !uuidV4(token)) {
      return fail("integration_lock_identity_invalid", "The acquired unit Integration lock does not match its repository-qualified location and token.", {
        lock_path: acquired.lease.lockPath, expected_lock_path: expectedLockPath,
      }, "Preserve the claim and reconcile the lock identity before retrying.");
    }
    const current = await this.readScope(scope, project);
    if (current.kind === "failed") return this.releaseUnpreparedLock(request, token, current);
    if (current.state.loaded.root !== first.state.loaded.root || current.state.loaded.missionId !== first.state.loaded.missionId) {
      return this.releaseUnpreparedLock(request, token, fail("integration_scope_changed", "Unit membership changed while acquiring the Integration lock."));
    }
    const captured = await captureStageCheckpoints(this.runtime, current.state.loaded, commonDir);
    if (captured.kind === "failed") return this.releaseUnpreparedLock(request, token, fail(captured.code, captured.message, captured.details));
    if (captured.repositoryRoots.length !== 1) return this.releaseUnpreparedLock(request, token, fail("integration_repository_set_changed", "The prepared repository set changed while the unit Integration lock was acquired."));
    const capturedInputs = await readInputs(this.runtime, current.state.loaded, [integrationRepository(captured.repositoryRoots[0]!)]);
    if (!capturedInputs || capturedInputs.length !== 1) return this.releaseUnpreparedLock(request, token, fail("integration_target_unknown", "Kepler could not capture the current repository-qualified Integration target checkpoint.", {
      repository_ids: captured.repositoryRoots.map((item) => item.repository_id),
    }));
    const snapshot: IntegrationLockSnapshot = {
      format: "kepler.construction.integration-lock.v1",
      token,
      mission_id: current.state.loaded.missionId,
      unit_id: scope.unitId,
      task_id: scope.taskId,
      implementation_attempt_id: scope.implementationAttemptId,
      activity_attempt_id: scope.activityAttemptId,
      common_directory: commonDir,
      resource_key: request.resourceKey,
      location: { kind: "mission", mission_id: current.state.loaded.missionId },
      owner: acquired.lease.owner,
      repository: {
        repository_id: captured.repositoryRoots[0]!.repository_id,
        repository_root: captured.repositoryRoots[0]!.repositoryRoot,
        integration_target: captured.repositoryRoots[0]!.integrationTarget,
      },
      captured_inputs: capturedInputs,
    };
    try {
      await this.runtime.workspace.fileSystem.writeFileExclusive(snapshotPath(request), `${JSON.stringify(snapshot)}\n`);
    } catch (error) {
      return fail("integration_lock_snapshot_write_uncertain", "The lock was acquired, but its captured target snapshot could not be durably recorded; the claim remains held.", {
        resource_key: request.resourceKey,
        lock_path: acquired.lease.lockPath,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve the unit lock and reconcile its owner and snapshot before any Integration work or release.");
    }
    const verified = await this.readLockSnapshot(request, token, scope);
    if (verified.kind === "failed") return fail("integration_lock_snapshot_unverified", "The acquired lock snapshot could not be verified; the claim remains held.", verified.details, verified.recovery);
    return { kind: "success", data: {
      lock_token: token,
      resource_key: request.resourceKey,
      location: request.location,
      mission_id: current.state.loaded.missionId,
      unit_id: scope.unitId,
      task_id: scope.taskId,
      implementation_attempt_id: scope.implementationAttemptId,
      activity: "code-integration",
      activity_attempt_id: scope.activityAttemptId,
      repository_id: snapshot.repository.repository_id,
      repository_root: snapshot.repository.repository_root,
      integration_target: snapshot.repository.integration_target,
      captured_inputs: capturedInputs,
    } };
  }

  async prepare(selectors: ScopeSelectors, token: string | undefined, rawRequest: unknown, project?: string): Promise<IntegrationExecutionResult> {
    const scope = validateScope(selectors);
    if (!scope || !uuidV4(token)) return fail("invalid_integration_scope", "Integration preparation requires exact Integration scope selectors and the lock token returned by lock acquisition.");
    const state = await this.readScope(scope, project);
    if (state.kind === "failed") return state;
    const boundRequest = lockRequest(this.runtime, state.state.commonDirectory, state.state.loaded.missionId, scope);
    const verified = await this.readLockSnapshot(boundRequest, token, scope);
    if (verified.kind === "failed") return verified;
    const parsed = validatePrepareRequest(rawRequest);
    if (parsed.kind === "invalid") return fail("invalid_integration_prepare_request", "The typed Integration preparation request failed validation.", { issues: parsed.issues });
    if (integrationInputKey(parsed.request.captured_inputs) !== integrationInputKey(verified.snapshot.captured_inputs)) {
      return fail("integration_captured_inputs_mismatch", "Preparation must use the exact repository checkpoint set captured by this lock acquisition.", {
        expected: verified.snapshot.captured_inputs, supplied: parsed.request.captured_inputs,
      });
    }
    const captured = await captureStageCheckpoints(this.runtime, state.state.loaded, state.state.commonDirectory);
    if (captured.kind === "failed") return fail(captured.code, captured.message, captured.details);
    if (captured.repositoryRoots.length !== 1 || !sameRepository(captured.repositoryRoots[0]!, verified.snapshot.repository)) {
      return fail("integration_repository_binding_changed", "The selected repository no longer matches the lock-captured workspace binding.");
    }
    const currentInputs = await readInputs(this.runtime, state.state.loaded, [integrationRepository(captured.repositoryRoots[0]!)]);
    if (!currentInputs) return fail("integration_target_unknown", "Kepler could not read the current Integration target while the unit lock is held.");
    const candidate = parsed.request.candidate_checkpoints[0]!;
    if (candidate.repository_id !== verified.snapshot.repository.repository_id || parsed.request.candidate_checkpoints.length !== 1) {
      return fail("multi_repository_integration_unsupported", "Integration preparation accepts one repository-qualified candidate in the current MVP.", {
        repository_ids: parsed.request.candidate_checkpoints.map((item) => item.repository_id),
      });
    }
    const targetIsCaptured = integrationInputKey(currentInputs) === integrationInputKey(verified.snapshot.captured_inputs);
    if (!targetIsCaptured) return fail("integration_target_changed", "Preparation and checks require the live Integration target to remain at the lock-captured input checkpoint.", {
      captured_inputs: verified.snapshot.captured_inputs, current_inputs: currentInputs, candidate_checkpoints: parsed.request.candidate_checkpoints,
    }, "Keep the lock held. Restore the captured target or resolve its change before recording a candidate.");
    const candidateExists = await this.runtime.workspace.git.run(verified.snapshot.repository.repository_root, ["cat-file", "-e", `${candidate.commit}^{commit}`]);
    if (candidateExists.status !== 0) return fail("integration_candidate_unavailable", "The immutable candidate checkpoint is not an available Git commit in its bound repository.", {
      repository_id: candidate.repository_id, candidate_commit: candidate.commit, stderr: candidateExists.stderr.trim(),
    });
    const generationCheckpoints = state.state.generationCompletion.event.data.checkpoints;
    if (!isRepositoryCheckpointSet(generationCheckpoints) || generationCheckpoints.length !== 1 || generationCheckpoints[0]!.repository_id !== candidate.repository_id) {
      return fail("integration_generation_checkpoint_invalid", "The current Generation output does not identify exactly one checkpoint in the lock-bound repository.", {
        generation_checkpoints: generationCheckpoints, repository_id: candidate.repository_id,
      });
    }
    const requiredAncestors = [
      ...(verified.snapshot.captured_inputs[0] && "commit" in verified.snapshot.captured_inputs[0] ? [verified.snapshot.captured_inputs[0].commit] : []),
      generationCheckpoints[0]!.commit,
    ];
    for (const ancestor of new Set(requiredAncestors)) {
      const ancestry = await this.runtime.workspace.git.run(verified.snapshot.repository.repository_root, ["merge-base", "--is-ancestor", ancestor, candidate.commit]);
      if (ancestry.status !== 0) return fail(ancestry.status === 1 ? "integration_candidate_missing_required_input" : "integration_candidate_ancestry_unknown",
        ancestry.status === 1 ? "The candidate does not contain a lock-captured live input or current Generation output checkpoint." : "Git could not establish candidate ancestry safely.", {
          repository_id: candidate.repository_id, ancestor, candidate_commit: candidate.commit, stderr: ancestry.stderr.trim(),
        });
    }
    const preparedFacts = this.preparedFacts(state.state.loaded, scope);
    const acceptedPreparedIds = new Set(historyEvents(state.state.loaded).filter((event) => event.type === "construction.integration-accepted" &&
      event.data.task_id === scope.taskId && event.data.stage_attempt_id === scope.implementationAttemptId && event.data.activity_attempt_id === scope.activityAttemptId)
      .flatMap((event) => typeof event.data.prepared_event_id === "string" ? [event.data.prepared_event_id] : []));
    if (preparedFacts.some((fact) => acceptedPreparedIds.has(fact.event.id))) return fail("integration_already_accepted", "The current Integration attempt already has an accepted prepared candidate.");
    const eventMap = new Map(historyEvents(state.state.loaded).map((event) => [event.id, event]));
    const latestPrepared = preparedFacts.filter((fact) => !preparedFacts.some((other) => fact.event.id !== other.event.id && hasCausalPath(eventMap, fact.event.id, other.event.id)));
    if (latestPrepared.length > 1) return fail("integration_preparation_ambiguous", "Concurrent preparations do not establish one current immutable candidate.", { prepared_event_ids: latestPrepared.map((fact) => fact.event.id) });
    const previousPrepared = latestPrepared[0];
    const sourceIds = state.state.validationEvidence.map((fact) => fact.event.data.evidence_id).filter((id): id is string => typeof id === "string");
    const outputRefs = [...new Set(state.state.validationEvidence.flatMap((fact) => Array.isArray(fact.event.data.output_refs)
      ? fact.event.data.output_refs.filter((value): value is string => typeof value === "string") : []))].sort((left, right) => left.localeCompare(right));
    if (sourceIds.length !== state.state.validationEvidence.length || outputRefs.length === 0 ||
        !state.state.execution.task.outputs.every((output) => outputRefs.includes(output))) {
      return fail("integration_task_output_unverified", "Current Code Validation evidence does not identify every declared task output.", {
        declared_outputs: state.state.execution.task.outputs, validated_output_refs: outputRefs,
      });
    }
    const existing = this.existingIdentities(state.state.loaded);
    const eventId = uuidIdentity(this.runtime, existing);
    const journalId = uuidIdentity(this.runtime, new Set([...existing, ...(eventId ? [eventId] : [])]));
    if (!eventId || !journalId) return fail("integration_identity_conflict", "Kepler could not allocate unique Integration preparation event identities.");
    const event = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.integration-prepared",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([
        state.state.integrationStart.event.id,
        state.state.admission.event.id,
        state.state.validationCompletion.event.id,
        ...state.state.validationEvidence.map((fact) => fact.event.id),
        ...(previousPrepared ? [previousPrepared.event.id] : []),
      ])],
      data: {
        mission_id: state.state.loaded.missionId,
        unit_id: scope.unitId,
        stage: "implementation",
        stage_attempt_id: scope.implementationAttemptId,
        task_id: scope.taskId,
        activity: "code-integration",
        activity_attempt_id: scope.activityAttemptId,
        captured_inputs: verified.snapshot.captured_inputs,
        candidate_checkpoints: parsed.request.candidate_checkpoints,
        task_output_refs: outputRefs,
        source_evidence_ids: sourceIds,
        inputs: state.state.integrationStart.event.data.inputs,
      },
    };
    const validated = validateConstructionEvent(event);
    if (validated.status !== "valid") return fail("integration_prepare_event_invalid", "The typed Integration preparation event failed Construction validation.", {
      issues: validated.status === "invalid" ? validated.issues : [validated.reason],
    });
    const appended = await this.append(state.state.loaded, validated.event);
    if (appended.kind === "failed") return appended;
    return { kind: "success", data: {
      prepared_event_id: validated.event.id,
      journal_id: validated.event.journal_id,
      mission_id: state.state.loaded.missionId,
      unit_id: scope.unitId,
      task_id: scope.taskId,
      implementation_attempt_id: scope.implementationAttemptId,
      activity_attempt_id: scope.activityAttemptId,
      captured_inputs: verified.snapshot.captured_inputs,
      candidate_checkpoints: parsed.request.candidate_checkpoints,
      task_output_refs: outputRefs,
      source_evidence_ids: sourceIds,
      inputs: state.state.integrationStart.event.data.inputs,
      fixed_admission_baseline: state.state.admission.event.data.admission_baseline,
    } };
  }

  async recordEvidence(selectors: ScopeSelectors, token: string | undefined, rawRequest: unknown, project?: string): Promise<IntegrationExecutionResult> {
    const scope = validateScope(selectors);
    if (!scope || !uuidV4(token)) return fail("invalid_integration_scope", "Integration evidence requires exact Integration scope selectors and the lock token returned by lock acquisition.");
    const parsed = parseEvidenceRequest(rawRequest);
    if (parsed.kind === "invalid") return fail("invalid_integration_evidence_request", "The typed Integration evidence request failed validation.", { issues: parsed.issues });
    const state = await this.readScope(scope, project);
    if (state.kind === "failed") return state;
    const boundRequest = lockRequest(this.runtime, state.state.commonDirectory, state.state.loaded.missionId, scope);
    const verified = await this.readLockSnapshot(boundRequest, token, scope);
    if (verified.kind === "failed") return verified;
    const prepared = this.preparedFact(state.state.loaded, scope, parsed.request.prepared_event_id);
    if (prepared.kind === "failed") return prepared;
    if (!isMaterialInputSet(state.state.integrationStart.event.data.inputs) || !isMaterialInputSet(prepared.fact.event.data.inputs) ||
        !sameInputs(state.state.integrationStart.event.data.inputs, prepared.fact.event.data.inputs)) {
      return fail("integration_input_binding_invalid", "The current Integration Activity inputs differ from the prepared candidate's actual inputs.");
    }
    const candidate = prepared.fact.event.data.candidate_checkpoints;
    if (!Array.isArray(candidate) || candidate.length !== 1 || !isRecord(candidate[0]) || candidate[0].repository_id !== verified.snapshot.repository.repository_id) {
      return fail("integration_candidate_invalid", "The prepared candidate is not a single repository-qualified checkpoint.");
    }
    const commandCheck = parsed.request.check !== "code-integration-self-review";
    if (commandCheck && parsed.request.check_command?.repository_id !== verified.snapshot.repository.repository_id) {
      return fail("integration_check_repository_mismatch", "The recorded check command must name the lock-bound repository.", {
        expected_repository_id: verified.snapshot.repository.repository_id,
        supplied_repository_id: parsed.request.check_command?.repository_id,
      });
    }
    if (commandCheck && !isPlannedIntegrationCommand(state.state.execution, parsed.request.check, parsed.request.check_command!, state.state.execution.planSource)) {
      return fail("integration_check_command_unbound", "The caller-supplied command is not an exact repository-qualified command in both plan.md and the task verification method; it is not verified for acceptance.", {
        repository_id: parsed.request.check_command?.repository_id,
        check: parsed.request.check,
        executable: parsed.request.check_command?.executable,
        argv: parsed.request.check_command?.argv,
      }, "Supply the exact planned command only when both existing planning artifacts explicitly bind its repository and check. Do not autodetect or parse procedural prose.");
    }
    if (parsed.request.check === "code-integration-self-review") {
      const requiredBindingCondition = "Integration bindings match the accepted candidate and actual inputs.";
      const missingCriteria = state.state.execution.task.acceptance_criteria.filter((criterion) => !parsed.request.conditions.includes(criterion));
      if (!parsed.request.conditions.includes(requiredBindingCondition) || missingCriteria.length > 0) return fail("integration_self_review_conditions_incomplete", "Integration self-review must explicitly assess candidate/input bindings and repeat every task acceptance criterion as a caller assessment.", {
        required_binding_condition: requiredBindingCondition,
        missing_acceptance_criteria: missingCriteria,
      }, "Record the binding assessment and every acceptance criterion in conditions; these are caller statements, not automated semantic proof.");
    }
    const events = historyEvents(state.state.loaded);
    const previous = this.latestEvidenceForPrepared(events, scope, prepared.fact.event.id, parsed.request.check);
    const existing = this.existingIdentities(state.state.loaded);
    const eventId = uuidIdentity(this.runtime, existing);
    const evidenceId = uuidIdentity(this.runtime, new Set([...existing, ...(eventId ? [eventId] : [])]));
    const journalId = uuidIdentity(this.runtime, new Set([...existing, ...(eventId ? [eventId] : []), ...(evidenceId ? [evidenceId] : [])]));
    if (!eventId || !evidenceId || !journalId) return fail("integration_identity_conflict", "Kepler could not allocate unique Integration evidence identities.");
    const data: Record<string, unknown> = {
      mission_id: state.state.loaded.missionId,
      unit_id: scope.unitId,
      stage: "implementation",
      stage_attempt_id: scope.implementationAttemptId,
      task_id: scope.taskId,
      activity: "code-integration",
      activity_attempt_id: scope.activityAttemptId,
      evidence_id: evidenceId as EvidenceId,
      artifact_bindings: [],
      checkpoints: candidate,
      inputs: prepared.fact.event.data.inputs,
      check: parsed.request.check,
      executor: parsed.request.executor,
      result: parsed.request.result,
      output_refs: parsed.request.output_refs,
      conditions: parsed.request.conditions,
      ...(parsed.request.check_command ? { check_command: parsed.request.check_command } : {}),
    };
    const event = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.evidence-recorded",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([
        state.state.integrationStart.event.id,
        prepared.fact.event.id,
        ...(previous ? [previous.id] : []),
      ])],
      data,
    };
    const validated = validateConstructionEvent(event);
    if (validated.status !== "valid") return fail("integration_evidence_event_invalid", "The typed Integration evidence event failed Construction validation.", {
      issues: validated.status === "invalid" ? validated.issues : [validated.reason],
    });
    const appended = await this.append(state.state.loaded, validated.event);
    if (appended.kind === "failed") return appended;
    return { kind: "success", data: {
      id: validated.event.id,
      journal_id: validated.event.journal_id,
      evidence_id: evidenceId,
      prepared_event_id: prepared.fact.event.id,
      check: parsed.request.check,
      candidate_checkpoints: candidate,
      result: parsed.request.result,
    } };
  }

  async accept(selectors: ScopeSelectors, token: string | undefined, preparedEventId: string | undefined, project?: string): Promise<IntegrationExecutionResult> {
    const scope = validateScope(selectors);
    if (!scope || !uuidV4(token) || !uuidV4(preparedEventId)) return fail("invalid_integration_scope", "Integration acceptance requires exact Integration scope selectors, a prepared event UUID, and the lock token returned by lock acquisition.");
    const state = await this.readScope(scope, project);
    if (state.kind === "failed") return state;
    const boundRequest = lockRequest(this.runtime, state.state.commonDirectory, state.state.loaded.missionId, scope);
    const verified = await this.readLockSnapshot(boundRequest, token, scope);
    if (verified.kind === "failed") return verified;
    const preparedResult = this.preparedFact(state.state.loaded, scope, preparedEventId);
    if (preparedResult.kind === "failed") return preparedResult;
    const prepared = preparedResult.fact;
    const candidate = prepared.event.data.candidate_checkpoints;
    if (!isRepositoryCheckpointSet(candidate) || candidate.length !== 1 || candidate[0]!.repository_id !== verified.snapshot.repository.repository_id) {
      return fail("integration_candidate_invalid", "The selected prepared event does not identify one valid repository candidate.");
    }
    if (!isIntegrationInputSet(prepared.event.data.captured_inputs) || integrationInputKey(prepared.event.data.captured_inputs) !== integrationInputKey(verified.snapshot.captured_inputs)) {
      return fail("integration_captured_inputs_mismatch", "The prepared event does not preserve the lock-captured Integration input set.");
    }
    const accepted = historyEvents(state.state.loaded).filter((event) => event.type === "construction.integration-accepted" &&
      event.data.prepared_event_id === prepared.event.id && event.data.task_id === scope.taskId &&
      event.data.stage_attempt_id === scope.implementationAttemptId && event.data.activity_attempt_id === scope.activityAttemptId);
    if (accepted.length > 1) return fail("integration_acceptance_ambiguous", "More than one acceptance event refers to the selected preparation; preserve the lock for reconciliation.", { event_ids: accepted.map((event) => event.id) });
    const evidence = this.currentEvidenceForPrepared(state.state.loaded, historyEvents(state.state.loaded), scope, prepared.event.id);
    if (evidence.kind === "failed") return evidence;
    if (!this.integrationEvidenceCommandsBound(state.state.execution, evidence.value)) return fail("integration_check_command_unbound", "One or more required check records are not bound to exact repository-qualified commands in both planning artifacts.", {
      prepared_event_id: prepared.event.id,
    });
    const selfReview = evidence.value.get("code-integration-self-review")!;
    const requiredBindingCondition = "Integration bindings match the accepted candidate and actual inputs.";
    const selfReviewConditions = selfReview.event.data.conditions;
    if (!isStringList(selfReviewConditions) || selfReviewConditions.length === 0) return fail("integration_self_review_conditions_incomplete", "The accepted self-review must include non-empty caller assessment statements.");
    const missingCriteria = state.state.execution.task.acceptance_criteria.filter((criterion) => !selfReviewConditions.includes(criterion));
    if (!selfReviewConditions.includes(requiredBindingCondition) || missingCriteria.length > 0) return fail("integration_self_review_conditions_incomplete", "The accepted self-review must assess candidate/input bindings and every task acceptance criterion.", {
      required_binding_condition: requiredBindingCondition,
      missing_acceptance_criteria: missingCriteria,
    });
    const candidateCheckpoint = candidate[0]!;
    const currentTarget = await readInputs(this.runtime, state.state.loaded, [verified.snapshot.repository]);
    if (!currentTarget || currentTarget.length !== 1 || currentTarget[0]!.repository_id !== candidateCheckpoint.repository_id ||
        !("commit" in currentTarget[0]!) || currentTarget[0]!.commit !== candidateCheckpoint.commit) {
      return fail("integration_target_not_candidate", "The repository Integration target must resolve to the checked candidate before acceptance and lock release.", {
        expected_candidate: candidate,
        current_target: currentTarget,
      }, "Keep the lock held, reconcile the repository target, rerun required checks if its material changed, and retry acceptance.");
    }
    if (accepted.length === 1) {
      const event = accepted[0]!;
      if (stable(event.data.candidate_checkpoints) !== stable(candidate) || !sameAcceptedEvidence(event, evidence.value) ||
          !this.integrationEvidenceCommandsBound(state.state.execution, evidence.value)) {
        return fail("integration_acceptance_conflict", "The existing acceptance event differs from the current prepared candidate or its current successful evidence.", { acceptance_event_id: event.id });
      }
      return this.releaseAccepted(boundRequest, token, verified.snapshot, event, candidate);
    }
    const existing = this.existingIdentities(state.state.loaded);
    const eventId = uuidIdentity(this.runtime, existing);
    const journalId = uuidIdentity(this.runtime, new Set([...existing, ...(eventId ? [eventId] : [])]));
    if (!eventId || !journalId) return fail("integration_identity_conflict", "Kepler could not allocate unique Integration acceptance event identities.");
    const checkEvidence = [
      evidence.value.get("code-integration-typecheck")!,
      evidence.value.get("code-integration-build")!,
      evidence.value.get("code-integration-full-test-suite")!,
    ];
    const repositoryResults = [{ repository_id: candidateCheckpoint.repository_id, evidence_ids: checkEvidence.map((fact) => fact.event.data.evidence_id) }];
    const event = {
      id: eventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.integration-accepted",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: this.runtime.now(),
      producer: this.runtime.producer,
      caused_by: [...new Set([prepared.event.id, ...checkEvidence.map((fact) => fact.event.id), selfReview.event.id])],
      data: {
        mission_id: state.state.loaded.missionId,
        unit_id: scope.unitId,
        stage: "implementation",
        stage_attempt_id: scope.implementationAttemptId,
        task_id: scope.taskId,
        activity: "code-integration",
        activity_attempt_id: scope.activityAttemptId,
        prepared_event_id: prepared.event.id,
        candidate_checkpoints: candidate,
        repository_results: repositoryResults,
        authority_event_ids: [selfReview.event.id],
      },
    };
    const validated = validateConstructionEvent(event);
    if (validated.status !== "valid") return fail("integration_accept_event_invalid", "The typed Integration acceptance event failed Construction validation.", {
      issues: validated.status === "invalid" ? validated.issues : [validated.reason],
    });
    const appended = await this.append(state.state.loaded, validated.event);
    if (appended.kind === "failed") return appended;
    const afterAppend = await readInputs(this.runtime, state.state.loaded, [verified.snapshot.repository]);
    if (!afterAppend || afterAppend.length !== 1 || !("commit" in afterAppend[0]!) || afterAppend[0]!.commit !== candidateCheckpoint.commit) {
      return fail("integration_target_changed_after_acceptance", "The repository target changed during acceptance; the accepted event is retained and the lock remains held for reconciliation.", {
        acceptance_event_id: validated.event.id,
        expected_candidate: candidate,
        current_target: afterAppend,
      }, "Preserve the acceptance event and lock. Reconcile repository effects before retrying or manually recovering the lock.");
    }
    return this.releaseAccepted(boundRequest, token, verified.snapshot, validated.event, candidate);
  }

  async release(selectors: ScopeSelectors, token: string | undefined, project?: string): Promise<IntegrationExecutionResult> {
    const scope = validateScope(selectors);
    if (!scope || !uuidV4(token)) return fail("invalid_integration_scope", "Integration release requires exact Integration scope selectors and the lock token returned by lock acquisition.");
    const state = await this.readScope(scope, project);
    if (state.kind === "failed") return state;
    const request = lockRequest(this.runtime, state.state.commonDirectory, state.state.loaded.missionId, scope);
    const verified = await this.readLockSnapshot(request, token, scope);
    if (verified.kind === "failed") return verified;
    const accepted = historyEvents(state.state.loaded).filter((event) => event.type === "construction.integration-accepted" &&
      event.data.unit_id === scope.unitId && event.data.task_id === scope.taskId &&
      event.data.stage_attempt_id === scope.implementationAttemptId && event.data.activity_attempt_id === scope.activityAttemptId);
    if (accepted.length > 0) return fail("integration_already_accepted", "An accepted Integration attempt cannot be aborted or released through the failure path.", {
      accepted_event_ids: accepted.map((event) => event.id),
    }, "Reconcile acceptance through the exact prepared event and replacement-safe acceptance release path.");
    const captured = await captureStageCheckpoints(this.runtime, state.state.loaded, state.state.commonDirectory);
    if (captured.kind === "failed") return fail("integration_release_target_uncertain", "Kepler cannot verify the prepared repository binding; the Integration lock remains held.", captured.details);
    if (captured.repositoryRoots.length !== 1 || !sameRepository(captured.repositoryRoots[0]!, verified.snapshot.repository)) {
      return fail("integration_release_target_uncertain", "The prepared repository binding changed; the Integration lock remains held.", {
        repository_ids: captured.repositoryRoots.map((item) => item.repository_id),
      });
    }
    const currentInputs = await readInputs(this.runtime, state.state.loaded, [integrationRepository(captured.repositoryRoots[0]!)]);
    if (!currentInputs || integrationInputKey(currentInputs) !== integrationInputKey(verified.snapshot.captured_inputs)) {
      return fail("integration_release_target_changed", "Failed or incomplete Integration work can release its lock only while the live target still equals the captured input; the lock remains held.", {
        captured_inputs: verified.snapshot.captured_inputs,
        current_inputs: currentInputs,
      }, "Keep the lock held and reconcile the target. Do not accept or release a changed or uncertain candidate.");
    }
    const released = await this.releaseLongLock(releaseRequestForSnapshot(request, verified.snapshot), token);
    if (released.kind === "failed") return fail("integration_lock_release_failed", "The Integration target still matches its captured input, but replacement-safe lock release could not be confirmed.", {
      captured_inputs: verified.snapshot.captured_inputs,
      ...released.details,
    }, released.recovery);
    return { kind: "success", data: {
      lock_released: true,
      aborted: true,
      mission_id: state.state.loaded.missionId,
      unit_id: scope.unitId,
      task_id: scope.taskId,
      implementation_attempt_id: scope.implementationAttemptId,
      activity_attempt_id: scope.activityAttemptId,
      captured_inputs: verified.snapshot.captured_inputs,
    } };
  }

  private integrationEvidenceCommandsBound(execution: TaskExecutionContext, evidence: ReadonlyMap<string, ConstructionHistoryFact>): boolean {
    const checks: readonly IntegrationEvidenceCheck[] = ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite"];
    return checks.every((check) => {
      const fact = evidence.get(check);
      if (!fact || fact.event.type !== "construction.evidence-recorded" || !isRepositoryCheckpointSet(fact.event.data.checkpoints)) return false;
      const command = fact.event.data.check_command;
      return isIntegrationEvidenceCommand(command) && command.repository_id === fact.event.data.checkpoints[0]?.repository_id &&
        isPlannedIntegrationCommand(execution, check, command, execution.planSource);
    });
  }

  private async readScope(scope: IntegrationScope, project?: string): Promise<{ readonly kind: "valid"; readonly state: IntegrationScopeState } | IntegrationExecutionFailure> {
    const first = await this.contexts.readUnit(scope.unitId, project);
    if (first.kind === "failed") return propagate(first);
    const commonDir = await commonDirectory(this.runtime, first.root);
    if (!commonDir) return fail("integration_coordination_unavailable", "Git could not resolve the record home's canonical common directory.", { repository_root: first.root });
    if (first.unit.workflow !== "standard" || first.unit.blocked) return fail("integration_history_blocked", "Integration requires an unblocked Standard Construction history.", {
      history_issues: first.unit.historyIssues, projection_issues: first.unit.projectionIssues,
    });
    const execution = await this.queries.taskExecutionContext(scope.unitId, scope.taskId, project);
    if (execution.kind === "failed") return fail(execution.code, execution.message, execution.details, execution.recovery);
    const parentStart = currentParentStart(first.unit, scope.implementationAttemptId);
    const admission = currentAdmission(first.unit, scope.taskId, scope.implementationAttemptId);
    const task = first.unit.tasks.find((item) => item.taskId === scope.taskId);
    const integration = task?.activities.find((item) => item.activity === "code-integration");
    const attempt = integration?.attempts.find((item) => item.attemptId === scope.activityAttemptId && item.stageAttemptId === scope.implementationAttemptId && item.state === "running");
    const integrationStart = attempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-started" || fact.event.type === "construction.activity-resumed").at(-1);
    if (!parentStart || !admission || !task || task.stageAttemptId !== scope.implementationAttemptId || task.state === "complete" ||
        !integration || integration.state !== "running" || integration.currentAttemptId !== scope.activityAttemptId || !attempt ||
        !integrationStart || !["construction.activity-attempt-started", "construction.activity-resumed"].includes(integrationStart.event.type)) {
      return fail("integration_attempt_not_current", "Integration requires the exact current admitted task and running Integration Activity attempt under its current Implementation parent.", {
        unit_id: scope.unitId, task_id: scope.taskId, implementation_attempt_id: scope.implementationAttemptId,
        activity_attempt_id: scope.activityAttemptId, task_state: task?.state, activity_state: integration?.state,
      });
    }
    if (admission.event.type !== "construction.task-admitted" || stable(admission.event.data.graph_ref) !== stable(execution.graphRef) ||
        stable(admission.event.data.task_definition_ref) !== stable(execution.taskDefinitionRef)) {
      return fail("integration_task_definition_stale", "The current task definition differs from the admitted task output contract.", {
        admitted_graph_ref: admission.event.data.graph_ref,
        current_graph_ref: execution.graphRef,
        admitted_task_definition_ref: admission.event.data.task_definition_ref,
        current_task_definition_ref: execution.taskDefinitionRef,
      });
    }
    const generationCompletion = latestCompleted(first.unit, scope.taskId, "code-generation", scope.implementationAttemptId);
    const validationCompletion = latestCompleted(first.unit, scope.taskId, "code-validation", scope.implementationAttemptId);
    const generationActivity = task.activities.find((item) => item.activity === "code-generation");
    const validationActivity = task.activities.find((item) => item.activity === "code-validation");
    const validationAttempt = validationActivity?.attempts.find((candidate) => candidate.attemptId === validationCompletion?.event.data.activity_attempt_id && candidate.stageAttemptId === scope.implementationAttemptId);
    const validationStart = validationAttempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-started" || fact.event.type === "construction.activity-resumed").at(-1);
    const generationAttempt = generationActivity?.attempts.find((candidate) => candidate.attemptId === generationCompletion?.event.data.activity_attempt_id && candidate.stageAttemptId === scope.implementationAttemptId);
    const generationStart = generationAttempt?.facts.filter((fact) => fact.event.type === "construction.activity-attempt-started" || fact.event.type === "construction.activity-resumed").at(-1);
    const generationCheckpoints = generationCompletion?.event.data.checkpoints;
    const validationCheckpoints = validationCompletion?.event.data.checkpoints;
    const integrationCheckpoints = integrationStart?.event.data.checkpoints;
    if (!generationCompletion || generationCompletion.event.type !== "construction.activity-attempt-completed" ||
        !validationCompletion || validationCompletion.event.type !== "construction.activity-attempt-completed" ||
        !generationActivity || generationActivity.state !== "completed" || !validationActivity || validationActivity.state !== "completed" ||
        !validationStart || !generationStart || !isRepositoryCheckpointSet(generationCheckpoints) ||
        !isRepositoryCheckpointSet(validationCheckpoints) || !isRepositoryCheckpointSet(integrationCheckpoints) ||
        !isMaterialInputSet(validationStart.event.data.inputs) || !isMaterialInputSet(generationStart.event.data.inputs) ||
        !validationStart.event.caused_by.some((cause) => String(cause) === String(generationCompletion.event.id)) ||
        !integrationStart.event.caused_by.some((cause) => String(cause) === String(validationCompletion.event.id)) ||
        checkpointKey(generationCheckpoints) !== checkpointKey(validationCheckpoints) ||
        checkpointKey(integrationCheckpoints) !== checkpointKey(validationCheckpoints)) {
      return fail("integration_validation_provenance_invalid", "Integration requires current Generation and Validation completions over the same task output, with direct route provenance.", {
        generation_completion_event_id: generationCompletion?.event.id,
        validation_completion_event_id: validationCompletion?.event.id,
        integration_start_event_id: integrationStart.event.id,
      });
    }
    const validationFacts = evidenceForCompletion(first, validationCompletion, "code-validation", [
      "code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite", "code-validation-independent-review", "code-validation-self-review",
    ], validationStart, scope.taskId, scope.implementationAttemptId, validationCheckpoints, validationStart.event.data.inputs);
    if (validationFacts.kind === "invalid") return fail("integration_validation_evidence_invalid", "Current Code Validation provenance is incomplete or not bound to its output checkpoint.", { reason: validationFacts.reason });
    const generationFacts = evidenceForCompletion(first, generationCompletion, "code-generation", [
      "code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review",
    ], generationStart, scope.taskId, scope.implementationAttemptId, generationCheckpoints, generationStart.event.data.inputs);
    if (generationFacts.kind === "invalid") return fail("integration_generation_evidence_invalid", "Current Code Generation provenance is incomplete or not bound to its output checkpoint.", { reason: generationFacts.reason });
    const generatedOutputs = new Set(generationFacts.facts.flatMap((fact) => Array.isArray(fact.event.data.output_refs)
      ? fact.event.data.output_refs.filter((value): value is string => typeof value === "string") : []));
    if (execution.task.outputs.some((output) => !generatedOutputs.has(output))) return fail("integration_task_output_invalid", "Current Generation evidence does not establish every declared task output.", {
      declared_outputs: execution.task.outputs, generated_output_refs: [...generatedOutputs],
    });
    const integrationInputs = integrationStart.event.data.inputs;
    if (!Array.isArray(integrationInputs) || !integrationInputs.every((item) => isRecord(item) && nonEmpty(item.reference) && nonEmpty(item.purpose))) {
      return fail("integration_actual_inputs_invalid", "The current Integration attempt does not identify its actual task inputs.");
    }
    return { kind: "valid", state: {
      loaded: first,
      execution,
      scope,
      commonDirectory: commonDir,
      parentStart,
      admission,
      generationCompletion,
      validationStart,
      validationCompletion,
      integrationStart,
      validationEvidence: validationFacts.facts,
      taskOutputRefs: [...new Set(validationFacts.facts.flatMap((fact) => Array.isArray(fact.event.data.output_refs)
        ? fact.event.data.output_refs.filter((value): value is string => typeof value === "string") : []))].sort((left, right) => left.localeCompare(right)),
    } };
  }

  private preparedFacts(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, scope: IntegrationScope): ConstructionHistoryFact[] {
    return loaded.unit.tasks.find((task) => task.taskId === scope.taskId)?.activities.find((item) => item.activity === "code-integration")?.prepared
      .filter((fact) => fact.event.type === "construction.integration-prepared" && fact.event.data.stage_attempt_id === scope.implementationAttemptId && fact.event.data.activity_attempt_id === scope.activityAttemptId) ?? [];
  }

  private preparedFact(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, scope: IntegrationScope, preparedId: string): { readonly kind: "valid"; readonly fact: ConstructionHistoryFact } | IntegrationExecutionFailure {
    const matches = this.preparedFacts(loaded, scope).filter((fact) => fact.event.id === preparedId);
    if (matches.length !== 1) return fail("integration_preparation_not_current", "The explicit prepared event does not belong to the selected current Integration attempt.", {
      prepared_event_id: preparedId, matching_preparations: matches.length,
    });
    const eventMap = new Map(historyEvents(loaded).map((event) => [event.id, event]));
    const prepared = matches[0]!;
    const all = this.preparedFacts(loaded, scope);
    const latest = all.filter((fact) => !all.some((other) => fact.event.id !== other.event.id && hasCausalPath(eventMap, fact.event.id, other.event.id)));
    if (latest.length !== 1 || latest[0]?.event.id !== preparedId) return fail("integration_preparation_not_current", "Only the causally latest prepared candidate can receive evidence or acceptance.", {
      current_prepared_event_ids: latest.map((fact) => fact.event.id), supplied_prepared_event_id: preparedId,
    });
    if (prepared.event.type !== "construction.integration-prepared" || prepared.event.data.activity !== "code-integration" ||
        prepared.event.data.task_id !== scope.taskId || prepared.event.data.stage_attempt_id !== scope.implementationAttemptId ||
        prepared.event.data.activity_attempt_id !== scope.activityAttemptId || !prepared.event.caused_by.some((cause) => String(cause) === this.currentIntegrationStartId(loaded, scope))) {
      return fail("integration_preparation_binding_invalid", "The selected preparation does not belong to the current attempt start and task output.");
    }
    return { kind: "valid", fact: prepared };
  }

  private currentIntegrationStartId(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, scope: IntegrationScope): string | undefined {
    const activity = loaded.unit.tasks.find((task) => task.taskId === scope.taskId)?.activities.find((item) => item.activity === "code-integration");
    return activity?.attempts.find((attempt) => attempt.attemptId === scope.activityAttemptId && attempt.stageAttemptId === scope.implementationAttemptId)?.facts
      .filter((fact) => fact.event.type === "construction.activity-attempt-started" || fact.event.type === "construction.activity-resumed").at(-1)?.event.id;
  }

  private latestEvidenceForPrepared(events: readonly ConstructionEventRecord[], scope: IntegrationScope, preparedId: string, check: string): ConstructionEventRecord | undefined {
    const matches = events.filter((event) => event.type === "construction.evidence-recorded" && event.data.stage === "implementation" &&
      event.data.unit_id === scope.unitId && event.data.task_id === scope.taskId && event.data.stage_attempt_id === scope.implementationAttemptId &&
      event.data.activity === "code-integration" && event.data.activity_attempt_id === scope.activityAttemptId && event.data.check === check &&
      event.caused_by.some((cause) => String(cause) === preparedId));
    return latestCausalFact(events, matches);
  }

  private currentEvidenceForPrepared(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, events: readonly ConstructionEventRecord[], scope: IntegrationScope, preparedId: string): { readonly kind: "valid"; readonly value: Map<string, ConstructionHistoryFact> } | IntegrationExecutionFailure {
    const checks: readonly IntegrationEvidenceCheck[] = ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite", "code-integration-self-review"];
    const facts = new Map<string, ConstructionHistoryFact>();
    for (const check of checks) {
      const latest = this.latestEvidenceForPrepared(events, scope, preparedId, check);
      if (!latest) return fail("integration_evidence_incomplete", "Integration acceptance requires explicit typecheck, build, full-suite, and self-review records for the current prepared candidate.", {
        missing_check: check, prepared_event_id: preparedId,
      });
      const fact = factForEvent(loaded, latest.id);
      if (!fact || fact.event.type !== "construction.evidence-recorded") {
        return fail("integration_evidence_unavailable", "A current Integration evidence record is unavailable from the selected scope history.", { event_id: latest.id, check });
      }
      if (facts.has(check)) return fail("integration_evidence_ambiguous", "Integration evidence does not identify one unique result for each required check.", { check });
      const result = latest.data.result;
      if (!isRecord(result) || result.status !== "passed" ||
          (check === "code-integration-self-review" && (!Array.isArray(latest.data.conditions) || latest.data.conditions.length === 0))) return fail("integration_check_failed", "Integration cannot accept a candidate with failed, incomplete, or condition-free self-review evidence.", {
        check, event_id: latest.id, result,
      });
      facts.set(check, fact);
    }
    return { kind: "valid", value: facts };
  }

  private existingIdentities(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>): Set<string> {
    const existing = new Set<string>();
    for (const record of loaded.history.events) {
      if (!record.event) continue;
      existing.add(String(record.event.id));
      existing.add(String(record.event.journal_id));
      if (isRecord(record.event.data) && typeof record.event.data.evidence_id === "string") existing.add(record.event.data.evidence_id);
    }
    return existing;
  }

  private async append(loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>, event: ConstructionEventRecord): Promise<IntegrationExecutionResult> {
    const journalPath = Path.join(loaded.root, ".kepler", "missions", loaded.missionId, "history", CONSTRUCTION_PHASE, `${event.journal_id}.jsonl`);
    if (await this.runtime.workspace.fileSystem.pathKind(journalPath) !== "missing") return fail("integration_journal_identity_conflict", "The selected Integration journal identity already has a filesystem entry.", { journal_id: event.journal_id });
    const journal = this.runtime.journals.create(loaded.root, loaded.missionId, event.journal_id);
    if (Path.resolve(journal.path) !== Path.resolve(journalPath)) return fail("integration_journal_path_invalid", "Integration history must use the selected mission's Construction journal path.", { journal_path: journal.path, expected_path: journalPath });
    try {
      await journal.append(event);
    } catch (error) {
      return fail("integration_event_append_uncertain", "Kepler could not confirm the durable Integration event append; preserve the unit lock and reconcile history.", {
        event_id: event.id, journal_id: event.journal_id, message: error instanceof Error ? error.message : String(error),
      }, "Inspect the mission journal for this event and actual Git effects before retrying; keep the Integration claim held.");
    }
    return { kind: "success", data: { event_id: event.id, journal_id: event.journal_id } };
  }

  private async readLockSnapshot(request: MissionCoordinationRequest, token: string, scope: IntegrationScope): Promise<{ readonly kind: "valid"; readonly snapshot: IntegrationLockSnapshot } | IntegrationExecutionFailure> {
    if (request.location.kind !== "mission") return fail("integration_lock_location_invalid", "Integration locks must be mission-located.");
    const directory = targetDirectory(request);
    const lockPath = Path.join(directory, request.resourceKey);
    try {
      if (await this.runtime.workspace.fileSystem.realpath(request.commonDirectory) !== request.commonDirectory ||
          await this.runtime.workspace.fileSystem.pathKind(directory) !== "directory" || await this.runtime.workspace.fileSystem.realpath(directory) !== directory ||
          await this.runtime.workspace.fileSystem.pathKind(lockPath) !== "directory" || await this.runtime.workspace.fileSystem.realpath(lockPath) !== lockPath ||
          await this.runtime.workspace.fileSystem.pathKind(Path.join(lockPath, "owner.json")) !== "file" ||
          await this.runtime.workspace.fileSystem.pathKind(Path.join(lockPath, "integration.json")) !== "file") {
        return fail("integration_lock_unavailable", "The exact mission Integration lock or its captured target snapshot is unavailable.", { resource_key: request.resourceKey });
      }
      const ownerValue: unknown = JSON.parse(await this.runtime.workspace.fileSystem.readFile(Path.join(lockPath, "owner.json")));
      const snapshotValue: unknown = JSON.parse(await this.runtime.workspace.fileSystem.readFile(Path.join(lockPath, "integration.json")));
      if (!isRecord(ownerValue) || !isRecord(snapshotValue)) return fail("integration_lock_record_invalid", "The Integration owner or captured target record is malformed.", { resource_key: request.resourceKey });
      const snapshot = parseLockSnapshot(snapshotValue);
      const expectedAttempt = integrationOwnerScope(scope).attemptContext;
      const ownerMatches = ownerValue.token === token && ownerValue.machine_id === request.owner.machine_id &&
        ownerValue.mission_id === request.location.missionId && ownerValue.resource_scope === integrationOwnerScope(scope).resourceScope &&
        ownerValue.attempt_context === expectedAttempt && typeof ownerValue.process_id === "number" && Number.isInteger(ownerValue.process_id) && ownerValue.process_id > 0 &&
        uuidV4(ownerValue.process_incarnation_id);
      if (!ownerMatches || !snapshot || snapshot.token !== token || snapshot.common_directory !== request.commonDirectory ||
          snapshot.resource_key !== request.resourceKey || snapshot.mission_id !== request.location.missionId ||
          snapshot.location.kind !== "mission" || snapshot.location.mission_id !== request.location.missionId ||
          snapshot.unit_id !== scope.unitId || snapshot.task_id !== scope.taskId ||
          snapshot.implementation_attempt_id !== scope.implementationAttemptId || snapshot.activity_attempt_id !== scope.activityAttemptId ||
          snapshot.owner.token !== ownerValue.token || snapshot.owner.machine_id !== ownerValue.machine_id ||
          snapshot.owner.process_id !== ownerValue.process_id || snapshot.owner.process_incarnation_id !== ownerValue.process_incarnation_id ||
          snapshot.owner.mission_id !== ownerValue.mission_id || snapshot.owner.resource_scope !== ownerValue.resource_scope ||
          snapshot.owner.attempt_context !== ownerValue.attempt_context || !isIntegrationInputSet(snapshot.captured_inputs) ||
          snapshot.captured_inputs.length !== 1 || snapshot.repository.repository_id !== snapshot.captured_inputs[0]?.repository_id) {
        return fail("integration_lock_owner_mismatch", "The token, current task and attempt scope, mission location, resource key, and lock owner do not identify this Integration claim; it remains untouched.", {
          resource_key: request.resourceKey,
          mission_id: request.location.missionId,
          unit_id: scope.unitId,
          task_id: scope.taskId,
          implementation_attempt_id: scope.implementationAttemptId,
          activity_attempt_id: scope.activityAttemptId,
        }, "Preserve the existing lock owner and use the exact scope that acquired this claim.");
      }
      const names = await this.runtime.workspace.fileSystem.readDirectory?.(directory) ?? [];
      if (await this.runtime.workspace.fileSystem.pathKind(`${lockPath}.releasing`) !== "missing" ||
          names.some((name) => name.startsWith(`${request.resourceKey}.releasing-`) || name.startsWith(`${request.resourceKey}.owner-moving-`))) {
        return fail("integration_lock_release_unresolved", "The selected Integration lock has a pending or unresolved replacement-safe release.", { resource_key: request.resourceKey }, "Preserve the claim and reconcile its release artifacts before retrying.");
      }
      return { kind: "valid", snapshot };
    } catch (error) {
      return fail("integration_lock_inspection_failed", "Kepler could not safely inspect the current Integration lock owner and snapshot.", {
        resource_key: request.resourceKey, message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async releaseUnpreparedLock(request: MissionCoordinationRequest, token: string, cause: IntegrationExecutionResult): Promise<IntegrationExecutionResult> {
    const released = await this.releaseLongLock(request, token);
    if (released.kind === "failed") return fail("integration_lock_release_failed", "A read-only Integration lock acquisition failure could not safely release its claim.", {
      cause: cause.kind,
      cause_code: cause.kind === "failed" ? cause.code : undefined,
      ...released.details,
    }, released.recovery);
    return cause;
  }

  private async releaseLongLock(request: MissionCoordinationRequest, token: string) {
    const release = this.runtime.workspace.coordination.release;
    if (!release) return { kind: "failed" as const, code: "coordination_release_unavailable", message: "The coordination port does not expose replacement-safe token release.", details: {}, recovery: "Preserve the Integration lock and restore the required MissionCoordination.release(request, token) port." };
    return release(request, token);
  }

  private async releaseAccepted(request: MissionCoordinationRequest, token: string, snapshot: IntegrationLockSnapshot, accepted: ConstructionEventRecord, candidate: unknown): Promise<IntegrationExecutionResult> {
    const released = await this.releaseLongLock(releaseRequestForSnapshot(request, snapshot), token);
    if (released.kind === "failed") return fail("integration_lock_release_failed", "The candidate was accepted, but replacement-safe release could not be confirmed; preserve the lock state for reconciliation.", {
      acceptance_event_id: accepted.id,
      candidate_checkpoints: candidate,
      ...released.details,
    }, released.recovery);
    return { kind: "success", data: {
      integration_event_id: accepted.id,
      journal_id: accepted.journal_id,
      prepared_event_id: accepted.data.prepared_event_id,
      candidate_checkpoints: accepted.data.candidate_checkpoints,
      repository_results: accepted.data.repository_results,
      lock_released: true,
    } };
  }

}

const integrationRepository = (repository: { readonly repository_id: string; readonly repositoryRoot: string; readonly integrationTarget: string }): { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string } => ({
  repository_id: repository.repository_id,
  repository_root: repository.repositoryRoot,
  integration_target: repository.integrationTarget,
});

const sameRepository = (
  left: { readonly repository_id: string; readonly repositoryRoot: string; readonly integrationTarget: string } | { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string },
  right: { readonly repository_id: string; readonly repositoryRoot: string; readonly integrationTarget: string } | { readonly repository_id: string; readonly repository_root: string; readonly integration_target: string },
): boolean => {
  const leftId = "repositoryRoot" in left ? left.repositoryRoot : left.repository_root;
  const rightId = "repositoryRoot" in right ? right.repositoryRoot : right.repository_root;
  const leftTarget = "integrationTarget" in left ? left.integrationTarget : left.integration_target;
  const rightTarget = "integrationTarget" in right ? right.integrationTarget : right.integration_target;
  return left.repository_id === right.repository_id && leftId === rightId && leftTarget === rightTarget;
};

const validatePrepareRequest = (value: unknown): { readonly kind: "valid"; readonly request: { readonly captured_inputs: readonly IntegrationInputCheckpoint[]; readonly candidate_checkpoints: readonly RepositoryCheckpoint[] } } | { readonly kind: "invalid"; readonly issues: readonly { readonly pointer: string; readonly message: string }[] } => {
  const issues: { pointer: string; message: string }[] = [];
  if (!isRecord(value) || !onlyKeys(value, ["captured_inputs", "candidate_checkpoints"])) return { kind: "invalid", issues: [{ pointer: "", message: "Expected captured_inputs and candidate_checkpoints only." }] };
  if (!isIntegrationInputSet(value.captured_inputs) || value.captured_inputs.length !== 1) issues.push({ pointer: "/captured_inputs", message: "The MVP requires one lock-captured repository checkpoint or explicit no_commit input." });
  if (!isRepositoryCheckpointSet(value.candidate_checkpoints) || value.candidate_checkpoints.length !== 1) {
    issues.push({ pointer: "/candidate_checkpoints", message: "The MVP requires one repository-qualified immutable candidate commit." });
  }
  if (issues.length > 0 || !isIntegrationInputSet(value.captured_inputs) || !isRepositoryCheckpointSet(value.candidate_checkpoints)) return { kind: "invalid", issues };
  return { kind: "valid", request: { captured_inputs: value.captured_inputs, candidate_checkpoints: value.candidate_checkpoints } };
};

const isIntegrationLockSnapshot = (input: unknown): input is IntegrationLockSnapshot => {
  if (!isRecord(input)) return false;
  const value = input;
  const keys = ["format", "token", "mission_id", "unit_id", "task_id", "implementation_attempt_id", "activity_attempt_id", "common_directory", "resource_key", "location", "owner", "repository", "captured_inputs"];
  if (!onlyKeys(value, keys) || value.format !== "kepler.construction.integration-lock.v1" || !uuidV4(value.token) ||
      !uuidV4(value.mission_id) || !nonEmpty(value.unit_id) || !uuidV4(value.task_id) || !uuidV4(value.implementation_attempt_id) ||
      !uuidV4(value.activity_attempt_id) || !nonEmpty(value.common_directory) || !Path.isAbsolute(value.common_directory) ||
      typeof value.resource_key !== "string" || !/^[a-f0-9]{64}$/.test(value.resource_key) ||
      !isRecord(value.location) || !onlyKeys(value.location, ["kind", "mission_id"]) || value.location.kind !== "mission" ||
      value.location.mission_id !== value.mission_id || !isRecord(value.owner) || !isRecord(value.repository) ||
      !onlyKeys(value.repository, ["repository_id", "repository_root", "integration_target"]) || !nonEmpty(value.repository.repository_id) ||
      !nonEmpty(value.repository.repository_root) || !Path.isAbsolute(value.repository.repository_root) || !nonEmpty(value.repository.integration_target) ||
      !isIntegrationInputSet(value.captured_inputs)) return false;
  const owner = value.owner;
  return onlyKeys(owner, ["token", "machine_id", "process_id", "process_incarnation_id", "mission_id", "resource_scope", "attempt_context"]) &&
    uuidV4(owner.token) && nonEmpty(owner.machine_id) && typeof owner.process_id === "number" && Number.isInteger(owner.process_id) && owner.process_id >= 1 &&
    uuidV4(owner.process_incarnation_id) && uuidV4(owner.mission_id) && nonEmpty(owner.resource_scope) &&
    (owner.attempt_context === undefined || nonEmpty(owner.attempt_context));
};

const parseLockSnapshot = (value: Record<string, unknown>): IntegrationLockSnapshot | undefined =>
  isIntegrationLockSnapshot(value) ? value : undefined;

const latestCausalFact = (events: readonly ConstructionEventRecord[], candidates: readonly ConstructionEventRecord[]): ConstructionEventRecord | undefined => {
  const map = new Map(events.map((event) => [event.id, event]));
  const leaves = candidates.filter((candidate) => !candidates.some((other) => candidate.id !== other.id && hasCausalPath(map, candidate.id, other.id)));
  return leaves.length === 1 ? leaves[0] : undefined;
};

const sameAcceptedEvidence = (acceptance: ConstructionEventRecord, evidence: ReadonlyMap<string, ConstructionHistoryFact>): boolean => {
  if (acceptance.type !== "construction.integration-accepted" || !Array.isArray(acceptance.data.repository_results) || acceptance.data.repository_results.length !== 1) return false;
  const repository = acceptance.data.repository_results[0];
  if (!isRecord(repository) || !Array.isArray(repository.evidence_ids)) return false;
  const expected = ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite"].map((check) => evidence.get(check)?.event.data.evidence_id);
  const actual = repository.evidence_ids;
  const selfReview = evidence.get("code-integration-self-review")?.event.id;
  return sameStrings(actual.filter((id): id is string => typeof id === "string"), expected.filter((id): id is string => typeof id === "string") as string[]) &&
    Array.isArray(acceptance.data.authority_event_ids) && acceptance.data.authority_event_ids.length === 1 && acceptance.data.authority_event_ids[0] === selfReview;
};

export const createNodeIntegrationExecutionRuntime = (producer: { readonly name: string; readonly version: string }): IntegrationExecutionRuntime =>
  createNodeStageStartRuntime(producer) as IntegrationExecutionRuntime;
