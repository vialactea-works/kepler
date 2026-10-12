# Proposal: Separate task execution and feedback from whole-branch review

| Field | Value |
|---|---|
| Change | 2026-09-04-split-hamilton-review |
| Status | approved |
| Author | Hermes Agent |
| Created | 2026-09-04 |
| Ledger task | 01M145SNN1N2TW2EF7SD2SSDV9 |

## Why

`hamilton-review` currently carries two materially different contracts: tactical feedback on one task's diff and the final review of the whole branch. The shared name and dispatch prompt let an agent apply the narrow task-diff boundary to the merge gate or apply an expensive repository-wide review to every task. The ambiguity is visible in `hamilton-orchestrate`, which invokes the same skill for both scopes while describing them as different jobs.

The shared `review.md` artifact compounds the ambiguity by interleaving task verdicts and the whole-change verdict in one file. Scope is encoded in headings rather than ownership, so the finish gate and change-context helper must parse a mixed stream to recover which review approved what.

Task execution history has the same ownership problem. Root `progress.md` currently accumulates every task attempt and may also receive review and finish summaries. Every task implementation edits one shared, ever-growing file; resuming orchestration requires parsing that mixed timeline; and a task-scoped agent receives a change-level artifact containing sibling history it does not need. A root ledger should answer which tasks are pending, in progress, blocked, or done, while each task owns its detailed execution record and non-task stages own their own histories.

This change necessarily began self-hosting before the split pipeline it defines could produce all of its own evidence. Tasks 1–13 received task feedback after later task implementation had advanced, and Task 1 and Task 4 recorded attempts with the pre-contract task-titled heading rather than the canonical numbered attempt heading. Rewriting existing commits to manufacture the eventual pipeline order would destroy honest branch history; keeping a generic legacy parser would turn a bootstrap condition into product compatibility.

## Goals & Success Criteria

- Promote `hamilton-code-feedback` to core pipeline step 4, make `hamilton-review` the whole-branch-only step 5, and renumber `hamilton-finish-work` to step 6 across every maintained pipeline contract and user-facing diagram.
- Give `hamilton-code-feedback` a self-contained tactical contract that reviews exactly one `Task N` diff, returns `approved` or `changes-requested`, and persists each pass under `<change-dir>/tasks/task-N/feedback.md`.
- Give `hamilton-review` a self-contained whole-branch contract that always examines affected repository context beyond the branch diff, returns the same verdict vocabulary, and persists each pass in `<change-dir>/review.md`.
- Commit each task-feedback or whole-branch review pass as an artifact-only bookkeeping commit before handing control back, so its verdict survives compaction and is never absorbed by a later coder commit.
- Make scope misuse fail clearly: a task-scoped `hamilton-review` invocation directs the caller to `hamilton-code-feedback`, while whole-branch input is outside `hamilton-code-feedback`'s contract.
- Make root `<change-dir>/progress.md` a task-only index and authoritative execution ledger, with one row per active plan task in plan order, the current status `pending`, `in-progress`, `blocked`, or `done`, and a relative link to `tasks/task-N/progress.md`.
- Make `hamilton-plan` initialize the complete progress index and every linked task progress file with all active tasks pending; make each `hamilton-code` invocation update only its assigned row and append detailed attempt evidence only to that task's progress file.
- Give each task a stable ignored diff checkpoint at `tasks/task-N/.base`, recorded before its first implementation attempt and reused for code-feedback packages across corrections and resumes instead of sharing one change-level `.base`.
- Make orchestration resume from the root ledger without loading sibling task histories, while consulting each task's separate feedback verdict and reviewed-head freshness before deciding whether a `done` implementation needs code, fresh feedback, or advancement.
- Make a whole-branch `changes-requested` verdict return to `hamilton-plan` re-plan mode, where one or more numbered remediation tasks are appended and initialized in the ledger before entering the normal code and code-feedback loop and then repeating whole-branch review; if a finding invalidates approved requirements or design, stop and return upstream instead of planning around it.
- Move whole-branch review history exclusively to `review.md` and finish attempts and verified outcomes to a dedicated root `finish.md`; neither stage appends timeline entries to root `progress.md`.
- Keep the finish gate closed until the progress index exactly represents the active plan tasks, every active task is `done`, every latest task feedback verdict is approved and fresh for that task's latest implementation commit, and the latest whole-branch review is approved and fresh relative to code, except for the existing explicit user-controlled whole-branch freshness waiver.
- Install distinct root-index `progress.md`, task-detail `task-progress.md`, task-feedback `feedback.md`, whole-branch `review.md`, and finish-history `finish.md` templates, and make change-context output report the split state without parsing detailed task logs for ordinary resume decisions.
- Remove the tracked legacy `.hamilton/templates/` copies rather than update a second divergent template tree; `bundle/templates/` remains the repository's only canonical source and `~/.hamilton/templates/` remains the installed destination.
- Update `hamilton-orchestrate` to use separate dispatch prompts and skills for the per-task feedback loop and the final whole-branch gate.
- Add automated contract and fixture coverage proving pipeline scopes, artifact paths, task-status transitions, re-plan reconciliation, resume behavior, verdict outcomes, orchestration order, setup installation, and finish-gate behavior.
- Publish migration guidance that tells users to update the Hamilton skill, template, and helper set between changes, replace task-scoped `hamilton-review` calls with `hamilton-code-feedback`, and begin new changes with the split task directory and progress-ledger layout.
- Resolve this change's two already-incurred self-hosting deviations without rewriting git history: accept the backfilled Task 1–13 feedback chronology and permit remediation to normalize only the pre-contract Task 1 and Task 4 attempt headings into canonical numbered syntax.

## Non-Goals

- Do not support legacy change directories that mix task and whole-change sections in `review.md` or append detailed attempts into root `progress.md`; users adopt the new skill set between changes rather than during one.
- Do not interpret an inventory label for a completed old-format change as compatibility: the new context view may identify it as `legacy-unsupported`, but no new skill parses its state, resumes it, migrates it, or passes it through finish.
- Do not automatically migrate historical or active change artifacts, and do not edit historical `.hamilton/changes/` directories to match the new layout. The exact Task 1 and Task 4 heading repair approved below is forward remediation of this active change, not a migration workflow.
- Do not treat the stale project-local `.hamilton/templates/` directory as historical change evidence or preserve it as a compatibility source.
- Do not retain a task-diff compatibility mode inside `hamilton-review`, add aliases, or silently infer the intended scope.
- Do not change the verdict vocabulary from `approved` and `changes-requested` or weaken any finish precondition.
- Do not broaden the existing explicit freshness waiver: it may waive stale whole-branch-review ancestry only and never substitute for stale task feedback or a missing or unapproved task feedback or whole-branch review.
- Do not require `hamilton-review` to rerun the full test suite or build; focused checks remain available when broad inspection raises a concrete doubt, and `hamilton-finish-work` owns the mandatory full verification.
- Do not put review verdicts, finish outcomes, changed-file lists, verification output, notes, or attempt history into the root task index.
- Do not introduce a shared cross-skill review engine, generated skill variants, runtime service, dependency, configuration flag, task database, or CLI command.
- Do not generalize this change's bootstrap disposition into product compatibility, a change-slug special case, or an alternative parser grammar. Every future planned change—and every new remediation task created after this approval—uses the strict split layout, canonical `## Attempt N — <date>` syntax, and an artifact-only task-feedback commit before the next task checkpoint.

## Approved Self-Hosting Bootstrap Exception

For `.hamilton/changes/2026-09-04-split-hamilton-review/` only, approval accepts exactly two historical deviations caused by implementing the pipeline that would otherwise have produced its evidence. First, the existing feedback artifacts for Tasks 1–13 may remain committed after later task implementation rather than before the next task checkpoint. Second, remediation may normalize the existing Task 1 and Task 4 progress attempt headings to canonical `## Attempt N — <date>` syntax in physical order while preserving every date, evidence body, and attempt order.

Both dispositions are forward-only and non-destructive: existing commits are not rewritten, reordered, squashed, or recreated, and any normalization lands as a new remediation commit so the original representation remains available in git history.

The exception approves no legacy input grammar and requires no runtime branch for this change. Strict split parsing, canonical attempt syntax, and feedback-before-next-checkpoint sequencing remain normative for all future planned changes and for all new work after this approval. The exception resolves only the feedback-chronology finding without code or artifact repair; the legacy-parser finding remains blocking until remediation removes the fallback and normalizes the two exact progress files. The other 17 blocking findings in whole-branch review Pass 1 remain fully in force, as do every review, freshness, cleanliness, verification, and finish gate.

## Proposed Change

Add `skills/hamilton-code-feedback/` as a self-contained pipeline skill for task-scoped feedback. It receives one plan task, that task's diff package, task-local `progress.md` as the implementer's durable evidence, and binding constraints; it keeps inspection centered on the diff except for a concrete named risk, records append-only verdict passes in `tasks/task-N/feedback.md`, commits only that feedback artifact before handoff, and returns control to the code-feedback loop without modifying either progress file. Retire the duplicate scratch implementer report-file handoff: the implementer returns a concise status and commit summary, while detailed claims live once in the task progress file.

Narrow `skills/hamilton-review/` to the final whole-branch gate. It starts from the complete branch diff, root task ledger, linked task evidence as needed, and all change-level intent, then deliberately inspects the broader repository for affected consumers, assumptions, cross-task interactions, missing updates, and boundary violations. It may run focused verification for a concrete doubt but leaves the mandatory full suite and build to finish-work. It records and commits only `review.md` before handoff; a task-scoped request stops with migration guidance instead of falling back to the old behavior.

Change execution persistence at the same task boundary. `hamilton-plan` writes `plan.md`, initializes root `progress.md` as a Markdown task table, and creates `tasks/task-N/progress.md` for every active task. Each root row contains the exact `Task N` identity and title, one current status from `pending | in-progress | blocked | done`, and the exact relative link to its task log. Before a task's first implementation attempt, the driver records current `HEAD` in ignored `tasks/task-N/.base`; correction passes preserve that checkpoint so feedback continues to judge the complete task range. `hamilton-code` then sets its assigned row to `in-progress`, appends one completed attempt with changed files, verification evidence, notes, and `done` or `blocked` outcome to that task's file, and updates the row to the same final state. A later correction may move `done` or `blocked` back to `in-progress`; root status remains the current implementation truth, while the linked file remains append-only evidence.

Make orchestration and helper scripts consume the new ownership directly. Each feedback and whole-branch review pass records the base and head it actually reviewed. `hamilton-orchestrate` reads the root table to choose the implementation resume point, combines a `done` row with the latest task feedback verdict and reviewed head to decide whether to request fresh feedback, re-dispatch code, or advance, and opens a task log only when it needs that task's evidence. `hamilton-change-context.sh` validates and summarizes root rows, task feedback freshness, and whole-branch review separately. `hamilton-precondition-check.sh` fails closed unless root task identities, order, links, and statuses agree with active `plan.md` tasks, every active row is `done`, every corresponding feedback file is approved for the latest commit that touched that task's progress, and root review is approved for a head containing the latest material change commit. Material-change calculation excludes only this change's root and task progress, task feedback, root review, and finish bookkeeping; requirements, design, plan, canonical specs, maps, and source files remain review-relevant even when they live under `.hamilton/`.

Because repository-wide context inventory encounters completed historical changes, `hamilton-change-context.sh --all` treats a directory with no plan as a legitimate `pre-plan` change, but labels a planned change that carries monolithic progress/review markers or lacks the required split ledger as `legacy-unsupported` and continues listing other changes without parsing old status sections. Direct new execution, planning-resume, review, or finish entry against that planned unsupported format stops with the between-changes migration message; there is no fallback interpretation or conversion.

When the whole-branch review requests changes, orchestration does not run an ownerless fix wave or assign findings retroactively to completed tasks. It invokes `hamilton-plan` in re-plan mode with the complete findings. Findings consistent with the approved requirements and design become one or more cohesive numbered remediation tasks with pending rows and task progress files, then run through the ordinary code and code-feedback loop before the branch is reviewed again. A finding that requires changing approved intent or architecture stops the loop and returns to `hamilton-propose` rather than being disguised as an implementation task.

Split the artifact templates accordingly. Rewrite installed `progress.md` as the root task index, add `task-progress.md` for each nested execution log, add `feedback.md` for task verdicts, narrow `review.md` to whole-branch passes, and add `finish.md` for append-only finish attempts and verified outcomes. Finish-work no longer writes root progress; after its preconditions pass, it records the finishing strategy and actual verified result in `finish.md` while preserving honest completion and workspace-disclosure rules. A precondition failure that performs no finish action remains a no-write blocking report so it does not dirty an already blocked tree.

Delete the tracked `.hamilton/templates/` tree instead of mirroring the new shapes there. Those files predate the bundled installation model, already diverge from `bundle/templates/`, are not read by the current pipeline, and violate the canonical artifact-template invariant that a shape has one definition. This cleanup does not touch `.hamilton/changes/`, `.hamilton/specs/`, or `.hamilton/maps/` history.

Re-plan mode reconciles the root index with the amended plan without rewriting history: done tasks stay frozen; existing active rows and task files retain their status and evidence; newly appended active tasks receive pending rows and new task progress files; tasks explicitly marked abandoned leave the active table while their task directories remain intact. Update setup expectations, artifact documentation, the seven-step framework narrative, all skill handoffs, and migration guidance in the same version.

## Capabilities

### New

- `execution`: define the root task progress index, task-local execution logs, status transitions, deterministic resume behavior, re-plan reconciliation, and dedicated finish history.
- `review`: define separate task-feedback and whole-branch review contracts, their orchestration order, artifact ownership, scope failures, verdicts, and finish gates.

### Modified

- `artifact-templates`: redefine `progress.md` as the task index, add `task-progress.md`, `feedback.md`, and `finish.md`, narrow `review.md` to whole-branch review, remove the stale project-local duplicate template tree, and install and document every shape.
- `framework-docs`: change Hamilton's public identity from six to seven core skills, renumber downstream stages, document each review scope and the split execution artifact tree, and publish the clean-cut migration between changes.

### Removed

*(none)*

## Impact

The primary implementation surfaces are `skills/hamilton-code-feedback/`, `skills/hamilton-review/`, `skills/hamilton-orchestrate/` and its implementer and reviewer prompt references, `skills/hamilton-plan/`, `skills/hamilton-code/`, `skills/hamilton-finish-work/`, the embedded pipeline identity in every other live core skill and critique, `bundle/templates/progress.md`, new `bundle/templates/task-progress.md`, new `bundle/templates/feedback.md`, narrowed `bundle/templates/review.md`, new `bundle/templates/finish.md`, other bundled template cross-references and `bundle/templates/README.md`, deletion of the tracked legacy `.hamilton/templates/` tree, `bundle/scripts/hamilton-diff-package.sh`, `bundle/scripts/hamilton-change-context.sh`, `bundle/scripts/hamilton-precondition-check.sh`, setup and script tests, new skill-contract tests or fixtures, `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md`, and `CONTRIBUTING.md`. Finish-work will fold the four requirement deltas into `.hamilton/specs/execution.md`, `.hamilton/specs/review.md`, `.hamilton/specs/artifact-templates.md`, and `.hamilton/specs/framework-docs.md`.

This is a deliberate breaking Assisted-mode migration. A user finishes an active change with its existing Hamilton installation, then updates all affected skills, templates, and helper scripts and runs `hamilton setup` before beginning the next change. No application API, dependency, database, CLI command, or task-ledger record changes.
