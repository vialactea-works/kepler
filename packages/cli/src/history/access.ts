import { createHash } from "node:crypto";
import * as Path from "node:path";
import type { MissionCoordination, MissionCoordinationLease } from "../construction/mission-coordination.js";
import type { MissionWorkspaceIdentity } from "../construction/mission-workspace.js";
import { missionStartupResourceKey } from "../construction/mission-startup-resource.js";
import { parseStrictJson } from "../json/strict-json.js";
import { assertHistoryVersion, HistoryError, historyDigest, parseHistoryControl, type HistoryControl, type HistoryDigest, type HistorySourceEntry } from "./control.js";
import type { HistoryLocation, HistoryRepositoryContext, HistorySnapshot } from "./files.js";
import type { MissionHistoryView } from "./gateway.js";
import { canonicalJson } from "./journal.js";
import { HistoryStorage } from "./storage.js";

export interface LiveHistoryBinding {
  readonly format: "kepler.mission-history-binding";
  readonly version: 1;
  readonly mission_id: string;
  readonly generation_id: string;
  readonly history_version: string;
  readonly selection_hash: HistoryDigest;
  readonly origins: readonly string[];
}

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

export interface HistoryWriterLease {
  readonly view: CoordinatedHistory;
  readonly reference: string;
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
const digest = /^sha256:[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
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

export const historyAdmissionResourceKey = (commonDirectory: string, missionId: string): string => createHash("sha256").update(`mission-history-admission\0${commonDirectory}\0${missionId}`).digest("hex");

export const parseLiveHistoryBinding = (input: Uint8Array): LiveHistoryBinding => {
  let value: unknown;
  try {
    const parsed = parseStrictJson(utf8.decode(input));
    if (parsed.kind !== "parsed") throw new Error("Expected one strict JSON object");
    value = parsed.value;
  } catch (error) { throw new HistoryError("history_binding_invalid", "The shared history binding is damaged. Use raw recovery inspection.", { message: message(error) }); }
  const keys = ["format", "version", "mission_id", "generation_id", "history_version", "selection_hash", "origins"];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key)) || value.format !== "kepler.mission-history-binding" || value.version !== 1 || ![value.mission_id, value.generation_id, value.history_version].every((id) => typeof id === "string" && uuid.test(id)) || typeof value.selection_hash !== "string" || !digest.test(value.selection_hash) || !Array.isArray(value.origins) || !value.origins.length || !value.origins.every((id: unknown) => typeof id === "string" && id.trim().length > 0)) throw new HistoryError("history_binding_invalid", "The shared history binding has unsupported fields or identities.");
  const origins = value.origins as string[];
  if (new Set(origins).size !== origins.length || canonicalJson([...origins].sort(compare)) !== canonicalJson(origins)) throw new HistoryError("history_binding_invalid", "Shared history origins must be unique and sorted.");
  return { format: "kepler.mission-history-binding", version: 1, mission_id: String(value.mission_id), generation_id: String(value.generation_id), history_version: String(value.history_version), selection_hash: value.selection_hash as HistoryDigest, origins };
};

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
      const location = { root: commonDirectory, relative: `${base(request.missionId)}/coordination/history-writers/${token}.json` };
      const contents = bytes({ format: "kepler.mission-history-writer", version: 1, mission_id: request.missionId, history_version: view.historyVersion, generation_id: view.generationId, origin_id: origin, token, owner: this.runtime.identity });
      const output = await this.storage.files.write(location, contents, { kind: "create" });
      if (output.status !== "created") throw new HistoryError("history_writer_identity_reused", "An ordinary writer cannot adopt an existing writer identity.");
      let released = false;
      writer = { view, reference: location.relative, release: async () => {
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

  public async withMutation<T>(request: HistoryMutationRequest, operation: (view: CoordinatedHistory) => Promise<T>): Promise<T> {
    const writer = await this.beginMutation(request);
    let value: T | undefined;
    let failure: { readonly error: unknown } | undefined;
    try { value = await operation(writer.view); } catch (error) { failure = { error }; }
    try { await writer.release(); } catch (error) {
      throw new HistoryError("history_writer_release_failed", "The mutation ended, but its history writer claim could not be released.", { reference: writer.reference, operation_callback: failure ? "threw" : "returned", operation_error: failure ? message(failure.error) : null, release_error: message(error), effects_uncertain: true });
    }
    if (failure) throw failure.error;
    return value as T;
  }

  public async join(input: HistoryMutationRequest, verifyOwnership: (view: CoordinatedHistory, context: HistoryRepositoryContext) => Promise<void>): Promise<CoordinatedHistory> {
    const request = Object.freeze({ recordHome: input.recordHome, missionId: input.missionId, historyVersion: input.historyVersion });
    const before = await this.read(request.recordHome, request.missionId);
    assertHistoryVersion(before.control, request.historyVersion);
    if (before.pendingRecovery) throw new HistoryError("history_recovery_pending", "Finish or supersede the retained recovery intent before joining this history.");
    const context = await this.storage.context(request.recordHome);
    const admission = await this.acquire(context, request.missionId, "join");
    let failure: { readonly error: unknown } | undefined;
    try {
      const view = await this.read(context.recordHome, request.missionId);
      assertHistoryVersion(view.control, request.historyVersion);
      if (view.pendingRecovery) throw new HistoryError("history_recovery_pending", "Recovery became pending before this working copy could join.");
      const raw = await this.storage.files.read(bindingLocation(context, request.missionId));
      const existing = raw ? parseLiveHistoryBinding(raw) : undefined;
      if (existing && view.coordination === "unjoined") {
        const incoming = await this.storage.input(context.recordHome, request.missionId, { sharedHistoryVersion: existing.history_version, originIds: new Set(existing.origins), includeCurrentOrigin: true });
        const origin = currentOrigin(context);
        for (const source of incoming.generationSources.filter((item) => item.sourceId.startsWith(`${origin}:`))) {
          const known = view.sources.find((item) => item.phase === source.phase && item.journalId === source.journalId);
          if (!known || !prefix(source.bytes, known.bytes)) throw new HistoryError("history_handoff_unaccepted_facts", "A joining copy contains phase facts that its known current sources do not establish.", { source_id: source.sourceId });
        }
      }
      const target = bindingLocation(context, request.missionId);
      const selectedRoot = context.recordHome;
      const origin = currentOrigin(context);
      const binding: LiveHistoryBinding = { format: "kepler.mission-history-binding", version: 1, mission_id: request.missionId, generation_id: view.generationId!, history_version: view.historyVersion!, selection_hash: view.selectionHash!, origins: [...new Set([...(existing?.origins ?? []), origin])].sort(compare) };
      await verifyOwnership(Object.freeze({ ...view }), immutableContext(context));
      const confirmed = await this.storage.context(selectedRoot);
      const activation = await this.storage.files.read({ root: selectedRoot, relative: `.kepler/missions/${request.missionId}/history/control/active.json` });
      if (confirmed.recordHome !== selectedRoot || confirmed.commonDirectory !== target.root || currentOrigin(confirmed) !== origin || !activation || historyDigest(activation) !== binding.selection_hash) throw new HistoryError("history_selection_changed", "Ownership verification changed its bound repository or activation input.");
      await this.storage.files.write(target, bytes(binding), { kind: "replace", expected: raw ? historyDigest(raw) : null });
    } catch (error) { failure = { error }; }
    await this.releaseAdmission(admission, failure);
    if (failure) throw failure.error;
    return this.read(context.recordHome, request.missionId);
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
    const relative = `${base(view.missionId)}/recovery/pending`;
    const covered = view.controlReceipts.flatMap((control) => control.type === "mission.history-reset" && control.data.manifest.format === "kepler.mission-history-reset" ? control.data.manifest.source_inventory : []);
    const result: HistoryPendingSource[] = [];
    for (const entry of await this.storage.files.list({ root: context.commonDirectory, relative })) {
      const path = `${relative}/${entry.name}`;
      const source_id = `local-runtime:${path}`;
      const contents = entry.kind === "file" ? await this.storage.files.read({ root: context.commonDirectory, relative: path }).catch(() => undefined) : undefined;
      const hash = contents ? historyDigest(contents) : undefined;
      const superseded = contents !== undefined && covered.some((item) => item.source_id === source_id && item.path === path && item.byte_length === contents.length && item.content_version === hash);
      result.push({ source_id, path, ...(hash ? { content_version: hash, byte_length: contents!.length } : {}), status: superseded ? "superseded" : "pending" });
    }
    return result;
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
