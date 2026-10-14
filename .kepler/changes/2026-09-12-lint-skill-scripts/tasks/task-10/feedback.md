---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 10
created: 2026-09-13
status: resolved
verdict: approved
decision: accepted
base: 053482f56986660bf3948bf08308e5e8893b878e
head: d1318f5e740a2b66851e9caef47ca0c8d42686b4
---

# Code Feedback: Task 10 — Port evidence freshness gates

## Pass 1 — 2026-09-13

### Blocking

- [src/workbench/precondition.ts:573-584] The task loop checks only the latest attempt's `Outcome: done` and never requires the task-progress frontmatter `status` to be `done`; a `pending` or `blocked` task with a forged done attempt therefore passes the task gate and can reach `gate: open`. Require the task-progress status to be `done` and add coverage for contradictory status evidence (violates: Task 10 acceptance, task progress/task-status fail-closed behavior).
- [src/workbench/precondition.ts:794-915, 963-978] `inspectReviews` and `inspectFreshness` independently reread and revalidate `review.md`, repeat `exactArtifactCommit` and `validRange`, and `inspectFreshness` rereads plan durability after `inspectTasks`; this duplicates artifact IO/validation wiring and gives separate stages independent evidence reads. Share one inspection result while retaining the distinct gate output lines (violates: Task 10 binding constraint requiring shared artifact contracts/workflow records with no duplicated parsing/IO wiring; design boundary for precondition evidence inspection).

### Suggestions

- None.

## Pass 2 — 2026-09-13

### Blocking

- None.

### Suggestions

- None.
