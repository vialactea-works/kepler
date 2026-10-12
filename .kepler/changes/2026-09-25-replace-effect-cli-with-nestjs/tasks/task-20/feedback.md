---
artifact: feedback
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 20
created: 2026-09-27
status: resolved
decision: accepted
---

# Code Feedback: Task 20 — Remove Effect tooling

## Pass 1 — 2026-09-27

Base: cecfb8db0d7d6a90510b3f20b0450a61da385608
Head: 0d03995e91b47426f7c9ca1b90af3137191085b2
Verdict: approved

### Blocking

- None.

### Suggestions

- [tests/cli/effect-cleanup.test.ts:13] Extend `forbiddenImport` to catch valid side-effect imports such as `import "effect"`; the current alternatives match `from`, dynamic `import()`, and `require()` forms but not that form.
