# Construction commands

Use this reference to operate a mission-owned Unit of Work. Follow the [operator walkthrough](standard-walkthrough.md) for complete request mechanics or the [developer tutorial](../missions/tutorial.md) for prompt-based work. See [CLI conventions](../cli.md) for JSON output, exit codes, and project selection.

All commands start with `kepler workflow construction`. Each accepts optional `--project <path>` and `-h, --help`. The project defaults to the current Git working-tree root with an existing local `.kepler/` directory. Queries do not change workflow history. Mutations append history and can create local coordination data. A failed result can follow a partial effect.

## Scope and values

| Option | Value and meaning |
| --- | --- |
| `--unit <unit-id>` | Exact date-plus-slug Unit of Work ID. |
| `--stage <stage>` | `functional-design`, `quality-requirements`, `implementation-planning`, `implementation`, `unit-of-work-review`, or `deliver`. |
| `--task <task-id>` | Full lowercase task UUIDv4 from the graph. |
| `--activity <activity>` | `code-generation`, `code-validation`, or `code-integration`. |
| `--attempt <attempt-id>` | Exact stage or Activity attempt UUIDv4, according to scope. |
| `--implementation-attempt <attempt-id>` | Enclosing Implementation attempt UUIDv4. |
| `--request <json>` | One strict operation-specific JSON object. Not a filename. |
| `--project <path>` | Selected record home. Relative paths resolve from the invocation directory. |

There is no implicit current unit or attempt. Do not repeat selectors. Task scope and Activity scope belong to Implementation. Start operations allocate their own attempt IDs.

The examples use IDs returned by earlier operations. `$PROJECT` is the record-home path. `$UNIT`, `$TASK`, `$IMPL`, and `$ATTEMPT` select the exact unit, task, Implementation attempt, and current scoped attempt.

## Units

### `unit create`

```text
kepler workflow construction unit create <slug> --mission <mission-id>
  [--effort <level>] [--stage-effort <stage=level> ...] [--project <path>]
```

`<slug>` contains lowercase alphanumeric words separated by single hyphens. `--mission` is required and selects a prepared Standard mission. Effort is `minimal`, `standard`, or `comprehensive`. The default is `standard`. Repeat `--stage-effort` only for distinct supported stages. There are no stage overrides by default.

```bash
kepler workflow construction unit create owner-access --mission "$MISSION" \
  --effort standard --stage-effort unit-of-work-review=comprehensive --project "$PROJECT"
```

The operation creates `<local-date>-<slug>` and its mission-owned directory. It records membership, workflow binding, and initial effort. It returns `unit_id`, `mission_id`, `directory`, `workflow`, effort, event/journal identities, and `execution_started: false`.

It creates no stage documents or task graph. A mission cannot acquire a second Unit of Work. Existing conflicting paths, membership, history, or coordination block creation. See [Mission creation](mission.md).

### `unit list`

```text
kepler workflow construction unit list [--project <path>]
```

```bash
kepler workflow construction unit list --project "$PROJECT"
```

Returns `record_home` and compact `units` summaries. Inventory can expose orphaned or conflicting older unit paths. Listing those paths does not adopt them into a mission.

### `unit show`

```text
kepler workflow construction unit show --unit <unit-id> [--project <path>]
```

```bash
kepler workflow construction unit show --unit "$UNIT" --project "$PROJECT"
```

Returns `record_home` and `unit`. The unit contains directory and membership status, workflow binding, progress, effort, stage/task summaries, blockers, and unknowns. Unreliable counts can be `null`. Exit 0 means the query succeeded, not that the unit is ready or complete.

## Stages

### `stage show`

```text
kepler workflow construction stage show --unit <unit-id> --stage <stage> [--project <path>]
```

```bash
kepler workflow construction stage show --unit "$UNIT" --stage functional-design --project "$PROJECT"
```

Returns the current projection, attempt/event references, effective effort, evidence, approvals, blockers, and unknowns. It does not start or resume work.

### `stage start`

```text
kepler workflow construction stage start --unit <unit-id> --stage <stage>
  --request <json> [--project <path>]
```

Request:

```json
{"inputs":[{"reference":"request:owner-access","purpose":"Requested access policy"}]}
```

At least one input is required. Each input has only a non-empty `reference` and `purpose`.

```bash
kepler workflow construction stage start --unit "$UNIT" --stage functional-design \
  --request '{"inputs":[{"reference":"request:owner-access","purpose":"Requested access policy"}]}' \
  --project "$PROJECT" > stage-start.json
```

The operation checks mission preparation, unit binding, current workspace checkpoints, and upstream completion authority. It records a new attempt and returns `attempt_id` and event identity. It reports `worker_dispatched: false`. The caller starts the assigned worker separately.

### `stage complete`

```text
kepler workflow construction stage complete --unit <unit-id> --stage <stage>
  --attempt <attempt-id> --request <json> [--project <path>]
```

```bash
kepler workflow construction stage complete --unit "$UNIT" --stage functional-design \
  --attempt "$ATTEMPT" --request "$(cat functional-design-completion.json)" --project "$PROJECT"
```

Use the complete typed object for that stage. See [Stage assessments](stage-assessments.md). A bare `status: passed` is not a completion request.

The operation validates the current attempt, upstream facts, artifacts, checkpoints, named evidence, and required decisions. It records the typed completion. It does not write the material, run the checks, or approve the work. The response includes the completion event ID and its scoped results.

Stage completion accepts `--unit`, `--stage`, `--attempt`, `--request`, and optional `--project`. It does not accept task or Activity selectors.

### `stage pause`

```text
kepler workflow construction stage pause --unit <unit-id> --stage <stage>
  --attempt <attempt-id> --request <json> [--project <path>]
```

Request a pause:

```bash
kepler workflow construction stage pause --unit "$UNIT" --stage functional-design --attempt "$ATTEMPT" \
  --request '{"phase":"request","reason":"Inspect an interrupted worker."}' --project "$PROJECT"
```

This records `pausing`. It does not stop a worker. After the exact run ends and effects are reconciled, acknowledge with:

```json
{"phase":"acknowledge","reason":"The exact run ended and effects are reconciled.","orchestrator_attestation":{"exact_run_terminal":true,"effects_reconciled":true,"run_reference":"host:exact-run-id","reconciliation_references":["report:reconciliation"]}}
```

Both attestation booleans must be true. Supply a non-empty run reference and distinct non-empty reconciliation references. The acknowledgement records `paused` only when the guards hold. Do not submit an attestation before verifying the facts.

### `stage resume`

```text
kepler workflow construction stage resume --unit <unit-id> --stage <stage>
  --attempt <attempt-id> --request <json> [--project <path>]
```

Retain the original start response as `stage-start.json`. With `jq`, copy its exact inputs into the resume request:

```bash
jq '{inputs:.data.inputs}' stage-start.json > stage-resume.json
kepler workflow construction stage resume --unit "$UNIT" --stage functional-design --attempt "$ATTEMPT" \
  --request "$(cat stage-resume.json)" --project "$PROJECT"
```

Resume requires the same acknowledged paused attempt and its exact original input pairs. Authority and ownership must remain valid. Do not replace those inputs with an empty array. It records resumption and reports no worker dispatch. It does not create a new attempt.

Pause and resume help also lists `--task`, `--activity`, and `--implementation-attempt` because the parser is shared with Activity operations. Do not combine Activity selectors with the stage boundary.

### `stage assess-retained-scopes`

```text
kepler workflow construction stage assess-retained-scopes --unit <unit-id>
  --stage implementation --attempt <implementation-attempt-id> --request <json> [--project <path>]
```

```bash
kepler workflow construction stage assess-retained-scopes --unit "$UNIT" \
  --stage implementation --attempt "$IMPL" --request "$(cat retained-scopes.json)" --project "$PROJECT"
```

The request has only `assessments`, a non-empty array of distinct task/Activity assessments. Each item has:

| Field | Meaning |
| --- | --- |
| `task_id`, `activity` | Retained task and Activity scope. |
| `original_stage_attempt_id`, `original_activity_attempt_id` | Original completed Implementation and Activity attempts. |
| `original_evidence_ids` | Non-empty unique evidence UUID list. |
| `applicable` | Explicit applicability decision. |
| `reason` | Non-empty rationale for the decision. |
| `checkpoints` | Non-empty repository-qualified original checkpoints. |

The operation validates the original facts and their applicability to the current material. It records one retained-scope assessment event for the current running Implementation attempt. It does not infer applicability or rerun old work. See [revision recovery](../recovery.md#resume-construction-work).

## Tasks

### `task list`

```text
kepler workflow construction task list --unit <unit-id> [--project <path>]
```

```bash
kepler workflow construction task list --unit "$UNIT" --project "$PROJECT"
```

Lists authored tasks and execution state, dependencies, blockers, and unknowns. It does not generate or edit the graph.

### `task show`

```text
kepler workflow construction task show --unit <unit-id> --task <task-id> [--project <path>]
```

```bash
kepler workflow construction task show --unit "$UNIT" --task "$TASK" --project "$PROJECT"
```

Returns the task definition, current scope, admissions, Activities, event references, evidence, and blockers. Task IDs come from the current authored graph.

### `task ready`

```text
kepler workflow construction task ready --unit <unit-id> --task <task-id> [--project <path>]
```

```bash
kepler workflow construction task ready --unit "$UNIT" --task "$TASK" --project "$PROJECT"
```

Returns `ready`, `blocked`, `unknown`, `already_admitted`, or `complete`, with dependency and prerequisite facts. It reads recorded proof. It does not probe services, obtain credentials, admit the task, or authorize edits.

Blocking Implementation prerequisites need task-scoped `task-prerequisite` evidence under the current running Implementation attempt. The input reference must cover the exact condition or description. Old-attempt evidence does not satisfy a new attempt. Readiness and admission remain separate checks.

### `task admit`

```text
kepler workflow construction task admit --unit <unit-id> --task <task-id>
  --implementation-attempt <attempt-id> [--prerequisites <json>] [--project <path>]
```

```bash
kepler workflow construction task admit --unit "$UNIT" --task "$TASK" \
  --implementation-attempt "$IMPL" --prerequisites '{"prerequisite_evidence_ids":[]}' --project "$PROJECT"
```

The prerequisites option defaults to the empty object shape shown above. Its array must contain unique evidence UUIDs. The operation checks current graph/task identity, dependencies, baselines, and explicitly selected prerequisite evidence. First admission also records the original unit Review baseline. It records admission but does not start an Activity or dispatch a worker.

## Activities

The Activity sequence is Code Generation, Code Validation, then Code Integration. Each occurrence is scoped to a task and Implementation attempt.

### `activity show`

```text
kepler workflow construction activity show --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> [--project <path>]
```

```bash
kepler workflow construction activity show --unit "$UNIT" --task "$TASK" \
  --activity code-generation --implementation-attempt "$IMPL" --project "$PROJECT"
```

Returns that occurrence's state, attempts, event references, evidence, blockers, and unknowns. It does not accept an individual `--attempt` filter.

### `activity start`

```text
kepler workflow construction activity start --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> [--evidence <json>] [--project <path>]
```

```bash
kepler workflow construction activity start --unit "$UNIT" --task "$TASK" \
  --activity code-generation --implementation-attempt "$IMPL" --project "$PROJECT" > activity-start.json
```

The task must be admitted under the current running parent. The preceding Activity must have current completion or valid retained-scope support. Start allocates `activity_attempt_id` and returns inputs and checkpoints. It reports `worker_dispatched: false`.

The shared parser lists `--attempt`, but start rejects a supplied attempt selector. It also parses optional `--evidence` JSON, then does not pass that data to the start operation. Omit both flags at start.

### `activity complete`

```text
kepler workflow construction activity complete --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> --attempt <activity-attempt-id>
  [--evidence <json>] [--project <path>]
```

```bash
kepler workflow construction activity complete --unit "$UNIT" --task "$TASK" \
  --activity code-generation --implementation-attempt "$IMPL" --attempt "$ATTEMPT" \
  --evidence "$(cat activity-evidence.json)" --project "$PROJECT"
```

Evidence defaults to `{"evidence_ids":[]}`. The unique evidence UUID list must satisfy the current Activity's actual checks. Generation needs typecheck, related tests, and self-review. Validation needs typecheck, build, full-suite, independent-review, and self-review evidence. Generation and Validation evidence also needs worker context and declared output coverage.

Code Validation uses a non-author executor and separate worker context. Code Integration completion requires accepted Integration and its evidence. Successful completion of that final Activity also records task completion. It does not execute the tests or implementation.

### `activity pause` and `activity resume`

```text
kepler workflow construction activity pause --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> --attempt <activity-attempt-id>
  --request <json> [--project <path>]
kepler workflow construction activity resume --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> --attempt <activity-attempt-id>
  --request <json> [--project <path>]
```

```bash
kepler workflow construction activity pause --unit "$UNIT" --task "$TASK" \
  --activity code-generation --implementation-attempt "$IMPL" --attempt "$ATTEMPT" \
  --request '{"phase":"request","reason":"Inspect the worker."}' --project "$PROJECT"
```

Confirm exact-run termination and reconcile effects. Then acknowledge the pause with the typed attestation from [stage pause](#stage-pause). Resume only after that acknowledgement succeeds.

Copy the exact inputs from this Activity's saved start response. The current task inputs must also remain unchanged:

```bash
jq '{inputs:.data.inputs}' activity-start.json > activity-resume.json
kepler workflow construction activity resume --unit "$UNIT" --task "$TASK" \
  --activity code-generation --implementation-attempt "$IMPL" --attempt "$ATTEMPT" \
  --request "$(cat activity-resume.json)" --project "$PROJECT"
```

Resume keeps the same paused attempt. An empty array is valid only if it matches both the original and current inputs.

The shared parser also exposes `--stage`. Activity scope does not use a separate stage selector; omit it. The exact task and enclosing Implementation attempt establish the parent scope.

## Integration

Integration supports exactly one prepared repository per unit. It fails before lock acquisition for multi-repository scope. The caller creates the candidate and runs the checks. These commands validate and record facts; they are not a merge planner or check runner.

Define the required scope for all five operations:

```bash
integration_scope=(--unit "$UNIT" --task "$TASK" --activity code-integration \
  --implementation-attempt "$IMPL" --attempt "$ATTEMPT" --project "$PROJECT")
```

Every operation also exposes `--lock-token <token>`, `--prepared-event-id <event-id>`, and `--request <json>` through a shared parser. The table below states which ones it consumes. Do not supply unused flags; malformed values can fail during parsing.

| Operation | Additional consumed inputs | Result and effect |
| --- | --- | --- |
| `integration lock` | None. | Acquires the unit lock. Returns `lock_token`, target binding, scope, and `captured_inputs`. |
| `integration prepare` | Required `--lock-token` and `--request`. | Verifies and records the immutable candidate. Returns `prepared_event_id`. |
| `integration evidence` | Required `--lock-token` and `--request`. | Records one current check result. Returns event and evidence identities. |
| `integration accept` | Required `--lock-token` and `--prepared-event-id`. | Accepts only the current checked candidate and releases the lock. |
| `integration release` | Required `--lock-token`. | Releases eligible incomplete work only when the captured target remains unchanged. |

### Lock and prepare

```bash
kepler workflow construction integration lock "${integration_scope[@]}"
kepler workflow construction integration prepare "${integration_scope[@]}" \
  --lock-token "$LOCK_TOKEN" --request "$(cat integration-candidate.json)"
```

Retain the exact token. Copy `captured_inputs` from the lock response, without reconstructing it from current refs. Prepare accepts only:

```json
{"captured_inputs":[{"repository_id":"repo-main","commit":"<captured-commit>"}],"candidate_checkpoints":[{"repository_id":"repo-main","commit":"<candidate-commit>"}]}
```

An explicitly unborn target uses `{ "repository_id": "repo-main", "no_commit": true }` in captured inputs. Do not substitute an empty or guessed commit. The candidate must name an actual commit in the prepared repository.

### Record check evidence

```bash
kepler workflow construction integration evidence "${integration_scope[@]}" \
  --lock-token "$LOCK_TOKEN" --request "$(cat integration-check.json)"
```

| Request field | Requirement |
| --- | --- |
| `prepared_event_id` | Exact preparation event UUID. |
| `check` | One of the four names below. |
| `executor` | Non-empty actual executor identity. |
| `result` | `status`: `passed`, `failed`, or `inconclusive`; non-empty `summary`. |
| `check_command` | Required for command checks: `repository_id`, executable, and exact argv array. Omit for self-review. |
| `output_refs` | Non-empty output reference array. |
| `conditions` | Condition strings. Self-review must repeat every task acceptance criterion and the exact sentence `Integration bindings match the accepted candidate and actual inputs.` |

Required checks are `code-integration-typecheck`, `code-integration-build`, `code-integration-full-test-suite`, and `code-integration-self-review`.

A command must appear as an exact repository-qualified backtick expression in both `plan.md` and the task's verification method. The plan clause must identify the check. For example, use `Run the full test suite with` before `` `repo-main: bun run test` ``. A command named `test` alone does not establish full-suite scope. The executable and argv must match exactly. Shell operators, quoted compound commands, and automatic command discovery are not supported by this binding parser.

Run the actual command while holding the lock. Record its actual result afterward. Do not use `audit record evidence` to duplicate the Integration lifecycle fact.

### Accept or release

```bash
kepler workflow construction integration accept "${integration_scope[@]}" \
  --lock-token "$LOCK_TOKEN" --prepared-event-id "$PREPARED_EVENT"
kepler workflow construction integration release "${integration_scope[@]}" --lock-token "$LOCK_TOKEN"
```

These are alternative paths. Acceptance requires current successful evidence for the unchanged candidate. Release is for incomplete work; it cannot abort accepted work or discard a changed target. There is no force-unlock command.

After acceptance, complete the Code Integration Activity with its evidence IDs. Acceptance alone does not complete that Activity. See [Recovery](../recovery.md#integration-acceptance-and-release) for changed evidence and post-acceptance release failures.

## Lint and revision

### `lint`

```text
kepler workflow construction lint --unit <unit-id> [--project <path>]
```

```bash
kepler workflow construction lint --unit "$UNIT" --project "$PROJECT"
```

Validates the canonical plan and graph. Its path validation uses the record-home repository. It does not use other prepared repositories as path roots.

The operation checks actual Markdown links and the canonical graph's path. It does not inspect path operands inside a task's verification command. For example, lint can accept a verification method containing `repo-main: cat ../outside.txt`. That success does not establish path containment or permission to execute the command.

This is an implementation gap against the [planning path rules](../specs/v3/phases/construction/implementation-planning.md). Those rules require checks for explicit file/path operands. Keep a separate path review until the implementation provides that check. The specifications remain unchanged.

Success returns `findings: []`. Invalid material fails with `construction_lint_failed` and findings in details. Lint does not edit artifacts, prove technical feasibility, or check complete requirement coverage.

### `revise`

```text
kepler workflow construction revise --unit <unit-id> --stage <stage>
  --attempt <stage-attempt-id> [--project <path>]
kepler workflow construction revise --unit <unit-id> --task <task-id>
  --activity <activity> --implementation-attempt <attempt-id> --attempt <activity-attempt-id>
  [--project <path>]
```

Read one strict UTF-8 JSON object from stdin:

```json
{"orchestrator_decision":"Revise the selected scope.","reason":"An accepted input changed.","inputs":[{"reference":"request:changed-input","purpose":"Authorized revision basis"}]}
```

```bash
kepler workflow construction revise --unit "$UNIT" --stage functional-design \
  --attempt "$ATTEMPT" --project "$PROJECT" < revision.json
```

Choose exactly one stage or Activity boundary. The inputs array is non-empty. The operation records revision authority and affected scopes. It ends or reopens the selected and dependent scope after checking execution and ownership facts. It does not stop workers for you.

Code Integration is not an Activity revision boundary. Retry its checks in the same attempt. Do not use revision as force release or as a replacement for required recovery. See [Recovery](../recovery.md).

## Task graph fields

`tasks-dag.json` uses `format: "kepler-task-dag"`, `version: 1`, a graph `id`, owning `unit_id`, and `tasks`. Each task has `id`, `title`, `goal`, `inputs`, `outputs`, `acceptance_criteria`, `guidance`, `verification`, `depends_on`, and `prerequisites`.

- Inputs contain `reference` and `purpose`.
- Verification entries contain `scope`, `method`, and `expected_result`.
- Dependencies contain `task_id` and `reason`.
- Prerequisites contain `description`, `needed_for`, `needed_when`, `blocking`, `condition`, and `reason`.

The graph rejects unknown fields, duplicate IDs, invalid dependencies, and cycles. Link the canonical graph from `plan.md`. There is no public `task add`, `task edit`, `task complete`, alternate graph-path option, or graph generator. See the [read-only format contract](../specs/v3/phases/construction/task-graph.md).

## Failure and source references

Normal success exits 0. Failures exit 1 with code, message, details, and recovery. Common conditions include invalid selectors, blocked history, stale graph/material, non-current attempts, missing evidence or approval, coordination contention, changed Integration evidence, and lock ownership mismatch.

Do not infer a safe retry from a timestamp. Preserve records and uncertain effects. Inspect the exact scope before retrying.

Implementation: [command adapters](../../packages/cli/src/cli/nest/capability.commands.ts), [Construction operations](../../packages/cli/src/construction/), [Integration command binding](../../packages/cli/src/construction/integration-command-contract.ts), and [public CLI E2E](../../tests/e2e/stage-completion.test.ts).
