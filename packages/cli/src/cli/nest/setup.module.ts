import { Module } from "@nestjs/common";
import {
  createSetupRuntime,
  SETUP_BUNDLE_LOCATOR,
  SETUP_FILES,
  SETUP_OPERATION,
} from "../setup-runtime.js";
import {
  SetupService,
  type SetupBundleLocator,
  type SetupFiles,
} from "../setup.service.js";
import { ResultModule } from "./result.module.js";
import { SetupCommand } from "./setup.command.js";

@Module({
  imports: [ResultModule],
  providers: [
    SetupCommand,
    {
      provide: SETUP_OPERATION,
      useFactory: (files: SetupFiles, bundleLocator: SetupBundleLocator) =>
        new SetupService(files, bundleLocator),
      inject: [SETUP_FILES, SETUP_BUNDLE_LOCATOR],
    },
    {
      provide: SETUP_FILES,
      useFactory: () => createSetupRuntime().files,
    },
    {
      provide: SETUP_BUNDLE_LOCATOR,
      useFactory: () => createSetupRuntime().bundleLocator,
    },
  ],
  exports: [SETUP_OPERATION, SETUP_FILES, SETUP_BUNDLE_LOCATOR],
})
export class SetupModule {}
