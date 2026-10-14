# Plan: Convert the map's own files to the mechanics contract

## Overview

- Change: `.hamilton/changes/2026-08-09-map-mechanics-contract/`
- Goal: Convert `map.md` and all thirteen `tickets/NN-slug.md` files from loose `Key: value` header lines to YAML frontmatter (`type` / `status` / `blocked_by` for tickets; `status` only for `map.md`), preserving each file's existing resolved values, and give the `## Map mechanics` contract a contributor-facing written home as a self-contained section in `CONTRIBUTING.md`. This is the last route unit — dogfooding cleanup that brings this map's own pre-contract files into conformance with the templates and the canonical spec.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: Markdown-and-docs only; no code, CLI, template, or test is touched, so no automated test asserts on the converted content — each task is verified by grep and read-and-inspect, plus the gates staying green. The target shape is fixed by the templates (`bundle/templates/wayfinder/map.md` carries `status` only; `bundle/templates/wayfinder/ticket.md` carries `type` / `status` / `blocked_by`) and by the canonical [`wayfinder`](../../../specs/wayfinder.md) spec's `### Map mechanics` table. `map.md` takes NO `type` field — the map template carries `status` only and ticket 04 defines `type` as a ticket-type field; the playbook coder note's `type: map` suggestion is overruled by the template (the shape authority). `route.md` is NOT converted — its `Status:` lines are inline per-unit markers, not header metadata, and the route scopes it out. `blocked_by` is a YAML list: `[]` for `Blocked by: —`, `[01]` for one blocker, `[01, 04, 06, 09]` for several. `map.md`'s status is `shipping` now and flips to `shipped` at finish-work (the last unit), not in this plan. The home for the `## Map mechanics` contract is `CONTRIBUTING.md` (settled by propose in `design.md`, Approach A) — added after the `## Licensing and attribution` section, self-contained and genuinely isolated so a future tracker backend can swap that one section. See `design.md` for the four decisions (home = `CONTRIBUTING.md`; `map.md` status only; `blocked_by` as YAML list; `route.md` excluded) and `requirements/wayfinder.md` for the two MODIFIED requirements with their scenarios.
- Quality notes: Mechanical markdown-and-docs change — two tasks cut along the design's boundaries (frontmatter conversion of the map's own files; the contributor-facing contract section), each touching distinct files and independently verifiable. The conversion is one cohesive operation (the same transformation applied uniformly to fourteen files, verified by one grep), not split by file-count into over-decomposition. No structural smell; the one DRY concern (the contract now in two homes — `CONTRIBUTING.md` contributor-facing and `skills/hamilton-wayfinder/SKILL.md` agent-facing) is accepted and recorded in `design.md` under Risks / Trade-offs with a named future consolidation effort, so it is not an unresolved smell here. No tests by design — no existing test asserts on map-artifact frontmatter, consistent with every prior unit in this route.

## Tasks

### Task 1: Convert `map.md` and all thirteen ticket files to YAML frontmatter

- Depends on: none
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/map.md`; all thirteen files under `.hamilton/maps/hamilton-wayfinder/tickets/` (`01-map-artifact-layout.md`, `02-read-upstream-siblings.md`, `03-fork-attribution.md`, `04-map-mechanics-in-files.md`, `05-template-convention.md`, `06-route-shape-and-sdd-join.md`, `07-which-siblings-to-port.md`, `08-ticket-types.md`, `09-boundary-with-propose-and-critique.md`, `10-framework-docs-presentation.md`, `11-compose-route.md`, `12-propose-and-critique-use-grilling.md`, `13-map-artifacts-and-worktrees.md`)
  - Deleted: none
- Acceptance:
  - `map.md` begins with a YAML frontmatter block containing `status: shipping` and nothing else in the block; the loose `Status: shipping` line is gone; the `# Fork wayfinder into Hamilton` heading and everything below it are unchanged. — Requirement: *This map's own artifacts carry YAML frontmatter*, scenario "map.md after conversion".
  - Every `tickets/NN-slug.md` file begins with a YAML frontmatter block containing `type`, `status`, and `blocked_by`, with `blocked_by` as a YAML list; the loose `Type:` / `Status:` / `Blocked by:` lines are gone from each; each ticket's `## Question` heading and body below are unchanged. — Requirement: *This map's own artifacts carry YAML frontmatter*, scenarios "A ticket after conversion" and "Ticket with no blockers".
  - Each ticket's preserved values match its pre-conversion loose lines exactly, per the mapping table below — `Blocked by: —` becomes `blocked_by: []`, single blockers become `[NN]`, and multi-blocker ticket 11 becomes `[03, 04, 05, 08, 10, 12, 13]` and ticket 13 becomes `[01, 04, 06, 09]`.
  - `route.md` is NOT modified by this task — no frontmatter is added to it and its `Status:` lines stay exactly as they are. — Requirement: *This map's own artifacts carry YAML frontmatter*, scenario "route.md is not converted".
- Steps:
  1. Read `bundle/templates/wayfinder/map.md` and `bundle/templates/wayfinder/ticket.md` to confirm the exact target frontmatter shape — map: a `---` block with `status: <value>` only; ticket: a `---` block with `type: <value>`, `status: <value>`, `blocked_by: <list>` (the field order is type, status, blocked_by).
  2. Convert `map.md`: insert a YAML frontmatter block at the very top of the file (before the `# Fork wayfinder into Hamilton` heading) containing exactly `status: shipping`, and delete the loose `Status: shipping` line (currently line 3) and the blank line that separated it from the heading. The file must go `---\nstatus: shipping\n---\n\n# Fork wayfinder into Hamilton` — no `type` field, no `blocked_by` field.
  3. Convert each of the thirteen ticket files using the exact value mapping below. For each file: insert a YAML frontmatter block at the very top (before the `#` heading) carrying `type`, `status`, `blocked_by` in that order, and delete the three loose lines (`Type:` / `Status:` / `Blocked by:` at lines 3–5) plus the blank line that separated them from the heading. The ticket's `## Question` heading and the entire body below it stay byte-for-byte unchanged.

     | ticket file | type | status | blocked_by |
     |---|---|---|---|
     | `01-map-artifact-layout.md` | grilling | resolved | `[]` |
     | `02-read-upstream-siblings.md` | research | resolved | `[]` |
     | `03-fork-attribution.md` | grilling | resolved | `[]` |
     | `04-map-mechanics-in-files.md` | grilling | resolved | `[01]` |
     | `05-template-convention.md` | grilling | resolved | `[01]` |
     | `06-route-shape-and-sdd-join.md` | grilling | resolved | `[01]` |
     | `07-which-siblings-to-port.md` | grilling | resolved | `[02]` |
     | `08-ticket-types.md` | grilling | resolved | `[07]` |
     | `09-boundary-with-propose-and-critique.md` | grilling | resolved | `[06]` |
     | `10-framework-docs-presentation.md` | grilling | resolved | `[09]` |
     | `11-compose-route.md` | task | resolved | `[03, 04, 05, 08, 10, 12, 13]` |
     | `12-propose-and-critique-use-grilling.md` | grilling | resolved | `[07]` |
     | `13-map-artifacts-and-worktrees.md` | grilling | resolved | `[01, 04, 06, 09]` |

     A converted ticket's top reads (example, ticket 04):

     ```yaml
     ---
     type: grilling
     status: resolved
     blocked_by: [01]
     ---
     ```

  4. Read each converted file's top to confirm the frontmatter carries exactly the mapped values, the loose header lines are gone, and the body below the frontmatter is unchanged.
- Verify: `rg -n '^Type:|^Status:|^Blocked by:' .hamilton/maps/hamilton-wayfinder/map.md .hamilton/maps/hamilton-wayfinder/tickets/*.md` → no matches (every loose header line is gone); `rg -L -c '^---$'` on each converted file or a read of each file's first line → every converted file begins with `---`; read `route.md` top → no frontmatter added.
- Commit: `docs: convert map.md and tickets to YAML frontmatter`

### Task 2: Add the `## Map mechanics` contract section to `CONTRIBUTING.md`

- Depends on: none (different file — may run in parallel with Task 1)
- Files:
  - Created: none
  - Modified: `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - A `## Map mechanics` section exists in `CONTRIBUTING.md`, placed immediately after the `## Licensing and attribution` section (the doc flows from contribution rules → licensing → artifact mechanics). — Requirement: *Map mechanics contract has a contributor-facing written home*, scenario "Contributor looks up the map frontmatter contract".
  - The section documents all three frontmatter fields and their valid values, exactly: ticket `type` is `research` / `prototype` / `grilling` / `task`; ticket `status` is `open` / `claimed` / `resolved`; map `status` is `open` / `cleared` / `shipping` / `shipped` (per [ticket 06](../../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md)); `blocked_by` is a YAML list of ticket numbers (`[]` for none, `[01]` for one, `[01, 04, 06, 09]` for several). The section notes that `map.md` carries `status` only (no `type`), matching the map template.
  - The section states the swap boundary explicitly: a future tracker backend would replace this `## Map mechanics` section in `CONTRIBUTING.md` together with the `## Map mechanics` section in `skills/hamilton-wayfinder/SKILL.md`, and no other `CONTRIBUTING.md` content would need to change. — Requirement: *Map mechanics contract has a contributor-facing written home*, scenario "Future tracker backend swaps the mechanics".
  - The section is genuinely isolated: it references NO other `CONTRIBUTING.md` content (no links to the Documentation Conventions or Licensing sections, no shared prose), and no other `CONTRIBUTING.md` content references map frontmatter. The section is self-contained — a backend can replace that one section without touching the rest of the file.
- Steps:
  1. Read `skills/hamilton-wayfinder/SKILL.md`'s `## Map mechanics` section (the agent-facing runtime contract) and the canonical [`wayfinder`](../../../specs/wayfinder.md) spec's `### Map mechanics` table to ground the field/value list. The `CONTRIBUTING.md` section is the concise contributor reference (fields, valid values, swap boundary); it is NOT a copy of the skill's fuller agent instructions, and it serves a different reader (a human creating map artifacts or a future-backend implementer).
  2. In `CONTRIBUTING.md`, add a new `## Map mechanics` section immediately after the `## Licensing and attribution` section (after its closing content). Draft the section self-contained: a short intro stating this is the file-native frontmatter contract for map artifacts and the swappable surface a future tracker backend replaces; a field reference listing the three fields and their valid values (ticket `type`: `research` / `prototype` / `grilling` / `task`; ticket `status`: `open` / `claimed` / `resolved`; map `status`: `open` / `cleared` / `shipping` / `shipped`; `blocked_by`: a YAML list of ticket numbers, with `map.md` carrying `status` only); a note naming the swap boundary — replacing this section and the skill's `## Map mechanics` section is the entire surface a backend swaps. Use a compact field/value table for the values, consistent with the table style already in `CONTRIBUTING.md`'s Documentation Conventions section. Do NOT cross-reference the Documentation Conventions or Licensing sections, and do NOT reproduce licence text.
  3. Read the new section end-to-end and confirm: all three fields and their exact valid values are present; the swap boundary is stated; `map.md`'s status-only shape is noted; and the section references nothing else in `CONTRIBUTING.md`. Then read the rest of `CONTRIBUTING.md` and confirm nothing else in the file references map frontmatter or this section.
- Verify: `grep -n '^## Map mechanics' CONTRIBUTING.md` → exactly one match, positioned after the `## Licensing and attribution` section; read the section to confirm the three fields, their valid values, the swap-boundary statement, and the isolation (no cross-references to other `CONTRIBUTING.md` content); `rg -n 'frontmatter|blocked_by|Map mechanics' CONTRIBUTING.md` outside the new section → no matches (the rest of the file does not reference map mechanics).
- Commit: `docs: add Map mechanics contract section to CONTRIBUTING.md`

## Done when

- All tasks implemented (recorded in `progress.md`)
- `rg -n '^Type:|^Status:|^Blocked by:' .hamilton/maps/hamilton-wayfinder/map.md .hamilton/maps/hamilton-wayfinder/tickets/*.md` returns nothing — every loose header line is gone
- Every converted file begins with `---` (frontmatter present); `route.md` does NOT begin with `---` (untouched)
- `git diff --name-only` shows only the fifteen in-scope files (`map.md`, the thirteen tickets, `CONTRIBUTING.md`) — no `route.md`, no `src/`, no `bundle/templates/`, no `tests/`, no `skills/`
- `bun run build` passes; `bun --bun vitest run` passes
- All review feedback has been addressed
