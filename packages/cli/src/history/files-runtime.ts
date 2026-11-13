import { constants as FsConstants } from "node:fs";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { HistoryError, historyDigest, safeHistoryRelativePath } from "./control.js";
import type { HistoryDirectoryEntry, HistoryFiles, HistoryFileWrite, HistoryLocation } from "./files.js";
import { nodeJournalFileSystem, type JournalFileSystem, type JournalReadHandle } from "./journal.js";

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);
const missing = (error: unknown): boolean => error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const readHandle = async (handle: JournalReadHandle): Promise<Uint8Array> => {
  const size = await handle.size();
  const bytes = new Uint8Array(size);
  let position = 0;
  while (position < bytes.length) {
    const read = await handle.read(bytes, position, bytes.length - position, position);
    if (read <= 0 || read > bytes.length - position) throw new HistoryError("history_file_changed", "A history input changed during reading.");
    position += read;
  }
  if (await handle.size() !== size) throw new HistoryError("history_file_changed", "A history input changed its length during reading.");
  await handle.verify?.();
  return bytes;
};

export const createNodeHistoryFiles = (journals: JournalFileSystem = nodeJournalFileSystem): HistoryFiles => {
  const resolve = async (location: HistoryLocation): Promise<string> => {
    if (!location || typeof location.root !== "string" || typeof location.relative !== "string" || !Path.isAbsolute(location.root) || !safeHistoryRelativePath(location.relative) || await journals.realpath(location.root) !== location.root || await journals.inspect(location.root) !== "directory") throw new HistoryError("history_path_unsafe", "History storage requires a canonical root and an exact relative path.");
    return Path.join(location.root, ...location.relative.split("/"));
  };
  const ancestors = async (location: HistoryLocation, create: boolean): Promise<boolean> => {
    await resolve(location);
    let current = location.root;
    for (const part of location.relative.split("/").slice(0, -1)) {
      current = Path.join(current, part);
      let kind = await journals.inspect(current);
      if (kind === "missing" && create) {
        try {
          await journals.mkdir(current, location.root);
          const directory = await Fs.open(current, FsConstants.O_RDONLY | FsConstants.O_DIRECTORY | FsConstants.O_NOFOLLOW);
          try { await directory.chmod(0o700); await directory.sync(); } finally { await directory.close(); }
        } catch (error) {
          if (!(error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
        }
        kind = await journals.inspect(current);
      }
      if (kind === "missing") return false;
      if (kind !== "directory" || await journals.realpath(current) !== current) throw new HistoryError("history_path_unsafe", "A history storage ancestor is not a regular canonical directory.", { path: current });
    }
    return true;
  };
  const read = async (location: HistoryLocation): Promise<Uint8Array | undefined> => {
    const path = await resolve(location);
    if (!await ancestors(location, false)) return undefined;
    const kind = await journals.inspect(path);
    if (kind === "missing") return undefined;
    if (kind !== "file") throw new HistoryError("history_path_unsafe", "A history input must be a regular file, not a symbolic link or directory.", { path });
    const handle = await journals.openRead(path, location.root);
    try { return await readHandle(handle); } finally { await handle.close(); }
  };
  const list = async (location: HistoryLocation): Promise<readonly HistoryDirectoryEntry[]> => {
    const path = await resolve(location);
    if (!await ancestors(location, false)) return [];
    const kind = await journals.inspect(path);
    if (kind === "missing") return [];
    if (kind !== "directory" || await journals.realpath(path) !== path) throw new HistoryError("history_path_unsafe", "A history directory is not a canonical directory.", { path });
    const handle = await Fs.open(path, FsConstants.O_RDONLY | FsConstants.O_DIRECTORY | FsConstants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      const entries = await Fs.readdir(process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : path, { withFileTypes: true });
      const after = await Fs.lstat(path);
      if (!after.isDirectory() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || await journals.realpath(path) !== path) throw new HistoryError("history_file_changed", "A history directory changed during enumeration.", { path });
      return entries.map((entry): HistoryDirectoryEntry => ({ name: entry.name, kind: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    } finally { await handle.close(); }
  };
  const removeTemporary = async (root: string, path: string, bytes: Uint8Array): Promise<void> => {
    const relative = Path.relative(root, path).split(Path.sep).join("/");
    const existing = await read({ root, relative });
    if (!existing) return;
    if (!sameBytes(existing, bytes)) throw new HistoryError("history_temporary_conflict", "An existing pending output differs from the exact retained output.", { temporary_path: path });
    await Fs.unlink(path);
    await journals.syncDirectory(Path.dirname(path), root);
  };
  return {
    read,
    list,
    write: async (location, bytes, mode) => {
      if (!(bytes instanceof Uint8Array) || !mode || !["create", "replace"].includes(mode.kind) || (mode.kind === "replace" && mode.expected !== null && !/^sha256:[0-9a-f]{64}$/.test(mode.expected))) throw new HistoryError("history_storage_input_invalid", "History output requires bytes and an exact create or compare-and-replace mode.");
      const path = await resolve(location);
      await ancestors(location, true);
      const claim = await journals.acquireWriterLock(path, location.root);
      const temporary = Path.join(Path.dirname(path), `.${Path.basename(path)}.${historyDigest(bytes).slice(7)}.pending`);
      let result: HistoryFileWrite | undefined;
      let failure: unknown;
      try {
        const previous = await read(location);
        if (previous && sameBytes(previous, bytes)) {
          await removeTemporary(location.root, temporary, bytes);
          result = { status: "existing", content_version: historyDigest(bytes), byte_length: bytes.length };
        } else {
          if (mode.kind === "create" && previous !== undefined) throw new HistoryError("history_file_conflict", "An immutable history output already exists with different bytes.", { path });
          if (mode.kind === "replace" && (previous ? historyDigest(previous) : null) !== mode.expected) throw new HistoryError("history_file_changed", "The activation input changed before atomic replacement.", { path });
          const pending = await journals.openAppend(temporary, location.root, 0o600);
          try {
            const retained = await readHandle(pending.handle);
            if (retained.length > bytes.length || !retained.every((byte, index) => bytes[index] === byte)) throw new HistoryError("history_temporary_conflict", "Retained partial output is not a prefix of the exact pending output.", { temporary_path: temporary });
            let written = retained.length;
            while (written < bytes.length) {
              const count = await pending.handle.write(bytes, written, bytes.length - written);
              if (count <= 0 || count > bytes.length - written) throw new HistoryError("history_storage_failure", "History output did not make valid write progress.");
              written += count;
            }
            await pending.handle.sync();
            if (!sameBytes(await readHandle(pending.handle), bytes)) throw new HistoryError("history_file_changed", "The retained history output changed before publication.");
          } finally { await pending.handle.close(); }
          const current = await read(location);
          if (mode.kind === "replace" && (current ? historyDigest(current) : null) !== mode.expected) throw new HistoryError("history_file_changed", "The activation input changed while its replacement was prepared.", { path });
          if (mode.kind === "create") {
            try { await Fs.link(temporary, path); } catch (error) {
              if (!(error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
              const existing = await read(location);
              if (!existing || !sameBytes(existing, bytes)) throw new HistoryError("history_file_conflict", "A conflicting output appeared before publication.", { path });
            }
            await journals.syncDirectory(Path.dirname(path), location.root);
            await removeTemporary(location.root, temporary, bytes);
          } else {
            await Fs.rename(temporary, path);
            await journals.syncDirectory(Path.dirname(path), location.root);
          }
          const published = await read(location);
          if (!published || !sameBytes(published, bytes)) throw new HistoryError("history_file_changed", "The durable history output could not be confirmed.", { path });
          result = { status: previous === undefined ? "created" : "replaced", content_version: historyDigest(bytes), byte_length: bytes.length };
        }
      } catch (error) { failure = error; }
      try { await claim.release(); } catch (error) {
        throw new HistoryError("history_storage_release_failed", "History output may be durable, but its writer claim could not be released.", { path, temporary_path: temporary, operation_error: failure ? errorMessage(failure) : null, release_error: errorMessage(error), output_status: result?.status ?? "uncertain" });
      }
      if (failure) {
        if (failure instanceof HistoryError) throw new HistoryError(failure.code, failure.message, { ...failure.details, path, temporary_path: temporary, output_status: result?.status ?? "uncertain" });
        throw new HistoryError("history_storage_failure", "History storage could not complete the requested write.", { path, temporary_path: temporary, message: errorMessage(failure) });
      }
      if (!result) throw new HistoryError("history_storage_failure", "History output has no confirmed result.", { path });
      return result;
    },
    remove: async (location, expected) => {
      const path = await resolve(location);
      if (!await ancestors(location, false)) return "missing";
      const claim = await journals.acquireWriterLock(path, location.root);
      let failure: unknown;
      let result: "removed" | "missing" = "missing";
      try {
        const bytes = await read(location);
        if (bytes !== undefined) {
          if (historyDigest(bytes) !== expected) throw new HistoryError("history_source_changed", "A source changed before its approved retirement.", { path });
          await Fs.unlink(path);
          await journals.syncDirectory(Path.dirname(path), location.root);
          result = "removed";
        }
      } catch (error) { failure = error; }
      try { await claim.release(); } catch (error) {
        throw new HistoryError("history_storage_release_failed", "Source retirement may have occurred, but its writer claim could not be released.", { path, operation_error: failure ? errorMessage(failure) : null, release_error: errorMessage(error), retirement_status: result });
      }
      if (failure) throw failure;
      return result;
    },
    removeEmptyDirectory: async (location) => {
      const path = await resolve(location);
      if (!await ancestors(location, false)) return "missing";
      const kind = await journals.inspect(path);
      if (kind === "missing") return "missing";
      if (kind !== "directory" || await journals.realpath(path) !== path) throw new HistoryError("history_path_unsafe", "Only a canonical empty legacy directory can be retired.", { path });
      try {
        await Fs.rmdir(path);
        await journals.syncDirectory(Path.dirname(path), location.root);
        return "removed";
      } catch (error) {
        if (missing(error)) return "missing";
        if (error !== null && typeof error === "object" && "code" in error && ["ENOTEMPTY", "EEXIST"].includes(String(error.code))) return "not-empty";
        throw error;
      }
    },
  };
};
