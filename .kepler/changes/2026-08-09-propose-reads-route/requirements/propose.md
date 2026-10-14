# Capability: propose

The skill that turns an idea into a change's proposal, requirements, and design through collaborative dialogue — the heavyweight front door of Hamilton's spec-driven pipeline.

## ADDED Requirements

### Requirement: Map-folder detection at the entrypoint

The proposing skill SHALL detect when its input request points at a `.hamilton/maps/<effort>/` folder containing a `route.md`, and enter a map-aware mode that reads the route before deriving the change title.

- Priority: must
- Rationale: when a wayfinder route clears, its units enter the SDD loop one at a time. The human points propose at the map folder rather than pasting the unit's context manually. Detection is the trigger that separates map-aware mode from the existing free-form request flow — [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md).

#### Scenario: Request points at a map folder

- WHEN the request references a path under `.hamilton/maps/<effort>/` and that folder contains a `route.md`
- THEN the skill enters map-aware mode and reads `route.md` before deriving the title

#### Scenario: Request does not point at a map folder

- WHEN the request does not reference a map folder, or the referenced folder has no `route.md`
- THEN the skill proceeds with its existing free-form request flow unchanged

### Requirement: Route read from the session's starting branch

The proposing skill SHALL read `route.md` from the working tree — the branch the session started on — and SHALL NOT reach for the default branch's copy via `git show`, `git checkout`, or any equivalent.

- Priority: must
- Rationale: [ticket 13](../../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md) settled that propose reads `route.md` from the branch it was started on. Carving out an exception to reach the default branch would break the worktree gate that step 1 exists to enforce — the one artifact allowed to escape the worktree would be the one tracking whether the worktree's work is done.

#### Scenario: Reading route.md

- WHEN the skill reads `route.md` in map-aware mode
- THEN it reads the file from the working tree on the current branch
- AND it does not invoke any git command that fetches the file from another branch

### Requirement: Next pending unit identified from the route

The proposing skill SHALL scan the units listed in `route.md` in order and identify the first whose `Status:` line reads `pending`. The change title SHALL be derived from that unit's slug rather than a free-form request.

- Priority: must
- Rationale: the route lists change-sized units in order with per-unit status. The next pending unit is the one propose should work on — its slug is the change's identity, not a paraphrase. This is what makes propose's output traceable back to the route.

#### Scenario: A pending unit exists

- WHEN `route.md` contains at least one unit with `Status: pending`
- THEN the skill selects the first such unit in order and derives the change title from its slug

#### Scenario: No pending unit exists

- WHEN `route.md` contains no unit with `Status: pending`
- THEN the skill stops and tells the user that every unit is already in-progress or shipped

### Requirement: Decision links navigated for context

The proposing skill SHALL navigate the selected unit's backing decision links — the tickets listed in its `Backed by:` line — reading each linked `tickets/NN-slug.md` to pull full decision context, and SHALL feed that context into step 3's existing context exploration alongside specs, docs, and recent commits.

- Priority: must
- Rationale: the route points at decisions; it does not restate them. Reading the backing tickets is how propose gets the full specification — the goal paragraph in the route is orientation, not specification. [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) and the [route preamble](../../../maps/hamilton-wayfinder/route.md) both state this.

#### Scenario: Unit has backing tickets

- WHEN the selected unit's `Backed by:` line lists one or more ticket links
- THEN the skill reads each linked ticket file and incorporates the decisions into its context exploration

#### Scenario: Unit has no backing tickets

- WHEN the selected unit's `Backed by:` line is empty or absent
- THEN the skill proceeds with context exploration using the route entry's goal paragraph alone

### Requirement: Steps 4–10 unchanged

The proposing skill SHALL NOT modify steps 4 through 10 of its process when in map-aware mode. The collaborative dialogue, approach choice, design, self-review, and approval loop SHALL proceed exactly as they do in free-form mode.

- Priority: must
- Rationale: [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) is explicit — "the rest of propose's workflow (collaborative spec negotiation) stays the same." The change is entrypoint-only; everything after the entrypoint is untouched.

#### Scenario: Map-aware mode reaches step 4

- WHEN the skill is in map-aware mode and has completed step 3 (context exploration)
- THEN steps 4 through 10 proceed identically to free-form mode

## MODIFIED Requirements

None. No canonical spec exists for the `propose` capability; the requirements above are the first formal tracking of the map-aware entrypoint behaviour, matching the unit-7 precedent where the dialogue-delegation requirements were also first-time tracking.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
