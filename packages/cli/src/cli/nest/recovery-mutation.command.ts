import { Inject } from "@nestjs/common";
import { CommandRunner, Option, SubCommand } from "nest-commander";
import type { AuditRequestInput } from "../../audit/request-input.js";
import { HistoryError } from "../../history/control.js";
import { ProjectResolver } from "../project-selection.js";
import { appendSelectorValue } from "../scope-selectors.js";
import type { RecoveryHistoryExecution, RecoveryOperationName } from "../recovery-execution.js";
import { parseRecoveryReadOptions } from "./recovery-options.js";
import { ResultReporter, type CliEnvelope } from "./result-reporter.js";
import { AuditRequestInput as RequestInput } from "../../audit/request-input.js";

export const RECOVERY_HISTORY_EXECUTION = Symbol("RECOVERY_HISTORY_EXECUTION");
export interface RecoveryMutationDependencies {
  readonly projects: Pick<ProjectResolver, "resolve">;
  readonly input: Pick<AuditRequestInput, "read">;
  readonly execute: RecoveryHistoryExecution;
}

export const runRecoveryMutation = async (operation: RecoveryOperationName, passedParams: readonly string[], options: Readonly<Record<string, unknown>>, dependencies: RecoveryMutationDependencies): Promise<CliEnvelope> => {
  const parsed = parseRecoveryReadOptions(options, passedParams);
  if (parsed.kind === "failed") {
    const { kind: _kind, ...data } = parsed;
    return { status: "failed", data: { ...data, execution_started: false } };
  }
  try {
    const project = await dependencies.projects.resolve(parsed.selectors.project);
    if (project.kind === "failed") {
      const { kind: _kind, ...data } = project;
      return { status: "failed", data: { ...data, execution_started: false } };
    }
    const request = await dependencies.input.read();
    if (request.kind === "failed") return { status: "failed", data: { code: "history_recovery_request_invalid", message: "Recovery requires one complete UTF-8 JSON request on stdin.", details: { ...request.details, input_code: request.code }, recovery: "Pipe the complete request to the selected recovery command and retry.", execution_started: false } };
    const data = await dependencies.execute(operation, { recordHome: project.root, missionId: parsed.selectors.mission }, request.value);
    return { status: "success", data };
  } catch (error) {
    return { status: "failed", data: {
      code: error instanceof HistoryError ? error.code : "history_recovery_failed",
      message: error instanceof Error ? error.message : "The recovery operation did not complete.",
      details: error instanceof HistoryError ? error.details : {},
      recovery: "Inspect retained effects and exact original instructions before retrying. Changed inputs require a new preview and decision.",
      execution_started: false,
    } };
  }
};

abstract class RecoveryMutationCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly projects: Pick<ProjectResolver, "resolve">, private readonly input: Pick<AuditRequestInput, "read">, private readonly executeOperation: RecoveryHistoryExecution, private readonly operation: RecoveryOperationName) { super(); }

  @Option({ flags: "--project <project-root>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--mission <mission-id>" })
  parseMission(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(passedParams: string[], options?: Record<string, unknown>): Promise<void> {
    this.reporter.report(await runRecoveryMutation(this.operation, passedParams, options ?? {}, { projects: this.projects, input: this.input, execute: this.executeOperation }));
  }
}

@SubCommand({ name: "migrate", description: "Preview or apply an approved healthy history migration" })
export class RecoveryMigrateCommand extends RecoveryMutationCommand {
  constructor(reporter: ResultReporter, @Inject(ProjectResolver) projects: Pick<ProjectResolver, "resolve">, @Inject(RequestInput) input: Pick<AuditRequestInput, "read">, @Inject(RECOVERY_HISTORY_EXECUTION) execute: RecoveryHistoryExecution) { super(reporter, projects, input, execute, "migrate"); }
}

@SubCommand({ name: "reset", description: "Preview or apply an exact approved mission history reset" })
export class RecoveryResetCommand extends RecoveryMutationCommand {
  constructor(reporter: ResultReporter, @Inject(ProjectResolver) projects: Pick<ProjectResolver, "resolve">, @Inject(RequestInput) input: Pick<AuditRequestInput, "read">, @Inject(RECOVERY_HISTORY_EXECUTION) execute: RecoveryHistoryExecution) { super(reporter, projects, input, execute, "reset"); }
}

@SubCommand({ name: "reconstruct", description: "Prepare or independently check retained reconstruction drafts" })
export class RecoveryReconstructCommand extends RecoveryMutationCommand {
  constructor(reporter: ResultReporter, @Inject(ProjectResolver) projects: Pick<ProjectResolver, "resolve">, @Inject(RequestInput) input: Pick<AuditRequestInput, "read">, @Inject(RECOVERY_HISTORY_EXECUTION) execute: RecoveryHistoryExecution) { super(reporter, projects, input, execute, "reconstruct"); }
}

@SubCommand({ name: "publish", description: "Preview or publish an exact approved reconstruction" })
export class RecoveryPublishCommand extends RecoveryMutationCommand {
  constructor(reporter: ResultReporter, @Inject(ProjectResolver) projects: Pick<ProjectResolver, "resolve">, @Inject(RequestInput) input: Pick<AuditRequestInput, "read">, @Inject(RECOVERY_HISTORY_EXECUTION) execute: RecoveryHistoryExecution) { super(reporter, projects, input, execute, "publish"); }
}
