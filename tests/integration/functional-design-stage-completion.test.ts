import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  completionSelectors,
  completionUnitDirectory,
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

const prepareCompletion = async (options: {
  readonly failedKind?: "self_review" | "decision_resolution" | "handoff";
  readonly evidenceAttempt?: string;
} = {}) => {
  const fixture = await createFunctionalDesignFixture();
  fixtures.push(fixture);
  const evidenceIds = await recordFunctionalDesignEvidence(fixture, {
    ...(options.failedKind === undefined ? {} : { failedKind: options.failedKind }),
    ...(options.evidenceAttempt === undefined ? {} : { attempt: options.evidenceAttempt }),
  });
  const approvalEventId = await recordFunctionalDesignApproval(fixture);
  return {
    fixture,
    service: createStageCompletionService(fixture),
    request: functionalDesignRequest(evidenceIds, approvalEventId),
  };
};

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("Functional Design stage completion with real journals", () => {
  it("records completion and projects the current stage attempt as completed", async () => {
    const { fixture, service, request } = await prepareCompletion();

    const result = await service.execute(completionSelectors, request);

    expect(result.kind).toBe("success");
    const loaded = await fixture.contexts.readUnit(auditFixture.unitId);
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind !== "loaded") throw new Error("Expected the Unit of Work history to load");
    expect(loaded.unit.stages.find((stage) => stage.stage === "functional-design")?.state).toBe("completed");
    expect(loaded.unit.stages.find((stage) => stage.stage === "functional-design")?.currentAttemptId)
      .toBe(auditFixture.stageAttemptId);
  });

  it("does not append completion when a named current-attempt check failed", async () => {
    const { fixture, service, request } = await prepareCompletion({ failedKind: "self_review" });
    const before = await historySnapshot(fixture.root);

    const result = await service.execute(completionSelectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await historySnapshot(fixture.root)).toBe(before);
  });

  it("does not append completion when passed evidence belongs to the ended prior attempt", async () => {
    const { fixture, service, request } = await prepareCompletion({ evidenceAttempt: auditFixture.priorStageAttemptId });
    const before = await historySnapshot(fixture.root);

    const result = await service.execute(completionSelectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await historySnapshot(fixture.root)).toBe(before);
  });

  it("rejects a missing linked Functional Design support document without appending completion", async () => {
    const { fixture, service, request } = await prepareCompletion();
    await Fs.appendFile(
      Path.join(fixture.root, completionUnitDirectory, "design.md"),
      "\n[Missing detail](details/functional-design/missing.md)\n",
      "utf8",
    );
    const before = await historySnapshot(fixture.root);

    const result = await service.execute(completionSelectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "functional_design_artifacts_invalid" } });
    expect(await historySnapshot(fixture.root)).toBe(before);
  });

  it("does not append completion after the approved artifact material changes", async () => {
    const { fixture, service, request } = await prepareCompletion();
    await Fs.appendFile(Path.join(fixture.root, completionUnitDirectory, "design.md"), "\n## Changed after approval\n", "utf8");
    const before = await historySnapshot(fixture.root);

    const result = await service.execute(completionSelectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await historySnapshot(fixture.root)).toBe(before);
  });
});
