import { describe, expect, it } from "vitest";
import type { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";
import { MissionMutations } from "../../packages/cli/src/cli/mission-mutations.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { UnitQueries, UnitQueryContextResult } from "../../packages/cli/src/construction/unit-queries.js";
import type { HistoryMutationSelection, HistoryMutations } from "../../packages/cli/src/history/mutations.js";
import type { HistoryMutationRequest } from "../../packages/cli/src/history/access.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const historyVersion = "20000000-0000-4000-8000-000000000002";
const unitContext: UnitQueryContextResult = {
  kind: "context",
  recordHome: "/unit-record-home",
  missionId,
  history: collectHistory(missionId, [], { completeness: "complete" }),
  historyMetadata: {
    mode: "active",
    history_version: historyVersion,
    generation_id: "30000000-0000-4000-8000-000000000003",
    pending_recovery: false,
    migration_required: false,
    control_receipts: [],
    control_receipts_truncated: false,
  },
  projection: projectConstruction(collectHistory(missionId, [], { completeness: "complete" })),
};
const selection: HistoryMutationSelection = {
  mission_id: missionId,
  history_version: historyVersion,
  generation_id: "30000000-0000-4000-8000-000000000003",
};

const fixture = (options: {
  readonly context?: UnitQueryContextResult;
  readonly projectResult?: Awaited<ReturnType<ProjectResolver["resolve"]>>;
} = {}) => {
  const unitCalls: string[] = [];
  const projectCalls: (string | undefined)[] = [];
  const requests: HistoryMutationRequest[] = [];
  const projects: Pick<ProjectResolver, "resolve"> = {
    resolve: async (project) => {
      projectCalls.push(project);
      return options.projectResult ?? { kind: "resolved", root: "/mission-record-home" };
    },
  };
  const units: Pick<UnitQueries, "readContext"> = {
    readContext: async (unitId) => {
      unitCalls.push(unitId);
      return options.context ?? unitContext;
    },
  };
  const mutations: Pick<HistoryMutations, "execute"> = {
    execute: async <T>(request: HistoryMutationRequest, operation: () => Promise<T>) => {
      requests.push(request);
      return { value: await operation(), history: selection };
    },
  };
  return { caller: new MissionMutations(projects, units, mutations), unitCalls, projectCalls, requests };
};

describe("MissionMutations", () => {
  it("binds a unit mutation to the exact resolved unit record home and caller version", async () => {
    const test = fixture();
    const result = await test.caller.execute({ unit: "unit-1", historyVersion }, undefined, async () => "unit result");

    expect(result).toEqual({ value: "unit result", history: selection });
    expect(test.unitCalls).toEqual(["unit-1"]);
    expect(test.projectCalls).toEqual([]);
    expect(test.requests).toEqual([{ recordHome: "/unit-record-home", missionId, historyVersion }]);
  });

  it("resolves a mission mutation in the caller's selected project", async () => {
    const test = fixture();
    const result = await test.caller.execute({ mission: missionId, historyVersion }, "relative/project", async () => "mission result");

    expect(result.value).toBe("mission result");
    expect(test.unitCalls).toEqual([]);
    expect(test.projectCalls).toEqual(["relative/project"]);
    expect(test.requests).toEqual([{ recordHome: "/mission-record-home", missionId, historyVersion }]);
  });

  it("does not infer a missing version from the unit's current history metadata", async () => {
    const test = fixture();
    await test.caller.execute({ unit: "unit-1" }, undefined, async () => "result");

    expect(unitContext.kind).toBe("context");
    expect(test.requests).toEqual([{ recordHome: "/unit-record-home", missionId, historyVersion: undefined }]);
  });

  it.each([
    { name: "missing scope", selectors: {} },
    { name: "contradictory unit and mission", selectors: { unit: "unit-1", mission: missionId } },
  ] satisfies ReadonlyArray<{ readonly name: string; readonly selectors: ScopeSelectors }>)('$name fails before callback effects', async ({ selectors }) => {
    const test = fixture();
    let effects = 0;
    await expect(test.caller.execute(selectors, undefined, async () => { effects += 1; })).rejects.toMatchObject({ name: "HistoryError" });

    expect(effects).toBe(0);
    expect(test.unitCalls).toEqual([]);
    expect(test.projectCalls).toEqual([]);
    expect(test.requests).toEqual([]);
  });

  it("propagates unit and mission resolution failures before callback effects", async () => {
    const failedContext = { kind: "failed" as const, code: "unit_not_found", message: "No unit", details: {}, recovery: "Choose a known unit." };
    const unitTest = fixture({ context: failedContext });
    let unitEffects = 0;
    await expect(unitTest.caller.execute({ unit: "missing", historyVersion }, undefined, async () => { unitEffects += 1; })).rejects.toMatchObject({ code: "unit_not_found" });
    expect(unitEffects).toBe(0);
    expect(unitTest.requests).toEqual([]);

    const projectTest = fixture({ projectResult: { kind: "failed", code: "project_not_worktree", message: "No project", details: {}, recovery: "Choose a project." } });
    let missionEffects = 0;
    await expect(projectTest.caller.execute({ mission: missionId, historyVersion }, undefined, async () => { missionEffects += 1; })).rejects.toMatchObject({ code: "project_not_worktree" });
    expect(missionEffects).toBe(0);
    expect(projectTest.requests).toEqual([]);
  });
});
