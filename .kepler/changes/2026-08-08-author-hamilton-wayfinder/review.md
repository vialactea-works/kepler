## skills/hamilton-wayfinder (SKILL.md + NOTICE) — 2026-08-08

Verdict: approved

### Verified

- **Correctness against requirements.** Every SHALL in `requirements/wayfinder.md` is satisfied:
  - Charting branch (steps 1–6): names destination via grilling, maps frontier breadth-first, no-fog edge case stops and tells the user a map is not needed, creates map + tickets from installed templates, wires `blocked_by` in a second pass, fires `hamilton-wayfinder-research` in parallel, one session's work resolving no tickets.
  - Working branch (steps 1–6): loads map, takes first open/unblocked/unclaimed frontier ticket, claims before work, delegates by type, records answer + flips resolved + appends gist to Decisions so far, graduates fog or closes out-of-scope, one-ticket-per-session with research exception.
  - Four ticket types survive with strict HITL rule; three-tier model scoped to SDD execution, not planning.
  - `## Map mechanics` documents frontmatter fields + valid values, file layout, claiming as signal of intent, branching rule per ticket 13.
- **Isolation boundary — structurally real.** `awk` scan of every line above `## Map mechanics` for `type:` / `status:` / `blocked_by:` / `.hamilton/maps/` returns zero matches. All four tokens appear only at/below the heading (lines 68–74). The body above refers to concepts (claim, resolve, frontier, Decisions so far) only. A reader can swap the section and verify in one pass.
- **Single source of truth.** The body points at `~/.hamilton/templates/wayfinder/{map,ticket,route}.md` for format and never reproduces template structures. The ticket template defines only `## Question`; the skill's "append under `## Answer`" is a procedural instruction (added at resolution), not a duplication. The five map sections are named with a one-line conceptual gloss each (what they *mean*), not a format restatement.
- **Invocation mode.** `disable-model-invocation: true`; `description` is a one-line human-facing summary, no trigger phrasing. Matches the design decision.
- **NOTICE.** `Copyright 2026 Caio Ferreira` under Apache 2.0; no "adapted from" language; no provenance line in SKILL.md. Follows the root NOTICE's own-work pattern.
- **Four siblings named.** `hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-grilling`, `hamilton-wayfinder-domain-modeling` all present (5 matches; grilling appears in Ticket types + Chart step 1).
- **Scope & hygiene.** Change confined to `skills/hamilton-wayfinder/` + change artifacts. No stubs, dead code, debug output, or TODOs. No pipeline skill touched.
- **Gates.** `bun run build` green; `bun --bun vitest run` green (24/24, 3 files). Markdown-only change; gates green by construction, confirmed.
- **Craft.** Leading words (map, destination, ticket, frontier, fog of war) established in the Opening and used consistently. Right-sized: no `references/` directory (justified for a user-invoked skill whose body loads on demand). The `## Map mechanics` section opens with a sentence naming itself as the swappable contract — the boundary is signposted, not just structural.

### Suggestions (non-blocking — for the writing-great-skills craft pass)

- [SKILL.md:52 / Ticket types] Design `Error Handling` names "a ticket's resolving skill is missing or unreachable — the skill surfaces this rather than silently substituting." The body does not address this edge. A one-line note in the Work `Resolve it` step (or Ticket types) would close the gap between design and body. Not mandated by a SHALL or plan acceptance criterion, so non-blocking.
- [SKILL.md:54 / Work step 6] Design `Error Handling` names "a resolution invalidates other parts of the map — the skill updates or deletes the affected tickets." Step 6 covers graduating fog and closing out-of-scope tickets but not invalidating a moot open ticket. Same rationale: design-level, not requirement-mandated, non-blocking.
- [SKILL.md:36,47] The section intros ("Charting is one session's work…"; "Working is the steady loop…") mildly restate what the numbered steps below already specify. The craft pass may tighten these; they serve as framing today and are not no-ops (the charting one carries the hard "resolves no tickets" rule).
