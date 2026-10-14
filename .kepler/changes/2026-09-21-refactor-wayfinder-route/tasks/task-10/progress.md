---
artifact: task-progress
change: 2026-09-21-refactor-wayfinder-route
task: 10
status: done
updated: 2026-09-21
decision: accepted
---

# Task Progress: Task 10 — Keep representation guidance out of Builder latitude

## Attempt 1 — 2026-09-21

- Outcome: done
- Created: none
- Modified:
  - `skills/hamilton-wayfinder/SKILL.md`
  - `.hamilton/changes/2026-09-21-refactor-wayfinder-route/progress.md`
  - `.hamilton/changes/2026-09-21-refactor-wayfinder-route/tasks/task-10/progress.md`
- Deleted: none
- Verification:
  - `python3 -c 'from pathlib import Path; s=Path("skills/hamilton-wayfinder/SKILL.md").read_text(); concrete=s.index("**Concrete shape**"); latitude=s.index("**Builder latitude**"); assert concrete < latitude; assert "domain-appropriate representation" in s[concrete:latitude]; assert "cannot alter the destination" in s[latitude:]; assert "If that synthesis exposes a contradiction or essential ambiguity" in s'` — passed.
  - `bun --bun vitest run` — 24 files and 416 tests passed.
  - `bun run build` — passed.
- Notes: Moved representation guidance under Destination/Concrete shape, reserved Builder latitude for destination-preserving local choices, and preserved the route synthesis sequence, ambiguity gate, glossary fold, lifecycle mechanics, and installed-template boundary.
