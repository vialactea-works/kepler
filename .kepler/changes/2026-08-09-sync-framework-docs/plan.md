# Plan: Sync the framework docs

## Overview

- Change: `.hamilton/changes/2026-08-09-sync-framework-docs/`
- Goal: Make `hamilton-wayfinder` visible in `docs/skills.md` — an entry in the established format positioned before `hamilton-propose` as an optional pre-change planning stage, carrying the one-sentence rule (ticket 09) and the fork's provenance in prose with a `NOTICE` link — adjust the pipeline identity phrasing, and add the map-artifacts → `docs/skills.md` row to `CONTRIBUTING.md`. Scope is held literally to those two files.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: Docs-only; no automated test asserts on `docs/` content, so each task is verified by read-and-inspect plus the gates staying green. Scope is load-bearing — [ticket 10](../../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) restricts edits to `docs/skills.md` and `CONTRIBUTING.md` ONLY; `README.md` and `docs/sdd-framework.md` (including the six-skill diagram) stay exactly as they are. That is the decision, not an oversight. The established entry format (read from `docs/skills.md`): a `### \`hamilton-...\`` heading with a short role + step tag, a 1–2 sentence intro, then `- **When:**` / `- **Inputs:**` / `- **Produces:**` / `- **Notes:**` bullets, ending with `- Source:` linking to the skill's `SKILL.md`. The wayfinder entry's When/Inputs/Produces are grounded in `skills/hamilton-wayfinder/SKILL.md` (charts a map of decision tickets for a goal too big for one session, then works them one at a time until the route is clear). See `design.md` for the three landing points and the four decisions (position before propose/after init; provenance in the Notes bullet; phrasing replaces the identity sentence not the diagram; mapping row adjacent to the templates row).
- Quality notes: Mechanical docs-only change — three tasks cut along the design's boundaries (entry, phrasing, mapping row), each mapping to distinct requirements and independently verifiable by read-and-inspect. No structural smell; DRY holds (the pipeline identity is stated once in the phrasing and not duplicated in the diagram). No tests by design — no existing test asserts on `docs/`, consistent with every skill/docs unit in this route.

## Tasks

### Task 1: Add the `hamilton-wayfinder` entry to `docs/skills.md`

- Depends on: none
- Files:
  - Created: none
  - Modified: `docs/skills.md`
  - Deleted: none
- Acceptance:
  - A `### \`hamilton-wayfinder\`` entry exists in `docs/skills.md`, positioned between the `### \`hamilton-init\`` entry and the `### \`hamilton-propose\`` entry (the wayfinder heading's line number falls between the two). — Requirement: *Wayfinder entry in the skills reference*, scenario "Reader looks up wayfinder in the skills reference".
  - The entry follows the established structure: a `### \`hamilton-wayfinder\`` heading with a short role + step tag naming it the optional pre-change planning stage, a 1–2 sentence intro, `- **When:**` / `- **Inputs:**` / `- **Produces:**` / `- **Notes:**` bullets, and a `- Source:` link to `../skills/hamilton-wayfinder/SKILL.md`.
  - The entry states the one-sentence rule from [ticket 09](../../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) verbatim: "Use wayfinder to break a complex goal into clear, realizable units. Use hamilton-propose to transform each route unit into a concrete change spec ready for autonomous implementation." — Requirement: *One-sentence rule stated in the entry*.
  - The entry's `- **Notes:**` bullet carries the fork's provenance in prose: it names the upstream (`mattpocock/skills`) and its licence (MIT) and links to the root `NOTICE` (`../NOTICE` from `docs/`) for the full legal credit. The entry does NOT reproduce the licence text or the full notice inline. — Requirement: *Fork provenance carried in prose with a NOTICE link*, scenario "Reader asks where wayfinder came from".
- Steps:
  1. Read `skills/hamilton-wayfinder/SKILL.md` to ground the entry's When/Inputs/Produces in the skill's actual behaviour — it charts a map of decision tickets for a goal too big for one session, then works them one at a time until the route is clear; the map plans the way, the doing comes later one change at a time.
  2. Read the existing `### \`hamilton-init\`` and `### \`hamilton-propose\`` entries in `docs/skills.md` to match the established format exactly — the heading shape (`### \`hamilton-...\` — <role> *(<step tag>)*`), the bullet labels, and the `- Source:` link shape (`- Source: [\`skills/...\`](../skills/.../SKILL.md)`).
  3. Insert a new `### \`hamilton-wayfinder\`` block between the `### \`hamilton-init\`` block (which ends with its `- Source:` line) and the `### \`hamilton-propose\`` heading. Draft the entry following the established structure: a heading with a role + step tag naming wayfinder as the optional pre-change planning stage; a 1–2 sentence intro drawn from the SKILL.md; `- **When:**` / `- **Inputs:**` / `- **Produces:**` bullets grounded in the SKILL.md (when: a goal too big for one change session; inputs: a complex goal; produces: a map of decision tickets / a route of change-sized units); a `- **Notes:**` bullet that includes the one-sentence rule (ticket 09) verbatim AND the fork provenance in prose (fork of upstream `mattpocock/skills`, MIT, see `NOTICE`); and a `- Source:` link to `../skills/hamilton-wayfinder/SKILL.md`.
  4. Read the inserted entry end-to-end and confirm it matches the established format, the one-sentence rule is present verbatim, the provenance prose names upstream + licence + links to `NOTICE`, and no licence text is reproduced inline.
- Verify: `grep -n '^### ' docs/skills.md` → the `hamilton-wayfinder` heading appears between `hamilton-init` and `hamilton-propose`; read the entry to confirm the one-sentence rule and provenance prose are present and the licence text is not.
- Commit: `docs: add hamilton-wayfinder entry to skills reference`

### Task 2: Adjust the pipeline identity phrasing in `docs/skills.md`

- Depends on: Task 1 (same file — sequence to avoid a parallel-edit conflict)
- Files:
  - Created: none
  - Modified: `docs/skills.md`
  - Deleted: none
- Acceptance:
  - The sentence beginning "Seven skills." in the `## The pipeline` paragraph reads "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." — Requirement: *Pipeline identity phrasing adjusted*, scenario "Reader reads the pipeline identity".
  - Wayfinder is NOT counted among the six core skills; the rest of the paragraph (init once, propose optional, code/review loop, orchestrate driver, critique optional gate) is unchanged; the ASCII pipeline diagram above it is untouched.
- Steps:
  1. In `docs/skills.md`, locate the paragraph under `## The pipeline` that opens with "Seven skills.".
  2. Replace the opening "Seven skills." with "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." Leave the remainder of the paragraph exactly as it is.
  3. Read the paragraph end-to-end and confirm it reads coherently, wayfinder is named as the optional stage (not a seventh core skill), and the ASCII diagram above it is untouched.
- Verify: `grep -n 'Six core skills' docs/skills.md` → exactly one match in the pipeline paragraph; `grep -n 'Seven skills' docs/skills.md` → no matches.
- Commit: `docs: phrase pipeline identity as six core skills plus optional wayfinder stage`

### Task 3: Add the map-artifacts mapping row to `CONTRIBUTING.md`

- Depends on: none (different file — may run in parallel with Task 1)
- Files:
  - Created: none
  - Modified: `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - The **Mapping Code to Docs** table in `CONTRIBUTING.md` contains a new row `| New/changed map artifacts in .hamilton/maps/ | docs/skills.md |`. — Requirement: *CONTRIBUTING.md mapping row for map artifacts*, scenario "Contributor changes a map artifact and checks the mapping table".
  - The new row is distinct from the existing `| New/changed wayfinder artifact template in bundle/templates/wayfinder/ | docs/skills.md |` row — both exist, they are not merged or conflated (the templates row covers `bundle/`; the new row covers `.hamilton/maps/`).
- Steps:
  1. In `CONTRIBUTING.md`, locate the **Mapping Code to Docs** table under `### Mapping Code to Docs`.
  2. Add a new row immediately after the existing `| New/changed wayfinder artifact template in bundle/templates/wayfinder/ | docs/skills.md |` row: `| New/changed map artifacts in .hamilton/maps/ | docs/skills.md |`. Keep the existing templates row in place — the two rows name genuinely different surfaces (`bundle/` ships with the repo; `.hamilton/maps/` is authored per-project) and must not be merged.
  3. Read the table and confirm both rows are present, distinct, and follow the table's two-column structure.
- Verify: `grep -n 'map artifacts in .hamilton/maps' CONTRIBUTING.md` → one match (the new row); `grep -n 'artifact template in bundle/templates/wayfinder' CONTRIBUTING.md` → one match (the original templates row, still present).
- Commit: `docs: add map-artifacts row to CONTRIBUTING mapping table`

## Done when

- All tasks implemented (recorded in `progress.md`)
- `git diff --name-only` shows only `docs/skills.md` and `CONTRIBUTING.md` — the literal-scope guard (Requirement: *Scope held literally to docs/skills.md and CONTRIBUTING.md*): no `README.md`, no `docs/sdd-framework.md`, no other file appears in the diff
- `bun run build` passes; `bun --bun vitest run` passes
- All review feedback has been addressed
