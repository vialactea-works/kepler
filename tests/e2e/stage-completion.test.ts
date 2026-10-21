import { createHash } from "node:crypto";
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
});
