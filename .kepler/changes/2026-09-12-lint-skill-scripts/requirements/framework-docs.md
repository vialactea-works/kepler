---
artifact: requirements-change
capability: framework-docs
change: 2026-09-12-lint-skill-scripts
status: draft
created: 2026-09-12
author: Hermes Agent
decision: accepted
---

# Capability: framework-docs

Hamilton's framework documentation and Assisted skills describe the workbench CLI as the supported home for workflow mechanics and no longer present installed shell helpers as required dependencies.

## ADDED Requirements

### Requirement: Skills use the workbench CLI for Hamilton-owned mechanics

Every maintained Hamilton skill that previously invokes a Hamilton-owned helper script SHALL invoke the corresponding `hamilton workbench` subcommand with equivalent arguments and SHALL retain the skill's judgment, ordering, and fail-closed decisions around the operation.

- Priority: must
- Rationale: replacing the executable support surface requires all consumers to move together; leaving one call site on a shell helper would preserve a second implementation and make the migration incomplete.

#### Scenario: Proposal checks isolation

- WHEN `hamilton-propose` needs to check, create, or verify an isolated workspace
- THEN it invokes `hamilton workbench isolate` rather than a file under `~/.hamilton/scripts/`

#### Scenario: Code or orchestration packages a diff

- WHEN `hamilton-code` or `hamilton-orchestrate` records or packages a task or whole-change diff
- THEN it invokes `hamilton workbench diff` with the equivalent existing arguments

#### Scenario: Finish checks its gate

- WHEN `hamilton-finish-work` runs the precondition gate or reads change context
- THEN it invokes `hamilton workbench precondition` and `hamilton workbench context` respectively

#### Scenario: Prototype resolution changes branch

- WHEN `hamilton-wayfinder-prototype` creates, resumes, or verifies a prototype branch
- THEN it invokes `hamilton workbench prototype` with the existing branch identity arguments

### Requirement: Documentation presents the workbench migration accurately

The README, mode and framework documentation, skills reference, and any contributor mapping affected by setup or CLI behavior SHALL describe `hamilton workbench` and its subcommands as the supported workflow-mechanics surface, SHALL explain that lint requires exactly one of `--file <file>` or `--change-dir <dir>`, and SHALL no longer instruct users to install or verify the six helper scripts.

- Priority: must
- Rationale: the documented setup and skill contracts must match the distributed CLI or users will follow a path that the new generation no longer supports.

#### Scenario: Reader follows setup documentation

- WHEN a reader follows the documented Hamilton setup flow for the new generation
- THEN the documentation directs them to install the CLI, run `hamilton setup`, and use the workbench command without requiring a helper-script directory

#### Scenario: Reader learns artifact validation

- WHEN a reader consults the workbench documentation
- THEN they can find the explicit `hamilton workbench lint --file <file>` and `hamilton workbench lint --change-dir <dir>` invocations, the recursive change-directory boundary, skipped-file behavior, and fail-closed artifact validation

#### Scenario: Reader follows migration guidance

- WHEN a user upgrades between active changes
- THEN the documentation tells them to update the CLI and agent-loaded skills together, rerun setup, and understand that existing helper files are not deleted but are no longer used

## MODIFIED Requirements

*(none)*

## REMOVED Requirements

### Requirement: Assisted mode requires six installed helper scripts

- Reason: workflow mechanics now live in the distributed workbench CLI and its internal modules rather than separately installed executable files.
- Migration: use `hamilton workbench` subcommands and refresh the CLI and skills between changes; remove stale helper files explicitly only when desired.

## RENAMED Requirements

*(none)*
