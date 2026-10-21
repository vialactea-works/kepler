import { describe, expect, it } from "vitest";
import {
  appendSelectorValue,
  parseScopeSelectors,
  validateScopeOwnership,
  type ScopeOwnership,
} from "../../packages/cli/src/cli/scope-selectors.js";

const unitId = "2026-10-21-example";
const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const implementationAttemptId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const attemptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const activityOwnership = {
  name: "code-generation" as const,
  unitId,
  taskId,
  implementationAttemptId,
};
const attemptOwnership = {
  id: attemptId,
  unitId,
  taskId,
  activity: "code-generation" as const,
  implementationAttemptId,
};
const ownership: ScopeOwnership = {
  unit: { id: unitId },
  task: { id: taskId, unitId },
  implementationAttempt: {
    id: implementationAttemptId,
    unitId,
  },
  activity: activityOwnership,
  attempt: attemptOwnership,
};

describe("scope selector parsing", () => {
  it("accumulates repeated parser values so duplicate flags remain observable", () => {
    expect(appendSelectorValue("first", appendSelectorValue("second"))).toEqual([
      "second",
      "first",
    ]);
  });

  it("parses exact selectors and preserves the Implementation-parent binding", () => {
    const result = parseScopeSelectors(
      {
        unit: [unitId],
        task: [taskId],
        activity: ["code-generation"],
        implementationAttempt: [implementationAttemptId],
        attempt: [attemptId],
      },
      { existingAttemptMutation: true, required: ["unit", "task", "activity"] },
    );

    expect(result).toEqual({
      kind: "parsed",
      selectors: {
        unit: unitId,
        task: taskId,
        activity: "code-generation",
        implementationAttempt: implementationAttemptId,
        attempt: attemptId,
      },
    });
  });

  it("accepts a unit-review source Implementation attempt without a task", () => {
    expect(
      parseScopeSelectors({
        unit: [unitId],
        implementationAttempt: [implementationAttemptId],
      }),
    ).toEqual({
      kind: "parsed",
      selectors: { unit: unitId, implementationAttempt: implementationAttemptId },
    });
  });

  it.each([
    {
      name: "rejects repeated scope flags",
      options: { unit: [unitId, `${unitId}-other`] },
      settings: {},
      code: "duplicate_selector",
    },
    {
      name: "rejects incomplete UUID identities",
      options: { unit: [unitId], task: [taskId.slice(0, -1)] },
      settings: {},
      code: "invalid_identity",
    },
    {
      name: "rejects an unsupported stage",
      options: { unit: [unitId], stage: ["planning"] },
      settings: {},
      code: "invalid_stage",
    },
    {
      name: "rejects an unsupported Activity",
      options: { unit: [unitId], task: [taskId], activity: ["generation"] },
      settings: {},
      code: "invalid_activity",
    },
    {
      name: "requires unit context for task selection",
      options: { task: [taskId] },
      settings: {},
      code: "required_selector_missing",
    },
    {
      name: "requires unit context for Implementation attempt selection",
      options: { implementationAttempt: [implementationAttemptId] },
      settings: {},
      code: "required_selector_missing",
    },
    {
      name: "requires the original Implementation parent for Activity selection",
      options: {
        unit: [unitId],
        task: [taskId],
        activity: ["code-generation"],
      },
      settings: {},
      code: "required_selector_missing",
    },
    {
      name: "requires the exact attempt for an existing-attempt mutation",
      options: { unit: [unitId], stage: ["implementation"] },
      settings: { existingAttemptMutation: true },
      code: "required_selector_missing",
    },
    {
      name: "does not allow mission context on unit-scoped operations",
      options: { mission: [implementationAttemptId] },
      settings: {},
      code: "mission_scope_not_allowed",
    },
    {
      name: "rejects mission and unit context together",
      options: { unit: [unitId], mission: [implementationAttemptId] },
      settings: { missionScoped: true },
      code: "unit_and_mission_conflict",
    },
    {
      name: "does not infer an implicit unit",
      options: {},
      settings: { required: ["unit"] },
      code: "required_selector_missing",
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly options: Readonly<Record<string, unknown>>;
    readonly settings: Parameters<typeof parseScopeSelectors>[1];
    readonly code: string;
  }>)("$name", ({ options, settings, code }) => {
    expect(parseScopeSelectors(options, settings)).toMatchObject({
      kind: "failed",
      code,
    });
  });

  it("accepts a full mission identity only for mission-scoped operations", () => {
    const result = parseScopeSelectors(
      { mission: [implementationAttemptId] },
      { missionScoped: true, required: ["mission"] },
    );

    expect(result).toEqual({
      kind: "parsed",
      selectors: { mission: implementationAttemptId },
    });
  });
});

describe("scope ownership validation", () => {
  it("binds Activity to its task and unit-scoped Implementation parent", () => {
    const parsed = parseScopeSelectors({
      unit: [unitId],
      task: [taskId],
      activity: ["code-generation"],
      implementationAttempt: [implementationAttemptId],
      attempt: [attemptId],
    });
    if (parsed.kind !== "parsed") throw new Error("Expected valid selectors");

    expect(validateScopeOwnership(parsed.selectors, ownership)).toEqual({
      kind: "valid",
      selectors: parsed.selectors,
    });
  });

  it("accepts a unit-scoped Implementation attempt without task ownership", () => {
    const parsed = parseScopeSelectors({
      unit: [unitId],
      implementationAttempt: [implementationAttemptId],
    });
    if (parsed.kind !== "parsed") throw new Error("Expected valid selectors");

    expect(
      validateScopeOwnership(parsed.selectors, {
        unit: { id: unitId },
        implementationAttempt: { id: implementationAttemptId, unitId },
      }),
    ).toEqual({ kind: "valid", selectors: parsed.selectors });
  });

  it("rejects a unit prefix instead of substituting a matching unit", () => {
    const parsed = parseScopeSelectors({ unit: ["2026-10-21"] });
    if (parsed.kind !== "parsed") throw new Error("Expected valid selector syntax");

    expect(validateScopeOwnership(parsed.selectors, ownership)).toMatchObject({
      kind: "failed",
      code: "scope_mismatch",
    });
  });

  it("rejects task, attempt, and Implementation-parent ownership mismatches", () => {
    const parsed = parseScopeSelectors({
      unit: [unitId],
      task: [taskId],
      activity: ["code-generation"],
      implementationAttempt: [implementationAttemptId],
      attempt: [attemptId],
    });
    if (parsed.kind !== "parsed") throw new Error("Expected valid selectors");

    expect(
      validateScopeOwnership(parsed.selectors, {
        ...ownership,
        implementationAttempt: {
          id: implementationAttemptId,
          unitId: `${unitId}-other`,
        },
      }),
    ).toMatchObject({ kind: "failed", code: "scope_mismatch" });
    expect(
      validateScopeOwnership(parsed.selectors, {
        ...ownership,
        activity: {
          ...activityOwnership,
          implementationAttemptId: attemptId,
        },
      }),
    ).toMatchObject({ kind: "failed", code: "scope_mismatch" });
    expect(
      validateScopeOwnership(parsed.selectors, {
        ...ownership,
        attempt: { ...attemptOwnership, taskId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      }),
    ).toMatchObject({ kind: "failed", code: "scope_mismatch" });
  });

  it("fails closed when the selected entity is absent", () => {
    const parsed = parseScopeSelectors({ unit: [unitId] });
    if (parsed.kind !== "parsed") throw new Error("Expected valid selector syntax");

    expect(validateScopeOwnership(parsed.selectors, {})).toMatchObject({
      kind: "failed",
      code: "scope_not_found",
    });
  });
});
