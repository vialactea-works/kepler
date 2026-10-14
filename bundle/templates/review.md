---
artifact: review
change: <YYYY-MM-DD-change-title>
created: <YYYY-MM-DD>
status: open | complete
decision: accepted | rejected | skipped
---

<!--
  Whole-branch Review: verdict for a complete change branch.
  Produced by: kepler-review (step 5).
  Lives at: .kepler/changes/<change>/review.md
  Task-scoped feedback belongs in tasks/task-N/feedback.md.
  Delete this instruction block and every inline hint before finalizing.

  For new files, keep only identity and lifecycle metadata in frontmatter. In each full pass, record complete Base, Head, Verdict, Scope: full and explicit Target fields. Omit remediation fields.

  For a bounded pass, set Scope to remediation and retain Base, current Head and Target. Add Parent pass, Parent commit, Delta base and Resolutions in that order before Blocking. Parent pass and Parent commit identify the immutable modern full baseline; Delta base is its original reviewed Head.

  Resolutions must be a single-line JSON array. Each entry has exactly three keys: finding, a stable pass-N-blocking-M string; evidence, a nonempty array of nonempty located evidence strings; and verification, a nonempty string naming an independent check and its observed result. Preserve whole paths, including spaces. This example defines syntax, not approval:
  Resolutions: [{"finding":"pass-1-blocking-1","evidence":["src/file name.ts","tests/report.test.ts:12"],"verification":"Focused consumer test passed; log: .kepler/notes/correction-check.md"}]

  For approved-remediation, cover the exact union of unique IDs from the full baseline and scoped suffix, including previously resolved blockers. Never duplicate, omit or invent IDs. For changes-requested, retain unresolved and new Blocking entries and list only performed checks; use Resolutions: [] if none.

  Preserve every prior scoped body unchanged, including failed attempts. If committed history is missing or changed, require a full review or owner repair. An evidence entry cannot erase a prior blocker.

  Before the first append to a legacy-global history, validate that history. In one atomic mutation, preserve every existing pass body byte-for-byte, remove exactly the global `base`, `head` and `verdict` fields, and append the next complete pass-local record at the file's end. Never copy global provenance into historical passes or retain it beside an explicit suffix.

  A fieldless prefix followed by an explicit suffix has already transitioned; append normally to that suffix. Stop for partial globals, mixed global-plus-explicit evidence, missing legacy globals without an explicit suffix, or any fieldless pass after the explicit suffix. Never create review-<k>.md.
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
