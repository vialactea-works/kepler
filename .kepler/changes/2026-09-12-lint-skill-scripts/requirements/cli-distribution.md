---
artifact: requirements-change
capability: cli-distribution
change: 2026-09-12-lint-skill-scripts
status: draft
created: 2026-09-12
author: Hermes Agent
decision: accepted
---

# Capability: cli-distribution

The distributed Hamilton CLI installs its supported templates and guidelines and exposes the workbench operations required by the Assisted skills without installing a separate shell-helper runtime.

## ADDED Requirements

### Requirement: The distributed CLI exposes the workbench command

The released Hamilton executable SHALL include the `hamilton workbench` command and all of its supported subcommands without requiring a Hamilton source checkout, Bun installation, or files under `~/.hamilton/scripts/`.

- Priority: must
- Rationale: the workbench replaces the installed helper scripts and must remain available in the same standalone distribution as `setup`.

#### Scenario: Installed binary invokes workbench

- WHEN a released Hamilton binary runs on a supported target with its distributed bundle available
- THEN `hamilton workbench --help` and its operational subcommands start without resolving an installed shell helper

#### Scenario: Workbench runs with stale helper files absent

- WHEN a user has no `~/.hamilton/scripts/` directory
- THEN the workbench command still performs its operations normally

## MODIFIED Requirements

### Requirement: Setup installs the supported Assisted assets without helper scripts

`hamilton setup` SHALL continue to install and report the bundle's templates and guidelines and SHALL create or preserve the Hamilton home and settings as before, but SHALL stop copying and reporting `bundle/scripts/` files. If `~/.hamilton/scripts/` already exists, setup SHALL leave that directory and its contents unchanged rather than deleting or rewriting them.

- Priority: must
- Rationale: the workbench is the single maintained implementation, while non-destructive setup avoids deleting user files during the between-changes migration.

#### Scenario: Fresh setup has no helper installation

- WHEN `hamilton setup` runs for a fresh Hamilton home with the new bundle
- THEN it installs templates, guidelines, and settings, reports no installed helper scripts, and does not create script files under `~/.hamilton/scripts/`

#### Scenario: Setup upgrades an existing home

- WHEN `hamilton setup` runs and `~/.hamilton/scripts/` contains scripts from an older generation
- THEN it leaves those files unchanged and does not announce them as newly installed

#### Scenario: Setup bundle contains no scripts

- WHEN the distributed bundle has no `scripts/` directory
- THEN setup succeeds without treating the missing directory as an asset-resolution failure

## REMOVED Requirements

### Requirement: Setup installs executable Hamilton helper scripts

- Reason: the six helper entry points and their shared shell parser are replaced by the typed `hamilton workbench` command and internal modules.
- Migration: update the Hamilton skills and CLI together between active changes, run `hamilton setup`, and use `hamilton workbench`; remove stale files explicitly with `hamilton purge` when desired.

## RENAMED Requirements

*(none)*
