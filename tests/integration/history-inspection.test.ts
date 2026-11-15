import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { inspectMissionHistory } from "../../packages/cli/src/history/inspection.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createHistoryRepository } from "../support/history-repository.js";

const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0)) {
    await Fs.rm(path, { recursive: true, force: true });
    await expect(Fs.lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

describe("real read-only history inspection", () => {
  it.each([false, true])("reports raw inputs without creating private ownership state, damaged selector: %s", async (damaged) => {
    const { root, parent, f, access } = await createHistoryRepository();
    roots.push(parent);
    if (damaged) await Fs.writeFile(Path.join(root, ".kepler", "missions", f.missionId, "history", "control", "active.json"), Uint8Array.from([255, 123]));
    const before = historyInventory(await access.storage.snapshot(root, f.missionId));
    const report = await inspectMissionHistory({ recordHome: root, missionId: f.missionId }, { access, archives: new HistoryArchives(access.storage) });
    expect(report.selection_status).toBe(damaged ? "blocked" : "validated");
    expect(report.source_inventory).toEqual(before);
    expect(report.execution_started).toBe(false);
    expect(historyInventory(await access.storage.snapshot(root, f.missionId))).toEqual(before);
    await expect(Fs.lstat(Path.join(root, ".git", "kepler"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
