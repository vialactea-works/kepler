import { Module } from "@nestjs/common";
import { AuditRequestInput } from "../../audit/request-input.js";
import { createNodeRecoveryHistoryExecution } from "../recovery-execution.js";
import { RECOVERY_HISTORY_EXECUTION, RecoveryMigrateCommand, RecoveryResetCommand, RecoveryReconstructCommand, RecoveryPublishCommand } from "./recovery-mutation.command.js";
import { HistoryArchives } from "../../history/archives.js";
import { createNodeHistoryAccess } from "../../history/access-runtime.js";
import { inspectMissionHistory } from "../../history/inspection.js";
import { ProjectSelectionModule } from "../project-selection.module.js";
import { ResultModule } from "./result.module.js";
import {
  RECOVERY_HISTORY_INSPECTION,
  RecoveryCommand,
  RecoveryInspectCommand,
  RecoveryStatusCommand,
  type RecoveryHistoryInspection,
} from "./recovery.command.js";

const createRecoveryHistoryInspection = (): RecoveryHistoryInspection => {
  const access = createNodeHistoryAccess();
  const archives = new HistoryArchives(access.storage);
  return (request) => inspectMissionHistory(request, { access, archives });
};

@Module({
  imports: [ProjectSelectionModule, ResultModule],
  providers: [
    RecoveryCommand,
    RecoveryInspectCommand,
    RecoveryStatusCommand,
    RecoveryMigrateCommand,
    RecoveryResetCommand,
    RecoveryReconstructCommand,
    RecoveryPublishCommand,
    AuditRequestInput,
    { provide: RECOVERY_HISTORY_EXECUTION, useFactory: createNodeRecoveryHistoryExecution },
    {
      provide: RECOVERY_HISTORY_INSPECTION,
      useFactory: createRecoveryHistoryInspection,
    },
  ],
})
export class RecoveryModule {}
