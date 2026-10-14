---
artifact: requirements-change
capability: workbench
change: 2026-09-12-lint-skill-scripts
status: draft
created: 2026-09-12
author: Hermes Agent
decision: accepted
---

# Capability: workbench

The workbench is Hamilton's single CLI surface for workflow mechanics formerly provided by installed shell helpers and for path-scoped validation of Hamilton artifacts.

## ADDED Requirements

### Requirement: Workbench exposes the former helper operations

The system SHALL provide a `hamilton workbench` command with `isolate`, `diff`, `precondition`, `context`, and `prototype` subcommands that replace the six Hamilton-owned helper scripts, with artifact-contract parsing implemented internally rather than exposed as a public command.

- Priority: must
- Rationale: workflow skills need one distributed, typed implementation instead of separately installed shell entry points and a sourced shell parser library.

#### Scenario: Skill checks workspace isolation

- WHEN a skill invokes `hamilton workbench isolate` with the former isolate operation's check, create, or verify arguments
- THEN the command performs the corresponding isolation operation and returns the same observable verdict, path, or branch result as the replaced helper

#### Scenario: Skill packages a task diff

- WHEN a skill invokes `hamilton workbench diff` with the former record, task, explicit-base, or whole-change arguments
- THEN the command records or validates the task checkpoint and emits the corresponding diff package without changing the established checkpoint and ancestry rules

#### Scenario: Finish checks preconditions

- WHEN finish-work invokes `hamilton workbench precondition` with a change directory, test command, and optional explicit whole-change waiver
- THEN the command evaluates the existing finish gates and reports whether the gate is open without inferring a waiver

#### Scenario: A skill requests change context

- WHEN a skill invokes `hamilton workbench context` for one change or for all changes
- THEN the command reports the same artifact, task, feedback, review, and legacy-format context that the replaced context helper would report

#### Scenario: Wayfinder prepares a prototype branch

- WHEN the prototype procedure invokes `hamilton workbench prototype` in mapped or standalone mode, or verifies a branch
- THEN the command creates, resumes, switches to, or verifies the corresponding prototype branch with the existing branch identity rules

### Requirement: Workbench preserves helper result semantics

The workbench operations SHALL preserve the former helper exit-code contract: `0` for success or an affirmative result, `1` for a negative or failed check that is part of normal operation, and `2` for usage or environment errors. An operation with a load-bearing result SHALL retain a final machine-readable result line suitable for skill control flow.

- Priority: must
- Rationale: the skills rely on fail-closed control flow, and replacing the executable surface must not change the meaning of a normal negative check into an invocation failure.

#### Scenario: Isolation reports a negative check

- WHEN `hamilton workbench isolate` checks a checkout on the default branch without a worktree
- THEN it exits `1` and reports `isolated: no` as its final verdict

#### Scenario: Workbench receives invalid arguments

- WHEN any workbench operation receives an unknown option, a missing required value, or an invalid argument combination
- THEN it exits `2` and reports a usage or environment error without performing the operation

#### Scenario: A stateful operation fails

- WHEN a workbench operation cannot create the requested worktree, branch, checkpoint, or diff package
- THEN it exits nonzero, identifies the failed operation, and does not report a successful result

### Requirement: Lint accepts an explicit file or change-directory scope

The system SHALL provide `hamilton workbench lint` with exactly one required scope selector: `--file <file>` or `--change-dir <dir>`. `--file` SHALL validate only the named regular file. `--change-dir` SHALL recursively inspect only regular files contained within the supplied Hamilton change directory and SHALL not inspect files outside that directory.

- Priority: must
- Rationale: mutually exclusive selectors make the validation boundary explicit and uniform with change-oriented workbench commands without introducing an unsupported arbitrary artifact subtree mode.

#### Scenario: Lint a single file

- WHEN the caller supplies `--file <file>` naming a regular file
- THEN lint validates only that file and reports its result

#### Scenario: Lint a change directory

- WHEN the caller supplies `--change-dir <dir>` naming a Hamilton change directory
- THEN lint recursively considers regular files below that directory and does not validate sibling changes or files outside the directory

#### Scenario: Lint receives no scope selector

- WHEN the caller supplies neither `--file` nor `--change-dir`
- THEN lint exits `2` with a usage error and does not default to the current directory

#### Scenario: Lint receives both scope selectors

- WHEN the caller supplies both `--file` and `--change-dir`
- THEN lint exits `2` with a usage error and inspects neither scope

#### Scenario: Lint receives an invalid scope

- WHEN `--file` names a missing or non-regular path, or `--change-dir` names a missing or non-directory path
- THEN lint exits `2` with an error naming the selector and path

#### Scenario: A change directory contains an unrelated symlink

- WHEN a supplied change directory contains a symlink whose target is outside the supplied directory
- THEN lint does not follow the symlink or validate the outside target

### Requirement: Lint recognizes artifacts from frontmatter and filename signals

The system SHALL treat a file as a recognized Hamilton artifact when its YAML frontmatter declares a supported `artifact` value, and SHALL use that frontmatter as the authoritative source for required identity, lifecycle, task, verdict, revision, route, and link metadata defined by that artifact type. A file with a conventional Hamilton artifact filename but no frontmatter SHALL produce a warning and a failing lint result. Files that have neither recognized artifact frontmatter nor a conventional Hamilton artifact filename SHALL be reported as skipped and SHALL not fail lint.

- Priority: must
- Rationale: frontmatter is already the artifact interface; filename detection catches likely artifacts that were created from memory or an older shape without turning arbitrary repository files into errors.

#### Scenario: A finalized proposal has valid frontmatter

- WHEN lint reads a proposal with `artifact: proposal` and all required proposal metadata fields
- THEN it validates the file as a proposal and does not infer identity from body metadata tables

#### Scenario: A plan filename lacks frontmatter

- WHEN lint reads `plan.md` without a valid opening frontmatter block
- THEN it emits a warning for that file and exits with a failing result

#### Scenario: An unrelated Markdown file is encountered

- WHEN lint reads a Markdown file with no recognized artifact frontmatter and no conventional Hamilton artifact filename
- THEN it reports the file as skipped and does not count it as a lint failure

#### Scenario: Recognized frontmatter is malformed

- WHEN a file begins an artifact frontmatter block that is invalid YAML, has duplicate or missing required fields, or declares an unsupported value
- THEN lint reports a file-specific error and fails closed without treating the file as skipped

### Requirement: Lint validates artifact bodies against their declared shape

The system SHALL validate a recognized artifact's body against the shape associated with its frontmatter `artifact` value, including required Markdown headings, required sections, and append-only record structure. Body validation SHALL ignore template instruction comments when determining whether the finalized artifact contains required content, but SHALL not allow comments to satisfy required headings or record entries.

- Priority: must
- Rationale: frontmatter identifies the contract, while body parsing proves that the document is structurally usable and catches malformed headings and record structure that metadata alone cannot express.

#### Scenario: A required heading is missing

- WHEN a recognized artifact omits a required heading or section from its declared body shape
- THEN lint reports the missing heading or section and fails

#### Scenario: An instructional comment mentions a required heading

- WHEN a template comment names a required heading  but the finalized body omits it
- THEN lint does not count the comment as evidence and reports the missing body structure

### Requirement: Lint diagnostics and result are deterministic

The system SHALL report each lint finding with the affected path and a useful line or structural location, distinguish errors, warnings, and skipped files, and return `0` only when no errors or warnings remain. Any recognized artifact with malformed or missing required metadata or body structure SHALL produce a nonzero result; skipped files SHALL not affect the result.

- Priority: must
- Rationale: skills and CI need a deterministic fail-closed signal, while users need enough location information to repair an artifact without reading an opaque aggregate error.

#### Scenario: Lint finds multiple invalid artifacts

- WHEN a directory contains more than one malformed recognized artifact
- THEN lint reports all discovered findings in deterministic path order before returning a failing result

#### Scenario: Lint finds only unrelated files

- WHEN every file under the supplied path is unrelated and therefore skipped
- THEN lint reports the skipped files and exits `0`

#### Scenario: Lint succeeds

- WHEN every recognized artifact under the supplied path satisfies frontmatter and body contracts and unrelated files are skipped
- THEN lint exits `0` and reports a successful result

## MODIFIED Requirements

*(none)*

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
