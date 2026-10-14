# Progress: Remove Wayfinder's one-ticket-per-session gate

## Task 1: Rewrite the Wayfinder work loop around explicit authorization — 2026-08-29

- Outcome: done
- Changed:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`
  - Deleted: none
- Verified:
  - Pre-edit: task Verify command → failed as expected (missing all new-authorization phrases; forbidden implicit-selection/one-ticket-per-session text present)
  - `python3 -c '...wayfinder contract ok...'` (task Verify) → `wayfinder contract ok`
  - `git diff --check` → exit 0
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts` mtime-ordering test) is pre-existing on this branch, reproduced identically with the SKILL.md change stashed out, unrelated to this task
  - `bun run build` → passes clean
- Notes:
  - Rewrote frontmatter `description`, Opening, and the "Work through the map" introduction to make explicit user authorization — not session count or generic invocation — the ticket-start boundary.
  - Replaced the numbered work loop with an 11-step sequence: load/orient + absorb prior research (explicitly a continuation, not new authorization) → stop if no explicit request → resolve named identifiers / next-frontier request (unknown identifier reported+excluded; empty frontier reported) → form the fixed authorization set ordered by ticket file order → reread each member immediately before its turn → claim if eligible or report+skip without substitution (states the `[01, 02]` dependent-batch example verbatim) → resolve → record answer → consistency pass → graduate/close → advance only within the fixed set or stop when exhausted (route closing folded in here, unchanged trigger: "every ticket on the map resolved").
  - Removed the one-ticket-per-session paragraph and its research exception entirely; its "never park a claimed ticket" obligation was preserved by folding it into the new step 11.
  - Redrew the process-flow digraph end-to-end for the working half, using the required decision-node labels `Ticket work explicitly requested?` and `Authorized member remains?`, with an explicit no-request stop and no-frontier-available stop, a per-member eligibility/skip branch, a loop confined to the fixed authorization set, and the unchanged route-closing path (`Every ticket on the map resolved?` → write route) — no edge leads back to an unrestricted frontier once the set is exhausted (the exhausted-set stop node has no outgoing edge).
  - Chart the map, Ticket types, Skill dispatch (including its "work loop step 1" cross-reference, still valid), Map mechanics (frontmatter/frontier/claiming/branching fields already matched the claimed-removes-from-frontier truth and needed no change), The route, and map lifecycle prose were left intact, matching the plan's non-goals.
  - Deviation: acceptance criterion 6 asks that "Examples, Invariants, and Decisions" sections encode the new rules, but `skills/hamilton-wayfinder/SKILL.md` has never had headed `## Examples` / `## Invariants` / `## Decisions` sections (only the canonical `.hamilton/specs/wayfinder.md` does, and that file is out of this task's scope — finish-work distills it later). No other step in the task instructs creating such headings, and the Verify command does not require them. I satisfied the intent by embedding the same illustrative example (`[01, 02]` batch), invariant-style statements ("never park a claimed ticket," "the set never grows or shrinks," "does not authorize any other ticket"), and durable-rule wording directly into the rewritten numbered work loop and process-flow diagram, rather than inventing new top-level sections foreign to this skill's established shape. Flagging for reviewer attention.

## Review: Task 1 — 2026-08-29
- Verdict: approved (blocking: 0, suggestions: 3) — see review.md

## Task 2: Align decision-ticket sizing at its source — 2026-08-29

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/specs/glossary.md`, `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md`
  - Deleted: none
- Verified:
  - Pre-edit: task Verify command → failed as expected (`AssertionError`; no `## Outdated decisions` section existed yet in ticket 01)
  - `python3 -c '...decision-ticket vocabulary ok...'` (task Verify) → `decision-ticket vocabulary ok`
  - `git diff --check` → exit 0
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts` mtime-ordering test) reproduces identically with these two changes stashed out, confirming it is pre-existing and unrelated to this task
  - `bun run build` → passes clean
- Notes:
  - In ticket 01's `### Ticket files` subsection, replaced the one-file/one-session sentence with the current rule from `design.md`: one file is one ticket-sized working target, and a session opens each ticket it explicitly claims and may work several authorized targets in ticket file order. All other rationale (numbering, slugs, `grep`-based frontier, the rejected `tickets.md`/`open`+`resolved` alternatives) is unchanged.
  - Appended one `## Outdated decisions` section to ticket 01 with a named subsection quoting the exact superseded sentence ("One file is one agent session's working target, so a session opens exactly what it claims.") and linking `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` as the superseding contract, explicitly noting that file-per-ticket layout, numbering, identity, and reading order remain current.
  - Updated only the glossary's **decision ticket** paragraph to the same current definition, preserving its existing source link to ticket 01 and every other glossary entry untouched.
  - Kept both edited passages on this file's established hard-wrapped-paragraph style (confirmed against the precedent commit `42339a1` for `## Outdated decisions` sections in map/ticket files), rather than the unwrapped flowing-prose style used in `skills/hamilton-wayfinder/SKILL.md` and this change's own `requirements/`/`design.md` — the quoted superseded sentence itself is kept on one unbroken line so the Verify script's literal substring match holds regardless of wrap.

## Review: Task 2 — 2026-08-29
- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Task 3: Correct the claim/frontier source decision — 2026-08-29

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md`
  - Deleted: none
- Verified:
  - Pre-edit: task Verify command → failed as expected (`AssertionError`; no `## Outdated decisions` section existed yet and the old frontier assertions were still in the current Answer)
  - `python3 -c '...claim/frontier decision ok...'` (task Verify) → `claim/frontier decision ok`
  - `git diff --check` → exit 0
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts` mtime-ordering test) reproduces identically with this change stashed out, confirming it is pre-existing and unrelated to this task
  - `bun run build` → passes clean
- Notes:
  - Corrected the `## Answer` summary, `### Claiming stays`, `### Status values`, and the matching Consequences bullet to the current truth: setting `status: claimed` removes a ticket from the frontier while leaving it unresolved, and claiming remains a non-enforcing active-work signal that does not prevent git collisions. `### Status values` now lists `open`, `claimed`, `resolved` for tickets (previously omitted `claimed`); the maps status discussion (`open`/`cleared`) is untouched.
  - Appended one `## Outdated decisions` section with a named subsection ("Claiming and frontier calculation") that preserves both superseded sentences verbatim — "But claiming does not change the frontier calculation: a claimed ticket is still open, not unblocked or resolved." and "Claiming is kept but does not affect frontier calculation" — and links `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` as the superseding contract, noting claim signaling and git-collision behavior remain current.
  - Left the embedded `## Map mechanics` contract block (the `status:` — `open`, `resolved`. Maps only: `cleared` line inside the fenced example) untouched, per the design's "mechanics-section boundary... remain unchanged" acceptance criterion and the task's explicit scope boundary (no frontmatter-mechanics edits); the task's own Verify script only checks the `### Status values` subsection, not this fenced block.
  - Diff is confined to the single target file; `CONTRIBUTING.md`, frontmatter syntax, `blocked_by` meaning, and every other consequence bullet are unchanged.
  - Pre-task housekeeping: found `progress.md`'s Task 2 review entry and `review.md` already present but uncommitted in the worktree (left over from a prior `hamilton-review` pass on Task 2, commit `c35aec6`). Committed them separately first (`9976f50`, `chore(wayfinder-change): record Task 2 review verdict`) before starting Task 3's own edit, so this task's commit stays confined to Task 3's own work.

## Review: Task 3 — 2026-08-29
- Verdict: approved (blocking: 0, suggestions: 1) — see review.md

## Task 4: Update the Wayfinder skills-reference summary — 2026-08-29

- Outcome: done
- Changed:
  - Created: none
  - Modified: `docs/skills.md`
  - Deleted: none
- Verified:
  - Pre-edit: task Verify command → failed as expected (`AssertionError`; entry still said "works them one at a time" and lacked "explicitly requests"/"named batch")
  - `python3 -c '...skills summary ok...'` (task Verify) → `skills summary ok`
  - `git diff --check` → exit 0
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts` mtime-ordering test) reproduces identically with this change stashed out, confirming it is pre-existing and unrelated to this task
  - `bun run build` (`tsc -p tsconfig.json`) → passes clean
- Notes:
  - Replaced only the ticket-work sentence in the `### hamilton-wayfinder` introductory paragraph: "then works them one at a time until the way to the destination is clear" became "then works only the decision tickets the user explicitly requests — one ticket or a named batch — until the way to the destination is clear," matching Task 1's new explicit-authorization contract in `skills/hamilton-wayfinder/SKILL.md`.
  - Preserved the following "The map plans the way; the doing comes later, one change at a time" sentence and every other field (When, Inputs, Produces, Notes, provenance, Source) unchanged; diff confined to `docs/skills.md`, no other file touched.

## Review: Task 4 — 2026-08-29
- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Review: whole change — 2026-08-29
- Verdict: changes-requested (blocking: 1, suggestions: 4) — see review.md

## Whole-branch review fix — 2026-08-29

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/specs/glossary.md`
  - Deleted: none
- Verified:
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts` mtime-ordering test) reproduces identically and is pre-existing, unrelated to this fix
  - `bun run build` (`tsc -p tsconfig.json`) → passes clean
  - `git diff --check` → exit 0
  - Searched `.hamilton/specs/glossary.md` for lingering "does not" / "changes nothing" / "still open, not resolved" phrasing near **claim**: the only remaining "does not" hits are the unrelated **route** entry ("the route points and does not restate") and the **claim** entry's own, intentionally-preserved "the status does not prevent a collision" sentence — no contradictory phrasing remains
- Notes:
  - Addresses the whole-branch review's one blocking finding (see `review.md`, "whole change — 2026-08-29"): the canonical glossary's **claim** entry still asserted "It changes nothing else about the ticket — a claimed ticket is still open, not resolved," restating the claim-does-not-affect-frontier position this change retires. That sentence contradicted design.md's "Claimed means unresolved but outside the frontier" decision, requirements/wayfinder.md's "Claimed tickets leave the frontier without resolving" requirement, the glossary's own **frontier** entry ("open, unblocked, unclaimed"), `skills/hamilton-wayfinder/SKILL.md`, and ticket 04's already-corrected "### Claiming stays" section — and it violated `SKILL.md`'s vocabulary rule reserving "open" for the status value and "unresolved" for any ticket not yet resolved.
  - Replaced the entry's last sentence with: "Claiming removes the ticket from the frontier, so another request cannot select or start it, while the ticket itself stays unresolved until its `## Answer` is recorded." — matching ticket 04's corrected wording and the **frontier** entry. Left the entry's collision/intent sentences ("the status does not prevent a collision, but it tells a reader the ticket is already in hand") and every other glossary entry untouched, per the fix's explicit scope boundary.
  - This closes a plan gap surfaced only by the final whole-branch review: none of Tasks 1-4 scoped this glossary entry for editing (Task 2 scoped only the **decision ticket** paragraph), so this addendum is not a re-litigation of any task's own acceptance criteria.

## Review: whole change — 2026-08-29
- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Finish — 2026-08-30
- Preconditions: tree clean, tasks 4/4 implemented, reviews approved (whole change fresh at `1b67d61`). Tests: 97/98 passing — the one failure (`tests/scripts/change-context.test.ts` > "lists every change, most recently touched first", an mtime-ordering assertion) reproduces identically on a fresh clone of `main` with no branch changes applied, confirming it is pre-existing and unrelated; user confirmed proceeding on this evidence. Build (`bun run build`) passes clean.
- Specs synced: `.hamilton/specs/wayfinder.md` — Overview, Map mechanics, Working behavior, Examples, Invariants, and Decisions distilled from `requirements/wayfinder.md` (commit `5fe08dc`).
- Version: bumped `package.json`/`src/index.ts` 0.8.0 → 0.8.1 (patch: docs/skill-contract-only change, no CLI-observable behavior change) (commit `188fb9b`).
- Finished: pull request (opened after this entry's commit)
- Workspace: worktree left at `/home/caio/workspace/personal/hamilton/.worktrees/remove-wayfinder-ticket-gate` (branch `remove-wayfinder-ticket-gate`)
- Route: not route-backed

## PR review fix — 2026-08-30

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/specs/glossary.md`
  - Reverted (to their pre-change, `main` content): `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md`, `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md`
  - Deleted: none
- Notes:
  - Two live reviewer comments on PR #40 (caiorcferreira, at `f0e243e`) objected to Task 2's and
    Task 3's edits to tickets 01 and 04: "This file should not have been changed. Previous maps are
    kept for historic record, so new decisions should not change what was decided back there." Per
    that convention — the same one `## Outdated decisions` sections were meant to respect but, by
    editing the ticket's current `## Answer` at all, did not — both tickets are reverted to their
    exact pre-change content, including removing the `## Outdated decisions` sections Task 2 and
    Task 3 added. This retracts those two tasks' ticket-file edits; their glossary-facing outcome
    (below) and Task 1's skill behavior are unaffected.
  - `.hamilton/specs/glossary.md`'s **decision ticket** and **claim** entries keep the current,
    corrected definitions (ticket-sized working target with explicit-claim, batch authorization;
    claiming removes a ticket from the frontier) — this is canonical, maintained reference content,
    not a historic ticket. Since tickets 01 and 04 no longer state these definitions themselves,
    each entry's citation now attributes the layout/mechanics rationale to the ticket as before and
    the corrected current rule to [`wayfinder`](../specs/wayfinder.md#decisions) instead of implying
    the ticket's own prose says it.
  - No behavior change: explicit authorization as the start gate, fixed-batch claim-time eligibility,
    no automatic advancement, and claimed tickets sitting outside the frontier remain exactly as
    Task 1 implemented and `.hamilton/specs/wayfinder.md` already documents. The version bump
    (`188fb9b`) stands.
  - `plan.md`'s Task 2 and Task 3 file lists, acceptance criteria, and Verify scripts — and the
    "Done when" bullet naming tickets 01/04 in the confined diff — describe the state before this
    fix and are superseded by this entry; see `plan.md`'s closing amendment.
- Verified:
  - `bun --bun vitest run` → 97/98 passing; the one failure (`tests/scripts/change-context.test.ts`
    mtime-ordering assertion) reproduces identically and is pre-existing, unrelated to this fix
  - `bun run build` → passes clean
  - `git diff --check` → exit 0
  - `git diff main...HEAD` → neither `01-map-artifact-layout.md` nor `04-map-mechanics-in-files.md`
    appears in the diff
