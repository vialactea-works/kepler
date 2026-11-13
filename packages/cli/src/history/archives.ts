import { canonicalJson } from "./journal.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex, type HistoryArchiveIndex, type HistoryPreviousArchive } from "./archive-index.js";
import { HistoryError, historyDigest, historyManifestDigest, historyManifestMission, parseHistoryManifest, type HistoryDigest, type HistoryInitializationManifest, type HistoryResetManifest } from "./control.js";
import type { HistoryLocation, HistoryRepositoryContext, HistorySnapshot } from "./files.js";
import { HistoryStorage, historyInventory } from "./storage.js";

export interface ArchivedHistoryFile {
  readonly source_id: string;
  readonly origin: string;
  readonly path: string;
  readonly reference: string;
  readonly bytes: Uint8Array;
}

export interface PreservedHistoryArchive {
  readonly index: HistoryArchiveIndex;
  readonly archive_inventory_hash: HistoryDigest;
  readonly index_content_version: HistoryDigest;
  readonly manifest: HistoryResetManifest | HistoryInitializationManifest;
  readonly files: readonly ArchivedHistoryFile[];
}

export interface HistoryArchiveCatalog {
  readonly archives: readonly HistoryPreviousArchive[];
  readonly issues: readonly { readonly reference: string; readonly message: string }[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const base = (missionId: string): string => `kepler/missions/${missionId}/recovery/archives`;
const sourceName = (sourceId: string): string => `${historyDigest(sourceId).slice(7)}.bin`;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const equal = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, position) => byte === right[position]);
const location = (context: HistoryRepositoryContext, missionId: string, archiveId: string, relative: string): HistoryLocation => ({ root: context.commonDirectory, relative: `${base(missionId)}/${archiveId}/${relative}` });
const validateIdentity = (missionId: string, archiveId?: string): void => {
  if (!uuid.test(missionId) || archiveId !== undefined && !uuid.test(archiveId)) throw new HistoryError("history_archive_scope_invalid", "Archive access requires full lowercase mission and archive UUIDv4 values.");
};
const originalManifest = (input: unknown): HistoryResetManifest | HistoryInitializationManifest => {
  const manifest = parseHistoryManifest(typeof input === "string" ? input : canonicalJson(input));
  if (manifest.format === "kepler.mission-history-rebuild" || manifest.archive_id === null) throw new HistoryError("history_archive_manifest_invalid", "Preservation requires an approved reset or migration manifest with an archive identity.");
  return manifest;
};
const bindIndex = (index: HistoryArchiveIndex, manifest: HistoryResetManifest | HistoryInitializationManifest): void => {
  if (index.mission_id !== historyManifestMission(manifest) || index.archive_id !== manifest.archive_id || index.manifest_hash !== historyManifestDigest(manifest) || canonicalJson(index.source_inventory) !== canonicalJson(manifest.source_inventory)) throw new HistoryError("history_archive_binding_mismatch", "Archive identity, manifest digest, and complete source inventory must match.");
};

export class HistoryArchives {
  public constructor(private readonly storage: HistoryStorage) {}

  public async catalog(recordHome: string, missionId: string): Promise<HistoryArchiveCatalog> {
    validateIdentity(missionId);
    const context = await this.storage.context(recordHome);
    const archives: HistoryPreviousArchive[] = [];
    const issues: HistoryArchiveCatalog["issues"][number][] = [];
    for (const entry of await this.storage.files.list({ root: context.commonDirectory, relative: base(missionId) })) {
      const reference = `${base(missionId)}/${entry.name}`;
      if (entry.kind !== "directory" || !uuid.test(entry.name)) {
        issues.push({ reference, message: "An unrecognized archive entry remains preserved and has no verified archive identity." });
        continue;
      }
      try {
        const bytes = await this.storage.files.read(location(context, missionId, entry.name, "index.json"));
        archives.push({ archive_id: entry.name, index_content_version: bytes === undefined ? null : historyDigest(bytes) });
        if (bytes === undefined) issues.push({ reference, message: "The archive index is missing." });
        else {
          try { parseHistoryArchiveIndex(decoder.decode(bytes)); } catch (error) { issues.push({ reference, message: message(error) }); }
        }
      } catch (error) {
        archives.push({ archive_id: entry.name, index_content_version: null });
        issues.push({ reference, message: message(error) });
      }
    }
    return { archives: archives.sort((left, right) => compare(left.archive_id, right.archive_id)), issues: issues.sort((left, right) => compare(left.reference, right.reference)) };
  }

  public async prepare(manifestInput: unknown, snapshot: HistorySnapshot): Promise<HistoryArchiveIndex> {
    const manifest = originalManifest(manifestInput);
    if (historyManifestMission(manifest) !== snapshot.missionId || canonicalJson(manifest.source_inventory) !== canonicalJson(historyInventory(snapshot))) throw new HistoryError("history_archive_binding_mismatch", "The proposed archive must inventory every captured input byte.");
    const missionId = snapshot.missionId;
    const inventory = manifest.source_inventory.map((entry) => ({ ...entry }));
    const catalog = await this.catalog(snapshot.recordHome, missionId);
    return parseHistoryArchiveIndex({ format: "kepler.mission-history-archive", version: 1, mission_id: missionId, archive_id: manifest.archive_id, manifest_hash: historyManifestDigest(manifest), source_inventory: inventory, previous_archives: catalog.archives.filter((archive) => archive.archive_id !== manifest.archive_id) });
  }

  public async preserve(manifestInput: unknown, indexInput: unknown, captured: HistorySnapshot): Promise<PreservedHistoryArchive> {
    const manifest = originalManifest(manifestInput);
    const index = parseHistoryArchiveIndex(canonicalJson(indexInput));
    bindIndex(index, manifest);
    const snapshot: HistorySnapshot = { ...captured, origins: captured.origins.map((origin) => ({ ...origin })), files: captured.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })), unavailable: captured.unavailable.map((source) => ({ ...source })) };
    if (snapshot.missionId !== index.mission_id || canonicalJson(historyInventory(snapshot)) !== canonicalJson(index.source_inventory)) throw new HistoryError("history_archive_binding_mismatch", "The preservation snapshot does not match the approved complete inventory.");
    const indexBytes = encoder.encode(canonicalJson(index));
    const context = await this.storage.context(snapshot.recordHome);
    if (context.recordHome !== snapshot.recordHome || context.commonDirectory !== snapshot.commonDirectory) throw new HistoryError("history_archive_context_changed", "The physical record home or Git common directory changed before preservation.");
    const existing = await this.storage.files.read(location(context, index.mission_id, index.archive_id, "index.json"));
    if (existing !== undefined) {
      if (!equal(existing, indexBytes)) throw new HistoryError("history_archive_binding_mismatch", "The archive identity already contains different retained index bytes.");
      return this.verify(snapshot.recordHome, index.mission_id, index.archive_id, { manifestHash: index.manifest_hash, indexHash: historyArchiveIndexDigest(index) });
    }
    for (const file of snapshot.files) {
      const origin = snapshot.origins.find((candidate) => candidate.id === file.origin);
      if (!origin) throw new HistoryError("history_archive_binding_mismatch", "A captured source has no verified physical origin.", { source_id: file.sourceId });
      const current = await this.storage.files.read({ root: origin.root, relative: file.path });
      if (!current || !equal(current, file.bytes)) throw new HistoryError("history_archive_source_changed", "An original input changed or disappeared before preservation.", { source_id: file.sourceId, path: file.path });
    }
    const manifestBytes = encoder.encode(canonicalJson(manifest));
    await this.storage.files.write(location(context, index.mission_id, index.archive_id, "manifest.json"), new Uint8Array(manifestBytes), { kind: "create" });
    for (const file of snapshot.files) await this.storage.files.write(location(context, index.mission_id, index.archive_id, `sources/${sourceName(file.sourceId)}`), new Uint8Array(file.bytes), { kind: "create" });
    await this.storage.files.write(location(context, index.mission_id, index.archive_id, "index.json"), new Uint8Array(indexBytes), { kind: "create" });
    const verified = await this.verify(snapshot.recordHome, index.mission_id, index.archive_id, { manifestHash: index.manifest_hash, indexHash: historyArchiveIndexDigest(index) });
    if (verified.index_content_version !== historyDigest(indexBytes)) throw new HistoryError("history_archive_verification_failed", "Archive index bytes differ from the exact retained output.");
    return verified;
  }

  public async verify(recordHome: string, missionId: string, archiveId: string, expected: { readonly manifestHash?: HistoryDigest; readonly indexHash?: HistoryDigest } = {}): Promise<PreservedHistoryArchive> {
    validateIdentity(missionId, archiveId);
    const expectation = { ...expected };
    const context = await this.storage.context(recordHome);
    const raw = await this.storage.files.read(location(context, missionId, archiveId, "index.json"));
    if (raw === undefined) throw new HistoryError("history_archive_missing", "The exact archive index is unavailable.", { archive_id: archiveId });
    const rawIndex = new Uint8Array(raw);
    const index = parseHistoryArchiveIndex(decoder.decode(rawIndex));
    const indexHash = historyArchiveIndexDigest(index);
    if (index.mission_id !== missionId || index.archive_id !== archiveId || expectation.indexHash !== undefined && expectation.indexHash !== indexHash || expectation.manifestHash !== undefined && expectation.manifestHash !== index.manifest_hash) throw new HistoryError("history_archive_binding_mismatch", "The stored archive does not match its requested identity and digests.");
    const rawManifest = await this.storage.files.read(location(context, missionId, archiveId, "manifest.json"));
    if (rawManifest === undefined) throw new HistoryError("history_archive_verification_failed", "The approved preservation manifest is missing.");
    const manifest = originalManifest(decoder.decode(rawManifest));
    bindIndex(index, manifest);
    const names = index.source_inventory.map((entry) => sourceName(entry.source_id));
    if (new Set(names).size !== names.length) throw new HistoryError("history_archive_binding_mismatch", "Distinct sources cannot share a preservation filename.");
    const rootEntries = await this.storage.files.list({ root: context.commonDirectory, relative: `${base(missionId)}/${archiveId}` });
    if (rootEntries.some((entry) => entry.name === "sources" ? entry.kind !== "directory" : !["index.json", "manifest.json"].includes(entry.name) || entry.kind !== "file")) throw new HistoryError("history_archive_verification_failed", "Unrecognized archive entries remain preserved and prevent a complete verification.");
    const entries = await this.storage.files.list(location(context, missionId, archiveId, "sources"));
    if (entries.length !== names.length || entries.some((entry) => entry.kind !== "file" || !names.includes(entry.name))) throw new HistoryError("history_archive_verification_failed", "The archive source directory does not match its complete inventory.");
    const files: ArchivedHistoryFile[] = [];
    for (const entry of index.source_inventory) {
      const bytes = await this.storage.files.read(location(context, missionId, archiveId, `sources/${sourceName(entry.source_id)}`));
      if (bytes === undefined || bytes.length !== entry.byte_length || historyDigest(bytes) !== entry.content_version) throw new HistoryError("history_archive_verification_failed", "Preserved source bytes do not match their approved length and digest.", { source_id: entry.source_id, path: entry.path });
      files.push({ source_id: entry.source_id, origin: entry.origin, path: entry.path, reference: `local-archive:${archiveId}/source/${sourceName(entry.source_id)}`, bytes: new Uint8Array(bytes) });
    }
    return { index, archive_inventory_hash: indexHash, index_content_version: historyDigest(rawIndex), manifest, files };
  }
}
