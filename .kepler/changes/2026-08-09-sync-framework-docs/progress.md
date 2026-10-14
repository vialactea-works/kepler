# Progress: Sync the framework docs

## Task 1: Add the `hamilton-wayfinder` entry to `docs/skills.md` — done

Added the `### \`hamilton-wayfinder\`` entry between `hamilton-init` and `hamilton-propose`, in the
established When/Inputs/Produces/Notes/Source format. Carries the one-sentence rule (ticket 09)
verbatim and the fork provenance in prose (fork of `mattpocock/skills`, MIT, link to `NOTICE`) in
the Notes bullet.

## Task 2: Adjust the pipeline identity phrasing in `docs/skills.md` — done

Replaced "Seven skills." with "Six core skills in fixed sequence, plus an optional pre-change
planning stage (wayfinder)." The rest of the paragraph and the ASCII diagram are untouched.

## Task 3: Add the map-artifacts mapping row to `CONTRIBUTING.md` — done

Added `| New/changed map artifacts in `.hamilton/maps/` | `docs/skills.md` |` immediately after the
existing wayfinder-templates row. Both rows present, distinct, not merged. Path surfaces wrapped in
backticks to match the table's established convention (CONTRIBUTING.md rule 3).

## Gates

- `bun run build`: exit 0
- `bun --bun vitest run`: all passing
- `git diff --name-only`: only `docs/skills.md` and `CONTRIBUTING.md`

## Review: unit-9 docs diff (`docs/skills.md` + `CONTRIBUTING.md`) — 2026-08-09
- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Finish — 2026-08-09
- Preconditions: tree clean, tests green (build exit 0, 24/24 passed), review approved
- Specs synced: framework-docs created (first-time tracking — no prior canonical spec; distilled from proposal/design/requirements into the skeleton)
- Finished: local-merge into port-wayfinder-siblings
- Workspace: worktree `.worktrees/unit-09-sync-framework-docs` removed
