import { Module } from "@nestjs/common";
import { WorkbenchModule } from "./nest/workbench.module.js";
import { CapabilityModule } from "./nest/capability.module.js";
import { KeplerRootCommand } from "./nest/root.command.js";
import { SetupModule } from "./nest/setup.module.js";
import { RecoveryModule } from "./nest/recovery.module.js";

@Module({
  imports: [SetupModule, WorkbenchModule, CapabilityModule, RecoveryModule],
  providers: [KeplerRootCommand],
})
export class AppModule {}
