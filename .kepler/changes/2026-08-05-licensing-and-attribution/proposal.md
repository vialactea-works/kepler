# Proposal: Adopt Apache 2.0 and the attribution convention

| Field   | Value                                      |
|---------|--------------------------------------------|
| Change  | 2026-08-05-licensing-and-attribution       |
| Status  | draft                                      |
| Author  | agent (attended)                           |
| Created | 2026-08-05                                 |

## Why

Hamilton is publicly distributed and grants its recipients nothing. There is no `LICENSE` file, no
`license` field in `package.json`, and no licence statement anywhere in the repo — while `install.sh`
curls a binary from `raw.githubusercontent.com` and the README instructs `npx skills add`. Absent an
explicit grant the default is all rights reserved, so every install today is a copy the recipient has
no stated right to make.

The wayfinder fork makes that acute rather than creating it. Units 4, 5 and 6 redistribute text from
[mattpocock/skills](https://github.com/mattpocock/skills), which is MIT and requires its copyright and
permission notice to travel with substantial portions of the work. Shipping an unlicensed repo that
redistributes someone else's licensed text is incoherent in both directions: Hamilton withholds a
grant it means to give, and passes on one it is obliged to forward.

[Fork attribution and licensing](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) settled
the answer — Apache 2.0, with credit that is **formal rather than prose**, landing at two levels: the
repo root, and inside each forked skill directory. That ticket blocks nothing structurally, but its
answer has to exist before anything ships, and three later units land forked skills that need a rule
to follow rather than a ticket to re-read.

## Goals & Success Criteria

- Hamilton declares a licence its recipients can rely on: `LICENSE` holds the full Apache 2.0 text,
  `package.json` declares `"license": "Apache-2.0"`, and `README.md` states it where a reader arrives.
- The root `NOTICE` discharges upstream's MIT terms for the repo-as-distributed, carrying Matt
  Pocock's copyright line and the full MIT permission text **copied verbatim from upstream's own
  `LICENSE`**, not reconstructed.
- `CONTRIBUTING.md` carries the per-forked-skill rule in writing, so units 4, 5 and 6 land their own
  `NOTICE` and provenance line by following a repo convention rather than by re-deriving ticket 03.
- `bun run build` and `bun run test` stay green — this change touches no code path, and nothing in
  `tests/` asserts on `package.json`, `LICENSE` or `NOTICE`.

## Non-Goals

- **No per-skill `NOTICE` files.** None of the five forked skill directories exist yet. Ticket 03
  describes this unit as covering them, but the route reassigned that: each skill-authoring unit lands
  its own `NOTICE` by following the rule this change writes down. Same coverage, no trailing unit
  revisiting five directories.
- **The root `NOTICE` does not enumerate the forked skills.** It carries one entry for the upstream
  project and states that each forked directory ships its own sibling notice. Enumerating five
  directories that will not exist until unit 6 would make a legal-facing document assert something
  false for the whole stretch between.
- **No prose provenance for the fork.** Ticket 03 ruled the Inspirations section in
  `docs/sdd-framework.md` out, and handed introducing the fork in prose to
  [How the framework docs present the pre-SDD stage](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md),
  which is unit 9. The README section this change adds is the licence *declaration*, not that
  introduction.
- **No per-file Apache headers.** Ticket 03 rejected them: the boilerplate is recommended rather than
  required, it cannot sit above a `SKILL.md`'s YAML frontmatter without breaking it, and headering the
  five TypeScript files nobody detaches while missing the nine skill directories that travel is worse
  than headering neither.
- No change to how Hamilton is built, packaged, or distributed. `"private": true` stays — the licence
  field is a declaration, not a step toward npm publication.
- No relicensing of upstream's own files. Upstream's text stays MIT; the combined work ships under
  Apache 2.0.

## Proposed Change

Five files change — two new at the repo root, and three that already carry Hamilton's conventions.

**`LICENSE`** gains the full, unmodified Apache License 2.0 text, with the appendix boilerplate left
in place as upstream Apache publishes it. Hamilton's own copyright line reads `Copyright 2026 Caio
Ferreira` — a single year, not a range, since the repo opens in 2026 and a range needs annual
maintenance nobody performs.

**`NOTICE`** gains Hamilton's copyright line and one attribution entry for `mattpocock/skills`: Matt
Pocock's copyright, the full MIT permission text, and a sentence directing the reader to the sibling
`NOTICE` inside any forked skill directory. It names no individual skill.

**`package.json`** gains `"license": "Apache-2.0"` alongside the existing top-level metadata.

**`README.md`** gains a short `## License` section — Hamilton is Apache-2.0, see `LICENSE`; forked
skills carry upstream's MIT notices, see `NOTICE`.

**`CONTRIBUTING.md`** gains the attribution rule in writing: every skill directory forked from an
upstream project ships a sibling `NOTICE` carrying both copyrights, and its `SKILL.md` carries a
one-line provenance pointer. The rule states the two constraints that give it its shape — the licence
text does not go in `references/`, which in this repo means content the agent is expected to read, and
it does not go inside `SKILL.md`, whose body is a context tax on every invocation.

A reader who installs a single forked skill directory and nothing else still receives the upstream
notice, because it sits next to the `SKILL.md` they copied. That is the property the two-level scheme
exists for: the unit of distribution here is the skill directory, not the repo.

## Capabilities

### New

- `licensing`: the licence Hamilton grants, the attribution notices that travel with forked upstream
  material, and the rule every future fork follows.

### Modified

None.

### Removed

None.

## Impact

Touches `LICENSE` and `NOTICE` (both new at the repo root), `package.json`, `README.md`, and
`CONTRIBUTING.md`. No source file, no test, and no bundled asset changes; `bundle/` carries only
templates and guidelines, and no test reads any of these files.

One more file rides the branch for bookkeeping rather than substance: unit 2's status line in
[`route.md`](../../maps/hamilton-wayfinder/route.md) flips to `shipped`, per
[Where map artifacts live relative to per-unit worktrees](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md),
so the claim and the work merge together.

Downstream, units 4, 5 and 6 inherit an obligation: each lands a sibling `NOTICE` and a provenance
line for the skills it forks, following the `CONTRIBUTING.md` rule. Unit 9 inherits the prose
introduction of the fork's provenance, which ticket 03 deliberately kept out of the Inspirations
section.

For consumers, the change is strictly additive — recipients gain a grant they did not have. The one
narrowing is GPLv2 incompatibility, accepted in ticket 03: it bites only if someone vendors Hamilton
into a GPLv2 project, and GPLv3 remains fine.

## Open Questions

None. Three shaping choices were settled in dialogue while drafting and are recorded as decisions in
`design.md`: the root `NOTICE` carries a single un-enumerated upstream entry, `README.md` gains a
licence declaration section, and `CONTRIBUTING.md` carries the rule plus a worked template rather
than prose alone.
