import * as Path from "node:path";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "@vialactea-works/kepler-core";
import type { EventJournal } from "../history/journal.js";
import type { ProjectSelectionResult } from "../cli/project-selection.js";
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
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly localWorkspaceKey: string;
  readonly workspacePath: string;
  readonly workspaceKind: "existing" | "new" | "previous";
  readonly sourcePath: string;
  readonly baseCommit?: string;
  readonly recordHomeRepositoryId: string;
  readonly recordHomeCommonDirectory: string;
  readonly initialDirtyPaths?: readonly string[];
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

export interface MissionWorkspacePreparation {
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
  readonly journals: MissionJournalFactory;
  readonly identities: MissionStartupIdentitySource;
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
}

export interface MissionStartupPrepared {
  readonly kind: "prepared";
  readonly missionId: MissionId;
  readonly recordHome: string;
  readonly repositories: readonly PreparedMissionRepository[];
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

const isUuidV4 = (value: string): boolean =>
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

    let inspected: MissionWorkspaceInspectionResult;
    try {
      inspected = await this.runtime.workspaces.inspect(selectedProject.root, validated.request);
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

    let journal: EventJournal;
    try {
      journal = this.runtime.journals.create(selectedProject.root, missionId as MissionId, journalId as JournalId);
      const expectedJournalPath = Path.resolve(
        selectedProject.root,
        ".kepler",
        "missions",
        missionId,
        "history",
        CONSTRUCTION_PHASE,
        `${journalId}.jsonl`,
      );
      if (!Path.isAbsolute(journal.path) || Path.resolve(journal.path) !== expectedJournalPath) {
        return failure("mission_journal_path_invalid", "Mission history must use its selected record-home journal path.", {
          mission_id: missionId,
          journal_path: journal.path,
          expected_path: expectedJournalPath,
        });
      }
      await journal.append(created);
    } catch (error) {
      return failure(
        "mission_record_failed",
        "Kepler could not durably record mission creation before workspace preparation.",
        { mission_id: missionId, message: error instanceof Error ? error.message : String(error) },
        "Inspect the mission history for an appended or uncertain creation fact before retrying; do not delete partial records.",
      );
    }

    let prepared: MissionWorkspacePreparationResult;
    try {
      prepared = await this.runtime.workspaces.prepare(
        selectedProject.root,
        missionId as MissionId,
        confirmedInspected,
        { missionJournalPath: journal.path },
      );
    } catch (error) {
      return failure(
        "workspace_preparation_failed",
        "Mission creation was recorded, but workspace preparation did not complete.",
        { mission_id: missionId, message: error instanceof Error ? error.message : String(error) },
        "Keep the recorded mission and any created resources. Reconcile their actual state before retrying; no stage was started and no rollback was attempted.",
      );
    }
    if (prepared.kind === "failed") {
      return failure(
        prepared.code,
        prepared.message,
        { mission_id: missionId, ...prepared.details },
        prepared.recovery,
      );
    }

    const preparedById = new Map(prepared.repositories.map((repository) => [repository.repositoryId, repository]));
    const orderedPrepared = validated.request.repositories.map((selection) => preparedById.get(selection.repositoryId));
    if (prepared.repositories.length !== confirmedInspected.length ||
      preparedById.size !== prepared.repositories.length ||
      orderedPrepared.some((repository, index) => {
        const expected = confirmedInspected[index]!;
        return repository === undefined ||
          !sameContext(repository.context, expected.context) ||
          repository.branch !== expected.resolvedBranch ||
          repository.integrationTarget !== expected.integrationTarget ||
          !sameCheckpoint(repository.startingCheckpoint, expected.startingCheckpoint) ||
          repository.localWorkspaceKey !== expected.localWorkspaceKey ||
          !nonEmptyString(repository.workspacePath);
      })) {
      return failure(
        "workspace_preparation_inconsistent",
        "Workspace preparation did not verify every selected binding.",
        {
          mission_id: missionId,
          prepared_repository_ids: prepared.repositories.map((repository) => repository.repositoryId),
          partial_effects: prepared.repositories.map((repository) => ({
            repository_id: repository.repositoryId,
            workspace_path: repository.workspacePath,
            workspace_id: repository.localWorkspaceKey,
            branch: repository.branch,
            integration_target: repository.integrationTarget,
            starting_checkpoint: repository.startingCheckpoint,
            state: "prepared",
          })),
        },
        "Keep the prepared resources and reconcile their actual state before starting any stage.",
      );
    }
    const confirmedPrepared = orderedPrepared as PreparedMissionRepository[];
    const preparedEffects = confirmedPrepared.map((repository) => ({
      repository_id: repository.repositoryId,
      workspace_path: repository.workspacePath,
      workspace_id: repository.localWorkspaceKey,
      branch: repository.branch,
      integration_target: repository.integrationTarget,
      starting_checkpoint: repository.startingCheckpoint,
      state: "prepared",
    }));
    const preparedData: MissionWorkspacePreparedData = {
      mission_id: missionId as MissionId,
      repositories: confirmedPrepared.map((repository) => ({
        repository_id: repository.repositoryId,
        context: repository.context,
        branch: repository.branch,
        integration_target: repository.integrationTarget,
        starting_checkpoint: repository.startingCheckpoint,
      })),
    };
    const preparedEvent = envelope(
      preparedEventId,
      journalId,
      this.runtime.now(),
      this.runtime.producer,
      "construction.mission-workspaces-prepared",
      preparedData,
      [createdEventId],
    );
    const preparedValidation = validateConstructionEvent(preparedEvent);
    if (preparedValidation.status !== "valid") {
      return failure(
        "invalid_prepared_mission_event",
        "Workspace preparation completed, but its typed completion event failed validation.",
        {
          mission_id: missionId,
          status: preparedValidation.status,
          issues: preparedValidation.status === "invalid" ? preparedValidation.issues : [],
          partial_effects: preparedEffects,
        },
        "Keep all prepared resources and reconcile the missing history fact before starting any stage.",
      );
    }

    try {
      await journal.append(preparedEvent);
    } catch (error) {
      return failure(
        "workspace_preparation_record_failed",
        "Workspaces were prepared, but Kepler could not durably record the usable binding.",
        {
          mission_id: missionId,
          repositories: confirmedPrepared.map((repository) => repository.repositoryId),
          partial_effects: preparedEffects,
          message: error instanceof Error ? error.message : String(error),
        },
        "Keep the prepared resources and reconcile their history before starting any stage; Kepler did not roll back or publish Git state.",
      );
    }

    return {
      kind: "prepared",
      missionId: missionId as MissionId,
      recordHome: selectedProject.root,
      repositories: confirmedPrepared,
    };
  }
}
