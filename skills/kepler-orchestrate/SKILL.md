---
name: kepler-orchestrate
description: "Execute a whole plan by composing task implementation, task-scoped code feedback, and whole-branch review as durable state machines. Coordinates only; never edits implementation itself."
---

# Orchestrating a plan

Run every active task in a `plan.md` through implementation and fresh approval, then run the
complete branch through its whole-branch review gate. At every decision, resume from committed
artifacts and Git ancestry; conversation memory and an in-session todo list never provide state.

The **seven-stage core pipeline** is Kepler's fixed spec-driven sequence: init → propose → plan → code →
code-feedback → review → finish-work. This driver coordinates the per-task `kepler-code` ↔
`kepler-code-feedback` loop, then one whole-branch `kepler-review`, followed by
`kepler-finish-work`. Wayfinder and `kepler-critique` are optional and remain outside the
seven-step core count.

The driver coordinates three distinct roles:

- In historical serial mode, `kepler-code` owns one task's implementation/root status and task-local progress. In v2, its worker owns only task-local evidence and the original commit; the coordinator owns guarded root publication.
- `kepler-code-feedback` judges one task's stable diff and owns its feedback artifact.
- `kepler-review` judges the complete branch and owns the root review artifact.

**Continuous execution.** Run tasks in plan order without asking whether to continue. Stop only
for an unresolved blocker, an upstream artifact defect, unsafe workspace state, or completion of
the fresh whole-branch approval gate.

**Coordinate; never implement.** Dispatch the skills that own code, planning, and review. Do not
edit implementation, tests, `plan.md`, progress, feedback, or review artifacts in the controller.
The only controller state is its todo display, which mirrors rather than replaces durable state.

## Inputs

- A change directory at `.kepler/changes/<YYYY-MM-DD-title>/` containing `plan.md`.
- The root `<change-dir>/progress.md` task ledger and linked
  `<change-dir>/tasks/task-N/progress.md` files.
- Task-local `<change-dir>/tasks/task-N/.base` checkpoints and `feedback.md` files when present.
- Root `<change-dir>/review.md` when present.
- The change's proposal, requirements, and design artifacts when present.
- Project standards from `AGENTS.md` or the repository equivalent.

Before dispatching, run `kepler workbench lint --change-dir <change-dir>` on the existing
change. Its exit status is the single source of truth for artifact format and schema. On nonzero
lint, report its findings without dispatching. Active task ids come from `plan.md`; read their
current status from the root ledger. Require the task logs needed for the selected stage as
inputs, but name absent files as missing evidence rather than a format failure. Do not reject
lint-valid frontmatter, additional content, or a layout merely because it differs from a
skill-specific template.

## References

Read the scope-specific prompt that matches each dispatch:

- `references/implementer-prompt.md` dispatches `kepler-code` for one exact Task N.
- `references/code-feedback-prompt.md` dispatches `kepler-code-feedback` for one exact Task N.
- `references/whole-branch-review-prompt.md` dispatches `kepler-review` for the complete branch.

Do not combine the two review scopes into a conditional prompt. Task feedback and whole-branch
review have different evidence, inspection boundaries, artifact destinations, and handoffs.

## Principles

### Dependency-mode v2

When the committed plan declares `execution: {version: 2, mode: dependencies}`, derive verified ready, held, and fully gated sets from workbench context on current committed evidence. A ready task is not admitted merely by readiness; root `done` is implementation status, not clearance. Admit the observed expected worker and lane before dispatch, and dispatch only compatible isolated lanes. Keep descendants held until every declared prerequisite is fully gated by fresh committed independent feedback.

Workers own isolated task-local attempts and task commits only. One coordinator owns shared common-gitdir mutation: serialize integration of original worker commits, then guarded root publication for `done` or `blocked` only; interrupted and unavailable are neutral worker responses. Preserve each admission's original Base across retries, corrections, and cache loss; never turn partial work or an unavailable response into a fabricated attempt or `done`/`blocked` outcome. After integration, require exact integrated Verify before publishing `done`; feedback is independently authored and artifact-only. Require fresh committed independent feedback for every active task before whole-branch review or finish, regardless of root completion.

Use the configured `kepler` executable for workbench commands; source-backed development fixtures may provide a fixture-local CLI bridge. `kepler workbench context <change-dir>` derives readiness. Guarded commands use `workbench task-state --admit [--retry] --task N --change-dir <path> --expected-head <full40> --worker <observed-worker> --worktree <linked-lane> --target-branch <full-ref>`, `--reserve --task N --change-dir <path> --expected-head <full40> --reservation '<exact JSON>'`, and `--publish --task N --change-dir <path> --expected-head <full40> --task-head <full40> --verify '<exact Verify>' --response done|blocked`. Confirm command-specific compatibility from the actual CLI; reservations bind before edits, permit two lifetime reservations and four paths each, and never refund. `workbench diff --record --task N --change-dir <path>` is not a substitute for v2 admission. For feedback packaging, use `workbench diff --task N --change-dir <path>`; `--record` writes or validates a cache rather than producing a diff package.

### Historical serial mode

Plans without the exact v2 execution declaration retain serial scheduling: use a validated explicit version-1 `execution.order` when present, otherwise numeric identity order; malformed explicit order holds without fallback. Preserve code-owned root updates and historical checkpoint behavior. Never infer v2 from installed resources or rewrite frozen plans.

- **Read state, then dispatch.** Before every action, recompute the applicable matrix from the
  root row, the physically last verdict, and reviewed-range freshness.
- **Mode-scoped dispatch.** In dependency-mode v2, derive readiness from current verified context and allow only compatible isolated admitted lanes; readiness alone is not admission. In historical serial mode, never dispatch task implementers in parallel and select numeric identity order.
- **One task, one checkpoint.** In v2, preserve original admission Base across retries, corrections, and cache loss. In historical serial mode, create `.base` only before a genuine first attempt and recover the same commit from durable evidence; never rebase the task range.
- **Stage-owned evidence.** In v2, workers own task-local attempts/commits, the coordinator owns guarded root publication, code feedback owns only task feedback, and whole-branch review owns only root review. Historical serial workers retain root status updates.
- **Commit every gate.** A feedback or review verdict is not a completed checkpoint until its
  owner makes and verifies the required artifact-only commit.
- **Files carry detail.** In historical plans, task progress is the only detailed implementer report. Dispatch output
  is concise status and commit information; diff packages and verdict artifacts carry review
  evidence.
- **Fail closed on actual gate failures.** An absent, lint-invalid, unreachable, contradictory,
  or stale last pass never inherits an earlier approval. Do not add a separate format check.
- **Specify every model.** Every dispatch names its model according to **Model roles**.

## Checkpoint establishment and recovery

For dependency-mode v2, admission binds the original Base and all task, plan, actor, lane, repository, and ordered prerequisite approval identities. Reuse that original admission Base through retry/correction and cache loss; never reset it to current HEAD. Only the coordinator serializes shared integration and guarded publication. An unavailable worker response preserves partial work and remains unresolved; it is not itself a task attempt or a fabricated terminal status. V2 root `done` requires integration and exact Verify, while `fully gated` additionally requires a fresh independently committed feedback approval for every active task.

For historical serial mode only, before any first-attempt `--record`, inspect the exact task's Files and Acceptance, working tree,
and attributable Git history for task-owned committed and uncommitted implementation changes.
The CLI's mechanical eligibility does not prove the absence of task-owned work. A clean tree,
pending row, or empty log cannot establish that absence. If task-owned work already exists or its
attribution is ambiguous, stop for owner diagnosis and never record current `HEAD` as a new Base;
preserve existing work and evidence. Do not dispatch code with an unresolved checkpoint.

After that inspection, before every code dispatch, run `kepler workbench diff --record --task N --change-dir <change-dir>`.
With no task attempt or feedback history, the CLI records current `HEAD` only when the root row is
`pending`, the committed task log has no attempt, and the worktree is clean. The initial pending-log
creation commit is not an implementation attempt and does not define the historical Base.

When durable task history exists, the CLI derives the canonical Base from the first parent of the
earliest committed task-progress revision that adds the first attempt. Every valid feedback `Base:`
must agree; the Base must resolve, precede the attempt, and remain an ancestor of every valid
feedback `Head:` and current `HEAD`. The existing ignored `tasks/task-N/.base` is a no-overwrite
cache: the CLI validates it against this result, restores it only when it is missing and history
proves the value, and never treats it as authority. A malformed or conflicting existing cache,
missing or ambiguous historical evidence, imported/rewritten history, or invalid ancestry stops
before dispatch and requires owner diagnosis. Never substitute current `HEAD`, `HEAD~1`, or a
planner's pending-log commit for the canonical historical Base.

## Durable task approval

The driver may consume an approval only when every part of this predicate succeeds for the exact
`tasks/task-N/feedback.md` path:

- the feedback path is tracked at current `HEAD`: `git ls-files --error-unmatch` succeeds for the
  exact path and the path exists in the `HEAD` tree;
- the feedback path's index entry is unchanged from current `HEAD`:
  `git diff --cached --quiet HEAD --` succeeds for the exact path;
- the feedback path's worktree content is unchanged from the index: `git diff --quiet --` succeeds
  for the exact path;
- the latest commit that touched the feedback path is artifact-only, and the commit's path list
  contains only `tasks/task-N/feedback.md`;
- lint accepts the feedback artifact; the physical last pass belongs to this task, says
  `approved`, contains no blocking findings, and is fresh by the task range rules below.

Evaluate this predicate from repository state, never from subagent output. Any failed condition,
including a worktree-only approval, an untracked file, or a mixed latest feedback-touching commit,
requires the driver to dispatch `kepler-code-feedback` for the same task; it never authorizes a
later task checkpoint or whole-branch review. Evaluate the index and worktree conditions
independently: a staged feedback blob that differs while the worktree matches `HEAD` must fail the
index condition.

## Task handoff consistency

Before applying the task resume matrix, require `kepler workbench lint` to accept the root
progress ledger. Its frontmatter task list and Markdown rows must match exactly by ordered task
id, title, status, and progress link. The root artifact's aggregate `status: complete` means all
active implementation rows are done; it is only an implementation summary, never a substitute
for per-task feedback or whole-branch approval and never a finish-work gate.

Interpret task-local evidence by phase. Root `in-progress` with an initialized local `status:
pending` log and no attempt is the supported first-attempt boundary. A correction may also have a
prior finalized local status and attempt while its root row is `in-progress`; preserve that history.
For root `done` or `blocked`, require matching root frontmatter/row status and matching local
status/latest terminal Outcome. Lint rejects a latest attempt with duplicate Outcomes before its
value is used.

If a task's root or local evidence contradicts its claimed terminal state, stop before selection
or advancement and diagnose the exact evidence with the owning coder. The coder may repair a
proven recording omission while preserving sibling rows, metadata, and history. Feedback does not
change implementation status, and the driver never invents a done attempt. If completion evidence
is insufficient, resume normal verification rather than making a bookkeeping-only repair.

## Dependency-mode v2 outcome routing

For v2, first recompute the verified readiness projection (`ready`, `held`, and `fullyGated`) using `kepler workbench context <change-dir>`. Readiness is not admission, root `done` is not clearance, and no terminal worker response bypasses publication or feedback.

| Worker / publication evidence | Coordinator action |
| --- | --- |
| Ready, not admitted | Admit the observed expected worker/lane against current full HEAD and prerequisites before dispatch; readiness alone never authorizes a worker. |
| Held, including a descendant of an incomplete prerequisite | Do not dispatch; preserve completed work and wait for prerequisite fully gated feedback. |
| Root `pending` and verified ready | Admit first, then dispatch only the expected worker/lane. |
| Root `blocked` and newly resolved input | Preserve prior evidence; retry only after a changed resolution and guarded admission. |
| Root `in-progress` or interrupted worker | Inspect only assigned lane, task commits, checkpoint and local evidence; resume same admission or hold, never select another task. |
| Worker response absent or unavailable | Preserve partial lane and admission Base; inspect durable worker/task evidence. Missing response is not an attempt, blocked result, or done result. |
| Worker reports blocked with truthful local evidence | Coordinator may publish only `blocked`; preserve uncommitted partial work and do not count fully gated. |
| Worker done with original task commit | Serialize integration of that original commit; run its exact Verify on integrated bytes; publish `done` only through guarded publication. |
| Worker blocked | Preserve partial work; coordinator publishes blocked through guarded publication only when worker supplied truthful task-local evidence. Never fabricate an attempt or mark done. |
| Worker interrupted, unavailable, or response missing | Preserve the lane and partial work; keep unresolved/in-progress and inspect evidence. No fabricated terminal outcome: do not synthesize done or blocked or retry from a new Base. |
| Feedback absent | Dispatch independent artifact-only feedback for the integrated task range; do not count fully gated. |
| Feedback untracked or changed from `HEAD` | Re-review the same integrated range; untracked or modified verdicts never clear. |
| Latest feedback-touching commit is mixed | Require a fresh artifact-only feedback commit on the same task range. |
| Feedback stale or lint-invalid | Route stale evidence to its owner; do not issue an identical retry or infer approval. |
| Feedback fresh `skipped` | Request a new feedback pass; skipped does not clear. |
| Fresh changes-requested code-defect | Dispatch same task worker for correction with guarded `--admit --retry` against original Base and remaining lifetime reservations; integrate and verify, publish separately, then obtain new independent feedback. |
| `cannot verify from diff` / evidence-gap | Adjudicate located evidence on unchanged Base/Head; re-feedback same-Head only with new evidence, or route a confirmed code gap to correction. |
| Fresh `changes-requested` intent-defect | Return to approved intent owner; do not ask worker to work around it. |
| Fresh durable `approved`, no blockers | Count fully gated only after current context confirms prerequisite gates; then recompute readiness. |
| Integrated task has fresh durable approved feedback | Count fully gated only if readiness projection confirms prerequisites; then recompute all ready/held descendants. |

Only compatible ready tasks with independently admitted isolated lanes may run concurrently. Each worker owns its task-local attempt and original task commit; a single coordinator serializes shared integration and guarded root publication. The only publication outcomes are `done` and `blocked`; `interrupted` and `unavailable` are worker responses, not root statuses. Reuse the admission-bound original Base through retries, corrections, and lost caches. Before whole-branch review or finish, require every active task fully gated with fresh committed independent feedback.

## Task resume matrix

This matrix applies to historical serial plans only. Apply it to the earliest active task that is not fully gated. `Feedback state` means the
physically last pass in `tasks/task-N/feedback.md`, validated against the latest commit that
touched that task's progress file.

| Root status | Feedback state | Action |
| --- | --- | --- |
| `pending` | any | Dispatch `kepler-code` for Task N. |
| `blocked` | any | Dispatch `kepler-code` for Task N with the recorded blocker and newly available resolution. |
| `in-progress` | any | Inspect Task N's git state and task-local log before resuming or resolving it; never select another task. |
| `done` | absent | Dispatch `kepler-code-feedback` for the stable Task N range. |
| `done` | feedback untracked or changed from `HEAD` | Dispatch `kepler-code-feedback` for the stable Task N range. |
| `done` | latest feedback-touching commit is mixed | Dispatch `kepler-code-feedback` for the stable Task N range. |
| `done` | stale or lint-invalid, after any valid latest requested-change findings have been classified | Route to the owner of the invalid or stale evidence; do not issue an identical retry. |
| `done` | fresh `skipped` | Dispatch `kepler-code-feedback` for a new pass; the artifact is valid but does not approve the task. |
| `done` | `changes-requested`, fresh or stale | Preserve and classify every outstanding finding before freshness routing. Route code defects to `kepler-code`, evidence gaps through bounded located-evidence adjudication, and intent defects to the owning proposal/design stage. |
| `done` | durable, fresh `approved` with no blocking findings | Advance to the next active task or the whole-branch gate. |

A task feedback pass is fresh only when its full Base and Head are valid commits, Base is an
ancestor of Head, Head is an ancestor of current `HEAD`, and Head contains the latest commit that
touched `tasks/task-N/progress.md`. Establish range validity, material coverage, and unresolved
findings separately. A stale `changes-requested` pass retains its blocker set for classification;
staleness does not erase obligations or authorize the old verdict. Before any repeated dispatch,
name the changed code, located evidence, external condition, or corrected protocol input that could
change the result. If none changed, stop automated retries and ask the finding's owner to adjudicate.

Classify each new Blocking finding as `code-defect`, `evidence-gap`, or `intent-defect`, and retain
its stable `pass-N-blocking-M` identity when carried forward. A kind guides routing, not approval.
For legacy untyped task findings, retain the canonical `cannot verify from diff` fallback; adjudicate
ambiguous kinds rather than inventing a code defect. A located evidence gap may return to feedback
on the same Base and Head only after the driver supplies the exact newly checked evidence; do not
create a code commit or move the reviewed Head for evidence-only re-feedback.

For `in-progress`, inspect only that task's working tree, commits, checkpoint, and physical latest
attempt. Determine whether an interrupted implementer is still running, whether its work can be
resumed by a fresh `kepler-code` dispatch, or whether it must finish through the canonical
blocked path. Never manufacture an attempt entry or infer completion from code alone.

For `blocked`, read the latest task attempt before dispatch. Supply missing context, a resolved
external condition, or a more suitable explicitly named model. If nothing has changed, do not
repeat the same dispatch. A task too large or impossible as planned is a plan defect and stops for
re-plan or user adjudication rather than an improvised split.

## TDD refactor handoff

A green implementation is not an advancement point. The existing `kepler-code-feedback`
dispatch is the task's refactor-phase review: it receives the task-local red/green/refactor
evidence and judges whether the implementation is behavior-preserving.

A `changes-requested` refactor-phase review with a confirmed `code-defect` returns the same Task N
to `kepler-code`; relevant verification is required before a fresh `kepler-code-feedback` pass.
An `evidence-gap` requires independent located-evidence adjudication, not an invented code change;
an `intent-defect` returns to the owning proposal/design stage. Preserve and classify all blockers
before freshness routing. Only a fresh durable `approved` feedback pass permits advancement
to another task or the whole-branch gate.

## Whole-branch resume matrix

Use this matrix only after every active task is `done` with fresh `approved` feedback and no
blocking findings. `Review state` means the physically last pass in root `review.md`, validated
against the current branch and latest material change commit.

| Review state | Action |
| --- | --- |
| absent | Obtain a full whole-branch review with explicit target and actual merge base. |
| lint-invalid, undurable, or off-branch | Diagnose the exact invalid evidence with its owner; do not grant clearance or repeat an identical dispatch. |
| valid latest `changes-requested` | Preserve and classify all blockers before choosing remediation scope, even when material coverage is stale. |
| `approved`, valid range, material stale | Require new coverage; choose full review unless A4's bounded remediation conditions hold. |
| valid `skipped` | Obtain a non-skipped review with a stated review purpose. |
| valid full `approved` or `approved-remediation`, with current clearance | Hand off to `kepler-finish-work`. |

Whole-branch validity, actual target merge base, current material coverage, and outstanding
findings are separate checks. The physically last pass governs; never scan backward to an earlier
approval. After a full `changes-requested` pass, preserve and classify all findings before routing.
For code defects, append numbered remediation tasks and pass ordinary gates. An evidence-gap-only
case may use independently checked new located evidence on the unchanged material/plan range without
inventing tasks. Use bounded review only when the modern full baseline, immutable artifact commit,
retained scoped history, unchanged approved intent, exact target/Base, cumulative Head bounds and
correction-path classification all validate. Plan amendments may append tasks or carry an approved
execution-only transition with a fully gated prefix; original definitions, Notes and initialization
remain frozen. Otherwise require a new full inspection.
Repeated review dispatches must name the evidence change that could alter the result; with no such
change, stop and ask the responsible owner to adjudicate. Do not rerun approved current tasks or
review merely because conversation history was compacted or lost.

## Dependency-mode coordinator process

For v2, use the configured `kepler` executable; development fixtures may expose it through a source-backed local bridge. First run `workbench context <change-dir>` and derive verified `ready`, `held`, and `fullyGated` sets. For each selected ready task, observe and admit its expected worker/lane before dispatch using `workbench task-state --admit [--retry] --task N --change-dir <path> --expected-head <full40> --worker <observed-expected-worker> --worktree <linked-lane> --target-branch <full-ref>`. Ready is not admitted; compatible isolated admissions may execute concurrently, but no worker may mutate shared root evidence.

For a necessary prerequisite reservation, coordinator records it before edits with `workbench task-state --reserve --task N --change-dir <path> --expected-head <full40> --reservation '<exact JSON>'`; when reserving before admission include the target-branch flag required by the actual parser. The JSON binds `id`, `attempt`, `prerequisite`, `necessity`, `evidence`, concrete `paths`, and `verify`. Lifetime limit: two reservations per task, at most four paths per reservation, no refund across retry, abandonment, or correction. Reservations do not authorize new dependencies, public API changes, or security-policy changes; goal-serving unlisted edits alone do not require reservation. If necessity/intent is unresolved, bounds are exhausted, or changes exceed authority, preserve work and hold for re-plan.

Workers return original task commits plus truthful task-local evidence. The coordinator serializes common-gitdir integration without rewriting worker ancestry, verifies exact task Verify on integrated bytes, then separately publishes with `workbench task-state --publish --task N --change-dir <path> --expected-head <full40> --task-head <full40> --verify '<exact Verify>' --response done|blocked`. Use the source parser's accepted response and option combinations; never pass incompatible admission flags to reserve/publish. Publication is separate ledger-only coordination, not feedback clearance. Package the actual integrated range with `workbench diff --task N --change-dir <path>`; do not use `--record`, which writes or validates a checkpoint cache. Missing/interrupted/unavailable worker responses preserve partial lane work and original admission Base, without fabricated attempts or terminal results. A blocked publication is coordinator-owned and does not discard partial edits. After every integration/publication recompute context; descendants remain held until prerequisites have fresh, durable, independent feedback approvals.

Before whole-branch review or finish, every active task must be fully gated: integrated completion, guarded publication, and fresh committed independent feedback covering the integrated range. Root `done` or ready status alone never clears a task. Feedback remains independently authored and artifact-only; feedback outcome routing remains: approved clears only its task, skipped does not clear, changes-requested code-defect returns to that task's worker with verification, evidence-gap gets located independent evidence without invented code, intent-defect returns to intent owner, and invalid/stale evidence holds for owner diagnosis. Preserve all outcomes across missing/interrupted responses and never repeat unchanged dispatches.

## Historical serial process

The following numbered lifecycle applies to unversioned and version-1 serial plans. For v2, use the dependency-mode coordination contract and outcome routing above; do not make workers mutate shared root state or force one global serial lane.

## Process

1. **Verify workspace isolation.** Run
   `kepler workbench isolate --check --change-dir <change-dir>`. Continue only when
   its last line is `isolated: yes`. If the Kepler CLI/workbench is unavailable, verify that the
   change directory is under the repository root and the branch is not the default branch. Otherwise
   stop before dispatching.
2. **Load durable state.** Run `kepler workbench lint --change-dir <change-dir>` first and
   stop with its findings on nonzero exit. This lint includes exact consistency between root
   progress metadata and body rows. Then run `kepler workbench context <change-dir>` and read
   `plan.md` for active task identity and shared constraints and root `progress.md` for current
   per-task status. Treat its aggregate `status` as an implementation summary only. Require stage
   inputs, without independently validating artifact layout.
   Read detailed task evidence only for the task currently being diagnosed, implemented, or
   reviewed. Determine verdicts from the physically last lint-valid pass and check its Base and
   Head against Git rather than trusting a summary. During this load, evaluate **Durable task
   approval** for every apparent approval before marking any task fully gated.
3. **Mirror the plan in the todo tool.** Create one visible entry per active task, in validated
   execution order (numeric identity order for legacy plans),
   and one trailing whole-branch review entry. Reflect root status and fresh approval, but never
   use the todo tool as a resume source.
4. **Run the pre-flight scan once.** Before the first task attempt, require `formal-intent:
   tactical` or `formal-intent: approved-reference`; `approval-required` and `stale` return to
   `kepler-propose`. If `critique-disposition` is present, require `settled`; `owner-decision-required`,
   `application-required`, and `no-clearance` hold at the artifact owner. An absent optional critique
   is not a hold. If `input-impact-history` or `execution-history` is present, require `verified`;
   uncommitted or blocked history stops before selection. For the selected task, require input
   standing `current`, `impact-reviewed-unaffected`, or `legacy-current-confirmed`; missing, stale,
   or `legacy-confirmation-stale` returns to the owner for scoped diagnosis. A legacy confirmation
   records current inputs with historical provenance explicitly unknown, not an old snapshot, and
   does not authenticate or replace any task or review gate. Scan the plan for internal conflicts or
   mandates that its own task feedback gate would reject. Batch genuine conflicts for user
   adjudication. If every gate is clean, continue without pausing. For a route-backed change,
   require context to resolve one canonical route/unit and its exact committed route-source
   revision. Resolve the actual delivery target from the route Shipping rules and map `branch:`;
   stop if source/target identity cannot be verified. Before any new task checkpoint or code write,
   scan known proposals/plans, local and visible remote branches, and worktrees for another owner
   of that unit. Resume only this same owner/change/source branch; send a competing or ambiguous
   claim to the designated controller for explicit resume/transfer or a stop. This local scan shows
   visible claims only and cannot prove cross-clone exclusivity; concurrent cross-clone claims/
   shipping are unsupported.
5. **Select the current task.** Apply **Task resume matrix** to active tasks in the validated
   execution order (numeric identity order for legacy plans). Mark
   only its todo entry active. A fully gated task stays complete; a root `done` row alone does not
   authorize advancement. Before selecting a later task and recording its checkpoint, re-evaluate
   **Durable task approval** for the immediately preceding task. On failure, route that task to
   `kepler-code-feedback` and do not record the next task checkpoint.
   Bind admitted dispatch identity to the full `HEAD`, full named source branch ref, resolved full
   delivery-target ref, canonical repository root, canonical worktree Git directory, and exact
   assigned worker/run/session identity. For route-backed work, also bind owner/change, canonical
   route/unit, route-source revision, and base/input revision. Recheck that the source branch differs
   from its target by normalized refs/configured local/remote mapping, never by tip SHA. Obtain
   current worker identity independently through the execution harness. If identity is allocated only at
   startup, keep that child read-only until its binding is admitted; unavailable identity holds.
   This binding is handoff evidence, not another workflow ledger or approval.
6. **Resolve and validate the task checkpoint before code.** Execute kepler-code's read-only
   **Dispatch identity readback** against the admitted binding before checkpoint writes and again
   before handing off code; this includes the source/target role check. For route-backed work,
   recheck current context's binding/revision and the visible claim scan before dispatch. Then apply
   **Checkpoint establishment and recovery** and run
   `kepler workbench diff --record --task N --change-dir <change-dir>` before
   every code dispatch. The CLI records a new checkpoint only for a clean, committed, pending
   task with no attempt or feedback; otherwise it validates or reconstructs the original Base from
   durable first-attempt and feedback history. Stop for intervention when recovery is ambiguous.
   Recheck the selected task's input standing before dispatch. A legacy task without versioned input
   provenance may use only a committed, task-scoped `legacy_input_confirmations` entry reported as
   `legacy-current-confirmed`; never convert its current input list into historical evidence. For
   historical version-1 serial execution metadata, re-run context and scoped lint, require `execution-history: verified`, and confirm its validated serial order has not changed since selection. Dispatch only its first slot
   that is not fully gated, with the current full plan commit, slot number, previous sequence-slot
   task ID and that task's durable fresh approval evidence. A newly inserted prerequisite cannot
   dispatch until the required quiescence and exact partial-work preservation/restoration authority
   are documented and verified; otherwise stop for owner intervention. After any plan/order/HEAD/worker/
   branch/repository/worktree-identity change, discard selection and recalculate. An unchanged plan
   commit cannot authorize a different HEAD. Legacy plans use numeric
   order and the same one-task-plus-fresh-approval gate.
7. **Dispatch `kepler-code`.** Populate `references/implementer-prompt.md` with one exact Task N,
   its matching root metadata entry and row, task log, either its task-local version-1 input/context
   handoff or the task's scoped `legacy-current-confirmed` record with `historicalInputs: "unknown"`,
   and cited source blobs, verified quality/decision constraints, the current full plan commit,
   admitted dispatch HEAD/source-branch/target/repository/worktree/worker binding, route ownership
   and source-revision binding when applicable, and independent worker identity readback source. For legacy tasks missing task-local quality fields, supply a task-scoped current
   quality/decision record checked against the unchanged contract and repository sources; preserve
   frozen task definitions and do not add Acceptance or Files. New tasks carry the record in their
   block. Include explicit sequence/slot/predecessor approval evidence when applicable, minimal prior
   interfaces and either
   first-attempt context or its fresh `changes-requested` feedback path. Require the task-local
   report to carry the red/green/refactor evidence or a justified exception and repeatable
   alternative verification. Do not provide a
   second detailed reporting destination. When the subagent returns, rerun
   `kepler workbench lint --change-dir <change-dir>` and stop on nonzero exit before further
   dispatch. Then independently read the committed root metadata entry and row, task-local status,
   and physical latest attempt/Outcome instead of trusting its concise response. Diagnose any disagreement with the coder before
   applying the task matrix; do not advance or ask feedback to manufacture status. A `blocked` or
   interrupted result returns to the task matrix.
8. **Package the task diff after code marks the task `done`, or when re-reviewing a done task.** Run
   `kepler workbench diff --task N --change-dir <change-dir>`. Capture the
   printed full Base and Head and scratch package path. Require Base to equal the unchanged task
   checkpoint and Head to contain the latest task progress commit.
9. **Dispatch `kepler-code-feedback`.** Fill `references/code-feedback-prompt.md` with the exact
   task, full Base and Head, diff package, task-local progress path, feedback destination,
   task-local TDD evidence, project standards, verbatim task acceptance and cited constraints,
   the same verified quality/decision context used by code (dispatch-supplied for legacy tasks
   lacking these fields), its latest attempt's criterion/check evidence, and bounded located-risk
   context. Preserve the frozen contract; quality context cannot expand Acceptance/Files or waive
   review. Use `none` for an ordinary located-risk pass.
   Separately supply peer-approved commit/path context when the cumulative range contains a
   prerequisite or peer task: exact task IDs, reviewed Base/Head, approval feedback commit/path,
   approval boundary, and covered production commits with their changed paths. Use `none` only
   when there is no peer context; never invent approval for an unattributed commit. Verify each
   approval against its committed artifact and artifact-only commit at that boundary. Retain the
   original Task N Base and full cumulative package, including overlapping files. The reviewer
   performs the task's refactor-phase review with commit-attributed inspection of the complete
   range; never exclude whole filenames or
   conceal later unapproved Task N changes behind peer approval. It persists the supplied full
   range in `tasks/task-N/feedback.md`.
10. **Confirm the feedback artifact-only commit.** Require the feedback subagent to commit only
    `tasks/task-N/feedback.md`, verify the commit's path list, and re-read the physical last pass.
    Verify its format and durability separately from approval. Preserve and classify every valid
    latest requested-change blocker before freshness routing, whether its material coverage is
    fresh or stale. A `changes-requested` refactor-phase review with a confirmed `code-defect`
    returns the same Task N to `kepler-code`; relevant verification is required before fresh feedback.
    Route an `evidence-gap` through independent located-evidence adjudication on the same Base/Head
    and an `intent-defect` to the owning proposal/design stage. Invalid or stale evidence needs
    owner diagnosis; do not issue an identical retry without changed useful input.
    Re-evaluate **Durable task approval** immediately after the handoff and complete this check
    before proceeding to **Select the next active task**. Apply the task matrix again: only a
    fresh durable `approved` feedback pass may advance.
11. **Adjudicate a bounded evidence gap.** For a typed `evidence-gap`, or a legacy finding with
    canonical `cannot verify from diff` wording, the driver adjudicates only its concrete named risk.
    For a confirmed code gap, dispatch `kepler-code` for the correction and then
    `kepler-code-feedback` with the located gap. If located evidence resolves the concern without a
    code change, re-dispatch the reviewer with the exact evidence and require a new physical pass on
    the same Base and Head. If no relevant evidence or external condition changed, stop repeated
    dispatches and ask the owner to adjudicate.
12. **Enter the whole-branch gate.** Before entering the whole-branch gate, re-evaluate
    **Durable task approval** for every active task. Any failed predicate prohibits whole-branch
    packaging. Apply the task matrix: route state disagreement to the coder, classified findings
    to their owner, and changed reviewable evidence to feedback. Do not repeat an identical feedback
    dispatch merely because a predicate failed. Only when all active tasks are
    fully gated may the driver apply **Whole-branch resume matrix**. For a required full or bounded
    review, run `kepler workbench diff --whole-change --target-branch <target-branch>`, then fill
    `references/whole-branch-review-prompt.md` with the actual merge base, current Head, complete
    package, approved change intent, root ledger, and linked task evidence.
13. **Confirm the review artifact-only commit.** Require `kepler-review` to commit only root
    `review.md`, verify the commit's path list, and re-read its physical last pass. Apply the
    whole-branch matrix again rather than trusting transient output.
14. **Route whole-branch findings.** Apply **Whole-branch findings** to every valid latest
    `changes-requested` pass, fresh or stale. Preserve and classify all blockers before scope or
    freshness routing. Code corrections return through numbered tasks and ordinary gates;
    evidence-only adjudication preserves the material/plan range, and an intent defect returns
    to approved proposal revision. No changed useful input means no identical automated retry.
15. **Hand off after current clearance.** When the physical last whole-branch pass is valid,
    durable, fresh, and either full `approved` or validated `approved-remediation`, with no blocking
    findings, confirm the worktree and change directory are clean and hand off to
    `kepler-finish-work`. Do not merge or open a pull request here.

Transient subagent output or parseable worktree text never substitutes for committed evidence and
never authorizes the driver to advance.

## Whole-branch findings

Preserve the complete finding set before choosing a route. For confirmed `code-defect` findings
consistent with approved requirements and design, send those classified obligations to `kepler-plan`
in re-plan mode. Re-plan must append one or more appropriately sized numbered remediation tasks,
initialize their root rows and task progress files, and commit its
artifacts. Each new task runs through the ordinary `kepler-code` and `kepler-code-feedback` loop.
After those gates, repeat the whole-branch review gate in the selected full or bounded mode under
the resume matrix. For `evidence-gap` only,
independently adjudicate new located evidence on the unchanged material/plan range without invented
code or tasks. Preserve the complete finding set throughout either route.

Classify every whole-review blocker by its typed kind and stable identity before routing. Route
`code-defect` findings consistent with approved intent to numbered remediation tasks; route
`evidence-gap` findings through bounded located-evidence adjudication and stop identical retries;
route `intent-defect` findings to the owning proposal/design stage. When any finding requires changing
an approved requirement or design decision, stop and return the affected artifacts and finding to
`kepler-propose` for revision and approval. Do not ask re-plan or code to work around an upstream defect.

All whole-branch implementation corrections enter re-plan. Frozen completed tasks remain
unchanged, and every correction becomes a numbered active task present in `plan.md` with its own
ordinary implementation and feedback ownership. After those gates, select a bounded review against
the retained modern full changes-requested baseline only when A4's provenance, intent, target,
plan-amendment, range, and coverage checks pass. Otherwise dispatch a new full review. An approved
intent defect returns to `kepler-propose` and always requires full review after re-approval.

## Durable resume

Root `progress.md` is the current implementation ledger. On start, compaction, or interruption,
read its canonical rows instead of reconstructing task status from attempt history. Task-local
progress remains append-only evidence and is opened only for the current task.

Combine each root row with the task's physical latest feedback verdict and freshness. Resolve the
latest implementation commit as the latest commit touching `tasks/task-N/progress.md`, and require
that task artifact to be committed exactly at HEAD with consistent terminal evidence. Context
reports task feedback freshness through the shared historical checkpoint verifier. Its whole-review
`range-fresh; clearance-unverified` label proves range coverage only; independently check target,
clearance scope, outstanding findings and retained evidence before handoff. Use lint for the last
pass's format, then check its full Base and Head, ancestry, and containment. Before
every code attempt, validate `tasks/task-N/.base` as the original pre-implementation commit. If it is missing or
malformed after historical evidence exists, apply **Checkpoint establishment and recovery**;
never replace it with the resume-time `HEAD`. A task is selectable as complete only when the row
is `done` and that last pass is fresh `approved` without blocking findings.

After every task passes, inspect root `review.md` the same way. Its physical last pass and latest
material change commit determine the whole-branch matrix. A committed earlier approval, a todo
checkmark, an agent response, or remembered conversation never overrides current physical state.

## Model roles

Specify a model on every dispatch.

- **Task implementer (`kepler-code`):** use a fast, economical model for narrow mechanical work
  and a standard model for multi-file or integration-heavy tasks. Escalate a blocked retry only
  when greater reasoning capability addresses the recorded blocker.
- **Task feedback (`kepler-code-feedback`):** use a standard model scaled to the task diff's
  risk. Subtle security, concurrency, or contract changes warrant the strongest suitable task
  reviewer.
- **Whole-branch review (`kepler-review`):** use the most capable available model because this
  pass owns integration, affected-consumer, and omission analysis across the repository.
- **Remediation planning (`kepler-plan`):** use a model capable of splitting the complete
  finding set into independently verifiable numbered tasks without changing approved intent.

## File handoffs

- **Implementation evidence:** the root Task N row supplies current status and
  `<change-dir>/tasks/task-N/progress.md` supplies the detailed physical latest attempt, including
  red/green/refactor evidence or a justified exception. There is no second implementer narrative
  artifact.
- **Task range:**
  `kepler workbench diff --task N --change-dir <change-dir>` packages the
  unchanged task-local checkpoint through current `HEAD`. Pass its printed full Base, Head, and
  scratch path to the code-feedback prompt.
- **Task verdict:** `<change-dir>/tasks/task-N/feedback.md` is append-only and is committed alone
  before the driver selects another task or dispatches a correction. Its fresh durable `approved`
  pass is the only advancement authorization.
- **Whole-branch range:** `kepler workbench diff --whole-change --target-branch <target-branch>`
  packages the actual merge base with the explicitly selected full target reference through current
  `HEAD`. Bounded remediation also receives a cumulative `kepler workbench diff --base <delta-base>`
  package from its retained full-review Head. Pass the complete package, approved intent, and
  baseline provenance to the whole-branch prompt.
- **Whole-branch verdict:** `<change-dir>/review.md` is append-only and is committed alone before
  the driver re-plans or hands off to finish-work.
- **Constraints:** task feedback receives only the task's acceptance criteria and cited binding
  sections. Whole-branch review receives the complete approved requirements and design.

## Boundaries

- Always: verify isolation; use lint for artifact validity; read task identity and state; use the
  two resume matrices; create a checkpoint only for a genuine evidence-free first attempt; validate or unambiguously
  recover the original checkpoint before later code; name a model on every dispatch; serialize
  task work; verify each verdict's artifact-only commit; require fresh approvals before advancing.
- Ask first: starting on the default branch; a finding that conflicts with plan-mandated behavior;
  a blocker that proves the plan itself invalid and lacks an already specified re-plan path.
- Never: edit implementation, tests, plan, or stage-owned evidence in the controller; dispatch two
  implementers concurrently; infer task identity from a title; read sibling task detail without a
  concrete current-state reason; advance on root `done` alone; accept a stale or lint-invalid pass;
  send whole-branch findings directly to code; merge or open a pull request.

## Output

Every active plan task is committed with root status `done`, canonical task progress, and a
physically last task-feedback pass that is valid, fresh, `approved`, and free of blocking findings.
The complete branch has a committed root review pass that is valid, fresh, and either `approved` or
fully validated `approved-remediation`, free of blocking findings. The worktree and change directory are clean, and control is handed to
`kepler-finish-work`. If an unresolved blocker or upstream artifact defect remains, report it
plainly and stop in its owning stage.

## Process flow

```dot
digraph kepler_orchestrate {
    "Verify isolation + load durable state" [shape=box];
    "All tasks done + fresh approved feedback?" [shape=diamond];
    "Read earliest task row + physical feedback pass" [shape=box];
    "Task state?" [shape=diamond];
    "Classify task findings before freshness" [shape=diamond];
    "Adjudicate new task evidence + same Base/Head" [shape=box];
    "Stop for owner diagnosis or unchanged input" [shape=octagon];
    "Inspect interrupted task state" [shape=box];
    "Resolve checkpoint state" [shape=box];
    "Valid task-N/.base?" [shape=diamond];
    "Create at HEAD\n(pending + no evidence only)" [shape=box];
    "Recover original base\n(or stop for intervention)" [shape=box];
    "Validate task-N/.base" [shape=box];
    "Dispatch kepler-code" [shape=box];
    "Package task .base..HEAD" [shape=box];
    "Dispatch kepler-code-feedback" [shape=box];
    "Confirm feedback-only commit" [shape=box];
    "Read physical whole-branch review pass" [shape=box];
    "Whole-review state?" [shape=diamond];
    "Select full or validated bounded review" [shape=diamond];
    "Adjudicate new whole-review located evidence" [shape=box];
    "Package merge-base..HEAD" [shape=box];
    "Package whole range + original full Head delta" [shape=box];
    "Dispatch kepler-review" [shape=box];
    "Confirm review-only commit" [shape=box];
    "Classify complete findings" [shape=diamond];
    "Dispatch kepler-plan re-plan\n(numbered remediation tasks)" [shape=box];
    "Stop at kepler-propose\n(upstream artifact defect)" [shape=octagon];
    "Hand off to kepler-finish-work" [shape=doublecircle];

    "Verify isolation + load durable state" -> "All tasks done + fresh approved feedback?";
    "All tasks done + fresh approved feedback?" -> "Read earliest task row + physical feedback pass" [label="no"];
    "Read earliest task row + physical feedback pass" -> "Task state?";
    "Task state?" -> "Inspect interrupted task state" [label="in-progress"];
    "Inspect interrupted task state" -> "Resolve checkpoint state" [label="resume"];
    "Task state?" -> "Resolve checkpoint state" [label="pending / blocked with changed resolution"];
    "Task state?" -> "Classify task findings before freshness" [label="changes-requested, fresh or stale"];
    "Classify task findings before freshness" -> "Resolve checkpoint state" [label="code-defect"];
    "Classify task findings before freshness" -> "Adjudicate new task evidence + same Base/Head" [label="evidence-gap"];
    "Classify task findings before freshness" -> "Stop at kepler-propose\n(upstream artifact defect)" [label="intent-defect"];
    "Adjudicate new task evidence + same Base/Head" -> "Dispatch kepler-code-feedback" [label="changed useful evidence"];
    "Adjudicate new task evidence + same Base/Head" -> "Stop for owner diagnosis or unchanged input" [label="no changed useful input"];
    "Task state?" -> "Stop for owner diagnosis or unchanged input" [label="invalid evidence / unchanged blocked input"];
    "Resolve checkpoint state" -> "Valid task-N/.base?";
    "Valid task-N/.base?" -> "Validate task-N/.base" [label="yes"];
    "Valid task-N/.base?" -> "Create at HEAD\n(pending + no evidence only)" [label="genuine first attempt"];
    "Create at HEAD\n(pending + no evidence only)" -> "Validate task-N/.base";
    "Valid task-N/.base?" -> "Recover original base\n(or stop for intervention)" [label="historical evidence"];
    "Recover original base\n(or stop for intervention)" -> "Validate task-N/.base" [label="unambiguous"];
    "Validate task-N/.base" -> "Dispatch kepler-code";
    "Dispatch kepler-code" -> "Read earliest task row + physical feedback pass";
    "Task state?" -> "Package task .base..HEAD" [label="done + absent feedback / valid stale approval with changed coverage input"];
    "Package task .base..HEAD" -> "Dispatch kepler-code-feedback";
    "Dispatch kepler-code-feedback" -> "Confirm feedback-only commit";
    "Confirm feedback-only commit" -> "Read earliest task row + physical feedback pass";
    "Task state?" -> "All tasks done + fresh approved feedback?" [label="done + fresh approved"];
    "All tasks done + fresh approved feedback?" -> "Read physical whole-branch review pass" [label="yes"];
    "Read physical whole-branch review pass" -> "Whole-review state?";
    "Whole-review state?" -> "Select full or validated bounded review" [label="absent / valid stale approval / skipped with new purpose"];
    "Whole-review state?" -> "Stop for owner diagnosis or unchanged input" [label="lint-invalid / undurable / off-branch"];
    "Select full or validated bounded review" -> "Package merge-base..HEAD" [label="full"];
    "Select full or validated bounded review" -> "Package whole range + original full Head delta" [label="remediation"];
    "Package merge-base..HEAD" -> "Dispatch kepler-review";
    "Package whole range + original full Head delta" -> "Dispatch kepler-review";
    "Dispatch kepler-review" -> "Confirm review-only commit";
    "Confirm review-only commit" -> "Read physical whole-branch review pass";
    "Whole-review state?" -> "Classify complete findings" [label="changes-requested, fresh or stale"];
    "Classify complete findings" -> "Dispatch kepler-plan re-plan\n(numbered remediation tasks)" [label="code-defect"];
    "Dispatch kepler-plan re-plan\n(numbered remediation tasks)" -> "All tasks done + fresh approved feedback?";
    "Classify complete findings" -> "Adjudicate new whole-review located evidence" [label="evidence-gap"];
    "Adjudicate new whole-review located evidence" -> "Select full or validated bounded review" [label="changed useful evidence, unchanged material/plan range"];
    "Adjudicate new whole-review located evidence" -> "Stop for owner diagnosis or unchanged input" [label="no changed useful input"];
    "Classify complete findings" -> "Stop at kepler-propose\n(upstream artifact defect)" [label="intent-defect"];
    "Whole-review state?" -> "Hand off to kepler-finish-work" [label="approved / approved-remediation, current"];
}
```

## Dependency-mode coordination

For `execution: {version: 2, mode: dependencies}`, derive ready, held and fullyGated tasks with `kepler workbench context <change-dir>`. Root `done` is implementation publication, not clearance. Dispatch only compatible ready tasks in isolated lanes; serialize original-commit integration and guarded root publication. One coordinator performs `task-state --admit`, optional `--reserve`, and `--publish`; it does not invent a scheduler or cache. Descendants of blocked or uncleared tasks hold while unrelated ready tasks may proceed. Each active task needs current committed implementation evidence and fresh independent approved feedback before final review or finish. Preserve explicit legacy serial handling for unversioned and version-1 execution.
