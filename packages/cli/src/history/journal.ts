import { createHash, randomUUID } from "node:crypto";
import { constants as FsConstants } from "node:fs";
import * as Fs from "node:fs/promises";
import { hostname } from "node:os";
import * as Path from "node:path";
import {
  EVENT_ENVELOPE_VERSION,
  validateEventEnvelope,
  type EventEnvelope,
  type EventEnvelopeIssue,
} from "@vialactea-works/kepler-core";
import { parseStrictJson } from "../json/strict-json.js";

export type JournalPathKind = "missing" | "directory" | "file" | "symlink" | "other";

export interface JournalReadHandle {
  readonly verify?: () => Promise<void>;
  readonly size: () => Promise<number>;
  readonly read: (bytes: Uint8Array, offset: number, length: number, position: number) => Promise<number>;
  readonly close: () => Promise<void>;
}

export interface JournalHandle extends JournalReadHandle {
  readonly write: (bytes: Uint8Array, offset: number, length: number) => Promise<number>;
  readonly sync: () => Promise<void>;
}

export interface JournalWriterLock {
  readonly artifactPath: string;
  readonly release: () => Promise<void>;
}

export interface JournalFileSystem {
  readonly inspect: (path: string) => Promise<JournalPathKind>;
  readonly realpath: (path: string) => Promise<string>;
  readonly mkdir: (path: string, root: string) => Promise<void>;
  readonly openRead: (path: string, root: string) => Promise<JournalReadHandle>;
  readonly openAppend: (path: string, root: string) => Promise<{ readonly handle: JournalHandle; readonly created: boolean }>;
  readonly acquireWriterLock: (path: string, root: string) => Promise<JournalWriterLock>;
  readonly syncDirectory: (path: string, root: string) => Promise<void>;
}

export interface JournalCoordinates {
  readonly recordHome: string;
  readonly missionId: string;
  readonly phase: string;
  readonly journalId: string;
}

export type JournalProblemCode =
  | "blank-line"
  | "invalid-utf8"
  | "invalid-json"
  | "duplicate-json-key"
  | "invalid-envelope"
  | "unsupported-envelope-version"
  | "unterminated-record";

export interface JournalProblem {
  readonly code: JournalProblemCode;
  readonly line: number;
  readonly byteOffset: number;
  readonly message: string;
}

export interface JournalLine {
  readonly line: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly terminated: boolean;
  readonly raw?: string;
  readonly event?: EventEnvelope;
  readonly issues: readonly EventEnvelopeIssue[];
}

export interface JournalScan {
  readonly bytes: Uint8Array;
  readonly lines: readonly JournalLine[];
  readonly problems: readonly JournalProblem[];
  readonly endedWithNewline: boolean;
}

export type JournalAppendErrorCode =
  | "invalid-event"
  | "unsupported-event"
  | "journal-scope-mismatch"
  | "journal-conflict"
  | "journal-uncertain"
  | "journal-writer-locked"
  | "journal-lock-lost"
  | "invalid-location"
  | "storage-failure";

export class JournalAppendError extends Error {
  constructor(
    readonly code: JournalAppendErrorCode,
    message: string,
    readonly journalPath: string,
  ) {
    super(message);
    this.name = "JournalAppendError";
  }
}

export interface JournalAppendResult {
  readonly status: "appended" | "duplicate" | "recovered";
  readonly eventId: string;
  readonly line: number;
}

export interface EventJournal {
  readonly path: string;
  readonly read: () => Promise<JournalScan>;
  readonly append: (event: unknown) => Promise<JournalAppendResult>;
}

const utf8 = new TextEncoder();
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const phaseSegment = /^[a-z][a-z0-9-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMissingError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isWithin = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};

interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJson;
}

type CanonicalJson = null | string | number | boolean | readonly CanonicalJson[] | CanonicalJsonObject;

const canonicalValue = (value: unknown): CanonicalJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    const entries: [string, CanonicalJson][] = [];
    const keys = Object.keys(value).sort((left, right) => {
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
    for (const key of keys) entries.push([key, canonicalValue(value[key])]);
    return Object.fromEntries(entries);
  }
  throw new Error("Event contains a non-JSON value");
};

export const serializeJournalEvent = (event: EventEnvelope): string => {
  const encoded = JSON.stringify({
    id: event.id,
    phase: event.phase,
    type: event.type,
    envelope_version: event.envelope_version,
    event_version: event.event_version,
    journal_id: event.journal_id,
    recorded_at: event.recorded_at,
    producer: { name: event.producer.name, version: event.producer.version },
    caused_by: [...event.caused_by],
    data: canonicalValue(event.data),
  });
  if (encoded === undefined) throw new Error("Event cannot be serialized as JSON");
  return encoded;
};

const scanLine = (
  bytes: Uint8Array,
  line: number,
  byteOffset: number,
  terminated: boolean,
): { readonly record: JournalLine; readonly problems: readonly JournalProblem[] } => {
  const content = bytes.at(-1) === 13 ? bytes.subarray(0, bytes.length - 1) : bytes;
  const terminationProblem = (): JournalProblem => ({
    code: "unterminated-record",
    line,
    byteOffset,
    message: "Journal record has no terminating newline",
  });
  const withTermination = (problem: JournalProblem): readonly JournalProblem[] =>
    terminated ? [problem] : [problem, terminationProblem()];
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    const problem: JournalProblem = { code: "invalid-utf8", line, byteOffset, message: "Journal line is not valid UTF-8" };
    return { record: { line, byteOffset, byteLength: bytes.length, terminated, issues: [] }, problems: withTermination(problem) };
  }
  if (raw.trim().length === 0) {
    const problem: JournalProblem = { code: "blank-line", line, byteOffset, message: "Journal contains a blank record" };
    return { record: { line, byteOffset, byteLength: bytes.length, terminated, raw, issues: [] }, problems: withTermination(problem) };
  }
  const parsedJson = parseStrictJson(raw);
  if (parsedJson.kind === "invalid") {
    const duplicate = parsedJson.code === "duplicate-json-key";
    const problem: JournalProblem = {
      code: duplicate ? "duplicate-json-key" : "invalid-json",
      line,
      byteOffset,
      message: duplicate
        ? "Journal JSON contains a duplicate object key"
        : "Journal line is not valid JSON",
    };
    return {
      record: { line, byteOffset, byteLength: bytes.length, terminated, raw, issues: [] },
      problems: withTermination(problem),
    };
  }
  const validation = validateEventEnvelope(parsedJson.value);
  if (validation.status === "invalid") {
    const problem: JournalProblem = { code: "invalid-envelope", line, byteOffset, message: "Journal line does not contain a valid event envelope" };
    return { record: { line, byteOffset, byteLength: bytes.length, terminated, raw, issues: validation.issues }, problems: withTermination(problem) };
  }
  if (validation.status === "unsupported") {
    const problem: JournalProblem = { code: "unsupported-envelope-version", line, byteOffset, message: `Unsupported event envelope version ${validation.event.envelope_version}` };
    return {
      record: { line, byteOffset, byteLength: bytes.length, terminated, raw, event: validation.event, issues: [] },
      problems: withTermination(problem),
    };
  }
  return {
    record: { line, byteOffset, byteLength: bytes.length, terminated, raw, event: validation.event, issues: [] },
    problems: terminated ? [] : [terminationProblem()],
  };
};

export const scanJournalBytes = (bytes: Uint8Array): JournalScan => {
  const lines: JournalLine[] = [];
  const problems: JournalProblem[] = [];
  let offset = 0;
  let line = 1;
  while (offset < bytes.length) {
    const newline = bytes.indexOf(10, offset);
    const end = newline < 0 ? bytes.length : newline;
    const parsed = scanLine(bytes.subarray(offset, end), line, offset, newline >= 0);
    lines.push(parsed.record);
    problems.push(...parsed.problems);
    if (newline < 0) break;
    offset = newline + 1;
    line += 1;
  }
  return { bytes: new Uint8Array(bytes), lines, problems, endedWithNewline: bytes.length === 0 || bytes.at(-1) === 10 };
};

export const journalPath = (coordinates: JournalCoordinates): string => {
  if (!Path.isAbsolute(coordinates.recordHome) || !uuidV4.test(coordinates.missionId) ||
      !phaseSegment.test(coordinates.phase) || !safeSegment.test(coordinates.journalId) ||
      coordinates.journalId === "." || coordinates.journalId === "..") {
    throw new JournalAppendError("invalid-location", "Journal location contains an invalid path identity", coordinates.recordHome);
  }
  return Path.resolve(
    coordinates.recordHome,
    ".kepler",
    "missions",
    coordinates.missionId,
    "history",
    coordinates.phase,
    `${coordinates.journalId}.jsonl`,
  );
};

const sameFileIdentity = (
  left: Awaited<ReturnType<typeof Fs.lstat>>,
  right: Awaited<ReturnType<typeof Fs.lstat>>,
): boolean => left.dev === right.dev && left.ino === right.ino;

const descriptorDirectoryPath = (handle: Awaited<ReturnType<typeof Fs.open>>): string | undefined =>
  process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : undefined;

const pathFromDirectory = (
  handle: Awaited<ReturnType<typeof Fs.open>>,
  directoryPath: string,
  name: string,
): string => Path.join(descriptorDirectoryPath(handle) ?? directoryPath, name);

const removeCreatedFileIfUnchanged = async (
  path: string,
  handle: Awaited<ReturnType<typeof Fs.open>>,
): Promise<void> => {
  const openedStat = await handle.stat();
  const pathStat = await Fs.lstat(path).catch(() => undefined);
  if (pathStat?.isFile() && !pathStat.isSymbolicLink() && sameFileIdentity(openedStat, pathStat)) {
    await Fs.unlink(path);
  }
};

const verifyOpenedDirectoryPath = async (
  handle: Awaited<ReturnType<typeof Fs.open>>,
  path: string,
  root: string,
): Promise<void> => {
  const openedStat = await handle.stat();
  const pathStat = await Fs.lstat(path).catch(() => undefined);
  const resolvedPath = await Fs.realpath(path).catch(() => undefined);
  if (!openedStat.isDirectory() || !pathStat || pathStat.isSymbolicLink() || !pathStat.isDirectory() ||
      !sameFileIdentity(openedStat, pathStat) || !resolvedPath || !isWithin(root, resolvedPath) || resolvedPath !== path) {
    throw new Error("Journal directory changed or escaped its record home");
  }
};

const openVerifiedDirectory = async (
  path: string,
  root: string,
): Promise<Awaited<ReturnType<typeof Fs.open>>> => {
  const resolvedBeforeOpen = await Fs.realpath(path);
  if (!isWithin(root, resolvedBeforeOpen) || resolvedBeforeOpen !== path) {
    throw new Error("Journal directory changed or escaped its record home");
  }
  const handle = await Fs.open(path, FsConstants.O_RDONLY | FsConstants.O_DIRECTORY | FsConstants.O_NOFOLLOW);
  try {
    await verifyOpenedDirectoryPath(handle, path, root);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
};

const verifyOpenedJournalFile = async (
  handle: Awaited<ReturnType<typeof Fs.open>>,
  openedPath: string,
  expectedPath: string,
  root: string,
): Promise<void> => {
  const resolvedPath = await Fs.realpath(openedPath);
  const openedStat = await handle.stat();
  const pathStat = await Fs.stat(resolvedPath);
  if (!openedStat.isFile() || !pathStat.isFile() || !isWithin(root, resolvedPath) ||
      Path.resolve(expectedPath) !== resolvedPath || openedStat.dev !== pathStat.dev || openedStat.ino !== pathStat.ino) {
    throw new Error("Journal file changed or escaped its record home during open");
  }
};

const nodeJournalReadHandle = (
  handle: Awaited<ReturnType<typeof Fs.open>>,
  verify?: () => Promise<void>,
  close?: () => Promise<void>,
): JournalReadHandle => ({
  ...(verify ? { verify } : {}),
  size: async () => (await handle.stat()).size,
  read: async (bytes, offset, length, position) =>
    (await handle.read(bytes, offset, length, position)).bytesRead,
  close: close ?? (() => handle.close()),
});

const syncNodeDirectory = async (path: string, root: string): Promise<void> => {
  const handle = await openVerifiedDirectory(path, root);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const ensureJournalLockRoot = async (
  journalPathValue: string,
): Promise<{
  readonly path: string;
  readonly systemRoot: string;
  readonly stat: Awaited<ReturnType<typeof Fs.lstat>>;
}> => {
  const userId = process.getuid?.();
  if (userId === undefined) {
    throw new JournalAppendError("invalid-location", "Journal writer claims require a POSIX user identity", journalPathValue);
  }
  const systemRoot = await Fs.realpath("/tmp");
  const path = Path.join(systemRoot, `kepler-journal-locks-${userId}`);
  try {
    await Fs.mkdir(path, 0o700);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  }
  const stat = await Fs.lstat(path);
  const resolvedPath = await Fs.realpath(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== userId || (stat.mode & 0o077) !== 0 ||
      !isWithin(systemRoot, resolvedPath) || resolvedPath !== path) {
    throw new JournalAppendError("invalid-location", "Journal writer lock root is not private and local", journalPathValue);
  }
  return { path, systemRoot, stat };
};

const acquireNodeJournalWriterLock = async (path: string, root: string): Promise<JournalWriterLock> => {
  const parent = Path.dirname(path);
  const resolvedParent = await Fs.realpath(parent);
  if (!isWithin(root, resolvedParent) || resolvedParent !== parent) {
    throw new JournalAppendError("invalid-location", "Journal writer claim is outside its record home", path);
  }
  const lockRoot = await ensureJournalLockRoot(path);
  const lockRootHandle = await openVerifiedDirectory(lockRoot.path, lockRoot.systemRoot);
  const lockRootStat = await lockRootHandle.stat();
  if (!sameFileIdentity(lockRootStat, lockRoot.stat)) {
    await lockRootHandle.close();
    throw new JournalAppendError("invalid-location", "Journal writer lock root changed during open", path);
  }
  const lockName = `journal-${createHash("sha256").update(path).digest("hex")}.lock`;
  const lockPath = Path.join(lockRoot.path, lockName);
  const lockEntryPath = pathFromDirectory(lockRootHandle, lockRoot.path, lockName);
  try {
    await Fs.mkdir(lockEntryPath, 0o700);
  } catch (error) {
    await lockRootHandle.close();
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      const existing = await Fs.lstat(lockPath).catch(() => undefined);
      if (!existing || existing.isSymbolicLink() || !existing.isDirectory()) {
        throw new JournalAppendError("invalid-location", "Journal writer claim is not a regular directory", path);
      }
      throw new JournalAppendError("journal-writer-locked", `Journal writer claim already exists at ${lockPath}`, path);
    }
    throw error;
  }
  let lockDirectoryHandle: Awaited<ReturnType<typeof Fs.open>> | undefined;
  try {
    const lockDirectoryStat = await Fs.lstat(lockPath);
    const resolvedLockDirectory = await Fs.realpath(lockPath);
    if (lockDirectoryStat.isSymbolicLink() || !lockDirectoryStat.isDirectory() ||
        !isWithin(lockRoot.path, resolvedLockDirectory) || resolvedLockDirectory !== lockPath) {
      throw new JournalAppendError("invalid-location", "Journal writer claim changed during creation", path);
    }
    lockDirectoryHandle = await openVerifiedDirectory(lockPath, lockRoot.path);
    const openedLockDirectoryStat = await lockDirectoryHandle.stat();
    if (!sameFileIdentity(openedLockDirectoryStat, lockDirectoryStat)) {
      throw new JournalAppendError("invalid-location", "Journal writer claim changed during open", path);
    }
    const token = randomUUID();
    const ownerName = `owner-${token}.json`;
    const ownerPath = Path.join(lockPath, ownerName);
    const ownerAccessPath = pathFromDirectory(lockDirectoryHandle, lockPath, ownerName);
    const owner = {
      token,
      process_id: process.pid,
      machine: hostname(),
      process_incarnation: performance.timeOrigin,
      journal_path: path,
      acquired_at: new Date().toISOString(),
    };
    const ownerHandle = await Fs.open(
      ownerAccessPath,
      FsConstants.O_WRONLY | FsConstants.O_CREAT | FsConstants.O_EXCL | FsConstants.O_NOFOLLOW,
      0o600,
    );
    let ownerFileIdentity: Awaited<ReturnType<typeof Fs.lstat>> | undefined;
    try {
      await verifyOpenedJournalFile(ownerHandle, ownerAccessPath, ownerPath, lockRoot.path);
      ownerFileIdentity = await ownerHandle.stat();
      await ownerHandle.writeFile(`${JSON.stringify(owner)}\n`);
      await ownerHandle.sync();
    } finally {
      await ownerHandle.close();
    }
    if (!ownerFileIdentity) {
      throw new JournalAppendError("journal-lock-lost", "Journal writer claim metadata could not be verified", path);
    }
    await lockDirectoryHandle.sync();
    await lockDirectoryHandle.close();
    lockDirectoryHandle = undefined;
    await lockRootHandle.sync();
    let releaseAttempted = false;
    return {
      artifactPath: lockPath,
      release: async () => {
        if (releaseAttempted) return;
        releaseAttempted = true;
        let releaseDirectoryHandle: Awaited<ReturnType<typeof Fs.open>> | undefined;
        try {
          const releaseParent = await Fs.realpath(parent);
          if (!isWithin(root, releaseParent) || releaseParent !== parent) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim changed or escaped its record home", path);
          }
          const currentLockRoot = await Fs.lstat(lockRoot.path).catch(() => undefined);
          const resolvedLockRoot = await Fs.realpath(lockRoot.path).catch(() => undefined);
          if (!currentLockRoot || currentLockRoot.isSymbolicLink() || !currentLockRoot.isDirectory() ||
              !sameFileIdentity(currentLockRoot, lockRootStat) || resolvedLockRoot !== lockRoot.path) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer lock root was replaced", path);
          }
          const currentLockDirectory = await Fs.lstat(lockPath).catch(() => undefined);
          const resolvedCurrentLockDirectory = await Fs.realpath(lockPath).catch(() => undefined);
          if (!currentLockDirectory || currentLockDirectory.isSymbolicLink() || !currentLockDirectory.isDirectory() ||
              !sameFileIdentity(currentLockDirectory, openedLockDirectoryStat) || resolvedCurrentLockDirectory !== lockPath) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim directory was replaced", path);
          }
          releaseDirectoryHandle = await openVerifiedDirectory(lockPath, lockRoot.path);
          const releaseDirectoryStat = await releaseDirectoryHandle.stat();
          if (!sameFileIdentity(releaseDirectoryStat, openedLockDirectoryStat)) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim directory changed before release", path);
          }
          const releaseOwnerAccessPath = pathFromDirectory(releaseDirectoryHandle, lockPath, ownerName);
          let ownerHandle: Awaited<ReturnType<typeof Fs.open>>;
          try {
            ownerHandle = await Fs.open(releaseOwnerAccessPath, FsConstants.O_RDONLY | FsConstants.O_NOFOLLOW);
          } catch {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim marker was replaced or removed", path);
          }
          try {
            const ownerStat = await ownerHandle.stat();
            const ownerPathStat = await Fs.lstat(releaseOwnerAccessPath).catch(() => undefined);
            if (!ownerStat.isFile() || !ownerPathStat || !sameFileIdentity(ownerStat, ownerFileIdentity) ||
                !sameFileIdentity(ownerPathStat, ownerFileIdentity)) {
              throw new JournalAppendError("journal-lock-lost", "Journal writer claim metadata was replaced", path);
            }
            const raw = (await ownerHandle.readFile()).toString("utf8");
            const parsed: unknown = JSON.parse(raw);
            if (!isRecord(parsed) || parsed.token !== token || parsed.journal_path !== path) {
              throw new JournalAppendError("journal-lock-lost", "Journal writer claim ownership changed", path);
            }
          } catch (error) {
            if (error instanceof JournalAppendError) throw error;
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim metadata is invalid", path);
          } finally {
            await ownerHandle.close();
          }
          const currentOwnerPathStat = await Fs.lstat(releaseOwnerAccessPath).catch(() => undefined);
          if (!currentOwnerPathStat || !sameFileIdentity(currentOwnerPathStat, ownerFileIdentity)) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim marker changed before release", path);
          }
          await Fs.unlink(releaseOwnerAccessPath);
          await releaseDirectoryHandle.sync();
          const currentEntryStat = await Fs.lstat(lockEntryPath).catch(() => undefined);
          if (!currentEntryStat || !sameFileIdentity(currentEntryStat, openedLockDirectoryStat)) {
            throw new JournalAppendError("journal-lock-lost", "Journal writer claim changed before directory removal", path);
          }
          await Fs.rmdir(lockEntryPath);
          await lockRootHandle.sync();
        } catch (error) {
          if (error instanceof JournalAppendError) throw error;
          throw new JournalAppendError("journal-lock-lost", "Journal writer claim could not be safely released", path);
        } finally {
          await releaseDirectoryHandle?.close();
          await lockRootHandle.close();
        }
      },
    };
  } catch (error) {
    await lockDirectoryHandle?.close();
    await lockRootHandle.close();
    throw error;
  }
};

const mkdirNodeJournalDirectory = async (path: string, root: string): Promise<void> => {
  const parentPath = Path.dirname(path);
  const parentHandle = await openVerifiedDirectory(parentPath, root);
  const openedPath = pathFromDirectory(parentHandle, parentPath, Path.basename(path));
  let createdStat: Awaited<ReturnType<typeof Fs.lstat>> | undefined;
  try {
    await Fs.mkdir(openedPath);
    createdStat = await Fs.lstat(openedPath);
    const resolvedOpenedPath = await Fs.realpath(openedPath);
    const resolvedPath = await Fs.realpath(path);
    const pathStat = await Fs.lstat(path);
    if (createdStat.isSymbolicLink() || !createdStat.isDirectory() || pathStat.isSymbolicLink() || !pathStat.isDirectory() ||
        resolvedOpenedPath !== path || resolvedPath !== path || !isWithin(root, resolvedOpenedPath) ||
        !sameFileIdentity(createdStat, pathStat)) {
      throw new Error("Journal directory changed or escaped its record home during creation");
    }
  } catch (error) {
    if (createdStat?.isDirectory()) {
      const currentPathStat = await Fs.lstat(openedPath).catch(() => undefined);
      if (currentPathStat && !currentPathStat.isSymbolicLink() && currentPathStat.isDirectory() &&
          sameFileIdentity(createdStat, currentPathStat)) {
        await Fs.rmdir(openedPath).catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await parentHandle.close();
  }
};

export const nodeJournalFileSystem: JournalFileSystem = {
  inspect: async (path) => {
    try {
      const stat = await Fs.lstat(path);
      if (stat.isSymbolicLink()) return "symlink";
      if (stat.isDirectory()) return "directory";
      if (stat.isFile()) return "file";
      return "other";
    } catch (error) {
      if (isMissingError(error)) return "missing";
      throw error;
    }
  },
  realpath: (path) => Fs.realpath(path),
  mkdir: mkdirNodeJournalDirectory,
  openRead: async (path, root) => {
    const parentPath = Path.dirname(path);
    const parentHandle = await openVerifiedDirectory(parentPath, root);
    let handle: Awaited<ReturnType<typeof Fs.open>> | undefined;
    let transferred = false;
    try {
      const openedPath = pathFromDirectory(parentHandle, parentPath, Path.basename(path));
      handle = await Fs.open(openedPath, FsConstants.O_RDONLY | FsConstants.O_NOFOLLOW);
      const openedHandle = handle;
      const verify = async (): Promise<void> => {
        await verifyOpenedDirectoryPath(parentHandle, parentPath, root);
        await verifyOpenedJournalFile(openedHandle, openedPath, path, root);
      };
      await verify();
      const close = async (): Promise<void> => {
        try {
          await openedHandle.close();
        } finally {
          await parentHandle.close();
        }
      };
      transferred = true;
      return nodeJournalReadHandle(openedHandle, verify, close);
    } catch (error) {
      await handle?.close();
      throw error;
    } finally {
      if (!transferred) await parentHandle.close();
    }
  },
  openAppend: async (path, root) => {
    const parentPath = Path.dirname(path);
    const parentHandle = await openVerifiedDirectory(parentPath, root);
    const openedPath = pathFromDirectory(parentHandle, parentPath, Path.basename(path));
    const appendFlags = FsConstants.O_APPEND | FsConstants.O_RDWR | FsConstants.O_CREAT | FsConstants.O_NOFOLLOW;
    let handle: Awaited<ReturnType<typeof Fs.open>> | undefined;
    let created = false;
    let transferred = false;
    try {
      try {
        handle = await Fs.open(openedPath, appendFlags | FsConstants.O_EXCL, 0o666);
        created = true;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
        handle = await Fs.open(openedPath, appendFlags, 0o666);
      }
      const openedHandle = handle;
      if (!openedHandle) throw new Error("Journal append handle was not opened");
      const verify = async (): Promise<void> => {
        await verifyOpenedDirectoryPath(parentHandle, parentPath, root);
        await verifyOpenedJournalFile(openedHandle, openedPath, path, root);
      };
      await verify();
      const close = async (): Promise<void> => {
        try {
          await openedHandle.close();
        } finally {
          await parentHandle.close();
        }
      };
      transferred = true;
      return {
        created,
        handle: {
          ...nodeJournalReadHandle(openedHandle, verify, close),
          write: async (bytes, offset, length) => {
            await verify();
            return (await openedHandle.write(bytes, offset, length)).bytesWritten;
          },
          sync: async () => {
            await verify();
            await openedHandle.sync();
          },
        },
      };
    } catch (error) {
      if (created && handle) await removeCreatedFileIfUnchanged(openedPath, handle).catch(() => undefined);
      await handle?.close();
      throw error;
    } finally {
      if (!transferred) await parentHandle.close();
    }
  },
  acquireWriterLock: acquireNodeJournalWriterLock,
  syncDirectory: syncNodeDirectory,
};

const locationDirectories = [".kepler", "missions"] as const;

const directoriesFor = (coordinates: JournalCoordinates): readonly string[] => [
  ...locationDirectories,
  coordinates.missionId,
  "history",
  coordinates.phase,
];

const validateRoot = async (storage: JournalFileSystem, recordHome: string, journalPathValue: string): Promise<string> => {
  try {
    const root = await storage.realpath(recordHome);
    if (await storage.inspect(root) !== "directory" || !isWithin(Path.resolve(recordHome), journalPathValue)) {
      throw new JournalAppendError("invalid-location", "Journal path is outside its record home", journalPathValue);
    }
    return root;
  } catch (error) {
    if (error instanceof JournalAppendError) throw error;
    throw new JournalAppendError("storage-failure", "Record home cannot be resolved", journalPathValue);
  }
};

const ensureDirectories = async (
  storage: JournalFileSystem,
  coordinates: JournalCoordinates,
  journalPathValue: string,
): Promise<{ readonly root: string; readonly directory: string }> => {
  const root = await validateRoot(storage, coordinates.recordHome, journalPathValue);
  let current = root;
  for (const segment of directoriesFor(coordinates)) {
    current = Path.join(current, segment);
    let kind = await storage.inspect(current);
    if (kind === "missing") {
      try {
        await storage.mkdir(current, root);
        kind = "directory";
      } catch {
        kind = await storage.inspect(current);
      }
    }
    if (kind !== "directory") {
      throw new JournalAppendError("invalid-location", "Journal path contains a non-directory or symbolic link", journalPathValue);
    }
    const resolved = await storage.realpath(current);
    if (!isWithin(root, resolved) || resolved !== current) {
      throw new JournalAppendError("invalid-location", "Journal path escapes its record home", journalPathValue);
    }
    current = resolved;
  }
  return { root, directory: current };
};

const existingDirectory = async (
  storage: JournalFileSystem,
  coordinates: JournalCoordinates,
  journalPathValue: string,
): Promise<{ readonly root: string; readonly directory?: string }> => {
  const root = await validateRoot(storage, coordinates.recordHome, journalPathValue);
  let current = root;
  for (const segment of directoriesFor(coordinates)) {
    current = Path.join(current, segment);
    const kind = await storage.inspect(current);
    if (kind === "missing") return { root };
    if (kind !== "directory") {
      throw new JournalAppendError("invalid-location", "Journal path contains a non-directory or symbolic link", journalPathValue);
    }
    const resolved = await storage.realpath(current);
    if (!isWithin(root, resolved) || resolved !== current) {
      throw new JournalAppendError("invalid-location", "Journal path escapes its record home", journalPathValue);
    }
    current = resolved;
  }
  return { root, directory: current };
};

const syncDirectoryChain = async (storage: JournalFileSystem, directory: string, root: string): Promise<void> => {
  let current = directory;
  while (isWithin(root, current)) {
    await storage.syncDirectory(current, root);
    if (current === root) return;
    const parent = Path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

const readAll = async (handle: JournalReadHandle): Promise<Uint8Array> => {
  await handle.verify?.();
  const size = await handle.size();
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Journal read returned an invalid size");
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    await handle.verify?.();
    const read = await handle.read(bytes, offset, size - offset, offset);
    if (!Number.isInteger(read) || read <= 0 || read > size - offset) {
      throw new Error("Journal read returned an invalid byte count");
    }
    offset += read;
  }
  return bytes;
};

const writeAll = async (handle: JournalHandle, bytes: Uint8Array): Promise<void> => {
  let offset = 0;
  while (offset < bytes.length) {
    await handle.verify?.();
    const written = await handle.write(bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error("Journal write returned an invalid byte count");
    }
    offset += written;
  }
};

interface JournalAppendQueue {
  tail: Promise<void>;
}

const journalAppendQueues = new WeakMap<JournalFileSystem, Map<string, JournalAppendQueue>>();

const appendQueue = (storage: JournalFileSystem, path: string): JournalAppendQueue => {
  let queues = journalAppendQueues.get(storage);
  if (!queues) {
    queues = new Map<string, JournalAppendQueue>();
    journalAppendQueues.set(storage, queues);
  }
  let queue = queues.get(path);
  if (!queue) {
    queue = { tail: Promise.resolve() };
    queues.set(path, queue);
  }
  return queue;
};

export const createEventJournal = (
  coordinates: JournalCoordinates,
  storage: JournalFileSystem = nodeJournalFileSystem,
): EventJournal => {
  const path = journalPath(coordinates);
  const queue = appendQueue(storage, path);
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.tail.then(operation);
    queue.tail = result.then(() => undefined, () => undefined);
    return result;
  };

  const read = (): Promise<JournalScan> => serialized(async () => {
    const parent = await existingDirectory(storage, coordinates, path);
    if (!parent.directory) return scanJournalBytes(new Uint8Array());
    const filePath = Path.join(parent.directory, `${coordinates.journalId}.jsonl`);
    const fileKind = await storage.inspect(filePath);
    if (fileKind === "missing") return scanJournalBytes(new Uint8Array());
    if (fileKind !== "file") {
      throw new JournalAppendError("invalid-location", "Journal path is not a regular file", path);
    }
    const handle = await storage.openRead(filePath, parent.root);
    try {
      return scanJournalBytes(await readAll(handle));
    } finally {
      await handle.close();
    }
  }).catch((error: unknown) => {
    if (error instanceof JournalAppendError) throw error;
    throw new JournalAppendError("storage-failure", error instanceof Error ? error.message : "Journal read failed", path);
  });

  const append = (event: unknown): Promise<JournalAppendResult> => serialized<JournalAppendResult>(async () => {
    const validation = validateEventEnvelope(event);
    if (validation.status === "invalid") {
      throw new JournalAppendError("invalid-event", "Event envelope failed validation", path);
    }
    if (validation.status === "unsupported") {
      throw new JournalAppendError("unsupported-event", "Event envelope version is unsupported", path);
    }
    if (validation.event.phase !== coordinates.phase || validation.event.journal_id !== coordinates.journalId) {
      throw new JournalAppendError("journal-scope-mismatch", "Event phase or journal identity does not match its journal", path);
    }
    if (validation.event.envelope_version !== EVENT_ENVELOPE_VERSION) {
      throw new JournalAppendError("unsupported-event", "Event envelope version is unsupported", path);
    }
    const encodedEvent = serializeJournalEvent(validation.event);
    const encodedLine = utf8.encode(`${encodedEvent}\n`);
    const directories = await ensureDirectories(storage, coordinates, path);
    const filePath = Path.join(directories.directory, `${coordinates.journalId}.jsonl`);
    const writerLock = await storage.acquireWriterLock(filePath, directories.root);
    let opened: Awaited<ReturnType<JournalFileSystem["openAppend"]>> | undefined;
    try {
      opened = await storage.openAppend(filePath, directories.root);
      const handle = opened.handle;
      const existingBytes = await readAll(handle);
      const scan = scanJournalBytes(existingBytes);
    if (scan.problems.length > 0) {
      const tail = scan.lines.at(-1);
      const tailProblems = tail && scan.problems.every((problem) => problem.line === tail.line &&
        ["invalid-json", "invalid-envelope", "invalid-utf8", "unterminated-record"].includes(problem.code));
      if (tail && !tail.terminated && tailProblems) {
        if (tail.event?.id === validation.event.id) {
          if (serializeJournalEvent(tail.event) !== encodedEvent) {
            throw new JournalAppendError("journal-conflict", "Event ID already exists with different content", path);
          }
          const newline = utf8.encode("\n");
          await writeAll(handle, newline);
          await handle.sync();
          await syncDirectoryChain(storage, directories.directory, directories.root);
          return { status: "recovered", eventId: validation.event.id, line: tail.line };
        }
      }
      throw new JournalAppendError("journal-uncertain", "Journal contains damaged or unsupported history", path);
    }
    const identities = new Map<string, string>();
    for (const record of scan.lines) {
      if (!record.event) continue;
      const serialized = serializeJournalEvent(record.event);
      const prior = identities.get(record.event.id);
      if (prior !== undefined && prior !== serialized) {
        throw new JournalAppendError("journal-conflict", "Journal contains conflicting records under one event ID", path);
      }
      identities.set(record.event.id, serialized);
    }
    const prior = identities.get(validation.event.id);
    if (prior !== undefined) {
      if (prior !== encodedEvent) {
        throw new JournalAppendError("journal-conflict", "Event ID already exists with different content", path);
      }
      await handle.sync();
      await syncDirectoryChain(storage, directories.directory, directories.root);
      const line = scan.lines.find((record) => record.event?.id === validation.event.id)?.line;
      return { status: "duplicate", eventId: validation.event.id, line: line ?? 0 };
    }
    await writeAll(handle, encodedLine);
    await handle.sync();
    await syncDirectoryChain(storage, directories.directory, directories.root);
    return { status: "appended", eventId: validation.event.id, line: scan.lines.length + 1 };
    } finally {
      try {
        if (opened) await opened.handle.close();
      } finally {
        await writerLock.release();
      }
    }
  }).catch((error: unknown) => {
    if (error instanceof JournalAppendError) throw error;
    throw new JournalAppendError("storage-failure", error instanceof Error ? error.message : "Journal operation failed", path);
  });

  return { path, read, append };
};
