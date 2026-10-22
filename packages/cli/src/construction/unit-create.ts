import { createHash } from "node:crypto";
import * as Path from "node:path";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "@vialactea-works/kepler-core";
import { parseProjectSelector, type ProjectSelectionResult } from "../cli/project-selection.js";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  CONSTRUCTION_STAGES,
  validateConstructionEvent,
  type ConstructionStage,
  type EffortLevel,
  type MissionId,
  type UnitCreatedData,
  type UnitId,
} from "./events.js";
import type { EventJournal } from "../history/journal.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";

export interface UnitCreateRequest {
  readonly slug: string;
  readonly missionId: MissionId;
  readonly effort: EffortLevel;
  readonly stageEffort: Readonly<Partial<Record<ConstructionStage, EffortLevel>>>;
  readonly project?: string;
}

export interface UnitCreateRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

export type UnitCreateRequestValidation =
  | { readonly kind: "valid"; readonly request: UnitCreateRequest }
  | { readonly kind: "invalid"; readonly issues: readonly UnitCreateRequestIssue[] };

export interface UnitCreateFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export interface UnitCreateRecordedFact {
  readonly unitId: string;
  readonly missionId: string;
  readonly recordHome: string;
  readonly directory: string;
  readonly workflow: string;
  readonly effort: {
    readonly default: string;
    readonly stageOverrides: Readonly<Record<string, string>>;
    readonly selectedBy: string;
  };
  readonly journalId: string;
  readonly eventId: string;
}

export interface UnitCreateKnownPath {
  readonly unitId: string;
  readonly missionId?: string;
  readonly recordHome: string;
  readonly directory: string;
  readonly pathKind: "directory" | "file" | "other";
}

export interface UnitCreateInspection {
  readonly kind: "inspected";
  readonly mission?: { readonly id: string; readonly workflow: string; readonly prepared: boolean };
  readonly unitIds: readonly string[];
  readonly unitPaths: readonly UnitCreateKnownPath[];
  readonly unitFacts: readonly UnitCreateRecordedFact[];
}

export type UnitCreateInspectionResult = UnitCreateInspection | UnitCreateFailure;

export type UnitCreateDirectoryResult =
  | { readonly kind: "created" }
  | { readonly kind: "exists" }
  | UnitCreateFailure;

export interface UnitCreateRecords {
  readonly inspect: (recordHomes: readonly string[], selectedRecordHome: string, missionId: MissionId) => Promise<UnitCreateInspectionResult>;
  readonly createDirectory: (recordHome: string, missionId: MissionId, unitId: string) => Promise<UnitCreateDirectoryResult>;
}

export interface UnitCreateJournalFactory {
  readonly create: (recordHome: string, missionId: MissionId, journalId: JournalId) => EventJournal;
}

export interface UnitCreateRuntime {
  readonly projects: { readonly resolve: (project?: string) => Promise<ProjectSelectionResult> };
  readonly workspace: MissionWorkspaceRuntime;
  readonly records: UnitCreateRecords;
  readonly journals: UnitCreateJournalFactory;
  readonly identities: { readonly next: () => string };
  readonly today: () => string;
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
}

export interface UnitCreateCreated {
  readonly kind: "created";
  readonly unitId: string;
  readonly missionId: MissionId;
  readonly recordHome: string;
  readonly directory: string;
  readonly workflow: "standard";
  readonly effort: {
    readonly default: EffortLevel;
    readonly stageOverrides: Readonly<Partial<Record<ConstructionStage, EffortLevel>>>;
  };
  readonly journalId: string;
  readonly eventId: string;
}

export type UnitCreateResult = UnitCreateCreated | UnitCreateFailure;

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const effortLevels = new Set<EffortLevel>(["minimal", "standard", "comprehensive"]);
const stages = new Set<string>(CONSTRUCTION_STAGES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (pointer: string, message: string): UnitCreateRequestIssue => ({ pointer, message });

const selectedValue = (
  value: unknown,
  name: string,
  issues: UnitCreateRequestIssue[],
): string | undefined => {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 1) {
    issues.push(issue(`/${name}`, `--${name} may be specified only once.`));
    return undefined;
  }
  const selected = values[0];
  if (typeof selected !== "string" || selected.length === 0 || selected.trim() !== selected) {
    issues.push(issue(`/${name}`, `--${name} requires one non-empty exact value.`));
    return undefined;
  }
  return selected;
};

const requiredSelectedValue = (
  value: unknown,
  name: string,
  issues: UnitCreateRequestIssue[],
): string | undefined => {
  const selected = selectedValue(value, name, issues);
  if (value === undefined) issues.push(issue(`/${name}`, `--${name} is required.`));
  return selected;
};

const validLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Correct the reported condition or reconcile the actual unit records before retrying.",
): UnitCreateFailure => ({ kind: "failed", code, message, details, recovery });

export const validateUnitCreateRequest = (value: unknown): UnitCreateRequestValidation => {
  if (!isRecord(value)) {
    return { kind: "invalid", issues: [issue("", "Expected a unit-create request object.")] };
  }
  const allowed = ["slug", "mission", "effort", "stageEffort", "project"];
  const issues: UnitCreateRequestIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(`/${key}`, "Unknown unit-create request field."));
  }

  const slug = value.slug;
  if (typeof slug !== "string" || !slugPattern.test(slug)) {
    issues.push(issue("/slug", "Slug must contain lowercase words separated by single hyphens."));
  }
  const selectedMission = requiredSelectedValue(value.mission, "mission", issues);
  if (selectedMission !== undefined && !uuidV4.test(selectedMission)) {
    issues.push(issue("/mission", "--mission requires one full lowercase UUIDv4."));
  }

  const selectedEffort = selectedValue(value.effort, "effort", issues);
  const effort = selectedEffort === undefined ? "standard" : selectedEffort;
  if (!effortLevels.has(effort as EffortLevel)) {
    issues.push(issue("/effort", "Effort must be minimal, standard, or comprehensive."));
  }

  const rawStageEffort = value.stageEffort;
  let stageOptions: unknown[] = [];
  if (Array.isArray(rawStageEffort)) stageOptions = rawStageEffort;
  else if (rawStageEffort !== undefined) stageOptions = [rawStageEffort];
  const stageEffort: Partial<Record<ConstructionStage, EffortLevel>> = {};
  for (const [index, option] of stageOptions.entries()) {
    if (typeof option !== "string") {
      issues.push(issue(`/stageEffort/${index}`, "Stage effort must use <stage>=<level>."));
      continue;
    }
    const [stage, level, ...extra] = option.split("=");
    if (!stage || !level || extra.length > 0) {
      issues.push(issue(`/stageEffort/${index}`, "Stage effort must use exactly <stage>=<level>."));
      continue;
    }
    if (!stages.has(stage)) {
      issues.push(issue(`/stageEffort/${index}`, `Unsupported Construction stage '${stage}'.`));
      continue;
    }
    if (Object.hasOwn(stageEffort, stage)) {
      issues.push(issue(`/stageEffort/${index}`, `Stage '${stage}' may be overridden only once.`));
      continue;
    }
    if (!effortLevels.has(level as EffortLevel)) {
      issues.push(issue(`/stageEffort/${index}`, `Invalid effort level '${level}'.`));
      continue;
    }
    stageEffort[stage as ConstructionStage] = level as EffortLevel;
  }

  const projectSelector = parseProjectSelector(value.project);
  if (projectSelector.kind === "failed") {
    issues.push(issue("/project", projectSelector.message));
  }
  if (issues.length > 0 || typeof slug !== "string" || selectedMission === undefined || !uuidV4.test(selectedMission)) {
    return { kind: "invalid", issues };
  }
  return {
    kind: "valid",
    request: {
      slug,
      missionId: selectedMission as MissionId,
      effort: effort as EffortLevel,
      stageEffort,
      ...(projectSelector.kind === "parsed" && projectSelector.project !== undefined
        ? { project: projectSelector.project }
        : {}),
    },
  };
};

const expectedJournalPath = (recordHome: string, missionId: string, journalId: string): string =>
  Path.resolve(recordHome, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${journalId}.jsonl`);

const expectedDirectory = (unitId: string): string => `construction/units-of-work/${unitId}`;

interface UnitCreateWorkspaceScope {
  readonly commonDirectory: string;
  readonly recordHomes: readonly string[];
}

const resolveWorkspaceScope = async (
  runtime: UnitCreateRuntime,
  selectedRoot: string,
): Promise<UnitCreateWorkspaceScope | UnitCreateFailure> => {
  const commonResult = await runtime.workspace.git.run(selectedRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (commonResult.status !== 0 || commonResult.stdout.trim().length === 0) {
    return failure("unit_project_inspection_failed", "Git could not resolve the record-home common directory.", {
      repository_root: selectedRoot,
      stderr: commonResult.stderr.trim(),
    });
  }
  let commonDirectory: string;
  try {
    commonDirectory = await runtime.workspace.fileSystem.realpath(Path.resolve(selectedRoot, commonResult.stdout.trim()));
  } catch (error) {
    return failure("unit_project_inspection_failed", "Kepler could not resolve the canonical Git common directory.", {
      repository_root: selectedRoot,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const worktreesResult = await runtime.workspace.git.run(selectedRoot, ["worktree", "list", "--porcelain", "-z"]);
  if (worktreesResult.status !== 0) {
    return failure("unit_project_inspection_failed", "Git could not enumerate record-home worktrees for project-wide unit identity checks.", {
      repository_root: selectedRoot,
      stderr: worktreesResult.stderr.trim(),
    });
  }
  const rawWorktrees = worktreesResult.stdout.split("\0\0").flatMap((block) => {
    const field = block.split("\0").find((value) => value.startsWith("worktree "));
    return field ? [field.slice("worktree ".length)] : [];
  });
  if (rawWorktrees.length === 0) {
    return failure("unit_project_inspection_failed", "Git returned no worktrees for the selected record home.", {
      repository_root: selectedRoot,
    });
  }
  const recordHomes = new Set<string>();
  try {
    const canonicalSelectedRoot = await runtime.workspace.fileSystem.realpath(selectedRoot);
    recordHomes.add(canonicalSelectedRoot);
    let selectedRootFound = false;
    for (const worktree of rawWorktrees) {
      const candidate = Path.isAbsolute(worktree) ? worktree : Path.resolve(selectedRoot, worktree);
      if (await runtime.workspace.fileSystem.pathKind(candidate) !== "directory") {
        return failure("unit_project_inspection_failed", "A linked worktree is unavailable, so project-wide unit IDs cannot be verified.", {
          worktree: candidate,
        });
      }
      const canonical = await runtime.workspace.fileSystem.realpath(candidate);
      if (canonical === canonicalSelectedRoot) selectedRootFound = true;
      recordHomes.add(canonical);
    }
    if (!selectedRootFound) {
      return failure("unit_project_inspection_failed", "Git's worktree list does not contain the selected record home.", {
        repository_root: canonicalSelectedRoot,
      });
    }
  } catch (error) {
    return failure("unit_project_inspection_failed", "Kepler could not resolve every linked worktree for project-wide unit identity checks.", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return { commonDirectory, recordHomes: [...recordHomes] };
};

const sameStageOverrides = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Partial<Record<ConstructionStage, EffortLevel>>>,
): boolean => {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
};

export class UnitCreate {
  constructor(private readonly runtime: UnitCreateRuntime) {}

  async execute(input: unknown): Promise<UnitCreateResult> {
    const validated = validateUnitCreateRequest(input);
    if (validated.kind === "invalid") {
      return failure(
        "invalid_unit_request",
        "Unit creation request is invalid.",
        { issues: validated.issues },
        "Correct the slug, mission, effort, and project selectors before retrying.",
      );
    }
    const request = validated.request;

    let selectedProject: ProjectSelectionResult;
    try {
      selectedProject = await this.runtime.projects.resolve(request.project);
    } catch (error) {
      return failure("project_resolution_failed", "Kepler could not resolve the selected unit record home.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (selectedProject.kind === "failed") return selectedProject;

    let today: string;
    try {
      today = this.runtime.today();
    } catch (error) {
      return failure("unit_date_unavailable", "Kepler could not determine the machine-local creation date.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!validLocalDate(today)) {
      return failure("unit_date_invalid", "The machine-local creation date is invalid.", { date: today });
    }
    const unitId = `${today}-${request.slug}`;

    let scope: UnitCreateWorkspaceScope | UnitCreateFailure;
    try {
      scope = await resolveWorkspaceScope(this.runtime, selectedProject.root);
    } catch (error) {
      return failure("unit_project_inspection_failed", "Kepler could not inspect the selected project's Git worktrees.", {
        repository_root: selectedProject.root,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if ("kind" in scope) return scope;

    let acquired: Awaited<ReturnType<MissionWorkspaceRuntime["coordination"]["acquire"]>>;
    try {
      acquired = await this.runtime.workspace.coordination.acquire({
        commonDirectory: scope.commonDirectory,
        location: { kind: "code-workspace" },
        resourceKey: createHash("sha256").update(JSON.stringify(["construction-unit-create", unitId])).digest("hex"),
        owner: {
          machine_id: this.runtime.workspace.identity.machine_id,
          process_id: this.runtime.workspace.identity.process_id,
          process_incarnation_id: this.runtime.workspace.identity.process_incarnation_id,
          mission_id: request.missionId,
          resource_scope: `construction/unit-create/${unitId}`,
        },
      });
    } catch (error) {
      return failure("unit_coordination_failed", "Kepler could not acquire project-wide unit creation coordination.", {
        unit_id: unitId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (acquired.kind === "failed") return acquired;

    let result: UnitCreateResult;
    try {
      result = await this.createUnderLease(request, selectedProject.root, scope.recordHomes, unitId);
    } catch (error) {
      result = failure("unit_creation_failed", "Kepler could not reconcile or create the unit safely.", {
        unit_id: unitId,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve all unit paths and journal bytes, then reconcile them before retrying.");
    }

    try {
      const released = await acquired.lease.release();
      if (released.kind === "failed") {
        return failure("unit_coordination_release_failed", "Unit creation finished, but project-wide coordination could not be released safely.", {
          unit_id: unitId,
          creation_result: result.kind,
          ...(result.kind === "failed" ? { creation_failure: result.code } : { event_id: result.eventId }),
          release_failure: released.code,
          release_details: released.details,
        }, "Preserve the coordination artifacts and reconcile their current owner before retrying.");
      }
    } catch (error) {
      return failure("unit_coordination_release_failed", "Unit creation finished, but project-wide coordination could not be released safely.", {
        unit_id: unitId,
        creation_result: result.kind,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve the coordination artifacts and reconcile their current owner before retrying.");
    }
    return result;
  }

  private async createUnderLease(
    request: UnitCreateRequest,
    selectedRoot: string,
    recordHomes: readonly string[],
    unitId: string,
  ): Promise<UnitCreateResult> {
    let inspected: UnitCreateInspectionResult;
    try {
      inspected = await this.runtime.records.inspect(recordHomes, selectedRoot, request.missionId);
    } catch (error) {
      return failure("unit_history_read_failed", "Kepler could not inspect record-home mission and unit identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (inspected.kind === "failed") return inspected;
    if (!inspected.mission || inspected.mission.id !== request.missionId) {
      return failure("mission_not_found", "The selected mission has no creation record in this record home.", {
        mission_id: request.missionId,
        record_home: selectedRoot,
      }, "Select an existing mission recorded in this record home.");
    }
    if (inspected.mission.workflow !== "standard") {
      return failure("mission_workflow_mismatch", "The selected mission is not bound to the Standard workflow.", {
        mission_id: request.missionId,
        workflow: inspected.mission.workflow,
      }, "Select a mission with the supported Standard workflow binding.");
    }
    if (!inspected.mission.prepared) {
      return failure("mission_not_prepared", "The selected mission has no successful workspace-preparation fact.", {
        mission_id: request.missionId,
      }, "Complete and reconcile mission workspace preparation before creating its unit.");
    }

    const directory = expectedDirectory(unitId);
    if (inspected.unitIds.includes(unitId)) {
      const facts = inspected.unitFacts.filter((fact) => fact.unitId === unitId);
      const paths = inspected.unitPaths.filter((path) => path.unitId === unitId);
      const fact = facts[0];
      const retryMatches = facts.length === 1 && paths.length === 0 && fact !== undefined &&
        fact.recordHome === selectedRoot && fact.missionId === request.missionId &&
        fact.directory === directory && fact.workflow === "standard" &&
        fact.effort.default === request.effort && fact.effort.selectedBy === "requester" &&
        sameStageOverrides(fact.effort.stageOverrides, request.stageEffort);
      if (retryMatches && fact) {
        const recoveredDirectory = await this.runtime.records.createDirectory(selectedRoot, request.missionId, unitId);
        if (recoveredDirectory.kind === "created") {
          return {
            kind: "created",
            unitId,
            missionId: request.missionId,
            recordHome: selectedRoot,
            directory,
            workflow: "standard",
            effort: { default: request.effort, stageOverrides: request.stageEffort },
            journalId: fact.journalId,
            eventId: fact.eventId,
          };
        }
        if (recoveredDirectory.kind === "failed") return recoveredDirectory;
      }
      return failure("unit_id_conflict", "The generated unit ID already has a directory or recorded identity that cannot be safely adopted.", {
        unit_id: unitId,
        matching_creation_facts: facts.length,
        known_paths: paths.map((path) => ({ record_home: path.recordHome, mission_id: path.missionId, directory: path.directory, path_kind: path.pathKind })),
      }, "Preserve the existing paths and history. Reconcile them explicitly or choose a different slug.");
    }

    let journalId: string;
    let eventId: string;
    try {
      journalId = this.runtime.identities.next();
      eventId = this.runtime.identities.next();
    } catch (error) {
      return failure("identity_generation_failed", "Kepler could not allocate unit-history identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!uuidV4.test(journalId) || !uuidV4.test(eventId) || journalId === eventId ||
      journalId === request.missionId || eventId === request.missionId) {
      return failure("identity_generation_failed", "Unit-history identities must be distinct lowercase UUIDv4 values.");
    }

    let recordedAt: string;
    try {
      recordedAt = this.runtime.now();
    } catch (error) {
      return failure("unit_timestamp_unavailable", "Kepler could not determine the unit creation timestamp.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const data: UnitCreatedData = {
      mission_id: request.missionId,
      unit_id: unitId as UnitId,
      directory,
      workflow: "standard",
      initial_effort: {
        default: request.effort,
        stage_overrides: request.stageEffort,
        selected_by: "requester",
      },
    };
    const event: EventEnvelope<UnitCreatedData> = {
      id: eventId as EventId,
      phase: CONSTRUCTION_PHASE,
      type: "construction.unit-created",
      envelope_version: EVENT_ENVELOPE_VERSION,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId as JournalId,
      recorded_at: recordedAt,
      producer: this.runtime.producer,
      caused_by: [],
      data,
    };
    const eventValidation = validateConstructionEvent(event);
    if (eventValidation.status !== "valid") {
      return failure("invalid_unit_event", "The unit creation fact failed its Construction event contract.", {
        status: eventValidation.status,
        issues: eventValidation.status === "invalid" ? eventValidation.issues : [],
      });
    }

    let journal: EventJournal;
    try {
      journal = this.runtime.journals.create(selectedRoot, request.missionId, journalId as JournalId);
    } catch (error) {
      return failure("unit_journal_unavailable", "Kepler could not prepare the unit's Construction journal.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const expectedPath = expectedJournalPath(selectedRoot, request.missionId, journalId);
    if (!Path.isAbsolute(journal.path) || Path.resolve(journal.path) !== expectedPath) {
      return failure("unit_journal_path_invalid", "Unit history must use its selected record-home journal path.", {
        journal_path: journal.path,
        expected_path: expectedPath,
      });
    }

    try {
      await journal.append(eventValidation.event);
    } catch (error) {
      return failure("unit_record_failed", "The unit creation fact was not confirmed durable; no unit directory was created.", {
        unit_id: unitId,
        journal_path: journal.path,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve any partial journal bytes. Reconcile actual history before retrying.");
    }

    let directoryResult: UnitCreateDirectoryResult;
    try {
      directoryResult = await this.runtime.records.createDirectory(selectedRoot, request.missionId, unitId);
    } catch (error) {
      return failure("unit_directory_creation_failed", "The unit creation fact was recorded, but its directory could not be created.", {
        unit_id: unitId,
        journal_path: journal.path,
        message: error instanceof Error ? error.message : String(error),
      }, "Preserve the creation fact and reconcile the expected unit path before retrying.");
    }
    if (directoryResult.kind === "failed") return directoryResult;
    if (directoryResult.kind === "exists") {
      return failure("unit_directory_exists", "The unit creation fact was recorded, but the expected destination path already exists.", {
        unit_id: unitId,
        directory,
        journal_path: journal.path,
      }, "Preserve the existing directory and history; reconcile them explicitly before retrying.");
    }

    return {
      kind: "created",
      unitId,
      missionId: request.missionId,
      recordHome: selectedRoot,
      directory,
      workflow: "standard",
      effort: { default: request.effort, stageOverrides: request.stageEffort },
      journalId,
      eventId,
    };
  }
}
