# Recover interrupted work

Use this guide when mission preparation, a worker, Integration, or setup stops before you can confirm the result. Kepler records workflow history separately from agent sessions. A timeout does not prove that a worker stopped or a write failed.

Preserve history, partial changes, checkpoints, settings, and locks until you establish their state. Recovery instructions do not grant deletion, rollback, or overwrite permission.

## Continue mission preparation

1. Confirm that the original startup operation ended.
2. Keep the returned mission ID and original record home.
3. Inspect the reported resources and partial effects.
4. Continue the same mission:

```bash
kepler mission prepare --mission "$MISSION" --project "$PROJECT"
```

Use the full lowercase UUIDv4. Repeating `mission create` allocates a new mission. Preparation verifies saved selections and fixed starting checkpoints. It performs only missing authorized work. It does not reset Git, remove locks, infer new choices, or start a stage.

Local startup instructions are at `<git-common-directory>/kepler/missions/<mission-id>/workspaces/startup/intent.json`. They are not workflow authority. Do not edit instructions, attachments, or journals to force recovery. Missing older recovery facts, changed checkpoints, conflicting resources, or uncertain history require explicit reconciliation.

The append-recovery path is narrow. It can complete the missing final newline of the exact matching saved startup event. It does not repair another damaged tail.

A response with `historical: true` reports recorded preparation. It omits local workspace IDs and paths. It does not establish current readiness or recreate attachments. Fresh results omit the historical field. See [Mission commands](cli/mission.md).

## Resume Construction work

### Inspect before changing state

Confirm the exact worker run through the host. A lost chat or command response does not prove termination.

Read the owning scope:

```bash
kepler workflow construction unit show --unit "$UNIT" --project "$PROJECT"
kepler workflow construction stage show --unit "$UNIT" --stage implementation --project "$PROJECT"
kepler workflow construction task show --unit "$UNIT" --task "$TASK" --project "$PROJECT"
kepler workflow construction activity show --unit "$UNIT" --task "$TASK" --activity code-generation \
  --implementation-attempt "$IMPL" --project "$PROJECT"
kepler audit list --unit "$UNIT" --fields type,data --limit 100 --project "$PROJECT"
```

Use the actual unit, task, parent, and Activity from the interrupted work. There is no global `status` command.

Compare records with current artifacts, commits, output files, and worker effects. Keep uncommitted work. A process exit or Git commit does not prove check success, approval, or completion.

### Pause and resume

A pause has a request and a separate acknowledgement. The request records `pausing`; it does not stop the worker. Acknowledge only after exact-run termination and effect reconciliation. The acknowledgement records `paused` when its guards pass.

Use the complete [pause attestation](cli/construction.md#stage-pause). For Activity pause, retain the exact task, Activity, Implementation attempt, and Activity attempt selectors.

Resume the same acknowledged paused attempt only when its inputs and ownership remain valid. Supply the exact `reference` and `purpose` pairs retained at its start. Do not add, omit, or replace inputs.

With `jq`, extract those inputs from the original stage-start response saved as `stage-start.json`:

```bash
jq '{inputs:.data.inputs}' stage-start.json > stage-resume.json
kepler workflow construction stage resume --unit "$UNIT" --stage implementation --attempt "$IMPL" \
  --request "$(cat stage-resume.json)" --project "$PROJECT"
```

That saved response must belong to this exact Implementation attempt. If it is unavailable, inspect the original start event with `audit show`. Do not start another attempt to obtain replacement inputs. An empty array cannot resume a stage that started with non-empty inputs.

Activity resume also requires its exact original inputs and unchanged current task inputs. See the [Activity example](cli/construction.md#activity-pause-and-activity-resume). A resumed command does not dispatch the worker. The host performs that action separately.

A failed command does not automatically require a new attempt. Do not create a new attempt merely to hide an earlier failure.

### Revise invalidated scope

An upstream change can invalidate downstream work. Stop affected workers, confirm their effects, and reconcile locks first. Then use the authorized [revision operation](cli/construction.md#revise) for the correct boundary.

Revision records authority and the affected scope. It does not stop workers, grant new work scope, or remove uncertain effects. Do not edit journals or projections to simulate a reopen.

Code Integration is not an Activity revision boundary. Its eligible check retry uses the same attempt.

### Prerequisite proof after interruption or revision

Inspect `task ready` and its evidence. Valid proof remains known when the same current Implementation parent pauses or completes. A new current Implementation attempt needs its own proof.

Record `task-prerequisite` evidence under the exact task and current running parent, without Activity scope. Bind the exact condition or description through the input reference. Select the evidence IDs explicitly during admission. Readiness does not probe services or grant repair permission.

If replay reports `invalid-task-prerequisite-evidence`, preserve the evidence and its parent start, pause, resume, and revision facts. Do not delete a record or invent a causal relationship. Resolve the reported history condition through authorized recovery.

## Integration acceptance and release

Inspect the exact token, task, Activity attempt, parent attempt, captured target, prepared candidate, and current evidence. Keep the lock while ownership or effects remain uncertain.

The caller runs the planned checks while holding the lock. `integration evidence` records the result; it does not run the command. A failed or inconclusive current result prevents acceptance.

If acceptance reports `integration_evidence_changed`, inspect the latest evidence and bindings. Retry acceptance explicitly only when the current required checks passed for the unchanged candidate. Keep the same token and prepared event. Do not relabel old results as new proof.

A response can fail after acceptance was recorded if later target verification or lock release fails. Preserve the acceptance and partial-effect facts. Reconcile history, target, proof, and ownership. Eligible recovery uses the same `integration accept` operation and prepared event without another acceptance fact.

Do not use `integration release` to abort accepted work. Incomplete-work release is allowed only for the current token owner while the protected target still matches the captured input. There is no force release or age-based takeover command.

See the [Integration reference](cli/construction.md#integration) for all selectors. Unit-control contention can require a retry; it does not prove that release or abort occurred.

## Interrupted installation or setup

The installer stages one complete archive and invokes candidate setup. Setup alone activates the generation. If the installer reports failure, retain its reported staging path. Do not remove it until you inspect the operation and evidence.

Check the actual state:

- The current selector target.
- The stable launcher target.
- The installation receipt and generation.
- The Pi settings package entry.
- The installation journal and reported residual paths.

A pre-activation failure should preserve the prior selection. A later failure can report partial effects. Neither result establishes rollback by itself.

Do not edit the receipt, delete unknown files, remove another owner's lock, or force an overwrite. Preserve format-one receipt bytes and prior generations. A residual settings temporary file can exist even when final settings were not changed. Read `temporary_file_evidence` and its ownership/cleanup facts when reported.

If validation reports an incomplete archive, obtain the complete package for the intended version and target. Do not substitute a different release's resources or an arbitrary checkout. Setup requires Pi 1.2.0, pi-subagents 0.76.1, an existing agent directory, and initialized settings. It does not install these prerequisites.

When setup returns a safe native-transfer plan, inspect its exact resources and digest. Use `--accept-native-transfer <digest>` only for that unchanged acceptable plan. A stale digest does not authorize a changed transfer. Unknown, custom, or modified resources remain blocked.

Keep non-cooperating settings editors idle during setup. The expected-preimage check rejects observed drift, but it is not an atomic compare-and-swap guarantee against arbitrary writers.

Pi owns resource loading. Setup success does not prove that a session loaded a skill or that an agent followed it. Keep active work with its original generation if a new generation cannot be verified. See [Installation](installation.md).

## Earlier change-based work

Use the matching `workbench` commands and artifact generation for earlier changes. They have different context, task-state, review, and finish records. They do not resume v3 mission state.

Guarded legacy publication can leave integrated work in progress after verification fails. Preserve the original worker history, merge, ledger, admission, and feedback. Do not reset or create a duplicate admission to hide that failure.

See the [workbench reference](cli/workbench.md). Keep safe legacy path-copy behavior separate from v2-to-v3 conversion; no such workflow conversion is provided.

## Sources

Implementation: [mission startup](../packages/cli/src/construction/mission-startup.ts), [pause/resume](../packages/cli/src/construction/pause-resume.ts), [revision](../packages/cli/src/construction/revision.ts), [Integration](../packages/cli/src/construction/integration-execution.ts), and [setup](../packages/cli/src/cli/setup.service.ts).

The [v3 specifications](specs/v3/README.md) provide supporting contracts. Recovery in this guide describes implemented operations and does not modify those specifications.
