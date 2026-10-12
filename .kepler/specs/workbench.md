---
artifact: requirements-spec
capability: workbench
status: current
updated: 2026-09-27
author: Hermes Agent
decision: accepted
---

# Capability: workbench

## Overview

The workbench is Hamilton's distributed CLI surface for workflow mechanics formerly provided by installed shell helpers and for explicitly scoped validation of Hamilton artifacts. It gives Assisted skills native operations for workspace isolation, diff packaging, finish gates, change context, prototype branches, and artifact linting without moving workflow judgment into the CLI.

## Contract

### Operations

| operation | purpose |
| ----------- | --------- |
| `hamilton workbench isolate` | Check, create, and verify an isolated linked worktree or non-default-branch workspace. |
| `hamilton workbench diff` | Record task checkpoints and package task, explicit-base, or whole-change ranges. |
| `hamilton workbench precondition` | Evaluate clean-tree, test, task, feedback, review, freshness, and ancestry gates for a change. |
| `hamilton workbench context` | Report artifact inventory, task standings, feedback, review freshness, and unsupported legacy format for one or all changes. |
| `hamilton workbench prototype` | Create, resume, switch to, and verify prototype branches in mapped or standalone mode. |
| `hamilton workbench lint` | Validate one explicitly selected file or a recursively selected change directory. |

### Command arguments

Each operation retains its documented arguments, options, validation rules, and accepted positional arities. Unknown options, missing option values, and extra positional arguments produce one usage error on stderr and exit `2` before dispatch. Invalid argument combinations return `2` without running the operation and preserve its documented diagnostic stream.

### Lint selectors

`hamilton workbench lint` accepts exactly one of `--file <file>` and `--change-dir <dir>`. The file selector names one regular file. The change-directory selector recursively considers regular files contained within the supplied Hamilton change directory and does not inspect outside files.

### Result contract

Workbench operations return `0` for success or an affirmative result, `1` for a negative or failed check that is part of normal operation, and `2` for usage or environment errors, while preserving each operation's documented stdout and stderr behavior. Operations with load-bearing results emit a final machine-readable result line. Lint distinguishes errors, warnings, and skipped files and returns `0` only when no errors or warnings remain.

## Behavior

The workbench preserves the stateful behavior and argument meanings of the former Hamilton-owned helper operations. Isolation and prototype operations validate repository state before changing branches or worktrees. Diff validates task and artifact checkpoints before recording or packaging ranges. Context reports current split artifacts and identifies unsupported legacy layouts. Preconditions run the supplied test command and evaluate committed task, feedback, review, freshness, clean-tree, and ancestry evidence without inferring a waiver. Feedback and review consumers use the same strict pass parser: only fully evidenced feedback and review passes carry `Base`, `Head`, and `Verdict`; structural legacy records are provenance-free, cannot supply a verdict, and remain distinct from the authoritative latest evidenced record. `Base` and `Head` contain full commit identifiers; `Verdict` contains an allowed verdict enum value (`approved` or `changes-requested`). The physically latest parsed pass governs, and malformed latest evidence closes the result.

Lint validates only its explicit scope. A file selector validates the named regular file. A change-directory selector traverses regular files below the directory, remains within that directory, does not follow outside-target symlinks, and reports paths deterministically. Frontmatter is read first and selects the artifact contract; the contract then validates required metadata, identity, lifecycle, task, verdict, revision, route, link fields, headings, sections, and append-only records as applicable. Instruction comments do not satisfy body requirements. The artifact contract has exactly two intentional pending exceptions: a newly initialized pending task log may contain no attempts, and a pending finish history may end with one unmatched final attempt only after all earlier attempts are paired; other states must provide complete records.

A conventional Hamilton artifact filename without valid opening frontmatter produces a warning and a failing result. Malformed YAML, duplicate or missing required metadata, unsupported artifact values, path or identity mismatches, and malformed body structure produce file-specific errors. Feedback and review histories remain single append-only files rather than numbered pass files. They use three modes: `legacy-global` binds global `base`, `head`, and `verdict` provenance only to the physically last legacy pass while earlier bodies remain structural; `transitioned` keeps a structural legacy prefix and a fully evidenced explicit suffix; and `modern` uses fully evidenced pass-local records throughout. Structural legacy records are provenance-free, cannot supply a verdict, and remain distinct from the authoritative latest evidenced record. The first modern append validates the legacy-global history, preserves every existing pass body byte-for-byte, removes exactly the global provenance fields, and appends the next pass-local record atomically. Later appends remain pass-local, the physically latest evidenced pass governs, and malformed transitions or latest evidence fail closed. Unrelated files are reported as skipped and do not fail lint. Invalid selectors or unreadable input paths return a usage or environment error without inspecting the selected scope.

**Examples**

- isolation check on the default branch without a worktree -> exit `1` with final result `isolated: no`
- valid workbench operation -> exit `0` with its load-bearing result line
- unknown option, missing option value, or extra positional argument -> one usage error on stderr, exit `2`, no operation runs
- invalid argument combination -> exit `2`, no operation runs, operation's documented diagnostic stream preserved
- `lint --file <file>` -> only the named regular file is validated
- `lint --change-dir <dir>` -> regular files below the directory are considered, while sibling changes and outside targets are not
- lint without a selector or with both selectors -> exit `2` without inspecting anything
- malformed recognized artifact -> file-specific error and exit `1`
- feedback or review with a requested-change pass followed by an approved pass -> the physical latest approval is reported by lint, context, and precondition
- feedback or review with malformed physical-last evidence -> all three consumers fail closed and do not revive the earlier approval
- conventional artifact filename without frontmatter -> warning and exit `1`
- unrelated file -> skipped report and no failure
- all recognized artifacts valid, with unrelated files skipped -> successful lint and exit `0`

## Invariants

- Every stateful workbench operation MUST validate its precondition before mutation.
- Lint MUST require exactly one explicit scope selector.
- Lint MUST NOT inspect files outside the supplied change directory or follow symlinks to outside targets.
- Frontmatter MUST be authoritative for recognized artifact identity and metadata.
- Malformed or missing required artifact metadata and body structure MUST fail closed.
- Fully evidenced `Base` and `Head` fields and an allowed `Verdict` value MUST be parsed as pass-local feedback or review evidence, while legacy-global provenance applies only to the physically last legacy pass; the physically latest evidenced pass MUST be shared by lint, context, and precondition.
- Feedback and review histories MUST remain append-only in their single owning files; numbered feedback or review files MUST NOT be consulted.
- Structural legacy history MUST NOT supply a verdict, and global-frontmatter `base`, `head`, and `verdict` MUST never seed historical passes or coexist with an explicit suffix.
- Skipped unrelated files MUST NOT affect lint success.
- Workbench operations MUST preserve the `0`/`1`/`2` result semantics and load-bearing result lines of the replaced helpers.
- The workbench MUST NOT make workflow decisions owned by skills.

## Decisions

- A namespaced workbench groups cohesive mechanics while explicit subcommands preserve established invocation semantics.
- Native typed modules are the maintained implementation; shell helpers are not retained as a compatibility surface.
- Frontmatter is the dispatch boundary, while body parsing is limited to the declared structural contract.
- Lint uses explicit file or change-directory scope to prevent accidental repository-wide inspection and reports unrelated files as skipped.
- The contract registry captures durable metadata and body rules without duplicating template instruction text.
- Existing helper files are left untouched during setup and can be removed only through an explicit purge operation.
