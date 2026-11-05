import { createHash } from "node:crypto";
import { constants as FsConstants } from "node:fs";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { collectHistory, type HistoryJournalSource } from "../history/collection.js";
import { parseStrictJson } from "../json/strict-json.js";
import type { UnitQueryFileSystem } from "./unit-queries.js";
import type { MissionId } from "./events.js";
import type { MissionStartupRecovery } from "./mission-startup.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";
import { createNodeUnitQueryFileSystem } from "./unit-queries-runtime.js";

export interface MissionStartupIntentFileSystem {
  readonly open: (path: string, flags: number) => Promise<Awaited<ReturnType<typeof Fs.open>>>;
}

const nodeIntentFileSystem: MissionStartupIntentFileSystem = {
  open: (path, flags) => Fs.open(path, flags),
};

const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const sameFileIdentity = (
  left: Awaited<ReturnType<typeof Fs.lstat>>,
  right: Awaited<ReturnType<typeof Fs.lstat>>,
): boolean => left.dev === right.dev && left.ino === right.ino;

const syncDirectory = async (path: string): Promise<void> => {
  const handle = await Fs.open(path, FsConstants.O_RDONLY | (FsConstants.O_DIRECTORY ?? 0) | (FsConstants.O_NOFOLLOW ?? 0));
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const ensureIntentDirectory = async (commonDirectory: string, missionId: MissionId): Promise<string> => {
  if (!Path.isAbsolute(commonDirectory) || await Fs.realpath(commonDirectory) !== commonDirectory) {
    throw new Error("Mission startup recovery requires the canonical Git common directory");
  }
  const segments = ["kepler", "missions", missionId, "workspaces", "startup"];
  let current = commonDirectory;
  for (const segment of segments) {
    const next = Path.join(current, segment);
    let kind: "directory" | "missing" | "other" = "other";
    try {
      const stat = await Fs.lstat(next);
      kind = !stat.isSymbolicLink() && stat.isDirectory() ? "directory" : "other";
    } catch (error) {
      if (!isMissing(error)) throw error;
      kind = "missing";
    }
    if (kind === "missing") {
      try {
        await Fs.mkdir(next, 0o700);
      } catch (error) {
        if (!isMissing(error) && !(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) throw error;
      }
    }
    const stat = await Fs.lstat(next);
    if (stat.isSymbolicLink() || !stat.isDirectory() || await Fs.realpath(next) !== next) {
      throw new Error(`Mission startup recovery path is not a canonical directory: ${next}`);
    }
    current = next;
  }
  return current;
};

const locateIntentDirectory = async (commonDirectory: string, missionId: MissionId): Promise<string | undefined> => {
  if (!Path.isAbsolute(commonDirectory) || await Fs.realpath(commonDirectory) !== commonDirectory) {
    throw new Error("Mission startup recovery requires the canonical Git common directory");
  }
  let current = commonDirectory;
  for (const segment of ["kepler", "missions", missionId, "workspaces", "startup"]) {
    current = Path.join(current, segment);
    let stat: Awaited<ReturnType<typeof Fs.lstat>>;
    try {
      stat = await Fs.lstat(current);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || await Fs.realpath(current) !== current) {
      throw new Error(`Mission startup recovery path is not a canonical directory: ${current}`);
    }
  }
  return current;
};

const readHistorySources = async (
  recordHome: string,
  missionId: MissionId,
  fileSystem: UnitQueryFileSystem,
): Promise<HistoryJournalSource[]> => {
  const historyRoot = Path.join(recordHome, ".kepler", "missions", missionId, "history");
  const sources: HistoryJournalSource[] = [];
  for (const phase of await fileSystem.directories(historyRoot, recordHome)) {
    const phaseRoot = Path.join(historyRoot, phase);
    for (const journalId of await fileSystem.journals(phaseRoot, recordHome)) {
      sources.push({
        sourceId: `${missionId}/${phase}/${journalId}`,
        missionId,
        phase,
        journalId,
        bytes: await fileSystem.read(Path.join(phaseRoot, `${journalId}.jsonl`), recordHome),
      });
    }
  }
  return sources;
};

export const createNodeMissionStartupRecoveryRuntime = (
  workspace: MissionWorkspaceRuntime,
  fileSystem: UnitQueryFileSystem = createNodeUnitQueryFileSystem(),
  intentFileSystem: MissionStartupIntentFileSystem = nodeIntentFileSystem,
): MissionStartupRecovery => ({
  saveIntent: async (recordHome, commonDirectory, missionId, intent) => {
    if (intent.missionId !== missionId || intent.recordHomeRoot !== recordHome ||
        intent.recordHomeCommonDirectory !== commonDirectory) {
      throw new Error("Mission startup recovery intent does not match its selected storage identity");
    }
    const directory = await ensureIntentDirectory(commonDirectory, missionId);
    const path = Path.join(directory, "intent.json");
    const handle = await Fs.open(path, FsConstants.O_WRONLY | FsConstants.O_CREAT | FsConstants.O_EXCL | (FsConstants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(intent, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(directory);
    let current = directory;
    while (current !== commonDirectory) {
      current = Path.dirname(current);
      await syncDirectory(current);
    }
  },
  loadIntent: async (_recordHome, commonDirectory, missionId) => {
    const directory = await locateIntentDirectory(commonDirectory, missionId);
    if (!directory) return undefined;
    const path = Path.join(directory, "intent.json");
    let before: Awaited<ReturnType<typeof Fs.lstat>>;
    try {
      before = await Fs.lstat(path);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (before.isSymbolicLink() || !before.isFile() || await Fs.realpath(path) !== path) {
      throw new Error(`Mission startup recovery intent is not a regular canonical file: ${path}`);
    }
    const noFollow = FsConstants.O_NOFOLLOW;
    if (typeof noFollow !== "number" || noFollow === 0) {
      throw new Error("Mission startup recovery requires a no-follow file open for intent loading");
    }
    const handle = await intentFileSystem.open(path, FsConstants.O_RDONLY | noFollow);
    let contents: string;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || !sameFileIdentity(before, opened)) {
        throw new Error(`Mission startup recovery intent changed while opening: ${path}`);
      }
      const current = await Fs.lstat(path);
      if (current.isSymbolicLink() || !current.isFile() || !sameFileIdentity(opened, current) ||
          await Fs.realpath(path) !== path) {
        throw new Error(`Mission startup recovery intent path changed while opening: ${path}`);
      }
      contents = await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
    const parsed = parseStrictJson(contents);
    if (parsed.kind === "invalid") throw new Error(`Mission startup recovery intent is malformed: ${parsed.code} at ${parsed.pointer}`);
    return parsed.value;
  },
  readHistory: async (recordHome, missionId) =>
    collectHistory(missionId, await readHistorySources(recordHome, missionId, fileSystem), { completeness: "complete" }),
  acquireMission: async (commonDirectory, missionId) => {
    const resourceKey = createHash("sha256").update(`mission-startup\0${commonDirectory}\0${missionId}`).digest("hex");
    const acquired = await workspace.coordination.acquire({
      commonDirectory,
      location: { kind: "mission", missionId },
      resourceKey,
      owner: {
        machine_id: workspace.identity.machine_id,
        process_id: workspace.identity.process_id,
        process_incarnation_id: workspace.identity.process_incarnation_id,
        mission_id: missionId,
        resource_scope: "mission-startup",
      },
    });
    if (acquired.kind === "failed") return acquired;
    return { kind: "acquired", lease: acquired.lease };
  },
});
