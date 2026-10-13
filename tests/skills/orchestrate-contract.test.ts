import * as Fs from "node:fs"
import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const skill = readSkill("kepler-orchestrate")
const referenceUrl = (name: string) =>
  new URL(`../../skills/kepler-orchestrate/references/${name}`, import.meta.url)
const readReference = (name: string): string => {
  const path = referenceUrl(name)
  return Fs.existsSync(path) ? Fs.readFileSync(path, "utf-8") : ""
}
const singleLine = (content: string): string => content.replace(/\s+/g, " ")

describe("kepler-orchestrate task resume contract", () => {
  it("routes each v2 feedback and worker outcome without fabricating clearance", () => {
    const routing = section(skill, "## Dependency-mode v2 outcome routing")
    for (const outcome of ["absent", "untracked or changed", "mixed", "stale or lint-invalid", "skipped", "changes-requested code-defect", "cannot verify from diff", "fresh durable approved", "interrupted", "unavailable"]) expect(routing).toContain(outcome)
    expect(routing).toMatch(/code-defect.*--retry.*original Base.*new independent feedback/is)
    expect(routing).toMatch(/same-Head.*evidence/is)
    expect(routing).toMatch(/interrupted.*unavailable.*no fabricated/is)
    expect(routing).not.toMatch(/publication.*interrupted.*unavailable.*outcome vocabulary/i)
  })

  it("scopes dispatch selection, root ownership, and worker responses by execution mode", () => {
    const prompt = readReference("implementer-prompt.md")
    const opening = skill.split("The driver coordinates three distinct roles:")[1]?.split("**Continuous execution.**")[0] ?? ""

    expect(prompt).toMatch(/historical.*execution selection.*slot.*predecessor/is)
    expect(prompt).toMatch(/v2.*verified ready.*admission.*original Base.*worker.*lane.*prerequisite/is)
    expect(prompt).toMatch(/v2.*interrupted.*unavailable.*nonterminal worker responses/is)
    expect(prompt).toMatch(/canonical.*Outcome.*done.*blocked/is)
    expect(opening).toMatch(/historical serial.*root status/is)
    expect(opening).toMatch(/v2.*task-local evidence.*original commit.*coordinator.*guarded root publication/is)
  })

  it("keeps portable skill commands executable-independent", () => {
    const portable = `${skill} ${readReference("implementer-prompt.md")}`
    expect(portable).not.toContain("packages/cli/src/cli/main.ts")
    expect(portable).toMatch(/kepler workbench context/)
  })

  it("separates dependency-mode readiness and coordinator publication from legacy serial ownership", () => {
    const principles = section(skill, "## Principles")
    const dependencyMode = principles.split("### Dependency-mode v2")[1]?.split("### Historical serial mode")[0] ?? ""
    const legacy = principles.split("### Historical serial mode")[1] ?? ""
    expect(dependencyMode).toMatch(/verified ready.*held.*fully gated/is)
    expect(dependencyMode).toMatch(/ready.*not admitted/is)
    expect(dependencyMode).toMatch(/coordinator.*integrat.*publish/is)
    expect(dependencyMode).toMatch(/original Base.*retry/is)
    expect(dependencyMode).toMatch(/fresh.*committed.*independent.*feedback.*every active task/is)
    expect(legacy).toMatch(/validated explicit version-1 `execution\.order`.*otherwise numeric identity order/is)
    expect(legacy).toMatch(/malformed explicit order holds without fallback/is)
    expect(legacy).toMatch(/code-owned root updates/is)
  })
  const matrix = singleLine(section(skill, "## Task resume matrix"))

  it("dispatches code for a pending task", () => {
    expect(matrix).toMatch(/\| `pending` \| any \| Dispatch `kepler-code`/)
  })

  it("dispatches code for a blocked task", () => {
    expect(matrix).toMatch(/\| `blocked` \| any \| Dispatch `kepler-code`/)
  })

  it("inspects an interrupted in-progress task before dispatch", () => {
    expect(matrix).toMatch(
      /\| `in-progress` \| any \| Inspect Task N's git state and task-local log before resuming or resolving it/,
    )
  })

  it("dispatches code feedback when feedback is absent", () => {
    expect(matrix).toMatch(
      /\| `done` \| absent \| Dispatch `kepler-code-feedback`/,
    )
  })

  it("routes stale or invalid feedback to its owner without an identical retry", () => {
    expect(matrix).toMatch(
      /\| `done` \| stale or lint-invalid.*Route to the owner.*do not issue an identical retry/,
    )
  })

  it("keeps a lint-valid skipped task pass from authorizing advancement", () => {
    expect(matrix).toMatch(
      /\| `done` \| fresh `skipped` \| Dispatch `kepler-code-feedback`.*artifact is valid but does not approve the task/,
    )
  })

  it("classifies every outstanding requested-change finding before freshness routing", () => {
    expect(matrix).toMatch(
      /\| `done` \| `changes-requested`, fresh or stale \| Preserve and classify every outstanding finding before freshness routing/,
    )
    expect(matrix).toMatch(/Route code defects to `kepler-code`/)
    expect(matrix).toMatch(/evidence gaps through bounded located-evidence adjudication/)
    expect(matrix).toMatch(/intent defects to the owning proposal\/design stage/)
  })

  it("advances only after fresh task approval", () => {
    expect(matrix).toMatch(
      /\| `done` \| durable, fresh `approved` with no blocking findings \| Advance to the next active task or the whole-branch gate/,
    )
  })

  it("routes worktree-only and mixed-commit approvals back to feedback", () => {
    expect(matrix).toMatch(
      /\| `done` \| feedback untracked or changed from `HEAD` \| Dispatch `kepler-code-feedback`/,
    )
    expect(matrix).toMatch(
      /\| `done` \| latest feedback-touching commit is mixed \| Dispatch `kepler-code-feedback`/,
    )
  })
})

describe("kepler-orchestrate replicated task evidence contract", () => {
  const consistency = singleLine(section(skill, "## Task handoff consistency"))
  const process = singleLine(section(skill, "## Process"))
  const implementer = singleLine(readReference("implementer-prompt.md"))

  it("checks root metadata and body rows before applying the task matrix", () => {
    expect(consistency).toMatch(/frontmatter task list and Markdown rows must match exactly.*ordered task id, title, status, and progress link/is)
    expect(process).toMatch(/lint includes exact consistency between root progress metadata and body rows/is)
    expect(implementer).toMatch(/matching root metadata entry and Markdown row/is)
  })

  it("preserves in-progress and correction boundaries without treating aggregate complete as a gate", () => {
    expect(consistency).toMatch(/`in-progress`.*`status: pending`.*no attempt/is)
    expect(consistency).toMatch(/correction.*prior finalized local status and attempt/is)
    expect(consistency).toMatch(/aggregate `status: complete`.*implementation summary.*never a finish-work gate/is)
  })

  it("diagnoses contradictory terminal evidence with its owner before advancement", () => {
    expect(consistency).toMatch(/root `done` or `blocked`.*local status\/latest terminal Outcome/is)
    expect(consistency).toMatch(/diagnose.*owning coder/is)
    expect(consistency).toMatch(/driver never invents a done attempt/is)
    expect(process).toMatch(/subagent returns.*rerun `kepler workbench lint --change-dir <change-dir>`.*stop on nonzero exit/is)
    expect(process).toMatch(/independently read the committed root metadata entry and row.*task-local status.*physical latest attempt\/Outcome/is)
  })
})

describe("kepler-orchestrate TDD refactor handoff contract", () => {
  const handoff = singleLine(section(skill, "## TDD refactor handoff"))
  const process = singleLine(section(skill, "## Process"))
  const implementer = singleLine(readReference("implementer-prompt.md"))
  const codeFeedback = singleLine(readReference("code-feedback-prompt.md"))

  it("names code feedback as the refactor-phase gate after green implementation", () => {
    expect(handoff).toMatch(
      /green implementation.*not an advancement point.*existing `kepler-code-feedback` dispatch.*refactor-phase review/is,
    )
  })

  it("requires task-local red-green-refactor or exception evidence", () => {
    expect(implementer).toMatch(
      /task-local.*red\/green\/refactor.*commands and observed results/is,
    )
    expect(implementer).toMatch(
      /conventional red check.*exception reason.*repeatable alternative verification/is,
    )
  })

  it("supplies TDD evidence and bounded context to feedback", () => {
    expect(codeFeedback).toContain("[TDD_EVIDENCE]")
    expect(codeFeedback).toContain("[PROJECT_STANDARDS]")
    expect(codeFeedback).toMatch(
      /task acceptance.*stable task diff.*project standards.*bounded located-risk context/is,
    )
  })

  it("routes requested refactors through correction verification and fresh feedback", () => {
    expect(handoff).toMatch(
      /changes-requested.*same Task N.*kepler-code.*relevant verification.*fresh.*kepler-code-feedback/is,
    )
    expect(process).toMatch(
      /refactor-phase review.*changes-requested.*same Task N.*relevant verification/is,
    )
  })

  it("advances only after a fresh durable approved feedback pass", () => {
    expect(handoff).toMatch(
      /Only a fresh durable `approved` feedback pass.*another task or the whole-branch gate/is,
    )
    expect(implementer).toContain("refactor-phase review")
    expect(codeFeedback).toContain("refactor-phase review")
  })
})

describe("kepler-orchestrate route ownership admission contract", () => {
  const process = singleLine(section(skill, "## Process"));
  const implementer = singleLine(readReference("implementer-prompt.md"));
  const code = readSkill("kepler-code");
  const propose = readSkill("kepler-propose");
  const plan = readSkill("kepler-plan");
  const wayfinder = readSkill("kepler-wayfinder");
  const finish = readSkill("kepler-finish-work");

  it("binds route revision and owner claims before task writes", () => {
    expect(process).toMatch(/route-backed change.*canonical route\/unit.*exact committed route-source revision/is);
    expect(process).toMatch(/scan known proposals\/plans.*local and visible remote branches.*worktrees.*another owner/is);
    expect(process).toMatch(/local scan.*cannot prove cross-clone exclusivity.*unsupported/is);
    expect(implementer).toMatch(/current context's route-unit and route-source revision.*scan visible claims/is);
  });

  it("dispatches a resolved target and rejects source-target aliases without tip-SHA identity", () => {
    expect(process).toMatch(/full named source branch ref.*resolved full delivery-target ref/is);
    expect(implementer).toContain("[DISPATCH_TARGET]");
    expect(code).toMatch(/full resolved delivery-target ref/);
    expect(section(code, "## Dispatch identity readback")).toMatch(/compares the source and target by full refs and configured upstream mapping, not tip\s+SHAs/);
  });

  it("requires owner-directed claim transfer and retains uncertain workspaces", () => {
    const proposalProcess = singleLine(section(propose, "## Process"));
    const planProcess = singleLine(section(plan, "## Process"));
    const claiming = singleLine(section(wayfinder, "## Map mechanics"));
    const retention = singleLine(section(finish, "## Route ownership and workspace retention"));

    expect(proposalProcess).toMatch(/explicit owner authorization.*inspection of partial work.*Git\/provider effects.*preservation of history\/work/is);
    expect(planProcess).toMatch(/explicit owner authorization.*inspection of partial work.*Git\/provider effects.*preservation of history\/work/is);
    expect(claiming).toMatch(/never use a workspace suffix.*competing or ambiguous claim.*owner-directed resume\/transfer/is);
    expect(claiming).toMatch(/local scan.*not a cross-clone lock.*unsupported/is);
    expect(retention).toMatch(/designated user\/controller authorizes any withdrawal or transfer/is);
    expect(retention).toMatch(/Retain and report shared, dirty or ambiguously owned workspaces/is);
  });
});

describe("kepler-orchestrate whole-branch resume contract", () => {
  const matrix = singleLine(section(skill, "## Whole-branch resume matrix"))

  it("requires a full review when the review is absent", () => {
    expect(matrix).toMatch(/\| absent \| Obtain a full whole-branch review with explicit target and actual merge base/)
  })

  it("routes invalid review evidence to its owner without identical retries", () => {
    expect(matrix).toMatch(/\| lint-invalid, undurable, or off-branch \| Diagnose the exact invalid evidence with its owner.*do not grant clearance or repeat an identical dispatch/)
  })

  it("keeps a valid skipped branch pass from authorizing finish", () => {
    expect(matrix).toMatch(/\| valid `skipped` \| Obtain a non-skipped review with a stated review purpose/)
  })

  it("classifies requested changes before choosing remediation scope", () => {
    expect(matrix).toMatch(/\| valid latest `changes-requested` \| Preserve and classify all blockers before choosing remediation scope/)
  })

  it("hands current full or bounded approval to finish-work", () => {
    expect(matrix).toMatch(/\| valid full `approved` or `approved-remediation`, with current clearance \| Hand off to `kepler-finish-work`/)
  })
})

describe("kepler-orchestrate checkpoint and evidence contract", () => {
  const process = singleLine(section(skill, "## Process"))
  const checkpointRules = singleLine(
    section(skill, "## Checkpoint establishment and recovery"),
  )
  const codeFeedback = readReference("code-feedback-prompt.md")
  const wholeBranch = readReference("whole-branch-review-prompt.md")

  it("orders the stable checkpoint, code, feedback, and next task", () => {
    const checkpoint = process.indexOf("Resolve and validate the task checkpoint")
    const code = process.indexOf("Dispatch `kepler-code`")
    const packageDiff = process.indexOf("Package the task diff")
    const feedback = process.indexOf("Dispatch `kepler-code-feedback`")
    const commit = process.indexOf("Confirm the feedback artifact-only commit")
    const advance = process.indexOf("Select the next active task")

    expect(checkpoint).toBeGreaterThanOrEqual(0)
    expect(code).toBeGreaterThan(checkpoint)
    expect(packageDiff).toBeGreaterThan(code)
    expect(feedback).toBeGreaterThan(packageDiff)
    expect(commit).toBeGreaterThan(feedback)
    expect(advance).toBeGreaterThan(commit)
  })

  it("runs the shared checkpoint verifier before every code dispatch", () => {
    expect(skill).toContain("<change-dir>/tasks/task-N/.base")
    expect(process).toMatch(
      /run `kepler workbench diff --record --task N --change-dir <change-dir>` before every code dispatch/is,
    )
    expect(checkpointRules).toMatch(
      /with no task attempt or feedback history.*records current `HEAD` only when.*root row is `pending`.*committed task log has no attempt.*worktree is clean/is,
    )
    expect(checkpointRules).toMatch(
      /initial pending-log creation commit is not an implementation attempt/is,
    )
    expect(process).not.toContain("~/.kepler/scripts/")
  })

  it("does not treat clean pending logs as semantic authority to crop prior task work", () => {
    expect(checkpointRules).toMatch(/before.*first-attempt.*--record.*inspect.*task-owned.*committed.*uncommitted/is)
    expect(checkpointRules).toMatch(/mechanical eligibility.*does not prove.*absence of task-owned/is)
    expect(checkpointRules).toMatch(/task-owned work.*(?:ambiguous|uncertain).*stop.*never record current `HEAD`/is)
  })

  it("reconstructs only from agreeing historical evidence and preserves the cache", () => {
    expect(checkpointRules).toMatch(
      /durable task history.*first parent.*earliest committed task-progress revision.*first attempt/is,
    )
    expect(checkpointRules).toMatch(
      /every valid feedback `Base:` must agree/is,
    )
    expect(checkpointRules).toMatch(
      /ignored.*`tasks\/task-N\/.base` is a no-overwrite cache:.*never treats it as authority/is,
    )
    expect(checkpointRules).toMatch(
      /(?:restores|reconstructs) it only when it is missing and history proves the value/is,
    )
    expect(checkpointRules).toMatch(
      /malformed or conflicting existing cache.*missing or ambiguous historical evidence.*owner diagnosis/is,
    )
    expect(checkpointRules).toMatch(/never substitute current `HEAD`, `HEAD~1`/is)
  })

  it("makes the implementer preserve rather than create a checkpoint", () => {
    const implementer = singleLine(readReference("implementer-prompt.md"))
    expect(implementer).not.toMatch(/preserve or create/i)
    expect(implementer).toMatch(
      /validate and preserve the already-recorded task-local checkpoint.*never create/is,
    )
  })

  it("uses task progress as the sole detailed implementer report", () => {
    const implementer = singleLine(readReference("implementer-prompt.md"))
    expect(skill).toMatch(/task progress is the only detailed implementer report/i)
    expect(implementer).toContain("<change-dir>/tasks/task-N/progress.md")
    expect(implementer).toMatch(/return only.*status.*commit/is)
    expect([skill, implementer, codeFeedback, wholeBranch].join("\n")).not.toContain(
      "[REPORT_FILE]",
    )
  })

  it("requires each feedback artifact to be committed before the next checkpoint", () => {
    expect(process).toMatch(
      /Confirm the feedback artifact-only commit.*only `tasks\/task-N\/feedback\.md`.*before.*Select the next active task/is,
    )
  })

  it("defines one exact durable task approval predicate", () => {
    const approval = singleLine(section(skill, "## Durable task approval"))

    expect(approval).toMatch(/tracked at current `HEAD`.*`git ls-files --error-unmatch`/is)
    expect(approval).toMatch(
      /index.*unchanged from current `HEAD`.*`git diff --cached --quiet HEAD --`/is,
    )
    expect(approval).toMatch(
      /worktree.*unchanged from the index.*`git diff --quiet --`/is,
    )
    expect(approval).toMatch(
      /staged.*differs.*worktree.*matches.*`HEAD`.*fail/is,
    )
    expect(approval).toMatch(/latest commit that touched.*feedback.*artifact-only/is)
    expect(approval).toMatch(/commit's path list.*only.*tasks\/task-N\/feedback\.md/is)
    expect(approval).toMatch(
      /lint accepts the feedback artifact.*physical last pass.*`approved`.*no blocking findings.*fresh/is,
    )
    expect(approval).toMatch(/any failed condition.*dispatch `kepler-code-feedback`/is)
  })

  it("rechecks durable approval at every advancement boundary", () => {
    expect(process).toMatch(/Load durable state.*evaluate.*durable task approval/is)
    expect(process).toMatch(
      /Confirm the feedback artifact-only commit.*re-evaluate.*durable task approval/is,
    )
    expect(process).toMatch(
      /before.*recording.*next task checkpoint.*re-evaluate.*durable task approval/is,
    )
    expect(process).toMatch(
      /before.*whole-branch gate.*re-evaluate.*durable task approval.*every active task/is,
    )
    expect(process).toMatch(/never.*transient.*subagent output.*worktree text.*advance/is)
  })
})

describe("kepler-orchestrate prompt scopes", () => {
  const codeFeedback = readReference("code-feedback-prompt.md")
  const wholeBranch = readReference("whole-branch-review-prompt.md")

  it("ships distinct task-feedback and whole-branch prompt files", () => {
    expect(Fs.existsSync(referenceUrl("code-feedback-prompt.md"))).toBe(true)
    expect(Fs.existsSync(referenceUrl("whole-branch-review-prompt.md"))).toBe(true)
    expect(Fs.existsSync(referenceUrl("reviewer-prompt.md"))).toBe(false)
    expect(skill).toContain("references/code-feedback-prompt.md")
    expect(skill).toContain("references/whole-branch-review-prompt.md")
    expect(codeFeedback).not.toBe(wholeBranch)
  })

  it("binds task feedback to one task range and destination", () => {
    expect(codeFeedback).toContain("kepler-code-feedback")
    expect(codeFeedback).toContain("Task [N]")
    expect(codeFeedback).toContain("Base: [BASE_SHA]")
    expect(codeFeedback).toContain("Head: [HEAD_SHA]")
    expect(codeFeedback).toContain("<change-dir>/tasks/task-N/progress.md")
    expect(codeFeedback).toContain("<change-dir>/tasks/task-N/feedback.md")
    expect(codeFeedback).toContain("kepler workbench lint --change-dir <change-dir>")
    expect(codeFeedback).toMatch(/only lint decides whether their format is valid/is)
    expect(codeFeedback).toMatch(/kepler-code-feedback's evidence, review, append, and commit rules/is)
    expect(codeFeedback).toMatch(/CLI-verified historical checkpoint, not only the ignored `.base` cache/is)
    expect(codeFeedback).toMatch(/do not impose a second template or pass-shape validator/is)
    expect(codeFeedback).toMatch(/bounded inspection/i)
  })

  it("supplies optional located evidence for a same-head feedback pass", () => {
    const process = singleLine(section(skill, "## Process"))

    expect(codeFeedback).toContain("## Located evidence")
    expect(codeFeedback).toContain("[LOCATED_EVIDENCE_OR_NONE]")
    expect(codeFeedback).toMatch(/exact named located evidence/i)
    expect(codeFeedback).toMatch(/typed `evidence-gap`.*legacy.*cannot verify from diff/is)
    expect(codeFeedback).toMatch(/same supplied `Base` and `Head`/i)
    expect(codeFeedback).toMatch(/new physical pass/i)
    expect(process).toMatch(
      /located evidence resolves.*re-dispatch.*new physical pass.*same Base and Head/is,
    )
  })

  it("routes a confirmed unresolved gap back to code", () => {
    const process = singleLine(section(skill, "## Process"))

    expect(process).toMatch(
      /confirmed code gap.*dispatch `kepler-code`.*`kepler-code-feedback`.*located gap/is,
    )
  })

  it("binds whole-branch review to the complete branch and root destination", () => {
    expect(wholeBranch).toContain("kepler-review")
    expect(wholeBranch).toContain("Base: [MERGE_BASE_SHA]")
    expect(wholeBranch).toContain("Head: [HEAD_SHA]")
    expect(wholeBranch).toMatch(/complete branch diff/i)
    expect(wholeBranch).toContain("<change-dir>/review.md")
    expect(wholeBranch).toContain("kepler workbench lint --change-dir <change-dir>")
    expect(wholeBranch).toMatch(/only lint decides whether their format is valid/is)
    expect(wholeBranch).toMatch(/follow kepler-review's.*append.*commit rules/is)
    expect(wholeBranch).toMatch(/do not impose a second template or pass-shape\s+validator/is)
    expect(wholeBranch).toMatch(/broader repository/i)
  })

  it("delegates pass formatting to lint instead of duplicating a producer validator", () => {
    for (const prompt of [codeFeedback, wholeBranch]) {
      expect(prompt).toMatch(/only lint decides whether their format is valid/is)
      expect(prompt).toMatch(/do not impose a second template or pass-shape\s+validator/is)
      expect(prompt).not.toMatch(/fail closed for partial globals/i)
      expect(prompt).not.toMatch(/each appended pass records exactly one full/i)
    }
  })
})

describe("kepler-orchestrate whole-branch findings", () => {
  const findings = singleLine(section(skill, "## Whole-branch findings"))

  it("re-plans implementation findings as numbered remediation tasks", () => {
    expect(findings).toMatch(/complete finding set.*`kepler-plan` in re-plan mode/is)
    expect(findings).toMatch(/one or more.*numbered remediation tasks/is)
    expect(findings).toMatch(/each.*ordinary `kepler-code`.*`kepler-code-feedback` loop/is)
    expect(findings).toMatch(/repeat.*whole-branch review/is)
  })

  it("stops upstream when findings invalidate approved artifacts", () => {
    expect(findings).toMatch(
      /requires changing an approved requirement or design decision.*stop.*`kepler-propose`/is,
    )
  })

  it("forbids ownerless, retroactive, and synthetic fixes", () => {
    expect(findings).not.toMatch(/fix wave/i)
    expect(findings).toMatch(/Frozen completed tasks remain unchanged/i)
    expect(findings).toMatch(/every correction.*numbered active task present in `plan\.md`/i)
  })
})
