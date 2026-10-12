---
artifact: requirements-change
capability: framework-docs
change: 2026-09-22-fix-skill-artifact-linting
status: draft
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
---

# Capability: framework-docs

Framework documentation explains Hamilton's skills, artifact ownership, and supported workbench commands.

## ADDED Requirements

## MODIFIED Requirements

### Requirement: Document artifact linting at authoring boundaries

The system SHALL document that every skill creating or editing a workbench-recognized Hamilton artifact runs the scoped workbench lint command after the mutation, handles findings before handoff or commit, and does not lint unrelated outputs as Hamilton artifacts. The documentation SHALL distinguish change-directory validation from single-file validation and describe the valid empty pending task-log state without implying a fabricated attempt is required.

- Priority: must
- Rationale: users and skill maintainers need one clear, durable account of the validation gate and its scope.

#### Scenario: A reader looks up artifact validation

- WHEN a reader consults the Hamilton skills reference for workbench lint
- THEN the reference shows the supported `--file` and `--change-dir` selectors and explains when artifact-producing skills invoke them
