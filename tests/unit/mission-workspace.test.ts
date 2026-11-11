import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import type { MissionCoordination } from "../../packages/cli/src/construction/mission-coordination.js";
import type { InspectedMissionRepository } from "../../packages/cli/src/construction/mission-startup.js";
import type { MissionId } from "../../packages/cli/src/construction/events.js";
import {
  createMissionWorkspacePreparation,
  missionIntegrationTargetKey,
  missionWorkspaceKey,
  type MissionWorkspaceRuntime,
} from "../../packages/cli/src/construction/mission-workspace.js";

const recordHome = "/record";
const commonDirectory = Path.join(recordHome, ".git");
const missionId = "11111111-1111-4111-8111-111111111111" as MissionId;
const commit = "a".repeat(40);
const workspaceKey = missionWorkspaceKey(commonDirectory, recordHome);
const targetKey = missionIntegrationTargetKey(commonDirectory, "refs/heads/main");
const attachmentPath = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces", `${workspaceKey}.json`);
const repository: InspectedMissionRepository = {
  repositoryId: "record-home",
  context: { kind: "existing" },
  branchSelection: { kind: "current" },
  resolvedBranch: "main",
  integrationTarget: "refs/heads/main",
  integrationTargetKey: targetKey,
  startingCheckpoint: { kind: "commit", commit },
  repositoryPath: recordHome,
  recordHomePath: recordHome,
  gitDirectory: commonDirectory,
  commonDirectory,
  localWorkspaceKey: workspaceKey,
  workspacePath: recordHome,
  workspaceKind: "existing",
  sourcePath: recordHome,
  recordHomeRepositoryId: "record-home",
  recordHomeCommonDirectory: commonDirectory,
  initialDirtyPaths: [],
  initialBranch: "main",
  initialCheckpoint: { kind: "commit", commit },
};

const createRuntime = (options: {
  readonly pathProbeError?: boolean;
  readonly attachmentWriteError?: boolean;
  readonly releaseError?: boolean;
} = {}) => {
  let releaseAttempts = 0;
  const runtime: MissionWorkspaceRuntime = {
    cwd: recordHome,
    git: {
      run: async (_cwd, args) => {
        const command = args.join(" ");
        if (command === "rev-parse --is-bare-repository") return { status: 0, stdout: "false\n", stderr: "" };
        if (command === "rev-parse --show-toplevel") return { status: 0, stdout: `${recordHome}\n`, stderr: "" };
        if (command === "rev-parse --git-dir" || command === "rev-parse --git-common-dir") {
          return { status: 0, stdout: ".git\n", stderr: "" };
        }
        if (command === "symbolic-ref --quiet --short HEAD") return { status: 0, stdout: "main\n", stderr: "" };
        if (command === "rev-parse --verify --end-of-options HEAD^{commit}") return { status: 0, stdout: `${commit}\n`, stderr: "" };
        if (command === "status --porcelain=v1 --untracked-files=all -z") return { status: 0, stdout: "", stderr: "" };
        throw new Error(`Unexpected Git command: ${command}`);
      },
      findReachableObjects: async () => ({ status: 0, objectIds: [], stderr: "" }),
    },
    fileSystem: {
      pathKind: async (path) => {
        if (path === attachmentPath && options.pathProbeError) throw new Error("injected attachment path probe failure");
        if (path === attachmentPath) return "missing";
        return "directory";
      },
      realpath: async (path) => path,
      mkdir: async () => undefined,
      readFile: async () => { throw new Error("not used"); },
      writeFileExclusive: async () => {
        if (options.attachmentWriteError) throw new Error("injected attachment write failure");
      },
    },
    coordination: {
      acquire: async (request) => ({
        kind: "acquired",
        lease: {
          lockPath: Path.join(request.commonDirectory, "kepler", "workspaces", request.resourceKey),
          owner: { ...request.owner, token: "22222222-2222-4222-8222-222222222222" },
          release: async () => {
            releaseAttempts += 1;
            if (options.releaseError) throw new Error("injected lease release failure");
            return { kind: "released" };
          },
        },
      }),
      release: async () => ({ kind: "released" }),
    } satisfies MissionCoordination,
    identity: {
      machine_id: "test-machine",
      process_id: 1,
      process_incarnation_id: "33333333-3333-4333-8333-333333333333",
    },
  };
  return { runtime, releaseAttempts: () => releaseAttempts };
};

describe("mission workspace preparation lease handling", () => {
  it("releases exactly once after an attachment probe throws and preserves prepared Git facts", async () => {
    const { runtime, releaseAttempts } = createRuntime({ pathProbeError: true });
    const result = await createMissionWorkspacePreparation(runtime).prepare(recordHome, missionId, [repository], {
      missionJournalPath: Path.join(recordHome, ".kepler", "missions", missionId, "history", "construction", "journal.jsonl"),
    });

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_attachment_write_failed",
      details: {
        message: "injected attachment path probe failure",
        partial_effects: [{
          repository_id: "record-home",
          workspace_path: recordHome,
          workspace_id: workspaceKey,
          branch: "main",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit },
          state: "git-prepared-attachment-failed",
        }],
      },
    });
    expect(releaseAttempts()).toBe(1);
  });

  it("preserves an attachment failure when lease release also throws", async () => {
    const { runtime, releaseAttempts } = createRuntime({ attachmentWriteError: true, releaseError: true });
    const result = await createMissionWorkspacePreparation(runtime).prepare(recordHome, missionId, [repository], {
      missionJournalPath: Path.join(recordHome, ".kepler", "missions", missionId, "history", "construction", "journal.jsonl"),
    });

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_attachment_write_failed",
      message: "The prepared workspace could not be recorded in the selected record home.",
      details: {
        message: "injected attachment write failure",
        coordination_release: {
          kind: "failed",
          code: "coordination_release_failed",
          details: { message: "injected lease release failure" },
        },
        partial_effects: [{
          repository_id: "record-home",
          workspace_path: recordHome,
          workspace_id: workspaceKey,
          branch: "main",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit },
          state: "git-prepared-attachment-failed",
        }],
      },
    });
    expect(releaseAttempts()).toBe(1);
  });
});
