import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { StageCompletionCliDriver } from "./driver/stage-completion-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, configureAuditFixture, createAuditHistory, resetAuditFixture, type AuditFixture } from "./fixtures/histories/audit.js";
import { collectHistory as collectHistoryFromSources, type HistoryJournalSource } from "../../packages/cli/src/history/collection.js";
import { projectConstruction } from "../../packages/cli/src/construction/projection.js";
import { validateConstructionEvent } from "../../packages/cli/src/construction/events.js";

const harnesses: E2EHarness[] = [];
let unitDirectory = `.kepler/missions/${auditFixture.missionId}/construction/units-of-work/${auditFixture.unitId}`;
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
const planningSecondTaskId = "c4000000-0000-4000-8000-000000000004";

const projectArtifactSources = (unitId: string) => ({
  "unit-of-work.md": `---\nid: ${artifactIds["unit-of-work.md"]}\ntype: unit-of-work\nschema_version: 3\nunit_id: ${unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Unit of Work\n\n## Purpose\n\nMake the selected workflow behavior explicit.\n\n## Scope\n\nInclude the Functional Design contract.\n\n## Context\n\nKeep the current public behavior and constraints.\n`,
  "design.md": `---\nid: ${artifactIds["design.md"]}\ntype: functional-design\nschema_version: 3\nunit_id: ${unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Design\n\n## Domain behavior\n\nThe result preserves the current contract and provides observable behavior.\n\n## Domain model\n\nThe model is described in [supporting detail](details/functional-design/domain-model.md).\n\n## Boundaries and interactions\n\nThe selected unit owns its functional behavior.\n\n## Design decisions and open questions\n\nNo unresolved material questions remain.\n`,
  "details/functional-design/domain-model.md": `---\nid: ${artifactIds["details/functional-design/domain-model.md"]}\ntype: supporting-document\nschema_version: 3\nunit_id: ${unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Domain model detail\n\nThe model preserves the current contract.\n`,
} as const);

const createProjectArtifacts = async (harness: E2EHarness) => {
  const root = harness.resources.repositoryDirectory;
  const unitRoot = Path.join(root, unitDirectory);
  await Fs.mkdir(Path.join(unitRoot, "details", "functional-design"), { recursive: true });
  const artifactBindings = [] as Array<{ artifact_id: string; content_version: string }>;
  for (const [relativePath, source] of Object.entries(projectArtifactSources(auditFixture.unitId))) {
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

const historyData = (record: Record<string, unknown>): Record<string, unknown> =>
  typeof record.data === "object" && record.data !== null && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};

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
  options: { readonly executableIntegrationCommands?: boolean } = {},
) => {
  const root = harness.resources.repositoryDirectory;
  const unitRoot = Path.join(root, unitDirectory);
  const useExecutableCommands = options.executableIntegrationCommands ?? false;
  const typecheckCommand = (file: string) => useExecutableCommands
    ? `repo-main: bun run ./node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --typeRoots ./node_modules/@types --types node src/access.ts ${file}`
    : "repo-main: bun run build";
  const buildCommand = useExecutableCommands ? "repo-main: bun build src/access.ts --outdir .kepler-e2e-build" : "repo-main: bun run build";
  const buildMethod = useExecutableCommands ? "Build the access policy with" : "Build with";
  const buildExpected = useExecutableCommands ? "The access policy builds successfully." : "The project build passes.";
  const testCommand = (file: string) => useExecutableCommands ? `repo-main: bun run ${file}` : "repo-main: bun run test";
  const planSource = `---\nid: ${planningArtifactId}\ntype: implementation-plan\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Implementation plan\n\n## Technical solution\n\nEnforce owning-user access at the data boundary because this keeps the security rule testable.\n\n## Task graph context\n\nThe task decomposition is recorded in [tasks-dag.json](tasks-dag.json).\n\n## Verification strategy\n\nTypecheck the owner policy and baseline test with \`${typecheckCommand("tests/access-check.ts")}\`. Typecheck regression coverage with \`${typecheckCommand("tests/access-regression.ts")}\`.\n\n${buildMethod} \`${buildCommand}\`. Run the full test suite for the owner policy with \`${testCommand("tests/access-check.ts")}\`. Run the full test suite for regression coverage with \`${testCommand("tests/access-regression.ts")}\`.\n\n## Decisions and open questions\n\nThe task owns the access-policy implementation; no consequential decisions remain open.\n`;
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
      outputs: ["src/access.ts"],
      acceptance_criteria: ["A non-owner receives an access-denied result."],
      guidance: ["Keep the policy at the data boundary."],
      verification: [
        { scope: "typecheck", method: `Typecheck owner policy with \`${typecheckCommand("tests/access-check.ts")}\`.`, expected_result: "Typechecking passes." },
        { scope: "build", method: `${buildMethod} \`${buildCommand}\`.`, expected_result: buildExpected },
        { scope: "full-test-suite", method: `Run the full test suite with \`${testCommand("tests/access-check.ts")}\`.`, expected_result: "The owner policy tests pass." },
        { scope: "unit", method: "Run the access-policy unit test", expected_result: "A non-owner is denied." },
      ],
      depends_on: [],
      prerequisites: [],
    }, {
      id: planningSecondTaskId,
      title: "Record access-policy regression coverage",
      goal: "Keep evidence that owner-scoped reads deny another user's access.",
      inputs: [{ reference: `artifact:${qualityArtifactIds["details/quality-requirements/security.md"]}`, purpose: "Accepted security requirement" }],
      outputs: ["tests/access-regression.ts"],
      acceptance_criteria: ["A non-owner receives an access-denied result."],
      guidance: ["Keep the regression check tied to the access policy."],
      verification: [
        { scope: "typecheck", method: `Typecheck regression coverage with \`${typecheckCommand("tests/access-regression.ts")}\`.`, expected_result: "Typechecking passes." },
        { scope: "build", method: `${buildMethod} \`${buildCommand}\`.`, expected_result: buildExpected },
        { scope: "full-test-suite", method: `Run the full test suite with \`${testCommand("tests/access-regression.ts")}\`.`, expected_result: "The regression tests pass." },
        { scope: "unit", method: "Run the access-policy unit test", expected_result: "A non-owner is denied." },
      ],
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
  const taskContracts = graph.tasks.map((task) => ({
    outputs: task.outputs,
    acceptance_criteria: task.acceptance_criteria,
    dependency_task_ids: [],
    implementation_prerequisites: [],
  }));
  return {
    artifactBindings: [planBinding],
    reviewedBindings,
    inputBindings,
    checkpoints: [{ repository_id: repositoryId, commit }],
    graphRef: { graph_id: planningGraphId, content_version: `sha256:${createHash("sha256").update(graphSource, "utf8").digest("hex")}` },
    graphSource,
    planSource,
    taskIds: [planningTaskId, planningSecondTaskId],
    taskContracts,
    verificationObligations: graph.tasks.flatMap((task) => task.verification.map((verification) =>
      `task:${task.id} ${verification.scope}: ${verification.method}; expected: ${verification.expected_result}`,
    )),
    taskContract: taskContracts[0]!
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
      task_reviews: material.taskIds.map((taskId) => ({
        task_id: taskId,
        inputs_relevant: true,
        outputs_explicit: true,
        acceptance_testable: true,
        dependency_reasons_justified: true,
        prerequisites_conditioned: true,
        verification_feasible: true,
        rationale: "The task has explicit input, output, acceptance, and verification contracts.",
      })),
      obligation_coverage: [{
        reference: "quality.md#security",
        disposition: "planned",
        task_ids: material.taskIds,
        rationale: "The tasks implement the accepted owner-scoped access rule and its regression coverage.",
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
      verification_obligations: material.verificationObligations,
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

const runCliWithExeca = (harness: E2EHarness, args: readonly string[]) => execa(
  process.execPath,
  [Path.resolve(import.meta.dirname, "../../packages/cli/dist/cli/main.js"), ...args],
  {
    cwd: harness.resources.repositoryDirectory,
    env: harness.resources.environment(),
    extendEnv: false,
    reject: false,
    timeout: 30_000,
  },
);

const runCliThenInterruptCoordinator = (harness: E2EHarness, args: readonly string[], input?: string) => {
  const cliInvocation = [Path.resolve(import.meta.dirname, "../../packages/cli/dist/cli/main.js"), ...args];
  const inputLiteral = input === undefined ? "undefined" : JSON.stringify(input);
  const script = [
    'const { spawnSync } = require("node:child_process");',
    `const childInput = ${inputLiteral};`,
    `const child = spawnSync(process.execPath, ${JSON.stringify(cliInvocation)}, { cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 16_000_000, ...(childInput === undefined ? {} : { input: childInput }) });`,
    'if (child.error || child.status !== 0) { process.stderr.write(child.stderr ?? child.error?.message ?? ""); process.exit(child.status ?? 1); }',
    'process.kill(process.pid, "SIGKILL");',
  ].join("\n");
  return execa(process.execPath, ["-e", script], {
    cwd: harness.resources.repositoryDirectory,
    env: harness.resources.environment(),
    extendEnv: false,
    reject: false,
    timeout: 30_000,
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
  resetAuditFixture();
  unitDirectory = `.kepler/missions/${auditFixture.missionId}/construction/units-of-work/${auditFixture.unitId}`;
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

  it("recovers interrupted Integration through the CLI and completes Standard stages through Deliver", async () => {
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
    if (missingEvidence.result.data?.code !== "planning_evidence_invalid") throw new Error(JSON.stringify(missingEvidence.result));
    await Fs.writeFile(Path.join(harness.resources.repositoryDirectory, unitDirectory, "plan.md"), `${planningMaterial.planSource}\nThe current material changed after its evidence was recorded.\n`, "utf8");
    const staleMaterial = planningDriver.complete(auditFixture.unitId, planningAttempt, planningRequest, "implementation-planning");
    expect(staleMaterial.exitCode).toBe(1);
    if (staleMaterial.result.data?.code !== "planning_evidence_invalid") throw new Error(JSON.stringify(staleMaterial.result));
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
      task_contract: planningMaterial.taskContract,
      admission_baseline: [{ repository_id: repositoryId, commit: "checkpoint-start" }], predecessor_provenance: [], prerequisite_evidence: [],
    }, [previousImplementationStart.eventId, String(planningResult.result.data.id), auditFixture.baselineEventId]);
    const previousActivityChecks = {
      "code-generation": ["code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review"],
      "code-validation": ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite",
        "code-validation-independent-review", "code-validation-self-review"],
      "code-integration": ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite",
        "code-integration-self-review"],
    } as const;
    const integrationCheckCommands = {
      "code-integration-typecheck": { repository_id: repositoryId, executable: "bun", argv: ["run", "build"] },
      "code-integration-build": { repository_id: repositoryId, executable: "bun", argv: ["run", "build"] },
      "code-integration-full-test-suite": { repository_id: repositoryId, executable: "bun", argv: ["run", "test"] },
    } as const;
    const previousActivityExecutors = { "code-generation": "agent:builder", "code-validation": "agent:verifier", "code-integration": "agent:integrator" } as const;
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
          candidate_checkpoints: planningMaterial.checkpoints, task_output_refs: planningMaterial.taskContract.outputs,
          source_evidence_ids: sourceEvidence ? [sourceEvidence.evidenceId] : [], inputs: implementationInputs,
        }, [started.id, previousImplementationAdmission.id, ...(priorCompletionId ? [priorCompletionId] : []), ...(sourceEvidence ? [sourceEvidence.eventId] : [])]);
        preparedId = prepared.id;
      }
      const evidenceRecords: { readonly evidenceId: string; readonly eventId: string; readonly check: string }[] = [];
      for (const check of previousActivityChecks[activity]) {
        const evidenceId = randomUUID();
        const executor = check === "code-validation-independent-review" ? "agent:reviewer" : previousActivityExecutors[activity];
        const evidence = await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
          mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
          stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
          activity_attempt_id: activityAttemptId, evidence_id: evidenceId,
          artifact_bindings: planningMaterial.reviewedBindings, checkpoints: planningMaterial.checkpoints,
          inputs: implementationInputs, check, executor,
          result: { status: "passed", summary: `${check} passed for the current output.` },
          output_refs: planningMaterial.taskContract.outputs,
          conditions: check === "code-integration-self-review"
            ? ["Integration bindings match the accepted candidate and actual inputs.", ...planningMaterial.taskContract.acceptance_criteria]
            : [],
          ...(activity === "code-integration" && check !== "code-integration-self-review" ? {
            check_command: integrationCheckCommands[check as keyof typeof integrationCheckCommands],
          } : {}),
          ...(activity === "code-generation" || activity === "code-validation" ? {
            worker_context_id: check === "code-validation-independent-review" ? `${activityAttemptId}:reviewer` : `${activityAttemptId}:worker`,
          } : {}),
        }, [started.id, ...(preparedId ? [preparedId] : [])]);
        evidenceRecords.push({ evidenceId, eventId: evidence.id, check });
      }
      let integrationEventId: string | undefined;
      if (activity === "code-integration") {
        const repositoryEvidence = evidenceRecords.filter((item) => item.check !== "code-integration-self-review");
        const selfReview = evidenceRecords.find((item) => item.check === "code-integration-self-review")!;
        const accepted = await appendTypedConstructionEvent(harness, "construction.integration-accepted", {
          mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
          stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
          activity_attempt_id: activityAttemptId, prepared_event_id: preparedId,
          candidate_checkpoints: planningMaterial.checkpoints,
          repository_results: [{ repository_id: repositoryId, evidence_ids: repositoryEvidence.map((item) => item.evidenceId) }],
          authority_event_ids: [selfReview.eventId],
        }, [String(preparedId), ...evidenceRecords.map((item) => item.eventId)]);
        integrationEventId = accepted.id;
      }
      const evidenceIds = evidenceRecords.map((item) => item.evidenceId);
      const completed = await appendTypedConstructionEvent(harness, "construction.activity-attempt-completed", {
        mission_id: auditFixture.missionId, unit_id: auditFixture.unitId, stage: "implementation",
        stage_attempt_id: previousImplementationStart.attemptId, task_id: planningTaskId, activity,
        activity_attempt_id: activityAttemptId, evidence_ids: evidenceIds, checkpoints: planningMaterial.checkpoints,
      }, [started.id, ...evidenceRecords.map((item) => item.eventId), ...(integrationEventId ? [integrationEventId] : [])]);
      return { activityAttemptId, evidenceId: evidenceIds[0]!, evidenceIds, evidenceEventId: evidenceRecords[0]!.eventId,
        completionId: completed.id, integrationEventId };
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
      inputs: [{ reference: "revision:implementation", purpose: "Feedback identifying the required return" }],
      stage: "implementation", stage_attempt_id: previousImplementationStart.attemptId,
      affected_scopes: [{ kind: "stage", stage: "implementation", prior_attempt: "present", stage_attempt_id: previousImplementationStart.attemptId }],
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
    const retainedAssessmentRequest = { assessments: [{
      task_id: planningTaskId, activity: "code-generation", original_stage_attempt_id: previousImplementationStart.attemptId,
      original_activity_attempt_id: previousCodeGeneration.activityAttemptId, original_evidence_ids: previousCodeGeneration.evidenceIds,
      applicable: true, reason: "Generation output remains valid for the unchanged task graph.", checkpoints: planningMaterial.checkpoints,
    }] };
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
    const beforeUnknownPrerequisite = await audit.journalSnapshot();
    const unknownPrerequisite = harness.cli.run([
      "workflow", "construction", "task", "admit", "--unit", auditFixture.unitId, "--task", planningTaskId,
      "--implementation-attempt", implementationAttempt, "--prerequisites",
      JSON.stringify({ prerequisite_evidence_ids: [randomUUID()] }),
    ]);
    expect(unknownPrerequisite.exitCode).toBe(1);
    expect(JSON.parse(unknownPrerequisite.stdout)).toMatchObject({ status: "failed", data: { code: "task_prerequisite_unverified" } });
    expect(await audit.journalSnapshot()).toBe(beforeUnknownPrerequisite);
    const firstAdmissionProcess = await runCliWithExeca(harness, [
      "workflow", "construction", "task", "admit", "--unit", auditFixture.unitId, "--task", planningTaskId,
      "--implementation-attempt", implementationAttempt,
    ]);
    const secondAdmissionProcess = await runCliWithExeca(harness, [
      "workflow", "construction", "task", "admit", "--unit", auditFixture.unitId, "--task", planningSecondTaskId,
      "--implementation-attempt", implementationAttempt,
    ]);
    const firstAdmissionResult = JSON.parse(firstAdmissionProcess.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
    const secondAdmissionResult = JSON.parse(secondAdmissionProcess.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
    expect(firstAdmissionProcess.exitCode, JSON.stringify(firstAdmissionResult)).toBe(0);
    const stateBeforeSecondAdmission = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    const stateBeforeSecondAdmissionData = stateBeforeSecondAdmission.exitCode === 0
      ? JSON.parse(stateBeforeSecondAdmission.stdout).data.unit
      : { exitCode: stateBeforeSecondAdmission.exitCode, stderr: stateBeforeSecondAdmission.stderr };
    expect(secondAdmissionProcess.exitCode, JSON.stringify({ result: secondAdmissionResult, unit: stateBeforeSecondAdmissionData })).toBe(0);
    expect(firstAdmissionResult).toMatchObject({
      status: "success",
      data: { task_id: planningTaskId, implementation_attempt_id: implementationAttempt },
    });
    expect(secondAdmissionResult).toMatchObject({
      status: "success",
      data: { task_id: planningSecondTaskId, implementation_attempt_id: implementationAttempt },
    });
    const admissionEventId = String(firstAdmissionResult.data.admission_event_id);
    const secondAdmissionEventId = String(secondAdmissionResult.data.admission_event_id);
    expect(secondAdmissionEventId).not.toBe(admissionEventId);
    const activityNames = ["code-generation", "code-validation", "code-integration"] as const;
    const activityExecutors = { "code-generation": "agent:builder", "code-validation": "agent:verifier", "code-integration": "agent:integrator" } as const;
    const activityChecks = {
      "code-generation": ["code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review"],
      "code-validation": ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite",
        "code-validation-independent-review", "code-validation-self-review"],
      "code-integration": ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite",
        "code-integration-self-review"],
    } as const;
    const runConstructionCli = async (args: readonly string[]) => {
      const process = await runCliWithExeca(harness, args);
      const response = JSON.parse(process.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
      expect(process.exitCode, JSON.stringify(response)).toBe(0);
      expect(response.status, JSON.stringify(response)).toBe("success");
      return response.data;
    };
    const startGeneration = (taskId: string) => runConstructionCli([
      "workflow", "construction", "activity", "start", "--unit", auditFixture.unitId,
      "--task", taskId, "--activity", "code-generation", "--implementation-attempt", implementationAttempt,
    ]);
    const secondGenerationStart = await startGeneration(planningSecondTaskId);
    expect(secondGenerationStart.worker_dispatched).toBe(false);
    const secondGenerationState = await runConstructionCli([
      "workflow", "construction", "activity", "show", "--unit", auditFixture.unitId,
      "--task", planningSecondTaskId, "--activity", "code-generation", "--implementation-attempt", implementationAttempt,
    ]);
    expect(secondGenerationState.state).toBe("running");
    const runTaskRoute = async (
      taskId: string,
      taskContract: typeof planningMaterial.taskContract,
      generationStart: Readonly<Record<string, unknown>> | undefined,
    ) => {
      const evidenceIds: string[] = [];
      const starts = new Map<string, string>();
      const attempts = new Map<string, string>();
      const completions = new Map<string, string>();
      let integrationEventId = "";
      for (const activity of activityNames) {
        if (activity === "code-generation" && !generationStart) continue;
        const started = activity === "code-generation" ? generationStart! : await runConstructionCli([
          "workflow", "construction", "activity", "start", "--unit", auditFixture.unitId,
          "--task", taskId, "--activity", activity, "--implementation-attempt", implementationAttempt,
        ]);
        const activityAttemptId = String(started.activity_attempt_id);
        const startEventId = String(started.event_id);
        const inputs = started.inputs as readonly { readonly reference: string; readonly purpose: string }[];
        const checkpoints = started.checkpoints as readonly { readonly repository_id: string; readonly commit: string }[];
        let lifecycleStartEventId = startEventId;
        if (taskId === planningTaskId && activity === "code-validation") {
          const activityScope = ["--unit", auditFixture.unitId, "--task", taskId, "--activity", activity,
            "--implementation-attempt", implementationAttempt, "--attempt", activityAttemptId];
          await runConstructionCli([
            "workflow", "construction", "activity", "pause", ...activityScope,
            "--request", JSON.stringify({ phase: "request", reason: "Pause Validation before recording its checks." }),
          ]);
          await runConstructionCli([
            "workflow", "construction", "activity", "pause", ...activityScope,
            "--request", JSON.stringify({
              phase: "acknowledge",
              reason: "Validation worker stopped and its effects were reconciled.",
              orchestrator_attestation: {
                exact_run_terminal: true,
                effects_reconciled: true,
                run_reference: `orchestrator-run:${activityAttemptId}`,
                reconciliation_references: [`effects:${activityAttemptId}`, `workspace:${activityAttemptId}`],
              },
            }),
          ]);
          const resumed = await runConstructionCli([
            "workflow", "construction", "activity", "resume", ...activityScope,
            "--request", JSON.stringify({ inputs }),
          ]);
          expect(resumed.attempt_id).toBe(activityAttemptId);
          lifecycleStartEventId = String(resumed.id);
        }
        starts.set(activity, lifecycleStartEventId);
        attempts.set(activity, activityAttemptId);
        let interruptedRecovery = false;
        const currentEvidenceIds: string[] = [];
        const activityEvidence = activity === "code-integration"
          ? activityChecks[activity].map((check) => ({ check }))
          : activityChecks[activity].map((check) => {
            const record = audit.record("evidence", {
              unit: auditFixture.unitId,
              stage: "implementation",
              task: taskId,
              activity,
              implementationAttempt,
              attempt: activityAttemptId,
            }, {
              artifact_bindings: planningMaterial.reviewedBindings,
              checkpoints,
              inputs,
              check,
              executor: check === "code-validation-independent-review" ? activityExecutors["code-generation"] : activityExecutors[activity],
              worker_context_id: check === "code-validation-independent-review" ? `${activityAttemptId}:reviewer` : `${activityAttemptId}:worker`,
              result: { status: "passed", summary: `${check} passed for the current task candidate.` },
              output_refs: taskContract.outputs,
              conditions: [],
            });
            expect(record.exitCode, record.stdout).toBe(0);
            expect(record.result.status, JSON.stringify(record.result)).toBe("success");
            const evidenceId = String(record.result.data.evidence_id);
            currentEvidenceIds.push(evidenceId);
            return { evidenceId, eventId: String(record.result.data.id), check };
          });
        if (activity !== "code-integration") evidenceIds.push(currentEvidenceIds[0]!);
        if (activity === "code-integration") {
          const integrationScope = [
            "--unit", auditFixture.unitId, "--task", taskId, "--activity", activity,
            "--implementation-attempt", implementationAttempt, "--attempt", activityAttemptId,
          ];
          const lock = await runConstructionCli(["workflow", "construction", "integration", "lock", ...integrationScope]);
          const lockToken = String(lock.lock_token);
          const prepared = await runConstructionCli([
            "workflow", "construction", "integration", "prepare", ...integrationScope,
            "--lock-token", lockToken,
            "--request", JSON.stringify({ captured_inputs: lock.captured_inputs, candidate_checkpoints: checkpoints }),
          ]);
          const preparedEventId = String(prepared.prepared_event_id);
          for (const item of activityEvidence) {
            const selfReview = !Object.hasOwn(integrationCheckCommands, item.check);
            const check = item.check as keyof typeof integrationCheckCommands;
            const recorded = await runConstructionCli([
              "workflow", "construction", "integration", "evidence", ...integrationScope,
              "--lock-token", lockToken,
              "--request", JSON.stringify({
                prepared_event_id: preparedEventId,
                check,
                executor: activityExecutors[activity],
                result: { status: "passed", summary: `${check} passed for the immutable candidate.` },
                ...(selfReview ? {} : { check_command: integrationCheckCommands[check] }),
                output_refs: taskContract.outputs,
                conditions: selfReview
                  ? ["Integration bindings match the accepted candidate and actual inputs.", ...taskContract.acceptance_criteria]
                  : [],
              }),
            ]);
            currentEvidenceIds.push(String(recorded.evidence_id));
          }
          evidenceIds.push(currentEvidenceIds[0]!);
          const acceptArgs = [
            "workflow", "construction", "integration", "accept", ...integrationScope,
            "--lock-token", lockToken, "--prepared-event-id", preparedEventId,
          ];
          if (taskId === planningTaskId) {
            const interruptedCoordinator = await runCliThenInterruptCoordinator(harness, acceptArgs);
            expect(interruptedCoordinator.signal).toBe("SIGKILL");
            const interruptionHistory = (await readConstructionSources(harness)).flatMap(parseHistorySource);
            const acceptanceEvents = interruptionHistory.filter((record) => record.type === "construction.integration-accepted" &&
              historyData(record).stage_attempt_id === implementationAttempt && historyData(record).task_id === taskId &&
              historyData(record).activity_attempt_id === activityAttemptId);
            const activityCompletions = interruptionHistory.filter((record) => record.type === "construction.activity-attempt-completed" &&
              historyData(record).stage_attempt_id === implementationAttempt && historyData(record).task_id === taskId &&
              historyData(record).activity_attempt_id === activityAttemptId);
            const taskCompletions = interruptionHistory.filter((record) => record.type === "construction.task-completed" &&
              historyData(record).stage_attempt_id === implementationAttempt && historyData(record).task_id === taskId);
            expect(acceptanceEvents).toHaveLength(1);
            expect(activityCompletions).toHaveLength(0);
            expect(taskCompletions).toHaveLength(0);
            const recoveredActivity = harness.cli.run([
              "workflow", "construction", "activity", "show", "--unit", auditFixture.unitId,
              "--task", taskId, "--activity", activity, "--implementation-attempt", implementationAttempt,
            ]);
            expect(recoveredActivity.exitCode, recoveredActivity.stdout).toBe(0);
            expect(JSON.parse(recoveredActivity.stdout)).toMatchObject({
              status: "success",
              data: { state: "running", current_attempt_id: activityAttemptId },
            });
            const beforeDuplicateStart = await audit.journalSnapshot();
            const duplicateStart = harness.cli.run([
              "workflow", "construction", "activity", "start", "--unit", auditFixture.unitId,
              "--task", taskId, "--activity", activity, "--implementation-attempt", implementationAttempt,
            ]);
            expect(duplicateStart.exitCode).toBe(1);
            expect(JSON.parse(duplicateStart.stdout)).toMatchObject({
              status: "failed", data: { code: "activity_attempt_already_active" },
            });
            expect(await audit.journalSnapshot()).toBe(beforeDuplicateStart);
            integrationEventId = String(acceptanceEvents[0]!.id);
            interruptedRecovery = true;
          } else {
            const accepted = await runConstructionCli(acceptArgs);
            integrationEventId = String(accepted.integration_event_id);
          }
        }
        const completionArgs = [
          "workflow", "construction", "activity", "complete", "--unit", auditFixture.unitId,
          "--task", taskId, "--activity", activity, "--implementation-attempt", implementationAttempt,
          "--attempt", activityAttemptId, "--evidence", JSON.stringify({ evidence_ids: currentEvidenceIds }),
        ];
        if (activity === "code-validation") {
          const reviewerEvidence = activityEvidence.find((item) => item.check === "code-validation-independent-review");
          if (!reviewerEvidence || !("evidenceId" in reviewerEvidence)) throw new Error("The Validation independent-review evidence is missing.");
          const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
          let reviewerJournalPath: string | undefined;
          let reviewerJournalLines: string[] | undefined;
          let reviewerLineIndex = -1;
          for (const name of await Fs.readdir(historyDirectory)) {
            if (!name.endsWith(".jsonl")) continue;
            const candidatePath = Path.join(historyDirectory, name);
            const lines = (await Fs.readFile(candidatePath, "utf8")).trim().split("\n");
            const index = lines.findIndex((line) => {
              const event = JSON.parse(line) as Record<string, unknown>;
              const data = event.data && typeof event.data === "object" && !Array.isArray(event.data)
                ? event.data as Record<string, unknown>
                : undefined;
              return data?.evidence_id === reviewerEvidence.evidenceId;
            });
            if (index >= 0) {
              reviewerJournalPath = candidatePath;
              reviewerJournalLines = lines;
              reviewerLineIndex = index;
              break;
            }
          }
          if (!reviewerJournalPath || !reviewerJournalLines || reviewerLineIndex < 0) {
            throw new Error("The Validation independent-review evidence event is missing from history.");
          }
          const mutateReviewerEvidence = async (executor: string, workerContextId: string) => {
            const lines = [...reviewerJournalLines!];
            const event = JSON.parse(lines[reviewerLineIndex]!) as Record<string, unknown>;
            const data = event.data as Record<string, unknown>;
            lines[reviewerLineIndex] = JSON.stringify({
              ...event,
              data: { ...data, executor, worker_context_id: workerContextId },
            });
            await Fs.writeFile(reviewerJournalPath!, `${lines.join("\n")}\n`, "utf8");
          };
          const generatorAttemptId = generationStart?.activity_attempt_id ?? previousCodeGeneration.activityAttemptId;
          await mutateReviewerEvidence("agent:reviewer", `${String(generatorAttemptId)}:worker`);
          const beforeInvalidReviewerCompletion = await audit.journalSnapshot();
          const invalidReviewerProcess = await runCliWithExeca(harness, completionArgs);
          const invalidReviewerResponse = JSON.parse(invalidReviewerProcess.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
          expect(invalidReviewerProcess.exitCode, JSON.stringify(invalidReviewerResponse)).toBe(1);
          expect(invalidReviewerResponse).toMatchObject({ status: "failed", data: { code: "independent_validation_reviewer_required" } });
          expect(await audit.journalSnapshot()).toBe(beforeInvalidReviewerCompletion);
          await mutateReviewerEvidence(activityExecutors["code-generation"], `${activityAttemptId}:reviewer`);
        }
        const completed = await runConstructionCli(completionArgs);
        if (interruptedRecovery) {
          const recoveredHistory = (await readConstructionSources(harness)).flatMap(parseHistorySource);
          const matches = (type: string, predicate: (data: Record<string, unknown>) => boolean) =>
            recoveredHistory.filter((record) => record.type === type && predicate(historyData(record)));
          const currentStarts = matches("construction.activity-attempt-started", (data) =>
            data.stage_attempt_id === implementationAttempt && data.task_id === taskId &&
            data.activity === activity && data.activity_attempt_id === activityAttemptId);
          const currentAcceptances = matches("construction.integration-accepted", (data) =>
            data.stage_attempt_id === implementationAttempt && data.task_id === taskId &&
            data.activity_attempt_id === activityAttemptId);
          const currentActivityCompletions = matches("construction.activity-attempt-completed", (data) =>
            data.stage_attempt_id === implementationAttempt && data.task_id === taskId &&
            data.activity === activity && data.activity_attempt_id === activityAttemptId);
          const currentTaskCompletions = matches("construction.task-completed", (data) =>
            data.stage_attempt_id === implementationAttempt && data.task_id === taskId &&
            data.integration_event_id === integrationEventId);
          expect(currentStarts).toHaveLength(1);
          expect(currentStarts[0]?.id).toBe(startEventId);
          expect(currentAcceptances).toHaveLength(1);
          expect(currentAcceptances[0]?.id).toBe(integrationEventId);
          expect(currentActivityCompletions).toHaveLength(1);
          expect(currentActivityCompletions[0]?.id).toBe(completed.event_id);
          expect(currentTaskCompletions).toHaveLength(1);
        }
        if (lifecycleStartEventId !== startEventId) {
          const completionRecord = (await readConstructionSources(harness)).flatMap(parseHistorySource)
            .find((record) => record.id === String(completed.event_id));
          expect(completionRecord?.caused_by).toContain(lifecycleStartEventId);
        }
        completions.set(activity, String(completed.event_id));
      }
      return { evidenceIds, starts, attempts, completions, integrationEventId };
    };
    const firstTaskRoute = await runTaskRoute(planningTaskId, planningMaterial.taskContracts[0]!, undefined);
    const secondTaskRoute = await runTaskRoute(planningSecondTaskId, planningMaterial.taskContracts[1]!, secondGenerationStart);
    const activityEvidenceIds = [...firstTaskRoute.evidenceIds, ...secondTaskRoute.evidenceIds];
    const activityStarts = new Map([
      ...firstTaskRoute.starts,
      ...[...secondTaskRoute.starts].map(([activity, eventId]) => [`${planningSecondTaskId}:${activity}`, eventId] as const),
    ]);
    const integrationEventId = firstTaskRoute.integrationEventId;
    const secondIntegrationEventId = secondTaskRoute.integrationEventId;
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
      data: { stage: "implementation", attempt_id: implementationAttempt, integration_event_ids: [integrationEventId, secondIntegrationEventId] },
    });
    const implementationHistorySources = await readConstructionSources(harness);
    const implementationEvents = implementationHistorySources.flatMap(parseHistorySource);
    const currentAdmissions = implementationEvents.filter((record) => {
      const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
      return record.type === "construction.task-admitted" && data?.stage_attempt_id === implementationAttempt;
    });
    expect(currentAdmissions).toHaveLength(2);
    expect(currentAdmissions.map((record) => (record.data as Record<string, unknown>).admission_baseline))
      .toEqual([planningMaterial.checkpoints, planningMaterial.checkpoints]);
    expect(currentAdmissions.every((record) => Array.isArray(record.caused_by) && record.caused_by.includes(auditFixture.baselineEventId))).toBe(true);
    const implementationCompletionRecord = implementationEvents.find((record) => {
      const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
      return record.type === "construction.stage-attempt-completed" && data?.stage === "implementation" &&
        data.stage_attempt_id === implementationAttempt;
    });
    if (!implementationCompletionRecord) throw new Error("The successful Implementation completion event is missing from history.");
    const generationCompletionRecord = implementationEvents.find((record) => String(record.id) === String(secondTaskRoute.completions.get("code-generation")));
    if (!generationCompletionRecord) throw new Error("The successful Code Generation completion event is missing from history.");
    const generationCompletionData = generationCompletionRecord.data as Record<string, unknown>;
    const generationEvidenceIds = new Set(Array.isArray(generationCompletionData.evidence_ids) ? generationCompletionData.evidence_ids.map(String) : []);
    const integrationCompletionRecord = implementationEvents.find((record) => String(record.id) === String(firstTaskRoute.completions.get("code-integration")));
    if (!integrationCompletionRecord) throw new Error("The successful Code Integration completion event is missing from history.");
    const integrationCompletionData = integrationCompletionRecord.data as Record<string, unknown>;
    const integrationEvidenceIds = new Set(Array.isArray(integrationCompletionData.evidence_ids) ? integrationCompletionData.evidence_ids.map(String) : []);
    let checkpointEvidenceChanged = false;
    const checkpointMismatchSources = implementationHistorySources.map((source) => encodeHistorySource(source,
      parseHistorySource(source).map((record) => {
        const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
        if (record.type === "construction.evidence-recorded" && data?.stage === "implementation" && data.activity === "code-generation" &&
            generationEvidenceIds.has(String(data.evidence_id))) {
          checkpointEvidenceChanged = true;
          return { ...record, data: { ...data, checkpoints: [] } };
        }
        return record;
      }),
    ));
    expect(checkpointEvidenceChanged).toBe(true);
    const checkpointMismatchProjection = projectConstruction(collectHistoryFromSources(auditFixture.missionId, checkpointMismatchSources, { completeness: "complete" }));
    expect(checkpointMismatchProjection.units.find((unit) => unit.unitId === auditFixture.unitId)?.blocked).toBe(true);
    let materialEvidenceChanged = false;
    const materialMismatchSources = implementationHistorySources.map((source) => encodeHistorySource(
      source,
      parseHistorySource(source).map((record) => {
        const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : undefined;
        if (record.type === "construction.evidence-recorded" && data?.stage === "implementation" &&
            data.stage_attempt_id === implementationAttempt && data.activity === "code-integration" && integrationEvidenceIds.has(String(data.evidence_id))) {
          materialEvidenceChanged = true;
          return { ...record, data: { ...data, checkpoints: [{ repository_id: repositoryId, commit: "ffffffffffffffffffffffffffffffffffffffff" }] } };
        }
        return record;
      }),
    ));
    expect(materialEvidenceChanged).toBe(true);
    const materialMismatchProjection = projectConstruction(collectHistoryFromSources(
      auditFixture.missionId, materialMismatchSources, { completeness: "complete" },
    ));
    expect(materialMismatchProjection.units.find((unit) => unit.unitId === auditFixture.unitId)?.blocked).toBe(true);
    expect(activityStarts.size).toBe(5);
    expect(activityEvidenceIds).toHaveLength(5);
    const afterImplementationHistory = collectHistoryFromSources(
      auditFixture.missionId, implementationHistorySources, { completeness: "complete" },
    );
    const invalidImplementationEvents = afterImplementationHistory.events.filter((event) => event.status === "invalid").map((event) => ({
      id: event.event?.id,
      type: event.event?.type,
      validationIssues: event.validationIssues,
    }));
    const afterImplementationProjection = projectConstruction(afterImplementationHistory);
    const afterImplementationUnit = afterImplementationProjection.units.find((unit) => unit.unitId === auditFixture.unitId);
    expect(afterImplementationUnit?.blocked, JSON.stringify({
      historyIssues: afterImplementationProjection.historyIssues,
      projectionIssues: afterImplementationProjection.projectionIssues,
      unitProjectionIssues: afterImplementationUnit?.projectionIssues,
      invalidImplementationEvents,
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
    const postCompletionRevisionRequest = {
      orchestrator_decision: "Reopen the completed Implementation for a new assessment",
      reason: "A final cross-check requests a new parent before Review and Deliver proceed.",
      inputs: [{ reference: "revision:post-completion", purpose: "The completed Implementation requires a new assessment" }],
    };
    const postCompletionRevisionArgs = ["workflow", "construction", "revise", "--unit", auditFixture.unitId,
      "--stage", "implementation", "--attempt", implementationAttempt];
    const postCompletionRevisionInput = JSON.stringify(postCompletionRevisionRequest);
    const interruptedAuthorization = await runCliThenInterruptCoordinator(
      harness, postCompletionRevisionArgs, postCompletionRevisionInput,
    );
    expect(interruptedAuthorization.signal).toBe("SIGKILL");
    const authorizedHistory = (await readConstructionSources(harness)).flatMap(parseHistorySource);
    const matchingAuthorizations = authorizedHistory.filter((record) => record.type === "construction.revision-authorized" &&
      historyData(record).unit_id === auditFixture.unitId && historyData(record).stage_attempt_id === implementationAttempt &&
      historyData(record).reason === postCompletionRevisionRequest.reason &&
      historyData(record).orchestrator_decision === postCompletionRevisionRequest.orchestrator_decision);
    expect(matchingAuthorizations).toHaveLength(1);
    const recoveryAuthorization = matchingAuthorizations[0]!;
    const recoveryRevisionId = String(historyData(recoveryAuthorization).revision_id);
    const revisionTransitions = (events: readonly Record<string, unknown>[]) => events.filter((record) =>
      historyData(record).revision_id === recoveryRevisionId &&
      ["construction.stage-attempt-ended-by-revision", "construction.stage-reopened"].includes(String(record.type)));
    expect(revisionTransitions(authorizedHistory)).toHaveLength(0);
    const interruptedCascade = await runCliThenInterruptCoordinator(
      harness, postCompletionRevisionArgs, postCompletionRevisionInput,
    );
    expect(interruptedCascade.signal).toBe("SIGKILL");
    const cascadedHistory = (await readConstructionSources(harness)).flatMap(parseHistorySource);
    const cascadedRevisionEvents = revisionTransitions(cascadedHistory);
    expect(cascadedRevisionEvents.filter((record) => record.type === "construction.stage-attempt-ended-by-revision")).toHaveLength(1);
    expect(cascadedRevisionEvents.filter((record) => record.type === "construction.stage-reopened")).toHaveLength(1);
    const beforeCascadeReplay = await audit.journalSnapshot();
    const postCompletionCascade = harness.cli.run(postCompletionRevisionArgs, { stdin: postCompletionRevisionInput });
    expect(postCompletionCascade.exitCode, postCompletionCascade.stdout).toBe(0);
    const postCompletionCascadeResult = JSON.parse(postCompletionCascade.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
    expect(postCompletionCascadeResult).toMatchObject({ status: "success", data: { status: "barrier_complete", resumed_authorization: true } });
    expect(postCompletionCascadeResult.data.affected_scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "stage", stage: "implementation" }),
      expect.objectContaining({ kind: "stage", stage: "unit-of-work-review" }),
      expect.objectContaining({ kind: "stage", stage: "deliver" }),
    ]));
    expect(postCompletionCascadeResult.data.transition_event_ids).toEqual([]);
    expect(await audit.journalSnapshot()).toBe(beforeCascadeReplay);
    const recoveredRevisionEvents = revisionTransitions((await readConstructionSources(harness)).flatMap(parseHistorySource));
    expect(recoveredRevisionEvents).toHaveLength(2);
    expect(recoveredRevisionEvents.filter((record) => record.type === "construction.stage-attempt-ended-by-revision")).toHaveLength(1);
    expect(recoveredRevisionEvents.filter((record) => record.type === "construction.stage-reopened")).toHaveLength(1);
    const postCompletionStageStart = harness.cli.run([
      "workflow", "construction", "stage", "start", "--unit", auditFixture.unitId, "--stage", "implementation",
      "--request", JSON.stringify({ inputs: implementationInputs }),
    ]);
    expect(postCompletionStageStart.exitCode, postCompletionStageStart.stdout).toBe(0);
    const postCompletionStageStartResult = JSON.parse(postCompletionStageStart.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
    expect(postCompletionStageStartResult.status).toBe("success");
    const postCompletionAttempt = String(postCompletionStageStartResult.data.attempt_id);
    const postCompletionStartEventId = String(postCompletionStageStartResult.data.id);
    const priorImplementationEvents = (await readConstructionSources(harness)).flatMap(parseHistorySource);
    const postCompletionRetainedAssessments = [] as Array<Record<string, unknown>>;
    for (const taskId of [planningTaskId, planningSecondTaskId]) {
      for (const activity of activityNames) {
        const currentCompletion = priorImplementationEvents.find((record) => {
          const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
            ? record.data as Record<string, unknown> : undefined;
          return record.type === "construction.activity-attempt-completed" && data?.stage_attempt_id === implementationAttempt &&
            data.task_id === taskId && data.activity === activity;
        });
        const completion = currentCompletion ?? (taskId === planningTaskId && activity === "code-generation"
          ? priorImplementationEvents.find((record) => {
            const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
              ? record.data as Record<string, unknown> : undefined;
            return record.type === "construction.activity-attempt-completed" &&
              data?.stage_attempt_id === previousImplementationStart.attemptId && data.task_id === taskId && data.activity === activity;
          })
          : undefined);
        if (!completion || !completion.data || typeof completion.data !== "object" || Array.isArray(completion.data)) {
          throw new Error(`The completed ${activity} scope for task ${taskId} is missing.`);
        }
        const completionData = completion.data as Record<string, unknown>;
        if (!Array.isArray(completionData.evidence_ids) || !Array.isArray(completionData.checkpoints)) {
          throw new Error(`The completed ${activity} scope for task ${taskId} lacks evidence or checkpoints.`);
        }
        postCompletionRetainedAssessments.push({
          task_id: taskId,
          activity,
          original_stage_attempt_id: completionData.stage_attempt_id,
          original_activity_attempt_id: completionData.activity_attempt_id,
          original_evidence_ids: completionData.evidence_ids,
          applicable: true,
          reason: `The completed ${activity} result remains applicable to the unchanged task graph.`,
          checkpoints: completionData.checkpoints,
        });
      }
    }
    const postCompletionRetainedAssessment = stageDriver.assessRetainedScopes(auditFixture.unitId, postCompletionAttempt, {
      assessments: postCompletionRetainedAssessments,
    });
    expect(postCompletionRetainedAssessment.exitCode, JSON.stringify(postCompletionRetainedAssessment.result)).toBe(0);
    const postCompletionRetainedAssessmentId = String(postCompletionRetainedAssessment.result.data.id);
    const postCompletionAdmissions = [] as Array<{ readonly taskId: string; readonly admissionId: string; readonly completionId: string; readonly integrationId: string }>;
    for (const taskId of [planningTaskId, planningSecondTaskId]) {
      const admission = harness.cli.run([
        "workflow", "construction", "task", "admit", "--unit", auditFixture.unitId, "--task", taskId,
        "--implementation-attempt", postCompletionAttempt, "--prerequisites", JSON.stringify({ prerequisite_evidence_ids: [] }),
      ]);
      expect(admission.exitCode, admission.stdout).toBe(0);
      const admissionResult = JSON.parse(admission.stdout) as { readonly status: string; readonly data: Readonly<Record<string, unknown>> };
      expect(admissionResult.status).toBe("success");
      expect(admissionResult.data.task_completion_event_id).toBeDefined();
      postCompletionAdmissions.push({
        taskId,
        admissionId: String(admissionResult.data.admission_event_id),
        completionId: String(admissionResult.data.task_completion_event_id),
        integrationId: String(admissionResult.data.integration_event_id),
      });
    }
    const postCompletionStageEvidence = async (check: string, executor: string): Promise<string> => {
      const evidenceId = randomUUID();
      const evidence = await appendTypedConstructionEvent(harness, "construction.evidence-recorded", {
        mission_id: auditFixture.missionId,
        unit_id: auditFixture.unitId,
        stage: "implementation",
        stage_attempt_id: postCompletionAttempt,
        evidence_id: evidenceId,
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: planningMaterial.checkpoints,
        inputs: planningMaterial.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current upstream material" })),
        check,
        executor,
        result: { status: "passed", summary: `${check} passed for the post-completion return.` },
        output_refs: [`assessment:${check}`],
        conditions: [],
      }, [postCompletionStartEventId]);
      return String(evidence.data.evidence_id);
    };
    const postCompletionSelfReviewEvidenceId = await postCompletionStageEvidence("implementation-self-review", "Implementation owner");
    const postCompletionHandoffEvidenceId = await postCompletionStageEvidence("implementation-review-handoff", "Implementation owner");
    const postCompletionUnitCheckEvidenceId = await postCompletionStageEvidence("implementation-combined-result-check", "Independent verifier");
    const postCompletionImplementationResult = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      postCompletionAttempt,
      {
        self_review_evidence_id: postCompletionSelfReviewEvidenceId,
        handoff_evidence_id: postCompletionHandoffEvidenceId,
        unit_check_evidence_ids: [postCompletionUnitCheckEvidenceId],
        retained_scope_assessment_event_ids: [postCompletionRetainedAssessmentId],
        additional_review: { requested: false },
        blocking_findings: [],
        handoff_assessment: {
          status: "ready",
          reason: "All retained task results remain applicable and the new unit assessment is complete.",
          recipient: "unit-of-work-review",
          artifacts: handoffArtifacts,
        },
      },
      "implementation",
    );
    expect(postCompletionImplementationResult.exitCode, JSON.stringify(postCompletionImplementationResult.result)).toBe(0);
    expect(postCompletionImplementationResult.result).toMatchObject({
      status: "success",
      data: { stage: "implementation", attempt_id: postCompletionAttempt },
    });
    const currentImplementationCompletionEventId = String(postCompletionImplementationResult.result.data.id);
    expect(postCompletionAdmissions.map((item) => item.integrationId)).toEqual(expect.arrayContaining([
      integrationEventId,
      secondIntegrationEventId,
    ]));
    const downstreamImplementationCompletionEventId = currentImplementationCompletionEventId;
    const reviewStart = await appendStageStart(harness, [
      String(functionalCompletion.result.data.id),
      String(result.result.data.id),
      String(planningResult.result.data.id),
      downstreamImplementationCompletionEventId,
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
      implementation_completion_event_id: downstreamImplementationCompletionEventId,
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
      downstreamImplementationCompletionEventId,
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
  }, 600_000);

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

describe("Standard workflow CLI E2E", () => {
  it.each([
    { name: "greenfield repository", noCommit: true },
    { name: "existing application", noCommit: false },
  ])("prepares, implements, reviews, and delivers a $name", async ({ noCommit }) => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    const root = harness.resources.repositoryDirectory;
    if (noCommit) {
      await Fs.rm(root, { recursive: true, force: true });
      await Fs.mkdir(root, { recursive: true });
      harness.resources.runGit(root, "init", "-q", "-b", "main");
      harness.resources.runGit(root, "config", "user.name", "Kepler E2E Fixture");
      harness.resources.runGit(root, "config", "user.email", "e2e@example.invalid");
      await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
      await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n", "utf8");
      await Fs.writeFile(Path.join(root, ".gitignore"), "node_modules/\n", "utf8");
    } else {
      await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
      await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n", "utf8");
      await Fs.writeFile(Path.join(root, ".gitignore"), "node_modules/\n", "utf8");
      await Fs.mkdir(Path.join(root, "src"), { recursive: true });
      await Fs.writeFile(Path.join(root, "src", "access.ts"), "export const canReadStoredData = (_ownerId: string, _requesterId: string): boolean => true;\n", "utf8");
      harness.resources.runGit(root, "add", ".kepler/marker", ".gitignore", "src/access.ts");
      harness.resources.runGit(root, "commit", "-q", "-m", "Prepare the existing application");
    }
    await Fs.symlink(Path.resolve(import.meta.dirname, "../..", "node_modules"), Path.join(root, "node_modules"), "dir");

    const missionRequest = {
      title: noCommit ? "Create an owner-scoped access policy" : "Secure the existing application access policy",
      request: "Only the owner of stored requester data can read it, and the repository handoff must include checked implementation evidence.",
      workflow: "standard",
      recordHomeRepositoryId: repositoryId,
      contexts: [{ reference: "request:access-policy", purpose: "Requester scope for this implementation" }],
      repositories: [{
        repositoryId,
        workspace: { kind: "existing", path: root },
        branch: { kind: "current" },
        integrationTarget: "refs/heads/main",
      }],
    };
    const missionResult = harness.cli.run([
      "mission", "create", "--project", root, "--request", JSON.stringify(missionRequest),
    ]);
    expect(missionResult.exitCode, missionResult.stdout).toBe(0);
    const missionEnvelope = JSON.parse(missionResult.stdout) as { status: string; data: Record<string, unknown> };
    expect(missionEnvelope).toMatchObject({ status: "success", data: { workflow: "standard", execution_started: false } });
    const missionId = String(missionEnvelope.data.mission_id);
    expect(missionEnvelope.data.workspaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        repository_id: repositoryId,
        branch: "main",
        starting_checkpoint: noCommit ? { kind: "no-commit" } : expect.objectContaining({ kind: "commit" }),
      }),
    ]));

    const unitResult = harness.cli.run([
      "workflow", "construction", "unit", "create", "access-policy",
      "--mission", missionId, "--effort", "comprehensive", "--project", root,
    ]);
    expect(unitResult.exitCode, unitResult.stdout).toBe(0);
    const unitEnvelope = JSON.parse(unitResult.stdout) as { status: string; data: Record<string, unknown> };
    expect(unitEnvelope).toMatchObject({ status: "success", data: { mission_id: missionId, workflow: "standard", execution_started: false } });
    const unitId = String(unitEnvelope.data.unit_id);
    unitDirectory = `.kepler/missions/${missionId}/${String(unitEnvelope.data.directory)}`;
    const fixture: AuditFixture = {
      missionId,
      unitId,
      journalId: String(unitEnvelope.data.journal_id),
      stageAttemptId: randomUUID(),
      priorStageAttemptId: randomUUID(),
      implementationAttemptId: randomUUID(),
      baselineEventId: randomUUID(),
      taskId: planningTaskId,
      activityAttemptId: randomUUID(),
      eventIds: [randomUUID(), randomUUID()],
    };
    configureAuditFixture(fixture);
    const audit = createAuditDriver(harness);
    const startStage = (stage: string, inputs: readonly { readonly reference: string; readonly purpose: string }[]) => {
      const result = harness.cli.run([
        "workflow", "construction", "stage", "start", "--unit", unitId, "--stage", stage,
        "--request", JSON.stringify({ inputs }), "--project", root,
      ]);
      expect(result.exitCode, result.stdout).toBe(0);
      const envelope = JSON.parse(result.stdout) as { status: string; data: Record<string, unknown> };
      expect(envelope.status, JSON.stringify(envelope)).toBe("success");
      return envelope.data;
    };
    const startInputs = (bindings: readonly { readonly artifact_id: string }[], purpose: string) =>
      bindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose }));

    const functionalStart = startStage("functional-design", [{ reference: "request:access-policy", purpose: "Requested owner-scoped access behavior" }]);
    const functionalAttempt = String(functionalStart.attempt_id);
    configureAuditFixture({ ...auditFixture, stageAttemptId: functionalAttempt });
    const functionalMaterial = await createProjectArtifacts(harness);
    const functionalEvidence = recordEvidence(audit, functionalAttempt, functionalMaterial);
    const functionalApproval = recordApproval(audit, functionalMaterial);
    const functionalCompletion = new StageCompletionCliDriver(harness.cli).complete(
      unitId, functionalAttempt, completionRequest(functionalEvidence, functionalApproval),
    );
    expect(functionalCompletion.exitCode, JSON.stringify(functionalCompletion.result)).toBe(0);

    const qualityStart = startStage("quality-requirements", startInputs(functionalMaterial.artifactBindings, "Accepted Functional Design material"));
    const qualityAttempt = String(qualityStart.attempt_id);
    const qualityMaterial = await createQualityArtifacts(harness);
    const qualityEvidence = recordQualityEvidence(audit, qualityAttempt, qualityMaterial);
    const qualityApproval = recordQualityApproval(audit, qualityAttempt, qualityMaterial);
    const qualityCompletion = new StageCompletionCliDriver(harness.cli).complete(
      unitId, qualityAttempt, qualityCompletionRequest(qualityEvidence, qualityApproval), "quality-requirements",
    );
    expect(qualityCompletion.exitCode, JSON.stringify(qualityCompletion.result)).toBe(0);

    const planningStart = startStage("implementation-planning", [
      ...startInputs(functionalMaterial.artifactBindings, "Accepted Functional Design material"),
      ...startInputs(qualityMaterial.artifactBindings, "Accepted Quality Requirements material"),
    ]);
    const planningAttempt = String(planningStart.attempt_id);
    const planningMaterial = await createPlanningArtifacts(harness, functionalMaterial, qualityMaterial, { executableIntegrationCommands: true });
    const planningEvidence = recordPlanningEvidence(audit, planningAttempt, planningMaterial);
    const planningCompletion = new StageCompletionCliDriver(harness.cli).complete(
      unitId, planningAttempt, planningCompletionRequest(planningMaterial, planningEvidence), "implementation-planning",
    );
    expect(planningCompletion.exitCode, JSON.stringify(planningCompletion.result)).toBe(0);

    await Fs.mkdir(Path.join(root, "src"), { recursive: true });
    await Fs.mkdir(Path.join(root, "tests"), { recursive: true });
    await Fs.writeFile(
      Path.join(root, "src", "access.ts"),
      "export const canReadStoredData = (ownerId: string, requesterId: string): boolean => ownerId === requesterId;\n",
      "utf8",
    );
    await Fs.writeFile(
      Path.join(root, "tests", "access-check.ts"),
      'import * as assert from "node:assert/strict";\nimport { canReadStoredData } from "../src/access.js";\nassert.equal(canReadStoredData("owner", "owner"), true);\nassert.equal(canReadStoredData("owner", "other"), false);\n',
      "utf8",
    );
    await Fs.writeFile(
      Path.join(root, "tests", "access-regression.ts"),
      'import * as assert from "node:assert/strict";\nimport { canReadStoredData } from "../src/access.js";\nassert.equal(canReadStoredData("owner", "other"), false);\nassert.equal(canReadStoredData("other", "owner"), false);\n',
      "utf8",
    );
    harness.resources.runGit(root, "add", ".gitignore", "src/access.ts", "tests/access-check.ts", "tests/access-regression.ts");
    harness.resources.runGit(root, "commit", "-q", "-m", "Implement owner-scoped reads and regression checks");

    const implementationInputs = [
      { reference: `task-graph:${planningMaterial.graphRef.graph_id}@${planningMaterial.graphRef.content_version}`, purpose: "Accepted task graph" },
      ...startInputs(planningMaterial.reviewedBindings, "Accepted Functional Design, Quality Requirements, and Planning material"),
    ];
    const implementationStart = startStage("implementation", implementationInputs);
    const implementationAttempt = String(implementationStart.attempt_id);
    configureAuditFixture({ ...auditFixture, implementationAttemptId: implementationAttempt });
    const taskIds = planningMaterial.taskIds;
    const taskChecks = {
      "code-generation": ["code-generation-typecheck", "code-generation-related-tests", "code-generation-self-review"],
      "code-validation": ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite", "code-validation-independent-review", "code-validation-self-review"],
    } as const;
    const integrationCommands = (testFile: string) => ({
      "code-integration-typecheck": {
        repository_id: repositoryId,
        executable: "bun",
        argv: ["run", "./node_modules/typescript/bin/tsc", "--noEmit", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--strict", "--typeRoots", "./node_modules/@types", "--types", "node", "src/access.ts", testFile],
      },
      "code-integration-build": { repository_id: repositoryId, executable: "bun", argv: ["build", "src/access.ts", "--outdir", ".kepler-e2e-build"] },
      "code-integration-full-test-suite": { repository_id: repositoryId, executable: "bun", argv: ["run", testFile] },
    } as const);
    const runTask = async (taskId: string, testFile: string) => {
      const taskIntegrationCommands = integrationCommands(testFile);
      const admission = harness.cli.run([
        "workflow", "construction", "task", "admit", "--unit", unitId, "--task", taskId,
        "--implementation-attempt", implementationAttempt, "--prerequisites", JSON.stringify({ prerequisite_evidence_ids: [] }), "--project", root,
      ]);
      expect(admission.exitCode, admission.stdout).toBe(0);
      const taskIndex = planningMaterial.taskIds.indexOf(taskId);
      const taskContract = planningMaterial.taskContracts[taskIndex];
      if (!taskContract) throw new Error(`Missing plan contract for ${taskId}`);
      const activityEvidenceIds: string[] = [];
      let integrationEventId = "";
      for (const activity of ["code-generation", "code-validation", "code-integration"] as const) {
        const start = harness.cli.run([
          "workflow", "construction", "activity", "start", "--unit", unitId, "--task", taskId,
          "--activity", activity, "--implementation-attempt", implementationAttempt, "--project", root,
        ]);
        expect(start.exitCode, start.stdout).toBe(0);
        const startData = (JSON.parse(start.stdout) as { data: Record<string, unknown> }).data;
        const activityAttempt = String(startData.activity_attempt_id);
        const inputs = startData.inputs as readonly { readonly reference: string; readonly purpose: string }[];
        const checkpoints = startData.checkpoints as readonly { readonly repository_id: string; readonly commit: string }[];
        const evidenceIds: string[] = [];
        if (activity !== "code-integration") {
          const checks = activity === "code-generation"
            ? taskChecks[activity]
            : ["code-validation-typecheck", "code-validation-build", "code-validation-full-test-suite", "code-validation-independent-review", "code-validation-self-review"] as const;
          for (const check of checks) {
            const independent = check === "code-validation-independent-review";
            const recorded = audit.record("evidence", {
              unit: unitId,
              stage: "implementation",
              task: taskId,
              activity,
              implementationAttempt,
              attempt: activityAttempt,
            }, {
              artifact_bindings: planningMaterial.reviewedBindings,
              checkpoints,
              inputs,
              check,
              executor: independent ? "agent:reviewer" : activity === "code-generation" ? "agent:builder" : "agent:verifier",
              worker_context_id: independent ? `${activityAttempt}:reviewer` : `${activityAttempt}:worker`,
              result: { status: "passed", summary: `${check} passed for ${taskId}.` },
              output_refs: taskContract.outputs,
              conditions: [],
            });
            expect(recorded.exitCode, recorded.stdout).toBe(0);
            evidenceIds.push(String(recorded.result.data.evidence_id));
          }
        } else {
          const scope = [
            "--unit", unitId, "--task", taskId, "--activity", activity,
            "--implementation-attempt", implementationAttempt, "--attempt", activityAttempt,
          ];
          const lock = harness.cli.run(["workflow", "construction", "integration", "lock", ...scope, "--project", root]);
          expect(lock.exitCode, lock.stdout).toBe(0);
          const lockData = (JSON.parse(lock.stdout) as { data: Record<string, unknown> }).data;
          const lockToken = String(lockData.lock_token);
          const prepare = harness.cli.run([
            "workflow", "construction", "integration", "prepare", ...scope, "--lock-token", lockToken,
            "--request", JSON.stringify({ captured_inputs: lockData.captured_inputs, candidate_checkpoints: checkpoints }), "--project", root,
          ]);
          expect(prepare.exitCode, prepare.stdout).toBe(0);
          const preparedEventId = String((JSON.parse(prepare.stdout) as { data: Record<string, unknown> }).data.prepared_event_id);
          for (const check of ["code-integration-typecheck", "code-integration-build", "code-integration-full-test-suite", "code-integration-self-review"] as const) {
            const selfReview = check === "code-integration-self-review";
            const checkCommand = selfReview ? undefined : taskIntegrationCommands[check];
            if (checkCommand) {
              const execution = await execa(checkCommand.executable, [...checkCommand.argv], {
                cwd: root,
                env: harness.resources.environment(),
                extendEnv: false,
                reject: false,
                timeout: 30_000,
              });
              expect(execution.exitCode, `${check}: ${execution.stderr}`).toBe(0);
              if (check === "code-integration-build") {
                const outputDirectory = Path.join(root, ".kepler-e2e-build");
                await Fs.access(Path.join(outputDirectory, "access.js"));
                await Fs.rm(outputDirectory, { recursive: true, force: true });
              }
            }
            const request = {
              prepared_event_id: preparedEventId,
              check,
              executor: "agent:integrator",
              result: { status: "passed", summary: `${check} passed for the immutable ${taskId} candidate.` },
              ...(selfReview ? {} : { check_command: checkCommand }),
              output_refs: taskContract.outputs,
              conditions: selfReview ? ["Integration bindings match the accepted candidate and actual inputs.", ...taskContract.acceptance_criteria] : [],
            };
            const recorded = harness.cli.run([
              "workflow", "construction", "integration", "evidence", ...scope, "--lock-token", lockToken,
              "--request", JSON.stringify(request), "--project", root,
            ]);
            expect(recorded.exitCode, recorded.stdout).toBe(0);
            evidenceIds.push(String((JSON.parse(recorded.stdout) as { data: Record<string, unknown> }).data.evidence_id));
          }
          const accepted = harness.cli.run([
            "workflow", "construction", "integration", "accept", ...scope,
            "--lock-token", lockToken, "--prepared-event-id", preparedEventId, "--project", root,
          ]);
          expect(accepted.exitCode, accepted.stdout).toBe(0);
          integrationEventId = String((JSON.parse(accepted.stdout) as { data: Record<string, unknown> }).data.integration_event_id);
        }
        const complete = harness.cli.run([
          "workflow", "construction", "activity", "complete", "--unit", unitId, "--task", taskId,
          "--activity", activity, "--implementation-attempt", implementationAttempt, "--attempt", activityAttempt,
          "--evidence", JSON.stringify({ evidence_ids: evidenceIds }), "--project", root,
        ]);
        expect(complete.exitCode, complete.stdout).toBe(0);
        activityEvidenceIds.push(...evidenceIds);
      }
      return { integrationEventId, activityEvidenceIds };
    };

    const firstTask = await runTask(taskIds[0]!, "tests/access-check.ts");
    const secondTask = await runTask(taskIds[1]!, "tests/access-regression.ts");
    expect(firstTask.integrationEventId).not.toBe(secondTask.integrationEventId);
    const finalCheckpoint = harness.resources.runGit(root, "rev-parse", "HEAD");
    const taskEvidence = async (check: string, executor: string) => {
      const recorded = audit.record("evidence", { unit: unitId, stage: "implementation", attempt: implementationAttempt }, {
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: [{ repository_id: repositoryId, commit: finalCheckpoint }],
        inputs: planningMaterial.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current accepted upstream material" })),
        check,
        executor,
        result: { status: "passed", summary: `${check} passed for the combined implementation.` },
        output_refs: [`assessment:${check}`],
        conditions: [],
      });
      expect(recorded.exitCode, recorded.stdout).toBe(0);
      return String(recorded.result.data.evidence_id);
    };
    const implementationSelfReview = await taskEvidence("implementation-self-review", "agent:builder");
    const implementationHandoff = await taskEvidence("implementation-review-handoff", "agent:builder");
    const combinedCheck = await taskEvidence("implementation-combined-result-check", "agent:verifier");
    const handoffArtifacts = [
      ...functionalMaterial.artifactPaths,
      ...qualityMaterial.artifactPaths,
      "plan.md",
      "tasks-dag.json",
    ].sort();
    const implementationCompletion = new StageCompletionCliDriver(harness.cli).complete(unitId, implementationAttempt, {
      self_review_evidence_id: implementationSelfReview,
      handoff_evidence_id: implementationHandoff,
      unit_check_evidence_ids: [combinedCheck],
      retained_scope_assessment_event_ids: [],
      additional_review: { requested: false },
      blocking_findings: [],
      handoff_assessment: {
        status: "ready",
        reason: "Both planned tasks completed and the combined access-policy checks passed.",
        recipient: "unit-of-work-review",
        artifacts: handoffArtifacts,
      },
    }, "implementation");
    expect(implementationCompletion.exitCode, JSON.stringify(implementationCompletion.result)).toBe(0);
    const implementationCompletionId = String(implementationCompletion.result.data.id);

    const reviewStart = startStage("unit-of-work-review", startInputs(planningMaterial.reviewedBindings, "Whole-unit review material"));
    const reviewAttempt = String(reviewStart.attempt_id);
    const reviewCheck = async (check: string) => {
      const recorded = audit.record("evidence", { unit: unitId, stage: "unit-of-work-review", attempt: reviewAttempt }, {
        artifact_bindings: planningMaterial.reviewedBindings,
        checkpoints: [{ repository_id: repositoryId, commit: finalCheckpoint }],
        inputs: planningMaterial.reviewedBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current material reviewed for the complete unit" })),
        check,
        executor: "agent:reviewer",
        result: { status: "passed", summary: `${check} passed for the integrated unit.` },
        output_refs: [`review-report:${check}`],
        conditions: [],
      });
      expect(recorded.exitCode, recorded.stdout).toBe(0);
      return String(recorded.result.data.evidence_id);
    };
    const reviewAssessment = await reviewCheck("implementation-evidence-assessment");
    const reviewEvidence = await reviewCheck("unit-of-work-review");
    const reviewSelfReview = await reviewCheck("unit-of-work-review-self-review");
    const reviewCompletion = new StageCompletionCliDriver(harness.cli).complete(unitId, reviewAttempt, {
      implementation_completion_event_id: implementationCompletionId,
      reviewed_material_bindings: planningMaterial.reviewedBindings,
      final_checkpoints: [{ repository_id: repositoryId, commit: finalCheckpoint }],
      reviewer: "agent:reviewer",
      implementation_authors: ["agent:builder"],
      implementation_evidence_assessment_id: reviewAssessment,
      review_evidence_id: reviewEvidence,
      self_review_evidence_id: reviewSelfReview,
      findings: { blocking: [], limitations: [] },
      additional_review: { requested: false },
      acceptance_required: false,
      handoff: { status: "ready", recipient: "deliver", summary: "The whole-unit review is ready for repository handoff." },
    }, "unit-of-work-review");
    expect(reviewCompletion.exitCode, JSON.stringify(reviewCompletion.result)).toBe(0);
    const reviewCompletionId = String(reviewCompletion.result.data.id);

    const deliveryArtifactId = randomUUID();
    const deliveryInstructions = `---\nid: ${deliveryArtifactId}\ntype: delivery-plan\nschema_version: 3\nunit_id: ${unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Delivery plan\n\n## Outcome and destination\n\nHand the reviewed repository and its checks to the requester.\n\n## Operations and prerequisites\n\nPrepare a handoff package from the reviewed repository checkpoint and retained evidence.\n\n## Verification and recovery\n\nVerify that the requester can identify the checked checkpoint and both task results.\n\n## Decisions and open questions\n\nRepository handoff is the agreed outcome.\n`;
    await Fs.writeFile(Path.join(root, unitDirectory, "delivery.md"), deliveryInstructions, "utf8");
    harness.resources.runGit(root, "add", unitDirectory);
    harness.resources.runGit(root, "commit", "-q", "-m", "Record authorized repository delivery plan");
    const deliveryCheckpoint = harness.resources.runGit(root, "rev-parse", "HEAD");
    const deliveryBindings = [
      ...planningMaterial.reviewedBindings,
      { artifact_id: deliveryArtifactId, content_version: `sha256:${createHash("sha256").update(deliveryInstructions, "utf8").digest("hex")}` },
    ];
    const deliveryStart = startStage("deliver", startInputs(deliveryBindings, "Reviewed repository handoff material"));
    const deliveryAttempt = String(deliveryStart.attempt_id);
    const deliveryOutcome = {
      outcome: "repository-handoff",
      requested_outcome: "Hand the reviewed repository and checked task evidence to the requester. I authorize preparation of the handoff package.",
      destination: "repository:main",
      recipient: "Requester",
    };
    const outcomeRequest = audit.record("interaction", { unit: unitId, stage: "deliver", attempt: deliveryAttempt }, {
      participants: ["Requester"],
      content: deliveryOutcome.requested_outcome,
      references: ["request:delivery-outcome", "request:prepare-handoff-package"],
      delivery_outcome: deliveryOutcome,
    });
    expect(outcomeRequest.exitCode, outcomeRequest.stdout).toBe(0);
    const outcomeEventId = String(outcomeRequest.result.data.id);
    const deliveryEvidence = (check: string, relatedEventIds: readonly string[] = []) => {
      const recorded = audit.record("evidence", { unit: unitId, stage: "deliver", attempt: deliveryAttempt }, {
        inputs: deliveryBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Reviewed repository delivery material" })),
        artifact_bindings: deliveryBindings,
        checkpoints: [{ repository_id: repositoryId, commit: deliveryCheckpoint }],
        check,
        executor: "agent:delivery-owner",
        result: { status: "passed", summary: `${check} passed for the authorized repository handoff.` },
        output_refs: [`delivery-output:${check}`],
        ...(check === "deliver-operation-result" || check === "deliver-outcome-verification" ? { related_request_event_id: outcomeEventId } : {}),
        ...(relatedEventIds.length > 0 ? { related_event_ids: relatedEventIds } : {}),
      });
      expect(recorded.exitCode, recorded.stdout).toBe(0);
      return { evidenceId: String(recorded.result.data.evidence_id), eventId: String(recorded.result.data.id) };
    };
    const deliveryPreparation = deliveryEvidence("deliver-preparation");
    const deliverySelfReview = deliveryEvidence("deliver-self-review");
    const deliveryOperation = deliveryEvidence("deliver-operation-result");
    const deliveryVerification = deliveryEvidence("deliver-outcome-verification", [deliveryOperation.eventId]);
    const deliveryHandoff = deliveryEvidence("deliver-recipient-handoff", [deliveryPreparation.eventId, deliverySelfReview.eventId, deliveryOperation.eventId, deliveryVerification.eventId]);
    const deliveryCompletion = new StageCompletionCliDriver(harness.cli).complete(unitId, deliveryAttempt, {
      review_completion_event_id: reviewCompletionId,
      outcome_request_event_id: outcomeEventId,
      ...deliveryOutcome,
      artifact_bindings: deliveryBindings,
      reviewed_checkpoints: [{ repository_id: repositoryId, commit: finalCheckpoint }],
      preparation_evidence_id: deliveryPreparation.evidenceId,
      self_review_evidence_id: deliverySelfReview.evidenceId,
      operation_results: [{
        operation: "Prepare the reviewed repository handoff package",
        status: "succeeded",
        evidence_id: deliveryOperation.evidenceId,
        source_checkpoints: [{ repository_id: repositoryId, commit: finalCheckpoint }],
        authority: { kind: "requester-instruction", event_id: outcomeEventId },
      }],
      verification_evidence_ids: [deliveryVerification.evidenceId],
      handoff_evidence_id: deliveryHandoff.evidenceId,
      additional_review: { requested: false },
      approval_required: false,
      handoff: { status: "ready", summary: "The requester received the reviewed repository checkpoint and retained evidence." },
    }, "deliver");
    expect(deliveryCompletion.exitCode, JSON.stringify(deliveryCompletion.result)).toBe(0);

    const shown = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", unitId, "--project", root]);
    expect(shown.exitCode, shown.stdout).toBe(0);
    const unit = (JSON.parse(shown.stdout) as { data: { unit: Record<string, unknown> } }).data.unit;
    expect(unit.blocked).toBe(false);
    expect(unit.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "functional-design", state: "completed" }),
      expect.objectContaining({ stage: "quality-requirements", state: "completed" }),
      expect.objectContaining({ stage: "implementation-planning", state: "completed" }),
      expect.objectContaining({ stage: "implementation", state: "completed" }),
      expect.objectContaining({ stage: "unit-of-work-review", state: "completed" }),
      expect.objectContaining({ stage: "deliver", state: "completed" }),
    ]));
    expect(await Fs.readFile(Path.join(root, "src", "access.ts"), "utf8")).toContain("ownerId === requesterId");
    expect(await Fs.stat(Path.join(root, unitDirectory, "delivery.md"))).toBeDefined();
    expect(harness.resources.runGit(root, "branch", "--show-current")).toBe("main");
    expect(harness.resources.runGit(root, "status", "--porcelain", "--untracked-files=all")).toContain(".kepler/missions/");
    const history = (await readConstructionSources(harness)).flatMap(parseHistorySource);
    expect(history.filter((record) => record.type === "construction.task-completed")).toHaveLength(2);
    expect(history.filter((record) => record.type === "construction.integration-accepted")).toHaveLength(2);
    expect(history.some((record) => record.type === "construction.mission-created")).toBe(true);
    expect(history.some((record) => record.type === "construction.unit-created" && historyData(record).unit_id === unitId)).toBe(true);
    expect(harness.resources.runGit(root, "log", "-1", "--format=%s")).toBe("Record authorized repository delivery plan");
    await audit.journalSnapshot();
  }, 600_000);
});
