# Review: Convert the map's own files to the mechanics contract

## Full diff (Task 1 + Task 2) — 2026-08-09

Verdict: approved

Verified against `plan.md` (both tasks), `requirements/wayfinder.md` (both MODIFIED requirements, all four scenarios), and `design.md` (all four decisions). The diff under review is commits `b1f877c` (frontmatter conversion) and `720e9dc` (CONTRIBUTING.md section) — `548e752..720e9dc`, fifteen files.

### What was verified

- **No loose header lines remain.** `rg '^Type:|^Status:|^Blocked by:'` over `map.md` + all thirteen tickets → no matches (exit 1). Every loose line is gone.
- **Every converted file begins with `---`.** All fourteen files (map.md + 13 tickets) confirmed to start with a YAML frontmatter block.
- **`map.md` frontmatter is `status: shipping` only** — no `type`, no `blocked_by`, matching the map template (`bundle/templates/wayfinder/map.md`) and the design's Decision 2. The `# Fork wayfinder into Hamilton` heading and body below are unchanged.
- **All thirteen tickets carry `type` / `status` / `blocked_by` in that order**, with values matching the plan's mapping table exactly — spot-checked every ticket against the diff: 01 `grilling`/`resolved`/`[]`, 02 `research`/`resolved`/`[]`, 04 `[01]`, 07 `[02]`, 11 `task`/`[03, 04, 05, 08, 10, 12, 13]`, 13 `[01, 04, 06, 09]`, etc. `blocked_by` is a YAML list in every ticket; `Blocked by: —` correctly became `[]`. Each ticket's `## Question` heading and body are unchanged.
- **`route.md` is untouched** — not in the diff; still begins with `# Route`, no frontmatter added (requirement scenario "route.md is not converted" satisfied).
- **Exactly fifteen files in the diff** — `map.md`, thirteen tickets, `CONTRIBUTING.md`. No `route.md`, no `src/`, no `bundle/templates/`, no `tests/`, no `skills/` (scope and boundary check passed).
- **`## Map mechanics` section in `CONTRIBUTING.md`** is positioned immediately after `## Licensing and attribution` (the doc flows Documentation Conventions → Licensing → Map mechanics). It documents all three fields and their exact valid values: ticket `type` (`research`/`prototype`/`grilling`/`task`), ticket `status` (`open`/`claimed`/`resolved`), map `status` (`open`/`cleared`/`shipping`/`shipped` per ticket 06), `blocked_by` (YAML list). It notes `map.md` carries `status` only. It states the swap boundary explicitly.
- **Genuine isolation confirmed.** `rg 'frontmatter|blocked_by|Map mechanics'` over CONTRIBUTING.md lines 1–68 (everything outside the new section) → no matches. The section references no other CONTRIBUTING.md content; no other content references map frontmatter. A future backend can replace that one section without touching the rest of the file (requirement scenario "Future tracker backend swaps the mechanics" satisfied).
- **Gates green.** `bun run build` → exit 0. `bun --bun vitest run` → 24/24 tests passed, exit 0.

### Notes (non-blocking, no action required)

- The DRY concern (contract now in two homes — `CONTRIBUTING.md` contributor-facing and `skills/hamilton-wayfinder/SKILL.md` agent-facing) is accepted in `design.md` under Risks / Trade-offs with a named future consolidation effort. Not a coder defect — it traces to the design.
- The spec table's "comma-separated ticket slugs" wording for `blocked_by` vs the YAML list syntax used here is noted in `design.md` for finish-work reconciliation. Not a code defect.
