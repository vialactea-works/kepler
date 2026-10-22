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

export interface UnitCreateInspection {
  readonly kind: "inspected";
  readonly mission?: { readonly id: string; readonly workflow: string; readonly prepared: boolean };
  readonly unitIds: readonly string[];
}

export type UnitCreateInspectionResult = UnitCreateInspection | UnitCreateFailure;

export type UnitCreateDirectoryResult =
  | { readonly kind: "created" }
  | { readonly kind: "exists" }
  | UnitCreateFailure;

export interface UnitCreateRecords {
  readonly inspect: (recordHome: string, missionId: MissionId) => Promise<UnitCreateInspectionResult>;
  readonly createDirectory: (recordHome: string, missionId: MissionId, unitId: string) => Promise<UnitCreateDirectoryResult>;
}

export interface UnitCreateJournalFactory {
  readonly create: (recordHome: string, missionId: MissionId, journalId: JournalId) => EventJournal;
}

export interface UnitCreateRuntime {
  readonly projects: { readonly resolve: (project?: string) => Promise<ProjectSelectionResult> };
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
  required = false,
): string | undefined => {
  if (value === undefined) {
    if (required) issues.push(issue(`/${name}`, `--${name} is required.`));
    return undefined;
  }
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
  const selectedMission = selectedValue(value.mission, "mission", issues, true);
  if (selectedMission !== undefined && !uuidV4.test(selectedMission)) {
    issues.push(issue("/mission", "--mission requires one full lowercase UUIDv4."));
  }

  const selectedEffort = selectedValue(value.effort, "effort", issues);
  const effort = selectedEffort === undefined ? "standard" : selectedEffort;
  if (!effortLevels.has(effort as EffortLevel)) {
    issues.push(issue("/effort", "Effort must be minimal, standard, or comprehensive."));
  }

  const rawStageEffort = value.stageEffort;
  const stageOptions = rawStageEffort === undefined
    ? []
    : Array.isArray(rawStageEffort) ? rawStageEffort : [rawStageEffort];
  const stageEffort: Partial<Record<ConstructionStage, EffortLevel>> = {};
  for (const [index, option] of stageOptions.entries()) {
    if (typeof option !== "string") {
      issues.push(issue(`/stageEffort/${index}`, "Stage effort must use <stage>=<level>."));
      continue;
    }
    const parts = option.split("=");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      issues.push(issue(`/stageEffort/${index}`, "Stage effort must use exactly <stage>=<level>."));
      continue;
    }
    const stage = parts[0]!;
    const level = parts[1]!;
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

    let inspected: UnitCreateInspectionResult;
    try {
      inspected = await this.runtime.records.inspect(selectedProject.root, request.missionId);
    } catch (error) {
      return failure("unit_history_read_failed", "Kepler could not inspect record-home mission and unit identities.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (inspected.kind === "failed") return inspected;
    if (!inspected.mission || inspected.mission.id !== request.missionId) {
      return failure("mission_not_found", "The selected mission has no creation record in this record home.", {
        mission_id: request.missionId,
        record_home: selectedProject.root,
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
    if (inspected.unitIds.includes(unitId)) {
      return failure("unit_id_conflict", "The generated unit ID is already known in this project.", {
        unit_id: unitId,
      }, "Choose a different slug or reconcile the existing unit directory and history.");
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

    const directory = expectedDirectory(unitId);
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
      journal = this.runtime.journals.create(selectedProject.root, request.missionId, journalId as JournalId);
    } catch (error) {
      return failure("unit_journal_unavailable", "Kepler could not prepare the unit's Construction journal.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const expectedPath = expectedJournalPath(selectedProject.root, request.missionId, journalId);
    if (!Path.isAbsolute(journal.path) || Path.resolve(journal.path) !== expectedPath) {
      return failure("unit_journal_path_invalid", "Unit history must use its selected record-home journal path.", {
        journal_path: journal.path,
        expected_path: expectedPath,
      });
    }

    let directoryResult: UnitCreateDirectoryResult;
    try {
      directoryResult = await this.runtime.records.createDirectory(selectedProject.root, request.missionId, unitId);
    } catch (error) {
      return failure("unit_directory_creation_failed", "Kepler could not create the unit directory.", {
        unit_id: unitId,
        directory,
        message: error instanceof Error ? error.message : String(error),
      }, "Inspect the unit path and record-home history before retrying; do not remove uncertain work.");
    }
    if (directoryResult.kind === "failed") return directoryResult;
    if (directoryResult.kind === "exists") {
      return failure("unit_directory_exists", "The destination unit directory already exists.", {
        unit_id: unitId,
        directory,
      }, "Inspect the existing directory and history; do not adopt or overwrite it.");
    }

    try {
      await journal.append(eventValidation.event);
    } catch (error) {
      return failure("unit_record_failed", "The unit directory was created, but its creation fact was not confirmed durable.", {
        unit_id: unitId,
        directory_created: true,
        journal_path: journal.path,
        message: error instanceof Error ? error.message : String(error),
      }, "Keep the directory and any partial journal bytes. Reconcile actual effects before retrying.");
    }

    return {
      kind: "created",
      unitId,
      missionId: request.missionId,
      recordHome: selectedProject.root,
      directory,
      workflow: "standard",
      effort: { default: request.effort, stageOverrides: request.stageEffort },
      journalId,
      eventId,
    };
  }
}
