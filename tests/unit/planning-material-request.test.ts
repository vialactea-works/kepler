import { describe, expect, it } from "vitest";
import {
  createPlanningMaterialRequest,
  type PlanningMaterialHistoryRecord,
  type PlanningMaterialRequestScope,
} from "../../packages/cli/src/construction/material-reader.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const otherMissionId = "20000000-0000-4000-8000-000000000002";
const firstId = "30000000-0000-4000-8000-000000000003";
const secondId = "40000000-0000-4000-8000-000000000004";
const graphId = "50000000-0000-4000-8000-000000000005";
const referenceId = "60000000-0000-4000-8000-000000000006";
const scope: PlanningMaterialRequestScope = {
  repositoryRoot: "/virtual/planning-request",
  missionId,
  unitId: "2026-11-06-reader-boundary",
  persistedUnitDirectory: "construction/units-of-work/2026-11-06-reader-boundary",
};

const created = (
  id: string,
  selectedMission = missionId,
  repositoryId: unknown = "record-home",
): PlanningMaterialHistoryRecord => ({
  event: {
    id,
    type: "construction.mission-created",
    data: { mission_id: selectedMission, record_home: { repository_id: repositoryId } },
  },
});

const evidence = (id: string): PlanningMaterialHistoryRecord => ({
  event: {
    id,
    type: "construction.evidence-recorded",
    data: {
      mission_id: missionId,
      record_home: { repository_id: "not-a-creation-fact" },
      inputs: [{ reference: referenceId, purpose: "Opaque material reference" }],
    },
  },
});

describe("createPlanningMaterialRequest", () => {
  it("copies scope and selects record-home facts only from creation events for this mission", () => {
    const result = createPlanningMaterialRequest(scope, [
      {},
      created(firstId),
      created(secondId, otherMissionId, "other-record-home"),
      evidence(graphId),
    ]);

    expect(result).toEqual({
      ...scope,
      primaryArtifact: "plan.md",
      supportFolder: "implementation-planning",
      recordHomeRepositoryIds: ["record-home"],
      executionIdentities: [firstId, secondId, graphId],
    });
  });

  it("preserves multiple record-home facts so the reader can reject ambiguous authority", () => {
    const result = createPlanningMaterialRequest(scope, [created(firstId), created(secondId)]);

    expect(result.recordHomeRepositoryIds).toEqual(["record-home", "record-home"]);
    expect(result.executionIdentities).toEqual([firstId, secondId]);
  });

  it("retains a colliding graph event ID and removes duplicate event IDs without reading payload references", () => {
    const result = createPlanningMaterialRequest(scope, [evidence(graphId), evidence(firstId), evidence(graphId), {}]);

    expect(result.executionIdentities).toEqual([graphId, firstId]);
    expect(result.executionIdentities).not.toContain(referenceId);
    expect(result.recordHomeRepositoryIds).toEqual([]);
  });

  it("keeps missing or malformed record-home facts absent instead of inventing a repository", () => {
    const histories: readonly (readonly PlanningMaterialHistoryRecord[])[] = [
      [],
      [{}],
      [created(firstId, otherMissionId)],
      ...[undefined, null, [], {}, { mission_id: missionId }, { mission_id: missionId, record_home: {} },
        { mission_id: missionId, record_home: [] }].map((data) => [{
        event: { id: firstId, type: "construction.mission-created", data },
      }]),
      ...[null, "", "   ", 42].map((repositoryId) => [created(firstId, missionId, repositoryId)]),
    ];

    for (const history of histories) {
      const result = createPlanningMaterialRequest(scope, history);
      expect(result.recordHomeRepositoryIds).toEqual([]);
    }
  });

  it("preserves caller values without mutating frozen scope or history", () => {
    const persistedUnitDirectory = Object.freeze({ invalid: "Let the material reader validate this value" });
    const frozenScope = Object.freeze({ ...scope, persistedUnitDirectory });
    const record = Object.freeze(created(firstId, missionId, " record-home "));
    const history = Object.freeze([record]);

    const result = createPlanningMaterialRequest(frozenScope, history);

    expect(result.persistedUnitDirectory).toBe(persistedUnitDirectory);
    expect(result.recordHomeRepositoryIds).toEqual([" record-home "]);
    expect(frozenScope).not.toHaveProperty("primaryArtifact");
    expect(history).toEqual([record]);
    expect(result).not.toBe(frozenScope);
  });
});
