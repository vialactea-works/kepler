import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { historyArchiveIndexDigest } from "../../packages/cli/src/history/archive-index.js";
import { createHistoryControl, historyDigest, historyManifestDigest, type HistoryControl, type HistoryMaterial, type HistorySourceEntry, type MissionHistoryBinding } from "../../packages/cli/src/history/control.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { canonicalJson, scanJournalBytes, serializeJournalEvent } from "../../packages/cli/src/history/journal.js";
import { parseHistoryOriginalRequestDocument, renderHistoryOriginalRequestStatement } from "../../packages/cli/src/history/original-request.js";
import { ReconstructionEvidence, type ResolvedHistoryMaterial } from "../../packages/cli/src/history/reconstruction-evidence.js";
import { prepareReconstruction, type PreparedCandidateJournal, type ReconstructionArchive, type ReconstructionPlan } from "../../packages/cli/src/history/reconstruction.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";

const archiveReference = (archive: ReconstructionArchive, sourceId: string): string => `local-archive:${archive.index.archive_id}/source/${historyDigest(sourceId).slice(7)}.bin`;
const missionBindingOf = (reset: HistoryControl): MissionHistoryBinding => {
  if (reset.data.manifest.format !== "kepler.mission-history-reset") throw new Error("The test requires a selected reset");
  return reset.data.manifest.mission_binding;
};
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalJson(value)}\n`);
const encodeJournal = (events: readonly NonNullable<ReturnType<typeof scanJournalBytes>["lines"][number]["event"]>[]): Uint8Array =>
  new TextEncoder().encode(`${events.map((event) => serializeJournalEvent(event)).join("\n")}\n`);

const setup = async () => {
  const fixture = await historyReconstructionFixture();
  const draft = await fixture.drafts.prepare(fixture.scope, fixture.request);
  const checked = await fixture.drafts.verify(fixture.scope, draft.manifest);
  const additional = new Map<string, ResolvedHistoryMaterial>();
  const evidence = new ReconstructionEvidence({
    readMaterial: async (reference, archive) => {
      const supplied = additional.get(reference);
      if (supplied) return { ...supplied, bytes: new Uint8Array(supplied.bytes) };
      const file = archive.files.find((candidate) => archiveReference(archive, candidate.source_id) === reference || `snapshot:${candidate.source_id}` === reference);
      if (!file) throw new Error("The requested original-request test material is unavailable");
      return { reference, content_version: historyDigest(file.bytes), bytes: new Uint8Array(file.bytes), source_path: file.path };
    },
    checkpoint: async () => ({ exists: false }),
  });
  const store = (reference: string, materialBytes: Uint8Array, sourcePath = ".kepler/missions/requester-decision.md"): HistoryMaterial => {
    const resolved = { reference, content_version: historyDigest(materialBytes), bytes: new Uint8Array(materialBytes), source_path: sourcePath };
    additional.set(reference, resolved);
    return { reference, content_version: resolved.content_version };
  };
  return { ...fixture, checked, evidence, store };
};

type Setup = Awaited<ReturnType<typeof setup>>;

const replaceCandidateRequest = (t: Setup, request: string): { readonly candidate_journals: readonly PreparedCandidateJournal[]; readonly history: ReturnType<typeof collectHistory>; readonly expected_state: Readonly<Record<string, unknown>> } => {
  const candidate_journals = t.checked.candidate_journals.map((journal) => {
    const scan = scanJournalBytes(journal.bytes);
    const events = scan.lines.flatMap((line) => line.event ? [line.event] : []).map((event) => event.type === "construction.mission-created"
      ? { ...event, data: { ...event.data, request } }
      : event);
    const candidateBytes = encodeJournal(events);
    return { ...journal, bytes: candidateBytes, byte_length: candidateBytes.length, content_version: historyDigest(candidateBytes) };
  });
  const history = collectHistory(t.f.missionId, candidate_journals.map((journal) => ({
    sourceId: `reconstruction/${journal.journal_id}`,
    generationId: t.plan.generation_id,
    missionId: t.f.missionId,
    phase: journal.phase,
    journalId: journal.journal_id,
    bytes: journal.bytes,
  })), { completeness: "complete", generationId: t.plan.generation_id });
  return { candidate_journals, history, expected_state: historyState(history) };
};

const rebindArchive = (t: Setup, files: ReconstructionArchive["files"], missionBinding?: MissionHistoryBinding): { readonly archive: ReconstructionArchive; readonly reset: typeof t.reset; readonly plan: ReconstructionPlan } => {
  const source_inventory: HistorySourceEntry[] = t.archive.index.source_inventory.map((entry) => {
    const file = files.find((candidate) => candidate.source_id === entry.source_id);
    if (!file) throw new Error("Archive test fixture lost an indexed source");
    return { source_id: file.source_id, origin: file.origin, path: file.path, byte_length: file.bytes.length, content_version: historyDigest(file.bytes) };
  });
  if (t.reset.data.manifest.format !== "kepler.mission-history-reset") throw new Error("The test requires a selected reset manifest");
  const resetManifest = { ...t.reset.data.manifest, mission_binding: missionBinding ?? t.reset.data.manifest.mission_binding, source_inventory };
  const reset = createHistoryControl({
    id: t.reset.id,
    journalId: t.reset.journal_id,
    recordedAt: t.reset.recorded_at,
    producer: t.reset.producer,
    manifest: resetManifest,
    decisionReference: t.reset.data.decision_reference,
    causes: t.reset.caused_by,
  });
  const index = { ...t.archive.index, manifest_hash: historyManifestDigest(resetManifest), source_inventory };
  const archive = { index, files };
  return { archive, reset, plan: { ...t.plan, archive_inventory_hash: historyArchiveIndexDigest(index) } };
};

const materialRequest = (t: Setup, overrides: Partial<{
  readonly reset: Setup["reset"];
  readonly plan: ReconstructionPlan;
  readonly archive: ReconstructionArchive;
  readonly candidate_journals: readonly PreparedCandidateJournal[];
  readonly history: ReturnType<typeof collectHistory>;
  readonly expected_state: Readonly<Record<string, unknown>>;
}>) => {
  const reset = overrides.reset ?? t.reset;
  const plan = overrides.plan ?? t.plan;
  const archive = overrides.archive ?? t.archive;
  const candidate_journals = overrides.candidate_journals ?? t.checked.candidate_journals;
  const history = overrides.history ?? t.checked.history;
  const expected_state = overrides.expected_state ?? t.checked.state;
  return t.evidence.material({ reset, plan, archive, required_material: plan.required_material, candidate_journals, history, expected_state });
};

const sortedActions = (actions: ReconstructionPlan["actions"]): ReconstructionPlan["actions"] => [...actions].sort((left, right) =>
  (left.source?.source_id ?? "").localeCompare(right.source?.source_id ?? "") ||
  (left.source?.byte_offset ?? -1) - (right.source?.byte_offset ?? -1) || left.id.localeCompare(right.id));

const assertionMaterial = (t: Setup, input: {
  readonly archive: ReconstructionArchive;
  readonly reset: Setup["reset"];
  readonly plan: ReconstructionPlan;
  readonly original_request: string;
  readonly conflicting_sources?: readonly {
    readonly reference: string;
    readonly content_version: string;
    readonly source_id: string;
    readonly byte_offset: number;
    readonly byte_length: number;
    readonly event_id: string;
  }[];
  readonly mission_binding?: MissionHistoryBinding;
  readonly statement_bytes?: Uint8Array;
  readonly source_material?: readonly HistoryMaterial[];
  readonly duplicate_source_reference?: boolean;
  readonly decision_reference?: string;
}): { readonly plan: ReconstructionPlan; readonly documentReference: string; readonly statementReference: string } => {
  const mission_binding = input.mission_binding ?? missionBindingOf(input.reset);
  const statementBytes = input.statement_bytes ?? renderHistoryOriginalRequestStatement({
    requester: input.plan.requester,
    mission_binding,
    reset_event_id: input.reset.id,
    generation_id: input.reset.data.generation_id,
    original_request: input.original_request,
  });
  const statement = t.store("decision:original-request", statementBytes);
  const document = {
    format: "kepler.history-original-request",
    version: 1,
    mission_binding,
    reset_event_id: input.reset.id,
    generation_id: input.reset.data.generation_id,
    original_request: input.original_request,
    requester: input.plan.requester,
    decision_reference: input.decision_reference ?? statement.reference,
    assertion: "exact-original-request-unchanged",
    source_material: input.source_material ?? (input.duplicate_source_reference ? [statement, statement] : [statement]),
    conflicting_sources: input.conflicting_sources ?? [],
  };
  const documentReference = "material:history-original-request";
  const bound = t.store(documentReference, bytes(document));
  const required_material = { ...input.plan.required_material, evidence: [bound] };
  return { plan: { ...input.plan, required_material }, documentReference, statementReference: statement.reference };
};

describe("original-request reconstruction material", () => {
  it("accepts the exact request from valid bound creation records", async () => {
    const t = await setup();
    expect(await materialRequest(t, {})).toMatchObject({ status: "valid" });
  });

  it("accepts a valid retained original whose binding contains its literal request", async () => {
    const t = await setup();
    const binding = { ...missionBindingOf(t.reset), request_reference: "Implement the selected work" };
    const bound = rebindArchive(t, t.archive.files, binding);
    expect(await materialRequest(t, bound)).toMatchObject({ status: "valid" });
  });

  it("rejects changed request text behind an unchanged context alias", async () => {
    const t = await setup();
    const candidate = replaceCandidateRequest(t, "Do different work");
    expect(await materialRequest(t, candidate)).toMatchObject({ status: "invalid", reason: expect.stringContaining("differs from the exact request") });
  });

  it.each([" Implement the selected work", "Implement the selected work\n", "Implement the selected work\u0301"])("does not normalize candidate request text (%j)", async (request) => {
    const t = await setup();
    const candidate = replaceCandidateRequest(t, request);
    expect(await materialRequest(t, candidate)).toMatchObject({ status: "invalid" });
  });

  it("uses a valid raw creation before a damaged tail without requiring an old projection", async () => {
    const t = await setup();
    const target = t.archive.files.find((file) => file.path.includes(`/history/${t.f.generationId}/construction/`) || file.path.includes(`/history/generations/${t.f.generationId}/construction/`));
    if (!target) throw new Error("The original generation journal is missing from the test archive");
    const tail = new TextEncoder().encode("{damaged tail");
    const damagedBytes = new Uint8Array(target.bytes.length + tail.length);
    damagedBytes.set(target.bytes);
    damagedBytes.set(tail, target.bytes.length);
    const files = t.archive.files.map((file) => file.source_id === target.source_id ? { ...file, bytes: damagedBytes } : file);
    const bound = rebindArchive(t, files);
    const extra = {
      id: randomUUID(), action: "exclude" as const,
      source: { source_id: target.source_id, byte_offset: target.bytes.length, byte_length: tail.length },
      event: null, reason: "Exclude the damaged tail", authority: null, proof: null, loss_reference: null, data_bindings: [],
    };
    const plan = { ...bound.plan, actions: sortedActions([...bound.plan.actions, extra]) };
    const compiled = await prepareReconstruction({
      ...t.runtime,
      plan,
      reset: bound.reset,
      archive: bound.archive,
      identity_reservations: { event_ids: [], journal_ids: [] },
      verifyMaterial: (request) => t.evidence.material(request),
    });
    expect(compiled.checked).toBe(true);
  });

  it("requires an assertion when owner-valid source creations conflict", async () => {
    const t = await setup();
    const source = t.archive.files.find((file) => file.path.includes(`/history/generations/${t.f.generationId}/construction/`));
    if (!source) throw new Error("The original generation journal is missing from the test archive");
    const events = scanJournalBytes(source.bytes).lines.flatMap((line) => line.event ? [line.event] : []);
    const creation = events.find((event) => event.type === "construction.mission-created");
    if (!creation) throw new Error("The original mission creation is missing from the test journal");
    const conflicting = { ...creation, data: { ...creation.data, request: "A conflicting request" } };
    const changedBytes = encodeJournal([...events, conflicting]);
    const bound = rebindArchive(t, t.archive.files.map((file) => file.source_id === source.source_id ? { ...file, bytes: changedBytes } : file));
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("exact original request without conflicts") });
  });

  it("retains a same-mission creation with conflicting text when request_reference is the literal original", async () => {
    const t = await setup();
    const source = t.archive.files.find((file) => file.path.includes(`/history/generations/${t.f.generationId}/construction/`));
    if (!source) throw new Error("The original generation journal is missing from the test archive");
    const events = scanJournalBytes(source.bytes).lines.flatMap((line) => line.event ? [line.event] : []);
    const creation = events.find((event) => event.type === "construction.mission-created");
    if (!creation) throw new Error("The original mission creation is missing from the test journal");
    const conflicting = { ...creation, data: { ...creation.data, request: "Different recorded text" } };
    const changedBytes = encodeJournal([...events, conflicting]);
    const literalBinding = { ...missionBindingOf(t.reset), request_reference: "Implement the selected work" };
    const bound = rebindArchive(t, t.archive.files.map((file) => file.source_id === source.source_id ? { ...file, bytes: changedBytes } : file), literalBinding);
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("exact original request without conflicts") });
  });

  it("counts repeated event IDs at distinct byte ranges and rejects incomplete conflict coverage", async () => {
    const t = await setup();
    const source = t.archive.files.find((file) => file.path.includes(`/history/generations/${t.f.generationId}/construction/`));
    if (!source) throw new Error("The original generation journal is missing from the test archive");
    const events = scanJournalBytes(source.bytes).lines.flatMap((line) => line.event ? [line.event] : []);
    const creation = events.find((event) => event.type === "construction.mission-created");
    if (!creation) throw new Error("The original mission creation is missing from the test journal");
    const conflictEvent = { ...creation, data: { ...creation.data, request: "Conflicting text" } };
    const appended = new TextEncoder().encode(`${serializeJournalEvent(conflictEvent)}\n`);
    const sourceBytes = new Uint8Array(source.bytes.length + appended.length);
    sourceBytes.set(source.bytes);
    sourceBytes.set(appended, source.bytes.length);
    const bound = rebindArchive(t, t.archive.files.map((file) => file.source_id === source.source_id ? { ...file, bytes: sourceBytes } : file));
    const line = scanJournalBytes(sourceBytes).lines.at(-1);
    if (!line?.event) throw new Error("The duplicate creation line could not be scanned");
    const conflict = {
      reference: archiveReference(bound.archive, source.source_id),
      content_version: historyDigest(sourceBytes),
      source_id: source.source_id,
      byte_offset: line.byteOffset,
      byte_length: line.byteLength + (line.terminated ? 1 : 0),
      event_id: line.event.id,
    };
    const missingCoverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work" });
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: missingCoverage.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("every and only exact conflicting creation occurrence") });
    const completeCoverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", conflicting_sources: [conflict] });
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: completeCoverage.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("exact non-retain archive disposition") });
    const disposition = {
      id: randomUUID(), action: "exclude" as const,
      source: { source_id: source.source_id, byte_offset: conflict.byte_offset, byte_length: conflict.byte_length },
      event: null, reason: "Exclude the conflicting duplicate", authority: null, proof: null, loss_reference: null, data_bindings: [],
    };
    const archiveCarrierPlan = { ...completeCoverage.plan, actions: sortedActions([...completeCoverage.plan.actions, disposition]) };
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: archiveCarrierPlan })).toMatchObject({ status: "valid" });

    const snapshotConflict = { ...conflict, reference: `snapshot:${source.source_id}` };
    const snapshotCoverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", conflicting_sources: [snapshotConflict] });
    const snapshotPlan = { ...snapshotCoverage.plan, actions: sortedActions([...snapshotCoverage.plan.actions, disposition]) };
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: snapshotPlan })).toMatchObject({ status: "valid" });

    const checkpointReference = `checkpoint:${encodeURIComponent("actual-prepared-repository")}/${"a".repeat(40)}/${encodeURIComponent(source.path)}`;
    t.store(checkpointReference, sourceBytes, source.path);
    const checkpointConflict = { ...conflict, reference: checkpointReference };
    const checkpointCoverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", conflicting_sources: [checkpointConflict] });
    const checkpointPlan = { ...checkpointCoverage.plan, actions: sortedActions([...checkpointCoverage.plan.actions, disposition]) };
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: checkpointPlan })).toMatchObject({ status: "valid" });

    const foreignReference = `snapshot:foreign-${source.source_id}`;
    t.store(foreignReference, sourceBytes, source.path);
    const foreignCoverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", conflicting_sources: [{ ...conflict, reference: foreignReference }] });
    const foreignPlan = { ...foreignCoverage.plan, actions: sortedActions([...foreignCoverage.plan.actions, disposition]) };
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: foreignPlan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("exact indexed source identity") });

    const rejectConflict = async (conflicting_sources: typeof conflict[]) => {
      const coverage = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", conflicting_sources });
      const checkedPlan = { ...coverage.plan, actions: sortedActions([...coverage.plan.actions, disposition]) };
      return materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: checkedPlan });
    };
    expect(await rejectConflict([{ ...snapshotConflict, content_version: historyDigest("different source hash") }])).toMatchObject({ status: "invalid" });
    expect(await rejectConflict([{ ...snapshotConflict, byte_offset: snapshotConflict.byte_offset + 1 }])).toMatchObject({ status: "invalid" });
    expect(await rejectConflict([{ ...snapshotConflict, event_id: t.f.unit.id }])).toMatchObject({ status: "invalid" });
    expect(await rejectConflict([snapshotConflict, { ...snapshotConflict, reference: foreignReference }])).toMatchObject({ status: "invalid" });
    t.store(snapshotConflict.reference, sourceBytes, `${source.path}.different`);
    expect(await rejectConflict([snapshotConflict])).toMatchObject({ status: "invalid" });
    t.store(snapshotConflict.reference, new TextEncoder().encode("changed source bytes"), source.path);
    expect(await rejectConflict([snapshotConflict])).toMatchObject({ status: "invalid" });
  });

  it("requires exact B3 material to correct a literal-looking wrong stored request", async () => {
    const t = await setup();
    const source = t.archive.files.find((file) => file.path.includes(`/history/generations/${t.f.generationId}/construction/`));
    if (!source) throw new Error("The original generation journal is missing from the test archive");
    const originalRequest = "Implement the selected work";
    const wrongRequest = "W".repeat(originalRequest.length);
    const events = scanJournalBytes(source.bytes).lines.flatMap((line) => line.event ? [line.event] : []).map((event) => event.type === "construction.mission-created"
      ? { ...event, data: { ...event.data, request: wrongRequest } }
      : event);
    const changedBytes = encodeJournal(events);
    const binding = { ...missionBindingOf(t.reset), request_reference: wrongRequest };
    const bound = rebindArchive(t, t.archive.files.map((file) => file.source_id === source.source_id ? { ...file, bytes: changedBytes } : file), binding);
    const line = scanJournalBytes(changedBytes).lines.find((candidate) => candidate.event?.type === "construction.mission-created");
    if (!line?.event) throw new Error("The conflicting creation line could not be scanned");
    const conflict = {
      reference: `snapshot:${source.source_id}`,
      content_version: historyDigest(changedBytes),
      source_id: source.source_id,
      byte_offset: line.byteOffset,
      byte_length: line.byteLength + (line.terminated ? 1 : 0),
      event_id: line.event.id,
    };
    const plan = {
      ...bound.plan,
      actions: sortedActions(bound.plan.actions.map((action) => action.source?.source_id === source.source_id && action.source.byte_offset === conflict.byte_offset
        ? { ...action, action: "exclude" as const, reason: "Exclude the conflicting stored request", source: { ...action.source, byte_length: conflict.byte_length } }
        : action)),
    };
    const candidate = replaceCandidateRequest(t, originalRequest);
    expect(await materialRequest(t, { ...candidate, archive: bound.archive, reset: bound.reset, plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("an exact B3 assertion is required") });
    const literalCandidate = replaceCandidateRequest(t, wrongRequest);
    expect(await materialRequest(t, { ...literalCandidate, archive: bound.archive, reset: bound.reset, plan })).toMatchObject({ status: "valid" });
    const assertion = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan, original_request: originalRequest, conflicting_sources: [conflict] });
    expect(await materialRequest(t, { ...candidate, archive: bound.archive, reset: bound.reset, plan: assertion.plan })).toMatchObject({ status: "valid" });
  });

  it("accepts an exact requester statement when original creation material is unavailable", async () => {
    const t = await setup();
    const unsupportedFiles = t.archive.files.map((file) => ({ ...file, path: `.kepler/missions/${t.f.missionId}/recovery/unowned/${encodeURIComponent(file.source_id)}.bin` }));
    const bound = rebindArchive(t, unsupportedFiles);
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("bound B3 assertion is required") });
    const assertion = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work" });
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: assertion.plan })).toMatchObject({ status: "valid" });
  });

  it("does not guess an unavailable original from a literal-looking reference", async () => {
    const t = await setup();
    const unavailable = t.archive.files.map((file) => ({ ...file, path: `.kepler/missions/${t.f.missionId}/recovery/unowned/${encodeURIComponent(file.source_id)}.bin` }));
    const binding = { ...missionBindingOf(t.reset), request_reference: "Wrong recorded request text" };
    const bound = rebindArchive(t, unavailable, binding);
    const assertion = assertionMaterial(t, { ...bound, original_request: "Implement the selected work" });
    expect(t.checked.history.issues).toHaveLength(0);
    expect(t.checked.history.events.every((entry) => entry.constructionEvent !== undefined)).toBe(true);
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: assertion.plan })).toMatchObject({ status: "valid" });
    const readable = rebindArchive(t, t.archive.files, binding);
    const readableAssertion = assertionMaterial(t, { ...readable, original_request: "Implement the selected work" });
    const compile = (reset: Setup["reset"], archive: ReconstructionArchive, plan: ReconstructionPlan) => prepareReconstruction({
      ...t.runtime,
      plan,
      reset,
      archive,
      identity_reservations: { event_ids: [], journal_ids: [] },
      verifyMaterial: (request) => t.evidence.material(request),
    });
    await expect(compile(readable.reset, readable.archive, readable.plan)).rejects.toMatchObject({ code: "history_reconstruction_material_invalid" });
    expect((await compile(readable.reset, readable.archive, readableAssertion.plan)).checked).toBe(true);
  });

  it("renders the complete approved statement bytes without normalization", () => {
    const rendered = renderHistoryOriginalRequestStatement({
      requester: 'Lead "One"',
      mission_binding: { record_home_repository_id: "record-home", mission_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", workflow: "standard", request_reference: "context:original", unit_ids: [] },
      reset_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      generation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      original_request: "  First line\nSecond line\u0301\t  ",
    });
    const expected = [
      "I confirm that this is the exact original request and that the actual work request is unchanged.",
      'Requester: "Lead \\"One\\""',
      "Mission: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Reset: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Generation: cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      'Original request: "  First line\\nSecond line\u0301\\t  "',
      "",
    ].join("\n");
    expect(rendered).toEqual(new TextEncoder().encode(expected));
  });

  it("round-trips exact request content in the canonical requester statement", async () => {
    const t = await setup();
    const request = "  First line\nSecond line\u0301\t  ";
    const candidate = replaceCandidateRequest(t, request);
    const unsupportedFiles = t.archive.files.map((file) => ({ ...file, path: `.kepler/missions/${t.f.missionId}/recovery/unowned/${encodeURIComponent(file.source_id)}.bin` }));
    const bound = rebindArchive(t, unsupportedFiles);
    const assertion = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: request });
    expect(await materialRequest(t, { ...candidate, reset: bound.reset, archive: bound.archive, plan: assertion.plan })).toMatchObject({ status: "valid" });
  });

  it.each([
    ["BOM", (statement: Uint8Array) => new TextEncoder().encode(`\uFEFF${new TextDecoder().decode(statement)}`)],
    ["CRLF", (statement: Uint8Array) => new TextEncoder().encode(new TextDecoder().decode(statement).replaceAll("\n", "\r\n"))],
    ["extra text", (statement: Uint8Array) => new TextEncoder().encode(`${new TextDecoder().decode(statement)}extra\n`)],
    ["generic approval", () => bytes({ format: "kepler.history-action-authority", approved: true })],
  ])("rejects %s instead of the exact decision statement", async (_label, transform) => {
    const t = await setup();
    const base = renderHistoryOriginalRequestStatement({
      requester: t.plan.requester,
      mission_binding: missionBindingOf(t.reset),
      reset_event_id: t.reset.id,
      generation_id: t.reset.data.generation_id,
      original_request: "Implement the selected work",
    });
    const statement = assertionMaterial(t, { archive: t.archive, reset: t.reset, plan: t.plan, original_request: "Implement the selected work", statement_bytes: transform(base) });
    expect(await materialRequest(t, { plan: statement.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("exact canonical original-request statement") });
  });

  it("rejects repeated decision references and changed source bytes under the declared hash", async () => {
    const t = await setup();
    const duplicate = assertionMaterial(t, { archive: t.archive, reset: t.reset, plan: t.plan, original_request: "Implement the selected work", duplicate_source_reference: true });
    expect(await materialRequest(t, { plan: duplicate.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("must be unique") });

    const changed = assertionMaterial(t, { archive: t.archive, reset: t.reset, plan: t.plan, original_request: "Implement the selected work" });
    t.store(changed.statementReference, new TextEncoder().encode("changed bytes"));
    expect(await materialRequest(t, { plan: changed.plan })).toMatchObject({ status: "invalid" });
  });

  it("checks exact reset scope and strict assertion fields", async () => {
    const t = await setup();
    const unsupportedFiles = t.archive.files.map((file) => ({ ...file, path: `.kepler/missions/${t.f.missionId}/recovery/unowned/${encodeURIComponent(file.source_id)}.bin` }));
    const bound = rebindArchive(t, unsupportedFiles);
    const wrongScope = assertionMaterial(t, { archive: bound.archive, reset: bound.reset, plan: bound.plan, original_request: "Implement the selected work", mission_binding: { ...missionBindingOf(bound.reset), mission_id: randomUUID() } });
    expect(await materialRequest(t, { archive: bound.archive, reset: bound.reset, plan: wrongScope.plan })).toMatchObject({ status: "invalid", reason: expect.stringContaining("wrong requester, mission, reset") });
    expect(() => parseHistoryOriginalRequestDocument('{"format":"kepler.history-original-request","format":"kepler.history-original-request"}')).toThrow();
    expect(() => parseHistoryOriginalRequestDocument({ format: "kepler.history-original-request", extra: true })).toThrow();
  });
});
