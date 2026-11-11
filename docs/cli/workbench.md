# Earlier workbench commands

Use this reference for the earlier change-based workflow. These commands do not create, convert, or resume v3 mission records. Use [Construction](construction.md) for current mission-owned work.

Run workbench commands in the intended repository or change context. They use their own positional paths and `--change-dir`, not the v3 `--project` selector. Some data-path resolution can copy older `.hamilton` data when the canonical destination is absent. It preserves the source and does not convert workflow history.

All seven commands support `-h, --help`. The CLI wraps textual results in the standard JSON envelope, usually under `data.output`. Normal success exits 0. Negative checks, invalid arguments, and operational failures exit 1 through the reporter. Internal legacy exit-2 distinctions are not separate public process exits.

The examples assume an existing compatible earlier change at `$CHANGE`. Do not create that change in the v3 tutorial or copy its records into a mission.

## `workbench context`

```text
kepler workbench context [change-dir] [--all] [--input <path> ...]
```

| Input | Meaning and default |
| --- | --- |
| `[change-dir]` | Optional explicit change context. Without it, resolve the current change context. |
| `--all` | Enumerate changes instead of one context. Default: false. |
| `--input <path>` | Probe a repository-relative input. Repeat for multiple inputs in one context. |

```bash
kepler workbench context --all
kepler workbench context "$CHANGE" --input src/access.ts --input tests/access.test.ts
```

`--all` conflicts with a change argument or explicit inputs. The command reports change, artifact, task, readiness, and input-context information. It does not admit work or repair an invalid artifact. Missing or ambiguous context and unusable artifact/history facts fail or appear as reported blockers. Inspect the returned content rather than assuming every task is ready.

Sources: [command](../../packages/cli/src/cli/nest/context.command.ts), [context operation](../../packages/cli/src/workbench/context.ts).

## `workbench isolate`

```text
kepler workbench isolate <title>
kepler workbench isolate --check [--change-dir <directory>]
kepler workbench isolate --verify <title>
```

| Input | Meaning |
| --- | --- |
| `<title>` | Create a new worktree and branch. Lowercase words separated by single hyphens. |
| `--check` | Inspect current isolation. Does not create a worktree. |
| `--change-dir <directory>` | Optional change location, valid only with `--check`. |
| `--verify <title>` | Verify the expected current worktree identity. |

```bash
kepler workbench isolate --check --change-dir "$CHANGE"
kepler workbench isolate owner-access
kepler workbench isolate --verify owner-access
```

These select distinct modes. Check cannot combine with verify or a title. Verify cannot combine with a positional title or change directory.

Creation writes `.worktrees/<title>`, creates the branch named `<title>`, and ensures the worktree path is ignored. When needed, it appends `.worktrees/` to `<git-common-directory>/info/exclude`. It does not write `.gitignore`. It refuses a nested linked-worktree creation and preserves existing branch/path conflicts. It does not silently reuse or delete them.

Check reports repository root, branch, default branch, isolation mode, and related change facts. A negative isolation result fails. Verify reports the confirmed path or the mismatch.

Sources: [command](../../packages/cli/src/cli/nest/isolate.command.ts), [operation](../../packages/cli/src/workbench/isolate.ts), [Git adapter](../../packages/cli/src/workbench/isolation-git.ts).

## `workbench diff`

```text
kepler workbench diff --record --task <number> [--change-dir <directory>]
kepler workbench diff --task <number> [--change-dir <directory>] [--out <file>]
kepler workbench diff --base <commit> [--change-dir <directory>] [--out <file>]
kepler workbench diff --whole-change --target-branch <reference> [--out <file>]
```

| Option | Meaning |
| --- | --- |
| `--record` | Record or verify a task's original Base checkpoint. |
| `--task <number>` | Select a positive task number. No implicit task. |
| `--change-dir <directory>` | Explicit change; otherwise use the operation's current context. |
| `--base <commit>` | Resolve an explicit comparison base. Not valid with task or whole-change mode. |
| `--whole-change` | Package the complete change against the selected target branch. |
| `--target-branch <reference>` | Required only with `--whole-change`. |
| `--out <file>` | Optional package path. Default: a scratch package file. |

```bash
kepler workbench diff --record --task 1 --change-dir "$CHANGE"
kepler workbench diff --task 1 --change-dir "$CHANGE"
kepler workbench diff --base HEAD~1 --out review-package.md
kepler workbench diff --whole-change --target-branch main
```

Record mode requires a task and forbids base, whole-change, target-branch, and output options. Whole-change mode forbids base, task, and change-directory options. Target-branch is invalid without whole-change. Task is invalid with an explicit base.

Record mode checks historical admission/Base facts, writes a missing checkpoint file when permitted, and ensures it is ignored. It preserves conflicting or unverified checkpoints. Dependency-mode tasks require guarded admission before dispatch.

Package modes read Git and write a diff package with statistics and patches. They return Base, Head, range, changed-file count, and output path in the textual result. A relative output resolves under the repository root. An absolute path can select another location. **This legacy writer can replace an existing output file.** Choose a new owned path. Do not apply the stricter v3 diff-package output guarantees to this command.

Missing context, unusable checkpoints, invalid mode combinations, failed Git comparison, and write failures fail. The package is inspection material, not approval.

Sources: [command](../../packages/cli/src/cli/nest/diff.command.ts), [operation](../../packages/cli/src/workbench/diff.ts). Related: [v3 diff packages](git.md#diff-packages).

## `workbench precondition`

```text
kepler workbench precondition --change-dir <directory> --test-cmd <command>
  --target-branch <reference> [--recover-finish <attempt>] [--whole-change-waived]
```

| Option | Meaning and default |
| --- | --- |
| `--change-dir <directory>` | Required earlier change directory. |
| `--test-cmd <command>` | Required actual verification command. Executed by the operation. |
| `--target-branch <reference>` | Required review target. |
| `--recover-finish <attempt>` | Optional positive finish-attempt number. Select eligible remaining finalization effects for a blocked delivered attempt. |
| `--whole-change-waived` | Default false. Waive applicable whole-change freshness checks, not task checks or all finish requirements. |

```bash
kepler workbench precondition --change-dir "$CHANGE" \
  --test-cmd 'bun run test' --target-branch main
```

The operation checks the tree, selected task/review artifacts, history, freshness, finish state, and target bindings. It runs the supplied test command and checks the tree again. Test execution can create files or other effects defined by that command. Use an appropriate isolated environment.

A valid recovery selector does not grant permission for new delivery effects. Invalid attempt numbers, missing required flags, failed tests, stale review facts, or unsafe finish state fail. The result reports gate outcomes. It does not perform the final push, merge, publication, or deployment.

Sources: [command](../../packages/cli/src/cli/nest/precondition.command.ts), [operation](../../packages/cli/src/workbench/precondition.ts).

## `workbench prototype`

```text
kepler workbench prototype <map-name> <ticket-name>
kepler workbench prototype --standalone <name>
kepler workbench prototype --verify <branch>
```

| Input | Meaning |
| --- | --- |
| `<map-name> <ticket-name>` | Required pair for mapped mode. |
| `--standalone <name>` | Select standalone mode. |
| `--verify <branch>` | Check the current branch without creating or switching it. |

```bash
kepler workbench prototype access-policy parser-check
kepler workbench prototype --standalone parser-check
kepler workbench prototype --verify prototype/parser-check
```

Mapped mode selects `prototype/<map-name>/<ticket-name>`. Standalone mode selects `prototype/<name>`. Creation/resumption can create or switch a branch. It rejects incompatible arguments and invalid branch names. Verify fails if the current branch differs from the expected branch.

Standalone cannot combine with verify or positionals. Verify cannot combine with positionals. Default mapped mode requires both names. It does not create a v3 mission or task.

Sources: [command](../../packages/cli/src/cli/nest/prototype.command.ts), [operation](../../packages/cli/src/workbench/prototype.ts).

## `workbench lint`

```text
kepler workbench lint --file <file>
kepler workbench lint --change-dir <directory>
```

```bash
kepler workbench lint --file "$CHANGE/plan.md"
kepler workbench lint --change-dir "$CHANGE"
```

Choose exactly one scope. There is no default recursive project scan. The operation reads and validates supported earlier artifacts and returns rendered findings. Unrelated files can be reported as skipped. It does not rewrite artifacts. Invalid arguments, artifact findings, or read failures fail through the standard reporter.

This is distinct from [shared metadata lint](utilities.md#kepler-lint) and [Construction graph lint](construction.md#lint).

Sources: [command](../../packages/cli/src/cli/nest/lint.command.ts), [operation](../../packages/cli/src/workbench/lint.ts).

## `workbench task-state`

```text
kepler workbench task-state --admit [--retry] --task <number> --change-dir <directory>
  --expected-head <commit> --worker <identity> --worktree <directory> --target-branch <ref>
kepler workbench task-state --reserve --task <number> --change-dir <directory>
  --expected-head <commit> --reservation <json> [--target-branch <ref>]
kepler workbench task-state --publish --task <number> --change-dir <directory>
  --expected-head <commit> --task-head <commit> [--verify <command>] [--response <outcome>]
```

Choose exactly one of `--admit`, `--reserve`, and `--publish`. Task numbers are positive safe integers. HEAD values must be full commit IDs. The runtime uses `PI_SESSION_ID` as its observed coordinator or worker identity. A missing or mismatched observed actor blocks guarded operations.

| Option | Meaning and dependency |
| --- | --- |
| `--admit` | Bind one eligible task to an isolated worker lane. |
| `--retry` | Admission only. Rebind eligible recovery without resetting the original Base. Default false. |
| `--reserve` | Commit a finite prerequisite scope reservation before editing those paths. |
| `--publish` | Integrate and verify an admitted terminal implementation. This is task-ledger publication, not package publication. |
| `--task <number>` | Required task number for all three modes. |
| `--change-dir <directory>` | Required owning change. |
| `--expected-head <commit>` | Required current caller checkpoint. |
| `--worker <identity>` | Admission only. Explicit bound worker identity. |
| `--worktree <directory>` | Admission only. Existing isolated worker worktree. |
| `--target-branch <ref>` | Required for admission and for a pre-admission owner reservation. Forbidden for publication. |
| `--task-head <commit>` | Publication only. Exact terminal worker checkpoint. |
| `--reservation <json>` | Reservation only. One exact scope-expansion object. |
| `--verify <command>` | Publication only. Required to match the plan's exact Verify command when outcome is `done`. |
| `--response <outcome>` | Publication only. `done`, `blocked`, `interrupted`, or `unavailable`. No supplied response by default. |

### Admit

```bash
kepler workbench task-state --admit --task 1 --change-dir "$CHANGE" \
  --expected-head "$COORDINATOR_HEAD" --worker "$WORKER_ID" \
  --worktree "$WORKER_TREE" --target-branch main
```

Admission checks current authoring/input/dependency proof and repository, coordinator, lane, and checkpoint identity. It updates and commits the root ledger. It does not dispatch the worker. Existing or invalid admission history is not overwritten by a retry.

Admission rejects reservation and publication arguments. Reservation rejects retry, worker, worktree, task-head, verify, and response. Publication rejects retry, worker, worktree, target-branch, and reservation.

### Reserve

```bash
kepler workbench task-state --reserve --task 1 --change-dir "$CHANGE" \
  --expected-head "$CURRENT_HEAD" --reservation "$(cat reservation.json)"
```

A reservation object has exactly `id`, `attempt`, `prerequisite`, `necessity`, `evidence`, `paths`, and `verify`. Text fields are non-empty. `attempt` is the next positive task-attempt number. `paths` contains one through four distinct concrete repository-relative paths. Globs, `.git`, traversal, absolute paths, and control characters fail. The lifetime limit is two reservations per task.

Reservation checks before-edit evidence, original Base, committed task metadata, and caller identity. It writes and commits the task-local reservation. A pre-admission reservation also requires an explicit target and a clean isolated coordinator.

### Publish

```bash
kepler workbench task-state --publish --task 1 --change-dir "$CHANGE" \
  --expected-head "$COORDINATOR_HEAD" --task-head "$TASK_HEAD" \
  --verify 'bun run test' --response done
```

Use the exact command from that task's plan, not this illustrative command unless they match. The bound coordinator must be current and clean. The worker must have a committed valid terminal outcome and unchanged identity/material.

Publication can merge worker history, execute the exact Verify command, update the root ledger, and commit the publication record. A blocked outcome has stricter production-change limits. Done/blocked response text cannot contradict the committed outcome. Feedback clearance remains separate from implementation publication.

Failed verification can leave integrated work in progress. Preserve the merge, worktree, ledger, and original evidence. Do not reset or replay blindly.

Sources: [command](../../packages/cli/src/cli/nest/task-state.command.ts), [operation](../../packages/cli/src/workbench/task-state.ts), [runtime](../../packages/cli/src/workbench/task-state-runtime.ts), and [reservation validator](../../packages/cli/src/workbench/scope-expansions.ts).

## Related documentation

Read [Recovery](../recovery.md#earlier-change-based-work) before resuming interrupted legacy work. Keep the [configuration path-copy boundary](../configuration.md#older-data-paths) separate from migration. For new mission work, follow the [Standard tutorial](../missions/tutorial.md).
