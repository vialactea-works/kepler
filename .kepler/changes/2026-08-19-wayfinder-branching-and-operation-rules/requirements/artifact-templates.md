# Capability: artifact-templates

Every artifact shape Hamilton produces, defined once in the bundle's templates tree and installed globally by `hamilton setup`.

## MODIFIED Requirements

### Requirement: The wayfinder map shape

`wayfinder/map.md` SHALL carry frontmatter `status`: `open` | `cleared` | `shipping` | `shipped`, and `branch`: the branch the effort works from and merges back into, set at map creation. Its body SHALL be the sections Destination, Notes, Operation rules, Decisions so far, Not yet specified, Out of scope — in that order, and no seventh. The Operation rules section holds standing per-effort instructions on how working sessions operate; its hint SHALL distinguish it from Notes (orienting context) as prescriptive, per-session-binding rules, and it MAY be empty.

- Priority: must
- Rationale: the map needs a home for the working branch (worktree support) and for the operation rules charting now solicits; the previous shape fixed five sections "and no sixth", which this change deliberately revises.

#### Scenario: Map template installed

- WHEN `hamilton setup` runs
- THEN `~/.hamilton/templates/wayfinder/map.md` carries the `status` and `branch` frontmatter fields and the six body sections in order

#### Scenario: Operation rules distinguished from Notes

- WHEN an author fills the map template
- THEN the inline hints direct durable orienting context to Notes and prescriptive session rules to Operation rules

### Requirement: The wayfinder route shape

`wayfinder/route.md` SHALL carry no frontmatter, and a body of: a preamble, then `## Shipping rules`, then `## Units` — each unit carrying its name, a `Status` of `pending` | `in-progress` | `shipped`, its dependencies, links to the decisions backing it, and a goal paragraph. The Shipping rules section describes how the units will be shipped: the branch units merge back into, commit and merge/PR conventions, and any standing shipping constraint every unit inherits; its hint SHALL say it is seeded from the map's `branch:` field and shipping-relevant operation rules.

- Priority: must
- Rationale: the route is the handoff read by processes that never open the map, so shipping conventions must live on the route itself.

#### Scenario: Route template installed

- WHEN `hamilton setup` runs
- THEN `~/.hamilton/templates/wayfinder/route.md` contains a `## Shipping rules` section between the preamble and `## Units`

## ADDED Requirements

*(none — both changes modify existing shapes)*

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
