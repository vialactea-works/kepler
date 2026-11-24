import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constructionJournalPath } from "../../packages/cli/src/construction/journals.js";
import { CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { HistoryMutations } from "../../packages/cli/src/history/mutations.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture } from "../support/history-generation.js";

const fixture = () => {
  const f = historyGenerationFixture();
  const h = historyAccessFixture(f);
  return { f, h, mutations: new HistoryMutations(h.access) };
};
const writers = (entries: ReadonlyMap<string, Uint8Array>) => [...entries.keys()].filter((key) => key.includes("/history-writers/"));

describe("version-bound mutation invocation", () => {
  it("requires a live admission and uses only its selected generation", async () => {
    const { f, h, mutations } = fixture();
    expect(() => mutations.journals.generationId).toThrowError(expect.objectContaining({ code: "history_mutation_required" }));
    expect(() => mutations.journals.create("/record", f.missionId, randomUUID())).toThrowError(expect.objectContaining({ code: "history_mutation_required" }));
    const journalId = randomUUID();
    const result = await mutations.execute(h.request, async () => {
      expect(writers(h.entries)).toHaveLength(1);
      const journal = mutations.journals.create("/record", f.missionId, journalId);
      expect(journal.path).toBe(`/record/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${journalId}.jsonl`);
      expect(constructionJournalPath(mutations.journals, "/record", f.missionId, journalId)).toBe(journal.path);
      return "completed invocation";
    });
    expect(result).toEqual({ value: "completed invocation", history: { mission_id: f.missionId, history_version: f.control.id, generation_id: f.generationId } });
    expect(writers(h.entries)).toEqual([]);
  });

  it("admits audit journals only for the exact live selected scope before journal effects", async () => {
    const { f, h, mutations } = fixture();
    const journalId = randomUUID();
    const request = {
      recordHome: "/record",
      missionId: f.missionId,
      historyVersion: f.control.id,
      generationId: f.generationId,
      journalId,
      phase: CONSTRUCTION_PHASE,
    };
    const selectedJournalFiles = () => [...h.entries.keys()].filter((key) => key.includes(`/history/generations/${f.generationId}/construction/`)).sort();
    let before: string[] = [];

    await mutations.execute(h.request, async () => {
      before = selectedJournalFiles();
      const invalidRequests = [
        { ...request, historyVersion: randomUUID() },
        { ...request, generationId: randomUUID() },
        { ...request, phase: "other" },
        { ...request, recordHome: "/foreign" },
        { ...request, missionId: randomUUID() },
      ];
      for (const invalid of invalidRequests) {
        expect(() => mutations.auditJournals.create(invalid)).toThrowError(expect.objectContaining({ code: "history_mutation_scope_mismatch" }));
      }
      expect(selectedJournalFiles()).toEqual(before);

      const journal = mutations.auditJournals.create(request);
      expect(journal.path).toBe(`/record/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${journalId}.jsonl`);
      expect(selectedJournalFiles()).toEqual(before);
    });

    const afterInvocation = selectedJournalFiles();
    expect(afterInvocation).toEqual(before);
    expect(() => mutations.auditJournals.create(request)).toThrowError(expect.objectContaining({ code: "history_mutation_required" }));
    expect(selectedJournalFiles()).toEqual(afterInvocation);
  });

  it.each([undefined, "short", "10000000-0000-4000-8000-000000000001"])("rejects missing or stale version %s before callback effects", async (historyVersion) => {
    const { h, mutations } = fixture();
    let effects = 0;
    await expect(mutations.execute({ ...h.request, historyVersion }, async () => { effects += 1; })).rejects.toMatchObject({ name: "HistoryError" });
    expect(effects).toBe(0);
    expect(writers(h.entries)).toEqual([]);
  });

  it("rejects foreign coordinates, nested invocation and cached journals after retirement", async () => {
    const { f, h, mutations } = fixture();
    let saved: EventJournal | undefined;
    await mutations.execute(h.request, async () => {
      expect(() => mutations.journals.create("/other", f.missionId, randomUUID())).toThrowError(expect.objectContaining({ code: "history_mutation_scope_mismatch" }));
      expect(() => mutations.journals.create("/record", randomUUID(), randomUUID())).toThrowError(expect.objectContaining({ code: "history_mutation_scope_mismatch" }));
      await expect(mutations.execute(h.request, async () => undefined)).rejects.toMatchObject({ code: "history_mutation_nested" });
      saved = mutations.journals.create("/record", f.missionId, randomUUID());
    });
    await expect(saved!.append({})).rejects.toMatchObject({ code: "history_mutation_required" });
    await mutations.execute(h.request, async () => {
      await expect(saved!.append({})).rejects.toMatchObject({ code: "history_mutation_scope_mismatch" });
    });
    expect(writers(h.entries)).toEqual([]);
  });

  it.each([undefined, null, 0, ""])("preserves callback failure %s and retires the context", async (failure) => {
    const { h, mutations } = fixture();
    await expect(mutations.execute(h.request, async () => { throw failure; })).rejects.toBe(failure);
    expect(writers(h.entries)).toEqual([]);
    expect(() => mutations.journals.generationId).toThrowError(expect.objectContaining({ code: "history_mutation_required" }));
  });

  it("checks the actual retained writer before a journal can have effects", async () => {
    const { f, h, mutations } = fixture();
    await mutations.execute(h.request, async () => {
      const journal = mutations.journals.create("/record", f.missionId, randomUUID());
      const [path] = writers(h.entries);
      const original = h.entries.get(path!)!;
      h.entries.set(path!, new TextEncoder().encode("replacement"));
      await expect(journal.append({})).rejects.toMatchObject({ code: "history_writer_lease_lost" });
      h.entries.set(path!, original);
    });
    expect(writers(h.entries)).toEqual([]);
  });

  it("keeps concurrent invocation contexts separate", async () => {
    const { f, h, mutations } = fixture();
    let releaseFirst!: () => void;
    let firstJournal!: EventJournal;
    const firstReady = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const first = mutations.execute(h.request, async () => {
      firstJournal = mutations.journals.create("/record", f.missionId, randomUUID());
      firstStarted();
      await firstReady;
    });
    await started;
    const second = await mutations.execute(h.request, async () => {
      expect(writers(h.entries)).toHaveLength(2);
      await expect(firstJournal.append({})).rejects.toMatchObject({ code: "history_mutation_scope_mismatch" });
      releaseFirst();
      return "second";
    });
    expect(second.value).toBe("second");
    await first;
    expect(writers(h.entries)).toEqual([]);
  });

  it("exposes truthful claim-release uncertainty instead of a successful invocation", async () => {
    const { h, mutations } = fixture();
    await expect(mutations.execute(h.request, async () => {
      h.entries.delete(writers(h.entries)[0]!);
      return "effects completed";
    })).rejects.toMatchObject({ code: "history_writer_release_failed", details: { effects_uncertain: true } });
    expect(() => mutations.journals.generationId).toThrowError(expect.objectContaining({ code: "history_mutation_required" }));
  });
});
