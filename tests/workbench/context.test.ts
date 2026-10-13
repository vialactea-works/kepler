import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ContextService,
  createContextRuntime,
  renderContextResult,
  type ContextArguments,
  type ContextRuntime,
} from "../../packages/cli/src/workbench/context.js";
import {
  taskBreakdownDigest,
  taskBreakdownDigestFromDefinitions,
  taskDefinitionDigest,
} from "../../packages/cli/src/workbench/artifact-body.js";
import {
  cleanupRepos,
  commitAll,
  commitPaths,
  fixtureEnvironment,
  git,
  makeChangeDir,
  makeRepo,
  write,
} from "./helpers.js";

const sourceCli = fileURLToPath(new URL("../../packages/cli/src/cli/main.ts", import.meta.url));

const sourceContext = (cwd: string, changeDir: string) => {
  const result = spawnSync(
    "bun",
    [sourceCli, "workbench", "context", changeDir],
    { cwd, encoding: "utf8", env: fixtureEnvironment },
  );
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const sourceCliTsconfig = (repository: string) => {
  write(
    repository,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2024",
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        module: "Node16",
        moduleResolution: "node16",
      },
    }),
  );
};

const proposal = `# Proposal: Add auth

| Route unit | .kepler/maps/auth/route.md — unit 2 |
`;
const plan = `# Plan: add auth

| Route unit | .kepler/maps/auth/route.md — unit 2 |

## Overview

Implement the selected route unit.

## Tasks

### Task 1: Add the auth | session

### Task 2: Wire it into the router

## Done when

The selected route unit is complete.
`;
const progress = `# Progress: add auth

| Task | Status | Progress |
|---|---|---|
| Task 1: Add the auth \\| session | done | [details](tasks/task-1/progress.md) |
| Task 2: Wire it into the router | blocked | [details](tasks/task-2/progress.md) |
`;
const taskProgress = (
  task: number,
  title: string,
  outcome = "done",
) => `# Task Progress: Task ${task} — ${title}

## Attempt 1 — 2026-09-12

- Outcome: ${outcome}
`;
const splitFiles = {
  "proposal.md": proposal,
  "plan.md": plan,
  "progress.md": progress,
  "tasks/task-1/progress.md": taskProgress(1, "Add the auth | session"),
  "tasks/task-2/progress.md": taskProgress(
    2,
    "Wire it into the router",
    "blocked",
  ),
  "requirements/auth.md": "# Auth\n",
};
const currentReview = (
  change: string,
  title: string,
  base: string,
  head = base,
) => `---
artifact: review
change: ${change}
created: 2026-09-13
status: complete
verdict: approved
decision: accepted
base: ${base}
head: ${head}
---
# Whole-branch Review: ${title}

## Pass 1 — 2026-09-13
### Blocking
- None.
### Suggestions
- None.
`;

type EvidenceVerdict = "approved" | "changes-requested";

const reviewPass = (
  number: number,
  date: string,
  base: string,
  head: string,
  verdict: EvidenceVerdict,
  blocking = "- None.",
) => `## Pass ${number} — ${date}
Base: ${base}
Head: ${head}
Verdict: ${verdict}
### Blocking
${blocking}
### Suggestions
- None.
`;

const legacyReviewPass = (
  number: number,
  date: string,
  blocking = "- None.",
) => `## Pass ${number} — ${date}
### Blocking
${blocking}
### Suggestions
- None.
`;

const feedbackEvidence = (
  change: string,
  passes: string,
  global?: { readonly base: string; readonly head: string; readonly verdict: EvidenceVerdict },
) => `---
artifact: feedback
change: ${change}
task: 1
created: 2026-09-13
status: resolved
decision: accepted
${global ? `base: ${global.base}\nhead: ${global.head}\nverdict: ${global.verdict}\n` : ""}---
# Code Feedback: Task 1 — Add the auth | session

${passes}`;

const reviewEvidence = (
  change: string,
  title: string,
  passes: string,
  global?: { readonly base: string; readonly head: string; readonly verdict: EvidenceVerdict },
) => `---
artifact: review
change: ${change}
created: 2026-09-13
status: complete
decision: accepted
${global ? `base: ${global.base}\nhead: ${global.head}\nverdict: ${global.verdict}\n` : ""}---
# Whole-branch Review: ${title}

${passes}`;

const authRoute = `---
artifact: route
effort: auth
status: shipping
created: 2026-09-12
updated: 2026-09-12
decision: accepted
units:
  - id: 1
    name: Foundation
    status: shipped
    depends_on: []
    backed_by: [tickets/01-foundation.md]
  - id: 2
    name: Add auth
    status: pending
    depends_on: [1]
    backed_by: [tickets/02-auth.md]
---
# Route — Auth

## Point of departure

## Destination

## Path chosen

## Shipping rules

## Units

### 1. Foundation

### 2. Add auth
`;

const seed = (
  repository: string,
  slug: string,
  files: Record<string, string>,
) => {
  const directory = makeChangeDir(repository, slug);
  for (const [file, content] of Object.entries(files))
    write(directory, file, content);
  if (Object.values(files).some((content) => content.includes(".kepler/maps/auth/route.md"))) {
    const routePath = Path.join(repository, ".kepler/maps/auth/route.md");
    const routeExists = Fs.existsSync(routePath);
    const routeMatches = routeExists && Fs.readFileSync(routePath, "utf8") === authRoute;
    if (!routeMatches) {
      write(repository, ".kepler/maps/auth/route.md", authRoute);
      commitPaths(repository, "route fixture", ".kepler/maps/auth/route.md");
    }
  }
  return directory;
};

const createInitialContextScaffold = (
  priorDeletedProgress = false,
  dependencyMode = false,
) => {
  const repository = makeRepo();
  const directory = makeChangeDir(repository, "scaffold");
  const base = git(repository, "rev-parse", "HEAD");
  if (priorDeletedProgress) {
    const progressPath = ".kepler/changes/scaffold/progress.md";
    write(repository, progressPath, "prior pending ledger\n");
    commitPaths(repository, "write initial ledger", progressPath);
    Fs.rmSync(Path.join(repository, progressPath));
    commitAll(repository, "delete prior ledger");
  }
  const definition = dependencyMode
    ? "### Task 1: Create file\n\n- Goal: Create the required file.\n- Depends on: none\n- Acceptance:\n  - The required file is verified.\n- Steps:\n  1. Verify the file behavior.\n- Verify: bun --bun vitest run\n- Commit: feat: create required file"
    : "### Task 1: Create file\n\n- Depends on: none\n- Files: src/new.ts";
  const inputContext = JSON.stringify({
    version: 1,
    repository,
    intentCommit: "tactical:scaffold-fixture",
    taskDefinition: taskDefinitionDigest(definition),
    inputs: [],
  });
  const taskBlock = `${definition}\n- Notes: ${inputContext}`;
  const breakdown = taskBreakdownDigest(
    [1],
    [{
      id: 1,
      title: "Create file",
      dependsOn: [],
      filesDeclared: !dependencyMode,
      files: dependencyMode ? [] : ["src/new.ts"],
      source: definition,
    }],
  );
  write(
    repository,
    ".kepler/changes/scaffold/plan.md",
    `---\nartifact: plan\nchange: scaffold\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\n${dependencyMode ? "execution:\n  version: 2\n  mode: dependencies\n" : ""}initialization:\n  version: 1\n  base: ${base}\n  authority: requester-message-1\n  breakdown: ${breakdown}\n  taskIds: [1]\n---\n# Plan: Scaffold\n\n## Overview\n\n## Tasks\n\n${taskBlock}\n\n## Done when\n\nThe initial work is complete.\n`,
  );
  return { repository, directory, breakdown, base };
};

const runContext = (
  args: ContextArguments = {},
  runtime: ContextRuntime = createContextRuntime(),
) => new ContextService(runtime).execute(args);

afterEach(cleanupRepos);

describe("change context", () => {
  it("renders a deterministic split inventory and task standing", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "add-auth", splitFiles);
    const first = await runContext({ changeDir: directory });
    const second = await runContext({ changeDir: directory });

    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout).toContain("format: split");
    expect(first.stdout).toContain(
      "route-unit: .kepler/maps/auth/route.md — unit 2",
    );
    expect(first.stdout).toMatch(/route-unit-revision: [a-f0-9]{40}/);
    expect(first.stdout).toMatch(/proposal\.md\s+present/);
    expect(first.stdout).toContain("requirements/  present  auth");
    expect(first.stdout).toContain("Task 1: done, feedback: absent");
    expect(first.stdout).toContain("Task 2: blocked, feedback: absent");
    expect(first.lastLine).toBe(
      "summary: add-auth — 1/2 tasks done, whole change: not reviewed",
    );
    expect(renderContextResult(first)).toBe(first.stdout.trimEnd());
  });

  it("uses a planned route binding when a current proposal has no route unit", async () => {
    const repository = makeRepo();
    const proposal = `---\nartifact: proposal\nchange: modern\nstatus: approved\ndecision: accepted\nauthor: Test <test@example.com>\ncreated: 2026-09-12\nroute_unit: null\n---\n# Proposal: Add auth\n\n## Why\n\n## Goals & Success Criteria\n\n## Non-Goals\n\n## Proposed Change\n\n## Capabilities\n\n## Impact\n`;
    const planSource = `---\nartifact: plan\nchange: modern\nstatus: approved\ndecision: accepted\nauthor: Test <test@example.com>\ncreated: 2026-09-12\nroute_unit: .kepler/maps/auth/route.md — unit 2\n---\n${plan}`;
    const directory = seed(repository, "modern", {
      ...splitFiles,
      "proposal.md": proposal,
      "plan.md": planSource,
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "route-unit: .kepler/maps/auth/route.md — unit 2",
    );
    expect(result.stdout).toMatch(/route-unit-revision: [a-f0-9]{40}/);
  });

  it("requires a real route unit at the committed route revision", async () => {
    const missingRepository = makeRepo();
    const missingDirectory = seed(missingRepository, "missing-route-unit", {
      ...splitFiles,
      "proposal.md": proposal.replace("unit 2", "unit 3"),
      "plan.md": plan.replace("unit 2", "unit 3"),
    });
    const missing = await runContext({ changeDir: missingDirectory });

    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr).toContain("route unit 3 does not exist");

    const dirtyRepository = makeRepo();
    const dirtyDirectory = seed(dirtyRepository, "dirty-route", splitFiles);
    write(
      dirtyRepository,
      ".kepler/maps/auth/route.md",
      authRoute.replace("status: shipping", "status: open"),
    );
    const dirty = await runContext({ changeDir: dirtyDirectory });

    expect(dirty.exitCode).not.toBe(0);
    expect(dirty.stderr).toContain("route binding differs from its committed revision");
  });

  it("reports both conflicting route bindings and returns a nonzero status", async () => {
    const repository = makeRepo();
    const proposal = `---\nartifact: proposal\nchange: conflict\nstatus: approved\ndecision: accepted\nauthor: Test <test@example.com>\ncreated: 2026-09-12\nroute_unit: .kepler/maps/auth/route.md — unit 1\n---\n# Proposal: Add auth\n\n## Why\n\n## Goals & Success Criteria\n\n## Non-Goals\n\n## Proposed Change\n\n## Capabilities\n\n## Impact\n`;
    const planSource = `---\nartifact: plan\nchange: conflict\nstatus: approved\ndecision: accepted\nauthor: Test <test@example.com>\ncreated: 2026-09-12\nroute_unit: null\n---\n${plan}`;
    const directory = seed(repository, "conflict", {
      ...splitFiles,
      "proposal.md": proposal,
      "plan.md": planSource,
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).not.toBe(0);
    expect(result.status).toBe("error");
    expect(result.stderr).toContain("route binding conflict");
    expect(result.stderr).toContain("proposal.md route_unit=\".kepler/maps/auth/route.md — unit 1\"");
    expect(result.stderr).toContain("plan.md route_unit=null");

    const distinctRepository = makeRepo();
    const distinctDirectory = seed(distinctRepository, "distinct-route-conflict", {
      ...splitFiles,
      "proposal.md": proposal.replace("change: conflict", "change: distinct-route-conflict"),
      "plan.md": planSource
        .replace("change: conflict", "change: distinct-route-conflict")
        .replace(
          "route_unit: null",
          "route_unit: .kepler/maps/auth/route.md — unit 2",
        ),
    });
    const distinct = await runContext({ changeDir: distinctDirectory });

    expect(distinct.exitCode, `${distinct.stdout}\n${distinct.stderr}`).not.toBe(0);
    expect(distinct.stderr).toContain("route binding conflict");
    expect(distinct.stderr).toContain("proposal.md route_unit=\".kepler/maps/auth/route.md — unit 1\"");
    expect(distinct.stderr).toContain("plan.md route_unit=\".kepler/maps/auth/route.md — unit 2\"");
  });

  it("reports identity and execution orders separately and detects changed task inputs", async () => {
    const repository = makeRepo();
    const directory = makeChangeDir(repository, "scheduled");
    write(repository, "AGENTS.md", "Use verified commands.\n");
    commitPaths(repository, "standards", "AGENTS.md");
    const inputBlob = git(repository, "rev-parse", "HEAD:AGENTS.md");
    const taskData = [
      { id: 1, title: "First", dependsOn: "none" },
      { id: 2, title: "Second", dependsOn: "Task 4" },
      { id: 3, title: "Third", dependsOn: "Task 2" },
      { id: 4, title: "Prerequisite", dependsOn: "Task 1" },
    ];
    const taskBlocks = taskData.map(({ id, title, dependsOn }) => {
      const definition = `### Task ${id}: ${title}\n\n- Depends on: ${dependsOn}\n- Files: src/task-${id}.ts`;
      const inputContext = JSON.stringify({
        version: 1,
        repository,
        intentCommit: "tactical:context-fixture",
        taskDefinition: taskDefinitionDigest(definition),
        inputs: [{ path: "AGENTS.md", blob: inputBlob }],
      });
      return `${definition}\n- Notes: ${inputContext}`;
    });
    write(
      repository,
      ".kepler/changes/scheduled/plan.md",
      `---\nartifact: plan\nchange: scheduled\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\nexecution:\n  version: 1\n  order: [1, 4, 2, 3]\n---\n# Plan: Scheduled\n\n## Overview\n\n\`\`\`md\n### Task 99: Fake\n- Depends on: Task 1\n\`\`\`\n\n## Tasks\n\n${taskBlocks.join("\n\n")}\n\n## Done when\n\nThe scheduled work is complete.\n`,
    );
    const entries = taskData.map(({ id, title }) => `  - id: ${id}\n    title: ${title}\n    status: pending\n    progress: tasks/task-${id}/progress.md`).join("\n");
    write(
      repository,
      ".kepler/changes/scheduled/progress.md",
      `---\nartifact: progress\nchange: scheduled\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n${entries}\n---\n# Progress: Scheduled\n\n| Task | Status | Progress |\n| --- | --- | --- |\n${taskData.map(({ id, title }) => `| Task ${id}: ${title} | pending | [details](tasks/task-${id}/progress.md) |`).join("\n")}\n`,
    );
    for (const { id, title } of taskData)
      write(
        repository,
        `.kepler/changes/scheduled/tasks/task-${id}/progress.md`,
        `---\nartifact: task-progress\nchange: scheduled\ntask: ${id}\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task ${id} — ${title}\n`,
      );

    const current = await runContext({ changeDir: directory });
    expect(current.exitCode).toBe(0);
    expect(current.stdout).toContain("identity-order: 1, 2, 3, 4");
    expect(current.stdout).not.toContain("Task 99");
    expect(current.stdout).toContain("execution-order: 1, 4, 2, 3");
    expect(current.stdout).toContain("execution-history: uncommitted");
    expect(current.stdout).toContain("formal-intent: tactical (approval references are assertions)");
    expect(current.stdout).toContain("Task 1 input context: current");

    write(repository, "AGENTS.md", "Use changed commands.\n");
    const stale = await runContext({ changeDir: directory });
    expect(stale.stdout).toContain("Task 1 input context: stale (AGENTS.md)");
  });

  it("reports history-verified unaffected tasks under an input-impact record", async () => {
    const repository = makeRepo();
    const directory = makeChangeDir(repository, "impact");
    write(repository, "AGENTS.md", "Use the old command.\n");
    commitPaths(repository, "old input", "AGENTS.md");
    const previousBlob = git(repository, "rev-parse", "HEAD:AGENTS.md");
    const definition = "### Task 1: Preserve obligations\n\n- Depends on: none";
    const inputContext = JSON.stringify({
      version: 1,
      repository,
      intentCommit: "tactical:context-fixture",
      taskDefinition: taskDefinitionDigest(definition),
      inputs: [{ path: "AGENTS.md", blob: previousBlob }],
    });
    const planPath = ".kepler/changes/impact/plan.md";
    const planBody = `# Plan: Impact\n\n## Overview\n\nA plan.\n\n## Tasks\n\n${definition}\n- Notes: ${inputContext}\n\n## Done when\n\nExisting obligations remain complete.\n`;
    write(
      repository,
      planPath,
      `---\nartifact: plan\nchange: impact\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\n---\n${planBody}`,
    );
    write(
      repository,
      ".kepler/changes/impact/progress.md",
      "---\nartifact: progress\nchange: impact\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Preserve obligations\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: Impact\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Preserve obligations | pending | [details](tasks/task-1/progress.md) |\n",
    );
    write(
      repository,
      ".kepler/changes/impact/tasks/task-1/progress.md",
      "---\nartifact: task-progress\nchange: impact\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Preserve obligations\n",
    );
    commitAll(repository, "initial plan and task ledger");
    const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
    write(repository, "AGENTS.md", "Use the new command.\n");
    commitPaths(repository, "change input", "AGENTS.md");
    const currentBlob = git(repository, "rev-parse", "HEAD:AGENTS.md");
    const inputImpact = {
      version: 1,
      previousPlanCommit,
      reviewReference: "context-review-21",
      changes: [
        {
          path: "AGENTS.md",
          previousBlob,
          currentBlob,
          affectedTasks: [],
          unaffectedTasks: [1],
          newTasks: [],
          unresolvedIntent: false,
          rationale: "Existing task obligations remain unchanged.",
        },
      ],
    };
    write(
      repository,
      planPath,
      `---\nartifact: plan\nchange: impact\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\ninput_impact: ${JSON.stringify(inputImpact)}\n---\n# Plan: Impact\n\n## Overview\n\n- Input impact review: context-review-21\n- Input impact previous plan: ${previousPlanCommit}\n\n## Tasks\n\n${definition}\n- Notes: ${inputContext}\n\n## Done when\n\nExisting obligations remain complete.\n`,
    );
    commitPaths(repository, "record input impact", planPath);

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("input-impact-history: verified");
    expect(result.stdout).toContain("input-impact-review: context-review-21 (assertion, not authenticated)");
    expect(result.stdout).toContain("Task 1 input context: impact-reviewed-unaffected (AGENTS.md)");
  });

  it("marks only authorized history-free missing initialization as recoverable", async () => {
    const clean = createInitialContextScaffold();
    const eligible = await runContext({ changeDir: clean.directory });
    expect(eligible.stdout).toContain("scaffold-recovery: eligible");
    const planContractLine = eligible.stdout
      .split("\n")
      .find((line) => line.startsWith("plan-contract-data: "));
    expect(planContractLine).toBeDefined();
    const planContractData = JSON.parse(
      planContractLine?.slice("plan-contract-data: ".length) ?? "null",
    ) as {
      readonly taskBreakdownDigest: string;
      readonly recordedInitialization: { readonly breakdown: string } | null;
      readonly tasks: readonly { readonly taskDefinitionDigest: string }[];
    };
    const expectedTaskDigest = taskDefinitionDigest(
      "### Task 1: Create file\n\n- Depends on: none\n- Files: src/new.ts",
    );
    expect(planContractData.taskBreakdownDigest).toBe(
      taskBreakdownDigestFromDefinitions(
        [1],
        [{ id: 1, definitionDigest: expectedTaskDigest }],
      ),
    );
    expect(planContractData.recordedInitialization?.breakdown).toBe(clean.breakdown);
    expect(planContractData.tasks[0]?.taskDefinitionDigest).toBe(expectedTaskDigest);

  });

  it("allows dependency-mode scaffold recovery with optional Files when no task work exists", async () => {
    const scaffold = createInitialContextScaffold(false, true);
    const result = await runContext({ changeDir: scaffold.directory });

    expect(result.stdout).toContain("format: legacy-unsupported");
    expect(result.stdout).toContain("scaffold-recovery: eligible");
    expect(result.stdout).toContain('"goal":"Create the required file."');
    expect(result.stdout).toContain('"acceptance":["The required file is verified."]');
  });

  it("blocks dependency-mode scaffold recovery when unlisted material work exists", async () => {
    const scaffold = createInitialContextScaffold(false, true);
    write(scaffold.repository, "src/unlisted.ts", "export const partial = true;\n");
    const result = await runContext({ changeDir: scaffold.directory });

    expect(result.stdout).toContain("scaffold-recovery: blocked");
    expect(result.stdout).toContain("task work cannot be bounded without Files scopes");
  });

  it("blocks initial recovery after an unfinished definition amendment", async () => {
    const amendedScaffold = createInitialContextScaffold();
    commitAll(amendedScaffold.repository, "commit initial scaffold plan");
    const planPath = ".kepler/changes/scaffold/plan.md";
    const initialPlan = Fs.readFileSync(
      Path.join(amendedScaffold.repository, planPath),
      "utf8",
    );
    const originalDefinition =
      "### Task 1: Create file\n\n- Depends on: none\n- Files: src/new.ts";
    const originalNotes = initialPlan
      .split("\n")
      .find((line) => line.startsWith("- Notes: "))
      ?.slice("- Notes: ".length);
    expect(originalNotes).toBeDefined();
    const originalContext = JSON.parse(originalNotes ?? "null") as {
      readonly version: number;
      readonly repository: string;
      readonly intentCommit: string;
      readonly taskDefinition: string;
      readonly inputs: readonly { readonly path: string; readonly blob: string }[];
    };
    const changedDefinition = originalDefinition.replace(
      "Create file",
      "Create revised file",
    );
    const amendedNotes = JSON.stringify({
      ...originalContext,
      taskDefinition: taskDefinitionDigest(changedDefinition),
    });
    write(
      amendedScaffold.repository,
      planPath,
      initialPlan.replace(
        `${originalDefinition}\n- Notes: ${originalNotes}`,
        `${changedDefinition}\n- Notes: ${amendedNotes}`,
      ),
    );
    commitPaths(amendedScaffold.repository, "amend unfinished task", planPath);
    const amendedRecovery = await runContext({ changeDir: amendedScaffold.directory });
    expect(amendedRecovery.stdout).toContain("scaffold-recovery: blocked");
    expect(amendedRecovery.stdout).toContain(
      "amended plan cannot use initial-scaffold recovery",
    );

  });

  it("blocks initial recovery after forged original proof", async () => {
    const forgedScaffold = createInitialContextScaffold();
    const planPath = ".kepler/changes/scaffold/plan.md";
    commitAll(forgedScaffold.repository, "commit original proof snapshot");
    const forgedPlan = Fs.readFileSync(
      Path.join(forgedScaffold.repository, planPath),
      "utf8",
    ).replace(forgedScaffold.breakdown, "f".repeat(64));
    write(forgedScaffold.repository, planPath, forgedPlan);
    commitPaths(forgedScaffold.repository, "forge original breakdown", planPath);
    const forgedRecovery = await runContext({ changeDir: forgedScaffold.directory });
    expect(forgedRecovery.stdout).toContain("scaffold-recovery: blocked");
    expect(forgedRecovery.stdout).toContain(
      "initial plan revision does not contain the recorded initialization proof",
    );

  });

  it("blocks initial recovery after changing the recorded base", async () => {
    const changedBaseScaffold = createInitialContextScaffold();
    const planPath = ".kepler/changes/scaffold/plan.md";
    commitAll(changedBaseScaffold.repository, "commit original base plan");
    write(changedBaseScaffold.repository, "base-marker.txt", "advance the repository\n");
    const changedBase = commitAll(changedBaseScaffold.repository, "advance repository base");
    const changedBasePlan = Fs.readFileSync(
      Path.join(changedBaseScaffold.repository, planPath),
      "utf8",
    ).replace(changedBaseScaffold.base, changedBase);
    write(changedBaseScaffold.repository, planPath, changedBasePlan);
    commitPaths(changedBaseScaffold.repository, "change initialization base", planPath);
    const changedBaseRecovery = await runContext({ changeDir: changedBaseScaffold.directory });
    expect(changedBaseRecovery.stdout).toContain("scaffold-recovery: blocked");
    expect(changedBaseRecovery.stdout).toContain(
      "initialization revision already contains .kepler/changes/scaffold/plan.md",
    );

  });

  it.each(["source", "plan", "checkpoint"])("blocks initial recovery with staged-only %s state", async (kind) => {
    const scaffold = createInitialContextScaffold();
    const path = kind === "source" ? "src/new.ts" : kind === "plan" ? ".kepler/changes/scaffold/plan.md" : ".kepler/changes/scaffold/tasks/task-1/.base";
    if (kind !== "plan") write(scaffold.repository, path, kind === "source" ? "export const partial = true;\n" : scaffold.base + "\n");
    git(scaffold.repository, "add", "--", path);
    if (kind === "plan") {
      const source = Fs.readFileSync(Path.join(scaffold.repository, path), "utf8");
      write(scaffold.repository, path, source);
    } else Fs.unlinkSync(Path.join(scaffold.repository, path));
    const result = await runContext({ changeDir: scaffold.directory });
    expect(result.stdout).toContain("scaffold-recovery: blocked");
    expect(result.stdout).not.toContain("scaffold-recovery: eligible");
    expect(result.stdout).toContain(kind === "source" ? "partial work" : kind === "plan" ? "staged scaffold state" : "checkpoint");
  });

  it("reports fresh feedback only for durable progress at its canonical checkpoint", async () => {
    const repository = makeRepo();
    const slug = "checkpoint-context";
    const progressSource = `---\nartifact: task-progress\nchange: ${slug}\ntask: 1\nstatus: done\nupdated: 2026-09-12\ndecision: accepted\n---\n${taskProgress(1, "Add the auth | session")}`;
    const planSource = `---\nartifact: plan\nchange: ${slug}\nstatus: approved\ncreated: 2026-09-12\nauthor: Test\ndecision: accepted\nroute_unit: null\n---\n# Plan: Checkpoint Context\n\n## Overview\n\n## Tasks\n\n### Task 1: Add the auth | session\n\n## Done when\n`;
    const rootSource = `---\nartifact: progress\nchange: ${slug}\nstatus: complete\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Add the auth | session\n    status: done\n    progress: tasks/task-1/progress.md\n---\n# Progress: Checkpoint Context\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Add the auth \\| session | done | [details](tasks/task-1/progress.md) |\n`;
    const directory = seed(repository, slug, { "plan.md": planSource, "progress.md": rootSource, "tasks/task-1/progress.md": progressSource });
    const head = commitAll(repository, "record task implementation");
    const base = git(repository, "rev-parse", `${head}^1`);
    const feedback = feedbackEvidence(slug, reviewPass(1, "2026-09-13", base, head, "approved"));
    write(directory, "tasks/task-1/feedback.md", feedback);
    commitPaths(repository, "record feedback", ".kepler/changes/checkpoint-context/tasks/task-1/feedback.md");
    expect((await runContext({ changeDir: directory })).stdout).toContain("Task 1: done, feedback: approved (fresh)");
    write(directory, "tasks/task-1/progress.md", progressSource + "\n## Attempt 2 — 2026-09-14\n\n- Outcome: done\n");
    expect((await runContext({ changeDir: directory })).stdout).toContain("Task 1: done, feedback: approved (stale)");
  });

  it("blocks initial recovery when task work already exists", async () => {
    const partial = createInitialContextScaffold();
    write(partial.repository, "src/new.ts", "export const partial = true;\n");
    const blocked = await runContext({ changeDir: partial.directory });
    expect(blocked.stdout).toContain("scaffold-recovery: blocked");
    expect(blocked.stdout).toContain("Task 1 has partial work in src/new.ts");

  });

  it("blocks initial recovery after deleted root progress history", async () => {
    const deletedHistory = createInitialContextScaffold(true);
    const deleted = await runContext({ changeDir: deletedHistory.directory });
    expect(deleted.stdout).toContain("scaffold-recovery: blocked");
    expect(deleted.stdout).toContain("root task progress has deleted history since initialization");
  });


  it.each(["deleted checkpoint", "unavailable checkpoint history", "task title", "root change", "root title", "plan title"])("rejects initial recovery with inconsistent %s", async (failure) => {
    const scaffold = createInitialContextScaffold();
    const progressPath = ".kepler/changes/scaffold/progress.md";
    const taskPath = ".kepler/changes/scaffold/tasks/task-1/progress.md";
    const checkpointPath = ".kepler/changes/scaffold/tasks/task-1/.base";
    const planPath = ".kepler/changes/scaffold/plan.md";
    const runtime = createContextRuntime();
    if (failure === "deleted checkpoint") {
      commitPaths(scaffold.repository, "capture initial pending plan", planPath);
      write(scaffold.repository, checkpointPath, scaffold.base + "\n");
      commitPaths(scaffold.repository, "record tracked checkpoint", checkpointPath);
      Fs.unlinkSync(Path.join(scaffold.repository, checkpointPath));
      commitPaths(scaffold.repository, "delete tracked checkpoint", checkpointPath);
    } else if (failure === "unavailable checkpoint history") {
      const originalGit = runtime.git;
      const unavailable = createContextRuntime({
        git: {
          ...originalGit,
          pathHistorySince: (cwd, base, path) => path.endsWith("/.base")
            ? { status: 1, stdout: "", stderr: "checkpoint history unavailable" }
            : originalGit.pathHistorySince(cwd, base, path),
        },
      });
      const result = await runContext({ changeDir: scaffold.directory }, unavailable);
      expect(result.stdout).toContain("scaffold-recovery: blocked");
      expect(result.stdout).toContain("checkpoint");
      return;
    } else if (failure === "task title") {
      write(scaffold.repository, taskPath, "---\nartifact: task-progress\nchange: scaffold\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Wrong title\n");
    } else {
      const change = failure === "root change" ? "other" : "scaffold";
      const title = failure === "root title" ? "Other title" : "Scaffold";
      write(scaffold.repository, progressPath, `---\nartifact: progress\nchange: ${change}\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Create file\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: ${title}\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Create file | pending | [details](tasks/task-1/progress.md) |\n`);
      if (failure === "plan title") {
        const source = Fs.readFileSync(Path.join(scaffold.repository, planPath), "utf8");
        write(scaffold.repository, planPath, source.replace("# Plan: Scaffold", "# Plan: Other title"));
      }
    }
    const result = await runContext({ changeDir: scaffold.directory }, runtime);
    expect(result.stdout).toMatch(/scaffold-recovery: blocked|format: invalid/);
    expect(result.stdout).not.toContain("scaffold-recovery: eligible");
    if (failure === "deleted checkpoint") expect(result.stdout).toContain("checkpoint");
  });

  it.each(["task log", "root ledger"])("retains valid pending %s during initial recovery", async (present) => {
    const scaffold = createInitialContextScaffold();
    if (present === "task log")
      write(scaffold.repository, ".kepler/changes/scaffold/tasks/task-1/progress.md", "---\nartifact: task-progress\nchange: scaffold\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Create file\n");
    else
      write(scaffold.repository, ".kepler/changes/scaffold/progress.md", "---\nartifact: progress\nchange: scaffold\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Create file\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: Scaffold\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Create file | pending | [details](tasks/task-1/progress.md) |\n");
    const result = await runContext({ changeDir: scaffold.directory });
    expect(result.stdout).toContain("scaffold-recovery: eligible");
  });

  it.each(["null", "{ version: 2, order: [1] }"])("names the exact invalid execution diagnostic for %s without numeric fallback", async (execution) => {
    const scaffold = createInitialContextScaffold();
    const path = ".kepler/changes/scaffold/plan.md";
    const source = Fs.readFileSync(Path.join(scaffold.repository, path), "utf8");
    write(scaffold.repository, path, source.replace("route_unit: null\n", `route_unit: null\nexecution: ${execution}\n`));
    const result = await runContext({ changeDir: scaffold.directory });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("format: invalid");
    expect(result.stdout).toMatch(/execution.*(object|version|unsupported|must)/i);
    expect(result.stdout).not.toContain("execution-order: 1");
  });

  it("fails closed on reordered schedules without history or with damaged prior plans", async () => {
    const writePlan = (
      repository: string,
      body: string,
      execution?: readonly number[],
    ) =>
      write(
        repository,
        ".kepler/changes/history/plan.md",
        `---\nartifact: plan\nchange: history\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\n${execution ? `execution:\n  version: 1\n  order: [${execution.join(", ")}]\n` : ""}---\n# Plan: History\n\n## Overview\n\n## Tasks\n\n${body}\n## Done when\n\nThe schedule is clear.\n`,
      );
    const reordered = makeRepo();
    const reorderedDir = makeChangeDir(reordered, "history");
    writePlan(reordered, "### Task 1: First\n\n### Task 2: Second", [1, 2]);
    commitPaths(reordered, "first plan", ".kepler/changes/history/plan.md");
    writePlan(
      reordered,
      "### Task 1: First\n\n### Task 2: Second\n\n### Task 3: Prerequisite",
      [1, 3, 2],
    );
    commitPaths(reordered, "reorder without proof", ".kepler/changes/history/plan.md");
    const reorderedContext = await runContext({ changeDir: reorderedDir });
    expect(reorderedContext.stdout).toContain("execution-history: blocked (execution order changed without committed execution transition evidence)");

    const damaged = makeRepo();
    const damagedDir = makeChangeDir(damaged, "history");
    write(damaged, ".kepler/changes/history/plan.md", "---\nartifact: plan\nchange: history\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\n---\n# Plan: History\n");
    commitPaths(damaged, "damaged prior plan", ".kepler/changes/history/plan.md");
    writePlan(damaged, "### Task 1: First");
    commitPaths(damaged, "replace damaged plan", ".kepler/changes/history/plan.md");
    const damagedContext = await runContext({ changeDir: damagedDir });
    expect(damagedContext.stdout).toContain("execution-history: blocked (preceding committed plan revision is malformed or unsupported)");
  });

  it("classifies a current change with an empty pending task log as split", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "pending-task", {
      "proposal.md": "# Proposal: pending-task\n",
      "plan.md": `---
artifact: plan
change: pending-task
status: approved
created: 2026-09-12
author: caio
decision: accepted
route_unit: null
---
# Plan: pending-task

## Overview
## Tasks

### Task 1: Build it

## Done when
`,
      "progress.md": `---
artifact: progress
change: pending-task
status: pending
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Build it
    status: pending
    progress: tasks/task-1/progress.md
---
# Progress: pending-task

| Task | Status | Progress |
|---|---|---|
| Task 1: Build it | pending | [details](tasks/task-1/progress.md) |
`,
      "tasks/task-1/progress.md": `---
artifact: task-progress
change: pending-task
task: 1
status: pending
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Build it
`,
      "requirements/auth.md": "# Auth\n",
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.changes[0]?.format).toBe("split");
    expect(result.stdout).toContain("Task 1: pending");
    expect(result.lastLine).toBe(
      "summary: pending-task — 0/1 tasks done, whole change: not reviewed",
    );
  });

  it("validates pre-attempt reservations against the recovered preparation Base", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "reserved-preparation", {
      "plan.md": `---\nartifact: plan\nchange: reserved-preparation\nstatus: approved\ncreated: 2026-09-12\nauthor: caio\ndecision: accepted\nroute_unit: null\n---\n# Plan: reserved-preparation\n\n## Overview\n\n## Tasks\n\n### Task 1: Build it\n\n## Done when\n`,
      "progress.md": `---\nartifact: progress\nchange: reserved-preparation\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Build it\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: reserved-preparation\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Build it | pending | [details](tasks/task-1/progress.md) |\n`,
      "tasks/task-1/progress.md": `---\nartifact: task-progress\nchange: reserved-preparation\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Build it\n`,
      "src/reserved.ts": "export const reserved = 'before';\\n",
    });
    commitAll(repository, "initialize reservation task");
    write(
      directory,
      "tasks/task-1/progress.md",
      `---\nartifact: task-progress\nchange: reserved-preparation\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\nscope_expansions:\n  - id: prepare-prerequisite\n    attempt: 1\n    prerequisite: Prepare the required fixture\n    necessity: The prescribed verification requires this prepared file\n    evidence: The existing fixture has the wrong value\n    paths:\n      - .kepler/changes/reserved-preparation/src/reserved.ts\n    verify: bun --bun vitest run tests/workbench/context.test.ts\n---\n# Task Progress: Task 1 — Build it\n`,
    );
    commitPaths(repository, "reserve preparation prerequisite", ".kepler/changes/reserved-preparation/tasks/task-1/progress.md");
    write(directory, "src/reserved.ts", "export const reserved = 'prepared';\\n");
    commitPaths(repository, "prepare reserved prerequisite", ".kepler/changes/reserved-preparation/src/reserved.ts");

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.changes[0]?.format).toBe("split");
    expect(result.stdout).not.toContain("reserved path changed before its reservation");
  });

  it("accepts a first no-feedback reservation after an approved predecessor changed a shared path", () => {
    const repository = makeRepo();
    sourceCliTsconfig(repository);
    const predecessorDefinition = "### Task 1: Complete predecessor";
    const reservationDefinition = "### Task 2: Reserve shared prerequisite";
    const taskNotes = (definition: string) => JSON.stringify({
      version: 1,
      repository,
      intentCommit: "tactical:serial-predecessor-fixture",
      taskDefinition: taskDefinitionDigest(definition),
      inputs: [],
    });
    const directory = seed(repository, "serial-predecessor-reservation", {
      "plan.md": `---
artifact: plan
change: serial-predecessor-reservation
status: approved
created: 2026-09-12
author: caio
decision: accepted
route_unit: null
execution:
  version: 1
  order: [1, 2]
---
# Plan: serial-predecessor-reservation

## Overview

## Tasks

${predecessorDefinition}

- Notes: ${taskNotes(predecessorDefinition)}

${reservationDefinition}

- Notes: ${taskNotes(reservationDefinition)}

## Done when
`,
      "progress.md": `---
artifact: progress
change: serial-predecessor-reservation
status: pending
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Complete predecessor
    status: pending
    progress: tasks/task-1/progress.md
  - id: 2
    title: Reserve shared prerequisite
    status: pending
    progress: tasks/task-2/progress.md
---
# Progress: serial-predecessor-reservation

| Task | Status | Progress |
| --- | --- | --- |
| Task 1: Complete predecessor | pending | [details](tasks/task-1/progress.md) |
| Task 2: Reserve shared prerequisite | pending | [details](tasks/task-2/progress.md) |
`,
      "tasks/task-1/progress.md": `---
artifact: task-progress
change: serial-predecessor-reservation
task: 1
status: pending
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Complete predecessor
`,
      "tasks/task-2/progress.md": `---
artifact: task-progress
change: serial-predecessor-reservation
task: 2
status: pending
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 2 — Reserve shared prerequisite
`,
      "src/shared.ts": "export const shared = 'before';\n",
    });
    const scaffold = commitAll(repository, "initialize serial reservation fixture");
    write(
      directory,
      "progress.md",
      `---
artifact: progress
change: serial-predecessor-reservation
status: pending
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Complete predecessor
    status: done
    progress: tasks/task-1/progress.md
  - id: 2
    title: Reserve shared prerequisite
    status: pending
    progress: tasks/task-2/progress.md
---
# Progress: serial-predecessor-reservation

| Task | Status | Progress |
| --- | --- | --- |
| Task 1: Complete predecessor | done | [details](tasks/task-1/progress.md) |
| Task 2: Reserve shared prerequisite | pending | [details](tasks/task-2/progress.md) |
`,
    );
    write(
      directory,
      "tasks/task-1/progress.md",
      `---
artifact: task-progress
change: serial-predecessor-reservation
task: 1
status: done
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Complete predecessor

## Attempt 1 — 2026-09-12

- Outcome: done
`,
    );
    write(repository, "src/shared.ts", "export const shared = 'predecessor';\n");
    const implementation = commitAll(repository, "complete predecessor");
    write(
      directory,
      "tasks/task-1/feedback.md",
      `---
artifact: feedback
change: serial-predecessor-reservation
task: 1
created: 2026-09-12
status: resolved
decision: accepted
---
# Code Feedback: Task 1 — Complete predecessor

## Pass 1 — 2026-09-12
Base: ${scaffold}
Head: ${implementation}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
`,
    );
    const approval = commitPaths(
      repository,
      "approve predecessor",
      ".kepler/changes/serial-predecessor-reservation/tasks/task-1/feedback.md",
    );
    write(
      directory,
      "tasks/task-2/progress.md",
      `---
artifact: task-progress
change: serial-predecessor-reservation
task: 2
status: pending
updated: 2026-09-12
decision: accepted
scope_expansions:
  - id: prepare-shared-prerequisite
    attempt: 1
    prerequisite: Prepare the shared prerequisite
    necessity: The next serial task requires the shared fixture
    evidence: The predecessor completed the shared fixture
    paths:
      - src/shared.ts
    verify: bun --bun vitest run tests/workbench/context.test.ts
---
# Task Progress: Task 2 — Reserve shared prerequisite
`,
    );
    const reservation = commitPaths(
      repository,
      "reserve shared prerequisite",
      ".kepler/changes/serial-predecessor-reservation/tasks/task-2/progress.md",
    );

    const result = sourceContext(repository, directory);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(repository, "rev-parse", `${reservation}^1`)).toBe(approval);
    expect(result.stdout).toContain("format: split");
    expect(result.stdout).toContain("Task 2 input context: current");
    expect(result.stdout).not.toContain("reserved path changed before its reservation");
  });

  it("rejects production committed before a pre-attempt reservation", () => {
    const repository = makeRepo();
    sourceCliTsconfig(repository);
    const directory = seed(repository, "reserved-before-edit", {
      "plan.md": `---\nartifact: plan\nchange: reserved-before-edit\nstatus: approved\ncreated: 2026-09-12\nauthor: caio\ndecision: accepted\nroute_unit: null\n---\n# Plan: reserved-before-edit\n\n## Overview\n\n## Tasks\n\n### Task 1: Build it\n\n## Done when\n`,
      "progress.md": `---\nartifact: progress\nchange: reserved-before-edit\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Build it\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: reserved-before-edit\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Build it | pending | [details](tasks/task-1/progress.md) |\n`,
      "tasks/task-1/progress.md": `---\nartifact: task-progress\nchange: reserved-before-edit\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Build it\n`,
      "src/reserved.ts": "export const reserved = 'before';\\n",
    });
    commitAll(repository, "initialize reservation task");
    write(directory, "src/reserved.ts", "export const reserved = 'prepared';\\n");
    commitPaths(repository, "commit production before reservation", ".kepler/changes/reserved-before-edit/src/reserved.ts");
    write(
      directory,
      "tasks/task-1/progress.md",
      `---\nartifact: task-progress\nchange: reserved-before-edit\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\nscope_expansions:\n  - id: prepare-prerequisite\n    attempt: 1\n    prerequisite: Prepare the required fixture\n    necessity: The prescribed verification requires this prepared file\n    evidence: The existing fixture has the wrong value\n    paths:\n      - .kepler/changes/reserved-before-edit/src/reserved.ts\n    verify: bun --bun vitest run tests/workbench/context.test.ts\n---\n# Task Progress: Task 1 — Build it\n`,
    );
    commitPaths(repository, "reserve after production", ".kepler/changes/reserved-before-edit/tasks/task-1/progress.md");

    const result = sourceContext(repository, directory);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("format: invalid");
    expect(result.stdout).toContain("reserved path changed before its reservation");
  });

  it("preserves pre-plan and legacy classifications", async () => {
    const repository = makeRepo();
    const prePlan = seed(repository, "pre-plan", { "proposal.md": proposal });
    const legacy = seed(repository, "legacy", {
      "plan.md": plan,
      "progress.md":
        "# Progress: add auth\n\n## Task 1: Add auth — 2026-09-12\n\n- Outcome: done\n",
    });

    const service = new ContextService(
      createContextRuntime({ cwd: () => repository }),
    );
    const prePlanResult = await service.execute({ changeDir: prePlan });
    const legacyResult = await runContext({ changeDir: legacy });

    expect(prePlanResult.exitCode).toBe(0);
    expect(prePlanResult.stdout).toContain("format: pre-plan");
    expect(prePlanResult.lastLine).toBe("summary: pre-plan — pre-plan");
    expect(legacyResult.exitCode).toBe(0);
    expect(legacyResult.stdout).toContain("format: legacy-unsupported");
    expect(legacyResult.stdout).not.toContain("tasks:");
  });

  it("lists all changes in reverse modification order with stable ties", async () => {
    const repository = makeRepo();
    const older = seed(repository, "older", { "proposal.md": proposal });
    const newer = seed(repository, "newer", splitFiles);
    const stamp = new Date("2026-01-02T12:00:00Z");
    Fs.utimesSync(older, stamp, stamp);
    Fs.utimesSync(
      newer,
      new Date("2026-01-03T12:00:00Z"),
      new Date("2026-01-03T12:00:00Z"),
    );
    const result = await runContext(
      { all: true },
      createContextRuntime({ cwd: () => repository }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toMatch(/^change\s+format\s+artifacts/);
    expect(result.lines[1]).toContain("newer");
    expect(result.lines[1]).toContain("split");
    expect(result.lines[2]).toContain("older");
    expect(result.lines[2]).toContain("pre-plan");
    expect(result.changes).toHaveLength(2);
  });

  it("migrates legacy project changes before all-scope discovery", async () => {
    const repository = makeRepo();
    const legacyChange = Path.join(
      repository,
      ".hamilton",
      "changes",
      "legacy-change",
    );
    const legacyProposal = "# Proposal: legacy-change\n";
    write(legacyChange, "proposal.md", legacyProposal);

    const result = await runContext(
      { all: true },
      createContextRuntime({ cwd: () => repository }),
    );
    const canonicalProposal = Path.join(
      repository,
      ".kepler",
      "changes",
      "legacy-change",
      "proposal.md",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("legacy-change");
    expect(Fs.readFileSync(canonicalProposal, "utf8")).toBe(legacyProposal);
    expect(
      Fs.readFileSync(
        Path.join(legacyChange, "proposal.md"),
        "utf8",
      ),
    ).toBe(legacyProposal);
  });

  it("returns an environment error for unreadable all-scope discovery", async () => {
    const repository = makeRepo();
    Fs.mkdirSync(Path.join(repository, ".kepler", "changes"), {
      recursive: true,
    });
    const runtime = createContextRuntime({ cwd: () => repository });
    const result = await runContext(
      { all: true },
      createContextRuntime({
        cwd: () => repository,
        fileSystem: {
          ...runtime.fileSystem,
          readDirectory: () => {
            throw new Error("permission denied");
          },
        },
        git: runtime.git,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("error");
    expect(result.stdout).toBe("");
    expect(result.changes).toHaveLength(0);
    expect(result.stderr).toContain("cannot discover changes");
  });

  it("returns an environment error when all-scope directory discovery fails", async () => {
    const repository = makeRepo();
    const runtime = createContextRuntime({ cwd: () => repository });
    const changesDir = Path.join(repository, ".kepler", "changes");
    const result = await runContext(
      { all: true },
      createContextRuntime({
        cwd: () => repository,
        fileSystem: {
          ...runtime.fileSystem,
          directoryExists: (sourcePath) => {
            if (sourcePath === changesDir) throw new Error("permission denied");
            return runtime.fileSystem.directoryExists(sourcePath);
          },
        },
        git: runtime.git,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("error");
    expect(result.stdout).toBe("");
    expect(result.changes).toHaveLength(0);
    expect(result.stderr).toContain("cannot discover changes");
  });

  it("returns an environment error for invalid paths", async () => {
    const repository = makeRepo();
    const result = await runContext({
      changeDir: Path.join(repository, "missing"),
    });

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("error");
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("change dir does not exist");
  });

  it("accepts current frontmatter artifacts through shared inspection", async () => {
    const repository = makeRepo();
    const directory = makeChangeDir(repository, "current");
    write(
      directory,
      "proposal.md",
      "# Proposal: current\n\n| Route unit | legacy-body |\n",
    );
    write(
      directory,
      "plan.md",
      `---
artifact: plan
change: current
status: approved
created: 2026-09-12
author: caio
decision: accepted
route_unit: null
---
# Plan: current
| Route unit | body-invented |
## Overview
## Tasks
## Done when
### Task 1: Build it
`,
    );
    write(
      directory,
      "progress.md",
      `---
artifact: progress
change: current
status: in-progress
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Build it
    status: in-progress
    progress: tasks/task-1/progress.md
---
# Progress: current

| Task | Status | Progress |
|---|---|---|
| Task 1: Build it | in-progress | [details](tasks/task-1/progress.md) |
`,
    );
    write(
      directory,
      "tasks/task-1/progress.md",
      `---
artifact: task-progress
change: current
task: 1
status: in-progress
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Build it

## Attempt 1 — 2026-09-12

- Outcome: blocked
`,
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.changes[0]?.format).toBe("split");
    expect(result.stdout).not.toContain("route-unit: body-invented");
    expect(result.stdout).not.toContain("route-unit: legacy-body");
    expect(result.stdout).toContain("Task 1: in-progress");
  });

  it("reports the latest parsed pass for valid multi-pass feedback and review", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "multi-pass", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const passes =
      reviewPass(1, "2026-09-13", base, base, "approved") +
      reviewPass(2, "2026-09-14", base, base, "approved");
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("multi-pass", passes),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/multi-pass/tasks/task-1/feedback.md",
    );
    write(directory, "review.md", reviewEvidence("multi-pass", "add auth", passes));
    commitPaths(repository, "review", ".kepler/changes/multi-pass/review.md");

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Task 1: done, feedback: approved (stale)");
    expect(result.stdout).toContain("whole change: approved (range-fresh; clearance-unverified)");
    expect(result.lastLine).toBe(
      "summary: multi-pass — 1/2 tasks done, whole change: approved (range-fresh; clearance-unverified)",
    );
  });

  it("reports approval after a requested-change then approved history", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "requested-approved", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const passes =
      reviewPass(
        1,
        "2026-09-13",
        base,
        base,
        "changes-requested",
        "- [src/auth.ts:1] Fix the auth issue.",
      ) + reviewPass(2, "2026-09-14", base, base, "approved");
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("requested-approved", passes),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/requested-approved/tasks/task-1/feedback.md",
    );
    write(
      directory,
      "review.md",
      reviewEvidence("requested-approved", "add auth", passes),
    );
    commitPaths(
      repository,
      "review",
      ".kepler/changes/requested-approved/review.md",
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain(
      "Task 1: done, feedback: approved (stale)",
    );
    expect(result.stdout).toContain("whole change: approved (range-fresh; clearance-unverified)");
    expect(result.stdout).not.toContain("changes-requested (fresh)");
  });

  it("reports the physical latest legacy-global pass without reviving historical blockers", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "legacy-global-history", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const global = { base, head: base, verdict: "approved" as const };
    const passes =
      legacyReviewPass(
        1,
        "2026-09-13",
        "- [src/auth.ts:1] Fix the historical auth issue.",
      ) + legacyReviewPass(2, "2026-09-14");
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("legacy-global-history", passes, global),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/legacy-global-history/tasks/task-1/feedback.md",
    );
    write(
      directory,
      "review.md",
      reviewEvidence("legacy-global-history", "add auth", passes, global),
    );
    commitPaths(
      repository,
      "review",
      ".kepler/changes/legacy-global-history/review.md",
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Task 1: done, feedback: approved (stale)");
    expect(result.stdout).toContain("whole change: approved (range-fresh; clearance-unverified)");
    expect(result.stdout).not.toContain("changes-requested (fresh)");
  });

  it("reports the explicit latest pass after a fieldless migrated prefix", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "migrated-history", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const passes =
      legacyReviewPass(
        1,
        "2026-09-13",
        "- [src/auth.ts:1] Fix the historical auth issue.",
      ) + reviewPass(2, "2026-09-14", base, base, "approved");
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("migrated-history", passes),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/migrated-history/tasks/task-1/feedback.md",
    );
    write(
      directory,
      "review.md",
      reviewEvidence("migrated-history", "add auth", passes),
    );
    commitPaths(
      repository,
      "review",
      ".kepler/changes/migrated-history/review.md",
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Task 1: done, feedback: approved (stale)");
    expect(result.stdout).toContain("whole change: approved (range-fresh; clearance-unverified)");
    expect(result.stdout).not.toContain("changes-requested (fresh)");
  });

  it("reports malformed physical-last feedback without a context error", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "malformed-physical-last", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const passes =
      legacyReviewPass(
        1,
        "2026-09-13",
        "- [src/auth.ts:1] Fix the historical auth issue.",
      ) +
      reviewPass(2, "2026-09-14", base, base, "approved") +
      "## Notes\n- Context only.\n";
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("malformed-physical-last", passes),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/malformed-physical-last/tasks/task-1/feedback.md",
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Task 1: done, feedback: malformed");
    expect(result.stderr).toBe("");
  });

  it("keeps one-pass global provenance compatibility", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "one-pass", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const passes = legacyReviewPass(1, "2026-09-13");
    const global = { base, head: base, verdict: "approved" as const };
    write(
      directory,
      "tasks/task-1/feedback.md",
      feedbackEvidence("one-pass", passes, global),
    );
    commitPaths(
      repository,
      "feedback",
      ".kepler/changes/one-pass/tasks/task-1/feedback.md",
    );
    write(
      directory,
      "review.md",
      reviewEvidence("one-pass", "add auth", passes, global),
    );
    commitPaths(repository, "review", ".kepler/changes/one-pass/review.md");

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Task 1: done, feedback: approved (stale)");
    expect(result.stdout).toContain("whole change: approved (range-fresh; clearance-unverified)");
  });

  it("rejects malformed recognized inventory artifacts before format discovery", async () => {
    for (const [filename, artifact] of [
      ["proposal.md", "proposal"],
      ["design.md", "design"],
      ["finish.md", "finish"],
      ["critique.md", "critique"],
    ] as const) {
      const repository = makeRepo();
      const directory = seed(repository, `malformed-${artifact}`, {
        [filename]: `---\nartifact: ${artifact}\n---\n# ${artifact}\n`,
      });
      const service = new ContextService(
        createContextRuntime({ cwd: () => repository }),
      );
      const result = await service.execute({ changeDir: directory });

      expect(result.exitCode).toBe(0);
      expect(result.changes[0]?.format).toBe("invalid");
      expect(result.lastLine).toBe(`summary: malformed-${artifact} — invalid`);
    }
  });

  it("classifies recognized task artifacts in legacy layouts", async () => {
    for (const [taskSource, expectedFormat] of [
      [
        `---\nartifact: task-progress\nchange: legacy-task\n---\n# Task Progress: Task 1 — Build it\n\n## Attempt 1 — 2026-09-12\n\n- Outcome: done\n`,
        "invalid",
      ],
      [
        `---\nartifact: task-progress\nchange: legacy-task\ntask: 1\nstatus: done\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — Build it\n\n## Attempt 1 — 2026-09-12\n\n- Outcome: done\n`,
        "legacy-unsupported",
      ],
    ] as const) {
      const repository = makeRepo();
      const directory = seed(repository, "legacy-task", {
        "plan.md": "# Plan: legacy-task\n\n### Task 1: Build it\n",
        "progress.md":
          "# Progress: legacy-task\n\n| Task | Status | Progress |\n|---|---|---|\n| Task 1: Build it | done | [details](tasks/task-1/progress.md) |\n",
        "tasks/task-1/progress.md": taskSource,
      });
      const result = await runContext({ changeDir: directory });

      expect(result.exitCode).toBe(0);
      expect(result.changes[0]?.format).toBe(expectedFormat);
    }
  });

  it("propagates unreadable artifact path errors", async () => {
    const repository = makeRepo();
    const blocked = Path.join(repository, "blocked");
    Fs.mkdirSync(blocked);
    Fs.chmodSync(blocked, 0o000);
    try {
      await expect(
        createContextRuntime().fileSystem.pathExists(
          Path.join(blocked, "proposal.md"),
        ),
      ).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      Fs.chmodSync(blocked, 0o755);
    }
  });

  it("rejects malformed current feedback instead of parsing its legacy body", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "malformed-feedback", {
      ...splitFiles,
      "tasks/task-1/feedback.md": `---
artifact: feedback
change: malformed-feedback
task: 1
created: 2026-09-12
status: invalid
verdict: approved
decision: accepted
base: 0000000000000000000000000000000000000000
head: 0000000000000000000000000000000000000000
---
# Code Feedback: Task 1 — Add the auth | session

## Pass 1 — 2026-09-12
Base: 0000000000000000000000000000000000000000
Head: 0000000000000000000000000000000000000000
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
`,
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Task 1: done, feedback: malformed");
  });

  it("reports uncommitted current review evidence before freshness", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "uncommitted-review", splitFiles);
    const base = commitAll(repository, "change artifacts");
    const review = currentReview("uncommitted-review", "add auth", base);
    write(directory, "review.md", review);
    commitPaths(
      repository,
      "review",
      ".kepler/changes/uncommitted-review/review.md",
    );

    write(directory, "review.md", `${review}\n`);
    const unstaged = await runContext({ changeDir: directory });
    expect(unstaged.stdout).toContain("whole change: approved (uncommitted)");

    write(directory, "review.md", `${review}\n`);
    git(
      repository,
      "add",
      "--",
      ".kepler/changes/uncommitted-review/review.md",
    );
    const staged = await runContext({ changeDir: directory });
    expect(staged.stdout).toContain("whole change: approved (uncommitted)");
  });

  it("matches current reviews whose plan titles contain regex metacharacters", async () => {
    const repository = makeRepo();
    const title = "add auth [v1].";
    const directory = seed(repository, "regex-review", {
      ...splitFiles,
      "plan.md": splitFiles["plan.md"].replace(
        "# Plan: add auth",
        `# Plan: ${title}`,
      ),
    });
    const base = commitAll(repository, "change artifacts");
    write(directory, "review.md", currentReview("regex-review", title, base));
    commitPaths(
      repository,
      "review",
      ".kepler/changes/regex-review/review.md",
    );

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "whole change: approved (range-fresh; clearance-unverified)",
    );
    expect(result.stdout).not.toContain("whole change: approved (fresh)");
  });

  it("rejects malformed current review instead of parsing its legacy body", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "malformed-review", {
      ...splitFiles,
      "review.md": `---
artifact: review
change: malformed-review
created: 2026-09-12
status: invalid
verdict: approved
decision: accepted
base: 0000000000000000000000000000000000000000
head: 0000000000000000000000000000000000000000
---
# Whole-branch Review: add auth

## Pass 1 — 2026-09-12
Base: 0000000000000000000000000000000000000000
Head: 0000000000000000000000000000000000000000
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
`,
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("format: invalid");
    expect(result.stdout).not.toContain("legacy-unsupported");
  });

  it("returns invalid context for malformed current artifacts", async () => {
    const repository = makeRepo();
    const directory = seed(repository, "malformed", {
      "plan.md":
        "---\nartifact: plan\nchange: malformed\n: bad\n---\n# Plan: malformed\n",
    });

    const result = await runContext({ changeDir: directory });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("format: invalid");
    expect(result.lastLine).toBe("summary: malformed — invalid");
  });
});
