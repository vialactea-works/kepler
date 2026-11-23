# Mission-history recovery commands

This reference describes the development source contract. It does not announce a release or authorize an operation on a mission. Check the selected CLI and matching resources before use. The dated generation-migration guide is **released from 3.2.0**. Its status does not replace the matched-package checks or exact operation approval.

Use these commands when generation selection, damaged history, or a deprecated phase layout prevents normal work. Use [ordinary recovery operations](recovery-operations.md) for an interrupted startup, stage, Activity, Integration, or delivery operation that retains valid history.

## Scope and authority

```text
kepler recovery inspect --mission <mission-id> [--project <record-home>]
kepler recovery status --mission <mission-id> [--project <record-home>]
kepler recovery migrate --mission <mission-id> [--project <record-home>]
kepler recovery reset --mission <mission-id> [--project <record-home>]
kepler recovery reconstruct --mission <mission-id> [--project <record-home>]
kepler recovery publish --mission <mission-id> [--project <record-home>]
```

Select one full lowercase UUIDv4 mission ID and its exact record home. Project selection defaults to the invocation directory. Duplicate selectors fail. The four mutation commands read one bounded strict JSON object from stdin. They accept no replacement journal text or arbitrary command to execute.

Contract approval permits implementation. It does not approve an operation manifest, a reset, changed facts, source retirement, software installation, release, or deployment. Obtain the requester's separate explicit decision for each exact operation. Keep the original request and decision bytes.

Requester and worker names provide attribution. They do not authenticate a person or prove consent. A reference, digest, boolean, timeout, or missing response does not prove that a worker ended, a check passed, or an external effect was reconciled.

## Inspect before a change

```bash
kepler recovery inspect --project "$PROJECT" --mission "$MISSION"
kepler recovery status --project "$PROJECT" --mission "$MISSION"
```

Both commands inspect raw mission material without a workflow projection prerequisite. They report:

- Complete source identities, paths, lengths, hashes, and unavailable inputs, without source contents.
- Local control records, shared selection, validated history version and generation, or a blocked selection.
- Legacy layout and `migration_required` conditions.
- Verified archives, pending instructions, drafts, issues, and remaining work.

Inspection does not acquire a mutation claim, prepare a recovery, change selection, or start execution. A local selector is not authority until the gateway validates its receipts, guard, generation, and shared binding. An inspection report is advisory; the operation must recheck its inputs under its own fence.

## Compatible clients

Before migration, reset activation, or reconstruction publication, inventory affected clients, adapters, automations, runs, and known working copies. Stop incompatible or unverified clients through their supported controls. Confirm terminal runs, reconcile effects, and repeat the real client-state check before apply. Static evidence cannot detect an unsupported client restarted outside Kepler.

The lead report must retain exactly one `kepler.history-client-compatibility` document with purpose `history-client-compatibility`, plus exact supporting source hashes. Reset and publication bind those references through their existing reconciliation fields. Publication also binds them in required evidence. Migration uses its fixed lead-report path and approved source inventory; initialization gains no new field. See [Client compatibility evidence](../recovery-client-compatibility.md) for the full strict contract.

Protocol status and operational state are separate. A compatible client can be stopped. A client with an unknown build stays unverified and stopped with a null identity; a placeholder or version label cannot establish support. External references can coexist with known run or origin associations. Unregistered quiescent copies need explicit retained scope evidence, not invented physical origins or write authority.

The pinned legacy Kepler 3.1.0 build `d2a9f5037c227765818e220443f426303bef4b45` does not enforce the generation guard. It can return an incorrect empty projection or append deprecated journals. Keep it stopped; another build cannot be classified from `3.1.0` alone. Only an actual compatible client can use verified preparation and captured-version fencing.

## Manifest preview and approval

`migrate`, `reset`, and `publish` use the same request envelope. Put a complete operation-specific manifest in the `manifest` field.

Preview:

```json
{
  "phase": "preview",
  "manifest": {}
}
```

The empty object above marks the manifest position; it is not a valid manifest. Use the typed contracts listed below. Preview is read-only. It returns the validated manifest and its canonical `manifest_hash`. Present the complete manifest, affected sources, limitations, and proposed effects to the requester.

Apply the exact approved manifest:

```json
{
  "phase": "apply",
  "manifest": {},
  "approved_manifest_hash": "sha256:<64 lowercase hexadecimal digits>",
  "requester": "<exact manifest requester>",
  "decision_reference": "<retained explicit decision>"
}
```

Do not replace the digest or requester with a boolean. Changed input, manifest, guide bytes, or decision scope requires another preview and decision. These commands do not accept an implicit current-history version in place of the captured control and source bindings.

Canonical manifest hashing sorts object keys recursively. It preserves arrays and strings. A digest starts with `sha256:` and has 64 lowercase hexadecimal digits. Use the preview's result rather than hashing a formatted display copy.

## Healthy layout migration

`migrate` accepts a `HistoryInitializationManifest` with `operation: "migrate"`. It binds the mission, complete original inventory, matching released guide and exact guide hash, archive, target generation, candidate journals, unchanged expected state, and exact source retirement.

The only recognized guide reference is:

```text
resource:skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md
```

The executing binary must have a matched resource package. The guide must have a supported source/target transition, `status: released`, and an available version no later than the executing release. An editable copy, a version string, or guide release status alone cannot authorize migration. Production binaries do not accept a package-root override.

A healthy migration preserves exact envelopes, causes, original journal order, and derived workflow state. It does not correct or discard facts. Semantic corrections require reset and reconstruction decisions. After verified preservation and selection, retire only unchanged approved direct-phase sources. Unknown, changed, or uncertain retirement inputs keep the operation incomplete and fenced.

## Reset to a recovery generation

`reset` accepts a `HistoryResetManifest`. It binds:

- Mission repository, mission ID, workflow, original request reference, and known unit identities.
- Exact previous control bytes, or an explicit unavailable-control boundary.
- Complete raw source inventory and each known missing source with reason and consequences.
- Archive ID, new generation ID, requester, reason, accepted limits, and exact retirement inputs.
- Lead reconciliation, affected run references, retained supporting evidence, and actual ownership/effect status.

Existing unreadable or unsafe bytes are not missing material. If the operation cannot preserve them, it stops. A known-loss declaration cannot excuse readable but changed input or an unreadable existing file.

Retain a canonical `HistoryLeadReconciliationReport` at:

```text
.kepler/missions/<mission-id>/recovery/reconciliation/reset-<generation-id>.json
```

The report binds the exact mission, prior selection, target generation, original inventory excluding its own bytes, retained evidence hashes, affected workers, reconciled effects, and unresolved or unknown conditions. The manifest references the actual report through its exact `snapshot:<source-id>` identity and required report purpose. Boolean reconciliation fields alone do not satisfy the production verifier. Unsupported worker or effect evidence remains a blocker; the CLI does not terminate a worker.

Reset preserves and reads back the archive before selection. It selects an empty **recovering** generation. Normal mission mutations stay blocked. Reset does not approve replacement facts, preserve progress by assertion, or start the next stage.

## Prepare and check a reconstruction

`reconstruct` uses one of these strict envelopes:

```json
{
  "phase": "prepare",
  "candidate_id": "<UUIDv4>",
  "plan": {}
}
```

```json
{
  "phase": "check",
  "manifest": {}
}
```

Use a complete `ReconstructionPlan` or the exact prepared `HistoryRebuildManifest`, respectively. `prepare` writes a private draft outside active discovery. It returns the manifest and hash, state, action counts, and material bindings. It does not return journal bytes or publish history. `check` rereads the retained draft and its actual inputs; it does not approve or activate it.

The plan binds the selected reset, computed complete archive index, every history-source disposition, explicit action dependencies and reference mappings, required material, requester, lead reconciliation, and a typed next operation. Use `recovery.inspect` as a read-only continuation when no workflow mutation is ready. The verifier checks a continuation without executing it.

Retain original events byte for byte. Give replacements and additions fresh identities, explicit authority, and actual proof where their owner requires it. Do not invent passed checks, approved artifacts, completed work, causal links, or acceptance from a summary. A consistent projection alone does not prove that a check ran.

A clean restart must reconfirm the mission selections and preserve the known unit identities. Its generated bootstrap facts require a retained exact clean-restart decision. The `HistoryAuthorityDocument` binds the requester, decision, exact action or clean-restart input hash, and supporting material. Place that document and its exact hash in `required_material.evidence`. Do not create an approval document without the requester's actual decision.

Preserve the exact original request string. An unchanged context or event alias is not text proof. A supported creation in verified raw archived bytes can establish the text without a healthy old projection. If the original is unavailable or conflicting records need correction, include the strict `HistoryOriginalRequestDocument` and its exact hash in required evidence. Its `decision_reference` must resolve to the canonical requester statement and exact source hash defined in [Original-request evidence](../recovery-reconstruction-evidence.md#exact-original-request). Generic action or restart approval is insufficient. Rendering the statement supplies no requester consent or authentication. Independent draft replay repeats this check before publication.

Required material must resolve to actual snapshot bytes, a verified archive source, or a repository-qualified committed blob. Required commits and artifact content must exist in the actual prepared repositories. Missing proof remains a failed check; no permissive production verifier supplies a success receipt.

## Publish the exact checked candidate

`publish` takes the preview/apply envelope and exact checked rebuild manifest. Obtain a decision separate from reset approval. Retain a lead report at:

```text
.kepler/missions/<mission-id>/recovery/reconciliation/publish-<generation-id>.json
```

Bind the report's exact bytes in `required_material.evidence`. Its inventory excludes its own bytes and the exact selected compiler output, not arbitrary pending or draft files. Preserve changed or unknown material.

Publication validates the selected reset, draft, complete candidate, owner evidence, required material, and read-only continuation under the recovery fence. It publishes all required control records, compatibility guard, journals, and selector, then verifies the resulting selection. It does not execute the continuation or authorize an external action.

## Retry and partial effects

Preserve exact pending instructions, fixed identities, original inputs, verified archives, and observed partial outputs. Retry the same approved request only after inspecting status and actual effects. Never rewrite, truncate, or replace an envelope to make a retry appear clean.

An interrupted operation recognizes only its exact verified outputs. Contradictory bytes, unknown owners, incomplete preservation, or uncertain retirement remain fenced. Do not delete an intent or claim by hand.

A completed retry returns its original `receipt` separately from the current `history_version` and generation. It must not restore the old selector, discard later facts, or drop joined origins. A selected reset supersedes pending sources only through exact approved source identities and bytes; a historical reset cannot hide restored or changed pending input.

`execution_started: false` means that recovery did not dispatch a stage, task, or worker. Apply and draft preparation can still create files or record partial effects. Read the error details and retained status before retrying. A nonzero exit does not prove that no change occurred.

## Normal work after publication

Read the validated selected version and pass it explicitly as `--history-version <control-event-id>` for ordinary mission mutations, including audit, stage/task/Activity operations, revision, Integration, and project diff-package output. Preserve that version with the request's original inputs. Do not refresh an old request's version implicitly after recovery.

All normal readers select control before loading phase bytes. Legacy history is read-only. Recovery and unresolved pending instructions fence mutations. A copied record home must complete a validated ownership/history join before it can write. Use [`mission prepare --history-version`](mission.md#join-or-settle-selected-history) to join or settle the exact selected history. Add repeatable `--transfer-origin` values only for exact unavailable bound origins. Full-current source settlement and explicit missing-origin transfer are separate from copying an initial publication prefix. They do not relocate prepared workspace ownership.

## Contract sources

- [Accepted general contract](../specs/v3/mission-history-reset-recovery.md).
- [Manifest types and validators](../../packages/cli/src/history/control.ts): `HistoryInitializationManifest`, `HistoryResetManifest`, `HistoryRebuildManifest`.
- [Reconstruction plan](../../packages/cli/src/history/reconstruction.ts): `ReconstructionPlan`.
- [Lead reconciliation report](../../packages/cli/src/history/reconciliation.ts): `HistoryLeadReconciliationReport`.
- [Retained action and progress proof](../../packages/cli/src/history/reconstruction-evidence.ts): `HistoryAuthorityDocument` and owner proof contracts.
- [Client compatibility evidence](../recovery-client-compatibility.md) and [strict client types](../../packages/cli/src/history/client-compatibility.ts).
- [Original-request evidence](../recovery-reconstruction-evidence.md#exact-original-request) and [strict assertion/statement contract](../../packages/cli/src/history/original-request.ts).
- [Strict CLI envelopes](../../packages/cli/src/cli/recovery-execution.ts) and [operation requests](../../packages/cli/src/history/operations.ts).
