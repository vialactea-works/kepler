import { Module } from "@nestjs/common";
import { createSetupRuntime, SETUP_OPERATION } from "../setup-runtime.js";
import { ResultModule } from "./result.module.js";
import { SetupCommand } from "./setup.command.js";

@Module({
  imports: [ResultModule],
  providers: [SetupCommand, { provide: SETUP_OPERATION, useFactory: createSetupRuntime }],
  exports: [SETUP_OPERATION],
})
export class SetupModule {}
