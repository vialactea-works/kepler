---
name: kepler-resume
description: Inspect or safely continue an interrupted Kepler v3 Standard mission. Use when asked what is next, when an agent session is lost, or when startup, a stage, a task, Integration, or delivery stops unexpectedly.
---

# Inspect or recover Standard work

Developer prompt: “Use kepler-resume to inspect this mission/unit in this record home; report current state and the next skill prompt. If recovery is needed, reconcile partial effects and hand it back to the owning role.”

This skill is a read-only navigator when asked only to inspect. For recovery it may perform safe reconciliation and the existing authorized operation after checking its owner and prerequisites. It never executes the whole workflow or changes the CLI state model. Read the [packaged agent operations](../kepler-mission-startup/references/agent-operations.md) and [CLI walkthrough](../kepler-mission-startup/references/standard-cli-walkthrough.md) for request forms; these are agent resources, not developer instructions.

## Locate exact scope

1. Confirm the record home and CLI/resource version. Ask for the original mission ID if startup failed before a unit could be recorded and it cannot be found in accessible saved facts. No public mission list/show/status command exists. Do not recreate a mission to discover its ID.
2. Run `kepler workflow construction unit list --project <record-home>` and, for the selected unit, `unit show --unit <unit-id> --project <record-home>`. When several units match a description, ask which one the developer means. Never choose from a branch name or stale chat context.
3. Inspect the selected `stage show` for all stages relevant to the blocker; for Implementation use `task list`, `task show`, `task ready`, and `activity show` with exact parent attempt IDs. Use `kepler audit list --unit <unit-id> --fields type,data --limit 100 --project <record-home>` with cursor pagination and `audit show` to recover original start inputs/event IDs when necessary. Check current artifacts, Git checkpoints, host worker sessions, locks and external effects as applicable. A successful query does not establish progress; read the derived state, blockers and unknowns.
4. Report what is completed, unstarted, running, paused, blocked, or unknown, with supporting IDs and evidence; identify the owning skill and next copyable prompt. If Deliver is complete and verified, report its handoff. Do not repeat it.

## Deprecated formats

If the selected release reports a deprecated format, hand the request to `kepler-lifecycle-migration`.
It checks the dated guide, runtime capabilities, preservation, and migration authority.
Do not convert formats as an ordinary resume step. A planned migration guide does not permit writes.

## Inspect history selection

When normal history loading is blocked, use `kepler recovery inspect --mission <mission-id> --project <record-home>` and `kepler recovery status` with the same selectors. These commands inspect raw bytes and retained operations without changing history. They do not prove ownership, worker termination, or permission for reset.

For ordinary mutations, retain the exact validated `history_version` and pass `--history-version <control-event-id>` with the original request. Carry the selected generation and version in worker handoffs. Stop on a changed version, recovering selection, pending instructions, or an unjoined copy. Do not refresh an old request to bypass a guard.

For a copied history or unsettled current inventory, use `kepler mission prepare --mission <mission-id> --project <record-home> --history-version <control-event-id>`. Use repeatable `--transfer-origin` only for exact unavailable bound origins backed by complete settled proof. This validates actual workspace ownership and required material; it does not relocate a prepared workspace or replay startup effects. Preserve blocked owner or material conditions.

A damaged-history reset or reconstruction is a separate requester-owned operation. Report the raw evidence and required decisions, then use only the compatible CLI's exact preview, approved manifest, retained proof, and retry contracts. This navigator does not infer recovery authority from the original work request. Keep planned lifecycle migration separate.

## Resume safely when requested

- **Preparation:** confirm the original startup operation ended and its exact mission ID and record home are known. Reconcile saved workspace choices, partial branch/worktree effects, and attachment state. Use `kepler mission prepare --mission <original-id> --project <original-home>` for missing preparation; never repeat `mission create`. A historical preparation response omits local workspace bindings and does not prove readiness. If a mission has no unit, hand off to `kepler-mission-startup` for guarded unit creation. Reconcile a lost `unit create` response through unit inventory and history before trying again.
- **Stage or Activity:** confirm exact prior worker termination rather than inferring it from silence or timeout. Preserve same unended attempt and exact original `reference`/`purpose` start inputs. A pause request alone does not stop an agent. Acknowledge only after confirmed termination and effect reconciliation, then resume the same acknowledged paused attempt with its original inputs. Resume records state but does not dispatch a worker; the host must dispatch its owning skill separately. A failed command alone does not create a new attempt.
- **Tasks and Integration:** inspect task admission, Generation/Validation context identity and evidence, current lock token, captured target, prepared candidate, check bindings and actual accepted target. Do not accept on stale/failed evidence, force release a lock, retarget to a newer HEAD, or repeat an uncertain acceptance. A post-accept release failure may already have accepted material; reconcile history and target. The existing Integration-only retry stays in the same attempt under lock. Return work to `kepler-orchestrate`, `kepler-code`, or `kepler-code-feedback` according to the owning scope, without substituting a new reviewer for an author.
- **Revision:** determine earliest affected stage from evidence, stop affected workers, reconcile locks/effects, and have the orchestrator authorize the existing `revise` operation. Do not reopen a later stage as a shortcut for a changed earlier obligation. Preserve retained-scope bindings and require new approval only for current revised material where the contract requires it.
- **Deliver:** inspect exact requested outcome, permissions, operation records and external state. A failed/absent response may follow real remote effects. Do not repeat a non-idempotent operation or silently substitute local handoff. Hand off to `kepler-finish-work` only after confirming authority and the first unverified safe step.

If a conflict, unknown owner, unavailable original input, or missing permission prevents a safe next operation, preserve all evidence and ask for the minimum missing fact or authorization. Never use manual reset, deletion, cleanup, overwrite, or journal/projection edits as an ordinary resume operation. Report the precise blocker and the next skill prompt rather than telling the developer to run Kepler CLI commands.
