---
artifact: design
change: 2026-09-12-lint-skill-scripts
status: draft
created: 2026-09-12
author: Hermes Agent
decision: accepted
route_unit: null
---

# Design: Replace Hamilton Helper Scripts with the Workbench CLI

## Context

Hamilton's CLI currently composes only `setup`, while the Assisted skills depend on six shell files installed under `~/.hamilton/scripts/`. Five are operational entry points for isolation, diff packaging, precondition gates, change context, and prototype branching; the sixth is a sourced shell library containing artifact parsers. The helpers use Bash, `awk`, `grep`, and Git directly, so their behavior is separate from the typed Bun distribution and their parsing rules are repeated across several scripts.

Hamilton's artifact templates already put identity, lifecycle, task, verdict, revision, and route metadata in YAML frontmatter. The new workbench can use that metadata to dispatch validation and inspect workflow state, while Markdown body parsing remains necessary for headings, sections, and append-only records. The change must preserve the helpers' stateful behavior and exit-code contract while moving the implementation into native TypeScript and making setup stop installing new script files.

The migration is deliberately between changes. Updated skills and the CLI ship together; a later `hamilton setup` does not touch a user's existing `~/.hamilton/scripts/` directory, but no updated skill calls those files. The workbench must function without that directory.

## Goals / Non-Goals

**Goals**

- Replace the six Hamilton-owned shell helpers with a native, modular `hamilton workbench` command.
- Preserve each helper's stateful behavior, argument semantics, negative-check behavior, machine-readable result line, and exit-code meanings.
- Add explicit `hamilton workbench lint` validation with mutually exclusive `--file <file>` and `--change-dir <dir>` selectors.
- Make artifact frontmatter the first and authoritative validation surface, with body parsing limited to the declared structural contract.
- Produce deterministic diagnostics for malformed recognized artifacts and warnings for conventional artifact filenames without frontmatter.
- Keep unrelated files visible as skipped without making them failures.
- Remove script installation from setup without deleting stale installed files.

**Non-Goals**

- No replacement for external `folio`, `glab`, `jq`, Obsidian, or Skill Builder tools.
- No workbench command that orchestrates the whole Assisted pipeline or makes decisions currently owned by skills.
- No checkbox-list validation; that logic is explicitly outside this change.
- No project-local template mirror, database, daemon, new dependency, or compatibility wrapper around the old scripts.
- No change to artifact ownership, task/review lifecycle, map and ticket statuses, review gate policy, or the semantic behavior of the existing helper operations.

## Decisions

### Decision: Use a namespaced workbench command

- Choice: add `hamilton workbench` with explicit `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint` subcommands. Preserve the existing helper flags and positional meanings beneath the namespace. Keep artifact-contract parsing internal rather than exposing a `contracts` subcommand.
- Alternatives considered: a single monolithic `hamilton workbench` mode with implicit operation selection would make invocation ambiguous; separate top-level commands would consume the CLI namespace and scatter related mechanics; retaining the shell helpers behind a façade would not remove the duplicate implementation.
- Rationale: a namespace groups one cohesive operational surface, explicit subcommands make stateful effects visible, and existing argument semantics minimize changes to skill control flow.

### Decision: Implement the workbench natively in TypeScript

- Choice: rewrite the helper behavior as typed modules using the existing Effect, Bun, Node filesystem, Git, and YAML dependencies. Expose command handlers from `src/cli/commands/workbench.ts` and keep operation logic outside CLI parsing.
- Alternatives considered: spawn the old scripts from the CLI, embed shell text as distribution resources, or add a compatibility wrapper that translates workbench arguments to scripts.
- Rationale: native modules make the standalone binary self-sufficient, allow shared typed artifact handling, and provide direct test seams without preserving a second runtime implementation.

### Decision: Make frontmatter the artifact dispatch boundary

- Choice: parse the first YAML frontmatter block before inspecting artifact body content. The `artifact` field selects a registered contract. The contract validates required fields, allowed values, path-derived identity, and body structure. Body validators ignore HTML instruction comments and validate required headings, sections, and append-only record grammar; no checkbox-list validation is included.
- Alternatives considered: infer artifact type from filenames alone, parse body headings before metadata, or derive every rule dynamically from template text.
- Rationale: frontmatter is the machine-readable artifact interface and avoids ambiguous filename inference. Static typed contracts are needed for enum, cross-field, path, and append-only rules that template text cannot safely express. Templates remain the creation source and are not duplicated as body metadata.

### Decision: Define lint scope explicitly and fail closed

- Choice: require exactly one of `--file <file>` and `--change-dir <dir>` for `workbench lint`. `--file` validates only the named regular file. `--change-dir` recursively considers regular files below the supplied Hamilton change directory, does not follow symlinks outside that boundary, and sorts paths before reporting. Recognized `artifact` frontmatter is strict; conventional Hamilton artifact paths without frontmatter produce warnings and exit `1`; unrelated files are reported as skipped and do not fail lint.
- Alternatives considered: accept a generic positional path or `--path` selector, default to the current directory, scan the whole repository, follow all symlinks, or treat every file as an artifact.
- Rationale: named selectors make the file and change-directory modes explicit and uniform with the rest of the workbench without introducing an unsupported arbitrary-subtree mode. An explicit change boundary prevents accidental scans, regular-file traversal preserves the caller's scope, and filename warnings catch likely malformed artifacts without rejecting ordinary project content.

### Decision: Preserve the helper result contract

- Choice: return `0` for success or affirmative state, `1` for a normal negative or failed check, and `2` for usage or environment errors. Preserve each operation's final load-bearing result line, including isolation, gate, branch, range, and output-path results. Lint returns `0` only when no errors or warnings remain and uses `1` for findings.
- Alternatives considered: adopt one universal JSON response, use only exception-style nonzero failures, or change negative checks to throw command errors.
- Rationale: skills already branch on negative checks and read final result lines. Preserving the contract allows the implementation to change without weakening fail-closed workflow decisions; structured internal values can still drive rendering.

### Decision: Stop installation without destructive cleanup

- Choice: remove the bundle script copy/report path and stop creating new helper script files during setup. Existing `~/.hamilton/scripts/` content is not deleted or rewritten. Updated skills call the workbench and `hamilton purge` remains the explicit cleanup path.
- Alternatives considered: delete stale scripts during setup, leave the old scripts as supported compatibility wrappers, or continue installing both generations.
- Rationale: setup is non-destructive, while one maintained implementation prevents drift. The between-changes migration and synchronized skill update make stale files harmless to new sessions.

## Architecture & Components

| Unit | Responsibility | Interface | Dependencies and test seam |
|---|---|---|---|
| `src/cli/commands/workbench.ts` | Compose the workbench command and its explicit subcommands; translate parsed options into operation effects | `Command` exports for `workbench` and each subcommand | `@effect/cli`; handlers receive operation dependencies through constructors or factories for command-level tests |
| `src/workbench/artifact-reader.ts` | Read one file, split and parse its opening YAML frontmatter, classify recognized versus unrelated files, and return typed metadata or diagnostics | `readArtifact(path)` and a discriminated result for recognized, skipped, or invalid input | Existing `yaml`; injected file-reading function for parser tests |
| `src/workbench/artifact-contracts.ts` | Register artifact contracts and validate required metadata, allowed values, path identity, headings, sections, and append-only records | Registry keyed by the parsed `artifact` value; contract validators return structured diagnostics | Pure functions over parsed metadata and body; fixture strings cover each contract without filesystem or Git |
| `src/workbench/lint.ts` | Enforce the explicit file/change-directory boundary, traverse regular files for a change directory, run the reader and contract registry, sort diagnostics, and render the lint result | `lintScope({ file, changeDir })` plus a renderer with error, warning, and skipped findings | Injected filesystem traversal and output sink; no Git or process dependency |
| `src/workbench/isolate.ts` | Check, create, and verify linked worktree or non-default-branch isolation | Existing isolate flags and positional title under `workbench isolate` | Narrow Git and filesystem operations; real temporary repositories plus injected command failure cases |
| `src/workbench/diff.ts` | Record stable task checkpoints and package task, explicit-base, or whole-change ranges | Existing diff flags under `workbench diff` | Narrow Git, filesystem, and scratch-output seams; temporary repositories and committed artifacts |
| `src/workbench/context.ts` | Discover or accept a change path and report artifact inventory, task standings, review freshness, and unsupported legacy format | Existing context path and `--all` behavior under `workbench context` | Artifact reader/contract inspection plus Git metadata; fixture changes and temporary repositories |
| `src/workbench/precondition.ts` | Evaluate clean-tree, test, task, review, and review-freshness gates without inferring a waiver | Existing precondition arguments under `workbench precondition` | Narrow Git, command-runner, and artifact-inspection ports; real fixtures for gate outcomes |
| `src/workbench/prototype.ts` | Create, resume, switch to, and verify prototype branches | Existing prototype branch arguments under `workbench prototype` | Narrow Git branch operations; temporary repositories |
| `src/workbench/runtime.ts` | Adapt concrete Bun/Node filesystem, process, and Git execution to the operation seams | Internal runtime adapters only; not a public CLI surface | Concrete production IO isolated from pure artifact validation and operation policy |
| `src/cli/commands/setup.ts` and `src/paths.ts` | Stop copying/reporting scripts while preserving templates, guidelines, settings, and existing-home behavior | Existing `setup` effect and command output, minus script installation | Existing setup tests with temporary HOME and bundle overrides |

The command module owns parsing and composition only. Each operation owns one mechanical concern, and the artifact reader and contract registry are shared only where the concern is genuinely common. No operation depends on another operation's internals. Precondition and context consume artifact inspection results but do not duplicate YAML parsing; Git-dependent operations receive role-sized ports rather than a single mutable god object.

### Quality Lens

- **Responsibility:** command composition, artifact reading, contract validation, path traversal, and each stateful operation have separate reasons to change. The shared runtime adapter contains concrete IO only; it does not decide workflow policy.
- **Boundaries and dependencies:** lint's policy depends on a file traversal seam and pure contract results; precondition depends on narrow Git, command, and artifact-inspection seams; isolation, prototype, diff, and context each expose only the Git/filesystem operations they require.
- **Dependency inversion:** filesystem, process, and Git adapters are injected at operation boundaries, so malformed artifacts and state transitions can be tested without real external effects while integration fixtures still exercise real repositories.
- **Open extension:** artifact dispatch uses a contract registry keyed by `artifact` rather than a growing central operation switch. Adding a recognized artifact adds one contract registration and its fixtures.
- **Right-sizing:** no generic plugin system, persisted lint configuration, JSON schema dependency, daemon, or compatibility layer is added. The workbench uses the existing YAML dependency and a small typed contract model.
- **Accepted trade-off:** native operation modules necessarily encode the current helper semantics separately from their old shell text during the migration. Deleting `bundle/scripts/` and porting every existing fixture in the same change prevents that temporary duplication from becoming a supported second source.

## Data & Flow

### Lint flow

1. The CLI requires exactly one of `--file <file>` and `--change-dir <dir>` and resolves the selected scope without changing its boundary.
2. `--file` makes the named regular file the sole candidate. `--change-dir` traverses the supplied change directory recursively, considering only regular files whose resolved locations remain inside that directory; symlinks are not followed outside the boundary.
3. Candidates are sorted by normalized path. The artifact reader checks for an opening frontmatter block and parses it with unique-key and YAML-error detection.
4. A supported `artifact` value selects a contract. Required metadata and path identity are validated from the parsed frontmatter before the body is inspected.
5. The contract strips instruction comments from the body view and checks the declared artifact's required headings, sections, and append-only record grammar. Comments cannot satisfy a body requirement.
6. A conventional Hamilton artifact path without frontmatter produces a warning. A file with unrelated content is recorded as skipped. Findings are rendered in deterministic order.
7. The command returns `0` only when no errors or warnings exist, otherwise `1`; invalid arguments or an unreadable input path return `2`.

### Operational flow

The workbench subcommands retain the existing sequencing of their helper counterparts. `isolate` and `prototype` validate repository state before branch or worktree mutation. `diff` validates the task and artifact checkpoint before recording or packaging a range. `context` reads frontmatter first for current split artifacts and uses body parsing only to classify required headings/records or identify unsupported legacy layout. `precondition` runs the project-supplied test command and checks committed artifacts, task evidence, review verdicts, and ancestry through the same typed artifact inspection, failing closed when any required fact is absent or malformed.

## Error Handling & Edge Cases

| Failure or edge case | Behavior |
|---|---|
| Workbench subcommand is omitted or unknown | Print usage and exit `2`; perform no operation. |
| Lint scope is omitted, both selectors are supplied, or the selected path is invalid | Name the missing or conflicting selector or path, exit `2`, and inspect nothing. |
| Directory contains unrelated files | Report each as skipped; skipped files do not affect the exit status. |
| File has conventional artifact name but no valid frontmatter | Emit a warning with path and location; exit `1`. |
| Frontmatter YAML is malformed, duplicated, missing `artifact`, or has unsupported values | Emit a file-specific error; do not fall back to body or filename inference; exit `1`. |
| Recognized artifact metadata conflicts with its path or required identity | Emit a structural error and fail closed. |
| Recognized artifact body lacks a required heading, section, or valid append-only record | Emit a body-location diagnostic and exit `1`; instruction comments do not satisfy it. |
| Directory contains an outside-target symlink | Do not follow or inspect the target. |
| Lint encounters multiple invalid files | Report all findings in sorted path order before returning `1`. |
| Isolation check is on the default branch without a worktree | Preserve the negative result and exit `1` with the isolation verdict. |
| A stateful Git operation cannot prove its precondition | Exit nonzero before mutation and do not print a successful result. |
| Existing stale helper files are present during setup | Leave them unchanged and omit them from setup's installed-asset report. |
| A workbench operation receives an invalid flag combination | Exit `2` before stateful work begins. |

## Testing Strategy

Port the existing temporary-repository behavior tests from `tests/scripts/` to operation-focused `tests/workbench/` suites rather than testing shell execution. Preserve coverage for every old helper scenario: default-branch and linked-worktree isolation, branch creation and verification, prototype resume, checkpoint creation and stability, diff ranges and output files, context inventory and legacy labeling, all precondition gates and freshness states, and invalid arguments. Each operation's pure policy is tested through injected seams, and at least one integration suite invokes the compiled command path with real temporary repositories.

Add artifact-reader and lint fixtures covering every recognized template artifact, valid and malformed YAML, duplicate or missing required frontmatter, unsupported artifact values, path/identity mismatch, missing and malformed headings, append-only pass numbering, comments that must not satisfy body requirements, conventional filenames without frontmatter, unrelated files, `--file` scope, recursive `--change-dir` scope, mutually exclusive selector errors, deterministic diagnostics, outside symlinks, and input errors. Do not add checkbox validation tests because that behavior is outside this change.

Update setup tests to assert that fresh setup installs templates and guidelines without copying or reporting bundle scripts and that an existing script directory remains byte-for-byte unchanged. Update skill-contract tests to assert that no maintained Hamilton skill invokes `~/.hamilton/scripts/` and that each former call site uses the matching workbench subcommand. Update documentation checks or inspection fixtures for the new setup and migration text.

Run the project's required gates: `bun --bun vitest run` and `bun run build`. The implementation then passes `hamilton-code` task-scoped feedback, `hamilton-review` whole-branch review, and `hamilton-finish-work` preconditions using the workbench itself.

## Constraints & Boundaries

- Always: preserve the six helper operations' argument meanings, side effects, output result lines, and `0`/`1`/`2` exit semantics; parse frontmatter before body content; report all lint findings deterministically; update every skill and documentation call site in the same change; run the full test and build gates.
- Always: keep `hamilton workbench lint` explicitly scoped by exactly one `--file` or `--change-dir` selector, skip unrelated files, warn and fail for conventional artifact filenames without frontmatter, and fail closed for malformed recognized artifacts.
- Ask first: any change to task/review gate semantics, artifact status or identity vocabulary, external CLI replacement, deletion of existing user files, or a compatibility mode for old scripts.
- Never: retain shell scripts as the maintained implementation, install a second copy of them, accept an unscoped lint invocation or an arbitrary artifact subtree selector, follow lint symlinks outside the supplied change directory, infer required metadata from body text when frontmatter is absent, add checkbox validation, or move workflow judgment into the CLI.

## Risks / Trade-offs

- [Native ports can drift from shell behavior] -> Port the existing fixture matrix before deleting `bundle/scripts/`, preserve output and exit contracts, and run real temporary-repository integration tests.
- [A typed contract registry may duplicate parts of templates] -> Use frontmatter for runtime artifact dispatch and metadata, keep template files as the creation source, and limit code contracts to allowed values, cross-field/path rules, and body grammar that templates cannot enforce.
- [Stale installed skills or scripts may remain on user machines] -> Document the between-changes migration, update all bundled call sites atomically, stop installing but do not delete existing files, and keep `hamilton purge` as explicit cleanup.
- [Git mutations are difficult to test safely] -> isolate Git operations behind narrow ports, test policy with injected failures, and exercise mutations only in disposable temporary repositories.
- [Recursive lint may inspect more files than a caller expects] -> require an explicit `--change-dir` selector for recursive mode, never default to the current directory, use regular-file traversal with normalized containment checks, and report the exact candidate paths.
- [Historical artifacts may use old shapes] -> keep context's existing `legacy-unsupported` classification, make lint warnings/errors explicit, and do not silently reinterpret legacy content as current state.

## Migration / Rollout

This is a breaking Assisted-mode support migration between changes. Finish active changes with the Hamilton generation that created them. Then update the CLI and agent-loaded skills from the same generation, run `hamilton setup`, and verify `hamilton workbench --help`. Setup installs the supported templates and guidelines, stops copying and reporting helper scripts, and leaves any existing `~/.hamilton/scripts/` directory untouched. New skill sessions use `hamilton workbench`; stale helper files can be removed explicitly with `hamilton purge`.

No project artifact migration or data migration is required. Existing change, specification, map, and ticket files retain their current paths and frontmatter. Rollback restores the prior CLI and skill generation between changes; it does not require setup to delete files from the user's Hamilton home.

## Open Questions

*(none)*
