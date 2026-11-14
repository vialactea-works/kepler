import type { MissionHistoryView } from "./gateway.js";

export interface SelectedHistoryReader {
  readonly read: (recordHome: string, missionId: string) => Promise<MissionHistoryView>;
}

export interface HistoryControlReceiptMetadata {
  readonly id: string;
  readonly type: string;
  readonly generation_id: string;
}

export interface HistoryReaderMetadata {
  readonly mode: MissionHistoryView["mode"] | "unavailable";
  readonly history_version: string | null;
  readonly generation_id: string | null;
  readonly pending_recovery: boolean | null;
  readonly migration_required: boolean | null;
  readonly control_receipts: readonly HistoryControlReceiptMetadata[];
  readonly control_receipts_truncated: boolean;
}

const receiptLimit = 8;

export const historyReaderMetadata = (view: MissionHistoryView): HistoryReaderMetadata => ({
  mode: view.mode,
  history_version: view.historyVersion ?? null,
  generation_id: view.generationId ?? null,
  pending_recovery: view.pendingRecovery,
  migration_required: view.mode === "legacy",
  control_receipts: view.controlReceipts.slice(0, receiptLimit).map((receipt) => ({
    id: receipt.id,
    type: receipt.type,
    generation_id: receipt.data.generation_id,
  })),
  control_receipts_truncated: view.controlReceipts.length > receiptLimit,
});

export const unavailableHistoryMetadata = (): HistoryReaderMetadata => ({
  mode: "unavailable",
  history_version: null,
  generation_id: null,
  pending_recovery: null,
  migration_required: null,
  control_receipts: [],
  control_receipts_truncated: false,
});

export const knownHistoryUnitIds = (view: MissionHistoryView): readonly string[] => {
  const manifest = view.control?.data.manifest;
  if (!manifest || !("mission_binding" in manifest)) return [];
  const ids = manifest.mission_binding.unit_ids;
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
};
