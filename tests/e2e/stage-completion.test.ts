import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { StageCompletionCliDriver } from "./driver/stage-completion-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, createAuditHistory } from "./fixtures/histories/audit.js";
import { collectHistory as collectHistoryFromSources, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";
import { validateConstructionEvent } from "../../packages/cli/src/construction/events.js";

const harnesses: E2EHarness[] = [];
const unitDirectory = `.kepler/missions/${auditFixture.missionId}/construction/units-of-work/${auditFixture.unitId}`;
const repositoryId = "repo-main";
const artifactIds = {
  "unit-of-work.md": "a1000000-0000-4000-8000-000000000001",
  "design.md": "a2000000-0000-4000-8000-000000000002",
  "details/functional-design/domain-model.md": "a3000000-0000-4000-8000-000000000003",
} as const;
const qualityArtifactIds = {
  "quality.md": "b1000000-0000-4000-8000-000000000001",
  "details/quality-requirements/security.md": "b2000000-0000-4000-8000-000000000002",
} as const;
const qualityCategories = [
  "performance", "availability", "security", "accessibility", "compatibility", "operability", "observability", "maintainability",
] as const;
const planningArtifactId = "c1000000-0000-4000-8000-000000000001";
const planningGraphId = "c2000000-0000-4000-8000-000000000002";
const planningTaskId = "c3000000-0000-4000-8000-000000000003";

const sources = {
  "unit-of-work.md": `---\nid: ${artifactIds["unit-of-work.md"]}\ntype: unit-of-work\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Unit of Work\n\n## Purpose\n\nMake the selected workflow behavior explicit.\n\n## Scope\n\nInclude the Functional Design contract.\n\n## Context\n\nKeep the current public behavior and constraints.\n`,
  "design.md": `---\nid: ${artifactIds["design.md"]}\ntype: functional-design\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Design\n\n## Domain behavior\n\nThe result preserves the current contract and provides observable behavior.\n\n## Domain model\n\nThe model is described in [supporting detail](details/functional-design/domain-model.md).\n\n## Boundaries and interactions\n\nThe selected unit owns its functional behavior.\n\n## Design decisions and open questions\n\nNo unresolved material questions remain.\n`,
  "details/functional-design/domain-model.md": `---\nid: ${artifactIds["details/functional-design/domain-model.md"]}\ntype: supporting-document\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Domain model detail\n\nThe model preserves the current contract.\n`,
} as const;

const createProjectArtifacts = async (harness: E2EHarness) => {
  const root = harness.resources.repositoryDirectory;
  const unitRoot = Path.join(root, unitDirectory);
  await Fs.mkdir(Path.join(unitRoot, "details", "functional-design"), { recursive: true });
  const artifactBindings = [] as Array<{ artifact_id: string; content_version: string }>;
  for (const [relativePath, source] of Object.entries(sources)) {
    await Fs.writeFile(Path.join(unitRoot, relativePath), source, "utf8");
    artifactBindings.push({
      artifact_id: artifactIds[relativePath as keyof typeof artifactIds],
      content_version: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
    });
  }
  harness.resources.runGit(root, "add", unitDirectory);
  harness.resources.runGit(root, "commit", "-q", "-m", "Record approved Functional Design material");
  const commit = harness.resources.runGit(root, "rev-parse", "HEAD");
  return {
    artifactBindings,
    checkpoints: [{ repository_id: repositoryId, commit }],
    artifactPaths: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"],
  };
};

const createQualityArtifacts = async (harness: E2EHarness) => {
  const root = harness.resources.repositoryDirectory;
  const unitRoot = Path.join(root, unitDirectory);
  const sources = {
    "quality.md": `---\nid: ${qualityArtifactIds["quality.md"]}\ntype: non-functional-requirements\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Quality requirements\n\n## Quality requirements\n\nSecurity applies to stored requester data. See [security detail](details/quality-requirements/security.md).\n\n## Constraints and dependencies\n\nPreserve the accepted Functional Design contract.\n\n## Decisions and open questions\n\nNo material quality decisions remain unresolved.\n`,
    "details/quality-requirements/security.md": `---\nid: ${qualityArtifactIds["details/quality-requirements/security.md"]}\ntype: supporting-document\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Security requirement detail\n\nOnly the owning user can read saved request data.\n`,
  } as const;
  await Fs.mkdir(Path.join(unitRoot, "details", "quality-requirements"), { recursive: true });
  const artifactBindings = [] as Array<{ artifact_id: string; content_version: string }>;
  for (const [relativePath, source] of Object.entries(sources)) {
    await Fs.writeFile(Path.join(unitRoot, relativePath), source, "utf8");
    artifactBindings.push({
      artifact_id: qualityArtifactIds[relativePath as keyof typeof qualityArtifactIds],
      content_version: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
    });
  }
  harness.resources.runGit(root, "add", unitDirectory);
  harness.resources.runGit(root, "commit", "-q", "-m", "Record Quality Requirements material");
  const commit = harness.resources.runGit(root, "rev-parse", "HEAD");
  return {
    artifactBindings,
    sources,
    checkpoints: [{ repository_id: repositoryId, commit }],
    artifactPaths: ["quality.md", "details/quality-requirements/security.md"],
  };
};

const appendStageStart = async (
  harness: E2EHarness,
  authorityEventIds: string | readonly string[] | undefined,
  stage: "quality-requirements" | "implementation-planning" | "implementation" | "unit-of-work-review" | "deliver",
): Promise<{ readonly attemptId: string; readonly eventId: string }> => {
  const stageAttemptId = randomUUID();
  const eventId = randomUUID();
  const journalId = randomUUID();
  const authorityIds: string[] = [];
  if (authorityEventIds !== undefined) {
    if (typeof authorityEventIds === "string") authorityIds.push(authorityEventIds);
    else authorityIds.push(...authorityEventIds);
  }
  const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
  await Fs.writeFile(Path.join(historyDirectory, `${journalId}.jsonl`), `${JSON.stringify({
    id: eventId,
    phase: "construction",
    type: "construction.stage-attempt-started",
    envelope_version: 1,
    event_version: 1,
    journal_id: journalId,
    recorded_at: "2026-10-22T13:00:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
    caused_by: authorityIds,
    data: {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage,
      stage_attempt_id: stageAttemptId,
      inputs: [{ reference: "request:scope", purpose: "Accepted upstream stage scope" }],
      checkpoints: [],
      authority_event_ids: authorityIds,
    },
  })}\n`, "utf8");
  return { attemptId: stageAttemptId, eventId };
};

const readConstructionSources = async (harness: E2EHarness): Promise<readonly HistoryJournalSource[]> => {
  const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
  const files = (await Fs.readdir(historyDirectory)).filter((name) => name.endsWith(".jsonl")).sort();
  return Promise.all(files.map(async (name) => {
    const journalId = name.slice(0, -".jsonl".length);
    return {
      sourceId: `file://${name}`,
      missionId: auditFixture.missionId,
      phase: "construction" as const,
      journalId,
      bytes: new Uint8Array(await Fs.readFile(Path.join(historyDirectory, name))),
    };
  }));
};

const parseHistorySource = (source: HistoryJournalSource): Record<string, unknown>[] =>
  new TextDecoder().decode(source.bytes).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

const encodeHistorySource = (source: HistoryJournalSource, events: readonly unknown[]): HistoryJournalSource => ({
  ...source,
  bytes: new TextEncoder().encode(`${events.map((record) => JSON.stringify(record)).join("\n")}\n`),
});

const rewriteHistoryEvent = (
  sources: readonly HistoryJournalSource[],
  eventId: string,
  rewrite: (event: Record<string, unknown>) => Record<string, unknown>,
): HistoryJournalSource[] => sources.map((source) => encodeHistorySource(source,
  parseHistorySource(source).map((event) => event.id === eventId ? rewrite(event) : event),
));

const appendTypedConstructionEvent = async (
  harness: E2EHarness,
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[],
) => {
  const journalId = randomUUID();
  const candidate = {
    id: randomUUID(),
    phase: "construction",
    type,
    envelope_version: 1,
    event_version: 1,
    journal_id: journalId,
    recorded_at: new Date().toISOString(),
    producer: { name: "kepler-test", version: "0.10.3" },
    caused_by: [...new Set(causedBy)],
    data,
  };
  const validation = validateConstructionEvent(candidate);
  if (validation.status !== "valid") throw new Error(`Invalid ${type} fixture: ${JSON.stringify(validation)}`);
  const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
  await Fs.writeFile(Path.join(historyDirectory, `${journalId}.jsonl`), `${JSON.stringify(validation.event)}\n`, "utf8");
  return validation.event;
};

const recordQualityEvidence = (
  audit: AuditCliDriver,
  attempt: string,
  material: Awaited<ReturnType<typeof createQualityArtifacts>>,
  failedKind?: "artifact_validation" | "self_review",
): Record<string, string> => {
  const entries = [
    ["artifact_validation", "quality-artifact-validation"],
    ["self_review", "quality-self-review"],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [kind, check] of entries) {
    const result = audit.record("evidence", {
      unit: auditFixture.unitId,
      stage: "quality-requirements",
      attempt,
    }, {
      inputs: material.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current Quality Requirements material" })),
      artifact_bindings: material.artifactBindings,
      checkpoints: material.checkpoints,
      check,
      executor: "Quality Requirements assessment runner",
      result: {
        status: kind === failedKind ? "failed" : "passed",
        summary: kind === failedKind ? "A blocking finding remains." : "The named assessment passed.",
      },
    });
    expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
    expect(result.result.status).toBe("success");
    ids[kind] = String(result.result.data.evidence_id);
  }
  return ids;
};

const recordQualityExternalReviewEvidence = (
  audit: AuditCliDriver,
  attempt: string,
  material: Awaited<ReturnType<typeof createQualityArtifacts>>,
  relatedRequestEventId?: string,
): string => {
  const result = audit.record("evidence", {
    unit: auditFixture.unitId,
    stage: "quality-requirements",
    attempt,
  }, {
    inputs: material.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current material reviewed by the requested external reviewer" })),
    artifact_bindings: material.artifactBindings,
    checkpoints: material.checkpoints,
    check: "quality-external-review",
    executor: "Independent quality reviewer",
    result: { status: "passed", summary: "The requested external review found no blocking issue." },
    ...(relatedRequestEventId ? { related_request_event_id: relatedRequestEventId } : {}),
  });
  expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
  expect(result.result.status).toBe("success");
  return String(result.result.data.evidence_id);
};

const recordQualityApproval = (
  audit: AuditCliDriver,
  attempt: string,
  material: Awaited<ReturnType<typeof createQualityArtifacts>>,
): string => {
  const result = audit.record("approval", {
    unit: auditFixture.unitId,
    stage: "quality-requirements",
    attempt,
  }, {
    requester: "Requester",
    inputs: material.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current quality requirements approved" })),
    artifact_bindings: material.artifactBindings,
    checkpoints: material.checkpoints,
    decision_reference: "requester:approved-current-quality-requirements",
  });
  expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
  expect(result.result.status).toBe("success");
  return String(result.result.data.id);
};

type QualityCompletionRequestFixture = {
  readonly approval_event_id: string;
  readonly assessments: Readonly<Record<string, unknown>> & {
    readonly handoff: Readonly<Record<string, unknown>> & { readonly artifacts: readonly string[] };
    readonly self_review: Readonly<Record<string, unknown>> & { readonly evidence_id: string };
  };
};

const qualityCompletionRequest = (
  evidenceIds: Readonly<Record<string, string>>,
  approvalEventId: string,
  externalReview?: { readonly requestEventId: string; readonly evidenceId: string },
): QualityCompletionRequestFixture => ({
  approval_event_id: approvalEventId,
  assessments: {
    artifact_validation: {
      evidence_id: evidenceIds.artifact_validation,
      summary: "quality.md and its linked support pass structural validation.",
    },
    self_review: {
      status: "passed",
      evidence_id: evidenceIds.self_review,
      reviewer: "Quality Requirements owner",
      summary: "Applicability, objective scope, consistency, and Planning handoff were reviewed.",
      checks: ["category-applicability", "objective-conditions", "consistency", "material-decisions", "planning-handoff"],
      categories: qualityCategories.map((category) => ({
        category,
        applies: category === "security",
        rationale: `${category} applicability was considered for this unit.`,
      })),
      requirements: [{
        category: "security",
        reference: "quality.md#security",
        scope: "Stored requester data",
        conditions: "When a requester saves data",
        target: "Only the owning user can read saved request data.",
        acceptance_condition: "A different user receives an access-denied result.",
        owner: "Security Requirements owner",
      }],
      resolved_material_choices: [],
      unresolved_material_choices: [],
      unresolved_material_targets: [],
      unresolved_tradeoffs: [],
      unsupported_assumptions: [],
    },
    external_review: externalReview
      ? {
          requested: true,
          request_event_id: externalReview.requestEventId,
          evidence_id: externalReview.evidenceId,
          reviewer: "Independent quality reviewer",
          summary: "The requested external review found no blocking issue.",
          findings: [],
        }
      : { requested: false },
    handoff: {
      status: "ready",
      summary: "Current quality requirements are ready for Implementation Planning.",
      recipient: "implementation-planning",
      unit_directory: unitDirectory,
      artifacts: [
        "unit-of-work.md", "design.md", "details/functional-design/domain-model.md",
        "quality.md", "details/quality-requirements/security.md",
      ],
      requirement_references: ["quality.md#security"],
      constraints: ["Preserve the accepted Functional Design contract."],
      assumptions: [],
      planning_questions: ["Choose a mechanism that satisfies the security acceptance condition."],
    },
  },
});

const appendForgedQualityCompletion = async (
  harness: E2EHarness,
  audit: AuditCliDriver,
  attempt: string,
  startEventId: string,
  functionalMaterial: Awaited<ReturnType<typeof createProjectArtifacts>>,
  qualityMaterial: Awaited<ReturnType<typeof createQualityArtifacts>>,
  evidenceIds: Readonly<Record<string, string>>,
  approvalEventId: string,
  externalReview?: { readonly requestEventId: string; readonly evidenceId: string },
): Promise<void> => {
  const evidenceResult = audit.list({ unit: auditFixture.unitId, type: "construction.evidence-recorded", fields: "data" });
  expect(evidenceResult.exitCode, JSON.stringify(evidenceResult.result)).toBe(0);
  const evidenceEvents = evidenceResult.result.data.events as Array<{ id: string; data: { evidence_id?: string } }>;
  const namedEvidenceIds = [
    evidenceIds.artifact_validation,
    evidenceIds.self_review,
    ...(externalReview ? [externalReview.evidenceId] : []),
  ];
  const evidenceEventIds = namedEvidenceIds.map((evidenceId) => {
    const matches = evidenceEvents.filter((fact) => fact.data.evidence_id === evidenceId);
    if (matches.length !== 1) throw new Error("Expected one historical evidence event for each named assessment.");
    return matches[0]!.id;
  });
  const completionId = randomUUID();
  const journalId = randomUUID();
  const candidate = {
    id: completionId,
    phase: "construction",
    type: "construction.stage-attempt-completed",
    envelope_version: 1,
    event_version: 1,
    journal_id: journalId,
    recorded_at: "2026-10-22T14:00:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
    caused_by: [startEventId, approvalEventId, ...evidenceEventIds, ...(externalReview ? [externalReview.requestEventId] : [])],
    data: {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "quality-requirements",
      stage_attempt_id: attempt,
      evidence_ids: namedEvidenceIds,

      checkpoints: qualityMaterial.checkpoints,
      quality_requirements_assessment: {
        approval_event_id: approvalEventId,
        artifact_bindings: qualityMaterial.artifactBindings,
        functional_design_bindings: functionalMaterial.artifactBindings,
        assessments: qualityCompletionRequest(evidenceIds, approvalEventId, externalReview).assessments,
      },
    },
  };
  const validation = validateConstructionEvent(candidate);
  if (validation.status !== "valid") throw new Error("Expected the forged completion to pass event-schema validation.");
  const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
  await Fs.writeFile(Path.join(historyDirectory, `${journalId}.jsonl`), `${JSON.stringify(validation.event)}\n`, "utf8");
};

const createPlanningArtifacts = async (
  harness: E2EHarness,
  functionalMaterial: Awaited<ReturnType<typeof createProjectArtifacts>>,
  qualityMaterial: Awaited<ReturnType<typeof createQualityArtifacts>>,
) => {
  const root = harness.resources.repositoryDirectory;
  const unitRoot = Path.join(root, unitDirectory);
  const planSource = `---\nid: ${planningArtifactId}\ntype: implementation-plan\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Implementation plan\n\n## Technical solution\n\nEnforce owning-user access at the data boundary because this keeps the security rule testable.\n\n## Task graph context\n\nThe task decomposition is recorded in [tasks-dag.json](tasks-dag.json).\n\n## Verification strategy\n\nRun the focused unit test for the access policy and verify that another user is denied.\n\n## Decisions and open questions\n\nThe task owns the access-policy implementation; no consequential decisions remain open.\n`;
  const graph = {
    format: "kepler-task-dag",
    version: 1,
    id: planningGraphId,
    unit_id: auditFixture.unitId,
    tasks: [{
      id: planningTaskId,
      title: "Enforce owner-scoped reads",
      goal: "Prevent users from reading another user's stored data.",
      inputs: [{ reference: `artifact:${qualityArtifactIds["details/quality-requirements/security.md"]}`, purpose: "Accepted security requirement" }],
      outputs: ["Owner-scoped data access policy"],
      acceptance_criteria: ["A non-owner receives an access-denied result."],
      guidance: ["Keep the policy at the data boundary."],
      verification: [{ scope: "unit", method: "Run the access-policy unit test", expected_result: "A non-owner is denied." }],
      depends_on: [],
      prerequisites: [],
    }],
  };
  const graphSource = `${JSON.stringify(graph, null, 2)}\n`;
  const planBinding = { artifact_id: planningArtifactId, content_version: `sha256:${createHash("sha256").update(planSource, "utf8").digest("hex")}` };
  const inputBindings = [...functionalMaterial.artifactBindings, ...qualityMaterial.artifactBindings]
    .slice()
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  const reviewedBindings = [...inputBindings, planBinding]
    .slice()
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  await Fs.writeFile(Path.join(unitRoot, "plan.md"), planSource, "utf8");
  await Fs.writeFile(Path.join(unitRoot, "tasks-dag.json"), graphSource, "utf8");
  harness.resources.runGit(root, "add", unitDirectory);
  harness.resources.runGit(root, "commit", "-q", "-m", "Record Implementation Planning material");
  const commit = harness.resources.runGit(root, "rev-parse", "HEAD");
  return {
    artifactBindings: [planBinding],
    reviewedBindings,
    inputBindings,
    checkpoints: [{ repository_id: repositoryId, commit }],
    graphRef: { graph_id: planningGraphId, content_version: `sha256:${createHash("sha256").update(graphSource, "utf8").digest("hex")}` },
    graphSource,
    planSource,
    taskIds: [planningTaskId],
  };
};

const recordPlanningEvidence = (
  audit: AuditCliDriver,
  attempt: string,
  material: Awaited<ReturnType<typeof createPlanningArtifacts>>,
): Record<string, string> => {
  const entries = [
    ["artifact_validation", "planning-artifact-validation"],
    ["task_graph_validation", "planning-task-graph-validation"],
    ["self_review", "planning-self-review"],
  ] as const;
  const ids: Record<string, string> = {};
  const inputs = [
    { reference: `task-graph:${material.graphRef.graph_id}@${material.graphRef.content_version}`, purpose: "Current validated task graph" },
    ...material.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current functional, quality, or planning material reviewed" })),
  ];
  for (const [kind, check] of entries) {
    const result = audit.record("evidence", {
      unit: auditFixture.unitId,
      stage: "implementation-planning",
      attempt,
    }, {
      inputs,
      artifact_bindings: material.reviewedBindings,
      checkpoints: material.checkpoints,
      check,
      executor: "Implementation Planning assessment runner",
      result: { status: "passed", summary: "The named planning assessment passed." },
    });
    expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
    expect(result.result.status).toBe("success");
    ids[kind] = String(result.result.data.evidence_id);
  }
  return ids;
};

type PlanningCompletionRequestFixture = {
  readonly assessments: Readonly<Record<string, unknown>> & {
    readonly self_review: Readonly<Record<string, unknown>> & { readonly evidence_id: string };
  };
};

const planningCompletionRequest = (
  material: Awaited<ReturnType<typeof createPlanningArtifacts>>,
  evidenceIds: Readonly<Record<string, string>>,
): PlanningCompletionRequestFixture => ({
  assessments: {
    artifact_validation: { evidence_id: evidenceIds.artifact_validation, summary: "plan.md and its current supporting material pass validation." },
    task_graph_validation: { evidence_id: evidenceIds.task_graph_validation, summary: "The exact task graph has valid identities and dependencies." },
    self_review: {
      status: "passed",
      evidence_id: evidenceIds.self_review,
      reviewer: "Implementation Planning owner",
      summary: "Rationale, obligations, task contracts, dependencies, prerequisites, and verification feasibility were reviewed.",
      checks: ["decision-rationale", "obligation-coverage", "consistency", "dependency-reasons", "prerequisite-conditions", "verification-feasibility", "input-relevance", "blocking-decisions"],
      decision_rationales: [{ decision: "Enforce access at the data boundary", rationale: "This keeps the security rule local and testable." }],
      task_reviews: [{
        task_id: planningTaskId,
        inputs_relevant: true,
        outputs_explicit: true,
        acceptance_testable: true,
        dependency_reasons_justified: true,
        prerequisites_conditioned: true,
        verification_feasible: true,
        rationale: "The task has explicit input, output, acceptance, and verification contracts.",
      }],
      obligation_coverage: [{
        reference: "quality.md#security",
        disposition: "planned",
        task_ids: [planningTaskId],
        rationale: "The task implements the accepted owner-scoped access rule.",
      }],
      unresolved_consequential_decisions: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false },
    approval_requirement: { required: false, rationale: "No authority rule or requester instruction requires plan approval." },
    handoff: {
      status: "ready",
      summary: "The current task graph and implementation plan are ready for Implementation.",
      recipient: "implementation",
      unit_directory: unitDirectory,
      artifacts: ["plan.md", "tasks-dag.json"],
      input_bindings: material.inputBindings,
      graph_ref: material.graphRef,
      task_ids: material.taskIds,
      verification_obligations: [`task:${planningTaskId} unit: Run the access-policy unit test; expected: A non-owner is denied.`],
      prerequisite_conditions: [],
      coordination_constraints: ["Serialize repository integration per unit."],
      approval_required: false,
    },
  },
});

const createAuditDriver = (harness: E2EHarness): AuditCliDriver => {
  const historyDirectory = Path.join(
    harness.resources.repositoryDirectory,
    ".kepler",
    "missions",
    auditFixture.missionId,
    "history",
    "construction",
  );
  return new AuditCliDriver(harness.cli, {
    journals: async () => {
      const names = (await Fs.readdir(historyDirectory)).sort();
      const records = await Promise.all(names.map(async (name) => [name, await Fs.readFile(Path.join(historyDirectory, name), "utf8")]));
      return JSON.stringify(records);
    },
  });
};

const recordEvidence = (
  audit: AuditCliDriver,
  attempt: string,
  material: Awaited<ReturnType<typeof createProjectArtifacts>>,
  failedKind?: "self_review" | "decision_resolution" | "handoff",
) => {
  const entries = [
    ["self_review", "functional-design-self-review"],
    ["decision_resolution", "functional-design-decision-resolution"],
    ["handoff", "functional-design-quality-handoff"],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [kind, check] of entries) {
    const result = audit.record("evidence", {
      unit: auditFixture.unitId,
      stage: "functional-design",
      attempt,
    }, {
      inputs: material.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current Functional Design material" })),
      artifact_bindings: material.artifactBindings,
      checkpoints: material.checkpoints,
      check,
      executor: "Functional Design assessment runner",
      result: {
        status: kind === failedKind ? "failed" : "passed",
        summary: kind === failedKind ? "A blocking finding remains." : "The named assessment passed.",
      },
    });
    expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
    expect(result.result.status).toBe("success");
    ids[kind] = String(result.result.data.evidence_id);
  }
  return ids;
};

const recordApproval = (
  audit: AuditCliDriver,
  material: Awaited<ReturnType<typeof createProjectArtifacts>>,
): string => {
  const result = audit.record("approval", {
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.stageAttemptId,
  }, {
    requester: "Requester",
    inputs: material.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Functional Design reviewed for explicit approval" })),
    artifact_bindings: material.artifactBindings,
    checkpoints: material.checkpoints,
    decision_reference: "requester:approved-current-functional-design",
  });
  expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
  expect(result.result.status).toBe("success");
  return String(result.result.data.id);
};

const completionRequest = (
  evidenceIds: Readonly<Record<string, string>>,
  approvalEventId: string,
): Record<string, unknown> => {
  const concerns = [{ concern: "Define applicable observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }];
  const questions = [{ question: "Select the implementation strategy.", responsible_stage: "implementation-planning", owner: "Implementation Planning owner" }];
  return {
    approval_event_id: approvalEventId,
    assessments: {
      self_review: {
        status: "passed",
        evidence_id: evidenceIds.self_review,
        reviewer: "Functional Design owner",
        summary: "All required sections, observable criteria, consistency, blocking questions, and handoff were reviewed.",
        checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"],
        findings: [],
      },
      decision_resolution: {
        status: "resolved",
        evidence_id: evidenceIds.decision_resolution,
        summary: "Every consequential choice has an owner and resolution.",
        resolved_material_choices: [{ choice: "Preserve the existing public contract", owner: "Requester", resolution: "Keep the current behavior unless an observable requirement says otherwise." }],
        unresolved_material_choices: [],
        unsupported_assumptions: [],
        quality_concerns: concerns,
        technical_questions: questions,
      },
      handoff: {
        status: "ready",
        evidence_id: evidenceIds.handoff,
        summary: "The complete Functional Design package and next-stage concerns are ready.",
        recipient: "quality-requirements",
        unit_directory: unitDirectory,
        artifacts: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"],
        project_references: [],
        known_constraints: ["Preserve the current public contract."],
        quality_concerns: concerns,
        technical_questions: questions,
      },
    },
  };
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("Functional Design stage completion CLI E2E", () => {
  it("completes the current attempt with validated artifacts, passed named evidence, explicit approval, and typed handoff", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const material = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const evidenceIds = recordEvidence(audit, auditFixture.stageAttemptId, material);
    const approvalEventId = recordApproval(audit, material);
    const beforeWrongAttempt = await audit.journalSnapshot();
    const wrongAttempt = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      randomUUID(),
      completionRequest(evidenceIds, approvalEventId),
    );
    expect(wrongAttempt.exitCode).toBe(1);
    expect(wrongAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    expect(await audit.journalSnapshot()).toBe(beforeWrongAttempt);
    const missingEvidenceRequest = completionRequest({ ...evidenceIds, self_review: randomUUID() }, approvalEventId);
    const missingEvidence = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId, auditFixture.stageAttemptId, missingEvidenceRequest,
    );
    expect(missingEvidence.exitCode).toBe(1);
    expect(missingEvidence.result).toMatchObject({ status: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(beforeWrongAttempt);

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(evidenceIds, approvalEventId),
    );

    expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
    expect(result.result).toMatchObject({
      status: "success",
      data: {
        unit_id: auditFixture.unitId,
        stage: "functional-design",
        attempt_id: auditFixture.stageAttemptId,
        evidence_ids: [evidenceIds.self_review, evidenceIds.decision_resolution, evidenceIds.handoff],
        approval_event_id: approvalEventId,
      },
    });
    const completed = audit.list({ unit: auditFixture.unitId, type: "construction.stage-attempt-completed", fields: "data" });
    expect(completed.result.data.events).toHaveLength(1);
    expect((completed.result.data.events as Array<{ data: Record<string, unknown> }>)[0]?.data).toMatchObject({
      stage: "functional-design",
      stage_attempt_id: auditFixture.stageAttemptId,
      functional_design_assessment: {
        approval_event_id: approvalEventId,
        assessments: {
          self_review: { checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"] },
          decision_resolution: { resolved_material_choices: [{ owner: "Requester" }] },
          handoff: { recipient: "quality-requirements", artifacts: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"] },
        },
      },
    });
  }, 120_000);

  it("denies a failed named evidence result without appending completion", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const material = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const evidenceIds = recordEvidence(audit, auditFixture.stageAttemptId, material, "self_review");
    const approvalEventId = recordApproval(audit, material);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(evidenceIds, approvalEventId),
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
  }, 120_000);

  it("denies passed evidence from the ended prior attempt despite identical checkpoints", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const material = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const evidenceIds = recordEvidence(audit, auditFixture.priorStageAttemptId, material);
    const approvalEventId = recordApproval(audit, material);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(evidenceIds, approvalEventId),
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
  }, 120_000);

  it("rejects artifacts when the persisted unit-created directory is not canonical", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory, `units-of-work/${auditFixture.unitId}`);
    await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest({
        self_review: "63000000-0000-4000-8000-000000000001",
        decision_resolution: "63000000-0000-4000-8000-000000000002",
        handoff: "63000000-0000-4000-8000-000000000003",
      }, "64000000-0000-4000-8000-000000000001"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "functional_design_artifacts_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
  }, 120_000);

  it("completes Standard stages through Deliver via the stage CLI", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory, undefined, { includeImplementationFacts: false });
    const functionalMaterial = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const functionalEvidence = recordEvidence(audit, auditFixture.stageAttemptId, functionalMaterial);
    const functionalApproval = recordApproval(audit, functionalMaterial);
    const functionalCompletion = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(functionalEvidence, functionalApproval),
    );
    expect(functionalCompletion.exitCode, JSON.stringify(functionalCompletion.result)).toBe(0);
    const qualityStart = await appendStageStart(harness, String(functionalCompletion.result.data.id), "quality-requirements");
    const qualityAttempt = qualityStart.attemptId;
    const qualityMaterial = await createQualityArtifacts(harness);
    const qualityEvidence = recordQualityEvidence(audit, qualityAttempt, qualityMaterial);
    const requestEvent = audit.record("interaction", {
      unit: auditFixture.unitId,
      stage: "quality-requirements",
      attempt: qualityAttempt,
    }, {
      participants: ["Requester"],
      content: "Please obtain an independent review of the current quality requirements.",
      references: ["quality.md"],
    });
    expect(requestEvent.exitCode, JSON.stringify(requestEvent.result)).toBe(0);
    const externalReviewEvidence = recordQualityExternalReviewEvidence(
      audit,
      qualityAttempt,
      qualityMaterial,
      String(requestEvent.result.data.id),
    );
    const qualityApproval = recordQualityApproval(audit, qualityAttempt, qualityMaterial);

    const completionDriver = new StageCompletionCliDriver(harness.cli);
    const qualityRequest = qualityCompletionRequest(qualityEvidence, qualityApproval, {
      requestEventId: String(requestEvent.result.data.id),
      evidenceId: externalReviewEvidence,
    });
    const incompleteHandoff = {
      ...qualityRequest,
      assessments: {
        ...qualityRequest.assessments,
        handoff: { ...qualityRequest.assessments.handoff, artifacts: ["quality.md", "details/quality-requirements/security.md"] },
      },
    };
    const beforeHandoffDenial = await audit.journalSnapshot();
    const missingQualityEvidence = completionDriver.complete(auditFixture.unitId, qualityAttempt, {
      ...qualityRequest,
      assessments: { ...qualityRequest.assessments, self_review: { ...qualityRequest.assessments.self_review, evidence_id: randomUUID() } },
    }, "quality-requirements");
    expect(missingQualityEvidence.exitCode).toBe(1);
    expect(missingQualityEvidence.result).toMatchObject({ status: "failed", data: { code: "quality_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(beforeHandoffDenial);
    const denied = completionDriver.complete(auditFixture.unitId, qualityAttempt, incompleteHandoff, "quality-requirements");
    expect(denied.exitCode).toBe(1);
    expect(denied.result).toMatchObject({ status: "failed", data: { code: "quality_handoff_mismatch" } });
    expect(await audit.journalSnapshot()).toBe(beforeHandoffDenial);
    await Fs.writeFile(
      Path.join(harness.resources.repositoryDirectory, unitDirectory, "quality.md"),
      `${qualityMaterial.sources["quality.md"]}\nThe target remains proposed and has not been measured.\n`,
      "utf8",
    );
    const staleQuality = completionDriver.complete(auditFixture.unitId, qualityAttempt, qualityRequest, "quality-requirements");
    expect(staleQuality.exitCode).toBe(1);
    expect(staleQuality.result).toMatchObject({ status: "failed", data: { code: "quality_evidence_invalid" } });
    await Fs.writeFile(
      Path.join(harness.resources.repositoryDirectory, unitDirectory, "quality.md"),
      qualityMaterial.sources["quality.md"],
      "utf8",
    );
    expect(await audit.journalSnapshot()).toBe(beforeHandoffDenial);
    const result = completionDriver.complete(auditFixture.unitId, qualityAttempt, qualityRequest, "quality-requirements");

    expect(result.exitCode, JSON.stringify(result.result)).toBe(0);
    expect(result.result).toMatchObject({
      status: "success",
      data: {
        unit_id: auditFixture.unitId,
        stage: "quality-requirements",
        attempt_id: qualityAttempt,
        evidence_ids: [qualityEvidence.artifact_validation, qualityEvidence.self_review, externalReviewEvidence],
        approval_event_id: qualityApproval,
      },
    });
    const planningStart = await appendStageStart(
      harness,
      [String(functionalCompletion.result.data.id), String(result.result.data.id)],
      "implementation-planning",
    );
    const planningAttempt = planningStart.attemptId;
    const planningMaterial = await createPlanningArtifacts(harness, functionalMaterial, qualityMaterial);
    const planningEvidence = recordPlanningEvidence(audit, planningAttempt, planningMaterial);
    const planningDriver = new StageCompletionCliDriver(harness.cli);
    const planningRequest = planningCompletionRequest(planningMaterial, planningEvidence);
    const beforePlanningDenials = await audit.journalSnapshot();
    const wrongQualityAttempt = completionDriver.complete(auditFixture.unitId, randomUUID(), qualityRequest, "quality-requirements");
    expect(wrongQualityAttempt.exitCode).toBe(1);
    expect(wrongQualityAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    expect(await audit.journalSnapshot()).toBe(beforePlanningDenials);
    const wrongAttempt = planningDriver.complete(auditFixture.unitId, randomUUID(), planningRequest, "implementation-planning");
    expect(wrongAttempt.exitCode).toBe(1);
    expect(wrongAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    const missingEvidenceRequest = {
      ...planningRequest,
      assessments: {
        ...planningRequest.assessments,
        self_review: { ...planningRequest.assessments.self_review, evidence_id: randomUUID() },
      },
    };
    const missingEvidence = planningDriver.complete(auditFixture.unitId, planningAttempt, missingEvidenceRequest, "implementation-planning");
    expect(missingEvidence.exitCode).toBe(1);
    expect(missingEvidence.result).toMatchObject({ status: "failed", data: { code: "planning_evidence_invalid" } });
    await Fs.writeFile(Path.join(harness.resources.repositoryDirectory, unitDirectory, "plan.md"), `${planningMaterial.planSource}\nThe current material changed after its evidence was recorded.\n`, "utf8");
    const staleMaterial = planningDriver.complete(auditFixture.unitId, planningAttempt, planningRequest, "implementation-planning");
    expect(staleMaterial.exitCode).toBe(1);
    expect(staleMaterial.result).toMatchObject({ status: "failed", data: { code: "planning_evidence_invalid" } });
    await Fs.writeFile(Path.join(harness.resources.repositoryDirectory, unitDirectory, "plan.md"), planningMaterial.planSource, "utf8");
    expect(await audit.journalSnapshot()).toBe(beforePlanningDenials);
    const planningResult = planningDriver.complete(auditFixture.unitId, planningAttempt, planningRequest, "implementation-planning");
    expect(planningResult.exitCode, JSON.stringify(planningResult.result)).toBe(0);
    expect(planningResult.result).toMatchObject({
      status: "success",
      data: { stage: "implementation-planning", attempt_id: planningAttempt, graph_ref: planningMaterial.graphRef },
    });
    const shown = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout).data.unit.stages).toContainEqual(expect.objectContaining({
      stage: "quality-requirements",
      state: "completed",
    }));
    expect(JSON.parse(shown.stdout).data.unit.stages).toContainEqual(expect.objectContaining({
      stage: "implementation-planning",
      state: "completed",
    }));

    const implementationAuthority = [String(functionalCompletion.result.data.id), String(result.result.data.id), String(planningResult.result.data.id)];
    const implementationInputs = [
      { reference: `task-graph:${planningMaterial.graphRef.graph_id}@${planningMaterial.graphRef.content_version}`, purpose: "Current accepted task definition" },
      { reference: `artifact:${qualityArtifactIds["details/quality-requirements/security.md"]}`, purpose: "Accepted security requirement" },
    ];
    const previousImplementationStart = await appendStageStart(harness, implementationAuthority, "implementation");
    const previousImplementationAdmission = await appendTypedConstructionEvent(harness, "construction.task-admitted", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
      stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId,
      graph_ref: planningMaterial.graphRef,
      task_definition_ref: { graph_id: planningMaterial.graphRef.graph_id, task_id: planningTaskId, content_version: planningMaterial.graphRef.content_version },
      admission_baseline: [{ repository_id: repositoryId, commit: "checkpoint-start" }], predecessor_provenance: [], prerequisite_evidence: [],
    }, [previousImplementationStart.eventId, String(planningResult.result.data.id), auditFixture.baselineEventId]);
    const createPreviousActivity = async (
      activity: "code-generation" | "code-validation" | "code-integration",
      priorCompletionId?: string,
      sourceEvidence?: { readonly evidenceId: string; readonly eventId: string },
    ) => {
      const activityAttemptId = randomUUID();
      const started = await appendTypedConstructionEvent(harness, "construction.activity-attempt-started", {
        mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
        stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
        activity_attempt_id: activityAttemptId, inputs: implementationInputs, checkpoints: planningMaterial.checkpoints,
      }, [previousImplementationAdmission.id, ...(priorCompletionId ? [priorCompletionId] : [])]);
      let preparedId: string | undefined;
      if (activity === "code-integration") {
        const prepared = await appendTypedConstructionEvent(harness, "construction.integration-prepared", {
          mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
          stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
          activity_attempt_id: activityAttemptId, captured_inputs: planningMaterial.checkpoints,
          candidate_checkpoints: planningMaterial.checkpoints, task_output_refs: [`task-output:${planningTaskId}`],
          source_evidence_ids: sourceEvidence ? [sourceEvidence.evidenceId] : [], inputs: implementationInputs,
        }, [started.id, previousImplementationAdmission.id, ...(priorCompletionId ? [priorCompletionId] : []), ...(sourceEvidence ? [sourceEvidence.eventId] : [])]);
        preparedId = prepared.id;
      }
      const evidenceId = randomUUID();
      const evidence = await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
        mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
        stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
        activity_attempt_id: activityAttemptId, evidence_id: evidenceId,
        artifact_bindings: planningMaterial.reviewedBindings, checkpoints: planningMaterial.checkpoints,
        inputs: implementationInputs, check: `${activity}-verification`, executor: activity === "code-generation" ? "agent:builder" : "agent:verifier",
        result: { status: "passed", summary: `${activity} produced passing evidence.` },
        output_refs: [`task-output:${planningTaskId}`], conditions: [],
      }, [started.id, ...(preparedId ? [preparedId] : [])]);
      let integrationEventId: string | undefined;
      if (activity === "code-integration") {
        const accepted = await appendTypedConstructionEvent(harness, "construction.integration-accepted", {
          mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
          stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
          activity_attempt_id: activityAttemptId, prepared_event_id: preparedId,
          candidate_checkpoints: planningMaterial.checkpoints,
          repository_results: [{ repository_id: repositoryId, evidence_ids: [evidenceId] }], authority_event_ids: [],
        }, [String(preparedId), evidence.id]);
        integrationEventId = accepted.id;
      }
      const completed = await appendTypedConstructionEvent(harness, "construction.activity-attempt-completed", {
        mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
        stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
        activity_attempt_id: activityAttemptId, evidence_ids: [evidenceId], checkpoints: planningMaterial.checkpoints,
      }, [started.id, evidence.id, ...(integrationEventId ? [integrationEventId] : [])]);
      return { activityAttemptId, evidenceId, evidenceEventId: evidence.id, completionId: completed.id, integrationEventId };
    };
    const previousCodeGeneration = await createPreviousActivity("code-generation");
    const previousCodeValidation = await createPreviousActivity("code-validation", previousCodeGeneration.completionId);
    const previousCodeIntegration = await createPreviousActivity("code-integration", previousCodeValidation.completionId, {
      evidenceId: previousCodeValidation.evidenceId, eventId: previousCodeValidation.evidenceEventId,
    });
    const returnRevisionId = randomUUID();
    const returnInteraction = await appendTypedConstructionEvent(harness, "construction.interaction-recorded", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
      stage_attempt_id: previousImplementationStart.attemptId, participants: ["Orchestrator"],
      content: "Return Implementation while retaining the unchanged completed Activities.", references: ["revision:implementation"],
    }, [previousCodeIntegration.completionId]);
    const returnAuthorization = await appendTypedConstructionEvent(harness, "construction.revision-authorized", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, revision_id: returnRevisionId,
      orchestrator_decision: "Return Implementation", reason: "Assess completed scopes before downstream work.",
      stage: "implementation", stage_attempt_id: previousImplementationStart.attemptId,
    }, [returnInteraction.id]);
    const previousImplementationEnded = await appendTypedConstructionEvent(harness, "construction.stage-attempt-ended-by-revision", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
      stage_attempt_id: previousImplementationStart.attemptId, revision_id: returnRevisionId,
      reason: "Return the parent for a new Implementation attempt.",
    }, [returnAuthorization.id, previousCodeValidation.completionId]);
    const implementationReopened = await appendTypedConstructionEvent(harness, "construction.stage-reopened", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
      stage_attempt_id: previousImplementationStart.attemptId, revision_id: returnRevisionId,
      reason: "Open a new Implementation parent for the authorized return.",
    }, [previousImplementationEnded.id, returnAuthorization.id]);
    const implementationStart = await appendStageStart(harness,
      [...implementationAuthority, implementationReopened.id, returnAuthorization.id], "implementation");
    const implementationAttempt = implementationStart.attemptId;
    const stageDriver = new StageCompletionCliDriver(harness.cli);
    const retainedAssessmentRequest = { assessments: [
      {
        task_id: planningTaskId, activity: "code-generation", original_stage_attempt_id: previousImplementationStart.attemptId,
        original_activity_attempt_id: previousCodeGeneration.activityAttemptId, original_evidence_ids: [previousCodeGeneration.evidenceId],
        applicable: true, reason: "Generation output remains valid for the unchanged task graph.", checkpoints: planningMaterial.checkpoints,
      },
      {
        task_id: planningTaskId, activity: "code-validation", original_stage_attempt_id: previousImplementationStart.attemptId,
        original_activity_attempt_id: previousCodeValidation.activityAttemptId, original_evidence_ids: [previousCodeValidation.evidenceId],
        applicable: true, reason: "Validation remains valid for the unchanged generated output.", checkpoints: planningMaterial.checkpoints,
      },
      {
        task_id: planningTaskId, activity: "code-integration", original_stage_attempt_id: previousImplementationStart.attemptId,
        original_activity_attempt_id: previousCodeIntegration.activityAttemptId, original_evidence_ids: [previousCodeIntegration.evidenceId],
        applicable: true, reason: "The predecessor Integration was available before current work and remains in the assessed history.", checkpoints: planningMaterial.checkpoints,
      },
    ] };
    const beforeRetainedAssessmentDenials = await audit.journalSnapshot();
    const sameParentAssessment = stageDriver.assessRetainedScopes(auditFixture.unitId, implementationAttempt, {
      assessments: [{ ...retainedAssessmentRequest.assessments[0]!, original_stage_attempt_id: implementationAttempt }],
    });
    expect(sameParentAssessment.exitCode).toBe(1);
    expect(sameParentAssessment.result, JSON.stringify(sameParentAssessment.result)).toMatchObject({ status: "failed", data: { code: "retained_scope_origin_invalid" } });
    const wrongRetainedAttempt = stageDriver.assessRetainedScopes(auditFixture.unitId, randomUUID(), retainedAssessmentRequest);
    expect(wrongRetainedAttempt.exitCode).toBe(1);
    expect(wrongRetainedAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    expect(await audit.journalSnapshot()).toBe(beforeRetainedAssessmentDenials);
    const retainedAssessment = stageDriver.assessRetainedScopes(auditFixture.unitId, implementationAttempt, retainedAssessmentRequest);
    expect(retainedAssessment.exitCode, JSON.stringify(retainedAssessment.result)).toBe(0);
    const retainedAssessmentEventId = String(retainedAssessment.result.data.id);
    const admission = await appendTypedConstructionEvent(harness, "construction.task-admitted", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttempt,
      task_id: planningTaskId,
      graph_ref: planningMaterial.graphRef,
      task_definition_ref: {
        graph_id: planningMaterial.graphRef.graph_id,
        task_id: planningTaskId,
        content_version: planningMaterial.graphRef.content_version,
      },
      admission_baseline: [{ repository_id: repositoryId, commit: "checkpoint-start" }],
      predecessor_provenance: [],
      prerequisite_evidence: [],
    }, [implementationStart.eventId, String(planningResult.result.data.id), auditFixture.baselineEventId, retainedAssessmentEventId]);
    const activityNames = ["code-integration"] as const;
    const activityEvidenceIds: string[] = [];
    const activityStarts = new Map<string, string>();
    const activityAttemptIds = new Map<string, string>();
    const activityCompletionEventIds = new Map<string, string>();
    let previousActivityCompletion = previousCodeValidation.completionId;
    let validationEvidenceId = previousCodeValidation.evidenceId;
    let validationEvidenceEventId = previousCodeValidation.evidenceEventId;
    let integrationEventId = "";
    for (const activity of activityNames) {
      const activityAttemptId = randomUUID();
      const started = await appendTypedConstructionEvent(harness, "construction.activity-attempt-started", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttempt,
        task_id: planningTaskId,
        activity,
        activity_attempt_id: activityAttemptId,
        inputs: implementationInputs,
        checkpoints: planningMaterial.checkpoints,
      }, [admission.id, previousActivityCompletion, retainedAssessmentEventId]);
      activityStarts.set(activity, started.id);
      activityAttemptIds.set(activity, activityAttemptId);
      let preparedId: string | undefined;
      if (activity === "code-integration") {
        const prepared = await appendTypedConstructionEvent(harness, "construction.integration-prepared", {
          mission_id: auditFixture.missionId,
          unit_id: auditFixture.unitId,
          stage: "implementation",
          stage_attempt_id: implementationAttempt,
          task_id: planningTaskId,
          activity,
          activity_attempt_id: activityAttemptId,
          captured_inputs: planningMaterial.checkpoints,
          candidate_checkpoints: planningMaterial.checkpoints,
          task_output_refs: [`task-output:${planningTaskId}`],
          source_evidence_ids: [validationEvidenceId],
          inputs: implementationInputs,
        }, [started.id, admission.id, previousActivityCompletion, validationEvidenceEventId, retainedAssessmentEventId]);
        preparedId = prepared.id;
      }
      const evidenceId = randomUUID();
      const evidence = await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttempt,
        task_id: planningTaskId,
        activity,
        activity_attempt_id: activityAttemptId,
        evidence_id: evidenceId,
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: planningMaterial.checkpoints,
        inputs: implementationInputs,
        check: `${activity}-verification`,
        executor: "agent:integrator",
        result: { status: "passed", summary: `${activity} produced passing evidence.` },
        output_refs: [`task-output:${planningTaskId}`],
        conditions: [],
      }, [started.id, ...(preparedId ? [preparedId] : [])]);
      activityEvidenceIds.push(evidenceId);
      if (activity === "code-integration") {
        const accepted = await appendTypedConstructionEvent(harness, "construction.integration-accepted", {
          mission_id: auditFixture.missionId,
          unit_id: auditFixture.unitId,
          stage: "implementation",
          stage_attempt_id: implementationAttempt,
          task_id: planningTaskId,
          activity,
          activity_attempt_id: activityAttemptId,
          prepared_event_id: preparedId,
          candidate_checkpoints: planningMaterial.checkpoints,
          repository_results: [{ repository_id: repositoryId, evidence_ids: [evidenceId] }],
          authority_event_ids: [],
        }, [String(preparedId), evidence.id]);
        integrationEventId = accepted.id;
      }
      const completed = await appendTypedConstructionEvent(harness, "construction.activity-attempt-completed", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttempt,
        task_id: planningTaskId,
        activity,
        activity_attempt_id: activityAttemptId,
        evidence_ids: [evidenceId],
        checkpoints: planningMaterial.checkpoints,
      }, [started.id, evidence.id, ...(integrationEventId ? [integrationEventId] : [])]);
      previousActivityCompletion = completed.id;
      activityCompletionEventIds.set(activity, completed.id);
    }
    await appendTypedConstructionEvent(harness, "construction.task-completed", {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttempt,
      task_id: planningTaskId,
      integration_event_id: integrationEventId,
      conditions: ["The owner-scoped access policy satisfies its accepted security requirement."],
    }, [integrationEventId, previousActivityCompletion]);
    const stageEvidence = async (check: string, executor: string): Promise<string> => {
      const evidenceId = randomUUID();
      await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "implementation",
        stage_attempt_id: implementationAttempt,
        evidence_id: evidenceId,
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: planningMaterial.checkpoints,
        inputs: planningMaterial.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current upstream material" })),
        check,
        executor,
        result: { status: "passed", summary: `${check} passed for the current Implementation attempt.` },
        output_refs: [`assessment:${check}`],
        conditions: [],
      }, [implementationStart.eventId]);
      return evidenceId;
    };
    const selfReviewEvidenceId = await stageEvidence("implementation-self-review", "Implementation owner");
    const handoffEvidenceId = await stageEvidence("implementation-review-handoff", "Implementation owner");
    const unitCheckEvidenceId = await stageEvidence("implementation-combined-result-check", "Independent verifier");
    const handoffArtifacts = [
      ...functionalMaterial.artifactPaths,
      ...qualityMaterial.artifactPaths,
      "plan.md",
      "tasks-dag.json",
    ].sort();
    const implementationRequest = {
      self_review_evidence_id: selfReviewEvidenceId,
      handoff_evidence_id: handoffEvidenceId,
      unit_check_evidence_ids: [unitCheckEvidenceId],
      retained_scope_assessment_event_ids: [retainedAssessmentEventId],
      additional_review: { requested: false },
      blocking_findings: [],
      handoff_assessment: {
        status: "ready",
        reason: "All planned tasks completed and the review package identifies current upstream material.",
        recipient: "unit-of-work-review",
        artifacts: handoffArtifacts,
      },
    };
    const beforeImplementationWrongAttempt = await audit.journalSnapshot();
    const implementationHistoryDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
    let changedEvidencePath: string | undefined;
    let originalEvidenceJournal: string | undefined;
    for (const name of await Fs.readdir(implementationHistoryDirectory)) {
      if (!name.endsWith(".jsonl")) continue;
      const path = Path.join(implementationHistoryDirectory, name);
      const original = await Fs.readFile(path, "utf8");
      const lines = original.trim().split("\n");
      const index = lines.findIndex((line) => {
        const record = JSON.parse(line) as Record<string, unknown>;
        const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
        return record.type === "construction.evidence-recorded" && data?.stage === "implementation" && data.activity === "code-generation";
      });
      if (index < 0) continue;
      const record = JSON.parse(lines[index]!) as Record<string, unknown>;
      const data = record.data as Record<string, unknown>;
      lines[index] = JSON.stringify({ ...record, data: { ...data, checkpoints: [] } });
      await Fs.writeFile(path, `${lines.join("\n")}\n`, "utf8");
      changedEvidencePath = path;
      originalEvidenceJournal = original;
      break;
    }
    if (!changedEvidencePath || originalEvidenceJournal === undefined) throw new Error("The current Code Generation evidence event is missing from history.");
    const beforeCheckpointDenial = await audit.journalSnapshot();
    const staleCheckpointEvidence = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId, implementationAttempt, implementationRequest, "implementation",
    );
    expect(staleCheckpointEvidence.exitCode).toBe(1);
    expect(staleCheckpointEvidence.result).toMatchObject({ status: "failed", data: { code: "audit_scope_unavailable" } });
    expect(await audit.journalSnapshot()).toBe(beforeCheckpointDenial);
    await Fs.writeFile(changedEvidencePath, originalEvidenceJournal, "utf8");
    expect(await audit.journalSnapshot()).toBe(beforeImplementationWrongAttempt);
    const missingImplementationCheck = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      implementationAttempt,
      { ...implementationRequest, unit_check_evidence_ids: [randomUUID()] },
      "implementation",
    );
    expect(missingImplementationCheck.exitCode).toBe(1);
    expect(missingImplementationCheck.result, JSON.stringify(missingImplementationCheck.result)).toMatchObject({ status: "failed", data: { code: "implementation_combined_check_invalid" } });
    expect(await audit.journalSnapshot()).toBe(beforeImplementationWrongAttempt);
    const wrongImplementationAttempt = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId, randomUUID(), implementationRequest, "implementation",
    );
    expect(wrongImplementationAttempt.exitCode).toBe(1);
    expect(wrongImplementationAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    expect(await audit.journalSnapshot()).toBe(beforeImplementationWrongAttempt);
    const implementationResult = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId, implementationAttempt, implementationRequest, "implementation",
    );
    expect(implementationResult.exitCode, JSON.stringify(implementationResult.result)).toBe(0);
    expect(implementationResult.result).toMatchObject({
      status: "success",
      data: { stage: "implementation", attempt_id: implementationAttempt, integration_event_ids: [integrationEventId] },
    });
    const implementationHistorySources = await readConstructionSources(harness);
    const implementationEvents = implementationHistorySources.flatMap(parseHistorySource);
    const implementationCompletionRecord = implementationEvents.find((record) => {
      const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
      return record.type === "construction.stage-attempt-completed" && data?.stage === "implementation";
    });
    if (!implementationCompletionRecord) throw new Error("The successful Implementation completion event is missing from history.");
    const implementationCompletionData = implementationCompletionRecord.data as Record<string, unknown>;
    const assessmentReference = implementationCompletionData.implementation_assessment as Record<string, unknown>;
    const assessmentEventId = String(assessmentReference.assessment_event_id);
    let checkpointEvidenceChanged = false;
    const checkpointMismatchSources = implementationHistorySources.map((source) => encodeHistorySource(source,
      parseHistorySource(source).map((record) => {
        const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
        if (record.type === "construction.evidence-recorded" && data?.stage === "implementation" && data.activity === "code-generation") {
          checkpointEvidenceChanged = true;
          return { ...record, data: { ...data, checkpoints: [] } };
        }
        return record;
      }),
    ));
    expect(checkpointEvidenceChanged).toBe(true);
    const checkpointMismatchProjection = projectConstruction(collectHistoryFromSources(auditFixture.missionId, checkpointMismatchSources, { completeness: "complete" }));
    expect(checkpointMismatchProjection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [String(implementationCompletionRecord.id)],
    }));
    let materialEvidenceChanged = false;
    const materialMismatchSources = implementationHistorySources.map((source) => encodeHistorySource(
      source,
      parseHistorySource(source).map((record) => {
        const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
        if (record.type === "construction.evidence-recorded" && data?.stage === "implementation" &&
            data.stage_attempt_id === implementationAttempt && data.activity === "code-integration") {
          materialEvidenceChanged = true;
          return { ...record, data: { ...data, artifact_bindings: [{ artifact_id: randomUUID(), content_version: "sha256:altered-material" }] } };
        }
        return record;
      }),
    ));
    expect(materialEvidenceChanged).toBe(true);
    const materialMismatchProjection = projectConstruction(collectHistoryFromSources(
      auditFixture.missionId, materialMismatchSources, { completeness: "complete" },
    ));
    expect(materialMismatchProjection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [String(implementationCompletionRecord.id)],
    }));
    const makeProjectionEvent = (type: string, data: Record<string, unknown>, causedBy: readonly string[]) => {
      const candidate = {
        id: randomUUID(), phase: "construction", type, envelope_version: 1, event_version: 1, journal_id: randomUUID(),
        recorded_at: new Date().toISOString(), producer: { name: "kepler-test", version: "0.10.3" }, caused_by: [...causedBy], data,
      };
      const validation = validateConstructionEvent(candidate);
      if (validation.status !== "valid") throw new Error(`Invalid replay fixture: ${JSON.stringify(validation)}`);
      return validation.event;
    };
    const previousIntegrationAttempt = String(activityAttemptIds.get("code-integration"));
    const previousIntegrationCompletion = String(activityCompletionEventIds.get("code-integration"));
    const integrationRevisionId = randomUUID();
    const integrationRevisionInteraction = makeProjectionEvent("construction.interaction-recorded", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation", stage_attempt_id: implementationAttempt,
      task_id: planningTaskId, activity: "code-integration", activity_attempt_id: previousIntegrationAttempt,
      participants: ["Orchestrator"], content: "Reopen Code Integration for the replay guard fixture.", references: ["revision:code-integration"],
    }, [previousIntegrationCompletion]);
    const integrationRevisionAuthorization = makeProjectionEvent("construction.revision-authorized", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation", stage_attempt_id: implementationAttempt,
      task_id: planningTaskId, activity: "code-integration", activity_attempt_id: previousIntegrationAttempt,
      revision_id: integrationRevisionId, orchestrator_decision: "Reopen Code Integration", reason: "Exercise current-attempt replay validation.",
    }, [integrationRevisionInteraction.id]);
    const integrationEnded = makeProjectionEvent("construction.activity-attempt-ended-by-revision", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation", stage_attempt_id: implementationAttempt,
      task_id: planningTaskId, activity: "code-integration", activity_attempt_id: previousIntegrationAttempt,
      revision_id: integrationRevisionId, reason: "End the completed Activity attempt before reopening it.",
    }, [previousIntegrationCompletion, integrationRevisionAuthorization.id]);
    const integrationReopened = makeProjectionEvent("construction.activity-reopened", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation", stage_attempt_id: implementationAttempt,
      task_id: planningTaskId, activity: "code-integration", revision_id: integrationRevisionId,
      reason: "Open a replacement Code Integration attempt.",
    }, [integrationEnded.id, integrationRevisionAuthorization.id]);
    const replacementIntegrationStart = makeProjectionEvent("construction.activity-attempt-started", {
      mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation", stage_attempt_id: implementationAttempt,
      task_id: planningTaskId, activity: "code-integration", activity_attempt_id: randomUUID(), inputs: implementationInputs,
      checkpoints: planningMaterial.checkpoints,
    }, [integrationReopened.id]);
    let assessmentCauseChanged = false;
    const staleActivitySources = implementationHistorySources.map((source) => encodeHistorySource(source,
      parseHistorySource(source).map((record) => {
        if (record.id !== assessmentEventId) return record;
        assessmentCauseChanged = true;
        const causes = Array.isArray(record.caused_by) ? record.caused_by.map(String) : [];
        return { ...record, caused_by: [...new Set([...causes, replacementIntegrationStart.id])] };
      }),
    ));
    expect(assessmentCauseChanged).toBe(true);
    const staleActivityEvents = [integrationRevisionInteraction, integrationRevisionAuthorization, integrationEnded,
      integrationReopened, replacementIntegrationStart];
    const staleActivitySourcesWithAttempt = [
      ...staleActivitySources,
      ...staleActivityEvents.map((record) => ({
        sourceId: `memory://${record.id}`, missionId: auditFixture.missionId, phase: "construction" as const,
        journalId: record.journal_id, bytes: new TextEncoder().encode(`${JSON.stringify(record)}\n`),
      })),
    ];
    const staleActivityProjection = projectConstruction(collectHistoryFromSources(
      auditFixture.missionId, staleActivitySourcesWithAttempt, { completeness: "complete" },
    ));
    expect(staleActivityProjection.projectionIssues).toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [String(implementationCompletionRecord.id)],
    }));
    expect(activityStarts.size).toBe(1);
    expect(activityEvidenceIds).toHaveLength(1);
    const implementationCompletionFirstSources = implementationHistorySources.map((source) => encodeHistorySource(
      source,
      parseHistorySource(source).map((record) => String(record.id) === String(implementationCompletionRecord.id)
        ? { ...record, recorded_at: "0001-01-01T00:00:00.000Z" }
        : record),
    ));
    const implementationCompletionFirstProjection = projectConstruction(collectHistoryFromSources(
      auditFixture.missionId, implementationCompletionFirstSources, { completeness: "complete" },
    ));
    expect(implementationCompletionFirstProjection.projectionIssues).not.toContainEqual(expect.objectContaining({
      code: "invalid-completion-evidence",
      eventIds: [String(implementationCompletionRecord.id)],
    }));
    expect(implementationCompletionFirstProjection.units.find((unit) => unit.unitId === auditFixture.unitId)?.blocked).toBe(false);
    const afterImplementationProjection = projectConstruction(collectHistoryFromSources(
      auditFixture.missionId, implementationHistorySources, { completeness: "complete" },
    ));
    const afterImplementationUnit = afterImplementationProjection.units.find((unit) => unit.unitId === auditFixture.unitId);
    expect(afterImplementationUnit?.blocked, JSON.stringify({
      historyIssues: afterImplementationProjection.historyIssues,
      projectionIssues: afterImplementationProjection.projectionIssues,
      unitProjectionIssues: afterImplementationUnit?.projectionIssues,
    })).toBe(false);
    const completedUnit = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(completedUnit.exitCode).toBe(0);
    const completedUnitData = JSON.parse(completedUnit.stdout).data.unit;
    expect(completedUnitData.stages, JSON.stringify({
      blocked: completedUnitData.blocked,
      historyIssues: completedUnitData.historyIssues,
      projectionIssues: completedUnitData.projectionIssues,
    })).toContainEqual(expect.objectContaining({
      stage: "implementation",
      state: "completed",
    }));
    const reviewStart = await appendStageStart(harness, [
      String(functionalCompletion.result.data.id),
      String(result.result.data.id),
      String(planningResult.result.data.id),
      String(implementationResult.result.data.id),
    ], "unit-of-work-review");
    const reviewEvidence = async (check: string): Promise<string> => {
      const evidenceId = randomUUID();
      await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "unit-of-work-review",
        stage_attempt_id: reviewStart.attemptId,
        evidence_id: evidenceId,
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: planningMaterial.checkpoints,
        inputs: planningMaterial.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current material reviewed for the whole unit" })),
        check,
        executor: "agent:reviewer",
        result: { status: "passed", summary: `${check} passed for the current integrated checkpoint.` },
        output_refs: [`review-report:${check}`],
        conditions: [],
      }, [reviewStart.eventId]);
      return evidenceId;
    };
    const implementationEvidenceAssessmentId = await reviewEvidence("implementation-evidence-assessment");
    const wholeUnitReviewEvidenceId = await reviewEvidence("unit-of-work-review");
    const reviewSelfEvidenceId = await reviewEvidence("unit-of-work-review-self-review");
    const reviewRequest = {
      implementation_completion_event_id: String(implementationResult.result.data.id),
      reviewed_material_bindings: planningMaterial.reviewedBindings,
      final_checkpoints: planningMaterial.checkpoints,
      reviewer: "agent:reviewer",
      implementation_authors: ["agent:builder"],
      implementation_evidence_assessment_id: implementationEvidenceAssessmentId,
      review_evidence_id: wholeUnitReviewEvidenceId,
      self_review_evidence_id: reviewSelfEvidenceId,
      findings: { blocking: [], limitations: [] },
      additional_review: { requested: false },
      acceptance_required: false,
      handoff: { status: "ready", recipient: "deliver", summary: "The independent whole-unit review is ready for Deliver." },
    };
    const beforeReviewerDenial = await audit.journalSnapshot();
    const wrongReviewAttempt = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId, randomUUID(), reviewRequest, "unit-of-work-review",
    );
    expect(wrongReviewAttempt.exitCode).toBe(1);
    expect(wrongReviewAttempt.result).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
    expect(await audit.journalSnapshot()).toBe(beforeReviewerDenial);
    const missingReviewEvidence = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      reviewStart.attemptId,
      { ...reviewRequest, review_evidence_id: randomUUID() },
      "unit-of-work-review",
    );
    expect(missingReviewEvidence.exitCode).toBe(1);
    expect(missingReviewEvidence.result).toMatchObject({ status: "failed", data: { code: "review_evidence_or_findings_invalid" } });
    expect(await audit.journalSnapshot()).toBe(beforeReviewerDenial);
    const nonIndependentReview = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      reviewStart.attemptId,
      { ...reviewRequest, reviewer: "agent:builder" },
      "unit-of-work-review",
    );
    expect(nonIndependentReview.exitCode).toBe(1);
    expect(nonIndependentReview.result).toMatchObject({ status: "failed", data: { code: "invalid_review_completion_request" } });
    expect(await audit.journalSnapshot()).toBe(beforeReviewerDenial);
    const mismatchedAuthors = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      reviewStart.attemptId,
      { ...reviewRequest, implementation_authors: ["agent:other"] },
      "unit-of-work-review",
    );
    expect(mismatchedAuthors.exitCode).toBe(1);
    expect(mismatchedAuthors.result).toMatchObject({ status: "failed", data: { code: "reviewer_not_independent" } });
    expect(await audit.journalSnapshot()).toBe(beforeReviewerDenial);
    const reviewResult = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      reviewStart.attemptId,
      reviewRequest,
      "unit-of-work-review",
    );
    expect(reviewResult.exitCode, JSON.stringify(reviewResult.result)).toBe(0);
    expect(reviewResult.result).toMatchObject({
      status: "success",
      data: { stage: "unit-of-work-review", attempt_id: reviewStart.attemptId },
    });
    const reviewedUnit = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(reviewedUnit.exitCode).toBe(0);
    expect(JSON.parse(reviewedUnit.stdout).data.unit.stages).toContainEqual(expect.objectContaining({
      stage: "unit-of-work-review",
      state: "completed",
    }));
    const deliveryArtifactId = randomUUID();
    const deliveryInstructions = `---\nid: ${deliveryArtifactId}\ntype: delivery-plan\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Delivery plan\n\n## Outcome and destination\n\nHand the reviewed repository to the requester with the selected checkpoint and retained evidence identified.\n\n## Operations and prerequisites\n\nPrepare a handoff package from the reviewed checkpoint and retained evidence. No external service is required.\n\n## Verification and recovery\n\nVerify that the requester can identify the reviewed checkpoint and retained evidence in the package. Preserve handoff references if interrupted.\n\n## Decisions and open questions\n\nThe repository handoff is the agreed outcome. No consequential delivery choice remains open.\n`;
    await Fs.writeFile(Path.join(harness.resources.repositoryDirectory, unitDirectory, "delivery.md"), deliveryInstructions, "utf8");
    harness.resources.runGit(harness.resources.repositoryDirectory, "add", unitDirectory);
    harness.resources.runGit(harness.resources.repositoryDirectory, "commit", "-q", "-m", "Record approved delivery instructions");
    const deliveryCheckpoint = harness.resources.runGit(harness.resources.repositoryDirectory, "rev-parse", "HEAD");
    const deliveryBindings = [
      ...planningMaterial.reviewedBindings,
      { artifact_id: deliveryArtifactId, content_version: `sha256:${createHash("sha256").update(deliveryInstructions, "utf8").digest("hex")}` },
    ];
    const deliveryStart = await appendStageStart(harness, [
      String(functionalCompletion.result.data.id),
      String(result.result.data.id),
      String(planningResult.result.data.id),
      String(implementationResult.result.data.id),
      String(reviewResult.result.data.id),
    ], "deliver");
    const deliveryOutcome = {
      outcome: "repository-handoff",
      requested_outcome: "Hand the reviewed repository to the requester with retained evidence. I authorize preparation of the handoff package.",
      destination: "repository:main",
      recipient: "Requester",
    };
    const outcomeRequest = audit.record("interaction", {
      unit: auditFixture.unitId,
      stage: "deliver",
      attempt: deliveryStart.attemptId,
    }, {
      participants: ["Requester"],
      content: deliveryOutcome.requested_outcome,
      references: ["request:delivery-outcome", "request:prepare-handoff-package"],
      delivery_outcome: deliveryOutcome,
    });
    expect(outcomeRequest.exitCode, JSON.stringify(outcomeRequest.result)).toBe(0);
    const recordDeliveryEvidence = (
      check: string,
      relatedEventIds: readonly string[] = [],
      relatedRequestEventId?: string,
    ) => {
      const evidence = audit.record("evidence", {
        unit: auditFixture.unitId,
        stage: "deliver",
        attempt: deliveryStart.attemptId,
      }, {
        inputs: deliveryBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Reviewed delivery material" })),
        artifact_bindings: deliveryBindings,
        checkpoints: [{ repository_id: repositoryId, commit: deliveryCheckpoint }],
        check,
        executor: "agent:delivery-owner",
        result: { status: "passed", summary: `${check} passed for the selected repository handoff.` },
        output_refs: [`delivery-output:${check}`],
        ...(relatedRequestEventId ? { related_request_event_id: relatedRequestEventId } : {}),
        ...(relatedEventIds.length > 0 ? { related_event_ids: relatedEventIds } : {}),
      });
      expect(evidence.exitCode, JSON.stringify(evidence.result)).toBe(0);
      return { evidenceId: String(evidence.result.data.evidence_id), eventId: String(evidence.result.data.id) };
    };
    const preparation = recordDeliveryEvidence("deliver-preparation");
    const selfReview = recordDeliveryEvidence("deliver-self-review");
    const operation = recordDeliveryEvidence("deliver-operation-result", [], String(outcomeRequest.result.data.id));
    const verification = recordDeliveryEvidence("deliver-outcome-verification", [operation.eventId], String(outcomeRequest.result.data.id));
    const handoff = recordDeliveryEvidence("deliver-recipient-handoff", [preparation.eventId, selfReview.eventId, operation.eventId, verification.eventId]);
    const deliverRequest = {
      review_completion_event_id: String(reviewResult.result.data.id),
      outcome_request_event_id: String(outcomeRequest.result.data.id),
      ...deliveryOutcome,
      artifact_bindings: deliveryBindings,
      reviewed_checkpoints: planningMaterial.checkpoints,
      preparation_evidence_id: preparation.evidenceId,
      self_review_evidence_id: selfReview.evidenceId,
      operation_results: [{
        operation: "Prepare the reviewed repository handoff package",
        status: "succeeded",
        evidence_id: operation.evidenceId,
        source_checkpoints: planningMaterial.checkpoints,
        authority: { kind: "requester-instruction", event_id: String(outcomeRequest.result.data.id) },
      }],
      verification_evidence_ids: [verification.evidenceId],
      handoff_evidence_id: handoff.evidenceId,
      additional_review: { requested: false },
      approval_required: false,
      handoff: { status: "ready", summary: "The requester received the reviewed repository, prepared package, and retained evidence." },
    };
    const deliverDriver = new StageCompletionCliDriver(harness.cli);
    const beforeOutcomeMismatch = await audit.journalSnapshot();
    const mismatchedOutcome = deliverDriver.complete(auditFixture.unitId, deliveryStart.attemptId, {
      ...deliverRequest,
      outcome: "deployment",
    }, "deliver");
    expect(mismatchedOutcome.exitCode).toBe(1);
    expect(mismatchedOutcome.result).toMatchObject({ status: "failed", data: { code: "deliver_outcome_request_invalid" } });
    expect(await audit.journalSnapshot()).toBe(beforeOutcomeMismatch);
    const deliveryResult = deliverDriver.complete(auditFixture.unitId, deliveryStart.attemptId, deliverRequest, "deliver");
    expect(deliveryResult.exitCode, JSON.stringify(deliveryResult.result)).toBe(0);
    expect(deliveryResult.result).toMatchObject({
      status: "success",
      data: { stage: "deliver", attempt_id: deliveryStart.attemptId, outcome: "repository-handoff" },
    });
    const deliveredUnit = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(deliveredUnit.exitCode).toBe(0);
    const deliveredUnitData = JSON.parse(deliveredUnit.stdout).data.unit;
    expect(deliveredUnitData.blocked).toBe(false);
    expect(deliveredUnitData.stages).toContainEqual(expect.objectContaining({ stage: "deliver", state: "completed" }));
    const deliveredHistory = await readConstructionSources(harness);
    const outcomeRequestId = String(outcomeRequest.result.data.id);
    const invalidAuthorityHistory = rewriteHistoryEvent(deliveredHistory, outcomeRequestId, (event) => ({
      ...event,
      data: { ...(event.data as Record<string, unknown>), references: [] },
    }));
    const invalidAuthorityProjection = projectConstruction(collectHistoryFromSources(auditFixture.missionId, invalidAuthorityHistory, { completeness: "complete" }));
    expect(invalidAuthorityProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-completion-evidence");
    expect(invalidAuthorityProjection.units[0]?.blocked).toBe(true);
    const verificationBeforeOutcomeHistory = rewriteHistoryEvent(deliveredHistory, verification.eventId, (event) => ({
      ...event,
      caused_by: (event.caused_by as string[]).filter((cause) => cause !== outcomeRequestId),
    }));
    const verificationBeforeOutcomeProjection = projectConstruction(collectHistoryFromSources(auditFixture.missionId, verificationBeforeOutcomeHistory, { completeness: "complete" }));
    expect(verificationBeforeOutcomeProjection.projectionIssues.map((issue) => issue.code)).toContain("invalid-completion-evidence");
    expect(verificationBeforeOutcomeProjection.units[0]?.blocked).toBe(true);
  }, 240_000);

  it("rejects a Quality Requirements attempt without Functional Design authority in completion and replay", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const unauthorizedStart = await appendStageStart(harness, undefined, "quality-requirements");
    const functionalMaterial = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const functionalEvidence = recordEvidence(audit, auditFixture.stageAttemptId, functionalMaterial);
    const functionalApproval = recordApproval(audit, functionalMaterial);
    const functionalCompletion = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(functionalEvidence, functionalApproval),
    );
    expect(functionalCompletion.exitCode, JSON.stringify(functionalCompletion.result)).toBe(0);
    const qualityMaterial = await createQualityArtifacts(harness);
    const qualityEvidence = recordQualityEvidence(audit, unauthorizedStart.attemptId, qualityMaterial);
    const qualityApproval = recordQualityApproval(audit, unauthorizedStart.attemptId, qualityMaterial);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      unauthorizedStart.attemptId,
      qualityCompletionRequest(qualityEvidence, qualityApproval),
      "quality-requirements",
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "quality_stage_start_authority_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
    await appendForgedQualityCompletion(
      harness,
      audit,
      unauthorizedStart.attemptId,
      unauthorizedStart.eventId,
      functionalMaterial,
      qualityMaterial,
      qualityEvidence,
      qualityApproval,
    );
    const shown = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(shown.exitCode).toBe(0);
    const projection = JSON.parse(shown.stdout).data.unit;
    expect(projection.blocked).toBe(true);
    expect(projection.stages).toContainEqual(expect.objectContaining({ stage: "quality-requirements", state: "unknown" }));
  }, 120_000);

  it("denies external-review evidence recorded before the requester request", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const functionalMaterial = await createProjectArtifacts(harness);
    const audit = createAuditDriver(harness);
    const functionalEvidence = recordEvidence(audit, auditFixture.stageAttemptId, functionalMaterial);
    const functionalApproval = recordApproval(audit, functionalMaterial);
    const functionalCompletion = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      auditFixture.stageAttemptId,
      completionRequest(functionalEvidence, functionalApproval),
    );
    expect(functionalCompletion.exitCode, JSON.stringify(functionalCompletion.result)).toBe(0);
    const qualityStart = await appendStageStart(harness, String(functionalCompletion.result.data.id), "quality-requirements");
    const qualityAttempt = qualityStart.attemptId;
    const qualityMaterial = await createQualityArtifacts(harness);
    const qualityEvidence = recordQualityEvidence(audit, qualityAttempt, qualityMaterial);
    const externalReviewEvidence = recordQualityExternalReviewEvidence(audit, qualityAttempt, qualityMaterial);
    const qualityApproval = recordQualityApproval(audit, qualityAttempt, qualityMaterial);
    const requestEvent = audit.record("interaction", {
      unit: auditFixture.unitId,
      stage: "quality-requirements",
      attempt: qualityAttempt,
    }, {
      participants: ["Requester"],
      content: "Please obtain an independent review of the current quality requirements.",
      references: ["quality.md"],
    });
    expect(requestEvent.exitCode, JSON.stringify(requestEvent.result)).toBe(0);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      qualityAttempt,
      qualityCompletionRequest(qualityEvidence, qualityApproval, {
        requestEventId: String(requestEvent.result.data.id),
        evidenceId: externalReviewEvidence,
      }),
      "quality-requirements",
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "quality_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
    await appendForgedQualityCompletion(
      harness,
      audit,
      qualityAttempt,
      qualityStart.eventId,
      functionalMaterial,
      qualityMaterial,
      qualityEvidence,
      qualityApproval,
      { requestEventId: String(requestEvent.result.data.id), evidenceId: externalReviewEvidence },
    );
    const shown = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(shown.exitCode).toBe(0);
    const projection = JSON.parse(shown.stdout).data.unit;
    expect(projection.blocked).toBe(true);
    expect(projection.stages).toContainEqual(expect.objectContaining({ stage: "quality-requirements", state: "unknown" }));
  }, 120_000);
});
