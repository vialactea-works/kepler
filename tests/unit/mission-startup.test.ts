import { describe, expect, it } from "vitest";
import {
  MissionStartup,
  validateMissionStartupRequest,
  type InspectedMissionRepository,
  type MissionStartupRuntime,
  type PreparedMissionRepository,
} from "../../packages/cli/src/construction/mission-startup.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
];

const request = {
  title: "Implement the requested capability",
  request: "Implement the reviewed requirement in the selected repository.",
  workflow: "standard",
  recordHomeRepositoryId: "record-home",
  contexts: [{ reference: "opaque:product-brief", purpose: "Request context" }],
  repositories: [{
    repositoryId: "code-repository",
    workspace: { kind: "existing", path: "/code/repository" },
    branch: { kind: "current" },
    integrationTarget: "refs/heads/main",
  }],
};

const inspected: InspectedMissionRepository = {
  repositoryId: "code-repository",
  context: { kind: "existing" },
  branchSelection: { kind: "current" },
  resolvedBranch: "feature/requested-work",
  integrationTarget: "refs/heads/main",
  integrationTargetKey: "b".repeat(64),
  startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
  repositoryPath: "/code/repository",
  gitDirectory: "/code/repository/.git",
  commonDirectory: "/code/repository/.git",
  localWorkspaceKey: "workspace-key",
  workspacePath: "/code/repository",
  workspaceKind: "existing",
  sourcePath: "/code/repository",
  recordHomeRepositoryId: "record-home",
  recordHomeCommonDirectory: "/record/.git",
};

const prepared: PreparedMissionRepository = {
  repositoryId: "code-repository",
  context: { kind: "existing" },
  branch: "feature/requested-work",
  integrationTarget: "refs/heads/main",
  startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
  localWorkspaceKey: "workspace-key",
  workspacePath: "/code/repository",
};

const createRuntime = (overrides: {
  readonly resolve?: () => Promise<unknown>;
  readonly inspect?: () => Promise<unknown>;
  readonly prepare?: () => Promise<unknown>;
  readonly append?: (event: unknown) => Promise<unknown>;
  readonly ids?: readonly string[];
} = {}) => {
  const events: unknown[] = [];
  const effects: string[] = [];
  let nextId = 0;
  const configuredIds = overrides.ids ?? ids;
  const journal: EventJournal = {
    path: `/record/.kepler/missions/${configuredIds[0]}/history/construction/${configuredIds[1]}.jsonl`,
    read: async () => {
      throw new Error("not used");
    },
    append: async (event) => {
      events.push(event);
      effects.push("append");
      return overrides.append ? await overrides.append!(event) as never : { status: "appended", eventId: "event", line: events.length };
    },
  };
  const runtime: MissionStartupRuntime = {
    projects: {
      resolve: overrides.resolve
        ? async () => await overrides.resolve!() as never
        : async () => ({ kind: "resolved", root: "/record" }),
    },
    workspaces: {
      inspect: overrides.inspect
        ? async () => await overrides.inspect!() as never
        : async () => {
          effects.push("inspect");
          return { kind: "inspected", repositories: [inspected] };
        },
      prepare: overrides.prepare
        ? async () => await overrides.prepare!() as never
        : async () => {
          effects.push("prepare");
          return { kind: "prepared", repositories: [prepared] };
        },
    },
    journals: {
      create: () => journal,
    },
    identities: {
      next: () => configuredIds[nextId++] ?? "50000000-0000-4000-8000-000000000005",
    },
    now: () => "2026-10-21T12:00:00Z",
    producer: { name: "kepler", version: "0.10.3" },
  };
  return { runtime, events, effects };
};

describe("mission startup request validation", () => {
  it("accepts explicit repository, context, branch, and Integration selections", () => {
    expect(validateMissionStartupRequest(request)).toMatchObject({ kind: "valid" });
  });

  it.each([
    { ...request, workflow: "unknown" },
    { ...request, recordHomeRepositoryId: "" },
    { ...request, repositories: [] },
    { ...request, extra: true },
    { ...request, repositories: [{ ...request.repositories[0], branch: { kind: "new", name: "feature", base: "" } }] },
    { ...request, repositories: [request.repositories[0], request.repositories[0]] },
  ])("rejects malformed or incomplete startup choices", (value) => {
    expect(validateMissionStartupRequest(value).kind).toBe("invalid");
  });
});

describe("MissionStartup", () => {
  it("records creation before preparing selected workspaces and returns a prepared binding", async () => {
    const { runtime, events, effects } = createRuntime();
    const result = await new MissionStartup(runtime).execute(".", request);

    expect(result).toMatchObject({
      kind: "prepared",
      missionId: ids[0],
      recordHome: "/record",
      repositories: [{
        repositoryId: "code-repository",
        branch: "feature/requested-work",
        integrationTarget: "refs/heads/main",
        startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
      }],
    });
    expect(effects).toEqual(["inspect", "append", "prepare", "append"]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "construction.mission-created",
      data: {
        mission_id: ids[0],
        title: request.title,
        request: request.request,
        workflow: "standard",
        record_home: { repository_id: "record-home" },
        repositories: [{
          repository_id: "code-repository",
          context: { kind: "existing" },
          branch: { kind: "current" },
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
        }],
      },
    });
    expect(events[1]).toMatchObject({
      type: "construction.mission-workspaces-prepared",
      caused_by: [ids[2]],
      data: { mission_id: ids[0] },
    });
    expect(JSON.stringify(events)).not.toContain("unit_id");
    expect(JSON.stringify(events)).not.toContain("stage_attempt_id");
  });

  it("records an explicit no-commit starting condition for a greenfield repository", async () => {
    const greenfield: InspectedMissionRepository = {
      ...inspected,
      startingCheckpoint: { kind: "no-commit" },
    };
    const greenfieldPrepared: PreparedMissionRepository = {
      ...prepared,
      startingCheckpoint: { kind: "no-commit" },
    };
    const { runtime, events } = createRuntime({
      inspect: async () => ({ kind: "inspected", repositories: [greenfield] }),
      prepare: async () => ({ kind: "prepared", repositories: [greenfieldPrepared] }),
    });

    const result = await new MissionStartup(runtime).execute(undefined, request);

    expect(result.kind).toBe("prepared");
    expect(events[0]).toMatchObject({ data: { repositories: [{ starting_checkpoint: { kind: "no-commit" } }] } });
    expect(events[1]).toMatchObject({ data: { repositories: [{ starting_checkpoint: { kind: "no-commit" } }] } });
  });

  it("fails before writes when project resolution fails", async () => {
    const { runtime, events, effects } = createRuntime({
      resolve: async () => ({ kind: "failed", code: "kepler_directory_missing", message: "missing", details: {}, recovery: "create explicitly" }),
    });

    const result = await new MissionStartup(runtime).execute(undefined, request);

    expect(result).toMatchObject({ kind: "failed", code: "kepler_directory_missing" });
    expect(events).toHaveLength(0);
    expect(effects).toEqual([]);
  });

  it("retains mission creation and reports partial preparation without recording readiness", async () => {
    const { runtime, events } = createRuntime({
      prepare: async () => ({
        kind: "failed",
        code: "workspace_conflict",
        message: "Selected branch is dirty",
        details: { partial_effects: [{ repository_id: "other-repository", created: "/worktree" }] },
        recovery: "Reconcile the selected worktree before retrying.",
      }),
    });

    const result = await new MissionStartup(runtime).execute(undefined, request);

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_conflict",
      details: {
        mission_id: ids[0],
        partial_effects: [{ repository_id: "other-repository", created: "/worktree" }],
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "construction.mission-created" });
  });

  it("does not claim preparation succeeded when the completion fact cannot be appended", async () => {
    const { runtime } = createRuntime({
      append: async (_event) => {
        if (JSON.stringify(_event).includes("mission-workspaces-prepared")) throw new Error("journal unavailable");
        return { status: "appended", eventId: "event", line: 1 };
      },
    });

    const result = await new MissionStartup(runtime).execute(undefined, request);

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_preparation_record_failed",
      details: {
        mission_id: ids[0],
        repositories: ["code-repository"],
        partial_effects: [{
          repository_id: "code-repository",
          workspace_path: "/code/repository",
          workspace_id: "workspace-key",
          branch: "feature/requested-work",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
          state: "prepared",
        }],
      },
    });
  });
});
