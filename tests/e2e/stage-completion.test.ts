import { createHash, randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { StageCompletionCliDriver } from "./driver/stage-completion-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, createAuditHistory } from "./fixtures/histories/audit.js";

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
    checkpoints: [{ repository_id: repositoryId, commit }],
    artifactPaths: ["quality.md", "details/quality-requirements/security.md"],
  };
};

const appendQualityStageStart = async (harness: E2EHarness, authorityEventId: string): Promise<string> => {
  const stageAttemptId = randomUUID();
  const journalId = randomUUID();
  const historyDirectory = Path.join(harness.resources.repositoryDirectory, ".kepler", "missions", auditFixture.missionId, "history", "construction");
  await Fs.writeFile(Path.join(historyDirectory, `${journalId}.jsonl`), `${JSON.stringify({
    id: randomUUID(),
    phase: "construction",
    type: "construction.stage-attempt-started",
    envelope_version: 1,
    event_version: 1,
    journal_id: journalId,
    recorded_at: "2026-10-22T13:00:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
    caused_by: [authorityEventId],
    data: {
      mission_id: auditFixture.missionId,
      unit_id: auditFixture.unitId,
      stage: "quality-requirements",
      stage_attempt_id: stageAttemptId,
      inputs: [{ reference: "request:scope", purpose: "Accepted quality scope" }],
      checkpoints: [],
      authority_event_ids: [authorityEventId],
    },
  })}\n`, "utf8");
  return stageAttemptId;
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
      artifacts: ["quality.md", "details/quality-requirements/security.md"],
      requirement_references: ["quality.md#security"],
      constraints: ["Preserve the accepted Functional Design contract."],
      assumptions: [],
      planning_questions: ["Choose a mechanism that satisfies the security acceptance condition."],
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
    const qualityAttempt = await appendQualityStageStart(harness, String(functionalCompletion.result.data.id));
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
    const externalReviewEvidence = recordQualityExternalReviewEvidence(audit, qualityAttempt, qualityMaterial);
    const qualityApproval = recordQualityApproval(audit, qualityAttempt, qualityMaterial);

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      qualityAttempt,
      qualityCompletionRequest(qualityEvidence, qualityApproval, {
        requestEventId: String(requestEvent.result.data.id),
        evidenceId: externalReviewEvidence,
      }),
      "quality-requirements",
    );

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
    const shown = harness.cli.run(["workflow", "construction", "unit", "show", "--unit", auditFixture.unitId]);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout).data.unit.stages).toContainEqual(expect.objectContaining({
      stage: "quality-requirements",
      state: "completed",
    }));
  }, 120_000);

  it("denies a requested external review without a current requester instruction event", async () => {
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
    const qualityAttempt = await appendQualityStageStart(harness, String(functionalCompletion.result.data.id));
    const qualityMaterial = await createQualityArtifacts(harness);
    const qualityEvidence = recordQualityEvidence(audit, qualityAttempt, qualityMaterial);
    const externalReviewEvidence = recordQualityExternalReviewEvidence(audit, qualityAttempt, qualityMaterial);
    const qualityApproval = recordQualityApproval(audit, qualityAttempt, qualityMaterial);
    const before = await audit.journalSnapshot();

    const result = new StageCompletionCliDriver(harness.cli).complete(
      auditFixture.unitId,
      qualityAttempt,
      qualityCompletionRequest(qualityEvidence, qualityApproval, {
        requestEventId: randomUUID(),
        evidenceId: externalReviewEvidence,
      }),
      "quality-requirements",
    );

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "failed", data: { code: "quality_evidence_invalid" } });
    expect(await audit.journalSnapshot()).toBe(before);
  }, 120_000);
});
