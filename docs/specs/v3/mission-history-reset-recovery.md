# Mission history reset and reconstruction

[Mission](mission.md) | [Shared runtime](runtime.md) | [CLI contract](cli.md) | [Narrow recovery alternative](phases/construction/revision-order-recovery.md)

**Status: Draft for requester review. This proposal has no approval and no implementation.**

This document proposes a general recovery method for mission history. It does not replace an accepted contract.
It preserves the separate revision-order recovery proposal. The requester has not rejected or approved that proposal.
Approval of this document does not authorize implementation, a mission reset, software installation, or deployment.

## 1. Purpose

Permit recovery from different history failures without a separate recovery contract for each software defect.
A known defect number, producer version, valid old projection, or valid old journal prefix is not required.

The requester can select a clean restart or a reconstruction of useful history.
Kepler must preserve available original records locally before it changes the active history.
A skill helps prepare the recovery. Only CLI operations write authoritative records.

Examples include damaged JSON, incomplete writes, missing records, incorrect links, conflicting transitions, unsupported records, and incorrect recorded decisions.
An error in the history-control records can also require recovery.

Recovery changes recorded workflow state. It does not undo code changes, Git operations, deployments, or other external effects.
It can correct records of a decision. It does not authorize a change to the actual work request.
It cannot recover bytes that no longer exist. The manifest must identify known losses and their consequences.
A software defect in the selected reader can still require a software correction or a compatible version.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Mission | One execution context for an identified request and workflow. |
| Generation | One selected set of phase journals for a mission. |
| Reset event | An audit event that selects a new generation in recovery mode. |
| Activation record | The complete audit event that selects the current generation and its mode. |
| Archive | A verified local copy of the available original bytes and recovery inputs. |
| Manifest | A fixed description of a proposed reset or reconstruction. |
| Hash | A calculated value used to detect data changes. |
| Reconstruction | Preparation of a new history from retained records and explicit corrections. |
| Candidate | Draft journals and evidence that have no execution authority. |
| Publish | Make an approved candidate the active history. |
| History version | The exact event ID of the current activation record. |
| Reconciliation | A check of actual workers, ownership, file changes, and other effects. |
| Projection | A calculated view of recorded phase state. |
| Bootstrap facts | Records that establish mission, workflow, workspace, and unit bindings. |

Keep the mission ID. A reset is not a replacement mission.
Keep known unit and artifact identities reserved for their existing owners. Excluding old progress does not free those identities for other missions.
A generation is a history-selection boundary. It is not a stage attempt or another execution floor within an attempt.

## 3. Reset boundary

### 3.1 Use an explicit generation

The reset event records when the reset occurred. Its timestamp is information for people.
Commands must select history by generation and activation identity. They must not select it by timestamp comparison.

This is a deliberate change to the proposed timestamp cutoff.
Clocks can disagree. Separate journals can contain equal timestamps. Good copied records can have dates before the reset.
A clock comparison could exclude required records or include late results from abandoned work.

After reset, normal commands exclude every previous generation from current state calculation.
Only records explicitly reconstructed into the selected generation can establish current progress.
Original dates do not prevent the use of those retained records.

Old history remains available through explicit archive inspection. It cannot become active through an ordinary query or retry.

### 3.2 Select one authority

Add two typed control events: `mission.history-reset` and `mission.history-rebuilt`.
Also add the phase-owned compatibility guard defined in Section 10.
Set `phase` to `mission-recovery`. This shared namespace controls history selection. It is not a new execution phase.
Both events use `envelope_version: 1` and `event_version: 1`. Keep the ten envelope fields unchanged.
Their `data` has exactly `mission_id`, `generation_id`, `manifest`, `manifest_hash`, `requester`, and `decision_reference`.
Each control event requires its corresponding manifest format.
The repeated identities and requester must match the complete manifest. The hash must match its canonical bytes.

A reset names the previous valid control event in `caused_by` when that predecessor can be verified.
Otherwise, it uses `[]` and records the exact superseded raw input in the approved manifest.
A rebuilt event is directly caused by its selected reset event. Archive references do not create causal links.

`mission.history-reset` selects a generation in `recovering` mode.
`mission.history-rebuilt` selects its approved journals in `active` mode.
Derive the mode from the event type. Keep phase progress in phase journals.

This proposal adds an authoritative activation record. It is not a disposable projection.
The record selects journals; it does not contain an independently maintained copy of stage status.
This is an explicit exception to the current rules against a separate state authority.
No existing approval grants that exception.

## 4. Storage and preservation

### 4.1 Portable records

Use these paths under the selected record home:

```text
.kepler/missions/<mission-id>/
  history/
    <phase>/<journal-id>.jsonl
    mission-recovery/<journal-id>.jsonl
  history-control/
    active.json
  history-generations/
    <generation-id>/<phase>/<journal-id>.jsonl
```

The original `history/<phase>/` files remain original history. Never overwrite them to make recovery succeed.
The new `mission-recovery` journals contain immutable control events. Each control operation uses one exact pending event envelope.
Use a fresh journal for each control event. Its journal contains only that event and its line ending.

`active.json` contains the complete selected control event. Its bytes must match its immutable journal record.
Publish this file through one durable atomic replacement. It is the activation point, not a second independent decision.
Retain each previous control event in its journal. Preserve damaged activation bytes in the archive.
Normal readers validate the selected control event and its required reset context before reading phase history.
They must not require excluded control records to pass validation. Never select control by its timestamp or directory order.

The selected generation contains the only phase journals used for current state.
A journal's logical identity includes its generation. Identical journal IDs in different generations do not cause automatic merging.
Within one generation, contradictory copies of one logical journal still cause an error.
Event IDs remain immutable. One event ID must never identify different event content.

### 4.2 Local archive

Keep archives under the record repository's actual Git common directory:

```text
<git-common-directory>/kepler/missions/<mission-id>/recovery/
  archives/<archive-id>/
  pending/
  drafts/<candidate-id>/
```

The archive must include the available mission journals, control records, artifacts, and mission-owned evidence.
Also retain necessary local pending envelopes, recovery instructions, and references to relevant repository checkpoints.
Preserve damaged tails, unsupported records, conflicting copies, and uncommitted journal bytes.
Record each source, relative path, byte length, and hash. Keep an index and the approved manifest with the archive.

Read each backup copy and verify its bytes before activation. A success message or a hash list is not a backup.
If existing bytes cannot be preserved, stop before activation. Declare known missing sources instead of inventing their contents.

Reject paths that escape the selected source roots. Do not follow an unsafe symbolic link or overwrite another archive.
Keep local archives private and preserve access restrictions. Do not add unrelated credentials or host files.
Keep sensitive source contents out of portable manifests and command output.
Do not recursively copy previous archives into a new archive. Record their identities and keep them.

The archive is local preservation, not active workflow authority. The operation must not upload or publish it.
A local archive does not protect against loss of the machine or disk.
Moving or deleting an archive requires a separate explicit decision. Reset does not authorize archive cleanup.

### 4.3 Required evidence and handoff

Retain the evidence needed to validate the new generation independently.
A reference to an unavailable archive must not supply a required approval, check result, or checkpoint.
Copy necessary evidence into a permitted retained location before publication, or leave that progress unaccepted.

A handoff must carry the activation record, its matching control event, selected journals, required compatibility guards, and necessary evidence.
Transfer an old local archive only when the handoff needs it or the requester selects that transfer.
Report an unavailable archive without silently restoring old history or claiming that the archive remains accessible.

## 5. Procedure

### Step 1. Inspect available material

Use a recovery entry point that can read raw mission files without projecting the old history.
It must not require a successful stage query, a current attempt, or a valid old authorization event.

Identify the exact record home and mission ID. Use trusted requester information when damaged history cannot establish the binding.
Record the selected workflow and known unit identities. Do not guess another mission or adopt unrelated files.
List readable files, known missing sources, conflicts, and available supporting evidence.
Inspection must not initialize a home, append an event, acquire ownership, or change mission files.

### Step 2. Establish safe ownership

Stop affected workers through their existing supported controls. Confirm their termination.
Check file changes, candidate changes, repository state, external effects, and affected Integration ownership.
Preserve unrelated work. Do not reset Git, discard changes, or repeat external actions.

Use the existing deadlock recovery procedure if an identified Kepler lock prevents recovery.
Lock age or missing metadata does not prove that recovery is safe.
Reset does not remove a lock, stop a process, or undo a previous effect.
Unresolved ownership or effects must block affected execution. They do not authorize a false completion record.

Hold a mission recovery fence during the reset and publication transitions.
A fence prevents conflicting mission writes across the known cooperating working copies.
Keep durable recovery intent between these transitions. Do not hold a process lock while the requester reviews a manifest.
Other missions can continue when they do not share affected resources.

Establish one effective history version across cooperating working copies. Fence stale copies even when their local activation file remains old.
A local file match alone does not prove current ownership. Verify the shared binding or complete a validated handoff.
Keep that live binding in existing local coordination. It is not another portable source of workflow state.

### Step 3. Preview the reset

Produce a reset manifest from raw available material and the reconciliation report.
Show the history that normal commands will exclude. Show known losses and all expected local effects.
Identify the proposed archive and generation. State that the new generation will start in `recovering` mode.

Preview has no durable effects. Proposed IDs in its output do not create stored events or reserve resources.
The requester reviews the complete manifest, its hash, and the supporting evidence.
An agent statement, previous design approval, or approval of this contract is not permission for this reset.

### Step 4. Apply the approved reset

Obtain the requester's explicit approval of the exact reset manifest.
Under the recovery fence, read the raw sources again and compare them with the approved inventory.
A changed source, new worker, or changed effect requires a new preview and approval.

Create the archive and verify every available source copy.
Retain the exact pending reset and compatibility-guard envelopes before the first authoritative write. Also retain their resolved instructions.
Append `mission.history-reset` and its required compatibility guards. Then publish the matching activation record.
Report the archive reference, generation ID, control event ID, and recovery mode.

Normal commands must now exclude old phase history. Ordinary workflow mutations remain blocked during recovery mode.
Queries must report recovery mode instead of presenting an empty history as a new or completed mission.
No stage starts, approval transfers, or external actions occur during reset.

### Step 5. Reconstruct good history

Build a candidate from the verified archive. Keep candidate files outside active journal discovery.
Select valid records with their required causes and evidence. Validate the selected set together.
A readable JSON line alone does not prove that a record is safe to retain.

A retained event keeps its exact ID, producer, timestamp, payload, and causes.
Keep its original `journal_id` and relative order within its generation-qualified journal.
A reviewed subset can omit damaged portions of the original journal.
Its complete output bytes and source ranges must appear in the reconstruction manifest.

Do not give a retained event a missing cause. Include the necessary record, replace the dependent event, or exclude it.
Do not infer an unknown decision from timestamps, an artifact's existence, or the desired final status.

### Step 6. Correct damaged history

The requester and agent edit the reconstruction manifest, not old journals or active records.
Each available source range must have a stated disposition. A damaged file can have an exclusion for its entire range.

| Action | Required treatment |
| --- | --- |
| `retain` | Copy exact valid event content and identify its source bytes. |
| `replace` | Create a new supported event and identify the damaged source, correction, reason, and evidence. |
| `add` | Create a missing supported event with a stated basis and required authority. |
| `exclude` | Keep the original only in the archive and state its exclusion reason and effect. |

The CLI generates replacement and added envelopes. It uses fresh event IDs and the actual recovery producer and recording time.
Keep domain identities where their meaning is unchanged. Record any required identity mapping explicitly and validate every dependent binding.
It records the source-to-output map in the approved manifest. It must not forge an old producer or change an archived event.
A changed event ID requires correction of every dependent reference in the candidate.

An administrative correction must state what the requester confirms now. It must not claim an unproved historical action.
A new or reaffirmed approval requires an explicit decision for the exact material.
Its action must include that decision reference and the exact material bindings. General permission to publish the candidate is insufficient.
A missing check result requires retained proof of the actual check, or a real check under its normal authority.
Approval of reconstruction alone cannot invent a passed check, completed work, or permission for an external action.

The requester can instead select a clean restart with no accepted prior progress.
The CLI then prepares valid mission and unit bootstrap facts for the retained mission identity.
The manifest states which context the requester confirms now. It does not claim an earlier creation time or completed work.
Keep existing artifacts and code unchanged. Their existence does not approve them or complete a stage.

If some history cannot be recovered, exclude it explicitly and select an earlier safe continuation point.
Recovery does not require reconstruction of every lost event or identification of the original software defect.

### Step 7. Preview and approve reconstruction

The CLI prepares exact candidate journals and validates their complete history with the selected compatible reader.
Check event schemas, identities, causes, ordering, phase rules, approvals, material bindings, and required evidence.
Compare the resulting state with actual files, checkpoints, and reconciled effects.

Show retained progress, corrections, exclusions, unresolved work, and the first permitted continuation operation.
The requester approves the exact reconstruction manifest and candidate hashes.
Edits after that approval require a new preview and approval.

### Step 8. Publish and verify

Under the recovery fence, verify the active reset version, candidate bytes, evidence, and reconciliation conditions again.
Install the candidate journals durably without replacing an existing active journal.
The target generation must contain exactly the approved candidate journals before activation.
Unexpected files or different pending candidate bytes stop publication. Resume the identical publication or obtain approval for a new reset.
Append `mission.history-rebuilt` and publish its matching activation record only after all checks pass.

Read the selected generation through the normal history gateway. Confirm the expected state before reporting success.
No recovery command starts the next stage or performs the continuation operation.
Normal work can resume through its existing commands, approval rules, and verified local ownership.

## 6. Manifest contract

### 6.1 Common rules

Each manifest is strict JSON. Reject duplicate keys, unknown fields, invalid identities, and multiple input objects.
Use full lowercase UUIDv4 identities where Kepler requires them. Keep repository-qualified checkpoint identities.

Use SHA-256 content hashes with the `sha256:` prefix and 64 lowercase hexadecimal characters.
Use the existing canonical JSON convention to calculate the manifest hash.
Sort object keys recursively. Preserve array order and exact string content. Use canonical UTF-8 bytes without added whitespace.
Document deterministic ordering for inventory and action arrays before generating a manifest.

Keep the complete approved manifest with its control event and local archive.
The approval reference identifies an explicit requester decision for that exact manifest hash.
A requester name provides attribution, not authentication. The CLI cannot obtain conversation consent from a name.

### 6.2 Reset manifest

The reset manifest has these fields:

| Field | Content |
| --- | --- |
| `format`, `version` | `kepler.mission-history-reset`, `1`. |
| `mission_binding` | Record-home repository identity, mission ID, selected workflow, request reference, and known unit identities. |
| `previous_control` | Valid control identity when available, and the exact raw control hash or explicit absence. |
| `source_inventory` | Available sources, origins, relative paths, byte lengths, and hashes. |
| `known_missing_sources` | Known losses, their basis, and their consequences. An empty list is permitted. |
| `archive_id`, `generation_id` | Exact proposed local archive and new generation identities. |
| `requester`, `reason` | Decision attribution and the reset purpose. |
| `reconciliation` | Worker, ownership, repository, external-effect, and compatibility findings with retained references. |
| `accepted_limits` | Explicit limits on preservation, reconstruction, or continuation. |

Resolve actual input sources independently. The caller cannot omit available mission material to hide a conflicting record.
Sort source entries by source identity and relative path. Reject duplicate entries for one exact source.
Preserve conflicting source copies as distinct identified inputs. Do not select a convenient copy without disclosure.
Include current control files, previous operations' pending records, and previous-generation sources in the available input set.
Exclude this operation's own proposed archive, drafts, and pending envelopes from its input inventory.
Identify those outputs by their exact retained instructions. Never use this exclusion to hide another operation's records.
Do not require damaged event bodies to pass validation before archiving them.

### 6.3 Reconstruction manifest

The reconstruction manifest has these fields:

| Field | Content |
| --- | --- |
| `format`, `version` | `kepler.mission-history-rebuild`, `1`. |
| `mission_id`, `generation_id`, `reset_event_id` | Exact selected reset context. |
| `archive_id`, `archive_inventory_hash` | The verified reconstruction source and its fixed index hash. |
| `actions` | Ordered retain, replace, add, and exclude actions with source ranges, output identities, reasons, and evidence. |
| `candidate_journals` | Exact phase/journal identities, lengths, hashes, and retained candidate bytes. |
| `required_material` | Exact artifact versions, repository checkpoints, and evidence required by the candidate. |
| `expected_state` | The complete checked phase state and explicit absence of unproved progress. |
| `continuation` | First permitted normal operation, unresolved work, and required approvals. |
| `requester`, `reconciliation` | Decision attribution and current safety findings. |

Order actions by phase, source identity, source offset, and action identity. Record an explicit dependency order for generated events.
Sort candidate journals by phase and journal identity. Reject duplicate or contradictory output identities.
Source ranges use exact byte offsets and lengths. A missing-source action uses its declared loss reference instead.
Every available original history range must have a disposition. Artifacts and evidence remain retained material, not automatic execution facts.
Keep large candidate bytes in retained files with exact hashes. A digest without accessible content is insufficient.
The expected state is a reviewed snapshot, not a mutable progress store. Derive later progress from the selected phase journals.

## 7. Proposed CLI and skill

These commands are proposals. They are not available in the current CLI.
Each command selects `--mission <mission-id>` and the explicit record home through `--project <path>`.

| Command | Purpose and effects |
| --- | --- |
| `kepler recovery inspect` | Read raw inputs, show control state, and report available archives. No writes. |
| `kepler recovery reset` | Preview or apply an approved reset. Apply archives inputs and publishes recovery mode. |
| `kepler recovery reconstruct` | Prepare or check a reconstruction manifest and candidate. Preparation writes draft files only. |
| `kepler recovery publish` | Preview or publish an approved candidate under the selected reset version. |
| `kepler recovery status` | Report exact control identity, partial writes, archive verification, and remaining work. No writes. |

Reset and publish read one JSON object from stdin.
A preview request contains `phase: "preview"` and the complete proposed `manifest`.
An apply request repeats that manifest with `phase: "apply"`, `approved_manifest_hash`, `requester`, and `decision_reference`.
The requester must match the manifest. Apply must independently validate the manifest instead of trusting a supplied hash.

Inspect supplies raw inventory for reset drafting. Reconstruct supplies the initial action list and candidate for publication preview.
Users and skills can edit proposed manifests. They cannot submit arbitrary raw journal bytes as approved facts.

Use the existing structured result envelope and exit conventions.
Return `mission_id`, `generation_id`, `history_version`, `mode`, known partial effects, and `execution_started: false` when applicable.
Errors must identify what changed and what remains uncertain. A failed exit does not prove that no write occurred.

The proposed `kepler-recover` skill explains this sequence and helps prepare the manifests.
It offers a clean restart when the requester does not want to reconstruct old progress.
It asks about uncertain facts, presents differences, and obtains explicit decisions before apply or publish.
It uses CLI operations for every authoritative write. It cannot approve its own plan or bypass a rejected validation.
This draft does not create or package that skill.

## 8. Rules for every CLI history consumer

All mission history consumers must use one generation-aware history gateway.
Select the activation record before parsing phase journals. Otherwise, damaged excluded history would still block recovery.
Ordinary audit queries must expose the selected reset and rebuilt control receipts. Label them as control facts, not phase progress.

| Consumer | Required behavior |
| --- | --- |
| Mission lists, mission queries, and unit lookup | Resolve the selected generation and report recovery mode without parsing excluded generations. |
| Stage, task, Activity, readiness, and completion operations | Use only the selected generation and enforce its current guards. |
| Audit recording and ordinary audit queries | Record or show the selected generation. Excluded events require explicit archive inspection. |
| Startup preparation, resume, and revisions | Respect reset mode and the selected history version before applying saved instructions. |
| Integration, diff packages, and delivery | Bind decisions to the selected history, exact material, and verified current ownership. |
| Handoff, import, and export | Carry generation identity and activation proof. Never merge generations implicitly. |
| Caches and pagination | Bind to the control identity and generation. Reject stale cursors and discard stale derived views. |
| Helpers and skills | Use the same gateway and explicit history version for mission writes. |

After reset, every ordinary mission mutation requires `--history-version <control-event-id>` or the equivalent typed API field.
An absent or stale version must fail before any effect. A fresh automatic read must not silently authorize an old request.
Worker instructions and pending operations must retain this binding. Late workers cannot write to or complete the new history.

With no recovery records, keep the existing legacy mission-history behavior.
With any reset evidence but a missing, damaged, or conflicting activation record, stop normal mission commands.
Unfinished recovery intent also blocks normal mutations, even when the previous activation record remains valid.
Queries can report the pending recovery and last published history version. They must not claim execution readiness.
Do not silently fall back to legacy journals. Use raw recovery inspection and a new approved reset when necessary.

Generic commands that do not consume mission history remain unchanged. Examples include help, version, UUID generation, and artifact lint.
Earlier change-based `workbench` records remain separate. This proposal does not convert or adopt them into a mission.

## 9. Interruption, control damage, and repeated recovery

Save exact pending control and compatibility-guard envelopes before an append or activation replacement. Also save their resolved instructions.
Retain original IDs, producer, recording time, causes, payloads, and journal identity for an identical retry.
Local pending intent is not authority to resume normal work.

If a journal append succeeds but activation does not, keep the mission fenced and report the partial result.
A reconciled identical retry can finish publication of that exact event. It must not allocate a replacement identity.
Match a retry by exact mission, generation, manifest hash, requester, and decision reference.
An existing matching receipt returns its original result after validation. Later valid journal appends do not require another reset.
An identical retry verifies the original approved input snapshot and recognizes its own exact pending outputs.
It must not treat its own writes as changed external inputs or require a new approval for identical completion.
Validate original output prefixes instead of requiring current files to remain identical after later valid work.
Return the original receipt and the current history version separately. Never reactivate an old generation through a completed retry.

Never activate a partial candidate. Keep any previous active history or recovery mode until one complete publication is verified.
A different candidate after a partial installation requires a new approved reset and a fresh generation.
Preserve the failed installation. Do not overwrite it to reuse its generation identity.
Do not truncate uncertain bytes, silently roll back a reset, or report success before rereading the selected history.
If the final reread or lock release fails, report durable effects and the exact unfinished step.

Recovery inspection must also work when the control record or a previous reconstruction is damaged.
Archive that material as raw bytes. The requester can approve a new reset without validating the damaged control chain.
The new control event identifies the exact superseded input hashes. It starts a new control root when no valid predecessor exists.
It must not invent a causal reference to an unreadable or absent event.

To reverse a published recovery, prepare another reset from retained sources and approve a new manifest.
Do not edit a selector, delete a control event, or restore an old file over active history.
Keep every available earlier archive. Do not require an old software defect to be understood before a new reset.

## 10. Compatibility and release conditions

The current CLI has no generation gateway or reset bootstrap path. This proposal requires those changes across all consumers.
A new activation record cannot be treated as an optional extension by a compatible reader.

Before reset, stop clients that cannot honor the recovery fence and generation binding.
A new control namespace alone does not guarantee that an older reader will stop.
The current collector can accept an event from another phase without checking its type.

For Standard, append `construction.history-generation-required` to a fresh journal under the legacy `history/construction/` path.
Set its `phase` to `construction`. Keep envelope and event versions at `1`.
Its data has exactly `mission_id`, `generation_id`, and `reset_event_id`. It is directly caused by that reset event.
The release must prove that supported older Construction readers stop on this required type.
Compatible readers select history first. They do not interpret this legacy guard as phase progress.
Other phases require equivalent tested guards before recovery support is claimed.

Verify the guard before activation and retain it during handoff. Reuse its exact pending envelope after an uncertain append.
A missing required guard blocks activation. Neither a name nor a proposed schema proves older-reader behavior.
Do not claim that arbitrary old executables or disconnected working copies respect a new rule.
Reconcile stale copies before they rejoin. Reject an import that would replace the selected history without an approved recovery.

The release must define its supported reader versions and record formats. Tests must establish the stated behavior.
This contract does not install a CLI, change a loaded session's resources, publish a release, or bypass host deployment policy.

## 11. Required verification for implementation

| Scenario | Required result |
| --- | --- |
| Different old defects, unsupported events, damaged tails, or no valid old prefix | Raw inspection and reset preview work without normal projection. |
| Known missing records or all prior progress excluded | Preserve available bytes, declare losses, and prepare a safe clean restart. |
| Backup failure, input change, or missing manifest approval | No activation. Report copies or pending effects already created. |
| Valid history selection with original dates before reset | Retain exact event content and validate the selected cause closure. |
| Corrections, missing decisions, or missing check results | Require explicit authority and evidence. Never fabricate passed work. |
| Every normal CLI consumer | Read only the selected generation, or report recovery mode. |
| Late worker, stale request, saved startup intent, cursor, or cache | Reject stale history bindings before effects. |
| Append interruption, activation interruption, or failed final reread | Preserve exact intent and bytes. Retry without duplicate control records. |
| Damaged control record or repeated failed reconstruction | Permit a new approved reset from verified raw inputs. |
| Multiple working copies and a stale imported generation | Prevent concurrent publication and implicit history replacement. |
| Restart and handoff | Rebuild current state from portable selected records and retained required evidence. |
| Old reader and selected compatible reader | Prove the claimed stop behavior and generation selection on actual supported versions. |

Prioritize public-contract unit tests. Add fewer real filesystem and coordination integration tests.
Use a small isolated CLI end-to-end suite for reset, reconstruction, correction, interruption, and normal continuation.
Do not use a real user mission as a fixture. Do not add smoke or performance tests through this contract.

## 12. Alternatives and approval scope

| Alternative | Result |
| --- | --- |
| Timestamp cutoff | Simple to describe. Clock differences and retained old dates make selection unreliable. |
| Rewrite or delete old history | Removes original evidence and makes review difficult. Reject this approach. |
| Narrow ordering attestation | Preserves normal history rules with a small exception. It addresses only its defined ordering defect. |
| Generation reset with local preservation | Supports different failures and reviewed reconstruction. It requires a shared gateway and explicit activation authority. |

This draft selects generation reset for review. It preserves the narrow proposal as a separate alternative.

Approval would accept the generation boundary, local preservation, activation events, reconstruction authority, manifest decisions, and common CLI guards.
It would also accept generation-qualified journal identity and the new activation-record exception to current shared rules.

Reset approval and reconstruction approval are separate decisions for an actual mission.
New work, new artifact approvals, external operations, implementation, release, and host changes retain their separate permission requirements.
Drafting permission covers only this proposal.
Preserve existing proposals, accepted specifications, mission files, installed resources, and application code.
