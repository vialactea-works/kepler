# Capability: execution

The pipeline behavior that initializes a task ledger, isolates detailed execution evidence by task, resumes work deterministically, and records finish outcomes outside task progress.

## ADDED Requirements

### Requirement: Planning initializes the complete task progress structure

When `hamilton-plan` finalizes a plan, it SHALL create or reconcile `<change-dir>/progress.md` as the task-only execution index and SHALL create `<change-dir>/tasks/task-N/progress.md` for every active plan task. The root index SHALL contain exactly one row per active `Task N` in plan order, render the Task cell as `Task N: <title>`, assign the initial status `pending` to each newly planned task, and link to the exact relative path `tasks/task-N/progress.md`. It SHALL apply standard Markdown table escaping to title characters such as `|` without changing the rendered title. The task directory segment SHALL encode `Task N` as lowercase `task-N` and SHALL NOT derive identity from the task title.

- Priority: must
- Rationale: the planning stage is the only stage that sees the complete task set on both manual and orchestrated paths, so it can create a valid index without forcing a task-scoped coder to inspect siblings.

#### Scenario: A new three-task plan is finalized

- WHEN `hamilton-plan` writes active tasks `Task 1`, `Task 2`, and `Task 3`
- THEN root `progress.md` contains those three rows in that order with status `pending`, exact relative links under `tasks/task-N/progress.md`, and all three linked task progress files exist

#### Scenario: Task titles contain punctuation or repeated words

- WHEN two plan task titles contain spaces, punctuation, or similar text
- THEN their directories remain `task-N` based only on the exact numeric task identifiers and their root rows retain the human-readable titles with Markdown table delimiters escaped

#### Scenario: A plan task is marked abandoned

- WHEN a plan task is explicitly marked abandoned rather than active
- THEN the active root ledger does not require a status row for it and no new task progress file is initialized for that abandoned task

### Requirement: Root progress is a task-only index and current-status ledger

Root `<change-dir>/progress.md` SHALL contain only task identity, title, current status, and the relative link to each task's detailed progress file. Its status vocabulary SHALL be exactly `pending`, `in-progress`, `blocked`, and `done`. Root progress SHALL be the authoritative source for the current implementation status of active tasks and SHALL NOT contain changed-file lists, commands, verification results, notes, attempt timelines, task feedback verdicts, whole-branch review summaries, or finish entries.

- Priority: must
- Rationale: a compact current-state ledger provides a deterministic resume point while task, review, and finish artifacts retain detailed histories without turning the index into another mixed stream.

#### Scenario: A reader checks what remains

- WHEN root progress contains one `done`, one `in-progress`, one `blocked`, and one `pending` row
- THEN the reader can determine current implementation standing and navigate to each task log without parsing attempt sections

#### Scenario: A review or finish stage completes

- WHEN `hamilton-code-feedback`, `hamilton-review`, or `hamilton-finish-work` records its own result
- THEN root progress receives no review, feedback, finish, or timeline section and its task rows change only if `hamilton-code` changes implementation status

### Requirement: Each task owns append-only execution evidence

Each `<change-dir>/tasks/task-N/progress.md` SHALL identify exactly one plan task and SHALL retain an append-only dated section for every completed `hamilton-code` attempt on that task. Each attempt SHALL state the final outcome `done` or `blocked`, created, modified, and deleted paths, verification commands and observed results, and deviations, decisions, or concerns needed by feedback and review. The file SHALL NOT contain sibling task execution details, task feedback verdicts, whole-branch review passes, or finish outcomes.

- Priority: must
- Rationale: detailed evidence follows the task boundary used by coding and code feedback, reducing shared-file contention and context while preserving all attempts.

#### Scenario: A task blocks and later succeeds

- WHEN the first implementation attempt for Task 2 ends blocked and a later attempt completes
- THEN `tasks/task-2/progress.md` retains both dated attempts in order with outcomes `blocked` and `done`, while no other task progress file changes

#### Scenario: Code feedback needs implementation claims

- WHEN `hamilton-code-feedback` reviews Task 5
- THEN it reads `tasks/task-5/progress.md` as the implementer's detailed evidence and does not load sibling task progress files

#### Approved bootstrap disposition for this change

For `.hamilton/changes/2026-09-04-split-hamilton-review/` only, remediation MAY replace the pre-contract attempt headings in the already-recorded Task 1 and Task 4 histories with canonical numbers in physical order. It SHALL preserve all dates, evidence bodies, and ordering and SHALL land as a new commit without rewriting existing commits. The ordinary task-feedback freshness rule applies to that commit. After normalization, append-only ownership and the exact canonical task-progress contract govern those files; no consumer SHALL retain or add a legacy-heading fallback.

### Requirement: Code owns task status transitions and synchronized final evidence

Every `hamilton-code` invocation SHALL identify exactly one existing active `Task N`, including when the task block is supplied inline, so the task's root row and directory can be resolved without title inference. At the start of the invocation, the code step SHALL update only its assigned task's root row to `in-progress` before executing implementation steps. On a completed attempt, it SHALL append the detailed attempt to that task's progress file and update the same root row to `done` or `blocked` to match the attempt outcome. A correction or retry MAY transition an existing `blocked` or `done` row back to `in-progress`; `done` SHALL mean the latest implementation attempt completed, not that task feedback is approved. The root-row final transition and task-progress append SHALL be committed with the task's code when an implementation commit exists. A gracefully reported blocked attempt with no valid implementation commit SHALL persist its root and task-progress changes in a change-artifact-only bookkeeping commit while leaving partial production edits uncommitted and explicitly reported. No coder SHALL mutate a sibling task row or progress file.

- Priority: must
- Rationale: one writer owns each task's detailed log while a small shared ledger carries current state; allowing a reviewed correction to reopen implementation prevents `done` from being confused with final approval.

#### Scenario: A pending task begins

- WHEN `hamilton-code` is dispatched for pending Task 1
- THEN it changes only Task 1's root status to `in-progress` before implementation and leaves every sibling row and file untouched

#### Scenario: Inline task omits a numeric task id

- WHEN `hamilton-code` receives an inline task block that cannot be identified as one existing active `Task N`
- THEN it stops before implementation and asks for the exact task id rather than deriving a directory from the title or creating an unindexed task

#### Scenario: A code attempt succeeds

- WHEN Task 1's implementation and required verification complete
- THEN the task log gains one `Outcome: done` attempt and the root Task 1 row becomes `done` in the task commit

#### Scenario: Feedback requests a correction after implementation

- WHEN Task 1 is `done` but its latest feedback is `changes-requested` and code is re-dispatched
- THEN Task 1 transitions back to `in-progress`, receives another task-local attempt, and returns to `done` or `blocked` without changing another row

#### Scenario: Work cannot complete

- WHEN the assigned implementation attempt reaches a blocker
- THEN the task log records the blocker and evidence with `Outcome: blocked`, the root row becomes `blocked`, those two artifact changes are persisted without committing partial production work, and the agent does not report the task as done

#### Scenario: Process terminates without a graceful blocker report

- WHEN an implementation process stops after setting `in-progress` but before it can append and persist a final attempt
- THEN the root row remains an interruption signal and resume inspects the working tree and task evidence rather than manufacturing `blocked` or `done`

### Requirement: Each task owns one stable diff checkpoint

Before the first implementation attempt for an active `Task N`, the driver SHALL record the current full commit identifier in ignored `<change-dir>/tasks/task-N/.base`. It SHALL use that checkpoint as the base for every code-feedback diff package for the task and SHALL NOT overwrite it on blocked retries or changes-requested correction passes. A newly appended remediation task SHALL receive its own checkpoint immediately before its first implementation attempt. The task checkpoint SHALL remain untracked and SHALL replace the shared change-level `.base` for task packaging; whole-branch review SHALL continue deriving its base from the default-branch merge base.

- Priority: must
- Rationale: a task-local stable base survives compaction and correction loops without being overwritten by another task, and it lets every feedback pass inspect the complete task rather than only the latest correction commit.

#### Scenario: A pending task starts for the first time

- WHEN Task 2 has no `.base` and current `HEAD` is A immediately before its first code attempt
- THEN the driver writes full commit A to `tasks/task-2/.base`, excludes that path from git tracking, and packages later Task 2 feedback from A

#### Scenario: Feedback requests a correction

- WHEN Task 2 feedback requests changes after reviewing A through B and correction code later produces C
- THEN `tasks/task-2/.base` remains A and the next feedback package covers A through C

#### Scenario: The next task begins

- WHEN Task 2 has its own checkpoint and Task 3 starts at current `HEAD` C
- THEN Task 3 records C in `tasks/task-3/.base` without changing Task 2's checkpoint

#### Scenario: Task checkpoint is missing on resume

- WHEN a task has implementation evidence but `tasks/task-N/.base` is absent or malformed
- THEN code feedback stops rather than guessing `HEAD~1`, and the driver reconstructs the base only from unambiguous durable git and task evidence or asks for intervention

### Requirement: Resume decisions combine implementation and feedback state

`hamilton-orchestrate`, `hamilton-code`, `hamilton-plan` in re-plan mode, `hamilton-change-context.sh`, and `hamilton-precondition-check.sh` SHALL read current task implementation status from root progress rather than reconstructing it from detailed attempt history. Orchestration SHALL combine that status with the task's latest feedback verdict and whether that pass's reviewed head contains the latest commit that touched the task's progress file: `pending` or `blocked` requires implementation handling; `in-progress` requires inspecting the current task's git and task-log state before resuming; `done` without feedback or with stale feedback requires code feedback; `done` with fresh `changes-requested` requires a code correction; and only `done` with fresh approved feedback permits advancement. A task marked `done` SHALL NOT be reimplemented merely because conversation context was lost.

- Priority: must
- Rationale: the root ledger is useful only if every driver applies one deterministic resume matrix while leaving detailed files as evidence rather than current-state indexes.

#### Scenario: Session resumes after code but before feedback

- WHEN root progress marks Task 2 `done` and `tasks/task-2/feedback.md` is absent or its latest reviewed head predates Task 2's latest progress commit
- THEN orchestration dispatches code feedback for Task 2 instead of reimplementing it or advancing to Task 3

#### Scenario: Session resumes after feedback requests changes

- WHEN Task 2 is `done`, its latest feedback verdict is `changes-requested`, and that pass is fresh for Task 2's latest progress commit
- THEN orchestration re-dispatches code for Task 2 with the feedback before advancing

#### Scenario: Session resumes after full task approval

- WHEN Task 2 is `done`, its latest feedback verdict is `approved`, and that pass is fresh for Task 2's latest progress commit
- THEN orchestration treats Task 2 as complete and selects the next active task

#### Scenario: Session resumes on an in-progress row

- WHEN root progress marks Task 2 `in-progress` after an interrupted run
- THEN the driver inspects Task 2's current git state and task-local evidence and resumes or resolves that task rather than dispatching another task concurrently

### Requirement: Re-plan reconciles the index without rewriting task history

In re-plan mode, `hamilton-plan` SHALL preserve every done task and its root row unchanged, preserve existing task directories and append-only logs, add a pending row and initialized task progress file for each newly appended active task, and maintain root rows in amended plan order. It MAY update the display title in a non-done task's root row and task-progress heading when the plan changes that title, but SHALL preserve the numeric id, path, status, and prior attempt blocks. A task newly marked abandoned SHALL be removed from the active table without deleting its existing task directory or history. Re-plan SHALL NOT renumber task directories or reuse an abandoned task id for new work.

- Priority: must
- Rationale: stable identifiers and retained logs protect resumability, while the root table must continue to represent the active plan rather than obsolete work.

#### Scenario: Re-plan appends a replacement task

- WHEN Task 2 is marked abandoned and Task 4 is appended as its replacement
- THEN the active table omits Task 2, adds Task 4 as `pending` at its plan position, creates `tasks/task-4/progress.md`, and leaves any existing `tasks/task-2/` files intact

#### Scenario: Re-plan sees a done task

- WHEN Task 1 is already `done`
- THEN re-plan does not alter its task definition, status row, identifier, link, or detailed progress history

#### Scenario: Re-plan renames a pending task

- WHEN re-plan changes the title of pending Task 3 without changing its identity
- THEN the root Task cell and task-progress heading display the new escaped title while `tasks/task-3/`, status `pending`, and existing attempt history remain unchanged

### Requirement: Finish gates validate the task ledger structurally

Before finishing, the system SHALL verify that root progress exists; contains exactly the active plan task identifiers once each and in plan order; uses only the allowed statuses; carries each exact `tasks/task-N/progress.md` link; has every active task marked `done`; and has a task-progress heading declaring the matching `Task N` plus a latest `Outcome: done` attempt in every linked file as evidence for that current state. It SHALL fail closed on a missing, duplicate, extra, reordered, invalid-status, malformed-link, or non-done row, on a missing or wrong-task linked file, or when a done row lacks matching latest done evidence. These task-completion checks SHALL remain independent from task feedback and whole-branch review checks, all of which must pass.

- Priority: must
- Rationale: treating the root file as an authoritative ledger requires validating that it still corresponds to the plan and cannot accidentally omit unfinished work.

#### Scenario: Root ledger omits an active task

- WHEN plan.md contains active Task 1 and Task 2 but root progress contains only Task 1
- THEN the finish gate names Task 2 as missing and remains closed

#### Scenario: Root ledger claims every task is done with valid links

- WHEN the root rows exactly match all active plan tasks in order, every status is `done`, and every linked task progress file exists
- THEN the task-completion portion of the finish gate passes only if each linked file's latest attempt also says `Outcome: done`, after which the separate feedback, review, test, and cleanliness gates continue

#### Scenario: Root link targets another task

- WHEN the Task 3 row links to `tasks/task-2/progress.md`
- THEN the finish gate reports the malformed Task 3 link and remains closed

#### Scenario: Done row has no matching done evidence

- WHEN the Task 3 row says `done` but its linked task progress is empty or its latest attempt says `Outcome: blocked`
- THEN the finish gate reports the inconsistent Task 3 evidence and remains closed

#### Scenario: Linked task progress declares another task

- WHEN the Task 3 row links to `tasks/task-3/progress.md` but that file's heading declares Task 2
- THEN the finish gate reports the wrong-task evidence and remains closed

### Requirement: Finish history has a dedicated append-only artifact

`hamilton-finish-work` SHALL record finish attempts and verified outcomes in root `<change-dir>/finish.md` rather than root progress. After all preconditions pass and specification synchronization is committed, it SHALL append the next `Attempt N` section with passed preconditions, chosen strategy, intended workspace result, and route intent and SHALL commit that section on the change branch before the external finish action begins. After executing and reading back the actual external, workspace, and route state, it SHALL append the matching `Outcome N` as `completed` or `blocked` on the surviving branch or base, commit it, push when the strategy has a remote branch, and verify that persisted result. A precondition failure that performs no finish action SHALL remain a no-write blocking report. A dangling Attempt without Outcome SHALL be reconciled by inspecting external and git state before retrying; finish-work SHALL append the matching outcome or safely continue that attempt and SHALL NOT allocate or execute a duplicate attempt first. The finish step SHALL NOT claim a merge, pull request, no-op completion, route transition, workspace removal, or persisted outcome until it has verified that result.

- Priority: must
- Rationale: finish is change-level history with external side effects, not task execution status; its own artifact preserves honest outcomes without polluting the task index.

#### Scenario: Preconditions fail before finishing begins

- WHEN a finish precondition fails and no finish strategy is attempted
- THEN finish-work reports the blocker without changing `finish.md` or root progress

#### Scenario: A pull request is created and verified

- WHEN finish-work successfully creates and reads back a pull request
- THEN it appends and commits the matching finish outcome containing the verified URL and surviving worktree and branch, pushes it to the pull-request branch, verifies the request includes that commit, and leaves root progress unchanged

#### Scenario: A finishing action fails after it begins

- WHEN an external finish strategy starts but cannot complete
- THEN finish-work appends and persists a blocked matching outcome with verified partial state when it can do so safely and does not report successful completion

#### Scenario: Local merge completes

- WHEN the attempt commit is merged into the base branch and the worktree is removed
- THEN finish-work appends and commits the verified completed outcome on the base branch, naming the merge and removed workspace, without claiming the result before read-back

#### Scenario: No-op completes

- WHEN finish-work selects no-op after passing all gates
- THEN it appends and commits the verified completed outcome on the unchanged change branch and records that the worktree remains

#### Scenario: Resume sees a dangling attempt

- WHEN `finish.md` ends with `Attempt N` and no matching `Outcome N`
- THEN finish-work inspects git, remote, pull-request, route, and workspace state relevant to that strategy before deciding whether to append a completed or blocked outcome or safely continue the same attempt

### Requirement: Legacy formats are inventoried but never interpreted

The new execution, re-plan, feedback, review, and finish contracts SHALL require the root task table and nested task layout once `plan.md` exists and SHALL NOT parse, migrate, or accept a planned change that stores task attempts in root progress, task verdicts in root review, or lacks required split scaffolding. A change directory with no `plan.md` SHALL remain a valid `pre-plan` state and SHALL NOT be classified as legacy merely because progress is absent. `hamilton-change-context.sh --all` SHALL continue inventorying unsupported planned historical directories by labeling their format `legacy-unsupported` without deriving task or verdict state from old sections, and SHALL continue to later entries. Direct context on one such directory SHALL report the unsupported format and SHALL NOT present inferred current status as authoritative.

- Priority: must
- Rationale: the user selected an atomic between-changes migration, but the repository retains completed history that a global inventory must encounter without crashing or quietly treating as the new contract.

#### Scenario: Global inventory sees old and new changes

- WHEN `--all` encounters one monolithic legacy change and one split-format change
- THEN it labels the first `legacy-unsupported`, reports only parsed current state for the second, and completes the inventory without converting either

#### Scenario: Global inventory sees a propose-only change

- WHEN a change contains proposal, requirements, or design but no `plan.md`
- THEN context reports it as `pre-plan` with artifact presence and does not label it legacy or require progress scaffolding yet

#### Scenario: New execution targets an old-format change

- WHEN re-plan, code, feedback, review, or finish is invoked on a planned change without the required new task ledger and nested artifacts
- THEN it stops with the between-changes migration boundary instead of reconstructing or creating partial new state

#### Scenario: A split task log presents pre-contract attempt syntax

- WHEN any task progress file still presents `## Task N: <title> — <date>` or another noncanonical attempt heading
- THEN execution, context, review, and finish treat it as malformed and do not interpret it; the one-time normalization of this change's exact Task 1 and Task 4 files creates no parser exception

#### Scenario: Direct context targets an old-format change

- WHEN change-context is invoked directly on a legacy directory
- THEN it reports `legacy-unsupported` and artifact presence but does not claim task completion, feedback, or final-review standing

## MODIFIED Requirements

*(none)*

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
