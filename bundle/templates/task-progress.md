---
artifact: task-progress
change: <YYYY-MM-DD-change-title>
task: <N>
status: pending | in-progress | blocked | done
updated: <YYYY-MM-DD>
decision: accepted | rejected | skipped
---

<!--
  Task Progress: execution history for one plan task.
  Produced by: kepler-plan (step 2); updated by kepler-code (step 3).
  Lives at: .kepler/changes/<change>/tasks/task-N/progress.md
  Keep the task status index in root progress.md.
  Initialize this log with `status: pending` and no attempts.

  Give each new attempt exactly one terminal `- Outcome: done` or `- Outcome: blocked`. In dependency-mode v2, record that admission's exact lane start as `- Start HEAD: <full commit>` in every new attempt. Keep immutable Task Base and coordinator source HEAD separate; never infer or backfill Start HEAD for a frozen historical attempt. Record corrections in a new attempt; never add another Outcome to a historical attempt. Preserve supported historical unbulleted Outcome fields without rewriting them.

  Optional immutable `scope_expansions` records reserve prerequisite paths before edits. In each attempt, record the applicable quality constraint and decision context, explaining how they shaped the implementation or check. If they do not apply, explain why.
  Delete this instruction block and every inline hint before finalizing.
-->

# Task Progress: Task N — <exact unescaped plan task title>
