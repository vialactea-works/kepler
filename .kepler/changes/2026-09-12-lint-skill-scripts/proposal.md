---
artifact: proposal
change: 2026-09-12-lint-skill-scripts
status: draft
decision: accepted
author: Hermes Agent
created: 2026-09-12
route_unit: null
---

# Proposal: Replace Hamilton Helper Scripts with the Workbench CLI

## Why

Hamilton's Assisted skills currently depend on six installed shell scripts for workspace isolation, prototype branching, diff packaging, change context, finish preconditions, and shared artifact parsing. Those scripts duplicate parsing logic, expose behavior outside the typed Bun CLI, and force every installation to maintain a separate executable support layer. The artifact templates already carry machine-readable frontmatter, but the current helpers use a mixture of shell parsing and body conventions, making malformed artifacts harder to diagnose consistently.

## Goals & Success Criteria

- Provide a `hamilton workbench` command that replaces the six Hamilton-owned helper scripts while preserving their stateful behavior and established exit-code semantics.
- Expose explicit workbench operations for isolation, diff packaging, preconditions, change context, and prototype branching, with the shared artifact-contract logic implemented internally rather than as a public command.
- Add `hamilton workbench lint` as a required explicit validation operation with exactly one of `--change-dir <dir>` or `--file <file>`. `--change-dir` recursively validates the supplied change directory; `--file` validates only the supplied file.
- Use artifact frontmatter as the authoritative source for recognized artifact identity, lifecycle, task, verdict, revision, and link metadata whenever the relevant field exists.
- Validate artifact bodies for their required headings, structural sections, and append-only record shape.
- Fail closed for malformed or missing required frontmatter and return a nonzero status for recognized artifact filenames that lack frontmatter, while reporting unrelated files as skipped.
- Stop installing the six shell scripts from `hamilton setup`; setup stops copying and reporting them but does not delete an existing `~/.hamilton/scripts/` directory.
- Update every bundled skill and user-facing document that calls or describes the helper scripts so new sessions use the workbench CLI as the single supported implementation.
- Preserve output sufficient for skill control flow, including the existing `0` success, `1` negative or failed-check, and `2` usage or environment-error contract and a final machine-readable result line where an operation has one.

## Non-Goals

- Do not replace external tools used by other skills, including `folio`, `glab`, `jq`, Obsidian, or Skill Builder's Python tooling.
- Do not run the entire Assisted pipeline from `hamilton workbench`; the workbench provides mechanics consumed by skills, while skills and orchestration retain judgment and sequencing.
- Do not silently remove existing files from `~/.hamilton/scripts/`; stopping installation and reporting is the migration behavior.
- Do not infer user decisions, weaken blocker or review gates, or move judgment from skills into the workbench.
- Do not introduce a compatibility mode that leaves the shell scripts as the supported implementation or maintain duplicate parsing rules.
- Do not change the established artifact ownership, task/review lifecycle, map/ticket status vocabularies, or the meanings of the existing helper operations.
- Do not validate files outside the explicit `--change-dir` or `--file` scope supplied to `workbench lint`.

## Proposed Change

Add a typed `workbench` command to the Hamilton CLI with subcommands corresponding to the current helper operations: `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint`. The operational subcommands retain the existing helper argument semantics under the new namespace and preserve the established success, negative-check, and usage/environment exit statuses. They reuse one internal artifact reader and validator rather than sourcing a shell library or duplicating frontmatter and body parsing.

Make `lint` explicitly scoped and frontmatter-first. It requires exactly one of `--file <file>` and `--change-dir <dir>`; `--file` validates only the named file, while `--change-dir` recursively visits regular files below the supplied Hamilton change directory. Files whose frontmatter declares a recognized Hamilton `artifact` are validated against the corresponding artifact contract, including required frontmatter fields, enumerated values, path-derived identity, headings, sections, and append-only records. A filename that conventionally denotes a Hamilton artifact but has no frontmatter produces a warning and a failing result. Files that are not recognized artifacts are reported as skipped and do not affect success. Malformed recognized artifacts and warnings fail closed with diagnostics naming the file and location.

Remove the bundle script installation path from setup while retaining the existing user directory non-destructive behavior. Update the affected skills to call `hamilton workbench` directly, update setup and migration documentation, and replace shell-script tests with CLI and lint contract coverage. The new command becomes the only maintained implementation of the former helper behavior.

## Capabilities

### New

- `workbench`: unified CLI operations for Hamilton's stateful workflow mechanics and explicitly scoped, artifact-aware validation.

### Modified

- `cli-distribution`: `hamilton setup` no longer installs or reports Hamilton helper scripts, while the CLI distributes the workbench command.
- `framework-docs`: the skills reference, setup guidance, migration instructions, and helper-script documentation describe the workbench command and its subcommands instead of installed shell entry points.

### Removed

*(none)*

## Impact

The implementation affects the CLI composition and command modules under `src/cli/`, path and setup behavior in `src/paths.ts` and `src/cli/commands/setup.ts`, the bundled `bundle/scripts/` source and its installation tests, and the existing script behavior tests that must move to CLI-level fixtures. It updates all bundled Hamilton skills that invoke helper scripts, the setup and migration documentation in `README.md`, `docs/modes.md`, `docs/skills.md`, and `docs/sdd-framework.md`, and any contributor mapping that names the old support surface. The artifact templates remain the source of frontmatter shapes; the workbench consumes them and adds no project-local template mirror.

The change is a breaking Assisted-mode support migration between changes. A user with an active change continues using the installed generation that created it. After finishing that change, the user refreshes the CLI and skills together and runs `hamilton setup`; setup installs the workbench-containing CLI generation and does not remove stale script files. Updated skills no longer invoke those stale files.

Verification must cover each former script's observable behavior, all workbench subcommand exit statuses and argument errors, the mutually exclusive `--file` and `--change-dir` lint selectors, recursive regular-file selection under a change directory, skipped unrelated files, missing and malformed frontmatter warnings, body header and record validation, frontmatter-driven identity and lifecycle checks, setup's absence of new script installation, and updated skill/document references.

## Open Questions

*(none)*
