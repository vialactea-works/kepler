---
artifact: proposal
change: 2026-09-22-fix-skill-artifact-linting
status: draft
decision: accepted
author: "Caio Ferreira <caiorcferreira@gmail.com>"
created: 2026-09-22
route_unit: null
---

# Proposal: Make Hamilton Artifact Authoring Lint-Valid

## Why

Hamilton's planning skill initializes `progress.md` and one task-local progress file per task, but it does not spell out all lint-required frontmatter values. More importantly, the skill correctly creates each new task log without an attempt, while `hamilton workbench lint` rejects that empty pending state. The authoring instructions and validator therefore disagree about a legitimate first state, and artifact-producing skills have no consistent post-write lint gate.

## Goals & Success Criteria

- Make `hamilton-plan` initialize `plan.md`, root `progress.md`, and every `tasks/task-N/progress.md` with concrete metadata and body structure accepted by `hamilton workbench lint`.
- Keep a new task log honestly empty and lint-valid while its task is pending; do not fabricate an implementation attempt to satisfy validation.
- Align lint with legitimate initial and staged lifecycle states so skills can validate an artifact after creating or updating it.
- Require every skill that creates or edits a workbench-recognized Hamilton artifact to run the appropriate scoped lint command after its mutation and resolve findings before handoff or commit.
- Use the configured Git name and email in every newly created artifact that requires an `author` field, and teach its producing skill how to obtain them.
- Update the skill reference and artifact contract tests to describe and verify the authoring gate.

## Non-Goals

- Do not lint generic project code, documentation, research notes, or throwaway prototype files that are not workbench-recognized Hamilton artifacts.
- Do not add a new lint command, selector, configuration system, or automatic artifact repair.
- Do not create synthetic task attempts or change task, review, map, ticket, or finish ownership.
- Do not reinterpret or migrate legacy artifact layouts.

## Proposed Change

Specify how `hamilton-plan` fills the required frontmatter and body for its three outputs, including the root task metadata and table and an attempt-free pending task log. Teach artifact-producing skills to populate required `author` fields from the repository's configured Git name and email, preserving the original author when revising an existing artifact. Extend the workbench artifact contract to accept the valid initial task-log state and other deliberately staged states that must be linted during the existing skill lifecycle. Add a post-write lint step to every skill that mutates a recognized Hamilton artifact, using `--file` for a single artifact or `--change-dir` for a completed change tree. Preserve the existing artifact lifecycle and make the lint command's result a gate: a nonzero result requires correction or a reported blocker, never a bypass.

## Capabilities

### New

### Modified

- `artifact-templates`: artifact producers populate required author metadata from the configured Git identity.
- `execution`: planning and execution artifacts are initialized and kept in a lint-valid state, including an empty pending task log.
- `workbench`: lint accepts legitimate initial and staged artifact states and remains strict about malformed or inconsistent records.
- `framework-docs`: the skills reference documents the post-write lint gate and its scope.

### Removed

## Impact

The change affects the workbench body validator and its tests, the Hamilton artifact-producing skills, `docs/skills.md`, and the canonical artifact-templates, execution, workbench, and framework-docs specifications. It changes no public command syntax or stored task identities and requires no migration; existing well-formed artifacts remain valid.
