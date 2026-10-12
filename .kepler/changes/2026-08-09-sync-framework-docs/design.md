# Design: Sync the framework docs

## Context

`hamilton-wayfinder` shipped in unit 6 as the pre-SDD planning stage — it charts a map of decision tickets for a goal too big for one session, then works them one at a time until the way is clear. But a reader of `docs/skills.md` still finds no entry for it: the pipeline's own reference is silent about the stage that sits before it. And because [ticket 03](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) ruled the fork's legal credit into `NOTICE` and out of `docs/sdd-framework.md`'s Inspirations section, a reader asking "where did wayfinder come from?" finds nothing in the narrative docs at all.

[Ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) closes both gaps in one docs-only unit. It fixes the docs scope (`docs/skills.md` + `CONTRIBUTING.md` only), the entry position (before `hamilton-propose`), the pipeline phrasing ("six core skills in fixed sequence, plus an optional pre-change planning stage"), the `CONTRIBUTING.md` row, and the provenance placement (prose in the `docs/skills.md` entry, linking to `NOTICE`). [Ticket 03](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) fixes that the legal credit stays formal in `NOTICE` and the prose only names upstream and links. [Ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) supplies the one-sentence rule the entry carries.

This is a mechanical, docs-only change. The design is sized to that — it fixes the three landing points and the one load-bearing guard, and does not invent structure the change does not need.

## Goals / Non-Goals

**Goals**

- Add a `### \`hamilton-wayfinder\`` entry to `docs/skills.md` in the established format, positioned before `### \`hamilton-propose\``.
- Carry the one-sentence rule (ticket 09) and the fork provenance (brief prose, `NOTICE` link) in the entry.
- Adjust the pipeline identity phrasing to "six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)."
- Add the `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md` row to `CONTRIBUTING.md`'s mapping table, distinct from the existing templates row.

**Non-Goals**

- Edit `README.md` or `docs/sdd-framework.md` — the six-skill diagram stays as it is (ticket 10's literal scope).
- Redraw the pipeline diagram in `docs/skills.md` — the scope is the entry text, the phrasing, and the mapping row.
- Reproduce the licence text or full `NOTICE` inline — provenance is prose, legal credit stays in `NOTICE`.
- Change any code, CLI, template, test, or other skill.

## Approaches considered

### Approach A (recommended): follow ticket 10 literally

Edit `docs/skills.md` (add the wayfinder entry before propose, state the one-sentence rule, carry the provenance prose, adjust the pipeline phrasing) and `CONTRIBUTING.md` (add the map-artifacts mapping row). Hold the scope to those two files and no others.

- **Trade-off:** the six-skill diagram in `README.md` and `docs/sdd-framework.md` will not mention wayfinder. That is the decision ticket 10 made — wayfinder is an optional skill in the pipeline, not a philosophical addition to the framework, and the diagram staying as it is "is the decision, not an oversight."
- **Why recommended:** it is exactly what the tickets settled. The scope guard is load-bearing; widening it would re-open a decision the route already closed.

### Approach B: widen to update the diagrams in README.md and docs/sdd-framework.md

Insert wayfinder into the six-skill diagram in both files.

- **Trade-off:** makes the docs fully consistent at the cost of editing two files ticket 10 explicitly placed out of scope.
- **Why rejected:** ticket 10 restricted the scope deliberately, and ticket 03 ruled the fork out of `docs/sdd-framework.md`'s Inspirations section for two independent reasons. Widening re-litigates both. Recorded here so the coder does not "fix" an apparent inconsistency that is actually a decision.

### Approach C: defer the CONTRIBUTING.md row to a separate change

Ship the `docs/skills.md` entry now; add the mapping row later.

- **Trade-off:** a smaller diff now, at the cost of a contributor editing map artifacts having no doc-mapping guidance until a later change lands.
- **Why rejected:** ticket 10 bundles the two edits into one unit because they are the same docs-shape decision. Splitting them leaves the mapping table incomplete against the change area the entry introduces.

**Chosen: Approach A.** The tickets decide the scope; the design fixes the landing points.

## Decisions

### Decision: Entry positioned before hamilton-propose, after hamilton-init

- Choice: the `### \`hamilton-wayfinder\`` entry lands between `### \`hamilton-init\`` and `### \`hamilton-propose\``.
- Alternatives considered: (1) before `hamilton-init` — ticket 10's conceptual diagram draws `wayfinder (optional) ──▶ init ──▶ [ propose ]`, which reads as wayfinder preceding project setup. Rejected for the *entry order* because the context-load task fixed the position as "before `hamilton-propose`, as an optional pre-change planning stage" — wayfinder is a per-change stage, and init is once-per-project, so grouping wayfinder next to the per-change steps (propose onward) is the legible order. The diagram and the entry order are different concerns: the diagram shows conceptual flow; the entry order groups by lifecycle. (2) After `hamilton-propose` — rejected; ticket 10 says wayfinder sits before propose.
- Rationale: the entry order follows the pipeline reading order a contributor scans — setup (init), then the per-change stages starting with the optional planner (wayfinder), then the optional front door (propose). This matches the position the context-load task recorded.

### Decision: Provenance in the Notes bullet, not a separate subsection

- Choice: the fork provenance — a brief note that `hamilton-wayfinder` is a fork of upstream `mattpocock/skills` (MIT), with a link to `NOTICE` — goes in the entry's `- **Notes:**` bullet, alongside the skill's other notes.
- Alternatives considered: (1) a dedicated `### Provenance` subsection under the entry — rejected as over-structured for a single sentence; the established format has no subsections. (2) In the intro paragraph — workable, but the intro is the role description, and provenance is a note about origin, not behaviour. The Notes bullet is where ancillary facts live in every other entry.
- Rationale: the established entry format (read from `docs/skills.md`) puts ancillary facts in Notes. Provenance is ancillary to the skill's behaviour, so it belongs there. Keeping it inline with a `NOTICE` link avoids a licence-text context tax and matches ticket 03's "one-line pointer" principle.

### Decision: Pipeline phrasing replaces the identity sentence, not the diagram

- Choice: the sentence currently reading "Seven skills." is replaced with "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." The ASCII pipeline diagram above it is not redrawn.
- Alternatives considered: (1) redraw the diagram to prepend `wayfinder (optional) ──▶` before `init` — rejected; the task scope is the entry text, the phrasing, and the mapping row, and ticket 10's diagram is the *answer's* illustration, not a mandate to edit the doc's diagram. (2) Leave the phrasing as "Seven skills" and only add the entry — rejected; ticket 10 explicitly fixes the phrasing, and leaving "Seven skills" would miscount once wayfinder is documented.
- Rationale: the phrasing is the identity statement a reader carries away; the diagram is a visual aid that already marks `propose` as optional. Adjusting the sentence preserves the pipeline's identity ("six core skills, plan as the only required artifact") while naming wayfinder as the optional upstream stage, exactly as ticket 10 phrases it.

### Decision: CONTRIBUTING.md row placed adjacent to the existing wayfinder-templates row

- Choice: the new `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md` row is added immediately after the existing `New/changed wayfinder artifact template in bundle/templates/wayfinder/` → `docs/skills.md` row (line 15), keeping the wayfinder-related rows together.
- Alternatives considered: (1) append at the end of the table — rejected; it separates two rows that a contributor editing wayfinder docs would consult together. (2) Merge into the existing templates row — rejected; ticket 10 and the context-load task are explicit that map artifacts (authored under `.hamilton/maps/`) and artifact templates (shipped in `bundle/templates/wayfinder/`) are different change areas that must not be conflated.
- Rationale: grouping related rows aids scanning without conflating them. The two rows name genuinely different surfaces — `bundle/` ships with the repo; `.hamilton/maps/` is authored per-project — so they stay separate.

### Decision: No tests, no canonical spec

- Choice: the change adds no test coverage and creates no `.hamilton/specs/framework-docs.md`. The requirements delta is the first formal tracking.
- Alternatives considered: (1) add a test asserting the wayfinder entry exists in `docs/skills.md` — rejected; no existing test asserts on `docs/` content, and `docs/` is not bundled or installed. (2) Create the canonical spec now — rejected; matching the unit-8 precedent, the requirements delta is sufficient first tracking, and finish-work will fold it in.
- Rationale: `bun run build` type-checks TypeScript (unaffected) and `bun --bun vitest run` covers bundled templates and guidelines (unaffected). Docs are verified by reading the edited sections, not by automated tests — consistent with every skill/docs unit in this route.

## Architecture

The change touches two files; no structural architecture is introduced or modified.

**`docs/skills.md`** — three coordinated edits in the existing document:

1. **Pipeline identity sentence** (the paragraph beginning "Seven skills." under `## The pipeline`): replace "Seven skills." with "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." The rest of the paragraph (init once, propose optional, code/review loop, orchestrate driver, critique optional gate) stays as it is.
2. **Wayfinder entry**: a new `### \`hamilton-wayfinder\`` block inserted between `### \`hamilton-init\`` and `### \`hamilton-propose\``, following the established structure: heading with role + step tag, a 1–2 sentence intro, `- **When:**` / `- **Inputs:**` / `- **Produces:**` / `- **Notes:**` bullets, and a `- Source:` link to `../skills/hamilton-wayfinder/SKILL.md`. The entry states the one-sentence rule from ticket 09 in the intro or Notes, and carries the fork provenance (fork of `mattpocock/skills`, MIT, see `NOTICE`) in the Notes bullet.
3. **Nothing else**: the pipeline diagram, the setup section, the artifacts/layout section, and the code-review loop section are untouched.

**`CONTRIBUTING.md`** — one table row added to the **Mapping Code to Docs** table, immediately after the existing wayfinder-templates row (line 15):

`| New/changed map artifacts in .hamilton/maps/ | docs/skills.md |`

The existing templates row (`bundle/templates/wayfinder/`) stays; the two are not merged.

## Testing strategy

No automated tests. The change is verified by:

- Reading the edited `docs/skills.md` sections end-to-end: the pipeline paragraph, the new wayfinder entry, and the unchanged propose entry that follows it — confirming the entry matches the established format and the phrasing reads correctly.
- Reading the edited `CONTRIBUTING.md` table — confirming the new row is present, distinct from the templates row, and follows the table's column structure.
- Inspecting `git diff --name-only` — confirming only `docs/skills.md` and `CONTRIBUTING.md` appear (the literal-scope guard).
- Running `bun run build` and `bun --bun vitest run` — confirming both stay green (no code or test regression).

## Risks / Trade-offs

- **Apparent diagram inconsistency.** The pipeline diagram in `docs/skills.md` will not show wayfinder on the line, while the new entry and phrasing name it as the optional pre-change stage. A future reader may see this as an omission. **Mitigation:** the phrasing ("plus an optional pre-change planning stage") makes the optionality explicit in text; ticket 10's decision that the diagram stays as it is is recorded in this design and in the route. This is accepted, not a defect.
- **Provenance prose drift from `NOTICE`.** The entry's prose names upstream and links to `NOTICE`; if `NOTICE` changes, the prose could lag. **Mitigation:** the prose makes no claims that `NOTICE` does not — it names the upstream and licence, which are stable facts. The link keeps the legal credit authoritative.
- **`skills/hamilton-wayfinder/NOTICE` does not carry the upstream MIT text.** Observed during context loading: the wayfinder skill's sibling `NOTICE` carries only the Apache header, not the upstream MIT text ticket 03's template specifies. **Out of scope for this unit:** ticket 10 restricts edits to `docs/skills.md` and `CONTRIBUTING.md`; the `NOTICE` discrepancy is a licensing-unit (unit 2) concern, not a docs-unit concern. The docs entry links to the root `NOTICE` (which does carry the MIT text), so the reader's path to the legal credit is intact. Flagged for a later effort, not fixed here.

## Quality Lens

Mechanical, docs-only change — no units, boundaries, or dependencies introduced. The code-quality rubric ("scale scrutiny to the change; a mechanical or one-file change trips few of these") applies at minimum: the only structural concern is DRY (the pipeline identity is stated once in the phrasing and not duplicated in the diagram), which holds. No gate failure.
