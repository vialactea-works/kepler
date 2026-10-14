---
artifact: progress
change: 2026-09-12-lint-skill-scripts
status: in-progress
updated: 2026-09-17
decision: accepted
tasks:
  - id: 1
    title: Add the shared artifact reader
    status: done
    progress: tasks/task-1/progress.md
  - id: 2
    title: Register artifact metadata contracts
    status: done
    progress: tasks/task-2/progress.md
  - id: 3
    title: Validate artifact bodies and workflow records
    status: done
    progress: tasks/task-3/progress.md
  - id: 4
    title: Implement explicitly scoped linting
    status: done
    progress: tasks/task-4/progress.md
  - id: 5
    title: Establish runtime seams for isolation
    status: done
    progress: tasks/task-5/progress.md
  - id: 6
    title: Port prototype branching
    status: done
    progress: tasks/task-6/progress.md
  - id: 7
    title: Port diff packaging
    status: done
    progress: tasks/task-7/progress.md
  - id: 8
    title: Port change context
    status: done
    progress: tasks/task-8/progress.md
  - id: 9
    title: Port repository precondition gates
    status: done
    progress: tasks/task-9/progress.md
  - id: 10
    title: Port evidence freshness gates
    status: done
    progress: tasks/task-10/progress.md
  - id: 11
    title: Compose the workbench CLI
    status: done
    progress: tasks/task-11/progress.md
  - id: 12
    title: Remove script installation from setup
    status: done
    progress: tasks/task-12/progress.md
  - id: 13
    title: Migrate skills to workbench commands
    status: done
    progress: tasks/task-13/progress.md
  - id: 14
    title: Update framework documentation
    status: done
    progress: tasks/task-14/progress.md
  - id: 15
    title: Delete obsolete shell helpers and tests
    status: done
    progress: tasks/task-15/progress.md
  - id: 16
    title: Align per-pass feedback and review producers
    status: done
    progress: tasks/task-16/progress.md
  - id: 17
    title: Parse and validate per-pass review evidence
    status: done
    progress: tasks/task-17/progress.md
  - id: 18
    title: Lint per-pass review evidence
    status: done
    progress: tasks/task-18/progress.md
  - id: 19
    title: Gate preconditions on parsed review evidence
    status: done
    progress: tasks/task-19/progress.md
  - id: 20
    title: Report context from parsed review evidence
    status: done
    progress: tasks/task-20/progress.md
  - id: 21
    title: Synchronize per-pass evidence specifications and verification
    status: done
    progress: tasks/task-21/progress.md
  - id: 22
    title: Model legacy review transitions
    status: done
    progress: tasks/task-22/progress.md
  - id: 23
    title: Verify review transition consumers
    status: done
    progress: tasks/task-23/progress.md
  - id: 24
    title: Teach review producers the transition
    status: done
    progress: tasks/task-24/progress.md
  - id: 25
    title: Document the review transition contract
    status: done
    progress: tasks/task-25/progress.md
  - id: 26
    title: Synchronize root progress metadata
    status: done
    progress: tasks/task-26/progress.md
  - id: 27
    title: Repair Task 21 completion evidence
    status: done
    progress: tasks/task-27/progress.md
  - id: 28
    title: Restore progress ledger parsing parity
    status: done
    progress: tasks/task-28/progress.md
  - id: 29
    title: Promote lint read failures to environment errors
    status: done
    progress: tasks/task-29/progress.md
  - id: 30
    title: Preserve workbench output channels
    status: done
    progress: tasks/task-30/progress.md
  - id: 31
    title: Correct review transition documentation
    status: done
    progress: tasks/task-31/progress.md
---
# Progress: Replace Hamilton Helper Scripts with the Workbench CLI

| Task | Status | Progress |
| --- | --- | --- |
| Task 1: Add the shared artifact reader | done | [details](tasks/task-1/progress.md) |
| Task 2: Register artifact metadata contracts | done | [details](tasks/task-2/progress.md) |
| Task 3: Validate artifact bodies and workflow records | done | [details](tasks/task-3/progress.md) |
| Task 4: Implement explicitly scoped linting | done | [details](tasks/task-4/progress.md) |
| Task 5: Establish runtime seams for isolation | done | [details](tasks/task-5/progress.md) |
| Task 6: Port prototype branching | done | [details](tasks/task-6/progress.md) |
| Task 7: Port diff packaging | done | [details](tasks/task-7/progress.md) |
| Task 8: Port change context | done | [details](tasks/task-8/progress.md) |
| Task 9: Port repository precondition gates | done | [details](tasks/task-9/progress.md) |
| Task 10: Port evidence freshness gates | done | [details](tasks/task-10/progress.md) |
| Task 11: Compose the workbench CLI | done | [details](tasks/task-11/progress.md) |
| Task 12: Remove script installation from setup | done | [details](tasks/task-12/progress.md) |
| Task 13: Migrate skills to workbench commands | done | [details](tasks/task-13/progress.md) |
| Task 14: Update framework documentation | done | [details](tasks/task-14/progress.md) |
| Task 15: Delete obsolete shell helpers and tests | done | [details](tasks/task-15/progress.md) |
| Task 16: Align per-pass feedback and review producers | done | [details](tasks/task-16/progress.md) |
| Task 17: Parse and validate per-pass review evidence | done | [details](tasks/task-17/progress.md) |
| Task 18: Lint per-pass review evidence | done | [details](tasks/task-18/progress.md) |
| Task 19: Gate preconditions on parsed review evidence | done | [details](tasks/task-19/progress.md) |
| Task 20: Report context from parsed review evidence | done | [details](tasks/task-20/progress.md) |
| Task 21: Synchronize per-pass evidence specifications and verification | done | [details](tasks/task-21/progress.md) |
| Task 22: Model legacy review transitions | done | [details](tasks/task-22/progress.md) |
| Task 23: Verify review transition consumers | done | [details](tasks/task-23/progress.md) |
| Task 24: Teach review producers the transition | done | [details](tasks/task-24/progress.md) |
| Task 25: Document the review transition contract | done | [details](tasks/task-25/progress.md) |
| Task 26: Synchronize root progress metadata | done | [details](tasks/task-26/progress.md) |
| Task 27: Repair Task 21 completion evidence | done | [details](tasks/task-27/progress.md) |
| Task 28: Restore progress ledger parsing parity | done | [details](tasks/task-28/progress.md) |
| Task 29: Promote lint read failures to environment errors | done | [details](tasks/task-29/progress.md) |
| Task 30: Preserve workbench output channels | done | [details](tasks/task-30/progress.md) |
| Task 31: Correct review transition documentation | done | [details](tasks/task-31/progress.md) |
