import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { historyDigest, type HistoryResetManifest } from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { HistoryStorage, historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const fixture = async () => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  const damaged = `/record/.kepler/missions/${f.missionId}/history/construction/${randomUUID()}.jsonl`;
  h.entries.set(damaged, Uint8Array.from([255, 0, 123, 10]));
  h.entries.set(`${damaged}.empty`, new Uint8Array());
  const snapshot = await h.storage.snapshot("/record", f.missionId);
  const manifest: HistoryResetManifest = { ...f.resetManifest, source_inventory: historyInventory(snapshot) };
  const archives = new HistoryArchives(h.storage);
  const index = await archives.prepare(manifest, snapshot);
  const prefix = `/git/kepler/missions/${f.missionId}/recovery/archives/${manifest.archive_id}/`;
  return { f, h, snapshot, manifest, archives, index, prefix, damaged };
};

describe("verified history archives", () => {
  it("preserves every available file, exact binary and empty bytes without changing originals", async () => {
    const { f, h, snapshot, manifest, archives, index, prefix } = await fixture();
    const originals = new Map([...h.entries].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
    const result = await archives.preserve(manifest, index, snapshot);
    expect(result.files).toHaveLength(snapshot.files.length);
    expect(result.index).toEqual(index);
    expect(result.index_content_version).toBe(historyDigest(canonicalJson(index)));
    expect(result.files.some((file) => file.bytes.length === 0)).toBe(true);
    expect(result.files.some((file) => file.bytes[0] === 255)).toBe(true);
    for (const [path, bytes] of originals) expect(h.entries.get(path)).toEqual(bytes);
    for (const path of h.entries.keys()) if (!originals.has(path)) expect(path.startsWith(prefix)).toBe(true);
    result.files[0]!.bytes.fill(0);
    expect((await archives.verify("/record", f.missionId, index.archive_id)).files[0]!.bytes).toEqual(snapshot.files[0]!.bytes);
  });

  it("reuses exact completed preservation after original files are retired without new writes", async () => {
    const { f, h, snapshot, manifest, archives, index } = await fixture();
    await archives.preserve(manifest, index, snapshot);
    for (const file of snapshot.files) h.entries.delete(`${snapshot.origins.find((origin) => origin.id === file.origin)!.root}/${file.path}`);
    const before = new Map(h.entries);
    const result = await archives.preserve(manifest, index, snapshot);
    expect(result.files).toHaveLength(snapshot.files.length);
    expect(h.entries).toEqual(before);
    await expect(archives.verify("/record", f.missionId, index.archive_id, { indexHash: historyDigest("wrong index") })).rejects.toMatchObject({ code: "history_archive_binding_mismatch" });
  });

  it("rejects changed originals and incomplete approved inventories before preservation effects", async () => {
    const { h, snapshot, manifest, archives, index, prefix, damaged } = await fixture();
    await expect(archives.prepare({ ...manifest, source_inventory: manifest.source_inventory.slice(1) }, snapshot)).rejects.toMatchObject({ code: "history_archive_binding_mismatch" });
    h.entries.set(damaged, encode("changed"));
    await expect(archives.preserve(manifest, index, snapshot)).rejects.toMatchObject({ code: "history_archive_source_changed" });
    expect([...h.entries.keys()].some((path) => path.startsWith(prefix))).toBe(false);
  });

  it.each(["missing", "corrupt"])("requires independent read-back of each preserved source: %s", async (kind) => {
    const { h, snapshot, manifest, index, prefix } = await fixture();
    const read = h.storage.files.read;
    const storage = new HistoryStorage({ ...h.storage.files, read: async (location) => {
      const bytes = await read(location);
      if (location.relative.includes("/sources/") && bytes !== undefined) return kind === "missing" ? undefined : encode("corrupt backup");
      return bytes;
    } }, h.storage.repositories);
    await expect(new HistoryArchives(storage).preserve(manifest, index, snapshot)).rejects.toMatchObject({ code: "history_archive_verification_failed" });
    expect([...h.entries.keys()].some((path) => path.startsWith(prefix))).toBe(true);
    expect(h.entries.get(`/record/${snapshot.files[0]!.path}`)).toEqual(snapshot.files[0]!.bytes);
  });

  it("rejects altered manifests, unknown archive entries, and missing source files", async () => {
    const { f, h, snapshot, manifest, archives, index, prefix } = await fixture();
    await archives.preserve(manifest, index, snapshot);
    const manifestPath = [...h.entries].find(([path, bytes]) => path.startsWith(prefix) && decode(bytes) === canonicalJson(manifest))![0];
    const original = h.entries.get(manifestPath)!;
    h.entries.set(manifestPath, encode(decode(original).replace('"format":', '"format":"kepler.mission-history-reset","format":')));
    await expect(archives.verify("/record", f.missionId, index.archive_id)).rejects.toMatchObject({ code: "history_manifest_invalid" });
    h.entries.set(manifestPath, original);
    h.entries.set(`${prefix}unknown`, encode("preserve me"));
    await expect(archives.verify("/record", f.missionId, index.archive_id)).rejects.toMatchObject({ code: "history_archive_verification_failed" });
    h.entries.delete(`${prefix}unknown`);
    const sourcePath = [...h.entries.keys()].find((path) => path.startsWith(prefix) && path.includes("/sources/"))!;
    h.entries.delete(sourcePath);
    await expect(archives.verify("/record", f.missionId, index.archive_id)).rejects.toMatchObject({ code: "history_archive_verification_failed" });
  });

  it("references damaged and incomplete older archives without copying or walking their source trees", async () => {
    const { f, h, snapshot, manifest, archives } = await fixture();
    const older = randomUUID();
    const incomplete = randomUUID();
    const root = `/git/kepler/missions/${f.missionId}/recovery/archives`;
    const bytes = encode("damaged index");
    h.entries.set(`${root}/${older}/index.json`, bytes);
    h.entries.set(`${root}/${older}/sources/private-original`, encode("older source"));
    h.entries.set(`${root}/${incomplete}/partial`, encode("retained partial"));
    const catalog = await archives.catalog("/record", f.missionId);
    expect(catalog.archives).toContainEqual({ archive_id: older, index_content_version: historyDigest(bytes) });
    expect(catalog.archives).toContainEqual({ archive_id: incomplete, index_content_version: null });
    expect(catalog.issues).toHaveLength(2);
    const index = await archives.prepare(manifest, snapshot);
    const preserved = await archives.preserve(manifest, index, snapshot);
    expect(preserved.index.previous_archives).toEqual(catalog.archives);
    expect(preserved.files).toHaveLength(snapshot.files.length);
    expect(h.entries.get(`${root}/${older}/sources/private-original`)).toEqual(encode("older source"));
    expect((await h.storage.snapshot("/record", f.missionId)).files).toEqual(snapshot.files);
  });

  it("retains partial preservation and resumes the exact original index and source copies", async () => {
    const { f, h, snapshot, manifest, archives, index, prefix } = await fixture();
    let writes = 0;
    const interrupted = new HistoryStorage({ ...h.storage.files, write: async (location, bytes, mode) => {
      if (++writes === 3) throw new Error("Interrupted preservation fixture");
      return h.storage.files.write(location, bytes, mode);
    } }, h.storage.repositories);
    await expect(new HistoryArchives(interrupted).preserve(manifest, index, snapshot)).rejects.toThrow("Interrupted preservation fixture");
    const partial = new Map([...h.entries].filter(([path]) => path.startsWith(prefix)));
    expect(partial.size).toBeGreaterThan(0);
    const result = await archives.preserve(manifest, index, snapshot);
    expect(result.index).toEqual(index);
    for (const [path, bytes] of partial) expect(h.entries.get(path)).toEqual(bytes);
    expect((await h.access.read("/record", f.missionId)).historyVersion).toBe(f.control.id);
  });

  it("captures independent caller metadata and source bytes before storage awaits", async () => {
    const { h, snapshot, manifest, archives, index } = await fixture();
    const original = new Uint8Array(snapshot.files[0]!.bytes);
    const expected = historyDigest(canonicalJson(index));
    const reason = manifest.reason;
    const pending = archives.preserve(manifest, index, snapshot);
    (manifest as { reason: string }).reason = "caller changed the reason";
    (index as { manifest_hash: string }).manifest_hash = historyDigest("caller changed the index");
    snapshot.files[0]!.bytes.fill(0);
    const result = await pending;
    expect(result.archive_inventory_hash).toBe(expected);
    expect(result.files[0]!.bytes).toEqual(original);
    expect(result.manifest).toMatchObject({ format: "kepler.mission-history-reset", reason });
  });

  it("rejects invalid identities, a startup-only manifest, and an existing different index", async () => {
    const { f, h, snapshot, manifest, archives, index, prefix } = await fixture();
    await expect(archives.catalog("/record", "short")).rejects.toMatchObject({ code: "history_archive_scope_invalid" });
    await expect(archives.verify("/record", f.missionId, "short")).rejects.toMatchObject({ code: "history_archive_scope_invalid" });
    await expect(archives.prepare(f.manifest, snapshot)).rejects.toMatchObject({ code: "history_archive_manifest_invalid" });
    h.entries.set(`${prefix}index.json`, encode(`${canonicalJson(index)}\n`));
    await expect(archives.preserve(manifest, index, snapshot)).rejects.toMatchObject({ code: "history_archive_binding_mismatch" });
  });

  it("inventories draft bodies, partial preparation bytes and completed local receipts without recursing into archives", async () => {
    const { f, h } = await fixture();
    const base = `kepler/missions/${f.missionId}/recovery`;
    const privateFiles = [`${base}/drafts/${randomUUID()}/candidate.bin`, `${base}/completed/operation.json`, `${base}/pending/.operation.partial`];
    for (const path of privateFiles) h.entries.set(`/git/${path}`, encode("private recovery material"));
    h.entries.set(`/git/${base}/archives/${randomUUID()}/source.bin`, encode("older archive"));
    const snapshot = await h.storage.snapshot("/record", f.missionId);
    for (const path of privateFiles) expect(snapshot.files.some((file) => file.path === path)).toBe(true);
    expect(snapshot.files.some((file) => file.path.includes("/archives/"))).toBe(false);
  });
});
