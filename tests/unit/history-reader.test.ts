import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createHistoryControl } from "../../packages/cli/src/history/control.js";
import { historyReaderMetadata, knownHistoryUnitIds, unavailableHistoryMetadata, type HistoryReaderMetadata, type SelectedHistoryReader } from "../../packages/cli/src/history/reader.js";
import { selectMissionHistory, type MissionHistoryView } from "../../packages/cli/src/history/gateway.js";
import { historyGenerationFixture } from "../support/history-generation.js";

describe("selected history reader contracts", () => {
  it("projects legacy, active, recovering, pending and unavailable metadata", async () => {
    const fixture = historyGenerationFixture();
    const active = selectMissionHistory(fixture.input);
    const legacy = selectMissionHistory({
      ...fixture.input,
      activation: null,
      controlJournals: [],
      guardJournals: [],
      generationSources: [],
      generationEvidence: false,
      pendingRecovery: false,
    });
    const recovering: MissionHistoryView = { ...active, mode: "recovering", pendingRecovery: false };
    const pending: MissionHistoryView = { ...active, pendingRecovery: true };
    const reader: SelectedHistoryReader = { read: async () => active };
    const selectedMetadata: HistoryReaderMetadata = historyReaderMetadata(await reader.read("/record", fixture.missionId));

    expect(historyReaderMetadata(legacy)).toMatchObject({ mode: "legacy", migration_required: true, history_version: null, generation_id: null, pending_recovery: false });
    expect(selectedMetadata).toMatchObject({ mode: "active", migration_required: false, history_version: fixture.control.id, generation_id: fixture.generationId, pending_recovery: false });
    expect(historyReaderMetadata(recovering)).toMatchObject({ mode: "recovering", migration_required: false, pending_recovery: false });
    expect(historyReaderMetadata(pending)).toMatchObject({ mode: "active", pending_recovery: true });
    expect(unavailableHistoryMetadata()).toEqual({
      mode: "unavailable",
      history_version: null,
      generation_id: null,
      pending_recovery: null,
      migration_required: null,
      control_receipts: [],
      control_receipts_truncated: false,
    });
  });

  it("bounds control receipts and reports truncation", () => {
    const fixture = historyGenerationFixture();
    const view: MissionHistoryView = { ...selectMissionHistory(fixture.input), controlReceipts: Array.from({ length: 10 }, () => fixture.control) };
    const metadata = historyReaderMetadata(view);

    expect(metadata.control_receipts).toHaveLength(8);
    expect(metadata.control_receipts[0]).toEqual({
      id: fixture.control.id,
      type: fixture.control.type,
      generation_id: fixture.generationId,
    });
    expect(metadata.control_receipts_truncated).toBe(true);
  });

  it("returns only current manifest unit identities and ignores prior receipt units", () => {
    const fixture = historyGenerationFixture();
    const excludedUnitId = "2026-11-13-excluded";
    const previousManifest = {
      ...fixture.manifest,
      generation_id: randomUUID(),
      mission_binding: { ...fixture.manifest.mission_binding, unit_ids: [fixture.unitId, excludedUnitId] },
    };
    const previousReceipt = createHistoryControl({
      id: randomUUID(),
      journalId: randomUUID(),
      recordedAt: "2026-11-13T00:00:02Z",
      producer: { name: "kepler-test", version: "3.1.0" },
      manifest: previousManifest,
      decisionReference: fixture.manifest.mission_binding.request_reference,
      causes: [fixture.creation.id],
    });
    const selected: MissionHistoryView = {
      ...selectMissionHistory(fixture.input),
      controlReceipts: [previousReceipt],
    };

    expect(knownHistoryUnitIds(selected)).toEqual([fixture.unitId]);
    expect(knownHistoryUnitIds(selected)).not.toContain(excludedUnitId);
  });
});
