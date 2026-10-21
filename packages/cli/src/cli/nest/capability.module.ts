import { Module } from "@nestjs/common";
import {
  GitAuthorLookup,
} from "../git-author.js";
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
  UuidCommand,
  WorkflowCommand,
} from "./capability.commands.js";
import { ResultModule } from "./result.module.js";

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
