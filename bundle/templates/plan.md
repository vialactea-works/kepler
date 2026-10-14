---
artifact: plan
change: <YYYY-MM-DD-change-title>
status: draft
created: <YYYY-MM-DD>
author: <Name <email>>
decision: skipped
execution: {version: 2, mode: dependencies}
route_unit: null
intent_approvals: []
initialization:
  version: 1
  base: <full 40-hex pre-scaffold Git commit>
  authority: <requester authority reference>
  breakdown: <64-hex SHA-256 task breakdown digest>
  taskIds: [1, 2]
---

<!--
  Plan: implementation ledger / "Steps"
  Produced by: kepler-plan (step 2 of the seven-stage pipeline).
  Lives at: .kepler/changes/<change>/plan.md
  Required for every change. This contract connects planning to implementation, whether a person or a Kepler agent executes the tasks.

  Write and edit only execution version 2 plans. Version 1 and unversioned plans are read-only context; do not rewrite them with this template. initialization.version remains 1 because it describes the proof schema, not the plan's execution version.

  Consumption contract:
    - kepler-code (step 3) reads one assigned task block and its cited constraints, never sibling details. Keep each task self-contained. Independent ready tasks may run in isolated lanes; each worker owns only its task evidence.
    - kepler-plan initializes the root task index in progress.md and each task's tasks/task-N/progress.md. Workers write only task-local evidence and their original commits; the coordinator publishes root state through guarded operations. kepler-code-feedback (step 4) owns tasks/task-N/feedback.md.
    - Obtain `taskDefinitionDigest`, `taskBreakdownDigest`, recorded input context and current input probes from `kepler workbench context`. Definition and breakdown digests use lowercase 64-hex SHA-256; Git commits and blobs, including `initialization.base` and input blob IDs, remain 40-hex IDs. Preserve `initialization.breakdown` on re-plan: it identifies the initial authorized snapshot. Verify it against that plan revision. `intent_approvals` binds each present formal input's exact repository-relative path, owner-held approval reference and full commit. `initialization` captures the original pre-scaffold base, explicit planning authority, task-breakdown digest and original IDs; preserve it unchanged on re-plan.
    - Omit optional `input_impact` and `legacy_input_confirmations` metadata unless an authorized revision needs them. Input-impact records bind changed input blobs, affected, unaffected and new task IDs, unresolved-intent state, rationale, previous plan commit and independent-review reference. Keep execution: {version: 2, mode: dependencies}; express prerequisites through Depends on, not serial execution order or execution_transition. Legacy input confirmations apply only to tasks in a version 2 plan whose committed implementation plan lacks versioned input provenance. Preserve the task and its history, record `historicalInputs: "unknown"`, bind current repository/task/input revisions, and retain owner and independent-review references with rationale. These records confirm current inputs; they neither reconstruct history nor waive gates. See kepler-plan for the schema and admission rules.
    - kepler-review (step 5) owns the whole-branch review.md after all task feedback; kepler-finish-work (step 6) owns finish.md.
    - Each task carries Goal, Acceptance, Depends on, Steps, Verify and Commit; Files is optional guidance, not an allowlist. Approved intent, cited design and requirements, and project standards constrain implementation. Necessary goal-serving edits to unlisted paths are permitted. Keep tasks TDD-sized, with related Red → Green → Refactor cycles. Run Red before production edits, rerun the same check for Green, and verify behavior after Refactor. After Refactor, run only tests related to changed files and affected behavior, then obtain fresh LSP diagnostics for changed files and affected dependents. Require no errors; unavailable or stale diagnostics do not establish a clean result. Defer full-suite tests and full builds to later workflow stages. Record exact commands, diagnostic scope and observed results in task-local progress. "Build authentication" is too broad; "add a user-registration endpoint that validates email format" is appropriately scoped.
    - If a conventional failing behavioral check is technically impossible, explain why in Red and specify a repeatable alternative that distinguishes pre-change and post-change behavior. Run it before production edits. Preference alone does not justify an exception. Document the Refactor check even when no cleanup is needed.
    - `kepler-code-feedback` supplies the refactor-phase review after the implementation commit; task Steps must not invoke it. Requested changes return the same task to a verified Red → Green → Refactor correction cycle, not a new task by default.
    - Reference design.md and requirements/ rather than copying them. Keep plan.md in a change directory even when the pipeline starts here. If upstream artifacts are absent, state the purpose and scope inline.
    - Scale detail to risk and executor. Include code or exact commands to resolve ambiguity; otherwise state intent and leave implementation judgment to the coder. Do not pre-write the diff. Snippets illustrate design and standards; keep them cohesive and testable, without shortcuts.
    - Follow the design's boundaries: each task delivers one cohesive, independently testable unit. Acceptance covers success, errors and edge cases. A task that needs "and" in its title is usually two.

  Initial `status: draft` and `decision: skipped` values do not establish approval. The requester may confirm the breakdown, or an explicitly authorized unattended planner may self-review it and record assumptions. Neither plan status nor decision approves formal intent.

  Before creating this artifact, read `git config user.name` and `git config user.email`. Use both values in `author: Name <email>`. If either is missing, ask the user or stop; never invent an identity. Preserve existing author attribution unless the user directs a change.

  Delete this comment block and inline hints before finalizing.
-->

# Plan: <Change Title>

## Overview

- Change: <this plan's change directory, .kepler/changes/<change>/>
- Route unit: recorded in frontmatter `route_unit`; omit unless the change executes a route unit
- Goal: <1–2 sentences — what this plan delivers and why>
- Spec impact: <for each touched capability: approved requirements delta + committed revision, or no canonical behavior change + rationale>
- Related tests: `<commands scoped to changed files and affected behavior>`
- LSP diagnostics: <tool and affected-file scope; refresh diagnostics and require no errors>
- Deferred verification: full-suite tests and full builds run in later workflow stages.
- Context notes: <relevant constraints, files and patterns; reference AGENTS.md and design.md rather than duplicating them>
- Quality notes: <how the tasks preserve the design's structure; any accepted structural smell and its reason. One line or "none" suffices for a trivial change. A smell that is neither fixed by re-slicing nor recorded here fails self-review.>
- Intent approvals: <each formal artifact's exact requester-held approval reference and full approved-input commit; omit for tactical changes with no formal artifacts. These references record asserted approval, not authenticated authority.>
<!-- Omit the following two fields unless input_impact is present; copy the exact metadata values. -->
- Input impact review: <exact input_impact.reviewReference>
- Input impact previous plan: <exact full input_impact.previousPlanCommit>

## Tasks

<!-- Number tasks for stable identity, such as "Task 3". Keep headings, directories and both root-ledger representations in numeric identity order; IDs do not imply execution order.
     Build the graph from task outputs and required inputs. Add a dependency only when a task needs another task's completed result to implement or verify its Goal and Acceptance. In the dependent task's Goal, name the result and explain why it must exist first.
     Use "Depends on: none" for independent tasks; otherwise list Task N IDs separated by comma-space. These declarations are the graph's single source of truth. Do not duplicate the graph in frontmatter.
     Record shared-file and shared-resource conflicts in the affected tasks' Steps as coordination constraints. Add a dependency only when one task needs the other's result. Context derives readiness; the coordinator admits compatible isolated lanes.
     Check for missing or inactive prerequisites, self-dependencies, cycles and unnecessary edges. Do not chain independent tasks. Omit edges that merely repeat transitive ordering; retain direct dependencies on results the task consumes. Resolve cycles by revising task boundaries or extracting a shared prerequisite. -->

### Task 1: <imperative title>

- Goal: <observable result and reason>
- Depends on: none
- Files: optional guidance
  - Created: <paths, or none>
  - Modified: <paths, or none>
  - Deleted: <paths, or none>
- Acceptance:
  - <testable criterion — what "done" means; cite requirement/scenario if one exists>
  - Quality constraints: <applicable code-quality principle and concrete task constraint, with its source section; use none with a reason when inapplicable>
  - Decision context: <verified current decision or applicable recalled lesson, its source and why it applies; reject stale/conflicting advice with current-source evidence, or record unavailable memory and repository-owned context>
- Notes: <versioned JSON handoff with repository identity, approved intent commit or explicit tactical reference, this task's SHA-256 definition digest, and selected input paths plus full Git blob IDs; add impactPlanCommit only for a reviewed input-impact amendment>
- Steps:
  1. Red — <write or update a behavioral check, run it before production edits, and observe the intended failure; if a conventional failing check is technically impossible, record the concrete reason and run the planned repeatable alternative before editing production files>
  2. Green — <make the smallest passing implementation, then rerun the same check or alternative to confirm it passes for the intended reason>
  3. Refactor — <perform behavior-preserving cleanup or record why none is needed, then rerun relevant behavioral and regression tests>
  4. If a phase fails for the wrong reason, Verify fails, or feedback is `changes-requested`, record the correction and repeat Red → Green → Refactor with relevant verification in this task; block for re-plan if the correction exceeds Acceptance or approved intent; Files is optional guidance.
- Verify: `<related test commands after Refactor>` and <fresh LSP diagnostics for changed files and affected dependents> → <tests pass and no LSP errors>
- Commit: `<type: message>`

### Task 2: <imperative title>

- Goal: <observable result and reason; name the result needed from Task 1 and explain why it must exist first>
- Depends on: Task 1
- Files: optional guidance
  - Created: <paths, or none>
  - Modified: <paths, or none>
  - Deleted: <paths, or none>
- Acceptance:
  - <observable pass/fail criterion>
- Steps:
  1. Red — <failing behavior check before production edits>
  2. Green — <smallest implementation; rerun the same check>
  3. Refactor — <behavior-preserving cleanup and relevant tests>
- Verify: `<related test commands>` and <fresh LSP diagnostics for changed files and affected dependents> → <tests pass and no LSP errors>
- Commit: `<type: message>`

## Done when

<!-- kepler-finish-work checks this plan-level definition of done. Track task completion in root progress.md and each linked task log, not in these task blocks. -->

- Every active task has worker-recorded Red, Green and Refactor evidence (or a justified alternative Red) in its task log, an integrated original task commit and coordinator-published completion.
- Each task requires fresh committed independent `approved` feedback to become fully gated. Readiness does not grant admission, and root done does not grant clearance. Compatible isolated ready lanes may run concurrently; descendants remain held until prerequisite approval. `changes-requested` returns the same task for correction and another pass.
- Tests related to changed files and affected behavior pass; fresh LSP diagnostics report no errors in the affected scope. Full-suite tests and full builds remain deferred to later workflow stages.
- Whole-branch review is approved with no blocking findings after every active task is fully gated with fresh feedback.
