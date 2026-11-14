import { parseStrictJson } from "../json/strict-json.js";
import { HistoryAccess, parseLiveHistoryBinding, type HistoryExclusiveScope, type LiveHistoryBinding } from "./access.js";
import { HistoryArchives, type PreservedHistoryArchive } from "./archives.js";
import { historyArchiveIndexDigest } from "./archive-index.js";
import { createHistoryControl, HistoryError, historyDigest, historyManifestDigest, historyMode, parseHistoryControl, parseHistoryGuard, parseHistoryManifest, type HistoryControl, type HistoryDigest, type HistoryMaterial, type HistoryManifest, type HistoryInitializationManifest, type HistoryRebuildManifest, type HistorySourceEntry } from "./control.js";
import type { HistoryLocation, HistorySnapshot, HistorySnapshotFile } from "./files.js";
import { canonicalJson, serializeJournalEvent } from "./journal.js";
import { historyOperationKey, parseHistoryOperationIntent, parseHistoryOperationRequest, type HistoryOperation, type HistoryOperationIntent, type HistoryPendingCandidate } from "./operation-intent.js";
import { collectHistory, type HistoryCollection, type HistoryJournalSource } from "./collection.js";
import { historyState, mergeGenerationSources } from "./gateway.js";
import type { PreparedCandidateJournal, PreparedReconstruction } from "./reconstruction.js";
import { historyInventory } from "./storage.js";

export interface HistoryOperationScopeCheck {
  readonly phase: "preview" | "apply";
  readonly recordHome: string;
  readonly manifest: HistoryManifest;
  readonly snapshot: HistorySnapshot;
  readonly intent: HistoryOperationIntent | null;
}

export interface HistoryOperationsRuntime {
  readonly access: HistoryAccess;
  readonly archives: HistoryArchives;
  readonly next: () => string;
  readonly clock: () => Date;
  readonly producer: { readonly name: string; readonly version: string };
  readonly readGuide?: (reference: string, snapshot: HistorySnapshot) => Promise<Uint8Array>;
  readonly verifyCandidate?: (scope: { readonly recordHome: string; readonly missionId: string }, manifest: HistoryRebuildManifest) => Promise<PreparedReconstruction>;
  readonly verifyScope: (request: HistoryOperationScopeCheck) => Promise<
    | { readonly status: "valid"; readonly reference: string; readonly content_version: HistoryDigest }
    | { readonly status: "invalid"; readonly reason: string }
  >;
}

interface SelectedControl {
  readonly control: HistoryControl;
  readonly bytes: Uint8Array;
}

interface OwnedOutput {
  readonly origin: string;
  readonly path: string;
  readonly bytes: Uint8Array;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const bytes = (value: unknown): Uint8Array => encoder.encode(`${canonicalJson(value)}\n`);
const eventBytes = (value: HistoryControl | HistoryOperationIntent["guard"]): Uint8Array => encoder.encode(`${serializeJournalEvent(value)}\n`);
const equal = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((value, index) => value === right[index]);
const prefix = (shorter: Uint8Array, longer: Uint8Array): boolean => shorter.length <= longer.length && shorter.every((value, index) => value === longer[index]);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const base = (missionId: string): string => `kepler/missions/${missionId}`;
const portable = (missionId: string): string => `.kepler/missions/${missionId}/history`;
const pendingPath = (intent: Pick<HistoryOperationIntent, "mission_id" | "key">): string => `${base(intent.mission_id)}/recovery/pending/${intent.key.slice(7)}.json`;
const completedPath = (intent: Pick<HistoryOperationIntent, "mission_id" | "key">): string => `${base(intent.mission_id)}/recovery/completed/${intent.key.slice(7)}.json`;
const cloneSnapshot = (snapshot: HistorySnapshot): HistorySnapshot => ({ ...snapshot, origins: snapshot.origins.map((origin) => ({ ...origin })), files: snapshot.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })), unavailable: snapshot.unavailable.map((source) => ({ ...source })) });
const recordHomeOrigin = (snapshot: HistorySnapshot): string => {
  const origin = snapshot.origins.find((candidate) => candidate.root === snapshot.recordHome);
  if (!origin) throw new HistoryError("history_origin_missing", "The operation has no verified record-home origin.");
  return origin.id;
};
const missionIdOf = (manifest: HistoryManifest): string => manifest.format === "kepler.mission-history-rebuild" ? manifest.mission_id : manifest.mission_binding.mission_id;
const bindingPath = (missionId: string): string => `${base(missionId)}/coordination/history-selection.json`;
const matchSource = (source: HistorySourceEntry, file: HistorySnapshotFile): boolean => source.source_id === file.sourceId && source.origin === file.origin && source.path === file.path && source.byte_length === file.bytes.length && source.content_version === historyDigest(file.bytes);

export class HistoryOperations {
  private readonly access: HistoryAccess;
  private readonly archives: HistoryArchives;
  private readonly next: () => string;
  private readonly clock: () => Date;
  private readonly producer: { readonly name: string; readonly version: string };
  private readonly verifyScope: HistoryOperationsRuntime["verifyScope"];
  private readonly readGuide: HistoryOperationsRuntime["readGuide"];
  private readonly verifyCandidate: HistoryOperationsRuntime["verifyCandidate"];

  public constructor(runtime: HistoryOperationsRuntime) {
    if (typeof runtime.verifyScope !== "function" || typeof runtime.next !== "function" || typeof runtime.clock !== "function") throw new HistoryError("history_verifier_required", "Reset requires real scope verification, an identity source, and a clock.");
    this.access = runtime.access;
    this.archives = runtime.archives;
    this.next = runtime.next;
    this.clock = runtime.clock;
    this.producer = Object.freeze({ ...runtime.producer });
    this.verifyScope = runtime.verifyScope;
    this.readGuide = runtime.readGuide;
    this.verifyCandidate = runtime.verifyCandidate;
  }

  public async execute(operation: HistoryOperation, scope: { readonly recordHome: string; readonly missionId: string }, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = parseHistoryOperationRequest(input, operation);
    const manifest = request.manifest;
    const target = { recordHome: scope.recordHome, missionId: scope.missionId };
    if (missionIdOf(manifest) !== target.missionId) throw new HistoryError("history_scope_invalid", "The selected mission does not match the reset manifest.");
    if (request.phase === "preview") {
      const snapshot = await this.access.storage.snapshot(target.recordHome, target.missionId);
      const selected = await this.validate(manifest, snapshot);
      await this.candidates(manifest, snapshot);
      await this.check("preview", manifest, snapshot, null);
      const index = await this.index(manifest, snapshot);
      return { phase: "preview", manifest, manifest_hash: historyManifestDigest(manifest), archive_inventory_hash: historyArchiveIndexDigest(index), mission_id: target.missionId, generation_id: manifest.generation_id, history_version: selected?.control.id ?? null, mode: operation === "reset" ? "recovering" : "active", execution_started: false, proposed: true };
    }
    const key = historyOperationKey({ operation, missionId: target.missionId, generationId: manifest.generation_id, manifestHash: historyManifestDigest(manifest), requester: manifest.requester, decisionReference: request.decision_reference! });
    const existing = await this.load(target.recordHome, target.missionId, key);
    if (existing.completed && !existing.pending) return this.receipt(existing.completed, target.recordHome, true);
    let retainedIntent: HistoryOperationIntent | undefined;
    return this.access.withRecovery(target.recordHome, target.missionId, async (fence) => {
      let step = "validate-inputs";
      const effects: string[] = [];
      let intent: HistoryOperationIntent | undefined;
      try {
        const retained = await this.load(fence.context.recordHome, target.missionId, key);
        intent = retained.pending ?? retained.completed;
        retainedIntent = intent;
        let snapshot = await this.access.snapshot(fence);
        if (intent) {
          if (canonicalJson(intent.control.data.manifest) !== canonicalJson(manifest) || intent.decision_reference !== request.decision_reference) throw new HistoryError("history_intent_conflict", "The retained instructions belong to a different request.");
          if (intent.record_home_origin !== recordHomeOrigin(snapshot)) throw new HistoryError("history_operation_context_changed", "Resume incomplete instructions in their original verified record home.");
          snapshot = await this.originalSnapshot(intent, snapshot);
        } else {
          const selected = await this.validate(manifest, snapshot);
          const candidates = await this.candidates(manifest, snapshot);
          const check = await this.check("apply", manifest, snapshot, null);
          const index = await this.index(manifest, snapshot);
          intent = this.author(manifest, snapshot, selected, key, request.decision_reference!, index, check, candidates);
          retainedIntent = intent;
          step = "retain-instructions";
          await this.access.storage.files.write({ root: fence.context.commonDirectory, relative: pendingPath(intent) }, bytes(intent), { kind: "create" });
          effects.push(pendingPath(intent));
        }
        const currentSnapshot = await this.access.snapshot(fence);
        await this.originalSnapshot(intent, currentSnapshot);
        await this.check("apply", manifest, { ...currentSnapshot, unavailable: intent.original_unavailable }, intent);
        step = "preserve-originals";
        const archive = manifest.format === "kepler.mission-history-rebuild" ? await this.archives.verify(fence.context.recordHome, target.missionId, manifest.archive_id, { manifestHash: intent.archive_index.manifest_hash, indexHash: manifest.archive_inventory_hash }) : await this.archives.preserve(manifest, intent.archive_index, snapshot);
        effects.push(`local-archive:${manifest.archive_id}`);
        await this.originalSnapshot(intent, await this.access.snapshot(fence), archive);
        step = "verify-candidate";
        this.candidateIntegrity(manifest, intent.candidate_journals.map((journal) => ({ ...journal, bytes: new Uint8Array(Buffer.from(journal.bytes_base64, "base64")) })));
        if (manifest.format === "kepler.mission-history-rebuild") await this.candidates(manifest, await this.access.snapshot(fence));
        if (manifest.format === "kepler.mission-history-initialization") this.migrationOriginals(manifest, archive, intent.candidate_journals);
        step = "install-generation";
        await this.generation(intent, fence, false);
        for (const output of this.outputs(intent).filter((output) => output.path.includes("/history/generations/"))) { await this.writeOutput(fence, output, { kind: "create" }); effects.push(output.path); }
        await this.generation(intent, fence, true);
        await this.originalSnapshot(intent, await this.access.snapshot(fence), archive);
        step = "append-control";
        for (const output of this.outputs(intent).filter((output) => output.path.includes("/control/") && !output.path.endsWith("active.json"))) {
          await this.writeOutput(fence, output, { kind: "create" });
          effects.push(output.path);
        }
        await this.originalSnapshot(intent, await this.access.snapshot(fence), archive);
        step = "activate";
        const activation = this.outputs(intent).find((output) => output.path.endsWith("/control/active.json"))!;
        await this.writeOutput(fence, activation, { kind: "replace", expected: intent.activation_input });
        effects.push(activation.path);
        step = "bind-shared-version";
        await this.access.publishBinding(fence, intent.control, intent.binding_input);
        effects.push(bindingPath(target.missionId));
        step = "retire-legacy-sources";
        await this.retire(intent, fence, archive);
        step = "verify-selection";
        const selected = await this.access.read(fence.context.recordHome, target.missionId);
        const expectedMode = operation === "reset" ? "recovering" : "active";
        if (selected.historyVersion !== intent.control.id || selected.mode !== expectedMode || (expectedMode === "recovering" ? selected.history.events.length !== 0 : canonicalJson(historyState(selected.history)) !== canonicalJson((manifest as HistoryInitializationManifest | HistoryRebuildManifest).expected_state))) throw new HistoryError("history_operation_confirmation_failed", "Publication could not be confirmed through the normal generation gateway.");
        await this.originalSnapshot(intent, await this.access.snapshot(fence), archive);
        step = "record-completion";
        await this.access.storage.files.write({ root: fence.context.commonDirectory, relative: completedPath(intent) }, bytes(intent), { kind: "create" });
        effects.push(completedPath(intent));
        const removed = await this.access.storage.files.remove({ root: fence.context.commonDirectory, relative: pendingPath(intent) }, historyDigest(bytes(intent)));
        if (removed !== "removed" && !retained.completed) throw new HistoryError("history_intent_missing", "The original pending instructions disappeared before completion cleanup.");
        return await this.receipt(intent, fence.context.recordHome, false);
      } catch (error) {
        const details = error instanceof HistoryError ? error.details : { message: message(error) };
        throw new HistoryError(error instanceof HistoryError ? error.code : `history_${operation}_failed`, error instanceof Error ? error.message : `History ${operation} did not complete.`, { ...details, operation_key: key, step, known_partial_effects: effects, pending_reference: intent ? pendingPath(intent) : null, execution_started: false });
      }
    }).catch((error: unknown) => {
      if (error instanceof HistoryError && error.code === "history_admission_release_failed") throw new HistoryError(error.code, error.message, { ...error.details, step: "release-mission-fence", operation_key: key, control_event_id: retainedIntent?.control.id ?? null, generation_id: retainedIntent?.generation_id ?? null, archive_reference: retainedIntent ? `local-archive:${retainedIntent.archive_index.archive_id}` : null, execution_started: false });
      throw error;
    });
  }

  private async check(phase: "preview" | "apply", manifest: HistoryManifest, snapshot: HistorySnapshot, intent: HistoryOperationIntent | null): Promise<HistoryMaterial> {
    const result = await this.verifyScope({ phase, recordHome: snapshot.recordHome, manifest: parseHistoryControlManifest(manifest), snapshot: cloneSnapshot(snapshot), intent: intent ? parseHistoryOperationIntent(intent) : null });
    if (result?.status !== "valid" || typeof result.reference !== "string" || !result.reference.trim() || !digest.test(result.content_version)) throw new HistoryError("history_scope_verification_failed", "Reset ownership, binding, and reconciled effects have no valid verification receipt.", { reason: result?.status === "invalid" ? result.reason : "Invalid verifier result" });
    return { reference: result.reference, content_version: result.content_version };
  }

  private async selected(snapshot: HistorySnapshot): Promise<SelectedControl | undefined> {
    const rawBinding = snapshot.files.find((file) => file.origin === "local-runtime" && file.path === bindingPath(snapshot.missionId));
    let binding: LiveHistoryBinding | undefined;
    try { binding = rawBinding ? parseLiveHistoryBinding(rawBinding.bytes) : undefined; } catch { return undefined; }
    if (binding && binding.mission_id !== snapshot.missionId) return undefined;
    const origins = binding ? snapshot.origins.filter((origin) => origin.id !== "local-runtime") : snapshot.origins.filter((origin) => origin.root === snapshot.recordHome);
    for (const origin of origins) {
      const raw = snapshot.files.find((file) => file.origin === origin.id && file.path === `${portable(snapshot.missionId)}/control/active.json`);
      if (!raw || binding && historyDigest(raw.bytes) !== binding.selection_hash) continue;
      try {
        const selected = await this.access.storage.selection(origin.root, snapshot.missionId, { originIds: new Set([origin.id]), ...(binding ? { sharedHistoryVersion: binding.history_version } : {}) });
        if (selected.control && (!binding || selected.generationId === binding.generation_id)) return { control: selected.control, bytes: new Uint8Array(raw.bytes) };
      } catch {}
    }
    return undefined;
  }

  private async index(manifest: HistoryManifest, snapshot: HistorySnapshot): Promise<HistoryOperationIntent["archive_index"]> {
    if (manifest.format === "kepler.mission-history-rebuild") return (await this.archives.verify(snapshot.recordHome, snapshot.missionId, manifest.archive_id, { indexHash: manifest.archive_inventory_hash })).index;
    return this.archives.prepare(manifest, snapshot);
  }

  private candidateIntegrity(manifest: HistoryManifest, candidates: readonly PreparedCandidateJournal[]): HistoryCollection | undefined {
    if (manifest.format === "kepler.mission-history-reset") {
      if (candidates.length) throw new HistoryError("history_candidate_invalid", "Reset cannot publish phase progress.");
      return undefined;
    }
    const metadata = candidates.map((journal) => ({ phase: journal.phase, journal_id: journal.journal_id, byte_length: journal.byte_length, content_version: journal.content_version, reference: journal.reference }));
    if (canonicalJson(metadata) !== canonicalJson(manifest.candidate_journals) || candidates.some((journal) => !(journal.bytes instanceof Uint8Array) || journal.bytes.length !== journal.byte_length || historyDigest(journal.bytes) !== journal.content_version)) throw new HistoryError("history_candidate_changed", "Candidate files do not match their complete exact approved inventory.");
    const history = collectHistory(missionIdOf(manifest), candidates.map((journal) => ({ sourceId: journal.reference, missionId: missionIdOf(manifest), generationId: manifest.generation_id, phase: journal.phase, journalId: journal.journal_id, bytes: new Uint8Array(journal.bytes) })), { completeness: "complete", generationId: manifest.generation_id });
    if (canonicalJson(historyState(history)) !== canonicalJson(manifest.expected_state)) throw new HistoryError("history_expected_state_mismatch", "The actual candidate does not establish its approved normal workflow state.");
    return history;
  }

  private async candidates(manifest: HistoryManifest, snapshot: HistorySnapshot): Promise<readonly PreparedCandidateJournal[]> {
    if (manifest.format === "kepler.mission-history-reset") return [];
    let candidates: readonly PreparedCandidateJournal[];
    if (manifest.format === "kepler.mission-history-initialization") {
      if (manifest.operation !== "migrate" || !manifest.guide || !this.readGuide) throw new HistoryError("history_migration_guide_required", "Healthy migration requires a supported guide reader and exact guide material.");
      const guide = new Uint8Array(await this.readGuide(manifest.guide, cloneSnapshot(snapshot)));
      if (!guide.length || historyDigest(guide) !== manifest.guide_hash) throw new HistoryError("history_migration_guide_changed", "The actual migration guide differs from the approved content hash.");
      const view = await this.access.read(snapshot.recordHome, snapshot.missionId);
      if (view.mode !== "legacy" || view.pendingRecovery) throw new HistoryError("history_migration_legacy_required", "New migration instructions require healthy legacy history.");
      const sources = mergeGenerationSources(view.sources.map((source) => ({ ...source, generationId: manifest.generation_id })), snapshot.missionId, manifest.generation_id);
      if (sources.length !== manifest.candidate_journals.length) throw new HistoryError("history_migration_inventory_changed", "Healthy migration must copy the complete validated legacy journal set.");
      candidates = manifest.candidate_journals.map((journal) => { const source = sources.find((source) => source.phase === journal.phase && source.journalId === journal.journal_id); if (!source) throw new HistoryError("history_migration_inventory_changed", "An approved legacy journal is unavailable."); return { ...journal, bytes: new Uint8Array(source.bytes) }; });
    } else {
      if (!this.verifyCandidate) throw new HistoryError("history_candidate_verifier_required", "Publication requires independent reconstruction, authority, material, and continuation verification.");
      const verified = await this.verifyCandidate({ recordHome: snapshot.recordHome, missionId: snapshot.missionId }, parseHistoryControlManifest(manifest) as HistoryRebuildManifest);
      if (canonicalJson(verified.manifest) !== canonicalJson(manifest)) throw new HistoryError("history_candidate_changed", "Independent reconstruction produced a different manifest.");
      candidates = verified.candidate_journals.map((journal) => ({ phase: journal.phase, journal_id: journal.journal_id, byte_length: journal.byte_length, content_version: journal.content_version, reference: journal.reference, bytes: new Uint8Array(journal.bytes) }));
    }
    this.candidateIntegrity(manifest, candidates);
    return candidates;
  }

  private migrationOriginals(manifest: HistoryInitializationManifest, archive: PreservedHistoryArchive, candidates: readonly HistoryPendingCandidate[]): void {
    const prefix = `${portable(archive.index.mission_id)}/`;
    const originals = archive.files.filter((file) => file.path.startsWith(prefix)).flatMap((file): HistoryJournalSource[] => {
      const parts = file.path.slice(prefix.length).split("/");
      return parts.length === 2 && !["control", "generations"].includes(parts[0]!) && parts[1]!.endsWith(".jsonl") ? [{ sourceId: file.source_id, missionId: archive.index.mission_id, generationId: manifest.generation_id, phase: parts[0]!, journalId: parts[1]!.slice(0, -6), bytes: new Uint8Array(file.bytes) }] : [];
    });
    const sources = mergeGenerationSources(originals.map((source) => ({ ...source, generationId: manifest.generation_id })), archive.index.mission_id, manifest.generation_id);
    if (sources.length !== candidates.length || candidates.some((journal) => { const source = sources.find((source) => source.phase === journal.phase && source.journalId === journal.journal_id); return !source || !equal(source.bytes, new Uint8Array(Buffer.from(journal.bytes_base64, "base64"))); })) throw new HistoryError("history_migration_semantics_changed", "Healthy migration cannot replace, omit, or invent any original legacy journal bytes.");
    if (canonicalJson(historyState(collectHistory(archive.index.mission_id, sources, { completeness: "complete", generationId: manifest.generation_id }))) !== canonicalJson(manifest.expected_state)) throw new HistoryError("history_migration_state_changed", "The preserved originals do not establish the unchanged approved workflow state.");
  }

  private async generation(intent: HistoryOperationIntent, scope: HistoryExclusiveScope, complete: boolean): Promise<void> {
    if (intent.operation === "reset") return;
    const base = `${portable(intent.mission_id)}/generations/${intent.generation_id}`;
    for (const phase of await this.access.storage.files.list({ root: scope.context.recordHome, relative: base })) {
      if (phase.kind !== "directory" || phase.name !== "construction") throw new HistoryError("history_generation_conflict", "Unknown generation entries require preservation and a new reset.", { path: `${base}/${phase.name}` });
      for (const file of await this.access.storage.files.list({ root: scope.context.recordHome, relative: `${base}/construction` })) {
        const journal = intent.candidate_journals.find((journal) => file.name === `${journal.journal_id}.jsonl`);
        const temporary = intent.candidate_journals.find((journal) => file.name === `.${journal.journal_id}.jsonl.${journal.content_version.slice(7)}.pending`);
        const actual = file.kind === "file" ? await this.access.storage.files.read({ root: scope.context.recordHome, relative: `${base}/construction/${file.name}` }) : undefined;
        if (journal && actual && equal(actual, new Uint8Array(Buffer.from(journal.bytes_base64, "base64")))) continue;
        if (!complete && temporary && actual && prefix(actual, new Uint8Array(Buffer.from(temporary.bytes_base64, "base64")))) continue;
        throw new HistoryError("history_generation_conflict", "An unknown or changed target journal cannot be adopted or overwritten.", { path: `${base}/construction/${file.name}` });
      }
    }
    if (complete) for (const journal of intent.candidate_journals) { const actual = await this.access.storage.files.read({ root: scope.context.recordHome, relative: `${base}/${journal.phase}/${journal.journal_id}.jsonl` }); if (!actual || !equal(actual, new Uint8Array(Buffer.from(journal.bytes_base64, "base64")))) throw new HistoryError("history_generation_incomplete", "The target generation is not the complete independently checked candidate."); }
  }

  private async validate(manifest: HistoryManifest, snapshot: HistorySnapshot): Promise<SelectedControl | undefined> {
    if (manifest.format === "kepler.mission-history-rebuild") {
      const current = await this.access.read(snapshot.recordHome, snapshot.missionId);
      const selected = await this.selected(snapshot);
      if (!selected || current.mode !== "recovering" || current.pendingRecovery || selected.control.type !== "mission.history-reset" || selected.control.id !== manifest.reset_event_id || selected.control.data.generation_id !== manifest.generation_id) throw new HistoryError("history_publication_reset_required", "Publication requires its current completed reset and matching recovering generation.");
      if (snapshot.files.some((file) => file.path.startsWith(`${portable(snapshot.missionId)}/generations/${manifest.generation_id}/`))) throw new HistoryError("history_publication_partial_generation", "An installation without these exact retained instructions requires a new reset and generation.");
      return selected;
    }
    if (canonicalJson(historyInventory(snapshot)) !== canonicalJson(manifest.source_inventory)) throw new HistoryError("history_source_changed", "The complete raw input inventory differs from the proposed reset.");
    if (snapshot.unavailable.some((source) => source.kind !== "missing")) throw new HistoryError("history_archive_source_unavailable", "Existing unreadable or unsafe sources must be preserved before reset.");
    for (const missing of snapshot.unavailable) if (manifest.format !== "kepler.mission-history-reset" || !manifest.known_missing_sources.some((source) => source.reference === missing.source_id)) throw new HistoryError("history_archive_loss_undeclared", "The proposed reset omits a known missing source.", { source_id: missing.source_id });
    if ((await this.archives.catalog(snapshot.recordHome, snapshot.missionId)).archives.some((archive) => archive.archive_id === manifest.archive_id)) throw new HistoryError("history_archive_identity_reused", "A new reset requires an unused archive identity.");
    for (const origin of snapshot.origins.filter((origin) => origin.id !== "local-runtime")) {
      if ((await this.access.storage.files.list({ root: origin.root, relative: `${portable(snapshot.missionId)}/generations` })).some((entry) => entry.name === manifest.generation_id)) throw new HistoryError("history_generation_reused", "An existing generation namespace cannot be adopted by another reset.");
    }
    if (snapshot.files.some((file) => file.path.includes(`/history/generations/${manifest.generation_id}/`))) throw new HistoryError("history_generation_reused", "Reset requires a fresh generation without an earlier installation.");
    for (const file of snapshot.files.filter((file) => file.path.includes("/history/control/"))) {
      try { if (parseHistoryControl(decoder.decode(file.bytes)).data.generation_id === manifest.generation_id) throw new HistoryError("history_generation_reused", "A retained control already reserves the proposed generation."); }
      catch (error) { if (error instanceof HistoryError && error.code === "history_generation_reused") throw error; }
    }
    const selected = await this.selected(snapshot);
    const local = snapshot.files.find((file) => file.origin === recordHomeOrigin(snapshot) && file.path === `${portable(snapshot.missionId)}/control/active.json`);
    if (manifest.format === "kepler.mission-history-reset") {
      if ((selected?.control.id ?? null) !== manifest.previous_control.event_id || (selected ? historyDigest(selected.bytes) : local ? historyDigest(local.bytes) : null) !== manifest.previous_control.content_version) throw new HistoryError("history_predecessor_changed", "The proposed predecessor does not match the independently verified control or exact damaged input.");
    } else {
      const legacy = await this.access.read(snapshot.recordHome, snapshot.missionId);
      if (legacy.mode !== "legacy" || legacy.pendingRecovery || selected) throw new HistoryError("history_migration_legacy_required", "Healthy migration requires validated direct-phase history without generation or recovery authority.");
      if (canonicalJson(historyState(legacy.history)) !== canonicalJson(manifest.expected_state)) throw new HistoryError("history_migration_state_changed", "Healthy migration cannot change the validated legacy workflow state.");
    }
    const legacy = snapshot.files.filter((file) => /^\.kepler\/missions\/[^/]+\/history\/(?!control\/|generations\/)[^/]+\/[^/]+$/.test(file.path));
    if (legacy.some((file) => !manifest.source_retirement.some((source) => matchSource({ ...source, origin: file.origin }, file)))) throw new HistoryError("history_retirement_incomplete", "Reset from a legacy layout must bind every direct legacy source for verified retirement.");
    return selected;
  }

  private author(manifest: HistoryManifest, snapshot: HistorySnapshot, selected: SelectedControl | undefined, key: HistoryDigest, decision: string, index: HistoryOperationIntent["archive_index"], check: HistoryMaterial, candidates: readonly PreparedCandidateJournal[]): HistoryOperationIntent {
    const reserved = new Set<string>();
    const reserve = (value: unknown): void => {
      if (typeof value === "string" && uuid.test(value)) reserved.add(value);
      else if (Array.isArray(value)) value.forEach(reserve);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(reserve);
    };
    reserve(manifest);
    for (const journal of candidates) for (const line of decoder.decode(journal.bytes).split("\n")) { const parsed = parseStrictJson(line); if (parsed.kind === "parsed") reserve(parsed.value); }
    for (const file of snapshot.files) {
      try { for (const line of decoder.decode(file.bytes).split("\n")) { const parsed = parseStrictJson(line); if (parsed.kind === "parsed") reserve(parsed.value); } } catch {}
    }
    const next = (): string => { const value = this.next(); if (!uuid.test(value) || reserved.has(value)) throw new HistoryError("history_identity_invalid", "The identity source must supply a fresh independent UUIDv4."); reserved.add(value); return value; };
    const time = this.clock();
    if (!(time instanceof Date) || !Number.isFinite(time.getTime())) throw new HistoryError("history_clock_invalid", "Reset recording requires an actual valid recovery time.");
    const operation: HistoryOperation = manifest.format === "kepler.mission-history-reset" ? "reset" : manifest.format === "kepler.mission-history-rebuild" ? "publish" : "migrate";
    const creation = manifest.format === "kepler.mission-history-initialization" ? this.candidateIntegrity(manifest, candidates)?.events.find((event) => event.constructionEvent?.type === "construction.mission-created")?.event : undefined;
    const control = createHistoryControl({ id: next(), journalId: next(), recordedAt: time.toISOString(), producer: this.producer, manifest, decisionReference: decision, causes: selected ? [selected.control.id] : creation ? [creation.id] : [] });
    const existingGuards = manifest.format === "kepler.mission-history-rebuild" ? snapshot.files.filter((file) => file.origin === recordHomeOrigin(snapshot) && file.path.startsWith(`${portable(snapshot.missionId)}/control/`) && file.path.split("/").length === 6).flatMap((file) => { try { return [parseHistoryGuard(parseStrictValue(decoder.decode(file.bytes)), selected!.control)]; } catch { return []; } }) : [];
    if (operation === "publish" && existingGuards.length !== 1) throw new HistoryError("history_guard_missing", "Publication requires its one exact original reset guard.");
    const guard = existingGuards[0] ?? parseHistoryGuard({ id: next(), phase: "construction", type: "construction.history-generation-required", envelope_version: 1, event_version: 1, journal_id: next(), recorded_at: time.toISOString(), producer: this.producer, caused_by: [control.id], data: { mission_id: snapshot.missionId, generation_id: manifest.generation_id, control_event_id: control.id } }, control);
    const rawActivation = snapshot.files.find((file) => file.origin === recordHomeOrigin(snapshot) && file.path === `${portable(snapshot.missionId)}/control/active.json`);
    const rawBinding = snapshot.files.find((file) => file.origin === "local-runtime" && file.path === bindingPath(snapshot.missionId));
    return parseHistoryOperationIntent({ format: "kepler.mission-history-operation", version: 1, key, operation, record_home_origin: recordHomeOrigin(snapshot), mission_id: snapshot.missionId, generation_id: manifest.generation_id, manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: decision, control, guard, predecessor: selected ? { event: selected.control, bytes_base64: Buffer.from(selected.bytes).toString("base64") } : null, archive_index: index, candidate_journals: candidates.map(({ bytes: content, ...metadata }) => ({ ...metadata, bytes_base64: Buffer.from(content).toString("base64") })), original_sources: historyInventory(snapshot), replacement_inputs: [rawActivation, rawBinding].flatMap((file) => file ? [{ source_id: file.sourceId, bytes_base64: Buffer.from(file.bytes).toString("base64") }] : []), original_unavailable: snapshot.unavailable, activation_input: rawActivation ? historyDigest(rawActivation.bytes) : null, binding_input: rawBinding ? historyDigest(rawBinding.bytes) : null, checks: [check] });
  }

  private outputs(intent: HistoryOperationIntent): OwnedOutput[] {
    const control = eventBytes(intent.control);
    const binding: LiveHistoryBinding = { format: "kepler.mission-history-binding", version: 1, mission_id: intent.mission_id, generation_id: intent.generation_id, history_version: intent.control.id, selection_hash: historyDigest(control), origins: [intent.record_home_origin] };
    return [
      { origin: "local-runtime", path: pendingPath(intent), bytes: bytes(intent) },
      { origin: "local-runtime", path: completedPath(intent), bytes: bytes(intent) },
      { origin: intent.record_home_origin, path: `${portable(intent.mission_id)}/control/events/${intent.control.journal_id}.jsonl`, bytes: control },
      { origin: intent.record_home_origin, path: `${portable(intent.mission_id)}/control/${intent.guard.journal_id}.jsonl`, bytes: eventBytes(intent.guard) },
      { origin: intent.record_home_origin, path: `${portable(intent.mission_id)}/control/active.json`, bytes: control },
      { origin: "local-runtime", path: bindingPath(intent.mission_id), bytes: bytes(binding) },
      ...intent.candidate_journals.map((journal) => ({ origin: intent.record_home_origin, path: `${portable(intent.mission_id)}/generations/${intent.generation_id}/${journal.phase}/${journal.journal_id}.jsonl`, bytes: new Uint8Array(Buffer.from(journal.bytes_base64, "base64")) })),
      ...(intent.predecessor ? [{ origin: intent.record_home_origin, path: `${portable(intent.mission_id)}/control/events/${intent.predecessor.event.journal_id}.jsonl`, bytes: new Uint8Array(Buffer.from(intent.predecessor.bytes_base64, "base64")) }] : []),
    ];
  }

  private async originalUnavailable(intent: HistoryOperationIntent, current: HistorySnapshot, outputs: readonly OwnedOutput[], archive?: PreservedHistoryArchive): Promise<HistorySnapshot["unavailable"]> {
    const original = intent.original_unavailable;
    const manifest = intent.control.data.manifest;
    if (manifest.format !== "kepler.mission-history-reset" || !manifest.known_missing_sources.length || !archive) return original;
    const path = bindingPath(intent.mission_id);
    const sourceId = `local-runtime:${path}`;
    const originalBinding = intent.original_sources.find((source) => source.source_id === sourceId && source.origin === "local-runtime" && source.path === path);
    const bindingInput = intent.replacement_inputs.find((input) => input.source_id === sourceId);
    const archivedBinding = archive.files.find((file) => file.source_id === sourceId && file.origin === "local-runtime" && file.path === path);
    const currentBinding = current.files.find((file) => file.origin === "local-runtime" && file.path === path);
    const bindingOutput = outputs.find((output) => output.origin === "local-runtime" && output.path === path);
    if (!originalBinding || !bindingInput || !archivedBinding || !currentBinding || !bindingOutput || intent.binding_input === null) return original;
    const previousBytes = new Uint8Array(Buffer.from(bindingInput.bytes_base64, "base64"));
    if (previousBytes.length !== originalBinding.byte_length || historyDigest(previousBytes) !== originalBinding.content_version || historyDigest(previousBytes) !== intent.binding_input || !equal(previousBytes, archivedBinding.bytes) || !equal(currentBinding.bytes, bindingOutput.bytes)) return original;
    let previousBinding: LiveHistoryBinding;
    let publishedBinding: LiveHistoryBinding;
    try {
      previousBinding = parseLiveHistoryBinding(previousBytes);
      publishedBinding = parseLiveHistoryBinding(currentBinding.bytes);
    } catch { return original; }
    if (previousBinding.mission_id !== intent.mission_id || publishedBinding.mission_id !== intent.mission_id || publishedBinding.history_version !== intent.control.id || publishedBinding.generation_id !== intent.generation_id || publishedBinding.selection_hash !== historyDigest(eventBytes(intent.control)) || publishedBinding.origins.length !== 1 || publishedBinding.origins[0] !== intent.record_home_origin) return original;
    const context = await this.access.storage.context(current.recordHome);
    if (context.recordHome !== current.recordHome || context.commonDirectory !== current.commonDirectory) throw new HistoryError("history_operation_context_changed", "The physical record home or Git common directory changed during recovery.");
    const missionPath = `.kepler/missions/${intent.mission_id}`;
    const activePath = `${missionPath}/history/control/active.json`;
    const selectedActivation = archive.files.find((file) => previousBinding.origins.includes(file.origin) && file.path === activePath && historyDigest(file.bytes) === previousBinding.selection_hash);
    if (intent.predecessor) {
      const predecessorBytes = new Uint8Array(Buffer.from(intent.predecessor.bytes_base64, "base64"));
      if (!selectedActivation || intent.predecessor.event.id !== previousBinding.history_version || intent.predecessor.event.data.generation_id !== previousBinding.generation_id || historyDigest(predecessorBytes) !== previousBinding.selection_hash) return original;
    } else {
      if (manifest.previous_control.event_id !== null || manifest.previous_control.content_version !== intent.activation_input) return original;
      const homeSourceId = `${intent.record_home_origin}:${activePath}`;
      if (intent.activation_input === null) {
        const missingHomeSelector = original.find((source) => source.source_id === homeSourceId && source.path === activePath && source.kind === "missing");
        if (!missingHomeSelector || !manifest.known_missing_sources.some((loss) => loss.reference === homeSourceId)) return original;
      } else {
        const selectorSource = intent.original_sources.find((source) => source.source_id === homeSourceId && source.origin === intent.record_home_origin && source.path === activePath);
        const selectorInput = intent.replacement_inputs.find((input) => input.source_id === homeSourceId);
        const archivedSelector = archive.files.find((file) => file.source_id === homeSourceId && file.origin === intent.record_home_origin && file.path === activePath);
        const selectorBytes = selectorInput ? new Uint8Array(Buffer.from(selectorInput.bytes_base64, "base64")) : undefined;
        if (!selectorSource || !selectorInput || !archivedSelector || !selectorBytes || selectorSource.content_version !== intent.activation_input || selectorBytes.length !== selectorSource.byte_length || historyDigest(selectorBytes) !== intent.activation_input || !equal(selectorBytes, archivedSelector.bytes)) return original;
      }
    }
    const homeSourceId = `${intent.record_home_origin}:${activePath}`;
    const activeOutput = outputs.find((output) => output.origin === intent.record_home_origin && output.path === activePath);
    const activeOutputPresent = Boolean(activeOutput && current.files.some((file) => file.origin === intent.record_home_origin && file.path === activePath && equal(file.bytes, activeOutput.bytes)));
    const released = new Set<string>();
    for (const unavailable of original) {
      if (unavailable.kind !== "missing" || !manifest.known_missing_sources.some((loss) => loss.reference === unavailable.source_id) || unavailable.path !== missionPath && unavailable.path !== activePath) continue;
      const originId = previousBinding.origins.find((origin) => unavailable.source_id === `${origin}:${unavailable.path}`);
      if (!originId) continue;
      if (unavailable.source_id === homeSourceId && unavailable.path === activePath) {
        if (!publishedBinding.origins.includes(originId) || !activeOutputPresent) continue;
        if (current.unavailable.some((source) => source.source_id === unavailable.source_id)) throw new HistoryError("history_source_changed", "The approved home selector remains unavailable after its exact replacement.", { source_id: unavailable.source_id });
        released.add(unavailable.source_id);
        continue;
      }
      if (current.unavailable.some((source) => source.source_id === unavailable.source_id) || publishedBinding.origins.includes(originId)) continue;
      const origin = context.origins.find((candidate) => candidate.id === originId);
      const snapshotOrigin = current.origins.find((candidate) => candidate.id === originId);
      if (!origin || !snapshotOrigin) continue;
      if (origin.root !== snapshotOrigin.root) throw new HistoryError("history_operation_context_changed", "A previously bound source now resolves to another physical origin.", { origin_id: originId });
      let stillMissing: boolean;
      try {
        const missions = await this.access.storage.files.list({ root: origin.root, relative: ".kepler/missions" });
        const mission = missions.find((entry) => entry.name === intent.mission_id);
        stillMissing = unavailable.path === missionPath ? mission === undefined : mission?.kind === "directory" && await this.access.storage.files.read({ root: origin.root, relative: activePath }) === undefined;
      } catch (error) {
        throw new HistoryError("history_source_changed", "An approved missing bound source could not be confirmed absent.", { source_id: unavailable.source_id, reason: message(error) });
      }
      if (stillMissing) released.add(unavailable.source_id);
    }
    return original.filter((source) => !released.has(source.source_id));
  }

  private async originalSnapshot(intent: HistoryOperationIntent, current: HistorySnapshot, preserved?: PreservedHistoryArchive): Promise<HistorySnapshot> {
    let archive = preserved;
    if (!archive) {
      try { archive = await this.archives.verify(current.recordHome, intent.mission_id, intent.archive_index.archive_id, { manifestHash: intent.archive_index.manifest_hash, indexHash: historyArchiveIndexDigest(intent.archive_index) }); }
      catch (error) { if (!(error instanceof HistoryError) || error.code !== "history_archive_missing") throw error; }
    }
    const outputs = this.outputs(intent);
    const originals: HistorySnapshotFile[] = [];
    for (const file of current.files) {
      const original = intent.original_sources.find((source) => matchSource(source, file));
      if (original) { originals.push(file); continue; }
      const owned = outputs.find((output) => output.origin === file.origin && output.path === file.path && equal(output.bytes, file.bytes));
      const temporary = outputs.find((output) => {
        const parts = output.path.split("/"); const name = parts.pop()!;
        return output.origin === file.origin && file.path === `${parts.join("/")}/.${name}.${historyDigest(output.bytes).slice(7)}.pending` && prefix(file.bytes, output.bytes);
      });
      if (!owned && !temporary) throw new HistoryError("history_source_changed", "An input changed or an unrecognized output appeared after approval.", { source_id: file.sourceId, path: file.path });
    }
    const manifest = intent.control.data.manifest;
    for (const source of intent.original_sources) {
      if (originals.some((file) => matchSource(source, file))) continue;
      const output = outputs.find((value) => value.origin === source.origin && value.path === source.path && current.files.some((file) => file.origin === value.origin && file.path === value.path && equal(file.bytes, value.bytes)));
      const retired = manifest.format !== "kepler.mission-history-rebuild" && manifest.source_retirement.some((value) => value.source_id === source.source_id && value.path === source.path);
      const replaced = intent.replacement_inputs.find((input) => input.source_id === source.source_id);
      const candidate = replaced ? { source_id: source.source_id, path: source.path, bytes: new Uint8Array(Buffer.from(replaced.bytes_base64, "base64")) } : archive?.files.find((file) => file.source_id === source.source_id && file.path === source.path);
      const archived = candidate && candidate.bytes.length === source.byte_length && historyDigest(candidate.bytes) === source.content_version ? candidate : undefined;
      if ((!output && !retired) || !archived) throw new HistoryError("history_source_changed", "An approved original source is unavailable outside its exact retained steps.", { source_id: source.source_id });
      originals.push({ sourceId: source.source_id, origin: source.origin, path: source.path, bytes: new Uint8Array(archived.bytes) });
    }
    const expectedUnavailable = await this.originalUnavailable(intent, current, outputs, archive);
    if (canonicalJson(current.unavailable) !== canonicalJson(expectedUnavailable)) throw new HistoryError("history_source_changed", "Known unavailable source conditions changed after approval.");
    return { ...current, files: originals, unavailable: intent.original_unavailable };
  }

  private async retire(intent: HistoryOperationIntent, scope: HistoryExclusiveScope, archive: PreservedHistoryArchive): Promise<void> {
    const manifest = intent.control.data.manifest;
    if (manifest.format === "kepler.mission-history-rebuild") return;
    const directories = new Map<string, HistoryLocation>();
    for (const entry of manifest.source_retirement) {
      const original = archive.files.find((file) => file.source_id === entry.source_id && file.path === entry.path);
      const source = intent.original_sources.find((source) => source.source_id === entry.source_id && source.path === entry.path);
      const origin = scope.context.origins.find((origin) => origin.id === source?.origin);
      if (!original || !origin || historyDigest(original.bytes) !== entry.content_version) throw new HistoryError("history_retirement_unverified", "Retirement lacks its exact preserved source and physical origin.");
      await this.access.storage.files.remove({ root: origin.root, relative: entry.path }, entry.content_version);
      const relative = entry.path.slice(0, entry.path.lastIndexOf("/"));
      directories.set(`${origin.id}:${relative}`, { root: origin.root, relative });
    }
    for (const origin of scope.context.origins) {
      for (const entry of await this.access.storage.files.list({ root: origin.root, relative: portable(intent.mission_id) })) {
        if (["control", "generations"].includes(entry.name)) continue;
        if (entry.kind !== "directory" || entry.name !== "construction") throw new HistoryError("history_retirement_incomplete", "An unrecognized legacy entry remains preserved and blocks completion.", { path: `${portable(intent.mission_id)}/${entry.name}` });
        const relative = `${portable(intent.mission_id)}/construction`;
        directories.set(`${origin.id}:${relative}`, { root: origin.root, relative });
      }
    }
    for (const directory of directories.values()) if (await this.access.storage.files.removeEmptyDirectory(directory) === "not-empty") throw new HistoryError("history_retirement_incomplete", "Unknown or changed entries keep legacy retirement incomplete.", { path: directory.relative });
  }

  private async writeOutput(scope: HistoryExclusiveScope, output: OwnedOutput, mode: Parameters<HistoryAccess["storage"]["files"]["write"]>[2]): Promise<void> {
    const root = output.origin === "local-runtime" ? scope.context.commonDirectory : scope.context.origins.find((origin) => origin.id === output.origin)?.root;
    if (!root) throw new HistoryError("history_operation_context_changed", "An output no longer has its original verified origin.");
    await this.access.storage.files.write({ root, relative: output.path }, new Uint8Array(output.bytes), mode);
  }

  private async load(recordHome: string, missionId: string, key: HistoryDigest): Promise<{ readonly pending?: HistoryOperationIntent; readonly completed?: HistoryOperationIntent }> {
    const context = await this.access.storage.context(recordHome);
    const read = async (relative: string): Promise<HistoryOperationIntent | undefined> => {
      const raw = await this.access.storage.files.read({ root: context.commonDirectory, relative });
      if (!raw) return undefined;
      const intent = parseHistoryOperationIntent(decoder.decode(raw));
      if (intent.key !== key || intent.mission_id !== missionId || !equal(bytes(intent), raw)) throw new HistoryError("history_intent_conflict", "The retained instructions do not match their exact operation coordinate.");
      return intent;
    };
    const coordinate = { mission_id: missionId, key };
    const pending = await read(pendingPath(coordinate));
    const completed = await read(completedPath(coordinate));
    if (pending && completed && canonicalJson(pending) !== canonicalJson(completed)) throw new HistoryError("history_intent_conflict", "Pending and completed copies contain conflicting operation instructions.");
    return { pending, completed };
  }

  private async receipt(intent: HistoryOperationIntent, recordHome: string, repeated: boolean): Promise<Readonly<Record<string, unknown>>> {
    await this.archives.verify(recordHome, intent.mission_id, intent.archive_index.archive_id, { manifestHash: intent.archive_index.manifest_hash, indexHash: historyArchiveIndexDigest(intent.archive_index) });
    const context = await this.access.storage.context(recordHome);
    const originalRoot = context.origins.find((origin) => origin.id === intent.record_home_origin)?.root ?? context.recordHome;
    for (const output of this.outputs(intent).filter((output) => output.path.includes("/control/") && !output.path.endsWith("active.json"))) {
      const actual = await this.access.storage.files.read({ root: originalRoot, relative: output.path });
      if (!actual || !equal(actual, output.bytes)) throw new HistoryError("history_receipt_unverified", "Original immutable control output is missing or changed.", { path: output.path });
    }
    for (const journal of intent.candidate_journals) {
      const expected = new Uint8Array(Buffer.from(journal.bytes_base64, "base64"));
      const actual = await this.access.storage.files.read({ root: originalRoot, relative: `${portable(intent.mission_id)}/generations/${intent.generation_id}/${journal.phase}/${journal.journal_id}.jsonl` });
      if (!actual || !prefix(expected, actual)) throw new HistoryError("history_receipt_unverified", "A published original journal prefix is missing or changed.", { journal_id: journal.journal_id });
    }
    let current: SelectedControl | undefined;
    try { current = await this.selected(await this.access.storage.snapshot(recordHome, intent.mission_id)); } catch {}
    return { mission_id: intent.mission_id, generation_id: current?.control.data.generation_id ?? null, history_version: current?.control.id ?? null, mode: current ? historyMode(current.control) : null, current_selection_status: current ? "validated" : "blocked", execution_started: false, already_applied: repeated, receipt: { history_version: intent.control.id, generation_id: intent.generation_id, mode: intent.operation === "reset" ? "recovering" : "active", manifest_hash: intent.manifest_hash, archive_reference: `local-archive:${intent.archive_index.archive_id}` }, current_history_version: current?.control.id ?? null };
  }
}

const parseHistoryControlManifest = (manifest: HistoryManifest): HistoryManifest => parseHistoryManifest(manifest);
const parseStrictValue = (input: string): unknown => { const value = parseStrictJson(input); if (value.kind !== "parsed") throw new HistoryError("history_control_invalid", "The exact control material is not one strict JSON value."); return value.value; };
