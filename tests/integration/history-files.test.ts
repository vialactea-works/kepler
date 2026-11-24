import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryError, historyDigest } from "../../packages/cli/src/history/control.js";
import { createNodeHistoryFiles } from "../../packages/cli/src/history/files-runtime.js";
import { createEventJournal, nodeJournalFileSystem, withVerifiedHistoryDirectory, type VerifiedHistoryDirectory, type JournalFileSystem } from "../../packages/cli/src/history/journal.js";
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

  it.each(["create", "replace"] as const)("rejects a parent swap before %s publication can change an unrelated directory", async (kind) => {
    const path = await root();
    const outside = await root();
    const inside = Path.join(path, "inside");
    const target = Path.join(inside, "output");
    await Fs.mkdir(inside);
    const original = utf8("original selection");
    if (kind === "replace") await createNodeHistoryFiles().write({ root: path, relative: "inside/output" }, original, { kind: "create" });
    if (kind === "replace") await Fs.writeFile(Path.join(outside, "output"), "unrelated original");
    let temporary = "";
    let prepared = false;
    let swapped = false;
    const swap = async () => {
      if (swapped) return;
      await Fs.writeFile(Path.join(outside, Path.basename(temporary)), "unrelated pending bytes");
      await Fs.rename(inside, Path.join(path, "preserved-source"));
      await Fs.symlink(outside, inside, "dir");
      swapped = true;
    };
    const storage: JournalFileSystem = { ...nodeJournalFileSystem,
      inspect: async (value) => {
        const result = await nodeJournalFileSystem.inspect(value);
        if (kind === "create" && value === target && prepared) await swap();
        return result;
      },
      openAppend: async (...args) => {
        temporary = args[0];
        const opened = await nodeJournalFileSystem.openAppend(...args);
        return { ...opened, handle: { ...opened.handle, close: async () => { await opened.handle.close(); prepared = true; } } };
      },
      openRead: async (value, selectedRoot) => {
        const opened = await nodeJournalFileSystem.openRead(value, selectedRoot);
        return { ...opened, close: async () => { await opened.close(); if (kind === "replace" && value === target && prepared) await swap(); } };
      },
    };
    await expect(createNodeHistoryFiles(storage).write({ root: path, relative: "inside/output" }, utf8("new selection"), kind === "create" ? { kind: "create" } : { kind: "replace", expected: historyDigest(original) })).rejects.toBeDefined();
    expect(swapped).toBe(true);
    if (kind === "replace") expect(await Fs.readFile(Path.join(outside, "output"), "utf8")).toBe("unrelated original");
    else await expect(Fs.lstat(Path.join(outside, "output"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await Fs.readFile(Path.join(outside, Path.basename(temporary)), "utf8")).toBe("unrelated pending bytes");
  });

  it("rejects a parent swap before source retirement can delete an unrelated file", async () => {
    const path = await root();
    const outside = await root();
    const location = { root: path, relative: "inside/source" };
    const source = Path.join(path, "inside", "source");
    const bytes = utf8("approved original");
    await createNodeHistoryFiles().write(location, bytes, { kind: "create" });
    await Fs.writeFile(Path.join(outside, "source"), "unrelated original");
    const storage: JournalFileSystem = { ...nodeJournalFileSystem, openRead: async (value, selectedRoot) => {
      const opened = await nodeJournalFileSystem.openRead(value, selectedRoot);
      return { ...opened, close: async () => {
        await opened.close();
        if (value === source) {
          await Fs.rename(Path.join(path, "inside"), Path.join(path, "preserved-source"));
          await Fs.symlink(outside, Path.join(path, "inside"), "dir");
        }
      } };
    } };
    await expect(createNodeHistoryFiles(storage).remove(location, historyDigest(bytes))).rejects.toBeDefined();
    expect(await Fs.readFile(Path.join(outside, "source"), "utf8")).toBe("unrelated original");
    expect(await Fs.readFile(Path.join(path, "preserved-source", "source"))).toEqual(Buffer.from(bytes));
  });

  it.each([undefined, null, 0, ""])("does not report a failed source read as a completed retirement: %s", async (failure) => {
    const path = await root();
    const location = { root: path, relative: "legacy/source" };
    const original = utf8("original bytes");
    await createNodeHistoryFiles().write(location, original, { kind: "create" });
    const storage: JournalFileSystem = { ...nodeJournalFileSystem, openRead: async () => { throw failure; } };
    const files = createNodeHistoryFiles(storage);
    await expect(files.remove(location, historyDigest(original))).rejects.toMatchObject({ code: "history_storage_failure", details: { message: String(failure) } });
    await expect(files.write(location, utf8("replacement"), { kind: "replace", expected: historyDigest(original) })).rejects.toMatchObject({ code: "history_storage_failure", details: { message: String(failure) } });
    expect(await Fs.readFile(Path.join(path, location.relative))).toEqual(Buffer.from(original));
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

  it("bounds verified directory capabilities to safe entry names and their callback lifetime", async () => {
    const path = await root();
    let retained: VerifiedHistoryDirectory | undefined;
    expect(await withVerifiedHistoryDirectory(path, path, async (directory) => {
      retained = directory;
      for (const name of ["", ".", "..", "../escape", "child/escape", "child\\escape", "\0"]) expect(() => directory.entry(name)).toThrow();
      await directory.verify();
      await directory.sync();
      return "verified";
    })).toBe("verified");
    expect(() => retained!.entry("late")).toThrow("open verified directory");
    await expect(retained!.verify()).rejects.toThrow("closed");
    await expect(withVerifiedHistoryDirectory(path, path, async () => { throw new Error("Caller failure"); })).rejects.toThrow("Caller failure");
    expect(await createNodeHistoryFiles().list({ root: path, relative: "absent" })).toEqual([]);
  });

  it("refuses a multiply linked private output before changing an outside file's bytes or mode", async () => {
    const path = await root();
    const outside = await root();
    const original = Path.join(outside, "original");
    const borrowed = Path.join(path, "borrowed");
    await Fs.writeFile(original, "unchanged original", { mode: 0o640 });
    const mode = (await Fs.stat(original)).mode;
    await Fs.link(original, borrowed);
    await expect(nodeJournalFileSystem.openAppend(borrowed, path, 0o600)).rejects.toThrow("multiply linked");
    expect(await Fs.readFile(original, "utf8")).toBe("unchanged original");
    expect((await Fs.stat(original)).mode).toBe(mode);
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
