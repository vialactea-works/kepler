import { describe, expect, it } from "vitest";
import {
  MissionStartup,
  validateMissionStartupRequest,
  type InspectedMissionRepository,
  type MissionStartupRuntime,
  type PreparedMissionRepository,
} from "../../packages/cli/src/construction/mission-startup.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import { collectHistory, type HistoryCollection } from "../../packages/cli/src/history/collection.js";
import { missionIntegrationTargetKey, missionWorkspaceKey } from "../../packages/cli/src/construction/mission-workspace.js";

const recordHomeCommonDirectory = "/record/.git";
const workspaceCommonDirectory = "/code/repository/.git";
const canonicalWorkspacePath = "/code/repository";
const workspaceKey = missionWorkspaceKey(workspaceCommonDirectory, canonicalWorkspacePath);
const integrationTargetKey = missionIntegrationTargetKey(workspaceCommonDirectory, "refs/heads/main");

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
  integrationTargetKey,
  startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
  repositoryPath: "/code/repository",
  recordHomePath: "/record",
  gitDirectory: "/code/repository/.git",
  commonDirectory: workspaceCommonDirectory,
  localWorkspaceKey: workspaceKey,
  workspacePath: canonicalWorkspacePath,
  workspaceKind: "existing",
  sourcePath: "/code/repository",
  recordHomeRepositoryId: "record-home",
  recordHomeCommonDirectory,
  initialDirtyPaths: [],
  initialBranch: "feature/requested-work",
  initialCheckpoint: { kind: "commit", commit: "a".repeat(40) },
};

const prepared: PreparedMissionRepository = {
  repositoryId: "code-repository",
  context: { kind: "existing" },
  branch: "feature/requested-work",
  integrationTarget: "refs/heads/main",
  startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
  localWorkspaceKey: workspaceKey,
  workspacePath: canonicalWorkspacePath,
};

const createRuntime = (overrides: {
  readonly resolve?: () => Promise<unknown>;
  readonly inspect?: () => Promise<unknown>;
  readonly prepare?: () => Promise<unknown>;
  readonly append?: (event: unknown) => Promise<unknown>;
  readonly reconcile?: () => Promise<unknown>;
  readonly loadIntent?: () => Promise<unknown | undefined>;
  readonly readHistory?: () => Promise<HistoryCollection>;
  readonly ids?: readonly string[];
} = {}) => {
  const events: unknown[] = [];
  const effects: string[] = [];
  let savedIntent: unknown;
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
      reconcile: overrides.reconcile
        ? async () => await overrides.reconcile!() as never
        : async () => {
          effects.push("reconcile");
          return { kind: "prepared", repositories: [prepared] };
        },
      identifyRecordHome: async () => ({
        root: "/record",
        gitDirectory: recordHomeCommonDirectory,
        commonDirectory: recordHomeCommonDirectory,
      }),
    },
    recovery: {
      acquireMission: async () => {
        effects.push("acquireMission");
        return {
          kind: "acquired",
          lease: { release: async () => ({ kind: "released" }) },
        };
      },
      saveIntent: async (_recordHome, _commonDirectory, _missionId, intent) => { savedIntent = structuredClone(intent); },
      loadIntent: overrides.loadIntent ?? (async () => structuredClone(savedIntent)),
      readHistory: overrides.readHistory ?? (async (_recordHome, missionId) => {
        const first = events[0] as Record<string, unknown> | undefined;
        const bytes = new TextEncoder().encode(events.map((event) => `${JSON.stringify(event)}\n`).join(""));
        return collectHistory(missionId, first ? [{
          sourceId: `${missionId}/construction/${String(first.journal_id)}`,
          missionId,
          phase: "construction",
          journalId: String(first.journal_id),
          bytes,
        }] : [], { completeness: "complete" });
      }),
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
  return {
    runtime,
    events,
    effects,
    intent: () => structuredClone(savedIntent),
    clearIntent: () => { savedIntent = undefined; },
    setIntent: (value: unknown) => { savedIntent = structuredClone(value); },
  };
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
  it.each(["", "not-a-uuid", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"])(
    "rejects invalid prepare selectors before resolving projects or touching mission state (%s)",
    async (missionId) => {
      const { runtime, events, effects } = createRuntime();
      const result = await new MissionStartup(runtime).prepare(undefined, missionId);
      expect(result).toMatchObject({ kind: "failed", code: "invalid_mission_id" });
      expect(events).toHaveLength(0);
      expect(effects).toEqual([]);
    },
  );

  it("requires saved local intent to continue an incomplete mission", async () => {
    const { runtime, events, effects, clearIntent } = createRuntime({
      prepare: async () => ({ kind: "failed", code: "workspace_preparation_failed", message: "interrupted", details: {}, recovery: "Retry." }),
    });
    const startup = new MissionStartup(runtime);
    await startup.execute(undefined, request);
    clearIntent();
    effects.splice(0, effects.length);

    const result = await startup.prepare(undefined, ids[0]!);

    expect(result).toMatchObject({ kind: "failed", code: "mission_recovery_material_missing" });
    expect(events).toHaveLength(1);
    expect(effects).toEqual([]);
  });

  it("rejects malformed saved intent before acquiring mission coordination", async () => {
    const { runtime, events, effects } = createRuntime({ loadIntent: async () => ({ format: "unsupported" }) });
    const result = await new MissionStartup(runtime).prepare(undefined, ids[0]!);
    expect(result).toMatchObject({ kind: "failed", code: "mission_recovery_intent_invalid" });
    expect(events).toHaveLength(0);
    expect(effects).toEqual([]);
  });

  it.each(["localWorkspaceKey", "integrationTargetKey", "recordHomeRepositoryId"] as const)(
    "rejects a well-formed saved repository %s mismatch before acquiring coordination or preparing Git",
    async (field) => {
      const { runtime, events, effects, intent, setIntent } = createRuntime({
        prepare: async () => ({ kind: "failed", code: "workspace_preparation_failed", message: "interrupted", details: {}, recovery: "Retry." }),
      });
      const startup = new MissionStartup(runtime);
      const interrupted = await startup.execute(undefined, request);
      expect(interrupted).toMatchObject({ kind: "failed", details: { mission_id: ids[0] } });
      const damaged = intent() as { repositories: Array<Record<string, unknown>> };
      const repository = damaged.repositories[0]!;
      repository[field] = field === "localWorkspaceKey" ? "f".repeat(64)
        : field === "integrationTargetKey" ? "e".repeat(64) : "other-record-home";
      setIntent(damaged);
      effects.splice(0, effects.length);

      const recovered = await startup.prepare(undefined, ids[0]!);

      expect(recovered).toMatchObject({ kind: "failed", code: "mission_recovery_intent_invalid" });
      expect(effects).toEqual([]);
      expect(events).toHaveLength(1);
    },
  );

  it("returns historical prepared facts without requiring local workspace identity", async () => {
    const { runtime, events, effects, clearIntent } = createRuntime();
    const startup = new MissionStartup(runtime);
    const created = await startup.execute(undefined, request);
    expect(created).toMatchObject({ kind: "prepared", historical: false });
    clearIntent();
    effects.splice(0, effects.length);

    const historical = await startup.prepare(undefined, ids[0]!);

    expect(historical).toEqual({
      kind: "prepared",
      missionId: ids[0],
      recordHome: "/record",
      historical: true,
      repositories: [{
        repositoryId: "code-repository",
        context: { kind: "existing" },
        branch: "feature/requested-work",
        integrationTarget: "refs/heads/main",
        startingCheckpoint: { kind: "commit", commit: "a".repeat(40) },
      }],
    });
    expect(events).toHaveLength(2);
    expect(effects).toEqual([]);
  });

  it("does not let saved intent establish workflow authority without a validated creation fact", async () => {
    const { runtime, events, effects, intent } = createRuntime({
      prepare: async () => ({ kind: "failed", code: "workspace_preparation_failed", message: "interrupted", details: {}, recovery: "Retry." }),
    });
    const startup = new MissionStartup(runtime);
    await startup.execute(undefined, request);
    const saved = intent() as { preparedEvent: unknown };
    events.splice(0, events.length, saved.preparedEvent);
    effects.splice(0, effects.length);

    const result = await startup.prepare(undefined, ids[0]!);

    expect(result).toMatchObject({ kind: "failed", code: "mission_history_not_recoverable" });
    expect(events).toHaveLength(1);
    expect(effects).not.toContain("reconcile");
  });

  it("resumes the original mission from saved intent and returns the recorded result without repeating preparation", async () => {
    const { runtime, events, effects } = createRuntime({
      prepare: async () => ({
        kind: "failed",
        code: "workspace_preparation_failed",
        message: "injected partial preparation",
        details: {},
        recovery: "Retry the same mission.",
      }),
    });
    const startup = new MissionStartup(runtime);
    const interrupted = await startup.execute(undefined, request);
    expect(interrupted).toMatchObject({ kind: "failed", code: "workspace_preparation_failed", details: { mission_id: ids[0] } });
    const originalCreated = structuredClone(events[0]);

    const recovered = await startup.prepare(undefined, ids[0]!);
    expect(recovered).toMatchObject({ kind: "prepared", missionId: ids[0], historical: false, repositories: [prepared] });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(originalCreated);
    expect(events[1]).toMatchObject({ type: "construction.mission-workspaces-prepared", caused_by: [ids[2]], data: { mission_id: ids[0] } });

    const repeated = await startup.prepare(undefined, ids[0]!);
    expect(repeated).toMatchObject({ kind: "prepared", missionId: ids[0], historical: true, repositories: [{ repositoryId: prepared.repositoryId, branch: prepared.branch, integrationTarget: prepared.integrationTarget }] });
    expect(events).toHaveLength(2);
    expect(effects.filter((effect) => effect === "reconcile")).toHaveLength(1);
    expect(effects.filter((effect) => effect === "inspect")).toHaveLength(1);
  });

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
    expect(effects).toEqual(["inspect", "acquireMission", "append", "prepare", "append"]);
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

  it.each(["failed", "thrown"] as const)("keeps preparation and workspace-release failures when mission release is %s", async (releaseMode) => {
    const workspaceRelease = { code: "workspace_release_denied", details: { resource_key: workspaceKey } };
    const { runtime, events } = createRuntime({
      prepare: async () => ({
        kind: "failed",
        code: "workspace_attachment_write_failed",
        message: "Attachment storage failed",
        details: {
          partial_effects: [{ repository_id: prepared.repositoryId, workspace_path: prepared.workspacePath }],
          coordination_release: workspaceRelease,
        },
        recovery: "Preserve the prepared workspace.",
      }),
    });
    let releases = 0;
    const startup = new MissionStartup({
      ...runtime,
      recovery: {
        ...runtime.recovery,
        acquireMission: async () => ({
          kind: "acquired",
          lease: {
            release: async () => {
              releases += 1;
              if (releaseMode === "thrown") throw new Error("Mission owner probe failed");
              return { kind: "failed", code: "mission_release_denied", message: "Mission owner changed", details: {}, recovery: "Keep the mission owner artifact." };
            },
          },
        }),
      },
    });

    const result = await startup.execute(undefined, request);

    expect(result).toMatchObject({
      kind: "failed",
      code: "workspace_attachment_write_failed",
      message: "Attachment storage failed",
      details: {
        mission_id: ids[0],
        partial_effects: [{ repository_id: prepared.repositoryId, workspace_path: prepared.workspacePath }],
        coordination_release: workspaceRelease,
        mission_coordination_release: { code: releaseMode === "thrown" ? "coordination_release_failed" : "mission_release_denied" },
      },
    });
    expect(releases).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "construction.mission-created" });
  });

  it("retains recorded preparation facts when mission release fails and reports historical success on retry", async () => {
    const { runtime, events } = createRuntime();
    let acquisitions = 0;
    let releases = 0;
    const startup = new MissionStartup({
      ...runtime,
      recovery: {
        ...runtime.recovery,
        acquireMission: async () => {
          acquisitions += 1;
          return {
            kind: "acquired",
            lease: {
              release: async () => {
                releases += 1;
                return { kind: "failed", code: "mission_release_denied", message: "Mission owner changed", details: {}, recovery: "Keep the mission owner artifact." };
              },
            },
          };
        },
      },
    });

    const result = await startup.execute(undefined, request);

    expect(result).toMatchObject({
      kind: "failed",
      code: "coordination_release_failed",
      details: {
        mission_id: ids[0],
        preparation_result: { kind: "prepared", missionId: ids[0], historical: false, repositories: [prepared] },
        mission_coordination_release: { code: "mission_release_denied" },
      },
    });
    expect(events).toHaveLength(2);
    expect(await startup.prepare(undefined, ids[0]!)).toMatchObject({ kind: "prepared", missionId: ids[0], historical: true });
    expect(events).toHaveLength(2);
    expect(acquisitions).toBe(1);
    expect(releases).toBe(1);
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
          workspace_id: workspaceKey,
          branch: "feature/requested-work",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: "a".repeat(40) },
          state: "prepared",
        }],
      },
    });
  });
});
