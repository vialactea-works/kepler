import { Module } from "@nestjs/common";
import {
  CONTEXT_RUNTIME,
  ContextService,
  createContextRuntime,
} from "../../workbench/context.js";
import { ContextCommand } from "./context.command.js";
import {
  createDiffRuntime,
  DIFF_RUNTIME,
  DiffService,
} from "../../workbench/diff.js";
import {
  ISOLATION_RUNTIME,
  IsolateService,
} from "../../workbench/isolate.js";
import {
  LINT_DEPENDENCIES,
  LintService,
  type LintDependencies,
} from "../../workbench/lint.js";
import {
  PRECONDITION_RUNTIME,
  PreconditionService,
} from "../../workbench/precondition.js";
import { createPreconditionRuntime } from "../../workbench/precondition-runtime.js";
import {
  createPrototypeRuntime,
  PROTOTYPE_RUNTIME,
  PrototypeService,
} from "../../workbench/prototype.js";
import { createRuntime } from "../../workbench/runtime.js";
import { DiffCommand } from "./diff.command.js";
import { IsolateCommand } from "./isolate.command.js";
import { LintCommand } from "./lint.command.js";
import { PreconditionCommand } from "./precondition.command.js";
import { PrototypeCommand } from "./prototype.command.js";
import { TaskStateCommand } from "./task-state.command.js";
import { TaskStateService } from "../../workbench/task-state.js";
import { createTaskStateRuntime, TASK_STATE_RUNTIME } from "../../workbench/task-state-runtime.js";
import { ResultModule } from "./result.module.js";
import { WorkbenchCommand } from "./workbench.command.js";

@Module({
  imports: [ResultModule],
  providers: [
    WorkbenchCommand,
    IsolateCommand,
    DiffCommand,
    ContextCommand,
    PreconditionCommand,
    PrototypeCommand,
    LintCommand,
    TaskStateCommand,
    IsolateService,
    DiffService,
    PreconditionService,
    ContextService,
    PrototypeService,
    LintService,
    TaskStateService,
    { provide: ISOLATION_RUNTIME, useFactory: createRuntime },
    { provide: DIFF_RUNTIME, useFactory: createDiffRuntime },
    { provide: PRECONDITION_RUNTIME, useFactory: createPreconditionRuntime },
    { provide: CONTEXT_RUNTIME, useFactory: createContextRuntime },
    { provide: TASK_STATE_RUNTIME, useFactory: createTaskStateRuntime },
    { provide: PROTOTYPE_RUNTIME, useFactory: createPrototypeRuntime },
    {
      provide: LINT_DEPENDENCIES,
      useFactory: (): LintDependencies => ({}),
    },
  ],
  exports: [
    IsolateService,
    DiffService,
    PreconditionService,
    ContextService,
    PrototypeService,
    LintService,
    TaskStateService,
    ISOLATION_RUNTIME,
    DIFF_RUNTIME,
    PRECONDITION_RUNTIME,
    CONTEXT_RUNTIME,
    TASK_STATE_RUNTIME,
    PROTOTYPE_RUNTIME,
    LINT_DEPENDENCIES,
  ],
})
export class WorkbenchModule {}
