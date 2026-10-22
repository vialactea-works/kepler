import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { parseStrictJson } from "../json/strict-json.js";
import { scanJournalBytes } from "../history/journal.js";
import {
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type MissionId,
} from "./events.js";
import type {
  UnitCreateFailure,
  UnitCreateInspectionResult,
  UnitCreateRecords,
  UnitCreateDirectoryResult,
} from "./unit-create.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWithin = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const failure = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}): UnitCreateFailure => ({
  kind: "failed",
  code,
  message,
  details,
  recovery: "Keep existing records and inspect the affected record-home paths before retrying.",
});

const inspectDirectoryPath = async (path: string, root: string): Promise<boolean> => {
  const absolute = Path.resolve(path);
  if (!isWithin(root, absolute)) throw new Error(`Directory escapes the selected record home: ${path}`);
  let current = root;
  for (const segment of Path.relative(root, absolute).split(Path.sep).filter(Boolean)) {
    current = Path.join(current, segment);
    let metadata: Awaited<ReturnType<typeof Fs.lstat>>;
    try {
      metadata = await Fs.lstat(current);
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Expected a real directory at ${current}`);
    }
    const resolved = await Fs.realpath(current);
    if (!isWithin(root, resolved)) throw new Error(`Directory escapes the selected record home: ${current}`);
  }
  return true;
};

const listEntries = async (path: string, root: string): Promise<readonly import("node:fs").Dirent[]> => {
  if (!(await inspectDirectoryPath(path, root))) return [];
  const entries = await Fs.readdir(path, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) throw new Error(`Symbolic link found in record-home identity path: ${path}`);
  return entries;
};

const ensureDirectory = async (path: string, root: string): Promise<void> => {
  if (await inspectDirectoryPath(path, root)) return;
  try {
    await Fs.mkdir(path);
  } catch (error) {
    if (!isMissing(error) && !(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  if (!(await inspectDirectoryPath(path, root))) throw new Error(`Directory could not be prepared safely: ${path}`);
};

const readJournal = async (path: string, root: string): Promise<Uint8Array> => {
  const metadata = await Fs.lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Journal is not a regular file: ${path}`);
  const resolved = await Fs.realpath(path);
  if (!isWithin(root, resolved)) throw new Error(`Journal escapes the selected record home: ${path}`);
  return new Uint8Array(await Fs.readFile(resolved));
};

const collectJournalIdentities = async (
  recordHome: string,
  targetMissionId: MissionId,
): Promise<UnitCreateInspectionResult> => {
  const root = await Fs.realpath(recordHome);
  const missionsRoot = Path.join(root, ".kepler", "missions");
  const missionEntries = await listEntries(missionsRoot, root);
  const unitIds = new Set<string>();
  const matchingMissionFacts: { readonly id: string; readonly workflow: string }[] = [];
  let matchingPreparations = 0;

  const legacyUnits = Path.join(root, ".kepler", "units-of-work");
  for (const entry of await listEntries(legacyUnits, root)) unitIds.add(entry.name);

  for (const missionEntry of missionEntries.filter((entry) => entry.isDirectory())) {
    const missionId = missionEntry.name;
    const missionRoot = Path.join(missionsRoot, missionId);
    const unitRoot = Path.join(missionRoot, "construction", "units-of-work");
    for (const entry of await listEntries(unitRoot, root)) unitIds.add(entry.name);

    const historyRoot = Path.join(missionRoot, "history");
    const phaseEntries = await listEntries(historyRoot, root);
    for (const phaseEntry of phaseEntries.filter((entry) => entry.isDirectory())) {
      const phase = phaseEntry.name;
      const phaseRoot = Path.join(historyRoot, phase);
      const journals = (await listEntries(phaseRoot, root)).filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
      for (const file of journals) {
        const journalId = file.name.slice(0, -6);
        const bytes = await readJournal(Path.join(phaseRoot, file.name), root);
        const scan = scanJournalBytes(bytes);
        if (scan.problems.length > 0) {
          throw new Error(`History contains an incomplete or damaged journal: ${Path.join(phaseRoot, file.name)}`);
        }
        for (const line of scan.lines) {
          if (line.raw === undefined) throw new Error(`History contains an unreadable journal record: ${journalId}`);
          const parsed = parseStrictJson(line.raw);
          if (parsed.kind === "invalid") throw new Error(`History contains invalid strict JSON: ${journalId}`);
          const event = parsed.value;
          if (!isRecord(event) || !isRecord(event.data)) continue;
          const data = event.data;
          if (typeof data.unit_id === "string") unitIds.add(data.unit_id);
          if (missionId === targetMissionId && phase === CONSTRUCTION_PHASE &&
            event.type === "construction.mission-workspaces-prepared" && data.mission_id === targetMissionId) {
            const validation = validateConstructionEvent(event);
            if (validation.status !== "valid" || validation.event.journal_id !== journalId || validation.event.phase !== phase) {
              throw new Error(`Mission workspace preparation history is invalid or does not match its source: ${journalId}`);
            }
            matchingPreparations += 1;
            continue;
          }
          if (missionId !== targetMissionId || phase !== CONSTRUCTION_PHASE ||
            event.type !== "construction.mission-created" || data.mission_id !== targetMissionId) continue;
          const workflow = typeof data.workflow === "string" ? data.workflow : "unknown";
          if (workflow !== "standard") {
            matchingMissionFacts.push({ id: targetMissionId, workflow });
            continue;
          }
          const validation = validateConstructionEvent(event);
          if (validation.status !== "valid" || validation.event.journal_id !== journalId ||
            validation.event.phase !== phase) {
            throw new Error(`Mission creation history is invalid or does not match its source: ${journalId}`);
          }
          matchingMissionFacts.push({ id: targetMissionId, workflow });
        }
      }
    }
  }

  if (matchingMissionFacts.length > 1 || matchingPreparations > 1) {
    return failure("mission_history_uncertain", "The selected mission has conflicting creation or preparation facts.", {
      mission_id: targetMissionId,
      creation_facts: matchingMissionFacts.length,
      preparation_facts: matchingPreparations,
    });
  }
  return {
    kind: "inspected",
    ...(matchingMissionFacts[0] ? { mission: { ...matchingMissionFacts[0], prepared: matchingPreparations === 1 } } : {}),
    unitIds: [...unitIds],
  };
};

export const createNodeUnitCreateRecords = (): UnitCreateRecords => ({
  inspect: async (recordHome, missionId) => collectJournalIdentities(recordHome, missionId),
  createDirectory: async (recordHome, missionId, unitId): Promise<UnitCreateDirectoryResult> => {
    const root = await Fs.realpath(recordHome);
    const missionRoot = Path.join(root, ".kepler", "missions", missionId);
    if (!(await inspectDirectoryPath(missionRoot, root))) {
      return failure("unit_directory_invalid", "The selected mission directory is missing from its record home.", {
        mission_id: missionId,
      });
    }
    const constructionRoot = Path.join(missionRoot, "construction");
    await ensureDirectory(constructionRoot, root);
    const parent = Path.join(constructionRoot, "units-of-work");
    await ensureDirectory(parent, root);
    const destination = Path.join(parent, unitId);
    try {
      await Fs.mkdir(destination);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") return { kind: "exists" };
      throw error;
    }
    const metadata = await Fs.lstat(destination);
    const resolvedDestination = await Fs.realpath(destination);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || !isWithin(root, resolvedDestination)) {
      return failure("unit_directory_invalid", "The created unit path is not a local directory under its record home.", {
        unit_id: unitId,
      });
    }
    return { kind: "created" };
  },
});

export const machineLocalDate = (now = new Date()): string =>
  `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
