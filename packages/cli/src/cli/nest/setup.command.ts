import { Inject } from "@nestjs/common";
import { Command, CommandRunner, Option } from "nest-commander";
import { SETUP_OPERATION } from "../setup-runtime.js";
import type { Setup, SetupResult } from "../setup.service.js";
import { ResultReporter } from "./result-reporter.js";

@Command({
  name: "setup",
  description: "Bootstrap Kepler directories and install templates",
})
export class SetupCommand extends CommandRunner {
  constructor(
    @Inject(SETUP_OPERATION) private readonly setup: Setup,
    private readonly reporter: ResultReporter,
  ) {
    super();
  }

  @Option({ flags: "--force", description: "Force setup" })
  parseForce(): boolean {
    return true;
  }

  async run(
    _passedParams: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result = this.setup.setup();
      this.reporter.report({
        stdout: this.formatSuccess(result),
        stderr: "",
        exitCode: 0,
      });
    } catch (error) {
      this.reporter.report({
        stdout: "",
        stderr: `Setup failed: ${this.errorMessage(error)}\n`,
        exitCode: 2,
      });
    }
  }

  private formatSuccess(result: SetupResult): string {
    const lines = [
      "Kepler set up successfully.",
      `Installed ${result.templates.length} templates.`,
      ...result.templates.map((name) => `  ${name}`),
      "Installed guidelines.",
    ];
    return `${lines.join("\n")}\n`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
