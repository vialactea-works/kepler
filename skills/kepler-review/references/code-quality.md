# Whole-branch code-quality rubric

In `full` mode, use this rubric after reading the complete merge-base-to-head diff. The diff is
starting evidence, not an inspection boundary: trace changed causes to unchanged consumers,
composed behavior and required material work absent from the diff.

In `remediation` mode, validate retained full-review coverage and apply these dimensions to the
cumulative correction delta, every baseline/suffix blocker and affected consumers/invariants;
do not repeat a full inspection or reopen unrelated preferences. Invalid provenance, changed intent,
unclassified material corrections or unbounded integration impact requires full fallback.

For every blocking finding, name the changed cause and affected repository location when they
differ, explain the present failure, specify the correction, and cite the violated requirement,
design decision, or project standard. Keep speculative refinements in Suggestions.

## Integration and composition

Check that the combined branch preserves invariants across task boundaries. Follow data, control,
artifact ownership, and workflow state through the order in which components actually compose.
Look for parallel implementations that pass alone but disagree on identity, state, ordering,
freshness, failure behavior, or handoff contracts when combined.

## Missing material changes

Inspect what should have changed but did not. A changed behavior may require an unchanged test,
specification, map, command, skill, template, script, migration, or documentation page to be
updated. Treat an omitted required change as a located defect even though its affected path is
beyond the diff.

Do not confuse absence with minimalism. Report an omission only when a requirement, changed
contract, repository convention, or reachable behavior makes the missing update necessary.

## Affected consumers and assumptions

Trace every changed public or internal contract to all plausibly affected consumers. Check call
sites, parsers, writers, validators, templates, fixtures, documentation, and operational scripts
that encode its old shape or semantics. State the assumption each consumer makes and whether the
new branch preserves it.

Continue beyond the first unaffected consumer. Full review must account for the broader repository
surface rather than treating one spot-check as universal compatibility. Remediation review accounts
for all consumers affected by the cumulative corrections and validates the retained coverage boundary.

## Requirement and design completeness

Map the complete implementation back to every binding requirement and design decision. Check
failure scenarios and negative constraints as closely as the happy path. A defect mandated by an
approved requirement or design is an upstream artifact problem; route it for proposal revision
instead of asking implementation to silently depart from approved intent.

## Boundaries and ownership

Check that each artifact and state transition has one owner, paths use the canonical layout, and no
task or skill writes another component's evidence. Flag forbidden paths, duplicated authorities,
scope leakage, and bookkeeping that changes implementation state.

## Structural coherence

Judge cohesion, coupling, testable seams, sources of truth, abstraction size, naming, explicit
failure handling, and complexity across the assembled branch. Prefer the simplest correction that
restores a concrete invariant. Do not request speculative architecture or unrelated cleanup.

## Behavioral evidence

Tests should assert observable branch behavior and fail for the regression they claim to cover.
Evaluate accumulated task-local test evidence and changed tests before executing anything. If code
and evidence leave one concrete doubt, identify it and use only the narrowest focused check needed
to resolve it; full-suite and build verification belong to finish-work.

## Scope and hygiene

Account for every changed path. Flag unrelated edits, secrets, unsafe handling, dead code, stubs,
TODOs, debug output, commented-out blocks, weakened tests, and accidental generated artifacts.
Confirm that non-code artifacts are intentional and consistent with their repository consumers.
