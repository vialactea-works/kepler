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
  Progress: root task index for a change.
  Produced by: kepler-plan (step 2). kepler-code updates legacy serial root rows; the coordinator publishes dependency-mode root state.
  Lives at: .kepler/changes/<change>/progress.md
  Keep detailed execution history in the linked task progress files.
  Allowed task statuses: pending | in-progress | blocked | done
  Root `status: complete` means all active implementation rows are done.
  It does not establish that task feedback, whole-branch review or finish-work passed.
  Delete this instruction block and every inline hint before finalizing.
-->

# Progress: <Change Title>

<!-- Add one `tasks` frontmatter entry and one matching table row per active task, in numeric identity order. Scheduling does not change this ledger's physical order. Escape `|` in display titles as `\|`. The frontmatter and table must contain the same tasks and values, accounting for display escaping. Keep task details in the linked files.

     Omit admission on pending scaffolds. Only the guarded coordinator operation may add a version-1 admission object with the exact fields in task-admission.ts; a template example grants no authority. -->

| Task | Status | Progress |
| --- | --- | --- |
| Task N: <escaped display title> | pending | [details](tasks/task-N/progress.md) |
