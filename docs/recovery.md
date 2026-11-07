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

The CLI does not provide a global status command. Use the owning stage, task, Activity, audit, or integration operation for the scope you are recovering. Workers do not authorize their own scope changes. An unrelated unit can continue only when its inputs, contracts, and resources remain independent.

## Interrupted installation or setup

The installer and `kepler setup` manage different parts of installation. Setup preserves user-modified resources and reports necessary-path conflicts. If setup reports a conflict or interrupted update, keep the existing files and installation receipt. Inspect the paths named in the failure and compare them with the selected compatible sidecar. Do not delete unknown files, hand-edit the receipt, or force an overwrite. If the current generation cannot be verified, do not start new work with it; keep active work with the generation that created it and obtain an authorized repair decision.

If setup reports `invalid_bundle` with a missing required v3 template, obtain the complete compatible sidecar. Extra templates, placeholders, or a recalculated digest do not supply the missing resource. Rejected setup does not change the existing Kepler resources, settings, or receipt.

Host skill managers own skill installation, and Claude Code owns native role loading. Check their own installation results separately. A successful `kepler setup` result does not show that the host loaded a skill or agent definition.

## Earlier change-based work

`kepler workbench` belongs to the earlier change-based workflow. Use its matching generation and artifacts for that work. Kepler does not convert legacy change artifacts or history into mission-owned version 3 records. Keep the old records intact; do not resume them through v3 Construction commands.

For command syntax, see the [CLI guide](cli.md). The detailed record and recovery contracts live in the [v3 specifications](specs/v3/README.md).
