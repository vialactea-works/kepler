---
artifact: plan
change: 2026-09-22-fix-skill-artifact-linting
status: approved
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
route_unit: null
---

# Plan: Make Hamilton Artifact Authoring Lint-Valid

## Overview

- Change: `.hamilton/changes/2026-09-22-fix-skill-artifact-linting/`
- Route unit: none; `route_unit` is `null`.
- Goal: Align workbench lint with legitimate pending task and finish lifecycle states, make planning initialize complete lint-valid artifacts, and require scoped lint after every mutation of a recognized Hamilton artifact.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes: `src/workbench/artifact-body.ts` owns structural body validation; focused coverage lives in `tests/workbench/` and skill contracts in `tests/skills/`. Hamilton skills are standalone instructions, so each artifact writer needs its own scoped lint boundary. Preserve the approved design and existing artifact ownership in `design.md`.
- Quality notes: the task boundaries follow the validator, planning scaffold, change-artifact writers, canonical/Wayfinder writers, and documentation/specs. The first review remediations are separate: Task 6 fixes finish-history validation, while Task 7 fixes proposal artifact attribution and template guidance. The second review remediations keep ledger synchronization, remaining template guidance, and mapped framework documentation in separate independently testable tasks. Task 13 isolates progress-ledger ordering from contiguous plan-ledger validation and covers the abandoned-middle case through focused artifact-contract and scoped-lint tests without introducing a structural exception.
- First review-driven amendment: the committed whole-branch review at `a399fee` requested changes because lint rejects a first pending finish intent and `hamilton-propose` does not bind requirements and design authors to configured Git identity. Tasks 6 and 7 were appended without revising the approved requirements/design or frozen Tasks 1–5.
- Second review-driven amendment: the committed whole-branch Review Pass 2 at `38128d5` requests three implementation/documentation repairs: synchronize task metadata with root rows so finish can open, remove agent-author guidance from the remaining templates, and update the mapped framework documentation. Append Tasks 8–10 without revising approved requirements/design or frozen Tasks 1–7. During this re-plan, repair only the seven stale root frontmatter statuses to match their existing `done` rows; initialize Tasks 8–10 as pending in both representations without touching task histories.
- Third review-driven amendment: the fresh whole-branch Review Pass 3 committed at `9d93d49ba6ecccc371c3995721f6144c95f7049e` requests two independent implementation/documentation repairs: code must finalize the assigned task-local frontmatter status with its done or blocked attempt, and re-plan must synchronize a renamed non-done title across the plan heading, root metadata, escaped table row, and task-local heading. Append Tasks 11 and 12; the approved requirements and design remain valid, and frozen Tasks 1–10, their ledger entries, feedback, and histories remain unchanged. The two tasks share a skill-contract test file and mapped skills reference, but own different skill sections and test assertions; serial execution avoids overlapping edits.
- Fourth review-driven amendment: the fresh committed whole-branch Review Pass 4 at `87a4ca990d816aabb0805c9c47be8b1218ede485` requests one validator/test repair because full change-directory lint rejects a compliant re-plan whose active progress rows skip an abandoned middle task id. Append Task 13 without revising approved requirements/design or frozen Tasks 1–12, preserving contiguous plan-heading records and strict progress-row ordering while allowing abandoned-id gaps.

## Tasks

### Task 1: Accept legitimate pending artifact states

- Depends on: none
- Files:
  - Created: none
  - Modified:
    - `src/workbench/artifact-body.ts`
    - `tests/workbench/artifact-contracts.test.ts`
    - `tests/workbench/context.test.ts`
    - `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - A structurally valid `task-progress` artifact with `status: pending`, the matching task identity, and no attempts passes validation; the same empty body with `in-progress`, `blocked`, or `done` status fails. See `requirements/workbench.md`, “Lint accepts a pristine pending task log.”
  - A finish history with correctly paired ordered attempts and outcomes may end in exactly one unmatched final Attempt only when both `status` and `result` are `pending`. Unmatched outcomes, malformed or non-contiguous records, mispaired or out-of-order history, and an unmatched attempt with non-pending metadata remain invalid. See `requirements/workbench.md`, “Lint accepts a persisted finish intent awaiting its outcome.”
  - Scoped lint exercises the accepted and rejected states without relaxing unrelated artifact contracts, and `hamilton workbench context` classifies a planned change with an empty pending task log as `split` rather than `invalid`.
- Steps:
  1. Add failing artifact-contract and scoped-lint tests for an empty pending task log, its non-pending neighbors, a pending finish intent after valid paired history, and malformed finish-history neighbors.
  2. Update the existing body validator to make the two exceptions depend on the exact artifact lifecycle metadata and to retain strict finish record pairing and ordering.
  3. Run the focused workbench tests and resolve any regression without changing task or finish ownership.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/context.test.ts tests/workbench/lint.test.ts` → all tests pass.
- Commit: `fix: accept legitimate pending artifact states`

### Task 2: Initialize lint-valid planning artifacts

- Depends on: Task 1
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-plan/SKILL.md`
    - `tests/skills/execution-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - Planning instructions populate `plan.md`, root `progress.md`, and each active `tasks/task-N/progress.md` with the complete required metadata and matching identities. Root task frontmatter and Markdown rows come from the same ordered task list, with exact links and escaped display titles; task logs use the exact task heading and remain attempt-free with `status: pending`. See `requirements/execution.md`, “Initialize task execution artifacts in a lint-valid state.”
  - A new plan's `author` uses both configured repository values from `git config user.name` and `git config user.email`; replanning preserves existing authorship. Missing identity values are never replaced with an agent name or placeholder.
  - The skill runs `hamilton workbench lint --change-dir <change-dir>` after completing the scaffold and resolves findings before handoff. A map-aware route or map mutation is linted with `--file` after its own write.
- Steps:
  1. Add failing skill-contract assertions for required plan/root/task metadata, exact task headings, empty pending histories, Git author attribution, re-plan preservation, and post-scaffold lint ordering.
  2. Update `hamilton-plan` to instantiate all three templates with concrete values, preserve stable task identities and existing attribution, and run lint at the valid mutation boundary without inventing attempts.
  3. Run the focused skill tests, then build the CLI and lint this complete change directory using the built CLI.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts && bun run build && bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` → tests pass and lint exits `0`.
- Commit: `fix: initialize lint-valid plan artifacts`

### Task 3: Gate change-scoped artifact writers with lint

- Depends on: Task 1
- Files:
  - Created:
    - `tests/skills/change-artifact-lint-contract.test.ts`
  - Modified:
    - `skills/hamilton-propose/SKILL.md`
    - `skills/hamilton-code/SKILL.md`
    - `skills/hamilton-code-feedback/SKILL.md`
    - `skills/hamilton-critique/SKILL.md`
    - `skills/hamilton-review/SKILL.md`
    - `skills/hamilton-finish-work/SKILL.md`
    - `tests/skills/workbench-contract.test.ts`
  - Deleted: none
- Acceptance:
  - Every listed skill runs lint after each valid mutation of a recognized artifact and treats findings as a gate, not a bypass. Complete change trees use `--change-dir`; single owned histories and canonical specs, route, or map artifacts use `--file` at the mutation boundary. Lint does not replace the skills' existing semantic, freshness, ancestry, or completion gates. See `requirements/execution.md`, “Lint after recognized artifact mutations.”
  - New author-bearing proposal artifacts use the configured Git name and email; revisions preserve existing attribution. Finish-work preserves author metadata when synchronizing an existing canonical spec.
  - Tests verify writer coverage, selector scope, and that lint follows mutation and precedes handoff or commit.
- Steps:
  1. Add failing contract tests for each change-scoped writer's recognized outputs, correct selector, post-write timing, nonzero handling, and applicable author-preservation behavior.
  2. Update the six skills at their owning mutation boundaries; do not lint unrelated code, docs, or other unrecognized outputs.
  3. Run the focused skill-contract tests and correct any scope or ordering failures.
- Verify: `bun --bun vitest run tests/skills/change-artifact-lint-contract.test.ts tests/skills/workbench-contract.test.ts tests/skills/finish-work-contract.test.ts` → all tests pass.
- Commit: `docs: lint change artifact mutations`

### Task 4: Gate canonical and Wayfinder artifact writers with lint

- Depends on: Task 1
- Files:
  - Created:
    - `tests/skills/canonical-artifact-lint-contract.test.ts`
  - Modified:
    - `skills/hamilton-compose-spec/SKILL.md`
    - `skills/hamilton-wayfinder/SKILL.md`
    - `skills/hamilton-wayfinder-domain-modeling/SKILL.md`
    - `skills/hamilton-wayfinder-research/SKILL.md`
    - `skills/hamilton-wayfinder-prototype/SKILL.md`
    - `skills/hamilton-grilling/SKILL.md`
  - Deleted: none
- Acceptance:
  - Each listed skill runs `hamilton workbench lint --file <file>` after creating or editing a recognized canonical spec, map, route, or ticket, and resolves findings before handoff. Conditional ticket edits are linted when they occur. Research notes and throwaway prototype files are not linted unless a recognized ticket is also mutated. See `requirements/execution.md`, “Lint after recognized artifact mutations,” and `requirements/framework-docs.md`.
  - Newly created author-bearing canonical specs use configured `git config user.name` and `git config user.email`; edits preserve the recorded author. Missing identity is handled without inventing attribution.
  - Tests cover every recognized-artifact writer and distinguish recognized outputs from unrelated research and prototype files.
- Steps:
  1. Add failing skill-contract tests that map each writer to its recognized outputs and verify its file-scoped lint boundary, timing, and applicable author handling.
  2. Update the six skills so ticket answer/pointer writes and map, route, and canonical-spec mutations are linted, while unrelated notes and throwaway code remain outside lint scope.
  3. Run the focused canonical/Wayfinder skill-contract tests and resolve findings.
- Verify: `bun --bun vitest run tests/skills/canonical-artifact-lint-contract.test.ts` → all tests pass.
- Commit: `docs: lint canonical and Wayfinder artifact mutations`

### Task 5: Synchronize the artifact and framework documentation

- Depends on: Tasks 2, 3, and 4
- Files:
  - Created: none
  - Modified:
    - `.hamilton/specs/artifact-templates.md`
    - `.hamilton/specs/execution.md`
    - `.hamilton/specs/framework-docs.md`
    - `.hamilton/specs/workbench.md`
    - `docs/skills.md`
  - Deleted: none
- Acceptance:
  - The canonical specs describe configured Git attribution and preservation, lint-valid planning initialization, the two precise pending states, and the scoped post-mutation lint gate without broadening it to unrelated outputs. Existing author metadata is preserved.
  - The skills reference explains when artifact-writing skills use `--file` versus `--change-dir`, how they handle findings, and why a new pending task log has no synthetic attempt. See `requirements/framework-docs.md`, “Document artifact linting at authoring boundaries.”
  - Updated canonical specs pass their individual workbench lint checks; documentation accurately reflects the implemented skill behavior.
- Steps:
  1. Update the four canonical specs from the approved requirements while preserving each existing author and avoiding implementation details in the prose.
  2. Update the Workbench section of `docs/skills.md` to explain selectors, artifact-writer timing, and the valid empty pending task-log state.
  3. Lint each changed canonical spec with `hamilton workbench lint --file <spec-path>`, read back the changed documentation, inspect the final diff, and run the repository build and full test suite.
- Verify: `bun run build && bun run test && hamilton workbench lint --file .hamilton/specs/artifact-templates.md && hamilton workbench lint --file .hamilton/specs/execution.md && hamilton workbench lint --file .hamilton/specs/framework-docs.md && hamilton workbench lint --file .hamilton/specs/workbench.md && git diff --check` → build and tests pass, every spec lint exits `0`, and diff check is clean.
- Commit: `docs: document artifact lint gate`

### Task 6: Accept the first pending finish intent

- Depends on: Task 1
- Files:
  - Created: none
  - Modified:
    - `src/workbench/artifact-body.ts`
    - `tests/workbench/artifact-contracts.test.ts`
    - `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - A finish artifact with `status: pending` and `result: pending` and a complete, physically final `Attempt 1` with no `Outcome 1` passes `hamilton workbench lint --file <finish.md>`; a valid contiguous history of paired attempts and outcomes may likewise end in one complete pending Attempt N without an Outcome. See `requirements/workbench.md`, “Lint accepts a persisted finish intent awaiting its outcome,” scenario “Lint a newly committed finish intent,” and `design.md`, “Align lint with precise legitimate lifecycle states.”
  - The accepted pending attempt has the template-defined intent fields (`Passed preconditions`, `Specification synchronization`, `Strategy`, `Intended workspace result`, `Route intent`) filled with actual values. Do not relax finish-history validation for an empty or malformed attempt, absent Outcome in completed/blocked histories, non-pending status or result, an unmatched Outcome, duplicate or non-contiguous numbering, or an unmatched attempt followed by a later record. Completed histories remain strictly paired, and existing task-progress handling is unchanged. See the requirement's “Reject invalid finish history” scenario.
  - The file-scoped lint test writes an actual first pending finish artifact and verifies exit `0`, alongside invalid adjacent states returning nonzero; existing later-intent and paired-history tests continue to pass.
- Steps:
  1. Add failing focused body-contract and real temporary-file `lintScope({ file })` tests for complete first pending Attempt 1, including positive later pending and completed paired cases and negative metadata, missing-field, missing-outcome, numbering, and physical-order neighbors. Include an explicit file-scoped first-intent regression asserting success.
  2. Narrowly adjust `src/workbench/artifact-body.ts` so the generic finish workflow does not require an Outcome for exactly one complete pending last Attempt, including Attempt 1; update the pairing check to permit that case without dropping the contiguous-numbering, physical-order, or completed-history checks. Do not change other artifact validators or fabricate an Outcome.
  3. Run the focused body-contract and scoped-lint tests; resolve failures while preserving existing legitimate later pending attempts and all completed-history rejections.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts` → all tests pass, including the first pending finish-intent `--file` regression and rejection neighbors.
- Commit: `fix: accept first pending finish intent`

### Task 7: Attribute every proposed artifact to Git identity

- Depends on: Task 3
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-propose/SKILL.md`
    - `bundle/templates/proposal.md`
    - `bundle/templates/requirements-change.md`
    - `bundle/templates/design.md`
    - `tests/skills/change-artifact-lint-contract.test.ts`
    - `tests/templates/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - `hamilton-propose` reads effective repository `git config user.name` and `git config user.email` before creating any new proposal, requirements change, or design artifact, writes each new `author` as `Name <email>` using both values, and blocks or asks for either missing value without inventing an agent or placeholder author. The rule applies to each artifact even if the proposal already exists. See `requirements/artifact-templates.md`, “Populate artifact authors from configured Git identity,” scenarios “Create an author-bearing artifact” and “Git identity is incomplete,” and `design.md`, “Populate author metadata from the repository Git identity.”
  - Editing an existing proposal, requirement, or design preserves that artifact's recorded `author` exactly unless explicitly directed otherwise. The three bundled templates instruct authors to use configured Git name and email rather than suggesting `name or agent`; retain their disposable instruction-block pattern. See the requirement's “Revise an existing artifact” scenario.
  - Focused skill-contract tests assert creation, missing-identity handling, and revision-preservation guidance independently for proposal, requirements, and design, while template-contract tests assert all three author hints and reject agent guidance. The existing post-write scoped lint gate remains in place for all outputs.
- Steps:
  1. Add failing assertions in `tests/skills/change-artifact-lint-contract.test.ts` for all three output creation paths, missing either Git value, and per-artifact author preservation on revisions; add failing `tests/templates/artifact-contracts.test.ts` checks for proposal, requirements-change, and design guidance.
  2. Update `hamilton-propose` to obtain the effective repository identity for every newly created author-bearing output, including creation after an existing proposal, and to stop on either missing value; preserve recorded authors on edits. Replace `author: <name or agent>` in each of the three templates with a Git-identity hint in `Name <email>` form, without modifying artifact schema or lint scope.
  3. Run the focused skill and template contract tests; fix wording or test failures without changing proposal, requirements, or design artifacts for this change.
- Verify: `bun --bun vitest run tests/skills/change-artifact-lint-contract.test.ts tests/templates/artifact-contracts.test.ts` → all tests pass and each of the three output contracts is covered.
- Commit: `docs: attribute proposal artifacts to Git identity`

### Task 8: Synchronize task ledger metadata through execution

- Depends on: Task 2
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-code/SKILL.md`
    - `skills/hamilton-plan/SKILL.md`
    - `.hamilton/specs/execution.md`
    - `tests/skills/execution-contracts.test.ts`
    - `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - The root `progress.md` frontmatter `tasks` entry and Markdown row for each active task agree on numeric id, exact title, status, and `tasks/task-N/progress.md` link. Starting an attempt changes only its assigned entry and row together to `in-progress`; finalizing a done or blocked attempt changes both together to the outcome, preserving siblings and history. Re-plan retains the matching metadata and row for frozen done tasks and existing non-done tasks, and adds new matching pending entries and rows. See `requirements/execution.md`, “Initialize task execution artifacts in a lint-valid state,” matching task status, and `design.md`, “Instantiate every planning template as a live artifact.”
  - Retain the existing `src/workbench/precondition-artifacts.ts` gate unchanged: a committed all-done ledger with matching metadata, rows, task evidence, and reviews opens; a metadata status mismatch closes the gate even when scoped lint accepts the file. Cover both using the real precondition test fixture, with the mismatch committed so clean-tree failure cannot mask the ledger check. A pending/blocked task still prevents finish.
  - Update `.hamilton/specs/execution.md` to describe the mirrored root metadata/table status and transition invariant without changing its existing `author`; skill-contract tests cover both code transitions and re-plan preservation. This change's repaired completed metadata remains in agreement with its frozen rows.
- Steps:
  1. Add failing assertions in `tests/skills/execution-contracts.test.ts` for paired frontmatter/table transitions at begin/finalize and re-plan retention of existing statuses; in `tests/workbench/precondition.test.ts`, use a committed mismatched metadata fixture and a committed synchronized all-done fixture to assert closed and open gates respectively, including the ledger diagnostic.
  2. Update `hamilton-code` to change the assigned root metadata entry and row together at `in-progress` and final `done`/`blocked` transitions, leaving siblings and the finish precondition untouched. Update `hamilton-plan` so re-plan carries forward each surviving task's actual root-row status in both representations and initializes new entries and rows as pending; preserve frozen rows and attempts. State the matching metadata/table contract at capability altitude in `.hamilton/specs/execution.md`, retaining its author.
  3. Run the focused skill and precondition tests, lint the changed canonical spec with the built workbench, and confirm the gate still rejects contradictory ledgers and accepts synchronized complete ones.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/workbench/precondition.test.ts && bun run build && bun dist/cli/main.js workbench lint --file .hamilton/specs/execution.md` → tests, build, and spec lint pass; the focused gate regressions exercise both outcomes.
- Commit: `fix: synchronize task ledger metadata and rows`

### Task 9: Correct remaining author-bearing template guidance

- Depends on: Task 7
- Files:
  - Created: none
  - Modified:
    - `bundle/templates/plan.md`
    - `bundle/templates/requirements-spec.md`
    - `bundle/templates/proposal.md`
    - `bundle/templates/requirements-change.md`
    - `bundle/templates/design.md`
    - `tests/templates/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - Plan and canonical requirements-spec templates guide creators to read effective `git config user.name` and `git config user.email` and fill `author: Name <email>` using both values; if either is missing, ask or stop rather than infer an agent name or placeholder. All five author-bearing templates explicitly preserve recorded author metadata on edits and handle incomplete Git identity. Keep their disposable instruction blocks and existing template structures. See `requirements/artifact-templates.md`, “Populate artifact authors from configured Git identity,” all three scenarios, and `design.md`, “Populate author metadata from the repository Git identity.”
  - Template-contract coverage checks all five author-bearing templates (`proposal.md`, `requirements-change.md`, `design.md`, `plan.md`, `requirements-spec.md`) for both Git values, angle-bracketed email, missing-identity handling, preservation on edits, and absence of agent-author hints. The existing `hamilton-plan` and `hamilton-compose-spec` Git-author instructions remain unchanged.
- Steps:
  1. Extend `tests/templates/artifact-contracts.test.ts` to fail for the two remaining templates and assert the common five-template author contract, including missing-identity and author-preservation guidance.
  2. Replace the outdated author hints in `bundle/templates/plan.md` and `bundle/templates/requirements-spec.md`; add concise missing-identity and edit-preservation guidance inside the disposable instruction blocks of all five templates (the earlier three already cover configured Git creation). Do not modify skills or artifact schemas.
  3. Run the focused template tests, inspect the five changed templates for stale agent hints, and verify that the guidance remains inside removable instruction blocks.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts` → all author-template assertions pass, including the negative agent-guidance check.
- Commit: `docs: correct plan and spec template authorship guidance`

### Task 10: Document artifact attribution and scoped lint in the SDD framework

- Depends on: Tasks 5 and 9
- Files:
  - Created: none
  - Modified:
    - `docs/sdd-framework.md`
    - `tests/docs/workbench-docs.test.ts`
  - Deleted: none
- Acceptance:
  - The mapped `docs/sdd-framework.md` template/lifecycle sections explain `Name <email>` from effective Git `user.name` and `user.email` for newly created author-bearing artifacts, preservation of each existing artifact's recorded author on edits, and asking or stopping when either configured value is missing rather than substituting an agent. See `CONTRIBUTING.md`, “Mapping Code to Docs,” `requirements/artifact-templates.md`, “Populate artifact authors from configured Git identity,” and `requirements/framework-docs.md`, “Document artifact linting at authoring boundaries.”
  - Framework guidance describes post-mutation `hamilton workbench lint --change-dir <change-dir>` for completed change trees and `--file <file>` for a single recognized artifact, with findings resolved before handoff or commit; unrelated files are outside scope, and a fresh pending task log needs no invented attempt. Tests assert these facts in `docs/sdd-framework.md` itself, not merely in combined documentation or `docs/skills.md`.
- Steps:
  1. Add failing document-specific assertions in `tests/docs/workbench-docs.test.ts` for Git author source/format, missing identity, revision preservation, both lint selectors, recognized-artifact scope, post-mutation ordering, and empty pending task-log guidance.
  2. Update only the template and lifecycle guidance in `docs/sdd-framework.md` to match implemented skill/template behavior and `CONTRIBUTING.md`'s mapping; avoid presenting lint as a substitute for semantic gates.
  3. Run the focused documentation tests, read back the edited framework sections, and inspect the scoped diff for consistency with `docs/skills.md` and the installed templates.
- Verify: `bun --bun vitest run tests/docs/workbench-docs.test.ts && git diff --check` → documentation assertions pass and diff check is clean.
- Commit: `docs: explain template attribution and artifact lint lifecycle`

### Task 11: Finalize task-local progress status with the attempt

- Depends on: Tasks 3, 5, and 8
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-code/SKILL.md`
    - `tests/skills/execution-contracts.test.ts` (code lifecycle contract assertions only)
    - `.hamilton/specs/execution.md`
    - `docs/skills.md` (code task-progress lifecycle guidance only)
  - Deleted: none
- Acceptance:
  - Code's finalization instructions append one complete assigned attempt and set that task-local `progress.md` frontmatter `status` to its matching `done` or `blocked` outcome before the post-mutation lint and outcome-specific commit, together with the assigned root metadata entry and row. Preserve the matching task identity, prior attempts, and every sibling file. The existing finish gate in `src/workbench/precondition-artifacts.ts` is unchanged: a done row and attempt with local `status: pending` still fail. See `requirements/execution.md`, “Initialize task execution artifacts in a lint-valid state,” and `design.md`, “Instantiate every planning template as a live artifact.”
  - A new attempt-free task log remains `status: pending` during planning and while code has only changed its root entry/row to `in-progress`; do not set its local status to `in-progress` before an attempt exists. The already covered pending/blocked-vs-done precondition cases remain intact; a finalized blocked attempt has local `status: blocked`, not `done` or `pending`.
  - A focused skill-contract assertion tests both done and blocked local finalization, the absence of premature local `in-progress`, and preservation of siblings; the canonical execution spec states the local status lifecycle at capability altitude while preserving its existing author, and the mapped skills reference reflects the new instruction.
- Steps:
  1. Add failing assertions to the code contract in `tests/skills/execution-contracts.test.ts` for assigned task-local frontmatter finalization to either outcome before lint/commit, no pre-attempt local `in-progress`, and sibling preservation; retain its existing root status assertions.
  2. Update only the begin/finalize and relevant lifecycle guidance in `skills/hamilton-code/SKILL.md`: at begin move the assigned root metadata and row but leave an empty local log pending; at finalization append the attempt, set the assigned local status to its outcome, then synchronize the assigned root metadata and row before lint and commit. Do not rewrite prior attempts, sibling files, or the workbench gate.
  3. State the same pending-before-first-attempt and done/blocked-after-finalization status contract in `.hamilton/specs/execution.md` without changing its author; update the code entry in `docs/skills.md`, run focused tests and spec lint, and inspect the diff for scope and lifecycle consistency.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/workbench/precondition.test.ts && bun dist/cli/main.js workbench lint --file .hamilton/specs/execution.md` → contract and existing gate regressions pass and the canonical spec lints cleanly.
- Commit: `fix: finalize task-local progress status with outcomes`

### Task 12: Synchronize renamed task titles across re-plan artifacts

- Depends on: Tasks 2 and 8
- Files:
  - Created: none
  - Modified:
    - `skills/hamilton-plan/SKILL.md`
    - `tests/skills/execution-contracts.test.ts` (re-plan rename contract assertions only)
    - `tests/workbench/precondition.test.ts`
    - `docs/skills.md` (plan re-plan guidance only)
  - Deleted: none
- Acceptance:
  - Re-planning a renamed non-done task writes the exact new unescaped title in its active `plan.md` task heading, its assigned root `progress.md` frontmatter `tasks[].title`, and its task-progress heading; the root table displays the same title with correct Markdown escaping, including `|` delimiters. Preserve numeric id, current status in both root representations, exact path/link, other tasks, and every append-only attempt; do not rename or otherwise alter frozen done tasks. See `requirements/execution.md`, “Initialize task execution artifacts in a lint-valid state,” scenarios “Planning initializes active tasks” and “Task display title contains a table delimiter,” and `design.md`, “Instantiate every planning template as a live artifact.”
  - A skill-contract regression asserts all four renamed representations and preserved identity/status/history rather than merely checking status retention. A committed precondition fixture with the plan heading, row, task-local heading, and metadata all synchronized opens the finish gate once task evidence is done; an otherwise identical committed fixture with a stale metadata title fails with the metadata-ledger diagnostic, not a dirty-tree error. Keep the existing precondition implementation unchanged.
  - The plan entry in the mapped skills reference describes synchronized non-done renames, and the re-plan skill's lint boundary remains `--change-dir <change-dir>` after the complete artifact amendment.
- Steps:
  1. Add failing re-plan assertions in `tests/skills/execution-contracts.test.ts` for exact unescaped metadata and headings, escaped table title, stable status/id/path and attempts, and frozen done tasks; add committed synchronized-rename and stale-metadata-title cases in `tests/workbench/precondition.test.ts` using its existing fixture and freshness pattern, verifying clean-tree and exact ledger diagnostics.
  2. Change only the renamed non-done task guidance in `skills/hamilton-plan/SKILL.md` so the assigned root metadata title, table display, plan heading, and task-local heading transition together; retain the existing id, link, status, and append-only evidence and leave done tasks byte-for-byte unchanged. Keep the full change-dir lint after the amendment.
  3. Update the re-plan entry in `docs/skills.md`, run the focused tests and full change lint, and inspect the diff to confirm no execution history, workbench consumer, or approved design/requirements were changed.
- Verify: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/workbench/precondition.test.ts && bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` → rename contract and both precondition outcomes pass and the complete change lints cleanly.
- Commit: `fix: synchronize re-planned task titles`

### Task 13: Permit abandoned-task gaps in progress ledgers

- Depends on: Tasks 1–12
- Files:
  - Created: none
  - Modified:
    - `src/workbench/artifact-body.ts`
    - `tests/workbench/artifact-contracts.test.ts`
    - `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - A progress ledger with active rows `Task 1` and `Task 3` passes body validation and scoped lint when the missing `Task 2` is an abandoned, removed row; progress ids remain positive, unique, strictly increasing, and retain their exact task identities, statuses, and `[details](tasks/task-N/progress.md)` links. The plan ledger continues to require contiguous task-heading records, so an abandoned plan heading preserves plan-order numbering while the active root table may have a gap. See `requirements/execution.md`, the re-plan abandonment/id-preservation contract in `skills/hamilton-plan/SKILL.md`, and `design.md`, “Instantiate every planning template as a live artifact.”
  - Focused coverage proves the middle-gap case without weakening duplicate, descending, malformed, unescaped-title, path-mismatch, or metadata-ledger validation; matching root metadata/table records, task statuses, append-only histories, exact links, and all abandoned numeric ids remain governed by their existing checks.
  - No plan headings, task identities, task logs, attempts, feedback, checkpoints, approved requirements/design, or review history are changed by this remediation; the validator change is limited to progress-ledger ordering.
- Steps:
  1. Add a failing artifact-contract test for a contiguous plan ledger containing an abandoned middle heading and a progress ledger containing active `Task 1` and `Task 3` rows, plus focused scoped-lint coverage that expects the middle-gap artifact to exit `0` while the existing malformed, duplicate, descending, and path-mismatch neighbors still exit nonzero.
  2. Change only `readTaskLedger` in `src/workbench/artifact-body.ts` so `ledger: "plan"` retains one-based contiguous numbering, while `ledger: "progress"` requires each parsed active row id to be strictly greater than its predecessor and still parses every row with its original identity, status, title, and exact link contract.
  3. Run the focused workbench tests, build the CLI, lint the complete change directory, and inspect the diff to confirm that no metadata, precondition, task-history, or approved-artifact behavior was loosened.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts && bun run build && bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` → focused tests, build, and complete change-directory lint all pass with exit `0`.
- Commit: `fix: allow abandoned-task gaps in progress ledgers`

## Done when

- All tasks are implemented and their outcomes are recorded in `progress.md` and the linked task logs.
- `bun run test` passes and `bun run build` succeeds.
- The complete change directory and the changed canonical specs pass their scoped workbench lint checks.
- All review feedback has been addressed.
