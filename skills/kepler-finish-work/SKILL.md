---
name: kepler-finish-work
description: "Finish a gated change: synchronize canonical specs, record paired finish history, execute the selected strategy, and verify every external and workspace effect."
---

# Finishing a change

Close out a change only after its exact task evidence and whole-branch review open the finish gate. Synchronize the canonical specifications, record the intended finish durably, carry out the selected strategy, read back the result, and durably record what happened.

The **seven-stage core pipeline** is Kepler's fixed spec-driven sequence: init → propose → plan → code → code-feedback → review → finish-work. A person or agent can run each step as a skill. This skill is **step 6**, the last step: finish-work. Wayfinder and `kepler-critique` are optional and do not count toward the seven-step core.

## Inputs

- The change directory path (`.kepler/changes/<change>/`) and its exact split-pipeline evidence:
  - `<change-dir>/plan.md` and the lint-valid root ledger at `<change-dir>/progress.md`.
  - The physically last implementation attempt in every active `<change-dir>/tasks/task-N/progress.md`, and the physically last feedback pass in its matching `<change-dir>/tasks/task-N/feedback.md`.
  - The physically last whole-branch review pass in `<change-dir>/review.md`.
  - The append-only finish history at `<change-dir>/finish.md`, if it exists.
- The already approved specification inputs: `proposal.md`, `design.md`, and `requirements/` where present, plus the current canonical `.kepler/specs/` documents.
- The `route_unit` frontmatter field in `proposal.md` or `plan.md` when the change executes a route unit, and that unit's exact `route.md` and `map.md` paths.
- The finish strategy: `local-merge`, `pull-request`, or `no-op`. If unspecified, use the project's explicit default or ask the user.
- Any explicit user waiver of material-change ancestry. Never infer one.
- Project standards from `AGENTS.md`: full test and build commands, base branch, Git workflow, remote conventions, and pull- or merge-request tooling.

Use `kepler workbench lint --change-dir <change-dir>` to validate existing artifact format and schema; its exit status is the single source of truth for validity. Required task and review evidence, their committed state, and completion readiness are separate finish gates. Do not reject a lint-valid artifact because of its layout or differences from a template.

## References

This skill ships with a `references/` folder. Use the Read tool to read its reference files from this skill's directory. They are co-located with this `SKILL.md`, not at `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`.

- `references/spec-altitude.md` — the altitude rubric and canonical spec's human-readable skeleton (`## Overview` / `## Contract` / `## Behavior` with Examples / `## Invariants` / `## Decisions`). Apply it during specification synchronization.

## Principles

- **Gate before effects.** Do not synchronize specs, mutate a route, allocate an attempt, merge, push, open a request, or remove a workspace until the exact preconditions pass.
- **Physical evidence governs.** Use the exact root ledger and physically last task and review records. Never recover an earlier approval from history.
- **Intent before action; observation after action.** Commit an `Attempt N` before changing canonical specs or performing any other finish side effect. Read back every effect before its matching `Outcome N`.
- **Finish history is paired and append-only.** The attempt records what will be done; the outcome records what was verified. Neither rewrites the other.
- **Specs are the truth.** Validate approved deltas read-only before journaling. Fold them into canonical specs at human-readable altitude only inside a verified durable Attempt.
- **Same-attempt ownership is narrow.** This skill's expected canonical spec, route, map, and numbered finish mutations do not invalidate the attempt whose gate admitted them. No other post-gate material edit receives that treatment.
- **Root progress is task state only.** Finish-work reads the root ledger but never changes root `progress.md` or any task-local execution artifact.
- **Honest completion.** Never infer an external effect from command success alone or report a result without reading it back and persisting it.

## Preconditions

For a new attempt, run `kepler workbench lint --change-dir <change-dir>` and stop with its findings if it exits nonzero. Identify the complete test suite and build/typecheck commands in `AGENTS.md`. Pass a command that runs both to the installed gate; do not guess or omit either:

```bash
kepler workbench precondition \
  --change-dir <change-dir> --test-cmd '<full test suite && build/typecheck>' \
  --target-branch <full-target-reference>
```

Use `--whole-change-waived` only for an explicit user waiver. The waiver changes only the whole-branch review's material-change ancestry comparison; it does not waive the exact root task ledger, task feedback, whole-branch review validity or verdict, blocking findings, range ancestry, clean tree, or verification gates.

The precondition command decides completion readiness; it does not add artifact-format requirements to lint. It must validate all these facts and close with `gate: open`:

- The working tree is clean, and the full test suite and build/typecheck pass.
- The exact root task ledger has one ordered row for every active task, no extra row, the exact lowercase task-progress link, and status `done`. In every linked file, the physically last task attempt is well formed and has exactly one `Outcome: done`.
- Every active task's task-progress artifact is tracked and committed at `HEAD`; its latest implementation commit resolves, and its physically last feedback pass is valid, fresh for that commit, `approved`, on the current branch, and has no blocking findings or unresolved `cannot verify from diff` finding. Its Base agrees with the canonical first-attempt checkpoint. Verify each task's current definition digest and selected-input handoff against committed history. Require any input-impact classification to be committed and verified, and affected tasks to carry the required follow-up plan binding. A historical task with absent input provenance may use only a task-scoped `legacy_input_confirmations` entry that context and admission report as `legacy-current-confirmed`. Its `historicalInputs: "unknown"` remains unknown, and the record binds the unchanged task definition, canonical repository, current committed inputs/approval, owner and independent-review references, and rationale. This is a current scope confirmation, not historical proof, authentication, semantic review, or a waiver. All task-feedback, intent, review, cleanliness, test, and whole-change gates still apply. Any declared execution transition must be committed, verified and consistent with task history. Preserve numeric identity order in the ledger and keep completed task definitions immutable; ledger order does not prescribe execution order.
- Every present formal proposal/design/requirements input has explicit `approved` / `accepted` metadata, an exact full-commit plan reference and requester-held approval reference, and current bytes matching that committed revision. Tactical absence is valid; a plan's status/default or lint alone is not approval. If optional `critique.md` exists, require its disposition to be settled. These owner references are assertions, not cryptographic authentication.
- The physically last whole-branch review pass is valid, durable, and on the current branch. It may be a full `approved` pass or a validated `approved-remediation` pass whose immutable full baseline, resolution map, target/range, intent, and correction coverage all pass the CLI gate. Either verdict must have no blocking findings. Its range must use the actual target merge base. Unless explicitly waived, its Head must contain the latest material change commit. A metadata disposition such as `applied` never grants clearance; the waiver changes only material ancestry.

If the Kepler CLI/workbench is unavailable, stop; a hand-written artifact parser cannot replace lint or the precondition command. Fail closed on missing evidence, contradictory state, unreachable or stale commits, and unverifiable finish gates.

If any gate fails, stop and report its output verbatim. Do not perform a finish action, create or change `finish.md`, synchronize specs or route state, or write root `progress.md`. A precondition failure has no finish-history record because no attempt began.

After the gate opens, require one `verified-head: <full-commit>` line and compare it with current `HEAD`. If the identity is absent or differs, rerun preconditions. Use the verified identifier as gate-entry `HEAD`; do not silently capture a newer revision. Then capture the named source branch, resolved delivery target, base branch, worktree path, review Base and Head, latest material commit, waiver state, and route state.

For new generation/finish effects, require the named source branch to differ from the actual target by normalized refs and configured local/remote mapping, never by tip SHA. The only exception is the scoped A7 repair of an already-observed delivered effect on its surviving base; it cannot authorize new code or delivery and must use A7's recorded provenance and exact repair allowlist instead of ordinary source-branch admission.

Before canonical-spec synchronization or any finish intent, run `kepler workbench context <change-dir>` for route-backed work. For an ordinary attempt, require an unambiguous canonical route/unit, its exact committed route-source revision, and an owner/change/source/target/base match; inspect visible claims for another owner and stop on conflict or ambiguity. A7 repair verifies the original route/effect provenance and cannot replay a route transition. This local scan does not provide distributed exclusivity. Before the first effect and each later effect, confirm that `HEAD`, source/target branches, base branch, worktree identity, and target repository still match the admitted boundary. Stop if a branch or worktree changes, even when the commit SHA stays the same.

## Specification synchronization

Run `kepler workbench context <change-dir>` to identify approved change artifacts and capability deltas. If the Kepler CLI/workbench is unavailable, list those paths directly. Before editing a canonical spec, confirm that the approved proposal, design, and requirement deltas are complete and mutually consistent. Treat them as read-only inputs throughout finish-work.

For each approved `requirements/<capability>.md`, read the current `.kepler/specs/<capability>.md` with the delta, then draw durable rationale, decisions, and reusable patterns from the approved `design.md` and `proposal.md`. Before writing a new author-bearing canonical spec, read `git config user.name` and `git config user.email` and use `author: Name <email>`; if either value is missing, stop without inventing attribution. When editing an existing canonical spec, preserve its recorded author metadata exactly. Write canonical `.kepler/specs/` documents only from approved change artifacts.

Derive the content only from approved change artifacts. Never invent canonical behavior from the raw diff, root or task progress, task feedback, whole-branch review comments, or an external request. During finish-work, never add, edit, or rewrite a file under `requirements/`.

During read-only validation, abort before allocating an attempt or committing canonical specs if synchronization requires a missing or incorrect change requirement. Route the defect to artifact revision and require a fresh whole-branch review before finish-work runs again. Apply the same rule when the proposal, design, and requirement deltas disagree. Report the affected artifact and mismatch; do not repair approved intent during finish-work.

Write canonical specifications in the human-readable skeleton from `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/requirements-spec.md`. Never copy the change-side Requirement/SHALL/Scenario shape or its delta-group headings into a canonical spec. Translate each delta into its anchored contract surface:

- **ADDED** adds a contract row, behavior and Examples bullet, invariant, or decision.
- **MODIFIED** rewrites the affected section or subsection to the new behavior.
- **REMOVED** removes that behavior from its anchored section.
- **RENAMED** renames the public subsection anchor when the rename belongs in the spec.

If no canonical spec exists, create it from the template and include every applicable ADDED and MODIFIED behavior. Apply `references/spec-altitude.md`: discard private mechanisms, preserve consumer-visible persisted fields in `## Contract`, fold observable scenarios into Examples, and state reusable rules once. Reserve `MUST` and `NEVER` for invariants.

When the change has no requirement delta, compare its touched capabilities with existing specs. If behavior changed, treat the missing delta as a missing change requirement and abort for artifact revision and fresh whole-branch review. Otherwise, record that no canonical spec changed. A tactical path does not permit spec drift.

Do not mutate a canonical file during validation. First resolve its exact planned target and approved input blob identities, then commit and verify the Attempt as specified in Process.

Only inside that same Attempt, run `kepler workbench lint --file <file>` at the mutation boundary after each canonical spec mutation. A nonzero lint result fails the gate: correct the spec and rerun lint, or stop with the exact finding without staging or committing it. This file-scoped lint adds to, but does not replace, the semantic, freshness, ancestry, or completion gates.

Review the synchronization and stage only canonical `.kepler/specs/` paths derived from approved artifacts. If any changed, commit them after the verified finish Attempt, verify the commit, and restore a clean tree. If none changed, record no change without creating an empty commit.

Record the actual synchronization paths/commit or verified no change in Outcome, never as an already-observed synchronization in the preceding intent. Either result is an expected finish-owned synchronization for this attempt, but neither makes an unrelated edit safe.

## Finish history

`<change-dir>/finish.md` is the only finish-history artifact. On the first admitted attempt, load and instantiate the exact installed `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/finish.md` template. Populate its frontmatter fields `change`, `status`, `created`, `updated`, `strategy`, `result`, and `decision`. Substitute the real change title and first complete attempt, remove the opening instruction block and every inline hint, and leave no authoring instructions or hints in the live file.

For later attempts, run `kepler workbench lint --file <change-dir>/finish.md` before use, then derive the next attempt from the cleaned record portion of that same installed template. Do not override successful lint with a separate body-format check. You may remove retained authoring markup, but otherwise keep `finish.md` append-only: never alter or reorder a recorded attempt or outcome, and never write root `progress.md`. Finish-work owns no root progress row or section.

Every pair uses `## Attempt N — <YYYY-MM-DD>` and `## Outcome N — <YYYY-MM-DD>`. For a fully paired history, choose the next integer after the highest numbered Attempt or Outcome. Numbers must increase strictly, each number must appear once for each kind, and Outcome N must record the observation for Attempt N. Lint decides whether the existing section format is valid; check actual attempt/outcome evidence before acting or resuming.

Populate the template-defined attempt with durable gate evidence, planned specification targets, approved input identities, selected strategy, intended workspace result, and route intent. Populate Admission identity with the exact verified HEAD, original target ref/commit, review Base/Head and artifact-only review commit, original explicit material-waiver reference or null, and unique approved input paths/blob IDs. Source identity records the canonical absolute Git common directory, original root, full source ref, and absolute Git worktree identity. Route identity is null or records the exact route/map/unit/source blob, previous in-progress state, owner/change/source/target/base, and resolved shipping condition.

For automated recovery, the committed route's Shipping rules must contain exactly one `- Qualification: merge`, `- Qualification: request-open`, or `- Qualification: no-op` line matching the recorded condition. Preserve and check any additional owner rules independently. Missing, ambiguous, or conflicting qualification requires owner adjudication; do not rewrite admitted route history to manufacture it.

Use canonical strategy tokens, not prose synonyms, in every new Strategy field. These identities provide recovery provenance, not authenticated owner approval. Append the matching outcome only after reading back the effect; record the completed or blocked result and verified external, workspace, route, and partial-state evidence. The installed template remains the exact creation and attempt shape; these lifecycle rules govern later outcomes without duplicating that shape.

Commit the attempt and outcome separately because the external result is unknown before the action. Commit the attempt on the change branch and verify that exact commit before the first finish effect. Commit the matching outcome on the branch or base that survives the strategy, then verify it there. If the strategy uses a remote branch, push the outcome and read it back.

## Resume and recovery

If `finish.md` exists, lint it before running preconditions for a new attempt. If physical history ends with Attempt N without matching Outcome N, reconcile it before any action or attempt allocation. Inspect, in order, the relevant Git commits and refs, remote branch, pull or merge request, route files, and workspace/worktree state. Do not trust an earlier agent response or command's exit status.

Compare observed state with the attempt's recorded strategy and intent:

- If the intended result already happened, append the matching completed Outcome N and persist it on the surviving branch or base.
- If the action failed or left a stable partial result, append the matching blocked Outcome N with that verified state and persist it where it survives.
- If evidence proves the action did not start or can safely continue, continue the same attempt from the first unverified step. First revalidate its attempt commit and the post-gate mutation boundary.
- If state is ambiguous or unsafe to modify, stop and report the dangling attempt without changing it.

Never allocate or execute a duplicate attempt before reconciliation, and never renumber the dangling attempt. After a blocked outcome that precedes any verified delivery, a later ordinary retry is a new attempt and must pass current preconditions again. Never reopen or rewrite a paired blocked outcome.

If a paired blocked outcome follows verified delivery, do not deliver again. Request finalization-repair admission on the surviving branch/base:

```bash
kepler workbench precondition --change-dir <change-dir> \
  --test-cmd '<full test suite && build/typecheck>' \
  --target-branch <recorded-original-target> --recover-finish <original-delivery-attempt>
```

Require `admission: finalization-repair`, current `verified-head`, exact `remaining-effects`, and `gate: repair-open`. If a failed repair already exists, also require `retry-evidence` and copy that JSON unchanged into the new Attempt's `Retry evidence` field. It binds the latest failed repair commit and entry HEAD to changed remaining paths or the original request's observed merge. Unchanged inputs or an external condition the reader cannot verify require owner adjudication. This authorization cannot enter the ordinary synchronization/delivery path.

The CLI rereads immutable original task/review evidence at admitted HEAD, recomputes historical Base against the original target commit rather than today's merged target, verifies the recorded review artifact-only revision and original narrow waiver, reobserves delivery, and binds current clean HEAD/tests/build/branch/worktree. A removed source branch is not an input to another merge. A changed current merge base does not invalidate the already-delivered historical review.

Create a new numbered `reconcile-delivery` Attempt linked by Recovery of to the original attempt and blocked-outcome commit, plus the previous failed-repair outcome commit or null. Copy the original Admission/Source/Route identities and delivery identity; record only the exact remaining effects. Preserve both original records.

Complete only the named canonical/route/map/history effects. Observe each for idempotent reuse, then persist its separately verified Outcome. Never repeat merge, request creation, or branch/worktree cleanup. A failed repair receives its own paired blocked Outcome. A later repair binds the same original delivery and latest failed repair, and requires changed conditions/evidence rather than an identical retry. New application/test/design/requirement changes need an ordinary change and review.

Any dirty surviving tree closes automated repair, even an exact owned route/map diff from failed lint or commit. Report the paths and ask the owner to authorize preservation/restoration or a scoped commit. Do not discard, stage, pre-commit, or normalize them to manufacture cleanliness. Rerun admission afterward.

Missing/forged historical provenance, rewritten merge content, changed intent, or ambiguous delivery requires owner adjudication. Keep legacy records immutable; do not add modern provenance. Legacy pairs may form a historical prefix, never a suffix after modern records. A physical latest pair without delivery provenance cannot authorize an ordinary retry. Commit Attempt and Outcome separately, in that order, as artifact-only commits.

## Post-gate mutation boundary

Use the gate's `verified-head` as gate-entry `HEAD`. Before each finish effect, compare every later commit and working-tree path with it, and recheck the admitted branch, base branch, worktree identity, and target repository. Recheck even if a branch change keeps the same commit SHA. The only allowed post-gate changes are canonical `.kepler/specs/` folding derived from approved artifacts, the exact route and map transition named by the attempt, and the numbered `finish.md` mutations for that same `Attempt N` and `Outcome N`.

A change requirement is not finish-owned. Any post-gate edit to `proposal.md`, `design.md`, or `requirements/` is an unrelated material edit, even if it appears to help synchronization.

Those finish-owned changes do not stale the same attempt, but they are not a general freshness exception and do not open a later attempt. Before the next effect, abort and return the change to whole-branch review if an unrelated material edit, unexpected path, amended reviewed commit, or unexplained dirty state appears. If an attempt commit already exists, persist a blocked matching outcome when the verified repository state makes that safe. The ancestry waiver does not excuse any post-gate mutation outside this allowlist.

## Route ownership and workspace retention

Before the first finish-owned write or route-backed attempt, run context and require one canonical route/unit binding, its exact committed route-source revision, and agreement with the owner/change/source/target/base in the proposal or plan. For an ordinary attempt, require the selected unit to remain owned by this change and in `in-progress`; A7 repair instead verifies its recorded original route/effect state and never replays the transition. Inspect known proposals/plans, local and visible remote branches, and worktrees for competing claims. Stop before writing finish intent if claims conflict or remain ambiguous.

A map-level status is an aggregate summary, not proof of unit ownership or shipment. Record the owner, change, full source and target refs, base/input revision, route/unit, and route-source revision in `Attempt N`. Record the route blob revision after the route/map transition in `Outcome N`.

The designated user/controller authorizes any withdrawal or transfer. Before changing a claim, inspect partial implementation, Git/provider effects, dependent work, and every visible owner. Record the authorized release/transfer in existing change intent, preserve branch/history and partial work, and revalidate dependencies.

Reset a unit to `pending` only when doing so erases no verified shipment or partial effect. Never reset `shipped`, infer rollback, or repeat delivery to release a claim. Before removing a branch/worktree, prove it is exclusively owned by this change, clean, and safely preserved, and confirm the selected strategy explicitly calls for removal. Retain and report shared, dirty, or ambiguously owned workspaces; isolation does not certify cleanup ownership.

## Process

1. **Inspect existing history.** Validate `finish.md`. If an attempt is dangling, follow **Resume and recovery** before entering a new-attempt path.
2. **Run preconditions.** For a new attempt, run the exact gate in **Preconditions**. On failure, report its output without writing anything.
3. **Capture gate entry.** Record the full admitted identities and establish the post-gate allowlist. Run the route-binding/ownership check described above before any canonical-spec synchronization or finish-history write.
4. **Validate synchronization read-only.** Check approved artifact consistency, exact input blobs, canonical targets, and spec impact without changing canonical files. Missing or inconsistent inputs require artifact revision and a fresh whole-branch review, with no Attempt or spec commit.
5. **Resolve compatible intent.** Detect the workspace with `kepler workbench isolate --check`, resolve the actual target branch and selected strategy, and identify exact route and map transitions. For a route-backed change, run context again and record its exact committed route-source revision and owner-bound route/unit/source/target/base identity in the Attempt. Stop if the revision changes or the binding conflicts or has a competing owner. Capture the unit's old state and exact Shipping rules condition. Require the strategy to satisfy that condition within this invocation, before any Attempt or effects. If the route requires a merge but the strategy opens a request, stop for a compatible strategy or authorized rule decision; do not create an awaiting-merge state, request, or spec write. No-op qualifies only when the route explicitly permits it. Ask if the strategy remains unspecified and the project has no default.
6. **Commit intent.** Append the template-defined `Attempt N` with complete durable intent. After mutating finish history and before committing, run `kepler workbench lint --file <change-dir>/finish.md`. A nonzero lint result fails the gate: correct the history and rerun lint, or report the exact blocker without committing or handing off. Commit that attempt alone on the change branch, verify that it contains the expected finish path, and confirm that the branch reaches it. This commit must exist before changing canonical specifications or taking any external finish action.
7. **Synchronize inside the Attempt.** Apply and lint approved canonical deltas, commit only exact derived spec paths, and read back the actual result. Record no change without an empty commit. If interrupted before or after this commit, resume the same unmatched Attempt at its first unverified step; recheck approved identities and the admitted allowlist before continuing.
8. **Check the boundary.** Before each effect, reinspect all post-gate commits and working-tree paths. Abort on any mutation this attempt does not own. A changed input identity aborts recovery.
9. **Execute then qualify the strategy.** Follow exactly one branch in **Strategy execution**. Read back the qualifying Git/provider effect before mutating a route. On the surviving branch, advance only the named unit from `in-progress` to `shipped`; lint every route/map mutation before continuing, then commit and read back the exact paths. Update the map only after verifying that every unit shipped. Reuse an exact prior advancement only while the original unit/map/condition/input identity and observed qualification still hold. Preserve siblings and partial writes; route/map updates are not atomic and do not imply rollback. If the change is not route-backed, record no route mutation.
10. **Read back actual state.** Query Git, the request provider when applicable, the worktree list, and route files. Collect actual identifiers and states; do not draft the outcome from intended values.
11. **Persist the outcome.** Append the matching `Outcome N` as `completed` only after verifying every intended effect; otherwise, record `blocked` with the verified partial state. After mutating the outcome and before committing, run `kepler workbench lint --file <change-dir>/finish.md`. A nonzero lint result fails the gate: correct the history and rerun lint, or report the exact blocker without committing or claiming completion. Commit the outcome on the surviving branch or base. If a remote branch participates, push the commit and read it back.
12. **Report.** Re-read the persisted pair and disclose only verified external, workspace, route, branch, request, and history state.

## Strategy execution

- **local-merge:** From the main checkout, merge the change branch (including the verified attempt commit and admitted synchronization) into the resolved base branch according to the project's workflow. Never remove a worktree from inside itself. Remove the linked worktree and delete the change branch only when the project workflow calls for it and the Route ownership and workspace retention checks prove exclusive ownership, clean state, and preserved work. Then read back the base ref and workspace list: verify that the base contains the attempt, the merge result is present, and the worktree is absent if removal was authorized and intended. Only after the qualifying merge, apply, lint, and commit the named route/map advancement on base, then read it back. Append the matching `Outcome N` on the base branch, commit it there, and verify that commit and pair on base. If the workflow pushes the base, push the outcome commit and verify the remote base ref too.
- **pull-request:** Push the change branch containing the attempt and synchronization, verify the remote ref, then open the pull request or merge request using approved artifacts. Read back its canonical URL, provider/repository, open state, head commit, source, and base. Request-open qualifies only when Shipping rules permit it. Then apply, lint, and commit route/map on the change branch; push and verify those changes. Leave the branch and worktree in place. A historical already-open request that requires merge remains unshipped and blocked until an actual merged readback qualifies; linked repair may use that merged state and immutable content provenance without requiring the request to remain open or creating a duplicate. Rewritten or ambiguous content requires owner adjudication. Append the matching `Outcome N`, commit it on the change branch, push it, and verify that the request head and remote branch include the outcome commit. A locally committed outcome that did not reach the remote request is blocked, not completed.
- **no-op:** Perform no merge, push, request creation, branch deletion, or worktree removal. Verify that the intended branch and worktree remain. Only an explicit no-op Shipping rule may qualify route intent; then apply, lint, and commit its named advancement and read it back. No-op never implies external delivery. Append the matching `Outcome N` on the unchanged change branch and commit it there. Before reporting completion, re-read the branch, worktree, route, and paired history.

## Partial failure

When a command fails after the finish action begins, stop issuing forward actions and inspect the actual partial state. Determine which commits, refs, remote objects, route transitions, and workspaces exist. Never infer rollback or success.

When safe, append the matching Outcome N as `blocked`, name every verified and missing effect, and commit it on the surviving branch or base. If a remote branch exists, push the blocked outcome and read it back from the remote when possible. If persistence or push fails, report that exact fact and leave the attempt for recovery. Never report the attempt as completed or allocate a replacement attempt during the same recovery.

## Boundaries

- Never edit application code or delete, weaken, or rewrite tests to open the gate.
- Never write finish state into root `progress.md`, task progress, task feedback, or root review.
- Never create an attempt before the gates and read-only validation, or commit specs before intent.
- Never mutate a route before observed compatible shipping qualification.
- Never use repair-open to allocate an ordinary delivery attempt or replay a delivered effect.
- Never begin a route or strategy effect before the attempt commit is verified.
- Never overwrite, reorder, pair loosely, or backfill finish history from memory.
- Never remove a worktree from inside it.
- Never fabricate a merge, request, route transition, workspace removal, pushed commit, or persisted outcome.
- Ask first when no finish strategy is supplied and project standards provide no default.

## Output

Before an action begins, output either the verbatim gate blocker with no writes or a request for the missing strategy. After an attempt begins, report its number, verified external result, actual route and workspace state, surviving branch or base, and the commit containing the persisted Outcome N. For a pull-request strategy, include the verified request URL and remote head.

Never claim a merge, pull request, no-op, route transition, workspace removal, or outcome until you have read back that specific result. If outcome persistence fails, report that the attempt remains dangling; do not describe an unpersisted result as history.

Outcomes with modern provenance record Result, Specification synchronization result (exact paths and commit, or verified no change), Delivery identity (observed Git result, canonical request, or no-op), and Remaining effects (exact typed paths or an empty array). Repairs retain the original identity and report new provider qualification/readback separately. Persist and push the route and Outcome before claiming completion. A pending or failed qualifying effect leaves the unit unshipped.

## Process flow

```dot
digraph kepler_finish_work {
    "Read finish history" -> "Dangling Attempt N?";
    "Dangling Attempt N?" [shape=diamond];
    "Dangling Attempt N?" -> "Reconcile actual state\nwithout a duplicate attempt" [label="yes"];
    "Dangling Attempt N?" -> "Paired blocked delivery?" [label="no"];
    "Paired blocked delivery?" [shape=diamond];
    "Paired blocked delivery?" -> "Historical finalization-repair admission" [label="yes"];
    "Paired blocked delivery?" -> "Lint artifacts + run finish gates" [label="no"];
    "Lint artifacts + run finish gates" -> "Gate open?";
    "Gate open?" [shape=diamond];
    "Gate open?" -> "Report verbatim blocker\n(no writes)" [label="no"];
    "Gate open?" -> "Capture gate-entry HEAD" [label="yes"];
    "Capture gate-entry HEAD" -> "Validate inputs and compatible strategy read-only";
    "Validate inputs and compatible strategy read-only" -> "Intent valid?";
    "Intent valid?" [shape=diamond];
    "Intent valid?" -> "Report verbatim blocker\n(no writes)" [label="no"];
    "Intent valid?" -> "Append and commit Attempt N" [label="yes"];
    "Append and commit Attempt N" -> "Synchronize specs + commit inside Attempt";
    "Synchronize specs + commit inside Attempt" -> "Post-gate boundary clean?";
    "Post-gate boundary clean?" [shape=diamond];
    "Post-gate boundary clean?" -> "Return to whole-branch review" [label="no"];
    "Post-gate boundary clean?" -> "Finish action" [label="yes"];
    "Finish action" -> "Observed shipping qualification?";
    "Observed shipping qualification?" [shape=diamond];
    "Observed shipping qualification?" -> "Keep route unshipped and record blocked state" [label="no"];
    "Observed shipping qualification?" -> "Apply route intent + verify on surviving branch" [label="yes"];
    "Apply route intent + verify on surviving branch" -> "Read back external, workspace,\nand route state";
    "Historical finalization-repair admission" -> "Gate repair-open?";
    "Gate repair-open?" [shape=diamond];
    "Gate repair-open?" -> "Report verbatim blocker\n(no writes)" [label="no"];
    "Gate repair-open?" -> "Commit linked reconcile-delivery Attempt" [label="yes"];
    "Commit linked reconcile-delivery Attempt" -> "Observe and complete exact remaining effects\nwithout redelivery or cleanup";
    "Observe and complete exact remaining effects\nwithout redelivery or cleanup" -> "Read back external, workspace,\nand route state";
    "Reconcile actual state\nwithout a duplicate attempt" -> "Observe first unverified step of same Attempt";
    "Observe first unverified step of same Attempt" -> "Read back external, workspace,\nand route state";
    "Keep route unshipped and record blocked state" -> "Append and persist Outcome N";
    "Read back external, workspace,\nand route state" -> "Append and persist Outcome N";
    "Append and persist Outcome N" [shape=doublecircle];
}
```
