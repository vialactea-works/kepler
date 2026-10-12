---
artifact: progress
change: <YYYY-MM-DD-change-title>
status: pending | in-progress | blocked | complete
updated: <YYYY-MM-DD>
decision: accepted | rejected | skipped
tasks:
  - id: N
    title: "<task title>"
    status: pending
    progress: tasks/task-N/progress.md
---

<!--
  Progress — root task index for a change.
  Produced by: kepler-plan (step 2); updated by kepler-code (step 3).
  Lives at: .kepler/changes/<change>/progress.md
  Detailed execution history belongs in each linked task progress artifact.
  Allowed task statuses: pending | in-progress | blocked | done
  Root `status: complete` means all active implementation rows are done; it does not
  mean task feedback, whole-branch review, or finish-work passed.
  Delete this instruction block and every inline hint before finalizing.
-->

# Progress: <Change Title>

<!-- Add one `tasks` frontmatter entry and one matching row per active task in numeric identity order.
     The orchestrator's optional execution sequence is separate from this ledger's physical order.
     Escape `|` in display titles as `\|`. The frontmatter and table must match exactly;
     task details remain in linked files. -->

| Task | Status | Progress |
| --- | --- | --- |
| Task N: <escaped display title> | pending | [details](tasks/task-N/progress.md) |
