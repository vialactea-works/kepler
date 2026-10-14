# Whole-branch code-quality rubric

In `full` mode, read the complete merge-base-to-head diff, then apply this rubric. Use the diff as starting evidence, not an inspection boundary. Trace changed causes to unchanged consumers, combined behavior and required material work missing from the diff.

In `remediation` mode, validate retained full-review coverage. Apply these dimensions to the cumulative correction delta, every baseline/suffix blocker, and affected consumers and invariants. Do not repeat the full inspection or reopen unrelated preferences. Fall back to full review if provenance is invalid, intent changed, material corrections are unclassified or integration impact is unbounded.

For every blocking finding, name the changed cause and affected repository location when they differ, explain the present failure, specify the correction, and cite the violated requirement, design decision, or project standard. Keep speculative refinements in Suggestions.

## Integration and composition

Check that the combined branch preserves invariants across task boundaries. Trace data, control, artifact ownership and workflow state through component interactions in their actual order. Look for parallel implementations that pass alone but disagree on identity, state, ordering, freshness, failure behavior or handoff contracts when combined.

## Missing material changes

Look for required changes missing from the diff. Changed behavior may require updates to tests, specifications, maps, commands, skills, templates, scripts, migrations or documentation. Report an omitted required change at its affected path, even when that path is outside the diff.

Report an omission only when a requirement, changed contract, repository convention or reachable behavior requires the update; minimal scope does not excuse missing required work.

## Affected consumers and assumptions

Trace every changed public or internal contract to all plausibly affected consumers. Check call sites, parsers, writers, validators, templates, fixtures, documentation, and operational scripts that encode its old shape or semantics. State the assumption each consumer makes and whether the new branch preserves it.

Continue beyond the first unaffected consumer. In full review, account for the broader repository; one spot-check cannot establish compatibility across it. In remediation review, account for all consumers affected by the cumulative corrections and validate the retained coverage boundary.

## Requirement and design completeness

Check the complete implementation against every binding requirement and design decision. Examine failure scenarios and negative constraints as closely as the happy path. If an approved requirement or design mandates a defect, route it for proposal revision; do not ask the implementer to depart silently from approved intent.

## Boundaries and ownership

Check that each artifact and state transition has one owner, paths use the canonical layout, and no task or skill writes another component's evidence. Flag forbidden paths, duplicated authorities, scope leakage, and bookkeeping that changes implementation state.

## Structural coherence

Judge cohesion, coupling, testable seams, sources of truth, abstraction size, naming, explicit failure handling, and complexity across the assembled branch. Prefer the simplest correction that restores a concrete invariant. Do not request speculative architecture or unrelated cleanup.

## Behavioral evidence

Tests should assert observable branch behavior and fail for the regression they claim to cover. Evaluate accumulated task-local test evidence and changed tests before running verification. If a concrete doubt remains, name it and run only the narrowest check that resolves it. Leave full-suite and build verification to finish-work.

## Scope and hygiene

Account for every changed path. Flag unrelated edits, secrets, unsafe handling, dead code, stubs, TODOs, debug output, commented-out blocks, weakened tests, and accidental generated artifacts. Confirm that non-code artifacts are intentional and consistent with their repository consumers.
