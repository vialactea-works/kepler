import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { AuditContextResolver, createNodeAuditContextFileSystem, createNodeAuditJournalFactory } from "../../packages/cli/src/audit/context.js";
import { AuditRecording } from "../../packages/cli/src/audit/recording.js";
import { CONSTRUCTION_PHASE, type ConstructionStage } from "../../packages/cli/src/construction/events.js";
import {
  createNodeFunctionalDesignStageCompletionRuntime,
  FunctionalDesignStageCompletion,
} from "../../packages/cli/src/construction/stage-completion.js";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";
import { auditFixture, createAuditHistory } from "../e2e/fixtures/histories/audit.js";

export const completionUnitDirectory = `.kepler/missions/${auditFixture.missionId}/construction/units-of-work/${auditFixture.unitId}`;
const artifactIds = {
  "unit-of-work.md": "a1000000-0000-4000-8000-000000000001",
  "design.md": "a2000000-0000-4000-8000-000000000002",
  "details/functional-design/domain-model.md": "a3000000-0000-4000-8000-000000000003",
} as const;
const artifactSources = {
  "unit-of-work.md": `---\nid: ${artifactIds["unit-of-work.md"]}\ntype: unit-of-work\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Unit of Work\n\n## Purpose\n\nMake the selected workflow behavior explicit.\n\n## Scope\n\nInclude the Functional Design contract.\n\n## Context\n\nKeep the current public behavior and constraints.\n`,
  "design.md": `---\nid: ${artifactIds["design.md"]}\ntype: functional-design\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Design\n\n## Domain behavior\n\nThe result preserves the current contract and provides observable behavior.\n\n## Domain model\n\nThe model is described in [supporting detail](details/functional-design/domain-model.md).\n\n## Boundaries and interactions\n\nThe selected unit owns its functional behavior.\n\n## Design decisions and open questions\n\nNo unresolved material questions remain.\n`,
  "details/functional-design/domain-model.md": `---\nid: ${artifactIds["details/functional-design/domain-model.md"]}\ntype: supporting-document\nschema_version: 3\nunit_id: ${auditFixture.unitId}\nauthor: Ada Lovelace <ada@example.com>\n---\n# Domain model detail\n\nThe model preserves the current contract.\n`,
} as const;

export interface FunctionalDesignTestFixture {
  readonly root: string;
  readonly contexts: AuditContextResolver;
  readonly recording: AuditRecording;
  readonly artifactBindings: readonly { readonly artifact_id: string; readonly content_version: string }[];
  readonly checkpoints: readonly { readonly repository_id: string; readonly commit: string }[];
  readonly cleanup: () => Promise<void>;
}

export const createFunctionalDesignFixture = async (): Promise<FunctionalDesignTestFixture> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-functional-design-"));
  try {
    await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
    await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n", "utf8");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Kepler Integration"], { cwd: root });
    execFileSync("git", ["config", "user.email", "integration@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    await Fs.writeFile(Path.join(root, "README.md"), "# Functional Design fixture\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "Create Functional Design fixture"], { cwd: root });
    await createAuditHistory(root);
    const unitRoot = Path.join(root, completionUnitDirectory);
    await Fs.mkdir(Path.join(unitRoot, "details", "functional-design"), { recursive: true });
    const artifactBindings: Array<{ artifact_id: string; content_version: string }> = [];
    for (const [relativePath, source] of Object.entries(artifactSources)) {
      await Fs.writeFile(Path.join(unitRoot, relativePath), source, "utf8");
      artifactBindings.push({
        artifact_id: artifactIds[relativePath as keyof typeof artifactIds],
        content_version: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
      });
    }
    execFileSync("git", ["add", completionUnitDirectory], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "Record Functional Design material"], { cwd: root });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const projects = new ProjectResolver({
      cwd: () => root,
      fileSystem: {
        realpath: (path) => Fs.realpath(path),
        directoryExists: async (path) => {
          try {
            return (await Fs.stat(path)).isDirectory();
          } catch {
            return false;
          }
        },
      },
      git: {
        isBareRepository: async () => ({ status: 0, stdout: "false\n", stderr: "" }),
        repositoryRoot: async () => ({ status: 0, stdout: `${root}\n`, stderr: "" }),
        configValue: async () => ({ status: 0, stdout: "", stderr: "" }),
      },
    });
    const contexts = new AuditContextResolver({
      projects,
      fileSystem: createNodeAuditContextFileSystem(),
      journals: createNodeAuditJournalFactory(),
      identities: { next: randomUUID },
    });
    const recording = new AuditRecording(contexts, {
      identities: { next: randomUUID },
      now: () => "2026-10-21T14:00:00Z",
      producer: { name: "kepler-test", version: "0.10.3" },
    });
    return {
      root,
      contexts,
      recording,
      artifactBindings,
      checkpoints: [{ repository_id: "repo-main", commit }],
      cleanup: async () => Fs.rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await Fs.rm(root, { recursive: true, force: true });
    throw error;
  }
};

export const createStageCompletionService = (
  fixture: FunctionalDesignTestFixture,
): FunctionalDesignStageCompletion => new FunctionalDesignStageCompletion(
  fixture.contexts,
  createNodeFunctionalDesignStageCompletionRuntime({ name: "kepler-test", version: "0.10.3" }),
);

export const recordFunctionalDesignEvidence = async (
  fixture: FunctionalDesignTestFixture,
  options: {
    readonly attempt?: string;
    readonly stage?: ConstructionStage;
    readonly failedKind?: "self_review" | "decision_resolution" | "handoff";
  } = {},
): Promise<Record<string, string>> => {
  const attempt = options.attempt ?? auditFixture.stageAttemptId;
  const stage = options.stage ?? "functional-design";
  const evidenceIds: Record<string, string> = {};
  const entries = [
    ["self_review", "functional-design-self-review"],
    ["decision_resolution", "functional-design-decision-resolution"],
    ["handoff", "functional-design-quality-handoff"],
  ] as const;
  for (const [kind, check] of entries) {
    const result = await fixture.recording.execute("evidence", {
      unit: auditFixture.unitId,
      stage,
      attempt,
    }, {
      inputs: fixture.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current Functional Design material" })),
      artifact_bindings: fixture.artifactBindings,
      checkpoints: fixture.checkpoints,
      check,
      executor: "Functional Design assessment runner",
      result: {
        status: kind === options.failedKind ? "failed" : "passed",
        summary: kind === options.failedKind ? "A blocking finding remains." : "The named assessment passed.",
      },
    });
    if (result.kind !== "success") throw new Error(`Could not record evidence: ${JSON.stringify(result)}`);
    evidenceIds[kind] = String(result.data.evidence_id);
  }
  return evidenceIds;
};

export const recordFunctionalDesignApproval = async (
  fixture: FunctionalDesignTestFixture,
): Promise<string> => {
  const result = await fixture.recording.execute("approval", {
    unit: auditFixture.unitId,
    stage: "functional-design",
    attempt: auditFixture.stageAttemptId,
  }, {
    requester: "Requester",
    inputs: fixture.artifactBindings.map((binding) => ({ reference: `artifact:${binding.artifact_id}`, purpose: "Current Functional Design material approved" })),
    artifact_bindings: fixture.artifactBindings,
    checkpoints: fixture.checkpoints,
    decision_reference: "requester:approved-current-functional-design",
  });
  if (result.kind !== "success") throw new Error(`Could not record approval: ${JSON.stringify(result)}`);
  return String(result.data.id);
};

export const functionalDesignRequest = (
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
        summary: "Required content, observable criteria, consistency, blocking questions, and handoff were reviewed.",
        checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"],
        findings: [],
      },
      decision_resolution: {
        status: "resolved",
        evidence_id: evidenceIds.decision_resolution,
        summary: "Every consequential choice has an owner and resolution.",
        resolved_material_choices: [{ choice: "Preserve the existing public contract", owner: "Requester", resolution: "Keep current behavior unless an observable requirement says otherwise." }],
        unresolved_material_choices: [],
        unsupported_assumptions: [],
        quality_concerns: concerns,
        technical_questions: questions,
      },
      handoff: {
        status: "ready",
        evidence_id: evidenceIds.handoff,
        summary: "The complete Functional Design package is ready for Quality Requirements.",
        recipient: "quality-requirements",
        unit_directory: completionUnitDirectory,
        artifacts: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"],
        project_references: [],
        known_constraints: ["Preserve the current public contract."],
        quality_concerns: concerns,
        technical_questions: questions,
      },
    },
  };
};

export const historySnapshot = async (root: string): Promise<string> => {
  const directory = Path.join(root, ".kepler", "missions", auditFixture.missionId, "history", CONSTRUCTION_PHASE);
  const names = (await Fs.readdir(directory)).sort();
  const entries = await Promise.all(names.map(async (name) => [name, await Fs.readFile(Path.join(directory, name), "utf8")]));
  return JSON.stringify(entries);
};

export const completionSelectors = {
  unit: auditFixture.unitId,
  stage: "functional-design",
  attempt: auditFixture.stageAttemptId,
} as const;
