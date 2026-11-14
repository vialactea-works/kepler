import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option, SubCommand } from "nest-commander";
import type { HistoryInspection } from "../../history/inspection.js";
import { HistoryError } from "../../history/control.js";
import { appendSelectorValue as appendRecoverySelectorValue } from "../scope-selectors.js";
import { ProjectResolver } from "../project-selection.js";
import { ResultReporter, type CliEnvelope } from "./result-reporter.js";
import { parseRecoveryReadOptions } from "./recovery-options.js";
import { RecoveryMigrateCommand, RecoveryResetCommand, RecoveryReconstructCommand, RecoveryPublishCommand } from "./recovery-mutation.command.js";

export interface RecoveryInspectionRequest {
  readonly recordHome: string;
  readonly missionId: string;
}

export type RecoveryHistoryInspection = (
  request: RecoveryInspectionRequest,
) => Promise<HistoryInspection>;

export const RECOVERY_HISTORY_INSPECTION = Symbol("RECOVERY_HISTORY_INSPECTION");

export interface RecoveryReadDependencies {
  readonly projects: Pick<ProjectResolver, "resolve">;
  readonly inspect: RecoveryHistoryInspection;
}

export const runRecoveryRead = async (
  passedParams: readonly string[],
  options: Readonly<Record<string, unknown>>,
  dependencies: RecoveryReadDependencies,
): Promise<CliEnvelope> => {
  const parsed = parseRecoveryReadOptions(options, passedParams);
  if (parsed.kind === "failed") {
    const { kind: _kind, ...data } = parsed;
    return { status: "failed", data };
  }

  try {
    const project = await dependencies.projects.resolve(parsed.selectors.project);
    if (project.kind === "failed") {
      return {
        status: "failed",
        data: {
          code: project.code,
          message: project.message,
          details: project.details,
          recovery: project.recovery,
        },
      };
    }
    const report = await dependencies.inspect({
      recordHome: project.root,
      missionId: parsed.selectors.mission,
    });
    return { status: "success", data: { ...report } };
  } catch (error) {
    return {
      status: "failed",
      data: {
        code: error instanceof HistoryError ? error.code : "history_inspection_failed",
        message: error instanceof Error
          ? error.message
          : "Kepler could not complete read-only history inspection.",
        details: error instanceof HistoryError ? error.details : {},
        recovery: "Review the inspection failure and retry without changing the mission history.",
      },
    };
  }
};

const reportRead = async (
  reporter: ResultReporter,
  passedParams: string[],
  options: Record<string, unknown> | undefined,
  dependencies: RecoveryReadDependencies,
): Promise<void> => {
  reporter.report(await runRecoveryRead(passedParams, options ?? {}, dependencies));
};

@SubCommand({
  name: "inspect",
  description: "Inspect mission history without changing files",
})
export class RecoveryInspectCommand extends CommandRunner {
  constructor(
    @Inject(ProjectResolver) private readonly projects: Pick<ProjectResolver, "resolve">,
    private readonly reporter: ResultReporter,
    @Inject(RECOVERY_HISTORY_INSPECTION)
    private readonly inspect: RecoveryHistoryInspection,
  ) {
    super();
  }

  @Option({ flags: "--project <project-root>" })
  parseProject(value: string, previous: string[] = []): string[] {
    return appendRecoverySelectorValue(value, previous);
  }

  @Option({ flags: "--mission <mission-id>" })
  parseMission(value: string, previous: string[] = []): string[] {
    return appendRecoverySelectorValue(value, previous);
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    await reportRead(this.reporter, passedParams, options, {
      projects: this.projects,
      inspect: this.inspect,
    });
  }
}

@SubCommand({
  name: "status",
  description: "Report mission history and recovery status without changing files",
})
export class RecoveryStatusCommand extends CommandRunner {
  constructor(
    @Inject(ProjectResolver) private readonly projects: Pick<ProjectResolver, "resolve">,
    private readonly reporter: ResultReporter,
    @Inject(RECOVERY_HISTORY_INSPECTION)
    private readonly inspect: RecoveryHistoryInspection,
  ) {
    super();
  }

  @Option({ flags: "--project <project-root>" })
  parseProject(value: string, previous: string[] = []): string[] {
    return appendRecoverySelectorValue(value, previous);
  }

  @Option({ flags: "--mission <mission-id>" })
  parseMission(value: string, previous: string[] = []): string[] {
    return appendRecoverySelectorValue(value, previous);
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    await reportRead(this.reporter, passedParams, options, {
      projects: this.projects,
      inspect: this.inspect,
    });
  }
}

@Command({
  name: "recovery",
  description: "Inspect, preserve, and recover mission history through exact approved operations",
  subCommands: [RecoveryInspectCommand, RecoveryStatusCommand, RecoveryMigrateCommand, RecoveryResetCommand, RecoveryReconstructCommand, RecoveryPublishCommand],
})
export class RecoveryCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report({
      status: "failed",
      data: {
        code: "invalid_arguments",
        message: "recovery requires a supported operation subcommand.",
        details: {},
        recovery: "Select inspect, status, migrate, reset, reconstruct, or publish with explicit selectors.",
      },
    });
  }
}
