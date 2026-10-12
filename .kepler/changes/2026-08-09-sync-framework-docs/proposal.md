# Proposal: Sync the framework docs

| Field   | Value                              |
|---------|------------------------------------|
| Change  | 2026-08-09-sync-framework-docs     |
| Status  | approved                           |
| Author  | agent (hamilton-propose)           |
| Created | 2026-08-09                         |

## Why

`hamilton-wayfinder` shipped in unit 6, but a reader of `docs/skills.md` still finds no entry for it — the skill that sits before the pipeline is invisible in the pipeline's own reference. Worse, the docs give a reader no way to learn where wayfinder came from: [ticket 03](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) ruled the fork's legal credit into `NOTICE` and out of `docs/sdd-framework.md`'s Inspirations section, which left provenance invisible in the narrative docs entirely. [Ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) settles both gaps in one docs-only unit: add a wayfinder entry to `docs/skills.md` in the established format, carry the fork's provenance in prose there, adjust the pipeline identity phrasing, and add a `CONTRIBUTING.md` mapping row for map artifacts.

## Goals & Success Criteria

- `docs/skills.md` gains a `### \`hamilton-wayfinder\`` entry in the established format (heading + role tag, intro, When / Inputs / Produces / Notes bullets, Source link), positioned **before** `hamilton-propose` as an optional pre-change planning stage.
- The wayfinder entry carries the one-sentence rule from [ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md): "Use wayfinder to break a complex goal into clear, realizable units. Use hamilton-propose to transform each route unit into a concrete change spec ready for autonomous implementation."
- The wayfinder entry carries the fork's provenance in prose — a brief note that it is a fork of upstream `mattpocock/skills` (MIT), with a link to `NOTICE` for full legal credit.
- The pipeline identity phrasing in `docs/skills.md` reads "six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)."
- `CONTRIBUTING.md`'s mapping table gains the row `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md`, distinct from the existing wayfinder artifact *templates* row (line 15).
- `bun run build` and `bun --bun vitest run` stay green.

## Non-Goals

- **No edits to `README.md`.** Ticket 10 restricts the docs scope to `docs/skills.md` and `CONTRIBUTING.md` only. The six-skill diagram in `README.md` stays exactly as it is. That is the decision, not an oversight.
- **No edits to `docs/sdd-framework.md`.** Same restriction. Its Inspirations section stays untouched (ticket 03 ruled the fork out of it), and it gains no wayfinder section — wayfinder is an optional skill in the pipeline, not a philosophical addition to the framework.
- **No changes to the pipeline diagram.** The `init ──▶ [ propose ] ──▶ plan ──▶ code ──▶ review ──▶ finish-work` diagram in `docs/skills.md` is not redrawn to insert wayfinder on the line. Ticket 10's answer diagrams wayfinder before `init` as optional, but the literal scope is the entry text, the phrasing, and the mapping row — not the ASCII diagram.
- **No code, CLI, template, or test changes.** Docs-only; `skills/`, `src/`, `bundle/`, and `tests/` are untouched.
- **No canonical spec created.** No `.hamilton/specs/framework-docs.md` exists today; the requirements delta is the first formal tracking, matching the unit-8 precedent.

## Proposed Change

Two documentation files are edited; no files are added or deleted.

**`docs/skills.md`** — three coordinated edits:

- Add a `### \`hamilton-wayfinder\`` entry in the established format, positioned immediately **before** the `### \`hamilton-propose\`` entry (after `### \`hamilton-init\``). The entry follows the When / Inputs / Produces / Notes / Source structure every other entry uses, states the one-sentence rule from ticket 09, and carries the fork's provenance in prose with a link to `NOTICE`.
- Adjust the pipeline identity sentence so it reads "six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)" rather than the current "Seven skills" framing. The pipeline keeps its identity; wayfinder is named as the optional stage that sits upstream of per-change work.
- The pipeline diagram and the rest of the file are not touched.

**`CONTRIBUTING.md`** — one table row added to the **Mapping Code to Docs** table: `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md`. This is a **different** row from the existing `New/changed wayfinder artifact template in bundle/templates/wayfinder/` → `docs/skills.md` row (line 15): that row covers *templates* shipped in `bundle/`, this row covers *map artifacts* authored under `.hamilton/maps/`. The two are not duplicated or conflated.

## Capabilities

### New

None.

### Modified

- `framework-docs`: gains a wayfinder entry in `docs/skills.md` (positioned before propose, with provenance prose and the one-sentence rule), an adjusted pipeline identity phrasing, and a `CONTRIBUTING.md` mapping row for map artifacts. Scope held literally to those two files per [ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md).

### Removed

None.

## Impact

Two markdown docs are edited. No code, no CLI, no templates, no tests. `bun run build` type-checks TypeScript (unaffected); `bun --bun vitest run` covers bundled templates and guidelines (unaffected). The change is verified by reading the edited sections end-to-end and confirming no touches to `README.md` or `docs/sdd-framework.md` — the literal-scope guard that [ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) makes load-bearing.

## Open Questions

None. [Ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) fixes the docs scope (`docs/skills.md` + `CONTRIBUTING.md` only), the position (before propose), the pipeline phrasing ("six core skills in fixed sequence, plus an optional pre-change planning stage"), and the `CONTRIBUTING.md` row. [Ticket 03](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) fixes that provenance is prose here and legal credit stays in `NOTICE`. [Ticket 09](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) supplies the one-sentence rule. The established entry format was read from `docs/skills.md` directly.
