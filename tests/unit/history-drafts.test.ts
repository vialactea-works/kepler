import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryDrafts, parseHistoryDraft } from "../../packages/cli/src/history/drafts.js";
import { historyDigest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";

const prepare = async () => {
  const t = await historyReconstructionFixture();
  const result = await t.drafts.prepare(t.scope, t.request);
  return { ...t, result, candidate: result.manifest as HistoryRebuildManifest };
};

describe("retained reconstruction drafts", () => {
  it("stores checked private output without selecting it or starting a workflow", async () => {
    const t = await prepare();
    expect(t.result).toMatchObject({ published: false, execution_started: false, candidate_reference: `local-draft:${t.request.candidate_id}` });
    expect((await t.h.access.read("/record", t.f.missionId)).historyVersion).toBe(t.reset.id);
    expect((await t.h.access.read("/record", t.f.missionId)).mode).toBe("recovering");
    expect(t.allocated()).toBeGreaterThan(0);
    expect(t.candidate.candidate_journals.every((journal) => journal.reference.startsWith(`local-draft:${t.request.candidate_id}/`))).toBe(true);
  });

  it("independently recompiles retained instructions and rechecks material on identical retry", async () => {
    const t = await prepare();
    const before = new Map(t.h.entries);
    const allocated = t.allocated();
    const firstMaterialChecks = t.calls.material;
    expect(await t.drafts.prepare(t.scope, t.request)).toEqual(t.result);
    expect(t.allocated()).toBe(allocated);
    expect(t.h.entries).toEqual(before);
    expect(t.calls.material).toBeGreaterThan(firstMaterialChecks);
    const checked = await t.drafts.verify(t.scope, t.candidate);
    expect(checked.manifest).toEqual(t.candidate);
    expect(checked.candidate_journals.every((journal) => historyDigest(journal.bytes) === journal.content_version)).toBe(true);
  });

  it("rejects changed candidate bytes and unknown files without overwriting them", async () => {
    const t = await prepare();
    const path = `/git/kepler/missions/${t.f.missionId}/recovery/drafts/${t.request.candidate_id}/construction/${t.candidate.candidate_journals[0]!.journal_id}.jsonl`;
    const changed = new TextEncoder().encode("changed retained bytes\n");
    t.h.entries.set(path, changed);
    await expect(t.drafts.verify(t.scope, t.candidate)).rejects.toMatchObject({ code: "history_draft_candidate_changed" });
    await expect(t.drafts.prepare(t.scope, t.request)).rejects.toMatchObject({ code: "history_file_conflict" });
    expect(t.h.entries.get(path)).toEqual(changed);
    const other = await prepare();
    other.h.entries.set(`/git/kepler/missions/${other.f.missionId}/recovery/drafts/${other.request.candidate_id}/unknown.bin`, new Uint8Array([0xff]));
    await expect(other.drafts.verify(other.scope, other.candidate)).rejects.toMatchObject({ code: "history_draft_unexpected_source" });
  });

  it("rejects changed plans, selectors, approvals and unknown draft fields", async () => {
    const t = await prepare();
    await expect(t.drafts.prepare(t.scope, { ...t.request, plan: { ...t.plan, requester: "Another requester" } })).rejects.toMatchObject({ code: "history_draft_conflict" });
    await expect(t.drafts.prepare(t.scope, { candidate_id: "../bad", plan: t.plan })).rejects.toMatchObject({ code: "history_draft_request_invalid" });
    await expect(t.drafts.prepare({ ...t.scope, missionId: randomUUID() }, t.request)).rejects.toMatchObject({ code: "history_scope_invalid" });
    const metadata = [...t.h.entries].find(([path]) => path.endsWith(`/drafts/${t.request.candidate_id}/draft.json`))![1];
    const draft = parseHistoryDraft(new TextDecoder().decode(metadata));
    expect(() => parseHistoryDraft({ ...draft, arbitrary: true })).toThrowError();
    await expect(t.drafts.verify(t.scope, { ...t.candidate, requester: "Another requester" })).rejects.toMatchObject({ code: "history_draft_conflict" });
  });

  it("fails publication verification if real verifiers no longer accept authority or material", async () => {
    const t = await prepare();
    const changedAuthority = new HistoryDrafts({ ...t.runtime, verifyAuthority: async () => ({ status: "invalid", reason: "Authority was withdrawn" }) });
    await expect(changedAuthority.verify(t.scope, t.candidate)).rejects.toMatchObject({ code: "history_reconstruction_authority_invalid" });
    const changedMaterial = new HistoryDrafts({ ...t.runtime, verifyMaterial: async () => ({ status: "invalid", reason: "The checkpoint is unavailable" }) });
    await expect(changedMaterial.verify(t.scope, t.candidate)).rejects.toMatchObject({ code: "history_reconstruction_material_invalid" });
  });
});
