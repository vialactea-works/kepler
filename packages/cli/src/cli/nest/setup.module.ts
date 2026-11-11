import { Module } from "@nestjs/common";
import { CLI_RELEASE } from "../version.js";
import {
  createSetupRuntime,
  SETUP_RUNTIME,
  SETUP_BUNDLE_LOCATOR,
  SETUP_CLI_RELEASE,
  SETUP_FILES,
  SETUP_OPERATION,
  SETUP_PLATFORM,
  type SetupRuntime,
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
      provide: SETUP_RUNTIME,
      useFactory: () => createSetupRuntime(),
    },
    {
      provide: SETUP_OPERATION,
      useFactory: (
        files: SetupFiles,
        bundleLocator: SetupBundleLocator,
        cliRelease: string,
        platform: { readonly os: string; readonly arch: string },
      ) => new SetupService(files, bundleLocator, cliRelease, platform),
      inject: [SETUP_FILES, SETUP_BUNDLE_LOCATOR, SETUP_CLI_RELEASE, SETUP_PLATFORM],
    },
    {
      provide: SETUP_FILES,
      useFactory: (runtime: SetupRuntime) => runtime.files,
      inject: [SETUP_RUNTIME],
    },
    {
      provide: SETUP_BUNDLE_LOCATOR,
      useFactory: (runtime: SetupRuntime) => runtime.bundleLocator,
      inject: [SETUP_RUNTIME],
    },
    {
      provide: SETUP_CLI_RELEASE,
      useFactory: () => process.env.KEPLER_CLI_RELEASE ?? CLI_RELEASE,
    },
    {
      provide: SETUP_PLATFORM,
      useFactory: () => ({ os: process.platform, arch: process.arch }),
    },
  ],
  exports: [SETUP_OPERATION, SETUP_FILES, SETUP_BUNDLE_LOCATOR],
})
export class SetupModule {}
