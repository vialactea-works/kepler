# Progress: Convert the map's own files to the mechanics contract

<!-- Newest entries at the bottom. One block per task attempt. -->

## Task 1 + Task 2: coder implementation — 2026-08-09

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/map.md`; all thirteen `tickets/NN-slug.md`; `CONTRIBUTING.md`
  - Deleted: none
- Verified: `rg '^Type:|^Status:|^Blocked by:'` → no matches; `git diff --name-only` → exactly 15 files; `bun run build` exit 0; `bun --bun vitest run` 24/24 exit 0
- Notes: Two commits (`b1f877c`, `720e9dc`). `map.md` carries `status: shipping` only (no `type`) per design Decision 2, overruling the playbook coder note's `type: map` suggestion. CONTRIBUTING.md `## Map mechanics` section added after `## Licensing and attribution`, genuinely isolated.

## Review: Full diff (Task 1 + Task 2) — 2026-08-09

- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Finish — 2026-08-09
- Preconditions: tree clean, tests green (24/24), build exit 0, review approved
- Specs synced: `wayfinder` updated — `blocked_by` wording reconciled from "comma-separated ticket slugs" to YAML list of ticket numbers; `type` row qualified as `(ticket)`; `map.md` carries `status` only stated explicitly; contributor-facing `CONTRIBUTING.md` home documented in the `### Map mechanics` section; two-homes decision added to `## Decisions`
- Finished: local-merge into `port-wayfinder-siblings` (worked in place — work was already on the target branch; unit-10 worktree torn down, branch deleted)
- Workspace: worked in place on `port-wayfinder-siblings`; unit-10 worktree at `/Users/caio.cavalcante/personal/hamilton/.worktrees/unit-10-map-mechanics-contract` removed, branch `unit-10-map-mechanics-contract` deleted
- Map status flipped to `shipped` (last unit — destination reached); route top-level and §10 status flipped to `shipped`
