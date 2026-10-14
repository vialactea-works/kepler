# Code Feedback: Task 37 — Gate advancement on durable task approval

## Pass 1 — 2026-09-05

Base: c3a0313a2fce89731f6f828ddde24d239efd5f55
Head: e3454b35c4927c33497d5c58f51b2c439b843a47
Verdict: changes-requested

### Blocking

- [skills/hamilton-orchestrate/SKILL.md:116; skills/hamilton-review/SKILL.md:72] `git diff --quiet HEAD -- "$feedback_path"` does not prove that the index is unchanged from `HEAD`: when a different blob is staged and the worktree bytes are restored to the `HEAD` blob, the command succeeds even though `git status` reports `MM`. Both contracts therefore permit a staged feedback divergence to satisfy the durable-approval predicate and authorize advancement, contrary to the requirement that the approval be tracked and unchanged at current `HEAD`. Require separate index and worktree comparisons (or another check that demonstrably covers both states), and add a regression assertion for the staged-divergence/worktree-restored case instead of only matching the stated command. (violates: Task 37 acceptance — approvals are consumable only when feedback is tracked and unchanged at current `HEAD`, and direct review requires the same exact committed evidence)

### Suggestions

- None.

## Pass 2 — 2026-09-05

Base: c3a0313a2fce89731f6f828ddde24d239efd5f55
Head: c20bc12838c727c77a1419be6f907072d10a3072
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
