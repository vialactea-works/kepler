import { Command, CommandRunner, Option, SubCommand } from "nest-commander";
import { GitAuthorLookup } from "../git-author.js";
import { MetadataLinter } from "../metadata-lint.js";
import { parseProjectSelector, ProjectResolver } from "../project-selection.js";
import { appendSelectorValue, parseScopeSelectors, type ScopeSelectorFailure } from "../scope-selectors.js";
import { generateUuid } from "../uuid.js";
import { parseStrictJson } from "../../json/strict-json.js";
import { MissionStartup } from "../../construction/mission-startup.js";
import { UnitCreate } from "../../construction/unit-create.js";
import { UnitQueries } from "../../construction/unit-queries.js";
import { ConstructionQueries } from "../../construction/scoped-queries.js";
import { ConstructionLint } from "../../construction/construction-lint.js";
import { FunctionalDesignStageCompletion } from "../../construction/stage-completion.js";
import { StageStart } from "../../construction/stage-start.js";
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

const reportSelectorFailure = (
  reporter: ResultReporter,
  failure: ScopeSelectorFailure,
  recovery: string,
): void => reportFailure(reporter, {
  code: failure.code,
  message: failure.message,
  details: failure.details,
  recovery,
});

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

@SubCommand({ name: "complete", description: "Complete the selected Functional Design attempt" })
export class ConstructionStageCompleteCommand extends CommandRunner {
  constructor(
    private readonly reporter: ResultReporter,
    private readonly completion: FunctionalDesignStageCompletion,
  ) {
    super();
  }

  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--stage <stage>" }) parseStage(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--attempt <attempt-id>" }) parseAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--request <json>" }) parseRequest(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const selectors = parseScopeSelectors(values, { required: ["unit", "stage", "attempt"] });
    if (selectors.kind === "failed") {
      reportFailure(this.reporter, {
        code: selectors.code,
        message: selectors.message,
        details: selectors.details,
        recovery: "Provide the exact Unit of Work, Functional Design stage, and attempt selectors.",
      });
      return;
    }
    const selectedProject = projectSelector(values);
    if (selectedProject.kind === "failed") { reportFailure(this.reporter, selectedProject); return; }
    const request = optionValue(values, "request");
    if (typeof request !== "string") {
      reportFailure(this.reporter, typeof request === "object" ? request : {
        code: "required_selector_missing",
        message: "Stage completion requires one typed --request JSON value.",
        details: { required: ["request"] },
        recovery: "Provide the typed assessments and approval event ID with --request.",
      });
      return;
    }
    const parsed = parseStrictJson(request);
    if (parsed.kind === "invalid") {
      reportFailure(this.reporter, {
        code: "invalid_stage_completion_request_json",
        message: "The stage completion request is not valid strict JSON.",
        details: { code: parsed.code, pointer: parsed.pointer, message: parsed.message },
        recovery: "Correct the JSON request and retry without changing the selected scope.",
      });
      return;
    }
    const result = await this.completion.execute(selectors.selectors, parsed.value, selectedProject.project);
    this.reporter.report({ status: result.kind, data: result.data });
  }
}

@SubCommand({ name: "start", description: "Start a new Construction stage attempt" })
export class ConstructionStageStartCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly start: StageStart) { super(); }

  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--stage <stage>" }) parseStage(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--request <json>" }) parseRequest(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const selectors = parseScopeSelectors(values, { required: ["unit", "stage"] });
    if (selectors.kind === "failed") {
      reportSelectorFailure(this.reporter, selectors, "Provide one exact --unit and supported --stage selector.");
      return;
    }
    const selectedProject = projectSelector(values);
    if (selectedProject.kind === "failed") { reportFailure(this.reporter, selectedProject); return; }
    const request = optionValue(values, "request");
    if (typeof request !== "string") {
      reportFailure(this.reporter, typeof request === "object" ? request : {
        code: "required_selector_missing",
        message: "Stage start requires one typed --request JSON value.",
        details: { required: ["request"] },
        recovery: "Provide the applicable stage input references with --request.",
      });
      return;
    }
    const parsed = parseStrictJson(request);
    if (parsed.kind === "invalid") {
      reportFailure(this.reporter, {
        code: "invalid_stage_start_request_json",
        message: "The stage-start request is not valid strict JSON.",
        details: { code: parsed.code, pointer: parsed.pointer, message: parsed.message },
        recovery: "Correct the JSON request and retry without changing the selected scope.",
      });
      return;
    }
    const result = await this.start.execute(selectors.selectors, parsed.value, selectedProject.project);
    this.reporter.report({ status: result.kind, data: result.data });
  }
}

@SubCommand({ name: "show", description: "Show a Construction stage projection" })
export class ConstructionStageShowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: ConstructionQueries) { super(); }

  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--stage <stage>" }) parseStage(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit", "stage"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide one exact --unit and supported --stage selector."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = parsed.selectors.unit;
    const stage = parsed.selectors.stage;
    if (!unitId || !stage) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Stage show requires --unit and --stage.", details: { required: ["unit", "stage"] }, recovery: "Provide the exact unit and stage selectors." }); return; }
    const result = await this.queries.stageShow(unitId, stage, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    const { kind: _kind, ...data } = result;
    this.reporter.report({ status: "success", data });
  }
}

@SubCommand({
  name: "stage",
  description: "Read or change one Construction stage attempt",
  subCommands: [ConstructionStageShowCommand, ConstructionStageStartCommand, ConstructionStageCompleteCommand],
})
export class ConstructionStageCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("workflow construction stage")); }
}

@SubCommand({ name: "list", description: "List authored tasks and execution state" })
export class ConstructionTaskListCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: ConstructionQueries) { super(); }
  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide one exact --unit selector."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = parsed.selectors.unit;
    if (!unitId) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Task list requires --unit.", details: { required: "unit" }, recovery: "Provide one exact --unit selector." }); return; }
    const result = await this.queries.taskList(unitId, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    const { kind: _kind, ...data } = result;
    this.reporter.report({ status: "success", data });
  }
}

@SubCommand({ name: "show", description: "Show one task definition and its attempts" })
export class ConstructionTaskShowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: ConstructionQueries) { super(); }
  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--task <task-id>" }) parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit", "task"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide one exact --unit and --task selector."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = parsed.selectors.unit;
    const taskId = parsed.selectors.task;
    if (!unitId || !taskId) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Task show requires --unit and --task.", details: { required: ["unit", "task"] }, recovery: "Provide the exact unit and task selectors." }); return; }
    const result = await this.queries.taskShow(unitId, taskId, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    const { kind: _kind, ...data } = result;
    this.reporter.report({ status: "success", data });
  }
}

@SubCommand({ name: "ready", description: "Read task dependencies, integrated outputs, and prerequisites" })
export class ConstructionTaskReadyCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: ConstructionQueries) { super(); }
  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--task <task-id>" }) parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit", "task"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide one exact --unit and --task selector."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = parsed.selectors.unit;
    const taskId = parsed.selectors.task;
    if (!unitId || !taskId) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Task readiness requires --unit and --task.", details: { required: ["unit", "task"] }, recovery: "Provide the exact unit and task selectors." }); return; }
    const result = await this.queries.taskReady(unitId, taskId, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    const { kind: _kind, ...data } = result;
    this.reporter.report({ status: "success", data });
  }
}

@SubCommand({ name: "task", description: "Read authored task definitions and execution" , subCommands: [ConstructionTaskListCommand, ConstructionTaskShowCommand, ConstructionTaskReadyCommand] })
export class ConstructionTaskCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("workflow construction task")); }
}

@SubCommand({ name: "show", description: "Show one task-scoped Construction Activity" })
export class ConstructionActivityShowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: ConstructionQueries) { super(); }
  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--task <task-id>" }) parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--activity <activity>" }) parseActivity(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--implementation-attempt <attempt-id>" }) parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit", "task", "activity", "implementationAttempt"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide the exact unit, task, Activity, and Implementation attempt selectors."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const { unit, task, activity, implementationAttempt } = parsed.selectors;
    if (!unit || !task || !activity || !implementationAttempt) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Activity show requires all four scope selectors.", details: { required: ["unit", "task", "activity", "implementationAttempt"] }, recovery: "Provide the exact selectors for one Activity occurrence." }); return; }
    const result = await this.queries.activityShow(unit, task, activity, implementationAttempt, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    const { kind: _kind, ...data } = result;
    this.reporter.report({ status: "success", data });
  }
}

@SubCommand({ name: "activity", description: "Read task-scoped Construction Activities", subCommands: [ConstructionActivityShowCommand] })
export class ConstructionActivityCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("workflow construction activity")); }
}

@SubCommand({ name: "lint", description: "Validate the canonical Construction task graph" })
export class ConstructionLintCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly lint: ConstructionLint) { super(); }
  @Option({ flags: "--unit <unit-id>" }) parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  @Option({ flags: "--project <path>" }) parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }
  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const parsed = parseScopeSelectors(values, { required: ["unit"] });
    if (parsed.kind === "failed") { reportSelectorFailure(this.reporter, parsed, "Provide one exact --unit selector."); return; }
    const selected = projectSelector(values);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = parsed.selectors.unit;
    if (!unitId) { reportFailure(this.reporter, { code: "required_selector_missing", message: "Construction lint requires --unit.", details: { required: "unit" }, recovery: "Provide one exact --unit selector." }); return; }
    const result = await this.lint.execute(unitId, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    if (result.kind === "invalid") {
      reportFailure(this.reporter, {
        code: "construction_lint_failed",
        message: "Construction graph validation found structural issues.",
        details: { findings: result.findings },
        recovery: "Correct the reported plan or graph findings without replacing the canonical mission-owned files.",
      });
      return;
    }
    this.reporter.report({ status: "success", data: { findings: result.findings } });
  }
}

@SubCommand({ name: "create", arguments: "<slug>", description: "Create one Unit of Work" })
export class ConstructionUnitCreateCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly unitCreate: UnitCreate) {
    super();
  }

  @Option({ flags: "--mission <mission-id>" })
  parseMission(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--effort <level>" })
  parseEffort(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--stage-effort <stage=level>" })
  parseStageEffort(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const values = options ?? {};
    const result = await this.unitCreate.execute({
      slug: passedParams[0],
      mission: values.mission,
      effort: values.effort,
      stageEffort: values.stageEffort,
      project: values.project,
    });
    if (result.kind === "failed") {
      reportFailure(this.reporter, result);
      return;
    }
    this.reporter.report({
      status: "success",
      data: {
        unit_id: result.unitId,
        mission_id: result.missionId,
        record_home: result.recordHome,
        directory: result.directory,
        workflow: result.workflow,
        effort: { default: result.effort.default, stage_overrides: result.effort.stageOverrides },
        journal_id: result.journalId,
        id: result.eventId,
        execution_started: false,
      },
    });
  }
}

@SubCommand({ name: "list", description: "List Units of Work" })
export class ConstructionUnitListCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: UnitQueries) { super(); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const selected = projectSelector(options);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const result = await this.queries.list(selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    this.reporter.report({ status: "success", data: { record_home: result.recordHome, units: result.units } });
  }
}

@SubCommand({ name: "show", description: "Show one Unit of Work" })
export class ConstructionUnitShowCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter, private readonly queries: UnitQueries) { super(); }

  @Option({ flags: "--unit <unit-id>" })
  parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(_passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    const selectors = parseScopeSelectors(options ?? {}, { required: ["unit"] });
    if (selectors.kind === "failed") {
      reportFailure(this.reporter, {
        code: selectors.code,
        message: selectors.message,
        details: selectors.details,
        recovery: "Provide one exact --unit selector and an optional --project path.",
      });
      return;
    }
    const selected = projectSelector(options);
    if (selected.kind === "failed") { reportFailure(this.reporter, selected); return; }
    const unitId = selectors.selectors.unit;
    if (!unitId) {
      reportFailure(this.reporter, {
        code: "required_selector_missing",
        message: "Unit show requires one --unit selector.",
        details: { required: "unit" },
        recovery: "Provide one exact --unit selector.",
      });
      return;
    }
    const result = await this.queries.show(unitId, selected.project);
    if (result.kind === "failed") { reportFailure(this.reporter, result); return; }
    this.reporter.report({ status: "success", data: { record_home: result.recordHome, unit: result.unit } });
  }
}

@SubCommand({
  name: "unit",
  description: "Create or query Units of Work",
  subCommands: [ConstructionUnitCreateCommand, ConstructionUnitListCommand, ConstructionUnitShowCommand],
})
export class ConstructionUnitCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }
  async run(): Promise<void> { this.reporter.report(missingOperation("workflow construction unit")); }
}

@SubCommand({
  name: "construction",
  description: "Run Construction workflow operations",
  subCommands: [ConstructionUnitCommand, ConstructionStageCommand, ConstructionTaskCommand, ConstructionActivityCommand, ConstructionLintCommand],
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
