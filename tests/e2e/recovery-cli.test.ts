import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import { historyDigest, historyManifestDigest, parseHistoryControl, type HistoryResetManifest, type HistorySourceEntry } from "../../packages/cli/src/history/control.js";
import { HISTORY_CLIENT_COMPATIBILITY_FORMAT, HISTORY_CLIENT_COMPATIBILITY_PURPOSE, HISTORY_CLIENT_GENERATION_PROTOCOL, type HistoryClientCompatibilityDocument } from "../../packages/cli/src/history/client-compatibility.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex } from "../../packages/cli/src/history/archive-index.js";
import type { CleanRestartContext, ReconstructionPlan } from "../../packages/cli/src/history/reconstruction.js";
import { HISTORY_LEAD_RECONCILIATION_FORMAT, HISTORY_LEAD_RECONCILIATION_PURPOSE, historyLeadReconciliationSnapshotReference, serializeHistoryLeadReconciliationReport, type HistoryLeadReconciliationReport } from "../../packages/cli/src/history/reconciliation.js";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createE2EHarness, type E2EHarness } from "./harness.js";

const harnesses: E2EHarness[] = [];
const missionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rawControl = "private recovery source bytes that must not be printed";

const envelope = (stdout: string): { status: string; data: Record<string, unknown> } => {
  expect(stdout.endsWith("\n")).toBe(true);
  const result = JSON.parse(stdout) as {
    status: string;
    data: Record<string, unknown>;
  };
  expect(Object.keys(result)).toEqual(["status", "data"]);
  return result;
};

const snapshot = async (root: string): Promise<string> => {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await Fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, child.name);
      const relative = Path.relative(root, path);
      const stat = await Fs.lstat(path);
      if (child.isDirectory()) {
        entries.push(`${relative}:directory:${stat.mtimeMs}`);
        await visit(path);
      } else if (child.isSymbolicLink()) {
        entries.push(`${relative}:link:${await Fs.readlink(path)}`);
      } else {
        entries.push(`${relative}:file:${stat.mtimeMs}:${(await Fs.readFile(path)).toString("base64")}`);
      }
    }
  };
  await visit(root);
  return entries.join("\n");
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

const clientCompatibilityFixture = (input: {
  readonly operation: HistoryClientCompatibilityDocument["operation"];
  readonly missionBinding: HistoryClientCompatibilityDocument["mission_binding"];
  readonly generationId: string;
  readonly evidenceReference: string;
  readonly evidenceBytes: Uint8Array;
  readonly origin: string;
}) => {
  const path = `.kepler/missions/${input.missionBinding.mission_id}/recovery/reconciliation/client-compatibility-${input.operation}-${input.generationId}.json`;
  const reference = historyLeadReconciliationSnapshotReference(`${input.origin}:${path}`);
  const document: HistoryClientCompatibilityDocument = {
    format: HISTORY_CLIENT_COMPATIBILITY_FORMAT,
    version: 1,
    mission_binding: input.missionBinding,
    generation_id: input.generationId,
    operation: input.operation,
    required_protocol: HISTORY_CLIENT_GENERATION_PROTOCOL,
    confirmed_by: "agent:lead",
    scope_complete: true,
    external_client_references: [],
    clients: [{ reference: "client:recovery-lead", kind: "interactive", run_references: [], origin_ids: [input.origin], protocol_status: "compatible", operational_state: "stopped", client_identity: "Kepler public CLI fixture adapter build test-commit", evidence: [{ reference: input.evidenceReference, content_version: historyDigest(input.evidenceBytes) }] }],
    unresolved_clients: [],
    source_material: [{ reference: input.evidenceReference, content_version: historyDigest(input.evidenceBytes) }],
  };
  const bytes = new TextEncoder().encode(`${canonicalJson(document)}\n`);
  return { path, reference, document, bytes };
};

describe.each(["native", "docker"] as const)("recovery commands (%s)", (application) => {
  it("recovers and joins reconstructed history through exact public CLI decisions", async () => {
    const harness = await createE2EHarness({ application });
    harnesses.push(harness);
    const root = harness.resources.repositoryDirectory;
    const selectedRoot = application === "docker" ? "/test/repository" : root;
    await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
    await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
    const request = { title: "Recover an isolated mission", request: "Exercise explicit recovery decisions", workflow: "standard", recordHomeRepositoryId: "record-home", contexts: [], repositories: [{ repositoryId: "record-home", workspace: { kind: "existing", path: selectedRoot }, branch: { kind: "current" }, integrationTarget: "main" }] };
    const created = harness.cli.run(["mission", "create", "--project", root, "--request", JSON.stringify(request)]);
    expect(created.exitCode).toBe(0);
    const id = envelope(created.stdout).data.mission_id as string;
    const activePath = Path.join(root, ".kepler", "missions", id, "history", "control", "active.json");
    const activeBytes = await Fs.readFile(activePath);
    const active = parseHistoryControl(activeBytes.toString("utf8"));
    if (active.data.manifest.format !== "kepler.mission-history-initialization") throw new Error("Expected isolated startup selection");
    const target = randomUUID();
    const evidencePath = `.kepler/missions/${id}/recovery/reconciliation/evidence.txt`;
    const reportPath = `.kepler/missions/${id}/recovery/reconciliation/reset-${target}.json`;
    await Fs.mkdir(Path.dirname(Path.join(root, evidencePath)), { recursive: true });
    const evidence = new TextEncoder().encode("The isolated lead confirms no affected workers or external effects.\n");
    await Fs.writeFile(Path.join(root, evidencePath), evidence);
    const inspect = () => {
      const result = harness.cli.run(["recovery", "inspect", "--project", root, "--mission", id]);
      expect(result.exitCode).toBe(0);
      return envelope(result.stdout).data;
    };
    const initialInventory = inspect().source_inventory as HistorySourceEntry[];
    const source = initialInventory.find((entry) => entry.path === evidencePath)!;
    const reference = historyLeadReconciliationSnapshotReference(source.source_id);
    const binding = active.data.manifest.mission_binding;
    const compatibility = clientCompatibilityFixture({ operation: "reset", missionBinding: binding, generationId: target, evidenceReference: reference, evidenceBytes: evidence, origin: source.origin });
    await Fs.writeFile(Path.join(root, compatibility.path), compatibility.bytes);
    const initialJournal = active.data.manifest.candidate_journals[0]!;
    const facts = (await Fs.readFile(Path.join(root, ".kepler", "missions", id, "history", "generations", active.data.generation_id, initialJournal.phase, `${initialJournal.journal_id}.jsonl`), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
    const creation = facts.find((fact) => fact.type === "construction.mission-created")!.data as unknown as CleanRestartContext["mission"];
    const preparedRepositories = facts.find((fact) => fact.type === "construction.mission-workspaces-prepared")!.data.repositories as CleanRestartContext["prepared_repositories"];
    const authorityPath = `.kepler/missions/${id}/recovery/reconciliation/clean-restart-${target}.json`;
    const authorityReference = historyLeadReconciliationSnapshotReference(`${source.origin}:${authorityPath}`);
    const cleanRestart: CleanRestartContext = { confirmation: { confirmed: true, requester: "Requester", decision_reference: authorityReference }, mission: { title: creation.title, request: creation.request, contexts: creation.contexts, repositories: creation.repositories }, prepared_repositories: preparedRepositories, units: [] };
    const authorityBytes = new TextEncoder().encode(`${canonicalJson({ format: "kepler.history-action-authority", version: 1, mission_id: id, requester: "Requester", decision_reference: authorityReference, decision: "approved", subject: { kind: "clean-restart", input_hash: historyDigest(canonicalJson(cleanRestart)) }, source_material: [{ reference, content_version: historyDigest(evidence) }] })}\n`);
    await Fs.writeFile(Path.join(root, authorityPath), authorityBytes);
    const inventory = inspect().source_inventory as HistorySourceEntry[];
    const reportMaterials = [
      { reference: compatibility.reference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: historyDigest(compatibility.bytes) },
      { reference, purpose: "lead reconciliation evidence", content_version: historyDigest(evidence) },
    ].sort((left, right) => left.reference < right.reference ? -1 : left.reference > right.reference ? 1 : 0);
    const report: HistoryLeadReconciliationReport = { format: HISTORY_LEAD_RECONCILIATION_FORMAT, version: 1, mission: { mission_id: id, record_home_repository_id: binding.record_home_repository_id, workflow: binding.workflow, request_reference: binding.request_reference }, prior_history: { generation_id: active.data.generation_id, history_version: active.id, content_version: historyDigest(activeBytes) }, target_generation_id: target, attribution: { orchestrator: "agent:lead", lead: "agent:lead" }, original_inventory: inventory, original_inventory_hash: historyDigest(canonicalJson(inventory)), scope_evidence_references: reportMaterials.map((material) => material.reference), affected_workers: [], materials: reportMaterials, effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } }, unresolved_items: [], unknown_items: [] };
    await Fs.writeFile(Path.join(root, reportPath), serializeHistoryLeadReconciliationReport(report));
    const inputs = inspect().source_inventory as HistorySourceEntry[];
    const reportSource = inputs.find((entry) => entry.path === reportPath)!;
    const manifest: HistoryResetManifest = { format: "kepler.mission-history-reset", version: 1, mission_binding: binding, previous_control: { event_id: active.id, content_version: historyDigest(activeBytes) }, source_inventory: inputs, known_missing_sources: [], archive_id: randomUUID(), generation_id: target, source_retirement: [], requester: "Requester", reason: "Requester-approved isolated reset", reconciliation: { orchestrator: "agent:lead", affected_workers_terminal: true, effects_reconciled: true, integration_lock_reconciled: true, run_references: [], references: [{ reference: historyLeadReconciliationSnapshotReference(reportSource.source_id), purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE }, ...reportMaterials.map(({ reference, purpose }) => ({ reference, purpose }))], summary: "The isolated fixture has no active workers or unresolved effects" }, accepted_limits: [] };
    const args = ["recovery", "reset", "--project", root, "--mission", id];
    const before = await snapshot(root);
    const preview = harness.cli.run(args, { stdin: JSON.stringify({ phase: "preview", manifest }) });
    expect(preview.exitCode).toBe(0);
    expect(envelope(preview.stdout)).toMatchObject({ status: "success", data: { proposed: true, mode: "recovering", execution_started: false, manifest_hash: historyManifestDigest(manifest) } });
    expect(await snapshot(root)).toBe(before);
    const denied = harness.cli.run(args, { stdin: JSON.stringify({ phase: "apply", manifest }) });
    expect(denied.exitCode).toBe(1);
    expect(await snapshot(root)).toBe(before);
    const approved = JSON.stringify({ phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: "decision:isolated-exact-reset" });
    const applied = harness.cli.run(args, { stdin: approved });
    expect(envelope(applied.stdout)).toMatchObject({ status: "success", data: { mode: "recovering", generation_id: target, execution_started: false, already_applied: false } });
    expect(applied.exitCode).toBe(0);
    const receipt = envelope(applied.stdout).data.receipt;
    const retried = harness.cli.run(args, { stdin: approved });
    expect(retried.exitCode).toBe(0);
    expect(envelope(retried.stdout)).toMatchObject({ status: "success", data: { already_applied: true, receipt, mode: "recovering" } });
    expect(inspect()).toMatchObject({ mode: "recovering", generation_id: target });
    const blocked = harness.cli.run(["workflow", "construction", "unit", "create", "do-not-dispatch", "--mission", id, "--project", root, "--history-version", envelope(applied.stdout).data.history_version as string]);
    expect(blocked.exitCode).toBe(1);
    expect(envelope(blocked.stdout)).toMatchObject({ status: "failed", data: { code: "history_recovery_pending" } });
    expect(await Fs.readFile(Path.join(root, evidencePath))).toEqual(Buffer.from(evidence));
    const resetControl = parseHistoryControl(await Fs.readFile(activePath, "utf8"));
    const publishCompatibility = clientCompatibilityFixture({ operation: "publish", missionBinding: binding, generationId: target, evidenceReference: reference, evidenceBytes: evidence, origin: source.origin });
    await Fs.writeFile(Path.join(root, publishCompatibility.path), publishCompatibility.bytes);
    const publishReportPath = `.kepler/missions/${id}/recovery/reconciliation/publish-${target}.json`;
    const publishReportReference = historyLeadReconciliationSnapshotReference(`${source.origin}:${publishReportPath}`);
    const beforeDraft = inspect().source_inventory as HistorySourceEntry[];
    const publishReportMaterials = [
      { reference: publishCompatibility.reference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: historyDigest(publishCompatibility.bytes) },
      { reference, purpose: "lead reconciliation evidence", content_version: historyDigest(evidence) },
    ].sort((left, right) => left.reference < right.reference ? -1 : left.reference > right.reference ? 1 : 0);
    const publishReport: HistoryLeadReconciliationReport = { ...report, prior_history: { generation_id: target, history_version: resetControl.id, content_version: historyDigest(await Fs.readFile(activePath)) }, original_inventory: beforeDraft, original_inventory_hash: historyDigest(canonicalJson(beforeDraft)), scope_evidence_references: publishReportMaterials.map((material) => material.reference), materials: publishReportMaterials };
    const publishReportBytes = serializeHistoryLeadReconciliationReport(publishReport);
    await Fs.writeFile(Path.join(root, publishReportPath), publishReportBytes);
    const archiveIndex = parseHistoryArchiveIndex(await Fs.readFile(Path.join(root, ".git", "kepler", "missions", id, "recovery", "archives", manifest.archive_id, "index.json"), "utf8"));
    const candidate = randomUUID();
    const checkpoints = preparedRepositories.flatMap((repository) => repository.starting_checkpoint.kind === "commit" ? [{ repository_id: repository.repository_id, commit: repository.starting_checkpoint.commit }] : []);
    const plan: ReconstructionPlan = { format: "kepler.mission-history-reconstruction-plan", version: 1, mode: "clean-restart", mission_id: id, generation_id: target, reset_event_id: resetControl.id, archive_id: manifest.archive_id, archive_inventory_hash: historyArchiveIndexDigest(archiveIndex), actions: archiveIndex.source_inventory.filter((entry) => entry.path.startsWith(`.kepler/missions/${id}/history/`)).map((entry) => ({ id: randomUUID(), action: "exclude" as const, source: { source_id: entry.source_id, byte_offset: 0, byte_length: entry.byte_length }, event: null, reason: "Requester selects no accepted prior progress", authority: null, proof: null, loss_reference: null, data_bindings: [] })), dependency_order: [], required_material: { artifact_bindings: [], checkpoints, evidence: [{ reference: authorityReference, content_version: historyDigest(authorityBytes) }, { reference, content_version: historyDigest(evidence) }, { reference: publishCompatibility.reference, content_version: historyDigest(publishCompatibility.bytes) }, { reference: publishReportReference, content_version: historyDigest(publishReportBytes) }] }, continuation: { operation: "recovery.inspect", unresolved_work: [], required_approvals: [] }, requester: "Requester", reconciliation: { ...manifest.reconciliation, references: [{ reference: publishReportReference, purpose: HISTORY_LEAD_RECONCILIATION_PURPOSE }, ...publishReportMaterials.map(({ reference, purpose }) => ({ reference, purpose }))] }, clean_restart: cleanRestart };
    const reconstruction = harness.cli.run(["recovery", "reconstruct", "--project", root, "--mission", id], { stdin: JSON.stringify({ phase: "prepare", candidate_id: candidate, plan }) });
    expect(envelope(reconstruction.stdout), reconstruction.stdout).toMatchObject({ status: "success", data: { mode: "recovering", published: false, execution_started: false } });
    expect(reconstruction.exitCode).toBe(0);
    const proposed = envelope(reconstruction.stdout).data.manifest;
    const publishArgs = ["recovery", "publish", "--project", root, "--mission", id];
    const publicationPreview = harness.cli.run(publishArgs, { stdin: JSON.stringify({ phase: "preview", manifest: proposed }) });
    expect(envelope(publicationPreview.stdout), publicationPreview.stdout).toMatchObject({ status: "success", data: { proposed: true, execution_started: false } });
    expect(publicationPreview.exitCode).toBe(0);
    const publication = harness.cli.run(publishArgs, { stdin: JSON.stringify({ phase: "apply", manifest: proposed, approved_manifest_hash: envelope(reconstruction.stdout).data.manifest_hash, requester: "Requester", decision_reference: "decision:isolated-exact-publication" }) });
    expect(envelope(publication.stdout), publication.stdout).toMatchObject({ status: "success", data: { mode: "active", generation_id: target, execution_started: false } });
    expect(publication.exitCode).toBe(0);
    const published = envelope(publication.stdout).data.history_version as string;
    const publishedSelector = await Fs.readFile(activePath);
    const archivedPath = Path.join(root, ".git", "kepler", "missions", id, "recovery", "archives", manifest.archive_id);
    const preservedElsewhere = Path.join(Path.dirname(root), "retained-archive");
    await Fs.rename(archivedPath, preservedElsewhere);
    try {
      const joinArgs = ["mission", "prepare", "--project", root, "--mission", id, "--history-version", published];
      await Fs.writeFile(Path.join(root, authorityPath), "Changed retained material\n");
      const rejectedJoin = harness.cli.run(joinArgs);
      expect(envelope(rejectedJoin.stdout), rejectedJoin.stdout).toMatchObject({ status: "failed", data: { code: "history_material_changed" } });
      expect(rejectedJoin.exitCode).toBe(1);
      expect(await Fs.readFile(activePath)).toEqual(publishedSelector);
      await Fs.writeFile(Path.join(root, authorityPath), authorityBytes);
      const joined = harness.cli.run(joinArgs);
      expect(envelope(joined.stdout), joined.stdout).toMatchObject({ status: "success", data: { execution_started: false, history: { history_version: published, generation_id: target, coordination: "bound" } } });
      expect(joined.exitCode).toBe(0);
    } finally {
      await Fs.rename(preservedElsewhere, archivedPath);
    }
    const oldRetry = harness.cli.run(args, { stdin: approved });
    expect(oldRetry.exitCode).toBe(0);
    expect(envelope(oldRetry.stdout)).toMatchObject({ data: { already_applied: true, history_version: published, receipt: { history_version: resetControl.id } } });
    expect(await Fs.readFile(activePath)).toEqual(publishedSelector);
    const beforeLate = await snapshot(root);
    const late = harness.cli.run(["workflow", "construction", "unit", "create", "late-work", "--mission", id, "--project", root, "--history-version", resetControl.id]);
    expect(late.exitCode).toBe(1);
    expect(envelope(late.stdout)).toMatchObject({ status: "failed", data: { code: "history_version_mismatch" } });
    expect(await snapshot(root)).toBe(beforeLate);
    const continued = harness.cli.run(["workflow", "construction", "unit", "create", "after-recovery", "--mission", id, "--project", root, "--history-version", published]);
    expect(envelope(continued.stdout).status, continued.stdout).toBe("success");
    expect(continued.exitCode).toBe(0);
    expect(await Fs.readFile(activePath)).toEqual(publishedSelector);
  }, 240_000);
  it("wires inspect and status to raw history inspection without changing the selected repository", async () => {
    const harness = await createE2EHarness({ application });
    harnesses.push(harness);
    const repository = harness.resources.repositoryDirectory;
    const controlPath = Path.join(
      repository,
      ".kepler",
      "missions",
      missionId,
      "history",
      "control",
      "active.json",
    );
    await Fs.mkdir(Path.dirname(controlPath), { recursive: true });
    await Fs.writeFile(Path.join(repository, ".kepler", "marker"), "v3\n");
    await Fs.writeFile(controlPath, rawControl);
    const before = await snapshot(repository);

    const inspect = harness.cli.run([
      "recovery",
      "inspect",
      "--project",
      repository,
      "--mission",
      missionId,
    ]);
    const status = harness.cli.run([
      "recovery",
      "status",
      "--project",
      repository,
      "--mission",
      missionId,
    ]);

    const inspected = envelope(inspect.stdout);
    const reported = envelope(status.stdout);
    expect(inspect.exitCode).toBe(0);
    expect(status.exitCode).toBe(0);
    expect(inspect.stderr).toBe("");
    expect(status.stderr).toBe("");
    expect(inspected.status).toBe("success");
    expect(inspected.data).toEqual(reported.data);
    expect(inspected.data).toMatchObject({
      mission_id: missionId,
      record_home: application === "docker" ? "/test/repository" : repository,
      execution_started: false,
      selection_status: "blocked",
    });
    expect(inspected.data.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "history_control_invalid" }),
    ]));
    expect(inspect.stdout).not.toContain(rawControl);
    expect(status.stdout).not.toContain(rawControl);
    expect(await snapshot(repository)).toBe(before);
  }, 120_000);
});
