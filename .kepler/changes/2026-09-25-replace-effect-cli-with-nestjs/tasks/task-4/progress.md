---
artifact: task-progress
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 4
status: done
updated: 2026-09-25
decision: accepted
---
# Task Progress: Task 4 — Move isolation into IsolateService

## Attempt 1 — 2026-09-25

- Outcome: done
- Summary: Added injectable `IsolateService.execute(IsolationArguments)` with the explicit `ISOLATION_RUNTIME` token; made the existing isolation entry points delegate to the service and migrated direct tests to service execution.
- Created paths: none
- Modified paths:
  - `src/workbench/isolate.ts`
  - `tests/workbench/isolate.test.ts`
  - `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/progress.md`
  - `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/tasks/task-4/progress.md`
- Deleted paths: none
- Verification:
  - `hamilton workbench isolate --check --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/` — passed; final line `isolated: yes`.
  - `git cat-file -e '1376ddad0aea77a116f7e3e23264cbc1a66f2cd5^{commit}'` and `git merge-base --is-ancestor 1376ddad0aea77a116f7e3e23264cbc1a66f2cd5 HEAD` — passed; `.base` still contains the exact supplied SHA, equals `HEAD`, and remains ignored.
  - Initial `bun --bun vitest run tests/workbench/isolate.test.ts` — expected red: 1 failed, 23 passed; the test demonstrated `IsolateService` was absent.
  - `bun --bun vitest run tests/workbench/isolate.test.ts` after service implementation and test migration — passed, 24 tests.
  - `bun --bun vitest run tests/workbench/isolate.test.ts -t 'reports an unresolved change directory when realpath fails'` with realpath error handling temporarily bypassed — expected red from the simulated realpath failure.
  - The same targeted command after restoring the existing fail-closed handling — passed, 1 test.
  - `bun --bun vitest run tests/workbench/isolate.test.ts && bun --bun vitest run && bun run build` — passed: focused suite 25/25; full suite 30 files and 487/487 tests; build ran `tsc -p tsconfig.json` successfully.
  - `git diff --check` — passed.
- Notes: The first realpath fake also intercepted Git's repository-root resolution; it was narrowed to the requested change directory before the red/green edge-case check. `hamilton workbench diff --task 4 --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/` reported `BASE equals HEAD` (no commits since checkpoint); `.base` was not recreated or staged. Pure helpers, Git adapter, `IsolationResult`, exit codes, final result lines, and mutation guards remain unchanged.
