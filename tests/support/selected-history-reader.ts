import * as Path from "node:path";
import type { HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import { selectMissionHistory } from "../../packages/cli/src/history/gateway.js";
import type { SelectedHistoryReader } from "../../packages/cli/src/history/reader.js";

export interface LegacyHistoryFixtureFileSystem {
  readonly directories: (path: string, root: string) => Promise<readonly string[]>;
  readonly journals?: (path: string, root: string) => Promise<readonly string[]>;
  readonly files?: (path: string, root: string) => Promise<readonly string[]>;
  readonly read: (path: string, root: string) => Promise<Uint8Array>;
}

export const createLegacyHistoryFixtureReader = (fileSystem: LegacyHistoryFixtureFileSystem): SelectedHistoryReader => ({
  read: async (recordHome, missionId) => {
    const historyRoot = Path.join(recordHome, ".kepler", "missions", missionId, "history");
    const phases = await fileSystem.directories(historyRoot, recordHome);
    if (phases.some((phase) => phase === "control" || phase === "generations")) throw new Error("Reserved history paths require the production selected-history reader.");
    const sources: HistoryJournalSource[] = [];
    for (const phase of phases) {
      const phaseRoot = Path.join(historyRoot, phase);
      const journalIds = fileSystem.journals
        ? await fileSystem.journals(phaseRoot, recordHome)
        : fileSystem.files
          ? await fileSystem.files(phaseRoot, recordHome)
          : [];
      if (!fileSystem.journals && !fileSystem.files) throw new Error("The legacy fixture reader requires a journal listing adapter.");
      for (const journalId of journalIds) {
        sources.push({
          sourceId: `fixture-legacy/${missionId}/${phase}/${journalId}`,
          missionId,
          phase,
          journalId,
          bytes: await fileSystem.read(Path.join(phaseRoot, `${journalId}.jsonl`), recordHome),
        });
      }
    }
    return selectMissionHistory({
      missionId,
      activation: null,
      controlJournals: [],
      guardJournals: [],
      generationSources: [],
      legacySources: sources,
      generationEvidence: false,
      complete: true,
      pendingRecovery: false,
    });
  },
});
