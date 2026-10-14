import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import { createHash } from "node:crypto";
import * as Path from "node:path";
import { createArtifactReader } from "../../packages/cli/src/workbench/artifact-reader.js";
import { parseReviewPasses } from "../../packages/cli/src/workbench/review-passes.js";
import {
  createPreconditionRuntime,
  PreconditionService,
  type PreconditionArguments,
  type PreconditionRuntime,
} from "../../packages/cli/src/workbench/precondition.js";
import {
  ContextService,
  createContextRuntime,
} from "../../packages/cli/src/workbench/context.js";
import {
  taskBreakdownDigest,
  taskDefinitionDigest,
} from "../../packages/cli/src/workbench/artifact-body.js";
import {
  cleanupRepos,
  commitAll,
  commitPaths,
  fixtureProcess,
  git,
  runCommand,
  makeChangeDir,
  makeRepo,
  write,
} from "./helpers.js";

afterEach(cleanupRepos);

const fixtureTargetBranch = "refs/remotes/origin/main";

const runPrecondition = (
  args: PreconditionArguments,
  runtime: PreconditionRuntime = createPreconditionRuntime({ process: fixtureProcess }),
) => new PreconditionService(runtime).execute(args);

const evidencePath = (slug: string, file: string): string =>
  `.kepler/changes/${slug}/${file}`;

type ReviewFixtureMode =
  | "compatibility"
  | "multi-pass"
  | "legacy-multi-pass"
  | "migrated"
  | "malformed-latest"
  | "stale-latest"
  | "ambiguous-compatibility";

const reviewDocument = (
  kind: "feedback" | "review",
  base: string,
  material: string,
  mode: ReviewFixtureMode,
  blockingFeedback = false,
  taskTitle = "Implement",
): string => {
  const compatibility =
    mode === "compatibility" || mode === "ambiguous-compatibility";
  const legacyMultiPass = mode === "legacy-multi-pass";
  const metadata =
    kind === "feedback"
      ? [
          "---",
          "artifact: feedback",
          "change: demo",
          "task: 1",
          "created: 2026-09-12",
          "status: resolved",
          "decision: accepted",
          ...(compatibility || legacyMultiPass
            ? [`base: ${base}`, `head: ${material}`, "verdict: approved"]
            : []),
          "---",
        ]
      : [
          "---",
          "artifact: review",
          "change: demo",
          "created: 2026-09-12",
          "status: complete",
          "decision: accepted",
          ...(compatibility || legacyMultiPass
            ? [`base: ${base}`, `head: ${material}`, "verdict: approved"]
            : []),
          "---",
        ];
  const title =
    kind === "feedback"
      ? `# Code Feedback: Task 1 — ${taskTitle}`
      : "# Whole-branch Review: Demo";
  const blocking = blockingFeedback
    ? "- [src/main.ts:1] Fix this (violates: acceptance)"
    : "- None.";
  if (mode === "compatibility")
    return `${metadata.join(
      "\n",
    )}\n${title}\n\n## Pass 1 — 2026-09-12\n\n### Blocking\n${blocking}\n\n### Suggestions\n- None.\n`;
  if (mode === "ambiguous-compatibility")
    return `${metadata.join(
      "\n",
    )}\n${title}\n\n## Pass 1 — 2026-09-12\n\nBase: ${base}\nHead: ${base}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
  if (mode === "legacy-multi-pass")
    return `${metadata.join(
      "\n",
    )}\n${title}\n\n## Pass 1 — 2026-09-12\n\n### Blocking\n- [src/main.ts:1] Fix the historical issue (violates: acceptance)\n\n### Suggestions\n- None.\n\n## Pass 2 — 2026-09-13\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
  if (mode === "migrated")
    return `${metadata.join(
      "\n",
    )}\n${title}\n\n## Pass 1 — 2026-09-12\n\n### Blocking\n- [src/main.ts:1] Fix the historical issue (violates: acceptance)\n\n### Suggestions\n- None.\n\n## Pass 2 — 2026-09-13\n\nBase: ${base}\nHead: ${material}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
  if (mode === "malformed-latest")
    return `${metadata.join(
      "\n",
    )}\n${title}\n\n## Pass 1 — 2026-09-12\n\n### Blocking\n- [src/main.ts:1] Fix the historical issue (violates: acceptance)\n\n### Suggestions\n- None.\n\n## Pass 2 — 2026-09-13\n\nBase: ${base}\nHead: ${material}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
  const firstVerdict =
    mode === "multi-pass" ? "changes-requested" : "approved";
  const firstBlocking =
    firstVerdict === "changes-requested"
      ? "- [src/main.ts:1] Fix this (violates: acceptance)"
      : "- None.";
  const latestHead = mode === "stale-latest" ? base : material;
  const latest = `## Pass 2 — 2026-09-13\n\nBase: ${base}\nHead: ${latestHead}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`;
  return `${metadata.join(
    "\n",
  )}\n${title}\n\n## Pass 1 — 2026-09-12\n\nBase: ${base}\nHead: ${material}\nVerdict: ${firstVerdict}\n\n### Blocking\n${firstBlocking}\n\n### Suggestions\n- None.\n\n${latest}`;
};

const makeEvidence = (
  repository: string,
  options: {
    readonly blockingFeedback?: boolean;
    readonly routeUnit?: string;
    readonly taskProgressStatus?: string;
    readonly metadataStatus?: string;
    readonly taskTitle?: string;
    readonly metadataTitle?: string;
    readonly feedbackMode?: ReviewFixtureMode;
    readonly reviewMode?: ReviewFixtureMode;
    readonly taskOutcomeField?: string;
    readonly rootStatus?: string;
    readonly withoutTaskInputContext?: boolean;
    readonly dependencyMode?: boolean;
    readonly inputs?: readonly { readonly path: string; readonly blob: string }[];
    readonly intentCommit?: string;
    readonly intentApprovals?: readonly {
      readonly path: string;
      readonly reference: string;
      readonly commit: string;
    }[];
  } = {},
): {
  readonly base: string;
  readonly material: string;
  readonly changeDir: string;
} => {
  git(repository, "update-ref", fixtureTargetBranch, "HEAD");
  const changeDir = makeChangeDir(repository, "demo");
  let base = git(repository, "rev-parse", "HEAD");
  const taskTitle = options.taskTitle ?? "Implement";
  const metadataTitle = options.metadataTitle ?? taskTitle;
  const displayTitle = taskTitle.replaceAll("|", "\\|");
  const taskDefinition = options.dependencyMode
    ? `### Task 1: ${taskTitle}\n\n- Goal: Deliver ${taskTitle.toLowerCase()}.\n- Depends on: none\n- Acceptance:\n  - The ${taskTitle.toLowerCase()} is verified.\n- Steps:\n  1. Verify the task behavior.\n- Verify: test -f .kepler/changes/demo/tasks/task-1/progress.md\n- Commit: feat: ${taskTitle.toLowerCase()}`
    : `### Task 1: ${taskTitle}\n\n- Depends on: none`;
  const inputContext = JSON.stringify({
    version: 1,
    repository,
    intentCommit: options.intentCommit ?? "tactical:precondition-fixture",
    taskDefinition: taskDefinitionDigest(taskDefinition),
    inputs: options.inputs ?? [],
  });
  const intentApprovals = options.intentApprovals?.length
    ? `intent_approvals:\n${options.intentApprovals.map((reference) => `  - path: ${reference.path}\n    reference: ${reference.reference}\n    commit: ${reference.commit}`).join("\n")}\n`
    : "";
  const inputNotes = options.withoutTaskInputContext ? "" : `- Notes: ${inputContext}\n`;
  write(
    repository,
    evidencePath("demo", "plan.md"),
    `---\nartifact: plan\nchange: demo\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: ${options.routeUnit ?? "null"}\n${options.dependencyMode ? "execution:\n  version: 2\n  mode: dependencies\n" : ""}${intentApprovals}---\n# Plan: Demo\n\n## Overview\nA plan.\n\n## Tasks\n\n${taskDefinition}\n${inputNotes}\n## Done when\nIt works.\n`,
  );
  write(
    repository,
    evidencePath("demo", "progress.md"),
    `---\nartifact: progress\nchange: demo\nstatus: ${options.rootStatus ?? "complete"}\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: ${metadataTitle}\n    status: ${options.metadataStatus ?? "done"}\n    progress: tasks/task-1/progress.md\n---\n# Progress: Demo\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: ${displayTitle} | done | [details](tasks/task-1/progress.md) |\n`,
  );
  write(
    repository,
    evidencePath("demo", "tasks/task-1/progress.md"),
    `---\nartifact: task-progress\nchange: demo\ntask: 1\nstatus: ${options.taskProgressStatus ?? "done"}\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — ${taskTitle}\n\n## Attempt 1 — 2026-09-12\n${options.taskOutcomeField ?? "- Outcome: done"}\n`,
  );
  let material: string;
  if (options.dependencyMode) {
    const ledgerPath = evidencePath("demo", "progress.md");
    const taskPath = evidencePath("demo", "tasks/task-1/progress.md");
    const terminalLedger = Fs.readFileSync(Path.join(repository, ledgerPath), "utf8");
    const terminalTask = Fs.readFileSync(Path.join(repository, taskPath), "utf8");
    const pendingLedger = terminalLedger.replace("status: complete", "status: in-progress").replace("    status: done", "    status: pending").replace("| done |", "| pending |");
    write(repository, ledgerPath, pendingLedger);
    write(repository, taskPath, terminalTask.replace("status: done", "status: pending").split("\n## Attempt")[0] + "\n");
    write(repository, ".gitignore", ".lanes/\n");
    base = commitAll(repository, "dependency scaffold");
    const lane = Path.join(repository, ".lanes/task-1");
    git(repository, "worktree", "add", "-q", "-b", "fixture-task-1", lane, base);
    const admission = {
      version: 1, base, sourceHead: base, planCommit: base,
      planDigest: createHash("sha256").update(Fs.readFileSync(Path.join(repository, evidencePath("demo", "plan.md")))).digest("hex"),
      taskDefinition: taskDefinitionDigest(taskDefinition), worker: "fixture-worker", coordinator: "fixture-coordinator",
      lane: "refs/heads/fixture-task-1", worktree: Fs.realpathSync(lane),
      gitDirectory: Fs.realpathSync(git(lane, "rev-parse", "--absolute-git-dir")),
      repository: Fs.realpathSync(repository), commonDirectory: Fs.realpathSync(git(repository, "rev-parse", "--path-format=absolute", "--git-common-dir")),
      source: git(repository, "symbolic-ref", "HEAD"), target: fixtureTargetBranch, prerequisites: [],
    };
    const admittedLedger = pendingLedger.replace("    status: pending", "    status: in-progress").replace("| pending |", "| in-progress |").replace("\n---\n# Progress", `\n    admission: ${JSON.stringify(admission)}\n---\n# Progress`);
    write(repository, ledgerPath, admittedLedger);
    const admitted = commitPaths(repository, "admit dependency fixture", ledgerPath);
    git(lane, "merge", "--ff-only", admitted);
    write(lane, taskPath, terminalTask);
    const taskHead = commitAll(lane, "material");
    git(repository, "merge", "--no-ff", "--no-edit", taskHead);
    material = git(repository, "rev-parse", "HEAD");
    const verify = "test -f .kepler/changes/demo/tasks/task-1/progress.md";
    expect(runCommand("sh", ["-lc", verify], repository).status).toBe(0);
    const publication = { version: 1, taskHead, integratedHead: material, outcome: "done", verification: { command: verify, exitCode: 0 } };
    write(repository, ledgerPath, terminalLedger.replace("\n---\n# Progress", `\n    admission: ${JSON.stringify(admission)}\n    publication: ${JSON.stringify(publication)}\n---\n# Progress`));
    commitPaths(repository, "publish dependency fixture", ledgerPath);
  } else {
    material = commitAll(repository, "material");
  }
  write(
    repository,
    evidencePath("demo", "tasks/task-1/feedback.md"),
    reviewDocument(
      "feedback",
      base,
      material,
      options.feedbackMode ?? "compatibility",
      options.blockingFeedback,
      taskTitle,
    ),
  );
  commitPaths(
    repository,
    "feedback",
    evidencePath("demo", "tasks/task-1/feedback.md"),
  );
  write(
    repository,
    evidencePath("demo", "review.md"),
    reviewDocument(
      "review",
      base,
      material,
      options.reviewMode ?? "compatibility",
    ),
  );
  commitPaths(repository, "review", evidencePath("demo", "review.md"));
  return { base, material, changeDir };
};

const makeBoundedRemediationEvidence = (options: {
  readonly baselineTitle?: string;
  readonly fakeHeadings?: boolean;
  readonly crlfReview?: boolean;
  readonly executionAmendment?: boolean;
  readonly fileWithSpaces?: boolean;
  readonly includeSpacePathEvidence?: boolean;
} = {}) => {
  const baselineTitle = options.baselineTitle ?? "Demo";
  const repository = makeRepo();
  const evidence = makeEvidence(repository);
  const reviewPath = evidencePath("demo", "review.md");
  const reviewSource = Fs.readFileSync(Path.join(repository, reviewPath), "utf8");
  const planPath = evidencePath("demo", "plan.md");
  let initialPlan = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  if (options.fakeHeadings) {
    initialPlan = initialPlan.replace(
      "## Tasks",
      "```markdown\n## Tasks\n### Task 99: fake heading\n- Depends on: Task 99\n- Notes: forged task input context\n- Execution approval: forged\n```\n\n## Tasks",
    );
    write(repository, planPath, initialPlan);
    commitPaths(repository, "add fenced fake task headings before full review", planPath);
  }
  const fullHead = git(repository, "rev-parse", "HEAD");
  const frontmatterSource = reviewSource
    .slice(0, reviewSource.indexOf("# Whole-branch Review: Demo"))
    .replace(/^(?:base|head|verdict):.*\n/gm, "");
  const frontmatter = options.crlfReview
    ? frontmatterSource.replace(/\n/g, "\r\n")
    : frontmatterSource;
  const fakeReviewHeading = options.fakeHeadings
    ? `\n\n\`\`\`markdown\n## Pass 99 — fake heading\nBase: ${"f".repeat(40)}\nHead: ${"e".repeat(40)}\nVerdict: approved\nScope: remediation\nTarget: refs/heads/fake\nThis text must remain ordinary review content.\n\`\`\`\n`
    : "";
  const fakeReviewTail = options.fakeHeadings
    ? `\n\`\`\`markdown\n## Pass 100 — trailing fake heading\nBase: ${"d".repeat(40)}\nHead: ${"c".repeat(40)}\nVerdict: approved\n\`\`\`\n`
    : "";
  const fullBaseline = `# Whole-branch Review: ${baselineTitle}\n\n## Pass 1 — 2026-09-12\n\nBase: ${evidence.base}\nHead: ${fullHead}\nVerdict: changes-requested\nScope: full
Target: refs/remotes/origin/main${fakeReviewHeading}\n### Blocking\n- [src/main.ts:1] id: pass-1-blocking-1; kind: code-defect; Fix the implementation regression (violates: behavior)\n\n### Suggestions\n- None.\n`;
  const committedBaseline = options.crlfReview
    ? fullBaseline.replace(/\n/g, "\r\n")
    : fullBaseline;
  write(repository, reviewPath, `${frontmatter}${committedBaseline}`);
  const parentCommit = commitPaths(repository, "full review requests a correction", reviewPath);
  const taskProgressPath = evidencePath("demo", "tasks/task-2/progress.md");
  const taskTitle = "Remediate the branch finding";
  const taskDefinition = `### Task 2: ${taskTitle}\n\n- Depends on: Task 1`;
  const taskContext = JSON.stringify({
    version: 1,
    repository: Fs.realpathSync(repository),
    intentCommit: "tactical:precondition-fixture",
    taskDefinition: taskDefinitionDigest(taskDefinition),
    inputs: [],
  });
  const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
  let plan = initialPlan.replace(
    "## Done when",
    `${taskDefinition}\n- Notes: ${taskContext}\n\n## Done when`,
  );
  if (options.executionAmendment) {
    const reason = "Task 2 supplies a prerequisite for the blocked continuation.";
    const affected = "Task 1 remains gated; Task 2 owns the new prerequisite.";
    const approval = "requester-message-18";
    plan = plan.replace(
      "route_unit: null\n",
      `route_unit: null\nexecution:\n  version: 1\n  order: [1, 2]\nexecution_transition:\n  version: 1\n  previousPlanCommit: ${previousPlanCommit}\n  previousOrder: [1]\n  fullyGatedPrefix: [1]\n  approval: ${approval}\n  reason: ${reason}\n  affected: ${affected}\n`,
    ).replace(
      "## Overview\nA plan.\n",
      `## Overview\nA plan.\n\n- Execution approval: ${approval}\n- Previous execution order: 1\n- New execution order: 1, 2\n- Fully gated prefix: 1\n- Reason: ${reason}\n- Affected obligations: ${affected}\n`,
    );
  }
  write(repository, planPath, plan);
  const progressPath = evidencePath("demo", "progress.md");
  const progress = Fs.readFileSync(Path.join(repository, progressPath), "utf8")
    .replace(
      "    progress: tasks/task-1/progress.md\n---",
      "    progress: tasks/task-1/progress.md\n  - id: 2\n    title: Remediate the branch finding\n    status: pending\n    progress: tasks/task-2/progress.md\n---",
    )
    .replace(
      "| Task 1: Implement | done | [details](tasks/task-1/progress.md) |\n",
      "| Task 1: Implement | done | [details](tasks/task-1/progress.md) |\n| Task 2: Remediate the branch finding | pending | [details](tasks/task-2/progress.md) |\n",
    );
  write(repository, progressPath, progress);
  write(
    repository,
    taskProgressPath,
    `---\nartifact: task-progress\nchange: demo\ntask: 2\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 2 — ${taskTitle}\n`,
  );
  const scaffold = commitAll(repository, "append the numbered remediation task");
  write(
    repository,
    progressPath,
    progress
      .replace("status: pending", "status: done")
      .replace("| Task 2: Remediate the branch finding | pending |", "| Task 2: Remediate the branch finding | done |"),
  );
  write(
    repository,
    taskProgressPath,
    `---\nartifact: task-progress\nchange: demo\ntask: 2\nstatus: done\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 2 — ${taskTitle}\n\n## Attempt 1 — 2026-09-12\n\n- Implemented: corrected the reviewed implementation defect.\n- Tests: true — passed.
- Outcome: done\n`,
  );
  write(repository, "src/main.ts", "export const remediation = true;\n");
  if (options.fileWithSpaces)
    write(repository, "src/file name.ts", "export const spacedPath = true;\n");
  const implementation = commitAll(repository, "implement the numbered remediation task");
  const feedbackPath = evidencePath("demo", "tasks/task-2/feedback.md");
  write(
    repository,
    feedbackPath,
    `---\nartifact: feedback\nchange: demo\ntask: 2\ncreated: 2026-09-12\nstatus: resolved\ndecision: accepted\n---\n# Code Feedback: Task 2 — ${taskTitle}\n\n## Pass 1 — 2026-09-12\n\nBase: ${scaffold}\nHead: ${implementation}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`,
  );
  commitPaths(repository, "approve the numbered remediation task", feedbackPath);
  const currentHead = git(repository, "rev-parse", "HEAD");
  const resolutions = JSON.stringify([
    {
      finding: "pass-1-blocking-1",
      evidence: [
        "src/main.ts",
        evidencePath("demo", "plan.md"),
        ...(options.fileWithSpaces && (options.includeSpacePathEvidence ?? true)
          ? ["src/file name.ts"]
          : []),
      ],
      verification: "The implementation commit changes the classified files; Task 2 feedback approved the correction.",
    },
  ]);
  const remediationPass = `\n## Pass 2 — 2026-09-13\n\nBase: ${evidence.base}\nHead: ${currentHead}\nVerdict: approved-remediation\nScope: remediation\nTarget: refs/remotes/origin/main\nParent pass: 1\nParent commit: ${parentCommit}\nDelta base: ${fullHead}\nResolutions: ${resolutions}
\n### Blocking\n- None.\n\n### Suggestions\n- Resolved the retained code finding with Task 2 and focused verification.\n`;
  const currentBaseline = fullBaseline.replace(/^# Whole-branch Review: [^\r\n]+/m, "# Whole-branch Review: Demo");
  const currentBaselineSource = options.crlfReview
    ? currentBaseline.replace(/\n/g, "\r\n")
    : currentBaseline;
  const remediationSource = options.crlfReview
    ? remediationPass.replace(/\n/g, "\r\n")
    : remediationPass;
  write(repository, reviewPath, `${frontmatter}${currentBaselineSource}${remediationSource}${fakeReviewTail}`);
  commitPaths(repository, "approve bounded remediation clearance", reviewPath);
  return {
    repository,
    changeDir: evidence.changeDir,
    parentCommit,
    fullHead,
    scaffold,
    implementation,
  };
};

const makeEvidenceGapClearance = (options: {
  readonly kind?: "evidence-gap" | "code-defect" | "intent-defect";
  readonly sameEvidence?: boolean;
  readonly materialChange?: boolean;
} = {}) => {
  const repository = makeRepo();
  const evidence = makeEvidence(repository);
  write(repository, "src/main.ts", "export const reviewed = true;\n");
  write(repository, "tests/consumer.test.ts", "test(\"consumer\", () => expect(true).toBe(true));\n");
  const fullHead = commitAll(repository, "add located full-review evidence");
  const reviewPath = evidencePath("demo", "review.md");
  const reviewSource = Fs.readFileSync(Path.join(repository, reviewPath), "utf8");
  const frontmatter = reviewSource
    .slice(0, reviewSource.indexOf("# Whole-branch Review: Demo"))
    .replace(/^(?:base|head|verdict):.*\n/gm, "");
  const kind = options.kind ?? "evidence-gap";
  const fullBaseline = `# Whole-branch Review: Demo\n\n## Pass 1 — 2026-09-12\n\nBase: ${evidence.base}\nHead: ${fullHead}\nVerdict: changes-requested\nScope: full\nTarget: ${fixtureTargetBranch}\n\n### Blocking\n- [src/main.ts:1] id: pass-1-blocking-1; kind: ${kind}; Verify the consumer behavior against located evidence (violates: review coverage)\n\n### Suggestions\n- None.\n`;
  write(repository, reviewPath, `${frontmatter}${fullBaseline}`);
  const parentCommit = commitPaths(repository, "record full review evidence gap", reviewPath);
  if (options.materialChange)
    write(repository, "src/main.ts", "export const reviewed = false;\n");
  const reviewedHead = options.materialChange
    ? commitAll(repository, "change material after the full review")
    : fullHead;
  const provenance = `Scope: remediation\nTarget: ${fixtureTargetBranch}\nParent pass: 1\nParent commit: ${parentCommit}\nDelta base: ${fullHead}`;
  const priorEvidence = ["tests/consumer.test.ts"];
  const resolvedEvidence = options.sameEvidence ? priorEvidence : ["src/main.ts"];
  const priorResolution = JSON.stringify([{
    finding: "pass-1-blocking-1",
    evidence: priorEvidence,
    verification: "The existing consumer test and its asserted contract were inspected.",
  }]);
  const requested = `\n## Pass 2 — 2026-09-13\n\nBase: ${evidence.base}\nHead: ${reviewedHead}\nVerdict: changes-requested\n${provenance}\nResolutions: ${priorResolution}\n\n### Blocking\n- [src/main.ts:1] id: pass-1-blocking-1; kind: ${kind}; Verify the consumer behavior against located evidence (violates: review coverage)\n\n### Suggestions\n- None.\n`;
  write(repository, reviewPath, `${frontmatter}${fullBaseline}${requested}`);
  commitPaths(repository, "record first bounded evidence adjudication", reviewPath);
  const finalResolution = JSON.stringify([{
    finding: "pass-1-blocking-1",
    evidence: resolvedEvidence,
    verification: "The located source and independent consumer evidence confirm the reviewed behavior.",
  }]);
  const approved = `\n## Pass 3 — 2026-09-14\n\nBase: ${evidence.base}\nHead: ${reviewedHead}\nVerdict: approved-remediation\n${provenance}\nResolutions: ${finalResolution}\n\n### Blocking\n- None.\n\n### Suggestions\n- The evidence-gap finding was independently adjudicated without changing the plan or material range.\n`;
  const source = Fs.readFileSync(Path.join(repository, reviewPath), "utf8");
  write(repository, reviewPath, `${source}${approved}`);
  commitPaths(repository, "clear bounded evidence gap", reviewPath);
  return { repository, changeDir: evidence.changeDir, fullHead, parentCommit };
};

const appendScopedFindingAndClearance = (
  evidence: ReturnType<typeof makeBoundedRemediationEvidence>,
  resolveScopedFinding: boolean,
): void => {
  const reviewPath = evidencePath("demo", "review.md");
  const review = Fs.readFileSync(Path.join(evidence.repository, reviewPath), "utf8");
  const base = git(evidence.repository, "rev-parse", fixtureTargetBranch);
  const head = git(evidence.repository, "rev-parse", "HEAD");
  const provenance = `Scope: remediation\nTarget: ${fixtureTargetBranch}\nParent pass: 1\nParent commit: ${evidence.parentCommit}\nDelta base: ${evidence.fullHead}`;
  const scopedResolutions = JSON.stringify([
    {
      finding: "pass-1-blocking-1",
      evidence: ["src/main.ts"],
      verification: "Task 2 feedback approved the original correction.",
    },
  ]);
  const requested = `\n## Pass 3 — 2026-09-14\n\nBase: ${base}\nHead: ${head}\nVerdict: changes-requested\n${provenance}\nResolutions: ${scopedResolutions}\n\n### Blocking\n- [src/main.ts:1] id: pass-3-blocking-1; kind: evidence-gap; Verify the changed consumer behavior (violates: review coverage)\n\n### Suggestions\n- None.\n`;
  write(evidence.repository, reviewPath, `${review}${requested}`);
  commitPaths(evidence.repository, "record a scoped review finding", reviewPath);
  const scopedHead = git(evidence.repository, "rev-parse", "HEAD");
  const resolutions = [
    {
      finding: "pass-1-blocking-1",
      evidence: ["src/main.ts", evidencePath("demo", "plan.md")],
      verification: "Task 2 feedback approved the code correction and focused verification.",
    },
    ...(resolveScopedFinding
      ? [{
          finding: "pass-3-blocking-1",
          evidence: ["src/main.ts"],
          verification: "The changed consumer behavior passed its focused check.",
        }]
      : []),
  ];
  const approved = `\n## Pass 4 — 2026-09-15\n\nBase: ${base}\nHead: ${scopedHead}\nVerdict: approved-remediation\n${provenance}\nResolutions: ${JSON.stringify(resolutions)}\n\n### Blocking\n- None.\n\n### Suggestions\n- Resolved the cumulative baseline and scoped blocker set.\n`;
  const currentReview = Fs.readFileSync(Path.join(evidence.repository, reviewPath), "utf8");
  write(evidence.repository, reviewPath, `${currentReview}${approved}`);
  commitPaths(evidence.repository, "clear the cumulative scoped finding set", reviewPath);
};

const rewriteBoundedReview = (
  evidence: ReturnType<typeof makeBoundedRemediationEvidence>,
  transform: (source: string) => string,
): void => {
  const reviewPath = evidencePath("demo", "review.md");
  const source = Fs.readFileSync(Path.join(evidence.repository, reviewPath), "utf8");
  write(evidence.repository, reviewPath, transform(source));
  commitPaths(evidence.repository, "update bounded review evidence", reviewPath);
};

const makeLegacyCurrentConfirmation = (
  overrides: Record<string, unknown> = {},
  options: { readonly formalApproval?: boolean; readonly knownInputContext?: boolean; readonly priorBlocked?: boolean } = {},
) => {
  const repository = makeRepo();
  const proposalPath = evidencePath("demo", "proposal.md");
  const approvalCommit = options.formalApproval
    ? (() => {
        write(
          repository,
          proposalPath,
          `---\nartifact: proposal\nchange: demo\nstatus: approved\ndecision: accepted\nauthor: test\ncreated: 2026-09-12\nroute_unit: null\n---\n# Proposal: Demo\n\n## Why\nLegacy task intent.\n\n## Goals & Success Criteria\nThe task works.\n\n## Non-Goals\nNo unrelated work.\n\n## Proposed Change\nUse current input provenance.\n\n## Capabilities\nThe existing capability.\n\n## Impact\nNo other paths.\n`,
        );
        return commitPaths(repository, "approve legacy task proposal", proposalPath);
      })()
    : undefined;
  const proposalBlob = options.formalApproval
    ? git(repository, "rev-parse", `HEAD:${proposalPath}`)
    : undefined;
  const evidence = makeEvidence(repository, {
    withoutTaskInputContext: !options.knownInputContext,
    ...(options.priorBlocked ? { taskProgressStatus: "blocked", taskOutcomeField: "- Outcome: blocked" } : {}),
    ...(approvalCommit === undefined
      ? {}
      : {
          intentCommit: approvalCommit,
          intentApprovals: [{ path: "proposal.md", reference: "requester-proposal-17", commit: approvalCommit }],
          inputs: [{ path: proposalPath, blob: proposalBlob! }],
        }),
  });
  const ownerReference = String(overrides.ownerReference ?? "requester-message-17");
  const confirmationInputs = options.formalApproval
    ? [
        { path: "README.md", blob: git(repository, "rev-parse", "HEAD:README.md") },
        { path: proposalPath, blob: git(repository, "rev-parse", `HEAD:${proposalPath}`) },
      ]
    : [{ path: "README.md", blob: git(repository, "rev-parse", "HEAD:README.md") }];
  const confirmation = {
    version: 1,
    task: 1,
    repository: Fs.realpathSync(repository),
    taskDefinition: taskDefinitionDigest("### Task 1: Implement\n\n- Depends on: none"),
    intentCommit: approvalCommit ?? `tactical:${ownerReference}`,
    inputs: confirmationInputs,
    historicalInputs: "unknown",
    owner: "Requester",
    ownerReference,
    reviewer: "Independent reviewer",
    reviewReference: "review-record-29",
    rationale: "The committed implementation satisfies this unchanged task against the listed current inputs.",
    ...overrides,
  };
  const planPath = evidencePath("demo", "plan.md");
  const originalPlan = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  const scopedPlan = options.knownInputContext ? originalPlan.replace(/^- Notes: \{.*\}\n/gm, "") : originalPlan;
  const plan = scopedPlan.replace(
    "route_unit: null\n",
    `route_unit: null\nlegacy_input_confirmations: ${JSON.stringify([confirmation])}\n`,
  );
  write(repository, planPath, plan);
  const confirmationCommit = commitPaths(repository, "record scoped legacy input confirmation", planPath);
  const reviewPath = evidencePath("demo", "review.md");
  write(
    repository,
    reviewPath,
    reviewDocument("review", evidence.base, confirmationCommit, "compatibility"),
  );
  commitPaths(repository, "review scoped legacy input confirmation", reviewPath);
  return { repository, ...evidence, confirmation };
};

const makeLegacyLaterAttempt = (mode: "unchanged" | "rewritten" | "restored" | "lost-provenance" | "lost-blocked-provenance") => {
  const evidence = makeLegacyCurrentConfirmation({}, { knownInputContext: mode === "lost-provenance" || mode === "lost-blocked-provenance", priorBlocked: mode === "lost-blocked-provenance" });
  const planPath = evidencePath("demo", "plan.md");
  if (mode === "rewritten" || mode === "restored") {
    const original = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
    const oldDefinition = "### Task 1: Implement\n\n- Depends on: none";
    const revisedDefinition = `${oldDefinition}\n- Files: src/main.ts`;
    const confirmation = { ...evidence.confirmation, taskDefinition: taskDefinitionDigest(revisedDefinition) };
    write(evidence.repository, planPath, original.replace(oldDefinition, revisedDefinition).replace(JSON.stringify([evidence.confirmation]), JSON.stringify([confirmation])));
    commitPaths(evidence.repository, "rewrite completed definition with current digest", planPath);
    if (mode === "restored") {
      write(evidence.repository, planPath, original);
      commitPaths(evidence.repository, "restore current definition without erasing retained rewrite", planPath);
    }
  }
  const taskPath = evidencePath("demo", "tasks/task-1/progress.md");
  const originalTask = Fs.readFileSync(Path.join(evidence.repository, taskPath), "utf8");
  write(evidence.repository, taskPath, `${originalTask.replace(/^status: blocked$/m, "status: done")}\n## Attempt 2 — 2026-09-12\n\n- Implemented: Later unchanged-identity task attempt.\n- Tests: true\n- Outcome: done\n`);
  write(evidence.repository, "src/main.ts", "export const value = 2;\n");
  const head = commitPaths(evidence.repository, "later code and append-only task attempt", taskPath, "src/main.ts");
  const feedbackPath = evidencePath("demo", "tasks/task-1/feedback.md");
  const feedback = Fs.readFileSync(Path.join(evidence.repository, feedbackPath), "utf8");
  const prefix = feedback.replace(/^(base|head|verdict):.*\n/gm, "");
  write(evidence.repository, feedbackPath, `${prefix}\n## Pass 2 — 2026-09-12\nBase: ${evidence.base}\nHead: ${head}\nVerdict: approved\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`);
  commitPaths(evidence.repository, "append feedback for later attempt", feedbackPath);
  expect(Fs.readFileSync(Path.join(evidence.repository, taskPath), "utf8")).toContain(originalTask.slice(originalTask.indexOf("# Task Progress:")));
  expect(git(evidence.repository, "show", `${evidence.material}:${taskPath}`)).toBe(originalTask.trimEnd());
  expect(Fs.readFileSync(Path.join(evidence.repository, feedbackPath), "utf8")).toContain(feedback.split("# Code Feedback:")[1] ?? "missing original body");
  return evidence;
};

const makeInputImpactEvidence = (affectCompletedTask = false, inputPath = "AGENTS.md"): {
  readonly repository: string;
  readonly changeDir: string;
  readonly previousPlanCommit: string;
  readonly previousBlob: string;
  readonly currentBlob: string;
  readonly reviewReference: string;
} => {
  const repository = makeRepo();
  write(repository, inputPath, "Use the old command.\n");
  commitPaths(repository, "old input", inputPath);
  const { changeDir } = makeEvidence(repository, {
    inputs: [{ path: inputPath, blob: git(repository, "rev-parse", `HEAD:${inputPath}`) }],
  });
  const planPath = evidencePath("demo", "plan.md");
  const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
  const previousBlob = git(repository, "rev-parse", `HEAD:${inputPath}`);
  write(repository, inputPath, "Use the new command.\n");
  commitPaths(repository, "change input", inputPath);
  const currentBlob = git(repository, "rev-parse", `HEAD:${inputPath}`);
  const reviewReference = "review-record-21";
  const inputImpact = {
    version: 1,
    previousPlanCommit,
    reviewReference,
    changes: [
      {
        path: inputPath,
        previousBlob,
        currentBlob,
        affectedTasks: affectCompletedTask ? [1] : [],
        unaffectedTasks: affectCompletedTask ? [] : [1],
        newTasks: [],
        unresolvedIntent: false,
        rationale: affectCompletedTask
          ? "The fixture attempts to reclassify a completed task."
          : "The command update does not change the completed task obligations.",
      },
    ],
  };
  const plan = Fs.readFileSync(Path.join(repository, planPath), "utf8")
    .replace("route_unit: null\n", `route_unit: null\ninput_impact: ${JSON.stringify(inputImpact)}\n`)
    .replace(
      "A plan.",
      `- Input impact review: ${reviewReference}\n- Input impact previous plan: ${previousPlanCommit}`,
    );
  write(repository, planPath, plan);
  commitPaths(repository, "record input impact", planPath);
  return { repository, changeDir, previousPlanCommit, previousBlob, currentBlob, reviewReference };
};

const makeFormalInputImpactEvidence = (historicallyApproved = true, classified = true, mode: "changed" | "added" | "deleted" = "changed") => {
  const repository = makeRepo();
  const proposalPath = evidencePath("demo", "proposal.md");
  const proposal = `---\nartifact: proposal\nchange: demo\nstatus: ${historicallyApproved ? "approved" : "draft"}\ndecision: accepted\nauthor: test\ncreated: 2026-09-12\nroute_unit: null\n---\n# Proposal: Demo\n\n## Why\nOriginal scope.\n\n## Goals & Success Criteria\nThe task works.\n\n## Non-Goals\nNo unrelated work.\n\n## Proposed Change\nAn approved change.\n\n## Capabilities\nThe existing capability.\n\n## Impact\nThe original task contract.\n`;
  if (mode !== "added") write(repository, proposalPath, proposal);
  const approval = mode === "added" ? git(repository, "rev-parse", "HEAD") : commitPaths(repository, "original formal approval", proposalPath);
  const previousBlob = mode === "added" ? null : git(repository, "rev-parse", `HEAD:${proposalPath}`);
  const evidence = makeEvidence(repository, {
    intentCommit: mode === "added" ? "tactical:original-approved-breakdown" : approval,
    intentApprovals: mode === "added" ? [] : [{ path: "proposal.md", reference: "owner-p1", commit: approval }],
    inputs: previousBlob === null ? [] : [{ path: proposalPath, blob: previousBlob }],
  });
  const planPath = evidencePath("demo", "plan.md");
  const originalPlan = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  if (mode === "deleted") Fs.unlinkSync(Path.join(repository, proposalPath));
  else write(repository, proposalPath, proposal.replace("status: draft", "status: approved").replace("Original scope.", "An independently classified clarification outside the completed task."));
  const updatedApproval = commitPaths(repository, "current formal approval", proposalPath);
  const currentBlob = mode === "deleted" ? null : git(repository, "rev-parse", `HEAD:${proposalPath}`);
  const impact = {
    version: 1,
    previousPlanCommit: evidence.material,
    reviewReference: "review-unaffected-formal-task",
    changes: [{ path: proposalPath, previousBlob, currentBlob, affectedTasks: [], unaffectedTasks: [1], newTasks: [], unresolvedIntent: false, rationale: "The frozen original contract remains certified; this mechanical fixture does not authenticate semantic review." }],
  };
  const approvalEntry = `intent_approvals:\n  - path: proposal.md\n    reference: owner-p1\n    commit: ${approval}\n`;
  let currentPlan = mode === "deleted"
    ? originalPlan.replace(approvalEntry, "")
    : mode === "added"
      ? originalPlan.replace("route_unit: null\n", `route_unit: null\nintent_approvals:\n  - path: proposal.md\n    reference: owner-p2\n    commit: ${updatedApproval}\n`)
      : originalPlan.replace(`    reference: owner-p1\n    commit: ${approval}`, `    reference: owner-p2\n    commit: ${updatedApproval}`);
  if (classified)
    currentPlan = currentPlan.replace("route_unit: null\n", `route_unit: null\ninput_impact: ${JSON.stringify(impact)}\n`).replace("A plan.", `- Input impact review: ${impact.reviewReference}\n- Input impact previous plan: ${evidence.material}`);
  write(repository, planPath, currentPlan);
  commitPaths(repository, "record current approval and impact classification", planPath);
  return { repository, changeDir: evidence.changeDir, originalPlan, planPath };
};

const makeRepeatedUnaffectedImpactEvidence = (mode: "formal" | "standards" | "reintroduced" | "another-input" | "added-another-input", prior: "valid" | "missing" | "stale" | "forged" = "valid") => {
  const evidence = mode === "standards" ? makeInputImpactEvidence() : makeFormalInputImpactEvidence(true, true, mode === "reintroduced" ? "deleted" : mode === "added-another-input" ? "added" : "changed");
  const { repository, changeDir } = evidence;
  const planPath = evidencePath("demo", "plan.md");
  const inputPath = mode === "formal" || mode === "reintroduced" ? evidencePath("demo", "proposal.md") : "AGENTS.md";
  let plan = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  const notes = plan.split("\n").find((line) => line.startsWith("- Notes:"))!;
  const taskEvidence = ["progress.md", "tasks/task-1/progress.md", "tasks/task-1/feedback.md"].map((path) => ({
    path: evidencePath("demo", path),
    blob: git(repository, "rev-parse", `HEAD:${evidencePath("demo", path)}`),
  }));
  const firstImpactCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
  if (prior === "missing") {
    plan = plan.replace(/^input_impact:.*\n/m, "").replace(/^- Input impact (review|previous plan):.*\n?/gm, "");
    write(repository, planPath, plan);
    commitPaths(repository, "erase preceding retention proof", planPath);
  } else if (prior === "stale") {
    write(repository, inputPath, Fs.readFileSync(Path.join(repository, inputPath), "utf8") + "\nUnreviewed intermediate input.\n");
    commitPaths(repository, "change prior reviewed input", inputPath);
    plan = plan.replace("## Overview\n", "## Overview\n\nRetained prior impact without its current input.\n");
    write(repository, planPath, plan);
    commitPaths(repository, "record stale prior input snapshot", planPath);
  } else if (prior === "forged") {
    const declared = JSON.parse(/^input_impact: (.+)$/m.exec(plan)![1]!);
    declared.previousPlanCommit = firstImpactCommit;
    declared.changes[0].previousBlob = "f".repeat(40);
    plan = plan.replace(/^input_impact:.*$/m, `input_impact: ${JSON.stringify(declared)}`)
      .replace(/^- Input impact previous plan:.*$/m, `- Input impact previous plan: ${firstImpactCommit}`);
    write(repository, planPath, plan);
    commitPaths(repository, "introduce forged preceding input snapshot", planPath);
  }
  const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
  const exists = Fs.existsSync(Path.join(repository, inputPath));
  const previousBlob = exists ? git(repository, "rev-parse", `HEAD:${inputPath}`) : null;
  const originalInputs = JSON.parse(notes.slice("- Notes: ".length)).inputs as readonly { path: string; blob: string }[];
  const originalBlob = originalInputs.find((input) => input.path === inputPath)?.blob;
  const inputSource = exists ? Fs.readFileSync(Path.join(repository, inputPath), "utf8") : originalBlob ? git(repository, "show", originalBlob) : "";
  write(repository, inputPath, inputSource + "\nA second reviewed clarification outside the completed contract.\n");
  const approval = commitPaths(repository, "second approved unaffected input revision", inputPath);
  const currentBlob = git(repository, "rev-parse", `HEAD:${inputPath}`);
  const impact = {
    version: 1,
    previousPlanCommit,
    reviewReference: "review-second-unaffected-retention",
    changes: [{ path: inputPath, previousBlob, currentBlob, affectedTasks: [], unaffectedTasks: [1], newTasks: [], unresolvedIntent: false, rationale: "Each predecessor must independently validate retained original authority; this fixture does not authenticate semantic review." }],
  };
  plan = plan.replace(/^input_impact:.*\n/m, "").replace(/^- Input impact (review|previous plan):.*\n?/gm, "")
    .replace("route_unit: null\n", `route_unit: null\ninput_impact: ${JSON.stringify(impact)}\n`)
    .replace("## Overview\n", `## Overview\n\n- Input impact review: ${impact.reviewReference}\n- Input impact previous plan: ${previousPlanCommit}\n`);
  if (mode === "formal")
    plan = plan.replace(/    reference: owner-p2\n    commit: [a-f0-9]+/, `    reference: owner-p3\n    commit: ${approval}`);
  else if (mode === "reintroduced")
    plan = plan.replace("route_unit: null\n", `route_unit: null\nintent_approvals:\n  - path: proposal.md\n    reference: owner-p3\n    commit: ${approval}\n`);
  write(repository, planPath, plan);
  commitPaths(repository, "second reviewed unaffected retention", planPath);
  return { repository, changeDir, planPath, notes, taskEvidence };
};

const makeAffectedTaskAbandonmentEvidence = (abandonTaskTwo = true): {
  readonly repository: string;
  readonly changeDir: string;
  readonly taskTwoProgressPath: string;
  readonly taskTwoFeedbackPath: string;
  readonly taskTwoProgressBlob: string;
  readonly taskTwoFeedbackBlob: string;
} => {
  const repository = makeRepo();
  write(repository, "AGENTS.md", "Use the old command.\n");
  commitPaths(repository, "old input", "AGENTS.md");
  const previousBlob = git(repository, "rev-parse", "HEAD:AGENTS.md");
  const { changeDir, base, material } = makeEvidence(repository, {
    inputs: [{ path: "AGENTS.md", blob: previousBlob }],
    rootStatus: "in-progress",
  });
  const planPath = evidencePath("demo", "plan.md");
  const progressPath = evidencePath("demo", "progress.md");
  const taskProgressPath = (id: number) =>
    evidencePath("demo", `tasks/task-${id}/progress.md`);
  const taskFeedbackPath = (id: number) =>
    evidencePath("demo", `tasks/task-${id}/feedback.md`);
  const contextFor = (definition: string, blob: string, impactPlanCommit?: string) =>
    JSON.stringify({
      version: 1,
      repository,
      intentCommit: "tactical:precondition-fixture",
      taskDefinition: taskDefinitionDigest(definition),
      inputs: [{ path: "AGENTS.md", blob }],
      ...(impactPlanCommit === undefined ? {} : { impactPlanCommit }),
    });
  const definition = (id: number, title: string) =>
    `### Task ${id}: ${title}\n\n- Depends on: none\n- Files: src/task-${id}.ts\n- Acceptance:\n  - Preserve the captured obligation.`;
  const priorDefinitions = [2, 3, 4].map((id) => definition(id, id === 2 ? "Affected" : `Continue ${id}`));
  const priorContexts = new Map(
    [2, 3, 4].map((id, index) => [id, contextFor(priorDefinitions[index] ?? "", previousBlob)]),
  );
  const initialPlan = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  const taskOneDefinition = "### Task 1: Implement\n\n- Depends on: none";
  const taskOneContext = contextFor(taskOneDefinition, previousBlob);
  const planPrefix = initialPlan.slice(0, initialPlan.indexOf("## Tasks"));
  write(
    repository,
    planPath,
    `${planPrefix}## Tasks\n\n${taskOneDefinition}\n- Notes: ${taskOneContext}\n\n${priorDefinitions.map((task) => `${task}\n- Notes: ${priorContexts.get(Number(/^### Task ([0-9]+)/.exec(task)?.[1]) ?? 0)}`).join("\n\n")}\n\n## Done when\nIt works.\n`,
  );
  const priorTasks = [
    { id: 1, title: "Implement", status: "done" },
    { id: 2, title: "Affected", status: "pending" },
    { id: 3, title: "Continue 3", status: "pending" },
    { id: 4, title: "Continue 4", status: "pending" },
  ];
  const renderProgress = (
    tasks: readonly { readonly id: number; readonly title: string; readonly status: string }[],
  ) =>
    `---\nartifact: progress\nchange: demo\nstatus: in-progress\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n${tasks.map((task) => `  - id: ${task.id}\n    title: ${task.title}\n    status: ${task.status}\n    progress: tasks/task-${task.id}/progress.md`).join("\n")}\n---\n# Progress: Demo\n\n| Task | Status | Progress |\n| --- | --- | --- |\n${tasks.map((task) => `| Task ${task.id}: ${task.title} | ${task.status} | [details](tasks/task-${task.id}/progress.md) |`).join("\n")}\n`;
  write(repository, progressPath, renderProgress(priorTasks));
  for (const task of priorTasks.slice(1))
    write(
      repository,
      taskProgressPath(task.id),
      `---\nartifact: task-progress\nchange: demo\ntask: ${task.id}\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task ${task.id} — ${task.title}\n`,
    );
  const taskTwoFeedbackDocument = reviewDocument(
    "feedback",
    base,
    material,
    "multi-pass",
    false,
    "Affected",
  )
    .replace("task: 1", "task: 2")
    .replace("Task 1 — Affected", "Task 2 — Affected");
  write(repository, taskFeedbackPath(2), taskTwoFeedbackDocument);
  commitAll(repository, "append tasks and preserve Task 2 feedback history");
  const taskTwoProgressBlob = git(repository, "rev-parse", `HEAD:${taskProgressPath(2)}`);
  const taskTwoFeedbackBlob = git(repository, "rev-parse", `HEAD:${taskFeedbackPath(2)}`);
  const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);

  write(repository, "AGENTS.md", "Use the new command.\n");
  commitPaths(repository, "change reviewed input", "AGENTS.md");
  const currentBlob = git(repository, "rev-parse", "HEAD:AGENTS.md");
  const impactReference = "owner-review-abandon-affected-task-18";
  const transitionReference = "owner-order-abandon-affected-task-18";
  const amendedTaskTwoTitle = abandonTaskTwo
    ? "Affected (abandoned — replaced by Task 5)"
    : "Affected revised";
  const newExecutionOrder = abandonTaskTwo ? [1, 3, 4, 5] : [1, 2, 3, 4, 5];
  const transitionAffected = abandonTaskTwo
    ? "Task 2 is abandoned and Task 5 carries its remaining obligation."
    : "Task 2 retains its identity and Task 5 is appended after it.";
  const transition = {
    version: 1,
    previousPlanCommit,
    previousOrder: [1, 2, 3, 4],
    fullyGatedPrefix: [1],
    approval: transitionReference,
    reason: "The owner revised the affected unfinished obligation while preserving the gated prefix.",
    affected: transitionAffected,
  };
  const inputImpact = {
    version: 1,
    previousPlanCommit,
    reviewReference: impactReference,
    changes: [
      {
        path: "AGENTS.md",
        previousBlob,
        currentBlob,
        affectedTasks: [2],
        unaffectedTasks: [1, 3, 4],
        newTasks: [5],
        unresolvedIntent: false,
        rationale: "The owner classified the changed input and appended the new Task 5 obligation.",
      },
    ],
  };
  const execution = { version: 1, order: newExecutionOrder };
  const renderAmendedPlan = (impactPlanCommit: string) => {
    const taskOne = `${taskOneDefinition}\n- Notes: ${taskOneContext}`;
    const taskTwoDefinition = definition(2, amendedTaskTwoTitle);
    const taskTwo = `${taskTwoDefinition}\n- Notes: ${contextFor(taskTwoDefinition, abandonTaskTwo ? previousBlob : currentBlob, abandonTaskTwo ? undefined : impactPlanCommit)}`;
    const taskThreeDefinition = definition(3, "Continue 3");
    const taskThree = `${taskThreeDefinition}\n- Notes: ${contextFor(taskThreeDefinition, previousBlob)}`;
    const taskFourDefinition = definition(4, "Continue 4");
    const taskFour = `${taskFourDefinition}\n- Notes: ${contextFor(taskFourDefinition, previousBlob)}`;
    const taskFiveDefinition = definition(5, "Replacement");
    const taskFive = `${taskFiveDefinition}\n- Notes: ${contextFor(taskFiveDefinition, currentBlob, impactPlanCommit)}`;
    return `---\nartifact: plan\nchange: demo\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\nexecution: ${JSON.stringify(execution)}\nexecution_transition: ${JSON.stringify(transition)}\ninput_impact: ${JSON.stringify(inputImpact)}\n---\n# Plan: Demo\n\n## Overview\nA plan.\n\n- Execution approval: ${transitionReference}\n- Previous execution order: 1, 2, 3, 4\n- New execution order: ${newExecutionOrder.join(", ")}\n- Fully gated prefix: 1\n- Reason: ${transition.reason}\n- Affected obligations: ${transition.affected}\n- Input impact review: ${impactReference}\n- Input impact previous plan: ${previousPlanCommit}\n\n## Tasks\n\n${[taskOne, taskTwo, taskThree, taskFour, taskFive].join("\n\n")}\n\n## Done when\nThe surviving and replacement obligations are verified.\n`;
  };
  write(repository, planPath, renderAmendedPlan("0".repeat(40)));
  const impactPlanCommit = commitPaths(repository, "record reviewed impact and authorized task transition", planPath);
  write(repository, planPath, renderAmendedPlan(impactPlanCommit));
  const currentTasks = [
    { id: 1, title: "Implement", status: "done" },
    ...(abandonTaskTwo ? [] : [{ id: 2, title: amendedTaskTwoTitle, status: "pending" }]),
    { id: 3, title: "Continue 3", status: "pending" },
    { id: 4, title: "Continue 4", status: "pending" },
    { id: 5, title: "Replacement", status: "pending" },
  ];
  write(repository, progressPath, renderProgress(currentTasks));
  write(
    repository,
    taskProgressPath(5),
    "---\nartifact: task-progress\nchange: demo\ntask: 5\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 5 — Replacement\n",
  );
  commitAll(repository, "bind Task 5 to the reviewed impact plan and synchronize active ledger");
  const taskTwoProgress = taskProgressPath(2);
  const taskTwoFeedbackArtifactPath = taskFeedbackPath(2);
  return {
    repository,
    changeDir,
    taskTwoProgressPath: taskTwoProgress,
    taskTwoFeedbackPath: taskTwoFeedbackArtifactPath,
    taskTwoProgressBlob,
    taskTwoFeedbackBlob,
  };
};

const makeExecutionTransitionEvidence = (
  repository: string,
  options: {
    readonly feedbackApproved?: boolean;
    readonly previousPlanCommit?: string;
    readonly previousOrder?: readonly number[];
    readonly fullyGatedPrefix?: readonly number[];
  } = {},
): { readonly changeDir: string; readonly transitionCommit: string } => {
  const evidence = makeEvidence(repository);
  if (options.feedbackApproved === false) {
    const feedbackPath = evidencePath("demo", "tasks/task-1/feedback.md");
    const feedback = Fs.readFileSync(Path.join(repository, feedbackPath), "utf8");
    write(
      repository,
      feedbackPath,
      feedback
        .replace("verdict: approved", "verdict: changes-requested")
        .replace("### Blocking\n- None.", "### Blocking\n- [src/main.ts:1] Clarify (violates: acceptance)"),
    );
    commitPaths(repository, "request changes in execution transition fixture", feedbackPath);
  }
  const planPath = evidencePath("demo", "plan.md");
  const progressPath = evidencePath("demo", "progress.md");
  const previousPlanCommit = options.previousPlanCommit ?? evidence.material;
  const previousOrder = options.previousOrder ?? [1];
  const fullyGatedPrefix = options.fullyGatedPrefix ?? [1];
  const approval = "requester-message-18";
  const reason = "Task 2 supplies a prerequisite for the blocked continuation.";
  const affected = "Task 1 remains gated; Task 2 owns the new prerequisite.";
  const firstDefinition = "### Task 1: Implement\n\n- Depends on: none";
  const firstContext = JSON.stringify({
    version: 1,
    repository,
    intentCommit: "tactical:precondition-fixture",
    taskDefinition: taskDefinitionDigest(firstDefinition),
    inputs: [],
  });
  const secondDefinition =
    "### Task 2: Prerequisite\n\n- Depends on: none\n- Files: src/task-2.ts";
  const secondContext = JSON.stringify({
    version: 1,
    repository,
    intentCommit: "tactical:precondition-fixture",
    taskDefinition: taskDefinitionDigest(secondDefinition),
    inputs: [],
  });
  const newOrder = [1, 2];
  write(
    repository,
    planPath,
    `---\nartifact: plan\nchange: demo\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\nexecution:\n  version: 1\n  order: [1, 2]\nexecution_transition:\n  version: 1\n  previousPlanCommit: ${previousPlanCommit}\n  previousOrder: [${previousOrder.join(", ")}]\n  fullyGatedPrefix: [${fullyGatedPrefix.join(", ")}]\n  approval: ${approval}\n  reason: ${reason}\n  affected: ${affected}\n---\n# Plan: Demo\n\n## Overview\n\n- Execution approval: ${approval}\n- Previous execution order: ${previousOrder.join(", ")}\n- New execution order: ${newOrder.join(", ")}\n- Fully gated prefix: ${fullyGatedPrefix.length === 0 ? "none" : fullyGatedPrefix.join(", ")}\n- Reason: ${reason}\n- Affected obligations: ${affected}\n\n## Tasks\n\n${firstDefinition}\n- Notes: ${firstContext}\n\n${secondDefinition}\n- Notes: ${secondContext}\n\n## Done when\n\nThe prerequisite is complete.\n`,
  );
  write(
    repository,
    progressPath,
    `---\nartifact: progress\nchange: demo\nstatus: in-progress\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: Implement\n    status: done\n    progress: tasks/task-1/progress.md\n  - id: 2\n    title: Prerequisite\n    status: pending\n    progress: tasks/task-2/progress.md\n---\n# Progress: Demo\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Implement | done | [details](tasks/task-1/progress.md) |\n| Task 2: Prerequisite | pending | [details](tasks/task-2/progress.md) |\n`,
  );
  write(
    repository,
    evidencePath("demo", "tasks/task-2/progress.md"),
    `---\nartifact: task-progress\nchange: demo\ntask: 2\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 2 — Prerequisite\n`,
  );
  const transitionCommit = commitAll(repository, "authorize execution transition fixture");
  return { changeDir: evidence.changeDir, transitionCommit };
};

const makeDependencyModeScaffold = (
  repository: string,
  unlistedMaterial = false,
): { readonly changeDir: string; readonly base: string } => {
  git(repository, "update-ref", fixtureTargetBranch, "HEAD");
  const changeDir = makeChangeDir(repository, "dependency-scaffold");
  const base = git(repository, "rev-parse", "HEAD");
  const definition = [
    "### Task 1: Create file",
    "",
    "- Goal: Create the required file.",
    "- Depends on: none",
    "- Acceptance:",
    "  - The required file is verified.",
    "- Steps:",
    "  1. Verify the file behavior.",
    "- Verify: bun --bun vitest run",
    "- Commit: feat: create required file",
  ].join("\n");
  const context = JSON.stringify({
    version: 1,
    repository: Fs.realpathSync(repository),
    intentCommit: "tactical:dependency-scaffold-fixture",
    taskDefinition: taskDefinitionDigest(definition),
    inputs: [],
  });
  const breakdown = taskBreakdownDigest([1], [{ id: 1, source: definition }]);
  write(
    repository,
    evidencePath("dependency-scaffold", "plan.md"),
    `---
artifact: plan
change: dependency-scaffold
status: approved
created: 2026-09-12
author: test
decision: accepted
route_unit: null
execution:
  version: 2
  mode: dependencies
initialization:
  version: 1
  base: ${base}
  authority: requester-scaffold-approval
  breakdown: ${breakdown}
  taskIds: [1]
---
# Plan: Dependency scaffold

## Overview

## Tasks

${definition}
- Notes: ${context}

## Done when

The file is complete.
`,
  );
  write(
    repository,
    evidencePath("dependency-scaffold", "progress.md"),
    `---
artifact: progress
change: dependency-scaffold
status: pending
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Create file
    status: pending
    progress: tasks/task-1/progress.md
---
# Progress: Dependency scaffold

| Task | Status | Progress |
| --- | --- | --- |
| Task 1: Create file | pending | [details](tasks/task-1/progress.md) |
`,
  );
  write(
    repository,
    evidencePath("dependency-scaffold", "tasks/task-1/progress.md"),
    `---
artifact: task-progress
change: dependency-scaffold
task: 1
status: pending
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Create file
`,
  );
  commitAll(repository, "commit dependency-mode initial scaffold");
  if (unlistedMaterial) {
    write(repository, "src/unlisted.ts", "export const partial = true;\n");
    commitPaths(repository, "add unlisted material work", "src/unlisted.ts");
  }
  return { changeDir, base };
};

const makeDependencyModeTransitionEvidence = (
  repository: string,
  fullyGatedTasks: readonly number[] = [1],
  options: {
    readonly feedbackApproved?: boolean;
    readonly taskOneDependsOnSecond?: boolean;
    readonly taskOneGoal?: string;
    readonly taskOneAcceptance?: string;
    readonly mutateTaskEvidenceAtTransition?: boolean;
  } = {},
): { readonly changeDir: string; readonly transitionCommit: string } => {
  const evidence = makeEvidence(repository, { dependencyMode: true });
  const feedbackPath = evidencePath("demo", "tasks/task-1/feedback.md");
  if (options.feedbackApproved === false) {
    const feedback = Fs.readFileSync(Path.join(repository, feedbackPath), "utf8")
      .replaceAll("Verdict: approved", "Verdict: changes-requested")
      .replaceAll("### Blocking\n- None.", "### Blocking\n- [src/main.ts:1] Clarify the accepted behavior (violates: acceptance)");
    write(repository, feedbackPath, feedback);
    commitPaths(repository, "record unresolved Task 1 feedback", feedbackPath);
  }
  const planPath = evidencePath("demo", "plan.md");
  const progressPath = evidencePath("demo", "progress.md");
  const previousPlanCommit = git(repository, "log", "-1", "--format=%H", "--", planPath);
  const approval = "requester-dependency-transition-22";
  const reason = "Task 2 adds a required dependency scheduling obligation.";
  const affected = "Task 2 is new; Task 1 remains fully gated.";
  const secondDefinition = [
    "### Task 2: Prerequisite",
    "",
    "- Goal: Deliver the prerequisite.",
    "- Depends on: none",
    "- Acceptance:",
    "  - The prerequisite is verified.",
    "- Steps:",
    "  1. Verify the prerequisite behavior.",
    "- Verify: bun --bun vitest run",
    "- Commit: feat: add prerequisite",
  ].join("\n");
  const context = JSON.stringify({
    version: 1,
    repository: Fs.realpathSync(repository),
    intentCommit: "tactical:precondition-fixture",
    taskDefinition: taskDefinitionDigest(secondDefinition),
    inputs: [],
  });
  const gatedTasks = fullyGatedTasks.length === 0 ? "[]" : `[${fullyGatedTasks.join(", ")}]`;
  let planSource = Fs.readFileSync(Path.join(repository, planPath), "utf8");
  planSource = planSource
    .replace(
      "  mode: dependencies\n---",
      `  mode: dependencies\nexecution_transition:\n  version: 2\n  previousPlanCommit: ${previousPlanCommit}\n  fullyGatedTasks: ${gatedTasks}\n  approval: ${approval}\n  reason: ${reason}\n  affected: ${affected}\n---`,
    )
    .replace(
      "## Overview\nA plan.\n",
      `## Overview\nA plan.\n\n- Execution approval: ${approval}\n- Fully gated tasks: ${fullyGatedTasks.length === 0 ? "none" : fullyGatedTasks.join(", ")}\n- Reason: ${reason}\n- Affected obligations: ${affected}\n`,
    )
    .replace(
      "\n## Done when\n",
      `\n\n${secondDefinition}\n- Notes: ${context}\n\n## Done when\n`,
    );
  if (
    options.taskOneDependsOnSecond ||
    options.taskOneGoal !== undefined ||
    options.taskOneAcceptance !== undefined
  ) {
    const firstTaskBlock = planSource.match(
      /(### Task 1: Implement[\s\S]*?)(?=\n\n### Task 2:|\n## Done when)/,
    )?.[1];
    if (!firstTaskBlock) throw new Error("Task 1 fixture block is missing");
    const notesStart = firstTaskBlock.lastIndexOf("\n- Notes: ");
    const firstDefinition = notesStart < 0
      ? firstTaskBlock
      : firstTaskBlock.slice(0, notesStart);
    const firstContextSource = notesStart < 0
      ? "{}"
      : firstTaskBlock.slice(notesStart + "\n- Notes: ".length);
    const firstContext = JSON.parse(firstContextSource) as {
      readonly [key: string]: unknown;
      readonly taskDefinition: string;
    };
    const updatedDefinition = firstDefinition
      .replace(
        "- Depends on: none",
        options.taskOneDependsOnSecond ? "- Depends on: Task 2" : "- Depends on: none",
      )
      .replace(
        "- Goal: Deliver implement.",
        options.taskOneGoal === undefined ? "- Goal: Deliver implement." : `- Goal: ${options.taskOneGoal}`,
      )
      .replace(
        "  - The implement is verified.",
        options.taskOneAcceptance === undefined ? "  - The implement is verified." : `  - ${options.taskOneAcceptance}`,
      );
    const updatedContext = JSON.stringify({
      ...firstContext,
      taskDefinition: taskDefinitionDigest(updatedDefinition),
    });
    planSource = planSource.replace(
      firstTaskBlock,
      `${updatedDefinition}\n- Notes: ${updatedContext}`,
    );
  }
  write(repository, planPath, planSource);
  let progressSource = Fs.readFileSync(Path.join(repository, progressPath), "utf8");
  progressSource = progressSource
    .replace("status: complete", "status: in-progress")
    .replace(
      "\n---\n# Progress: Demo",
      "\n  - id: 2\n    title: Prerequisite\n    status: pending\n    progress: tasks/task-2/progress.md\n---\n# Progress: Demo",
    )
    .replace(
      "| Task 1: Implement | done | [details](tasks/task-1/progress.md) |\n",
      "| Task 1: Implement | done | [details](tasks/task-1/progress.md) |\n| Task 2: Prerequisite | pending | [details](tasks/task-2/progress.md) |\n",
    );
  write(repository, progressPath, progressSource);
  write(
    repository,
    evidencePath("demo", "tasks/task-2/progress.md"),
    `---
artifact: task-progress
change: demo
task: 2
status: pending
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 2 — Prerequisite
`,
  );
  if (options.mutateTaskEvidenceAtTransition) {
    const feedback = Fs.readFileSync(Path.join(repository, feedbackPath), "utf8")
      .replace("Verdict: approved", "Verdict: changes-requested")
      .replace("### Blocking\n- None.", "### Blocking\n- [src/main.ts:1] Clarify the accepted behavior (violates: acceptance)");
    write(repository, feedbackPath, feedback);
  }
  const transitionCommit = commitAll(repository, "authorize dependency execution transition");
  return { changeDir: evidence.changeDir, transitionCommit };
};

const makeEmptyProgressEvidence = (
  repository: string,
  abandoned: boolean,
): { readonly changeDir: string } => {
  const changeDir = makeChangeDir(repository, "demo");
  const base = git(repository, "rev-parse", "HEAD");
  const taskHeading = abandoned
    ? "### Task 1: Retired (abandoned — no longer needed)"
    : "### Task 1: Implement";
  write(
    repository,
    evidencePath("demo", "plan.md"),
    `---
artifact: plan
change: demo
status: approved
created: 2026-09-12
author: test
decision: accepted
route_unit: null
---
# Plan: Demo

## Overview
A plan.

## Tasks

${taskHeading}

## Done when
It works.
`,
  );
  write(
    repository,
    evidencePath("demo", "progress.md"),
    `---
artifact: progress
change: demo
status: complete
updated: 2026-09-12
decision: accepted
tasks: []
---
# Progress: Demo

| Task | Status | Progress |
| --- | --- | --- |
`,
  );
  const material = commitAll(repository, "material");
  write(
    repository,
    evidencePath("demo", "review.md"),
    reviewDocument("review", base, material, "compatibility"),
  );
  commitPaths(repository, "review", evidencePath("demo", "review.md"));
  return { changeDir };
};

describe("precondition repository gates", () => {
  it("checks initialization breakdown against the original snapshot, not amended current tasks", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "scaffold-proof");
    const base = git(repository, "rev-parse", "HEAD");
    const originalDefinition = [
      "### Task 1: Implement",
      "",
      "- Depends on: none",
      "- Files: src/main.ts",
      "- Acceptance:",
      "  - The original behavior is verified.",
    ].join("\n");
    const makeContext = (definition: string) =>
      JSON.stringify({
        version: 1,
        repository,
        intentCommit: "tactical:initialization-fixture",
        taskDefinition: taskDefinitionDigest(definition),
        inputs: [],
      });
    const breakdown = taskBreakdownDigest(
      [1],
      [{ id: 1, title: "Implement", dependsOn: [], source: originalDefinition }],
    );
    const makePlan = (definition: string) =>
      `---\nartifact: plan\nchange: scaffold-proof\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\ninitialization:\n  version: 1\n  base: ${base}\n  authority: requester-record-33\n  breakdown: ${breakdown}\n  taskIds: [1]\n---\n# Plan: Scaffold proof\n\n## Overview\n\n## Tasks\n\n${definition}\n- Notes: ${makeContext(definition)}\n\n## Done when\n\nThe task is complete.\n`;
    const pendingRoot = (title: string) =>
      `---\nartifact: progress\nchange: scaffold-proof\nstatus: in-progress\nupdated: 2026-09-12\ndecision: accepted\ntasks:\n  - id: 1\n    title: ${title}\n    status: pending\n    progress: tasks/task-1/progress.md\n---\n# Progress: Scaffold proof\n\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: ${title} | pending | [details](tasks/task-1/progress.md) |\n`;
    const pendingTask = (title: string) =>
      `---\nartifact: task-progress\nchange: scaffold-proof\ntask: 1\nstatus: pending\nupdated: 2026-09-12\ndecision: accepted\n---\n# Task Progress: Task 1 — ${title}\n`;
    write(repository, evidencePath("scaffold-proof", "plan.md"), makePlan(originalDefinition));
    write(repository, evidencePath("scaffold-proof", "progress.md"), pendingRoot("Implement"));
    write(repository, evidencePath("scaffold-proof", "tasks/task-1/progress.md"), pendingTask("Implement"));
    const originalPlanCommit = commitAll(repository, "commit initial authorized scaffold");

    const clarifiedDefinition = originalDefinition.replace(
      "The original behavior is verified.",
      "The clarified boundary is verified.",
    );
    write(repository, evidencePath("scaffold-proof", "plan.md"), makePlan(clarifiedDefinition));
    commitPaths(repository, "clarify unfinished task", evidencePath("scaffold-proof", "plan.md"));
    const clarified = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(clarified.stdout).toContain("[PASS] Initialization proof");

    const renamedDefinition = clarifiedDefinition.replace("Task 1: Implement", "Task 1: Renamed");
    write(repository, evidencePath("scaffold-proof", "plan.md"), makePlan(renamedDefinition));
    write(repository, evidencePath("scaffold-proof", "progress.md"), pendingRoot("Renamed"));
    write(repository, evidencePath("scaffold-proof", "tasks/task-1/progress.md"), pendingTask("Renamed"));
    commitAll(repository, "synchronize unfinished task rename before feedback");
    const renamed = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(renamed.stdout).toContain("[PASS] Initialization proof");

    const abandonedDefinition = renamedDefinition.replace(
      "Task 1: Renamed",
      "Task 1: Renamed (abandoned — requester replaced the task)",
    );
    write(repository, evidencePath("scaffold-proof", "plan.md"), makePlan(abandonedDefinition));
    write(
      repository,
      evidencePath("scaffold-proof", "progress.md"),
      "---\nartifact: progress\nchange: scaffold-proof\nstatus: complete\nupdated: 2026-09-12\ndecision: accepted\ntasks: []\n---\n# Progress: Scaffold proof\n\n| Task | Status | Progress |\n| --- | --- | --- |\n",
    );
    commitAll(repository, "abandon unfinished initial task");
    const abandoned = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(abandoned.stdout).toContain("[PASS] Initialization proof");

    const forgedProof = Fs.readFileSync(
      Path.join(changeDir, "plan.md"),
      "utf8",
    ).replace(breakdown, "f".repeat(64));
    write(repository, evidencePath("scaffold-proof", "plan.md"), forgedProof);
    commitPaths(repository, "replace original breakdown with a well-formed forgery", evidencePath("scaffold-proof", "plan.md"));
    const forged = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(forged.stdout).toContain("[FAIL] Initialization (");
    expect(forged.stdout).toContain(
      "initial plan revision does not contain the authorized task breakdown proof",
    );

    const changedBase = Fs.readFileSync(
      Path.join(changeDir, "plan.md"),
      "utf8",
    ).replace(`base: ${base}`, `base: ${originalPlanCommit}`);
    write(repository, evidencePath("scaffold-proof", "plan.md"), changedBase);
    commitPaths(repository, "replace original base with a later revision", evidencePath("scaffold-proof", "plan.md"));
    const baseForgery = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(baseForgery.stdout).toContain("[FAIL] Initialization (");
    expect(baseForgery.stdout).toContain(
      "initialization base already contains scaffold artifact .kepler/changes/scaffold-proof/plan.md",
    );
    expect(originalPlanCommit).not.toBe(base);
  }, 15000);

  it("closes the gate when workflow evidence is absent", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");

    const result = await runPrecondition({
      changeDir,
      testCommand: "true",
      targetBranch: fixtureTargetBranch,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("[PASS] Clean tree");
    expect(result.stdout).toContain("[PASS] Tests (true)");
    expect(result.stdout).toContain("[PASS] Clean tree after verification");
    expect(result.stdout).toContain("[FAIL] Tasks");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("requires a supplied test command", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");

    const result = await runPrecondition({ changeDir, testCommand: "", targetBranch: fixtureTargetBranch});

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--test-cmd is required");
    expect(result.lastLine).toBe("");
  });

  it("closes the gate for a dirty target tree and names the path", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");
    write(repository, "stray.ts", "never committed\n");

    const result = await runPrecondition({
      changeDir,
      testCommand: "true",
      targetBranch: fixtureTargetBranch,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "[FAIL] Clean tree (1 uncommitted path(s))",
    );
    expect(result.stdout).toContain("?? stray.ts");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("checks and runs the test command in the target repository", async () => {
    const caller = makeRepo();
    const target = makeRepo();
    const changeDir = makeChangeDir(target, "add-auth");
    write(target, "target-only.txt", "target\n");
    commitAll(target, "add target marker");

    const result = await runPrecondition(
      {
        changeDir,
        testCommand: "test -f target-only.txt",
        targetBranch: fixtureTargetBranch,
      },
      createPreconditionRuntime({ cwd: () => caller }),
    );

    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain("[PASS] Tests (test -f target-only.txt)");
    expect(result.stdout).toContain("[FAIL] Tasks");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("does not borrow a passing command from the caller repository", async () => {
    const caller = makeRepo();
    const target = makeRepo();
    const changeDir = makeChangeDir(target, "add-auth");
    write(caller, "caller-only.txt", "caller\n");
    commitAll(caller, "add caller marker");

    const result = await runPrecondition(
      {
        changeDir,
        testCommand: "test -f caller-only.txt",
        targetBranch: fixtureTargetBranch,
      },
      createPreconditionRuntime({ cwd: () => caller }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "[FAIL] Tests (test -f caller-only.txt exited 1)",
    );
    expect(result.lastLine).toContain("gate: closed");
  });

  it("reports a failed test command and its output", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");

    const result = await runPrecondition({
      changeDir,
      testCommand: "echo 'boom: 2 failed'; exit 3",
      targetBranch: fixtureTargetBranch,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("exited 3");
    expect(result.stdout).toContain("boom: 2 failed");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("closes the gate when the test command is unavailable", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");
    const result = await runPrecondition(
      { changeDir, testCommand: "unavailable-test", targetBranch: fixtureTargetBranch},
      createPreconditionRuntime({
        process: {
          run: () => {
            throw new Error("command unavailable");
          },
        },
        git: {
          repositoryRoot: () => ({
            status: 0,
            stdout: `${repository}\n`,
            stderr: "",
          }),
          statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
          currentHead: () => ({
            status: 0,
            stdout: `${git(repository, "rev-parse", "HEAD")}\n`,
            stderr: "",
          }),
          currentBranch: () => ({ status: 0, stdout: "main\n", stderr: "" }),
          worktreeIdentity: () => ({
            status: 0,
            stdout: `${Path.join(repository, ".git")}\n`,
            stderr: "",
          }),
        },
      }),
    );

    expect(result).toEqual({
      _tag: "PreconditionResult",
      status: "error",
      exitCode: 2,
      stdout: "",
      stderr:
        "error: cannot execute test command: Error: command unavailable\n",
      lines: [],
      lastLine: "",
    });
  });

  it("closes the gate when verification mutates the target worktree", async () => {
    const caller = makeRepo();
    const target = makeRepo();
    const changeDir = makeChangeDir(target, "add-auth");
    const command = "printf mutation >> README.md";

    const result = await runPrecondition(
      { changeDir, testCommand: command, targetBranch: fixtureTargetBranch},
      createPreconditionRuntime({ cwd: () => caller }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`[PASS] Tests (${command})`);
    expect(result.stdout).toContain("[FAIL] Clean tree after verification");
    expect(result.stdout).toContain(" M README.md");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("keeps command and Git policy seams injectable", async () => {
    const repository = makeRepo();
    const changeDir = makeChangeDir(repository, "add-auth");
    const calls: string[] = [];
    const runtime = createPreconditionRuntime({
      cwd: () => repository,
      process: {
        run: (command, args, cwd) => {
          calls.push(`${command} ${args.join(" ")} @ ${cwd}`);
          return { status: 0, stdout: "", stderr: "" };
        },
      },
      git: {
        repositoryRoot: () => ({
          status: 0,
          stdout: `${repository}\n`,
          stderr: "",
        }),
        statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
        currentHead: () => ({
          status: 0,
          stdout: `${git(repository, "rev-parse", "HEAD")}\n`,
          stderr: "",
        }),
        currentBranch: () => ({ status: 0, stdout: "main\n", stderr: "" }),
        worktreeIdentity: () => ({
          status: 0,
          stdout: `${Path.join(repository, ".git")}\n`,
          stderr: "",
        }),
      },
    });
    const result = await runPrecondition(
      { changeDir, testCommand: "injected-test", targetBranch: fixtureTargetBranch},
      runtime,
    );

    expect(result.exitCode).toBe(1);
    expect(calls[0]).toBe("bash -c injected-test @ " + repository);
    expect(result.lastLine).toContain("gate: closed");
  });
});

it("rejects current-input changes without discarding the task handoff", async () => {
  const repository = makeRepo();
  write(repository, "AGENTS.md", "Use bun run build.\n");
  commitPaths(repository, "add standards", "AGENTS.md");
  const input = {
    path: "AGENTS.md",
    blob: git(repository, "rev-parse", "HEAD:AGENTS.md"),
  };
  const { changeDir } = makeEvidence(repository, { inputs: [input] });
  const current = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(current.exitCode).toBe(0);
  expect(current.stdout).toContain("[PASS] Inputs (1 current task contexts)");

  write(repository, "AGENTS.md", "Use bun run test.\n");
  commitPaths(repository, "change standards", "AGENTS.md");
  const changed = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(changed.exitCode).toBe(1);
  expect(changed.stdout).toContain("[FAIL] Inputs (Task 1 input changed since handoff: AGENTS.md)");
  expect(changed.lastLine).toContain("gate: closed");
});

describe("reviewed abandonment", () => {
  let evidence: ReturnType<typeof makeAffectedTaskAbandonmentEvidence>;
  beforeEach(() => {
    evidence = makeAffectedTaskAbandonmentEvidence();
  }, 5000);

  it("allows an affected feedback-bearing task to be abandoned with appended replacement obligations", async () => {
    const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

    expect(result.stdout).toContain(
      "[PASS] Input impact (owner-review-abandon-affected-task-18; review reference is asserted, not authenticated)",
    );
    expect(result.stdout).toContain(
      "[PASS] Execution transition (owner-order-abandon-affected-task-18; owner authority is asserted, not authenticated)",
    );
    expect(result.stdout).toContain("identity-order: 1, 2, 3, 4, 5");
    expect(result.stdout).toContain("execution-order: 1, 3, 4, 5");
    expect(result.lastLine).toContain("gate: closed");
    expect(git(evidence.repository, "rev-parse", `HEAD:${evidence.taskTwoProgressPath}`)).toBe(
      evidence.taskTwoProgressBlob,
    );
    expect(git(evidence.repository, "rev-parse", `HEAD:${evidence.taskTwoFeedbackPath}`)).toBe(
      evidence.taskTwoFeedbackBlob,
    );
  });

  it("does not treat the pending replacement log as an implementation revision", async () => {
    const path = evidencePath("demo", "plan.md");
    const source = Fs.readFileSync(Path.join(evidence.repository, path), "utf8");
    const start = source.indexOf("### Task 5:");
    const replacement = source.slice(start);
    const notes = /^- Notes: (.+)$/m.exec(replacement);
    expect(notes).not.toBeNull();
    const context = JSON.parse(notes![1]!);
    context.inputs.push({ path: "README.md", blob: git(evidence.repository, "rev-parse", "HEAD:README.md") });
    write(evidence.repository, path, source.slice(0, start) + replacement.replace(notes![0], `- Notes: ${JSON.stringify(context)}`));
    commitPaths(evidence.repository, "refresh pending handoff before any implementation", path);
    const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(result.stdout).toContain("[PASS] Input impact");
    expect(result.stdout).toContain("[PASS] Inputs");
    expect(result.stdout).toContain("[FAIL] Tasks");
    expect(result.lastLine).toContain("gate: closed");
  });

  it("context retains an affected abandoned task's original evidence under the validated impact", async () => {
    const result = await new ContextService(createContextRuntime()).execute({ changeDir: evidence.changeDir });
    expect(result.stdout).toContain("format: split");
    expect(result.stdout).toContain("input-impact-history: verified");
    expect(git(evidence.repository, "rev-parse", `HEAD:${evidence.taskTwoProgressPath}`)).toBe(evidence.taskTwoProgressBlob);
    expect(git(evidence.repository, "rev-parse", `HEAD:${evidence.taskTwoFeedbackPath}`)).toBe(evidence.taskTwoFeedbackBlob);
  });
});

it("retains historical formal approval for a frozen unaffected completed task", async () => {
  const evidence = makeFormalInputImpactEvidence();
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[PASS] Intent");
  expect(result.stdout).toContain("[PASS] Input impact");
  expect(result.stdout).toContain("[PASS] Inputs (1 current task contexts)");
  const originalNotes = evidence.originalPlan.split("\n").find((line) => line.startsWith("- Notes:"));
  expect(Fs.readFileSync(Path.join(evidence.repository, evidence.planPath), "utf8").split("\n").find((line) => line.startsWith("- Notes:"))).toBe(originalNotes);
});

it.each(["added", "deleted"] as const)("retains the completed original contract across reviewed formal input %s", async (mode) => {
  const evidence = makeFormalInputImpactEvidence(true, true, mode);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[PASS] Intent");
  expect(result.stdout).toContain("[PASS] Input impact");
  expect(result.stdout).toContain("[PASS] Inputs");
  const notes = evidence.originalPlan.split("\n").find((line) => line.startsWith("- Notes:"));
  expect(Fs.readFileSync(Path.join(evidence.repository, evidence.planPath), "utf8")).toContain(notes!);
});

it.each(["formal", "standards", "reintroduced", "another-input", "added-another-input"] as const)("retains original completed Notes across repeated unaffected %s input changes at admission", async (mode) => {
  const evidence = makeRepeatedUnaffectedImpactEvidence(mode);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[PASS] Intent");
  expect(result.stdout).toContain("[PASS] Input impact");
  expect(result.stdout).toContain("[PASS] Inputs");
  expect(Fs.readFileSync(Path.join(evidence.repository, evidence.planPath), "utf8")).toContain(evidence.notes);
  for (const item of evidence.taskEvidence)
    expect(git(evidence.repository, "rev-parse", `HEAD:${item.path}`)).toBe(item.blob);
});

it.each(["formal", "standards", "reintroduced", "another-input", "added-another-input"] as const)("context validates repeated unaffected %s retention without rewriting task evidence", async (mode) => {
  const evidence = makeRepeatedUnaffectedImpactEvidence(mode);
  const result = await new ContextService(createContextRuntime()).execute({ changeDir: evidence.changeDir });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("input-impact-history: verified");
  expect(result.stdout).toContain(`Task 1 input context: ${mode === "added-another-input" ? "current" : "impact-reviewed-unaffected"}`);
  expect(result.stdout).not.toContain("Task 1 input context: stale");
  expect(Fs.readFileSync(Path.join(evidence.repository, evidence.planPath), "utf8")).toContain(evidence.notes);
  for (const item of evidence.taskEvidence)
    expect(git(evidence.repository, "rev-parse", `HEAD:${item.path}`)).toBe(item.blob);
});

it.each(["missing", "stale", "forged"] as const)("rejects %s prior retention proof before chaining unaffected input changes", async (prior) => {
  const evidence = makeRepeatedUnaffectedImpactEvidence("formal", prior);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[FAIL] Input impact");
  expect(result.stdout).toContain("[FAIL] Inputs");
  expect(result.stdout).toContain("prior input");
  expect(result.lastLine).toContain("gate: closed");
  expect(Fs.readFileSync(Path.join(evidence.repository, evidence.planPath), "utf8")).toContain(evidence.notes);
});

it("keeps repository identity stale even when a reviewed input is literally named repository", async () => {
  const evidence = makeInputImpactEvidence(false, "repository");
  const path = evidencePath("demo", "plan.md");
  const original = Fs.readFileSync(Path.join(evidence.repository, path), "utf8");
  const notes = /^- Notes: (.+)$/m.exec(original)!;
  const context = JSON.parse(notes[1]!);
  context.repository = Path.join(evidence.repository, "another-checkout");
  write(evidence.repository, path, original.replace(notes[0], `- Notes: ${JSON.stringify(context)}`));
  commitPaths(evidence.repository, "controlled wrong repository identity after reviewed impact", path);
  const result = await new ContextService(createContextRuntime()).execute({ changeDir: evidence.changeDir });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("input-impact-history: verified");
  expect(result.stdout).toContain("Task 1 input context: stale");
  expect(result.stdout).not.toContain("Task 1 input context: impact-reviewed-unaffected");
});

it("does not grant reviewed unaffected context when its current working input is dirty", async () => {
  const evidence = makeRepeatedUnaffectedImpactEvidence("formal");
  write(evidence.repository, evidencePath("demo", "proposal.md"), "Unapproved working bytes.\n");
  const result = await new ContextService(createContextRuntime()).execute({ changeDir: evidence.changeDir });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("input-impact-history: blocked");
  expect(result.stdout).toContain("current worktree input changed");
  expect(result.stdout).not.toContain("Task 1 input context: impact-reviewed-unaffected");
});

it("requires prior retention proof when a deleted captured formal input is reintroduced", async () => {
  const evidence = makeRepeatedUnaffectedImpactEvidence("reintroduced", "missing");
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[FAIL] Input impact");
  expect(result.stdout).toContain("[FAIL] Inputs");
  expect(result.stdout).toContain("prior input");
  expect(result.lastLine).toContain("gate: closed");
});

it("invalidates formal approval when its working bytes differ from the committed approved input", async () => {
  const evidence = makeFormalInputImpactEvidence();
  const path = evidencePath("demo", "proposal.md");
  const original = Fs.readFileSync(Path.join(evidence.repository, path), "utf8");
  write(evidence.repository, path, original.replace("An independently classified clarification outside the completed task.", "Unapproved working scope."));
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[FAIL] Intent");
  expect(result.stdout).toContain("working bytes");
  expect(result.lastLine).toContain("gate: closed");
});

it.each(["null", "{ version: 2, order: [1] }"])("names explicit execution metadata diagnostics at admission for %s", async (execution) => {
  const repository = makeRepo();
  const evidence = makeEvidence(repository);
  const path = evidencePath("demo", "plan.md");
  const original = Fs.readFileSync(Path.join(repository, path), "utf8");
  write(repository, path, original.replace("route_unit: null\n", `route_unit: null\nexecution: ${execution}\n`));
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toMatch(/execution.*(object|version|constant|unsupported|must|malformed)/i);
  expect(result.lastLine).toContain("gate: closed");
});

it("holds historical formal input changes without validated unaffected classification", async () => {
  const evidence = makeFormalInputImpactEvidence(true, false);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[FAIL] Inputs");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects unapproved historical formal authority despite a current unaffected assertion", async () => {
  const evidence = makeFormalInputImpactEvidence(false);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("[FAIL] Inputs");
  expect(result.stdout).toContain("historical");
  expect(result.lastLine).toContain("gate: closed");
});

it.each(["admission", "context"])("retains execution amendment verification across repeated proof erasure in %s", async (reader) => {
  const repository = makeRepo();
  const evidence = makeExecutionTransitionEvidence(repository, { fullyGatedPrefix: [] });
  const path = evidencePath("demo", "plan.md");
  const source = Fs.readFileSync(Path.join(repository, path), "utf8");
  const erased = source.replace(/^execution_transition:\n(?:  .*\n)+/m, "").replace(/^- (Execution approval|Previous execution order|New execution order|Fully gated prefix|Reason|Affected obligations):.*\n/gm, "");
  write(repository, path, erased);
  commitPaths(repository, "erase current execution proof", path);
  write(repository, path, erased.replace("## Overview\n", "## Overview\n\nUnrelated overview bookkeeping.\n"));
  commitPaths(repository, "follow proof erasure with unchanged execution order", path);
  const result = reader === "admission"
    ? await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch})
    : await new ContextService(createContextRuntime()).execute({ changeDir: evidence.changeDir });
  expect(result.stdout).toContain(reader === "admission" ? "[FAIL] Execution transition" : "execution-history: blocked");
  expect(result.stdout).toContain("execution transition gated prefix disagrees");
});

describe.each([
  { abandon: false, title: "rejects renaming a feedback-bearing task instead of abandoning and appending", reason: "input impact cannot rename feedback-bearing Task 2; abandon and append instead" },
  { abandon: true, title: "rejects deleting feedback history for an abandoned affected task", reason: "input impact must preserve Task 2 feedback history after abandonment" },
])("abandonment boundary: $abandon", ({ abandon, title, reason }) => {
  let evidence: ReturnType<typeof makeAffectedTaskAbandonmentEvidence>;
  beforeEach(() => {
    evidence = makeAffectedTaskAbandonmentEvidence(abandon);
  }, 5000);

  it(title, async () => {
    if (abandon) {
      Fs.unlinkSync(Path.join(evidence.repository, evidence.taskTwoFeedbackPath));
      commitPaths(evidence.repository, "delete abandoned Task 2 feedback", evidence.taskTwoFeedbackPath);
    }
    const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(result.stdout).toContain(reason);
    expect(result.lastLine).toContain("gate: closed");
  });
});

it("preserves an unaffected completed task under a history-checked input impact", async () => {
  const evidence = makeInputImpactEvidence();
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain(
    `[PASS] Input impact (${evidence.reviewReference}; review reference is asserted, not authenticated)`,
  );
  expect(result.stdout).toContain("[PASS] Inputs (1 current task contexts)");
  expect(result.lastLine).toContain("gate: closed");

  write(evidence.repository, "AGENTS.md", "Use a later command.\n");
  commitPaths(evidence.repository, "change reviewed input again", "AGENTS.md");
  const stale = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(stale.stdout).toContain("input impact current input changed after review for AGENTS.md");
  expect(stale.lastLine).toContain("gate: closed");
});

it("rejects reclassifying a completed task as affected by an input change", async () => {
  const evidence = makeInputImpactEvidence(true);
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain(
    "input impact cannot reclassify missing or completed Task 1 as affected",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects an input-impact reference that forges the preceding plan revision", async () => {
  const evidence = makeInputImpactEvidence();
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const impactLine = plan.match(/^input_impact: (.+)$/m)?.[1];
  expect(impactLine).toBeDefined();
  const impact = JSON.parse(impactLine ?? "{}") as { previousPlanCommit: string };
  const forged = git(evidence.repository, "rev-parse", "HEAD~2");
  const nextImpact = JSON.stringify({ ...impact, previousPlanCommit: forged });
  write(
    evidence.repository,
    planPath,
    plan
      .replace(`input_impact: ${impactLine}`, `input_impact: ${nextImpact}`)
      .replaceAll(evidence.previousPlanCommit, forged),
  );
  commitPaths(evidence.repository, "forge input impact parent", planPath);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("input impact does not reference the actual preceding plan revision");
  expect(result.lastLine).toContain("gate: closed");
});

it("validates dependency-mode initial scaffolds with optional Files and no material work", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeScaffold(repository);
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("[PASS] Initialization proof");
  expect(result.stdout).toContain("[PASS] Dependency execution contract (validated)");
  expect(result.stdout).toContain("execution-mode: dependencies");
  expect(result.stdout).not.toContain("execution-order:");
  expect(result.stdout).not.toContain("explicit Files scopes");
});

it("holds optional-Files scaffold recovery when unlisted material history exists", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeScaffold(repository, true);
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("[FAIL] Initialization (");
  expect(result.stdout).toContain("dependency-mode tasks without Files scopes have material history since initialization");
});

it("validates dependency-mode scheduling amendments against the durable fully gated set", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeTransitionEvidence(repository);
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("[PASS] Execution transition (requester-dependency-transition-22; owner authority is asserted, not authenticated)");
});

it("rejects an incomplete dependency-mode fully gated task set", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeTransitionEvidence(repository, []);
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("execution transition fully-gated task set disagrees with durable task and feedback evidence");
});

it("allows prerequisite-only scheduling changes to an implementation-done but uncleared task", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeTransitionEvidence(repository, [], {
    feedbackApproved: false,
    taskOneDependsOnSecond: true,
  });
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("[PASS] Execution transition (requester-dependency-transition-22; owner authority is asserted, not authenticated)");
  expect(result.stdout).not.toContain("changes Task 1 outside its prerequisites");
});

it.each(["Goal", "Acceptance"] as const)("rejects a scheduling-only amendment that changes a done task's %s", async (field) => {
  const repository = makeRepo();
  const taskContract = field === "Goal"
    ? { taskOneGoal: "Change the delivered behavior." }
    : { taskOneAcceptance: "A changed result must be verified." };
  const { changeDir } = makeDependencyModeTransitionEvidence(repository, [], {
    feedbackApproved: false,
    taskOneDependsOnSecond: true,
    ...taskContract,
  });
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("dependency scheduling transition changes Task 1 outside its prerequisites");
});

it("rejects a dependency scheduling amendment that rewrites existing done-task feedback", async () => {
  const repository = makeRepo();
  const { changeDir } = makeDependencyModeTransitionEvidence(repository, [1], {
    mutateTaskEvidenceAtTransition: true,
  });
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.stdout).toContain("dependency scheduling transition changes existing Task 1 evidence");
});

it("validates execution transitions against the preceding committed plan and gated evidence", async () => {
  const repository = makeRepo();
  const { changeDir } = makeExecutionTransitionEvidence(repository);

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("[PASS] Execution transition (requester-message-18; owner authority is asserted, not authenticated)");
});

it("rejects a damaged preceding plan instead of treating it as an initial schedule", async () => {
  const repository = makeRepo();
  makeChangeDir(repository, "demo");
  write(
    repository,
    evidencePath("demo", "plan.md"),
    `---\nartifact: plan\nchange: demo\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\n---\n# Plan: Demo\n`,
  );
  commitPaths(repository, "damaged previous plan", evidencePath("demo", "plan.md"));
  const { changeDir } = makeEvidence(repository);

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("[FAIL] Execution transition (preceding committed plan revision is malformed or unsupported)");
});

it("rejects a forged gated prefix that lacks fresh approved feedback", async () => {
  const repository = makeRepo();
  const { changeDir } = makeExecutionTransitionEvidence(repository, {
    feedbackApproved: false,
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("execution transition gated prefix disagrees with durable task and feedback evidence (");
});

it("rejects stale parent transition claims", async () => {
  const repository = makeRepo();
  const staleParent = git(repository, "rev-parse", "HEAD");
  const stale = makeExecutionTransitionEvidence(repository, {
    previousPlanCommit: staleParent,
  });
  const staleResult = await runPrecondition({ changeDir: stale.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(staleResult.stdout).toContain("execution transition does not reference the actual preceding plan revision");
});

it("rejects forged previous-order transition claims", async () => {
  const forgedRepository = makeRepo();
  const forged = makeExecutionTransitionEvidence(forgedRepository, {
    previousOrder: [2],
    fullyGatedPrefix: [],
  });
  const forgedResult = await runPrecondition({ changeDir: forged.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(forgedResult.stdout).toContain("execution transition previous order disagrees with the preceding plan");
});

it("accepts scoped current confirmation for legacy input provenance without rewriting task evidence", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const taskPath = evidencePath("demo", "tasks/task-1/progress.md");
  const feedbackPath = evidencePath("demo", "tasks/task-1/feedback.md");
  const taskBefore = runCommand(
    "git",
    ["show", `${evidence.material}:${taskPath}`],
    evidence.repository,
  ).stdout;
  const feedbackBefore = runCommand(
    "git",
    ["show", `${git(evidence.repository, "rev-parse", "HEAD~1")}:${feedbackPath}`],
    evidence.repository,
  ).stdout;
  const originalPlan = git(evidence.repository, "show", `${evidence.material}:${evidencePath("demo", "plan.md")}`);
  const currentPlan = Fs.readFileSync(Path.join(evidence.repository, evidencePath("demo", "plan.md")), "utf8");
  const taskBlock = (source: string) => source.match(/## Tasks\n([\s\S]*?)\n## Done when/)?.[1];

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const planContractLine = context.stdout
    .split("\n")
    .find((line) => line.startsWith("plan-contract-data: "));
  const planContractData = JSON.parse(
    planContractLine?.slice("plan-contract-data: ".length) ?? "null",
  ) as {
    readonly tasks: readonly {
      readonly legacyCurrentConfirmation?: {
        readonly historicalInputs: string;
        readonly standing: string;
      };
    }[];
    readonly inputs: readonly {
      readonly path: string;
      readonly recordedBy: readonly unknown[];
      readonly legacyCurrentConfirmationBy?: readonly { readonly standing: string }[];
    }[];
  };
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  expect(planContractData.tasks[0]?.legacyCurrentConfirmation?.historicalInputs).toBe("unknown");
  expect(planContractData.tasks[0]?.legacyCurrentConfirmation?.standing).toBe("legacy-current-confirmed");
  const input = planContractData.inputs.find((entry) => entry.path === "README.md");
  expect(input?.recordedBy).toEqual([]);
  expect(input?.legacyCurrentConfirmationBy?.[0]?.standing).toBe("legacy-current-confirmed");
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Legacy inputs (1 scoped current confirmations; references are asserted, not authenticated)");
  expect(taskBlock(currentPlan)).toBe(taskBlock(originalPlan));
  expect(Fs.readFileSync(Path.join(evidence.repository, taskPath), "utf8")).toBe(taskBefore);
  expect(Fs.readFileSync(Path.join(evidence.repository, feedbackPath), "utf8")).toBe(feedbackBefore);
});

it("binds legacy current confirmation to the exact approved formal input revision", async () => {
  const evidence = makeLegacyCurrentConfirmation({}, { formalApproval: true });
  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-current-confirmed");
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Intent (1 committed references; owner authority is asserted, not authenticated)");
  expect(result.stdout).toContain("[PASS] Legacy inputs (1 scoped current confirmations; references are asserted, not authenticated)");
}, 15000);

it("keeps legacy tasks held when input provenance confirmation is absent", async () => {
  const repository = makeRepo();
  const evidence = makeEvidence(repository, { withoutTaskInputContext: true });
  const context = await new ContextService(
    createContextRuntime({ cwd: () => repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("Task 1 input context: missing");
  expect(result.stdout).toContain("Task 1 input context is missing; legacy inputs need a scoped current confirmation");
  expect(result.lastLine).toContain("gate: closed");
});

it("marks legacy current confirmation stale when a selected input is dirty", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  write(evidence.repository, "README.md", "changed after confirmation\n");

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-confirmation-stale (README.md)");
  expect(result.stdout).toContain("README.md");
  expect(result.lastLine).toContain("gate: closed");
});

it("marks legacy current confirmation stale when a selected input is staged", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const original = Fs.readFileSync(Path.join(evidence.repository, "README.md"), "utf8");
  write(evidence.repository, "README.md", "staged after confirmation\n");
  runCommand("git", ["add", "README.md"], evidence.repository);
  write(evidence.repository, "README.md", original);

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-confirmation-stale (README.md)");
  expect(result.stdout).toContain("README.md");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects legacy current confirmation for a changed frozen task definition", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const planPath = evidencePath("demo", "plan.md");
  const original = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const oldDefinition = "### Task 1: Implement\n\n- Depends on: none";
  const revisedDefinition = `${oldDefinition}\n- Files: src/main.ts`;
  const revisedConfirmation = {
    ...evidence.confirmation,
    taskDefinition: taskDefinitionDigest(revisedDefinition),
  };
  const currentConfirmation = JSON.stringify([evidence.confirmation]);
  const nextConfirmation = JSON.stringify([revisedConfirmation]);
  write(
    evidence.repository,
    planPath,
    original
      .replace(oldDefinition, revisedDefinition)
      .replace(currentConfirmation, nextConfirmation),
  );
  commitPaths(evidence.repository, "rewrite frozen task definition", planPath);

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-confirmation-stale (historical task contract or provenance)");
  expect(result.stdout).toContain("historical task contract or missing provenance cannot be verified");
  expect(result.lastLine).toContain("gate: closed");
});

it.each(["context", "admission"])("holds legacy confirmation with a rewritten completed definition and valid later attempt: %s", async (consumer) => {
  const evidence = makeLegacyLaterAttempt("rewritten");
  if (consumer === "context") {
    const context = await new ContextService(createContextRuntime({ cwd: () => evidence.repository })).execute({ changeDir: evidence.changeDir });
    expect(context.exitCode).toBe(0);
    expect(context.stdout).toContain("legacy-confirmation-stale (historical completed task definition changed)");
    expect(context.stdout).not.toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  } else {
    const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(result.stdout).toContain("[FAIL] Inputs");
    expect(result.stdout).toContain("historical completed task definition changed");
    expect(result.lastLine).toContain("gate: closed");
  }
});

it.each(["context", "admission"])("retains legacy confirmation after an unchanged completed definition and later attempt: %s", async (consumer) => {
  const evidence = makeLegacyLaterAttempt("unchanged");
  if (consumer === "context") {
    const context = await new ContextService(createContextRuntime({ cwd: () => evidence.repository })).execute({ changeDir: evidence.changeDir });
    expect(context.stdout).toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  } else {
    const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
    expect(result.stdout).toContain("[PASS] Legacy inputs");
  }
});

it.each(["context", "admission"])("holds a retained frozen rewrite even after the current definition is restored: %s", async (consumer) => {
  const evidence = makeLegacyLaterAttempt("restored");
  const result = consumer === "context"
    ? await new ContextService(createContextRuntime({ cwd: () => evidence.repository })).execute({ changeDir: evidence.changeDir })
    : await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("historical completed task definition changed");
  expect(result.stdout).not.toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  expect(result.stdout).not.toContain("[PASS] Legacy inputs");
});

it.each(["context", "admission"])("does not turn known historical input provenance into unknown via a later attempt: %s", async (consumer) => {
  const evidence = makeLegacyLaterAttempt("lost-provenance");
  const result = consumer === "context"
    ? await new ContextService(createContextRuntime({ cwd: () => evidence.repository })).execute({ changeDir: evidence.changeDir })
    : await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("historical input provenance is present; legacy current confirmation is not applicable");
  expect(result.stdout).not.toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  expect(result.stdout).not.toContain("[PASS] Legacy inputs");
});

it.each(["context", "admission"])("does not turn a prior blocked versioned input context into unknown via a later valid attempt: %s", async (consumer) => {
  const evidence = makeLegacyLaterAttempt("lost-blocked-provenance");
  const result = consumer === "context"
    ? await new ContextService(createContextRuntime({ cwd: () => evidence.repository })).execute({ changeDir: evidence.changeDir })
    : await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.stdout).toContain("historical input provenance is present; legacy current confirmation is not applicable");
  expect(result.stdout).not.toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  expect(result.stdout).not.toContain("[PASS] Legacy inputs");
});

it("holds a legacy confirmation when an older task-progress identity is malformed despite a valid latest record", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const taskPath = evidencePath("demo", "tasks/task-1/progress.md");
  const taskProgress = Fs.readFileSync(Path.join(evidence.repository, taskPath), "utf8");
  write(evidence.repository, taskPath, taskProgress.replace("task: 1\n", "task: 9\n"));
  commitPaths(evidence.repository, "add malformed historical task identity", taskPath);
  write(evidence.repository, taskPath, taskProgress);
  const implementation = commitPaths(evidence.repository, "restore valid latest task identity", taskPath);
  write(
    evidence.repository,
    evidencePath("demo", "tasks/task-1/feedback.md"),
    reviewDocument("feedback", evidence.base, implementation, "compatibility"),
  );
  commitPaths(evidence.repository, "refresh task feedback range", evidencePath("demo", "tasks/task-1/feedback.md"));
  write(
    evidence.repository,
    evidencePath("demo", "review.md"),
    reviewDocument("review", evidence.base, implementation, "compatibility"),
  );
  commitPaths(evidence.repository, "refresh whole-change review range", evidencePath("demo", "review.md"));

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-confirmation-stale (historical task/Base/range identity is unverified: task progress history has a malformed identity)");
  expect(context.stdout).not.toContain("Task 1 scoped legacy current-confirmation standing: legacy-current-confirmed");
  expect(result.stdout).toContain("Task 1 historical checkpoint is unverified: task progress history has a malformed identity");
  expect(result.stdout).toContain("[FAIL] Inputs");
  expect(result.stdout).not.toContain("[PASS] Legacy inputs");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects legacy current confirmation from another repository", async () => {
  const evidence = makeLegacyCurrentConfirmation({ repository: "/different/repository" });

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-confirmation-stale (repository)");
  expect(result.stdout).toContain("belongs to a different repository");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects malformed legacy confirmation versions", async () => {
  const malformed = makeLegacyCurrentConfirmation({ version: 2 });
  const malformedResult = await runPrecondition({ changeDir: malformed.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(malformedResult.stdout).toContain("plan.md malformed");
  expect(malformedResult.lastLine).toContain("gate: closed");
});

it("does not treat malformed explicit task Notes as missing legacy provenance", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const malformedNotes = JSON.stringify({
    version: 2,
    repository: evidence.confirmation.repository,
    intentCommit: evidence.confirmation.intentCommit,
    taskDefinition: evidence.confirmation.taskDefinition,
    inputs: evidence.confirmation.inputs,
  });
  write(
    evidence.repository,
    planPath,
    plan.replace("- Depends on: none", `- Depends on: none\n- Notes: ${malformedNotes}`),
  );
  commitPaths(evidence.repository, "add malformed explicit task Notes", planPath);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("plan.md malformed");
  expect(result.stdout).toContain("Task 1 task input context version is invalid");
  expect(result.lastLine).toContain("gate: closed");
});

it("does not apply legacy confirmation when versioned task input context already exists", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const inputContext = JSON.stringify({
    version: 1,
    repository: evidence.confirmation.repository,
    intentCommit: evidence.confirmation.intentCommit,
    taskDefinition: evidence.confirmation.taskDefinition,
    inputs: evidence.confirmation.inputs,
  });
  write(
    evidence.repository,
    planPath,
    plan.replace("- Depends on: none", `- Depends on: none\n- Notes: ${inputContext}`),
  );
  commitPaths(evidence.repository, "add explicit task input context", planPath);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.stdout).toContain("Legacy input confirmation for Task 1 requires an existing active task with missing input provenance");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects default references in legacy current confirmations", async () => {
  const defaultReference = makeLegacyCurrentConfirmation({ ownerReference: "approved" });
  const referenceContext = await new ContextService(
    createContextRuntime({ cwd: () => defaultReference.repository }),
  ).execute({ changeDir: defaultReference.changeDir });
  const referenceResult = await runPrecondition({ changeDir: defaultReference.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(referenceContext.stdout).toContain("legacy-confirmation-stale (owner or independent-review reference is not attributable)");
  expect(referenceResult.stdout).toContain("owner or independent-review reference is not attributable");
  expect(referenceResult.lastLine).toContain("gate: closed");
}, 15000);

it("keeps unrelated completion gates active for legacy current confirmations", async () => {
  const evidence = makeLegacyCurrentConfirmation();
  const reviewPath = evidencePath("demo", "review.md");
  Fs.unlinkSync(Path.join(evidence.repository, reviewPath));
  commitPaths(evidence.repository, "remove whole-change review", reviewPath);

  const context = await new ContextService(
    createContextRuntime({ cwd: () => evidence.repository }),
  ).execute({ changeDir: evidence.changeDir });
  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(context.stdout).toContain("legacy-current-confirmed");
  expect(result.stdout).toContain("[PASS] Legacy inputs");
  expect(result.stdout).toContain("[FAIL] Reviews");
  expect(result.lastLine).toContain("gate: closed");
}, 15000);

it("accepts explicit committed references for approved formal input", async () => {
  const repository = makeRepo();
  write(
    repository,
    evidencePath("demo", "proposal.md"),
    `---\nartifact: proposal\nchange: demo\nstatus: approved\ndecision: accepted\nauthor: test\ncreated: 2026-09-12\nroute_unit: null\n---\n# Proposal: Demo\n\n## Why\nNeed a formal decision.\n\n## Goals & Success Criteria\nSuccess is visible.\n\n## Non-Goals\nNone.\n\n## Proposed Change\nChange it.\n\n## Capabilities\nNone.\n\n## Impact\nNo other paths.\n`,
  );
  const approvalCommit = commitPaths(repository, "approve proposal", evidencePath("demo", "proposal.md"));
  const proposalPath = evidencePath("demo", "proposal.md");
  const proposalBlob = git(repository, "rev-parse", `HEAD:${proposalPath}`);
  const { changeDir } = makeEvidence(repository, {
    intentCommit: approvalCommit,
    intentApprovals: [
      { path: "proposal.md", reference: "requester-message-18", commit: approvalCommit },
    ],
    inputs: [{ path: proposalPath, blob: proposalBlob }],
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Intent (1 committed references; owner authority is asserted, not authenticated)");
  expect(result.stdout).toContain("[PASS] Inputs (1 current task contexts)");
});

it("does not infer requester approval from a draft with the accepted default", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  write(
    repository,
    evidencePath("demo", "proposal.md"),
    `---\nartifact: proposal\nchange: demo\nstatus: draft\ndecision: accepted\nauthor: test\ncreated: 2026-09-12\nroute_unit: null\n---\n# Proposal: Demo\n\n## Why\nNeed a formal decision.\n\n## Goals & Success Criteria\nSuccess is visible.\n\n## Non-Goals\nNone.\n\n## Proposed Change\nChange it.\n\n## Capabilities\nNone.\n\n## Impact\nNo other paths.\n`,
  );
  commitPaths(repository, "add draft proposal", evidencePath("demo", "proposal.md"));

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[FAIL] Intent (proposal.md is not explicitly approved");
  expect(result.stdout).toContain("proposal.md has no committed intent approval reference");
});

it("holds unresolved critique dispositions at their owner", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  write(
    repository,
    evidencePath("demo", "critique.md"),
    `---\nartifact: critique\nchange: demo\ncreated: 2026-09-12\nverdict: changes-requested\ndecision: skipped\nscope: design.md\n---\n# Critique: Demo\n\n## Scope\nDesign reviewed.\n\n## Findings\n1. **[Significant]** Clarify the input contract\n   - Where: design.md\n   - Problem: The contract is unclear.\n   - Fix: Define it.\n\n## Quality Lens\n\n| Principle | Verdict | Notes |\n| --- | --- | --- |\n| Clarity | ⚠️ | See finding. |\n\n## Summary\n\n| Severity | Count | Items |\n| --- | --- | --- |\n| Significant | 1 | 1 |\n`,
  );
  commitPaths(repository, "add unresolved critique", evidencePath("demo", "critique.md"));

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[FAIL] Critique (critique disposition is owner-decision-required");
});

it("opens the gate with a committed synchronized all-done ledger", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const service = new PreconditionService(
    createPreconditionRuntime({ cwd: () => repository }),
  );

  const result = await service.execute({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Tasks (1 implemented)");
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.stdout).toContain("[PASS] Final clean tree");
  expect(result.stdout).toContain(
    `verified-head: ${git(repository, "rev-parse", "HEAD")}`,
  );
  expect(result.lastLine).toBe("gate: open");
});

it("does not share historical reads across two executions of the same service", async () => {
  const repository = makeRepo();
  const { changeDir, material } = makeEvidence(repository);
  const base = createPreconditionRuntime({ cwd: () => repository });
  const queries: string[][] = [[], []];
  let execution = 0;
  const runtime = createPreconditionRuntime({
    cwd: () => repository,
    process: {
      run: (command, args, cwd) => {
        if (command === "git" && args[0] === "show") queries[execution].push(args[1]);
        return base.process.run(command, args, cwd);
      },
    },
  });
  const service = new PreconditionService(runtime);
  const first = await service.execute({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  execution = 1;
  const second = await service.execute({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  const historicalPlan = `${material}:${evidencePath("demo", "plan.md")}`;

  expect(first.exitCode, first.stdout).toBe(0);
  expect(second.exitCode, second.stdout).toBe(0);
  expect(queries[0]).toContain(historicalPlan);
  expect(queries[1]).toContain(historicalPlan);
  expect(first.stdout).toBe(second.stdout);
});

it("closes admission when verification commits a clean new HEAD", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const command =
    'git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m "verification commit"';

  const result = await runPrecondition({ changeDir, testCommand: command, targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[PASS] Tests");
  expect(result.stdout).toContain("[FAIL] Verified HEAD changed during admission");
  expect(result.stdout).not.toContain("verified-head:");
  expect(result.lastLine).toContain("gate: closed");
});

it("closes admission when verification changes branches at the same HEAD", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);

  const result = await runPrecondition({
    changeDir,
    testCommand: "git checkout -q -b verification-branch",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[FAIL] Verified branch changed during admission");
  expect(result.stdout).not.toContain("Verified HEAD changed during admission");
  expect(result.lastLine).toContain("gate: closed");
});

it("closes admission when the verified worktree identity changes", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const base = createPreconditionRuntime({ cwd: () => repository });
  let identityRead = 0;
  const result = await runPrecondition(
    { changeDir, testCommand: "true", targetBranch: fixtureTargetBranch},
    createPreconditionRuntime({
      cwd: () => repository,
      git: {
        ...base.git,
        worktreeIdentity: () => ({
          status: 0,
          stdout: `${identityRead++ === 0 ? Path.join(repository, ".git") : Path.join(repository, ".git", "other-worktree")}\n`,
          stderr: "",
        }),
      },
    }),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "[FAIL] Verified worktree or target changed during admission",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("returns an error when verification HEAD cannot be resolved", async () => {
  const repository = makeRepo();
  const changeDir = makeChangeDir(repository, "add-auth");
  const result = await runPrecondition(
    { changeDir, testCommand: "true", targetBranch: fixtureTargetBranch},
    createPreconditionRuntime({
      cwd: () => repository,
      git: {
        repositoryRoot: () => ({ status: 0, stdout: `${repository}\n`, stderr: "" }),
        statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
        currentHead: () => ({ status: 1, stdout: "", stderr: "missing" }),
      },
    }),
  );

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("Unable to resolve verification HEAD");
  expect(result.lastLine).not.toBe("gate: open");
});

it("rejects ignored task progress even when its contents and worktree are clean", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const relativeTaskPath = evidencePath("demo", "tasks/task-1/progress.md");
  git(repository, "rm", "--cached", "--", relativeTaskPath);
  write(repository, ".gitignore", `${relativeTaskPath}\n`);
  commitAll(repository, "ignore task progress fixture");

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Task 1 progress is not tracked and committed exactly at HEAD",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a missing task implementation revision lookup", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const base = createPreconditionRuntime({ cwd: () => repository });
  const result = await runPrecondition(
    { changeDir, testCommand: "true", targetBranch: fixtureTargetBranch},
    createPreconditionRuntime({
      cwd: () => repository,
      git: {
        ...base.git,
        latestCommit: (cwd, sourcePath) =>
          sourcePath.endsWith("tasks/task-1/progress.md")
            ? { status: 1, stdout: "", stderr: "missing" }
            : base.process.run(
                "git",
                ["log", "-1", "--format=%H", "HEAD", "--", sourcePath],
                cwd,
              ),
      },
    }),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Task 1 implementation commit is missing or unverifiable",
  );
  expect(result.stdout).toContain(
    "Task 1 feedback is malformed",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("does not require the root implementation summary to be complete", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, { rootStatus: "in-progress" });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Tasks (1 implemented)");
  expect(result.lastLine).toBe("gate: open");
});

it("admits an appended valid correction without reinterpreting historical duplicate Outcomes", async () => {
  const repository = makeRepo();
  const { changeDir, material } = makeEvidence(repository, {
    taskOutcomeField: "- Outcome: blocked\n- Outcome: done",
  });
  const path = Path.join(changeDir, "tasks/task-1/progress.md");
  const old = Fs.readFileSync(path, "utf8");
  Fs.writeFileSync(path, old + "\n## Attempt 2 — 2026-09-13\n\n- Outcome: done\n");
  const correction = commitAll(repository, "append valid task correction");
  for (const file of ["tasks/task-1/feedback.md", "review.md"]) {
    const target = Path.join(changeDir, file);
    Fs.writeFileSync(target, Fs.readFileSync(target, "utf8").replace(`head: ${material}`, `head: ${correction}`));
    commitPaths(repository, `record current ${file}`, evidencePath("demo", file));
  }

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.lastLine).toBe("gate: open");
  expect(Fs.readFileSync(path, "utf8")).toBe(old + "\n## Attempt 2 — 2026-09-13\n\n- Outcome: done\n");
});

it("opens the gate for a committed historical unbulleted task outcome", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    taskOutcomeField: "Outcome: done",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Tasks (1 implemented)");
  expect(result.lastLine).toBe("gate: open");
});

it.each([
  "",
  "- Outcome: blocked",
  "- Outcome:",
  "Outcome: done extra",
  "Outcome:done",
  "- Outcome: blocked\n- Outcome: done",
  "- Outcome: done\n- Outcome: blocked",
  "- Outcome: done\n- Outcome: done",
  "- Outcome: done\nOutcome: blocked",
  "- Outcome: done\nOutcome:done",
])(
  "closes the gate for a committed invalid task outcome field %s",
  async (taskOutcomeField) => {
    const repository = makeRepo();
    const { changeDir } = makeEvidence(repository, { taskOutcomeField });

    const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("[FAIL] Tasks");
    expect(result.lastLine).toContain("gate: closed");
  },
);

it("opens the gate for a committed synchronized renamed task title", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    taskTitle: "Rename | delimiter",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Clean tree");
  expect(result.stdout).toContain("[PASS] Tasks (1 implemented)");
  expect(result.lastLine).toBe("gate: open");
});

it("rejects a committed stale metadata title with the ledger diagnostic", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    taskTitle: "Rename | delimiter",
    metadataTitle: "Stale title",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[PASS] Clean tree");
  expect(result.stdout).not.toContain("[FAIL] Clean tree");
  expect(result.stdout).toContain("progress metadata ledger does not match");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a committed metadata status mismatch despite a synchronized task row", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, { metadataStatus: "pending" });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("progress metadata ledger does not match");
  expect(result.lastLine).toContain("gate: closed");
});

it("opens the gate for an all-abandoned plan with an empty progress ledger", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEmptyProgressEvidence(repository, true);

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Tasks (0 implemented)");
  expect(result.lastLine).toBe("gate: open");
});

it("rejects an empty progress ledger when the plan has an active task", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEmptyProgressEvidence(repository, false);

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("plan and progress ledgers do not match");
  expect(result.lastLine).toContain("gate: closed");
});

it("opens the gate with requested-change then approved per-pass evidence", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "multi-pass",
    reviewMode: "multi-pass",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it("opens with independently checked bounded remediation clearance", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const reviewPath = Path.join(evidence.changeDir, "review.md");
  const artifact = await createArtifactReader()(reviewPath);
  expect(artifact._tag).toBe("recognized");
  if (artifact._tag === "recognized")
    expect(parseReviewPasses(artifact).diagnostics).toEqual([]);

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it.each([
  { name: "an unresolved Head", kind: "unresolved", diagnostic: "cannot be resolved" },
  { name: "an off-branch Head", kind: "off-branch", diagnostic: "is outside the cumulative correction range" },
  { name: "a Head before the retained full Head", kind: "before-delta", diagnostic: "is outside the cumulative correction range" },
  { name: "a Head after the latest reviewed Head", kind: "after-latest", diagnostic: "is outside the cumulative correction range" },
])("rejects a historical scoped attempt with $name despite a valid latest pass and waiver", async ({ kind, diagnostic }) => {
  const evidence = makeBoundedRemediationEvidence();
  appendScopedFindingAndClearance(evidence, true);
  const invalidHead = kind === "unresolved"
    ? "f".repeat(40)
    : kind === "before-delta"
      ? git(evidence.repository, "rev-parse", fixtureTargetBranch)
      : kind === "off-branch"
        ? git(evidence.repository, "commit-tree", `${evidence.fullHead}^{tree}`, "-p", evidence.fullHead, "-m", "unrelated scoped review branch")
        : (() => {
            git(evidence.repository, "commit", "--allow-empty", "-m", "branch after the latest reviewed Head");
            return git(evidence.repository, "rev-parse", "HEAD");
          })();
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 3 —[^]*?Head: )[0-9a-f]{40}/, `$1${invalidHead}`),
  );

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
    wholeChangeWaived: true,
  });

  expect(result.exitCode, result.stdout).toBe(1);
  expect(result.stdout).toContain(`scoped review Pass 3 Head ${diagnostic}`);
  expect(result.lastLine).toContain("gate: closed");
});

it.each([false, true])("refuses artifact-only erasure of a committed scoped blocker even when current resolution coverage matches (restored=%s)", async (restored) => {
  const evidence = makeBoundedRemediationEvidence();
  appendScopedFindingAndClearance(evidence, true);
  const reviewPath = evidencePath("demo", "review.md");
  const original = Fs.readFileSync(Path.join(evidence.repository, reviewPath), "utf8");
  const originalCommit = git(evidence.repository, "rev-parse", "HEAD");
  const baselineFinding = /## Pass 1 —[^]*?### Blocking\n(- [^\n]+)/.exec(original)?.[1];
  expect(baselineFinding).toBeDefined();
  expect(git(evidence.repository, "show", `${originalCommit}:${reviewPath}`)).toContain("id: pass-3-blocking-1");
  rewriteBoundedReview(evidence, (source) => source
    .replace(/(## Pass 3 —[^]*?### Blocking\n)- [^\n]+/, `$1${baselineFinding}`)
    .replace(/^Resolutions: (\[.*\])$/gm, (_line, value: string) => `Resolutions: ${JSON.stringify(
      (JSON.parse(value) as Array<{ finding: string }>).filter((entry) => entry.finding !== "pass-3-blocking-1"),
    )}`),
  );
  if (restored) rewriteBoundedReview(evidence, () => original);

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
    wholeChangeWaived: true,
  });

  expect(result.exitCode, result.stdout).toBe(1);
  expect(result.stdout).toContain("retained scoped review Pass 3 text differs from committed history");
  expect(result.lastLine).toContain("gate: closed");
  expect(git(evidence.repository, "show", `${originalCommit}:${reviewPath}`)).toContain("id: pass-3-blocking-1");
  if (restored) expect(Fs.readFileSync(Path.join(evidence.repository, reviewPath), "utf8")).toBe(original);
});

it("rejects a full-review baseline with a title different from the current plan", async () => {
  const evidence = makeBoundedRemediationEvidence({ baselineTitle: "Other change" });

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("full-review baseline title does not match the current plan title");
  expect(result.lastLine).toContain("gate: closed");
});

it("retains an authorized A18 execution-only amendment with exact numbered remediation", async () => {
  const evidence = makeBoundedRemediationEvidence({ executionAmendment: true });

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Execution transition");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it("rejects a forged previous plan boundary in an A18 remediation amendment", async () => {
  const evidence = makeBoundedRemediationEvidence({ executionAmendment: true });
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const changedPlan = plan.replace(
    /^  previousPlanCommit: .*$/m,
    `  previousPlanCommit: ${"f".repeat(40)}`,
  );
  write(evidence.repository, planPath, changedPlan);
  const changedHead = commitPaths(evidence.repository, "forge execution amendment boundary", planPath);
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 2 —[^]*?Head: )[0-9a-f]{40}/, `$1${changedHead}`),
  );

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("execution-only remediation amendment lacks a validated A18 transition");
  expect(result.lastLine).toContain("gate: closed");
});

it("ignores fenced fake Pass and Tasks headings while retaining raw baseline bytes", async () => {
  const evidence = makeBoundedRemediationEvidence({ fakeHeadings: true });
  const reviewPath = Path.join(evidence.changeDir, "review.md");
  const reviewArtifact = await createArtifactReader()(reviewPath);
  expect(reviewArtifact._tag).toBe("recognized");
  if (reviewArtifact._tag === "recognized") {
    const parsed = parseReviewPasses(reviewArtifact);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.passes.map((pass) => pass.number)).toEqual([1, 2]);
  }
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.lastLine).toBe("gate: open");
});

it("rejects raw baseline text changes when fenced fake headings are present", async () => {
  const evidence = makeBoundedRemediationEvidence({ fakeHeadings: true });
  rewriteBoundedReview(evidence, (source) =>
    source.replace("This text must remain ordinary review content.", "Changed raw pass bytes."),
  );
  const changed = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(changed.exitCode).toBe(1);
  expect(changed.stdout).toContain("retained full-review baseline text differs from its immutable artifact commit");
  expect(changed.lastLine).toContain("gate: closed");
});

it("preserves CRLF physical pass boundaries and ignores trailing fenced headings", async () => {
  const evidence = makeBoundedRemediationEvidence({ crlfReview: true, fakeHeadings: true });
  const reviewSource = Fs.readFileSync(Path.join(evidence.changeDir, "review.md"), "utf8");
  expect(reviewSource).toContain("\r\n## Pass 1 —");
  const artifact = await createArtifactReader()(Path.join(evidence.changeDir, "review.md"));
  expect(artifact._tag).toBe("recognized");
  if (artifact._tag === "recognized") {
    const parsed = parseReviewPasses(artifact);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.latest?.number).toBe(2);
  }
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.lastLine).toBe("gate: open");
});

it("classifies an exact evidence-array path that contains spaces", async () => {
  const evidence = makeBoundedRemediationEvidence({ fileWithSpaces: true });
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.lastLine).toBe("gate: open");
});

it("rejects an unclassified correction path that contains spaces", async () => {
  const evidence = makeBoundedRemediationEvidence({
    fileWithSpaces: true,
    includeSpacePathEvidence: false,
  });
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation correction path is unclassified: src/file name.ts");
  expect(result.lastLine).toContain("gate: closed");
});

it("clears an evidence-gap-only baseline with new located evidence on the same material range", async () => {
  const evidence = makeEvidenceGapClearance();
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it("rejects repeated evidence-gap clearance with no new located evidence", async () => {
  const evidence = makeEvidenceGapClearance({ sameEvidence: true });
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("same-range evidence-gap resolution does not add located evidence");
  expect(result.lastLine).toContain("gate: closed");
});

it.each([
  {
    kind: "code-defect" as const,
    materialChange: false,
    expected: "bounded code or intent findings require numbered remediation tasks or upstream revision",
  },
  {
    kind: "intent-defect" as const,
    materialChange: false,
    expected: "intent defects require upstream revision and fresh full review",
  },
  {
    kind: "evidence-gap" as const,
    materialChange: true,
    expected: "evidence-gap-only clearance cannot include a material correction delta",
  },
])("keeps $kind clearance held without its required correction", async ({ kind, materialChange, expected }) => {
  const evidence = makeEvidenceGapClearance({ kind, materialChange });
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(expected);
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects invented numbered code-remediation tasks for an evidence-gap-only baseline", async () => {
  const evidence = makeBoundedRemediationEvidence();
  rewriteBoundedReview(evidence, (source) => source.replaceAll("kind: code-defect", "kind: evidence-gap"));
  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("evidence-gap-only clearance cannot invent numbered remediation tasks");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects changes to frozen task evidence after the full-review baseline", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const feedbackPath = evidencePath("demo", "tasks/task-1/feedback.md");
  const feedback = Fs.readFileSync(Path.join(evidence.repository, feedbackPath), "utf8");
  write(
    evidence.repository,
    feedbackPath,
    feedback.replaceAll("### Suggestions\n- None.", "### Suggestions\n- Post-baseline observation."),
  );
  commitPaths(evidence.repository, "change frozen task feedback", feedbackPath);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(`frozen task evidence changed after full review: ${feedbackPath}`);
  expect(result.lastLine).toContain("gate: closed");
});

it("requires bounded clearance to resolve blockers introduced by scoped review", async () => {
  const evidence = makeBoundedRemediationEvidence();
  appendScopedFindingAndClearance(evidence, false);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "remediation resolutions must exactly cover every baseline and scoped blocker identity",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("clears the cumulative full-baseline and scoped blocker set", async () => {
  const evidence = makeBoundedRemediationEvidence();
  appendScopedFindingAndClearance(evidence, true);

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.lastLine).toBe("gate: open");
});

it.each([
  {
    name: "an incomplete resolution map",
    mutate: (source: string) => source.replace(/^Resolutions: .*$/m, "Resolutions: []"),
    finding: "remediation resolutions must exactly cover every baseline and scoped blocker identity",
  },
  {
    name: "an invented finding identity",
    mutate: (source: string) => source.replace(
      /^Resolutions: (.*)$/m,
      (_line, value: string) => `Resolutions: ${JSON.stringify(JSON.parse(value).map((item: { finding: string }) => ({ ...item, finding: "pass-99-blocking-1" })))}`,
    ),
    finding: "remediation resolutions must exactly cover every baseline and scoped blocker identity",
  },
  {
    name: "a forged parent commit",
    mutate: (source: string) => source.replace(/^Parent commit: .*$/m, `Parent commit: ${"f".repeat(40)}`),
    finding: "remediation Parent commit is unresolved or off-branch",
  },
  {
    name: "a mismatched correction Delta base",
    mutate: (source: string) => source.replace(/^Delta base: .*$/m, `Delta base: ${"f".repeat(40)}`),
    finding: "remediation Base or Delta base does not match the full baseline",
  },
  {
    name: "modified retained full-review text",
    mutate: (source: string) => source.replace("Fix the implementation regression", "Change the retained finding"),
    finding: "retained full-review baseline text differs from its immutable artifact commit",
  },
  {
    name: "a different target reference",
    mutate: (source: string) => source.replace(/(## Pass 2 —[^]*?Target: )[^\n]+/, "$1refs/heads/other-target"),
    finding: "whole-branch review Target does not match selected target",
  },
])("rejects bounded clearance with $name", async ({ mutate, finding }) => {
  const evidence = makeBoundedRemediationEvidence();
  rewriteBoundedReview(evidence, mutate);

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(finding);
  expect(result.lastLine).toContain("gate: closed");
});

it("does not let the material waiver clear an unreviewed bounded correction", async () => {
  const evidence = makeBoundedRemediationEvidence();
  write(evidence.repository, "src/unreviewed.ts", "export const unreviewed = true;\n");
  commitAll(evidence.repository, "add material after bounded review Head");

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
    wholeChangeWaived: true,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation review Head does not contain its latest material change");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a parent commit that also changed material files", async () => {
  const evidence = makeBoundedRemediationEvidence();
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/^Parent commit: .*$/m, `Parent commit: ${evidence.implementation}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation Parent commit is not an artifact-only review commit");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects changes to formal intent after the full-review baseline", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const requirementPath = evidencePath("demo", "requirements/contract.md");
  write(evidence.repository, requirementPath, "# Changed approved requirement\n");
  const changedHead = commitAll(evidence.repository, "change approved requirements");
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 2 —[^]*?Head: )[0-9a-f]{40}/, `$1${changedHead}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("approved formal intent changed since the full-review baseline");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects changes to a baseline task definition during remediation", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  const originalDefinition = "### Task 1: Implement\n\n- Depends on: none";
  const changedDefinition = `${originalDefinition}\n- Files: src/original.ts`;
  const notes = /^- Notes: (.+)$/m.exec(plan);
  expect(notes).not.toBeNull();
  const taskContext = JSON.parse(notes![1]!);
  taskContext.taskDefinition = taskDefinitionDigest(changedDefinition);
  write(
    evidence.repository,
    planPath,
    plan
      .replace(originalDefinition, changedDefinition)
      .replace(notes![0], `- Notes: ${JSON.stringify(taskContext)}`),
  );
  const changedHead = commitPaths(evidence.repository, "change a baseline task definition", planPath);
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 2 —[^]*?Head: )[0-9a-f]{40}/, `$1${changedHead}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation changed or removed a baseline task definition");
  expect(result.lastLine).toContain("gate: closed");
});

it("does not let applied metadata replace independent remediation provenance", async () => {
  const evidence = makeBoundedRemediationEvidence();
  rewriteBoundedReview(evidence, (source) => source.replace("decision: accepted", "decision: applied"));

  const result = await runPrecondition({
    changeDir: evidence.changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("whole-branch review malformed");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a legacy full pass as the immutable remediation baseline", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const legacyParent = git(
    evidence.repository,
    "log",
    "-3",
    "--format=%H",
    "--",
    evidencePath("demo", "review.md"),
  ).split("\n")[2];
  expect(legacyParent).toBeDefined();
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/^Parent commit: .*$/m, `Parent commit: ${legacyParent}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("retained full-review baseline text differs from its immutable artifact commit");
  expect(result.lastLine).toContain("gate: closed");
});

it("requires explicit correction-path classification", async () => {
  const evidence = makeBoundedRemediationEvidence();
  write(evidence.repository, "src/unrelated.ts", "export const unrelated = true;\n");
  const newHead = commitAll(evidence.repository, "add an unclassified material path");
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 2 —[^]*?Head: )[0-9a-f]{40}/, `$1${newHead}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation correction path is unclassified: src/unrelated.ts");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects plan changes outside the exact appended-remediation-task amendment", async () => {
  const evidence = makeBoundedRemediationEvidence();
  const planPath = evidencePath("demo", "plan.md");
  const plan = Fs.readFileSync(Path.join(evidence.repository, planPath), "utf8");
  write(evidence.repository, planPath, plan.replace("A plan.", "A changed plan intent."));
  const changedHead = commitPaths(evidence.repository, "change approved plan intent", planPath);
  rewriteBoundedReview(evidence, (source) =>
    source.replace(/(## Pass 2 —[^]*?Head: )[0-9a-f]{40}/, `$1${changedHead}`),
  );

  const result = await runPrecondition({ changeDir: evidence.changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("remediation plan changes are not a pure appended-task amendment");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a later-ancestor task feedback Base that crops the historical task range", async () => {
  const repository = makeRepo();
  const { changeDir, material } = makeEvidence(repository);
  write(repository, "later-material.txt", "later material\n");
  const shortened = commitAll(repository, "later task Base candidate");
  const feedbackPath = Path.join(changeDir, "tasks/task-1/feedback.md");
  const feedback = Fs.readFileSync(feedbackPath, "utf8")
    .replace(/base: [0-9a-f]{40}/, `base: ${shortened}`)
    .replace(/head: [0-9a-f]{40}/, `head: ${shortened}`);
  write(repository, evidencePath("demo", "tasks/task-1/feedback.md"), feedback);
  commitPaths(repository, "shorten task feedback Base", evidencePath("demo", "tasks/task-1/feedback.md"));

  const result = await runPrecondition({
    changeDir,
    testCommand: "true",
    wholeChangeWaived: true,
    targetBranch: fixtureTargetBranch,
  });

  expect(material).not.toBe(shortened);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Task 1 feedback Base does not match its historical checkpoint",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("opens the gate with a legacy-global history whose latest pass is approved", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "legacy-multi-pass",
    reviewMode: "legacy-multi-pass",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it("opens the gate with a migrated fieldless prefix and explicit latest pass", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "migrated",
    reviewMode: "migrated",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode, result.stdout).toBe(0);
  expect(result.stdout).toContain("[PASS] Reviews");
  expect(result.stdout).toContain("[PASS] Whole-branch review freshness");
  expect(result.lastLine).toBe("gate: open");
});

it("rejects a malformed physical-last task feedback pass", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "malformed-latest",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Task 1 feedback malformed");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a malformed physical-last whole-branch review pass", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    reviewMode: "malformed-latest",
  });
  const service = new PreconditionService(
    createPreconditionRuntime({ cwd: () => repository }),
  );

  const result = await service.execute({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("whole-branch review malformed");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a stale latest task feedback approval", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "stale-latest",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Task 1 feedback is stale");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a stale latest whole-branch review approval", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    reviewMode: "stale-latest",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("review head does not contain material");
  expect(result.lastLine).toContain("gate: closed");
});

it.each([false, true])("rejects an ancestor Base that is not the selected target merge base with material waiver %s", async (wholeChangeWaived) => {
  const repository = makeRepo();
  const { changeDir, material } = makeEvidence(repository);
  const reviewPath = evidencePath("demo", "review.md");
  const review = Fs.readFileSync(Path.join(repository, reviewPath), "utf8").replace(
    /base: [0-9a-f]{40}/,
    `base: ${material}`,
  );
  write(repository, reviewPath, review);
  commitPaths(repository, "write an arbitrary ancestor as review Base", reviewPath);

  const result = await runPrecondition({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
    wholeChangeWaived,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("whole-branch review Base is not the actual target merge base");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects target expressions that are not full branch references", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const service = new PreconditionService(
    createPreconditionRuntime({ cwd: () => repository }),
  );

  const result = await service.execute({
    changeDir,
    testCommand: "true",
    targetBranch: "refs/remotes/origin/main~1",
  });

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain(
    "--target-branch is required as an explicit full branch reference",
  );
});

it("rejects a persisted full-review target that differs from the selected target", async () => {
  const repository = makeRepo();
  const { changeDir, base, material } = makeEvidence(repository, { reviewMode: "multi-pass" });
  const reviewPath = evidencePath("demo", "review.md");
  const review = Fs.readFileSync(Path.join(repository, reviewPath), "utf8").replace(
    /(## Pass 2 —[^]*?Verdict: approved\n)/,
    `$1Scope: full\nTarget: refs/heads/other-target\n`,
  );
  write(repository, reviewPath, review);
  commitPaths(repository, "bind the review to a different target", reviewPath);

  const result = await runPrecondition({
    changeDir,
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(base).not.toBe(material);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("whole-branch review Target does not match selected target");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects contradictory one-pass compatibility provenance", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, {
    feedbackMode: "ambiguous-compatibility",
  });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Task 1 feedback malformed");
  expect(result.lastLine).toContain("gate: closed");
});

it("fails closed when split ledgers or task evidence contradict", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  write(repository, evidencePath("demo", "progress.md"), "broken\n");
  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("[FAIL] Clean tree");
  expect(result.lastLine).toContain("gate: closed");
});

it.each(["pending", "blocked"])(
  "rejects a task progress status that contradicts its done attempt (%s)",
  async (status) => {
    const repository = makeRepo();
    const { changeDir } = makeEvidence(repository, {
      taskProgressStatus: status,
    });

    const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`Task 1 progress status: ${status}`);
    expect(result.lastLine).toContain("gate: closed");
  },
);

it("rejects contradictory approved blocking findings", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, { blockingFeedback: true });

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Task 1 feedback malformed");
  expect(result.lastLine).toContain("gate: closed");
});

it("waives only whole-change material freshness", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  write(repository, "material.txt", "new material\n");
  commitAll(repository, "material after review");

  const closed = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});
  const waived = await runPrecondition({
    changeDir,
    testCommand: "true",
    wholeChangeWaived: true,
    targetBranch: fixtureTargetBranch,
  });

  expect(closed.exitCode).toBe(1);
  expect(closed.stdout).toContain("review head does not contain material");
  expect(waived.exitCode, waived.stdout).toBe(0);
  expect(waived.stdout).toContain("[WAIVED] Whole-branch review freshness");
  expect(waived.lastLine).toBe("gate: open");
});

it("rejects a stale task feedback range", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const feedback = Fs.readFileSync(
    Path.join(changeDir, "tasks", "task-1", "feedback.md"),
    "utf8",
  ).replace(
    /head: [0-9a-f]{40}/,
    `head: ${git(repository, "rev-parse", "HEAD~3")}`,
  );
  write(repository, evidencePath("demo", "tasks/task-1/feedback.md"), feedback);
  commitPaths(
    repository,
    "stale feedback",
    evidencePath("demo", "tasks/task-1/feedback.md"),
  );

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Task 1 feedback is stale");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a mixed feedback commit", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  const feedback = Fs.readFileSync(
    Path.join(changeDir, "tasks", "task-1", "feedback.md"),
    "utf8",
  ).replace("created: 2026-09-12", "created: 2026-09-13");
  write(
    repository,
    evidencePath("demo", "tasks/task-1/feedback.md"),
    feedback,
  );
  write(repository, "mixed.txt", "mixed\n");
  commitAll(repository, "mixed feedback");

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Task 1 feedback is not tracked and committed exactly at HEAD",
  );
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a missing review without inheriting task approval", async () => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository);
  Fs.unlinkSync(Path.join(changeDir, "review.md"));
  commitAll(repository, "remove review");

  const result = await runPrecondition({ changeDir, testCommand: "true", targetBranch: fixtureTargetBranch});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("whole-branch review missing");
  expect(result.lastLine).toContain("gate: closed");
});

it("rejects a missing change directory before running gates", async () => {
  const repository = makeRepo();

  const result = await runPrecondition({
    changeDir: Path.join(repository, "nope"),
    testCommand: "true",
    targetBranch: fixtureTargetBranch,
  });

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("change dir does not exist");
});

it("preserves a target repository environment failure", async () => {
  const repository = makeRepo();
  const changeDir = makeChangeDir(repository, "add-auth");
  const result = await runPrecondition(
    { changeDir, testCommand: "true", targetBranch: fixtureTargetBranch},
    createPreconditionRuntime({
      fileSystem: {
        pathExists: () => true,
        directoryExists: () => true,
        realpath: () => changeDir,
      },
      git: {
        repositoryRoot: () => ({
          status: 128,
          stdout: "",
          stderr: "not a repo",
        }),
        statusPorcelain: () => ({ status: 0, stdout: "", stderr: "" }),
      },
    }),
  );

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("not inside a git repository");
});

const makeDeliveredFinish = async (linked = false, routeBacked = false) => {
  const repository = makeRepo();
  let source = repository;
  if (linked) {
    Fs.appendFileSync(Path.join(repository, ".git/info/exclude"), "\nfixture-worktrees/\n");
    source = Path.join(repository, "fixture-worktrees/change");
    git(repository, "worktree", "add", "-q", "-b", "change", source);
  } else git(repository, "checkout", "-q", "-b", "change");
  const routePath = ".kepler/maps/effort/route.md";
  const mapPath = ".kepler/maps/effort/map.md";
  if (routeBacked) {
    write(source, routePath, [
      "---", "artifact: route", "effort: effort", "status: shipping", "created: 2026-10-12", "updated: 2026-10-12", "decision: accepted",
      "units:", "  - id: 1", "    name: First", "    status: in-progress", "    depends_on: []", "    backed_by: []",
      "  - id: 2", "    name: Second", "    status: pending", "    depends_on: [1]", "    backed_by: []", "---",
      "# Route — Effort", "## Point of departure", "## Destination", "## Path chosen", "## Shipping rules", "- Qualification: merge", "Merge into main.",
      "## Units", "### 1. First", "### 2. Second",
    ].join("\n"));
    write(source, mapPath, [
      "---", "artifact: map", "effort: effort", "status: shipping", "branch: change", "created: 2026-10-12", "updated: 2026-10-12", "decision: accepted", "---",
      "# Effort", "## Destination", "## Notes", "## Operation rules", "## Decisions so far", "## Not yet specified", "## Out of scope",
    ].join("\n"));
  }
  const evidence = makeEvidence(source, routeBacked ? { routeUnit: `${routePath} — unit 1` } : {});
  const args = { changeDir: evidence.changeDir, targetBranch: "refs/heads/main", testCommand: "true" };
  const admitted = await runPrecondition(args, createPreconditionRuntime({ cwd: () => source }));
  expect(admitted.exitCode).toBe(0);
  const verifiedHead = git(source, "rev-parse", "HEAD");
  const admission = {
    verifiedHead, targetRef: args.targetBranch, targetCommit: evidence.base,
    reviewBase: evidence.base, reviewHead: evidence.material,
    reviewCommit: git(source, "log", "-1", "--format=%H", "--", evidencePath("demo", "review.md")),
    materialWaiver: null, inputs: [],
  };
  const sourceIdentity = {
    repository: Fs.realpathSync(git(source, "rev-parse", "--path-format=absolute", "--git-common-dir")),
    root: source, sourceRef: "refs/heads/change", worktree: git(source, "rev-parse", "--absolute-git-dir"),
  };
  const finishPath = evidencePath("demo", "finish.md");
  const routeIdentity = routeBacked ? {
    path: routePath, mapPath, unit: 1, sourceBlob: git(source, "rev-parse", `HEAD:${routePath}`), previousStatus: "in-progress",
    shipping: "merge", owner: "fixture-controller", change: "demo", sourceRef: "refs/heads/change", targetRef: args.targetBranch, baseCommit: evidence.base,
  } : null;
  const remaining = [...(routeBacked ? [{ kind: "route", path: routePath }] : []), { kind: "history", path: finishPath }];
  const attempt = [
    "## Attempt 1 — 2026-10-12", "- Passed preconditions: isolated mechanical fixture gate",
    "- Specification synchronization: planned none", "- Strategy: local-merge",
    "- Intended workspace result: main survives", "- Route intent: none",
    `- Admission identity: ${JSON.stringify(admission)}`, `- Source identity: ${JSON.stringify(sourceIdentity)}`,
    `- Route identity: ${JSON.stringify(routeIdentity)}`,
  ].join("\n");
  const front = (status: string) => [
    "---", "artifact: finish", "change: demo", `status: ${status}`, "created: 2026-10-12", "updated: 2026-10-12",
    "strategy: local-merge", `result: ${status}`, "decision: accepted", "---", "# Finish History: Demo",
  ].join("\n");
  write(source, finishPath, front("pending") + "\n\n" + attempt + "\n");
  const attemptCommit = commitPaths(source, "finish intent", finishPath);
  if (!linked) git(repository, "checkout", "-q", "main");
  git(repository, "merge", "--no-ff", "-q", "change", "-m", "deliver fixture");
  const mergeCommit = git(repository, "rev-parse", "HEAD");
  if (linked) git(repository, "worktree", "remove", source);
  git(repository, "branch", "-D", "change");
  const delivery = { strategy: "local-merge", targetRef: "refs/heads/main", commit: mergeCommit };
  const outcome = [
    "## Outcome 1 — 2026-10-12", "- Result: blocked",
    '- Specification synchronization result: {"paths":[],"commit":null}',
    `- Delivery identity: ${JSON.stringify(delivery)}`,
    `- Remaining effects: ${JSON.stringify(remaining)}`,
  ].join("\n");
  write(repository, finishPath, front("blocked") + "\n\n" + attempt + "\n\n" + outcome + "\n");
  const outcomeCommit = commitPaths(repository, "record blocked delivery", finishPath);
  return { repository, args: { ...args, changeDir: Path.join(repository, ".kepler/changes/demo") }, finishPath, routePath, mapPath, routeIdentity, remaining, admission, sourceIdentity, attemptCommit, mergeCommit, outcomeCommit, delivery };
};

describe("route finalization repair boundary", () => {
  let fixture: Awaited<ReturnType<typeof makeDeliveredFinish>>;
  beforeEach(async () => { fixture = await makeDeliveredFinish(true, true); });
  const repair = () => runPrecondition({ ...fixture.args, recoverFinish: 1 }, createPreconditionRuntime({ cwd: () => fixture.repository }));

  it("admits exact remaining route/history effects after source worktree removal", async () => {
    const result = await repair();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.lastLine).toBe("gate: repair-open");
    expect(result.stdout).toContain(`remaining-effects: ${JSON.stringify(fixture.remaining)}`);
    expect(git(fixture.repository, "rev-list", "--merges", "--count", "HEAD")).toBe("1");
  });

  it("reuses a committed exact advancement without changing siblings or replaying merge", async () => {
    const path = Path.join(fixture.repository, fixture.routePath);
    const source = Fs.readFileSync(path, "utf8");
    Fs.writeFileSync(path, source.replace("status: in-progress", "status: shipped"));
    commitPaths(fixture.repository, "owner persists exact route advancement", fixture.routePath);
    const before = Fs.readFileSync(path, "utf8");
    const mapBefore = Fs.readFileSync(Path.join(fixture.repository, fixture.mapPath), "utf8");
    const result = await repair();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(Fs.readFileSync(path, "utf8")).toBe(before);
    expect(before).toContain("name: Second\n    status: pending");
    expect(Fs.readFileSync(Path.join(fixture.repository, fixture.mapPath), "utf8")).toBe(mapBefore);
    expect(git(fixture.repository, "rev-list", "--merges", "--count", "HEAD")).toBe("1");
  });

  it.each(["status", "condition"] as const)("rejects changed named-unit %s without restoring it", async (mutation) => {
    const path = Path.join(fixture.repository, fixture.routePath);
    const source = Fs.readFileSync(path, "utf8");
    const changed = mutation === "status" ? source.replace("status: in-progress", "status: pending") : source.replace("Merge into main.", "Open requests qualify.");
    Fs.writeFileSync(path, changed);
    commitPaths(fixture.repository, "changed route boundary", fixture.routePath);
    const result = await repair();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/named route unit|intent\/body changed/);
    expect(Fs.readFileSync(path, "utf8")).toBe(changed);
  });

  it("rejects aggregate map shipment while another unit remains pending", async () => {
    const path = Path.join(fixture.repository, fixture.mapPath);
    Fs.writeFileSync(path, Fs.readFileSync(path, "utf8").replace("status: shipping", "status: shipped"));
    commitPaths(fixture.repository, "unqualified map aggregate", fixture.mapPath);
    const result = await repair();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("aggregate state exceeds");
  });

  it("rejects a competing visible change claim rather than transferring ownership", async () => {
    const source = Fs.readFileSync(Path.join(fixture.args.changeDir, "plan.md"), "utf8").replace("change: demo", "change: other");
    const other = ".kepler/changes/other/plan.md";
    write(fixture.repository, other, source);
    commitPaths(fixture.repository, "competing visible route claim", other);
    const result = await repair();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("competing visible route claim");
  });
});

describe("finalization repair admission", () => {
  it.each([false, true])("admits historical delivery without replay after source removal (linked=%s)", async (linked) => {
    const fixture = await makeDeliveredFinish(linked);
    const runtime = createPreconditionRuntime({ cwd: () => fixture.repository, process: fixtureProcess });
    const before = git(fixture.repository, "rev-parse", "HEAD");
    const source = Fs.readFileSync(Path.join(fixture.repository, fixture.finishPath), "utf8");
    const ordinary = await runPrecondition(fixture.args, runtime);
    expect(ordinary.exitCode).toBe(1);
    expect(ordinary.stdout).toContain("do not deliver again");
    const repair = await runPrecondition({ ...fixture.args, recoverFinish: 1 }, runtime);
    expect(repair.exitCode, repair.stdout + repair.stderr).toBe(0);
    expect(repair.stdout).toContain("admission: finalization-repair");
    expect(repair.lastLine).toBe("gate: repair-open");
    expect(repair.stdout).not.toContain("gate: open\n");
    expect(repair.stdout).toContain(`verified-head: ${before}`);
    expect(git(fixture.repository, "rev-parse", "HEAD")).toBe(before);
    expect(git(fixture.repository, "status", "--porcelain")).toBe("");
    expect(Fs.readFileSync(Path.join(fixture.repository, fixture.finishPath), "utf8")).toBe(source);
  });

  it("rejects dirty owned history without committing, discarding or redelivering", async () => {
    const fixture = await makeDeliveredFinish();
    const path = Path.join(fixture.repository, fixture.finishPath);
    Fs.appendFileSync(path, "\nOwner-held partial evidence\n");
    const before = Fs.readFileSync(path, "utf8");
    const result = await runPrecondition({ ...fixture.args, recoverFinish: 1 }, createPreconditionRuntime({ cwd: () => fixture.repository }));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("[FAIL] Clean tree");
    expect(Fs.readFileSync(path, "utf8")).toBe(before);
    expect(git(fixture.repository, "rev-parse", "HEAD")).toBe(fixture.outcomeCommit);
  });

  it.each(["reviewCommit", "targetCommit", "verifiedHead"] as const)("rejects forged or changed recorded %s", async (field) => {
    const fixture = await makeDeliveredFinish();
    const path = Path.join(fixture.repository, fixture.finishPath);
    const source = Fs.readFileSync(path, "utf8").replace(`"${field}":"${fixture.admission[field]}"`, `"${field}":"${fixture.mergeCommit}"`);
    Fs.writeFileSync(path, source);
    commitPaths(fixture.repository, "forged immutable identity", fixture.finishPath);
    const result = await runPrecondition({ ...fixture.args, recoverFinish: 1 }, createPreconditionRuntime({ cwd: () => fixture.repository }));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/immutable|historical admission|recorded review/);
    expect(result.lastLine).toContain("gate: closed");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid explicit recovery number %s before commands", async (recoverFinish) => {
    const result = await runPrecondition({ changeDir: "missing", testCommand: "true", targetBranch: "refs/heads/main", recoverFinish });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("positive attempt number");
  });
});
