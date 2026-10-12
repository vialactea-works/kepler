# Design: Teach propose to read a route

## Context

`hamilton-wayfinder` shipped in unit 6. When a map clears, it writes a `route.md` that lists change-sized units in order, each with a status (`pending` → `in-progress` → `shipped`), dependencies, and backing decision links. Each unit is meant to run the SDD loop once — propose, plan, code, review, finish-work.

Today, `hamilton-propose` has no awareness of routes. The human pastes the unit's goal and ticket context into the request manually. [Ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) fixes the behaviour: the human points propose at a map folder; propose reads `route.md`, finds the next `pending` unit, navigates its decision links, then proceeds into its normal workflow. [Ticket 13](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md) fixes the branching rule: propose reads `route.md` from the branch the session started on — never the default branch's copy — which keeps the worktree gate intact.

The propose skill's process has ten steps. The context-loading task identified two landing points: step 1 (derive title, ensure isolated workspace) is where map-folder detection and title derivation land; step 3 (explore context, read-only) is where route reading and decision-link navigation land. Steps 4–10 stay untouched.

## Goals / Non-Goals

**Goals**

- Add map-folder detection to step 1: if the request points at `.hamilton/maps/<effort>/` with a `route.md`, enter map-aware mode.
- In map-aware mode, read `route.md` from the working tree, find the first `pending` unit, derive the title from its slug.
- Extend step 3 to navigate the selected unit's `Backed by:` decision links and read the linked tickets.
- Keep the branching rule: never reach for the default branch's copy of `route.md`.

**Non-Goals**

- Modify steps 4–10 — the dialogue, design, self-review, and approval loop are unchanged.
- Modify any other skill — wayfinder, plan, review, finish-work are not touched.
- Add tests — `skills/` is not bundled and no test asserts on skill content.
- Create a canonical spec for propose — the requirements delta is the first formal tracking.

## Decisions

### Decision: Detection and title derivation in step 1, context navigation in step 3

- Choice: map-folder detection and title derivation land in step 1 (where the title is already derived); route reading and decision-link navigation land in step 3 (where context is already explored). This keeps each addition at the step that already owns that concern.
- Alternatives considered: (1) a new step 0 before step 1 that handles all map-aware logic — rejected because it shifts every step number downstream, which is a large diff for a small change and breaks every cross-reference to "step 4", "step 7", etc. in the existing skill and in the unit-7 requirements. (2) A single monolithic addition to step 1 that does detection, route reading, and link navigation — rejected because step 3 already exists for context exploration; doing context work in step 1 would give step 1 two responsibilities (workspace isolation + context gathering), violating the single-responsibility principle the skill's own code-quality reference enforces.
- Rationale: each step keeps one responsibility. Step 1 owns the title and the workspace; step 3 owns context. The additions extend each step's existing responsibility rather than introducing a new one.

### Decision: Map-aware mode is a branch, not a separate flow

- Choice: step 1 gains a conditional branch — "if the request points at a map folder, do X; otherwise, proceed as today." Step 3 gains the same conditional — "if in map-aware mode, also read the backing tickets; otherwise, proceed as today." The condition is stated once in step 1 and carried forward; step 3 checks it.
- Alternatives considered: (1) two completely separate process flows (map-aware vs. free-form) — rejected because steps 4–10 are identical in both modes, so duplicating them would be a DRY violation. (2) A parameterized step template — over-engineering for a skill document, which is prose, not code.
- Rationale: the addition is a front-branch that merges back into the existing flow at step 4. Keeping it as a conditional inside the existing steps preserves the single process flow and makes the "everything after the entrypoint is unchanged" guarantee visible in the text.

### Decision: Route read from the working tree, not via git

- Choice: the skill reads `route.md` using the Read tool on the file in the working tree. No `git show <default-branch>:...`, no `git checkout <default-branch> -- ...`, no branch switching.
- Alternatives considered: explicitly fetch the default branch's copy to get the "latest" route — rejected by [ticket 13](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md), which rules that propose reads from the branch it was started on. The worktree created in step 1 is based off the current branch, so `route.md` in the worktree is the same copy that was on the session's starting branch.
- Rationale: the working tree is the branch the session started on (or a worktree based off it). Reading the file directly is the simplest correct behaviour and never reaches for another branch. The skill instruction states this as a SHALL NOT so a future editor cannot accidentally introduce a `git show` call.

### Decision: Unit status scanned from the `Status:` line

- Choice: the skill scans each `### N.` unit heading's `Status:` line in `route.md` for the first `pending`. The route format (fixed by the template and the worked example this file is) uses `Status: pending` / `Status: in-progress` / `Status: shipped` on its own line under each unit heading.
- Alternatives considered: parse YAML frontmatter per unit — rejected because the route template uses plain-text `Status:` lines, not frontmatter, for per-unit status. The map's own frontmatter is for the map, not for individual units.
- Rationale: matching the actual format of `route.md` — not a hypothetical format — keeps the skill honest. The route template at `bundle/templates/wayfinder/route.md` confirms the shape.

### Decision: Edge case — no pending unit

- Choice: if no unit in `route.md` has `Status: pending`, the skill stops and tells the user. It does not pick an `in-progress` or `shipped` unit, and it does not fall through to free-form mode silently.
- Alternatives considered: fall back to free-form mode — rejected because the human explicitly pointed at a map folder; silently ignoring that signal would be confusing. Pick the last `in-progress` unit — rejected because an in-progress unit already has a session; propose would be duplicating work.
- Rationale: a clear stop with a message is the honest behaviour. The human can then check whether the route is complete or whether a unit is stuck in-progress.

## Architecture & Components

One file is edited; no new files, no new dependencies.

| Component | Responsibility | Change |
|-----------|---------------|--------|
| `skills/hamilton-propose/SKILL.md` | The proposing skill | Step 1: add map-folder detection branch (read `route.md` from working tree, find next `pending` unit, derive title from slug). Step 3: extend context exploration to navigate the unit's `Backed by:` decision links. Steps 4–10: unchanged. |

### Quality Lens

| Principle | Verdict | Notes |
|-----------|---------|-------|
| Single responsibility | ✅ | Step 1 keeps workspace + title; step 3 keeps context. Each addition extends the step's existing responsibility. |
| DRY / single source of truth | ✅ | No process flow duplication — map-aware mode is a conditional branch that merges back at step 4. The route is the single source of unit truth; propose reads it, does not copy it. |
| Low coupling | ✅ | Propose depends on `route.md`'s format (the template's shape), not on wayfinder's internals. The `Status:` line and `Backed by:` links are the public interface. |
| Right-sized abstraction | ✅ | No new abstraction layer — a conditional branch in two existing steps. No "map-aware mode framework," just two if-blocks. |
| Open for extension | ✅ | The detection is additive: a new input type (map folder) joins the existing input type (free-form request) without modifying the free-form path. |

## Testing Strategy

No automated tests. `skills/` is not bundled, `hamilton setup` never installs it, and no test asserts on skill content — consistent with every skill-authoring unit in this route ([ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md), unit 7's precedent). Verification is by reading the edited steps end-to-end: the map-aware branch merges cleanly into the existing flow, no step reads as a non-sequitur, and the "steps 4–10 unchanged" guarantee is visible in the text.

The repo gates — `bun run build` and `bun --bun vitest run` — must stay green. They type-check TypeScript and run the vitest suite, neither of which touches `skills/`.

## Constraints & Boundaries

- Always: read `route.md` from the working tree — the branch the session started on. Never reach for the default branch's copy.
- Always: read the edited steps end-to-end after the edit — the craft focus (per the `writing-great-skills` pass later in this phase) is whether the map-aware branch reads coherently with the existing flow.
- Never: modify steps 4–10 — the entrypoint-only guarantee is the scope boundary.
- Never: modify any skill other than `hamilton-propose`.

## Risks / Trade-offs

- [Route format coupling] → Propose depends on `route.md`'s plain-text `Status:` line format. If the route template changes to YAML frontmatter per unit, the detection logic breaks. Mitigation: the template is fixed by [ticket 06](../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md) and the worked example this route file is; unit 10 (convert the map's own files to the mechanics contract) may revisit format, but that unit runs after this one and would update the detection logic in the same change. The coupling is to the public format, not to wayfinder's internals.
- [Detection ambiguity] → "Pointed at a map folder" is a natural-language trigger, not a typed parameter. The skill must infer from the request whether the human is pointing at a map. Mitigation: the detection is conservative — only triggers when the request references a path under `.hamilton/maps/` that contains a `route.md`. A free-form request that happens to mention a map path but doesn't point at it as the work target would not trigger, because the folder wouldn't contain a `route.md` unless it's a cleared map.
- [No-pending-unit edge case] → If every unit is shipped or in-progress, propose stops. This is correct behaviour, not a failure — the human needs to know the route has no next unit.
