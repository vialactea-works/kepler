---
artifact: task-progress
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 24
status: done
updated: 2026-09-27
decision: accepted
---

# Task Progress: Task 24 — Reject surplus positional arguments

## Attempt 1 — 2026-09-27

- Outcome: done

Created: none
Modified: `src/cli/nest/root.command.ts`, `tests/cli/main.test.ts`, `tests/cli/workbench.test.ts`
Deleted: none
Verification:
- `hamilton workbench isolate --check --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs` → `isolated: yes`
- Red: `bun --bun vitest run tests/cli/main.test.ts tests/cli/workbench.test.ts` against the prior parser configuration → failed as expected on surplus setup/diff arguments being dispatched
- Green: `bun --bun vitest run tests/cli/main.test.ts tests/cli/workbench.test.ts` → 22 tests passed
- `bun --bun vitest run` → 534 tests passed
- `bun run build` → passed
- `git diff --check` → passed
Notes: Configured `allowExcessArguments(false)` on every nested command while leaving the root parser unchanged. Malformed subprocess calls returned one usage error on stderr, empty stdout, and status 2 without diff/precondition artifacts or isolate/prototype branch/worktree mutations. Root no-argument/help/version, unknown-command and bare-workbench behavior remain covered. Package and source versions remain synchronized at 0.9.0. No concerns.
