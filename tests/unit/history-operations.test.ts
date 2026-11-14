import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryAccess } from "../../packages/cli/src/history/access.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, historyManifestDigest, type HistoryInitializationManifest, type HistoryManifest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import type { HistoryFiles } from "../../packages/cli/src/history/files.js";
import { HistoryOperations } from "../../packages/cli/src/history/operations.js";
import { parseHistoryOperationIntent } from "../../packages/cli/src/history/operation-intent.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";

const apply = (manifest: HistoryManifest) => ({ phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:exact-operation" });
const scopeCheck = async () => ({ status: "valid" as const, reference: "fixture:lead-checked", content_version: historyDigest("fixture retained lead evidence") });

const publication = async (overrides: (files: HistoryFiles) => Partial<HistoryFiles> = () => ({})) => {
  const t = await historyReconstructionFixture();
  const candidate = (await t.drafts.prepare(t.scope, t.request)).manifest as HistoryRebuildManifest;
  const storage = new HistoryStorage({ ...t.h.storage.files, ...overrides(t.h.storage.files) }, t.h.storage.repositories);
  const access = new HistoryAccess(storage, t.h.runtime);
  let identities = 0;
  const operations = new HistoryOperations({ access, archives: new HistoryArchives(storage), next: () => { identities++; return randomUUID(); }, clock: () => new Date("2026-11-14T03:00:00.000Z"), producer: { name: "kepler", version: "fixture-publication" }, verifyScope: scopeCheck, verifyCandidate: (scope, manifest) => t.drafts.verify(scope, manifest) });
  return { ...t, candidate, operations, access, identities: () => identities };
};

const migration = async () => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  const prefix = `/record/.kepler/missions/${f.missionId}/history/`;
  for (const key of h.entries.keys()) if (key.startsWith(prefix)) h.entries.delete(key);
  h.entries.delete(h.bindingPath);
  const path = `.kepler/missions/${f.missionId}/history/construction/${f.journalId}.jsonl`;
  h.entries.set(`/record/${path}`, new Uint8Array(f.source.bytes));
  const guidePath = `.kepler/missions/${f.missionId}/recovery/migration-guide.md`;
  const guide = new TextEncoder().encode("Fixture migration guide\n");
  h.entries.set(`/record/${guidePath}`, guide);
  const snapshot = await h.storage.snapshot("/record", f.missionId);
  const source = historyInventory(snapshot).find((source) => source.path === path)!;
  const archiveId = randomUUID();
  const manifest: HistoryInitializationManifest = { ...f.manifest, operation: "migrate", generation_id: randomUUID(), source_inventory: historyInventory(snapshot), archive_id: archiveId, guide: "mission:recovery/migration-guide.md", guide_hash: historyDigest(guide), source_retirement: [{ source_id: source.source_id, path, byte_length: source.byte_length, content_version: source.content_version, archive_reference: `local-archive:${archiveId}` }], operation_authority: { kind: "manifest-approval", request_reference: f.manifest.mission_binding.request_reference } };
  const operations = new HistoryOperations({ access: h.access, archives: new HistoryArchives(h.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture-migration" }, verifyScope: scopeCheck, readGuide: async (_reference, current) => new Uint8Array(current.files.find((file) => file.path === guidePath)!.bytes) });
  return { f, h, manifest, operations, path, scope: { recordHome: "/record", missionId: f.missionId } };
};

describe("fenced migration and publication", () => {
  it("previews then publishes independently recompiled phase progress through the normal gateway", async () => {
    const t = await publication();
    const before = new Map(t.h.entries);
    expect(await t.operations.execute("publish", t.scope, { phase: "preview", manifest: t.candidate })).toMatchObject({ proposed: true, mode: "active", execution_started: false });
    expect(t.h.entries).toEqual(before);
    const result = await t.operations.execute("publish", t.scope, apply(t.candidate));
    const view = await t.access.read("/record", t.f.missionId);
    expect(result).toMatchObject({ mode: "active", execution_started: false });
    expect(view.control?.type).toBe("mission.history-rebuilt");
    expect(view.history.events).toHaveLength(4);
    expect(view.pendingRecovery).toBe(false);
    expect(view.control?.caused_by).toEqual([t.reset.id]);
    expect(t.identities()).toBe(2);
  });

  it("accepts an original receipt after legitimate appends without restoring its old prefix", async () => {
    const t = await publication();
    const first = await t.operations.execute("publish", t.scope, apply(t.candidate));
    const journal = t.candidate.candidate_journals[0]!;
    const path = `/record/.kepler/missions/${t.f.missionId}/history/generations/${t.manifest.generation_id}/construction/${journal.journal_id}.jsonl`;
    const old = t.h.entries.get(path)!;
    const later = historyTestBytes([historyTestEvent("construction.interaction-recorded", { mission_id: t.f.missionId, unit_id: t.f.unitId, participants: ["requester"], content: "Later normal work", references: [] }, journal.journal_id, [t.f.unit.id])]);
    const combined = new Uint8Array(old.length + later.length); combined.set(old); combined.set(later, old.length);
    t.h.entries.set(path, combined);
    const before = new Map(t.h.entries);
    expect(await t.operations.execute("publish", t.scope, apply(t.candidate))).toMatchObject({ already_applied: true, receipt: first.receipt });
    expect(t.h.entries).toEqual(before);
    expect((await t.access.read("/record", t.f.missionId)).history.events).toHaveLength(5);
  });

  it("reuses exact publication instructions after activation failure", async () => {
    let fail = true;
    const t = await publication((files) => ({ write: async (location, value, mode) => {
      if (fail && location.relative.endsWith("/control/active.json")) { fail = false; throw new Error("Fixture activation interruption"); }
      return files.write(location, value, mode);
    } }));
    await expect(t.operations.execute("publish", t.scope, apply(t.candidate))).rejects.toMatchObject({ details: { step: "activate", execution_started: false } });
    const pending = [...t.h.entries].find(([path]) => path.includes("/recovery/pending/"))![1];
    const intent = parseHistoryOperationIntent(new TextDecoder().decode(pending));
    const identities = t.identities();
    const result = await t.operations.execute("publish", t.scope, apply(t.candidate));
    expect(result.history_version).toBe(intent.control.id);
    expect(t.identities()).toBe(identities);
  });

  it("rejects an unowned partial generation without adopting its bytes", async () => {
    const t = await publication();
    const path = `/record/.kepler/missions/${t.f.missionId}/history/generations/${t.manifest.generation_id}/construction/${randomUUID()}.jsonl`;
    const unknown = new Uint8Array([0xff, 0x00]);
    t.h.entries.set(path, unknown);
    await expect(t.operations.execute("publish", t.scope, apply(t.candidate))).rejects.toMatchObject({ code: "history_publication_partial_generation" });
    expect(t.h.entries.get(path)).toEqual(unknown);
    expect((await t.access.read("/record", t.f.missionId)).mode).toBe("recovering");
  });

  it("migrates exact healthy legacy events, preserves their archive and retires direct sources", async () => {
    const t = await migration();
    const before = new Map(t.h.entries);
    await t.operations.execute("migrate", t.scope, { phase: "preview", manifest: t.manifest });
    expect(t.h.entries).toEqual(before);
    await t.operations.execute("migrate", t.scope, apply(t.manifest));
    const view = await t.h.access.read("/record", t.f.missionId);
    expect(view.control?.type).toBe("mission.history-initialized");
    expect(view.control?.caused_by).toEqual([t.f.creation.id]);
    expect(view.history.events.map((record) => record.event?.id)).toEqual([t.f.creation.id, t.f.prepared.id, t.f.unit.id]);
    expect(t.h.entries.has(`/record/${t.path}`)).toBe(false);
    expect(t.h.entries.get(`/record/.kepler/missions/${t.f.missionId}/history/generations/${t.manifest.generation_id}/construction/${t.f.journalId}.jsonl`)).toEqual(t.f.source.bytes);
    expect((await new HistoryArchives(t.h.storage).verify("/record", t.f.missionId, t.manifest.archive_id!)).files.some((file) => file.path === t.path)).toBe(true);
  });

  it("rejects semantic migration changes and changed guide material", async () => {
    const t = await migration();
    await expect(t.operations.execute("migrate", t.scope, { phase: "preview", manifest: { ...t.manifest, expected_state: { forged: true } } })).rejects.toMatchObject({ code: "history_migration_state_changed" });
    await expect(t.operations.execute("migrate", t.scope, { phase: "preview", manifest: { ...t.manifest, guide_hash: historyDigest("different guide") } })).rejects.toMatchObject({ code: "history_migration_guide_changed" });
    expect((await t.h.access.read("/record", t.f.missionId)).mode).toBe("legacy");
  });
});
