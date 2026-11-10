# Recovery guidance

Kepler records workflow history and repository checkpoints separately from agent sessions. A command timeout, missing response, or stopped chat does not show that a worker stopped or that a write failed. Preserve the project, history, partial changes, and any lock until you verify their state.

## Continue mission preparation

Confirm that the original startup command has ended; a timeout alone does not prove this. Keep its mission ID, original record home, partial Git resources, journals, and local recovery material. Continue with:

```bash
kepler mission prepare --mission <mission-id> --project <original-record-home>
```

Use the exact full lowercase UUIDv4 from the original result. Repeating `mission create` creates another mission. `mission prepare` checks actual canonical resources under scoped coordination and performs only missing work from the saved instructions. It preserves the starting commits or explicit no-commit conditions and retries exact pending event envelopes. It does not reset, roll back, remove locks, or start a stage.

The local instructions are at `<record-home Git common directory>/kepler/missions/<mission-id>/workspaces/startup/intent.json`. They are not workflow authority. Do not edit them, attachments, or journals to force recovery. If an older incomplete mission lacks required facts, or material or history conflicts, preserve it and resolve the reported condition explicitly. Kepler does not reconstruct the original choices from current refs or paths. Only a complete matching saved startup event missing its final newline can use the existing exact-event append recovery; other damaged tails remain unchanged and blocked.

A success with `data.historical: true` reports recorded preparation only. It needs no local intent or attachments and omits local workspace IDs and paths. It does not check current execution readiness or repair missing bindings. Inspect stage and workspace prerequisites separately before execution. If an operation and lock release both fail, retain both reported failures and partial-effect facts; failure guidance grants no lock-removal or repair authority.

## Resume Construction work

1. **Stop duplicate work.** Confirm through the coding-agent host that the exact worker run ended. Do not treat a timeout or lost session as proof.
2. **Read the exact scope.** Use `kepler workflow construction unit show`, `stage show`, `task show`, and `activity show` with the same project, unit, task, stage, and attempt selectors from the interrupted work. Use `kepler audit list` or `show` to inspect the relevant recorded events. Read each command's `--help` for required selectors.
3. **Compare records with material.** Check recorded inputs and checkpoint commits against the repositories, artifacts, and outputs that still exist. Preserve partial writes and uncommitted work. A commit or process exit alone does not prove check success, approval, or workflow completion.
4. **Check Integration ownership.** Before resuming Integration, verify that the exact Integration attempt still owns the unit lock, its prepared candidate matches the recorded inputs, and required checks cover that candidate in every repository. Never accept an unchecked or changed candidate. If ownership or effects remain uncertain, stop and retain the lock and material for an authorized recovery decision.
5. **Resume only a safe, paused attempt.** Use the owning `stage resume` or `activity resume` operation for the exact attempt after confirming its inputs and ownership remain valid. A retry of a failed command does not require a new attempt. Start a new attempt only when an authorized transition requires one.
6. **Reopen only through revision authority.** If an upstream artifact invalidates later work, report the material facts and use the authorized `kepler workflow construction revise` operation. Do not change journal records or projections to force a transition.

### Prerequisite proof after interruption or revision

Inspect `task ready` and the cited evidence under the exact unit and task. Valid facts remain visible when the same current Implementation parent pauses or completes. After a new Implementation attempt starts, old-attempt proof does not satisfy its prerequisites. Record fresh proof through `kepler audit record evidence` under the current running parent and task, then select its IDs explicitly for admission. An earlier attempt's admission does not prevent recording this new proof.

If replay reports `invalid-task-prerequisite-evidence`, preserve the evidence and its parent start, resume, and revision facts. Unbound proof or proof recorded after a causally prior pause or closure blocks the unit. Do not delete a record, invent a cause, or edit a journal to force readiness. Resolve uncertain history through an authorized recovery decision. A readiness result grants no repair or work authority.

### Integration acceptance and release

If acceptance reports `integration_evidence_changed`, inspect the current prepared candidate and latest check records. Keep the same lock token and attempt. Retry acceptance explicitly only when the current required checks succeeded and their bindings remain valid; do not re-record old results as new proof. Failed or inconclusive current evidence prevents acceptance.

A failed response can follow a recorded acceptance when target verification or lock release fails. Preserve that acceptance, the lock, and all partial effects. Reconcile history, target, proof, and ownership, then use the same prepared event with `integration accept` for eligible release recovery without a duplicate acceptance. Do not use `integration release` to abort an accepted attempt. Normal incomplete-work release is safe only for the current token owner when the target still matches the lock-captured input. Unit-control contention can require a later retry; it is not proof that release or abort occurred. Missing or replaced ownership does not permit takeover or removal of another holder's claim.

The CLI does not provide a global status command. Use the owning stage, task, Activity, audit, or integration operation for the scope you are recovering. Workers do not authorize their own scope changes. An unrelated unit can continue only when its inputs, contracts, and resources remain independent.

## Interrupted installation or setup

The bootstrap installer stages one complete target archive and invokes its candidate's `kepler setup`. Setup alone selects the active generation and updates the stable command path. If the installer reports failed setup, retain the reported staging path and any candidate evidence. Do not rerun another candidate or remove that directory until you have inspected the process, current selector, receipt, and Pi registration.

Before activation, a setup failure should leave the previous selector selected. After any external effect, a failure can report partial effects; it does not prove rollback. Preserve the installation journal, format-one receipt bytes, existing files, Pi settings, and current generation. Inspect the exact selector target, receipt generation, stable command link, and Kepler package entry in Pi settings. Do not hand-edit the receipt, delete unknown files, remove another owner's lock, or force an overwrite. If state disagrees or ownership is uncertain, stop and reconcile before retrying.

If setup rejects an incomplete archive or missing required v3 template, obtain the complete archive for the intended version and target. Do not use a sidecar from another release, a self-consistent but incomplete manifest, or an arbitrary checkout as fallback. Missing/unsupported Pi 1.2.0 or pi-subagents 0.76.1, an absent Pi agent directory or initialized settings file, and visible resource conflicts block activation. Setup does not create Pi settings or install Pi prerequisites.

When ordinary setup reports a native ownership-transfer plan and digest, the candidate remains unactivated. Review the exact plan before a retry with `kepler setup --accept-native-transfer <digest>`. A stale digest or changed plan is not authorization; unknown, custom, modified, or mixed resources stay blocked. If the current generation cannot be verified, do not start new work with it; keep active work with the generation that created it and obtain an authorized repair decision.

Pi owns discovery and loading of registered resources. A successful setup result records selected package/resource checks; it does not show that a session loaded a skill or that an agent followed its instructions. Other hosts retain their own skill and role installation procedures.

## Earlier change-based work

`kepler workbench` belongs to the earlier change-based workflow. Use its matching generation and artifacts for that work. Kepler does not convert legacy change artifacts or history into mission-owned version 3 records. Keep the old records intact; do not resume them through v3 Construction commands.

For command syntax, see the [CLI guide](cli.md). The detailed record and recovery contracts live in the [v3 specifications](specs/v3/README.md).
