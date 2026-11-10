# Git material commands

Use this reference to read the effective Git author or create an inspection package for a recorded workflow scope. These commands do not grant review approval. See [Construction](construction.md) for lifecycle operations.

All commands accept optional `--project <path>` and `-h, --help`. Project selection defaults to the invocation directory. Select a Git working-tree root with an existing local `.kepler/` directory.

## `git author`

```text
kepler git author [--project <path>]
```

```bash
kepler git author --project "$PROJECT"
```

Returns `data.name` and `data.email` from the selected repository's effective Git configuration. It does not write identity or sign a commit. A missing or invalid author identity fails with exit 1. Success exits 0.

Use the returned identity in authored metadata when applicable. Do not assume that a name is a worker-context identifier or requester approval.

## Diff packages

A diff package is derived Markdown for inspection. It retains original source events, material bindings, repository-qualified comparisons, commit parents, changed paths, statistics, and patches. Attribution remains uncertain where source records do not establish an exclusive owner.

Every package requires exact recorded scope. There is no implicit current attempt or arbitrary base option in this command family.

### `git diff-package validation`

```text
kepler git diff-package validation --unit <unit-id> --task <task-id>
  --implementation-attempt <attempt-id> --generation-attempt <activity-attempt-id>
  [--out <path>] [--project <path>]
```

```bash
kepler git diff-package validation --unit "$UNIT" --task "$TASK" \
  --implementation-attempt "$IMPL" --generation-attempt "$GENERATION_ATTEMPT" --project "$PROJECT"
```

Uses the recorded task admission and Code Generation completion. It packages the admission-to-output comparison for independent Validation. The generation attempt must belong to the selected task and parent.

### `git diff-package integration`

```text
kepler git diff-package integration --unit <unit-id> --task <task-id>
  --implementation-attempt <attempt-id> --integration-attempt <activity-attempt-id>
  [--out <path>] [--project <path>]
```

```bash
kepler git diff-package integration --unit "$UNIT" --task "$TASK" \
  --implementation-attempt "$IMPL" --integration-attempt "$INTEGRATION_ATTEMPT" --project "$PROJECT"
```

Uses recorded captured inputs and prepared candidate checkpoints. It preserves task-output and Integration-effect comparisons as distinct sources. The package is inspection input for the exact Integration occurrence. It does not establish acceptance.

### `git diff-package unit-review`

```text
kepler git diff-package unit-review --unit <unit-id> --implementation-attempt <attempt-id>
  [--out <path>] [--project <path>]
```

```bash
kepler git diff-package unit-review --unit "$UNIT" --implementation-attempt "$IMPL" \
  --out review-package.md --project "$PROJECT"
```

Uses the unit's original Review baseline and recorded Implementation completion. It preserves cumulative scope and supporting task/Integration provenance. It accepts no task, generation-attempt, or integration-attempt selector.

### Options and output

| Option | Requirement and constraint |
| --- | --- |
| `--unit <unit-id>` | Required exact unit for all three packages. |
| `--task <task-id>` | Required task UUIDv4 for Validation and Integration only. |
| `--implementation-attempt <attempt-id>` | Required parent UUIDv4. |
| `--generation-attempt <attempt-id>` | Required only for Validation. |
| `--integration-attempt <attempt-id>` | Required only for Integration. |
| `--out <path>` | Optional new output file. See path rules below. |
| `--project <path>` | Optional selected record home. |

Without `--out`, Kepler creates a new temporary package directory and reports its `package.md` path. Retain or remove only your own derived output when you no longer need it.

With `--out`, select a new untracked file inside the record home. Its parent directory must already exist and remain inside that project. The path must be outside Git metadata and the entire `.kepler/missions/` tree. Existing files, tracked content, symlink escapes, and unsafe parents are rejected. The command does not overwrite a prior package.

Success returns `scope`, unit/mission/attempt identities, applicable task/Activity identities, `source_bindings`, `source_event_ids`, `output`, `fingerprint`, and `empty`. The fingerprint binds the preceding complete package content. An empty diff is a valid package result.

The operation reads Git and history, then writes only derived inspection output. It creates no workflow attempt, evidence, approval, rerun, or transition. A package does not prove that tests passed or that the material remains applicable to a later scope.

### Failures

Normal success exits 0. Invalid selectors, unavailable or mismatched source records, missing Git objects, incomplete comparisons, or unsafe output paths fail with exit 1 and a structured error. Preserve any reported partial output or cleanup failure. Do not replace missing source history with a guessed current diff.

## Related commands and sources

Use [audit queries](audit.md#query-history) to inspect source facts. Use [stage assessments](stage-assessments.md) to understand completion bindings. The [tutorial](../missions/tutorial.md) keeps inspection separate from check execution and approval.

Implementation: [option parser](../../packages/cli/src/cli/diff-package-options.ts), [source resolver](../../packages/cli/src/construction/diff-package-source.ts), [package service](../../packages/cli/src/workbench/diff-package.ts), [Git adapter](../../packages/cli/src/workbench/git-diff-package.ts), and [commands](../../packages/cli/src/cli/nest/diff-package.commands.ts).
