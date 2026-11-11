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
  UnitCreateKnownPath,
  UnitCreateRecordedFact,
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

const knownPathKind = (entry: import("node:fs").Dirent): UnitCreateKnownPath["pathKind"] => {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return "other";
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
  recordHomes: readonly string[],
  selectedRecordHome: string,
  targetMissionId: MissionId,
): Promise<UnitCreateInspectionResult> => {
  const selectedRoot = await Fs.realpath(selectedRecordHome);
  const roots = new Set<string>([selectedRoot]);
  for (const recordHome of recordHomes) roots.add(await Fs.realpath(recordHome));
  const unitIds = new Set<string>();
  const unitPaths: UnitCreateKnownPath[] = [];
  const unitFacts: UnitCreateRecordedFact[] = [];
  const matchingMissionFacts: { readonly id: string; readonly workflow: string }[] = [];
  let matchingPreparations = 0;

  for (const root of roots) {
    const selected = root === selectedRoot;
    const missionsRoot = Path.join(root, ".kepler", "missions");
    const missionEntries = await listEntries(missionsRoot, root);
    const legacyUnits = Path.join(root, ".kepler", "units-of-work");
    for (const entry of await listEntries(legacyUnits, root)) {
      unitIds.add(entry.name);
      unitPaths.push({
        unitId: entry.name,
        recordHome: root,
        directory: `units-of-work/${entry.name}`,
        pathKind: knownPathKind(entry),
      });
    }

    for (const missionEntry of missionEntries.filter((entry) => entry.isDirectory())) {
      const missionId = missionEntry.name;
      const missionRoot = Path.join(missionsRoot, missionId);
      const unitRoot = Path.join(missionRoot, "construction", "units-of-work");
      for (const entry of await listEntries(unitRoot, root)) {
        unitIds.add(entry.name);
        unitPaths.push({
          unitId: entry.name,
          missionId,
          recordHome: root,
          directory: `construction/units-of-work/${entry.name}`,
          pathKind: knownPathKind(entry),
        });
      }

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

            if (phase === CONSTRUCTION_PHASE && event.type === "construction.unit-created") {
              const validation = validateConstructionEvent(event);
              if (validation.status !== "valid" || validation.event.journal_id !== journalId || validation.event.phase !== phase) {
                throw new Error(`Unit creation history is invalid or does not match its source: ${journalId}`);
              }
              const fact = validation.event.data;
              if (!isRecord(fact) || typeof fact.unit_id !== "string" || typeof fact.mission_id !== "string" ||
                typeof fact.directory !== "string" || typeof fact.workflow !== "string" || !isRecord(fact.initial_effort)) {
                throw new Error(`Validated unit creation history has an unreadable payload: ${journalId}`);
              }
              if (fact.mission_id !== missionId || fact.directory !== `construction/units-of-work/${fact.unit_id}`) {
                throw new Error(`Unit creation history does not match its mission or canonical directory: ${journalId}`);
              }
              const effort = fact.initial_effort;
              if (typeof effort.default !== "string" || typeof effort.selected_by !== "string" || !isRecord(effort.stage_overrides)) {
                throw new Error(`Validated unit creation history has unreadable effort: ${journalId}`);
              }
              const stageOverrides: Record<string, string> = {};
              for (const [stage, level] of Object.entries(effort.stage_overrides)) {
                if (typeof level !== "string") throw new Error(`Validated unit creation history has unreadable effort: ${journalId}`);
                stageOverrides[stage] = level;
              }
              unitFacts.push({
                unitId: fact.unit_id,
                missionId: fact.mission_id,
                recordHome: root,
                directory: fact.directory,
                workflow: fact.workflow,
                effort: {
                  default: effort.default,
                  stageOverrides,
                  selectedBy: effort.selected_by,
                },
                journalId,
                eventId: validation.event.id,
              });
            }

            if (!selected || missionId !== targetMissionId || phase !== CONSTRUCTION_PHASE) continue;
            if (event.type === "construction.mission-workspaces-prepared" && data.mission_id === targetMissionId) {
              const validation = validateConstructionEvent(event);
              if (validation.status !== "valid" || validation.event.journal_id !== journalId || validation.event.phase !== phase) {
                throw new Error(`Mission workspace preparation history is invalid or does not match its source: ${journalId}`);
              }
              matchingPreparations += 1;
              continue;
            }
            if (event.type !== "construction.mission-created" || data.mission_id !== targetMissionId) continue;
            const validation = validateConstructionEvent(event);
            if (validation.status !== "valid" || validation.event.journal_id !== journalId || validation.event.phase !== phase) {
              throw new Error(`Mission creation history is invalid or does not match its source: ${journalId}`);
            }
            const fact = validation.event.data;
            if (!isRecord(fact) || typeof fact.workflow !== "string") {
              throw new Error(`Validated mission creation history has an unreadable workflow: ${journalId}`);
            }
            matchingMissionFacts.push({ id: targetMissionId, workflow: fact.workflow });
          }
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
    unitPaths,
    unitFacts,
  };
};

export const createNodeUnitCreateRecords = (): UnitCreateRecords => ({
  inspect: async (recordHomes, selectedRecordHome, missionId) => collectJournalIdentities(recordHomes, selectedRecordHome, missionId),
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
