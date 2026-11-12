import { afterEach, describe, expect, it } from "vitest";
import { Revision } from "../../packages/cli/src/construction/revision.js";
import { StageStart, createNodeStageStartRuntime } from "../../packages/cli/src/construction/stage-start.js";
import {
  completionSelectors,
  createFunctionalDesignFixture,
  createStageCompletionService,
  functionalDesignRequest,
  historySnapshot,
  recordFunctionalDesignApproval,
  recordFunctionalDesignEvidence,
  type FunctionalDesignTestFixture,
} from "../support/functional-design-completion.js";
import { auditFixture } from "../e2e/fixtures/histories/audit.js";

const fixtures: FunctionalDesignTestFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("Construction revision with real journals and projection", () => {
  it.each([false, true])("reopens design and downstream scopes with Implementation Activities=%s", async (includeImplementationFacts) => {
    const fixture = await createFunctionalDesignFixture({ includeImplementationFacts });
    fixtures.push(fixture);
    const evidence = await recordFunctionalDesignEvidence(fixture);
    const approval = await recordFunctionalDesignApproval(fixture);
    const completion = await createStageCompletionService(fixture).execute(
      completionSelectors,
      functionalDesignRequest(evidence, approval),
    );
    expect(completion.kind).toBe("success");
    const runtime = createNodeStageStartRuntime({ name: "kepler-test", version: "3.1.0" });
    const start = await new StageStart(fixture.contexts, runtime).execute({
      unit: auditFixture.unitId,
      stage: "quality-requirements",
    }, { inputs: [{ reference: "request:quality", purpose: "Assess the completed design" }] });
    expect(start.kind, JSON.stringify(start)).toBe("success");
    const request = {
      orchestrator_decision: "Revise Functional Design and every downstream stage",
      reason: "The requester adds a bundled authoring skill",
      inputs: [{ reference: "request:authoring-skill", purpose: "Additional deliverable" }],
    };
    const service = new Revision(fixture.contexts, runtime);
    const first = await service.execute(completionSelectors, request);
    expect(first).toMatchObject({ kind: "success", data: { status: "barrier_pending" } });
    const second = await service.execute(completionSelectors, request);
    expect(second).toMatchObject({ kind: "success", data: { status: "barrier_complete", resumed_authorization: true } });
    const loaded = await fixture.contexts.readUnit(auditFixture.unitId);
    expect(loaded.kind, JSON.stringify(loaded)).toBe("loaded");
    if (loaded.kind !== "loaded") throw new Error("Expected revised history to load");
    expect(loaded.unit.blocked).toBe(false);
    expect(loaded.unit.stages.find((stage) => stage.stage === "functional-design")?.state).toBe("reopened");
    expect(loaded.unit.stages.find((stage) => stage.stage === "quality-requirements")?.state).toBe("reopened");
    if (includeImplementationFacts) {
      expect(loaded.unit.stages.find((stage) => stage.stage === "implementation")?.state).toBe("reopened");
      expect(loaded.unit.tasks.flatMap((task) => task.activities).every((activity) =>
        !["running", "pausing", "paused", "waiting"].includes(activity.state))).toBe(true);
    }
    const before = await historySnapshot(fixture.root);
    expect(await service.execute(completionSelectors, request)).toMatchObject({ kind: "success", data: { status: "barrier_complete" } });
    expect(await historySnapshot(fixture.root)).toBe(before);
    const replacement = await new StageStart(fixture.contexts, runtime).execute({
      unit: auditFixture.unitId,
      stage: "functional-design",
    }, { inputs: [{ reference: "request:revised-design", purpose: "Revise the unit scope" }] });
    expect(replacement.kind, JSON.stringify(replacement)).toBe("success");
    const quality = await new StageStart(fixture.contexts, runtime).execute({
      unit: auditFixture.unitId,
      stage: "quality-requirements",
    }, { inputs: [{ reference: "request:quality", purpose: "Cannot skip design reapproval" }] });
    expect(quality.kind).toBe("failed");
  });
});
