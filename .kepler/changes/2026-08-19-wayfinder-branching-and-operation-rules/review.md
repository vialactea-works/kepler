<!--
  Review — the review artifact for a change.
  Lives at: .hamilton/changes/<change>/review.md
  Written by the review step each pass: the verdict plus located, actionable feedback the
  coder acts on. Newest pass at the bottom. progress.md keeps the one-line timeline.
  <scope reviewed> is machine-checkable: exactly "Task <N>" or "whole change" —
  finish-work's gate reads these values.
-->

# Review: Wayfinder branching and operation rules

## Task 1 — 2026-08-19

Verdict: approved

Verified against plan.md Task 1 and requirements/ticket-resolution.md ("Branch created before
code", "Standalone invocation"):

- `bundle/scripts/hamilton-prototype-branch.sh` implements all three modes correctly: create
  mode (`<map-name> <ticket-name>` → `prototype/<map-name>/<ticket-name>`), `--standalone
  <slug>` → `prototype/<slug>`, and `--verify <expected-branch>`. Traced the control flow by
  hand: argument-count validation happens before the `require_repo` guard in every branch,
  `main()` has no trailing `exit`, so the script's final exit status is whatever `cmd_switch`/
  `cmd_verify` returned — 0 on create/resume success, 1 only on `--verify` mismatch (via
  `return 1`), 2 via `die()` for usage/environment errors. This matches the plan's exit-code
  contract exactly and mirrors `hamilton-isolate.sh`'s structure (`usage()`/`die()`/
  `require_repo()`, no `set -e`, quoted variable expansions, last line load-bearing).
- Existing-branch resume path (`git show-ref --verify --quiet refs/heads/<branch>` →
  `git switch` + `mode: resumed`) matches the design's "branch is the ticket's identity"
  decision; create path uses plain `git switch -c`, so uncommitted (untracked) changes ride
  along as specified — no stash, no dirty-tree guard, matching the design's accepted
  trade-off.
- `tests/scripts/prototype-branch.test.ts` implements exactly the 8 cases plan.md's Step 1
  enumerates (create+switch, uncommitted file survives, resume, standalone, verify
  success/failure, no-args exit 2, non-repo exit 2), follows `isolate.test.ts`'s structure and
  `helpers.ts`'s `run`/`git`/`makeRepo`/`field` seam (no mocks), and each assertion checks
  observable state (branch via `git branch --show-current`, `mode` field, `lastLine`, file
  survival, exit status) rather than implementation details — would fail if the script
  regressed.
- No comments in the TypeScript test file; the bash script's header/usage comments follow
  `hamilton-isolate.sh`'s own idiom, which the plan explicitly directs ("in the style of
  hamilton-isolate.sh").
- `hamilton-isolate.sh` untouched; no frontier/claim/ticket-type/map-lifecycle files touched.
- The known `tests/cli/setup.test.ts` failure (expected-scripts list missing the new script
  name) is Task 2's responsibility per plan.md and is correctly left untouched here — not a
  Task 1 defect.

### Suggestions

- [`.hamilton/changes/2026-08-19-wayfinder-branching-and-operation-rules/plan.md`] The commit
  bundles a 144-line planning artifact (never committed by the prior planning session) into
  Task 1's commit, alongside the new `progress.md`. The report's stated rationale (nothing
  should stay uncommitted under the change directory, and no later task's Files list claims
  `plan.md`) is reasonable and the content itself is untouched, so this isn't blocking — but it
  is a file outside Task 1's declared Files list (`bundle/scripts/hamilton-prototype-branch.sh`,
  `tests/scripts/prototype-branch.test.ts`). Worth a one-line callout in the commit message or
  progress.md if this pattern recurs, so reviewers don't have to re-derive the rationale each
  time.
- [`tests/scripts/prototype-branch.test.ts:23`] "Carries an uncommitted change along the
  switch" only exercises an *untracked* file (`write()` without `git add`), which `git switch`
  always carries regardless of target branch. A modified-but-uncommitted *tracked* file would
  more directly test the "uncommitted changes ride along" claim (tracked-file edits are the
  case where `git switch` could in principle refuse). Not required by plan.md's Step 1 wording,
  which the test matches literally, so not blocking.

## Task 2 — 2026-08-19

Verdict: approved

Verified against plan.md Task 2 (single commit `5d34756`, diff confined to
`.hamilton/changes/2026-08-19-wayfinder-branching-and-operation-rules/progress.md`,
`docs/skills.md`, `tests/cli/setup.test.ts`):

- `tests/cli/setup.test.ts`'s `SCRIPT_FILES` array gains `"hamilton-prototype-branch.sh"` as
  the 5th entry, after `hamilton-precondition-check.sh` — correct alphabetical position
  (`precondition` < `prototype` at the third differing character, `e` vs `o`). Trailing comma
  added to the preceding line, syntax is valid.
- `docs/skills.md`'s Helper scripts section: "installs four scripts" → "installs five scripts"
  and "Three properties hold across all four" → "...all five", both exactly as the plan
  specifies. The new table row —
  `` `hamilton-prototype-branch.sh` | Create/resume `prototype/<map-name>/<ticket-name>` from
  the current branch (`<map> <ticket>`, `--standalone <slug>`) or confirm the checkout landed
  (`--verify <branch>`) | `wayfinder-prototype` `` — matches the plan's specified wording
  verbatim and follows the existing table's format (backtick-quoted script name and flags,
  em-dash-free prose, single "Called by" skill).
- Confirmed by direct file read (`sed -n '250,282p' docs/skills.md`) that the row sits
  correctly among the other four and that "Three properties hold across all five" reads
  naturally with the table above it.
- Scope: diff touches only the two files plan.md's Files list names plus the change's own
  `progress.md` (Task 2 entry + prior review's one-liner, consistent with the established
  per-task journaling pattern from Task 1). No production TypeScript beyond the test file, no
  `hamilton-isolate.sh`, no wayfinder skill files — all binding constraints held.
- `bundle/scripts/hamilton-prototype-branch.sh` (created in Task 1, already approved) is
  present and executable on disk, so the setup-test claim the implementer reports (15/15,
  full suite 98/98) is plausible; test execution itself was not independently re-run per
  review instructions.
- Cross-checked the report at
  `/private/tmp/claude-502/.../scratchpad/task-2-report.md` against the diff — its description
  of changes matches exactly what the diff shows; no discrepancies between claimed and actual
  changes.

No blocking issues, no suggestions.

## Task 3 — 2026-08-19

Verdict: approved

Verified against plan.md Task 3 and requirements/artifact-templates.md ("Map template
installed", "Operation rules distinguished from Notes"); diff confined to a single commit
(`094f552`) touching `bundle/templates/wayfinder/map.md` and this change's `progress.md` only:

- Frontmatter gains `branch:` (empty, to be filled at map creation) directly under
  `status: open`, followed by a hint comment: "branch names the branch the effort works from
  and merges back into, set at map creation" — matches the requirement's field meaning
  verbatim. The hint sits on its own line immediately after the closing `---`, following the
  same blank-line/hint-line/blank-line rhythm every other section hint in this file already
  uses (confirmed by diffing spacing against the Destination/Notes hints) — this is the only
  frontmatter field with a hint anywhere in `bundle/templates/`, so there's no competing
  precedent for a same-line YAML-comment style, and adopting the established HTML-comment
  idiom here is the more consistent choice, not a deviation from it.
- `## Operation rules` inserted between `## Notes` and `## Decisions so far`, with a hint
  stating it holds "prescriptive, per-session-binding rules on how working sessions operate
  (e.g. commit after resolving a ticket, delegate a job class to a named subagent), may be
  empty, and distinguished from Notes' orienting context" — reproduces the plan's required
  hint content and the requirement's "distinguish it from Notes" instruction word for word.
- Body section order confirmed by direct read: Destination, Notes, Operation rules, Decisions
  so far, Not yet specified, Out of scope — exactly the six sections in the required order,
  no seventh.
- Header comment block (including "Delete this comment block and every inline hint comment
  before finalizing") and the HTML-comment/delete-before-finalizing hint idiom are untouched
  and preserved throughout.
- Scope: `git diff --stat` confirms only `bundle/templates/wayfinder/map.md` and the change's
  own `progress.md` changed — no `route.md`, no skill files, no `CONTRIBUTING.md`, matching
  the plan's Files list and the binding constraint that only these two may change for this
  task. `requirements/` untouched (confirmed empty diff on that path).
- Cross-checked the implementer's report
  (`/private/tmp/claude-502/.../scratchpad/task-3-report.md`) against the actual diff — its
  line numbers and claims match what's on disk; no discrepancies.
- Test/build claims (98/98, clean build) not independently re-run per review instructions;
  plausible given the change is template-text-only with no code paths touched.

No blocking issues, no suggestions.

## Task 4 — 2026-08-19

Verdict: approved

Verified against plan.md Task 4 and requirements/artifact-templates.md ("Route template
installed"); diff (`094f552..d36ca17`) confined to `bundle/templates/wayfinder/route.md`
(7 insertions) and this change's `progress.md` (9 insertions) — `git diff --stat` confirms
no other file changed, matching the binding constraint.

- `## Shipping rules` (route.md:16) sits between the preamble hint (ends line 14) and
  `## Units` (line 23) — the required position.
- Hint (route.md:18-21): "how the units will be shipped — the branch units merge back into
  (seeded from the map's `branch:` field), commit and merge/PR conventions, and any standing
  shipping constraint every unit inherits, including shipping-relevant operation rules
  carried over from the map." — matches the plan's required hint content and the
  requirement's "seeded from the map's `branch:` field and shipping-relevant operation
  rules" clause word for word; covers branch/merge-back target, commit and merge/PR
  conventions, standing shipping constraints, and carried-over operation rules, i.e. all
  four elements the acceptance criterion lists.
- No frontmatter added — confirmed by reading the full file; the header comment block
  starts directly at `# Route — <Effort Name>` with no `---` YAML block, unchanged from
  before.
- Template idiom preserved: the new hint uses the same `<!-- hint: ... -->` HTML-comment
  style, indentation, and blank-line rhythm as every other section hint in the file (Units
  hint, preamble hint); no change to the header comment block or the
  delete-before-finalizing convention.
- Section body is otherwise empty (hint only, to be filled at route-writing time) —
  consistent with every other template section in this repo, which ship as hint-only
  scaffolding, not pre-filled prose.
- Cross-checked the implementer's report (task-4-report.md) against the diff: line numbers
  (16 for the heading, 23 for Units) match; claims of "16 insertions" vs. actual 7 in the
  route.md hunk is a minor report inaccuracy (the report's number appears to include the
  progress.md hunk lines too) but the file-level claims and grep output are otherwise
  accurate and don't affect the verdict.
- Test/build claims (98/98, clean build) not independently re-run per review instructions;
  plausible given the change is template-text-only with no code paths touched.

No blocking issues, no suggestions.

## Task 5 — 2026-08-19

Verdict: approved

Verified against plan.md Task 5 and requirements/ticket-resolution.md (ADDED "Prototype work
is branch-gated" scenarios, MODIFIED "Prototype capture at close"); diff (commit `f56f1c7`)
confined to `skills/hamilton-wayfinder-prototype/SKILL.md` plus this change's own
`progress.md`/`review.md` bookkeeping (the latter two are noted pre-existing content from an
earlier Task 4 review pass folded into this commit, not Task 5 production content, per the
review brief):

- `## Branch gate` (SKILL.md:28) sits between "Pick the shape" (ends ~line 26) and "Rules that
  apply to every prototype" (line 39) — the required position. States plainly up front: "No
  prototype code exists before this gate has run."
- Map-ticket form: `~/.hamilton/scripts/hamilton-prototype-branch.sh <map-name> <ticket-name>`
  with `<map-name>` = effort slug, `<ticket-name>` = ticket file's `NN-slug` (SKILL.md:32) —
  matches the requirement's naming exactly. Standalone form:
  `--standalone <question-slug>` (SKILL.md:33) — matches "Standalone invocation" scenario.
- "Either call's last line is the branch name; confirm the switch took effect with
  `--verify <that branch>` before writing anything" (SKILL.md:35) — matches plan's "the last
  line is the branch to confirm with `--verify`". Also states `mode: resumed` means picking up
  earlier work, matching the design's resume-not-error decision.
- Manual fallback (SKILL.md:37): `git switch -c prototype/<map-name>/<ticket-name>` (or
  `git switch prototype/<map-name>/<ticket-name>` if the branch already exists), explicitly
  named as "the pattern hamilton-propose already uses for isolate" — cross-checked against
  `skills/hamilton-propose/SKILL.md`'s isolate step (script primary, `--verify`, then a
  by-hand fallback with same names/order when the script isn't installed): the structural
  pattern matches. The plan's acceptance text and the design's Error Handling table both only
  specify the manual fallback for the map-ticket form (not standalone), so the diff's identical
  scope there is not a gap against this task's stated acceptance.
- Rule 6 "Capture it when done" (SKILL.md:46) rewritten to commit-and-return: commit
  outstanding work on the `prototype/...` branch, switch back to the starting branch, fold the
  validated decision into the real artifact there ("not the prototype branch"), keep the
  ticket-body branch pointer and the `## Answer` verdict capture — matches the MODIFIED
  requirement's language almost verbatim ("commits any outstanding prototype work on that
  branch and returns to the branch the session started from... folded into the real artifact
  on the working branch; the prototype branch keeps only the throwaway"). No stale references
  to the old "commit it to a throwaway branch... out of main" phrasing remain anywhere else in
  the file (grepped for "throwaway branch", only the rewritten rule 6 line matches).
- Process-flow digraph: new box node `"Branch gate\n(create/resume prototype/<map>/<ticket>,
  verify)"` inserted with edges `"Pick the shape" -> "Branch gate" -> "Build throwaway"`
  (SKILL.md:54,60-61), and the terminal doublecircle relabeled `"Commit + return\n(commit on
  prototype branch; fold validated decision into real artifact on starting branch)"` — graph is
  well-formed, no orphaned nodes, edges fully rewired.
- Task's own verify command reproduced independently:
  `grep -n "prototype-branch\|Branch gate\|prototype/<" skills/hamilton-wayfinder-prototype/SKILL.md`
  → identical output to the implementer's report (gate section, both script-call forms, verify
  call, digraph nodes/edges).
- Scope: `git diff --stat` for this commit touches only
  `skills/hamilton-wayfinder-prototype/SKILL.md` (21 lines, +17/-4) plus the change directory's
  `progress.md` and `review.md` — no `hamilton-isolate.sh`, no frontier/claim/ticket-type/map
  files, no other skill or template touched. Matches plan's Files list and the binding
  constraint that only this skill file (plus change-dir bookkeeping) may change for this task.
- Cross-checked the implementer's report
  (`/private/tmp/claude-502/.../scratchpad/task-5-report.md`) against the diff — its line
  numbers, quoted text, and verify output all match what's on disk; no discrepancies between
  claimed and actual changes.
- Test/build claims (98/98, clean build) not independently re-run per review instructions;
  plausible given the change is prose-only with no code paths touched.

No blocking issues, no suggestions.

## Task 6 — 2026-08-19

Verdict: approved

Verified against plan.md Task 6 and requirements/wayfinder.md (ADDED "Map records its working
branch" and "Charting asks for operation rules"); diff (commit `d828485`) touches only
`skills/hamilton-wayfinder/SKILL.md`, `CONTRIBUTING.md`, plus this change directory's
`progress.md`/`review.md` bookkeeping — the latter two carry the prior Task 5 review pass,
already written in the working tree before this task started, not Task 6 production content
(matches the review brief's note).

- "The map" (SKILL.md:13): "Five sections" → "Six sections", **Operation rules** added to the
  bulleted list between Notes and Decisions so far with a one-line gloss
  ("per-session-binding instructions on how working sessions operate"), and a trailing
  sentence distinguishes it from Notes ("holds prescriptive rules instead — e.g. commit after
  resolving a ticket, delegate a job class to a named subagent — and may be left empty").
  Matches the template's section order and hint text (`bundle/templates/wayfinder/map.md`)
  and satisfies the plan's "skill's description matches the template" bullet.
- "Chart the map" gains a new step 4, "Ask for operation rules" (SKILL.md:55), before map
  creation, with the required commit-after-resolution and subagent-delegation examples and
  explicit "may decline... left empty" language — matches requirements/wayfinder.md scenario
  "Rules are solicited at map creation" (asked before map creation, section present-and-empty
  when declined). Old step 4 ("Create the map") renumbers to step 5 (SKILL.md:56) to make
  room; the plan's acceptance bullet literally names "step 4" for the branch clause, but that
  quote is the pre-edit step number, and the plan's own second bullet explicitly allows the
  operation-rules ask to land "as its own numbered step before map creation" — which
  necessarily bumps map creation down a slot. The requirements scenarios name no step numbers,
  only ordering ("after the destination is named" / "before map creation"), both of which
  hold. Not a deviation in substance.
- Step 5 ("Create the map", SKILL.md:56) states `branch:` is set to "the branch the charting
  session is on — the branch the effort works from and merges back into", handles the
  detached-HEAD edge case ("record the repository's default branch and tell the user"), and
  notes Operation rules is filled from step 4's output — covers requirements/wayfinder.md
  scenario "Charting records the branch" and design.md's edge-case table row verbatim in
  substance.
- `## Map mechanics` frontmatter paragraph (SKILL.md:84) documents `branch:` — meaning and
  legacy fallback ("a map created before this field falls back to the repository's default
  branch") — matching requirements/wayfinder.md scenario "A pre-existing map lacks the
  field". `CONTRIBUTING.md`'s `## Map mechanics` table (line 78) and prose (line 81) gain the
  matching `branch` (map) row and the same legacy-fallback sentence, in the *same commit* as
  the skill edit (`git show d828485 --stat` confirms both files land together) — satisfies the
  design's "Always: update both mechanics homes... in the same commit" constraint. Field
  ordering is consistent across all three homes (template frontmatter, skill paragraph,
  CONTRIBUTING.md prose): `status` then `branch`.
- Process-flow digraph (SKILL.md:104,118-119): new box node `"Ask for operation rules"`
  wired `"Fog ahead?" -[fog exists]-> "Ask for operation rules" -> "Create map + tickets..."`,
  replacing the old direct edge — graph well-formed, no orphaned nodes.
- Scope: `git show d828485 --name-only` touches exactly
  `skills/hamilton-wayfinder/SKILL.md`, `CONTRIBUTING.md`, and this change directory's
  `progress.md`/`review.md` — no other file. Confirmed the untouched sections stayed
  untouched: "Skill dispatch" (SKILL.md:26-38), "Work through the map" (SKILL.md:60-72), and
  "The route" (SKILL.md:74-78) are byte-identical to the base revision; their digraph nodes
  ("Resolve by type...", "Fold glossary + write route...") are unchanged text — confirms
  Task 7's territory was left alone, matching the binding scope constraint.
- Verify commands reproduced independently:
  `grep -n "branch" skills/hamilton-wayfinder/SKILL.md CONTRIBUTING.md | grep -i "map\|merge"`
  and `grep -n "Operation rules" skills/hamilton-wayfinder/SKILL.md` — output matches the
  implementer's report exactly (same lines, same text).
- Cross-checked the implementer's report
  (`/private/tmp/claude-502/.../scratchpad/task-6-report.md`) against the diff — line numbers,
  quoted text, and verify output all match what's on disk; no discrepancies between claimed
  and actual changes.
- Test/build claims (98/98, clean build) not independently re-run per review instructions;
  plausible given the change is prose-only with no code paths touched.

### Suggestions

- [skills/hamilton-wayfinder/SKILL.md:13,55] "The map" glosses the section as "delegate a
  **job class** to a named subagent" while step 4 phrases the same example as "delegate a
  **class of jobs** to a named subagent". Cosmetic only — no requirement or scenario turns on
  the exact phrase — but aligning the two would tighten the prose's internal consistency.

No blocking issues.

## Task 7 — 2026-08-19

Verdict: approved

Verified against plan.md Task 7 and requirements/wayfinder.md (ADDED "Working sessions obey
operation rules"; MODIFIED "Ticket-type dispatch is imperative", "A claimed ticket resolves
in the claiming session", "The route carries shipping rules"). Diff (commit `ac4374c` vs base
`d828485`) touches exactly `skills/hamilton-wayfinder/SKILL.md` plus this change directory's
`progress.md`/`review.md` bookkeeping — the latter two carry the prior Task 6 review pass,
already written in the working tree before this task started, not Task 7 production content
(matches the review brief's note). No other files changed; nothing outside git.

- **Skill dispatch intro** (SKILL.md:27): rewritten to "A skill MUST be loaded — its SKILL.md
  read, or invoked via the Skill tool — before any work in its spirit begins; never act in a
  skill's spirit without loading it first." Satisfies the plan's "same MUST framing" bullet
  and requirements/wayfinder.md scenario "Dispatch precedes work for every type".
- **Work-loop step 1** (SKILL.md:64): now reads "Read the frontmatter's `branch:` and the
  Operation rules section too, and apply each rule to the actions it covers as the session
  proceeds — a commit-after-resolution rule produces a commit when a ticket resolves; a
  subagent-delegation rule routes the named job to the named subagent rather than doing it
  inline." Matches the plan's acceptance bullet verbatim in substance and covers both
  requirements/wayfinder.md scenarios ("Commit-after-resolution rule", "Subagent-delegation
  rule").
- **Step 3 "Claim it"** (SKILL.md:66): gains "Claiming is the start of resolution, not a
  stopping point — the session that claims a ticket resolves it, never a later one." Matches
  requirements/wayfinder.md "A claimed ticket resolves in the claiming session" scenario
  "Claim and resolve in one session".
- **Step 4 "Resolve it"** (SKILL.md:67): rewritten to "The skill the ticket's type promises
  (see Skill dispatch) MUST be loaded before any resolution work begins — resolving a typed
  ticket without loading its skill is a contract violation. For a prototype ticket
  specifically, no prototype code exists before `hamilton-wayfinder-prototype` is loaded and
  its branch gate has run." Satisfies the plan's imperative-per-type bullet and
  requirements/wayfinder.md scenario "Prototype ticket dispatch"; the "(SKILL.md read, or
  Skill tool)" clause the plan's bullet also names is carried by the cross-referenced Skill
  dispatch intro rather than repeated — reasonable, not a gap, since the two sentences sit two
  lines apart and Skill dispatch is the section step 4 explicitly points to.
- **One-ticket-per-session sentence** (SKILL.md:70): gains "This is a ceiling, not a
  deferral: the ticket you claim is the ticket you resolve, now." — verbatim per the plan's
  suggested wording; the research exemption clause immediately preceding it is preserved
  unchanged.
- **"The route"** (SKILL.md:72): gains "...filling its `## Shipping rules` section from the
  map's `branch:` field — the merge-back target — plus any Operation rules that concern
  shipping, so the route stays self-contained for downstream processes that never open the
  map." Matches requirements/wayfinder.md "The route carries shipping rules" scenario "Route
  written from a cleared map"; verified `bundle/templates/wayfinder/route.md` (Task 4) already
  carries the `## Shipping rules` section this instruction fills.
- **Process-flow digraph** (SKILL.md:110-129): three nodes and their edges relabeled —
  `"Claim ticket\n(start of resolution, same session)"`, `"Load resolving skill, then resolve
  by type\n(...)"`, `"Fold glossary + write route\n+ Shipping rules (closing act)"` — node
  names and edge references stay consistent (no orphaned references), reflecting the
  imperative resolve step and shipping-rules route writing per the plan's last bullet.
- **Scope discipline**: confirmed via `git diff` that "The map" section, "Chart the map"
  steps, and `## Map mechanics` (Task 6's regions) are byte-identical to the base revision —
  no regression. `CONTRIBUTING.md` is untouched, correctly, since Task 7 has no mechanics-home
  work. Task type coverage for `task` tickets remains intact via the unmodified Skill dispatch
  table row ("Task ticket | none — drive directly...").
- Cross-checked the implementer's report
  (`/private/tmp/claude-502/.../scratchpad/task-7-report.md`) against the diff — every claimed
  edit location and wording matches what's on disk; no discrepancies.
- Test/build claims (98/98 passed, clean build) not independently re-run per review
  instructions — plausible given the change is prose-only with no code paths touched, and the
  task's own plan.md Verify step is a `grep`, not the suite.

### Suggestions

- [skills/hamilton-wayfinder/SKILL.md:66] The new sentence "the session that claims a ticket
  resolves it, never a later one" reads in tension with the (pre-existing, unchanged) research
  exception: research tickets are claimed, dispatched to a background agent, and resolved only
  when a *later* session's step 1 absorbs the returned findings. The exception is stated at
  the one-ticket-per-session sentence and implicit in step 1's "check for returned research",
  but step 3 itself states the same-session rule with no research carve-out. Not a
  contradiction the plan asked to resolve (the plan's acceptance bullet specifies this exact
  wording with no exception clause), and existing readers already navigate the same tension
  elsewhere in the file — but a parenthetical ("— research tickets aside, which resolve when
  their background findings return —") at this exact spot would close the ambiguity for a
  literal reader landing on step 3 alone.

No blocking issues.

## whole change — 2026-08-19

Verdict: approved

Final whole-branch review of `536a07a..ac4374c` (diff package read in full: 7 task commits, 17 files, +1202/−27). Judged as one body of work against proposal.md's six improvements, the three requirements deltas, design.md's decisions and constraints, and cross-file consistency the per-task reviews could not see.

Verified:

- **All six proposal improvements land end to end.** (1) Map `branch:` field: template frontmatter + hint (`bundle/templates/wayfinder/map.md:13-15`), charting step 5 sets it with the detached-HEAD fallback (`skills/hamilton-wayfinder/SKILL.md:56`), Map mechanics defines it with the legacy default-branch fallback (SKILL.md:84), `CONTRIBUTING.md:78,81` mirrors both, work-loop step 1 reads it, The route consumes it. (2) Prototype branch gate: script (`bundle/scripts/hamilton-prototype-branch.sh`, 3 modes, exit 0/1/2, last-line contract) + 8 behavior tests + `## Branch gate` section with script call, `--verify`, resumed semantics, manual fallback, and "No prototype code exists before this gate has run" (`skills/hamilton-wayfinder-prototype/SKILL.md:28-37`). (3) Operation rules: asked at charting step 4, recorded in the map's new section, read and applied in work-loop step 1 with both required examples. (4) Imperative dispatch: MUST framing in Skill dispatch intro and work-loop step 4, prototype-specific no-code-before-load-and-gate clause. (5) Route `## Shipping rules`: template section between preamble and Units with the required seeded-from-`branch:`-and-operation-rules hint; The route instructs filling it. (6) Same-session resolution: step 3 "claiming is the start of resolution... never a later one" + "a ceiling, not a deferral" sentence. Every scenario in requirements/{artifact-templates,ticket-resolution,wayfinder}.md traces to landed text.
- **Cross-file naming and vocabulary are consistent.** `prototype/<map-name>/<ticket-name>` and `--standalone <slug>` / `<question-slug>` agree across script usage text, prototype skill, docs/skills.md table row, and requirements; "Operation rules" is the section name everywhere (lowercase only in generic prose, correctly); docs/skills.md's `wayfinder-prototype` "Called by" value follows the table's existing drop-the-`hamilton-`-prefix convention; the map's frontmatter order (`status` then `branch`) agrees across template, skill mechanics paragraph, and CONTRIBUTING.md prose.
- **Wayfinder invariants hold.** Mechanics are *defined* only in `## Map mechanics` (and mirrored in CONTRIBUTING.md — both homes changed in the same commit, `d828485`, per the lockstep constraint); templates are pointed at, never reproduced (the skill's six-section gloss describes shape, the template provides format — the pre-existing pattern); both process-flow digraphs are valid dot — every edge endpoint matches a declared quoted node label exactly, no orphaned nodes — and their node text matches the prose steps (gate between "Pick the shape" and "Build throwaway"; "Ask for operation rules" on the fog path before map creation).
- **Boundaries respected.** `hamilton-isolate.sh` untouched; frontier/claim semantics, ticket types, and map lifecycle values byte-identical to base; no source-code changes beyond the new script and its test plus the one-line setup-test list addition.
- **Script and tests.** The script's contract matches the sibling idiom (`set -uo pipefail`, `usage`/`die`/`require_repo`, plain text out, load-bearing last line, exit 0/1/2); the 8 tests assert observable state (branch via `git branch --show-current`, `mode` field, last line, dirty-file survival, exit codes) in temp repos with no mocks, and would fail on regression.
- Cannot verify from diff alone: the 98/98 test / clean-build claims (not re-run per review instructions; plausible — six of seven commits are prose/template-only) and the installed copies at `~/.hamilton/` (updated only on next `hamilton setup`, as proposal.md's Impact notes).

### Suggestions

- [skills/hamilton-wayfinder/SKILL.md:13 + bundle/templates/wayfinder/map.md:33 vs SKILL.md:55 + requirements/wayfinder.md] "job class" ("The map" gloss, map-template hint) vs "class of jobs" (charting step 4, both requirements passages). Cosmetic; the requirements' phrase is the majority form — align the two "job class" spots to "class of jobs" when the file is next touched. (Carried up from the Task 6 review; the whole-change view shows the drift also spans the template.)
- [skills/hamilton-wayfinder/SKILL.md:65] Step 3's "the session that claims a ticket resolves it, never a later one" carries no research carve-out, while the budget sentence five lines down and requirements/wayfinder.md's "ceiling... (research excepted)" both have one — research tickets legitimately resolve when a later session's step 1 absorbs returned findings. The wording is exactly what the plan mandated, so this is a plan/requirements-level tension, not a coder defect; a short parenthetical at step 3 would close it for a literal reader. (Carried up from the Task 7 review.)
- [skills/hamilton-wayfinder/SKILL.md:66] Step 4's "The skill the ticket's type promises (see Skill dispatch) MUST be loaded" lacks the qualifier requirements/wayfinder.md uses ("any type *with a resolving skill*") — a `task` ticket's dispatch row is "none", so the literal MUST has no referent for that type. The cross-referenced table disambiguates in practice; adding "where the type names one" would remove the need to cross-reference.
- [skills/hamilton-wayfinder/SKILL.md:82] The Map mechanics intro's claim that "nothing above it names a field, a path, or a branching rule" moves further from true: charting step 5, work-loop step 1, and The route now name `branch:` above the section (paths, `## Answer`, and lifecycle values were already named above it pre-change). The references were mandated verbatim by the plan (plan/design issue, not the coder's); a future change should either soften that intro sentence to "defines" rather than "names", or route the upstream references through concept language.
- [tests/scripts/prototype-branch.test.ts:97] Inline `require("node:os")` amid ESM `import` statements — works under vitest's interop and the suite passes, but importing `node:os` at the top like the file's other `node:` imports would match the codebase idiom.

No blocking issues. Next step: `hamilton-finish-work` (all 7 tasks done, all task reviews and this whole-change review approved).

## Suggestion adjudication — 2026-08-20

User rulings on the whole-change review's five non-blocking suggestions (recorded only; no fixes applied yet):

1. "job class" vs "class of jobs" — **accepted**: align the two "job class" spots (SKILL.md:13, map template hint) to "class of jobs".
2. Research carve-out at work-loop step 3 — **approach under discussion**; orchestrator's recommendation: add a parenthetical at step 3 ("the one exception is a research ticket, whose resolution completes when its background investigation returns — the claiming session still dispatches it immediately") and mirror the carve-out in the wayfinder spec's same-session invariant.
3. MUST-load referent for `task` tickets — **superseded by a larger question**: the user is considering removing the `task` ticket type (possibly replacing it with a "mechanical-decision" type for recording work deferred to shipping). Orchestrator's counter-analysis recorded in conversation: keep `task` for decision-unblocking manual work; deferred-shipping notes belong to Not yet specified / the route's units and Shipping rules, and foregone-conclusion decisions can land in Decisions so far without ticket ceremony. Any removal is a vocabulary change deserving its own change (template enum, both mechanics homes, spec, glossary, dispatch table). Decision pending.
4. Map mechanics intro overclaim — **accepted**: soften "names a field, a path, or a branching rule" to "defines".
5. Inline `require("node:os")` in prototype-branch.test.ts — **accepted**: hoist to a top-level `node:` import.

### Adjudication refinement — 2026-08-20

2. Resolved approach: no exception parenthetical. Rephrase step 3 so the rule states what it actually forbids — parking a claimed ticket. Claiming is not a handoff: the claiming session takes the ticket as far as its type allows (HITL types: to resolution; research: dispatched now, resolving naturally when findings return and step 1 absorbs them). Mirror the same scoping in the wayfinder spec's same-session invariant.
3. Resolved: keep the `task` type; do not add "mechanical-decision". The observed misuse ("rename folder" as a task ticket) is shipping work masquerading as frontier work. Fix is a guardrail, not a new type: tighten `task`'s definition with an unblocking test — a task ticket is legitimate only if a named decision cannot be made until the work is done; work that could wait until shipping is recorded as a decision (ticket Answer + map gist) and applied during shipping via the route's units / Shipping rules.

## Fix wave — 2026-08-20

Verdict: approved

Reviewed the fix-wave diff (`dd403aab..635ad6c`, 6 files, +41/−14) against the two adjudication sections above, treated as the acceptance criteria. Diff package read in full; `fixwave-report.md` cross-checked against the actual diff. Tests/build not re-run per instructions (98/98, clean build already reported).

Verified, item by item:

- **1. "job class" → "class of jobs".** Both named spots fixed verbatim: `skills/hamilton-wayfinder/SKILL.md` "The map" gloss and `bundle/templates/wayfinder/map.md`'s Operation rules hint. Grepped the post-fix tree for `"job class"` — the only surviving hits are in this change's own `plan.md`/`review.md`/`progress.md` (historical record, not live prose), confirming no third live spot was missed. `requirements/wayfinder.md`'s two "class of jobs" passages were already correct and untouched.
- **2. Work-loop step 3 rephrased, no exception framing.** SKILL.md step 3 now reads "Claiming is the start of resolution, not a handoff: the claiming session immediately takes the ticket as far as its type allows — a HITL ticket resolves in this session; a research ticket is dispatched now and resolves when its findings return." The nearby ceiling sentence was harmonized ("never park a claimed ticket — take it as far as its type allows before the session ends"), dropping the "now" that contradicted deferred research resolution. The digraph's `"Claim ticket\n(...)"` node and both its edges were relabeled together — verified every edge endpoint still matches a declared node label exactly, no orphans. The same scoping was mirrored in `.hamilton/specs/wayfinder.md`'s Behavior "Working" sentence, the same-session Invariant (explicitly including the "step 1 absorbs them" detail the adjudication's parenthetical specified), and the Examples bullet that previously restated the old absolute rule — all three were explicitly named in the binding expectations for this item, so updating the Examples bullet is in scope, not collateral.
- **3. Task-type guardrail.** (a) SKILL.md step 4: "MUST be loaded before any resolution work, where the type names one" — closes the empty-referent gap for `task` tickets (dispatch row "none"). (b) The `task` bullet in Ticket types gained the unblocking test verbatim in substance: legitimate only when a named decision can't be made until the work is done; shipping-deferrable work is recorded as a decision and routed via the route. (c) `.hamilton/specs/wayfinder.md` gained a matching invariant ("A `task` ticket MUST unblock a named decision...") and Examples bullet ("work that could wait until shipping is proposed as a task ticket -> it is recorded as a decision instead and routed to shipping"), correctly positioned among the sibling invariants/examples. (d) `requirements/wayfinder.md` gained a new ADDED requirement, "Task tickets unblock decisions," correctly placed under `## ADDED Requirements` with a SHALL statement, priority, rationale, and a WHEN/THEN scenario — matches the spec edit.
- **4. Map mechanics intro softened.** SKILL.md: "nothing above it names a field, a path, or a branching rule" → "...defines a field...". `CONTRIBUTING.md` checked directly — it doesn't carry this sentence, so no mirrored edit was needed there, matching the report's claim.
- **5. Inline `require` hoisted.** `tests/scripts/prototype-branch.test.ts` now imports `import * as Os from "node:os"` at the top alongside the file's other `node:` imports, and the call site uses `Os.tmpdir()` — matches the file's existing import idiom exactly.

Scope and hygiene:

- `git diff --stat` confirms exactly 6 files changed: the two spec/skill/template production files, the test file, and the three change-directory bookkeeping files (`progress.md`, `requirements/wayfinder.md`, plus the review pass being written here) — no file outside the five findings' named targets plus the fix-wave progress entry. `hamilton-isolate.sh`, frontier/claim mechanics, the ticket-type enum, and map lifecycle values are untouched, confirmed by diff.
- `.hamilton/specs/ticket-resolution.md` checked directly for any of the changed phrases ("same session", "claiming is", "job class"/"class of jobs", "names a field", task-unblocking language) — no hits, so nothing there went stale from this fix wave.

### Suggestions

- [`.hamilton/changes/2026-08-19-wayfinder-branching-and-operation-rules/requirements/wayfinder.md:89-99`] The pre-existing MODIFIED requirement "A claimed ticket resolves in the claiming session" still states the absolute rule item 2 was adjudicated to soften elsewhere ("the same session proceeds immediately to resolve it, and the ticket does not remain in `claimed` status awaiting a future session," "never as a requirement to defer resolution to a later session") — this is now the one remaining place in the repo that reads that way, since `.hamilton/specs/wayfinder.md` and `skills/hamilton-wayfinder/SKILL.md` were both rephrased to acknowledge research resolves later. Not named in the binding expectations for this fix wave (which scoped item 2's mirroring to `.hamilton/specs/wayfinder.md` specifically), and touching it would have been collateral beyond the five items, so correctly left alone here — but worth a follow-up pass so this requirement doesn't read as contradicting its own sibling `Requirement: Working sessions obey operation rules` / the canonical spec.
- [`.hamilton/specs/wayfinder.md` — Invariants, "A ticket's resolving skill MUST be loaded before resolution work begins."] Retains the same empty-referent ambiguity for `task` tickets (no named resolving skill) that step 4's "where the type names one" qualifier fixed in SKILL.md. Not named in the binding expectations (item 3(c)'s "matching invariant" was reasonably read as the task-unblocking invariant, which is present and correct), so not a gap in this fix wave — flagging only as a candidate for the same qualifier next time this section is touched.
- [`skills/hamilton-wayfinder/SKILL.md` step 4] "MUST be loaded before any resolution work, where the type names one" is grammatically a little awkward (the qualifying clause sits between "work" and the em-dash rather than immediately after "loaded"). Meaning is clear and matches the adjudication; a possible tighter phrasing for later — "MUST be loaded, where the type names one, before any resolution work begins" — not required.

No blocking issues. Next step: reconcile with the already-merged PR #39 per the implementer's own concern (this fix wave landed on `wayfinder-gpt-optimization` after that change's finish-work already ran) — outside this review's scope but worth the user's attention before pushing.
