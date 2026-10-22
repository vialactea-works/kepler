import { describe, expect, it } from "vitest";
import { ConstructionQueries } from "../../packages/cli/src/construction/scoped-queries.js";
import type { UnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";

const scopeFailure = {
  kind: "failed" as const,
  code: "unit_membership_missing",
  message: "No unique recorded mission membership exists for the selected unit.",
  details: { unit_id: "unit" },
  recovery: "Resolve the recorded unit membership before retrying.",
};

describe("ConstructionQueries", () => {
  it("rejects invalid stage and Activity selectors before reading project state", async () => {
    const units = { readContext: async () => { throw new Error("unexpected query"); } } as unknown as UnitQueries;
    const queries = new ConstructionQueries(units, {} as UnitQueryFileSystem);

    expect(await queries.stageShow("unit", "unknown-stage")).toMatchObject({ kind: "failed", code: "invalid_stage" });
    expect(await queries.activityShow("unit", "task", "unknown-activity", "attempt")).toMatchObject({ kind: "failed", code: "invalid_activity" });
  });

  it("propagates missing unit binding through each scoped query without reading graph files", async () => {
    const units = { readContext: async () => scopeFailure } as unknown as UnitQueries;
    const queries = new ConstructionQueries(units, {} as UnitQueryFileSystem);

    expect(await queries.stageShow("unit", "implementation")).toEqual(scopeFailure);
    expect(await queries.taskList("unit")).toEqual(scopeFailure);
    expect(await queries.taskShow("unit", "task")).toEqual(scopeFailure);
    expect(await queries.taskReady("unit", "task")).toEqual(scopeFailure);
    expect(await queries.activityShow("unit", "task", "code-generation", "attempt")).toEqual(scopeFailure);
  });
});
