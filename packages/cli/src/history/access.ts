import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { MissionCoordination, MissionCoordinationLease } from "../construction/mission-coordination.js";
import type { MissionWorkspaceIdentity } from "../construction/mission-workspace.js";
import { missionStartupResourceKey } from "../construction/mission-startup-resource.js";
import { parseStrictJson } from "../json/strict-json.js";
import { parseLiveHistoryBinding, type LiveHistoryBinding, type SettledHistoryJournal, type SettledHistorySource } from "./binding.js";
import { assertHistoryVersion, HistoryError, historyDigest, parseHistoryControl, type HistoryControl, type HistoryDigest, type HistorySourceEntry } from "./control.js";
import type { HistoryLocation, HistoryRepositoryContext, HistorySnapshot } from "./files.js";
import { selectMissionHistory, type HistoryGatewayInput, type HistoryGenerationSource, type MissionHistoryView } from "./gateway.js";
import { canonicalJson } from "./journal.js";
import { HistoryStorage } from "./storage.js";

export { parseLiveHistoryBinding };
export type { LiveHistoryBinding, SettledHistoryJournal, SettledHistorySource };

export interface HistoryPendingSource {
  readonly source_id: string;
  readonly path: string;
  readonly content_version?: HistoryDigest;
  readonly byte_length?: number;
  readonly status: "pending" | "superseded";
}

export interface CoordinatedHistory extends MissionHistoryView {
  readonly coordination: "bound" | "unbound" | "unjoined";
  readonly selectionHash?: HistoryDigest;
  readonly pendingSources: readonly HistoryPendingSource[];
}

export interface HistoryMutationRequest {
  readonly recordHome: string;
  readonly missionId: string;
  readonly historyVersion?: string;
}

export interface HistoryJoinRequest extends HistoryMutationRequest {
  readonly transferOriginIds?: readonly string[];
}

export interface HistoryWriterLease {
  readonly view: CoordinatedHistory;
  readonly reference: string;
  readonly assertHeld: () => Promise<void>;
  readonly release: () => Promise<void>;
}

export interface HistoryExclusiveScope {
  readonly kind: "recovery" | "startup";
  readonly context: HistoryRepositoryContext;
  readonly missionId: string;
  readonly ownSources: readonly HistorySourceEntry[];
}

export interface HistoryAccessRuntime {
  readonly coordination: MissionCoordination;
  readonly identity: MissionWorkspaceIdentity;
  readonly next: () => string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalJson(value)}\n`);
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const prefix = (shorter: Uint8Array, longer: Uint8Array): boolean => shorter.length <= longer.length && shorter.every((byte, index) => byte === longer[index]);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const base = (missionId: string): string => `kepler/missions/${missionId}`;
const bindingLocation = (context: HistoryRepositoryContext, missionId: string): HistoryLocation => ({ root: context.commonDirectory, relative: `${base(missionId)}/coordination/history-selection.json` });
const currentOrigin = (context: HistoryRepositoryContext): string => {
  const origin = context.origins.find((item) => item.root === context.recordHome);
  if (!origin) throw new HistoryError("history_origin_missing", "The selected record home has no verified local origin.");
  return origin.id;
};
const validateMission = (missionId: string): void => { if (!uuid.test(missionId)) throw new HistoryError("history_scope_invalid", "History coordination requires a full lowercase mission UUIDv4."); };
const immutableContext = (context: HistoryRepositoryContext): HistoryRepositoryContext => Object.freeze({ ...context, origins: Object.freeze(context.origins.map((origin) => Object.freeze({ ...origin }))), unavailableOrigins: Object.freeze(context.unavailableOrigins.map((origin) => Object.freeze({ ...origin }))) });
const sameContext = (left: HistoryRepositoryContext, right: HistoryRepositoryContext): boolean => canonicalJson(left) === canonicalJson(right);
const sourceOwner = (source: HistoryGenerationSource, origins: readonly string[]): string => {
  const owner = [...origins].sort((left, right) => right.length - left.length).find((origin) => source.sourceId.startsWith(`${origin}:`));
  if (!owner) throw new HistoryError("history_source_invalid", "A selected journal has no exact current origin identity.", { source_id: source.sourceId });
  return owner;
};
const sourceSnapshot = (sources: readonly HistoryGenerationSource[]): readonly Readonly<Record<string, unknown>>[] => sources.map((source) => ({ source_id: source.sourceId, phase: source.phase, journal_id: source.journalId, generation_id: source.generationId, byte_length: source.bytes.length, content_version: historyDigest(source.bytes) })).sort((left, right) => compare(String(left.source_id), String(right.source_id)));
const equalBytes = (left: Uint8Array | undefined, right: Uint8Array | undefined): boolean => left === undefined ? right === undefined : right !== undefined && left.length === right.length && left.every((byte, index) => byte === right[index]);

export const historyAdmissionResourceKey = (commonDirectory: string, missionId: string): string => createHash("sha256").update(`mission-history-admission\0${commonDirectory}\0${missionId}`).digest("hex");

export class HistoryAccess {
  private readonly exclusiveScopes = new WeakSet<HistoryExclusiveScope>();
  private readonly exclusiveInputs = new WeakMap<HistoryExclusiveScope, readonly HistorySourceEntry[]>();

  public constructor(public readonly storage: HistoryStorage, private readonly runtime: HistoryAccessRuntime) {}

  public async read(recordHome: string, missionId: string): Promise<CoordinatedHistory> {
    validateMission(missionId);
    const context = await this.storage.context(recordHome);
    const raw = await this.storage.files.read(bindingLocation(context, missionId));
    const binding = raw ? parseLiveHistoryBinding(raw) : undefined;
    if (binding && binding.mission_id !== missionId) throw new HistoryError("history_scope_invalid", "The shared binding belongs to another mission.");
    const origin = currentOrigin(context);
    const view = await this.storage.read(context.recordHome, missionId, binding ? { sharedHistoryVersion: binding.history_version, originIds: new Set(binding.origins), includeCurrentOrigin: binding.origins.includes(origin) } : { originIds: new Set([origin]) });
    const activation = view.control ? await this.storage.files.read({ root: context.recordHome, relative: `.kepler/missions/${missionId}/history/control/active.json` }) : undefined;
    if (view.control && (!activation || canonicalJson(parseHistoryControl(utf8.decode(activation))) !== canonicalJson(view.control))) throw new HistoryError("history_selection_changed", "The history selection changed while its shared binding was checked.");
    const selectionHash = activation ? historyDigest(activation) : undefined;
    if (binding && (binding.generation_id !== view.generationId || binding.selection_hash !== selectionHash)) throw new HistoryError("history_binding_conflict", "The shared binding does not match the exact selected control bytes.");
    const pendingSources = await this.pending(context, view);
    return { ...view, coordination: !binding ? "unbound" : binding.origins.includes(origin) ? "bound" : "unjoined", ...(selectionHash ? { selectionHash } : {}), pendingSources, pendingRecovery: pendingSources.some((item) => item.status === "pending") };
  }

  public async snapshot(scope: HistoryExclusiveScope): Promise<HistorySnapshot> {
    const owned = await this.assertScope(scope);
    const snapshot = await this.storage.snapshot(scope.context.recordHome, scope.missionId);
    await this.assertScope(scope);
    if (snapshot.recordHome !== scope.context.recordHome || snapshot.commonDirectory !== scope.context.commonDirectory) throw new HistoryError("history_ownership_changed", "The fenced snapshot belongs to a changed physical repository context.");
    for (const source of owned) {
      const file = snapshot.files.find((item) => item.sourceId === source.source_id && item.origin === source.origin && item.path === source.path);
      if (!file || file.bytes.length !== source.byte_length || historyDigest(file.bytes) !== source.content_version) throw new HistoryError("history_ownership_changed", "A held claim changed while the fenced input inventory was collected.");
    }
    return { ...snapshot, files: snapshot.files.filter((file) => !owned.some((source) => source.source_id === file.sourceId && source.origin === file.origin && source.path === file.path)) };
  }

  public async beginMutation(input: HistoryMutationRequest): Promise<HistoryWriterLease> {
    const request = Object.freeze({ recordHome: input.recordHome, missionId: input.missionId, historyVersion: input.historyVersion });
    if (request.historyVersion !== undefined && !uuid.test(request.historyVersion)) throw new HistoryError("history_version_invalid", "The mutation requires a full lowercase control-event UUIDv4.");
    const before = await this.read(request.recordHome, request.missionId);
    this.assertMutation(before, request.historyVersion);
    const context = await this.storage.context(request.recordHome);
    const commonDirectory = context.commonDirectory;
    const selectedRoot = context.recordHome;
    const origin = currentOrigin(context);
    const admission = await this.acquire(context, request.missionId, "ordinary-admission");
    let writer: HistoryWriterLease | undefined;
    let failure: { readonly error: unknown } | undefined;
    try {
      const view = await this.read(context.recordHome, request.missionId);
      this.assertMutation(view, request.historyVersion);
      const confirmed = await this.storage.context(selectedRoot);
      if (confirmed.commonDirectory !== commonDirectory || confirmed.recordHome !== selectedRoot || currentOrigin(confirmed) !== origin) throw new HistoryError("history_selection_changed", "The repository identity changed before writer admission.");
      const token = this.runtime.next();
      if (!uuid.test(token)) throw new HistoryError("history_identity_invalid", "The writer identity source did not return a fresh UUIDv4.");
      const bindingTarget = bindingLocation(confirmed, request.missionId);
      const retainedBinding = await this.storage.files.read(bindingTarget);
      if (!retainedBinding) throw new HistoryError("history_binding_required", "Writer admission requires the exact shared history binding.");
      const parsedBinding = parseLiveHistoryBinding(retainedBinding);
      if (parsedBinding.history_version !== view.historyVersion || parsedBinding.generation_id !== view.generationId || parsedBinding.selection_hash !== view.selectionHash) throw new HistoryError("history_selection_changed", "The shared binding changed before writer admission.");
      if (parsedBinding.settled_sources) {
        const { settled_sources: _settledSources, ...unsettledBinding } = parsedBinding;
        await this.storage.files.write(bindingTarget, bytes(unsettledBinding), { kind: "replace", expected: historyDigest(retainedBinding) });
      }
      const location = { root: commonDirectory, relative: `${base(request.missionId)}/coordination/history-writers/${token}.json` };
      const contents = bytes({ format: "kepler.mission-history-writer", version: 1, mission_id: request.missionId, history_version: view.historyVersion, generation_id: view.generationId, origin_id: origin, token, owner: this.runtime.identity });
      const output = await this.storage.files.write(location, contents, { kind: "create" });
      if (output.status !== "created") throw new HistoryError("history_writer_identity_reused", "An ordinary writer cannot adopt an existing writer identity.");
      let released = false;
      const generationId = view.generationId;
      const selectionHash = view.selectionHash;
      writer = { view, reference: location.relative, assertHeld: async () => {
        if (released) throw new HistoryError("history_writer_lease_lost", "The writer claim has already been released.", { reference: location.relative });
        const retained = await this.storage.files.read(location);
        if (!retained || historyDigest(retained) !== historyDigest(contents)) throw new HistoryError("history_writer_lease_lost", "The writer claim no longer contains its owner's exact bytes.", { reference: location.relative });
        const physical = await this.storage.context(selectedRoot);
        if (physical.commonDirectory !== commonDirectory || physical.recordHome !== selectedRoot || currentOrigin(physical) !== origin) throw new HistoryError("history_ownership_changed", "The writer's physical repository context changed after admission.");
        const current = await this.read(selectedRoot, request.missionId);
        this.assertMutation(current, request.historyVersion);
        if (current.generationId !== generationId || current.selectionHash !== selectionHash) throw new HistoryError("history_selection_changed", "The writer's selected generation changed after admission.");
        if (released) throw new HistoryError("history_writer_lease_lost", "The writer claim was released while its ownership was checked.", { reference: location.relative });
      }, release: async () => {
        if (released) return;
        const result = await this.storage.files.remove(location, historyDigest(contents));
        if (result !== "removed") throw new HistoryError("history_writer_lease_lost", "The writer claim disappeared before its owner released it.", { reference: location.relative });
        released = true;
      } };
    } catch (error) { failure = { error }; }
    await this.releaseAdmission(admission, failure, writer?.reference);
    if (failure) throw failure.error;
    if (!writer) throw new HistoryError("history_writer_unconfirmed", "The history writer has no confirmed admission.");
    return writer;
  }

  public async withMutation<T>(request: HistoryMutationRequest, operation: (view: CoordinatedHistory, writer: HistoryWriterLease) => Promise<T>): Promise<T> {
    const writer = await this.beginMutation(request);
    let value: T | undefined;
    let failure: { readonly error: unknown } | undefined;
    try { value = await operation(writer.view, writer); } catch (error) { failure = { error }; }
    try { await writer.release(); } catch (error) {
      throw new HistoryError("history_writer_release_failed", "The mutation ended, but its history writer claim could not be released.", { reference: writer.reference, operation_callback: failure ? "threw" : "returned", operation_error: failure ? message(failure.error) : null, release_error: message(error), effects_uncertain: true });
    }
    if (failure) throw failure.error;
    return value as T;
  }

  public async join(input: HistoryJoinRequest, verifyOwnership: (view: CoordinatedHistory, context: HistoryRepositoryContext) => Promise<void>): Promise<CoordinatedHistory> {
    const requestedTransfers = input.transferOriginIds === undefined ? [] : input.transferOriginIds;
    if (!Array.isArray(requestedTransfers) || requestedTransfers.some((origin) => typeof origin !== "string" || !origin.trim() || origin.trim() !== origin) || new Set(requestedTransfers).size !== requestedTransfers.length) throw new HistoryError("history_transfer_invalid", "Origin transfer requires unique exact prior origin IDs.");
    const transferOriginIds = [...requestedTransfers].sort(compare);
    const request = Object.freeze({ recordHome: input.recordHome, missionId: input.missionId, historyVersion: input.historyVersion });
    const context = await this.storage.context(request.recordHome);
    const target = bindingLocation(context, request.missionId);
    const initialRaw = await this.storage.files.read(target);
    const initialBinding = initialRaw ? parseLiveHistoryBinding(initialRaw) : undefined;
    const before = await this.joinSnapshot(context, request.missionId, initialBinding, transferOriginIds);
    assertHistoryVersion(before.view.control, request.historyVersion);
    if (before.view.pendingRecovery) throw new HistoryError("history_recovery_pending", "Finish or supersede the retained recovery intent before joining this history.");
    const admission = await this.acquire(context, request.missionId, "join");
    let failure: { readonly error: unknown } | undefined;
    try {
      const lockedContext = await this.storage.context(request.recordHome);
      if (!sameContext(context, lockedContext)) throw new HistoryError("history_selection_changed", "The physical repository scope changed before join admission.");
      const raw = await this.storage.files.read(target);
      if (!equalBytes(raw, initialRaw)) throw new HistoryError("history_selection_changed", "The shared binding changed before join admission.");
      const existing = raw ? parseLiveHistoryBinding(raw) : undefined;
      const state = await this.joinSnapshot(lockedContext, request.missionId, existing, transferOriginIds);
      assertHistoryVersion(state.view.control, request.historyVersion);
      if (state.view.pendingRecovery) throw new HistoryError("history_recovery_pending", "Recovery became pending before this working copy could join.");
      const writersBefore = await this.writerEntries(lockedContext, request.missionId);
      if (transferOriginIds.length) {
        if (writersBefore.length) throw new HistoryError("history_writers_active", "Origin transfer requires no registered, partial, or unrecognized writer entries.");
        this.assertTransferSources(existing!, transferOriginIds, state.origin, lockedContext, state.input);
      } else this.assertIncomingFacts(state.view, state.origin, state.input);
      const observedSources = canonicalJson(sourceSnapshot(state.input.generationSources));
      await verifyOwnership(Object.freeze(structuredClone(state.view)), immutableContext(lockedContext));
      const confirmed = await this.storage.context(request.recordHome);
      if (!sameContext(lockedContext, confirmed)) throw new HistoryError("history_selection_changed", "Ownership verification changed the physical repository scope.");
      const confirmedRaw = await this.storage.files.read(target);
      if (!equalBytes(confirmedRaw, raw)) throw new HistoryError("history_selection_changed", "Ownership verification changed the shared history binding.");
      const after = await this.joinSnapshot(confirmed, request.missionId, existing, transferOriginIds);
      assertHistoryVersion(after.view.control, request.historyVersion);
      if (after.view.pendingRecovery) throw new HistoryError("history_recovery_pending", "Recovery became pending during ownership verification.");
      if (canonicalJson(sourceSnapshot(after.input.generationSources)) !== observedSources) throw new HistoryError("history_selection_changed", "A selected source changed during ownership verification.");
      if (transferOriginIds.length) this.assertTransferSources(existing!, transferOriginIds, after.origin, confirmed, after.input);
      else this.assertIncomingFacts(after.view, after.origin, after.input);
      const writersAfter = await this.writerEntries(confirmed, request.missionId);
      if (transferOriginIds.length && writersAfter.length) throw new HistoryError("history_writers_active", "An ordinary or unrecognized writer appeared before origin transfer publication.");
      const activation = await this.storage.files.read({ root: confirmed.recordHome, relative: `.kepler/missions/${request.missionId}/history/control/active.json` });
      if (!activation || historyDigest(activation) !== after.view.selectionHash) throw new HistoryError("history_selection_changed", "The selected activation changed before join publication.");
      const replaced = new Set(transferOriginIds);
      const origins = [...new Set([...(existing?.origins ?? []).filter((origin) => !replaced.has(origin)), after.origin])].sort(compare);
      const binding: LiveHistoryBinding = {
        format: "kepler.mission-history-binding", version: 1, mission_id: request.missionId,
        generation_id: after.view.generationId!, history_version: after.view.historyVersion!, selection_hash: after.view.selectionHash!, origins,
        ...(writersBefore.length === 0 && writersAfter.length === 0 ? { settled_sources: this.settledInventory(origins, after.input.generationSources, confirmed.origins.map((origin) => origin.id)) } : {}),
      };
      await this.storage.files.write(target, bytes(binding), { kind: "replace", expected: raw ? historyDigest(raw) : null });
    } catch (error) { failure = { error }; }
    await this.releaseAdmission(admission, failure);
    if (failure) throw failure.error;
    return this.read(context.recordHome, request.missionId);
  }

  private async joinSnapshot(context: HistoryRepositoryContext, missionId: string, binding: LiveHistoryBinding | undefined, transferOriginIds: readonly string[]): Promise<{ readonly view: CoordinatedHistory; readonly input: HistoryGatewayInput; readonly origin: string }> {
    const origin = currentOrigin(context);
    this.assertTransferOrigins(context, binding, origin, transferOriginIds);
    const selectedOrigins = new Set([...(binding?.origins ?? []).filter((id) => !transferOriginIds.includes(id)), origin]);
    const input = await this.storage.input(context.recordHome, missionId, { ...(binding ? { sharedHistoryVersion: binding.history_version } : {}), originIds: selectedOrigins, includeCurrentOrigin: true });
    const selected = selectMissionHistory(input);
    if (binding && (binding.mission_id !== missionId || selected.historyVersion !== binding.history_version || selected.generationId !== binding.generation_id || !input.activation || historyDigest(input.activation) !== binding.selection_hash)) throw new HistoryError("history_binding_conflict", "The selected control does not match the exact shared binding.");
    let view: CoordinatedHistory;
    if (transferOriginIds.length) {
      const pendingSources = await this.pending(context, selected);
      view = { ...selected, coordination: binding!.origins.includes(origin) ? "bound" : "unjoined", selectionHash: historyDigest(input.activation!), pendingSources, pendingRecovery: pendingSources.some((source) => source.status === "pending") };
    } else {
      view = await this.read(context.recordHome, missionId);
      if (view.historyVersion !== selected.historyVersion || view.generationId !== selected.generationId || view.selectionHash !== (input.activation ? historyDigest(input.activation) : undefined)) throw new HistoryError("history_selection_changed", "The selected history changed while its join inputs were read.");
      this.assertIncomingFacts(view, origin, input);
    }
    return { view, input, origin };
  }

  private assertTransferOrigins(context: HistoryRepositoryContext, binding: LiveHistoryBinding | undefined, origin: string, transferOriginIds: readonly string[]): void {
    if (!transferOriginIds.length) return;
    if (!binding) throw new HistoryError("history_transfer_invalid", "Origin transfer requires an existing shared binding.");
    if (!binding.settled_sources) throw new HistoryError("history_transfer_unproven", "The existing seven-field binding has no complete settled source inventory.");
    if (transferOriginIds.includes(origin) || transferOriginIds.some((id) => !binding.origins.includes(id))) throw new HistoryError("history_transfer_invalid", "Transfer IDs must name prior bound origins other than the current record home.");
    const available = new Set(context.origins.map((candidate) => candidate.id));
    const missing = binding.origins.filter((id) => !available.has(id)).sort(compare);
    const unsafe = context.unavailableOrigins.filter((item) => binding.origins.includes(item.id) && item.kind !== "missing");
    if (unsafe.length) throw new HistoryError("history_transfer_unsafe_origin", "Unreadable or unsafe existing origins cannot be treated as moved or missing.", { origins: unsafe.map((item) => item.id) });
    const reportedMissing = context.unavailableOrigins.filter((item) => binding.origins.includes(item.id) && item.kind === "missing").map((item) => item.id);
    if (reportedMissing.some((id) => available.has(id))) throw new HistoryError("history_transfer_unsafe_origin", "An existing origin cannot be both available and reported missing.");
    if (!missing.length || canonicalJson(missing) !== canonicalJson(transferOriginIds) || reportedMissing.some((id) => !transferOriginIds.includes(id))) throw new HistoryError("history_transfer_invalid", "Explicit transfer IDs must exactly cover all unavailable bound origins.");
  }

  private assertIncomingFacts(view: CoordinatedHistory, origin: string, input: HistoryGatewayInput): void {
    if (view.coordination !== "unjoined") return;
    for (const source of input.generationSources.filter((item) => item.sourceId.startsWith(`${origin}:`))) {
      const known = view.sources.find((item) => item.phase === source.phase && item.journalId === source.journalId);
      if (!known || !prefix(source.bytes, known.bytes)) throw new HistoryError("history_handoff_unaccepted_facts", "A joining copy contains phase facts that its known current sources do not establish.", { source_id: source.sourceId });
    }
  }

  private assertTransferSources(binding: LiveHistoryBinding, transferOriginIds: readonly string[], origin: string, context: HistoryRepositoryContext, input: HistoryGatewayInput): void {
    const current = input.generationSources.filter((source) => sourceOwner(source, context.origins.map((item) => item.id)) === origin);
    const witnesses = input.generationSources.filter((source) => {
      const sourceOrigin = sourceOwner(source, context.origins.map((item) => item.id));
      return sourceOrigin !== origin && binding.origins.includes(sourceOrigin) && !transferOriginIds.includes(sourceOrigin);
    });
    const proofByKey = new Map<string, SettledHistoryJournal[]>();
    for (const sourceId of transferOriginIds) {
      const proof = binding.settled_sources?.find((item) => item.origin_id === sourceId);
      if (!proof) throw new HistoryError("history_transfer_unproven", "A transferred origin has no settled journal inventory.", { origin_id: sourceId });
      for (const journal of proof.journals) {
        const key = `${journal.phase}\0${journal.journal_id}`;
        proofByKey.set(key, [...(proofByKey.get(key) ?? []), journal]);
        const matches = current.filter((source) => source.phase === journal.phase && source.journalId === journal.journal_id);
        if (matches.length !== 1) throw new HistoryError("history_transfer_incomplete", "The incoming record home does not contain exactly one full settled journal.", { origin_id: sourceId, journal_id: journal.journal_id });
        const incoming = matches[0]!;
        const knownPrefix = incoming.bytes.subarray(0, journal.byte_length);
        if (incoming.bytes.length < journal.byte_length || historyDigest(knownPrefix) !== journal.content_version) throw new HistoryError("history_transfer_incomplete", "An incoming journal is truncated or differs from its settled full bytes.", { origin_id: sourceId, journal_id: journal.journal_id });
        if (incoming.bytes.length > journal.byte_length && !witnesses.some((source) => source.phase === journal.phase && source.journalId === journal.journal_id && prefix(incoming.bytes, source.bytes))) throw new HistoryError("history_handoff_unaccepted_facts", "Incoming facts after a settled journal prefix are not established by another current member.", { source_id: incoming.sourceId });
      }
    }
    for (const incoming of current) {
      const key = `${incoming.phase}\0${incoming.journalId}`;
      if (proofByKey.has(key)) continue;
      if (!witnesses.some((source) => source.phase === incoming.phase && source.journalId === incoming.journalId && prefix(incoming.bytes, source.bytes))) throw new HistoryError("history_handoff_unaccepted_facts", "An incoming journal outside the settled inventories is not established by another current member.", { source_id: incoming.sourceId });
    }
  }

  private async writerEntries(context: HistoryRepositoryContext, missionId: string): Promise<readonly { readonly name: string }[]> {
    return this.storage.files.list({ root: context.commonDirectory, relative: `${base(missionId)}/coordination/history-writers` });
  }

  private settledInventory(origins: readonly string[], sources: readonly HistoryGenerationSource[], knownOrigins: readonly string[]): readonly SettledHistorySource[] {
    if (origins.some((origin) => !knownOrigins.includes(origin)) || sources.some((source) => source.phase !== "construction")) throw new HistoryError("history_source_invalid", "The selected history inventory contains an unknown origin or phase.");
    const inventory = sources.map((source) => ({ origin_id: sourceOwner(source, knownOrigins), phase: source.phase, journal_id: source.journalId, byte_length: source.bytes.length, content_version: historyDigest(source.bytes) }));
    if (inventory.some((item) => !origins.includes(item.origin_id)) || new Set(inventory.map((item) => `${item.origin_id}\0${item.phase}\0${item.journal_id}`)).size !== inventory.length) throw new HistoryError("history_source_invalid", "The selected history contains duplicate or unbound origin/journal identities.");
    return [...origins].sort(compare).map((origin_id) => ({ origin_id, journals: inventory.filter((item) => item.origin_id === origin_id).map(({ journal_id, byte_length, content_version }) => ({ phase: "construction" as const, journal_id, byte_length, content_version })).sort((left, right) => compare(left.phase, right.phase) || compare(left.journal_id, right.journal_id)) }));
  }

  public async withRecovery<T>(recordHome: string, missionId: string, operation: (scope: HistoryExclusiveScope) => Promise<T>): Promise<T> {
    return this.exclusive(recordHome, missionId, "recovery", [], operation);
  }

  public async withStartup<T>(recordHome: string, missionId: string, startup: MissionCoordinationLease, operation: (scope: HistoryExclusiveScope) => Promise<T>): Promise<T> {
    if (startup.owner.resource_scope !== "mission-startup") throw new HistoryError("history_startup_authority_invalid", "Initial publication requires the actual mission-startup claim.");
    return this.exclusive(recordHome, missionId, "startup", [startup], operation);
  }

  public async publishBinding(scope: HistoryExclusiveScope, input: HistoryControl, expected: HistoryDigest | null): Promise<void> {
    if (!this.exclusiveScopes.has(scope)) throw new HistoryError("history_fence_required", "Shared activation requires its live exclusive mission fence.");
    const control = parseHistoryControl(canonicalJson(input));
    await this.assertScope(scope);
    const confirmed = await this.storage.context(scope.context.recordHome);
    if (confirmed.commonDirectory !== scope.context.commonDirectory || confirmed.recordHome !== scope.context.recordHome || currentOrigin(confirmed) !== currentOrigin(scope.context)) throw new HistoryError("history_selection_changed", "The repository identity changed while its exclusive fence was held.");
    if (control.data.mission_id !== scope.missionId || (scope.kind === "startup" ? control.type !== "mission.history-initialized" || control.data.manifest.format !== "kepler.mission-history-initialization" || control.data.manifest.operation !== "create" : control.data.manifest.format === "kepler.mission-history-initialization" && control.data.manifest.operation === "create")) throw new HistoryError("history_activation_authority_invalid", "This fence cannot publish the selected activation authority.");
    const origin = currentOrigin(scope.context);
    const selected = await this.storage.read(scope.context.recordHome, scope.missionId, { originIds: new Set([origin]) });
    if (selected.historyVersion !== control.id || canonicalJson(selected.control) !== canonicalJson(control)) throw new HistoryError("history_selection_changed", "The exact control must already be selected through its durable portable activation.");
    const activation = await this.storage.files.read({ root: scope.context.recordHome, relative: `.kepler/missions/${scope.missionId}/history/control/active.json` });
    if (!activation) throw new HistoryError("history_selection_missing", "The portable activation is unavailable.");
    if (canonicalJson(parseHistoryControl(utf8.decode(activation))) !== canonicalJson(control)) throw new HistoryError("history_selection_changed", "The portable activation changed before its shared binding was published.");
    const target = bindingLocation(scope.context, scope.missionId);
    const previous = await this.storage.files.read(target);
    let existing: LiveHistoryBinding | undefined;
    if (previous !== undefined) {
      try { existing = parseLiveHistoryBinding(previous); } catch (error) { if (control.type !== "mission.history-reset") throw error; }
    }
    const selectionHash = historyDigest(activation);
    if (existing?.mission_id === scope.missionId && existing.history_version === control.id) {
      if (existing.generation_id !== control.data.generation_id || existing.selection_hash !== selectionHash) throw new HistoryError("history_binding_conflict", "The existing shared receipt has conflicting generation or control bytes.");
      return;
    }
    if (control.type === "mission.history-initialized" && previous !== undefined) throw new HistoryError("history_activation_stale", "Initial publication cannot replace another shared history selection.");
    if (control.type === "mission.history-rebuilt") {
      const manifest = control.data.manifest;
      if (manifest.format !== "kepler.mission-history-rebuild" || existing?.mission_id !== scope.missionId || existing.history_version !== manifest.reset_event_id) throw new HistoryError("history_activation_stale", "Reconstruction cannot replace a shared version other than its exact reset.");
    }
    if (control.type === "mission.history-reset") {
      const manifest = control.data.manifest;
      if (manifest.format !== "kepler.mission-history-reset") throw new HistoryError("history_activation_authority_invalid", "Reset publication requires its exact reset manifest.");
      const original = manifest.source_inventory.find((item) => item.source_id === `local-runtime:${target.relative}` && item.origin === "local-runtime" && item.path === target.relative);
      if (previous === undefined ? original !== undefined : !original || original.byte_length !== previous.length || original.content_version !== historyDigest(previous)) throw new HistoryError("history_activation_stale", "The effective shared selection is not the reset's approved original input.");
      if (existing?.mission_id === scope.missionId && manifest.previous_control.event_id !== null && manifest.previous_control.event_id !== existing.history_version) throw new HistoryError("history_activation_stale", "The reset's verified predecessor is not the effective shared control.");
    }
    const binding: LiveHistoryBinding = { format: "kepler.mission-history-binding", version: 1, mission_id: scope.missionId, generation_id: control.data.generation_id, history_version: control.id, selection_hash: selectionHash, origins: [origin] };
    await this.storage.files.write(target, bytes(binding), { kind: "replace", expected });
  }

  private assertMutation(view: CoordinatedHistory, historyVersion: string | undefined): void {
    assertHistoryVersion(view.control, historyVersion);
    if (view.pendingRecovery) throw new HistoryError("history_recovery_pending", "Retained recovery intent prevents ordinary mission mutations.");
    if (view.coordination !== "bound") throw new HistoryError("history_binding_required", "Validate mission ownership and handoff before this working copy can write the selected history.");
  }

  private async pending(context: HistoryRepositoryContext, view: MissionHistoryView): Promise<readonly HistoryPendingSource[]> {
    const selected = view.control;
    const resetId = selected?.type === "mission.history-rebuilt" && selected.data.manifest.format === "kepler.mission-history-rebuild" ? selected.data.manifest.reset_event_id : undefined;
    const root = resetId ? view.controlReceipts.find((control) => control.id === resetId) : selected;
    const covered = root?.type === "mission.history-reset" && root.data.manifest.format === "kepler.mission-history-reset" ? root.data.manifest.source_inventory : [];
    const result: HistoryPendingSource[] = [];
    const walk = async (relative: string): Promise<void> => {
      for (const entry of await this.storage.files.list({ root: context.commonDirectory, relative })) {
        const path = `${relative}/${entry.name}`;
        if (entry.kind === "directory") { await walk(path); continue; }
        const source_id = `local-runtime:${path}`;
        const contents = entry.kind === "file" ? await this.storage.files.read({ root: context.commonDirectory, relative: path }).catch(() => undefined) : undefined;
        const hash = contents ? historyDigest(contents) : undefined;
        const superseded = contents !== undefined && covered.some((item) => item.source_id === source_id && item.origin === "local-runtime" && item.path === path && item.byte_length === contents.length && item.content_version === hash);
        result.push({ source_id, path, ...(hash ? { content_version: hash, byte_length: contents!.length } : {}), status: superseded ? "superseded" : "pending" });
      }
    };
    await walk(`${base(view.missionId)}/recovery/pending`);
    return result.sort((left, right) => compare(left.path, right.path));
  }

  private async acquire(context: HistoryRepositoryContext, missionId: string, operation: string): Promise<MissionCoordinationLease> {
    validateMission(missionId);
    const result = await this.runtime.coordination.acquire({ commonDirectory: context.commonDirectory, location: { kind: "mission", missionId }, resourceKey: historyAdmissionResourceKey(context.commonDirectory, missionId), owner: { ...this.runtime.identity, mission_id: missionId, resource_scope: `mission-history/${operation}` } });
    if (result.kind === "failed") throw new HistoryError(result.code, result.message, result.details);
    return result.lease;
  }

  private async releaseAdmission(admission: MissionCoordinationLease, failure?: { readonly error: unknown }, writer?: string): Promise<void> {
    try {
      const result = await admission.release();
      if (result.kind === "failed") throw new Error(result.message);
    } catch (error) {
      throw new HistoryError("history_admission_release_failed", "The mission admission claim could not be released.", { lock_path: admission.lockPath, writer_reference: writer ?? null, operation_error: failure ? message(failure.error) : null, release_error: message(error), effects_uncertain: true });
    }
  }

  private async assertScope(scope: HistoryExclusiveScope): Promise<readonly HistorySourceEntry[]> {
    const owned = this.exclusiveInputs.get(scope);
    if (!this.exclusiveScopes.has(scope) || !owned) throw new HistoryError("history_fence_required", "Input exclusions require their live exclusive mission fence.");
    for (const source of owned) {
      const contents = await this.storage.files.read({ root: scope.context.commonDirectory, relative: source.path });
      if (!contents || contents.length !== source.byte_length || historyDigest(contents) !== source.content_version) throw new HistoryError("history_ownership_changed", "An exclusive mission claim is missing or changed.");
    }
    if (!this.exclusiveScopes.has(scope)) throw new HistoryError("history_fence_required", "The exclusive mission fence ended while its claims were checked.");
    return owned;
  }

  private async claimSource(context: HistoryRepositoryContext, missionId: string, lease: MissionCoordinationLease): Promise<HistorySourceEntry> {
    const directory = `${base(missionId)}/coordination`;
    const name = Path.basename(lease.lockPath);
    const owner = lease.owner;
    if (Path.dirname(lease.lockPath) !== Path.join(context.commonDirectory, directory) || !/^[0-9a-f]{64}$/.test(name) || owner.mission_id !== missionId || owner.machine_id !== this.runtime.identity.machine_id || owner.process_id !== this.runtime.identity.process_id || owner.process_incarnation_id !== this.runtime.identity.process_incarnation_id) throw new HistoryError("history_ownership_changed", "The supplied claim does not belong to this mission and process.");
    const path = `${directory}/${name}/owner.json`;
    const contents = await this.storage.files.read({ root: context.commonDirectory, relative: path });
    const parsed = contents ? parseStrictJson(utf8.decode(contents)) : undefined;
    if (!contents || parsed?.kind !== "parsed" || canonicalJson(parsed.value) !== canonicalJson(owner)) throw new HistoryError("history_ownership_changed", "The exact original mission claim is unavailable or changed.");
    return Object.freeze({ source_id: `local-runtime:${path}`, origin: "local-runtime", path, byte_length: contents.length, content_version: historyDigest(contents) });
  }

  private async exclusive<T>(recordHome: string, missionId: string, kind: HistoryExclusiveScope["kind"], allowedLocks: readonly MissionCoordinationLease[], operation: (scope: HistoryExclusiveScope) => Promise<T>): Promise<T> {
    validateMission(missionId);
    const context = await this.storage.context(recordHome);
    if (kind === "startup") {
      const startup = allowedLocks[0];
      const expected = Path.join(context.commonDirectory, base(missionId), "coordination", missionStartupResourceKey(context.commonDirectory, missionId));
      if (allowedLocks.length !== 1 || !startup || startup.lockPath !== expected || startup.owner.resource_scope !== "mission-startup") throw new HistoryError("history_startup_authority_invalid", "Initial publication requires the canonical mission-startup resource claim.");
      await this.claimSource(context, missionId, startup);
    }
    const admission = await this.acquire(context, missionId, kind);
    const frozenContext = immutableContext(context);
    const ownSources: HistorySourceEntry[] = [];
    const scope: HistoryExclusiveScope = Object.freeze({ kind, context: frozenContext, missionId, ownSources });
    let value: T | undefined;
    let failure: { readonly error: unknown } | undefined;
    try {
      for (const lease of [admission, ...allowedLocks]) ownSources.push(await this.claimSource(context, missionId, lease));
      Object.freeze(ownSources);
      const writers = await this.storage.files.list({ root: context.commonDirectory, relative: `${base(missionId)}/coordination/history-writers` });
      if (writers.length) throw new HistoryError("history_writers_active", "Registered, partial, or unrecognized writer records prevent a recovery transition. Reconcile their ownership first.");
      const claims = await this.storage.files.list({ root: context.commonDirectory, relative: `${base(missionId)}/coordination` });
      const allowed = new Set([Path.basename(admission.lockPath), ...allowedLocks.map((lease) => Path.basename(lease.lockPath))]);
      if (claims.some((entry) => /^[0-9a-f]{64}(?:$|\.)/.test(entry.name) && !allowed.has(entry.name))) throw new HistoryError("history_ownership_unresolved", "A mission claim or release marker must be reconciled before this transition.");
      this.exclusiveInputs.set(scope, ownSources);
      this.exclusiveScopes.add(scope);
      value = await operation(scope);
    } catch (error) { failure = { error }; }
    this.exclusiveScopes.delete(scope);
    this.exclusiveInputs.delete(scope);
    await this.releaseAdmission(admission, failure);
    if (failure) throw failure.error;
    return value as T;
  }
}
