import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest } from "../../packages/cli/src/history/control.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
const fixture = async () => {
  const repo = await createHistoryRepository();
  roots.push(repo.parent);
  const relative = `.kepler/missions/${repo.f.missionId}/history/construction/${randomUUID()}.jsonl`;
  const binary = Uint8Array.from([255, 0, 123, 10]);
  await repo.access.storage.files.write({ root: repo.root, relative }, binary, { kind: "create" });
  return { ...repo, relative, binary, archives: new HistoryArchives(repo.access.storage) };
};

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

describe("real archive preservation", () => {
  it("preserves raw bytes and complete material privately under an exclusive scope without activation", async () => {
    const { root, f, access, archives, relative, binary } = await fixture();
    await access.storage.files.write({ root, relative: `${relative}.empty` }, new Uint8Array(), { kind: "create" });
    const original = await access.storage.snapshot(root, f.missionId);
    const originalInventory = historyInventory(original);
    await access.withRecovery(root, f.missionId, async (scope) => {
      const snapshot = await access.snapshot(scope);
      expect(historyInventory(snapshot)).toEqual(originalInventory);
      const manifest = { ...f.resetManifest, source_inventory: historyInventory(snapshot) };
      const index = await archives.prepare(manifest, snapshot);
      const result = await archives.preserve(manifest, index, snapshot);
      expect(result.files.find((file) => file.path === relative)?.bytes).toEqual(binary);
      expect(result.files.find((file) => file.path === `${relative}.empty`)?.bytes).toHaveLength(0);
      const directory = Path.join(snapshot.commonDirectory, "kepler", "missions", f.missionId, "recovery", "archives", f.archiveId);
      expect((await Fs.stat(directory)).mode & 0o777).toBe(0o700);
      for (const entry of await Fs.readdir(directory, { withFileTypes: true })) expect((await Fs.stat(Path.join(directory, entry.name))).mode & 0o777).toBe(entry.isDirectory() ? 0o700 : 0o600);
      expect(result.index.source_inventory).toEqual(originalInventory);
    });
    expect(historyInventory(await access.storage.snapshot(root, f.missionId))).toEqual(originalInventory);
    expect((await access.read(root, f.missionId)).historyVersion).toBe(f.control.id);
    expect(await Fs.readFile(Path.join(root, relative))).toEqual(Buffer.from(binary));
  });

  it("verifies retained copies after source retirement and detects an altered backup", async () => {
    const { root, f, access, archives, relative, binary } = await fixture();
    const snapshot = await access.storage.snapshot(root, f.missionId);
    const source = historyInventory(snapshot).find((entry) => entry.path === relative)!;
    const manifest = { ...f.resetManifest, source_inventory: historyInventory(snapshot), source_retirement: [{ source_id: source.source_id, path: source.path, byte_length: source.byte_length, content_version: source.content_version, archive_reference: `local-archive:${f.archiveId}` }] };
    const index = await archives.prepare(manifest, snapshot);
    await archives.preserve(manifest, index, snapshot);
    expect(await access.storage.files.remove({ root, relative }, historyDigest(binary))).toBe("removed");
    const retry = await archives.preserve(manifest, index, snapshot);
    expect(retry.files.find((file) => file.source_id === source.source_id)?.bytes).toEqual(binary);
    const directory = Path.join(snapshot.commonDirectory, "kepler", "missions", f.missionId, "recovery", "archives", f.archiveId);
    const matches: string[] = [];
    const inspect = async (path: string): Promise<void> => {
      for (const entry of await Fs.readdir(path, { withFileTypes: true })) {
        const child = Path.join(path, entry.name);
        if (entry.isDirectory()) await inspect(child);
        else if ((await Fs.readFile(child)).equals(Buffer.from(binary))) matches.push(child);
      }
    };
    await inspect(directory);
    expect(matches).toHaveLength(1);
    await Fs.writeFile(matches[0]!, Uint8Array.from([0]));
    await expect(archives.verify(root, f.missionId, f.archiveId)).rejects.toMatchObject({ code: "history_archive_verification_failed" });
    expect((await access.read(root, f.missionId)).historyVersion).toBe(f.control.id);
  });
});
