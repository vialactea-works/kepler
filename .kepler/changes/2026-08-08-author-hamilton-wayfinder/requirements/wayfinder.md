# Capability: wayfinder

## ADDED

### Overview

The methodology for charting a map of decision tickets and working them one at a time until the way to the destination is clear. A map is a third kind of artifact under `.hamilton/maps/<effort>/` — alongside `specs/` and `changes/` — that spans several changes and outlives all of them. The skill has two branches: charting a new map from a loose idea, and working an existing map's tickets to resolution. When every ticket is resolved, the map clears and a `route.md` is written as a static handoff to the SDD loop.

### Requirements

**SHALL** chart a map from a loose idea that is too big for one agent session, by naming the destination, mapping the frontier breadth-first, creating the map file from the template at `~/.hamilton/templates/wayfinder/map.md`, and creating the tickets that can be specified now from `~/.hamilton/templates/wayfinder/ticket.md`.

- WHEN the user arrives with a loose idea too big for one session, the skill SHALL run a grilling session to name the destination — what reaching the end of the map looks like.
- WHEN the destination is named, the skill SHALL grill breadth-first across the whole space, surfacing open decisions and first takeable steps.
- WHEN breadth-first grilling surfaces no fog — the way is already clear for one session — the skill SHALL stop and tell the user a map is not needed.
- WHEN fog is surfaced, the skill SHALL create the map at `.hamilton/maps/<effort>/map.md` using the installed template, with Destination and Notes filled in, Decisions so far empty, and the fog sketched into Not yet specified.
- WHEN the map is created, the skill SHALL create the tickets that can be specified now as `tickets/NN-slug.md` files using the installed ticket template, then wire `blocked_by` frontmatter in a second pass.
- WHEN research tickets are created during charting, the skill SHALL fire `hamilton-wayfinder-research` subagents to resolve them in parallel.
- Charting SHALL be one session's work and SHALL resolve no tickets itself.

**SHALL** work through an existing map by loading the map, choosing the next frontier ticket, claiming it, resolving it with the skill its type delegates to, recording the answer, and graduating any fog the resolution makes specifiable.

- WHEN the user invokes with an existing map, the skill SHALL load the map's low-resolution view.
- WHEN no ticket is named, the skill SHALL take the first frontier ticket in order — the first open, unblocked, unclaimed ticket.
- WHEN a ticket is chosen, the skill SHALL set its status to `claimed` before any work.
- WHEN the ticket's type is `research`, the skill SHALL delegate to `hamilton-wayfinder-research`.
- WHEN the ticket's type is `prototype`, the skill SHALL delegate to `hamilton-wayfinder-prototype`.
- WHEN the ticket's type is `grilling`, the skill SHALL run `hamilton-grilling` and `hamilton-wayfinder-domain-modeling`.
- WHEN the ticket's type is `task`, the skill SHALL drive it alone where it can, or hand the human a precise checklist.
- WHEN a ticket is resolved, the skill SHALL append the answer under `## Answer` in the ticket file, flip the ticket's status to `resolved`, and append a one-line gist to the map's Decisions so far with a link to the ticket.
- WHEN a resolution makes new tickets specifiable, the skill SHALL create them and clear the graduated fog from Not yet specified.
- WHEN a resolution reveals a ticket sits beyond the destination, the skill SHALL close it and leave one line in Out of scope.
- The skill SHALL resolve at most one ticket per session, with the exception of research tickets.

**SHALL** carry one `## Map mechanics` section that is genuinely isolated from the rest of the skill body, documenting the file-native contract so a future tracker backend can swap the implementation without changing the rest of the skill.

- The `## Map mechanics` section SHALL document the YAML frontmatter fields (`type`, `status`, `blocked_by`), their valid values (tickets: `open`/`claimed`/`resolved`; maps: `open`/`cleared`/`shipping`/`shipped`), and the file layout convention.
- The `## Map mechanics` section SHALL state that map artifacts are ordinary repo content, versioned and branched like source, and that status flips ride the unit's own branch and land on the default branch at merge (per ticket 13).
- The `## Map mechanics` section SHALL document claiming as a signal of intent that does not affect frontier calculation.
- The rest of the skill body SHALL refer to concepts (tickets, frontier, claiming, resolving) without depending on the specific mechanics, so the section is swappable.

**SHALL** be user-invoked (`disable-model-invocation: true`), because no other skill needs to reach it and the description costs zero context load.

- The skill SHALL omit a model-facing description with trigger phrasing; the `description` field SHALL be a human-facing one-line summary.
- The skill SHALL reach the four model-invoked siblings (`hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-wayfinder-domain-modeling`, `hamilton-grilling`) by name, which is possible because they are all model-invoked.

**SHALL** keep all four ticket types with the strict HITL rule for planning.

- A HITL ticket SHALL resolve only through live exchange with a human; the agent SHALL NEVER stand in for the human's side of a planning dialogue.
- Hamilton's three-tier attendance model ("Always / Ask first / Never") SHALL apply to SDD execution, not to wayfinder's planning phase.

**SHALL** carry a sibling `NOTICE` stating original authorship under Apache 2.0, not the adaptation pattern used by ported skills.

- The `NOTICE` SHALL state `Copyright 2026 Caio Ferreira` and the Apache 2.0 license.
- The `NOTICE` SHALL NOT use the "adapted from" language, because the skill is written from scratch.
- The `SKILL.md` SHALL NOT carry a provenance line, because the skill is not adapted from upstream text.

**SHALL** reference the templates at `~/.hamilton/templates/wayfinder/` for format details rather than reproducing them inline.

- WHEN the skill creates a map, it SHALL point at the installed `map.md` template.
- WHEN the skill creates a ticket, it SHALL point at the installed `ticket.md` template.
- WHEN the map clears, the skill SHALL point at the installed `route.md` template.

### Invariants

- The skill MUST be user-invoked (`disable-model-invocation: true`). No other skill needs to reach wayfinder; a model-invoked description would add per-turn context load for a skill that fires only when a person chooses to start planning.
- The `## Map mechanics` section MUST be the only place in the skill body where file-native mechanics (frontmatter fields, file layout, claiming, branching) are defined. The rest of the body MUST refer to concepts without depending on the specific mechanics, so the section is genuinely swappable.
- The skill MUST NEVER reproduce format details that the templates at `~/.hamilton/templates/wayfinder/` already define. It points at the templates; it does not inline them.
- The skill MUST NEVER resolve more than one ticket per session, with the exception of research tickets.
- A HITL ticket MUST NEVER resolve without live human exchange. The agent MUST NEVER answer its own questions during a planning dialogue.
- The skill MUST reach the four ported siblings by name. If a sibling is not reachable (user-invoked or missing), the ticket type that delegates to it is a promise that cannot be kept.
- The `NOTICE` MUST state original authorship under Apache 2.0 and MUST NOT use the "adapted from" pattern, because the skill text is original.
- The `SKILL.md` MUST NOT carry a provenance line, because the skill is not adapted from upstream text.

### Decisions

- **User-invoked, matching upstream.** No other skill needs to reach wayfinder — it is the pre-SDD entry point, always initiated by a person choosing to start planning. A model-invoked description would add per-turn context load for a long skill that fires rarely. The ported siblings are all model-invoked, so wayfinder reaches them regardless of its own mode.
- **No `references/` directory.** The skill keeps all material in the body. For a user-invoked skill, the body loads only when the skill fires — body length is not a per-turn cost. The two branches (chart, work) share so much conceptual foundation that splitting them into references would create more load, not less. The templates at `~/.hamilton/templates/wayfinder/` are the external reference for format details.
- **`## Map mechanics` isolated in the body, not in `references/`.** The section is needed every run (the agent reads frontmatter to scan the frontier), so disclosing it behind a context pointer would add load for no gain. The heading itself is the isolation boundary: a future backend swaps the section under that heading without touching the rest. Physical isolation (a separate file) is unnecessary when structural isolation (a clearly bounded section) is real.
- **Original `NOTICE`, no provenance line.** The skill is written from scratch — the text is original, the methodology is adapted. Ideas are not copyrightable; the MIT license does not require attribution for a from-skill implementation. The root `NOTICE` already carries the repo-level upstream attribution. The per-skill `NOTICE` follows the root's own copyright pattern rather than the ported siblings' adaptation pattern.
