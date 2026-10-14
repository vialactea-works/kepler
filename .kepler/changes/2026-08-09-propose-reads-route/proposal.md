# Proposal: Teach propose to read a route

| Field   | Value                              |
|---------|------------------------------------|
| Change  | 2026-08-09-propose-reads-route     |
| Status  | approved                           |
| Author  | agent (hamilton-propose)           |
| Created | 2026-08-09                         |

## Why

When a wayfinder route clears and its units enter the SDD loop, the human has to feed `hamilton-propose` the unit's goal and backing decisions manually — pasting context that already lives in `route.md` and its linked tickets. That is exactly the friction [ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) identified: propose should gain map-aware entrypoint logic so that, pointed at a map folder, it reads `route.md`, finds the next `pending` unit, and navigates that unit's decision links to pull full context before its normal dialogue begins. Everything after the entrypoint is unchanged — the collaborative spec negotiation, the gate, the artifacts all stay as they are.

## Goals & Success Criteria

- When pointed at a `.hamilton/maps/<effort>/` folder containing a `route.md`, propose detects the map, reads `route.md`, and identifies the next unit whose status is `pending`.
- Propose navigates that unit's backing decision links into `tickets/` and reads them, so the full context feeds step 3's context exploration.
- The change title derives from the next pending unit's slug rather than a free-form request.
- Propose reads `route.md` from the branch the session started on — the working tree's copy — and never reaches for the default branch's copy, per [ticket 13](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md).
- Steps 4–10 of propose's process are untouched — the addition is purely at the entrypoint (steps 1 and 3).
- `bun run build` and `bun --bun vitest run` stay green.

## Non-Goals

- **No changes to steps 4–10.** The collaborative dialogue, approach choice, design, self-review, and approval loop are unchanged.
- **No changes to any other skill.** `hamilton-wayfinder`, `hamilton-plan`, `hamilton-review`, and `hamilton-finish-work` are not touched.
- **No test coverage.** `skills/` is not bundled, `hamilton setup` never installs it, and no test asserts on skill content — same ruling as the grilling refactor (unit 7) and every other skill-authoring unit in this route.
- **No CLI or template changes.** The change touches only `skills/hamilton-propose/SKILL.md`.
- **No canonical spec for propose.** No `.hamilton/specs/propose.md` exists today; the requirements delta is the first formal tracking, matching the unit-7 precedent.

## Proposed Change

One skill file is edited; no files are added or deleted.

**`skills/hamilton-propose/SKILL.md`** — two step-level additions, both additive:

- **Step 1 (Derive the title, ensure an isolated workspace):** before the existing title-derivation logic, a map-folder detection branch: if the request points at a `.hamilton/maps/<effort>/` folder that contains a `route.md`, read `route.md` from the working tree (the branch the session started on), scan the units in order for the first whose `Status:` line reads `pending`, and derive the change title from that unit's slug. If no unit is pending, stop and tell the user. If the request does not point at a map folder, step 1 works exactly as it does today. The worktree-creation and isolation-verification logic that follows is unchanged.
- **Step 3 (Explore context, read-only):** when step 1 detected a map folder, the context exploration extends to navigate the next pending unit's backing decision links — the `Backed by:` tickets listed in its route entry — reading each linked `tickets/NN-slug.md` to pull the full decision context. This feeds the same step-3 exploration that already reads specs, docs, and recent commits. When no map folder was detected, step 3 works exactly as it does today.

## Capabilities

### New

None.

### Modified

- `propose`: gains map-aware entrypoint logic — when pointed at a map folder, reads `route.md` from the current branch, finds the next `pending` unit, navigates its decision links for context, and derives the title from the unit's slug. Steps 4–10 unchanged.

### Removed

None.

## Impact

One `SKILL.md` file is edited. No code, no CLI, no templates, no tests. `bun run build` type-checks TypeScript (unaffected); `bun --bun vitest run` covers bundled templates and guidelines (unaffected). The change is verified by reading the edited steps end-to-end, not by automated tests — consistent with every skill-authoring unit in this route.

## Open Questions

None. [Ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) fixes the behaviour (propose reads the folder, finds `route.md`, identifies the next pending unit, navigates decision links) and the gate (propose is required, no straight-to-plan path). [Ticket 13](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md) fixes the branching rule (propose reads `route.md` from the branch the session started on, never the default branch's copy). The entrypoint landing points (steps 1 and 3) were identified during context loading.
