# Proposal: Author hamilton-wayfinder

| Field   | Value                                   |
|---------|-----------------------------------------|
| Change  | 2026-08-08-author-hamilton-wayfinder    |
| Status  | draft                                   |
| Author  | Caio Ferreira (with hamilton wayfinder) |
| Created | 2026-08-08                              |

## Why

Hamilton has a pre-SDD planning stage with no skill to run it. The map is cleared, the route names ten units, and units 1–5 have shipped — but the skill that charts a map and works its tickets does not exist yet. Every reference the route, the tickets, and the ported siblings make to "the skill that works a map" points at a directory that is still empty.

This is the one unit where nothing upstream constrains the shape. The ported siblings (unit 5) were verbatim forks; grilling (unit 4) was a near-verbatim port; the templates (unit 3) were fixed by decisions. The wayfinder skill is written from scratch, adapting upstream's tracker-native methodology to Hamilton's file-native world. Thirteen resolved tickets fix the decisions; the craft is in making them a single, predictable, invocable skill — the longest and most-invoked in the repo.

## Goals & Success Criteria

- `skills/hamilton-wayfinder/SKILL.md` exists and is a complete, invocable skill that charts a map and works its decision tickets file-natively under `.hamilton/maps/<effort>/`.
- A sibling `NOTICE` exists, stating original authorship under Apache 2.0 — not the adaptation pattern used by the ported siblings, because this skill is written from scratch.
- The skill carries one `## Map mechanics` section that is genuinely isolated: a reader can swap the mechanics without touching the rest of the skill. The section documents the YAML frontmatter contract, the file layout, the claiming convention, and the branching rule (status flips ride the unit's own branch, per ticket 13).
- The skill references the templates at `bundle/templates/wayfinder/` (installed to `~/.hamilton/templates/wayfinder/` by `hamilton setup`) rather than reproducing format details inline.
- The skill reaches the three ported siblings (`hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-wayfinder-domain-modeling`) and `hamilton-grilling` by name, which is possible because all four are model-invoked.
- All four ticket types survive with the strict HITL rule for planning (ticket 08): the agent never stands in for the human's voice during a planning dialogue.
- The map lifecycle is documented: `open` → `cleared` → `shipping` → `shipped`, with `route.md` written as a closing act when the map clears.
- Route unit 6 reads `Status: shipped`.

## Non-Goals

- **Teaching propose to read a route.** Unit 8 owns the map-aware entrypoint for `hamilton-propose`. This unit authors the wayfinder skill only; propose stays untouched.
- **Refactoring propose and critique onto grilling.** Unit 7 owns that. This unit uses grilling as-is.
- **Syncing framework docs.** Unit 9 adds the wayfinder entry to `docs/skills.md`. This unit does not touch docs.
- **Porting upstream's wayfinder verbatim.** The skill is written from scratch. Upstream's tracker-native mechanics are replaced by Hamilton's file-native mechanics; upstream's body is inspiration, not text to copy.
- **Adding a CLI command for maps.** Ruled out of scope by the map itself — a frontier query is a directory scan, and `hamilton` is a template-installer with one subcommand.
- **Creating tests.** `skills/` is not bundled and no test asserts on skill content, per ticket 12. The repo gates (`bun run build`, `bun --bun vitest run`) must stay green, but no new test is added.

## Proposed Change

One new skill directory — `skills/hamilton-wayfinder/` — holding `SKILL.md`, a sibling `NOTICE`, and no `references/` directory. The skill is user-invoked (`disable-model-invocation: true`), matching upstream: no other skill needs to reach wayfinder, so the description stays human-facing and costs zero context load.

The skill body carries the full methodology: the map as an index (not a store), the two invocation branches (chart the map, work through the map), the four ticket types and their resolving skills, fog of war, out of scope, and the map lifecycle. One `## Map mechanics` section is structurally isolated in the body, documenting the file-native contract so a future tracker backend can swap it. Format details point at the templates in `bundle/templates/wayfinder/` rather than being reproduced.

The `NOTICE` states original authorship under Apache 2.0 — `Copyright 2026 Caio Ferreira` — without the "adapted from" language, because the skill text is original. The root `NOTICE` already carries the repo-level upstream attribution; the per-skill `NOTICE` follows the same pattern as the root's own Hamilton copyright notice rather than the ported siblings' adaptation notice.

## Capabilities

### New

- `wayfinder`: the methodology for charting a map of decision tickets and working them to a cleared route — the map lifecycle, the charting and working processes, the frontier and fog-of-war mechanics, and the file-native map mechanics that a future backend can swap.

### Modified

None. `glossary` defines the vocabulary this skill uses; `ticket-resolution` defines how each ticket type is resolved. This capability owns how the map is charted and worked, which is the boundary between them.

### Removed

None.

## Impact

One new directory under `skills/`, one status line in `route.md`. Nothing existing is modified: no current skill invokes wayfinder, and `skills/` is not bundled or asserted on by any test. The repo gates stay green by construction.

The visible ongoing cost is zero context load: user-invocation means the description sits outside the agent's window and the body loads only when the skill fires. The skill reaches the four model-invoked siblings by name, which is the only coupling, and it is one-directional — the siblings do not know wayfinder exists.

## Open Questions

None. The eight backing tickets fix every decision; the three open choices the route named — body versus `references/`, the `## Map mechanics` isolation boundary, and invocation mode — are settled in `design.md`.
