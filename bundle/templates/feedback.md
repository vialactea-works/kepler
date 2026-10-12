---
artifact: feedback
change: <YYYY-MM-DD-change-title>
task: <N>
created: <YYYY-MM-DD>
status: open | resolved
decision: accepted | rejected | skipped
---

<!--
  Code Feedback — review history for one plan task.
  Produced by: kepler-code-feedback (step 4).
  Lives at: .kepler/changes/<change>/tasks/task-N/feedback.md
  Whole-branch review belongs in review.md.
  Delete this instruction block and every inline hint before finalizing.

  Fresh files use identity and lifecycle-only frontmatter with complete pass-local Base, Head, and
  Verdict fields. For the first append to a legacy-global history, validate the legacy-global history
  before one atomic mutation: preserve every existing pass body byte-for-byte, remove exactly the
  global `base`, `head`, and `verdict` fields, and append the next complete pass-local record at the
  physical end in the same mutation. Never copy global provenance into historical passes. Never retain
  global provenance beside an explicit suffix. A fieldless prefix followed by an explicit suffix is
  already transitioned; append normally to that suffix. Fail closed for partial globals, mixed
  global-plus-explicit evidence, missing legacy globals without an explicit suffix, or any fieldless
  pass after the explicit suffix. Never create feedback-<k>.md.
-->

# Code Feedback: Task N — <title> <!-- hint: replace with the exact plan task id and title -->

## Pass N — <YYYY-MM-DD> <!-- hint: replace with the next pass number and current date -->

Base: <full commit identifier>
Head: <full commit identifier>
Verdict: approved | changes-requested | skipped

### Blocking

<!-- hint: use "- None." when approval has no blocking findings -->
- [<file>:<loc>] id: pass-N-blocking-M; kind: code-defect | evidence-gap | intent-defect; <what is wrong> — <what to change> (violates: <criterion / standard>)

### Suggestions

<!-- hint: use "- None." when there are no suggestions -->
- [<file>:<loc>] <optional improvement>
