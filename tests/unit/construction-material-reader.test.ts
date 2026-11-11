import { createHash, randomUUID } from "node:crypto";
import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import * as Yaml from "yaml";
import type { AuditContextResolver, AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import { CONSTRUCTION_PHASE, validateConstructionEvent, type ConstructionEventRecord } from "../../packages/cli/src/construction/events.js";
import type { RepositoryArtifactFileSystem, RepositoryArtifactFileStatus } from "../../packages/cli/src/construction/artifacts.js";
import type { MissionWorkspaceRuntime } from "../../packages/cli/src/construction/mission-workspace.js";
import { FunctionalDesignStageCompletion, type FunctionalDesignStageCompletionRuntime } from "../../packages/cli/src/construction/stage-completion.js";
import { createNodeConstructionMaterialReader } from "../../packages/cli/src/construction/node-material-reader.js";
import type { ConstructionMaterialReadResult, ConstructionMaterialReader, FunctionalDesignMaterial, PlanningMaterial, StageArtifactMaterial } from "../../packages/cli/src/construction/material-reader.js";
import { missionWorkspaceKey } from "../../packages/cli/src/construction/mission-workspace.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const repositoryRoot = "/virtual/material-reader-repository";
const missionId = "b1000000-0000-4000-8000-000000000001";
const unitId = "2026-11-07-material-reader";
const unitDirectory = `construction/units-of-work/${unitId}`;
const persistedUnitDirectory = unitDirectory;
const fullUnitDirectory = `.kepler/missions/${missionId}/${unitDirectory}`;
const unitRoot = Path.resolve(repositoryRoot, fullUnitDirectory);
const commit = "a".repeat(40);

const artifactSource = (
  id: string,
  type: string,
  body: string,
  options: { readonly unit?: string; readonly author?: string } = {},
): string => `---\n${Yaml.stringify({
  id,
  type,
  schema_version: 3,
  ...(options.unit === undefined ? { unit_id: unitId } : { unit_id: options.unit }),
  author: options.author ?? "Ada Lovelace <ada@example.com>",
}).trimEnd()}\n---\n${body}`;

const unitOfWorkSource = artifactSource(
  "b2000000-0000-4000-8000-000000000002",
  "unit-of-work",
  "# Unit of Work\n\n## Purpose\n\nDefine the selected behavior.\n\n## Scope\n\nKeep the work bounded.\n\n## Context\n\nPreserve the existing contract.\n",
);
const functionalDesignSource = (supportLink = "details/functional-design/domain-model.md") => artifactSource(
  "b3000000-0000-4000-8000-000000000003",
  "functional-design",
  `# Design\n\n## Domain behavior\n\nKeep behavior stable.\n\n## Domain model\n\nSee [domain detail](${supportLink}).\n\n## Boundaries and interactions\n\nKeep the adapter boundary explicit.\n\n## Design decisions and open questions\n\nNo unresolved questions remain.\n`,
);
const supportingSource = (id: string, body = "# Supporting detail\n\nMaterial detail.\n") => artifactSource(
  id,
  "supporting-document",
  body,
);
const materialBindings = [
  { artifact_id: "b2000000-0000-4000-8000-000000000002", content_version: `sha256:${createHash("sha256").update(unitOfWorkSource, "utf8").digest("hex")}` },
  { artifact_id: "b3000000-0000-4000-8000-000000000003", content_version: `sha256:${createHash("sha256").update(functionalDesignSource(), "utf8").digest("hex")}` },
  { artifact_id: "b6000000-0000-4000-8000-000000000006", content_version: `sha256:${createHash("sha256").update(supportingSource("b6000000-0000-4000-8000-000000000006"), "utf8").digest("hex")}` },
];
const qualitySource = (supportLink = "details/quality-requirements/quality-detail.md") => artifactSource(
  "b4000000-0000-4000-8000-000000000004",
  "non-functional-requirements",
  `# Quality Requirements\n\n## Quality requirements\n\nMeet the selected quality target.\n\n## Constraints and dependencies\n\nRespect repository constraints.\n\n## Decisions and open questions\n\nNo unresolved questions. See [detail](${supportLink}).\n`,
);
const planningSource = (graphLink = "tasks-dag.json") => artifactSource(
  "b5000000-0000-4000-8000-000000000005",
  "implementation-plan",
  `# Implementation Plan\n\n## Technical solution\n\nKeep application behavior independent.\n\n## Task graph context\n\nUse [the task graph](${graphLink}).\n\n## Verification strategy\n\nRun focused checks.\n\n## Decisions and open questions\n\nNo unresolved questions.\n`,
);

const createMemoryFileSystem = (
  files: Readonly<Record<string, string>>,
  symlinks: Readonly<Record<string, string>> = {},
): RepositoryArtifactFileSystem => {
  const fileSources = new Map(Object.entries(files).map(([path, source]) => [Path.resolve(path), source]));
  const linkTargets = new Map(Object.entries(symlinks).map(([path, target]) => [Path.resolve(path), Path.resolve(target)]));
  const directories = new Set<string>([Path.resolve(repositoryRoot)]);
  const addParents = (path: string): void => {
    let parent = Path.dirname(path);
    while (parent !== Path.dirname(parent)) {
      directories.add(parent);
      parent = Path.dirname(parent);
    }
  };
  for (const path of fileSources.keys()) addParents(path);
  for (const path of linkTargets.keys()) addParents(path);
  const exists = (path: string): boolean => fileSources.has(path) || directories.has(path) || linkTargets.has(path);
  const status = (path: string): RepositoryArtifactFileStatus => ({
    dev: 1,
    ino: [...fileSources.keys(), ...directories].indexOf(path) + 1,
    isFile: () => fileSources.has(path),
    isDirectory: () => directories.has(path),
  });
  return {
    readFile: async (path) => {
      const source = fileSources.get(Path.resolve(path));
      if (source === undefined) throw new Error(`Missing in-memory file: ${path}`);
      return source;
    },
    writeFile: async () => {
      throw new Error("The in-memory material reader filesystem is read-only");
    },
    realpath: async (path) => {
      const absolute = Path.resolve(path);
      const target = linkTargets.get(absolute);
      if (target !== undefined) return target;
      if (!exists(absolute)) throw new Error(`Missing in-memory path: ${path}`);
      return absolute;
    },
    stat: async (path) => {
      const absolute = Path.resolve(path);
      if (!exists(absolute)) throw new Error(`Missing in-memory path: ${path}`);
      return status(absolute);
    },
  };
};

const artifactFiles = (): Record<string, string> => {
  const files: Record<string, string> = {
    [Path.join(unitRoot, "unit-of-work.md")]: unitOfWorkSource,
    [Path.join(unitRoot, "design.md")]: functionalDesignSource(),
    [Path.join(unitRoot, "details/functional-design/domain-model.md")]: supportingSource("b6000000-0000-4000-8000-000000000006"),
  };
  return Object.fromEntries(Object.entries(files).map(([path, source]) => [Path.resolve(repositoryRoot, path), source]));
};

const planningFiles = (graph = taskGraphExample()): Record<string, string> => {
  const ownedGraph = { ...graph, unit_id: unitId };
  return Object.fromEntries(Object.entries({
    [Path.join(unitRoot, "plan.md")]: planningSource(),
    [Path.join(unitRoot, "tasks-dag.json")]: `${JSON.stringify(ownedGraph)}\n`,
    [Path.join(unitRoot, "details/implementation-planning/plan-detail.md")]: supportingSource("b7000000-0000-4000-8000-000000000007"),
  }).map(([path, source]) => [Path.resolve(repositoryRoot, path), source]));
};

const readerRequest = {
  repositoryRoot,
  missionId,
  unitId,
  persistedUnitDirectory,
} as const;

const testEvent = (
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[] = [],
  eventVersion = 1,
): ConstructionEventRecord => {
  const validation = validateConstructionEvent({
    id: randomUUID(),
    phase: CONSTRUCTION_PHASE,
    type,
    envelope_version: 1,
    event_version: eventVersion,
    journal_id: randomUUID(),
    recorded_at: "2026-11-07T12:00:00.000Z",
    producer: { name: "kepler-test", version: "1.0.0" },
    caused_by: [...new Set(causedBy)],
    data,
  });
  if (validation.status !== "valid") throw new Error(`Invalid ${type} fixture: ${JSON.stringify(validation)}`);
  return validation.event;
};

const historyFact = (event: ConstructionEventRecord) => ({
  sourceId: `fixture/${event.journal_id}`,
  journalId: event.journal_id,
  line: 1,
  byteOffset: 0,
  event,
});

const completionRequest = (ids: { readonly selfReview: string; readonly decision: string; readonly handoff: string; readonly approval: string }) => {
  const concerns = [{ concern: "Define observability targets.", responsible_stage: "quality-requirements", owner: "Quality Requirements owner" }];
  const questions = [{ question: "Select implementation details.", responsible_stage: "implementation-planning", owner: "Planning owner" }];
  return {
    approval_event_id: ids.approval,
    assessments: {
      self_review: {
        status: "passed",
        evidence_id: ids.selfReview,
        reviewer: "Functional Design owner",
        summary: "Every required review dimension passed.",
        checks: ["required-content", "observable-acceptance", "consistency", "blocking-questions", "downstream-handoff"],
        findings: [],
      },
      decision_resolution: {
        status: "resolved",
        evidence_id: ids.decision,
        summary: "Every material choice has an owner and resolution.",
        resolved_material_choices: [{ choice: "Preserve public behavior", owner: "Requester", resolution: "Retain the current contract." }],
        unresolved_material_choices: [],
        unsupported_assumptions: [],
        quality_concerns: concerns,
        technical_questions: questions,
      },
      handoff: {
        status: "ready",
        evidence_id: ids.handoff,
        summary: "All material is ready for the next stage.",
        recipient: "quality-requirements",
        unit_directory: fullUnitDirectory,
        artifacts: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"],
        project_references: [],
        known_constraints: ["Preserve public behavior."],
        quality_concerns: concerns,
        technical_questions: questions,
      },
    },
  };
};

const createFunctionalDesignContext = (options: { readonly staleEvidence?: boolean } = {}) => {
  const attemptId = "b8000000-0000-4000-8000-000000000008";
  const evidenceIds = {
    selfReview: "b9000000-0000-4000-8000-000000000009",
    decision: "ba000000-0000-4000-8000-00000000000a",
    handoff: "bb000000-0000-4000-8000-00000000000b",
    approval: "bc000000-0000-4000-8000-00000000000c",
  };
  const missionCreated = testEvent("construction.mission-created", {
    mission_id: missionId,
    title: "Material reader test",
    request: "Exercise the application contract.",
    workflow: "standard",
    record_home: { repository_id: "repo-main" },
    contexts: [],
    repositories: [{
      repository_id: "repo-main",
      context: { kind: "existing" },
      branch: { kind: "current" },
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit },
    }],
  });
  const workspacesPrepared = testEvent("construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [{
      repository_id: "repo-main",
      context: { kind: "existing" },
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit },
    }],
  }, [missionCreated.id]);
  const unitCreated = testEvent("construction.unit-created", {
    mission_id: missionId,
    unit_id: unitId,
    directory: unitDirectory,
    workflow: "standard",
    initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" },
  }, [missionCreated.id]);
  const start = testEvent("construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: attemptId,
    inputs: [{ reference: "request:behavior", purpose: "Selected behavior" }],
    checkpoints: [{ repository_id: "repo-main", commit }],
    authority_event_ids: [],
  }, [unitCreated.id]);
  const evidenceBindings = options.staleEvidence
    ? materialBindings.map((binding) => ({ ...binding, content_version: `sha256:${"c".repeat(64)}` }))
    : materialBindings;
  const evidenceEvents = [
    [evidenceIds.selfReview, "functional-design-self-review"],
    [evidenceIds.decision, "functional-design-decision-resolution"],
    [evidenceIds.handoff, "functional-design-quality-handoff"],
  ].map(([evidenceId, check]) => testEvent("construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: attemptId,
    evidence_id: evidenceId,
    artifact_bindings: evidenceBindings,
    checkpoints: [{ repository_id: "repo-main", commit }],
    inputs: [],
    check,
    executor: "agent:functional-design",
    result: { status: "passed", summary: "The assessment passed." },
    output_refs: [`test:${check}`],
    conditions: [],
  }, [start.id]));
  const approval = testEvent("construction.approval-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "functional-design",
    stage_attempt_id: attemptId,
    artifact_bindings: materialBindings,
    checkpoints: [{ repository_id: "repo-main", commit }],
    requester: "Requester",
    inputs: [],
    decision_reference: "request:approved-design",
  }, [start.id]);
  const events = [missionCreated, workspacesPrepared, unitCreated, start, ...evidenceEvents, approval];
  const unit = {
    unitId,
    missionId,
    workflow: "standard",
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    created: historyFact(unitCreated),
    stages: [{
      stage: "functional-design",
      state: "running",
      currentAttemptId: attemptId,
      attempts: [{ attemptId, state: "running", facts: [historyFact(start)] }],
      facts: [historyFact(start)],
    }],
    evidence: evidenceEvents.map((event) => ({ fact: historyFact(event) })),
    approvals: [{ fact: historyFact(approval) }],
  };
  const loaded = {
    kind: "loaded",
    root: repositoryRoot,
    missionId,
    history: { missionId, events: events.map(historyFact), issues: [] },
    projection: { units: [unit] },
    unit,
  } as unknown as Extract<AuditHistoryReadResult, { kind: "loaded" }>;
  return {
    loaded,
    attemptId,
    evidenceIds,
    request: completionRequest({ ...evidenceIds, approval: approval.id }),
  };
};

const createPublicCompletion = (
  loaded: Extract<AuditHistoryReadResult, { kind: "loaded" }>,
  materialReader: ConstructionMaterialReader,
) => {
  const commonDirectory = Path.join(repositoryRoot, ".git");
  const workspaceId = missionWorkspaceKey(commonDirectory, repositoryRoot);
  const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces");
  const attachmentName = `${workspaceId}.json`;
  const attachmentPath = Path.join(attachmentDirectory, attachmentName);
  const attachment = JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: "repo-main",
    repository_id: "repo-main",
    workspace_id: workspaceId,
    workspace_path: repositoryRoot,
    repository_path: repositoryRoot,
    git_directory: commonDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "commit", commit },
  });
  const blob = "d".repeat(40);
  const gitCalls: string[] = [];
  const appended: ConstructionEventRecord[] = [];
  const gitRun: MissionWorkspaceRuntime["git"]["run"] = async (_cwd, args) => {
    gitCalls.push(args.join(" "));
    const command = args.join(" ");
    if (command === "rev-parse --path-format=absolute --git-common-dir") return { status: 0, stdout: `${commonDirectory}\n`, stderr: "" };
    if (command === "rev-parse --show-toplevel") return { status: 0, stdout: `${repositoryRoot}\n`, stderr: "" };
    if (command === "rev-parse --absolute-git-dir") return { status: 0, stdout: `${commonDirectory}\n`, stderr: "" };
    if (command === "symbolic-ref --quiet --short HEAD") return { status: 0, stdout: "main\n", stderr: "" };
    if (command === "rev-parse --verify HEAD^{commit}" || command === `rev-parse --verify ${commit}^{commit}`) return { status: 0, stdout: `${commit}\n`, stderr: "" };
    if (args[0] === "rev-parse" && args[1] === "--verify" && args[2]?.startsWith(`${commit}:`)) return { status: 0, stdout: `${blob}\n`, stderr: "" };
    if (args[0] === "hash-object") return { status: 0, stdout: `${blob}\n`, stderr: "" };
    throw new Error(`Unexpected fake Git command: ${command}`);
  };
  const filesystem: MissionWorkspaceRuntime["fileSystem"] = {
    pathKind: async (path) => path === repositoryRoot || path === attachmentDirectory ? "directory" : path === attachmentPath ? "file" : "missing",
    realpath: async (path) => path,
    mkdir: async () => { throw new Error("Unexpected filesystem write"); },
    readFile: async (path) => {
      if (path === attachmentPath) return attachment;
      throw new Error(`Unexpected filesystem read: ${path}`);
    },
    readDirectory: async (path) => path === attachmentDirectory ? [attachmentName] : [],
    writeFileExclusive: async () => { throw new Error("Unexpected filesystem write"); },
  };
  const coordination: MissionWorkspaceRuntime["coordination"] = {
    acquire: async () => ({
      kind: "acquired",
      lease: {
        lockPath: Path.join(commonDirectory, "lock"),
        owner: {
          token: randomUUID(), machine_id: "test-machine", process_id: 1,
          process_incarnation_id: "bd000000-0000-4000-8000-00000000000d",
          mission_id: missionId, resource_scope: "test",
        },
        release: async () => ({ kind: "released" }),
      },
    }),
    release: async () => ({ kind: "released" }),
  };
  const workspace = {
    cwd: repositoryRoot,
    git: { run: gitRun, findReachableObjects: async () => ({ status: 0, objectIds: [], stderr: "" }) },
    fileSystem: filesystem,
    coordination,
    identity: { machine_id: "test-machine", process_id: 1, process_incarnation_id: "bd000000-0000-4000-8000-00000000000d" },
  } as MissionWorkspaceRuntime;
  const identityIds = ["be000000-0000-4000-8000-00000000000e", "bf000000-0000-4000-8000-00000000000f"];
  const runtime: FunctionalDesignStageCompletionRuntime = {
    workspace,
    materialReader,
    identities: { next: () => identityIds.shift() ?? randomUUID() },
    now: () => "2026-11-07T12:30:00.000Z",
    producer: { name: "kepler-test", version: "1.0.0" },
    journals: {
      create: () => ({ append: async (event: ConstructionEventRecord) => { appended.push(event); } }) as unknown as EventJournal,
    },
  };
  const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
  const service = new FunctionalDesignStageCompletion(contexts, runtime);
  return {
    service,
    selectors: { unit: unitId, stage: "functional-design", attempt: loaded.unit.stages[0]?.currentAttemptId } as ScopeSelectors,
    appended,
    gitCalls,
  };
};

const functionalDesignReader = (
  result: ConstructionMaterialReadResult<FunctionalDesignMaterial>,
): ConstructionMaterialReader => ({
  readFunctionalDesignMaterial: async () => result,
  readStageArtifactMaterial: async (): Promise<ConstructionMaterialReadResult<StageArtifactMaterial>> => ({
    kind: "invalid",
    diagnostics: [],
  }),
  readPlanningMaterial: async (): Promise<ConstructionMaterialReadResult<PlanningMaterial>> => ({
    kind: "invalid",
    diagnostics: [],
  }),
});

const validFunctionalMaterial: FunctionalDesignMaterial = {
  artifactBindings: materialBindings,
  artifactPaths: ["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"],
  unitDirectory: fullUnitDirectory,
};

describe("Construction material reader", () => {
  it("reads required and linked Functional Design material through an injected in-memory filesystem", async () => {
    const reader = createNodeConstructionMaterialReader(createMemoryFileSystem(artifactFiles()));

    const result = await reader.readFunctionalDesignMaterial(readerRequest);

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.material.unitDirectory).toBe(fullUnitDirectory);
    expect(result.material.artifactPaths).toEqual(["unit-of-work.md", "design.md", "details/functional-design/domain-model.md"]);
    expect(result.material.artifactBindings.map((binding) => binding.content_version)).toEqual(
      [functionalDesignSource(), supportingSource("b6000000-0000-4000-8000-000000000006"), unitOfWorkSource]
        .map((source) => `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`),
    );
  });

  it("reads ordinary stage artifacts and validates Planning graph links and identities with the same injected filesystem", async () => {
    const files = {
      ...planningFiles(),
      [Path.resolve(repositoryRoot, Path.join(unitRoot, "quality.md"))]: qualitySource(),
      [Path.resolve(repositoryRoot, Path.join(unitRoot, "details/quality-requirements/quality-detail.md"))]: supportingSource("c1000000-0000-4000-8000-000000000001"),
    };
    const reader = createNodeConstructionMaterialReader(createMemoryFileSystem(files));
    const quality = await reader.readStageArtifactMaterial({
      ...readerRequest,
      primaryArtifact: "quality.md",
      supportFolder: "quality-requirements",
    });
    const planning = await reader.readPlanningMaterial({
      ...readerRequest,
      primaryArtifact: "plan.md",
      supportFolder: "implementation-planning",
      recordHomeRepositoryIds: ["repo-main"],
      executionIdentities: [],
    });

    expect(quality.kind).toBe("valid");
    expect(planning.kind).toBe("valid");
    if (planning.kind === "valid") {
      expect(planning.material.graphRef.content_version).toBe(
        `sha256:${createHash("sha256").update(files[Path.resolve(repositoryRoot, Path.join(unitRoot, "tasks-dag.json"))]!, "utf8").digest("hex")}`,
      );
      expect(planning.material.taskIds).toEqual(taskGraphExample().tasks.map(({ id }) => id).sort());
    }
  });

  it("rejects missing required artifacts, duplicate artifact identities, and linked support escaping its stage directory", async () => {
    const missing = createNodeConstructionMaterialReader(createMemoryFileSystem({
      [Path.resolve(repositoryRoot, Path.join(unitRoot, "unit-of-work.md"))]: unitOfWorkSource,
    }));
    const missingResult = await missing.readFunctionalDesignMaterial(readerRequest);
    expect(missingResult).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "invalid-path" })] });

    const duplicateFiles = artifactFiles();
    duplicateFiles[Path.resolve(repositoryRoot, Path.join(unitRoot, "details/functional-design/domain-model.md"))] = supportingSource("b2000000-0000-4000-8000-000000000002");
    const duplicateResult = await createNodeConstructionMaterialReader(createMemoryFileSystem(duplicateFiles)).readFunctionalDesignMaterial(readerRequest);
    expect(duplicateResult).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "duplicate-artifact-id" })] });

    const escapePath = Path.resolve(repositoryRoot, Path.join(unitRoot, "details/functional-design/domain-model.md"));
    const outsidePath = "/virtual/outside/domain-model.md";
    const linkedResult = await createNodeConstructionMaterialReader(createMemoryFileSystem({
      ...artifactFiles(),
      [outsidePath]: supportingSource("c2000000-0000-4000-8000-000000000002"),
    }, { [escapePath]: outsidePath })).readFunctionalDesignMaterial(readerRequest);
    expect(linkedResult).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "outside-repository" })] });
  });

  it("rejects missing graph links, invalid graphs, and execution-identity collisions", async () => {
    const unlinkedFiles = planningFiles();
    unlinkedFiles[Path.resolve(repositoryRoot, Path.join(unitRoot, "plan.md"))] = planningSource("details/implementation-planning/plan-detail.md");
    const unlinked = await createNodeConstructionMaterialReader(createMemoryFileSystem(unlinkedFiles)).readPlanningMaterial({
      ...readerRequest,
      primaryArtifact: "plan.md",
      supportFolder: "implementation-planning",
      recordHomeRepositoryIds: ["repo-main"],
      executionIdentities: [],
    });
    expect(unlinked).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ code: "task-graph-link-missing" })] });

    const malformedFiles = planningFiles();
    malformedFiles[Path.resolve(repositoryRoot, Path.join(unitRoot, "tasks-dag.json"))] = "{invalid\n";
    const malformed = await createNodeConstructionMaterialReader(createMemoryFileSystem(malformedFiles)).readPlanningMaterial({
      ...readerRequest,
      primaryArtifact: "plan.md",
      supportFolder: "implementation-planning",
      recordHomeRepositoryIds: ["repo-main"],
      executionIdentities: [],
    });
    expect(malformed.kind).toBe("invalid");
    if (malformed.kind === "invalid") expect(malformed.diagnostics.map((item) => item.code)).toContain("invalid-json");

    const graph = taskGraphExample();
    const collision = await createNodeConstructionMaterialReader(createMemoryFileSystem(planningFiles(graph))).readPlanningMaterial({
      ...readerRequest,
      primaryArtifact: "plan.md",
      supportFolder: "implementation-planning",
      recordHomeRepositoryIds: ["repo-main"],
      executionIdentities: [graph.id],
    });
    expect(collision.kind).toBe("invalid");
    if (collision.kind === "invalid") expect(collision.diagnostics.map((item) => item.code)).toContain("identity-collision");
  });
});

describe("Functional Design completion reader boundary", () => {
  const selectors = { unit: unitId, stage: "functional-design", attempt: "b8000000-0000-4000-8000-000000000008" } as ScopeSelectors;

  it("completes from injected material results without native Git, filesystem, or journal effects", async () => {
    const fixture = createFunctionalDesignContext();
    const reader = functionalDesignReader({ kind: "valid", material: validFunctionalMaterial });
    const publicCompletion = createPublicCompletion(fixture.loaded, reader);

    const result = await publicCompletion.service.execute(selectors, fixture.request);

    expect(result.kind, JSON.stringify(result)).toBe("success");
    expect(publicCompletion.appended).toHaveLength(1);
    expect(publicCompletion.gitCalls).toContain("rev-parse --verify HEAD^{commit}");
    expect(publicCompletion.appended[0]).toMatchObject({
      type: "construction.stage-attempt-completed",
      data: { stage: "functional-design", stage_attempt_id: fixture.attemptId },
    });
  });

  it("returns existing invalid-material and stale-evidence diagnostics from the application contract", async () => {
    const fixture = createFunctionalDesignContext();
    const diagnostics = [{ path: "design.md", code: "missing-section", message: "Required section is missing." }];
    const invalidCompletion = createPublicCompletion(fixture.loaded, functionalDesignReader({ kind: "invalid", diagnostics }));

    const invalidResult = await invalidCompletion.service.execute(selectors, fixture.request);

    expect(invalidResult).toMatchObject({ kind: "failed", data: { code: "functional_design_artifacts_invalid", details: { diagnostics } } });
    expect(invalidCompletion.appended).toHaveLength(0);
    expect(invalidCompletion.gitCalls).toEqual(["rev-parse --path-format=absolute --git-common-dir"]);

    const staleFixture = createFunctionalDesignContext({ staleEvidence: true });
    const staleCompletion = createPublicCompletion(staleFixture.loaded, functionalDesignReader({ kind: "valid", material: validFunctionalMaterial }));
    const staleResult = await staleCompletion.service.execute(selectors, staleFixture.request);
    expect(staleResult).toMatchObject({ kind: "failed", data: { code: "functional_design_evidence_invalid" } });
    expect(staleCompletion.appended).toHaveLength(0);
  });

  it("rejects mismatched handoff material and reader failures without appending history", async () => {
    const fixture = createFunctionalDesignContext();
    const mismatched: FunctionalDesignMaterial = { ...validFunctionalMaterial, artifactPaths: ["design.md"] };
    const mismatchCompletion = createPublicCompletion(fixture.loaded, functionalDesignReader({ kind: "valid", material: mismatched }));
    const mismatchResult = await mismatchCompletion.service.execute(selectors, fixture.request);
    expect(mismatchResult).toMatchObject({ kind: "failed", data: { code: "functional_design_handoff_mismatch" } });
    expect(mismatchCompletion.appended).toHaveLength(0);

    const failedReader = functionalDesignReader({ kind: "valid", material: validFunctionalMaterial });
    const throwingReader: ConstructionMaterialReader = {
      ...failedReader,
      readFunctionalDesignMaterial: async () => { throw new Error("reader unavailable"); },
    };
    const failureCompletion = createPublicCompletion(fixture.loaded, throwingReader);
    const failureResult = await failureCompletion.service.execute(selectors, fixture.request);
    expect(failureResult).toMatchObject({ kind: "failed", data: { code: "stage_completion_failed", details: { message: "reader unavailable" } } });
    expect(failureCompletion.appended).toHaveLength(0);
  });
});
