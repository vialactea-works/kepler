import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryAccess } from "../../packages/cli/src/history/access.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, historyManifestDigest, parseHistoryControl, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import type { HistoryFiles } from "../../packages/cli/src/history/files.js";
import { HistoryReset } from "../../packages/cli/src/history/reset.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { parseHistoryOperationIntent } from "../../packages/cli/src/history/operation-intent.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const fixture = async (overrides: (files: HistoryFiles) => Partial<HistoryFiles> = () => ({})) => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  const storage = new HistoryStorage({ ...h.storage.files, ...overrides(h.storage.files) }, h.storage.repositories);
  const access = new HistoryAccess(storage, h.runtime);
  let identities = 0;
  let rejected = false;
  const reset = new HistoryReset({ access, archives: new HistoryArchives(storage), next: () => { identities++; return randomUUID(); }, clock: () => new Date("2026-11-14T00:00:00.000Z"), producer: { name: "kepler-recovery", version: "fixture-current" }, verifyScope: async () => rejected ? { status: "invalid", reason: "Unresolved fixture worker" } : { status: "valid", reference: "owner:actual-fixture-reconciliation", content_version: historyDigest("verified fixture owner receipt") } });
  const scope = { recordHome: "/record", missionId: f.missionId };
  const proposal = async (): Promise<HistoryResetManifest> => {
    const snapshot = await storage.snapshot("/record", f.missionId);
    const raw = h.entries.get(`/record/.kepler/missions/${f.missionId}/history/control/active.json`);
    let previous: ReturnType<typeof parseHistoryControl> | undefined;
    try { previous = raw ? parseHistoryControl(new TextDecoder().decode(raw)) : undefined; } catch {}
    return { ...f.resetManifest, archive_id: randomUUID(), generation_id: randomUUID(), previous_control: { event_id: previous?.id ?? null, content_version: raw ? historyDigest(raw) : null }, source_inventory: historyInventory(snapshot) };
  };
  const manifest = await proposal();
  const apply = (manifest: HistoryResetManifest) => ({ phase: "apply", manifest, requester: manifest.requester, approved_manifest_hash: historyManifestDigest(manifest), decision_reference: "decision:exact-reset" });
  return { f, h, storage, access, reset, scope, manifest, proposal, apply, identities: () => identities, reject: () => { rejected = true; } };
};

describe("fenced mission reset", () => {
  it("previews exact raw inputs without allocating envelope identities or writing files", async () => {
    const t = await fixture();
    const before = new Map(t.h.entries);
    const result = await t.reset.execute(t.scope, { phase: "preview", manifest: t.manifest });
    expect(result).toMatchObject({ phase: "preview", proposed: true, execution_started: false, mode: "recovering", manifest_hash: historyManifestDigest(t.manifest), history_version: t.f.control.id });
    expect(t.identities()).toBe(0);
    expect(t.h.entries).toEqual(before);
    expect(t.h.held.size).toBe(0);
  });

  it("preserves originals and activates recovery mode without starting or accepting phase work", async () => {
    const t = await fixture();
    const original = new Uint8Array(t.f.source.bytes);
    const result = await t.reset.execute(t.scope, t.apply(t.manifest));
    expect(result).toMatchObject({ mode: "recovering", generation_id: t.manifest.generation_id, execution_started: false, already_applied: false });
    const view = await t.access.read("/record", t.f.missionId);
    expect(view.history.events).toEqual([]);
    expect(view.pendingRecovery).toBe(false);
    expect(view.historyVersion).not.toBe(t.f.control.id);
    expect(view.control?.producer).toEqual({ name: "kepler-recovery", version: "fixture-current" });
    expect(view.control?.recorded_at).toBe("2026-11-14T00:00:00.000Z");
    expect(t.h.entries.get(`/record/.kepler/missions/${t.f.missionId}/history/generations/${t.f.generationId}/construction/${t.f.journalId}.jsonl`)).toEqual(original);
    expect([...t.h.entries.keys()].filter((path) => path.includes("/recovery/completed/"))).toHaveLength(1);
    expect([...t.h.entries.keys()].filter((path) => path.includes("/recovery/pending/"))).toHaveLength(0);
  });

  it("returns an original completed receipt without reactivating it after a later reset", async () => {
    const t = await fixture();
    const original = await t.reset.execute(t.scope, t.apply(t.manifest));
    const next = await t.proposal();
    await t.reset.execute(t.scope, t.apply(next));
    const before = new Map(t.h.entries);
    const identities = t.identities();
    const repeated = await t.reset.execute(t.scope, t.apply(t.manifest));
    expect(repeated.already_applied).toBe(true);
    expect(repeated.receipt).toEqual(original.receipt);
    expect(repeated.history_version).not.toBe(original.history_version);
    expect(t.h.entries).toEqual(before);
    expect(t.identities()).toBe(identities);
  });

  it("reuses original envelopes and instructions after activation is interrupted", async () => {
    let fail = true;
    const t = await fixture((files) => ({ write: async (location, bytes, mode) => {
      if (fail && location.relative.endsWith("/control/active.json")) { fail = false; throw new Error("Interrupted activation fixture"); }
      return files.write(location, bytes, mode);
    } }));
    await expect(t.reset.execute(t.scope, t.apply(t.manifest))).rejects.toMatchObject({ code: "history_reset_failed", details: { step: "activate", execution_started: false } });
    const pending = [...t.h.entries].find(([path]) => path.includes("/recovery/pending/"))!;
    const intent = parseHistoryOperationIntent(new TextDecoder().decode(pending[1]));
    const identities = t.identities();
    expect((await t.access.read("/record", t.f.missionId)).pendingRecovery).toBe(true);
    const result = await t.reset.execute(t.scope, t.apply(t.manifest));
    expect(result.history_version).toBe(intent.control.id);
    expect(t.identities()).toBe(identities);
    expect((await t.access.read("/record", t.f.missionId)).pendingRecovery).toBe(false);
  });

  it("rejects missing approval, changed inputs, reused generations and unverified effects", async () => {
    const t = await fixture();
    await expect(t.reset.execute(t.scope, { phase: "apply", manifest: t.manifest })).rejects.toMatchObject({ code: "history_request_invalid" });
    const changed = { ...t.manifest, source_inventory: t.manifest.source_inventory.slice(1) };
    await expect(t.reset.execute(t.scope, { phase: "preview", manifest: changed })).rejects.toMatchObject({ code: "history_source_changed" });
    await expect(t.reset.execute(t.scope, { phase: "preview", manifest: { ...t.manifest, generation_id: t.f.generationId } })).rejects.toMatchObject({ code: "history_generation_reused" });
    t.reject();
    await expect(t.reset.execute(t.scope, t.apply(t.manifest))).rejects.toMatchObject({ code: "history_scope_verification_failed" });
    expect((await t.access.read("/record", t.f.missionId)).historyVersion).toBe(t.f.control.id);
  });

  it("reports the durable control and exact unfinished fence release after cleanup fails", async () => {
    const t = await fixture();
    t.h.controls.failRelease = true;
    await expect(t.reset.execute(t.scope, t.apply(t.manifest))).rejects.toMatchObject({ code: "history_admission_release_failed", details: { step: "release-mission-fence", generation_id: t.manifest.generation_id, effects_uncertain: true } });
    expect((await t.access.read("/record", t.f.missionId)).mode).toBe("recovering");
    expect(t.h.held.size).toBe(1);
  });
});
