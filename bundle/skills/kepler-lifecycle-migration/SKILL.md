---
name: kepler-lifecycle-migration
description: Plan and apply documented Kepler lifecycle migrations. Use after a Kepler upgrade or when records use deprecated layouts or contracts.
---

# Migrate Kepler lifecycle records

Use a dated migration guide to advance deprecated Kepler files or contracts.
Keep the work request, mission identities, original bytes, and unrelated work intact.
This skill does not add a workflow stage or grant migration permission.

## Select the migration

1. Read repository instructions and inspect Git status. Confirm the exact record home and requested scope.
2. Inspect the selected CLI version and matching resource manifest. Check available commands through read-only help.
3. Select an applicable guide from the catalog below. Read the complete guide before proposing changes.
4. Compare its source format, target format, release status, prerequisites, and required capabilities with the actual records.
5. Report mismatches or unavailable capabilities. Do not select a migration only because its date is the latest.

| Migration | Status | Scope |
| --- | --- | --- |
| [2026-11-13: mission history generations](referenses/migrations/2026-11-13-mission-history-generations.md) | Released from 3.2.0 | Direct phase journals to generation-based mission history. |

Read only the guides that apply. Chain migrations in their documented dependency order.
An installed skill or newer CLI version does not prove that a particular migration is supported.

## Check authority and support

A `planned` guide permits inspection and planning only. Stop before migration writes, even if the requester wants to apply it.
A `released` guide must identify its supporting release and exact executable procedure.
Verify those capabilities in the selected CLI. A matching version string alone is insufficient.
For generation-based mission history, verify the actual build or adapter supports `mission-history-generations/v1`, selected-generation reads, captured-version mutations, whole-invocation fencing, and verified preparation. An older-reader guard does not make an unsupported executable safe.

Ask for software installation or version-selection authority when necessary. Do not install a CLI or change a loaded resource home implicitly.
Keep earlier change-based `workbench` records separate. Do not treat them as mission history without an applicable released guide.

## Prepare the plan

Confirm affected workers have stopped. Reconcile locks, file changes, checkpoints, pending writes, and external effects.
Preserve uncertain bytes. Silence, elapsed time, or a failed command does not prove that work stopped.

For generation-based history, inventory ordinary clients, SDK adapters, automations, affected runs, and known working copies, including external or offline copies. Stop incompatible or unverified clients through their supported controls. Retain the guide's exact compatibility evidence and source material. Keep those clients stopped until an actual compatible client can complete verified preparation. Do not invent an origin ID for an external copy or claim that static evidence detects a client restarted outside Kepler.

Use the guide's read-only inspection and preview procedure.
Prepare a manifest that binds the guide hash, source inventory, target format, exact operations, backup, and expected results.
Include known losses, cleanup actions, verification, and interruption handling. Report which steps need separate authority.

Present the complete manifest and differences to the requester. Obtain explicit approval of its exact hash before applying it.
A contract approval, release announcement, or previous migration approval does not approve changed inputs.

## Apply and verify

Apply only a released guide through its supported operations and within the approved scope.
Recheck the source inventory, guide hash, ownership, and approved plan before the first change.
Repeat the real client-state check before apply or resumed publication. Retained evidence bytes do not prove a stopped client stayed stopped. An exact completed historical retry must not stop later valid work or reactivate an old selection.
Verify the retained backup before moving or replacing any deprecated source.

Use CLI-owned operations for journal, control, and lifecycle changes. Do not rewrite, truncate, or move journals by hand.
A guide can permit mechanical changes to other files only with exact paths, preservation rules, and explicit operation authority.
Do not invent commands or use an undocumented fallback when a supported operation fails.

Follow the guide's retry procedure with original identities and retained intent.
Inspect partial effects before retrying. Keep the operation blocked when its completeness or ownership remains uncertain.

Verify the new format, expected workflow state, retained original bytes, and deprecated-source disposition.
Do not leave parallel writable layouts or claim success while required cleanup or verification remains incomplete.
Migration does not start a stage, approve an artifact, or authorize publication, deployment, or unrelated cleanup.

## Report the result

Report the selected guide and hash, CLI/resource version, source and target formats, and exact affected scope.
Include the manifest decision, backup reference, completed operations, verification, partial effects, and remaining blockers.
For a planned migration, state that no migration occurred and identify the missing runtime support.
Report whether existing work can continue under its currently supported contract. A planned guide alone does not block healthy work.
Return the next supported action to the requester or owning skill. Do not claim a migration from changed files alone.

## Maintain the catalog

Keep migration guides in `referenses/migrations/<YYYY-MM-DD>-<migration-name>.md`.
Each guide must describe the contract change, applicability, release status, prerequisites, executable steps, preservation, verification, and interrupted-operation handling.
List each guide in this catalog. Keep its source and target formats explicit.
Mark a guide `released` only when its operation exists and its required verification has passed.
