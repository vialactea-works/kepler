# Progress: Adopt Apache 2.0 and the attribution convention

## Task 1: Add the Apache 2.0 licence text — 2026-08-05

- Outcome: done
- Changed:
  - Created: `LICENSE`
  - Modified: none
  - Deleted: none
- Verified: `head -2 LICENSE && grep -c 'APPENDIX: How to apply' LICENSE && wc -l LICENSE` → `Apache License` / `Version 2.0, January 2004` header, count 1, 202 lines
- Notes: file is byte-identical to published Apache text; appendix placeholder `Copyright [yyyy] [name of copyright owner]` left untouched as required

## Task 2: Add the root NOTICE with upstream attribution — 2026-08-05

- Outcome: done
- Changed:
  - Created: `NOTICE`
  - Modified: none
  - Deleted: none
- Verified: MIT text diff (empty), copyright line count: 1
- Notes: MIT text is byte-identical to upstream source after 2-space indent removal; NOTICE file structure complete with Hamilton copyright and mattpocock/skills attribution

## Task 3: Declare the licence in package.json — 2026-08-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `package.json`
  - Deleted: none
- Verified: `node -e 'const p=require("./package.json"); if(p.license!=="Apache-2.0"||p.private!==true) process.exit(1); console.log("ok")'` → ok
- Notes: none

## Task 4: State the licence in the README — 2026-08-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `README.md`
  - Deleted: none
- Verified: `tail -8 README.md` → shows the `## License` section with links to both `[LICENSE](LICENSE)` and `[NOTICE](NOTICE)`, no prose describing origin of wayfinder skills
- Notes: review flagged the clause "and in a `NOTICE` file beside each forked skill directory" as asserting directories that have not shipped (design.md: "nothing asserts the existence of a directory that has not shipped"). Escalated as a plan-mandated finding — plan Task 4 Step 2 prescribes that wording. User ruled the plan governs: the clause states the repo's convention rather than an inventory, and matches the parallel sentence in the already-approved root `NOTICE`. Kept as written; no re-dispatch.

## Task 5: Write the forked-skill attribution rule into CONTRIBUTING.md — 2026-08-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `CONTRIBUTING.md`
  - Deleted: none
- Verified: MIT text diff (empty) — template's MIT text is byte-identical to root `NOTICE`'s
- Notes: none

## Task 6: Flip unit 2 to shipped in the route — 2026-08-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Verified: `git diff --stat .hamilton/maps/hamilton-wayfinder/route.md` → 1 insertion, 1 deletion
- Notes: none

## Review fix: whole-branch review — 2026-08-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `CONTRIBUTING.md`
  - Deleted: none
- Verified: `diff <(sed -n '/^  MIT License$/,/SOFTWARE\.$/p' NOTICE) <(sed -n '/^  MIT License$/,/SOFTWARE\.$/p' CONTRIBUTING.md)` → no output; `bun run test` passed 23 tests; `bun run build` completed with no errors
- Notes: applied the one non-blocking finding from the whole-branch review — "read and brings into context" → "read and bring into context" (line 30). No other change.

## Finish — 2026-08-05

- Preconditions: tree clean; `bun run test` → 23 passed (3 files); `bun run build` clean; all six tasks recorded `Outcome: done`. **`review.md` was absent** — the per-task and whole-branch reviews ran as orchestrated subagents that returned verdicts to the controller without persisting the artifact, so no durable verdict existed to read. Rather than treat the missing file as an approval, the gate's substantive properties were re-verified directly at finish time: the MIT permission text in `NOTICE` diffs clean against a fresh fetch of upstream's own `LICENSE`, the `CONTRIBUTING.md` template's copy diffs clean against `NOTICE`, the branch touches no file under `src/` or `tests/`, `package.json` parses with `license: Apache-2.0` and `private: true` intact, and unit 2's route status reads `shipped`.
- Specs synced: created `.hamilton/specs/licensing.md` — distilled from `requirements/licensing.md`, `design.md`, and `proposal.md` into the canonical Overview / Contract / Behavior / Invariants / Decisions skeleton.
- Finished: local-merge into `claude/compassionate-bose-d06f8d`
- Workspace: worktree `.worktrees/licensing-and-attribution` removed

