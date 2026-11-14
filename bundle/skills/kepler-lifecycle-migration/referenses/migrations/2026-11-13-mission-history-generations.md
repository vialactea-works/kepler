---
migration_id: 2026-11-13-mission-history-generations
status: planned
available_in: null
source_layout: mission-phase-journals
target_layout: mission-history-generations
---

# Migrate mission history to generations

[Lifecycle migration skill](../../SKILL.md)

## Status and applicability

**Planned. No supporting release is selected for this guide.**
The development source implements generation recovery and a release-gated migration command. That source does not make this guide operational.
This guide permits inspection and a migration proposal. It does not permit manual conversion. The general recovery contract is accepted; each actual operation still needs its exact separate decision.

Apply this guide to version 3 missions with journals directly under `history/<phase>/`.
It does not apply to earlier change-based records, host configuration, or unrelated data.
Do not infer a source format from the directory name alone. Inspect the selected CLI and actual records.

Before release, this guide must identify its supporting version, exact commands, request fields, and verified retry behavior.
Keep `status: planned` until those prerequisites exist. Do not replace them with guessed commands.

## Contract change

The target format gives every phase journal a generation context.
Normal readers select the active generation before parsing phase journals. A timestamp does not select history.

Direct `history/<phase>/` directories become deprecated migration inputs.
New missions write phase journals only under `history/generations/`. Upgraded writers must not create or append direct phase journals.
A mission in the old format requires migration before ordinary mutations can continue.
Read-only inspection can report its existing progress and `migration_required` condition.

Target layout:

```text
.kepler/missions/<mission-id>/
  history/
    control/
      active.json
      events/<journal-id>.jsonl
      <guard-journal-id>.jsonl
    generations/
      <generation-id>/<phase>/<journal-id>.jsonl
```

The reserved `control/` and `generations/` directories are not phases.
The control directory contains activation records, control-event receipts, and required older-reader guards.
Guard files belong to control handling. They must not recreate a deprecated phase directory.

The directory supplies generation identity without changing retained event bytes.
A detached journal needs that identity in its export metadata or filename.
The migration must preserve event identities, content, causes, and original journal-relative order.

## Preconditions

1. Confirm the exact record home, mission ID, source layout, selected CLI, and matching resources.
2. Verify that a released operation implements this migration and the target reader is available.
3. Confirm affected workers have stopped and reconcile ownership, pending writes, checkpoints, and external effects.
4. Identify every available source, known loss, conflicting copy, and required piece of evidence.
5. Obtain approval for the exact migration manifest, including local preservation and retirement of deprecated paths.

While this guide remains planned, stop after inspection and planning. Do not execute the remaining target procedure.

## Target procedure for the supporting release

### 1. Inspect and preview

Confirm that the selected release provides `kepler recovery inspect` and `kepler recovery migrate` with exact mission and project selectors. Run `kepler recovery inspect --mission <mission-id> --project <record-home>` to inspect available raw files. Do not apply this planned guide.

In the supporting release, `migrate` reads one strict JSON request on stdin. Preview uses `{ "phase": "preview", "manifest": <complete manifest> }`. Apply uses `"phase": "apply"` with `approved_manifest_hash`, the exact `requester`, and a retained `decision_reference`. The manifest binds the resource reference `resource:skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md` and its actual guide hash. The CLI must verify the matched resource package, released status, and supporting version before migration.

Prepare a manifest that binds this guide's hash, source inventory, target generation, archive, and expected workflow state.
Include the proposed control records, older-reader protection, source retirement, and all known limitations.

The requester must see which files will move and which current facts will remain unchanged.
A healthy format migration must preserve the derived workflow state. It must not infer new approvals or completed work.
If the source requires semantic corrections, stop this format migration and request a separately approved recovery plan.

### 2. Preserve the originals

The supported operation creates a private local archive under the record repository's actual Git common directory.
Preserve source bytes, uncommitted records, damaged material, required evidence, control inputs, and pending instructions.
Read the copies and verify their lengths and hashes before publishing any replacement history.

A digest list or a Git commit alone does not preserve uncommitted or damaged bytes.
Keep source paths and identities in the archive index. Record known missing material instead of inventing it.

### 3. Prepare and validate the generation

Copy the complete validated history into the proposed generation through the supported operation.
Retain existing event envelopes exactly. Preserve original phase ownership and cause relationships.
Verify event closure, ordering, material bindings, required evidence, and the expected workflow state.

Stage candidate journals outside active discovery until publication.
A partial copy is not an active generation. Existing artifacts and code must remain unchanged.

### 4. Publish the selection

Under shared coordination, recheck the approved inputs and actual ownership.
Publish the exact control records and activation selection through the supported operation.
Verify that normal readers select only the new generation.

Verify the required older-reader protection. Do not assume that an unknown phase makes an old reader stop.
Do not install, select, or invoke unsupported older software against live records as a test.

### 5. Retire direct phase directories

After verified publication, retire only the exact deprecated source paths listed in the approved manifest.
Keep their complete original bytes in the verified local archive. Do not leave a second writable history tree.
The operation must reject changed source bytes or unknown files rather than deleting them.
Exclude `history/control/` and `history/generations/` from retirement. Never remove the history root.
Remove a legacy directory only after its approved files are preserved and no unknown entries remain.

The installed release must perform this retirement through its supported operation.
Do not substitute `mv`, `rm`, a hand-edited selector, or a journal rewrite.
A cleanup failure leaves migration incomplete. Preserve its intent and report the remaining paths.

### 6. Verify and report

Confirm that the target generation has the approved journals and unchanged workflow state.
Confirm that deprecated direct phase directories no longer remain as active or writable sources.
Verify the local archive and accessible required evidence. Recheck that ordinary mutations cannot use the legacy format.

Report the control identity, generation, archive reference, retired paths, manifest decision, and verification results.
Do not start the next stage or repeat an external action as part of migration.

## Interruption and later migration

Keep exact pending envelopes, original operation identities, approved manifests, and observed partial effects.
Use `kepler recovery status --mission <mission-id> --project <record-home>` to inspect retained state. Retry the same exact apply request only after reconciling its actual effects. Never allocate replacement records to conceal an uncertain append.

A published generation with unfinished source retirement is a partial migration.
A retry must verify its original archive and finish only the missing approved steps.
Changed inputs require a new plan and approval. A completed retry must not reactivate an older generation.

Preserve conflicting copies and damaged bytes. If format-only preservation is impossible, propose the separate history-recovery procedure.
Migration does not authorize reset, reconstruction of decisions, rollback of code, or deletion of unrelated files.

## Required release evidence

The supporting release must demonstrate a successful migration through its public CLI in an isolated environment.
It must preserve original bytes and workflow state, reject stale writers, and handle interruption before and after activation.
It must also prove that source retirement cannot remove changed or unapproved files.
Resource packaging checks alone do not prove these behaviors.
