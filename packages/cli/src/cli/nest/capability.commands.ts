import { Command, CommandRunner, Option, SubCommand } from "nest-commander";
import { GitAuthorLookup } from "../git-author.js";
import { MetadataLinter } from "../metadata-lint.js";
import { parseProjectSelector, ProjectResolver } from "../project-selection.js";
import { appendSelectorValue } from "../scope-selectors.js";
import { generateUuid } from "../uuid.js";
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

@Command({ name: "audit", description: "Record and query workflow history" })
export class AuditCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) {
    super();
  }

  async run(): Promise<void> {
    this.reporter.report(missingOperation("audit"));
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
