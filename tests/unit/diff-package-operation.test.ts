import { describe, expect, it } from "vitest";
import { HistoryError } from "../../packages/cli/src/history/control.js";
import { parseDiffPackageOptions, type DiffPackageCommandRequest } from "../../packages/cli/src/cli/diff-package-options.js";
import { createHistoryBoundDiffPackageOperation } from "../../packages/cli/src/cli/nest/diff-package.commands.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { MissionMutations } from "../../packages/cli/src/cli/mission-mutations.js";

const unit = "2026-11-13-diff-package-operation";
const implementationAttempt = "40000000-0000-4000-8000-000000000001";
const historyVersion = "60000000-0000-4000-8000-000000000001";

const request = (out?: string): DiffPackageCommandRequest => {
  const parsed = parseDiffPackageOptions("unit-review", {
    unit: [unit],
    implementationAttempt: [implementationAttempt],
    ...(out === undefined ? {} : { out: [out] }),
    ...(out === undefined ? {} : { historyVersion: [historyVersion] }),
  });
  if (parsed.kind !== "parsed") throw new Error("Diff-package test request failed to parse.");
  return parsed.request;
};

describe("history-bound diff-package operation", () => {
  it("keeps read-only inspection outside mission mutation admission", async () => {
    let mutationCalls = 0;
    const mutations: Pick<MissionMutations, "execute"> = {
      execute: async <_T>(_selectors: ScopeSelectors, _project: string | undefined, _run: () => Promise<_T>) => {
        mutationCalls += 1;
        throw new Error("read-only inspection must not admit a writer");
      },
    };
    const operation = createHistoryBoundDiffPackageOperation(
      { execute: async (selected) => ({ kind: "success", data: { scope: selected.scope.kind } }) },
      mutations,
    );

    const result = await operation.execute(request());

    expect(result).toEqual({ kind: "success", data: { scope: "unit-review" } });
    expect(mutationCalls).toBe(0);
  });

  it("reports a failed writer release as an uncertain output effect", async () => {
    let serviceCalls = 0;
    const output = "packages/review.md";
    const operation = createHistoryBoundDiffPackageOperation(
      { execute: async () => { serviceCalls += 1; return { kind: "success", data: { output } }; } },
      {
        execute: async <_T>(_selectors: ScopeSelectors, _project: string | undefined, run: () => Promise<_T>) => {
          await run();
          throw new HistoryError("history_writer_release_failed", "The writer claim could not be released.", {
            operation_callback: "returned",
            release_error: "unlink failed",
            effects_uncertain: true,
          });
        },
      },
    );

    const result = await operation.execute(request(output));

    expect(result).toMatchObject({
      kind: "failed",
      code: "history_writer_release_failed",
      details: {
        operation_callback: "returned",
        release_error: "unlink failed",
        effects_uncertain: true,
        output_path: output,
      },
      recovery: expect.stringContaining("may have been written"),
    });
    expect(serviceCalls).toBe(1);
  });
});
