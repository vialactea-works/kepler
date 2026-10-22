import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  GitAuthorLookup,
} from "../git-author.js";
import { createEventJournal } from "../../history/journal.js";
import { CONSTRUCTION_PHASE } from "../../construction/events.js";
import { MissionStartup } from "../../construction/mission-startup.js";
import { UnitCreate } from "../../construction/unit-create.js";
import { UnitQueries } from "../../construction/unit-queries.js";
import { ConstructionQueries } from "../../construction/scoped-queries.js";
import { ConstructionLint } from "../../construction/construction-lint.js";
import { createNodeUnitQueryFileSystem } from "../../construction/unit-queries-runtime.js";
import { createNodeUnitCreateRecords, machineLocalDate } from "../../construction/unit-create-runtime.js";
import {
  createNodeFunctionalDesignStageCompletionRuntime,
  FunctionalDesignStageCompletion,
} from "../../construction/stage-completion.js";
import {
  createNodeQualityStageCompletionRuntime,
  QualityRequirementsStageCompletion,
} from "../../construction/quality-stage-completion.js";
import { MissionHandoffPreflight } from "../../construction/mission-handoff-preflight.js";
import { createNodeStageStartRuntime, StageStart } from "../../construction/stage-start.js";
import { AuditContextResolver, createNodeAuditContextRuntime } from "../../audit/context.js";
import { AuditRecording } from "../../audit/recording.js";
import { AuditRequestInput } from "../../audit/request-input.js";
import { AuditQueries } from "../../audit/queries.js";
import { createMissionWorkspacePreparation } from "../../construction/mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "../../construction/mission-workspace-runtime.js";
import { MetadataLinter } from "../metadata-lint.js";
import { PROJECT_SELECTION_RUNTIME, ProjectSelectionModule } from "../project-selection.module.js";
import {
  ProjectResolver,
  type ProjectSelectionRuntime,
} from "../project-selection.js";
import {
  AuditCommand,
  AuditRecordCommandGroup,
  AuditRecordEvidenceCommand,
  AuditRecordApprovalCommand,
  AuditRecordInteractionCommand,
  AuditListCommand,
  AuditShowCommand,
  ConstructionCommand,
  ConstructionStageCommand,
  ConstructionStageShowCommand,
  ConstructionTaskCommand,
  ConstructionTaskListCommand,
  ConstructionTaskShowCommand,
  ConstructionTaskReadyCommand,
  ConstructionActivityCommand,
  ConstructionActivityShowCommand,
  ConstructionLintCommand,
  ConstructionUnitCommand,
  ConstructionUnitCreateCommand,
  ConstructionUnitListCommand,
  ConstructionUnitShowCommand,
  ConstructionStageCompleteCommand,
  ConstructionStageStartCommand,
  GitAuthorCommand,
  GitCommand,
  MetadataLintCommand,
  MissionCommand,
  MissionCreateCommand,
  UuidCommand,
  WorkflowCommand,
} from "./capability.commands.js";
import { ResultModule } from "./result.module.js";

const packageMetadata: unknown = createRequire(import.meta.url)("../../../package.json");
const cliVersion = typeof packageMetadata === "object" && packageMetadata !== null &&
  "version" in packageMetadata && typeof packageMetadata.version === "string"
  ? packageMetadata.version
  : "unavailable";

@Module({
  imports: [ResultModule, ProjectSelectionModule],
  providers: [
    GitCommand,
    GitAuthorCommand,
    UuidCommand,
    MetadataLintCommand,
    AuditCommand,
    AuditRecordCommandGroup,
    AuditRecordEvidenceCommand,
    AuditRecordApprovalCommand,
    AuditRecordInteractionCommand,
    AuditRequestInput,
    AuditListCommand,
    AuditShowCommand,
    WorkflowCommand,
    ConstructionCommand,
    ConstructionStageCommand,
    ConstructionStageShowCommand,
    ConstructionTaskCommand,
    ConstructionTaskListCommand,
    ConstructionTaskShowCommand,
    ConstructionTaskReadyCommand,
    ConstructionActivityCommand,
    ConstructionActivityShowCommand,
    ConstructionLintCommand,
    ConstructionUnitCommand,
    ConstructionUnitCreateCommand,
    ConstructionUnitListCommand,
    ConstructionUnitShowCommand,
    ConstructionStageCompleteCommand,
    ConstructionStageStartCommand,
    FunctionalDesignStageCompletion,
    QualityRequirementsStageCompletion,
    StageStart,
    MissionCommand,
    MissionCreateCommand,
    {
      provide: AuditContextResolver,
      useFactory: (projects: ProjectResolver) => new AuditContextResolver(createNodeAuditContextRuntime(projects)),
      inject: [ProjectResolver],
    },
    {
      provide: AuditQueries,
      useFactory: (contexts: AuditContextResolver) => new AuditQueries(contexts),
      inject: [AuditContextResolver],
    },
    {
      provide: FunctionalDesignStageCompletion,
      useFactory: (contexts: AuditContextResolver) => new FunctionalDesignStageCompletion(
        contexts,
        createNodeFunctionalDesignStageCompletionRuntime({ name: "kepler", version: cliVersion }),
      ),
      inject: [AuditContextResolver],
    },
    {
      provide: QualityRequirementsStageCompletion,
      useFactory: (contexts: AuditContextResolver) => new QualityRequirementsStageCompletion(
        contexts,
        createNodeQualityStageCompletionRuntime({ name: "kepler", version: cliVersion }),
      ),
      inject: [AuditContextResolver],
    },
    {
      provide: StageStart,
      useFactory: (contexts: AuditContextResolver) => new StageStart(
        contexts,
        createNodeStageStartRuntime({ name: "kepler", version: cliVersion }),
      ),
      inject: [AuditContextResolver],
    },
    {
      provide: AuditRecording,
      useFactory: (contexts: AuditContextResolver) => new AuditRecording(contexts, {
        identities: { next: randomUUID },
        now: () => new Date().toISOString(),
        producer: { name: "kepler", version: cliVersion },
      }),
      inject: [AuditContextResolver],
    },
    {
      provide: MissionHandoffPreflight,
      useFactory: () => new MissionHandoffPreflight(createNodeMissionWorkspaceRuntime()),
    },
    {
      provide: UnitCreate,
      useFactory: (projects: ProjectResolver) => new UnitCreate({
        projects: { resolve: (project) => projects.resolve(project) },
        workspace: createNodeMissionWorkspaceRuntime(),
        records: createNodeUnitCreateRecords(),
        journals: {
          create: (recordHome, missionId, journalId) => createEventJournal({
            recordHome,
            missionId,
            journalId,
            phase: CONSTRUCTION_PHASE,
          }),
        },
        identities: { next: randomUUID },
        today: machineLocalDate,
        now: () => new Date().toISOString(),
        producer: { name: "kepler", version: cliVersion },
      }),
      inject: [ProjectResolver],
    },
    {
      provide: UnitQueries,
      useFactory: (projects: ProjectResolver) => new UnitQueries(projects, createNodeUnitQueryFileSystem()),
      inject: [ProjectResolver],
    },
    {
      provide: ConstructionQueries,
      useFactory: (units: UnitQueries) => new ConstructionQueries(units, createNodeUnitQueryFileSystem()),
      inject: [UnitQueries],
    },
    {
      provide: ConstructionLint,
      useFactory: (units: UnitQueries) => new ConstructionLint(units, createNodeUnitQueryFileSystem()),
      inject: [UnitQueries],
    },
    {
      provide: MissionStartup,
      useFactory: (projects: ProjectResolver) => new MissionStartup({
        projects: { resolve: (project) => projects.resolve(project) },
        workspaces: createMissionWorkspacePreparation(createNodeMissionWorkspaceRuntime()),
        journals: {
          create: (recordHome, missionId, journalId) => createEventJournal({
            recordHome,
            missionId,
            journalId,
            phase: CONSTRUCTION_PHASE,
          }),
        },
        identities: { next: randomUUID },
        now: () => new Date().toISOString(),
        producer: { name: "kepler", version: cliVersion },
      }),
      inject: [ProjectResolver],
    },
    {
      provide: GitAuthorLookup,
      useFactory: (
        projects: ProjectResolver,
        runtime: ProjectSelectionRuntime,
      ) => new GitAuthorLookup(projects, runtime.git),
      inject: [ProjectResolver, PROJECT_SELECTION_RUNTIME],
    },
    {
      provide: MetadataLinter,
      useFactory: () => new MetadataLinter(),
    },
  ],
})
export class CapabilityModule {}
