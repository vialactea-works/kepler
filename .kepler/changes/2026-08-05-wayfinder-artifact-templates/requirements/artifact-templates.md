# Capability: artifact-templates

The canonical set of artifact shapes Hamilton ships, where they live, how `hamilton setup` installs them into `~/.hamilton/templates/`, and what it reports having installed.

## ADDED Requirements

### Requirement: Nested template installation

The system SHALL install every template file the bundle carries, at any directory depth, preserving each file's path relative to the bundle's templates root.

- Priority: must
- Rationale: wayfinder's three artifact shapes are the first templates to live in a subdirectory. The convention that every artifact shape is defined once, globally, in `bundle/templates/` and read from `~/.hamilton/templates/` only holds if grouping templates into a subdirectory does not quietly exclude them.

#### Scenario: Templates in a subdirectory are installed

- WHEN `hamilton setup` runs against a bundle whose templates root contains `wayfinder/map.md`
- THEN `~/.hamilton/templates/wayfinder/map.md` exists with the bundled file's contents

#### Scenario: Re-running setup refreshes existing templates

- WHEN `hamilton setup` runs a second time
- THEN every template file, nested or top-level, is present and matches the bundle, and the command succeeds

#### Scenario: A bundle with no templates directory installs nothing

- WHEN `hamilton setup` runs against a bundle root that has no `templates` directory
- THEN the command succeeds, installs no templates, and reports an empty set

### Requirement: Complete installation report

The system SHALL report every installed template file, naming a file inside a subdirectory by its path relative to the templates root.

- Priority: must
- Rationale: the report is the user's only confirmation that an install landed what they expected. A report built from a flat directory listing would count and name nine files while writing twelve, so the three templates this change adds would install invisibly — and a user debugging a wayfinder skill that cannot find its template would be looking at output claiming the template was never installed.

#### Scenario: Nested templates appear in the report

- WHEN `hamilton setup` completes against a bundle containing `wayfinder/map.md`, `wayfinder/route.md`, and `wayfinder/ticket.md`
- THEN the reported set contains `wayfinder/map.md`, `wayfinder/route.md`, and `wayfinder/ticket.md`

#### Scenario: The report counts files, not top-level entries

- WHEN `hamilton setup` completes against a bundle whose templates root holds nine files and one subdirectory of three files
- THEN the reported set holds twelve entries, and the directory name itself is not among them

#### Scenario: Top-level templates keep their bare names

- WHEN `hamilton setup` completes
- THEN a template at the templates root is reported as `plan.md`, with no directory prefix

### Requirement: Wayfinder artifact template set

The system SHALL ship templates for wayfinder's three artifact shapes — the map, the decision ticket, and the route — at `bundle/templates/wayfinder/`.

- Priority: must
- Rationale: [Template convention](../../../maps/hamilton-wayfinder/tickets/05-template-convention.md) placed all three shapes here so wayfinder's artifacts are defined where every other Hamilton artifact is defined. Each shape's content is fixed by a prior decision rather than invented at authoring time, so the scenarios below name the elements that carry those decisions.

#### Scenario: The map template carries the map's frontmatter and body

- WHEN a reader opens `wayfinder/map.md`
- THEN it opens with YAML frontmatter carrying a `status` field documented as `open` or `cleared`, followed by the sections Destination, Notes, Decisions so far, Not yet specified, and Out of scope, in that order and with no sixth section

#### Scenario: The ticket template carries the ticket's frontmatter and question

- WHEN a reader opens `wayfinder/ticket.md`
- THEN it opens with YAML frontmatter carrying `type` documented as one of `grilling`, `research`, `prototype`, or `task`; `status` documented as `open` or `resolved`; and `blocked_by` as a list of ticket numbers — followed by a `## Question` section

#### Scenario: The route template carries units, not a route-level status

- WHEN a reader opens `wayfinder/route.md`
- THEN it has no frontmatter and no top-level status line, and its `## Units` section templates a unit as a name, a `Status` of `pending`, `in-progress`, or `shipped`, its dependencies, links to the decisions backing it, and a goal paragraph

#### Scenario: Each template follows Hamilton's template idiom

- WHEN a reader opens any of the three
- THEN it begins with a comment block naming the artifact, the skill that produces it, and where the artifact lives, and instructing the author to delete the comment block and every inline hint before finalizing

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
