---
artifact: feedback
change: 2026-09-25-replace-effect-cli-with-nestjs
task: 1
created: 2026-09-25
status: resolved
decision: accepted
---

# Code Feedback: Task 1 — Pin Nest runtime and compiler support

## Pass 1 — 2026-09-25

Base: 01fbd58a835e3d7363bb3d5967aa37f2d5ed7bb5
Head: 0132fefbe93a79c7cc0f09cc9380b22418d603e1
Verdict: changes-requested

### Blocking

- [bun.lock:75,373; tests/cli/nest-metadata.test.ts:21-30] `nest-commander@3.21.0` brings in `@golevelup/nestjs-discovery@7.0.3`, whose declared `@nestjs/common` and `@nestjs/core` peer ranges are only `^11.1.21`, while this task pins both to `12.1.0`; Bun reports the peer mismatch. The test imports `CommandFactory` but only checks that the symbol exists, then exercises a generic `@nestjs/testing` module; it does not run command discovery or resolve/execute a command through `nest-commander`. Therefore the pinned command runtime's compatibility with Nest 12, and the cited command-resolution scenario, remain unverified. Keep the required pins and add a no-HTTP-adapter integration test that uses `CommandFactory` to resolve and execute a minimal command with the explicit token under these versions, or otherwise reconcile the discovery dependency's peer compatibility (violates: Task 1 Acceptance 1; `cli-distribution` Nest command runtime scenario).

### Suggestions

- None.

## Pass 2 — 2026-09-25

Base: 01fbd58a835e3d7363bb3d5967aa37f2d5ed7bb5
Head: 60dd1e436af1ce67e450e76576fcf82fed11666c
Verdict: approved

### Blocking

- None.

### Suggestions

- [bun.lock:75] Keep compatibility claims scoped to the `CommandFactory.runWithoutClosing` path exercised here; `@golevelup/nestjs-discovery@7.0.3` still declares Nest 11-only peer ranges.
