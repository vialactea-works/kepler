import { Command, CommandRunner, Option, SubCommand } from "nest-commander";
import { GitAuthorLookup } from "../git-author.js";
import { MetadataLinter } from "../metadata-lint.js";
import { parseProjectSelector, ProjectResolver } from "../project-selection.js";
import { appendSelectorValue, parseScopeSelectors } from "../scope-selectors.js";
import { generateUuid } from "../uuid.js";
import { parseStrictJson } from "../../json/strict-json.js";
import { MissionStartup } from "../../construction/mission-startup.js";
import { AuditRecording, type AuditRecordKind } from "../../audit/recording.js";
import { AuditRequestInput } from "../../audit/request-input.js";
import { ResultReporter } from "./result-reporter.js";

const missingOperation = (name: string) => ({
  status: "failed" as const,
  data: {
    code: "invalid_arguments",
    message: `${name} requires a subcommand.`,
    details: {},
    recovery: "Select a supported subcommand from --help.",
  },
});

type FailurePayload = {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
};

const reportFailure = (
  reporter: ResultReporter,
  failure: FailurePayload,
): void => {
  reporter.report({
    status: "failed",
    data: {
      code: failure.code,
      message: failure.message,
      details: failure.details,
      recovery: failure.recovery,
    },
  });
};

const projectSelector = (
  options?: Readonly<Record<string, unknown>>,
) => parseProjectSelector(options?.project);

@SubCommand({ name: "author", description: "Read effective Git author identity" })
export class GitAuthorCommand extends CommandRunner {
  constructor(
    private readonly reporter: ResultReporter,
    private readonly lookup: GitAuthorLookup,
  ) {
    super();
  }

  @Option({ flags: "--project <path>", description: "Select a project root" })
  parseProject(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  async run(
    _passedParams: string[],
    options?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const selected = projectSelector(options);
    if (selected.kind === "failed") {
      reportFailure(this.reporter, selected);
      return;
    }

    const result = await this.lookup.execute(selected.project);
    if (result.kind === "failed") {
      reportFailure(this.reporter, result);
      return;
    }
    this.reporter.report({
      status: "success",
      data: { name: result.name, email: result.email },
    });
  }
}

@Command({
  name: "git",
  description: "Inspect and work with repository material",
  subCommands: [GitAuthorCommand],
})
export class GitCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report(missingOperation("git"));
  }
}

@Command({ name: "uuid", description: "Generate one UUIDv4" })
export class UuidCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    const result = generateUuid();
    if (result.kind === "failed") {
      reportFailure(this.reporter, result);
      return;
    }
    this.reporter.report({ status: "success", data: { uuid: result.uuid } });
  }
}

@Command({
  name: "lint",
  arguments: "<path...>",
  description: "Validate shared metadata in explicit Markdown files",
})
export class MetadataLintCommand extends CommandRunner {
  constructor(
    private readonly reporter: ResultReporter,
    private readonly projects: ProjectResolver,
    private readonly linter: MetadataLinter,
  ) {
    super();
  }

  @Option({ flags: "--project <path>", description: "Select a project root" })
  parseProject(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  async run(
    paths: string[],
    options?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const selected = projectSelector(options);
    if (selected.kind === "failed") {
      reportFailure(this.reporter, selected);
      return;
    }

    const project = await this.projects.resolve(selected.project);
    if (project.kind === "failed") {
      reportFailure(this.reporter, project);
      return;
    }

    const result = await this.linter.execute(project.root, paths);
    if (result.kind === "failed") {
      reportFailure(this.reporter, result);
      return;
    }
    if (result.kind === "invalid") {
      this.reporter.report({
        status: "failed",
        data: {
          code: "metadata_validation_failed",
          message: "One or more selected files have metadata validation findings.",
          details: { findings: result.findings },
          recovery: "Correct the reported metadata fields and rerun lint.",
        },
      });
      return;
    }
    this.reporter.report({ status: "success", data: { findings: [] } });
  }
}

abstract class AuditRecordCommand extends CommandRunner {
  constructor(
    protected readonly reporter: ResultReporter,
    private readonly recording: AuditRecording,
    private readonly input: AuditRequestInput,
    private readonly kind: AuditRecordKind,
  ) {
    super();
  }

  @Option({ flags: "--unit <unit-id>", description: "Select a Unit of Work" })
  parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--stage <stage>", description: "Select a Construction stage" })
  parseStage(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--task <task-id>", description: "Select a task" })
  parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--activity <activity>", description: "Select a Construction Activity" })
  parseActivity(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--attempt <attempt-id>", description: "Select the exact attempt" })
  parseAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--implementation-attempt <attempt-id>", description: "Select the enclosing Implementation attempt" })
  parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>", description: "Select the record-home project" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const selected = parseScopeSelectors(options ?? {}, { required: ["unit"] });
    if (selected.kind === "failed") {
      reportFailure(this.reporter, {
        code: selected.code,
        message: selected.message,
        details: selected.details,
        recovery: "Correct the explicit audit scope selectors and retry.",
      });
      return;
    }
    const project = projectSelector(options);
    if (project.kind === "failed") {
      reportFailure(this.reporter, project);
      return;
    }
    const body = await this.input.read();
    if (body.kind === "failed") {
      reportFailure(this.reporter, body);
      return;
    }
    const parsed = parseStrictJson(body.value);
    if (parsed.kind === "invalid") {
      reportFailure(this.reporter, {
        code: "invalid_audit_request_json",
        message: "The audit request is not valid strict JSON.",
        details: { code: parsed.code, pointer: parsed.pointer, message: parsed.message },
        recovery: "Provide one complete JSON object on stdin and retry.",
      });
      return;
    }
    const result = await this.recording.execute(this.kind, selected.selectors, parsed.value, project.project);
    this.reporter.report({ status: result.kind, data: result.data });
  }
}

@SubCommand({ name: "evidence", description: "Record a check or review result" })
export class AuditRecordEvidenceCommand extends AuditRecordCommand {
  constructor(reporter: ResultReporter, recording: AuditRecording, input: AuditRequestInput) {
    super(reporter, recording, input, "evidence");
  }
}

@SubCommand({ name: "approval", description: "Record an explicit requester decision" })
export class AuditRecordApprovalCommand extends AuditRecordCommand {
  constructor(reporter: ResultReporter, recording: AuditRecording, input: AuditRequestInput) {
    super(reporter, recording, input, "approval");
  }
}

@SubCommand({ name: "interaction", description: "Record an interaction or effort selection" })
export class AuditRecordInteractionCommand extends AuditRecordCommand {
  constructor(reporter: ResultReporter, recording: AuditRecording, input: AuditRequestInput) {
    super(reporter, recording, input, "interaction");
  }
}

@SubCommand({
  name: "record",
  description: "Record typed audit facts",
  subCommands: [AuditRecordEvidenceCommand, AuditRecordApprovalCommand, AuditRecordInteractionCommand],
})
export class AuditRecordCommandGroup extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("audit record")); }
}

@Command({
  name: "audit",
  description: "Record and query workflow history",
  subCommands: [AuditRecordCommandGroup],
})
export class AuditCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("audit")); }
}

@SubCommand({ name: "create", description: "Create a mission and prepare its selected workspaces" })
export class MissionCreateCommand extends CommandRunner {
  constructor(
    private readonly reporter: ResultReporter,
    private readonly startup: MissionStartup,
  ) {
    super();
  }

  @Option({ flags: "--project <path>", description: "Select the mission record home" })
  parseProject(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  @Option({ flags: "--request <json>", description: "Provide the typed mission startup request as JSON" })
  parseRequest(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const selected = projectSelector(options);
    if (selected.kind === "failed") {
      reportFailure(this.reporter, selected);
      return;
    }
    const requestValues = options?.request;
    if (!Array.isArray(requestValues) || requestValues.length !== 1 || typeof requestValues[0] !== "string") {
      reportFailure(this.reporter, {
        code: "invalid_arguments",
        message: "Mission creation requires exactly one --request JSON value.",
        details: {},
        recovery: "Provide one complete typed mission startup request with --request.",
      });
      return;
    }
    const parsed = parseStrictJson(requestValues[0]);
    if (parsed.kind === "invalid") {
      reportFailure(this.reporter, {
        code: "invalid_mission_request_json",
        message: "The mission startup request is not valid strict JSON.",
        details: { code: parsed.code, pointer: parsed.pointer, message: parsed.message },
        recovery: "Correct the JSON request and retry before preparing workspaces.",
      });
      return;
    }
    const result = await this.startup.execute(selected.project, parsed.value);
    if (result.kind === "failed") {
      reportFailure(this.reporter, result);
      return;
    }
    this.reporter.report({
      status: "success",
      data: {
        mission_id: result.missionId,
        workflow: "standard",
        record_home: result.recordHome,
        workspaces: result.repositories.map((repository) => ({
          repository_id: repository.repositoryId,
          context: repository.context,
          workspace_id: repository.localWorkspaceKey,
          workspace_path: repository.workspacePath,
          branch: repository.branch,
          integration_target: repository.integrationTarget,
          starting_checkpoint: repository.startingCheckpoint,
        })),
        execution_started: false,
      },
    });
  }
}

@Command({
  name: "mission",
  description: "Create and prepare a mission",
  subCommands: [MissionCreateCommand],
})
export class MissionCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report(missingOperation("mission"));
  }
}

@SubCommand({
  name: "construction",
  description: "Run Construction workflow operations",
})
export class ConstructionCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report(missingOperation("workflow construction"));
  }
}

@Command({
  name: "workflow",
  description: "Run phase-owned workflow operations",
  subCommands: [ConstructionCommand],
})
export class WorkflowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report(missingOperation("workflow"));
  }
}
