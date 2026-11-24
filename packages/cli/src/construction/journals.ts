import * as Path from "node:path";
import type { EventJournal } from "../history/journal.js";
import { CONSTRUCTION_PHASE } from "./events.js";

export interface ConstructionJournals {
  readonly generationId?: string;
  readonly create: (recordHome: string, missionId: string, journalId: string) => EventJournal;
}

export const constructionJournalPath = (
  journals: Pick<ConstructionJournals, "generationId">,
  recordHome: string,
  missionId: string,
  journalId: string,
): string => {
  const generationId = journals.generationId;
  return Path.join(
    recordHome,
    ".kepler",
    "missions",
    missionId,
    "history",
    ...(generationId === undefined ? [] : ["generations", generationId]),
    CONSTRUCTION_PHASE,
    `${journalId}.jsonl`,
  );
};
