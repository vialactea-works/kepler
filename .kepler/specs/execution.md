---
artifact: requirements-spec
capability: execution
status: current
updated: 2026-09-23
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: execution

## Overview

Hamilton's execution state separates current task standing from detailed implementation evidence. Planning creates a task ledger and task-owned logs, code owns one task's transitions, orchestration resumes from the ledger plus review freshness, and finish-work records its own verified lifecycle without turning progress into a mixed timeline.

## Contract

### Task ledger and evidence

The root `<change>/progress.md` is a Markdown table with exactly the columns `Task`, `Status`, and `Progress`. It has one row for each active plan task, in plan order. Each row identifies the task as `Task N: <title>`, uses one of `pending`, `in-progress`, `blocked`, or `done`, and links to `tasks/task-N/progress.md`. The task directory is derived from the numeric identifier, not the title. Its frontmatter `tasks` metadata is a mirrored ledger: every entry matches its row on numeric id, exact title, status, and exact task-progress link.

Each `tasks/task-N/progress.md` identifies exactly one task and contains append-only implementation attempts. A canonical attempt is numbered in physical order and records its `done` or `blocked` outcome, changed paths, verification evidence, and relevant notes or concerns. For an ordinary implementation, that evidence distinguishes the ordered red, green, and behavior-preserving refactor phases; when a conventional failing test is not possible, it records the concrete reason and a repeatable alternative verification. The task log contains no sibling execution, feedback, whole-branch review, or finish history.

Before a task's first implementation attempt, its ignored `tasks/task-N/.base` records the full current commit identifier. That checkpoint is reused for every feedback package for the task, including corrections; whole-branch review derives its range from the default-branch merge base.

### Finish history

The change-level `finish.md` contains paired `Attempt N` and `Outcome N` sections. An attempt records passed gates, specification synchronization, strategy, intended workspace result, and route intent. Its matching outcome records `completed` or `blocked`, the verified external result, actual workspace and route state, and any partial state or blocker. A temporarily unmatched attempt identifies one finish operation awaiting reconciliation.

## Behavior

Planning initializes the complete task structure for active tasks from the installed plan, progress, and task-progress shapes, preserving exact numeric identities and escaping titles for the Markdown table. A new author-bearing plan records the configured Git identity as `Name <email>`; re-planning preserves an existing non-empty author exactly. New task logs are initialized as pending with no attempt record. Re-planning preserves each surviving task's actual status in matching frontmatter metadata and table rows, including frozen done tasks and existing non-done tasks; it adds new active tasks as pending in both representations, may rename a non-done display title, and removes abandoned tasks from the active ledger without deleting their history or reusing their identifiers.

Code starts one identified task by moving only its matching root frontmatter metadata entry and row together to `in-progress`. The attempt-free task log remains `status: pending` with no attempt; a previously finalized log retains its latest `done` or `blocked` local status while a correction reopens the root task. In an ordinary cycle, implementation records and runs the smallest failing behavioral check, makes the smallest change that passes it, then performs a behavior-preserving refactor while keeping relevant verification passing. Green is an intermediate milestone; the stable implementation proceeds to task feedback as the refactor-phase gate.

A completed implementation appends the task-local attempt, sets that log's frontmatter status to the matching `done` or `blocked` outcome, and changes the same root metadata entry and row together to that outcome. A correction can reopen a prior `done` or `blocked` task. Sibling metadata entries, rows, and histories remain unchanged. An interrupted run leaves `in-progress` as an explicit signal for inspection. A blocked run persists its task evidence and status without committing partial production edits.

Resume uses the root row as current implementation truth and the task-local log as evidence. Pending or blocked tasks need implementation handling; an in-progress task needs inspection of its current git and log state; a done task without fresh feedback needs feedback; a done task with fresh changes requested needs correction; and only a done task with fresh approved feedback advances. Missing or malformed checkpoints stop packaging rather than guessing a base.

Finish-work records its intent only after all preconditions and specification synchronization pass. It verifies the external strategy and workspace state before appending the matching outcome. A dangling attempt is reconciled against git, remote, request, route, and workspace state before any new attempt number is allocated. Validation permits exactly two intentional pending exceptions: a newly initialized pending task log may contain no attempts, and a pending finish history may end with one unmatched final attempt only after all earlier attempts are paired. Other task-progress and finish states require complete records.

Planned changes using the old mixed review or monolithic progress layout are inventoried as unsupported historical format rather than interpreted. A directory without `plan.md` remains a valid pre-plan state.

**Examples**

- finalize a plan with Tasks 1–3 -> root progress has three pending rows in order and three matching task logs
- start Task 2 -> only Task 2 moves to `in-progress`, and its checkpoint records the current full commit
- complete then correct Task 2 -> its log retains both attempts, the checkpoint stays fixed, and the row returns through `in-progress` to its latest outcome
- resume with Task 2 done but feedback missing or stale -> code feedback is requested for Task 2 rather than repeating implementation
- implement behavior with a conventional test -> the task attempt records failing red, passing green, and passing behavior-preserving refactor evidence before feedback
- implement behavior without a meaningful conventional failing test -> the attempt records the concrete constraint and a repeatable alternative verification, which feedback judges for sufficiency
- receive requested feedback -> the same task starts a fresh correction cycle and must be reverified before another approval
- re-plan after abandoning Task 2 and appending Task 4 -> Task 2's files remain, Task 4 is pending with a new log, and identifiers are not reused
- finish action is interrupted after `Attempt 2` -> the same attempt is reconciled and receives `Outcome 2` or safely continues before any new attempt
- context inventory encounters a planned old-format change -> it labels the directory `legacy-unsupported` without deriving task status from old sections

## Invariants

- Root progress MUST contain exactly the active plan tasks once, in order, with exact task links and allowed statuses.
- A `done` row MUST have matching latest task evidence with `Outcome: done`; the ledger and evidence MUST NOT disagree.
- Every task checkpoint MUST remain stable across retries and corrections and MUST NOT be inferred from a guessed parent commit.
- An ordinary implementation attempt MUST record distinct red, green, and behavior-preserving refactor evidence in that order; a green result MUST NEVER authorize advancement by itself.
- An exceptional implementation MUST record a concrete reason a conventional failing test is unavailable and a repeatable alternative verification; the exception MUST NEVER be used merely to avoid a feasible test.
- Task logs, feedback, review, and finish history MUST remain owned by their respective artifacts; root progress MUST NEVER contain their timelines or summaries.
- Finish history MUST use paired, monotonic attempt and outcome numbers, and finish-work MUST NEVER claim an external or workspace result before reading it back.
- New execution MUST NEVER interpret, migrate, or silently accept a planned legacy layout.

## Decisions

- **The root ledger is current state, not history.** A compact index gives every driver one deterministic resume surface while detailed evidence remains next to the task that produced it.
- **Numeric task identity is stable.** Titles can change while work is replanned; deriving paths from `Task N` prevents collisions and preserves history.
- **Checkpoints belong to tasks.** A task's feedback range must survive later tasks and correction passes, so one shared mutable change base is insufficient.
- **TDD is an evidence contract.** The implementation cycle adds ordered red, green, and behavior-preserving refactor evidence to the existing task attempt without introducing a new task status or artifact.
- **Feedback gates refactoring.** The task is not fully gated by green verification; fresh approved task feedback reviews the stable refactor before advancement.
- **Finish intent and observation are separate.** An external action cannot be honestly described until it is read back, so the attempt and outcome are paired but persisted at different moments.
- **Unsupported history is visible, not interpreted.** A between-changes migration keeps new producers strict and lets global inventory report old work without inventing current state.
