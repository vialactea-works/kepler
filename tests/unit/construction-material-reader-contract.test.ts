import { describe, expect, expectTypeOf, it } from "vitest";
import type { DeliverStageCompletionRuntime } from "../../packages/cli/src/construction/deliver-stage-completion.js";
import type { ImplementationRetainedScopeAssessmentRuntime } from "../../packages/cli/src/construction/implementation-retained-scope-assessment.js";
import type { ImplementationStageCompletionRuntime } from "../../packages/cli/src/construction/implementation-stage-completion.js";
import type { PlanningStageCompletionRuntime } from "../../packages/cli/src/construction/planning-stage-completion.js";
import type { QualityStageCompletionRuntime } from "../../packages/cli/src/construction/quality-stage-completion.js";
import type { FunctionalDesignStageCompletionRuntime } from "../../packages/cli/src/construction/stage-completion.js";
import type { UnitOfWorkReviewCompletionRuntime } from "../../packages/cli/src/construction/unit-of-work-review-completion.js";
import type { ConstructionMaterialReader } from "../../packages/cli/src/construction/material-reader.js";

type ReaderIsRequired<T> = T extends { readonly materialReader: ConstructionMaterialReader } ? true : false;

const runtimeReaderContracts: readonly [
  ReaderIsRequired<FunctionalDesignStageCompletionRuntime>,
  ReaderIsRequired<QualityStageCompletionRuntime>,
  ReaderIsRequired<PlanningStageCompletionRuntime>,
  ReaderIsRequired<ImplementationStageCompletionRuntime>,
  ReaderIsRequired<ImplementationRetainedScopeAssessmentRuntime>,
  ReaderIsRequired<UnitOfWorkReviewCompletionRuntime>,
  ReaderIsRequired<DeliverStageCompletionRuntime>,
] = [true, true, true, true, true, true, true];

describe("Construction material reader contract", () => {
  it("requires the reader on a public Functional Design completion runtime", () => {
    expectTypeOf<FunctionalDesignStageCompletionRuntime["materialReader"]>().toEqualTypeOf<ConstructionMaterialReader>();
    expect(runtimeReaderContracts).toEqual([true, true, true, true, true, true, true]);
  });
});
