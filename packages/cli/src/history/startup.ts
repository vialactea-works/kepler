import { EVENT_ENVELOPE_VERSION, validateEventEnvelope, type EventEnvelope } from "@vialactea-works/kepler-core";
import { collectHistory } from "./collection.js";
import { createHistoryControl, historyDigest, parseHistoryControl, parseHistoryGuard, parseHistoryManifest, HistoryError, type HistoryControl, type HistoryGenerationGuard, type HistoryInitializationManifest } from "./control.js";
import { parseLiveHistoryBinding, type HistoryExclusiveScope, type HistoryAccess, type CoordinatedHistory } from "./access.js";
import { canonicalJson, createEventJournal, scanJournalBytes, serializeJournalEvent } from "./journal.js";
import { historyState } from "./gateway.js";
import type { MissionStartupRequest } from "../construction/mission-startup.js";
import { validateConstructionEvent, type MissionId } from "../construction/events.js";
import type { EventJournal } from "./journal.js";

export interface MissionStartupHistoryIntent {
  readonly format: "kepler.mission-startup-history.v1";
  readonly generationId: string;
  readonly manifest: HistoryInitializationManifest;
  readonly control: HistoryControl;
  readonly guard: HistoryGenerationGuard;
  readonly phaseJournalBytes: string;
  readonly controlJournalBytes: string;
  readonly guardJournalBytes: string;
  readonly activationBytes: string;
}

export interface MissionStartupHistoryView {
  readonly mode: "legacy" | "active" | "recovering";
  readonly generationId?: string;
  readonly historyVersion?: string;
  readonly pendingRecovery: boolean;
  readonly history: CoordinatedHistory["history"];
  readonly retainedPreparationAppend?: true;
}

export interface MissionStartupHistoryScope {
  readonly read: () => Promise<MissionStartupHistoryView>;
  readonly createJournal: (journalId: string, generationId: string) => EventJournal;
  readonly initialize: (intent: MissionStartupHistoryIntent, createdEvent: EventEnvelope<unknown>, preparedEvent: EventEnvelope<unknown>) => Promise<MissionStartupHistoryView>;
}

export interface MissionStartupHistoryJournalCoordinates {
  readonly recordHome: string;
  readonly missionId: string;
  readonly journalId: string;
  readonly generationId: string;
}

export type MissionStartupHistoryJournalFactory = (coordinates: MissionStartupHistoryJournalCoordinates) => EventJournal;

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const encoder = new TextEncoder();
const bytes = (event: EventEnvelope<unknown>): Uint8Array => {
  const validated = validateEventEnvelope(event);
  if (validated.status !== "valid") throw new HistoryError("history_startup_event_invalid", "Startup history requires a supported event envelope.", { validation: validated });
  return encoder.encode(`${serializeJournalEvent(validated.event)}\n`);
};
const encode = (value: Uint8Array): string => Buffer.from(value).toString("base64");
const decode = (value: unknown): Uint8Array => {
  if (typeof value !== "string") throw new Error("Expected retained startup bytes");
  const result = Buffer.from(value, "base64");
  if (result.toString("base64") !== value) throw new Error("Retained startup bytes are not canonical base64");
  return new Uint8Array(result);
};
const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);
const prefix = (shorter: Uint8Array, longer: Uint8Array): boolean => shorter.length <= longer.length && shorter.every((byte, index) => byte === longer[index]);
const sameJson = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
const missionHistory = (missionId: string): string => `.kepler/missions/${missionId}/history`;
const phasePath = (missionId: string, generationId: string, journalId: string): string => `${missionHistory(missionId)}/generations/${generationId}/construction/${journalId}.jsonl`;
const controlPath = (missionId: string, journalId: string): string => `${missionHistory(missionId)}/control/events/${journalId}.jsonl`;
const guardPath = (missionId: string, journalId: string): string => `${missionHistory(missionId)}/control/${journalId}.jsonl`;
const activationPath = (missionId: string): string => `${missionHistory(missionId)}/control/active.json`;

const manifestFor = (input: {
  readonly request: MissionStartupRequest;
  readonly missionId: MissionId;
  readonly generationId: string;
  readonly journalId: string;
  readonly createdEvent: EventEnvelope<unknown>;
  readonly producer: { readonly name: string; readonly version: string };
  readonly phaseBytes: Uint8Array;
}): HistoryInitializationManifest => {
  const reference = phasePath(input.missionId, input.generationId, input.journalId);
  const source = {
    sourceId: `startup:${reference}`,
    missionId: input.missionId,
    generationId: input.generationId,
    phase: "construction",
    journalId: input.journalId,
    bytes: input.phaseBytes,
  };
  const expected = collectHistory(input.missionId, [source], { completeness: "complete", generationId: input.generationId });
  const expectedState = historyState(expected);
  return {
    format: "kepler.mission-history-initialization",
    version: 1,
    operation: "create",
    mission_binding: {
      record_home_repository_id: input.request.recordHomeRepositoryId,
      mission_id: input.missionId,
      workflow: "standard",
      request_reference: input.request.request,
      unit_ids: [],
    },
    generation_id: input.generationId,
    source_inventory: [],
    archive_id: null,
    guide: null,
    guide_hash: null,
    candidate_journals: [{
      phase: "construction",
      journal_id: input.journalId,
      byte_length: input.phaseBytes.length,
      content_version: historyDigest(input.phaseBytes),
      reference,
    }],
    expected_state: expectedState,
    source_retirement: [],
    requester: input.producer.name,
    operation_authority: { kind: "startup-request", request_reference: input.request.request },
  };
};

export const createMissionStartupHistoryIntent = (input: {
  readonly request: MissionStartupRequest;
  readonly missionId: MissionId;
  readonly generationId: string;
  readonly journalId: string;
  readonly createdEvent: EventEnvelope<unknown>;
  readonly controlJournalId: string;
  readonly controlEventId: string;
  readonly guardJournalId: string;
  readonly guardEventId: string;
  readonly recordedAt: string;
  readonly producer: { readonly name: string; readonly version: string };
}): MissionStartupHistoryIntent => {
  const ids = [input.missionId, input.generationId, input.journalId, input.createdEvent.id, input.controlJournalId, input.controlEventId, input.guardJournalId, input.guardEventId];
  if (ids.some((id) => !uuidV4.test(id)) || new Set(ids).size !== ids.length || input.createdEvent.journal_id !== input.journalId ||
      input.createdEvent.phase !== "construction" || input.createdEvent.type !== "construction.mission-created") {
    throw new HistoryError("history_startup_identity_invalid", "Startup history requires unique, typed UUIDv4 identities for its initial generation and events.");
  }
  const phaseJournalBytes = bytes(input.createdEvent);
  const manifest = manifestFor({ ...input, phaseBytes: phaseJournalBytes });
  const control = createHistoryControl({
    id: input.controlEventId,
    journalId: input.controlJournalId,
    recordedAt: input.recordedAt,
    producer: input.producer,
    manifest,
    decisionReference: input.request.request,
    causes: [input.createdEvent.id],
  });
  const guard = parseHistoryGuard({
    id: input.guardEventId,
    phase: "construction",
    type: "construction.history-generation-required",
    envelope_version: EVENT_ENVELOPE_VERSION,
    event_version: 1,
    journal_id: input.guardJournalId,
    recorded_at: input.recordedAt,
    producer: input.producer,
    caused_by: [control.id],
    data: { mission_id: input.missionId, generation_id: input.generationId, control_event_id: control.id },
  }, control);
  const controlJournalBytes = bytes(control);
  const guardJournalBytes = bytes(guard);
  return {
    format: "kepler.mission-startup-history.v1",
    generationId: input.generationId,
    manifest,
    control,
    guard,
    phaseJournalBytes: encode(phaseJournalBytes),
    controlJournalBytes: encode(controlJournalBytes),
    guardJournalBytes: encode(guardJournalBytes),
    activationBytes: encode(controlJournalBytes),
  };
};

export const validateMissionStartupHistoryIntent = (input: {
  readonly value: unknown;
  readonly request: MissionStartupRequest;
  readonly missionId: MissionId;
  readonly journalId: string;
  readonly createdEvent: EventEnvelope<unknown>;
  readonly preparedEvent: EventEnvelope<unknown>;
}): MissionStartupHistoryIntent | undefined => {
  try {
    const value = input.value;
    if (!record(value) || !exactKeys(value, ["format", "generationId", "manifest", "control", "guard", "phaseJournalBytes", "controlJournalBytes", "guardJournalBytes", "activationBytes"]) ||
        value.format !== "kepler.mission-startup-history.v1" || typeof value.generationId !== "string" || !uuidV4.test(value.generationId)) return undefined;
    const manifest = parseHistoryManifest(value.manifest);
    if (manifest.format !== "kepler.mission-history-initialization" || manifest.operation !== "create" ||
        manifest.mission_binding.mission_id !== input.missionId || manifest.mission_binding.record_home_repository_id !== input.request.recordHomeRepositoryId ||
        manifest.mission_binding.workflow !== input.request.workflow || manifest.mission_binding.request_reference !== input.request.request ||
        manifest.mission_binding.unit_ids.length !== 0 || manifest.generation_id !== value.generationId || manifest.requester !== input.createdEvent.producer.name ||
        manifest.operation_authority.kind !== "startup-request" || manifest.operation_authority.request_reference !== input.request.request ||
        manifest.source_inventory.length !== 0 || manifest.archive_id !== null || manifest.guide !== null || manifest.guide_hash !== null || manifest.source_retirement.length !== 0 ||
        manifest.candidate_journals.length !== 1 || input.createdEvent.journal_id !== input.journalId) return undefined;
    const control = parseHistoryControl(value.control);
    const guard = parseHistoryGuard(value.guard, control);
    const phaseJournalBytes = decode(value.phaseJournalBytes);
    const controlJournalBytes = decode(value.controlJournalBytes);
    const guardJournalBytes = decode(value.guardJournalBytes);
    const activationBytes = decode(value.activationBytes);
    const expectedPhaseBytes = bytes(input.createdEvent);
    const expectedControlBytes = bytes(control);
    const expectedGuardBytes = bytes(guard);
    const candidate = manifest.candidate_journals[0]!;
    const reference = phasePath(input.missionId, value.generationId, input.journalId);
    const controlMatches = control.type === "mission.history-initialized" && control.id !== input.createdEvent.id &&
      control.journal_id !== input.journalId && control.data.mission_id === input.missionId && control.data.generation_id === value.generationId &&
      control.data.manifest_hash === historyDigest(canonicalJson(manifest)) && control.data.requester === manifest.requester &&
      control.data.decision_reference === input.request.request && sameJson(control.data.manifest, manifest) &&
      control.caused_by.length === 1 && control.caused_by[0] === input.createdEvent.id &&
      control.producer.name === input.createdEvent.producer.name && control.producer.version === input.createdEvent.producer.version;
    const guardMatches = guard.id !== control.id && guard.id !== input.createdEvent.id && guard.journal_id !== control.journal_id &&
      guard.journal_id !== input.journalId && guard.phase === "construction" && guard.type === "construction.history-generation-required" &&
      guard.event_version === 1 && guard.caused_by.length === 1 && guard.caused_by[0] === control.id &&
      guard.producer.name === control.producer.name && guard.producer.version === control.producer.version;
    const initial = collectHistory(input.missionId, [{
      sourceId: `startup:${reference}`,
      missionId: input.missionId,
      generationId: value.generationId,
      phase: "construction",
      journalId: input.journalId,
      bytes: expectedPhaseBytes,
    }], { completeness: "complete", generationId: value.generationId });
    if (!uuidV4.test(input.preparedEvent.id) || input.preparedEvent.id === input.createdEvent.id ||
        input.preparedEvent.journal_id !== input.journalId || input.preparedEvent.caused_by.length !== 1 ||
        input.preparedEvent.caused_by[0] !== input.createdEvent.id || !controlMatches || !guardMatches ||
        candidate.phase !== "construction" || candidate.journal_id !== input.journalId || candidate.byte_length !== phaseJournalBytes.length ||
        candidate.content_version !== historyDigest(phaseJournalBytes) || candidate.reference !== reference ||
        !equalBytes(phaseJournalBytes, expectedPhaseBytes) || !equalBytes(controlJournalBytes, expectedControlBytes) ||
        !equalBytes(guardJournalBytes, expectedGuardBytes) || !equalBytes(activationBytes, controlJournalBytes) ||
        !sameJson(manifest.expected_state, historyState(initial))) return undefined;
    return {
      format: "kepler.mission-startup-history.v1",
      generationId: value.generationId,
      manifest,
      control,
      guard,
      phaseJournalBytes: encode(phaseJournalBytes),
      controlJournalBytes: encode(controlJournalBytes),
      guardJournalBytes: encode(guardJournalBytes),
      activationBytes: encode(activationBytes),
    };
  } catch {
    return undefined;
  }
};

const historyView = (view: CoordinatedHistory): MissionStartupHistoryView => ({
  mode: view.mode,
  ...(view.generationId ? { generationId: view.generationId } : {}),
  ...(view.historyVersion ? { historyVersion: view.historyVersion } : {}),
  pendingRecovery: view.pendingRecovery,
  history: view.history,
});

const outputBytes = (intent: MissionStartupHistoryIntent): { readonly phase: Uint8Array; readonly control: Uint8Array; readonly guard: Uint8Array; readonly activation: Uint8Array } => ({
  phase: decode(intent.phaseJournalBytes),
  control: decode(intent.controlJournalBytes),
  guard: decode(intent.guardJournalBytes),
  activation: decode(intent.activationBytes),
});

const assertStartupRoot = async (access: HistoryAccess, scope: HistoryExclusiveScope, intent: MissionStartupHistoryIntent, allowLaterPhaseBytes: boolean): Promise<void> => {
  const root = missionHistory(scope.missionId);
  const top = await access.storage.files.list({ root: scope.context.recordHome, relative: root });
  for (const entry of top) {
    if ((entry.name !== "control" && entry.name !== "generations") || entry.kind !== "directory") {
      throw new HistoryError("mission_history_migration_required", "Direct-phase or unknown history entries are read-only startup inputs; use the supported history migration or recovery operation.", { path: `${root}/${entry.name}` });
    }
  }
  if (allowLaterPhaseBytes) return;
  const generationRoot = `${root}/generations`;
  for (const entry of await access.storage.files.list({ root: scope.context.recordHome, relative: generationRoot })) {
    if (entry.name !== intent.generationId || entry.kind !== "directory") throw new HistoryError("history_startup_generation_conflict", "A new startup cannot adopt another generation or an unknown generation entry.", { path: `${generationRoot}/${entry.name}` });
  }
  const controlRoot = `${root}/control`;
  for (const entry of await access.storage.files.list({ root: scope.context.recordHome, relative: controlRoot })) {
    if (entry.name === "events" && entry.kind === "directory") continue;
    if (entry.name === "active.json" && entry.kind === "file") {
      const current = await access.storage.files.read({ root: scope.context.recordHome, relative: activationPath(scope.missionId) });
      if (!current || !equalBytes(current, outputBytes(intent).activation)) throw new HistoryError("history_startup_selection_conflict", "An existing activation does not match the exact retained startup selection.", { path: activationPath(scope.missionId) });
      continue;
    }
    if (entry.name === `${intent.guard.journal_id}.jsonl` && entry.kind === "file") {
      const current = await access.storage.files.read({ root: scope.context.recordHome, relative: guardPath(scope.missionId, intent.guard.journal_id) });
      if (!current || !prefix(current, outputBytes(intent).guard)) throw new HistoryError("history_startup_output_conflict", "The retained startup guard has contradictory bytes.", { path: guardPath(scope.missionId, intent.guard.journal_id) });
      continue;
    }
    throw new HistoryError("history_startup_output_conflict", "The startup control directory contains unrelated output.", { path: `${controlRoot}/${entry.name}` });
  }
  const eventRoot = `${controlRoot}/events`;
  for (const entry of await access.storage.files.list({ root: scope.context.recordHome, relative: eventRoot })) {
    if (entry.name !== `${intent.control.journal_id}.jsonl` || entry.kind !== "file") throw new HistoryError("history_startup_output_conflict", "The startup control journal directory contains unrelated output.", { path: `${eventRoot}/${entry.name}` });
    const current = await access.storage.files.read({ root: scope.context.recordHome, relative: `${eventRoot}/${entry.name}` });
    if (!current || !prefix(current, outputBytes(intent).control)) throw new HistoryError("history_startup_output_conflict", "The retained startup control event has contradictory bytes.", { path: `${eventRoot}/${entry.name}` });
  }
  const phaseRoot = `${generationRoot}/${intent.generationId}`;
  for (const entry of await access.storage.files.list({ root: scope.context.recordHome, relative: phaseRoot })) {
    if (entry.name !== "construction" || entry.kind !== "directory") throw new HistoryError("history_startup_generation_conflict", "A new startup generation contains an unknown phase.", { path: `${phaseRoot}/${entry.name}` });
  }
  const constructionRoot = `${phaseRoot}/construction`;
  for (const entry of await access.storage.files.list({ root: scope.context.recordHome, relative: constructionRoot })) {
    if (entry.name !== `${intent.manifest.candidate_journals[0]!.journal_id}.jsonl` || entry.kind !== "file") throw new HistoryError("history_startup_generation_conflict", "A new startup journal directory contains unrelated output.", { path: `${constructionRoot}/${entry.name}` });
    const current = await access.storage.files.read({ root: scope.context.recordHome, relative: `${constructionRoot}/${entry.name}` });
    const expected = outputBytes(intent).phase;
    if (!current || !prefix(current, expected)) throw new HistoryError("history_startup_output_conflict", "The retained first phase journal has contradictory bytes.", { path: `${constructionRoot}/${entry.name}` });
  }
  const bindingPath = `kepler/missions/${scope.missionId}/coordination/history-selection.json`;
  const binding = await access.storage.files.read({ root: scope.context.commonDirectory, relative: bindingPath });
  if (binding !== undefined) throw new HistoryError("history_startup_binding_conflict", "A shared history binding exists without this startup activation.", { path: bindingPath });
}

const observedOutputs = async (access: HistoryAccess, scope: HistoryExclusiveScope, intent: MissionStartupHistoryIntent): Promise<readonly Record<string, unknown>[]> => {
  const paths = [
    { root: scope.context.recordHome, path: phasePath(scope.missionId, intent.generationId, intent.manifest.candidate_journals[0]!.journal_id) },
    { root: scope.context.recordHome, path: controlPath(scope.missionId, intent.control.journal_id) },
    { root: scope.context.recordHome, path: guardPath(scope.missionId, intent.guard.journal_id) },
    { root: scope.context.recordHome, path: activationPath(scope.missionId) },
    { root: scope.context.commonDirectory, path: `kepler/missions/${scope.missionId}/coordination/history-selection.json` },
  ];
  return await Promise.all(paths.map(async ({ root, path }) => {
    try {
      const value = await access.storage.files.read({ root, relative: path });
      return { path, state: value === undefined ? "missing" : "present", ...(value ? { byte_length: value.length, content_version: historyDigest(value) } : {}) };
    } catch (error) {
      return { path, state: "unreadable", error: error instanceof Error ? error.message : String(error) };
    }
  }));
};

const recoverExactPreparedPrefix = async (
  access: HistoryAccess,
  scope: HistoryExclusiveScope,
  intent: MissionStartupHistoryIntent,
  preparedEvent: EventEnvelope<unknown>,
  journalFactory: MissionStartupHistoryJournalFactory,
  cause: unknown,
): Promise<MissionStartupHistoryView> => {
  const journalId = intent.manifest.candidate_journals[0]!.journal_id;
  const preparedBytes = bytes(preparedEvent);
  if (preparedEvent.type !== "construction.mission-workspaces-prepared" || preparedEvent.journal_id !== journalId ||
      preparedEvent.caused_by.length !== 1 || preparedEvent.caused_by[0] !== intent.control.caused_by[0]) {
    throw new HistoryError("history_startup_existing_selection_invalid", "The saved preparation event does not extend the retained initial creation event.", { cause: cause instanceof Error ? cause.message : String(cause) });
  }
  try {
    const control = await access.storage.files.read({ root: scope.context.recordHome, relative: controlPath(scope.missionId, intent.control.journal_id) });
    const guard = await access.storage.files.read({ root: scope.context.recordHome, relative: guardPath(scope.missionId, intent.guard.journal_id) });
    const bindingBytes = await access.storage.files.read({ root: scope.context.commonDirectory, relative: `kepler/missions/${scope.missionId}/coordination/history-selection.json` });
    const active = await access.storage.files.read({ root: scope.context.recordHome, relative: activationPath(scope.missionId) });
    if (!active || !equalBytes(active, outputBytes(intent).activation) || !control || !equalBytes(control, outputBytes(intent).control) || !guard || !equalBytes(guard, outputBytes(intent).guard) || !bindingBytes) {
      throw new Error("The retained control, guard, or shared binding is unavailable or changed");
    }
    const binding = parseLiveHistoryBinding(bindingBytes);
    const origin = scope.context.origins.find((item) => item.root === scope.context.recordHome)?.id;
    if (!origin || binding.mission_id !== scope.missionId || binding.generation_id !== intent.generationId ||
        binding.history_version !== intent.control.id || binding.selection_hash !== historyDigest(outputBytes(intent).activation) ||
        binding.origins.length !== 1 || binding.origins[0] !== origin) throw new Error("The retained shared binding does not match the initial local selection");
    const generationRoot = `.kepler/missions/${scope.missionId}/history/generations/${intent.generationId}`;
    const phases = await access.storage.files.list({ root: scope.context.recordHome, relative: generationRoot });
    const journals = await access.storage.files.list({ root: scope.context.recordHome, relative: `${generationRoot}/construction` });
    if (phases.length !== 1 || phases[0]?.kind !== "directory" || phases[0].name !== "construction" || journals.length !== 1 || journals[0]?.kind !== "file" || journals[0].name !== `${journalId}.jsonl`) throw new Error("Exact startup-tail recovery cannot exclude another phase or journal");
    const snapshot = await access.snapshot(scope);
    if (snapshot.files.some((file) => file.origin === "local-runtime" && file.path.startsWith(`kepler/missions/${scope.missionId}/recovery/pending/`))) throw new Error("A retained recovery operation supersedes ordinary startup-tail repair");
    const journal = journalFactory({ recordHome: scope.context.recordHome, missionId: scope.missionId, journalId, generationId: intent.generationId });
    const scan = await journal.read();
    const initialBytes = outputBytes(intent).phase;
    const savedCreation = scanJournalBytes(initialBytes).lines[0]?.event;
    const observed = scan.lines[0]?.event;
    if (!scan.problems.length && scan.lines[0]?.terminated && observed && savedCreation && observed.id === savedCreation.id && validateConstructionEvent(observed).status === "valid" && !sameJson(observed, savedCreation)) throw new HistoryError("history_startup_creation_conflict", "A complete validated creation record conflicts with the exact saved startup event.", { event_id: observed.id });
    const suffix = scan.bytes.subarray(initialBytes.length);
    if (!prefix(initialBytes, scan.bytes) || !equalBytes(suffix, preparedBytes.subarray(0, preparedBytes.length - 1))) {
      throw new Error("The active generation does not end with its complete exact saved preparation event missing only LF");
    }
    const initial = collectHistory(scope.missionId, [{
      sourceId: `startup:${phasePath(scope.missionId, intent.generationId, journalId)}`,
      missionId: scope.missionId,
      generationId: intent.generationId,
      phase: "construction",
      journalId,
      bytes: initialBytes,
    }], { completeness: "complete", generationId: intent.generationId });
    if (!sameJson(historyState(initial), intent.manifest.expected_state)) throw new Error("The retained initial journal does not match its expected state");
    return { mode: "active", generationId: intent.generationId, historyVersion: intent.control.id, pendingRecovery: false, history: initial, retainedPreparationAppend: true };
  } catch (error) {
    if (error instanceof HistoryError && error.code === "history_startup_creation_conflict") throw error;
    throw new HistoryError("history_startup_existing_selection_invalid", "The retained startup selection is not a validated exact prefix of its saved preparation event.", {
      history_version: intent.control.id,
      cause: cause instanceof Error ? cause.message : String(cause),
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const readMissionStartupHistory = async (
  access: HistoryAccess,
  scope: HistoryExclusiveScope,
  intent: MissionStartupHistoryIntent,
  preparedEvent: EventEnvelope<unknown>,
  journalFactory: MissionStartupHistoryJournalFactory,
): Promise<MissionStartupHistoryView> => {
  try {
    const current = await access.read(scope.context.recordHome, scope.missionId);
    if (current.history.issues.length && current.mode === "active" && current.historyVersion === intent.control.id && !current.pendingRecovery) return recoverExactPreparedPrefix(access, scope, intent, preparedEvent, journalFactory, new Error("The selected startup journal contains an invalid later record"));
    return historyView(current);
  } catch (error) {
    return recoverExactPreparedPrefix(access, scope, intent, preparedEvent, journalFactory, error);
  }
};

export const publishMissionStartupHistory = async (
  access: HistoryAccess,
  scope: HistoryExclusiveScope,
  intent: MissionStartupHistoryIntent,
  createdEvent: EventEnvelope<unknown>,
  preparedEvent: EventEnvelope<unknown>,
  journalFactory: MissionStartupHistoryJournalFactory = ({ recordHome, missionId, journalId, generationId }) => createEventJournal({
    recordHome,
    missionId,
    phase: "construction",
    journalId,
    generationId,
  }),
): Promise<MissionStartupHistoryView> => {
  if (scope.kind !== "startup" || scope.missionId !== intent.control.data.mission_id || createdEvent.id !== intent.control.caused_by[0]) {
    throw new HistoryError("history_startup_authority_invalid", "Initial history publication requires its matching startup claim and creation event.");
  }
  const output = outputBytes(intent);
  const active = await access.storage.files.read({ root: scope.context.recordHome, relative: activationPath(scope.missionId) });
  if (active !== undefined) {
    if (!equalBytes(active, output.activation)) throw new HistoryError("history_startup_selection_superseded", "A different history selection is already active; startup will not reactivate its original generation.", { history_version: intent.control.id });
    await assertStartupRoot(access, scope, intent, true);
    let existing: CoordinatedHistory;
    try {
      existing = await access.read(scope.context.recordHome, scope.missionId);
    } catch {
      return await readMissionStartupHistory(access, scope, intent, preparedEvent, journalFactory);
    }
    if (existing.historyVersion !== intent.control.id || existing.generationId !== intent.generationId || existing.mode !== "active" || existing.pendingRecovery) {
      throw new HistoryError("history_startup_selection_superseded", "The retained startup selection is no longer the active, unblocked history.", { expected_history_version: intent.control.id, actual_history_version: existing.historyVersion ?? null, pending_recovery: existing.pendingRecovery });
    }
    if (existing.coordination !== "bound") await access.publishBinding(scope, intent.control, null);
    const verified = await access.read(scope.context.recordHome, scope.missionId);
    if (verified.coordination !== "bound" || verified.historyVersion !== intent.control.id || verified.generationId !== intent.generationId) throw new HistoryError("history_startup_binding_unconfirmed", "The initial history selection was not confirmed through its bound gateway view.", { history_version: intent.control.id, coordination: verified.coordination });
    return readMissionStartupHistory(access, scope, intent, preparedEvent, journalFactory);
  }

  await assertStartupRoot(access, scope, intent, false);
  const journalId = intent.manifest.candidate_journals[0]!.journal_id;
  const phaseJournal = journalFactory({ recordHome: scope.context.recordHome, missionId: scope.missionId, journalId, generationId: intent.generationId });
  try {
    try { await phaseJournal.append(createdEvent); }
    catch (error) { throw new HistoryError("history_startup_creation_append_failed", "The exact retained mission-creation append did not complete.", { event_id: createdEvent.id, message: error instanceof Error ? error.message : String(error) }); }
    const scan = await phaseJournal.read();
    if (scan.problems.length || !equalBytes(scan.bytes, output.phase)) throw new HistoryError("history_startup_output_conflict", "The first generation journal does not match its exact retained creation bytes.", { path: phaseJournal.path });
    const controlJournal = createEventJournal({ recordHome: scope.context.recordHome, missionId: scope.missionId, phase: "mission-recovery", journalId: intent.control.journal_id, kind: "control" });
    await controlJournal.append(intent.control);
    const controlScan = await controlJournal.read();
    if (controlScan.problems.length || !equalBytes(controlScan.bytes, output.control)) throw new HistoryError("history_startup_output_conflict", "The immutable startup control journal does not match its retained event.", { path: controlJournal.path });
    const guardJournal = createEventJournal({ recordHome: scope.context.recordHome, missionId: scope.missionId, phase: "construction", journalId: intent.guard.journal_id, kind: "guard" });
    await guardJournal.append(intent.guard);
    const guardScan = await guardJournal.read();
    if (guardScan.problems.length || !equalBytes(guardScan.bytes, output.guard)) throw new HistoryError("history_startup_output_conflict", "The startup compatibility guard does not match its retained event.", { path: guardJournal.path });
    const initial = collectHistory(scope.missionId, [{
      sourceId: `startup:${phasePath(scope.missionId, intent.generationId, journalId)}`,
      missionId: scope.missionId,
      generationId: intent.generationId,
      phase: "construction",
      journalId,
      bytes: scan.bytes,
    }], { completeness: "complete", generationId: intent.generationId });
    if (!sameJson(historyState(initial), intent.manifest.expected_state)) throw new HistoryError("history_startup_expected_state_mismatch", "The exact initial journal does not establish the retained startup state.");
    await assertStartupRoot(access, scope, intent, false);
    await access.storage.files.write({ root: scope.context.recordHome, relative: activationPath(scope.missionId) }, output.activation, { kind: "replace", expected: null });
    const confirmedActivation = await access.storage.files.read({ root: scope.context.recordHome, relative: activationPath(scope.missionId) });
    if (!confirmedActivation || !equalBytes(confirmedActivation, output.activation)) throw new HistoryError("history_startup_activation_unconfirmed", "The initial selector was not confirmed with the exact immutable control bytes.", { path: activationPath(scope.missionId) });
    await access.publishBinding(scope, intent.control, null);
    const verified = await access.read(scope.context.recordHome, scope.missionId);
    if (verified.mode !== "active" || verified.coordination !== "bound" || verified.historyVersion !== intent.control.id || verified.generationId !== intent.generationId || verified.pendingRecovery) {
      throw new HistoryError("history_startup_gateway_validation_failed", "The initial selection did not pass the normal bound history gateway.", { history_version: verified.historyVersion ?? null, generation_id: verified.generationId ?? null, mode: verified.mode, coordination: verified.coordination, pending_recovery: verified.pendingRecovery });
    }
    return historyView(verified);
  } catch (error) {
    if (error instanceof HistoryError && error.details.outputs) throw error;
    if (error instanceof HistoryError && error.code === "history_startup_creation_append_failed") throw new HistoryError(error.code, error.message, { ...error.details, outputs: await observedOutputs(access, scope, intent) });
    throw new HistoryError("history_startup_publication_failed", "Startup history publication stopped; retain all written files and resume the same mission from its saved intent.", {
      mission_id: scope.missionId,
      generation_id: intent.generationId,
      history_version: intent.control.id,
      error_code: error instanceof HistoryError ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
      outputs: await observedOutputs(access, scope, intent),
    });
  }
};
