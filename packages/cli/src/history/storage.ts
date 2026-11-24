import { parseLiveHistoryBinding } from "./binding.js";
import { HistoryError, historyDigest, parseHistoryControl, type HistorySourceEntry } from "./control.js";
import type { HistoryJournalSource } from "./collection.js";
import type { HistoryFiles, HistoryLocation, HistoryOrigin, HistoryRepositories, HistoryRepositoryContext, HistorySnapshot, HistorySnapshotFile } from "./files.js";
import { selectHistoryControl, selectMissionHistory, type HistoryControlJournal, type HistoryControlSelection, type HistoryGatewayInput, type HistoryGenerationSource, type MissionHistoryView } from "./gateway.js";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, index) => byte === b[index]);
const missionPath = (missionId: string): string => `.kepler/missions/${missionId}`;
const validateMission = (missionId: string): void => { if (!uuid.test(missionId)) throw new HistoryError("history_scope_invalid", "History requires the full lowercase mission UUIDv4."); };
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export const historyInventory = (snapshot: HistorySnapshot): readonly HistorySourceEntry[] => snapshot.files.map((file) => ({ source_id: file.sourceId, origin: file.origin, path: file.path, byte_length: file.bytes.length, content_version: historyDigest(file.bytes) })).sort((a, b) => compare(a.source_id, b.source_id) || compare(a.path, b.path));

export interface HistoryReadOptions {
  readonly sharedHistoryVersion?: string;
  readonly pendingRecovery?: boolean;
  readonly originIds?: ReadonlySet<string>;
  readonly includeCurrentOrigin?: boolean;
}

export class HistoryStorage {
  public constructor(public readonly files: HistoryFiles, public readonly repositories: HistoryRepositories) {}

  public async snapshot(recordHome: string, missionId: string): Promise<HistorySnapshot> {
    validateMission(missionId);
    const context = await this.repositories.resolve(recordHome);
    const origins: HistoryOrigin[] = [...context.origins, { id: "local-runtime", label: "private local runtime", root: context.commonDirectory }];
    const files: HistorySnapshotFile[] = [];
    const unavailable: HistorySnapshot["unavailable"][number][] = context.unavailableOrigins.map((origin) => ({ source_id: `${origin.id}:${missionPath(missionId)}`, path: missionPath(missionId), kind: origin.kind, reason: origin.reason }));
    const read = async (origin: HistoryOrigin, relative: string): Promise<void> => {
      const sourceId = `${origin.id}:${relative}`;
      try {
        const bytes = await this.files.read({ root: origin.root, relative });
        if (bytes === undefined) unavailable.push({ source_id: sourceId, path: relative, kind: "missing", reason: "An enumerated source disappeared during inspection." });
        else files.push({ sourceId, origin: origin.id, path: relative, bytes });
      } catch (error) { unavailable.push({ source_id: sourceId, path: relative, kind: "unreadable", reason: error instanceof Error ? error.message : String(error) }); }
    };
    const walk = async (origin: HistoryOrigin, relative: string): Promise<void> => {
      if (origin.id === "local-runtime" && relative === `kepler/missions/${missionId}/recovery/archives`) return;
      try {
        for (const entry of await this.files.list({ root: origin.root, relative })) {
          const path = `${relative}/${entry.name}`;
          if (entry.kind === "directory") await walk(origin, path);
          else if (entry.kind === "file") await read(origin, path);
          else unavailable.push({ source_id: `${origin.id}:${path}`, path, kind: "unsafe", reason: "Preservation cannot follow a symbolic link or special filesystem object." });
        }
      } catch (error) { unavailable.push({ source_id: `${origin.id}:${relative}`, path: relative, kind: "unreadable", reason: error instanceof Error ? error.message : String(error) }); }
    };
    for (const origin of context.origins) await walk(origin, missionPath(missionId));
    const runtime = origins.find((origin) => origin.id === "local-runtime")!;
    const localBase = `kepler/missions/${missionId}`;
    await walk(runtime, localBase);
    const bindingPath = `${localBase}/coordination/history-selection.json`;
    const rawBinding = files.find((file) => file.sourceId === `local-runtime:${bindingPath}`);
    let boundOrigins = new Set<string>();
    try {
      const binding = rawBinding ? parseLiveHistoryBinding(rawBinding.bytes) : undefined;
      if (binding?.mission_id === missionId) boundOrigins = new Set(binding.origins);
    } catch { boundOrigins = new Set(); }
    const activePath = `${missionPath(missionId)}/history/control/active.json`;
    for (const origin of context.origins) {
      if (!boundOrigins.has(origin.id)) continue;
      const missions = await this.files.list({ root: origin.root, relative: ".kepler/missions" }).catch(() => undefined);
      if (!missions) continue;
      const mission = missions.find((entry) => entry.name === missionId);
      if (!mission) {
        unavailable.push({ source_id: `${origin.id}:${missionPath(missionId)}`, path: missionPath(missionId), kind: "missing", reason: "The bound working copy is missing its mission directory." });
        continue;
      }
      if (mission.kind !== "directory") continue;
      const sourceId = `${origin.id}:${activePath}`;
      if (files.some((file) => file.sourceId === sourceId) || unavailable.some((source) => source.source_id === sourceId)) continue;
      const unavailableAncestor = unavailable.some((source) => source.source_id.startsWith(`${origin.id}:`) && source.kind !== "missing" && (source.path === activePath || activePath.startsWith(`${source.path}/`)));
      if (!unavailableAncestor) unavailable.push({ source_id: sourceId, path: activePath, kind: "missing", reason: "The bound working copy is missing its active history selection." });
    }
    return { recordHome: context.recordHome, commonDirectory: context.commonDirectory, missionId, origins, files: files.sort((a, b) => compare(a.sourceId, b.sourceId)), unavailable: unavailable.sort((a, b) => compare(a.source_id, b.source_id)) };
  }

  public async selection(recordHome: string, missionId: string, options: HistoryReadOptions = {}): Promise<HistoryControlSelection> {
    return selectHistoryControl((await this.header(recordHome, missionId, options)).header);
  }

  public async input(recordHome: string, missionId: string, options: HistoryReadOptions = {}): Promise<HistoryGatewayInput> {
    const { context, historyRoot, header } = await this.header(recordHome, missionId, options);
    const activation = header.activation;
    const generationSources: HistoryGenerationSource[] = [];
    const legacySources: HistoryJournalSource[] = [];
    const selection = selectHistoryControl(header);
    const selected = selection.control;
    if (selected && selection.mode === "active") {
      for (const origin of context.origins) {
        if (origin.root === context.recordHome ? options.includeCurrentOrigin === false : options.originIds && !options.originIds.has(origin.id)) continue;
        const peer = origin.root === context.recordHome ? activation : await this.files.read({ root: origin.root, relative: `${historyRoot}/control/active.json` }).catch(() => undefined);
        if (!peer) {
          if (options.originIds?.has(origin.id)) throw new HistoryError("history_source_incomplete", "A registered current working copy has no readable activation record.", { origin: origin.id });
          continue;
        }
        if (!equal(peer, activation!)) {
          let peerControl: ReturnType<typeof parseHistoryControl> | undefined;
          try { peerControl = parseHistoryControl(utf8.decode(peer)); } catch { peerControl = undefined; }
          if (peerControl?.id === selected.id) throw new HistoryError("history_control_conflict", "Known working copies contain contradictory bytes for one active control identity.");
          if (options.originIds?.has(origin.id)) throw new HistoryError("history_stale_checkout", "A registered current working copy has another or damaged history selection.", { origin: origin.id });
          continue;
        }
        if (origin.root !== context.recordHome) selectHistoryControl({ ...header, activation: peer, controlJournals: await this.controlJournals({ root: origin.root, relative: `${historyRoot}/control/events` }), guardJournals: await this.controlJournals({ root: origin.root, relative: `${historyRoot}/control` }) });
        generationSources.push(...(await this.phaseJournals(origin, missionId, `${historyRoot}/generations/${selected.data.generation_id}`, selected.data.generation_id)).map((source) => ({ ...source, generationId: selected!.data.generation_id })));
      }
    } else if (selection.mode === "legacy") {
      for (const origin of context.origins) legacySources.push(...await this.phaseJournals(origin, missionId, historyRoot));
    }
    return { ...header, generationSources, legacySources };
  }

  public async read(recordHome: string, missionId: string, options: HistoryReadOptions = {}): Promise<MissionHistoryView> {
    return selectMissionHistory(await this.input(recordHome, missionId, options));
  }

  public async context(recordHome: string): Promise<HistoryRepositoryContext> { return this.repositories.resolve(recordHome); }

  private async header(recordHome: string, missionId: string, options: HistoryReadOptions): Promise<{ readonly context: HistoryRepositoryContext; readonly historyRoot: string; readonly header: HistoryGatewayInput }> {
    validateMission(missionId);
    const context = await this.repositories.resolve(recordHome);
    const historyRoot = `${missionPath(missionId)}/history`;
    const activation = await this.files.read({ root: context.recordHome, relative: `${historyRoot}/control/active.json` }) ?? null;
    const localEntries = await this.files.list({ root: context.recordHome, relative: historyRoot });
    let generationEvidence = localEntries.some((entry) => ["control", "generations"].includes(entry.name));
    const controlJournals = await this.controlJournals({ root: context.recordHome, relative: `${historyRoot}/control/events` });
    const guardJournals = await this.controlJournals({ root: context.recordHome, relative: `${historyRoot}/control` });
    const originIds = new Set(context.origins.map((origin) => origin.id));
    let complete = options.originIds === undefined ? context.unavailableOrigins.length === 0 : [...options.originIds].every((id) => originIds.has(id));
    if (!activation) {
      for (const origin of context.origins) {
        try {
          const peerEntries = origin.root === context.recordHome ? localEntries : await this.files.list({ root: origin.root, relative: historyRoot });
          if (peerEntries.some((entry) => ["control", "generations"].includes(entry.name))) generationEvidence = true;
        } catch { complete = false; }
      }
    }
    return { context, historyRoot, header: { missionId, activation, controlJournals, guardJournals, generationSources: [], legacySources: [], generationEvidence, complete, pendingRecovery: options.pendingRecovery ?? false, ...(options.sharedHistoryVersion ? { sharedHistoryVersion: options.sharedHistoryVersion } : {}) } };
  }

  private async controlJournals(location: HistoryLocation): Promise<HistoryControlJournal[]> {
    const result: HistoryControlJournal[] = [];
    for (const entry of await this.files.list(location)) {
      if (entry.kind !== "file" || !entry.name.endsWith(".jsonl")) continue;
      const bytes = await this.files.read({ root: location.root, relative: `${location.relative}/${entry.name}` }).catch(() => undefined);
      if (bytes !== undefined) result.push({ journalId: entry.name.slice(0, -6), bytes });
    }
    return result;
  }

  private async phaseJournals(origin: HistoryOrigin, missionId: string, relative: string, generationId?: string): Promise<HistoryJournalSource[]> {
    const result: HistoryJournalSource[] = [];
    for (const phase of await this.files.list({ root: origin.root, relative })) {
      if (["control", "generations"].includes(phase.name)) continue;
      if (phase.kind !== "directory") throw new HistoryError("history_source_invalid", "The selected history contains an unexpected phase entry.", { path: `${relative}/${phase.name}` });
      for (const entry of await this.files.list({ root: origin.root, relative: `${relative}/${phase.name}` })) {
        if (entry.kind !== "file" || !entry.name.endsWith(".jsonl")) throw new HistoryError("history_source_invalid", "The selected history contains an unknown journal entry.", { path: `${relative}/${phase.name}/${entry.name}` });
        const path = `${relative}/${phase.name}/${entry.name}`;
        const bytes = await this.files.read({ root: origin.root, relative: path });
        if (bytes === undefined) throw new HistoryError("history_source_incomplete", "A selected journal disappeared during collection.", { path });
        result.push({ sourceId: `${origin.id}:${path}`, missionId, phase: phase.name, journalId: entry.name.slice(0, -6), ...(generationId ? { generationId } : {}), bytes });
      }
    }
    return result;
  }
}
