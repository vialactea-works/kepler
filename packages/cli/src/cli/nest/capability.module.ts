import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CLI_RELEASE } from "../version.js";
import {
  GitAuthorLookup,
} from "../git-author.js";
import { HistoryAccess } from "../../history/access.js";
import { createNodeHistoryAccess } from "../../history/access-runtime.js";
import { HistoryMutations } from "../../history/mutations.js";
import { MissionMutations } from "../mission-mutations.js";
import { MissionStartup } from "../../construction/mission-startup.js";
import { UnitCreate } from "../../construction/unit-create.js";
import { UnitQueries } from "../../construction/unit-queries.js";
import { ConstructionQueries } from "../../construction/scoped-queries.js";
import { TaskAdmission, createNodeTaskAdmissionRuntime } from "../../construction/task-admission.js";
import { ActivityExecution, createNodeActivityExecutionRuntime } from "../../construction/activity-execution.js";
import { IntegrationExecution, createNodeIntegrationExecutionRuntime } from "../../construction/integration-execution.js";
import { ConstructionLint } from "../../construction/construction-lint.js";
import { createNodeUnitQueryFileSystem } from "../../construction/unit-queries-runtime.js";
import { createNodeRepositoryArtifactFileSystem } from "../../construction/artifacts.js";
import { createNodeConstructionMaterialReader } from "../../construction/node-material-reader.js";
import { createNodeUnitCreateRecords, machineLocalDate } from "../../construction/unit-create-runtime.js";
import {
  createNodeFunctionalDesignStageCompletionRuntime,
  FunctionalDesignStageCompletion,
} from "../../construction/stage-completion.js";
import {
  createNodeQualityStageCompletionRuntime,
  QualityRequirementsStageCompletion,
} from "../../construction/quality-stage-completion.js";
import {
  createNodePlanningStageCompletionRuntime,
  ImplementationPlanningStageCompletion,
} from "../../construction/planning-stage-completion.js";
import {
  createNodeImplementationStageCompletionRuntime,
  ImplementationStageCompletion,
} from "../../construction/implementation-stage-completion.js";
import {
  createNodeImplementationRetainedScopeAssessmentRuntime,
  ImplementationRetainedScopeAssessment,
} from "../../construction/implementation-retained-scope-assessment.js";
import {
  createNodeUnitOfWorkReviewCompletionRuntime,
  UnitOfWorkReviewStageCompletion,
} from "../../construction/unit-of-work-review-completion.js";
import {
  createNodeDeliverStageCompletionRuntime,
  DeliverStageCompletion,
} from "../../construction/deliver-stage-completion.js";
import { MissionHandoffPreflight } from "../../construction/mission-handoff-preflight.js";
import { createNodeStageStartRuntime, StageStart } from "../../construction/stage-start.js";
import { ConstructionPauseResume, createNodeConstructionPauseResumeRuntime } from "../../construction/pause-resume.js";
import { Revision } from "../../construction/revision.js";
import { AuditContextResolver, createNodeAuditContextRuntime } from "../../audit/context.js";
import { AuditRecording } from "../../audit/recording.js";
import { AuditRequestInput } from "../../audit/request-input.js";
import { AuditQueries } from "../../audit/queries.js";
import { createMissionWorkspacePreparation } from "../../construction/mission-workspace.js";
import { ConstructionDiffPackageSources } from "../../construction/diff-package-source.js";
import { GitDiffPackageAdapter } from "../../workbench/git-diff-package.js";
import { GitDiffPackageService } from "../../workbench/diff-package.js";
import { createNodeMissionWorkspaceRuntime } from "../../construction/mission-workspace-runtime.js";
import { createNodeMissionStartupRecoveryRuntime } from "../../construction/mission-startup-recovery-runtime.js";
import { MetadataLinter } from "../metadata-lint.js";
import { PROJECT_SELECTION_RUNTIME, ProjectSelectionModule } from "../project-selection.module.js";
import {
  ProjectResolver,
  type ProjectSelectionRuntime,
} from "../project-selection.js";
import {
  AuditCommand,
  AuditRecordCommandGroup,
  AuditRecordEvidenceCommand,
  AuditRecordApprovalCommand,
  AuditRecordInteractionCommand,
  AuditListCommand,
  AuditShowCommand,
  ConstructionCommand,
  ConstructionStageCommand,
  ConstructionStageShowCommand,
  ConstructionTaskCommand,
  ConstructionTaskListCommand,
  ConstructionTaskShowCommand,
  ConstructionTaskReadyCommand,
  ConstructionTaskAdmitCommand,
  ConstructionActivityCommand,
  ConstructionActivityStartCommand,
  ConstructionActivityCompleteCommand,
  ConstructionActivityShowCommand,
  ConstructionActivityPauseCommand,
  ConstructionActivityResumeCommand,
  ConstructionIntegrationCommand,
  ConstructionIntegrationLockCommand,
  ConstructionIntegrationPrepareCommand,
  ConstructionIntegrationEvidenceCommand,
  ConstructionIntegrationAcceptCommand,
  ConstructionIntegrationReleaseCommand,
  ConstructionLintCommand,
  ConstructionUnitCommand,
  ConstructionUnitCreateCommand,
  ConstructionUnitListCommand,
  ConstructionUnitShowCommand,
  ConstructionStageCompleteCommand,
  ConstructionStageStartCommand,
  ConstructionStagePauseCommand,
  ConstructionStageResumeCommand,
  ConstructionStageAssessRetainedScopesCommand,
  ConstructionReviseCommand,
  GitAuthorCommand,
  GitCommand,
  MetadataLintCommand,
  MissionCommand,
  MissionCreateCommand,
  MissionPrepareCommand,
  UuidCommand,
  WorkflowCommand,
} from "./capability.commands.js";
import {
  GIT_DIFF_PACKAGE_OPERATION,
  GitDiffPackageCommand,
  GitDiffPackageIntegrationCommand,
  GitDiffPackageUnitReviewCommand,
  GitDiffPackageValidationCommand,
} from "./diff-package.commands.js";
import { ResultModule } from "./result.module.js";

const cliVersion = process.env.KEPLER_CLI_RELEASE ?? CLI_RELEASE;
const constructionMaterialReader = createNodeConstructionMaterialReader(createNodeRepositoryArtifactFileSystem());

@Module({
  imports: [ResultModule, ProjectSelectionModule],
  providers: [
    {
      provide: HistoryAccess,
      useFactory: () => createNodeHistoryAccess(createNodeMissionWorkspaceRuntime()),
    },
    {
      provide: HistoryMutations,
      useFactory: (access: HistoryAccess) => new HistoryMutations(access),
      inject: [HistoryAccess],
    },
    {
      provide: MissionMutations,
      useFactory: (projects: ProjectResolver, units: UnitQueries, mutations: HistoryMutations) => new MissionMutations(projects, units, mutations),
      inject: [ProjectResolver, UnitQueries, HistoryMutations],
    },
    GitCommand,
    GitAuthorCommand,
    GitDiffPackageCommand,
    GitDiffPackageValidationCommand,
    GitDiffPackageIntegrationCommand,
    GitDiffPackageUnitReviewCommand,
    UuidCommand,
    MetadataLintCommand,
    AuditCommand,
    AuditRecordCommandGroup,
    AuditRecordEvidenceCommand,
    AuditRecordApprovalCommand,
    AuditRecordInteractionCommand,
    AuditRequestInput,
    AuditListCommand,
    AuditShowCommand,
    WorkflowCommand,
    ConstructionCommand,
    ConstructionStageCommand,
    ConstructionStageShowCommand,
    ConstructionTaskCommand,
    ConstructionTaskListCommand,
    ConstructionTaskShowCommand,
    ConstructionTaskReadyCommand,
    ConstructionTaskAdmitCommand,
    ConstructionActivityCommand,
    ConstructionActivityStartCommand,
    ConstructionActivityCompleteCommand,
    ConstructionActivityShowCommand,
    ConstructionActivityPauseCommand,
    ConstructionActivityResumeCommand,
    ConstructionIntegrationCommand,
    ConstructionIntegrationLockCommand,
    ConstructionIntegrationPrepareCommand,
    ConstructionIntegrationEvidenceCommand,
    ConstructionIntegrationAcceptCommand,
    ConstructionIntegrationReleaseCommand,
    ConstructionLintCommand,
    ConstructionUnitCommand,
    ConstructionUnitCreateCommand,
    ConstructionUnitListCommand,
    ConstructionUnitShowCommand,
    ConstructionStageCompleteCommand,
    ConstructionStageStartCommand,
    ConstructionStagePauseCommand,
    ConstructionStageResumeCommand,
    ConstructionStageAssessRetainedScopesCommand,
    ConstructionReviseCommand,
    FunctionalDesignStageCompletion,
    QualityRequirementsStageCompletion,
    ImplementationPlanningStageCompletion,
    ImplementationStageCompletion,
    UnitOfWorkReviewStageCompletion,
    DeliverStageCompletion,
    StageStart,
    MissionCommand,
    MissionCreateCommand,
    MissionPrepareCommand,
    {
      provide: AuditContextResolver,
      useFactory: (projects: ProjectResolver, queries: ConstructionQueries, access: HistoryAccess, mutations: HistoryMutations) => new AuditContextResolver(
        createNodeAuditContextRuntime(projects, access, mutations.auditJournals, async (unitId, taskId, project) =>
          (await queries.taskExecutionContext(unitId, taskId, project)).kind === "execution-context"),
      ),
      inject: [ProjectResolver, ConstructionQueries, HistoryAccess, HistoryMutations],
    },
    {
      provide: GIT_DIFF_PACKAGE_OPERATION,
      useFactory: (contexts: AuditContextResolver) => new GitDiffPackageService(
        new ConstructionDiffPackageSources(contexts),
        new GitDiffPackageAdapter(),
      ),
      inject: [AuditContextResolver],
    },
    {
      provide: AuditQueries,
      useFactory: (contexts: AuditContextResolver) => new AuditQueries(contexts),
      inject: [AuditContextResolver],
    },
    {
      provide: FunctionalDesignStageCompletion,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new FunctionalDesignStageCompletion(
        contexts,
        createNodeFunctionalDesignStageCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: ImplementationPlanningStageCompletion,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new ImplementationPlanningStageCompletion(
        contexts,
        createNodePlanningStageCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: ImplementationStageCompletion,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new ImplementationStageCompletion(
        contexts,
        createNodeImplementationStageCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: ImplementationRetainedScopeAssessment,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new ImplementationRetainedScopeAssessment(
        contexts,
        createNodeImplementationRetainedScopeAssessmentRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: UnitOfWorkReviewStageCompletion,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new UnitOfWorkReviewStageCompletion(
        contexts,
        createNodeUnitOfWorkReviewCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: DeliverStageCompletion,
      useFactory: (contexts: AuditContextResolver, handoffPreflight: MissionHandoffPreflight, mutations: HistoryMutations) => new DeliverStageCompletion(
        contexts,
        createNodeDeliverStageCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
        handoffPreflight,
      ),
      inject: [AuditContextResolver, MissionHandoffPreflight, HistoryMutations],
    },
    {
      provide: QualityRequirementsStageCompletion,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new QualityRequirementsStageCompletion(
        contexts,
        createNodeQualityStageCompletionRuntime({ name: "kepler", version: cliVersion }, constructionMaterialReader, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: StageStart,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new StageStart(
        contexts,
        createNodeStageStartRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: ConstructionPauseResume,
      useFactory: (contexts: AuditContextResolver, queries: ConstructionQueries, mutations: HistoryMutations) => new ConstructionPauseResume(
        contexts,
        queries,
        createNodeConstructionPauseResumeRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, ConstructionQueries, HistoryMutations],
    },
    {
      provide: Revision,
      useFactory: (contexts: AuditContextResolver, mutations: HistoryMutations) => new Revision(
        contexts,
        createNodeStageStartRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, HistoryMutations],
    },
    {
      provide: AuditRecording,
      useFactory: (contexts: AuditContextResolver) => new AuditRecording(contexts, {
        identities: { next: randomUUID },
        now: () => new Date().toISOString(),
        producer: { name: "kepler", version: cliVersion },
      }),
      inject: [AuditContextResolver],
    },
    {
      provide: MissionHandoffPreflight,
      useFactory: () => new MissionHandoffPreflight(createNodeMissionWorkspaceRuntime()),
    },
    {
      provide: UnitCreate,
      useFactory: (projects: ProjectResolver, access: HistoryAccess, mutations: HistoryMutations) => new UnitCreate({
        projects: { resolve: (project) => projects.resolve(project) },
        workspace: createNodeMissionWorkspaceRuntime(),
        records: createNodeUnitCreateRecords(access),
        journals: mutations.journals,
        identities: { next: randomUUID },
        today: machineLocalDate,
        now: () => new Date().toISOString(),
        producer: { name: "kepler", version: cliVersion },
      }),
      inject: [ProjectResolver, HistoryAccess, HistoryMutations],
    },
    {
      provide: UnitQueries,
      useFactory: (projects: ProjectResolver, access: HistoryAccess) => new UnitQueries(projects, createNodeUnitQueryFileSystem(), access),
      inject: [ProjectResolver, HistoryAccess],
    },
    {
      provide: ConstructionQueries,
      useFactory: (units: UnitQueries) => new ConstructionQueries(units, createNodeUnitQueryFileSystem()),
      inject: [UnitQueries],
    },
    {
      provide: TaskAdmission,
      useFactory: (contexts: AuditContextResolver, queries: ConstructionQueries, mutations: HistoryMutations) => new TaskAdmission(
        contexts,
        queries,
        createNodeTaskAdmissionRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, ConstructionQueries, HistoryMutations],
    },
    {
      provide: ActivityExecution,
      useFactory: (contexts: AuditContextResolver, queries: ConstructionQueries, mutations: HistoryMutations) => new ActivityExecution(
        contexts,
        queries,
        createNodeActivityExecutionRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, ConstructionQueries, HistoryMutations],
    },
    {
      provide: IntegrationExecution,
      useFactory: (contexts: AuditContextResolver, queries: ConstructionQueries, mutations: HistoryMutations) => new IntegrationExecution(
        contexts,
        queries,
        createNodeIntegrationExecutionRuntime({ name: "kepler", version: cliVersion }, mutations.journals),
      ),
      inject: [AuditContextResolver, ConstructionQueries, HistoryMutations],
    },
    {
      provide: ConstructionLint,
      useFactory: (units: UnitQueries) => new ConstructionLint(units, createNodeUnitQueryFileSystem()),
      inject: [UnitQueries],
    },
    {
      provide: MissionStartup,
      useFactory: (projects: ProjectResolver) => {
        const workspaceRuntime = createNodeMissionWorkspaceRuntime();
        return new MissionStartup({
          projects: { resolve: (project) => projects.resolve(project) },
          workspaces: createMissionWorkspacePreparation(workspaceRuntime),
          recovery: createNodeMissionStartupRecoveryRuntime(workspaceRuntime),
          identities: { next: randomUUID },
          now: () => new Date().toISOString(),
          producer: { name: "kepler", version: cliVersion },
        });
      },
      inject: [ProjectResolver],
    },
    {
      provide: GitAuthorLookup,
      useFactory: (
        projects: ProjectResolver,
        runtime: ProjectSelectionRuntime,
      ) => new GitAuthorLookup(projects, runtime.git),
      inject: [ProjectResolver, PROJECT_SELECTION_RUNTIME],
    },
    {
      provide: MetadataLinter,
      useFactory: () => new MetadataLinter(),
    },
  ],
})
export class CapabilityModule {}
