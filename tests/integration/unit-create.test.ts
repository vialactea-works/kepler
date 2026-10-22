import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "../../packages/core/src/event-envelope.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { createNodeUnitCreateRecords } from "../../packages/cli/src/construction/unit-create-runtime.js";
import { UnitCreate, type UnitCreateRuntime } from "../../packages/cli/src/construction/unit-create.js";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const creationJournalId = "20000000-0000-4000-8000-000000000002";
const preparationJournalId = "30000000-0000-4000-8000-000000000003";
const creationEventId = "40000000-0000-4000-8000-000000000004";
const preparationEventId = "50000000-0000-4000-8000-000000000005";
const unitJournalId = "60000000-0000-4000-8000-000000000006";
const unitEventId = "70000000-0000-4000-8000-000000000007";
const temporaryRoots: string[] = [];

const event = (
  id: string,
  journalId: string,
  type: string,
  data: Record<string, unknown>,
): EventEnvelope<Record<string, unknown>> => ({
  id: id as EventId,
  phase: CONSTRUCTION_PHASE,
  type,
  envelope_version: EVENT_ENVELOPE_VERSION,
  event_version: CONSTRUCTION_EVENT_VERSION,
  journal_id: journalId as JournalId,
  recorded_at: "2026-10-21T12:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data,
});

const createRecordHome = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-unit-create-"));
  temporaryRoots.push(root);
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  await Fs.mkdir(Path.join(root, ".git"));
  return root;
};

const createGitWorktrees = async (): Promise<{ readonly selectedRoot: string; readonly linkedRoot: string }> => {
  const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-unit-create-git-"));
  temporaryRoots.push(parent);
  const selectedRoot = Path.join(parent, "selected");
  const linkedRoot = Path.join(parent, "linked");
  await Fs.mkdir(selectedRoot);
  const globalConfig = Path.join(parent, "gitconfig");
  await Fs.writeFile(globalConfig, "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
  };
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: selectedRoot, env, stdio: "ignore" });
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Kepler unit-create test");
  git("config", "user.email", "unit-create@example.invalid");
  await Fs.mkdir(Path.join(selectedRoot, ".kepler"));
  await Fs.writeFile(Path.join(selectedRoot, ".kepler", "marker"), "v3\n");
  await Fs.writeFile(Path.join(selectedRoot, "README.md"), "Unit-create integration fixture\n");
  git("add", ".");
  git("commit", "-q", "-m", "Initialize unit-create fixture");
  git("worktree", "add", "-q", "-b", "linked", linkedRoot, "HEAD");
  return { selectedRoot, linkedRoot };
};

const recordMission = async (root: string, prepared = true): Promise<void> => {
  const repository = {
    repository_id: "record-home",
    context: { kind: "existing" },
    branch: { kind: "current" },
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "no-commit" },
  };
  const creation = createEventJournal({ recordHome: root, missionId, journalId: creationJournalId, phase: CONSTRUCTION_PHASE });
  await creation.append(event(creationEventId, creationJournalId, "construction.mission-created", {
    mission_id: missionId,
    title: "Prepare the unit-create test mission",
    request: "Exercise unit creation against real history and filesystem paths.",
    workflow: "standard",
    record_home: { repository_id: "record-home" },
    contexts: [],
    repositories: [repository],
  }));
  if (prepared) {
    const preparation = createEventJournal({ recordHome: root, missionId, journalId: preparationJournalId, phase: CONSTRUCTION_PHASE });
    await preparation.append(event(preparationEventId, preparationJournalId, "construction.mission-workspaces-prepared", {
      mission_id: missionId,
      repositories: [{
        repository_id: "record-home",
        context: { kind: "existing" },
        branch: "main",
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "no-commit" },
      }],
    }));
  }
};

const createRuntime = (
  root: string,
  appendFailure?: { remaining: number },
  scope: { readonly worktrees?: readonly string[]; readonly commonDirectory?: string } = {},
  workspace?: MissionWorkspaceRuntime,
): UnitCreateRuntime => ({
  projects: { resolve: async () => ({ kind: "resolved", root }) },
  workspace: workspace ?? createNodeMissionWorkspaceRuntime({
    cwd: root,
    git: {
      run: async (_cwd, args) => args[0] === "rev-parse"
        ? { status: 0, stdout: scope.commonDirectory ?? Path.join(root, ".git"), stderr: "" }
        : {
          status: 0,
          stdout: (scope.worktrees ?? [root]).flatMap((worktree) => [
            `worktree ${worktree}`,
            "HEAD 0123456789abcdef",
            "branch refs/heads/main",
            "",
          ]).join(String.fromCharCode(0)) + String.fromCharCode(0),
          stderr: "",
        },
      findReachableObjects: async () => ({ status: 0, objectIds: [], stderr: "" }),
    },
  }),
  records: createNodeUnitCreateRecords(),
  journals: {
    create: (recordHome, selectedMissionId, journalId) => {
      const journal = createEventJournal({
        recordHome,
        missionId: selectedMissionId,
        journalId,
        phase: CONSTRUCTION_PHASE,
      });
      if (!appendFailure) return journal;
      return {
        ...journal,
        append: async (value) => {
          const result = await journal.append(value);
          if (appendFailure.remaining > 0) {
            appendFailure.remaining -= 1;
            throw new Error("response lost after journal durability");
          }
          return result;
        },
      };
    },
  },
  identities: {
    next: (() => {
      const values = [unitJournalId, unitEventId];
      let index = 0;
      return () => values[index++] ?? randomUUID();
    })(),
  },
  today: () => "2026-10-21",
  now: () => "2026-10-21T12:00:00.000Z",
  producer: { name: "kepler", version: "0.10.3" },
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("unit creation with real mission journals and filesystem", () => {
  it("records a unit only under a prepared Standard mission and creates no authored artifacts", async () => {
    const root = await createRecordHome();
    await recordMission(root);

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({
      kind: "created",
      unitId: "2026-10-21-order-cancellation",
      missionId,
      recordHome: root,
      workflow: "standard",
      directory: "construction/units-of-work/2026-10-21-order-cancellation",
    });
    const unitDirectory = Path.join(root, ".kepler", "missions", missionId, result.kind === "created" ? result.directory : "");
    expect((await Fs.readdir(unitDirectory)).sort()).toEqual([]);
    const journalPath = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${unitJournalId}.jsonl`);
    const recorded = (await Fs.readFile(journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      id: unitEventId,
      type: "construction.unit-created",
      data: {
        mission_id: missionId,
        unit_id: "2026-10-21-order-cancellation",
        workflow: "standard",
        initial_effort: { default: "standard", stage_overrides: {} },
      },
    });
  });

  it("rejects an unprepared mission without creating unit paths or appending history", async () => {
    const root = await createRecordHome();
    await recordMission(root, false);

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "unfinished", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "mission_not_prepared" });
    expect(await Fs.readdir(Path.join(root, ".kepler", "missions", missionId))).toEqual(["history"]);
  });

  it("reserves IDs known from legacy unbound unit directories", async () => {
    const root = await createRecordHome();
    await recordMission(root);
    const legacyUnit = Path.join(root, ".kepler", "units-of-work", "2026-10-21-order-cancellation");
    await Fs.mkdir(legacyUnit, { recursive: true });

    const result = await new UnitCreate(createRuntime(root)).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "unit_id_conflict" });
    expect(await Fs.readdir(legacyUnit)).toEqual([]);
    expect(await Fs.readdir(Path.join(root, ".kepler", "missions", missionId, "construction")).catch(() => [])).toEqual([]);
  });

  it("checks known IDs across real linked worktrees", async () => {
    const { selectedRoot, linkedRoot } = await createGitWorktrees();
    await recordMission(selectedRoot);
    const existingUnit = Path.join(linkedRoot, ".kepler", "units-of-work", "2026-10-21-order-cancellation");
    await Fs.mkdir(existingUnit, { recursive: true });

    const result = await new UnitCreate(createRuntime(
      selectedRoot,
      undefined,
      {},
      createNodeMissionWorkspaceRuntime({ cwd: selectedRoot }),
    )).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "unit_id_conflict" });
    expect(await Fs.readdir(existingUnit)).toEqual([]);
    expect(await Fs.readdir(Path.join(selectedRoot, ".kepler", "missions", missionId, "construction")).catch(() => [])).toEqual([]);
  });

  it("checks known IDs across linked worktree record homes", async () => {
    const selectedRoot = await createRecordHome();
    const linkedRoot = await createRecordHome();
    await recordMission(selectedRoot);
    const existingUnit = Path.join(linkedRoot, ".kepler", "units-of-work", "2026-10-21-order-cancellation");
    await Fs.mkdir(existingUnit, { recursive: true });

    const result = await new UnitCreate(createRuntime(selectedRoot, undefined, {
      worktrees: [selectedRoot, linkedRoot],
      commonDirectory: Path.join(selectedRoot, ".git"),
    })).execute({ slug: "order-cancellation", mission: missionId });

    expect(result).toMatchObject({ kind: "failed", code: "unit_id_conflict" });
    expect(await Fs.readdir(existingUnit)).toEqual([]);
    expect(await Fs.readdir(Path.join(selectedRoot, ".kepler", "missions", missionId, "construction")).catch(() => [])).toEqual([]);
  });

  it("allows at most one concurrent creation for the same project-wide unit ID", async () => {
    const root = await createRecordHome();
    await recordMission(root);
    const create = new UnitCreate(createRuntime(root));

    const results = await Promise.all([
      create.execute({ slug: "order-cancellation", mission: missionId }),
      create.execute({ slug: "order-cancellation", mission: missionId }),
    ]);

    expect(results.filter((result) => result.kind === "created")).toHaveLength(1);
    const unitRoot = Path.join(root, ".kepler", "missions", missionId, "construction", "units-of-work");
    expect(await Fs.readdir(unitRoot)).toEqual(["2026-10-21-order-cancellation"]);
    const journalPath = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${unitJournalId}.jsonl`);
    expect((await Fs.readFile(journalPath, "utf8")).trim().split("\n")).toHaveLength(1);
  });

  it("reconciles a durable creation fact before retrying after a lost append response", async () => {
    const root = await createRecordHome();
    await recordMission(root);
    const appendFailure = { remaining: 1 };
    const first = await new UnitCreate(createRuntime(root, appendFailure)).execute({ slug: "order-cancellation", mission: missionId });

    expect(first).toMatchObject({ kind: "failed", code: "unit_record_failed" });
    const unitRoot = Path.join(root, ".kepler", "missions", missionId, "construction", "units-of-work");
    expect(await Fs.readdir(unitRoot).catch(() => [])).toEqual([]);

    const retry = await new UnitCreate(createRuntime(root)).execute({ slug: "order-cancellation", mission: missionId });

    expect(retry).toMatchObject({
      kind: "created",
      unitId: "2026-10-21-order-cancellation",
      journalId: unitJournalId,
      eventId: unitEventId,
    });
    expect(await Fs.readdir(unitRoot)).toEqual(["2026-10-21-order-cancellation"]);
    const journalPath = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE, `${unitJournalId}.jsonl`);
    expect((await Fs.readFile(journalPath, "utf8")).trim().split("\n")).toHaveLength(1);
  });
});
