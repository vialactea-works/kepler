# Review: Teach propose to read a route

## Full unit diff (propose entrypoint) — 2026-08-09

Verdict: approved

### What was verified

**Intent established.** Read `proposal.md`, `design.md` (5 decisions + Quality Lens),
`requirements/propose.md` (5 ADDED), and `plan.md` (3 tasks) for what the work was meant
to do and its acceptance criteria. No `progress.md` existed from the coder; this review
establishes the first progress entry.

**Diff inspected in full.** `git diff 4a8079d..ae87e81` — the coder's two commits touched
one file (`skills/hamilton-propose/SKILL.md`, +18/-4) in exactly two hunks: step 1
(map-folder detection + title derivation) and step 3 (decision-link navigation). Steps 4–10
and every surrounding section (Principles, Inputs, References, Process flow, Output,
Handoff) are byte-identical to the pre-change state — the entrypoint-only guarantee holds.

**Correctness — every requirement scenario satisfied:**

- #1 Map-folder detection (step 1): "If the request points at a `.hamilton/maps/<effort>/`
  folder that contains a `route.md`, enter map-aware mode" — detection + map-aware entry.
  The free-form fallback ("Otherwise derive a kebab-case title from the request") preserves
  the original behaviour when no map folder is referenced. Both scenarios (points at a map
  folder / does not) covered.
- #2 Route read from the session's starting branch (step 1): "read `route.md` from the
  working tree — the branch the session started on — and do not reach for the default
  branch's copy via `git show`, `git checkout`, or any equivalent" — ticket 13's SHALL NOT
  stated verbatim, with the worktree-base reasoning appended so a future editor cannot
  reintroduce a cross-branch fetch.
- #3 Next pending unit + title from the unit's name (step 1): "Scan the `### N.` units in
  order and find the first whose `Status:` line reads `pending`; derive the kebab-case
  change title from that unit's name (the heading text after `### N.`)". No-pending-unit
  edge: "stop and tell the user ... do not fall through to free-form mode". The scanned
  format matches the route template (`### N. <name>` + `Status: pending`) and the worked
  example this route file is.
- #4 Decision links navigated (step 3): "When step 1 entered map-aware mode, also navigate
  the selected unit's backing decision links — the tickets listed in its `Backed by:` line
  — reading each linked `tickets/NN-slug.md` ... feed that into this exploration". No-
  backing-tickets edge: "proceed with its route entry's goal paragraph alone". The
  navigation is conditional on step 1's mode — free-form mode reaches step 3 unchanged.
- #5 Steps 4–10 unchanged: verified byte-identical via `git diff` — only the two known
  hunks; no edit crept past step 3. The map-aware branch merges back into the existing
  flow at "Then detect isolation:" (step 1) and at the decompose-if-multi-subsystem guard
  (step 3), so step 4 onward reads coherently with the new front logic.

**End-to-end coherence read.** Read `skills/hamilton-propose/SKILL.md` start to finish
(211 lines). The map-aware conditional in step 1 rejoins the existing isolation logic at
"Then detect isolation:" with no non-sequitur; step 3's map-aware sentence flows between
the specs-reading instruction and the decompose guard; step 4 ("Ask clarifying questions.")
follows naturally. No sentence in steps 4–10 or the Handoff implies map-aware mode changes
behaviour after step 3. The "selected unit" reference in step 3 resolves to the unit step 1
selected — the only unit the skill has selected at that point.

**Boundaries respected.** Only `skills/hamilton-propose/SKILL.md` touched; no other skill,
no CLI, no templates, no tests. Design's off-limits markers (steps 4–10; every other skill)
all hold.

**Tests.** None required (ticket 09 + plan: `skills/` is not bundled, `hamilton setup`
never installs it, no test asserts on skill content — unit-7 precedent). Gates re-run
during review: `bun run build` → exit 0; `bun --bun vitest run` → 24/24 pass (3 files).

**Security.** N/A — prose edit to one skill file; no secrets, no code, no input handling.

**Structural quality (code-quality.md rubric, scaled to a prose diff):**
- Single responsibility — step 1 keeps title + workspace; step 3 keeps context. Each
  addition extends the step's existing responsibility rather than introducing a new one.
- DRY / single source of truth — map-aware mode is a conditional branch that merges back
  at step 4, not a duplicated process flow. The route is the single source of unit truth;
  propose reads it, does not copy it.
- Low coupling — propose depends on `route.md`'s public format (`### N.`, `Status:`,
  `Backed by:`), not on wayfinder's internals.
- Right-sized abstraction — two conditional sentences, no "map-aware mode framework."
- Open for extension — a new input type (map folder) joins the existing input type
  (free-form request) without modifying the free-form path.

### Suggestions (non-blocking)

- [`skills/hamilton-propose/SKILL.md`:74] "Otherwise derive a kebab-case title from the
  request" sits immediately after the no-pending-unit stop ("do not fall through to
  free-form mode"). The disambiguating clause makes "Otherwise" mean "if the request did
  not point at a map folder" (not "if no unit was pending"), but a fast reader could
  momentarily parse "Otherwise" as resuming the no-pending case. Optional: lead the
  free-form fallback more explicitly (e.g., "If the request did not point at a map folder,
  derive a kebab-case title from the request.") so the branch boundary is unambiguous
  without relying on the negative clause. The mandated `writing-great-skills` pass (next
  playbook task) is the natural place to address this.
