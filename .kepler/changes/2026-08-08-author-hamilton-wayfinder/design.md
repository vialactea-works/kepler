# Design: Author hamilton-wayfinder

## Context

Route unit 6 asks for the centerpiece skill — `skills/hamilton-wayfinder/SKILL.md` — written from scratch. Every other unit in this route either ported upstream text verbatim (units 4, 5) or landed artifacts fixed by decisions (units 1, 2, 3). This unit adapts upstream's tracker-native wayfinder methodology to Hamilton's file-native world, and the adaptation is total: no body text is copied, no tracker mechanics survive, and the skill's structure is its own.

What is fixed: eight resolved tickets settle the decisions. The map lives at `.hamilton/maps/<effort>/` holding `map.md`, `route.md`, and `tickets/NN-slug.md` (ticket 01). Mechanics use YAML frontmatter with `type`, `status`, `blocked_by` (ticket 04). Templates ship in `bundle/templates/wayfinder/` (ticket 05). The route is a static handoff written once at map close (ticket 06). The three siblings and grilling are ported and model-invoked (tickets 07, 04). All four ticket types survive with strict HITL for planning (ticket 08). Every unit enters at propose; no straight-to-plan (ticket 09). Status flips ride the unit's own branch (ticket 13).

What is open: three choices the route named for this proposal to settle — body versus `references/` for explanatory material; the `## Map mechanics` isolation boundary; and invocation mode. Each is decided below with its alternatives and costed either way.

The skill also inherits two neighbours. `glossary` defines the vocabulary (map, destination, decision ticket, frontier, fog of war, claim, route, change-sized unit, ticket type, cleared/shipping/shipped). `ticket-resolution` defines how each ticket type is resolved and where its artifacts land. The wayfinder capability owns how the map is charted and worked — the processes, the lifecycle, and the file-native mechanics — and defers to those two for what it does not own.

## Goals / Non-Goals

Goals and non-goals are stated in [proposal.md](proposal.md) and are not restated here. The design-level goal this document adds: make the `## Map mechanics` isolation boundary **structurally real**, so a reader can verify in one pass that swapping the section would not break anything outside it.

## Decisions

### Decision: User-invoked, matching upstream

- Choice: `disable-model-invocation: true`. The `description` field is a human-facing one-line summary, not a model-facing trigger list.
- Alternatives considered: (a) model-invoked, keeping a rich description so the agent could fire wayfinder autonomously when it detects a goal too big for one session; (b) model-invoked with a narrowed description limited to wayfinder-specific triggers.
- Rationale: (a) and (b) both add per-turn context load for a skill that fires only when a person chooses to start planning. No other skill needs to reach wayfinder — it is the pre-SDD entry point, not a step in the pipeline. The ported siblings are all model-invoked, so wayfinder reaches them regardless of its own mode; the invocation trade-off runs one way. Upstream is user-invoked for the same reason. The cognitive load of remembering wayfinder exists is bounded: a person who has a goal too big for one session reaches for the planning skill, and the skill's name is self-describing.

### Decision: No `references/` directory

- Choice: all material stays in the `SKILL.md` body. No `references/` files.
- Alternatives considered: (a) a `references/CHARTING.md` holding the chart-the-map steps, disclosed behind a context pointer; (b) a `references/MECHANICS.md` holding the `## Map mechanics` section, physically isolated from the body.
- Rationale: for a user-invoked skill, the body loads only when the skill fires — body length is not a per-turn cost the way a model-invoked description is. The two branches (chart, work) share so much conceptual foundation — the map as index, fog of war, out of scope, ticket types — that splitting either behind a pointer means the agent loads the reference every time anyway, paying the disclosure cost without the disclosure benefit. The templates at `~/.hamilton/templates/wayfinder/` are already the external reference for format details, so the skill does not reproduce them. (b) is addressed separately below.

### Decision: `## Map mechanics` isolated in the body, not in `references/`

- Choice: one `## Map mechanics` section in the body, under a heading that is the isolation boundary. The rest of the body refers to concepts (tickets, frontier, claiming, resolving) without depending on the specific mechanics.
- Alternatives considered: (a) `references/MECHANICS.md`, physically isolated; (b) no dedicated section, with mechanics scattered where they are first needed.
- Rationale: (b) is what the isolation boundary exists to prevent — mechanics woven into the body are not swappable, and pluggability that is not isolated is aspirational, not real. (a) achieves isolation but at the wrong cost: the mechanics are needed every run (the agent reads frontmatter to scan the frontier, writes frontmatter to claim a ticket), so disclosing them behind a context pointer adds load for material that is always reached. A heading is a real boundary: a reader swapping the mechanics replaces one section and verifies in one pass that nothing outside it names a frontmatter field, a file path convention, or a branching rule. The co-location principle from `writing-great-skills` — keep a concept's definition, rules, and caveats under one heading — is satisfied by the section, not violated by it.

### Decision: Original `NOTICE`, no provenance line

- Choice: the `NOTICE` states `Copyright 2026 Caio Ferreira` under Apache 2.0, without the "adapted from" language. The `SKILL.md` carries no provenance line.
- Alternatives considered: (a) using the ported siblings' `NOTICE` pattern ("adapted from the wayfinder skill in mattpocock/skills"), acknowledging the methodology debt; (b) no `NOTICE` at all, since the skill is not forked and `CONTRIBUTING.md`'s per-skill `NOTICE` rule applies to forked directories.
- Rationale: (a) is wrong because the skill text is original — no upstream prose is copied, and ideas and methodologies are not copyrightable. The MIT license requires attribution for copies and substantial portions of the software, not for independent implementations of a methodology. Claiming adaptation would overstate the legal debt and mislead a reader about what is original. (b) is wrong because the route says the skill has "its own `NOTICE`", and a skill directory without a `NOTICE` is inconsistent with the repo's convention even if the `CONTRIBUTING.md` rule technically applies only to forks. The root `NOTICE` already carries the repo-level upstream attribution. The per-skill `NOTICE` follows the root's own copyright pattern.

### Decision: One capability, `wayfinder`, bounded against two neighbours

- Choice: all requirements land in `requirements/wayfinder.md`. The capability owns the map lifecycle, the charting and working processes, the frontier and fog-of-war mechanics, and the file-native map mechanics.
- Alternatives considered: (a) two capabilities — `map-charting` and `map-working`; (b) folding into `glossary`.
- Rationale: (a) splits one methodology into two shards that share the same concepts and the same skill. The propose step warns against per-aspect shards; charting and working are two branches of one skill, not two capabilities. (b) is wrong in the other direction: `glossary` defines what a term *means* (what a map *is*), while this capability states what the skill *does* (how to chart and work a map). The boundary is clean in three parts — `glossary` holds the vocabulary, `ticket-resolution` holds the resolving procedures and their artifact homes, and `wayfinder` holds the charting and working processes and the map mechanics.

### Decision: The skill points at templates, never reproduces them

- Choice: when the skill creates a map, ticket, or route, it says to use the installed template at `~/.hamilton/templates/wayfinder/`. The template's structure is not restated in the body.
- Alternatives considered: inlining the template structures in the body, the way upstream does.
- Rationale: ticket 05 put the templates in `bundle/templates/wayfinder/` precisely so there is one source of truth for each artifact's shape. Restating them in the skill body would duplicate that truth — the exact failure `writing-great-skills` calls out under single source of truth. The skill orients the agent to what each artifact *is* and *when* to create it; the template fixes *what it looks like*.

## Architecture & Components

One directory:

```
skills/
  hamilton-wayfinder/
    SKILL.md
    NOTICE
```

No `references/` directory. No reference files. The skill is self-contained: the body carries concepts and steps, the templates carry format, and the ported siblings carry resolving procedures.

### SKILL.md structure

The body is organized as follows, each section earning its place:

1. **Frontmatter** — `name`, `description` (human-facing one-line summary), `disable-model-invocation: true`.
2. **Opening** — wayfinding as finding the way, not charging at the destination. The leading words: *map*, *destination*, *ticket*, *frontier*, *fog of war*. Plan, don't do.
3. **The map** — the map as an index, not a store. The five sections (Destination, Notes, Decisions so far, Not yet specified, Out of scope). Points at the template.
4. **Ticket types** — the four types, their HITL/AFK split, and which skill each delegates to. The strict HITL rule.
5. **Fog of war** — the dim view ahead. Fog or ticket? The test. Graduation.
6. **Out of scope** — work ruled beyond the destination. Never graduates.
7. **Chart the map** — the steps: name the destination, map the frontier, create the map, create tickets and wire blocking, fire research subagents. One session's work.
8. **Work through the map** — the steps: load the map, choose the frontier ticket, claim it, resolve it, record the answer, graduate fog or rule out of scope. One ticket per session (except research).
9. **The route** — written once at map close. The map lifecycle: open → cleared → shipping → shipped. Points at the template.
10. **## Map mechanics** — the isolated section: YAML frontmatter, file layout, claiming, branching rule. The swappable contract.

### Quality Lens

**Responsibility.** The skill has one reason to change: the wayfinder methodology itself. The `## Map mechanics` section has a second, weaker reason — a tracker backend swap — which is deliberately isolated so it does not touch the rest. This is the one accepted smell, and it is the smell the section exists to contain.

**Boundaries & dependencies.** The skill depends on four model-invoked siblings by name, one-directional. It depends on the installed templates by path. It does not depend on `hamilton-propose`, `hamilton-plan`, or any pipeline skill — the route is the handoff, not a call. The `## Map mechanics` section is the boundary between methodology and implementation: the methodology above it is tracker-agnostic, the mechanics below it are file-specific.

**Right-sizing — what was deliberately not added.** No `references/` directory: the body is self-contained for a user-invoked skill. No inline template structures: the templates are the single source of truth. No router skill for the siblings: wayfinder itself is the router, dispatching on ticket type. No map-aware entrypoint for propose: unit 8 owns that.

**Accepted smells.** One: the `## Map mechanics` section has a second reason to change (tracker swap) that the rest of the skill does not. Accepted because isolating it is the whole point — the section is the swappable contract, and a future backend changes exactly that section and nothing else. Cross-listed under Risks.

## Data & Flow

Nothing executes. The flow this design fixes is the map lifecycle:

```
loose idea → chart the map → [work tickets one at a time] → map clears → route.md written
                                                                        ↓
                                                               units flow through SDD loop
                                                                        ↓
                                                                   map shipped
```

| stage | what happens | artifact |
|---|---|---|
| chart | grilling names destination, maps frontier, creates map + tickets | `map.md`, `tickets/NN-slug.md` |
| work | claim frontier ticket, resolve with type's skill, record answer | ticket's `## Answer`, map's Decisions so far |
| clear | all tickets resolved, route written | `route.md`, map status → `cleared` |
| ship | each route unit runs propose→finish-work, flips its own status | per-unit status in `route.md` |
| done | last unit ships | map status → `shipped` |

## Error Handling & Edge Cases

- **No fog after breadth-first grilling.** The way to the destination is already clear for one session. The skill stops and tells the user a map is not needed, rather than creating an empty map.
- **A ticket's resolving skill is missing or unreachable.** The ticket type is a promise that cannot be kept. The skill surfaces this rather than silently substituting a different procedure.
- **Two sessions claim the same ticket.** Git merge conflicts surface the collision. The `claimed` status does not prevent it — it signals intent, matching the claiming mechanic ticket 04 already accepted.
- **A resolution invalidates other parts of the map.** The skill updates or deletes the affected tickets, rather than leaving stale state.
- **`hamilton setup` has not been run.** The templates at `~/.hamilton/templates/wayfinder/` are missing. The skill points at a path that does not exist. This is the dependency ticket 05 documented, not guarded: the skill assumes setup has been run, the same way every other Hamilton skill does.
- **Route.md on the default branch is stale between merges.** Accepted, per ticket 13. The skill reads `route.md` from the branch it was started on, not from the default branch.

## Testing Strategy

No automated tests, and none are added. `skills/` is not bundled and no test asserts on skill content, per ticket 12. The repo gates (`bun run build`, `bun --bun vitest run`) stay green by construction — the change adds a Markdown file under `skills/` and touches nothing in `src/` or `tests/`.

Verification is structural:

- **Completeness** — the directory holds `SKILL.md` and `NOTICE`. The `SKILL.md` carries all ten sections named above. Every sibling the skill invokes by name exists in `skills/`.
- **Isolation** — searching the body outside `## Map mechanics` for frontmatter field names (`type:`, `status:`, `blocked_by:`) or file path conventions returns nothing. The section is the only place mechanics are defined.
- **No duplication** — the body does not reproduce template structures. The body does not restate what `glossary` or `ticket-resolution` already specifies. The body does not restate the provenance or licensing text the `NOTICE` carries.
- **Invocation** — the frontmatter carries `disable-model-invocation: true`. The description is a one-line summary, not a trigger list.
- **NOTICE** — the `NOTICE` states `Copyright 2026 Caio Ferreira` and Apache 2.0, and does not use the "adapted from" language.

## Constraints & Boundaries

**Always**

- Write the skill from scratch. No upstream text is copied.
- Isolate all file-native mechanics in one `## Map mechanics` section. The rest of the body refers to concepts, not mechanics.
- Point at the installed templates for format details. Never reproduce template structures inline.
- Reach the four ported siblings by name. They are model-invoked; this skill is user-invoked.
- Keep the strict HITL rule for planning. The agent never stands in for the human.

**Ask first**

- Any structural departure from the ten-section design above.
- Any material that seems like it should be in `references/` — weigh it against the user-invoked trade-off before adding a directory.

**Never**

- Copy upstream wayfinder text. The methodology is adapted; the expression is original.
- Reproduce template structures in the body. The templates are the single source of truth.
- Use the "adapted from" `NOTICE` pattern or a provenance line. The skill is original work.
- Touch `hamilton-propose`, `hamilton-plan`, or any pipeline skill. The route is the handoff.
- Add tests. `skills/` is not bundled.

## Risks / Trade-offs

- **The `## Map mechanics` section has a second reason to change.** A tracker backend swap changes the section and nothing else, which is a weaker cohesion than the rest of the body. Accepted because isolating the section is the whole point — pluggability is only real if the section is genuinely swappable, and a section with one reason to change that is "tracker swap" is the correct boundary. The alternative (scattering mechanics) is worse: it makes pluggability aspirational rather than real.
- **The skill is long for a user-invoked skill.** The body carries the full methodology with no disclosure to `references/`. Accepted because user-invocation means the body loads on demand, not every turn — the length is a readability concern, not a context-load concern. The writing-great-skills craft pass (a later task in this unit) will apply pruning levers to keep the body as tight as the material allows.
- **No provenance line may confuse a reader expecting one.** Every other skill in `skills/hamilton-wayfinder-*` carries a provenance line pointing at upstream. The root `NOTICE` carries the repo-level attribution, but a reader who opens only the skill directory sees no upstream credit. Accepted because the skill is genuinely original — a provenance line would overstate the debt. The root `NOTICE` is the correct home for repo-level attribution, and the skill's `NOTICE` follows the root's pattern.
- **The skill assumes `hamilton setup` has been run.** If the templates are missing, the skill points at paths that do not exist. Accepted because every Hamilton skill makes the same assumption, and ticket 05 documented the dependency rather than guarding it.

## Migration / Rollout

None. One new directory under `skills/`; nothing existing changes. The only other edit is unit 6's status line in `route.md`.

## Open Questions

None. The eight backing tickets fix every decision; the three open choices the route named are decided above.
