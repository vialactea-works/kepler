import { CommandRunner, Option, SubCommand } from "nest-commander";
import {
  ContextService,
  type ContextArguments,
} from "../../workbench/context.js";
import { ResultReporter } from "./result-reporter.js";

@SubCommand({
  name: "context",
  arguments: "[change-dir]",
  description: "Report Kepler change context",
})
export class ContextCommand extends CommandRunner {
  constructor(
    private readonly contextService: ContextService,
    private readonly reporter: ResultReporter,
  ) {
    super();
  }

  @Option({ flags: "--all", description: "List all changes" })
  parseAll(): boolean {
    return true;
  }

  @Option({ flags: "--input <path>", description: "Probe a repository-relative input path" })
  parseInput(path: string, previous: string[] = []): string[] {
    return [...previous, path];
  }

  async run(
    passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const all = options?.all === true;
    const changeDir = passedParams[0];
    const inputPaths = Array.isArray(options?.input)
      ? options.input.filter((path): path is string => typeof path === "string")
      : typeof options?.input === "string"
        ? [options.input]
        : [];

    if (all && inputPaths.length > 0) {
      this.reportUsageError("--input cannot be used with --all");
      return;
    }
    if (all && changeDir !== undefined) {
      this.reportUsageError("--all takes no change directory");
      return;
    }

    const args: ContextArguments = { all, changeDir, inputPaths };
    const result = await this.contextService.execute(args);
    this.reporter.report({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  private reportUsageError(message: string): void {
    this.reporter.report({
      stdout: "",
      stderr: `error: ${message}\n`,
      exitCode: 2,
    });
  }
}
