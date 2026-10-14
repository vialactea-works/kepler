# Capability: wayfinder

The methodology for charting a map of decision tickets and working them one at a time until the way to the destination is clear. This delta covers the file-native mechanics surface — the YAML frontmatter contract map and ticket files carry, and where that contract is documented for contributors and future tracker backends. The charting/working behaviour and lifecycle are unchanged; see the canonical [`wayfinder`](../../../specs/wayfinder.md) spec for the full behaviour this builds on.

## MODIFIED Requirements

### Requirement: Map mechanics contract has a contributor-facing written home

The `## Map mechanics` frontmatter contract SHALL have a written home in `CONTRIBUTING.md` as a self-contained `## Map mechanics` section, distinct from the agent-facing `## Map mechanics` section in `skills/hamilton-wayfinder/SKILL.md`. The `CONTRIBUTING.md` section SHALL document the three frontmatter fields (`type`, `status`, `blocked_by`), their valid values (ticket `type`: `research` / `prototype` / `grilling` / `task`; ticket `status`: `open` / `claimed` / `resolved`; map `status`: `open` / `cleared` / `shipping` / `shipped` per [ticket 06](../../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md); `blocked_by`: a YAML list of ticket numbers), and the swap boundary — the precise surface a future tracker backend would replace. The section SHALL be genuinely isolated: it SHALL NOT reference other `CONTRIBUTING.md` content, and no other `CONTRIBUTING.md` content SHALL reference map frontmatter, so a backend can replace that one section without touching the rest of the file.

- Priority: must
- Rationale: [ticket 04](../../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) named two candidate homes — `CONTRIBUTING.md` or a dedicated `MECHANICS.md` under `.hamilton/maps/` — and deliberately left the choice for propose. `CONTRIBUTING.md` is settled here: it is the repo's convention home (a contributor creating map artifacts reads it), it is discoverable (a file under `.hamilton/maps/` is buried), and `.hamilton/maps/` holds effort directories, not reference docs — a `MECHANICS.md` there would muddy the layout [ticket 01](../../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) settled. The agent-facing section in the wayfinder skill (unit 6) stays the runtime contract; `CONTRIBUTING.md` is the contributor and future-backend reference.

#### Scenario: Contributor looks up the map frontmatter contract

- WHEN a contributor creating or editing map artifacts consults `CONTRIBUTING.md`
- THEN they find a `## Map mechanics` section documenting the three frontmatter fields and their valid values
- AND the section states the swap boundary — what a future tracker backend would replace
- AND the section is self-contained, referencing no other `CONTRIBUTING.md` content

#### Scenario: Future tracker backend swaps the mechanics

- WHEN a future backend replaces the file-native map mechanics
- THEN it replaces the `## Map mechanics` section in `CONTRIBUTING.md` and the `## Map mechanics` section in the wayfinder skill
- AND no other `CONTRIBUTING.md` content needs to change, because the section is isolated

### Requirement: This map's own artifacts carry YAML frontmatter

`map.md` and all thirteen `tickets/NN-slug.md` files in `.hamilton/maps/hamilton-wayfinder/` SHALL carry YAML frontmatter conforming to the contract the templates fix. `map.md` SHALL carry `status` only (matching `bundle/templates/wayfinder/map.md`). Each ticket SHALL carry `type`, `status`, and `blocked_by` (matching `bundle/templates/wayfinder/ticket.md`), preserving its existing resolved values. `blocked_by` SHALL be a YAML list (`[]` for no blockers, `[01]` for one, `[01, 04, 06, 09]` for several). No loose `Type:` / `Status:` / `Blocked by:` header lines SHALL remain in any of these files. `route.md` SHALL NOT be converted — its `Status:` lines are inline per-unit markers, not header metadata.

- Priority: must
- Rationale: this map was written with loose `Key: value` header lines before [ticket 04](../../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) settled on YAML frontmatter. The canonical [`wayfinder`](../../../specs/wayfinder.md) spec and the templates (unit 3) already require frontmatter; this converts the map's own files into conformance. The map template carries `status` only — `type` is a ticket-type field (ticket 04), not a map field, so `map.md` takes no `type`. `route.md` is excluded per the route: its per-unit `Status:` lines are inline content, not header metadata, and do not fit the frontmatter contract.

#### Scenario: map.md after conversion

- WHEN `map.md` is read after the change
- THEN it begins with a YAML frontmatter block containing `status: shipping`
- AND no loose `Status:` line appears outside the frontmatter
- AND the `# Fork wayfinder into Hamilton` heading and body below are unchanged

#### Scenario: A ticket after conversion

- WHEN a `tickets/NN-slug.md` file is read after the change
- THEN it begins with a YAML frontmatter block containing `type`, `status`, and `blocked_by`
- AND `blocked_by` is a YAML list
- AND no loose `Type:` / `Status:` / `Blocked by:` lines appear outside the frontmatter
- AND the ticket's `## Question` heading and body below are unchanged

#### Scenario: Ticket with no blockers

- WHEN a ticket whose loose header read `Blocked by: —` is converted
- THEN its frontmatter reads `blocked_by: []`

#### Scenario: route.md is not converted

- WHEN `route.md` is read after the change
- THEN it retains its loose top-level `Status:` line and per-unit `Status:` lines unchanged
- AND no YAML frontmatter block is added

## ADDED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
