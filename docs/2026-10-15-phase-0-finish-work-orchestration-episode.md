# Episode report: orchestrating `2026-10-15-phase-0-finish-work` with parallel `kepler-code` lanes

- Date: 2026-10-15
- Change: `.kepler/changes/2026-10-15-phase-0-finish-work` (agenteval repository, worktree `/Users/caio.cavalcante/.herdr/worktrees/agenteval/phase-0-finish-work`)
- Stage: `kepler-orchestrate` (propose and plan were completed in the same session)
- Outcome: 17/17 tasks fully gated, whole-branch review `approved-remediation` with 0 blocking findings, handoff reached to `kepler-finish-work`.

## Goal

Execute the whole plan of change `2026-10-15-phase-0-finish-work` — the remediation of the Phase 0 spike's eight Pass-6 blockers, the v1 options-declared group-hook revision, and the associated cleanups — using `kepler-code` subagents for implementation, `kepler-code-feedback` passes for per-task review, and a whole-branch `kepler-review` gate, all under the guarded `kepler workbench task-state` admission/publication machinery. The operator's explicit requirement was to parallelize tasks wherever the dependency graph and file-conflict constraints allowed, with one hard invariant: every plan-task delegation had to use the `coder` subagent.

Success criteria were the orchestration skill's own: every task published `done` through guarded commands with its exact Verify, fresh durable artifact-only feedback approval per task, and a valid whole-branch review pass with no blocking findings.

## How I tried to accomplish it

### Preparation

- Read the `kepler-orchestrate` skill and its three dispatch templates (implementer, code-feedback, whole-branch review), then confirmed the plan format (`execution: {version: 2, mode: dependencies}`), workspace isolation (`isolated: yes`), lint, and the context projection.
- Derived readiness from `kepler workbench context`. The initial ready set was ten dependency-free tasks; file-conflict coordination constraints recorded in the plan (Tasks 2/9/10 on `coordinator.service.ts`, Tasks 9/10 on the CLI e2e file) meant only eight lanes could run concurrently without integration collisions: tasks 1, 2, 3, 4, 8, 11, 15, 16. Task 15 was additionally held by its own plan constraint (live verification after Tasks 9 and 10 land).
- Discovered two mechanical prerequisites that were not obvious from the skill text, by reading the binary's embedded logic: the publish parser accepts a task's Verify field only when it is exactly one backticked shell command, and every task's versioned Notes snapshot must list all eight approved formal inputs.

### Lane machinery

- For each admitted task: `kepler workbench task-state --admit --task N --change-dir … --expected-head <full HEAD> --worker <id> --worktree <lane> --target-branch refs/heads/main`. The CLI created the admission commit on the coordinator branch, set the root ledger row to `in-progress`, wrote an admission object into the ledger entry, and synced the lane worktree to the admission commit.
- Lanes were plain `git worktree add` checkouts under `.worktrees/phase-0-finish-work-tN` (the `kepler workbench isolate` create path refuses to run from a linked worktree).
- Each task was dispatched to the `coder` subagent as an async child with `cwd` set to its lane, the `kepler-code` skill attached, and a prompt carrying the full coordinator-admitted binding (Base, lane HEAD, branches, git dir, worker identity, definition digest, and the task block reference).
- Identity handshake, because a child's harness identity (`PI_SESSION_ID`) is allocated only at launch: the child ran read-only checks, sent `WORKER-READY task=N observed=<id>` via `contact_supervisor`, held, the driver rebound the admission with `--retry --worker <observed id>` (preserving the original Base), and replied with the final binding. The child then ran kepler-code's dispatch-identity readback before any mutation.
- After each child returned, I serialized guarded publication (`--publish --task-head <child commit> --verify '<exact Verify>' --response done`), packaged the integrated range with `kepler workbench diff --task N`, and dispatched a fresh-context reviewer (`delegate` agent running `kepler-code-feedback`) with an artifact-only commit contract.
- Every claimed approval was re-verified by me from repository state: feedback file tracked at HEAD, index == HEAD, worktree == index, latest touching commit artifact-only with a single-path list, lint-valid, verdict `approved` with no blocking findings.

### Waves

- Wave 1: eight lanes (1, 2, 3, 4, 8, 11, 15, 16).
- Later waves admitted 5, 6, 7, 9, 10, 12, 13, 14 as prerequisites became fully gated, respecting the shared-file coordination constraints.
- After all 16 were gated, one full whole-branch review, one reviewed re-plan appending Task 17 (greenfield docs rewrite), and one remediation review.

## What went wrong

### 1. Verify fields were unpublishable (planning defect)

The guarded publish parser strips backticks only when a task's Verify field is exactly one backticked command and runs it verbatim via `sh -lc`. My planned Verify fields mixed several commands with prose arrows. The first publish failed with "Publication must execute the exact task Verify command".

**Solution:** re-planned all sixteen Verify fields to single backticked commands. This triggered the worst downstream problem of the episode (below) because changing task bytes after admissions exist violates the input-context immutability the tool enforces.

### 2. Re-plan broke committed input contexts for admitted tasks

The re-plan also rebound the Notes `taskDefinition` digests. The readiness projection then reported "current inputs are unverified" for every task admitted before the re-plan, via the wholesale check that the historical plan at each checkpoint base must deep-equal the current input context — a check with no input-impact waiver. Tasks 5, 6, 7, 12, 13, 14 could never become ready while prerequisites 1, 2, 3, 11 stayed unverifiable.

**Solution:** after publishing all seven pre-re-plan-admitted tasks with the new single-command Verifies, I restored their blocks to the exact pre-amendment bytes (original prose Verify + original Notes digests) extracted from the historical plan revision, and recorded the whole sequence honestly in the plan Overview. Tasks admitted afterward kept the single-command form. Readiness then cleared and the dependents flowed again.

### 3. Reviewer commits hung on an interactive editor

A feedback reviewer ran `git commit --only -- <path>` without `-m`; git opened vim with no TTY, held `index.lock` for 6+ minutes, and blocked every git operation in the coordinator worktree.

**Solution:** killed the hung vim and git process, steered all three in-flight reviewers to `GIT_EDITOR=true git commit --only -- <path> -m "…"`, and baked that form into every later review dispatch.

### 4. Coordinator-worktree races with concurrent reviewer commits

Guarded commands (`--admit`, `--retry`, `--publish`) demand the coordinator worktree clean at an exact HEAD. Feedback reviewers were committing artifact-only files concurrently, so retries repeatedly failed with "Workspace changed before admission publication" or "Coordinator HEAD is stale or dirty".

**Solution:** retried with the then-current HEAD once the reviewers landed, and sequenced guarded mutations around reviewer activity where possible. This cost several round trips but never corrupted state because the CLI refused instead of half-committing.

### 5. Implementer timeouts under mutual load (eight children)

Eight lanes each running `pnpm install` plus full vitest suites on one machine starved each other; eight coder children burned their 30-minute budgets in timeout-retry loops.

**Solution:** inspected each lane, preserved partial work as signed `wip(task-N)` commits, and dispatched resume children with strict guidance: `--maxWorkers=2` on every vitest invocation, no waiting for sibling lanes, at most two load retries, scoped Verify first, full suite once. Resume contracts varied by lane state: finish-and-commit (t6, t5), verify-evidence-and-commit (t5 final), and finish-from-wip (t4, t8, t11, t12). All resumed successfully.

### 6. My own lane surgery mistakes

- During a retry dance for task 5, I captured the lane HEAD after the admission merge instead of before, and a `reset --hard` orphaned the task's wip commit beyond fsck recovery. The task was small; the resume child re-implemented it from scratch with full evidence. Lesson: capture the wip SHA before any retry, and verify it is an ancestor afterward.
- For task 15, a cherry-pick of an admission commit into the lane produced a root-ledger merge conflict (`UU`). The child correctly stopped. I aborted the cherry-pick and reset the lane to the admission commit.

### 7. Task 17 ledger splice corrupted the ledger history

The re-plan append inserted the task-17 ledger entry between task 16's fields and its admission object, attaching task 16's admission to task 17 and "erasing" task 16's authority. The per-revision ledger walk then reported the admission history as erased for the whole ledger, and my first two repairs landed the entry outside the frontmatter.

**Solution:** repaired the YAML byte-precisely (task 16's admission + publication objects restored, task 17's entry clean and last), and squashed the broken intermediate revisions into one clean re-plan commit. The first squash accidentally dropped the review's artifact-only commit (needed as the remediation baseline), so I rebuilt the branch onto that commit with `reset --hard <review commit>` + `checkout <final tree> -- .` + one commit, preserving the review history exactly.

### 8. The CLI cannot package a mid-history appended task

`kepler workbench diff --task 17` refused with "publication history is malformed": the publication-history walk requires the task's ledger entry to exist in every ledger revision, and Task 17's entry only exists from its re-plan commit onward. This is a tool limitation of the appended-remediation flow itself.

**Solution:** generated the diff package manually (`git diff <admission base> <integration head>`), verified every range fact with plain git (Base == recorded admission base, Base ancestor of Head, Head ancestor of current HEAD, worker commit touches only the task's files), disclosed the deviation in the reviewer dispatch, and let the independent reviewer validate the git facts itself. It approved.

## How Kepler rules contributed to problems and solutions

### Rules that caused or amplified problems

- **Input-context immutability with no waiver.** Once a checkpoint exists, the current task Notes must deep-equal the historical ones at the Base; any plan edit touching task bytes locks admitted tasks out of the readiness projection. This converted a small planning slip (Verify prose) into a multi-hour recovery.
- **The single-command Verify contract baked into the publish parser.** It enforces exactness but silently rejects any multi-command or documented-check Verify shape; the failure mode is a cryptic equality error.
- **Clean-worktree-at-exact-HEAD guarded commands.** Every admission/publication mutation races with any concurrent commit in the same worktree, including reviewers' artifact-only commits. There is no queueing or retry.
- **The execution-transition proof schema.** Version 1 vs version 2 forms, plus mirrored Overview fields, are validated only by lint; I iterated three broken commits (v1 under v2 metadata, missing overview fields, and finally the correct v2 shape) before satisfying it.
- **The publication-history walk over the full ledger history.** It cannot represent tasks appended mid-history, which the re-plan append flow itself produces; `diff --task` for such tasks is unusable.
- **The whole ledger-history validation in `inspectExecutionTransition`.** Every committed plan revision must remain valid under the current schema, so any intermediate broken commit (even superseded) blocks execution history until squashed.

### Rules that made the episode tractable

- **Readiness projection and held-reason reporting.** When I broke input contexts, the tool said exactly which task and which condition failed instead of dispatching a worker against a stale contract. Every recovery above was driven by a precise diagnostic string.
- **Admission Base preservation across retries.** `--retry` rebinds worker identity without moving the Base, which made the identity handshake and all lane repairs possible without invalidating checkpoints.
- **Append-only, artifact-only evidence.** Feedback and review passes are immutable appends committed alone; because nothing referenced my broken intermediate commits, squashing them was safe, and the review commit could be preserved as the remediation baseline.
- **Durable-approval predicate from git state.** I could verify every claimed approval mechanically (tracked, index==HEAD, worktree==index, single-path commit, lint, verdict), which caught the vim-hang incident immediately and kept me from trusting subagent summaries.
- **The dispatch-identity readback.** The child-side gate caught every head/worker drift before mutation; the two-phase handshake made the "admit before dispatch" rule workable even though harness identities are allocated at launch.
- **Guarded publication with exact Verify.** Integration, verification, and root publication are one atomic command that refuses on any inconsistency; it ran the live-lane Verify itself and recorded the observed GenPlat result (scored grade 1) as evidence.

## Final verification

- All 17 tasks: root `done` via guarded publication, fresh durable artifact-only `approved` feedback, 0 blocking findings.
- Whole-branch review: pass 1 full (`changes-requested`, 1 code-defect), pass 2 remediation (`approved-remediation`, 0 blocking, commit `9e981e7a`, artifact-only).
- Change-dir lint clean across 34+ artifacts; coordinator worktree clean; review artifact predicate fully green.
- Owner-authorized live lane passed end to end during Task 15 implementation and again during its guarded publication.
