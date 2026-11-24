import type { HistoryDirectoryEntry, HistoryFiles, HistoryRepositories, HistoryRepositoryContext } from "../../packages/cli/src/history/files.js";
import { HistoryStorage } from "../../packages/cli/src/history/storage.js";
import { historyTestBytes, type historyGenerationFixture } from "./history-generation.js";

export const memoryHistoryStorage = (entries: ReadonlyMap<string, Uint8Array>, overrides: Partial<HistoryFiles> = {}, context: HistoryRepositoryContext = {
  recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }], unavailableOrigins: [],
}) => {
  const repositories: HistoryRepositories = { resolve: async () => context };
  const unexpected = async (): Promise<never> => { throw new Error("Read-only history storage attempted a mutation"); };
  const files: HistoryFiles = {
    read: async (location) => {
      const bytes = entries.get(`${location.root}/${location.relative}`);
      return bytes === undefined ? undefined : new Uint8Array(bytes);
    },
    list: async (location) => {
      const prefix = `${location.root}/${location.relative}/`;
      const children = new Map<string, HistoryDirectoryEntry>();
      for (const key of entries.keys()) {
        if (!key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        const name = suffix.split("/")[0]!;
        children.set(name, { name, kind: suffix.includes("/") ? "directory" : "file" });
      }
      return [...children.values()];
    },
    write: unexpected, remove: unexpected, removeEmptyDirectory: unexpected,
    ...overrides,
  };
  return new HistoryStorage(files, repositories);
};

export const historyStorageEntries = (f: ReturnType<typeof historyGenerationFixture>, root = "/record"): Map<string, Uint8Array> => {
  const prefix = `${root}/.kepler/missions/${f.missionId}/history`;
  return new Map([
    [`${prefix}/control/active.json`, f.input.activation!],
    [`${prefix}/control/events/${f.control.journal_id}.jsonl`, f.input.activation!],
    [`${prefix}/control/${f.guard.journal_id}.jsonl`, historyTestBytes([f.guard])],
    [`${prefix}/generations/${f.generationId}/construction/${f.journalId}.jsonl`, f.source.bytes],
  ]);
};
