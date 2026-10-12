---
artifact: requirements-change
capability: artifact-templates
change: 2026-09-22-fix-skill-artifact-linting
status: draft
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
---

# Capability: artifact-templates

Artifact templates define the metadata and body shapes that Hamilton skills instantiate in project workspaces.

## ADDED Requirements

## MODIFIED Requirements

### Requirement: Populate artifact authors from configured Git identity

When creating a workbench-recognized artifact whose template requires an `author` field, the producing skill SHALL read the effective repository Git configuration values `git config user.name` and `git config user.email` and populate the field as `Name <email>` using both values. The skill SHALL NOT substitute an agent name, operating-system username, or unresolved template placeholder. If either value is unavailable, the skill SHALL ask the user or stop with a blocker rather than inventing an identity. When editing an existing artifact, the skill SHALL preserve its recorded author instead of replacing the original author's attribution.

- Priority: must
- Rationale: durable artifact attribution should match the Git identity configured for work in the repository and remain stable through later edits.

#### Scenario: Create an author-bearing artifact

- WHEN a skill creates an artifact with an `author` field in a repository with configured `user.name` and `user.email`
- THEN the field contains both configured values in `Name <email>` form and contains no agent or template placeholder

#### Scenario: Git identity is incomplete

- WHEN either configured Git identity value is missing while an author-bearing artifact is being created
- THEN the skill asks the user or reports a blocker and does not claim the artifact has valid authorship

#### Scenario: Revise an existing artifact

- WHEN a skill edits an existing artifact that already has an `author` value
- THEN it preserves that value unless the user explicitly directs an attribution change
