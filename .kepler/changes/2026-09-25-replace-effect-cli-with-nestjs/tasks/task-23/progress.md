---
artifact: task-progress
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 23
status: done
updated: 2026-09-27
decision: accepted
---
# Task Progress: Task 23 — Publish versioned migration notes

## Attempt 1 — 2026-09-27

Outcome: done

Summary: Published version-specific 0.9.0 CLI migration notes and wired the release workflow to require notes for the version emitted by `check-version` before creating a release.

Created:
- `docs/releases/0.9.0.md`
- `tests/docs/release-notes.test.ts`

Modified:
- `.github/workflows/release.yml`
- `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/progress.md`
- `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/tasks/task-23/progress.md`

Deleted: none

Verification:
- `hamilton workbench isolate --check --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs` — passed; `isolated: yes`.
- `bun --bun vitest run tests/docs/release-notes.test.ts` before integration — expected red; both tests failed because versioned notes and publish-job checkout/integration were absent.
- `bun --bun vitest run tests/docs/release-notes.test.ts tests/docs/cli-migration.test.ts` — passed; 2 files, 4 tests.
- `bun --bun vitest run tests/docs/release-notes.test.ts tests/docs/cli-migration.test.ts && bun --bun vitest run && bun run build` — passed; focused 2 files/4 tests, full suite 41 files/532 tests, TypeScript build passed.
- `git diff --check` — passed.
- YAML parse and structural assertions — passed; all four binary target pairs match the baseline, non-publish jobs are unchanged, and bundle packaging/checksum commands are preserved.
- `hamilton workbench lint --file .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/progress.md` — passed after Task23 was marked done.
- `hamilton workbench lint --file .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/tasks/task-23/progress.md` — passed with the final attempt record.

Notes:
- The first integrated focused run exposed an overly strict test regex for Markdown backticks; the assertion was corrected, then focused and full verification passed.
- Release behavior was not executed against GitHub; tests assert the workflow's dynamic path, fail-closed existence check, and `--notes-file` use without running `gh`.
- Task23 checkpoint is `42d41135cc6d012663ca68e724ff80ddba309f5d`; Task22 checkpoint remains `dc03a80192dcdce96faa32d560abdac5197fe191`.
