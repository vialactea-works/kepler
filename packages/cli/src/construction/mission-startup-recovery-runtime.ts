import { missionStartupResourceKey } from "./mission-startup-resource.js";
import { constants as FsConstants } from "node:fs";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { parseStrictJson } from "../json/strict-json.js";
import { createNodeHistoryAccess } from "../history/access-runtime.js";
import { createNodeReconstructionChecks } from "../history/reconstruction-runtime.js";
import { HistoryError, historyDigest } from "../history/control.js";
import { verifyStageCheckpointSet } from "./stage-checkpoint-content.js";
import { captureStageCheckpoints } from "./stage-start.js";
import { createEventJournal } from "../history/journal.js";
import { publishMissionStartupHistory, readMissionStartupHistory } from "../history/startup.js";
import type { MissionStartupHistoryJournalFactory, MissionStartupHistoryView } from "../history/startup.js";
import type { MissionId } from "./events.js";
import type { MissionStartupRecovery } from "./mission-startup.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";

export interface MissionStartupIntentFileSystem {
  readonly open: (path: string, flags: number) => Promise<Awaited<ReturnType<typeof Fs.open>>>;
}

export type MissionStartupGenerationJournalFactory = MissionStartupHistoryJournalFactory;

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

const startupHistoryView = (view: Awaited<ReturnType<ReturnType<typeof createNodeHistoryAccess>["read"]>>): MissionStartupHistoryView => ({
  mode: view.mode,
  ...(view.generationId ? { generationId: view.generationId } : {}),
  ...(view.historyVersion ? { historyVersion: view.historyVersion } : {}),
  pendingRecovery: view.pendingRecovery,
  history: view.history,
  coordination: view.coordination,
  ...(view.selectionHash ? { selectionHash: view.selectionHash } : {}),
});

export const createNodeMissionStartupRecoveryRuntime = (
  workspace: MissionWorkspaceRuntime,
  intentFileSystem: MissionStartupIntentFileSystem = nodeIntentFileSystem,
  journalFactory: MissionStartupGenerationJournalFactory = ({ recordHome, missionId, journalId, generationId }) => createEventJournal({
    recordHome,
    missionId,
    phase: "construction",
    journalId,
    generationId,
  }),
): MissionStartupRecovery => {
  const access = createNodeHistoryAccess(workspace);
  return {
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
  readHistory: async (recordHome, missionId) => startupHistoryView(await access.read(recordHome, missionId)),
  joinHistory: async (recordHome, missionId, input, verifyHistory) => {
    const selection = Object.freeze({ historyVersion: input.historyVersion, transferOriginIds: Object.freeze([...input.transferOriginIds]) });
    const checks = createNodeReconstructionChecks(access, { recordHome, missionId }, workspace);
    const joined = await access.join({ recordHome, missionId, ...selection }, async (view, context) => {
      if (view.mode !== "active" || view.historyVersion !== selection.historyVersion || view.pendingRecovery || !view.control) {
        throw new HistoryError("history_join_selection_invalid", "Only the exact active, unblocked selected history can be joined.", {
          expected_history_version: selection.historyVersion,
          actual_history_version: view.historyVersion ?? null,
          mode: view.mode,
          pending_recovery: view.pendingRecovery,
        });
      }
      if (!view.history.sourceSetComplete || view.history.issues.length > 0 ||
          view.history.events.some((event) => event.status !== "valid" || !event.event || !event.constructionEvent)) {
        throw new HistoryError("mission_history_not_recoverable", "The selected history is incomplete or contains invalid current facts.", {
          mission_id: missionId,
          issues: view.history.issues,
        });
      }
      await verifyHistory(structuredClone(startupHistoryView(view)));
      const captured = await captureStageCheckpoints({ workspace }, { missionId, history: view.history }, context.commonDirectory);
      if (captured.kind === "failed") throw new HistoryError(captured.code, captured.message, captured.details);
      const manifest = view.control.data.manifest;
      const required = manifest.format === "kepler.mission-history-rebuild"
        ? manifest.required_material
        : undefined;
      for (const material of [...(required?.artifact_bindings ?? []), ...(required?.evidence ?? [])]) {
        const actual = await checks.readMaterial(material.reference, undefined, view.history);
        if (actual.reference !== material.reference || actual.bytes.length === 0 ||
            actual.content_version !== material.content_version || historyDigest(actual.bytes) !== material.content_version) {
          throw new HistoryError("history_material_changed", "Required selected-history material is missing or differs from its exact published content hash.", {
            reference: material.reference,
            expected_content_version: material.content_version,
            actual_content_version: actual.content_version,
          });
        }
      }
      for (const checkpoint of required?.checkpoints ?? []) {
        const root = captured.repositoryRoots.find((repository) => repository.repository_id === checkpoint.repository_id);
        if (!root || (await verifyStageCheckpointSet({ git: workspace.git }, [root], [checkpoint])).kind !== "valid") {
          throw new HistoryError("history_checkpoint_unavailable", "A required selected-history commit is unavailable from its actual prepared repository.", {
            repository_id: checkpoint.repository_id,
            commit: checkpoint.commit,
          });
        }
      }
    });
    return startupHistoryView(joined);
  },
  withStartup: (recordHome, missionId, lease, operation) => access.withStartup(recordHome, missionId, lease, async (scope) => {
    let retained: { readonly intent: Parameters<typeof publishMissionStartupHistory>[2]; readonly preparedEvent: Parameters<typeof publishMissionStartupHistory>[4] } | undefined;
    return operation({
      read: async () => retained
        ? await readMissionStartupHistory(access, scope, retained.intent, retained.preparedEvent, journalFactory)
        : startupHistoryView(await access.read(recordHome, missionId)),
      createJournal: (journalId, generationId) => journalFactory({ recordHome, missionId, journalId, generationId }),
      initialize: async (intent, createdEvent, preparedEvent) => {
        retained = { intent, preparedEvent };
        return publishMissionStartupHistory(access, scope, intent, createdEvent, preparedEvent, journalFactory);
      },
    });
  }),
  acquireMission: async (commonDirectory, missionId) => {
    const resourceKey = missionStartupResourceKey(commonDirectory, missionId);
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
  };
};
