---
type: task
status: resolved
blocked_by: [03, 04, 05, 08, 10, 12, 13]
---

# Compose route.md — the change-sized units

## Question

Nothing left to decide — write the route.

With every decision above resolved, compose `route.md` in the shape
[route.md shape and the SDD join](06-route-shape-and-sdd-join.md) settled: the change-sized units in
order, each linking the decisions that back it.

Expect units along these lines, though the resolved decisions govern:

- Author `skills/hamilton-wayfinder/SKILL.md` and whatever `references/` it needs.
- Port the sibling skills that survived [Which siblings to port](07-which-siblings-to-port.md).
- Land the artifact templates, if [Template convention](05-template-convention.md) chose templating —
  including the `tests/cli/setup.test.ts` impact.
- Sync the docs per [How the framework docs present the pre-SDD stage](10-framework-docs-presentation.md).
- Land the attribution per [Fork attribution and licensing](03-fork-attribution.md).

Before writing, re-read the map's **Not yet specified** section: several patches (worktrees, CLI
surface, existing skills' awareness) should have graduated into tickets or been ruled out by the
time this ticket is takeable. Anything still fogged here is a signal the map is not actually clear.

Closing this ticket clears the map. Each unit then runs
`hamilton-propose → plan → code → review → finish-work`.

## Answer

**[`route.md`](../route.md) is written: ten units, every one entering at `hamilton-propose`. The map
is `cleared`.**

The fog check this ticket demanded came back clean — **Not yet specified** is empty, every patch
having graduated into a decision or been ruled out of scope.

### The ten units

| # | Unit | Depends on |
|---|---|---|
| 1 | Land the glossary | — |
| 2 | Adopt Apache 2.0 and the attribution convention | — |
| 3 | Land the wayfinder artifact templates | — |
| 4 | Port `hamilton-grilling` | 2 |
| 5 | Port the three wayfinder siblings | 2 |
| 6 | Author `hamilton-wayfinder` | 2, 3, 4, 5 |
| 7 | Refactor propose and critique onto `hamilton-grilling` | 4 |
| 8 | Teach propose to read a route | 6, 7 |
| 9 | Sync the framework docs | 6 |
| 10 | Convert the map's own files to the mechanics contract | 3 |

Three units are takeable immediately and in parallel; the shape is wide at the start and narrows onto
unit 6, which is where every reference has to resolve at once.

### Where this departs from the prediction

This ticket's body predicted five units. Decisions resolved after it was written changed that, and
the resolved decisions govern:

- **Unit 4 (`hamilton-grilling`)** and **unit 7 (the propose/critique refactor)** come from
  [Which siblings to port](07-which-siblings-to-port.md) and
  [Update propose and critique to use hamilton-grilling](12-propose-and-critique-use-grilling.md),
  neither of which existed when this ticket was charted.
- **Unit 8 (propose reads a route)** is the execution half of
  [Boundary with hamilton-propose and hamilton-critique](09-boundary-with-propose-and-critique.md).
  The prediction listed no propose changes at all; there are two, and they are separate features that
  happen to share a file.
- **Unit 10 (frontmatter conversion)** discharges the "one-time conversion" consequence recorded in
  [Map mechanics in files](04-map-mechanics-in-files.md).

### The glossary unit's premise is broken, and the route says so

[Which siblings to port](07-which-siblings-to-port.md) made glossary finalization the route's first
unit: merge a working `.hamilton/maps/hamilton-wayfinder/glossary.md` into
`.hamilton/specs/glossary.md`. **That working file was never created.** No glossary exists anywhere in
the repo; `.hamilton/specs/` holds only `cli-distribution.md`.

Nothing was lost — the same ticket said hard decisions belong in ticket Answers, and that is where the
vocabulary was actually sharpened. But the unit's input is thirteen resolved tickets to harvest, not a
file to merge, and the route states that plainly rather than handing an implementer a path that does
not exist. Backfilling the intermediate file was rejected: it would be inventing planning history
after the fact.

### Two fields the decisions collapsed

- **Suggested entry.** [route.md shape and the SDD join](06-route-shape-and-sdd-join.md) gave each
  unit a propose-or-plan choice; [Boundary with propose and critique](09-boundary-with-propose-and-critique.md)
  later made propose a required gate with no straight-to-plan path. The field is therefore a constant,
  stated once in the route's preamble instead of repeated ten times.
- **Per-skill `NOTICE`.** [Fork attribution](03-fork-attribution.md) folded these into the licensing
  unit, but that unit runs before any forked skill exists. Unit 2 lands the repo-level artifacts and
  the *rule*; each skill unit lands its own `NOTICE` by following it. Same coverage, and no trailing
  unit that has to revisit five directories.

### Sequencing

Unit 1 (glossary) keeps ticket 07's first-in-the-route position. Unit 2 (licensing) is near-first
because ticket 03 requires the answer to exist before anything ships. Units 7 and 8 are serialized
rather than parallel because both edit `skills/hamilton-propose/SKILL.md`. Unit 10 is last: it is
dogfooding cleanup on this map's own files and should follow the templates that fix the shape it
converts to.
