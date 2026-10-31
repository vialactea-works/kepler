# CLI guide

The `kepler` CLI installs as a standalone executable with a sidecar bundle. Run `kepler --help` or any command's `--help` for the options supported by your installed release. The CLI returns structured JSON for operations and uses a nonzero exit status when an operation fails.

## Command map

| Command | Use |
| --- | --- |
| `kepler setup` | Install a compatible bundle generation, templates, guidelines, and missing default settings. |
| `kepler mission create` | Create a mission and prepare only its selected workspaces. |
| `kepler workflow construction unit` | Create, list, or inspect a Unit of Work. |
| `kepler workflow construction stage` | Inspect, start, pause, resume, or complete a Construction stage attempt. |
| `kepler workflow construction task` | List and inspect authored tasks, read readiness, and admit an eligible task. |
| `kepler workflow construction activity` | Inspect, start, pause, resume, or complete a task-scoped Activity attempt. |
| `kepler workflow construction integration` | Lock a unit, prepare a candidate, record per-repository checks, accept the checked candidate, or release eligible incomplete work. |
| `kepler workflow construction revise` | Record an authorized scoped revision. |
| `kepler workflow construction lint` | Validate a unit's authored task graph. |
| `kepler git author` | Read the selected repository's effective Git author identity. |
| `kepler git diff-package` | Create a source-bound inspection package for Validation, Integration, or Unit Review. |
| `kepler audit record`, `list`, `show` | Record typed evidence, approvals, and interactions; query workflow history. |
| `kepler lint <paths...>` | Validate shared metadata in explicitly named Markdown files. |
| `kepler uuid` | Generate one UUIDv4. |

The root also exposes `kepler workbench` for the earlier change-based workflow. Its commands do not convert or resume v3 mission records. See [Limits](#version-boundaries).

## Select a project and scope

Project-scoped commands use the working directory unless you pass `--project <path>`. Select the Git working-tree root, not a nested directory. The project must contain `.kepler/`; Kepler does not initialize or migrate it during project selection. A unit operation uses the exact Unit of Work ID. A task operation also uses its exact task ID and enclosing Implementation attempt when required. Read the command's `--help` for required selectors.

Create a mission with a typed request, then create or inspect a unit:

```bash
kepler mission create --project <record-home> --request '<mission-request-json>'
kepler workflow construction unit create --help
kepler workflow construction unit list --project <record-home>
kepler workflow construction unit show --unit <unit-id> --project <record-home>
```

Mission request fields and accepted resource effects depend on the installed CLI contract. Use `kepler mission create --help` and the [mission contract](specs/v3/mission.md) before creating a mission. Mission creation does not start a stage; unit creation records the Standard workflow binding.

## Construction execution

The Standard workflow contains Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver. Each stage enforces its own inputs, authority, evidence, and completion conditions. A successful command reports that operation's result; it does not imply that the whole unit is complete.

Implementation runs three task-scoped Activities in order: Code Generation, independent non-author Code Validation, and checked Code Integration. The CLI records attempts, evidence, and transitions. The host's orchestrator dispatches workers. Integration checks the prepared combined candidate while holding the unit lock; accept only the candidate that passed the required checks.

Use the stage, task, activity, and integration help for exact request schemas:

```bash
kepler workflow construction stage --help
kepler workflow construction task --help
kepler workflow construction activity --help
kepler workflow construction integration --help
```

The CLI does not infer approval, select an implicit active scope, dispatch agents, or treat a commit as proof that checks passed. Record evidence through `kepler audit record evidence` with the operation's typed request.

## Audit and diff packages

Use `kepler audit record --help`, `kepler audit list --help`, and `kepler audit show --help` for typed audit requests and history selectors. Audit records are authoritative history, not a second place to enter an event already recorded by a lifecycle operation.

Diff packages preserve the source attempts and material they describe. They are inspection inputs; they do not run checks, establish approval, authorize transitions, or add completion gates. Read the exact signatures with:

```bash
kepler git diff-package validation --help
kepler git diff-package integration --help
kepler git diff-package unit-review --help
```

## Version boundaries

The v3 workflow operates on mission-owned Units of Work and Construction history. The earlier `workbench` operates on change-based artifacts. Kepler does not convert v2 artifacts or history, adopt old records as v3 authority, or delete either generation during setup. Keep active work with the generation that created it; see [installation and upgrade guidance](installation.md#upgrade-between-changes).

For interrupted work, inspect the exact unit, stage, task, Activity, evidence, and Integration lock before resuming. Follow [recovery guidance](recovery.md); do not edit journals or projections directly.
