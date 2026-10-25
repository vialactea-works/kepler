import { Inject } from "@nestjs/common";
import { CommandRunner, Option, SubCommand } from "nest-commander";
import { appendSelectorValue } from "../scope-selectors.js";
import {
  parseDiffPackageOptions,
  type DiffPackageCommandRequest,
} from "../diff-package-options.js";
import { ResultReporter } from "./result-reporter.js";

export const GIT_DIFF_PACKAGE_OPERATION = Symbol("GIT_DIFF_PACKAGE_OPERATION");

export type DiffPackageOperationResult =
  | { readonly kind: "success"; readonly data: Readonly<Record<string, unknown>> }
  | {
      readonly kind: "failed";
      readonly code: string;
      readonly message: string;
      readonly details: Readonly<Record<string, unknown>>;
      readonly recovery: string;
    };

export interface GitDiffPackageOperation {
  execute(request: DiffPackageCommandRequest): Promise<DiffPackageOperationResult>;
}

const reportFailure = (
  reporter: ResultReporter,
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  recovery: string,
): void => reporter.report({ status: "failed", data: { code, message, details, recovery } });

abstract class DiffPackageOperationCommand extends CommandRunner {
  constructor(
    protected readonly reporter: ResultReporter,
    @Inject(GIT_DIFF_PACKAGE_OPERATION) private readonly operation: GitDiffPackageOperation,
    private readonly kind: "validation" | "integration" | "unit-review",
  ) {
    super();
  }

  protected async execute(passedParams: readonly string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    if (passedParams.length > 0) {
      reportFailure(this.reporter, "invalid_arguments", "Diff-package commands do not accept positional arguments.", {
        positional_arguments: [...passedParams],
      }, "Remove the extra argument and use only the selectors accepted by the selected command.");
      return;
    }
    const parsed = parseDiffPackageOptions(this.kind, options ?? {});
    if (parsed.kind === "failed") {
      reportFailure(this.reporter, parsed.code, parsed.message, parsed.details, parsed.recovery);
      return;
    }
    const result = await this.operation.execute(parsed.request);
    if (result.kind === "failed") {
      reportFailure(this.reporter, result.code, result.message, result.details, result.recovery);
      return;
    }
    this.reporter.report({ status: "success", data: result.data });
  }
}

@SubCommand({ name: "validation", description: "Package the recorded task admission-to-Generation diff" })
export class GitDiffPackageValidationCommand extends DiffPackageOperationCommand {
  constructor(reporter: ResultReporter, @Inject(GIT_DIFF_PACKAGE_OPERATION) operation: GitDiffPackageOperation) {
    super(reporter, operation, "validation");
  }

  @Option({ flags: "--unit <unit-id>" })
  parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--task <task-id>" })
  parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--implementation-attempt <attempt-id>" })
  parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--generation-attempt <attempt-id>" })
  parseGenerationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--out <path>" })
  parseOut(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    await this.execute(passedParams, options);
  }
}

@SubCommand({ name: "integration", description: "Package the recorded Integration input-to-candidate diffs" })
export class GitDiffPackageIntegrationCommand extends DiffPackageOperationCommand {
  constructor(reporter: ResultReporter, @Inject(GIT_DIFF_PACKAGE_OPERATION) operation: GitDiffPackageOperation) {
    super(reporter, operation, "integration");
  }

  @Option({ flags: "--unit <unit-id>" })
  parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--task <task-id>" })
  parseTask(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--implementation-attempt <attempt-id>" })
  parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--integration-attempt <attempt-id>" })
  parseIntegrationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--out <path>" })
  parseOut(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    await this.execute(passedParams, options);
  }
}

@SubCommand({ name: "unit-review", description: "Package the recorded original-baseline-to-completion diff" })
export class GitDiffPackageUnitReviewCommand extends DiffPackageOperationCommand {
  constructor(reporter: ResultReporter, @Inject(GIT_DIFF_PACKAGE_OPERATION) operation: GitDiffPackageOperation) {
    super(reporter, operation, "unit-review");
  }

  @Option({ flags: "--unit <unit-id>" })
  parseUnit(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--implementation-attempt <attempt-id>" })
  parseImplementationAttempt(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--project <path>" })
  parseProject(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  @Option({ flags: "--out <path>" })
  parseOut(value: string, previous: string[] = []): string[] { return appendSelectorValue(value, previous); }

  async run(passedParams: string[], options?: Readonly<Record<string, unknown>>): Promise<void> {
    await this.execute(passedParams, options);
  }
}

@SubCommand({
  name: "diff-package",
  description: "Render a source-bound Construction diff package",
  subCommands: [
    GitDiffPackageValidationCommand,
    GitDiffPackageIntegrationCommand,
    GitDiffPackageUnitReviewCommand,
  ],
})
export class GitDiffPackageCommand extends CommandRunner {
  constructor(private readonly reporter: ResultReporter) { super(); }

  async run(): Promise<void> {
    this.reporter.report({
      status: "failed",
      data: {
        code: "invalid_arguments",
        message: "git diff-package requires one supported inspection operation.",
        details: {},
        recovery: "Select validation, integration, or unit-review from --help.",
      },
    });
  }
}
