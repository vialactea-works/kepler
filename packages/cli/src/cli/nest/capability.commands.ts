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
import { AuditQueries } from "../../audit/queries.js";
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

const optionValue = (options: Readonly<Record<string, unknown>>, key: string): string | undefined | FailurePayload => {
  const raw = options[key];
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].length === 0) {
    return {
      code: values.length > 1 ? "duplicate_selector" : "invalid_selector",
      message: `--${key} requires one non-empty exact value.`,
      details: { selector: key },
      recovery: `Provide one valid --${key} value and retry.`,
    };
  }
  return values[0];
};

@SubCommand({ name: "list", description: "Query compact audit event projections" })
export class AuditListCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: AuditQueries) { super(); }

  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--stage <stage>" }) parseStage(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--task <task-id>" }) parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--activity <activity>" }) parseActivity(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--attempt <attempt-id>" }) parseAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--implementation-attempt <attempt-id>" }) parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--type <event-type>" }) parseType(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--fields <field-list>" }) parseFields(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--limit <n>" }) parseLimit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--cursor <token>" }) parseCursor(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const selectors = parseScopeSelectors(values, { required: ["unit"] });
    if (selectors.kind === "failed") {
      reportFailure(this.reporter, { code: selectors.code, message: selectors.message, details: selectors.details, recovery: "Correct the explicit audit list filters and retry." });
      return;
    }
    const selectedProject = projectSelector(values);
    if (selectedProject.kind === "failed") { reportFailure(this.reporter, selectedProject); return; }
    const type = optionValue(values, "type");
    const fields = optionValue(values, "fields");
    const limitValue = optionValue(values, "limit");
    const cursor = optionValue(values, "cursor");
    const invalid = [type, fields, limitValue, cursor].find((value) => typeof value === "object");
    if (invalid) { reportFailure(this.reporter, invalid as FailurePayload); return; }
    let limit: number | undefined;
    if (typeof limitValue === "string") {
      if (!/^[0-9]+$/.test(limitValue)) {
        reportFailure(this.reporter, { code: "invalid_audit_limit", message: "--limit must be a positive integer.", details: { limit: limitValue }, recovery: "Provide an integer from 1 through 1000." });
        return;
      }
      limit = Number(limitValue);
    }
    const result = await this.queries.list({
      selectors: selectors.selectors,
      ...(typeof type === "string" ? { type } : {}),
      ...(typeof fields === "string" ? { fields } : {}),
      ...(limit === undefined ? {} : { limit }),
      ...(typeof cursor === "string" ? { cursor } : {}),
    }, selectedProject.project);
    this.reporter.report({ status: result.kind, data: result.data });
  }
}

@SubCommand({ name: "show", description: "Read one complete audit event" })
export class AuditShowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: AuditQueries) { super(); }

  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--journal <journal-id>" }) parseJournal(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--id <event-id>" }) parseId(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const selectors = parseScopeSelectors(values, { required: ["unit"] });
    if (selectors.kind === "failed") {
      reportFailure(this.reporter, { code: selectors.code, message: selectors.message, details: selectors.details, recovery: "Correct the explicit audit show selectors and retry." });
      return;
    }
    const project = projectSelector(values);
    if (project.kind === "failed") { reportFailure(this.reporter, project); return; }
    const journal = optionValue(values, "journal");
    const id = optionValue(values, "id");
    if (typeof journal === "object" || typeof id === "object") {
      reportFailure(this.reporter, (typeof journal === "object" ? journal : id) as FailurePayload);
      return;
    }
    if (!journal || !id) {
      reportFailure(this.reporter, { code: "required_selector_missing", message: "Audit show requires --unit, --journal, and --id.", details: { required: ["unit", "journal", "id"] }, recovery: "Provide the full exact identities and retry." });
      return;
    }
    const result = await this.queries.show(selectors.selectors.unit!, journal, id, project.project);
    this.reporter.report({ status: result.kind, data: result.data });
  }
}

@Command({
  name: "audit",
  description: "Record and query workflow history",
  subCommands: [AuditRecordCommandGroup, AuditListCommand, AuditShowCommand],
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
