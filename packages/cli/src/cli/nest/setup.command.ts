import { Inject } from "@nestjs/common";
import { Command, CommandRunner } from "nest-commander";
import { SETUP_OPERATION } from "../setup-runtime.js";
import { SetupFailure } from "../setup.service.js";
import type { Setup } from "../setup.service.js";
import { ResultReporter } from "./result-reporter.js";

@Command({
  name: "setup",
  description: "Install a compatible Kepler generation without changing user resources",
})
export class SetupCommand extends CommandRunner {
  constructor(
    @Inject(SETUP_OPERATION) private readonly setup: Setup,
    private readonly reporter: ResultReporter,
  ) {
    super();
  }

  async run(
    _passedParams: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result = this.setup.setup();
      this.reporter.report({ status: "success", data: { ...result } });
    } catch (error) {
      this.reporter.report({
        status: "failed",
        data: {
          code: error instanceof SetupFailure ? error.code : "setup_failed",
          message: this.errorMessage(error),
          details: error instanceof SetupFailure ? error.details : {},
          recovery:
            error instanceof SetupFailure
              ? error.recovery
              : "Review the failure and resolve it before retrying setup.",
        },
      });
    }
  }


  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
