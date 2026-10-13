---
artifact: review
change: 2026-10-12-dependency-aware-task-execution
created: 2026-10-13
status: complete
decision: rejected
---

# Whole-branch Review: Dependency-aware goal-driven task execution

## Pass 1 — 2026-10-13

Base: af6ab93557da1941243842cc24f77ce442bc1a3d
Head: fd137b8e7d0d56ae9b54a408f98ce46df9e1d06b
Verdict: changes-requested
Scope: full
Target: refs/heads/main

### Blocking

- [packages/cli/src/workbench/context.ts:1804-1829; packages/cli/src/workbench/task-checkpoint.ts:442-448] id: pass-1-blocking-1; kind: code-defect; Context validates a v2 reservation without deriving the admitted task's original Base, so it falls back to the earliest task-progress commit and rejects a valid downstream reservation when an already fully-gated prerequisite changed the shared path. A disposable real-Git fixture admitted Task 2 after Task 1 changed `src/shared.ts`; `task-state --reserve` accepted Task 2's before-edit reservation, but `context` then reported `reserved path changed before its reservation`. Derive the same verified admission baseline used by checkpoint recovery and add this dependency/shared-path regression (violates: workbench requirement Admission-backed checkpoint recovery and Task 4 original-Base acceptance).
- [packages/cli/src/workbench/diff.ts:147-160; packages/cli/src/workbench/diff.ts:817-837] id: pass-1-blocking-2; kind: code-defect; Whole-change diff packaging buffers `git diff` with Node's default 1 MiB `spawnSync` limit, so the public review command fails on this valid 4,688,783-byte branch diff. `bun packages/cli/src/cli/main.ts workbench diff --whole-change --target-branch refs/heads/main --out /tmp/kepler-whole-change-review-package.diff` exited 2 with `error: git diff failed` and wrote no package; a direct Node probe reported `ENOBUFS` after 1,108,338 bytes. Stream or otherwise safely accommodate complete packages and add an over-limit regression (violates: whole-branch diff packaging contract used by review).
- [README.md:55-57; docs/modes.md:84-92; docs/skills.md:87-95; tests/docs/workbench-docs.test.ts:23] id: pass-1-blocking-3; kind: code-defect; The public workbench command inventories omit the newly registered `task-state` operation, although `kepler workbench --help` exposes it and v2 admission, reservation, and publication require it. The documentation test also hard-codes an incomplete command list, so it passes without detecting the omission. Document `task-state` with the supported workbench surface and update the documentation contract (violates: framework-docs requirement Versioned migration and evidence and Task 6 public documentation acceptance).

### Suggestions

- None.
