import { Ajv, type AnySchemaObject } from "ajv";
import { parseStrictJson } from "../json/strict-json.js";
import { HistoryAccess } from "./access.js";
import { HistoryArchives } from "./archives.js";
import { historyArchiveIndexDigest } from "./archive-index.js";
import { HistoryError, historyDigest, historyManifestDigest, parseHistoryManifest, type HistoryControl, type HistoryRebuildManifest } from "./control.js";
import type { HistorySnapshot } from "./files.js";
import { canonicalJson, scanJournalBytes } from "./journal.js";
import { parseReconstructionPlan, prepareReconstruction, type PreparedReconstruction, type ReconstructionDependencies, type ReconstructionIdentityReservations, type ReconstructionPlan } from "./reconstruction.js";

export interface HistoryDraft {
  readonly format: "kepler.mission-history-draft";
  readonly version: 1;
  readonly candidate_id: string;
  readonly plan: ReconstructionPlan;
  readonly manifest: HistoryRebuildManifest;
  readonly reset_hash: string;
  readonly recorded_at: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly identities: readonly string[];
}

export interface HistoryDraftRuntime extends Omit<ReconstructionDependencies, "identity_reservations"> {
  readonly access: HistoryAccess;
  readonly archives: HistoryArchives;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const validate = new Ajv({ strict: true }).compile(object({
  format: { const: "kepler.mission-history-draft" }, version: { const: 1 }, candidate_id: { type: "string", pattern: uuid.source },
  plan: { type: "object" }, manifest: { type: "object" }, reset_hash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
  recorded_at: text, producer: object({ name: text, version: text }), identities: { type: "array", uniqueItems: true, items: { type: "string", pattern: uuid.source } },
}));
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const serialize = (value: unknown): Uint8Array => encoder.encode(`${canonicalJson(value)}\n`);
const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, index) => value === b[index]);
const draftBase = (missionId: string, candidateId: string): string => `kepler/missions/${missionId}/recovery/drafts/${candidateId}`;
const reference = (candidateId: string, phase: string, journalId: string): string => `local-draft:${candidateId}/${phase}/${journalId}.jsonl`;
const strict = (value: unknown): unknown => {
  try { const parsed = parseStrictJson(typeof value === "string" ? value : canonicalJson(value)); if (parsed.kind === "parsed") return parsed.value; } catch {}
  throw new HistoryError("history_draft_invalid", "Draft data must contain one strict JSON value.");
};

export const parseHistoryDraft = (input: unknown): HistoryDraft => {
  const parsed = strict(input);
  if (!validate(parsed)) throw new HistoryError("history_draft_invalid", "Draft data must match the strict version-1 format.");
  const draft = parsed as HistoryDraft;
  const plan = parseReconstructionPlan(draft.plan);
  const manifest = parseHistoryManifest(draft.manifest);
  if (manifest.format !== "kepler.mission-history-rebuild" || manifest.mission_id !== plan.mission_id || manifest.generation_id !== plan.generation_id || manifest.reset_event_id !== plan.reset_event_id || manifest.archive_id !== plan.archive_id || !Number.isFinite(Date.parse(draft.recorded_at))) throw new HistoryError("history_draft_invalid", "Draft plan, manifest, recording time, and reset scope do not agree.");
  if (manifest.candidate_journals.some((journal) => journal.reference !== reference(draft.candidate_id, journal.phase, journal.journal_id))) throw new HistoryError("history_draft_invalid", "Draft references must identify their exact candidate and journal.");
  return { ...draft, plan, manifest };
};

export const historyControlReservations = (snapshot: HistorySnapshot): ReconstructionIdentityReservations => {
  const events = new Set<string>();
  const journals = new Set<string>();
  for (const file of snapshot.files) {
    if (!file.path.startsWith(`.kepler/missions/${snapshot.missionId}/history/control/`)) continue;
    for (const line of scanJournalBytes(file.bytes).lines) {
      const event = line.event;
      if (event) { events.add(event.id); journals.add(event.journal_id); }
    }
  }
  return { event_ids: [...events].sort(), journal_ids: [...journals].sort() };
};

const bindCandidate = (candidateId: string, prepared: PreparedReconstruction): PreparedReconstruction => {
  const candidate_journals = prepared.candidate_journals.map((journal) => ({ ...journal, reference: reference(candidateId, journal.phase, journal.journal_id), bytes: new Uint8Array(journal.bytes) }));
  const manifest = parseHistoryManifest({ ...prepared.manifest, candidate_journals: candidate_journals.map(({ bytes: _bytes, ...metadata }) => metadata) });
  if (manifest.format !== "kepler.mission-history-rebuild") throw new HistoryError("history_draft_invalid", "A candidate requires a reconstruction manifest.");
  return { ...prepared, manifest, candidate_journals };
};

export class HistoryDrafts {
  private readonly runtime: HistoryDraftRuntime;

  public constructor(runtime: HistoryDraftRuntime) {
    if (typeof runtime.verifyAuthority !== "function" || typeof runtime.verifyMaterial !== "function" || typeof runtime.verifyContinuation !== "function" || typeof runtime.identity !== "function" || typeof runtime.clock !== "function") throw new HistoryError("history_reconstruction_verifier_required", "Draft preparation requires actual identity, authority, material, and continuation providers.");
    this.runtime = { ...runtime, producer: Object.freeze({ ...runtime.producer }) };
  }

  public async prepare(scope: { readonly recordHome: string; readonly missionId: string }, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const value = strict(input);
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "candidate_id") || !Object.hasOwn(value, "plan")) throw new HistoryError("history_draft_request_invalid", "Preparation requires exactly candidate_id and plan.");
    const request = value as { readonly candidate_id: string; readonly plan: unknown };
    if (typeof request.candidate_id !== "string" || !uuid.test(request.candidate_id)) throw new HistoryError("history_draft_request_invalid", "A candidate requires an explicit lowercase UUIDv4 identity.");
    const plan = parseReconstructionPlan(request.plan);
    if (plan.mission_id !== scope.missionId) throw new HistoryError("history_scope_invalid", "The selected mission does not match the reconstruction plan.");
    const target = { ...scope };
    return this.runtime.access.withRecovery(target.recordHome, target.missionId, async (fence) => {
      const selected = await this.runtime.access.read(fence.context.recordHome, target.missionId);
      if (selected.mode !== "recovering" || selected.pendingRecovery || selected.historyVersion !== plan.reset_event_id) throw new HistoryError("history_draft_reset_required", "Preparation requires the current reset with no incomplete publication or retirement.");
      const reset = selected.control!;
      const location = { root: fence.context.commonDirectory, relative: `${draftBase(target.missionId, request.candidate_id)}/draft.json` };
      const existing = await this.runtime.access.storage.files.read(location);
      let draft: HistoryDraft;
      let prepared: PreparedReconstruction;
      if (existing) {
        draft = parseHistoryDraft(decoder.decode(existing));
        if (!equal(existing, serialize(draft)) || draft.candidate_id !== request.candidate_id || canonicalJson(draft.plan) !== canonicalJson(plan)) throw new HistoryError("history_draft_conflict", "This candidate already retains different or changed preparation instructions.");
        prepared = await this.replay(fence.context.recordHome, draft, reset, await this.runtime.access.snapshot(fence));
      } else {
        const recordedAt = this.runtime.clock();
        if (!(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime())) throw new HistoryError("history_clock_invalid", "Candidate recording requires a valid current time.");
        const identities: string[] = [];
        prepared = bindCandidate(request.candidate_id, await prepareReconstruction({
          ...this.runtime, plan, reset, archive: await this.archive(fence.context.recordHome, plan, reset),
          identity_reservations: historyControlReservations(await this.runtime.access.snapshot(fence)),
          identity: () => { const id = this.runtime.identity(); identities.push(id); return id; },
          clock: () => new Date(recordedAt),
        }));
        draft = parseHistoryDraft({ format: "kepler.mission-history-draft", version: 1, candidate_id: request.candidate_id, plan, manifest: prepared.manifest, reset_hash: historyManifestDigest(reset.data.manifest), recorded_at: recordedAt.toISOString(), producer: this.runtime.producer, identities });
      }
      const current = await this.runtime.access.read(fence.context.recordHome, target.missionId);
      if (current.historyVersion !== reset.id || current.pendingRecovery || current.mode !== "recovering") throw new HistoryError("history_draft_reset_changed", "The selected reset changed during candidate verification.");
      await this.runtime.access.storage.files.write(location, serialize(draft), { kind: "create" });
      for (const journal of prepared.candidate_journals) await this.runtime.access.storage.files.write({ root: fence.context.commonDirectory, relative: `${draftBase(target.missionId, request.candidate_id)}/${journal.phase}/${journal.journal_id}.jsonl` }, new Uint8Array(journal.bytes), { kind: "create" });
      await this.verifyFiles(fence.context.commonDirectory, draft, prepared);
      return { candidate_reference: `local-draft:${request.candidate_id}`, manifest: prepared.manifest, manifest_hash: historyManifestDigest(prepared.manifest), execution_started: false, published: false };
    });
  }

  public async verify(scope: { readonly recordHome: string; readonly missionId: string }, input: unknown): Promise<PreparedReconstruction> {
    const manifest = parseHistoryManifest(input);
    if (manifest.format !== "kepler.mission-history-rebuild" || manifest.mission_id !== scope.missionId) throw new HistoryError("history_draft_scope_invalid", "Publication requires a reconstruction candidate for the selected mission.");
    const first = manifest.candidate_journals[0];
    const match = first?.reference.match(/^local-draft:([0-9a-f-]{36})\/construction\/([0-9a-f-]{36})\.jsonl$/);
    if (!match || !uuid.test(match[1]!)) throw new HistoryError("history_draft_reference_invalid", "The approved candidate has no supported local draft reference.");
    const context = await this.runtime.access.storage.context(scope.recordHome);
    const raw = await this.runtime.access.storage.files.read({ root: context.commonDirectory, relative: `${draftBase(scope.missionId, match[1]!)}/draft.json` });
    if (!raw) throw new HistoryError("history_draft_missing", "The exact retained preparation instructions are unavailable.");
    const draft = parseHistoryDraft(decoder.decode(raw));
    if (draft.candidate_id !== match[1] || !equal(raw, serialize(draft)) || canonicalJson(draft.manifest) !== canonicalJson(manifest)) throw new HistoryError("history_draft_conflict", "Stored preparation and approved candidate manifest differ.");
    const selection = await this.runtime.access.storage.selection(context.recordHome, scope.missionId);
    const reset = selection.rootControl;
    if (!reset || reset.type !== "mission.history-reset" || reset.id !== manifest.reset_event_id || reset.data.generation_id !== manifest.generation_id) throw new HistoryError("history_draft_reset_changed", "The local candidate no longer belongs to its selected reset.");
    const prepared = await this.replay(context.recordHome, draft, reset, await this.runtime.access.storage.snapshot(context.recordHome, scope.missionId));
    await this.verifyFiles(context.commonDirectory, draft, prepared);
    return prepared;
  }

  private async archive(recordHome: string, plan: ReconstructionPlan, reset: HistoryControl) {
    const archive = await this.runtime.archives.verify(recordHome, plan.mission_id, plan.archive_id, { manifestHash: historyManifestDigest(reset.data.manifest), indexHash: plan.archive_inventory_hash });
    if (historyArchiveIndexDigest(archive.index) !== plan.archive_inventory_hash) throw new HistoryError("history_draft_archive_changed", "The preserved reconstruction inventory changed.");
    return { index: archive.index, files: archive.files };
  }

  private async replay(recordHome: string, draft: HistoryDraft, reset: HistoryControl, snapshot: HistorySnapshot): Promise<PreparedReconstruction> {
    if (historyManifestDigest(reset.data.manifest) !== draft.reset_hash) throw new HistoryError("history_draft_reset_changed", "The original reset manifest changed.");
    let position = 0;
    const prepared = bindCandidate(draft.candidate_id, await prepareReconstruction({
      ...this.runtime, plan: draft.plan, reset, archive: await this.archive(recordHome, draft.plan, reset),
      identity_reservations: historyControlReservations(snapshot),
      producer: draft.producer, clock: () => new Date(draft.recorded_at),
      identity: () => { const id = draft.identities[position++]; if (!id) throw new HistoryError("history_draft_identity_changed", "Retained identity instructions ended before compilation."); return id; },
    }));
    if (position !== draft.identities.length || canonicalJson(prepared.manifest) !== canonicalJson(draft.manifest)) throw new HistoryError("history_draft_candidate_changed", "Independent re-compilation differs from the retained approved candidate.");
    return prepared;
  }

  private async verifyFiles(commonDirectory: string, draft: HistoryDraft, prepared: PreparedReconstruction): Promise<void> {
    const base = draftBase(draft.manifest.mission_id, draft.candidate_id);
    const files = this.runtime.access.storage.files;
    const expected = new Map<string, Uint8Array>([["draft.json", serialize(draft)], ...prepared.candidate_journals.map((journal): [string, Uint8Array] => [`${journal.phase}/${journal.journal_id}.jsonl`, journal.bytes])]);
    const walk = async (relative: string): Promise<void> => {
      for (const entry of await files.list({ root: commonDirectory, relative: relative ? `${base}/${relative}` : base })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.kind === "directory" && path === "construction") await walk(path);
        else if (entry.kind !== "file" || !expected.has(path)) throw new HistoryError("history_draft_unexpected_source", "Unrecognized candidate entries remain preserved and block publication.", { path });
      }
    };
    await walk("");
    for (const [path, value] of expected) {
      const actual = await files.read({ root: commonDirectory, relative: `${base}/${path}` });
      if (!actual || !equal(actual, value)) throw new HistoryError("history_draft_candidate_changed", "A retained candidate file is missing or changed.", { path });
    }
  }
}
