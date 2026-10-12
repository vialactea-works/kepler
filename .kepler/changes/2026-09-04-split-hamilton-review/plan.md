# Plan: Separate task execution and feedback from whole-branch review

## Overview

- Change: `.hamilton/changes/2026-09-04-split-hamilton-review/`
- Goal: Split task code feedback from whole-branch review and reorganize execution state so root `progress.md` is the authoritative task index, detailed task progress and feedback live under `tasks/task-N/`, and finish history has its own durable artifact.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: Follow `proposal.md`, `design.md`, and all four files under `requirements/`. Before recording Task 1's checkpoint, commit the currently untracked approved proposal, requirements, design, this plan, root progress index, and initialized task progress files as a planning-scaffold commit so no task diff absorbs upstream artifacts. Baseline verification after `bun install` found one existing GNU/Linux portability failure in `tests/scripts/change-context.test.ts` (`--all` orders `older-change` first because failed `stat -f` output contaminates the timestamp); Task 1 fixes that helper before any later task, while the other 97 tests pass and `bun run build` succeeds. Whole-branch Review Pass 1 requested eighteen corrections after Tasks 1–14. The approved self-hosting bootstrap disposition resolves Finding 1 without rewriting history and authorizes only Task 15's forward normalization of the existing Task 1 and Task 4 attempt headings; Findings 2–18 remain implementation obligations. Tasks 1–14 and their existing rows and histories are frozen except for those two exact Task 15 heading normalizations. After Task 15's implementation commit, its edits make Task 1 and Task 4 feedback stale: before recording Task 16's checkpoint, the driver must obtain and commit fresh artifact-only `hamilton-code-feedback` passes for Task 1 and Task 4 at the normalization head, then obtain Task 15 feedback. After Task 27's producer correction, before recording Task 28's checkpoint, the driver must use `hamilton-code-feedback` to remove retained template instructions from the live Task 4, Task 5, Task 11, and Task 14 feedback artifacts while preserving every pass, append fresh canonical passes at the same material head, commit each artifact alone, and then obtain Task 27 feedback. Every new remediation task otherwise follows canonical `Attempt N` syntax and receives a committed artifact-only feedback pass before the next task checkpoint. Do not edit `.hamilton/specs/` during implementation; `hamilton-finish-work` distills the deltas into canonical specs after the final gate. Do not modify historical `.hamilton/changes/` or `.hamilton/maps/` artifacts outside this active change. Do not add comments to TypeScript, tests, or shell code; the instructional HTML blocks required inside artifact templates are template content, not source-code commentary. Run the task Verify command, then the full suite and build required by `hamilton-code` before each implementation commit.
- Quality notes: Tasks 15–31 preserve the completed task definitions while slicing review remediation by parser boundary, gate boundary, producer boundary, template lifecycle, and documentation concern. Shared artifact grammar becomes one installed shell library before consumers tighten verdict semantics; same-file changes carry explicit dependencies; target-repository checks are separated from committed-evidence checks; template creation shapes precede producer consumption; migration, sequence, and catalog corrections remain separate presentation tasks. Real temporary repositories verify executable behavior, while Markdown contract tests assert stable lifecycle boundaries rather than prose snapshots. No structural smell is accepted.
- Re-plan Pass 2 notes: Whole-branch Review Pass 2 requested three further corrections after Tasks 15–31: bind whole-review owner identity to the owning plan instead of the review file, reject actionless `changes-requested` verdicts, and align plan/code producer instructions with the exact canonical abandonment suffix already enforced by the shared parser. Tasks 1–31 and all existing rows and histories remain frozen. Tasks 32–34 append those corrections without introducing compatibility grammar or weakening any strict split-layout gate.
- Re-plan Pass 2 quality notes: Task 32 owns external whole-review identity, Task 33 owns verdict consistency in the shared parser, and Task 34 owns producer-contract wording. The two parser tasks are ordered because they share the artifact-contract library and consumer fixtures; the producer-contract task remains independently verifiable. No structural smell is accepted.
- Re-plan Pass 3 notes: Whole-branch Review Pass 3 requested two further corrections after Tasks 32–34: require every canonical Blocking entry to contain located, actionable finding content instead of accepting placeholders, and require task approval evidence to be durably committed before resume may advance or whole-branch review may begin. Tasks 1–34 and all existing rows and histories remain frozen. Tasks 35–37 append those corrections without adding compatibility syntax or weakening physical-last-pass, freshness, artifact-only ordering, or split-layout gates.
- Re-plan Pass 3 quality notes: Task 35 owns the shared Blocking-item grammar, Task 36 owns executable committed-evidence classification in change context, and Task 37 owns consumption of that durable approval boundary by orchestration and direct whole-branch review. The parser and context behaviors remain independently testable in temporary repositories; the final task aligns the two stage contracts without duplicating artifact shape. No structural smell is accepted.
- Pre-Pass 4 re-plan notes: Validation after Tasks 35–37 exposed one overbroad Task 35 rule: the shared Blocking-finding parser rejects every angle-bracket expression in actionable prose, so the preserved whole-review Pass 1 history and current root review become malformed solely because located findings quote legitimate contract literals such as `<title>`, `<date>`, and `<reason>`. Tasks 1–37 and all existing rows and histories remain frozen. Task 38 narrows placeholder rejection to actual unexpanded finding-template fields while preserving strict located, actionable Blocking semantics and physical-last-pass validation.
- Pre-Pass 4 quality notes: Task 38 owns one shared-parser distinction and its existing context/precondition consumer matrices. It adds no compatibility grammar and does not weaken concrete location, actionable prose, verdict consistency, pass ordering, freshness, or committed-evidence checks. The preserved review history is an explicit regression input, so the correction remains independently verifiable without editing that history. No structural smell is accepted.

## Tasks

### Task 1: Parse split change context

- Depends on: none
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `tests/scripts/change-context.test.ts`
  - Deleted: none
- Acceptance:
  - The helper parses the root Task/Status/Progress table, preserves plan order, validates exact active task identities, the four statuses, Markdown-escaped titles, links, matching task-progress headings, and latest task outcome evidence without folding full attempt history (requirements/execution.md — Root progress and finish-gate structure requirements).
  - A directory without `plan.md` reports `pre-plan`; a planned monolithic or missing-scaffold directory reports `legacy-unsupported` without inferred task or review status; `--all` continues across both generations (requirements/execution.md — Legacy formats are inventoried but never interpreted).
  - Missing, duplicate, extra, reordered, wrong-link, wrong-task, illegal-status, and done-without-done-evidence cases are reported rather than guessed.
  - `--all` derives sortable modification epochs portably on GNU/Linux and BSD/macOS, so a failed stat dialect cannot leak diagnostic output into the timestamp or reverse chronological ordering.
- Steps:
  1. Replace the task-context fixtures with root index and task-progress files and add failing pre-plan, legacy, escaped-title, structural-drift, and `--all` cases.
  2. Replace append-only root-progress folding with table and task-file validation, add explicit generation classification, make modification-time probing capture only the successful platform dialect, and keep route and capability inventory behavior intact.
  3. Run the focused context tests and inspect representative single-change and `--all` output.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts` → ledger parsing, generation classification, and inventory tests pass.
- Commit: `feat(scripts): read split task progress in change context`

### Task 2: Ship split pipeline artifact templates

- Depends on: none
- Files:
  - Created:
    - `bundle/templates/task-progress.md`
    - `bundle/templates/feedback.md`
    - `bundle/templates/finish.md`
    - `tests/templates/artifact-contracts.test.ts`
  - Modified:
    - `bundle/templates/progress.md`
    - `bundle/templates/review.md`
    - `bundle/templates/plan.md`
    - `bundle/templates/design.md`
    - `bundle/templates/README.md`
    - `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - `progress.md` is a root-only Task/Status/Progress table whose statuses are exactly `pending`, `in-progress`, `blocked`, and `done`, and whose links target `tasks/task-N/progress.md` (requirements/artifact-templates.md — Progress template represents the root task index only).
  - `task-progress.md` identifies `Task N` and carries append-only `done | blocked` attempts; `feedback.md` identifies the same task and carries `Base:`, `Head:`, verdict, Blocking, and Suggestions; `review.md` is whole-branch-only with `Base:` and `Head:`; `finish.md` carries paired monotonic Attempt/Outcome sections (requirements/artifact-templates.md — task progress, task feedback, review, and finish requirements).
  - `hamilton setup` installs and reports `task-progress.md`, `feedback.md`, and `finish.md`, and the catalog and plan/design hints describe the split owners without a root-progress stage timeline.
- Steps:
  1. Add failing template-contract assertions and extend setup's expected template set for every new filename and required shape marker.
  2. Rewrite `progress.md` and `review.md`, add the three new templates, and update the plan, design, and catalog templates to reference the split artifacts and seven-stage consumers without changing unrelated template behavior.
  3. Run the focused template and setup tests and fix only violations of the approved template contract.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts tests/cli/setup.test.ts` → all template-shape and installation tests pass.
- Commit: `feat(templates): split task and change execution artifacts`

### Task 3: Remove the legacy project-local template mirror

- Depends on: Task 2
- Files:
  - Created: none
  - Modified:
    - `tests/templates/artifact-contracts.test.ts`
  - Deleted:
    - `.hamilton/templates/README.md`
    - `.hamilton/templates/design.md`
    - `.hamilton/templates/plan.md`
    - `.hamilton/templates/progress.md`
    - `.hamilton/templates/proposal.md`
    - `.hamilton/templates/requirements-change.md`
    - `.hamilton/templates/requirements-spec.md`
    - `.hamilton/templates/review.md`
- Acceptance:
  - No tracked path remains under `.hamilton/templates/`, while `bundle/templates/` remains the sole repository source and setup still installs to `~/.hamilton/templates/` (requirements/artifact-templates.md — The bundle is the only repository template source).
  - No file under `.hamilton/changes/`, `.hamilton/specs/`, or `.hamilton/maps/` is deleted by this task.
- Steps:
  1. Extend the template contract test so it fails while any tracked project-local template mirror exists and verifies that bundle sources remain present.
  2. Delete exactly the eight listed legacy files and no project history or canonical specification.
  3. Run the contract test and inspect the staged deletion list for scope.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts && test -z "$(git ls-files '.hamilton/templates/**')"` → the contract passes and the tracked mirror is empty.
- Commit: `chore(templates): remove legacy project-local mirror`

### Task 4: Scope diff checkpoints to individual tasks

- Depends on: none
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-diff-package.sh`
    - `tests/scripts/diff-package.test.ts`
  - Deleted: none
- Acceptance:
  - Task record and package modes accept an exact positive task number, validate that it names an active `Task N`, and use ignored `tasks/task-N/.base` instead of the shared change-level checkpoint (requirements/execution.md — Each task owns one stable diff checkpoint).
  - Recording is idempotent and never overwrites an existing task checkpoint; a correction after A..B is packaged as A..C, and starting Task 3 never changes Task 2's checkpoint.
  - Missing, empty, malformed, off-history, or same-as-HEAD checkpoints fail without `HEAD~1`; explicit-base and whole-change modes retain their valid existing behavior.
- Steps:
  1. Rewrite the script tests first for task-number validation, per-task ignore paths, record-once behavior, correction ranges, task isolation, and failure cases while retaining explicit-base and whole-change coverage.
  2. Change record and package modes to resolve `tasks/task-N/.base`, validate active plan membership and commit ancestry, and preserve the checkpoint once created.
  3. Run the focused script tests and inspect the emitted package range and ignore entries.
- Verify: `bun --bun vitest run tests/scripts/diff-package.test.ts` → every task-local and whole-change range case passes.
- Commit: `feat(scripts): scope diff checkpoints per task`

### Task 5: Report split review freshness

- Depends on: Task 4, Task 1
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `tests/scripts/change-context.test.ts`
  - Deleted: none
- Acceptance:
  - Context reports each active task's physical latest feedback verdict and fresh/stale/malformed standing from the declared task identity and valid Base/Head range, never falling back past a malformed last pass.
  - Context reports the physical latest whole-branch verdict and freshness against the latest material change commit, excluding only this change's operational progress, feedback, review, and finish paths, and inventories `finish.md` separately.
  - Unrelated later task commits do not stale earlier task feedback, while a later commit touching that task's progress does; proposal, requirement, design, plan, spec, map, skill, template, script, test, and documentation changes remain material to whole-branch freshness.
- Steps:
  1. Add failing nested-feedback and root-review fixtures for valid, stale, malformed, wrong-task, physically-last-pass, unrelated-sibling, material-change, and finish-presence cases.
  2. Add narrow pass parsers and git ancestry checks to the context helper, retaining the ledger as the implementation-state source and opening only the latest task evidence needed for the summary.
  3. Run the focused tests and compare the output matrix for absent, stale, changes-requested, and approved states.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts` → all split feedback and whole-review context cases pass.
- Commit: `feat(scripts): report feedback and review freshness`

### Task 6: Enforce task ledger completion in the finish gate

- Depends on: Task 2, Task 1
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/precondition-check.test.ts`
  - Deleted: none
- Acceptance:
  - The task gate requires root progress to match active `plan.md` tasks exactly once and in order, validates the four statuses and exact links, requires matching task-progress headings and physical latest `Outcome: done`, and skips abandoned plan tasks while retaining their history (requirements/execution.md — Finish gates validate the task ledger structurally).
  - Every missing, duplicate, extra, reordered, invalid-status, wrong-link, missing-file, wrong-task, pending, in-progress, blocked, and inconsistent-done case fails closed and names the affected task.
  - The existing clean-tree and configured verification-command gates keep their behavior, and a planned legacy layout fails rather than being interpreted.
- Steps:
  1. Replace the task-gate fixtures with the split ledger and add one failing test per structural and status edge case while retaining clean-tree and verification-command coverage.
  2. Replace root history folding with exact plan/table/task-file validation and explicit legacy rejection without changing unrelated command-line options.
  3. Run the full precondition test file and inspect its per-gate messages and final `gate: open | closed` line.
- Verify: `bun --bun vitest run tests/scripts/precondition-check.test.ts` → all task-ledger and retained precondition cases pass.
- Commit: `feat(scripts): gate finish on the task progress ledger`

### Task 7: Enforce split review gates

- Depends on: Task 4, Task 5, Task 6
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/precondition-check.test.ts`
    - `tests/scripts/helpers.ts`
  - Deleted: none
- Acceptance:
  - Every active task requires a physically last, correctly identified, well-formed `approved` feedback pass with no blocking or `cannot verify from diff` item and a valid current-branch Base/Head range containing that task's latest progress commit (requirements/review.md — task verdict and freshness requirements).
  - Root review requires a physically last, well-formed `approved` pass with no blocking findings and a valid range containing the latest material change commit; malformed last passes never fall back, and material calculation excludes only operational bookkeeping paths.
  - The existing explicit waiver bypasses only the final material-change ancestry comparison; malformed/off-branch ranges, task feedback freshness, verdicts, ledger state, clean tree, and configured verification remain non-waivable.
- Steps:
  1. Add or factor only the test helper needed to create selective git commits, then replace mixed-review fixtures with nested feedback and commit-bound root review fixtures.
  2. Add failing cases for wrong-task identity, missing/malformed physical last pass, inverted or unreachable ranges, stale task feedback, sibling commits, unresolved `cannot verify from diff`, contradictory approval, material and bookkeeping changes, missing review, and waiver boundaries.
  3. Rewrite the review and freshness gates to parse each owner artifact directly and validate git ancestry against the current branch.
  4. Run the focused gate tests and verify that every unknown or contradictory state fails closed.
- Verify: `bun --bun vitest run tests/scripts/precondition-check.test.ts` → every task-feedback, whole-review, freshness, and waiver case passes.
- Commit: `feat(scripts): gate finish on fresh split reviews`

### Task 8: Implement the task-local execution lifecycle in skills

- Depends on: Task 2, Task 4, Task 1, Task 6
- Files:
  - Created:
    - `tests/skills/helpers.ts`
    - `tests/skills/execution-contracts.test.ts`
  - Modified:
    - `skills/hamilton-plan/SKILL.md`
    - `skills/hamilton-code/SKILL.md`
  - Deleted: none
- Acceptance:
  - Planning writes `plan.md`, initializes root progress and one task progress file per active task, escapes display titles, and reconciles re-plan additions, renames, frozen done tasks, and abandoned history without renumbering (requirements/execution.md — planning and re-plan requirements).
  - Code requires one exact active `Task N`, moves only its row through `in-progress` to `done | blocked`, appends only its task log, commits successful evidence with code, and persists a graceful blocker in an artifact-only commit without committing partial production edits (requirements/execution.md — code status transitions).
  - Both skills reject unsupported planned legacy layouts, use task-local checkpoints and evidence, never write review/finish summaries into progress, and preserve sibling isolation.
- Steps:
  1. Add a small skill-test helper and failing structural tests for the stable paths, status vocabulary, initialization, re-plan, inline-id, blocker, sibling, and legacy boundaries.
  2. Rewrite the plan skill's output and re-plan contract around the root index and initialized task logs.
  3. Rewrite the code skill's inputs, process, output, progress format, commit behavior, and handoff around one row and one task directory.
  4. Run the focused contract tests and read both skills end to end for contradictory old progress language.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts` → plan and code contract tests pass.
- Commit: `feat(skills): split task execution progress`

### Task 9: Add the task-scoped code-feedback skill

- Depends on: Task 2, Task 4, Task 8
- Files:
  - Created:
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-code-feedback/references/code-quality.md`
    - `tests/skills/code-feedback-contract.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The self-contained step-4 skill accepts exactly one `Task N`, its stable diff package, task-local progress, binding constraints, and standards; whole-branch input stops and redirects to `hamilton-review` (requirements/review.md — Task-scoped code feedback is a distinct pipeline step).
  - Inspection remains bounded to the task diff except one concrete named risk, and every unresolved `cannot verify from diff` item is blocking `changes-requested` until located evidence or code resolves it.
  - Each physical last pass records matching task identity, full Base/Head, verdict, Blocking, and Suggestions in `tasks/task-N/feedback.md`, commits only that artifact before handoff, and never changes progress.
- Steps:
  1. Write failing contract tests for frontmatter, exact scope, bounded inspection, unresolved-impact handling, artifact shape and path, reviewed range, artifact-only commit, and wrong-scope handoff.
  2. Author the self-contained skill and local task-diff quality rubric without a sibling-skill dependency.
  3. Run the focused contract tests and inspect the skill for any whole-branch mode or root-progress write.
- Verify: `bun --bun vitest run tests/skills/code-feedback-contract.test.ts` → every tactical feedback contract marker passes.
- Commit: `feat(skills): add hamilton-code-feedback`

### Task 10: Narrow hamilton-review to whole-branch inspection

- Depends on: Task 2, Task 7, Task 9
- Files:
  - Created:
    - `tests/skills/review-contract.test.ts`
  - Modified:
    - `skills/hamilton-review/SKILL.md`
    - `skills/hamilton-review/references/code-quality.md`
  - Deleted: none
- Acceptance:
  - `hamilton-review` is step 5 and accepts only merge-base-to-HEAD whole-branch input; task input stops and redirects to `hamilton-code-feedback` (requirements/review.md — Whole-branch review is a distinct pipeline gate).
  - Every pass starts from the complete diff and always inspects broader affected repository consumers, assumptions, cross-task composition, missing material changes, and boundaries, while running only focused verification for a concrete doubt and leaving mandatory full verification to finish-work.
  - Each physical last pass records full Base/Head and verdict in root `review.md`, commits only that file before handoff, never writes progress, and names re-plan or upstream proposal revision according to the finding type.
- Steps:
  1. Write failing contract tests for whole-branch-only scope, broad impact inspection, focused verification, material freshness metadata, physical-last-pass behavior, artifact-only commit, and task-scope redirect.
  2. Rewrite `SKILL.md` as the whole-branch gate and specialize its local quality reference for integration, omission, and affected-consumer review.
  3. Run the focused tests and read the skill for any surviving task-diff mode or bounded-repository instruction.
- Verify: `bun --bun vitest run tests/skills/review-contract.test.ts` → every whole-branch contract marker passes.
- Commit: `feat(skills): make hamilton-review whole-branch only`

### Task 11: Rebuild orchestration around split pipeline state

- Depends on: Task 4, Task 5, Task 8, Task 9, Task 10
- Files:
  - Created:
    - `skills/hamilton-orchestrate/references/code-feedback-prompt.md`
    - `skills/hamilton-orchestrate/references/whole-branch-review-prompt.md`
    - `tests/skills/orchestrate-contract.test.ts`
  - Modified:
    - `skills/hamilton-orchestrate/SKILL.md`
    - `skills/hamilton-orchestrate/references/implementer-prompt.md`
  - Deleted:
    - `skills/hamilton-orchestrate/references/reviewer-prompt.md`
- Acceptance:
  - Orchestration uses root status plus physical latest verdict and freshness: pending/blocked dispatches code, interrupted in-progress is inspected, done with absent/stale feedback dispatches feedback, fresh changes-requested dispatches code, and only done plus fresh approval advances (requirements/execution.md — Resume decisions).
  - It records one task-local `.base` before first code, uses task progress as the only detailed implementer report, commits each feedback artifact before the next checkpoint, and uses distinct task-feedback and whole-branch prompts.
  - After all task gates, absent/stale review dispatches review, fresh changes-requested enters re-plan for numbered remediation tasks or stops upstream for an artifact defect, and fresh approval hands off to finish-work; no ownerless fix wave or synthetic task remains.
- Steps:
  1. Add failing orchestration contract tests for every task resume state, every whole-review resume state, task checkpoint order, absence of a report-file placeholder, distinct prompts, remediation re-plan, and upstream-defect stop.
  2. Rewrite the implementer prompt around one row and task log, replace the shared reviewer prompt with the two scope-specific prompts, and require Base/Head persistence and artifact-only review commits.
  3. Rewrite the orchestration process, durable-resume section, model roles, file handoffs, boundaries, output, and flow diagram around the approved state matrices.
  4. Run the focused tests and search the changed skill directory for old per-task `hamilton-review`, shared `.base`, report-file, and one-wave language.
- Verify: `bun --bun vitest run tests/skills/orchestrate-contract.test.ts` → all orchestration state and prompt contracts pass.
- Commit: `feat(skills): orchestrate split feedback and review gates`

### Task 12: Move finish history into finish.md

- Depends on: Task 2, Task 7, Task 11
- Files:
  - Created:
    - `tests/skills/finish-work-contract.test.ts`
  - Modified:
    - `skills/hamilton-finish-work/SKILL.md`
  - Deleted: none
- Acceptance:
  - Finish-work consumes the exact ledger, task evidence, fresh feedback, and physical latest whole-review gates, and the explicit waiver affects only material-change ancestry; it never appends a finish section to progress.
  - After gates and committed spec synchronization, it commits `Attempt N` before side effects, verifies real state, persists matching `Outcome N` on the surviving branch or base, pushes and reads back remote outcomes when applicable, and reconciles a dangling attempt before another action (requirements/execution.md — Finish history).
  - Finish-owned spec, route/map, and numbered finish mutations after gate entry do not stale that same attempt; any unrelated material edit aborts and returns to review.
- Steps:
  1. Add failing contract tests for inputs and gates, no progress write, monotonic paired sections, attempt-before-action ordering, dangling recovery, local-merge/base persistence, pull-request push/read-back, no-op, partial failure, and post-gate mutation boundaries.
  2. Rewrite the finish skill's process, progress replacement, strategy branches, resume behavior, output, and diagram around `finish.md` and verified side effects.
  3. Run the focused tests and inspect the skill for stale mixed-review, last-code-commit, or root-progress finish language.
- Verify: `bun --bun vitest run tests/skills/finish-work-contract.test.ts` → every finish gate and history contract marker passes.
- Commit: `feat(skills): record verified finish outcomes separately`

### Task 13: Synchronize the seven-step identity across live skills

- Depends on: Task 8, Task 9, Task 10, Task 11, Task 12
- Files:
  - Created:
    - `tests/skills/pipeline-identity.test.ts`
  - Modified:
    - `skills/hamilton-init/SKILL.md`
    - `skills/hamilton-propose/SKILL.md`
    - `skills/hamilton-critique/SKILL.md`
    - `skills/hamilton-plan/SKILL.md`
    - `skills/hamilton-code/SKILL.md`
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `skills/hamilton-orchestrate/SKILL.md`
    - `skills/hamilton-finish-work/SKILL.md`
    - `bundle/templates/design.md`
  - Deleted: none
- Acceptance:
  - Every live core skill presents `propose → plan → code → code-feedback → review → finish-work`, with init step 0, propose step 1, plan step 2, code step 3, code-feedback step 4, review step 5, and finish-work step 6; Wayfinder and critique remain optional and outside the core count (requirements/framework-docs.md — Pipeline identity).
  - Code hands off to code-feedback, critique distinguishes itself from whole-branch review, design-template testing guidance names both tactical and final gates, and no live skill advertises task-scoped `hamilton-review`.
  - Structural tests assert stable semantic markers rather than full prose snapshots.
- Steps:
  1. Add failing pipeline-identity tests covering every listed skill's sequence, role, step number, and handoff plus the design-template cross-reference.
  2. Update the remaining embedded sequences, step labels, counterpart descriptions, handoffs, and diagrams without changing each skill's unrelated behavior.
  3. Run all skill contract tests and search live skills for stale six-step and task-review language, excluding historical change artifacts.
- Verify: `bun --bun vitest run tests/skills` → all execution, feedback, review, orchestration, finish, and identity contract tests pass.
- Commit: `docs(skills): promote code feedback to pipeline step four`

### Task 14: Publish the split workflow migration guidance

- Depends on: Task 3, Task 13
- Files:
  - Created: none
  - Modified:
    - `README.md`
    - `docs/skills.md`
    - `docs/sdd-framework.md`
    - `docs/modes.md`
    - `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - Every public pipeline diagram and stage table shows seven core skills, the per-task code/code-feedback loop, one whole-branch review, and finish-work step 6 without counting Wayfinder or critique (requirements/framework-docs.md — Pipeline identity).
  - The skills reference gives plan, code, code-feedback, review, orchestrate, and finish-work entries the established heading/When/Inputs/Produces/Notes/Source shape and accurately names the root ledger, nested task artifacts, reviewed-head freshness, remediation re-plan, and finish history.
  - Artifact trees show root `progress.md`, `tasks/task-N/{progress.md,feedback.md}`, root `review.md`, and root `finish.md`; migration guidance says update the full set between changes, labels planned old formats unsupported, and does not imply conversion or resume support.
  - `CONTRIBUTING.md` maps changes under `skills/hamilton-*/` to `docs/skills.md`, while existing template and Wayfinder mapping distinctions remain intact.
- Steps:
  1. Update the README quick start, diagram, artifact tree, and migration pointer from the implemented contracts.
  2. Rewrite the affected skills-reference entries and control-flow section, then update the SDD framework and modes overview to the same seven-step and split-artifact truth.
  3. Add the Assisted-skill row to the contributor mapping without merging or disturbing the established Wayfinder rows.
  4. Read all five documents end to end, run stale-language searches outside historical artifacts, and run the repository gates.
- Verify: `bun --bun vitest run && bun run build && git diff --check` → full tests and build pass, and the diff has no whitespace errors.
- Commit: `docs: publish split execution and review workflow`

### Task 15: Normalize bootstrap task attempt histories

- Depends on: Task 14
- Files:
  - Created: none
  - Modified:
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-1/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-4/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-15/progress.md`
  - Deleted: none
- Acceptance:
  - Task 1's nine physical attempts and Task 4's two physical attempts are headed contiguously as `## Attempt 1` through `## Attempt 9` and `## Attempt 1` through `## Attempt 2` respectively, with every original date, evidence body, and physical order preserved (requirements/artifact-templates.md — Approved bootstrap disposition for this change).
  - No other completed task history, existing commit, root status other than Task 15, feedback pass, or product parser is changed; the repair is a forward commit and creates no accepted alternate grammar (requirements/execution.md — Approved bootstrap disposition for this change).
  - The driver treats the normalization commit as the latest implementation evidence for Task 1 and Task 4 and completes the feedback-refresh barrier in the Overview before any Task 16 checkpoint is recorded (requirements/review.md — Task feedback freshness follows task implementation).
- Steps:
  1. Capture the existing Task 1 and Task 4 dates, attempt bodies, and physical order, then run a failing structural check that demonstrates their headings are not canonical and contiguous.
  2. Replace only those two files' pre-contract H2 headings with physically ordered canonical attempt numbers, preserving all other bytes in their attempt bodies and leaving their root rows `done`.
  3. Run the exact heading, body-preservation, and whitespace checks; do not edit a parser or any feedback artifact in this task.
- Verify: `test "$(rg -c '^## Attempt [1-9][0-9]* — 2026-09-04$' .hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-1/progress.md)" -eq 9 && test "$(rg -c '^## Attempt [1-9][0-9]* — 2026-09-04$' .hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-4/progress.md)" -eq 2 && ! rg -n '^## Task [1-9][0-9]*:' .hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-{1,4}/progress.md && git diff --check` → both approved histories use only their exact contiguous canonical headings and the diff is clean.
- Commit: `docs(change): normalize bootstrap task attempts`

### Task 16: Enforce canonical task attempt grammar

- Depends on: Task 15
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-16/progress.md`
  - Deleted: none
- Acceptance:
  - Both split-layout consumers accept only contiguous physical `## Attempt N — <date>` sections beginning at 1 and reject the removed `## Task N: <title> — <date>` form and every other alternate attempt boundary (requirements/artifact-templates.md — Task execution details have an installed template and nested instance path).
  - The legacy acceptance fixture and every generic fallback branch are removed; neither this change slug nor any task number appears in product parsing logic (requirements/execution.md — Legacy formats are inventoried but never interpreted).
  - The now-canonical Task 1 and Task 4 histories pass ordinary strict parsing without a compatibility exception.
- Steps:
  1. Replace the legacy-acceptance fixture with failing cases for task-titled, skipped, duplicated, and out-of-order attempt headings in both context and finish-gate consumers.
  2. Remove the alternate heading branches and require one contiguous canonical sequence while retaining physical-boundary and latest-outcome validation.
  3. Run both focused script suites and search live scripts and tests for any affirmative legacy-attempt fallback.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → both consumers reject alternate or non-contiguous task attempts and accept the normalized live shape.
- Commit: `fix(scripts): reject legacy task attempt headings`

### Task 17: Centralize exact active-task resolution

- Depends on: Task 16
- Files:
  - Created:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `bundle/scripts/hamilton-diff-package.sh`
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/diff-package.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `tests/cli/setup.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-17/progress.md`
  - Deleted: none
- Acceptance:
  - One installed, portable parser supplies all three helpers with exact comment-aware `Task N` declarations, rejects duplicate positive ids and headings hidden in HTML comments, and recognizes abandonment only from the canonical `(abandoned — <reason>)` suffix (requirements/execution.md — exact active task and checkpoint ownership).
  - Malformed abandonment markers remain active or malformed rather than being silently skipped, and no consumer uses Bash 4-only lowercase expansion, `mapfile`, or another Bash 3.2-incompatible construct.
  - `hamilton setup` installs and reports the shared script dependency, and direct bundled-script tests resolve it from the scripts directory without relying on caller CWD.
- Steps:
  1. Add failing cross-helper fixtures for duplicate ids, commented headings, exact and malformed abandonment suffixes, and a setup expectation for the shared script.
  2. Implement the narrow artifact-contract library with one comment-aware task resolver and make context, diff-package, and precondition consume it from their own script directory.
  3. Remove the three divergent task classifiers, run the focused suites, and scan the installed scripts for Bash 4-only syntax.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/diff-package.test.ts tests/scripts/precondition-check.test.ts tests/cli/setup.test.ts` → every helper applies the same exact active-task grammar and setup installs its dependency.
- Commit: `refactor(scripts): centralize active task parsing`

### Task 18: Centralize exact verdict history parsing

- Depends on: Task 17
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
    - `bundle/scripts/hamilton-change-context.sh`
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-18/progress.md`
  - Deleted: none
- Acceptance:
  - Context and precondition use one fail-closed grammar for task feedback and whole-branch review: exact owner H1, contiguous unique physical `Pass N` numbering beginning at 1, ordered Base/Head/Verdict and Blocking/Suggestions sections, nonempty canonical list semantics, and no fallback past a malformed physical last pass (requirements/review.md — task-owned and change-owned verdict histories).
  - `approved` with a Blocking finding, missing findings sections, duplicate or gapped numbering, wrong identity, unknown metadata, or malformed list content is invalid in both consumers.
  - The phrase `cannot verify from diff` is not searched in arbitrary prose: an unresolved item blocks through its canonical Blocking section and `changes-requested` verdict, while a Suggestions sentence describing resolved coverage remains valid (requirements/review.md — Unverified task impact is resolved before approval).
- Steps:
  1. Add the same failing verdict-history matrix to both consumers, including sectionless approval, pass-number gaps and duplicates, contradictions, and resolved `cannot verify from diff` prose under Suggestions.
  2. Move physical pass parsing and semantic validation into the shared artifact-contract library and adapt each consumer to use its canonical result plus its own ancestry/freshness policy.
  3. Delete the broad phrase flag and the inconsistent local verdict parsers, then run both focused suites.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → both helpers accept and reject the same canonical verdict histories, including resolved-risk prose.
- Commit: `fix(scripts): enforce canonical verdict histories`

### Task 19: Scope material exclusions to exact task owners

- Depends on: Task 18
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `tests/scripts/change-context.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-19/progress.md`
  - Deleted: none
- Acceptance:
  - Whole-branch freshness excludes bookkeeping only for exact numeric `tasks/task-N/progress.md` and `tasks/task-N/feedback.md` owners declared by the plan's active or retained history policy, matching the precondition gate (requirements/review.md — Whole-branch review has a change-owned verdict history).
  - A path such as `tasks/task-not-a-task/feedback.md`, an undeclared numeric task path, or any near-match remains material and stales the review, while exact root progress, root review, root finish, and declared task bookkeeping retain their intended exclusions.
- Steps:
  1. Add failing context fixtures mirroring precondition's noncanonical task-like path regression and covering an undeclared numeric owner.
  2. Replace broad `task-*` pathspec exclusions with exact paths derived from the shared plan-task result.
  3. Run the context suite and compare representative freshness outcomes with the existing precondition fixtures.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts` → only exact declared bookkeeping owners are excluded from whole-branch material freshness.
- Commit: `fix(scripts): scope material exclusions to task owners`

### Task 20: Bind diff packaging to the change repository

- Depends on: Task 17
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-diff-package.sh`
    - `tests/scripts/diff-package.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-20/progress.md`
  - Deleted: none
- Acceptance:
  - When `--change-dir` is supplied or discovered, every checkpoint, ignore, ancestry, HEAD, default-ref, diff, and path operation is performed against the one repository root resolved from that directory, independent of caller CWD (requirements/execution.md — Each task owns one stable diff checkpoint).
  - A caller in repository A can package a change in repository B without reading or mutating A, and an invalid change directory outside a Git repository fails before writing a checkpoint or package.
  - Whole-change mode retains its caller-repository merge-base behavior because it accepts no change directory.
- Steps:
  1. Add a failing two-repository fixture that invokes record, task package, and explicit-base package from repository A for a change under repository B and checks all output and ignore mutations remain in B.
  2. Resolve the target root once from the change directory and route every relevant Git command and relative path through that root without changing whole-change semantics.
  3. Run the diff-package suite and inspect both repositories after the cross-repository cases.
- Verify: `bun --bun vitest run tests/scripts/diff-package.test.ts` → task and explicit-base modes are bound to the change repository and whole-change behavior remains green.
- Commit: `fix(scripts): bind diff packaging to change repository`

### Task 21: Guard checkpoint creation after durable task evidence

- Depends on: Task 20
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-diff-package.sh`
    - `tests/scripts/diff-package.test.ts`
    - `skills/hamilton-code/SKILL.md`
    - `tests/skills/execution-contracts.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-21/progress.md`
  - Deleted: none
- Acceptance:
  - `--record` creates a missing checkpoint only for a genuine first attempt whose row is pending, task log has no attempt, feedback is absent, and no durable task evidence conflicts; otherwise it rejects the write and requires unambiguous historical recovery (requirements/execution.md — Task checkpoint is missing on resume).
  - Direct `hamilton-code` applies the same evidence-free guard and recovery/stop rules as orchestration before invoking record, so retry or correction work cannot silently rebase to current HEAD.
  - An existing valid checkpoint remains idempotent and reusable regardless of later task evidence.
- Steps:
  1. Add failing helper cases for a missing checkpoint with done, blocked, attempted, or feedback-bearing evidence and skill-contract assertions for direct-code recovery parity.
  2. Make record validate the split row and durable task artifacts before first creation while preserving validation of an existing checkpoint; update code's checkpoint process to distinguish first attempt from historical recovery.
  3. Run both focused suites and confirm no path substitutes `HEAD~1` or current HEAD after evidence exists.
- Verify: `bun --bun vitest run tests/scripts/diff-package.test.ts tests/skills/execution-contracts.test.ts` → checkpoint creation is evidence-free only and direct code stops or recovers historical work safely.
- Commit: `fix(scripts): protect durable task checkpoints`

### Task 22: Run finish gates in the target repository

- Depends on: Task 18, Task 20
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-22/progress.md`
  - Deleted: none
- Acceptance:
  - Precondition resolves one repository root from `--change-dir` before any gate, checks cleanliness there, and executes the configured verification command with that root as its working directory rather than using caller CWD (requirements/review.md — Finish requires current implementation and both approval classes).
  - The gate rechecks target-repository cleanliness immediately after verification and once more immediately before `gate: open`; a zero-exit command that dirties a tracked path closes the gate and names the mutation.
  - A two-repository invocation cannot use repository A's clean tree or passing command context to open a dirty or failing repository B.
- Steps:
  1. Add failing two-repository tests and a zero-exit verification command that mutates a tracked target path.
  2. Resolve and retain the target root at startup, run all repository-sensitive gates there, and add post-verification and final clean-tree checks without weakening existing waiver boundaries.
  3. Run the focused precondition suite and inspect the ordering of clean, test, post-test, and final gate output.
- Verify: `bun --bun vitest run tests/scripts/precondition-check.test.ts` → caller CWD cannot influence target gates and any verification-side mutation keeps the gate closed.
- Commit: `fix(scripts): run finish gates in target repository`

### Task 23: Require committed finish-gate evidence

- Depends on: Task 22
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-23/progress.md`
  - Deleted: none
- Acceptance:
  - Before consuming evidence, the finish gate requires plan, root ledger, every active task progress and feedback file, and root review to be tracked at current HEAD with worktree content identical to committed content (requirements/review.md — task and whole-branch artifact-only commit requirements).
  - An ignored untracked recreation, assume-unchanged modification, staged-only verdict, or tracked deletion cannot satisfy any task, review, or freshness gate even when its filesystem text is otherwise valid.
  - Exact committed evidence passes without changing the existing structural, verdict, freshness, test, cleanliness, or waiver semantics.
- Steps:
  1. Add failing fixtures for valid-looking ignored-untracked, staged, modified, and deleted evidence at each owner class.
  2. Add one target-root committed-content check and apply it to every artifact before its text is parsed.
  3. Run the focused suite and verify failures identify the uncommitted owner rather than laundering it through later gates.
- Verify: `bun --bun vitest run tests/scripts/precondition-check.test.ts` → only evidence tracked and committed exactly at HEAD can open the finish gate.
- Commit: `fix(scripts): require committed gate evidence`

### Task 24: Reject unsupported review generations

- Depends on: Task 17
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `tests/skills/code-feedback-contract.test.ts`
    - `tests/skills/review-contract.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-24/progress.md`
  - Deleted: none
- Acceptance:
  - Both direct review entry points run an early no-write generation gate: once plan exists, they require the exact split root ledger and every required active-task artifact before scope inspection or verdict mutation (requirements/execution.md — Legacy formats are inventoried but never interpreted).
  - A planned monolithic, missing-scaffold, or partially split change stops as `legacy-unsupported` with between-changes upgrade guidance and cannot acquire a new-generation feedback or review artifact.
  - A pre-plan request remains distinguishable from legacy, while a valid split change continues to the existing task-scope or whole-branch-scope validation.
- Steps:
  1. Add failing skill-contract cases for monolithic, partially scaffolded, and pre-plan inputs, asserting the gate precedes artifact writes.
  2. Add the same exact split-generation preflight to code-feedback and review while retaining their distinct scope boundaries.
  3. Run both focused contract suites and read the entry sequences for any route that appends a verdict before the generation gate.
- Verify: `bun --bun vitest run tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts` → both review producers fail closed at the atomic-generation boundary.
- Commit: `fix(skills): reject unsupported review generations`

### Task 25: Route unresolved feedback evidence explicitly

- Depends on: Task 24
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-orchestrate/SKILL.md`
    - `skills/hamilton-orchestrate/references/code-feedback-prompt.md`
    - `tests/skills/orchestrate-contract.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-25/progress.md`
  - Deleted: none
- Acceptance:
  - The task resume matrix distinguishes ordinary fresh `changes-requested` from a fresh pass carrying a canonical unresolved `cannot verify from diff` Blocking item and routes the latter to driver adjudication before code or advancement (requirements/review.md — Unverified task impact is resolved before approval).
  - The code-feedback dispatch prompt has an explicit located-evidence input that may be empty on an ordinary pass and carries exact named cross-task evidence for a same-Head re-feedback pass.
  - Contract coverage proves satisfied-risk re-feedback keeps the unchanged reviewed Head and can approve only through a new physical pass, while a confirmed gap returns to code.
- Steps:
  1. Add failing resume-matrix and prompt-placeholder assertions for unresolved evidence, confirmed gaps, and satisfied same-Head re-feedback.
  2. Split the matrix action, thread a located-evidence placeholder through the dispatch template, and align the numbered process with the existing bounded adjudication rule.
  3. Run the orchestration contract suite and inspect the prompt with both empty and populated evidence inputs.
- Verify: `bun --bun vitest run tests/skills/orchestrate-contract.test.ts` → unresolved verification is adjudicated explicitly and same-Head evidence-only re-feedback is dispatchable.
- Commit: `fix(skills): route unresolved feedback evidence`

### Task 26: Model lifecycle creation state in templates

- Depends on: Task 2
- Files:
  - Created: none
  - Modified:
    - `bundle/templates/progress.md`
    - `bundle/templates/task-progress.md`
    - `bundle/templates/feedback.md`
    - `bundle/templates/review.md`
    - `bundle/templates/finish.md`
    - `tests/templates/artifact-contracts.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-26/progress.md`
  - Deleted: none
- Acceptance:
  - Each lifecycle template's opening instruction names its producer and instance path and explicitly tells the producer to delete the block and every inline hint before finalizing (canonical `.hamilton/specs/artifact-templates.md` — The template idiom).
  - `task-progress.md` represents plan-time creation without a future attempt stub; `finish.md` represents first-attempt creation without a future Outcome stub; other lifecycle templates contain only fields that exist when their producer instantiates them (canonical artifact-template creation-time-shape decision).
  - Append-only attempt, pass, and outcome field semantics remain in their owning requirements and skills rather than being stamped prematurely into initialized artifacts.
- Steps:
  1. Add failing template-boundary assertions for instruction removal and creation-time absence of future sections.
  2. Revise only the five bundled lifecycle shapes to the canonical idiom and creation-time state, retaining their exact owner headings and stable fields where they exist at creation.
  3. Run the template contracts and inspect every changed template end to end.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts` → all five lifecycle templates satisfy the canonical idiom and creation-time boundary.
- Commit: `fix(templates): model lifecycle creation state`

### Task 27: Instantiate installed artifact templates in producers

- Depends on: Task 24, Task 26
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-code/SKILL.md`
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `skills/hamilton-finish-work/SKILL.md`
    - `tests/skills/execution-contracts.test.ts`
    - `tests/skills/code-feedback-contract.test.ts`
    - `tests/skills/review-contract.test.ts`
    - `tests/skills/finish-work-contract.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-27/progress.md`
  - Deleted: none
- Acceptance:
  - Code, code-feedback, review, and finish-work load and instantiate their exact installed named templates, remove all template instructions and inline hints, and preserve lifecycle validation and append-only semantics without carrying a second exact artifact shape in skill code fences (requirements/artifact-templates.md — The bundle is the only repository template source).
  - Skill contract tests assert template filename, instantiation, hint removal, owner path, and lifecycle behavior; exact field/order assertions remain only in bundled-template tests.
  - Existing feedback histories keep every prior pass while their owning feedback producer can remove a retained leading instruction block; the driver completes the live-artifact cleanup barrier in the Overview before Task 28 begins.
- Steps:
  1. Replace duplicated-shape contract assertions with failing installed-template consumption and hint-removal assertions across all four producers.
  2. Rewrite producer instructions to instantiate and clean the installed template, then describe append validation semantically without duplicating the template's exact field/order block.
  3. Run all four focused skill suites, search the producer bodies for copied full artifact skeletons, and hand control to the driver for the required artifact-only cleanup passes.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts tests/skills/finish-work-contract.test.ts` → every producer uses the installed template as the sole shape definition and retains its lifecycle gates.
- Commit: `refactor(skills): instantiate installed artifact templates`

### Task 28: Protect verdict bookkeeping commits before commit

- Depends on: Task 27
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `tests/skills/code-feedback-contract.test.ts`
    - `tests/skills/review-contract.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-28/progress.md`
  - Deleted: none
- Acceptance:
  - Both verdict producers inspect the index before mutation and refuse to proceed when an unrelated staged path exists, or use an explicitly path-limited commit that provably cannot absorb it; the required verdict commit contains only its owner artifact (requirements/review.md — task and whole-branch artifact-only commit requirements).
  - The pre-commit safety action occurs before creating the bookkeeping commit, and the existing post-commit path-list verification remains mandatory.
  - Contract tests cover unrelated pre-staged production and change-artifact paths for both task feedback and whole-branch review without permitting destructive unstaging.
- Steps:
  1. Add failing contract cases that pre-stage an unrelated path and assert no verdict commit can include it.
  2. Add the same non-destructive pre-commit index/path-set gate and path-limited commit instruction to both producers while retaining post-commit verification.
  3. Run both focused suites and inspect the process order from preflight through handoff.
- Verify: `bun --bun vitest run tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts` → pre-staged work cannot enter either verdict commit and artifact-only verification still runs afterward.
- Commit: `fix(skills): protect verdict bookkeeping commits`

### Task 29: Document the atomic installed-generation upgrade

- Depends on: Task 20, Task 21, Task 22, Task 24, Task 25, Task 27, Task 28
- Files:
  - Created: none
  - Modified:
    - `README.md`
    - `docs/skills.md`
    - `docs/sdd-framework.md`
    - `docs/modes.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-29/progress.md`
  - Deleted: none
- Acceptance:
  - Migration guidance tells users to finish an active old-format change first, update the complete skill/template/helper set, run `hamilton setup`, and verify the installed generation before starting the next change (requirements/framework-docs.md — Migration guidance makes the artifact split a between-changes upgrade).
  - Maintained docs consistently state that installed helpers and setup are required for checkpoint, packaging, context, and finish gates, or provide a complete executable manual fallback at every call site; no blanket claim promises missing colocated recipes.
  - The helper caller table names the actual consumers after remediation, including the shared artifact-contract dependency where relevant.
- Steps:
  1. Trace every live helper invocation and current setup output, then identify the migration and fallback claims that disagree with those dependencies.
  2. Rewrite the four maintained documentation surfaces with one atomic upgrade procedure, explicit installed-generation verification, and the actual helper requirement/caller matrix.
  3. Read the edited sections end to end, run stale-claim searches, and run repository verification.
- Verify: `bun --bun vitest run && bun run build && git diff --check` → repository gates pass and the documented upgrade/setup/helper contract matches live consumers.
- Commit: `docs: document atomic Hamilton upgrades`

### Task 30: Correct pipeline stage ordering

- Depends on: Task 29
- Files:
  - Created: none
  - Modified:
    - `README.md`
    - `docs/sdd-framework.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-30/progress.md`
  - Deleted: none
- Acceptance:
  - README quick start places canonical specification synchronization before finish intent/history recording, matching finish-work's gate, sync, attempt, action, and outcome order (requirements/execution.md — Finish history has a dedicated append-only artifact).
  - Framework prose states step 0 runs once per project, step 1 is optional per change, and steps 2–6 form the per-change sequence; it does not claim all steps 1–6 are mandatory.
- Steps:
  1. Add a concrete checklist from the live finish-work sequence and compare it with both cited summaries.
  2. Correct only the ordering and optionality claims while preserving the seven-step identity and migration guidance.
  3. Read both complete pipeline summaries and run stale-sequence searches plus repository verification.
- Verify: `bun --bun vitest run && bun run build && git diff --check` → repository gates pass and both summaries match the binding lifecycle order.
- Commit: `docs: correct pipeline stage ordering`

### Task 31: Correct artifact lifecycle reference claims

- Depends on: Task 27, Task 30
- Files:
  - Created: none
  - Modified:
    - `bundle/templates/README.md`
    - `docs/skills.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-31/progress.md`
  - Deleted: none
- Acceptance:
  - The template catalog identifies task progress as initialized by plan and appended by code, distinguishes the sole required declarative `plan.md` input from the required operational ledger and task files created with it, and removes the obsolete claim that every downstream stage can start from a raw description (requirements/artifact-templates.md — Template documentation presents all split execution and review artifacts).
  - The code skill reference distinguishes a successful implementation commit from a graceful blocked artifact-only bookkeeping commit and accurately names its producer/updater ownership (requirements/framework-docs.md — Skill reference documents execution and review ownership).
  - Catalog and reference prose agree with the installed-template producer behavior implemented by Task 27 and retain the exact split instance paths.
- Steps:
  1. Compare the catalog ownership and required-artifact paragraphs plus the code skill entry against the implemented plan/code contracts.
  2. Correct producer/updater, declarative-versus-operational, start boundary, and success-versus-blocked claims without widening other documentation.
  3. Run template contracts, read both edited documents end to end, and run repository verification.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts && bun run build && git diff --check` → template contracts and build pass and both reference surfaces state the implemented lifecycle accurately.
- Commit: `docs: correct artifact lifecycle ownership`

### Task 32: Bind whole-review identity to the owning plan

- Depends on: Task 18, Task 23
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
    - `bundle/scripts/hamilton-change-context.sh`
    - `bundle/scripts/hamilton-precondition-check.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-32/progress.md`
  - Deleted: none
- Acceptance:
  - Context and precondition derive the expected `Whole-branch Review: <title>` identity from the owning plan's exact `# Plan: <title>` heading and pass that independently derived value to the shared verdict parser; neither consumer reads the review artifact to decide which owner heading should be accepted (requirements/review.md — Whole-branch review has a change-owned verdict history).
  - A review copied from another change, a decorated whole-review heading, or a missing, duplicate, decorated, or otherwise malformed owning plan H1 fails closed even when the review's pass grammar and commit range are otherwise valid (requirements/artifact-templates.md — Whole-branch review has an installed template and change-root instance path).
  - Correctly matched plan and review identities retain the existing verdict, ancestry, freshness, committed-evidence, and exact split-layout behavior in both consumers.
- Steps:
  1. Add failing context and precondition fixtures for a copied wrong-title review, a decorated review H1, and malformed or ambiguous plan H1 ownership while retaining one matched-title control.
  2. Add one exact plan-title resolver to the shared artifact-contract library and make both whole-review consumers construct the expected review heading only from that result before invoking the existing verdict parser.
  3. Remove review-file-derived expected-heading logic, run the focused consumer suites, and inspect both call sites to confirm the review cannot authenticate its own owner identity.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → both consumers reject copied or decorated whole-review ownership and accept only identity bound to the owning plan.
- Commit: `fix(scripts): bind whole review identity to plan`

### Task 33: Require actionable changes-requested verdicts

- Depends on: Task 32
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-33/progress.md`
  - Deleted: none
- Acceptance:
  - The shared verdict grammar accepts `changes-requested` only when the Blocking section contains at least one canonical finding and contains no `- None.` marker; an empty, omitted, or `None.`-only Blocking section is malformed (requirements/review.md — task-feedback and whole-branch verdict histories).
  - The inverse consistency rule remains exact: `approved` requires `- None.` as its sole Blocking entry and rejects every blocking finding, while Suggestions keeps its existing canonical nonempty-list semantics.
  - The same task-feedback and whole-branch regression matrix passes through both change-context and precondition, and neither consumer can route an actionless changes-requested pass as valid current state.
- Steps:
  1. Add failing matrix cases for Task feedback and whole-branch review with `changes-requested` plus `- None.`, omitted Blocking content, and a canonical blocking-finding control in both consumer test files.
  2. Tighten the shared pass close validation so verdict and Blocking semantics are bidirectionally consistent without adding consumer-specific branches.
  3. Run both focused suites and inspect context and finish-gate output to confirm invalid actionless passes are reported malformed rather than as routable changes requests.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → both consumers reject every actionless `changes-requested` form and preserve valid findings and approvals.
- Commit: `fix(scripts): require blocking review findings`

### Task 34: Use exact abandonment syntax in execution skills

- Depends on: Task 17
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-plan/SKILL.md`
    - `skills/hamilton-code/SKILL.md`
    - `tests/skills/execution-contracts.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-34/progress.md`
  - Deleted: none
- Acceptance:
  - Plan and code classify a task as abandoned only when its heading ends with the complete canonical `### Task N: <title> (abandoned — <reason>)` suffix with a nonempty reason, matching the shared parser's exact contract (requirements/execution.md — exact active task and canonical abandonment ownership).
  - A suffix that merely begins with `(abandoned`, uses a different dash or punctuation, lacks a reason, or carries trailing decoration remains active or malformed under the ordinary exact task rules; neither skill advertises or interprets a broad starts-with alternate grammar.
  - Skill contract tests require the exact canonical suffix in both producers and explicitly prove that malformed abandonment markers are not excluded as abandoned.
- Steps:
  1. Replace the broad literal-marker assertions with failing exact-suffix and malformed-marker-active assertions for both plan re-plan behavior and code task resolution.
  2. Update only the two producer contracts to name the complete canonical suffix and its nonempty-reason boundary, preserving abandoned history and stable task-id rules.
  3. Run the focused execution contract suite and search both skills for starts-with or literal-prefix abandonment language.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts && ! rg -n 'begins with the literal|suffix begins with|canonical literal' skills/hamilton-plan/SKILL.md skills/hamilton-code/SKILL.md` → the producer contracts and regression tests enforce only exact canonical abandonment syntax.
- Commit: `fix(skills): require exact abandonment syntax`

### Task 35: Require located actionable Blocking findings

- Depends on: Task 33
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-35/progress.md`
  - Deleted: none
- Acceptance:
  - Every non-`None.` entry under a canonical `### Blocking` section begins with a location group containing at least one concrete file and location and continues with nonempty corrective prose; bare placeholders such as `- TBD.`, unlocated prose, empty or location-free brackets, a location without an action body, and unexpanded template placeholders make the physical pass malformed (requirements/review.md — Task feedback has task-owned verdict history; Whole-branch review has a change-owned verdict history).
  - The grammar retains valid single-location and existing multi-location findings, including optional priority text after the location group, while `### Suggestions` retains its existing canonical nonempty-list semantics and may contain ordinary prose without a location.
  - Change-context and precondition consume the same shared rule for both task feedback and whole-branch review, so neither exposes or routes a placeholder `changes-requested` pass as valid and neither falls back to an earlier pass.
- Steps:
  1. Add failing task-feedback and whole-review matrices in both consumer suites for `- TBD.`, ordinary unlocated prose, empty or location-free brackets, location-only entries, and retained template placeholders, plus valid single-location, multi-location, priority-prefixed, and unlocated-Suggestion controls.
  2. Tighten only the shared verdict parser's Blocking-entry validation so structural location and nonempty action content are mandatory without imposing that rule on Suggestions or adding consumer-specific parsing.
  3. Run both focused consumer suites, invoke the shared parser against representative valid and invalid passes, and inspect physical-last-pass failure output.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → both consumers reject unlocated or non-actionable Blocking entries and preserve canonical located findings and ordinary Suggestions.
- Commit: `fix(scripts): require located blocking findings`

### Task 36: Report only committed task approval state

- Depends on: Task 23, Task 35
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-change-context.sh`
    - `tests/scripts/change-context.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-36/progress.md`
  - Deleted: none
- Acceptance:
  - Change-context reports a task feedback verdict as durable only when the feedback path exists in current `HEAD`, the worktree bytes equal the committed blob, the index has no divergence for that path, and the latest commit that touched the feedback path is an artifact-only commit containing no other path (requirements/review.md — Task feedback has task-owned verdict history).
  - A valid approval written but not committed, ignored and recreated after removal from the index, modified after its commit, staged-only, or last committed with another path is reported explicitly as uncommitted rather than `approved (fresh)`; malformed committed history and stale committed history retain their distinct existing states.
  - A valid artifact-only feedback commit remains fresh after unrelated later commits, preserving the ordinary feedback-before-next-checkpoint sequence without requiring the feedback commit to remain the repository tip.
- Steps:
  1. Add failing temporary-repository fixtures for interrupted-before-commit approval, ignored untracked recreation, worktree and staged divergence, a mixed-path feedback commit, a valid artifact-only commit, and unrelated later commits.
  2. Add an exact target-repository committed-artifact check before task verdict parsing and freshness calculation, and classify non-durable present feedback separately without changing whole-review or task-implementation freshness rules.
  3. Run the focused context suite and inspect summaries for absent, uncommitted, malformed, stale, and fresh-approved feedback.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts` → only exact artifact-only feedback committed in the change repository can be reported as a fresh approval.
- Commit: `fix(scripts): require durable task feedback state`

### Task 37: Gate advancement on durable task approval

- Depends on: Task 28, Task 36
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-orchestrate/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `tests/skills/orchestrate-contract.test.ts`
    - `tests/skills/review-contract.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-37/progress.md`
  - Deleted: none
- Acceptance:
  - Orchestration treats a task approval as consumable only when its feedback file is tracked and unchanged at current `HEAD`, its latest touching commit contains only that task's feedback path, and its physical last pass is valid, approved, blocking-free, and fresh; worktree-only or mixed-commit approval routes back to code feedback and cannot authorize the next task checkpoint (requirements/review.md — Orchestration runs both review contracts in order; Task feedback has task-owned verdict history).
  - The orchestrator rechecks that durable predicate when loading state, immediately after feedback handoff, before selecting the next task, and before entering the whole-branch matrix; transient subagent output or parseable worktree text never substitutes for the artifact-only commit.
  - Direct `hamilton-review` preflight requires every active task to be `done` with the same exact committed, artifact-only, valid, approved, blocking-free, fresh task feedback before branch inspection or review mutation; interrupted-before-feedback-commit state stops without writing root `review.md` (requirements/review.md — Whole-branch review is a distinct pipeline gate).
- Steps:
  1. Add failing orchestration contract assertions for an explicit uncommitted feedback state, repeated durable-evidence checks at every advancement boundary, and prohibition on recording a next checkpoint before the artifact-only commit; add direct-review preflight assertions for interrupted, mixed-commit, stale, unapproved, and durable approved feedback.
  2. Tighten the task resume matrix, load/confirmation/advancement process, and whole-review generation preflight around one stated durable approval predicate while preserving absent, malformed, stale, `changes-requested`, and unresolved-evidence routing.
  3. Run both focused skill suites and read the revised resume and preflight sections end to end to confirm that no path consumes uncommitted approval text.
- Verify: `bun --bun vitest run tests/skills/orchestrate-contract.test.ts tests/skills/review-contract.test.ts` → orchestration and direct whole-branch review require a durable artifact-only task approval before advancement.
- Commit: `fix(skills): consume only durable task approval`

### Task 38: Distinguish template placeholders from concrete literals

- Depends on: Task 35
- Files:
  - Created: none
  - Modified:
    - `bundle/scripts/hamilton-artifact-contracts.sh`
    - `tests/scripts/change-context.test.ts`
    - `tests/scripts/precondition-check.test.ts`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
    - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-38/progress.md`
  - Deleted: none
- Acceptance:
  - The shared Blocking-finding grammar rejects actual unexpanded finding-template fields in their structural positions, including `<file>`, `<loc>`, `<what is wrong>`, `<what to change>`, `<criterion / standard>`, and `<optional improvement>`, while retaining the existing requirements for at least one concrete `file:location` owner and nonempty actionable prose (requirements/review.md — task-feedback and whole-branch verdict histories).
  - A located actionable finding may quote legitimate concrete code or documentation literals such as `<title>`, `<date>`, and `<reason>` without becoming malformed; placeholder rejection is based on the installed verdict-template field vocabulary rather than a blanket ban on angle-bracket text in the action body.
  - Both change-context and precondition regressions reject the unexpanded location/action placeholders for task feedback and whole-branch review, accept concrete angle-bracket literals in otherwise canonical Blocking prose, and prove that the preserved whole-review Pass 1 history and the current multi-pass `review.md` parse as valid history rather than malformed without editing either review artifact or falling back to an earlier pass.
- Steps:
  1. Extend both consumer suites with failing task-feedback and whole-review matrix cases for every retained finding-template field, valid located actions quoting `<title>`, `<date>`, and `<reason>`, and regression fixtures exercising the preserved Pass 1 and current root review history; assert that invalid placeholders are malformed and valid historical prose reaches the ordinary verdict/freshness result instead.
  2. Replace the shared parser's blanket angle-bracket rejection in action prose with exact detection of the unexpanded fields defined by the installed feedback and review templates, while retaining strict concrete location validation and every existing action, priority, list, identity, numbering, verdict, and physical-last-pass rule.
  3. Run both focused consumer suites, invoke the shared parser against the preserved Pass 1 and current root review artifacts, and inspect context/precondition output to confirm neither consumer reports valid historical prose as malformed.
- Verify: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts && bash -c 'source bundle/scripts/hamilton-artifact-contracts.sh; heading="Whole-branch Review: $(hamilton_plan_title .hamilton/changes/2026-09-04-split-hamilton-review/plan.md)"; hamilton_latest_verdict_pass .hamilton/changes/2026-09-04-split-hamilton-review/review.md "$heading" >/dev/null'` → both consumers distinguish real template placeholders from concrete literals and the preserved current whole-review history is canonical.
- Commit: `fix(scripts): distinguish review placeholders`

## Done when

- All thirty-eight active task rows in root `progress.md` read `done`, and each linked task progress file's physical latest canonical attempt reads `Outcome: done`.
- Every task's physical latest feedback pass is valid, committed, `approved`, free of blocking items, and fresh for that task's latest progress commit.
- Task 1 and Task 4 feedback is refreshed after their approved forward normalization; Task 4, Task 5, Task 11, and Task 14 feedback histories retain every pass but no installed-template instruction block; every new task feedback commit precedes the next task checkpoint.
- Root `review.md` has a committed physical latest whole-branch pass that is valid, `approved`, free of blocking findings, and fresh for the latest material change commit.
- `bun --bun vitest run` passes and `bun run build` succeeds.
- `git diff --check` is clean; no self-authenticating whole-review identity, actionless or unlocated `changes-requested` verdict, actual unexpanded finding-template placeholder, blanket action-literal rejection, broad abandonment prefix, generic legacy attempt fallback, broad task-owner material glob, caller-CWD Git gate, uncommitted task approval consumption, duplicated producer shape, unsafe verdict commit, tracked `.hamilton/templates/` path, shared change-level `.base`, task-scoped `hamilton-review`, shared reviewer prompt, duplicate implementer report file, mixed root-progress history, or ownerless final fix wave remains in live sources.
- `hamilton-finish-work` folds `execution`, `review`, `artifact-templates`, and `framework-docs` deltas into canonical specs and records the verified finish strategy in `finish.md`.
