---
artifact: review
change: 2026-09-22-fix-skill-artifact-linting
created: 2026-09-23
status: complete
decision: accepted
---

# Whole-branch Review: Make Hamilton Artifact Authoring Lint-Valid

## Pass 1 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 57dc3a3bd99ee481d5cda32bf693ec999bb290d3
Verdict: changes-requested

### Blocking

- [src/workbench/artifact-body.ts:376,465; skills/hamilton-finish-work/SKILL.md:252-257] A first pending finish intent contains only `Attempt 1`, but the generic workflow validator still requires an Outcome and the new pairing check only permits an unmatched attempt when the expected attempt number exceeds one. The required lint gate therefore rejects the first finish intent before it can be committed or executed. Permit precisely the complete, physically final pending `Attempt 1` as well as later pending attempts without requiring an Outcome, while retaining strict pairing for completed histories; add a scoped-lint regression test for the first intent. Focused in-memory `validateArtifactBody` verification returned `missing-section` and `invalid-record` for `status: pending`, `result: pending`, and `Attempt 1` alone. (violates: requirements/workbench.md, “Lint accepts a persisted finish intent awaiting its outcome”; design decision “Align lint with precise legitimate lifecycle states”)
- [skills/hamilton-propose/SKILL.md:153-184; bundle/templates/requirements-change.md:7; bundle/templates/design.md:6] The proposer obtains configured Git name and email only for a new proposal, then creates author-bearing requirements and design artifacts without requiring the same identity. Their installed templates still suggest an agent author, and lint accepts any nonempty author; these two outputs can therefore retain a placeholder or agent attribution while still passing the new lint gate. Require each new proposal, requirements, and design artifact to use the configured Git name and email in the required author format, block on missing values, preserve recorded authors on edits, replace misleading template guidance, and assert all three outputs in the skill contract tests. (violates: requirements/artifact-templates.md, “Populate artifact authors from configured Git identity”; design decision “Populate author metadata from the repository Git identity”)

### Suggestions

- None.

## Pass 2 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: f0a3d979dc4d6eadc1bbb35f2c082fd826afbbb3
Verdict: changes-requested

### Blocking

- [.hamilton/changes/2026-09-22-fix-skill-artifact-linting/progress.md:8-35; skills/hamilton-code/SKILL.md:102-125; src/workbench/precondition-artifacts.ts:174-200] Planning now creates a frontmatter `tasks` ledger, but code updates only the Markdown row during task transitions. All seven frontmatter entries still say `pending` while their rows say `done`; the unchanged finish precondition requires these statuses to agree and fails seven times, although file-scoped lint reports success. Synchronize each task's frontmatter status and row at every code transition, retain that agreement on re-plan, repair this change's ledger, and cover the integration with a finish-precondition test. (violates: requirements/execution.md, “Initialize task execution artifacts in a lint-valid state,” matching task status; design decision “Instantiate every planning template as a live artifact”)
- [bundle/templates/plan.md:6; bundle/templates/requirements-spec.md:6] These two unchanged, installed author-bearing templates still instruct authors to use a name or agent, despite the new Git-identity rules in `skills/hamilton-plan/SKILL.md:158-168` and `skills/hamilton-compose-spec/SKILL.md:92-101`. An author following either template can enter an agent name while lint accepts any nonempty string. Replace both hints with configured Git name and angle-bracketed email guidance, including missing-identity handling, and extend template coverage beyond the three proposal outputs. (violates: requirements/artifact-templates.md, “Populate artifact authors from configured Git identity”; design decision “Populate author metadata from the repository Git identity”)
- [docs/sdd-framework.md:184-238; bundle/templates/proposal.md:6; bundle/templates/requirements-change.md:7; bundle/templates/design.md:6] The three bundled templates changed their author contract, but the framework's artifact/template documentation was not updated. `CONTRIBUTING.md:13-22` explicitly maps every `bundle/templates/` change to `docs/sdd-framework.md` and requires documentation to reflect changed behavior. Update that document's template and lifecycle guidance for configured attribution and post-mutation scoped lint; the `docs/skills.md` update alone does not satisfy the repository's mapped documentation requirement. (violates: `CONTRIBUTING.md`, Documentation Conventions and Mapping Code to Docs; requirement framework-docs, “Document artifact linting at authoring boundaries”)

### Suggestions

- None.

## Pass 3 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 8e72175110a85e503db02711587821e9f3a39290
Verdict: changes-requested

### Blocking

- [skills/hamilton-code/SKILL.md:114-131; affected consumer src/workbench/precondition-artifacts.ts:216-229] Planning now initializes every task-local progress file with `status: pending`, but code's begin/finalize steps change only the root metadata and row and append an attempt: neither step transitions the task-local frontmatter status to `done` or `blocked`. Following the stated steps exactly leaves a completed task log marked pending, so the unchanged finish precondition rejects even an otherwise synchronized all-done ledger. Explicitly synchronize the assigned task-local status with its final outcome, preserving the valid attempt-free pending creation state and sibling histories, and add a skill-contract assertion for that transition. Focused verification: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/workbench/precondition.test.ts tests/templates/artifact-contracts.test.ts tests/docs/workbench-docs.test.ts` passed 72 tests (the precondition suite already rejects a pending task log with a done attempt); `git diff --check 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa 8e72175110a85e503db02711587821e9f3a39290` was clean. (violates: requirements/execution.md, “Initialize task execution artifacts in a lint-valid state”; design decision “Instantiate every planning template as a live artifact”; finish-work's unchanged task-evidence gate)
- [skills/hamilton-plan/SKILL.md:213-220; affected consumer src/workbench/precondition-artifacts.ts:169-199] Re-plan says a renamed non-done task may update *only* the root Markdown title and task-progress heading while preserving the surviving metadata entry's exact title. Its plan heading and root row then use the new title but the root `tasks` frontmatter retains the old one. Lint does not compare these titles across representations, yet the finish precondition rejects their mismatch. Require the same new unescaped title in the assigned root metadata entry, row, plan heading, and task-local heading, retain the task id/status/link/attempt history, and test the rename path rather than only retained status. (violates: requirements/execution.md, “Initialize task execution artifacts in a lint-valid state,” matching exact title; design decision “Instantiate every planning template as a live artifact”)

### Suggestions

- None.

## Pass 4 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: a31bc444e6f16f2dcb8bc01d5cfb1ba6e90e1c1d
Verdict: changes-requested

### Blocking

- [skills/hamilton-plan/SKILL.md:222-235; affected consumer src/workbench/artifact-body.ts:778-787] Re-plan now mandates full change-directory lint after amendments, while the same skill requires abandoned task ids to remain reserved and removes abandoned tasks from the active root ledger. If Task 2 is abandoned while Task 3 remains active, the valid active ledger contains Tasks 1 and 3, but `readTaskLedger` still requires each progress-row id to equal its one-based row index; lint rejects Task 3 with `non-monotonic-record` (expected 2, actual 3), so the new required lint gate blocks a compliant re-plan. Permit strictly increasing active progress-row ids with gaps for abandoned tasks while preserving plan-order matching, unique identities, metadata, and exact links, and add lint coverage for an abandoned middle task. Focused verification: `bun --bun -e 'import{validateArtifactBody as v}from"./src/workbench/artifact-body.ts";let a={sourcePath:"x",metadata:{artifact:"progress"},body:"# Progress: Demo\\n| Task | Status | Progress |\\n| --- | --- | --- |\\n| Task 1: A | done | [details](tasks/task-1/progress.md) |\\n| Task 3: C | pending | [details](tasks/task-3/progress.md) |",locations:{body:{startLine:1}}};console.log(v(a,"progress").diagnostics.map(function(x){return [x.code,x.expected,x.actual]}))'` returned `non-monotonic-record` (expected 2, actual 3). (violates: the re-plan abandonment/id-preservation contract in `skills/hamilton-plan/SKILL.md`, `requirements/execution.md`, “Initialize task execution artifacts in a lint-valid state,” and design decision “Instantiate every planning template as a live artifact”)

### Suggestions

- None.

## Pass 5 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 463630dbd0aab14eaea3f461d95697d084f646fc
Verdict: approved

### Blocking

- None.

### Suggestions

- [src/workbench/artifact-body.ts:791] Distinguish the plan ledger's contiguous numbering diagnostic from the progress ledger's strictly increasing numbering diagnostic; the current message still says task numbering must be contiguous even though abandoned-task gaps are valid. Focused verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts` — 106 tests passed; `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` — lint: success.

## Pass 6 — 2026-09-23

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 2be0145241aa057606afc37f934c7f0816254c95
Verdict: approved

### Blocking

- None.

### Suggestions

- [src/workbench/artifact-body.ts:791] Distinguish the plan ledger's contiguous numbering diagnostic from the progress ledger's strictly increasing numbering diagnostic; the current message still says task numbering must be contiguous even though abandoned-task gaps are valid. Focused verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts` — 106 tests passed; `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` — lint: success.
