# Proposal: Land the wayfinder artifact templates

| Field   | Value                                    |
|---------|------------------------------------------|
| Change  | 2026-08-05-wayfinder-artifact-templates  |
| Status  | draft                                    |
| Author  | hamilton-propose                         |
| Created | 2026-08-05                               |

## Why

Wayfinder introduces three artifact shapes Hamilton has never had: the **map**, the **decision ticket**, and the **route**. Right now those shapes exist in exactly one place — the live `.hamilton/maps/hamilton-wayfinder/` directory, which is simultaneously this effort's working map and the only worked example of what the shapes are. Every other Hamilton artifact shape lives in `bundle/templates/`, installs globally to `~/.hamilton/templates/` via `hamilton setup`, and is read from there by the step that produces it. Wayfinder's shapes are the exception, and the exception is load-bearing: units 4 through 7 of [the route](../../maps/hamilton-wayfinder/route.md) author the wayfinder skills, and a skill that tells an agent to create a map has nothing canonical to point it at.

Reverse-engineering a template from a single instance is exactly the failure Hamilton's global-template convention exists to prevent. It confuses the incidental with the required — this map's thirteen tickets, its particular fog, its `Status: shipping` — and it puts the shape's definition somewhere no `hamilton setup` will ever install. [Template convention](../../maps/hamilton-wayfinder/tickets/05-template-convention.md) settled the destination: all three shapes go into `bundle/templates/wayfinder/`, and wayfinder depends on `hamilton setup` having been run first.

## Goals & Success Criteria

- `bundle/templates/wayfinder/` exists and holds `map.md`, `ticket.md`, and `route.md`, each following the established Hamilton template idiom — a leading comment block naming the artifact, who produces it, and where it lives, then a skeleton with inline hints, all of it deleted before finalizing.
- The template shapes are traceable to the decisions that fixed them rather than invented here: YAML frontmatter and its fields from [Map mechanics in files](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md), the five-section map body from [Map artifact layout](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md), and the per-unit structure and lifecycle vocabulary from [route.md shape and the SDD join](../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md).
- Running `hamilton setup` installs all twelve templates and reports all twelve, naming the three wayfinder ones by their `wayfinder/`-prefixed path.
- `tests/cli/setup.test.ts` fails if any of the three wayfinder templates stops being installed, and fails if the reported list stops naming the nested ones.
- `CONTRIBUTING.md` and `bundle/templates/README.md` describe the template set that actually ships.

## Non-Goals

- **Authoring any wayfinder skill.** The `wayfinder`, `grilling`, and sibling `SKILL.md` files are units 4 through 7, authored against `/writing-great-skills`. This unit ships the artifact shapes those skills will reference, and nothing that references them.
- **Converting the live map to frontmatter.** `.hamilton/maps/hamilton-wayfinder/map.md` and its thirteen tickets still use loose `Status:` lines. [Map mechanics in files](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) calls for a one-time conversion; that conversion is unit 10, not this unit. The templates lead and the live files follow — they will disagree in the interim, and that is expected.
- **Giving the `## Map mechanics` contract a written home.** Ticket 04 supplies the section's text but deliberately leaves open whether it lands in `CONTRIBUTING.md` or a dedicated `MECHANICS.md` under `.hamilton/maps/`. Unit 10 settles it. The templates encode the frontmatter *syntax* without restating the *contract*.
- **Writing wayfinder prose into `docs/`.** [How the framework docs present the pre-SDD stage](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) fences that to unit 9 and confines it to `docs/skills.md` and `CONTRIBUTING.md`, explicitly ruling out any reshape of `docs/sdd-framework.md`. This unit therefore adds a routing row to `CONTRIBUTING.md`'s mapping table but writes no wayfinder documentation into `docs/`.
- **Guarding against wayfinder-before-setup.** Ticket 05 ruled that a user who runs wayfinder before `hamilton setup` hits a clear error pointing at `hamilton setup`, and that documentation is sufficient. No guard code.

## Proposed Change

Three template files land under a new `bundle/templates/wayfinder/` subdirectory — the first subdirectory the templates tree has ever had. They install without any change to how installation works, because `copyTemplates` already copies with `Fs.cpSync(..., { recursive: true })`.

`map.md` templates the map artifact: YAML frontmatter carrying `status` (`open` or `cleared`), then the five sections [Map artifact layout](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) fixed verbatim from upstream — Destination, Notes, Decisions so far, Not yet specified, Out of scope — with `route.md` linked from Destination once it exists rather than earning a sixth section. `ticket.md` templates a decision ticket: frontmatter carrying `type` (`grilling`, `research`, `prototype`, or `task`), `status` (`open` or `resolved`), and `blocked_by` as a list of ticket numbers, over a `## Question` body. `route.md` templates the handoff document: a title, the preamble where an effort states the constants that would otherwise repeat per unit, and a `## Units` section whose per-unit shape carries name, status, dependencies, backing decision links, and a goal paragraph.

Alongside them, `hamilton setup` starts reporting what it actually installs. Today it copies the whole templates tree recursively but builds its report from a flat directory read that filters out directories, so the three wayfinder templates would be installed and never named — the command would print "Installed 9 templates" while writing twelve. The reported list becomes recursive, naming nested templates by their path relative to the templates root.

The three documentation touches keep the shipped description honest: `bundle/templates/README.md` is the index of the very directory being changed and is itself installed by `hamilton setup`, so it gains the wayfinder templates; `CONTRIBUTING.md`'s mapping table gains a row routing changes under `bundle/templates/wayfinder/` at `docs/skills.md`, which is where ticket 10 places wayfinder's documentation. The table's existing row sends `bundle/templates/` changes to `docs/sdd-framework.md`; that stays correct for the nine pipeline templates and would be wrong for wayfinder's, since ticket 10 explicitly rules out describing wayfinder there.

## Capabilities

### New

- `artifact-templates`: the canonical set of artifact shapes Hamilton ships, where they live, how `hamilton setup` installs them, and what it reports having installed.

### Modified

None. `cli-distribution` already covers how the bundle is published and how a binary resolves it at runtime; nothing about that changes here, since a `wayfinder/` subdirectory ships inside the bundle archive by the existing verbatim-contents rule.

## Impact

New file tree `bundle/templates/wayfinder/` with three files. One function changed in `src/cli/commands/setup.ts` — `copyTemplates`, whose return value feeds the `setup` command's console output. Assertions added to `tests/cli/setup.test.ts`. Documentation edits to `bundle/templates/README.md` and `CONTRIBUTING.md`.

The change to what `copyTemplates` returns is user-visible: `hamilton setup` will report twelve templates where it reported nine, and nested names will carry a `wayfinder/` prefix. Nothing consumes that return value programmatically apart from the console output and the existing test. There is no migration — `hamilton setup` is idempotent and copies with `force: true`, so a user who already ran it simply runs it again to pick up the new templates.

No downstream unit is unblocked or blocked by this beyond what the route already records: units 4 through 7 will reference these templates, and unit 10's frontmatter conversion will bring the live map files into line with the shapes landed here.

## Open Questions

None. The three that surfaced during exploration were settled before drafting: the documentation scope covers `CONTRIBUTING.md` and `bundle/templates/README.md` but not `docs/`; the `hamilton setup` under-report is fixed rather than accepted; and `route.md` carries no route-level status line, since status belongs to the map's frontmatter and to each unit individually.
