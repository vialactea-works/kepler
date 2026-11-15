import { describe, expect, it } from "vitest";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { missionBindingMatchesCreation, validateCandidateMissionBinding } from "../../packages/cli/src/history/reconstruction-binding.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";

const candidate = (f: ReturnType<typeof historyGenerationFixture>, events = [f.creation, f.prepared, f.unit]) => {
  const history = collectHistory(f.missionId, [{ ...f.source, bytes: historyTestBytes(events) }], { completeness: "complete", generationId: f.generationId });
  expect(history.issues).toEqual([]);
  return history;
};

describe("reset-bound candidate mission identity", () => {
  it("accepts literal, creation-event and context request references", () => {
    const f = historyGenerationFixture();
    const binding = f.resetManifest.mission_binding;
    expect(missionBindingMatchesCreation(binding, f.creation)).toBe(true);
    expect(missionBindingMatchesCreation({ ...binding, request_reference: `event:${f.creation.id}` }, f.creation)).toBe(true);
    const contextual = { ...f.creation, data: { ...f.creation.data, contexts: [{ reference: "request:original-context", purpose: "Original request" }] } };
    expect(missionBindingMatchesCreation({ ...binding, request_reference: "request:original-context" }, contextual)).toBe(true);
  });

  it("rejects incomplete or mismatched creation facts", () => {
    const f = historyGenerationFixture();
    const binding = f.resetManifest.mission_binding;
    for (const value of [null, [], {}, { ...f.creation, id: null }, { ...f.creation, data: null }, f.unit]) {
      expect(missionBindingMatchesCreation(binding, value)).toBe(false);
    }
    for (const data of [
      { ...f.creation.data, mission_id: "another-mission" },
      { ...f.creation.data, record_home: { repository_id: "another-repository" } },
      { ...f.creation.data, workflow: "another-workflow" },
      { ...f.creation.data, request: "Another request", contexts: [] },
    ]) expect(missionBindingMatchesCreation(binding, { ...f.creation, data })).toBe(false);
  });

  it("requires the exact reset-bound unit set and one matching creation", () => {
    const f = historyGenerationFixture();
    const binding = f.resetManifest.mission_binding;
    const history = candidate(f);
    expect(() => validateCandidateMissionBinding(binding, history, "history_reconstruction_binding_mismatch")).not.toThrow();
    for (const changed of [
      { ...binding, unit_ids: [] },
      { ...binding, unit_ids: [...binding.unit_ids, "2026-11-14-extra"] },
      { ...binding, request_reference: "request:another-request" },
      { ...binding, record_home_repository_id: "another-repository" },
    ]) expect(() => validateCandidateMissionBinding(changed, history, "history_reconstruction_binding_mismatch")).toThrow(expect.objectContaining({ code: "history_reconstruction_binding_mismatch" }));
    expect(() => validateCandidateMissionBinding(binding, { ...history, events: history.events.filter((entry) => entry.constructionEvent?.type !== "construction.mission-created") }, "history_reconstruction_binding_mismatch")).toThrow(expect.objectContaining({ code: "history_reconstruction_binding_mismatch" }));
    expect(() => validateCandidateMissionBinding(binding, { ...history, events: [...history.events, history.events[0]!] }, "history_reconstruction_binding_mismatch")).toThrow(expect.objectContaining({ code: "history_reconstruction_binding_mismatch" }));
  });

  it("accepts the exact unit identity set in either manifest order", () => {
    const f = historyGenerationFixture();
    const ids = ["2026-11-13-a-b", "2026-11-13-aa"];
    const units = ids.map((id) => historyTestEvent("construction.unit-created", { ...f.unit.data, unit_id: id, directory: `construction/units-of-work/${id}` }, f.journalId, [f.prepared.id]));
    const history = candidate(f, [f.creation, f.prepared, ...units]);
    for (const unit_ids of [ids, [...ids].reverse()]) {
      expect(() => validateCandidateMissionBinding({ ...f.resetManifest.mission_binding, unit_ids }, history, "history_reconstruction_binding_mismatch")).not.toThrow();
    }
  });
});
