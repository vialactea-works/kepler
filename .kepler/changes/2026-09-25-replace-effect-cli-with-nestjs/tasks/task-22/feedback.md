---
artifact: feedback
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 22
created: 2026-09-27
status: resolved
decision: accepted
---

# Code Feedback: Task 22 — Smoke-test standalone binaries

## Pass 1 — 2026-09-27

Base: dc03a80192dcdce96faa32d560abdac5197fe191
Head: 5aed0003bca00bdb78a0fee21c37dd28188c9606
Verdict: approved

### Blocking

- None.

### Suggestions

- [.github/workflows/release.yml:26,35-60] The diff also quotes/formats the version-output and release/tag-check steps, unrelated to Task22's compile externalization and smoke invocation. Keep these edits only if intentional; otherwise revert them to keep this task focused.
- [scripts/smoke-standalone.sh:30,50-53] If `TMPDIR` is relative, `stage` remains relative; after `cd "$stage"`, `run_cli` resolves `$stage/bin/hamilton` and `HOME="$stage/home"` from inside the stage and fails. Normalize `stage` to an absolute path after `mktemp`, or reject relative `TMPDIR` explicitly.

## Pass 2 — 2026-09-27

Base: dc03a80192dcdce96faa32d560abdac5197fe191
Head: 9df084cd11bca2101ce0e100ee547dceea116551
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
