import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEventJournal,
  nodeJournalFileSystem,
  scanJournalBytes,
  type JournalFileSystem,
} from "../../packages/cli/src/history/journal.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const directories: string[] = [];
const lockArtifacts: string[] = [];

const createHome = async (): Promise<string> => {
  const home = await mkdtemp(Path.join(Os.tmpdir(), "kepler-journal-"));
  directories.push(home);
  return home;
};

const location = (recordHome: string, journalId = "journal-main") => ({
  recordHome,
  missionId,
  phase: "construction",
  journalId,
});

const event = (id: string, data: Readonly<Record<string, unknown>> = { value: 1 }, journalId = "journal-main") => ({
  id,
  phase: "construction",
  type: "construction.unit-created",
  envelope_version: 1,
  event_version: 1,
  journal_id: journalId,
  recorded_at: "2026-10-18T14:30:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data,
});

interface JournalChildResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

const startJournalChild = (
  home: string,
  record: unknown,
  mode: "append" | "hold" | "crash",
  journalId = "journal-main",
) => {
  const journalModule = JSON.stringify(new URL("../../packages/cli/src/history/journal.ts", import.meta.url).href);
  const source = `
import { createEventJournal, journalPath, nodeJournalFileSystem } from ${journalModule};
const coordinates = { recordHome: process.env.JOURNAL_HOME, missionId: ${JSON.stringify(missionId)}, phase: "construction", journalId: process.env.JOURNAL_ID };
const record = JSON.parse(process.env.JOURNAL_EVENT);
const mode = ${JSON.stringify(mode)};
if (mode === "crash") {
  const claim = await nodeJournalFileSystem.acquireWriterLock(journalPath(coordinates), coordinates.recordHome);
  process.stdout.write(JSON.stringify({ status: "LOCK_HELD", artifactPath: claim.artifactPath }) + "\\n");
} else {
  const storage = mode === "hold" ? {
    ...nodeJournalFileSystem,
    openAppend: async (path, root) => {
      const opened = await nodeJournalFileSystem.openAppend(path, root);
      return {
        created: opened.created,
        handle: {
          ...opened.handle,
          sync: async () => {
            process.stdout.write("SYNC_WAIT\\n");
            await new Promise((resolve) => process.stdin.once("data", resolve));
            await opened.handle.sync();
          },
        },
      };
    },
  } : nodeJournalFileSystem;
  try {
    process.stdout.write(JSON.stringify(await createEventJournal(coordinates, storage).append(record)) + "\\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ code: error?.code ?? "unknown" }) + "\\n");
  }
}
`;
  const child = spawn(process.execPath, ["-e", source], {
    env: {
      ...process.env,
      JOURNAL_HOME: home,
      JOURNAL_ID: journalId,
      JOURNAL_EVENT: JSON.stringify(record),
    },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const completion = new Promise<JournalChildResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
  });
  const waitForOutput = (marker: string): Promise<void> => new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("close", onClose);
    };
    const onData = (): void => {
      if (stdout.includes(marker)) {
        cleanup();
        resolve();
      }
    };
    const onClose = (exitCode: number | null): void => {
      cleanup();
      reject(new Error(`Journal child exited before emitting ${marker}: ${exitCode}; ${stderr}`));
    };
    const timeout = setTimeout(() => {
      cleanup();
      child.kill();
      reject(new Error(`Journal child did not emit ${marker}`));
    }, 10_000);
    if (stdout.includes(marker)) {
      cleanup();
      resolve();
      return;
    }
    child.stdout.on("data", onData);
    child.once("close", onClose);
  });
  return { child, completion, waitForOutput };
};

const childValue = (result: JournalChildResult): unknown => {
  const lastLine = result.stdout.trim().split(/\r?\n/).at(-1);
  return lastLine ? JSON.parse(lastLine) as unknown : undefined;
};

afterEach(async () => {
  await Promise.all([
    ...directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    ...lockArtifacts.splice(0).map((artifact) => rm(artifact, { recursive: true, force: true })),
  ]);
});

describe("durable event journal", () => {
  it("writes a complete record and syncs the file and directory before success", async () => {
    const home = await createHome();
    const operations: string[] = [];
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      openAppend: async (path, root) => {
        const opened = await nodeJournalFileSystem.openAppend(path, root);
        return {
          created: opened.created,
          handle: {
            size: () => opened.handle.size(),
            read: (bytes, offset, length, position) => opened.handle.read(bytes, offset, length, position),
            write: async (bytes, offset, length) => {
              operations.push("write");
              return opened.handle.write(bytes, offset, length);
            },
            sync: async () => {
              operations.push("file-sync");
              await opened.handle.sync();
            },
            close: () => opened.handle.close(),
          },
        };
      },
      syncDirectory: async (path, root) => {
        operations.push("directory-sync");
        await nodeJournalFileSystem.syncDirectory(path, root);
      },
    };
    const journal = createEventJournal(location(home), storage);
    const result = await journal.append(event("event-1"));
    const bytes = await readFile(journal.path);
    const scan = scanJournalBytes(bytes);
    expect(result).toEqual({ status: "appended", eventId: "event-1", line: 1 });
    expect(scan.problems).toEqual([]);
    expect(scan.lines).toHaveLength(1);
    expect(scan.lines[0]?.event?.producer).toEqual({ name: "kepler", version: "0.10.3" });
    expect(bytes.at(-1)).toBe(10);
    expect(operations.indexOf("file-sync")).toBeGreaterThan(operations.indexOf("write"));
    expect(operations.lastIndexOf("directory-sync")).toBeGreaterThan(operations.indexOf("file-sync"));
    expect(journal.path).toBe(Path.join(home, ".kepler", "missions", missionId, "history", "construction", "journal-main.jsonl"));
  });

  it("preserves event identity and bytes on same-write retry and detects changed content under that ID", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    const original = event("event-1", { nested: { b: 2, a: 1 }, value: "same" });
    expect((await journal.append(original)).status).toBe("appended");
    const originalBytes = await readFile(journal.path);
    const reorderedRetry = event("event-1", { value: "same", nested: { a: 1, b: 2 } });
    expect(await journal.append(reorderedRetry)).toEqual({ status: "duplicate", eventId: "event-1", line: 1 });
    expect(await readFile(journal.path)).toEqual(originalBytes);
    await expect(journal.append(event("event-1", { value: "different" }))).rejects.toMatchObject({
      code: "journal-conflict",
    });
    expect(await readFile(journal.path)).toEqual(originalBytes);
  });

  it("completes an interrupted same-write append without rewriting its existing bytes", async () => {
    const home = await createHome();
    let interrupted = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      openAppend: async (path, root) => {
        const opened = await nodeJournalFileSystem.openAppend(path, root);
        if (interrupted) return opened;
        return {
          created: opened.created,
          handle: {
            size: () => opened.handle.size(),
            read: (bytes, offset, length, position) => opened.handle.read(bytes, offset, length, position),
            write: async (bytes, offset, length) => {
              if (!interrupted) {
                interrupted = true;
                await opened.handle.write(bytes, offset, length - 1);
                throw new Error("simulated process interruption");
              }
              return opened.handle.write(bytes, offset, length);
            },
            sync: () => opened.handle.sync(),
            close: () => opened.handle.close(),
          },
        };
      },
    };
    const interruptedJournal = createEventJournal(location(home), storage);
    const original = event("event-retry", { value: "preserved" });
    await expect(interruptedJournal.append(original)).rejects.toMatchObject({
      code: "storage-failure",
    });
    const partialBytes = await readFile(interruptedJournal.path);
    expect(partialBytes.length).toBeGreaterThan(0);
    expect(partialBytes.at(-1)).not.toBe(10);
    const retryJournal = createEventJournal(location(home));
    const result = await retryJournal.append(original);
    const finalBytes = await readFile(retryJournal.path);
    const scan = scanJournalBytes(finalBytes);
    expect(result).toEqual({ status: "recovered", eventId: "event-retry", line: 1 });
    expect(finalBytes.subarray(0, partialBytes.length)).toEqual(partialBytes);
    expect(scan.problems).toEqual([]);
    expect(scan.lines[0]?.event).toEqual(original);
  });

  it("preserves an ambiguous partial record instead of completing unprovable retry content", async () => {
    const home = await createHome();
    let interrupted = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      openAppend: async (path, root) => {
        const opened = await nodeJournalFileSystem.openAppend(path, root);
        if (interrupted) return opened;
        return {
          created: opened.created,
          handle: {
            size: () => opened.handle.size(),
            read: (bytes, offset, length, position) => opened.handle.read(bytes, offset, length, position),
            write: async (bytes, offset, length) => {
              if (!interrupted) {
                interrupted = true;
                await opened.handle.write(bytes, offset, Math.min(23, length));
                throw new Error("simulated process interruption");
              }
              return opened.handle.write(bytes, offset, length);
            },
            sync: () => opened.handle.sync(),
            close: () => opened.handle.close(),
          },
        };
      },
    };
    const interruptedJournal = createEventJournal(location(home), storage);
    const original = event("event-ambiguous", { value: "original" });
    await expect(interruptedJournal.append(original)).rejects.toMatchObject({ code: "storage-failure" });
    const before = await readFile(interruptedJournal.path);
    const retryJournal = createEventJournal(location(home));
    await expect(retryJournal.append(original)).rejects.toMatchObject({ code: "journal-uncertain" });
    await expect(retryJournal.append(event("event-ambiguous", { value: "changed" }))).rejects.toMatchObject({
      code: "journal-uncertain",
    });
    expect(await readFile(retryJournal.path)).toEqual(before);
  });

  it("keeps damaged newer bytes and refuses to treat an older valid prefix as current", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    await journal.append(event("event-old"));
    await appendFile(journal.path, "unfinished newer record");
    const before = await readFile(journal.path);
    const scan = await journal.read();
    expect(scan.lines[0]?.event?.id).toBe("event-old");
    expect(scan.problems.map((problem) => problem.code)).toContain("invalid-json");
    expect(scan.problems.map((problem) => problem.code)).toContain("unterminated-record");
    await expect(journal.append(event("event-new"))).rejects.toMatchObject({
      code: "journal-uncertain",
    });
    expect(await readFile(journal.path)).toEqual(before);
  });

  it("serializes separate writer instances for the same journal", async () => {
    const home = await createHome();
    const firstStorage: JournalFileSystem = { ...nodeJournalFileSystem };
    const secondStorage: JournalFileSystem = { ...nodeJournalFileSystem };
    const first = createEventJournal(location(home), firstStorage);
    const second = createEventJournal(location(home), secondStorage);
    const results = await Promise.allSettled([
      first.append(event("same-event")),
      second.append(event("same-event")),
    ]);
    const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failed = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    expect(successful.map((result) => result.status)).toContain("appended");
    expect(failed.every((error) => error.code === "journal-writer-locked")).toBe(true);
    const scan = await first.read();
    expect(scan.lines.map((record) => record.event?.id)).toEqual(["same-event"]);
    expect(scan.problems).toEqual([]);
    expect(await second.append(event("same-event"))).toMatchObject({ status: "duplicate", line: 1 });
  });

  it("excludes a concurrent append from another process until the claim is released", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    await journal.append(event("existing-event"));
    const sharedEvent = event("cross-process-event");
    const holder = startJournalChild(home, sharedEvent, "hold");
    let contender: ReturnType<typeof startJournalChild> | undefined;
    try {
      await holder.waitForOutput("SYNC_WAIT\n");
      contender = startJournalChild(home, sharedEvent, "append");
      const blocked = await contender.completion;
      expect(blocked.exitCode).toBe(0);
      expect(childValue(blocked)).toEqual({ code: "journal-writer-locked" });
      holder.child.stdin.end("continue\n");
      const appended = await holder.completion;
      expect(appended.exitCode).toBe(0);
      expect(childValue(appended)).toEqual({ status: "appended", eventId: "cross-process-event", line: 2 });
    } finally {
      if (holder.child.exitCode === null && holder.child.signalCode === null) holder.child.stdin.end("continue\n");
      contender?.child.kill();
      await Promise.allSettled([holder.completion, ...(contender ? [contender.completion] : [])]);
    }
    expect(await journal.append(sharedEvent)).toEqual({ status: "duplicate", eventId: "cross-process-event", line: 2 });
    const scan = await journal.read();
    expect(scan.problems).toEqual([]);
    expect(scan.lines.map((record) => record.event?.id)).toEqual(["existing-event", "cross-process-event"]);
  });

  it("leaves a crashed writer claim in place and fails closed without changing journal bytes", async () => {
    const home = await createHome();
    execFileSync("git", ["-C", home, "init", "--quiet"]);
    const journal = createEventJournal(location(home));
    await journal.append(event("existing-event"));
    const before = await readFile(journal.path);
    const crashed = startJournalChild(home, event("crashed-event"), "crash");
    const result = await crashed.completion;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("LOCK_HELD");
    const claim = childValue(result) as { readonly artifactPath: string };
    const lockPath = claim.artifactPath;
    lockArtifacts.push(lockPath);
    expect(Path.relative(home, lockPath).startsWith("..")).toBe(true);
    await expect(journal.append(event("retry-event"))).rejects.toMatchObject({ code: "journal-writer-locked" });
    expect(await readFile(journal.path)).toEqual(before);
    const [ownerName] = await readdir(lockPath);
    expect(ownerName).toMatch(/^owner-[0-9a-f-]+\.json$/);
    const owner = JSON.parse(await readFile(Path.join(lockPath, ownerName as string), "utf8")) as Record<string, unknown>;
    expect(owner).toMatchObject({ machine: expect.any(String), journal_path: journal.path });
    expect(owner.process_id).toEqual(expect.any(Number));
    expect(owner.process_incarnation).toEqual(expect.any(Number));
    const status = execFileSync("git", ["-C", home, "status", "--short", "--untracked-files=all"], { encoding: "utf8" });
    expect(status.trim().split(/\r?\n/)).toEqual([`?? ${Path.relative(home, journal.path)}`]);
  });

  it("keeps independent journal writers concurrent across processes", async () => {
    const home = await createHome();
    const first = createEventJournal(location(home));
    const second = createEventJournal(location(home, "journal-other"));
    await first.append(event("first-existing-event"));
    const holder = startJournalChild(home, event("first-journal-event"), "hold");
    try {
      await holder.waitForOutput("SYNC_WAIT\n");
      expect(await second.append(event("second-journal-event", { value: 2 }, "journal-other")))
        .toMatchObject({ status: "appended", line: 1 });
      holder.child.stdin.end("continue\n");
      const appended = await holder.completion;
      expect(appended.exitCode).toBe(0);
      expect(childValue(appended)).toEqual({ status: "appended", eventId: "first-journal-event", line: 2 });
    } finally {
      if (holder.child.exitCode === null && holder.child.signalCode === null) holder.child.stdin.end("continue\n");
      await Promise.allSettled([holder.completion]);
    }
    expect((await first.read()).lines.map((record) => record.event?.id))
      .toEqual(["first-existing-event", "first-journal-event"]);
    expect((await second.read()).lines.map((record) => record.event?.id)).toEqual(["second-journal-event"]);
  });

  it("preserves a replacement writer marker when the old owner releases", async () => {
    const home = await createHome();
    let lockPath = "";
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      acquireWriterLock: async (path, root) => {
        const claim = await nodeJournalFileSystem.acquireWriterLock(path, root);
        lockPath = claim.artifactPath;
        lockArtifacts.push(lockPath);
        const [ownerName] = await readdir(lockPath);
        const replacementPath = Path.join(lockPath, "owner-replacement.json");
        await rename(Path.join(lockPath, ownerName as string), replacementPath);
        await writeFile(replacementPath, JSON.stringify({ token: "replacement", journal_path: path }));
        return claim;
      },
    };
    const journal = createEventJournal(location(home), storage);
    await expect(journal.append(event("replacement-marker-event"))).rejects.toMatchObject({ code: "journal-lock-lost" });
    expect(await readdir(lockPath)).toEqual(["owner-replacement.json"]);
    expect((await journal.read()).lines.map((record) => record.event?.id)).toEqual(["replacement-marker-event"]);
    await expect(journal.append(event("blocked-by-replacement"))).rejects.toMatchObject({ code: "journal-writer-locked" });
  });

  it("treats a lock directory without owner metadata as held", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    await journal.append(event("existing-event"));
    const before = await readFile(journal.path);
    const root = await nodeJournalFileSystem.realpath(home);
    const claim = await nodeJournalFileSystem.acquireWriterLock(journal.path, root);
    const lockPath = claim.artifactPath;
    lockArtifacts.push(lockPath);
    await claim.release();
    await mkdir(lockPath);
    await expect(journal.append(event("blocked-event"))).rejects.toMatchObject({ code: "journal-writer-locked" });
    expect(await readFile(journal.path)).toEqual(before);
    expect(await readdir(lockPath)).toEqual([]);
    await writeFile(Path.join(lockPath, "owner-partial.json"), "{");
    await expect(journal.append(event("blocked-by-partial-owner"))).rejects.toMatchObject({ code: "journal-writer-locked" });
    expect(await readFile(journal.path)).toEqual(before);
    expect(await readFile(Path.join(lockPath, "owner-partial.json"), "utf8")).toBe("{");
  });

  it("does not create journal directories through a replaced parent symlink", async () => {
    const home = await createHome();
    const outsideDirectory = await createHome();
    const hiddenDirectory = Path.join(home, ".kepler.held");
    const journalRoot = Path.join(home, ".kepler");
    const missionsDirectory = Path.join(journalRoot, "missions");
    let swapped = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      mkdir: async (path, root) => {
        if (!swapped && path === missionsDirectory) {
          swapped = true;
          await rename(journalRoot, hiddenDirectory);
          await symlink(outsideDirectory, journalRoot);
        }
        await nodeJournalFileSystem.mkdir(path, root);
      },
    };
    const journal = createEventJournal(location(home), storage);
    await expect(journal.append(event("directory-symlink-race"))).rejects.toMatchObject({ code: "invalid-location" });
    expect(swapped).toBe(true);
    expect(await readdir(outsideDirectory)).toEqual([]);
    expect(await readdir(hiddenDirectory)).toEqual([]);
  });

  it("rejects a journal-file symlink installed after path inspection", async () => {
    const home = await createHome();
    const outsideHome = await createHome();
    const expectedPath = Path.join(home, ".kepler", "missions", missionId, "history", "construction", "journal-main.jsonl");
    const outside = Path.join(outsideHome, "outside.jsonl");
    const sentinel = Buffer.from("outside bytes\n");
    await writeFile(outside, sentinel);
    let swapped = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      openAppend: async (path, root) => {
        if (!swapped && path === expectedPath) {
          swapped = true;
          await symlink(outside, path);
        }
        return nodeJournalFileSystem.openAppend(path, root);
      },
    };
    const journal = createEventJournal(location(home), storage);
    await expect(journal.append(event("symlink-race"))).rejects.toMatchObject({ code: "storage-failure" });
    expect(swapped).toBe(true);
    expect(await readFile(outside)).toEqual(sentinel);
  });

  it("does not append through a directory moved after its file handle opens", async () => {
    const home = await createHome();
    const outsideDirectory = await createHome();
    const directory = Path.join(home, ".kepler", "missions", missionId, "history", "construction");
    const movedDirectory = Path.join(outsideDirectory, "moved-history");
    const journal = createEventJournal(location(home));
    await journal.append(event("existing-event"));
    const before = await readFile(journal.path);
    let moved = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      acquireWriterLock: async (path, root) => {
        const claim = await nodeJournalFileSystem.acquireWriterLock(path, root);
        lockArtifacts.push(claim.artifactPath);
        return claim;
      },
      openAppend: async (path, root) => {
        const opened = await nodeJournalFileSystem.openAppend(path, root);
        if (!moved && path === journal.path) {
          moved = true;
          await rename(directory, movedDirectory);
          await symlink(outsideDirectory, directory);
        }
        return opened;
      },
    };
    const racingJournal = createEventJournal(location(home), storage);
    await expect(racingJournal.append(event("must-not-append"))).rejects.toMatchObject({ code: "journal-lock-lost" });
    expect(moved).toBe(true);
    expect(await readFile(Path.join(movedDirectory, "journal-main.jsonl"))).toEqual(before);
    expect(await readdir(outsideDirectory)).toEqual(["moved-history"]);
  });

  it("rejects a parent-directory symlink swap before writing outside the record home", async () => {
    const home = await createHome();
    const directory = Path.join(home, ".kepler", "missions", missionId, "history", "construction");
    const movedDirectory = `${directory}.held`;
    const outsideDirectory = await createHome();
    await mkdir(directory, { recursive: true });
    const outside = Path.join(outsideDirectory, "journal-main.jsonl");
    const sentinel = Buffer.from("outside journal bytes\n");
    await writeFile(outside, sentinel);
    let swapped = false;
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      acquireWriterLock: async (path, root) => {
        const claim = await nodeJournalFileSystem.acquireWriterLock(path, root);
        lockArtifacts.push(claim.artifactPath);
        return claim;
      },
      openAppend: async (path, root) => {
        if (!swapped && path === Path.join(directory, "journal-main.jsonl")) {
          swapped = true;
          await rename(directory, movedDirectory);
          await symlink(outsideDirectory, directory);
        }
        return nodeJournalFileSystem.openAppend(path, root);
      },
    };
    const journal = createEventJournal(location(home), storage);
    await expect(journal.append(event("parent-symlink-race"))).rejects.toMatchObject({ code: "journal-lock-lost" });
    expect(swapped).toBe(true);
    expect(await readFile(outside)).toEqual(sentinel);
    expect(await readdir(outsideDirectory)).toEqual(["journal-main.jsonl"]);
    expect(await readdir(movedDirectory)).toEqual([]);
  });

  it("refuses duplicate JSON keys without changing journal bytes", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    await journal.append(event("valid-prefix"));
    const duplicateId = JSON.stringify(event("duplicate-id"))
      .replace('"id":"duplicate-id"', '"id":"duplicate-id","id":"shadow-id"');
    const duplicatePayload = JSON.stringify(event("duplicate-payload"))
      .replace('"value":1', '"value":1,"value":2');
    await appendFile(journal.path, `${duplicateId}\n${duplicatePayload}\n`);
    const before = await readFile(journal.path);
    const scan = await journal.read();
    expect(scan.problems.filter((problem) => problem.code === "duplicate-json-key")).toHaveLength(2);
    await expect(journal.append(event("after-duplicates"))).rejects.toMatchObject({ code: "journal-uncertain" });
    expect(await readFile(journal.path)).toEqual(before);
  });

  it("keeps independent journal writers concurrent", async () => {
    const home = await createHome();
    let openedCount = 0;
    let release: (() => void) | undefined;
    const bothOpened = new Promise<void>((resolve) => { release = resolve; });
    const storage: JournalFileSystem = {
      ...nodeJournalFileSystem,
      openAppend: async (path, root) => {
        openedCount += 1;
        if (openedCount === 2) release?.();
        await bothOpened;
        return nodeJournalFileSystem.openAppend(path, root);
      },
    };
    const first = createEventJournal(location(home, "journal-first"), storage);
    const second = createEventJournal(location(home, "journal-second"), storage);
    const [firstResult, secondResult] = await Promise.all([
      first.append(event("event-first", { value: "first" }, "journal-first")),
      second.append(event("event-second", { value: "second" }, "journal-second")),
    ]);
    expect(openedCount).toBe(2);
    expect(firstResult.status).toBe("appended");
    expect(secondResult.status).toBe("appended");
    expect((await first.read()).problems).toEqual([]);
    expect((await second.read()).problems).toEqual([]);
  });

  it("serializes appends made through one journal writer", async () => {
    const home = await createHome();
    const journal = createEventJournal(location(home));
    const results = await Promise.all([
      journal.append(event("event-first", { value: "first" })),
      journal.append(event("event-second", { value: "second" })),
    ]);
    const scan = await journal.read();
    expect(results.map((result) => result.line)).toEqual([1, 2]);
    expect(scan.lines.map((record) => record.event?.id)).toEqual(["event-first", "event-second"]);
  });
});
