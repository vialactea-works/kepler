import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { execaSync } from "execa";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../../../packages/cli/src/construction/events.js";
import { missionWorkspaceKey } from "../../../../packages/cli/src/construction/mission-workspace.js";

export const auditFixture = {
  missionId: "10000000-0000-4000-8000-000000000001",
  unitId: "2026-10-21-audit-e2e",
  journalId: "20000000-0000-4000-8000-000000000002",
  stageAttemptId: "30000000-0000-4000-8000-000000000003",
  priorStageAttemptId: "d0000000-0000-4000-8000-00000000000d",
  implementationAttemptId: "60000000-0000-4000-8000-000000000006",
  baselineEventId: "e0000000-0000-4000-8000-00000000000e",
  taskId: "70000000-0000-4000-8000-000000000007",
  activityAttemptId: "80000000-0000-4000-8000-000000000008",
  eventIds: [
    "40000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000005",
  ],
} as const;

const event = (id: string, type: string, data: Record<string, unknown>, causedBy: readonly string[] = []) => ({
  id,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: 1,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: auditFixture.journalId,
  recorded_at: "2026-10-21T12:00:00Z",
  producer: { name: "fixture", version: "1" },
  caused_by: [...causedBy],
  data,
});

export const createAuditHistory = async (
  repository: string,
  unitDirectory = `construction/units-of-work/${auditFixture.unitId}`,
  options: { readonly includeImplementationFacts?: boolean } = {},
): Promise<string> => {
  const historyDirectory = Path.join(repository, ".kepler", "missions", auditFixture.missionId, "history", CONSTRUCTION_PHASE);
  await Fs.mkdir(historyDirectory, { recursive: true });
  const repositoryPath = await Fs.realpath(repository);
  const commonDirectory = await Fs.realpath(Path.join(repositoryPath, ".git"));
  const startingCommit = execaSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryPath,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    extendEnv: false,
    timeout: 15_000,
  }).stdout.trim();
  const workspaceId = missionWorkspaceKey(commonDirectory, repositoryPath);
  const missionCreatedId = "f0000000-0000-4000-8000-00000000000f";
  const facts = [
    event(missionCreatedId, "construction.mission-created", {
      mission_id: auditFixture.missionId,
      title: "Prepare the selected implementation work",
      request: "Implement the reviewed unit behavior.",
      workflow: "standard",
      record_home: { repository_id: "repo-main" },
      contexts: [],
      repositories: [{
        repository_id: "repo-main",
        context: { kind: "existing" },
        branch: { kind: "current" },
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "commit", commit: startingCommit },
      }],
    }),
    event("96000000-0000-4000-8000-000000000096", "construction.mission-workspaces-prepared", {
      mission_id: auditFixture.missionId,
      repositories: [{
        repository_id: "repo-main",
        context: { kind: "existing" },
        branch: "main",
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "commit", commit: startingCommit },
      }],
    }, [missionCreatedId]),
    event(auditFixture.eventIds[0], "construction.unit-created", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      directory: unitDirectory,
      workflow: "standard",
      initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" },
    }, [missionCreatedId]),
    event(auditFixture.eventIds[1], "construction.stage-attempt-started", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "functional-design",
      stage_attempt_id: auditFixture.priorStageAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }, [auditFixture.eventIds[0]]),
    event("91000000-0000-4000-8000-000000000019", "construction.interaction-recorded", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "functional-design",
      stage_attempt_id: auditFixture.priorStageAttemptId,
      participants: ["Requester"],
      content: "Reopen Functional Design after review.",
      references: [],
    }, [auditFixture.eventIds[1]]),
    event("92000000-0000-4000-8000-000000000029", "construction.revision-authorized", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      revision_id: "a1000000-0000-4000-8000-00000000001a",
      orchestrator_decision: "Reopen Functional Design",
      reason: "The previous attempt needs correction.",
      stage: "functional-design",
      stage_attempt_id: auditFixture.priorStageAttemptId,
    }, ["91000000-0000-4000-8000-000000000019"]),
    event("93000000-0000-4000-8000-000000000039", "construction.stage-attempt-ended-by-revision", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "functional-design",
      stage_attempt_id: auditFixture.priorStageAttemptId,
      revision_id: "a1000000-0000-4000-8000-00000000001a",
      reason: "The prior attempt ended for revision.",
    }, ["92000000-0000-4000-8000-000000000029"]),
    event("94000000-0000-4000-8000-000000000049", "construction.stage-reopened", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "functional-design",
      stage_attempt_id: auditFixture.priorStageAttemptId,
      revision_id: "a1000000-0000-4000-8000-00000000001a",
      reason: "Begin the revised attempt.",
    }, ["93000000-0000-4000-8000-000000000039", "92000000-0000-4000-8000-000000000029"]),
    event("95000000-0000-4000-8000-000000000059", "construction.stage-attempt-started", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "functional-design",
      stage_attempt_id: auditFixture.stageAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }, ["94000000-0000-4000-8000-000000000049"]),
    event(auditFixture.baselineEventId, "construction.unit-baseline-selected", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      review_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      integration_targets: [{ repository_id: "repo-main", target: "main" }],
    }, [auditFixture.eventIds[0]]),
    event("90000000-0000-4000-8000-000000000009", "construction.stage-attempt-started", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "implementation",
      stage_attempt_id: auditFixture.implementationAttemptId,
      inputs: [],
      checkpoints: [],
      authority_event_ids: [],
    }, [auditFixture.eventIds[0]]),
    event("a0000000-0000-4000-8000-00000000000a", "construction.task-admitted", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "implementation",
      stage_attempt_id: auditFixture.implementationAttemptId,
      task_id: auditFixture.taskId,
      graph_ref: { graph_id: "b0000000-0000-4000-8000-00000000000b", content_version: "graph-1" },
      task_definition_ref: { graph_id: "b0000000-0000-4000-8000-00000000000b", task_id: auditFixture.taskId, content_version: "task-1" },
      admission_baseline: [{ repository_id: "repo-main", commit: "checkpoint-start" }],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    }, ["90000000-0000-4000-8000-000000000009", "e0000000-0000-4000-8000-00000000000e"]),
    event("c0000000-0000-4000-8000-00000000000c", "construction.activity-attempt-started", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "implementation",
      stage_attempt_id: auditFixture.implementationAttemptId,
      task_id: auditFixture.taskId,
      activity: "code-generation",
      activity_attempt_id: auditFixture.activityAttemptId,
      inputs: [],
      checkpoints: [],
    }, ["a0000000-0000-4000-8000-00000000000a"]),
  ];
  const selectedFacts = options.includeImplementationFacts === false
    ? facts.filter((fact) => !(
      fact.data.stage === "implementation" &&
      ["construction.stage-attempt-started", "construction.task-admitted", "construction.activity-attempt-started"].includes(fact.type)
    ))
    : facts;
  const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", auditFixture.missionId, "workspaces");
  await Fs.mkdir(attachmentDirectory, { recursive: true });
  await Fs.writeFile(Path.join(attachmentDirectory, `${workspaceId}.json`), `${JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: auditFixture.missionId,
    record_home_repository_id: "repo-main",
    repository_id: "repo-main",
    workspace_id: workspaceId,
    workspace_path: repositoryPath,
    repository_path: repositoryPath,
    git_directory: commonDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit: startingCommit },
  })}\n`);
  const journalPath = Path.join(historyDirectory, `${auditFixture.journalId}.jsonl`);
  await Fs.writeFile(journalPath, `${selectedFacts.map((fact) => JSON.stringify(fact)).join("\n")}\n`);
  return journalPath;
};
