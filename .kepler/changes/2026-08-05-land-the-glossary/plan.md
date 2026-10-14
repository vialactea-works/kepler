# Plan: Land the glossary

## Overview

- Change: `.hamilton/changes/2026-08-05-land-the-glossary/`
- Goal: create `.hamilton/specs/glossary.md`, a term-and-definition reference covering the eleven
  wayfinder terms the map's thirteen resolved decision tickets crystallized, so a later route unit
  can cite the vocabulary instead of re-deriving it from ticket prose. See `proposal.md` (why) and
  `design.md` (format, scope, and architecture decisions) for full context — this plan does not
  restate them.
- Test: none — no test in the repo asserts on `.hamilton/specs/` content
  (`AGENTS.md`/`CONTRIBUTING.md`; confirmed in `design.md`'s Testing Strategy). Verification is by
  reading: every definition traces to the ticket or route line it's drawn from.
- Build / typecheck: `bun run build` (unaffected by a markdown-only change; run to confirm no
  regression)
- Context notes: the file is new, one location, no code touched. `design.md`'s three Decisions fix
  the shape before this task starts — a flat term-list (no `### Requirement:` / `SHALL` blocks,
  unlike the sibling `.hamilton/specs/cli-distribution.md`), no `requirements/<capability>.md`
  delta, and exactly eleven terms across three `##` clusters (`design.md` Architecture &
  Components). This plan's job is only to sequence the harvest so the coder does not have to
  re-derive those calls.
- Quality notes: none. `design.md`'s own Quality Lens rates this trivial — one new markdown file,
  no structural seam to preserve — so a single task covers the whole deliverable rather than
  fragmenting one cohesive file into artificial sub-tasks.

## Tasks

### Task 1: Write `.hamilton/specs/glossary.md`

- Depends on: none
- Files:
  - Created: `.hamilton/specs/glossary.md`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The file exists with exactly three `##` sections, in this order and matching `design.md`'s
    Architecture & Components: **The map and its parts**, **Working the map**, **From map to
    code**.
  - All eleven terms are present, each as a bolded term followed by a tight paragraph definition:
    map, destination, decision ticket, route (cluster 1); frontier, fog of war, claim (cluster 2);
    change-sized unit (folding in *unit* as its route-time shorthand, not a separate entry), ticket
    type, cleared/shipping/shipped (cluster 3).
  - No `### Requirement:`, `SHALL`, or `WHEN/THEN` language anywhere in the file — this is
    reference content, not a behavioral spec (`design.md` Decision 1).
  - Every definition is traceable to one of the source lines below; none introduces meaning beyond
    what the cited ticket or route text already established (`design.md` Constraints: "Never
    invent or extend").
- Steps:
  1. Draft **The map and its parts**:
     - *map* — from `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md`'s Answer
       ("a third kind of artifact under `.hamilton/`... spans several changes and outlives all of
       them") and `map.md`'s own shape (Destination / Notes / Decisions so far / Not yet specified
       / Out of scope, per ticket 01's "Map body versus ticket body" section).
     - *destination* — ticket 01's "Map body versus ticket body" section (the map's first section,
       fixing what reaching the end of the map looks like).
     - *decision ticket* — ticket 01's "Ticket files" section ("one file per ticket at
       `tickets/NN-slug.md`... one file is one agent session's working target").
     - *route* — `.hamilton/maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md`'s
       Answer, first sentence verbatim in substance: "a static handoff document written once at map
       close, listing change-sized units in order with dependencies... does not restate" (the
       decisions).
  2. Draft **Working the map**:
     - *frontier* — `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md`'s
       table row ("Frontier | tracker query | a directory scan") plus the wayfinder skill's own
       definition already in this session's context: "the open, unblocked, unclaimed children —
       the edge of the known."
     - *fog of war* — the wayfinder skill's "Fog of war" section already in this session's context:
       "the dim view of decisions and investigations you can tell are coming but can't yet pin
       down"; the test for ticket-vs-fog is whether the question can be stated precisely now, not
       whether it can be answered now.
     - *claim* — ticket 04's **"Claiming stays"** subsection: "someone reading `Status: claimed`
       sees the ticket is being actively worked... claiming does not change the frontier
       calculation: a claimed ticket is still open, not unblocked or resolved." **Note:** ticket
       04's one-line Answer header says "Tickets drop claiming," which contradicts its own
       "Claiming stays" subsection and `map.md`'s Decisions-so-far gist for that ticket ("Claiming
       stays (signals intent, doesn't prevent collision)"). Follow the subsection and the map's own
       gist — write the entry as "claim survives, signals intent, does not prevent collision" —
       and do not surface the contradiction inside the glossary entry itself; it is a slip in the
       ticket's one-line header, not an open question about the term's meaning.
  3. Draft **From map to code**:
     - *change-sized unit* (folding in *unit*) —
       `.hamilton/maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md`'s "Change-sized
       units" subsection verbatim in substance: "one thing that runs the propose→finish loop once...
       shaped by what one agent can hold in context in one change — roughly 'one feature or one
       fix.'" Note in the definition that `route.md` and this map's own tickets use *unit* as the
       route-time shorthand for the same concept — do not give *unit* its own bolded entry.
     - *ticket type* — `.hamilton/maps/hamilton-wayfinder/tickets/08-ticket-types.md`'s Answer:
       the four types (`research`, `prototype`, `grilling`, `task`), each HITL or AFK, recorded in
       YAML frontmatter per ticket 04.
     - *cleared/shipping/shipped* — ticket 06's "Writing and lifecycle" subsection verbatim in
       substance: "Map status transitions: `cleared` (route written) → `shipping` (units in SDD
       loop) → `shipped` (all units complete)."
  4. Re-read the finished file top to bottom against `design.md`'s Constraints: every definition
     cites its ticket where the wording isn't a direct quote of the route or map, and none extends
     past what the cited source says. Confirm the three-cluster order and heading names match
     Architecture & Components exactly.
- Verify: `cat .hamilton/specs/glossary.md` → three `##` headings in the stated order, eleven terms
  present as bolded entries, no `SHALL`/`WHEN`/`THEN` anywhere in the file (`grep -E
  'SHALL|WHEN|THEN' .hamilton/specs/glossary.md` → no matches). `bun run build` → exits clean
  (unaffected, sanity check only).
- Commit: `docs: land the wayfinder glossary`

## Done when

- Task 1 implemented (recorded in `progress.md`).
- `.hamilton/specs/glossary.md` exists, all eleven terms present, no SHALL-template language.
- `bun run build` passes.
- All review feedback has been addressed.
