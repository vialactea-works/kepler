import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryArchives } from "../../packages/cli/src/history/archives.js";
import { createHistoryControl, historyDigest } from "../../packages/cli/src/history/control.js";
import { prepareReconstruction, type ReconstructionMaterialRequest, type ReconstructionPlan } from "../../packages/cli/src/history/reconstruction.js";
import { createNodeReconstructionChecks, historyCheckpointMaterialReference } from "../../packages/cli/src/history/reconstruction-runtime.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { missionWorkspaceKey, type LocalWorkspaceAttachment } from "../../packages/cli/src/construction/mission-workspace.js";
import { createHistoryRepository } from "../support/history-repository.js";
import { historyReconstructionPlan } from "../support/history-reconstruction.js";
import { historyTestBytes, historyTestEvent, historyTestReconciliation } from "../support/history-generation.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { await Fs.rm(root, { recursive: true, force: true }); await expect(Fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" }); } });

const fixture = async () => {
  const t = await createHistoryRepository();
  roots.push(t.parent);
  const payload = new TextEncoder().encode("Checkpointed owner evidence\n");
  await Fs.mkdir(Path.join(t.root, "fixtures"));
  await Fs.writeFile(Path.join(t.root, "fixtures", "checkpoint.txt"), payload);
  t.git(t.root, "add", "fixtures/checkpoint.txt");
  t.git(t.root, "commit", "-qm", "Record checkpoint coverage fixture");
  const commit = t.git(t.root, "rev-parse", "HEAD").trim();
  const context = await t.access.storage.context(t.root);
  const workspaceId = missionWorkspaceKey(context.commonDirectory, context.recordHome);
  const attachment: LocalWorkspaceAttachment = { format: "kepler.mission-workspace.v1", mission_id: t.f.missionId, record_home_repository_id: "record-home", repository_id: "record-home", workspace_id: workspaceId, workspace_path: context.recordHome, repository_path: context.recordHome, git_directory: context.commonDirectory, common_directory: context.commonDirectory, branch: "main", integration_target: "refs/heads/main", starting_checkpoint: { kind: "no-commit" } };
  const workspaceDirectory = Path.join(context.commonDirectory, "kepler", "missions", t.f.missionId, "workspaces");
  await Fs.mkdir(workspaceDirectory, { recursive: true });
  await Fs.writeFile(Path.join(workspaceDirectory, `${workspaceId}.json`), `${JSON.stringify(attachment)}\n`);
  const snapshot = await t.access.storage.snapshot(t.root, t.f.missionId);
  const manifest = { ...t.f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: t.f.control.id, content_version: historyDigest(t.f.input.activation!) }, source_inventory: historyInventory(snapshot) };
  const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: "2026-11-14T01:00:00.000Z", producer: { name: "kepler", version: "checkpoint-test" }, manifest, decisionReference: "decision:checkpoint-reset", causes: [t.f.control.id] });
  const archives = new HistoryArchives(t.access.storage);
  const index = await archives.prepare(manifest, snapshot);
  const archive = await archives.preserve(manifest, index, snapshot);
  const checks = createNodeReconstructionChecks(t.access, { recordHome: t.root, missionId: t.f.missionId });
  const basePlan = historyReconstructionPlan(t.f, reset, archive);
  return { ...t, commit, reset, archive, checks, basePlan };
};

const planWithReviewBaseline = (t: Awaited<ReturnType<typeof fixture>>, commit: string, includeCheckpoint: boolean): ReconstructionPlan => {
  const addition = t.basePlan.actions.find((action) => action.action === "add");
  if (!addition?.event) throw new Error("The reconstruction fixture has no generated owner fact.");
  const checkpoint = { repository_id: "record-home", commit };
  const event = { ...addition.event, type: "construction.unit-baseline-selected", event_version: 1, data: { mission_id: t.f.missionId, unit_id: t.f.unitId, review_baseline: [checkpoint], integration_targets: [{ repository_id: "record-home", target: "refs/heads/main" }] }, causes: [{ event_id: t.f.unit.id, action_id: null }] };
  return {
    ...t.basePlan,
    actions: t.basePlan.actions.map((action) => action.id === addition.id ? { ...action, event } : action),
    required_material: { ...t.basePlan.required_material, checkpoints: includeCheckpoint ? [checkpoint] : [] },
    continuation: { operation: "recovery.inspect", unresolved_work: [], required_approvals: [] },
  };
};

const reconstruct = (
  t: Awaited<ReturnType<typeof fixture>>,
  plan: ReconstructionPlan,
  verifyMaterial = t.checks.verifyMaterial,
  verifyContinuation = t.checks.verifyContinuation,
) => prepareReconstruction({
  plan,
  reset: t.reset,
  archive: t.archive,
  identity: randomUUID,
  identity_reservations: { event_ids: [], journal_ids: [] },
  clock: () => new Date("2026-11-14T02:00:00.000Z"),
  producer: { name: "kepler-checkpoint-test", version: "3.1.0" },
  verifyAuthority: async () => ({ status: "valid", reference: "test-authority" }),
  verifyMaterial,
  verifyContinuation,
});

const planSource = (t: Awaited<ReturnType<typeof fixture>>, artifactId: string, body = "Use the authored task contracts."): string =>
  `---\nid: ${artifactId}\ntype: implementation-plan\nschema_version: 3\nunit_id: ${t.f.unitId}\nauthor: Checkpoint Test <checkpoint@example.invalid>\n---\n# Implementation plan\n\n## Technical solution\n\n${body}\n\n## Task graph context\n\nThe graph is [tasks-dag.json](tasks-dag.json).\n\n## Verification strategy\n\nRun the focused checks.\n\n## Decisions and open questions\n\nNo open decisions.\n`;

const commitFiles = async (t: Awaited<ReturnType<typeof fixture>>, files: readonly { readonly path: string; readonly content: string }[], message: string): Promise<string> => {
  for (const file of files) {
    const absolute = Path.join(t.root, file.path);
    await Fs.mkdir(Path.dirname(absolute), { recursive: true });
    await Fs.writeFile(absolute, file.content);
  }
  t.git(t.root, "add", "--", ...files.map((file) => file.path));
  t.git(t.root, "commit", "-qm", message);
  return t.git(t.root, "rev-parse", "HEAD").trim();
};

const taskGraphFixture = async (t: Awaited<ReturnType<typeof fixture>>) => {
  const unitRoot = `.kepler/missions/${t.f.missionId}/construction/units-of-work/${t.f.unitId}`;
  const graphPath = `${unitRoot}/tasks-dag.json`;
  const planPath = `${unitRoot}/plan.md`;
  const planArtifactId = randomUUID();
  const graph = { ...taskGraphExample(), unit_id: t.f.unitId };
  const graphSource = `${JSON.stringify(graph, null, 2)}\n`;
  const initialPlan = planSource(t, planArtifactId);
  const first = await commitFiles(t, [{ path: graphPath, content: graphSource }, { path: planPath, content: initialPlan }], "Add checkpoint graph and plan");
  const unrelated = { ...graph, tasks: graph.tasks.map((task, index) => index === 1 ? { ...task, title: "Changed unrelated task" } : task) };
  const second = await commitFiles(t, [{ path: graphPath, content: `${JSON.stringify(unrelated, null, 2)}\n` }], "Change an unrelated task definition");
  const mismatch = { ...unrelated, tasks: unrelated.tasks.map((task, index) => index === 0 ? { ...task, title: "Changed selected task" } : task) };
  const third = await commitFiles(t, [{ path: graphPath, content: `${JSON.stringify(mismatch, null, 2)}\n` }], "Change the selected task definition");
  return { unitRoot, graphPath, planPath, planArtifactId, graph, graphSource, initialPlan, first, second, third };
};

const planWithTaskAdmission = (
  t: Awaited<ReturnType<typeof fixture>>,
  material: Awaited<ReturnType<typeof taskGraphFixture>>,
  taskDefinitionCheckpoint: string,
): ReconstructionPlan => {
  const addition = t.basePlan.actions.find((action) => action.action === "add");
  if (!addition?.event) throw new Error("The reconstruction fixture has no generated owner fact.");
  const graphCheckpoint = { repository_id: "record-home", commit: material.first };
  const taskCheckpoint = { repository_id: "record-home", commit: taskDefinitionCheckpoint };
  const graphBytes = new TextEncoder().encode(material.graphSource);
  const planBytes = new TextEncoder().encode(material.initialPlan);
  const graphReference = historyCheckpointMaterialReference(graphCheckpoint, material.graphPath);
  const planReference = historyCheckpointMaterialReference(graphCheckpoint, material.planPath);
  const task = material.graph.tasks[0]!;
  const event = {
    phase: "construction" as const,
    type: "construction.task-admitted" as const,
    event_version: 1,
    data: {
      mission_id: t.f.missionId,
      unit_id: t.f.unitId,
      stage: "implementation" as const,
      stage_attempt_id: randomUUID(),
      task_id: task.id,
      graph_ref: { graph_id: material.graph.id, content_version: historyDigest(graphBytes), checkpoint: graphCheckpoint },
      task_definition_ref: { graph_id: material.graph.id, task_id: task.id, content_version: historyDigest(JSON.stringify(task)), checkpoint: taskCheckpoint },
      admission_baseline: [graphCheckpoint],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    },
    causes: [{ event_id: t.f.unit.id, action_id: null }],
  };
  return {
    ...t.basePlan,
    actions: t.basePlan.actions.map((action) => action.id === addition.id ? { ...action, event } : action),
    required_material: {
      artifact_bindings: [{ artifact_id: material.planArtifactId, reference: planReference, content_version: historyDigest(planBytes) }],
      checkpoints: [graphCheckpoint, taskCheckpoint],
      evidence: [{ reference: graphReference, content_version: historyDigest(graphBytes) }],
    },
    continuation: { operation: "recovery.inspect", unresolved_work: [], required_approvals: [] },
  };
};

const planWithNestedArtifactBinding = async (t: Awaited<ReturnType<typeof fixture>>, bindingCheckpoint: "first" | "second" = "second") => {
  const unitRoot = `.kepler/missions/${t.f.missionId}/construction/units-of-work/${t.f.unitId}`;
  const planPath = `${unitRoot}/plan.md`;
  const artifactId = randomUUID();
  const original = planSource(t, artifactId);
  const changed = planSource(t, artifactId, "Use a different retained solution.");
  const first = await commitFiles(t, [{ path: planPath, content: original }], "Add retained review artifact");
  const second = await commitFiles(t, [{ path: planPath, content: changed }], "Change review artifact bytes");
  const firstCheckpoint = { repository_id: "record-home", commit: first };
  const secondCheckpoint = { repository_id: "record-home", commit: second };
  const artifactBytes = new TextEncoder().encode(original);
  const addition = t.basePlan.actions.find((action) => action.action === "add");
  if (!addition?.event) throw new Error("The reconstruction fixture has no generated owner fact.");
  const event = {
    phase: "construction" as const,
    type: "construction.stage-attempt-completed" as const,
    event_version: 2,
    data: {
      mission_id: t.f.missionId,
      unit_id: t.f.unitId,
      stage: "unit-of-work-review" as const,
      stage_attempt_id: randomUUID(),
      evidence_ids: [],
      checkpoints: [firstCheckpoint],
      unit_of_work_review_assessment: {
        implementation_completion_event_id: randomUUID(),
        reviewed_material_bindings: [{ artifact_id: artifactId, content_version: historyDigest(artifactBytes), checkpoint: bindingCheckpoint === "first" ? firstCheckpoint : secondCheckpoint }],
        final_checkpoints: [],
        reviewer: "Independent Reviewer",
        implementation_authors: ["Implementation Author"],
        implementation_evidence_assessment_id: randomUUID(),
        review_evidence_id: randomUUID(),
        self_review_evidence_id: randomUUID(),
        findings: { blocking: [], limitations: [] },
        additional_review: { requested: false as const },
        acceptance_required: false,
        handoff: { status: "ready" as const, recipient: "deliver" as const, summary: "Review is ready for delivery." },
      },
    },
    causes: [{ event_id: t.f.unit.id, action_id: null }],
  };
  return {
    plan: {
      ...t.basePlan,
      actions: t.basePlan.actions.map((action) => action.id === addition.id ? { ...action, event } : action),
      required_material: {
        artifact_bindings: [{ artifact_id: artifactId, reference: historyCheckpointMaterialReference(firstCheckpoint, planPath), content_version: historyDigest(artifactBytes) }],
        checkpoints: [firstCheckpoint, secondCheckpoint],
        evidence: [],
      },
      continuation: { operation: "recovery.inspect", unresolved_work: [], required_approvals: [] },
    },
    first,
    second,
  };
};

const materialRequestFor = (t: Awaited<ReturnType<typeof fixture>>, plan: ReconstructionPlan): ReconstructionMaterialRequest => {
  const addition = plan.actions.find((action) => action.action === "add" && action.event);
  if (!addition?.event) throw new Error("The reconstruction fixture has no generated owner fact.");
  const generated = historyTestEvent(addition.event.type, addition.event.data as Record<string, unknown>, t.f.journalId, [t.f.unit.id]);
  const ownerEvent = { ...generated, event_version: addition.event.event_version };
  const bytes = historyTestBytes([t.f.creation, t.f.prepared, t.f.unit, ownerEvent]);
  const candidateJournals = [{
    phase: "construction" as const,
    journal_id: t.f.journalId,
    reference: `candidate:${plan.generation_id}/construction/${t.f.journalId}`,
    byte_length: bytes.length,
    content_version: historyDigest(bytes),
    bytes,
  }];
  const history = collectHistory(plan.mission_id, candidateJournals.map((journal) => ({
    sourceId: journal.reference,
    missionId: plan.mission_id,
    generationId: plan.generation_id,
    phase: journal.phase,
    journalId: journal.journal_id,
    bytes: journal.bytes,
  })), { completeness: "complete", generationId: plan.generation_id });
  return { reset: t.reset, plan, archive: t.archive, required_material: plan.required_material, candidate_journals: candidateJournals, history, expected_state: historyState(history) };
};

describe("real reconstruction checkpoint coverage", () => {
  it("checks a declared owner baseline through Git and the candidate continuation", async () => {
    const t = await fixture();
    const prepared = await reconstruct(t, planWithReviewBaseline(t, t.commit, true));

    expect(prepared.checked).toBe(true);
    expect(prepared.verification.material.reference).toMatch(/^verified-reconstruction-material:/);
    expect(prepared.verification.continuation.reference).toMatch(/^candidate-continuation:/);
    expect(prepared.history.issues).toHaveLength(0);
  });

  it("rejects an undeclared owner baseline while preserving valid candidate closure", async () => {
    const t = await fixture();

    await expect(reconstruct(t, planWithReviewBaseline(t, t.commit, false))).rejects.toMatchObject({ name: "HistoryError", code: "history_reconstruction_material_invalid" });
  });

  it("rejects a declared commit absent from the actual prepared repository", async () => {
    const t = await fixture();
    const unavailable = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    expect(() => t.git(t.root, "cat-file", "-e", `${unavailable}^{commit}`)).toThrow();

    await expect(reconstruct(t, planWithReviewBaseline(t, unavailable, true))).rejects.toMatchObject({ name: "HistoryError", code: "history_reconstruction_material_invalid" });
  });

  it("accepts a task-definition checkpoint with unrelated graph content drift", async () => {
    const t = await fixture();
    const material = await taskGraphFixture(t);
    const request = materialRequestFor(t, planWithTaskAdmission(t, material, material.second));

    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(request.history.events.some((record) => record.constructionEvent?.type === "construction.task-admitted")).toBe(true);
    expect(await t.checks.verifyMaterial(request)).toMatchObject({ status: "valid" });
  });

  it("rejects an existing task-definition checkpoint whose bound task bytes differ", async () => {
    const t = await fixture();
    const material = await taskGraphFixture(t);
    const request = materialRequestFor(t, planWithTaskAdmission(t, material, material.third));
    const result = await t.checks.verifyMaterial(request);

    expect(t.git(t.root, "cat-file", "-e", `${material.third}^{commit}`)).toBe("");
    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(result).toMatchObject({ status: "invalid", reason: "The actual task definition differs from its recorded admission binding." });
  });

  it("accepts nested artifact bindings whose committed bytes match required material", async () => {
    const t = await fixture();
    const { plan } = await planWithNestedArtifactBinding(t, "first");
    const request = materialRequestFor(t, plan);

    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await t.checks.verifyMaterial(request)).toMatchObject({ status: "valid" });
  });

  it("rejects an existing nested artifact checkpoint with different committed bytes", async () => {
    const t = await fixture();
    const { plan, second } = await planWithNestedArtifactBinding(t);
    const request = materialRequestFor(t, plan);
    const result = await t.checks.verifyMaterial(request);

    expect(t.git(t.root, "cat-file", "-e", `${second}^{commit}`)).toBe("");
    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(result).toMatchObject({ status: "invalid", reason: "The actual committed artifact bytes differ from their retained binding." });
  });

  it("rejects nested artifact bindings omitted from required material", async () => {
    const t = await fixture();
    const { plan } = await planWithNestedArtifactBinding(t, "first");
    const incompletePlan = { ...plan, required_material: { ...plan.required_material, artifact_bindings: [] } };
    const request = materialRequestFor(t, incompletePlan);

    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await t.checks.verifyMaterial(request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });
  });
});
