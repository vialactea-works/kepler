---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 8
created: 2026-09-13
status: resolved
verdict: approved
decision: accepted
base: 22d8d1a6a78717344b36350f160b9171480168b7
head: 28ed5c59b3818b020f275c282ed46aab05d7b33e
---

# Code Feedback: Task 8 — Port change context

## Pass 1 — 2026-09-13

### Blocking

- [src/workbench/context.ts:990-1000, 1049-1063] Invalid or contract-invalid frontmatter in feedback.md or review.md enters the legacy body-parser branches instead of being rejected, so a malformed current artifact with a legacy-shaped body can be reported with a valid verdict and freshness. Branch only for an unrelated artifact result and return `malformed` for invalid recognized input (violates: current frontmatter artifacts use shared typed inspection; malformed artifacts fail closed without silent reinterpretation).
- [src/workbench/context.ts:562-572] A recognized current proposal or plan whose authoritative `route_unit` is null or absent is still parsed for a legacy route table in its Markdown body, allowing body metadata to override or invent current route metadata. Restrict the body fallback to unrelated/legacy artifacts and leave route metadata absent when recognized frontmatter does not provide it (violates: frontmatter is authoritative and context body parsing is limited to legacy classification).
- [src/workbench/context.ts:1254-1266] `contextAll` does not catch failures from `readDirectory(changesDir)` or per-entry directory checks, so an unreadable changes directory can reject the operation instead of returning the required exit-2 environment error. Catch discovery I/O failures and convert them to an `all` error result without emitting successful context output (violates: invalid paths and unreadable changes return environment errors).

### Suggestions

- None.

## Pass 2 — 2026-09-13

### Blocking

- [src/workbench/context.ts:1263-1270] The all-scope discovery check calls `directoryExists(changesDir)` outside the discovery error boundary, and the production adapter converts every stat failure into `false`; an unreadable `.hamilton/changes` directory can therefore be reported as the normal exit-1 “no changes” result (or reject through an injected port) instead of the required exit-2 environment error. Preserve the distinction between a missing directory and discovery I/O failure, catch the check, and return an error result with no context output (violates: invalid paths and unreadable changes, including all-scope discovery I/O, return exit-2 environment errors without successful context output).

### Suggestions

- None.

## Pass 3 — 2026-09-13

### Blocking

- [src/workbench/context.ts:590-612, 650-680] The inventory loop reads every listed artifact as raw text but contract-inspects only plan/progress/task progress/review, so malformed recognized proposal.md, design.md, finish.md, or critique.md can still produce a successful pre-plan or split context instead of failing closed. Run shared typed inspection for every recognized frontmatter artifact before format discovery, retaining body fallback only for unrelated legacy input (violates: current frontmatter artifacts use shared typed inspection and malformed recognized artifacts fail closed).
- [src/workbench/context.ts:552-574] routeUnit can fall through from a recognized proposal or plan with null/absent route_unit to an unrelated sibling's legacy body route table, allowing current route metadata to be invented by legacy text. Treat any recognized proposal/plan as authoritative across the pair and use body fallback only when neither is recognized (violates: current frontmatter is authoritative).
- [src/workbench/context.ts:816-833] When the change-level progress is legacy/unrelated, a recognized but contract-invalid task progress artifact is passed to taskAttempts and can be accepted from its legacy-shaped body. Only use that parser for an unrelated task artifact; classify recognized invalid input as malformed and mixed current/legacy layouts as legacy-unsupported (violates: shared typed inspection and fail-closed legacy classification).
- [src/workbench/context.ts:164-170] The production pathExists adapter converts every lstat failure into false, so EACCES or another unreadable-artifact error is treated as an absent file and can yield a normal pre-plan/legacy result instead of an exit-2 environment error. Return false only for ENOENT and rethrow other failures (violates: invalid paths and unreadable changes return environment errors without successful context output).

### Suggestions

- None.

## Pass 4 — 2026-09-13

### Blocking

- [src/workbench/context.ts:1087-1133] `latestReview` never verifies that `review.md` is durable and committed before evaluating its Base/Head range, unlike `latestFeedback`; a valid uncommitted or staged-only review can therefore be reported as `approved (fresh)`. Check the review artifact's worktree/staged state and commit ownership, returning an uncommitted standing before freshness evaluation (violates: feedback/review freshness and fail-closed context reporting).
- [src/workbench/context.ts:1097-1101] The current-review title regex uses `"\\\\$&"`, which double-escapes regex metacharacters. A valid current review whose plan title contains characters such as `.` or `[` is consequently classified as `malformed` instead of retaining its review standing. Escape each metacharacter with one backslash (violates: current frontmatter context correctness and preservation of review freshness).

### Suggestions

- None.

## Pass 5 — 2026-09-13

### Blocking

- None.

### Suggestions

- None.
