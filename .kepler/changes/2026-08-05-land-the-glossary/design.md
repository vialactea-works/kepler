# Design: Land the glossary

## Context

`.hamilton/specs/` holds one file today, `cli-distribution.md`, written against the
`requirements-spec.md` template: `### Requirement: <name>` blocks with `SHALL` statements and
`WHEN/THEN` scenarios. That shape fits behavior. This change adds a second file to the same
directory whose content isn't behavior — it's a fixed vocabulary — so the template doesn't
transplant cleanly, and the fit had to be decided rather than assumed.

The route's own text (`.hamilton/maps/hamilton-wayfinder/route.md`, unit 1) names eight starter
terms and confirms the working-glossary premise from
[Which siblings to port](../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md)
doesn't hold: no `.hamilton/maps/hamilton-wayfinder/glossary.md` was ever created, so there is no
file to merge, only tickets to read.

## Goals / Non-Goals

**Goals**

- A canonical, self-contained glossary a later change can cite without re-deriving definitions
  from ticket prose.
- Definitions traceable to what's already decided — this change harvests, it doesn't coin.

**Non-Goals**

- Building or porting a mechanism that keeps the glossary current as future maps run (that's
  `hamilton-wayfinder-domain-modeling`, unit 5).
- Retrofitting `cli-distribution.md` or the `requirements-spec.md` template to accommodate
  glossary-shaped content generally — this change makes one judgment call for one file.

## Decisions

### Decision: term-list format, not the requirements-spec.md template

- Choice: `.hamilton/specs/glossary.md` is a flat term-and-definition reference — one `##`
  section per natural cluster of terms, one bolded term plus a tight paragraph definition each.
  No `### Requirement:` blocks, no `SHALL`, no `WHEN/THEN` scenarios.
- Alternatives considered: reuse `requirements-spec.md`'s shape so every file in `specs/` is
  structurally uniform, phrasing each entry as "the system SHALL recognize the term `<X>` to
  mean...". Rejected — a glossary entry isn't a testable behavior, and forcing SHALL-phrasing
  onto a definition produces prose that reads like an obligation nobody enforces.
- Rationale: content shape should match what the content actually is. Upstream's own
  `domain-modeling` sibling (ported in unit 5) uses exactly this shape for its `CONTEXT.md`
  format — a term-definition list grouped by natural cluster — so this isn't a novel choice, it's
  adopting the shape the domain already settled on before this unit existed.

### Decision: no `requirements/<capability>.md` delta

- Choice: this change produces `proposal.md` and `design.md` only. No capability is named in
  Proposed Change's Capabilities section, so no requirements delta is written.
- Alternatives considered: name a thin `glossary` capability with one ADDED requirement ("the
  system SHALL maintain a canonical glossary at `.hamilton/specs/glossary.md`") purely to keep
  every propose session producing the same three artifacts uniformly.
- Rationale: YAGNI. There's no scenario a future test would derive from "the system SHALL
  maintain a glossary" — the actual deliverable under review is the term list's content, not a
  behavior it satisfies. A requirements delta here would exist to satisfy the template, not to
  carry information a reader needs.

### Decision: term scope — the route's eight plus three recurring ones

- Choice: cover exactly eleven terms. The eight route.md's preamble names (map, decision ticket,
  frontier, fog of war, destination, change-sized unit, route, cleared/shipping/shipped) plus
  claim, ticket type, and unit — the last folded into the change-sized unit entry as its
  route-time shorthand rather than given a separate entry, since they name the same concept.
- Alternatives considered: exactly the eight named terms, treating the rest as self-evident from
  context or deferrable to a future glossary update.
- Rationale: claim and ticket type are used as load-bearing vocabulary in every one of the
  thirteen tickets and in `route.md` itself (every unit states its type implicitly via which
  decision tickets back it, and "claimed" governs concurrent work per
  [Map mechanics in files](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md)).
  A glossary that covers less than what the route text it's meant to support already relies on
  would under-serve the next reader.

## Architecture & Components

Single new file, `.hamilton/specs/glossary.md`, no code. Three `##` clusters group the eleven
terms by natural relation rather than alphabetically, per the domain-modeling format convention
this decision adopts:

- **The map and its parts** — map, destination, decision ticket, route.
- **Working the map** — frontier, fog of war, claim.
- **From map to code** — change-sized unit (unit), ticket type, cleared/shipping/shipped.

### Quality Lens

Trivial — one new markdown file, no code, no structural risk. The only judgment call was content
shape (term list vs. SHALL-template), resolved above; there's no unit boundary, dependency, or
seam to evaluate.

## Testing Strategy

None applicable — no code changes, and per `AGENTS.md`/`CONTRIBUTING.md` no test in the repo
asserts on `.hamilton/specs/` content. Verified by reading: every definition traced back to the
ticket or route line it's drawn from before this change is proposed for approval.

## Constraints & Boundaries

- Always: cite the ticket a definition is drawn from when the wording isn't a direct quote of the
  route or map, so a reader can verify against the source.
- Never: invent or extend a definition beyond what a resolved ticket or the route text already
  established. If a term's meaning is ambiguous across tickets, surface that rather than
  resolving it silently — glossary work is harvesting, not deciding.

## Risks / Trade-offs

- [The glossary can drift from the tickets it was harvested from if a later effort resolves a
  ticket that redefines one of these terms] -> Accepted: keeping the glossary current going
  forward is explicitly domain-modeling's job (unit 5), not this change's. This is a one-time
  finalization, matching ticket 07's original framing.

## Open Questions

None. The three forks this design had to resolve — format, whether to produce a requirements
delta, and term scope — were settled via grilling before drafting (see Decisions above).
