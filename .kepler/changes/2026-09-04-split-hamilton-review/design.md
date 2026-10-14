# Design: Separate task execution and feedback from whole-branch review

## Context

Hamilton's current `hamilton-review` skill accepts either a task's commit range or the full change against its base. Its procedure and local code-quality rubric are diff-oriented, while `hamilton-orchestrate` also calls it a broad whole-branch merge gate. The shared reviewer dispatch template explicitly limits repository crawling for both calls, so the final gate can inherit the tactical reviewer's context boundary even though the task ledger and finish gate expect it to establish a stronger whole-change decision.

Review persistence is similarly multiplexed. `bundle/templates/review.md` parameterizes a machine-checkable scope, `hamilton-review` appends both `Task N` and `whole change` sections, `hamilton-precondition-check.sh` classifies those headings, and `hamilton-change-context.sh` reconstructs current status from the mixed stream. The finish gate already expresses the right policy—every task approved plus a fresh final approval—but the storage and producer boundaries do not.

Root `progress.md` is a second mixed stream. It receives append-only task attempts and can receive review and finish summaries, so every task-scoped coder modifies one shared file and every resume path reparses historical detail to discover current task state. That design leaks sibling task history into narrow agents, creates avoidable write contention, and gives review, finish, current status, and execution evidence overlapping ownership.

The user chose a deliberate wider migration. Hamilton will have seven core pipeline skills: `hamilton-code-feedback` becomes step 4, `hamilton-review` becomes whole-branch-only step 5, and `hamilton-finish-work` becomes step 6. Root `progress.md` becomes a task-only index and authoritative current-status ledger; each task owns `tasks/task-N/progress.md` and `tasks/task-N/feedback.md`; root `review.md` owns whole-branch review; and root `finish.md` owns finish attempts and verified outcomes. The new format is adopted atomically between changes with no parser or artifact migration for the old mixed layout.

## Goals / Non-Goals

**Goals**

- Give tactical code feedback and final branch review separate names, inputs, inspection boundaries, artifacts, prompts, and handoffs.
- Make whole-branch review always inspect affected repository context outside the branch diff while keeping task feedback tightly diff-scoped.
- Make root progress answer current task standing and navigation without carrying any detailed history.
- Put each implementation attempt beside its task and let task-scoped agents read and write only their assigned detailed log.
- Initialize the complete progress structure during planning so manual and orchestrated execution share one valid starting state.
- Preserve `approved` and `changes-requested` for review verdicts, add the exact implementation statuses `pending`, `in-progress`, `blocked`, and `done`, and keep implementation completion independent from feedback approval.
- Make resume, re-plan, review remediation, and finish gates deterministic from the plan, root ledger, task files, commit-bound feedback, and commit-bound final review.
- Move finish history out of progress and record actual verified finishing outcomes in `finish.md`.
- Promote the review split into a coherent seven-step pipeline across every live skill and documentation surface.
- Verify Markdown contracts and executable helper behavior with focused contract tests and representative artifact fixtures.

**Non-Goals**

- No compatibility parser, automatic migration, or manual conversion workflow for change directories created under mixed `review.md` or monolithic root-progress formats.
- No task mode in `hamilton-review`, whole-branch mode in `hamilton-code-feedback`, silent scope inference, or shared dispatch prompt.
- No review, feedback, finish, verification, changed-file, note, or attempt content in the root task index.
- No mandatory full-suite or build execution inside whole-branch review; finish-work retains that deterministic gate.
- No shared cross-directory review reference, generated skills, plugin system, runtime service, CLI command, task database, dependency, or configuration switch.
- No synthetic remediation task absent from `plan.md`, ownerless final fix wave, or retroactive mutation of frozen completed task definitions.
- No edits to historical `.hamilton/changes/` artifacts beyond this change directory.

## Decisions

### Decision: Promote code feedback into a seven-skill core pipeline

- Choice: define `hamilton-code-feedback` as step 4, move `hamilton-review` to step 5, and move `hamilton-finish-work` to step 6. Redraw the core flow as `init → [propose] → plan → code ↔ code-feedback → review → finish-work`, with review entered only after every active task is implemented and feedback-approved. Update every live skill body that embeds the sequence and every maintained pipeline diagram, including `docs/modes.md`; historical change artifacts remain untouched.
- Alternatives considered: preserve six core steps and treat code feedback as an internal helper; describe feedback and review as peer sub-stages under one unnamed review step.
- Rationale: the user explicitly accepted the public identity and renumbering cost so the tactical gate is discoverable as a first-class stage. Wayfinder and critique remain optional non-core stages.

### Decision: Use self-contained review skills with hard scope boundaries

- Choice: create `skills/hamilton-code-feedback/` with a complete tactical procedure and local diff-focused code-quality reference, and rewrite `skills/hamilton-review/` with a complete whole-branch procedure and local branch-impact reference. Code feedback requires exactly one `Task N` and task range; whole-branch input stops and names `hamilton-review`. Review requires the merge-base-to-HEAD range; task input stops and names `hamilton-code-feedback`. Neither writes an artifact on scope failure.
- Alternatives considered: thin skills backed by a shared review reference; generated variants from one source; a deprecated task mode in review; scope inference from the diff.
- Rationale: Hamilton skills are portable directories that users may install independently. A small amount of deliberate rubric overlap is safer than a hidden sibling dependency, and a hard stop removes rather than preserves the naming ambiguity.

### Decision: Make root progress a plan-ordered task index and status ledger

- Choice: rewrite root `progress.md` as a Markdown table with exactly `Task`, `Status`, and `Progress` columns. It contains exactly one row per active plan task, in plan order. The Task cell renders `Task N: <title>` with Markdown table delimiters escaped, Status is one of `pending | in-progress | blocked | done`, and Progress links to `tasks/task-N/progress.md`. Root progress contains no append-only sections or stage summaries and is the sole current implementation-status source.
- Alternatives considered: keep the mixed append-only timeline and derive current state; add a separate status file while retaining the old progress log; put status into `plan.md`.
- Rationale: the familiar root path remains the resume entry point, but current state becomes directly readable. Keeping status out of the declarative plan preserves plan immutability outside re-plan mode, while task links separate current state from evidence.

### Decision: Have planning initialize the index and every task log

- Choice: when `hamilton-plan` writes a new plan, it also writes root progress from the revised `progress.md` template and initializes every active task's `tasks/task-N/progress.md` from a new installed `task-progress.md` template. New rows start `pending`. Task identity is always the numeric `Task N` encoded as lowercase `task-N`; titles never determine paths. Plan remains the sole declarative implementation contract, while progress becomes required operational scaffolding created beside it.
- Alternatives considered: let the first code invocation create the full index; let orchestrate create it; leave pending links pointing to files that do not exist yet.
- Rationale: plan is the only stage that sees the complete task set on both manual and orchestrated paths. Initializing all targets makes every index link valid immediately without asking a task-scoped coder to inspect sibling tasks.

### Decision: Remove the stale project-local template mirror

- Choice: delete the tracked `.hamilton/templates/` tree and define every changed or new shape only under `bundle/templates/`. Keep `~/.hamilton/templates/` as the installed user-level destination and leave project histories under `.hamilton/changes/`, `.hamilton/specs/`, and `.hamilton/maps/` untouched.
- Alternatives considered: update both template trees; leave the stale files unchanged; repurpose `.hamilton/templates/` as project overrides.
- Rationale: the canonical `artifact-templates` spec already says a shape has exactly one definition in the bundle, current skills never read project-local templates, and the tracked copies already differ. Updating two trees would preserve a known source-of-truth violation, while project overrides would introduce an unrequested resolution layer.

### Decision: Keep task execution evidence append-only and task-local

- Choice: a task's nested `progress.md` identifies one task and appends one dated block per completed code attempt with `Outcome: done | blocked`, changed paths, verification commands and observed results, and notes or deviations. At invocation start, code changes only its assigned root row to `in-progress`. At attempt end, it appends task-local evidence and changes that row to `done` or `blocked` in the same task commit when implementation lands. A gracefully blocked attempt with no valid implementation commit stages and commits only root and task-local progress, leaving partial production edits uncommitted and named; a hard interruption may leave `in-progress` dirty for recovery. A retry or feedback correction may move `blocked` or `done` back to `in-progress`. Feedback and review never write either progress file.
- Alternatives considered: one change-level attempt log; a separate status sidecar per task; let feedback update implementation status; treat `done` as irrevocable before feedback.
- Rationale: task-local evidence matches the coder and tactical reviewer context boundary. `done` means the latest implementation attempt completed; the separate feedback file decides whether it may advance, so a requested correction can reopen implementation without falsifying prior attempts.

### Decision: Move the stable diff checkpoint into each task directory

- Choice: extend `hamilton-diff-package.sh` so task mode resolves an exact `Task N`, stores the first pre-implementation `HEAD` in ignored `tasks/task-N/.base`, and packages every feedback pass for that task from the unchanged checkpoint through current `HEAD`. A retry or changes-requested correction never overwrites it. Whole-change mode remains merge-base-to-HEAD and uses no task checkpoint.
- Alternatives considered: keep the shared `<change-dir>/.base`; infer `HEAD~1`; write the base only into conversation or a transient report; reset the base before each correction.
- Rationale: one shared checkpoint is mutable cross-task state and loses ownership after compaction. A task-local checkpoint makes the complete review range durable, prevents later tasks from overwriting it, and preserves all task commits and corrections in every feedback pass.

### Decision: Bind verdicts to reviewed commits and resume from status, verdict, and freshness

- Choice: every task feedback pass records the full base and head from its diff package. The latest task implementation commit is the latest commit touching that task's progress file; feedback is fresh only when base and head are valid commits, base is an ancestor of head, head is an ancestor of current `HEAD`, and head contains that implementation commit. Orchestration and helpers read current implementation state from the root table, then apply verdict freshness: `pending` and `blocked` route to implementation handling; `in-progress` triggers inspection of that task's git state and local log; `done` with no or stale feedback routes to code feedback; `done` with fresh `changes-requested` routes back to code; and only `done` with fresh approved feedback advances. A later correction makes the old verdict stale, so it receives fresh feedback rather than another automatic code pass. Detailed task logs are opened only for the task currently being diagnosed, reviewed, or resumed.
- Alternatives considered: treat root `done` as complete regardless of feedback; use the latest verdict without binding it to code; require feedback to be committed immediately and infer freshness from the feedback file's commit; derive all current state by scanning nested history; maintain the resume point only in the controller's transient todo list.
- Rationale: explicit reviewed-head metadata prevents stale approvals and distinguishes a still-unfixed changes-requested pass from a correction awaiting review. Git ancestry allows unrelated later task commits without invalidating an already reviewed task. The feedback artifact's immediately following bookkeeping commit does not alter the reviewed range and must exist before the next task checkpoint.

After every task reaches done plus fresh approval, the same rule applies at change scope: no or stale root review dispatches whole-branch review, fresh changes requested routes through re-plan or upstream revision, and only fresh approval hands off to finish-work. Conversation state never substitutes for either matrix.

### Decision: Re-plan reconciles active rows without deleting history

- Choice: re-plan preserves done task definitions and rows, existing task directories, and append-only logs; appends newly required numbered tasks; initializes new rows and files as pending; and keeps active rows in amended plan order. A newly abandoned task leaves the active table, but its directory remains untouched. Identifiers are never renumbered or reused.
- Alternatives considered: add `abandoned` to the chosen root status vocabulary; delete abandoned task directories; keep obsolete rows in the active table; rewrite the full index and task logs from scratch.
- Rationale: the plan remains authoritative for which tasks are active, while the root statuses stay within the user's selected four values and historical evidence survives re-planning.

### Decision: Split verdict ownership by task and change

- Choice: add a root installed `feedback.md` template instantiated at `tasks/task-N/feedback.md`, and narrow root `review.md` to whole-branch passes. Both artifacts are append-only, record the full reviewed base and head, use `approved` and `changes-requested`, separate Blocking from Suggestions, and require the physically last pass to be valid and fresh; consumers never skip a malformed last pass to recover an older approval. Each producer commits only its verdict artifact in a bookkeeping commit before handoff, so resume sees it and a later coder cannot absorb it. Nested progress and feedback headings declare the same `Task N` encoded by their directory and are validated before evidence is attributed. Code feedback reads only its task's latest implementation evidence. Whole-branch review reads the root ledger and each active task's latest attempt and feedback concerns, expanding into prior passes only when needed. Neither producer writes a progress summary.
- Alternatives considered: keep both scopes in `review.md`; create a change-level `code-feedback.md`; keep task feedback only in transient subagent reports; retain summaries in root progress.
- Rationale: task verdict ownership becomes deterministic, root review remains the obvious merge decision, and every artifact has one lifecycle reason to change.

### Decision: Accept exactly two self-hosting bootstrap deviations without rewriting history

- Choice: for `.hamilton/changes/2026-09-04-split-hamilton-review/` only, accept the already-committed Task 1–13 feedback artifacts even though their artifact-only commits were backfilled after later task implementation rather than preceding the next task checkpoint. Permit remediation to replace only the pre-contract Task 1 and Task 4 attempt headings with canonical, contiguously numbered `## Attempt N — <date>` headings in physical order while preserving every date, evidence body, and attempt order. Land normalization in ordinary forward commits; do not rewrite, reorder, squash, or recreate existing commits. Apply ordinary task-feedback freshness to each normalization commit. Close the exception over evidence present at approval: Task 14 and every newly planned remediation task follow the strict feedback sequence and canonical syntax.
- Alternatives considered: rewrite branch history so each early feedback commit appears before the next task checkpoint and canonical headings appear in the original task commits; retain the generic legacy task-heading parser and treat the existing artifacts as compatible input; abandon the branch and rebuild the entire change under the finished pipeline.
- Rationale: this change implements the split pipeline that would otherwise have produced its own evidence, so its two bootstrap deviations could not be prevented by the contract being built. A forward-only exception preserves honest history and permits the current artifacts to reach the strict canonical shape. A history rewrite would replace evidence rather than explain it, while a parser fallback or change-slug runtime branch would turn one change's provenance into product compatibility. Only the chronology finding is resolved by disposition; the legacy-parser finding remains one of whole-branch review Pass 1's other 17 blocking findings until fallback removal and exact artifact normalization are complete. The exception changes no freshness, cleanliness, verification, approval, or finish gate.

### Decision: Make whole-branch inspection broad but verification focused

- Choice: whole-branch review starts from the merge-base diff, records that package's full base and head in its pass, and then always searches the broader repository for affected consumers, assumptions, cross-task composition, missing changes, documentation and specification drift, and boundary violations. The latest material change commit is the latest current-branch commit touching any tracked path except this change's root/task progress, task feedback, root review, and finish bookkeeping. Proposal, requirements, design, plan, canonical specs, maps, source, tests, skills, templates, scripts, and docs remain material even under `.hamilton/`. The pass is fresh only while its range is valid, its head remains on the current branch, and that head contains this commit. It may run the narrowest focused check needed to resolve a concrete doubt, but it does not repeat the full suite or build by default.
- Alternatives considered: confine whole-branch review to the diff package as today; mandate the full suite and build on every review pass; prohibit all test execution during review.
- Rationale: impact analysis beyond the diff is the defining final-gate responsibility. Focused execution supplies evidence where reading is insufficient, while finish-work remains the single deterministic owner of the full verification gate.

### Decision: Route whole-branch findings through re-plan

- Choice: replace the current ownerless final fix wave with `hamilton-plan` re-plan mode. A `changes-requested` whole-branch verdict is passed in full to planning. Implementation findings consistent with approved intent become one or more cohesive numbered remediation tasks with pending rows and task progress files, then return to the ordinary code and code-feedback loop before whole-branch re-review. A finding that requires changing approved requirements or design stops orchestration and returns to `hamilton-propose`; planning never works around it. Completed tasks remain frozen, no finding is assigned retroactively to them, and no synthetic task exists outside the plan.
- Alternatives considered: assign every finding to an existing completed task and reopen it; create one synthetic final-fixes directory outside the plan; retain one change-level fix wave with no task progress owner.
- Rationale: every code change must have a task owner if execution evidence is task-local. Re-plan also preserves task sizing when final findings require independent fixes instead of forcing unrelated work into one wave.

### Decision: Give orchestration separate prompts for task feedback and final review

- Choice: replace the shared reviewer prompt with `references/code-feedback-prompt.md` and `references/whole-branch-review-prompt.md`. The first names one task, full recorded base and head, task-local progress as the detailed implementer evidence, constraints, bounded inspection rule, and feedback destination. The second names the full merge base and head, complete branch package, all change intent, root ledger and linked task evidence, broad repository access, re-plan handoff, and root review destination. Both require their skill to persist the reviewed range. The implementer prompt names the assigned row and task progress file, requires all detailed claims there, and asks the subagent to return only concise status and commit information; no separate report-file placeholder remains.
- Alternatives considered: keep one conditional prompt; embed all prompt bodies directly in orchestrate; let the reviewer infer scope from context.
- Rationale: scope-specific files keep each dispatch narrow and contract-testable. One conditional template would retain branches and placeholders belonging to the other role.

### Decision: Change helper parsers to follow artifact ownership directly

- Choice: `hamilton-change-context.sh` parses the root table, validates task identities, statuses, order, and links against the plan, reports each task's implementation, feedback verdict, and feedback freshness, and reports root review and finish presence separately. It reads only the latest task outcome needed to validate a done row rather than scanning full attempt history. `hamilton-precondition-check.sh` preserves its existing verification-command interface while requiring an exact active-plan-to-root mapping, valid links and files, every row `done`, a latest task-log outcome of `done` as supporting evidence, every latest task feedback approved without blocking findings and bound by a valid current-branch range containing that task's latest progress commit, and root review approved with a valid current-branch range containing the latest material change commit. The existing explicit whole-branch freshness waiver bypasses only the requirement that final-review head contain that commit; malformed or off-branch metadata, task feedback freshness, verification results, and every other gate remain non-waivable.
- Alternatives considered: continue parsing mixed sections; derive current state solely from task logs; accept root status without linked evidence; fall back to old root formats.
- Rationale: deterministic consumers should read each value from its owner and fail closed on drift. Checking the latest task outcome supports a `done` claim without making the historical log the current-state source.

### Decision: Inventory legacy directories without supporting them

- Choice: treat a change with no `plan.md` as the normal `pre-plan` lifecycle and require no progress structure yet. Once a plan exists, require the split root table and nested task layout for re-plan, code, feedback, review, and finish. `hamilton-change-context.sh --all` detects old monolithic or missing-scaffold planned layouts only far enough to label them `legacy-unsupported` and continue the inventory; direct context reports artifact presence plus the unsupported label but no inferred task or review standing.
- Alternatives considered: parse both generations indefinitely; migrate old directories automatically; fail the entire `--all` command at the first historical entry; hide old entries.
- Rationale: the user explicitly rejected mid-change migration and compatibility, while `--all` still promises a repository inventory. A non-semantic label preserves visibility without creating a fallback execution contract.

### Decision: Move finish history to a dedicated artifact

- Choice: add an installed `finish.md` template at the change root with paired monotonic `Attempt N` and `Outcome N` sections. After gates and committed spec synchronization, finish-work appends and commits Attempt N on the change branch before side effects. It then executes and reads back the strategy, appends matching completed or blocked Outcome N on the surviving change branch or base, commits it, pushes when a remote branch is involved, and verifies persistence. A precondition failure writes nothing. A dangling attempt after interruption is reconciled against git, remote, pull-request, route, and workspace state before any retry; the same N is completed or safely continued rather than duplicating an external action.
- Alternatives considered: retain finish sections in root progress; record finish in review; rely only on git and external state without an artifact.
- Rationale: finish is a change-level operation with external side effects and one independent reason to change. Committing intent before the action and verified outcome afterward makes interruption visible and avoids either fabricating success in advance or losing the identity of a partially completed operation.

Whole-branch freshness is evaluated immediately before this sequence. Canonical spec synchronization, route/map completion state, and finish history produced by the same attempt are the only permitted post-gate mutations and do not retroactively invalidate it; any unrelated material change aborts the attempt and returns to review.

### Decision: Verify contracts at Markdown and executable boundaries

- Choice: add Vitest contract tests that read skill trees, templates, and orchestration references for stable scope and path markers. Update setup tests for `task-progress.md`, `feedback.md`, and `finish.md`. Replace helper fixtures with root index rows, nested task progress and feedback, root review, and finish history. Exercise plan reconciliation, status transitions, resume combinations, whole-review-to-re-plan flow, malformed mappings, contradictory verdicts, and freshness.
- Alternatives considered: rely only on prose review; test only helper parsing; attempt nondeterministic end-to-end agent execution.
- Rationale: Markdown tests catch accidental contract recombination, while filesystem fixtures prove deterministic state consumption. Agent behavior itself is not stable enough to serve as a repository test gate.

## Architecture & Components

| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `skills/hamilton-plan/` | Write the declarative plan, initialize or reconcile the root task ledger, and create new task logs | `plan.md`, installed `progress.md` and `task-progress.md`, re-plan input | Change artifacts, canonical specs, project standards |
| `skills/hamilton-code/` | Implement one task, transition only its root row, append its execution evidence, and commit both with code | One `Task N`, root row, `tasks/task-N/progress.md` | Plan task, project standards, optional task feedback |
| `skills/hamilton-code-feedback/` | Review one implemented task within a bounded diff and record commit-bound tactical feedback | One `Task N`, task diff package with base/head, task progress, `tasks/task-N/feedback.md` | Plan task, project standards, installed feedback template |
| `skills/hamilton-review/` | Review the complete branch, inspect broader repository impact, and record the reviewed range | Merge-base/head branch package, change artifacts, root ledger, task evidence, root `review.md` | Project repository, project standards, installed review template |
| `skills/hamilton-orchestrate/` | Apply the resume matrix; sequence code, per-task feedback, final review, and remediation re-plan | Skill body plus implementer, code-feedback, and whole-review prompts | Diff-package helper, plan, root ledger, nested task artifacts |
| `skills/hamilton-finish-work/` | Enforce completion and approval gates, synchronize specs, execute a strategy, and record verified finish state | Precondition output, change artifacts, `finish.md` | Root ledger, task evidence and feedback, root review, tests, git and external target |
| `bundle/templates/progress.md` | Define the root Task/Status/Progress table | Installed root template; one live instance per change | Plan task identities |
| `bundle/templates/task-progress.md` | Define one task's append-only attempt history | Installed root template; live instance at `tasks/task-N/progress.md` | Assigned code attempts |
| `bundle/templates/feedback.md` | Define one task's append-only, commit-bound feedback passes | Installed root template; live instance at `tasks/task-N/feedback.md` | Code-feedback ranges and passes |
| `bundle/templates/review.md` | Define append-only, commit-bound whole-branch review passes | Installed and instantiated at change root | Whole-branch ranges and passes |
| `bundle/templates/finish.md` | Define append-only finish attempts and verified outcomes | Installed and instantiated at change root | Finish-work actions and read-back evidence |
| `.hamilton/templates/` | Removed legacy mirror; no surviving runtime or authoring responsibility | Deleted in this change | Superseded by `bundle/templates/` and the user-level install destination |
| `bundle/scripts/hamilton-change-context.sh` | Validate and summarize current task, feedback, review, and finish standing | One change directory or `--all` | Plan, root table, nested feedback, root review and finish |
| `bundle/scripts/hamilton-diff-package.sh` | Record and package stable task-owned ranges and derive whole-branch ranges | Exact `Task N` plus `tasks/task-N/.base` for task mode; merge base for whole-change mode | Git history and change directory |
| `bundle/scripts/hamilton-precondition-check.sh` | Fail closed unless task structure, implementation, feedback, final review, freshness, configured verification, and cleanliness pass | Existing command interface plus revised artifact parsing and freshness waiver | Plan, root table, nested task files, review, git history |
| `tests/` | Prove installation, path mapping, parser behavior, status and verdict semantics, orchestration contracts, and migration boundaries | Vitest and existing shell-test helpers | Skill Markdown, templates, scripts, temporary repositories |
| Framework documentation | Present seven steps, split artifacts, contributor mapping, and between-changes migration | `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md`, `CONTRIBUTING.md`, template catalog | Authoritative skills and templates |

### Quality Lens

- Responsibility: planning owns task-set initialization and reconciliation; code owns one task's status and execution evidence; code feedback owns one task's verdict; review owns branch-level integration; finish owns completion side effects. The root ledger owns only current implementation state and navigation.
- Boundaries and dependencies: a task-scoped worker receives one row and one task directory, not sibling logs. Orchestration depends on named file contracts and scope-specific prompts. Helper tests substitute temporary repositories and fixture artifacts at the existing filesystem seam, so no runtime abstraction is introduced.
- DRY and single source of truth: plan owns active task definitions, root progress owns current implementation status, task progress owns attempt evidence, feedback owns tactical verdicts bound to reviewed heads, review owns the final verdict bound to its reviewed head, and finish owns finishing outcomes. A latest task outcome is evidence checked against a done row, not an independently selected current state.
- Right-sizing: deliberately absent are a task database, manifest, generated views, shared skill runtime, migration parser, synthetic final-fix state, and new command. Markdown tables and the existing shell helpers are sufficient for the present file-native pipeline.
- Explicit errors: wrong review scope, invalid task id, missing or duplicate root row, illegal status, wrong or missing link, empty evidence behind done, interrupted in-progress work, missing or invalid reviewed commits, stale task feedback, unapproved feedback, stale final review, and partial finish all have a defined stop or recovery path.
- Accepted smell: self-contained review skills repeat a small set of review principles. This is an intentional portability trade-off, cross-listed under Risks / Trade-offs, and contract tests guard their meaningful differences. No unresolved structural smell remains.
- Bootstrap boundary: the exception is expressed only in this change's approved artifacts and resolved through forward artifact normalization. Runtime producers and consumers keep one strict grammar and sequence, so there is no change-id conditional, parallel parser, or second source of truth.

## Data & Flow

Bootstrap-only prelude for this change: whole-branch re-review treats the existing Task 1–13 feedback commit chronology as explicitly approved, and remediation may normalize only Task 1 and Task 4 attempt headings through forward commits. It does not reconstruct or reorder old commits. Once those exact artifacts are canonical, the ordinary flow below applies without a fallback path.

1. Plan writes or amends `plan.md`, writes the root index in plan order, and initializes `tasks/task-N/progress.md` for each newly active task. Existing evidence remains untouched in re-plan mode.
2. The driver reads root status and latest feedback. Before a pending task's first dispatch it records current `HEAD` once in `tasks/task-N/.base`; retries preserve it. For pending or retryable blocked work, it dispatches code for exactly one task. An interrupted in-progress row is inspected in place before any new dispatch.
3. Code changes its assigned root row to `in-progress`, executes the task, appends one `done` or `blocked` attempt to that task's progress file, changes the same row to the final status, and commits the task's code and artifacts together when implementation lands.
4. A blocked outcome stays on the same task. A done outcome is packaged from its full recorded base and head and dispatched to code feedback with the task's latest evidence and `tasks/task-N/feedback.md` destination.
5. Code feedback inspects the task diff and supplied intent, checks one broader location only for a concrete named risk, appends its verdict and reviewed range without touching progress, and commits only the feedback file. Fresh changes requested re-dispatch code on the same task. After the correction updates task progress, the prior pass becomes stale and routes to fresh code feedback. Fresh approval lets orchestration advance.
6. After every active row is done and every latest task feedback is approved and fresh, orchestration packages merge-base-to-HEAD and dispatches whole-branch review. Review reads the complete diff, root ledger, every active task's latest attempt and feedback concerns, then inspects broader affected repository context. It appends the reviewed merge base, head, and verdict only to root `review.md` and commits that file before handoff.
7. A whole-branch changes-requested verdict invokes plan in re-plan mode with all findings. Planning appends one or more numbered remediation tasks for findings consistent with approved intent, creates pending rows and logs, and returns to the ordinary code and feedback loop. A finding that invalidates requirements or design stops and returns upstream for artifact revision and approval. When remediation tasks pass, whole-branch review runs again.
8. On resume with all task gates satisfied, absent or stale review returns to step 6, fresh changes requested returns to step 7, and fresh approval proceeds. Once root structure is valid, all active rows are done, all task feedback is approved and fresh, and root review is approved and fresh, finish-work runs the mandatory full verification, synchronizes specs, and executes the chosen finish strategy.
9. A precondition failure returns without artifact mutation. Once gates pass, finish-work commits Attempt N, executes and reads back the strategy, then appends and persists matching Outcome N on the surviving branch or base, including any partial blocker; it never modifies root or task progress. Resume reconciles a dangling attempt before another action.

## Error Handling & Edge Cases

| Failure or edge case | Behavior |
|---|---|
| Plan creates a task with punctuation, a table delimiter, or a duplicate-looking title | Escape the display title for the Markdown cell but derive identity and directory only from unique numeric `Task N`. |
| Inline code input omits an exact active `Task N` | Stop before implementation and request the id; never derive a path from the title or create work outside the index. |
| Root index is absent, has an extra or duplicate task, differs from plan order, uses an illegal status, or points to the wrong task path | Context reports the structural error; execution does not guess; finish fails closed. |
| A pending task link has no target file | Treat plan scaffolding as incomplete and stop rather than creating it from a task-scoped stage. |
| A task checkpoint is absent, malformed, or points outside current history | Stop task packaging; never substitute `HEAD~1`; reconstruct only from unambiguous durable evidence or escalate. |
| Code starts a task | Change only that task's row to `in-progress`; do not touch sibling rows or files. |
| Execution is interrupted while status is in-progress | Inspect the task's working tree, commits, and local log, then resume or record blocked; never dispatch a sibling concurrently or reset blindly. |
| A blocker is reported with partial production edits | Commit only root and task-local blocker evidence, leave partial production paths uncommitted, and report their exact state for the retry or re-plan decision. |
| Root says done but the task log has no latest done attempt | Report inconsistent evidence and fail closed; repair through the owning code task rather than editing the ledger by hand. |
| A nested progress or feedback heading names a different task than its directory | Treat the file as malformed and fail closed; never transfer evidence or approval by path alone. |
| A feedback or review pass is written but not committed | Do not advance, re-plan, or finish; persist the artifact-only bookkeeping commit first so later code cannot absorb it. |
| Whole-branch re-review encounters the existing Task 1–13 feedback commits after later implementation | Apply the approved change-local bootstrap disposition to chronology only; validate every pass and every other gate normally, and do not rewrite history. |
| Task 1 or Task 4 still carries a pre-contract attempt heading during remediation | Normalize that exact file to physically ordered canonical `## Attempt N — <date>` headings in a forward commit while preserving its evidence; until normalized, strict consumers reject it, and afterward ordinary feedback freshness applies. |
| Any other task or change presents a pre-contract attempt heading | Treat it as malformed. Do not invoke the bootstrap disposition and do not add a parser fallback. |
| Task feedback requests changes after a done attempt | Re-dispatch the same task; status returns through in-progress to done or blocked, and the task log appends another attempt. |
| A correction lands after changes-requested feedback | The old pass becomes stale because its head does not contain the latest task progress commit; run code feedback on the correction before deciding another code action. |
| An approved feedback pass predates later code for the same task | Treat approval as stale and block advancement and finish; the whole-branch freshness waiver does not apply. |
| Later commits touch only sibling tasks | Keep the earlier task feedback fresh when its reviewed head still contains that task's latest progress commit. |
| A reviewed base or head is malformed, has an inverted range, or is not on the current branch | Treat the pass as malformed or stale and fail closed rather than accepting a verdict from another history. |
| `hamilton-review` receives a task id or task-only range | Stop before inspection or artifact writes and direct the caller to `hamilton-code-feedback`. |
| `hamilton-code-feedback` receives no task id, several tasks, or a whole-branch range | Stop before inspection or artifact writes and direct whole-branch work to `hamilton-review`. |
| Code feedback identifies a risk outside the task diff | Inspect only the named location; return unresolved broader impact as `cannot verify from diff` for the driver. |
| Code feedback cannot verify a named criterion | Record a blocking changes-requested item; the driver supplies located evidence for re-feedback or returns a confirmed gap to code, and no unresolved item coexists with approval. |
| Whole-branch review discovers an affected unchanged consumer | Include it with causal and affected locations; absence from the diff does not exclude it. |
| Whole-branch review requests one or several independent fixes | Invoke re-plan with all findings and append one or more cohesive numbered remediation tasks; do not create an ownerless wave or reopen frozen tasks. |
| Whole-branch review finds an upstream requirements or design defect | Stop orchestration and return to `hamilton-propose`; do not encode a contradiction as a remediation task. |
| A task is abandoned during re-plan | Remove it from the active table, preserve its directory and log, never reuse its number, and skip it in completion and feedback gates. |
| Earlier feedback or review requested changes but the physically last pass validly approves | Preserve all passes; the physically last pass governs. |
| The physically last feedback or review pass is malformed | Fail closed and report that pass; never scan backward to an earlier approval. |
| An approved feedback or review pass contains Blocking findings | Treat it as contradictory and fail closed. |
| Whole-branch review predates later code, proposal, requirements, design, plan, specs, maps, skills, templates, scripts, tests, or docs | Freshness fails; rerun review, or explicitly invoke the existing user-controlled waiver for material-change ancestry only. Missing or unapproved review still fails. |
| Conversation resumes after task gates pass | Inspect the latest physical whole-branch pass: absent, malformed, or stale runs review; fresh changes requested remediates; fresh approval hands off. |
| Finish preconditions fail before a strategy starts | Return the blocking report and write neither progress nor finish history. |
| Finish synchronizes approved specs or route state after the gate opens | Continue the same attempt after verifying the mutation is derived from approved artifacts; do not classify it as an unrelated stale-review edit. |
| An unrelated material path changes after gate entry | Abort the finish attempt, record verified state when safe, and require whole-branch re-review before retry. |
| A finish action partially succeeds | Verify actual external, route, and workspace state, append and persist a blocked matching outcome when safe, and report only what occurred. |
| Finish resumes with an Attempt lacking its Outcome | Inspect the strategy's real targets first, append the matching result or safely continue the same attempt, and never allocate a duplicate action number first. |
| Local merge removes the worktree | Append and commit the matching verified outcome from the surviving base checkout after merge and teardown. |
| Pull-request creation succeeds | Append, commit, and push the verified URL and workspace outcome to the request branch, then confirm the request head contains it. |
| User updates only some skills, templates, or helpers | Migration documentation says the set is atomic and forbids switching formats inside an active change; no fallback masks the mismatch. |
| Context inventory encounters a completed monolithic change | Label it `legacy-unsupported`, list artifact presence, do not parse task or verdict state, and continue to other changes. |
| Context inventory encounters a proposal with no plan | Report the ordinary pre-plan state and artifact presence; absence of progress before planning is not legacy. |
| A contributor finds tracked `.hamilton/templates/` paths in history | Treat them as removed legacy source copies, not a second update target; historical commits remain available through git. |

## Testing Strategy

- Add contract tests that load plan, code, code-feedback, review, orchestrate, and finish skills plus their prompt references and assert the seven step numbers, accepted and rejected scopes, task-local paths, root-ledger ownership, reviewed base/head fields, no progress summaries from non-code stages, broad-versus-bounded review language, re-plan remediation handoff, and finish artifact destination.
- Assert the implementer and code-feedback prompts use task-local progress as the only detailed implementation report and contain no report-file placeholder or second changed/verified/concerns payload.
- Add `task-progress.md`, `feedback.md`, and `finish.md` to setup's expected template set; verify every installed copy matches its bundled source and each relative filename appears in setup output. Verify revised `progress.md` exposes only Task, Status, and Progress columns.
- Verify no tracked file remains under `.hamilton/templates/`, setup and every live skill resolve shapes only through `bundle/templates/` at distribution time and `~/.hamilton/templates/` at use time, and no deletion reaches change, spec, or map artifacts.
- Add plan-oriented contract fixtures proving a new plan initializes one pending row and task log per active task, task ids map to `task-N` independently of titles, and re-plan preserves done/history, appends pending remediation tasks, and excludes abandoned tasks without deleting directories.
- Replace mixed root-progress fixtures in change-context and precondition tests with a root table plus nested task logs. Cover every status, plan-order and link validation, missing/duplicate/extra rows, missing linked files, done-without-done-evidence, abandoned tasks, and `--all` summaries.
- Remove the pre-contract `## Task N: <title> — <date>` parser branch and its acceptance fixture. Require canonical, contiguous `## Attempt N — <date>` headings in every split-layout consumer and fixture; normalize only this change's Task 1 and Task 4 live evidence through an ordinary remediation commit rather than teaching runtime code the exception.
- Cover mixed-generation context inventory: propose-only directories report pre-plan, direct planned legacy directories report unsupported without inferred state, `--all` continues past both, and every post-plan execution or gate path rejects unsupported layouts rather than falling back or converting.
- Extend diff-package tests to prove separate ignored `tasks/task-N/.base` files, record-once behavior across retries, complete-range packaging after correction, isolation between consecutive tasks, malformed or missing checkpoint failure, and unchanged merge-base behavior for whole-branch packages.
- Replace mixed-review fixtures with commit-bound nested task feedback plus commit-bound root review. Cover wrong-task headings, invalid or unreachable reviewed heads, task feedback freshness after correction, unrelated sibling commits preserving freshness, physically-last-pass regression and recovery, malformed latest passes that cannot fall back, unresolved `cannot verify from diff` items, missing feedback, malformed verdicts, approved-with-blocking contradictions, missing root review, stale review after remediation, and the explicit final-review ancestry-only waiver.
- Verify each review skill stages and commits only its own artifact before handoff and refuses to proceed if unrelated working-tree paths would be included; assert subsequent task bases start after the prior feedback commit.
- Add orchestration contract fixtures for each resume combination: pending, blocked, interrupted in-progress, done without feedback, done with stale feedback, done with fresh changes requested, done with fresh approval, all tasks approved and fresh with absent, stale, fresh changes-requested, or fresh approved whole-branch review, and whole-review remediation leading to one or more re-plan tasks before re-review.
- Add finish-history contract fixtures for monotonic paired numbering, precondition no-write, committed attempt before action, completed and blocked outcomes, dangling-attempt reconciliation without duplicate side effects, local-merge outcome persistence on base, pull-request outcome push/read-back, no-op persistence, and absence of finish sections in root progress.
- Run `bun --bun vitest run` and `bun run build`, then run `git diff --check` and focused searches for stale six-step counts, old step numbers, task-scoped `hamilton-review`, shared reviewer prompts, mixed-scope review, append-only root progress, review or finish progress summaries, ownerless final fix waves, and stale task completion parsing outside historical change artifacts.
- Read every live skill body that embeds the pipeline sequence plus `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md`, `CONTRIBUTING.md`, and `bundle/templates/README.md` to verify the seven-step flow, split artifact tree, current-status vocabulary, remediation loop, and migration boundary agree.

## Constraints & Boundaries

- Always: derive task directories only from exact `Task N`; keep root rows in active plan order; use exactly `pending | in-progress | blocked | done`; preserve task log, feedback, review, and finish histories append-only; and keep root progress task-only.
- Always: treat root done as implementation completion and require a separate latest feedback approval fresh for that task's latest progress commit before advancing; require all active tasks done, all task feedback approved and fresh, and a fresh whole-branch approval before finish.
- Always: update plan, code, code-feedback, review, orchestrate, finish, every embedded pipeline sequence, all prompt references, five affected template shapes, remove the stale `.hamilton/templates/` mirror, update diff packaging, setup expectations, helper parsers, executable and contract tests, pipeline docs, contributor mapping, and live step labels as one coherent version.
- Always: route whole-branch implementation changes through re-plan into numbered remediation tasks before more code, and return upstream when a finding invalidates approved requirements or design; make whole-branch review inspect the broader repository on every pass; keep code feedback bounded to the task diff except for a concrete named risk.
- Always: keep this bootstrap exception change-instance-specific and forward-only; preserve existing git commits; apply it only to the already-incurred Task 1–13 feedback chronology and canonical normalization of the existing Task 1 and Task 4 progress headings; require Task 14, all new remediation tasks, and every future planned change to use the strict contract.
- Ask first: any proposal to add another task status, restore legacy compatibility, alter task-id syntax, remove reviewed commit metadata, put stage histories back into root progress, assign final findings without re-plan, broaden or remove the whole-branch freshness-only waiver, weaken completion or approval gates, or move full-suite ownership out of finish-work.
- Never: retain task mode in `hamilton-review`, accept whole-branch mode in `hamilton-code-feedback`, use one conditional reviewer prompt, create a synthetic unplanned fix task, silently infer scope or status, add a cross-skill runtime dependency, delete abandoned task history, or edit historical change artifacts outside this change directory.
- Never: implement the bootstrap disposition as generic legacy parsing, a change-slug conditional, an alternate artifact shape, or relaxed checkpoint sequencing; never treat it as waiver of another whole-branch finding or gate.
- Never: add comments to code, weaken or delete existing tests, or use `bun test`; project verification remains `bun --bun vitest run` and `bun run build`.

## Risks / Trade-offs

- [Seven-step promotion widens migration and renumbers stable stages] -> Update every live skill header, diagram, handoff, docs entry, template note, and canonical framework requirement in one change; contract-search stale six-step language outside historical artifacts.
- [The root ledger and task log can drift] -> Give code sole ownership of the assigned transition and append, commit them together, validate plan mapping and latest done evidence, and fail closed on inconsistency.
- [Retaining a scratch implementer report would duplicate task evidence] -> Put changed paths, verification, and concerns only in task progress; let the subagent return a concise status and commit summary and let reviewers consume the durable file.
- [A verdict can outlive the work it reviewed] -> Record full reviewed base and head on every feedback and review pass, compare task feedback against the latest commit touching its task progress, compare final review against the latest material commit while excluding only operational bookkeeping, and never waive task freshness.
- [An uncommitted verdict can be lost or absorbed by later code] -> Commit only the producer's feedback or review artifact before handoff and record the next task base afterward.
- [An in-progress write may survive an interrupted agent] -> Treat it as an explicit recovery signal; inspect the task's git and local evidence rather than assuming pending or launching concurrent work.
- [A blocked outcome can be lost if no production commit is valid] -> Persist only the two progress artifacts in a bookkeeping commit, keep partial production edits uncommitted, and make resume inspect both states.
- [Nested files increase paths and setup surface] -> Use one numeric mapping, initialize all links during planning, and exercise helpers against temporary repositories and representative fixtures.
- [A shared or reset diff base can omit task commits] -> Store one ignored checkpoint per task before its first attempt, never overwrite it on correction, and test complete A-to-C packaging across multi-commit loops.
- [Deleting tracked project-local templates can look like artifact loss] -> Limit deletion to `.hamilton/templates/`, document `bundle/templates/` as the canonical source and `~/.hamilton/templates/` as the installed destination, and verify project change/spec/map artifacts remain untouched.
- [Removing abandoned rows can hide their path from the active index] -> Preserve the numbered plan entry and task directory as history; the root table intentionally indexes current active work only.
- [Independent review skills duplicate principles] -> Keep each skill self-contained, limit overlap to principles each role genuinely needs, specialize scope language, and test that the boundaries remain different.
- [No legacy parser means partial upgrades fail] -> Publish an atomic between-changes migration rule and actionable scope redirects; deliberately do not conceal mixed versions with fallback behavior.
- [A self-hosting exception can leak into product behavior or appear to excuse unrelated defects] -> Name the exact change and affected task artifacts only in approved change-side documents, normalize through forward history, keep runtime grammar unconditional, and retain all other 17 whole-branch findings and every future gate.
- [Broad repository inspection can become unbounded] -> Anchor every search to a changed contract, affected consumer, design invariant, requirement, or named omission; broad means impact-aware, not a generic audit of unrelated code.
- [Re-planning final findings adds a loop and can expand the plan] -> Preserve TDD-sized ownership and stable ids; append only the remediation tasks required by located findings, then rerun ordinary gates and final review.
- [Review does not rerun the full suite] -> Permit focused evidence gathering for concrete doubts and retain mandatory full tests and build in finish-work immediately after approval.
- [Recording finish after external effects spans git states] -> Verify the actual destination first, append only what occurred to the surviving branch or base, and never let the artifact claim an unverified operation.
- [A crash between finish intent and result can invite duplicate side effects] -> Commit a numbered attempt before acting, reconcile any dangling attempt against real state, and append its matching outcome before allocating another number.
- [Markdown contract tests can become wording-sensitive] -> Assert stable paths, statuses, scope markers, ownership boundaries, and prompt references rather than full prose snapshots; executable helper tests carry state semantics.

## Migration / Rollout

Release the affected skills, bundled templates, helper scripts, and documentation as one version. Users finish any active mixed-format change with their current Hamilton installation, then update the complete set and run `hamilton setup` before starting the next change. New planning creates root progress and all task logs; existing task automation reads and updates one ledger row and `tasks/task-N/progress.md`; task-oriented review automation changes from `hamilton-review` to `hamilton-code-feedback` and writes `tasks/task-N/feedback.md`; final automation keeps `hamilton-review` but supplies the whole branch and writes root `review.md`; finish writes root `finish.md`. No artifact conversion or fallback is provided. Rollback likewise occurs between changes by restoring the prior complete set rather than mixing formats.

## Open Questions

*(none)*
