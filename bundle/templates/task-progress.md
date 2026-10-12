---
artifact: task-progress
change: <YYYY-MM-DD-change-title>
task: <N>
status: pending | in-progress | blocked | done
updated: <YYYY-MM-DD>
decision: accepted | rejected | skipped
---

<!--
  Task Progress — execution history for one plan task.
  Produced by: kepler-plan (step 2); updated by kepler-code (step 3).
  Lives at: .kepler/changes/<change>/tasks/task-N/progress.md
  The root progress.md remains the task status index.
  A newly initialized task log has no attempt and remains `status: pending`.
  Each new attempt has exactly one terminal `- Outcome: done` or `- Outcome: blocked`; append a new
  attempt for corrections instead of adding another Outcome to historical attempts. Preserve
  supported historical unbulleted Outcome fields without rewriting them.
  Each attempt records the applicable task quality constraint and decision context, the observed
  implementation or check shaped by it, or a justified non-applicability result.
  Delete this instruction block and every inline hint before finalizing.
-->

# Task Progress: Task N — <exact unescaped plan task title>
