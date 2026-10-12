---
artifact: review
change: <YYYY-MM-DD-change-title>
created: <YYYY-MM-DD>
status: open | complete
decision: accepted | rejected | skipped
---

<!--
  Whole-branch Review — verdict for a complete change branch.
  Produced by: kepler-review (step 5).
  Lives at: .kepler/changes/<change>/review.md
  Task-scoped feedback belongs in tasks/task-N/feedback.md.
  Delete this instruction block and every inline hint before finalizing.

  Fresh files use identity and lifecycle-only frontmatter with complete pass-local Base, Head,
  Verdict, Scope: full, and explicit Target fields. A normal full pass records no remediation
  fields. For a bounded pass, replace Scope with remediation and retain Base, current Head and
  Target. Add Parent pass, Parent commit, Delta base and Resolutions in that order before Blocking;
  Parent names the immutable modern full baseline and Delta base is its original reviewed Head.
  Resolutions must be a single-line JSON array. Each entry has exactly finding, evidence and
  verification keys: a stable pass-N-blocking-M finding string, a nonempty array of nonempty located
  evidence strings, and a nonempty verification string with an independent check and observed result.
  Preserve whole paths, including spaces. This example defines syntax, not approval:
  Resolutions: [{"finding":"pass-1-blocking-1","evidence":["src/file name.ts","tests/report.test.ts:12"],"verification":"Focused consumer test passed; log: .kepler/notes/correction-check.md"}]
  For approved-remediation, cover the exact unique ID union from the full baseline and scoped suffix,
  including earlier resolved blockers. Never duplicate, omit or invent IDs. Requested passes retain
  unresolved/new Blocking entries and list only performed checks; use Resolutions: [] if none.
  Keep every prior scoped body immutable, including failed attempts. Missing or changed committed
  history requires full fallback or owner repair; an evidence entry cannot erase a prior blocker.
  For the first append to a legacy-global history, validate the legacy-global history
  before one atomic mutation: preserve every existing pass body byte-for-byte, remove exactly the
  global `base`, `head`, and `verdict` fields, and append the next complete pass-local record at the
  physical end in the same mutation. Never copy global provenance into historical passes. Never retain
  global provenance beside an explicit suffix. A fieldless prefix followed by an explicit suffix is
  already transitioned; append normally to that suffix. Fail closed for partial globals, mixed
  global-plus-explicit evidence, missing legacy globals without an explicit suffix, or any fieldless
  pass after the explicit suffix. Never create review-<k>.md.
-->

# Whole-branch Review: <Change Title> <!-- hint: replace with the plan's exact change title -->

## Pass N — <YYYY-MM-DD> <!-- hint: replace with the next pass number and current date -->

Base: <full merge-base commit identifier>
Head: <full head commit identifier>
Verdict: approved | changes-requested | skipped | approved-remediation
Scope: full
Target: refs/remotes/<remote>/<branch>

### Blocking

<!-- hint: use "- None." when approval has no blocking findings -->
- [<file>:<loc>] id: pass-N-blocking-M; kind: code-defect | evidence-gap | intent-defect; <what is wrong> — <what to change> (violates: <criterion / standard>)

### Suggestions

<!-- hint: use "- None." when there are no suggestions -->
- [<file>:<loc>] <optional improvement>
