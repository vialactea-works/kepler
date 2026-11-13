import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryError, historyDigest } from "../../packages/cli/src/history/control.js";
import { createNodeHistoryFiles } from "../../packages/cli/src/history/files-runtime.js";
import { createEventJournal, nodeJournalFileSystem, type JournalFileSystem } from "../../packages/cli/src/history/journal.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { historyGenerationFixture, historyTestBytes } from "../support/history-generation.js";

const roots: string[] = [];
const root = async (): Promise<string> => {
  const path = await Fs.realpath(await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-history-files-")));
  roots.push(path);
  return path;
};
const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
const errorFrom = async (operation: Promise<unknown>): Promise<HistoryError> => {
  try { await operation; } catch (error) {
    expect(error).toBeInstanceOf(HistoryError);
    return error as HistoryError;
  }
  throw new Error("Expected a history storage failure");
};

afterEach(async () => {
  for (const path of roots.splice(0)) {
    await Fs.rm(path, { recursive: true, force: true });
    await expect(Fs.lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

describe("durable history filesystem", () => {
  it("preserves raw bytes in private files and confirms immutable identical retries", async () => {
    const path = await root();
    const files = createNodeHistoryFiles();
    const location = { root: path, relative: "recovery/archives/raw.bin" };
    const bytes = new Uint8Array([0, 255, 13, 10, 128]);
    expect(await files.write(location, bytes, { kind: "create" })).toMatchObject({ status: "created", content_version: historyDigest(bytes) });
    expect(await files.read(location)).toEqual(bytes);
    expect((await Fs.stat(Path.join(path, location.relative))).mode & 0o777).toBe(0o600);
    expect((await Fs.stat(Path.join(path, "recovery/archives"))).mode & 0o777).toBe(0o700);
    expect(await files.write(location, bytes, { kind: "create" })).toMatchObject({ status: "existing" });
    expect((await errorFrom(files.write(location, utf8("different"), { kind: "create" }))).code).toBe("history_file_conflict");
    expect(await files.read(location)).toEqual(bytes);
  });

  it("replaces activation only against the exact observed content version", async () => {
    const path = await root();
    const files = createNodeHistoryFiles();
    const location = { root: path, relative: "history/control/active.json" };
    const first = utf8('{"selection":"old"}\n');
    const second = utf8('{"selection":"new"}\n');
    await files.write(location, first, { kind: "create" });
    expect((await errorFrom(files.write(location, second, { kind: "replace", expected: historyDigest("wrong") }))).code).toBe("history_file_changed");
    expect(await files.read(location)).toEqual(first);
    expect(await files.write(location, second, { kind: "replace", expected: historyDigest(first) })).toMatchObject({ status: "replaced" });
    expect(await files.read(location)).toEqual(second);
    expect(await files.write(location, second, { kind: "replace", expected: historyDigest(first) })).toMatchObject({ status: "existing" });
  });

  it("retains partial private output and finishes only the original byte sequence", async () => {
    const path = await root();
    let calls = 0;
    const storage: JournalFileSystem = { ...nodeJournalFileSystem, openAppend: async (...args) => {
      const opened = await nodeJournalFileSystem.openAppend(...args);
      return { ...opened, handle: { ...opened.handle, write: async (bytes, offset, length) => {
        calls += 1;
        if (calls === 2) throw new Error("Injected full disk");
        return opened.handle.write(bytes, offset, calls === 1 ? Math.min(3, length) : length);
      } } };
    } };
    const files = createNodeHistoryFiles(storage);
    const location = { root: path, relative: "recovery/pending/envelope.json" };
    const bytes = utf8("complete retained pending envelope\n");
    const failure = await errorFrom(files.write(location, bytes, { kind: "create" }));
    expect(failure.code).toBe("history_storage_failure");
    const temporary = String(failure.details.temporary_path);
    expect(await Fs.readFile(temporary)).toEqual(Buffer.from(bytes.subarray(0, 3)));
    expect(await files.read(location)).toBeUndefined();
    await files.write(location, bytes, { kind: "create" });
    expect(await files.read(location)).toEqual(bytes);
    await expect(Fs.lstat(temporary)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves contradictory pending bytes instead of truncating or replacing them", async () => {
    const path = await root();
    let calls = 0;
    const storage: JournalFileSystem = { ...nodeJournalFileSystem, openAppend: async (...args) => {
      const opened = await nodeJournalFileSystem.openAppend(...args);
      return { ...opened, handle: { ...opened.handle, write: async (bytes, offset, length) => {
        calls += 1;
        if (calls === 2) throw new Error("Injected write interruption");
        return opened.handle.write(bytes, offset, calls === 1 ? 1 : length);
      } } };
    } };
    const files = createNodeHistoryFiles(storage);
    const location = { root: path, relative: "recovery/pending/output" };
    const failure = await errorFrom(files.write(location, utf8("original output"), { kind: "create" }));
    const temporary = String(failure.details.temporary_path);
    await Fs.writeFile(temporary, "contradictory retained bytes");
    expect((await errorFrom(files.write(location, utf8("original output"), { kind: "create" }))).code).toBe("history_temporary_conflict");
    expect(await Fs.readFile(temporary, "utf8")).toBe("contradictory retained bytes");
    expect(await files.read(location)).toBeUndefined();
  });

  it("rejects symbolic-link ancestors and leaves outside material unchanged", async () => {
    const path = await root();
    const outside = await root();
    await Fs.writeFile(Path.join(outside, "secret"), "outside bytes");
    await Fs.symlink(outside, Path.join(path, "redirect"), "dir");
    await Fs.symlink(Path.join(outside, "secret"), Path.join(path, "leaf"));
    const files = createNodeHistoryFiles();
    for (const relative of ["redirect/secret", "leaf", "../escape"]) {
      await expect(files.read({ root: path, relative })).rejects.toBeInstanceOf(HistoryError);
      await expect(files.write({ root: path, relative }, utf8("overwrite"), { kind: "create" })).rejects.toBeInstanceOf(HistoryError);
    }
    await expect(files.list({ root: path, relative: "redirect" })).rejects.toBeInstanceOf(HistoryError);
    expect(await Fs.readFile(Path.join(outside, "secret"), "utf8")).toBe("outside bytes");
  });

  it("retires only the exact file and removes only an empty directory", async () => {
    const path = await root();
    const files = createNodeHistoryFiles();
    const location = { root: path, relative: "legacy/phase/source.jsonl" };
    const original = utf8("preserved source");
    await files.write(location, original, { kind: "create" });
    expect(await files.removeEmptyDirectory({ root: path, relative: "legacy/phase" })).toBe("not-empty");
    expect((await errorFrom(files.remove(location, historyDigest("wrong")))).code).toBe("history_source_changed");
    expect(await files.read(location)).toEqual(original);
    expect(await files.remove(location, historyDigest(original))).toBe("removed");
    expect(await files.remove(location, historyDigest(original))).toBe("missing");
    expect(await files.removeEmptyDirectory({ root: path, relative: "legacy/phase" })).toBe("removed");
    expect(await files.list({ root: path, relative: "legacy" })).toEqual([]);
  });

  it("routes phase, control and guard journals without recreating a direct phase directory", async () => {
    const path = await root();
    const f = historyGenerationFixture();
    const phase = createEventJournal({ recordHome: path, missionId: f.missionId, generationId: f.generationId, phase: "construction", journalId: f.journalId });
    await phase.append(f.creation);
    expect(await Fs.readFile(phase.path)).toEqual(Buffer.from(historyTestBytes([f.creation])));
    const control = createEventJournal({ recordHome: path, missionId: f.missionId, phase: "mission-recovery", journalId: f.control.journal_id, kind: "control" });
    await control.append(f.control);
    const guard = createEventJournal({ recordHome: path, missionId: f.missionId, phase: "construction", journalId: f.guard.journal_id, kind: "guard" });
    await guard.append(f.guard);
    await expect(Fs.lstat(Path.join(path, ".kepler", "missions", f.missionId, "history", "construction"))).rejects.toMatchObject({ code: "ENOENT" });
    const legacyDiscovery = collectHistory(f.missionId, [f.legacy, { sourceId: "legacy/control", missionId: f.missionId, phase: "control", journalId: f.guard.journal_id, bytes: historyTestBytes([f.guard]) }], { completeness: "complete" });
    expect(legacyDiscovery.issues).toContainEqual(expect.objectContaining({ code: "source-identity-mismatch" }));
  });
});
