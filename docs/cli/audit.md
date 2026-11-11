# Audit commands

Use this reference to record checks, approvals, and interactions, or inspect their history. Audit records do not perform the work that they describe. See [State and artifacts](../missions/state-and-artifacts.md) for identities and storage.

## Scope options

All recording commands accept these options. List accepts the same scope filters. Each also supports optional `--project <path>` and `-h, --help`.

| Option | Meaning |
| --- | --- |
| `--unit <unit-id>` | Required owning Unit of Work. |
| `--stage <stage>` | Stage scope. Use a supported Construction stage. |
| `--task <task-id>` | Task scope inside Implementation. |
| `--activity <activity>` | Activity scope; requires task and enclosing Implementation scope. |
| `--attempt <attempt-id>` | Exact stage attempt, or exact Activity attempt when an Activity is selected. |
| `--implementation-attempt <attempt-id>` | Exact enclosing Implementation attempt for task/Activity records. |
| `--project <path>` | Record home. Default: the invocation project root. |

Mutations need the applicable current scope. A stage record uses unit, stage, and stage attempt. An Activity record uses unit, task, Activity, Activity attempt, and Implementation attempt. These scopes are not interchangeable. Task prerequisites have a supported pre-admission scope under the current running Implementation parent.

## Record facts

```text
kepler audit record evidence --unit <unit-id> [scope options] [--project <path>]
kepler audit record approval --unit <unit-id> [scope options] [--project <path>]
kepler audit record interaction --unit <unit-id> [scope options] [--project <path>]
```

Supply one strict JSON object on stdin. The input must use UTF-8 and be at most 16 MiB. A terminal prompt, empty input, invalid encoding, invalid JSON, or oversized input fails. The commands do not provide `--request` or an interactive questionnaire.

Success returns `id` and `journal_id`. Evidence also returns a distinct `evidence_id`. Completion assessments select evidence IDs; approval references select the approval event ID.

Recording appends a typed Construction event. An append failure can leave uncertain bytes. Inspect the named journal before retrying. Do not duplicate a lifecycle event that another command already records.

### `audit record evidence`

Required fields:

| Field | Shape and meaning |
| --- | --- |
| `inputs` | Array of `{reference, purpose}` with non-empty strings. Later guards can require exact coverage. |
| `artifact_bindings` | Array of `{artifact_id, content_version}` for current material. Use exact `sha256:<hex>` versions. |
| `checkpoints` | Repository-qualified `{repository_id, commit}` array. Completion guards require the applicable committed set. |
| `check` | Non-empty implemented check name. Stage and Activity guards require their exact names. |
| `executor` | Actual executor identity. |
| `result` | Object with `status` (`passed`, `failed`, or `inconclusive`) and non-empty `summary`. |

Optional fields:

| Field | Meaning |
| --- | --- |
| `worker_context_id` | Non-empty worker context. Required for Generation and Validation evidence. |
| `output_refs` | Array of non-empty output references. Activities require declared output coverage. |
| `conditions` | Array of non-empty condition statements. |
| `related_request_event_id` | Existing related requester-interaction UUID. |
| `related_event_ids` | Non-empty unique related evidence-event UUID array. It cannot repeat the requester interaction. |

Use the selected current scope and complete bindings:

```bash
kepler audit record evidence --unit "$UNIT" --stage functional-design \
  --attempt "$ATTEMPT" --project "$PROJECT" < functional-design-evidence.json
```

A request has this shape; replace all identities and checkpoint values with actual facts:

```json
{
  "inputs": [{"reference": "artifact:<artifact-id>", "purpose": "Current reviewed design"}],
  "artifact_bindings": [{"artifact_id": "<artifact-id>", "content_version": "sha256:<exact-file-hash>"}],
  "checkpoints": [{"repository_id": "repo-main", "commit": "<full-commit-id>"}],
  "check": "functional-design-self-review",
  "executor": "agent:architect",
  "result": {"status": "passed", "summary": "The actual design self-review passed."}
}
```

The angle-bracket values are reference notation, not valid literal IDs. The [tutorial](../missions/tutorial.md) constructs real values.

Use `task-prerequisite` only with the exact task and current Implementation attempt. Do not add Activity scope to that proof. Bind its input to the exact prerequisite condition or description. Recording proof still requires a running parent, even if an earlier attempt admitted the task.

Use the separate [Integration evidence operation](construction.md#record-check-evidence) for prepared-candidate checks. Ordinary audit evidence is not a substitute.

### `audit record approval`

Required fields are `requester`, `inputs`, `artifact_bindings`, `checkpoints`, and `decision_reference`. The requester and decision reference are non-empty text. Bind the exact approved material and applicable checkpoint set.

```bash
kepler audit record approval --unit "$UNIT" --stage functional-design \
  --attempt "$ATTEMPT" --project "$PROJECT" < functional-design-approval.json
```

Record an explicit decision after the requester gives it. Kepler does not obtain permission by recording a name. A passed review, previous approval, or silence does not approve changed material.

### `audit record interaction`

Required fields are non-empty `participants` and `content`. `participants` is an array of non-empty strings. Optional fields are:

| Field | Meaning |
| --- | --- |
| `references` | Array of non-empty request or context references. |
| `reply_reference` | Non-empty reference to the reply context. |
| `effort_selection` | Structured unit or stage effort selection. |
| `delivery_outcome` | Typed requester selection under an exact Deliver attempt. |

Effort selection includes `selected_by`. A unit selection uses `target: "unit"`, `action: "set"`, and `level`. A stage selection uses `target: "stage"`, `stage`, and either `action: "set"` with `level` or `action: "inherit"`. Levels are `minimal`, `standard`, and `comprehensive`. A stage selection must match its explicit audit stage scope.

A delivery outcome has `outcome`, `requested_outcome`, `destination`, and `recipient`. Supported outcomes are `repository-handoff`, `review-request`, `publication`, `deployment`, and `other`. It requires a requester participant and a Deliver stage attempt, without task or Activity scope.

```bash
kepler audit record interaction --unit "$UNIT" --stage deliver \
  --attempt "$ATTEMPT" --project "$PROJECT" < delivery-outcome.json
```

Recording publication as the desired outcome does not execute or authorize an external operation by itself. The later operation evidence and authority must match the actual instruction.

## Query history

### `audit list`

```text
kepler audit list --unit <unit-id> [scope options] [--type <event-type>]
  [--fields <field-list>] [--limit <n>] [--cursor <token>] [--project <path>]
```

| Option | Default and constraint |
| --- | --- |
| `--type <event-type>` | No type filter by default. Exact event type when supplied. |
| `--fields <field-list>` | Default: `id,journal_id,phase,type,recorded_at`. Comma-separated supported envelope fields; no duplicates. |
| `--limit <n>` | Default 20. Integer from 1 through 1000. |
| `--cursor <token>` | Omit this option to start at the first page. For later pages, pass the exact token returned by the same query. |

Supported fields are `id`, `phase`, `type`, `envelope_version`, `event_version`, `journal_id`, `recorded_at`, `producer`, `caused_by`, and `data`. The projection always includes `id` and `journal_id`. Field names do not accept whitespace or nested property syntax.

```bash
kepler audit list --unit "$UNIT" --type construction.stage-attempt-completed \
  --fields type,data --limit 100 --project "$PROJECT"
```

Returns `events` and `next_cursor`. The latter is `null` on the final page. Ordering uses journal ID and source line, not wall-clock timestamps.

A cursor retains its original matching journal prefixes. Later appends are not added to that view. Start a new query to see new events. A changed query or an unavailable or rewritten original prefix invalidates the cursor. Restart the query rather than editing a token.

This query is read-only. Invalid limits, fields, scope ownership, cursor, or unavailable history fail with exit 1. An event list is not a replacement for the owning state query.

### `audit show`

```text
kepler audit show --unit <unit-id> --journal <journal-id> --id <event-id> [--project <path>]
```

```bash
kepler audit show --unit "$UNIT" --journal "$JOURNAL" --id "$EVENT" --project "$PROJECT"
```

All three identities are required. Journal and event identities are full lowercase UUIDv4 values. Success returns `event`, containing the complete envelope. The command does not accept list filters or a line number. Missing, ambiguous, or mismatched event ownership fails. The operation is read-only.

## Exit behavior and sources

Normal success exits 0. Invalid inputs, stale scope, unavailable context, or append/query failure exit 1 with the standard failure envelope. A recorded failed check can still have a successful recording result. Inspect `result.status` in the recorded data; the process exit describes the recording operation.

Implementation: [recording](../../packages/cli/src/audit/recording.ts), [stdin reader](../../packages/cli/src/audit/request-input.ts), [queries](../../packages/cli/src/audit/queries.ts), [context](../../packages/cli/src/audit/context.ts), and [CLI adapters](../../packages/cli/src/cli/nest/capability.commands.ts). Supporting contract: [CLI audit](../specs/v3/cli.md).
