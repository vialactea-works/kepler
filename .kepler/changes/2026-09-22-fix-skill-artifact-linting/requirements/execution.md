---
artifact: requirements-change
capability: execution
change: 2026-09-22-fix-skill-artifact-linting
status: draft
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
---

# Capability: execution

Execution artifacts separate the current task ledger from append-only task evidence and finish history.

## ADDED Requirements

## MODIFIED Requirements

### Requirement: Initialize task execution artifacts in a lint-valid state

The system SHALL create `plan.md`, root `progress.md`, and every active task's `tasks/task-N/progress.md` with concrete, valid frontmatter and the required body structure. The plan frontmatter SHALL contain `artifact`, `change`, a valid lifecycle `status`, `created`, `author`, `decision`, and `route_unit`; `author` SHALL use the configured Git `user.name` and `user.email` in `Name <email>` form. If either Git identity value is unavailable, the authoring skill SHALL ask the user rather than inventing an identity. Root progress SHALL contain `artifact`, `change`, `status`, `updated`, `decision`, and one `tasks` metadata entry and one Markdown table row per active plan task, with matching numeric identity, title, status, and exact task-progress path; each table link SHALL use `[details](tasks/task-N/progress.md)`. A new task-progress artifact SHALL contain `artifact`, `change`, numeric `task`, `status: pending`, `updated`, and `decision`, identify the same change and task, use the exact `# Task Progress: Task N — <title>` heading, and contain no attempt until implementation begins. The artifact SHALL be valid under `hamilton workbench lint` in that empty initial state; planning SHALL NOT invent an attempt or leave template placeholders in the live artifact.

- Priority: must
- Rationale: task identity and current state need one lint-valid initialization without misrepresenting work that has not happened.

#### Scenario: Planning initializes active tasks

- WHEN `hamilton-plan` creates a plan with active Tasks 1 and 2
- THEN `plan.md` has valid populated frontmatter, root progress has matching metadata and table entries linked to `tasks/task-1/progress.md` and `tasks/task-2/progress.md`, and both task logs have valid pending metadata and identity headings

#### Scenario: The plan records the repository author

- WHEN `hamilton-plan` creates `plan.md` in a repository with configured Git `user.name` and `user.email`
- THEN its `author` frontmatter contains both configured values in `Name <email>` form

#### Scenario: A new task has no execution history

- WHEN the task log is initialized before any code attempt
- THEN it contains no attempt record and `hamilton workbench lint --file <change-dir>/tasks/task-N/progress.md` succeeds

#### Scenario: Task display title contains a table delimiter

- WHEN a plan task title contains `|`
- THEN root progress escapes the delimiter in the displayed table title, preserves the exact title in task metadata and the task heading, and lint accepts the artifact

### Requirement: Lint after recognized artifact mutations

Every skill that creates or edits a workbench-recognized Hamilton artifact SHALL run `hamilton workbench lint` with the narrowest valid selector after the artifact mutation. A complete change tree SHALL use `--change-dir <change-dir>`; an artifact outside a change directory or a single explicitly owned artifact SHALL use `--file <file>`. The skill SHALL treat a nonzero lint result as a failed gate, correct the artifact and rerun lint, or report the exact blocker without committing or claiming compliance. Lint SHALL run at a lifecycle boundary where the current artifact state is valid, including supported initial or staged states.

- Priority: must
- Rationale: authored artifacts must be checked against the same contract that downstream workbench operations consume.

#### Scenario: A skill finishes authoring a change tree

- WHEN a skill has created or updated the recognized artifacts in a change directory
- THEN it runs `hamilton workbench lint --change-dir <change-dir>` and proceeds only when the command reports success

#### Scenario: A skill updates a single canonical or map artifact

- WHEN a skill creates or edits one recognized artifact outside a change tree
- THEN it runs `hamilton workbench lint --file <file>` on that artifact and resolves any findings before handoff or commit

#### Scenario: Lint reports an error or warning

- WHEN the post-write lint command exits nonzero
- THEN the skill corrects the artifact and reruns lint, or stops with the finding and does not bypass the check
