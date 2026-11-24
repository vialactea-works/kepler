import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, historyManifestDigest } from "../../packages/cli/src/history/control.js";
import { HistoryReset } from "../../packages/cli/src/history/reset.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

const fixture = async () => {
  const repository = await createHistoryRepository();
  roots.push(repository.parent);
  const { root, f, access } = repository;
  const snapshot = await access.storage.snapshot(root, f.missionId);
  const activation = snapshot.files.find((file) => file.path.endsWith("/control/active.json"))!;
  const manifest = { ...f.resetManifest, generation_id: randomUUID(), archive_id: randomUUID(), previous_control: { event_id: f.control.id, content_version: historyDigest(activation.bytes) }, source_inventory: historyInventory(snapshot) };
  let identities = 0;
  const reset = new HistoryReset({ access, archives: new HistoryArchives(access.storage), next: () => { identities++; return randomUUID(); }, clock: () => new Date(), producer: { name: "kepler", version: "fixture-current" }, verifyScope: async () => ({ status: "valid", reference: "fixture:lead-scope-verification", content_version: historyDigest("isolated external-verifier fixture") }) });
  const request = { phase: "apply", manifest, requester: manifest.requester, approved_manifest_hash: historyManifestDigest(manifest), decision_reference: "decision:exact-fixture-reset" };
  return { ...repository, manifest, reset, request, scope: { recordHome: root, missionId: f.missionId }, identities: () => identities };
};

describe("real fenced reset persistence", () => {
  it("preserves inputs before selecting recovery and retries without duplicate envelopes", async () => {
    const t = await fixture();
    const original = await Fs.readFile(Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "generations", t.f.generationId, "construction", `${t.f.journalId}.jsonl`));
    const result = await t.reset.execute(t.scope, t.request);
    const version = result.history_version;
    expect(result).toMatchObject({ mode: "recovering", generation_id: t.manifest.generation_id, execution_started: false, already_applied: false });
    const view = await t.access.read(t.root, t.f.missionId);
    expect(view.history.events).toEqual([]);
    expect(view.pendingRecovery).toBe(false);
    const control = Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "control");
    expect(await Fs.readFile(Path.join(control, "active.json"))).toEqual(await Fs.readFile(Path.join(control, "events", `${view.control!.journal_id}.jsonl`)));
    const calls = t.identities();
    const retried = await t.reset.execute(t.scope, t.request);
    expect(retried).toMatchObject({ already_applied: true, history_version: version });
    expect(t.identities()).toBe(calls);
    expect(await Fs.readFile(Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "generations", t.f.generationId, "construction", `${t.f.journalId}.jsonl`))).toEqual(original);
    expect((await new HistoryArchives(t.access.storage).verify(t.root, t.f.missionId, t.manifest.archive_id)).index.source_inventory).toEqual(t.manifest.source_inventory);
  });

  it("keeps the prior activation when an original input changes after preview", async () => {
    const t = await fixture();
    const active = Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "control", "active.json");
    const original = await Fs.readFile(active);
    await t.reset.execute(t.scope, { phase: "preview", manifest: t.manifest });
    const source = Path.join(t.root, ".kepler", "missions", t.f.missionId, "history", "generations", t.f.generationId, "construction", `${t.f.journalId}.jsonl`);
    await Fs.appendFile(source, "changed input\n");
    await expect(t.reset.execute(t.scope, t.request)).rejects.toMatchObject({ code: "history_source_changed" });
    expect(await Fs.readFile(active)).toEqual(original);
  });
});
