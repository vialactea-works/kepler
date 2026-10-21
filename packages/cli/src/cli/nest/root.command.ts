import type { OnApplicationBootstrap } from "@nestjs/common";
import { CommandRunner, RootCommand } from "nest-commander";
import {
  AuditCommand,
  GitCommand,
  MetadataLintCommand,
  MissionCommand,
  UuidCommand,
  WorkflowCommand,
} from "./capability.commands.js";
import { SetupCommand } from "./setup.command.js";
import { WorkbenchCommand } from "./workbench.command.js";

@RootCommand({
  name: "kepler",
  description: "Kepler workflow CLI",
  subCommands: [
    SetupCommand,
    UuidCommand,
    WorkbenchCommand,
    GitCommand,
    MetadataLintCommand,
    AuditCommand,
    MissionCommand,
    WorkflowCommand,
  ],
})
export class KeplerRootCommand
  extends CommandRunner
  implements OnApplicationBootstrap
{
  onApplicationBootstrap(): void {
    const configureExitOverride = (command: typeof this.command): void => {
      command.exitOverride((error) => {
        throw error;
      });
      command.commands.forEach((child) => {
        child.allowExcessArguments(false);
        configureExitOverride(child);
      });
    };

    configureExitOverride(this.command);
  }

  async run(
    passedParams: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    if (passedParams.length > 0) {
      this.command.error(`unknown command '${passedParams[0]}'`, {
        code: "commander.unknownCommand",
        exitCode: 1,
      });
    }

    this.command.help();
  }
}
