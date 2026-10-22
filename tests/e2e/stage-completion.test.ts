import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { StageCompletionCliDriver } from "./driver/stage-completion-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, createAuditHistory } from "./fixtures/histories/audit.js";
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
  stage: "quality-requirements" | "implementation-planning",
): Promise<{ readonly attemptId: string; readonly eventId: string }> => {
  const stageAttemptId = randomUUID();
  const eventId = randomUUID();
  const journalId = randomUUID();
  const authorityIds = authorityEventIds === undefined ? [] : typeof authorityEventIds === "string" ? [authorityEventIds] : [...authorityEventIds];
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

const qualityCompletionRequest = (
  evidenceIds: Readonly<Record<string, string>>,
  approvalEventId: string,
  externalReview?: { readonly requestEventId: string; readonly evidenceId: string },
): Record<string, unknown> => ({
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

const planningCompletionRequest = (
  material: Awaited<ReturnType<typeof createPlanningArtifacts>>,
  evidenceIds: Readonly<Record<string, string>>,
): Record<string, unknown> => ({
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

  it("completes Quality Requirements through the stage CLI and projects it complete", async () => {
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
    const requestEvent = audit.record("interaction", {
      unit: auditFixture.unitId,
      stage: "quality-requirements",
      attempt: qualityAttempt,
    }, {
      participants: ["requester"],
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
  }, 120_000);

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
      participants: ["requester"],
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
