import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";
import { createNodeMissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace-runtime.js";
import type { AuditJournalFactory } from "../../packages/cli/src/audit/context.js";
import type { ConstructionJournals } from "../../packages/cli/src/construction/journals.js";
import { createNodeHistoryAccess } from "../../packages/cli/src/history/access-runtime.js";
import { createHistoryControl, historyDigest, type HistoryInitializationManifest } from "../../packages/cli/src/history/control.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { historyTestBytes, historyTestEvent } from "./history-generation.js";

export const legacyFixtureJournals: ConstructionJournals = {
  create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: "construction" }),
};

export const selectedFixtureJournals = (generationId: string): ConstructionJournals => ({
  generationId,
  create: (recordHome, missionId, journalId) => createEventJournal({ recordHome, missionId, journalId, phase: "construction", generationId }),
});

export const selectedFixtureAuditJournals = (
  recordHome: string,
  missionId: string,
  historyVersion: string,
  generationId: string,
): AuditJournalFactory => ({
  create: (request) => {
    if (request.recordHome !== recordHome || request.missionId !== missionId || request.historyVersion !== historyVersion || request.generationId !== generationId || request.phase !== "construction") {
      throw new Error("The audit journal request does not match the selected fixture history.");
    }
    return createEventJournal({ recordHome, missionId, journalId: request.journalId, phase: "construction", generationId });
  },
});

export const selectFixtureHistory = async (
  recordHome: string,
  missionId: string,
  workspace: MissionWorkspaceRuntime = createNodeMissionWorkspaceRuntime({ cwd: recordHome }),
) => {
  const access = createNodeHistoryAccess(workspace);
  let view = await access.read(recordHome, missionId);
  if (view.mode === "legacy") {
    const creation = view.history.events.flatMap((fact) => fact.constructionEvent?.type === "construction.mission-created" ? [fact.constructionEvent] : [])[0];
    if (!creation || view.history.issues.length > 0) throw new Error("Selected-history fixtures require valid retained mission creation and phase bytes");
    const data = creation.data;
    const home = data.record_home;
    if (home === null || typeof home !== "object" || Array.isArray(home) || !("repository_id" in home) || typeof home.repository_id !== "string" || typeof data.request !== "string") throw new Error("Fixture creation has no exact repository and request binding");
    const generationId = randomUUID();
    const manifest: HistoryInitializationManifest = {
      format: "kepler.mission-history-initialization", version: 1, operation: "create",
      mission_binding: {
        record_home_repository_id: home.repository_id,
        mission_id: missionId,
        workflow: "standard",
        request_reference: data.request,
        unit_ids: [...new Set(view.history.events.flatMap((fact) => fact.constructionEvent?.type === "construction.unit-created" && typeof fact.constructionEvent.data.unit_id === "string" ? [fact.constructionEvent.data.unit_id] : []))].sort(),
      },
      generation_id: generationId, source_inventory: [], archive_id: null, guide: null, guide_hash: null,
      candidate_journals: view.sources.map((source) => ({ phase: "construction" as const, journal_id: source.journalId, byte_length: source.bytes.length, content_version: historyDigest(source.bytes), reference: `fixture:${generationId}/construction/${source.journalId}` })).sort((a, b) => a.journal_id.localeCompare(b.journal_id)),
      expected_state: historyState(view.history), source_retirement: [], requester: "Fixture requester",
      operation_authority: { kind: "startup-request", request_reference: data.request },
    };
    const control = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: creation.recorded_at, producer: creation.producer, manifest, decisionReference: data.request, causes: [creation.id] });
    const guard = historyTestEvent("construction.history-generation-required", { mission_id: missionId, generation_id: generationId, control_event_id: control.id }, randomUUID(), [control.id]);
    const historyRoot = `.kepler/missions/${missionId}/history`;
    const write = async (relative: string, bytes: Uint8Array) => access.storage.files.write({ root: recordHome, relative }, bytes, { kind: "create" });
    for (const source of view.sources) await write(`${historyRoot}/generations/${generationId}/construction/${source.journalId}.jsonl`, source.bytes);
    await write(`${historyRoot}/control/events/${control.journal_id}.jsonl`, historyTestBytes([control]));
    await write(`${historyRoot}/control/${guard.journal_id}.jsonl`, historyTestBytes([guard]));
    await write(`${historyRoot}/control/active.json`, historyTestBytes([control]));
    const legacyRoot = Path.join(recordHome, historyRoot, "construction");
    for (const source of view.sources) await Fs.rm(Path.join(legacyRoot, `${source.journalId}.jsonl`), { force: true });
    await Fs.rmdir(legacyRoot).catch((error: unknown) => { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; });
    view = await access.read(recordHome, missionId);
  }
  if (view.mode !== "active" || !view.generationId || !view.historyVersion) throw new Error("The fixture has no active history selection");
  const historyVersion = view.historyVersion;
  if (view.coordination !== "bound") view = await access.join({ recordHome, missionId, historyVersion }, async (selected, context) => {
    if (selected.historyVersion !== historyVersion || context.recordHome !== recordHome) throw new Error("Fixture ownership does not match its selected source");
  });
  const generationId = view.generationId!;
  return {
    access,
    generationId,
    historyVersion,
    journals: selectedFixtureJournals(generationId),
    auditJournals: selectedFixtureAuditJournals(recordHome, missionId, historyVersion, generationId),
  };
};
