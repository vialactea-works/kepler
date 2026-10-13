# Task diff code-quality rubric

Use this rubric to judge the structural quality of exactly one task diff. Apply it proportionately
to changed code and the one permitted concrete named-risk location. It is diff-scoped: it does not
authorize general repository exploration or redesign beyond the task's binding plan.

## How to use this

For each principle, look for a concrete smell in the changed lines. A finding identifies the file
and location, names the violated principle, explains its present cost, and specifies a bounded fix.
Classify a defect as blocking only when it prevents the task from meeting acceptance or creates a
real correctness, security, maintenance, or testability failure. Keep speculative improvements in
Suggestions.

When the task's required design itself causes a structural defect, identify it as a plan or design
constraint. Do not ask the implementer to silently depart from binding intent.

## Principles

### Cohesion

A unit should have one task-relevant responsibility. A unit that combines independently changing
jobs should be split at that boundary.

### Clear boundaries and low coupling

Changed code should depend on narrow, intentional interfaces rather than another unit's internals.
Flag concrete coupling that makes the task leak across ownership boundaries.

### Testable seams

Policy should not construct hard-coded IO, clock, network, randomness, or persistence dependencies
when the task requires isolated behavioral tests. Prefer the smallest seam that supports the real
case.

### Single source of truth

A rule, value, or artifact shape should have one authority. Flag copied knowledge that can drift,
but do not merge code that is only coincidentally similar.

### Right-sized abstraction

The structure should solve the present task without unused layers, generic hooks, configuration, or
extension points. Equally, repeated task logic with an established shared concept should not remain
scattered.

### Intention-revealing names

Names should express the domain purpose visible in the task and diff. Flag vague names only when
they make behavior or ownership materially harder to understand.

### Explicit failure and edge handling

Required failure modes should have deliberate behavior and meaningful tests. Flag swallowed errors,
implicit fallthrough, incomplete validation, and happy-path-only handling that violates acceptance.

### Controlled complexity

Prefer direct control flow and the fewest useful layers. Flag excessive nesting, oversized units, or
indirection when it obscures a task-relevant invariant or failure path.

### Behavioral tests

Tests should assert public outcomes, failure behavior, and relevant edge cases. They should fail for
the intended regression rather than merely mirror implementation text or structure.

### Scope integrity

Every changed path should serve the assigned task. Flag unrelated edits, dead code, stubs, TODOs,
debug output, commented-out code, weakened tests, and accidental generated artifacts.

## Dependency-mode scope integrity

Inspect goal-serving unlisted paths rather than rejecting them by filename. A prerequisite expansion must be necessary, committed before edits, bounded to two lifetime reservations and four concrete paths each, and within approved intent; otherwise request changes with a located finding.
