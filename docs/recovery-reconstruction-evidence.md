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
