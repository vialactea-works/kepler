# Proposal: Land the glossary

| Field   | Value                              |
|---------|------------------------------------|
| Change  | 2026-08-05-land-the-glossary       |
| Status  | draft                              |
| Author  | agent (attended)                   |
| Created | 2026-08-05                         |

## Why

The hamilton-wayfinder fork map coined a working vocabulary — *map*, *decision ticket*,
*frontier*, *fog of war*, *destination*, *change-sized unit*, *route*, the *cleared / shipping /
shipped* status lifecycle, *claim*, and *ticket type* — across thirteen resolved decision
tickets. That vocabulary is used constantly by the map, the route, and the wayfinder skill units
that follow, but it exists nowhere as canonical project truth: `.hamilton/specs/` holds only
`cli-distribution.md`. A reader hitting "frontier" or "claim" cold in a later unit's proposal has
nothing to check it against.

[Which siblings to port](../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md)
made finalizing this vocabulary the route's first unit, on the premise that a working
`.hamilton/maps/hamilton-wayfinder/glossary.md` would exist to merge from planning. That working
file was never created during charting — the terms were sharpened directly inside ticket Answer
sections instead, which the same ticket also names as where hard decisions belong. So this
change's actual input is thirteen resolved tickets to harvest, not a file to merge; the output —
a canonical `.hamilton/specs/glossary.md` — is unchanged.

## Goals & Success Criteria

- `.hamilton/specs/glossary.md` exists, joining `cli-distribution.md` as canonical project truth,
  and every term a later wayfinder unit's proposal might need to cite resolves to a definition in
  it.
- Every definition is traceable to what a resolved ticket or the route actually established —
  no term is invented or extended beyond what's already decided.

## Non-Goals

- Does not port `hamilton-wayfinder-domain-modeling` or any glossary-maintaining skill — that is
  unit 5. This change is a one-time harvest of terms already crystallized, not a mechanism for
  keeping the glossary current going forward.
- Does not glossary every word used across the thirteen tickets — only the wayfinder-specific
  vocabulary a reader can't infer from general SDD or engineering usage.
- Does not touch `docs/`, `CONTRIBUTING.md`, or any template. Per `CONTRIBUTING.md`'s mapping
  table, none of its rows cover a new file landing in `.hamilton/specs/`.

## Proposed Change

Add `.hamilton/specs/glossary.md`: a term-and-definition reference, not a SHALL-behavior spec —
covering the eight terms route.md's preamble names (map, decision ticket, frontier, fog of war,
destination, change-sized unit, route, cleared/shipping/shipped) plus three more that recur
load-bearingly across the tickets and the route text itself (claim, ticket type, and unit as the
route-time shorthand for change-sized unit — folded into that entry rather than duplicated).

## Capabilities

Not applicable — this change adds reference content to `.hamilton/specs/`, not a behavioral
capability. No `requirements/<capability>.md` delta is produced; see Open Questions in
`design.md` for the reasoning.

## Impact

Affects only `.hamilton/specs/glossary.md` (new file). No code, tests, or docs change. Every
route unit from here on can cite it instead of re-explaining wayfinder vocabulary inline.

## Open Questions

- None outstanding. The three open forks (glossary format, whether to produce a requirements
  delta, and term scope) were settled via grilling before drafting; see `design.md` for the
  resolutions.
