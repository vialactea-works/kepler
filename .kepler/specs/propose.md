# Capability: propose

## Overview

The heavyweight front door of Hamilton's spec-driven pipeline. It turns a change request into the proposal, requirements, and design artifacts through collaborative dialogue — interviewing toward the decisions that shape the change, then writing the artifacts that carry it into planning. It accepts two input shapes: a free-form request, or — when pointed at a wayfinder map folder — a map-aware entrypoint that reads the compiled route, finds the next pending unit from frontmatter, and uses the synthesized destination and path as current context before optional ticket drill-down. Everything after the entrypoint is the same process in both modes: the dialogue, the approach choice, the design, the self-review, and the approval gate all run unchanged. This capability owns entrypoint detection and route context loading; it defers to `dialogue` for how questions are asked and to `wayfinder` for what a route is.

## Contract

### Input shapes

The skill takes a single request, whose shape selects the entrypoint mode:

| request shape | entrypoint mode |
| --- | --- |
| a free-form change request | free-form mode; the title is derived from the request |
| a path under `.hamilton/maps/<effort>/` whose folder contains a `route.md` | map-aware mode; the title is derived from the next pending unit's name in route frontmatter |

### Route format the entrypoint reads

In map-aware mode the skill reads the route's public format — the same shape the `wayfinder` route template fixes — and nothing beyond it:

| route element | what the skill does with it |
| --- | --- |
| `units` frontmatter list | scans in order for the first unit whose `status` is `pending`; uses its `name` for the change title, verifies its `depends_on` units are shipped and reachable, and preserves the unit's identity for `route_unit` provenance |
| synthesized route body | reads Point of departure, Destination, Path chosen, Shipping rules, and Units as the primary current context |
| selected unit body | reads its destination contribution, goal, observable completion outcome, and binding constraints before drafting artifacts |
| selected unit's `backed_by` frontmatter links | optional drill-down evidence for deeper reasoning or rejected alternatives; not the source from which the destination must be reconstructed |

## Behavior

In free-form mode the skill derives a change title from the request and proceeds into context exploration and dialogue exactly as it always has.

In map-aware mode the skill reads `route.md` from the working tree — the branch the session started on — and scans the `units` frontmatter list in order for the first whose `status` is `pending`. That unit's name becomes the change title; before entering it, the skill verifies each `depends_on` unit is `shipped` and its work is reachable from the base branch. If a dependency is finished but unmerged, it stops and asks the user whether to merge it or deliberately branch from its branch. If no unit is pending — every unit is `in-progress` or `shipped` — the skill stops and tells the user the route has no next unit, rather than picking an already-active unit or silently falling back to free-form mode.

After selecting the unit, map-aware context loading reads the synthesized route body first. Destination and Path chosen are primary committed context, followed by the selected unit's destination contribution, goal, observable completion outcome, and binding constraints. The unit's `backed_by` tickets are deliberate drill-down evidence when deeper reasoning or rejected alternatives need inspection; they are not mandatory reconstruction of usable context. A missing `backed_by` entry does not prevent proposal work when the route body supplies the needed context.

The selected unit's frontmatter status is flipped to `in-progress` in the isolated worktree, and the map status is flipped to `shipping` when appropriate. The proposal frontmatter records the route path and unit number in `route_unit`. The proposal remains responsible for converting that one route unit into concrete why/what/how artifacts; the route commits destination and path decisions but does not replace proposal, design, or planning. Clarifying dialogue concentrates on implementation-facing choices and returns to Wayfinder only when it identifies a contradiction that prevents satisfying the committed route.

After the entrypoint, the two modes are indistinguishable. The collaborative dialogue, the approach choice, the design, the self-review, and the approval gate proceed identically regardless of how the change was entered; map-aware mode adds only the front context pull and then merges back into the single process flow.

**Examples**

- request points at `.hamilton/maps/<effort>/` containing a `route.md` -> map-aware mode; frontmatter selects the first pending unit, the synthesized body supplies primary context, and `route_unit` records provenance
- request points at a map folder but every unit is `in-progress` or `shipped` -> the skill stops and tells the user the route has no next unit
- selected unit has no `backed_by` entry -> context exploration uses the synthesized route body and unit body alone
- request does not reference a map folder, or the referenced folder has no `route.md` -> free-form mode; the title is derived from the request
- map-aware mode completes its context pull -> the dialogue, design, self-review, and approval gate run identically to free-form mode

## Invariants

- In map-aware mode, `route.md` MUST be read from the working tree on the session's starting branch — the worktree created for the change is based off that branch, so the working tree's copy is the session's copy. The skill MUST NEVER reach for the default branch's copy of the route.
- The `units` frontmatter list MUST drive selection: the first unit whose `status` is `pending` is selected, and every selected dependency MUST be `shipped` with work reachable from the base branch.
- The route body MUST be read as primary current context before optional `backed_by` drill-down.
- The selected unit's destination contribution, goal, observable completion outcome, and binding constraints MUST be read before drafting.
- The selected unit's route path and number MUST be preserved as `route_unit` provenance in proposal artifacts.
- After the entrypoint, the process MUST proceed identically in both modes. The map-aware addition is a front branch only; it adds no step, artifact, or gate beyond what free-form mode runs.

## Decisions

- **Map-aware mode is a conditional branch, not a second process flow.** The two input shapes share one dialogue, one design, and one approval gate; map-aware mode adds route context before they merge into the existing process.
- **Frontmatter owns lifecycle and selection metadata.** Unit identity, status, dependencies, and backing ticket paths are read from route frontmatter, while the body carries the synthesized destination and path. This preserves lifecycle updates without rewriting current route reasoning.
- **Destination-first context protects the route boundary.** Propose reads the route's compiled destination and chosen path before optional evidence, so tickets provide depth without forcing proposal to reconstruct committed decisions from historical answers.
- **Propose owns artifact conversion.** The route is a destination-and-path handoff. Propose still turns one selected unit into concrete why/what/how artifacts and asks only implementation-facing questions unless it finds a contradiction that must return to Wayfinder.
