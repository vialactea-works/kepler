---
artifact: feedback
change: 2026-09-21-refactor-wayfinder-route
task: 2
created: 2026-09-21
status: open
decision: accepted
---

# Code Feedback: Task 2 — Enforce the route artifact contract

## Pass 1 — 2026-09-21

Base: 35682b877651868819de6cc4f0f0f18204db30ed
Head: 85dc0e8c55877a9fbade34d1dd6cb8f5f5f9b413
Verdict: changes-requested

### Blocking

- [src/workbench/artifact-body.ts:176-181, 260-267] Route workflow parsing treats every level-3 heading matching `N. title` as a unit, regardless of whether it is under `## Units`; a numbered Destination subheading is therefore misclassified as a workflow record and can produce `non-monotonic-record` or other unit diagnostics. Restrict unit record discovery and contiguous parsing to the Units section while leaving Destination subheadings outside workflow records (violates: “Destination subheadings ... do not become workflow records or interfere with contiguous unit parsing”).

### Suggestions

- None.

## Pass 2 — 2026-09-21

Base: 35682b877651868819de6cc4f0f0f18204db30ed
Head: e25e8c3d1b31a1d91eb465fb32551ad21174df76
Verdict: approved

### Blocking

- None.

### Suggestions

- None.

## Pass 3 — 2026-09-21

Base: 35682b877651868819de6cc4f0f0f18204db30ed
Head: 6e069a79fefe6657cbdd2342e6c94b21730c6bb2
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
