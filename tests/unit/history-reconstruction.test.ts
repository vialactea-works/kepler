import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createHistoryControl, HistoryError, historyDigest, historyManifestDigest, type HistoryResetManifest, type HistorySourceEntry } from "../../packages/cli/src/history/control.js";
import { historyArchiveIndexDigest, type HistoryArchiveIndex } from "../../packages/cli/src/history/archive-index.js";
import { validateConstructionEvent, type ConstructionEventRecord } from "../../packages/cli/src/construction/events.js";
import { parseReconstructionPlan, prepareReconstruction, validateReconstructionReferences, type ReconstructionArchive, type ReconstructionArchiveFile, type ReconstructionCheck, type ReconstructionDependencies, type ReconstructionPlan, type ReconstructionPlanAction, type ReconstructionAuthorityRequest, type ReconstructionMaterialRequest, type ReconstructionContinuationRequest } from "../../packages/cli/src/history/reconstruction.js";
import { scanJournalBytes } from "../../packages/cli/src/history/journal.js";
import { historyGenerationFixture, historyTestEvent, historyTestReconciliation } from "../support/history-generation.js";
const timestamp = "2026-11-14T00:00:00.000Z";

const fixture = (missing: HistoryResetManifest["known_missing_sources"] = []) => {
  const base = historyGenerationFixture();
  const path = `.kepler/missions/${base.missionId}/history/construction/${base.journalId}.jsonl`;
  const source = {
    source_id: "archive-source-construction",
    origin: "record-home",
    path,
    byte_length: base.source.bytes.length,
    content_version: historyDigest(base.source.bytes),
  };
  const resetManifest: HistoryResetManifest = {
    ...base.resetManifest,
    source_inventory: [source],
    known_missing_sources: missing,
  };
  const reset = createHistoryControl({
    id: randomUUID(), journalId: randomUUID(), recordedAt: timestamp,
    producer: { name: "kepler", version: "3.1.0" }, manifest: resetManifest,
    decisionReference: "decision:reset-approved", causes: [],
  });
  const index: HistoryArchiveIndex = {
    format: "kepler.mission-history-archive",
    version: 1,
    mission_id: base.missionId,
    archive_id: base.archiveId,
    manifest_hash: historyManifestDigest(resetManifest),
    source_inventory: [source],
    previous_archives: [],
  };
  const indexHash = historyArchiveIndexDigest(index);
  const archive: ReconstructionArchive = {
    index,
    files: [{ source_id: source.source_id, origin: source.origin, path: source.path, bytes: new Uint8Array(base.source.bytes) }],
  };
  const scan = scanJournalBytes(base.source.bytes);
  const retained = scan.lines.map((line, index): ReconstructionPlanAction => ({
    id: randomUUID(), action: "retain",
    source: { source_id: source.source_id, byte_offset: line.byteOffset, byte_length: line.byteLength + (line.terminated ? 1 : 0) },
    event: null, reason: `Retain source event ${index + 1} exactly`, authority: null, proof: null,
    loss_reference: null, data_bindings: [],
  }));
  const plan: ReconstructionPlan = {
    format: "kepler.mission-history-reconstruction-plan", version: 1, mode: "reconstruct",
    mission_id: base.missionId, generation_id: base.generationId, reset_event_id: reset.id,
    archive_id: base.archiveId, archive_inventory_hash: indexHash,
    actions: retained, dependency_order: [],
    required_material: { artifact_bindings: [], checkpoints: [], evidence: [] },
    continuation: { operation: "inspect the selected unit", unresolved_work: [], required_approvals: [] },
    requester: "Requester", reconciliation: historyTestReconciliation, clean_restart: null,
  };
  return { base, source, reset, archive, plan, indexHash };
};

const rebindArchive = (
  f: ReturnType<typeof fixture>,
  files: readonly ReconstructionArchiveFile[],
  actions: readonly ReconstructionPlanAction[] = f.plan.actions,
) => {
  const sourceInventory: HistorySourceEntry[] = files.map((file) => ({
    source_id: file.source_id,
    origin: file.origin,
    path: file.path,
    byte_length: file.bytes.length,
    content_version: historyDigest(file.bytes),
  })).sort((left, right) => left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0);
  const resetManifest: HistoryResetManifest = {
    ...f.reset.data.manifest as HistoryResetManifest,
    source_inventory: sourceInventory,
  };
  const reset = createHistoryControl({
    id: f.reset.id, journalId: f.reset.journal_id, recordedAt: f.reset.recorded_at,
    producer: f.reset.producer, manifest: resetManifest, decisionReference: f.reset.data.decision_reference, causes: [],
  });
  const index: HistoryArchiveIndex = {
    ...f.archive.index,
    manifest_hash: historyManifestDigest(resetManifest),
    source_inventory: sourceInventory,
  };
  const archive_inventory_hash = historyArchiveIndexDigest(index);
  const archive: ReconstructionArchive = {
    index,
    files: files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })),
  };
  return {
    ...f,
    reset,
    archive,
    indexHash: archive_inventory_hash,
    plan: { ...f.plan, reset_event_id: reset.id, archive_inventory_hash, actions },
  };
};

const dependencies = (
  identity: () => string = randomUUID,
  identity_reservations: ReconstructionDependencies["identity_reservations"] = { event_ids: [], journal_ids: [] },
) => ({
  identity,
  identity_reservations,
  clock: () => new Date(timestamp),
  producer: { name: "kepler-recovery-test", version: "3.1.0" },
  verifyAuthority: vi.fn(async (_request: ReconstructionAuthorityRequest): Promise<ReconstructionCheck> => ({ status: "valid", reference: "authority:checked" })),
  verifyMaterial: vi.fn(async (_request: ReconstructionMaterialRequest): Promise<ReconstructionCheck> => ({ status: "valid", reference: "material:checked" })),
  verifyContinuation: vi.fn(async (_request: ReconstructionContinuationRequest): Promise<ReconstructionCheck> => ({ status: "valid", reference: "continuation:checked" })),
}) satisfies ReconstructionDependencies;

const addInteraction = (base: ReturnType<typeof historyGenerationFixture>, id = randomUUID(), causeActionId: string) => ({
  id, action: "add" as const, source: null,
  event: {
    phase: "construction" as const,
    type: "construction.interaction-recorded",
    event_version: 1,
    data: { mission_id: base.missionId, unit_id: base.unitId, participants: ["requester"], content: "Continue with the selected unit", references: [] },
    causes: [{ event_id: null, action_id: causeActionId }],
  },
  reason: "Record the requester-confirmed continuation context",
  authority: { decision_reference: "decision:continuation-context", artifact_bindings: [] },
  proof: null, loss_reference: null, data_bindings: [],
});

const validatedFact = (type: string, data: Record<string, unknown>, journalId: string, id = randomUUID()): ConstructionEventRecord => {
  const source = historyTestEvent(type, data, journalId, [], id);
  const result = validateConstructionEvent(source);
  if (result.status !== "valid") throw new Error(`Invalid owner-test fact: ${type}`);
  return result.event;
};

const referenceAction = (action: ReconstructionPlanAction["action"], data_bindings: ReconstructionPlanAction["data_bindings"] = []): ReconstructionPlanAction => ({
  id: randomUUID(), action, source: action === "retain" || action === "replace" ? { source_id: "reference-test", byte_offset: 0, byte_length: 1 } : null,
  event: null, reason: "Reference-validation fixture", authority: null, proof: null, loss_reference: null, data_bindings,
});

const referenceFacts = () => {
  const f = fixture();
  const journalId = randomUUID();
  const stageAttemptId = randomUUID();
  const taskId = randomUUID();
  const activityAttemptId = randomUUID();
  const checkpoint = [{ repository_id: "record-home", commit: "abcdef0123456789abcdef0123456789abcdef01" }];
  const prepared = validatedFact("construction.integration-prepared", {
    mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "implementation", stage_attempt_id: stageAttemptId,
    task_id: taskId, activity: "code-integration", activity_attempt_id: activityAttemptId,
    captured_inputs: [], candidate_checkpoints: checkpoint, task_output_refs: ["output:task"], source_evidence_ids: [], inputs: [],
  }, journalId);
  const accepted = validatedFact("construction.integration-accepted", {
    mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "implementation", stage_attempt_id: stageAttemptId,
    task_id: taskId, activity: "code-integration", activity_attempt_id: activityAttemptId,
    prepared_event_id: prepared.id, candidate_checkpoints: checkpoint, repository_results: [], authority_event_ids: [],
  }, journalId);
  const completed = validatedFact("construction.task-completed", {
    mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "implementation", stage_attempt_id: stageAttemptId,
    task_id: taskId, integration_event_id: accepted.id, conditions: ["The selected integration is accepted"],
  }, journalId);
  return { f, prepared, accepted, completed };
};

const addPlan = (f: ReturnType<typeof fixture>, added: readonly ReconstructionPlanAction[], dependencyOrder: readonly string[] = added.map((action) => action.id)): ReconstructionPlan => ({
  ...f.plan,
  actions: [...f.plan.actions, ...added].sort((left, right) =>
    (left.source?.source_id ?? left.loss_reference ?? "").localeCompare(right.source?.source_id ?? right.loss_reference ?? "") ||
    (left.source?.byte_offset ?? -1) - (right.source?.byte_offset ?? -1) || left.id.localeCompare(right.id)),
  dependency_order: dependencyOrder,
});

const run = (f: ReturnType<typeof fixture>, plan: unknown = f.plan, overrides: Partial<ReconstructionDependencies> = {}) =>
  prepareReconstruction({ plan, reset: f.reset, archive: f.archive, ...dependencies(), ...overrides });

const reconstructionError = async (operation: Promise<unknown>, code: string): Promise<void> => {
  await expect(operation).rejects.toMatchObject({ name: "HistoryError", code });
};

describe("pure history reconstruction compiler", () => {
  it("covers every indexed history byte while retaining artifacts and other archive material", async () => {
    const f = fixture();
    const controlBytes = new Uint8Array([0xff]);
    const selectorBytes = new Uint8Array([0xfe, 0x00]);
    const unknownBytes = new Uint8Array([0x80, 0x81, 0x82]);
    const artifactBytes = new TextEncoder().encode("approved artifact bytes");
    const files: ReconstructionArchiveFile[] = [
      f.archive.files[0]!,
      { source_id: "archive-control-damaged", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/history/control/events/${randomUUID()}.jsonl`, bytes: controlBytes },
      { source_id: "archive-selector-damaged", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/history/control/active.json`, bytes: selectorBytes },
      { source_id: "archive-unknown-history", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/history/unclassified/record.bin`, bytes: unknownBytes },
      { source_id: "archive-zero-history", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/history/unclassified/empty.bin`, bytes: new Uint8Array() },
      { source_id: "archive-zero-phase", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/history/construction/${randomUUID()}.jsonl`, bytes: new Uint8Array() },
      { source_id: "archive-artifact", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/artifacts/evidence/result.txt`, bytes: artifactBytes },
    ];
    const exclusions = files.filter((file) => file.path.includes(`/history/`) && file.source_id !== f.source.source_id).map((file): ReconstructionPlanAction => ({
      id: randomUUID(), action: "exclude", source: { source_id: file.source_id, byte_offset: 0, byte_length: file.bytes.length },
      event: null, reason: "Preserve this non-phase history source without treating it as progress", authority: null, proof: null,
      loss_reference: null, data_bindings: [],
    }));
    const actions = addPlan(f, exclusions).actions;
    const complete = rebindArchive(f, files, actions);
    const checks = dependencies();
    checks.verifyMaterial.mockImplementation(async ({ archive }) => {
      expect(archive.files.map((file) => file.source_id)).toContain("archive-artifact");
      expect(archive.files.find((file) => file.source_id === "archive-artifact")?.bytes).toEqual(artifactBytes);
      expect(archive.files).toHaveLength(files.length);
      return { status: "valid", reference: "material:complete-archive" };
    });
    const result = await run(complete, complete.plan, checks);
    expect(result.source_to_output.map((entry) => entry.source_id)).toEqual(expect.arrayContaining([
      "archive-control-damaged", "archive-selector-damaged", "archive-unknown-history", "archive-zero-history", "archive-zero-phase",
    ]));
    expect(result.source_to_output.some((entry) => entry.source_id === "archive-artifact")).toBe(false);
    expect(result.source_to_output.filter((entry) => entry.source_id?.startsWith("archive-") && entry.disposition === "exclude")).toHaveLength(5);
  });

  it("confines authority and material verifier mutations to their private request snapshots", async () => {
    const f = fixture();
    const added = addInteraction(f.base, randomUUID(), f.plan.actions[2]!.id);
    const checks = dependencies();
    checks.verifyAuthority.mockImplementation(async (request) => {
      (request.event.data as Record<string, unknown>).content = "Unapproved mutation";
      const copiedPlanAction = request.plan.actions.find((action) => action.id === added.id);
      if (copiedPlanAction?.event) (copiedPlanAction.event.data as Record<string, unknown>).content = "Mutated private plan snapshot";
      request.archive.files[0]?.bytes.fill(0);
      const index = request.archive.index as unknown as { source_inventory: { path: string }[] };
      if (index.source_inventory[0]) index.source_inventory[0].path = "changed/path";
      return { status: "valid", reference: "authority:checked" };
    });
    checks.verifyMaterial.mockImplementation(async (request) => {
      request.candidate_journals[0]?.bytes.fill(0);
      const historyEvent = request.history.events.find((entry) => entry.event?.type === "construction.mission-created")?.event;
      if (historyEvent) (historyEvent.data as Record<string, unknown>).title = "Mutated material history";
      (request.expected_state.units as unknown[]).push({ unitId: "unapproved" });
      request.archive.files[0]?.bytes.fill(0);
      return { status: "valid", reference: "material:checked" };
    });
    const result = await run(f, addPlan(f, [added]), checks);
    const generated = result.history.events.find((entry) => entry.event?.type === "construction.interaction-recorded")?.event;
    expect(generated?.data.content).toBe(added.event?.data.content);
    expect(result.history.events.find((entry) => entry.event?.type === "construction.mission-created")?.event?.data.title).toBe(f.base.creation.data.title);
    expect(result.state.units).toHaveLength(1);
    for (const journal of result.candidate_journals) {
      expect(journal.content_version).toBe(historyDigest(journal.bytes));
      expect(result.manifest.candidate_journals.find((candidate) => candidate.journal_id === journal.journal_id)?.content_version).toBe(journal.content_version);
    }
  });

  it("rejects omitted, extra, and corrupt files against the computed archive index", async () => {
    const f = fixture();
    const omitted: ReconstructionArchive = { ...f.archive, files: [] };
    await reconstructionError(prepareReconstruction({ plan: f.plan, reset: f.reset, archive: omitted, ...dependencies() }), "history_reconstruction_archive_incomplete");
    const extra: ReconstructionArchive = {
      ...f.archive,
      files: [...f.archive.files, { source_id: "extra-file", origin: "record-home", path: `.kepler/missions/${f.base.missionId}/artifacts/extra.txt`, bytes: new Uint8Array([1]) }],
    };
    await reconstructionError(prepareReconstruction({ plan: f.plan, reset: f.reset, archive: extra, ...dependencies() }), "history_reconstruction_archive_incomplete");
    const corrupt: ReconstructionArchive = { ...f.archive, files: [{ ...f.archive.files[0]!, bytes: new Uint8Array([1, 2, 3]) }] };
    await reconstructionError(prepareReconstruction({ plan: f.plan, reset: f.reset, archive: corrupt, ...dependencies() }), "history_reconstruction_archive_invalid");
  });

  it("reserves predecessor and selected current-control event identities before generation", async () => {
    const f = fixture();
    const predecessor = randomUUID();
    const resetManifest: HistoryResetManifest = {
      ...f.reset.data.manifest as HistoryResetManifest,
      previous_control: { event_id: predecessor, content_version: historyDigest("previous-control") },
    };
    const reset = createHistoryControl({
      id: f.reset.id, journalId: f.reset.journal_id, recordedAt: f.reset.recorded_at,
      producer: f.reset.producer, manifest: resetManifest, decisionReference: f.reset.data.decision_reference, causes: [predecessor],
    });
    const index = { ...f.archive.index, manifest_hash: historyManifestDigest(resetManifest) };
    const archive = { ...f.archive, index };
    const archive_inventory_hash = historyArchiveIndexDigest(index);
    const unitAction = f.plan.actions[2]!;
    const added = addInteraction(f.base, randomUUID(), unitAction.id);
    const plan = addPlan({ ...f, reset, archive, plan: { ...f.plan, archive_inventory_hash } }, [added]);
    const generatedIds = [randomUUID(), predecessor];
    await reconstructionError(run({ ...f, reset, archive }, plan, dependencies(() => generatedIds.shift() ?? randomUUID())), "history_reconstruction_identity_invalid");

    const currentGuardEvent = randomUUID();
    const currentGuardJournal = randomUUID();
    const currentIds = [randomUUID(), currentGuardEvent];
    const currentReservations = dependencies(
      () => currentIds.shift() ?? randomUUID(),
      { event_ids: [currentGuardEvent], journal_ids: [currentGuardJournal] },
    );
    await reconstructionError(run(f, addPlan(f, [added]), currentReservations), "history_reconstruction_identity_invalid");
  });

  it("retains exact event bytes and original dates without a reset-time cutoff", async () => {
    const f = fixture();
    const result = await run(f);
    expect(result.checked).toBe(true);
    expect(result.candidate_journals).toHaveLength(1);
    expect(result.candidate_journals[0]?.bytes).toEqual(f.archive.files[0]?.bytes);
    expect(result.candidate_journals[0]?.content_version).toBe(historyDigest(f.archive.files[0]!.bytes));
    expect(result.manifest.expected_state).toEqual(f.base.manifest.expected_state);
    expect(result.manifest.actions.map((action) => action.output.byte_offset)).toEqual([0, ...scanJournalBytes(f.archive.files[0]!.bytes).lines.slice(1).map((line) => line.byteOffset)]);
    expect(result.source_to_output).toHaveLength(f.plan.actions.length);
    expect(result.source_to_output.every((mapping) => mapping.output_event_id !== null)).toBe(true);
    expect(result.verification.material.reference).toBe("material:checked");
  });

  it("rejects a replacement unit that would remove a reset-bound identity", async () => {
    const f = fixture();
    const sourceUnit = f.plan.actions[2]!;
    const prepared = f.plan.actions[1]!;
    const replacementUnitId = "2026-11-14-replacement";
    const replacement: ReconstructionPlanAction = {
      id: randomUUID(), action: "add", source: null,
      event: {
        phase: "construction", type: "construction.unit-created", event_version: 1,
        data: { ...f.base.unit.data, unit_id: replacementUnitId, directory: `construction/units-of-work/${replacementUnitId}` },
        causes: [{ event_id: null, action_id: prepared.id }],
      },
      reason: "Replace a reset-bound unit", authority: { decision_reference: "decision:replacement", artifact_bindings: [] },
      proof: null, loss_reference: null, data_bindings: [],
    };
    const actions = [
      ...f.plan.actions.filter((action) => action.id !== sourceUnit.id),
      { ...sourceUnit, action: "exclude" as const }, replacement,
    ].sort((left, right) =>
      (left.source?.source_id ?? left.loss_reference ?? "").localeCompare(right.source?.source_id ?? right.loss_reference ?? "") ||
      (left.source?.byte_offset ?? -1) - (right.source?.byte_offset ?? -1) || left.id.localeCompare(right.id));
    const plan = { ...f.plan, actions, dependency_order: [replacement.id] };
    await reconstructionError(run(f, plan), "history_reconstruction_binding_mismatch");
  });

  it("rejects clean-restart request changes outside the original binding aliases", async () => {
    const f = fixture();
    const repository = {
      repository_id: "record-home", context: { kind: "existing" as const }, branch: { kind: "current" as const },
      integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" as const },
    };
    const excluded = f.plan.actions.map((action) => ({ ...action, action: "exclude" as const, reason: "The requester selected a clean restart" }));
    const plan: ReconstructionPlan = {
      ...f.plan, mode: "clean-restart", actions: excluded, clean_restart: {
        confirmation: { confirmed: true, requester: "Requester", decision_reference: "decision:clean-restart" },
        mission: { title: "Changed mission", request: "An unrelated request", contexts: [{ reference: "request:invented", purpose: "Unrelated scope" }], repositories: [repository] },
        prepared_repositories: [{ repository_id: "record-home", context: repository.context, branch: "main", integration_target: repository.integration_target, starting_checkpoint: repository.starting_checkpoint }],
        units: [{ unit_id: f.base.unitId, directory: `construction/units-of-work/${f.base.unitId}`, initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" } }],
      },
    };
    await reconstructionError(run(f, plan), "history_reconstruction_binding_mismatch");
  });

  it("creates a clean restart only from typed requester-confirmed bootstrap context", async () => {
    const f = fixture();
    const excluded = f.plan.actions.map((action) => ({ ...action, action: "exclude" as const, reason: "The requester selected a clean restart" }));
    const repository = {
      repository_id: "record-home", context: { kind: "existing" as const }, branch: { kind: "current" as const },
      integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" as const },
    };
    const plan: ReconstructionPlan = {
      ...f.plan, mode: "clean-restart", actions: excluded, clean_restart: {
        confirmation: { confirmed: true, requester: "Requester", decision_reference: "decision:clean-restart" },
        mission: { title: "Recovered request", request: "Implement the selected work", contexts: [{ reference: "request:original", purpose: "Requester-confirmed scope" }], repositories: [repository] },
        prepared_repositories: [{ repository_id: "record-home", context: repository.context, branch: "main", integration_target: repository.integration_target, starting_checkpoint: repository.starting_checkpoint }],
        units: [{ unit_id: f.base.unitId, directory: `construction/units-of-work/${f.base.unitId}`, initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" } }],
      },
    };
    const checks = dependencies();
    const result = await run(f, plan, checks);
    const mission = result.history.events.find((record) => record.event?.type === "construction.mission-created")?.event;
    const workspaces = result.history.events.find((record) => record.event?.type === "construction.mission-workspaces-prepared")?.event;
    const unit = result.history.events.find((record) => record.event?.type === "construction.unit-created")?.event;
    expect(result.history.events).toHaveLength(3);
    expect(mission).toBeDefined();
    expect(workspaces?.caused_by).toEqual([mission?.id]);
    expect(unit?.caused_by).toEqual([workspaces?.id]);
    expect(result.history.events.every((record) => record.event?.data.mission_id === f.base.missionId)).toBe(true);
    expect(result.history.events.some((record) => record.event?.recorded_at === timestamp && record.event.id === f.base.creation.id)).toBe(false);
    expect(result.state).toMatchObject({ units: [{ unitId: f.base.unitId }] });
    expect(result.manifest.actions.filter((action) => action.action === "add")).toHaveLength(3);
    expect(checks.verifyAuthority).toHaveBeenCalledTimes(3);
  });

  it("adds an explicit correction with fresh current envelopes and remaps its action cause", async () => {
    const f = fixture();
    const unitAction = f.plan.actions.find((action) => action.action === "retain" && action.source?.byte_offset === scanJournalBytes(f.archive.files[0]!.bytes).lines[2]?.byteOffset)!;
    const added = addInteraction(f.base, randomUUID(), unitAction.id);
    const result = await run(f, addPlan(f, [added]));
    const interaction = result.history.events.find((record) => record.event?.type === "construction.interaction-recorded")?.event;
    expect(interaction).toMatchObject({
      id: result.manifest.actions.find((action) => action.id === added.id)?.output.event_id,
      journal_id: result.manifest.actions.find((action) => action.id === added.id)?.output.journal_id,
      recorded_at: timestamp,
      producer: { name: "kepler-recovery-test", version: "3.1.0" },
    });
    expect(interaction?.caused_by).toEqual([f.base.unit.id]);
    expect(result.manifest.actions.find((action) => action.id === added.id)?.output.byte_offset).toBe(0);
    expect(result.source_to_output.find((mapping) => mapping.action_id === added.id)?.source_id).toBeNull();
    expect(result.verification.authority).toContainEqual({ action_id: added.id, reference: "authority:checked" });
  });

  it("requires a disposition for damaged bytes and accepts explicit whole-line exclusion", async () => {
    const f = fixture();
    const original = f.archive.files[0]!;
    const malformedBytes = new TextEncoder().encode("{not-json}\n");
    const unsupportedEvent = { ...scanJournalBytes(original.bytes).lines[0]!.event!, id: randomUUID(), envelope_version: 2 };
    const unsupportedBytes = new TextEncoder().encode(`${JSON.stringify(unsupportedEvent)}\n`);
    const bytes = new Uint8Array(original.bytes.length + malformedBytes.length + unsupportedBytes.length);
    bytes.set(original.bytes);
    bytes.set(malformedBytes, original.bytes.length);
    bytes.set(unsupportedBytes, original.bytes.length + malformedBytes.length);
    const scan = scanJournalBytes(bytes);
    expect(scan.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining(["invalid-json", "unsupported-envelope-version"]));
    const exclusions = scan.lines.slice(-2).map((line, index): ReconstructionPlanAction => ({
      id: randomUUID(), action: "exclude", source: { source_id: f.source.source_id, byte_offset: line.byteOffset, byte_length: line.byteLength + (line.terminated ? 1 : 0) },
      event: null, reason: `The damaged or unsupported archived line ${index + 1} remains preserved in the source archive`, authority: null, proof: null,
      loss_reference: null, data_bindings: [],
    }));
    const actions = addPlan(f, exclusions, []).actions;
    const damagedFixture = rebindArchive(f, [{ ...original, bytes }], actions);
    const result = await run(damagedFixture);
    expect(result.candidate_journals[0]?.bytes).toEqual(original.bytes);
    expect(exclusions.every((excluded) => result.manifest.actions.find((action) => action.id === excluded.id)?.output.event_id === null)).toBe(true);
  });

  it("rejects gaps, overlaps, and partial-event source ranges", async () => {
    const f = fixture();
    const first = f.plan.actions[0]!;
    const gapPlan = { ...f.plan, actions: [first, ...f.plan.actions.slice(2)] };
    await reconstructionError(run(f, gapPlan), "history_reconstruction_disposition_incomplete");
    const partialPlan = { ...f.plan, actions: [{ ...first, source: { ...first.source!, byte_offset: 1 } }, ...f.plan.actions.slice(1)] };
    await reconstructionError(run(f, partialPlan), "history_reconstruction_disposition_incomplete");
    const overlappingAction = { ...first, id: randomUUID() };
    const overlappingActions = [...f.plan.actions, overlappingAction].sort((left, right) =>
      (left.source?.byte_offset ?? -1) - (right.source?.byte_offset ?? -1) || left.id.localeCompare(right.id));
    await reconstructionError(run(f, { ...f.plan, actions: overlappingActions }), "history_reconstruction_disposition_incomplete");
  });

  it("replaces an explicit source event with a fresh envelope and remaps its causal action", async () => {
    const f = fixture();
    const sourceBytes = f.archive.files[0]!.bytes;
    const originalUnit = scanJournalBytes(sourceBytes).lines[2]!.event!;
    const replacedAction = f.plan.actions[2]!;
    const workspaceAction = f.plan.actions[1]!;
    const replacement: ReconstructionPlanAction = {
      ...replacedAction, action: "replace",
      event: {
        phase: "construction", type: originalUnit.type, event_version: originalUnit.event_version,
        data: { ...originalUnit.data, initial_effort: { default: "comprehensive", stage_overrides: {}, selected_by: "Requester" } },
        causes: [{ event_id: null, action_id: workspaceAction.id }],
      },
      reason: "Correct the requester-confirmed effort selection", authority: { decision_reference: "decision:effort", artifact_bindings: [] },
    };
    const plan: ReconstructionPlan = {
      ...f.plan, actions: f.plan.actions.map((action) => action.id === replacedAction.id ? replacement : action),
      dependency_order: [replacement.id],
    };
    const result = await run(f, plan);
    const corrected = result.history.events.find((record) => record.event?.type === "construction.unit-created")?.event;
    expect(corrected?.id).not.toBe(originalUnit.id);
    expect(corrected?.caused_by).toEqual([scanJournalBytes(sourceBytes).lines[1]!.event!.id]);
    expect(corrected?.data.initial_effort).toEqual({ default: "comprehensive", stage_overrides: {}, selected_by: "Requester" });
    expect(result.source_to_output.find((mapping) => mapping.action_id === replacement.id)?.disposition).toBe("replace");
  });

  it("requires missing-source additions to cite a loss in the selected reset", async () => {
    const f = fixture([{ reference: "loss:declared", reason: "Original record is absent", consequences: "The prior decision remains unknown" }]);
    const retainedUnit = f.plan.actions.find((action) => action.source?.byte_offset === scanJournalBytes(f.archive.files[0]!.bytes).lines[2]?.byteOffset)!;
    const add = { ...addInteraction(f.base, randomUUID(), retainedUnit.id), loss_reference: "loss:unknown" };
    await reconstructionError(run(f, addPlan(f, [add])), "history_reconstruction_loss_unknown");
    const declared = await run(f, addPlan(f, [{ ...add, loss_reference: "loss:declared" }]));
    expect(declared.manifest.actions.find((action) => action.id === add.id)?.loss_reference).toBe("loss:declared");
  });

  it("rejects duplicate action identities, missing causes, and dependency-order violations", async () => {
    const f = fixture();
    const duplicate = { ...f.plan, actions: [...f.plan.actions, f.plan.actions[0]!] };
    expect(() => parseReconstructionPlan(duplicate)).toThrow(HistoryError);
    const missingCause = addInteraction(f.base, randomUUID(), randomUUID());
    await reconstructionError(run(f, addPlan(f, [missingCause])), "history_reconstruction_invalid");
    const dependency = addInteraction(f.base, randomUUID(), f.plan.actions[2]!.id);
    const dependent = addInteraction(f.base, randomUUID(), dependency.id);
    const dependencyPlan = addPlan(f, [dependency, dependent], [dependent.id, dependency.id]);
    expect(() => parseReconstructionPlan(dependencyPlan)).toThrow(HistoryError);
  });

  it("rejects unknown data pointers, prototype traversal, and unbound event placeholders", () => {
    const f = fixture();
    const action = addInteraction(f.base, randomUUID(), f.plan.actions[2]!.id);
    const bad = { ...action, event: { ...action.event!, type: "construction.task-completed", data: {
      mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "implementation", stage_attempt_id: randomUUID(), task_id: randomUUID(),
      integration_event_id: { $event_action: f.plan.actions[2]!.id }, conditions: ["Complete"],
    } }, data_bindings: [{ pointer: "/unit_id", action_id: f.plan.actions[2]!.id }] };
    expect(() => parseReconstructionPlan(addPlan(f, [bad]))).toThrow(HistoryError);
    const prototype = { ...bad, data_bindings: [{ pointer: "/__proto__/event_id", action_id: f.plan.actions[2]!.id }] };
    expect(() => parseReconstructionPlan(addPlan(f, [prototype]))).toThrow(HistoryError);
    const guessed = { ...bad, event: { ...bad.event, data: { ...bad.event.data, opaque_event_id: { $event_action: f.plan.actions[2]!.id } } }, data_bindings: [{ pointer: "/opaque_event_id", action_id: f.plan.actions[2]!.id }] };
    expect(() => parseReconstructionPlan(addPlan(f, [guessed]))).toThrow(HistoryError);
  });

  it("accepts unchanged and explicitly mapped owner references, but rejects excluded, replaced, and wrong-kind targets", () => {
    const { f, prepared, accepted, completed } = referenceFacts();
    const retainedPrepared = referenceAction("retain");
    const retainedAccepted = referenceAction("retain");
    const retainedCompletion = referenceAction("retain");
    expect(() => validateReconstructionReferences(
      new Map<string, ConstructionEventRecord>([[prepared.id, prepared], [accepted.id, accepted], [completed.id, completed]]),
      new Map<string, ReconstructionPlanAction>([[prepared.id, retainedPrepared], [accepted.id, retainedAccepted], [completed.id, retainedCompletion]]),
    )).not.toThrow();

    const replacedAccepted = referenceAction("replace");
    const replacementId = randomUUID();
    const replacementAccepted = validatedFact("construction.integration-accepted", accepted.data as Record<string, unknown>, accepted.journal_id, replacementId);
    const mappedCompletionEvent = validatedFact("construction.task-completed", { ...completed.data, integration_event_id: replacementId }, completed.journal_id);
    const mappedCompletion = referenceAction("add", [{ pointer: "/integration_event_id", action_id: replacedAccepted.id }]);
    expect(() => validateReconstructionReferences(
      new Map<string, ConstructionEventRecord>([[prepared.id, prepared], [replacementId, replacementAccepted], [mappedCompletionEvent.id, mappedCompletionEvent]]),
      new Map<string, ReconstructionPlanAction>([[prepared.id, retainedPrepared], [replacementId, replacedAccepted], [mappedCompletionEvent.id, mappedCompletion]]),
    )).not.toThrow();

    const staleCompletion = validatedFact("construction.task-completed", { ...completed.data, integration_event_id: accepted.id }, completed.journal_id);
    expect(() => validateReconstructionReferences(
      new Map<string, ConstructionEventRecord>([[prepared.id, prepared], [staleCompletion.id, staleCompletion]]),
      new Map<string, ReconstructionPlanAction>([[prepared.id, retainedPrepared], [staleCompletion.id, retainedCompletion]]),
    )).toThrow(HistoryError);

    expect(() => validateReconstructionReferences(
      new Map<string, ConstructionEventRecord>([[prepared.id, prepared], [replacementAccepted.id, replacementAccepted], [staleCompletion.id, staleCompletion]]),
      new Map<string, ReconstructionPlanAction>([[prepared.id, retainedPrepared], [replacementAccepted.id, replacedAccepted], [staleCompletion.id, retainedCompletion]]),
    )).toThrow(HistoryError);

    const unitValidation = validateConstructionEvent(f.base.unit);
    if (unitValidation.status !== "valid") throw new Error("Invalid reference target fixture");
    const wrongKindCompletion = validatedFact("construction.task-completed", { ...completed.data, integration_event_id: unitValidation.event.id }, completed.journal_id);
    expect(() => validateReconstructionReferences(
      new Map<string, ConstructionEventRecord>([[unitValidation.event.id, unitValidation.event], [wrongKindCompletion.id, wrongKindCompletion]]),
      new Map<string, ReconstructionPlanAction>([[unitValidation.event.id, retainedPrepared], [wrongKindCompletion.id, retainedCompletion]]),
    )).toThrow(HistoryError);
  });

  it("rejects a current-fact reference bound to the wrong selected event kind", async () => {
    const f = fixture();
    const retainedUnit = f.plan.actions[2]!;
    const addId = randomUUID();
    const generated = {
      ...addInteraction(f.base, addId, retainedUnit.id),
      event: {
        phase: "construction" as const, type: "construction.task-completed", event_version: 1,
        data: {
          mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "implementation", stage_attempt_id: randomUUID(),
          task_id: randomUUID(), integration_event_id: { $event_action: retainedUnit.id }, conditions: ["Claimed completion"],
        },
        causes: [{ event_id: null, action_id: retainedUnit.id }],
      },
      proof: { reference: "proof:task-completion", content_version: historyDigest("real check output") },
    };
    const material = { artifact_bindings: [], checkpoints: [], evidence: [generated.proof] };
    const plan = { ...addPlan(f, [generated]), required_material: material, actions: addPlan(f, [generated]).actions.map((action) => action.id === generated.id
      ? { ...action, data_bindings: [{ pointer: "/integration_event_id", action_id: retainedUnit.id }] }
      : action) };
    const checks = dependencies();
    checks.verifyAuthority.mockImplementation(async ({ event }) => {
      expect(event.data.integration_event_id).toBe(f.base.unit.id);
      return { status: "valid", reference: "authority:checked" };
    });
    await reconstructionError(run(f, plan, checks), "history_reconstruction_reference_invalid");
    expect(checks.verifyAuthority).toHaveBeenCalled();
  });

  it("requires passed-work proof and rejects a failing mandatory authority verifier", async () => {
    const f = fixture();
    const unproved = {
      id: randomUUID(), action: "add" as const, source: null, reason: "Add a reported check", loss_reference: null, data_bindings: [],
      authority: { decision_reference: "decision:check", artifact_bindings: [] }, proof: null,
      event: { phase: "construction" as const, type: "construction.evidence-recorded", event_version: 1, causes: [], data: {
        mission_id: f.base.missionId, unit_id: f.base.unitId, stage: "functional-design", stage_attempt_id: randomUUID(), evidence_id: randomUUID(),
        artifact_bindings: [], checkpoints: [], inputs: [], check: "unit checks", executor: "runner", result: { status: "passed", summary: "Passed" }, output_refs: [], conditions: [],
      } },
    };
    await reconstructionError(run(f, addPlan(f, [unproved])), "history_reconstruction_proof_required");
    const interaction = addInteraction(f.base, randomUUID(), f.plan.actions[2]!.id);
    const checks = dependencies();
    checks.verifyAuthority.mockResolvedValue({ status: "invalid", reason: "No approved requester decision" });
    await reconstructionError(run(f, addPlan(f, [interaction]), checks), "history_reconstruction_authority_invalid");
    expect(checks.verifyMaterial).not.toHaveBeenCalled();
    expect(checks.verifyContinuation).not.toHaveBeenCalled();
  });

  it("rejects plans bound to another mission, reset generation, or archive index", async () => {
    const f = fixture();
    await reconstructionError(run(f, { ...f.plan, mission_id: randomUUID() }), "history_reconstruction_reset_mismatch");
    await reconstructionError(run(f, { ...f.plan, generation_id: randomUUID() }), "history_reconstruction_reset_mismatch");
    await reconstructionError(run(f, { ...f.plan, archive_inventory_hash: historyDigest("other index") }), "history_reconstruction_reset_mismatch");
  });

  it("rejects malformed strict JSON and requires every owner verifier", async () => {
    expect(() => parseReconstructionPlan('{"format":"a","format":"b"}')).toThrow(HistoryError);
    expect(() => parseReconstructionPlan({ ...fixture().plan, unexpected: true })).toThrow(HistoryError);
    const f = fixture();
    await reconstructionError(prepareReconstruction({ plan: f.plan, reset: f.reset, archive: f.archive } as never), "history_reconstruction_verifier_required");
  });

  it("does not accept a candidate unless material and continuation checks return valid receipts", async () => {
    const f = fixture();
    const materialChecks = dependencies();
    materialChecks.verifyMaterial.mockResolvedValue({ status: "invalid", reason: "A required artifact version is unavailable" });
    await reconstructionError(run(f, f.plan, materialChecks), "history_reconstruction_material_invalid");
    expect(materialChecks.verifyContinuation).not.toHaveBeenCalled();
    const continuationChecks = dependencies();
    continuationChecks.verifyContinuation.mockResolvedValue({ status: "invalid", reason: "The selected operation is not ready" });
    await reconstructionError(run(f, f.plan, continuationChecks), "history_reconstruction_continuation_invalid");
  });
});
