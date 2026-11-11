import { describe, expect, it } from "vitest";
import type { ConstructionHistoryFact } from "../../packages/cli/src/construction/projection.js";
import {
  discoverTaskPrerequisiteEvidence,
  validateSelectedTaskPrerequisiteEvidence,
  type DiscoveredTaskPrerequisiteEvidence,
  type SelectedTaskPrerequisiteEvidence,
  type TaskPrerequisiteEvidenceScope,
  type UnknownTaskPrerequisite,
} from "../../packages/cli/src/construction/task-prerequisite-evidence.js";
import type { TaskGraphPrerequisite } from "../../packages/cli/src/construction/task-graph.js";

const scope: TaskPrerequisiteEvidenceScope = {
  taskId: "30000000-0000-4000-8000-000000000001",
  implementationAttemptId: "40000000-0000-4000-8000-000000000001",
};
const prerequisite: TaskGraphPrerequisite = {
  description: "Exact prerequisite description",
  needed_for: "implementation",
  needed_when: "Before admission",
  blocking: true,
  condition: "opaque:condition#exact",
  reason: "Task admission needs a current proof.",
};
const evidenceId = "60000000-0000-4000-8000-000000000001";

const fact = (
  id: string,
  overrides: Readonly<Record<string, unknown>> = {},
): ConstructionHistoryFact => ({
  sourceId: "source",
  journalId: "journal",
  line: 1,
  byteOffset: 0,
  event: {
    id: `50000000-0000-4000-8000-${id.slice(-12)}`,
    type: "construction.evidence-recorded",
    caused_by: [],
    data: {
      evidence_id: id,
      stage: "implementation",
      stage_attempt_id: scope.implementationAttemptId,
      task_id: scope.taskId,
      check: "task-prerequisite",
      result: { status: "passed", summary: "Prerequisite is satisfied." },
      inputs: [{ reference: prerequisite.condition, purpose: "Exact prerequisite evidence." }],
      ...overrides,
    },
  },
} as unknown as ConstructionHistoryFact);

const blocker = (overrides: Readonly<Record<string, unknown>> = {}): TaskGraphPrerequisite => ({
  ...prerequisite,
  ...overrides,
} as TaskGraphPrerequisite);

describe("task prerequisite evidence public rules", () => {
  it("checks the exported prerequisite type contracts at compile time", () => {
    const unknown: UnknownTaskPrerequisite = { index: 0, ...prerequisite, status: "unknown" };
    const discovered: DiscoveredTaskPrerequisiteEvidence = { knownFacts: [], unknownPrerequisites: [unknown] };
    const selections: readonly SelectedTaskPrerequisiteEvidence[] = [
      { kind: "valid", facts: [] },
      { kind: "invalid", missing: [prerequisite.description], invalid: [evidenceId] },
    ];

    expect(scope).toMatchObject({ taskId: expect.any(String), implementationAttemptId: expect.any(String) });
    expect(discovered.unknownPrerequisites[0]?.status).toBe("unknown");
    expect(selections.map((selection) => selection.kind)).toEqual(["valid", "invalid"]);
  });

  it.each([prerequisite.condition, prerequisite.description])("accepts exact opaque reference %s", (reference) => {
    const selected = fact(evidenceId, { inputs: [{ reference, purpose: "Exact prerequisite evidence." }] });

    expect(validateSelectedTaskPrerequisiteEvidence([prerequisite], [selected], scope, [evidenceId])).toEqual({
      kind: "valid",
      facts: [selected],
    });
  });

  it("discovers uniquely identified passed proof for every prerequisite kind and leaves uncovered entries unknown", () => {
    const second = blocker({ description: "Second required prerequisite", condition: "opaque:second" });
    const verification = blocker({ needed_for: "verification", description: "Verification only", condition: "opaque:verification" });
    const nonblocking = blocker({ blocking: false, description: "Nonblocking implementation fact", condition: "opaque:optional" });
    const firstProof = fact(evidenceId);
    const secondProof = fact("60000000-0000-4000-8000-000000000002", {
      inputs: [{ reference: prerequisite.description, purpose: "Also covers the first condition." }],
    });
    const verificationProof = fact("60000000-0000-4000-8000-000000000003", {
      inputs: [{ reference: verification.condition, purpose: "Verification-only fact." }],
    });
    const nonblockingProof = fact("60000000-0000-4000-8000-000000000004", {
      inputs: [{ reference: nonblocking.condition, purpose: "Optional implementation fact." }],
    });

    const discovered = discoverTaskPrerequisiteEvidence(
      [prerequisite, second, verification, nonblocking],
      [firstProof, secondProof, verificationProof, nonblockingProof],
      scope,
    );

    expect(discovered.knownFacts).toEqual([
      { evidence_id: evidenceId, event_id: firstProof.event.id, type: "construction.evidence-recorded" },
      { evidence_id: "60000000-0000-4000-8000-000000000002", event_id: secondProof.event.id, type: "construction.evidence-recorded" },
      { evidence_id: "60000000-0000-4000-8000-000000000003", event_id: verificationProof.event.id, type: "construction.evidence-recorded" },
      { evidence_id: "60000000-0000-4000-8000-000000000004", event_id: nonblockingProof.event.id, type: "construction.evidence-recorded" },
    ]);
    expect(discovered.unknownPrerequisites.map(({ index }) => index)).toEqual([1]);
  });

  it("does not require verification-only or nonblocking facts for admission", () => {
    const verification = blocker({ needed_for: "verification" });
    const optional = blocker({ blocking: false });

    expect(validateSelectedTaskPrerequisiteEvidence([verification, optional], [], scope, [])).toEqual({ kind: "valid", facts: [] });
  });

  it.each([
    ["missing", undefined],
    ["failed", { result: { status: "failed", summary: "The prerequisite failed." } }],
    ["inconclusive", { result: { status: "inconclusive", summary: "The prerequisite is inconclusive." } }],
    ["wrong task", { task_id: "30000000-0000-4000-8000-000000000099" }],
    ["wrong attempt", { stage_attempt_id: "40000000-0000-4000-8000-000000000099" }],
    ["Activity scoped", { activity: "code-generation", activity_attempt_id: "40000000-0000-4000-8000-000000000002" }],
    ["wrong check", { check: "code-generation-self-review" }],
    ["missing inputs", { inputs: undefined }],
  ] as const)("does not accept %s evidence", (_name, override) => {
    const facts = override === undefined ? [] : [fact(evidenceId, override)];

    expect(validateSelectedTaskPrerequisiteEvidence([prerequisite], facts, scope, [evidenceId])).toEqual({
      kind: "invalid",
      missing: [prerequisite.description],
      invalid: [evidenceId],
    });
    expect(discoverTaskPrerequisiteEvidence([prerequisite], facts, scope)).toMatchObject({
      knownFacts: [],
      unknownPrerequisites: [{ index: 0, description: prerequisite.description, status: "unknown" }],
    });
  });

  it("rejects duplicate evidence IDs and duplicate explicit selections as ambiguous", () => {
    const first = fact(evidenceId);
    const duplicate = {
      ...fact(evidenceId),
      event: { ...fact(evidenceId).event, id: "50000000-0000-4000-8000-000000000099" },
    } as ConstructionHistoryFact;

    expect(validateSelectedTaskPrerequisiteEvidence([prerequisite], [first, duplicate], scope, [evidenceId])).toEqual({
      kind: "invalid",
      missing: [prerequisite.description],
      invalid: [evidenceId],
    });
    expect(discoverTaskPrerequisiteEvidence([prerequisite], [first, duplicate], scope).knownFacts).toEqual([]);
    expect(validateSelectedTaskPrerequisiteEvidence([prerequisite], [first], scope, [evidenceId, evidenceId])).toEqual({
      kind: "invalid",
      missing: [prerequisite.description],
      invalid: [evidenceId],
    });
  });

  it("does not normalize opaque references or coerce non-string references", () => {
    const nearMatch = fact(evidenceId, {
      inputs: [
        { reference: "opaque:condition#exact/", purpose: "Not the exact reference." },
        { reference: { toString: () => prerequisite.condition }, purpose: "Not a string reference." },
      ],
    });

    expect(validateSelectedTaskPrerequisiteEvidence([prerequisite], [nearMatch], scope, [evidenceId])).toEqual({
      kind: "invalid",
      missing: [prerequisite.description],
      invalid: [],
    });
  });

  it("withholds proof without a current scope or when history is blocked", () => {
    const proof = fact(evidenceId);

    expect(discoverTaskPrerequisiteEvidence([prerequisite], [proof], { taskId: scope.taskId }).knownFacts).toEqual([]);
    expect(discoverTaskPrerequisiteEvidence([prerequisite], [proof], { ...scope, historyBlocked: true }).knownFacts).toEqual([]);
  });

  it("does not mutate prerequisite, evidence, or selection inputs", () => {
    const proof = fact(evidenceId);
    const prerequisites = Object.freeze([Object.freeze({ ...prerequisite })]);
    const facts = Object.freeze([proof]);
    const ids = Object.freeze([evidenceId]);
    const before = JSON.stringify({ prerequisites, facts, ids });

    validateSelectedTaskPrerequisiteEvidence(prerequisites, facts, scope, ids);
    discoverTaskPrerequisiteEvidence(prerequisites, facts, scope);

    expect(JSON.stringify({ prerequisites, facts, ids })).toBe(before);
  });
});
