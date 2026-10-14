# Progress: Teach propose to read a route

## Review: full unit diff (propose entrypoint) — 2026-08-09
- Verdict: approved (blocking: 0, suggestions: 1) — see review.md
- Diff is two hunks in `skills/hamilton-propose/SKILL.md` (+18/-4): step 1 detection +
  title derivation, step 3 decision-link navigation. Steps 4–10 byte-identical
  (entrypoint-only guarantee holds).
- All 5 propose requirements satisfied; both edge cases (no-pending-unit, no-backing-
  tickets) handled; route-from-working-tree SHALL NOT (ticket 13) stated verbatim.
- Gates green: `bun run build` exit 0; `bun --bun vitest run` 24/24 pass (3 files).
- 1 non-blocking suggestion (step 1 "Otherwise" branch-boundary clarity) — deferred to
  the `writing-great-skills` pass (next task).
- Next step: `writing-great-skills` craft pass on `skills/hamilton-propose/`, then
  `hamilton-finish-work` (local-merge into `port-wayfinder-siblings`).

## Craft pass: writing-great-skills on hamilton-propose — 2026-08-09
- Five findings, all in the two hunks this unit added; fixed in place at `acdfbdd`.
- Negation (step 1): dropped the forbidden-command list (`git show`/`git checkout`) for a
  positive-led clause — the working tree's copy is the session's copy — with a tight
  `never the default branch's` guardrail (ticket 13's SHALL NOT preserved).
- Negation (step 1): dropped `do not fall through to free-form mode`; the positive `stop and
  tell the user` already binds.
- Duplication (step 1): collapsed the `the branch the session started on` restatement.
- Ambiguity (step 1, review's deferred suggestion): restructured so the free-form default
  leads and map-aware is the explicit exception; the no-pending stop is terminal inside it.
- Duplication (step 3): tightened the `Backed by:` gloss.
- Gates green after the pass: build exit 0, 24/24 tests. Diff two hunks, +11/−14 vs coder tip.

## Finish — 2026-08-09
- Preconditions: tree clean, tests green (24/24), build exit 0, review approved (0 blocking)
- Specs synced: `propose` created (`.hamilton/specs/propose.md`) — first-time tracking, distilled from the 5 ADDED map-aware entrypoint requirements; route-from-working-tree invariant lifted to altitude (effect, not the git-command enumeration the skill's own craft pass already removed)
- Finished: local-merge into `port-wayfinder-siblings`
- Workspace: worktree `.worktrees/unit-08-propose-reads-route` removed after merge
