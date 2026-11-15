import { describe, expect, it } from "vitest";
import { historyDigest, type HistoryDigest, type HistorySourceEntry } from "../../packages/cli/src/history/control.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex, type HistoryArchiveIndex } from "../../packages/cli/src/history/archive-index.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";

const digest = historyDigest("archive-index-fixture");
const inventory: readonly HistorySourceEntry[] = [
  { source_id: "file-control-active", origin: "record-home", path: ".kepler/missions/10000000-0000-4000-8000-000000000001/history/control/active.json", byte_length: 19, content_version: digest },
  { source_id: "file-control-events", origin: "record-home", path: ".kepler/missions/10000000-0000-4000-8000-000000000001/history/control/events/10000000-0000-4000-8000-000000000002.jsonl", byte_length: 23, content_version: digest },
];
const index: HistoryArchiveIndex = {
  format: "kepler.mission-history-archive",
  version: 1,
  mission_id: "10000000-0000-4000-8000-000000000001",
  archive_id: "10000000-0000-4000-8000-000000000003",
  manifest_hash: digest as HistoryDigest,
  source_inventory: inventory,
  previous_archives: [
    { archive_id: "10000000-0000-4000-8000-000000000004", index_content_version: null },
    { archive_id: "10000000-0000-4000-8000-000000000005", index_content_version: digest },
  ],
};

describe("history archive index", () => {
  it("parses the closed complete inventory and hashes canonical JSON without a newline", () => {
    expect(parseHistoryArchiveIndex(index)).toEqual(index);
    expect(parseHistoryArchiveIndex(canonicalJson(index))).toEqual(index);
    expect(historyArchiveIndexDigest(index)).toBe(historyDigest(canonicalJson(index)));
    expect(historyArchiveIndexDigest(index)).not.toBe(historyDigest(`${canonicalJson(index)}\n`));
  });

  it("rejects duplicate JSON keys, unknown properties, and unsafe source paths", () => {
    expect(() => parseHistoryArchiveIndex('{"format":"kepler.mission-history-archive","format":"other"}')).toThrow();
    expect(() => parseHistoryArchiveIndex({ ...index, unexpected: true })).toThrow();
    expect(() => parseHistoryArchiveIndex({ ...index, source_inventory: [{ ...inventory[0]!, path: "../outside" }, inventory[1]] })).toThrow();
  });

  it("requires sorted unique file and predecessor identities while allowing repeated origins", () => {
    const reversed = [...inventory].reverse();
    expect(() => parseHistoryArchiveIndex({ ...index, source_inventory: reversed })).toThrow();
    expect(() => parseHistoryArchiveIndex({ ...index, source_inventory: [inventory[0], { ...inventory[1]!, source_id: inventory[0]!.source_id }] })).toThrow();
    expect(() => parseHistoryArchiveIndex({ ...index, previous_archives: [...index.previous_archives].reverse() })).toThrow();
    expect(() => parseHistoryArchiveIndex({ ...index, previous_archives: [{ archive_id: index.archive_id, index_content_version: null }] })).toThrow();
    expect(parseHistoryArchiveIndex(index).source_inventory.map((entry) => entry.origin)).toEqual(["record-home", "record-home"]);
  });
});
