# Review: Refactor propose and critique onto hamilton-grilling

## Full unit diff (propose + critique + grilling) — 2026-08-09

Verdict: approved

### What was verified

**Intent established.** Read `proposal.md`, `design.md` (4 decisions + Quality Lens),
`requirements/propose.md` (5 ADDED), `requirements/critique.md` (5 ADDED), and `plan.md`
(4 TDD-sized tasks) for what the work was meant to do and its acceptance criteria. No
`progress.md` existed from the coder; this review establishes the first progress entry.

**Diff inspected in full.** `git diff port-wayfinder-siblings...HEAD` across the two edited
skill files (`skills/hamilton-propose/SKILL.md`, `skills/hamilton-critique/SKILL.md`).
`skills/hamilton-grilling/SKILL.md` diff is **empty** — unchanged, as the design requires.

**Correctness — every requirement scenario satisfied:**

Propose:
- #1 Clarifying-questions delegation (step 4): content (purpose, constraints, success
  criteria) + "intent is clear" exit + attendance guard — all present.
- #2 Approach-choice delegation (step 7): step 7 **still builds** the 2–3 approaches +
  trade-offs + recommendation; only the ask delegates; "an approach is chosen" exit; guard.
- #3 Approval-loop delegation (step 10): revision feedback as content, "artifacts approved"
  exit, guard; "Do not pass the gate until approved" retained.
- #4 Attendance guarded at each site: all three call sites carry attended/unattended branches.
- #5 No duplication: protocol-language grep
  (`one at a time|multiple-choice|lead with your recommendation|get the requester|...`)
  → **zero hits** in both edited skills. Principles "Collaborate." bullet trimmed to
  "confirm each section before moving on"; diagram node label `"\n(one at a time)"` removed
  from the declaration + all 3 edges.

Critique:
- #1 Grilling on changes-requested, between rubric (4) and report (7): new step 6 after the
  verdict (5); "every finding is validated" exit; false positive rejectable; author picks
  among several fixes.
- #2 No grilling on approved: "On the `approved` path there are no findings, so grilling never
  runs." Diagram approved edge bypasses the validate node.
- #3 Report from validated set: step 7 "written from the findings that survived validation."
- #4 Attendance guarded: "Unattended, name the next step and return."
- #5 "Judge, don't fix" preserved: step 6 "validates findings — it does not fix them: the
  propose artifacts are not modified, and the revision loop stays with whoever runs the
  pipeline"; intro (lines 18–20), Output, and Handoff consistent and unchanged.

**Route craft warning — end-to-end read, not just the diff.** Read both edited `SKILL.md`
files start to finish (propose 198 lines, critique 201 lines):
- No leftover half-instruction references the removed protocol. Step 4's "Draw out purpose,
  constraints, and success criteria from the requester" is the call-site **content** (what to
  ask), not protocol (how to ask) — grilling owns the how.
- No step reads as a non-sequitur after extraction. Steps 4/7/10 each read coherently: content
  → attended delegation → unattended fallback → gate.
- No duplication between what propose says about dialogue and what grilling owns. The only
  "recommendation" in step 7 ("with their trade-offs and a recommendation") is propose's
  domain content (which approach it recommends), not grilling's protocol (lead with a
  recommendation when asking). The propose Handoff's "ask whether to move on to hamilton-plan"
  is the shared Hamilton handoff convention (identical wording to `hamilton-review`'s own
  Handoff), not grilling's one-question-at-a-time protocol.
- Critique step 6 reaffirms "Judge, don't fix" in context (validates ≠ fixes) — necessary
  clarification for a reader who might wonder whether grilling editing findings counts as
  fixing; consistent with the intro and Handoff, not sediment.

**Boundaries respected.** `hamilton-grilling/SKILL.md` untouched (diff empty). No unattended
mode added to grilling (grep → zero hits). "Judge, don't fix" survives. The
`docs/skills.md` "skills do not call each other" sentence is now false — but the design
explicitly defers correcting it to unit 9 (recorded as a Non-Goal), so it is not a finding
for this change.

**Tests.** None required (ticket 12: `skills/` is not bundled; no test asserts on skill
content). Gates re-run during review: `bun run build` → exit 0; `bun --bun vitest run` →
24/24 pass (3 files).

**Security.** N/A — prose edits to two skill files; no secrets, no code, no input handling.

**Structural quality (code-quality.md rubric, scaled to a prose diff):**
- Single responsibility — each step keeps one responsibility; grilling owns the protocol,
  callers own content + exit conditions.
- DRY / single source of truth — the protocol lives in one place (grilling); the inline copies
  are gone (grep confirms).
- Low coupling — callers depend on grilling by name (invoke), not its internals; the dialogue
  spec fixes the boundary.
- Right-sized abstraction — a delegation call is a sentence, not a framework; the attendance
  guard is repeated at four sites rather than abstracted, preserving the procedural read
  (design decision 1, explicitly accepted).

### Suggestions (non-blocking)

- [`skills/hamilton-critique/SKILL.md`:82–89] The "several fixes → author picks one" behavior
  (req critique #1, scenario "A finding offers several fixes") requires that the chosen fix be
  recorded and alternatives noted in `critique.md`. Step 6 says the author picks one; step 7
  says the report is "from the findings that survived validation"; the report format's `Fix:`
  field already supports sub-numbered options ("sub-number 1./2. when there are options"). The
  behavior is achievable by assembling these three pieces, but no single step explicitly says
  "record the chosen fix and note the alternatives in the report." Optional: tighten step 6 or
  7 to make the recording explicit. The mandated `writing-great-skills` pass (next playbook
  task) is the natural place to address this.
