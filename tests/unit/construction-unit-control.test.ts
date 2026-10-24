import { describe, expect, it } from "vitest";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";
import { constructionUnitControlResourceKey, runWithConstructionUnitControl } from "../../packages/cli/src/construction/unit-control.js";

const createWorkspace = () => {
  const held = new Map<string, { readonly token: string; readonly owner: Record<string, unknown> }>();
  const workspace = {
    identity: { machine_id: "test-host", process_id: 1, process_incarnation_id: "process-incarnation" },
    coordination: {
      acquire: async (request: { readonly resourceKey: string; readonly owner: Record<string, unknown> }) => {
        if (held.has(request.resourceKey)) return {
          kind: "failed",
          code: "mission_coordinator_busy",
          message: "The resource is held.",
          details: { resource_key: request.resourceKey },
          recovery: "Retry after the current operation releases the resource.",
        };
        const token = `token-${request.resourceKey}`;
        const entry = { token, owner: { ...request.owner, token } };
        held.set(request.resourceKey, entry);
        return {
          kind: "acquired",
          lease: {
            lockPath: request.resourceKey,
            owner: entry.owner,
            release: async () => {
              if (held.get(request.resourceKey) !== entry) return {
                kind: "failed",
                code: "mission_coordinator_owner_changed",
                message: "The resource owner changed.",
                details: { resource_key: request.resourceKey },
                recovery: "Inspect the current owner before retrying.",
              };
              held.delete(request.resourceKey);
              return { kind: "released" };
            },
          },
        };
      },
    },
  } as unknown as Pick<MissionWorkspaceRuntime, "coordination" | "identity">;
  return { workspace, held };
};

describe("Construction unit control", () => {
  it("lets another unit proceed while one unit operation remains active", async () => {
    const missionId = "mission-1";
    const firstUnit = "unit-1";
    const secondUnit = "unit-2";
    const { workspace, held } = createWorkspace();
    let operationStarted!: () => void;
    let finishOperation!: () => void;
    const started = new Promise<void>((resolve) => { operationStarted = resolve; });
    const pending = new Promise<void>((resolve) => { finishOperation = resolve; });
    const first = runWithConstructionUnitControl(workspace, "/repo/.git", missionId, firstUnit, async () => {
      operationStarted();
      await pending;
      return "first-unit";
    });

    await started;
    const firstKey = constructionUnitControlResourceKey(missionId, firstUnit);
    const secondKey = constructionUnitControlResourceKey(missionId, secondUnit);
    expect(firstKey).not.toBe(secondKey);
    expect([...held.keys()]).toEqual([firstKey]);

    const second = await runWithConstructionUnitControl(workspace, "/repo/.git", missionId, secondUnit, async () => "second-unit");

    expect(second).toEqual({ kind: "completed", value: "second-unit" });
    expect([...held.keys()]).toEqual([firstKey]);
    finishOperation();
    expect(await first).toEqual({ kind: "completed", value: "first-unit" });
    expect(held.size).toBe(0);
  });
});
