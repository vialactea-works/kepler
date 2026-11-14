import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryAccess } from "../../packages/cli/src/history/access.js";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, historyManifestDigest, type HistoryInitializationManifest, type HistoryManifest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import { HistoryDrafts } from "../../packages/cli/src/history/drafts.js";
import { HistoryOperations } from "../../packages/cli/src/history/operations.js";
import { HistoryReset } from "../../packages/cli/src/history/reset.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import { historyReconstructionPlan } from "../support/history-reconstruction.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { await Fs.rm(root, { recursive: true, force: true }); await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" }); } });
const apply = (manifest: HistoryManifest) => ({ phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:fixture-operation" });
const verifyScope = async () => ({ status: "valid" as const, reference: "fixture:external-lead-contract", content_version: historyDigest("isolated lead-verifier fixture") });
const verification = { verifyAuthority: async () => ({ status: "valid" as const, reference: "fixture:external-authority" }), verifyMaterial: async () => ({ status: "valid" as const, reference: "fixture:external-material" }), verifyContinuation: async () => ({ status: "valid" as const, reference: "fixture:external-continuation" }) };

const reconstruction = async (interruptActivation = false) => {
  const t = await createHistoryRepository();
  roots.push(t.parent);
  const snapshot = await t.access.storage.snapshot(t.root, t.f.missionId);
  const active = snapshot.files.find((file) => file.path.endsWith("/control/active.json"))!;
  const resetManifest = { ...t.f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: t.f.control.id, content_version: historyDigest(active.bytes) }, source_inventory: historyInventory(snapshot) };
  const scope = { recordHome: t.root, missionId: t.f.missionId };
  const archives = new HistoryArchives(t.access.storage);
  const resetService = new HistoryReset({ access: t.access, archives, next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture-reset" }, verifyScope });
  await resetService.execute(scope, apply(resetManifest));
  const reset = (await t.access.read(t.root, t.f.missionId)).control!;
  const archive = await archives.verify(t.root, t.f.missionId, resetManifest.archive_id);
  const plan = historyReconstructionPlan(t.f, reset, archive);
  const drafts = new HistoryDrafts({ access: t.access, archives, identity: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture-draft" }, ...verification });
  const prepared = await drafts.prepare(scope, { candidate_id: randomUUID(), plan });
  let interrupt = interruptActivation;
  const files = t.access.storage.files;
  const workspace = createNodeMissionWorkspaceRuntime();
  const access = new HistoryAccess(new HistoryStorage({ ...files, write: async (location, value, mode) => {
    if (interrupt && location.relative.endsWith("/control/active.json")) { interrupt = false; throw new Error("Controlled interruption before activation"); }
    return files.write(location, value, mode);
  } }, t.access.storage.repositories), { coordination: workspace.coordination, identity: workspace.identity, next: randomUUID });
  let identities = 0;
  const operations = new HistoryOperations({ access, archives: new HistoryArchives(access.storage), next: () => { identities++; return randomUUID(); }, clock: () => new Date(), producer: { name: "kepler", version: "fixture-publish" }, verifyScope, verifyCandidate: (selected, manifest) => drafts.verify(selected, manifest) });
  return { ...t, scope, drafts, operations, prepared, candidate: prepared.manifest as HistoryRebuildManifest, reset, identities: () => identities };
};

describe("real migration and reconstruction persistence", () => {
  it("checks private draft bytes and publishes only their exact complete generation", async () => {
    const t = await reconstruction();
    expect((await t.access.read(t.root, t.f.missionId)).mode).toBe("recovering");
    const checked = await t.drafts.verify(t.scope, t.candidate);
    const result = await t.operations.execute("publish", t.scope, apply(t.candidate));
    expect(result).toMatchObject({ mode: "active", execution_started: false });
    const view = await t.access.read(t.root, t.f.missionId);
    expect(view.pendingRecovery).toBe(false);
    expect(view.history.events).toHaveLength(4);
    const target = Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "generations", t.candidate.generation_id, "construction");
    expect((await Fs.readdir(target)).sort()).toEqual(t.candidate.candidate_journals.map((journal) => `${journal.journal_id}.jsonl`).sort());
    for (const journal of checked.candidate_journals) expect(new Uint8Array(await Fs.readFile(Path.join(target, `${journal.journal_id}.jsonl`)))).toEqual(journal.bytes);
    await expect(Fs.stat(Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "construction"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects changed retained draft bytes before publishing any generation", async () => {
    const t = await reconstruction();
    const context = await t.access.storage.context(t.root);
    const candidateId = String(t.prepared.candidate_reference).slice("local-draft:".length);
    const journal = t.candidate.candidate_journals[0]!;
    const path = Path.join(context.commonDirectory, "kepler", "missions", t.f.missionId, "recovery", "drafts", candidateId, journal.phase, `${journal.journal_id}.jsonl`);
    await Fs.appendFile(path, "unapproved changed bytes\n");
    await expect(t.operations.execute("publish", t.scope, apply(t.candidate))).rejects.toMatchObject({ code: "history_draft_candidate_changed" });
    expect((await t.access.read(t.root, t.f.missionId)).historyVersion).toBe(t.reset.id);
    expect(await Fs.readFile(path, "utf8")).toContain("unapproved changed bytes");
  });

  it("keeps checked partial installation and retries with the same control identities", async () => {
    const t = await reconstruction(true);
    await expect(t.operations.execute("publish", t.scope, apply(t.candidate))).rejects.toMatchObject({ code: "history_publish_failed", details: { step: "activate", execution_started: false } });
    expect((await t.access.read(t.root, t.f.missionId)).historyVersion).toBe(t.reset.id);
    expect((await t.access.read(t.root, t.f.missionId)).pendingRecovery).toBe(true);
    const calls = t.identities();
    await t.operations.execute("publish", t.scope, apply(t.candidate));
    expect(t.identities()).toBe(calls);
    expect((await t.access.read(t.root, t.f.missionId)).control?.type).toBe("mission.history-rebuilt");
  });

  it("archives and retires healthy direct phase sources after exact-byte migration", async () => {
    const t = await createHistoryRepository();
    roots.push(t.parent);
    const scope = { recordHome: t.root, missionId: t.f.missionId };
    const history = Path.join(t.root, ".kepler", "missions", t.f.missionId, "history");
    await Fs.rm(history, { recursive: true });
    const path = `.kepler/missions/${t.f.missionId}/history/construction/${t.f.journalId}.jsonl`;
    await Fs.mkdir(Path.dirname(Path.join(t.root, path)), { recursive: true });
    await Fs.writeFile(Path.join(t.root, path), t.f.source.bytes);
    const guidePath = `.kepler/missions/${t.f.missionId}/migration-guide.md`;
    const guide = new TextEncoder().encode("Fixture supported migration guide\n");
    await Fs.writeFile(Path.join(t.root, guidePath), guide);
    const snapshot = await t.access.storage.snapshot(t.root, t.f.missionId);
    const source = historyInventory(snapshot).find((source) => source.path === path)!;
    const archiveId = randomUUID();
    const manifest: HistoryInitializationManifest = { ...t.f.manifest, operation: "migrate", generation_id: randomUUID(), archive_id: archiveId, source_inventory: historyInventory(snapshot), guide: "mission:migration-guide.md", guide_hash: historyDigest(guide), source_retirement: [{ source_id: source.source_id, path, byte_length: source.byte_length, content_version: source.content_version, archive_reference: `local-archive:${archiveId}` }], operation_authority: { kind: "manifest-approval", request_reference: t.f.manifest.mission_binding.request_reference } };
    const operations = new HistoryOperations({ access: t.access, archives: new HistoryArchives(t.access.storage), next: randomUUID, clock: () => new Date(), producer: { name: "kepler", version: "fixture-migration" }, verifyScope, readGuide: async (_reference, current) => new Uint8Array(current.files.find((file) => file.path === guidePath)!.bytes) });
    await operations.execute("migrate", scope, apply(manifest));
    const view = await t.access.read(t.root, t.f.missionId);
    expect(view.control?.type).toBe("mission.history-initialized");
    expect(view.history.events.map((record) => record.event?.id)).toEqual([t.f.creation.id, t.f.prepared.id, t.f.unit.id]);
    await expect(Fs.stat(Path.join(history, "construction"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await new HistoryArchives(t.access.storage).verify(t.root, t.f.missionId, archiveId)).files.some((file) => file.path === path && historyDigest(file.bytes) === source.content_version)).toBe(true);
  });
});
