import { CommandRunner, Option, SubCommand } from "nest-commander";
import {
  PreconditionService,
  type PreconditionArguments,
} from "../../workbench/precondition.js";
import { ResultReporter } from "./result-reporter.js";

@SubCommand({
  name: "precondition",
  description: "Evaluate finish-work precondition gates",
})
export class PreconditionCommand extends CommandRunner {
  constructor(
    private readonly preconditionService: PreconditionService,
    private readonly reporter: ResultReporter,
  ) {
    super();
  }

  @Option({
    flags: "--change-dir <directory>",
    name: "changeDir",
    description: "Select the change directory",
  })
  parseChangeDir(directory: string): string {
    return directory;
  }

  @Option({
    flags: "--test-cmd <command>",
    name: "testCommand",
    description: "Run the required test command",
  })
  parseTestCommand(command: string): string {
    return command;
  }

  @Option({
    flags: "--target-branch <reference>",
    name: "targetBranch",
    description: "Validate review scope against this target branch",
  })
  parseTargetBranch(reference: string): string {
    return reference;
  }

  @Option({
    flags: "--recover-finish <attempt>",
    name: "recoverFinish",
    description: "Admit only remaining finalization effects for a blocked delivered attempt",
  })
  parseRecoverFinish(attempt: string): number {
    return /^[1-9][0-9]*$/.test(attempt) ? Number(attempt) : Number.NaN;
  }

  @Option({
    flags: "--whole-change-waived",
    name: "wholeChangeWaived",
    description: "Waive whole-change freshness requirements",
  })
  parseWholeChangeWaived(): boolean {
    return true;
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const changeDir =
      typeof options?.changeDir === "string" ? options.changeDir : undefined;
    const testCommand =
      typeof options?.testCommand === "string"
        ? options.testCommand
        : undefined;
    const targetBranch =
      typeof options?.targetBranch === "string" ? options.targetBranch : undefined;
    if (changeDir === undefined || testCommand === undefined || targetBranch === undefined) {
      const missingOptions = [
        ...(changeDir === undefined
          ? ["Expected to find option: '--change-dir'"]
          : []),
        ...(testCommand === undefined
          ? ["Expected to find option: '--test-cmd'"]
          : []),
        ...(targetBranch === undefined
          ? ["Expected to find option: '--target-branch'"]
          : []),
      ];
      this.reporter.report({
        stdout: "",
        stderr: `${missingOptions.join("\n\n")}\n`,
        exitCode: 2,
      });
      return;
    }

    const args: PreconditionArguments = {
      changeDir,
      testCommand,
      targetBranch,
      wholeChangeWaived: options?.wholeChangeWaived === true,
      ...(options?.recoverFinish === undefined ? {} : {
        recoverFinish: typeof options.recoverFinish === "number" ? options.recoverFinish : Number.NaN,
      }),
    };
    const result = await this.preconditionService.execute(args);
    this.reporter.report({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }
}
