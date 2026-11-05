import * as Path from "node:path";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "@vialactea-works/kepler-core";
import type { EventJournal } from "../history/journal.js";
import type { CollectedHistoryEvent, HistoryCollection } from "../history/collection.js";
import type { ProjectSelectionResult } from "../cli/project-selection.js";
import { missionIntegrationTargetKey, missionWorkspaceKey } from "./mission-workspace.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type MissionBranchSelection,
  type MissionCreatedData,
  type MissionId,
  type MissionStartingCheckpoint,
  type MissionWorkspaceContext,
  type MissionWorkspacePreparedData,
  type MissionWorkspaceSelection,
} from "./events.js";

export type MissionWorkspaceRequest =
  | { readonly kind: "existing"; readonly path: string }
  | { readonly kind: "new"; readonly path: string; readonly source: string }
  | {
      readonly kind: "previous";
      readonly workspace_id: string;
      readonly mission_id: string;
      readonly record_home_repository_id: string;
      readonly record_home_path: string;
    };

export interface MissionRepositoryRequest {
  readonly repositoryId: string;
  readonly workspace: MissionWorkspaceRequest;
  readonly branch: MissionBranchSelection;
  readonly integrationTarget: string;
}

export interface MissionStartupRequest {
  readonly title: string;
  readonly request: string;
  readonly workflow: "standard";
  readonly recordHomeRepositoryId: string;
  readonly contexts: readonly { readonly reference: string; readonly purpose: string }[];
  readonly repositories: readonly MissionRepositoryRequest[];
}

export interface MissionStartupRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

export type MissionStartupRequestValidation =
  | { readonly kind: "valid"; readonly request: MissionStartupRequest }
  | { readonly kind: "invalid"; readonly issues: readonly MissionStartupRequestIssue[] };

export interface MissionStartupFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export interface InspectedMissionRepository {
  readonly repositoryId: string;
  readonly context: MissionWorkspaceContext;
  readonly branchSelection: MissionBranchSelection;
  readonly resolvedBranch: string;
  readonly integrationTarget: string;
  readonly integrationTargetKey: string;
  readonly startingCheckpoint: MissionStartingCheckpoint;
  readonly repositoryPath: string;
  readonly recordHomePath: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly localWorkspaceKey: string;
  readonly workspacePath: string;
  readonly workspaceKind: "existing" | "new" | "previous";
  readonly sourcePath: string;
  readonly baseCommit?: string;
  readonly recordHomeRepositoryId: string;
  readonly recordHomeCommonDirectory: string;
  readonly initialDirtyPaths: readonly string[];
  readonly initialBranch: string | null;
  readonly initialCheckpoint: MissionStartingCheckpoint;
}

export interface PreparedMissionRepository {
  readonly repositoryId: string;
  readonly context: MissionWorkspaceContext;
  readonly branch: string;
  readonly integrationTarget: string;
  readonly startingCheckpoint: MissionStartingCheckpoint;
  readonly localWorkspaceKey: string;
  readonly workspacePath: string;
}

export type MissionWorkspaceInspectionResult =
  | { readonly kind: "inspected"; readonly repositories: readonly InspectedMissionRepository[] }
  | MissionStartupFailure;

export type MissionWorkspacePreparationResult =
  | { readonly kind: "prepared"; readonly repositories: readonly PreparedMissionRepository[] }
  | MissionStartupFailure;

export interface MissionWorkspacePreparationContext {
  readonly missionJournalPath: string;
}

export interface MissionRecordHomeIdentity {
  readonly root: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
}

export interface MissionWorkspacePreparation {
  readonly identifyRecordHome: (recordHome: string) => Promise<MissionRecordHomeIdentity | MissionStartupFailure>;
  readonly inspect: (
    recordHome: string,
    request: MissionStartupRequest,
  ) => Promise<MissionWorkspaceInspectionResult>;
  readonly prepare: (
    recordHome: string,
    missionId: MissionId,
    repositories: readonly InspectedMissionRepository[],
    context: MissionWorkspacePreparationContext,
  ) => Promise<MissionWorkspacePreparationResult>;
  readonly reconcile: (
    recordHome: string,
    missionId: MissionId,
    repositories: readonly InspectedMissionRepository[],
    context: MissionWorkspacePreparationContext,
  ) => Promise<MissionWorkspacePreparationResult>;
}

export interface MissionStartupIntent {
  readonly format: "kepler.mission-startup-intent.v1";
  readonly missionId: MissionId;
  readonly recordHomeRoot: string;
  readonly recordHomeRepositoryId: string;
  readonly recordHomeGitDirectory: string;
  readonly recordHomeCommonDirectory: string;
  readonly request: MissionStartupRequest;
  readonly repositories: readonly InspectedMissionRepository[];
  readonly createdEvent: EventEnvelope<unknown>;
  readonly preparedEvent: EventEnvelope<unknown>;
}

export interface MissionStartupRecovery {
  readonly saveIntent: (
    recordHome: string,
    commonDirectory: string,
    missionId: MissionId,
    intent: MissionStartupIntent,
  ) => Promise<void>;
  readonly loadIntent: (
    recordHome: string,
    commonDirectory: string,
    missionId: MissionId,
  ) => Promise<unknown | undefined>;
  readonly readHistory: (recordHome: string, missionId: MissionId) => Promise<HistoryCollection>;
  readonly acquireMission: (
    commonDirectory: string,
    missionId: MissionId,
  ) => Promise<{
    readonly kind: "acquired";
    readonly lease: { readonly release: () => Promise<{ readonly kind: "released" } | MissionStartupFailure> };
  } | MissionStartupFailure>;
}

export interface MissionJournalFactory {
  readonly create: (
    recordHome: string,
    missionId: MissionId,
    journalId: JournalId,
  ) => EventJournal;
}

export interface MissionStartupIdentitySource {
  readonly next: () => string;
}

export interface MissionStartupRuntime {
  readonly projects: {
    readonly resolve: (project?: string) => Promise<ProjectSelectionResult>;
  };
  readonly workspaces: MissionWorkspacePreparation;
  readonly recovery: MissionStartupRecovery;
  readonly journals: MissionJournalFactory;
  readonly identities: MissionStartupIdentitySource;
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
}

export type MissionStartupPreparedRepository = Omit<PreparedMissionRepository, "localWorkspaceKey" | "workspacePath"> &
  Partial<Pick<PreparedMissionRepository, "localWorkspaceKey" | "workspacePath">>;

export interface MissionStartupPrepared {
  readonly kind: "prepared";
  readonly missionId: MissionId;
  readonly recordHome: string;
  readonly historical: boolean;
  readonly repositories: readonly MissionStartupPreparedRepository[];
}

export type MissionStartupResult = MissionStartupPrepared | MissionStartupFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => Object.keys(value).every((key) => keys.includes(key));

const invalidRequest = (
  pointer: string,
  message: string,
): MissionStartupRequestIssue => ({ pointer, message });

const parseWorkspace = (
  value: unknown,
  pointer: string,
  issues: MissionStartupRequestIssue[],
): MissionWorkspaceRequest | undefined => {
  if (!isRecord(value) || !nonEmptyString(value.kind)) {
    issues.push(invalidRequest(pointer, "Expected an explicit workspace selection"));
    return undefined;
  }
  if (value.kind === "existing") {
    if (!hasOnlyKeys(value, ["kind", "path"]) || !nonEmptyString(value.path)) {
      issues.push(invalidRequest(pointer, "Existing workspace requires only a non-empty path"));
      return undefined;
    }
    return { kind: "existing", path: value.path };
  }
  if (value.kind === "new") {
    if (!hasOnlyKeys(value, ["kind", "path", "source"]) || !nonEmptyString(value.path) || !nonEmptyString(value.source)) {
      issues.push(invalidRequest(pointer, "New workspace requires a destination path and source repository"));
      return undefined;
    }
    return { kind: "new", path: value.path, source: value.source };
  }
  if (value.kind === "previous") {
    if (!hasOnlyKeys(value, ["kind", "workspace_id", "mission_id", "record_home_repository_id", "record_home_path"]) ||
      !nonEmptyString(value.workspace_id) || typeof value.mission_id !== "string" || !isUuidV4(value.mission_id) ||
      !nonEmptyString(value.record_home_repository_id) || !nonEmptyString(value.record_home_path)) {
      issues.push(invalidRequest(pointer, "Previous workspace requires its saved identity and source record home"));
      return undefined;
    }
    return {
      kind: "previous",
      workspace_id: value.workspace_id,
      mission_id: value.mission_id,
      record_home_repository_id: value.record_home_repository_id,
      record_home_path: value.record_home_path,
    };
  }
  issues.push(invalidRequest(`${pointer}/kind`, "Unsupported workspace selection"));
  return undefined;
};

const parseBranch = (
  value: unknown,
  pointer: string,
  issues: MissionStartupRequestIssue[],
): MissionBranchSelection | undefined => {
  if (!isRecord(value) || !nonEmptyString(value.kind)) {
    issues.push(invalidRequest(pointer, "Expected an explicit branch selection"));
    return undefined;
  }
  if (value.kind === "current" || value.kind === "default") {
    if (!hasOnlyKeys(value, ["kind"])) {
      issues.push(invalidRequest(pointer, "Current and default selections take no additional fields"));
      return undefined;
    }
    return { kind: value.kind };
  }
  if (value.kind === "existing") {
    if (!hasOnlyKeys(value, ["kind", "name"]) || !nonEmptyString(value.name)) {
      issues.push(invalidRequest(pointer, "Existing branch requires only a non-empty name"));
      return undefined;
    }
    return { kind: "existing", name: value.name };
  }
  if (value.kind === "new") {
    if (!hasOnlyKeys(value, ["kind", "name", "base"]) || !nonEmptyString(value.name) || !nonEmptyString(value.base)) {
      issues.push(invalidRequest(pointer, "New branch requires a name and explicit base"));
      return undefined;
    }
    return { kind: "new", name: value.name, base: value.base };
  }
  issues.push(invalidRequest(`${pointer}/kind`, "Unsupported branch selection"));
  return undefined;
};

export const validateMissionStartupRequest = (
  value: unknown,
): MissionStartupRequestValidation => {
  const issues: MissionStartupRequestIssue[] = [];
  if (!isRecord(value)) {
    return { kind: "invalid", issues: [invalidRequest("", "Expected a mission startup object")] };
  }
  const allowed = ["title", "request", "workflow", "recordHomeRepositoryId", "contexts", "repositories"];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(invalidRequest(`/${key}`, "Unknown mission startup field"));
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) issues.push(invalidRequest(`/${key}`, "Required mission startup field is missing"));
  }
  if (!nonEmptyString(value.title)) issues.push(invalidRequest("/title", "Expected a non-empty title"));
  if (!nonEmptyString(value.request)) issues.push(invalidRequest("/request", "Expected concise non-empty request facts"));
  if (value.workflow !== "standard") issues.push(invalidRequest("/workflow", "Only the standard workflow is currently supported"));
  if (!nonEmptyString(value.recordHomeRepositoryId)) issues.push(invalidRequest("/recordHomeRepositoryId", "Expected a non-empty record-home repository identity"));

  const contexts: { reference: string; purpose: string }[] = [];
  if (!Array.isArray(value.contexts)) {
    issues.push(invalidRequest("/contexts", "Expected an array of selected context references"));
  } else {
    value.contexts.forEach((context, index) => {
      const pointer = `/contexts/${index}`;
      if (!isRecord(context) || !hasOnlyKeys(context, ["reference", "purpose"]) ||
        !nonEmptyString(context.reference) || !nonEmptyString(context.purpose)) {
        issues.push(invalidRequest(pointer, "Context requires a reference and purpose"));
      } else {
        contexts.push({ reference: context.reference, purpose: context.purpose });
      }
    });
  }

  const repositories: MissionRepositoryRequest[] = [];
  if (!Array.isArray(value.repositories) || value.repositories.length === 0) {
    issues.push(invalidRequest("/repositories", "Select at least one repository"));
  } else {
    value.repositories.forEach((repository, index) => {
      const pointer = `/repositories/${index}`;
      if (!isRecord(repository) || !hasOnlyKeys(repository, ["repositoryId", "workspace", "branch", "integrationTarget"])) {
        issues.push(invalidRequest(pointer, "Repository selection has invalid fields"));
        return;
      }
      const repositoryId = repository.repositoryId;
      const integrationTarget = repository.integrationTarget;
      if (!nonEmptyString(repositoryId)) issues.push(invalidRequest(`${pointer}/repositoryId`, "Expected a non-empty repository identity"));
      if (!nonEmptyString(integrationTarget)) issues.push(invalidRequest(`${pointer}/integrationTarget`, "Expected an explicit Integration target"));
      const workspace = parseWorkspace(repository.workspace, `${pointer}/workspace`, issues);
      const branch = parseBranch(repository.branch, `${pointer}/branch`, issues);
      if (nonEmptyString(repositoryId) && nonEmptyString(integrationTarget) && workspace && branch) {
        repositories.push({ repositoryId, workspace, branch, integrationTarget });
      }
    });
    if (new Set(repositories.map((repository) => repository.repositoryId)).size !== repositories.length) {
      issues.push(invalidRequest("/repositories", "Repository identities must be unique"));
    }
  }

  if (issues.length > 0) return { kind: "invalid", issues };
  return {
    kind: "valid",
    request: {
      title: value.title as string,
      request: value.request as string,
      workflow: "standard",
      recordHomeRepositoryId: value.recordHomeRepositoryId as string,
      contexts,
      repositories,
    },
  };
};

const isUuidV4 = (value: string): value is MissionId =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const canonicalIntegrationTarget = (value: string): string | undefined =>
  value.startsWith("refs/heads/") ? value : value.startsWith("refs/") ? undefined : `refs/heads/${value}`;

const expectedContext = (workspace: MissionWorkspaceRequest): MissionWorkspaceContext => {
  if (workspace.kind !== "previous") return { kind: workspace.kind };
  return {
    kind: "previous",
    workspace_id: workspace.workspace_id,
    mission_id: workspace.mission_id as MissionId,
    record_home_repository_id: workspace.record_home_repository_id,
  };
};

const sameBranch = (left: MissionBranchSelection, right: MissionBranchSelection): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === "existing" && right.kind === "existing") return left.name === right.name;
  if (left.kind === "new" && right.kind === "new") return left.name === right.name && left.base === right.base;
  return left.kind === "current" || left.kind === "default";
};

const sameContext = (left: MissionWorkspaceContext, right: MissionWorkspaceContext): boolean =>
  left.kind === right.kind && (left.kind !== "previous" || (
    right.kind === "previous" && left.workspace_id === right.workspace_id &&
    left.mission_id === right.mission_id &&
    left.record_home_repository_id === right.record_home_repository_id
  ));

const isMissionStartingCheckpoint = (value: unknown): value is MissionStartingCheckpoint =>
  isRecord(value) && (
    (value.kind === "commit" && nonEmptyString(value.commit)) ||
    value.kind === "no-commit"
  );

const isMissionWorkspaceContext = (value: unknown): value is MissionWorkspaceContext =>
  isRecord(value) && (
    (value.kind === "existing" && hasOnlyKeys(value, ["kind"])) ||
    (value.kind === "new" && hasOnlyKeys(value, ["kind"])) ||
    (value.kind === "previous" && hasOnlyKeys(value, ["kind", "workspace_id", "mission_id", "record_home_repository_id"]) &&
      nonEmptyString(value.workspace_id) && typeof value.mission_id === "string" && isUuidV4(value.mission_id) &&
      nonEmptyString(value.record_home_repository_id))
  );

const isMissionBranchSelection = (value: unknown): value is MissionBranchSelection =>
  isRecord(value) && (
    ((value.kind === "current" || value.kind === "default") && hasOnlyKeys(value, ["kind"])) ||
    (value.kind === "existing" && hasOnlyKeys(value, ["kind", "name"]) && nonEmptyString(value.name)) ||
    (value.kind === "new" && hasOnlyKeys(value, ["kind", "name", "base"]) &&
      nonEmptyString(value.name) && nonEmptyString(value.base))
  );

const isMissionWorkspaceSelection = (value: unknown): value is MissionWorkspaceSelection =>
  isRecord(value) && hasOnlyKeys(value, ["repository_id", "context", "branch", "integration_target", "starting_checkpoint"]) &&
  nonEmptyString(value.repository_id) && isMissionWorkspaceContext(value.context) &&
  isMissionBranchSelection(value.branch) && nonEmptyString(value.integration_target) &&
  isMissionStartingCheckpoint(value.starting_checkpoint);

const isMissionWorkspacePreparedData = (value: unknown): value is MissionWorkspacePreparedData =>
  isRecord(value) && hasOnlyKeys(value, ["mission_id", "repositories"]) && typeof value.mission_id === "string" &&
  isUuidV4(value.mission_id) && Array.isArray(value.repositories) && value.repositories.every((repository) =>
    isRecord(repository) && hasOnlyKeys(repository, ["repository_id", "context", "branch", "integration_target", "starting_checkpoint"]) &&
    nonEmptyString(repository.repository_id) && isMissionWorkspaceContext(repository.context) &&
    nonEmptyString(repository.branch) && nonEmptyString(repository.integration_target) &&
    isMissionStartingCheckpoint(repository.starting_checkpoint));

const isMissionCreatedData = (value: unknown): value is MissionCreatedData =>
  isRecord(value) && hasOnlyKeys(value, ["mission_id", "title", "request", "workflow", "record_home", "contexts", "repositories"]) &&
  typeof value.mission_id === "string" && isUuidV4(value.mission_id) && nonEmptyString(value.title) &&
  nonEmptyString(value.request) && value.workflow === "standard" && isRecord(value.record_home) &&
  hasOnlyKeys(value.record_home, ["repository_id"]) && nonEmptyString(value.record_home.repository_id) &&
  Array.isArray(value.contexts) && value.contexts.every((context) => isRecord(context) &&
    hasOnlyKeys(context, ["reference", "purpose"]) && nonEmptyString(context.reference) && nonEmptyString(context.purpose)) &&
  Array.isArray(value.repositories) && value.repositories.every(isMissionWorkspaceSelection);

const sameCheckpoint = (left: MissionStartingCheckpoint, right: MissionStartingCheckpoint): boolean =>
  left.kind === right.kind && (left.kind === "no-commit" || (
    right.kind === "commit" && left.commit === right.commit
  ));

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry the mission operation.",
): MissionStartupFailure => ({ kind: "failed", code, message, details, recovery });

const envelope = <TData extends object>(
  id: string,
  journalId: string,
  recordedAt: string,
  producer: { readonly name: string; readonly version: string },
  type: "construction.mission-created" | "construction.mission-workspaces-prepared",
  data: TData,
  causedBy: readonly string[] = [],
): EventEnvelope<TData> => ({
  id: id as EventId,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: EVENT_ENVELOPE_VERSION,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId as JournalId,
  recorded_at: recordedAt,
  producer,
  caused_by: causedBy as EventId[],
  data,
});

const createdDataFor = (
  request: MissionStartupRequest,
  missionId: MissionId,
  repositories: readonly InspectedMissionRepository[],
): MissionCreatedData => ({
  mission_id: missionId,
  title: request.title,
  request: request.request,
  workflow: request.workflow,
  record_home: { repository_id: request.recordHomeRepositoryId },
  contexts: request.contexts,
  repositories: repositories.map((repository) => ({
    repository_id: repository.repositoryId,
    context: repository.context,
    branch: repository.branchSelection,
    integration_target: repository.integrationTarget,
    starting_checkpoint: repository.startingCheckpoint,
  })),
});

const preparedDataFor = (
  missionId: MissionId,
  repositories: readonly InspectedMissionRepository[],
): MissionWorkspacePreparedData => ({
  mission_id: missionId,
  repositories: repositories.map((repository) => ({
    repository_id: repository.repositoryId,
    context: repository.context,
    branch: repository.resolvedBranch,
    integration_target: repository.integrationTarget,
    starting_checkpoint: repository.startingCheckpoint,
  })),
});

const jsonValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(jsonValue).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jsonValue(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const sameJson = (left: unknown, right: unknown): boolean => jsonValue(left) === jsonValue(right);

const isCommit = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40,64}$/.test(value);

const isAbsolutePath = (value: unknown): value is string =>
  typeof value === "string" && Path.isAbsolute(value);

const continuationCommand = (missionId: string, recordHome: string): string => {
  const quotedPath = `'${recordHome.replaceAll("'", "'\\''")}'`;
  return `kepler mission prepare --mission ${missionId} --project ${quotedPath}`;
};

const continueRecovery = (missionId: string, recordHome: string, instruction: string): string =>
  `${instruction} Continue the same mission with: ${continuationCommand(missionId, recordHome)}`;

const expectedEnvelope = (
  value: unknown,
  type: "construction.mission-created" | "construction.mission-workspaces-prepared",
  missionId: MissionId,
): value is EventEnvelope<unknown> => {
  if (!isRecord(value) || value.type !== type || value.phase !== CONSTRUCTION_PHASE ||
      value.data === null || !isRecord(value.data) || value.data.mission_id !== missionId) return false;
  return validateConstructionEvent(value).status === "valid";
};

const isStartupRepository = (
  value: unknown,
  selection: MissionRepositoryRequest,
  recordHome: string,
  recordHomeRepositoryId: string,
  recordHomeCommonDirectory: string,
): value is InspectedMissionRepository => {
  if (!isRecord(value)) return false;
  const workspacePath = value.workspacePath;
  const workspaceCommonDirectory = value.commonDirectory;
  const integrationTarget = canonicalIntegrationTarget(selection.integrationTarget);
  if (!integrationTarget || value.repositoryId !== selection.repositoryId ||
      !sameContext(value.context as MissionWorkspaceContext, expectedContext(selection.workspace)) ||
      !sameBranch(value.branchSelection as MissionBranchSelection, selection.branch) ||
      value.integrationTarget !== integrationTarget ||
      value.workspaceKind !== selection.workspace.kind || !nonEmptyString(value.resolvedBranch) ||
      !nonEmptyString(value.integrationTargetKey) ||
      !isAbsolutePath(workspaceCommonDirectory) ||
      value.integrationTargetKey !== missionIntegrationTargetKey(workspaceCommonDirectory, integrationTarget) ||
      !isMissionStartingCheckpoint(value.startingCheckpoint) ||
      !isAbsolutePath(value.repositoryPath) || !isAbsolutePath(value.recordHomePath) || value.recordHomePath !== recordHome ||
      !isAbsolutePath(value.gitDirectory) || !isAbsolutePath(workspacePath) ||
      !nonEmptyString(value.localWorkspaceKey) || !/^[a-f0-9]{64}$/.test(value.localWorkspaceKey) ||
      value.localWorkspaceKey !== missionWorkspaceKey(workspaceCommonDirectory, workspacePath) ||
      !isAbsolutePath(value.sourcePath) || value.recordHomeRepositoryId !== recordHomeRepositoryId ||
      value.recordHomeCommonDirectory !== recordHomeCommonDirectory ||
      !Array.isArray(value.initialDirtyPaths) || !value.initialDirtyPaths.every((path) => typeof path === "string") ||
      new Set(value.initialDirtyPaths).size !== value.initialDirtyPaths.length ||
      !(value.initialBranch === null || nonEmptyString(value.initialBranch)) ||
      !isMissionStartingCheckpoint(value.initialCheckpoint) ||
      (value.baseCommit !== undefined && !isCommit(value.baseCommit)) ||
      (selection.branch.kind === "new" && (!isCommit(value.baseCommit) || value.startingCheckpoint.kind !== "commit" || value.baseCommit !== value.startingCheckpoint.commit))) return false;
  return true;
};

const validateStartupIntent = (
  value: unknown,
  missionId: MissionId,
  identity: MissionRecordHomeIdentity,
): MissionStartupIntent | undefined => {
  if (!isRecord(value) || value.format !== "kepler.mission-startup-intent.v1" || value.missionId !== missionId ||
      value.recordHomeRoot !== identity.root || value.recordHomeGitDirectory !== identity.gitDirectory ||
      value.recordHomeCommonDirectory !== identity.commonDirectory || !nonEmptyString(value.recordHomeRepositoryId)) return undefined;
  const requestValidation = validateMissionStartupRequest(value.request);
  if (requestValidation.kind !== "valid" || requestValidation.request.recordHomeRepositoryId !== value.recordHomeRepositoryId ||
      !Array.isArray(value.repositories) || value.repositories.length !== requestValidation.request.repositories.length) return undefined;
  const repositories: InspectedMissionRepository[] = [];
  for (let index = 0; index < value.repositories.length; index += 1) {
    const selection = requestValidation.request.repositories[index];
    const repository = value.repositories[index];
    if (selection === undefined || !isStartupRepository(
      repository,
      selection,
      identity.root,
      requestValidation.request.recordHomeRepositoryId,
      identity.commonDirectory,
    )) return undefined;
    repositories.push(repository);
  }
  const createdEvent = value.createdEvent;
  const preparedEvent = value.preparedEvent;
  if (!expectedEnvelope(createdEvent, "construction.mission-created", missionId) ||
      !expectedEnvelope(preparedEvent, "construction.mission-workspaces-prepared", missionId) ||
      createdEvent.journal_id !== preparedEvent.journal_id || createdEvent.id === preparedEvent.id ||
      createdEvent.caused_by.length !== 0 || preparedEvent.caused_by.length !== 1 ||
      preparedEvent.caused_by[0] !== createdEvent.id ||
      !sameJson(createdEvent.data, createdDataFor(requestValidation.request, missionId, repositories)) ||
      !sameJson(preparedEvent.data, preparedDataFor(missionId, repositories))) return undefined;
  return {
    format: "kepler.mission-startup-intent.v1",
    missionId,
    recordHomeRoot: identity.root,
    recordHomeRepositoryId: value.recordHomeRepositoryId,
    recordHomeGitDirectory: identity.gitDirectory,
    recordHomeCommonDirectory: identity.commonDirectory,
    request: requestValidation.request,
    repositories,
    createdEvent,
    preparedEvent,
  };
};

const historyProblem = (
  history: HistoryCollection,
  missionId: MissionId,
  recordHome: string,
): MissionStartupFailure => failure(
  "mission_history_not_recoverable",
  "Mission history is incomplete, damaged, unsupported, or conflicting; Kepler will not infer startup state from local intent.",
  { mission_id: missionId, issues: history.issues },
  continueRecovery(missionId, recordHome, "Preserve history and resolve the listed source or event conflicts explicitly."),
);

const startupEventsAgree = (
  createdEvent: EventEnvelope,
  preparedEvent: EventEnvelope,
  missionId: MissionId,
): boolean => {
  if (createdEvent.type !== "construction.mission-created" || preparedEvent.type !== "construction.mission-workspaces-prepared" ||
      createdEvent.data.mission_id !== missionId || preparedEvent.data.mission_id !== missionId ||
      createdEvent.journal_id !== preparedEvent.journal_id || createdEvent.caused_by.length !== 0 ||
      preparedEvent.caused_by.length !== 1 || preparedEvent.caused_by[0] !== createdEvent.id) return false;
  if (!isMissionCreatedData(createdEvent.data) || !isMissionWorkspacePreparedData(preparedEvent.data)) return false;
  const preparedById = new Map(preparedEvent.data.repositories.map((repository) => [repository.repository_id, repository]));
  return createdEvent.data.repositories.length === preparedEvent.data.repositories.length &&
    preparedById.size === preparedEvent.data.repositories.length &&
    createdEvent.data.repositories.every((selection) => {
      const repository = preparedById.get(selection.repository_id);
      const branchMatches = selection.branch.kind === "current" || selection.branch.kind === "default" ||
        (selection.branch.kind === "existing" || selection.branch.kind === "new") && selection.branch.name === repository?.branch;
      return repository !== undefined && sameContext(selection.context, repository.context) && branchMatches &&
        canonicalIntegrationTarget(selection.integration_target) === repository.integration_target &&
        sameCheckpoint(selection.starting_checkpoint, repository.starting_checkpoint);
    });
};

const singleUnterminatedStartupTail = (
  history: HistoryCollection,
  missionId: MissionId,
): CollectedHistoryEvent | undefined => {
  if (!history.sourceSetComplete || history.issues.length !== 1 || history.journals.length !== 1) return undefined;
  const issue = history.issues[0];
  const journal = history.journals[0];
  const tail = journal?.scan.lines.at(-1);
  const scanProblem = journal?.scan.problems[0];
  if (!issue || issue.code !== "damaged-record" || issue.sourceId !== journal?.sourceId ||
      issue.journalId !== journal?.journalId || issue.line === undefined || !issue.eventId ||
      !journal || journal.missionId !== missionId || journal.phase !== CONSTRUCTION_PHASE ||
      journal.scan.problems.length !== 1 || scanProblem?.code !== "unterminated-record" ||
      scanProblem.line !== issue.line || !tail || tail.terminated || tail.line !== issue.line ||
      tail.event?.id !== issue.eventId || tail.event.phase !== CONSTRUCTION_PHASE ||
      tail.event.journal_id !== journal.journalId || tail.event.data.mission_id !== missionId) return undefined;
  const candidate = journal.events.find((event) => event.line === issue.line && event.event?.id === issue.eventId);
  if (!candidate || candidate.sourceId !== issue.sourceId || candidate.status !== "invalid" ||
      candidate.constructionEvent !== undefined || candidate.issueCodes.length !== 1 ||
      candidate.issueCodes[0] !== "damaged-record" ||
      history.events.some((event) =>
        !(event.sourceId === candidate.sourceId && event.journalId === candidate.journalId && event.line === candidate.line &&
          event.event?.id === candidate.event?.id) &&
        (event.status !== "valid" || event.constructionEvent === undefined || event.event === undefined))) return undefined;
  const validation = validateConstructionEvent(tail.event);
  if (validation.status !== "valid") return undefined;
  if (tail.event.type === "construction.mission-created") {
    return history.events.length === 1 && isMissionCreatedData(tail.event.data) &&
      tail.event.caused_by.length === 0 ? candidate : undefined;
  }
  if (tail.event.type !== "construction.mission-workspaces-prepared" || history.events.length !== 2) return undefined;
  const created = history.events.find((event) => event.event?.type === "construction.mission-created");
  if (!created || created.status !== "valid" || created.constructionEvent === undefined || !created.event ||
      created.line >= candidate.line || created.journalId !== candidate.journalId ||
      history.events.filter((event) => event.event?.id === tail.event?.id).length !== 1 ||
      !startupEventsAgree(created.event, tail.event, missionId)) return undefined;
  return candidate;
};

const savedUnterminatedStartupTail = (
  history: HistoryCollection,
  intent: MissionStartupIntent,
): EventEnvelope<unknown> | undefined => {
  const candidate = singleUnterminatedStartupTail(history, intent.missionId);
  if (!candidate?.event) return undefined;
  if (sameJson(candidate.event, intent.createdEvent)) return intent.createdEvent;
  if (!sameJson(candidate.event, intent.preparedEvent)) return undefined;
  const created = history.events.find((event) => event.event?.type === "construction.mission-created");
  return created?.event && sameJson(created.event, intent.createdEvent) ? intent.preparedEvent : undefined;
};

const preparedResultFromHistory = (
  missionId: MissionId,
  recordHome: string,
  prepared: CollectedHistoryEvent,
): MissionStartupPrepared => {
  if (prepared.event?.type !== "construction.mission-workspaces-prepared") {
    throw new Error("Validated history fact was not a workspace-prepared event");
  }
  const data = prepared.event.data;
  if (!isMissionWorkspacePreparedData(data)) throw new Error("Validated history fact has malformed workspace-prepared data");
  return {
    kind: "prepared",
    missionId,
    recordHome,
    historical: true,
    repositories: data.repositories.map((repository) => ({
      repositoryId: repository.repository_id,
      context: repository.context,
      branch: repository.branch,
      integrationTarget: repository.integration_target,
      startingCheckpoint: repository.starting_checkpoint,
    })),
  };
};

const preparedResultFromCompleteHistory = (
  history: HistoryCollection,
  missionId: MissionId,
  recordHome: string,
): MissionStartupPrepared | MissionStartupFailure | undefined => {
  if (!history.sourceSetComplete || history.issues.length > 0 ||
      history.events.some((entry) => entry.status !== "valid" || entry.constructionEvent === undefined || entry.event === undefined)) {
    if (singleUnterminatedStartupTail(history, missionId)) return undefined;
    return historyProblem(history, missionId, recordHome);
  }
  const createdEvents = history.events.filter((entry) => entry.event?.type === "construction.mission-created");
  const preparedEvents = history.events.filter((entry) => entry.event?.type === "construction.mission-workspaces-prepared");
  if (createdEvents.length > 1 || preparedEvents.length > 1) {
    return failure("mission_history_conflict", "Mission history contains duplicate startup facts.", {
      mission_id: missionId,
      creation_events: createdEvents.map((entry) => entry.event?.id),
      prepared_events: preparedEvents.map((entry) => entry.event?.id),
    }, continueRecovery(missionId, recordHome, "Preserve the history and resolve duplicate startup facts explicitly."));
  }
  const prepared = preparedEvents[0];
  if (!prepared) return undefined;
  const created = createdEvents[0];
  const createdEvent = created?.event;
  const preparedEvent = prepared.event;
  if (!created || !createdEvent || !preparedEvent || createdEvent.type !== "construction.mission-created" ||
      preparedEvent.type !== "construction.mission-workspaces-prepared") {
    return failure("mission_creation_fact_missing", "Mission history contains a workspace-prepared fact without its original creation fact.", {
      mission_id: missionId,
      prepared_event_id: preparedEvent?.id,
    }, continueRecovery(missionId, recordHome, "Preserve history; Kepler will not infer mission creation from other records."));
  }
  if (!isMissionCreatedData(createdEvent.data) || !isMissionWorkspacePreparedData(preparedEvent.data)) {
    return failure("mission_history_conflict", "The recorded startup events have malformed mission data.", {
      mission_id: missionId,
      created_event_id: createdEvent.id,
      prepared_event_id: preparedEvent.id,
    }, continueRecovery(missionId, recordHome, "Preserve history and resolve the startup event-data conflict explicitly."));
  }
  if (!startupEventsAgree(createdEvent, preparedEvent, missionId)) {
    return failure("mission_history_conflict", "The recorded preparation fact does not match its mission creation authority.", {
      mission_id: missionId,
      created_event_id: createdEvent.id,
      prepared_event_id: preparedEvent.id,
    }, continueRecovery(missionId, recordHome, "Preserve history and resolve the startup-fact mismatch explicitly."));
  }
  return preparedResultFromHistory(missionId, recordHome, prepared);
};

interface MissionStartupHistoryState {
  readonly created?: CollectedHistoryEvent;
  readonly prepared?: CollectedHistoryEvent;
}

const validatedStartupHistory = (
  history: HistoryCollection,
  intent: MissionStartupIntent,
): MissionStartupHistoryState | MissionStartupFailure => {
  if (!history.sourceSetComplete || history.issues.length > 0 ||
      history.events.some((entry) => entry.status !== "valid" || entry.constructionEvent === undefined || entry.event === undefined)) {
    return historyProblem(history, intent.missionId, intent.recordHomeRoot);
  }
  const createdEvents = history.events.filter((entry) => entry.event?.type === "construction.mission-created");
  const preparedEvents = history.events.filter((entry) => entry.event?.type === "construction.mission-workspaces-prepared");
  if (createdEvents.length > 1 || preparedEvents.length > 1) {
    return failure("mission_history_conflict", "Mission history contains duplicate startup facts.", {
      mission_id: intent.missionId,
      creation_events: createdEvents.map((entry) => entry.event?.id),
      prepared_events: preparedEvents.map((entry) => entry.event?.id),
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the history and resolve duplicate startup facts explicitly."));
  }
  const created = createdEvents[0];
  const prepared = preparedEvents[0];
  const createdIdentityOccurrences = history.events.filter((entry) => entry.event?.id === intent.createdEvent.id);
  const preparedIdentityOccurrences = history.events.filter((entry) => entry.event?.id === intent.preparedEvent.id);
  if ((created && (created.event?.id !== intent.createdEvent.id || !sameJson(created.event, intent.createdEvent))) ||
      (prepared && (prepared.event?.id !== intent.preparedEvent.id || !sameJson(prepared.event, intent.preparedEvent))) ||
      createdIdentityOccurrences.length > 1 || preparedIdentityOccurrences.length > 1 ||
      (createdIdentityOccurrences.length === 1 && !created) || (preparedIdentityOccurrences.length === 1 && !prepared)) {
    return failure("mission_history_conflict", "Mission history does not contain the exact saved startup event envelopes.", {
      mission_id: intent.missionId,
      expected_created_event_id: intent.createdEvent.id,
      expected_prepared_event_id: intent.preparedEvent.id,
      observed_created_event_ids: createdEvents.map((entry) => entry.event?.id),
      observed_prepared_event_ids: preparedEvents.map((entry) => entry.event?.id),
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve history and resolve the event identity or content mismatch explicitly."));
  }
  if (!created && (history.events.length > 0 || prepared)) {
    return failure("mission_creation_fact_missing", "Mission history contains events but no validated original creation fact.", {
      mission_id: intent.missionId,
      event_ids: history.events.map((entry) => entry.event?.id),
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve history; Kepler will not infer mission creation from local intent."));
  }
  if (created && !prepared && history.events.some((entry) => entry.event?.id !== intent.createdEvent.id)) {
    return failure("mission_preparation_history_conflict", "History contains downstream events without a validated workspace-prepared fact.", {
      mission_id: intent.missionId,
      event_ids: history.events.filter((entry) => entry.event?.id !== intent.createdEvent.id).map((entry) => entry.event?.id),
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve history and resolve the missing preparation authority explicitly."));
  }
  return { ...(created ? { created } : {}), ...(prepared ? { prepared } : {}) };
};

const startupFailure = (
  value: MissionStartupFailure,
  missionId: MissionId,
  recordHome?: string,
): MissionStartupFailure => ({
  ...value,
  details: { ...value.details, mission_id: missionId },
  recovery: recordHome
    ? continueRecovery(missionId, recordHome, value.recovery)
    : `${value.recovery} Resolve the original mission record home, then retry the same mission ID with --project set to that record home.`,
});

export class MissionStartup {
  constructor(private readonly runtime: MissionStartupRuntime) {}

  async execute(project: string | undefined, input: unknown): Promise<MissionStartupResult> {
    const validated = validateMissionStartupRequest(input);
    if (validated.kind === "invalid") {
      return failure(
        "invalid_mission_request",
        "Mission startup request is invalid.",
        { issues: validated.issues },
        "Correct the mission request fields and retry before preparing workspaces.",
      );
    }

    let selectedProject: ProjectSelectionResult;
    try {
      selectedProject = await this.runtime.projects.resolve(project);
    } catch (error) {
      return failure("project_resolution_failed", "Kepler could not resolve the selected mission record home.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (selectedProject.kind === "failed") return selectedProject;

    let recordHomeIdentity: MissionRecordHomeIdentity | MissionStartupFailure;
    try {
      recordHomeIdentity = await this.runtime.workspaces.identifyRecordHome(selectedProject.root);
    } catch (error) {
      return failure("record_home_identity_failed", "Kepler could not identify the selected mission record home's Git repository.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if ("kind" in recordHomeIdentity) return recordHomeIdentity;

    let inspected: MissionWorkspaceInspectionResult;
    try {
      inspected = await this.runtime.workspaces.inspect(recordHomeIdentity.root, validated.request);
    } catch (error) {
      return failure(
        "workspace_inspection_failed",
        "Kepler could not inspect the selected mission workspaces.",
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
    if (inspected.kind === "failed") return inspected;
    const inspectedById = new Map(inspected.repositories.map((repository) => [repository.repositoryId, repository]));
    const orderedInspected = validated.request.repositories.map((selection) => inspectedById.get(selection.repositoryId));
    if (inspected.repositories.length !== validated.request.repositories.length ||
      inspectedById.size !== inspected.repositories.length ||
      orderedInspected.some((repository, index) => {
        const selection = validated.request.repositories[index]!;
        return repository === undefined ||
          !sameContext(repository.context, expectedContext(selection.workspace)) ||
          !sameBranch(repository.branchSelection, selection.branch) ||
          repository.integrationTarget !== canonicalIntegrationTarget(selection.integrationTarget) ||
          !nonEmptyString(repository.integrationTargetKey) ||
          !nonEmptyString(repository.resolvedBranch) ||
          !nonEmptyString(repository.repositoryPath) ||
          repository.recordHomePath !== recordHomeIdentity.root ||
          repository.recordHomeCommonDirectory !== recordHomeIdentity.commonDirectory ||
          !Array.isArray(repository.initialDirtyPaths) ||
          !(repository.initialBranch === null || nonEmptyString(repository.initialBranch)) ||
          !isMissionStartingCheckpoint(repository.initialCheckpoint) ||
          !nonEmptyString(repository.gitDirectory) ||
          !nonEmptyString(repository.commonDirectory) ||
          !nonEmptyString(repository.localWorkspaceKey) ||
          !isMissionStartingCheckpoint(repository.startingCheckpoint);
      })) {
      return failure(
        "workspace_inspection_inconsistent",
        "Workspace inspection did not preserve the explicit mission selections.",
        { selected_repository_ids: validated.request.repositories.map((repository) => repository.repositoryId) },
        "Correct the workspace adapter or selection mismatch before recording mission facts.",
      );
    }

    const confirmedInspected = orderedInspected as InspectedMissionRepository[];

    let missionId = "";
    let journalId = "";
    let createdEventId = "";
    let preparedEventId = "";
    try {
      missionId = this.runtime.identities.next();
      journalId = this.runtime.identities.next();
      createdEventId = this.runtime.identities.next();
      preparedEventId = this.runtime.identities.next();
    } catch {
      return failure("identity_generation_failed", "Kepler could not allocate mission history identities.");
    }
    const identities = [missionId, journalId, createdEventId, preparedEventId];
    if (identities.some((identity) => !isUuidV4(identity)) || new Set(identities).size !== identities.length) {
      return failure("identity_generation_failed", "Mission identity generation returned invalid or reused UUIDv4 values.");
    }

    const data: MissionCreatedData = {
      mission_id: missionId as MissionId,
      title: validated.request.title,
      request: validated.request.request,
      workflow: validated.request.workflow,
      record_home: { repository_id: validated.request.recordHomeRepositoryId },
      contexts: validated.request.contexts,
      repositories: confirmedInspected.map((repository) => ({
        repository_id: repository.repositoryId,
        context: repository.context,
        branch: repository.branchSelection,
        integration_target: repository.integrationTarget,
        starting_checkpoint: repository.startingCheckpoint,
      })),
    };
    const created = envelope(
      createdEventId,
      journalId,
      this.runtime.now(),
      this.runtime.producer,
      "construction.mission-created",
      data,
    );
    const validation = validateConstructionEvent(created);
    if (validation.status !== "valid") {
      return failure(
        "invalid_mission_event",
        "The typed mission creation event failed its Construction contract.",
        { status: validation.status, issues: validation.status === "invalid" ? validation.issues : [] },
      );
    }

    const preparedEvent = envelope(
      preparedEventId,
      journalId,
      this.runtime.now(),
      this.runtime.producer,
      "construction.mission-workspaces-prepared",
      preparedDataFor(missionId as MissionId, confirmedInspected),
      [createdEventId],
    );
    const preparedValidation = validateConstructionEvent(preparedEvent);
    if (preparedValidation.status !== "valid") {
      return failure(
        "invalid_prepared_mission_event",
        "The selected workspace plan could not produce a valid Construction preparation event.",
        { mission_id: missionId, status: preparedValidation.status, issues: preparedValidation.status === "invalid" ? preparedValidation.issues : [] },
        "No Git workspaces were prepared. Correct the startup contract before retrying.",
      );
    }
    const intent: MissionStartupIntent = {
      format: "kepler.mission-startup-intent.v1",
      missionId: missionId as MissionId,
      recordHomeRoot: recordHomeIdentity.root,
      recordHomeRepositoryId: validated.request.recordHomeRepositoryId,
      recordHomeGitDirectory: recordHomeIdentity.gitDirectory,
      recordHomeCommonDirectory: recordHomeIdentity.commonDirectory,
      request: validated.request,
      repositories: confirmedInspected,
      createdEvent: created,
      preparedEvent,
    };
    try {
      await this.runtime.recovery.saveIntent(
        intent.recordHomeRoot,
        intent.recordHomeCommonDirectory,
        intent.missionId,
        intent,
      );
    } catch (error) {
      return failure(
        "mission_recovery_intent_write_failed",
        "Kepler could not durably preserve the selected startup instructions before history or Git effects.",
        { mission_id: intent.missionId, message: error instanceof Error ? error.message : String(error) },
        "No mission history append or Git workspace effect was attempted. Fix local Git common-directory storage, then create a new mission; this ID has no recoverable intent.",
      );
    }
    return await this.finish(intent, false);
  }

  async prepare(project: string | undefined, missionIdValue: string): Promise<MissionStartupResult> {
    if (!isUuidV4(missionIdValue)) {
      return failure("invalid_mission_id", "Mission preparation requires a full lowercase UUIDv4.", {
        mission_id: missionIdValue,
      }, "Provide the exact mission ID from the prior mission create result; no history or workspace was changed.");
    }
    const missionId = missionIdValue as MissionId;
    let selectedProject: ProjectSelectionResult;
    try {
      selectedProject = await this.runtime.projects.resolve(project);
    } catch (error) {
      return failure("project_resolution_failed", "Kepler could not resolve the selected mission record home.", {
        mission_id: missionId,
        message: error instanceof Error ? error.message : String(error),
      }, "Resolve the original mission record home, then retry the same mission ID with --project set to that record home.");
    }
    if (selectedProject.kind === "failed") {
      return startupFailure(selectedProject, missionId, project);
    }
    let identity: MissionRecordHomeIdentity | MissionStartupFailure;
    try {
      identity = await this.runtime.workspaces.identifyRecordHome(selectedProject.root);
    } catch (error) {
      return failure("record_home_identity_failed", "Kepler could not identify the selected mission record home's Git repository.", {
        mission_id: missionId,
        message: error instanceof Error ? error.message : String(error),
      }, `Preserve mission history and resolve the original record home, then run ${continuationCommand(missionId, selectedProject.root)}.`);
    }
    if ("kind" in identity) return startupFailure(identity, missionId, selectedProject.root);

    let history: HistoryCollection;
    try {
      history = await this.runtime.recovery.readHistory(identity.root, missionId);
    } catch (error) {
      return failure("mission_history_read_failed", "Kepler could not read the complete mission history source set.", {
        mission_id: missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(missionId, identity.root, "Preserve all history files and resolve the reported storage error."));
    }
    const recoverableTailCandidate = singleUnterminatedStartupTail(history, missionId) !== undefined;
    const historicalPrepared = preparedResultFromCompleteHistory(history, missionId, identity.root);
    if (historicalPrepared !== undefined) return historicalPrepared;

    let rawIntent: unknown | undefined;
    try {
      rawIntent = await this.runtime.recovery.loadIntent(identity.root, identity.commonDirectory, missionId);
    } catch (error) {
      return failure("mission_recovery_intent_read_failed", "Kepler could not safely read the saved mission startup instructions.", {
        mission_id: missionId,
        record_home: identity.root,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(missionId, identity.root, "Preserve the local intent and Git common-directory paths; do not replace or repair them manually."));
    }
    if (rawIntent === undefined && recoverableTailCandidate) {
      return historyProblem(history, missionId, identity.root);
    }
    if (rawIntent === undefined) {
      return failure("mission_recovery_material_missing", "The original mission has no saved startup recovery instructions.", {
        mission_id: missionId,
        record_home: identity.root,
        missing_facts: ["canonical record-home identity", "resolved repository and workspace selections", "fixed branch/base checkpoints", "exact pending event envelopes"],
      }, "This mission cannot be repaired safely from current refs or paths. Preserve all history and Git resources; do not create a replacement mission or guess its original selections.");
    }
    const intent = validateStartupIntent(rawIntent, missionId, identity);
    if (!intent) {
      return failure("mission_recovery_intent_invalid", "Saved startup recovery material is malformed, unsupported, or bound to a different repository identity.", {
        mission_id: missionId,
        record_home: identity.root,
        conflicting_facts: ["intent format", "record-home Git identity", "resolved workspace plan", "saved creation/preparation event envelopes"],
      }, continueRecovery(missionId, identity.root, "Preserve the intent and history. Resolve the listed identity or format conflict without overwriting recovery material."));
    }
    return await this.finish(intent, true);
  }

  private async finish(intent: MissionStartupIntent, reconcile: boolean): Promise<MissionStartupResult> {
    let acquired: Awaited<ReturnType<MissionStartupRecovery["acquireMission"]>>;
    try {
      acquired = await this.runtime.recovery.acquireMission(intent.recordHomeCommonDirectory, intent.missionId);
    } catch (error) {
      return failure("mission_coordination_failed", "Kepler could not acquire the mission-scoped startup coordination lease.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve any owner or release marker and retry only after its owner is resolved."));
    }
    if (acquired.kind === "failed") return startupFailure(acquired, intent.missionId, intent.recordHomeRoot);

    let result: MissionStartupResult;
    try {
      result = await this.finishUnderLease(intent, reconcile);
    } catch (error) {
      result = failure("mission_preparation_failed", "Mission preparation stopped unexpectedly; saved intent and known resources remain in place.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the journal, Git resources, and recovery intent; reconcile before retrying."));
    }
    let released: Awaited<ReturnType<typeof acquired.lease.release>>;
    try {
      released = await acquired.lease.release();
    } catch (error) {
      released = failure("coordination_release_failed", "Mission startup coordination could not be released safely.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the owner and release artifacts and reconcile them before retrying."));
    }
    if (released.kind === "failed") {
      if (result.kind === "failed") {
        return failure(result.code, result.message, {
          ...result.details,
          mission_coordination_release: released,
        }, `${result.recovery} Mission startup coordination also requires reconciliation. ${released.recovery}`);
      }
      return failure("coordination_release_failed", "The mission operation finished, but its coordination lease could not be released safely.", {
        mission_id: intent.missionId,
        preparation_result: result,
        mission_coordination_release: released,
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve all resources and reconcile the mission-scoped owner before retrying."));
    }
    return result;
  }

  private async finishUnderLease(intent: MissionStartupIntent, reconcile: boolean): Promise<MissionStartupResult> {
    let identity: MissionRecordHomeIdentity | MissionStartupFailure;
    try {
      identity = await this.runtime.workspaces.identifyRecordHome(intent.recordHomeRoot);
    } catch (error) {
      return failure("record_home_identity_failed", "Kepler could not recheck the saved record-home Git identity at the guarded startup boundary.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the saved mission data and resolve the record-home identity before retrying."));
    }
    if ("kind" in identity) return startupFailure(identity, intent.missionId, intent.recordHomeRoot);
    const validatedIntent = validateStartupIntent(intent, intent.missionId, identity);
    if (!validatedIntent) {
      return failure("mission_recovery_identity_changed", "The saved record-home or repository identity changed before a guarded mission effect.", {
        mission_id: intent.missionId,
        expected_record_home: intent.recordHomeRoot,
        actual_record_home: identity.root,
        expected_common_directory: intent.recordHomeCommonDirectory,
        actual_common_directory: identity.commonDirectory,
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the mission data and resolve the Git identity mismatch explicitly."));
    }
    let loaded: unknown | undefined;
    try {
      loaded = await this.runtime.recovery.loadIntent(intent.recordHomeRoot, intent.recordHomeCommonDirectory, intent.missionId);
    } catch (error) {
      return failure("mission_recovery_intent_read_failed", "Kepler could not reload the saved mission instructions under coordination.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the local intent and retry after resolving the storage error."));
    }
    const reloadedIntent = validateStartupIntent(loaded, intent.missionId, identity);
    if (!reloadedIntent || !sameJson(reloadedIntent, intent)) {
      return failure("mission_recovery_intent_changed", "The saved mission startup instructions changed or no longer match the selected mission.", {
        mission_id: intent.missionId,
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve both versions and resolve the local intent conflict explicitly."));
    }

    let history: HistoryCollection;
    try {
      history = await this.runtime.recovery.readHistory(intent.recordHomeRoot, intent.missionId);
    } catch (error) {
      return failure("mission_history_read_failed", "Kepler could not read the complete mission history source set.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve all history files and resolve the reported storage error."));
    }
    let journal: EventJournal | undefined;
    const openJournal = (): EventJournal | MissionStartupFailure => {
      if (journal) return journal;
      try {
        const candidate = this.runtime.journals.create(intent.recordHomeRoot, intent.missionId, intent.createdEvent.journal_id);
        const expectedJournalPath = Path.resolve(
          intent.recordHomeRoot,
          ".kepler",
          "missions",
          intent.missionId,
          "history",
          CONSTRUCTION_PHASE,
          `${intent.createdEvent.journal_id}.jsonl`,
        );
        if (!Path.isAbsolute(candidate.path) || Path.resolve(candidate.path) !== expectedJournalPath) {
          return failure("mission_journal_path_invalid", "Mission history must use its saved record-home journal path.", {
            mission_id: intent.missionId,
            journal_path: candidate.path,
            expected_path: expectedJournalPath,
          }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the saved journal coordinates and correct the adapter binding."));
        }
        journal = candidate;
        return candidate;
      } catch (error) {
        return failure("mission_journal_unavailable", "Kepler could not open the saved mission journal.", {
          mission_id: intent.missionId,
          message: error instanceof Error ? error.message : String(error),
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve mission history and resolve journal access before retrying."));
      }
    };

    let state = validatedStartupHistory(history, intent);
    if ("kind" in state) {
      const savedTail = savedUnterminatedStartupTail(history, intent);
      if (!savedTail) return state;
      const opened = openJournal();
      if ("kind" in opened) return opened;
      let appendResult: Awaited<ReturnType<EventJournal["append"]>>;
      try {
        appendResult = await opened.append(savedTail);
      } catch (error) {
        return failure("mission_history_recovery_failed", "Kepler could not recover the exact saved event at the unterminated journal tail.", {
          mission_id: intent.missionId,
          event_id: savedTail.id,
          message: error instanceof Error ? error.message : String(error),
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the journal bytes and resolve the tail before retrying."));
      }
      if (appendResult.status !== "recovered" && appendResult.status !== "duplicate") {
        return failure("mission_history_recovery_failed", "The journal no longer has the exact saved event at its unterminated tail.", {
          mission_id: intent.missionId,
          event_id: savedTail.id,
          append_status: appendResult.status,
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the changed journal and resolve its history explicitly."));
      }
      try {
        history = await this.runtime.recovery.readHistory(intent.recordHomeRoot, intent.missionId);
      } catch (error) {
        return failure("mission_history_read_failed", "Kepler could not re-collect history after the exact journal-tail recovery.", {
          mission_id: intent.missionId,
          event_id: savedTail.id,
          message: error instanceof Error ? error.message : String(error),
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the repaired journal and resolve history reading before retrying."));
      }
      state = validatedStartupHistory(history, intent);
      if ("kind" in state) return state;
    }
    const opened = openJournal();
    if ("kind" in opened) return opened;
    journal = opened;

    if (!state.created) {
      try {
        await journal.append(intent.createdEvent);
      } catch (error) {
        return failure("mission_record_failed", "Kepler could not append the exact saved mission creation event.", {
          mission_id: intent.missionId,
          event_id: intent.createdEvent.id,
          message: error instanceof Error ? error.message : String(error),
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the journal tail and retry the exact mission ID; Kepler will not infer creation from local intent."));
      }
      try {
        history = await this.runtime.recovery.readHistory(intent.recordHomeRoot, intent.missionId);
      } catch (error) {
        return failure("mission_history_read_failed", "Kepler could not validate the creation append from the complete history source set.", {
          mission_id: intent.missionId,
          message: error instanceof Error ? error.message : String(error),
        }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the exact appended event and resolve history reading before retrying."));
      }
      state = validatedStartupHistory(history, intent);
      if ("kind" in state) return state;
      if (!state.created) return failure("mission_creation_fact_missing", "The exact creation append did not become validated history.", {
        mission_id: intent.missionId,
        event_id: intent.createdEvent.id,
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the journal and local intent; resolve the missing creation fact explicitly."));
    }
    if (state.prepared) return preparedResultFromHistory(intent.missionId, intent.recordHomeRoot, state.prepared);

    let workspaceResult: MissionWorkspacePreparationResult;
    try {
      const context = { missionJournalPath: journal.path };
      workspaceResult = reconcile
        ? await this.runtime.workspaces.reconcile(intent.recordHomeRoot, intent.missionId, intent.repositories, context)
        : await this.runtime.workspaces.prepare(intent.recordHomeRoot, intent.missionId, intent.repositories, context);
    } catch (error) {
      return failure("workspace_preparation_failed", "Mission creation was recorded, but workspace preparation did not complete.", {
        mission_id: intent.missionId,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Keep all selected resources. Reconcile actual Git state and continue this same mission; no stage was started or rollback attempted."));
    }
    if (workspaceResult.kind === "failed") return startupFailure(workspaceResult, intent.missionId, intent.recordHomeRoot);
    const preparedById = new Map(workspaceResult.repositories.map((repository) => [repository.repositoryId, repository]));
    const orderedPrepared = intent.repositories.map((repository) => preparedById.get(repository.repositoryId));
    if (workspaceResult.repositories.length !== intent.repositories.length || preparedById.size !== workspaceResult.repositories.length ||
        orderedPrepared.some((repository, index) => {
          const expected = intent.repositories[index]!;
          return repository === undefined || !sameContext(repository.context, expected.context) ||
            repository.branch !== expected.resolvedBranch || repository.integrationTarget !== expected.integrationTarget ||
            !sameCheckpoint(repository.startingCheckpoint, expected.startingCheckpoint) ||
            repository.localWorkspaceKey !== expected.localWorkspaceKey || repository.workspacePath !== expected.workspacePath;
        })) {
      return failure("workspace_preparation_inconsistent", "Workspace preparation did not verify every saved binding.", {
        mission_id: intent.missionId,
        prepared_repository_ids: workspaceResult.repositories.map((repository) => repository.repositoryId),
        partial_effects: workspaceResult.repositories.map((repository) => ({
          repository_id: repository.repositoryId,
          workspace_path: repository.workspacePath,
          workspace_id: repository.localWorkspaceKey,
          branch: repository.branch,
          integration_target: repository.integrationTarget,
          starting_checkpoint: repository.startingCheckpoint,
          state: "prepared",
        })),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve all prepared resources and reconcile the saved binding before starting any stage."));
    }

    try {
      history = await this.runtime.recovery.readHistory(intent.recordHomeRoot, intent.missionId);
    } catch (error) {
      return failure("mission_history_read_failed", "Kepler could not recheck mission history at the prepared-event append boundary.", {
        mission_id: intent.missionId,
        partial_effects: workspaceResult.repositories.map((repository) => ({ repository_id: repository.repositoryId, workspace_path: repository.workspacePath, state: "prepared" })),
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve prepared resources and history; resolve the source-set read error before retrying."));
    }
    state = validatedStartupHistory(history, intent);
    if ("kind" in state) return state;
    if (state.prepared) return preparedResultFromHistory(intent.missionId, intent.recordHomeRoot, state.prepared);
    if (!state.created) return failure("mission_creation_fact_missing", "Mission creation authority disappeared before workspace preparation could be recorded.", {
      mission_id: intent.missionId,
      partial_effects: workspaceResult.repositories.map((repository) => ({ repository_id: repository.repositoryId, workspace_path: repository.workspacePath, state: "prepared" })),
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve prepared resources and restore validated history authority explicitly."));

    const partialEffects = workspaceResult.repositories.map((repository) => ({
      repository_id: repository.repositoryId,
      workspace_path: repository.workspacePath,
      workspace_id: repository.localWorkspaceKey,
      branch: repository.branch,
      integration_target: repository.integrationTarget,
      starting_checkpoint: repository.startingCheckpoint,
      state: "prepared",
    }));
    try {
      await journal.append(intent.preparedEvent);
    } catch (error) {
      return failure("workspace_preparation_record_failed", "Workspaces were prepared, but Kepler could not append the exact saved preparation event.", {
        mission_id: intent.missionId,
        event_id: intent.preparedEvent.id,
        repositories: workspaceResult.repositories.map((repository) => repository.repositoryId),
        partial_effects: partialEffects,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Keep all prepared resources and the exact journal tail; retry this same mission without resetting or republishing Git state."));
    }
    try {
      history = await this.runtime.recovery.readHistory(intent.recordHomeRoot, intent.missionId);
    } catch (error) {
      return failure("mission_history_read_failed", "Kepler could not validate the exact preparation append.", {
        mission_id: intent.missionId,
        event_id: intent.preparedEvent.id,
        partial_effects: partialEffects,
        message: error instanceof Error ? error.message : String(error),
      }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve the prepared event and resources; resolve complete-history validation before retrying."));
    }
    state = validatedStartupHistory(history, intent);
    if ("kind" in state) return state;
    if (!state.prepared) return failure("mission_preparation_fact_missing", "The exact workspace-prepared append did not become validated history.", {
      mission_id: intent.missionId,
      event_id: intent.preparedEvent.id,
      partial_effects: partialEffects,
    }, continueRecovery(intent.missionId, intent.recordHomeRoot, "Preserve prepared resources and recover the exact pending preparation event before starting any stage."));
    return {
      kind: "prepared",
      missionId: intent.missionId,
      recordHome: intent.recordHomeRoot,
      historical: false,
      repositories: workspaceResult.repositories,
    };
  }
}
