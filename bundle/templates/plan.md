---
artifact: plan
change: <YYYY-MM-DD-change-title>
status: draft
created: <YYYY-MM-DD>
author: <Name <email>>
decision: skipped
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
  Plan — implementation ledger / "Steps"
  Produced by: kepler-plan (step 2 of the seven-stage pipeline). Lives at:
  .kepler/changes/<change>/plan.md
  REQUIRED artifact — the one document every change has. It is the handoff contract
  between planning and coding, for a human OR a Kepler agent.

  Consumption contract:
    - kepler-code (step 3) consumes ONE task at a time (a single "### Task" block and its steps)
      and nothing else — it must not read or implement sibling tasks. Keep each task
      self-contained.
    - kepler-plan initializes the root task index in progress.md and each task's
      tasks/task-N/progress.md. kepler-code updates only that task's row and log;
      kepler-code-feedback (step 4) owns tasks/task-N/feedback.md.
    - Obtain `taskDefinitionDigest`, `taskBreakdownDigest`, recorded input context and current
      input probes from `kepler workbench context`; definition/breakdown digests use lowercase 64-hex SHA-256.
      Git commits and blobs, including `initialization.base` and input blob IDs,
      remain 40-hex IDs. Preserve the original `initialization.breakdown` on re-plan; it
      describes the initial authorized snapshot and is checked against that historical plan.
      `intent_approvals` binds each present formal input's exact repository-relative path, owner-held
      approval reference and full commit. `initialization` captures the original pre-scaffold base,
      explicit planning authority, task-breakdown digest and original IDs; keep it unchanged on re-plan.
    - Optional `input_impact`, `execution` / `execution_transition`, and
      `legacy_input_confirmations` metadata are omitted unless an authorized revision needs them.
      Input-impact records bind changed input blobs, affected, unaffected and new task IDs,
      unresolved-intent state, rationale, previous plan commit and independent-review reference.
      Execution metadata is one serial order; its transition binds previous plan commit/order, the
      fully gated prefix, owner approval reference, reason and affected obligations. The Overview
      records the same evidence. Legacy input confirmations are only for tasks whose committed
      implementation plan lacks versioned input provenance; preserve the task and its history,
      record `historicalInputs: "unknown"`, bind current canonical repository/task/input revisions,
      and retain attributable owner and independent-review references plus rationale. They are not
      historical snapshots, authorization, or waivers; see `kepler-plan` for the versioned shape
      and admission rules. Never use a default execution sequence to imply concurrency or bypass
      numeric task identity.
    - kepler-review (step 5) owns the whole-branch review.md after all task feedback;
      kepler-finish-work (step 6) owns finish.md.
    - Each task is a TDD-sized unit: small enough to implement and verify in isolation,
      carrying its own acceptance check. Specify and execute Red before production edits,
      Green on the same check, and behavior-preserving Refactor with relevant tests afterward.
      Record exact commands and observed results in task-local progress. "Build authentication"
      is too big; "add a user-registration endpoint that validates email format" is right.
    - When a conventional failing behavioral check is technically impossible, the task's Red
      step must give the concrete reason and a repeatable alternative verification that
      distinguishes pre-change and post-change behavior before production edits. Preference
      alone is not an exception. A no-op cleanup still gets a documented Refactor check.
    - `kepler-code-feedback` supplies the refactor-phase review after the implementation
      commit; the task Steps must not invoke it. Requested changes return the same task to a
      verified Red → Green → Refactor correction cycle, not a new task by default.
    - Reference upstream artifacts (design.md, requirements/) — do not copy them. Even
      when the pipeline starts at this step, plan.md still lives in a change directory;
      if there are no upstream docs, state the minimal why/what inline.
    - Detail scales to risk and executor: include code or exact commands when they remove
      ambiguity; otherwise state intent and let the coder think. Do not pre-write the
      whole diff. Any snippet you do include is copied verbatim by the coder — make it model
      the clean shape (cohesive, testable, no shortcut), never a throwaway.
    - Task seams follow the design's structure: each task lands one cohesive unit that can be
      tested in isolation, and its acceptance covers the error/edge behavior, not just the
      happy path. A task you cannot state without "and" is usually two.
  The initial `status: draft` and `decision: skipped` are placeholders, never approval. An attended
  requester may confirm this plan's breakdown; an explicitly authorized unattended planner may
  self-review it and record assumptions, but neither plan status nor decision approves formal intent.
  Before creating this artifact, read the configured Git identity with `git config user.name` and
  `git config user.email`, then write `author: Name <email>` using both configured values. If either
  configured value is missing, ask the user or stop with a blocker rather than inventing an identity.
  When revising an existing artifact, preserve its recorded author unless the user explicitly directs
  an attribution change.
  Delete this comment block and inline hints before finalizing.
-->

# Plan: <Change Title>

## Overview

- Change: <this plan's change directory, .kepler/changes/<change>/>
- Route unit: recorded in frontmatter `route_unit`; omit unless the change executes a route unit
- Goal: <1–2 sentences — what this plan delivers and why>
- Spec impact: <for each touched capability: approved requirements delta + committed revision, or no canonical behavior change + rationale>
- Test: `<command that runs the test suite>`
- Build / typecheck: `<command>`
- Context notes: <only the relevant slice — key constraints, files, patterns. Reference
  AGENTS.md / design.md instead of duplicating them.>
- Quality notes: <how the task breakdown preserves the design's structure, and any
  structural smell accepted on purpose (with why). One line, or "none" for a trivial change.
  This is the plan's blocking record — an unresolved smell that is neither re-sliced away nor
  recorded here fails the self-review.>
- Intent approvals: <for every formal artifact, exact requester-held approval reference and
  full committed approved-input revision; omit when this is a tactical change with no formal
  artifacts. These are recorded assertions, not authenticated authority.>
<!-- Omit the following two fields unless input_impact is present; copy the exact metadata values. -->
- Input impact review: <exact input_impact.reviewReference>
- Input impact previous plan: <exact full input_impact.previousPlanCommit>
<!-- Omit the following fields unless execution_transition is present; copy the exact metadata values.
     Render orders as comma-space-separated IDs and an empty fully gated prefix as none. -->
- Execution previous plan: <exact full execution_transition.previousPlanCommit>
- Execution approval: <exact execution_transition.approval>
- Previous execution order: <execution_transition.previousOrder, comma-space-separated IDs>
- New execution order: <execution.order, comma-space-separated IDs>
- Fully gated prefix: <execution_transition.fullyGatedPrefix, or none>
- Reason: <exact execution_transition.reason>
- Affected obligations: <exact execution_transition.affected>

## Tasks

<!-- Numbered for stable identity (kepler-code is pointed at "Task 3"). Keep headings, task
     directories and both root-ledger representations in numeric identity order. "Depends on"
     expresses visible logical prerequisites. Ordinary plans execute serially in numeric order;
     an authorized opt-in `execution` sequence may change only the serial order, never identity.
     A versioned `execution` list contains every active ID exactly once, including done tasks;
     absent metadata means legacy numeric order and malformed explicit metadata never falls back.
     No parallel or DAG scheduler is implied. The root ledger still uses identity order; the driver
     selects the first not-fully-gated ID from the validated execution sequence. -->

### Task 1: <imperative title>

- Depends on: none
- Files:
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
  4. If a phase fails for the wrong reason, Verify fails, or feedback is `changes-requested`, record the correction and repeat Red → Green → Refactor with relevant verification in this task; block for re-plan if the correction exceeds Files or Acceptance.
- Verify: `<command after Refactor, plus full tests and build per AGENTS.md>` → <expected result>
- Commit: `<type: message>`

### Task 2: <imperative title>

- Depends on: Task 1
- Files:
  - Created:
  - Modified:
  - Deleted:
- Acceptance:
  -
- Steps:
  1.
- Verify:
- Commit:

## Done when

<!-- Plan-level definition of done — checked by kepler-finish-work.
     Task completion is tracked by the root progress.md index and each linked task log,
     not on the tasks here. -->

- All active tasks are `done` in `progress.md` with task-local Red, Green, and Refactor evidence (or a justified alternative Red).
- Each task has fresh committed `approved` feedback from `kepler-code-feedback` before the next task or whole-branch review; `changes-requested` returns the same task for correction and another pass.
- `<test command>` passes; build / typecheck is clean.
- Whole-branch review is approved with no blocking findings. When an explicit execution sequence
  exists, every active task passed its ordinary implementation and fresh-feedback gates in that
  validated serial order before whole-branch review.
