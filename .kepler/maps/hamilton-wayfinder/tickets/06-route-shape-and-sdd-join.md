---
type: grilling
status: resolved
blocked_by: [01]
---

# route.md shape and the SDD join

## Question

What exactly does `route.md` contain, and how does a unit in it become a change in the SDD loop?

Charting settled that a cleared map produces a route of change-sized units, each linking the
decisions that back it, and that wayfinder does **not** scaffold change directories itself. The
contract's content is still open.

Settle:

- **What a "change-sized unit" is.** Hamilton's `hamilton-plan` already decomposes into TDD-sized
  tasks, so a route unit must be coarser than a task. Is it "one thing that runs the whole
  propose→finish loop"? What makes a unit too big, and what does an agent do when it finds one?
- **The fields per unit.** Name, one-line goal, backing decision links, ordering or dependency
  between units, suggested entry point (`hamilton-propose` for a unit that warrants a spec versus
  straight to `hamilton-plan` for a tactical one)?
- **How decisions travel.** A unit's implementer needs the decisions behind it. Do they read the
  linked tickets, or does the route restate the binding constraints inline? The map is an index and
  never restates decisions — does `route.md` inherit that rule, or is it the one place that breaks
  it, since it is read by someone who never saw the map?
- **When it is written.** At the end as a closing act, or grown incrementally as units become
  visible?
- **What happens after.** Does the route track which units have shipped, and is that how the map
  reaches its destination? Does a finished route mean the map can be deleted?

## Answer

**`route.md` is a static handoff document written once at map close, listing change-sized units in order with dependencies. Each unit carries name, goal (paragraph), decision links, ordering/dependencies between units, and suggested entry point (propose or straight to plan). Implementers follow decision links to the map; route.md does not restate. Route.md tracks unit completion status as implementation proceeds. Map status transitions: `cleared` (route written) → `shipping` (units in SDD loop) → `shipped` (all units complete).**

### Change-sized units

A unit is one thing that runs the propose→finish loop once. It's shaped by what one agent can hold in context in one change—roughly "one feature or one fix". Splits that make units smaller happen during wayfinding before route.md is written, not during implementation.

### Unit fields

Each unit in route.md contains:
- **Name** — the unit's slug (change identifier)
- **Goal** — a paragraph explaining what ships and why (not collapsed to one line so key context survives)
- **Linked decisions** — which tickets from the map back this unit
- **Ordering/dependencies** — which other units must ship before this one
- **Suggested entry** — `hamilton-propose` (warrants a spec debate) or straight to `hamilton-plan` (tactical, decision clear)

### Decision travel

The implementer reads decision links and navigates to the map's tickets. Route.md is an index like the map itself—it points, does not restate. This keeps the source-of-truth in one place (the ticket) and makes route.md lightweight.

### Writing and lifecycle

Route.md is written once, as a closing act after all tickets are resolved. It is not grown incrementally. Once written, the map transitions from `cleared` to `shipping` to mark that units are flowing through the SDD loop. Route.md gains a **status** field per unit (e.g., `pending`, `in-progress`, `shipped`) so it tracks which units have been implemented. When all units are done, the map transitions to `shipped` and reaches its destination.

### Knock-on effects

The route.md template in `bundle/templates/wayfinder/` gains a unit structure. Tests and docs (CONTRIBUTING.md) need updates to reflect the unit shape and the three-status progression (`cleared` / `shipping` / `shipped`). These ride in the route unit, not as separate tickets.
