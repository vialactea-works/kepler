import { describe, expect, it } from "vitest";
import type { ConstructionEventRecord, ConstructionEventType, RepositoryCheckpoint } from "../../packages/cli/src/construction/events.js";
import { historyDigest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { scanJournalBytes } from "../../packages/cli/src/history/journal.js";
import { ReconstructionEvidence, reconstructionOwnerArtifactBindings, reconstructionOwnerCheckpoints, reconstructionOwnerGraphReferences } from "../../packages/cli/src/history/reconstruction-evidence.js";
import { qualityCategories, isQualityRequirementsCompletionRecord } from "../../packages/cli/src/construction/quality-requirements-completion.js";
import { isImplementationPlanningCompletionRecord } from "../../packages/cli/src/construction/implementation-planning-completion.js";
import { taskGraphExample } from "../fixtures/task-graph.js";
import { historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";

const ownerEvent = (type: ConstructionEventType, data: unknown): ConstructionEventRecord => ({ type, data } as ConstructionEventRecord);
const checkpoint = (index: number): RepositoryCheckpoint => ({ repository_id: `repository-${index}`, commit: index.toString(16).padStart(40, "0") });

const evidenceFixture = async () => {
  const t = await historyReconstructionFixture();
  const prepared = await t.drafts.prepare(t.scope, t.request);
  const checked = await t.drafts.verify(t.scope, prepared.manifest as HistoryRebuildManifest);
  const evidence = new ReconstructionEvidence({ readMaterial: async () => { throw new Error("No material is required by this fixture."); }, checkpoint: async () => ({ exists: false }) });
  const materialRequest = { reset: t.reset, plan: t.plan, archive: t.archive, required_material: t.plan.required_material, candidate_journals: checked.candidate_journals, history: checked.history, expected_state: checked.state };
  return { ...t, evidence, materialRequest };
};

const candidateWith = (t: Awaited<ReturnType<typeof evidenceFixture>>, appended: ReturnType<typeof historyTestEvent>) => {
  const sourceIndex = t.materialRequest.candidate_journals.findIndex((journal) => scanJournalBytes(journal.bytes).lines.some((line) => line.event?.type === "construction.unit-created"));
  const source = t.materialRequest.candidate_journals[sourceIndex];
  if (!source) throw new Error("The candidate fixture lost its selected unit event.");
  const events = scanJournalBytes(source.bytes).lines.flatMap((line) => line.event ? [line.event] : []);
  const unitIndex = events.findIndex((event) => event.type === "construction.unit-created");
  const connected = { ...appended, journal_id: source.journal_id, caused_by: [events[unitIndex]!.id] } as unknown as typeof appended;
  events.splice(unitIndex + 1, 0, connected);
  const bytes = historyTestBytes(events);
  const candidateJournals = t.materialRequest.candidate_journals.map((journal, index) => index === sourceIndex ? { ...journal, bytes, content_version: historyDigest(bytes) } : journal);
  const history = collectHistory(t.plan.mission_id, candidateJournals.map((journal) => ({ sourceId: journal.reference, missionId: t.plan.mission_id, generationId: t.plan.generation_id, phase: journal.phase, journalId: journal.journal_id, bytes: journal.bytes })), { completeness: "complete", generationId: t.plan.generation_id });
  return { ...t.materialRequest, candidate_journals: candidateJournals, history, expected_state: historyState(history) };
};

type RetainedSource = { readonly reference: string; readonly content_version: `sha256:${string}`; readonly bytes: Uint8Array; readonly source_path: string; readonly artifact_id?: string };

const retainedSource = (reference: string, source_path: string, source: string, artifact_id?: string): RetainedSource => {
  const bytes = new TextEncoder().encode(source);
  return { reference, content_version: historyDigest(bytes), bytes, source_path, ...(artifact_id ? { artifact_id } : {}) };
};

const artifactSource = (id: string, type: string, unitId: string, body: string): string =>
  `---\nid: ${id}\ntype: ${type}\nschema_version: 3\nunit_id: ${unitId}\nauthor: Material Test <material@example.invalid>\n---\n${body}\n`;

const unitPath = (t: Awaited<ReturnType<typeof evidenceFixture>>): string =>
  `.kepler/missions/${t.f.missionId}/construction/units-of-work/${t.f.unitId}`;

const artifactMaterial = (t: Awaited<ReturnType<typeof evidenceFixture>>, id: string, type: string, path: string, body: string): RetainedSource =>
  retainedSource(`fixture:${id}`, `${unitPath(t)}/${path}`, artifactSource(id, type, t.f.unitId, body), id);

const materialRequestWithOwner = (
  t: Awaited<ReturnType<typeof evidenceFixture>>,
  owner: ReturnType<typeof historyTestEvent>,
  materials: readonly RetainedSource[],
  artifacts: readonly RetainedSource[],
  graphEvidence: readonly RetainedSource[] = [],
) => {
  const candidate = candidateWith(t, owner);
  const required = {
    artifact_bindings: artifacts.map((material) => ({ artifact_id: material.artifact_id!, reference: material.reference, content_version: material.content_version })),
    checkpoints: [checkpoint(10)],
    evidence: graphEvidence.map((material) => ({ reference: material.reference, content_version: material.content_version })),
  };
  const plan = { ...candidate.plan, required_material: required };
  const request = { ...candidate, plan, required_material: required };
  const evidence = new ReconstructionEvidence({
    readMaterial: async (reference) => {
      const material = materials.find((item) => item.reference === reference);
      if (!material) throw new Error("The fixture did not retain requested material.");
      return { reference, content_version: material.content_version, bytes: new Uint8Array(material.bytes), source_path: material.source_path };
    },
    checkpoint: async () => ({ exists: true }),
  });
  return { evidence, request };
};

const qualityRecord = (t: Awaited<ReturnType<typeof evidenceFixture>>, quality: RetainedSource, design: RetainedSource, designVersion = design.content_version) => {
  const categories = qualityCategories.map((category) => ({ category, applies: category === "security", rationale: `${category} applicability was considered.` }));
  const assessments = {
    artifact_validation: { evidence_id: "72000000-0000-4000-8000-000000000001", summary: "Quality material is valid." },
    self_review: {
      status: "passed" as const,
      evidence_id: "72000000-0000-4000-8000-000000000002",
      reviewer: "Quality Requirements owner",
      summary: "Applicability, requirements, decisions, and handoff were reviewed.",
      checks: ["category-applicability", "objective-conditions", "consistency", "material-decisions", "planning-handoff"] as const,
      categories,
      requirements: [{ category: "security", reference: "quality.md#security", scope: "Stored requester data", conditions: "When a request is saved", target: "Only the owner can read it.", acceptance_condition: "Another user is denied.", owner: "Security owner" }],
      resolved_material_choices: [],
      unresolved_material_choices: [],
      unresolved_material_targets: [],
      unresolved_tradeoffs: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false as const },
    handoff: {
      status: "ready" as const,
      summary: "Quality requirements are ready for planning.",
      recipient: "implementation-planning" as const,
      unit_directory: unitPath(t),
      artifacts: ["quality.md"],
      requirement_references: ["quality.md#security"],
      constraints: ["Preserve the accepted design."],
      assumptions: [],
      planning_questions: ["Select an implementation mechanism."],
    },
  };
  const binding = (material: RetainedSource, contentVersion = material.content_version) => ({ artifact_id: material.artifact_id!, content_version: contentVersion });
  return {
    approval_event_id: "71000000-0000-4000-8000-000000000001",
    artifact_bindings: [binding(quality)],
    functional_design_bindings: [binding(design, designVersion)],
    artifact_paths: ["quality.md"],
    assessments,
  };
};

const qualityOwnerEvent = (t: Awaited<ReturnType<typeof evidenceFixture>>, record: ReturnType<typeof qualityRecord>) => {
  const ownerCheckpoint = checkpoint(10);
  const event = historyTestEvent("construction.stage-attempt-completed", {
    mission_id: t.f.missionId,
    unit_id: t.f.unitId,
    stage: "quality-requirements",
    stage_attempt_id: "73000000-0000-4000-8000-000000000001",
    evidence_ids: [record.assessments.artifact_validation.evidence_id, record.assessments.self_review.evidence_id],
    checkpoints: [ownerCheckpoint],
    quality_requirements_assessment: record,
  }, t.materialRequest.candidate_journals[0]!.journal_id, [t.f.unit.id]);
  return { ...event, event_version: 2 };
};

const planningSources = (t: Awaited<ReturnType<typeof evidenceFixture>>) => {
  const plan = artifactMaterial(t, "83000000-0000-4000-8000-000000000001", "implementation-plan", "plan.md", "# Implementation plan\n\n## Technical solution\n\nKeep the application boundary independent.\n\n## Task graph context\n\nUse [the task graph](tasks-dag.json).\n\n## Verification strategy\n\nRun focused tests.\n\n## Decisions and open questions\n\nNo open decisions remain.");
  const reviewed = artifactMaterial(t, "83000000-0000-4000-8000-000000000002", "non-functional-requirements", "quality.md", "# Quality Requirements\n\n## Quality requirements\n\nMeet the accepted target.\n\n## Constraints and dependencies\n\nPreserve the design.\n\n## Decisions and open questions\n\nNo open questions remain.");
  const input = artifactMaterial(t, "83000000-0000-4000-8000-000000000003", "functional-design", "design.md", "# Design\n\n## Domain behavior\n\nPreserve current behavior.\n\n## Domain model\n\nKeep concepts explicit.\n\n## Boundaries and interactions\n\nKeep application rules independent.\n\n## Design decisions and open questions\n\nNo open decisions remain.");
  const graphPath = `${unitPath(t)}/tasks-dag.json`;
  const graph = { ...taskGraphExample(), unit_id: t.f.unitId };
  const graphMaterial = retainedSource("fixture:task-graph", graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  return { plan, reviewed, input, graph, graphMaterial };
};

const planningRecord = (t: Awaited<ReturnType<typeof evidenceFixture>>, sources: ReturnType<typeof planningSources>, overrides: { reviewedVersion?: `sha256:${string}`; inputVersion?: `sha256:${string}`; graphId?: string; graphVersion?: string } = {}) => {
  const graphId = overrides.graphId ?? sources.graph.id;
  const graphVersion = overrides.graphVersion ?? sources.graphMaterial.content_version;
  const graphReference = { graph_id: graphId, content_version: graphVersion };
  const binding = (material: RetainedSource, contentVersion = material.content_version) => ({ artifact_id: material.artifact_id!, content_version: contentVersion });
  const assessments = {
    artifact_validation: { evidence_id: "84000000-0000-4000-8000-000000000001", summary: "Plan artifacts are valid." },
    task_graph_validation: { evidence_id: "84000000-0000-4000-8000-000000000002", summary: "The graph is valid." },
    self_review: {
      status: "passed" as const,
      evidence_id: "84000000-0000-4000-8000-000000000003",
      reviewer: "Implementation Planning owner",
      summary: "Task rationale, coverage, and verification were reviewed.",
      checks: ["decision-rationale", "obligation-coverage", "consistency", "dependency-reasons", "prerequisite-conditions", "verification-feasibility", "input-relevance", "blocking-decisions"],
      decision_rationales: [{ decision: "Use a boundary", rationale: "It keeps policy independent." }],
      task_reviews: [{ task_id: sources.graph.tasks[0]!.id, inputs_relevant: true, outputs_explicit: true, acceptance_testable: true, dependency_reasons_justified: true, prerequisites_conditioned: true, verification_feasible: true, rationale: "The task has explicit outcomes and feasible checks." }],
      obligation_coverage: [{ reference: "quality.md#security", disposition: "planned", task_ids: [sources.graph.tasks[0]!.id], rationale: "The task implements the requirement." }],
      unresolved_consequential_decisions: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false as const },
    approval_requirement: { required: false as const, rationale: "No requester or authority rule requires approval." },
    handoff: {
      status: "ready" as const,
      summary: "The current plan is ready for implementation.",
      recipient: "implementation" as const,
      unit_directory: unitPath(t),
      artifacts: ["plan.md", "tasks-dag.json"],
      input_bindings: [binding(sources.input, overrides.inputVersion)],
      graph_ref: graphReference,
      task_ids: [sources.graph.tasks[0]!.id],
      verification_obligations: ["Run focused tests."],
      prerequisite_conditions: ["Start after inputs are available."],
      coordination_constraints: ["Serialize repository integration."],
      approval_required: false,
    },
  };
  return {
    graph_ref: graphReference,
    artifact_bindings: [binding(sources.plan)],
    reviewed_material_bindings: [binding(sources.plan), binding(sources.reviewed, overrides.reviewedVersion)],
    artifact_paths: ["plan.md"],
    task_graph_path: "tasks-dag.json",
    plan_graph_link: { plan_path: "plan.md", task_graph_path: "tasks-dag.json" },
    assessments,
  };
};

const planningOwnerEvent = (t: Awaited<ReturnType<typeof evidenceFixture>>, record: ReturnType<typeof planningRecord>) => {
  const ownerCheckpoint = checkpoint(10);
  const event = historyTestEvent("construction.stage-attempt-completed", {
    mission_id: t.f.missionId,
    unit_id: t.f.unitId,
    stage: "implementation-planning",
    stage_attempt_id: "85000000-0000-4000-8000-000000000001",
    evidence_ids: [record.assessments.artifact_validation.evidence_id, record.assessments.task_graph_validation.evidence_id, record.assessments.self_review.evidence_id],
    checkpoints: [ownerCheckpoint],
    implementation_planning_assessment: record,
  }, t.materialRequest.candidate_journals[0]!.journal_id, [t.f.unit.id]);
  return { ...event, event_version: 2 };
};

describe("reconstruction owner checkpoint coverage", () => {
  it("enumerates the finite typed Construction checkpoint paths", () => {
    const expected = Array.from({ length: 27 }, (_, index) => checkpoint(index + 1));
    const events = [
      ownerEvent("construction.mission-created", { repositories: [{ repository_id: expected[0]!.repository_id, starting_checkpoint: { kind: "commit", commit: expected[0]!.commit } }, { repository_id: "empty-start", starting_checkpoint: { kind: "no-commit" } }] }),
      ownerEvent("construction.mission-workspaces-prepared", { repositories: [{ repository_id: expected[1]!.repository_id, starting_checkpoint: { kind: "commit", commit: expected[1]!.commit } }] }),
      ownerEvent("construction.unit-baseline-selected", { review_baseline: [expected[2]] }),
      ownerEvent("construction.stage-attempt-started", { checkpoints: [expected[3]] }),
      ownerEvent("construction.stage-attempt-completed", {
        stage: "unit-of-work-review",
        checkpoints: [expected[4]],
        unit_of_work_review_assessment: { final_checkpoints: [expected[5]], reviewed_material_bindings: [{ artifact_id: "artifact", checkpoint: expected[6] }] },
      }),
      ownerEvent("construction.stage-attempt-completed", {
        stage: "deliver",
        deliver_assessment: { artifact_bindings: [{ artifact_id: "artifact", checkpoint: expected[7] }], reviewed_checkpoints: [expected[8]], operation_results: [{ source_checkpoints: [expected[9]] }] },
      }),
      ownerEvent("construction.task-admitted", {
        graph_ref: { checkpoint: expected[10] }, task_definition_ref: { checkpoint: expected[11] }, admission_baseline: [expected[12]],
        predecessor_provenance: [{ checkpoints: [expected[13]] }],
      }),
      ownerEvent("construction.activity-attempt-started", { checkpoints: [expected[14]] }),
      ownerEvent("construction.activity-attempt-completed", { checkpoints: [expected[15]] }),
      ownerEvent("construction.evidence-recorded", { artifact_bindings: [{ artifact_id: "artifact", checkpoint: expected[16] }], checkpoints: [expected[17]] }),
      ownerEvent("construction.approval-recorded", { artifact_bindings: [{ artifact_id: "artifact", checkpoint: expected[18] }], checkpoints: [expected[19]] }),
      ownerEvent("construction.integration-prepared", { captured_inputs: [{ repository_id: expected[20]!.repository_id, commit: expected[20]!.commit }, { repository_id: "empty-input", no_commit: true }], candidate_checkpoints: [expected[21]] }),
      ownerEvent("construction.integration-accepted", { candidate_checkpoints: [expected[22]] }),
      ownerEvent("construction.retained-scope-assessed", { assessments: [{ checkpoints: [expected[23]] }] }),
      ownerEvent("construction.implementation-completion-assessed", { final_checkpoints: [expected[24]], graph_ref: { checkpoint: expected[25] }, reviewed_material_bindings: [{ artifact_id: "artifact", checkpoint: expected[26] }] }),
      ownerEvent("construction.interaction-recorded", { references: ["a".repeat(40)] }),
    ];

    expect(events.flatMap(reconstructionOwnerCheckpoints)).toEqual(expected);
    expect(events.flatMap(reconstructionOwnerArtifactBindings).map((binding) => binding.checkpoint)).toEqual([
      expected[6], expected[7], expected[16], expected[18], expected[26],
    ]);
  });

  it("requires review baselines in required material for a valid candidate fact", async () => {
    const t = await evidenceFixture();
    const reference = checkpoint(1);
    const journal = t.materialRequest.candidate_journals[0]!;
    const baseline = historyTestEvent("construction.unit-baseline-selected", {
      mission_id: t.f.missionId,
      unit_id: t.f.unitId,
      review_baseline: [reference],
      integration_targets: [{ repository_id: reference.repository_id, target: "refs/heads/main" }],
    }, journal.journal_id, [t.f.unit.id]);
    const request = candidateWith(t, baseline);

    expect(request.history.issues).toHaveLength(0);
    expect(request.history.events.every((event) => event.constructionEvent !== undefined)).toBe(true);
    expect(await t.evidence.material(request)).toMatchObject({ status: "invalid", reason: expect.stringContaining("omitted from required material") });
  });

  it("does not reinterpret opaque owner references as repository checkpoints", async () => {
    const t = await evidenceFixture();
    const journal = t.materialRequest.candidate_journals[0]!;
    const opaqueReference = historyTestEvent("construction.interaction-recorded", {
      mission_id: t.f.missionId,
      unit_id: t.f.unitId,
      participants: ["requester"],
      content: "Preserve this opaque reference",
      references: ["a".repeat(40)],
    }, journal.journal_id, [t.f.unit.id]);
    const request = candidateWith(t, opaqueReference);

    expect(request.history.issues).toHaveLength(0);
    expect(await t.evidence.material(request)).toMatchObject({ status: "valid" });
  });

  it("checks validator-accepted Quality Functional Design bindings against required artifact bytes", async () => {
    const t = await evidenceFixture();
    const quality = artifactMaterial(t, "91000000-0000-4000-8000-000000000001", "non-functional-requirements", "quality.md", "# Quality Requirements\n\n## Quality requirements\n\nMeet the required target.\n\n## Constraints and dependencies\n\nPreserve the accepted design.\n\n## Decisions and open questions\n\nNo unresolved questions remain.");
    const design = artifactMaterial(t, "91000000-0000-4000-8000-000000000002", "functional-design", "design.md", "# Design\n\n## Domain behavior\n\nPreserve current behavior.\n\n## Domain model\n\nKeep concepts explicit.\n\n## Boundaries and interactions\n\nKeep application rules independent.\n\n## Design decisions and open questions\n\nNo open decisions remain.");
    const goodRecord = qualityRecord(t, quality, design);
    expect(isQualityRequirementsCompletionRecord(goodRecord)).toBe(true);

    const good = materialRequestWithOwner(t, qualityOwnerEvent(t, goodRecord), [quality, design], [quality, design]);
    expect(good.request.history.issues).toHaveLength(0);
    expect(good.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    const qualityEvent = good.request.history.events.find((record) => record.constructionEvent?.type === "construction.stage-attempt-completed" && record.constructionEvent.data.stage === "quality-requirements")?.constructionEvent;
    expect(qualityEvent).toMatchObject({ data: { stage: "quality-requirements", quality_requirements_assessment: goodRecord } });
    expect(await good.evidence.material(good.request)).toMatchObject({ status: "valid" });

    const omitted = materialRequestWithOwner(t, qualityOwnerEvent(t, goodRecord), [quality, design], [quality]);
    expect(omitted.request.history.issues).toHaveLength(0);
    expect(omitted.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await omitted.evidence.material(omitted.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });

    const wrongRecord = qualityRecord(t, quality, design, historyDigest("a different Functional Design version"));
    expect(isQualityRequirementsCompletionRecord(wrongRecord)).toBe(true);
    const wrong = materialRequestWithOwner(t, qualityOwnerEvent(t, wrongRecord), [quality, design], [quality, design]);
    expect(wrong.request.history.issues).toHaveLength(0);
    expect(wrong.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await wrong.evidence.material(wrong.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });
  });

  it("checks validator-accepted Planning reviewed and handoff bindings against required artifact bytes", async () => {
    const t = await evidenceFixture();
    const sources = planningSources(t);
    const materials = [sources.plan, sources.reviewed, sources.input, sources.graphMaterial];
    const requiredArtifacts = [sources.plan, sources.reviewed, sources.input];
    const goodRecord = planningRecord(t, sources);
    expect(isImplementationPlanningCompletionRecord(goodRecord)).toBe(true);

    const good = materialRequestWithOwner(t, planningOwnerEvent(t, goodRecord), materials, requiredArtifacts, [sources.graphMaterial]);
    expect(good.request.history.issues).toHaveLength(0);
    expect(good.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    const planningEvent = good.request.history.events.find((record) => record.constructionEvent?.type === "construction.stage-attempt-completed")?.constructionEvent;
    expect(planningEvent).toBeDefined();
    expect(planningEvent).toMatchObject({ data: { stage: "implementation-planning", implementation_planning_assessment: goodRecord } });
    expect(reconstructionOwnerGraphReferences(planningEvent!)).toEqual([goodRecord.graph_ref, goodRecord.assessments.handoff.graph_ref]);
    expect(await good.evidence.material(good.request)).toMatchObject({ status: "valid" });

    const reviewedMissing = materialRequestWithOwner(t, planningOwnerEvent(t, goodRecord), materials, [sources.plan, sources.input], [sources.graphMaterial]);
    expect(reviewedMissing.request.history.issues).toHaveLength(0);
    expect(reviewedMissing.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await reviewedMissing.evidence.material(reviewedMissing.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });

    const handoffInputMissing = materialRequestWithOwner(t, planningOwnerEvent(t, goodRecord), materials, [sources.plan, sources.reviewed], [sources.graphMaterial]);
    expect(handoffInputMissing.request.history.issues).toHaveLength(0);
    expect(handoffInputMissing.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await handoffInputMissing.evidence.material(handoffInputMissing.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });

    const reviewedWrong = planningRecord(t, sources, { reviewedVersion: historyDigest("a different reviewed artifact version") });
    expect(isImplementationPlanningCompletionRecord(reviewedWrong)).toBe(true);
    const reviewedMismatch = materialRequestWithOwner(t, planningOwnerEvent(t, reviewedWrong), materials, requiredArtifacts, [sources.graphMaterial]);
    expect(reviewedMismatch.request.history.issues).toHaveLength(0);
    expect(reviewedMismatch.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await reviewedMismatch.evidence.material(reviewedMismatch.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });

    const inputWrong = planningRecord(t, sources, { inputVersion: historyDigest("a different handoff input version") });
    expect(isImplementationPlanningCompletionRecord(inputWrong)).toBe(true);
    const inputMismatch = materialRequestWithOwner(t, planningOwnerEvent(t, inputWrong), materials, requiredArtifacts, [sources.graphMaterial]);
    expect(inputMismatch.request.history.issues).toHaveLength(0);
    expect(inputMismatch.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await inputMismatch.evidence.material(inputMismatch.request)).toMatchObject({ status: "invalid", reason: "A candidate fact uses artifact material omitted from the checked required set." });
  });

  it("verifies both validator-accepted nested Planning graph references against the canonical graph", async () => {
    const t = await evidenceFixture();
    const sources = planningSources(t);
    const materials = [sources.plan, sources.reviewed, sources.input, sources.graphMaterial];
    const requiredArtifacts = [sources.plan, sources.reviewed, sources.input];

    const omitted = planningRecord(t, sources);
    expect(isImplementationPlanningCompletionRecord(omitted)).toBe(true);
    const noGraph = materialRequestWithOwner(t, planningOwnerEvent(t, omitted), materials, requiredArtifacts);
    expect(noGraph.request.history.issues).toHaveLength(0);
    expect(noGraph.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await noGraph.evidence.material(noGraph.request)).toMatchObject({ status: "invalid", reason: "A candidate graph binding lacks its actual canonical task graph and checked authored plan." });

    const wrongVersion = planningRecord(t, sources, { graphVersion: historyDigest("a different graph version") });
    expect(isImplementationPlanningCompletionRecord(wrongVersion)).toBe(true);
    const versionMismatch = materialRequestWithOwner(t, planningOwnerEvent(t, wrongVersion), materials, requiredArtifacts, [sources.graphMaterial]);
    expect(versionMismatch.request.history.issues).toHaveLength(0);
    expect(versionMismatch.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await versionMismatch.evidence.material(versionMismatch.request)).toMatchObject({ status: "invalid", reason: "A candidate graph binding lacks its actual canonical task graph and checked authored plan." });

    const wrongIdentity = planningRecord(t, sources, { graphId: "86000000-0000-4000-8000-000000000001" });
    expect(isImplementationPlanningCompletionRecord(wrongIdentity)).toBe(true);
    const identityMismatch = materialRequestWithOwner(t, planningOwnerEvent(t, wrongIdentity), materials, requiredArtifacts, [sources.graphMaterial]);
    expect(identityMismatch.request.history.issues).toHaveLength(0);
    expect(identityMismatch.request.history.events.every((record) => record.constructionEvent !== undefined)).toBe(true);
    expect(await identityMismatch.evidence.material(identityMismatch.request)).toMatchObject({ status: "invalid", reason: "The retained task graph fails its normal owner validation or recorded graph identity." });
  });
});
