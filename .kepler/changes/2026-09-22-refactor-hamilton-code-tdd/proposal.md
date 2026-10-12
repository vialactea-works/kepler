---
artifact: proposal
change: 2026-09-22-refactor-hamilton-code-tdd
status: draft
decision: accepted
author: Hermes Agent
created: 2026-09-22
route_unit: null
---

# Proposal: Refactor hamilton-code Around a TDD Cycle

## Why

`hamilton-code` currently describes implementation, verification, self-review, and commit as one ordered block while the separate `hamilton-code-feedback` skill is introduced only as a later driver action. That leaves the intended red/green/refactor discipline implicit: an implementer can stop after a passing test, and the refactor review is easy to treat as optional rather than as the gate that completes the cycle.

## Goals & Success Criteria

- Make every ordinary `hamilton-code` implementation cycle explicit and ordered as red, green, then refactor.
- Make `hamilton-code-feedback` the named review gate for the refactor phase, with the driver unable to advance until the latest feedback is addressed and approved.
- Preserve the existing task-local evidence, stable checkpoint, verification, root-status, and commit conventions.
- Define a fail-closed exception for work that cannot begin with a conventional failing test, requiring a written justification and a repeatable alternative verification strategy.
- Update the skill instructions, orchestrator handoff prompts, public workflow documentation, and contract tests so the sequence and handoff are mechanically checkable.

## Non-Goals

- Do not change the task ledger shape, checkpoint semantics, task numbering, feedback artifact ownership, or whole-branch review gate.
- Do not make `hamilton-code-feedback` modify implementation code, tests, task status, or progress evidence.
- Do not require a particular test framework or invent a new runtime tool for test discovery or execution.
- Do not redesign the broader Hamilton pipeline or move sequencing judgment from skills into the CLI.

## Proposed Change

Refactor `skills/hamilton-code/SKILL.md` so its implementation process names the red phase as a failing behavioral test, the green phase as the smallest passing implementation, and the refactor phase as a behavior-preserving cleanup that keeps the relevant tests passing. The implementation attempt must record the observed red, green, and refactor verification evidence in its task-local progress. A green result remains an intermediate milestone; the task is not fully gated until the refactor review is complete.

Refactor `skills/hamilton-code-feedback/SKILL.md` and the orchestration prompts so task feedback is explicitly the refactor-phase review. The reviewer receives the task acceptance, project standards, stable task diff, latest task-local TDD evidence, and implementation context; `approved` closes the cycle, while `changes-requested` returns the same task to a correction cycle whose finding is addressed and reverified before advancement. Feedback remains an artifact-only, append-only review and never becomes an implementation shortcut.

Document the same cycle in the framework-facing skill reference and SDD workflow narrative. Extend contract tests to verify ordering, exceptional-case evidence, feedback handoff, correction routing, and the absence of a green-only completion path.

## Capabilities

### New

*(none)*

### Modified

- `execution`: `hamilton-code` now defines a red/green/refactor implementation cycle, records phase evidence, and requires an explicit alternative verification path when a conventional failing test is not possible.
- `review`: `hamilton-code-feedback` is the refactor-phase tactical gate, and its result controls whether the current task cycle is complete or returns to correction.
- `framework-docs`: the public skill and SDD references explain the TDD cycle, feedback handoff, and correction loop.

### Removed

*(none)*

## Impact

The change affects the bundled `hamilton-code`, `hamilton-code-feedback`, and orchestration instructions, their contract tests and dispatch prompts, and the framework documentation that explains the per-task pipeline. It changes no application runtime code, public CLI surface, artifact format, or task-ledger storage. Existing task plans remain authoritative: their ordered Steps still define the concrete work, while the code skill supplies the required red/green/refactor discipline around those steps.

The unattended assumption is that the current pipeline's durable state model remains authoritative: `hamilton-code` commits a completed implementation attempt and its task-local evidence, `hamilton-code-feedback` commits only its feedback artifact, and orchestration uses the physically latest feedback pass to decide whether the task advances. A feedback request therefore creates a new correction attempt rather than being edited into an earlier attempt.

## Open Questions

*(none; unattended defaults are recorded in the design and requirements)*
