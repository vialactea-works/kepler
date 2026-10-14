# Plan: Author hamilton-wayfinder

## Overview

- Change: `.hamilton/changes/2026-08-08-author-hamilton-wayfinder/`
- Goal: Create `skills/hamilton-wayfinder/` — a from-scratch, user-invoked skill that charts a map of decision tickets and works them one at a time until the way to the destination is clear, plus a sibling `NOTICE` stating original authorship under Apache 2.0.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: This is a Markdown-only change — no `src/` or `tests/` files are touched, so the repo gates stay green by construction. The skill is written from scratch (not a verbatim port), so its `NOTICE` uses original authorship under Apache 2.0, not the "adapted from" pattern the ported siblings carry. The design ([design.md](design.md)) fixes a ten-section `SKILL.md` structure and three settled choices: user-invoked (`disable-model-invocation: true`), no `references/` directory, and one isolated `## Map mechanics` section. The requirements ([requirements/wayfinder.md](requirements/wayfinder.md)) fix the SHALL statements and invariants. The templates the skill points at live in `bundle/templates/wayfinder/` (installed to `~/.hamilton/templates/wayfinder/` by `hamilton setup`). There are no automated tests for skill content (per ticket 12); verification is structural — grep-based checks that confirm the body carries every section, reaches the four model-invoked siblings by name, isolates all file-native mechanics in one section, and never reproduces template structures inline. The route unit 6 status flip (`pending` → `shipped`) is handled by `hamilton-finish-work` on the unit's branch, not by this plan.
- Quality notes: The task seams follow the design's section structure — scaffold + config, then the conceptual frame, then the two procedural branches, then the route/lifecycle, then the isolated mechanics section. One accepted smell is recorded in [design.md](design.md): the `## Map mechanics` section has a second reason to change (tracker backend swap), which is the whole point of isolating it — the section is the swappable contract. No other structural smells; each task lands one cohesive, independently verifiable unit.

## Tasks

### Task 1: Scaffold the skill directory — frontmatter, section skeleton, and NOTICE

- Depends on: none
- Files:
  - Created: `skills/hamilton-wayfinder/SKILL.md`, `skills/hamilton-wayfinder/NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - `skills/hamilton-wayfinder/SKILL.md` exists with YAML frontmatter carrying `name: hamilton-wayfinder`, a one-line human-facing `description`, and `disable-model-invocation: true` (requirements: "SHALL be user-invoked"; invariant: "MUST be user-invoked").
  - The `SKILL.md` body carries all ten section headings from [design.md](design.md) § SKILL.md structure: Opening, The map, Ticket types, Fog of war, Out of scope, Chart the map, Work through the map, The route, and `## Map mechanics` (the tenth — frontmatter is the first, not a heading).
  - `skills/hamilton-wayfinder/NOTICE` exists, states `Copyright 2026 Caio Ferreira` and the Apache License 2.0, and does NOT contain the phrase "adapted from" (requirements: "SHALL carry a sibling NOTICE stating original authorship"; invariant: "MUST NOT use the 'adapted from' pattern").
  - The `SKILL.md` does NOT carry a provenance line (requirement: "SHALL NOT carry a provenance line").
  - Repo gates pass: `bun run build` and `bun --bun vitest run` both green.
- Steps:
  1. Create `skills/hamilton-wayfinder/SKILL.md` with the YAML frontmatter block (`name`, `description`, `disable-model-invocation: true`) followed by the ten section headings as `##`-level headings, each with a one-line placeholder noting it is filled in a later task. The description is a human-facing one-line summary of what the skill does (charting a map and working its tickets), not a model-facing trigger list.
  2. Create `skills/hamilton-wayfinder/NOTICE` following the root `NOTICE`'s own copyright pattern — `Copyright 2026 Caio Ferreira` under the Apache License, Version 2.0 — without any "adapted from" language or upstream MIT block. The root `NOTICE` already carries the repo-level upstream attribution; this per-skill notice follows the root's original-work pattern, not the ported siblings' adaptation pattern (see [design.md](design.md) § Decision: Original NOTICE).
  3. Run `bun run build` and `bun --bun vitest run` — expect both green (the change adds Markdown under `skills/`, which is not compiled or tested).
- Verify: `test -f skills/hamilton-wayfinder/SKILL.md && test -f skills/hamilton-wayfinder/NOTICE` → exits 0; `rg "^disable-model-invocation: true" skills/hamilton-wayfinder/SKILL.md` → one match; `rg "Copyright 2026 Caio Ferreira" skills/hamilton-wayfinder/NOTICE` → one match; `rg -i "adapted from" skills/hamilton-wayfinder/NOTICE` → no match; `rg -i "adapted from" skills/hamilton-wayfinder/SKILL.md` → no match (no provenance line).
- Commit: `MAESTRO: Scaffold hamilton-wayfinder skill — frontmatter, section skeleton, NOTICE`

### Task 2: Author the conceptual frame — opening, the map, ticket types, fog of war, out of scope

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md` (sections 2–6)
  - Deleted: none
- Acceptance:
  - The Opening introduces wayfinding as finding the way, not charging at the destination, and establishes the leading words: *map*, *destination*, *ticket*, *frontier*, *fog of war* (design § SKILL.md structure § 2).
  - The Map section describes the map as an index, not a store, with its five sections (Destination, Notes, Decisions so far, Not yet specified, Out of scope), and points at the installed template at `~/.hamilton/templates/wayfinder/map.md` rather than reproducing its structure (requirement: "SHALL reference the templates … rather than reproducing them inline"; invariant: "MUST NEVER reproduce format details").
  - The Ticket types section names all four types (`research`, `prototype`, `grilling`, `task`), states each one's resolving skill by name — `hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-grilling` + `hamilton-wayfinder-domain-modeling`, and task driven alone or via checklist (requirements: the four WHEN clauses for ticket types) — and states the strict HITL rule: the agent never stands in for the human's side of a planning dialogue (requirement: "A HITL ticket SHALL resolve only through live exchange"; invariant: "MUST NEVER answer its own questions").
  - The Fog of war section describes the dim view ahead, the fog-or-ticket test, and graduation (when a resolution makes new tickets specifiable, the fog clears).
  - The Out of scope section states that work ruled beyond the destination never graduates — it stays listed, it does not become a ticket.
  - The body in these sections refers to concepts (tickets, frontier, claiming, resolving) without naming frontmatter fields, file path conventions, or branching rules — those live in `## Map mechanics` (Task 5). This is the isolation boundary the design commits to.
- Steps:
  1. Under each of the five headings (Opening, The map, Ticket types, Fog of war, Out of scope), replace the placeholder with the section's content. Follow [design.md](design.md) § SKILL.md structure for what each section covers, and [requirements/wayfinder.md](requirements/wayfinder.md) for the SHALL statements each section satisfies. Write flowing prose — no hard-wrapping, no bullet lists where a paragraph carries the idea better.
  2. Confirm the four resolving skills are each named exactly once in the Ticket types section: `hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-grilling`, `hamilton-wayfinder-domain-modeling`.
  3. Confirm the Map section points at `~/.hamilton/templates/wayfinder/map.md` and does not reproduce the template's section headings or frontmatter as a spec.
  4. Confirm none of these five sections name a frontmatter field (`type:`, `status:`, `blocked_by:`) or a file path convention (`.hamilton/maps/<effort>/`) — those are mechanics reserved for `## Map mechanics`.
- Verify: `rg -c "hamilton-wayfinder-research|hamilton-wayfinder-prototype|hamilton-wayfinder-domain-modeling|hamilton-grilling" skills/hamilton-wayfinder/SKILL.md` → ≥ 4 (all four siblings named); `rg -i "fog of war" skills/hamilton-wayfinder/SKILL.md` → match; `rg -i "never graduates" skills/hamilton-wayfinder/SKILL.md` → match; `rg -n "type:|status:|blocked_by:" skills/hamilton-wayfinder/SKILL.md` → no matches above the `## Map mechanics` heading (mechanics not yet written, so zero matches expected at this stage).
- Commit: `MAESTRO: Author wayfinder conceptual frame — opening, map, ticket types, fog, scope`

### Task 3: Author the two branches — chart the map, work through the map

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md` (sections 7–8)
  - Deleted: none
- Acceptance:
  - The Chart the map section lists the charting steps in order: name the destination (via a grilling session), map the frontier breadth-first, create the map from the installed `map.md` template, create the tickets that can be specified now from the installed `ticket.md` template and wire `blocked_by` in a second pass, fire `hamilton-wayfinder-research` subagents for research tickets in parallel (requirements: the six charting WHEN clauses; "Charting SHALL be one session's work and SHALL resolve no tickets itself").
  - The Chart the map section states the no-fog edge case: if breadth-first grilling surfaces no fog, the skill stops and tells the user a map is not needed (requirement: "WHEN breadth-first grilling surfaces no fog … the skill SHALL stop"; design § Error Handling).
  - The Work through the map section lists the working steps in order: load the map, choose the next frontier ticket (first open, unblocked, unclaimed), claim it (set status to `claimed` before any work), resolve it with the skill its type delegates to, record the answer (append under `## Answer`, flip status to `resolved`, append a one-line gist to the map's Decisions so far with a link to the ticket), graduate any fog the resolution makes specifiable, or close a ticket that sits beyond the destination (requirements: the working WHEN clauses).
  - The Work through the map section states the one-ticket-per-session rule with the research exception (requirement: "SHALL resolve at most one ticket per session, with the exception of research tickets").
  - Both sections point at the installed templates (`~/.hamilton/templates/wayfinder/map.md`, `~/.hamilton/templates/wayfinder/ticket.md`) for format, and do not reproduce template structures inline.
  - Neither section names frontmatter fields or file path conventions outside what the concepts require — the mechanics of claiming (setting a frontmatter field) and the file layout are reserved for `## Map mechanics`. The working steps may reference the *concept* of claiming and the *concept* of status, but the field names and valid values belong to Task 5.
- Steps:
  1. Under the Chart the map heading, replace the placeholder with the charting procedure. Follow [design.md](design.md) § SKILL.md structure § 7 and the charting SHALL statements in [requirements/wayfinder.md](requirements/wayfinder.md). Order the steps as the requirements list them.
  2. Under the Work through the map heading, replace the placeholder with the working procedure. Follow [design.md](design.md) § SKILL.md structure § 8 and the working SHALL statements. Include the claim-before-work rule, the resolve-and-record loop, the fog-graduation step, and the out-of-scope closure step.
  3. Confirm the no-fog edge case is in the Chart section.
  4. Confirm the one-ticket-per-session rule (with research exception) is in the Work section.
  5. Confirm both sections point at templates by path and do not inline template structures.
- Verify: `rg -i "no fog|not needed" skills/hamilton-wayfinder/SKILL.md` → match (no-fog edge case); `rg -i "one ticket per session|at most one ticket" skills/hamilton-wayfinder/SKILL.md` → match (one-ticket rule); `rg -i "hamilton-wayfinder-research" skills/hamilton-wayfinder/SKILL.md` → match (research subagent firing); `rg -i "claimed" skills/hamilton-wayfinder/SKILL.md` → match (claim concept present).
- Commit: `MAESTRO: Author wayfinder branches — chart the map, work through the map`

### Task 4: Author the route and map lifecycle

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md` (section 9)
  - Deleted: none
- Acceptance:
  - The Route section describes the route as a static handoff written once when the map clears — it points at the decisions backing each unit and does not restate them (design § SKILL.md structure § 9; ticket 06: "route.md = static handoff, written once at map close").
  - The section documents the map lifecycle in order: `open` → `cleared` → `shipping` → `shipped` (requirement: map status values; design § Data & Flow lifecycle table).
  - The section states that each route unit runs the SDD loop once (propose → plan → code → review → finish-work) and flips its own status on its own branch (design § Data & Flow; ticket 13).
  - The section points at the installed `~/.hamilton/templates/wayfinder/route.md` template for format and does not reproduce its structure inline.
- Steps:
  1. Under the Route heading, replace the placeholder with the route and lifecycle content. Follow [design.md](design.md) § SKILL.md structure § 9 and the Data & Flow lifecycle table.
  2. State the four lifecycle stages in order and what happens at each transition (chart → work → clear → ship → done).
  3. State that the route is written once at map close as a static handoff, and that each unit runs the SDD loop and flips its own status on its own branch.
  4. Point at `~/.hamilton/templates/wayfinder/route.md` for the route's format; do not inline the template's structure.
- Verify: `rg -i "open.*cleared.*shipping.*shipped|cleared.*shipping.*shipped" skills/hamilton-wayfinder/SKILL.md` → match (lifecycle stages); `rg -i "static handoff|written once" skills/hamilton-wayfinder/SKILL.md` → match (route-as-handoff); `rg -i "route\.md" skills/hamilton-wayfinder/SKILL.md` → match (points at template).
- Commit: `MAESTRO: Author wayfinder route and map lifecycle`

### Task 5: Author the isolated `## Map mechanics` section and verify the isolation boundary

- Depends on: Task 2, Task 3, Task 4
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md` (section 10)
  - Deleted: none
- Acceptance:
  - The `## Map mechanics` section documents the YAML frontmatter fields (`type`, `status`, `blocked_by`) and their valid values: tickets use `open` / `claimed` / `resolved`; maps use `open` / `cleared` / `shipping` / `shipped` (requirement: "SHALL document the YAML frontmatter fields … and their valid values").
  - The section documents the file layout convention: maps live at `.hamilton/maps/<effort>/` holding `map.md`, `route.md`, and `tickets/NN-slug.md` (ticket 01; requirement: "SHALL document … the file layout convention").
  - The section documents claiming as a signal of intent that does not affect frontier calculation (requirement: "SHALL document claiming as a signal of intent"; ticket 04).
  - The section states the branching rule: map artifacts are ordinary repo content, versioned and branched like source, and status flips ride the unit's own branch and land on the default branch at merge (requirement: "SHALL state that map artifacts are ordinary repo content … status flips ride the unit's own branch"; ticket 13).
  - **Isolation boundary holds**: searching the body *outside* `## Map mechanics` for frontmatter field names (`type:`, `status:`, `blocked_by:`) and file path conventions (`.hamilton/maps/`) returns nothing. The section is the only place mechanics are defined; the rest of the body refers to concepts only (requirement: "The rest of the skill body SHALL refer to concepts … without depending on the specific mechanics"; invariant: "MUST be the only place … where file-native mechanics are defined").
  - Repo gates pass: `bun run build` and `bun --bun vitest run` both green.
- Steps:
  1. Under the `## Map mechanics` heading, replace the placeholder with the four mechanics: frontmatter fields + valid values, file layout, claiming, branching rule. Follow [requirements/wayfinder.md](requirements/wayfinder.md) § Map mechanics SHALL statements and [design.md](design.md) § SKILL.md structure § 10. This is the swappable contract — a reader should be able to replace this one section and verify in one pass that nothing outside it breaks.
  2. Run the isolation check: extract every line in `SKILL.md` *before* the `## Map mechanics` heading and search for `type:`, `status:`, `blocked_by:`, and `.hamilton/maps/`. Confirm zero matches — the body above the section refers to concepts (tickets, frontier, claiming, resolving) without naming the mechanics. If any match appears, move the mechanic detail into `## Map mechanics` and rephrase the body reference to use the concept only.
  3. Run `bun run build` and `bun --bun vitest run` — expect both green.
- Verify: `rg -n "type:|status:|blocked_by:" skills/hamilton-wayfinder/SKILL.md` → every match is at or below the `## Map mechanics` heading line (confirm by line number); `rg -n "\.hamilton/maps/" skills/hamilton-wayfinder/SKILL.md` → every match is at or below the `## Map mechanics` heading line; `rg -n "ordinary repo content|versioned and branched" skills/hamilton-wayfinder/SKILL.md` → match inside `## Map mechanics`; `rg -n "signal of intent" skills/hamilton-wayfinder/SKILL.md` → match inside `## Map mechanics`.
- Commit: `MAESTRO: Author wayfinder Map mechanics section + verify isolation boundary`

## Done when

- All five tasks implemented (recorded in `progress.md`).
- `skills/hamilton-wayfinder/SKILL.md` carries all ten sections from [design.md](design.md) § SKILL.md structure.
- `skills/hamilton-wayfinder/NOTICE` states original authorship under Apache 2.0 with no "adapted from" language.
- The four model-invoked siblings (`hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-wayfinder-domain-modeling`, `hamilton-grilling`) are each named in the body.
- The isolation boundary holds: no frontmatter field names or file path conventions appear outside `## Map mechanics`.
- The body points at the installed templates for format and never reproduces template structures inline.
- `bun run build` and `bun --bun vitest run` both pass.
