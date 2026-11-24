import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryContinuations, parseHistoryContinuation } from "../../packages/cli/src/history/continuation.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import type { HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import type { ReconstructionContinuationRequest } from "../../packages/cli/src/history/reconstruction.js";
import type { UnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";
import { historyTestBytes, historyTestEvent } from "../support/history-generation.js";

const files: UnitQueryFileSystem = { entries: async () => [], directories: async () => [], journals: async () => [], read: async () => { throw new Error("Unexpected material read in a stage-only continuation"); } };
const fixture = async () => {
  const t = await historyReconstructionFixture();
  const draft = await t.drafts.prepare(t.scope, t.request);
  const checked = await t.drafts.verify(t.scope, draft.manifest as HistoryRebuildManifest);
  const request = (operation: string): ReconstructionContinuationRequest => { const continuation = { operation, unresolved_work: ["Author the revised design"], required_approvals: ["Renew Functional Design approval before completion"] }; return { reset: t.reset, plan: { ...t.plan, continuation }, continuation, history: checked.history, expected_state: checked.state, required_material: t.plan.required_material }; };
  const verifier = new HistoryContinuations({ recordHome: "/record", fileSystem: files, verifyWorkspaces: async () => ({ status: "valid", reference: "fixture:actual-workspace-contract" }) });
  return { ...t, checked, request, verifier };
};

describe("concrete provider-neutral continuation", () => {
  it("parses supported domain operations with explicit scope selectors", () => {
    const task = randomUUID();
    const attempt = randomUUID();
    expect(parseHistoryContinuation("recovery.inspect")).toEqual({ operation: "recovery.inspect" });
    expect(parseHistoryContinuation("construction.unit.show:2026-11-13-recovery")).toEqual({ operation: "construction.unit.show", unitId: "2026-11-13-recovery" });
    expect(parseHistoryContinuation("construction.stage.start:unit:functional-design")).toEqual({ operation: "construction.stage.start", unitId: "unit", stage: "functional-design" });
    expect(parseHistoryContinuation(`construction.stage.continue:unit:implementation:${attempt}`)).toMatchObject({ attemptId: attempt });
    expect(parseHistoryContinuation(`construction.task.admit:unit:${task}`)).toMatchObject({ taskId: task });
    expect(parseHistoryContinuation(`construction.activity.show:unit:${task}:code-generation:${attempt}`)).toMatchObject({ activity: "code-generation", implementationAttemptId: attempt });
  });

  it.each([null, 1, "", "inspect the selected unit", "construction.unit.show", "construction.unit.show:../escape", "construction.unit.show:unit:extra", "construction.stage.start:unit:unknown", "construction.stage.continue:unit:quality-requirements", "construction.task.ready:unit:not-a-uuid", "construction.activity.show:unit:bad:code-generation:bad"])("rejects unsupported or incomplete operation text: %j", (value) => {
    expect(() => parseHistoryContinuation(value)).toThrowError();
  });

  it("accepts normal unit/stage queries and a genuinely ready Functional Design start", async () => {
    const t = await fixture();
    for (const operation of ["recovery.inspect", `construction.unit.show:${t.f.unitId}`, `construction.stage.show:${t.f.unitId}:functional-design`, `construction.stage.start:${t.f.unitId}:functional-design`]) expect(await t.verifier.verify(t.request(operation))).toMatchObject({ status: "valid" });
  });

  it("rejects a premature stage, unknown unit, false state and wrong reset binding", async () => {
    const t = await fixture();
    expect(await t.verifier.verify(t.request(`construction.stage.start:${t.f.unitId}:quality-requirements`))).toMatchObject({ status: "invalid" });
    expect(await t.verifier.verify(t.request("construction.unit.show:another-unit"))).toMatchObject({ status: "invalid" });
    const request = t.request(`construction.unit.show:${t.f.unitId}`);
    expect(await t.verifier.verify({ ...request, expected_state: {} })).toMatchObject({ status: "invalid" });
    expect(await t.verifier.verify({ ...request, plan: { ...request.plan, reset_event_id: randomUUID() } })).toMatchObject({ status: "invalid" });
  });

  it("requires the exact running attempt and does not convert continuation into a new start", async () => {
    const t = await fixture();
    const attempt = randomUUID();
    const journal = randomUUID();
    const causes = [t.f.creation.id, t.f.prepared.id, t.f.unit.id];
    const started = historyTestEvent("construction.stage-attempt-started", { mission_id: t.f.missionId, unit_id: t.f.unitId, stage: "functional-design", stage_attempt_id: attempt, inputs: [], checkpoints: [], authority_event_ids: causes }, journal, causes);
    const history = collectHistory(t.f.missionId, [...t.checked.history.journals.map((source) => ({ sourceId: source.sourceId, missionId: source.missionId, generationId: t.plan.generation_id, phase: source.phase, journalId: source.journalId, bytes: source.bytes })), { sourceId: "fixture:current-stage", missionId: t.f.missionId, generationId: t.plan.generation_id, phase: "construction", journalId: journal, bytes: historyTestBytes([started]) }], { completeness: "complete", generationId: t.plan.generation_id });
    const request = (operation: string) => ({ ...t.request(operation), history, expected_state: historyState(history) });
    expect(await t.verifier.verify(request(`construction.stage.continue:${t.f.unitId}:functional-design:${attempt}`))).toMatchObject({ status: "valid" });
    expect(await t.verifier.verify(request(`construction.stage.continue:${t.f.unitId}:functional-design:${randomUUID()}`))).toMatchObject({ status: "invalid" });
    expect(await t.verifier.verify(request(`construction.stage.start:${t.f.unitId}:functional-design`))).toMatchObject({ status: "invalid" });
  });

  it("uses the real query guards and actual workspace check instead of granting arbitrary readiness", async () => {
    const t = await fixture();
    expect(await t.verifier.verify(t.request(`construction.task.admit:${t.f.unitId}:${randomUUID()}`))).toMatchObject({ status: "invalid" });
    const blocked = new HistoryContinuations({ recordHome: "/record", fileSystem: files, verifyWorkspaces: async () => ({ status: "invalid", reason: "Recorded workspace identity changed" }) });
    expect(await blocked.verify(t.request(`construction.stage.start:${t.f.unitId}:functional-design`))).toMatchObject({ status: "invalid", reason: "Recorded workspace identity changed" });
  });

  it("isolates request history and remaining approvals from a mutating collaborator", async () => {
    const t = await fixture();
    const request = t.request(`construction.stage.start:${t.f.unitId}:functional-design`);
    const before = historyState(request.history);
    const mutating = new HistoryContinuations({ recordHome: "/record", fileSystem: files, verifyWorkspaces: async (view) => { (view.history.events as unknown[]).splice(0); (view.unit.stages as unknown[]).splice(0); return { status: "valid", reference: "fixture:isolated-view" }; } });
    expect(await mutating.verify(request)).toMatchObject({ status: "valid" });
    expect(historyState(request.history)).toEqual(before);
    expect(request.continuation.required_approvals).toEqual(["Renew Functional Design approval before completion"]);
  });
});
