import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { historyDigest, historyManifestDigest, parseHistoryControl, parseHistoryGuard, type HistoryInitializationManifest, type HistorySourceEntry } from "../../packages/cli/src/history/control.js";
import { HISTORY_CLIENT_COMPATIBILITY_FORMAT, HISTORY_CLIENT_COMPATIBILITY_PURPOSE, HISTORY_CLIENT_GENERATION_PROTOCOL, type HistoryClientCompatibilityDocument } from "../../packages/cli/src/history/client-compatibility.js";
import { parseHistoryArchiveIndex } from "../../packages/cli/src/history/archive-index.js";
import { collectHistory, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { HISTORY_LEAD_RECONCILIATION_FORMAT, historyLeadReconciliationSnapshotReference, serializeHistoryLeadReconciliationReport, type HistoryLeadReconciliationReport } from "../../packages/cli/src/history/reconciliation.js";
import { createMigrationCliFixture, type MigrationCliFixture } from "../helpers/migration-cli-fixture.js";
import { TemporaryE2EResourceConnector, type E2EResources } from "./resources.js";

const resourcesToClean: E2EResources[] = [];
const fixturesToClean: MigrationCliFixture[] = [];
const migrationGuideReference = "resource:skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md";

const envelope = (stdout: string): { readonly status: string; readonly data: Record<string, unknown> } => {
  expect(stdout.endsWith("\n")).toBe(true);
  const result = JSON.parse(stdout) as { readonly status: string; readonly data: Record<string, unknown> };
  expect(Object.keys(result)).toEqual(["status", "data"]);
  return result;
};

const snapshotTree = async (root: string): Promise<string> => {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const child of (await Fs.readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, child.name);
      const relative = Path.relative(root, path);
      if (child.isDirectory()) {
        entries.push(`${relative}:directory`);
        await visit(path);
      } else if (child.isSymbolicLink()) {
        entries.push(`${relative}:link:${await Fs.readlink(path)}`);
      } else {
        entries.push(`${relative}:file:${(await Fs.readFile(path)).toString("base64")}`);
      }
    }
  };
  await visit(root);
  return entries.join("\n");
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await Fs.lstat(path);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
};

const isMissingPath = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

afterEach(async () => {
  for (const fixture of fixturesToClean.splice(0)) await fixture.cleanup();
  for (const resources of resourcesToClean.splice(0)) await resources.cleanup();
});

describe("healthy migration through a matched compiled CLI", () => {
  it("previews without effects, applies exact approval, preserves state and bytes, and retries without changing the selected head", async () => {
    const fixture = await createMigrationCliFixture();
    fixturesToClean.push(fixture);
    const resources = await new TemporaryE2EResourceConnector().create();
    resourcesToClean.push(resources);
    const repository = resources.repositoryDirectory;
    const commonDirectory = Path.resolve(repository, resources.runGit(repository, "rev-parse", "--git-common-dir"));
    const environment = { ...resources.environment(), KEPLER_PACKAGE_ROOT: fixture.packageRoot };
    const run = async (args: readonly string[], input?: string) => {
      const result = await execa(fixture.binaryPath, [...args], {
        cwd: repository,
        env: environment,
        extendEnv: false,
        reject: false,
        stripFinalNewline: false,
        timeout: 30_000,
        ...(input === undefined ? {} : { input }),
      });
      return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
    };
    const identityResult = await run(["--print-build-identity"]);
    expect(identityResult.exitCode, identityResult.stderr).toBe(0);
    expect(JSON.parse(identityResult.stdout)).toEqual(fixture.identity);
    expect(fixture.identity.source.kind).toBe("development");
    expect(await Fs.readFile(fixture.sourceGuidePath, "utf8")).toContain("status: planned\navailable_in: null");
    expect(Buffer.from(fixture.guideBytes).toString("utf8")).toContain("status: released\navailable_in: 3.1.0");

    await Fs.mkdir(Path.join(repository, ".kepler"), { recursive: true });
    await Fs.writeFile(Path.join(repository, ".kepler", "marker"), "v3\n");
    const request = {
      title: "Migrate an isolated healthy mission",
      request: "Preserve the exact existing mission history",
      workflow: "standard",
      recordHomeRepositoryId: "record-home",
      contexts: [],
      repositories: [{ repositoryId: "record-home", workspace: { kind: "existing", path: repository }, branch: { kind: "current" }, integrationTarget: "main" }],
    };
    const created = await run(["mission", "create", "--project", repository, "--request", JSON.stringify(request)]);
    expect(created.exitCode, created.stderr || created.stdout).toBe(0);
    expect(envelope(created.stdout).status).toBe("success");
    const missionId = String(envelope(created.stdout).data.mission_id);
    const missionRoot = `.kepler/missions/${missionId}`;
    const historyRoot = Path.join(repository, missionRoot, "history");
    const initialBytes = await Fs.readFile(Path.join(historyRoot, "control", "active.json"));
    const initialControl = parseHistoryControl(initialBytes.toString("utf8"));
    expect(initialControl.data.manifest.format).toBe("kepler.mission-history-initialization");
    if (initialControl.data.manifest.format !== "kepler.mission-history-initialization") throw new Error("Mission creation did not produce an initialization manifest");
    const initialManifest = initialControl.data.manifest;
    expect(initialManifest.operation).toBe("create");
    const initialJournal = initialManifest.candidate_journals[0]!;
    const phaseBytes = await Fs.readFile(Path.join(historyRoot, "generations", initialControl.data.generation_id, initialJournal.phase, `${initialJournal.journal_id}.jsonl`));
    const phaseRecords = phaseBytes.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as { id: string; type: string });
    expect(phaseRecords.map((record) => record.type)).toEqual(["construction.mission-created", "construction.mission-workspaces-prepared"]);
    const legacyPath = `${missionRoot}/history/${initialJournal.phase}/${initialJournal.journal_id}.jsonl`;
    await Fs.rm(historyRoot, { recursive: true, force: true });
    await Fs.mkdir(Path.dirname(Path.join(repository, legacyPath)), { recursive: true });
    await Fs.writeFile(Path.join(repository, legacyPath), phaseBytes);
    await Fs.rm(Path.join(commonDirectory, "kepler", "missions", missionId, "coordination", "history-selection.json"), { force: true });

    const targetGeneration = randomUUID();
    const archiveId = randomUUID();
    const evidencePath = `${missionRoot}/recovery/reconciliation/client-scope.txt`;
    const evidenceBytes = Buffer.from("The migration lead inventoried and stopped the affected test client scope.\n");
    await Fs.mkdir(Path.dirname(Path.join(repository, evidencePath)), { recursive: true });
    await Fs.writeFile(Path.join(repository, evidencePath), evidenceBytes);
    const baseInspectionBefore = await snapshotTree(repository);
    const baseInspection = await run(["recovery", "inspect", "--project", repository, "--mission", missionId]);
    expect(baseInspection.exitCode, baseInspection.stderr || baseInspection.stdout).toBe(0);
    const baseInspectionData = envelope(baseInspection.stdout).data;
    expect(baseInspectionData).toMatchObject({ mode: "legacy", migration_required: true, selection_status: "legacy-readonly", execution_started: false });
    expect(await snapshotTree(repository)).toBe(baseInspectionBefore);
    const baseInventory = baseInspectionData.source_inventory as HistorySourceEntry[];
    const directSources = baseInventory.filter((source) => {
      const prefix = `${missionRoot}/history/`;
      if (!source.path.startsWith(prefix)) return false;
      const segments = source.path.slice(prefix.length).split("/");
      return segments.length === 2 && !["control", "generations"].includes(segments[0]!);
    });
    expect(directSources).toHaveLength(1);
    const directSource = directSources[0]!;
    const evidenceSource = baseInventory.find((source) => source.path === evidencePath)!;
    const evidenceReference = historyLeadReconciliationSnapshotReference(evidenceSource.source_id);
    const compatibilityPath = `${missionRoot}/recovery/reconciliation/client-compatibility-migrate-${targetGeneration}.json`;
    const compatibilityReference = historyLeadReconciliationSnapshotReference(`${evidenceSource.origin}:${compatibilityPath}`);
    const compatibility: HistoryClientCompatibilityDocument = {
      format: HISTORY_CLIENT_COMPATIBILITY_FORMAT,
      version: 1,
      mission_binding: initialManifest.mission_binding,
      generation_id: targetGeneration,
      operation: "migrate",
      required_protocol: HISTORY_CLIENT_GENERATION_PROTOCOL,
      confirmed_by: "agent:lead",
      scope_complete: true,
      external_client_references: [],
      clients: [{ reference: "client:migration-lead", kind: "interactive", run_references: [], origin_ids: [evidenceSource.origin], protocol_status: "compatible", operational_state: "stopped", client_identity: "Kepler migration CLI fixture adapter build test-commit", evidence: [{ reference: evidenceReference, content_version: historyDigest(evidenceBytes) }] }],
      unresolved_clients: [],
      source_material: [{ reference: evidenceReference, content_version: historyDigest(evidenceBytes) }],
    };
    const compatibilityBytes = Buffer.from(`${canonicalJson(compatibility)}\n`);
    await Fs.writeFile(Path.join(repository, compatibilityPath), compatibilityBytes);
    const reportInventory = envelope((await run(["recovery", "inspect", "--project", repository, "--mission", missionId])).stdout).data.source_inventory as HistorySourceEntry[];
    const beforeProjection = historyState(collectHistory(missionId, [{ sourceId: directSource.source_id, missionId, phase: initialJournal.phase, journalId: initialJournal.journal_id, bytes: phaseBytes }], { completeness: "complete" }));
    expect(beforeProjection).toEqual(initialManifest.expected_state);

    const reportPath = `${missionRoot}/recovery/reconciliation/migrate-${targetGeneration}.json`;
    const reportSource = directSource;
    const reportReference = historyLeadReconciliationSnapshotReference(reportSource.source_id);
    const report: HistoryLeadReconciliationReport = {
      format: HISTORY_LEAD_RECONCILIATION_FORMAT,
      version: 1,
      mission: {
        mission_id: missionId,
        record_home_repository_id: initialManifest.mission_binding.record_home_repository_id,
        workflow: initialManifest.mission_binding.workflow,
        request_reference: initialManifest.mission_binding.request_reference,
      },
      prior_history: null,
      target_generation_id: targetGeneration,
      attribution: { orchestrator: "agent:lead", lead: "agent:lead" },
      original_inventory: reportInventory,
      original_inventory_hash: historyDigest(canonicalJson(reportInventory)),
      scope_evidence_references: [reportReference, compatibilityReference, evidenceReference].sort(),
      affected_workers: [],
      materials: [
        { reference: reportReference, purpose: "The isolated migration fixture has no active workers or unresolved effects", content_version: reportSource.content_version },
        { reference: compatibilityReference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: historyDigest(compatibilityBytes) },
        { reference: evidenceReference, purpose: "Client inventory and stopped-state evidence", content_version: historyDigest(evidenceBytes) },
      ].sort((left, right) => left.reference < right.reference ? -1 : left.reference > right.reference ? 1 : 0),
      effects: { files: [], repositories: [], external: [], local_claims: { outcome: "clear" } },
      unresolved_items: [],
      unknown_items: [],
    };
    const reportBytes = serializeHistoryLeadReconciliationReport(report);
    await Fs.mkdir(Path.dirname(Path.join(repository, reportPath)), { recursive: true });
    await Fs.writeFile(Path.join(repository, reportPath), reportBytes);
    const inspectionBefore = await snapshotTree(repository);
    const inspection = await run(["recovery", "inspect", "--project", repository, "--mission", missionId]);
    expect(inspection.exitCode, inspection.stderr || inspection.stdout).toBe(0);
    const inspectionData = envelope(inspection.stdout).data;
    expect(inspectionData).toMatchObject({ mode: "legacy", migration_required: true, selection_status: "legacy-readonly" });
    expect(await snapshotTree(repository)).toBe(inspectionBefore);
    const sourceInventory = inspectionData.source_inventory as HistorySourceEntry[];
    const manifest: HistoryInitializationManifest = {
      format: "kepler.mission-history-initialization",
      version: 1,
      operation: "migrate",
      mission_binding: initialManifest.mission_binding,
      generation_id: targetGeneration,
      source_inventory: sourceInventory,
      archive_id: archiveId,
      guide: migrationGuideReference,
      guide_hash: historyDigest(fixture.guideBytes),
      candidate_journals: directSources.map((source) => {
        const parts = source.path.slice(`${missionRoot}/history/`.length).split("/");
        return {
          phase: parts[0]!,
          journal_id: parts[1]!.slice(0, -".jsonl".length),
          byte_length: source.byte_length,
          content_version: source.content_version,
          reference: `legacy:${source.source_id}`,
        };
      }).sort((left, right) => left.phase.localeCompare(right.phase) || left.journal_id.localeCompare(right.journal_id)),
      expected_state: initialManifest.expected_state,
      source_retirement: directSources.map((source) => ({
        source_id: source.source_id,
        path: source.path,
        byte_length: source.byte_length,
        content_version: source.content_version,
        archive_reference: `local-archive:${archiveId}`,
      })),
      requester: "Requester",
      operation_authority: { kind: "manifest-approval", request_reference: initialManifest.mission_binding.request_reference },
    };
    const migrationArgs = ["recovery", "migrate", "--project", repository, "--mission", missionId];
    const previewBefore = await snapshotTree(repository);
    const preview = await run(migrationArgs, JSON.stringify({ phase: "preview", manifest }));
    expect(preview.exitCode, preview.stderr || preview.stdout).toBe(0);
    expect(envelope(preview.stdout)).toMatchObject({ status: "success", data: { proposed: true, mode: "active", generation_id: targetGeneration, manifest_hash: historyManifestDigest(manifest), execution_started: false } });
    expect(await snapshotTree(repository)).toBe(previewBefore);

    const missingApproval = await run(migrationArgs, JSON.stringify({ phase: "apply", manifest }));
    expect(missingApproval.exitCode).toBe(1);
    expect(envelope(missingApproval.stdout).status).toBe("failed");
    expect(await snapshotTree(repository)).toBe(previewBefore);
    const mismatchedDecision = await run(migrationArgs, JSON.stringify({
      phase: "apply",
      manifest,
      approved_manifest_hash: historyDigest("not the approved migration manifest"),
      requester: manifest.requester,
      decision_reference: "decision:migration-cli-positive-e2e",
    }));
    expect(mismatchedDecision.exitCode).toBe(1);
    expect(envelope(mismatchedDecision.stdout)).toMatchObject({ status: "failed", data: { code: "history_manifest_approval_required" } });
    expect(await snapshotTree(repository)).toBe(previewBefore);

    const approved = JSON.stringify({
      phase: "apply",
      manifest,
      approved_manifest_hash: historyManifestDigest(manifest),
      requester: manifest.requester,
      decision_reference: "decision:migration-cli-positive-e2e",
    });
    const originalPackageGuide = Buffer.from(await Fs.readFile(fixture.guidePath));
    await Fs.writeFile(fixture.guidePath, Buffer.from(fixture.guideBytes).toString("utf8").replace("available_in: 3.1.0", "available_in: 3.1.1"));
    const beforePackageFailure = await snapshotTree(repository);
    const mismatchedPackage = await run(migrationArgs, approved);
    expect(mismatchedPackage.exitCode).toBe(1);
    expect(envelope(mismatchedPackage.stdout)).toMatchObject({ status: "failed", data: { code: "history_migration_package_unverified" } });
    expect(await snapshotTree(repository)).toBe(beforePackageFailure);
    await Fs.writeFile(fixture.guidePath, originalPackageGuide);

    await Fs.writeFile(Path.join(repository, legacyPath), Buffer.concat([Buffer.from(phaseBytes), Buffer.from("changed\n")]));
    const beforeChangedInputFailure = await snapshotTree(repository);
    const changedInput = await run(migrationArgs, approved);
    expect(changedInput.exitCode).toBe(1);
    expect(envelope(changedInput.stdout)).toMatchObject({ status: "failed", data: { code: "history_source_changed" } });
    expect(await snapshotTree(repository)).toBe(beforeChangedInputFailure);
    await Fs.writeFile(Path.join(repository, legacyPath), phaseBytes);
    expect(await snapshotTree(repository)).toBe(previewBefore);

    const applied = await run(migrationArgs, approved);
    expect(applied.exitCode, applied.stderr || applied.stdout).toBe(0);
    const appliedEnvelope = envelope(applied.stdout);
    expect(appliedEnvelope).toMatchObject({ status: "success", data: { mode: "active", generation_id: targetGeneration, execution_started: false, already_applied: false } });
    const migratedControl = parseHistoryControl(await Fs.readFile(Path.join(historyRoot, "control", "active.json"), "utf8"));
    expect(migratedControl).toMatchObject({ type: "mission.history-initialized", caused_by: [phaseRecords[0]!.id], data: { generation_id: targetGeneration, manifest, decision_reference: "decision:migration-cli-positive-e2e" } });
    expect(migratedControl.id).toBe(appliedEnvelope.data.history_version);

    for (const source of directSources) {
      const sourceBytes = phaseBytes;
      expect(await exists(Path.join(repository, source.path))).toBe(false);
      expect(source.content_version).toBe(historyDigest(sourceBytes));
      const journal = manifest.candidate_journals.find((candidate) => candidate.journal_id === source.path.split("/").at(-1)!.slice(0, -".jsonl".length));
      expect(journal).toBeDefined();
      expect(await Fs.readFile(Path.join(historyRoot, "generations", targetGeneration, journal!.phase, `${journal!.journal_id}.jsonl`))).toEqual(sourceBytes);
      const archivedPath = Path.join(commonDirectory, "kepler", "missions", missionId, "recovery", "archives", archiveId, "sources", `${historyDigest(source.source_id).slice(7)}.bin`);
      expect(await Fs.readFile(archivedPath)).toEqual(sourceBytes);
    }
    const migratedJournalSources: HistoryJournalSource[] = manifest.candidate_journals.map((journal) => ({
      sourceId: `generation:${journal.reference}`,
      generationId: targetGeneration,
      missionId,
      phase: journal.phase,
      journalId: journal.journal_id,
      bytes: phaseBytes,
    }));
    const afterProjection = historyState(collectHistory(missionId, migratedJournalSources, { completeness: "complete", generationId: targetGeneration }));
    expect(afterProjection).toEqual(beforeProjection);
    expect(afterProjection).toEqual(manifest.expected_state);
    for (const source of manifest.source_retirement) expect(await exists(Path.join(repository, source.path))).toBe(false);
    expect(await exists(Path.join(historyRoot, initialJournal.phase))).toBe(false);
    expect(await exists(Path.join(historyRoot, "generations", targetGeneration, initialJournal.phase))).toBe(true);
    const controlDirectory = Path.join(historyRoot, "control");
    const guardFiles = (await Fs.readdir(controlDirectory)).filter((name) => name.endsWith(".jsonl"));
    expect(guardFiles).toHaveLength(1);
    const guard = parseHistoryGuard(await Fs.readFile(Path.join(controlDirectory, guardFiles[0]!), "utf8"), migratedControl);
    expect(guard).toMatchObject({ phase: "construction", type: "construction.history-generation-required", caused_by: [migratedControl.id], data: { mission_id: missionId, generation_id: targetGeneration, control_event_id: migratedControl.id } });
    expect(await exists(Path.join(historyRoot, "construction"))).toBe(false);
    const archiveIndex = parseHistoryArchiveIndex(await Fs.readFile(Path.join(commonDirectory, "kepler", "missions", missionId, "recovery", "archives", archiveId, "index.json"), "utf8"));
    expect(archiveIndex).toMatchObject({ archive_id: archiveId, mission_id: missionId, manifest_hash: historyManifestDigest(manifest), source_inventory: sourceInventory });

    const afterInspectBefore = await snapshotTree(repository);
    const afterInspect = await run(["recovery", "inspect", "--project", repository, "--mission", missionId]);
    expect(afterInspect.exitCode, afterInspect.stderr || afterInspect.stdout).toBe(0);
    expect(envelope(afterInspect.stdout).data).toMatchObject({ mode: "active", migration_required: false, selection_status: "validated", generation_id: targetGeneration, history_version: migratedControl.id, archives: [expect.objectContaining({ archive_id: archiveId, verification: "verified" })] });
    expect(await snapshotTree(repository)).toBe(afterInspectBefore);

    const selectionPath = Path.join(historyRoot, "control", "active.json");
    const selectionBeforeProgress = await Fs.readFile(selectionPath);
    const createdUnit = await run(["workflow", "construction", "unit", "create", "after-migration", "--mission", missionId, "--project", repository, "--history-version", migratedControl.id]);
    expect(createdUnit.exitCode, createdUnit.stderr || createdUnit.stdout).toBe(0);
    expect(envelope(createdUnit.stdout).status).toBe("success");
    const selectedJournalPath = Path.join(historyRoot, "generations", targetGeneration, initialJournal.phase, `${String(envelope(createdUnit.stdout).data.journal_id)}.jsonl`);
    const currentHead = await Fs.readFile(selectedJournalPath);
    const currentRecords = currentHead.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(currentRecords.map((record) => record.type)).toContain("construction.unit-created");
    const beforeCompletedRetry = await snapshotTree(repository);
    const retried = await run(migrationArgs, approved);
    expect(retried.exitCode, retried.stderr || retried.stdout).toBe(0);
    expect(envelope(retried.stdout)).toMatchObject({ status: "success", data: { already_applied: true, history_version: migratedControl.id, receipt: { history_version: migratedControl.id } } });
    expect(await snapshotTree(repository)).toBe(beforeCompletedRetry);
    expect(await Fs.readFile(selectionPath)).toEqual(selectionBeforeProgress);
    expect(await Fs.readFile(selectedJournalPath)).toEqual(currentHead);
  }, 600_000);
});
