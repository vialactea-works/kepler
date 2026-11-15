import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import { HistoryMutations } from "../../packages/cli/src/history/mutations.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { createHistoryRepository } from "../support/history-repository.js";
import { historyTestEvent } from "../support/history-generation.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await Fs.rm(root, { recursive: true, force: true });
});

describe("admitted generation journal effects", () => {
  it("writes and confirms the selected generation while recovery is excluded, then rejects a retired journal", async () => {
    const { parent, root, f, access } = await createHistoryRepository();
    roots.push(parent);
    const request = { recordHome: root, missionId: f.missionId, historyVersion: f.control.id };
    await access.join(request, async () => undefined);
    const mutations = new HistoryMutations(access);
    const journalId = randomUUID();
    const event = historyTestEvent("construction.interaction-recorded", {
      mission_id: f.missionId, unit_id: f.unitId, participants: ["Requester"], content: "Retained actual interaction", references: [],
    }, journalId, [f.unit.id]);
    let saved: EventJournal | undefined;
    await mutations.execute(request, async () => {
      saved = mutations.journals.create(root, f.missionId, journalId);
      await expect(access.withRecovery(root, f.missionId, async () => undefined)).rejects.toMatchObject({ code: "history_writers_active" });
      expect((await saved.append(event)).status).toBe("appended");
      expect((await saved.append(event)).status).toBe("duplicate");
      expect(saved.path).toBe(Path.join(root, ".kepler", "missions", f.missionId, "history", "generations", f.generationId, "construction", `${journalId}.jsonl`));
    });
    expect((await access.read(root, f.missionId)).history.events.map((fact) => fact.event?.id)).toContain(event.id);
    await expect(Fs.lstat(Path.join(root, ".kepler", "missions", f.missionId, "history", "construction", `${journalId}.jsonl`))).rejects.toMatchObject({ code: "ENOENT" });
    const retained = await Fs.readFile(saved!.path);
    await expect(saved!.append(event)).rejects.toMatchObject({ code: "history_mutation_required" });
    expect(await Fs.readFile(saved!.path)).toEqual(retained);
  });

  it("rejects an old explicit request without creating a writer or journal", async () => {
    const { parent, root, f, access } = await createHistoryRepository();
    roots.push(parent);
    await access.join({ recordHome: root, missionId: f.missionId, historyVersion: f.control.id }, async () => undefined);
    const mutations = new HistoryMutations(access);
    const before = historyInventory(await access.storage.snapshot(root, f.missionId));
    let effects = 0;
    await expect(mutations.execute({ recordHome: root, missionId: f.missionId, historyVersion: randomUUID() }, async () => { effects += 1; })).rejects.toMatchObject({ code: "history_version_mismatch" });
    expect(effects).toBe(0);
    expect(historyInventory(await access.storage.snapshot(root, f.missionId))).toEqual(before);
  });
});
