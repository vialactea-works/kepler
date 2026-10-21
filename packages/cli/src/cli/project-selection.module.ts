import { Module } from "@nestjs/common";
import { createProjectSelectionRuntime } from "./project-selection-runtime.js";
import {
  ProjectResolver,
  type ProjectSelectionRuntime,
} from "./project-selection.js";

export const PROJECT_SELECTION_RUNTIME = Symbol("PROJECT_SELECTION_RUNTIME");

@Module({
  providers: [
    {
      provide: PROJECT_SELECTION_RUNTIME,
      useFactory: createProjectSelectionRuntime,
    },
    {
      provide: ProjectResolver,
      useFactory: (runtime: ProjectSelectionRuntime) => new ProjectResolver(runtime),
      inject: [PROJECT_SELECTION_RUNTIME],
    },
  ],
  exports: [PROJECT_SELECTION_RUNTIME, ProjectResolver],
})
export class ProjectSelectionModule {}
