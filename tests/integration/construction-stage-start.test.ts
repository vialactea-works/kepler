import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditContextResolver, createNodeAuditContextRuntime } from "../../packages/cli/src/audit/context.js";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";
import { createProjectSelectionRuntime } from "../../packages/cli/src/cli/project-selection-runtime.js";
import { CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { MissionStartup } from "../../packages/cli/src/construction/mission-startup.js";
import { createMissionWorkspacePreparation } from "../../packages/cli/src/construction/mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { createNodeStageStartRuntime, StageStart } from "../../packages/cli/src/construction/stage-start.js";
import { createNodeUnitCreateRecords } from "../../packages/cli/src/construction/unit-create-runtime.js";
import { UnitCreate } from "../../packages/cli/src/construction/unit-create.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";

const temporaryRoots: string[] = [];

interface Fixture {
  readonly root: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly contexts: AuditContextResolver;
  readonly start: StageStart;
  readonly cleanup: () => Promise<void>;
}

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, {
  cwd,
  encoding: "utf8",
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0" },
}).trim();

const createFixture = async (withCommit = true): Promise<Fixture> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-stage-start-"));
  temporaryRoots.push(root);
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n", "utf8");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Kepler stage-start test");
  git(root, "config", "user.email", "stage-start@example.invalid");
  await Fs.writeFile(Path.join(root, "README.md"), "Stage-start fixture\n", "utf8");
  if (withCommit) {
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "Initialize stage-start fixture");
  }
  const workspace = createNodeMissionWorkspaceRuntime({ cwd: root });
  const projects = new ProjectResolver(createProjectSelectionRuntime({ cwd: () => root }));
  const mission = await new MissionStartup({
    projects: { resolve: (project) => projects.resolve(project) },
    workspaces: createMissionWorkspacePreparation(workspace),
    journals: {
      create: (recordHome, missionId, journalId) => createEventJournal({
        recordHome,
        missionId,
        journalId,
        phase: CONSTRUCTION_PHASE,
      }),
    },
    identities: { next: randomUUID },
    now: () => "2026-10-22T10:00:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
  }).execute(undefined, {
    title: "Implement the selected capability",
    request: "Preserve the observable public contract while implementing the requested behavior.",
    workflow: "standard",
    recordHomeRepositoryId: "repo-main",
    contexts: [{ reference: "request:scope", purpose: "Requester scope" }],
    repositories: [{
      repositoryId: "repo-main",
      workspace: { kind: "existing", path: root },
      branch: { kind: "current" },
      integrationTarget: "main",
    }],
  });
  if (mission.kind !== "prepared") throw new Error(`Mission startup failed: ${JSON.stringify(mission)}`);
  const unit = await new UnitCreate({
    projects: { resolve: (project) => projects.resolve(project) },
    workspace,
    records: createNodeUnitCreateRecords(),
    journals: {
      create: (recordHome, missionId, journalId) => createEventJournal({
        recordHome,
        missionId,
        journalId,
        phase: CONSTRUCTION_PHASE,
      }),
    },
    identities: { next: randomUUID },
    today: () => "2026-10-22",
    now: () => "2026-10-22T10:01:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
  }).execute({ mission: mission.missionId, slug: "stage-start-fixture" });
  if (unit.kind !== "created") throw new Error(`Unit creation failed: ${JSON.stringify(unit)}`);
  const contexts = new AuditContextResolver(createNodeAuditContextRuntime(projects));
  return {
    root,
    missionId: mission.missionId,
    unitId: unit.unitId,
    contexts,
    start: new StageStart(contexts, createNodeStageStartRuntime({ name: "kepler-test", version: "0.10.3" })),
    cleanup: async () => Fs.rm(root, { recursive: true, force: true }),
  };
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("Construction stage start", () => {
  it("starts Functional Design from prepared history and captures the actual repository HEAD", async () => {
    const fixture = await createFixture();
    await Fs.writeFile(Path.join(fixture.root, "stage-input.md"), "Current stage input\n", "utf8");
    git(fixture.root, "add", "stage-input.md");
    git(fixture.root, "commit", "-q", "-m", "Add current stage input");
    const expectedHead = git(fixture.root, "rev-parse", "HEAD");

    const result = await fixture.start.execute({ unit: fixture.unitId, stage: "functional-design" }, {
      inputs: [{ reference: "request:scope", purpose: "Requester scope for Functional Design" }],
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.data).toMatchObject({
      unit_id: fixture.unitId,
      stage: "functional-design",
      checkpoints: [{ repository_id: "repo-main", commit: expectedHead }],
      worker_dispatched: false,
    });
    const loaded = await fixture.contexts.readUnit(fixture.unitId);
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind === "loaded") {
      expect(loaded.unit.stages[0]).toMatchObject({ state: "running", currentAttemptId: result.data.attempt_id });
    }
  });

  it("rejects a later Standard stage until every predecessor is complete", async () => {
    const fixture = await createFixture();

    const result = await fixture.start.execute({ unit: fixture.unitId, stage: "quality-requirements" }, {
      inputs: [{ reference: "request:scope", purpose: "Requester scope for Quality Requirements" }],
    });

    expect(result).toMatchObject({
      kind: "failed",
      data: { code: "standard_stage_order_blocked" },
    });
    const loaded = await fixture.contexts.readUnit(fixture.unitId);
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind === "loaded") expect(loaded.unit.stages[1]?.attempts).toHaveLength(0);
  });

  it("captures an empty checkpoint set from a real unborn branch", async () => {
    const fixture = await createFixture(false);

    const result = await fixture.start.execute({ unit: fixture.unitId, stage: "functional-design" }, {
      inputs: [{ reference: "request:scope", purpose: "Requester scope for Functional Design" }],
    });

    expect(result).toMatchObject({ kind: "success", data: { checkpoints: [] } });
  });

  it("allows only one concurrent start for the same unit and stage", async () => {
    const fixture = await createFixture();
    const request = { inputs: [{ reference: "request:scope", purpose: "Requester scope" }] };

    const results = await Promise.all([
      fixture.start.execute({ unit: fixture.unitId, stage: "functional-design" }, request),
      fixture.start.execute({ unit: fixture.unitId, stage: "functional-design" }, request),
    ]);

    expect(results.filter((result) => result.kind === "success")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "failed")).toHaveLength(1);
  });
});
