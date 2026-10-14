# Proposal: Port the three wayfinder siblings

| Field   | Value                                   |
|---------|-----------------------------------------|
| Change  | 2026-08-07-port-wayfinder-siblings      |
| Status  | draft                                   |
| Author  | Caio Ferreira (with Claude)             |
| Created | 2026-08-07                              |

## Why

Wayfinder's ticket types are promises about how a ticket gets resolved: a `research` ticket delegates to a background investigation, a `prototype` ticket to throwaway code built to answer one design question, a `grilling` ticket to live dialogue that sharpens the effort's vocabulary as it goes. Upstream backs each of those promises with a skill. Hamilton has none of them, so unit 6 would author `hamilton-wayfinder` with three of its four ticket types pointing at nothing.

The ports are not lift-and-shift. Both upstream skills that write artifacts assume a home Hamilton does not have — `research` saves findings "where the repo already keeps such notes" and names no fallback, `prototype` hangs a context pointer on an issue in a tracker Hamilton deliberately does not use, and `domain-modeling` maintains a whole parallel durable-truth system at root `CONTEXT.md` plus numbered `docs/adr/`, sitting directly across from `.hamilton/specs/`. Each has to be re-homed onto a file path under the map before the skill is coherent inside Hamilton.

## Goals & Success Criteria

- `skills/hamilton-wayfinder-research/`, `skills/hamilton-wayfinder-prototype/` and `skills/hamilton-wayfinder-domain-modeling/` each exist, each holding a `SKILL.md`, its reference files, and its own sibling `NOTICE`.
- Every instruction line outside the adaptation surface is byte-identical to upstream. A reader diffing a ported file against its upstream original sees changes only where the route's surface allows them — frontmatter, naming, invocation mode, the provenance line, and re-homed paths, the last covering both where an artifact is written and where a skill's own reference material sits.
- Each skill is model-invoked, so `hamilton-wayfinder` can reach it by name in unit 6.
- No ported skill names an issue tracker, or leaves an artifact's home to "wherever the repo keeps such notes". Every artifact resolves to a path under `.hamilton/maps/<effort>/` or to a section of a ticket file.
- `domain-modeling` writes no file outside the map: no root `CONTEXT.md`, no `docs/adr/`.
- Route unit 5 reads `Status: shipped`.

## Non-Goals

- **Authoring `hamilton-wayfinder` itself.** Unit 6 owns the skill that invokes these three; this unit only makes them exist and reachable.
- **Improving upstream prose.** The verbatim rule governs the whole body. Where upstream's own wording is weak, it is noted for a later effort rather than fixed here.
- **Trimming any branch.** `prototype`'s full `UI.md` and `domain-modeling`'s full `CONTEXT-FORMAT.md` and `ADR-FORMAT.md` all ship, per ticket 07's "starting with the complete toolkit".
- **Adding a fifth ticket type.** Domain-modeling is a supporting skill that runs inside a grilling session; the four types are unchanged.
- **Porting the `agents/openai.yaml` sidecars.** Host packaging metadata does not travel with a forked skill — the boundary unit 4 already set.
- **Touching the root `NOTICE` or `CONTRIBUTING.md`.** Unit 2 landed both, and the root notice is deliberately written per upstream project rather than per skill directory, so it is already true of these three.
- **Creating any glossary or research content.** This unit fixes where those artifacts live; it writes none of them.

## Proposed Change

Three new skill directories under `skills/`, each a fork of an upstream `mattpocock/skills` sibling, adapted only where Hamilton's world differs from upstream's.

**`hamilton-wayfinder-research`** — twelve lines, and the lightest port. It spins up a background agent to investigate a question against primary sources and write cited findings to a single Markdown file. The one adaptation is that file's home: `.hamilton/maps/<effort>/research/`, replacing upstream's "wherever the repo already keeps such notes".

**`hamilton-wayfinder-prototype`** — the router plus both branch guides, `LOGIC.md` for "does this state model feel right" and `UI.md` for "what should this look like". The one adaptation is where the finished prototype is captured: the context pointer to the throwaway branch moves from an issue comment to the ticket's body, and the verdict lands in the ticket's `## Answer`.

**`hamilton-wayfinder-domain-modeling`** — the session discipline plus `CONTEXT-FORMAT.md` and `ADR-FORMAT.md`. This is where the real adaptation sits. Upstream's two durable artifacts both re-home onto artifacts Hamilton already has: the glossary moves from a root `CONTEXT.md` to `.hamilton/maps/<effort>/glossary.md`, and a decision that clears upstream's three-part bar is recorded in the resolving ticket's `## Answer` rather than in a numbered file under `docs/adr/`. Both format guides ship whole; what changes is the destination their output is written to, not the shape of it.

All three are model-invoked, which is what lets `hamilton-wayfinder` invoke them by name in unit 6. The `hamilton-wayfinder-*` prefix groups them as wayfinder's internals rather than pipeline steps.

## Capabilities

### New

- `ticket-resolution`: the procedures a wayfinder decision ticket is resolved by — what each one investigates or builds, and where the artifact it produces comes to rest.

### Modified

None. The sibling `NOTICE` each directory ships is already required by `licensing`'s standing invariant, so this change complies with that capability rather than altering it.

### Removed

None.

## Impact

Three new directories under `skills/`, and one status line in `route.md`. Nothing existing is modified: no current skill invokes these, and `skills/` is not bundled or asserted on by any test, so nothing downstream breaks.

The visible ongoing cost is context load. Model-invocation means three descriptions sit in the window every turn, and because the descriptions are upstream's verbatim, they carry upstream's general trigger phrasing — so these skills can fire on a request that has nothing to do with wayfinder. That is a knowing relaxation of ticket 07's "not standalone, not discoverable elsewhere", taken because the verbatim rule governs the description too, and because unit 6 cannot reach a user-invoked skill at all. The prefix alone carries the internality.

Unit 6 inherits three names it can invoke, and inherits the artifact homes fixed here.

## Open Questions

None. Ticket 07 fixed the skill set, their names, their coupling, and each artifact's home; ticket 03 fixed the attribution form; the two choices route unit 5 left open — invocation mode and how the prefix is handled — are settled in `design.md`.
