import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  GitAuthorLookup,
} from "../git-author.js";
import { createEventJournal } from "../../history/journal.js";
import { CONSTRUCTION_PHASE } from "../../construction/events.js";
import { MissionStartup } from "../../construction/mission-startup.js";
import { MissionHandoffPreflight } from "../../construction/mission-handoff-preflight.js";
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
  ConstructionCommand,
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
    WorkflowCommand,
    ConstructionCommand,
    MissionCommand,
    MissionCreateCommand,
    {
      provide: MissionHandoffPreflight,
      useFactory: () => new MissionHandoffPreflight(createNodeMissionWorkspaceRuntime()),
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
