# Capability: framework-docs

The documentation that presents Hamilton's SDD pipeline and its skills to a reader — the `docs/skills.md` reference and the `CONTRIBUTING.md` doc-mapping table. This is the surface a contributor or user reads to learn what each skill does, where it sits, and which doc a change area maps to.

## ADDED Requirements

### Requirement: Wayfinder entry in the skills reference

`docs/skills.md` SHALL include a `### \`hamilton-wayfinder\`` entry in the established format (a `### \`hamilton-...\`` heading with a short role + step tag, a 1–2 sentence intro, then `- **When:**` / `- **Inputs:**` / `- **Produces:**` / `- **Notes:**` bullets, ending with a `- Source:` link to the skill's `SKILL.md`). The entry SHALL be positioned immediately before the `### \`hamilton-propose\`` entry, naming wayfinder as an optional pre-change planning stage.

- Priority: must
- Rationale: [ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) settled that wayfinder sits before propose as an optional, upstream stage, and that a `docs/skills.md` entry in the established format is the floor of the docs work. The skill shipped in unit 6 but is invisible in the pipeline's own reference until this entry exists.

#### Scenario: Reader looks up wayfinder in the skills reference

- WHEN a reader opens `docs/skills.md` looking for the wayfinder skill
- THEN they find a `### \`hamilton-wayfinder\`` entry positioned before `### \`hamilton-propose\``
- AND the entry follows the same When / Inputs / Produces / Notes / Source structure as the other entries

### Requirement: One-sentence rule stated in the entry

The wayfinder entry SHALL state the one-sentence rule from [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md): "Use wayfinder to break a complex goal into clear, realizable units. Use hamilton-propose to transform each route unit into a concrete change spec ready for autonomous implementation."

- Priority: must
- Rationale: ticket 09 fixed the boundary between wayfinder and propose in a single sentence — wayfinder breaks the goal into route units; propose turns each route unit into a change spec. Carrying that sentence verbatim in the entry keeps the docs consistent with the decision and tells a reader exactly where wayfinder ends and propose begins.

#### Scenario: Entry describes the wayfinder-to-propose handoff

- WHEN a reader reads the wayfinder entry
- THEN they find the one-sentence rule stating wayfinder breaks a complex goal into realizable units and propose transforms each route unit into a change spec

### Requirement: Fork provenance carried in prose with a NOTICE link

The wayfinder entry SHALL carry the fork's provenance in prose — a brief note that `hamilton-wayfinder` is a fork of upstream `mattpocock/skills` (MIT) — and SHALL link to `NOTICE` for the full legal credit. The entry SHALL NOT reproduce the licence text or the full notice inline.

- Priority: must
- Rationale: [ticket 03](../../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) ruled the fork's legal credit into `NOTICE` files and out of `docs/sdd-framework.md`'s Inspirations section, which left provenance invisible in the narrative docs. [Ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) inherits that constraint and places the one prose sentence a reader needs — "where did wayfinder come from?" — in the `docs/skills.md` entry, linking to `NOTICE` rather than duplicating it. Legal credit stays formal; provenance becomes discoverable.

#### Scenario: Reader asks where wayfinder came from

- WHEN a reader opens the wayfinder entry asking about its origin
- THEN they find a brief prose note naming the upstream (`mattpocock/skills`) and its licence (MIT)
- AND a link to `NOTICE` for the full legal credit
- AND they do not find the full licence text reproduced in the entry

### Requirement: Pipeline identity phrasing adjusted

`docs/skills.md` SHALL phrase the pipeline's identity as "six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." The pipeline SHALL keep its identity; wayfinder SHALL be named as the optional stage upstream of per-change work, not as a seventh core skill.

- Priority: must
- Rationale: [ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) fixed this phrasing to preserve the existing pipeline identity (six skills, plan as the only required artifact) while acknowledging the optional stage. Calling wayfinder a seventh core skill would contradict the framework's self-description; calling it an optional pre-change stage extends the story without breaking it.

#### Scenario: Reader reads the pipeline identity

- WHEN a reader reads the pipeline description in `docs/skills.md`
- THEN they find the phrasing "six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)"
- AND wayfinder is not counted among the six core skills

### Requirement: CONTRIBUTING.md mapping row for map artifacts

`CONTRIBUTING.md`'s **Mapping Code to Docs** table SHALL include a row mapping `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md`. This row SHALL be distinct from the existing `New/changed wayfinder artifact template in bundle/templates/wayfinder/` → `docs/skills.md` row: the existing row covers artifact *templates* shipped in `bundle/`, the new row covers *map artifacts* authored under `.hamilton/maps/`.

- Priority: must
- Rationale: [ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) settled that the mapping table gains a row for map artifacts. A row already exists for wayfinder artifact templates (added by unit 3), but map artifacts are a different change area — they are authored under the project's `.hamilton/maps/`, not shipped in `bundle/`. Conflating the two would misdirect a contributor editing one surface to the wrong doc.

#### Scenario: Contributor changes a map artifact and checks the mapping table

- WHEN a contributor edits a map artifact under `.hamilton/maps/` and consults `CONTRIBUTING.md`'s mapping table
- THEN they find a row mapping `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md`
- AND that row is separate from the `bundle/templates/wayfinder/` templates row

### Requirement: Scope held literally to docs/skills.md and CONTRIBUTING.md

The change SHALL edit `docs/skills.md` and `CONTRIBUTING.md` only. It SHALL NOT edit `README.md` or `docs/sdd-framework.md` — the six-skill diagram in both stays exactly as it is. `docs/sdd-framework.md`'s Inspirations section SHALL NOT gain a wayfinder or fork entry.

- Priority: must
- Rationale: [ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) restricts the docs scope to `docs/skills.md` and `CONTRIBUTING.md` and is explicit that the six-skill diagram staying as it is "is the decision, not an oversight." [Ticket 03](../../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) ruled the fork out of `docs/sdd-framework.md`'s Inspirations section for two independent reasons (a fork is a different kind of debt than an inspiration, and wayfinder is the pre-SDD stage, not an inspiration for the SDD framework). Resisting scope widening while editing is the load-bearing guard on this unit.

#### Scenario: Diff is inspected after the change

- WHEN the change's diff is inspected
- THEN only `docs/skills.md` and `CONTRIBUTING.md` appear as modified files
- AND `README.md` and `docs/sdd-framework.md` are unchanged

## MODIFIED Requirements

None. No canonical spec exists for the `framework-docs` capability; the requirements above are the first formal tracking of the docs-presentation behaviour, matching the unit-8 precedent where the map-aware-entrypoint requirements were also first-time tracking.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
