# Progress: Land the glossary

## Task 1: Write `.hamilton/specs/glossary.md` — 2026-08-05

- Outcome: done
- Changed:
  - Created: `.hamilton/specs/glossary.md`
  - Modified: none
  - Deleted: none
- Verified: `grep -nE 'SHALL|WHEN|THEN' .hamilton/specs/glossary.md` → no matches (exit 1);
  `grep -n '^## '` → the three clusters in the specified order (The map and its parts / Working the
  map / From map to code); ten bolded entries covering the eleven terms, with *unit* folded into
  *change-sized unit* as its route-time shorthand per the plan; every relative link target resolves
  on disk (`map.md` plus tickets 01, 04, 06, 08); `bun run build` → exit 0;
  `bun --bun vitest run` → 23 passed (3 files), unchanged.
- Notes: One wording call worth a reviewer's eye. Ticket 04's *Claiming stays* subsection ends
  "claiming does not change the frontier calculation: a claimed ticket is still open, not unblocked
  or resolved" — but the wayfinder skill defines the frontier as the open, **unblocked, unclaimed**
  tickets, which the plan directs the *frontier* entry to use. Taken literally, ticket 04's sentence
  would put a claimed ticket both on and off the frontier. The glossary's *claim* entry therefore
  states only the unambiguous half — "a claimed ticket is still open, not resolved" — and does not
  assert anything about the frontier calculation, so neither entry contradicts the other and nothing
  is invented past the source. The separate contradiction the plan already flagged (ticket 04's
  one-line Answer header says "Tickets drop claiming", against its own *Claiming stays* subsection
  and `map.md`'s Decisions-so-far gist) was handled as instructed: the subsection and the map's gist
  govern, and the slip is not surfaced inside the glossary entry.

## Review: Task 1: Write `.hamilton/specs/glossary.md` — 2026-08-05
- Verdict: changes-requested (blocking: 1, suggestions: 1) — see review.md

## Task 1 (review fix): Write `.hamilton/specs/glossary.md` — 2026-08-05
- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/specs/glossary.md`
  - Deleted: none
- Verified: `grep -nE 'SHALL|WHEN|THEN' .hamilton/specs/glossary.md` → no matches (exit 1);
  `bun run build` → exit 0.
- Notes: Addressed review.md's blocking finding. The *route* entry's field list dropped "and a
  suggested entry point into the pipeline" — that field was ticket 06's original shape, but
  `route.md`'s own preamble records ticket 09 collapsing it into a constant ("every unit enters at
  `hamilton-propose`"), so listing it as a per-unit field was stale and unsupported by the current
  route text. The remaining field list ("a name, a goal paragraph, links to the decisions backing
  it, and its ordering against the other units") matches what `route.md`'s units actually carry.
  Re-wrapped the paragraph to the file's ~100-char hard-wrap convention afterward, since trimming
  the sentence left one short line breaking that pattern.

## Review: Task 1 (review fix): Write `.hamilton/specs/glossary.md` — 2026-08-05
- Verdict: approved (blocking: 0, suggestions: 0) — see review.md

## Finish — 2026-08-05
- Preconditions: tree clean, tests green (`bun --bun vitest run` → 23 passed, 3 files), build
  green (`bun run build` → exit 0), review approved with no unaddressed blocking items.
- Specs synced: none. This change's deliverable, `.hamilton/specs/glossary.md`, is itself the
  canonical artifact — `design.md`'s "no requirements/<capability>.md delta" decision means there
  is no per-capability delta to distill into a separate canonical spec; the glossary was written
  directly to its final, canonical location in Task 1.
- Finished: local-merge into `claude/compassionate-bose-d06f8d` (fast-forward — `land-the-glossary`
  was 3 commits ahead with no divergence).
- Workspace: worktree `.claude/worktrees/wayfinder-map/.worktrees/land-the-glossary` removed.
