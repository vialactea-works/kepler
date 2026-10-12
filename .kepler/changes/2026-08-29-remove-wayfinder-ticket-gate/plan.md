# Plan: Remove Wayfinder's one-ticket-per-session gate

## Overview

- Change: `.hamilton/changes/2026-08-29-remove-wayfinder-ticket-gate/`
- Goal: Replace Wayfinder's implicit first-ticket selection and one-ticket-per-session ceiling with a fixed, explicitly requested authorization set whose members are evaluated safely at claim time, then align the canonical vocabulary, source decisions, and user-facing summary with that behavior.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: This is a contract-only Markdown change; no automated test asserts on skill, spec, glossary, docs, or map-ticket content, so each task uses a structural red→green check plus end-to-end reading. Follow `design.md` and `requirements/wayfinder.md`; `critique.md` records the earlier findings that the approved upstream artifacts now resolve. `skills/hamilton-wayfinder/SKILL.md` is the operational authority. Tasks MUST NOT edit `.hamilton/specs/wayfinder.md`: `hamilton-finish-work` distills `requirements/wayfinder.md` into that canonical spec after implementation and review. The direct `.hamilton/specs/glossary.md` edit is intentional reference maintenance with no `requirements/glossary.md`, matching the repository's established glossary precedent. Do not touch templates, `CONTRIBUTING.md`, TypeScript, dependencies, frontmatter values, ticket types, `blocked_by` meaning, collision handling, map lifecycle, route semantics, or task-ledger data. Preserve unrelated one-question-at-a-time, one-change-at-a-time, and ticket-sizing language. All new artifact prose flows unwrapped.
- Quality notes: Four tasks follow the design's responsibility boundaries: Task 1 changes the authoritative procedure; Task 2 changes the decision-ticket definition and its ticket-01 source together as one vocabulary truth; Task 3 corrects the independent claim/frontier source decision; Task 4 updates only the user-facing summary. Tasks 2–4 depend on Task 1's operational truth but touch disjoint files. Canonical Wayfinder-spec synchronization remains one finish-work responsibility instead of being duplicated in an implementation task. No structural smell or deliberate exception is accepted.

## Tasks

### Task 1: Rewrite the Wayfinder work loop around explicit authorization

- Depends on: none
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`
  - Deleted: none
- Acceptance:
  - The frontmatter description, Opening, and Work through the map introduction describe user-directed ticket work without saying Wayfinder works tickets one at a time or that invoking/loading a map starts the first frontier ticket. — Requirement: *Ticket starts require explicit user authorization*, scenario “Map invocation without a ticket request.”
  - Loading the map preserves the existing orientation, Operation rules, branch, and returned-research behavior. Absorbing findings for a previously dispatched research ticket is explicitly continuation of prior authorization and does not authorize another ticket. — Requirement: *Authorized work may resolve multiple tickets without automatic advancement*, scenario “Returned research belongs to prior authorization.”
  - The work loop recognizes exactly three authorization shapes: one existing named ticket, an explicit request for the current next frontier ticket, or an explicitly named batch. With no ticket-work request it reports orientation/frontier and stops; an unknown identifier is reported and excluded without substitution; a next-frontier request against an empty frontier reports that no frontier ticket is available and changes no status. — Requirement scenarios “Map invocation without a ticket request,” “Explicitly named identifier is unknown,” and “No next frontier ticket exists.”
  - A named batch becomes a fixed authorization set ordered by ticket file order. Every member is reevaluated immediately before its turn; an open, unblocked, unclaimed member is claimed, while a resolved, claimed, or still-blocked member is reported and skipped without substitution. A member blocked when requested remains authorized and can start later in the same batch when an earlier authorized member resolves its last blocker. — Requirement scenarios “Dependent members in an explicit batch,” “Existing batch member remains ineligible at its turn,” and “Request order differs from file order.”
  - The claiming and resolving steps preserve imperative resolving-skill dispatch, same-session progress as far as the type allows, answer capture, status transition, map gist, consistency pass, and graduation/out-of-scope behavior. `claimed` removes a ticket from the frontier while leaving it unresolved. — Requirement: *Claimed tickets leave the frontier without resolving*, both scenarios.
  - After processing one eligible member, the loop advances only within the fixed authorization set. It may resolve several authorized tickets in the session, stops when the set is exhausted, and never starts a newly created/unblocked or otherwise unrequested ticket. The one-ticket-per-session budget, ceiling, and research exception are removed. — Requirement: *Authorized work may resolve multiple tickets without automatic advancement*, scenarios “Single-ticket authorization stops without auto-advance,” “Explicit batch resolves multiple tickets,” and “A resolution exposes an unrequested ticket.”
  - Examples, Invariants, and Decisions encode the explicit-request gate, fixed-set/claim-time rule, claimed-frontier truth, and no-auto-advance boundary. The process-flow diagram includes the no-request stop, identifier resolution/fixed-set formation, per-member eligibility/skip path, sequential authorized-member loop, route closing when every ticket is resolved, and no edge back to the unrestricted frontier after an authorization set finishes.
  - Existing charting, dispatch table, ticket types, map mechanics fields, collision behavior, route writing, and map lifecycle remain intact except where wording must refer to the new work-loop steps.
- Steps:
  1. Run the Verify command before editing and confirm it fails on the existing implicit-selection and one-ticket-per-session text.
  2. Read `requirements/wayfinder.md` from top to bottom, then update the skill frontmatter description, Opening, and Work through the map introduction so explicit user authorization—not a session count or generic invocation—is the ticket-start boundary.
  3. Rewrite the numbered work loop in this order: load/orient and absorb prior research; establish the fixed authorization set or stop; resolve named identifiers and handle an empty next-frontier request; order a named batch by ticket file order; reread each member at its turn; report/skip an ineligible member or claim an eligible one; resolve and record through the existing procedure; advance only within the fixed set; stop when the set is exhausted; write the route under the existing closing condition when every ticket is resolved. State verbatim that generic invocation “does not authorize” ticket work and that claim-time rereading allows `[01, 02]` to run `02` after authorized `01` clears its blocker.
  4. Remove the one-ticket-per-session paragraph and its research exception. Update the Examples, Invariants, and Decisions sections with the new durable rules while retaining all unrelated obligations.
  5. Redraw the process-flow digraph to match the prose exactly, including the orientation-only exit, fixed authorization set, claim-time eligibility/skip branch, loop over only authorized members, and unchanged route-closing path. Use the decision-node labels `Ticket work explicitly requested?` and `Authorized member remains?` so the structural check can prove both gates exist.
  6. Read the complete skill end to end and confirm every step number, cross-reference, and diagram edge still resolves, then run the Verify command and `git diff --check` and expect both to pass.
- Verify: `python3 -c 'from pathlib import Path; s=Path("skills/hamilton-wayfinder/SKILL.md").read_text(); required=("explicit user request", "fixed authorization set", "ticket file order", "immediately before", "no frontier ticket is available", "does not authorize", "removes the ticket from the frontier", "## Outdated decisions", "Ticket work explicitly requested?", "Authorized member remains?"); forbidden=("Resolve at most one ticket per session", "one-ticket-per-session budget", "Take the first ticket on the frontier", "works them one at a time", "Working is the loop that clears the map one ticket at a time."); missing=[x for x in required if x not in s]; stale=[x for x in forbidden if x in s]; assert not missing and not stale, (missing, stale); print("wayfinder contract ok")'` → prints `wayfinder contract ok`; `git diff --check` exits 0
- Commit: `feat(skills): require explicit authorization for wayfinder tickets`

### Task 2: Align decision-ticket sizing at its source

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `.hamilton/specs/glossary.md`, `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md`
  - Deleted: none
- Acceptance:
  - The glossary's **decision ticket** entry retains one file per numbered `tickets/NN-slug.md`, current-answer authority, stable identity, reading order, legible links, and map-gist behavior, but defines each file as one ticket-sized working target. It says a session opens each ticket it explicitly claims and may work several in file order when the user authorizes a batch; it no longer equates one file with one whole session.
  - Ticket 01's current `## Answer` keeps the settled directory, undated effort slug, file-per-ticket layout, numbering, stable identity, reading order, link-legibility, concurrency rationale, and all unrelated decisions. Its `### Ticket files` subsection uses the same current ticket-sized-target truth as the glossary.
  - Ticket 01 gains one `## Outdated decisions` section. That section preserves the exact old statement “One file is one agent session's working target, so a session opens exactly what it claims.” and marks it superseded by `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md`; the old statement appears nowhere in the current Answer.
  - The superseding relative link resolves, and no `requirements/glossary.md`, template, other glossary entry, or other map decision is created or modified.
- Steps:
  1. Run the Verify command before editing and confirm it fails because the current ticket-01 Answer and glossary still contain the one-file/one-session definition and ticket 01 has no outdated section.
  2. In ticket 01's `### Ticket files` subsection, replace only the session-count rationale with the current rule from `design.md`: one file is one ticket-sized working target; a session opens each ticket it explicitly claims and may work several authorized targets in ticket file order. Preserve every remaining rationale and rejection unchanged.
  3. Append `## Outdated decisions` to ticket 01. Add a short named subsection that quotes the exact superseded sentence and links `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` as the current contract, explicitly noting that file-per-ticket layout, numbering, identity, and reading order remain current.
  4. Update only the glossary's **decision ticket** paragraph to the same current definition, retaining its existing source link to ticket 01 and all unrelated glossary content.
  5. Read both current definitions together, confirm they use one term per concept and that the old sentence exists only after ticket 01's outdated heading, then run the Verify command and `git diff --check` and expect both to pass.
- Verify: `python3 -c 'from pathlib import Path; p=Path(".hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md"); s=p.read_text(); assert s.count("## Outdated decisions")==1; current,outdated=s.split("## Outdated decisions",1); old="One file is one agent session\x27s working target, so a session opens exactly what it claims."; link="../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md"; g=Path(".hamilton/specs/glossary.md").read_text(); assert old not in current and old in outdated; assert "ticket-sized working target" in current and "ticket-sized working target" in g; assert link in outdated and (p.parent/link).resolve().is_file(); assert "tickets/NN-slug.md" in current and "tickets/NN-slug.md" in g; print("decision-ticket vocabulary ok")'` → prints `decision-ticket vocabulary ok`; `git diff --check` exits 0
- Commit: `docs(wayfinder): align decision-ticket sizing vocabulary`

### Task 3: Correct the claim/frontier source decision

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md`
  - Deleted: none
- Acceptance:
  - Ticket 04's current `## Answer` summary and `### Claiming stays` subsection say claiming is retained as an active-work signal, does not prevent git collisions, removes the ticket from the frontier, and leaves it unresolved. The current ticket-status discussion includes `open`, `claimed`, and `resolved` without changing frontmatter syntax or `blocked_by` meaning.
  - The current Consequences list says claiming is kept, removes the ticket from the frontier, and leaves it unresolved. It no longer says claiming does not change or affect frontier calculation, and “Tickets drop claiming” is removed.
  - Ticket 04 gains one `## Outdated decisions` section that preserves both old assertions—“But claiming does not change the frontier calculation: a claimed ticket is still open, not unblocked or resolved.” and “Claiming is kept but does not affect frontier calculation”—and links `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` as the superseding contract.
  - The YAML-frontmatter decision, claim signal, collision behavior, map status discussion, mechanics-section boundary, and all unrelated consequences remain unchanged; `CONTRIBUTING.md` is untouched.
- Steps:
  1. Run the Verify command before editing and confirm it fails because the current Answer still says claiming does not affect the frontier and has no outdated section.
  2. Correct the Answer summary, `### Claiming stays`, ticket status values, and matching Consequences bullet to the current truth from `requirements/wayfinder.md`: `claimed` is unresolved but outside the frontier and remains a non-enforcing signal of active work.
  3. Append `## Outdated decisions` with a named subsection that preserves the two exact superseded frontier assertions and links `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md`; state that claim signaling and collision behavior remain current.
  4. Read the whole ticket and confirm the current Answer is internally coherent while the old assertions survive only as visibly outdated history, then run the Verify command and `git diff --check` and expect both to pass.
- Verify: `python3 -c 'from pathlib import Path; p=Path(".hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md"); s=p.read_text(); assert s.count("## Outdated decisions")==1; current,outdated=s.split("## Outdated decisions",1); old1="But claiming does not change the frontier calculation: a claimed ticket is still open, not unblocked or resolved."; old2="Claiming is kept but does not affect frontier calculation"; link="../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md"; claim=current.split("### Claiming stays",1)[1].split("### Status values",1)[0]; statuses=current.split("### Status values",1)[1].split("### Map mechanics",1)[0]; assert old1 not in current and old1 in outdated; assert old2 not in current and old2 in outdated; assert "Tickets drop claiming" not in current; assert "removes" in claim and "frontier" in claim and "unresolved" in claim; assert all(x in statuses for x in ("open", "claimed", "resolved")); assert link in outdated and (p.parent/link).resolve().is_file(); print("claim/frontier decision ok")'` → prints `claim/frontier decision ok`; `git diff --check` exits 0
- Commit: `docs(wayfinder): correct claimed-ticket frontier decision`

### Task 4: Update the Wayfinder skills-reference summary

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `docs/skills.md`
  - Deleted: none
- Acceptance:
  - The introductory paragraph under `### hamilton-wayfinder` says Wayfinder works only decision tickets the user explicitly requests, either one ticket or a named batch, until the way to the destination is clear. It no longer says Wayfinder works tickets one at a time.
  - The paragraph still says the map plans the way and the doing comes later one change at a time; the entry's When, Inputs, Produces, Notes, provenance, and Source fields remain unchanged.
  - No other skill entry, pipeline paragraph, diagram, helper-script documentation, or file is changed by this task.
- Steps:
  1. Run the Verify command before editing and confirm it fails because the Wayfinder entry still says “works them one at a time.”
  2. In `docs/skills.md`, isolate the introductory paragraph between the `hamilton-wayfinder` heading and its `- **When:**` bullet. Replace only the ticket-work sentence with a concise summary grounded in Task 1: Wayfinder works only the decision tickets the user explicitly requests—one ticket or a named batch—until the way is clear. Preserve the following “map plans / doing later” sentence and the rest of the entry exactly.
  3. Read the complete Wayfinder entry and its neighboring init/propose headings to ensure structure and provenance are unchanged, then run the Verify command and `git diff --check` and expect both to pass.
- Verify: `python3 -c 'from pathlib import Path; s=Path("docs/skills.md").read_text(); tick=chr(96); start="### "+tick+"hamilton-wayfinder"+tick; end="### "+tick+"hamilton-propose"+tick; entry=s.split(start,1)[1].split(end,1)[0]; assert "explicitly requests" in entry and "named batch" in entry; assert "works them one at a time" not in entry; assert "one change at a time" in entry; assert "mattpocock/skills" in entry and "../NOTICE" in entry and "../skills/hamilton-wayfinder/SKILL.md" in entry; print("skills summary ok")'` → prints `skills summary ok`; `git diff --check` exits 0
- Commit: `docs(skills): describe user-directed wayfinder ticket work`

## Done when

- All four tasks are implemented and recorded in `progress.md`; their structural Verify commands pass independently.
- The implementation diff is confined to `skills/hamilton-wayfinder/SKILL.md`, `docs/skills.md`, `.hamilton/specs/glossary.md`, tickets 01 and 04, and normal change artifacts (`plan.md`, `progress.md`, `review.md`); no template, `CONTRIBUTING.md`, TypeScript, dependency, or unrelated map file changes.
- Active truth in the skill, glossary, docs summary, and current Answers contains no implicit first-frontier start, one-ticket-per-session limit, one-file-per-session definition, or claim-does-not-affect-frontier assertion; the superseded source-ticket statements survive only under `## Outdated decisions` with resolving links.
- `bun --bun vitest run` passes; `bun run build` passes; `git diff --check` is clean.
- All per-task and whole-change review feedback has been addressed and the latest whole-change verdict is approved.
- During `hamilton-finish-work`, `requirements/wayfinder.md` is distilled into `.hamilton/specs/wayfinder.md`, aligning its Overview, Working behavior, Examples, Invariants, Decisions, and claimed-ticket frontier mechanics without copying delta-form headings into the canonical spec.

## Amendment — 2026-08-30

Live PR review on #40 objected to Task 2 and Task 3 editing tickets 01 and 04 (historic decision
record). Both tickets are reverted to their pre-change content — see `progress.md`'s "PR review fix
— 2026-08-30" entry for the detail. Task 2's and Task 3's file lists, acceptance criteria, and Verify
scripts above, and the "Done when" bullet naming tickets 01 and 04 in the confined diff, describe the
state before this amendment and no longer match the final diff: the implementation diff is now
confined to `skills/hamilton-wayfinder/SKILL.md`, `docs/skills.md`, `.hamilton/specs/glossary.md`,
and change artifacts. The glossary's current definitions and Task 1's skill behavior are unaffected.
