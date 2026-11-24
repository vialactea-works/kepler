import { HistoryAccess, parseLiveHistoryBinding, type HistoryPendingSource, type LiveHistoryBinding } from "./access.js";
import { HistoryArchives, type HistoryArchiveCatalog } from "./archives.js";
import { HistoryError, historyDigest, historyMode, parseHistoryControl, type HistoryControl, type HistoryDigest, type HistorySourceEntry } from "./control.js";
import type { HistorySnapshot } from "./files.js";
import type { MissionHistoryView } from "./gateway.js";
import { historyInventory } from "./storage.js";

export interface HistoryInspectionIssue {
  readonly code: string;
  readonly message: string;
  readonly reference: string | null;
}

export interface HistoryControlSummary {
  readonly event_id: string;
  readonly event_type: string;
  readonly generation_id: string;
  readonly mode: "active" | "recovering";
  readonly manifest_hash: HistoryDigest;
}

export interface HistoryInspection {
  readonly mission_id: string;
  readonly record_home: string;
  readonly generation_id: string | null;
  readonly history_version: string | null;
  readonly mode: MissionHistoryView["mode"] | null;
  readonly migration_required: boolean;
  readonly execution_started: false;
  readonly selection_status: "validated" | "legacy-readonly" | "blocked";
  readonly local_control: HistoryControlSummary | null;
  readonly shared_binding: LiveHistoryBinding | null;
  readonly control_receipts: readonly HistoryControlSummary[];
  readonly source_inventory: readonly HistorySourceEntry[];
  readonly unavailable_sources: HistorySnapshot["unavailable"];
  readonly pending_sources: readonly HistoryPendingSource[];
  readonly draft_source_count: number;
  readonly archives: readonly {
    readonly archive_id: string;
    readonly index_content_version: HistoryDigest | null;
    readonly verification: "verified" | "failed";
    readonly archive_inventory_hash: HistoryDigest | null;
    readonly source_count: number | null;
  }[];
  readonly issues: readonly HistoryInspectionIssue[];
  readonly remaining_work: readonly string[];
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const summarize = (control: HistoryControl): HistoryControlSummary => ({ event_id: control.id, event_type: control.type, generation_id: control.data.generation_id, mode: historyMode(control), manifest_hash: control.data.manifest_hash });
const issue = (error: unknown, reference: string | null): HistoryInspectionIssue => ({ code: error instanceof HistoryError ? error.code : "history_inspection_failed", message: error instanceof Error ? error.message : String(error), reference });

export const inspectMissionHistory = async (
  request: { readonly recordHome: string; readonly missionId: string },
  dependencies: { readonly access: HistoryAccess; readonly archives: HistoryArchives },
): Promise<HistoryInspection> => {
  const input = { recordHome: request.recordHome, missionId: request.missionId };
  const access = dependencies.access;
  const archives = dependencies.archives;
  const snapshot = await access.storage.snapshot(input.recordHome, input.missionId);
  const issues: HistoryInspectionIssue[] = [];
  const origin = snapshot.origins.find((candidate) => candidate.root === snapshot.recordHome);
  const activePath = `.kepler/missions/${input.missionId}/history/control/active.json`;
  const raw = snapshot.files.find((file) => file.origin === origin?.id && file.path === activePath);
  let localControl: HistoryControlSummary | null = null;
  if (raw) {
    try { localControl = summarize(parseHistoryControl(decoder.decode(raw.bytes))); } catch (error) { issues.push(issue(error, raw.sourceId)); }
  }
  const sharedPath = `kepler/missions/${input.missionId}/coordination/history-selection.json`;
  const shared = snapshot.files.find((file) => file.origin === "local-runtime" && file.path === sharedPath);
  let binding: LiveHistoryBinding | null = null;
  if (shared) {
    try { binding = parseLiveHistoryBinding(shared.bytes); } catch (error) { issues.push(issue(error, shared.sourceId)); }
  }
  let view: Awaited<ReturnType<HistoryAccess["read"]>> | undefined;
  try { view = await access.read(snapshot.recordHome, input.missionId); } catch (error) { issues.push(issue(error, raw?.sourceId ?? null)); }
  if (view?.historyVersion && view.historyVersion !== localControl?.event_id) {
    issues.push({ code: "history_inspection_changed", message: "The activation changed while raw inspection was collected. Repeat inspection before preparing a manifest.", reference: raw?.sourceId ?? null });
    view = undefined;
  }
  if (view) issues.push(...view.history.issues.map((finding) => ({ code: finding.code, message: finding.message, reference: finding.sourceId ?? null })));
  let catalog: HistoryArchiveCatalog = { archives: [], issues: [] };
  try { catalog = await archives.catalog(snapshot.recordHome, input.missionId); } catch (error) { issues.push(issue(error, `kepler/missions/${input.missionId}/recovery/archives`)); }
  issues.push(...catalog.issues.map((item) => ({ code: "history_archive_catalog_issue", message: item.message, reference: item.reference })));
  const archiveResults: HistoryInspection["archives"][number][] = [];
  for (const archive of catalog.archives) {
    try {
      const verified = await archives.verify(snapshot.recordHome, input.missionId, archive.archive_id);
      if (archive.index_content_version !== verified.index_content_version) throw new HistoryError("history_inspection_changed", "The archive index changed while its verification was collected.");
      archiveResults.push({ ...archive, verification: "verified", archive_inventory_hash: verified.archive_inventory_hash, source_count: verified.files.length });
    } catch (error) {
      archiveResults.push({ ...archive, verification: "failed", archive_inventory_hash: null, source_count: null });
      issues.push(issue(error, `local-archive:${archive.archive_id}`));
    }
  }
  const pendingPrefix = `kepler/missions/${input.missionId}/recovery/pending/`;
  const pending: readonly HistoryPendingSource[] = view?.pendingSources ?? [
    ...snapshot.files.filter((file) => file.origin === "local-runtime" && file.path.startsWith(pendingPrefix)).map((file): HistoryPendingSource => ({ source_id: file.sourceId, path: file.path, byte_length: file.bytes.length, content_version: historyDigest(file.bytes), status: "pending" })),
    ...snapshot.unavailable.filter((source) => source.path.startsWith(pendingPrefix)).map((source): HistoryPendingSource => ({ source_id: source.source_id, path: source.path, status: "pending" })),
  ];
  const remaining: string[] = [];
  if (!view) remaining.push("Resolve the reported selection or ownership failures before normal mission commands. Use a separately approved reset when needed.");
  if (view?.mode === "legacy") remaining.push("Preview and approve a healthy layout migration before ordinary writes. Use semantic recovery if the old history is invalid.");
  if (view?.mode === "recovering") remaining.push("Prepare and approve a complete reconstruction before publication. Recovery does not start its continuation operation.");
  if (pending.some((source) => source.status === "pending")) remaining.push("Reconcile retained operation instructions and complete only their exact missing steps. Do not replace their identities or bytes.");
  if (snapshot.unavailable.length) remaining.push("Preserve unreadable existing inputs or declare exact known losses for sources that are missing.");
  if (archiveResults.some((archive) => archive.verification === "failed")) remaining.push("Inspect the failed archive verification before relying on that archive as required evidence.");
  return {
    mission_id: input.missionId, record_home: snapshot.recordHome,
    generation_id: view?.generationId ?? null, history_version: view?.historyVersion ?? null, mode: view?.mode ?? null,
    migration_required: view?.mode === "legacy", execution_started: false,
    selection_status: !view ? "blocked" : view.mode === "legacy" ? "legacy-readonly" : "validated",
    local_control: localControl, shared_binding: binding, control_receipts: view?.controlReceipts.map(summarize) ?? [],
    source_inventory: historyInventory(snapshot), unavailable_sources: snapshot.unavailable,
    pending_sources: pending, draft_source_count: snapshot.files.filter((file) => file.origin === "local-runtime" && file.path.startsWith(`kepler/missions/${input.missionId}/recovery/drafts/`)).length,
    archives: archiveResults, issues, remaining_work: remaining,
  };
};
