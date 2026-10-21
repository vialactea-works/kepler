import { describe, expect, it } from "vitest";
import { createAuditRecord, type AuditRecordRuntime, type AuditRecordScope } from "../../packages/cli/src/audit/recording.js";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
];

const scope: AuditRecordScope = {
  missionId: "30000000-0000-4000-8000-000000000003",
  unitId: "unit-2026-10-21-example",
  stage: "functional-design",
  stageAttemptId: "40000000-0000-4000-8000-000000000004",
  causedBy: [],
};

const runtime = (values: readonly string[] = ids): AuditRecordRuntime => {
  let index = 0;
  return {
    identities: { next: () => values[index++] ?? "50000000-0000-4000-8000-000000000005" },
    now: () => "2026-10-21T12:00:00Z",
    producer: { name: "kepler", version: "0.10.3" },
  };
};

const journalId = "60000000-0000-4000-8000-000000000006";

describe("audit record creation", () => {
  it("creates evidence with separate event and evidence identities and one inputs list", () => {
    const result = createAuditRecord("evidence", {
      inputs: [{ reference: "opaque:commit", purpose: "Reviewed implementation" }],
      artifact_bindings: [],
      checkpoints: [],
      check: "Typecheck",
      executor: "CI",
      result: { status: "failed", summary: "Type error found" },
    }, scope, journalId, runtime());

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.event).toMatchObject({
      id: ids[0],
      journal_id: journalId,
      type: "construction.evidence-recorded",
      data: {
        evidence_id: ids[1],
        inputs: [{ reference: "opaque:commit", purpose: "Reviewed implementation" }],
        result: { status: "failed", summary: "Type error found" },
      },
    });
    expect(result.event.data).not.toHaveProperty("material");
    expect(result.evidenceId).toBe(ids[1]);
  });

  it("rejects invalid request keys, empty fields, and malformed inputs", () => {
    const result = createAuditRecord("approval", {
      requester: "Requester",
      inputs: [{ reference: "", purpose: "review" }],
      artifact_bindings: [],
      checkpoints: [],
      decision_reference: "opaque:decision",
      extra: true,
    }, scope, journalId, runtime());

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.issues.map((issue) => issue.pointer)).toEqual(expect.arrayContaining(["/extra", "/inputs"]));
  });

  it("records approval against explicit material and decision references", () => {
    const result = createAuditRecord("approval", {
      requester: "Requester",
      inputs: [{ reference: "opaque:checkpoint", purpose: "Reviewed output" }],
      artifact_bindings: [],
      checkpoints: [],
      decision_reference: "opaque:approval-message",
    }, scope, journalId, runtime());

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") expect(result.event.data).toMatchObject({
      requester: "Requester",
      decision_reference: "opaque:approval-message",
      checkpoints: [],
    });
  });

  it("records structured effort changes only on an interaction field", () => {
    const result = createAuditRecord("interaction", {
      participants: ["Requester"],
      content: "Set stage effort to comprehensive.",
      effort_selection: {
        target: "stage",
        stage: "functional-design",
        action: "set",
        level: "comprehensive",
        selected_by: "Requester",
      },
    }, scope, journalId, runtime());

    expect(result.kind, JSON.stringify(result)).toBe("valid");
    if (result.kind === "valid") expect(result.event.data).toHaveProperty("effort_selection");
  });

  it("records unit effort changes and stage override removal as structured selections", () => {
    for (const effort_selection of [
      { target: "unit", action: "set", level: "minimal", selected_by: "Requester" },
      { target: "stage", stage: "functional-design", action: "inherit", selected_by: "Requester" },
    ]) {
      const result = createAuditRecord("interaction", {
        participants: ["Requester"],
        content: "Set an explicit effort choice.",
        effort_selection,
      }, scope, journalId, runtime());
      expect(result.kind).toBe("valid");
    }
  });

  it("rejects stage effort selections that do not match the explicit scope", () => {
    const result = createAuditRecord("interaction", {
      participants: ["Requester"],
      content: "Change another stage effort.",
      effort_selection: {
        target: "stage",
        stage: "quality-requirements",
        action: "inherit",
        selected_by: "Requester",
      },
    }, scope, journalId, runtime());

    expect(result.kind).toBe("invalid");
  });

  it("rejects event and evidence identity reuse", () => {
    const result = createAuditRecord("evidence", {
      inputs: [],
      artifact_bindings: [],
      checkpoints: [],
      check: "Typecheck",
      executor: "CI",
      result: { status: "passed", summary: "Passed" },
    }, scope, journalId, runtime([ids[0], ids[0]]));

    expect(result.kind).toBe("invalid");
  });
});
