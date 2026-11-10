# CLI guide

The `kepler` CLI is delivered in one versioned target archive with its executable and complete resource package. Run `kepler --help` or any command's `--help` for the options supported by your installed release. The CLI returns structured JSON for operations and uses a nonzero exit status when an operation fails.

## Command map

| Command | Use |
| --- | --- |
| `kepler setup` | Validate and activate a compatible immutable generation, write its receipt, and register Kepler's managed Pi package when needed. |
| `kepler mission create` | Create a mission and prepare only its selected workspaces. |
| `kepler mission prepare` | Continue interrupted startup by exact mission ID, or read its recorded preparation result. |
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

## Install and validate setup resources

`kepler setup` validates the selected generation's embedded release/source/target identity, resource manifest, complete inventory, and payload digests before activation. It requires all six v3 Construction templates: `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `delivery.md`, and `supporting-document.md` under `templates/v3/construction/`. A self-consistent manifest does not make an incomplete package valid. Missing required resources fail setup; the existing selection and recorded resources are preserved when failure occurs before activation. Built-in templates and guidelines are resolved from the selected generation through `~/.kepler-dist/current/bundle/`; setup does not copy them into the XDG Kepler home or create missing Kepler defaults. That global home stores the format-two installation receipt. Setup preserves existing settings and custom assets. First registration, explicit transfer, or repair updates only the managed Pi package entry in an existing initialized settings file; upgrades and coherent no-ops leave Pi settings unchanged. See [installation](installation.md#setup-and-installed-resources).

For Pi, setup also requires supported Pi 1.2.0 and pi-subagents 0.76.1 installations, an existing Pi agent directory, and initialized settings. It preflights visible resource conflicts and registers the Kepler local package at the stable generation path. Pi owns discovery and execution. Setup does not create Pi settings or install host prerequisites.

If setup reports an external native ownership conflict, ordinary setup returns a read-only transfer plan and digest without transferring or activating the candidate. Review the exact plan before using `kepler setup --accept-native-transfer <digest>`. The digest authorizes only the unchanged safe plan; unknown, custom, modified, or mixed resources remain blocked. See [native ownership and transfer](installation.md#agent-resource-ownership).

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

## Continue mission preparation

After an interrupted startup, keep the mission ID and original record home:

```bash
kepler mission prepare --mission <mission-id> --project <record-home>
```

Use the full lowercase UUIDv4. Do not repeat `mission create` as a recovery retry; it allocates a new mission. Preparation verifies the saved selections and fixed checkpoints, reuses matching resources, and performs only missing authorized work. It does not start a stage.

`data.historical: true` means preparation was already recorded. That result omits local workspace IDs and paths and does not prove current readiness or recreate missing attachments. A newly completed preparation returns `historical: false` with its verified local bindings. Missing recovery facts, changed starting checkpoints, conflicting resources, and uncertain history cause failure without automatic repair. See [recovery guidance](recovery.md#continue-mission-preparation).

## Construction execution

The Standard workflow contains Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver. Each stage enforces its own inputs, authority, evidence, and completion conditions. A successful command reports that operation's result; it does not imply that the whole unit is complete.

Implementation runs three task-scoped Activities in order: Code Generation, independent non-author Code Validation, and checked Code Integration. The CLI records attempts, evidence, and transitions. The host's orchestrator dispatches workers. Integration checks the prepared combined candidate while holding the unit lock; accept only the candidate that passed the required checks.

Use the stage, task, activity, and integration help for supported selectors and options:

```bash
kepler workflow construction stage --help
kepler workflow construction task --help
kepler workflow construction activity --help
kepler workflow construction integration --help
```

The CLI does not infer approval, select an implicit active scope, dispatch agents, or treat a commit as proof that checks passed. Record ordinary stage and Activity evidence through `kepler audit record evidence` with the operation's typed request. The Integration lifecycle records its prepared-candidate evidence through its own `integration evidence` operation; do not duplicate that record.

### Prerequisite readiness

`task ready`, `task list`, and `task show` use recorded prerequisite proof before admission. A passed `task-prerequisite` fact must name the task and its current Implementation attempt, have no Activity scope, and cover the exact condition or description through an input reference. `task ready` returns known prerequisite evidence/event IDs and remaining unknown prerequisites. List and show use the same coverage for state and blockers; `task show` keeps its general evidence view. Only missing blocking Implementation prerequisites add admission blockers; dependency and runtime blockers remain separate.

Valid facts stay known when the same current parent pauses or completes. A different current attempt needs its own proof. Recording new proof still requires a running parent. `task admit` still requires explicitly selected evidence IDs and independently checks admission conditions. Readiness does not write history, admit work, probe services, or prove external availability. See the [task operation contract](specs/v3/cli.md#task-operations).

### Checked Integration

Use the separate `integration lock`, `prepare`, `evidence`, `accept`, and `release` operations. Each selects the exact unit, task, Code Integration Activity, Implementation attempt, and Activity attempt. Retain the returned lock token and preparation event ID. The assigned caller runs the required typecheck, build, and full-suite commands while holding the lock; the CLI validates and records supplied results, not command execution. Current executable Integration supports one repository per unit and rejects multi-repository scope before acquiring the lock.

Acceptance rechecks current proof, material, attempt, and long-lock ownership under unit-scoped coordination. A newer failed or inconclusive check blocks acceptance. If successful proof changes during the operation, `integration_evidence_changed` requires an explicit acceptance retry against that proof; it does not waive checks. Keep the lock until safe acceptance or incomplete-work release. `integration release` cannot abort accepted work or release a changed or uncertain target. See the [Integration operation contract](specs/v3/cli.md#integration-operations) and [recovery guidance](recovery.md).

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
