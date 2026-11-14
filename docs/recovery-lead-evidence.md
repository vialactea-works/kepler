# Lead reconciliation evidence

The history reconciler validates retained evidence supplied by the stage lead. It does not terminate workers, query worker controllers, inspect a provider backend, authenticate the lead, or prove that the lead's statements are true. The lead must use its available controls to confirm that every affected run has ended and to reconcile file, repository, external, and integration-lock effects. Kepler checks the report's scope and bytes, the physical record-home repository, and discoverable local coordination claims. It keeps those checks separate from lead-attested facts.

## Lead and worker obligations

The stage lead owns the stage outcome. It can do the work directly or assign bounded work to available workers, subject to the workflow's independent validation rules. Kepler does not select or control the worker implementation.

The lead must give each worker the mission, unit, stage or Activity attempt, selected history version, permitted scope, expected outputs, and stop conditions. The worker must honor that scope and version. It must report its actual result, retained output references, file and external effects, and unresolved work. A worker must not infer approval or completion from its own role name.

Before recovery, the lead must identify affected runs, use its available controls to stop them, and confirm termination. Sending a cancellation request is not confirmation. The lead must then reconcile effects and retain the evidence used for each assertion. Unknown termination or effects block recovery. When no worker was dispatched, the lead records an empty affected-run list and still supplies scope evidence.

## Report

Use `kepler.history-lead-reconciliation`, version `1`. Store one canonical JSON object followed by one LF at this path in the selected record-home working copy:

```text
.kepler/missions/<mission-id>/recovery/reconciliation/<operation>-<generation-id>.json
```

`<operation>` is `reset`, `migrate`, or `publish`. The report contains exactly these fields:

| Field | Contract |
| --- | --- |
| `mission` | Exact `mission_id`, `record_home_repository_id`, `workflow`, and `request_reference` from the mission binding. |
| `prior_history` | `null` if no prior selection can be verified; otherwise its generation, control-event ID, and hash of the exact activation bytes. |
| `target_generation_id` | The proposed manifest generation. |
| `attribution` | Nonempty `orchestrator` and `lead` names. Reset and publish must match the manifest orchestrator. Attribution is not authentication. |
| `original_inventory`, `original_inventory_hash` | The complete sorted inventory of readable inputs, excluding this report and, for publication, only the exact selected compiler output described below. The hash is SHA-256 of canonical JSON for that list. Reset `known_missing_sources` binds exact declared missing-source references separately; it does not make unreadable or unsafe inputs valid. |
| `scope_evidence_references` | At least one retained material reference supporting the reconciliation, including when no worker was dispatched. |
| `affected_workers` | Exactly one entry for each manifest run reference. Each entry has `terminal_confirmation.outcome: "terminated"`, `confirmed_by` equal to the lead, and at least one retained evidence reference. A zero-worker report uses an empty array. |
| `materials` | Sorted, unique references with purpose and SHA-256 content version. Each source must contain readable, nonempty bytes. |
| `effects` | `files`, `repositories`, and `external` arrays. Each stated effect requires retained evidence. `local_claims.outcome` must be `"clear"`; Kepler also checks known local claims independently. |
| `unresolved_items`, `unknown_items` | Both arrays must be empty. |

All object fields are required; unknown fields, duplicate JSON keys, duplicate source identities, duplicate references, and noncanonical report bytes are rejected. Every evidence reference in a worker or effect must name an entry in `materials`, and every material must support at least one report assertion. The report does not carry check results or imply that code checks passed.

## Portable references

The only material-reference form is:

```text
snapshot:<source_id>
```

`<source_id>` must exactly identify one file in the supplied `HistorySnapshot`, in the form `<origin-id>:<safe-relative-path>`. The path must remain inside the selected mission's portable or private snapshot scope. Kepler resolves the origin through the verified repository context and rereads the exact bytes. Absolute paths, `file:` URLs, `..` traversal, aliases, arbitrary host files, and provider-specific references are not accepted. The report itself must use its canonical mission-local path above; it cannot be referenced as an archive or by an alias.

A reset or migration report's `original_inventory` must equal the operation's original inputs with only the report's own source entry removed. For publication, also omit the exact selected draft's canonical `draft.json` and approved candidate journals. Kepler derives those paths from the approved candidate, verifies the metadata, bytes, complete phase history, and expected state, and still retains them in the operation's full input inventory. It does not omit another draft, unknown files, or caller-named exclusions. The publication path must independently recompile that draft and check authority, material, and continuation before accepting reconciliation. This avoids a hash cycle between the report and the compiler output that binds it.

The report's own bytes remain bound separately: reset and migration include the report source and hash in `source_inventory`; publication includes the exact report reference and hash in `required_material.evidence`. Publication also binds each report material hash in that evidence inventory. The report must not include its own digest in its original inventory. Keep the report and every material readable in the mission snapshot through apply and retry; do not retire them to the operation archive or move them to an unreferenced path.

Use the exported helpers in `packages/cli/src/history/reconciliation.ts` when preparing or reading evidence:

```ts
createHistoryReconciliationEvidenceReader(access, recordHome, snapshot)
```

It returns a `HistoryReconciliationEvidenceReader`, which accepts one `snapshot:<source_id>` reference and returns its reference, computed content version, and reread bytes. `historyLeadReconciliationSnapshotReference(sourceId)` constructs the portable reference. `serializeHistoryLeadReconciliationReport` and `parseHistoryLeadReconciliationReport` enforce the versioned report format.

## Operation boundary

`createNodeHistoryReconciliation(access)` returns the verifier accepted by `HistoryResetRuntime["verifyScope"]`. Preview rereads a fresh snapshot and performs no writes. Apply consumes the caller's snapshot under the caller-owned live history fence. On retry, it recognizes only exact outputs derivable from the retained operation intent; it accepts no caller-provided exclusion list. The verifier does not acquire that fence or perform worker controls. A new-startup `create` manifest has no retained reconciliation input and is rejected by this adapter; healthy migration and reset/publication use the report contract above.

The lead must copy required evidence into a mission-local retained file before approval. A registered origin that is absent may be treated as a known loss only when the reset manifest declares its exact missing mission source; Kepler does not inspect that absent origin. The report's effect statements there remain lead-attested. Unreadable or unsafe origins still block verification. Do not include credentials or unrelated host files. If a required external fact cannot be retained for attestation under this contract, keep it unresolved and do not proceed.
