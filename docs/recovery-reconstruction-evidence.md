# Reconstruction authority, material, and continuation

This document describes the implementation contract in the current source. It does not declare a released migration guide or approve a live mission operation.

Reconstruction does not make missing approvals or passed checks true. The lead must retain the actual requester decision and check output used to support each proposed correction. Kepler validates their bytes, scope, exact action binding, normal owner schemas, and candidate workflow state. It does not authenticate requester names, query worker backends, or run checks while reading their evidence.

## Material references

The production reader accepts these forms:

| Form | Source |
| --- | --- |
| `snapshot:<source-id>` | One exact readable source in the current mission snapshot. |
| `local-archive:<archive-id>/source/<source-id-sha256>.bin` | A source from an independently verified local mission archive. |
| `checkpoint:<encoded-repository-id>/<commit>/<encoded-relative-path>` | Actual Git blob bytes in the repository identified by validated mission facts and local workspace attachments. |

Use `encodeURIComponent` for each encoded field. A commit must contain exactly 40 or 64 lowercase hexadecimal characters. Paths must be safe relative paths. The checkpoint reader requires candidate history; it does not resolve arbitrary repositories from an authority callback. Unknown schemes, aliases, traversal, and unrelated host paths are rejected.

`HistoryMaterial.content_version` binds the actual SHA-256 of the resolved bytes. A hash without readable bytes is not evidence. The reader preserves binary Git blobs. Artifact checks use the normal artifact parser and ownership contract. Checkpoint checks use the actual prepared repository and compare committed artifact bytes with their retained bindings.

A candidate cannot omit material referenced by its normal facts. Include bound artifacts and repository or Integration checkpoints in the required set. A task-graph binding also requires the actual canonical graph bytes and the checked authored plan. Kepler uses the normal graph owner to verify graph identity, task definitions, and collisions with execution identities.

## Exact original request

Amendment B in the [accepted recovery amendments](specs/v3/approvals/2026-11-14-history-recovery-amendments.md#amendment-b-preserve-original-request-text) requires every candidate `construction.mission-created.data.request` value to equal the exact original string. Comparison is direct string equality: no trimming, case conversion, whitespace or newline normalization, or Unicode normalization. The reset's `request_reference` is an opaque identity, not request content. Candidate identity validation checks the mission, record-home repository, workflow, and known unit set without inferring request text from that reference; exact text proof belongs to compiler material verification. Initial-selection binding keeps its existing reference checks.

During compiler material verification, Kepler examines only exact indexed source files under the selected mission's supported construction-journal paths in the verified archive. It validates each possible `construction.mission-created` fact with the current Construction owner and checks its mission ID, record-home repository, and workflow against the selected reset. It scans raw journal lines independently of an old projection, cause closure, or whole-file health, so one valid bound creation can establish the text before a damaged tail. Every valid same-mission creation remains in the occurrence set even when its request text no longer matches a literal `request_reference`; that record is a conflict, not an unrelated source discarded because its text changed. A raw source establishes the original only when at least one validated creation matches the existing request binding through its event reference, context reference, or actual recorded request value, and all valid same-mission creation occurrences agree. This check requires the actual owner-valid source record. The reference string alone never establishes request content when that record is unavailable. Unsupported paths, malformed lines, unrelated missions, and unbound aliases do not establish text. Conflicting values are never selected by order or timestamp.

When one exact value is established and every candidate creation preserves it, no assertion is needed. Missing originals, conflicting original values, or a candidate that would correct a conflicting recorded request require the strict `kepler.history-original-request` version-1 document defined by Amendment B. Its exact bytes must occur once in `required_material.evidence` with the matching SHA-256. The verifier checks its full mission binding, reset and generation, requester, asserted string, source-material hashes, and exact coverage of each conflicting source identity, content hash, byte range, and event ID. Occurrence coverage is independent of carrier spelling: Kepler resolves each declared reference through the existing material reader and proves the indexed source identity, path, complete hash and bytes, byte range, and event ID before accepting it. The verified local-archive reference and equivalent `snapshot:<source-id>` or exact checkpoint references are supported only when they resolve to that same source. A checkpoint repository ID identifies its actual prepared repository, not the physical worktree origin ID in the archive index. Its committed blob must supply the indexed source's exact path and complete bytes; the occurrence still binds the archive's source ID, hash, range, and event ID. Conflicting source bytes remain in the archive and each occurrence needs an explicit non-retain disposition.

The assertion keeps Amendment B's exact fields; it does not add a third evidence schema. `decision_reference` must equal exactly one unique `reference` in `source_material`, and Kepler reads that material through the existing material reader and verifies its declared hash. Its complete bytes must equal this canonical UTF-8 statement generated from the assertion fields:

```text
I confirm that this is the exact original request and that the actual work request is unchanged.
Requester: <canonical JSON string of assertion.requester>
Mission: <assertion.mission_binding.mission_id>
Reset: <assertion.reset_event_id>
Generation: <assertion.generation_id>
Original request: <canonical JSON string of assertion.original_request>
```

Each line, including the final line, ends with one LF. The bytes have no BOM, CRLF, normalization, or extra text. Kepler uses its existing canonical JSON string serialization for the requester and original request. Generic action approval, clean-restart approval, wrong scope, or a hash without these exact bytes does not satisfy the check. Additional `source_material` entries retain their existing exact-reference and hash checks. The statement is requester-supplied source material, not authentication: a name, statement, or hash proves neither the requester's identity nor historical truth.

The check runs in `ReconstructionEvidence.material`, which the compiler invokes before accepting a candidate. `HistoryDrafts.verify` independently recompiles the retained plan and candidate and invokes the same material check before publication. The rebuilt-history gateway validates the approved published prefix, expected state, and immutable mission/unit identity; it does not infer request text from `request_reference`, reread old archives, or repeat the historical requester assertion. The result remains the existing transient material-verification marker. No extra receipt is created, and ordinary selected-history reads and verified joins do not acquire an old-archive dependency.

## Requester authority

An action with `authority.decision_reference` must resolve to a strict JSON document:

```json
{
  "format": "kepler.history-action-authority",
  "version": 1,
  "mission_id": "<mission UUIDv4>",
  "requester": "<requester attribution>",
  "decision_reference": "<this material reference>",
  "decision": "approved",
  "subject": {
    "kind": "action",
    "input_hash": "sha256:<exact action input digest>"
  },
  "source_material": [
    {
      "reference": "<retained requester decision source>",
      "content_version": "sha256:<source bytes digest>"
    }
  ]
}
```

The source material must contain the actual decision, not a fabricated receipt. Bind the authority document's reference and content hash in `required_material.evidence`. Kepler requires matching mission, requester, decision reference, and exact action input. The reconstruction manifest approval remains separate from each artifact approval or external operation.

Use `historyReconstructionActionHash(action)` to compute the action digest. It includes the complete action, but represents `proof` by its reference without that proof document's own digest. This removes a self-hash cycle; the actual proof bytes remain bound separately by the action and required evidence.

For the compiler's clean-restart bootstrap, use `subject.kind: "clean-restart"`. Its input digest is SHA-256 of canonical JSON for the exact confirmed `clean_restart` context. This authority covers only the compiler's mission, prepared-workspace, and known-unit bootstrap facts.

## Completed and checked facts

A generated completed or checked fact requires a strict retained proof document:

```json
{
  "format": "kepler.history-fact-proof",
  "version": 1,
  "mission_id": "<mission UUIDv4>",
  "action_input_hash": "sha256:<exact action input digest>",
  "source_fact": {
    "reference": "<retained normal owner event>",
    "content_version": "sha256:<event bytes digest>"
  },
  "supporting_outputs": [
    {
      "reference": "<actual retained check or completion output>",
      "content_version": "sha256:<output bytes digest>"
    }
  ]
}
```

The source fact must be one supported Construction event. Its type, event version, and data must match the proposed fact. Only explicit schema-checked `data_bindings` can remap event references. Kepler reads every supporting output and requires complete output-reference coverage for an evidence record. A summary, a `checked: true` field, or a status without retained output does not satisfy this contract.

The responsible lead must establish that those records and outputs describe work that occurred. These records are provider-neutral evidence contracts, not proof that Kepler contacted an agent controller or reran a command. Unknown evidence remains a blocker.

## Concrete continuation

`continuation.operation` uses one of these exact forms:

```text
recovery.inspect
construction.unit.show:<unit-id>
construction.stage.show:<unit-id>:<stage>
construction.stage.start:<unit-id>:<stage>
construction.stage.continue:<unit-id>:<stage>:<attempt-uuid>
construction.task.ready:<unit-id>:<task-uuid>
construction.task.admit:<unit-id>:<task-uuid>
construction.activity.show:<unit-id>:<task-uuid>:<activity>:<implementation-attempt-uuid>
```

Kepler checks the actual candidate history and expected state. It uses normal stage-start authority, real task-graph queries, and actual workspace checks where mutation readiness requires them. A continuation of a stage must name its exact running attempt. Paused, waiting, completed, and abandoned attempts retain their normal transition requirements.

Read-only continuation is available only when the plan explicitly selects it. Kepler does not substitute an inspection operation for an unsupported or blocked mutation. The unresolved-work and required-approval lists remain part of the manifest; successful continuation validation does not waive them or start work.
