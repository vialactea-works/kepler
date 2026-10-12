# Plan: Teach propose to read a route

## Overview

- Change: `.hamilton/changes/2026-08-09-propose-reads-route/`
- Goal: Add map-aware entrypoint logic to `hamilton-propose` — when pointed at a `.hamilton/maps/<effort>/` folder, read `route.md` from the working tree, find the next `pending` unit, navigate that unit's backing decision links, then proceed into propose's normal workflow unchanged. The addition lands at the entrypoint only (steps 1 and 3); steps 4–10 are untouched.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: One `SKILL.md` file is edited; no code, no CLI, no templates, no tests. `skills/` is not bundled, `hamilton setup` never installs it, and no test asserts on skill content (per [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md), matching the unit-7 precedent). Verification is by reading the edited steps end-to-end — the craft focus is whether the map-aware branch merges cleanly into the existing flow at step 4 and whether the "steps 4–10 unchanged" guarantee stays visible in the text. The route format this reads is fixed by the template at `bundle/templates/wayfinder/route.md`: each unit is a `### N. <name>` heading followed by a `Status: pending|in-progress|shipped` line and a `Backed by:` line of `[title](tickets/NN-slug.md)` links. See [design.md](design.md) for the five decisions (detection+title in step 1 / context in step 3; map-aware mode as a conditional branch; route read from the working tree per [ticket 13](../../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md); status scanned from the `Status:` line; no-pending-unit stops with a message) and [requirements/propose.md](requirements/propose.md) for the five SHALL statements and WHEN/THEN scenarios each task satisfies.
- Quality notes: Task seams follow the design's step boundary — step 1 (detection + title derivation) is sequential before step 3 (decision-link navigation) because both edit the same file; a final coherence read + gates task confirms the map-aware branch merges at step 4 and that steps 4–10 stay byte-identical. Each task lands one cohesive step edit with its own edge case (no-pending-unit with step 1; no-backing-tickets with step 3). No structural smells accepted.

## Tasks

### Task 1: Add map-folder detection and title derivation to step 1

- Depends on: none
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`
  - Deleted: none
- Acceptance:
  - Step 1 detects when the request points at a `.hamilton/maps/<effort>/` folder containing a `route.md` and enters map-aware mode (req: propose #1, scenario: Request points at a map folder)
  - When the request does not point at a map folder (or the folder has no `route.md`), step 1 proceeds with its existing free-form title derivation unchanged (req: propose #1, scenario: Request does not point at a map folder)
  - In map-aware mode, `route.md` is read from the working tree — the branch the session started on — with no `git show` / `git checkout` / branch-switch to reach the default branch's copy (req: propose #2, scenario: Reading route.md)
  - The first `### N.` unit whose `Status:` line reads `pending` is selected, and the kebab-case change title is derived from that unit's name (the heading text after `### N.`) (req: propose #3, scenario: A pending unit exists)
  - When no unit is `pending`, the skill stops and tells the user that every unit is already in-progress or shipped — it does not fall through to free-form mode (req: propose #3, scenario: No pending unit exists)
  - The worktree-creation and isolation-verification logic that follows the title derivation in step 1 is unchanged
- Steps:
  1. Read `skills/hamilton-propose/SKILL.md` step 1 (the `1. **Derive the title, ensure an isolated workspace — then confirm you are inside it.**` paragraph). Its first sentence is `Derive a kebab-case title from the request.` followed by `Then detect isolation: if you are already in a linked worktree`. Replace only that first sentence with the map-aware conditional branch plus the free-form fallback, so step 1 opens:

     ```
     1. **Derive the title, ensure an isolated workspace — then confirm you are inside it.** If
        the request points at a `.hamilton/maps/<effort>/` folder that contains a `route.md`,
        enter map-aware mode: read `route.md` from the working tree — the branch the session
        started on — and do not reach for the default branch's copy via `git show`, `git
        checkout`, or any equivalent (the worktree this step creates is based off the current
        branch, so the working tree's copy is the session's copy). Scan the `### N.` units in
        order and find the first whose `Status:` line reads `pending`; derive the kebab-case
        change title from that unit's name (the heading text after `### N.`). If no unit is
        `pending`, stop and tell the user that every unit is already in-progress or shipped —
        do not fall through to free-form mode. Otherwise derive a kebab-case title from the
        request. Then detect isolation: if you are already in a linked worktree
     ```

     The rest of step 1 (the `if you are already in a linked worktree` isolation logic, the `git worktree add` block, and the `Do not proceed to step 2 until it does.` verification) stays exactly as it is — the splice rejoins the existing text at `Then detect isolation:`.
  2. Read step 1 in full context. Confirm: the map-aware branch is a conditional that merges back into the existing isolation logic at `Then detect isolation:`; the free-form path (`Otherwise derive a kebab-case title from the request`) preserves the original behaviour verbatim; the SHALL NOT on reaching for the default branch's copy is stated; the no-pending-unit stop is stated; the title derives from the unit's name, not a paraphrase of the request.
- Verify: read `skills/hamilton-propose/SKILL.md` step 1 → map-aware conditional present with route read from working tree, next-pending-unit scan, title-from-slug, and no-pending-unit stop; free-form path and all isolation logic unchanged.
- Commit: `MAESTRO: add map-folder detection and title derivation to propose step 1`

### Task 2: Extend step 3 to navigate the selected unit's decision links

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`
  - Deleted: none
- Acceptance:
  - When step 1 entered map-aware mode, step 3 navigates the selected unit's `Backed by:` decision links — the `tickets/NN-slug.md` files listed in its route entry — reading each to pull full decision context, and feeds that into the existing context exploration alongside specs, docs, and recent commits (req: propose #4, scenario: Unit has backing tickets)
  - When the selected unit has no `Backed by:` line (or it is empty), step 3 proceeds with the route entry's goal paragraph alone (req: propose #4, scenario: Unit has no backing tickets)
  - When step 1 did not enter map-aware mode, step 3 works exactly as it does today (req: propose #1, scenario: Request does not point at a map folder — the free-form path is untouched here too)
- Steps:
  1. Read `skills/hamilton-propose/SKILL.md` step 3 (the `3. **Explore context (read-only).**` paragraph). It currently reads, in full: `Project structure, docs, recent commits, and the canonical specs (`.hamilton/specs/`). Read the specs before drafting: they hold the conventions and prior decisions the change inherits, so a MODIFIED capability builds on the behavior its canonical spec already documents (human-readable prose — Overview / Contract / Behavior / Invariants / Decisions) rather than contradicting it. If the request spans several independent subsystems, stop and help decompose it first — one change per spec.` Insert the map-aware navigation sentence between the `... rather than contradicting it.` sentence and the `If the request spans several independent subsystems,` sentence, so step 3 reads:

     ```
     3. **Explore context (read-only).** Project structure, docs, recent commits, and the canonical
        specs (`.hamilton/specs/`). Read the specs before drafting: they hold the conventions and
        prior decisions the change inherits, so a MODIFIED capability builds on the behavior its
        canonical spec already documents (human-readable prose — Overview / Contract / Behavior /
        Invariants / Decisions) rather than contradicting it. When step 1 entered map-aware mode,
        also navigate the selected unit's backing decision links — the tickets listed in its
        `Backed by:` line — reading each linked `tickets/NN-slug.md` to pull the full decision
        context, and feed that into this exploration alongside the specs, docs, and recent commits.
        If the unit has no `Backed by:` line, proceed with its route entry's goal paragraph alone.
        If the request spans several independent subsystems, stop and help decompose it first —
        one change per spec.
     ```

  2. Read step 3 in full context. Confirm: the map-aware sentence is additive and conditional on step 1's mode (it does not run in free-form mode); the no-backing-tickets edge is handled; the existing specs/docs/commits exploration and the decompose-if-multi-subsystem guard are unchanged.
- Verify: read `skills/hamilton-propose/SKILL.md` step 3 → decision-link navigation present and gated on step 1's map-aware mode; no-backing-tickets edge handled; free-form exploration path unchanged.
- Commit: `MAESTRO: extend propose step 3 to navigate the selected unit's decision links`

### Task 3: End-to-end coherence read and repo gates

- Depends on: Task 2
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md` (only if a non-sequitur or stray edit is found and fixed)
  - Deleted: none
- Acceptance:
  - `skills/hamilton-propose/SKILL.md` reads cleanly start to finish: the map-aware branch in step 1 flows into step 2 (set up the change dir) without a non-sequitur, step 3's map-aware sentence flows into step 4 (ask clarifying questions), and the transition from map-aware entrypoint to the existing workflow is visible in the text (req: propose #5, scenario: Map-aware mode reaches step 4)
  - Steps 4 through 10 are byte-identical to their pre-change state — no edit crept past the entrypoint (req: propose #5 — the entrypoint-only guarantee is the scope boundary)
  - The Principles section, Inputs, References, Process flow diagram, Output, and Handoff sections are unchanged (the change adds behaviour at the entrypoint only; nothing downstream is reworded)
  - `bun run build` succeeds
  - `bun --bun vitest run` — all tests pass
- Steps:
  1. Read `skills/hamilton-propose/SKILL.md` in full, start to finish — not just steps 1 and 3. Look for: a step whose flow breaks because the map-aware branch introduces a dangling reference; a sentence in steps 4–10 or the Handoff that contradicts the new entrypoint; any wording that implies map-aware mode changes behaviour after step 3.
  2. Confirm steps 4 through 10 are unchanged from their pre-change text — diff them against the version at the base of this branch if any doubt arises. The entrypoint-only guarantee is the scope boundary; an edit past step 3 is a defect, not an improvement.
  3. If a non-sequitur or stray edit is found, fix it in place — delete the sentence or restore the original wording. Do not word-trim (per `writing-great-skills`: when a sentence fails, delete the whole sentence).
  4. Run `bun run build` — expect it to succeed (TypeScript typecheck, unaffected by skill edits).
  5. Run `bun --bun vitest run` — expect all tests to pass (test suite, unaffected by skill edits).
- Verify: `bun run build && bun --bun vitest run` → build succeeds, all tests pass; full-skill read shows no non-sequitur and steps 4–10 untouched.
- Commit: `MAESTRO: coherence check on propose skill, gates green`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run build` passes; `bun --bun vitest run` passes
- All review feedback has been addressed
